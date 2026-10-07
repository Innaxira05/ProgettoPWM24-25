const router = require('express').Router();
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Dish = require('../models/Dish');
const Restaurant = require('../models/Restaurant');
const HttpError = require('../utils/HttpError');
const validateId = require('../middleware/validateId');
const { autenticato, soloRuolo } = require('../middleware/auth');
const { round2 } = require('../utils/helpers');
const { stimaConsegna } = require('../utils/geo');

router.use(autenticato);
router.param('id', validateId);

/**
 * @openapi
 * /orders/stima-consegna:
 *   get:
 *     tags: [Ordini]
 *     summary: Stima distanza e costo di consegna (OpenStreetMap) prima di confermare l'ordine
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: ristorante, required: true, schema: { type: string } }
 *       - { in: query, name: indirizzo, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: "{ distanzaKm, costoConsegna }" }
 */
// GET /api/orders/stima-consegna?ristorante=&indirizzo=  (cliente)
// Usa Nominatim (geocoding) + OSRM (distanza stradale), poi applica la tariffa al km.
router.get('/stima-consegna', soloRuolo('cliente'), async (req, res) => {
  const { ristorante, indirizzo } = req.query;
  if (!mongoose.isValidObjectId(ristorante) || !indirizzo) throw new HttpError(400, 'Servono ristorante e indirizzo.');
  const r = await Restaurant.findById(ristorante);
  if (!r) throw new HttpError(404, 'Ristorante non trovato.');
  res.json(await stimaConsegna(r, indirizzo));
});

/**
 * @openapi
 * /orders:
 *   post:
 *     tags: [Ordini]
 *     summary: Crea un ordine (ritiro al ristorante o consegna a domicilio)
 *     security: [{ bearerAuth: [] }]
 *     requestBody: { required: true, content: { application/json: { schema: { $ref: '#/components/schemas/OrderInput' } } } }
 *     responses:
 *       201: { description: Ordine creato (stato "ordinato") }
 *       400: { description: Dati non validi }
 */
// POST /api/orders (cliente)
// - verifica che i piatti appartengano al ristorante scelto
// - copia nome/prezzo nelle righe (snapshot) e calcola i totali lato SERVER (mai fidarsi del client)
// - ritiro: stima il tempo di attesa dalla coda (ordini "ordinato"/"in_preparazione" del ristorante)
// - domicilio: calcola distanza e costo con OpenStreetMap
router.post('/', soloRuolo('cliente'), async (req, res) => {
  const { ristorante: ristId, piatti, modalita, indirizzoConsegna } = req.body;
  if (!mongoose.isValidObjectId(ristId)) throw new HttpError(400, 'Ristorante non valido.');
  if (!Array.isArray(piatti) || !piatti.length) throw new HttpError(400, 'Il carrello è vuoto.');
  if (!['ritiro', 'domicilio'].includes(modalita)) throw new HttpError(400, 'Modalità non valida (ritiro | domicilio).');

  const rist = await Restaurant.findById(ristId);
  if (!rist) throw new HttpError(404, 'Ristorante non trovato.');

  // Righe ordine
  const dishes = await Dish.find({ _id: { $in: piatti.map((p) => p.piatto) }, ristorante: rist._id });
  const mappa = new Map(dishes.map((d) => [String(d._id), d]));
  const righe = piatti.map((p) => {
    const d = mappa.get(String(p.piatto));
    const q = Number(p.quantita);
    if (!d) throw new HttpError(400, 'Uno dei piatti non appartiene a questo ristorante.');
    if (!Number.isInteger(q) || q < 1) throw new HttpError(400, 'Quantità non valida.');
    return { piatto: d._id, nome: d.nome, prezzoUnitario: d.prezzo, quantita: q };
  });
  const totalePiatti = round2(righe.reduce((s, r) => s + r.prezzoUnitario * r.quantita, 0));

  let costoConsegna = 0, distanzaKm, tempoAttesaMin;
  if (modalita === 'domicilio') {
    if (!indirizzoConsegna) throw new HttpError(400, 'Indirizzo di consegna obbligatorio.');
    ({ distanzaKm, costoConsegna } = await stimaConsegna(rist, indirizzoConsegna));
  } else {
    const inCoda = await Order.countDocuments({ ristorante: rist._id, stato: { $in: ['ordinato', 'in_preparazione'] } });
    tempoAttesaMin = (inCoda + 1) * Number(process.env.TEMPO_MEDIO_PREP_MIN || 5);
  }

  const ordine = await Order.create({
    cliente: req.utente.id, ristorante: rist._id, ristoranteNome: rist.nome, righe,
    totalePiatti, costoConsegna, totale: round2(totalePiatti + costoConsegna),
    modalita, indirizzoConsegna: modalita === 'domicilio' ? indirizzoConsegna : undefined,
    distanzaKm, tempoAttesaMin,
  });
  res.status(201).json(ordine);
});

/**
 * @openapi
 * /orders:
 *   get:
 *     tags: [Ordini]
 *     summary: Elenco ordini (cliente - i propri, storico; ristoratore - quelli del suo ristorante)
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: query, name: stato, schema: { type: string, enum: [ordinato, in_preparazione, in_consegna, consegnato] } }]
 *     responses:
 *       200: { description: Lista ordini, dal più recente }
 */
// GET /api/orders?stato=
// Cliente: acquisti presenti e passati. Ristoratore: coda e storico del proprio ristorante.
router.get('/', async (req, res) => {
  const filtro = {};
  if (req.utente.ruolo === 'cliente') {
    filtro.cliente = req.utente.id;
  } else {
    const rist = await Restaurant.findOne({ owner: req.utente.id });
    if (!rist) throw new HttpError(404, 'Ristorante non trovato.');
    filtro.ristorante = rist._id;
  }
  if (req.query.stato) filtro.stato = req.query.stato;
  res.json(await Order.find(filtro).sort('-createdAt'));
});

/**
 * @openapi
 * /orders/{id}:
 *   get:
 *     tags: [Ordini]
 *     summary: Dettaglio di un ordine
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Ordine }
 *       404: { description: Non trovato }
 */
// GET /api/orders/:id -> solo il cliente che l'ha fatto o il ristoratore del ristorante
router.get('/:id', async (req, res) => {
  const o = await Order.findById(req.params.id);
  if (!o) throw new HttpError(404, 'Ordine non trovato.');
  let autorizzato = String(o.cliente) === req.utente.id;
  if (!autorizzato && req.utente.ruolo === 'ristoratore') {
    const rist = await Restaurant.findOne({ owner: req.utente.id });
    autorizzato = rist && String(rist._id) === String(o.ristorante);
  }
  if (!autorizzato) throw new HttpError(404, 'Ordine non trovato.'); // 404 e non 403: non riveliamo che esiste
  res.json(o);
});

/**
 * @openapi
 * /orders/{id}/avanza:
 *   patch:
 *     tags: [Ordini]
 *     summary: Il ristoratore fa avanzare lo stato dell'ordine
 *     description: "ordinato → in_preparazione → (ritiro: consegnato | domicilio: in_consegna)"
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Ordine aggiornato }
 *       409: { description: Stato non avanzabile }
 */
// PATCH /api/orders/:id/avanza (ristoratore)
// Flusso della traccia. Ritiro in sede: quando e' pronto passa DIRETTAMENTE a "consegnato"
// (esce dalla coda). Domicilio: passa a "in_consegna" e poi sara' il cliente a confermare la ricezione.
router.patch('/:id/avanza', soloRuolo('ristoratore'), async (req, res) => {
  const rist = await Restaurant.findOne({ owner: req.utente.id });
  const o = rist && (await Order.findOne({ _id: req.params.id, ristorante: rist._id }));
  if (!o) throw new HttpError(404, 'Ordine non trovato.');

  if (o.stato === 'ordinato') o.stato = 'in_preparazione';
  else if (o.stato === 'in_preparazione') o.stato = o.modalita === 'ritiro' ? 'consegnato' : 'in_consegna';
  else throw new HttpError(409, `L'ordine è già "${o.stato}" e non può essere avanzato dal ristoratore.`);

  await o.save();
  res.json(o);
});

module.exports = router;

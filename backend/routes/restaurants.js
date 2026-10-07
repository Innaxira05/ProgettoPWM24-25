const router = require('express').Router();
const Restaurant = require('../models/Restaurant');
const Dish = require('../models/Dish');
const Order = require('../models/Order');
const HttpError = require('../utils/HttpError');
const validateId = require('../middleware/validateId');
const { autenticato, soloRuolo } = require('../middleware/auth');
const { contiene } = require('../utils/helpers');
const { geocodifica } = require('../utils/geo');

router.param('id', validateId);

/**
 * @openapi
 * /restaurants:
 *   get:
 *     tags: [Ristoranti]
 *     summary: Ricerca ristoranti per nome, luogo o piatto offerto
 *     parameters:
 *       - { in: query, name: nome, schema: { type: string } }
 *       - { in: query, name: luogo, schema: { type: string }, description: "cerca nell'indirizzo" }
 *       - { in: query, name: piatto, schema: { type: string }, description: "ristoranti che hanno questo piatto in menu" }
 *     responses:
 *       200: { description: Lista ristoranti }
 */
// GET /api/restaurants?nome=&luogo=&piatto=   (pubblica)
// Ricerche richieste dalla traccia: per luogo, per nome e per piatto.
router.get('/', async (req, res) => {
  const { nome, luogo, piatto } = req.query;
  const filtro = {};
  if (nome) filtro.nome = contiene(nome);
  if (luogo) filtro.indirizzo = contiene(luogo);
  if (piatto) {
    // ricerca ristorante per piatto: prima trovo i piatti di menu col nome richiesto, poi i loro ristoranti
    const ids = await Dish.distinct('ristorante', { ristorante: { $ne: null }, nome: contiene(piatto) });
    filtro._id = { $in: ids };
  }
  res.json(await Restaurant.find(filtro).select('-owner -piva').sort('nome'));
});

/**
 * @openapi
 * /restaurants/me:
 *   get:
 *     tags: [Ristoranti]
 *     summary: Il mio ristorante (solo ristoratore)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Ristorante }
 */
// GET /api/restaurants/me -> ristorante del ristoratore loggato (dichiarata PRIMA di /:id)
router.get('/me', autenticato, soloRuolo('ristoratore'), async (req, res) => {
  const r = await Restaurant.findOne({ owner: req.utente.id });
  if (!r) throw new HttpError(404, 'Ristorante non trovato.');
  res.json(r);
});

/**
 * @openapi
 * /restaurants/me:
 *   put:
 *     tags: [Ristoranti]
 *     summary: Modifica i dati del mio ristorante
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Ristorante aggiornato }
 */
// PUT /api/restaurants/me -> modifica nome, telefono, P.IVA, indirizzo (ricalcola le coordinate)
router.put('/me', autenticato, soloRuolo('ristoratore'), async (req, res) => {
  const r = await Restaurant.findOne({ owner: req.utente.id });
  if (!r) throw new HttpError(404, 'Ristorante non trovato.');
  ['nome', 'telefono', 'piva'].forEach((c) => { if (req.body[c] !== undefined) r[c] = req.body[c]; });
  if (req.body.indirizzo && req.body.indirizzo !== r.indirizzo) {
    r.indirizzo = req.body.indirizzo;
    try { r.coordinate = (await geocodifica(r.indirizzo)) || undefined; } catch { r.coordinate = undefined; }
  }
  await r.save();
  res.json(r);
});

/**
 * @openapi
 * /restaurants/me/stats:
 *   get:
 *     tags: [Ristoranti]
 *     summary: Statistiche del mio ristorante (ordini per stato, incasso, piatti più venduti)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Statistiche }
 */
// GET /api/restaurants/me/stats
// Statistiche per ristorante (richieste dal progetto Full) calcolate con aggregation pipeline MongoDB.
router.get('/me/stats', autenticato, soloRuolo('ristoratore'), async (req, res) => {
  const r = await Restaurant.findOne({ owner: req.utente.id });
  if (!r) throw new HttpError(404, 'Ristorante non trovato.');
  const match = { ristorante: r._id };

  const [perStato, incasso, topPiatti] = await Promise.all([
    // numero ordini raggruppati per stato
    Order.aggregate([{ $match: match }, { $group: { _id: '$stato', ordini: { $sum: 1 } } }]),
    // incasso e numero degli ordini conclusi
    Order.aggregate([
      { $match: { ...match, stato: 'consegnato' } },
      { $group: { _id: null, incasso: { $sum: '$totale' }, ordini: { $sum: 1 } } },
    ]),
    // top 5 piatti per quantita' venduta ($unwind "srotola" l'array righe)
    Order.aggregate([
      { $match: match },
      { $unwind: '$righe' },
      { $group: { _id: '$righe.nome', quantita: { $sum: '$righe.quantita' } } },
      { $sort: { quantita: -1 } },
      { $limit: 5 },
    ]),
  ]);
  res.json({
    ordiniPerStato: perStato.map((s) => ({ stato: s._id, ordini: s.ordini })),
    incassoTotale: incasso[0]?.incasso ?? 0,
    ordiniConclusi: incasso[0]?.ordini ?? 0,
    piattiPiuVenduti: topPiatti.map((p) => ({ nome: p._id, quantita: p.quantita })),
  });
});

/**
 * @openapi
 * /restaurants/{id}:
 *   get:
 *     tags: [Ristoranti]
 *     summary: Dettaglio ristorante con il suo menu
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: "{ ...ristorante, menu: [piatti] }" }
 *       404: { description: Non trovato }
 */
// GET /api/restaurants/:id (pubblica) -> info ristorante + menu
router.get('/:id', async (req, res) => {
  const r = await Restaurant.findById(req.params.id).select('-owner -piva');
  if (!r) throw new HttpError(404, 'Ristorante non trovato.');
  const menu = await Dish.find({ ristorante: r._id }).sort('tipologia nome');
  res.json({ ...r.toObject(), menu });
});

module.exports = router;

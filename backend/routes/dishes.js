const router = require('express').Router();
const Dish = require('../models/Dish');
const Restaurant = require('../models/Restaurant');
const HttpError = require('../utils/HttpError');
const validateId = require('../middleware/validateId');
const { autenticato, soloRuolo } = require('../middleware/auth');
const { contiene } = require('../utils/helpers');
const { derivaAllergeni } = require('../utils/allergens');

router.param('id', validateId);

/**
 * Costruisce il filtro Mongo a partire dai parametri di ricerca (query string).
 * Ricerche previste: nome, tipologia, prezzo (min/max), ingrediente, senza allergeni.
 * @param {object} q req.query
 * @param {object} base condizioni fisse (catalogo oppure menu)
 */
function costruisciFiltro(q, base) {
  const f = { ...base };
  if (q.nome) f.nome = contiene(q.nome);
  if (q.tipologia) f.tipologia = contiene(q.tipologia);
  if (q.ingrediente) f.ingredienti = contiene(q.ingrediente); // match su un elemento dell'array
  if (q.prezzoMin || q.prezzoMax) {
    f.prezzo = {};
    if (q.prezzoMin) f.prezzo.$gte = Number(q.prezzoMin);
    if (q.prezzoMax) f.prezzo.$lte = Number(q.prezzoMax);
  }
  // ?senzaAllergeni=glutine,latte -> esclude i piatti che contengono ALMENO uno di questi allergeni
  if (q.senzaAllergeni) f.allergeni = { $nin: String(q.senzaAllergeni).split(',').map((s) => s.trim().toLowerCase()) };
  return f;
}

/** Paginazione semplice: ?page=1&limit=20 (max 100). */
function paginazione(q) {
  const limit = Math.min(Number(q.limit) || 20, 100);
  const page = Math.max(Number(q.page) || 1, 1);
  return { limit, skip: (page - 1) * limit };
}

/**
 * @openapi
 * /dishes/catalog:
 *   get:
 *     tags: [Piatti]
 *     summary: Catalogo comune di tutti i piatti (da JSON) - da cui il ristoratore sceglie
 *     parameters:
 *       - { in: query, name: nome, schema: { type: string } }
 *       - { in: query, name: tipologia, schema: { type: string } }
 *       - { in: query, name: ingrediente, schema: { type: string } }
 *       - { in: query, name: page, schema: { type: integer } }
 *       - { in: query, name: limit, schema: { type: integer } }
 *     responses:
 *       200: { description: Lista piatti del catalogo }
 */
// GET /api/dishes/catalog (pubblica) -> ricerca nel catalogo comune (ristorante = null)
router.get('/catalog', async (req, res) => {
  const { limit, skip } = paginazione(req.query);
  const filtro = costruisciFiltro(req.query, { ristorante: null });
  const [dati, totale] = await Promise.all([
    Dish.find(filtro).sort('nome').skip(skip).limit(limit),
    Dish.countDocuments(filtro),
  ]);
  res.json({ totale, dati });
});

/**
 * @openapi
 * /dishes:
 *   get:
 *     tags: [Piatti]
 *     summary: Ricerca piatti in vendita nei menu dei ristoranti
 *     parameters:
 *       - { in: query, name: ristorante, schema: { type: string } }
 *       - { in: query, name: nome, schema: { type: string } }
 *       - { in: query, name: tipologia, schema: { type: string } }
 *       - { in: query, name: prezzoMin, schema: { type: number } }
 *       - { in: query, name: prezzoMax, schema: { type: number } }
 *       - { in: query, name: ingrediente, schema: { type: string } }
 *       - { in: query, name: senzaAllergeni, schema: { type: string }, description: "lista separata da virgole, es. glutine,latte" }
 *     responses:
 *       200: { description: Lista piatti }
 */
// GET /api/dishes (pubblica) -> piatti presenti nei menu (ristorante != null)
router.get('/', async (req, res) => {
  const { limit, skip } = paginazione(req.query);
  const base = { ristorante: req.query.ristorante || { $ne: null } };
  const filtro = costruisciFiltro(req.query, base);
  const [dati, totale] = await Promise.all([
    Dish.find(filtro).populate('ristorante', 'nome indirizzo').sort('nome').skip(skip).limit(limit),
    Dish.countDocuments(filtro),
  ]);
  res.json({ totale, dati });
});

/**
 * @openapi
 * /dishes/{id}:
 *   get:
 *     tags: [Piatti]
 *     summary: Dettaglio di un piatto (ingredienti, foto, prezzo...)
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Piatto }
 *       404: { description: Non trovato }
 */
// GET /api/dishes/:id (pubblica)
router.get('/:id', async (req, res) => {
  const d = await Dish.findById(req.params.id).populate('ristorante', 'nome indirizzo');
  if (!d) throw new HttpError(404, 'Piatto non trovato.');
  res.json(d);
});

/**
 * @openapi
 * /dishes:
 *   post:
 *     tags: [Piatti]
 *     summary: Aggiunge un piatto al menu (dal catalogo con catalogId, oppure piatto personalizzato)
 *     security: [{ bearerAuth: [] }]
 *     requestBody: { required: true, content: { application/json: { schema: { $ref: '#/components/schemas/DishInput' } } } }
 *     responses:
 *       201: { description: Piatto aggiunto al menu }
 *       409: { description: Piatto già presente nel menu }
 */
// POST /api/dishes (ristoratore)
// Due modalita':
//  1) { catalogId, prezzo } -> copia un piatto del catalogo comune nel proprio menu
//  2) { nome, tipologia, ingredienti, immagine, prezzo } -> piatto scelto/inventato dal ristoratore
router.post('/', autenticato, soloRuolo('ristoratore'), async (req, res) => {
  const rist = await Restaurant.findOne({ owner: req.utente.id });
  if (!rist) throw new HttpError(404, 'Ristorante non trovato.');
  const { catalogId, prezzo } = req.body;
  if (prezzo === undefined || Number(prezzo) < 0) throw new HttpError(400, 'Prezzo obbligatorio e non negativo.');

  let dati;
  if (catalogId) {
    const base = await Dish.findOne({ _id: catalogId, ristorante: null });
    if (!base) throw new HttpError(404, 'Piatto del catalogo non trovato.');
    dati = {
      sourceId: base.sourceId, nome: base.nome, tipologia: base.tipologia, area: base.area,
      ingredienti: base.ingredienti, allergeni: base.allergeni, immagine: base.immagine, istruzioni: base.istruzioni,
      ...req.body.override, // il ristoratore puo' sovrascrivere qualche campo (es. nome)
    };
  } else {
    const { nome, tipologia, ingredienti = [], immagine, istruzioni } = req.body;
    if (!nome || !tipologia) throw new HttpError(400, 'Nome e tipologia sono obbligatori.');
    dati = { nome, tipologia, ingredienti, immagine, istruzioni, allergeni: req.body.allergeni || derivaAllergeni(ingredienti) };
  }
  const creato = await Dish.create({ ...dati, prezzo: Number(prezzo), ristorante: rist._id });
  res.status(201).json(creato);
});

/**
 * @openapi
 * /dishes/{id}:
 *   put:
 *     tags: [Piatti]
 *     summary: Modifica un piatto del proprio menu
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Piatto aggiornato }
 *       404: { description: Piatto non trovato nel tuo menu }
 */
// PUT /api/dishes/:id (ristoratore) -> solo i piatti del PROPRIO menu
router.put('/:id', autenticato, soloRuolo('ristoratore'), async (req, res) => {
  const rist = await Restaurant.findOne({ owner: req.utente.id });
  const d = rist && (await Dish.findOne({ _id: req.params.id, ristorante: rist._id }));
  if (!d) throw new HttpError(404, 'Piatto non trovato nel tuo menu.');
  ['nome', 'tipologia', 'ingredienti', 'allergeni', 'immagine', 'istruzioni', 'prezzo'].forEach((c) => {
    if (req.body[c] !== undefined) d[c] = req.body[c];
  });
  await d.save();
  res.json(d);
});

/**
 * @openapi
 * /dishes/{id}:
 *   delete:
 *     tags: [Piatti]
 *     summary: Rimuove un piatto dal proprio menu
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Piatto rimosso }
 *       404: { description: Piatto non trovato nel tuo menu }
 */
// DELETE /api/dishes/:id (ristoratore) -> gli ordini passati non cambiano (righe con snapshot)
router.delete('/:id', autenticato, soloRuolo('ristoratore'), async (req, res) => {
  const rist = await Restaurant.findOne({ owner: req.utente.id });
  const d = rist && (await Dish.findOneAndDelete({ _id: req.params.id, ristorante: rist._id }));
  if (!d) throw new HttpError(404, 'Piatto non trovato nel tuo menu.');
  res.json({ message: 'Piatto rimosso dal menu.' });
});

module.exports = router;

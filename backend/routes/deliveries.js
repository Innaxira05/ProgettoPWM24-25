const router = require('express').Router();
const Order = require('../models/Order');
const Restaurant = require('../models/Restaurant');
const HttpError = require('../utils/HttpError');
const validateId = require('../middleware/validateId');
const { autenticato, soloRuolo } = require('../middleware/auth');

router.use(autenticato);
router.param('id', validateId);

/**
 * @openapi
 * /deliveries:
 *   get:
 *     tags: [Consegne]
 *     summary: Consegne a domicilio (cliente - le proprie; ristoratore - quelle del suo ristorante)
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: query, name: stato, schema: { type: string } }]
 *     responses:
 *       200: { description: Lista consegne }
 */
// GET /api/deliveries?stato=
// Tracciamento consegne: ordini con modalita' "domicilio" (filtrabili per stato, es. in_consegna).
router.get('/', async (req, res) => {
  const filtro = { modalita: 'domicilio' };
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
 * /deliveries/{id}/ricevuto:
 *   patch:
 *     tags: [Consegne]
 *     summary: Il cliente segnala di aver ricevuto l'ordine (in_consegna → consegnato)
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Ordine consegnato }
 *       409: { description: L'ordine non è in consegna }
 */
// PATCH /api/deliveries/:id/ricevuto (cliente)
// Ultimo scenario della traccia: e' il cliente che conferma la ricezione.
router.patch('/:id/ricevuto', soloRuolo('cliente'), async (req, res) => {
  const o = await Order.findOne({ _id: req.params.id, cliente: req.utente.id, modalita: 'domicilio' });
  if (!o) throw new HttpError(404, 'Consegna non trovata.');
  if (o.stato !== 'in_consegna') throw new HttpError(409, `L'ordine è "${o.stato}": non è ancora in consegna.`);
  o.stato = 'consegnato';
  await o.save();
  res.json(o);
});

module.exports = router;

const router = require('express').Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Restaurant = require('../models/Restaurant');
const Dish = require('../models/Dish');
const Order = require('../models/Order');
const HttpError = require('../utils/HttpError');
const { autenticato, firmaToken } = require('../middleware/auth');
const { geocodifica } = require('../utils/geo');

router.use(autenticato); // tutte le rotte /users/* richiedono il login

/**
 * Costruisce l'oggetto profilo che il frontend (profilo.html) si aspetta:
 * dati utente + (se ristoratore) nomeRistorante, indirizzoRistorante, piva.
 */
async function costruisciProfilo(userId) {
  const user = await User.findById(userId);
  if (!user) return null;
  const out = user.toObject();
  delete out.__v;
  if (user.ruolo === 'ristoratore') {
    const r = await Restaurant.findOne({ owner: user._id });
    if (r) Object.assign(out, { nomeRistorante: r.nome, indirizzoRistorante: r.indirizzo, piva: r.piva, ristoranteId: r._id });
  }
  return out;
}

/**
 * @openapi
 * /users/me:
 *   get:
 *     tags: [Utenti]
 *     summary: Dati del profilo dell'utente loggato
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Profilo }
 *       401: { description: Non autenticato }
 */
// GET /api/users/me -> profilo completo dell'utente corrente
router.get('/me', async (req, res) => {
  const profilo = await costruisciProfilo(req.utente.id);
  if (!profilo) throw new HttpError(404, 'Utente non trovato.');
  res.json(profilo);
});

/**
 * @openapi
 * /users/me:
 *   put:
 *     tags: [Utenti]
 *     summary: Modifica i dati del profilo (e opzionalmente la password)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Profilo aggiornato (con nuovo token) }
 *       400: { description: Dati non validi }
 *       409: { description: Username o email già in uso }
 */
// PUT /api/users/me
// Aggiorna solo i campi inviati. Per cambiare password servono passwordAttuale + passwordNuova.
// Per i ristoratori aggiorna anche il documento Restaurant (e ricalcola le coordinate se cambia l'indirizzo).
router.put('/me', async (req, res) => {
  const user = await User.findById(req.utente.id).select('+passwordHash');
  if (!user) throw new HttpError(404, 'Utente non trovato.');
  const b = req.body;

  // Campi modificabili da tutti
  ['username', 'email', 'telefono', 'nome', 'cognome'].forEach((c) => { if (b[c] !== undefined) user[c] = b[c]; });
  // Campi solo cliente
  if (user.ruolo === 'cliente') {
    ['indirizzo', 'pagamento', 'preferenze', 'allergie'].forEach((c) => { if (b[c] !== undefined) user[c] = b[c]; });
  }

  // Cambio password (opzionale)
  if (b.passwordNuova) {
    if (!b.passwordAttuale || !(await bcrypt.compare(b.passwordAttuale, user.passwordHash))) {
      throw new HttpError(400, 'La password attuale non è corretta.');
    }
    if (b.passwordNuova.length < 8) throw new HttpError(400, 'La nuova password deve avere almeno 8 caratteri.');
    user.passwordHash = await bcrypt.hash(b.passwordNuova, 10);
  }
  await user.save();

  // Dati del ristorante
  if (user.ruolo === 'ristoratore') {
    const r = await Restaurant.findOne({ owner: user._id });
    if (r) {
      if (b.nomeRistorante !== undefined) r.nome = b.nomeRistorante;
      if (b.piva !== undefined) r.piva = b.piva;
      if (b.telefono !== undefined) r.telefono = b.telefono;
      if (b.indirizzoRistorante !== undefined && b.indirizzoRistorante !== r.indirizzo) {
        r.indirizzo = b.indirizzoRistorante;
        try { r.coordinate = (await geocodifica(r.indirizzo)) || undefined; } catch { r.coordinate = undefined; }
      }
      await r.save();
    }
  }

  // Nuovo token: se lo username e' cambiato, quello vecchio conterrebbe dati obsoleti
  res.json({ ...(await costruisciProfilo(user._id)), token: firmaToken(user) });
});

/**
 * @openapi
 * /users/me:
 *   delete:
 *     tags: [Utenti]
 *     summary: Elimina l'account (richiede la password) e i dati collegati
 *     security: [{ bearerAuth: [] }]
 *     requestBody: { required: true, content: { application/json: { schema: { type: object, properties: { password: { type: string } } } } } }
 *     responses:
 *       200: { description: Account eliminato }
 *       400: { description: Password errata }
 */
// DELETE /api/users/me
// Cancellazione a cascata: cliente -> i suoi ordini; ristoratore -> ristorante e relativo menu.
// (gli ordini ricevuti da un ristorante eliminato restano nello storico dei clienti grazie agli snapshot)
router.delete('/me', async (req, res) => {
  const user = await User.findById(req.utente.id).select('+passwordHash');
  if (!user) throw new HttpError(404, 'Utente non trovato.');
  if (!req.body.password || !(await bcrypt.compare(req.body.password, user.passwordHash))) {
    throw new HttpError(400, 'Password non corretta.');
  }

  if (user.ruolo === 'cliente') {
    await Order.deleteMany({ cliente: user._id });
  } else {
    const r = await Restaurant.findOne({ owner: user._id });
    if (r) {
      await Dish.deleteMany({ ristorante: r._id });
      await r.deleteOne();
    }
  }
  await user.deleteOne();
  res.json({ message: 'Account eliminato.' });
});

module.exports = router;

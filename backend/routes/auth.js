const router = require('express').Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Restaurant = require('../models/Restaurant');
const HttpError = require('../utils/HttpError');
const { firmaToken } = require('../middleware/auth');
const { normalizzaRuolo } = require('../utils/helpers');
const { geocodifica } = require('../utils/geo');

/**
 * @openapi
 * /auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Registra un nuovo utente (cliente o ristoratore)
 *     requestBody: { required: true, content: { application/json: { schema: { $ref: '#/components/schemas/Register' } } } }
 *     responses:
 *       201: { description: Utente creato }
 *       400: { description: Dati non validi }
 *       409: { description: Username o email già in uso }
 */
// POST /api/auth/register
// Crea l'utente con password hashata (bcrypt). Se il ruolo e' "ristoratore" crea anche
// il documento Restaurant collegato (nome, P.IVA, indirizzo, telefono).
router.post('/register', async (req, res) => {
  const { username, email, password } = req.body;
  const ruolo = normalizzaRuolo(req.body.ruolo || req.body.role);

  if (!username || !email || !password) throw new HttpError(400, 'Username, email e password sono obbligatori.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Email non valida.');
  if (password.length < 8) throw new HttpError(400, 'La password deve avere almeno 8 caratteri.');
  if (!ruolo) throw new HttpError(400, 'Ruolo non valido: usare cliente o ristoratore.');

  // Il frontend (login.html) usa i nomi inglesi: accettiamo entrambe le varianti
  const datiRist = {
    nome: req.body.nomeRistorante || req.body.restaurantName,
    piva: req.body.piva,
    indirizzo: req.body.indirizzoRistorante || req.body.address,
    telefono: req.body.telefono || req.body.phone,
  };
  if (ruolo === 'ristoratore' && (!datiRist.nome || !datiRist.piva || !datiRist.indirizzo)) {
    throw new HttpError(400, 'Per il ristoratore servono nome ristorante, partita IVA e indirizzo.');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({ username, email, passwordHash, ruolo, telefono: datiRist.telefono });

  if (ruolo === 'ristoratore') {
    try {
      let coordinate;
      try { coordinate = (await geocodifica(datiRist.indirizzo)) || undefined; } catch { /* OSM non raggiungibile: lo faremo piu' tardi */ }
      await Restaurant.create({ owner: user._id, ...datiRist, coordinate });
    } catch (e) {
      await User.deleteOne({ _id: user._id }); // rollback manuale: niente utente "orfano"
      throw e;
    }
  }
  res.status(201).json({ message: 'Account creato.', id: user._id });
});

/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login con username (o email) e password, restituisce un JWT
 *     requestBody: { required: true, content: { application/json: { schema: { $ref: '#/components/schemas/Login' } } } }
 *     responses:
 *       200: { description: "Login riuscito: { token, user }" }
 *       401: { description: Credenziali non valide }
 */
// POST /api/auth/login
// Verifica le credenziali e restituisce il token JWT che il frontend salva in localStorage ("ff_token").
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) throw new HttpError(400, 'Username e password obbligatori.');

  // passwordHash ha select:false, quindi va richiesto esplicitamente
  const user = await User.findOne({ $or: [{ username }, { email: String(username).toLowerCase() }] }).select('+passwordHash');
  const ok = user && (await bcrypt.compare(password, user.passwordHash));
  if (!ok) throw new HttpError(401, 'Credenziali non valide.'); // messaggio unico: non rivela se l'utente esiste

  res.json({ token: firmaToken(user), user: { id: user._id, username: user.username, ruolo: user.ruolo } });
});

module.exports = router;

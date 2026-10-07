const jwt = require('jsonwebtoken');
const HttpError = require('../utils/HttpError');

/**
 * Middleware di autenticazione.
 * Legge l'header "Authorization: Bearer <token>", verifica la firma del JWT
 * e mette l'utente in req.utente = { id, username, ruolo }.
 */
function autenticato(req, res, next) {
  const [tipo, token] = (req.headers.authorization || '').split(' ');
  if (tipo !== 'Bearer' || !token) return next(new HttpError(401, 'Token mancante'));
  try {
    const p = jwt.verify(token, process.env.JWT_SECRET);
    req.utente = { id: p.id, username: p.username, ruolo: p.ruolo };
    next();
  } catch {
    next(new HttpError(401, 'Token non valido o scaduto'));
  }
}

/**
 * Middleware di autorizzazione per ruolo.
 * Uso: router.post('/', autenticato, soloRuolo('ristoratore'), handler)
 */
const soloRuolo = (...ruoli) => (req, res, next) =>
  ruoli.includes(req.utente.ruolo)
    ? next()
    : next(new HttpError(403, 'Operazione non consentita per questo ruolo'));

/** Crea un JWT con i dati che il frontend decodifica (id, username, ruolo). */
function firmaToken(user) {
  return jwt.sign(
    { id: String(user._id), username: user.username, ruolo: user.ruolo },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '2h' }
  );
}

module.exports = { autenticato, soloRuolo, firmaToken };

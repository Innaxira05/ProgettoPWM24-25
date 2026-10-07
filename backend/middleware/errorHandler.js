/**
 * Gestore globale degli errori (ultimo middleware).
 * Traduce gli errori in risposte JSON { message } con lo status corretto.
 */
module.exports = function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  if (err.status) return res.status(err.status).json({ message: err.message }); // HttpError
  if (err.code === 11000) {                                                     // duplicato (unique)
    const campo = Object.keys(err.keyPattern || {})[0] || 'valore';
    return res.status(409).json({ message: `Esiste già un record con questo ${campo}.` });
  }
  if (err.name === 'ValidationError') {                                         // validazione Mongoose
    return res.status(400).json({ message: Object.values(err.errors).map((e) => e.message).join(' ') });
  }
  if (err.name === 'CastError') return res.status(400).json({ message: 'Parametro non valido.' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ message: 'JSON non valido.' });

  console.error(err);
  res.status(500).json({ message: 'Errore interno del server.' });
};

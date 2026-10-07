/**
 * Errore con status HTTP: lanciandolo da una route, l'errorHandler
 * risponde al client con { message } e lo status indicato.
 */
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

module.exports = HttpError;

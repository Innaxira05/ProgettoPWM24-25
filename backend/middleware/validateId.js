const mongoose = require('mongoose');
const HttpError = require('../utils/HttpError');

/**
 * Callback per router.param('id', validateId):
 * risponde 400 se :id non e' un ObjectId valido (evita CastError di Mongoose).
 */
module.exports = (req, res, next, id) =>
  mongoose.isValidObjectId(id) ? next() : next(new HttpError(400, 'ID non valido'));

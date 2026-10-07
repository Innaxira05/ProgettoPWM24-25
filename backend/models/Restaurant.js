const { Schema, model } = require('mongoose');

/**
 * Ristorante: un documento per ogni utente con ruolo "ristoratore" (relazione 1-1 con owner).
 * Il menu non e' annidato qui: sono i Dish con campo "ristorante" = _id di questo documento.
 */
const restaurantSchema = new Schema(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    nome: { type: String, required: true, trim: true },
    piva: { type: String, required: true, match: /^\d{11}$/ }, // Partita IVA italiana: 11 cifre
    indirizzo: { type: String, required: true, trim: true },
    telefono: { type: String, trim: true },
    // Coordinate calcolate con Nominatim (OpenStreetMap), servono per distanza/costo consegna
    coordinate: { lat: Number, lng: Number },
  },
  { timestamps: true }
);

module.exports = model('Restaurant', restaurantSchema);

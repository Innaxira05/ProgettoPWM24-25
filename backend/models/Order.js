const { Schema, model } = require('mongoose');

/** Stati dell'ordine, nell'ordine del flusso previsto dalla traccia. */
const STATI = ['ordinato', 'in_preparazione', 'in_consegna', 'consegnato'];

/**
 * Ordine. Nome e prezzo dei piatti vengono COPIATI (snapshot) nelle righe,
 * cosi' lo storico resta corretto anche se il menu cambia o viene eliminato.
 */
const orderSchema = new Schema(
  {
    cliente: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    ristorante: { type: Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    ristoranteNome: String, // snapshot
    righe: [
      {
        piatto: { type: Schema.Types.ObjectId, ref: 'Dish' },
        nome: String,
        prezzoUnitario: Number,
        quantita: { type: Number, min: 1 },
      },
    ],
    totalePiatti: Number,
    costoConsegna: { type: Number, default: 0 },
    totale: Number,

    modalita: { type: String, enum: ['ritiro', 'domicilio'], required: true },
    indirizzoConsegna: String,           // solo domicilio
    distanzaKm: Number,                  // solo domicilio (OpenStreetMap)
    tempoAttesaMin: Number,              // solo ritiro: stima in base alla coda del ristorante

    stato: { type: String, enum: STATI, default: 'ordinato' },
  },
  { timestamps: true }
);

orderSchema.index({ cliente: 1, createdAt: -1 });
orderSchema.index({ ristorante: 1, stato: 1 });

const Order = model('Order', orderSchema);
Order.STATI = STATI;
module.exports = Order;

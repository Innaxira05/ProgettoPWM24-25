const { Schema, model } = require('mongoose');

/**
 * Piatto. Una sola collection per due usi:
 *  - ristorante = null  -> piatto del CATALOGO COMUNE (caricato dal JSON del professore)
 *  - ristorante = <id>  -> piatto nel MENU di quel ristorante (copia del catalogo con prezzo,
 *                          oppure piatto personalizzato creato dal ristoratore)
 */
const dishSchema = new Schema(
  {
    sourceId: { type: String },                       // id originale nel JSON (per evitare duplicati nel seed)
    ristorante: { type: Schema.Types.ObjectId, ref: 'Restaurant', default: null },
    nome: { type: String, required: true, trim: true },
    tipologia: { type: String, required: true, trim: true }, // es. Beef, Dessert, Vegan...
    area: String,
    ingredienti: [String],
    allergeni: [String],
    immagine: String,        // URL della foto illustrativa
    istruzioni: String,
    prezzo: { type: Number, min: 0, default: null }, // null nel catalogo, obbligatorio nel menu
  },
  { timestamps: true }
);

// Un ristorante non puo' avere due volte lo stesso piatto del catalogo
dishSchema.index(
  { ristorante: 1, sourceId: 1 },
  { unique: true, partialFilterExpression: { sourceId: { $type: 'string' } } }
);
dishSchema.index({ nome: 1 });
dishSchema.index({ tipologia: 1 });

module.exports = model('Dish', dishSchema);

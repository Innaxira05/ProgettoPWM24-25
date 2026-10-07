const { Schema, model } = require('mongoose');

/**
 * Utente dell'applicazione (cliente o ristoratore).
 * I dati specifici del ristorante stanno nella collection "restaurants".
 * NB: della carta di pagamento si salvano solo tipo e ultime 4 cifre (mai il numero completo).
 */
const userSchema = new Schema(
  {
    username: { type: String, required: true, unique: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false }, // select:false -> non esce mai nelle query
    ruolo: { type: String, enum: ['cliente', 'ristoratore'], required: true },

    nome: { type: String, trim: true },
    cognome: { type: String, trim: true },
    telefono: { type: String, trim: true },

    // --- solo cliente ---
    indirizzo: { type: String, trim: true }, // indirizzo di consegna predefinito
    pagamento: {
      tipo: { type: String, enum: ['carta_credito', 'carta_prepagata'] },
      ultime4: { type: String, match: /^\d{4}$/ },
      intestatario: String,
    },
    preferenze: [String], // tipologie di piatto preferite (offerte in bacheca)
    allergie: [String],   // allergeni da evitare
  },
  { timestamps: true }
);

module.exports = model('User', userSchema);

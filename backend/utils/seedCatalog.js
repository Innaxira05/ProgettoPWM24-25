const fs = require('fs');
const path = require('path');
const Dish = require('../models/Dish');
const { derivaAllergeni } = require('./allergens');

/**
 * Converte un elemento del JSON del professore in un documento Dish "da catalogo".
 * Supporta il formato stile TheMealDB (idMeal, strMeal, strCategory, strIngredient1..20...)
 * e un formato gia' normalizzato (nome, tipologia, ingredienti...).
 * ADATTA QUI se meals_1.json ha una struttura diversa.
 */
function mappaPiatto(m) {
  let ingredienti = Array.isArray(m.ingredienti) ? m.ingredienti : [];
  if (!ingredienti.length) {
    for (let i = 1; i <= 20; i++) {
      const ing = (m[`strIngredient${i}`] || '').trim();
      if (ing) ingredienti.push(ing);
    }
  }
  const nome = m.strMeal || m.nome || m.name;
  return {
    sourceId: String(m.idMeal ?? m.id ?? nome),
    nome,
    tipologia: m.strCategory || m.tipologia || m.category || 'Altro',
    area: m.strArea || m.area || null,
    istruzioni: m.strInstructions || m.istruzioni || null,
    immagine: m.strMealThumb || m.immagine || m.image || null,
    ingredienti,
    allergeni: m.allergeni || derivaAllergeni(ingredienti),
    prezzo: null,        // il prezzo lo decide il ristoratore quando aggiunge il piatto al menu
    ristorante: null,    // null = piatto del catalogo comune
  };
}

/**
 * Carica nel DB il catalogo comune dei piatti dal file JSON.
 * Usa upsert su sourceId: si puo' rieseguire senza creare duplicati.
 * @returns {number} numero di piatti elaborati
 */
async function seedCatalog() {
  const file = path.resolve(__dirname, '..', process.env.SEED_FILE || 'data/meals_1.json');
  if (!fs.existsSync(file)) {
    console.warn(`[SEED] File non trovato: ${file} (salto il caricamento)`);
    return 0;
  }
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const lista = Array.isArray(raw) ? raw : raw.meals || raw.piatti || Object.values(raw)[0];
  const docs = lista.map(mappaPiatto).filter((d) => d.nome);

  await Dish.bulkWrite(
    docs.map((d) => ({
      updateOne: {
        filter: { sourceId: d.sourceId, ristorante: null },
        update: { $set: d },
        upsert: true,
      },
    }))
  );
  console.log(`[SEED] Catalogo piatti caricato: ${docs.length} elementi`);
  return docs.length;
}

module.exports = seedCatalog;

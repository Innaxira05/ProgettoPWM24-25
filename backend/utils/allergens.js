/**
 * Derivazione EURISTICA degli allergeni dagli ingredienti (parole chiave EN/IT).
 * Serve alla ricerca "piatti per allergie". E' una base di partenza:
 * se il JSON del professore contiene gia' gli allergeni, vanno usati quelli.
 */
const MAPPA = {
  glutine: ['wheat', 'flour', 'bread', 'pasta', 'spaghetti', 'noodle', 'pastry', 'barley', 'couscous', 'farina', 'pane'],
  latte: ['milk', 'cheese', 'butter', 'cream', 'yogurt', 'yoghurt', 'parmesan', 'mozzarella', 'cheddar', 'latte', 'formaggio', 'burro', 'panna'],
  uova: ['egg', 'uovo', 'uova'],
  pesce: ['fish', 'salmon', 'tuna', 'anchov', 'cod', 'pesce', 'tonno'],
  crostacei: ['prawn', 'shrimp', 'crab', 'lobster', 'gambero', 'granchio'],
  arachidi: ['peanut', 'arachid'],
  frutta_a_guscio: ['almond', 'walnut', 'hazelnut', 'cashew', 'pistachio', 'pecan', 'mandorl', 'noce', 'nocciol'],
  soia: ['soy', 'soia'],
  sesamo: ['sesame', 'tahini', 'sesamo'],
  sedano: ['celery', 'sedano'],
  senape: ['mustard', 'senape'],
};

/** @param {string[]} ingredienti @returns {string[]} lista allergeni rilevati */
function derivaAllergeni(ingredienti = []) {
  const testo = ingredienti.join(' | ').toLowerCase();
  return Object.keys(MAPPA).filter((a) => MAPPA[a].some((k) => testo.includes(k)));
}

module.exports = { derivaAllergeni, ALLERGENI: Object.keys(MAPPA) };

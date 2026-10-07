/** Escape dei caratteri speciali per usare input utente dentro una RegExp (evita ReDoS/injection). */
function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Regex case-insensitive "contiene" a partire da una stringa utente. */
function contiene(s) {
  return new RegExp(escapeRegex(s), 'i');
}

/** Arrotonda a 2 decimali (importi in euro). */
function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Normalizza il ruolo: il frontend di login.html invia "customer"/"restaurateur",
 * mentre il resto del progetto usa "cliente"/"ristoratore".
 */
function normalizzaRuolo(r) {
  const v = String(r || '').toLowerCase();
  if (['cliente', 'customer'].includes(v)) return 'cliente';
  if (['ristoratore', 'restaurateur'].includes(v)) return 'ristoratore';
  return null;
}

module.exports = { escapeRegex, contiene, round2, normalizzaRuolo };

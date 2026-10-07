const HttpError = require('./HttpError');
const { round2 } = require('./helpers');

const UA = () => process.env.OSM_USER_AGENT || 'FastFoodPWM/1.0 (progetto universitario UniMI)';

/**
 * Geocodifica un indirizzo con Nominatim (OpenStreetMap).
 * @returns {{lat:number,lng:number}|null} null se l'indirizzo non viene trovato
 */
async function geocodifica(indirizzo) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(indirizzo)}`;
  const r = await fetch(url, { headers: { 'User-Agent': UA() } });
  if (!r.ok) throw new Error(`Nominatim ha risposto ${r.status}`);
  const d = await r.json();
  if (!d.length) return null;
  return { lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon) };
}

/** Distanza "in linea d'aria" (Haversine) in km: fallback se OSRM non risponde. */
function haversineKm(a, b) {
  const R = 6371;
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Distanza stradale in km tra due punti con OSRM (routing basato su dati OpenStreetMap).
 * Se il servizio non e' raggiungibile usa Haversine.
 */
async function distanzaKm(a, b) {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=false`;
    const r = await fetch(url, { headers: { 'User-Agent': UA() } });
    if (!r.ok) throw new Error('OSRM ' + r.status);
    const d = await r.json();
    return d.routes[0].distance / 1000;
  } catch {
    return haversineKm(a, b);
  }
}

/** Costo consegna = base + km * tariffa al km (parametri in .env). */
function calcolaCostoConsegna(km) {
  const base = parseFloat(process.env.DELIVERY_BASE_EUR ?? '2');
  const perKm = parseFloat(process.env.DELIVERY_PER_KM_EUR ?? '0.8');
  return round2(base + km * perKm);
}

/**
 * Stima distanza e costo di consegna dal ristorante a un indirizzo.
 * Se il ristorante non ha ancora coordinate le calcola e le salva.
 * @param {Document} ristorante documento Mongoose Restaurant
 * @param {string} indirizzoConsegna
 * @returns {{distanzaKm:number,costoConsegna:number}}
 */
async function stimaConsegna(ristorante, indirizzoConsegna) {
  try {
    if (!ristorante.coordinate?.lat) {
      const c = await geocodifica(ristorante.indirizzo);
      if (!c) throw new HttpError(422, "Impossibile localizzare l'indirizzo del ristorante");
      ristorante.coordinate = c;
      await ristorante.save();
    }
    const dest = await geocodifica(indirizzoConsegna);
    if (!dest) throw new HttpError(400, 'Indirizzo di consegna non trovato');
    const km = await distanzaKm(ristorante.coordinate, dest);
    return { distanzaKm: round2(km), costoConsegna: calcolaCostoConsegna(km) };
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(502, 'Servizio OpenStreetMap non disponibile, riprova più tardi');
  }
}

module.exports = { geocodifica, distanzaKm, calcolaCostoConsegna, stimaConsegna };

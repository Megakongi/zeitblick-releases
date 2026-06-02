/**
 * Geocoding + Routing für die Motiv-Entfernung.
 *
 * - Geocoding (Adresse → Koordinaten): Nominatim (OpenStreetMap), kostenlos,
 *   kein API-Key. Nutzungsregeln: aussagekräftiger User-Agent, max ~1 req/s.
 * - Routing (Koordinaten → Fahrstrecke): OSRM-Demoserver, kostenlos, kein Key.
 *
 * Alles läuft im Main-Prozess (Node https), damit keine CORS-Probleme im
 * Renderer entstehen. Bei fehlender Internetverbindung schlagen die Aufrufe
 * mit einer klaren Fehlermeldung fehl – das Feature ist rein additiv.
 */

const https = require('https');

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const OSRM = 'https://router.project-osrm.org/route/v1/driving';
const USER_AGENT = 'ZeitBlick/1.4 (Stundenzettel-App; Dispo-Entfernung)';
const REQUEST_TIMEOUT_MS = 12000;

/** Einfacher GET → JSON mit Timeout & User-Agent. */
function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } }, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        reject(new Error(`Dienst antwortete mit HTTP ${res.statusCode}`));
        return;
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch { reject(new Error('Ungültige Antwort vom Dienst')); }
      });
    });
    req.on('error', (e) => reject(new Error(`Netzwerkfehler: ${e.message}`)));
    req.setTimeout(REQUEST_TIMEOUT_MS, () => req.destroy(new Error('Zeitüberschreitung – keine Verbindung?')));
  });
}

/** In-Memory-Cache (pro Sitzung), damit dieselbe Adresse nicht doppelt geocodiert wird. */
const geocodeCache = new Map();

/**
 * Adresse → { lat, lon }. Wirft, wenn nichts gefunden wird.
 * @param {string} address
 * @returns {Promise<{lat:number, lon:number}>}
 */
async function geocode(address) {
  const key = (address || '').trim().toLowerCase();
  if (!key) throw new Error('Keine Adresse angegeben');
  if (geocodeCache.has(key)) return geocodeCache.get(key);

  const url = `${NOMINATIM}?q=${encodeURIComponent(address)}&format=json&limit=1&countrycodes=de`;
  const arr = await httpGetJson(url);
  if (!Array.isArray(arr) || arr.length === 0) throw new Error(`Adresse nicht gefunden: ${address}`);
  const coord = { lat: parseFloat(arr[0].lat), lon: parseFloat(arr[0].lon) };
  if (Number.isNaN(coord.lat) || Number.isNaN(coord.lon)) throw new Error(`Ungültige Koordinaten für: ${address}`);
  geocodeCache.set(key, coord);
  return coord;
}

/**
 * Fahrstrecke zwischen zwei Koordinaten via OSRM.
 * @returns {Promise<{ km:number, durationMin:number }>}
 */
async function routeDistance(from, to) {
  const url = `${OSRM}/${from.lon},${from.lat};${to.lon},${to.lat}?overview=false`;
  const data = await httpGetJson(url);
  if (data.code !== 'Ok' || !Array.isArray(data.routes) || data.routes.length === 0) {
    throw new Error('Keine Route gefunden');
  }
  const r = data.routes[0];
  return { km: r.distance / 1000, durationMin: r.duration / 60 };
}

/** Sleep-Helfer, um die Nominatim-Rate (~1 req/s) einzuhalten. */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Berechnet die Fahrstrecke zwischen Heim- und Motiv-Adresse.
 * Geocodiert sequenziell (rate-limit-freundlich).
 * @returns {Promise<{ km:number, durationMin:number, home, motiv }>}
 */
async function computeDistance(homeAddress, motivAddress) {
  if (!homeAddress || !homeAddress.trim()) throw new Error('Keine Heim-Adresse hinterlegt (Karteikarte „Das bin ich")');
  if (!motivAddress || !motivAddress.trim()) throw new Error('Keine Motiv-Adresse vorhanden');

  const home = await geocode(homeAddress);
  if (!geocodeCache.has(motivAddress.trim().toLowerCase())) await sleep(1100);
  const motiv = await geocode(motivAddress);
  const route = await routeDistance(home, motiv);

  return {
    km: Math.round(route.km * 10) / 10,
    durationMin: Math.round(route.durationMin),
    home,
    motiv,
  };
}

module.exports = { geocode, routeDistance, computeDistance };

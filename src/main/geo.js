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
const http = require('http');
const {
  parseLatLon,
  isMapsUrl,
  isShortMapsUrl,
  coordsFromMapsUrl,
  placeFromMapsUrl,
} = require('./coords');

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

/**
 * Folgt HTTP-Redirects (für Maps-Kurzlinks wie maps.app.goo.gl) und gibt die
 * finale URL zurück. Lädt bewusst keinen Body – nur die Location-Header.
 * @param {string} url
 * @param {number} maxHops
 * @returns {Promise<string>} finale URL (oder die Eingabe, wenn kein Redirect)
 */
function resolveRedirect(url, maxHops = 5) {
  return new Promise((resolve, reject) => {
    const visit = (current, hops) => {
      if (hops > maxHops) { resolve(current); return; }
      const lib = current.startsWith('http://') ? http : https;
      const req = lib.get(current, { headers: { 'User-Agent': USER_AGENT } }, (res) => {
        const { statusCode, headers } = res;
        res.resume(); // Body verwerfen
        if (statusCode >= 300 && statusCode < 400 && headers.location) {
          const next = new URL(headers.location, current).toString();
          visit(next, hops + 1);
        } else {
          resolve(current);
        }
      });
      req.on('error', (e) => reject(new Error(`Netzwerkfehler: ${e.message}`)));
      req.setTimeout(REQUEST_TIMEOUT_MS, () => req.destroy(new Error('Zeitüberschreitung – keine Verbindung?')));
    };
    visit(url, 0);
  });
}

/** In-Memory-Cache (pro Sitzung), damit dieselbe Adresse nicht doppelt geocodiert wird. */
const geocodeCache = new Map();

/** „PLZ Ort“-Teil aus einer „Straße, PLZ Ort“-Adresse herauslösen. */
const PLZ_CITY_TAIL_RE = /(\d{5}\s+[A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß0-9.\-/ ]*)$/;

/**
 * Erzeugt geocodierbare Varianten einer Adresse, von spezifisch nach grob.
 * Hintergrund: Dispo-Adressen enthalten oft Zusätze, die Nominatim nicht
 * auflösen kann, z. B. „Butzweilerstraße 255 (Technikzufahrt), 50829 Köln“.
 * Wir versuchen daher der Reihe nach:
 *   1. Original
 *   2. ohne Klammer-Zusätze „(…)“
 *   3. ohne Klammern UND ohne nachgestellte Hausnummer (nur Straßenname + Ort)
 *   4. nur „PLZ Ort“ (grobe, aber praktisch immer auflösbare Näherung)
 * @param {string} address
 * @returns {string[]} eindeutige, nicht-leere Varianten
 */
function addressVariants(address) {
  const variants = [];
  const push = (s) => { const t = (s || '').replace(/\s+/g, ' ').replace(/\s+,/g, ',').trim(); if (t && !variants.includes(t)) variants.push(t); };

  push(address);
  const noParen = address.replace(/\s*\([^)]*\)/g, '');
  push(noParen);

  const tail = noParen.match(PLZ_CITY_TAIL_RE);
  if (tail) {
    // Straßenname ohne Hausnummer + „PLZ Ort“
    const head = noParen.slice(0, tail.index).replace(/,\s*$/, '').trim();
    const streetNoNo = head.replace(/\s+\d+\s*[a-zA-Z]?(?:\s*[-–]\s*\d+\s*[a-zA-Z]?)?$/, '').trim();
    if (streetNoNo && streetNoNo !== head) push(`${streetNoNo}, ${tail[1]}`);
    push(tail[1]); // nur PLZ Ort
  }
  return variants;
}

/**
 * Adresse/Koordinaten/Maps-Link → { lat, lon }.
 * Reihenfolge:
 *   1. direkte Koordinaten (präzise, kein Netz nötig)
 *   2. Google-Maps-Link (Koordinaten aus URL; Kurzlinks per Redirect auflösen)
 *   3. klassische Adresse über Nominatim (mehrere Varianten)
 * @param {string} address
 * @returns {Promise<{lat:number, lon:number, matched:string, approx:boolean}>}
 */
async function geocode(address) {
  const key = (address || '').trim().toLowerCase();
  if (!key) throw new Error('Keine Adresse angegeben');
  if (geocodeCache.has(key)) return geocodeCache.get(key);

  // 1) Direkte Koordinaten – kein Geocoding nötig, sogar präziser als Nominatim.
  const direct = parseLatLon(address);
  if (direct) {
    const coord = { lat: direct.lat, lon: direct.lon, matched: `${direct.lat}, ${direct.lon}`, approx: false };
    geocodeCache.set(key, coord);
    return coord;
  }

  // 2) Google-Maps-Link – Koordinaten aus der URL ziehen (ggf. Kurzlink auflösen).
  if (isMapsUrl(address)) {
    let coord = coordsFromMapsUrl(address);
    if (!coord && isShortMapsUrl(address)) {
      try {
        const resolved = await resolveRedirect(address.trim());
        coord = coordsFromMapsUrl(resolved);
      } catch { /* Netz-/Auflösungsfehler – unten auf Ortsnamen ausweichen */ }
    }
    if (coord) {
      const out = { lat: coord.lat, lon: coord.lon, matched: `${coord.lat}, ${coord.lon}`, approx: false };
      geocodeCache.set(key, out);
      return out;
    }
    // Keine Koordinaten im Link → evtl. Ortsnamen extrahieren und normal geocoden.
    const place = placeFromMapsUrl(address);
    if (place) {
      const out = await geocodeAddress(place);
      geocodeCache.set(key, out);
      return out;
    }
    throw new Error(`Maps-Link ohne erkennbare Koordinaten: ${address}`);
  }

  // 3) Klassische Adresse.
  const out = await geocodeAddress(address);
  geocodeCache.set(key, out);
  return out;
}

/**
 * Klassisches Geocoding einer Anschrift über Nominatim (mehrere Varianten).
 * Wirft erst, wenn keine Variante auflösbar ist.
 * @param {string} address
 * @returns {Promise<{lat:number, lon:number, matched:string, approx:boolean}>}
 */
async function geocodeAddress(address) {
  const variants = addressVariants(address);
  for (let i = 0; i < variants.length; i++) {
    const q = variants[i];
    const url = `${NOMINATIM}?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=de`;
    let arr;
    try { arr = await httpGetJson(url); } catch (e) { if (i === variants.length - 1) throw e; await sleep(1100); continue; }
    if (Array.isArray(arr) && arr.length > 0) {
      // „approx“ nur, wenn die Treffer-Variante mit der PLZ beginnt – dann ist
      // die Straße verlorengegangen (grobe Näherung auf Ortsebene).
      const approx = /^\d{5}\s/.test(q);
      const coord = { lat: parseFloat(arr[0].lat), lon: parseFloat(arr[0].lon), matched: q, approx };
      if (!Number.isNaN(coord.lat) && !Number.isNaN(coord.lon)) {
        return coord;
      }
    }
    if (i < variants.length - 1) await sleep(1100); // Rate-Limit zwischen Varianten
  }
  throw new Error(`Adresse nicht gefunden: ${address}`);
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
    approx: !!motiv.approx, // true, wenn nur eine gröbere Adress-Variante (z. B. PLZ Ort) getroffen wurde
    matched: motiv.matched,
  };
}

module.exports = { geocode, routeDistance, computeDistance };

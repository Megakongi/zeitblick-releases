/**
 * Koordinaten- und Google-Maps-Link-Erkennung für Dispo-Motive.
 *
 * Manche Dispos geben statt einer Anschrift nur GPS-Koordinaten oder einen
 * Google-Maps-Link an. Dieses Modul holt daraus eine nutzbare Position:
 *   - Dezimalkoordinaten:  "50.938123, 6.921456"  /  "N 50.938 E 6.921"
 *   - Grad/Minuten/Sek.:   "50°56'17.2\"N 6°55'17.2\"E"
 *   - Maps-Links:          ".../@50.938,6.921,17z", "?q=50.938,6.921",
 *                          "!3d50.938!4d6.921", "q=loc:50.938,6.921"
 *
 * Kurzlinks (maps.app.goo.gl, goo.gl/maps) enthalten keine Koordinaten und
 * müssen per HTTP-Redirect aufgelöst werden – das passiert in geo.js zur
 * Berechnungszeit (dort ist ohnehin Internet nötig), nicht beim PDF-Import.
 */

/** Plausibilitätsprüfung – verwirft Zufallszahlen, die keine Koordinaten sind. */
function inRange(lat, lon) {
  return Number.isFinite(lat) && Number.isFinite(lon) &&
    Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && (lat !== 0 || lon !== 0);
}

/** Vorzeichen aus Himmelsrichtung (S/W negativ). */
function sign(hemi) {
  return /[swSW]/.test(hemi || '') ? -1 : 1;
}

/**
 * Versucht, aus einem Text ein Koordinatenpaar zu lesen.
 * @param {string} text
 * @returns {{ lat:number, lon:number }|null}
 */
function parseLatLon(text) {
  if (!text) return null;
  // führendes Label entfernen: "GPS:", "Koordinaten:", "Standort -", …
  const s = text.trim().replace(
    /^(?:gps|koordinaten?|coords?|standort|position|lat\/?lon|geo)\s*[:=–-]?\s*/i,
    ''
  );

  // 1) Grad/Minuten/Sekunden mit Himmelsrichtung
  //    50°56'17.2"N 6°55'17.2"E   (Trenner zwischen den Hälften: Komma/Strich/Leer)
  const dms = s.match(
    /(\d{1,3})\s*°\s*(\d{1,2})\s*['′]\s*([\d.,]+)\s*["″]?\s*([NSWEnswe])[\s,;]+(\d{1,3})\s*°\s*(\d{1,2})\s*['′]\s*([\d.,]+)\s*["″]?\s*([NSWEnswe])/
  );
  if (dms) {
    const toDeg = (d, m, sec) =>
      parseInt(d, 10) + parseInt(m, 10) / 60 + parseFloat(String(sec).replace(',', '.')) / 3600;
    const a = toDeg(dms[1], dms[2], dms[3]) * sign(dms[4]);
    const b = toDeg(dms[5], dms[6], dms[7]) * sign(dms[8]);
    // Reihenfolge anhand der Himmelsrichtung bestimmen (N/S = Breite).
    const aIsLat = /[NSns]/.test(dms[4]);
    const lat = aIsLat ? a : b;
    const lon = aIsLat ? b : a;
    if (inRange(lat, lon)) return { lat: round6(lat), lon: round6(lon) };
  }

  // 2) Dezimal mit optionalen Himmelsrichtungs-Buchstaben
  //    "N 50.938, E 6.921" / "50.938° N, 6.921° E" / "50.938, 6.921"
  const dec = s.match(
    /([NSns]\s*)?(-?\d{1,3}\.\d+)\s*°?\s*([NSns])?[\s,;/]+([EWew]\s*)?(-?\d{1,3}\.\d+)\s*°?\s*([EWew])?/
  );
  if (dec) {
    const hemiA = (dec[1] || dec[3] || '').trim();
    const hemiB = (dec[4] || dec[6] || '').trim();
    let a = parseFloat(dec[2]) * (hemiA ? sign(hemiA) : 1);
    let b = parseFloat(dec[5]) * (hemiB ? sign(hemiB) : 1);
    // Falls explizit E/W zuerst stand, Reihenfolge tauschen.
    if (/[EWew]/.test(hemiA) || /[NSns]/.test(hemiB)) { const t = a; a = b; b = t; }
    if (inRange(a, b)) return { lat: round6(a), lon: round6(b) };
  }

  // 3) Deutsche Komma-Dezimalschreibweise: "50,938123; 6,921456"
  const ger = s.match(/^(-?\d{1,3},\d+)\s*[;/]\s*(-?\d{1,3},\d+)$/);
  if (ger) {
    const lat = parseFloat(ger[1].replace(',', '.'));
    const lon = parseFloat(ger[2].replace(',', '.'));
    if (inRange(lat, lon)) return { lat: round6(lat), lon: round6(lon) };
  }

  return null;
}

const round6 = (n) => Math.round(n * 1e6) / 1e6;

/** Bekannte Google-Maps-Hosts/Pfade (Volllinks). */
const MAPS_URL_RE = /https?:\/\/[^\s]*?(?:google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl\/maps)[^\s]*/i;
/** Kurzlinks, die erst per Redirect aufgelöst werden müssen. */
const SHORT_MAPS_RE = /https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps)\/[^\s]+/i;

/** Findet einen Google-Maps-Link in einem Text und gibt ihn (bereinigt) zurück. */
function extractMapsUrl(text) {
  const m = (text || '').match(MAPS_URL_RE);
  if (!m) return null;
  return m[0].replace(/[).,;]+$/, ''); // nachgestellte Satzzeichen abschneiden
}

/** @returns {boolean} ob der String ein Google-Maps-Link ist. */
function isMapsUrl(text) {
  return MAPS_URL_RE.test((text || '').trim());
}

/** @returns {boolean} ob es ein (noch aufzulösender) Maps-Kurzlink ist. */
function isShortMapsUrl(text) {
  return SHORT_MAPS_RE.test((text || '').trim());
}

/**
 * Zieht Koordinaten direkt aus einem (vollständigen) Maps-Link.
 * @param {string} url
 * @returns {{ lat:number, lon:number }|null}
 */
function coordsFromMapsUrl(url) {
  if (!url) return null;
  const patterns = [
    /@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/,                  // .../@lat,lon,zoom
    /!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/,              // ...!3dlat!4dlon
    /[?&](?:q|query|ll|sll|center|destination)=(-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)/i,
    /[?&]q=loc:(-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)/i,
    /\/(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/,                 // /dir/lat,lon
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) {
      const lat = parseFloat(m[1]);
      const lon = parseFloat(m[2]);
      if (inRange(lat, lon)) return { lat: round6(lat), lon: round6(lon) };
    }
  }
  return null;
}

/**
 * Holt – falls vorhanden – einen Orts-/Suchbegriff aus einem Maps-Link, damit
 * er notfalls normal geocodiert werden kann (wenn keine Koordinaten drinstehen).
 * @param {string} url
 * @returns {string} z. B. "Kölner Dom" oder ""
 */
function placeFromMapsUrl(url) {
  if (!url) return '';
  const place = url.match(/\/place\/([^/@]+)/i);
  if (place) return decodeURIComponent(place[1].replace(/\+/g, ' ')).trim();
  const q = url.match(/[?&]q=([^&]+)/i);
  if (q && !/^-?\d{1,3}\.\d+,/.test(decodeURIComponent(q[1]))) {
    return decodeURIComponent(q[1].replace(/\+/g, ' ')).trim();
  }
  return '';
}

module.exports = {
  parseLatLon,
  isMapsUrl,
  isShortMapsUrl,
  extractMapsUrl,
  coordsFromMapsUrl,
  placeFromMapsUrl,
};

/**
 * Dispo-PDF-Adressextraktion.
 *
 * Liest den Textinhalt einer Dispo-PDF (über pdf2json, in Lesereihenfolge)
 * und versucht, die Motiv-Adressen herauszulesen.
 *
 * Typisches Layout in deutschen Film-Dispos (linke Spalte):
 *
 *   Motiv 1 „Friedhof“:
 *   Jüdischer Friedhof Köln-Bocklemünd
 *   Venloer Str. 1152
 *   50829 Köln
 *
 *   Motiv:
 *   Schweppenburgstr. 1
 *   53332 Bornheim
 *
 * Strategie: Zeile mit Label „Motiv … :“ finden, dann die Folgezeilen
 * sammeln, bis eine „PLZ Ort“-Zeile auftaucht – diese schließt den
 * Adressblock ab. Als Straße wird die letzte „straßenartige“ Zeile davor
 * genutzt (enthält ein Straßen-Schlüsselwort oder eine Hausnummer).
 */

const PDFParser = require('pdf2json');

/** Straßen-Schlüsselwörter (für die Erkennung der Straßenzeile). */
const STREET_RE = /(str\.?|straße|strasse|weg|platz|allee|ring|gasse|ufer|damm|chaussee|wall|markt)\b/i;

/** „PLZ Ort“ – fünfstellige PLZ + Ortsname. */
const PLZ_CITY_RE = /^(\d{5})\s+([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß0-9.\-/ ]+)$/;

/**
 * Label-Zeile eines Motiv-Blocks, z. B.:
 *   "Motiv:"  "Motiv 1 „Friedhof“:"  "Motiv 2 „Synagoge“:"
 * Bewusst NICHT erfasst: "Motiv / Inhalt", "Motiv Aufnahmeleitung",
 * "Anfahrt MMC  Motiv: 20 Min" (kein Zeilenanfang "Motiv … :").
 */
const MOTIV_LABEL_RE = /^Motiv(?:\s*\d+)?\s*(?:[„"'“]([^"„“'”]+)[”“"'])?\s*:\s*$/i;

/** Basis-Block als Fallback, falls kein Motiv gefunden wird. */
const BASIS_LABEL_RE = /^Basis\s*:?\s*$/i;

/**
 * Liest alle Text-Fragmente einer PDF in Lesereihenfolge.
 * @param {string} filePath
 * @returns {Promise<string[]>}
 */
function extractLines(filePath) {
  return new Promise((resolve, reject) => {
    const parser = new PDFParser();
    parser.on('pdfParser_dataError', (e) => reject(e?.parserError || new Error('PDF konnte nicht gelesen werden')));
    parser.on('pdfParser_dataReady', (data) => {
      const lines = [];
      for (const page of data.Pages || []) {
        for (const t of page.Texts || []) {
          let s = '';
          try { s = decodeURIComponent((t.R || []).map((r) => r.T).join('')); } catch { s = (t.R || []).map((r) => r.T).join(''); }
          s = s.replace(/\s+/g, ' ').trim();
          if (s) lines.push(s);
        }
      }
      resolve(lines);
    });
    parser.loadPDF(filePath);
  });
}

/**
 * Sammelt einen Adressblock ab Index `start` (erste Zeile nach dem Label).
 * @returns {{ name:string, street:string, plzCity:string }|null}
 */
function collectAddressBlock(lines, start) {
  let street = '';
  let firstNonStreet = '';
  for (let j = start; j < Math.min(start + 6, lines.length); j++) {
    const ln = lines[j];
    const pc = ln.match(PLZ_CITY_RE);
    if (pc) {
      return { name: firstNonStreet, street, plzCity: `${pc[1]} ${pc[2].trim()}` };
    }
    // straßenartig: enthält Straßen-Keyword ODER eine Hausnummer-Ziffer
    if (STREET_RE.test(ln) || /\d/.test(ln)) {
      street = ln;
    } else if (!firstNonStreet) {
      firstNonStreet = ln; // z. B. POI-Name "Jüdischer Friedhof …"
    }
  }
  return null; // keine PLZ-Zeile → kein verwertbarer Block
}

/** Entfernt Duplikate (gleiche Adresse). */
function dedupe(list) {
  const seen = new Set();
  return list.filter((it) => {
    const k = it.address.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Findet alle Motiv-Adressen in der Zeilenliste.
 * @param {string[]} lines
 * @returns {Array<{ label:string, address:string }>}
 */
function extractMotivAddresses(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(MOTIV_LABEL_RE);
    if (!m) continue;
    const block = collectAddressBlock(lines, i + 1);
    if (!block) continue;
    const street = block.street || block.name;
    if (!street) continue;
    const address = `${street}, ${block.plzCity}`;
    const quoted = (m[1] || '').trim();
    out.push({ label: quoted || `Motiv ${out.length + 1}`, address });
  }
  return dedupe(out);
}

/** Fallback: Basis-Adresse (nur wenn kein Motiv gefunden wurde). */
function extractBasisAddress(lines) {
  for (let i = 0; i < lines.length; i++) {
    if (!BASIS_LABEL_RE.test(lines[i])) continue;
    const block = collectAddressBlock(lines, i + 1);
    if (!block) continue;
    const street = block.street || block.name;
    if (!street) continue;
    return { label: 'Basis', address: `${street}, ${block.plzCity}` };
  }
  return null;
}

/**
 * Hauptfunktion: liest die Motiv-Adressen aus einer Dispo-PDF.
 * @param {string} filePath
 * @returns {Promise<{ motive: Array<{label,address}>, suggested: string }>}
 */
async function extractDispoAddresses(filePath) {
  let lines;
  try {
    lines = await extractLines(filePath);
  } catch (e) {
    return { motive: [], suggested: '', error: e.message };
  }
  let motive = extractMotivAddresses(lines);
  if (motive.length === 0) {
    const basis = extractBasisAddress(lines);
    if (basis) motive = [basis];
  }
  return { motive, suggested: motive[0]?.address || '' };
}

module.exports = { extractDispoAddresses, extractMotivAddresses, extractBasisAddress, extractLines };

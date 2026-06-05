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
const { parseLatLon, extractMapsUrl, isMapsUrl } = require('./coords');

/** Straßen-Schlüsselwörter (für die Erkennung der Straßenzeile). */
const STREET_RE = /(str\.?|straße|strasse|weg|platz|allee|ring|gasse|ufer|damm|chaussee|wall|markt)\b/i;

/**
 * „PLZ Ort“ – fünfstellige PLZ + Ortsname. Optionales Länderpräfix wie
 * „D-“, „A-“, „CH-“ (z. B. „D-50829 Köln“) wird toleriert und verworfen.
 */
const PLZ_CITY_RE = /^(?:[A-Za-z]{1,3}-)?(\d{5})\s+([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß0-9.\-/ ]+)$/;

/**
 * Label-Zeile eines Motiv-Blocks, z. B.:
 *   "Motiv:"  "Motiv 1 „Friedhof“:"  "Motiv 2 „Synagoge“:"
 *   "Motiv + Technik:"  "Motiv 1 + Technik:"  "Motiv 2 / Technik:"
 * In vielen Dispo-Vorlagen steht die Motiv-Adresse unter „Motiv + Technik:“
 * (Motiv und Technik teilen sich denselben Ort) – dieser Zusatz wird daher
 * toleriert. Bewusst NICHT erfasst: "Motiv / Inhalt", "Motiv Aufnahmeleitung",
 * "Motiv Informationen:", "Motivspezifische Hinweise:" (Wortgrenze \b),
 * "Anfahrt MMC  Motiv: 20 Min" (Text nach dem Doppelpunkt).
 */
const MOTIV_LABEL_RE = /^Motiv\b(?:\s*\d+)?\s*(?:[„"'“]([^"„“'”]+)[”“"'])?\s*(?:[+/]\s*Technik\b\s*)?:\s*$/i;

/** Basis-Block als Fallback, falls kein Motiv gefunden wird. */
const BASIS_LABEL_RE = /^Basis\s*:?\s*$/i;

/**
 * Kombiniertes Label, bei dem Motiv UND Basis dieselbe Adresse haben, z. B.:
 *   "Motiv / Basis / Technik:"   "Basis /Technik / Motiv:"   "Motiv / Basis:"
 * Verlangt beide Wörter „Motiv“ und „Basis“, davor nur Buchstaben/Slashes/
 * Leerzeichen und ein abschließender Doppelpunkt. Dadurch werden Hinweise wie
 * "Basis + Motiv: Parkplatz …" (enthält „+“) bewusst NICHT erfasst.
 */
const COMBINED_LABEL_RE = /^(?=[A-Za-zÄÖÜäöü /]*\bMotiv\b)(?=[A-Za-zÄÖÜäöü /]*\bBasis\b)[A-Za-zÄÖÜäöü /]+:\s*$/i;

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
 * Eine vollständige „Straße, PLZ Ort"-Anschrift hat Vorrang. Findet sich keine,
 * werden ersatzweise Koordinaten oder ein Google-Maps-Link genutzt (`geo`).
 * @returns {{ name:string, street:string, plzCity:string, geo:string }|null}
 */
function collectAddressBlock(lines, start) {
  let street = '';
  let firstNonStreet = '';
  let geo = '';
  for (let j = start; j < Math.min(start + 6, lines.length); j++) {
    const ln = lines[j];
    const pc = ln.match(PLZ_CITY_RE);
    if (pc) {
      return { name: firstNonStreet, street, plzCity: `${pc[1]} ${pc[2].trim()}`, geo };
    }
    // Google-Maps-Link? → als geo-Fallback merken (Koordinaten kommen später).
    if (isMapsUrl(ln)) { if (!geo) geo = extractMapsUrl(ln) || ''; continue; }
    // Reine Koordinatenzeile? → als geo-Fallback in normierter Form merken.
    const c = parseLatLon(ln);
    if (c) { if (!geo) geo = `${c.lat}, ${c.lon}`; continue; }
    // Sonstige URLs (z. B. „https://rb.gy/…") sind keine Straße – überspringen.
    if (/https?:\/\/|www\./i.test(ln)) continue;
    // straßenartig: enthält Straßen-Keyword ODER eine Hausnummer-Ziffer
    if (STREET_RE.test(ln) || /\d/.test(ln)) {
      street = ln;
    } else if (!firstNonStreet) {
      firstNonStreet = ln; // z. B. POI-Name "Jüdischer Friedhof …"
    }
  }
  // Keine PLZ-Zeile, aber Koordinaten/Maps-Link vorhanden → trotzdem verwertbar.
  if (geo) return { name: firstNonStreet, street: '', plzCity: '', geo };
  return null;
}

/**
 * Baut aus einem Adressblock die nutzbare Adress-Zeichenkette.
 * Vorrang: vollständige Anschrift; sonst Koordinaten/Maps-Link.
 * @param {{ name:string, street:string, plzCity:string, geo:string }} block
 * @returns {string}
 */
function blockToAddress(block) {
  if (block.plzCity) {
    const street = block.street || block.name;
    if (street) return `${street}, ${block.plzCity}`;
  }
  return block.geo || '';
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
    const address = blockToAddress(block);
    if (!address) continue;
    const quoted = (m[1] || '').trim();
    out.push({ label: quoted || `Motiv ${out.length + 1}`, address });
  }
  return dedupe(out);
}

/**
 * Findet Adressen mit kombiniertem „Motiv / Basis …:“-Label. Bei diesen
 * Drehtagen sind Motiv und Basis derselbe Ort (z. B. Studio-Tage).
 * @param {string[]} lines
 * @returns {Array<{ label:string, address:string }>}
 */
function extractCombinedAddresses(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (!COMBINED_LABEL_RE.test(lines[i])) continue;
    const block = collectAddressBlock(lines, i + 1);
    if (!block) continue;
    const address = blockToAddress(block);
    if (!address) continue;
    out.push({ label: 'Motiv / Basis', address });
  }
  return dedupe(out);
}

/** Fallback: Basis-Adresse (nur wenn kein Motiv gefunden wurde). */
function extractBasisAddress(lines) {
  // Auch kombinierte „Motiv / Basis …:“-Labels akzeptieren.
  for (let i = 0; i < lines.length; i++) {
    if (!COMBINED_LABEL_RE.test(lines[i])) continue;
    const block = collectAddressBlock(lines, i + 1);
    if (!block) continue;
    const address = blockToAddress(block);
    if (address) return { label: 'Basis', address };
  }
  for (let i = 0; i < lines.length; i++) {
    if (!BASIS_LABEL_RE.test(lines[i])) continue;
    const block = collectAddressBlock(lines, i + 1);
    if (!block) continue;
    const address = blockToAddress(block);
    if (!address) continue;
    return { label: 'Basis', address };
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
    // Studio-/Basis-Tage: Motiv == Basis (kombiniertes Label oder nur Basis).
    const combined = extractCombinedAddresses(lines);
    if (combined.length) {
      motive = combined;
    } else {
      const basis = extractBasisAddress(lines);
      if (basis) motive = [basis];
    }
  }
  return { motive, suggested: motive[0]?.address || '' };
}

module.exports = { extractDispoAddresses, extractMotivAddresses, extractCombinedAddresses, extractBasisAddress, extractLines };

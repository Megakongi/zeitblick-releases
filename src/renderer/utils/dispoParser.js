/**
 * Dispo-Dateiname-Parser.
 *
 * Dispo-PDFs aus verschiedenen Produktionen haben sehr unterschiedliche
 * Dateinamen. Diese Funktion versucht, aus dem Dateinamen die Kernfelder
 * zu erraten: Datum, Drehtag-Bezeichnung und Projekt (über Kürzel/Namen).
 *
 * Beispiele:
 *   "Doitscha - Dispo Nachdreh 22.DT - 26.03.26.pdf"  → 26.03.2026, Doitscha, 22. DT
 *   "EMB_SD49_CS_260428.pdf"                          → 28.04.2026, EMB, SD 49
 *   "260505_5050_CS_DT1.pdf"                          → 05.05.2026, 5050, DT 1
 *   "Disposition Aufbautag 13.04_VP01.pdf"            → 13.04.(?), Aufbautag VP01
 */

const MONTHS_DE = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];

/** Pad to 2 digits. */
const p2 = (n) => String(n).padStart(2, '0');

/**
 * Versucht ein Datum aus dem Dateinamen zu lesen.
 * Unterstützt: dd.mm.yy, dd.mm.yyyy, yymmdd, yyyymmdd, dd.mm (ohne Jahr).
 * @returns {{ iso: string|null, day:number, month:number, year:number|null, hadYear:boolean }}
 */
export function parseDispoDate(filename, fallbackYear) {
  const name = filename.replace(/\.pdf$/i, '');
  const nowYear = fallbackYear || new Date().getFullYear();

  // 1) dd.mm.yyyy oder dd.mm.yy
  let m = name.match(/(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})(?!\d)/);
  if (m) {
    const day = +m[1], month = +m[2];
    let year = +m[3];
    if (m[3].length === 2) year += 2000;
    if (validDM(day, month)) return { iso: `${year}-${p2(month)}-${p2(day)}`, day, month, year, hadYear: true };
  }

  // 2) yyyymmdd (z.B. 20260428) – 8 Ziffern als Block
  m = name.match(/(?<!\d)(\d{4})(\d{2})(\d{2})(?!\d)/);
  if (m) {
    const year = +m[1], month = +m[2], day = +m[3];
    if (year >= 2000 && year <= 2099 && validDM(day, month)) {
      return { iso: `${year}-${p2(month)}-${p2(day)}`, day, month, year, hadYear: true };
    }
  }

  // 3) yymmdd (z.B. 260428 oder 260505) – 6 Ziffern als Block
  m = name.match(/(?<!\d)(\d{2})(\d{2})(\d{2})(?!\d)/);
  if (m) {
    const year = 2000 + +m[1], month = +m[2], day = +m[3];
    if (validDM(day, month)) {
      return { iso: `${year}-${p2(month)}-${p2(day)}`, day, month, year, hadYear: true };
    }
  }

  // 4) dd.mm ohne Jahr → aktuelles/Fallback-Jahr annehmen
  m = name.match(/(\d{1,2})\.(\d{1,2})(?!\.?\d)/);
  if (m) {
    const day = +m[1], month = +m[2];
    if (validDM(day, month)) {
      return { iso: `${nowYear}-${p2(month)}-${p2(day)}`, day, month, year: nowYear, hadYear: false };
    }
  }

  return { iso: null, day: 0, month: 0, year: null, hadYear: false };
}

function validDM(d, mo) { return d >= 1 && d <= 31 && mo >= 1 && mo <= 12; }

/**
 * Versucht die Drehtag-Bezeichnung zu erraten.
 * @returns {string}  z.B. "22. DT", "SD 49", "DT 1", "Aufbautag VP01"
 */
export function parseDrehtag(filename) {
  const name = filename.replace(/\.pdf$/i, '');
  // Trenner: alles außer Buchstaben/Ziffern (auch "_" zählt als Trenner)
  const SEP_L = '(?:^|[^A-Za-z0-9])';
  const SEP_R = '(?=[^A-Za-z0-9]|$)';

  // Drehtag-Code zuerst bestimmen (DT/SD), unabhängig von Schlüsselwort
  let code = '';
  // "22.DT" / "22. DT"
  let m = name.match(new RegExp(`(\\d{1,3})\\.?\\s*DT${SEP_R}`, 'i'));
  if (m) code = `${m[1]}. DT`;
  if (!code) { // "DT1" / "DT 1"
    m = name.match(new RegExp(`${SEP_L}DT\\s*(\\d{1,3})${SEP_R}`, 'i'));
    if (m) code = `DT ${m[1]}`;
  }
  if (!code) { // "SD49" / "SD 49"
    m = name.match(new RegExp(`${SEP_L}SD\\s*(\\d{1,3})${SEP_R}`, 'i'));
    if (m) code = `SD ${m[1]}`;
  }

  // Schlüsselwort (Aufbautag/Abbautag/Nachdreh/Drehtag)
  let keyword = '';
  m = name.match(/\b(Aufbau(?:tag)?|Abbau(?:tag)?|Nachdreh|Drehtag)\b/i);
  if (m) keyword = cap(m[1]);

  // Zusatz-Code wie "VP01" (zwei Buchstaben + zwei Ziffern), aber kein Datum
  let extraCode = '';
  m = name.match(new RegExp(`${SEP_L}([A-Z]{2}\\d{2})${SEP_R}`));
  if (m) extraCode = m[1];

  // Kombinieren – sinnvolle Priorität
  if (keyword && code) return `${keyword} ${code}`;
  if (keyword && extraCode) return `${keyword} ${extraCode}`;
  if (keyword) return keyword;
  if (code) return code;
  if (extraCode) return extraCode;
  return '';
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(); }

/**
 * Versucht das Projekt aus dem Dateinamen zu erraten – über bekannte
 * Projektnamen, deren Kürzel und Projektnummern.
 * @param {string} filename
 * @param {Object} projects  settings.projects: { name: { kuerzel, projektnummer, ... } }
 * @returns {string}  Projektname oder '' wenn unklar
 */
export function guessProject(filename, projects) {
  const name = filename.toLowerCase();
  const entries = Object.entries(projects || {});

  // 1) Voller Projektname kommt im Dateinamen vor
  for (const [proj] of entries) {
    if (proj && name.includes(proj.toLowerCase())) return proj;
  }
  // 2) Kürzel (als eigenes Token, case-insensitive)
  for (const [proj, info] of entries) {
    const k = (info && info.kuerzel ? String(info.kuerzel) : '').trim().toLowerCase();
    if (k && new RegExp(`(?:^|[^a-z0-9])${escapeRe(k)}(?:[^a-z0-9]|$)`, 'i').test(name)) return proj;
  }
  // 3) Projektnummer
  for (const [proj, info] of entries) {
    const num = (info && info.projektnummer ? String(info.projektnummer) : '').replace(/[^0-9]/g, '');
    if (num && num.length >= 3 && name.replace(/[^0-9]/g, '').includes(num)) return proj;
  }
  return '';
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/**
 * Baut ein Dispo-Objekt aus einem Dateinamen.
 * @returns {{ datumISO, day, month, year, hadYear, drehtag, projektGuess, title }}
 */
export function parseDispoFilename(filename, projects, fallbackYear) {
  const date = parseDispoDate(filename, fallbackYear);
  const drehtag = parseDrehtag(filename);
  const projektGuess = guessProject(filename, projects);
  // Titel: Drehtag (+ Projekt), sonst bereinigter Dateiname
  let title = drehtag;
  if (projektGuess && drehtag) title = `${drehtag} · ${projektGuess}`;
  else if (projektGuess) title = projektGuess;
  else if (!drehtag) title = filename.replace(/\.pdf$/i, '');
  return {
    datumISO: date.iso,
    day: date.day, month: date.month, year: date.year, hadYear: date.hadYear,
    drehtag, projektGuess, title,
  };
}

/** Formatiert ein ISO-Datum als "Mo, 05. Mai 2026" (für Anzeige). */
export function formatDispoDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00');
  if (isNaN(d.getTime())) return '';
  const WD = ['So','Mo','Di','Mi','Do','Fr','Sa'];
  return `${WD[d.getDay()]}, ${p2(d.getDate())}. ${MONTHS_DE[d.getMonth()]} ${d.getFullYear()}`;
}

export { MONTHS_DE };

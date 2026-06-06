const { spawnSync } = require('child_process');
const PDFParser = require('pdf2json');
const fs = require('fs');
const path = require('path');

// --- pdftotext detection (poppler) ----------------------------------------
const PDFTOTEXT_CANDIDATES = [
  '/opt/homebrew/bin/pdftotext',   // macOS Homebrew Apple Silicon
  '/usr/local/bin/pdftotext',      // macOS Homebrew Intel
  '/usr/bin/pdftotext',            // Linux
];
const PDFTOTEXT_BIN = PDFTOTEXT_CANDIDATES.find(p => { try { fs.accessSync(p, fs.constants.X_OK); return true; } catch { return false; } });

// Matches any password-related error from pdf2json / pdfjs
const ENCRYPTED_RE = /password|NEED_PASSWORD|encrypted|no password given|incorrect password/i;

// ---------------------------------------------------------------------------
// isEncryptedPDF — checks first AND last 128 KB (trailer usually at end)
// ---------------------------------------------------------------------------
function isEncryptedPDF(filePath) {
  try {
    const stat = fs.statSync(filePath);
    const size = stat.size;
    const fd = fs.openSync(filePath, 'r');
    const chunkSize = Math.min(131072, size);
    const needle = Buffer.from('/Encrypt');

    const startBuf = Buffer.alloc(chunkSize);
    const startRead = fs.readSync(fd, startBuf, 0, chunkSize, 0);
    if (startBuf.slice(0, startRead).includes(needle)) { fs.closeSync(fd); return true; }

    if (size > chunkSize) {
      const endBuf = Buffer.alloc(chunkSize);
      const endRead = fs.readSync(fd, endBuf, 0, chunkSize, Math.max(0, size - chunkSize));
      if (endBuf.slice(0, endRead).includes(needle)) { fs.closeSync(fd); return true; }
    }

    fs.closeSync(fd);
    return false;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// pdftotext-based parser (primary — handles more PDF types)
// ---------------------------------------------------------------------------
function parsePDFWithPdftotext(filePath, password) {
  const args = ['-layout', '-enc', 'UTF-8'];
  if (password) { args.push('-upw', password); args.push('-opw', password); }
  args.push(filePath, '-');   // '-' = output to stdout

  // spawnSync captures both stdout AND stderr (pdftotext exits 0 even on password errors)
  const result = spawnSync(PDFTOTEXT_BIN, args, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, timeout: 30000 });
  const stderr = result.stderr || '';
  const stdout = result.stdout || '';

  // pdftotext signals password failure in stderr, even with exit code 0
  if (/incorrect password|no password/i.test(stderr) || /incorrect password|no password/i.test(stdout)) {
    const err = new Error('PDF ist passwortgeschützt');
    err.code = 'ENCRYPTED';
    throw err;
  }

  if (result.error) {
    throw new Error('pdftotext: ' + result.error.message);
  }

  if (result.status !== 0 && result.status !== null) {
    throw new Error('pdftotext exit ' + result.status + ': ' + stderr.slice(0, 200));
  }

  return { ok: true, text: stdout };
}

// ---------------------------------------------------------------------------
// pdf2json-based fallback parser
// ---------------------------------------------------------------------------
function extractTextFromPdf2json(pdfData) {
  const lines = [];
  for (const page of (pdfData.Pages || [])) {
    const texts = (page.Texts || []).map(t => ({
      y: t.y, x: t.x,
      text: (t.R || []).map(r => { try { return decodeURIComponent(r.T || ''); } catch { return r.T || ''; } }).join(''),
    }));
    texts.sort((a, b) => Math.round(a.y * 10) - Math.round(b.y * 10) || a.x - b.x);
    let lastY = -9999, line = '';
    for (const t of texts) {
      if (Math.abs(t.y - lastY) > 0.3) { if (line.trim()) lines.push(line.trim()); line = t.text; lastY = t.y; }
      else { line += ' ' + t.text; }
    }
    if (line.trim()) lines.push(line.trim());
  }
  return lines.join('\n');
}

function parsePDFWithPdf2json(filePath, password) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('PDF-Parsing Timeout (>30s)')), 30000);
    const parser = new PDFParser(null, 0, password || undefined);
    parser.on('pdfParser_dataError', errData => {
      clearTimeout(timeout);
      const msg = String(errData?.parserError || errData || 'Parse error');
      if (ENCRYPTED_RE.test(msg)) { const err = new Error('PDF ist passwortgeschützt'); err.code = 'ENCRYPTED'; reject(err); }
      else reject(new Error(msg));
    });
    parser.on('pdfParser_dataReady', pdfData => {
      clearTimeout(timeout);
      try { resolve(extractTextFromPdf2json(pdfData)); } catch (e) { reject(e); }
    });
    try { parser.loadPDF(filePath); } catch (e) {
      clearTimeout(timeout);
      const msg = String(e?.message || e || '');
      if (ENCRYPTED_RE.test(msg)) { const err = new Error('PDF ist passwortgeschützt'); err.code = 'ENCRYPTED'; reject(err); }
      else reject(new Error(msg));
    }
  });
}

// ---------------------------------------------------------------------------
// DATEV Lohnabrechnung detection + extraction
// Format: "Abrechnung der Brutto/Netto-Bezüge" (Form.-Nr. LNGN16)
// Produced by DATEV Lohn & Gehalt for regular employment payslips.
// ---------------------------------------------------------------------------
const GERMAN_MONTHS_MAP = {
  'januar': 1, 'februar': 2, 'märz': 3, 'maerz': 3, 'april': 4, 'mai': 5, 'juni': 6,
  'juli': 7, 'august': 8, 'september': 9, 'oktober': 10, 'november': 11, 'dezember': 12,
};

function isDATEVLohnabrechnung(text) {
  return /Abrechnung\s+der\s+Brutto\/Netto-Bez/i.test(text) ||
         /Form\.-Nr\.\s*LNGN/i.test(text);
}

// Helper: in DATEV layout-mode text, right-aligned labels appear at the end of
// a line; the matching right-aligned value is at the end of the NEXT non-empty
// line (up to 3 lines later).
function datevRightColValue(lines, labelRegex) {
  for (let i = 0; i < lines.length - 1; i++) {
    if (!labelRegex.test(lines[i])) continue;
    for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
      const line = lines[j];
      // Find all German-format numbers on this line
      const matches = [...line.matchAll(/([\d]{1,3}(?:\.[\d]{3})*),([\d]{2})/g)];
      if (matches.length > 0) {
        const last = matches[matches.length - 1];
        return parseFloat(last[1].replace(/\./g, '') + '.' + last[2]);
      }
    }
  }
  return null;
}

function parseDATEVLohnabrechnung(text) {
  const result = {};
  const lines = text.split('\n');

  // ── Arbeitgeber: "Megaherz GmbH*Str. 2*85774 Ort" — first segment before * ──
  const agM = text.match(/([A-ZÄÖÜa-zäöüß][^\n*]{2,60}?(?:GmbH|gGmbH|mbH|AG\b|KG\b|OHG\b|UG\b|e\.V\.))\s*\*/);
  if (agM) result.produktionsfirma = agM[1].trim();

  // ── Period: "für April 2026" or "für den Monat April 2026" ──────────────
  const monatM = text.match(
    /f[üu]r\s+(?:den\s+Monat\s+)?(Januar|Februar|M[äa]rz|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s+(\d{4})/i
  );
  if (monatM) {
    const key = monatM[1].toLowerCase().replace('ä', 'ä');
    const monatNr = GERMAN_MONTHS_MAP[key] || GERMAN_MONTHS_MAP[key.replace('ä', 'ae')];
    const yyyy = monatM[2];
    if (monatNr) {
      const lastDay = new Date(parseInt(yyyy), monatNr, 0).getDate();
      result.zeitraumVon = `01.${String(monatNr).padStart(2, '0')}.${yyyy}`;
      result.zeitraumBis = `${String(lastDay).padStart(2, '0')}.${String(monatNr).padStart(2, '0')}.${yyyy}`;
      result.datum       = result.zeitraumBis;
    }
  }

  // ── Override: actual work period from Meldebescheinigung ─────────────────
  // "Beschäftigungszeitraum  13.04.2026  bis  17.04.2026"
  const beschM = text.match(
    /Besch[äa]ftigungszeitraum\s+(\d{2}\.\d{2}\.\d{4})\s+(?:bis\s+)?(\d{2}\.\d{2}\.\d{4})/i
  );
  if (beschM) {
    result.zeitraumVon = beschM[1];
    result.zeitraumBis = beschM[2];
    result.datum       = beschM[2];
  }

  // ── Betrag: Lohnart "Gehalt" row — "0011 Gehalt … 1.890,00" ─────────────
  // This is the most direct source: last German-format number on the Gehalt row.
  const lohnM = text.match(/\d{4}\s+Gehalt[^\n]*([\d]{1,3}(?:\.[\d]{3})*),([\d]{2})\s*$/m);
  if (lohnM) result.betrag = parseFloat(lohnM[1].replace(/\./g, '') + '.' + lohnM[2]);

  // ── Gesamt-Brutto: right-column label → value on next non-empty line ──────
  if (!result.betrag) {
    const v = datevRightColValue(lines, /Gesamt-Brutto/i);
    if (v !== null) result.betrag = v;
  }

  // ── Netto-Verdienst: right-column value ───────────────────────────────────
  const nettoV = datevRightColValue(lines, /Netto-Verdienst/i);
  if (nettoV !== null) result.netto = nettoV;

  // ── Auszahlungsbetrag: right-column value ────────────────────────────────
  const auszV = datevRightColValue(lines, /Auszahlungsbetrag/i);
  if (auszV !== null) {
    result.auszahlung = auszV;
    if (!result.netto) result.netto = auszV;
  }

  // ── Name: employee address block — appears after "MXF" line (1-2 blank lines)
  // DATEV layout: "   MXF\n\n        Till Pallapies     Hinweise zur Abrechnung\n"
  // The name and other content share a line — capture up to first 3+ space gap.
  const nameM = text.match(/\bMXF\b[^\n]*\n(?:\s*\n)?\s{4,}([A-ZÄÖÜ][a-zäöüß]+(?:\s[A-ZÄÖÜ][a-zäöüß\-]+)+?)(?:\s{3,}|\n)/m);
  if (nameM) result.name = nameM[1].trim();

  // ── Tätigkeit: derive from Lohnart description ────────────────────────────
  if (!result.taetigkeit) result.taetigkeit = 'Gehalt';

  return result;
}

// ---------------------------------------------------------------------------
// Billing data extraction — heuristic regex on raw text
// Tuned for Sesam payslip format (UFA/DFFF/Lohnbüro) but works generally.
// Falls back to DATEV Lohnabrechnung detection when applicable.
// ---------------------------------------------------------------------------
function extractBillingData(text) {
  const result = {};
  const lines = text.split('\n');

  // ── DATEV Lohnabrechnung: run specialized parser first ───────────────────
  let isDATEV = false;
  if (isDATEVLohnabrechnung(text)) {
    isDATEV = true;
    Object.assign(result, parseDATEVLohnabrechnung(text));
  }

  // ── BRUTTO GAGE (Sesam label) ─────────────────────────────────────────────
  // "BRUTTO GAGE    966,20"  or  "BRUTTO GAGE   966.20"
  if (!result.betrag) {
    const bruttoGageMatch = text.match(/BRUTTO\s+GAGE\s+([\d.]+)[,.](\d{2})/i);
    if (bruttoGageMatch) {
      result.betrag = parseFloat(bruttoGageMatch[1].replace(/\./g, '') + '.' + bruttoGageMatch[2]);
    }
  }

  // ── Generic Bruttolohn fallback ───────────────────────────────────────────
  if (!result.betrag) {
    const m = text.match(
      /(?:Bruttolohn|Brutto(?:verdienst|gage|bezug|lohn)?|Gesamt(?:brutto|verdienst)?|Gesamtbetrag)\s*[:\-=]?\s*([\d.]+)[,\s](\d{2})/i
    );
    if (m) result.betrag = parseFloat(m[1].replace(/\./g, '') + '.' + m[2]);
  }

  // ── Dates: "von: 21.05.2026  bis: 24.05.2026" (Sesam) ────────────────────
  if (!result.zeitraumVon) {
    const vonMatch  = text.match(/\bvon\s*:\s*(\d{2}\.\d{2}\.\d{4})/i);
    const bisMatch  = text.match(/\bbis\s*:\s*(\d{2}\.\d{2}\.\d{4})/i);
    if (vonMatch && bisMatch) {
      result.zeitraumVon = vonMatch[1];
      result.zeitraumBis = bisMatch[1];
      result.datum       = bisMatch[1];   // use end date as billing date
    }
  }

  // ── Fallback: date range in header "21.05.2026-24.05.2026" ───────────────
  if (!result.zeitraumVon) {
    const rangeMatch = text.match(/(\d{2}\.\d{2}\.\d{4})\s*[-–]\s*(\d{2}\.\d{2}\.\d{4})/);
    if (rangeMatch) {
      result.zeitraumVon = rangeMatch[1];
      result.zeitraumBis = rangeMatch[2];
      result.datum       = rangeMatch[2];
    }
  }

  // ── Fallback: "Abrechnungsmonat MM/YYYY" or German month name ────────────
  if (!result.zeitraumVon) {
    const periodeMatch = text.match(
      /(?:Abrechnungs(?:zeitraum|monat|periode)?|Zeitraum|Monat|f[üu]r(?:\s+den\s+Monat)?)\s*[:.=]?\s*(\d{1,2})[.\/](\d{2,4})/i
    );
    if (periodeMatch) {
      const mm = periodeMatch[1].padStart(2, '0');
      let yyyy = periodeMatch[2];
      if (yyyy.length === 2) yyyy = '20' + yyyy;
      const lastDay = new Date(parseInt(yyyy), parseInt(mm), 0).getDate();
      result.zeitraumVon = `01.${mm}.${yyyy}`;
      result.zeitraumBis = `${lastDay}.${mm}.${yyyy}`;
      result.datum = `${lastDay}.${mm}.${yyyy}`;
    }
  }

  // ── Name: "für Till Pallapies" (Sesam) — skip for DATEV (would match month)
  if (!isDATEV && !result.name) {
    const fuerMatch = text.match(/f[üu]r\s+([A-ZÄÖÜ][a-zäöüß]+(?: [A-ZÄÖÜ][a-zäöüß\-]+)*)/);
    if (fuerMatch) result.name = fuerMatch[1].trim();
  }

  // ── Generic name fallback ─────────────────────────────────────────────────
  if (!result.name) {
    const nameMatch = text.match(
      /(?:Mitarbeiter(?:in)?|Arbeitnehmer(?:in)?|Name|AN)\s*[:.=]?\s*([A-ZÄÖÜ][a-zäöüß]+(?:[\s\-][A-ZÄÖÜ][a-zäöüß]+)+)/
    );
    if (nameMatch) result.name = nameMatch[1].trim();
  }

  // ── Projekt/Produktion: 'Prod "Herkunft"' or SESAM header last word ──────
  if (!result.projekt) {
    const prodTitelMatch = text.match(/Prod\s+"([^"]+)"/i) || text.match(/SESAM-Lohn[^\n]*\s(\S+)\s*$/m);
    if (prodTitelMatch) result.projekt = prodTitelMatch[1].trim();
  }

  // ── Company: "Lizenz: UFA Fiction GmbH" (Sesam footer) — stop at 3+ spaces
  if (!result.produktionsfirma) {
    const lizenzMatch = text.match(/Lizenz\s*:\s*(\S[^\n]*?)(?:\s{3,}|[•·]|$)/m);
    if (lizenzMatch) {
      result.produktionsfirma = lizenzMatch[1].trim().replace(/\s+/g, ' ');
    }
  }

  // ── Fallback: first line containing GmbH / AG / Film / Produktion ────────
  if (!result.produktionsfirma) {
    const firmaLine = lines.find(l =>
      /GmbH|AG\b|Film|Produktion|Production|UFA|Sesam/i.test(l) &&
      !/Ident|Pers|Steuer|Konto|IBAN/i.test(l)
    );
    if (firmaLine) result.produktionsfirma = firmaLine.replace(/\s+/g, ' ').trim().slice(0, 80);
  }

  // ── Generic Firma fallback ────────────────────────────────────────────────
  if (!result.produktionsfirma) {
    const firmaMatch = text.match(
      /(?:Produktionsfirma|Arbeitgeber(?:in)?|Firma|Auftraggeber|Produzent)\s*[:.=]?\s*(.{4,80})/i
    );
    if (firmaMatch) result.produktionsfirma = firmaMatch[1].trim().replace(/\s+/g, ' ');
  }

  // ── Netto + Auszahlung (extra info) ──────────────────────────────────────
  if (!result.netto) {
    const nettoMatch = text.match(/NETTO\s+GAGE\s+([\d.]+)[,.](\d{2})/i);
    if (nettoMatch) result.netto = parseFloat(nettoMatch[1].replace(/\./g, '') + '.' + nettoMatch[2]);
  }

  if (!result.auszahlung) {
    const auszMatch = text.match(/AUSZAHLUNG\s+([\d.]+)[,.](\d{2})/i);
    if (auszMatch) result.auszahlung = parseFloat(auszMatch[1].replace(/\./g, '') + '.' + auszMatch[2]);
  }

  // ── Tätigkeit ─────────────────────────────────────────────────────────────
  if (!result.taetigkeit) {
    const taetMatch = text.match(/T[äa]tigkeit\s*:\s*([^/\n]+)/i);
    if (taetMatch) result.taetigkeit = taetMatch[1].trim().replace(/\s+/g, ' ');
  }

  return result;
}

// ---------------------------------------------------------------------------
// extractAllBillingEntries — splits text by page (pdftotext uses \f) and
// extracts one billing entry per page that looks like a payslip.
// Returns an array with at least one entry.
// ---------------------------------------------------------------------------
function extractAllBillingEntries(text) {
  const pages = text.split('\f').map(p => p.trim()).filter(p => p.length > 0);

  if (pages.length <= 1) return [extractBillingData(text)];

  const billingPageRe = /BRUTTO\s+GAGE|Bruttolohn|Gesamt-Brutto|Form\.-Nr\.\s*LNGN/i;
  const entries = pages
    .filter(p => billingPageRe.test(p))
    .map(p => extractBillingData(p));

  return entries.length > 0 ? entries : [extractBillingData(text)];
}

// ---------------------------------------------------------------------------
// Public: parseBillingPDF
// ---------------------------------------------------------------------------
async function parseBillingPDF(filePath, password = null) {
  let text;

  if (PDFTOTEXT_BIN) {
    // Primary: pdftotext (poppler) — more robust, handles more PDF types
    const result = parsePDFWithPdftotext(filePath, password); // throws on encryption error
    text = result.text;
  } else {
    // Fallback: pdf2json
    text = await parsePDFWithPdf2json(filePath, password);
  }

  const entries = extractAllBillingEntries(text);
  return { text, entries };
}

// ---------------------------------------------------------------------------
// Sesam document parser — handles two formats:
//   1. Manual "Stundenzettel" (DATUM / ARBEITSBEGINN / ARBEITSENDE table)
//   2. Sesam "Arbeitszeiterfassung" (Rave Report: day-type annotations + approvals)
// ---------------------------------------------------------------------------

const DOW_DE = { Mo: 1, Di: 2, Mi: 3, Do: 4, Fr: 5, Sa: 6, So: 0 };

// Parse "DD.MM.YYYY" or "DD.MM.YY" to a JS Date (local midnight)
function parseGermanDateLocal(s) {
  if (!s) return null;
  const parts = s.split('.');
  if (parts.length < 3) return null;
  let y = parseInt(parts[2]);
  if (y < 100) y = 2000 + y;
  return new Date(y, parseInt(parts[1]) - 1, parseInt(parts[0]));
}

// Format a Date as "DD.MM.YYYY"
function formatGermanDate(d) {
  return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
}

// Advance date until it matches the target day-of-week (0=Sun … 6=Sat)
function nextDow(date, targetDow) {
  const d = new Date(date);
  while (d.getDay() !== targetDow) d.setDate(d.getDate() + 1);
  return d;
}

// Extract start date from filename: "Pallapies 160526.pdf" → "16.05.2026"
function dateFromFilename(filename) {
  // Match 6 digits: DDMMYY
  const m6 = filename.match(/(\d{2})(\d{2})(\d{2})(?:\.|$)/);
  if (m6) {
    const [, dd, mm, yy] = m6;
    return `${dd}.${mm}.${parseInt(yy) < 100 ? 2000 + parseInt(yy) : parseInt(yy)}`;
  }
  // Match 8 digits: DDMMYYYY
  const m8 = filename.match(/(\d{2})(\d{2})(\d{4})(?:\.|$)/);
  if (m8) {
    const [, dd, mm, yyyy] = m8;
    return `${dd}.${mm}.${yyyy}`;
  }
  return null;
}

// ── Format 1: Manual Stundenzettel ────────────────────────────────────────
function parseManualStundenzettel(text) {
  const result = { type: 'manual' };
  const lines = text.split('\n');

  const nameMatch = text.match(/^Name\s{2,}(.+)$/m);
  if (nameMatch) result.name = nameMatch[1].trim().replace(/\s+/g, ' ');

  const taetigkeitMatch = text.match(/^T[äa]tigkeit\s{2,}(.+?)(?:\s{4,}.*)?$/m);
  if (taetigkeitMatch) result.taetigkeit = taetigkeitMatch[1].trim().replace(/\s+/g, ' ');

  const prodMatch = text.match(/^Produktion\s{2,}(.+)$/m);
  if (prodMatch) result.produktion = prodMatch[1].trim().replace(/"/g, '').replace(/\s+/g, ' ');

  const vertragsMatch = text.match(/Vertrags-Nr\.\s+(\S+)/);
  if (vertragsMatch) result.vertragsNr = vertragsMatch[1].trim();

  const nameLineIdx = lines.findIndex(l => /^Name\s{2,}/m.test(l));
  if (nameLineIdx > 0) {
    const firmaLines = lines.slice(0, nameLineIdx).filter(l => l.trim() && !/^Stundenzettel\s*$/i.test(l.trim()));
    if (firmaLines.length) result.firma = firmaLines[0].trim().replace(/\s+/g, ' ');
  }

  // Table rows: DD.MM.YY  HH:MM  HH:MM  pause  hours  [overtime]
  const dayRe = /(\d{2}\.\d{2}\.\d{2,4})\s+(\d{1,2}:\d{2})\s+(\d{1,2}:\d{2})\s+([\d,.]+)\s+([\d,.]+)(?:\s+([\d,.]+))?/g;
  const days = [];
  let m;
  while ((m = dayRe.exec(text)) !== null) {
    const parts = m[1].split('.');
    let y = parseInt(parts[2]);
    if (y < 100) y = 2000 + y;
    days.push({
      datum: `${parts[0]}.${parts[1]}.${y}`,
      arbeitsbeginn: m[2],
      arbeitsende: m[3],
      pausendauer: parseFloat(m[4].replace(',', '.')),
      arbeitszeit: parseFloat(m[5].replace(',', '.')),
      ueberstunden: m[6] ? parseFloat(m[6].replace(',', '.')) : 0,
    });
  }
  result.days = days;
  return result;
}

// ── Format 2: Sesam Arbeitszeiterfassung (Rave Report) ───────────────────
// Extracts day-type entries like "Do: EFK", "Sa: Rückreise/Reisetag"
// and resolves actual dates from the filename or by advancing from a base date.
function parseArbeitszeiterfassung(text, filename = '') {
  const result = { type: 'arbeitszeiterfassung' };

  // Name from "Arbeitszeiterfassung (Pallapies, Till (PDM2193106))"
  const azMatch = text.match(/Arbeitszeiterfassung\s+\(([^,(]+),\s*([^,(]+?)(?:\s*\([^)]*\))?\s*\)/);
  if (azMatch) {
    // Sesam stores "Lastname, Firstname" — reverse it
    result.name = `${azMatch[2].trim()} ${azMatch[1].trim()}`;
  }

  // Project from SESAM header: "2026 PDM2193 Herkunft"
  const projMatch = text.match(/SESAM-Lohn\s*:\s*\d+\s+\S+\s+(.+?)(?:\s{3,}|\s*Beträge|\s*$)/m);
  if (projMatch) result.projekt = projMatch[1].trim();

  // Lizenz / Produktionsfirma
  const lizenzMatch = text.match(/Lizenz\s*:\s*(\S[^\n•]+?)(?:\s{3,}|•|$)/m);
  if (lizenzMatch) result.produktionsfirma = lizenzMatch[1].trim().replace(/\s+/g, ' ');

  // Approvals: "GENEHMIGT (FREIGABE BOHNDORF: 26.05.2026 / 17:13:47)"
  const approvals = [];
  const approvalRe = /GENEHMIGT\s+\(FREIGABE\s+([^:]+):\s*(\d{2}\.\d{2}\.\d{4})\s*\/\s*(\d{2}:\d{2})/g;
  let am;
  while ((am = approvalRe.exec(text)) !== null) {
    approvals.push({ person: am[1].trim(), datum: am[2], uhrzeit: am[3] });
  }
  result.approvals = approvals;

  // Day entries: "Do: EFK", "Sa: Rückreise/Reisetag", "So: Hinreise/Reisetag"
  const entryRe = /^(Mo|Di|Mi|Do|Fr|Sa|So)\s*:\s*(.+)$/mg;
  const rawEntries = [];
  let em;
  while ((em = entryRe.exec(text)) !== null) {
    rawEntries.push({ dow: em[1], beschreibung: em[2].trim() });
  }

  // Resolve actual dates from filename date + day-of-week
  const filenameDate = dateFromFilename(filename);
  const baseDate = filenameDate ? parseGermanDateLocal(filenameDate) : null;

  const days = [];
  if (baseDate && rawEntries.length > 0) {
    let cursor = new Date(baseDate);
    for (const entry of rawEntries) {
      const targetDow = DOW_DE[entry.dow];
      if (targetDow === undefined) continue;
      // Find next occurrence of this weekday from cursor (allowing same day)
      const d = nextDow(cursor, targetDow);
      // Fill in any skipped days between cursor and d as "(nicht extrahierbar)"
      const DOW_LABEL = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
      let gap = new Date(cursor);
      while (gap < d) {
        days.push({
          datum: formatGermanDate(gap),
          wochentag: DOW_LABEL[gap.getDay()],
          beschreibung: '',
          grafisch: true,
        });
        gap = new Date(gap);
        gap.setDate(gap.getDate() + 1);
      }
      days.push({ datum: formatGermanDate(d), wochentag: entry.dow, beschreibung: entry.beschreibung });
      // Advance cursor past this date
      cursor = new Date(d);
      cursor.setDate(cursor.getDate() + 1);
    }
  } else {
    // No date available — store without resolved date
    rawEntries.forEach(e => days.push({ datum: null, wochentag: e.dow, beschreibung: e.beschreibung }));
  }
  result.days = days;

  return result;
}

// ── Unified parser — auto-detects format ─────────────────────────────────
function parseSesamTimesheetData(text, filename = '') {
  // Arbeitszeiterfassung: contains "GENEHMIGT" and day-type entries (no DATUM/ARBEITSBEGINN table)
  const isAZ = /GENEHMIGT\s+\(FREIGABE/.test(text) && !/^Name\s{2,}/m.test(text);
  return isAZ ? parseArbeitszeiterfassung(text, filename) : parseManualStundenzettel(text);
}

async function parseSesamTimesheetPDF(filePath, password = null) {
  const filename = require('path').basename(filePath);
  let text;
  if (PDFTOTEXT_BIN) {
    const result = parsePDFWithPdftotext(filePath, password);
    text = result.text;
  } else {
    text = await parsePDFWithPdf2json(filePath, password);
  }
  const extracted = parseSesamTimesheetData(text, filename);

  // For AZE format: enrich days with OCR-extracted times (start, ende, stundenTotal, nacht25).
  // The visual table in AZE PDFs contains times not available in the text layer.
  if (extracted.type === 'arbeitszeiterfassung' && extracted.days?.length > 0) {
    try {
      const { parsePDF } = require('./pdfParser');
      const ocrResult = await parsePDF(filePath);
      if (ocrResult?.days?.length > 0) {
        for (const day of extracted.days) {
          if (!day.datum) continue;
          const ocrDay = ocrResult.days.find(d => d.datum === day.datum);
          if (!ocrDay) continue;
          if (ocrDay.start)       day.start       = ocrDay.start;
          if (ocrDay.ende)        day.ende        = ocrDay.ende;
          if (ocrDay.stundenTotal > 0) day.stundenTotal = ocrDay.stundenTotal;
          if (ocrDay.nacht25  > 0) day.nacht25    = ocrDay.nacht25;
          if (ocrDay.pause    > 0) day.pause      = ocrDay.pause;
        }
      }
    } catch (e) {
      // OCR enrichment failed — continue without times
      console.warn('AZE OCR enrichment failed:', e.message);
    }
  }

  return { text, ...extracted };
}

module.exports = { parseBillingPDF, isEncryptedPDF, parseSesamTimesheetPDF, parseSesamTimesheetData };

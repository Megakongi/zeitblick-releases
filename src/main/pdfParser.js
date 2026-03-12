const fs = require('fs');
const PDFParser = require('pdf2json');

/**
 * Universal timesheet PDF parser.
 * 
 * Instead of hardcoded x-positions, this parser:
 * 1. Detects table column headers dynamically by matching known patterns
 * 2. Builds column boundaries from detected headers
 * 3. Finds day rows by matching day names or date patterns
 * 4. Extracts header metadata by finding label:value pairs
 * 5. Detects the totals row by looking for "Summe"/"Total"/"Gesamt"
 *
 * This makes it work with different PDF layouts and column arrangements.
 */

// Known column header patterns → semantic name
const COLUMN_PATTERNS = [
  { key: 'tag',              patterns: [/^tag$/i, /^wochentag$/i, /^day$/i] },
  { key: 'datum',            patterns: [/^datum$/i, /^date$/i, /^dat\.?$/i] },
  { key: 'start',            patterns: [/^start$/i, /^beginn$/i, /^anfang$/i, /^von$/i, /^dienstbeginn$/i, /^ab$/i] },
  { key: 'ende',             patterns: [/^ende$/i, /^end$/i, /^bis$/i, /^dienstende$/i, /^schluss$/i] },
  { key: 'pause',            patterns: [/^pause$/i, /^pausen?zeit$/i, /^p\.?$/i, /^break$/i] },
  { key: 'stundenTotal',     patterns: [/^stunden/i, /^std\.?\s*total/i, /^total$/i, /^gesamt\s*std/i, /^arbeitszeit$/i, /^hours$/i, /^ges\.?\s*std/i, /^std\.?$/i, /^summe\s*std/i] },
  { key: 'ueberstunden25',   patterns: [/25\s*%/i, /^ü\s*25/i, /^25$/] },
  { key: 'ueberstunden50',   patterns: [/50\s*%/i, /^ü\s*50/i, /^50$/] },
  { key: 'ueberstunden100',  patterns: [/100\s*%/i, /^ü\s*100/i, /^100$/] },
  { key: 'nacht25',          patterns: [/nacht/i, /^n\s*25/i, /^nz/i, /night/i] },
  { key: 'fahrzeit',         patterns: [/^fahr/i, /^fz$/i, /^travel/i, /^reise/i, /^anfahrt/i] },
  { key: 'anmerkungen',      patterns: [/^anmerk/i, /^bemerk/i, /^notiz/i, /^kommentar/i, /^hinweis/i, /^notes?$/i, /^remark/i] },
];

// Patterns for header metadata fields
const HEADER_LABELS = [
  { key: 'projekt',           patterns: [/^projekt:?$/i, /^production:?$/i, /^titel:?$/i] },
  { key: 'projektnummer',     patterns: [/^projektnr\.?:?$/i, /^projektnummer:?$/i, /^prod\.?\s*nr\.?:?$/i] },
  { key: 'produktionsfirma',  patterns: [/^produktionsfirma:?$/i, /^produk/i, /^firma:?$/i, /^company:?$/i] },
  { key: 'name',              patterns: [/^name:?$/i, /^mitarbeiter:?$/i, /^employee:?$/i] },
  { key: 'position',          patterns: [/^position:?$/i, /^funktion:?$/i, /^rolle:?$/i] },
  { key: 'abteilung',         patterns: [/^abteilung:?$/i, /^department:?$/i, /^abt\.?:?$/i] },
  { key: 'pause',             patterns: [/^pause:?$/i] },
];

// Day name matching (full + abbreviated, German)
const DAY_NAMES_FULL = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const DAY_NAMES_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const DAY_NAMES_ALL = [...DAY_NAMES_FULL, ...DAY_NAMES_SHORT, 'Mo.', 'Di.', 'Mi.', 'Do.', 'Fr.', 'Sa.', 'So.'];

// Date pattern: dd.mm.yyyy or dd.mm.yy or dd.mm.
const DATE_REGEX = /^\d{1,2}\.\d{1,2}\.(\d{2,4})?$/;
// Time pattern: HH:MM or H:MM
const TIME_REGEX = /^\d{1,2}:\d{2}$/;

function parsePDF(filePath) {
  return new Promise((resolve, reject) => {
    const pdfParser = new PDFParser(null, 1);

    pdfParser.on('pdfParser_dataError', errData => {
      reject(new Error(errData.parserError));
    });

    pdfParser.on('pdfParser_dataReady', pdfData => {
      try {
        const result = extractTimesheetData(pdfData);
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });

    pdfParser.loadPDF(filePath);
  });
}

function decodeText(text) {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

function extractTimesheetData(pdfData) {
  const page = pdfData.Pages[0];
  if (!page) throw new Error('PDF hat keine Seiten');

  // Extract all text items with positions
  const items = page.Texts.map(t => ({
    x: t.x,
    y: t.y,
    text: decodeText(t.R.map(r => r.T).join(''))
  })).sort((a, b) => a.y - b.y || a.x - b.x);

  // Group items into rows by y-position
  const rows = groupIntoRows(items, 0.4);

  // Step 1: Detect column headers
  const { columns, headerRowY } = detectColumns(rows);

  // Step 2: Extract header metadata (everything above the table header)
  const header = extractHeader(rows, headerRowY);

  // Step 3: Extract day rows and totals row
  const { days, totals } = extractDaysAndTotals(rows, columns, headerRowY);

  // Step 4: If we have no columns detected, try legacy position-based fallback
  if (columns.length === 0) {
    return extractTimesheetLegacy(items, header);
  }

  // Step 5: Recalculate stundenTotal from start/end/pause for days where it's missing
  for (const day of days) {
    if (day.stundenTotal === 0 && day.start && day.ende) {
      const s = parseTimeValue(day.start);
      const e = parseTimeValue(day.ende);
      if (s !== null && e !== null) {
        let diff = e - s;
        if (diff < 0) diff += 24;
        diff -= day.pause || 0;
        day.stundenTotal = Math.max(0, Math.round(diff * 100) / 100);
      }
    }
  }

  // Step 6: Recompute totals from individual days if parsed totals are all zeros
  const daysSumHours = days.reduce((sum, d) => sum + (d.stundenTotal || 0), 0);
  if (totals.stundenTotal === 0 && daysSumHours > 0) {
    totals.stundenTotal = Math.round(daysSumHours * 100) / 100;
    totals.ueberstunden25 = Math.round(days.reduce((s, d) => s + (d.ueberstunden25 || 0), 0) * 100) / 100;
    totals.ueberstunden50 = Math.round(days.reduce((s, d) => s + (d.ueberstunden50 || 0), 0) * 100) / 100;
    totals.ueberstunden100 = Math.round(days.reduce((s, d) => s + (d.ueberstunden100 || 0), 0) * 100) / 100;
    totals.nacht25 = Math.round(days.reduce((s, d) => s + (d.nacht25 || 0), 0) * 100) / 100;
    totals.fahrzeit = Math.round(days.reduce((s, d) => s + (d.fahrzeit || 0), 0) * 100) / 100;
  }

  return {
    id: generateId(),
    importDate: new Date().toISOString(),
    filePath: '',
    ...header,
    days,
    totals,
  };
}

/**
 * Group text items into rows based on y-proximity
 */
function groupIntoRows(items, tolerance) {
  const rows = [];
  let currentRow = [];
  let currentY = null;

  for (const item of items) {
    if (currentY === null || Math.abs(item.y - currentY) <= tolerance) {
      currentRow.push(item);
      if (currentY === null) currentY = item.y;
    } else {
      if (currentRow.length > 0) rows.push({ y: currentY, items: currentRow.sort((a, b) => a.x - b.x) });
      currentRow = [item];
      currentY = item.y;
    }
  }
  if (currentRow.length > 0) rows.push({ y: currentY, items: currentRow.sort((a, b) => a.x - b.x) });
  return rows;
}

/**
 * Detect table columns by finding the header row.
 * Scans all rows for one that contains multiple recognized column headers.
 */
function detectColumns(rows) {
  let bestMatch = { columns: [], headerRowY: 0, score: 0 };

  for (const row of rows) {
    const matched = [];

    for (const item of row.items) {
      const text = item.text.trim();
      if (!text) continue;

      for (const colDef of COLUMN_PATTERNS) {
        if (colDef.patterns.some(p => p.test(text))) {
          matched.push({ key: colDef.key, x: item.x, text });
          break;
        }
      }
    }

    // Also check if a cell contains "Überstunden" as a group header above 25%/50%/100%
    // This is common — the header row might have "Überstunden" spanning multiple sub-columns
    
    if (matched.length > bestMatch.score) {
      bestMatch = { columns: matched, headerRowY: row.y, score: matched.length };
    }
  }

  // If the best row has fewer than 3 recognized columns, also look for a two-row header
  // (e.g., "Überstunden" on one row, "25%" "50%" "100%" on the next)
  if (bestMatch.score < 3) {
    for (let i = 0; i < rows.length - 1; i++) {
      const combined = [...rows[i].items, ...rows[i + 1].items];
      const matched = [];
      for (const item of combined) {
        const text = item.text.trim();
        if (!text) continue;
        for (const colDef of COLUMN_PATTERNS) {
          if (colDef.patterns.some(p => p.test(text))) {
            if (!matched.find(m => m.key === colDef.key)) {
              matched.push({ key: colDef.key, x: item.x, text });
            }
            break;
          }
        }
      }
      if (matched.length > bestMatch.score) {
        bestMatch = { columns: matched, headerRowY: Math.max(rows[i].y, rows[i + 1].y), score: matched.length };
      }
    }
  }

  // Sort columns by x-position and compute boundaries
  bestMatch.columns.sort((a, b) => a.x - b.x);

  // Post-process: resolve duplicate column keys using group headers from the row above.
  // E.g. Row above has "Überstunden" at x=26, "Nacht" at x=32, "Fahrzeit" at x=35
  // Row below has "25%" "50%" "100%" "25%" — the second "25" should be nacht25, not ueberstunden25
  const headerRowIdx = rows.findIndex(r => Math.abs(r.y - bestMatch.headerRowY) < 0.3);
  if (headerRowIdx > 0) {
    const rowAbove = rows[headerRowIdx - 1];
    // Find group headers in the row above
    const groupHeaders = [];
    for (const item of rowAbove.items) {
      const text = item.text.trim().toLowerCase();
      if (/nacht/i.test(text)) groupHeaders.push({ key: 'nacht', x: item.x });
      if (/fahr/i.test(text) || /^fz$/i.test(text) || /^reise/i.test(text) || /^travel/i.test(text)) groupHeaders.push({ key: 'fahrzeit', x: item.x });
      if (/überstunden/i.test(text) || /ueberstunden/i.test(text)) groupHeaders.push({ key: 'ueberstunden', x: item.x });
    }

    if (groupHeaders.length > 0) {
      // Resolve duplicate keys
      const seen = {};
      for (const col of bestMatch.columns) {
        if (seen[col.key]) {
          // Duplicate! Find the closest group header from the row above
          const closest = groupHeaders.reduce((best, gh) =>
            Math.abs(gh.x - col.x) < Math.abs(best.x - col.x) ? gh : best
          , groupHeaders[0]);
          if (closest.key === 'nacht' && col.key.startsWith('ueberstunden')) {
            col.key = 'nacht' + col.key.replace('ueberstunden', '');
            // nacht25 → nacht25, which is correct for our schema
            if (col.key === 'nacht50' || col.key === 'nacht100') col.key = 'nacht25'; // normalize
          }
        }
        seen[col.key] = true;
      }

      // Add missing columns from group headers (e.g. Fahrzeit with no sub-header)
      const existingKeys = new Set(bestMatch.columns.map(c => c.key));
      for (const gh of groupHeaders) {
        if (gh.key === 'fahrzeit' && !existingKeys.has('fahrzeit')) {
          bestMatch.columns.push({ key: 'fahrzeit', x: gh.x, text: 'Fahrzeit' });
          bestMatch.columns.sort((a, b) => a.x - b.x);
        }
      }
    }
  }

  return bestMatch;
}

/**
 * Extract header metadata from rows above the table header.
 */
function extractHeader(rows, headerRowY) {
  const header = {
    projekt: '',
    projektnummer: '',
    produktionsfirma: '',
    name: '',
    position: '',
    abteilung: '',
    pause: 0,
  };

  for (const row of rows) {
    if (row.y >= headerRowY - 0.5) break; // Stop at table header

    for (let i = 0; i < row.items.length; i++) {
      const text = row.items[i].text.trim().replace(/:$/, '');
      
      for (const labelDef of HEADER_LABELS) {
        if (labelDef.patterns.some(p => p.test(text + ':'))) {
          // Value is the next item(s) on the same row — but stop at the next recognized label
          // Also skip items at the same x-position (they are fragments of the label itself,
          // e.g. "Produkitons" + "ﬁ" + "rma:" all at x=15.3)
          const labelX = row.items[i].x;
          const valueItems = [];
          for (let j = i + 1; j < row.items.length; j++) {
            const itemText = row.items[j].text.trim();
            // Skip items at the same x-position as the label (fragments of split text)
            if (Math.abs(row.items[j].x - labelX) < 0.5) continue;
            const itemTextClean = itemText.replace(/:$/, '');
            // Check if this item is another known header label
            const isNextLabel = HEADER_LABELS.some(ld => ld.patterns.some(p => p.test(itemTextClean + ':')));
            if (isNextLabel) break; // Stop — this is a new label
            valueItems.push(itemText);
          }
          const value = valueItems.filter(Boolean).join(' ');
          
          if (labelDef.key === 'pause') {
            header.pause = parseFloat(value.replace(',', '.')) || 0;
          } else {
            header[labelDef.key] = value || header[labelDef.key];
          }
          break;
        }
      }
    }
  }

  // Fallback: if no "Name:" label found, look for a name-like pattern
  // (capitalized multi-word near top of document)
  if (!header.name) {
    for (const row of rows) {
      if (row.y >= headerRowY - 0.5) break;
      for (const item of row.items) {
        const text = item.text.trim();
        // Looks like a person name: "Vorname Nachname"
        if (/^[A-ZÄÖÜ][a-zäöüß]+\s+[A-ZÄÖÜ][a-zäöüß]+$/.test(text) && !header.name) {
          // Only use if it's not already matched as something else
          const isOtherField = Object.values(header).some(v => v === text);
          if (!isOtherField) header.name = text;
        }
      }
    }
  }

  return header;
}

/**
 * Given detected columns, determine which column a given x-position falls into.
 */
function classifyX(x, columns) {
  if (columns.length === 0) return null;

  // Find the column whose x is closest to this item, with boundaries
  // Each column "owns" the space from its x to halfway to the next column
  for (let i = columns.length - 1; i >= 0; i--) {
    const col = columns[i];
    const prevX = i > 0 ? columns[i - 1].x : -Infinity;
    const boundary = (prevX + col.x) / 2;
    if (x >= boundary) return col.key;
  }
  return null;
}

/**
 * Check if a row is a "day row" (starts with a day name or contains a date).
 */
function isDayRow(row) {
  for (const item of row.items) {
    const text = item.text.trim();
    if (DAY_NAMES_ALL.some(d => text === d)) return true;
    if (DATE_REGEX.test(text)) return true;
  }
  return false;
}

/**
 * Check if a row is a "totals row" (contains Summe/Total/Gesamt).
 */
function isTotalsRow(row) {
  for (const item of row.items) {
    const text = item.text.trim().toLowerCase();
    if (/^(summe|total|gesamt|zusammen|sum)$/i.test(text)) return true;
  }
  return false;
}

/**
 * Extract day data and totals from rows below the header.
 */
function extractDaysAndTotals(rows, columns, headerRowY) {
  const days = [];
  let totals = { stundenTotal: 0, ueberstunden25: 0, ueberstunden50: 0, ueberstunden100: 0, nacht25: 0, fahrzeit: 0 };

  // Only look at rows below the header
  const dataRows = rows.filter(r => r.y > headerRowY + 0.3);

  for (const row of dataRows) {
    if (isTotalsRow(row)) {
      // Parse totals
      totals = parseRowValues(row, columns, true);
      continue;
    }

    if (isDayRow(row)) {
      const day = parseRowValues(row, columns, false);
      days.push(day);
    }
  }

  return { days, totals };
}

/**
 * Parse numeric and text values from a row using detected column positions.
 */
function parseRowValues(row, columns, isTotals) {
  const result = {
    tag: '',
    datum: '',
    start: '',
    ende: '',
    pause: 0,
    stundenTotal: 0,
    ueberstunden25: 0,
    ueberstunden50: 0,
    ueberstunden100: 0,
    nacht25: 0,
    fahrzeit: 0,
    anmerkungen: '',
  };

  // For each item in the row, classify which column it belongs to
  for (const item of row.items) {
    const text = item.text.trim();
    if (!text) continue;

    // Check if it's a day name
    if (DAY_NAMES_ALL.some(d => text === d)) {
      result.tag = normalizeDayName(text);
      continue;
    }
    // Skip "Summe"/"Total"/"Gesamt" labels
    if (/^(summe|total|gesamt|zusammen|sum)$/i.test(text)) continue;

    const col = classifyX(item.x, columns);
    if (!col) {
      // If we can't classify, use heuristics
      if (DATE_REGEX.test(text)) {
        result.datum = text;
      } else if (TIME_REGEX.test(text) && !result.start) {
        result.start = text;
      } else if (TIME_REGEX.test(text) && result.start) {
        result.ende = text;
      }
      continue;
    }

    switch (col) {
      case 'tag':
        if (!result.tag) result.tag = normalizeDayName(text);
        break;
      case 'datum':
        result.datum = text;
        break;
      case 'start':
        result.start = text;
        break;
      case 'ende':
        result.ende = text;
        break;
      case 'pause':
        result.pause = parseNum(text);
        break;
      case 'stundenTotal':
        result.stundenTotal = parseNum(text);
        break;
      case 'ueberstunden25':
        result.ueberstunden25 = parseNum(text);
        break;
      case 'ueberstunden50':
        result.ueberstunden50 = parseNum(text);
        break;
      case 'ueberstunden100':
        result.ueberstunden100 = parseNum(text);
        break;
      case 'nacht25':
        result.nacht25 = parseNum(text);
        break;
      case 'fahrzeit':
        result.fahrzeit = parseNum(text);
        break;
      case 'anmerkungen':
        result.anmerkungen = (result.anmerkungen ? result.anmerkungen + ' ' : '') + text;
        break;
    }
  }

  // If no column was detected for date/time, try heuristic fallback within the row
  if (!result.datum && !isTotals) {
    const dateItem = row.items.find(it => DATE_REGEX.test(it.text.trim()));
    if (dateItem) result.datum = dateItem.text.trim();
  }
  if (!result.start && !isTotals) {
    const timeItems = row.items.filter(it => TIME_REGEX.test(it.text.trim()));
    if (timeItems.length >= 1) result.start = timeItems[0].text.trim();
    if (timeItems.length >= 2) result.ende = timeItems[1].text.trim();
  }

  if (isTotals) {
    return {
      stundenTotal: result.stundenTotal,
      ueberstunden25: result.ueberstunden25,
      ueberstunden50: result.ueberstunden50,
      ueberstunden100: result.ueberstunden100,
      nacht25: result.nacht25,
      fahrzeit: result.fahrzeit,
    };
  }

  return result;
}

function parseNum(text) {
  return parseFloat(text.replace(',', '.')) || 0;
}

/**
 * Parse a time string like "8:30" or "08:30" into decimal hours.
 */
function parseTimeValue(str) {
  if (!str) return null;
  const m = str.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1], 10) + parseInt(m[2], 10) / 60;
}

function normalizeDayName(text) {
  const cleaned = text.replace('.', '').trim();
  const shortMap = { 'Mo': 'Montag', 'Di': 'Dienstag', 'Mi': 'Mittwoch', 'Do': 'Donnerstag', 'Fr': 'Freitag', 'Sa': 'Samstag', 'So': 'Sonntag' };
  return shortMap[cleaned] || (DAY_NAMES_FULL.includes(cleaned) ? cleaned : text);
}

/**
 * Legacy fallback for PDFs where no column headers were detected.
 * Uses the original hardcoded x-position approach.
 */
function extractTimesheetLegacy(items, header) {
  const days = [];

  for (const dayName of DAY_NAMES_FULL) {
    const dayItem = items.find(it => it.text.trim() === dayName);
    if (!dayItem) continue;

    const y = dayItem.y;
    const tolerance = 0.3;
    const rowItems = items.filter(it => Math.abs(it.y - y) < tolerance);

    const day = {
      tag: dayName, datum: '', start: '', ende: '', pause: 0,
      stundenTotal: 0, ueberstunden25: 0, ueberstunden50: 0,
      ueberstunden100: 0, nacht25: 0, fahrzeit: 0, anmerkungen: '',
    };

    for (const ri of rowItems) {
      const x = ri.x;
      const text = ri.text.trim();
      if (!text || text === dayName) continue;

      if (DATE_REGEX.test(text)) { day.datum = text; }
      else if (TIME_REGEX.test(text) && !day.start) { day.start = text; }
      else if (TIME_REGEX.test(text) && day.start) { day.ende = text; }
      else if (x >= 18 && x < 21) { day.pause = parseNum(text); }
      else if (x >= 21 && x < 24.5) { day.stundenTotal = parseNum(text); }
      else if (x >= 24.5 && x < 27) { day.ueberstunden25 = parseNum(text); }
      else if (x >= 27 && x < 29.5) { day.ueberstunden50 = parseNum(text); }
      else if (x >= 29.5 && x < 32) { day.ueberstunden100 = parseNum(text); }
      else if (x >= 32 && x < 35) { day.nacht25 = parseNum(text); }
      else if (x >= 35 && x < 38) { day.fahrzeit = parseNum(text); }
      else if (x >= 38) { day.anmerkungen = (day.anmerkungen ? day.anmerkungen + ' ' : '') + text; }
    }

    days.push(day);
  }

  // Recalculate stundenTotal from start/end/pause for days where it's missing (legacy path)
  for (const day of days) {
    if (day.stundenTotal === 0 && day.start && day.ende) {
      const s = parseTimeValue(day.start);
      const e = parseTimeValue(day.ende);
      if (s !== null && e !== null) {
        let diff = e - s;
        if (diff < 0) diff += 24;
        diff -= day.pause || 0;
        day.stundenTotal = Math.max(0, Math.round(diff * 100) / 100);
      }
    }
  }

  // Try to find totals row
  const sonntagItem = items.find(it => it.text.trim() === 'Sonntag');
  const totals = { stundenTotal: 0, ueberstunden25: 0, ueberstunden50: 0, ueberstunden100: 0, nacht25: 0, fahrzeit: 0 };
  
  if (sonntagItem) {
    const totalsY = sonntagItem.y + 1.3;
    const tolerance = 0.5;
    const totalsItems = items.filter(it => Math.abs(it.y - totalsY) < tolerance);
    for (const ti of totalsItems) {
      const x = ti.x;
      const val = parseNum(ti.text.trim());
      if (x >= 21 && x < 24.5) totals.stundenTotal = val;
      else if (x >= 24.5 && x < 27) totals.ueberstunden25 = val;
      else if (x >= 27 && x < 29.5) totals.ueberstunden50 = val;
      else if (x >= 29.5 && x < 32) totals.ueberstunden100 = val;
      else if (x >= 32 && x < 35) totals.nacht25 = val;
      else if (x >= 35 && x < 38) totals.fahrzeit = val;
    }
  }

  // Recompute totals from individual days if parsed totals are all zeros (legacy path)
  const daysSumHoursLegacy = days.reduce((sum, d) => sum + (d.stundenTotal || 0), 0);
  if (totals.stundenTotal === 0 && daysSumHoursLegacy > 0) {
    totals.stundenTotal = Math.round(daysSumHoursLegacy * 100) / 100;
    totals.ueberstunden25 = Math.round(days.reduce((s, d) => s + (d.ueberstunden25 || 0), 0) * 100) / 100;
    totals.ueberstunden50 = Math.round(days.reduce((s, d) => s + (d.ueberstunden50 || 0), 0) * 100) / 100;
    totals.ueberstunden100 = Math.round(days.reduce((s, d) => s + (d.ueberstunden100 || 0), 0) * 100) / 100;
    totals.nacht25 = Math.round(days.reduce((s, d) => s + (d.nacht25 || 0), 0) * 100) / 100;
    totals.fahrzeit = Math.round(days.reduce((s, d) => s + (d.fahrzeit || 0), 0) * 100) / 100;
  }

  return {
    id: generateId(),
    importDate: new Date().toISOString(),
    filePath: '',
    ...header,
    days,
    totals,
  };
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

module.exports = { parsePDF };

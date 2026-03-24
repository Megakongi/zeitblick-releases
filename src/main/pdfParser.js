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
  { key: 'projekt',           patterns: [/^projekt:?$/i, /^production:?$/i, /^titel:?$/i, /^project:?$/i] },
  { key: 'projektnummer',     patterns: [/^projektnr\.?:?$/i, /^projektnummer:?$/i, /^prod\.?\s*nr\.?:?$/i] },
  { key: 'produktionsfirma',  patterns: [/^produktionsfirma:?$/i, /^firma:?$/i, /^company:?$/i, /^auftraggeber:?$/i, /^herstellungsleitung:?$/i] },
  { key: 'name',              patterns: [/^name:?$/i, /^mitarbeiter:?$/i, /^employee:?$/i] },
  { key: 'position',          patterns: [/^position:?$/i, /^funktion:?$/i, /^rolle:?$/i, /^job:?$/i, /^gewerk:?$/i, /^t[äa]tigkeit:?$/i, /^beruf:?$/i] },
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
        const result = extractTimesheetData(pdfData, filePath);
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

function extractTimesheetData(pdfData, filePath) {
  const page = pdfData.Pages[0];
  if (!page) throw new Error('PDF hat keine Seiten');

  // Extract PDF metadata for fallback header extraction
  const pdfMeta = pdfData.Meta || {};

  // Extract all text items with positions
  const items = page.Texts.map(t => ({
    x: t.x,
    y: t.y,
    text: decodeText(t.R.map(r => r.T).join(''))
  })).sort((a, b) => a.y - b.y || a.x - b.x);

  // Check for form-field PDF: many items at negative coordinates
  const formFieldItems = items.filter(it => it.y < 0 || it.x < 0);
  const positionedItems = items.filter(it => it.y >= 0 && it.x >= 0);
  if (formFieldItems.length > 10) {
    // Detect "flat" form PDFs where all items share identical coordinates
    // (no position data at all, purely sequential form fields)
    if (positionedItems.length === 0) {
      return extractTimesheetFromFlatFormPDF(formFieldItems, pdfMeta, filePath);
    }
    return extractTimesheetFromFormPDF(formFieldItems, positionedItems, pdfMeta, filePath);
  }

  // Group items into rows by y-position
  const rows = groupIntoRows(items, 0.4);

  // Step 1: Detect column headers
  const { columns, headerRowY } = detectColumns(rows);

  // Step 2: Extract header metadata (everything above the table header)
  const header = extractHeader(rows, headerRowY);

  // Fallback: extract header from PDF metadata and filename
  extractHeaderFromMetaAndFilename(pdfMeta, filePath, header);

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

    // First, concatenate all items in this row to try matching against full row text.
    // This handles cases where a label like "Produktionsfirma:" is split across
    // multiple text items (e.g. "Produktions" + "ﬁ" + "rma:").
    const fullRowText = row.items.map(it => it.text.trim()).join(' ').trim();
    
    // Try matching "Label: Value" or "Label:Value" patterns in the full row text
    for (const labelDef of HEADER_LABELS) {
      if (header[labelDef.key] && labelDef.key !== 'pause') continue; // Already found
      for (const pattern of labelDef.patterns) {
        // Build a regex that finds the label followed by a value in the full row text
        const labelSource = pattern.source.replace(/^\^/, '').replace(/\$$/, '').replace(/:?\$$/, '').replace(/:\?/, '');
        const rowMatch = new RegExp(labelSource + ':?\\s+(.+?)(?:\\s+(?:' + 
          HEADER_LABELS.map(ld => ld.patterns.map(p => p.source.replace(/^\^/, '').replace(/\$$/, '').replace(/:?\$$/, '').replace(/:\?/, '')).join('|')).join('|') + 
          '):|$)', 'i').exec(fullRowText);
        if (rowMatch && rowMatch[1]) {
          const value = rowMatch[1].replace(/:$/, '').trim();
          if (value) {
            if (labelDef.key === 'pause') {
              header.pause = parseFloat(value.replace(',', '.')) || 0;
            } else {
              header[labelDef.key] = value;
            }
            break;
          }
        }
      }
    }

    // Also try the item-by-item approach for each row item
    for (let i = 0; i < row.items.length; i++) {
      const text = row.items[i].text.trim().replace(/:$/, '');
      
      // Also try concatenating adjacent items at similar x to reconstruct split labels
      // e.g. "Produktions" + "ﬁ" + "rma:" at x≈15
      let combinedLabel = text;
      let lastLabelIdx = i;
      const labelX = row.items[i].x;
      for (let k = i + 1; k < row.items.length; k++) {
        if (Math.abs(row.items[k].x - labelX) < 1.5) {
          combinedLabel += row.items[k].text.trim();
          lastLabelIdx = k;
        } else {
          break;
        }
      }
      combinedLabel = combinedLabel.replace(/:$/, '');

      for (const labelDef of HEADER_LABELS) {
        if (header[labelDef.key] && labelDef.key !== 'pause') continue; // Already found
        
        // Try both single item text and combined label
        const matched = labelDef.patterns.some(p => p.test(text + ':')) || 
                        labelDef.patterns.some(p => p.test(combinedLabel + ':'));
        if (matched) {
          // Value is the next item(s) on the same row — but stop at the next recognized label
          const valueItems = [];
          for (let j = lastLabelIdx + 1; j < row.items.length; j++) {
            const itemText = row.items[j].text.trim();
            // Skip items very close to the label x (fragments of split text)
            if (Math.abs(row.items[j].x - labelX) < 1.5) continue;
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
    // Words commonly found in column headers or table labels that are NOT person names
    const nonNameWords = /^(tägliche|wöchentliche|mehrarbeit|arbeits|abzüglich|überstunden|nacht|ruhezeit|anteilige|bezahlte|teilnahme|bemerkungen|zuschläge|fahrzeit|catering|sonstiges|summe|gesamt|total|pause|beginn|ende|datum|stunden|arbeitszeit|dienstbeginn|dienstende)\b/i;
    
    for (const row of rows) {
      if (row.y >= headerRowY - 0.5) break;
      for (const item of row.items) {
        const text = item.text.trim();
        // Looks like a person name: "Vorname Nachname" (supports hyphenated names)
        if (/^[A-ZÄÖÜ][a-zäöüß]+(?:-[A-ZÄÖÜ][a-zäöüß]+)?\s+[A-ZÄÖÜ][a-zäöüß]+(?:-[A-ZÄÖÜ][a-zäöüß]+)?$/.test(text) && !header.name) {
          // Exclude known non-name column header words
          const words = text.split(/\s+/);
          if (words.some(w => nonNameWords.test(w))) continue;
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

/**
 * Parse a form-field-based PDF where cell values are stored at negative coordinates
 * (y < 0) while labels, day names, dates, and Fahrzeit arrows are positioned normally.
 */
function extractTimesheetFromFormPDF(formFieldItems, positionedItems, pdfMeta, filePath) {
  // --- Step 0: Extract header metadata from positioned items ---
  const merged = mergeFragmentedTexts(positionedItems);
  const headerRows = groupIntoRows(merged, 0.4);
  // Find the first day row to determine where the header ends
  const dayOrder = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
  let firstDayY = Infinity;
  for (const item of merged) {
    if (dayOrder.includes(item.text.trim())) {
      firstDayY = Math.min(firstDayY, item.y);
    }
  }
  // Also detect column header row from positioned items
  const { headerRowY: posHeaderRowY } = detectColumns(headerRows);
  const headerCutoffY = Math.min(
    firstDayY !== Infinity ? firstDayY : Infinity,
    posHeaderRowY > 0 ? posHeaderRowY : Infinity
  );
  const header = extractHeader(headerRows, headerCutoffY !== Infinity ? headerCutoffY : firstDayY);

  // Also try to extract header from form-field items (before first day type)
  extractHeaderFromFormFields(formFieldItems.map(it => it.text), header);

  // Fallback: extract header from PDF metadata and filename
  extractHeaderFromMetaAndFilename(pdfMeta, filePath, header);

  // --- Step 1: Build day info from positioned items ---

  // Find day names and their dates from positioned items
  const dayInfos = extractDayInfoFromPositioned(merged);

  // Extract Fahrzeit from arrows (→/←) at each day's y-position
  extractFahrzeitFromPositioned(merged, dayInfos);

  // Extract Saturday surcharge data from positioned items (anteilige Zuschläge column ~x=32)
  extractPositionedSurcharges(merged, dayInfos);

  // --- Step 2: Parse form-field values sequentially ---
  const formTexts = formFieldItems.map(it => it.text);
  const dayBlocks = parseFormFieldDayBlocks(formTexts);

  // --- Step 3: Merge form-field day blocks with positioned day info ---
  // Match blocks to dayInfos by order (form blocks only exist for worked days)
  const days = [];
  let blockIdx = 0;

  for (const info of dayInfos) {
    const day = {
      tag: info.tag,
      datum: info.datum || '',
      start: '',
      ende: '',
      pause: 0,
      stundenTotal: 0,
      ueberstunden25: 0,
      ueberstunden50: 0,
      ueberstunden100: 0,
      nacht25: 0,
      fahrzeit: info.fahrzeit || 0,
      anmerkungen: '',
    };

    if (blockIdx < dayBlocks.length) {
      const block = dayBlocks[blockIdx];
      day.start = block.start || '';
      day.ende = block.ende || '';
      day.pause = block.pause || 0;
      day.stundenTotal = block.stundenTotal || 0;
      day.anmerkungen = block.anmerkungen || '';

      // Recalculate OT and night hours from start/end using TV-FFS rules
      // This is more reliable than parsing the complex surcharge column structure
      if (day.stundenTotal > 0) {
        day.ueberstunden25 = round2(Math.max(0, Math.min(day.stundenTotal - 10, 1)));
        day.ueberstunden50 = round2(Math.max(0, day.stundenTotal - 11));
      }
      day.nacht25 = calcNightHoursFromTimes(day.start, day.ende);

      // Saturday surcharge from form data "Sa: X:XX"
      if (block.samstagStunden > 0) {
        const saNote = `Sa: ${formatTimeValue(block.samstagStunden)}`;
        day.anmerkungen = day.anmerkungen ? day.anmerkungen + ' / ' + saNote : saNote;
      }

      blockIdx++;
    }

    // Override Fahrzeit from positioned data if available
    if (info.fahrzeit > 0) {
      day.fahrzeit = info.fahrzeit;
    }

    // Merge positioned surcharge info (e.g., Samstag surcharge time)
    if (info.samstagStunden > 0 && !day.anmerkungen.includes('Sa:')) {
      const saNote = `Sa: ${formatTimeValue(info.samstagStunden)}`;
      day.anmerkungen = day.anmerkungen ? day.anmerkungen + ' / ' + saNote : saNote;
    }

    // Recalculate stundenTotal from start/end/pause if missing
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

    days.push(day);
  }

  // Build totals from individual days
  const totals = {
    stundenTotal: round2(days.reduce((s, d) => s + (d.stundenTotal || 0), 0)),
    ueberstunden25: round2(days.reduce((s, d) => s + (d.ueberstunden25 || 0), 0)),
    ueberstunden50: round2(days.reduce((s, d) => s + (d.ueberstunden50 || 0), 0)),
    ueberstunden100: round2(days.reduce((s, d) => s + (d.ueberstunden100 || 0), 0)),
    nacht25: round2(days.reduce((s, d) => s + (d.nacht25 || 0), 0)),
    fahrzeit: round2(days.reduce((s, d) => s + (d.fahrzeit || 0), 0)),
  };

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
 * Extract header metadata from form-field text items (before the first day type).
 * Form-field PDFs store values sequentially; the header items appear before day blocks.
 * We look for known label patterns and take the following text as the value.
 */
function extractHeaderFromFormFields(formTexts, header) {
  const dayTypes = /^(arbeitstag|drehtag|feiertag|frei|ruhetag|krank|urlaub|azv|reisetag|bereitschaft|probe|reise|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)$/i;

  // Only look at items before the first day type
  let endIdx = formTexts.length;
  for (let i = 0; i < formTexts.length; i++) {
    if (dayTypes.test(formTexts[i].trim())) {
      endIdx = i;
      break;
    }
  }

  const headerTexts = formTexts.slice(0, endIdx).map(t => t.trim()).filter(Boolean);

  // Try to match "Label:" followed by a value
  for (let i = 0; i < headerTexts.length; i++) {
    const text = headerTexts[i].replace(/:$/, '');

    for (const labelDef of HEADER_LABELS) {
      if (header[labelDef.key] && labelDef.key !== 'pause') continue; // Already found from positioned items
      if (labelDef.patterns.some(p => p.test(text + ':'))) {
        // The value is the next non-label item
        if (i + 1 < headerTexts.length) {
          const nextText = headerTexts[i + 1].replace(/:$/, '');
          // Make sure the next item is not itself a label
          const nextIsLabel = HEADER_LABELS.some(ld => ld.patterns.some(p => p.test(nextText + ':')));
          if (!nextIsLabel && nextText.length > 0) {
            if (labelDef.key === 'pause') {
              header.pause = parseFloat(nextText.replace(',', '.')) || 0;
            } else {
              header[labelDef.key] = nextText;
            }
          }
        }
        break;
      }
    }
  }

  // Also try to find "Label: Value" combined in a single text item
  for (const text of headerTexts) {
    for (const labelDef of HEADER_LABELS) {
      if (header[labelDef.key] && labelDef.key !== 'pause') continue;
      for (const pattern of labelDef.patterns) {
        const src = pattern.source.replace(/^\^/, '').replace(/\$$/, '').replace(/:?\$$/, '').replace(/:\?/, '');
        const combinedMatch = new RegExp(src + ':?\\s+(.+)', 'i').exec(text);
        if (combinedMatch && combinedMatch[1]) {
          const value = combinedMatch[1].trim();
          if (value) {
            if (labelDef.key === 'pause') {
              header.pause = parseFloat(value.replace(',', '.')) || 0;
            } else {
              header[labelDef.key] = value;
            }
            break;
          }
        }
      }
    }
  }
}

/**
 * Extract header metadata from PDF metadata and filename as fallback.
 * Only fills in fields that are still empty.
 * 
 * PDF metadata fields used:
 * - Author → name
 * - Subject → projekt or produktionsfirma
 * 
 * Filename patterns (common in production timesheets):
 * - "Name-Project-DateRange.pdf" 
 * - "X-Lastname-Project Name S1-MM.DD-MM.DD.YYYY.pdf"
 */
function extractHeaderFromMetaAndFilename(pdfMeta, filePath, header) {
  if (!pdfMeta && !filePath) return;

  // Extract from filename FIRST (more reliable for name than PDF Author metadata,
  // which often contains whoever created/exported the PDF, not the timesheet owner)
  if (filePath) {
    const path = require('path');
    const basename = path.basename(filePath, path.extname(filePath));

    // Pattern 1: "YYYY_KWXX_FirstnameLastname" or "YYYY_KWXX_Firstname_Lastname"
    // e.g. "2025_KW45_FabianZenker" or "2025_KW45_Fabian_Zenker"
    const kwNameMatch = basename.match(/\d{4}[_-]KW\s*\d+[_-](.+)/i);
    if (kwNameMatch && !header.name) {
      let nameCandidate = kwNameMatch[1].replace(/[_-]/g, ' ').trim();
      // Split camelCase "FabianZenker" → "Fabian Zenker"
      nameCandidate = nameCandidate.replace(/([a-zäöüß])([A-ZÄÖÜ])/g, '$1 $2');
      if (nameCandidate.length >= 3) {
        header.name = nameCandidate;
      }
    }

    // Pattern 2: "Initial-Lastname-Project Name-DateRange"
    // e.g. "A-Streckmann-Babylon Berlin S5-04.07-04.13.2025"
    // Also: "Lastname-Project-DateRange" or "Name_Project_DateRange"
    
    // Remove date range parts from end (dd.mm-dd.mm.yyyy or similar)
    const withoutDates = basename.replace(/-?\d{1,2}\.\d{1,2}[-–]\d{1,2}\.\d{1,2}\.\d{4}$/, '')
                                  .replace(/-?\d{1,2}\.\d{1,2}\.\d{4}[-–]\d{1,2}\.\d{1,2}\.\d{4}$/, '')
                                  .replace(/[-_]?KW\s*\d+.*$/i, '')
                                  .trim();

    if (withoutDates) {
      // Try splitting by "-" to extract name and project
      const parts = withoutDates.split('-').map(p => p.trim()).filter(Boolean);

      if (parts.length >= 2) {
        // First part(s) are typically the name, last part is the project
        // Check if first part is a single letter (initial)
        if (parts[0].length <= 2 && parts.length >= 3) {
          // "A-Streckmann-Babylon Berlin S5" → name = "A. Streckmann", project = "Babylon Berlin S5"
          if (!header.name) {
            header.name = parts[0] + '. ' + parts[1];
          }
          if (!header.projekt) {
            header.projekt = parts.slice(2).join(' - ');
          }
        } else if (parts.length >= 2) {
          // "Streckmann-Babylon Berlin S5" → try to figure out name vs project
          // If the first part looks like a name (single word, capitalized)
          if (/^[A-ZÄÖÜ][a-zäöüß]+$/.test(parts[0])) {
            if (!header.name) header.name = parts[0];
            if (!header.projekt) header.projekt = parts.slice(1).join(' - ');
          }
        }
      }
    }
  }

  // Extract from PDF metadata LAST (lowest priority — Author often contains the
  // person who created/exported the PDF template, not the timesheet owner)
  if (pdfMeta) {
    if (!header.name && pdfMeta.Author) {
      header.name = pdfMeta.Author;
    }
    if (!header.projekt && pdfMeta.Subject) {
      header.projekt = pdfMeta.Subject;
    }
  }
}

/**
 * Parse a "flat" form-field PDF where ALL items share identical coordinates.
 * These PDFs store everything as sequential form field values with no position data.
 * 
 * Typical structure (sequential):
 * 1. Header labels: "PRODUKTION:", "NAME:", "Tätigkeit:", ...
 * 2. Column headers: "Wochentag", "Datum", "Arbeitsbeginn", ...
 * 3. Day blocks: DayName, Date, Start, End, Hours, Pause, Catering, Total, [Remarks]
 * 4. Totals (standalone number)
 * 5. Footer text
 * 6. Header VALUES (project, name, position) — appear AFTER footer
 * 7. Boilerplate / date range info
 */
function extractTimesheetFromFlatFormPDF(formFieldItems, pdfMeta, filePath) {
  const texts = formFieldItems.map(it => it.text.trim());
  const dayOrder = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
  const dateRegex = /^\d{1,2}\.\d{1,2}\.\d{2,4}$/;
  const timeRegex = /^\d{1,2}:\d{2}$/;
  const numberRegex = /^\d+([,.]\d+)?$/;

  // --- Step 1: Find day blocks ---
  const days = [];
  let i = 0;

  // Skip until first day name
  while (i < texts.length && !dayOrder.includes(texts[i])) i++;

  while (i < texts.length) {
    const dayName = texts[i];
    if (!dayOrder.includes(dayName)) break; // past the day section

    const day = {
      tag: dayName,
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

    i++; // move past day name

    // Next should be date
    if (i < texts.length && dateRegex.test(texts[i])) {
      day.datum = texts[i];
      i++;
    }

    // Check if this is a non-working day (next items are empty/spaces or another day name)
    if (i < texts.length && (!texts[i] || texts[i] === ' ' || dayOrder.includes(texts[i]))) {
      // Skip empty values for non-working days
      while (i < texts.length && (texts[i] === '' || texts[i] === ' ') && !dayOrder.includes(texts[i])) i++;
      days.push(day);
      continue;
    }

    // Working day: extract Start, End, Hours, Pause, Catering, Total, [Remarks]
    const values = [];
    while (i < texts.length && !dayOrder.includes(texts[i])) {
      const t = texts[i];
      // Stop if we hit totals/footer markers
      if (/^(köln|ort|unterschrift|genehmigt|bereich|achtung)/i.test(t)) break;
      // Stop at standalone large number that looks like weekly total (no day context)
      if (numberRegex.test(t.replace(',', '.')) && values.length >= 5 && !timeRegex.test(t)) {
        // This might be the daily total — check if next is another day or totals section
        values.push(t);
        i++;
        // Peek: if next is a day name or footer, we're done with this day
        if (i < texts.length && (dayOrder.includes(texts[i]) || /^(köln|ort|unterschrift|genehmigt|bereich|achtung|\d+[,.]\d+$)/i.test(texts[i].trim()))) {
          break;
        }
        // Otherwise it might be remarks
        continue;
      }
      values.push(t);
      i++;
    }

    // Parse the collected values
    // Expected order: start, end, hours, pause, catering(ja/nein), total, [remarks...]
    let vi = 0;
    if (vi < values.length && timeRegex.test(values[vi])) { day.start = values[vi]; vi++; }
    if (vi < values.length && timeRegex.test(values[vi])) { day.ende = values[vi]; vi++; }

    // Hours worked (raw, before pause deduction)
    if (vi < values.length && numberRegex.test(values[vi].replace(',', '.'))) {
      vi++; // skip raw hours (we'll use the total instead)
    }

    // Pause
    if (vi < values.length && numberRegex.test(values[vi].replace(',', '.'))) {
      day.pause = parseFloat(values[vi].replace(',', '.')) || 0;
      vi++;
    }

    // Catering flag (ja/nein)
    if (vi < values.length && /^(ja|nein)$/i.test(values[vi])) { vi++; }

    // Total hours (after pause deduction)
    if (vi < values.length && numberRegex.test(values[vi].replace(',', '.'))) {
      day.stundenTotal = parseFloat(values[vi].replace(',', '.')) || 0;
      vi++;
    }

    // Remaining values are remarks
    const remarks = [];
    while (vi < values.length) {
      const v = values[vi];
      if (v && v !== ' ') remarks.push(v);
      vi++;
    }
    if (remarks.length > 0) day.anmerkungen = remarks.join(' ');

    // Calculate overtime (TV-FFS rules: >10h = 25%, >11h = 50%)
    if (day.stundenTotal > 10) {
      day.ueberstunden25 = round2(Math.min(day.stundenTotal - 10, 1));
      day.ueberstunden50 = round2(Math.max(0, day.stundenTotal - 11));
    }

    // Calculate night hours
    day.nacht25 = calcNightHoursFromTimes(day.start, day.ende);

    days.push(day);
  }

  // --- Step 2: Find weekly total ---
  // After the last day, look for a standalone number = weekly total
  while (i < texts.length && !numberRegex.test(texts[i].replace(',', '.'))) i++;
  let weeklyTotal = 0;
  if (i < texts.length && numberRegex.test(texts[i].replace(',', '.'))) {
    weeklyTotal = parseFloat(texts[i].replace(',', '.')) || 0;
  }

  // --- Step 3: Extract header info from the tail of the document ---
  // In these flat PDFs, the actual values (project, name, position) appear
  // after the footer/signature section, often with quotes around the project name
  const header = { projekt: '', projektnummer: '', produktionsfirma: '', name: '', position: '', abteilung: '', pause: 0 };

  // Scan items after the totals/footer for header-like values
  const footerMarkers = /^(köln|ort|unterschrift|genehmigt|bereich)/i;
  let footerStart = texts.findIndex(t => footerMarkers.test(t));
  if (footerStart === -1) footerStart = texts.length;

  const tailTexts = texts.slice(footerStart);
  for (const t of tailTexts) {
    if (!t || t === ' ' || footerMarkers.test(t) || /^achtung/i.test(t) || t.length > 80) continue;

    // Quoted project name: "X1345-Merz gegen Merz 3+4" or similar
    const projectMatch = t.match(/^[„""«](.+?)[""»"]$/);
    if (projectMatch && !header.projekt) {
      header.projekt = projectMatch[1];
      continue;
    }

    // Person name: "Vorname Nachname" pattern
    if (/^[A-ZÄÖÜ][a-zäöüß]+\s+[A-ZÄÖÜ][a-zäöüß]+/.test(t) && !header.name && !/^(Mo|Di|Mi|Do|Fr|Sa|So)\s/.test(t)) {
      header.name = t;
      continue;
    }

    // Position/role: single word or short phrase, typically a job title
    if (!header.position && header.name && t.length < 40 && !/^(arbeitsnachweis|die liste|zusatztage)/i.test(t)) {
      header.position = t;
      continue;
    }
  }

  // Also try to extract project from header labels section
  // Look for "PRODUKTION:" label and find its value
  const produktionIdx = texts.findIndex(t => /^PRODUKTION/i.test(t));
  if (produktionIdx !== -1 && !header.projekt) {
    // The value might not be adjacent — check a few items ahead
    for (let j = produktionIdx + 1; j < Math.min(produktionIdx + 5, texts.length); j++) {
      const val = texts[j].trim();
      if (val && val !== ' ' && !HEADER_LABELS.some(ld => ld.patterns.some(p => p.test(val + ':')))) {
        header.projekt = val.replace(/^[„""«]|[""»"]$/g, '');
        break;
      }
    }
  }

  // Fallback: extract from filename and PDF metadata
  extractHeaderFromMetaAndFilename(pdfMeta, filePath, header);

  // Compute default pause from header if days don't have individual pause values
  if (header.pause > 0) {
    for (const day of days) {
      if (day.stundenTotal > 0 && day.pause === 0) {
        day.pause = header.pause;
      }
    }
  }

  // Build totals
  const totals = {
    stundenTotal: weeklyTotal || round2(days.reduce((s, d) => s + (d.stundenTotal || 0), 0)),
    ueberstunden25: round2(days.reduce((s, d) => s + (d.ueberstunden25 || 0), 0)),
    ueberstunden50: round2(days.reduce((s, d) => s + (d.ueberstunden50 || 0), 0)),
    ueberstunden100: round2(days.reduce((s, d) => s + (d.ueberstunden100 || 0), 0)),
    nacht25: round2(days.reduce((s, d) => s + (d.nacht25 || 0), 0)),
    fahrzeit: round2(days.reduce((s, d) => s + (d.fahrzeit || 0), 0)),
  };

  return {
    id: generateId(),
    importDate: new Date().toISOString(),
    filePath: '',
    ...header,
    days,
    totals,
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Merge fragmented text items at the same (x,y) position into single items.
 * Many form-based PDFs split individual characters into separate text objects at identical coordinates.
 */
function mergeFragmentedTexts(items) {
  const merged = [];
  let i = 0;
  while (i < items.length) {
    let text = items[i].text;
    const x = items[i].x;
    const y = items[i].y;
    let j = i + 1;
    while (j < items.length && Math.abs(items[j].x - x) < 0.05 && Math.abs(items[j].y - y) < 0.05) {
      text += items[j].text;
      j++;
    }
    merged.push({ x, y, text: text.trim() });
    i = j;
  }
  return merged;
}

/**
 * Extract day names and dates from positioned items.
 * Day names appear near x≈2, dates appear below each day name.
 */
function extractDayInfoFromPositioned(mergedItems) {
  const dayInfos = [];
  const dayOrder = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

  // Find day name items
  for (const item of mergedItems) {
    const text = item.text.trim();
    if (dayOrder.includes(text) && item.x < 10) {
      dayInfos.push({ tag: text, y: item.y, datum: '', fahrzeit: 0, samstagStunden: 0 });
    }
  }

  // Sort by y-position (top to bottom)
  dayInfos.sort((a, b) => a.y - b.y);

  // Find dates for each day (positioned below day name, near x≈2)
  for (const info of dayInfos) {
    // Look for date-like items below the day name (within ~2 y units)
    const dateItems = mergedItems.filter(it =>
      it.y > info.y && it.y < info.y + 2 &&
      it.x < 10 &&
      /^\d{1,2}\.\d{1,2}/.test(it.text)
    );
    if (dateItems.length > 0) {
      info.datum = dateItems[0].text;
      // If date only has dd.mm (no year), don't add year — keep it short like other PDFs
    }
  }

  return dayInfos;
}

/**
 * Extract Fahrzeit from arrow symbols (→/←) in the positioned items.
 * These appear at x≈40 near each day's y-position.
 */
function extractFahrzeitFromPositioned(mergedItems, dayInfos) {
  // Find arrow items with time values
  const fahrzeitItems = mergedItems.filter(it =>
    it.x >= 38 && it.x <= 44 &&
    (it.text.includes('→') || it.text.includes('←'))
  );

  for (const info of dayInfos) {
    let totalFahrzeit = 0;
    // Find Fahrzeit arrows within this day's y range
    const nextDayY = dayInfos.find(d => d.y > info.y + 0.5)?.y || info.y + 3;

    for (const fItem of fahrzeitItems) {
      if (fItem.y >= info.y - 0.2 && fItem.y < nextDayY) {
        // Extract time from arrow text like "→ 0:45" or "← 0:45"
        const timeMatch = fItem.text.match(/(\d{1,2}):(\d{2})/);
        if (timeMatch) {
          totalFahrzeit += parseInt(timeMatch[1]) + parseInt(timeMatch[2]) / 60;
        }
      }
    }
    info.fahrzeit = round2(totalFahrzeit);
  }
}

/**
 * Extract surcharge data from positioned items in the anteilige Zuschläge column (~x=32).
 * This captures things like "Samstag" notes and associated time values.
 */
function extractPositionedSurcharges(mergedItems, dayInfos) {
  for (const info of dayInfos) {
    const nextDayY = dayInfos.find(d => d.y > info.y + 0.5)?.y || info.y + 3;

    // Look for "Samstag" text in the surcharges column area
    const hasSamstag = mergedItems.some(it =>
      it.y >= info.y - 0.2 && it.y < nextDayY &&
      it.x >= 30 && it.x <= 36 &&
      it.text.includes('Samstag')
    );

    if (hasSamstag) {
      // Find the associated time value
      const timeItem = mergedItems.find(it =>
        it.y >= info.y - 0.2 && it.y < nextDayY &&
        it.x >= 30 && it.x <= 36 &&
        /^\d{1,2}:\d{2}$/.test(it.text)
      );
      if (timeItem) {
        info.samstagStunden = parseTimeToDecimal(timeItem.text);
      }
    }
  }
}

/**
 * Parse form-field items sequentially into day blocks.
 * Day blocks start with a day-type marker (Arbeitstag, Drehtag, etc.)
 */
function parseFormFieldDayBlocks(formTexts) {
  const dayTypes = /^(arbeitstag|drehtag|feiertag|frei|ruhetag|krank|urlaub|azv|reisetag|bereitschaft|probe|reise)$/i;
  const timeRegex = /^\d{1,2}:\d{2}$/;
  const blocks = [];

  // Skip header form items until the first day type
  let idx = 0;
  while (idx < formTexts.length && !dayTypes.test(formTexts[idx].trim())) {
    idx++;
  }

  // Parse each day block
  while (idx < formTexts.length) {
    const typeText = formTexts[idx].trim();
    if (!dayTypes.test(typeText)) {
      idx++;
      continue;
    }

    idx++; // move past day type

    const block = {
      type: typeText,
      start: '',
      ende: '',
      pause: 0,
      stundenTotal: 0,
      surchargeValues: [],
      anmerkungen: '',
      samstagStunden: 0,
    };

    // Collect time values, Ja/Nein, prices, remarks, Sa: prefix
    const timeValues = [];
    let waitingSa = false;

    while (idx < formTexts.length && !dayTypes.test(formTexts[idx].trim())) {
      const text = formTexts[idx].trim();

      // Skip empty texts
      if (!text || text === ' ') { idx++; continue; }

      // "Sa:" indicates Saturday surcharge — next time value is the surcharge hours
      if (/^sa:?$/i.test(text)) {
        waitingSa = true;
        idx++;
        continue;
      }

      if (waitingSa && timeRegex.test(text)) {
        block.samstagStunden = parseTimeToDecimal(text);
        waitingSa = false;
        idx++;
        continue;
      }
      waitingSa = false;

      // Skip "Ja"/"Nein" (catering flag)
      if (/^(ja|nein)$/i.test(text)) { idx++; continue; }

      // Skip price fragments (contain €, or comma-separated numbers preceding €)
      if (text.includes('€') || text.includes('€')) { idx++; continue; }
      // Also skip standalone comma and number fragments that are part of prices
      if (text === ',' || /^\d+\s*€/.test(text) || /^,\s*\d+\s*€/.test(text)) { idx++; continue; }

      // Skip consent/signature text
      if (text.length > 40) { idx++; continue; }

      // Time values
      if (timeRegex.test(text)) {
        timeValues.push(text);
        idx++;
        continue;
      }

      // Standalone number with comma (price fragment like "47")
      if (/^\d+$/.test(text) && idx + 1 < formTexts.length && formTexts[idx + 1].trim() === ',') {
        // Skip this number and the following comma + price part
        idx++;
        continue;
      }

      // Text remarks (not a day type, not a time, not Ja/Nein)
      if (text.length > 1 && !dayTypes.test(text)) {
        block.anmerkungen = (block.anmerkungen ? block.anmerkungen + ' ' : '') + text;
      }

      idx++;
    }

    // Map time values: first 4 are start, end, pause, total
    if (timeValues.length >= 1) block.start = timeValues[0];
    if (timeValues.length >= 2) block.ende = timeValues[1];
    if (timeValues.length >= 3) block.pause = parseTimeToDecimal(timeValues[2]);
    if (timeValues.length >= 4) block.stundenTotal = parseTimeToDecimal(timeValues[3]);

    // Remaining time values are surcharges
    for (let i = 4; i < timeValues.length; i++) {
      block.surchargeValues.push(parseTimeToDecimal(timeValues[i]));
    }

    blocks.push(block);
  }

  return blocks;
}

/**
 * Calculate night hours (22:00-06:00) from start/end time strings.
 */
function calcNightHoursFromTimes(startStr, endeStr) {
  const start = parseTimeValue(startStr);
  const end = parseTimeValue(endeStr);
  if (start === null || end === null) return 0;

  let adjustedEnd = end;
  if (adjustedEnd <= start) adjustedEnd += 24;

  let nightHours = 0;
  // Night period before 06:00
  nightHours += Math.max(0, Math.min(adjustedEnd, 6) - Math.max(start, 0));
  // Night period after 22:00 (through to 30 = 06:00 next day)
  nightHours += Math.max(0, Math.min(adjustedEnd, 30) - Math.max(start, 22));

  return round2(Math.max(0, nightHours));
}

/**
 * Parse a time string "H:MM" or "HH:MM" into decimal hours.
 */
function parseTimeToDecimal(str) {
  if (!str) return 0;
  const m = str.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return 0;
  return parseInt(m[1], 10) + parseInt(m[2], 10) / 60;
}

/**
 * Format decimal hours back to "H:MM" string.
 */
function formatTimeValue(decimal) {
  const h = Math.floor(decimal);
  const m = Math.round((decimal - h) * 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

module.exports = { parsePDF };

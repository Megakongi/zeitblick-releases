/**
 * Calculate ISO 8601 calendar week (Kalenderwoche) for a given date.
 * In ISO 8601, the week starts on Monday and week 1 is the week containing
 * the first Thursday of the year.
 */
export function getKW(dateStr) {
  if (!dateStr) return null;
  
  let date;
  // Support dd.mm.yyyy (German) format
  if (typeof dateStr === 'string' && dateStr.includes('.')) {
    const parts = dateStr.split('.');
    if (parts.length === 3) {
      date = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
    }
  } else if (dateStr instanceof Date) {
    date = new Date(dateStr);
  } else {
    date = new Date(dateStr);
  }
  
  if (!date || isNaN(date.getTime())) return null;
  
  // ISO week number calculation
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7; // Make Sunday = 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // Set to nearest Thursday
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  
  return weekNo;
}

/**
 * Get the KW for a timesheet (from the first date in its days array)
 */
export function getTimesheetKW(sheet) {
  if (!sheet || !sheet.days) return null;
  const firstDay = sheet.days.find(d => d.datum);
  if (!firstDay) return null;
  return getKW(firstDay.datum);
}

/**
 * Get the year for a timesheet (from the first date in its days array)
 */
export function getTimesheetYear(sheet) {
  if (!sheet || !sheet.days) return null;
  const firstDay = sheet.days.find(d => d.datum);
  if (!firstDay || !firstDay.datum) return null;
  const parts = firstDay.datum.split('.');
  if (parts.length === 3) return parseInt(parts[2]);
  return null;
}

/**
 * Format KW display string, e.g. "KW 12/2026"
 */
export function formatKW(sheet) {
  const kw = getTimesheetKW(sheet);
  const year = getTimesheetYear(sheet);
  if (kw === null) return '—';
  if (year) return `KW ${kw}/${year}`;
  return `KW ${kw}`;
}

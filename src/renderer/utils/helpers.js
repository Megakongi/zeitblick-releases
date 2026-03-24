/**
 * Shared utility functions used across multiple components.
 */

/**
 * Get 1-2 letter initials from a name string.
 * @param {string} name
 * @returns {string}
 */
export function getInitials(name) {
  if (!name || name === 'Unbekannt') return '?';
  return name.split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

/**
 * Generate a unique ID string.
 * @returns {string}
 */
export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

/**
 * Parse a German date string (dd.mm.yyyy) into a Date object.
 * @param {string} str - Date string in dd.mm.yyyy format
 * @returns {Date}
 */
export function parseDateDE(str) {
  if (!str) return new Date(0);
  const parts = str.split('.');
  if (parts.length === 3) {
    let y = parseInt(parts[2]);
    if (y < 100) y += 2000;
    return new Date(y, parseInt(parts[1]) - 1, parseInt(parts[0]));
  }
  return new Date(0);
}

/**
 * Format a currency value in EUR.
 * @param {number} value
 * @returns {string}
 */
export function formatCurrency(value) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value || 0);
}

/**
 * Format a number with 2 decimal places (German locale).
 * @param {number} n
 * @returns {string}
 */
export function fmt2(n) {
  const val = parseFloat(n);
  return isNaN(val) ? '0,00' : val.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Calculate hours in the overlap between two intervals.
 */
export function overlapHours(aStart, aEnd, bStart, bEnd) {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

/**
 * Calculate night hours (22:00–06:00) for a given work period (TV-FFS TZ 5.5.2).
 * @param {string} startStr - Start time (HH:MM)
 * @param {string} endeStr - End time (HH:MM)
 * @param {function} parseTimeFn - Time parser returning decimal hours
 * @returns {number}
 */
export function calcNightHours(startStr, endeStr, parseTimeFn) {
  const start = parseTimeFn(startStr);
  const end = parseTimeFn(endeStr);
  if (start === null || end === null) return 0;

  let adjustedEnd = end;
  if (adjustedEnd <= start) adjustedEnd += 24; // overnight

  let nightHours = 0;
  // Night period before 06:00
  nightHours += overlapHours(start, adjustedEnd, 0, 6);
  // Night period after 22:00 (through to 30 = 06:00 next day)
  nightHours += overlapHours(start, adjustedEnd, 22, 30);

  return Math.round(nightHours * 100) / 100;
}

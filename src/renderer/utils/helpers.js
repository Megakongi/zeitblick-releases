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

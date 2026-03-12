/**
 * Deutsche Feiertage - bundesweit gültige Feiertage
 * (ohne landesspezifische Feiertage)
 */

// Osterformel nach Gauß/Lichtenberg
function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function fmt(date) {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

/**
 * Returns a Set of date strings (dd.mm.yyyy) for all nationwide German holidays in a given year
 */
export function getHolidays(year) {
  const easter = easterSunday(year);
  const holidays = new Map();

  // Fixed holidays
  holidays.set(`01.01.${year}`, 'Neujahr');
  holidays.set(`01.05.${year}`, 'Tag der Arbeit');
  holidays.set(`03.10.${year}`, 'Tag der Deutschen Einheit');
  holidays.set(`25.12.${year}`, '1. Weihnachtstag');
  holidays.set(`26.12.${year}`, '2. Weihnachtstag');

  // Easter-based holidays
  holidays.set(fmt(addDays(easter, -2)), 'Karfreitag');
  holidays.set(fmt(addDays(easter, 1)), 'Ostermontag');
  holidays.set(fmt(addDays(easter, 39)), 'Christi Himmelfahrt');
  holidays.set(fmt(addDays(easter, 50)), 'Pfingstmontag');

  return holidays;
}

/**
 * Check if a dd.mm.yyyy date string is a German holiday
 * Returns the holiday name or null
 */
export function isHoliday(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split('.');
  if (parts.length < 3) return null;
  const year = parseInt(parts[2]);
  if (isNaN(year)) return null;
  // Handle 2-digit years
  const fullYear = year < 100 ? 2000 + year : year;
  const holidays = getHolidays(fullYear);
  // Normalize to 4-digit year format
  const normalized = `${parts[0]}.${parts[1]}.${fullYear}`;
  return holidays.get(normalized) || null;
}

/**
 * Parse dd.mm.yyyy / dd.mm.yy to Date object
 */
export function parseDate(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split('.');
  if (parts.length < 3) return null;
  let year = parseInt(parts[2]);
  if (isNaN(year)) return null;
  if (year < 100) year += 2000;
  return new Date(year, parseInt(parts[1]) - 1, parseInt(parts[0]));
}

/**
 * Parse time string "HH:MM" to hours as float
 */
export function parseTime(timeStr) {
  if (!timeStr) return null;
  const parts = timeStr.split(':');
  if (parts.length !== 2) return null;
  return parseInt(parts[0]) + parseInt(parts[1]) / 60;
}

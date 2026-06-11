/**
 * Lücken-Erkennung: findet fehlende Kalenderwochen pro Person & Projekt.
 *
 * Bei wöchentlichen Stundenzetteln fällt eine vergessene Woche sonst erst
 * bei der Abrechnung auf. Geprüft werden nur Lücken ZWISCHEN der ersten und
 * letzten erfassten Woche einer Person in einem Projekt — vor Drehbeginn und
 * nach Drehschluss fehlt naturgemäß nichts.
 */

import { getKW } from './calendarWeek';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Parse dd.mm.yyyy / dd.mm.yy to a local-midnight Date, or null */
function parseGermanDate(str) {
  if (!str || typeof str !== 'string') return null;
  const parts = str.split('.');
  if (parts.length < 3) return null;
  const [dd, mm, yy] = parts.map(Number);
  if (!dd || !mm || isNaN(yy)) return null;
  const year = yy < 100 ? 2000 + yy : yy;
  return new Date(year, mm - 1, dd);
}

/** Monday 00:00 of the ISO week containing the given date */
function mondayOf(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = (d.getDay() + 6) % 7; // Mo=0 … So=6
  d.setDate(d.getDate() - offset);
  return d;
}

/** ISO week-year = year of the Thursday in that week */
function isoWeekYear(monday) {
  const thursday = new Date(monday);
  thursday.setDate(thursday.getDate() + 3);
  return thursday.getFullYear();
}

function mondayKey(monday) {
  const mm = String(monday.getMonth() + 1).padStart(2, '0');
  const dd = String(monday.getDate()).padStart(2, '0');
  return `${monday.getFullYear()}-${mm}-${dd}`;
}

/**
 * Find missing calendar weeks per (person, project).
 *
 * @param {Array} timesheets
 * @param {Object} opts
 * @param {Function} opts.getBaseProject  projekt → base project name
 * @param {Function} opts.resolveName     name alias → canonical name
 * @param {Object}   opts.completedProjects  completed projects are skipped
 * @returns {Array<{person, projekt, missing: Array<{kw, year, label}>}>}
 */
export function findMissingWeeks(timesheets, opts = {}) {
  const {
    getBaseProject = (p) => p || 'Sonstiges',
    resolveName = (n) => n,
    completedProjects = {},
  } = opts;

  // Group covered weeks (as Monday dates) by person+project
  const groups = new Map();
  for (const sheet of timesheets || []) {
    const projekt = getBaseProject(sheet.projekt);
    if (completedProjects[projekt]) continue;
    const person = resolveName(sheet.name || 'Unbekannt');
    const key = `${person}|${projekt}`;
    if (!groups.has(key)) groups.set(key, { person, projekt, weeks: new Map() });
    const group = groups.get(key);
    for (const day of sheet.days || []) {
      const date = parseGermanDate(day.datum);
      if (!date) continue;
      const monday = mondayOf(date);
      group.weeks.set(mondayKey(monday), monday);
    }
  }

  const results = [];
  for (const { person, projekt, weeks } of groups.values()) {
    if (weeks.size < 2) continue; // keine Lücke möglich
    const sorted = [...weeks.values()].sort((a, b) => a - b);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];

    const missing = [];
    const cursor = new Date(first);
    cursor.setDate(cursor.getDate() + 7);
    while (cursor < last) {
      if (!weeks.has(mondayKey(cursor))) {
        const kw = getKW(cursor);
        const year = isoWeekYear(cursor);
        missing.push({ kw, year, label: `KW ${kw}/${year}` });
      }
      cursor.setDate(cursor.getDate() + 7);
    }

    if (missing.length > 0) results.push({ person, projekt, missing });
  }

  return results.sort((a, b) =>
    a.projekt.localeCompare(b.projekt) || a.person.localeCompare(b.person)
  );
}

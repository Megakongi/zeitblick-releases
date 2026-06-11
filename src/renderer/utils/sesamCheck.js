/**
 * Sesam-AZE ↔ App-Stundenzettel-Abgleich.
 * Aus SesamAbgleich.jsx extrahiert, damit auch das Dashboard
 * Abweichungen als Warnung anzeigen kann.
 */

/** Normalize a German date string to "DD.MM.YYYY" (handles 1-stellige Tage/Monate, 2-stellige Jahre). */
export function normalizeDatum(d) {
  if (!d) return null;
  const m = d.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (!m) return null;
  const day  = m[1].padStart(2, '0');
  const mon  = m[2].padStart(2, '0');
  let   year = m[3];
  if (year.length === 2) year = (parseInt(year, 10) >= 70 ? '19' : '20') + year;
  return `${day}.${mon}.${year}`;
}

/** Stundenvergleich mit 15-Minuten-Toleranz. null = nicht vergleichbar. */
export function hoursMatch(sesamH, appH) {
  if (appH == null) return null;
  return Math.abs(sesamH - appH) <= 0.25;
}

/** Find the matching app-timesheet day for a Sesam day (by date + name words). */
export function findAppDay(sesamSheet, day, timesheets, resolveName = (n) => n) {
  if (!day.datum) return null;
  const normDay = normalizeDatum(day.datum);
  const sheetWords = sesamSheet.name
    ? sesamSheet.name.toLowerCase().split(/\s+/).filter(w => w.length > 2)
    : [];
  for (const ts of timesheets) {
    const tsName = resolveName(ts.name || 'Unbekannt').toLowerCase();
    if (sheetWords.length > 0 && !sheetWords.some(w => tsName.includes(w))) continue;
    const found = (ts.days || []).find(d => {
      const normD = normalizeDatum(d.datum);
      return normD && normDay && normD === normDay;
    });
    if (found) return found;
  }
  return null;
}

/**
 * Summarize deviations between Sesam sheets and app timesheets.
 * Returns one entry per Sesam sheet that has missing days or hour mismatches.
 *
 * @returns {Array<{id, name, projekt, missing, wrong, firstDate}>}
 */
export function summarizeSesamDeviations(sesamSheets, timesheets, resolveName = (n) => n) {
  const results = [];
  for (const sheet of sesamSheets || []) {
    if (sheet._allGrafisch) continue; // rein grafische PDFs: kein Abgleich möglich
    const days = sheet.days || [];
    const missing = days.filter(sd => sd.datum && !findAppDay(sheet, sd, timesheets, resolveName)).length;
    const wrong = (sheet.type !== 'arbeitszeiterfassung')
      ? days.filter(sd => {
          const ad = findAppDay(sheet, sd, timesheets, resolveName);
          return ad && hoursMatch(sd.arbeitszeit, ad.stundenTotal ?? null) === false;
        }).length
      : 0;
    if (missing + wrong > 0) {
      results.push({
        id: sheet.id,
        name: sheet.name || 'Unbekannt',
        projekt: sheet.projekt || sheet.produktion || '',
        missing,
        wrong,
        firstDate: days[0]?.datum || '',
      });
    }
  }
  return results;
}

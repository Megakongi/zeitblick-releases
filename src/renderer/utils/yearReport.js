/**
 * Jahresabschluss-Report („Mein Jahr"): aggregiert alle Stundenzettel eines
 * Jahres zu einer Übersicht pro Projekt + Gesamtbilanz (Stunden, Verdienst,
 * Überstundenquote, Urlaubs- und AZV-Konto).
 */

import { calculateTVFFS } from './tvffsCalculator';
import { getTimesheetYear } from './calendarWeek';

/** Alle Jahre, die in den Timesheets vorkommen (absteigend sortiert). */
export function yearsInTimesheets(timesheets) {
  const years = new Set();
  for (const ts of timesheets || []) {
    const y = getTimesheetYear(ts);
    if (y) years.add(y < 100 ? 2000 + y : y);
  }
  return [...years].sort((a, b) => b - a);
}

/**
 * Build the aggregated year report data.
 *
 * @param {Array} timesheets  alle (ggf. vorgefilterten) Stundenzettel
 * @param {Object} settings   effektive Settings (Gage etc.)
 * @param {number} year       Kalenderjahr
 * @param {Object} opts       { getBaseProject, getPersonSettings, personFilter }
 */
export function buildYearReport(timesheets, settings, year, opts = {}) {
  const getBaseProject = opts.getBaseProject || ((p) => p || 'Sonstiges');

  const yearSheets = (timesheets || []).filter(ts => {
    const y = getTimesheetYear(ts);
    return y && (y < 100 ? 2000 + y : y) === year;
  });

  const total = calculateTVFFS(yearSheets, settings);

  // Pro Projekt aggregieren
  const byProject = new Map();
  for (const ts of yearSheets) {
    const projekt = getBaseProject(ts.projekt);
    if (!byProject.has(projekt)) byProject.set(projekt, []);
    byProject.get(projekt).push(ts);
  }
  const projects = [...byProject.entries()].map(([projekt, sheets]) => {
    const c = calculateTVFFS(sheets, settings);
    return {
      projekt,
      sheets: sheets.length,
      arbeitstage: c.totalArbeitstage,
      stunden: c.totalStunden,
      ueberstunden: c.totalUeberstunden + c.weeklyOT25 + c.weeklyOT50,
      verdienst: c.gesamtVerdienst,
    };
  }).sort((a, b) => b.stunden - a.stunden);

  const ueberstundenGesamt = total.totalUeberstunden + total.weeklyOT25 + total.weeklyOT50;
  const ueberstundenQuote = total.totalStunden > 0
    ? Math.round((ueberstundenGesamt / total.totalStunden) * 1000) / 10
    : 0;

  return {
    year,
    sheets: yearSheets.length,
    projects,
    total,
    ueberstundenGesamt: Math.round(ueberstundenGesamt * 100) / 100,
    ueberstundenQuote, // in %
  };
}

const fmtNum = (n, digits = 2) => Number(n || 0).toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const fmtCur = (n) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n || 0);

/** Render the year report as printable HTML (querformat, wie die anderen Exporte). */
export function generateYearReportHTML(report, { personLabel = '', hasGage = false } = {}) {
  const t = report.total;
  const azvAnspruchStd = (t.azvAnspruchStunden || 0) + (t.azvFreieTageNach20DT || 0) * 10;
  const azvSaldo = Math.round((azvAnspruchStd - (t.totalAZVTage || 0) * 10) * 100) / 100;

  let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; font-size: 11px; color: #1a1a1a; padding: 24px 20px; background: #fff; }
    h1 { font-size: 20px; margin-bottom: 2px; }
    .subtitle { color: #666; font-size: 11px; margin-bottom: 18px; display: block; }
    h2 { font-size: 13px; margin: 18px 0 6px 0; padding-bottom: 3px; border-bottom: 2px solid #333; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
    th, td { padding: 4px 8px; text-align: left; border: 1px solid #ccc; }
    th { background: #f0f0f0; font-weight: 600; font-size: 10px; text-transform: uppercase; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .total-row td { font-weight: 700; background: #f7f7f7; border-top: 2px solid #333; }
    .kpis { display: flex; gap: 14px; flex-wrap: wrap; margin-bottom: 16px; }
    .kpi { border: 1px solid #ccc; border-radius: 8px; padding: 10px 16px; min-width: 130px; }
    .kpi-val { font-size: 18px; font-weight: 700; }
    .kpi-lbl { font-size: 10px; color: #666; text-transform: uppercase; }
    .section-note { color: #666; font-size: 10px; margin-top: 2px; margin-bottom: 10px; }
  </style></head><body>`;

  html += `<h1>Mein Jahr ${report.year}${personLabel ? ' — ' + personLabel : ''}</h1>`;
  html += `<span class="subtitle">ZeitBlick Jahresabschluss · erstellt am ${new Date().toLocaleDateString('de-DE')} · ${report.sheets} Stundenzettel</span>`;

  // KPI-Zeile
  html += `<div class="kpis">`;
  html += `<div class="kpi"><div class="kpi-val">${fmtNum(t.totalStunden)}</div><div class="kpi-lbl">Stunden</div></div>`;
  html += `<div class="kpi"><div class="kpi-val">${t.totalArbeitstage}</div><div class="kpi-lbl">Arbeitstage</div></div>`;
  html += `<div class="kpi"><div class="kpi-val">${fmtNum(report.ueberstundenGesamt)}</div><div class="kpi-lbl">Überstunden</div></div>`;
  html += `<div class="kpi"><div class="kpi-val">${fmtNum(report.ueberstundenQuote, 1)} %</div><div class="kpi-lbl">Überstundenquote</div></div>`;
  if (hasGage) html += `<div class="kpi"><div class="kpi-val">${fmtCur(t.gesamtVerdienst)}</div><div class="kpi-lbl">Gesamtverdienst</div></div>`;
  html += `</div>`;

  // Projekte
  html += `<h2>Projekte</h2><table><thead><tr>
    <th>Projekt</th><th class="num">Zettel</th><th class="num">Arbeitstage</th><th class="num">Stunden</th><th class="num">Überstd.</th>${hasGage ? '<th class="num">Verdienst</th>' : ''}
  </tr></thead><tbody>`;
  for (const p of report.projects) {
    html += `<tr><td>${p.projekt}</td><td class="num">${p.sheets}</td><td class="num">${p.arbeitstage}</td><td class="num">${fmtNum(p.stunden)}</td><td class="num">${fmtNum(p.ueberstunden)}</td>${hasGage ? `<td class="num">${fmtCur(p.verdienst)}</td>` : ''}</tr>`;
  }
  html += `<tr class="total-row"><td>Gesamt</td><td class="num">${report.sheets}</td><td class="num">${t.totalArbeitstage}</td><td class="num">${fmtNum(t.totalStunden)}</td><td class="num">${fmtNum(report.ueberstundenGesamt)}</td>${hasGage ? `<td class="num">${fmtCur(t.gesamtVerdienst)}</td>` : ''}</tr>`;
  html += `</tbody></table>`;
  html += `<p class="section-note">Projektverdienste werden je Projekt einzeln berechnet — Summe kann wegen wochenübergreifender Zuschläge minimal von der Gesamtberechnung abweichen.</p>`;

  // Bilanz / Konten
  html += `<h2>Bilanz</h2><table><thead><tr><th>Kennzahl</th><th class="num">Wert</th></tr></thead><tbody>`;
  html += `<tr><td>Bezahlte Tage</td><td class="num">${t.totalBezahlteTage}</td></tr>`;
  if (t.totalKranktage > 0) html += `<tr><td>Krankheitstage</td><td class="num">${t.totalKranktage}${t.totalKranktageUnbezahlt > 0 ? ` (davon ${t.totalKranktageUnbezahlt} unbezahlt)` : ''}</td></tr>`;
  html += `<tr><td>Samstage / Sonntage / Feiertage</td><td class="num">${fmtNum(t.totalSamstagsstunden)} / ${fmtNum(t.totalSonntagsstunden)} / ${fmtNum(t.totalFeiertagsstunden)} Std.</td></tr>`;
  html += `<tr><td>Nachtstunden</td><td class="num">${fmtNum(t.totalNacht)}</td></tr>`;
  html += `<tr><td>Fahrzeit</td><td class="num">${fmtNum(t.totalFahrzeit)} Std.</td></tr>`;
  html += `<tr><td>Urlaubskonto</td><td class="num">Anspruch ${t.urlaubstage} · genommen ${t.urlaubstageGenommen} · offen ${t.urlaubstageOffen}</td></tr>`;
  html += `<tr><td>AZV-Konto (TZ 6)</td><td class="num">Anspruch ${fmtNum(azvAnspruchStd)} Std. · genommen ${(t.totalAZVTage || 0)} Tag(e) · Saldo ${fmtNum(azvSaldo)} Std.</td></tr>`;
  if (t.zeitkonto) html += `<tr><td>Zeitkonto</td><td class="num">${fmtNum(t.zeitkontoStunden)} Std. (${fmtCur(t.zeitkontoWert)})</td></tr>`;
  if (t.ruhezeitVerletzungen?.length > 0) html += `<tr><td>Ruhezeit-Verletzungen (ArbZG §5)</td><td class="num">${t.ruhezeitVerletzungen.length}</td></tr>`;
  if (t.arbzgLangeTage?.length > 0) html += `<tr><td>Tage über 13h (ArbZG)</td><td class="num">${t.arbzgLangeTage.length}</td></tr>`;
  html += `</tbody></table>`;

  if (hasGage) {
    html += `<h2>Verdienst</h2><table><thead><tr><th>Position</th><th class="num">Betrag</th></tr></thead><tbody>`;
    html += `<tr><td>Grundgage (${t.totalBezahlteTage} Tage)</td><td class="num">${fmtCur(t.grundgage)}</td></tr>`;
    if (t.ueberstundenGrundverguetung > 0) html += `<tr><td>Überstunden-Grundvergütung</td><td class="num">${fmtCur(t.ueberstundenGrundverguetung)}</td></tr>`;
    if (t.totalUeberstundenZuschlag > 0) html += `<tr><td>Überstunden-Zuschläge</td><td class="num">${fmtCur(t.totalUeberstundenZuschlag)}</td></tr>`;
    const weeklySum = (t.weeklyOTGrundverguetung || 0) + (t.weeklyOTZuschlag25 || 0) + (t.weeklyOTZuschlag50 || 0);
    if (weeklySum > 0) html += `<tr><td>Wöchentliche Mehrarbeit</td><td class="num">${fmtCur(weeklySum)}</td></tr>`;
    if (t.nachtZuschlag > 0) html += `<tr><td>Nachtzuschlag</td><td class="num">${fmtCur(t.nachtZuschlag)}</td></tr>`;
    if (t.samstagZuschlag > 0) html += `<tr><td>Samstagszuschlag</td><td class="num">${fmtCur(t.samstagZuschlag)}</td></tr>`;
    if (t.sonntagZuschlag > 0) html += `<tr><td>Sonntagszuschlag</td><td class="num">${fmtCur(t.sonntagZuschlag)}</td></tr>`;
    if (t.feiertagZuschlag > 0) html += `<tr><td>Feiertagszuschlag</td><td class="num">${fmtCur(t.feiertagZuschlag)}</td></tr>`;
    if (t.fahrzeitVerguetung > 0) html += `<tr><td>Fahrzeitvergütung</td><td class="num">${fmtCur(t.fahrzeitVerguetung)}</td></tr>`;
    if (t.urlaubstageAuszahlung > 0) html += `<tr><td>Urlaubsauszahlung (${t.urlaubstageOffen} Tage)</td><td class="num">${fmtCur(t.urlaubstageAuszahlung)}</td></tr>`;
    if (t.zeitkontoTageAuszahlung > 0) html += `<tr><td>Zeitkonto-Auszahlung</td><td class="num">${fmtCur(t.zeitkontoTageAuszahlung)}</td></tr>`;
    html += `<tr class="total-row"><td>Gesamtverdienst</td><td class="num">${fmtCur(t.gesamtVerdienst)}</td></tr>`;
    html += `</tbody></table>`;
  }

  html += `</body></html>`;
  return html;
}

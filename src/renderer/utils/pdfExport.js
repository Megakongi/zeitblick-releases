/**
 * Generate professional timesheet HTML for PDF export.
 * Designed to look like a classic FuF/TV-FFS Stundenzettel.
 *
 * @param {Object} sheet - A timesheet object with projekt, name, days, totals, etc.
 * @returns {string} Full HTML document string
 */

/** Escape HTML special characters to prevent XSS/injection in generated PDFs */
const escHtml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const MONTHS_DE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

/** Parse a German date string "dd.mm.yyyy" into a Date (local), or null. */
const parseDmy = (str) => {
  const m = String(str ?? '').match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return isNaN(d.getTime()) ? null : d;
};

/** ISO 8601 week number for a Date. */
const isoWeek = (date) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7; // Mon=1..Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - day); // shift to Thursday
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
};

/**
 * Derive KW label and Monday–Sunday span from the sheet's day dates.
 * @returns {{ kw: number|null, span: string }}
 */
const derivePeriod = (days) => {
  const dates = (days || []).map(d => parseDmy(d.datum)).filter(Boolean).sort((a, b) => a - b);
  if (dates.length === 0) return { kw: null, span: '' };

  const ref = dates[0];
  const kw = isoWeek(ref);

  // Monday of that ISO week
  const monday = new Date(ref);
  const dow = monday.getDay() || 7; // Mon=1..Sun=7
  monday.setDate(monday.getDate() - (dow - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const dd = (n) => String(n).padStart(2, '0');
  let span;
  if (monday.getMonth() === sunday.getMonth()) {
    span = `${dd(monday.getDate())}.–${dd(sunday.getDate())}. ${MONTHS_DE[sunday.getMonth()]} ${sunday.getFullYear()}`;
  } else {
    span = `${dd(monday.getDate())}. ${MONTHS_DE[monday.getMonth()]} – ${dd(sunday.getDate())}. ${MONTHS_DE[sunday.getMonth()]} ${sunday.getFullYear()}`;
  }
  return { kw, span };
};

export function generateTimesheetHTML(sheet) {
  const { projekt, projektnummer, produktionsfirma, name, position, abteilung, pause, days, totals } = sheet;
  const fmt2 = v => { const n = parseFloat(v); return isNaN(n) || n === 0 ? '' : n.toFixed(2); };

  const { kw, span } = derivePeriod(days);
  const periodLabel = kw ? `KW ${kw}${span ? ` · ${span}` : ''}` : (span || '');

  const daysRows = (days || []).map(d => {
    const isActive = d.start || d.stundenTotal > 0;
    const dash = isActive ? '' : '—';
    return `
    <tr class="${isActive ? 'active' : 'off'}">
      <td class="l day">${escHtml(d.tag)}</td>
      <td class="date">${escHtml(d.datum)}</td>
      <td>${escHtml(d.start) || dash}</td>
      <td>${escHtml(d.ende) || dash}</td>
      <td>${fmt2(d.pause)}</td>
      <td class="hours">${fmt2(d.stundenTotal) || dash}</td>
      <td>${fmt2(d.ueberstunden25)}</td>
      <td>${fmt2(d.ueberstunden50)}</td>
      <td>${fmt2(d.ueberstunden100)}</td>
      <td>${fmt2(d.nacht25)}</td>
      <td>${fmt2(d.fahrzeit)}</td>
      <td class="note">${escHtml(d.anmerkungen)}</td>
    </tr>`;
  }).join('');

  const t = totals || {};
  const footerProject = [escHtml(projekt) || '', kw ? `KW ${kw} / ${new Date().getFullYear()}` : '']
    .filter(Boolean).join(' · ');

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<title>Stundenzettel - ${escHtml(name) || 'Unbekannt'}</title>
<style>
  :root {
    --ink: #1a1d23;
    --muted: #6b7280;
    --faint: #b4bac3;
    --line: #e6e9ee;
    --line-strong: #d3d8df;
    --accent: #1f6feb;
    --zebra: #f7f8fa;
  }
  @page { size: A4 landscape; margin: 14mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    font-size: 11.5px;
    color: var(--ink);
    background: white;
    line-height: 1.4;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* Header */
  .hd { display: flex; justify-content: space-between; align-items: flex-end; padding-bottom: 14px; border-bottom: 2.5px solid var(--ink); }
  .hd-eyebrow { font-size: 10px; font-weight: 700; letter-spacing: 2.4px; text-transform: uppercase; color: var(--muted); }
  .hd-title { font-size: 24px; font-weight: 800; letter-spacing: -.5px; margin-top: 3px; }
  .hd-right { text-align: right; }
  .hd-period { font-size: 13px; font-weight: 700; }
  .hd-meta { font-size: 10px; color: var(--faint); margin-top: 3px; }

  /* Meta grid */
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 7px 56px; margin: 20px 0 22px; }
  .meta-item { display: flex; gap: 10px; align-items: baseline; font-size: 11.5px; padding-bottom: 6px; border-bottom: 1px solid var(--line); }
  .meta-item .k { font-weight: 600; color: var(--muted); min-width: 130px; }
  .meta-item .v { font-weight: 600; color: var(--ink); }

  /* Table */
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  thead th {
    font-size: 8.5px; text-transform: uppercase; letter-spacing: .4px;
    font-weight: 700; padding: 9px 4px; text-align: center; white-space: nowrap;
    color: var(--muted); border-bottom: 1.5px solid var(--line-strong);
  }
  thead th.l { text-align: left; padding-left: 10px; }
  thead th.h-hours { color: var(--accent); }
  th.c-tag { width: 8.5%; } th.c-date { width: 8%; } th.c-time { width: 6%; }
  th.c-pause { width: 5%; } th.c-hours { width: 6.5%; } th.c-num { width: 5%; }
  th.c-note { width: 21%; }

  tbody td { padding: 8px 4px; text-align: center; font-size: 11px; font-variant-numeric: tabular-nums; border-bottom: 1px solid var(--line); }
  tbody td.l { text-align: left; padding-left: 10px; }
  tbody td.note { text-align: left; padding-left: 10px; font-size: 10px; line-height: 1.35; color: #4b5563; white-space: normal; word-break: break-word; }
  .day { font-weight: 700; }
  .date { color: var(--muted); }
  td.hours { color: var(--accent); font-weight: 800; }
  tbody tr.active td.hours { background: rgba(31,111,235,.06); }
  tbody tr.off td { color: var(--faint); }
  tbody tr.off .day { font-weight: 600; color: var(--muted); }
  tbody tr.off td.hours { background: transparent; }

  tfoot td {
    padding: 11px 4px; font-weight: 800; font-size: 11.5px; text-align: center;
    font-variant-numeric: tabular-nums; border-top: 2px solid var(--ink);
  }
  tfoot td.l { text-align: left; padding-left: 10px; text-transform: uppercase; letter-spacing: .8px; font-size: 11px; }
  tfoot td.hours { color: var(--accent); font-size: 13.5px; }

  /* Signatures */
  .sign { display: flex; justify-content: space-between; gap: 60px; margin-top: 46px; }
  .sign .box { flex: 1; max-width: 340px; }
  .sign .line { border-top: 1.5px solid var(--ink); padding-top: 5px; font-size: 10.5px; color: var(--muted); }
  .foot { margin-top: 24px; display: flex; justify-content: space-between; font-size: 9.5px; color: var(--faint); border-top: 1px solid var(--line); padding-top: 10px; }
</style>
</head>
<body>
  <div class="hd">
    <div>
      <div class="hd-eyebrow">Wochennachweis der Arbeitszeit</div>
      <div class="hd-title">Stundenzettel</div>
    </div>
    <div class="hd-right">
      ${periodLabel ? `<div class="hd-period">${escHtml(periodLabel)}</div>` : ''}
      <div class="hd-meta">Erstellt am ${new Date().toLocaleDateString('de-DE')}</div>
    </div>
  </div>

  <div class="meta">
    <div class="meta-item"><span class="k">Projekt</span><span class="v">${escHtml(projekt) || '—'}</span></div>
    <div class="meta-item"><span class="k">Name</span><span class="v">${escHtml(name) || '—'}</span></div>
    <div class="meta-item"><span class="k">Projektnummer</span><span class="v">${escHtml(projektnummer) || '—'}</span></div>
    <div class="meta-item"><span class="k">Position</span><span class="v">${escHtml(position) || '—'}</span></div>
    <div class="meta-item"><span class="k">Produktionsfirma</span><span class="v">${escHtml(produktionsfirma) || '—'}</span></div>
    <div class="meta-item"><span class="k">Abteilung</span><span class="v">${escHtml(abteilung) || '—'}</span></div>
    <div class="meta-item"><span class="k">Standardpause</span><span class="v">${pause ? `${pause} Std.` : '—'}</span></div>
  </div>

  <table>
    <thead>
      <tr>
        <th class="l c-tag">Tag</th>
        <th class="c-date">Datum</th>
        <th class="c-time">Beginn</th>
        <th class="c-time">Ende</th>
        <th class="c-pause">Pause</th>
        <th class="h-hours c-hours">Stunden</th>
        <th class="c-num">Ü 25%</th>
        <th class="c-num">Ü 50%</th>
        <th class="c-num">Ü 100%</th>
        <th class="c-num">Nacht 25%</th>
        <th class="c-num">Fahrzeit</th>
        <th class="l c-note">Anmerkungen</th>
      </tr>
    </thead>
    <tbody>
      ${daysRows}
    </tbody>
    <tfoot>
      <tr>
        <td class="l" colspan="5">Summe</td>
        <td class="hours">${Number(t.stundenTotal || 0).toFixed(2)}</td>
        <td>${fmt2(t.ueberstunden25)}</td>
        <td>${fmt2(t.ueberstunden50)}</td>
        <td>${fmt2(t.ueberstunden100)}</td>
        <td>${fmt2(t.nacht25)}</td>
        <td>${fmt2(t.fahrzeit)}</td>
        <td class="note"></td>
      </tr>
    </tfoot>
  </table>

  <div class="sign">
    <div class="box"><div class="line">Unterschrift Mitarbeiter</div></div>
    <div class="box"><div class="line">Unterschrift Produktionsleitung</div></div>
  </div>

  <div class="foot">
    <span>${footerProject || '&nbsp;'}</span>
    <span>Erstellt mit ZeitBlick</span>
  </div>
</body>
</html>`;
}

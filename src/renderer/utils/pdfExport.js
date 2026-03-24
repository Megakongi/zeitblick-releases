/**
 * Generate professional timesheet HTML for PDF export.
 * Designed to look like a classic FuF/TV-FFS Stundenzettel.
 * 
 * @param {Object} sheet - A timesheet object with projekt, name, days, totals, etc.
 * @returns {string} Full HTML document string
 */
/** Escape HTML special characters to prevent XSS/injection in generated PDFs */
const escHtml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export function generateTimesheetHTML(sheet) {
  const { projekt, projektnummer, produktionsfirma, name, position, abteilung, pause, days, totals } = sheet;
  const fmt2 = v => { const n = parseFloat(v); return isNaN(n) || n === 0 ? '' : n.toFixed(2); };

  const daysRows = (days || []).map(d => `
    <tr class="${d.start || d.stundenTotal > 0 ? 'active' : 'empty'}">
      <td class="day-name">${escHtml(d.tag)}</td>
      <td>${escHtml(d.datum)}</td>
      <td>${escHtml(d.start)}</td>
      <td>${escHtml(d.ende)}</td>
      <td>${fmt2(d.pause)}</td>
      <td class="hours">${fmt2(d.stundenTotal)}</td>
      <td>${fmt2(d.ueberstunden25)}</td>
      <td>${fmt2(d.ueberstunden50)}</td>
      <td>${fmt2(d.ueberstunden100)}</td>
      <td>${fmt2(d.nacht25)}</td>
      <td>${fmt2(d.fahrzeit)}</td>
      <td class="notes">${escHtml(d.anmerkungen)}</td>
    </tr>
  `).join('');

  const t = totals || {};

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<title>Stundenzettel - ${escHtml(name) || 'Unbekannt'}</title>
<style>
  @page {
    size: A4 landscape;
    margin: 15mm;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    font-size: 10px;
    color: #1a1a1a;
    background: white;
    line-height: 1.4;
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 18px;
    padding-bottom: 12px;
    border-bottom: 2px solid #333;
  }
  .header h1 {
    font-size: 20px;
    font-weight: 700;
    letter-spacing: -0.5px;
  }
  .header .subtitle {
    font-size: 10px;
    color: #666;
    margin-top: 2px;
  }
  .meta-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px 40px;
    margin-bottom: 16px;
  }
  .meta-item {
    display: flex;
    gap: 8px;
    font-size: 10px;
  }
  .meta-item .label {
    font-weight: 600;
    color: #555;
    min-width: 120px;
  }
  .meta-item .value {
    font-weight: 500;
    color: #111;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 20px;
    font-size: 9.5px;
  }
  thead th {
    background: #2a2a2a;
    color: white;
    padding: 7px 6px;
    text-align: center;
    font-weight: 600;
    font-size: 8.5px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }
  thead th:first-child {
    text-align: left;
    padding-left: 10px;
  }
  tbody td {
    padding: 6px 6px;
    text-align: center;
    border-bottom: 1px solid #ddd;
  }
  tbody td:first-child {
    text-align: left;
    padding-left: 10px;
    font-weight: 500;
  }
  tbody tr.active td {
    color: #111;
  }
  tbody tr.empty td {
    color: #bbb;
  }
  td.hours {
    font-weight: 600;
    color: #0077cc;
  }
  td.day-name {
    font-weight: 500;
    min-width: 80px;
  }
  td.notes {
    text-align: left;
    max-width: 140px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  tfoot td {
    padding: 8px 6px;
    font-weight: 700;
    text-align: center;
    background: #f0f0f0;
    border-top: 2px solid #333;
    font-size: 10px;
  }
  tfoot td:first-child {
    text-align: left;
    padding-left: 10px;
  }
  .signature-section {
    display: flex;
    justify-content: space-between;
    margin-top: 40px;
    padding-top: 8px;
  }
  .signature-box {
    width: 200px;
    text-align: center;
  }
  .signature-line {
    border-top: 1px solid #333;
    margin-top: 40px;
    padding-top: 4px;
    font-size: 9px;
    color: #666;
  }
  .footer-note {
    margin-top: 20px;
    font-size: 8px;
    color: #999;
    text-align: center;
  }
</style>
</head>
<body>
  <div class="header">
    <div>
      <h1>Stundenzettel</h1>
      <div class="subtitle">Wochennachweis der Arbeitszeit</div>
    </div>
    <div style="text-align: right; font-size: 9px; color: #666;">
      Erstellt am ${new Date().toLocaleDateString('de-DE')}
    </div>
  </div>

  <div class="meta-grid">
    <div class="meta-item"><span class="label">Projekt:</span><span class="value">${escHtml(projekt) || '—'}</span></div>
    <div class="meta-item"><span class="label">Name:</span><span class="value">${escHtml(name) || '—'}</span></div>
    <div class="meta-item"><span class="label">Projektnummer:</span><span class="value">${escHtml(projektnummer) || '—'}</span></div>
    <div class="meta-item"><span class="label">Position:</span><span class="value">${escHtml(position) || '—'}</span></div>
    <div class="meta-item"><span class="label">Produktionsfirma:</span><span class="value">${escHtml(produktionsfirma) || '—'}</span></div>
    <div class="meta-item"><span class="label">Abteilung:</span><span class="value">${escHtml(abteilung) || '—'}</span></div>
    <div class="meta-item"><span class="label">Standardpause:</span><span class="value">${pause || '—'} Std.</span></div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Tag</th>
        <th>Datum</th>
        <th>Beginn</th>
        <th>Ende</th>
        <th>Pause</th>
        <th>Stunden</th>
        <th>Ü 25%</th>
        <th>Ü 50%</th>
        <th>Ü 100%</th>
        <th>Nacht 25%</th>
        <th>Fahrzeit</th>
        <th>Anmerkungen</th>
      </tr>
    </thead>
    <tbody>
      ${daysRows}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="5">Summe</td>
        <td>${Number(t.stundenTotal || 0).toFixed(2)}</td>
        <td>${fmt2(t.ueberstunden25)}</td>
        <td>${fmt2(t.ueberstunden50)}</td>
        <td>${fmt2(t.ueberstunden100)}</td>
        <td>${fmt2(t.nacht25)}</td>
        <td>${fmt2(t.fahrzeit)}</td>
        <td></td>
      </tr>
    </tfoot>
  </table>

  <div class="signature-section">
    <div class="signature-box">
      <div class="signature-line">Unterschrift Mitarbeiter</div>
    </div>
    <div class="signature-box">
      <div class="signature-line">Unterschrift Aufnahmeleitung</div>
    </div>
  </div>

  <div class="footer-note">Erstellt mit ZeitBlick</div>
</body>
</html>`;
}

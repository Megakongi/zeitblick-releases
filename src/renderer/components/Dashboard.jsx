import React, { useState, useEffect, useMemo } from 'react';
import { calculateTVFFS as calcTVFFS, calculateSheetTVFFS } from '../utils/tvffsCalculator';
import { parseDateDE } from '../utils/helpers';
import { useFilters, useSettings } from '../contexts';

function generatePDFHTML(timesheets, c, settings, personFilter) {
  const hasGage = settings.tagesgage > 0;
  const fmt = (n) => typeof n === 'number' ? n.toFixed(2).replace('.', ',') : '0,00';
  const fmtC = (n) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n || 0);

  const sorted = [...timesheets].sort((a, b) => {
    const dA = a.days.find(d => d.datum)?.datum || '';
    const dB = b.days.find(d => d.datum)?.datum || '';
    return parseDateDE(dA) - parseDateDE(dB);
  });

  const gageLabel = settings.gageType === 'woche' ? 'Wochengage' : 'Tagesgage';

  let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; font-size: 11px; color: #1a1a1a; padding: 24px 20px; background: #fff; }
    h1 { font-size: 18px; margin-bottom: 2px; }
    .subtitle { color: #666; font-size: 11px; margin-bottom: 16px; display: block; }
    h2 { font-size: 13px; margin: 18px 0 6px 0; padding-bottom: 3px; border-bottom: 2px solid #333; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
    th, td { padding: 4px 8px; text-align: left; border: 1px solid #ccc; }
    th { background: #f0f0f0; font-weight: 600; font-size: 10px; text-transform: uppercase; }
    td { font-size: 11px; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .bold { font-weight: 700; }
    .total-row td { font-weight: 700; background: #f7f7f7; border-top: 2px solid #333; }
    .divider-row td { border: none; padding: 2px; height: 4px; }
    .meta-table { width: auto; margin-bottom: 14px; }
    .meta-table td { border: none; padding: 2px 12px 2px 0; }
    .meta-table td:first-child { font-weight: 600; }
    .section-note { color: #666; font-size: 10px; margin-top: 2px; margin-bottom: 10px; }
    @media print { body { padding: 10px; } }
  </style></head><body>`;

  // Header
  const projekt = timesheets[0]?.projekt || '';
  const name = personFilter && personFilter !== 'all' ? personFilter : (timesheets[0]?.name || '');
  html += `<h1>ZeitBlick Übersicht${name ? ' — ' + name : ''}</h1>`;
  html += `<span class="subtitle">Exportiert am ${new Date().toLocaleDateString('de-DE')}${projekt ? ' · Projekt: ' + projekt : ''}${name && !(personFilter && personFilter !== 'all') ? ' · ' + name : ''}</span>`;

  // Meta info
  html += `<table class="meta-table">`;
  if (hasGage) html += `<tr><td>${gageLabel}:</td><td>${fmtC(settings.tagesgage)}</td></tr>`;
  if (hasGage) html += `<tr><td>Stundensatz:</td><td>${fmtC(c.stundensatz)}</td></tr>`;
  if (settings.zeitkonto) html += `<tr><td>Zeitkonto:</td><td>aktiv</td></tr>`;
  html += `<tr><td>Anstellungstage:</td><td>${c.anstellungstage}</td></tr>`;
  html += `</table>`;

  // === ZUSAMMENFASSUNG ===
  html += `<h2>Zusammenfassung</h2>`;
  html += `<table><thead><tr>
    <th>Kennzahl</th><th class="num">Wert</th>
  </tr></thead><tbody>`;
  html += `<tr><td>Arbeitstage</td><td class="num">${c.totalArbeitstage}</td></tr>`;
  if (c.totalKranktage > 0) html += `<tr><td>Krankheitstage</td><td class="num">${c.totalKranktage}</td></tr>`;
  if (c.totalAZVTage > 0) html += `<tr><td>AZV-Tage</td><td class="num">${c.totalAZVTage}</td></tr>`;
  html += `<tr><td>Bezahlte Tage</td><td class="num">${c.totalBezahlteTage}</td></tr>`;
  html += `<tr><td>Gesamtstunden</td><td class="num">${fmt(c.totalStunden)}</td></tr>`;
  html += `<tr><td>Überstunden gesamt</td><td class="num">${fmt(c.totalUeberstunden)}</td></tr>`;
  html += `<tr><td>&nbsp;&nbsp;davon 25%</td><td class="num">${fmt(c.totalUeberstunden25)}</td></tr>`;
  html += `<tr><td>&nbsp;&nbsp;davon 50%</td><td class="num">${fmt(c.totalUeberstunden50)}</td></tr>`;
  if (c.totalUeberstunden100 > 0) html += `<tr><td>&nbsp;&nbsp;davon 100% (Feiertag)</td><td class="num">${fmt(c.totalUeberstunden100)}</td></tr>`;
  html += `<tr><td>Nachtstunden</td><td class="num">${fmt(c.totalNacht)}</td></tr>`;
  html += `<tr><td>Fahrzeit</td><td class="num">${fmt(c.totalFahrzeit)}</td></tr>`;
  html += `<tr><td>Samstage</td><td class="num">${fmt(c.totalSamstagsstunden || 0)} Std.</td></tr>`;
  html += `<tr><td>Sonntage</td><td class="num">${fmt(c.totalSonntagsstunden || 0)} Std.</td></tr>`;
  html += `<tr><td>Urlaubstage</td><td class="num">${fmt(c.urlaubstage)}</td></tr>`;
  html += `</tbody></table>`;

  // === WOCHENÜBERSICHT ===
  html += `<h2>Wochenübersicht</h2>`;
  html += `<table><thead><tr>
    <th>Zeitraum</th><th>Projekt</th><th class="num">Tage</th><th class="num">Stunden</th>
    <th class="num">Überstd.</th><th class="num">Nacht</th><th class="num">Sa</th><th class="num">So</th>`;
  if (hasGage) html += `<th class="num">Brutto</th>`;
  html += `</tr></thead><tbody>`;

  sorted.forEach(sheet => {
    const sc = calculateSheetTVFFS(sheet, settings);
    const firstDate = sheet.days.find(d => d.datum)?.datum || '';
    const lastDate = [...sheet.days].reverse().find(d => d.datum)?.datum || '';
    const label = firstDate ? `${firstDate} – ${lastDate}` : (sheet.kw ? `KW ${sheet.kw}` : '?');
    html += `<tr>
      <td>${label}</td><td>${sheet.projekt || ''}</td>
      <td class="num">${sc.totalBezahlteTage}</td><td class="num">${fmt(sc.totalStunden)}</td>
      <td class="num">${fmt(sc.totalUeberstunden)}</td><td class="num">${fmt(sc.totalNacht)}</td>
      <td class="num">${fmt(sc.totalSamstagsstunden || 0)}</td><td class="num">${fmt(sc.totalSonntagsstunden || 0)}</td>`;
    if (hasGage) html += `<td class="num">${fmtC(sc.gesamtVerdienst)}</td>`;
    html += `</tr>`;
  });

  // Summe row
  html += `<tr class="total-row">
    <td>Summe</td><td></td>
    <td class="num">${c.totalBezahlteTage}</td><td class="num">${fmt(c.totalStunden)}</td>
    <td class="num">${fmt(c.totalUeberstunden)}</td><td class="num">${fmt(c.totalNacht)}</td>
    <td class="num">${fmt(c.totalSamstagsstunden || 0)}</td><td class="num">${fmt(c.totalSonntagsstunden || 0)}</td>`;
  if (hasGage) html += `<td class="num">${fmtC(c.gesamtVerdienst)}</td>`;
  html += `</tr></tbody></table>`;

  // === VERDIENST ===
  if (hasGage) {
    html += `<h2>Verdienst (TV-FFS 2025)</h2>`;
    html += `<table><thead><tr><th>Position</th><th>Berechnung</th><th class="num">Betrag</th></tr></thead><tbody>`;

    html += `<tr><td>Grundgage</td><td>${c.totalBezahlteTage} Tage × ${fmtC(c.tagesgageEffective)}${c.totalKranktage > 0 ? ` (inkl. ${c.totalKranktage} Kranktag${c.totalKranktage > 1 ? 'e' : ''})` : ''}${c.totalAZVTage > 0 ? ` (inkl. ${c.totalAZVTage} AZV-Tag${c.totalAZVTage > 1 ? 'e' : ''})` : ''}</td><td class="num">${fmtC(c.grundgage)}</td></tr>`;

    if (!settings.zeitkonto && c.ueberstundenGrundverguetung > 0) {
      html += `<tr><td>Ü-Grundvergütung</td><td>${fmt(c.totalUeberstunden)} Std. × ${fmtC(c.stundensatz)}</td><td class="num">${fmtC(c.ueberstundenGrundverguetung)}</td></tr>`;
    }
    if (settings.zeitkonto && c.totalUeberstunden > 0) {
      html += `<tr><td>Überstunden → Zeitkonto</td><td>${fmt(c.zeitkontoStunden)} Std. → ${fmt(c.zeitkontoTage)} Anstellungstage</td><td class="num">—</td></tr>`;
    }
    if (c.zuschlag25 > 0) html += `<tr><td>Ü-Zuschlag 25% (TZ 5.4.3.2)</td><td>${fmt(c.totalUeberstunden25)} Std.</td><td class="num">${fmtC(c.zuschlag25)}</td></tr>`;
    if (c.zuschlag50 > 0) html += `<tr><td>Ü-Zuschlag 50% (TZ 5.4.3.2)</td><td>${fmt(c.totalUeberstunden50)} Std.</td><td class="num">${fmtC(c.zuschlag50)}</td></tr>`;
    if (c.zuschlag100 > 0) html += `<tr><td>Ü-Zuschlag 100%</td><td>${fmt(c.totalUeberstunden100)} Std.</td><td class="num">${fmtC(c.zuschlag100)}</td></tr>`;
    if (c.nachtZuschlag > 0) html += `<tr><td>Nachtzuschlag 25% (TZ 5.5.2)</td><td>${fmt(c.totalNacht)} Std.</td><td class="num">${fmtC(c.nachtZuschlag)}</td></tr>`;
    if (c.samstagZuschlag > 0) html += `<tr><td>Sa-Zuschlag 25% (TZ 5.6.4)</td><td>${fmt(c.totalSamstagsstunden || 0)} Std.</td><td class="num">${fmtC(c.samstagZuschlag)}</td></tr>`;
    if (c.sonntagZuschlag > 0) html += `<tr><td>So-Zuschlag 75% (TZ 5.6.3)</td><td>${fmt(c.totalSonntagsstunden || 0)} Std.</td><td class="num">${fmtC(c.sonntagZuschlag)}</td></tr>`;
    if (c.feiertagZuschlag > 0) html += `<tr><td>Feiertags-Zuschlag 100% (TZ 5.6.3)</td><td>${fmt(c.totalFeiertagsstunden || 0)} Std.</td><td class="num">${fmtC(c.feiertagZuschlag)}</td></tr>`;
    if (c.weeklyOTGrundverguetung > 0) html += `<tr><td>Wöch. Ü Grundvergütung (TZ 5.4.3.3)</td><td>${fmt((c.weeklyOT25 || 0) + (c.weeklyOT50 || 0))} Std.</td><td class="num">${fmtC(c.weeklyOTGrundverguetung)}</td></tr>`;
    if (c.weeklyOTZuschlag25 > 0) html += `<tr><td>Wöch. Ü-Zuschlag 25% (TZ 5.4.3.3)</td><td>${fmt(c.weeklyOT25 || 0)} Std.</td><td class="num">${fmtC(c.weeklyOTZuschlag25)}</td></tr>`;
    if (c.weeklyOTZuschlag50 > 0) html += `<tr><td>Wöch. Ü-Zuschlag 50% (TZ 5.4.3.3)</td><td>${fmt(c.weeklyOT50 || 0)} Std.</td><td class="num">${fmtC(c.weeklyOTZuschlag50)}</td></tr>`;

    if (c.urlaubstageOffen > 0) {
      html += `<tr><td>Urlaubstage (nicht genommen)</td><td>${c.urlaubstageOffen} Tage × ${fmtC(c.tagesgageEffective)}</td><td class="num">${fmtC(c.urlaubstageAuszahlung)}</td></tr>`;
    }
    if (settings.zeitkonto && c.zeitkontoTage > 0) {
      html += `<tr><td>Zeitkonto-Tage</td><td>${fmt(c.zeitkontoTage)} Tage × ${fmtC(c.tagesgageEffective)}</td><td class="num">${fmtC(c.zeitkontoTageAuszahlung)}</td></tr>`;
    }

    html += `<tr class="divider-row"><td colspan="3"></td></tr>`;
    html += `<tr class="total-row"><td>Gesamtverdienst</td><td></td><td class="num">${fmtC(c.gesamtVerdienst)}</td></tr>`;
    html += `</tbody></table>`;

    // Zeitkonto
    if (settings.zeitkonto && c.zeitkontoStunden > 0) {
      html += `<h2>Zeitkonto (Anlage A.1.1)</h2>`;
      html += `<table><thead><tr><th>Position</th><th class="num">Stunden</th><th class="num">Anstellungstage</th><th class="num">Wert</th></tr></thead><tbody>`;
      html += `<tr><td>Überstunden 25%</td><td class="num">${fmt(c.totalUeberstunden25)}</td><td class="num">${fmt(c.totalUeberstunden25 / 10)}</td><td class="num"></td></tr>`;
      html += `<tr><td>Überstunden 50%</td><td class="num">${fmt(c.totalUeberstunden50)}</td><td class="num">${fmt(c.totalUeberstunden50 / 10)}</td><td class="num"></td></tr>`;
      if (c.totalUeberstunden100 > 0) html += `<tr><td>Überstunden 100%</td><td class="num">${fmt(c.totalUeberstunden100)}</td><td class="num">${fmt(c.totalUeberstunden100 / 10)}</td><td class="num"></td></tr>`;
      html += `<tr class="total-row"><td>Zeitkonto Gesamt</td><td class="num">${fmt(c.zeitkontoStunden)}</td><td class="num">${fmt(c.zeitkontoTage)}</td><td class="num">${fmtC(c.zeitkontoWert)}</td></tr>`;
      html += `</tbody></table>`;
      html += `<p class="section-note">${fmt(c.zeitkontoStunden)} Std. ÷ 10 = ${fmt(c.zeitkontoTage)} Anstellungstage · Auflösung: 1/10 Tagesgage (${fmtC(c.stundensatz)}) pro Stunde zzgl. Zeitzuschläge</p>`;
    }

    // Urlaub
    html += `<h2>Urlaub (TZ 14.1 TV-FFS)</h2>`;
    html += `<table><tbody>`;
    html += `<tr><td>Gesammelte Urlaubstage</td><td class="num">${c.urlaubstage} Tage</td></tr>`;
    if (c.urlaubstageGenommen > 0) html += `<tr><td>Genommene Urlaubstage</td><td class="num">${c.urlaubstageGenommen} Tage</td></tr>`;
    html += `<tr><td>Offene Urlaubstage</td><td class="num">${c.urlaubstageOffen} Tage</td></tr>`;
    html += `</tbody></table>`;
    html += `<p class="section-note">${c.anstellungstage > 0 ? `0,5 Urlaubstag pro 7 zusammenhängende Anstellungstage (${c.anstellungstage} Tage ÷ 7 = ${c.totalWochen} × 0,5 = ${c.urlaubstage} Tage).` : `Summe der individuell berechneten Urlaubstage aller Personen (0,5 Tage pro 7 Anstellungstage).`}${c.urlaubstageOffen > 0 ? ` Nicht genommene Urlaubstage (${c.urlaubstageOffen}) werden als Tagesgage ausgezahlt.` : ''}</p>`;
  }

  html += `</body></html>`;
  return html;
}

function generateCSV(timesheets, c, settings, personFilter) {
  const sep = ';';
  const lines = [];
  const hasGage = settings.tagesgage > 0;
  const fmt = (n) => typeof n === 'number' ? n.toFixed(2).replace('.', ',') : '0,00';
  const fmtC = (n) => typeof n === 'number' ? (n.toFixed(2).replace('.', ',') + ' €') : '0,00 €';

  const personName = personFilter && personFilter !== 'all' ? personFilter : '';

  // ── HEADER ──
  lines.push(`ZEITBLICK ÜBERSICHT${personName ? ' — ' + personName : ''}`);
  lines.push(`Exportiert am${sep}${new Date().toLocaleDateString('de-DE')}`);
  if (personName) lines.push(`Person${sep}${personName}`);
  if (hasGage) {
    const gageLabel = settings.gageType === 'woche' ? 'Wochengage' : 'Tagesgage';
    lines.push(`${gageLabel}${sep}${fmtC(settings.tagesgage)}`);
    if (settings.zeitkonto) lines.push(`Zeitkonto${sep}aktiv`);
  }
  lines.push('');

  // ── ZUSAMMENFASSUNG ──
  lines.push('═══════════════════════════════════════');
  lines.push('ZUSAMMENFASSUNG');
  lines.push('───────────────────────────────────────');
  lines.push(`Arbeitstage${sep}${c.totalArbeitstage}`);
  if (c.totalKranktage > 0) lines.push(`Krankheitstage${sep}${c.totalKranktage}`);
  if (c.totalAZVTage > 0) lines.push(`AZV-Tage${sep}${c.totalAZVTage}`);
  lines.push(`Bezahlte Tage${sep}${c.totalBezahlteTage}`);
  lines.push(`Gesamtstunden${sep}${fmt(c.totalStunden)}`);
  lines.push(`Überstunden${sep}${fmt(c.totalUeberstunden)}`);
  lines.push(`  davon 25%${sep}${fmt(c.totalUeberstunden25)}`);
  lines.push(`  davon 50%${sep}${fmt(c.totalUeberstunden50)}`);
  if (c.totalUeberstunden100 > 0) lines.push(`  davon 100%${sep}${fmt(c.totalUeberstunden100)}`);
  lines.push(`Nachtstunden${sep}${fmt(c.totalNacht)}`);
  if (c.totalSamstagsstunden > 0) lines.push(`Samstage${sep}${fmt(c.totalSamstagsstunden)} Std.`);
  if (c.totalSonntagsstunden > 0) lines.push(`Sonntage${sep}${fmt(c.totalSonntagsstunden)} Std.`);
  lines.push(`Urlaubstage${sep}${c.urlaubstage}`);

  // ── VERDIENST ──
  if (hasGage) {
    lines.push('');
    lines.push('═══════════════════════════════════════');
    lines.push('VERDIENST (TV-FFS 2025)');
    lines.push('───────────────────────────────────────');
    lines.push(`Grundgage${sep}${c.totalBezahlteTage} Tage × ${fmtC(c.tagesgageEffective)}${sep}${fmtC(c.grundgage)}`);
    if (!settings.zeitkonto && c.ueberstundenGrundverguetung > 0) lines.push(`Ü-Grundvergütung${sep}${fmt(c.totalUeberstunden)} Std. × ${fmtC(c.stundensatz)}${sep}${fmtC(c.ueberstundenGrundverguetung)}`);
    if (c.zuschlag25 > 0) lines.push(`Ü-Zuschlag 25%${sep}${fmt(c.totalUeberstunden25)} Std.${sep}${fmtC(c.zuschlag25)}`);
    if (c.zuschlag50 > 0) lines.push(`Ü-Zuschlag 50%${sep}${fmt(c.totalUeberstunden50)} Std.${sep}${fmtC(c.zuschlag50)}`);
    if (c.zuschlag100 > 0) lines.push(`Ü-Zuschlag 100%${sep}${fmt(c.totalUeberstunden100)} Std.${sep}${fmtC(c.zuschlag100)}`);
    if (c.nachtZuschlag > 0) lines.push(`Nachtzuschlag 25%${sep}${fmt(c.totalNacht)} Std.${sep}${fmtC(c.nachtZuschlag)}`);
    if (c.samstagZuschlag > 0) lines.push(`Sa-Zuschlag 25%${sep}${fmt(c.totalSamstagsstunden || 0)} Std.${sep}${fmtC(c.samstagZuschlag)}`);
    if (c.sonntagZuschlag > 0) lines.push(`So-Zuschlag 75%${sep}${fmt(c.totalSonntagsstunden || 0)} Std.${sep}${fmtC(c.sonntagZuschlag)}`);
    if (c.feiertagZuschlag > 0) lines.push(`Feiertags-Zuschlag 100%${sep}${fmt(c.totalFeiertagsstunden || 0)} Std.${sep}${fmtC(c.feiertagZuschlag)}`);
    if (c.weeklyOTGrundverguetung > 0) lines.push(`Wöch. Ü Grundvergütung (5.4.3.3)${sep}${fmt((c.weeklyOT25 || 0) + (c.weeklyOT50 || 0))} Std.${sep}${fmtC(c.weeklyOTGrundverguetung)}`);
    if (c.weeklyOTZuschlag25 > 0) lines.push(`Wöch. Ü-Zuschlag 25% (5.4.3.3)${sep}${fmt(c.weeklyOT25 || 0)} Std.${sep}${fmtC(c.weeklyOTZuschlag25)}`);
    if (c.weeklyOTZuschlag50 > 0) lines.push(`Wöch. Ü-Zuschlag 50% (5.4.3.3)${sep}${fmt(c.weeklyOT50 || 0)} Std.${sep}${fmtC(c.weeklyOTZuschlag50)}`);
    if (c.urlaubstageOffen > 0) lines.push(`Urlaubstage (nicht genommen)${sep}${c.urlaubstageOffen} Tage${sep}${fmtC(c.urlaubstageAuszahlung)}`);
    if (settings.zeitkonto && c.zeitkontoTage > 0) lines.push(`Zeitkonto-Tage${sep}${fmt(c.zeitkontoTage)} Tage${sep}${fmtC(c.zeitkontoTageAuszahlung)}`);
    lines.push('───────────────────────────────────────');
    lines.push(`GESAMTVERDIENST${sep}${sep}${fmtC(c.gesamtVerdienst)}`);

    // Zeitkonto
    if (settings.zeitkonto && c.zeitkontoStunden > 0) {
      lines.push('');
      lines.push('═══════════════════════════════════════');
      lines.push('ZEITKONTO');
      lines.push('───────────────────────────────────────');
      lines.push(`Zeitkonto-Stunden${sep}${fmt(c.zeitkontoStunden)}`);
      lines.push(`Zeitkonto-Anstellungstage${sep}${fmt(c.zeitkontoTage)}`);
      lines.push(`Zeitkonto-Wert (bei Auflösung)${sep}${fmtC(c.zeitkontoWert)}`);
    }
  }

  // ── URLAUB ──
  lines.push('');
  lines.push('═══════════════════════════════════════');
  lines.push('URLAUB (TZ 14.1)');
  lines.push('───────────────────────────────────────');
  lines.push(`Gesammelte Urlaubstage${sep}${c.urlaubstage}`);
  if (c.urlaubstageGenommen > 0) lines.push(`Genommene Urlaubstage${sep}${c.urlaubstageGenommen}`);
  lines.push(`Offene Urlaubstage${sep}${c.urlaubstageOffen}`);
  lines.push(c.anstellungstage > 0
    ? `Berechnung${sep}${c.anstellungstage} Anstellungstage ÷ 7 = ${c.totalWochen} × 0,5 = ${c.urlaubstage}`
    : `Berechnung${sep}Summe individueller Urlaubstage aller Personen = ${c.urlaubstage}`);

  // ── WOCHENÜBERSICHT ──
  lines.push('');
  lines.push('═══════════════════════════════════════');
  lines.push('WOCHENÜBERSICHT');
  lines.push('───────────────────────────────────────');
  const header = ['Woche', 'Projekt', 'Name', 'Tage', 'Stunden', 'Überstunden', 'Nacht'];
  if (hasGage) header.push('Brutto');
  lines.push(header.join(sep));

  const sorted = [...timesheets].sort((a, b) => {
    const dA = a.days.find(d => d.datum)?.datum || '';
    const dB = b.days.find(d => d.datum)?.datum || '';
    return parseDateDE(dA) - parseDateDE(dB);
  });

  sorted.forEach(sheet => {
    const sc = calculateSheetTVFFS(sheet, settings);
    const firstDate = sheet.days.find(d => d.datum)?.datum || '';
    const lastDate = [...sheet.days].reverse().find(d => d.datum)?.datum || '';
    const weekLabel = firstDate ? `${firstDate} - ${lastDate}` : (sheet.kw ? `KW ${sheet.kw}` : '?');
    const row = [
      weekLabel,
      sheet.projekt || '',
      sheet.name || '',
      sc.totalBezahlteTage,
      fmt(sc.totalStunden),
      fmt(sc.totalUeberstunden),
      fmt(sc.totalNacht),
    ];
    if (hasGage) {
      row.push(fmtC(sc.gesamtVerdienst));
    }
    lines.push(row.join(sep));
  });

  // Summe
  lines.push('───────────────────────────────────────');
  const sumRow = ['SUMME', '', '', c.totalBezahlteTage, fmt(c.totalStunden), fmt(c.totalUeberstunden), fmt(c.totalNacht)];
  if (hasGage) sumRow.push(fmtC(c.gesamtVerdienst));
  lines.push(sumRow.join(sep));

  return lines.join('\n');
}

export default function Dashboard({ timesheets, calculations, settings: propSettings, effectiveSettings: propEffectiveSettings, onSettings: propOnSettings, onViewDetail, onUpdateTimesheets, projects, projectFilter: propProjectFilter, onProjectFilter: propOnProjectFilter, personFilter: propPersonFilter, onPersonFilter: propOnPersonFilter, allTimesheets, personFilteredTimesheets, getPersonSettings: propGetPersonSettings, resolveName: propResolveName, getBaseProject: propGetBaseProject, completedProjects }) {
  // Use contexts with prop fallback for backward compatibility
  const filterCtx = useFilters();
  const settingsCtx = useSettings();
  const personFilter = propPersonFilter ?? filterCtx.personFilter;
  const onPersonFilter = propOnPersonFilter ?? filterCtx.onPersonFilter;
  const projectFilter = propProjectFilter ?? filterCtx.projectFilter;
  const onProjectFilter = propOnProjectFilter ?? filterCtx.onProjectFilter;
  const settings = propSettings ?? settingsCtx.settings;
  const onSettings = propOnSettings ?? settingsCtx.onSettings;
  const getPersonSettings = propGetPersonSettings ?? settingsCtx.getPersonSettings;

  const c = calculations;
  const hasData = timesheets.length > 0;
  const es = propEffectiveSettings || settingsCtx.effectiveSettings || settings;
  const hasGage = es.tagesgage > 0;
  const resolve = propResolveName || settingsCtx.resolveName || ((n) => n);
  const baseProject = propGetBaseProject || settingsCtx.getBaseProject || ((p) => p || 'Sonstiges');

  const [gageInput, setGageInput] = useState(es.tagesgage || '');
  const [gageType, setGageType] = useState(es.gageType || 'tag');
  const [zeitkonto, setZeitkonto] = useState(settings.zeitkonto || false);
  const [showExport, setShowExport] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [spesenInput, setSpesenInput] = useState({ datum: '', beschreibung: '', betrag: '', kategorie: 'Fahrt' });
  const [spesenCollapsed, setSpesenCollapsed] = useState(true);
  const [draggedPerson, setDraggedPerson] = useState(null);
  const [dropTarget, setDropTarget] = useState(null); // 'stammteam' or 'weitere'
  const hiddenZusatzPersonen = settings.hiddenZusatzPersonen || [];
  const setHiddenZusatzPersonen = (val) => {
    const newVal = typeof val === 'function' ? val(hiddenZusatzPersonen) : val;
    onSettings({ ...settings, hiddenZusatzPersonen: newVal });
  };

  const spesenKategorien = ['Fahrt', 'Unterkunft', 'Verpflegung', 'Material', 'Sonstiges'];

  // Close export menu on outside click or Escape
  useEffect(() => {
    if (!showExport) return;
    const clickHandler = () => setShowExport(false);
    const keyHandler = (e) => { if (e.key === 'Escape') setShowExport(false); };
    setTimeout(() => {
      document.addEventListener('click', clickHandler);
      document.addEventListener('keydown', keyHandler);
    }, 0);
    return () => {
      document.removeEventListener('click', clickHandler);
      document.removeEventListener('keydown', keyHandler);
    };
  }, [showExport]);

  const handleExportCSV = async () => {
    setShowExport(false);
    setExporting(true);
    try {
      const csv = generateCSV(timesheets, c, settings, personFilter);
      const personSuffix = personFilter !== 'all' ? `-${personFilter}` : '';
      await window.electronAPI.exportCSV(csv, `ZeitBlick-Export${personSuffix}-${new Date().toISOString().slice(0,10)}.csv`);
    } finally {
      setExporting(false);
    }
  };

  const handleExportPDF = async () => {
    setShowExport(false);
    setExporting(true);
    try {
      const html = generatePDFHTML(timesheets, c, settings, personFilter);
      const personSuffix = personFilter !== 'all' ? `-${personFilter}` : '';
      const result = await window.electronAPI.exportPDF(html, `ZeitBlick-Übersicht${personSuffix}-${new Date().toISOString().slice(0,10)}.pdf`);
      if (result && !result.success && result.error) {
        alert('Export fehlgeschlagen: ' + result.error);
      }
    } finally {
      setExporting(false);
    }
  };

  const handleExportExcel = async () => {
    setShowExport(false);
    setExporting(true);
    try {
    const hasGage = settings.tagesgage > 0;
    const fmt = (n) => typeof n === 'number' ? Math.round(n * 100) / 100 : 0;

    // Summary sheet
    const summaryData = [
      ['ZeitBlick Übersicht', personFilter !== 'all' ? personFilter : ''],
      ['Exportiert am', new Date().toLocaleDateString('de-DE')],
      [],
      ['Kennzahl', 'Wert'],
      ['Arbeitstage', c.totalArbeitstage],
      ['Bezahlte Tage', c.totalBezahlteTage],
      ['Gesamtstunden', fmt(c.totalStunden)],
      ['Überstunden', fmt(c.totalUeberstunden)],
      ['Nachtstunden', fmt(c.totalNacht)],
      ['Samstage (Std.)', fmt(c.totalSamstagsstunden || 0)],
      ['Sonntage (Std.)', fmt(c.totalSonntagsstunden || 0)],
      ['Urlaubstage', c.urlaubstage],
    ];
    if (hasGage) summaryData.push([], ['Gesamtverdienst', fmt(c.gesamtVerdienst)]);

    // Week overview sheet
    const weekHeader = ['Zeitraum', 'Projekt', 'Name', 'Tage', 'Stunden', 'Überstunden', 'Nacht'];
    if (hasGage) weekHeader.push('Brutto');
    const sorted = [...timesheets].sort((a, b) => parseDateDE(a.days.find(d => d.datum)?.datum) - parseDateDE(b.days.find(d => d.datum)?.datum));
    const weekRows = sorted.map(sheet => {
      const sc = calculateSheetTVFFS(sheet, settings);
      const firstDate = sheet.days.find(d => d.datum)?.datum || '';
      const lastDate = [...sheet.days].reverse().find(d => d.datum)?.datum || '';
      const row = [`${firstDate} – ${lastDate}`, sheet.projekt || '', sheet.name || '', sc.totalBezahlteTage, fmt(sc.totalStunden), fmt(sc.totalUeberstunden), fmt(sc.totalNacht)];
      if (hasGage) row.push(fmt(sc.gesamtVerdienst));
      return row;
    });

    const xlsxData = {
      sheets: [
        { name: 'Zusammenfassung', data: summaryData },
        { name: 'Wochenübersicht', data: [weekHeader, ...weekRows] },
      ]
    };
    const personSuffix = personFilter !== 'all' ? `-${personFilter}` : '';
    await window.electronAPI.exportXLSX(xlsxData, `ZeitBlick-Export${personSuffix}-${new Date().toISOString().slice(0,10)}.xlsx`);
    } finally {
      setExporting(false);
    }
  };

  // Determine what gage value the input bar should show:
  // When person+project selected → personProjectGagen
  // When only person selected → personGagen
  // Otherwise → global/effective
  useEffect(() => {
    if (personFilter !== 'all' && projectFilter !== 'all') {
      const ppg = ((settings.personProjectGagen || {})[personFilter] || {})[projectFilter] || {};
      if (ppg.tagesgage > 0) {
        setGageInput(ppg.tagesgage || '');
        setGageType(ppg.gageType || settings.gageType || 'tag');
      } else {
        const pg = (settings.personGagen || {})[personFilter] || {};
        setGageInput(pg.tagesgage || '');
        setGageType(pg.gageType || settings.gageType || 'tag');
      }
    } else if (personFilter !== 'all') {
      const pg = (settings.personGagen || {})[personFilter] || {};
      setGageInput(pg.tagesgage || '');
      setGageType(pg.gageType || settings.gageType || 'tag');
    } else {
      setGageInput(es.tagesgage || '');
      setGageType(es.gageType || 'tag');
    }
    setZeitkonto(settings.zeitkonto || false);
  }, [settings, es, personFilter, projectFilter]);

  // Save gage — per-person-per-project when both selected, per-person when only person, otherwise global
  const handleGageChange = (value) => {
    setGageInput(value);
    const numVal = parseFloat(String(value).replace(',', '.')) || 0;
    if (personFilter !== 'all' && projectFilter !== 'all') {
      const ppg = { ...(settings.personProjectGagen || {}) };
      ppg[personFilter] = { ...(ppg[personFilter] || {}) };
      ppg[personFilter][projectFilter] = { ...(ppg[personFilter][projectFilter] || {}), tagesgage: numVal, gageType: gageType };
      onSettings({ ...settings, personProjectGagen: ppg });
    } else if (personFilter !== 'all') {
      const pg = { ...(settings.personGagen || {}) };
      pg[personFilter] = { ...(pg[personFilter] || {}), tagesgage: numVal, gageType: gageType };
      onSettings({ ...settings, personGagen: pg });
    } else {
      onSettings({ ...settings, tagesgage: numVal });
    }
  };

  const handleGageTypeChange = (type) => {
    setGageType(type);
    if (personFilter !== 'all' && projectFilter !== 'all') {
      const ppg = { ...(settings.personProjectGagen || {}) };
      ppg[personFilter] = { ...(ppg[personFilter] || {}) };
      ppg[personFilter][projectFilter] = { ...(ppg[personFilter][projectFilter] || {}), gageType: type, tagesgage: parseFloat(String(gageInput).replace(',', '.')) || 0 };
      onSettings({ ...settings, personProjectGagen: ppg });
    } else if (personFilter !== 'all') {
      const pg = { ...(settings.personGagen || {}) };
      pg[personFilter] = { ...(pg[personFilter] || {}), gageType: type, tagesgage: parseFloat(String(gageInput).replace(',', '.')) || 0 };
      onSettings({ ...settings, personGagen: pg });
    } else {
      onSettings({ ...settings, gageType: type });
    }
  };

  const handleZeitkontoToggle = () => {
    const newVal = !zeitkonto;
    setZeitkonto(newVal);
    onSettings({ ...settings, zeitkonto: newVal });
  };

  const handleAddSpesen = () => {
    const betrag = parseFloat(spesenInput.betrag.replace(',', '.')) || 0;
    if (!spesenInput.beschreibung || betrag <= 0) return;
    const newSpese = {
      id: Date.now(),
      datum: spesenInput.datum || new Date().toLocaleDateString('de-DE'),
      beschreibung: spesenInput.beschreibung,
      betrag,
      kategorie: spesenInput.kategorie,
    };
    const newSpesen = [...(settings.spesen || []), newSpese];
    onSettings({ ...settings, spesen: newSpesen });
    setSpesenInput({ datum: '', beschreibung: '', betrag: '', kategorie: 'Fahrt' });
  };

  const handleDeleteSpesen = (id) => {
    const newSpesen = (settings.spesen || []).filter(s => s.id !== id);
    onSettings({ ...settings, spesen: newSpesen });
  };

  const spesenTotal = (settings.spesen || []).reduce((sum, s) => sum + s.betrag, 0);

  // === Per-person stats (for "Alle Personen" overview) ===
  const isAllPersons = personFilter === 'all';
  // When project filter is active, filter allTimesheets by project for crew stats
  const tsForCrew = useMemo(() => {
    const base = allTimesheets || timesheets;
    if (projectFilter && projectFilter !== 'all') {
      return base.filter(t => baseProject(t.projekt) === projectFilter);
    }
    return base;
  }, [allTimesheets, timesheets, projectFilter, baseProject]);
  const personStats = useMemo(() => {
    if (!isAllPersons || tsForCrew.length === 0) return [];

    // Group timesheets by person (using resolved names)
    const byPerson = {};
    for (const ts of tsForCrew) {
      const name = resolve(ts.name || 'Unbekannt');
      if (!byPerson[name]) byPerson[name] = [];
      byPerson[name].push(ts);
    }

    // Calculate per-person stats
    const stats = Object.entries(byPerson).map(([name, sheets]) => {
      const personSettings = getPersonSettings ? getPersonSettings(name, projectFilter !== 'all' ? projectFilter : undefined) : settings;
      const pc = calcTVFFS(sheets, personSettings);

      // Collect unique work dates for this person
      const dates = new Set();
      for (const s of sheets) {
        for (const d of s.days) {
          if (d.datum && (Number(d.stundenTotal) > 0 || (d.start && String(d.start).trim().includes(':')))) {
            dates.add(d.datum);
          }
        }
      }

      // Detect if person is a "Vertretung" or has any sick days
      // Only mark as Vertretung if majority of work days have "Vertretung" annotation
      let vertretungDays = 0;
      let totalWorkDays = 0;
      let hasKrank = false;
      for (const s of sheets) {
        for (const d of s.days) {
          const a = (d.anmerkungen || '').toLowerCase().trim();
          const hasWork = Number(d.stundenTotal) > 0 || (d.start && String(d.start).trim().includes(':'));
          if (hasWork) totalWorkDays++;
          if (a.includes('vertretung')) vertretungDays++;
          if (a.includes('krank')) hasKrank = true;
        }
      }
      const isVertretung = totalWorkDays > 0 && vertretungDays > totalWorkDays / 2;

      return {
        name,
        sheets: sheets.length,
        arbeitstage: pc.totalArbeitstage,
        stunden: pc.totalStunden,
        ueberstunden: pc.totalUeberstunden,
        nacht: pc.totalNacht,
        verdienst: pc.gesamtVerdienst,
        kranktage: pc.totalKranktage,
        samstage: pc.totalSamstagsstunden,
        sonntage: pc.totalSonntagsstunden,
        urlaubstage: pc.urlaubstage,
        urlaubstageGenommen: pc.urlaubstageGenommen,
        dates,
        isVertretung,
        vertretungDays,
        hasKrank,
      };
    });

    // Collect positions from timesheets
    const personPositions = {};
    for (const ts of tsForCrew) {
      const name = resolve(ts.name || 'Unbekannt');
      if (ts.position && !personPositions[name]) personPositions[name] = ts.position;
    }

    // Attach position to each stat entry
    for (const s of stats) {
      s.position = personPositions[s.name] || '';
    }

    // Sort by arbeitstage desc
    stats.sort((a, b) => b.arbeitstage - a.arbeitstage);
    return stats;
  }, [isAllPersons, tsForCrew, settings, getPersonSettings, resolve]);

  // Calculate Zusatztage: for people not present every day
  const zusatztageInfo = useMemo(() => {
    if (!isAllPersons || personStats.length <= 1) return null;
    // Only calculate when a specific project is selected
    if (!projectFilter || projectFilter === 'all') return null;

    // Collect all unique work dates across everyone
    const allDates = new Set();
    for (const ps of personStats) {
      for (const d of ps.dates) allDates.add(d);
    }
    const totalUniqueDays = allDates.size;

    // Person with most days = Hauptcrew reference
    const maxDays = personStats[0]?.arbeitstage || 0;

    // Zusatztage: persons not in Stammteam and not Vertretung
    // Only consider Stammteam from the currently filtered project(s)
    const crewNames = new Set();
    const projectCrews = settings.projectCrews || {};
    if (projectFilter && projectFilter !== 'all') {
      // Single project selected: only that project's Stammteam
      for (const name of (projectCrews[projectFilter] || [])) {
        crewNames.add(resolve(name));
      }
    } else {
      // All projects: collect unique project names from displayed timesheets
      // and use each person's Stammteam status per their projects
      const displayedProjects = new Set(timesheets.map(t => baseProject(t.projekt)));
      for (const proj of displayedProjects) {
        for (const name of (projectCrews[proj] || [])) {
          crewNames.add(resolve(name));
        }
      }
    }
    const zusatzPersonen = personStats
      .filter(ps => !crewNames.has(ps.name))
      .filter(ps => !ps.isVertretung)
      .filter(ps => !hiddenZusatzPersonen.includes(ps.name))
      .map(ps => ({ name: ps.name, tage: ps.arbeitstage - (ps.vertretungDays || 0) }));
    const totalZusatztage = zusatzPersonen.reduce((sum, zp) => sum + zp.tage, 0);

    // Total person-days (all people combined)
    const totalPersonTage = personStats.reduce((sum, ps) => sum + ps.arbeitstage, 0);

    return {
      totalUniqueDays,
      totalPersonTage,
      maxDays,
      hauptcrew: personStats[0]?.name || '',
      zusatzPersonen,
      totalZusatztage,
    };
  }, [isAllPersons, personStats, hiddenZusatzPersonen, settings, projectFilter, timesheets, resolve, baseProject]);

  // === Per-project breakdown — always use unfiltered-by-project data ===
  const projectStats = useMemo(() => {
    // Use personFilteredTimesheets (person-filtered but NOT project-filtered) to always show all projects
    const baseTS = isAllPersons ? (allTimesheets || timesheets) : (personFilteredTimesheets || timesheets);
    if (baseTS.length === 0) return [];
    const byProject = {};
    for (const ts of baseTS) {
      const proj = baseProject(ts.projekt);
      if (!byProject[proj]) byProject[proj] = [];
      byProject[proj].push(ts);
    }
    return Object.entries(byProject).map(([projektName, sheets]) => {
      const uniquePersons = [...new Set(sheets.map(s => resolve(s.name || 'Unbekannt')))].sort();
      let totalHours = 0, totalOvertime = 0;
      for (const s of sheets) {
        for (const d of s.days) {
          totalHours += Number(d.stundenTotal) || 0;
          totalOvertime += Number(d.ueberstunden) || 0;
        }
      }
      return {
        projekt: projektName,
        sheets: sheets.length,
        personen: uniquePersons.length,
        people: uniquePersons,
        totalHours,
        totalOvertime,
      };
    }).sort((a, b) => {
      // Nicht abgeschlossene Projekte zuerst, dann nach Zettelanzahl
      const aCompleted = !!(completedProjects && completedProjects[a.projekt]);
      const bCompleted = !!(completedProjects && completedProjects[b.projekt]);
      if (aCompleted !== bCompleted) return aCompleted ? 1 : -1;
      return b.sheets - a.sheets;
    });
  }, [timesheets, allTimesheets, personFilteredTimesheets, isAllPersons, settings, baseProject, resolve, completedProjects]);

  // === Full per-project stats for individual person view (with TVFFS calculations) ===
  const personProjectStats = useMemo(() => {
    if (isAllPersons) return [];
    const baseTS = personFilteredTimesheets || timesheets;
    if (baseTS.length === 0) return [];
    const byProject = {};
    for (const ts of baseTS) {
      const proj = baseProject(ts.projekt);
      if (!byProject[proj]) byProject[proj] = [];
      byProject[proj].push(ts);
    }
    return Object.entries(byProject).map(([projektName, sheets]) => {
      const projSettings = getPersonSettings ? getPersonSettings(personFilter, projektName) : (es || settings);
      const pc = calcTVFFS(sheets, projSettings);
      return {
        projekt: projektName,
        sheets: sheets.length,
        arbeitstage: pc.totalArbeitstage,
        stunden: pc.totalStunden,
        ueberstunden: pc.totalUeberstunden,
        nacht: pc.totalNacht,
        fahrzeit: pc.totalFahrzeit,
        samstage: pc.totalSamstagsstunden,
        sonntage: pc.totalSonntagsstunden,
        verdienst: pc.gesamtVerdienst,
      };
    }).sort((a, b) => b.stunden - a.stunden);
  }, [timesheets, personFilteredTimesheets, isAllPersons, es, settings, baseProject, getPersonSettings, personFilter]);

  // Build chart data: hours per week, sorted by date
  const sortedTimesheets = useMemo(() => {
    return [...timesheets].sort((a, b) => {
      const dA = a.days.find(d => d.datum)?.datum || '';
      const dB = b.days.find(d => d.datum)?.datum || '';
      return parseDateDE(dA) - parseDateDE(dB);
    });
  }, [timesheets]);
  const chartData = sortedTimesheets.map(sheet => {
    const sc = calculateSheetTVFFS(sheet, settings);
    const firstDate = sheet.days.find(d => d.datum)?.datum || '';
    const lastDate = [...sheet.days].reverse().find(d => d.datum)?.datum || '';
    const label = firstDate ? `${firstDate.slice(0,5)}–${lastDate.slice(0,5)}` : (sheet.kw ? `KW${sheet.kw}` : '?');
    return { label, stunden: sc.totalStunden, ueberstunden: sc.totalUeberstunden };
  });
  const chartMax = Math.max(10, ...chartData.map(d => d.stunden));

  const displayStundensatz = () => {
    const val = parseFloat(String(gageInput).replace(',', '.')) || 0;
    if (val === 0) return null;
    const stundensatz = gageType === 'tag' ? val / 10 : val / 50;
    return stundensatz.toLocaleString('de-DE', { minimumFractionDigits: 2 });
  };

  if (!hasData) {
    return (
      <div className="dashboard empty-state">
        <div className="empty-icon">📂</div>
        <h2>Keine Daten vorhanden</h2>
        <p>
          {personFilter !== 'all'
            ? `Keine Daten für ${personFilter} gefunden.`
            : 'Ziehe PDFs per Drag & Drop hierher oder klicke auf "PDF importieren" in der Seitenleiste.'}
        </p>
      </div>
    );
  }

  const uniquePersons = [...new Set((allTimesheets || timesheets).map(t => resolve(t.name || 'Unbekannt')))];
  const showCrewOverview = isAllPersons && uniquePersons.length > 1;

  // Auto-select first project when person is selected with no project
  useEffect(() => {
    const personLabel = personFilter !== 'all' ? personFilter : null;
    if (personLabel && projectFilter === 'all' && projects && projects.length > 0) {
      onProjectFilter && onProjectFilter(projects[0]);
    }
  }, [personFilter, projectFilter, projects, onProjectFilter]);

  // --- CREW OVERVIEW (clean, standalone) ---
  if (showCrewOverview) {
    return (
      <div className="dashboard">
        <div className="dashboard-header">
          <div className="dashboard-header-left">
            <h2>Crew-Übersicht</h2>
            <span className="subtitle">{uniquePersons.length} Personen · {c.totalWochen} Woche{c.totalWochen !== 1 ? 'n' : ''} importiert</span>
          </div>
          <div className="dashboard-header-right">
            {projects && projects.length > 1 && (
              <select className="project-filter" value={projectFilter} onChange={e => onProjectFilter(e.target.value)}>
                <option value="all">Alle Projekte</option>
                {projects.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            )}
            <div className="export-dropdown">
              <button className="export-btn" onClick={() => setShowExport(!showExport)} disabled={exporting} aria-label="Exportieren">
                {exporting ? '⏳ Exportiert…' : '↗ Exportieren'}
              </button>
              {showExport && !exporting && (
                <div className="export-menu" role="menu">
                  <button onClick={() => handleExportCSV()} role="menuitem">CSV exportieren</button>
                  <button onClick={() => handleExportPDF()} role="menuitem">PDF exportieren</button>
                  <button onClick={() => handleExportExcel()} role="menuitem">Excel exportieren</button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Projektübersicht in Crew View */}
        {projectStats.length > 1 && projectFilter === 'all' && (
          <div className="project-tiles-grid">
            {projectStats.map(ps => {
              const isCompleted = !!(completedProjects && completedProjects[ps.projekt]);
              const getInitials = (name) => name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
              return (
                <div
                  key={ps.projekt}
                  className={`project-tile${isCompleted ? ' project-tile-completed' : ''}`}
                  onClick={() => onProjectFilter && onProjectFilter(ps.projekt)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') onProjectFilter && onProjectFilter(ps.projekt); }}
                  aria-label={`Projekt ${ps.projekt} öffnen`}
                >
                  <div className="project-tile-header">
                    <span className="project-tile-name">
                      {isCompleted && <span className="project-completed-icon" title="Abgeschlossen">✅</span>}
                      {ps.projekt}
                    </span>
                    <span className="project-tile-badge">{ps.sheets}</span>
                  </div>
                  <div className="project-tile-stats">
                    <div className="project-tile-stat">
                      <span className="project-tile-stat-value">{ps.totalHours.toFixed(1)}</span>
                      <span className="project-tile-stat-label">Stunden</span>
                    </div>
                    <div className="project-tile-stat">
                      <span className="project-tile-stat-value">{ps.totalOvertime.toFixed(1)}</span>
                      <span className="project-tile-stat-label">Überstunden</span>
                    </div>
                    <div className="project-tile-stat">
                      <span className="project-tile-stat-value">{ps.personen}</span>
                      <span className="project-tile-stat-label">Personen</span>
                    </div>
                  </div>
                  <div className="project-tile-footer">
                    <div className="project-tile-people">
                      {ps.people.slice(0, 5).map(p => (
                        <span key={p} className="project-tile-avatar" title={p}>{getInitials(p)}</span>
                      ))}
                      {ps.people.length > 5 && <span className="project-tile-avatar project-tile-avatar-more">+{ps.people.length - 5}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {projectFilter !== 'all' && projectStats.length > 1 && (
          <div className="stats-section">
            <button className="project-filter-reset-btn" onClick={() => onProjectFilter && onProjectFilter('all')}>
              ← Zurück zur Projektübersicht
            </button>
          </div>
        )}

        {/* Person cards with per-project Stammteam (drag & drop) */}
        {(() => {
          // Determine which project to show Stammteam for
          // Auto-select if only one project exists
          const activeProject = projectFilter !== 'all' ? projectFilter
            : projectStats.length === 1 ? projectStats[0].projekt
            : null;
          const projectCrews = settings.projectCrews || {};

          // Drag & drop handlers
          const handleDragStart = (e, personName) => {
            setDraggedPerson(personName);
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', personName);

            // Create ghost drag image
            const card = e.target.closest('.crew-card');
            if (card) {
              const ghost = card.cloneNode(true);
              ghost.style.position = 'absolute';
              ghost.style.top = '-9999px';
              ghost.style.left = '-9999px';
              ghost.style.width = card.offsetWidth + 'px';
              ghost.style.opacity = '0.85';
              ghost.style.transform = 'rotate(-2deg) scale(0.95)';
              ghost.style.boxShadow = '0 8px 32px rgba(0,0,0,0.25)';
              ghost.style.borderRadius = 'var(--radius-lg)';
              ghost.style.pointerEvents = 'none';
              document.body.appendChild(ghost);
              e.dataTransfer.setDragImage(ghost, card.offsetWidth / 2, 20);
              // Clean up ghost after drag starts
              setTimeout(() => ghost.remove(), 0);
            }

            // Add a slight delay so the dragging class applies
            setTimeout(() => card?.classList.add('crew-card-dragging'), 0);
          };
          const handleDragEnd = (e) => {
            setDraggedPerson(null);
            setDropTarget(null);
            e.target.closest('.crew-card')?.classList.remove('crew-card-dragging');
          };
          const handleDragOver = (e, zone) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            setDropTarget(zone);
          };
          const handleDragLeave = (e, zone) => {
            // Only clear if actually leaving the zone
            if (!e.currentTarget.contains(e.relatedTarget)) {
              setDropTarget(null);
            }
          };
          const handleDrop = (e, zone, projekt) => {
            e.preventDefault();
            const name = e.dataTransfer.getData('text/plain');
            setDraggedPerson(null);
            setDropTarget(null);
            if (!name || !projekt) return;
            const current = [...(projectCrews[projekt] || [])];
            if (zone === 'stammteam' && !current.includes(name)) {
              // Add to Stammteam
              onSettings({ ...settings, projectCrews: { ...projectCrews, [projekt]: [...current, name] } });
            } else if (zone === 'weitere' && current.includes(name)) {
              // Remove from Stammteam
              onSettings({ ...settings, projectCrews: { ...projectCrews, [projekt]: current.filter(n => n !== name) } });
            }
          };

          const renderCard = (ps, isDraggable, projekt) => (
            <div
              key={ps.name}
              className={`crew-card crew-card-clickable ${draggedPerson === ps.name ? 'crew-card-dragging' : ''}`}
              draggable={isDraggable}
              onDragStart={isDraggable ? (e) => handleDragStart(e, ps.name) : undefined}
              onDragEnd={isDraggable ? handleDragEnd : undefined}
            >
              <div className="crew-card-header" onClick={() => onPersonFilter && onPersonFilter(ps.name)}>
                <div className="crew-avatar">{ps.name.charAt(0).toUpperCase()}</div>
                <div className="crew-name-block">
                  <span className="crew-name">{ps.name}</span>
                  {ps.position && <span className="crew-position">{ps.position}</span>}
                  <span className="crew-sheets">{ps.sheets} Zettel · {ps.arbeitstage} Tage</span>
                </div>
                <span className="crew-card-arrow">→</span>
              </div>
              <div className="crew-stats">
                <div className="crew-stat">
                  <span className="crew-stat-value">{ps.stunden.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  <span className="crew-stat-label">Stunden</span>
                </div>
                <div className="crew-stat">
                  <span className="crew-stat-value">{ps.ueberstunden.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  <span className="crew-stat-label">Überstd.</span>
                </div>
                <div className="crew-stat">
                  <span className="crew-stat-value">{ps.nacht.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  <span className="crew-stat-label">Nacht</span>
                </div>
              </div>
              <div className="crew-detail-row">
                {ps.samstage > 0 && <span className="crew-badge crew-badge-sa">Sa {ps.samstage.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Std.</span>}
                {ps.sonntage > 0 && <span className="crew-badge crew-badge-so">So {ps.sonntage.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Std.</span>}
                {ps.kranktage > 0 && <span className="crew-badge crew-badge-krank">🤒 {ps.kranktage} krank</span>}
                {ps.urlaubstageGenommen > 0 && <span className="crew-badge">🏖 {ps.urlaubstageGenommen} Urlaub</span>}
              </div>
            </div>
          );

          // Render crew sections for a specific project
          const renderProjectCrew = (projekt) => {
            const stammNames = new Set((projectCrews[projekt] || []).map(n => resolve(n)));
            // Filter personStats to people who have timesheets in this project
            const baseTS = allTimesheets || timesheets;
            const projectPersons = new Set(
              baseTS.filter(t => baseProject(t.projekt) === projekt).map(t => resolve(t.name || 'Unbekannt'))
            );
            const relevantStats = personStats.filter(ps => projectPersons.has(ps.name));
            const stammteam = relevantStats.filter(ps => stammNames.has(ps.name));
            const weitere = relevantStats.filter(ps => !stammNames.has(ps.name));

            return (
              <div key={projekt}>
                {/* Stammteam drop zone */}
                <div
                  className={`crew-drop-zone ${dropTarget === 'stammteam' && draggedPerson ? 'crew-drop-zone-active' : ''}`}
                  onDragOver={(e) => handleDragOver(e, 'stammteam')}
                  onDragLeave={(e) => handleDragLeave(e, 'stammteam')}
                  onDrop={(e) => handleDrop(e, 'stammteam', projekt)}
                >
                  <div className="crew-section-label">
                    Stammteam{stammteam.length > 0 ? ` (${stammteam.length})` : ''}
                    {draggedPerson && !stammNames.has(draggedPerson) && <span className="crew-drop-hint">↓ Hierher ziehen</span>}
                  </div>
                  {stammteam.length > 0 ? (
                    <div className="crew-grid">
                      {stammteam.map(ps => renderCard(ps, true, projekt))}
                    </div>
                  ) : (
                    <div className="crew-drop-empty">
                      Personen hierher ziehen, um das Stammteam für <strong>{projekt}</strong> festzulegen
                    </div>
                  )}
                </div>

                {/* Weitere drop zone */}
                <div
                  className={`crew-drop-zone ${dropTarget === 'weitere' && draggedPerson ? 'crew-drop-zone-active' : ''}`}
                  onDragOver={(e) => handleDragOver(e, 'weitere')}
                  onDragLeave={(e) => handleDragLeave(e, 'weitere')}
                  onDrop={(e) => handleDrop(e, 'weitere', projekt)}
                >
                  {weitere.length > 0 && (
                    <>
                      <div className="crew-section-label">
                        Weitere{weitere.length > 0 ? ` (${weitere.length})` : ''}
                        {draggedPerson && stammNames.has(draggedPerson) && <span className="crew-drop-hint">↓ Hierher ziehen</span>}
                      </div>
                      <div className="crew-grid">
                        {weitere.map(ps => renderCard(ps, true, projekt))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          };

          // If a project filter is active, show Stammteam/Weitere for that project
          if (activeProject) {
            return renderProjectCrew(activeProject);
          }

          // No project filter and multiple projects — tiles above handle navigation
          return null;
        })()}

        {/* Finale Abrechnung — nur bei abgeschlossenem Projekt */}
        {(() => {
          const activeProj = projectFilter !== 'all' ? projectFilter
            : projectStats.length === 1 ? projectStats[0].projekt
            : null;
          const isCompleted = activeProj && completedProjects && completedProjects[activeProj];
          if (!isCompleted) return null;

          // Compute detailed per-person calculations — only for Stammteam members
          const baseTS = allTimesheets || timesheets;
          const projectSheets = baseTS.filter(t => baseProject(t.projekt) === activeProj);
          const stammNames = new Set(((settings.projectCrews || {})[activeProj] || []).map(n => resolve(n)));
          const byPerson = {};
          for (const ts of projectSheets) {
            const name = resolve(ts.name || 'Unbekannt');
            if (stammNames.size > 0 && !stammNames.has(name)) continue;
            if (!byPerson[name]) byPerson[name] = [];
            byPerson[name].push(ts);
          }
          const personCalcs = Object.entries(byPerson).map(([name, sheets]) => {
            const ps = getPersonSettings ? getPersonSettings(name, activeProj) : settings;
            const pc = calcTVFFS(sheets, ps);
            // Find date range
            let minDate = null, maxDate = null;
            for (const s of sheets) {
              for (const d of s.days) {
                if (!d.datum) continue;
                const [dd, mm, yy] = d.datum.split('.').map(Number);
                if (!dd || !mm || !yy) continue;
                const dt = new Date(yy < 100 ? 2000 + yy : yy, mm - 1, dd);
                const hrs = Number(d.stundenTotal) || 0;
                const hasStart = d.start && String(d.start).includes(':');
                const anm = (d.anmerkungen || '').toLowerCase().trim();
                const active = hrs > 0 || hasStart || anm.includes('krank') || anm.includes('urlaub') || anm === 'u' || anm.includes('azv');
                if (active) {
                  if (!minDate || dt < minDate) minDate = dt;
                  if (!maxDate || dt > maxDate) maxDate = dt;
                }
              }
            }
            const fmtDate = (d) => d ? d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '–';
            return { name, pc, minDate, maxDate, fmtMin: fmtDate(minDate), fmtMax: fmtDate(maxDate) };
          }).sort((a, b) => (b.pc.totalArbeitstage || 0) - (a.pc.totalArbeitstage || 0));

          const totalVerdienst = personCalcs.reduce((s, p) => s + (p.pc.gesamtVerdienst || 0), 0);
          const fmtC = (v) => (v || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

          return (
            <div className="stats-section final-summary-section">
              <h3 className="section-title">✅ Finale Abrechnung — {activeProj}</h3>
              <div className="final-summary-table-wrap">
                <table className="final-summary-table">
                  <thead>
                    <tr>
                      <th>Person</th>
                      <th>Anstellungszeitraum</th>
                      <th className="num">Tage</th>
                      <th className="num">Arbeitstage</th>
                      <th className="num">Stunden</th>
                      <th className="num">Überstunden</th>
                      <th className="num">Zeitkonto</th>
                      <th className="num">Urlaub</th>
                      <th className="num">Grundgage</th>
                      <th className="num">Zuschläge</th>
                      <th className="num">Gesamtverdienst</th>
                    </tr>
                  </thead>
                  <tbody>
                    {personCalcs.map(({ name, pc, fmtMin, fmtMax }) => (
                      <tr key={name} className="final-summary-row" onClick={() => onPersonFilter && onPersonFilter(name)} style={{ cursor: 'pointer' }}>
                        <td className="final-summary-name">{name}</td>
                        <td>{fmtMin} – {fmtMax}</td>
                        <td className="num">{pc.anstellungstage || '–'}</td>
                        <td className="num">{pc.totalArbeitstage}</td>
                        <td className="num">{pc.totalStunden.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className="num">{pc.totalUeberstunden.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className="num">{pc.zeitkontoStunden ? pc.zeitkontoStunden.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '–'}</td>
                        <td className="num">{pc.urlaubstage} / {pc.urlaubstageGenommen}</td>
                        <td className="num">{fmtC(pc.grundgage)}</td>
                        <td className="num">{fmtC((pc.totalUeberstundenZuschlag || 0) + (pc.nachtZuschlag || 0) + (pc.samstagZuschlag || 0) + (pc.sonntagZuschlag || 0) + (pc.feiertagZuschlag || 0) + (pc.weeklyOTZuschlag25 || 0) + (pc.weeklyOTZuschlag50 || 0))}</td>
                        <td className="num final-summary-total">{fmtC(pc.gesamtVerdienst)}</td>
                      </tr>
                    ))}
                  </tbody>

                </table>
              </div>
              <p className="final-summary-note">Klick auf eine Person für die detaillierte Einzelansicht. Urlaub: gesammelt / genommen.</p>
            </div>
          );
        })()}

        {/* Zusatztage — nur wenn ein Projekt ausgewählt ist */}
        {projectFilter !== 'all' && zusatztageInfo && zusatztageInfo.zusatzPersonen.length > 0 && (
          <div className="zusatztage-card">
            <div className="zusatztage-header">
              <div className="zusatztage-title">📋 Zusatztage</div>
              <div className="zusatztage-total">
                <span className="zusatztage-total-value">{zusatztageInfo.totalZusatztage}</span>
                <span className="zusatztage-total-label">Zusatztage gesamt</span>
              </div>
            </div>
            <div className="zusatztage-list">
              {zusatztageInfo.zusatzPersonen.map((zp) => (
                <div key={zp.name} className="zusatztage-row">
                  <span className="zusatztage-name">{zp.name}</span>
                  <span className="zusatztage-days">{zp.tage} Tage</span>
                  <button
                    className="zusatztage-remove-btn"
                    title={`${zp.name} ausblenden`}
                    onClick={() => setHiddenZusatzPersonen(prev => [...prev, zp.name])}
                  >✕</button>
                </div>
              ))}
            </div>
            <div className="zusatztage-summary">
              <span>Gesamt Personentage: <strong>{zusatztageInfo.totalPersonTage}</strong></span>
              <span>Drehtage: <strong>{zusatztageInfo.totalUniqueDays}</strong></span>
            </div>
            {hiddenZusatzPersonen.length > 0 && (
              <div className="zusatztage-hidden-info">
                <span>{hiddenZusatzPersonen.length} Person{hiddenZusatzPersonen.length > 1 ? 'en' : ''} ausgeblendet</span>
                <button
                  className="zusatztage-restore-btn"
                  onClick={() => setHiddenZusatzPersonen([])}
                >Alle einblenden</button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // --- INDIVIDUAL PERSON or single-person view ---
  const personLabel = personFilter !== 'all' ? personFilter : null;
  const showBackToCrew = personLabel && uniquePersons.length > 1;
  const personHasMultipleProjects = personLabel && projects && projects.length > 1;


  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div className="dashboard-header-left">
          {showBackToCrew && (
            <button className="back-to-crew-btn" onClick={() => onPersonFilter && onPersonFilter('all')}>
              ← Crew-Übersicht
            </button>
          )}
          <h2>{personLabel ? `Übersicht — ${personLabel}` : 'Übersicht'}</h2>
          <span className="subtitle">
            {personLabel ? `${personLabel} · ` : ''}{c.totalWochen} Woche{c.totalWochen !== 1 ? 'n' : ''} importiert
          </span>
        </div>
        <div className="dashboard-header-right">
          {personHasMultipleProjects && (
            <select className="project-filter" value={projectFilter} onChange={e => onProjectFilter(e.target.value)}>
              {projects.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          )}
          <div className="export-dropdown">
            <button className="export-btn" onClick={() => setShowExport(!showExport)} disabled={exporting} aria-label="Exportieren">
              {exporting ? '⏳ Exportiert…' : '↗ Exportieren'}
            </button>
            {showExport && !exporting && (
              <div className="export-menu" role="menu">
                <button onClick={() => handleExportCSV()} role="menuitem">CSV exportieren</button>
                <button onClick={() => handleExportPDF()} role="menuitem">PDF exportieren</button>
                <button onClick={() => handleExportExcel()} role="menuitem">Excel exportieren</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Alles unterhalb nur zeigen wenn Projekt gewählt (oder nur ein Projekt existiert) */}
      {(<>

      {/* Gage Eingabe Bar */}
      <div className="gage-bar">
        <div className="gage-bar-left">
          {personFilter !== 'all' && projectFilter !== 'all' ? (
            <span className="gage-person-label">💰 {personFilter} · 🎬 {projectFilter}</span>
          ) : personFilter !== 'all' ? (
            <span className="gage-person-label">💰 {personFilter}</span>
          ) : projectFilter !== 'all' ? (
            <span className="gage-person-label">🎬 {projectFilter}</span>
          ) : null}
          <div className="gage-type-toggle">
            <button
              className={`toggle-btn ${gageType === 'tag' ? 'active' : ''}`}
              onClick={() => handleGageTypeChange('tag')}
            >
              Tagesgage
            </button>
            <button
              className={`toggle-btn ${gageType === 'woche' ? 'active' : ''}`}
              onClick={() => handleGageTypeChange('woche')}
            >
              Wochengage
            </button>
          </div>
          <div className="gage-input-group">
            <input
              type="text"
              value={gageInput}
              onChange={e => handleGageChange(e.target.value)}
              placeholder={gageType === 'tag' ? 'z.B. 500' : 'z.B. 2.500'}
              className="gage-input"
            />
            <span className="gage-unit">€ / {gageType === 'tag' ? 'Tag' : 'Woche'}</span>
          </div>
          {displayStundensatz() && (
            <span className="gage-hint">= {displayStundensatz()} €/Std.</span>
          )}
        </div>
        <div className="gage-bar-right">
          <div className="zeitkonto-toggle" onClick={handleZeitkontoToggle}>
            <div className={`toggle-switch ${zeitkonto ? 'on' : ''}`}>
              <div className="toggle-knob" />
            </div>
            <div className="zeitkonto-label">
              <span className="zeitkonto-title">Zeitkonto</span>
              <span className="zeitkonto-desc">
                {zeitkonto ? 'Überstunden ins Zeitkonto' : 'Überstunden ausbezahlt'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* === WARNUNGEN === */}
      {((c.ruhezeitVerletzungen && c.ruhezeitVerletzungen.length > 0) || (c.feiertageList && c.feiertageList.length > 0) || (c.heiligabendSilvester && c.heiligabendSilvester.length > 0) || c.totalKranktageUnbezahlt > 0) && (
        <div className="stats-section warnings-section">
          <h3 className="section-title">⚠ Hinweise</h3>
          
          {c.totalKranktageUnbezahlt > 0 && (
            <div className="warning-card warning-danger">
              <div className="warning-header">⚕️ 6-Wochen-Grenze überschritten (TZ 13.3)</div>
              <div className="warning-body">
                <p className="warning-note">{c.totalKranktage} Krankheitstage gesamt, davon {c.totalKranktageUnbezahlt} unbezahlt (über 42 Tage).</p>
              </div>
            </div>
          )}

          {c.heiligabendSilvester && c.heiligabendSilvester.length > 0 && (
            <div className="warning-card warning-info">
              <div className="warning-header">🎄 Heiligabend/Silvester</div>
              <div className="warning-body">
                <p className="warning-note">Kein gesetzlicher Feiertag, aber ggf. tariflich/betrieblich besonders geregelt:</p>
                {c.heiligabendSilvester.map((hs, i) => (
                  <div key={i} className="warning-row">
                    <span className="warning-date">{hs.datum}</span>
                    <span className="warning-name">{hs.name}</span>
                    <span className="warning-hours">{hs.stunden} Std.</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {c.feiertageList && c.feiertageList.length > 0 && (
            <div className="warning-card warning-info">
              <div className="warning-header">🎄 Feiertage erkannt ({c.totalFeiertagstage})</div>
              <div className="warning-body">
                {c.feiertageList.map((f, i) => (
                  <div key={i} className="warning-row">
                    <span className="warning-date">{f.datum}</span>
                    <span className="warning-name">{f.name}</span>
                    <span className="warning-hours">{f.stunden} Std. — 100% Zuschlag</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {c.ruhezeitVerletzungen && c.ruhezeitVerletzungen.length > 0 && (
            <div className="warning-card warning-danger">
              <div className="warning-header">⏰ Ruhezeit-Verletzungen ({c.ruhezeitVerletzungen.length})</div>
              <div className="warning-body">
                <p className="warning-note">Mindestens 11 Stunden Ruhezeit zwischen Schichten (ArbZG §5)</p>
                {c.ruhezeitVerletzungen.map((v, i) => (
                  <div key={i} className="warning-row warning-row-bad">
                    <span>{v.datum1} Ende: {v.ende1}</span>
                    <span>→ {v.datum2} Start: {v.start2}</span>
                    <span className="warning-gap">Ruhezeit: {v.ruhezeit}h (fehlen {v.fehlend}h)</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* === Projektübersicht === */}
      {personProjectStats.length > 1 && (
        <div className="stats-section">
          <h3 className="section-title">Projektübersicht</h3>
          <div className="project-breakdown-grid">
            {personProjectStats.map(ps => (
              <button
                key={ps.projekt}
                className={`project-breakdown-card ${projectFilter === ps.projekt ? 'project-breakdown-card-active' : ''}`}
                onClick={() => onProjectFilter && onProjectFilter(projectFilter === ps.projekt ? 'all' : ps.projekt)}
              >
                <div className="project-breakdown-header">
                  <span className="project-breakdown-name">{ps.projekt}</span>
                  <span className="project-breakdown-meta">{ps.sheets} Zettel · {ps.arbeitstage} Tage</span>
                </div>
                <div className="project-breakdown-stats">
                  <div className="project-breakdown-stat">
                    <span className="project-breakdown-stat-value">{ps.stunden.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    <span className="project-breakdown-stat-label">Stunden</span>
                  </div>
                  <div className="project-breakdown-stat">
                    <span className="project-breakdown-stat-value">{ps.ueberstunden.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    <span className="project-breakdown-stat-label">Überstd.</span>
                  </div>
                  <div className="project-breakdown-stat">
                    <span className="project-breakdown-stat-value">{ps.nacht.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    <span className="project-breakdown-stat-label">Nacht</span>
                  </div>
                  <div className="project-breakdown-stat">
                    <span className="project-breakdown-stat-value">{ps.fahrzeit.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    <span className="project-breakdown-stat-label">Fahrzeit</span>
                  </div>
                </div>
                <div className="project-breakdown-badges">
                  {ps.samstage > 0 && <span className="crew-badge crew-badge-sa">Sa {ps.samstage.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Std.</span>}
                  {ps.sonntage > 0 && <span className="crew-badge crew-badge-so">So {ps.sonntage.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Std.</span>}
                  {hasGage && ps.verdienst > 0 && <span className="crew-badge project-badge-earnings">{formatCurrency(ps.verdienst)}</span>}
                </div>
              </button>
            ))}
          </div>
          {projectFilter !== 'all' && (
            <button className="project-filter-reset-btn" onClick={() => onProjectFilter && onProjectFilter('all')}>
              ✕ Projektfilter zurücksetzen — alle Projekte anzeigen
            </button>
          )}
        </div>
      )}

      {/* Arbeitszeit Karten */}
      <div className="stats-section">
        <h3 className="section-title">Arbeitszeit{projectFilter !== 'all' ? ` — ${projectFilter}` : ''}</h3>
        <div className="stats-grid">
          <StatCard label="Arbeitstage" value={c.totalArbeitstage} unit="Tage" color="blue" />
          {c.totalKranktage > 0 && <StatCard label="Krankheitstage" value={c.totalKranktage} unit="Tage" color="red" />}
          {c.totalAZVTage > 0 && <StatCard label="AZV-Tage" value={c.totalAZVTage} unit="Tage" color="cyan" />}
          <StatCard label="Bezahlte Tage" value={c.totalBezahlteTage} unit="Tage" color="green" />
          <StatCard label="Gesamtstunden" value={c.totalStunden} unit="Std." color="purple" />
          <StatCard label="Ø Stunden/Tag" value={c.durchschnittStundenProTag} unit="Std." color="cyan" />
          <StatCard label="Überstunden gesamt" value={c.totalUeberstunden} unit="Std." color="orange" />
        </div>
      </div>

      {/* Überstunden Detail */}
      <div className="stats-section">
        <h3 className="section-title">Überstunden & Zuschläge</h3>
        <div className="stats-grid">
          <StatCard label="Ü 25% (TZ 5.4.3.2)" value={c.totalUeberstunden25} unit="Std." color="yellow" />
          <StatCard label="Ü 50% (TZ 5.4.3.2)" value={c.totalUeberstunden50} unit="Std." color="orange" />
          {c.totalUeberstunden100 > 0 && <StatCard label="Ü 100% (Feiertag)" value={c.totalUeberstunden100} unit="Std." color="red" />}
          <StatCard label="Nachtstunden" value={c.totalNacht} unit="Std." color="indigo" />
          <StatCard label="Fahrzeit" value={c.totalFahrzeit} unit="Std." color="gray" />
          <StatCard label="Samstage" value={c.totalSamstagsstunden} unit="Std." color="teal" />
          <StatCard label="Sonntage" value={c.totalSonntagsstunden} unit="Std." color="pink" />
          {c.totalFeiertagstage > 0 && <StatCard label="Feiertage" value={c.totalFeiertagstage} unit="Tage" color="red" />}
          {c.weeklyOT25 > 0 && <StatCard label="Wöch. Ü 25% (5.4.3.3)" value={c.weeklyOT25} unit="Std." color="yellow" />}
          {c.weeklyOT50 > 0 && <StatCard label="Wöch. Ü 50% (5.4.3.3)" value={c.weeklyOT50} unit="Std." color="orange" />}
        </div>
      </div>

      {/* Zeitkonto */}
      {zeitkonto && c.totalUeberstunden > 0 && (
        <div className="stats-section">
          <h3 className="section-title">Zeitkonto (TVFFS)</h3>
          <div className="zeitkonto-card">
            <div className="zeitkonto-balance">
              <div className="zeitkonto-big-number">
                {c.zeitkontoStunden?.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                <span className="zeitkonto-big-unit">Std.</span>
              </div>
              <div className="zeitkonto-big-label">Zeitkonto-Guthaben</div>
            </div>
            <div className="zeitkonto-details">
              <div className="zeitkonto-detail-row">
                <span>Überstunden 25%</span>
                <span>{Number(c.totalUeberstunden25).toFixed(2)} Std.</span>
              </div>
              <div className="zeitkonto-detail-row">
                <span>Überstunden 50%</span>
                <span>{Number(c.totalUeberstunden50).toFixed(2)} Std.</span>
              </div>
              <div className="zeitkonto-detail-row">
                <span>Überstunden 100%</span>
                <span>{Number(c.totalUeberstunden100).toFixed(2)} Std.</span>
              </div>
              <div className="zeitkonto-detail-row total">
                <span>Gesamt im Zeitkonto</span>
                <span>{Number(c.zeitkontoStunden).toFixed(2)} Std.</span>
              </div>
            </div>
            <div className="zeitkonto-note">
              Überstunden werden nicht ausbezahlt, sondern dem Zeitkonto gutgeschrieben.
              Zuschläge (25%/50%/100%) werden weiterhin ausbezahlt.
            </div>
          </div>
        </div>
      )}

      {/* Vergütung */}
      {hasGage && (
        <div className="stats-section">
          <h3 className="section-title">Vergütung (TV-FFS 2025)</h3>
          <div className="earnings-card">
            <div className="earnings-breakdown">
              <EarningsRow label="Grundgage" sublabel={`${c.totalBezahlteTage} Tage × ${formatCurrency(c.tagesgageEffective)}${c.totalKranktage > 0 ? ` (inkl. ${c.totalKranktage} Kranktag${c.totalKranktage > 1 ? 'e' : ''})` : ''}${c.totalAZVTage > 0 ? ` (inkl. ${c.totalAZVTage} AZV-Tag${c.totalAZVTage > 1 ? 'e' : ''})` : ''}`} value={c.grundgage} />
              {!zeitkonto && c.totalUeberstunden > 0 && (
                <EarningsRow label="Überstunden Grundvergütung" sublabel={`${Number(c.totalUeberstunden).toFixed(2)} Std. × ${formatCurrency(c.stundensatz)}/Std.`} value={c.ueberstundenGrundverguetung} />
              )}
              {zeitkonto && c.totalUeberstunden > 0 && (
                <EarningsRow label="Überstunden → Zeitkonto" sublabel={`${Number(c.zeitkontoStunden).toFixed(2)} Std. gutgeschrieben`} value={0} />
              )}
              {c.zuschlag25 > 0 && <EarningsRow label="Ü-Zuschlag 25% (TZ 5.4.3.2)" sublabel={`${Number(c.totalUeberstunden25).toFixed(2)} Std.`} value={c.zuschlag25} />}
              {c.zuschlag50 > 0 && <EarningsRow label="Ü-Zuschlag 50% (TZ 5.4.3.2)" sublabel={`${Number(c.totalUeberstunden50).toFixed(2)} Std.`} value={c.zuschlag50} />}
              {c.zuschlag100 > 0 && <EarningsRow label="Ü-Zuschlag 100%" sublabel={`${Number(c.totalUeberstunden100).toFixed(2)} Std.`} value={c.zuschlag100} />}
              {c.nachtZuschlag > 0 && <EarningsRow label="Nachtzuschlag 25% (TZ 5.5.2)" sublabel={`${Number(c.totalNacht).toFixed(2)} Std.`} value={c.nachtZuschlag} />}
              {c.samstagZuschlag > 0 && <EarningsRow label="Samstagszuschlag 25% (TZ 5.6.4)" sublabel={`${Number(c.totalSamstagsstunden).toFixed(2)} Std.`} value={c.samstagZuschlag} />}
              {c.sonntagZuschlag > 0 && <EarningsRow label="Sonntagszuschlag 75% (TZ 5.6.3)" sublabel={`${Number(c.totalSonntagsstunden).toFixed(2)} Std.`} value={c.sonntagZuschlag} />}
              {c.feiertagZuschlag > 0 && <EarningsRow label="Feiertagszuschlag 100% (TZ 5.6.3)" sublabel={`${Number(c.totalFeiertagsstunden).toFixed(2)} Std.`} value={c.feiertagZuschlag} />}
              {c.weeklyOTGrundverguetung > 0 && <EarningsRow label="Wöch. Ü Grundvergütung (TZ 5.4.3.3)" sublabel={`${Number(c.weeklyOT25 + c.weeklyOT50).toFixed(2)} Std.`} value={c.weeklyOTGrundverguetung} />}
              {c.weeklyOTZuschlag25 > 0 && <EarningsRow label="Wöch. Ü-Zuschlag 25% (TZ 5.4.3.3)" sublabel={`${Number(c.weeklyOT25).toFixed(2)} Std.`} value={c.weeklyOTZuschlag25} />}
              {c.weeklyOTZuschlag50 > 0 && <EarningsRow label="Wöch. Ü-Zuschlag 50% (TZ 5.4.3.3)" sublabel={`${Number(c.weeklyOT50).toFixed(2)} Std.`} value={c.weeklyOTZuschlag50} />}
              <div className="earnings-divider" />
              <EarningsRow label="Gesamtverdienst" value={c.gesamtVerdienst} total />
            </div>
          </div>
        </div>
      )}

      {/* Urlaub */}
      <div className="stats-section">
        <h3 className="section-title">Urlaub (TZ 14.1 TV-FFS)</h3>
        <div className="stats-grid">
          <StatCard label="Gesammelte Urlaubstage" value={c.urlaubstage} unit="Tage" color="green" large />
        </div>
        {c.anstellungstage > 0 ? (
          <p className="stats-note">0,5 Urlaubstag pro 7 zusammenhängende Anstellungstage ({c.anstellungstage} Tage ÷ 7 = {c.totalWochen} × 0,5 = {Number(c.urlaubstage).toFixed(2)} Tage). Urlaubstage werden gesammelt und nicht als Geld ausgezahlt.</p>
        ) : (
          <p className="stats-note">Summe der individuell berechneten Urlaubstage aller Personen (0,5 Tage pro 7 Anstellungstage). Urlaubstage werden gesammelt und nicht als Geld ausgezahlt.</p>
        )}
      </div>

      {/* Stunden-Chart */}
      {chartData.length > 1 && (
        <div className="stats-section">
          <h3 className="section-title">Stundenverlauf</h3>
          <div className="chart-container">
            <div className="chart-bars">
              {chartData.map((d, i) => (
                <div key={i} className="chart-bar-group">
                  <div className="chart-bar-wrapper">
                    <div
                      className="chart-bar"
                      style={{ height: `${(d.stunden / chartMax) * 100}%` }}
                      title={`${d.stunden.toFixed(2)} Std.`}
                    >
                      <span className="chart-bar-value">{d.stunden.toFixed(2)}</span>
                    </div>
                    {d.ueberstunden > 0 && (
                      <div
                        className="chart-bar chart-bar-ot"
                        style={{ height: `${(d.ueberstunden / chartMax) * 100}%` }}
                        title={`${d.ueberstunden.toFixed(2)} Ü-Std.`}
                      />
                    )}
                  </div>
                  <span className="chart-label">{d.label}</span>
                </div>
              ))}
            </div>
            <div className="chart-legend">
              <span className="chart-legend-item"><span className="chart-dot chart-dot-total" /> Gesamt</span>
              <span className="chart-legend-item"><span className="chart-dot chart-dot-ot" /> Überstunden</span>
            </div>
          </div>
        </div>
      )}

      {/* Spesen */}
      <div className="stats-section">
        <h3 className="section-title section-title-collapsible" onClick={() => setSpesenCollapsed(!spesenCollapsed)} style={{ cursor: 'pointer', userSelect: 'none' }}>
          <span>{spesenCollapsed ? '▶' : '▼'} Spesen</span>
          {spesenCollapsed && (settings.spesen || []).length > 0 && (
            <span className="section-title-badge">{(settings.spesen || []).length} Einträge · {formatCurrency(spesenTotal)}</span>
          )}
        </h3>
        {!spesenCollapsed && (
        <div className="spesen-card">
          <div className="spesen-form">
            <input
              type="text"
              className="spesen-input spesen-datum"
              placeholder="Datum"
              value={spesenInput.datum}
              onChange={e => setSpesenInput({ ...spesenInput, datum: e.target.value })}
            />
            <input
              type="text"
              className="spesen-input spesen-beschreibung"
              placeholder="Beschreibung"
              value={spesenInput.beschreibung}
              onChange={e => setSpesenInput({ ...spesenInput, beschreibung: e.target.value })}
            />
            <input
              type="text"
              className="spesen-input spesen-betrag"
              placeholder="Betrag €"
              value={spesenInput.betrag}
              onChange={e => setSpesenInput({ ...spesenInput, betrag: e.target.value })}
            />
            <select
              className="spesen-input spesen-kategorie"
              value={spesenInput.kategorie}
              onChange={e => setSpesenInput({ ...spesenInput, kategorie: e.target.value })}
            >
              {spesenKategorien.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
            <button className="spesen-add-btn" onClick={handleAddSpesen}>+</button>
          </div>
          {(settings.spesen || []).length > 0 && (
            <div className="spesen-list">
              {(settings.spesen || []).map(s => (
                <div key={s.id} className="spesen-row">
                  <span className="spesen-row-datum">{s.datum}</span>
                  <span className="spesen-row-kat">{s.kategorie}</span>
                  <span className="spesen-row-beschreibung">{s.beschreibung}</span>
                  <span className="spesen-row-betrag">{formatCurrency(s.betrag)}</span>
                  <button className="spesen-delete-btn" onClick={() => handleDeleteSpesen(s.id)}>×</button>
                </div>
              ))}
              <div className="spesen-total">
                <span>Spesen gesamt</span>
                <span className="spesen-total-value">{formatCurrency(spesenTotal)}</span>
              </div>
            </div>
          )}
        </div>
        )}
      </div>

      </>)}

      {/* Letzte Einträge */}
      <div className="stats-section">
        <h3 className="section-title">Letzte Einträge</h3>
        <div className="recent-sheets">
          {sortedTimesheets.slice(-5).reverse().map(sheet => (
            <button key={sheet.id} className="recent-sheet-card" onClick={() => onViewDetail(sheet)}>
              <div className="sheet-info">
                <span className="sheet-project">{sheet.projekt || 'Unbekannt'}</span>
                <span className="sheet-dates">
                  {sheet.days.find(d => d.datum)?.datum || 'Kein Datum'}
                </span>
              </div>
              <div className="sheet-hours">
                {sheet.totals?.stundenTotal || 0} Std.
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, unit, color, large }) {
  return (
    <div className={`stat-card stat-${color} ${large ? 'stat-large' : ''}`}>
      <div className="stat-value">
        {typeof value === 'number' ? value.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : value}
        {unit && <span className="stat-unit">{unit}</span>}
      </div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function EarningsRow({ label, sublabel, value, bold, total }) {
  return (
    <div className={`earnings-row ${bold ? 'bold' : ''} ${total ? 'total' : ''}`}>
      <div className="earnings-label">
        <span>{label}</span>
        {sublabel && <span className="earnings-sublabel">{sublabel}</span>}
      </div>
      <div className="earnings-value">
        {typeof value === 'number' ? formatCurrency(value) : value}
      </div>
    </div>
  );
}

function formatCurrency(value) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value);
}

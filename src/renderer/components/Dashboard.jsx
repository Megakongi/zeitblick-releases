import React, { useState, useEffect, useMemo } from 'react';
import { calculateTVFFS as calcTVFFS, calculateSheetTVFFS } from '../utils/tvffsCalculator';
import { parseDateDE } from '../utils/helpers';
import { findMissingWeeks } from '../utils/gapDetection';
import { useFilters, useSettings } from '../contexts';

function generatePDFHTML(timesheets, c, settings, personFilter, { getPersonSettings, resolveName, projectFilter } = {}) {
  const resolve = resolveName || ((n) => n);
  const fmt = (n) => typeof n === 'number' ? n.toFixed(2).replace('.', ',') : '0,00';
  const fmtC = (n) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n || 0);

  const isMultiPerson = !personFilter || personFilter === 'all';

  const css = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; font-size: 11px; color: #1a1a1a; padding: 24px 20px; background: #fff; }
    h1 { font-size: 18px; margin-bottom: 2px; }
    .subtitle { color: #666; font-size: 11px; margin-bottom: 16px; display: block; }
    h2 { font-size: 13px; margin: 18px 0 6px 0; padding-bottom: 3px; border-bottom: 2px solid #333; }
    h3 { font-size: 12px; margin: 14px 0 4px 0; color: #444; }
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
    .person-section { margin-top: 24px; padding-top: 16px; border-top: 3px solid #333; }
    .person-section:first-of-type { border-top: none; margin-top: 10px; padding-top: 0; }
    .page-break { page-break-before: always; }
    @media print { body { padding: 10px; } }
  `;

  // Helper: generate one person's complete section
  function generatePersonSection(personTimesheets, personCalc, personSettings, personName, isFirst) {
    const hasGage = personSettings.tagesgage > 0;
    const gageLabel = personSettings.gageType === 'woche' ? 'Wochengage' : 'Tagesgage';
    const sc_sorted = [...personTimesheets].sort((a, b) => {
      const dA = a.days.find(d => d.datum)?.datum || '';
      const dB = b.days.find(d => d.datum)?.datum || '';
      return parseDateDE(dA) - parseDateDE(dB);
    });

    let html = '';
    if (isMultiPerson) {
      const sectionClass = isFirst ? 'person-section' : 'person-section page-break';
      html += `<div class="${sectionClass}">`;
      html += `<h2 style="font-size:15px; border-bottom: 2px solid #333; margin-bottom: 8px;">${personName}</h2>`;
    }

    // Meta info
    html += `<table class="meta-table">`;
    if (hasGage) html += `<tr><td>${gageLabel}:</td><td>${fmtC(personSettings.tagesgage)}</td></tr>`;
    if (hasGage) html += `<tr><td>Stundensatz:</td><td>${fmtC(personCalc.stundensatz)}</td></tr>`;
    if (personSettings.zeitkonto) html += `<tr><td>Zeitkonto:</td><td>aktiv</td></tr>`;
    html += `<tr><td>Anstellungstage:</td><td>${personCalc.anstellungstage}</td></tr>`;
    html += `</table>`;

    // Zusammenfassung
    html += `<h3>Zusammenfassung</h3>`;
    html += `<table><thead><tr><th>Kennzahl</th><th class="num">Wert</th></tr></thead><tbody>`;
    html += `<tr><td>Arbeitstage</td><td class="num">${personCalc.totalArbeitstage}</td></tr>`;
    if (personCalc.totalKranktage > 0) html += `<tr><td>Krankheitstage</td><td class="num">${personCalc.totalKranktage}</td></tr>`;
    if (personCalc.totalAZVTage > 0) html += `<tr><td>AZV-Tage</td><td class="num">${personCalc.totalAZVTage}</td></tr>`;
    html += `<tr><td>Bezahlte Tage</td><td class="num">${personCalc.totalBezahlteTage}</td></tr>`;
    html += `<tr><td>Gesamtstunden</td><td class="num">${fmt(personCalc.totalStunden)}</td></tr>`;
    html += `<tr><td>Überstunden gesamt</td><td class="num">${fmt(personCalc.totalUeberstunden)}</td></tr>`;
    html += `<tr><td>&nbsp;&nbsp;davon 25%</td><td class="num">${fmt(personCalc.totalUeberstunden25)}</td></tr>`;
    html += `<tr><td>&nbsp;&nbsp;davon 50%</td><td class="num">${fmt(personCalc.totalUeberstunden50)}</td></tr>`;
    if (personCalc.totalUeberstunden100 > 0) html += `<tr><td>&nbsp;&nbsp;davon 100% (Feiertag)</td><td class="num">${fmt(personCalc.totalUeberstunden100)}</td></tr>`;
    html += `<tr><td>Nachtstunden</td><td class="num">${fmt(personCalc.totalNacht)}</td></tr>`;
    html += `<tr><td>Fahrzeit</td><td class="num">${fmt(personCalc.totalFahrzeit)}</td></tr>`;
    html += `<tr><td>Samstage</td><td class="num">${fmt(personCalc.totalSamstagsstunden || 0)} Std.</td></tr>`;
    html += `<tr><td>Sonntage</td><td class="num">${fmt(personCalc.totalSonntagsstunden || 0)} Std.</td></tr>`;
    html += `<tr><td>Urlaubstage</td><td class="num">${fmt(personCalc.urlaubstage)}</td></tr>`;
    html += `</tbody></table>`;

    // Wochenübersicht
    html += `<h3>Wochenübersicht</h3>`;
    html += `<table><thead><tr>
      <th>Zeitraum</th><th>Projekt</th><th class="num">Tage</th><th class="num">Stunden</th>
      <th class="num">Überstd.</th><th class="num">Nacht</th><th class="num">Sa</th><th class="num">So</th>`;
    if (hasGage) html += `<th class="num">Brutto</th>`;
    html += `</tr></thead><tbody>`;

    sc_sorted.forEach(sheet => {
      const sc = calculateSheetTVFFS(sheet, personSettings);
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

    html += `<tr class="total-row">
      <td>Summe</td><td></td>
      <td class="num">${personCalc.totalBezahlteTage}</td><td class="num">${fmt(personCalc.totalStunden)}</td>
      <td class="num">${fmt(personCalc.totalUeberstunden)}</td><td class="num">${fmt(personCalc.totalNacht)}</td>
      <td class="num">${fmt(personCalc.totalSamstagsstunden || 0)}</td><td class="num">${fmt(personCalc.totalSonntagsstunden || 0)}</td>`;
    if (hasGage) html += `<td class="num">${fmtC(personCalc.gesamtVerdienst)}</td>`;
    html += `</tr></tbody></table>`;

    // Verdienst
    if (hasGage) {
      html += `<h3>Verdienst (TV-FFS 2025)</h3>`;
      html += `<table><thead><tr><th>Position</th><th>Berechnung</th><th class="num">Betrag</th></tr></thead><tbody>`;
      html += `<tr><td>Grundgage</td><td>${personCalc.totalBezahlteTage} Tage × ${fmtC(personCalc.tagesgageEffective)}${personCalc.totalKranktage > 0 ? ` (inkl. ${personCalc.totalKranktage} Kranktag${personCalc.totalKranktage > 1 ? 'e' : ''})` : ''}${personCalc.totalAZVTage > 0 ? ` (inkl. ${personCalc.totalAZVTage} AZV-Tag${personCalc.totalAZVTage > 1 ? 'e' : ''})` : ''}</td><td class="num">${fmtC(personCalc.grundgage)}</td></tr>`;
      if (!personSettings.zeitkonto && personCalc.ueberstundenGrundverguetung > 0) html += `<tr><td>Ü-Grundvergütung</td><td>${fmt(personCalc.totalUeberstunden)} Std. × ${fmtC(personCalc.stundensatz)}</td><td class="num">${fmtC(personCalc.ueberstundenGrundverguetung)}</td></tr>`;
      if (personSettings.zeitkonto && personCalc.totalUeberstunden > 0) html += `<tr><td>Überstunden → Zeitkonto</td><td>${fmt(personCalc.zeitkontoStunden)} Std. → ${fmt(personCalc.zeitkontoTage)} Anstellungstage</td><td class="num">—</td></tr>`;
      if (personCalc.zuschlag25 > 0) html += `<tr><td>Ü-Zuschlag 25% (TZ 5.4.3.2)</td><td>${fmt(personCalc.totalUeberstunden25)} Std.</td><td class="num">${fmtC(personCalc.zuschlag25)}</td></tr>`;
      if (personCalc.zuschlag50 > 0) html += `<tr><td>Ü-Zuschlag 50% (TZ 5.4.3.2)</td><td>${fmt(personCalc.totalUeberstunden50)} Std.</td><td class="num">${fmtC(personCalc.zuschlag50)}</td></tr>`;
      if (personCalc.zuschlag100 > 0) html += `<tr><td>Ü-Zuschlag 100%</td><td>${fmt(personCalc.totalUeberstunden100)} Std.</td><td class="num">${fmtC(personCalc.zuschlag100)}</td></tr>`;
      if (personCalc.nachtZuschlag > 0) html += `<tr><td>Nachtzuschlag 25% (TZ 5.5.2)</td><td>${fmt(personCalc.totalNacht)} Std.</td><td class="num">${fmtC(personCalc.nachtZuschlag)}</td></tr>`;
      if (personCalc.samstagZuschlag > 0) html += `<tr><td>Sa-Zuschlag 25% (TZ 5.6.4)</td><td>${fmt(personCalc.totalSamstagsstunden || 0)} Std.</td><td class="num">${fmtC(personCalc.samstagZuschlag)}</td></tr>`;
      if (personCalc.sonntagZuschlag > 0) html += `<tr><td>So-Zuschlag 75% (TZ 5.6.3)</td><td>${fmt(personCalc.totalSonntagsstunden || 0)} Std.</td><td class="num">${fmtC(personCalc.sonntagZuschlag)}</td></tr>`;
      if (personCalc.feiertagZuschlag > 0) html += `<tr><td>Feiertags-Zuschlag 100% (TZ 5.6.3)</td><td>${fmt(personCalc.totalFeiertagsstunden || 0)} Std.</td><td class="num">${fmtC(personCalc.feiertagZuschlag)}</td></tr>`;
      if (personCalc.weeklyOTGrundverguetung > 0) html += `<tr><td>Wöch. Ü Grundvergütung (TZ 5.4.3.3)</td><td>${fmt((personCalc.weeklyOT25 || 0) + (personCalc.weeklyOT50 || 0))} Std.</td><td class="num">${fmtC(personCalc.weeklyOTGrundverguetung)}</td></tr>`;
      if (personCalc.weeklyOTZuschlag25 > 0) html += `<tr><td>Wöch. Ü-Zuschlag 25% (TZ 5.4.3.3)</td><td>${fmt(personCalc.weeklyOT25 || 0)} Std.</td><td class="num">${fmtC(personCalc.weeklyOTZuschlag25)}</td></tr>`;
      if (personCalc.weeklyOTZuschlag50 > 0) html += `<tr><td>Wöch. Ü-Zuschlag 50% (TZ 5.4.3.3)</td><td>${fmt(personCalc.weeklyOT50 || 0)} Std.</td><td class="num">${fmtC(personCalc.weeklyOTZuschlag50)}</td></tr>`;
      if (personCalc.urlaubstageOffen > 0) html += `<tr><td>Urlaubstage (nicht genommen)</td><td>${personCalc.urlaubstageOffen} Tage × ${fmtC(personCalc.tagesgageEffective)}</td><td class="num">${fmtC(personCalc.urlaubstageAuszahlung)}</td></tr>`;
      if (personSettings.zeitkonto && personCalc.zeitkontoTage > 0) html += `<tr><td>Zeitkonto-Tage</td><td>${fmt(personCalc.zeitkontoTage)} Tage × ${fmtC(personCalc.tagesgageEffective)}</td><td class="num">${fmtC(personCalc.zeitkontoTageAuszahlung)}</td></tr>`;
      html += `<tr class="divider-row"><td colspan="3"></td></tr>`;
      html += `<tr class="total-row"><td>Gesamtverdienst</td><td></td><td class="num">${fmtC(personCalc.gesamtVerdienst)}</td></tr>`;
      html += `</tbody></table>`;

      // Zeitkonto
      if (personSettings.zeitkonto && personCalc.zeitkontoStunden > 0) {
        html += `<h3>Zeitkonto (Anlage A.1.1)</h3>`;
        html += `<table><thead><tr><th>Position</th><th class="num">Stunden</th><th class="num">Anstellungstage</th><th class="num">Wert</th></tr></thead><tbody>`;
        html += `<tr><td>Überstunden 25%</td><td class="num">${fmt(personCalc.totalUeberstunden25)}</td><td class="num">${fmt(personCalc.totalUeberstunden25 / 10)}</td><td class="num"></td></tr>`;
        html += `<tr><td>Überstunden 50%</td><td class="num">${fmt(personCalc.totalUeberstunden50)}</td><td class="num">${fmt(personCalc.totalUeberstunden50 / 10)}</td><td class="num"></td></tr>`;
        if (personCalc.totalUeberstunden100 > 0) html += `<tr><td>Überstunden 100%</td><td class="num">${fmt(personCalc.totalUeberstunden100)}</td><td class="num">${fmt(personCalc.totalUeberstunden100 / 10)}</td><td class="num"></td></tr>`;
        html += `<tr class="total-row"><td>Zeitkonto Gesamt</td><td class="num">${fmt(personCalc.zeitkontoStunden)}</td><td class="num">${fmt(personCalc.zeitkontoTage)}</td><td class="num">${fmtC(personCalc.zeitkontoWert)}</td></tr>`;
        html += `</tbody></table>`;
        html += `<p class="section-note">${fmt(personCalc.zeitkontoStunden)} Std. ÷ 10 = ${fmt(personCalc.zeitkontoTage)} Anstellungstage · Auflösung: 1/10 Tagesgage (${fmtC(personCalc.stundensatz)}) pro Stunde zzgl. Zeitzuschläge</p>`;
      }

      // Urlaub
      html += `<h3>Urlaub (TZ 14.1 TV-FFS)</h3>`;
      html += `<table><tbody>`;
      html += `<tr><td>Gesammelte Urlaubstage</td><td class="num">${personCalc.urlaubstage} Tage</td></tr>`;
      if (personCalc.urlaubstageGenommen > 0) html += `<tr><td>Genommene Urlaubstage</td><td class="num">${personCalc.urlaubstageGenommen} Tage</td></tr>`;
      html += `<tr><td>Offene Urlaubstage</td><td class="num">${personCalc.urlaubstageOffen} Tage</td></tr>`;
      html += `</tbody></table>`;
      html += `<p class="section-note">${personCalc.anstellungstage > 0 ? `0,5 Urlaubstag pro 7 zusammenhängende Anstellungstage (${personCalc.anstellungstage} Tage ÷ 7 = ${personCalc.totalWochen} × 0,5 = ${personCalc.urlaubstage} Tage).` : `Summe der individuell berechneten Urlaubstage.`}${personCalc.urlaubstageOffen > 0 ? ` Nicht genommene Urlaubstage (${personCalc.urlaubstageOffen}) werden als Tagesgage ausgezahlt.` : ''}</p>`;
    }

    if (isMultiPerson) html += `</div>`;
    return html;
  }

  // Build the full PDF
  const projekt = timesheets[0]?.projekt || '';
  const projLabel = projectFilter && projectFilter !== 'all' ? projectFilter : projekt;

  let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${css}</style></head><body>`;

  if (isMultiPerson) {
    // Multi-person export: per-person sections
    html += `<h1>ZeitBlick Übersicht</h1>`;
    html += `<span class="subtitle">Exportiert am ${new Date().toLocaleDateString('de-DE')}${projLabel ? ' · Projekt: ' + projLabel : ''}</span>`;

    // Group timesheets by resolved person name
    const personMap = new Map();
    timesheets.forEach(ts => {
      const name = resolve(ts.name || 'Unbekannt');
      if (!personMap.has(name)) personMap.set(name, []);
      personMap.get(name).push(ts);
    });
    const personNames = [...personMap.keys()].sort();

    personNames.forEach((name, idx) => {
      const personSheets = personMap.get(name);
      const pSettings = getPersonSettings
        ? getPersonSettings(name, projectFilter && projectFilter !== 'all' ? projectFilter : undefined)
        : settings;
      const pCalc = calcTVFFS(personSheets, pSettings);
      html += generatePersonSection(personSheets, pCalc, pSettings, name, idx === 0);
    });

    // Grand total section (if multiple people)
    if (personNames.length > 1) {
      const anyGage = personNames.some(name => {
        const ps = getPersonSettings ? getPersonSettings(name, projectFilter && projectFilter !== 'all' ? projectFilter : undefined) : settings;
        return ps.tagesgage > 0;
      });

      html += `<div class="person-section page-break">`;
      html += `<h2 style="font-size:15px; border-bottom: 2px solid #333; margin-bottom: 8px;">Gesamtübersicht (${personNames.length} Personen)</h2>`;
      html += `<table><thead><tr>
        <th>Person</th><th class="num">Tage</th><th class="num">Stunden</th>
        <th class="num">Überstd.</th><th class="num">Nacht</th>
        <th class="num">Urlaub</th>`;
      if (anyGage) html += `<th class="num">Verdienst</th>`;
      html += `</tr></thead><tbody>`;

      let totalTage = 0, totalStunden = 0, totalUeber = 0, totalNacht = 0, totalUrlaub = 0, totalVerdienst = 0;
      personNames.forEach(name => {
        const personSheets = personMap.get(name);
        const pSettings = getPersonSettings ? getPersonSettings(name, projectFilter && projectFilter !== 'all' ? projectFilter : undefined) : settings;
        const pCalc = calcTVFFS(personSheets, pSettings);
        totalTage += pCalc.totalBezahlteTage;
        totalStunden += pCalc.totalStunden;
        totalUeber += pCalc.totalUeberstunden;
        totalNacht += pCalc.totalNacht;
        totalUrlaub += pCalc.urlaubstage;
        totalVerdienst += pCalc.gesamtVerdienst || 0;
        html += `<tr>
          <td>${name}</td>
          <td class="num">${pCalc.totalBezahlteTage}</td>
          <td class="num">${fmt(pCalc.totalStunden)}</td>
          <td class="num">${fmt(pCalc.totalUeberstunden)}</td>
          <td class="num">${fmt(pCalc.totalNacht)}</td>
          <td class="num">${fmt(pCalc.urlaubstage)}</td>`;
        if (anyGage) html += `<td class="num">${fmtC(pCalc.gesamtVerdienst)}</td>`;
        html += `</tr>`;
      });

      html += `<tr class="total-row">
        <td>Gesamt</td>
        <td class="num">${totalTage}</td>
        <td class="num">${fmt(totalStunden)}</td>
        <td class="num">${fmt(totalUeber)}</td>
        <td class="num">${fmt(totalNacht)}</td>
        <td class="num">${fmt(totalUrlaub)}</td>`;
      if (anyGage) html += `<td class="num">${fmtC(totalVerdienst)}</td>`;
      html += `</tr></tbody></table>`;
      html += `</div>`;
    }
  } else {
    // Single-person export
    const name = personFilter;
    html += `<h1>ZeitBlick Übersicht — ${name}</h1>`;
    html += `<span class="subtitle">Exportiert am ${new Date().toLocaleDateString('de-DE')}${projLabel ? ' · Projekt: ' + projLabel : ''} · ${name}</span>`;
    html += generatePersonSection(timesheets, c, settings, name, true);
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

  // Fehlende Kalenderwochen pro Person & Projekt (respektiert aktive Filter)
  const missingWeeks = useMemo(
    () => findMissingWeeks(timesheets, {
      getBaseProject: baseProject,
      resolveName: resolve,
      completedProjects: completedProjects || {},
    }),
    [timesheets, baseProject, resolve, completedProjects]
  );

  const [gageInput, setGageInput] = useState(es.tagesgage || '');
  const [gageType, setGageType] = useState(es.gageType || 'tag');
  const [zeitkonto, setZeitkonto] = useState(es.zeitkonto ?? settings.zeitkonto ?? false);
  const [showExport, setShowExport] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [spesenInput, setSpesenInput] = useState({ datum: '', beschreibung: '', betrag: '', kategorie: 'Fahrt' });
  const [spesenCollapsed, setSpesenCollapsed] = useState(true);
  const [draggedPerson, setDraggedPerson] = useState(null);
  const [dropTarget, setDropTarget] = useState(null); // 'stammteam' or 'weitere'
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjForm, setNewProjForm] = useState({ name: '', nummer: '', firma: '', start: '' });
  const [expandedProjEdit, setExpandedProjEdit] = useState(null);
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
      const html = generatePDFHTML(timesheets, c, es, personFilter, { getPersonSettings, resolveName: resolve, projectFilter });
      const personSuffix = personFilter !== 'all' ? `-${personFilter}` : '';
      const result = await window.electronAPI.exportPDF(html, `ZeitBlick-Übersicht${personSuffix}-${new Date().toISOString().slice(0,10)}.pdf`);
      if (result && !result.success && result.error) {
        alert('Export fehlgeschlagen: ' + result.error);
      }
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
    setZeitkonto(es.zeitkonto ?? settings.zeitkonto ?? false);
  }, [settings, es, personFilter, projectFilter]);

  // Auto-select first project when person is selected with no project
  useEffect(() => {
    const personLabel = personFilter !== 'all' ? personFilter : null;
    if (personLabel && projectFilter === 'all' && projects && projects.length > 0) {
      onProjectFilter && onProjectFilter(projects[0]);
    }
  }, [personFilter, projectFilter, projects, onProjectFilter]);

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
    if (projectFilter !== 'all') {
      const updatedProjects = { ...(settings.projects || {}) };
      updatedProjects[projectFilter] = { ...(updatedProjects[projectFilter] || {}), zeitkonto: newVal };
      onSettings({ ...settings, projects: updatedProjects });
    } else {
      onSettings({ ...settings, zeitkonto: newVal });
    }
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

  const handleCreateProject = () => {
    if (!newProjForm.name.trim()) return;
    const name = newProjForm.name.trim();
    const currentProjects = settings.projects || {};
    if (currentProjects[name]) return; // already exists
    onSettings({
      ...settings,
      projects: {
        ...currentProjects,
        [name]: { projektnummer: newProjForm.nummer.trim(), produktionsfirma: newProjForm.firma.trim(), drehStartDatum: newProjForm.start, stammteam: [] },
      },
    });
    setNewProjForm({ name: '', nummer: '', firma: '', start: '' });
    setShowNewProject(false);
    setExpandedProjEdit(name);
  };

  const handleDeleteProject = (name) => {
    const updated = { ...(settings.projects || {}) };
    delete updated[name];
    onSettings({ ...settings, projects: updated });
    if (expandedProjEdit === name) setExpandedProjEdit(null);
  };

  const handleUpdateProjectField = (projectName, field, value) => {
    const updated = { ...(settings.projects || {}) };
    updated[projectName] = { ...(updated[projectName] || {}), [field]: value };
    onSettings({ ...settings, projects: updated });
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

  // --- CREW OVERVIEW (clean, standalone) ---
  if (showCrewOverview) {
    const PROJ_PALETTE = ['#6366F1', '#22C58F', '#F59E0B', '#F43F5E', '#06B6D4', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];
    const projColor = (name = '') => { let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0; return PROJ_PALETTE[h % PROJ_PALETTE.length]; };
    const crewTotalHours = projectStats.reduce((s, p) => s + p.totalHours, 0);
    const crewTotalOT = projectStats.reduce((s, p) => s + p.totalOvertime, 0);
    const fmtH = (n) => Number(n || 0).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    return (
      <div className="dashboard">
        {/* ── V3 Dashboard Header ── */}
        <div className="v3-dash-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div className="v3-dash-title">Übersicht</div>
            <div className="v3-dash-sub">
              {uniquePersons.length} Personen · {(allTimesheets || timesheets).length} Stundenzettel
              {projectFilter !== 'all' && ` · ${projectFilter}`}
            </div>
          </div>
        </div>

        {/* ── V3 Projekt-Karten ── */}
        {projectStats.length > 0 && projectFilter === 'all' && (
          <>
            <div className="v3-section-head">
              <div className="v3-section-title">Aktive Projekte</div>
              <button className="v3-section-link" onClick={() => setShowNewProject(v => !v)}>+ Projekt anlegen</button>
            </div>
            <div className="v3-proj-grid">
              {projectStats.slice(0, 6).map(ps => {
                const isCompleted = !!(completedProjects && completedProjects[ps.projekt]);
                const accentColor = projColor(ps.projekt);
                const projMeta = (settings.projects || {})[ps.projekt] || {};
                const metaParts = [projMeta.produktionsfirma, projMeta.drehStartDatum ? `ab ${projMeta.drehStartDatum}` : null].filter(Boolean);
                return (
                  <button
                    key={ps.projekt}
                    className="v3-proj-card"
                    style={{ opacity: isCompleted ? 0.7 : 1 }}
                    onClick={() => onProjectFilter && onProjectFilter(ps.projekt)}
                  >
                    <div className="v3-proj-bar" style={{ background: accentColor }} />
                    <div className="v3-proj-name">{ps.projekt}</div>
                    <div className="v3-proj-meta">
                      <span>{ps.sheets} Zettel</span>
                      <span>·</span>
                      <span>{ps.personen} Person{ps.personen !== 1 ? 'en' : ''}</span>
                      {metaParts[0] && <><span>·</span><span>{metaParts[0]}</span></>}
                    </div>
                    <div>
                      <div className="v3-proj-stat-val">{fmtH(ps.totalHours)} h</div>
                      <div className="v3-proj-stat-lbl">Gesamtstunden</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* Einzelprojekt-Filter aktiv */}
        {projectFilter !== 'all' && projectStats.length > 1 && (
          <button className="project-filter-reset-btn" onClick={() => onProjectFilter && onProjectFilter('all')}>
            ← Zurück zur Projektübersicht
          </button>
        )}

        {/* Single project or no-data: always show create button */}
        {projectStats.length <= 1 && projectFilter === 'all' && (
          <div className="proj-create-bar">
            <button className="proj-create-inline-btn" onClick={() => setShowNewProject(v => !v)}>
              + Neues Projekt erstellen
            </button>
          </div>
        )}

        {/* Inline project creation form */}
        {showNewProject && (
          <div className="proj-create-form-card">
            <div className="proj-create-form-header">
              <h3>Neues Projekt</h3>
              <button className="proj-create-close" onClick={() => setShowNewProject(false)}>×</button>
            </div>
            <div className="proj-create-form-grid">
              <div className="proj-create-field">
                <label>Projektname *</label>
                <input type="text" value={newProjForm.name} onChange={e => setNewProjForm(f => ({ ...f, name: e.target.value }))} placeholder="z.B. Mein Film 2026" autoFocus onKeyDown={e => e.key === 'Enter' && handleCreateProject()} />
              </div>
              <div className="proj-create-field">
                <label>Projektnummer</label>
                <input type="text" value={newProjForm.nummer} onChange={e => setNewProjForm(f => ({ ...f, nummer: e.target.value }))} placeholder="z.B. 12345" />
              </div>
              <div className="proj-create-field">
                <label>Produktionsfirma</label>
                <input type="text" value={newProjForm.firma} onChange={e => setNewProjForm(f => ({ ...f, firma: e.target.value }))} placeholder="z.B. Bavaria Film" />
              </div>
              <div className="proj-create-field">
                <label>Erster Drehtag</label>
                <input type="date" value={newProjForm.start} onChange={e => setNewProjForm(f => ({ ...f, start: e.target.value }))} />
              </div>
            </div>
            <div className="proj-create-form-actions">
              <button className="btn btn-secondary" onClick={() => setShowNewProject(false)}>Abbrechen</button>
              <button className="btn btn-primary" onClick={handleCreateProject} disabled={!newProjForm.name.trim()}>Erstellen</button>
            </div>
          </div>
        )}

        {/* Project meta editor — shown when expandedProjEdit is set (just after creation) */}
        {expandedProjEdit && (settings.projects || {})[expandedProjEdit] && (
          <div className="proj-edit-banner">
            <div className="proj-edit-banner-title">
              <span>🎬 {expandedProjEdit}</span>
              <button className="proj-create-close" onClick={() => setExpandedProjEdit(null)}>×</button>
            </div>
            <div className="proj-create-form-grid">
              <div className="proj-create-field">
                <label>Projektnummer</label>
                <input type="text" value={(settings.projects || {})[expandedProjEdit].projektnummer || ''} onChange={e => handleUpdateProjectField(expandedProjEdit, 'projektnummer', e.target.value)} placeholder="z.B. 12345" />
              </div>
              <div className="proj-create-field">
                <label>Produktionsfirma</label>
                <input type="text" value={(settings.projects || {})[expandedProjEdit].produktionsfirma || ''} onChange={e => handleUpdateProjectField(expandedProjEdit, 'produktionsfirma', e.target.value)} placeholder="z.B. Bavaria Film" />
              </div>
              <div className="proj-create-field">
                <label>Erster Drehtag</label>
                <input type="date" value={(settings.projects || {})[expandedProjEdit].drehStartDatum || ''} onChange={e => handleUpdateProjectField(expandedProjEdit, 'drehStartDatum', e.target.value)} />
              </div>
            </div>
            <p className="proj-edit-banner-hint">Das Projekt wurde gespeichert. Felder können jederzeit hier bearbeitet werden.</p>
            <div className="proj-create-form-actions">
              <button className="btn btn-icon-danger btn-secondary" onClick={() => handleDeleteProject(expandedProjEdit)} title="Projekt löschen">🗑 Projekt löschen</button>
              <button className="btn btn-primary" onClick={() => setExpandedProjEdit(null)}>Fertig</button>
            </div>
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

          // If a project filter is active, show new table view
          if (activeProject) {
            const baseTS = allTimesheets || timesheets;
            const projectPersons = new Set(
              baseTS.filter(t => baseProject(t.projekt) === activeProject).map(t => resolve(t.name || 'Unbekannt'))
            );
            const tableRows = personStats.filter(ps => projectPersons.has(ps.name));
            const hasGageAny = tableRows.some(ps => ps.verdienst > 0);
            const PALETTE = ['#6366F1','#22C58F','#F59E0B','#F43F5E','#06B6D4','#8B5CF6','#EC4899','#14B8A6','#F97316'];
            const avatarColor = (name) => { let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0; return PALETTE[h % PALETTE.length]; };
            const getInitials = (name) => name.split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2);
            return (
              <div className="crew-table-card">
                <div className="crew-table-card-head">
                  <h2 className="crew-table-card-title">Übersicht — {activeProject}</h2>
                  <div className="crew-table-card-actions">
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>{tableRows.length} Person{tableRows.length !== 1 ? 'en' : ''}</span>
                  </div>
                </div>
                <table className="crew-timesheets" aria-label="Crew-Übersicht">
                  <thead>
                    <tr>
                      <th style={{ width: '28%' }}>Person</th>
                      <th>Projekt</th>
                      <th className="num">Tage</th>
                      <th className="num">Stunden</th>
                      <th className="num">Überstd.</th>
                      {hasGageAny && <th className="num">Verdienst</th>}
                      <th style={{ width: 44 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map(ps => (
                      <tr key={ps.name} onClick={() => onPersonFilter && onPersonFilter(ps.name)}>
                        <td>
                          <div className="person-cell">
                            <div className="person-avatar" style={{ background: avatarColor(ps.name) }}>{getInitials(ps.name)}</div>
                            <div>
                              <div style={{ fontWeight: 500, color: 'var(--ink)' }}>{ps.name}</div>
                              {ps.position && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{ps.position}</div>}
                            </div>
                          </div>
                        </td>
                        <td><span className="proj-badge">{activeProject}</span></td>
                        <td className="num">{ps.arbeitstage}</td>
                        <td className="num">{ps.stunden.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className="num">
                          {ps.ueberstunden > 0
                            ? <span className={`ot-badge${ps.ueberstunden / (ps.stunden || 1) > 0.2 ? ' warn' : ''}`}>+{ps.ueberstunden.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            : <span style={{ color: 'var(--muted)' }}>—</span>}
                        </td>
                        {hasGageAny && (
                          <td className="num amount">
                            {ps.verdienst > 0
                              ? <span className="pos">{ps.verdienst.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</span>
                              : <span style={{ color: 'var(--muted)' }}>—</span>}
                          </td>
                        )}
                        <td>
                          <button className="row-open-btn" title="Detail öffnen" onClick={e => { e.stopPropagation(); onPersonFilter && onPersonFilter(ps.name); }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
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
      <div className="page-head">
        <div>
          {showBackToCrew && (
            <button className="back-to-crew-btn" onClick={() => onPersonFilter && onPersonFilter('all')}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              Crew-Übersicht
            </button>
          )}
          <h1 className="page-title">{personLabel ? `Übersicht — ${personLabel}` : 'Übersicht'}</h1>
          <p className="page-subtitle">
            {personLabel ? `${personLabel} · ` : ''}{c.totalWochen} Woche{c.totalWochen !== 1 ? 'n' : ''} importiert
          </p>
        </div>
        <div className="hstack page-head-actions">
          {personHasMultipleProjects && (
            <div className="proj-filter-pills">
              <button
                className={`proj-filter-pill ${projectFilter === 'all' ? 'active' : ''}`}
                onClick={() => onProjectFilter('all')}
              >Alle</button>
              {projects.map(p => (
                <button
                  key={p}
                  className={`proj-filter-pill ${projectFilter === p ? 'active' : ''}`}
                  onClick={() => onProjectFilter(p)}
                >{p}</button>
              ))}
            </div>
          )}
          <button className="btn-ghost" onClick={() => setShowNewProject(v => !v)} title="Neues Projekt erstellen">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Projekt
          </button>
          <div className="export-dropdown">
            <button className="export-btn" onClick={() => setShowExport(!showExport)} disabled={exporting} aria-label="Exportieren">
              {exporting ? '⏳ Exportiert…' : '↗ Exportieren'}
            </button>
            {showExport && !exporting && (
              <div className="export-menu" role="menu">
                <button onClick={() => handleExportCSV()} role="menuitem">CSV exportieren</button>
                <button onClick={() => handleExportPDF()} role="menuitem">PDF exportieren</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Project creation form (regular view) */}
      {showNewProject && (
        <div className="proj-create-form-card">
          <div className="proj-create-form-header">
            <h3>Neues Projekt</h3>
            <button className="proj-create-close" onClick={() => setShowNewProject(false)}>×</button>
          </div>
          <div className="proj-create-form-grid">
            <div className="proj-create-field">
              <label>Projektname *</label>
              <input type="text" value={newProjForm.name} onChange={e => setNewProjForm(f => ({ ...f, name: e.target.value }))} placeholder="z.B. Mein Film 2026" autoFocus onKeyDown={e => e.key === 'Enter' && handleCreateProject()} />
            </div>
            <div className="proj-create-field">
              <label>Projektnummer</label>
              <input type="text" value={newProjForm.nummer} onChange={e => setNewProjForm(f => ({ ...f, nummer: e.target.value }))} placeholder="z.B. 12345" />
            </div>
            <div className="proj-create-field">
              <label>Produktionsfirma</label>
              <input type="text" value={newProjForm.firma} onChange={e => setNewProjForm(f => ({ ...f, firma: e.target.value }))} placeholder="z.B. Bavaria Film" />
            </div>
            <div className="proj-create-field">
              <label>Erster Drehtag</label>
              <input type="date" value={newProjForm.start} onChange={e => setNewProjForm(f => ({ ...f, start: e.target.value }))} />
            </div>
          </div>
          <div className="proj-create-form-actions">
            <button className="btn btn-secondary" onClick={() => setShowNewProject(false)}>Abbrechen</button>
            <button className="btn btn-primary" onClick={handleCreateProject} disabled={!newProjForm.name.trim()}>Erstellen</button>
          </div>
        </div>
      )}
      {expandedProjEdit && (settings.projects || {})[expandedProjEdit] && (
        <div className="proj-edit-banner">
          <div className="proj-edit-banner-title">
            <span>🎬 {expandedProjEdit}</span>
            <button className="proj-create-close" onClick={() => setExpandedProjEdit(null)}>×</button>
          </div>
          <div className="proj-create-form-grid">
            <div className="proj-create-field">
              <label>Projektnummer</label>
              <input type="text" value={(settings.projects || {})[expandedProjEdit].projektnummer || ''} onChange={e => handleUpdateProjectField(expandedProjEdit, 'projektnummer', e.target.value)} placeholder="z.B. 12345" />
            </div>
            <div className="proj-create-field">
              <label>Produktionsfirma</label>
              <input type="text" value={(settings.projects || {})[expandedProjEdit].produktionsfirma || ''} onChange={e => handleUpdateProjectField(expandedProjEdit, 'produktionsfirma', e.target.value)} placeholder="z.B. Bavaria Film" />
            </div>
            <div className="proj-create-field">
              <label>Erster Drehtag</label>
              <input type="date" value={(settings.projects || {})[expandedProjEdit].drehStartDatum || ''} onChange={e => handleUpdateProjectField(expandedProjEdit, 'drehStartDatum', e.target.value)} />
            </div>
          </div>
          <p className="proj-edit-banner-hint">Das Projekt wurde gespeichert. Felder können jederzeit hier bearbeitet werden.</p>
          <div className="proj-create-form-actions">
            <button className="btn btn-icon-danger btn-secondary" onClick={() => handleDeleteProject(expandedProjEdit)}>🗑 Projekt löschen</button>
            <button className="btn btn-primary" onClick={() => setExpandedProjEdit(null)}>Fertig</button>
          </div>
        </div>
      )}

      {/* Alles unterhalb nur zeigen wenn Projekt gewählt (oder nur ein Projekt existiert) */}
      {(<>

      {/* KPI Row */}
      <div className="kpi-row">
        <div className="kpi-card">
          <div className="kpi-card-label">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>
            Gesamtstunden
          </div>
          <div className="kpi-card-value">
            {c.totalStunden.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            <span className="unit"> Std.</span>
          </div>
          {c.totalArbeitstage > 0 && (
            <div className="kpi-card-trend">{c.totalArbeitstage} Arbeitstage</div>
          )}
        </div>
        <div className="kpi-card">
          <div className="kpi-card-label">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
            Überstunden
          </div>
          <div className="kpi-card-value">
            {c.totalUeberstunden.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            <span className="unit"> Std.</span>
          </div>
          {c.totalStunden > 0 && (
            <div className={`kpi-card-trend${c.totalUeberstunden / c.totalStunden > 0.15 ? ' warn' : ''}`}>
              {((c.totalUeberstunden / c.totalStunden) * 100).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}% des Volumens
            </div>
          )}
        </div>
        <div className="kpi-card">
          <div className="kpi-card-label">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            Verdienst (brutto)
          </div>
          <div className="kpi-card-value">
            {hasGage
              ? c.gesamtVerdienst.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
              : '–'}
            {hasGage && <span className="unit"> €</span>}
          </div>
          {hasGage && c.grundgage > 0 && (
            <div className="kpi-card-trend">
              {formatCurrency(c.grundgage)} Grundgage
            </div>
          )}
          {!hasGage && (
            <div className="kpi-card-trend">Gage eingeben für Berechnung</div>
          )}
        </div>
        <div className="kpi-card">
          <div className="kpi-card-label">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            Urlaub angespart
          </div>
          <div className="kpi-card-value">
            {c.urlaubstage ?? '–'}
            {c.urlaubstage != null && <span className="unit"> Tage</span>}
          </div>
          {c.urlaubstageOffen > 0 && (
            <div className="kpi-card-trend">{c.urlaubstageOffen} offen, auszahlbar</div>
          )}
          {c.urlaubstageOffen === 0 && c.urlaubstageGenommen > 0 && (
            <div className="kpi-card-trend">{c.urlaubstageGenommen} genommen</div>
          )}
        </div>
      </div>

      {/* Gage Eingabe Card */}
      <div className="card gage-settings-card">
        <div className="card-head">
          <div className="hstack" style={{gap: 6}}>
            <span className="card-title">Gage</span>
            {personFilter !== 'all' && (
              <span className="gage-ctx-badge">{personFilter}</span>
            )}
            {projectFilter !== 'all' && (
              <span className="gage-ctx-badge gage-ctx-project">{projectFilter}</span>
            )}
          </div>
          <div className="tabs gage-tabs">
            <button className={`tab ${gageType === 'tag' ? 'active' : ''}`} onClick={() => handleGageTypeChange('tag')}>Tagesgage</button>
            <button className={`tab ${gageType === 'woche' ? 'active' : ''}`} onClick={() => handleGageTypeChange('woche')}>Wochengage</button>
          </div>
        </div>
        <div className="card-body gage-settings-body">
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
          <div className="spacer" />
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
      {((c.ruhezeitVerletzungen && c.ruhezeitVerletzungen.length > 0) || (c.feiertageList && c.feiertageList.length > 0) || (c.heiligabendSilvester && c.heiligabendSilvester.length > 0) || c.totalKranktageUnbezahlt > 0 || missingWeeks.length > 0) && (
        <div className="stats-section warnings-section">
          <h3 className="section-title">⚠ Hinweise</h3>

          {missingWeeks.length > 0 && (
            <div className="warning-card warning-info">
              <div className="warning-header">📋 Fehlende Kalenderwochen ({missingWeeks.reduce((s, g) => s + g.missing.length, 0)})</div>
              <div className="warning-body">
                <p className="warning-note">Zwischen erster und letzter erfasster Woche fehlen Stundenzettel:</p>
                {missingWeeks.map((g, i) => (
                  <div key={i} className="warning-row">
                    <span className="warning-name">{g.person}</span>
                    <span className="warning-date">{g.projekt}</span>
                    <span className="warning-hours">{g.missing.map(m => m.label).join(', ')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          
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
        <div className="card" style={{marginBottom: 24}}>
          <div className="card-head">
            <h2 className="card-title">Projektübersicht</h2>
            {projectFilter !== 'all' && (
              <button className="btn-ghost" style={{fontSize: 12}} onClick={() => onProjectFilter && onProjectFilter('all')}>✕ Filter zurücksetzen</button>
            )}
          </div>
          <div className="card-body" style={{paddingTop: 12}}>
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
          </div>
        </div>
      )}

      {/* Arbeitszeit Karten */}
      <div className="card" style={{marginBottom: 24}}>
        <div className="card-head">
          <h2 className="card-title">Arbeitszeit{projectFilter !== 'all' ? ` — ${projectFilter}` : ''}</h2>
        </div>
        <div className="card-body" style={{paddingTop: 12}}>
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
      </div>

      {/* Überstunden Detail */}
      <div className="card" style={{marginBottom: 24}}>
        <div className="card-head">
          <h2 className="card-title">Überstunden & Zuschläge</h2>
        </div>
        <div className="card-body" style={{paddingTop: 12}}>
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
      </div>

      {/* Zeitkonto */}
      {zeitkonto && c.totalUeberstunden > 0 && (
        <div className="zeitkonto-card" style={{marginBottom: 24}}>
          <div className="card-head zeitkonto-card-head">
            <h2 className="card-title" style={{color: 'var(--accent-blue)'}}>Zeitkonto (TVFFS)</h2>
          </div>
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
      )}
      {hasGage && (
        <div className="card" style={{marginBottom: 24}}>
          <div className="card-head">
            <h2 className="card-title">Vergütung (TV-FFS 2025)</h2>
          </div>
          <div className="earnings-card earnings-inner">
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
      <div className="card" style={{marginBottom: 24}}>
        <div className="card-head">
          <h2 className="card-title">Urlaub (TZ 14.1 TV-FFS)</h2>
        </div>
        <div className="card-body" style={{paddingTop: 12}}>
          <div className="stats-grid">
            <StatCard label="Gesammelte Urlaubstage" value={c.urlaubstage} unit="Tage" color="green" large />
          </div>
          {c.anstellungstage > 0 ? (
            <p className="stats-note">0,5 Urlaubstag pro 7 zusammenhängende Anstellungstage ({c.anstellungstage} Tage ÷ 7 = {c.totalWochen} × 0,5 = {Number(c.urlaubstage).toFixed(2)} Tage). Urlaubstage werden gesammelt und nicht als Geld ausgezahlt.</p>
          ) : (
            <p className="stats-note">Summe der individuell berechneten Urlaubstage aller Personen (0,5 Tage pro 7 Anstellungstage). Urlaubstage werden gesammelt und nicht als Geld ausgezahlt.</p>
          )}
        </div>
      </div>

      {/* Stunden-Chart */}
      {chartData.length > 1 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-head">
            <h2 className="card-title">Stundenverlauf</h2>
            <div className="card-actions">
              {chartData.length > 0 && (
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {chartData[0]?.label} – {chartData[chartData.length - 1]?.label}
                </span>
              )}
              <div className="chart-legend" style={{ margin: 0 }}>
                <span className="chart-legend-item"><span className="chart-dot chart-dot-total" /> Gesamt</span>
                <span className="chart-legend-item"><span className="chart-dot chart-dot-ot" /> Überstunden</span>
              </div>
            </div>
          </div>
          <div className="card-body">
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
      <div className="card" style={{marginBottom: 24}}>
        <div className="card-head">
          <h2 className="card-title">Letzte Einträge</h2>
        </div>
        <div className="card-body" style={{paddingTop: 10, paddingBottom: 10}}>
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

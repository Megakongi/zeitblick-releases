/**
 * TV-FFS 2025 (Tarifvertrag für Film- und Fernsehschaffende) Berechnungslogik
 * Tarifvertrag vom 12. Oktober 2024, Gagentarifvertrag 2024–2026
 *
 * Regelungen:
 * - Tagesgage = 10h Arbeitszeit (TZ 5.3.1)
 * - Wochengage = 5-Tage-Woche, bis 50h (TZ 5.3.1)
 * - Stundengage = 1/10 Tagesgage = 1/50 Wochengage (TZ 5.7.1)
 * - Tägliche Mehrarbeit (TZ 5.4.3.2): 11. Std = 25%, ab 12. Std = 50%
 * - Wöchentliche Mehrarbeit (TZ 5.4.3.3): 51.–55. Std = 25%, ab 56. Std = 50%
 * - Nachtzuschlag 25% auf Stundensatz (TZ 5.5.2, 22:00–06:00)
 * - Samstag: 25% Zuschlag (TZ 5.6.4)
 * - Sonntag: 75% Zuschlag + Ruhetag (TZ 5.6.3)
 * - Feiertag: 100% Zuschlag (TZ 5.6.3)
 * - Urlaub (TZ 14.1): 0,5 Tage pro angefangene 7-Tage-Vertragszeit
 * - Krankheit (TZ 13.3): bezahlter Tag, bis 6 Wochen
 * - Zeitkonto (Anlage A.1.1): Ü-Grundvergütung → Zeitkonto
 * - Ruhezeit: mind. 11h zwischen Schichten (ArbZG §5)
 */

import { isHoliday, parseTime } from './holidays';

export function calculateTVFFS(timesheets, settings) {
  if (!timesheets || timesheets.length === 0) {
    return getEmptyCalculations();
  }

  const gageType = settings.gageType || 'tag';
  const zeitkonto = settings.zeitkonto || false;
  const hasGage = settings.tagesgage > 0;

  const tagesgage = hasGage
    ? (gageType === 'woche' ? settings.tagesgage / 5 : settings.tagesgage)
    : 0;
  const stundensatz = tagesgage / 10;

  let totalArbeitstage = 0;
  let totalKranktage = 0;
  let totalAZVTage = 0;
  let urlaubstageGenommen = 0;
  let totalStunden = 0;
  let totalUeberstunden25 = 0;
  let totalUeberstunden50 = 0;
  let totalUeberstunden100 = 0;
  let totalNacht = 0;
  let totalFahrzeit = 0;
  let totalSonntagstage = 0;
  let totalSamstagstage = 0;
  let totalSonntagsstunden = 0;
  let totalSamstagsstunden = 0;
  let totalFeiertagstage = 0;
  let totalFeiertagsstunden = 0;
  let totalKranktageUnbezahlt = 0;
  const feiertageList = [];
  const heiligabendSilvester = [];
  const ruhezeitVerletzungen = [];

  // Collect all days with sheet context for rest time check
  const allDays = [];

  for (const sheet of timesheets) {
    let sheetStunden = 0;

    for (const day of sheet.days) {
      const anm = (day.anmerkungen || '').toLowerCase().trim();
      const isKrank = anm.includes('krank');
      const isUrlaub = anm.includes('urlaub') || anm === 'u';
      const isAZV = anm.includes('azv') || anm.includes('arbeitszeitverkürzung') || anm.includes('zeitausgleich') || anm === 'za';
      const isFrei = anm === 'frei' || anm === 'f' || anm.includes('ruhetag');

      if (isUrlaub) {
        urlaubstageGenommen++;
        continue;
      }
      if (isKrank) {
        totalKranktage++;
        // TZ 13.3: max 6 weeks (42 days) paid sick leave
        if (totalKranktage > 42) {
          totalKranktageUnbezahlt++;
        }
        continue;
      }
      if (isAZV) {
        // AZV = bezahlter freier Tag (Zeitkonto-Ausgleich)
        totalAZVTage++;
        continue;
      }
      if (isFrei) {
        // Freier Tag / Ruhetag — nicht bezahlt, überspringen
        continue;
      }

      const hasWork = Number(day.stundenTotal) > 0 || (day.start && String(day.start).trim().includes(':'));
      if (!hasWork) continue;

      totalArbeitstage++;
      const hours = day.stundenTotal || 0;
      totalStunden += hours;
      sheetStunden += hours;
      totalUeberstunden25 += day.ueberstunden25 || 0;
      totalUeberstunden50 += day.ueberstunden50 || 0;
      totalUeberstunden100 += day.ueberstunden100 || 0;
      totalNacht += day.nacht25 || 0;
      totalFahrzeit += day.fahrzeit || 0;

      // Holiday detection
      const holiday = isHoliday(day.datum);
      if (holiday) {
        totalFeiertagstage++;
        totalFeiertagsstunden += hours;
        feiertageList.push({ datum: day.datum, name: holiday, stunden: hours, sheetId: sheet.id });
      }

      // Heiligabend / Silvester detection (not official holidays but common special days)
      if (day.datum) {
        const [dd, mm] = day.datum.split('.').map(Number);
        if ((dd === 24 && mm === 12) || (dd === 31 && mm === 12)) {
          heiligabendSilvester.push({ datum: day.datum, name: dd === 24 ? 'Heiligabend' : 'Silvester', stunden: hours });
        }
      }

      if (day.tag === 'Sonntag' || day.tag === 'So') {
        totalSonntagstage++;
        totalSonntagsstunden += hours;
      }
      if (day.tag === 'Samstag' || day.tag === 'Sa') {
        totalSamstagstage++;
        totalSamstagsstunden += hours;
      }

      // Saturday surcharge for cross-midnight shifts (TZ 5.6.4):
      // If a shift extends past midnight into Saturday, hours from 00:00 onward count
      if (day.tag !== 'Samstag' && day.tag !== 'Sa') {
        let samstagCrossMidnight = 0;

        // Check "Sa: X:XX" annotation from PDF import
        const saMatch = (day.anmerkungen || '').match(/Sa:\s*(\d{1,2}):(\d{2})/);
        if (saMatch) {
          samstagCrossMidnight = parseInt(saMatch[1]) + parseInt(saMatch[2]) / 60;
        } else if (day.start && day.ende) {
          // Auto-calculate: if shift crosses midnight and next day is Saturday
          const startH = parseTime(day.start);
          const endH = parseTime(day.ende);
          if (startH !== null && endH !== null && endH < startH) {
            // Shift crosses midnight — check if next day is Saturday
            let isFriday = false;
            if (day.tag === 'Freitag' || day.tag === 'Fr') {
              isFriday = true;
            } else if (day.datum) {
              const [dd, mm, yy] = day.datum.split('.').map(Number);
              if (!isNaN(dd) && !isNaN(mm) && !isNaN(yy)) {
                const year = yy < 100 ? 2000 + yy : yy;
                const dateObj = new Date(year, mm - 1, dd);
                isFriday = dateObj.getDay() === 5;
              }
            }
            if (isFriday) {
              samstagCrossMidnight = endH; // hours from 00:00 to end
            }
          }
        }

        if (samstagCrossMidnight > 0) {
          totalSamstagsstunden += samstagCrossMidnight;
          // Count as a Saturday day if there are hours on Saturday
          totalSamstagstage = Math.max(totalSamstagstage, 1);
        }
      }

      // Collect for rest time check
      if (day.start && day.ende && day.datum) {
        allDays.push({
          datum: day.datum,
          start: day.start,
          ende: day.ende,
          tag: day.tag,
          sheetId: sheet.id,
        });
      }
    }

    // === WEEKLY OVERTIME (TZ 5.4.3.3) ===
    // Per sheet (= 1 week): hours >50 are weekly OT
    // 51–55h: 25%, 56+h: 50%
    // This is ADDITIONAL to the daily OT already on the PDF
    // We track it separately for information
    sheet._weeklyOTHours25 = Math.max(0, Math.min(sheetStunden, 55) - 50);
    sheet._weeklyOTHours50 = Math.max(0, sheetStunden - 55);
  }

  // === REST TIME VIOLATIONS (ArbZG §5: 11h between shifts) ===
  // Sort all days by date
  allDays.sort((a, b) => {
    const [dA, mA, yA] = a.datum.split('.').map(Number);
    const [dB, mB, yB] = b.datum.split('.').map(Number);
    const dateA = new Date(yA < 100 ? 2000 + yA : yA, mA - 1, dA);
    const dateB = new Date(yB < 100 ? 2000 + yB : yB, mB - 1, dB);
    return dateA - dateB;
  });

  for (let i = 1; i < allDays.length; i++) {
    const prev = allDays[i - 1];
    const curr = allDays[i];
    
    const prevEnd = parseTime(prev.ende);
    const currStart = parseTime(curr.start);
    if (prevEnd === null || currStart === null) continue;

    // Parse dates
    const [pd, pm, py] = prev.datum.split('.').map(Number);
    const [cd, cm, cy] = curr.datum.split('.').map(Number);
    const prevDate = new Date(py < 100 ? 2000 + py : py, pm - 1, pd);
    const currDate = new Date(cy < 100 ? 2000 + cy : cy, cm - 1, cd);
    
    const dayDiff = (currDate - prevDate) / (1000 * 60 * 60 * 24);
    if (dayDiff > 2 || dayDiff < 0) continue; // skip non-consecutive

    // Calculate rest hours
    let restHours;
    if (dayDiff === 0) {
      // Same day — unusual, skip
      continue;
    } else if (dayDiff === 1) {
      // Next day: rest = (24 - prevEnd) + currStart
      restHours = (24 - prevEnd) + currStart;
    } else {
      // 2 days apart: always > 11h rest
      continue;
    }

    if (restHours < 11) {
      ruhezeitVerletzungen.push({
        datum1: prev.datum,
        ende1: prev.ende,
        datum2: curr.datum,
        start2: curr.start,
        ruhezeit: round2(restHours),
        fehlend: round2(11 - restHours),
      });
    }
  }

  // Bezahlte Tage
  // Bezahlte Tage: Arbeitstage + Krankheit (max 42) + AZV (alles bezahlte Tage)
  const bezahlteKranktage = Math.min(totalKranktage, 42);
  const totalBezahlteTage = totalArbeitstage + bezahlteKranktage + totalAZVTage;
  const totalUeberstunden = totalUeberstunden25 + totalUeberstunden50 + totalUeberstunden100;
  const durchschnittStundenProTag = totalArbeitstage > 0 ? totalStunden / totalArbeitstage : 0;

  // Weekly OT totals
  let weeklyOT25 = 0;
  let weeklyOT50 = 0;
  for (const sheet of timesheets) {
    weeklyOT25 += sheet._weeklyOTHours25 || 0;
    weeklyOT50 += sheet._weeklyOTHours50 || 0;
  }

  // Urlaub (TZ 14.1): 0,5 Urlaubstag pro angefangene 7-Tage-Vertragszeit
  // Vertragszeit = zusammenhängende Anstellungstage (erster bis letzter Arbeitstag)
  // Include all relevant days (work, krank, AZV, urlaub) for contract duration
  const allDates = [];
  for (const sheet of timesheets) {
    for (const day of sheet.days) {
      if (!day.datum) continue;
      const anm = (day.anmerkungen || '').toLowerCase().trim();
      const hasActivity = Number(day.stundenTotal) > 0 || (day.start && String(day.start).trim().includes(':'))
        || anm.includes('krank') || anm.includes('urlaub') || anm === 'u'
        || anm.includes('azv') || anm.includes('arbeitszeitverkürzung') || anm.includes('zeitausgleich') || anm === 'za';
      if (hasActivity) {
        const [dd, mm, yy] = day.datum.split('.').map(Number);
        if (dd && mm && yy) allDates.push(new Date(yy, mm - 1, dd));
      }
    }
  }
  let anstellungstage = 0;
  if (allDates.length > 0) {
    allDates.sort((a, b) => a - b);
    const first = allDates[0];
    const last = allDates[allDates.length - 1];
    anstellungstage = Math.round((last - first) / (1000 * 60 * 60 * 24)) + 1;
  }
  const totalWochen = Math.floor(anstellungstage / 7);
  const urlaubstage = totalWochen * 0.5;

  // === GAGE ===
  if (!hasGage) {
    return {
      ...getEmptyCalculations(),
      totalArbeitstage, totalKranktage, totalAZVTage, totalBezahlteTage,
      totalStunden: round2(totalStunden),
      totalUeberstunden: round2(totalUeberstunden),
      totalUeberstunden25: round2(totalUeberstunden25),
      totalUeberstunden50: round2(totalUeberstunden50),
      totalUeberstunden100: round2(totalUeberstunden100),
      totalNacht: round2(totalNacht),
      totalFahrzeit: round2(totalFahrzeit),
      durchschnittStundenProTag: round2(durchschnittStundenProTag),
      totalSonntagstage, totalSamstagstage,
      totalSonntagsstunden: round2(totalSonntagsstunden),
      totalSamstagsstunden: round2(totalSamstagsstunden),
      totalFeiertagstage, totalFeiertagsstunden: round2(totalFeiertagsstunden),
      feiertageList, heiligabendSilvester, ruhezeitVerletzungen,
      weeklyOT25: round2(weeklyOT25), weeklyOT50: round2(weeklyOT50),
      urlaubstage, urlaubstageGenommen, totalWochen, anstellungstage,
      totalKranktageUnbezahlt, bezahlteKranktage,
    };
  }

  // Grundgage — Vertretung-Tage werden gleich vergütet (selbe Tagesgage)
  const grundgage = totalBezahlteTage * tagesgage;

  // Zuschläge
  const zuschlag25 = totalUeberstunden25 * stundensatz * 0.25;
  const zuschlag50 = totalUeberstunden50 * stundensatz * 0.50;
  const zuschlag100 = totalUeberstunden100 * stundensatz * 1.00;
  const totalUeberstundenZuschlag = zuschlag25 + zuschlag50 + zuschlag100;
  const ueberstundenGrundverguetung = totalUeberstunden * stundensatz;

  const nachtZuschlag = totalNacht * stundensatz * 0.25;
  const samstagZuschlag = totalSamstagsstunden * stundensatz * 0.25;
  const sonntagZuschlag = totalSonntagsstunden * stundensatz * 0.75;

  // Feiertagszuschlag 100% (TZ 5.6.3) - only for holidays that aren't already Sunday
  const feiertagZuschlag = totalFeiertagsstunden * stundensatz * 1.0;

  // Weekly OT zuschläge (TZ 5.4.3.3 — additional to daily OT)
  const weeklyOTZuschlag25 = weeklyOT25 * stundensatz * 0.25;
  const weeklyOTZuschlag50 = weeklyOT50 * stundensatz * 0.50;
  const weeklyOTGrundverguetung = (weeklyOT25 + weeklyOT50) * stundensatz;

  // Zeitkonto
  const zeitkontoStunden = zeitkonto ? round2(totalUeberstunden) : 0;
  const zeitkontoWert = zeitkonto ? round2(zeitkontoStunden * stundensatz) : 0;
  const zeitkontoTage = zeitkonto ? round2(zeitkontoStunden / 10) : 0;
  const zeitkontoTageAuszahlung = round2(zeitkontoTage * tagesgage);

  // Urlaubstage offen (nicht genommen)
  const urlaubstageOffen = Math.max(0, urlaubstage - urlaubstageGenommen);
  const urlaubstageAuszahlung = round2(urlaubstageOffen * tagesgage);

  // Brutto (includes weekly OT per TZ 5.4.3.3)
  const ueberstundenAuszahlung = zeitkonto ? 0 : ueberstundenGrundverguetung;
  const weeklyOTAuszahlung = zeitkonto ? 0 : weeklyOTGrundverguetung;
  const bruttoGage = grundgage
    + ueberstundenAuszahlung
    + totalUeberstundenZuschlag
    + weeklyOTAuszahlung
    + weeklyOTZuschlag25
    + weeklyOTZuschlag50
    + nachtZuschlag
    + samstagZuschlag
    + sonntagZuschlag
    + feiertagZuschlag;

  const gesamtVerdienst = bruttoGage + urlaubstageAuszahlung + zeitkontoTageAuszahlung;

  return {
    totalArbeitstage, totalKranktage, totalAZVTage, totalBezahlteTage,
    totalStunden: round2(totalStunden),
    totalUeberstunden: round2(totalUeberstunden),
    totalUeberstunden25: round2(totalUeberstunden25),
    totalUeberstunden50: round2(totalUeberstunden50),
    totalUeberstunden100: round2(totalUeberstunden100),
    totalNacht: round2(totalNacht),
    totalFahrzeit: round2(totalFahrzeit),
    durchschnittStundenProTag: round2(durchschnittStundenProTag),
    totalSonntagstage, totalSamstagstage,
    totalSonntagsstunden: round2(totalSonntagsstunden),
    totalSamstagsstunden: round2(totalSamstagsstunden),
    totalFeiertagstage, totalFeiertagsstunden: round2(totalFeiertagsstunden),
    feiertageList,
    heiligabendSilvester,
    ruhezeitVerletzungen,
    weeklyOT25: round2(weeklyOT25),
    weeklyOT50: round2(weeklyOT50),
    weeklyOTZuschlag25: round2(weeklyOTZuschlag25),
    weeklyOTZuschlag50: round2(weeklyOTZuschlag50),
    weeklyOTGrundverguetung: round2(zeitkonto ? 0 : weeklyOTGrundverguetung),
    totalKranktageUnbezahlt, bezahlteKranktage,

    tagesgageEffective: round2(tagesgage),
    stundensatz: round2(stundensatz),
    grundgage: round2(grundgage),
    ueberstundenGrundverguetung: round2(zeitkonto ? 0 : ueberstundenGrundverguetung),
    zuschlag25: round2(zuschlag25),
    zuschlag50: round2(zuschlag50),
    zuschlag100: round2(zuschlag100),
    totalUeberstundenZuschlag: round2(totalUeberstundenZuschlag),
    nachtZuschlag: round2(nachtZuschlag),
    samstagZuschlag: round2(samstagZuschlag),
    sonntagZuschlag: round2(sonntagZuschlag),
    feiertagZuschlag: round2(feiertagZuschlag),
    bruttoGage: round2(bruttoGage),

    urlaubstage, urlaubstageGenommen, urlaubstageOffen, urlaubstageAuszahlung: round2(urlaubstageAuszahlung), anstellungstage,
    zeitkonto, zeitkontoStunden, zeitkontoWert, zeitkontoTage, zeitkontoTageAuszahlung: round2(zeitkontoTageAuszahlung),
    gesamtVerdienst: round2(gesamtVerdienst),
    totalWochen,
  };
}

export function calculateSheetTVFFS(sheet, settings) {
  return calculateTVFFS([sheet], settings);
}

function getEmptyCalculations() {
  return {
    totalArbeitstage: 0, totalKranktage: 0, totalAZVTage: 0, totalBezahlteTage: 0,
    totalStunden: 0, totalUeberstunden: 0,
    totalUeberstunden25: 0, totalUeberstunden50: 0, totalUeberstunden100: 0,
    totalNacht: 0, totalFahrzeit: 0, durchschnittStundenProTag: 0,
    totalSonntagstage: 0, totalSamstagstage: 0,
    totalSonntagsstunden: 0, totalSamstagsstunden: 0,
    totalFeiertagstage: 0, totalFeiertagsstunden: 0,
    feiertageList: [], heiligabendSilvester: [], ruhezeitVerletzungen: [],
    weeklyOT25: 0, weeklyOT50: 0, weeklyOTZuschlag25: 0, weeklyOTZuschlag50: 0,
    weeklyOTGrundverguetung: 0, totalKranktageUnbezahlt: 0, bezahlteKranktage: 0,
    tagesgageEffective: 0, stundensatz: 0, grundgage: 0,
    ueberstundenGrundverguetung: 0,
    zuschlag25: 0, zuschlag50: 0, zuschlag100: 0, totalUeberstundenZuschlag: 0,
    nachtZuschlag: 0, samstagZuschlag: 0, sonntagZuschlag: 0, feiertagZuschlag: 0,
    bruttoGage: 0, urlaubstage: 0, urlaubstageGenommen: 0, anstellungstage: 0,
    zeitkonto: false, zeitkontoStunden: 0, zeitkontoWert: 0, zeitkontoTage: 0, zeitkontoTageAuszahlung: 0,
    gesamtVerdienst: 0, totalWochen: 0, urlaubstageOffen: 0, urlaubstageAuszahlung: 0,
  };
}

function round2(val) {
  return Math.round(val * 100) / 100;
}

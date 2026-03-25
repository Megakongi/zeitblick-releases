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

// ── TV-FFS Tarifvertrag Konstanten ──
const HOURS_PER_DAY = 10;              // TZ 5.3.1: 10h = 1 Tagesgage
const HOURS_PER_WEEK = 50;             // TZ 5.3.1: Wochengage = 50h
const DAILY_OT_THRESHOLD_25 = 11;      // TZ 5.4.3.2: 11. Stunde = 25%
const WEEKLY_OT_THRESHOLD_25 = 50;     // TZ 5.4.3.3: 51.-55. Stunde = 25%
const WEEKLY_OT_THRESHOLD_50 = 55;     // TZ 5.4.3.3: ab 56. Stunde = 50%
const MAX_PAID_SICK_DAYS = 42;         // TZ 13.3: max 6 Wochen bezahlte Krankheit
const VACATION_DAYS_PER_WEEK = 0.5;    // TZ 14.1: 0,5 Urlaubstag pro 7-Tage-Vertragszeit
const MIN_REST_HOURS = 11;             // ArbZG §5: mind. 11h Ruhezeit
const NIGHT_SURCHARGE = 0.25;          // TZ 5.5.2: 25% Nachtzuschlag
const SATURDAY_SURCHARGE = 0.25;       // TZ 5.6.4: 25% Sa-Zuschlag
const SUNDAY_SURCHARGE = 0.75;         // TZ 5.6.3: 75% So-Zuschlag
const HOLIDAY_SURCHARGE = 1.0;         // TZ 5.6.3: 100% Feiertags-Zuschlag

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
  const stundensatz = tagesgage / HOURS_PER_DAY;

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
  let weeklyOT25 = 0;
  let weeklyOT50 = 0;

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
        // TZ 13.3: max 6 Wochen (42 Tage) bezahlte Krankheit
        if (totalKranktage > MAX_PAID_SICK_DAYS) {
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

      // Günstigkeitsprinzip: Feiertag (100%) takes priority over Sonntag (75%)
      if ((day.tag === 'Sonntag' || day.tag === 'So') && !holiday) {
        totalSonntagstage++;
        totalSonntagsstunden += hours;
      }
      if (day.tag === 'Samstag' || day.tag === 'Sa') {
        totalSamstagstage++;
        // Check if shift crosses midnight into Sunday (TZ 5.6.3)
        let sonntagCrossMidnight = 0;
        if (day.start && day.ende) {
          const startH = parseTime(day.start);
          const endH = parseTime(day.ende);
          if (startH !== null && endH !== null && endH < startH) {
            sonntagCrossMidnight = endH;
          }
        }
        totalSamstagsstunden += hours - sonntagCrossMidnight;
        if (sonntagCrossMidnight > 0) {
          totalSonntagsstunden += sonntagCrossMidnight;
          totalSonntagstage = Math.max(totalSonntagstage, 1);
        }
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
          person: sheet.name || sheet.id,
        });
      }
    }

    // === WEEKLY OVERTIME (TZ 5.4.3.3) ===
    // Per sheet (= 1 week): hours >50 are weekly OT
    // 51–55h: 25%, 56+h: 50%
    // This is ADDITIONAL to the daily OT already on the PDF
    // We track it separately for information
    weeklyOT25 += Math.max(0, Math.min(sheetStunden, WEEKLY_OT_THRESHOLD_50) - WEEKLY_OT_THRESHOLD_25);
    weeklyOT50 += Math.max(0, sheetStunden - WEEKLY_OT_THRESHOLD_50);
  }

  // === REST TIME VIOLATIONS (ArbZG §5: 11h between shifts) ===
  // Group by person to avoid comparing different people's shifts
  const daysByPerson = new Map();
  for (const d of allDays) {
    const key = d.person;
    if (!daysByPerson.has(key)) daysByPerson.set(key, []);
    daysByPerson.get(key).push(d);
  }

  for (const [, personDays] of daysByPerson) {
    personDays.sort((a, b) => {
      const [dA, mA, yA] = a.datum.split('.').map(Number);
      const [dB, mB, yB] = b.datum.split('.').map(Number);
      const dateA = new Date(yA < 100 ? 2000 + yA : yA, mA - 1, dA);
      const dateB = new Date(yB < 100 ? 2000 + yB : yB, mB - 1, dB);
      return dateA - dateB;
    });

    for (let i = 1; i < personDays.length; i++) {
      const prev = personDays[i - 1];
      const curr = personDays[i];
      
      const prevEnd = parseTime(prev.ende);
      const currStart = parseTime(curr.start);
      if (prevEnd === null || currStart === null) continue;

      // Parse dates
      const [pd, pm, py] = prev.datum.split('.').map(Number);
      const [cd, cm, cy] = curr.datum.split('.').map(Number);
      const prevDate = new Date(py < 100 ? 2000 + py : py, pm - 1, pd);
      const currDate = new Date(cy < 100 ? 2000 + cy : cy, cm - 1, cd);
      
      const dayDiff = (currDate - prevDate) / (1000 * 60 * 60 * 24);
      if (dayDiff > 2 || dayDiff < 0) continue;

      let restHours;
      if (dayDiff === 0) {
        continue;
      } else if (dayDiff === 1) {
        restHours = (24 - prevEnd) + currStart;
      } else {
        continue;
      }

      if (restHours < MIN_REST_HOURS) {
        ruhezeitVerletzungen.push({
          datum1: prev.datum,
          ende1: prev.ende,
          datum2: curr.datum,
          start2: curr.start,
          ruhezeit: round2(restHours),
          fehlend: round2(MIN_REST_HOURS - restHours),
        });
      }
    }
  }

  // Bezahlte Tage
  // Bezahlte Tage: Arbeitstage + Krankheit (max 42) + AZV (alles bezahlte Tage)
  const bezahlteKranktage = Math.min(totalKranktage, MAX_PAID_SICK_DAYS);
  const totalBezahlteTage = totalArbeitstage + bezahlteKranktage + totalAZVTage;
  const totalUeberstunden = totalUeberstunden25 + totalUeberstunden50 + totalUeberstunden100;
  const durchschnittStundenProTag = totalArbeitstage > 0 ? totalStunden / totalArbeitstage : 0;

  // Weekly OT totals already accumulated in loop above

  // Urlaub (TZ 14.1): 0,5 Urlaubstag pro angefangene 7-Tage-Vertragszeit
  // Vertragszeit = erster Tag mit Aktivität bis letzter Tag pro Person
  // Führende freie Tage (vor erstem Arbeitstag) zählen nicht mit
  // Berechnung individuell pro Person, dann summiert
  const nameAliases = settings.nameAliases || {};
  const resolvePerson = (n) => nameAliases[n] || n;
  const contractDaysByPerson = {};
  for (const sheet of timesheets) {
    const person = resolvePerson(sheet.name || 'Unbekannt');
    if (!contractDaysByPerson[person]) contractDaysByPerson[person] = [];
    for (const day of sheet.days) {
      if (!day.datum) continue;
      const [dd, mm, yy] = day.datum.split('.').map(Number);
      if (!dd || !mm || !yy) continue;
      const date = new Date(yy < 100 ? 2000 + yy : yy, mm - 1, dd);
      const hrs = Number(day.stundenTotal) || 0;
      const hasStart = day.start && String(day.start).includes(':');
      const anm = (day.anmerkungen || '').toLowerCase().trim();
      const active = hrs > 0 || hasStart || anm.includes('krank') || anm.includes('urlaub') || anm === 'u' || anm.includes('azv');
      contractDaysByPerson[person].push({ date, active });
    }
  }
  let anstellungstage = 0;
  let urlaubstage = 0;
  let totalWochen = 0;
  const personAnstellungstage = {};
  for (const [person, days] of Object.entries(contractDaysByPerson)) {
    if (days.length === 0) continue;
    days.sort((a, b) => a.date - b.date);

    // Find continuous employment blocks:
    // A block starts at the first active day and extends as long as there is
    // no gap of more than 7 days between consecutive active days.
    const activeDays = days.filter(d => d.active);
    if (activeDays.length === 0) { personAnstellungstage[person] = 0; continue; }

    let personTotalTage = 0;
    let blockStart = activeDays[0].date;
    let blockEnd = activeDays[0].date;

    for (let i = 1; i < activeDays.length; i++) {
      const gap = Math.round((activeDays[i].date - blockEnd) / (1000 * 60 * 60 * 24));
      if (gap <= 7) {
        // Still continuous — extend block
        blockEnd = activeDays[i].date;
      } else {
        // Gap too large — close current block, start new one
        personTotalTage += Math.round((blockEnd - blockStart) / (1000 * 60 * 60 * 24)) + 1;
        blockStart = activeDays[i].date;
        blockEnd = activeDays[i].date;
      }
    }
    // Close last block
    personTotalTage += Math.round((blockEnd - blockStart) / (1000 * 60 * 60 * 24)) + 1;

    personAnstellungstage[person] = personTotalTage;
    const wochen = Math.floor(personTotalTage / 7);
    totalWochen += wochen;
    // Halbe Urlaubstage aufrunden (z.B. 2.5 → 3)
    urlaubstage += Math.ceil(wochen * VACATION_DAYS_PER_WEEK);
  }
  // For single-person: show their individual value
  // For multi-person: sum all person values
  const personCount = Object.keys(contractDaysByPerson).length;
  if (personCount === 1) {
    anstellungstage = Object.values(personAnstellungstage)[0] || 0;
    totalWochen = Math.floor(anstellungstage / 7);
  } else if (personCount > 1) {
    // Sum all person anstellungstage (e.g. same person with different name variants)
    anstellungstage = Object.values(personAnstellungstage).reduce((s, v) => s + v, 0);
  }

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
  const zuschlag25 = totalUeberstunden25 * stundensatz * NIGHT_SURCHARGE;
  const zuschlag50 = totalUeberstunden50 * stundensatz * 0.50;
  const zuschlag100 = totalUeberstunden100 * stundensatz * HOLIDAY_SURCHARGE;
  const totalUeberstundenZuschlag = zuschlag25 + zuschlag50 + zuschlag100;
  const ueberstundenGrundverguetung = totalUeberstunden * stundensatz;

  const nachtZuschlag = totalNacht * stundensatz * NIGHT_SURCHARGE;
  const samstagZuschlag = totalSamstagsstunden * stundensatz * SATURDAY_SURCHARGE;
  const sonntagZuschlag = totalSonntagsstunden * stundensatz * SUNDAY_SURCHARGE;

  // Feiertagszuschlag 100% (TZ 5.6.3) - only for holidays that aren't already Sunday
  const feiertagZuschlag = totalFeiertagsstunden * stundensatz * HOLIDAY_SURCHARGE;

  // Weekly OT zuschläge (TZ 5.4.3.3 — additional to daily OT)
  const weeklyOTZuschlag25 = weeklyOT25 * stundensatz * NIGHT_SURCHARGE;
  const weeklyOTZuschlag50 = weeklyOT50 * stundensatz * 0.50;
  const weeklyOTGrundverguetung = (weeklyOT25 + weeklyOT50) * stundensatz;

  // Zeitkonto
  const zeitkontoStunden = zeitkonto ? round2(totalUeberstunden) : 0;
  const zeitkontoWert = zeitkonto ? round2(zeitkontoStunden * stundensatz) : 0;
  const zeitkontoTage = zeitkonto ? round2(zeitkontoStunden / HOURS_PER_DAY) : 0;
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

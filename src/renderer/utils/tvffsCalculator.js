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
 * - 6./7. Wochentag = wöchentliche Mehrarbeit (TZ 5.4.3.4), tägliche ÜS zählen nicht doppelt (TZ 5.4.3.2)
 * - Nachtzuschlag 25% auf Stundensatz (TZ 5.5.2, 22:00–06:00)
 * - Samstag: 25% Zuschlag (TZ 5.6.4)
 * - Sonntag: 75% Zuschlag + Ruhetag (TZ 5.6.3)
 * - Feiertag: 100% Zuschlag (TZ 5.6.3), inkl. Ostersonntag + Pfingstsonntag (TZ 5.6.1)
 * - Heiligabend/Silvester ab 12:00 Uhr = Feiertag (TZ 5.6.1)
 * - Urlaub (TZ 14.1): 0,5 Tage pro angefangene 7-Tage-Vertragszeit
 * - Krankheit (TZ 13.3): bezahlter Tag, bis 6 Wochen
 * - Zeitkonto (Anlage A.1.1): Ü-Grundvergütung → Zeitkonto; Auflösung: 8h = 1 Tag (A.1.3)
 * - AZV (TZ 6.1-6.4): 2,5h nach 5 Drehtagen, +30min/weiterer Tag; 1 freier Tag alle 20 DT
 * - Ruhezeit: mind. 11h zwischen Schichten (ArbZG §5)
 */

import { isHoliday, isTVFFSHalfDayHoliday, parseTime } from './holidays';
import { resolveArbzgConfig, checkPausen, checkRuhezeit, checkWochenruhetag } from './arbzgCheck';
import { getTariffParams } from './tariff';


// ── Hilfsfunktionen ──

/**
 * TZ 5.6.1: Heiligabend/Silvester zählen ab 12:00 Uhr als Feiertag.
 * Gibt die Anzahl Stunden zurück, die nach 12:00 Uhr gearbeitet wurden.
 */
function hoursWorkedAfterNoon(day) {
  const total = day.stundenTotal || 0;
  if (!total) return 0;
  const start = parseTime(day.start);
  if (start === null) return total; // Keine Zeitangabe → konservativ: alle Stunden zählen
  if (start >= 12) return total;    // Arbeit beginnt nach 12:00 → alles zählt
  const end = parseTime(day.ende);
  if (end !== null && end <= 12) return 0; // Alles vor 12:00
  // Arbeit erstreckt sich über 12:00 → nur die Zeit danach zählt
  return Math.max(0, total - (12 - start));
}

/**
 * TZ 6.1-6.4: AZV-Anspruch aus zusammenhängenden Drehtagen berechnen.
 * Gilt für Produktionen ab 01.05.2025 (TZ 6.7).
 *
 * Logik:
 * - Nach 5 zusammenhängenden Drehtagen: 2,5h Gutschrift
 * - Pro weiteren zusammenhängenden Drehtag: +30 min
 * - Alle 20 Drehtage: 1 bezahlter freier AZV-Tag (TZ 6.3/6.4)
 * - Zeitkonto: 10h = 1 Drehtag (TZ 6.2)
 */
function calculateAZVEntitlement(timesheets, T) {
  // Alle einzigartigen Arbeitstage sammeln (dd.mm.yyyy-Strings)
  const workDateStrings = new Set();
  for (const sheet of timesheets) {
    for (const day of sheet.days) {
      const anm = (day.anmerkungen || '').toLowerCase().trim();
      const isSpecial = anm.includes('krank') || anm.includes('urlaub') || anm.includes('azv')
        || anm === 'frei' || anm === 'f' || anm.includes('ruhetag') || anm === 'u';
      if (isSpecial || !day.datum) continue;
      const hasWork = Number(day.stundenTotal) > 0 || (day.start && String(day.start).trim().includes(':'));
      if (hasWork) workDateStrings.add(day.datum);
    }
  }

  if (workDateStrings.size === 0) {
    return { azvAnspruchStunden: 0, azvAnspruchTage: 0, azvFreieTageNach20DT: 0, azvDrehtage: 0 };
  }

  // Parsen und sortieren
  const sortedDates = [...workDateStrings].map(d => {
    const [dd, mm, yy] = d.split('.').map(Number);
    return new Date(yy < 100 ? 2000 + yy : yy, mm - 1, dd);
  }).sort((a, b) => a - b);

  // Zusammenhängende Sequenzen finden (Lücke ≤ 4 Tage = z.B. verlängertes Wochenende)
  const sequences = [];
  let seq = [sortedDates[0]];
  for (let i = 1; i < sortedDates.length; i++) {
    const gapDays = Math.round((sortedDates[i] - sortedDates[i - 1]) / 86400000);
    if (gapDays <= 4) {
      seq.push(sortedDates[i]);
    } else {
      sequences.push(seq);
      seq = [sortedDates[i]];
    }
  }
  sequences.push(seq);

  // AZV-Gutschrift: 2,5h ab 5 Tagen, +0,5h pro weiterem Tag (TZ 6.1)
  let totalAZVHours = 0;
  for (const s of sequences) {
    if (s.length >= T.AZV_MIN_SEQUENCE_DAYS) {
      totalAZVHours += T.AZV_BASE_HOURS + (s.length - T.AZV_MIN_SEQUENCE_DAYS) * T.AZV_EXTRA_HOURS_PER_DAY;
    }
  }

  // Freie AZV-Tage: 1 pro 20 Drehtage (TZ 6.3/6.4)
  const totalDrehtage = sortedDates.length;
  const azvFreieTageNach20DT = Math.floor(totalDrehtage / T.AZV_FREE_DAY_INTERVAL);

  return {
    azvAnspruchStunden: round2(totalAZVHours),
    azvAnspruchTage: round2(totalAZVHours / T.HOURS_PER_DAY),
    azvFreieTageNach20DT,
    azvDrehtage: totalDrehtage,
  };
}

export function calculateTVFFS(timesheets, settings) {
  if (!timesheets || timesheets.length === 0) {
    return getEmptyCalculations();
  }

  // Tarifperiode anhand des frühesten Datums in den Timesheets auflösen
  const T = getTariffParams(timesheets);
  const WEEKLY_OT_TIER_SIZE = T.WEEKLY_OT_THRESHOLD_50 - T.WEEKLY_OT_THRESHOLD_25;
  const arbzgCfg = resolveArbzgConfig(settings, T);

  const gageType  = settings.gageType  || 'tag';
  const zeitkonto = settings.zeitkonto || false;
  const hasGage   = settings.tagesgage > 0;

  const tagesgage   = hasGage
    ? (gageType === 'woche' ? settings.tagesgage / 5 : settings.tagesgage)
    : 0;
  const stundensatz = tagesgage / T.HOURS_PER_DAY;

  let totalArbeitstage      = 0;
  let totalKranktage        = 0;
  let totalAZVTage          = 0;
  let urlaubstageGenommen   = 0;
  let totalStunden          = 0;
  let totalUeberstunden25   = 0;
  let totalUeberstunden50   = 0;
  let totalUeberstunden100  = 0;
  let totalNacht            = 0;
  let totalFahrzeit         = 0;
  let totalSonntagstage     = 0;
  let totalSamstagstage     = 0;
  let totalSonntagsstunden  = 0;
  let totalSamstagsstunden  = 0;
  let totalFeiertagstage    = 0;
  let totalFeiertagsstunden = 0;
  let totalKranktageUnbezahlt = 0;
  const feiertageList         = [];
  const heiligabendSilvester  = [];
  const ruhezeitVerletzungen  = [];
  const arbzgLangeTage        = []; // Tage mit > 13h Arbeitszeit (ArbZG)
  const arbzgHinweisTage      = []; // Tage über 10h, aber ≤ 13h (weicher §3-Hinweis)
  const arbzgOhneRuhetag      = []; // 7+ Arbeitstage am Stück ohne Ruhetag (ArbZG §9/§11)
  const pausenVerstoesse      = []; // Tage mit zu kurzer Ruhepause (ArbZG §4)
  let weeklyOT25 = 0;
  let weeklyOT50 = 0;
  // Nur Werktagsstunden >50h brauchen Grundvergütung (Sa/So-Basisstunden stecken schon in Grundgage)
  let weeklyOTWeekdayHours = 0;

  // Per-day gage accumulators
  let grundgage                = 0;
  let zuschlag25               = 0;
  let zuschlag50               = 0;
  let zuschlag100              = 0;
  let ueberstundenGrundverguetung = 0;
  let nachtZuschlag            = 0;
  let fahrzeitVerguetung       = 0;

  // Für Ruhezeit-Prüfung
  const allDays = [];
  // Für Ruhetag-Prüfung: Arbeitstage (Datum) pro Person
  const workDatesByPerson = new Map();

  for (const sheet of timesheets) {
    // Bug 2 + Bug 4: Wochenstunden getrennt nach Werktag / Wochenende tracken.
    // Tägliche OT-Stunden werden von Werktagsstunden abgezogen (TZ 5.4.3.2: dürfen bei
    // wöchentlicher Mehrarbeit nicht nochmals berücksichtigt werden).
    let sheetWeekdayStunden  = 0; // Mo–Fr, netto ohne tägliche OT
    let sheetWeekendStunden  = 0; // Sa + So (immer wöchentliche Mehrarbeit, TZ 5.4.3.4)

    for (const day of sheet.days) {
      const anm     = (day.anmerkungen || '').toLowerCase().trim();
      const isKrank = anm.includes('krank');
      const isUrlaub = anm.includes('urlaub') || anm === 'u';
      const isAZV   = anm.includes('azv') || anm.includes('arbeitszeitverkürzung') || anm.includes('zeitausgleich') || anm === 'za';
      const isFrei  = anm === 'frei' || anm === 'f' || anm.includes('ruhetag');

      if (isUrlaub) { urlaubstageGenommen++; continue; }
      if (isKrank)  { totalKranktage++; if (totalKranktage > T.MAX_PAID_SICK_DAYS) totalKranktageUnbezahlt++; continue; }
      if (isAZV)    { totalAZVTage++; continue; }
      if (isFrei)   { continue; }

      // Fahrzeit auch auf reinen Fahrtagen vergüten
      const dayFahrzeit = day.fahrzeit || 0;
      totalFahrzeit += dayFahrzeit;
      if (hasGage && dayFahrzeit > 0) {
        const fzRate = (day.tagesgage > 0) ? day.tagesgage : tagesgage;
        fahrzeitVerguetung += dayFahrzeit * (fzRate / T.HOURS_PER_DAY);
      }

      const hasWork = Number(day.stundenTotal) > 0 || (day.start && String(day.start).trim().includes(':'));
      if (!hasWork) continue;

      totalArbeitstage++;
      const hours = day.stundenTotal || 0;
      totalStunden          += hours;

      // ArbZG: mehr als 13h = Verstoß, 10–13h = weicher §3-Hinweis
      if (arbzgCfg.enabled) {
        const personLabel = sheet.name || sheet.id;
        if (hours > arbzgCfg.maxDailyHours) {
          arbzgLangeTage.push({ datum: day.datum, stunden: round2(hours), sheetId: sheet.id, person: personLabel });
        } else if (hours > arbzgCfg.dailyHintHours) {
          arbzgHinweisTage.push({ datum: day.datum, stunden: round2(hours), sheetId: sheet.id, person: personLabel });
        }
      }

      // Arbeitstage pro Person sammeln (für Ruhetag-Prüfung)
      if (day.datum) {
        const personKey = sheet.name || sheet.id;
        if (!workDatesByPerson.has(personKey)) workDatesByPerson.set(personKey, new Set());
        workDatesByPerson.get(personKey).add(day.datum);
      }

      totalUeberstunden25   += day.ueberstunden25  || 0;
      totalUeberstunden50   += day.ueberstunden50  || 0;
      totalUeberstunden100  += day.ueberstunden100 || 0;
      totalNacht            += day.nacht25         || 0;

      // Tägliche OT-Stunden (aus den ÜS-Spalten des PDF)
      const dailyOTHours = (day.ueberstunden25 || 0) + (day.ueberstunden50 || 0) + (day.ueberstunden100 || 0);

      // Wochenstunden: Sa/So immer als Wochenendstunden, Werktage netto ohne tägliche OT
      const isSa = day.tag === 'Samstag' || day.tag === 'Sa';
      const isSo = day.tag === 'Sonntag' || day.tag === 'So';
      if (isSa || isSo) {
        sheetWeekendStunden += hours;
      } else {
        sheetWeekdayStunden += Math.max(0, hours - dailyOTHours);
      }

      // Per-day Gage berechnen
      if (hasGage) {
        const dayRate       = (day.tagesgage > 0) ? day.tagesgage : tagesgage;
        const dayStundensatz = dayRate / T.HOURS_PER_DAY;
        grundgage                   += dayRate;
        ueberstundenGrundverguetung += dailyOTHours * dayStundensatz;
        zuschlag25  += (day.ueberstunden25  || 0) * dayStundensatz * 0.25;
        zuschlag50  += (day.ueberstunden50  || 0) * dayStundensatz * 0.50;
        zuschlag100 += (day.ueberstunden100 || 0) * dayStundensatz * 1.00;
        nachtZuschlag += (day.nacht25 || 0) * dayStundensatz * T.NIGHT_SURCHARGE;
      }

      // Feiertage (inkl. Ostersonntag + Pfingstsonntag)
      const holiday = isHoliday(day.datum);
      if (holiday) {
        totalFeiertagstage++;
        totalFeiertagsstunden += hours;
        feiertageList.push({ datum: day.datum, name: holiday, stunden: hours, sheetId: sheet.id });
      }

      // Bug 6: Heiligabend/Silvester ab 12:00 Uhr als Feiertag (TZ 5.6.1)
      const halfDayHoliday = !holiday ? isTVFFSHalfDayHoliday(day.datum) : null;
      if (halfDayHoliday) {
        const hAfterNoon = hoursWorkedAfterNoon(day);
        if (hAfterNoon > 0) {
          totalFeiertagstage++;
          totalFeiertagsstunden += hAfterNoon;
          feiertageList.push({ datum: day.datum, name: `${halfDayHoliday} (ab 12:00)`, stunden: hAfterNoon, sheetId: sheet.id });
        }
        // Informationsliste (gesamt, auch Stunden vor 12:00)
        heiligabendSilvester.push({ datum: day.datum, name: halfDayHoliday, stunden: hours });
      }

      // Günstigkeitsprinzip: Feiertag (100%) hat Vorrang vor Sonntag (75%)
      if ((isSo) && !holiday && !halfDayHoliday) {
        totalSonntagstage++;
        totalSonntagsstunden += hours;
      }
      if (isSa) {
        totalSamstagstage++;
        // Prüfen ob Schicht über Mitternacht in den Sonntag reicht
        let sonntagCrossMidnight = 0;
        if (day.start && day.ende) {
          const startH = parseTime(day.start);
          const endH   = parseTime(day.ende);
          if (startH !== null && endH !== null && endH < startH) sonntagCrossMidnight = endH;
        }
        totalSamstagsstunden  += hours - sonntagCrossMidnight;
        if (sonntagCrossMidnight > 0) {
          totalSonntagsstunden += sonntagCrossMidnight;
          totalSonntagstage    = Math.max(totalSonntagstage, 1);
        }
      }

      // Samstags-Zuschlag für Schichten, die über Mitternacht in den Samstag reichen
      if (!isSa && !isSo) {
        let samstagCrossMidnight = 0;
        const saMatch = (day.anmerkungen || '').match(/Sa:\s*(\d{1,2}):(\d{2})/);
        if (saMatch) {
          samstagCrossMidnight = parseInt(saMatch[1]) + parseInt(saMatch[2]) / 60;
        } else if (day.start && day.ende) {
          const startH = parseTime(day.start);
          const endH   = parseTime(day.ende);
          if (startH !== null && endH !== null && endH < startH) {
            let isFriday = day.tag === 'Freitag' || day.tag === 'Fr';
            if (!isFriday && day.datum) {
              const [dd, mm, yy] = day.datum.split('.').map(Number);
              if (!isNaN(dd) && !isNaN(mm) && !isNaN(yy)) {
                const year = yy < 100 ? 2000 + yy : yy;
                isFriday = new Date(year, mm - 1, dd).getDay() === 5;
              }
            }
            if (isFriday) samstagCrossMidnight = endH;
          }
        }
        if (samstagCrossMidnight > 0) {
          totalSamstagsstunden += samstagCrossMidnight;
          totalSamstagstage     = Math.max(totalSamstagstage, 1);
        }
      }

      // Ruhezeit-/Pausen-Daten sammeln
      if (day.start && day.ende && day.datum) {
        allDays.push({ datum: day.datum, start: day.start, ende: day.ende, pause: day.pause, tag: day.tag, sheetId: sheet.id, person: sheet.name || sheet.id });
      }
    }

    // Bug 2 + Bug 4: Wöchentliche Mehrarbeit (TZ 5.4.3.3 + 5.4.3.4)
    // - Werktagsstunden über 50h → wöchentliche ÜS (tägliche OT-Stunden bereits abgezogen)
    // - Sa/So-Stunden → immer wöchentliche ÜS (TZ 5.4.3.4), unabhängig vom Wochentotal
    //
    // WICHTIG: Sa/So-Basisstunden stecken bereits in grundgage (Tagesgage pro Arbeitstag).
    // Deshalb erzeugen Sa/So-Stunden NUR Zuschläge (25%/50%), keine weitere Grundvergütung.
    // Werktagsstunden >50h hingegen benötigen ggf. Grundvergütung (falls nicht durch daily-OT gedeckt).
    const weekdayOT = Math.max(0, sheetWeekdayStunden - T.WEEKLY_OT_THRESHOLD_25);
    // TZ 5.4.3.4: Sa/So zählen als wöchentliche Mehrarbeit NUR wenn in dieser Woche
    // auch Werktage gearbeitet wurden (= Sa ist der „6. Tag" einer 5-Tage-Woche).
    // Ein alleinstehender Samstagsdreh ist kein „6. Arbeitstag", sondern ein einzelner DT.
    const weekendAsOT   = sheetWeekdayStunden > 0 ? sheetWeekendStunden : 0;
    const totalWeeklyOT = weekdayOT + weekendAsOT;
    weeklyOT25 += Math.max(0, Math.min(totalWeeklyOT, WEEKLY_OT_TIER_SIZE));
    weeklyOT50 += Math.max(0, totalWeeklyOT - WEEKLY_OT_TIER_SIZE);
    // Grundvergütung nur für Werktags-Überstunden (Sa/So-Basis schon in Grundgage)
    weeklyOTWeekdayHours += weekdayOT;
  }

  // ArbZG-Prüfungen (§4 Pausen, §5 Ruhezeit, §9/§11 Wochenruhetag) – siehe arbzgCheck.js
  if (arbzgCfg.enabled) {
    ruhezeitVerletzungen.push(...checkRuhezeit(allDays, arbzgCfg));
    arbzgOhneRuhetag.push(...checkWochenruhetag(workDatesByPerson, arbzgCfg));
    if (arbzgCfg.pausenCheck) {
      pausenVerstoesse.push(...checkPausen(allDays));
    }
  }

  // Bug 5: AZV-Anspruch aus zusammenhängenden Drehtagen (TZ 6.1-6.4, ab 01.05.2025)
  const azv = calculateAZVEntitlement(timesheets, T);

  // Bezahlte Tage
  const bezahlteKranktage   = Math.min(totalKranktage, T.MAX_PAID_SICK_DAYS);
  const totalBezahlteTage   = totalArbeitstage + bezahlteKranktage + totalAZVTage;
  const totalUeberstunden   = totalUeberstunden25 + totalUeberstunden50 + totalUeberstunden100;
  const durchschnittStundenProTag = totalArbeitstage > 0 ? totalStunden / totalArbeitstage : 0;

  // Urlaub (TZ 14.1)
  const nameAliases       = settings.nameAliases || {};
  const resolvePerson     = (n) => nameAliases[n] || n;
  const contractDaysByPerson = {};
  for (const sheet of timesheets) {
    const person = resolvePerson(sheet.name || 'Unbekannt');
    if (!contractDaysByPerson[person]) contractDaysByPerson[person] = [];
    for (const day of sheet.days) {
      if (!day.datum) continue;
      const [dd, mm, yy] = day.datum.split('.').map(Number);
      if (!dd || !mm || !yy) continue;
      const date   = new Date(yy < 100 ? 2000 + yy : yy, mm - 1, dd);
      const hrs    = Number(day.stundenTotal) || 0;
      const hasStart = day.start && String(day.start).includes(':');
      const anm    = (day.anmerkungen || '').toLowerCase().trim();
      const active = hrs > 0 || hasStart || anm.includes('krank') || anm.includes('urlaub') || anm === 'u' || anm.includes('azv');
      contractDaysByPerson[person].push({ date, active });
    }
  }
  let anstellungstage   = 0;
  let urlaubstage       = 0;
  let totalWochen       = 0;
  const personAnstellungstage = {};
  for (const [person, days] of Object.entries(contractDaysByPerson)) {
    if (!days.length) continue;
    days.sort((a, b) => a.date - b.date);
    const activeDays = days.filter(d => d.active);
    if (!activeDays.length) { personAnstellungstage[person] = 0; continue; }
    const blocks = [];
    let currentBlock = [activeDays[0]];
    for (let i = 1; i < activeDays.length; i++) {
      const gap = Math.round((activeDays[i].date - currentBlock[currentBlock.length - 1].date) / (1000 * 60 * 60 * 24));
      if (gap <= 5) { currentBlock.push(activeDays[i]); }
      else { blocks.push(currentBlock); currentBlock = [activeDays[i]]; }
    }
    blocks.push(currentBlock);
    let personTotalTage = 0;
    for (const block of blocks) {
      const spanDays = Math.round((block[block.length - 1].date - block[0].date) / (1000 * 60 * 60 * 24)) + 1;
      personTotalTage += spanDays;
      if (block.length >= 7) {
        const wochen = Math.floor(spanDays / 7);
        totalWochen  += wochen;
        urlaubstage  += Math.ceil(wochen * T.VACATION_DAYS_PER_WEEK);
      }
    }
    personAnstellungstage[person] = personTotalTage;
  }
  const personCount = Object.keys(contractDaysByPerson).length;
  if (personCount === 1) {
    anstellungstage = Object.values(personAnstellungstage)[0] || 0;
  } else if (personCount > 1) {
    anstellungstage = Object.values(personAnstellungstage).reduce((s, v) => s + v, 0);
  }

  // Ohne Gage: nur Stunden/Tage zurückgeben
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
      arbzgLangeTage, arbzgHinweisTage, arbzgOhneRuhetag, pausenVerstoesse,
      weeklyOT25: round2(weeklyOT25), weeklyOT50: round2(weeklyOT50),
      urlaubstage, urlaubstageGenommen, totalWochen, anstellungstage,
      totalKranktageUnbezahlt, bezahlteKranktage,
      ...azv,
    };
  }

  // ── Gagaberechnung ──
  // Grundgage für Krank/AZV-Tage (globaler Satz, kein Per-day-Override)
  const kranktageGage  = bezahlteKranktage * tagesgage;
  const azvGage        = totalAZVTage * tagesgage;
  const totalGrundgage = grundgage + kranktageGage + azvGage;

  // Durchschnittlicher Stundensatz (für Wochenend-/Feiertagszuschläge)
  const avgTagesgage   = totalArbeitstage > 0 ? grundgage / totalArbeitstage : tagesgage;
  const avgStundensatz = avgTagesgage / T.HOURS_PER_DAY;

  const totalUeberstundenZuschlag = zuschlag25 + zuschlag50 + zuschlag100;

  const samstagZuschlag  = totalSamstagsstunden  * avgStundensatz * T.SATURDAY_SURCHARGE;
  const sonntagZuschlag  = totalSonntagsstunden  * avgStundensatz * T.SUNDAY_SURCHARGE;
  const feiertagZuschlag = totalFeiertagsstunden * avgStundensatz * T.HOLIDAY_SURCHARGE;

  // Wöchentliche ÜS-Zuschläge (TZ 5.4.3.3 + 5.4.3.4)
  // Zuschläge gelten für alle weekly-OT-Stunden (Werktag + Sa/So)
  const weeklyOTZuschlag25 = weeklyOT25 * avgStundensatz * 0.25;
  const weeklyOTZuschlag50 = weeklyOT50 * avgStundensatz * 0.50;
  // Grundvergütung NUR für Werktags-Überstunden >50h:
  // Sa/So-Basisstunden sind bereits über grundgage (Tagesgage je Arbeitstag) bezahlt.
  const weeklyOTGrundverguetung = weeklyOTWeekdayHours * avgStundensatz;

  // Bug 3: Zeitkonto-Auflösung
  // Anlage A.1.3: 8h Zeitguthaben = 1 sozialversicherungspflichtiger Beschäftigungstag
  // Auszahlung: 1/50 der Wochengage pro Stunde = avgStundensatz
  const zeitkontoStunden         = zeitkonto ? round2(totalUeberstunden) : 0;
  const zeitkontoWert            = zeitkonto ? round2(zeitkontoStunden * avgStundensatz) : 0;
  const zeitkontoTage            = zeitkonto ? round2(zeitkontoStunden / T.ZEITKONTO_HOURS_PER_DAY) : 0;
  const zeitkontoTageAuszahlung  = zeitkonto ? round2(zeitkontoStunden * avgStundensatz) : 0;

  const urlaubstageOffen       = Math.max(0, urlaubstage - urlaubstageGenommen);
  const urlaubstageAuszahlung  = round2(urlaubstageOffen * avgTagesgage);

  const ueberstundenAuszahlung = zeitkonto ? 0 : ueberstundenGrundverguetung;
  const weeklyOTAuszahlung     = zeitkonto ? 0 : weeklyOTGrundverguetung;

  const bruttoGage = totalGrundgage
    + ueberstundenAuszahlung
    + totalUeberstundenZuschlag
    + weeklyOTAuszahlung
    + weeklyOTZuschlag25
    + weeklyOTZuschlag50
    + nachtZuschlag
    + samstagZuschlag
    + sonntagZuschlag
    + feiertagZuschlag
    + fahrzeitVerguetung;

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
    feiertageList, heiligabendSilvester, ruhezeitVerletzungen,
    arbzgLangeTage, arbzgHinweisTage, arbzgOhneRuhetag, pausenVerstoesse,
    weeklyOT25: round2(weeklyOT25),
    weeklyOT50: round2(weeklyOT50),
    weeklyOTZuschlag25: round2(weeklyOTZuschlag25),
    weeklyOTZuschlag50: round2(weeklyOTZuschlag50),
    weeklyOTGrundverguetung: round2(zeitkonto ? 0 : weeklyOTGrundverguetung),
    totalKranktageUnbezahlt, bezahlteKranktage,

    tagesgageEffective: round2(avgTagesgage),
    stundensatz: round2(avgStundensatz),
    grundgage: round2(totalGrundgage),
    ueberstundenGrundverguetung: round2(zeitkonto ? 0 : ueberstundenGrundverguetung),
    zuschlag25: round2(zuschlag25),
    zuschlag50: round2(zuschlag50),
    zuschlag100: round2(zuschlag100),
    totalUeberstundenZuschlag: round2(totalUeberstundenZuschlag),
    nachtZuschlag: round2(nachtZuschlag),
    fahrzeitVerguetung: round2(fahrzeitVerguetung),
    samstagZuschlag: round2(samstagZuschlag),
    sonntagZuschlag: round2(sonntagZuschlag),
    feiertagZuschlag: round2(feiertagZuschlag),
    bruttoGage: round2(bruttoGage),

    urlaubstage, urlaubstageGenommen, urlaubstageOffen,
    urlaubstageAuszahlung: round2(urlaubstageAuszahlung), anstellungstage,
    zeitkonto, zeitkontoStunden, zeitkontoWert, zeitkontoTage,
    zeitkontoTageAuszahlung: round2(zeitkontoTageAuszahlung),
    gesamtVerdienst: round2(gesamtVerdienst),
    totalWochen,

    // Bug 5: AZV-Anspruch (TZ 6.1-6.4)
    ...azv,
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
    arbzgLangeTage: [], arbzgHinweisTage: [], arbzgOhneRuhetag: [], pausenVerstoesse: [],
    weeklyOT25: 0, weeklyOT50: 0, weeklyOTZuschlag25: 0, weeklyOTZuschlag50: 0,
    weeklyOTGrundverguetung: 0, totalKranktageUnbezahlt: 0, bezahlteKranktage: 0,
    tagesgageEffective: 0, stundensatz: 0, grundgage: 0,
    ueberstundenGrundverguetung: 0,
    zuschlag25: 0, zuschlag50: 0, zuschlag100: 0, totalUeberstundenZuschlag: 0,
    nachtZuschlag: 0, fahrzeitVerguetung: 0, samstagZuschlag: 0, sonntagZuschlag: 0, feiertagZuschlag: 0,
    bruttoGage: 0, urlaubstage: 0, urlaubstageGenommen: 0, anstellungstage: 0,
    zeitkonto: false, zeitkontoStunden: 0, zeitkontoWert: 0, zeitkontoTage: 0, zeitkontoTageAuszahlung: 0,
    gesamtVerdienst: 0, totalWochen: 0, urlaubstageOffen: 0, urlaubstageAuszahlung: 0,
    azvAnspruchStunden: 0, azvAnspruchTage: 0, azvFreieTageNach20DT: 0, azvDrehtage: 0,
  };
}

function round2(val) {
  return Math.round(val * 100) / 100;
}

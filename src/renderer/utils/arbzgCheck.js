/**
 * ArbZG-Prüfungen (Arbeitszeitgesetz) – gebündelt und testbar.
 *
 * Konsolidiert die Compliance-Checks, die zuvor verstreut in
 * tvffsCalculator.js lagen, und ergänzt die fehlende Ruhepausen-Prüfung (§4):
 *
 *  - §4  Ruhepausen      → checkPausen        (NEU)
 *  - §5  Ruhezeit (11h)  → checkRuhezeit      (inkl. Mitternachts-Korrektur)
 *  - §9/§11 Wochenruhetag→ checkWochenruhetag
 *
 * Die >13h-Tagesprüfung (§3 i.V.m. TV-FFS) bleibt aus Performance-/Kohäsions-
 * gründen inline im Tagesloop von tvffsCalculator, nutzt aber dieselbe Config.
 *
 * Alle Funktionen sind rein (keine Seiteneffekte) und über die Config
 * parametrierbar, damit Schwellen per Settings (Tarifabweichung §7) und die
 * Aktivierung steuerbar sind.
 */

import { parseTime } from './holidays';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// §4 ArbZG: gesetzliche Mindestpausen (fix, nicht über Settings änderbar)
const BREAK_TIER_1_THRESHOLD_H = 6;   // mehr als 6h Arbeitszeit
const BREAK_TIER_1_MIN_H       = 0.5; // → 30 min
const BREAK_TIER_2_THRESHOLD_H = 9;   // mehr als 9h Arbeitszeit
const BREAK_TIER_2_MIN_H       = 0.75; // → 45 min

const EPS = 0.001; // Toleranz gegen Rundungsfehler bei Stundenvergleichen

// §3 ArbZG: werktägliche Regelarbeitszeit (10h), ab der ein weicher Hinweis greift –
// unterhalb der harten TV-FFS-Grenze (maxDailyHours).
const DEFAULT_DAILY_HINT_HOURS = 10;

function round2(val) {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

/** Parse dd.mm.yyyy / dd.mm.yy → Date (lokal, Mitternacht) oder null */
function parseGermanDate(str) {
  if (!str || typeof str !== 'string') return null;
  const parts = str.split('.');
  if (parts.length < 3) return null;
  const [dd, mm, yy] = parts.map(Number);
  if (!dd || !mm || isNaN(yy)) return null;
  return new Date(yy < 100 ? 2000 + yy : yy, mm - 1, dd);
}

/**
 * Effektive ArbZG-Config aus Settings + Tarifparametern.
 * Default: aktiv, mit den Tarif-/Gesetzes-Schwellen aus tariff.js.
 *
 * @param {Object} settings  globale App-Settings (settings.arbzg optional)
 * @param {Object} T         Tarifparameter (tariff.js)
 */
export function resolveArbzgConfig(settings, T) {
  const a = (settings && settings.arbzg) || {};
  const num = (v, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  return {
    enabled: a.enabled !== false,        // default an (erhält bestehendes Verhalten)
    pausenCheck: a.pausenCheck !== false, // default an
    minRestHours: num(a.minRestHours, T.MIN_REST_HOURS),
    maxDailyHours: num(a.maxDailyHours, T.MAX_DAILY_HOURS),
    // Weicher Hinweis ab dieser Tagesarbeitszeit (§3); ab maxDailyHours wird es ein Verstoß.
    dailyHintHours: num(a.dailyHintHours, DEFAULT_DAILY_HINT_HOURS),
    maxConsecutiveWorkdays: num(a.maxConsecutiveWorkdays, T.MAX_CONSECUTIVE_WORKDAYS),
  };
}

/**
 * Brutto-Arbeitszeit (inkl. Pause) aus Start/Ende in Stunden.
 * Endet die Schicht rechnerisch vor dem Start, wird Mitternachts-Übergang
 * angenommen (+24h). Liefert null, wenn Zeiten nicht parsebar sind.
 */
export function grossWorkHours(start, ende) {
  const s = parseTime(start);
  const e = parseTime(ende);
  if (s === null || e === null) return null;
  return e <= s ? (e + 24) - s : e - s;
}

/** §4 ArbZG: gesetzlich vorgeschriebene Mindestpause für eine Brutto-Arbeitszeit. */
export function requiredBreakHours(grossH) {
  if (grossH > BREAK_TIER_2_THRESHOLD_H) return BREAK_TIER_2_MIN_H;
  if (grossH > BREAK_TIER_1_THRESHOLD_H) return BREAK_TIER_1_MIN_H;
  return 0;
}

/**
 * §4 Ruhepausen: Tage, an denen die erfasste Pause das gesetzliche Minimum
 * unterschreitet.
 *
 * @param {Array} days  [{ datum, start, ende, pause, person, sheetId }]
 * @returns {Array<{datum, person, sheetId, brutto, pauseIst, pauseSoll, fehlend}>}
 */
export function checkPausen(days) {
  const out = [];
  for (const d of days || []) {
    const gross = grossWorkHours(d.start, d.ende);
    if (gross === null) continue;
    const soll = requiredBreakHours(gross);
    if (soll <= 0) continue;
    const ist = Number(d.pause) || 0;
    if (ist < soll - EPS) {
      out.push({
        datum: d.datum,
        person: d.person,
        sheetId: d.sheetId,
        brutto: round2(gross),
        pauseIst: round2(ist),
        pauseSoll: round2(soll),
        fehlend: round2(soll - ist),
      });
    }
  }
  return out;
}

/**
 * §5 Ruhezeit: weniger als minRestHours zwischen Schichtende und nächstem
 * Schichtbeginn an direkt aufeinanderfolgenden Kalendertagen.
 *
 * Mitternachts-Korrektur: endet die Vorschicht nach Mitternacht (ende ≤ start),
 * liegt das Schichtende am Folgetag — sonst würde die Ruhezeit zu groß gerechnet.
 *
 * @param {Array} days  [{ datum, start, ende, person, sheetId }]
 * @param {Object} cfg  { minRestHours }
 */
export function checkRuhezeit(days, cfg) {
  const out = [];
  const byPerson = new Map();
  for (const d of days || []) {
    if (!byPerson.has(d.person)) byPerson.set(d.person, []);
    byPerson.get(d.person).push(d);
  }
  for (const personDays of byPerson.values()) {
    personDays.sort((a, b) => parseGermanDate(a.datum) - parseGermanDate(b.datum));
    for (let i = 1; i < personDays.length; i++) {
      const prev = personDays[i - 1];
      const curr = personDays[i];
      const prevStart = parseTime(prev.start);
      const prevEnd = parseTime(prev.ende);
      const currStart = parseTime(curr.start);
      if (prevEnd === null || currStart === null) continue;
      const prevDate = parseGermanDate(prev.datum);
      const currDate = parseGermanDate(curr.datum);
      if (!prevDate || !currDate) continue;
      const dayDiff = Math.round((currDate - prevDate) / MS_PER_DAY);
      if (dayDiff !== 1) continue;
      // Endet die Vorschicht nach Mitternacht, liegt das Ende am Folgetag (+24h).
      const prevEndAbs = prevEnd + (prevStart !== null && prevEnd <= prevStart ? 24 : 0);
      const currStartAbs = 24 + currStart;
      const restHours = currStartAbs - prevEndAbs;
      if (restHours < cfg.minRestHours) {
        out.push({
          datum1: prev.datum, ende1: prev.ende,
          datum2: curr.datum, start2: curr.start,
          ruhezeit: round2(restHours),
          fehlend: round2(cfg.minRestHours - restHours),
        });
      }
    }
  }
  return out;
}

/**
 * §9/§11 Wochenruhetag: mehr als maxConsecutiveWorkdays Arbeitstage am Stück
 * ohne dazwischenliegenden freien Tag.
 *
 * @param {Map<string, Set<string>>} workDatesByPerson  person → Set von dd.mm.yyyy
 * @param {Object} cfg  { maxConsecutiveWorkdays }
 * @returns {Array<{person, von, bis, tage}>}
 */
export function checkWochenruhetag(workDatesByPerson, cfg) {
  const out = [];
  for (const [person, dateSet] of workDatesByPerson) {
    const dates = [...dateSet]
      .map((s) => {
        const date = parseGermanDate(s);
        return date ? { str: s, date } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.date - b.date);

    let runStart = 0;
    for (let i = 1; i <= dates.length; i++) {
      const gap = i < dates.length
        ? Math.round((dates[i].date - dates[i - 1].date) / MS_PER_DAY)
        : Infinity; // letzten Lauf abschließen
      if (gap === 1) continue;
      const runLen = i - runStart;
      if (runLen > cfg.maxConsecutiveWorkdays) {
        out.push({ person, von: dates[runStart].str, bis: dates[i - 1].str, tage: runLen });
      }
      runStart = i;
    }
  }
  return out;
}

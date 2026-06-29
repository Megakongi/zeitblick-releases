/**
 * TV-FFS Tarifparameter mit Gültigkeitszeiträumen.
 *
 * Der Gagentarifvertrag 2024–2026 läuft aus — neue Tarifabschlüsse werden
 * hier als weitere Periode ergänzt, ohne die Berechnungslogik anzufassen.
 * Die Tests in __tests__/tvffsCalculator.test.js sichern das Verhalten ab.
 */

export const TARIFF_PERIODS = [
  {
    id: 'tvffs-2025',
    label: 'TV-FFS 2025 (Tarifvertrag vom 12.10.2024, Gagentarif 2024–2026)',
    validFrom: '2025-01-01', // frühere Daten fallen ebenfalls auf diese Periode zurück
    params: {
      HOURS_PER_DAY: 10,                // TZ 5.3.1: 10h = 1 Tagesgage
      HOURS_PER_WEEK: 50,               // TZ 5.3.1: Wochengage = 50h
      DAILY_OT_THRESHOLD_25: 11,        // TZ 5.4.3.2: 11. Stunde = 25%
      WEEKLY_OT_THRESHOLD_25: 50,       // TZ 5.4.3.3: ab 51. Stunde = 25%
      WEEKLY_OT_THRESHOLD_50: 55,       // TZ 5.4.3.3: ab 56. Stunde = 50%
      ZEITKONTO_HOURS_PER_DAY: 8,       // Anlage A.1.3: 8h Zeitguthaben = 1 Beschäftigungstag
      MAX_PAID_SICK_DAYS: 42,           // TZ 13.3: max 6 Wochen bezahlte Krankheit
      VACATION_DAYS_PER_WEEK: 0.5,      // TZ 14.1: 0,5 Urlaubstag pro 7-Tage-Vertragszeit
      MIN_REST_HOURS: 11,               // TV-FFS TZ 5.9.1: mind. 11h tägliche Ruhezeit
      EXTENDED_REST_HOURS: 11.5,        // TZ 5.9.1: 11,5h Ruhe nach begonnener 12. Std (reine Arbeitszeit)
      EXTENDED_REST_WORK_THRESHOLD: 11, // TZ 5.9.1: >11h Netto-Arbeit am Vortag → 11,5h Ruhe
      WEEKEND_REST_HOURS: 59,           // TZ 5.9.4: 48+11h zusammenhängende Wochenend-Ruhezeit
      WEEKEND_REST_MIN_COUNT: 2,        // TZ 5.9.4: an mind. 2 Wochenenden je Beschäftigungsmonat
      FREE_DAY_REST_HOURS: 35,          // 24+11h: Mindest-Ruhe rund um einen einzelnen freien Tag (Info-Marker)
      MAX_DAILY_HOURS: 12,              // TV-FFS TZ 5.2.5 (Fassung 12.10.2024): max. 12h/Tag, keine 13. Std
      MAX_CONSECUTIVE_WORKDAYS: 6,      // ArbZG §9/§11: 1 Ruhetag pro Woche
      NIGHT_SURCHARGE: 0.25,            // TZ 5.5.2: 25% Nachtzuschlag
      SATURDAY_SURCHARGE: 0.25,         // TZ 5.6.4: 25% Sa-Zuschlag
      SUNDAY_SURCHARGE: 0.75,           // TZ 5.6.3: 75% So-Zuschlag
      HOLIDAY_SURCHARGE: 1.0,           // TZ 5.6.3: 100% Feiertags-Zuschlag
      AZV_BASE_HOURS: 2.5,              // TZ 6.1: 2,5h nach 5 zusammenhängenden Drehtagen
      AZV_EXTRA_HOURS_PER_DAY: 0.5,     // TZ 6.1: +30min pro weiterem Drehtag
      AZV_MIN_SEQUENCE_DAYS: 5,         // TZ 6.1: ab 5 Drehtagen
      AZV_FREE_DAY_INTERVAL: 20,        // TZ 6.3/6.4: 1 freier Tag pro 20 Drehtage
    },
  },
  // Nächster Tarifabschluss: hier ergänzen, z.B.
  // { id: 'tvffs-2027', label: 'TV-FFS 2027', validFrom: '2027-01-01', params: { ...wie oben, geänderte Werte } },
];

/**
 * Resolve the tariff period for a given date (testbar mit eigenen Perioden).
 * Nimmt die letzte Periode, deren validFrom <= date liegt; Daten vor der
 * ersten Periode fallen auf die erste zurück.
 *
 * @param {Array} periods  sortiert nach validFrom aufsteigend
 * @param {Date|null} date
 */
export function resolveTariff(periods, date) {
  if (!periods || periods.length === 0) return null;
  if (!date || isNaN(date.getTime())) return periods[periods.length - 1];
  let result = periods[0];
  for (const p of periods) {
    if (new Date(p.validFrom + 'T00:00:00') <= date) result = p;
  }
  return result;
}

/** Parse dd.mm.yyyy / dd.mm.yy → Date oder null */
function parseGermanDate(str) {
  if (!str || typeof str !== 'string') return null;
  const parts = str.split('.');
  if (parts.length < 3) return null;
  const [dd, mm, yy] = parts.map(Number);
  if (!dd || !mm || isNaN(yy)) return null;
  return new Date(yy < 100 ? 2000 + yy : yy, mm - 1, dd);
}

/**
 * Tarifparameter für einen Satz Timesheets (anhand des ersten Datums).
 * Liefert immer ein vollständiges Parameter-Objekt.
 */
export function getTariffParams(timesheets) {
  let firstDate = null;
  for (const ts of timesheets || []) {
    for (const day of ts.days || []) {
      const d = parseGermanDate(day.datum);
      if (d && (!firstDate || d < firstDate)) firstDate = d;
    }
  }
  const period = resolveTariff(TARIFF_PERIODS, firstDate);
  return period.params;
}

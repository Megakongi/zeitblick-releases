import { describe, test, expect } from 'vitest';
import { TARIFF_PERIODS, resolveTariff, getTariffParams } from '../tariff';

const FAKE_PERIODS = [
  { id: 'alt', validFrom: '2025-01-01', params: { HOURS_PER_DAY: 10 } },
  { id: 'neu', validFrom: '2027-01-01', params: { HOURS_PER_DAY: 9 } },
];

describe('resolveTariff', () => {
  test('wählt die Periode, deren validFrom vor dem Datum liegt', () => {
    expect(resolveTariff(FAKE_PERIODS, new Date(2026, 5, 15)).id).toBe('alt');
    expect(resolveTariff(FAKE_PERIODS, new Date(2027, 0, 1)).id).toBe('neu');
    expect(resolveTariff(FAKE_PERIODS, new Date(2028, 3, 1)).id).toBe('neu');
  });

  test('Daten vor der ersten Periode fallen auf die erste zurück', () => {
    expect(resolveTariff(FAKE_PERIODS, new Date(2024, 0, 1)).id).toBe('alt');
  });

  test('ohne Datum: letzte (aktuellste) Periode', () => {
    expect(resolveTariff(FAKE_PERIODS, null).id).toBe('neu');
  });
});

describe('getTariffParams', () => {
  test('liefert die TV-FFS-2025-Parameter für aktuelle Timesheets', () => {
    const sheets = [{ days: [{ datum: '05.01.2026' }] }];
    const params = getTariffParams(sheets);
    expect(params.HOURS_PER_DAY).toBe(10);
    expect(params.WEEKLY_OT_THRESHOLD_25).toBe(50);
    expect(params.SUNDAY_SURCHARGE).toBe(0.75);
    expect(params.AZV_BASE_HOURS).toBe(2.5);
  });

  test('leere Timesheets: vollständiges Parameter-Set (aktuellste Periode)', () => {
    const params = getTariffParams([]);
    expect(params.HOURS_PER_DAY).toBe(10);
    expect(params.MAX_PAID_SICK_DAYS).toBe(42);
  });

  test('TARIFF_PERIODS sind nach validFrom aufsteigend sortiert', () => {
    const froms = TARIFF_PERIODS.map(p => p.validFrom);
    expect([...froms].sort()).toEqual(froms);
  });
});

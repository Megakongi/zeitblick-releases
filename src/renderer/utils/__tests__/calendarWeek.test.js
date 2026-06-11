import { describe, test, expect } from 'vitest';
import { getKW, getTimesheetKW, getTimesheetYear, formatKW } from '../calendarWeek';

describe('getKW (ISO 8601)', () => {
  test('01.01.2026 (Donnerstag) liegt in KW 1', () => {
    expect(getKW('01.01.2026')).toBe(1);
  });

  test('29.12.2025 (Montag) gehört bereits zu KW 1 von 2026', () => {
    expect(getKW('29.12.2025')).toBe(1);
  });

  test('15.06.2026 (Montag) liegt in KW 25', () => {
    expect(getKW('15.06.2026')).toBe(25);
  });

  test('Jahr mit 53 Wochen: 31.12.2020 liegt in KW 53', () => {
    expect(getKW('31.12.2020')).toBe(53);
  });

  test('ungültige Eingaben liefern null', () => {
    expect(getKW('')).toBeNull();
    expect(getKW(null)).toBeNull();
    expect(getKW('kein datum')).toBeNull();
  });
});

describe('getTimesheetKW / getTimesheetYear / formatKW', () => {
  const sheet = { days: [{ datum: '' }, { datum: '15.06.2026' }] };

  test('nutzt das erste vorhandene Datum im Sheet', () => {
    expect(getTimesheetKW(sheet)).toBe(25);
    expect(getTimesheetYear(sheet)).toBe(2026);
  });

  test('formatKW erzeugt "KW n/Jahr"', () => {
    expect(formatKW(sheet)).toBe('KW 25/2026');
  });

  test('Sheet ohne Datum liefert null / "—"', () => {
    const empty = { days: [{ datum: '' }] };
    expect(getTimesheetKW(empty)).toBeNull();
    expect(formatKW(empty)).toBe('—');
  });
});

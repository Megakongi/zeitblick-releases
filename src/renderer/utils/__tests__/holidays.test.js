import { describe, test, expect } from 'vitest';
import { getHolidays, isHoliday, isTVFFSHalfDayHoliday, parseDate, parseTime } from '../holidays';

describe('getHolidays', () => {
  test('enthält alle 11 TV-FFS-Feiertage (inkl. Oster-/Pfingstsonntag nach TZ 5.6.1)', () => {
    expect(getHolidays(2026).size).toBe(11);
  });

  test('berechnet Osterfeiertage 2026 korrekt (Ostersonntag = 05.04.2026)', () => {
    const h = getHolidays(2026);
    expect(h.get('03.04.2026')).toBe('Karfreitag');
    expect(h.get('05.04.2026')).toBe('Ostersonntag');
    expect(h.get('06.04.2026')).toBe('Ostermontag');
    expect(h.get('14.05.2026')).toBe('Christi Himmelfahrt');
    expect(h.get('24.05.2026')).toBe('Pfingstsonntag');
    expect(h.get('25.05.2026')).toBe('Pfingstmontag');
  });

  test('berechnet Osterfeiertage 2025 korrekt (Ostersonntag = 20.04.2025)', () => {
    const h = getHolidays(2025);
    expect(h.get('18.04.2025')).toBe('Karfreitag');
    expect(h.get('21.04.2025')).toBe('Ostermontag');
  });
});

describe('isTVFFSHalfDayHoliday (TZ 5.6.1: ab 12:00 Uhr Feiertag)', () => {
  test('erkennt Heiligabend und Silvester', () => {
    expect(isTVFFSHalfDayHoliday('24.12.2026')).toBe('Heiligabend');
    expect(isTVFFSHalfDayHoliday('31.12.2026')).toBe('Silvester');
  });

  test('normale Tage liefern null', () => {
    expect(isTVFFSHalfDayHoliday('23.12.2026')).toBeNull();
    expect(isTVFFSHalfDayHoliday('')).toBeNull();
  });
});

describe('isHoliday', () => {
  test('erkennt feste Feiertage', () => {
    expect(isHoliday('01.01.2026')).toBe('Neujahr');
    expect(isHoliday('01.05.2026')).toBe('Tag der Arbeit');
    expect(isHoliday('03.10.2026')).toBe('Tag der Deutschen Einheit');
    expect(isHoliday('25.12.2026')).toBe('1. Weihnachtstag');
  });

  test('normale Tage sind keine Feiertage', () => {
    expect(isHoliday('02.01.2026')).toBeNull();
    expect(isHoliday('24.12.2026')).toBeNull(); // Heiligabend ist kein gesetzlicher Feiertag
  });

  test('unterstützt 2-stellige Jahre', () => {
    expect(isHoliday('01.05.26')).toBe('Tag der Arbeit');
  });

  test('ungültige Eingaben liefern null', () => {
    expect(isHoliday('')).toBeNull();
    expect(isHoliday(null)).toBeNull();
    expect(isHoliday('01.05.')).toBeNull();
    expect(isHoliday('kein datum')).toBeNull();
  });
});

describe('parseDate', () => {
  test('parst dd.mm.yyyy', () => {
    const d = parseDate('15.06.2026');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(5);
    expect(d.getDate()).toBe(15);
  });

  test('parst 2-stellige Jahre als 20xx', () => {
    expect(parseDate('15.06.26').getFullYear()).toBe(2026);
  });

  test('ungültige Eingaben liefern null', () => {
    expect(parseDate('')).toBeNull();
    expect(parseDate('15.06')).toBeNull();
  });
});

describe('parseTime', () => {
  test('parst HH:MM zu Dezimalstunden', () => {
    expect(parseTime('08:00')).toBe(8);
    expect(parseTime('08:30')).toBe(8.5);
    expect(parseTime('23:45')).toBe(23.75);
  });

  test('ungültige Eingaben liefern null', () => {
    expect(parseTime('')).toBeNull();
    expect(parseTime(null)).toBeNull();
    expect(parseTime('8')).toBeNull();
  });
});

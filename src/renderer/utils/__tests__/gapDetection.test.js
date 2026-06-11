import { describe, test, expect } from 'vitest';
import { findMissingWeeks } from '../gapDetection';

// Wochen-Sheet: 5 Tage ab dem gegebenen Montag (dd.mm.yyyy)
function weekSheet(mondayStr, overrides = {}) {
  const [dd, mm, yyyy] = mondayStr.split('.').map(Number);
  const days = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(yyyy, mm - 1, dd + i);
    const ds = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
    return { datum: ds, stundenTotal: 10 };
  });
  return { id: mondayStr, name: 'Max', projekt: 'Film A', days, ...overrides };
}

describe('findMissingWeeks', () => {
  test('keine Lücke bei aufeinanderfolgenden Wochen', () => {
    // KW 2 (05.01.2026) und KW 3 (12.01.2026)
    const sheets = [weekSheet('05.01.2026'), weekSheet('12.01.2026')];
    expect(findMissingWeeks(sheets)).toEqual([]);
  });

  test('erkennt eine fehlende Woche dazwischen', () => {
    // KW 2 und KW 4 → KW 3 fehlt
    const sheets = [weekSheet('05.01.2026'), weekSheet('19.01.2026')];
    const result = findMissingWeeks(sheets);
    expect(result).toHaveLength(1);
    expect(result[0].person).toBe('Max');
    expect(result[0].projekt).toBe('Film A');
    expect(result[0].missing).toEqual([{ kw: 3, year: 2026, label: 'KW 3/2026' }]);
  });

  test('erkennt mehrere fehlende Wochen', () => {
    // KW 2 und KW 6 → KW 3, 4, 5 fehlen
    const sheets = [weekSheet('05.01.2026'), weekSheet('02.02.2026')];
    const result = findMissingWeeks(sheets);
    expect(result[0].missing.map(m => m.kw)).toEqual([3, 4, 5]);
  });

  test('Lücken über den Jahreswechsel mit korrektem ISO-Wochenjahr', () => {
    // KW 52/2025 (22.12.2025) und KW 2/2026 (05.01.2026) → KW 1/2026 fehlt
    // (29.12.2025 gehört zu KW 1/2026)
    const sheets = [weekSheet('22.12.2025'), weekSheet('05.01.2026')];
    const result = findMissingWeeks(sheets);
    expect(result[0].missing).toEqual([{ kw: 1, year: 2026, label: 'KW 1/2026' }]);
  });

  test('Personen und Projekte werden getrennt betrachtet', () => {
    const sheets = [
      weekSheet('05.01.2026'),                                  // Max, Film A, KW 2
      weekSheet('19.01.2026'),                                  // Max, Film A, KW 4 → KW 3 fehlt
      weekSheet('05.01.2026', { name: 'Anna' }),                // Anna, Film A, KW 2
      weekSheet('12.01.2026', { name: 'Anna' }),                // Anna, Film A, KW 3 → lückenlos
      weekSheet('05.01.2026', { projekt: 'Film B' }),           // Max, Film B, nur 1 Woche
    ];
    const result = findMissingWeeks(sheets);
    expect(result).toHaveLength(1);
    expect(result[0].person).toBe('Max');
  });

  test('Namens-Aliase schließen Lücken zwischen Schreibweisen', () => {
    const sheets = [
      weekSheet('05.01.2026', { name: 'M. Mustermann' }),
      weekSheet('12.01.2026', { name: 'Max Mustermann' }),
    ];
    const resolveName = (n) => (n === 'M. Mustermann' ? 'Max Mustermann' : n);
    expect(findMissingWeeks(sheets, { resolveName })).toEqual([]);
  });

  test('abgeschlossene Projekte werden übersprungen', () => {
    const sheets = [weekSheet('05.01.2026'), weekSheet('19.01.2026')];
    const result = findMissingWeeks(sheets, {
      completedProjects: { 'Film A': { completedAt: '2026-02-01' } },
    });
    expect(result).toEqual([]);
  });

  test('einzelne Woche oder leere Eingabe: keine Lücken', () => {
    expect(findMissingWeeks([weekSheet('05.01.2026')])).toEqual([]);
    expect(findMissingWeeks([])).toEqual([]);
    expect(findMissingWeeks(null)).toEqual([]);
  });

  test('Tage ohne Datum werden ignoriert', () => {
    const sheet = weekSheet('05.01.2026');
    sheet.days.push({ datum: '', stundenTotal: 0 });
    expect(findMissingWeeks([sheet, weekSheet('12.01.2026')])).toEqual([]);
  });

  test('Lücke über die Sommerzeit-Umstellung hinweg (DST-sicher)', () => {
    // Umstellung 29.03.2026: KW 12 (16.03.) und KW 14 (30.03.) → KW 13 fehlt
    const sheets = [weekSheet('16.03.2026'), weekSheet('30.03.2026')];
    const result = findMissingWeeks(sheets);
    expect(result[0].missing).toEqual([{ kw: 13, year: 2026, label: 'KW 13/2026' }]);
  });
});

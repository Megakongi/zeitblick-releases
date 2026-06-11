import { describe, test, expect } from 'vitest';
import { buildYearReport, yearsInTimesheets, generateYearReportHTML } from '../yearReport';

const SETTINGS = { tagesgage: 500, gageType: 'tag' };

function week(projekt, startDay, month = '01', year = 2026) {
  const days = Array.from({ length: 5 }, (_, i) => ({
    tag: ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'][i],
    datum: `${String(startDay + i).padStart(2, '0')}.${month}.${year}`,
    start: '08:00', ende: '18:00', stundenTotal: 10,
    ueberstunden25: 0, ueberstunden50: 0, ueberstunden100: 0, nacht25: 0, fahrzeit: 0, anmerkungen: '',
  }));
  return { id: `${projekt}-${startDay}`, name: 'Max', projekt, days };
}

describe('yearsInTimesheets', () => {
  test('liefert alle Jahre absteigend', () => {
    const sheets = [week('A', 5, '01', 2025), week('B', 5, '01', 2026)];
    expect(yearsInTimesheets(sheets)).toEqual([2026, 2025]);
  });

  test('leere Eingabe: keine Jahre', () => {
    expect(yearsInTimesheets([])).toEqual([]);
  });
});

describe('buildYearReport', () => {
  test('aggregiert nur Sheets des gewählten Jahres', () => {
    const sheets = [week('Film A', 5, '01', 2026), week('Film A', 5, '01', 2025)];
    const report = buildYearReport(sheets, SETTINGS, 2026);
    expect(report.sheets).toBe(1);
    expect(report.total.totalStunden).toBe(50);
  });

  test('gruppiert nach Projekt, sortiert nach Stunden', () => {
    const sheets = [
      week('Film A', 5, '01', 2026),
      week('Film A', 12, '01', 2026),
      week('Film B', 19, '01', 2026),
    ];
    const report = buildYearReport(sheets, SETTINGS, 2026);
    expect(report.projects).toHaveLength(2);
    expect(report.projects[0].projekt).toBe('Film A'); // 100h vor 50h
    expect(report.projects[0].stunden).toBe(100);
    expect(report.projects[1].stunden).toBe(50);
  });

  test('berechnet die Überstundenquote', () => {
    // 5 Tage à 12h mit 2h täglicher ÜS = 60h, 10h ÜS → 16,7%
    const sheet = week('Film A', 5, '01', 2026);
    sheet.days = sheet.days.map(d => ({ ...d, stundenTotal: 12, ueberstunden25: 1, ueberstunden50: 1, ende: '21:00' }));
    const report = buildYearReport([sheet], SETTINGS, 2026);
    expect(report.ueberstundenGesamt).toBe(10);
    expect(report.ueberstundenQuote).toBe(16.7);
  });

  test('Jahr ohne Daten: leerer Report', () => {
    const report = buildYearReport([week('A', 5, '01', 2026)], SETTINGS, 2024);
    expect(report.sheets).toBe(0);
    expect(report.projects).toEqual([]);
    expect(report.total.totalStunden).toBe(0);
  });
});

describe('generateYearReportHTML', () => {
  test('rendert Titel, Projekte und KPIs', () => {
    const report = buildYearReport([week('Film A', 5, '01', 2026)], SETTINGS, 2026);
    const html = generateYearReportHTML(report, { personLabel: 'Max', hasGage: true });
    expect(html).toContain('Mein Jahr 2026 — Max');
    expect(html).toContain('Film A');
    expect(html).toContain('Überstundenquote');
    expect(html).toContain('Gesamtverdienst');
  });

  test('ohne Gage: keine Verdienst-Sektion', () => {
    const report = buildYearReport([week('Film A', 5, '01', 2026)], { tagesgage: 0 }, 2026);
    const html = generateYearReportHTML(report, { hasGage: false });
    expect(html).not.toContain('Gesamtverdienst');
  });
});

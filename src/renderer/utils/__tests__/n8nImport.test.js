import { describe, it, expect } from 'vitest';
import { processN8N, applyDeviation } from '../n8nImport';

const baseCtx = {
  resolveName: (n) => n,
  projectCrews: { TestProj: ['Maria Kamera'] },
  team: [{ name: 'Maria Kamera', position: 'Kamera', isMe: false }],
  projects: { TestProj: {} },
  calendarEntries: {},
  projectStaffing: {},
};

describe('processN8N – Zusatzpersonal', () => {
  it('erkennt Zusatzpersonal und erzeugt Kalendereinträge', () => {
    const entries = [
      { file: 'TestProj_Zusatzpersonal.txt', data: {
        typ: 'zusatzpersonal', projekt: 'TestProj',
        personen: [{ name: 'Max Zusatz', position: 'Beleuchter', zeitraeume: ['02.06.2026'] }],
      }},
    ];
    const res = processN8N(entries, baseCtx);
    expect(res.calendarAdds).toHaveLength(1);
    expect(res.calendarAdds[0]).toMatchObject({
      name: 'Max Zusatz', kind: 'zusatz', projekt: 'TestProj', dateISO: '2026-06-02',
    });
  });
});

describe('applyDeviation – Initialen-Abweichung ersetzt die Zeit', () => {
  it('setzt die eigene Zeit der Person (nicht die Vereinigung mit der Teamzeit)', () => {
    const entries = [
      { file: 'zeiten.txt', data: {
        typ: 'zeiten', projekt: 'TestProj',
        tage: [{
          datum: '02.06.2026',
          team: { start: '08:00', ende: '18:00', pause: 0.75 },
          abweichungen: [{ initiale: 'MK', start: '09:00', ende: '16:00' }],
        }],
      }},
    ];
    const res = processN8N(entries, baseCtx);
    expect(res.deviations).toHaveLength(1);
    const dev = res.deviations[0];
    const chosen = dev.candidates[0]; // Maria Kamera
    applyDeviation(res.sheets, dev, chosen);
    const sheet = res.sheets.find((s) => s.name === chosen);
    const day = sheet.days.find((d) => d.datum === '02.06.2026');
    expect(day.start).toBe('09:00');
    expect(day.ende).toBe('16:00');
  });

  it('nutzt die Teamzeit nur als Fallback für eine fehlende Seite', () => {
    const entries = [
      { file: 'zeiten.txt', data: {
        typ: 'zeiten', projekt: 'TestProj',
        tage: [{
          datum: '02.06.2026',
          team: { start: '08:00', ende: '18:00', pause: 0.75 },
          // nur Ende abweichend, Start fehlt → Teamstart als Fallback
          abweichungen: [{ initiale: 'MK', start: '', ende: '20:00' }],
        }],
      }},
    ];
    const res = processN8N(entries, baseCtx);
    const dev = res.deviations[0];
    const chosen = dev.candidates[0];
    applyDeviation(res.sheets, dev, chosen);
    const sheet = res.sheets.find((s) => s.name === chosen);
    const day = sheet.days.find((d) => d.datum === '02.06.2026');
    expect(day.start).toBe('08:00');
    expect(day.ende).toBe('20:00');
  });
});

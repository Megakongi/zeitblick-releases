import { describe, it, expect } from 'vitest';
import {
  normalizeNocoDate, parseVonBis, parseAbweichungen,
  recordId, filterNewRecords, nocoRecordsToEntries,
} from '../nocoImport';
import { processN8N, mergeSheetsInto } from '../n8nImport';

describe('normalizeNocoDate', () => {
  it('wandelt ISO in DD.MM.YYYY', () => {
    expect(normalizeNocoDate('2026-06-23')).toBe('23.06.2026');
    expect(normalizeNocoDate('2026-06-23T00:00:00.000Z')).toBe('23.06.2026');
  });
  it('lässt DD.MM.YY unverändert', () => {
    expect(normalizeNocoDate('23.06.26')).toBe('23.06.26');
  });
  it('verträgt leere Werte', () => {
    expect(normalizeNocoDate(null)).toBe('');
    expect(normalizeNocoDate(undefined)).toBe('');
  });
});

describe('parseVonBis', () => {
  it('trennt Start und Ende', () => {
    expect(parseVonBis('9:00-17:30')).toEqual({ start: '9:00', ende: '17:30' });
  });
  it('verträgt Halbgeviert-/Geviertstrich', () => {
    expect(parseVonBis('7:15 – 17:45')).toEqual({ start: '7:15', ende: '17:45' });
  });
  it('verträgt leeren Wert', () => {
    expect(parseVonBis('')).toEqual({ start: '', ende: '' });
  });
});

describe('parseAbweichungen', () => {
  it('parst mehrere Initialen-Einzelzeiten', () => {
    expect(parseAbweichungen('FZ 8:30-18:00, MM 7:00-18:00')).toEqual([
      { initiale: 'FZ', start: '8:30', ende: '18:00' },
      { initiale: 'MM', start: '7:00', ende: '18:00' },
    ]);
  });
  it('gibt leeres Array bei leerem Wert', () => {
    expect(parseAbweichungen('')).toEqual([]);
    expect(parseAbweichungen(null)).toEqual([]);
  });
});

describe('recordId / filterNewRecords', () => {
  it('liest die NocoDB-Id', () => {
    expect(recordId({ Id: 5 })).toBe(5);
  });
  it('filtert bereits importierte Records heraus', () => {
    const records = [{ Id: 1 }, { Id: 2 }, { Id: 3 }];
    expect(filterNewRecords(records, ['1', '3'])).toEqual([{ Id: 2 }]);
  });
  it('ignoriert Records ohne Id', () => {
    expect(filterNewRecords([{ foo: 'bar' }], [])).toEqual([]);
  });
});

describe('nocoRecordsToEntries', () => {
  const records = [
    { Id: 1, Datum: '23.06.26', Projekt: 'PM', 'Von-Bis': '9:00-17:30', Abweichungen: 'FZ 8:30-18:00', Notizen: '' },
    { Id: 2, Datum: '2026-06-24', Projekt: 'PM', 'Von-Bis': '7:15-17:45', Abweichungen: '', Notizen: 'FZ Pause 1H' },
  ];

  it('gruppiert Zeilen mit gleichem Projekt zu einem typ:zeiten-Eintrag', () => {
    const entries = nocoRecordsToEntries(records);
    expect(entries).toHaveLength(1);
    expect(entries[0].data.typ).toBe('zeiten');
    expect(entries[0].data.projekt).toBe('PM');
    expect(entries[0].data.tage).toHaveLength(2);
  });

  it('mappt Zeiten, Abweichungen und Notizen korrekt', () => {
    const [{ data }] = nocoRecordsToEntries(records);
    expect(data.tage[0]).toMatchObject({
      datum: '23.06.26',
      team: { start: '9:00', ende: '17:30', pause: 0.75 },
      abweichungen: [{ initiale: 'FZ', start: '8:30', ende: '18:00' }],
    });
    expect(data.tage[1].datum).toBe('24.06.2026'); // ISO normalisiert
    expect(data.tage[1].notiz).toBe('FZ Pause 1H');
  });

  it('erzeugt verarbeitbare Stundenzettel via processN8N', () => {
    const entries = nocoRecordsToEntries(records);
    const res = processN8N(entries, {
      resolveName: (n) => n,
      projectCrews: { PM: ['Tom Ton'] },
      team: [{ name: 'Tom Ton', position: 'Ton', isMe: false }],
      projects: { PM: { kuerzel: 'PM', produktionsfirma: 'Brainpool' } },
      calendarEntries: {},
      projectStaffing: {},
    });
    const tom = res.sheets.find(s => s.name === 'Tom Ton');
    expect(tom).toBeTruthy();
    expect(tom.produktionsfirma).toBe('Brainpool'); // aus Projekt-Stammdaten übernommen
    const tag = tom.days.find(d => d.datum === '23.06.2026'); // normalizeDate ergänzt das Jahr
    expect(tag).toMatchObject({ start: '9:00', ende: '17:30' });
    expect(tag.stundenTotal).toBeGreaterThan(0);
  });

  it('faltet Notizen in die Tages-Bemerkung der Stundenzettel', () => {
    const entries = nocoRecordsToEntries(records);
    const res = processN8N(entries, {
      resolveName: (n) => n,
      projectCrews: { PM: ['Tom Ton'] },
      team: [{ name: 'Tom Ton', position: 'Ton', isMe: false }],
      projects: { PM: { kuerzel: 'PM', produktionsfirma: 'Brainpool' } },
      calendarEntries: {},
      projectStaffing: {},
    });
    const tom = res.sheets.find(s => s.name === 'Tom Ton');
    const tag = tom.days.find(d => d.datum === '24.06.2026');
    expect(tag.anmerkungen).toContain('FZ Pause 1H');
  });
});

describe('mergeSheetsInto', () => {
  const existingSheet = () => ({
    id: 'ex1', projekt: 'Plötzlich Mama', name: 'Fabian Zenker',
    days: [
      { datum: '23.06.2026', start: '', ende: '', pause: 0.75, stundenTotal: 0 },
      { datum: '24.06.2026', start: '08:00', ende: '17:00', pause: 0.75, stundenTotal: 8.25 },
    ],
    totals: { stundenTotal: 8.25 },
  });

  it('füllt leere Tage und überschreibt belegte Tage (Quelle gewinnt)', () => {
    const incoming = [{
      id: 'ns1', projekt: 'Plötzlich Mama', name: 'Fabian Zenker', produktionsfirma: 'Brainpool',
      days: [
        { datum: '23.06.2026', start: '09:00', ende: '17:30', pause: 0.75 },
        { datum: '24.06.2026', start: '07:00', ende: '18:00', pause: 0.75 },
      ],
    }];
    const { sheets, addedCount, mergedCount } = mergeSheetsInto([existingSheet()], incoming);
    expect(addedCount).toBe(0);
    expect(mergedCount).toBe(1);
    const ex = sheets.find(s => s.id === 'ex1');
    expect(ex.produktionsfirma).toBe('Brainpool'); // leere Firma aus Import nachgetragen
    const d23 = ex.days.find(d => d.datum === '23.06.2026');
    const d24 = ex.days.find(d => d.datum === '24.06.2026');
    expect(d23).toMatchObject({ start: '09:00', ende: '17:30' }); // leerer Tag gefüllt
    expect(d24).toMatchObject({ start: '07:00', ende: '18:00' }); // belegter Tag überschrieben
    expect(d23.stundenTotal).toBeGreaterThan(0); // Summen neu berechnet
    expect(ex.totals.stundenTotal).toBeCloseTo(d23.stundenTotal + d24.stundenTotal, 5);
  });

  it('mutiert den bestehenden Zettel nicht (Immutabilität)', () => {
    const original = existingSheet();
    const incoming = [{ projekt: 'Plötzlich Mama', name: 'Fabian Zenker',
      days: [{ datum: '23.06.2026', start: '09:00', ende: '17:30', pause: 0.75 }] }];
    mergeSheetsInto([original], incoming);
    expect(original.days.find(d => d.datum === '23.06.2026').start).toBe('');
  });

  it('legt einen neuen Zettel an, wenn kein passender existiert', () => {
    const incoming = [{ projekt: 'Anderes', name: 'Neue Person',
      days: [{ datum: '23.06.2026', start: '09:00', ende: '17:30', pause: 0.75 }] }];
    const { sheets, addedCount, mergedCount } = mergeSheetsInto([existingSheet()], incoming);
    expect(addedCount).toBe(1);
    expect(mergedCount).toBe(0);
    expect(sheets).toHaveLength(2);
  });
});

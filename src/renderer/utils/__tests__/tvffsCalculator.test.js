import { describe, test, expect } from 'vitest';
import { calculateTVFFS } from '../tvffsCalculator';

// Basis: Tagesgage 500 € → Stundensatz 50 € (1/10 Tagesgage, TZ 5.7.1)
const BASE_SETTINGS = { tagesgage: 500, gageType: 'tag', pauschale: 0.75 };

function makeDay(overrides = {}) {
  return {
    tag: 'Montag',
    datum: '05.01.2026',
    start: '08:00',
    ende: '18:00',
    pause: 1,
    stundenTotal: 10,
    ueberstunden25: 0,
    ueberstunden50: 0,
    ueberstunden100: 0,
    nacht25: 0,
    fahrzeit: 0,
    anmerkungen: '',
    ...overrides,
  };
}

function makeSheet(days, overrides = {}) {
  return { id: 's1', name: 'Max Mustermann', projekt: 'Testprojekt', days, ...overrides };
}

// Normale Arbeitswoche Mo–Fr (05.01.–09.01.2026), je 10h
function makeWeek() {
  const tage = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'];
  return tage.map((tag, i) => makeDay({ tag, datum: `0${5 + i}.01.2026` }));
}

describe('calculateTVFFS — Grundlagen', () => {
  test('liefert leere Berechnung ohne Timesheets', () => {
    const result = calculateTVFFS([], BASE_SETTINGS);
    expect(result.totalArbeitstage).toBe(0);
    expect(result.gesamtVerdienst).toBe(0);
  });

  test('normale 5-Tage-Woche à 10h: Grundgage ohne Zuschläge', () => {
    const result = calculateTVFFS([makeSheet(makeWeek())], BASE_SETTINGS);
    expect(result.totalArbeitstage).toBe(5);
    expect(result.totalStunden).toBe(50);
    expect(result.stundensatz).toBe(50);
    expect(result.grundgage).toBe(2500);
    expect(result.totalUeberstundenZuschlag).toBe(0);
    expect(result.weeklyOT25).toBe(0);
    expect(result.weeklyOT50).toBe(0);
    expect(result.bruttoGage).toBe(2500);
  });

  test('Wochengage: tagesgage/5, Stundensatz 1/50 Wochengage (TZ 5.7.1)', () => {
    const result = calculateTVFFS(
      [makeSheet(makeWeek())],
      { ...BASE_SETTINGS, tagesgage: 2500, gageType: 'woche' }
    );
    expect(result.tagesgageEffective).toBe(500);
    expect(result.stundensatz).toBe(50);
    expect(result.grundgage).toBe(2500);
  });

  test('Per-Day-Gage: day.tagesgage übersteuert die globale Gage', () => {
    const days = [makeDay({ tagesgage: 800 })];
    const result = calculateTVFFS([makeSheet(days)], BASE_SETTINGS);
    expect(result.grundgage).toBe(800);
    expect(result.tagesgageEffective).toBe(800); // Durchschnitt über Arbeitstage
  });

  test('ohne Gage: Stunden werden gezählt, aber kein Verdienst', () => {
    const result = calculateTVFFS([makeSheet(makeWeek())], { ...BASE_SETTINGS, tagesgage: 0 });
    expect(result.totalArbeitstage).toBe(5);
    expect(result.totalStunden).toBe(50);
    expect(result.bruttoGage).toBe(0);
    expect(result.gesamtVerdienst).toBe(0);
  });
});

describe('calculateTVFFS — Tägliche Mehrarbeit (TZ 5.4.3.2)', () => {
  test('11. Stunde 25%, 12. Stunde 50%: Grundvergütung + Zuschläge', () => {
    const day = makeDay({ stundenTotal: 12, ueberstunden25: 1, ueberstunden50: 1, ende: '21:00' });
    const result = calculateTVFFS([makeSheet([day])], BASE_SETTINGS);
    expect(result.ueberstundenGrundverguetung).toBe(100); // 2 Ü-Std × 50 €
    expect(result.zuschlag25).toBe(12.5);
    expect(result.zuschlag50).toBe(25);
    expect(result.totalUeberstundenZuschlag).toBe(37.5);
    expect(result.bruttoGage).toBe(500 + 100 + 37.5);
  });

  test('tägliche ÜS zählen nicht doppelt in die Wochen-Mehrarbeit (TZ 5.4.3.2)', () => {
    // 5 Tage à 12h mit je 2h täglicher ÜS: Werktagsstunden netto = 5×10 = 50 → keine Wochen-ÜS
    const days = makeWeek().map(d => ({ ...d, stundenTotal: 12, ueberstunden25: 1, ueberstunden50: 1, ende: '21:00' }));
    const result = calculateTVFFS([makeSheet(days)], BASE_SETTINGS);
    expect(result.weeklyOT25).toBe(0);
    expect(result.weeklyOT50).toBe(0);
  });
});

describe('calculateTVFFS — Wöchentliche Mehrarbeit (TZ 5.4.3.3 + 5.4.3.4)', () => {
  test('Werktagsstunden über 50h: 51.–55. Std = 25%, mit Grundvergütung', () => {
    // Mo–Fr à 11h ohne tägliche ÜS-Spalten = 55 Werktagsstunden
    const days = makeWeek().map(d => ({ ...d, stundenTotal: 11, ende: '20:00' }));
    const result = calculateTVFFS([makeSheet(days)], BASE_SETTINGS);
    expect(result.weeklyOT25).toBe(5);
    expect(result.weeklyOT50).toBe(0);
    expect(result.weeklyOTZuschlag25).toBe(5 * 50 * 0.25);
    // Werktags-ÜS > 50h bekommen Grundvergütung
    expect(result.weeklyOTGrundverguetung).toBe(5 * 50);
    expect(result.bruttoGage).toBe(2500 + 250 + 62.5);
  });

  test('Samstag als 6. Arbeitstag = wöchentliche Mehrarbeit, aber ohne doppelte Grundvergütung', () => {
    // Mo–Fr à 10h + Sa 10h: Sa-Stunden sind Wochen-ÜS (TZ 5.4.3.4),
    // die Sa-Basis steckt aber bereits in der Grundgage (6 Arbeitstage × 500)
    const days = [...makeWeek(), makeDay({ tag: 'Samstag', datum: '10.01.2026' })];
    const result = calculateTVFFS([makeSheet(days)], BASE_SETTINGS);
    expect(result.grundgage).toBe(3000);
    expect(result.weeklyOT25).toBe(5);
    expect(result.weeklyOT50).toBe(5);
    expect(result.weeklyOTGrundverguetung).toBe(0); // keine doppelte Basis
    expect(result.samstagZuschlag).toBe(10 * 50 * 0.25);
    // 3000 + weeklyOT-Zuschläge (62,5 + 125) + Sa-Zuschlag 125
    expect(result.bruttoGage).toBe(3000 + 62.5 + 125 + 125);
  });

  test('alleinstehender Samstagsdreh ist KEINE wöchentliche Mehrarbeit', () => {
    const day = makeDay({ tag: 'Samstag', datum: '10.01.2026' });
    const result = calculateTVFFS([makeSheet([day])], BASE_SETTINGS);
    expect(result.weeklyOT25).toBe(0);
    expect(result.weeklyOT50).toBe(0);
    expect(result.samstagZuschlag).toBe(10 * 50 * 0.25); // Zuschlag gibt es trotzdem
    expect(result.bruttoGage).toBe(500 + 125);
  });

  test('genau 50 Werktagsstunden: keine wöchentliche Mehrarbeit', () => {
    const result = calculateTVFFS([makeSheet(makeWeek())], BASE_SETTINGS);
    expect(result.weeklyOT25).toBe(0);
    expect(result.weeklyOT50).toBe(0);
  });
});

describe('calculateTVFFS — Wochenend- und Feiertagszuschläge', () => {
  test('Sonntag: 75% Zuschlag (TZ 5.6.3)', () => {
    const day = makeDay({ tag: 'Sonntag', datum: '11.01.2026' });
    const result = calculateTVFFS([makeSheet([day])], BASE_SETTINGS);
    expect(result.totalSonntagsstunden).toBe(10);
    expect(result.sonntagZuschlag).toBe(10 * 50 * 0.75);
  });

  test('Feiertag: 100% Zuschlag (TZ 5.6.3)', () => {
    // 01.05.2026 = Tag der Arbeit (Freitag)
    const day = makeDay({ tag: 'Freitag', datum: '01.05.2026' });
    const result = calculateTVFFS([makeSheet([day])], BASE_SETTINGS);
    expect(result.totalFeiertagstage).toBe(1);
    expect(result.feiertagZuschlag).toBe(10 * 50 * 1.0);
    expect(result.feiertageList[0].name).toBe('Tag der Arbeit');
  });

  test('Ostersonntag zählt als Feiertag (TZ 5.6.1)', () => {
    // 05.04.2026 = Ostersonntag
    const day = makeDay({ tag: 'Sonntag', datum: '05.04.2026' });
    const result = calculateTVFFS([makeSheet([day])], BASE_SETTINGS);
    expect(result.totalFeiertagstage).toBe(1);
    expect(result.totalSonntagstage).toBe(0); // Günstigkeitsprinzip: 100% statt 75%
    expect(result.feiertagZuschlag).toBe(10 * 50 * 1.0);
  });

  test('Günstigkeitsprinzip: Feiertag auf Sonntag zählt als Feiertag, nicht als Sonntag', () => {
    // 25.12.2022 = 1. Weihnachtstag, ein Sonntag
    const day = makeDay({ tag: 'Sonntag', datum: '25.12.2022' });
    const result = calculateTVFFS([makeSheet([day])], BASE_SETTINGS);
    expect(result.totalFeiertagstage).toBe(1);
    expect(result.totalSonntagstage).toBe(0);
    expect(result.sonntagZuschlag).toBe(0);
    expect(result.feiertagZuschlag).toBe(10 * 50 * 1.0);
  });

  test('Heiligabend: nur Stunden ab 12:00 Uhr zählen als Feiertag (TZ 5.6.1)', () => {
    // 24.12.2026 (Donnerstag), 08:00–18:00 = 10h, davon 6h nach 12:00
    const day = makeDay({ tag: 'Donnerstag', datum: '24.12.2026' });
    const result = calculateTVFFS([makeSheet([day])], BASE_SETTINGS);
    expect(result.totalFeiertagsstunden).toBe(6);
    expect(result.feiertagZuschlag).toBe(6 * 50 * 1.0);
    expect(result.feiertageList[0].name).toBe('Heiligabend (ab 12:00)');
    expect(result.heiligabendSilvester).toHaveLength(1);
    expect(result.heiligabendSilvester[0].stunden).toBe(10); // Info-Liste: alle Stunden
  });

  test('Heiligabend komplett vor 12:00 Uhr: kein Feiertagszuschlag', () => {
    const day = makeDay({ tag: 'Donnerstag', datum: '24.12.2026', start: '06:00', ende: '11:00', stundenTotal: 5 });
    const result = calculateTVFFS([makeSheet([day])], BASE_SETTINGS);
    expect(result.totalFeiertagsstunden).toBe(0);
    expect(result.feiertagZuschlag).toBe(0);
  });
});

describe('calculateTVFFS — Schichten über Mitternacht', () => {
  test('Samstag 20:00–04:00: 4h zählen als Sonntagsstunden', () => {
    const day = makeDay({ tag: 'Samstag', datum: '10.01.2026', start: '20:00', ende: '04:00', stundenTotal: 8 });
    const result = calculateTVFFS([makeSheet([day])], BASE_SETTINGS);
    expect(result.totalSamstagsstunden).toBe(4);
    expect(result.totalSonntagsstunden).toBe(4);
    expect(result.totalSonntagstage).toBe(1);
  });

  test('Freitag 20:00–02:00: 2h zählen als Samstagsstunden', () => {
    const day = makeDay({ tag: 'Freitag', datum: '09.01.2026', start: '20:00', ende: '02:00', stundenTotal: 6 });
    const result = calculateTVFFS([makeSheet([day])], BASE_SETTINGS);
    expect(result.totalSamstagsstunden).toBe(2);
    expect(result.totalSamstagstage).toBe(1);
  });

  test('"Sa: H:MM"-Anmerkung aus PDF-Import übersteuert die Auto-Berechnung', () => {
    const day = makeDay({ tag: 'Freitag', datum: '09.01.2026', start: '18:00', ende: '01:30', stundenTotal: 7.5, anmerkungen: 'Sa: 1:30' });
    const result = calculateTVFFS([makeSheet([day])], BASE_SETTINGS);
    expect(result.totalSamstagsstunden).toBe(1.5);
  });
});

describe('calculateTVFFS — Krankheit, Urlaub, AZV-Tage (TZ 13.3, 14.1)', () => {
  test('Kranktage sind bezahlte Tage, zählen aber nicht als Arbeitstage', () => {
    const days = [makeDay(), makeDay({ datum: '06.01.2026', tag: 'Dienstag', anmerkungen: 'krank', stundenTotal: 0, start: '', ende: '' })];
    const result = calculateTVFFS([makeSheet(days)], BASE_SETTINGS);
    expect(result.totalArbeitstage).toBe(1);
    expect(result.totalKranktage).toBe(1);
    expect(result.totalBezahlteTage).toBe(2);
    expect(result.grundgage).toBe(1000);
  });

  test('Krankheit über 42 Tage ist unbezahlt (max 6 Wochen)', () => {
    const days = Array.from({ length: 45 }, () =>
      makeDay({ anmerkungen: 'krank', stundenTotal: 0, start: '', ende: '', datum: '' })
    );
    const result = calculateTVFFS([makeSheet(days)], BASE_SETTINGS);
    expect(result.totalKranktage).toBe(45);
    expect(result.bezahlteKranktage).toBe(42);
    expect(result.totalKranktageUnbezahlt).toBe(3);
    expect(result.totalBezahlteTage).toBe(42);
  });

  test('Urlaubstage werden als genommen gezählt, nicht als Arbeitstage', () => {
    const days = [makeDay(), makeDay({ datum: '06.01.2026', tag: 'Dienstag', anmerkungen: 'Urlaub', stundenTotal: 0, start: '', ende: '' })];
    const result = calculateTVFFS([makeSheet(days)], BASE_SETTINGS);
    expect(result.totalArbeitstage).toBe(1);
    expect(result.urlaubstageGenommen).toBe(1);
  });

  test('AZV-Tage sind bezahlte freie Tage', () => {
    const days = [makeDay(), makeDay({ datum: '06.01.2026', tag: 'Dienstag', anmerkungen: 'AZV', stundenTotal: 0, start: '', ende: '' })];
    const result = calculateTVFFS([makeSheet(days)], BASE_SETTINGS);
    expect(result.totalAZVTage).toBe(1);
    expect(result.totalBezahlteTage).toBe(2);
  });

  test('Urlaubsanspruch: 0,5 Tage pro 7-Tage-Vertragswoche, aufgerundet', () => {
    // 14 zusammenhängende Arbeitstage → 2 Wochen → 1 Urlaubstag
    const days = Array.from({ length: 14 }, (_, i) =>
      makeDay({ datum: `${String(5 + i).padStart(2, '0')}.01.2026` })
    );
    const result = calculateTVFFS([makeSheet(days)], BASE_SETTINGS);
    expect(result.anstellungstage).toBe(14);
    expect(result.totalWochen).toBe(2);
    expect(result.urlaubstage).toBe(1);
    expect(result.urlaubstageOffen).toBe(1);
    expect(result.urlaubstageAuszahlung).toBe(500);
  });

  test('Blöcke unter 7 Tagen erzeugen keinen Urlaubsanspruch', () => {
    const result = calculateTVFFS([makeSheet(makeWeek())], BASE_SETTINGS);
    expect(result.urlaubstage).toBe(0);
    expect(result.totalWochen).toBe(0);
  });

  test('Beschäftigungslücke > 5 Tage trennt Vertragsblöcke', () => {
    // Block 1: 05.01.–09.01. (5 Tage), Lücke, Block 2: 26.01.–30.01. (5 Tage)
    const days = [
      ...Array.from({ length: 5 }, (_, i) => makeDay({ datum: `0${5 + i}.01.2026` })),
      ...Array.from({ length: 5 }, (_, i) => makeDay({ datum: `${26 + i}.01.2026` })),
    ];
    const result = calculateTVFFS([makeSheet(days)], BASE_SETTINGS);
    expect(result.anstellungstage).toBe(10); // 5 + 5 statt durchgehend 26
  });
});

describe('calculateTVFFS — AZV-Anspruch (TZ 6.1-6.4)', () => {
  test('5 zusammenhängende Drehtage: 2,5h Gutschrift', () => {
    const result = calculateTVFFS([makeSheet(makeWeek())], BASE_SETTINGS);
    expect(result.azvDrehtage).toBe(5);
    expect(result.azvAnspruchStunden).toBe(2.5);
  });

  test('jeder weitere zusammenhängende Drehtag: +30 min', () => {
    const days = [...makeWeek(), makeDay({ tag: 'Samstag', datum: '10.01.2026' })];
    const result = calculateTVFFS([makeSheet(days)], BASE_SETTINGS);
    expect(result.azvDrehtage).toBe(6);
    expect(result.azvAnspruchStunden).toBe(3);
  });

  test('Wochenende (Lücke ≤ 4 Tage) unterbricht die Drehtag-Sequenz nicht', () => {
    // Mo–Fr + Mo–Fr der Folgewoche = 10 zusammenhängende Drehtage
    const days = [
      ...makeWeek(),
      ...Array.from({ length: 5 }, (_, i) => makeDay({ datum: `${12 + i}.01.2026` })),
    ];
    const result = calculateTVFFS([makeSheet(days)], BASE_SETTINGS);
    expect(result.azvDrehtage).toBe(10);
    expect(result.azvAnspruchStunden).toBe(2.5 + 5 * 0.5);
  });

  test('weniger als 5 zusammenhängende Drehtage: kein Anspruch', () => {
    const days = makeWeek().slice(0, 4);
    const result = calculateTVFFS([makeSheet(days)], BASE_SETTINGS);
    expect(result.azvAnspruchStunden).toBe(0);
  });

  test('1 freier AZV-Tag pro 20 Drehtage (TZ 6.3/6.4)', () => {
    // 20 Drehtage am Stück (05.01.–24.01.2026)
    const days = Array.from({ length: 20 }, (_, i) =>
      makeDay({ datum: `${String(5 + i).padStart(2, '0')}.01.2026` })
    );
    const result = calculateTVFFS([makeSheet(days)], BASE_SETTINGS);
    expect(result.azvDrehtage).toBe(20);
    expect(result.azvFreieTageNach20DT).toBe(1);
  });
});

describe('calculateTVFFS — Nacht, Fahrzeit, Zeitkonto', () => {
  test('Nachtzuschlag: 25% auf Nachtstunden (TZ 5.5.2)', () => {
    const day = makeDay({ nacht25: 3 });
    const result = calculateTVFFS([makeSheet([day])], BASE_SETTINGS);
    expect(result.nachtZuschlag).toBe(3 * 50 * 0.25);
  });

  test('Fahrzeit wird mit dem Stundensatz vergütet', () => {
    const day = makeDay({ fahrzeit: 2 });
    const result = calculateTVFFS([makeSheet([day])], BASE_SETTINGS);
    expect(result.totalFahrzeit).toBe(2);
    expect(result.fahrzeitVerguetung).toBe(2 * 50);
    expect(result.bruttoGage).toBe(500 + 100);
  });

  test('reiner Fahrtag (keine Arbeitsstunden) wird ebenfalls vergütet', () => {
    const day = makeDay({ fahrzeit: 3, stundenTotal: 0, start: '', ende: '' });
    const result = calculateTVFFS([makeSheet([day])], BASE_SETTINGS);
    expect(result.totalArbeitstage).toBe(0);
    expect(result.totalFahrzeit).toBe(3);
    expect(result.fahrzeitVerguetung).toBe(150);
  });

  test('Zeitkonto: Ü-Grundvergütung wandert ins Zeitkonto (8h = 1 Tag, Anlage A.1.3)', () => {
    const day = makeDay({ stundenTotal: 12, ueberstunden25: 1, ueberstunden50: 1, ende: '21:00' });
    const result = calculateTVFFS([makeSheet([day])], { ...BASE_SETTINGS, zeitkonto: true });
    expect(result.ueberstundenGrundverguetung).toBe(0);
    expect(result.zeitkontoStunden).toBe(2);
    expect(result.zeitkontoWert).toBe(100);
    expect(result.zeitkontoTage).toBe(0.25); // 2h / 8h pro Tag
    expect(result.zeitkontoTageAuszahlung).toBe(100); // 2h × 50 €
    // Zuschläge werden weiterhin ausgezahlt
    expect(result.totalUeberstundenZuschlag).toBe(37.5);
    expect(result.bruttoGage).toBe(500 + 37.5);
  });
});

describe('calculateTVFFS — Ruhezeit (ArbZG §5)', () => {
  test('weniger als 11h zwischen Schichten wird als Verletzung erkannt', () => {
    const days = [
      makeDay({ datum: '05.01.2026', start: '12:00', ende: '23:00', stundenTotal: 10 }),
      makeDay({ datum: '06.01.2026', tag: 'Dienstag', start: '08:00', ende: '18:00' }),
    ];
    const result = calculateTVFFS([makeSheet(days)], BASE_SETTINGS);
    expect(result.ruhezeitVerletzungen).toHaveLength(1);
    expect(result.ruhezeitVerletzungen[0].ruhezeit).toBe(9); // 23:00 → 08:00
    expect(result.ruhezeitVerletzungen[0].fehlend).toBe(2);
  });

  test('11h oder mehr Ruhezeit: keine Verletzung', () => {
    const days = [
      makeDay({ datum: '05.01.2026', start: '08:00', ende: '20:00', stundenTotal: 11 }),
      makeDay({ datum: '06.01.2026', tag: 'Dienstag', start: '08:00', ende: '18:00' }),
    ];
    const result = calculateTVFFS([makeSheet(days)], BASE_SETTINGS);
    expect(result.ruhezeitVerletzungen).toHaveLength(0);
  });

  test('Schichten verschiedener Personen werden nicht verglichen', () => {
    const sheets = [
      makeSheet([makeDay({ datum: '05.01.2026', start: '12:00', ende: '23:00' })], { id: 'a', name: 'Person A' }),
      makeSheet([makeDay({ datum: '06.01.2026', tag: 'Dienstag', start: '08:00', ende: '18:00' })], { id: 'b', name: 'Person B' }),
    ];
    const result = calculateTVFFS(sheets, BASE_SETTINGS);
    expect(result.ruhezeitVerletzungen).toHaveLength(0);
  });
});

describe('calculateTVFFS — ArbZG-Warnungen', () => {
  test('Tag mit mehr als 13h Arbeitszeit wird erkannt', () => {
    const days = [
      makeDay({ stundenTotal: 14, ueberstunden25: 1, ueberstunden50: 3, ende: '23:00' }),
      makeDay({ datum: '06.01.2026', tag: 'Dienstag' }), // normaler 10h-Tag
    ];
    const result = calculateTVFFS([makeSheet(days)], BASE_SETTINGS);
    expect(result.arbzgLangeTage).toHaveLength(1);
    expect(result.arbzgLangeTage[0].datum).toBe('05.01.2026');
    expect(result.arbzgLangeTage[0].stunden).toBe(14);
  });

  test('genau 13h ist keine Verletzung', () => {
    const day = makeDay({ stundenTotal: 13, ende: '22:00' });
    const result = calculateTVFFS([makeSheet([day])], BASE_SETTINGS);
    expect(result.arbzgLangeTage).toHaveLength(0);
  });

  test('7+ Arbeitstage am Stück ohne Ruhetag werden erkannt', () => {
    // 05.01.–12.01.2026 = 8 Tage durchgearbeitet
    const days = Array.from({ length: 8 }, (_, i) =>
      makeDay({ datum: `${String(5 + i).padStart(2, '0')}.01.2026` })
    );
    const result = calculateTVFFS([makeSheet(days)], BASE_SETTINGS);
    expect(result.arbzgOhneRuhetag).toHaveLength(1);
    expect(result.arbzgOhneRuhetag[0].tage).toBe(8);
    expect(result.arbzgOhneRuhetag[0].von).toBe('05.01.2026');
    expect(result.arbzgOhneRuhetag[0].bis).toBe('12.01.2026');
  });

  test('6 Arbeitstage mit anschließendem Ruhetag: keine Warnung', () => {
    // Mo–Sa, dann frei
    const days = Array.from({ length: 6 }, (_, i) =>
      makeDay({ datum: `${String(5 + i).padStart(2, '0')}.01.2026` })
    );
    const result = calculateTVFFS([makeSheet(days)], BASE_SETTINGS);
    expect(result.arbzgOhneRuhetag).toHaveLength(0);
  });

  test('freier Tag unterbricht den Lauf', () => {
    // 5 Tage + Lücke + 5 Tage → beide Läufe unter 7
    const days = [
      ...Array.from({ length: 5 }, (_, i) => makeDay({ datum: `0${5 + i}.01.2026` })),
      ...Array.from({ length: 5 }, (_, i) => makeDay({ datum: `${11 + i}.01.2026` })),
    ];
    const result = calculateTVFFS([makeSheet(days)], BASE_SETTINGS);
    expect(result.arbzgOhneRuhetag).toHaveLength(0);
  });

  test('Läufe werden pro Person getrennt geprüft', () => {
    const week = (name, startDay) => makeSheet(
      Array.from({ length: 4 }, (_, i) => makeDay({ datum: `${String(startDay + i).padStart(2, '0')}.01.2026` })),
      { id: name, name }
    );
    // Person A: 05.–08., Person B: 09.–12. — zusammen 8 Tage, aber je 4
    const result = calculateTVFFS([week('A', 5), week('B', 9)], BASE_SETTINGS);
    expect(result.arbzgOhneRuhetag).toHaveLength(0);
  });
});

describe('calculateTVFFS — Namens-Aliase', () => {
  test('Aliase fassen Vertragszeiten derselben Person zusammen', () => {
    const sheets = [
      makeSheet(
        Array.from({ length: 7 }, (_, i) => makeDay({ datum: `0${5 + i}.01.2026` })),
        { id: 'a', name: 'M. Mustermann' }
      ),
      makeSheet(
        Array.from({ length: 7 }, (_, i) => makeDay({ datum: `${12 + i}.01.2026` })),
        { id: 'b', name: 'Max Mustermann' }
      ),
    ];
    const settings = { ...BASE_SETTINGS, nameAliases: { 'M. Mustermann': 'Max Mustermann' } };
    const result = calculateTVFFS(sheets, settings);
    // Eine Person, durchgehend 05.–18.01. = 14 Tage
    expect(result.anstellungstage).toBe(14);
    expect(result.urlaubstage).toBe(1);
  });
});

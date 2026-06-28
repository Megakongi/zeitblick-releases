import { describe, test, expect } from 'vitest';
import {
  resolveArbzgConfig,
  grossWorkHours,
  requiredBreakHours,
  checkPausen,
  checkRuhezeit,
  checkWochenruhetag,
} from '../arbzgCheck';

const T = { MIN_REST_HOURS: 11, MAX_DAILY_HOURS: 13, MAX_CONSECUTIVE_WORKDAYS: 6 };
const CFG = resolveArbzgConfig({}, T);

describe('resolveArbzgConfig', () => {
  test('Default: aktiv mit Tarif-Schwellen', () => {
    expect(CFG).toMatchObject({
      enabled: true, pausenCheck: true,
      minRestHours: 11, maxDailyHours: 13, dailyHintHours: 10, maxConsecutiveWorkdays: 6,
    });
  });

  test('Settings können deaktivieren und Schwellen überschreiben', () => {
    const cfg = resolveArbzgConfig(
      { arbzg: { enabled: false, pausenCheck: false, minRestHours: 9, maxConsecutiveWorkdays: 12 } },
      T
    );
    expect(cfg.enabled).toBe(false);
    expect(cfg.pausenCheck).toBe(false);
    expect(cfg.minRestHours).toBe(9);
    expect(cfg.maxConsecutiveWorkdays).toBe(12);
    expect(cfg.maxDailyHours).toBe(13); // nicht gesetzt → Default
  });

  test('ungültige Schwellen fallen auf Default zurück', () => {
    const cfg = resolveArbzgConfig({ arbzg: { minRestHours: 0, maxDailyHours: 'abc' } }, T);
    expect(cfg.minRestHours).toBe(11);
    expect(cfg.maxDailyHours).toBe(13);
  });
});

describe('grossWorkHours', () => {
  test('normale Schicht', () => {
    expect(grossWorkHours('08:00', '18:00')).toBe(10);
  });
  test('Schicht über Mitternacht', () => {
    expect(grossWorkHours('20:00', '02:00')).toBe(6);
  });
  test('unparsebare Zeit → null', () => {
    expect(grossWorkHours('', '18:00')).toBeNull();
    expect(grossWorkHours('08:00', null)).toBeNull();
  });
});

describe('requiredBreakHours (§4)', () => {
  test('bis 6h keine Pause', () => {
    expect(requiredBreakHours(6)).toBe(0);
    expect(requiredBreakHours(5)).toBe(0);
  });
  test('mehr als 6h bis 9h → 30 min', () => {
    expect(requiredBreakHours(6.5)).toBe(0.5);
    expect(requiredBreakHours(9)).toBe(0.5);
  });
  test('mehr als 9h → 45 min', () => {
    expect(requiredBreakHours(9.5)).toBe(0.75);
    expect(requiredBreakHours(12)).toBe(0.75);
  });
});

describe('checkPausen (§4)', () => {
  test('zu kurze Pause bei 10h wird erkannt', () => {
    const days = [{ datum: '05.01.2026', start: '08:00', ende: '18:00', pause: 0.5, person: 'Max', sheetId: 's1' }];
    const out = checkPausen(days);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ brutto: 10, pauseIst: 0.5, pauseSoll: 0.75, fehlend: 0.25, person: 'Max' });
  });

  test('ausreichende Pause → kein Verstoß', () => {
    const days = [{ datum: '05.01.2026', start: '08:00', ende: '18:00', pause: 0.75, person: 'Max' }];
    expect(checkPausen(days)).toHaveLength(0);
  });

  test('kurze Schicht (≤6h) braucht keine Pause', () => {
    const days = [{ datum: '05.01.2026', start: '08:00', ende: '14:00', pause: 0, person: 'Max' }];
    expect(checkPausen(days)).toHaveLength(0);
  });

  test('fehlende Pause (undefined) bei langer Schicht', () => {
    const days = [{ datum: '05.01.2026', start: '08:00', ende: '15:00', person: 'Max' }];
    const out = checkPausen(days);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ pauseIst: 0, pauseSoll: 0.5, fehlend: 0.5 });
  });
});

describe('checkRuhezeit (§5)', () => {
  test('weniger als 11h Ruhezeit wird erkannt', () => {
    const days = [
      { datum: '05.01.2026', start: '08:00', ende: '23:00', person: 'Max' },
      { datum: '06.01.2026', start: '06:00', ende: '16:00', person: 'Max' },
    ];
    const out = checkRuhezeit(days, CFG);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ ruhezeit: 7, fehlend: 4 });
  });

  test('11h oder mehr → kein Verstoß', () => {
    const days = [
      { datum: '05.01.2026', start: '08:00', ende: '20:00', person: 'Max' },
      { datum: '06.01.2026', start: '07:00', ende: '17:00', person: 'Max' },
    ];
    expect(checkRuhezeit(days, CFG)).toHaveLength(0);
  });

  test('Mitternachts-Korrektur: Vorschicht endet nach Mitternacht', () => {
    // Schicht endet 02:00 (Folgetag), nächste Schicht startet 10:00 → 8h Ruhezeit
    const days = [
      { datum: '05.01.2026', start: '18:00', ende: '02:00', person: 'Max' },
      { datum: '06.01.2026', start: '10:00', ende: '18:00', person: 'Max' },
    ];
    const out = checkRuhezeit(days, CFG);
    expect(out).toHaveLength(1);
    expect(out[0].ruhezeit).toBe(8);
  });

  test('nicht aufeinanderfolgende Tage werden ignoriert', () => {
    const days = [
      { datum: '05.01.2026', start: '08:00', ende: '23:00', person: 'Max' },
      { datum: '07.01.2026', start: '06:00', ende: '16:00', person: 'Max' },
    ];
    expect(checkRuhezeit(days, CFG)).toHaveLength(0);
  });

  test('trennt nach Person', () => {
    const days = [
      { datum: '05.01.2026', start: '08:00', ende: '23:00', person: 'Max' },
      { datum: '06.01.2026', start: '06:00', ende: '16:00', person: 'Eva' },
    ];
    expect(checkRuhezeit(days, CFG)).toHaveLength(0);
  });
});

describe('checkWochenruhetag (§9/§11)', () => {
  test('mehr als 6 Tage am Stück wird erkannt', () => {
    const set = new Set(['05.01.2026','06.01.2026','07.01.2026','08.01.2026','09.01.2026','10.01.2026','11.01.2026']);
    const out = checkWochenruhetag(new Map([['Max', set]]), CFG);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ person: 'Max', von: '05.01.2026', bis: '11.01.2026', tage: 7 });
  });

  test('genau 6 Tage → kein Verstoß', () => {
    const set = new Set(['05.01.2026','06.01.2026','07.01.2026','08.01.2026','09.01.2026','10.01.2026']);
    expect(checkWochenruhetag(new Map([['Max', set]]), CFG)).toHaveLength(0);
  });

  test('freier Tag unterbricht den Lauf', () => {
    const set = new Set(['05.01.2026','06.01.2026','07.01.2026','09.01.2026','10.01.2026','11.01.2026','12.01.2026']);
    expect(checkWochenruhetag(new Map([['Max', set]]), CFG)).toHaveLength(0);
  });
});

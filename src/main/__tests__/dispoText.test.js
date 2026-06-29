import { describe, test, expect } from 'vitest';
import {
  extractMotivAddresses,
  extractInlineAddresses,
} from '../dispoText';

describe('extractMotivAddresses (deutsche Dispos mit Label)', () => {
  test('liest mehrzeiligen Motiv-Block (Straße + PLZ Ort)', () => {
    const lines = [
      'Motiv 1 „Friedhof":',
      'Jüdischer Friedhof Köln-Bocklemünd',
      'Venloer Str. 1152',
      '50829 Köln',
    ];
    expect(extractMotivAddresses(lines)).toEqual([
      { label: 'Friedhof', address: 'Venloer Str. 1152, 50829 Köln' },
    ]);
  });
});

describe('extractInlineAddresses (englische Call Sheets, einzeilig)', () => {
  test('erkennt vollständige Adresse in einer Zeile', () => {
    const lines = ['Location', '-', 'Freimersdorfer Weg 6, 50829 Köln', '2nd Unit'];
    expect(extractInlineAddresses(lines)).toEqual([
      { label: 'Drehort', address: 'Freimersdorfer Weg 6, 50829 Köln' },
    ]);
  });

  test('toleriert Länderpräfix (D-) und normiert es weg', () => {
    const lines = ['Venloer Str. 1152, D-50829 Köln'];
    expect(extractInlineAddresses(lines)[0].address).toBe('Venloer Str. 1152, 50829 Köln');
  });

  test('ignoriert Notfall-/Krankenhaus-Zeilen', () => {
    const lines = [
      'EMERGENCY LINE: 112 // NEAREST HOSPITAL: St. Franziskus | Schönsteinstraße 63, 50825 Köln | HOTLINE: 022155910',
    ];
    expect(extractInlineAddresses(lines)).toEqual([]);
  });

  test('bevorzugt die am häufigsten genannte Adresse (Hauptdrehort)', () => {
    const lines = [
      'Nebenstraße 1, 50000 Köln',
      'Hauptstraße 9, 50000 Köln',
      'Hauptstraße 9, 50000 Köln',
    ];
    const res = extractInlineAddresses(lines);
    expect(res[0].address).toBe('Hauptstraße 9, 50000 Köln');
    expect(res[0].label).toBe('Drehort');
  });
});

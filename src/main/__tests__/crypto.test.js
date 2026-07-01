import { describe, test, expect } from 'vitest';
import {
  generateDEK,
  aesEncrypt,
  aesDecrypt,
  deriveKEK,
  newSalt,
  wrapDEK,
  unwrapDEK,
  buildPassWrap,
  openPassWrap,
  isEncrypted,
  encryptEnvelope,
  decryptEnvelope,
} from '../crypto';

describe('AES-256-GCM enc/dec', () => {
  test('Round-trip String', () => {
    const key = generateDEK();
    const enc = aesEncrypt('Geheime Abrechnung €1234', key);
    expect(aesDecrypt(enc, key).toString('utf8')).toBe('Geheime Abrechnung €1234');
  });

  test('falscher Schlüssel schlägt fehl', () => {
    const enc = aesEncrypt('x', generateDEK());
    expect(() => aesDecrypt(enc, generateDEK())).toThrow();
  });

  test('manipuliertes Chiffrat schlägt fehl (GCM-Auth)', () => {
    const key = generateDEK();
    const enc = aesEncrypt('hello world', key);
    const tampered = { ...enc, ct: Buffer.from('AAAA' + enc.ct.slice(4), 'base64').toString('base64') };
    expect(() => aesDecrypt(tampered, key)).toThrow();
  });
});

describe('DEK-Wrap mit Passphrase-KEK', () => {
  test('deriveKEK ist deterministisch je Salt', () => {
    const salt = newSalt();
    expect(deriveKEK('pw', salt).equals(deriveKEK('pw', salt))).toBe(true);
    expect(deriveKEK('pw', salt).equals(deriveKEK('anders', salt))).toBe(false);
  });

  test('wrap/unwrap Round-trip', () => {
    const dek = generateDEK();
    const kek = deriveKEK('pw', newSalt());
    expect(unwrapDEK(wrapDEK(dek, kek), kek).equals(dek)).toBe(true);
  });

  test('buildPassWrap → openPassWrap liefert denselben DEK', () => {
    const dek = generateDEK();
    const pw = buildPassWrap(dek, 'mein-master-passwort');
    expect(openPassWrap(pw, 'mein-master-passwort').equals(dek)).toBe(true);
  });

  test('falsche Passphrase schlägt fehl', () => {
    const dek = generateDEK();
    const pw = buildPassWrap(dek, 'richtig');
    expect(() => openPassWrap(pw, 'falsch')).toThrow();
  });
});

describe('Envelope', () => {
  const data = { _version: 7, _lastWrite: { counter: 5, deviceId: 'abc', ts: '2026-06-29' }, timesheets: [{ id: 1 }], settings: { tagesgage: 500 } };

  test('encrypt → decrypt Round-trip', () => {
    const dek = generateDEK();
    const env = encryptEnvelope(JSON.stringify(data), dek, { version: data._version, lastWrite: data._lastWrite });
    expect(isEncrypted(env)).toBe(true);
    expect(JSON.parse(decryptEnvelope(env, dek))).toEqual(data);
  });

  test('Klartext-Header bleibt ohne Schlüssel lesbar (Konflikterkennung)', () => {
    const dek = generateDEK();
    const env = encryptEnvelope(JSON.stringify(data), dek, { version: data._version, lastWrite: data._lastWrite });
    expect(env._version).toBe(7);
    expect(env._lastWrite.counter).toBe(5);
    expect(env.ct).toBeTruthy();
    // Nutzdaten dürfen NICHT im Klartext im Envelope stehen
    expect(JSON.stringify(env)).not.toContain('timesheets');
  });

  test('passWrap wird in den Envelope eingebettet und ist passphrase-öffenbar', () => {
    const dek = generateDEK();
    const passWrap = buildPassWrap(dek, 'pw');
    const env = encryptEnvelope(JSON.stringify(data), dek, { passWrap });
    const dek2 = openPassWrap(env.wrap.pass, 'pw');
    expect(JSON.parse(decryptEnvelope(env, dek2))).toEqual(data);
  });

  test('isEncrypted erkennt Klartext-Objekt nicht', () => {
    expect(isEncrypted({ timesheets: [] })).toBe(false);
    expect(isEncrypted(null)).toBe(false);
  });
});

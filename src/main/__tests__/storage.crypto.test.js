import { describe, test, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

async function freshStorage() {
  vi.resetModules();
  return import('../storage.js');
}
function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'zb-crypto-'));
}
// Test-Provider mit festem DEK (keine Keychain-/Passphrase-Abhängigkeit)
function provider(dek = Buffer.alloc(32, 7), opts = {}) {
  return {
    encryptionActive: () => opts.active !== false,
    currentDEK: () => dek,
    passWrapForEnvelope: () => opts.passWrap || null,
    dekForLoad: () => {
      if (opts.locked) throw Object.assign(new Error('locked'), { code: 'NEEDS_PASSPHRASE' });
      return dek;
    },
  };
}

beforeEach(() => {
  process.env.ZEITBLICK_DATA_HOME = makeTmpDir();
});

describe('storage-Verschlüsselung', () => {
  test('saveData schreibt einen Envelope (kein Klartext der Nutzdaten)', async () => {
    const storage = await freshStorage();
    storage.setKeyProvider(provider());
    const res = storage.saveData({ timesheets: [{ id: 'geheim', betrag: 4242 }], settings: { tagesgage: 500 } });
    expect(res.success).toBe(true);

    const raw = fs.readFileSync(storage.getStoragePath(), 'utf-8');
    expect(raw).not.toContain('geheim');
    expect(raw).not.toContain('4242');
    const onDisk = JSON.parse(raw);
    expect(onDisk._enc).toBe(1);
    expect(onDisk._lastWrite.counter).toBe(1); // Header im Klartext
  });

  test('loadData entschlüsselt den Envelope wieder', async () => {
    const storage = await freshStorage();
    storage.setKeyProvider(provider());
    storage.saveData({ timesheets: [{ id: 'a', betrag: 99 }], settings: { tagesgage: 500 } });

    const loaded = storage.loadData();
    expect(loaded.timesheets).toEqual([{ id: 'a', betrag: 99 }]);
    expect(loaded.settings.tagesgage).toBe(500);
  });

  test('counter inkrementiert auch verschlüsselt (Konflikterkennung via Klartext-Header)', async () => {
    const storage = await freshStorage();
    storage.setKeyProvider(provider());
    storage.saveData({ timesheets: [], settings: {} });
    const r2 = storage.saveData({ timesheets: [{ id: 'x' }], settings: {} });
    expect(r2.success).toBe(true);
    const onDisk = JSON.parse(fs.readFileSync(storage.getStoragePath(), 'utf-8'));
    expect(onDisk._lastWrite.counter).toBe(2);
  });

  test('gesperrt (keine Passphrase) → loadData meldet _needsPassphrase statt Datenverlust', async () => {
    const storage = await freshStorage();
    storage.setKeyProvider(provider());
    storage.saveData({ timesheets: [{ id: 'a' }], settings: {} });

    storage.setKeyProvider(provider(Buffer.alloc(32, 7), { locked: true }));
    const loaded = storage.loadData();
    expect(loaded._needsPassphrase).toBe(true);
    expect(loaded._encrypted).toBe(true);
    expect(loaded.timesheets).toEqual([]); // kein Schaden, leere Hülle
  });

  test('Backup eines verschlüsselten Stands ist verschlüsselt und wird beim Restore entschlüsselt', async () => {
    const storage = await freshStorage();
    storage.setKeyProvider(provider());
    storage.saveData({ timesheets: [{ id: 'a', betrag: 7 }], settings: { tagesgage: 500 } });

    const bk = storage.createBackup();
    expect(bk.success).toBe(true);
    const backupRaw = fs.readFileSync(bk.path, 'utf-8');
    expect(JSON.parse(backupRaw)._enc).toBe(1); // Backup verschlüsselt
    expect(backupRaw).not.toContain('betrag');

    const restored = storage.restoreBackup(bk.path);
    expect(restored.success).toBe(true);
    expect(restored.data.timesheets).toEqual([{ id: 'a', betrag: 7 }]);
  });

  test('ohne Provider bleibt alles Klartext (Abwärtskompatibilität)', async () => {
    const storage = await freshStorage();
    storage.saveData({ timesheets: [{ id: 'klartext' }], settings: {} });
    const raw = fs.readFileSync(storage.getStoragePath(), 'utf-8');
    expect(raw).toContain('klartext');
    expect(JSON.parse(raw)._enc).toBeUndefined();
    expect(storage.loadData().timesheets).toEqual([{ id: 'klartext' }]);
  });
});

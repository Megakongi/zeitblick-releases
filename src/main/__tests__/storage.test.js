import { describe, test, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

// storage.js liest den Basisordner über ZEITBLICK_DATA_HOME (Test-Seam),
// sodass kein laufendes Electron nötig ist. Pro Test ein frisches Verzeichnis.
const h = { userDataDir: '' };

async function freshStorage() {
  vi.resetModules(); // setzt modulinternes lastSeenWrite zurück
  return import('../storage.js');
}

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'zb-storage-'));
}

beforeEach(() => {
  h.userDataDir = makeTmpDir();
  process.env.ZEITBLICK_DATA_HOME = h.userDataDir;
});

describe('saveData – _lastWrite-Metadaten', () => {
  test('schreibt counter, deviceId und ts beim ersten Speichern', async () => {
    const storage = await freshStorage();
    const res = storage.saveData({ timesheets: [], settings: {} });
    expect(res.success).toBe(true);

    const onDisk = JSON.parse(fs.readFileSync(storage.getStoragePath(), 'utf-8'));
    expect(onDisk._lastWrite.counter).toBe(1);
    expect(onDisk._lastWrite.deviceId).toBeTruthy();
    expect(onDisk._lastWrite.ts).toBeTruthy();
  });

  test('inkrementiert den counter bei aufeinanderfolgenden Speichervorgängen', async () => {
    const storage = await freshStorage();
    storage.saveData({ timesheets: [], settings: {} });
    storage.saveData({ timesheets: [{ id: 'a' }], settings: {} });

    const onDisk = JSON.parse(fs.readFileSync(storage.getStoragePath(), 'utf-8'));
    expect(onDisk._lastWrite.counter).toBe(2);
  });
});

describe('Fremdänderungs-Schutz', () => {
  test('meldet Konflikt, wenn ein anderes Gerät zwischenzeitlich geschrieben hat', async () => {
    const storage = await freshStorage();
    storage.saveData({ timesheets: [], settings: {} }); // counter 1, unser Gerät

    // Anderes Gerät schreibt direkt auf die Datei
    const onDisk = JSON.parse(fs.readFileSync(storage.getStoragePath(), 'utf-8'));
    onDisk._lastWrite = { counter: 9, deviceId: 'other-device', device: 'OtherMac', ts: new Date().toISOString() };
    fs.writeFileSync(storage.getStoragePath(), JSON.stringify(onDisk), 'utf-8');

    const res = storage.saveData({ timesheets: [{ id: 'mine' }], settings: {} });
    expect(res.success).toBe(false);
    expect(res.conflict).toBe(true);
    expect(res.onDisk.deviceId).toBe('other-device');
  });

  test('force überschreibt trotz Konflikt und erhöht den counter', async () => {
    const storage = await freshStorage();
    storage.saveData({ timesheets: [], settings: {} });

    const onDisk = JSON.parse(fs.readFileSync(storage.getStoragePath(), 'utf-8'));
    onDisk._lastWrite = { counter: 9, deviceId: 'other-device', ts: new Date().toISOString() };
    fs.writeFileSync(storage.getStoragePath(), JSON.stringify(onDisk), 'utf-8');

    const res = storage.saveData({ timesheets: [{ id: 'mine' }], settings: {} }, { force: true });
    expect(res.success).toBe(true);

    const after = JSON.parse(fs.readFileSync(storage.getStoragePath(), 'utf-8'));
    expect(after._lastWrite.counter).toBe(10); // 9 + 1
    expect(after.timesheets).toEqual([{ id: 'mine' }]);
  });

  test('nach loadData kein Konflikt mehr (Stand wurde übernommen)', async () => {
    const storage = await freshStorage();
    storage.saveData({ timesheets: [], settings: {} });

    const onDisk = JSON.parse(fs.readFileSync(storage.getStoragePath(), 'utf-8'));
    onDisk._lastWrite = { counter: 9, deviceId: 'other-device', ts: new Date().toISOString() };
    fs.writeFileSync(storage.getStoragePath(), JSON.stringify(onDisk), 'utf-8');

    storage.loadData(); // übernimmt den fremden Stand
    const res = storage.saveData({ timesheets: [], settings: {} });
    expect(res.success).toBe(true);
  });

  test('hasExternalChange erkennt Fremdschreibvorgang', async () => {
    const storage = await freshStorage();
    storage.saveData({ timesheets: [], settings: {} });
    expect(storage.hasExternalChange()).toBe(false);

    const onDisk = JSON.parse(fs.readFileSync(storage.getStoragePath(), 'utf-8'));
    onDisk._lastWrite = { counter: 99, deviceId: 'other-device', ts: new Date().toISOString() };
    fs.writeFileSync(storage.getStoragePath(), JSON.stringify(onDisk), 'utf-8');

    expect(storage.hasExternalChange()).toBe(true);
  });
});

describe('setDataDir – Umzug', () => {
  test('seedet einen leeren Zielordner mit dem aktuellen Stand', async () => {
    const storage = await freshStorage();
    storage.saveData({ timesheets: [{ id: 'seed' }], settings: {} });

    const target = makeTmpDir();
    const res = storage.setDataDir(target);
    expect(res.success).toBe(true);
    expect(res.adopted).toBe(false);

    const moved = JSON.parse(fs.readFileSync(path.join(target, 'zeitblick-data.json'), 'utf-8'));
    expect(moved.timesheets).toEqual([{ id: 'seed' }]);
    expect(storage.getDataDir()).toBe(target);
  });

  test('adoptiert vorhandene Daten im Zielordner (anderes Gerät)', async () => {
    const storage = await freshStorage();
    storage.saveData({ timesheets: [{ id: 'local' }], settings: {} });

    // Zielordner hat bereits Daten eines anderen Geräts
    const target = makeTmpDir();
    fs.writeFileSync(
      path.join(target, 'zeitblick-data.json'),
      JSON.stringify({ timesheets: [{ id: 'remote' }], settings: {}, _version: 5 }),
      'utf-8'
    );

    const res = storage.setDataDir(target);
    expect(res.success).toBe(true);
    expect(res.adopted).toBe(true);
    expect(res.data.timesheets).toEqual([{ id: 'remote' }]);
  });

  test('resetToLocal nimmt den aktuellen Stand zurück auf den lokalen Ordner', async () => {
    const storage = await freshStorage();
    storage.saveData({ timesheets: [{ id: 'x' }], settings: {} });
    const target = makeTmpDir();
    storage.setDataDir(target);
    storage.saveData({ timesheets: [{ id: 'updated-on-cloud' }], settings: {} });

    const res = storage.resetToLocal();
    expect(res.success).toBe(true);
    expect(storage.getDataDir()).toBe(h.userDataDir);

    const local = JSON.parse(fs.readFileSync(path.join(h.userDataDir, 'zeitblick-data.json'), 'utf-8'));
    expect(local.timesheets).toEqual([{ id: 'updated-on-cloud' }]);
  });
});

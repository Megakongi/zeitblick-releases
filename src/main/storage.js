const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');

const DATA_VERSION = 5;
const DATA_FILENAME = 'zeitblick-data.json';

// Basisordner (Electron-userData). Über ZEITBLICK_DATA_HOME überschreibbar –
// genutzt für Tests; im Normalbetrieb greift Electrons userData-Pfad.
function userDataBase() {
  if (process.env.ZEITBLICK_DATA_HOME) return process.env.ZEITBLICK_DATA_HOME;
  return app.getPath('userData');
}

// ===== Konfigurierbarer Speicherort (geräteübergreifend via iCloud) =====
//
// Der eigentliche Datenspeicher kann in einen synchronisierten Ordner
// (z. B. iCloud) zeigen. Der Pointer dorthin bleibt BEWUSST lokal pro Gerät
// (Henne-Ei: die Pfad-Konfiguration darf nicht in der Datei liegen, die wir
// gerade umziehen). Backups bleiben ebenfalls lokal als Sicherheitsnetz.

function getPointerPath() {
  return path.join(userDataBase(), 'storage-location.json');
}

function readPointer() {
  try {
    const f = getPointerPath();
    if (!fs.existsSync(f)) return {};
    return JSON.parse(fs.readFileSync(f, 'utf-8')) || {};
  } catch {
    return {};
  }
}

function writePointer(pointer) {
  try {
    fs.writeFileSync(getPointerPath(), JSON.stringify(pointer, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error('[storage] Pointer konnte nicht gespeichert werden:', e.message);
    return false;
  }
}

/** Stabile, gerätelokale ID (für Fremdänderungs-Erkennung). */
function getDeviceId() {
  const pointer = readPointer();
  if (pointer.deviceId) return pointer.deviceId;
  const deviceId = crypto.randomBytes(6).toString('hex');
  writePointer({ ...pointer, deviceId });
  return deviceId;
}

/** Verzeichnis, in dem die Datendatei liegt (custom oder lokal). */
function getDataDir() {
  const pointer = readPointer();
  if (pointer.dataDir) return pointer.dataDir;
  return userDataBase();
}

function getStoragePath() {
  return path.join(getDataDir(), DATA_FILENAME);
}

// Backups absichtlich IMMER lokal – ein Sync-Konflikt darf sie nicht mitreißen.
function getBackupDir() {
  return path.join(userDataBase(), 'backups');
}

// ===== Fremdänderungs-Schutz =====
// Letzter Schreibvorgang, den DIESES Gerät gesehen hat (geladen oder geschrieben).
let lastSeenWrite = null;

function writeKey(w) {
  if (!w) return null;
  return `${w.counter || 0}|${w.deviceId || '?'}|${w.ts || ''}`;
}

/** Liest nur die _lastWrite-Metadaten von der Platte (ohne vollen Parse-Zwang). */
function readOnDiskWrite() {
  try {
    const filePath = getStoragePath();
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);
    return data._lastWrite || null;
  } catch {
    return null;
  }
}

/** Migrate data from older versions to the current format. */
function migrateData(data) {
  if (!data._version) data._version = 1;
  if (data._version === 1) {
    if (data.settings) {
      data.settings.hiddenZusatzPersonen = data.settings.hiddenZusatzPersonen || [];
      data.settings.nameAliases = data.settings.nameAliases || {};
      data.settings.crews = data.settings.crews || {};
      data.settings.personGagen = data.settings.personGagen || {};
      data.settings.positionGagen = data.settings.positionGagen || {};
    }
    data._version = 2;
  }
  if (data._version === 2) {
    // Migrate crews → team + projectStaffing
    if (data.settings) {
      const crews = data.settings.crews || {};
      const existingTeam = data.settings.team || [];
      const existingStaffing = data.settings.projectStaffing || {};
      const existingNames = new Set(existingTeam.map(m => m.name.toLowerCase()));

      // Collect all unique crew members, deduplicate by name
      const newMembers = [];
      for (const crew of Object.values(crews)) {
        for (const member of (crew.members || [])) {
          if (!member.name || existingNames.has(member.name.toLowerCase())) continue;
          existingNames.add(member.name.toLowerCase());
          newMembers.push({
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
            name: member.name,
            position: member.position || '',
            email: '',
            phone: '',
            notizen: '',
          });
        }
      }
      data.settings.team = [...existingTeam, ...newMembers];

      // Build a lookup: name → team member id
      const nameToId = {};
      for (const m of data.settings.team) {
        nameToId[m.name.toLowerCase()] = m;
      }

      // Migrate project crew assignments → projectStaffing
      const projects = data.settings.projects || {};
      for (const [projectName, project] of Object.entries(projects)) {
        if (!project.crew || !crews[project.crew]) continue;
        if (existingStaffing[projectName] && existingStaffing[projectName].length > 0) continue;
        const crewMembers = crews[project.crew].members || [];
        existingStaffing[projectName] = crewMembers
          .filter(m => m.name && nameToId[m.name.toLowerCase()])
          .map(m => {
            const teamMember = nameToId[m.name.toLowerCase()];
            return {
              id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
              memberId: teamMember.id,
              name: teamMember.name,
              position: m.position || teamMember.position || '',
              von: '',
              bis: '',
            };
          });
        delete project.crew;
      }
      data.settings.projectStaffing = existingStaffing;

      // Clean up: remove crews and remaining crew fields from projects
      delete data.settings.crews;
      for (const project of Object.values(projects)) {
        delete project.crew;
      }
    }
    data._version = 3;
  }
  if (data._version === 3) {
    // Add n8n + projectCrews defaults
    if (data.settings) {
      data.settings.projectCrews = data.settings.projectCrews || {};
      if (typeof data.settings.n8nFolder === 'undefined') data.settings.n8nFolder = '';
      if (typeof data.settings.n8nEnabled === 'undefined') data.settings.n8nEnabled = false;
    }
    data._version = 4;
  }
  if (data._version === 4) {
    // Dispos (PDF-Dispositionen) – Liste importierter Dispo-Dateien
    if (data.settings) {
      data.settings.dispos = data.settings.dispos || [];
    }
    data._version = 5;
  }
  return data;
}

function loadData() {
  try {
    const filePath = getStoragePath();
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      let data = JSON.parse(raw);
      // Stand merken, gegen den künftige Schreibvorgänge geprüft werden.
      lastSeenWrite = data._lastWrite || null;
      data = migrateData(data);
      return data;
    }
  } catch (error) {
    console.error('Error loading data:', error);
    return { timesheets: [], settings: { tagesgage: 0, pauschale: 0.75 }, _loadError: error.message, _version: DATA_VERSION };
  }
  lastSeenWrite = null;
  return { timesheets: [], settings: { tagesgage: 0, pauschale: 0.75 }, _version: DATA_VERSION };
}

/**
 * Speichert die Daten.
 * @param {object} data       Der zu speichernde Zustand (ohne Metadaten).
 * @param {object} [opts]
 * @param {boolean} [opts.force]  Konflikt-Erkennung überspringen und überschreiben.
 * @returns {{success:boolean, conflict?:boolean, onDisk?:object, error?:string}}
 */
function saveData(data, opts = {}) {
  try {
    const filePath = getStoragePath();
    const onDisk = readOnDiskWrite();

    // Fremdänderungs-Schutz: Hat ein anderes Gerät seit unserem letzten
    // Laden/Speichern geschrieben? Dann nicht blind überschreiben.
    if (!opts.force && onDisk && writeKey(onDisk) !== writeKey(lastSeenWrite)) {
      return { success: false, conflict: true, onDisk };
    }

    const deviceId = getDeviceId();
    // counter geräteübergreifend monoton: Maximum aus eigenem und Platten-Stand.
    const prevCounter = Math.max(
      (lastSeenWrite && lastSeenWrite.counter) || 0,
      (onDisk && onDisk.counter) || 0
    );
    const newWrite = {
      ts: new Date().toISOString(),
      deviceId,
      device: os.hostname(),
      counter: prevCounter + 1,
    };

    const toSave = { ...data, _version: DATA_VERSION, _lastWrite: newWrite };
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    // Atomic write: temp file then rename
    const tempPath = filePath + '.tmp';
    fs.writeFileSync(tempPath, JSON.stringify(toSave, null, 2), 'utf-8');
    fs.renameSync(tempPath, filePath);

    lastSeenWrite = newWrite;
    return { success: true };
  } catch (error) {
    console.error('Error saving data:', error);
    return { success: false, error: error.message };
  }
}

function createBackup() {
  try {
    const sourcePath = getStoragePath();
    if (!fs.existsSync(sourcePath)) return { success: false, error: 'Keine Daten zum Sichern vorhanden.' };
    const backupDir = getBackupDir();
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupPath = path.join(backupDir, `zeitblick-backup-${timestamp}.json`);
    fs.copyFileSync(sourcePath, backupPath);
    // Keep only last 20 backups
    const backups = fs.readdirSync(backupDir).filter(f => f.startsWith('zeitblick-backup-') && f.endsWith('.json')).sort().reverse();
    for (const old of backups.slice(20)) {
      try { fs.unlinkSync(path.join(backupDir, old)); } catch (e) { console.warn(`Could not delete old backup ${old}:`, e.message); }
    }
    return { success: true, path: backupPath, filename: path.basename(backupPath) };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function restoreBackup(backupPath) {
  try {
    if (!fs.existsSync(backupPath)) return { success: false, error: 'Backup-Datei nicht gefunden.' };
    const raw = fs.readFileSync(backupPath, 'utf-8');
    const data = JSON.parse(raw);
    if (!data.timesheets || !Array.isArray(data.timesheets)) return { success: false, error: 'Ungültiges Backup.' };
    const migratedData = migrateData(data);
    saveData(migratedData, { force: true }); // bewusstes Ersetzen durch den Nutzer
    return { success: true, data: migratedData };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function listBackups() {
  try {
    const backupDir = getBackupDir();
    if (!fs.existsSync(backupDir)) return [];
    return fs.readdirSync(backupDir).filter(f => f.startsWith('zeitblick-backup-') && f.endsWith('.json')).sort().reverse().map(f => {
      const fullPath = path.join(backupDir, f);
      const stat = fs.statSync(fullPath);
      return { filename: f, path: fullPath, size: stat.size, date: stat.mtime.toISOString() };
    });
  } catch (error) {
    return [];
  }
}

function exportData(destPath) {
  try {
    const sourcePath = getStoragePath();
    if (!fs.existsSync(sourcePath)) return { success: false, error: 'Keine Daten vorhanden.' };
    fs.copyFileSync(sourcePath, destPath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function importData(sourcePath) {
  try {
    const raw = fs.readFileSync(sourcePath, 'utf-8');
    const data = JSON.parse(raw);
    if (!data.timesheets || !Array.isArray(data.timesheets)) return { success: false, error: 'Ungültiges Datenformat.' };
    createBackup();
    const migratedData = migrateData(data);
    saveData(migratedData, { force: true }); // bewusstes Ersetzen durch den Nutzer
    return { success: true, data: migratedData };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ===== Speicherort wechseln (geräteübergreifend) =====

/**
 * Verlegt den Datenspeicher in `newDir`.
 * - Hat das Ziel bereits eine Datei (anderes Gerät) → übernehmen (adopt).
 * - Sonst → aktuellen Stand dorthin kopieren (seed).
 * Dispos werden mitkopiert (ohne vorhandene Ziel-Dateien zu überschreiben).
 */
function setDataDir(newDir) {
  try {
    if (!newDir) return { success: false, error: 'Kein Ordner angegeben.' };
    const pointer = readPointer();
    const oldDir = pointer.dataDir || userDataBase();
    if (path.resolve(newDir) === path.resolve(oldDir)) {
      return { success: true, data: loadData(), adopted: false, unchanged: true };
    }
    if (!fs.existsSync(newDir)) fs.mkdirSync(newDir, { recursive: true });

    createBackup(); // lokales Sicherheitsnetz vor jedem Wechsel

    const oldFile = path.join(oldDir, DATA_FILENAME);
    const newFile = path.join(newDir, DATA_FILENAME);
    let adopted = false;
    if (fs.existsSync(newFile)) {
      adopted = true; // Ziel hat bereits Daten → übernehmen
    } else if (fs.existsSync(oldFile)) {
      fs.copyFileSync(oldFile, newFile); // Seed mit aktuellem Stand
    }

    // Dispos mitnehmen (vorhandene Ziel-Dateien nicht überschreiben).
    try {
      const oldDispos = path.join(oldDir, 'dispos');
      const newDispos = path.join(newDir, 'dispos');
      if (fs.existsSync(oldDispos)) {
        fs.cpSync(oldDispos, newDispos, { recursive: true, force: false, errorOnExist: false });
      }
    } catch (e) {
      console.warn('[storage] Dispos-Umzug:', e.message);
    }

    writePointer({ ...pointer, dataDir: newDir });
    const data = loadData(); // setzt lastSeenWrite auf den aktiven Ort
    return { success: true, data, adopted };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/** Schaltet zurück auf den lokalen userData-Ordner und nimmt den aktuellen Stand mit. */
function resetToLocal() {
  try {
    const pointer = readPointer();
    if (!pointer.dataDir) return { success: true, data: loadData(), unchanged: true };
    const currentFile = getStoragePath();
    const localFile = path.join(userDataBase(), DATA_FILENAME);
    createBackup();
    if (fs.existsSync(currentFile)) fs.copyFileSync(currentFile, localFile); // aktuellen Stand übernehmen
    writePointer({ ...pointer, dataDir: undefined });
    const data = loadData();
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/** Infos zum aktuellen Speicherort (für die Settings-UI). */
function getDataLocationInfo() {
  const pointer = readPointer();
  return {
    dataDir: getDataDir(),
    isCustom: !!pointer.dataDir,
    deviceId: getDeviceId(),
    deviceName: os.hostname(),
    storagePath: getStoragePath(),
    lastWrite: readOnDiskWrite(), // { ts, device, deviceId, counter } | null
  };
}

/** Hat ein anderes Gerät seit unserem letzten Laden/Speichern geschrieben? */
function hasExternalChange() {
  const onDisk = readOnDiskWrite();
  return !!(onDisk && writeKey(onDisk) !== writeKey(lastSeenWrite));
}

module.exports = {
  loadData,
  saveData,
  createBackup,
  restoreBackup,
  listBackups,
  exportData,
  importData,
  getStoragePath,
  getDataDir,
  setDataDir,
  resetToLocal,
  getDataLocationInfo,
  hasExternalChange,
};

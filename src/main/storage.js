const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DATA_VERSION = 2;

function getStoragePath() {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'zeitblick-data.json');
}

function getBackupDir() {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'backups');
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
  return data;
}

function loadData() {
  try {
    const filePath = getStoragePath();
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      let data = JSON.parse(raw);
      data = migrateData(data);
      return data;
    }
  } catch (error) {
    console.error('Error loading data:', error);
    return { timesheets: [], settings: { tagesgage: 0, pauschale: 0.75 }, _loadError: error.message, _version: DATA_VERSION };
  }
  return { timesheets: [], settings: { tagesgage: 0, pauschale: 0.75 }, _version: DATA_VERSION };
}

function saveData(data) {
  try {
    data._version = DATA_VERSION;
    const filePath = getStoragePath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    // Atomic write: temp file then rename
    const tempPath = filePath + '.tmp';
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempPath, filePath);
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
    for (const old of backups.slice(20)) fs.unlinkSync(path.join(backupDir, old));
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
    saveData(migratedData);
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
    saveData(migratedData);
    return { success: true, data: migratedData };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

module.exports = { loadData, saveData, createBackup, restoreBackup, listBackups, exportData, importData, getStoragePath };

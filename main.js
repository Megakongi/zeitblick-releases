const { app, BrowserWindow, ipcMain, dialog, globalShortcut, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { parsePDF } = require('./src/main/pdfParser');
const { loadData, saveData, createBackup, restoreBackup, listBackups, exportData, importData } = require('./src/main/storage');

// Auto-updater
let autoUpdater = null;
try {
  autoUpdater = require('electron-updater').autoUpdater;
  autoUpdater.autoDownload = false;      // Don't download automatically — ask user first
  autoUpdater.autoInstallOnAppQuit = true; // Auto-install when app quits
  autoUpdater.allowPrerelease = false;
  // Skip code signature verification on macOS (no Apple Developer cert needed)
  if (process.platform === 'darwin') {
    autoUpdater.verifyUpdateCodeSignature = false;
  }
} catch (e) {
  console.error('Auto-updater init failed:', e.message);
}

// Module-level helper to send status to renderer
function sendUpdateStatus(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

/**
 * Download a file with progress reporting, following redirects.
 * Used for custom DMG download on macOS (bypasses Squirrel.Mac signature check).
 */
function downloadFile(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    const doRequest = (requestUrl) => {
      const proto = requestUrl.startsWith('https') ? require('https') : require('http');
      proto.get(requestUrl, { headers: { 'User-Agent': 'ZeitBlick-Updater' } }, (response) => {
        // Follow redirects (GitHub uses 302)
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          doRequest(response.headers.location);
          return;
        }
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }
        const totalBytes = parseInt(response.headers['content-length'], 10) || 0;
        let receivedBytes = 0;
        const file = fs.createWriteStream(dest);
        response.on('data', (chunk) => {
          receivedBytes += chunk.length;
          if (totalBytes > 0 && onProgress) {
            onProgress({
              percent: (receivedBytes / totalBytes) * 100,
              transferred: receivedBytes,
              total: totalBytes,
            });
          }
        });
        response.pipe(file);
        file.on('finish', () => { file.close(resolve); });
        file.on('error', (err) => { fs.unlink(dest, () => {}); reject(err); });
      }).on('error', reject);
    };
    doRequest(url);
  });
}

app.name = 'ZeitBlick';

let mainWindow;

function createWindow() {
  // Icon path — only needed on Windows/Linux (macOS uses .icns from app bundle)
  let iconPath = undefined;
  if (process.platform !== 'darwin') {
    iconPath = path.join(__dirname, 'build', 'icon.png');
  }

  mainWindow = new BrowserWindow({
    title: `ZeitBlick v${app.getVersion()}`,
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    ...(iconPath ? { icon: iconPath } : {}),
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0a0a0f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // In dev, load from Vite dev server
  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();
  setupAutoUpdater();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ===== Auto-Updater =====

function setupAutoUpdater() {
  if (!autoUpdater || !mainWindow) return;

  autoUpdater.on('checking-for-update', () => {
    sendUpdateStatus('update-status', { status: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    sendUpdateStatus('update-status', {
      status: 'available',
      version: info.version,
      releaseNotes: info.releaseNotes || '',
      releaseDate: info.releaseDate || '',
    });
  });

  autoUpdater.on('update-not-available', (info) => {
    sendUpdateStatus('update-status', {
      status: 'up-to-date',
      version: info.version,
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    sendUpdateStatus('update-status', {
      status: 'downloading',
      percent: Math.round(progress.percent),
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    sendUpdateStatus('update-status', {
      status: 'downloaded',
      version: info.version,
      releaseNotes: info.releaseNotes || '',
      releaseDate: info.releaseDate || '',
    });
  });

  autoUpdater.on('error', (err) => {
    sendUpdateStatus('update-status', {
      status: 'error',
      message: err.message || 'Unbekannter Fehler',
    });
  });

  // Check for updates once, 5 seconds after launch (don't block startup)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 5000);
}

// IPC: Check for updates manually (from renderer)
ipcMain.handle('check-for-updates', async () => {
  if (!autoUpdater) return { success: false, error: 'Auto-Updater nicht verfügbar (nur im gepackten Build)' };
  try {
    const result = await autoUpdater.checkForUpdates();
    return { success: true, updateInfo: result?.updateInfo };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: Start downloading the update
ipcMain.handle('download-update', async () => {
  if (!autoUpdater) return { success: false, error: 'Auto-Updater nicht verfügbar' };
  try {
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: Install update
ipcMain.handle('install-update', async () => {
  // Create a backup before updating
  try {
    createBackup();
  } catch (e) {
    console.error('Pre-update backup failed:', e.message);
  }
  
  // quitAndInstall works on all platforms (macOS zip + Windows nsis)
  if (!autoUpdater) return { success: false };
  sendUpdateStatus('update-status', { status: 'installing', message: 'Update wird installiert...' });
  // Short delay so the renderer can show the installing state
  setTimeout(() => {
    autoUpdater.quitAndInstall(false, true);
  }, 500);
  return { success: true, autoInstall: true };
});

// IPC: Get platform
ipcMain.handle('get-platform', () => process.platform);

// IPC: Quit the app (used after manual macOS update)
ipcMain.handle('quit-app', () => {
  app.quit();
});

// IPC: Get current app version
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

// ===== IPC Handlers =====

// Import PDF files
ipcMain.handle('import-pdfs', async (event, filePaths) => {
  const results = [];
  for (const filePath of filePaths) {
    try {
      const parsed = await parsePDF(filePath);
      results.push({ success: true, data: parsed, filePath });
    } catch (error) {
      results.push({ success: false, error: error.message, filePath });
    }
  }
  return results;
});

// Open file dialog
ipcMain.handle('open-file-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'PDF Dateien', extensions: ['pdf'] }],
  });
  return result.filePaths;
});

// Open folder dialog — recursively find all PDFs in folder and subfolders
ipcMain.handle('open-folder-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Ordner mit PDFs auswählen',
  });
  if (result.canceled || result.filePaths.length === 0) return [];

  const folderPath = result.filePaths[0];
  const pdfFiles = [];

  function scanDir(dir) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
          pdfFiles.push(fullPath);
        }
      }
    } catch (e) {
      // skip inaccessible directories
    }
  }

  scanDir(folderPath);
  return pdfFiles;
});

// Load saved data
ipcMain.handle('load-data', async () => {
  return loadData();
});

// Save data
ipcMain.handle('save-data', async (event, data) => {
  saveData(data);
  return { success: true };
});

// Get PDF file content for re-reading
ipcMain.handle('read-pdf-file', async (event, filePath) => {
  try {
    const buffer = fs.readFileSync(filePath);
    return { success: true, data: buffer.toString('base64') };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Export as CSV
ipcMain.handle('export-csv', async (event, csvContent, defaultName) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName || 'ZeitBlick-Export.csv',
    filters: [{ name: 'CSV Dateien', extensions: ['csv'] }],
  });
  if (result.canceled) return { success: false, canceled: true };
  try {
    fs.writeFileSync(result.filePath, '\uFEFF' + csvContent, 'utf-8'); // BOM for Excel
    return { success: true, filePath: result.filePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Export as PDF (HTML-based with tables)
ipcMain.handle('export-pdf', async (event, htmlContent, defaultName) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName || 'ZeitBlick-Übersicht.pdf',
    filters: [{ name: 'PDF Dateien', extensions: ['pdf'] }],
  });
  if (result.canceled) return { success: false, canceled: true };
  try {
    // Create a hidden window to render the HTML
    const { BrowserWindow: BW } = require('electron');
    const printWin = new BW({ show: false, width: 800, height: 600 });
    await printWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent));
    // Wait for content to render
    await new Promise(r => setTimeout(r, 500));
    const pdfData = await printWin.webContents.printToPDF({
      printBackground: true,
      landscape: true,
      scale: 0.8,
      margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 },
    });
    printWin.close();
    fs.writeFileSync(result.filePath, pdfData);
    return { success: true, filePath: result.filePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Export Stundenzettel as PDF (landscape A4)
ipcMain.handle('export-timesheet-pdf', async (event, htmlContent, defaultName) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName || 'Stundenzettel.pdf',
    filters: [{ name: 'PDF Dateien', extensions: ['pdf'] }],
  });
  if (result.canceled) return { success: false, canceled: true };
  try {
    const { BrowserWindow: BW } = require('electron');
    const printWin = new BW({ show: false, width: 1200, height: 800 });
    await printWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent));
    await new Promise(r => setTimeout(r, 600));
    const pdfData = await printWin.webContents.printToPDF({
      printBackground: true,
      landscape: true,
      scale: 0.75,
      margins: { top: 0.4, bottom: 0.4, left: 0.5, right: 0.5 },
    });
    printWin.close();
    fs.writeFileSync(result.filePath, pdfData);
    return { success: true, filePath: result.filePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ===== Backup & Data Management =====

ipcMain.handle('create-backup', async () => {
  return createBackup();
});

ipcMain.handle('list-backups', async () => {
  return listBackups();
});

ipcMain.handle('restore-backup', async (event, backupPath) => {
  return restoreBackup(backupPath);
});

ipcMain.handle('export-data', async () => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: `ZeitBlick-Daten-${new Date().toISOString().slice(0,10)}.json`,
    filters: [{ name: 'JSON Dateien', extensions: ['json'] }],
  });
  if (result.canceled) return { success: false, canceled: true };
  return exportData(result.filePath);
});

ipcMain.handle('import-data', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'JSON Dateien', extensions: ['json'] }],
  });
  if (result.canceled || result.filePaths.length === 0) return { success: false, canceled: true };
  return importData(result.filePaths[0]);
});

// ===== Batch PDF export to folder =====

ipcMain.handle('export-pdfs-to-folder', async (event, htmlContentArray) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Ordner für PDF-Export auswählen',
  });
  if (result.canceled || result.filePaths.length === 0) return { success: false, canceled: true };
  const folderPath = result.filePaths[0];
  const results = [];
  try {
    const { BrowserWindow: BW } = require('electron');
    for (const item of htmlContentArray) {
      const printWin = new BW({ show: false, width: 1200, height: 800 });
      await printWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(item.html));
      await new Promise(r => setTimeout(r, 500));
      const pdfData = await printWin.webContents.printToPDF({
        printBackground: true, landscape: true, scale: 0.75,
        margins: { top: 0.4, bottom: 0.4, left: 0.5, right: 0.5 },
      });
      printWin.close();
      const filePath = path.join(folderPath, item.filename);
      fs.writeFileSync(filePath, pdfData);
      results.push({ success: true, filename: item.filename });
    }
    return { success: true, count: results.length, folder: folderPath };
  } catch (error) {
    return { success: false, error: error.message, exported: results.length };
  }
});

// ===== Excel Export =====

ipcMain.handle('export-xlsx', async (event, data, defaultName) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName || 'ZeitBlick-Export.xlsx',
    filters: [{ name: 'Excel Dateien', extensions: ['xlsx'] }],
  });
  if (result.canceled) return { success: false, canceled: true };
  try {
    const XLSX = require('xlsx');
    const wb = XLSX.utils.book_new();
    for (const sheet of data.sheets) {
      const ws = XLSX.utils.aoa_to_sheet(sheet.data);
      XLSX.utils.book_append_sheet(wb, ws, sheet.name.substring(0, 31));
    }
    XLSX.writeFile(wb, result.filePath);
    return { success: true, filePath: result.filePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

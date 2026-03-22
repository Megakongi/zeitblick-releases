const { app, BrowserWindow, ipcMain, dialog, globalShortcut, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { parsePDF } = require('./src/main/pdfParser');
const { loadData, saveData, createBackup, restoreBackup, listBackups, exportData, importData } = require('./src/main/storage');

// Auto-updater
let autoUpdater = null;
let pendingUpdateInfo = null; // Stores update info for macOS DMG flow
let downloadedDmgPath = null; // Path to downloaded DMG on macOS
try {
  // On macOS: skip electron-updater entirely to avoid Squirrel.Mac/ShipIt signature checks
  // Instead, use GitHub API to check for updates and custom DMG download
  if (process.platform !== 'darwin') {
    autoUpdater = require('electron-updater').autoUpdater;
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.allowPrerelease = false;
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

/**
 * Check for updates via GitHub Releases API (used on macOS to avoid Squirrel.Mac).
 * Returns update info if a newer version is available, null otherwise.
 */
function checkGitHubRelease() {
  return new Promise((resolve, reject) => {
    const https = require('https');
    const options = {
      hostname: 'api.github.com',
      path: '/repos/Megakongi/zeitblick-releases/releases/latest',
      headers: { 'User-Agent': 'ZeitBlick-Updater' },
    };
    https.get(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const release = JSON.parse(data);
          const latestVersion = (release.tag_name || '').replace(/^v/, '');
          const currentVersion = app.getVersion();
          if (latestVersion && latestVersion !== currentVersion && isNewerVersion(latestVersion, currentVersion)) {
            resolve({
              version: latestVersion,
              releaseNotes: release.body || '',
              releaseDate: release.published_at || '',
            });
          } else {
            resolve(null);
          }
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

/** Compare semver strings: returns true if a > b */
function isNewerVersion(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return true;
    if ((pa[i] || 0) < (pb[i] || 0)) return false;
  }
  return false;
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
  if (!mainWindow) return;

  // On macOS: use GitHub API to check for updates (avoids Squirrel.Mac/ShipIt)
  if (process.platform === 'darwin') {
    setTimeout(async () => {
      try {
        sendUpdateStatus('update-status', { status: 'checking' });
        const info = await checkGitHubRelease();
        if (info) {
          pendingUpdateInfo = info;
          sendUpdateStatus('update-status', {
            status: 'available',
            version: info.version,
            releaseNotes: info.releaseNotes,
            releaseDate: info.releaseDate,
          });
        } else {
          sendUpdateStatus('update-status', { status: 'up-to-date', version: app.getVersion() });
        }
      } catch (err) {
        console.error('[updater] GitHub release check failed:', err.message);
      }
    }, 5000);
    return;
  }

  // On Windows: use electron-updater normally
  if (!autoUpdater) return;

  autoUpdater.on('checking-for-update', () => {
    sendUpdateStatus('update-status', { status: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    pendingUpdateInfo = info;
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
  // On macOS: use GitHub API directly
  if (process.platform === 'darwin') {
    try {
      const info = await checkGitHubRelease();
      if (info) {
        pendingUpdateInfo = info;
        return { success: true, updateInfo: info };
      }
      return { success: true, updateInfo: null };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
  // On Windows: use electron-updater
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
  // On macOS: download DMG directly (no Squirrel.Mac/ShipIt involved)
  if (process.platform === 'darwin') {
    if (!pendingUpdateInfo) return { success: false, error: 'Kein Update verfügbar' };
    try {
      const version = pendingUpdateInfo.version;
      const dmgFileName = `ZeitBlick-${version}-universal.dmg`;
      const dmgUrl = `https://github.com/Megakongi/zeitblick-releases/releases/download/v${version}/${encodeURIComponent(dmgFileName)}`;
      const dest = path.join(app.getPath('temp'), dmgFileName);

      console.log(`[updater] macOS: downloading DMG from ${dmgUrl}`);
      sendUpdateStatus('update-status', { status: 'downloading', percent: 0 });

      await downloadFile(dmgUrl, dest, (progress) => {
        sendUpdateStatus('update-status', {
          status: 'downloading',
          percent: Math.round(progress.percent),
          transferred: progress.transferred,
          total: progress.total,
        });
      });

      downloadedDmgPath = dest;
      sendUpdateStatus('update-status', {
        status: 'downloaded',
        version,
        releaseNotes: pendingUpdateInfo.releaseNotes || '',
        releaseDate: pendingUpdateInfo.releaseDate || '',
      });
      return { success: true };
    } catch (err) {
      console.error('[updater] macOS DMG download failed:', err.message);
      return { success: false, error: err.message };
    }
  }

  // On Windows: use native electron-updater (NSIS installer)
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

  // On macOS: mount DMG, copy .app, relaunch (bypasses Squirrel/ShipIt)
  if (process.platform === 'darwin' && downloadedDmgPath) {
    const { execSync } = require('child_process');
    sendUpdateStatus('update-status', { status: 'installing', message: 'Update wird installiert...' });

    try {
      // Determine current app location: app.getAppPath() → .app/Contents/Resources/app.asar
      // Go up 3 levels to get the .app bundle
      const appAsarPath = app.getAppPath();
      const currentAppPath = path.resolve(appAsarPath, '..', '..', '..'); // → .app
      console.log(`[updater] Current app: ${currentAppPath}`);
      console.log(`[updater] DMG path: ${downloadedDmgPath}`);

      if (!currentAppPath.endsWith('.app')) {
        throw new Error(`Unerwarteter App-Pfad: ${currentAppPath}`);
      }

      // Write a shell script that waits for the app to quit, then mounts DMG, copies, and relaunches
      const scriptPath = path.join(app.getPath('temp'), 'zeitblick-update.sh');
      const logPath = path.join(app.getPath('temp'), 'zeitblick-update.log');
      const dmgPath = downloadedDmgPath;
      const pid = process.pid;
      const appName = path.basename(currentAppPath, '.app');
      const scriptContent = [
        '#!/bin/bash',
        `LOG="${logPath}"`,
        'exec > "$LOG" 2>&1',
        'echo "=== ZeitBlick Update Script ==="',
        `echo "Started at: $(date)"`,
        `echo "Main PID: ${pid}"`,
        `echo "App path: ${currentAppPath}"`,
        `echo "DMG path: ${dmgPath}"`,
        '',
        '# Wait for the Electron process to fully exit (up to 30s)',
        `PID=${pid}`,
        'for i in $(seq 1 60); do',
        '  if ! kill -0 "$PID" 2>/dev/null; then',
        '    echo "Main process exited after ${i}x0.5s"',
        '    break',
        '  fi',
        '  sleep 0.5',
        'done',
        '',
        '# Also wait for any remaining ZeitBlick helper processes (GPU, Renderer, etc.)',
        'for i in $(seq 1 20); do',
        `  HELPERS=$(pgrep -f "${appName}" 2>/dev/null | grep -v "$$" || true)`,
        '  if [ -z "$HELPERS" ]; then',
        '    echo "All helper processes exited after ${i}x0.5s"',
        '    break',
        '  fi',
        '  echo "Waiting for helpers: $HELPERS"',
        '  sleep 0.5',
        'done',
        '# Extra safety margin',
        'sleep 2',
        '',
        '# Mount the DMG',
        `echo "Mounting DMG: ${dmgPath}"`,
        `if [ ! -f "${dmgPath}" ]; then`,
        '  echo "ERROR: DMG file not found!"',
        '  exit 1',
        'fi',
        `MOUNT_OUTPUT=$(hdiutil attach "${dmgPath}" -nobrowse -noverify -noautoopen 2>&1)`,
        'MOUNT_EXIT=$?',
        'echo "hdiutil exit code: $MOUNT_EXIT"',
        'echo "hdiutil output: $MOUNT_OUTPUT"',
        '',
        '# Extract mount point (last tab-separated field on the /Volumes line)',
        'MOUNT_POINT=$(echo "$MOUNT_OUTPUT" | awk -F\'\\t\' \'/\\/Volumes\\//{print $NF}\' | head -1 | sed \'s/^ *//;s/ *$//\')',
        '',
        'if [ -z "$MOUNT_POINT" ]; then',
        '  echo "ERROR: Failed to find mount point"',
        '  exit 1',
        'fi',
        'echo "Mount point: $MOUNT_POINT"',
        '',
        'APP_IN_DMG="$MOUNT_POINT/ZeitBlick.app"',
        'if [ ! -d "$APP_IN_DMG" ]; then',
        '  hdiutil detach "$MOUNT_POINT" -force 2>/dev/null || true',
        '  echo "ERROR: ZeitBlick.app not found in DMG"',
        '  exit 1',
        'fi',
        'echo "Source app found: $APP_IN_DMG"',
        '',
        '# Remove old app (retry up to 5 times if locked)',
        'REMOVED=false',
        'for attempt in 1 2 3 4 5; do',
        `  if rm -rf "${currentAppPath}" 2>/dev/null; then`,
        '    REMOVED=true',
        '    echo "Old app removed on attempt $attempt"',
        '    break',
        '  fi',
        '  echo "rm -rf failed (attempt $attempt), retrying in 2s..."',
        '  sleep 2',
        'done',
        '',
        'if [ "$REMOVED" != "true" ]; then',
        '  echo "ERROR: Could not remove old app after 5 attempts"',
        '  hdiutil detach "$MOUNT_POINT" -force 2>/dev/null || true',
        '  exit 1',
        'fi',
        '',
        '# Copy new app',
        `echo "Copying new app to ${currentAppPath}..."`,
        `if ! cp -R "$APP_IN_DMG" "${currentAppPath}"; then`,
        '  echo "ERROR: cp -R failed!"',
        '  hdiutil detach "$MOUNT_POINT" -force 2>/dev/null || true',
        '  exit 1',
        'fi',
        '',
        '# Verify the copy',
        `if [ ! -d "${currentAppPath}/Contents/MacOS" ]; then`,
        '  echo "ERROR: Copy verification failed — MacOS directory missing"',
        '  hdiutil detach "$MOUNT_POINT" -force 2>/dev/null || true',
        '  exit 1',
        'fi',
        'echo "Copy verified OK"',
        '',
        '# Remove quarantine attribute so macOS does not block the app',
        `xattr -cr "${currentAppPath}" 2>/dev/null || true`,
        '',
        '# Unmount DMG',
        'hdiutil detach "$MOUNT_POINT" -force 2>/dev/null || true',
        'echo "DMG unmounted"',
        '',
        '# Clean up DMG',
        `rm -f "${dmgPath}"`,
        '',
        '# Relaunch',
        `echo "Relaunching: ${currentAppPath}"`,
        `open -a "${currentAppPath}"`,
        'OPEN_EXIT=$?',
        'echo "open exit code: $OPEN_EXIT"',
        '',
        'if [ $OPEN_EXIT -ne 0 ]; then',
        '  echo "open -a failed, trying open directly..."',
        `  open "${currentAppPath}"`,
        'fi',
        '',
        `echo "Update complete at: $(date)"`,
        '',
        '# Clean up script itself',
        `rm -f "${scriptPath}"`,
      ].join('\n');
      fs.writeFileSync(scriptPath, scriptContent, { mode: 0o755 });
      console.log(`[updater] Update script written to: ${scriptPath}`);

      // Launch the update script via nohup to ensure it survives parent exit
      const logFd = fs.openSync(logPath, 'w');
      const child = require('child_process').spawn('/usr/bin/nohup', ['/bin/bash', scriptPath], {
        detached: true,
        stdio: ['ignore', logFd, logFd],
      });
      child.unref();
      fs.closeSync(logFd);

      // Quit the app so the script can replace it
      downloadedDmgPath = null;
      setTimeout(() => {
        app.quit();
      }, 500);

      return { success: true, autoInstall: true };
    } catch (err) {
      console.error('[updater] macOS install failed:', err.message);
      sendUpdateStatus('update-status', { status: 'error', message: `Installation fehlgeschlagen: ${err.message}` });
      return { success: false, error: err.message };
    }
  }

  if (!autoUpdater) return { success: false };

  // On Windows: use native quitAndInstall (NSIS installer)
  sendUpdateStatus('update-status', { status: 'installing', message: 'Update wird installiert...' });
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
    const { BrowserWindow: BW } = require('electron');
    const os = require('os');
    const printWin = new BW({ show: false, width: 800, height: 600, webPreferences: { offscreen: true } });
    const tmpFile = path.join(os.tmpdir(), `zeitblick-pdf-${Date.now()}.html`);
    fs.writeFileSync(tmpFile, htmlContent, 'utf-8');
    try {
    await printWin.loadFile(tmpFile);
    await new Promise(r => setTimeout(r, 600));
    const pdfData = await printWin.webContents.printToPDF({
      printBackground: true,
      landscape: true,
      scale: 0.8,
      margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 },
    });
    try { fs.unlinkSync(tmpFile); } catch (_) {}
    fs.writeFileSync(result.filePath, pdfData);
    return { success: true, filePath: result.filePath };
    } finally {
      printWin.close();
    }
  } catch (error) {
    console.error('PDF export error:', error);
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
    const os = require('os');
    const printWin = new BW({ show: false, width: 1200, height: 800, webPreferences: { offscreen: true } });
    const tmpFile = path.join(os.tmpdir(), `zeitblick-pdf-${Date.now()}.html`);
    fs.writeFileSync(tmpFile, htmlContent, 'utf-8');
    try {
    await printWin.loadFile(tmpFile);
    await new Promise(r => setTimeout(r, 800));
    const pdfData = await printWin.webContents.printToPDF({
      printBackground: true,
      landscape: true,
      scale: 0.75,
      margins: { top: 0.4, bottom: 0.4, left: 0.5, right: 0.5 },
    });
    try { fs.unlinkSync(tmpFile); } catch (_) {}
    fs.writeFileSync(result.filePath, pdfData);
    return { success: true, filePath: result.filePath };
    } finally {
      printWin.close();
    }
  } catch (error) {
    console.error('PDF export error:', error);
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
    const os = require('os');
    for (const item of htmlContentArray) {
      const fname = item.filename || item.name || 'export.pdf';
      const printWin = new BW({ show: false, width: 1200, height: 800, webPreferences: { offscreen: true } });
      // Write HTML to temp file to avoid data-URL size limits
      const tmpFile = path.join(os.tmpdir(), `zeitblick-pdf-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
      fs.writeFileSync(tmpFile, item.html, 'utf-8');
      try {
      await printWin.loadFile(tmpFile);
      await new Promise(r => setTimeout(r, 800));
      const pdfData = await printWin.webContents.printToPDF({
        printBackground: true, landscape: true, scale: 0.75,
        margins: { top: 0.4, bottom: 0.4, left: 0.5, right: 0.5 },
      });
      try { fs.unlinkSync(tmpFile); } catch (_) {}
      const filePath = path.join(folderPath, fname);
      fs.writeFileSync(filePath, pdfData);
      results.push({ success: true, filename: fname });
      } finally {
        printWin.close();
      }
    }
    return { success: true, count: results.length, folder: folderPath };
  } catch (error) {
    console.error('Batch PDF export error:', error);
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

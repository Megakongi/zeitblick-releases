const { app, BrowserWindow, ipcMain, dialog, shell, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const { parsePDF } = require('./src/main/pdfParser');
const { parseBillingPDF, isEncryptedPDF, parseSesamTimesheetPDF, parseSesamTimesheetData } = require('./src/main/billingParser');
const { loadData, saveData, createBackup, restoreBackup, listBackups, exportData, importData } = require('./src/main/storage');
const { extractDispoAddresses } = require('./src/main/dispoText');
const { computeDistance } = require('./src/main/geo');
const { buildStdWebFillScript, buildStdWebDiagnoseScript, buildStdWebNavigateScript, buildStdWebLoginScript, buildStdWebLogoutScript } = require('./src/main/stdwebFill');

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

/** Fetch a small text file over HTTP(S), following redirects. */
function fetchText(url, depth = 0) {
  return new Promise((resolve, reject) => {
    if (depth > 5) return reject(new Error('Too many redirects'));
    const proto = url.startsWith('https') ? require('https') : require('http');
    proto.get(url, { headers: { 'User-Agent': 'ZeitBlick-Updater' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        resolve(fetchText(res.headers.location, depth + 1));
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

/** Compute the sha512 (base64) of a file — matches electron-builder's format. */
function sha512Base64(filePath) {
  return new Promise((resolve, reject) => {
    const hash = require('crypto').createHash('sha512');
    const stream = fs.createReadStream(filePath);
    stream.on('data', d => hash.update(d));
    stream.on('end', () => resolve(hash.digest('base64')));
    stream.on('error', reject);
  });
}

/** Extract the sha512 for a given file from electron-builder's latest-mac.yml */
function extractSha512FromYml(ymlText, fileName) {
  const lines = ymlText.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('url:') && lines[i].includes(fileName)) {
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        const m = lines[j].match(/sha512:\s*(\S+)/);
        if (m) return m[1];
        if (lines[j].includes('url:')) break;
      }
    }
  }
  return null;
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
      // Aktiviert Chromiums internen PDF-Viewer, damit Dispo-PDFs im iframe
      // (blob:-URL) angezeigt werden können.
      plugins: true,
    },
  });

  // In dev, load from Vite dev server
  const isDev = !app.isPackaged;

  // Set Content-Security-Policy for the main window session
  const scriptSrc = isDev
    ? "'self' 'unsafe-eval' 'unsafe-inline'"  // Vite HMR + react-refresh require eval/inline in dev
    : "'self'";
  const connectSrc = isDev
    ? "'self' ws://localhost:5173 http://localhost:5173"
    : "'self'";
  const csp = [
    `default-src 'self'`,
    `script-src ${scriptSrc}`,
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    `font-src 'self' https://fonts.gstatic.com`,
    `img-src 'self' data: file: blob:`,
    `connect-src ${connectSrc}`,
    // Dispo-PDFs werden als blob:-URL in einem iframe angezeigt; ohne frame-src
    // fällt die Policy auf default-src 'self' zurück und blockiert das blob:-iframe.
    `frame-src 'self' blob:`,
    `object-src 'none'`,
    `base-uri 'self'`,
  ].join('; ');

  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });

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

// ── Billing password storage ──────────────────────────────────────────────────
// Passwords are encrypted with Electron's safeStorage (OS keychain).
// Patterns are plain JSON (no secrets — just format strings like "Sesam{MM}{YYYY}").

function getBillingPasswordsPath() {
  return path.join(app.getPath('userData'), 'billing-passwords.enc');
}
function getBillingPatternsPath() {
  return path.join(app.getPath('userData'), 'billing-patterns.json');
}

function loadBillingPasswords() {
  try {
    const filePath = getBillingPasswordsPath();
    if (!fs.existsSync(filePath)) return {};
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (!safeStorage.isEncryptionAvailable()) return {};
    const result = {};
    for (const [prod, enc] of Object.entries(raw)) {
      try {
        result[prod] = safeStorage.decryptString(Buffer.from(enc, 'base64'));
      } catch (e) {
        console.error('[billing] Passwort für Produktion nicht entschlüsselbar (Keychain-Schlüssel geändert?):', prod, e.message);
        result[prod] = null; // explizit markieren, damit die UI warnen kann
      }
    }
    return result;
  } catch { return {}; }
}

function saveBillingPasswords(passwords) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Keychain-Verschlüsselung nicht verfügbar – Passwort kann nicht sicher gespeichert werden');
  }
  try {
    const toSave = {};
    for (const [prod, pw] of Object.entries(passwords)) {
      if (pw == null) continue; // null-Einträge (nicht entschlüsselbar) nicht zurückschreiben
      toSave[prod] = safeStorage.encryptString(String(pw)).toString('base64');
    }
    fs.writeFileSync(getBillingPasswordsPath(), JSON.stringify(toSave, null, 2), 'utf-8');
  } catch (e) {
    throw new Error(`Billing-Passwörter konnten nicht gespeichert werden: ${e.message}`);
  }
}

function loadBillingPatterns() {
  try {
    const f = getBillingPatternsPath();
    return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf-8')) : {};
  } catch { return {}; }
}

function saveBillingPatterns(patterns) {
  try {
    fs.writeFileSync(getBillingPatternsPath(), JSON.stringify(patterns, null, 2), 'utf-8');
  } catch (e) { console.error('[billing] save patterns failed:', e.message); }
}

// Expand pattern placeholders ({MM}, {YYYY}, {YY}, {DD}) with the given date
function expandPattern(pattern, dateStr) {
  // dateStr = "dd.mm.yyyy" or "mm.yyyy" or null
  let dd = '', mm = '', yyyy = '', yy = '';
  if (dateStr) {
    const parts = dateStr.split('.');
    if (parts.length >= 3) { dd = parts[0].padStart(2, '0'); mm = parts[1].padStart(2, '0'); yyyy = parts[2]; yy = yyyy.slice(-2); }
    else if (parts.length === 2) { mm = parts[0].padStart(2, '0'); yyyy = parts[1]; yy = yyyy.slice(-2); }
  }
  return pattern
    .replace(/\{DD\}/g, dd)
    .replace(/\{MM\}/g, mm)
    .replace(/\{YYYY\}/g, yyyy)
    .replace(/\{JJJJ\}/g, yyyy)
    .replace(/\{YY\}/g, yy)
    .replace(/\{JJ\}/g, yy);
}

// IPC: Billing password management
ipcMain.handle('get-billing-passwords', () => loadBillingPasswords());
ipcMain.handle('save-billing-password', (event, production, password) => {
  if (typeof production !== 'string' || !production.trim()) return { success: false, error: 'Ungültiger Produktionsname' };
  if (typeof password !== 'string' || !password) return { success: false, error: 'Ungültiges Passwort' };
  if (production.length > 200 || password.length > 500) return { success: false, error: 'Eingabe zu lang' };
  try {
    const pw = loadBillingPasswords();
    pw[production] = password;
    saveBillingPasswords(pw);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});
ipcMain.handle('delete-billing-password', (event, production) => {
  if (typeof production !== 'string' || !production.trim()) return { success: false, error: 'Ungültiger Produktionsname' };
  try {
    const pw = loadBillingPasswords();
    delete pw[production];
    saveBillingPasswords(pw);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('get-billing-patterns', () => loadBillingPatterns());
ipcMain.handle('save-billing-pattern', (event, production, pattern) => {
  const p = loadBillingPatterns();
  p[production] = pattern;
  saveBillingPatterns(p);
  return { success: true };
});
ipcMain.handle('delete-billing-pattern', (event, production) => {
  const p = loadBillingPatterns();
  delete p[production];
  saveBillingPatterns(p);
  return { success: true };
});

// IPC: Open file dialog for billing PDFs
ipcMain.handle('open-billing-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'PDF Abrechnungen', extensions: ['pdf'] }],
    title: 'Abrechnungs-PDFs auswählen',
  });
  return result.filePaths || [];
});

// IPC: Import billing PDFs with optional passwords.
// passwordMap: { [filePath]: 'password' } — renderer supplies passwords for encrypted files.
// patternDate: optional date string ("dd.mm.yyyy") for pattern expansion.
ipcMain.handle('import-billing-pdf', async (event, filePaths, passwordMap, patternDate) => {
  const storedPasswords = loadBillingPasswords();
  const patterns = loadBillingPatterns();
  const results = [];

  for (const filePath of filePaths) {
    const filename = path.basename(filePath);

    // Quick file-access check before attempting to parse
    try { fs.accessSync(filePath, fs.constants.R_OK); } catch (e) {
      results.push({ success: false, error: `Datei nicht lesbar: ${e.message}`, filePath, filename });
      continue;
    }

    // Detect encryption — reads first + last 128 KB
    const encrypted = isEncryptedPDF(filePath);

    // Determine which password to try
    // Priority: 1) explicit from renderer, 2) stored password, 3) pattern expansion
    let password = (passwordMap && passwordMap[filePath]) || null;

    if (!password) {
      // Try stored passwords: match any key that appears in the filename
      const exactKey = Object.keys(storedPasswords).find(k => filename.toLowerCase().includes(k.toLowerCase()));
      if (exactKey) password = storedPasswords[exactKey];
    }

    if (!password) {
      // Try pattern expansion for any production whose pattern matches the filename
      const patternKey = Object.keys(patterns).find(k => filename.toLowerCase().includes(k.toLowerCase()));
      if (patternKey) {
        const dateStr = patternDate || new Date().toISOString().slice(0, 10);
        password = expandPattern(patterns[patternKey], dateStr);
      }
    }

    try {
      // Always attempt to parse — even encrypted PDFs may have an empty user password
      // (owner-only encryption for print/copy protection) and succeed without any password.
      // If a stored password is available, try it first; on failure retry without password.
      // Only if both fail do we surface the password dialog to the user.
      let data;
      let usedPassword = !!password;
      try {
        data = await parseBillingPDF(filePath, password || null);
      } catch (innerErr) {
        if (innerErr.code === 'ENCRYPTED' && password) {
          // Stored password wrong — try with no password (handles owner-only encrypted PDFs)
          data = await parseBillingPDF(filePath, null);
          usedPassword = false;
        } else {
          throw innerErr;
        }
      }

      // Copy PDF into iCloud ZeitBlick/Abrechnungen/<year>/
      let savedPath = null;
      try {
        const icloudBase = path.join(
          app.getPath('home'),
          'Library', 'Mobile Documents', 'com~apple~CloudDocs', 'ZeitBlick', 'Abrechnungen'
        );
        // Determine year from parsed data or filename
        const firstEntry = (data.entries && data.entries[0]) || data;
        const year = (() => {
          const d = firstEntry.datum || firstEntry.zeitraumBis || firstEntry.zeitraumVon || '';
          const m = d.match(/(\d{4})$/);
          return m ? m[1] : String(new Date().getFullYear());
        })();
        const destDir = path.join(icloudBase, year);
        fs.mkdirSync(destDir, { recursive: true });
        // Avoid overwriting: append counter if needed
        let destName = filename;
        let dest = path.join(destDir, destName);
        if (fs.existsSync(dest) && fs.realpathSync(dest) !== fs.realpathSync(filePath)) {
          const ext = path.extname(filename);
          const base = path.basename(filename, ext);
          let i = 2;
          while (fs.existsSync(path.join(destDir, `${base}_${i}${ext}`))) i++;
          destName = `${base}_${i}${ext}`;
          dest = path.join(destDir, destName);
        }
        if (!fs.existsSync(dest)) fs.copyFileSync(filePath, dest);
        savedPath = dest;
      } catch (_) { /* iCloud not available or no write permission — silently skip */ }

      // Push one result per billing entry (multi-page PDFs may contain several)
      const entries = data.entries || [data];
      for (let ei = 0; ei < entries.length; ei++) {
        results.push({ success: true, filePath, filename, data: entries[ei], usedPassword, savedPath: ei === 0 ? savedPath : null });
      }
    } catch (err) {
      if (err.code === 'ENCRYPTED') {
        results.push({ success: false, encrypted: true, filePath, filename, wrongPassword: !!password });
      } else {
        results.push({ success: false, error: err.message, filePath, filename });
      }
    }
  }
  return results;
});

// IPC: Copy an already-imported billing PDF into the iCloud folder (e.g. for mail-drag imports)
ipcMain.handle('save-billing-pdf-to-icloud', async (event, sourcePath, datum) => {
  if (!sourcePath) return { success: false, error: 'Kein Quellpfad angegeben' };
  try {
    fs.accessSync(sourcePath, fs.constants.R_OK);
  } catch (e) {
    return { success: false, error: `Quelldatei nicht mehr erreichbar: ${e.message}` };
  }
  try {
    const icloudBase = path.join(
      app.getPath('home'),
      'Library', 'Mobile Documents', 'com~apple~CloudDocs', 'ZeitBlick', 'Abrechnungen'
    );
    const year = (() => {
      const m = (datum || '').match(/(\d{4})$/);
      return m ? m[1] : String(new Date().getFullYear());
    })();
    const destDir = path.join(icloudBase, year);
    fs.mkdirSync(destDir, { recursive: true });
    const filename = path.basename(sourcePath);
    const ext = path.extname(filename);
    const base = path.basename(filename, ext);
    let dest = path.join(destDir, filename);
    let i = 2;
    while (fs.existsSync(dest)) {
      // Skip if it's literally the same file already there
      try { if (fs.realpathSync(dest) === fs.realpathSync(sourcePath)) return { success: true, savedPath: dest }; } catch (_) {}
      dest = path.join(destDir, `${base}_${i}${ext}`);
      i++;
    }
    fs.copyFileSync(sourcePath, dest);
    return { success: true, savedPath: dest };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// IPC: Open file dialog for Sesam Stundenzettel PDFs
ipcMain.handle('open-sesam-timesheet-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'PDF Stundenzettel', extensions: ['pdf'] }],
    title: 'Sesam Stundenzettel-PDFs auswählen',
  });
  return result.filePaths || [];
});

// IPC: Import Sesam Stundenzettel PDFs
ipcMain.handle('import-sesam-timesheet', async (event, filePaths, passwordMap = {}) => {
  const results = [];
  for (const filePath of filePaths) {
    const filename = path.basename(filePath);
    try { fs.accessSync(filePath, fs.constants.R_OK); } catch (e) {
      results.push({ success: false, error: `Datei nicht lesbar: ${e.message}`, filePath, filename });
      continue;
    }
    const encrypted = isEncryptedPDF(filePath);
    const password = passwordMap[filePath] || null;
    if (encrypted && !password) {
      results.push({ success: false, encrypted: true, filePath, filename });
      continue;
    }
    try {
      const data = await parseSesamTimesheetPDF(filePath, password || null);
      results.push({ success: true, filePath, filename, data });
    } catch (err) {
      if (err.code === 'ENCRYPTED') {
        results.push({ success: false, encrypted: true, filePath, filename, wrongPassword: !!password });
      } else {
        results.push({ success: false, error: err.message, filePath, filename });
      }
    }
  }
  return results;
});

// IPC: OCR a fully-graphical Sesam PDF using the bundled Swift ocr-helper binary
ipcMain.handle('sesam-ocr-timesheet', async (event, filePath) => {
  try {
    // Locate ocr-helper binary (packaged vs. dev)
    const ocrBin = app.isPackaged
      ? path.join(process.resourcesPath, 'ocr-helper')
      : path.join(__dirname, 'scripts', 'build', 'ocr-helper');

    if (!fs.existsSync(ocrBin)) {
      return { success: false, error: 'ocr-helper binary nicht gefunden. Bitte App neu builden.' };
    }
    // Make sure it is executable
    try { fs.chmodSync(ocrBin, 0o755); } catch (_) {}

    // Run OCR on every page (stop at first page that errors)
    const { execFile } = require('child_process');
    function runPage(pageNum) {
      return new Promise((resolve) => {
        execFile(ocrBin, [filePath, String(pageNum)], { timeout: 30000 }, (err, stdout) => {
          if (!stdout || !stdout.trim()) { resolve(null); return; }
          try { resolve(JSON.parse(stdout)); }
          catch { resolve(null); }
        });
      });
    }

    // Reconstruct readable text from word-level OCR items
    function ocrToText(items) {
      if (!items || items.length === 0) return '';
      const rows = [];
      for (const item of items) {
        let placed = false;
        for (const row of rows) {
          if (Math.abs(row.y - item.y) < 1.5) {
            row.items.push(item);
            row.y = (row.y * (row.items.length - 1) + item.y) / row.items.length;
            placed = true;
            break;
          }
        }
        if (!placed) rows.push({ y: item.y, items: [item] });
      }
      rows.sort((a, b) => a.y - b.y);
      return rows.map(row => {
        row.items.sort((a, b) => a.x - b.x);
        return row.items.map(i => i.text).join(' ');
      }).join('\n');
    }

    const pages = [];
    for (let p = 0; p < 10; p++) {
      const res = await runPage(p);
      if (!res || res.error) break;
      pages.push(ocrToText(res.items));
    }

    if (pages.length === 0) {
      return { success: false, error: 'OCR lieferte keine Ergebnisse. Seite leer oder nicht unterstützt.' };
    }

    const fullText = pages.join('\n\n');
    const filename = path.basename(filePath);

    // Convert "HH:MM" duration string or "HH,MM" decimal to decimal hours
    function parseDuration(s) {
      if (!s) return 0;
      const str = String(s).trim();
      if (str.includes(':')) {
        const [h, m] = str.split(':').map(Number);
        return (h || 0) + (m || 0) / 60;
      }
      return parseFloat(str.replace(',', '.')) || 0;
    }

    // OCR-specific parser — handles merged/split column artifacts from Vision OCR
    function parseOcrSesam(text, fname) {
      const result = { type: 'arbeitszeiterfassung' };

      // Name: "Arbeitszeiterfassung (Lastname, Firstname (...))"
      const azM = text.match(/Arbeitszeiterfassung\s+\(([^,(]+),\s*([^,(]+?)(?:\s*\([^)]*\))?\s*\)/);
      if (azM) result.name = `${azM[2].trim()} ${azM[1].trim()}`;

      // Project: OCR merges two columns → "SESAM-Lohn: Lizenz: 2026 UFA Fiction PDM2193 GmbH Herkunft"
      // Take tokens after the contract number, skip known company suffixes
      const projM = text.match(/SESAM-Lohn\s*:.*?(?:PDM|FLM|SER|DOK|RPM)\d+\s+(.+?)(?:\n|$)/);
      if (projM) {
        const skipWords = new Set(['GmbH','AG','UG','KG','GbR','Ltd','Film','Fernsehen','Filmproduktion','Television','Studios','Media']);
        const words = projM[1].trim().split(/\s+/).filter(w => !skipWords.has(w));
        result.projekt = words.join(' ').trim() || projM[1].trim();
      }

      // Firma: standalone "Lizenz: ..." line (not the merged SESAM-Lohn line)
      for (const lm of text.matchAll(/Lizenz\s*:\s*(.+?)(?:\n|•|$)/g)) {
        if (!/SESAM-Lohn/i.test(lm[0])) {
          result.firma = lm[1].trim().replace(/\s+/g, ' ');
          result.produktionsfirma = result.firma;
          break;
        }
      }

      // Approvals: OCR merges two columns into one line:
      // "GENEHMIGT GENEHMIGT (FREIGABE (FREIGABE PERSON1: PERSON2: DD.MM.YYYY DD.MM.YYYY / HH:MM) / HH:MM)"
      // Strategy: collect all person names, all dates, all times from GENEHMIGT lines, then zip.
      const approvals = [];
      const genLines = text.split('\n').filter(l => /GENEHMIGT|FREIGABE/.test(l));
      const genText = genLines.join(' ');
      // All-caps names with colon in approval lines, skip known non-person keywords
      const skipNames = new Set(['FREIGABE','GENEHMIGT','SESAM','KW','PDM','FLM','DOK']);
      const personMatches = [...genText.matchAll(/([A-ZÄÖÜ][A-ZÄÖÜ\-]{2,}):/g)]
        .map(m => m[1])
        .filter(p => !skipNames.has(p));
      const dateMatches   = [...genText.matchAll(/(\d{2}\.\d{2}\.\d{4})/g)].map(m => m[1]);
      const timeMatches   = [...genText.matchAll(/[\/|]\s*(\d{2}:\d{2})/g)].map(m => m[1]);
      const count = Math.min(personMatches.length, dateMatches.length, timeMatches.length);
      for (let i = 0; i < count; i++) {
        approvals.push({ person: personMatches[i], datum: dateMatches[i], uhrzeit: timeMatches[i] });
      }
      result.approvals = approvals;

      // Day rows with time-based entries:
      // "Do, 30.04.2026 08:15 19:30 00:45 10:00 10,50 0,50 0,13"
      // Pause and Reisezeit can appear as HH:MM or decimal
      const dayRe = /(?:Mo|Di|Mi|Do|Fr|Sa|So),?\s+(\d{2}\.\d{2}\.\d{4})\s+(\d{1,2}:\d{2})\s+(\d{1,2}:\d{2})\s+([\d:,]+)\s+([\d:,]+)\s+([\d:,]+)(?:\s+([\d:,]+))?/g;
      const days = [];
      const DOW_LABEL = ['So','Mo','Di','Mi','Do','Fr','Sa'];
      let dm;
      while ((dm = dayRe.exec(text)) !== null) {
        const dp = dm[1].split('.');
        let y = parseInt(dp[2]); if (y < 100) y = 2000 + y;
        const datum = `${dp[0]}.${dp[1]}.${y}`;
        const wochentag = DOW_LABEL[new Date(y, parseInt(dp[1]) - 1, parseInt(dp[0])).getDay()];
        days.push({
          datum,
          wochentag,
          arbeitsbeginn: dm[2],
          arbeitsende:   dm[3],
          pausendauer:   parseDuration(dm[4]),
          reisezeit:     parseDuration(dm[5]),
          arbeitszeit:   parseDuration(dm[6]),
          ueberstunden:  parseDuration(dm[7]),
          beschreibung:  '',
        });
      }

      // Fallback: day-label rows "Do: EFK" (Arbeitszeiterfassung style)
      if (days.length === 0) {
        const entryRe = /^(Mo|Di|Mi|Do|Fr|Sa|So)\s*:\s*(.+)$/mg;
        const DOW_DE = { Mo:1, Di:2, Mi:3, Do:4, Fr:5, Sa:6, So:0 };
        const filenameDate = fname.match(/(\d{2})(\d{2})(\d{2})(?:\.|$)/);
        let cursor = filenameDate
          ? new Date(2000 + parseInt(filenameDate[3]), parseInt(filenameDate[2]) - 1, parseInt(filenameDate[1]))
          : null;
        let em;
        while ((em = entryRe.exec(text)) !== null) {
          const { dow, beschreibung } = { dow: em[1], beschreibung: em[2].trim() };
          const targetDow = DOW_DE[dow];
          if (targetDow === undefined) continue;
          if (cursor) {
            while (cursor.getDay() !== targetDow) cursor.setDate(cursor.getDate() + 1);
            const dd = String(cursor.getDate()).padStart(2,'0');
            const mm = String(cursor.getMonth()+1).padStart(2,'0');
            days.push({ datum: `${dd}.${mm}.${cursor.getFullYear()}`, wochentag: dow, beschreibung });
            cursor = new Date(cursor); cursor.setDate(cursor.getDate() + 1);
          } else {
            days.push({ datum: null, wochentag: dow, beschreibung });
          }
        }
      }

      result.days = days;
      return result;
    }

    const data = parseOcrSesam(fullText, filename);
    return { success: true, data, filename };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

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

      // Verify integrity against electron-builder's published latest-mac.yml.
      // Fails hard on checksum mismatch; skips gracefully if the yml is missing
      // (older releases) so updates don't break entirely.
      try {
        const ymlUrl = `https://github.com/Megakongi/zeitblick-releases/releases/download/v${version}/latest-mac.yml`;
        const yml = await fetchText(ymlUrl);
        const expected = extractSha512FromYml(yml, dmgFileName);
        if (expected) {
          const actual = await sha512Base64(dest);
          if (actual !== expected) {
            try { fs.unlinkSync(dest); } catch (_) {}
            throw new Error('CHECKSUM_MISMATCH');
          }
          console.log('[updater] DMG sha512 verified OK');
        } else {
          console.warn('[updater] No sha512 entry for', dmgFileName, 'in latest-mac.yml');
        }
      } catch (verifyErr) {
        if (verifyErr.message === 'CHECKSUM_MISMATCH') {
          const msg = 'Update abgebrochen: Die heruntergeladene Datei ist beschädigt oder wurde manipuliert (Checksumme stimmt nicht).';
          sendUpdateStatus('update-status', { status: 'error', message: msg });
          return { success: false, error: msg };
        }
        console.warn('[updater] Checksum verification skipped:', verifyErr.message);
      }

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
      // Surface the failure to the renderer so the UI doesn't stay stuck at
      // "downloading 0%". A 404 here usually means no macOS build was published
      // for this release (CI currently only builds Windows).
      const isMissing = /HTTP 404/.test(err.message || '');
      const msg = isMissing
        ? `Für macOS wurde für Version ${pendingUpdateInfo.version} kein Update veröffentlicht. Bitte später erneut versuchen oder manuell von GitHub laden.`
        : `Download fehlgeschlagen: ${err.message}`;
      sendUpdateStatus('update-status', { status: 'error', message: msg });
      return { success: false, error: msg };
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

  const resolvedRoot = fs.realpathSync(folderPath);
  function scanDir(dir) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        // Resolve symlinks and ensure path stays within selected folder
        let resolvedPath;
        try { resolvedPath = fs.realpathSync(fullPath); } catch (_) { continue; }
        if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(resolvedRoot + path.sep)) continue;
        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
          pdfFiles.push(resolvedPath);
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
  return saveData(data);
});

// Synchronous save — used by the renderer in beforeunload to flush
// pending (debounced) changes before the window closes / app quits
ipcMain.on('save-data-sync', (event, data) => {
  event.returnValue = saveData(data);
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
    // Reuse a single BrowserWindow for all PDFs to avoid overhead
    const printWin = new BW({ show: false, width: 1200, height: 800, webPreferences: { offscreen: true } });
    try {
      for (const item of htmlContentArray) {
        const fname = item.filename || item.name || 'export.pdf';
        const tmpFile = path.join(os.tmpdir(), `zeitblick-pdf-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
        fs.writeFileSync(tmpFile, item.html, 'utf-8');
        await printWin.loadFile(tmpFile);
        await new Promise(r => setTimeout(r, 400));
        const pdfData = await printWin.webContents.printToPDF({
          printBackground: true, landscape: true, scale: 0.75,
          margins: { top: 0.4, bottom: 0.4, left: 0.5, right: 0.5 },
        });
        try { fs.unlinkSync(tmpFile); } catch (_) {}
        const filePath = path.join(folderPath, fname);
        fs.writeFileSync(filePath, pdfData);
        results.push({ success: true, filename: fname });
      }
    } finally {
      printWin.close();
    }
    return { success: true, count: results.length, folder: folderPath };
  } catch (error) {
    console.error('Batch PDF export error:', error);
    return { success: false, error: error.message, exported: results.length };
  }
});

// ===== Excel Export =====

// ===== n8n Integration =====

/**
 * Parst eine einfache Klartext-Zeitdatei.
 * Format pro Zeile: DD.MM[.YYYY] HH:MM-HH:MM [Pause]
 * Beispiel: "05.06 8:00-18:45" oder "05.06.2026 8:00-18:45 0.5"
 * Projekt wird aus dem Dateinamen gelesen: "Zeiten <Projekt>.txt" → "<Projekt>"
 */
function parsePlainTextZeiten(raw, filename) {
  const year = new Date().getFullYear();
  const base = path.basename(filename, path.extname(filename));
  const zeitenMatch = base.match(/^Zeiten\s+(.+)$/i);
  const projekt = zeitenMatch ? zeitenMatch[1].trim() : base.trim();
  const pad = n => String(n).padStart(2, '0');
  const normTime = t => { const [h, mi] = t.split(':'); return `${pad(+h)}:${mi}`; };
  const tage = [];
  for (const line of raw.split('\n')) {
    const l = line.trim();
    if (!l || l.startsWith('#')) continue;
    const m = l.match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?\s+(\d{1,2}:\d{2})-(\d{1,2}:\d{2})(?:\s+([\d.,]+))?/);
    if (!m) continue;
    const [, d, mo, yr, start, ende, pauseStr] = m;
    const y = yr ? (yr.length === 2 ? '20' + yr : yr) : String(year);
    const datum = `${pad(+d)}.${pad(+mo)}.${y}`;
    const pause = pauseStr ? parseFloat(pauseStr.replace(',', '.')) : 0.75;
    tage.push({ datum, team: { start: normTime(start), ende: normTime(ende), pause } });
  }
  if (tage.length === 0) return null;
  return { typ: 'zeiten', projekt, tage };
}

function parsePlainTextZusatzVertretung(raw, filename) {
  // Erkennt Dateien wie "<Projekt>_Zusatzpersonal.txt", "<Projekt>_Zusatz.txt"
  // oder "<Projekt>_Vertretung.txt". Der Basename wird getrimmt, da Dateinamen
  // (z. B. aus n8n/Cloud-Sync) versehentlich Zeilenumbrüche enthalten können.
  // Ein optionaler Kopie-Suffix nach dem Schlüsselwort wird toleriert, z. B.
  // "PM_Zusatz -2", "PM_Zusatz (2)", "PM_Zusatz Kopie", "PM_Zusatz copy 2"
  // (entsteht beim Duplizieren durch Finder/iCloud/n8n).
  const COPY = String.raw`(?:[\s_-]*(?:\(\d+\)|kopie|copy|\d+))*`;
  const base = path.basename(filename, path.extname(filename)).trim();
  const zusatzMatch = base.match(new RegExp(`^(.+?)_Zusatz(?:personal)?${COPY}\\s*$`, 'i'));
  const vertretungMatch = base.match(new RegExp(`^(.+?)_Vertretung${COPY}\\s*$`, 'i'));
  if (!zusatzMatch && !vertretungMatch) return null;
  const typ = zusatzMatch ? 'zusatzpersonal' : 'vertretung';
  const projekt = (zusatzMatch || vertretungMatch)[1].trim();
  const personen = [];
  for (const line of raw.split('\n')) {
    const l = line.trim();
    if (!l || l.startsWith('#')) continue;
    const parts = l.split(';').map(p => p.trim());
    if (parts.length < 2) continue;
    const name = parts[0];
    if (!name) continue;
    // Letzter Teil immer Datumsangaben, optionaler mittlerer Teil = Position
    const datesRaw = parts[parts.length - 1];
    const position = parts.length >= 3 ? parts[1] : '';
    const zeitraeume = datesRaw.split(/,\s*/).map(d => d.trim()).filter(Boolean);
    if (zeitraeume.length === 0) continue;
    personen.push({ name, position, zeitraeume });
  }
  if (personen.length === 0) return null;
  return { typ, projekt, personen };
}

function getDefaultN8NFolder() {
  return path.join(app.getPath('home'), 'Library', 'Mobile Documents', 'com~apple~CloudDocs', 'ZeitBlick');
}

let n8nWatcher = null;
let n8nWatchDebounce = null;

function startN8NWatch(folder) {
  try {
    if (n8nWatcher) { try { n8nWatcher.close(); } catch (_) {} n8nWatcher = null; }
    if (!folder || !fs.existsSync(folder)) return { success: false, error: 'Ordner nicht gefunden' };
    n8nWatcher = fs.watch(folder, { persistent: false }, (eventType, filename) => {
      if (filename) {
        const lower = filename.toLowerCase();
        if (!lower.endsWith('.txt') && !lower.endsWith('.json') && !lower.endsWith('.pdf')) return;
      }
      if (n8nWatchDebounce) clearTimeout(n8nWatchDebounce);
      n8nWatchDebounce = setTimeout(() => {
        sendUpdateStatus('n8n-files-changed', { folder });
      }, 1000);
    });
    return { success: true };
  } catch (e) {
    console.error('[n8n] watch failed:', e.message);
    return { success: false, error: e.message };
  }
}

ipcMain.handle('get-default-n8n-folder', () => getDefaultN8NFolder());

ipcMain.handle('n8n-watch', (event, folder) => startN8NWatch(folder));

// ===== Dispos-Ordner-Watcher =====
let dispoWatcher = null;
let dispoWatchDebounce = null;

function startDispoWatch(folder) {
  try {
    if (dispoWatcher) { try { dispoWatcher.close(); } catch (_) {} dispoWatcher = null; }
    const base = folder || getDefaultN8NFolder();
    const dir = (() => {
      const sub = path.join(base, 'Dispos');
      try { if (fs.existsSync(sub) && fs.statSync(sub).isDirectory()) return sub; } catch (_) {}
      return base;
    })();
    if (!dir || !fs.existsSync(dir)) return { success: false, error: 'Ordner nicht gefunden' };
    dispoWatcher = fs.watch(dir, { persistent: false, recursive: true }, (eventType, filename) => {
      if (filename && !filename.toLowerCase().endsWith('.pdf')) return;
      if (dispoWatchDebounce) clearTimeout(dispoWatchDebounce);
      dispoWatchDebounce = setTimeout(() => {
        sendUpdateStatus('dispo-files-changed', { folder });
      }, 1500);
    });
    return { success: true };
  } catch (e) {
    console.error('[dispo] watch failed:', e.message);
    return { success: false, error: e.message };
  }
}

ipcMain.handle('dispo-watch', (event, folder) => startDispoWatch(folder));

ipcMain.handle('n8n-scan', async (event, folder) => {
  try {
    const dir = folder || getDefaultN8NFolder();
    if (!fs.existsSync(dir)) return { success: false, error: 'Ordner nicht gefunden', entries: [], errors: [] };
    const files = fs.readdirSync(dir).filter(f => {
      const l = f.toLowerCase();
      return l.endsWith('.txt') || l.endsWith('.json');
    });
    const entries = [];
    const errors = [];
    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(dir, file), 'utf-8');
        let data;
        try {
          data = JSON.parse(raw);
        } catch (_) {
          data = parsePlainTextZeiten(raw, file) || parsePlainTextZusatzVertretung(raw, file);
        }
        if (data) entries.push({ file, data });
        else errors.push({ file, error: 'Kein erkanntes Format (weder JSON noch Zeiten/Zusatz-Plaintext)' });
      } catch (e) {
        errors.push({ file, error: e.message });
      }
    }
    return { success: true, entries, errors };
  } catch (e) {
    return { success: false, error: e.message, entries: [], errors: [] };
  }
});

// Verarbeitete Dateien werden nicht gelöscht, sondern als Sicherheitsnetz
// (Re-Import nach Fix, Audit) ins Unterverzeichnis "_verarbeitet" verschoben.
// Damit der Ordner nicht unbegrenzt wächst, werden Archiv-Einträge nach Ablauf
// dieser Frist automatisch entfernt.
const N8N_ARCHIVE_RETENTION_DAYS = 90;

/** Entfernt Archiv-Einträge, die älter als die Aufbewahrungsfrist sind. */
function pruneN8NArchive(processedDir) {
  const cutoff = Date.now() - N8N_ARCHIVE_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  let entries;
  try { entries = fs.readdirSync(processedDir); } catch (_) { return; }
  for (const name of entries) {
    const full = path.join(processedDir, name);
    try {
      // Zeitstempel bevorzugt aus dem Namespräfix "<ms>-…", sonst mtime.
      const m = name.match(/^(\d{10,})-/);
      const ts = m ? Number(m[1]) : fs.statSync(full).mtimeMs;
      if (ts < cutoff) fs.unlinkSync(full);
    } catch (_) { /* einzelne Fehler ignorieren */ }
  }
}

ipcMain.handle('n8n-archive', async (event, folder, filenames) => {
  try {
    const dir = folder || getDefaultN8NFolder();
    const processedDir = path.join(dir, '_verarbeitet');
    if (!fs.existsSync(processedDir)) fs.mkdirSync(processedDir, { recursive: true });
    for (const file of (filenames || [])) {
      const src = path.join(dir, file);
      if (!fs.existsSync(src)) continue;
      // Dateinamen säubern (z. B. versehentliche Zeilenumbrüche aus Cloud-Sync).
      const cleanName = file.replace(/[\r\n]+/g, '').trim();
      try { fs.renameSync(src, path.join(processedDir, `${Date.now()}-${cleanName}`)); } catch (_) {}
    }
    pruneN8NArchive(processedDir);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ===== Dispos (PDF-Dispositionen) =====

// Dispo-PDFs werden in einen App-eigenen Ordner kopiert, damit sie auch
// nach dem Archivieren der Quelle erhalten bleiben.
function getDispoDir() {
  const dir = path.join(app.getPath('userData'), 'dispos');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Quell-Ordner für Dispo-PDFs. Bevorzugt einen Unterordner „Dispos" im
// ZeitBlick-/n8n-Ordner, falls vorhanden (für mehr Übersicht) – sonst der
// Ordner selbst. So funktioniert es mit und ohne Unterordner.
function resolveDispoSourceDir(folder) {
  const base = folder || getDefaultN8NFolder();
  if (!base) return base;
  const sub = path.join(base, 'Dispos');
  try { if (fs.existsSync(sub) && fs.statSync(sub).isDirectory()) return sub; } catch (_) {}
  return base;
}

/** Macht einen String als Ordnernamen sicher (entfernt /, \, :, … und trimmt). */
function sanitizeFolderName(s) {
  return String(s || '')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'Unbenannt';
}

/** Sucht eine Datei (per Basename) rekursiv im Dispo-Baum. Begrenzte Tiefe. */
function findDispoFile(root, filename, depth = 4) {
  const base = path.basename(filename);
  let entries;
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch (_) { return null; }
  for (const e of entries) {
    const full = path.join(root, e.name);
    if (e.isFile() && e.name === base) return full;
  }
  if (depth > 0) {
    for (const e of entries) {
      if (e.isDirectory()) {
        const found = findDispoFile(path.join(root, e.name), base, depth - 1);
        if (found) return found;
      }
    }
  }
  return null;
}

/**
 * Sortiert eine bereits importierte Dispo-PDF in die Struktur
 *   Dispos/<Jahr>/<Projekt>/<datei.pdf>
 * ein. Findet die Datei, egal ob sie noch im Eingang oder bereits in einem
 * (alten) Unterordner liegt – so wird auch bei nachträglicher Projekt-
 * Zuordnung korrekt umsortiert. Best effort: Fehler sind unkritisch.
 */
ipcMain.handle('dispo-organize', async (event, folder, filename, year, project) => {
  try {
    const root = resolveDispoSourceDir(folder);
    if (!root || !fs.existsSync(root)) return { success: false, error: 'Ordner nicht gefunden' };

    const current = findDispoFile(root, filename);
    if (!current) return { success: false, error: 'Datei nicht gefunden' };

    const targetDir = path.join(root, sanitizeFolderName(year || 'Ohne Datum'), sanitizeFolderName(project || 'Ohne Projekt'));
    const target = path.join(targetDir, path.basename(filename));
    if (path.resolve(current) === path.resolve(target)) return { success: true, path: target, moved: false };

    fs.mkdirSync(targetDir, { recursive: true });
    try {
      fs.renameSync(current, target);
    } catch (err) {
      if (err.code === 'EXDEV') { fs.copyFileSync(current, target); fs.unlinkSync(current); }
      else throw err;
    }
    // Leere Restordner aufräumen (z. B. alter Projekt-Ordner nach Umsortierung).
    try {
      const oldDir = path.dirname(current);
      if (oldDir !== root && fs.existsSync(oldDir) && fs.readdirSync(oldDir).length === 0) fs.rmdirSync(oldDir);
    } catch (_) {}
    return { success: true, path: target, moved: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Listet alle PDF-Dateien im Dispo-Quellordner rekursiv (max 3 Ebenen tief).
// Gibt relative Pfade zurück (z.B. "Call sheet/dispo.pdf") damit Unterordner
// wie "Call sheet", "Dispos", "Callsheets" etc. automatisch erkannt werden.
ipcMain.handle('dispo-scan', async (event, folder) => {
  try {
    const dir = resolveDispoSourceDir(folder);
    if (!dir || !fs.existsSync(dir)) return { success: false, error: 'Ordner nicht gefunden', files: [] };

    function collectPDFs(root, rel, depth) {
      const results = [];
      let entries;
      try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch (_) { return results; }
      for (const e of entries) {
        const relPath = rel ? `${rel}/${e.name}` : e.name;
        if (e.isFile() && e.name.toLowerCase().endsWith('.pdf')) {
          const full = path.join(root, e.name);
          let mtime = 0, size = 0;
          try { const st = fs.statSync(full); mtime = st.mtimeMs; size = st.size; } catch (_) {}
          results.push({ file: relPath, mtime, size });
        } else if (e.isDirectory() && depth > 0) {
          results.push(...collectPDFs(path.join(root, e.name), relPath, depth - 1));
        }
      }
      return results;
    }

    const files = collectPDFs(dir, '', 3);
    return { success: true, files };
  } catch (e) {
    return { success: false, error: e.message, files: [] };
  }
});

// Kopiert ein PDF aus dem n8n-Ordner in den App-Dispo-Ordner.
// Gibt den gespeicherten Dateinamen + absoluten Pfad zurück.
ipcMain.handle('dispo-import', async (event, folder, filename) => {
  try {
    const dir = resolveDispoSourceDir(folder);
    const src = path.join(dir, filename);
    if (!fs.existsSync(src)) return { success: false, error: 'Datei nicht gefunden' };
    const dispoDir = getDispoDir();
    // eindeutiger Name, Originalname erhalten
    const base = path.basename(filename);
    let dest = path.join(dispoDir, base);
    if (fs.existsSync(dest)) {
      const ext = path.extname(base);
      const stem = base.slice(0, -ext.length);
      dest = path.join(dispoDir, `${stem}-${Date.now().toString(36)}${ext}`);
    }
    fs.copyFileSync(src, dest);
    // Motiv-Adressen aus dem PDF-Text auslesen (best effort – Fehler sind unkritisch).
    let addresses = { motive: [], suggested: '' };
    try { addresses = await extractDispoAddresses(dest); } catch (_) { /* ignore */ }
    return { success: true, storedName: path.basename(dest), storedPath: dest, addresses };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Importiert eine per Drag&Drop fallengelassene PDF-Datei (z.B. aus Mail) von
// einem beliebigen absoluten Pfad. Legt sie – wenn ein n8n-/ZeitBlick-Ordner
// vorhanden ist – zusätzlich im Dispos-Quellordner ab, damit sie wie andere
// Dispos einsortiert/„Im Finder gezeigt" werden kann; immer aber im internen
// Store (für Vorschau/Lesen). Liest Motiv-Adressen aus dem PDF-Text.
ipcMain.handle('dispo-import-file', async (event, folder, sourcePath) => {
  try {
    if (!sourcePath || !fs.existsSync(sourcePath)) return { success: false, error: 'Datei nicht gefunden' };
    if (path.extname(sourcePath).toLowerCase() !== '.pdf') return { success: false, error: 'Nur PDF-Dateien werden unterstützt' };
    const original = path.basename(sourcePath);

    // 1) In den Quellordner kopieren (best effort), damit Organisieren/Reveal greift.
    let sourceName = original;
    try {
      const srcDir = resolveDispoSourceDir(folder);
      if (srcDir && fs.existsSync(srcDir)) {
        let srcDest = path.join(srcDir, original);
        if (fs.existsSync(srcDest)) {
          // Schon vorhanden? Inhaltsgleich → nicht duplizieren, sonst eindeutigen Namen.
          const same = (() => { try { return fs.statSync(srcDest).size === fs.statSync(sourcePath).size; } catch (_) { return false; } })();
          if (!same) {
            const ext = path.extname(original);
            const stem = original.slice(0, -ext.length);
            srcDest = path.join(srcDir, `${stem}-${Date.now().toString(36)}${ext}`);
            fs.copyFileSync(sourcePath, srcDest);
          }
        } else {
          fs.copyFileSync(sourcePath, srcDest);
        }
        sourceName = path.basename(srcDest);
      }
    } catch (_) { /* Quellkopie ist optional */ }

    // 2) In den internen Store kopieren (für Vorschau/Lesen).
    const dispoDir = getDispoDir();
    let dest = path.join(dispoDir, sourceName);
    if (fs.existsSync(dest)) {
      const ext = path.extname(sourceName);
      const stem = sourceName.slice(0, -ext.length);
      dest = path.join(dispoDir, `${stem}-${Date.now().toString(36)}${ext}`);
    }
    fs.copyFileSync(sourcePath, dest);

    // 3) Motiv-Adressen auslesen (best effort).
    let addresses = { motive: [], suggested: '' };
    try { addresses = await extractDispoAddresses(dest); } catch (_) { /* ignore */ }

    return { success: true, storedName: path.basename(dest), originalName: sourceName, storedPath: dest, addresses };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Öffnet den Dispo-Quellordner (Dispos/) im Finder/Explorer.
ipcMain.handle('open-data-folder', async () => {
  const dir = app.getPath('userData');
  const err = await shell.openPath(dir);
  if (err) return { success: false, error: err };
  return { success: true, path: dir };
});

ipcMain.handle('dispo-open-folder', async (event, folder) => {
  try {
    const dir = resolveDispoSourceDir(folder);
    if (!dir || !fs.existsSync(dir)) return { success: false, error: 'Ordner nicht gefunden' };
    const err = await shell.openPath(dir);
    if (err) return { success: false, error: err };
    return { success: true, path: dir };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Zeigt eine bestimmte Dispo-PDF im Finder (findet sie im Jahr/Projekt-Baum).
// Fällt auf das Öffnen des Ordners zurück, wenn die Datei nicht gefunden wird.
ipcMain.handle('dispo-reveal', async (event, folder, filename) => {
  try {
    const root = resolveDispoSourceDir(folder);
    if (!root || !fs.existsSync(root)) return { success: false, error: 'Ordner nicht gefunden' };
    const file = findDispoFile(root, filename);
    if (file) { shell.showItemInFolder(file); return { success: true, path: file }; }
    const err = await shell.openPath(root);
    if (err) return { success: false, error: err };
    return { success: true, path: root, fallback: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ===== Sichere Speicherung (macOS-Keychain via safeStorage) =====
// Verschlüsselt Passwörter, die in den Karteikarten hinterlegt werden.
function safeDecrypt(b64) {
  try {
    if (!b64 || !safeStorage.isEncryptionAvailable()) return '';
    return safeStorage.decryptString(Buffer.from(b64, 'base64'));
  } catch (_) { return ''; }
}

ipcMain.handle('safe-encrypt', async (event, text) => {
  try {
    if (!safeStorage.isEncryptionAvailable()) return { success: false, error: 'Keychain-Verschlüsselung nicht verfügbar' };
    return { success: true, data: safeStorage.encryptString(String(text || '')).toString('base64') };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ===== StdWeb (Sesam) – Vorausfüllen über eingebettetes Fenster =====
const STDWEB_URL = 'https://www.sesam-software-gmbh.de/isapi/StdWebMiete.dll/';
let stdwebWindow = null;

// Öffnet (oder fokussiert) das StdWeb-Fenster. Login macht der Nutzer selbst.
ipcMain.handle('stdweb-open', async () => {
  try {
    if (stdwebWindow && !stdwebWindow.isDestroyed()) { stdwebWindow.focus(); return { success: true }; }
    stdwebWindow = new BrowserWindow({
      width: 1280, height: 860, title: 'StdWeb – Sesam',
      webPreferences: { contextIsolation: true, nodeIntegration: false },
    });
    stdwebWindow.on('closed', () => { stdwebWindow = null; });
    await stdwebWindow.loadURL(STDWEB_URL);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Füllt die aktuell im StdWeb-Fenster geöffnete Woche mit den übergebenen Tagen.
// days: [{ tag:1..7, von, bis, pause }] als "HH:MM". Sendet NICHT ab.
ipcMain.handle('stdweb-fill', async (event, days) => {
  try {
    if (!stdwebWindow || stdwebWindow.isDestroyed()) return { success: false, error: 'StdWeb-Fenster ist nicht offen' };
    const script = buildStdWebFillScript(days);
    const report = await stdwebWindow.webContents.executeJavaScript(script, true);
    return { success: true, report };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Loggt in StdWeb als Person ein. Entschlüsselt das Passwort (pwEnc) im Main.
// creds: { name, vorname, produktion, pwEnc?, passwort? }
ipcMain.handle('stdweb-login', async (event, creds, doSubmit) => {
  try {
    if (!stdwebWindow || stdwebWindow.isDestroyed()) return { success: false, error: 'StdWeb-Fenster ist nicht offen' };
    const pw = creds && creds.pwEnc ? safeDecrypt(creds.pwEnc) : ((creds && creds.passwort) || '');
    const full = { name: (creds && creds.name) || '', vorname: (creds && creds.vorname) || '', passwort: pw, produktion: (creds && creds.produktion) || '', hints: (creds && creds.hints) || [] };
    const report = await stdwebWindow.webContents.executeJavaScript(buildStdWebLoginScript(full, !!doSubmit), true);
    return { success: true, report };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Loggt aus StdWeb aus (Personen-Wechsel im Batch).
ipcMain.handle('stdweb-logout', async () => {
  try {
    if (!stdwebWindow || stdwebWindow.isDestroyed()) return { success: false, error: 'StdWeb-Fenster ist nicht offen' };
    const report = await stdwebWindow.webContents.executeJavaScript(buildStdWebLogoutScript(), true);
    return { success: true, report };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Steuert in StdWeb die Woche mit dem gegebenen Montag-Datum an (wählt/erstellt).
ipcMain.handle('stdweb-navigate', async (event, mondayDate) => {
  try {
    if (!stdwebWindow || stdwebWindow.isDestroyed()) return { success: false, error: 'StdWeb-Fenster ist nicht offen' };
    const report = await stdwebWindow.webContents.executeJavaScript(buildStdWebNavigateScript(mondayDate), true);
    return { success: true, report };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Liest die aktuell im StdWeb-Fenster geöffnete Woche (Label "KW XX / JJJJ …").
ipcMain.handle('stdweb-weekinfo', async () => {
  try {
    if (!stdwebWindow || stdwebWindow.isDestroyed()) return { success: false, error: 'StdWeb-Fenster ist nicht offen' };
    const label = await stdwebWindow.webContents.executeJavaScript(
      "(function(){var el=document.getElementById('LABELZEITRAUMTEXT_FRAME');return el?(el.textContent||'').trim():'';})()", true);
    return { success: true, label };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Diagnose: meldet die echte Picker-Struktur zurück (zum Verstehen der UI).
ipcMain.handle('stdweb-diagnose', async () => {
  try {
    if (!stdwebWindow || stdwebWindow.isDestroyed()) return { success: false, error: 'StdWeb-Fenster ist nicht offen' };
    const info = await stdwebWindow.webContents.executeJavaScript(buildStdWebDiagnoseScript(), true);
    return { success: true, info };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Öffnet einen externen Link (nur http/https) im Standardbrowser.
ipcMain.handle('open-external', async (event, url) => {
  try {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      return { success: false, error: 'Ungültiger Link' };
    }
    await shell.openExternal(url);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Berechnet die Fahrstrecke (km) zwischen Heim- und Motiv-Adresse.
ipcMain.handle('compute-distance', async (event, homeAddress, motivAddress) => {
  try {
    const r = await computeDistance(homeAddress, motivAddress);
    return { success: true, ...r };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Liest ein gespeichertes Dispo-PDF (per storedName) als base64.
ipcMain.handle('dispo-read', async (event, storedName) => {
  try {
    const full = path.join(getDispoDir(), path.basename(storedName));
    if (!fs.existsSync(full)) return { success: false, error: 'Datei nicht gefunden' };
    const buffer = fs.readFileSync(full);
    return { success: true, data: buffer.toString('base64') };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Liest die Motiv-Adressen aus einem bereits gespeicherten Dispo-PDF neu aus.
// Nützlich, wenn die Erkennung verbessert wurde und vorhandene Dispos
// nachträglich aktualisiert werden sollen.
ipcMain.handle('dispo-redetect', async (event, storedName) => {
  try {
    const full = path.join(getDispoDir(), path.basename(storedName));
    if (!fs.existsSync(full)) return { success: false, error: 'Datei nicht gefunden' };
    const addresses = await extractDispoAddresses(full);
    return { success: true, addresses };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Löscht ein gespeichertes Dispo-PDF.
ipcMain.handle('dispo-delete', async (event, storedName) => {
  try {
    const full = path.join(getDispoDir(), path.basename(storedName));
    if (fs.existsSync(full)) fs.unlinkSync(full);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});


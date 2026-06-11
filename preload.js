const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getPathForFile: (file) => webUtils.getPathForFile(file),
  importPDFs: (filePaths) => ipcRenderer.invoke('import-pdfs', filePaths),
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  openFolderDialog: () => ipcRenderer.invoke('open-folder-dialog'),
  loadData: () => ipcRenderer.invoke('load-data'),
  saveData: (data) => ipcRenderer.invoke('save-data', data),
  saveDataSync: (data) => ipcRenderer.sendSync('save-data-sync', data),
  readPDFFile: (filePath) => ipcRenderer.invoke('read-pdf-file', filePath),
  exportCSV: (csvContent, defaultName) => ipcRenderer.invoke('export-csv', csvContent, defaultName),
  exportPDF: (htmlContent, defaultName) => ipcRenderer.invoke('export-pdf', htmlContent, defaultName),
  exportTimesheetPDF: (htmlContent, defaultName) => ipcRenderer.invoke('export-timesheet-pdf', htmlContent, defaultName),
  // Backup & Data Management
  createBackup: () => ipcRenderer.invoke('create-backup'),
  listBackups: () => ipcRenderer.invoke('list-backups'),
  restoreBackup: (path) => ipcRenderer.invoke('restore-backup', path),
  exportData: () => ipcRenderer.invoke('export-data'),
  importDataFile: () => ipcRenderer.invoke('import-data'),
  // Batch PDF export
  exportPDFsToFolder: (htmlContentArray) => ipcRenderer.invoke('export-pdfs-to-folder', htmlContentArray),
  // n8n integration
  getDefaultN8NFolder: () => ipcRenderer.invoke('get-default-n8n-folder'),
  scanN8N: (folder) => ipcRenderer.invoke('n8n-scan', folder),
  archiveN8N: (folder, files) => ipcRenderer.invoke('n8n-archive', folder, files),
  watchN8N: (folder) => ipcRenderer.invoke('n8n-watch', folder),
  // Dispos (PDF-Dispositionen)
  scanDispos: (folder) => ipcRenderer.invoke('dispo-scan', folder),
  importDispo: (folder, filename) => ipcRenderer.invoke('dispo-import', folder, filename),
  importDispoFile: (folder, sourcePath) => ipcRenderer.invoke('dispo-import-file', folder, sourcePath),
  readDispo: (storedName) => ipcRenderer.invoke('dispo-read', storedName),
  redetectDispo: (storedName) => ipcRenderer.invoke('dispo-redetect', storedName),
  deleteDispo: (storedName) => ipcRenderer.invoke('dispo-delete', storedName),
  computeDistance: (homeAddress, motivAddress) => ipcRenderer.invoke('compute-distance', homeAddress, motivAddress),
  organizeDispo: (folder, filename, year, project) => ipcRenderer.invoke('dispo-organize', folder, filename, year, project),
  openDispoFolder: (folder) => ipcRenderer.invoke('dispo-open-folder', folder),
  revealDispo: (folder, filename) => ipcRenderer.invoke('dispo-reveal', folder, filename),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  openDataFolder: () => ipcRenderer.invoke('open-data-folder'),
  // StdWeb (Sesam) – Vorausfüllen
  openStdWeb: () => ipcRenderer.invoke('stdweb-open'),
  fillStdWeb: (days) => ipcRenderer.invoke('stdweb-fill', days),
  diagnoseStdWeb: () => ipcRenderer.invoke('stdweb-diagnose'),
  stdwebWeekInfo: () => ipcRenderer.invoke('stdweb-weekinfo'),
  navigateStdWeb: (mondayDate) => ipcRenderer.invoke('stdweb-navigate', mondayDate),
  safeEncrypt: (text) => ipcRenderer.invoke('safe-encrypt', text),
  loginStdWeb: (creds, doSubmit) => ipcRenderer.invoke('stdweb-login', creds, doSubmit),
  logoutStdWeb: () => ipcRenderer.invoke('stdweb-logout'),
  onN8NChanged: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('n8n-files-changed', handler);
    return () => ipcRenderer.removeListener('n8n-files-changed', handler);
  },
  watchDispos: (folder) => ipcRenderer.invoke('dispo-watch', folder),
  onDispoFilesChanged: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('dispo-files-changed', handler);
    return () => ipcRenderer.removeListener('dispo-files-changed', handler);
  },
  // Billing PDF import + password management
  openBillingDialog: () => ipcRenderer.invoke('open-billing-dialog'),
  importBillingPDF: (filePaths, passwordMap, patternDate) => ipcRenderer.invoke('import-billing-pdf', filePaths, passwordMap, patternDate),
  getBillingPasswords: () => ipcRenderer.invoke('get-billing-passwords'),
  saveBillingPassword: (production, password) => ipcRenderer.invoke('save-billing-password', production, password),
  deleteBillingPassword: (production) => ipcRenderer.invoke('delete-billing-password', production),
  getBillingPatterns: () => ipcRenderer.invoke('get-billing-patterns'),
  saveBillingPattern: (production, pattern) => ipcRenderer.invoke('save-billing-pattern', production, pattern),
  deleteBillingPattern: (production) => ipcRenderer.invoke('delete-billing-pattern', production),
  saveBillingPdfToCloud: (sourcePath, datum) => ipcRenderer.invoke('save-billing-pdf-to-icloud', sourcePath, datum),
  // Sesam Stundenzettel import
  openSesamTimesheetDialog: () => ipcRenderer.invoke('open-sesam-timesheet-dialog'),
  importSesamTimesheet: (filePaths, passwordMap) => ipcRenderer.invoke('import-sesam-timesheet', filePaths, passwordMap),
  ocrSesamTimesheet: (filePath) => ipcRenderer.invoke('sesam-ocr-timesheet', filePath),
  // Auto-Updater
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  quitApp: () => ipcRenderer.invoke('quit-app'),
  onUpdateStatus: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('update-status', handler);
    return () => ipcRenderer.removeListener('update-status', handler);
  },
});

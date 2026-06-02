const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getPathForFile: (file) => webUtils.getPathForFile(file),
  importPDFs: (filePaths) => ipcRenderer.invoke('import-pdfs', filePaths),
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  openFolderDialog: () => ipcRenderer.invoke('open-folder-dialog'),
  loadData: () => ipcRenderer.invoke('load-data'),
  saveData: (data) => ipcRenderer.invoke('save-data', data),
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
  // Excel export
  exportXLSX: (data, defaultName) => ipcRenderer.invoke('export-xlsx', data, defaultName),
  // n8n integration
  getDefaultN8NFolder: () => ipcRenderer.invoke('get-default-n8n-folder'),
  scanN8N: (folder) => ipcRenderer.invoke('n8n-scan', folder),
  archiveN8N: (folder, files) => ipcRenderer.invoke('n8n-archive', folder, files),
  watchN8N: (folder) => ipcRenderer.invoke('n8n-watch', folder),
  // Dispos (PDF-Dispositionen)
  scanDispos: (folder) => ipcRenderer.invoke('dispo-scan', folder),
  importDispo: (folder, filename) => ipcRenderer.invoke('dispo-import', folder, filename),
  readDispo: (storedName) => ipcRenderer.invoke('dispo-read', storedName),
  deleteDispo: (storedName) => ipcRenderer.invoke('dispo-delete', storedName),
  computeDistance: (homeAddress, motivAddress) => ipcRenderer.invoke('compute-distance', homeAddress, motivAddress),
  organizeDispo: (folder, filename, year, project) => ipcRenderer.invoke('dispo-organize', folder, filename, year, project),
  openDispoFolder: (folder) => ipcRenderer.invoke('dispo-open-folder', folder),
  revealDispo: (folder, filename) => ipcRenderer.invoke('dispo-reveal', folder, filename),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  onN8NChanged: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('n8n-files-changed', handler);
    return () => ipcRenderer.removeListener('n8n-files-changed', handler);
  },
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

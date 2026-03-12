import React, { useState, useEffect, useCallback } from 'react';

/**
 * UpdateOverlay – Manages the complete auto-update lifecycle:
 * 
 * 1. Listens for update-status events from main process
 * 2. Shows a small banner when an update is available (user chooses to download)
 * 3. Shows download progress
 * 4. After download, asks to restart
 * 5. On first launch after update, shows "What's New" with release notes
 * 
 * Data safety: A backup is created automatically before installing any update.
 */

const UPDATE_SEEN_KEY = 'zeitblick_lastSeenVersion';
const WHATS_NEW_KEY = 'zeitblick_whatsNewDismissed';

export default function UpdateOverlay() {
  const [updateState, setUpdateState] = useState(null);
  // { status, version, releaseNotes, releaseDate, percent, message, manualInstall }
  
  const [showBanner, setShowBanner] = useState(false);
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const [whatsNewContent, setWhatsNewContent] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [dmgOpened, setDmgOpened] = useState(false); // macOS: DMG was opened for manual install
  const [isMac, setIsMac] = useState(false);

  // Detect macOS for manual install flow
  useEffect(() => {
    (async () => {
      if (window.electronAPI?.getPlatform) {
        const platform = await window.electronAPI.getPlatform();
        setIsMac(platform === 'darwin');
      }
    })();
  }, []);

  // Listen for update events from main process
  useEffect(() => {
    if (!window.electronAPI?.onUpdateStatus) return;
    
    const unsubscribe = window.electronAPI.onUpdateStatus((data) => {
      setUpdateState(data);
      
      if (data.status === 'available') {
        setShowBanner(true);
        setDownloading(false);
      } else if (data.status === 'downloading') {
        setDownloading(true);
      } else if (data.status === 'downloaded') {
        setDownloading(false);
      } else if (data.status === 'error') {
        setDownloading(false);
      }
    });

    return unsubscribe;
  }, []);

  // Check on first launch if the version changed → show "What's New"
  useEffect(() => {
    (async () => {
      if (!window.electronAPI?.getAppVersion) return;
      try {
        const currentVersion = await window.electronAPI.getAppVersion();
        const lastSeen = localStorage.getItem(UPDATE_SEEN_KEY);
        const whatsNewDismissed = localStorage.getItem(WHATS_NEW_KEY);
        
        if (lastSeen && lastSeen !== currentVersion && whatsNewDismissed !== currentVersion) {
          // Version has changed since last use — show What's New
          setWhatsNewContent({
            fromVersion: lastSeen,
            toVersion: currentVersion,
          });
          setShowWhatsNew(true);
        }
        
        // Always save current version
        localStorage.setItem(UPDATE_SEEN_KEY, currentVersion);
      } catch (e) {
        // Ignore in dev mode
      }
    })();
  }, []);

  const handleDownload = useCallback(async () => {
    if (!window.electronAPI?.downloadUpdate) return;
    setDownloading(true);
    try {
      await window.electronAPI.downloadUpdate();
    } catch (e) {
      setDownloading(false);
    }
  }, []);

  const handleInstall = useCallback(async () => {
    if (!window.electronAPI?.installUpdate) return;
    setInstalling(true);
    try {
      const result = await window.electronAPI.installUpdate();
      // macOS: DMG was opened for manual installation
      if (result?.manual) {
        setDmgOpened(true);
        setInstalling(false);
      }
    } catch (e) {
      setInstalling(false);
    }
  }, []);

  const handleQuitApp = useCallback(() => {
    if (window.electronAPI?.quitApp) {
      window.electronAPI.quitApp();
    }
  }, []);

  const handleDismissBanner = useCallback(() => {
    setDismissed(true);
    setShowBanner(false);
  }, []);

  const handleDismissWhatsNew = useCallback(() => {
    setShowWhatsNew(false);
    if (whatsNewContent?.toVersion) {
      localStorage.setItem(WHATS_NEW_KEY, whatsNewContent.toVersion);
    }
  }, [whatsNewContent]);

  const handleCheckManually = useCallback(async () => {
    if (!window.electronAPI?.checkForUpdates) return;
    const result = await window.electronAPI.checkForUpdates();
    if (!result.success) {
      // In dev or no updater available — show a message
      return result;
    }
    return result;
  }, []);

  // Parse release notes (can be string or array of objects from electron-updater)
  const formatReleaseNotes = (notes) => {
    if (!notes) return null;
    if (typeof notes === 'string') return notes;
    if (Array.isArray(notes)) {
      return notes.map(n => typeof n === 'string' ? n : (n.note || n.body || '')).join('\n\n');
    }
    return String(notes);
  };

  // ===== "What's New" Overlay after an update =====
  if (showWhatsNew && whatsNewContent) {
    return (
      <div className="update-overlay-backdrop" onClick={handleDismissWhatsNew}>
        <div className="update-overlay-modal whats-new-modal" onClick={e => e.stopPropagation()}>
          <div className="update-modal-header">
            <div className="update-modal-icon">🎉</div>
            <h2>ZeitBlick wurde aktualisiert!</h2>
            <p className="update-version-badge">
              {whatsNewContent.fromVersion} → {whatsNewContent.toVersion}
            </p>
          </div>
          
          <div className="update-modal-body">
            <h3>Was ist neu?</h3>
            <div className="whats-new-content">
              {/* Release notes will be stored by the updater when available */}
              {updateState?.releaseNotes ? (
                <div className="release-notes-text" dangerouslySetInnerHTML={{ 
                  __html: formatReleaseNotes(updateState.releaseNotes) 
                }} />
              ) : (
                <div className="release-notes-text">
                  <p>ZeitBlick wurde auf Version <strong>{whatsNewContent.toVersion}</strong> aktualisiert.</p>
                  <p>Schau auf <a href="#" onClick={(e) => { e.preventDefault(); }}>GitHub</a> für die vollständigen Release Notes.</p>
                </div>
              )}
            </div>
            <p className="update-data-safe">
              ✅ Alle deine Daten wurden sicher beibehalten.
            </p>
          </div>

          <div className="update-modal-actions">
            <button className="update-btn update-btn-primary" onClick={handleDismissWhatsNew}>
              Verstanden, weiter geht's!
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ===== macOS: DMG opened — show instructions to drag & relaunch =====
  if (dmgOpened && !dismissed) {
    return (
      <div className="update-overlay-backdrop" onClick={() => {}}>
        <div className="update-overlay-modal" onClick={e => e.stopPropagation()}>
          <div className="update-modal-header">
            <div className="update-modal-icon">📦</div>
            <h2>Fast geschafft!</h2>
            <p className="update-version-badge">Version {updateState?.version}</p>
          </div>
          
          <div className="update-modal-body">
            <div className="manual-install-steps">
              <p><strong>Die Update-Datei wurde geöffnet.</strong></p>
              <ol style={{ textAlign: 'left', lineHeight: '1.8', margin: '12px 0', paddingLeft: '20px', color: 'var(--text-secondary)' }}>
                <li>Ziehe <strong>ZeitBlick</strong> in den <strong>Programme</strong>-Ordner</li>
                <li>Bestätige das Ersetzen der alten Version</li>
                <li>Schließe diese App und starte ZeitBlick neu</li>
              </ol>
            </div>
            <p className="update-data-safe">
              🔒 Deine Daten wurden gesichert und bleiben erhalten.
            </p>
          </div>

          <div className="update-modal-actions">
            <button className="update-btn update-btn-secondary" onClick={handleDismissBanner}>
              Später
            </button>
            <button className="update-btn update-btn-primary" onClick={handleQuitApp}>
              🚪 App beenden
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ===== Update Downloaded — Ready to Install =====
  if (updateState?.status === 'downloaded' && !dismissed) {
    return (
      <div className="update-overlay-backdrop" onClick={() => {}}>
        <div className="update-overlay-modal" onClick={e => e.stopPropagation()}>
          <div className="update-modal-header">
            <div className="update-modal-icon">✅</div>
            <h2>Update bereit!</h2>
            <p className="update-version-badge">Version {updateState.version}</p>
          </div>
          
          <div className="update-modal-body">
            {updateState.releaseNotes && (
              <>
                <h3>Was ist neu in {updateState.version}?</h3>
                <div className="release-notes-text" dangerouslySetInnerHTML={{ 
                  __html: formatReleaseNotes(updateState.releaseNotes) 
                }} />
              </>
            )}
            {isMac ? (
              <p className="update-data-safe">
                🔒 Klicke auf "Installieren" um die Update-Datei zu öffnen. Ziehe dann ZeitBlick in den Programme-Ordner.
              </p>
            ) : (
              <p className="update-data-safe">
                🔒 Vor der Installation wird automatisch ein Backup deiner Daten erstellt.
              </p>
            )}
          </div>

          <div className="update-modal-actions">
            <button className="update-btn update-btn-secondary" onClick={handleDismissBanner}>
              Später
            </button>
            <button className="update-btn update-btn-primary" onClick={handleInstall} disabled={installing}>
              {installing ? '⏳ Wird vorbereitet...' : (isMac ? '📦 Update-Datei öffnen' : '🔄 Jetzt neu starten & installieren')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ===== Downloading Progress Banner =====
  if (downloading && updateState?.status === 'downloading') {
    return (
      <div className="update-banner update-banner-downloading">
        <div className="update-banner-content">
          <span className="update-banner-icon">⬇️</span>
          <span className="update-banner-text">
            Update {updateState.version || ''} wird heruntergeladen... {updateState.percent || 0}%
          </span>
          <div className="update-progress-bar">
            <div className="update-progress-fill" style={{ width: `${updateState.percent || 0}%` }} />
          </div>
        </div>
      </div>
    );
  }

  // ===== Update Available — Full Modal with Release Notes =====
  if (showBanner && updateState?.status === 'available' && !dismissed) {
    return (
      <div className="update-overlay-backdrop" onClick={handleDismissBanner}>
        <div className="update-overlay-modal" onClick={e => e.stopPropagation()}>
          <div className="update-modal-header">
            <div className="update-modal-icon">🆕</div>
            <h2>Neues Update verfügbar!</h2>
            <p className="update-version-badge">Version {updateState.version}</p>
          </div>
          
          <div className="update-modal-body">
            {updateState.releaseNotes ? (
              <>
                <h3>Was ist neu in {updateState.version}?</h3>
                <div className="whats-new-content">
                  <div className="release-notes-text" dangerouslySetInnerHTML={{ 
                    __html: formatReleaseNotes(updateState.releaseNotes) 
                  }} />
                </div>
              </>
            ) : (
              <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '12px 0' }}>
                Eine neue Version von ZeitBlick ist verfügbar.
              </p>
            )}
            <p className="update-data-safe">
              🔒 Deine Daten bleiben erhalten. Vor der Installation wird automatisch ein Backup erstellt.
            </p>
          </div>

          <div className="update-modal-actions">
            <button className="update-btn update-btn-secondary" onClick={handleDismissBanner}>
              Später
            </button>
            <button className="update-btn update-btn-primary" onClick={handleDownload} disabled={downloading}>
              {downloading ? '⏳ Wird heruntergeladen...' : '⬇️ Jetzt herunterladen'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ===== Error Banner =====
  if (updateState?.status === 'error' && !dismissed) {
    return (
      <div className="update-banner update-banner-error">
        <div className="update-banner-content">
          <span className="update-banner-icon">⚠️</span>
          <span className="update-banner-text">
            Update-Fehler: {updateState.message}
          </span>
        </div>
        <button className="update-banner-close" onClick={() => setDismissed(true)} aria-label="Schließen">×</button>
      </div>
    );
  }

  // Nothing to show
  return null;
}

/**
 * Small hook for Settings page to trigger manual update check
 */
export function useUpdateChecker() {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState(null);

  const checkForUpdates = useCallback(async () => {
    if (!window.electronAPI?.checkForUpdates) {
      setResult({ error: 'Auto-Updater nicht verfügbar (nur im gepackten Build).' });
      return;
    }
    setChecking(true);
    setResult(null);
    try {
      const res = await window.electronAPI.checkForUpdates();
      setResult(res);
    } catch (e) {
      setResult({ error: e.message });
    }
    setChecking(false);
  }, []);

  return { checking, result, checkForUpdates };
}

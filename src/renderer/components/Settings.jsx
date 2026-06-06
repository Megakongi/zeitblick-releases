import React, { useState, useMemo, useEffect } from 'react';
import { useUpdateChecker } from './UpdateOverlay';

/**
 * Schritt-für-Schritt-Einrichtungshilfe für die n8n-Anbindung.
 * Erklärt iCloud-Ordner, n8n-Installation, IMAP-Workflow für Dispo-PDFs
 * und das Dateinamen-Format. Mit Kopier-Buttons für Pfade/Snippets.
 */
function N8NSetupGuide({ folder }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState('');

  const copy = (key, text) => {
    try { navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(''), 1500); } catch { /* ignore */ }
  };

  const folderPath = folder || '~/Library/Mobile Documents/com~apple~CloudDocs/ZeitBlick';

  const CopyBtn = ({ id, text }) => (
    <button type="button" className="n8n-copy-btn" onClick={() => copy(id, text)}>
      {copied === id ? '✓ Kopiert' : 'Kopieren'}
    </button>
  );

  return (
    <div className="settings-card n8n-guide">
      <button type="button" className="n8n-guide-toggle" onClick={() => setOpen(o => !o)}>
        <span>🧭 Einrichtungshilfe: Mailpostfach → Dispos</span>
        <span className={`n8n-guide-chevron${open ? ' open' : ''}`}>▾</span>
      </button>

      {open && (
        <div className="n8n-guide-body">
          <p className="settings-description">
            Mit n8n holst du Dispo-PDFs automatisch aus deinem Mailpostfach und legst sie in deinen
            ZeitBlick-Ordner. ZeitBlick erkennt sie dann im Tab <strong>„Dispos"</strong>. So geht's:
          </p>

          <div className="n8n-step">
            <div className="n8n-step-num">1</div>
            <div className="n8n-step-content">
              <div className="n8n-step-title">ZeitBlick-Ordner in iCloud anlegen</div>
              <p>Erstelle (falls noch nicht vorhanden) einen Ordner <code>ZeitBlick</code> in iCloud Drive. Diesen Pfad nutzt n8n als Ziel:</p>
              <div className="n8n-code-row">
                <code className="n8n-code">{folderPath}</code>
                <CopyBtn id="folder" text={folderPath} />
              </div>
            </div>
          </div>

          <div className="n8n-step">
            <div className="n8n-step-num">2</div>
            <div className="n8n-step-content">
              <div className="n8n-step-title">n8n installieren</div>
              <p>n8n ist ein kostenloses Automatisierungs-Tool. Am einfachsten lokal per Docker oder npx:</p>
              <div className="n8n-code-row">
                <code className="n8n-code">npx n8n</code>
                <CopyBtn id="npx" text="npx n8n" />
              </div>
              <p className="n8n-hint">Alternativ n8n Cloud (n8n.io) – dann muss der Ziel-Ordner aber für n8n erreichbar sein (z.B. via lokalem Agent). Für iCloud auf deinem Mac ist die lokale Variante am einfachsten.</p>
            </div>
          </div>

          <div className="n8n-step">
            <div className="n8n-step-num">3</div>
            <div className="n8n-step-content">
              <div className="n8n-step-title">Workflow in n8n bauen</div>
              <p>Lege einen Workflow mit diesen Knoten an:</p>
              <ul className="n8n-list">
                <li><strong>IMAP Email</strong> (Trigger) – verbindet dein Postfach, reagiert auf neue Mails. Tipp: per Filter nur Mails mit Betreff „Dispo" / „Dispo" / „Callsheet" behandeln.</li>
                <li><strong>IF / Filter</strong> – nur Mails mit PDF-Anhang weiterleiten.</li>
                <li><strong>Read/Write Files from Disk</strong> (oder „Move Binary Data" → „Write File") – speichert den PDF-Anhang in den ZeitBlick-Ordner.</li>
              </ul>
              <p>Als Dateipfad im „Write File"-Knoten:</p>
              <div className="n8n-code-row">
                <code className="n8n-code">{folderPath}/{'{{$binary.attachment_0.fileName}}'}</code>
                <CopyBtn id="writepath" text={`${folderPath}/{{$binary.attachment_0.fileName}}`} />
              </div>
            </div>
          </div>

          <div className="n8n-step">
            <div className="n8n-step-num">4</div>
            <div className="n8n-step-content">
              <div className="n8n-step-title">Dateinamen für beste Erkennung</div>
              <p>ZeitBlick liest <strong>Datum</strong>, <strong>Drehtag</strong> und <strong>Projekt</strong> aus dem Dateinamen. Diese Formate werden zuverlässig erkannt:</p>
              <ul className="n8n-list">
                <li><strong>Datum:</strong> <code>26.03.26</code>, <code>26.03.2026</code>, <code>260326</code> (JJMMTT) oder <code>20260326</code></li>
                <li><strong>Drehtag:</strong> <code>DT 1</code>, <code>22. DT</code>, <code>SD 49</code>, <code>Aufbautag</code>, <code>Nachdreh</code></li>
                <li><strong>Projekt:</strong> voller Name, Projekt-<em>Kürzel</em> (siehe Projekte) oder Projektnummer</li>
              </ul>
              <p className="n8n-hint">Wird das Projekt nicht erkannt, ordnest du es in der Dispo-Liste einfach per Dropdown zu. Das Datum reicht meist schon – der Rest ist optional.</p>
            </div>
          </div>

          <div className="n8n-step">
            <div className="n8n-step-num">5</div>
            <div className="n8n-step-content">
              <div className="n8n-step-title">Fertig – in ZeitBlick prüfen</div>
              <p>Öffne den Tab <strong>„Dispos"</strong> und klicke <strong>„↻ Synchronisieren"</strong>. Neue PDFs aus dem Ordner erscheinen als Karten. n8n läuft im Hintergrund und legt künftig automatisch neue Dispos ab.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Apple-Shortcuts zum Download. Erfassen Zeiten / Zusätze auf dem iPhone und
 * legen sie in den ZeitBlick-Ordner. Links öffnen sich extern in Safari.
 */
const APPLE_SHORTCUTS = [
  { id: 'zeiten', icon: '⏱', name: 'Zeiten erfassen', desc: 'Arbeitszeiten am iPhone eingeben und in den ZeitBlick-Ordner legen.', url: 'https://www.icloud.com/shortcuts/c59af2c869cb4805a00e2cf956df81d3' },
  { id: 'zusaetze', icon: '➕', name: 'Zusätze erfassen', desc: 'Zusatzpersonal / Vertretungen am iPhone erfassen und ablegen.', url: 'https://www.icloud.com/shortcuts/121e78f02c464660bdb8ca0e8b319c94' },
];

function AppleShortcutsCard() {
  const [copied, setCopied] = useState('');
  const open = (url) => { if (window.electronAPI && window.electronAPI.openExternal) window.electronAPI.openExternal(url); };
  const copy = (id, url) => {
    try { navigator.clipboard.writeText(url); setCopied(id); setTimeout(() => setCopied(''), 1500); } catch { /* ignore */ }
  };
  return (
    <div className="settings-card">
      <h3>📱 Apple Shortcuts</h3>
      <p className="settings-description">
        Diese Kurzbefehle erfassen <strong>Zeiten</strong> und <strong>Zusätze</strong> direkt am iPhone und legen sie in deinen ZeitBlick-Ordner – ZeitBlick verarbeitet sie dann automatisch. Auf dem iPhone öffnen, um den Kurzbefehl hinzuzufügen.
      </p>
      <div className="shortcuts-list">
        {APPLE_SHORTCUTS.map(s => (
          <div key={s.id} className="shortcut-row">
            <span className="shortcut-ic">{s.icon}</span>
            <div className="shortcut-info">
              <div className="shortcut-name">{s.name}</div>
              <div className="shortcut-desc">{s.desc}</div>
            </div>
            <div className="shortcut-actions">
              <button className="backup-btn" onClick={() => open(s.url)}>↗ Öffnen / Laden</button>
              <button className="backup-btn" onClick={() => copy(s.id, s.url)}>{copied === s.id ? '✓ Kopiert' : 'Link kopieren'}</button>
            </div>
          </div>
        ))}
      </div>
      <p className="settings-description" style={{ marginTop: 8 }}>
        💡 Tipp: Den kopierten Link kannst du dir per Nachricht aufs iPhone schicken und dort öffnen.
      </p>
    </div>
  );
}

/**
 * StdWeb-Test (Stufe 1): öffnet das eingebettete StdWeb-Fenster und füllt
 * testweise einen Tag, um die Klick-Choreografie live zu prüfen.
 */
function StdWebTestCard({ team = [] }) {
  const [status, setStatus] = useState('');
  const [output, setOutput] = useState('');
  const [busy, setBusy] = useState(false);
  const [navDate, setNavDate] = useState('01.06.2026');
  const [prod, setProd] = useState('Doll Film – ROLAND');

  const loginPerson = useMemo(() => (team || []).find(m => m.isMe && m.sesamPwEnc) || (team || []).find(m => m.sesamPwEnc), [team]);

  const loginTest = async (doSubmit) => {
    if (!window.electronAPI || !window.electronAPI.loginStdWeb) return;
    if (!loginPerson) { setStatus('Keine Person mit gespeichertem StdWeb-Login gefunden (Tab Personen).'); return; }
    setBusy(true);
    setStatus(`${doSubmit ? 'Login (absenden)' : 'Login-Test (nur Felder/Produktionsliste)'} als ${loginPerson.sesamVorname} ${loginPerson.sesamName}…`);
    try {
      const creds = { name: loginPerson.sesamName, vorname: loginPerson.sesamVorname, pwEnc: loginPerson.sesamPwEnc, produktion: prod };
      const res = await window.electronAPI.loginStdWeb(creds, doSubmit);
      setStatus(res && res.success ? 'Login-Aufruf ausgeführt.' : `Fehler: ${res && res.error}`);
      setOutput(JSON.stringify(res && res.report, null, 2));
    } finally {
      setBusy(false);
    }
  };

  const navigate = async () => {
    if (!window.electronAPI || !window.electronAPI.navigateStdWeb) return;
    setBusy(true);
    setStatus(`Steuere Woche an (Montag ${navDate})…`);
    try {
      const res = await window.electronAPI.navigateStdWeb(navDate);
      setStatus(res && res.success ? 'Navigation ausgeführt.' : `Fehler: ${res && res.error}`);
      setOutput(JSON.stringify(res && res.report, null, 2));
    } finally {
      setBusy(false);
    }
  };

  const open = async () => {
    if (!window.electronAPI || !window.electronAPI.openStdWeb) return;
    setStatus('Öffne StdWeb…');
    const res = await window.electronAPI.openStdWeb();
    setStatus(res && res.success ? 'StdWeb geöffnet – bitte einloggen und eine leere Woche öffnen.' : `Fehler: ${res && res.error}`);
  };

  const fillTest = async () => {
    if (!window.electronAPI || !window.electronAPI.fillStdWeb) return;
    setBusy(true);
    setStatus('Fülle Test-Tag (Mo 09:00–18:00, Pause 00:45)…');
    try {
      const res = await window.electronAPI.fillStdWeb([{ tag: 1, von: '09:00', bis: '18:00', pause: '00:45', bemerkung: 'Test', reise: '2,5' }]);
      setStatus(res && res.success ? 'Test ausgeführt.' : `Fehler: ${res && res.error}`);
      setOutput(JSON.stringify(res && res.report, null, 2));
    } finally {
      setBusy(false);
    }
  };

  const diagnose = async () => {
    if (!window.electronAPI || !window.electronAPI.diagnoseStdWeb) return;
    setBusy(true);
    setStatus('Diagnose läuft (klickt das „von"-Feld von Montag)…');
    try {
      const res = await window.electronAPI.diagnoseStdWeb();
      setStatus(res && res.success ? 'Diagnose fertig – bitte den Text unten kopieren und mir schicken.' : `Fehler: ${res && res.error}`);
      setOutput(JSON.stringify(res && res.info, null, 2));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-card">
      <h3>📤 StdWeb-Übertragung <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>(Test)</span></h3>
      <p className="settings-description">
        Experimentell: ZeitBlick öffnet StdWeb in einem Fenster und füllt die Stunden über die echte Oberfläche vor (sendet <strong>nicht</strong> ab – „Beantragen" klickst du selbst). Erst <strong>StdWeb öffnen</strong>, dort einloggen und eine <strong>leere</strong> Woche öffnen, dann Diagnose/Test starten.
      </p>
      <div className="backup-actions" style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="backup-btn" onClick={open}>🌐 StdWeb öffnen</button>
        <button className="backup-btn" onClick={diagnose} disabled={busy}>🔍 Diagnose (Montag-Feld)</button>
        <button className="backup-btn" onClick={fillTest} disabled={busy}>🧪 Test-Tag füllen (Mo)</button>
      </div>
      <div className="backup-actions" style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>Montag-Datum:</span>
        <input type="text" value={navDate} onChange={e => setNavDate(e.target.value)} placeholder="DD.MM.YYYY" style={{ width: 110, padding: '5px 8px', borderRadius: 7, border: '1px solid var(--border)' }} />
        <button className="backup-btn" onClick={navigate} disabled={busy}>🗓️ Woche ansteuern</button>
      </div>
      <div className="backup-actions" style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>Produktion:</span>
        <input type="text" value={prod} onChange={e => setProd(e.target.value)} placeholder="StdWeb-Produktionsname" style={{ width: 200, padding: '5px 8px', borderRadius: 7, border: '1px solid var(--border)' }} />
        <button className="backup-btn" onClick={() => loginTest(false)} disabled={busy}>🔑 Login-Test (Felder/Liste)</button>
        <button className="backup-btn" onClick={() => loginTest(true)} disabled={busy}>🔑 Login absenden</button>
      </div>
      {loginPerson
        ? <p className="settings-description" style={{ marginTop: 6 }}>Login-Test nutzt: <strong>{loginPerson.sesamVorname} {loginPerson.sesamName}</strong> (🔐 gespeichert)</p>
        : <p className="settings-description" style={{ marginTop: 6 }}>Hinterlege zuerst bei dir (Tab Personen, „Das bin ich") einen StdWeb-Login.</p>}
      {status && <p className="settings-description" style={{ marginTop: 8, wordBreak: 'break-word' }}>{status}</p>}
      {output && (
        <textarea
          readOnly
          value={output}
          onFocus={e => e.target.select()}
          style={{ marginTop: 8, width: '100%', minHeight: 180, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11, whiteSpace: 'pre', overflow: 'auto' }}
        />
      )}
    </div>
  );
}

export default function Settings({ settings, onSave, timesheets, setTimesheets, onSyncN8N, onRestartTour }) {
  const [newPosition, setNewPosition] = useState('');
  const [newPositionGage, setNewPositionGage] = useState('');

  // Backup state
  const [backups, setBackups] = useState([]);
  const [backupsLoaded, setBackupsLoaded] = useState(false);
  const [backupStatus, setBackupStatus] = useState(''); // status message
  const [importStatus, setImportStatus] = useState('');
  const [restoreConfirm, setRestoreConfirm] = useState(null);
  const [restoring, setRestoring] = useState(false);

  // Auto-Updater
  const { checking, result: updateResult, checkForUpdates } = useUpdateChecker();

  // App-Version
  const [appVersion, setAppVersion] = useState('');
  useEffect(() => {
    window.electronAPI?.getAppVersion?.().then(v => setAppVersion(v)).catch(() => {});
  }, []);

  const positionGagen = settings.positionGagen || {};
  const nameAliases = settings.nameAliases || {};

  // Default positions if none configured yet
  const defaultPositions = ['Oberbeleuchter', 'Best-Boy', 'Beleuchter', 'Lichtassistent'];

  // All configured positions (defaults + manually added)
  const allPositions = useMemo(() => {
    const set = new Set([...defaultPositions, ...Object.keys(positionGagen)]);
    return [...set].sort();
  }, [positionGagen]);

  // Detect potential name duplicates (similar names that might be the same person)
  const nameGroups = useMemo(() => {
    if (!timesheets || timesheets.length === 0) return [];
    const names = [...new Set(timesheets.map(ts => ts.name || 'Unbekannt'))].sort();
    
    // Find names that could be aliases (one is a substring/prefix of another + same last name)
    const suggestions = [];
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const a = names[i];
        const b = names[j];
        const partsA = a.split(/\s+/);
        const partsB = b.split(/\s+/);
        // Same last name and one first name is prefix of the other
        if (partsA.length >= 2 && partsB.length >= 2) {
          const lastA = partsA[partsA.length - 1].toLowerCase();
          const lastB = partsB[partsB.length - 1].toLowerCase();
          if (lastA === lastB) {
            const firstA = partsA[0].toLowerCase();
            const firstB = partsB[0].toLowerCase();
            if (firstA.startsWith(firstB) || firstB.startsWith(firstA)) {
              // Longer name is the canonical one
              const canonical = a.length >= b.length ? a : b;
              const alias = a.length >= b.length ? b : a;
              suggestions.push({ alias, canonical });
            }
          }
        }
      }
    }
    return suggestions;
  }, [timesheets]);

  // All unique names from timesheets
  const allNames = useMemo(() => {
    if (!timesheets || timesheets.length === 0) return [];
    return [...new Set(timesheets.map(ts => ts.name || 'Unbekannt'))].sort();
  }, [timesheets]);

  const handlePositionGageChange = (pos, value) => {
    const numVal = parseFloat(String(value).replace(',', '.')) || 0;
    const pog = { ...positionGagen };
    pog[pos] = { ...(pog[pos] || {}), tagesgage: numVal, gageType: pog[pos]?.gageType || 'tag' };
    onSave({ ...settings, positionGagen: pog });
  };

  const handlePositionGageTypeChange = (pos, type) => {
    const pog = { ...positionGagen };
    pog[pos] = { ...(pog[pos] || {}), gageType: type };
    onSave({ ...settings, positionGagen: pog });
  };

  const handleAddPosition = () => {
    if (!newPosition.trim()) return;
    const numVal = parseFloat(String(newPositionGage).replace(',', '.')) || 0;
    const pog = { ...positionGagen };
    pog[newPosition.trim()] = { tagesgage: numVal, gageType: 'tag' };
    onSave({ ...settings, positionGagen: pog });
    setNewPosition('');
    setNewPositionGage('');
  };

  const handleDeletePosition = (pos) => {
    const pog = { ...positionGagen };
    delete pog[pos];
    onSave({ ...settings, positionGagen: pog });
  };

  // Name alias handlers
  const handleAddAlias = (alias, canonical) => {
    const na = { ...nameAliases, [alias]: canonical };
    onSave({ ...settings, nameAliases: na });
  };

  const handleRemoveAlias = (alias) => {
    const na = { ...nameAliases };
    delete na[alias];
    onSave({ ...settings, nameAliases: na });
  };

  const [settingsTab, setSettingsTab] = useState('gagen');

  // n8n-Anbindung
  const [n8nFolderInput, setN8nFolderInput] = useState(settings.n8nFolder || '');
  const [n8nDefaultFolder, setN8nDefaultFolder] = useState('');
  const [n8nStatus, setN8nStatus] = useState('');
  useEffect(() => {
    if (window.electronAPI && window.electronAPI.getDefaultN8NFolder) {
      window.electronAPI.getDefaultN8NFolder().then(p => setN8nDefaultFolder(p || '')).catch(() => {});
    }
  }, []);
  const handleSaveN8nFolder = () => { onSave({ ...settings, n8nFolder: n8nFolderInput.trim() }); setN8nStatus('Ordner gespeichert.'); setTimeout(() => setN8nStatus(''), 3000); };
  const handleToggleN8n = () => onSave({ ...settings, n8nEnabled: !settings.n8nEnabled });
  const handleSyncN8n = async () => { setN8nStatus('Synchronisiere…'); try { await (onSyncN8N && onSyncN8N()); setN8nStatus('Synchronisierung gestartet.'); } catch { setN8nStatus('Fehler bei der Synchronisierung.'); } setTimeout(() => setN8nStatus(''), 4000); };

  const settingsNavItems = [
    { id: 'gagen', label: 'Gagen', icon: '💶' },
    { id: 'namen', label: 'Namen & Aliases', icon: '👤' },
    { id: 'n8n', label: 'n8n', icon: '🔗' },
    { id: 'system', label: 'System & Export', icon: '⚙️' },
  ];

  return (
    <div className="settings-view">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-.3px', color: 'var(--ink)' }}>Einstellungen</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 3 }}>Gagen, Namen und App-Konfiguration</div>
        </div>
      </div>
      <div className="v3-settings-layout">
        {/* Linke Nav */}
        <div className="v3-settings-nav">
          {settingsNavItems.map(item => (
            <button
              key={item.id}
              className={`v3-settings-nav-btn${settingsTab === item.id ? ' active' : ''}`}
              onClick={() => setSettingsTab(item.id)}
            >
              <span>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
        {/* Rechtes Panel */}
        <div>
      {settingsTab === 'n8n' && (
      <div className="v3-settings-panel">
        <div className="v3-settings-panel-title">n8n-Anbindung</div>
        <div className="v3-settings-panel-sub">Automatischer Import von Stundenzetteln & Zusatzpersonal aus JSON-Dateien (.txt) in deinem iCloud-Ordner.</div>

        <div className="settings-card">
          <h3>🔗 n8n-Import</h3>
          <p className="settings-description">
            n8n ist ein Automatisierungs-Tool. Ein n8n-Workflow legt JSON-Dateien in deinen iCloud-Ordner, die ZeitBlick automatisch zu Stundenzetteln verarbeitet. Verarbeitete Dateien werden nach „_verarbeitet" verschoben.
          </p>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '10px 0' }}>
            <input type="checkbox" checked={!!settings.n8nEnabled} onChange={handleToggleN8n} />
            <span>Automatischer Import aktiv (Überwachung + Scan beim Start)</span>
          </label>

          <div className="project-field" style={{ marginTop: 8 }}>
            <label>iCloud-Ordner</label>
            <input
              type="text"
              value={n8nFolderInput}
              onChange={e => setN8nFolderInput(e.target.value)}
              placeholder={n8nDefaultFolder || '~/Library/Mobile Documents/com~apple~CloudDocs/ZeitBlick'}
            />
            {n8nDefaultFolder && !n8nFolderInput && <span className="project-field-hint">Standard: {n8nDefaultFolder}</span>}
          </div>

          <div className="backup-actions" style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button className="backup-btn" onClick={handleSaveN8nFolder}>💾 Ordner speichern</button>
            <button className="backup-btn" onClick={handleSyncN8n}>🔄 Jetzt synchronisieren</button>
          </div>
          {n8nStatus && <p className="settings-description" style={{ marginTop: 8 }}>{n8nStatus}</p>}
        </div>

        <N8NSetupGuide folder={n8nFolderInput || n8nDefaultFolder} />

        <AppleShortcutsCard />

        <StdWebTestCard team={settings.team || []} />
      </div>
      )}
      {settingsTab === 'gagen' && (
      <div className="v3-settings-panel">
        <div className="v3-settings-panel-title">Gagen nach Position</div>
        <div className="v3-settings-panel-sub">Standard-Gagen für Positionen festlegen. Diese werden automatisch für Personen mit der jeweiligen Position verwendet.</div>

        <div className="settings-card">
          <div className="person-gage-list">
            {allPositions.map(pos => {
              const pg = positionGagen[pos] || {};
              const gt = pg.gageType || 'tag';
              return (
                <div key={pos} className="person-gage-row">
                  <div className="person-gage-info">
                    <span className="person-gage-name">{pos}</span>
                  </div>
                  <div className="person-gage-inputs">
                    <div className="mini-gage-toggle">
                      <button className={`mini-toggle-btn ${gt === 'tag' ? 'active' : ''}`} onClick={() => handlePositionGageTypeChange(pos, 'tag')}>Tag</button>
                      <button className={`mini-toggle-btn ${gt === 'woche' ? 'active' : ''}`} onClick={() => handlePositionGageTypeChange(pos, 'woche')}>Woche</button>
                    </div>
                    <div className="person-gage-input-group">
                      <input
                        type="text"
                        className="person-gage-input"
                        value={pg.tagesgage || ''}
                        onChange={e => handlePositionGageChange(pos, e.target.value)}
                        placeholder={gt === 'tag' ? 'z.B. 500' : 'z.B. 2.500'}
                      />
                      <span className="person-gage-unit">€/{gt === 'tag' ? 'Tag' : 'Wo.'}</span>
                    </div>
                    {!defaultPositions.includes(pos) && (
                      <button className="spesen-delete-btn" onClick={() => handleDeletePosition(pos)} title="Position entfernen">×</button>
                    )}
                  </div>
                </div>
              );
            })}
            <div className="person-gage-row person-gage-add">
              <input
                type="text"
                className="person-gage-input"
                placeholder="Neue Position..."
                value={newPosition}
                onChange={e => setNewPosition(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddPosition()}
              />
              <input
                type="text"
                className="person-gage-input"
                placeholder="Gage"
                value={newPositionGage}
                onChange={e => setNewPositionGage(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddPosition()}
              />
              <button className="spesen-add-btn" onClick={handleAddPosition} title="Position hinzufügen">+</button>
            </div>
          </div>
        </div>
      </div>
      )}

      {settingsTab === 'namen' && (
      <div className="v3-settings-panel">
        <div className="v3-settings-panel-title">Namen & Aliases</div>
        <div className="v3-settings-panel-sub">Gleiche Personen mit verschiedenen Schreibweisen zusammenfassen.</div>

        <div className="settings-card">
          <p className="settings-description">Alle Einträge werden unter dem Hauptnamen zusammengeführt.</p>

          {Object.keys(nameAliases).length > 0 && (
            <div className="person-gage-list" style={{ marginBottom: 12 }}>
              {Object.entries(nameAliases).map(([alias, canonical]) => (
                <div key={alias} className="person-gage-row">
                  <div className="person-gage-info">
                    <span className="person-gage-name">{alias}</span>
                    <span className="person-gage-position">→ wird als „{canonical}" behandelt</span>
                  </div>
                  <button className="spesen-delete-btn" onClick={() => handleRemoveAlias(alias)} title="Alias entfernen">×</button>
                </div>
              ))}
            </div>
          )}

          {nameGroups.filter(s => !nameAliases[s.alias]).length > 0 && (
            <div className="person-gage-list" style={{ marginBottom: 12 }}>
              <p className="settings-description" style={{ marginBottom: 8, fontSize: '0.8rem', color: 'var(--accent-yellow, #f9ca24)' }}>⚠️ Mögliche Duplikate erkannt:</p>
              {nameGroups.filter(s => !nameAliases[s.alias]).map(s => (
                <div key={s.alias} className="person-gage-row" style={{ borderColor: 'var(--accent-yellow, #f9ca24)', borderStyle: 'dashed' }}>
                  <div className="person-gage-info">
                    <span className="person-gage-name">„{s.alias}" → „{s.canonical}"</span>
                    <span className="person-gage-position">Gleiche Person?</span>
                  </div>
                  <button className="apply-position-btn" style={{ width: 'auto', padding: '5px 14px', marginTop: 0, fontSize: '0.8rem' }} onClick={() => handleAddAlias(s.alias, s.canonical)}>
                    Zusammenführen
                  </button>
                </div>
              ))}
            </div>
          )}

          {Object.keys(nameAliases).length === 0 && nameGroups.length === 0 && (
            <p className="settings-description" style={{ color: 'var(--muted)' }}>Keine Duplikate erkannt. Sobald Stundenzettel mit ähnlichen Namen vorliegen, erscheinen hier Vorschläge.</p>
          )}

          {allNames.length > 1 && (
            <ManualAliasAdder names={allNames} existingAliases={nameAliases} onAdd={handleAddAlias} />
          )}
        </div>
      </div>
      )}

      {settingsTab === 'system' && (
      <div className="v3-settings-panel">
        <div className="v3-settings-panel-title">System & Export</div>
        <div className="v3-settings-panel-sub">Backup, Daten-Import/Export, Updates und Tarifinfos.</div>

        <div className="settings-card">
          <h3>💾 Backup & Daten</h3>
          <p className="settings-description">Erstelle Backups deiner Daten, stelle sie wieder her, oder exportiere/importiere alle Daten.</p>
          <div style={{ marginBottom: 12 }}>
            <button className="backup-btn" onClick={() => window.electronAPI?.openDataFolder?.()}>
              📂 Datenordner im Finder öffnen
            </button>
          </div>

          <div className="backup-actions-grid">
            <div className="backup-action-group">
              <h4 className="backup-group-title">Backup</h4>
              <button className="backup-btn backup-btn-create" onClick={async () => {
                try {
                  setBackupStatus('Erstelle Backup...');
                  const result = await window.electronAPI.createBackup();
                  if (result.success) {
                    setBackupStatus(`✅ Backup erstellt: ${result.path.split('/').pop()}`);
                    setBackupsLoaded(false);
                  } else {
                    setBackupStatus(`❌ Fehler: ${result.error}`);
                  }
                } catch (e) { setBackupStatus(`❌ ${e.message}`); }
              }}>
                📦 Backup erstellen
              </button>
              <button className="backup-btn" onClick={async () => {
                try {
                  const list = await window.electronAPI.listBackups();
                  if (list.success) {
                    setBackups(list.backups || []);
                    setBackupsLoaded(true);
                  } else {
                    setBackupStatus(`❌ ${list.error}`);
                  }
                } catch (e) { setBackupStatus(`❌ ${e.message}`); }
              }}>
                📋 Backups anzeigen
              </button>
            </div>

            <div className="backup-action-group">
              <h4 className="backup-group-title">Daten-Export/Import</h4>
              <button className="backup-btn" onClick={async () => {
                try {
                  setImportStatus('Exportiere...');
                  const result = await window.electronAPI.exportData();
                  if (result.success) {
                    setImportStatus(`✅ Exportiert nach: ${result.path.split('/').pop()}`);
                  } else if (result.cancelled) {
                    setImportStatus('');
                  } else {
                    setImportStatus(`❌ ${result.error}`);
                  }
                } catch (e) { setImportStatus(`❌ ${e.message}`); }
              }}>
                📤 Daten exportieren (JSON)
              </button>
              <button className="backup-btn" onClick={async () => {
                if (!confirm('Importierte Daten ERSETZEN alle aktuellen Daten. Vorher ein Backup erstellen!\n\nFortfahren?')) return;
                try {
                  setImportStatus('Importiere...');
                  const result = await window.electronAPI.importDataFile();
                  if (result.success) {
                    setImportStatus(`✅ ${result.count || 0} Stundenzettel importiert. App wird neu geladen...`);
                    setTimeout(() => window.location.reload(), 1500);
                  } else if (result.cancelled) {
                    setImportStatus('');
                  } else {
                    setImportStatus(`❌ ${result.error}`);
                  }
                } catch (e) { setImportStatus(`❌ ${e.message}`); }
              }}>
                📥 Daten importieren (JSON)
              </button>
            </div>
          </div>

          {backupStatus && <p className="backup-status">{backupStatus}</p>}
          {importStatus && <p className="backup-status">{importStatus}</p>}

          {backupsLoaded && backups.length > 0 && (
            <div className="backup-list">
              <h4>Vorhandene Backups ({backups.length})</h4>
              {backups.map((b, i) => (
                <div key={i} className="backup-row">
                  <div className="backup-row-info">
                    <span className="backup-row-name">{b.name}</span>
                    <span className="backup-row-date">{new Date(b.created).toLocaleString('de-DE')}</span>
                    <span className="backup-row-size">{(b.size / 1024).toFixed(0)} KB</span>
                  </div>
                  <button className="backup-btn backup-btn-restore" onClick={() => setRestoreConfirm(b)}>
                    🔄 Wiederherstellen
                  </button>
                </div>
              ))}
            </div>
          )}
          {backupsLoaded && backups.length === 0 && (
            <p className="settings-description" style={{ marginTop: 8 }}>Keine Backups vorhanden.</p>
          )}

          {restoreConfirm && (
            <div className="confirm-overlay">
              <div className="confirm-dialog">
                <h3>Backup wiederherstellen?</h3>
                <p>Alle aktuellen Daten werden durch das Backup <strong>{restoreConfirm.name}</strong> vom {new Date(restoreConfirm.created).toLocaleString('de-DE')} ersetzt.</p>
                <p style={{ color: 'var(--accent-red, #e74c3c)' }}>⚠️ Diese Aktion kann nicht rückgängig gemacht werden!</p>
                <div className="confirm-actions">
                  <button className="btn-cancel" onClick={() => setRestoreConfirm(null)} disabled={restoring}>Abbrechen</button>
                  <button className="btn-confirm-delete" onClick={async () => {
                    setRestoring(true);
                    try {
                      const result = await window.electronAPI.restoreBackup(restoreConfirm.path);
                      if (result.success) {
                        setBackupStatus('✅ Backup wiederhergestellt. App wird neu geladen...');
                        setRestoreConfirm(null);
                        setTimeout(() => window.location.reload(), 1500);
                      } else {
                        setBackupStatus(`❌ ${result.error}`);
                        setRestoreConfirm(null);
                      }
                    } catch (e) {
                      setBackupStatus(`❌ ${e.message}`);
                      setRestoreConfirm(null);
                    }
                    setRestoring(false);
                  }} disabled={restoring}>
                    {restoring ? '⏳ Wiederherstellung...' : 'Wiederherstellen'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="settings-card">
          <h3>🧭 Einführung</h3>
          <p className="settings-description">Den Rundgang mit den wichtigsten Funktionen (inkl. n8n) erneut ansehen.</p>
          <div className="backup-actions" style={{ marginTop: 8 }}>
            <button className="backup-btn" onClick={() => onRestartTour && onRestartTour()}>🧭 Rundgang erneut starten</button>
          </div>
        </div>

        <div className="settings-card">
          <h3>🔄 Updates</h3>
          {appVersion && (
            <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8, marginTop: -4 }}>
              Installierte Version: <strong style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>v{appVersion}</strong>
            </p>
          )}
          <p className="settings-description">ZeitBlick prüft automatisch auf neue Versionen. Du kannst auch manuell nach Updates suchen.</p>
          <div className="update-check-section">
            <button className="backup-btn" onClick={checkForUpdates} disabled={checking}>
              {checking ? '⏳ Prüfe...' : '🔍 Nach Updates suchen'}
            </button>
            {updateResult && (
              <span className="update-check-result">
                {updateResult.error
                  ? `❌ ${updateResult.error}`
                  : updateResult.success && updateResult.updateInfo
                    ? `✅ Version ${updateResult.updateInfo.version} verfügbar!`
                    : '✅ Du hast die neueste Version.'
                }
              </span>
            )}
          </div>
        </div>

        <div className="settings-card">
          <h3>TV-FFS 2025 – Berechnungsregeln</h3>
          <p className="settings-description">Tarifvertrag vom 12. Oktober 2024, Gagentarifvertrag 2024-2026</p>
          <div className="tvffs-info">
            <div className="tvffs-rule"><span className="rule-label">Wochengage (TZ 5.3.1)</span><span className="rule-value">5-Tage-Woche, bis 50h/Woche</span></div>
            <div className="tvffs-rule"><span className="rule-label">Stundengage (TZ 5.7.1)</span><span className="rule-value">1/10 Tagesgage = 1/50 Wochengage</span></div>
            <div className="tvffs-rule"><span className="rule-label">Tägl. Mehrarbeit (TZ 5.4.3.2)</span><span className="rule-value">11. Std: 25%, ab 12. Std: 50%</span></div>
            <div className="tvffs-rule"><span className="rule-label">Wöch. Mehrarbeit (TZ 5.4.3.3)</span><span className="rule-value">51.–55. Std: 25%, ab 56. Std: 50%</span></div>
            <div className="tvffs-rule"><span className="rule-label">Nachtzuschlag (TZ 5.5)</span><span className="rule-value">25% (22:00–06:00)</span></div>
            <div className="tvffs-rule"><span className="rule-label">Samstag (TZ 5.6.4)</span><span className="rule-value">25% Zuschlag</span></div>
            <div className="tvffs-rule"><span className="rule-label">Sonntag (TZ 5.6.3)</span><span className="rule-value">75% Zuschlag + Ruhetag</span></div>
            <div className="tvffs-rule"><span className="rule-label">Feiertag (TZ 5.6.3)</span><span className="rule-value">100% Zuschlag</span></div>
            <div className="tvffs-rule"><span className="rule-label">Urlaub (TZ 14.1)</span><span className="rule-value">0,5 Tage / 7 Tage Vertragszeit (gesammelt, nicht ausgezahlt)</span></div>
            <div className="tvffs-rule"><span className="rule-label">Krankheit (TZ 13.3)</span><span className="rule-value">Bezahlter Tag, bis 6 Wochen</span></div>
          </div>
        </div>
      </div>
      )}
      </div>
      </div>
    </div>
  );
}

// Small sub-component for manually adding aliases
function ManualAliasAdder({ names, existingAliases, onAdd }) {
  const [aliasFrom, setAliasFrom] = useState('');
  const [aliasTo, setAliasTo] = useState('');

  const availableNames = names.filter(n => !existingAliases[n]);

  const handleAdd = () => {
    if (aliasFrom && aliasTo && aliasFrom !== aliasTo) {
      onAdd(aliasFrom, aliasTo);
      setAliasFrom('');
      setAliasTo('');
    }
  };

  return (
    <div className="person-gage-row person-gage-add" style={{ marginTop: '10px' }}>
      <select
        className="person-gage-input"
        value={aliasFrom}
        onChange={e => setAliasFrom(e.target.value)}
        style={{ width: '140px' }}
      >
        <option value="">Alias-Name...</option>
        {availableNames.map(n => <option key={n} value={n}>{n}</option>)}
      </select>
      <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>→</span>
      <select
        className="person-gage-input"
        value={aliasTo}
        onChange={e => setAliasTo(e.target.value)}
        style={{ width: '140px' }}
      >
        <option value="">Hauptname...</option>
        {availableNames.filter(n => n !== aliasFrom).map(n => <option key={n} value={n}>{n}</option>)}
      </select>
      <button className="spesen-add-btn" onClick={handleAdd} title="Alias hinzufügen">+</button>
    </div>
  );
}

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { parseDispoFilename, formatDispoDate, MONTHS_DE } from '../utils/dispoParser';
import n8nDispoWorkflow from '../assets/n8nDispoWorkflow.json';

/**
 * Baut die n8n-Workflow-Vorlage als JSON-String, mit dem konkreten
 * ZeitBlick-Ordner des Nutzers anstelle des Platzhalters.
 */
function buildN8NWorkflowJson(folderPath) {
  const base = (folderPath || '/Users/DEINNAME/Library/Mobile Documents/com~apple~CloudDocs/ZeitBlick').replace(/\/+$/, '');
  return JSON.stringify(n8nDispoWorkflow, null, 2).replaceAll('__FOLDER__', base);
}

/**
 * Einrichtungshilfe für die n8n-Anbindung, direkt im Dispos-Tab.
 * Wird angezeigt, wenn noch keine Dispos vorhanden sind und kein Ordner
 * konfiguriert ist. Zeigt 5 Schritte mit Kopier-Buttons.
 */
function N8NDispoGuide({ n8nFolder, onGoToSettings }) {
  const [copied, setCopied] = useState('');
  const copy = (key, text) => {
    try { navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(''), 1500); } catch { /* ignore */ }
  };
  const folderPath = n8nFolder || '/Users/DEINNAME/Library/Mobile Documents/com~apple~CloudDocs/ZeitBlick';
  const workflowJson = useMemo(() => buildN8NWorkflowJson(folderPath), [folderPath]);
  const CopyBtn = ({ id, text }) => (
    <button type="button" className="n8n-copy-btn" onClick={() => copy(id, text)}>
      {copied === id ? '✓ Kopiert' : 'Kopieren'}
    </button>
  );
  return (
    <div className="dispos-setup-guide">
      <div className="dispos-setup-hero">
        <div className="dispos-setup-icon">🤖</div>
        <div className="dispos-setup-heading">Dispos automatisch importieren</div>
        <p className="dispos-setup-sub">
          Mit <strong>n8n</strong> holst du Dispo-PDFs direkt aus deinem Mailpostfach – vollautomatisch.
          ZeitBlick erkennt neue Dateien im Ordner und zeigt sie hier an. Einmalig einrichten, dauerhaft nutzen.
        </p>
      </div>

      <div className="n8n-steps-list">
        <div className="n8n-step">
          <div className="n8n-step-num">1</div>
          <div className="n8n-step-content">
            <div className="n8n-step-title">ZeitBlick-Ordner in iCloud anlegen</div>
            <p>Erstelle einen Ordner <code>ZeitBlick</code> in deiner iCloud Drive und darin einen Unterordner <code>Dispos</code> (für mehr Übersicht). Dorthin legt n8n später die PDFs ab:</p>
            <div className="n8n-code-row">
              <code className="n8n-code">{folderPath}</code>
              <CopyBtn id="folder" text={folderPath} />
            </div>
            {onGoToSettings && (
              <p className="n8n-hint">
                Den Ordnerpfad kannst du in{' '}
                <button type="button" className="n8n-link-btn" onClick={onGoToSettings}>Einstellungen → Dispos &amp; n8n</button>
                {' '}anpassen. Ersetze <code>DEINNAME</code> mit deinem macOS-Benutzernamen (z. B. <code>tillpallapies</code>).
              </p>
            )}
          </div>
        </div>

        <div className="n8n-step">
          <div className="n8n-step-num">2</div>
          <div className="n8n-step-content">
            <div className="n8n-step-title">n8n installieren</div>
            <p>n8n ist ein kostenloses Open-Source-Tool. Am einfachsten startest du es lokal per <code>npx</code>:</p>
            <div className="n8n-code-row">
              <code className="n8n-code">npx n8n</code>
              <CopyBtn id="npx" text="npx n8n" />
            </div>
            <p className="n8n-hint">Alternativ: n8n Cloud (n8n.io). Für iCloud auf deinem Mac ist die lokale Variante am einfachsten.</p>
          </div>
        </div>

        <div className="n8n-step">
          <div className="n8n-step-num">3</div>
          <div className="n8n-step-content">
            <div className="n8n-step-title">Fertige Workflow-Vorlage importieren</div>
            <p>Du musst nichts selbst bauen. Öffne n8n im Browser (<code>localhost:5678</code>), lege einen <strong>neuen Workflow</strong> an, kopiere die Vorlage und füge sie mit <code>⌘V</code> ein (oder <strong>⋯-Menü → Import from Clipboard</strong>).</p>
            <div className="n8n-template-box">
              <div className="n8n-template-info">
                <span className="n8n-template-ic">📋</span>
                <div>
                  <div className="n8n-template-name">ZeitBlick · Dispo-Import</div>
                  <div className="n8n-template-desc">Prüft dein Postfach jede Minute, erkennt Dispo-/Callsheet-PDFs und legt sie automatisch im <code>Dispos</code>-Ordner ab.</div>
                </div>
              </div>
              <CopyBtn id="wf" text={workflowJson} />
            </div>
            <p className="n8n-hint">Der Zielordner ist in der Vorlage bereits auf deinen ZeitBlick-Ordner gesetzt: <code>{folderPath}/Dispos/</code></p>
          </div>
        </div>

        <div className="n8n-step">
          <div className="n8n-step-num">4</div>
          <div className="n8n-step-content">
            <div className="n8n-step-title">Postfach verbinden (IMAP)</div>
            <p>Die Vorlage nutzt zwei IMAP-Knoten (<em>GetEmailsList</em> &amp; <em>DownloadAttachment</em>). Öffne einen davon, klicke bei <strong>Credential</strong> auf „Create new" und trage die IMAP-Daten deines Mail-Anbieters ein (Server, Port, Benutzer, Passwort). Beide Knoten teilen sich dieselbe Credential.</p>
            <p className="n8n-hint">💡 Bei Gmail: ein <strong>App-Passwort</strong> unter google.com/myaccount → Sicherheit erzeugen (nicht dein normales Passwort). Der <code>n8n-nodes-imap-enhanced</code>-Knoten muss ggf. unter „Settings → Community Nodes" installiert werden.</p>
          </div>
        </div>

        <div className="n8n-step">
          <div className="n8n-step-num">5</div>
          <div className="n8n-step-content">
            <div className="n8n-step-title">Dateinamen für beste Erkennung</div>
            <p>ZeitBlick liest <strong>Datum</strong>, <strong>Drehtag</strong> und <strong>Projekt</strong> aus dem Dateinamen. Diese Formate werden erkannt:</p>
            <ul className="n8n-list">
              <li><strong>Datum:</strong> <code>26.03.26</code>, <code>26.03.2026</code>, <code>260326</code> oder <code>20260326</code></li>
              <li><strong>Drehtag:</strong> <code>DT 1</code>, <code>22. DT</code>, <code>SD 49</code>, <code>Aufbautag</code>, <code>Nachdreh</code></li>
              <li><strong>Projekt:</strong> voller Name, Kürzel oder Projektnummer</li>
            </ul>
            <p className="n8n-hint">Wird das Projekt nicht erkannt, ordnest du es per Dropdown direkt in der Liste zu.</p>
          </div>
        </div>

        <div className="n8n-step">
          <div className="n8n-step-num">6</div>
          <div className="n8n-step-content">
            <div className="n8n-step-title">Aktivieren &amp; hier synchronisieren</div>
            <p>Stelle den Workflow in n8n oben rechts auf <strong>„Active"</strong> – so läuft er dauerhaft im Hintergrund. Klicke dann hier auf <strong>„↻ Synchronisieren"</strong>: ZeitBlick liest den Ordner und zeigt neue Dispos als Karten an.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Dispos – Listenansicht für Dispo-PDFs.
 * Projekt aus dem Dateinamen und zeigt sie chronologisch. Klick öffnet das
 * PDF in einem eingebauten Viewer.
 *
 * Props:
 *  dispos          – settings.dispos: [{ id, storedName, originalName, datumISO, drehtag, projekt, importedAt }]
 *  onChange(next)  – speichert die aktualisierte Dispo-Liste
 *  projects        – settings.projects (für Projekt-Zuordnung + Erraten)
 *  n8nFolder       – aktueller n8n-Ordnerpfad
 */
export default function Dispos({ dispos = [], onChange, projects = {}, n8nFolder = '', homeAddress = '', kmRate = 0.30, kmRoundTrip = false, onKmSettingsChange, onGoToSettings }) {
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [quickFilter, setQuickFilter] = useState('all'); // all | upcoming | week | unassigned
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [viewer, setViewer] = useState(null); // { id, title, dataUrl }
  const [computingIds, setComputingIds] = useState(() => new Set()); // Dispos, deren Entfernung gerade berechnet wird
  const [showKmReport, setShowKmReport] = useState(false);
  const [batchProgress, setBatchProgress] = useState(null); // { done, total } während Sammelberechnung

  const projectNames = useMemo(() => Object.keys(projects || {}).sort(), [projects]);

  // ----- Sync: neue PDFs aus dem n8n-Ordner erkennen & importieren -----
  const handleSync = useCallback(async () => {
    if (!window.electronAPI || !window.electronAPI.scanDispos) return;
    setSyncing(true);
    setSyncMsg('');
    try {
      const folder = n8nFolder || (window.electronAPI.getDefaultN8NFolder ? await window.electronAPI.getDefaultN8NFolder() : '');
      const res = await window.electronAPI.scanDispos(folder);
      if (!res || !res.success) { setSyncMsg(res?.error || 'Ordner nicht gefunden'); setSyncing(false); return; }
      const knownOriginals = new Set((dispos || []).map(d => d.originalName));
      const fallbackYear = new Date().getFullYear();
      const added = [];
      for (const { file } of res.files) {
        if (knownOriginals.has(file)) continue;
        const imp = await window.electronAPI.importDispo(folder, file);
        if (!imp || !imp.success) continue;
        const parsed = parseDispoFilename(file, projects, fallbackYear);
        const motive = (imp.addresses && imp.addresses.motive) || [];
        added.push({
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
          storedName: imp.storedName,
          originalName: file,
          datumISO: parsed.datumISO,
          drehtag: parsed.drehtag,
          projekt: parsed.projektGuess || '',
          title: parsed.title,
          importedAt: Date.now(),
          motivAdressen: motive, // erkannte Vorschläge [{ label, address }]
          motivAdresse: (imp.addresses && imp.addresses.suggested) || '', // gewählte/editierte Adresse
        });
      }
      const allDispos = [...(dispos || []), ...added];
      if (added.length) {
        onChange(allDispos);
        setSyncMsg(`${added.length} neue Disposition${added.length > 1 ? 'en' : ''} importiert`);
      } else {
        setSyncMsg('Keine neuen Dispos gefunden');
      }
      // Alle Dispos (neue + bereits bekannte) nach Jahr/Projekt einsortieren.
      // Idempotent: bereits korrekt liegende Dateien werden nicht bewegt.
      if (window.electronAPI.organizeDispo) {
        for (const d of allDispos) {
          const year = d.datumISO ? d.datumISO.slice(0, 4) : '';
          try { await window.electronAPI.organizeDispo(folder, d.originalName, year, d.projekt || ''); } catch (_) {}
        }
      }
    } catch (e) {
      setSyncMsg('Fehler beim Synchronisieren');
    } finally {
      setSyncing(false);
    }
  }, [dispos, onChange, projects, n8nFolder]);

  // Auto-Sync beim ersten Öffnen
  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    handleSync();
  }, [handleSync]);

  // ----- Projekt manuell zuordnen (+ Datei in Ordnerstruktur umsortieren) -----
  const assignProject = useCallback((id, projekt) => {
    const target = (dispos || []).find(d => d.id === id);
    onChange((dispos || []).map(d => d.id === id ? { ...d, projekt } : d));
    if (target && window.electronAPI && window.electronAPI.organizeDispo) {
      const year = target.datumISO ? target.datumISO.slice(0, 4) : '';
      window.electronAPI.organizeDispo(n8nFolder, target.originalName, year, projekt).catch(() => {});
    }
  }, [dispos, onChange, n8nFolder]);

  // ----- Motiv-Adresse manuell setzen/korrigieren -----
  // Beim Ändern wird ein evtl. zwischengespeicherter km-Wert verworfen.
  const setMotivAddress = useCallback((id, address) => {
    onChange((dispos || []).map(d => d.id === id
      ? { ...d, motivAdresse: address, distanzKm: undefined, distanzMin: undefined, distanzFuer: undefined, distanzError: undefined }
      : d));
  }, [dispos, onChange]);

  // ----- Fahrstrecke zur Motiv-Adresse berechnen -----
  const computeDistanceFor = useCallback(async (dispo) => {
    if (!window.electronAPI || !window.electronAPI.computeDistance) return;
    if (!homeAddress) { setSyncMsg('Erst eine Karteikarte als „Das bin ich" markieren (Tab Personen)'); return; }
    if (!dispo.motivAdresse) return;
    setComputingIds(prev => new Set(prev).add(dispo.id));
    try {
      const res = await window.electronAPI.computeDistance(homeAddress, dispo.motivAdresse);
      onChange((dispos || []).map(d => d.id === dispo.id
        ? (res && res.success
            ? { ...d, distanzKm: res.km, distanzMin: res.durationMin, distanzFuer: { home: homeAddress, motiv: dispo.motivAdresse }, distanzError: '' }
            : { ...d, distanzKm: undefined, distanzError: (res && res.error) || 'Berechnung fehlgeschlagen' })
        : d));
    } catch (e) {
      onChange((dispos || []).map(d => d.id === dispo.id ? { ...d, distanzError: 'Berechnung fehlgeschlagen' } : d));
    } finally {
      setComputingIds(prev => { const n = new Set(prev); n.delete(dispo.id); return n; });
    }
  }, [dispos, onChange, homeAddress]);

  // ----- Alle fehlenden Entfernungen berechnen (für die Fahrtkosten-Übersicht) -----
  // Sammelt erst alle Ergebnisse und schreibt sie dann in EINEM Update zurück,
  // damit sich sequentielle Aufrufe nicht gegenseitig überschreiben.
  const computeAllMissing = useCallback(async () => {
    if (!window.electronAPI || !window.electronAPI.computeDistance || !homeAddress) {
      if (!homeAddress) setSyncMsg('Erst eine Karteikarte als „Das bin ich" markieren (Tab Personen)');
      return;
    }
    const todo = (dispos || []).filter(d => d.motivAdresse && !(d.distanzFuer && d.distanzFuer.motiv === d.motivAdresse && d.distanzFuer.home === homeAddress));
    if (todo.length === 0) return;
    setBatchProgress({ done: 0, total: todo.length });
    const results = new Map();
    for (let i = 0; i < todo.length; i++) {
      const d = todo[i];
      try {
        const res = await window.electronAPI.computeDistance(homeAddress, d.motivAdresse);
        if (res && res.success) results.set(d.id, { km: res.km, min: res.durationMin });
        else results.set(d.id, { error: (res && res.error) || 'Fehler' });
      } catch (_) {
        results.set(d.id, { error: 'Berechnung fehlgeschlagen' });
      }
      setBatchProgress({ done: i + 1, total: todo.length });
    }
    onChange((dispos || []).map(d => {
      const r = results.get(d.id);
      if (!r) return d;
      return r.error
        ? { ...d, distanzError: r.error }
        : { ...d, distanzKm: r.km, distanzMin: r.min, distanzFuer: { home: homeAddress, motiv: d.motivAdresse }, distanzError: '' };
    }));
    setBatchProgress(null);
  }, [dispos, onChange, homeAddress]);

  const handleDelete = useCallback(async (d) => {
    if (window.electronAPI && window.electronAPI.deleteDispo) {
      try { await window.electronAPI.deleteDispo(d.storedName); } catch (_) {}
    }
    onChange((dispos || []).filter(x => x.id !== d.id));
  }, [dispos, onChange]);

  // ----- Ordner / Datei im Finder öffnen -----
  const openDispoFolder = useCallback(async () => {
    if (!window.electronAPI || !window.electronAPI.openDispoFolder) return;
    const res = await window.electronAPI.openDispoFolder(n8nFolder);
    if (!res || !res.success) setSyncMsg(res?.error || 'Ordner konnte nicht geöffnet werden');
  }, [n8nFolder]);

  const revealDispo = useCallback(async (d) => {
    if (!window.electronAPI || !window.electronAPI.revealDispo) return;
    const res = await window.electronAPI.revealDispo(n8nFolder, d.originalName);
    if (!res || !res.success) setSyncMsg(res?.error || 'Datei konnte nicht angezeigt werden');
  }, [n8nFolder]);

  // ----- PDF öffnen (eingebauter Viewer) -----
  const openViewer = useCallback(async (d) => {
    if (!window.electronAPI || !window.electronAPI.readDispo) return;
    const res = await window.electronAPI.readDispo(d.storedName);
    if (!res || !res.success) { setViewer({ id: d.id, title: d.title || d.originalName, error: res?.error || 'PDF konnte nicht geladen werden' }); return; }
    setViewer({ id: d.id, title: d.title || d.originalName, dataUrl: `data:application/pdf;base64,${res.data}` });
  }, []);

  // ----- Filtern + sortieren + nach Monat gruppieren -----
  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const weekEnd = new Date(now); weekEnd.setDate(now.getDate() + 7);

    let list = (dispos || []).filter(d => {
      if (projectFilter && (d.projekt || '') !== projectFilter) return false;
      if (q && !(`${d.title || ''} ${d.originalName || ''} ${d.drehtag || ''} ${d.projekt || ''}`.toLowerCase().includes(q))) return false;
      if (quickFilter === 'unassigned' && d.projekt) return false;
      if (quickFilter === 'upcoming' || quickFilter === 'week') {
        if (!d.datumISO) return false;
        const dt = new Date(d.datumISO + 'T12:00:00');
        if (quickFilter === 'upcoming' && dt < now) return false;
        if (quickFilter === 'week' && (dt < now || dt > weekEnd)) return false;
      }
      return true;
    });

    // Sortierung: nach Datum absteigend (neueste/kommende oben), undatierte ans Ende
    list.sort((a, b) => {
      if (!a.datumISO && !b.datumISO) return (b.importedAt || 0) - (a.importedAt || 0);
      if (!a.datumISO) return 1;
      if (!b.datumISO) return -1;
      return b.datumISO.localeCompare(a.datumISO);
    });

    // Nach Monat gruppieren
    const groups = [];
    let curKey = null, curGroup = null;
    for (const d of list) {
      const key = d.datumISO ? d.datumISO.slice(0, 7) : 'ohne';
      if (key !== curKey) {
        curKey = key;
        const label = d.datumISO
          ? `${MONTHS_DE[+d.datumISO.slice(5, 7) - 1]} ${d.datumISO.slice(0, 4)}`
          : 'Ohne Datum';
        curGroup = { key, label, items: [] };
        groups.push(curGroup);
      }
      curGroup.items.push(d);
    }
    return groups;
  }, [dispos, search, projectFilter, quickFilter]);

  const total = (dispos || []).length;
  const unassignedCount = (dispos || []).filter(d => !d.projekt).length;

  return (
    <div className="dispos-container">
      <div className="dispos-head">
        <h1 className="dispos-title">Dispos</h1>
        <span className="dispos-count">{total} Disposition{total === 1 ? '' : 'en'}</span>
        <div className="dispos-head-spacer" />
        {syncMsg && <span className="dispos-sync-msg">{syncMsg}</span>}
        <button className="btn btn-secondary" onClick={openDispoFolder} title="Dispos-Ordner im Finder öffnen">
          📂 Ordner
        </button>
        <button className="btn btn-secondary" onClick={() => setShowKmReport(true)} title="Fahrtkosten / KM-Pauschale für die Steuer">
          📊 Fahrtkosten
        </button>
        <button className="btn btn-primary dispos-sync-btn" onClick={handleSync} disabled={syncing}>
          {syncing ? 'Synchronisiere…' : '↻ Synchronisieren'}
        </button>
      </div>

      <div className="dispos-filters">
        <div className="dispos-search">
          <span className="dispos-search-ic">⌕</span>
          <input type="text" placeholder="Dispo oder Dateiname suchen…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="dispos-proj-select" value={projectFilter} onChange={e => setProjectFilter(e.target.value)}>
          <option value="">Alle Projekte</option>
          {projectNames.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <div className="dispos-chips">
          {[['all', 'Alle'], ['upcoming', 'Kommende'], ['week', 'Diese Woche'], ['unassigned', `⚠ Ohne Projekt${unassignedCount ? ` (${unassignedCount})` : ''}`]].map(([id, label]) => (
            <button key={id} className={`dispos-chip${quickFilter === id ? ' active' : ''}`} onClick={() => setQuickFilter(id)}>{label}</button>
          ))}
        </div>
      </div>

      {total === 0 ? (
        n8nFolder ? (
          <div className="dispos-empty">
            <div className="dispos-empty-icon">📄</div>
            <div className="dispos-empty-title">Noch keine Dispos</div>
            <div className="dispos-empty-text">
              Klicke auf „↻ Synchronisieren", um neue PDFs aus deinem Ordner zu laden.
            </div>
          </div>
        ) : (
          <N8NDispoGuide n8nFolder={n8nFolder} onGoToSettings={onGoToSettings} />
        )
      ) : grouped.length === 0 ? (
        <div className="dispos-empty"><div className="dispos-empty-title">Keine Dispos für diesen Filter.</div></div>
      ) : (
        grouped.map(group => (
          <div key={group.key} className="dispos-group">
            <div className="dispos-month">{group.label}</div>
            {group.items.map(d => (
              <DispoCard
                key={d.id}
                dispo={d}
                projectNames={projectNames}
                onAssign={assignProject}
                onOpen={openViewer}
                onDelete={handleDelete}
                onSetMotiv={setMotivAddress}
                onComputeDistance={computeDistanceFor}
                onReveal={revealDispo}
                computing={computingIds.has(d.id)}
                homeAddress={homeAddress}
              />
            ))}
          </div>
        ))
      )}

      {viewer && (
        <DispoViewer viewer={viewer} onClose={() => setViewer(null)} />
      )}

      {showKmReport && (
        <KmReportOverlay
          dispos={dispos}
          homeAddress={homeAddress}
          kmRate={kmRate}
          kmRoundTrip={kmRoundTrip}
          onKmSettingsChange={onKmSettingsChange}
          onComputeAll={computeAllMissing}
          batchProgress={batchProgress}
          onClose={() => setShowKmReport(false)}
        />
      )}
    </div>
  );
}

function DispoCard({ dispo, projectNames, onAssign, onOpen, onDelete, onSetMotiv, onComputeDistance, onReveal, computing, homeAddress }) {
  const hasHome = !!homeAddress;
  const [menuOpen, setMenuOpen] = useState(false);
  const [editingMotiv, setEditingMotiv] = useState(false);
  const [motivDraft, setMotivDraft] = useState(dispo.motivAdresse || '');
  const hasDate = !!dispo.datumISO;
  const d = hasDate ? new Date(dispo.datumISO + 'T12:00:00') : null;
  const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  const MON = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

  const motivList = dispo.motivAdressen || [];
  // Ist der zwischengespeicherte km-Wert noch zu beiden aktuellen Adressen passend?
  const distanceFresh = dispo.distanzFuer
    && dispo.distanzFuer.motiv === dispo.motivAdresse
    && dispo.distanzFuer.home === homeAddress;
  const saveMotiv = () => { onSetMotiv(dispo.id, motivDraft.trim()); setEditingMotiv(false); };

  return (
    <div className="dispo-card">
      <div className={`dispo-date${hasDate ? '' : ' dispo-date--none'}`}>
        {hasDate ? (
          <>
            <div className="dispo-date-d">{String(d.getDate()).padStart(2, '0')}</div>
            <div className="dispo-date-m">{MON[d.getMonth()]}</div>
            <div className="dispo-date-wd">{WD[d.getDay()]}</div>
          </>
        ) : (
          <div className="dispo-date-m">?</div>
        )}
      </div>

      <div className="dispo-info">
        <div className="dispo-info-title">{dispo.title || dispo.originalName}</div>
        <div className="dispo-info-meta">
          {dispo.projekt
            ? <span className="dispo-tag dispo-tag--proj">{dispo.projekt}</span>
            : <span className="dispo-tag dispo-tag--unassigned">⚠ Projekt zuordnen</span>}
          {dispo.drehtag && <span className="dispo-tag dispo-tag--dt">{dispo.drehtag}</span>}
        </div>
        <div className="dispo-info-file">{dispo.originalName}</div>

        <div className="dispo-motiv">
          {editingMotiv ? (
            <div className="dispo-motiv-edit">
              <input
                className="dispo-motiv-input"
                value={motivDraft}
                onChange={e => setMotivDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') saveMotiv();
                  if (e.key === 'Escape') { setMotivDraft(dispo.motivAdresse || ''); setEditingMotiv(false); }
                }}
                placeholder="Straße, PLZ Ort"
                list={`motiv-sugg-${dispo.id}`}
                autoFocus
              />
              {motivList.length > 0 && (
                <datalist id={`motiv-sugg-${dispo.id}`}>
                  {motivList.map((m, i) => <option key={i} value={m.address}>{m.label}</option>)}
                </datalist>
              )}
              <button className="dispo-motiv-save" onClick={saveMotiv} title="Übernehmen">✓</button>
            </div>
          ) : dispo.motivAdresse ? (
            <button
              className="dispo-motiv-display"
              onClick={() => { setMotivDraft(dispo.motivAdresse); setEditingMotiv(true); }}
              title="Motiv-Adresse bearbeiten"
            >
              📍 {dispo.motivAdresse} <span className="dispo-motiv-edit-ic">✎</span>
            </button>
          ) : (
            <button className="dispo-motiv-add" onClick={() => { setMotivDraft(''); setEditingMotiv(true); }}>
              + Motiv-Adresse
            </button>
          )}

          {dispo.motivAdresse && (
            <span className="dispo-distance">
              {computing ? (
                <span className="dispo-distance-loading">berechne…</span>
              ) : distanceFresh && typeof dispo.distanzKm === 'number' ? (
                <button
                  className="dispo-distance-val"
                  onClick={() => onComputeDistance(dispo)}
                  disabled={!hasHome}
                  title={`${dispo.distanzMin ? `~${dispo.distanzMin} min Fahrt · ` : ''}Neu berechnen`}
                >
                  🚗 {dispo.distanzKm} km{dispo.distanzMin ? ` · ${dispo.distanzMin} min` : ''}
                </button>
              ) : (
                <button
                  className="dispo-distance-btn"
                  onClick={() => onComputeDistance(dispo)}
                  disabled={!hasHome}
                  title={hasHome ? 'Fahrstrecke berechnen' : 'Erst eine Karteikarte als „Das bin ich" markieren'}
                >
                  🚗 km berechnen
                </button>
              )}
              {dispo.distanzError && <span className="dispo-distance-err" title={dispo.distanzError}>⚠</span>}
            </span>
          )}
        </div>
      </div>

      <select
        className="dispo-assign"
        value={dispo.projekt || ''}
        onChange={e => onAssign(dispo.id, e.target.value)}
        title="Projekt zuordnen"
      >
        <option value="">— kein Projekt —</option>
        {projectNames.map(p => <option key={p} value={p}>{p}</option>)}
      </select>

      <div className="dispo-actions">
        <button className="dispo-open-btn" onClick={() => onOpen(dispo)}>📄 Öffnen</button>
        <div className="dispo-menu-wrap">
          <button className="dispo-icon-btn" onClick={() => setMenuOpen(o => !o)} aria-label="Mehr">⋯</button>
          {menuOpen && (
            <div className="dispo-menu" onMouseLeave={() => setMenuOpen(false)}>
              <button className="dispo-menu-item" onClick={() => { setMenuOpen(false); onReveal && onReveal(dispo); }}>📂 Im Finder zeigen</button>
              <button className="dispo-menu-item dispo-menu-item--danger" onClick={() => { setMenuOpen(false); onDelete(dispo); }}>Entfernen</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DispoViewer({ viewer, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="dispo-viewer-overlay" onClick={onClose}>
      <div className="dispo-viewer" onClick={e => e.stopPropagation()}>
        <div className="dispo-viewer-head">
          <span className="dispo-viewer-title">{viewer.title}</span>
          <button className="dispo-viewer-close" onClick={onClose}>×</button>
        </div>
        {viewer.error ? (
          <div className="dispo-viewer-error">{viewer.error}</div>
        ) : (
          <iframe className="dispo-viewer-frame" src={viewer.dataUrl} title={viewer.title} />
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────
// Fahrtkosten-Übersicht (KM-Pauschale für die Steuer)
// ──────────────────────────────────────────────────

const fmtKm = (n) => Number(n).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtEur = (n) => Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const fmtDateShort = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso + 'T12:00:00');
  if (isNaN(d.getTime())) return iso;
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
};

/**
 * Aggregiert Dispos mit berechneter Entfernung zu einer Jahres-/Projekt-Struktur.
 * @returns {{ years: Array, grandKm:number, grandBetrag:number }}
 */
function buildKmReport(dispos, rate, roundTrip) {
  const factor = roundTrip ? 2 : 1;
  const withDist = (dispos || []).filter(d => typeof d.distanzKm === 'number');

  const yearMap = new Map(); // year -> { projects: Map, km, betrag }
  for (const d of withDist) {
    const year = d.datumISO ? d.datumISO.slice(0, 4) : 'Ohne Jahr';
    const project = d.projekt || 'Ohne Projekt';
    const gefahren = d.distanzKm * factor;
    const betrag = gefahren * rate;

    if (!yearMap.has(year)) yearMap.set(year, { year, projects: new Map(), km: 0, betrag: 0, count: 0 });
    const y = yearMap.get(year);
    if (!y.projects.has(project)) y.projects.set(project, { project, rows: [], km: 0, betrag: 0 });
    const p = y.projects.get(project);

    const row = {
      datumISO: d.datumISO || '',
      titel: d.drehtag || d.title || d.originalName,
      motiv: d.motivAdresse || '',
      kmEinfach: d.distanzKm,
      kmGefahren: gefahren,
      betrag,
    };
    p.rows.push(row); p.km += gefahren; p.betrag += betrag;
    y.km += gefahren; y.betrag += betrag; y.count += 1;
  }

  const years = [...yearMap.values()]
    .sort((a, b) => b.year.localeCompare(a.year))
    .map(y => ({
      ...y,
      projects: [...y.projects.values()]
        .sort((a, b) => a.project.localeCompare(b.project, 'de'))
        .map(p => ({ ...p, rows: p.rows.sort((r1, r2) => (r1.datumISO || '').localeCompare(r2.datumISO || '')) })),
    }));

  const grandKm = years.reduce((s, y) => s + y.km, 0);
  const grandBetrag = years.reduce((s, y) => s + y.betrag, 0);
  return { years, grandKm, grandBetrag };
}

function KmReportOverlay({ dispos, homeAddress, kmRate, kmRoundTrip, onKmSettingsChange, onComputeAll, batchProgress, onClose }) {
  const [yearFilter, setYearFilter] = useState('all');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const report = useMemo(() => buildKmReport(dispos, kmRate, kmRoundTrip), [dispos, kmRate, kmRoundTrip]);
  const allYears = useMemo(() => report.years.map(y => y.year), [report]);
  const shownYears = yearFilter === 'all' ? report.years : report.years.filter(y => y.year === yearFilter);
  const shownKm = shownYears.reduce((s, y) => s + y.km, 0);
  const shownBetrag = shownYears.reduce((s, y) => s + y.betrag, 0);

  const missingCount = (dispos || []).filter(d => d.motivAdresse && !(d.distanzFuer && d.distanzFuer.motiv === d.motivAdresse && d.distanzFuer.home === homeAddress)).length;
  const noAddressCount = (dispos || []).filter(d => !d.motivAdresse).length;

  const handleExport = useCallback(async () => {
    if (!window.electronAPI || !window.electronAPI.exportPDF) return;
    setExporting(true);
    try {
      const html = generateKmReportHTML(shownYears, { rate: kmRate, roundTrip: kmRoundTrip, totalKm: shownKm, totalBetrag: shownBetrag, yearLabel: yearFilter === 'all' ? 'Alle Jahre' : yearFilter });
      const name = `Fahrtkosten_${yearFilter === 'all' ? 'gesamt' : yearFilter}`;
      await window.electronAPI.exportPDF(html, name);
    } finally {
      setExporting(false);
    }
  }, [shownYears, kmRate, kmRoundTrip, shownKm, shownBetrag, yearFilter]);

  return (
    <div className="dispo-viewer-overlay" onClick={onClose}>
      <div className="km-report" onClick={e => e.stopPropagation()}>
        <div className="km-report-head">
          <div>
            <h2 className="km-report-title">Fahrtkosten · KM-Pauschale</h2>
            <p className="km-report-sub">Entfernungen Heim ↔ Motiv aus deinen Dispos, für die Steuer.</p>
          </div>
          <button className="dispo-viewer-close" onClick={onClose}>×</button>
        </div>

        <div className="km-report-controls">
          <label className="km-ctrl">
            <span>Satz (€/km)</span>
            <input
              type="number" step="0.01" min="0" value={kmRate}
              onChange={e => onKmSettingsChange && onKmSettingsChange({ kmRate: parseFloat(e.target.value) || 0 })}
            />
          </label>
          <div className="km-ctrl">
            <span>Strecke</span>
            <div className="km-segment" role="group" aria-label="Strecke">
              <button
                type="button"
                className={`km-seg-btn${!kmRoundTrip ? ' active' : ''}`}
                onClick={() => onKmSettingsChange && onKmSettingsChange({ kmRoundTrip: false })}
              >
                Einfache Strecke
              </button>
              <button
                type="button"
                className={`km-seg-btn${kmRoundTrip ? ' active' : ''}`}
                onClick={() => onKmSettingsChange && onKmSettingsChange({ kmRoundTrip: true })}
              >
                Hin &amp; zurück (×2)
              </button>
            </div>
          </div>
          <label className="km-ctrl">
            <span>Jahr</span>
            <select value={yearFilter} onChange={e => setYearFilter(e.target.value)}>
              <option value="all">Alle Jahre</option>
              {allYears.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          <div className="km-report-head-spacer" />
          <button className="btn btn-primary" onClick={handleExport} disabled={exporting || shownYears.length === 0}>
            {exporting ? 'Exportiere…' : '↓ PDF exportieren'}
          </button>
        </div>

        <div className="km-report-summary">
          <div className="km-stat"><span className="km-stat-val">{fmtKm(shownKm)} km</span><span className="km-stat-lbl">gefahren{kmRoundTrip ? ' (hin & zurück)' : ''}</span></div>
          <div className="km-stat km-stat--accent"><span className="km-stat-val">{fmtEur(shownBetrag)}</span><span className="km-stat-lbl">Pauschale gesamt</span></div>
        </div>

        {(missingCount > 0 || !homeAddress) && (
          <div className="km-report-notice">
            {!homeAddress ? (
              <span>⚠ Lege im Tab <strong>Personen</strong> eine Karteikarte als „Das bin ich" an, um Entfernungen zu berechnen.</span>
            ) : batchProgress ? (
              <span>Berechne… {batchProgress.done}/{batchProgress.total}</span>
            ) : (
              <>
                <span>{missingCount} Dispo{missingCount === 1 ? '' : 's'} ohne berechnete Entfernung{noAddressCount ? ` (davon ${noAddressCount} ohne Motiv-Adresse)` : ''}.</span>
                <button className="btn btn-secondary km-compute-all" onClick={onComputeAll} disabled={missingCount === 0}>🚗 Alle berechnen</button>
              </>
            )}
          </div>
        )}

        <div className="km-report-body">
          {shownYears.length === 0 ? (
            <div className="km-report-empty">Noch keine berechneten Fahrtkosten. Berechne oben die Entfernungen.</div>
          ) : shownYears.map(y => (
            <div key={y.year} className="km-year">
              <div className="km-year-head">
                <span className="km-year-name">{y.year}</span>
                <span className="km-year-tot">{fmtKm(y.km)} km · {fmtEur(y.betrag)}</span>
              </div>
              {y.projects.map(p => (
                <div key={p.project} className="km-proj">
                  <div className="km-proj-head">
                    <span className="km-proj-name">{p.project}</span>
                    <span className="km-proj-tot">{fmtKm(p.km)} km · {fmtEur(p.betrag)}</span>
                  </div>
                  <table className="km-table">
                    <thead>
                      <tr><th>Datum</th><th>Drehtag</th><th>Motiv</th><th className="km-num">km</th><th className="km-num">Betrag</th></tr>
                    </thead>
                    <tbody>
                      {p.rows.map((r, i) => (
                        <tr key={i}>
                          <td>{fmtDateShort(r.datumISO)}</td>
                          <td>{r.titel}</td>
                          <td className="km-motiv">{r.motiv}</td>
                          <td className="km-num">{fmtKm(r.kmGefahren)}</td>
                          <td className="km-num">{fmtEur(r.betrag)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Erzeugt das HTML für den PDF-Export der Fahrtkosten-Übersicht. */
function generateKmReportHTML(years, opts) {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const projectsHTML = (y) => y.projects.map(p => `
    <div class="proj">
      <div class="proj-head"><span>${esc(p.project)}</span><span>${fmtKm(p.km)} km · ${fmtEur(p.betrag)}</span></div>
      <table>
        <thead><tr><th>Datum</th><th>Drehtag</th><th>Motiv</th><th class="num">km</th><th class="num">Betrag</th></tr></thead>
        <tbody>
          ${p.rows.map(r => `<tr><td>${fmtDateShort(r.datumISO)}</td><td>${esc(r.titel)}</td><td>${esc(r.motiv)}</td><td class="num">${fmtKm(r.kmGefahren)}</td><td class="num">${fmtEur(r.betrag)}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>`).join('');
  const yearsHTML = years.map(y => `
    <section class="year">
      <h2>${esc(y.year)} <span class="ytot">${fmtKm(y.km)} km · ${fmtEur(y.betrag)}</span></h2>
      ${projectsHTML(y)}
    </section>`).join('');
  const grandKm = years.reduce((s, y) => s + y.km, 0);
  const grandBetrag = years.reduce((s, y) => s + y.betrag, 0);

  return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>Fahrtkosten</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #1a1c22; margin: 32px; font-size: 12px; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    .meta { color: #666; font-size: 11px; margin-bottom: 18px; }
    .summary { display: flex; gap: 28px; padding: 14px 18px; background: #f4f6f9; border-radius: 10px; margin-bottom: 24px; }
    .summary .lbl { color: #666; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; }
    .summary .val { font-size: 18px; font-weight: 700; }
    .summary .accent .val { color: #1366d6; }
    section.year { margin-bottom: 22px; page-break-inside: avoid; }
    section.year h2 { font-size: 15px; border-bottom: 2px solid #1366d6; padding-bottom: 4px; display: flex; justify-content: space-between; align-items: baseline; }
    .ytot { font-size: 12px; font-weight: 600; color: #444; }
    .proj { margin: 10px 0 14px; }
    .proj-head { display: flex; justify-content: space-between; font-weight: 700; background: #eef1f5; padding: 5px 10px; border-radius: 6px; }
    table { width: 100%; border-collapse: collapse; margin-top: 4px; }
    th, td { text-align: left; padding: 5px 10px; border-bottom: 1px solid #e4e7ec; }
    th { font-size: 10px; text-transform: uppercase; letter-spacing: .03em; color: #777; }
    .num { text-align: right; white-space: nowrap; }
    .grand { margin-top: 8px; padding: 12px 18px; background: #1366d6; color: #fff; border-radius: 10px; display: flex; justify-content: space-between; font-size: 15px; font-weight: 700; }
  </style></head><body>
    <h1>Fahrtkosten · Kilometerpauschale</h1>
    <div class="meta">Zeitraum: ${esc(opts.yearLabel)} · Satz: ${fmtEur(opts.rate)}/km · ${opts.roundTrip ? 'Hin- und Rückfahrt (×2)' : 'Einfache Strecke'} · erstellt am ${fmtDateShort(new Date().toISOString().slice(0, 10))}</div>
    <div class="summary">
      <div><div class="lbl">Gefahrene km</div><div class="val">${fmtKm(opts.totalKm)} km</div></div>
      <div class="accent"><div class="lbl">Pauschale gesamt</div><div class="val">${fmtEur(opts.totalBetrag)}</div></div>
    </div>
    ${yearsHTML}
    <div class="grand"><span>Gesamt</span><span>${fmtKm(grandKm)} km · ${fmtEur(grandBetrag)}</span></div>
  </body></html>`;
}

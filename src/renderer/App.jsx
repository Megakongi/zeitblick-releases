import React, { useState, useEffect, useCallback, useRef, useMemo, Component } from 'react';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import FilterSidebar from './components/FilterSidebar';
import FilterChips from './components/FilterChips';
import Dashboard from './components/Dashboard';
import TimesheetList from './components/TimesheetList';
import TimesheetDetail from './components/TimesheetDetail';
import TimesheetCreate from './components/TimesheetCreate';
import Settings from './components/Settings';
import TeamManager from './components/TeamManager';
import Dispos from './components/Dispos';
import ImportOverlay from './components/ImportOverlay';
import OnboardingTour from './components/OnboardingTour';
import UpdateOverlay from './components/UpdateOverlay';
import N8NImportOverlay from './components/N8NImportOverlay';
import { processN8N, applyDeviation, applySubstitution } from './utils/n8nImport';
import { calculateTVFFS } from './utils/tvffsCalculator';
import { getTimesheetKW } from './utils/calendarWeek';
import { FilterContext, SettingsContext } from './contexts';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, color: '#ff4444', fontFamily: 'monospace' }}>
          <h2>Fehler in der App</h2>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{this.state.error?.toString()}</pre>
          <button onClick={() => this.setState({ hasError: false, error: null })} style={{ marginTop: 16, padding: '8px 16px' }}>
            Zurücksetzen
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/** Per-section ErrorBoundary with a friendly fallback and section label */
class SectionErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error(`SectionErrorBoundary [${this.props.label || '?'}]:`, error, info.componentStack);

  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary, #888)' }}>
          <p style={{ fontSize: 15, marginBottom: 8, color: '#ff6666', fontWeight: 600 }}>⚠ Fehler in {this.props.label || 'diesem Bereich'}</p>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, color: '#ff6666', marginBottom: 12, background: 'rgba(255,0,0,.05)', padding: 12, borderRadius: 8, textAlign: 'left', maxHeight: 200, overflow: 'auto' }}>{this.state.error?.stack || this.state.error?.message}</pre>
          <button onClick={() => this.setState({ hasError: false, error: null })} style={{ padding: '6px 14px', cursor: 'pointer' }}>
            Erneut versuchen
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Extract the base project name by stripping appended person info.
 * E.g. "Frier & 50 Name: Fabian Zenker" → "Frier & 50"
 */
function getBaseProject(projekt) {
  if (!projekt) return 'Sonstiges';
  // Strip " Name: ..." suffix (common in parsed PDFs where project and name share a row)
  const cleaned = projekt.replace(/\s+Name:\s+.*$/i, '').trim();
  return cleaned || 'Sonstiges';
}

export default function App() {
  const [view, setView] = useState('dashboard');
  const [timesheets, setTimesheets] = useState([]);
  const [selectedSheet, setSelectedSheet] = useState(null);
  const [settings, setSettings] = useState({ tagesgage: 0, gageType: 'tag', zeitkonto: false, theme: 'light', spesen: [], personGagen: {}, positionGagen: {}, nameAliases: {}, team: [], projectStaffing: {}, projects: {}, projectCrews: {}, calendarEntries: {}, n8nFolder: '', n8nEnabled: false, dispos: [], kmRate: 0.30, kmRoundTrip: false });
  const [isImporting, setIsImporting] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [importMessage, setImportMessage] = useState(null);
  const [projectFilter, setProjectFilter] = useState('all');
  const [personFilter, setPersonFilter] = useState('all');
  const [timeFilter, setTimeFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef(null);
  const [showTour, setShowTour] = useState(() => { try { return !localStorage.getItem('zeitblick-tour-completed'); } catch { return true; } });
  const [trash, setTrash] = useState([]); // Trash bin for undo
  const [saveError, setSaveError] = useState(null);
  const dragCounter = useRef(0);
  const saveTimeout = useRef(null);
  const dataLoaded = useRef(false);
  const [n8nOverlay, setN8nOverlay] = useState(null); // { sheets, deviations, unknownNames, files, folder }
  const n8nRunning = useRef(false);

  // Load data on startup
  useEffect(() => {
    async function load() {
      const data = await window.electronAPI.loadData();
      console.log('[ZeitBlick] Loaded data:', data.timesheets?.length, 'timesheets,', data._loadError ? 'ERROR: ' + data._loadError : 'OK');
      if (data.timesheets) {
        // Migrate stored timesheets: fix totals and project names
        let migrated = false;
        const ts = data.timesheets.map(sheet => {
          let changed = false;
          const s = { ...sheet };

          // Fix project name: strip " Name: ..." suffix
          if (s.projekt && /\s+Name:\s+/i.test(s.projekt)) {
            s.projekt = s.projekt.replace(/\s+Name:\s+.*$/i, '').trim() || 'Sonstiges';
            changed = true;
          }

          // Fix produktionsfirma: strip stray "fi rma:" prefix
          if (s.produktionsfirma && /^(ﬁ|fi)\s*rma:\s*/i.test(s.produktionsfirma)) {
            s.produktionsfirma = s.produktionsfirma.replace(/^(ﬁ|fi)\s*rma:\s*/i, '').trim();
            changed = true;
          }

          // Recompute totals from days if totals are zero but days have data
          if (s.days && s.days.length > 0) {
            const daySum = s.days.reduce((sum, d) => sum + (Number(d.stundenTotal) || 0), 0);
            if ((!s.totals || s.totals.stundenTotal === 0) && daySum > 0) {
              s.totals = {
                stundenTotal: Math.round(daySum * 100) / 100,
                ueberstunden25: Math.round(s.days.reduce((sum, d) => sum + (Number(d.ueberstunden25) || 0), 0) * 100) / 100,
                ueberstunden50: Math.round(s.days.reduce((sum, d) => sum + (Number(d.ueberstunden50) || 0), 0) * 100) / 100,
                ueberstunden100: Math.round(s.days.reduce((sum, d) => sum + (Number(d.ueberstunden100) || 0), 0) * 100) / 100,
                nacht25: Math.round(s.days.reduce((sum, d) => sum + (Number(d.nacht25) || 0), 0) * 100) / 100,
                fahrzeit: Math.round(s.days.reduce((sum, d) => sum + (Number(d.fahrzeit) || 0), 0) * 100) / 100,
              };
              changed = true;
            }
          }

          if (changed) migrated = true;
          return changed ? s : sheet;
        });
        setTimesheets(ts);
        if (migrated) {
          console.log('[ZeitBlick] Migrated stored timesheet data (totals + project names)');
        }
      }
      if (data.settings) {
        // Migrate drehStartDatum: fix 2-digit years (0026 → 2026)
        const s = { ...data.settings };
        if (s.projects) {
          let fixed = false;
          const fixedProjects = { ...s.projects };
          for (const [pName, proj] of Object.entries(fixedProjects)) {
            if (proj.drehStartDatum) {
              const parts = proj.drehStartDatum.split('-');
              if (parts.length === 3 && parseInt(parts[0]) < 100) {
                fixedProjects[pName] = { ...proj, drehStartDatum: String(parseInt(parts[0]) + 2000) + '-' + parts[1] + '-' + parts[2] };
                fixed = true;
              }
            }
          }
          if (fixed) {
            s.projects = fixedProjects;
            console.log('[ZeitBlick] Migrated drehStartDatum years');
          }
        }
        setSettings(s);
      }
      if (data._loadError) {
        setImportMessage('⚠ Fehler beim Laden: ' + data._loadError);
        setTimeout(() => setImportMessage(null), 8000);
      }
      dataLoaded.current = true;
    }
    load().catch(err => {
      console.error('[ZeitBlick] load() failed:', err);
    });
  }, []);

  // Debounced save — waits 500ms after last change before saving
  useEffect(() => {
    if (!dataLoaded.current) return;
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(async () => {
      const result = await window.electronAPI.saveData({ timesheets, settings });
      if (result && !result.success && result.error) {
        setSaveError(result.error);
        setTimeout(() => setSaveError(null), 6000);
      }
    }, 500);
    return () => { if (saveTimeout.current) clearTimeout(saveTimeout.current); };
  }, [timesheets, settings]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && e.key === 'n') { e.preventDefault(); setSelectedSheet(null); setView('create'); }
      if (isMod && e.key === 'i') { e.preventDefault(); handleOpenDialog(); }
      if (isMod && e.key === 'z' && trash.length > 0) { e.preventDefault(); handleUndo(); }
      if (isMod && e.key === 'k') { e.preventDefault(); setSearchOpen(true); setTimeout(() => searchInputRef.current?.focus(), 50); }
      if (isMod && e.key === 'f') { e.preventDefault(); setSearchOpen(true); setTimeout(() => searchInputRef.current?.focus(), 50); }
      if (e.key === 'Escape') {
        if (searchOpen) { setSearchOpen(false); setSearchQuery(''); }
        else if (view === 'detail' || view === 'create') { setSelectedSheet(null); setView('timesheets'); }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [view, trash, searchOpen]);

  // Handle PDF import with duplicate detection
  const handleImport = useCallback(async (filePaths) => {
    if (!filePaths || filePaths.length === 0) return;
    
    setIsImporting(true);
    setImportMessage(null);
    try {
      const results = await window.electronAPI.importPDFs(filePaths);
      const newSheets = results
        .filter(r => r.success)
        .filter(r => r.data && r.data.id && Array.isArray(r.data.days))
        .map(r => ({ ...r.data, filePath: r.filePath }));
      
      // Duplicate detection: check if same date range + project already exists
      let added = 0;
      let duplicates = 0;
      const sheetsToAdd = [];

      for (const ns of newSheets) {
        const nsDates = ns.days.filter(d => d.datum).map(d => d.datum).join(',');
        const nsKey = `${ns.projekt || ''}|${ns.name || ''}|${nsDates}`;
        
        const isDuplicate = timesheets.some(existing => {
          const exDates = existing.days.filter(d => d.datum).map(d => d.datum).join(',');
          const exKey = `${existing.projekt || ''}|${existing.name || ''}|${exDates}`;
          return exKey === nsKey;
        });

        if (isDuplicate) {
          duplicates++;
        } else {
          sheetsToAdd.push(ns);
          added++;
        }
      }

      if (sheetsToAdd.length > 0) {
        setTimesheets(prev => [...prev, ...sheetsToAdd]);
      }

      const errors = results.filter(r => !r.success);
      
      // Show import result message (including failed filenames)
      const parts = [];
      if (added > 0) parts.push(`${added} Stundenzettel importiert`);
      if (duplicates > 0) parts.push(`${duplicates} Duplikat${duplicates > 1 ? 'e' : ''} übersprungen`);
      if (errors.length > 0) {
        const failedNames = errors.map(e => e.filePath ? e.filePath.split('/').pop().split('\\').pop() : '?').join(', ');
        parts.push(`${errors.length} konnte${errors.length > 1 ? 'n' : ''} nicht gelesen werden: ${failedNames}`);
      }
      if (parts.length > 0) {
        setImportMessage(parts.join('. '));
        setTimeout(() => setImportMessage(null), 6000);
      }
    } catch (error) {
      console.error('Import failed:', error);
      setImportMessage('Import abgebrochen — keine Datei konnte gelesen werden.');
      setTimeout(() => setImportMessage(null), 6000);
    }
    setIsImporting(false);
  }, [timesheets]);

  const handleRenameProject = useCallback((oldName, newName) => {
    if (!newName.trim() || oldName === newName) return;
    setTimesheets(prev => prev.map(t => {
      const base = getBaseProject ? getBaseProject(t.projekt) : (t.projekt || 'Sonstiges');
      if (base === oldName) return { ...t, projekt: newName.trim() };
      return t;
    }));
    // Update project filter if it was pointing at the old name
    setProjectFilter(prev => prev === oldName ? newName.trim() : prev);
    // Update completedProjects key if the project was completed
    setSettings(prev => {
      const cp = { ...(prev.completedProjects || {}) };
      if (cp[oldName]) {
        cp[newName.trim()] = cp[oldName];
        delete cp[oldName];
        return { ...prev, completedProjects: cp };
      }
      return prev;
    });
  }, [getBaseProject]);

  // Projekte zusammenführen: alle Zettel/Crews/Einstellungen von source → target, source entfernen
  const handleMergeProjects = useCallback((sourceName, targetName) => {
    if (!sourceName || !targetName || sourceName === targetName) return;
    setTimesheets(prev => prev.map(t => {
      const base = getBaseProject ? getBaseProject(t.projekt) : (t.projekt || 'Sonstiges');
      return base === sourceName ? { ...t, projekt: targetName } : t;
    }));
    setProjectFilter(prev => prev === sourceName ? targetName : prev);
    setSettings(prev => {
      const next = { ...prev };
      // projects: source entfernen, fehlende Felder ggf. an target übernehmen
      const projs = { ...(prev.projects || {}) };
      if (projs[sourceName]) {
        const src = projs[sourceName];
        const tgt = { ...(projs[targetName] || {}) };
        for (const k of ['kuerzel', 'projektnummer', 'produktionsfirma', 'drehStartDatum']) {
          if (!tgt[k] && src[k]) tgt[k] = src[k];
        }
        projs[targetName] = tgt;
        delete projs[sourceName];
        next.projects = projs;
      }
      // projectCrews: zusammenführen (Union, target-Reihenfolge zuerst)
      const crews = { ...(prev.projectCrews || {}) };
      if (crews[sourceName]) {
        const merged = [...(crews[targetName] || [])];
        for (const n of crews[sourceName]) if (!merged.some(m => m.toLowerCase() === n.toLowerCase())) merged.push(n);
        crews[targetName] = merged;
        delete crews[sourceName];
        next.projectCrews = crews;
      }
      // completedProjects: source-Key entfernen
      const cp = { ...(prev.completedProjects || {}) };
      if (cp[sourceName]) { delete cp[sourceName]; next.completedProjects = cp; }
      // personProjectGagen: source-Einträge auf target verschieben (falls target noch leer)
      const ppg = { ...(prev.personProjectGagen || {}) };
      let ppgChanged = false;
      for (const person of Object.keys(ppg)) {
        if (ppg[person] && ppg[person][sourceName]) {
          ppg[person] = { ...ppg[person] };
          if (!ppg[person][targetName]) ppg[person][targetName] = ppg[person][sourceName];
          delete ppg[person][sourceName];
          ppgChanged = true;
        }
      }
      if (ppgChanged) next.personProjectGagen = ppg;
      return next;
    });
    setImportMessage(`Projekt „${sourceName}" mit „${targetName}" zusammengeführt`);
    setTimeout(() => setImportMessage(null), 5000);
  }, [getBaseProject]);

  const handleToggleProjectComplete = useCallback((projectName) => {
    setSettings(prev => {
      const cp = { ...(prev.completedProjects || {}) };
      if (cp[projectName]) {
        delete cp[projectName];
      } else {
        cp[projectName] = { completedAt: new Date().toISOString() };
      }
      return { ...prev, completedProjects: cp };
    });
  }, []);

  // Drag & Drop handlers — use counter to prevent flicker from child elements
  // Only show overlay for external file drags, not internal card drags
  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.dataTransfer.types.includes('Files')) return;
    dragCounter.current++;
    if (dragCounter.current === 1) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.dataTransfer.types.includes('Files')) return;
    dragCounter.current--;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDragOver(false);

    const droppedFiles = Array.from(e.dataTransfer.files)
      .filter(f => f.name.toLowerCase().endsWith('.pdf'));

    const filePaths = droppedFiles.map(f => {
      try {
        if (window.electronAPI.getPathForFile) {
          return window.electronAPI.getPathForFile(f);
        }
      } catch (err) {
        console.warn('getPathForFile failed:', err);
      }
      return f.path || '';
    }).filter(Boolean);

    if (filePaths.length > 0) {
      handleImport(filePaths);
    } else {
      console.warn('No file paths resolved from dropped files');
    }
  }, [handleImport]);

  // File dialog
  const handleOpenDialog = useCallback(async () => {
    const filePaths = await window.electronAPI.openFileDialog();
    handleImport(filePaths);
  }, [handleImport]);

  // Folder dialog
  const handleOpenFolderDialog = useCallback(async () => {
    const filePaths = await window.electronAPI.openFolderDialog();
    if (filePaths && filePaths.length > 0) {
      handleImport(filePaths);
    }
  }, [handleImport]);

  // Delete timesheet (moves to trash for undo)
  const handleDelete = useCallback((id) => {
    setTimesheets(prev => {
      const sheet = prev.find(ts => ts.id === id);
      if (sheet) setTrash(t => [...t, sheet].slice(-50)); // keep last 50
      return prev.filter(ts => ts.id !== id);
    });
    if (selectedSheet && selectedSheet.id === id) {
      setSelectedSheet(null);
      setView('timesheets');
    }
  }, [selectedSheet]);

  // Bulk delete timesheets (moves to trash)
  const handleBulkDelete = useCallback((ids) => {
    setTimesheets(prev => {
      const deleted = prev.filter(ts => ids.includes(ts.id));
      setTrash(t => [...t, ...deleted].slice(-50));
      return prev.filter(ts => !ids.includes(ts.id));
    });
    if (selectedSheet && ids.includes(selectedSheet.id)) {
      setSelectedSheet(null);
      setView('timesheets');
    }
  }, [selectedSheet]);

  // Undo last delete
  const handleUndo = useCallback(() => {
    if (trash.length === 0) return;
    const lastDeleted = trash[trash.length - 1];
    setTrash(t => t.slice(0, -1));
    setTimesheets(prev => [...prev, lastDeleted]);
    setImportMessage('↩ Wiederhergestellt: ' + (lastDeleted.name || 'Eintrag'));
    setTimeout(() => setImportMessage(null), 3000);
  }, [trash]);

  // View timesheet detail
  const prevView = React.useRef('timesheets');
  const handleViewDetail = useCallback((sheet) => {
    setSelectedSheet(sheet);
    setView(prev => { prevView.current = prev; return 'detail'; });
  }, []);

  // Create new timesheet
  const handleCreateSheet = useCallback((sheet) => {
    setTimesheets(prev => {
      const idx = prev.findIndex(t => t.id === sheet.id);
      if (idx >= 0) {
        // Update existing
        const updated = [...prev];
        updated[idx] = sheet;
        return updated;
      }
      return [...prev, sheet];
    });
    setView('timesheets');
  }, []);

  // Batch create timesheets (for crew)
  const handleBatchCreateSheets = useCallback((sheets) => {
    setTimesheets(prev => [...prev, ...sheets]);
    setView('timesheets');
  }, []);

  // Edit timesheet
  const handleEditSheet = useCallback((sheet) => {
    setSelectedSheet(sheet);
    setView('create');
  }, []);

  // Apply theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme || 'light');
  }, [settings.theme]);

  // Get unique projects and persons for filters
  // Name alias resolver: maps alias names to canonical names
  const nameAliases = settings.nameAliases || {};
  const resolveName = useCallback((name) => {
    return nameAliases[name] || name;
  }, [nameAliases]);

  // ===== n8n Import =====
  const runN8NImport = useCallback(async () => {
    if (n8nRunning.current) return;
    if (!window.electronAPI || !window.electronAPI.scanN8N) return;
    n8nRunning.current = true;
    try {
      const folder = settings.n8nFolder || (window.electronAPI.getDefaultN8NFolder ? await window.electronAPI.getDefaultN8NFolder() : '');
      const res = await window.electronAPI.scanN8N(folder);
      if (!res || !res.success || !res.entries || res.entries.length === 0) { n8nRunning.current = false; return; }
      const { sheets, deviations, substitutions, unknownNames, newProjects, calendarAdds } = processN8N(res.entries, {
        resolveName,
        projectCrews: settings.projectCrews || {},
        team: settings.team || [],
        projects: settings.projects || {},
        calendarEntries: settings.calendarEntries || {},
      });
      const files = res.entries.map(e => e.file);
      const needsOverlay = sheets.length > 0 || deviations.length > 0 || substitutions.length > 0 || unknownNames.length > 0 || newProjects.length > 0;
      if (!needsOverlay) {
        // Nur Kalender-Einträge (Zusatz/Vertretung) → direkt einpflegen, ohne Dialog
        if (calendarAdds && calendarAdds.length) writeCalendarAdds(calendarAdds);
        await window.electronAPI.archiveN8N(folder, files);
        n8nRunning.current = false;
        return;
      }
      setN8nOverlay({ sheets, deviations, substitutions, unknownNames, newProjects, calendarAdds, files, folder });
    } catch (e) {
      console.error('[n8n] import failed:', e);
      n8nRunning.current = false;
    }
  }, [settings.n8nFolder, settings.projectCrews, settings.team, settings.projects, resolveName]);

  // Schreibt Kalender-Einträge (Zusatz/Vertretung) in settings.calendarEntries
  const writeCalendarAdds = useCallback((calendarAdds) => {
    if (!calendarAdds || !calendarAdds.length) return;
    const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    setSettings(prev => {
      const cal = { ...(prev.calendarEntries || {}) };
      for (const a of calendarAdds) {
        const list = cal[a.dateISO] ? [...cal[a.dateISO]] : [];
        const existing = list.find(e => e.name === a.name && (e.projekt || '') === (a.projekt || ''));
        if (existing) {
          if (a.kind === 'vertretung' && existing.kind !== 'vertretung') existing.kind = 'vertretung';
        } else {
          list.push({ id: genId(), memberId: '', name: a.name, position: a.position || '', projekt: a.projekt || '', kind: a.kind || 'zusatz', source: 'n8n' });
        }
        cal[a.dateISO] = list;
      }
      return { ...prev, calendarEntries: cal };
    });
  }, []);

  const finalizeN8N = useCallback(({ devChoices, subChoices, newPeople, projectData }) => {
    setN8nOverlay(current => {
      if (!current) return null;
      const { sheets, deviations, substitutions, files, folder, calendarAdds } = current;
      const cloned = sheets.map(s => ({ ...s, days: s.days.map(d => ({ ...d })), totals: { ...s.totals } }));
      for (const dev of deviations) {
        const chosen = devChoices[dev.id];
        if (chosen) applyDeviation(cloned, dev, chosen);
      }
      for (const sub of (substitutions || [])) {
        const choice = subChoices && subChoices[sub.id];
        if (choice) applySubstitution(cloned, sub, choice);
      }
      const hasCal = calendarAdds && calendarAdds.length;
      if ((newPeople && newPeople.length) || (projectData && Object.keys(projectData).length) || hasCal) {
        const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        setSettings(prev => {
          const next = { ...prev };
          if (newPeople && newPeople.length) {
            next.team = [...(prev.team || []), ...newPeople.map(p => ({
              id: genId(), name: p.name, position: p.position || '', email: p.email || '',
              phone: p.phone || '', spezials: p.spezials || '', notizen: '',
            }))];
          }
          if (projectData && Object.keys(projectData).length) {
            const projs = { ...(prev.projects || {}) };
            for (const [pName, pData] of Object.entries(projectData)) {
              projs[pName] = { ...(projs[pName] || {}), ...(pData || {}) };
            }
            next.projects = projs;
          }
          if (hasCal) {
            const cal = { ...(prev.calendarEntries || {}) };
            for (const a of calendarAdds) {
              const list = cal[a.dateISO] ? [...cal[a.dateISO]] : [];
              const existing = list.find(e => e.name === a.name && (e.projekt || '') === (a.projekt || ''));
              if (existing) {
                if (a.kind === 'vertretung' && existing.kind !== 'vertretung') existing.kind = 'vertretung';
              } else {
                list.push({ id: genId(), memberId: '', name: a.name, position: a.position || '', projekt: a.projekt || '', kind: a.kind || 'zusatz', source: 'n8n' });
              }
              cal[a.dateISO] = list;
            }
            next.calendarEntries = cal;
          }
          return next;
        });
      }
      setTimesheets(prev => {
        const toAdd = cloned.filter(ns => {
          const nsDates = ns.days.filter(d => d.datum).map(d => d.datum).join(',');
          const nsKey = `${ns.projekt || ''}|${ns.name || ''}|${nsDates}`;
          return !prev.some(ex => {
            const exDates = ex.days.filter(d => d.datum).map(d => d.datum).join(',');
            return `${ex.projekt || ''}|${ex.name || ''}|${exDates}` === nsKey;
          });
        });
        if (toAdd.length > 0) {
          setImportMessage(`n8n: ${toAdd.length} Stundenzettel importiert`);
          setTimeout(() => setImportMessage(null), 5000);
        }
        return [...prev, ...toAdd];
      });
      if (window.electronAPI.archiveN8N) window.electronAPI.archiveN8N(folder, files);
      n8nRunning.current = false;
      return null;
    });
  }, []);

  // Start n8n watch + initial scan when enabled
  useEffect(() => {
    if (!settings.n8nEnabled) return;
    let cleanup;
    (async () => {
      const folder = settings.n8nFolder || (window.electronAPI.getDefaultN8NFolder ? await window.electronAPI.getDefaultN8NFolder() : '');
      if (folder && window.electronAPI.watchN8N) window.electronAPI.watchN8N(folder);
      runN8NImport();
    })();
    if (window.electronAPI.onN8NChanged) cleanup = window.electronAPI.onN8NChanged(() => runN8NImport());
    return () => { if (cleanup) cleanup(); };
  }, [settings.n8nEnabled, settings.n8nFolder, runN8NImport]);

  // Search results — match timesheets by name, project, KW, position, abteilung, firma
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.trim().toLowerCase();
    // Check if query is a KW number
    const kwMatch = q.match(/^(?:kw\s*)?(\d{1,2})$/);
    const kwNum = kwMatch ? parseInt(kwMatch[1], 10) : null;

    return timesheets.filter(ts => {
      const name = resolveName(ts.name || '').toLowerCase();
      const projekt = (ts.projekt || '').toLowerCase();
      const position = (ts.position || '').toLowerCase();
      const abteilung = (ts.abteilung || '').toLowerCase();
      const firma = (ts.produktionsfirma || '').toLowerCase();
      const kw = getTimesheetKW(ts);

      if (kwNum !== null && kw === kwNum) return true;
      if (name.includes(q)) return true;
      if (projekt.includes(q)) return true;
      if (position.includes(q)) return true;
      if (abteilung.includes(q)) return true;
      if (firma.includes(q)) return true;
      // Search by date
      if (ts.days && ts.days.some(d => (d.datum || '').includes(q))) return true;
      return false;
    }).slice(0, 50); // Limit results
  }, [searchQuery, timesheets, resolveName]);

  const handleSearchSelect = useCallback((sheet) => {
    setSelectedSheet(sheet);
    setView('detail');
    setSearchOpen(false);
    setSearchQuery('');
  }, []);

  const projects = [...new Set(timesheets.map(t => getBaseProject(t.projekt)))].sort();
  const persons = [...new Set(timesheets.map(t => resolveName(t.name || 'Unbekannt')))].sort();

  // Persons that have timesheets for the currently selected project (for sidebar display)
  const personsInProject = projectFilter === 'all'
    ? persons
    : [...new Set(timesheets
        .filter(t => getBaseProject(t.projekt) === projectFilter)
        .map(t => resolveName(t.name || 'Unbekannt'))
      )].sort();

  // Reset stale filters (e.g. after rename or delete)
  useEffect(() => {
    if (personFilter !== 'all' && !persons.includes(personFilter)) setPersonFilter('all');
  }, [personFilter, persons]);
  useEffect(() => {
    if (projectFilter !== 'all' && !projects.includes(projectFilter)) setProjectFilter('all');
  }, [projectFilter, projects]);
  
  // Filter timesheets by person first (using resolved names), then by project
  const personFiltered = personFilter === 'all'
    ? timesheets
    : timesheets.filter(t => resolveName(t.name || 'Unbekannt') === personFilter);
  
  const projectFiltered = projectFilter === 'all'
    ? personFiltered
    : personFiltered.filter(t => getBaseProject(t.projekt) === projectFilter);

  // Time filter
  const now = new Date();
  const timeFiltered = (() => {
    if (timeFilter === 'all') return projectFiltered;
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1));
    startOfWeek.setHours(0, 0, 0, 0);
    if (timeFilter === 'week') {
      const end = new Date(startOfWeek); end.setDate(startOfWeek.getDate() + 6);
      return projectFiltered.filter(t => {
        const d = new Date(t.periodStart || t.datum || t.startDate || t.weekStart || 0);
        return d >= startOfWeek && d <= end;
      });
    }
    if (timeFilter === '4weeks') {
      const start = new Date(now); start.setDate(now.getDate() - 27); start.setHours(0, 0, 0, 0);
      return projectFiltered.filter(t => {
        const d = new Date(t.periodStart || t.datum || t.startDate || t.weekStart || 0);
        return d >= start;
      });
    }
    if (timeFilter === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return projectFiltered.filter(t => {
        const d = new Date(t.periodStart || t.datum || t.startDate || t.weekStart || 0);
        return d >= start;
      });
    }
    return projectFiltered;
  })();

  // Eigene Heim-Adresse (Karteikarte „Das bin ich") als Startpunkt für die Motiv-Entfernung.
  const homeAddress = (() => {
    const me = (settings.team || []).find(m => m.isMe);
    if (!me) return '';
    return [me.strasse, [me.plz, me.ort].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  })();

  // When viewing all persons, restrict to Stammteam members (settings.team)
  const teamNames = new Set((settings.team || []).map(m => resolveName(m.name)));
  const filteredTimesheets = (personFilter === 'all' && teamNames.size > 0)
    ? timeFiltered.filter(t => teamNames.has(resolveName(t.name || 'Unbekannt')))
    : timeFiltered;

  // Filtered projects (only projects available for selected person)
  const filteredProjects = [...new Set(personFiltered.map(t => getBaseProject(t.projekt)))].sort();

  // Helper: get settings with per-person gage override
  // Priority: personProjectGagen > personGagen > positionGagen > global
  const getPersonSettings = useCallback((personName, projectName) => {
    // 1. Check personProjectGagen (per-person-per-project override)
    const ppg = settings.personProjectGagen || {};
    if (personName && projectName && ppg[personName] && ppg[personName][projectName] && ppg[personName][projectName].tagesgage > 0) {
      return { ...settings, tagesgage: ppg[personName][projectName].tagesgage, gageType: ppg[personName][projectName].gageType || settings.gageType };
    }
    // 2. Check personGagen (direct override per person)
    const pg = settings.personGagen || {};
    if (personName && pg[personName] && pg[personName].tagesgage > 0) {
      return { ...settings, tagesgage: pg[personName].tagesgage, gageType: pg[personName].gageType || settings.gageType };
    }
    // 3. Look up by position from timesheets
    if (personName) {
      const posGagen = settings.positionGagen || {};
      const resolvedName = resolveName(personName);
      const ts = timesheets.find(t => resolveName(t.name || 'Unbekannt') === resolvedName && t.position);
      if (ts && ts.position && posGagen[ts.position] && posGagen[ts.position].tagesgage > 0) {
        return { ...settings, tagesgage: posGagen[ts.position].tagesgage, gageType: posGagen[ts.position].gageType || settings.gageType };
      }
    }
    return settings;
  }, [settings, timesheets, resolveName]);

  // TVFFS calculations — use per-person gage when filtered
  const effectiveSettings = personFilter !== 'all'
    ? getPersonSettings(personFilter, projectFilter !== 'all' ? projectFilter : undefined)
    : settings;
  const calculations = useMemo(() => calculateTVFFS(filteredTimesheets, effectiveSettings), [filteredTimesheets, effectiveSettings]);

  // Person sheet counts for sidebar (using resolved names)
  const personCounts = {};
  for (const t of timesheets) {
    const name = resolveName(t.name || 'Unbekannt');
    personCounts[name] = (personCounts[name] || 0) + 1;
  }

  // Project sheet counts (using base project names) — respects active person filter
  const projectCounts = {};
  for (const t of personFiltered) {
    const proj = getBaseProject(t.projekt);
    projectCounts[proj] = (projectCounts[proj] || 0) + 1;
  }

  const handlePersonFilter = useCallback((person) => {
    setPersonFilter(person);
    setView('dashboard');
  }, []);

  const handleProjectFilter = useCallback((proj) => {
    setProjectFilter(proj);
    setPersonFilter('all');
  }, []);

  const renderView = () => {
    switch (view) {
      case 'dashboard':
        return <SectionErrorBoundary label="Übersicht"><Dashboard timesheets={filteredTimesheets} calculations={calculations} settings={settings} effectiveSettings={effectiveSettings} onSettings={setSettings} onViewDetail={handleViewDetail} onUpdateTimesheets={setTimesheets} projects={filteredProjects} projectFilter={projectFilter} onProjectFilter={handleProjectFilter} personFilter={personFilter} onPersonFilter={handlePersonFilter} allTimesheets={timesheets} personFilteredTimesheets={personFiltered} getPersonSettings={getPersonSettings} resolveName={resolveName} getBaseProject={getBaseProject} completedProjects={settings.completedProjects || {}} /></SectionErrorBoundary>;
      case 'timesheets':
        return <SectionErrorBoundary label="Stundenzettel-Liste"><TimesheetList timesheets={timesheets} onViewDetail={handleViewDetail} onDelete={handleDelete} onBulkDelete={handleBulkDelete} personFilter={personFilter} resolveName={resolveName} getBaseProject={getBaseProject} onRenameProject={handleRenameProject} completedProjects={settings.completedProjects || {}} onToggleProjectComplete={handleToggleProjectComplete} projectCrews={settings.projectCrews || {}} /></SectionErrorBoundary>;
      case 'dispos':
        return <SectionErrorBoundary label="Dispos"><Dispos
          dispos={settings.dispos || []}
          onChange={(dispos) => setSettings(s => ({ ...s, dispos }))}
          projects={settings.projects || {}}
          n8nFolder={settings.n8nFolder || ''}
          homeAddress={homeAddress}
          kmRate={settings.kmRate ?? 0.30}
          kmRoundTrip={settings.kmRoundTrip === true}
          onKmSettingsChange={(patch) => setSettings(s => ({ ...s, ...patch }))}
          onGoToSettings={() => setView('settings')}
        /></SectionErrorBoundary>;
      case 'detail':
        return selectedSheet ? <SectionErrorBoundary label="Stundenzettel-Detail"><TimesheetDetail sheet={selectedSheet} settings={getPersonSettings(selectedSheet.name, getBaseProject(selectedSheet.projekt))} onBack={() => setView(prevView.current || 'timesheets')} onEdit={handleEditSheet} allTimesheets={timesheets} onSelectSheet={(s) => { setSelectedSheet(s); }} /></SectionErrorBoundary> : null;
      case 'create':
        return <SectionErrorBoundary label="Stundenzettel erstellen"><TimesheetCreate
          onSave={handleCreateSheet}
          onSaveBatch={handleBatchCreateSheets}
          onCancel={() => { setSelectedSheet(null); setView('timesheets'); }}
          editSheet={view === 'create' ? selectedSheet : null}
          existingTimesheets={timesheets}
          projectStaffing={settings.projectStaffing || {}}
          projects={settings.projects || {}}
          team={settings.team || []}
          onCreateNext={(weekStart) => { setSelectedSheet(null); setView('create'); }}
        /></SectionErrorBoundary>;
      case 'team':
        return <SectionErrorBoundary label="Team"><TeamManager
          team={settings.team || []}
          onTeamChange={(team) => setSettings(s => ({ ...s, team }))}
          timesheets={timesheets}
          resolveName={resolveName}
          projects={settings.projects || {}}
          onProjectsChange={(projects) => setSettings(s => ({ ...s, projects }))}
          onMergeProjects={handleMergeProjects}
          projectCrews={settings.projectCrews || {}}
          onProjectCrewsChange={(projectCrews) => setSettings(s => ({ ...s, projectCrews }))}
          staffing={settings.projectStaffing || {}}
          onStaffingChange={(staffing) => setSettings(s => ({ ...s, projectStaffing: staffing }))}
          onCreateTimesheets={handleBatchCreateSheets}
          calendarEntries={settings.calendarEntries || {}}
          onCalendarChange={(calendarEntries) => setSettings(s => ({ ...s, calendarEntries }))}
          settings={settings}
          onSettings={setSettings}
          onSyncN8N={runN8NImport}
        /></SectionErrorBoundary>;
      case 'settings':
        return <SectionErrorBoundary label="Einstellungen"><Settings settings={settings} onSave={setSettings} timesheets={timesheets} setTimesheets={setTimesheets} onSyncN8N={runN8NImport} onRestartTour={() => { try { localStorage.removeItem('zeitblick-tour-completed'); } catch (e) {} setShowTour(true); }} /></SectionErrorBoundary>;
      default:
        return <SectionErrorBoundary label="Übersicht"><Dashboard timesheets={filteredTimesheets} calculations={calculations} settings={settings} effectiveSettings={effectiveSettings} onSettings={setSettings} onViewDetail={handleViewDetail} onUpdateTimesheets={setTimesheets} projects={filteredProjects} projectFilter={projectFilter} onProjectFilter={handleProjectFilter} personFilter={personFilter} onPersonFilter={handlePersonFilter} allTimesheets={timesheets} personFilteredTimesheets={personFiltered} getPersonSettings={getPersonSettings} resolveName={resolveName} getBaseProject={getBaseProject} completedProjects={settings.completedProjects || {}} /></SectionErrorBoundary>;
    }
  };

  const filterCtx = useMemo(() => ({
    projectFilter, personFilter,
    onProjectFilter: handleProjectFilter,
    onPersonFilter: handlePersonFilter,
  }), [projectFilter, personFilter, handleProjectFilter, handlePersonFilter]);

  const settingsCtx = useMemo(() => ({
    settings, effectiveSettings, onSettings: setSettings,
    getPersonSettings, resolveName, getBaseProject,
  }), [settings, effectiveSettings, getPersonSettings, resolveName]);

  return (
    <ErrorBoundary>
    <FilterContext.Provider value={filterCtx}>
    <SettingsContext.Provider value={settingsCtx}>
    <div
      className="app-container app-shell"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <Sidebar
        currentView={view}
        onNavigate={(v) => { if (v !== 'create') setSelectedSheet(null); setView(v); }}
        timesheetCount={timesheets.length}
        projects={filteredProjects}
        projectCounts={projectCounts}
        projectFilter={projectFilter}
        onProjectFilter={handleProjectFilter}
        onSearch={() => { setSearchOpen(true); setTimeout(() => searchInputRef.current?.focus(), 50); }}
        theme={settings.theme || 'light'}
        onToggleTheme={() => setSettings(s => ({ ...s, theme: s.theme === 'dark' ? 'light' : 'dark' }))}
      />
      <Topbar
        currentView={view}
        contextLabel={
          [
            personFilter !== 'all' ? `Person: ${personFilter}` : null,
            projectFilter !== 'all' ? `Projekt: ${projectFilter}` : null,
          ].filter(Boolean).join(' · ') || null
        }
        onCreate={() => { setSelectedSheet(null); setView('create'); }}
        onImport={handleOpenDialog}
        onImportFolder={handleOpenFolderDialog}
        onSearch={() => { setSearchOpen(true); setTimeout(() => searchInputRef.current?.focus(), 50); }}
        theme={settings.theme || 'light'}
        onToggleTheme={() => setSettings(s => ({ ...s, theme: s.theme === 'dark' ? 'light' : 'dark' }))}
      />
      <FilterSidebar
        persons={personsInProject}
        personCounts={personCounts}
        personFilter={personFilter}
        onPersonFilter={handlePersonFilter}
        projects={filteredProjects}
        projectCounts={projectCounts}
        projectFilter={projectFilter}
        onProjectFilter={handleProjectFilter}
        timeFilter={timeFilter}
        onTimeFilter={setTimeFilter}
      />
      <main id="main-content" className="main-content app-main">
        <FilterChips
          personFilter={personFilter}
          onPersonFilter={handlePersonFilter}
          projectFilter={projectFilter}
          onProjectFilter={handleProjectFilter}
        />
        {renderView()}
      </main>

      {/* Search Overlay */}
      {searchOpen && (
        <div className="search-overlay" onClick={() => { setSearchOpen(false); setSearchQuery(''); }}>
          <div className="search-dialog" onClick={e => e.stopPropagation()}>
            <div className="search-input-wrapper">
              <span className="search-input-icon" aria-hidden="true">🔍</span>
              <input
                ref={searchInputRef}
                type="text"
                className="search-input"
                placeholder='Suche: Person, Projekt, KW (z.B. "KW 18") oder Datum'
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                autoFocus
              />
              {searchQuery && (
                <button className="search-clear-btn" onClick={() => setSearchQuery('')} aria-label="Suche leeren">✕</button>
              )}
              <kbd className="search-kbd">ESC</kbd>
            </div>
            {searchQuery.trim() && (
              <div className="search-results">
                {searchResults.length === 0 && (
                  <div className="search-empty">Nichts gefunden für „{searchQuery}". Tipp: Suche nach Name, Projektnummer oder KW (z.B. „KW 18").</div>
                )}                {searchResults.length >= 50 && (
                  <div className="search-empty" style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Weitere Ergebnisse vorhanden — Suche verfeinern</div>
                )}                {searchResults.map(sheet => {
                  const kw = getTimesheetKW(sheet);
                  const firstDate = sheet.days?.find(d => d.datum)?.datum || '';
                  const lastDate = sheet.days ? [...sheet.days].reverse().find(d => d.datum)?.datum || '' : '';
                  return (
                    <button
                      key={sheet.id}
                      className="search-result-item"
                      onClick={() => handleSearchSelect(sheet)}
                    >
                      <div className="search-result-main">
                        <span className="search-result-name">{resolveName(sheet.name || 'Unbekannt')}</span>
                        <span className="search-result-project">{sheet.projekt || 'Kein Projekt'}</span>
                      </div>
                      <div className="search-result-meta">
                        {kw && <span className="search-result-kw">KW {kw}</span>}
                        <span className="search-result-dates">{firstDate}{lastDate && firstDate !== lastDate ? ` – ${lastDate}` : ''}</span>
                        <span className="search-result-hours">{(sheet.totals?.stundenTotal || 0).toFixed(1)} Std.</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {isDragOver && <ImportOverlay />}
      {isImporting && (
        <div className="importing-overlay">
          <div className="importing-spinner" />
          <p>Stundenzettel werden importiert — bitte einen Moment…</p>
        </div>
      )}
      {importMessage && (
        <div className="import-toast">
          {importMessage}
        </div>
      )}
      {saveError && (
        <div className="import-toast import-toast-error">
          Konnte nicht speichern. Letzte Änderung wird beim nächsten Versuch erneut gesichert. ({saveError})
        </div>
      )}
      {trash.length > 0 && (
        <button className="undo-fab" onClick={handleUndo} title="Letzten Löschvorgang rückgängig machen (⌘Z)" aria-label="Rückgängig">
          ↩ Rückgängig ({trash.length})
        </button>
      )}
      {showTour && <OnboardingTour onComplete={() => setShowTour(false)} onEnableN8N={(yes) => setSettings(s => ({ ...s, n8nEnabled: !!yes }))} />}
      {n8nOverlay && (
        <N8NImportOverlay
          deviations={n8nOverlay.deviations}
          substitutions={n8nOverlay.substitutions}
          unknownNames={n8nOverlay.unknownNames}
          newProjects={n8nOverlay.newProjects}
          onComplete={finalizeN8N}
          onCancel={() => { setN8nOverlay(null); n8nRunning.current = false; }}
        />
      )}
      <UpdateOverlay />
    </div>
    </SettingsContext.Provider>
    </FilterContext.Provider>
    </ErrorBoundary>
  );
}

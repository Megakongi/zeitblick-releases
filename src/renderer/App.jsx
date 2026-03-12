import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import TimesheetList from './components/TimesheetList';
import TimesheetDetail from './components/TimesheetDetail';
import TimesheetCreate from './components/TimesheetCreate';
import Settings from './components/Settings';
import ImportOverlay from './components/ImportOverlay';
import OnboardingTour from './components/OnboardingTour';
import UpdateOverlay from './components/UpdateOverlay';
import { calculateTVFFS } from './utils/tvffsCalculator';
import { getTimesheetKW } from './utils/calendarWeek';

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
  const [settings, setSettings] = useState({ tagesgage: 0, gageType: 'tag', zeitkonto: false, theme: 'dark', spesen: [], personGagen: {}, positionGagen: {}, nameAliases: {}, crews: {}, projectCrews: {} });
  const [isImporting, setIsImporting] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [importMessage, setImportMessage] = useState(null);
  const [projectFilter, setProjectFilter] = useState('all');
  const [personFilter, setPersonFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef(null);
  const [showTour, setShowTour] = useState(() => { try { return !localStorage.getItem('zeitblick-tour-completed'); } catch { return true; } });
  const [trash, setTrash] = useState([]); // Trash bin for undo
  const [saveError, setSaveError] = useState(null);
  const dragCounter = useRef(0);
  const saveTimeout = useRef(null);

  // Load data on startup
  useEffect(() => {
    async function load() {
      const data = await window.electronAPI.loadData();
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
      if (data.settings) setSettings(data.settings);
      if (data._loadError) {
        setImportMessage('⚠ Fehler beim Laden: ' + data._loadError);
        setTimeout(() => setImportMessage(null), 8000);
      }
    }
    load();
  }, []);

  // Debounced save — waits 500ms after last change before saving
  useEffect(() => {
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
      if (added > 0) parts.push(`${added} importiert`);
      if (duplicates > 0) parts.push(`${duplicates} Duplikat${duplicates > 1 ? 'e' : ''} übersprungen`);
      if (errors.length > 0) {
        const failedNames = errors.map(e => e.filePath ? e.filePath.split('/').pop().split('\\').pop() : '?').join(', ');
        parts.push(`${errors.length} fehlgeschlagen: ${failedNames}`);
      }
      if (parts.length > 0) {
        setImportMessage(parts.join(', '));
        setTimeout(() => setImportMessage(null), 4000);
      }
    } catch (error) {
      console.error('Import failed:', error);
      setImportMessage('Import fehlgeschlagen');
      setTimeout(() => setImportMessage(null), 4000);
    }
    setIsImporting(false);
  }, [timesheets]);

  // Drag & Drop handlers — use counter to prevent flicker from child elements
  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
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
  const handleViewDetail = useCallback((sheet) => {
    setSelectedSheet(sheet);
    setView('detail');
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
    document.documentElement.setAttribute('data-theme', settings.theme || 'dark');
  }, [settings.theme]);

  // Get unique projects and persons for filters
  // Name alias resolver: maps alias names to canonical names
  const nameAliases = settings.nameAliases || {};
  const resolveName = useCallback((name) => {
    return nameAliases[name] || name;
  }, [nameAliases]);

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
    }).slice(0, 20); // Limit results
  }, [searchQuery, timesheets, resolveName]);

  const handleSearchSelect = useCallback((sheet) => {
    setSelectedSheet(sheet);
    setView('detail');
    setSearchOpen(false);
    setSearchQuery('');
  }, []);

  const projects = [...new Set(timesheets.map(t => getBaseProject(t.projekt)))].sort();
  const persons = [...new Set(timesheets.map(t => resolveName(t.name || 'Unbekannt')))].sort();
  
  // Filter timesheets by person first (using resolved names), then by project
  const personFiltered = personFilter === 'all'
    ? timesheets
    : timesheets.filter(t => resolveName(t.name || 'Unbekannt') === personFilter);
  
  const filteredTimesheets = projectFilter === 'all'
    ? personFiltered
    : personFiltered.filter(t => getBaseProject(t.projekt) === projectFilter);

  // Filtered projects (only projects available for selected person)
  const filteredProjects = [...new Set(personFiltered.map(t => getBaseProject(t.projekt)))].sort();

  // Helper: get settings with per-person gage override (via position-based gagen)
  const getPersonSettings = useCallback((personName) => {
    // First check personGagen (legacy / direct override)
    const pg = settings.personGagen || {};
    if (personName && pg[personName] && pg[personName].tagesgage > 0) {
      return { ...settings, tagesgage: pg[personName].tagesgage, gageType: pg[personName].gageType || settings.gageType };
    }
    // Then look up by position from timesheets
    const posGagen = settings.positionGagen || {};
    const resolvedName = resolveName(personName);
    const ts = timesheets.find(t => resolveName(t.name || 'Unbekannt') === resolvedName && t.position);
    if (ts && ts.position && posGagen[ts.position] && posGagen[ts.position].tagesgage > 0) {
      return { ...settings, tagesgage: posGagen[ts.position].tagesgage, gageType: posGagen[ts.position].gageType || settings.gageType };
    }
    return settings;
  }, [settings, timesheets, resolveName]);

  // TVFFS calculations — use per-person gage when a person is selected
  const effectiveSettings = personFilter !== 'all' ? getPersonSettings(personFilter) : settings;
  const calculations = calculateTVFFS(filteredTimesheets, effectiveSettings);

  // Person sheet counts for sidebar (using resolved names)
  const personCounts = {};
  for (const t of timesheets) {
    const name = resolveName(t.name || 'Unbekannt');
    personCounts[name] = (personCounts[name] || 0) + 1;
  }

  const handlePersonFilter = useCallback((person) => {
    setPersonFilter(person);
    setProjectFilter('all'); // reset project filter when switching person
    setView('dashboard');
  }, []);

  const renderView = () => {
    switch (view) {
      case 'dashboard':
        return <Dashboard timesheets={filteredTimesheets} calculations={calculations} settings={settings} effectiveSettings={effectiveSettings} onSettings={setSettings} onViewDetail={handleViewDetail} onUpdateTimesheets={setTimesheets} projects={filteredProjects} projectFilter={projectFilter} onProjectFilter={setProjectFilter} personFilter={personFilter} onPersonFilter={handlePersonFilter} allTimesheets={timesheets} personFilteredTimesheets={personFiltered} getPersonSettings={getPersonSettings} resolveName={resolveName} getBaseProject={getBaseProject} />;
      case 'timesheets':
        return <TimesheetList timesheets={timesheets} onViewDetail={handleViewDetail} onDelete={handleDelete} onBulkDelete={handleBulkDelete} personFilter={personFilter} resolveName={resolveName} getBaseProject={getBaseProject} />;
      case 'detail':
        return selectedSheet ? <TimesheetDetail sheet={selectedSheet} settings={getPersonSettings(selectedSheet.name)} onBack={() => setView('timesheets')} onEdit={handleEditSheet} allTimesheets={timesheets} onSelectSheet={(s) => { setSelectedSheet(s); }} /> : null;
      case 'create':
        return <TimesheetCreate
          onSave={handleCreateSheet}
          onSaveBatch={handleBatchCreateSheets}
          onCancel={() => { setSelectedSheet(null); setView('timesheets'); }}
          editSheet={view === 'create' ? selectedSheet : null}
          existingTimesheets={timesheets}
          crews={settings.crews || {}}
          onCreateNext={(weekStart) => { setSelectedSheet(null); setView('create'); }}
        />;
      case 'settings':
        return <Settings settings={settings} onSave={setSettings} timesheets={timesheets} setTimesheets={setTimesheets} />;
      default:
        return <Dashboard timesheets={filteredTimesheets} calculations={calculations} settings={settings} effectiveSettings={effectiveSettings} onSettings={setSettings} onViewDetail={handleViewDetail} onUpdateTimesheets={setTimesheets} projects={filteredProjects} projectFilter={projectFilter} onProjectFilter={setProjectFilter} personFilter={personFilter} onPersonFilter={handlePersonFilter} allTimesheets={timesheets} personFilteredTimesheets={personFiltered} getPersonSettings={getPersonSettings} resolveName={resolveName} getBaseProject={getBaseProject} />;
    }
  };

  return (
    <div
      className="app-container"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <Sidebar
        currentView={view}
        onNavigate={(v) => { if (v !== 'create') setSelectedSheet(null); setView(v); }}
        onImport={handleOpenDialog}
        onImportFolder={handleOpenFolderDialog}
        onCreate={() => { setSelectedSheet(null); setView('create'); }}
        onSearch={() => { setSearchOpen(true); setTimeout(() => searchInputRef.current?.focus(), 50); }}
        timesheetCount={timesheets.length}
        theme={settings.theme || 'dark'}
        onToggleTheme={() => setSettings(s => ({ ...s, theme: s.theme === 'dark' ? 'light' : 'dark' }))}
        persons={persons}
        personCounts={personCounts}
        personFilter={personFilter}
        onPersonFilter={handlePersonFilter}
      />
      <main className="main-content">
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
                placeholder="Name, Projekt, KW oder Datum suchen…"
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
                  <div className="search-empty">Keine Ergebnisse für „{searchQuery}"</div>
                )}
                {searchResults.map(sheet => {
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
          <p>PDFs werden importiert...</p>
        </div>
      )}
      {importMessage && (
        <div className="import-toast">
          {importMessage}
        </div>
      )}
      {saveError && (
        <div className="import-toast import-toast-error">
          ⚠ Speicherfehler: {saveError}
        </div>
      )}
      {trash.length > 0 && (
        <button className="undo-fab" onClick={handleUndo} title="Letzten Löschvorgang rückgängig machen (⌘Z)" aria-label="Rückgängig">
          ↩ Rückgängig ({trash.length})
        </button>
      )}
      {showTour && <OnboardingTour onComplete={() => setShowTour(false)} />}
      <UpdateOverlay />
    </div>
  );
}

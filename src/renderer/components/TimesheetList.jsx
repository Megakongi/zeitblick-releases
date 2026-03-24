import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { getTimesheetKW, getTimesheetYear, formatKW } from '../utils/calendarWeek';
import { generateTimesheetHTML } from '../utils/pdfExport';
import { getInitials } from '../utils/helpers';

function getSheetHours(sheet) {
  // Use totals if available, else compute from individual days
  if (sheet.totals?.stundenTotal > 0) return sheet.totals.stundenTotal;
  return sheet.days ? sheet.days.reduce((sum, d) => sum + (Number(d.stundenTotal) || 0), 0) : 0;
}
function getSheetOvertime(sheet) {
  const t = sheet.totals || {};
  const fromTotals = (t.ueberstunden25 || 0) + (t.ueberstunden50 || 0) + (t.ueberstunden100 || 0);
  if (fromTotals > 0) return fromTotals;
  if (!sheet.days) return 0;
  return sheet.days.reduce((sum, d) => sum + (Number(d.ueberstunden25) || 0) + (Number(d.ueberstunden50) || 0) + (Number(d.ueberstunden100) || 0), 0);
}
function getSheetNacht(sheet) {
  if (sheet.totals?.nacht25 > 0) return sheet.totals.nacht25;
  return sheet.days ? sheet.days.reduce((sum, d) => sum + (Number(d.nacht25) || 0), 0) : 0;
}

export default function TimesheetList({ timesheets, onViewDetail, onDelete, onBulkDelete, personFilter, resolveName, getBaseProject, onRenameProject }) {
  const [confirmId, setConfirmId] = useState(null);
  const [bulkConfirm, setBulkConfirm] = useState(null);
  const [collapsedPersons, setCollapsedPersons] = useState({});
  const [sortBy, setSortBy] = useState('date'); // 'date' | 'name' | 'kw' | 'projekt'
  const [sortDir, setSortDir] = useState('desc'); // 'asc' | 'desc'
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [exporting, setExporting] = useState(false);
  const [kwFilter, setKwFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [activeProject, setActiveProject] = useState(null); // null = project grid, string = drilled in
  const [renamingProject, setRenamingProject] = useState(null); // project name being renamed
  const [renameValue, setRenameValue] = useState('');
  const resolve = resolveName || ((n) => n);

  // Clear stale selections when timesheets change (e.g. after delete)
  useEffect(() => {
    setSelectedIds(prev => {
      const validIds = new Set(timesheets.map(t => t.id));
      const cleaned = new Set([...prev].filter(id => validIds.has(id)));
      if (cleaned.size !== prev.size) return cleaned;
      return prev;
    });
  }, [timesheets]);

  const handleDelete = (id) => {
    setConfirmId(id);
  };

  const confirmDelete = () => {
    if (confirmId) {
      onDelete(confirmId);
      setConfirmId(null);
    }
  };

  const handleBulkDeleteAll = () => {
    const ids = timesheets.map(ts => ts.id);
    setBulkConfirm({ type: 'all', ids, label: `Alle ${ids.length} Einträge` });
  };

  const handleBulkDeletePerson = (person) => {
    const ids = timesheets.filter(ts => resolve(ts.name || 'Unbekannt') === person).map(ts => ts.id);
    setBulkConfirm({ type: 'person', person, ids, label: `Alle ${ids.length} Einträge von ${person}` });
  };

  const handleBulkDeleteProject = (person, project) => {
    const ids = timesheets.filter(ts => {
      const p = resolve(ts.name || 'Unbekannt');
      const proj = getBaseProject ? getBaseProject(ts.projekt) : (ts.projekt || 'Sonstiges');
      return p === person && proj === project;
    }).map(ts => ts.id);
    const label = person && personFilter !== 'all'
      ? `Alle ${ids.length} Einträge von „${project}"`
      : `Alle ${ids.length} Einträge von ${person} · „${project}"`;
    setBulkConfirm({ type: 'project', person, project, ids, label });
  };

  const confirmBulkDelete = () => {
    if (bulkConfirm && onBulkDelete) {
      onBulkDelete(bulkConfirm.ids);
    }
    setBulkConfirm(null);
  };

  // Selection helpers
  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === timesheets.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(timesheets.map(t => t.id)));
    }
  };

  const clearSelection = () => { setSelectedIds(new Set()); setKwFilter(''); };

  // Gather unique KWs from visible timesheets, sorted descending
  const availableKWs = useMemo(() => {
    const source = activeProject ? timesheets.filter(s => {
      const proj = getBaseProject ? getBaseProject(s.projekt) : (s.projekt || 'Sonstiges');
      return proj === activeProject;
    }) : timesheets;
    const kwMap = new Map();
    for (const sheet of source) {
      const kw = getTimesheetKW(sheet);
      const year = getTimesheetYear(sheet);
      if (!kw) continue;
      const key = `${kw}/${year}`;
      if (!kwMap.has(key)) kwMap.set(key, { kw, year, ids: [] });
      kwMap.get(key).ids.push(sheet.id);
    }
    return [...kwMap.values()].sort((a, b) => b.year - a.year || b.kw - a.kw);
  }, [timesheets, activeProject, getBaseProject]);

  // Select all sheets from a specific KW
  const selectByKW = useCallback((kwKey) => {
    setKwFilter(kwKey);
    if (!kwKey) { setSelectedIds(new Set()); return; }
    const entry = availableKWs.find(e => `${e.kw}/${e.year}` === kwKey);
    if (entry) {
      setSelectedIds(new Set(entry.ids));
    }
  }, [availableKWs]);

  // PDF export for selected sheets
  const handleExportSelectedPDF = useCallback(async () => {
    const selected = timesheets.filter(t => selectedIds.has(t.id));
    if (selected.length === 0) return;
    setExporting(true);
    try {
      // Use batch folder export if available and more than 1 selected
      if (selected.length > 1 && window.electronAPI.exportPDFsToFolder) {
        const htmlArray = selected.map(sheet => {
          const dateRange = getDateRange(sheet).replace(/\s/g, '');
          return {
            html: generateTimesheetHTML(sheet),
            filename: `Stundenzettel_${sheet.name || 'Unbekannt'}_${sheet.projekt || 'Projekt'}_${dateRange}.pdf`,
          };
        });
        await window.electronAPI.exportPDFsToFolder(htmlArray);
      } else {
        for (const sheet of selected) {
          const htmlContent = generateTimesheetHTML(sheet);
          const dateRange = getDateRange(sheet).replace(/\s/g, '');
          const defaultName = `Stundenzettel_${sheet.name || 'Unbekannt'}_${sheet.projekt || 'Projekt'}_${dateRange}.pdf`;
          await window.electronAPI.exportTimesheetPDF(htmlContent, defaultName);
        }
      }
    } catch (err) {
      console.error('PDF export failed:', err);
      alert('PDF-Export fehlgeschlagen: ' + (err.message || err));
    }
    setExporting(false);
  }, [timesheets, selectedIds]);

  const togglePerson = (name) => {
    setCollapsedPersons(prev => ({ ...prev, [name]: prev[name] === false ? true : false }));
  };

  const drillIntoProject = (name) => {
    setActiveProject(name);
    setCollapsedPersons({}); // reset so default (collapsed) applies
  };

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortDir(field === 'kw' ? 'desc' : 'asc');
    }
  };

  const sortIcon = (field) => {
    if (sortBy !== field) return '⇅';
    return sortDir === 'asc' ? '↑' : '↓';
  };

  // Sort timesheets
  const sortedTimesheets = useMemo(() => {
    // First apply date range filter
    let arr = [...timesheets];
    if (dateFrom || dateTo) {
      arr = arr.filter(sheet => {
        const d = getFirstDate(sheet);
        if (dateFrom) {
          const from = new Date(dateFrom + 'T00:00:00');
          if (d < from) return false;
        }
        if (dateTo) {
          const to = new Date(dateTo + 'T23:59:59');
          if (d > to) return false;
        }
        return true;
      });
    }
    const dir = sortDir === 'asc' ? 1 : -1;
    
    arr.sort((a, b) => {
      switch (sortBy) {
        case 'name': {
          const na = resolve(a.name || 'Unbekannt').toLowerCase();
          const nb = resolve(b.name || 'Unbekannt').toLowerCase();
          return dir * na.localeCompare(nb, 'de');
        }
        case 'kw': {
          const kwA = getTimesheetKW(a) || 0;
          const kwB = getTimesheetKW(b) || 0;
          const yearA = getTimesheetYear(a) || 0;
          const yearB = getTimesheetYear(b) || 0;
          const cmpYear = yearA - yearB;
          if (cmpYear !== 0) return dir * cmpYear;
          return dir * (kwA - kwB);
        }
        case 'projekt': {
          const pa = (a.projekt || 'Sonstiges').toLowerCase();
          const pb = (b.projekt || 'Sonstiges').toLowerCase();
          return dir * pa.localeCompare(pb, 'de');
        }
        case 'date':
        default: {
          return dir * (getFirstDate(a) - getFirstDate(b));
        }
      }
    });
    return arr;
  }, [timesheets, sortBy, sortDir, resolve, dateFrom, dateTo]);

  // Build project summaries for the tile view
  const projectSummaries = useMemo(() => {
    const map = {};
    for (const sheet of timesheets) {
      const project = getBaseProject ? getBaseProject(sheet.projekt) : (sheet.projekt || 'Sonstiges');
      if (!map[project]) map[project] = { name: project, sheets: [], people: new Set(), totalHours: 0, totalOvertime: 0 };
      map[project].sheets.push(sheet);
      map[project].people.add(resolve(sheet.name || 'Unbekannt'));
      map[project].totalHours += getSheetHours(sheet);
      map[project].totalOvertime += getSheetOvertime(sheet);
    }
    return Object.values(map).sort((a, b) => {
      // Sort by most recent sheet date (descending)
      const dateA = Math.max(...a.sheets.map(s => getFirstDate(s).getTime()));
      const dateB = Math.max(...b.sheets.map(s => getFirstDate(s).getTime()));
      return dateB - dateA;
    });
  }, [timesheets, resolve, getBaseProject]);

  // Reset activeProject when it no longer exists
  useEffect(() => {
    if (activeProject && !projectSummaries.find(p => p.name === activeProject)) {
      setActiveProject(null);
    }
  }, [activeProject, projectSummaries]);

  // Sheets for the currently active project
  const activeProjectSheets = useMemo(() => {
    if (!activeProject) return [];
    return timesheets.filter(s => {
      const project = getBaseProject ? getBaseProject(s.projekt) : (s.projekt || 'Sonstiges');
      return project === activeProject;
    });
  }, [timesheets, activeProject, getBaseProject]);

  if (timesheets.length === 0) {
    return (
      <div className="timesheet-list empty-state">
        <div className="empty-icon">📋</div>
        <h2>Keine Einträge</h2>
        <p>Importiere PDFs per Drag & Drop.</p>
      </div>
    );
  }

  // ============ PROJECT GRID VIEW (no project selected) ============
  if (!activeProject) {
    return (
      <div className="timesheet-list" role="region" aria-label="Projekte">
        <div className="list-header">
          <div>
            <h2>Einträge</h2>
            <span className="subtitle">
              {projectSummaries.length} {projectSummaries.length === 1 ? 'Projekt' : 'Projekte'} · {timesheets.length} Stundenzettel
            </span>
          </div>
        </div>
        <div className="project-tiles-grid">
          {projectSummaries.map(proj => {
            const dateRange = getProjectDateRange(proj.sheets);
            const kwRange = getProjectKWRange(proj.sheets);
            const people = [...proj.people].sort();
            return (
              <div
                key={proj.name}
                className="project-tile"
                onClick={() => { if (renamingProject !== proj.name) drillIntoProject(proj.name); }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' && renamingProject !== proj.name) drillIntoProject(proj.name); }}
                aria-label={`Projekt ${proj.name} öffnen`}
              >
                <div className="project-tile-header">
                  {renamingProject === proj.name ? (
                    <form className="project-rename-form" onSubmit={(e) => {
                      e.preventDefault();
                      if (renameValue.trim() && renameValue.trim() !== proj.name) {
                        onRenameProject(proj.name, renameValue.trim());
                      }
                      setRenamingProject(null);
                    }} onClick={(e) => e.stopPropagation()}>
                      <input
                        className="project-rename-input"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={() => {
                          if (renameValue.trim() && renameValue.trim() !== proj.name) {
                            onRenameProject(proj.name, renameValue.trim());
                          }
                          setRenamingProject(null);
                        }}
                        onKeyDown={(e) => { if (e.key === 'Escape') setRenamingProject(null); }}
                        autoFocus
                      />
                    </form>
                  ) : (
                    <>
                      <span className="project-tile-name">{proj.name}</span>
                      {onRenameProject && (
                        <button
                          className="project-rename-btn"
                          title="Projekt umbenennen"
                          onClick={(e) => {
                            e.stopPropagation();
                            setRenamingProject(proj.name);
                            setRenameValue(proj.name);
                          }}
                        >✏️</button>
                      )}
                    </>
                  )}
                  <span className="project-tile-badge">{proj.sheets.length}</span>
                </div>
                <div className="project-tile-meta">
                  {kwRange && <span className="project-tile-kw">{kwRange}</span>}
                  {dateRange && <span className="project-tile-dates">{dateRange}</span>}
                </div>
                <div className="project-tile-stats">
                  <div className="project-tile-stat">
                    <span className="project-tile-stat-value">{proj.totalHours.toFixed(1)}</span>
                    <span className="project-tile-stat-label">Stunden</span>
                  </div>
                  <div className="project-tile-stat">
                    <span className="project-tile-stat-value">{proj.totalOvertime.toFixed(1)}</span>
                    <span className="project-tile-stat-label">Überstunden</span>
                  </div>
                  <div className="project-tile-stat">
                    <span className="project-tile-stat-value">{proj.sheets.length}</span>
                    <span className="project-tile-stat-label">Zettel</span>
                  </div>
                </div>
                <div className="project-tile-people">
                  {people.slice(0, 5).map(p => (
                    <span key={p} className="project-tile-avatar" title={p}>{getInitials(p)}</span>
                  ))}
                  {people.length > 5 && <span className="project-tile-avatar project-tile-avatar-more">+{people.length - 5}</span>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Delete confirmations */}
        {confirmId && (
          <div className="confirm-overlay">
            <div className="confirm-dialog">
              <h3>Eintrag löschen?</h3>
              <p>Dieser Eintrag wird unwiderruflich gelöscht.</p>
              <div className="confirm-actions">
                <button className="btn-cancel" onClick={() => setConfirmId(null)}>Abbrechen</button>
                <button className="btn-confirm-delete" onClick={confirmDelete}>Löschen</button>
              </div>
            </div>
          </div>
        )}
        {bulkConfirm && (
          <div className="confirm-overlay">
            <div className="confirm-dialog">
              <h3>Gesammelt löschen?</h3>
              <p>{bulkConfirm.label} werden unwiderruflich gelöscht.</p>
              <div className="confirm-actions">
                <button className="btn-cancel" onClick={() => setBulkConfirm(null)}>Abbrechen</button>
                <button className="btn-confirm-delete" onClick={confirmBulkDelete}>{bulkConfirm.ids.length} Zettel löschen</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ============ DRILLED-IN PROJECT VIEW (active project selected) ============

  // Group active project sheets by person
  const byPerson = {};
  for (const sheet of sortedTimesheets.filter(s => {
    const proj = getBaseProject ? getBaseProject(s.projekt) : (s.projekt || 'Sonstiges');
    return proj === activeProject;
  })) {
    const person = resolve(sheet.name || 'Unbekannt');
    if (!byPerson[person]) byPerson[person] = [];
    byPerson[person].push(sheet);
  }

  // Sort within groups if sorting by date
  if (sortBy === 'date') {
    for (const person of Object.keys(byPerson)) {
      byPerson[person].sort((a, b) => getFirstDate(a) - getFirstDate(b));
    }
  }

  const personNames = Object.keys(byPerson).sort();
  const showPersonHeaders = personNames.length > 1;
  const activeSheetCount = Object.values(byPerson).reduce((sum, arr) => sum + arr.length, 0);

  return (
    <div className="timesheet-list" role="region" aria-label="Stundenzettel-Liste">
      <div className="list-header">
        <div>
          <button className="back-to-projects-btn" onClick={() => { setActiveProject(null); setSelectedIds(new Set()); setKwFilter(''); setRenamingProject(null); }}>
            ← Projekte
          </button>
          {renamingProject === activeProject ? (
            <form className="project-rename-form" onSubmit={(e) => {
              e.preventDefault();
              if (renameValue.trim() && renameValue.trim() !== activeProject) {
                onRenameProject(activeProject, renameValue.trim());
                setActiveProject(renameValue.trim());
              }
              setRenamingProject(null);
            }}>
              <input
                className="project-rename-input project-rename-input-lg"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={() => {
                  if (renameValue.trim() && renameValue.trim() !== activeProject) {
                    onRenameProject(activeProject, renameValue.trim());
                    setActiveProject(renameValue.trim());
                  }
                  setRenamingProject(null);
                }}
                onKeyDown={(e) => { if (e.key === 'Escape') setRenamingProject(null); }}
                autoFocus
              />
            </form>
          ) : (
            <h2 style={{ display: 'inline' }}>
              {activeProject}
              {onRenameProject && (
                <button
                  className="project-rename-btn project-rename-btn-lg"
                  title="Projekt umbenennen"
                  onClick={() => { setRenamingProject(activeProject); setRenameValue(activeProject); }}
                >✏️</button>
              )}
            </h2>
          )}
          <span className="subtitle">
            {activeSheetCount} Stundenzettel · {personNames.length} {personNames.length === 1 ? 'Person' : 'Personen'}
          </span>
        </div>
        <button className="bulk-delete-btn" onClick={() => {
          const ids = activeProjectSheets.map(s => s.id);
          setBulkConfirm({ type: 'project', project: activeProject, ids, label: `Alle ${ids.length} Einträge von „${activeProject}"` });
        }} title="Alle Einträge dieses Projekts löschen" aria-label="Alle Einträge dieses Projekts löschen">
          🗑 Alle löschen
        </button>
      </div>

      {/* Sort Controls */}
      <div className="sort-controls" role="toolbar" aria-label="Sortierung">
        <span className="sort-label">Sortieren:</span>
        <button className={`sort-btn ${sortBy === 'name' ? 'active' : ''}`} onClick={() => handleSort('name')}>
          Name {sortIcon('name')}
        </button>
        <button className={`sort-btn ${sortBy === 'kw' ? 'active' : ''}`} onClick={() => handleSort('kw')}>
          KW {sortIcon('kw')}
        </button>
        <button className={`sort-btn ${sortBy === 'date' ? 'active' : ''}`} onClick={() => handleSort('date')}>
          Datum {sortIcon('date')}
        </button>
        <div className="sort-controls-spacer" />
        <div className="date-range-filter">
          <input type="date" className="date-filter-input" value={dateFrom} onChange={e => setDateFrom(e.target.value)} title="Von Datum" aria-label="Filtern ab Datum" />
          <span className="date-filter-sep">–</span>
          <input type="date" className="date-filter-input" value={dateTo} onChange={e => setDateTo(e.target.value)} title="Bis Datum" aria-label="Filtern bis Datum" />
          {(dateFrom || dateTo) && (
            <button className="date-filter-clear" onClick={() => { setDateFrom(''); setDateTo(''); }} aria-label="Datumsfilter zurücksetzen">✕</button>
          )}
        </div>
        {availableKWs.length > 0 && (
          <select className="kw-quick-select" value={kwFilter} onChange={e => selectByKW(e.target.value)} title="Alle Zettel einer KW auswählen">
            <option value="">KW auswählen…</option>
            {availableKWs.map(e => (
              <option key={`${e.kw}/${e.year}`} value={`${e.kw}/${e.year}`}>
                KW {e.kw}/{e.year} ({e.ids.length} Zettel)
              </option>
            ))}
          </select>
        )}
        <button className={`sort-btn select-all-btn ${selectedIds.size > 0 ? 'active' : ''}`} onClick={() => {
          const projIds = activeProjectSheets.map(s => s.id);
          if (selectedIds.size === projIds.length && projIds.every(id => selectedIds.has(id))) {
            setSelectedIds(new Set());
          } else {
            setSelectedIds(new Set(projIds));
          }
        }} title="Alle aus-/abwählen">
          {activeProjectSheets.every(s => selectedIds.has(s.id)) && activeProjectSheets.length > 0 ? '☑' : '☐'} Auswählen
        </button>
      </div>

      {/* Selection Action Bar */}
      {selectedIds.size > 0 && (
        <div className="selection-bar">
          <span className="selection-bar-info" role="status">{selectedIds.size} ausgewählt</span>
          <div className="selection-bar-actions">
            <button className="selection-bar-btn export-btn" onClick={handleExportSelectedPDF} disabled={exporting}>
              {exporting ? '⏳ Exportiere...' : '📄 Als PDF exportieren'}
            </button>
            <button className="selection-bar-btn clear-btn" onClick={clearSelection}>✕ Auswahl aufheben</button>
          </div>
        </div>
      )}

      {/* Delete Confirmations */}
      {confirmId && (
        <div className="confirm-overlay">
          <div className="confirm-dialog">
            <h3>Eintrag löschen?</h3>
            <p>Dieser Eintrag wird unwiderruflich gelöscht.</p>
            <div className="confirm-actions">
              <button className="btn-cancel" onClick={() => setConfirmId(null)}>Abbrechen</button>
              <button className="btn-confirm-delete" onClick={confirmDelete}>Löschen</button>
            </div>
          </div>
        </div>
      )}
      {bulkConfirm && (
        <div className="confirm-overlay">
          <div className="confirm-dialog">
            <h3>Gesammelt löschen?</h3>
            <p>{bulkConfirm.label} werden unwiderruflich gelöscht.</p>
            <div className="confirm-actions">
              <button className="btn-cancel" onClick={() => setBulkConfirm(null)}>Abbrechen</button>
              <button className="btn-confirm-delete" onClick={confirmBulkDelete}>{bulkConfirm.ids.length} Zettel löschen</button>
            </div>
          </div>
        </div>
      )}

      {personNames.map(person => {
        const sheets = byPerson[person];
        const isCollapsed = collapsedPersons[person] !== false;
        const totalHours = sheets.reduce((sum, s) => sum + getSheetHours(s), 0);

        return (
          <div key={person} className="person-group">
            {showPersonHeaders && (
              <div className="person-group-header-wrapper">
                <button className="person-group-header" onClick={() => togglePerson(person)}>
                  <div className="person-group-info">
                    <span className={`person-group-chevron ${isCollapsed ? '' : 'open'}`}>›</span>
                    <span className="person-group-avatar">{getInitials(person)}</span>
                    <span className="person-group-name">{person}</span>
                  </div>
                  <div className="person-group-meta">
                    <span className="person-group-stat">{sheets.length} Zettel</span>
                    <span className="person-group-stat">{totalHours.toFixed(2)} Std.</span>
                  </div>
                </button>
                <button className="person-delete-btn" onClick={() => handleBulkDeletePerson(person)} title={`Alle Zettel von ${person} löschen`}>
                  🗑
                </button>
              </div>
            )}

            {!isCollapsed && (
              <div className="sheets-grid">
                {sheets.map(sheet => (
                  <div key={sheet.id} className={`sheet-card ${selectedIds.has(sheet.id) ? 'sheet-card-selected' : ''}`}>
                    <div className="sheet-card-header" onClick={() => onViewDetail(sheet)}>
                      <label className="sheet-card-checkbox" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(sheet.id)}
                          onChange={() => toggleSelect(sheet.id)}
                        />
                      </label>
                      <div className="sheet-card-info">
                        <span className="sheet-card-name">{sheet.name || 'Unbekannt'}</span>
                        <span className="sheet-card-position">{sheet.position} — {sheet.abteilung}</span>
                        <span className="sheet-card-firma">{sheet.produktionsfirma}</span>
                      </div>
                      <div className="sheet-card-right">
                        <span className="sheet-card-kw">{formatKW(sheet)}</span>
                        <span className="sheet-card-dates">{getDateRange(sheet)}</span>
                      </div>
                    </div>
                    <div className="sheet-card-stats">
                      <div className="mini-stat">
                        <span className="mini-stat-value">{getSheetHours(sheet).toFixed(2)}</span>
                        <span className="mini-stat-label">Stunden</span>
                      </div>
                      <div className="mini-stat">
                        <span className="mini-stat-value">{getWorkDays(sheet)}</span>
                        <span className="mini-stat-label">Tage</span>
                      </div>
                      <div className="mini-stat">
                        <span className="mini-stat-value">{getSheetOvertime(sheet).toFixed(2)}</span>
                        <span className="mini-stat-label">Überstunden</span>
                      </div>
                      <div className="mini-stat">
                        <span className="mini-stat-value">{getSheetNacht(sheet).toFixed(2)}</span>
                        <span className="mini-stat-label">Nacht</span>
                      </div>
                    </div>
                    <div className="sheet-card-actions">
                      <button className="btn-view" onClick={() => onViewDetail(sheet)}>Details →</button>
                      <button className="btn-delete" onClick={() => handleDelete(sheet.id)}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}



function getFirstDate(sheet) {
  for (const day of sheet.days) {
    if (day.datum) {
      const parts = day.datum.split('.');
      if (parts.length === 3) {
        return new Date(parts[2], parts[1] - 1, parts[0]);
      }
    }
  }
  return new Date(0);
}

function getDateRange(sheet) {
  const dates = sheet.days.filter(d => d.datum).map(d => d.datum);
  if (dates.length === 0) return 'Kein Datum';
  if (dates.length === 1) return dates[0];
  return `${dates[0]} – ${dates[dates.length - 1]}`;
}

function getWorkDays(sheet) {
  return sheet.days.filter(d => Number(d.stundenTotal) > 0 || (d.start && String(d.start).trim().includes(':'))).length;
}

function getProjectDateRange(sheets) {
  const allDates = [];
  for (const sheet of sheets) {
    for (const day of sheet.days) {
      if (day.datum) {
        const parts = day.datum.split('.');
        if (parts.length === 3) allDates.push(new Date(parts[2], parts[1] - 1, parts[0]));
      }
    }
  }
  if (allDates.length === 0) return '';
  allDates.sort((a, b) => a - b);
  const fmt = d => `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()}`;
  const first = allDates[0];
  const last = allDates[allDates.length - 1];
  if (first.getTime() === last.getTime()) return fmt(first);
  return `${fmt(first)} – ${fmt(last)}`;
}

function getProjectKWRange(sheets) {
  const kws = [];
  for (const sheet of sheets) {
    const kw = getTimesheetKW(sheet);
    const year = getTimesheetYear(sheet);
    if (kw && year) kws.push({ kw, year });
  }
  if (kws.length === 0) return '';
  kws.sort((a, b) => a.year - b.year || a.kw - b.kw);
  const first = kws[0];
  const last = kws[kws.length - 1];
  if (first.kw === last.kw && first.year === last.year) return `KW ${first.kw}/${first.year}`;
  if (first.year === last.year) return `KW ${first.kw}–${last.kw}/${first.year}`;
  return `KW ${first.kw}/${first.year} – ${last.kw}/${last.year}`;
}

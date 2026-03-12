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

export default function TimesheetList({ timesheets, onViewDetail, onDelete, onBulkDelete, personFilter, resolveName, getBaseProject }) {
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

  // Gather unique KWs from timesheets, sorted descending
  const availableKWs = useMemo(() => {
    const kwMap = new Map(); // key: "KW/YYYY" -> { kw, year, ids[] }
    for (const sheet of timesheets) {
      const kw = getTimesheetKW(sheet);
      const year = getTimesheetYear(sheet);
      if (!kw) continue;
      const key = `${kw}/${year}`;
      if (!kwMap.has(key)) kwMap.set(key, { kw, year, ids: [] });
      kwMap.get(key).ids.push(sheet.id);
    }
    return [...kwMap.values()].sort((a, b) => b.year - a.year || b.kw - a.kw);
  }, [timesheets]);

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
            name: `Stundenzettel_${sheet.name || 'Unbekannt'}_${sheet.projekt || 'Projekt'}_${dateRange}.pdf`,
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
    setCollapsedPersons(prev => ({ ...prev, [name]: !prev[name] }));
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

  if (timesheets.length === 0) {
    return (
      <div className="timesheet-list empty-state">
        <div className="empty-icon">📋</div>
        <h2>Keine Einträge</h2>
        <p>Importiere PDFs per Drag & Drop.</p>
      </div>
    );
  }

  // Group by person (using resolved names), then by project within each person
  const byPerson = {};
  for (const sheet of sortedTimesheets) {
    const person = resolve(sheet.name || 'Unbekannt');
    if (!byPerson[person]) byPerson[person] = {};
    const project = getBaseProject ? getBaseProject(sheet.projekt) : (sheet.projekt || 'Sonstiges');
    if (!byPerson[person][project]) byPerson[person][project] = [];
    byPerson[person][project].push(sheet);
  }

  // When sorting by name/kw/projekt, skip re-sorting within groups (already sorted)
  if (sortBy === 'date') {
    for (const person of Object.keys(byPerson)) {
      for (const project of Object.keys(byPerson[person])) {
        byPerson[person][project].sort((a, b) => getFirstDate(a) - getFirstDate(b));
      }
    }
  }

  const personNames = Object.keys(byPerson).sort();
  const showPersonHeaders = personFilter === 'all' && personNames.length > 1;

  return (
    <div className="timesheet-list" role="region" aria-label="Stundenzettel-Liste">
      <div className="list-header">
        <div>
          <h2>Einträge</h2>
          <span className="subtitle">
            {personFilter !== 'all' ? `${personFilter} · ` : ''}
            {sortedTimesheets.length}{sortedTimesheets.length !== timesheets.length ? ` von ${timesheets.length}` : ''} importiert
          </span>
        </div>
        <button className="bulk-delete-btn" onClick={handleBulkDeleteAll} title="Alle Einträge löschen" aria-label="Alle Einträge löschen">
          🗑 Alle löschen
        </button>
      </div>

      {/* Sort Controls */}
      <div className="sort-controls" role="toolbar" aria-label="Sortierung">
        <span className="sort-label">Sortieren:</span>
        <button className={`sort-btn ${sortBy === 'name' ? 'active' : ''}`} onClick={() => handleSort('name')} aria-label={`Sortieren nach Name ${sortBy === 'name' ? (sortDir === 'asc' ? 'aufsteigend' : 'absteigend') : ''}`}>
          Name {sortIcon('name')}
        </button>
        <button className={`sort-btn ${sortBy === 'kw' ? 'active' : ''}`} onClick={() => handleSort('kw')} aria-label={`Sortieren nach Kalenderwoche`}>
          KW {sortIcon('kw')}
        </button>
        <button className={`sort-btn ${sortBy === 'projekt' ? 'active' : ''}`} onClick={() => handleSort('projekt')} aria-label="Sortieren nach Projekt">
          Projekt {sortIcon('projekt')}
        </button>
        <button className={`sort-btn ${sortBy === 'date' ? 'active' : ''}`} onClick={() => handleSort('date')} aria-label="Sortieren nach Datum">
          Datum {sortIcon('date')}
        </button>
        <div className="sort-controls-spacer" />
        {/* Date Range Filter */}
        <div className="date-range-filter">
          <input
            type="date"
            className="date-filter-input"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            title="Von Datum"
            aria-label="Filtern ab Datum"
          />
          <span className="date-filter-sep">–</span>
          <input
            type="date"
            className="date-filter-input"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            title="Bis Datum"
            aria-label="Filtern bis Datum"
          />
          {(dateFrom || dateTo) && (
            <button className="date-filter-clear" onClick={() => { setDateFrom(''); setDateTo(''); }} aria-label="Datumsfilter zurücksetzen" title="Filter zurücksetzen">
              ✕
            </button>
          )}
        </div>
        {availableKWs.length > 0 && (
          <select
            className="kw-quick-select"
            value={kwFilter}
            onChange={e => selectByKW(e.target.value)}
            title="Alle Zettel einer KW auswählen"
            aria-label="Kalenderwoche zum Auswählen"
          >
            <option value="">KW auswählen…</option>
            {availableKWs.map(e => (
              <option key={`${e.kw}/${e.year}`} value={`${e.kw}/${e.year}`}>
                KW {e.kw}/{e.year} ({e.ids.length} Zettel)
              </option>
            ))}
          </select>
        )}
        <button className={`sort-btn select-all-btn ${selectedIds.size > 0 ? 'active' : ''}`} onClick={toggleSelectAll} title="Alle aus-/abwählen" aria-label={`${selectedIds.size === timesheets.length ? 'Alle abwählen' : 'Alle auswählen'}`}>
          {selectedIds.size === timesheets.length ? '☑' : '☐'} Auswählen
        </button>
      </div>

      {/* Selection Action Bar */}
      {selectedIds.size > 0 && (
        <div className="selection-bar">
          <span className="selection-bar-info" role="status">{selectedIds.size} von {timesheets.length} ausgewählt</span>
          <div className="selection-bar-actions">
            <button className="selection-bar-btn export-btn" onClick={handleExportSelectedPDF} disabled={exporting} aria-label="Ausgewählte als PDF exportieren">
              {exporting ? '⏳ Exportiere...' : '📄 Als PDF exportieren'}
            </button>
            <button className="selection-bar-btn clear-btn" onClick={clearSelection} aria-label="Auswahl aufheben">✕ Auswahl aufheben</button>
          </div>
        </div>
      )}

      {/* Single Delete Confirmation */}
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

      {/* Bulk Delete Confirmation */}
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
        const projects = byPerson[person];
        const projectNames = Object.keys(projects).sort();
        const isCollapsed = collapsedPersons[person];
        const sheetCount = Object.values(projects).reduce((sum, arr) => sum + arr.length, 0);
        const totalHours = Object.values(projects).flat().reduce((sum, s) => sum + getSheetHours(s), 0);

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
                    <span className="person-group-stat">{sheetCount} Zettel</span>
                    <span className="person-group-stat">{totalHours.toFixed(2)} Std.</span>
                  </div>
                </button>
                <button className="person-delete-btn" onClick={() => handleBulkDeletePerson(person)} title={`Alle Zettel von ${person} löschen`}>
                  🗑
                </button>
              </div>
            )}

            {!isCollapsed && projectNames.map(project => (
              <div key={project} className="project-group">
                <h3 className="project-title">{project}</h3>
                <div className="sheets-grid">
                  {projects[project].map(sheet => (
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
              </div>
            ))}
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

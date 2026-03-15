import React, { useState, useCallback, useMemo } from 'react';
import { getKW } from '../utils/calendarWeek';
import { isHoliday, parseTime } from '../utils/holidays';
import { generateTimesheetHTML } from '../utils/pdfExport';
import { generateId } from '../utils/helpers';

const DAY_NAMES = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

// Get Monday of the week containing a given date
function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d;
}

function formatDateDE(date) {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

function calcHours(start, ende, pause) {
  const s = parseTime(start);
  const e = parseTime(ende);
  if (s === null || e === null) return 0;
  let diff = e - s;
  if (diff < 0) diff += 24; // overnight
  diff -= pause || 0;
  return Math.max(0, Math.round(diff * 100) / 100);
}

// Calculate hours in the overlap between two intervals
function overlapHours(aStart, aEnd, bStart, bEnd) {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

// Calculate night hours (22:00–06:00) for a given work period
function calcNightHours(startStr, endeStr) {
  const start = parseTime(startStr);
  const end = parseTime(endeStr);
  if (start === null || end === null) return 0;

  let adjustedEnd = end;
  if (adjustedEnd <= start) adjustedEnd += 24; // overnight

  let nightHours = 0;
  // Night period before 06:00 (applies if work starts before 06:00)
  nightHours += overlapHours(start, adjustedEnd, 0, 6);
  // Night period after 22:00 (through to 30 = 06:00 next day)
  nightHours += overlapHours(start, adjustedEnd, 22, 30);

  return Math.round(nightHours * 100) / 100;
}

// Auto-calculate overtime and night hours based on TV-FFS rules
function calcDayDetails(startStr, endeStr, pause, datum) {
  const totalHours = calcHours(startStr, endeStr, pause);
  // TV-FFS: 10h base, 11th hour = 25%, 12th+ = 50%
  const ueberstunden25 = Math.round(Math.max(0, Math.min(totalHours - 10, 1)) * 100) / 100;
  const ueberstunden50 = Math.round(Math.max(0, totalHours - 11) * 100) / 100;
  // Night hours (22:00–06:00), not reduced by pause
  const nacht25 = calcNightHours(startStr, endeStr);
  // Ü100% stays manual (holiday detection is handled by tvffsCalculator)
  return { stundenTotal: totalHours, ueberstunden25, ueberstunden50, nacht25 };
}

const emptyDay = (tag, datum) => ({
  tag,
  datum: datum || '',
  start: '',
  ende: '',
  pause: 0,
  stundenTotal: 0,
  ueberstunden25: 0,
  ueberstunden50: 0,
  ueberstunden100: 0,
  nacht25: 0,
  fahrzeit: 0,
  anmerkungen: '',
});

export default function TimesheetCreate({ onSave, onSaveBatch, onCancel, editSheet, existingTimesheets, crews, projects, onCreateNext }) {
  const isEditing = !!editSheet;

  // Project selection
  const [selectedProject, setSelectedProject] = useState('');

  // Batch mode (crew selection)
  const [selectedCrew, setSelectedCrew] = useState('');
  const [batchMode, setBatchMode] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState(new Set());

  // Header fields
  const [projekt, setProjekt] = useState(editSheet?.projekt || '');
  const [projektnummer, setProjektnummer] = useState(editSheet?.projektnummer || '');
  const [produktionsfirma, setProduktionsfirma] = useState(editSheet?.produktionsfirma || '');
  const [name, setName] = useState(editSheet?.name || '');
  const [position, setPosition] = useState(editSheet?.position || '');
  const [abteilung, setAbteilung] = useState(editSheet?.abteilung || '');
  const [defaultPause, setDefaultPause] = useState(editSheet?.pause || 0.75);

  // Week start date (ISO format for input)
  const [weekStart, setWeekStart] = useState(() => {
    if (editSheet && editSheet.days.length > 0) {
      const firstDate = editSheet.days.find(d => d.datum);
      if (firstDate) {
        const [dd, mm, yyyy] = firstDate.datum.split('.');
        return `${yyyy}-${mm}-${dd}`;
      }
    }
    // Default: current week's Monday
    const mon = getMonday(new Date());
    return mon.toISOString().split('T')[0];
  });

  // Days data
  const [days, setDays] = useState(() => {
    if (editSheet) {
      return editSheet.days.map(d => ({ ...d }));
    }
    const mon = getMonday(new Date());
    return DAY_NAMES.map((tag, i) => {
      const date = new Date(mon);
      date.setDate(date.getDate() + i);
      return emptyDay(tag, formatDateDE(date));
    });
  });

  // Extract unique values from existing timesheets for autocomplete suggestions
  const suggestions = useMemo(() => {
    if (!existingTimesheets || existingTimesheets.length === 0) return {};
    return {
      projekte: [...new Set(existingTimesheets.map(t => t.projekt).filter(Boolean))],
      firmen: [...new Set(existingTimesheets.map(t => t.produktionsfirma).filter(Boolean))],
      namen: [...new Set(existingTimesheets.map(t => t.name).filter(Boolean))],
      positionen: [...new Set(existingTimesheets.map(t => t.position).filter(Boolean))],
      abteilungen: [...new Set(existingTimesheets.map(t => t.abteilung).filter(Boolean))],
    };
  }, [existingTimesheets]);

  // When week start changes, recalculate dates for all days
  const handleWeekStartChange = useCallback((isoDate) => {
    setWeekStart(isoDate);
    const mon = getMonday(new Date(isoDate + 'T12:00:00'));
    setDays(prev => prev.map((day, i) => {
      const date = new Date(mon);
      date.setDate(date.getDate() + i);
      return { ...day, datum: formatDateDE(date) };
    }));
  }, []);

  // Update a day field
  const updateDay = useCallback((idx, field, value) => {
    setDays(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };

      // Auto-calculate when start/end/pause change
      if (field === 'start' || field === 'ende' || field === 'pause') {
        const d = updated[idx];
        const startVal = field === 'start' ? value : d.start;
        const endeVal = field === 'ende' ? value : d.ende;
        let pauseVal = field === 'pause' ? (parseFloat(value) || 0) : d.pause;

        // Auto-fill pause to 0.75 when a time is entered and pause is still 0
        if ((field === 'start' || field === 'ende') && startVal && endeVal && pauseVal === 0) {
          pauseVal = 0.75;
          updated[idx].pause = 0.75;
        }

        // Auto-calculate all fields from times
        if (startVal && endeVal) {
          const details = calcDayDetails(startVal, endeVal, pauseVal, d.datum);
          updated[idx].stundenTotal = details.stundenTotal;
          updated[idx].ueberstunden25 = details.ueberstunden25;
          updated[idx].ueberstunden50 = details.ueberstunden50;
          updated[idx].nacht25 = details.nacht25;

          // Auto-fill Drehtag in anmerkungen if project has drehStartDatum
          const proj = selectedProject && projects ? projects[selectedProject] : null;
          if (proj && proj.drehStartDatum && d.datum) {
            const [dd, mm, yyyy] = d.datum.split('.');
            if (dd && mm && yyyy) {
              const dayDate = new Date(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd));
              const startDate = new Date(proj.drehStartDatum + 'T00:00:00');
              if (!isNaN(dayDate.getTime()) && !isNaN(startDate.getTime()) && dayDate >= startDate) {
                const diffDays = Math.round((dayDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
                const dtLabel = `DT ${diffDays}`;
                const existing = updated[idx].anmerkungen || '';
                if (!existing) {
                  updated[idx].anmerkungen = dtLabel;
                } else if (/^DT \d+/.test(existing)) {
                  updated[idx].anmerkungen = existing.replace(/^DT \d+/, dtLabel);
                }
              }
            }
          }
        } else {
          updated[idx].stundenTotal = 0;
        }
      }

      return updated;
    });
  }, [selectedProject, projects]);

  // Apply default pause to all days and recalculate
  const applyDefaultPause = useCallback(() => {
    setDays(prev => prev.map(d => {
      const updated = { ...d, pause: defaultPause };
      if (d.start && d.ende) {
        const details = calcDayDetails(d.start, d.ende, defaultPause, d.datum);
        Object.assign(updated, details);
      }
      return updated;
    }));
  }, [defaultPause]);

  // Calculate KW from weekStart
  const currentKW = useMemo(() => {
    if (!weekStart) return null;
    const d = new Date(weekStart + 'T12:00:00');
    return getKW(d);
  }, [weekStart]);

  const currentYear = weekStart ? new Date(weekStart + 'T12:00:00').getFullYear() : new Date().getFullYear();

  // Calculate totals
  const totals = useMemo(() => {
    return {
      stundenTotal: Math.round(days.reduce((s, d) => s + (d.stundenTotal || 0), 0) * 100) / 100,
      ueberstunden25: Math.round(days.reduce((s, d) => s + (d.ueberstunden25 || 0), 0) * 100) / 100,
      ueberstunden50: Math.round(days.reduce((s, d) => s + (d.ueberstunden50 || 0), 0) * 100) / 100,
      ueberstunden100: Math.round(days.reduce((s, d) => s + (d.ueberstunden100 || 0), 0) * 100) / 100,
      nacht25: Math.round(days.reduce((s, d) => s + (d.nacht25 || 0), 0) * 100) / 100,
      fahrzeit: Math.round(days.reduce((s, d) => s + (d.fahrzeit || 0), 0) * 100) / 100,
    };
  }, [days]);

  // Validation state
  const [validationErrors, setValidationErrors] = useState([]);

  // Copy from previous week
  const handleCopyFromPrev = useCallback(() => {
    if (!existingTimesheets || existingTimesheets.length === 0) return;
    // Find sheets for the same person from the previous week
    const mon = getMonday(new Date(weekStart + 'T12:00:00'));
    const prevMon = new Date(mon);
    prevMon.setDate(prevMon.getDate() - 7);
    const prevMonStr = formatDateDE(prevMon);
    
    const prevSheet = existingTimesheets.find(t => {
      if (name && t.name !== name) return false;
      return t.days && t.days.length > 0 && t.days[0].datum === prevMonStr;
    }) || existingTimesheets.find(t => {
      return t.days && t.days.length > 0 && t.days[0].datum === prevMonStr;
    });
    
    if (prevSheet) {
      // Copy times, but update dates to current week
      setDays(prev => prev.map((day, i) => {
        const prevDay = prevSheet.days[i];
        if (!prevDay) return day;
        const updated = {
          ...day,
          start: prevDay.start || '',
          ende: prevDay.ende || '',
          pause: prevDay.pause || 0,
          fahrzeit: prevDay.fahrzeit || 0,
        };
        if (updated.start && updated.ende) {
          const details = calcDayDetails(updated.start, updated.ende, updated.pause, day.datum);
          Object.assign(updated, details);
        }
        return updated;
      }));
      // Copy project info if empty
      if (!projekt && prevSheet.projekt) setProjekt(prevSheet.projekt);
      if (!projektnummer && prevSheet.projektnummer) setProjektnummer(prevSheet.projektnummer);
      if (!produktionsfirma && prevSheet.produktionsfirma) setProduktionsfirma(prevSheet.produktionsfirma);
      if (!name && prevSheet.name) setName(prevSheet.name);
      if (!position && prevSheet.position) setPosition(prevSheet.position);
      if (!abteilung && prevSheet.abteilung) setAbteilung(prevSheet.abteilung);
    } else {
      alert('Kein Stundenzettel von der Vorwoche gefunden.');
    }
  }, [existingTimesheets, weekStart, name, projekt, projektnummer, produktionsfirma, position, abteilung]);

  // Handle project selection — auto-fill fields and optionally select crew
  const handleProjectSelect = useCallback((projectName) => {
    setSelectedProject(projectName);
    if (!projectName || !projects || !projects[projectName]) return;
    const proj = projects[projectName];
    setProjekt(projectName);
    if (proj.projektnummer) setProjektnummer(proj.projektnummer);
    if (proj.produktionsfirma) setProduktionsfirma(proj.produktionsfirma);
    // If project has a crew, auto-select it
    if (proj.crew && crews && crews[proj.crew]) {
      setBatchMode(true);
      setSelectedCrew(proj.crew);
      setSelectedMembers(new Set((crews[proj.crew].members || []).map((_, i) => i)));
    }
  }, [projects, crews]);

  // Calculate Drehtag number for a given date based on project's drehStartDatum
  // Counts all days with work entries from existing timesheets for this project
  // that come before the given date, plus 1
  const calcDrehtag = useCallback((datum, drehStartDatum) => {
    if (!datum || !drehStartDatum) return null;
    // Parse datum (DD.MM.YYYY) to Date
    const [dd, mm, yyyy] = datum.split('.');
    if (!dd || !mm || !yyyy) return null;
    const dayDate = new Date(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd));
    const startDate = new Date(drehStartDatum + 'T00:00:00');
    if (isNaN(dayDate.getTime()) || isNaN(startDate.getTime())) return null;
    if (dayDate < startDate) return null;
    
    // Count calendar days from start (inclusive) to this date (inclusive)
    // Every day from start date to this date counts as a Drehtag
    const diffMs = dayDate.getTime() - startDate.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    return diffDays + 1; // 1-based
  }, []);

  // Auto-fill Drehtag in Anmerkungen when project has drehStartDatum
  const handleAutoFillDrehtag = useCallback(() => {
    const proj = selectedProject && projects ? projects[selectedProject] : null;
    if (!proj || !proj.drehStartDatum) return;
    
    setDays(prev => prev.map(day => {
      // Only fill for days that have work (start time entered)
      if (!day.start && !day.ende) return day;
      const dt = calcDrehtag(day.datum, proj.drehStartDatum);
      if (dt === null) return day;
      const dtLabel = `DT ${dt}`;
      // Don't overwrite existing anmerkungen unless they already contain a DT tag
      const existing = day.anmerkungen || '';
      if (existing && !/^DT \d+/.test(existing)) {
        return { ...day, anmerkungen: `${dtLabel} – ${existing}` };
      }
      return { ...day, anmerkungen: existing.replace(/^DT \d+/, dtLabel) || dtLabel };
    }));
  }, [selectedProject, projects, calcDrehtag]);

  // Save handler
  const handleSave = useCallback(() => {
    // Form validation
    const errors = [];
    if (!batchMode && !name.trim()) errors.push('Name ist erforderlich.');
    if (!projekt.trim()) errors.push('Projekt ist erforderlich.');
    const hasWorkDays = days.some(d => d.stundenTotal > 0 || d.start);
    if (!hasWorkDays) errors.push('Mindestens ein Tag muss Arbeitszeiten enthalten.');
    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }
    setValidationErrors([]);

    if (batchMode && selectedCrew && crews && crews[selectedCrew]) {
      // Batch: create one sheet per selected crew member
      const allMembers = crews[selectedCrew].members || [];
      const crewMembers = allMembers.filter((_, i) => selectedMembers.has(i));
      if (crewMembers.length === 0) return;
      const sheets = crewMembers.map(member => ({
        id: generateId(),
        importDate: new Date().toISOString(),
        createdManually: true,
        filePath: '',
        projekt,
        projektnummer,
        produktionsfirma,
        name: member.name,
        position: member.position || position,
        abteilung: member.abteilung || abteilung,
        pause: defaultPause,
        days: days.map(d => ({ ...d })),
        totals,
      }));
      if (onSaveBatch) {
        onSaveBatch(sheets);
      }
    } else {
      const sheet = {
        id: editSheet?.id || generateId(),
        importDate: editSheet?.importDate || new Date().toISOString(),
        createdManually: true,
        filePath: '',
        projekt,
        projektnummer,
        produktionsfirma,
        name,
        position,
        abteilung,
        pause: defaultPause,
        days,
        totals,
      };
      onSave(sheet);
    }
  }, [editSheet, projekt, projektnummer, produktionsfirma, name, position, abteilung, defaultPause, days, totals, onSave, onSaveBatch, batchMode, selectedCrew, selectedMembers, crews]);

  // Export as PDF
  const handleExportPDF = useCallback(async () => {
    const htmlContent = generateTimesheetHTML({
      projekt, projektnummer, produktionsfirma, name, position, abteilung,
      pause: defaultPause, days, totals
    });
    const defaultName = `Stundenzettel_${name || 'Unbekannt'}_${projekt || 'Projekt'}_${weekStart}.pdf`;
    try {
      const result = await window.electronAPI.exportTimesheetPDF(htmlContent, defaultName);
      if (result && result.success) {
        // Could show a success toast
      }
    } catch (err) {
      console.error('PDF export failed:', err);
    }
  }, [projekt, projektnummer, produktionsfirma, name, position, abteilung, defaultPause, days, totals, weekStart]);

  return (
    <div className="timesheet-create">
      <div className="create-header">
        <div className="create-header-left">
          <h2>{isEditing ? 'Stundenzettel bearbeiten' : 'Neuen Stundenzettel erstellen'}</h2>
          {currentKW && (
            <span className="create-kw-badge">KW {currentKW}/{currentYear}</span>
          )}
        </div>
        <div className="create-header-actions">
          <button className="export-pdf-btn" onClick={handleExportPDF} title="Als PDF exportieren">
            <span>📄</span> PDF Export
          </button>
        </div>
      </div>

      {/* Project Selector (only when not editing and projects exist) */}
      {!isEditing && projects && Object.keys(projects).length > 0 && (
        <div className="create-section project-select-section">
          <div className="project-select-row">
            <label className="project-select-label">🎬 Projekt auswählen</label>
            <select
              className="project-select-dropdown"
              value={selectedProject}
              onChange={e => handleProjectSelect(e.target.value)}
            >
              <option value="">Kein Projekt (manuell ausfüllen)</option>
              {Object.entries(projects).map(([pName, proj]) => (
                <option key={pName} value={pName}>
                  {pName}{proj.produktionsfirma ? ` – ${proj.produktionsfirma}` : ''}
                </option>
              ))}
            </select>
          </div>
          {selectedProject && projects[selectedProject]?.drehStartDatum && (
            <div className="project-drehtag-hint">
              <span>📅 Erster Drehtag: {new Date(projects[selectedProject].drehStartDatum + 'T12:00:00').toLocaleDateString('de-DE')}</span>
              <button className="drehtag-fill-btn" onClick={handleAutoFillDrehtag} title="Drehtag automatisch in Anmerkungen eintragen">
                Drehtag eintragen
              </button>
            </div>
          )}
        </div>
      )}

      {/* Crew Mode Toggle (only when not editing) */}
      {!isEditing && crews && Object.keys(crews).length > 0 && (
        <div className="create-section crew-mode-section">
          <div className="crew-mode-toggle">
            <label className="crew-toggle-label">
              <input
                type="checkbox"
                checked={batchMode}
                onChange={e => { setBatchMode(e.target.checked); if (!e.target.checked) setSelectedCrew(''); }}
              />
              <span className="crew-toggle-text">Für ganze Crew erstellen</span>
            </label>
            {batchMode && (
              <select
                className="crew-select"
                value={selectedCrew}
                onChange={e => {
                  setSelectedCrew(e.target.value);
                  // Select all members by default
                  const crew = crews[e.target.value];
                  if (crew) {
                    setSelectedMembers(new Set((crew.members || []).map((_, i) => i)));
                  } else {
                    setSelectedMembers(new Set());
                  }
                }}
              >
                <option value="">Crew auswählen...</option>
                {Object.entries(crews).map(([crewName, crew]) => (
                  <option key={crewName} value={crewName}>
                    {crewName} ({(crew.members || []).length} Personen)
                  </option>
                ))}
              </select>
            )}
          </div>
          {batchMode && selectedCrew && crews[selectedCrew] && (
            <div className="crew-preview">
              <div className="crew-preview-header">
                <span className="crew-preview-label">Zettel werden erstellt für ({selectedMembers.size}/{(crews[selectedCrew].members || []).length}):</span>
                <button
                  className="crew-toggle-all-btn"
                  onClick={() => {
                    const members = crews[selectedCrew].members || [];
                    if (selectedMembers.size === members.length) {
                      setSelectedMembers(new Set());
                    } else {
                      setSelectedMembers(new Set(members.map((_, i) => i)));
                    }
                  }}
                >
                  {selectedMembers.size === (crews[selectedCrew].members || []).length ? 'Alle abwählen' : 'Alle auswählen'}
                </button>
              </div>
              <div className="crew-preview-members">
                {(crews[selectedCrew].members || []).map((m, i) => (
                  <label
                    key={i}
                    className={`crew-preview-chip selectable ${selectedMembers.has(i) ? 'selected' : 'deselected'}`}
                    title={selectedMembers.has(i) ? 'Klicken zum Abwählen' : 'Klicken zum Auswählen'}
                  >
                    <input
                      type="checkbox"
                      checked={selectedMembers.has(i)}
                      onChange={() => {
                        setSelectedMembers(prev => {
                          const next = new Set(prev);
                          if (next.has(i)) next.delete(i); else next.add(i);
                          return next;
                        });
                      }}
                    />
                    {m.name}{m.position ? ` (${m.position})` : ''}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Header Fields */}
      <div className="create-section">
        <h3>Projektinformationen</h3>
        <div className="create-fields-grid">
          <div className="create-field">
            <label>Projekt</label>
            <input
              type="text"
              value={projekt}
              onChange={e => setProjekt(e.target.value)}
              placeholder="Projektname"
              list="suggest-projekte"
            />
            {suggestions.projekte && (
              <datalist id="suggest-projekte">
                {suggestions.projekte.map(p => <option key={p} value={p} />)}
              </datalist>
            )}
          </div>
          <div className="create-field">
            <label>Projektnummer</label>
            <input
              type="text"
              value={projektnummer}
              onChange={e => setProjektnummer(e.target.value)}
              placeholder="z.B. 12345"
            />
          </div>
          <div className="create-field">
            <label>Produktionsfirma</label>
            <input
              type="text"
              value={produktionsfirma}
              onChange={e => setProduktionsfirma(e.target.value)}
              placeholder="Firma"
              list="suggest-firmen"
            />
            {suggestions.firmen && (
              <datalist id="suggest-firmen">
                {suggestions.firmen.map(f => <option key={f} value={f} />)}
              </datalist>
            )}
          </div>
        </div>
      </div>

      {/* Personal Data - hidden in batch mode */}
      {!batchMode && (
      <div className="create-section">
        <h3>Persönliche Daten</h3>
        <div className="create-fields-grid">
          <div className="create-field">
            <label>Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Vor- und Nachname"
              list="suggest-namen"
            />
            {suggestions.namen && (
              <datalist id="suggest-namen">
                {suggestions.namen.map(n => <option key={n} value={n} />)}
              </datalist>
            )}
          </div>
          <div className="create-field">
            <label>Position</label>
            <input
              type="text"
              value={position}
              onChange={e => setPosition(e.target.value)}
              placeholder="z.B. Kameraassistent"
              list="suggest-positionen"
            />
            {suggestions.positionen && (
              <datalist id="suggest-positionen">
                {suggestions.positionen.map(p => <option key={p} value={p} />)}
              </datalist>
            )}
          </div>
          <div className="create-field">
            <label>Abteilung</label>
            <input
              type="text"
              value={abteilung}
              onChange={e => setAbteilung(e.target.value)}
              placeholder="z.B. Kamera"
              list="suggest-abteilungen"
            />
            {suggestions.abteilungen && (
              <datalist id="suggest-abteilungen">
                {suggestions.abteilungen.map(a => <option key={a} value={a} />)}
              </datalist>
            )}
          </div>
        </div>
      </div>
      )}

      {/* Week selector & default pause */}
      <div className="create-section">
        <h3>Woche & Standardpause {currentKW && <span className="section-kw-tag">KW {currentKW}</span>}</h3>
        <div className="create-fields-grid">
          <div className="create-field">
            <label>Wochenbeginn (Montag)</label>
            <input
              type="date"
              value={weekStart}
              onChange={e => handleWeekStartChange(e.target.value)}
            />
          </div>
          <div className="create-field">
            <label>Standardpause (Std.)</label>
            <div className="pause-input-row">
              <input
                type="number"
                value={defaultPause}
                onChange={e => setDefaultPause(parseFloat(e.target.value) || 0)}
                step="0.25"
                min="0"
                max="4"
              />
              <button className="apply-pause-btn" onClick={applyDefaultPause}>
                Auf alle anwenden
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Days Table */}
      <div className="create-section">
        <h3>Tageseinträge</h3>
        <div className="table-wrapper">
          <table className="create-table">
            <thead>
              <tr>
                <th>Tag</th>
                <th>Datum</th>
                <th>Start</th>
                <th>Ende</th>
                <th>Pause</th>
                <th>Stunden</th>
                <th>Ü 25%</th>
                <th>Ü 50%</th>
                <th>Ü 100%</th>
                <th>Nacht</th>
                <th>Fahrzeit</th>
                <th>Anmerkungen</th>
              </tr>
            </thead>
            <tbody>
              {days.map((day, idx) => {
                const dayIsHoliday = day.datum ? isHoliday(day.datum) : false;
                return (
                <tr key={idx} className={`${day.start || day.ende ? 'row-active' : ''} ${dayIsHoliday ? 'row-holiday' : ''} ${idx >= 5 ? 'row-weekend' : ''}`}>
                  <td className="col-tag">
                    {day.tag}
                    {dayIsHoliday && <span className="holiday-badge" title="Feiertag">🎄</span>}
                  </td>
                  <td className="col-datum">{day.datum || '—'}</td>
                  <td>
                    <input
                      type="time"
                      value={day.start}
                      onChange={e => updateDay(idx, 'start', e.target.value)}
                      className="table-input time-input"
                    />
                  </td>
                  <td>
                    <input
                      type="time"
                      value={day.ende}
                      onChange={e => updateDay(idx, 'ende', e.target.value)}
                      className="table-input time-input"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={day.pause || ''}
                      onChange={e => updateDay(idx, 'pause', parseFloat(e.target.value) || 0)}
                      className="table-input num-input"
                      step="0.25"
                      min="0"
                      placeholder="0"
                    />
                  </td>
                  <td className="col-hours computed">
                    {day.stundenTotal || '—'}
                  </td>
                  <td>
                    <input
                      type="number"
                      value={day.ueberstunden25 || ''}
                      onChange={e => updateDay(idx, 'ueberstunden25', parseFloat(e.target.value) || 0)}
                      className="table-input num-input"
                      step="0.25"
                      min="0"
                      placeholder="0"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={day.ueberstunden50 || ''}
                      onChange={e => updateDay(idx, 'ueberstunden50', parseFloat(e.target.value) || 0)}
                      className="table-input num-input"
                      step="0.25"
                      min="0"
                      placeholder="0"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={day.ueberstunden100 || ''}
                      onChange={e => updateDay(idx, 'ueberstunden100', parseFloat(e.target.value) || 0)}
                      className="table-input num-input"
                      step="0.25"
                      min="0"
                      placeholder="0"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={day.nacht25 || ''}
                      onChange={e => updateDay(idx, 'nacht25', parseFloat(e.target.value) || 0)}
                      className="table-input num-input"
                      step="0.25"
                      min="0"
                      placeholder="0"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={day.fahrzeit || ''}
                      onChange={e => updateDay(idx, 'fahrzeit', parseFloat(e.target.value) || 0)}
                      className="table-input num-input"
                      step="0.25"
                      min="0"
                      placeholder="0"
                    />
                  </td>
                  <td>
                    <textarea
                      value={day.anmerkungen || ''}
                      onChange={e => updateDay(idx, 'anmerkungen', e.target.value)}
                      className="table-input text-input anmerkungen-textarea"
                      placeholder="—"
                      rows="1"
                    />
                  </td>
                </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="totals-row">
                <td colSpan="5"><strong>Summe</strong></td>
                <td className="col-hours"><strong>{totals.stundenTotal}</strong></td>
                <td><strong>{totals.ueberstunden25 || '—'}</strong></td>
                <td><strong>{totals.ueberstunden50 || '—'}</strong></td>
                <td><strong>{totals.ueberstunden100 || '—'}</strong></td>
                <td><strong>{totals.nacht25 || '—'}</strong></td>
                <td><strong>{totals.fahrzeit || '—'}</strong></td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Validation Errors */}
      {validationErrors.length > 0 && (
        <div className="validation-errors">
          {validationErrors.map((err, i) => (
            <div key={i} className="validation-error">⚠ {err}</div>
          ))}
        </div>
      )}

      {/* Action Buttons */}
      <div className="create-actions">
        <button className="cancel-btn" onClick={onCancel}>Abbrechen</button>
        {!isEditing && existingTimesheets && existingTimesheets.length > 0 && (
          <button className="copy-prev-btn" onClick={handleCopyFromPrev} title="Zeiten von der Vorwoche übernehmen">
            📋 Von Vorwoche kopieren
          </button>
        )}
        <button className="save-btn" onClick={handleSave}>
          {isEditing ? 'Änderungen speichern' 
            : batchMode && selectedCrew && crews[selectedCrew]
              ? `${selectedMembers.size} Stundenzettel erstellen`
              : 'Stundenzettel speichern'}
        </button>
        {!isEditing && onCreateNext && (
          <button className="save-next-btn" onClick={() => {
            handleSave();
            // After saving, trigger next week creation
            if (validationErrors.length === 0 && (name.trim() || batchMode) && projekt.trim()) {
              const mon = getMonday(new Date(weekStart + 'T12:00:00'));
              mon.setDate(mon.getDate() + 7);
              const nextWeekISO = mon.toISOString().split('T')[0];
              onCreateNext(nextWeekISO);
            }
          }}>
            Speichern & nächste Woche →
          </button>
        )}
      </div>
    </div>
  );
}

import React, { useState, useCallback, useMemo } from 'react';

function fmtNum(v, digits = 2) {
  return typeof v === 'number' ? v.toFixed(digits).replace('.', ',') : '–';
}
function genId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/* ── Icons ─────────────────────────────────────────────────── */
function Ico({ children, size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}
const IconPDF      = () => <Ico><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="15" x2="15" y2="15"/></Ico>;
const IconTrash    = () => <Ico><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></Ico>;
const IconCheck    = () => <Ico><polyline points="20 6 9 17 4 12"/></Ico>;
const IconX        = () => <Ico><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></Ico>;
const IconAlert    = () => <Ico><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></Ico>;
const IconChevron  = () => <Ico><polyline points="6 9 12 15 18 9"/></Ico>;

/* ── Styles ─────────────────────────────────────────────────── */
const s = {
  wrap:        { padding: '28px 32px', maxWidth: 960, margin: '0 auto' },
  header:      { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 },
  title:       { fontSize: 22, fontWeight: 700, color: 'var(--ink)', margin: 0 },
  controls:    { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 20, justifyContent: 'space-between' },
  section:     { background: 'var(--card)', borderRadius: 12, border: '1px solid var(--border)', marginBottom: 12, overflow: 'hidden' },
  sectionHead: { padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' },
  table:       { width: '100%', borderCollapse: 'collapse' },
  th:          { padding: '9px 14px', fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'left', borderBottom: '1px solid var(--border)', background: 'var(--surface)' },
  thR:         { padding: '9px 14px', fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'right', borderBottom: '1px solid var(--border)', background: 'var(--surface)' },
  td:          { padding: '10px 14px', fontSize: 13, color: 'var(--text)', borderBottom: '1px solid var(--border)' },
  tdR:         { padding: '10px 14px', fontSize: 13, color: 'var(--text)', textAlign: 'right', borderBottom: '1px solid var(--border)', fontVariantNumeric: 'tabular-nums' },
  btn:         { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500 },
  btnPrimary:  { background: 'var(--p-500)', color: '#fff' },
  btnGhost:    { background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' },
  btnDanger:   { background: 'var(--r-50)', color: 'var(--r-600)', border: '1px solid var(--r-500)' },
  emptyState:  { padding: '60px 20px', textAlign: 'center', color: 'var(--hint)' },
  overlay:     { position: 'fixed', inset: 0, background: 'rgba(10,14,26,.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modal:       { background: 'var(--card)', borderRadius: 16, padding: 28, width: '100%', maxWidth: 360, boxShadow: 'var(--shadow-lg)' },
  badge:       (color) => ({ fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 99, border: `1px solid var(--${color}-500)`, color: `var(--${color}-600)`, background: `var(--${color}-50)` }),
};

/* ── Helpers ────────────────────────────────────────────────── */
function timeToH(t) {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return h + m / 60;
}
function hoursMatch(sesamH, appH) {
  if (appH == null) return null;
  return Math.abs(sesamH - appH) <= 0.25;
}

/**
 * Normalize a German date string to "DD.MM.YYYY".
 * Handles: "8.5.2026", "08.5.26", "8.5.26", "08.05.2026", etc.
 * Returns null if the input can't be parsed.
 */
function normalizeDatum(d) {
  if (!d) return null;
  const m = d.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (!m) return null;
  const day  = m[1].padStart(2, '0');
  const mon  = m[2].padStart(2, '0');
  let   year = m[3];
  if (year.length === 2) year = (parseInt(year, 10) >= 70 ? '19' : '20') + year;
  return `${day}.${mon}.${year}`;
}

/* ── Main Component ─────────────────────────────────────────── */
export default function SesamAbgleich({
  timesheets = [],
  sesamSheets = [],
  onSesamSheetsChange,
  resolveName,
  getBaseProject,
  completedProjects = {},
  onToggleProjectComplete,
}) {
  const [isDragOver, setIsDragOver]   = useState(false);
  const [importing, setImporting]     = useState(false);
  const [msg, setMsg]                 = useState(null);
  const [expanded, setExpanded]       = useState(null);
  const [deleteId, setDeleteId]       = useState(null);
  const [ocrState, setOcrState]       = useState({}); // sheetId → 'running'|'ok'|'error:<msg>'
  const [ocrDragOver, setOcrDragOver] = useState(null); // sheetId that has drag-over
  const dragCounter = React.useRef(0);
  const ocrDragCounters = React.useRef({});

  // Collapsed project groups (local — completed projects start collapsed)
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set(
    Object.entries(completedProjects).filter(([, v]) => v).map(([k]) => k)
  ));

  const toggleGroup = useCallback((key) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  // Filter + sort state
  const [filterProjekt, setFilterProjekt] = useState('all');
  const [filterPerson,  setFilterPerson]  = useState('all');
  const [filterStatus,  setFilterStatus]  = useState('all');
  const [sortBy,        setSortBy]        = useState('date-desc');

  const resolve = resolveName   || (n => n);
  const baseP   = getBaseProject || (p => p || 'Sonstiges');

  /* Find matching app-timesheet day by date + name */
  function findAppDay(sheet, day) {
    if (!day.datum) return null;
    const normDay = normalizeDatum(day.datum);
    // Split the Sesam name into words (length > 2) and check if ANY word
    // appears in the app timesheet name — handles "Till Pallapies" vs "Pallapies"
    const sheetWords = sheet.name
      ? sheet.name.toLowerCase().split(/\s+/).filter(w => w.length > 2)
      : [];
    for (const ts of timesheets) {
      const tsName = resolve(ts.name || 'Unbekannt').toLowerCase();
      if (sheetWords.length > 0 && !sheetWords.some(w => tsName.includes(w))) continue;
      const found = (ts.days || []).find(d => {
        const normD = normalizeDatum(d.datum);
        return normD && normDay && normD === normDay;
      });
      if (found) return found;
    }
    return null;
  }

  /* ── Filter / sort options ───────────────────────────────── */
  const allProjekte = useMemo(() => {
    const seen = new Set();
    sesamSheets.forEach(s => { const p = s.projekt || s.produktion || ''; if (p) seen.add(p); });
    return [...seen].sort();
  }, [sesamSheets]);

  const allPersonen = useMemo(() => {
    const seen = new Set();
    sesamSheets.forEach(s => { const n = s.name || ''; if (n) seen.add(n); });
    return [...seen].sort();
  }, [sesamSheets]);

  function sheetFirstDate(sheet) {
    const d = sheet.days?.[0]?.datum;
    if (!d) return sheet.importedAt || '';
    const [dd, mm, yyyy] = d.split('.');
    return `${yyyy || '0000'}-${mm || '00'}-${dd || '00'}`;
  }

  function sheetStatus(sheet) {
    if (sheet._allGrafisch) return 'grafisch';
    const missing = sheet.days.filter(sd => sd.datum && !findAppDay(sheet, sd)).length;
    const wrong = (sheet.type !== 'arbeitszeiterfassung') ? sheet.days.filter(sd => {
      const ad = findAppDay(sheet, sd);
      return ad && hoursMatch(sd.arbeitszeit, ad.stundenTotal ?? null) === false;
    }).length : 0;
    return (missing + wrong) > 0 ? 'abweichung' : 'ok';
  }

  const visibleSheets = useMemo(() => {
    let list = [...sesamSheets];

    if (filterProjekt !== 'all')
      list = list.filter(s => (s.projekt || s.produktion || '') === filterProjekt);
    if (filterPerson !== 'all')
      list = list.filter(s => (s.name || '') === filterPerson);
    if (filterStatus !== 'all')
      list = list.filter(s => sheetStatus(s) === filterStatus);

    list.sort((a, b) => {
      if (sortBy === 'date-desc') return sheetFirstDate(b).localeCompare(sheetFirstDate(a));
      if (sortBy === 'date-asc')  return sheetFirstDate(a).localeCompare(sheetFirstDate(b));
      if (sortBy === 'projekt')   return (a.projekt || a.produktion || '').localeCompare(b.projekt || b.produktion || '');
      if (sortBy === 'name')      return (a.name || '').localeCompare(b.name || '');
      return 0;
    });
    return list;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sesamSheets, filterProjekt, filterPerson, filterStatus, sortBy]);

  /* Group visibleSheets by project for the grouped view */
  const groupedByProject = useMemo(() => {
    const map = new Map();
    for (const sheet of visibleSheets) {
      const key = sheet.projekt || sheet.produktion || '';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(sheet);
    }
    return [...map.entries()]
      .sort(([a], [b]) => {
        if (!a && b) return 1;
        if (a && !b) return -1;
        return a.localeCompare(b, 'de');
      })
      .map(([proj, items]) => ({
        key:       proj || '__none__',
        label:     proj || 'Ohne Projekt',
        items,
        isNone:    !proj,
        completed: !!completedProjects[proj],
      }));
  }, [visibleSheets, completedProjects]);

  /* Core import handler */
  const doImport = useCallback(async (filePaths, passwordMap = {}) => {
    if (!window.electronAPI || !filePaths?.length) return;
    setImporting(true);
    setMsg(null);
    let results;
    try {
      results = await window.electronAPI.importSesamTimesheet(filePaths, passwordMap);
    } catch (e) {
      setMsg({ type: 'error', text: 'IPC-Fehler: ' + e.message });
      setImporting(false);
      return;
    }

    let added = 0;
    let grafischHint = false;
    for (const r of results) {
      if (r.success) {
        const d = r.data;
        const hasDays = (d?.days || []).length > 0;
        // Accept even fully-graphical PDFs (days=[]) so they appear in the list
        if (d && (hasDays || d.name || d.type === 'arbeitszeiterfassung')) {
          if (!hasDays) grafischHint = true;
          onSesamSheetsChange(prev => [...prev, {
            id:              genId(),
            type:            d.type || 'manual',
            name:            d.name || '',
            taetigkeit:      d.taetigkeit || '',
            produktion:      d.produktion || d.projekt || '',
            projekt:         d.projekt   || d.produktion || '',
            vertragsNr:      d.vertragsNr || '',
            firma:           d.firma || d.produktionsfirma || '',
            produktionsfirma: d.produktionsfirma || d.firma || '',
            approvals:       d.approvals || [],
            days:            d.days || [],
            _allGrafisch:    !hasDays,
            importedAt:      new Date().toISOString(),
            _filename:       r.filename,
            _sourcePath:     r.filePath || null,
          }]);
          added++;
        } else {
          setMsg({ type: 'error', text: `${r.filename}: Keine Sesam-Daten erkannt.` });
        }
      } else if (!r.encrypted) {
        setMsg({ type: 'error', text: `${r.filename}: ${r.error || 'Konnte nicht gelesen werden'}` });
      }
    }
    if (added > 0) {
      const hint = grafischHint ? ' (Tage vollständig als Grafik – kein Tagesvergleich möglich)' : '';
      setMsg({ type: grafischHint ? 'warn' : 'ok', text: `${added} Dokument${added !== 1 ? 'e' : ''} importiert.${hint}` });
    }
    setImporting(false);
  }, [onSesamSheetsChange]);

  const handleOpenDialog = useCallback(async () => {
    if (!window.electronAPI) return;
    const paths = await window.electronAPI.openSesamTimesheetDialog().catch(() => []);
    if (paths?.length) await doImport(paths);
  }, [doImport]);

  /* Drag-and-drop — counter avoids false dragLeave on child elements */
  const handleDragEnter = useCallback((e) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault(); e.stopPropagation();
    dragCounter.current += 1;
    if (dragCounter.current === 1) setIsDragOver(true);
  }, []);
  const handleDragOver = useCallback((e) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault(); e.stopPropagation();
  }, []);
  const handleDragLeave = useCallback((e) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current === 0) setIsDragOver(false);
  }, []);
  const handleDrop = useCallback(async (e) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current = 0;
    setIsDragOver(false);
    // If the drop target is inside an OCR zone, let that handler take it
    if (e.target instanceof Element && e.target.closest('[data-ocr-zone]')) return;
    const pdfs = Array.from(e.dataTransfer.files).filter(f => f.name.toLowerCase().endsWith('.pdf'));
    if (!pdfs.length) return;
    const paths = pdfs.map(f => { try { return window.electronAPI.getPathForFile(f); } catch { return f.path || ''; } }).filter(Boolean);
    if (paths.length) await doImport(paths);
  }, [doImport]);

  const handleDelete = (id) => {
    onSesamSheetsChange(sesamSheets.filter(s => s.id !== id));
    setDeleteId(null);
  };

  /* ── Render individual sheet ─────────────────────────────── */
  function renderSheet(sheet) {
    const isExp   = expanded === sheet.id;
    const isAZ    = sheet.type === 'arbeitszeiterfassung';
    const firstDay = sheet.days[0]?.datum || '–';
    const lastDay  = sheet.days[sheet.days.length - 1]?.datum || '–';
    const totalH   = sheet.days.reduce((s, d) => s + (d.arbeitszeit || 0), 0);
    const totalUE  = sheet.days.reduce((s, d) => s + (d.ueberstunden || 0), 0);

    const missing = sheet.days.filter(sd => sd.datum && !findAppDay(sheet, sd)).length;
    const wrong   = isAZ ? 0 : sheet.days.filter(sd => {
      const ad = findAppDay(sheet, sd);
      if (!ad) return false;
      return hoursMatch(sd.arbeitszeit, ad.stundenTotal ?? null) === false;
    }).length;

    const problems = missing + wrong;
    const statusBadge = sheet._allGrafisch
      ? <span style={s.badge('a')}>⚠ Vollständig grafisch</span>
      : problems > 0
        ? <span style={s.badge('r')}>{isAZ ? `${missing} fehlt in App` : `${problems} Abweichung${problems !== 1 ? 'en' : ''}`}</span>
        : <span style={s.badge('m')}>✓ {isAZ ? 'Alle vorhanden' : 'Übereinstimmend'}</span>;

    return (
      <div key={sheet.id} style={{ ...s.section, borderRadius: 0, border: 'none', borderBottom: '1px solid var(--border)', marginBottom: 0 }}>
        {/* Header row */}
        <div style={s.sectionHead} onClick={() => setExpanded(isExp ? null : sheet.id)}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink)' }}>{sheet.name || 'Unbekannt'}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                {(sheet.produktion || sheet.projekt) && <span style={{ marginRight: 12 }}>{sheet.produktion || sheet.projekt}</span>}
                {sheet.taetigkeit && <span style={{ color: 'var(--hint)' }}>{sheet.taetigkeit}</span>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, fontSize: 12, color: 'var(--muted)', flexWrap: 'wrap', alignItems: 'center' }}>
              <span><strong>{sheet.days.length}</strong> {isAZ ? 'Einträge' : 'Tage'}</span>
              {!isAZ && totalH > 0 && <span><strong>{fmtNum(totalH, 1)}</strong> h</span>}
              {!isAZ && totalUE > 0 && <span><strong>+{fmtNum(totalUE, 1)}</strong> ÜE</span>}
              {isAZ && sheet.approvals?.length > 0 && (
                <span style={{ color: 'var(--m-600)', fontWeight: 500 }}>✓ {sheet.approvals.length}× genehmigt</span>
              )}
              <span style={{ color: 'var(--hint)', fontSize: 11 }}>
                {firstDay}{firstDay !== lastDay ? ` – ${lastDay}` : ''}
              </span>
              {isAZ && (
                <span style={{ fontSize: 11, color: 'var(--hint)', background: 'var(--surface)', padding: '1px 6px', borderRadius: 4, border: '1px solid var(--border)' }}>
                  Arbeitszeiterfassung
                </span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {statusBadge}
            <button
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 5, color: 'var(--r-500)' }}
              title="Entfernen"
              onClick={e => { e.stopPropagation(); setDeleteId(sheet.id); }}
            ><IconTrash /></button>
            <div style={{ transform: isExp ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', display: 'flex', color: 'var(--muted)' }}>
              <IconChevron />
            </div>
          </div>
        </div>

        {/* Expanded detail */}
        {isExp && (
          <div style={{ overflowX: 'auto' }}>
            {/* OCR drop zone for fully-graphical sheets */}
            {sheet._allGrafisch && (() => {
              const os = ocrState[sheet.id];
              const isOver = ocrDragOver === sheet.id;
              const handleOcrDragEnter = (e) => {
                if (!e.dataTransfer.types.includes('Files')) return;
                e.preventDefault(); e.stopPropagation();
                ocrDragCounters.current[sheet.id] = (ocrDragCounters.current[sheet.id] || 0) + 1;
                setOcrDragOver(sheet.id);
              };
              const handleOcrDragOver = (e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); e.stopPropagation(); } };
              const handleOcrDragLeave = (e) => {
                e.preventDefault(); e.stopPropagation();
                ocrDragCounters.current[sheet.id] = Math.max(0, (ocrDragCounters.current[sheet.id] || 1) - 1);
                if (ocrDragCounters.current[sheet.id] === 0) setOcrDragOver(null);
              };
              const handleOcrDrop = async (e) => {
                e.preventDefault(); e.stopPropagation();
                ocrDragCounters.current[sheet.id] = 0;
                setOcrDragOver(null);
                const pdfs = Array.from(e.dataTransfer.files).filter(f => f.name.toLowerCase().endsWith('.pdf'));
                if (!pdfs.length) return;
                const filePath = (() => { try { return window.electronAPI.getPathForFile(pdfs[0]); } catch { return pdfs[0].path || ''; } })();
                if (!filePath) return;
                runOcr(sheet.id, filePath);
              };
              const runOcr = async (id, filePath) => {
                setOcrState(p => ({ ...p, [id]: 'running' }));
                try {
                  const res = await window.electronAPI?.ocrSesamTimesheet?.(filePath);
                  if (res?.success && res.data) {
                    const d = res.data;
                    const hasDays = (d.days || []).length > 0;
                    onSesamSheetsChange(prev => prev.map(s => s.id !== id ? s : {
                      ...s,
                      type:            d.type || s.type,
                      name:            d.name || s.name,
                      taetigkeit:      d.taetigkeit || s.taetigkeit,
                      produktion:      d.produktion || d.projekt || s.produktion,
                      projekt:         d.projekt || d.produktion || s.projekt,
                      firma:           d.firma || d.produktionsfirma || s.firma,
                      produktionsfirma: d.produktionsfirma || d.firma || s.produktionsfirma,
                      approvals:       d.approvals?.length ? d.approvals : s.approvals,
                      days:            d.days || [],
                      _allGrafisch:    !hasDays,
                      _sourcePath:     filePath,
                    }));
                    setOcrState(p => ({ ...p, [id]: hasDays ? 'ok' : 'ok-empty' }));
                  } else {
                    setOcrState(p => ({ ...p, [id]: `error:${res?.error || 'Keine Antwort vom Hauptprozess – App neu starten'}` }));
                  }
                } catch (err) {
                  setOcrState(p => ({ ...p, [id]: `error:IPC-Fehler: ${err.message}` }));
                }
              };
              return (
                <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
                  {os === 'running' ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--muted)', fontSize: 13 }}>
                      <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⏳</span>
                      OCR läuft… macOS Vision analysiert die PDF
                    </div>
                  ) : os === 'ok' ? (
                    <div style={{ color: 'var(--m-600)', fontSize: 13 }}>✓ OCR erfolgreich — Einträge wurden aktualisiert.</div>
                  ) : os === 'ok-empty' ? (
                    <div style={{ color: 'var(--a-600)', fontSize: 13 }}>⚠ OCR abgeschlossen, aber keine Tageseinträge erkannt.</div>
                  ) : os?.startsWith('error:') ? (
                    <div style={{ color: 'var(--r-600)', fontSize: 13 }}>✗ {os.slice(6)}</div>
                  ) : null}
                  {(!os || os?.startsWith('error:')) && (
                    <div
                      data-ocr-zone="true"
                      onDragEnter={handleOcrDragEnter}
                      onDragOver={handleOcrDragOver}
                      onDragLeave={handleOcrDragLeave}
                      onDrop={handleOcrDrop}
                      style={{
                        marginTop: os ? 10 : 0,
                        border: `2px dashed ${isOver ? 'var(--p-500)' : 'var(--a-500)'}`,
                        borderRadius: 10,
                        padding: '20px 24px',
                        textAlign: 'center',
                        background: isOver ? 'var(--p-50)' : 'var(--a-50)',
                        color: isOver ? 'var(--p-600)' : 'var(--a-600)',
                        fontSize: 13,
                        transition: 'all 0.15s',
                        cursor: 'default',
                      }}
                    >
                      <div style={{ fontSize: 22, marginBottom: 6 }}>🔍</div>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>
                        {isOver ? 'PDF ablegen zum OCR-Scan' : 'PDF hier ablegen für OCR-Erkennung'}
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.8 }}>
                        macOS Vision liest die Grafik-Seiten aus — funktioniert ohne externe Tools
                      </div>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12, flexWrap: 'wrap' }}>
                        {sheet._sourcePath && !os && (
                          <button
                            style={{ ...s.btn, ...s.btnGhost, fontSize: 12 }}
                            onClick={(e) => { e.stopPropagation(); runOcr(sheet.id, sheet._sourcePath); }}
                          >
                            ↺ Importierte PDF erneut scannen
                          </button>
                        )}
                        <button
                          style={{ ...s.btn, ...s.btnPrimary, fontSize: 12 }}
                          onClick={async (e) => {
                            e.stopPropagation();
                            const paths = await window.electronAPI?.openSesamTimesheetDialog?.().catch(() => []);
                            if (paths?.length) runOcr(sheet.id, paths[0]);
                          }}
                        >
                          📂 PDF auswählen
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
            {/* Meta bar */}
            {(sheet.vertragsNr || sheet.firma || (sheet.approvals || []).length > 0 || sheet._filename) && (
              <div style={{ padding: '8px 18px', fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
                {sheet.vertragsNr && <span>Vertrags-Nr.: <strong>{sheet.vertragsNr}</strong></span>}
                {sheet.firma && <span>Firma: <strong>{sheet.firma}</strong></span>}
                {(sheet.approvals || []).map((a, i) => (
                  <span key={i} style={{ color: 'var(--m-600)', fontWeight: 500 }}>
                    ✓ Freigabe {a.person} am {a.datum} {a.uhrzeit}
                  </span>
                ))}
                {sheet._filename && <span style={{ color: 'var(--hint)', marginLeft: 'auto' }}>{sheet._filename}</span>}
              </div>
            )}

            {isAZ ? (
              /* Arbeitszeiterfassung — with optional OCR-extracted times */
              (() => {
                const hasSesamTimes = sheet.days.some(sd => sd.start || sd.stundenTotal > 0);
                return (
                  <table style={s.table}>
                    <thead>
                      <tr>
                        <th style={s.th}>Datum</th>
                        <th style={s.th}>Tag</th>
                        <th style={{ ...s.th, color: 'var(--p-500)' }}>Sesam Tätigkeit</th>
                        {hasSesamTimes && <th style={{ ...s.th, color: 'var(--p-500)' }}>Sesam Start</th>}
                        {hasSesamTimes && <th style={{ ...s.th, color: 'var(--p-500)' }}>Sesam Ende</th>}
                        {hasSesamTimes && <th style={{ ...s.thR, color: 'var(--p-500)' }}>Sesam Std</th>}
                        <th style={{ ...s.th, color: 'var(--muted)' }}>App Start</th>
                        <th style={{ ...s.th, color: 'var(--muted)' }}>App Ende</th>
                        <th style={{ ...s.thR, color: 'var(--muted)' }}>App Std</th>
                        <th style={{ ...s.thR, color: 'var(--muted)' }}>App ÜE</th>
                        <th style={s.th}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {sheet.days.map((sd, i) => {
                        const ad = findAppDay(sheet, sd);
                        const appH = ad ? (ad.stundenTotal ?? null) : null;
                        const appUE = ad ? ((ad.ueberstunden25 || 0) + (ad.ueberstunden50 || 0) + (ad.ueberstunden100 || 0)) : null;
                        const statusEl = !sd.datum
                          ? <span style={{ color: 'var(--hint)', fontSize: 15 }}>–</span>
                          : ad
                            ? <span title="Tag in App vorhanden" style={{ color: 'var(--m-500)', fontSize: 15 }}>✓</span>
                            : <span title="Kein passender Tag in App" style={{ color: 'var(--a-500)', fontSize: 15 }}>?</span>;
                        return (
                          <tr key={(sd.datum || i) + i} style={{ background: i % 2 ? 'var(--surface)' : 'transparent' }}>
                            <td style={{ ...s.td, fontWeight: 500 }}>{sd.datum || <span style={{ color: 'var(--hint)', fontStyle: 'italic' }}>unbekannt</span>}</td>
                            <td style={{ ...s.td, color: 'var(--muted)' }}>{sd.wochentag}</td>
                            <td style={{ ...s.td, color: 'var(--p-600)', fontStyle: 'italic' }}>
                              {sd.beschreibung || ''}
                            </td>
                            {hasSesamTimes && <td style={{ ...s.td, color: sd.start ? 'var(--p-600)' : 'var(--hint)' }}>{sd.start || '–'}</td>}
                            {hasSesamTimes && <td style={{ ...s.td, color: sd.ende ? 'var(--p-600)' : 'var(--hint)' }}>{sd.ende || '–'}</td>}
                            {hasSesamTimes && <td style={{ ...s.tdR, color: sd.stundenTotal > 0 ? 'var(--p-600)' : 'var(--hint)', fontWeight: 600 }}>{sd.stundenTotal > 0 ? `${fmtNum(sd.stundenTotal, 1)} h` : '–'}</td>}
                            <td style={{ ...s.td, color: ad ? 'var(--text)' : 'var(--hint)', fontStyle: ad ? 'normal' : 'italic' }}>{ad?.start || '–'}</td>
                            <td style={{ ...s.td, color: ad ? 'var(--text)' : 'var(--hint)', fontStyle: ad ? 'normal' : 'italic' }}>{ad?.ende || '–'}</td>
                            <td style={{ ...s.tdR, color: ad ? 'var(--text)' : 'var(--hint)' }}>{appH != null ? `${fmtNum(appH, 1)} h` : '–'}</td>
                            <td style={{ ...s.tdR, color: appUE != null && appUE > 0 ? 'var(--text)' : 'var(--hint)' }}>
                              {appUE != null && appUE > 0 ? `+${fmtNum(appUE, 1)}` : ad ? '–' : '–'}
                            </td>
                            <td style={{ ...s.td, textAlign: 'center' }}>{statusEl}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                );
              })()
            ) : (
              /* Manueller Stundenzettel — volle Stundenübereinstimmung */
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>Datum</th>
                    <th style={{ ...s.th, color: 'var(--p-500)' }}>Sesam Start</th>
                    <th style={{ ...s.th, color: 'var(--p-500)' }}>Sesam Ende</th>
                    <th style={{ ...s.thR, color: 'var(--p-500)' }}>Sesam Std</th>
                    <th style={{ ...s.thR, color: 'var(--p-500)' }}>Sesam ÜE</th>
                    <th style={{ ...s.th, color: 'var(--muted)' }}>App Start</th>
                    <th style={{ ...s.th, color: 'var(--muted)' }}>App Ende</th>
                    <th style={{ ...s.thR, color: 'var(--muted)' }}>App Std</th>
                    <th style={{ ...s.thR, color: 'var(--muted)' }}>App ÜE</th>
                    <th style={s.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {sheet.days.map((sd, i) => {
                    const ad = findAppDay(sheet, sd);
                    const appH = ad ? (ad.stundenTotal ?? null) : null;
                    const appUE = ad ? ((ad.ueberstunden25 || 0) + (ad.ueberstunden50 || 0) + (ad.ueberstunden100 || 0)) : null;
                    const match = hoursMatch(sd.arbeitszeit, appH);
                    const statusEl = ad == null
                      ? <span title="Kein passender Tag in App" style={{ color: 'var(--a-500)', fontSize: 15 }}>?</span>
                      : match === false
                        ? <span title={`Sesam ${fmtNum(sd.arbeitszeit, 1)} h vs App ${fmtNum(appH, 1)} h`} style={{ color: 'var(--r-500)', fontSize: 15 }}>⚠</span>
                        : <span title="Übereinstimmend" style={{ color: 'var(--m-500)', fontSize: 15 }}>✓</span>;
                    return (
                      <tr key={sd.datum + i} style={{ background: i % 2 ? 'var(--surface)' : 'transparent' }}>
                        <td style={{ ...s.td, fontWeight: 500 }}>{sd.datum}</td>
                        <td style={{ ...s.td, color: 'var(--p-500)' }}>{sd.arbeitsbeginn}</td>
                        <td style={{ ...s.td, color: 'var(--p-500)' }}>{sd.arbeitsende}</td>
                        <td style={{ ...s.tdR, color: 'var(--p-500)', fontWeight: 600 }}>{fmtNum(sd.arbeitszeit, 1)} h</td>
                        <td style={{ ...s.tdR, color: sd.ueberstunden > 0 ? 'var(--p-500)' : 'var(--hint)' }}>
                          {sd.ueberstunden > 0 ? `+${fmtNum(sd.ueberstunden, 1)}` : '–'}
                        </td>
                        <td style={{ ...s.td, color: ad ? 'var(--text)' : 'var(--hint)', fontStyle: ad ? 'normal' : 'italic' }}>{ad?.start || '–'}</td>
                        <td style={{ ...s.td, color: ad ? 'var(--text)' : 'var(--hint)', fontStyle: ad ? 'normal' : 'italic' }}>{ad?.ende || '–'}</td>
                        <td style={{ ...s.tdR, color: match === false ? 'var(--r-500)' : ad ? 'var(--text)' : 'var(--hint)', fontWeight: ad ? 500 : 400 }}>
                          {appH != null ? `${fmtNum(appH, 1)} h` : '–'}
                        </td>
                        <td style={{ ...s.tdR, color: appUE != null && appUE > 0 ? 'var(--text)' : 'var(--hint)' }}>
                          {appUE != null && appUE > 0 ? `+${fmtNum(appUE, 1)}` : ad ? '–' : '–'}
                        </td>
                        <td style={{ ...s.td, textAlign: 'center' }}>{statusEl}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'var(--p-50)', borderTop: '2px solid var(--border-strong)' }}>
                    <td style={{ ...s.td, fontWeight: 700 }}>Gesamt</td>
                    <td colSpan={2} style={s.td} />
                    <td style={{ ...s.tdR, fontWeight: 700, color: 'var(--p-500)' }}>{fmtNum(totalH, 1)} h</td>
                    <td style={{ ...s.tdR, fontWeight: 700, color: 'var(--p-500)' }}>{totalUE > 0 ? `+${fmtNum(totalUE, 1)}` : '–'}</td>
                    <td colSpan={2} style={s.td} />
                    <td style={{ ...s.tdR, fontWeight: 700 }}>
                      {fmtNum(sheet.days.reduce((sum, sd) => {
                        const ad = findAppDay(sheet, sd);
                        return ad?.stundenTotal ? sum + ad.stundenTotal : sum;
                      }, 0), 1)} h
                    </td>
                    <td colSpan={2} style={s.td} />
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        )}
      </div>
    );
  }

  /* ── Root ───────────────────────────────────────────────── */
  return (
    <div
      style={{ ...s.wrap, position: 'relative' }}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drop overlay */}
      {isDragOver && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(99,102,241,0.10)', border: '3px dashed var(--p-500)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ background: 'var(--card)', borderRadius: 12, padding: '20px 36px', boxShadow: 'var(--shadow-lg)', display: 'flex', gap: 12, alignItems: 'center', fontSize: 16, fontWeight: 600, color: 'var(--p-500)' }}>
            <Ico size={24}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></Ico>
            Sesam-PDF hier ablegen
          </div>
        </div>
      )}

      <div style={s.header}>
        <h1 style={s.title}>Sesam Abgleich</h1>
        <button style={{ ...s.btn, ...s.btnGhost }} onClick={handleOpenDialog} disabled={importing}>
          <IconPDF /> {importing ? 'Wird gelesen…' : 'PDF importieren'}
        </button>
      </div>

      {/* Status message */}
      {msg && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 14px', marginBottom: 16, borderRadius: 8, fontSize: 13,
          background: msg.type === 'ok' ? 'var(--m-50)' : msg.type === 'warn' ? 'var(--a-50)' : 'var(--r-50)',
          color: msg.type === 'ok' ? 'var(--m-600)' : msg.type === 'warn' ? 'var(--a-600)' : 'var(--r-600)',
          border: `1px solid var(--${msg.type === 'ok' ? 'm' : msg.type === 'warn' ? 'a' : 'r'}-500)` }}>
          {msg.type === 'ok' ? <IconCheck /> : <IconAlert />}
          {msg.text}
          <button onClick={() => setMsg(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 2 }}><IconX /></button>
        </div>
      )}

      {/* Filter + sort toolbar */}
      {sesamSheets.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Projekt */}
          <select
            value={filterProjekt}
            onChange={e => setFilterProjekt(e.target.value)}
            style={{ fontSize: 13, padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: filterProjekt !== 'all' ? 'var(--p-50)' : 'var(--surface)', color: filterProjekt !== 'all' ? 'var(--p-600)' : 'var(--text)', cursor: 'pointer' }}
          >
            <option value="all">Alle Projekte</option>
            {allProjekte.map(p => <option key={p} value={p}>{p}</option>)}
          </select>

          {/* Person */}
          {allPersonen.length > 1 && (
            <select
              value={filterPerson}
              onChange={e => setFilterPerson(e.target.value)}
              style={{ fontSize: 13, padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: filterPerson !== 'all' ? 'var(--p-50)' : 'var(--surface)', color: filterPerson !== 'all' ? 'var(--p-600)' : 'var(--text)', cursor: 'pointer' }}
            >
              <option value="all">Alle Personen</option>
              {allPersonen.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          )}

          {/* Status */}
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            style={{ fontSize: 13, padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: filterStatus !== 'all' ? 'var(--p-50)' : 'var(--surface)', color: filterStatus !== 'all' ? 'var(--p-600)' : 'var(--text)', cursor: 'pointer' }}
          >
            <option value="all">Alle Status</option>
            <option value="ok">✓ Übereinstimmend</option>
            <option value="abweichung">⚠ Abweichungen</option>
            <option value="grafisch">🔍 Vollständig grafisch</option>
          </select>

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Sort */}
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            style={{ fontSize: 13, padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer' }}
          >
            <option value="date-desc">Datum ↓ (neueste zuerst)</option>
            <option value="date-asc">Datum ↑ (älteste zuerst)</option>
            <option value="projekt">Projekt A–Z</option>
            <option value="name">Name A–Z</option>
          </select>

          {/* Active filters badge */}
          {(filterProjekt !== 'all' || filterPerson !== 'all' || filterStatus !== 'all') && (
            <button
              onClick={() => { setFilterProjekt('all'); setFilterPerson('all'); setFilterStatus('all'); }}
              style={{ fontSize: 12, padding: '4px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--r-50)', color: 'var(--r-600)', cursor: 'pointer' }}
            >
              × Filter zurücksetzen
            </button>
          )}
        </div>
      )}

      {/* Sheet list / empty state */}
      {sesamSheets.length === 0 ? (
        <div style={{ ...s.emptyState, ...s.section }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>📋</div>
          <div style={{ fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>Keine Sesam-Dokumente importiert</div>
          <div style={{ fontSize: 13, maxWidth: 360, margin: '0 auto', lineHeight: 1.6 }}>
            Importiere Sesam-Arbeitszeiterfassungen oder manuelle Stundenzettel-PDFs — die App vergleicht sie automatisch mit deinen eingetragenen Stunden.
          </div>
          <div style={{ fontSize: 12, color: 'var(--hint)', marginTop: 16 }}>
            Per Drag &amp; Drop oder über den Button oben rechts.
          </div>
        </div>
      ) : visibleSheets.length === 0 ? (
        <div style={{ ...s.emptyState, ...s.section }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🔎</div>
          <div style={{ fontWeight: 600, color: 'var(--muted)' }}>Keine Einträge für diesen Filter</div>
          <button
            onClick={() => { setFilterProjekt('all'); setFilterPerson('all'); setFilterStatus('all'); }}
            style={{ ...s.btn, ...s.btnGhost, marginTop: 14, fontSize: 13 }}
          >
            Filter zurücksetzen
          </button>
        </div>
      ) : (
        groupedByProject.map(group => {
          const isCollapsed = collapsedGroups.has(group.key);
          const okCount      = group.items.filter(s => sheetStatus(s) === 'ok').length;
          const abwCount     = group.items.filter(s => sheetStatus(s) === 'abweichung').length;
          const grafCount    = group.items.filter(s => sheetStatus(s) === 'grafisch').length;
          return (
            <div key={group.key} style={{ marginBottom: 6 }}>
              {/* Project group header */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 14px',
                background: group.completed ? 'var(--surface)' : 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: isCollapsed ? 10 : '10px 10px 0 0',
                cursor: 'pointer',
                userSelect: 'none',
              }}
                onClick={() => toggleGroup(group.key)}
              >
                <span style={{ fontSize: 12, color: 'var(--muted)', width: 14, flexShrink: 0 }}>
                  {isCollapsed ? '▶' : '▼'}
                </span>
                <span style={{ fontWeight: 700, fontSize: 14, color: group.completed ? 'var(--muted)' : 'var(--ink)', flex: 1 }}>
                  {group.label}
                </span>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {group.items.length} {group.items.length === 1 ? 'Eintrag' : 'Einträge'}
                </span>
                {okCount > 0 && <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 99, background: 'var(--m-50)', color: 'var(--m-600)', border: '1px solid var(--m-500)' }}>✓ {okCount}</span>}
                {abwCount > 0 && <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 99, background: 'var(--r-50)', color: 'var(--r-600)', border: '1px solid var(--r-500)' }}>⚠ {abwCount}</span>}
                {grafCount > 0 && <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 99, background: 'var(--a-50)', color: 'var(--a-600)', border: '1px solid var(--a-500)' }}>🔍 {grafCount}</span>}
                {!group.isNone && (
                  <button
                    style={{
                      fontSize: 11, padding: '3px 9px', borderRadius: 7, border: '1px solid var(--border)',
                      background: group.completed ? 'var(--m-50)' : 'var(--surface)',
                      color: group.completed ? 'var(--m-600)' : 'var(--muted)',
                      cursor: 'pointer', flexShrink: 0,
                    }}
                    title={group.completed ? 'Als aktiv markieren' : 'Als abgeschlossen markieren'}
                    onClick={e => {
                      e.stopPropagation();
                      onToggleProjectComplete?.(group.label);
                      if (!group.completed) setCollapsedGroups(prev => new Set([...prev, group.key]));
                      else setCollapsedGroups(prev => { const n = new Set(prev); n.delete(group.key); return n; });
                    }}
                  >
                    {group.completed ? '✓ Abgeschlossen' : 'Abschließen'}
                  </button>
                )}
              </div>
              {/* Entries */}
              {!isCollapsed && (
                <div style={{ border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 10px 10px', overflow: 'hidden' }}>
                  {group.items.map(sheet => renderSheet(sheet))}
                </div>
              )}
            </div>
          );
        })
      )}

      {/* Delete confirm modal */}
      {deleteId && (
        <div style={s.overlay} onClick={() => setDeleteId(null)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Eintrag entfernen?</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20 }}>
              Dieser importierte Sesam-Eintrag wird aus der Liste entfernt.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button style={{ ...s.btn, ...s.btnGhost }} onClick={() => setDeleteId(null)}>Abbrechen</button>
              <button style={{ ...s.btn, ...s.btnDanger }} onClick={() => handleDelete(deleteId)}>Entfernen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { calculateTVFFS } from '../utils/tvffsCalculator';

const MONTH_NAMES = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
const MONTH_NAMES_FULL = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];

function fmtCur(v) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(v || 0);
}
function fmtNum(v, digits = 2) {
  return typeof v === 'number' ? v.toFixed(digits).replace('.', ',') : '–';
}

function getSheetYear(sheet) {
  const d = sheet.days?.find(d => d.datum)?.datum;
  if (!d) return null;
  const p = d.split('.');
  if (p.length < 3) return null;
  const y = parseInt(p[2]);
  return y < 100 ? 2000 + y : y;
}
function getSheetMonth(sheet) {
  const d = sheet.days?.find(d => d.datum)?.datum;
  if (!d) return null;
  return parseInt(d.split('.')[1]);
}
function genId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const FORM0 = { projekt: '', name: '', betrag: '', beschreibung: '', datum: '', zeitraumVon: '', zeitraumBis: '' };

/* ── Icons ──────────────────────────────────────────────── */
function Ico({ children, size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}
const IconPlus = () => <Ico><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></Ico>;
const IconTrash = () => <Ico><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></Ico>;
const IconEdit = () => <Ico><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></Ico>;
const IconUpload = () => <Ico><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></Ico>;
const IconCheck = () => <Ico><polyline points="20 6 9 17 4 12"/></Ico>;
const IconX = () => <Ico><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></Ico>;
const IconAlert = () => <Ico><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></Ico>;
const IconChevronDown = () => <Ico><polyline points="6 9 12 15 18 9"/></Ico>;
const IconLock = () => <Ico><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></Ico>;
const IconPDF = () => <Ico><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="15" x2="15" y2="15"/></Ico>;
const IconKey = () => <Ico><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></Ico>;

/* ── Main Component ─────────────────────────────────────── */
export default function Abrechnungen({
  timesheets,
  abrechnungen = [],
  onAbrechnungenChange,
  settings,
  getPersonSettings,
  resolveName,
  getBaseProject,
  team = [],
  completedProjects = {},
  onToggleProjectComplete,
}) {
  const resolve = resolveName || (n => n);
  const baseP = getBaseProject || (p => p || 'Sonstiges');

  /* "Ich"-Person aus dem Team bestimmen */
  const mePerson = useMemo(() => team.find(m => m.isMe) || null, [team]);
  const mePersonName = useMemo(() => mePerson ? resolve(mePerson.name) : 'all', [mePerson, resolve]);

  const [year, setYear] = useState(new Date().getFullYear());
  const [expandedProject, setExpandedProject] = useState(null); // project name expanded in table
  const personF = mePersonName;
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [form, setForm] = useState(FORM0);
  const [deleteId, setDeleteId] = useState(null);
  const [expandedAbr, setExpandedAbr] = useState(null);
  const [cloudSaveState, setCloudSaveState] = useState({}); // abrId → 'saving'|'ok'|'error:<msg>'
  const csvRef = useRef(null);

  // Abgleich filter + sort
  const [abrFilterProjekt, setAbrFilterProjekt] = useState('all');
  const [abrFilterPerson,  setAbrFilterPerson]  = useState('all');

  // Quick inline project assignment
  const [quickEditId, setQuickEditId] = useState(null);
  const [quickEditProjekt, setQuickEditProjekt] = useState('');

  // Collapsed project groups (completed projects start collapsed)
  const [abrCollapsed, setAbrCollapsed] = useState(() => new Set(
    Object.entries(completedProjects).filter(([, v]) => v).map(([k]) => k)
  ));
  const toggleAbrGroup = useCallback((key) => {
    setAbrCollapsed(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }, []);
  const [abrSortBy,        setAbrSortBy]        = useState('date-desc');

  // PDF import state
  const [pdfImporting, setPdfImporting] = useState(false);
  // { filePath, filename, wrongPassword } — file waiting for user to enter a password
  const [pdfPwPrompt, setPdfPwPrompt] = useState(null);
  const [pdfPwInput, setPdfPwInput] = useState('');
  const [pdfPwSave, setPdfPwSave] = useState(true); // save password after success?
  const [pdfPwProduction, setPdfPwProduction] = useState(''); // editable production name for storage key
  const [pdfPwPattern, setPdfPwPattern] = useState(''); // optional pattern for this production
  const [pdfMsg, setPdfMsg] = useState(null); // { type: 'ok'|'error', text }
  // Password-manager tab in settings panel
  const [showPwManager, setShowPwManager] = useState(false);
  const [storedPasswords, setStoredPasswords] = useState({});
  const [storedPatterns, setStoredPatterns] = useState({});

  /* Available years */
  const years = useMemo(() => {
    const ys = new Set([new Date().getFullYear()]);
    timesheets.forEach(ts => { const y = getSheetYear(ts); if (y) ys.add(y); });
    abrechnungen.forEach(a => { const p = (a.datum || '').split('.'); if (p.length >= 3) ys.add(parseInt(p[2])); });
    return [...ys].sort((a, b) => b - a);
  }, [timesheets, abrechnungen]);

  const people = useMemo(() =>
    [...new Set(timesheets.map(t => resolve(t.name || 'Unbekannt')))].sort(),
    [timesheets, resolve]);

  const allProjects = useMemo(() =>
    [...new Set(timesheets.map(t => baseP(t.projekt)))].sort(),
    [timesheets, baseP]);

  /* Timesheets for selected year + person */
  const yearSheets = useMemo(() =>
    timesheets.filter(ts => {
      if (getSheetYear(ts) !== year) return false;
      if (personF !== 'all' && resolve(ts.name || 'Unbekannt') !== personF) return false;
      return true;
    }),
    [timesheets, year, personF, resolve]);

  const effSettings = useMemo(() =>
    personF !== 'all' && getPersonSettings ? getPersonSettings(personF) : settings,
    [personF, getPersonSettings, settings]);

  const hasGage = (effSettings?.tagesgage || 0) > 0;

  /* Year totals */
  const yearCalc = useMemo(() => calculateTVFFS(yearSheets, effSettings), [yearSheets, effSettings]);

  /* Monthly breakdown */
  const monthly = useMemo(() => Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const sheets = yearSheets.filter(ts => getSheetMonth(ts) === m);
    if (!sheets.length) return { month: m, sheets: 0, stunden: 0, tage: 0, verdienst: 0 };
    const c = calculateTVFFS(sheets, effSettings);
    return { month: m, sheets: sheets.length, stunden: c.totalStunden, tage: c.totalArbeitstage, verdienst: c.gesamtVerdienst || c.bruttoGage || 0 };
  }), [yearSheets, effSettings]);

  const maxV = Math.max(...monthly.map(m => m.verdienst), 1);

  /* Project breakdown */
  const byProject = useMemo(() => {
    const groups = {};
    yearSheets.forEach(ts => { const p = baseP(ts.projekt); (groups[p] = groups[p] || []).push(ts); });
    return Object.entries(groups).map(([proj, sheets]) => {
      const ps = personF !== 'all' && getPersonSettings ? getPersonSettings(personF, proj) : settings;
      const c = calculateTVFFS(sheets, ps);
      return { projekt: proj, sheets: sheets.length, tage: c.totalArbeitstage, stunden: c.totalStunden, verdienst: c.gesamtVerdienst || c.bruttoGage || 0 };
    }).sort((a, b) => b.verdienst - a.verdienst);
  }, [yearSheets, personF, getPersonSettings, settings, baseP]);

  /* Abrechnungen for current year */
  const abrYear = useMemo(() =>
    abrechnungen.filter(a => { const p = (a.datum || '').split('.'); return p.length >= 3 && parseInt(p[2]) === year; }),
    [abrechnungen, year]);

  /* Unique projekts + personen for filter dropdowns */
  const abrProjekte = useMemo(() => [...new Set(abrYear.map(a => a.projekt).filter(Boolean))].sort(), [abrYear]);
  const abrPersonen = useMemo(() => [...new Set(abrYear.map(a => a.name).filter(Boolean))].sort(), [abrYear]);

  /* Abrechnungen grouped by project (fuzzy match same as matchedFor) */
  const abrForProject = useCallback((proj) =>
    abrYear.filter(a => {
      if (!a.projekt) return !proj; // entries without project match "Ohne Projekt" row
      return a.projekt.toLowerCase().includes(proj.toLowerCase()) ||
             proj.toLowerCase().includes(a.projekt.toLowerCase());
    }), [abrYear]);

  const billedForProject = useCallback((proj) =>
    abrForProject(proj).reduce((s, a) => s + (a.betrag || 0), 0),
    [abrForProject]);

  /* Filtered + sorted abgleich list */
  const abrVisible = useMemo(() => {
    let list = [...abrYear];
    if (abrFilterProjekt !== 'all') list = list.filter(a => (a.projekt || '') === abrFilterProjekt);
    if (abrFilterPerson  !== 'all') list = list.filter(a => (a.name   || '') === abrFilterPerson);
    list.sort((a, b) => {
      if (abrSortBy === 'date-desc') return (b.datum || '').localeCompare(a.datum || '');
      if (abrSortBy === 'date-asc')  return (a.datum || '').localeCompare(b.datum || '');
      if (abrSortBy === 'projekt')   return (a.projekt || '').localeCompare(b.projekt || '');
      if (abrSortBy === 'betrag-desc') return (b.betrag || 0) - (a.betrag || 0);
      if (abrSortBy === 'betrag-asc')  return (a.betrag || 0) - (b.betrag || 0);
      return 0;
    });
    return list;
  }, [abrYear, abrFilterProjekt, abrFilterPerson, abrSortBy]);

  /* Group abrVisible by project */
  const abrGrouped = useMemo(() => {
    const map = new Map();
    for (const a of abrVisible) {
      const key = a.projekt || '';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(a);
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
  }, [abrVisible, completedProjects]);


  /* Parse "DD.MM.YYYY" → Date (midnight UTC) */
  function parseGermanDate(s) {
    if (!s) return null;
    const [d, m, y] = s.split('.');
    if (!d || !m || !y) return null;
    return new Date(Date.UTC(parseInt(y), parseInt(m) - 1, parseInt(d)));
  }

  /* Match an Abrechnung entry to timesheets.
     If the billing entry has a date range (zeitraumVon/Bis), only include
     timesheets whose days overlap that range. */
  function matchedFor(abr) {
    const vonDate = parseGermanDate(abr.zeitraumVon);
    const bisDate = parseGermanDate(abr.zeitraumBis);
    const hasRange = vonDate && bisDate;

    return yearSheets.filter(ts => {
      const tsP = baseP(ts.projekt);
      const tsN = resolve(ts.name || 'Unbekannt');
      const pm = !abr.projekt || tsP.toLowerCase().includes(abr.projekt.toLowerCase()) || abr.projekt.toLowerCase().includes(tsP.toLowerCase());
      const nm = !abr.name || tsN.toLowerCase().includes(abr.name.toLowerCase()) || abr.name.toLowerCase().includes(tsN.toLowerCase());
      if (!pm || !nm) return false;

      // If billing entry has a date range, only match timesheets with days inside that range
      if (hasRange) {
        const daysInRange = (ts.days || []).filter(day => {
          const d = parseGermanDate(day.datum);
          return d && d >= vonDate && d <= bisDate;
        });
        return daysInRange.length > 0;
      }

      return true;
    });
  }

  /* Calculate TV-FFS earnings only for days within the billing range.
     Returns bruttoGage (without Urlaubsauszahlung) — the billing PDF also shows
     BRUTTO GAGE without vacation payout, so the comparison stays fair. */
  function getSheetsFor(abr) {
    const vonDate = parseGermanDate(abr.zeitraumVon);
    const bisDate = parseGermanDate(abr.zeitraumBis);
    const hasRange = vonDate && bisDate;
    const allSheets = matchedFor(abr);
    if (!allSheets.length) return null;
    const sheets = hasRange
      ? allSheets.map(ts => ({
          ...ts,
          days: (ts.days || []).filter(day => {
            const d = parseGermanDate(day.datum);
            return d && d >= vonDate && d <= bisDate;
          }),
        })).filter(ts => ts.days.length > 0)
      : allSheets;
    if (!sheets.length) return null;
    return { sheets, ps: abr.name && getPersonSettings ? getPersonSettings(abr.name, abr.projekt) : settings };
  }

  function calcFor(abr) {
    const r = getSheetsFor(abr);
    if (!r) return null;
    const c = calculateTVFFS(r.sheets, r.ps);
    return c.bruttoGage || 0;
  }

  function calcDetailsFor(abr) {
    const r = getSheetsFor(abr);
    if (!r) return null;
    return calculateTVFFS(r.sheets, r.ps);
  }

  /* Abgleich summary totals */
  const abgleichTotals = useMemo(() => {
    let billed = 0, calc = 0, cnt = 0;
    abrYear.forEach(a => { billed += a.betrag || 0; const cv = calcFor(a); if (cv !== null) { calc += cv; cnt++; } });
    return { billed, calc, cnt };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abrYear, yearSheets, settings]);

  /* Load stored passwords + patterns on mount */
  useEffect(() => {
    if (!window.electronAPI) return;
    Promise.all([
      window.electronAPI.getBillingPasswords().catch(() => ({})),
      window.electronAPI.getBillingPatterns().catch(() => ({})),
    ]).then(([pw, pt]) => { setStoredPasswords(pw || {}); setStoredPatterns(pt || {}); });
  }, []);

  /* Guess production name from filename (e.g. "Abrechnung_Sesam_202506.pdf" → "Sesam") */
  function guessProduction(filename) {
    const base = filename.replace(/\.[^.]+$/, '').replace(/_?\d{4,8}/g, '').replace(/Abrechnung|Lohn|Payroll/gi, '');
    return base.replace(/[_-]+/g, ' ').trim();
  }

  /* Core PDF import handler — called by button and by password confirmation */
  const handleImportPDF = useCallback(async (filePaths, extraPasswords = {}, patternDate = null) => {
    if (!window.electronAPI || !filePaths?.length) return;
    setPdfImporting(true);
    setPdfMsg(null);

    let results;
    try {
      results = await window.electronAPI.importBillingPDF(filePaths, extraPasswords, patternDate);
    } catch (e) {
      setPdfMsg({ type: 'error', text: 'IPC-Fehler: ' + e.message });
      setPdfImporting(false);
      return;
    }

    // Debug: log full result to browser console so we can see what came back
    console.log('[billing-renderer] results:', JSON.stringify(results));

    let added = 0;
    let needsPassword = null;
    const newEntries = [];

    for (const r of results) {
      if (r.success) {
        // Directly create entry from extracted PDF data — no manual form needed
        const d = r.data || {};
        newEntries.push({
          id: genId(),
          // Use extracted project title if available, fall back to company name
          projekt: d.projekt || d.produktionsfirma || '',
          name: d.name || '',
          betrag: d.betrag || 0,
          beschreibung: r.filename || '',
          datum: d.datum || '',
          zeitraumVon: d.zeitraumVon || '',
          zeitraumBis: d.zeitraumBis || '',
          // Extra fields from Sesam payslip
          netto: d.netto || null,
          auszahlung: d.auszahlung || null,
          produktionsfirma: d.produktionsfirma || '',
          taetigkeit: d.taetigkeit || '',
          importedAt: new Date().toISOString(),
          _fromPDF: true,
          _sourcePath: r.filePath || null,
          _savedToCloud: !!r.savedPath,
        });
        added++;
      } else if (r.encrypted && !needsPassword) {
        needsPassword = r;
      }
    }

    if (newEntries.length) {
      onAbrechnungenChange(prev => [...prev, ...newEntries]);
    }

    if (needsPassword) {
      const guessed = guessProduction(needsPassword.filename);
      setPdfPwPrompt({ ...needsPassword, remainingPaths: filePaths });
      setPdfPwInput('');
      setPdfPwProduction(guessed);
      setPdfPwPattern(storedPatterns[guessed] || '');
      setPdfPwSave(true);
    } else if (added > 0) {
      const savedPaths = results.filter(r => r.success && r.savedPath).map(r => r.savedPath);
      const cloudHint = savedPaths.length > 0
        ? ` PDF${savedPaths.length > 1 ? 's' : ''} in iCloud gespeichert.`
        : '';
      setPdfMsg({ type: 'ok', text: `${added} Abrechnung${added > 1 ? 'en' : ''} aus PDF eingelesen.${cloudHint}` });
    } else if (results.length > 0) {
      // Show the actual error or reason so we can debug
      const details = results.map(r => {
        if (r.encrypted) return `${r.filename}: Verschlüsselt (kein Passwort erkannt)`;
        return `${r.filename}: ${r.error || 'Unbekannter Fehler'}`;
      }).join('\n');
      setPdfMsg({ type: 'error', text: 'Konnte nicht eingelesen werden:\n' + details });
    }

    setPdfImporting(false);
  }, [storedPatterns, onAbrechnungenChange]);

  /* Called when user confirms the password in the prompt modal */
  const handlePwConfirm = useCallback(async () => {
    if (!pdfPwPrompt || !pdfPwInput) return;
    const { remainingPaths } = pdfPwPrompt;
    const pwMap = { [pdfPwPrompt.filePath]: pdfPwInput };

    // Save password if user wants
    if (pdfPwSave && pdfPwProduction && window.electronAPI) {
      await window.electronAPI.saveBillingPassword(pdfPwProduction, pdfPwInput).catch(() => {});
      if (pdfPwPattern) await window.electronAPI.saveBillingPattern(pdfPwProduction, pdfPwPattern).catch(() => {});
      setStoredPasswords(p => ({ ...p, [pdfPwProduction]: pdfPwInput }));
      if (pdfPwPattern) setStoredPatterns(p => ({ ...p, [pdfPwProduction]: pdfPwPattern }));
    }

    setPdfPwPrompt(null);
    await handleImportPDF(remainingPaths, pwMap, pdfPwPrompt.datum || null);
  }, [pdfPwPrompt, pdfPwInput, pdfPwSave, pdfPwProduction, pdfPwPattern, handleImportPDF]);

  /* Open billing dialog + trigger import */
  const handleOpenBillingPDF = useCallback(async () => {
    if (!window.electronAPI) return;
    const paths = await window.electronAPI.openBillingDialog().catch(() => []);
    if (!paths?.length) return;
    await handleImportPDF(paths);
  }, [handleImportPDF]);

  /* Drag-and-drop handlers — intercept drops so they go to billing, not timesheet importer */
  const handleDragOver = useCallback((e) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (!window.electronAPI) return;
    const pdfs = Array.from(e.dataTransfer.files).filter(f => f.name.toLowerCase().endsWith('.pdf'));
    if (!pdfs.length) return;
    const paths = pdfs.map(f => {
      try { return window.electronAPI.getPathForFile(f); } catch { return f.path || ''; }
    }).filter(Boolean);
    if (paths.length) await handleImportPDF(paths);
  }, [handleImportPDF]);

  /* Delete a stored password from manager */
  const handleDeleteStoredPw = useCallback(async (prod) => {
    await window.electronAPI.deleteBillingPassword(prod).catch(() => {});
    setStoredPasswords(p => { const n = { ...p }; delete n[prod]; return n; });
  }, []);

  /* Delete a stored pattern from manager */
  const handleDeleteStoredPattern = useCallback(async (prod) => {
    await window.electronAPI.deleteBillingPattern(prod).catch(() => {});
    setStoredPatterns(p => { const n = { ...p }; delete n[prod]; return n; });
  }, []);

  /* Delete Abrechnung */
  const handleDelete = (id) => {
    onAbrechnungenChange(abrechnungen.filter(a => a.id !== id));
    setDeleteId(null);
  };

  /* Form */
  const openAdd = () => { setForm(FORM0); setEditId(null); setShowForm(true); };
  const openEdit = (abr) => {
    setForm({ projekt: abr.projekt || '', name: abr.name || '', betrag: String(abr.betrag || ''), beschreibung: abr.beschreibung || '', datum: abr.datum || '', zeitraumVon: abr.zeitraumVon || '', zeitraumBis: abr.zeitraumBis || '' });
    setEditId(abr.id);
    setShowForm(true);
  };
  const closeForm = () => { setShowForm(false); setEditId(null); setForm(FORM0); };
  const saveForm = () => {
    const betrag = parseFloat(String(form.betrag).replace(',', '.'));
    if (!form.datum || isNaN(betrag)) return;
    const entry = { id: editId || genId(), ...form, betrag, importedAt: new Date().toISOString() };
    onAbrechnungenChange(editId ? abrechnungen.map(a => a.id === editId ? entry : a) : [...abrechnungen, entry]);
    closeForm();
  };

  /* Quick inline project assignment */
  const doSaveQuickProjekt = (id, value) => {
    onAbrechnungenChange(prev => prev.map(a => a.id === id ? { ...a, projekt: value.trim() } : a));
    setQuickEditId(null);
    setQuickEditProjekt('');
  };

  /* CSV import (format: datum;projekt;name;betrag;beschreibung;zeitraumVon;zeitraumBis) */
  const handleCSV = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const lines = ev.target.result.split('\n').slice(1);
      const entries = [];
      for (const line of lines) {
        if (!line.trim()) continue;
        const cols = line.split(';').map(c => c.trim().replace(/^"|"$/g, ''));
        const [datum, projekt, name, betrag, beschreibung, zeitraumVon, zeitraumBis] = cols;
        const b = parseFloat((betrag || '').replace(',', '.'));
        if (datum && !isNaN(b)) entries.push({ id: genId(), datum, projekt: projekt || '', name: name || '', betrag: b, beschreibung: beschreibung || '', zeitraumVon: zeitraumVon || '', zeitraumBis: zeitraumBis || '', importedAt: new Date().toISOString() });
      }
      if (entries.length) onAbrechnungenChange([...abrechnungen, ...entries]);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  /* ── Styles ─────────────────────────────────────────────── */
  const s = {
    wrap: { padding: '28px 32px', maxWidth: 960, margin: '0 auto' },
    header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 },
    title: { fontSize: 22, fontWeight: 700, color: 'var(--ink)', margin: 0 },
    tabs: { display: 'flex', gap: 4, background: 'var(--surface)', borderRadius: 8, padding: 3, border: '1px solid var(--border)' },
    tab: (active) => ({ padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, background: active ? 'var(--card)' : 'transparent', color: active ? 'var(--ink)' : 'var(--muted)', boxShadow: active ? 'var(--shadow-sm)' : 'none', transition: 'all 0.12s' }),
    controls: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 20 },
    select: { padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontSize: 13, cursor: 'pointer' },
    cards: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 24 },
    card: { background: 'var(--card)', borderRadius: 12, padding: '16px 18px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' },
    cardLabel: { fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 },
    cardValue: { fontSize: 22, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.02em' },
    cardSub: { fontSize: 12, color: 'var(--hint)', marginTop: 2 },
    section: { background: 'var(--card)', borderRadius: 12, border: '1px solid var(--border)', marginBottom: 20, overflow: 'hidden' },
    sectionHead: { padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
    sectionTitle: { fontSize: 14, fontWeight: 600, color: 'var(--ink)' },
    chartWrap: { padding: '20px 18px 12px' },
    chart: { display: 'flex', alignItems: 'flex-end', gap: 4, height: 130, position: 'relative' },
    bar: (h, active) => ({ flex: 1, height: h || 2, background: active ? 'var(--p-500)' : 'var(--border-strong)', borderRadius: '3px 3px 0 0', transition: 'height 0.4s cubic-bezier(0.16,1,0.3,1)', minHeight: 2, position: 'relative', cursor: active ? 'default' : 'default' }),
    barLabel: { textAlign: 'center', fontSize: 10, color: 'var(--muted)', marginTop: 4, letterSpacing: '0.02em' },
    table: { width: '100%', borderCollapse: 'collapse' },
    th: { padding: '9px 14px', fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'left', borderBottom: '1px solid var(--border)', background: 'var(--surface)' },
    thR: { padding: '9px 14px', fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'right', borderBottom: '1px solid var(--border)', background: 'var(--surface)' },
    td: { padding: '10px 14px', fontSize: 13, color: 'var(--text)', borderBottom: '1px solid var(--border)' },
    tdR: { padding: '10px 14px', fontSize: 13, color: 'var(--text)', textAlign: 'right', borderBottom: '1px solid var(--border)', fontVariantNumeric: 'tabular-nums' },
    btn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500 },
    btnPrimary: { background: 'var(--p-500)', color: '#fff' },
    btnGhost: { background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' },
    btnDanger: { background: 'var(--r-50)', color: 'var(--r-600)', border: '1px solid var(--r-500)' },
    chip: (v) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 99, fontSize: 12, fontWeight: 600, background: v > 0 ? 'var(--m-50)' : v < 0 ? 'var(--r-50)' : 'var(--surface)', color: v > 0 ? 'var(--m-600)' : v < 0 ? 'var(--r-600)' : 'var(--muted)' }),
    overlay: { position: 'fixed', inset: 0, background: 'rgba(10,14,26,.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
    modal: { background: 'var(--card)', borderRadius: 16, padding: 28, width: '100%', maxWidth: 480, boxShadow: 'var(--shadow-lg)' },
    label: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 4, marginTop: 14 },
    input: { width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' },
    row: { display: 'flex', gap: 10 },
    emptyState: { padding: '48px 20px', textAlign: 'center', color: 'var(--hint)' },
  };

  /* ── Render: Jahresübersicht ─────────────────────────────── */
  const renderJahr = () => {
    const totalBilled = abrYear.reduce((s, a) => s + (a.betrag || 0), 0);
    const totalCalc   = yearCalc.gesamtVerdienst || yearCalc.bruttoGage || 0;
    const totalDelta  = hasGage && abrYear.length > 0 ? totalBilled - totalCalc : null;
    return (
      <>
        {/* Controls — year + import actions */}
        <div style={{ ...s.controls, justifyContent: 'space-between' }}>
          <select style={s.select} value={year} onChange={e => setYear(parseInt(e.target.value))}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button style={{ ...s.btn, ...s.btnGhost }} onClick={() => setShowPwManager(v => !v)} title="Gespeicherte Passwörter">
              <IconKey /> Passwörter
            </button>
            <input ref={csvRef} type="file" accept=".csv,.txt" style={{ display: 'none' }} onChange={handleCSV} />
            <button style={{ ...s.btn, ...s.btnGhost }} onClick={() => csvRef.current?.click()}>
              <IconUpload /> CSV
            </button>
            <button style={{ ...s.btn, ...s.btnGhost }} onClick={handleOpenBillingPDF} disabled={pdfImporting}>
              <IconPDF /> {pdfImporting ? 'Wird gelesen…' : 'PDF importieren'}
            </button>
            <button style={{ ...s.btn, ...s.btnPrimary }} onClick={openAdd}>
              <IconPlus /> Abrechnung hinzufügen
            </button>
          </div>
        </div>

        {/* Hints */}
        {!mePerson && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 14px', background: 'var(--a-50)', borderRadius: 8, marginBottom: 16, fontSize: 13, color: 'var(--a-600)', border: '1px solid var(--a-500)' }}>
            <IconAlert /> Kein „Das bin ich" definiert – in Einstellungen → Personen eine Person als „Ich" markieren.
          </div>
        )}
        {!hasGage && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 14px', background: 'var(--a-50)', borderRadius: 8, marginBottom: 16, fontSize: 13, color: 'var(--a-600)', border: '1px solid var(--a-500)' }}>
            <IconAlert /> Keine Tagesgage hinterlegt – Verdienst wird als 0 € angezeigt.
          </div>
        )}

        {/* PDF import status */}
        {pdfMsg && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 14px', marginBottom: 12, borderRadius: 8, fontSize: 13, background: pdfMsg.type === 'ok' ? 'var(--m-50)' : 'var(--r-50)', color: pdfMsg.type === 'ok' ? 'var(--m-600)' : 'var(--r-600)', border: `1px solid ${pdfMsg.type === 'ok' ? 'var(--m-500)' : 'var(--r-500)'}` }}>
            {pdfMsg.type === 'ok' ? <IconCheck /> : <IconAlert />}
            {pdfMsg.text}
            <button onClick={() => setPdfMsg(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 2 }}><IconX /></button>
          </div>
        )}

        {/* Password manager panel */}
        {showPwManager && (
          <div style={{ ...s.section, marginBottom: 16 }}>
            <div style={s.sectionHead}>
              <span style={s.sectionTitle}>Gespeicherte Abrechnungs-Passwörter</span>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }} onClick={() => setShowPwManager(false)}><IconX /></button>
            </div>
            {Object.keys(storedPasswords).length === 0 && Object.keys(storedPatterns).length === 0 ? (
              <div style={{ padding: '20px 18px', fontSize: 13, color: 'var(--hint)' }}>Noch keine Passwörter gespeichert.</div>
            ) : (
              <table style={s.table}>
                <thead><tr><th style={s.th}>Produktion</th><th style={s.th}>Passwort</th><th style={s.th}>Muster</th><th style={{ ...s.th, width: 60 }}></th></tr></thead>
                <tbody>
                  {[...new Set([...Object.keys(storedPasswords), ...Object.keys(storedPatterns)])].map((prod, i) => (
                    <tr key={prod} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--surface)' }}>
                      <td style={s.td}>{prod}</td>
                      <td style={{ ...s.td, fontFamily: 'monospace', fontSize: 12 }}>{storedPasswords[prod] ? '••••••••' : <span style={{ color: 'var(--hint)' }}>–</span>}</td>
                      <td style={{ ...s.td, fontFamily: 'monospace', fontSize: 12 }}>{storedPatterns[prod] || <span style={{ color: 'var(--hint)' }}>–</span>}</td>
                      <td style={{ ...s.td, textAlign: 'right' }}>
                        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--r-500)', padding: 4 }} onClick={() => { handleDeleteStoredPw(prod); handleDeleteStoredPattern(prod); }}><IconTrash /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div style={{ padding: '10px 18px', fontSize: 11, color: 'var(--hint)', borderTop: '1px solid var(--border)' }}>
              Muster: <code style={{ background: 'var(--surface)', padding: '1px 4px', borderRadius: 3 }}>{'Sesam{MM}{YYYY}'}</code>
            </div>
          </div>
        )}

        {/* Summary cards */}
        <div style={s.cards}>
          <div style={s.card}>
            <div style={s.cardLabel}>Berechnet</div>
            <div style={{ ...s.cardValue, color: 'var(--p-500)' }}>{fmtCur(totalCalc)}</div>
            {yearCalc.bruttoGage !== yearCalc.gesamtVerdienst && <div style={s.cardSub}>Brutto: {fmtCur(yearCalc.bruttoGage)}</div>}
          </div>
          {abrYear.length > 0 && <>
            <div style={s.card}>
              <div style={s.cardLabel}>Abgerechnet</div>
              <div style={{ ...s.cardValue, color: 'var(--ink)' }}>{fmtCur(totalBilled)}</div>
              <div style={s.cardSub}>{abrYear.length} Eintrag{abrYear.length !== 1 ? 'träge' : ''}</div>
            </div>
            {hasGage && totalDelta !== null && (
              <div style={s.card}>
                <div style={s.cardLabel}>Differenz</div>
                <div style={{ ...s.cardValue, color: totalDelta >= 0 ? 'var(--m-500)' : 'var(--r-500)' }}>{totalDelta >= 0 ? '+' : ''}{fmtCur(totalDelta)}</div>
                <div style={s.cardSub}>{totalDelta >= 0 ? 'Abrechnung ≥ Berechnet' : 'Abrechnung < Berechnet'}</div>
              </div>
            )}
          </>}
          <div style={s.card}>
            <div style={s.cardLabel}>Arbeitstage</div>
            <div style={s.cardValue}>{yearCalc.totalArbeitstage}</div>
            <div style={s.cardSub}>{yearCalc.totalBezahlteTage} bezahlt</div>
          </div>
          <div style={s.card}>
            <div style={s.cardLabel}>Stunden</div>
            <div style={s.cardValue}>{fmtNum(yearCalc.totalStunden, 1)}</div>
            <div style={s.cardSub}>Ø {fmtNum(yearCalc.durchschnittStundenProTag, 1)} h/Tag</div>
          </div>
          <div style={s.card}>
            <div style={s.cardLabel}>Überstunden</div>
            <div style={s.cardValue}>{fmtNum(yearCalc.totalUeberstunden, 1)}</div>
            <div style={s.cardSub}>{fmtNum(yearCalc.totalUeberstunden25, 1)} h à 25% · {fmtNum(yearCalc.totalUeberstunden50, 1)} h à 50%</div>
          </div>
        </div>

        {/* Monthly chart */}
        {yearSheets.length > 0 && (
          <div style={s.section}>
            <div style={s.sectionHead}>
              <span style={s.sectionTitle}>Monatliche Verteilung {year}</span>
            </div>
            <div style={s.chartWrap}>
              <div style={s.chart}>
                {monthly.map((m) => {
                  const barH = m.verdienst > 0 ? Math.max(4, Math.round((m.verdienst / maxV) * 116)) : (m.sheets > 0 ? 4 : 0);
                  const isActive = m.sheets > 0;
                  return (
                    <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', gap: 0 }}>
                      {isActive && hasGage && <div style={{ fontSize: 9, color: 'var(--p-500)', fontWeight: 600, marginBottom: 2, fontVariantNumeric: 'tabular-nums' }}>{m.verdienst >= 1000 ? (m.verdienst / 1000).toFixed(1) + 'k' : Math.round(m.verdienst)}</div>}
                      {isActive && !hasGage && <div style={{ fontSize: 9, color: 'var(--muted)', marginBottom: 2 }}>{m.tage}T</div>}
                      <div title={`${MONTH_NAMES_FULL[m.month - 1]}: ${m.tage} Tage, ${fmtNum(m.stunden, 1)} h${hasGage ? ', ' + fmtCur(m.verdienst) : ''}`} style={s.bar(barH, isActive)} />
                    </div>
                  );
                })}
              </div>
              <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                {monthly.map(m => <div key={m.month} style={{ flex: 1, textAlign: 'center' }}><div style={s.barLabel}>{MONTH_NAMES[m.month - 1]}</div></div>)}
              </div>
            </div>
          </div>
        )}

        {/* Project table with integrated billing */}
        {byProject.length > 0 && (
          <div style={s.section}>
            <div style={s.sectionHead}>
              <span style={s.sectionTitle}>Projekte {year}</span>
              <span style={{ fontSize: 12, color: 'var(--hint)' }}>Zeile klicken für Abrechnungs-Details</span>
            </div>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Projekt</th>
                  <th style={s.thR}>Zettel</th>
                  <th style={s.thR}>Tage</th>
                  <th style={s.thR}>Stunden</th>
                  {hasGage && <th style={s.thR}>Berechnet</th>}
                  {hasGage && <th style={s.thR}>Abgerechnet</th>}
                  {hasGage && <th style={s.thR}>Differenz</th>}
                </tr>
              </thead>
              <tbody>
                {byProject.map((p, i) => {
                  const billed   = billedForProject(p.projekt);
                  const delta    = hasGage ? billed - p.verdienst : null;
                  const entries  = abrForProject(p.projekt);
                  const isExp    = expandedProject === p.projekt;
                  return (
                    <React.Fragment key={p.projekt}>
                      <tr
                        style={{ background: i % 2 === 0 ? 'transparent' : 'var(--surface)', cursor: 'pointer' }}
                        onClick={() => setExpandedProject(isExp ? null : p.projekt)}
                      >
                        <td style={{ ...s.td, fontWeight: 500 }}>
                          <span style={{ marginRight: 6, fontSize: 11, color: 'var(--muted)' }}>{isExp ? '▼' : '▶'}</span>
                          {p.projekt}
                        </td>
                        <td style={s.tdR}>{p.sheets}</td>
                        <td style={s.tdR}>{p.tage}</td>
                        <td style={s.tdR}>{fmtNum(p.stunden, 1)} h</td>
                        {hasGage && <td style={{ ...s.tdR, fontWeight: 600, color: 'var(--p-500)' }}>{fmtCur(p.verdienst)}</td>}
                        {hasGage && <td style={{ ...s.tdR, fontWeight: 600 }}>{billed > 0 ? fmtCur(billed) : <span style={{ color: 'var(--hint)' }}>–</span>}</td>}
                        {hasGage && <td style={s.tdR}>
                          {billed > 0
                            ? <span style={s.chip(delta)}>{delta >= 0 ? '+' : ''}{fmtCur(delta)}</span>
                            : <span style={{ color: 'var(--hint)' }}>–</span>}
                        </td>}
                      </tr>
                      {isExp && (
                        <tr>
                          <td colSpan={hasGage ? 7 : 4} style={{ padding: '0 0 8px', background: 'var(--p-50)' }}>
                            {/* Individual entries */}
                            {entries.length > 0 ? (
                              <table style={{ ...s.table, margin: 0 }}>
                                <thead>
                                  <tr>
                                    <th style={{ ...s.th, paddingLeft: 32 }}>Datum</th>
                                    <th style={s.th}>Person</th>
                                    <th style={s.th}>Beschreibung</th>
                                    <th style={s.thR}>Abgerechnet</th>
                                    {hasGage && <th style={s.thR}>Berechnet</th>}
                                    {hasGage && <th style={s.thR}>Differenz</th>}
                                    <th style={{ ...s.th, width: 80 }}></th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {entries.map((abr, j) => {
                                    const cv = calcFor(abr);
                                    const d  = cv !== null ? abr.betrag - cv : null;
                                    const isRowExp = expandedAbr === abr.id;
                                    return (
                                      <React.Fragment key={abr.id}>
                                        <tr style={{ background: j % 2 === 0 ? 'transparent' : 'var(--surface)' }}>
                                          <td style={{ ...s.td, paddingLeft: 32 }}>{abr.datum}</td>
                                          <td style={s.td}>{abr.name || <span style={{ color: 'var(--hint)' }}>–</span>}</td>
                                          <td style={{ ...s.td, color: 'var(--muted)', fontSize: 12 }}>{abr.beschreibung || '–'}</td>
                                          <td style={{ ...s.tdR, fontWeight: 600 }}>{fmtCur(abr.betrag)}</td>
                                          {hasGage && <td style={s.tdR}>{cv !== null ? fmtCur(cv) : <span style={{ color: 'var(--hint)' }}>–</span>}</td>}
                                          {hasGage && <td style={s.tdR}>{d !== null ? <span style={s.chip(d)}>{d >= 0 ? '+' : ''}{fmtCur(d)}</span> : <span style={{ color: 'var(--hint)' }}>–</span>}</td>}
                                          <td style={{ ...s.td, textAlign: 'right' }}>
                                            <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                                              <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 5, color: 'var(--muted)' }} title="Details" onClick={() => setExpandedAbr(isRowExp ? null : abr.id)}><div style={{ transform: isRowExp ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', display: 'flex' }}><IconChevronDown /></div></button>
                                              <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 5, color: 'var(--muted)' }} title="Bearbeiten" onClick={() => openEdit(abr)}><IconEdit /></button>
                                              <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 5, color: 'var(--r-500)' }} title="Löschen" onClick={() => setDeleteId(abr.id)}><IconTrash /></button>
                                            </div>
                                          </td>
                                        </tr>
                                        {isRowExp && (() => {
                                          const det  = hasGage ? calcDetailsFor(abr) : null;
                                          const diff = cv !== null ? abr.betrag - cv : null;
                                          const mfd  = matchedFor(abr);
                                          return (
                                            <tr>
                                              <td colSpan={hasGage ? 7 : 5} style={{ padding: '12px 16px 16px 32px', background: 'var(--p-50)', borderBottom: '1px solid var(--border)' }}>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 10, fontSize: 12, color: 'var(--muted)' }}>
                                                  {abr.beschreibung && <span style={{ color: 'var(--text)' }}>{abr.beschreibung}</span>}
                                                  {abr.produktionsfirma && <span><strong>Firma:</strong> {abr.produktionsfirma}</span>}
                                                  {abr.taetigkeit && <span><strong>Tätigkeit:</strong> {abr.taetigkeit}</span>}
                                                  {(abr.zeitraumVon || abr.zeitraumBis) && <span>Zeitraum: {abr.zeitraumVon || '?'} – {abr.zeitraumBis || '?'}</span>}
                                                  {abr.netto != null && <span><strong>Netto:</strong> {fmtCur(abr.netto)}</span>}
                                                  {abr.auszahlung != null && <span><strong>Auszahlung:</strong> {fmtCur(abr.auszahlung)}</span>}
                                                </div>
                                                {abr._fromPDF && abr._sourcePath && !abr._savedToCloud && (() => {
                                                  const cs = cloudSaveState[abr.id];
                                                  return (
                                                    <div style={{ marginBottom: 12 }}>
                                                      {cs === 'saving' && <span style={{ fontSize: 12, color: 'var(--muted)' }}>Wird gespeichert…</span>}
                                                      {cs?.startsWith('error:') && <span style={{ fontSize: 12, color: 'var(--r-600)' }}>Fehler: {cs.slice(6)}</span>}
                                                      {!cs && (
                                                        <button style={{ ...s.btn, ...s.btnGhost, fontSize: 12 }} onClick={() => handleSaveToCloud(abr.id, abr._sourcePath, abr.datum)}>
                                                          ☁ In iCloud speichern
                                                        </button>
                                                      )}
                                                    </div>
                                                  );
                                                })()}
                                                {det && diff !== null && (
                                                  <div style={{ fontSize: 12, color: diff >= 0 ? 'var(--m-600)' : 'var(--r-600)', fontWeight: 500 }}>
                                                    Differenz {diff >= 0 ? '+' : ''}{fmtCur(diff)} · {mfd.length} Stundenzettel zugeordnet
                                                  </div>
                                                )}
                                              </td>
                                            </tr>
                                          );
                                        })()}
                                      </React.Fragment>
                                    );
                                  })}
                                </tbody>
                              </table>
                            ) : (
                              <div style={{ padding: '12px 32px', fontSize: 13, color: 'var(--hint)' }}>
                                Keine Abrechnungseinträge für dieses Projekt.
                              </div>
                            )}
                            {/* Add entry for this project */}
                            <div style={{ padding: '8px 32px' }}>
                              <button
                                style={{ ...s.btn, ...s.btnGhost, fontSize: 12 }}
                                onClick={() => { setForm({ ...FORM0, projekt: p.projekt }); setShowForm(true); setEditId(null); }}
                              >
                                <IconPlus /> Abrechnung für {p.projekt} hinzufügen
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
                {byProject.length > 1 && (
                  <tr style={{ background: 'var(--p-50)', borderTop: '2px solid var(--border-strong)' }}>
                    <td style={{ ...s.td, fontWeight: 700 }}>Gesamt</td>
                    <td style={{ ...s.tdR, fontWeight: 700 }}>{byProject.reduce((s, p) => s + p.sheets, 0)}</td>
                    <td style={{ ...s.tdR, fontWeight: 700 }}>{byProject.reduce((s, p) => s + p.tage, 0)}</td>
                    <td style={{ ...s.tdR, fontWeight: 700 }}>{fmtNum(byProject.reduce((s, p) => s + p.stunden, 0), 1)} h</td>
                    {hasGage && <td style={{ ...s.tdR, fontWeight: 700, color: 'var(--p-500)' }}>{fmtCur(byProject.reduce((s, p) => s + p.verdienst, 0))}</td>}
                    {hasGage && <td style={{ ...s.tdR, fontWeight: 700 }}>{fmtCur(totalBilled)}</td>}
                    {hasGage && totalDelta !== null && <td style={{ ...s.tdR, fontWeight: 700, color: totalDelta >= 0 ? 'var(--m-600)' : 'var(--r-600)' }}>{totalDelta >= 0 ? '+' : ''}{fmtCur(totalDelta)}</td>}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Billing entries without a matching project in the timesheet breakdown */}
        {(() => {
          const unmatchedAbr = abrYear.filter(a => {
            if (!a.projekt) return true;
            return !byProject.some(p =>
              p.projekt.toLowerCase().includes(a.projekt.toLowerCase()) ||
              a.projekt.toLowerCase().includes(p.projekt.toLowerCase())
            );
          });
          if (!unmatchedAbr.length) return null;
          const total = unmatchedAbr.reduce((s, a) => s + (a.betrag || 0), 0);
          return (
            <div style={s.section}>
              <div style={s.sectionHead}>
                <span style={s.sectionTitle}>Abrechnungen ohne Projektzuordnung</span>
                <span style={{ fontSize: 12, color: 'var(--hint)' }}>
                  {unmatchedAbr.length} {unmatchedAbr.length === 1 ? 'Eintrag' : 'Einträge'} · {fmtCur(total)}
                </span>
              </div>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>Datum</th>
                    <th style={s.th}>Beschreibung</th>
                    <th style={s.th}>Projekt zuweisen</th>
                    <th style={s.thR}>Betrag</th>
                    <th style={{ ...s.th, width: 80 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {unmatchedAbr.map((abr, i) => (
                    <tr key={abr.id} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--surface)' }}>
                      <td style={s.td}>{abr.datum}</td>
                      <td style={{ ...s.td, color: 'var(--muted)', fontSize: 12 }}>
                        {abr.beschreibung || abr.produktionsfirma || '–'}
                      </td>
                      <td style={s.td}>
                        {quickEditId === abr.id ? (
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <input
                              autoFocus
                              list="abr-all-projekt-list"
                              style={{ ...s.input, padding: '4px 8px', fontSize: 12, width: 180 }}
                              value={quickEditProjekt}
                              placeholder="Projekt wählen…"
                              onChange={e => setQuickEditProjekt(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') doSaveQuickProjekt(abr.id, quickEditProjekt);
                                if (e.key === 'Escape') { setQuickEditId(null); setQuickEditProjekt(''); }
                              }}
                              onBlur={() => doSaveQuickProjekt(abr.id, quickEditProjekt)}
                            />
                          </div>
                        ) : (
                          <button
                            style={{ background: 'var(--a-50)', border: '1px dashed var(--a-500)', color: 'var(--a-600)', borderRadius: 6, padding: '3px 10px', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}
                            onClick={() => { setQuickEditId(abr.id); setQuickEditProjekt(abr.projekt || ''); }}
                          >
                            {abr.projekt ? `📁 ${abr.projekt}` : '+ Projekt zuweisen'}
                          </button>
                        )}
                      </td>
                      <td style={{ ...s.tdR, fontWeight: 600 }}>{fmtCur(abr.betrag)}</td>
                      <td style={{ ...s.td, textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 5, color: 'var(--muted)' }} title="Bearbeiten" onClick={() => openEdit(abr)}><IconEdit /></button>
                          <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 5, color: 'var(--r-500)' }} title="Löschen" onClick={() => setDeleteId(abr.id)}><IconTrash /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })()}

        {yearSheets.length === 0 && (
          <div style={s.emptyState}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📅</div>
            <div style={{ fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>Keine Stundenzettel für {year}</div>
            <div style={{ fontSize: 13 }}>Importiere Stundenzettel oder wähle ein anderes Jahr.</div>
          </div>
        )}
      </>
    );
  };


  /* ── Render: Abgleich ────────────────────────────────────── */
  const renderAbgleich = () => {
    const delta = abgleichTotals.billed - abgleichTotals.calc;
    return (
      <>
        {/* Controls */}
        <div style={{ ...s.controls, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select style={s.select} value={year} onChange={e => setYear(parseInt(e.target.value))}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button style={{ ...s.btn, ...s.btnGhost }} onClick={() => setShowPwManager(v => !v)} title="Gespeicherte Passwörter verwalten">
              <IconKey /> Passwörter
            </button>
            <input ref={csvRef} type="file" accept=".csv,.txt" style={{ display: 'none' }} onChange={handleCSV} />
            <button style={{ ...s.btn, ...s.btnGhost }} onClick={() => csvRef.current?.click()}>
              <IconUpload /> CSV importieren
            </button>
            <button style={{ ...s.btn, ...s.btnGhost }} onClick={handleOpenBillingPDF} disabled={pdfImporting}>
              <IconPDF /> {pdfImporting ? 'Wird gelesen…' : 'PDF importieren'}
            </button>
            <button style={{ ...s.btn, ...s.btnPrimary }} onClick={openAdd}>
              <IconPlus /> Abrechnung hinzufügen
            </button>
          </div>
        </div>

        {/* Summary cards */}
        {abrYear.length > 0 && (
          <div style={{ ...s.cards, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginBottom: 16 }}>
            <div style={s.card}>
              <div style={s.cardLabel}>Abgerechnet</div>
              <div style={{ ...s.cardValue, color: 'var(--ink)' }}>{fmtCur(abgleichTotals.billed)}</div>
              <div style={s.cardSub}>{abrYear.length} Eintrag{abrYear.length !== 1 ? 'träge' : ''}</div>
            </div>
            {hasGage && abgleichTotals.cnt > 0 && <>
              <div style={s.card}>
                <div style={s.cardLabel}>Berechnet (Zettel)</div>
                <div style={{ ...s.cardValue, color: 'var(--p-500)' }}>{fmtCur(abgleichTotals.calc)}</div>
                <div style={s.cardSub}>{abgleichTotals.cnt} zugeordnet</div>
              </div>
              <div style={s.card}>
                <div style={s.cardLabel}>Differenz</div>
                <div style={{ ...s.cardValue, color: delta >= 0 ? 'var(--m-500)' : 'var(--r-500)' }}>{delta >= 0 ? '+' : ''}{fmtCur(delta)}</div>
                <div style={s.cardSub}>{delta >= 0 ? 'Abrechnung höher oder gleich' : 'Abrechnung niedriger als berechnet'}</div>
              </div>
            </>}
          </div>
        )}

        {/* PDF import status message */}
        {pdfMsg && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 14px', marginBottom: 12, borderRadius: 8, fontSize: 13, background: pdfMsg.type === 'ok' ? 'var(--m-50)' : 'var(--r-50)', color: pdfMsg.type === 'ok' ? 'var(--m-600)' : 'var(--r-600)', border: `1px solid ${pdfMsg.type === 'ok' ? 'var(--m-500)' : 'var(--r-500)'}` }}>
            {pdfMsg.type === 'ok' ? <IconCheck /> : <IconAlert />}
            {pdfMsg.text}
            <button onClick={() => setPdfMsg(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 2 }}><IconX /></button>
          </div>
        )}

        {/* Password manager panel */}
        {showPwManager && (
          <div style={{ ...s.section, marginBottom: 16 }}>
            <div style={s.sectionHead}>
              <span style={s.sectionTitle}>Gespeicherte Abrechnungs-Passwörter</span>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }} onClick={() => setShowPwManager(false)}><IconX /></button>
            </div>
            {Object.keys(storedPasswords).length === 0 && Object.keys(storedPatterns).length === 0 ? (
              <div style={{ padding: '20px 18px', fontSize: 13, color: 'var(--hint)' }}>
                Noch keine Passwörter gespeichert. Importiere eine passwortgeschützte PDF und speichere das Passwort.
              </div>
            ) : (
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>Produktion</th>
                    <th style={s.th}>Passwort</th>
                    <th style={s.th}>Muster</th>
                    <th style={{ ...s.th, width: 60 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {[...new Set([...Object.keys(storedPasswords), ...Object.keys(storedPatterns)])].map((prod, i) => (
                    <tr key={prod} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--surface)' }}>
                      <td style={s.td}>{prod}</td>
                      <td style={{ ...s.td, fontFamily: 'monospace', fontSize: 12 }}>
                        {storedPasswords[prod] ? '••••••••' : <span style={{ color: 'var(--hint)' }}>–</span>}
                      </td>
                      <td style={{ ...s.td, fontFamily: 'monospace', fontSize: 12 }}>
                        {storedPatterns[prod] || <span style={{ color: 'var(--hint)' }}>–</span>}
                      </td>
                      <td style={{ ...s.td, textAlign: 'right' }}>
                        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--r-500)', padding: 4 }}
                          title="Passwort & Muster löschen"
                          onClick={() => { handleDeleteStoredPw(prod); handleDeleteStoredPattern(prod); }}>
                          <IconTrash />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div style={{ padding: '10px 18px', fontSize: 11, color: 'var(--hint)', borderTop: '1px solid var(--border)' }}>
              Passwörter werden verschlüsselt im Betriebssystem-Schlüsselbund gespeichert.
              Muster: <code style={{ background: 'var(--surface)', padding: '1px 4px', borderRadius: 3 }}>{'Sesam{MM}{YYYY}'}</code> → z.B. "Sesam062025"
            </div>
          </div>
        )}

        {/* CSV hint */}
        <div style={{ fontSize: 12, color: 'var(--hint)', marginBottom: 12, padding: '0 2px' }}>
          CSV-Format (Semikolon): <code style={{ background: 'var(--surface)', padding: '1px 5px', borderRadius: 4, fontFamily: 'monospace' }}>Datum;Projekt;Name;Betrag;Beschreibung;ZeitraumVon;ZeitraumBis</code>
        </div>

        {/* Filter + sort toolbar */}
        {abrYear.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              value={abrFilterProjekt}
              onChange={e => setAbrFilterProjekt(e.target.value)}
              style={{ fontSize: 13, padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: abrFilterProjekt !== 'all' ? 'var(--p-50)' : 'var(--surface)', color: abrFilterProjekt !== 'all' ? 'var(--p-600)' : 'var(--text)', cursor: 'pointer' }}
            >
              <option value="all">Alle Projekte</option>
              {abrProjekte.map(p => <option key={p} value={p}>{p}</option>)}
            </select>

            {abrPersonen.length > 1 && (
              <select
                value={abrFilterPerson}
                onChange={e => setAbrFilterPerson(e.target.value)}
                style={{ fontSize: 13, padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: abrFilterPerson !== 'all' ? 'var(--p-50)' : 'var(--surface)', color: abrFilterPerson !== 'all' ? 'var(--p-600)' : 'var(--text)', cursor: 'pointer' }}
              >
                <option value="all">Alle Personen</option>
                {abrPersonen.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            )}

            <div style={{ flex: 1 }} />

            <select
              value={abrSortBy}
              onChange={e => setAbrSortBy(e.target.value)}
              style={{ fontSize: 13, padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer' }}
            >
              <option value="date-desc">Datum ↓ (neueste zuerst)</option>
              <option value="date-asc">Datum ↑ (älteste zuerst)</option>
              <option value="projekt">Projekt A–Z</option>
              <option value="betrag-desc">Betrag ↓ (höchster zuerst)</option>
              <option value="betrag-asc">Betrag ↑ (niedrigster zuerst)</option>
            </select>

            {(abrFilterProjekt !== 'all' || abrFilterPerson !== 'all') && (
              <button
                onClick={() => { setAbrFilterProjekt('all'); setAbrFilterPerson('all'); }}
                style={{ fontSize: 12, padding: '4px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--r-50)', color: 'var(--r-600)', cursor: 'pointer' }}
              >
                × Filter zurücksetzen
              </button>
            )}
          </div>
        )}

        {/* Abrechnung list */}
        {abrYear.length === 0 ? (
          <div style={{ ...s.emptyState, ...s.section }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🧾</div>
            <div style={{ fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>Keine Abrechnungen für {year}</div>
            <div style={{ fontSize: 13 }}>Füge Abrechnungsbeträge hinzu und vergleiche sie mit deinen Stundenzetteln.</div>
          </div>
        ) : abrVisible.length === 0 ? (
          <div style={{ ...s.emptyState, ...s.section }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🔎</div>
            <div style={{ fontWeight: 600, color: 'var(--muted)' }}>Keine Einträge für diesen Filter</div>
            <button
              onClick={() => { setAbrFilterProjekt('all'); setAbrFilterPerson('all'); }}
              style={{ marginTop: 14, fontSize: 13, padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer' }}
            >Filter zurücksetzen</button>
          </div>
        ) : (
          abrGrouped.map(group => {
            const isCollapsed = abrCollapsed.has(group.key);
            const groupBilled = group.items.reduce((s, a) => s + (a.betrag || 0), 0);
            const groupCalc   = hasGage ? group.items.reduce((s, a) => { const cv = calcFor(a); return cv !== null ? s + cv : s; }, 0) : null;
            const groupDelta  = groupCalc !== null ? groupBilled - groupCalc : null;
            return (
              <div key={group.key} style={{ marginBottom: 6 }}>
                {/* Project group header */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 14px',
                  background: group.completed ? 'var(--surface)' : 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: isCollapsed ? 10 : '10px 10px 0 0',
                  cursor: 'pointer', userSelect: 'none',
                }} onClick={() => toggleAbrGroup(group.key)}>
                  <span style={{ fontSize: 12, color: 'var(--muted)', width: 14, flexShrink: 0 }}>
                    {isCollapsed ? '▶' : '▼'}
                  </span>
                  <span style={{ fontWeight: 700, fontSize: 14, color: group.completed ? 'var(--muted)' : 'var(--ink)', flex: 1 }}>
                    {group.label}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>{group.items.length} {group.items.length === 1 ? 'Eintrag' : 'Einträge'}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{fmtCur(groupBilled)}</span>
                  {groupDelta !== null && (
                    <span style={{ fontSize: 12, fontWeight: 600, color: groupDelta >= 0 ? 'var(--m-600)' : 'var(--r-600)' }}>
                      {groupDelta >= 0 ? '+' : ''}{fmtCur(groupDelta)}
                    </span>
                  )}
                  {!group.isNone && (
                    <button
                      style={{
                        fontSize: 11, padding: '3px 9px', borderRadius: 7, border: '1px solid var(--border)',
                        background: group.completed ? 'var(--m-50)' : 'var(--surface)',
                        color: group.completed ? 'var(--m-600)' : 'var(--muted)',
                        cursor: 'pointer', flexShrink: 0,
                      }}
                      onClick={e => {
                        e.stopPropagation();
                        onToggleProjectComplete?.(group.label);
                        if (!group.completed) setAbrCollapsed(prev => new Set([...prev, group.key]));
                        else setAbrCollapsed(prev => { const n = new Set(prev); n.delete(group.key); return n; });
                      }}
                    >
                      {group.completed ? '✓ Abgeschlossen' : 'Abschließen'}
                    </button>
                  )}
                </div>
                {/* Entries table */}
                {!isCollapsed && (
                  <div style={{ ...s.section, borderRadius: '0 0 10px 10px', marginBottom: 0, borderTop: 'none' }}>
                    <table style={s.table}>
                      <thead>
                        <tr>
                          <th style={s.th}>Datum</th>
                          <th style={s.th}>Person</th>
                          <th style={s.thR}>Abgerechnet</th>
                          {hasGage && <th style={s.thR}>Berechnet</th>}
                          {hasGage && <th style={s.thR}>Differenz</th>}
                          <th style={{ ...s.th, width: 80 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                {group.items.map((abr, i) => {
                  const cv = calcFor(abr);
                  const d = cv !== null ? abr.betrag - cv : null;
                  const isExpanded = expandedAbr === abr.id;
                  const matched = matchedFor(abr);
                  return (
                    <React.Fragment key={abr.id}>
                      <tr style={{ background: i % 2 === 0 ? 'transparent' : 'var(--surface)' }}>
                        <td style={s.td}>{abr.datum}</td>
                        <td style={s.td}>{abr.name || <span style={{ color: 'var(--hint)' }}>Alle</span>}</td>
                        <td style={{ ...s.tdR, fontWeight: 600 }}>{fmtCur(abr.betrag)}</td>
                        {hasGage && <td style={s.tdR}>{cv !== null ? fmtCur(cv) : <span style={{ color: 'var(--hint)' }}>–</span>}</td>}
                        {hasGage && (
                          <td style={s.tdR}>
                            {d !== null
                              ? <span style={s.chip(d)}>{d >= 0 ? '+' : ''}{fmtCur(d)}</span>
                              : <span style={{ color: 'var(--hint)' }}>–</span>}
                          </td>
                        )}
                        <td style={{ ...s.td, textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                            <button
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 5, color: 'var(--muted)' }}
                              title="Details"
                              onClick={() => setExpandedAbr(isExpanded ? null : abr.id)}
                            >
                              <div style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', display: 'flex' }}>
                                <IconChevronDown />
                              </div>
                            </button>
                            <button
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 5, color: 'var(--muted)' }}
                              title="Bearbeiten"
                              onClick={() => openEdit(abr)}
                            >
                              <IconEdit />
                            </button>
                            <button
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 5, color: 'var(--r-500)' }}
                              title="Löschen"
                              onClick={() => setDeleteId(abr.id)}
                            >
                              <IconTrash />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (() => {
                        const det = hasGage ? calcDetailsFor(abr) : null;
                        const diff = cv !== null ? abr.betrag - cv : null;
                        return (
                          <tr>
                            <td colSpan={hasGage ? 6 : 4} style={{ padding: '12px 16px 16px', background: 'var(--p-50)', borderBottom: '1px solid var(--border)' }}>
                              {/* Meta */}
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 10, fontSize: 12, color: 'var(--muted)' }}>
                                {abr.beschreibung && <span style={{ color: 'var(--text)' }}>{abr.beschreibung}</span>}
                                {abr.produktionsfirma && <span><strong>Firma:</strong> {abr.produktionsfirma}</span>}
                                {abr.taetigkeit && <span><strong>Tätigkeit:</strong> {abr.taetigkeit}</span>}
                                {(abr.zeitraumVon || abr.zeitraumBis) && <span>Zeitraum: {abr.zeitraumVon || '?'} – {abr.zeitraumBis || '?'}</span>}
                                {abr.netto != null && <span><strong>Netto:</strong> {fmtCur(abr.netto)}</span>}
                                {abr.auszahlung != null && <span><strong>Auszahlung:</strong> {fmtCur(abr.auszahlung)}</span>}
                              </div>

                              {/* Inline project assignment when no project set or no timesheets matched */}
                              {(!abr.projekt || matched.length === 0) && (
                                <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>Projekt:</span>
                                  {quickEditId === abr.id ? (
                                    <input
                                      autoFocus
                                      list="abr-all-projekt-list"
                                      style={{ ...s.input, padding: '4px 8px', fontSize: 12, width: 200 }}
                                      value={quickEditProjekt}
                                      placeholder="Projekt wählen…"
                                      onChange={e => setQuickEditProjekt(e.target.value)}
                                      onKeyDown={e => {
                                        if (e.key === 'Enter') doSaveQuickProjekt(abr.id, quickEditProjekt);
                                        if (e.key === 'Escape') { setQuickEditId(null); setQuickEditProjekt(''); }
                                      }}
                                      onBlur={() => doSaveQuickProjekt(abr.id, quickEditProjekt)}
                                    />
                                  ) : (
                                    <button
                                      style={{ background: 'var(--a-50)', border: '1px dashed var(--a-500)', color: 'var(--a-600)', borderRadius: 6, padding: '3px 10px', fontSize: 12, cursor: 'pointer' }}
                                      onClick={() => { setQuickEditId(abr.id); setQuickEditProjekt(abr.projekt || ''); }}
                                    >
                                      {abr.projekt ? `📁 ${abr.projekt}` : '+ Projekt zuweisen'}
                                    </button>
                                  )}
                                </div>
                              )}

                              {/* iCloud save button — shown for PDF imports not yet saved to cloud */}
                              {abr._fromPDF && abr._sourcePath && !abr._savedToCloud && (() => {
                                const cs = cloudSaveState[abr.id];
                                return (
                                  <div style={{ marginBottom: 12 }}>
                                    {cs === 'saving' && (
                                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>Wird gespeichert…</span>
                                    )}
                                    {cs && cs.startsWith('error:') && (
                                      <span style={{ fontSize: 12, color: 'var(--r-600)' }}>
                                        Fehler: {cs.slice(6)}
                                      </span>
                                    )}
                                    {cs !== 'saving' && cs !== 'ok' && (
                                      <button style={{ ...s.btn, ...s.btnGhost, fontSize: 12, padding: '4px 10px' }} onClick={async () => {
                                        setCloudSaveState(p => ({ ...p, [abr.id]: 'saving' }));
                                        const res = await window.electronAPI?.saveBillingPdfToCloud?.(abr._sourcePath, abr.datum);
                                        if (res?.success) {
                                          onAbrechnungenChange(prev => prev.map(a => a.id === abr.id ? { ...a, _savedToCloud: true } : a));
                                          setCloudSaveState(p => ({ ...p, [abr.id]: 'ok' }));
                                        } else {
                                          setCloudSaveState(p => ({ ...p, [abr.id]: `error:${res?.error || 'Unbekannt'}` }));
                                        }
                                      }}>
                                        ☁️ In iCloud speichern
                                      </button>
                                    )}
                                  </div>
                                );
                              })()}

                              <div style={{ display: 'grid', gridTemplateColumns: det ? '1fr 1fr' : '1fr', gap: 16 }}>
                                {/* Stundenzettel list */}
                                <div>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                                    Zugeordnete Stundenzettel ({matched.length})
                                  </div>
                                  {matched.length === 0 ? (
                                    <div style={{ fontSize: 12, color: 'var(--hint)', fontStyle: 'italic' }}>Keine passenden Stundenzettel gefunden</div>
                                  ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                      {matched.slice(0, 8).map(ts => (
                                        <div key={ts.id} style={{ fontSize: 12, color: 'var(--text)', display: 'flex', gap: 8, alignItems: 'center' }}>
                                          <span style={{ color: 'var(--muted)', minWidth: 60 }}>{ts.days?.[0]?.datum || '–'}</span>
                                          <span style={{ fontWeight: 500 }}>{baseP(ts.projekt)}</span>
                                          <span style={{ color: 'var(--hint)' }}>{resolve(ts.name || 'Unbekannt')}</span>
                                        </div>
                                      ))}
                                      {matched.length > 8 && <div style={{ fontSize: 12, color: 'var(--hint)' }}>… und {matched.length - 8} weitere</div>}
                                    </div>
                                  )}
                                </div>

                                {/* Calculation breakdown */}
                                {det && (
                                  <div>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                                      Aufschlüsselung Berechnung
                                    </div>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                      <tbody>
                                        {[
                                          det.grundgage > 0 && {
                                            label: `Grundgage (${det.totalArbeitstage} ${det.totalArbeitstage === 1 ? 'Tag' : 'Tage'}, ${fmtNum(det.stundensatz)}/h)`,
                                            h: `${fmtNum(det.totalStunden, 1)} h`,
                                            val: det.grundgage,
                                            bold: false,
                                          },
                                          det.ueberstundenGrundverguetung > 0 && {
                                            label: `ÜE Grundvergütung (${fmtNum(det.totalUeberstunden25 + det.totalUeberstunden50 + det.totalUeberstunden100, 2)} h × ${fmtNum(det.stundensatz)}/h)`,
                                            h: null,
                                            val: det.ueberstundenGrundverguetung,
                                          },
                                          (det.zuschlag25 + det.zuschlag50 + det.zuschlag100) > 0 && {
                                            label: `ÜE Zuschläge (${det.totalUeberstunden25 > 0 ? fmtNum(det.totalUeberstunden25, 2) + ' h×25%' : ''}${det.totalUeberstunden50 > 0 ? (det.totalUeberstunden25 > 0 ? ', ' : '') + fmtNum(det.totalUeberstunden50, 2) + ' h×50%' : ''})`,
                                            h: null,
                                            val: det.zuschlag25 + det.zuschlag50 + det.zuschlag100,
                                          },
                                          det.nachtZuschlag > 0 && {
                                            label: `Nachtzuschlag (${fmtNum(det.totalNacht, 2)} h × 25%)`,
                                            h: null,
                                            val: det.nachtZuschlag,
                                          },
                                          det.samstagZuschlag > 0 && {
                                            label: `Samstags-Zuschlag (${fmtNum(det.totalSamstagsstunden, 2)} h × 25%)`,
                                            h: null,
                                            val: det.samstagZuschlag,
                                          },
                                          det.sonntagZuschlag > 0 && {
                                            label: `Sonntags-Zuschlag (${fmtNum(det.totalSonntagsstunden, 2)} h × 75%)`,
                                            h: null,
                                            val: det.sonntagZuschlag,
                                          },
                                          det.feiertagZuschlag > 0 && {
                                            label: `Feiertags-Zuschlag (${fmtNum(det.totalFeiertagsstunden, 2)} h × 100%)`,
                                            h: null,
                                            val: det.feiertagZuschlag,
                                          },
                                          (det.weeklyOTGrundverguetung > 0 || det.weeklyOTZuschlag25 > 0 || det.weeklyOTZuschlag50 > 0) && {
                                            label: `Wöchentliche ÜE (${fmtNum(det.weeklyOT25 + det.weeklyOT50, 2)} h)`,
                                            h: null,
                                            val: det.weeklyOTGrundverguetung + det.weeklyOTZuschlag25 + det.weeklyOTZuschlag50,
                                          },
                                        ].filter(Boolean).map((row, ri) => (
                                          <tr key={ri}>
                                            <td style={{ padding: '3px 0', color: 'var(--muted)', paddingRight: 12 }}>{row.label}</td>
                                            <td style={{ padding: '3px 0', textAlign: 'right', color: 'var(--text)', fontVariantNumeric: 'tabular-nums', fontWeight: row.bold ? 700 : 400 }}>
                                              {fmtCur(row.val)}
                                            </td>
                                          </tr>
                                        ))}
                                        {/* Divider + total */}
                                        <tr>
                                          <td colSpan={2} style={{ borderTop: '1px solid var(--border)', paddingTop: 6, paddingBottom: 0 }} />
                                        </tr>
                                        <tr>
                                          <td style={{ padding: '3px 0', fontWeight: 700, color: 'var(--ink)' }}>Gesamt (Berechnet)</td>
                                          <td style={{ padding: '3px 0', textAlign: 'right', fontWeight: 700, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{fmtCur(det.bruttoGage)}</td>
                                        </tr>
                                        <tr>
                                          <td style={{ padding: '3px 0', color: 'var(--muted)' }}>Abgerechnet (Sesam)</td>
                                          <td style={{ padding: '3px 0', textAlign: 'right', color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{fmtCur(abr.betrag)}</td>
                                        </tr>
                                        {diff !== null && (
                                          <tr>
                                            <td style={{ padding: '3px 0', color: diff === 0 ? 'var(--m-600)' : diff > 0 ? 'var(--m-600)' : 'var(--r-600)', fontWeight: 600 }}>Differenz</td>
                                            <td style={{ padding: '3px 0', textAlign: 'right', fontWeight: 700, color: diff === 0 ? 'var(--m-600)' : diff > 0 ? 'var(--m-600)' : 'var(--r-600)', fontVariantNumeric: 'tabular-nums' }}>
                                              {diff >= 0 ? '+' : ''}{fmtCur(diff)}
                                            </td>
                                          </tr>
                                        )}
                                      </tbody>
                                    </table>
                                    {diff !== null && Math.abs(diff) > 0.5 && (
                                      <div style={{ marginTop: 8, fontSize: 11, color: 'var(--hint)', lineHeight: 1.5 }}>
                                        {diff > 0 ? '↑ Sesam rechnet mehr ab als die App berechnet — mögliche Ursachen: Reisetage, Spesen, abweichende Tagesgage.' : '↓ Sesam rechnet weniger ab als die App berechnet.'}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })()}
                    </React.Fragment>
                  );
                })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })
        )}
      </>
    );
  };

  /* ── Delete confirmation ─────────────────────────────────── */
  const renderDeleteConfirm = () => deleteId && (
    <div style={s.overlay} onClick={() => setDeleteId(null)}>
      <div style={{ ...s.modal, maxWidth: 360 }} onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Abrechnung löschen?</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20 }}>Dieser Eintrag wird endgültig entfernt.</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button style={{ ...s.btn, ...s.btnGhost }} onClick={() => setDeleteId(null)}>Abbrechen</button>
          <button style={{ ...s.btn, ...s.btnDanger }} onClick={() => handleDelete(deleteId)}>Löschen</button>
        </div>
      </div>
    </div>
  );

  /* ── Password prompt modal (encrypted PDF) ──────────────── */
  const renderPwPrompt = () => pdfPwPrompt && (
    <div style={s.overlay} onClick={() => setPdfPwPrompt(null)}>
      <div style={{ ...s.modal, maxWidth: 420 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 6 }}>
          <div style={{ color: 'var(--a-500)' }}><IconLock /></div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Passwort eingeben</div>
        </div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
          <strong style={{ color: 'var(--ink)' }}>{pdfPwPrompt.filename}</strong> ist passwortgeschützt.
          {pdfPwPrompt.wrongPassword && (
            <div style={{ color: 'var(--r-500)', marginTop: 4, fontWeight: 500 }}>⚠ Falsches Passwort — bitte erneut versuchen.</div>
          )}
        </div>

        <input
          style={{ ...s.input, fontFamily: 'monospace', fontSize: 15, padding: '10px 12px' }}
          type="password"
          autoFocus
          placeholder="Passwort"
          value={pdfPwInput}
          onChange={e => setPdfPwInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && pdfPwInput && handlePwConfirm()}
        />

        {/* Compact save section */}
        <details style={{ marginTop: 12 }}>
          <summary style={{ fontSize: 12, color: 'var(--muted)', cursor: 'pointer', userSelect: 'none', padding: '4px 0' }}>
            Passwort merken (optional)
          </summary>
          <div style={{ marginTop: 10, padding: '12px 14px', background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)' }}>
            <label style={{ ...s.label, marginTop: 0 }}>Produktionsname</label>
            <input
              style={{ ...s.input, marginBottom: 10 }}
              type="text"
              placeholder="z.B. Sesam Film"
              value={pdfPwProduction}
              onChange={e => setPdfPwProduction(e.target.value)}
            />
            <label style={{ ...s.label }}>Passwortmuster <span style={{ fontWeight: 400, color: 'var(--hint)' }}>(optional, für wechselnde Passwörter)</span></label>
            <input
              style={{ ...s.input, fontFamily: 'monospace', marginBottom: 10 }}
              type="text"
              placeholder={`z.B. Sesam{MM}{YYYY} → "Sesam062025"`}
              value={pdfPwPattern}
              onChange={e => setPdfPwPattern(e.target.value)}
            />
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={pdfPwSave} onChange={e => setPdfPwSave(e.target.checked)} />
              Verschlüsselt speichern — nächstes Mal automatisch entsperren
            </label>
          </div>
        </details>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
          <button style={{ ...s.btn, ...s.btnGhost }} onClick={() => setPdfPwPrompt(null)}>Abbrechen</button>
          <button
            style={{ ...s.btn, ...s.btnPrimary, opacity: !pdfPwInput ? 0.5 : 1 }}
            disabled={!pdfPwInput}
            onClick={handlePwConfirm}
          >
            Entsperren &amp; importieren
          </button>
        </div>
      </div>
    </div>
  );

  /* ── Add/Edit Form Modal ─────────────────────────────────── */
  const renderForm = () => showForm && (
    <div style={s.overlay} onClick={closeForm}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 4 }}>
          {editId ? 'Abrechnung bearbeiten' : 'Neue Abrechnung'}
        </div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 2 }}>
          Trage den abgerechneten Betrag ein. Projekt und Name werden genutzt, um passende Stundenzettel zu finden.
        </div>

        <label style={s.label}>Datum der Abrechnung *</label>
        <input style={s.input} type="text" placeholder="TT.MM.JJJJ" value={form.datum}
          onChange={e => setForm(f => ({ ...f, datum: e.target.value }))} />

        <label style={s.label}>Betrag (€) *</label>
        <input style={s.input} type="text" placeholder="3.500,00" value={form.betrag}
          onChange={e => setForm(f => ({ ...f, betrag: e.target.value }))} />

        <label style={s.label}>Projekt</label>
        <input style={s.input} list="abr-projekt-list" placeholder="Projektname oder leer für alle" value={form.projekt}
          onChange={e => setForm(f => ({ ...f, projekt: e.target.value }))} />
        <datalist id="abr-projekt-list">
          {allProjects.map(p => <option key={p} value={p} />)}
        </datalist>

        <label style={s.label}>Person</label>
        <input style={s.input} list="abr-name-list" placeholder="Name oder leer für alle" value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        <datalist id="abr-name-list">
          {people.map(p => <option key={p} value={p} />)}
        </datalist>

        <label style={s.label}>Zeitraum</label>
        <div style={s.row}>
          <input style={s.input} type="text" placeholder="Von TT.MM.JJJJ" value={form.zeitraumVon}
            onChange={e => setForm(f => ({ ...f, zeitraumVon: e.target.value }))} />
          <input style={s.input} type="text" placeholder="Bis TT.MM.JJJJ" value={form.zeitraumBis}
            onChange={e => setForm(f => ({ ...f, zeitraumBis: e.target.value }))} />
        </div>

        <label style={s.label}>Beschreibung</label>
        <input style={s.input} type="text" placeholder="z.B. KW 10–12, Lohnabrechnung März" value={form.beschreibung}
          onChange={e => setForm(f => ({ ...f, beschreibung: e.target.value }))} />

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 22 }}>
          <button style={{ ...s.btn, ...s.btnGhost }} onClick={closeForm}>Abbrechen</button>
          <button
            style={{ ...s.btn, ...s.btnPrimary, opacity: (!form.datum || !form.betrag) ? 0.5 : 1 }}
            onClick={saveForm}
            disabled={!form.datum || !form.betrag}
          >
            {editId ? 'Speichern' : 'Hinzufügen'}
          </button>
        </div>
      </div>
    </div>
  );

  /* ── Root render ─────────────────────────────────────────── */
  return (
    <div
      style={{ ...s.wrap, position: 'relative' }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Global datalist for project quick-edit — always rendered */}
      <datalist id="abr-all-projekt-list">
        {allProjects.map(p => <option key={p} value={p} />)}
      </datalist>
      {/* Drop overlay */}
      {isDragOver && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 500,
          background: 'rgba(var(--p-500-rgb, 99,102,241), 0.12)',
          border: '3px dashed var(--p-500)',
          borderRadius: 12,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <div style={{ background: 'var(--card)', borderRadius: 12, padding: '20px 36px', boxShadow: 'var(--shadow-lg)', display: 'flex', gap: 12, alignItems: 'center', fontSize: 16, fontWeight: 600, color: 'var(--p-500)' }}>
            <Ico size={24}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></Ico>
            Abrechnung hier ablegen
          </div>
        </div>
      )}

      <div style={s.header}>
        <h1 style={s.title}>Abrechnungen</h1>
      </div>

      {renderJahr()}

      {renderForm()}
      {renderPwPrompt()}
      {renderDeleteConfirm()}
    </div>
  );
}

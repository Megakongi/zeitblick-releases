import React, { useState, useMemo, useCallback, useEffect } from 'react';

const POSITIONS = [
  'Oberbeleuchter', 'Best Boy', 'Beleuchter', 'Kameramann', 'Kameraassistent',
  'Tonmeister', 'Tonassistent', 'Regisseur', 'Aufnahmeleitung', 'Produktionsleitung',
  'Setaufnahmeleitung', 'Requisite', 'Maske', 'Kostüm', 'Szenenbildner',
  'Bühnenmeister', 'Grip', 'Caterer', 'Fahrer', 'Praktikant',
];

const DAY_NAMES = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(12, 0, 0, 0);
  return d;
}

function formatDateDE(date) {
  return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`;
}

function formatDateISO(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Color palette for member chips (deterministic hash-based)
const MEMBER_COLORS = [
  '#4a7dff','#8b5cf6','#06b6d4','#10b981','#f59e0b',
  '#f97316','#ef4444','#ec4899','#6366f1','#14b8a6',
];
function getMemberColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return MEMBER_COLORS[Math.abs(hash) % MEMBER_COLORS.length];
}
function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
const MONTH_NAMES_DE = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];

// ──────────────────────────────────────────────────
// Tab 1: Personen (Team Members)
// ──────────────────────────────────────────────────
// Helper: extract last name for sorting (last word of full name)
const getLastName = (name) => {
  const parts = (name || '').trim().split(/\s+/);
  return parts[parts.length - 1] || name || '';
};

/**
 * Erzeugt eine druckbare Personenliste (PDF) für ausgewählte Personen.
 * Enthält Name, Position, E-Mail, Telefon, Adresse – aber KEINE Spezials/Notizen.
 */
function generatePersonListHTML(members) {
  const esc = (s) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const lastName = (n) => { const p = String(n||'').trim().split(/\s+/); return p[p.length-1] || ''; };

  // Nach Position gruppieren, innerhalb alphabetisch nach Nachname
  const groups = {};
  for (const m of (members || [])) {
    const key = (m.position || '').trim() || 'Ohne Position';
    (groups[key] = groups[key] || []).push(m);
  }
  const groupNames = Object.keys(groups).sort((a, b) => {
    if (a === 'Ohne Position') return 1;
    if (b === 'Ohne Position') return -1;
    return a.localeCompare(b, 'de');
  });

  const rows = groupNames.map(gName => {
    const people = groups[gName].sort((a, b) => lastName(a.name).localeCompare(lastName(b.name), 'de'));
    const head = `<tr class="grp"><td colspan="5">${esc(gName)} <span class="grp-cnt">${people.length}</span></td></tr>`;
    const body = people.map(m => {
      const adresse = [m.strasse, [m.plz, m.ort].filter(Boolean).join(' ')].filter(Boolean).join(', ');
      return `<tr>
        <td class="name">${esc(m.name) || '—'}</td>
        <td>${esc(m.position) || '—'}</td>
        <td>${m.email ? `<a href="mailto:${esc(m.email)}">${esc(m.email)}</a>` : '—'}</td>
        <td class="nowrap">${esc(m.phone) || '—'}</td>
        <td>${esc(adresse) || '—'}</td>
      </tr>`;
    }).join('');
    return head + body;
  }).join('');

  const css = `
    *{margin:0;padding:0;box-sizing:border-box;}
    body{font-family:'Helvetica Neue',Arial,Helvetica,sans-serif;color:#1a1d23;padding:16mm 14mm;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
    .eyebrow{font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#b4bac3;}
    h1{font-size:22px;font-weight:800;letter-spacing:-.4px;margin-top:3px;}
    .sub{color:#6b7280;font-size:12px;margin-top:4px;margin-bottom:18px;}
    table{width:100%;border-collapse:collapse;font-size:11.5px;}
    thead th{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#6b7280;text-align:left;padding:0 10px 8px;border-bottom:1.5px solid #d3d8df;}
    tbody td{padding:10px 10px;border-bottom:1px solid #eceef1;vertical-align:top;}
    tbody td.name{font-weight:700;white-space:nowrap;}
    tbody td.nowrap{white-space:nowrap;}
    tbody tr.grp td{padding:14px 10px 6px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:#1f6feb;border-bottom:1.5px solid #d3d8df;}
    tbody tr.grp .grp-cnt{color:#b4bac3;font-weight:700;margin-left:4px;}
    a{color:#1f6feb;text-decoration:none;}
    .foot{margin-top:20px;font-size:9.5px;color:#b4bac3;display:flex;justify-content:space-between;border-top:1px solid #eceef1;padding-top:10px;}
    @page{size:A4 landscape;margin:0;}
  `;
  const today = new Date().toLocaleDateString('de-DE');
  return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><style>${css}</style></head><body>
    <div class="eyebrow">Team · Kontaktdaten</div>
    <h1>Personenübersicht</h1>
    <div class="sub">${(members || []).length} Person${(members||[]).length===1?'':'en'} · Exportiert am ${today}</div>
    <table>
      <thead><tr><th>Name</th><th>Position</th><th>E-Mail</th><th>Telefon</th><th>Adresse</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="foot"><span>Kontaktdaten-Abgleich</span><span>Erstellt mit ZeitBlick</span></div>
  </body></html>`;
}

function PersonenTab({ team, onTeamChange, timesheets, resolveName }) {
  const [editingId, setEditingId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [exporting, setExporting] = useState(false);
  const [form, setForm] = useState({ name: '', position: '', email: '', phone: '', strasse: '', plz: '', ort: '', spezials: '', notizen: '', isMe: false, sesamName: '', sesamVorname: '', sesamPasswort: '' });
  const [hasSesamPw, setHasSesamPw] = useState(false); // ob für die bearbeitete Person bereits ein Passwort gespeichert ist

  const knownPersons = useMemo(() => {
    if (!timesheets) return [];
    const teamNames = new Set((team || []).map(m => m.name.toLowerCase()));
    const names = new Set();
    for (const ts of timesheets) {
      const name = resolveName ? resolveName(ts.name || '') : (ts.name || '');
      if (name && !teamNames.has(name.toLowerCase())) names.add(name);
    }
    return [...names].sort();
  }, [timesheets, team, resolveName]);

  const knownPositions = useMemo(() => {
    const posSet = new Set(POSITIONS);
    if (timesheets) {
      for (const ts of timesheets) {
        if (ts.position) posSet.add(ts.position);
      }
    }
    return [...posSet].sort();
  }, [timesheets]);

  // Sort: favorites first, then by position hierarchy, then by last name
  const positionRank = useCallback((pos) => {
    const idx = POSITIONS.findIndex(p => p.toLowerCase() === (pos || '').trim().toLowerCase());
    // unbekannte/leere Positionen ans Ende
    return idx === -1 ? POSITIONS.length + 1 : idx;
  }, []);

  const filteredTeam = useMemo(() => {
    const list = !searchQuery.trim()
      ? [...(team || [])]
      : (team || []).filter(m =>
          m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (m.position || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
          (m.email || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
          (m.notizen || '').toLowerCase().includes(searchQuery.toLowerCase())
        );
    return list.sort((a, b) => {
      if (!!a.favorite !== !!b.favorite) return a.favorite ? -1 : 1;
      const pr = positionRank(a.position) - positionRank(b.position);
      if (pr !== 0) return pr;
      return getLastName(a.name).localeCompare(getLastName(b.name), 'de');
    });
  }, [team, searchQuery, positionRank]);

  const resetForm = useCallback(() => {
    setForm({ name: '', position: '', email: '', phone: '', strasse: '', plz: '', ort: '', spezials: '', notizen: '', isMe: false, sesamName: '', sesamVorname: '', sesamPasswort: '' });
    setHasSesamPw(false);
    setEditingId(null);
    setShowForm(false);
  }, []);

  const handleSave = useCallback(async () => {
    if (!form.name.trim()) return;
    const current = team || [];
    const existing = editingId ? current.find(m => m.id === editingId) : null;

    // Sesam-Passwort verschlüsseln (nur wenn neu eingegeben), sonst bestehendes behalten.
    let sesamPwEnc = existing ? existing.sesamPwEnc : undefined;
    if (form.sesamPasswort && form.sesamPasswort.trim()) {
      if (window.electronAPI && window.electronAPI.safeEncrypt) {
        const enc = await window.electronAPI.safeEncrypt(form.sesamPasswort);
        if (enc && enc.success) sesamPwEnc = enc.data;
      }
    }

    const { sesamPasswort, ...rest } = form;
    const fields = {
      ...rest,
      name: form.name.trim(),
      sesamName: (form.sesamName || '').trim(),
      sesamVorname: (form.sesamVorname || '').trim(),
      ...(sesamPwEnc ? { sesamPwEnc } : {}),
    };

    const clearOthers = (m) => (form.isMe ? { ...m, isMe: false } : m);
    let next;
    if (editingId) {
      next = current.map(m => m.id === editingId ? { ...m, ...fields } : clearOthers(m));
    } else {
      next = [...current.map(clearOthers), { id: generateId(), ...fields }];
    }
    onTeamChange(next);
    resetForm();
  }, [form, editingId, team, onTeamChange, resetForm]);

  const handleEdit = useCallback((member) => {
    setForm({ name: member.name, position: member.position || '', email: member.email || '', phone: member.phone || '', strasse: member.strasse || '', plz: member.plz || '', ort: member.ort || '', spezials: member.spezials || '', notizen: member.notizen || '', isMe: !!member.isMe, sesamName: member.sesamName || '', sesamVorname: member.sesamVorname || '', sesamPasswort: '' });
    setHasSesamPw(!!member.sesamPwEnc);
    setEditingId(member.id);
    setShowForm(true);
  }, []);

  const handleDelete = useCallback((id) => {
    onTeamChange((team || []).filter(m => m.id !== id));
  }, [team, onTeamChange]);

  const handleToggleFavorite = useCallback((id) => {
    onTeamChange((team || []).map(m => m.id === id ? { ...m, favorite: !m.favorite } : m));
  }, [team, onTeamChange]);

  const handleQuickAdd = useCallback((name) => {
    let position = '';
    if (timesheets) {
      const resolved = resolveName ? resolveName(name) : name;
      for (const ts of timesheets) {
        const tsName = resolveName ? resolveName(ts.name || '') : (ts.name || '');
        if (tsName === resolved && ts.position) { position = ts.position; break; }
      }
    }
    onTeamChange([...(team || []), { id: generateId(), name, position, email: '', phone: '', notizen: '' }]);
  }, [team, onTeamChange, timesheets, resolveName]);

  const toggleSelected = useCallback((id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleExportPersons = useCallback(async () => {
    const chosen = (team || []).filter(m => selectedIds.has(m.id));
    if (chosen.length === 0) return;
    chosen.sort((a, b) => getLastName(a.name).localeCompare(getLastName(b.name), 'de'));
    setExporting(true);
    try {
      const html = generatePersonListHTML(chosen);
      await window.electronAPI.exportPDF(html, `Personenübersicht_${chosen.length}`);
    } finally {
      setExporting(false);
    }
  }, [team, selectedIds]);

  return (
    <>
      <div className="team-header">
        <div className="team-header-left">
          <span className="team-count">{(team || []).length} Personen</span>
        </div>
        <div className="team-header-actions">
          <div className="team-search-wrap">
            <input type="text" className="team-search" placeholder="Suchen…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            {searchQuery && <button className="team-search-clear" onClick={() => setSearchQuery('')}>×</button>}
          </div>
          <button
            className={`btn ${selectMode ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => { setSelectMode(s => !s); setSelectedIds(new Set()); }}
          >
            {selectMode ? 'Auswahl beenden' : '☑ Auswählen'}
          </button>
          <button className="btn btn-primary" onClick={() => { resetForm(); setShowForm(true); }}>+ Person hinzufügen</button>
        </div>
      </div>

      {selectMode && (
        <div className="team-select-bar">
          <span className="team-select-count">{selectedIds.size} ausgewählt</span>
          <div className="team-select-actions">
            <button className="btn btn-secondary" onClick={() => setSelectedIds(new Set(filteredTeam.map(m => m.id)))}>Alle</button>
            <button className="btn btn-secondary" onClick={() => setSelectedIds(new Set())}>Keine</button>
            <button className="btn btn-primary" onClick={handleExportPersons} disabled={selectedIds.size === 0 || exporting}>
              ↓ {selectedIds.size > 0 ? `${selectedIds.size} ` : ''}Personen exportieren
            </button>
          </div>
        </div>
      )}

      {knownPersons.length > 0 && !showForm && (
        <div className="team-suggestions">
          <span className="team-suggestions-label">Aus Stundenzetteln bekannt:</span>
          <div className="team-suggestion-chips">
            {knownPersons.slice(0, 10).map(name => (
              <button key={name} className="team-suggestion-chip" onClick={() => handleQuickAdd(name)}>+ {name}</button>
            ))}
            {knownPersons.length > 10 && <span className="team-suggestion-more">+{knownPersons.length - 10} weitere</span>}
          </div>
        </div>
      )}

      {showForm && (
        <div className="team-form-card">
          <h3>{editingId ? 'Person bearbeiten' : 'Neue Person'}</h3>
          <div className="team-form-grid">
            <div className="team-form-field">
              <label>Name *</label>
              <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Vor- und Nachname" autoFocus list="team-name-suggestions" />
              {!editingId && knownPersons.length > 0 && (
                <datalist id="team-name-suggestions">{knownPersons.map(n => <option key={n} value={n} />)}</datalist>
              )}
            </div>
            <div className="team-form-field">
              <label>Position</label>
              <input type="text" value={form.position} onChange={e => setForm(f => ({ ...f, position: e.target.value }))} placeholder="z.B. Oberbeleuchter" list="team-position-suggestions" />
              <datalist id="team-position-suggestions">{knownPositions.map(p => <option key={p} value={p} />)}</datalist>
            </div>
            <div className="team-form-field">
              <label>E-Mail</label>
              <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@example.com" />
            </div>
            <div className="team-form-field">
              <label>Telefon</label>
              <input type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+49 …" />
            </div>
            <div className="team-form-field team-form-full">
              <label>Straße &amp; Hausnummer</label>
              <input type="text" value={form.strasse} onChange={e => setForm(f => ({ ...f, strasse: e.target.value }))} placeholder="z.B. Neusser Straße 739" />
            </div>
            <div className="team-form-field">
              <label>PLZ</label>
              <input type="text" value={form.plz} onChange={e => setForm(f => ({ ...f, plz: e.target.value }))} placeholder="z.B. 50737" />
            </div>
            <div className="team-form-field">
              <label>Ort</label>
              <input type="text" value={form.ort} onChange={e => setForm(f => ({ ...f, ort: e.target.value }))} placeholder="z.B. Köln" />
            </div>
            <div className="team-form-field team-form-full">
              <label className="team-form-checkbox">
                <input type="checkbox" checked={!!form.isMe} onChange={e => setForm(f => ({ ...f, isMe: e.target.checked }))} />
                <span>Das bin ich (Startadresse für Motiv-Entfernung)</span>
              </label>
            </div>

            <div className="team-form-field team-form-full">
              <div className="team-sesam-head">🔐 StdWeb-Login (Sesam) <span className="team-sesam-hint">– für die Stunden-Übertragung. Passwort wird verschlüsselt gespeichert.</span></div>
            </div>
            <div className="team-form-field">
              <label>Sesam Nachname</label>
              <input type="text" value={form.sesamName} onChange={e => setForm(f => ({ ...f, sesamName: e.target.value }))} placeholder="wie im StdWeb-Login" />
            </div>
            <div className="team-form-field">
              <label>Sesam Vorname</label>
              <input type="text" value={form.sesamVorname} onChange={e => setForm(f => ({ ...f, sesamVorname: e.target.value }))} placeholder="wie im StdWeb-Login" />
            </div>
            <div className="team-form-field team-form-full">
              <label>Sesam Passwort {hasSesamPw && <span className="team-sesam-saved">✓ gespeichert</span>}</label>
              <input type="password" value={form.sesamPasswort} onChange={e => setForm(f => ({ ...f, sesamPasswort: e.target.value }))} placeholder={hasSesamPw ? '•••••••• (leer lassen = unverändert)' : 'StdWeb-Passwort'} autoComplete="new-password" />
            </div>
            <div className="team-form-field team-form-full">
              <label>Spezials</label>
              <input type="text" value={form.spezials} onChange={e => setForm(f => ({ ...f, spezials: e.target.value }))} placeholder="z.B. Führerschein, Kran, Spezialgerät…" />
            </div>
            <div className="team-form-field team-form-full">
              <label>Notizen</label>
              <input type="text" value={form.notizen} onChange={e => setForm(f => ({ ...f, notizen: e.target.value }))} placeholder="z.B. Verfügbarkeit, Besonderheiten…" />
            </div>
          </div>
          <div className="team-form-actions">
            <button className="btn btn-secondary" onClick={resetForm}>Abbrechen</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={!form.name.trim()}>{editingId ? 'Speichern' : 'Hinzufügen'}</button>
          </div>
        </div>
      )}

      {filteredTeam.length === 0 ? (
        <div className="team-empty">
          {searchQuery ? 'Keine Personen gefunden.' : 'Noch keine Teammitglieder angelegt. Füge dein Team hinzu!'}
        </div>
      ) : (
        <div className="team-grid">
          {filteredTeam.map(member => (
            <div
              key={member.id}
              className={`team-card${member.favorite ? ' team-card-favorite' : ''}${selectMode ? ' team-card-selectable' : ''}${selectMode && selectedIds.has(member.id) ? ' team-card-selected' : ''}`}
              onClick={selectMode ? () => toggleSelected(member.id) : undefined}
            >
              {selectMode && (
                <span className={`team-card-checkbox${selectedIds.has(member.id) ? ' team-card-checkbox--on' : ''}`}>
                  {selectedIds.has(member.id) ? '✓' : ''}
                </span>
              )}
              <button
                className={`team-card-fav-btn${member.favorite ? ' team-card-fav-btn--active' : ''}`}
                onClick={(e) => { e.stopPropagation(); handleToggleFavorite(member.id); }}
                title={member.favorite ? 'Favorit entfernen' : 'Als Favorit markieren'}
                aria-label={member.favorite ? 'Favorit entfernen' : 'Als Favorit markieren'}
                style={selectMode ? { display: 'none' } : undefined}
              >
                {member.favorite ? '★' : '☆'}
              </button>
              <div className="team-card-avatar">{member.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}</div>
              <div className="team-card-info">
                <div className="team-card-name">{member.name}{member.isMe && <span className="team-card-me-badge" title="Deine Startadresse für die Motiv-Entfernung">Ich</span>}</div>
                {member.position && <div className="team-card-position">{member.position}</div>}
                <div className="team-card-meta">
                  {member.email && <span className="team-card-contact">✉ {member.email}</span>}
                  {member.phone && <span className="team-card-contact">☎ {member.phone}</span>}
                  {(member.strasse || member.ort) && <span className="team-card-contact">📍 {[member.strasse, [member.plz, member.ort].filter(Boolean).join(' ')].filter(Boolean).join(', ')}</span>}
                  {member.sesamPwEnc && <span className="team-card-contact" title="StdWeb-Login hinterlegt (verschlüsselt)">🔐 StdWeb</span>}
                </div>
                {member.spezials && <div className="team-card-notes">⭐ {member.spezials}</div>}
                {member.notizen && <div className="team-card-notes">{member.notizen}</div>}
              </div>
              {!selectMode && (
                <div className="team-card-actions">
                  <button className="btn-icon" onClick={() => handleEdit(member)} title="Bearbeiten">✏️</button>
                  <button className="btn-icon btn-icon-danger" onClick={() => handleDelete(member.id)} title="Entfernen">🗑</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ──────────────────────────────────────────────────
// Tab 2: Projektbesetzung (Project Staffing + Generation)
// ──────────────────────────────────────────────────
function ProjektbesetzungTab({ team, projects, staffing, onStaffingChange, timesheets, onCreateTimesheets }) {
  const [selectedProject, setSelectedProject] = useState('');
  const [addMemberId, setAddMemberId] = useState('');
  const [addVon, setAddVon] = useState('');
  const [addBis, setAddBis] = useState('');
  const [genWeek, setGenWeek] = useState(() => formatDateISO(getMonday(new Date())));
  const [genSelected, setGenSelected] = useState(new Set());
  const [genSuccess, setGenSuccess] = useState('');

  // Merge project names from settings AND from imported timesheets (same as Dashboard)
  const projectNames = useMemo(() => {
    const fromSettings = Object.keys(projects || {});
    const fromTimesheets = [...new Set((timesheets || []).map(ts => ts.projekt).filter(Boolean))];
    return [...new Set([...fromSettings, ...fromTimesheets])].sort();
  }, [projects, timesheets]);

  const currentStaff = useMemo(() => {
    if (!selectedProject || !staffing) return [];
    return staffing[selectedProject] || [];
  }, [selectedProject, staffing]);

  // Team members not yet staffed on this project
  const availableMembers = useMemo(() => {
    const staffedIds = new Set(currentStaff.map(s => s.memberId));
    return (team || []).filter(m => !staffedIds.has(m.id));
  }, [team, currentStaff]);

  const handleAddStaff = useCallback(() => {
    if (!addMemberId || !selectedProject) return;
    const member = (team || []).find(m => m.id === addMemberId);
    if (!member) return;
    const entry = {
      id: generateId(),
      memberId: member.id,
      name: member.name,
      position: member.position || '',
      von: addVon || '',
      bis: addBis || '',
    };
    const updated = { ...staffing, [selectedProject]: [...currentStaff, entry] };
    onStaffingChange(updated);
    setAddMemberId('');
    setAddVon('');
    setAddBis('');
  }, [addMemberId, addVon, addBis, selectedProject, team, staffing, currentStaff, onStaffingChange]);

  const handleRemoveStaff = useCallback((entryId) => {
    const updated = { ...staffing, [selectedProject]: currentStaff.filter(s => s.id !== entryId) };
    onStaffingChange(updated);
  }, [staffing, selectedProject, currentStaff, onStaffingChange]);

  const handleUpdateStaff = useCallback((entryId, field, value) => {
    const updated = {
      ...staffing,
      [selectedProject]: currentStaff.map(s => s.id === entryId ? { ...s, [field]: value } : s),
    };
    onStaffingChange(updated);
  }, [staffing, selectedProject, currentStaff, onStaffingChange]);

  // Find staff members active in the selected generation week
  const genMonday = useMemo(() => getMonday(new Date(genWeek + 'T12:00:00')), [genWeek]);
  const genSunday = useMemo(() => {
    const s = new Date(genMonday);
    s.setDate(s.getDate() + 6);
    return s;
  }, [genMonday]);

  const activeForWeek = useMemo(() => {
    return currentStaff.filter(s => {
      if (!s.von && !s.bis) return true; // no range = always active
      const von = s.von ? new Date(s.von + 'T00:00:00') : null;
      const bis = s.bis ? new Date(s.bis + 'T23:59:59') : null;
      if (von && genSunday < von) return false;
      if (bis && genMonday > bis) return false;
      return true;
    });
  }, [currentStaff, genMonday, genSunday]);

  // Initialize genSelected when activeForWeek changes
  useMemo(() => {
    setGenSelected(new Set(activeForWeek.map(s => s.id)));
  }, [activeForWeek.length, selectedProject, genWeek]);

  // Check which staff already have a timesheet for this week
  const existingForWeek = useMemo(() => {
    const weekStr = formatDateDE(genMonday);
    const found = new Set();
    if (!timesheets) return found;
    for (const ts of timesheets) {
      if (ts.projekt !== selectedProject) continue;
      const firstDay = ts.days && ts.days[0];
      if (firstDay && firstDay.datum === weekStr) found.add(ts.name);
    }
    return found;
  }, [timesheets, selectedProject, genMonday]);

  const handleGenerate = useCallback(() => {
    if (!selectedProject || genSelected.size === 0) return;
    const proj = (projects || {})[selectedProject] || {};
    const monday = getMonday(new Date(genWeek + 'T12:00:00'));
    const emptyDays = DAY_NAMES.map((tag, i) => {
      const date = new Date(monday);
      date.setDate(date.getDate() + i);
      return {
        tag, datum: formatDateDE(date),
        start: '', ende: '', pause: 0,
        stundenTotal: 0, ueberstunden25: 0, ueberstunden50: 0, ueberstunden100: 0,
        nacht25: 0, fahrzeit: 0, anmerkungen: '',
      };
    });
    const emptyTotals = { stundenTotal: 0, ueberstunden25: 0, ueberstunden50: 0, ueberstunden100: 0, nacht25: 0, fahrzeit: 0 };

    const sheets = [];
    for (const staff of activeForWeek) {
      if (!genSelected.has(staff.id)) continue;
      if (existingForWeek.has(staff.name)) continue;
      sheets.push({
        id: generateId(),
        importDate: new Date().toISOString(),
        createdManually: true,
        filePath: '',
        projekt: selectedProject,
        projektnummer: proj.projektnummer || '',
        produktionsfirma: proj.produktionsfirma || '',
        name: staff.name,
        position: staff.position,
        abteilung: '',
        pause: 0.75,
        days: emptyDays.map(d => ({ ...d })),
        totals: { ...emptyTotals },
      });
    }

    if (sheets.length > 0) {
      onCreateTimesheets(sheets);
      setGenSuccess(`${sheets.length} Stundenzettel erstellt für KW ${getKWNumber(monday)}`);
      setTimeout(() => setGenSuccess(''), 4000);
    }
  }, [selectedProject, genWeek, genSelected, activeForWeek, existingForWeek, projects, onCreateTimesheets]);

  return (
    <>
      {/* Project selector */}
      <div className="staffing-project-select">
        <label>Projekt auswählen:</label>
        <select value={selectedProject} onChange={e => setSelectedProject(e.target.value)}>
          <option value="">— Projekt wählen —</option>
          {projectNames.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {!selectedProject && (
        <div className="team-empty">
          {projectNames.length === 0
            ? 'Noch keine Projekte angelegt. Erstelle zuerst ein Projekt in der Übersicht.'
            : 'Wähle ein Projekt, um die Besetzung zu verwalten.'}
        </div>
      )}

      {selectedProject && (
        <>
          {/* Current staffing list */}
          <div className="staffing-section">
            <div className="staffing-section-header">
              <h3>Besetzung — {selectedProject}</h3>
              <span className="team-count">{currentStaff.length} Personen</span>
            </div>

            {currentStaff.length > 0 && (
              <div className="staffing-list">
                {currentStaff.map(staff => (
                  <div key={staff.id} className="staffing-row">
                    <div className="staffing-row-avatar">
                      {staff.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="staffing-row-info">
                      <span className="staffing-row-name">{staff.name}</span>
                      <span className="staffing-row-position">{staff.position || '—'}</span>
                    </div>
                    <div className="staffing-row-dates">
                      <input type="date" value={staff.von || ''} onChange={e => handleUpdateStaff(staff.id, 'von', e.target.value)} title="Von" />
                      <span className="staffing-date-sep">→</span>
                      <input type="date" value={staff.bis || ''} onChange={e => handleUpdateStaff(staff.id, 'bis', e.target.value)} title="Bis" />
                    </div>
                    <button className="btn-icon btn-icon-danger" onClick={() => handleRemoveStaff(staff.id)} title="Entfernen">🗑</button>
                  </div>
                ))}
              </div>
            )}

            {/* Add member */}
            {availableMembers.length > 0 && (
              <div className="staffing-add-row">
                <select value={addMemberId} onChange={e => setAddMemberId(e.target.value)}>
                  <option value="">+ Teammitglied hinzufügen…</option>
                  {availableMembers.map(m => (
                    <option key={m.id} value={m.id}>{m.name}{m.position ? ` (${m.position})` : ''}</option>
                  ))}
                </select>
                <input type="date" value={addVon} onChange={e => setAddVon(e.target.value)} placeholder="Von" title="Von" />
                <input type="date" value={addBis} onChange={e => setAddBis(e.target.value)} placeholder="Bis" title="Bis" />
                <button className="btn btn-primary" onClick={handleAddStaff} disabled={!addMemberId}>Hinzufügen</button>
              </div>
            )}
            {availableMembers.length === 0 && (team || []).length > 0 && currentStaff.length > 0 && (
              <p className="staffing-hint">Alle Teammitglieder sind bereits besetzt.</p>
            )}
            {(team || []).length === 0 && (
              <p className="staffing-hint">Lege zuerst Teammitglieder im Tab „Personen" an.</p>
            )}
          </div>

          {/* Phase 3: Stundenzettel Generation */}
          {currentStaff.length > 0 && (
            <div className="staffing-section staffing-generate">
              <div className="staffing-section-header">
                <h3>📋 Stundenzettel generieren</h3>
              </div>
              <div className="staffing-gen-controls">
                <div className="staffing-gen-week">
                  <label>Woche:</label>
                  <input type="date" value={genWeek} onChange={e => setGenWeek(e.target.value)} />
                  <span className="staffing-gen-week-label">
                    KW {getKWNumber(genMonday)} ({formatDateDE(genMonday)} – {formatDateDE(genSunday)})
                  </span>
                </div>
              </div>

              {activeForWeek.length === 0 ? (
                <p className="staffing-hint">Keine Besetzung aktiv für diese Woche.</p>
              ) : (
                <>
                  <div className="staffing-gen-list">
                    {activeForWeek.map(staff => {
                      const alreadyExists = existingForWeek.has(staff.name);
                      return (
                        <label key={staff.id} className={`staffing-gen-item${alreadyExists ? ' staffing-gen-exists' : ''}`}>
                          <input
                            type="checkbox"
                            checked={genSelected.has(staff.id) && !alreadyExists}
                            disabled={alreadyExists}
                            onChange={e => {
                              const next = new Set(genSelected);
                              if (e.target.checked) next.add(staff.id); else next.delete(staff.id);
                              setGenSelected(next);
                            }}
                          />
                          <span className="staffing-gen-name">{staff.name}</span>
                          <span className="staffing-gen-pos">{staff.position || '—'}</span>
                          {alreadyExists && <span className="staffing-gen-exists-badge">bereits vorhanden</span>}
                        </label>
                      );
                    })}
                  </div>
                  <div className="staffing-gen-actions">
                    {genSuccess && <span className="staffing-gen-success">✓ {genSuccess}</span>}
                    <button
                      className="btn btn-primary"
                      onClick={handleGenerate}
                      disabled={[...genSelected].filter(id => !existingForWeek.has((activeForWeek.find(s => s.id === id) || {}).name)).length === 0}
                    >
                      {(() => {
                        const count = [...genSelected].filter(id => !existingForWeek.has((activeForWeek.find(s => s.id === id) || {}).name)).length;
                        return count > 0 ? `${count} Stundenzettel erstellen` : 'Alle bereits vorhanden';
                      })()}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}

// ──────────────────────────────────────────────────
// Attendance Export HTML Generator
// ──────────────────────────────────────────────────
/**
 * Anwesenheits-Export als Timeline (Gantt-Stil).
 * scope: 'week' (KW des monthParam-Monatsanfangs ... besser: aktueller sichtbarer Monat erste Woche),
 *        'month' (ein Monat), 'range' (alle Monate mit Einträgen, je ein Block).
 * Farben: Blau = Zusatz, Rot = Vertretung. Vertretung zählt nicht als Zusatztag.
 */
function generateAttendanceHTML(calendarEntries, projektFilter, yearParam, monthParam, scope = 'month') {
  const ZUSATZ = '#4f46e5';
  const VERTRETUNG = '#E83A3A';
  const esc = (s) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const dayMs = 86400000;
  const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const fmtDM = (d) => `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.`;

  // Filter by project
  const filtered = {};
  for (const [date, arr] of Object.entries(calendarEntries || {})) {
    const f = (arr || []).filter(e => !projektFilter || (e.projekt || '') === projektFilter);
    if (f.length > 0) filtered[date] = f;
  }

  // Collect runs per person: { name, position, kind, start:Date, end:Date }
  // A run = consecutive days for same person+kind.
  function collectRuns(fromISO, toISO) {
    // Build person -> sorted day list within range
    const byPerson = {}; // name -> { position, days: { isoDay -> kind } }
    for (const [date, arr] of Object.entries(filtered)) {
      if (date < fromISO || date > toISO) continue;
      for (const en of arr) {
        if (!byPerson[en.name]) byPerson[en.name] = { position: en.position || '', days: {} };
        // vertretung wins for display kind on a day
        const k = en.kind === 'vertretung' ? 'vertretung' : 'zusatz';
        const prev = byPerson[en.name].days[date];
        byPerson[en.name].days[date] = prev === 'vertretung' ? 'vertretung' : k;
        if (en.position && !byPerson[en.name].position) byPerson[en.name].position = en.position;
      }
    }
    const runs = []; // { name, position, kind, start, end }
    for (const [name, info] of Object.entries(byPerson)) {
      const dates = Object.keys(info.days).sort();
      let cur = null;
      for (const ds of dates) {
        const d = new Date(ds + 'T12:00:00');
        const kind = info.days[ds];
        if (cur && cur.kind === kind && Math.round((d - cur.end) / dayMs) === 1) {
          cur.end = d;
        } else {
          if (cur) runs.push(cur);
          cur = { name, position: info.position, kind, start: d, end: d };
        }
      }
      if (cur) runs.push(cur);
    }
    return runs.sort((a, b) => a.name.localeCompare(b.name) || a.start - b.start);
  }

  // Render one timeline block for [from,to] inclusive Dates
  function timelineBlock(from, to, title) {
    const totalDays = Math.round((to - from) / dayMs) + 1;
    const fromISO = isoOf(from), toISO = isoOf(to);
    const runs = collectRuns(fromISO, toISO);

    // group runs by person (row), keep person order
    const persons = [];
    const rowsMap = {};
    for (const r of runs) {
      if (!rowsMap[r.name]) { rowsMap[r.name] = { position: r.position, runs: [] }; persons.push(r.name); }
      rowsMap[r.name].runs.push(r);
    }

    const showEvery = totalDays <= 31;

    // day header
    let days = '';
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(from.getTime() + i * dayMs);
      const wd = d.getDay(); const we = wd === 0 || wd === 6;
      const lbl = showEvery ? d.getDate() : (wd === 1 ? `${d.getDate()}.${d.getMonth()+1}.` : '');
      days += `<div class="d ${we?'we':''}">${lbl}</div>`;
    }

    let totalZusatz = 0, totalVert = 0;
    let rowsHtml = '';
    for (const name of persons) {
      const { position, runs: pruns } = rowsMap[name];
      let bars = '';
      let cnt = 0;
      // weekend shading track
      let track = '';
      for (let i = 0; i < totalDays; i++) {
        const d = new Date(from.getTime() + i * dayMs); const wd = d.getDay();
        track += `<div class="${wd===0||wd===6?'wecol':''}"></div>`;
      }
      for (const r of pruns) {
        const cs = r.start < from ? from : r.start;
        const ce = r.end > to ? to : r.end;
        const span = Math.round((ce - cs) / dayMs) + 1;
        if (r.kind === 'vertretung') totalVert += span; else { cnt += span; totalZusatz += span; }
        const offset = Math.round((cs - from) / dayMs);
        const left = (offset / totalDays * 100).toFixed(3);
        const width = (span / totalDays * 100).toFixed(3);
        const c = r.kind === 'vertretung' ? VERTRETUNG : ZUSATZ;
        const label = span >= 2 ? `${fmtDM(cs)}–${fmtDM(ce)}` : fmtDM(cs);
        const fitsInside = showEvery && span >= (span >= 2 ? 4 : 2);
        const inner = fitsInside ? esc(label) : '';
        const ext = fitsInside ? '' : `<span class="ext">${esc(label)}</span>`;
        bars += `<div class="tl-bar ${r.kind==='vertretung'?'vert':''}" style="left:${left}%;width:${width}%;background:${c}" title="${esc(name)} · ${esc(label)} · ${r.kind==='vertretung'?'Vertretung':'Zusatz'}">${inner}${ext}</div>`;
      }
      rowsHtml += `<div class="tl-row"><div class="nh">${esc(name)}${position?`<span class="pos">${esc(position)}</span>`:''}</div><div class="tl-track" style="grid-template-columns:repeat(${totalDays},1fr)">${track}${bars}</div><div class="tl-sum">${cnt}</div></div>`;
    }
    if (persons.length === 0) {
      rowsHtml = `<div class="tl-empty">Keine Einträge in diesem Zeitraum.</div>`;
    }

    let summary = `${totalZusatz} Zusatztage`;
    if (totalVert > 0) summary += ` · ${totalVert} Vertretungstag${totalVert>1?'e':''}`;

    return `<div class="exp-section">
      <div class="exp-month"><span>${esc(title)}</span><span class="cnt">${summary}</span></div>
      <div class="tl">
        <div class="tl-head"><div class="nh">Person</div><div class="days" style="grid-template-columns:repeat(${totalDays},1fr)">${days}</div><div class="tl-sum tl-sum--head">Tage</div></div>
        ${rowsHtml}
      </div>
    </div>`;
  }

  // Determine blocks + title based on scope
  let blocks = '';
  let headTitle = '';
  if (scope === 'week') {
    // first ISO-Monday on/after monthParam start, containing visible month; use the week of the 1st
    const first = new Date(yearParam, monthParam, 1);
    const dow = first.getDay() || 7;
    const monday = new Date(first); monday.setDate(first.getDate() - (dow - 1));
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
    const kw = getKWNumber(monday);
    headTitle = `KW ${kw} · ${fmtDM(monday)}–${fmtDM(sunday)}${sunday.getFullYear()}`;
    blocks = timelineBlock(monday, sunday, `KW ${kw} · ${fmtDM(monday)}–${fmtDM(sunday)}${sunday.getFullYear()}`);
  } else if (scope === 'range') {
    const dates = Object.keys(filtered).sort();
    if (dates.length === 0) {
      blocks = `<div class="tl-empty">Keine Einträge vorhanden.</div>`;
      headTitle = 'Gesamter Zeitraum';
    } else {
      const months = [];
      const seen = new Set();
      for (const d of dates) {
        const [y, m] = d.split('-').map(Number);
        const key = `${y}-${String(m).padStart(2,'0')}`;
        if (!seen.has(key)) { seen.add(key); months.push({ y, m: m - 1 }); }
      }
      months.sort((a,b) => a.y - b.y || a.m - b.m);
      const fM = months[0], lM = months[months.length-1];
      headTitle = `${MONTH_NAMES_DE[fM.m]} ${fM.y} – ${MONTH_NAMES_DE[lM.m]} ${lM.y}`;
      for (const { y, m } of months) {
        const from = new Date(y, m, 1);
        const to = new Date(y, m + 1, 0);
        blocks += timelineBlock(from, to, `${MONTH_NAMES_DE[m]} ${y}`);
      }
    }
  } else { // month
    const from = new Date(yearParam, monthParam, 1);
    const to = new Date(yearParam, monthParam + 1, 0);
    headTitle = `${MONTH_NAMES_DE[monthParam]} ${yearParam}`;
    blocks = timelineBlock(from, to, headTitle);
  }

  const css = `
    *{margin:0;padding:0;box-sizing:border-box;}
    body{font-family:'Helvetica Neue',Arial,Helvetica,sans-serif;color:#1a1d23;padding:16mm 14mm;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
    .eyebrow{font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#b4bac3;}
    h1{font-size:22px;font-weight:800;letter-spacing:-.4px;margin-top:3px;}
    .sub{color:#6b7280;font-size:12px;margin-top:4px;}
    .exp-section{margin-top:22px;page-break-inside:avoid;}
    .exp-month{font-size:14px;font-weight:800;padding-bottom:6px;border-bottom:2px solid #1a1d23;display:flex;justify-content:space-between;align-items:baseline;}
    .exp-month .cnt{font-size:11px;font-weight:600;color:#6b7280;}
    .tl{margin-top:8px;--name-w:160px;}
    .tl-head{display:flex;align-items:flex-end;height:22px;border-bottom:1.5px solid #d3d8df;margin-bottom:4px;}
    .tl-head .nh{width:var(--name-w);font-size:8.5px;font-weight:700;text-transform:uppercase;color:#6b7280;letter-spacing:.3px;}
    .days{flex:1;display:grid;}
    .days .d{font-size:8px;text-align:center;color:#6b7280;font-weight:600;padding-bottom:3px;}
    .days .d.we{color:#c5cad2;}
    .tl-row{display:flex;align-items:center;height:30px;border-bottom:1px solid #f0f1f4;}
    .tl-row .nh{width:var(--name-w);font-size:11.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-right:10px;display:flex;align-items:center;gap:8px;}
    .tl-row .nh .pos{font-size:9.5px;color:#b4bac3;font-weight:500;}
    .tl-track{flex:1;display:grid;position:relative;height:100%;}
    .tl-track .wecol{background:#fafbfc;}
    .tl-bar{position:absolute;top:6px;height:18px;border-radius:5px;display:flex;align-items:center;color:#fff;font-size:9px;font-weight:700;padding:0 7px;white-space:nowrap;overflow:visible;}
    .tl-bar.vert{background-image:repeating-linear-gradient(45deg,rgba(255,255,255,.28) 0 4px,transparent 4px 8px);}
    .tl-bar .ext{position:absolute;left:calc(100% + 5px);color:#5b616b;font-size:9px;font-weight:600;white-space:nowrap;}
    .tl-sum{width:46px;text-align:right;font-weight:800;color:#4f46e5;font-size:11px;}
    .tl-sum--head{font-size:8.5px;font-weight:700;color:#6b7280;text-transform:uppercase;}
    .tl-empty{padding:14px 4px;color:#b4bac3;font-size:11px;}
    .legend{display:flex;gap:18px;margin-top:18px;font-size:10px;color:#6b7280;align-items:center;}
    .legend .sw{display:inline-block;width:22px;height:11px;border-radius:4px;vertical-align:middle;margin-right:6px;}
    .legend .sw.vert{background-image:repeating-linear-gradient(45deg,rgba(255,255,255,.4) 0 4px,transparent 4px 8px);}
    @page{size:A4 landscape;margin:0;}
  `;

  const today = new Date().toLocaleDateString('de-DE');
  return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><style>${css}</style></head><body>
    <div class="eyebrow">Zusatzpersonal · Anwesenheit</div>
    <h1>Anwesenheitsübersicht</h1>
    <div class="sub">${projektFilter ? 'Projekt: ' + esc(projektFilter) + ' · ' : ''}${esc(headTitle)} · Exportiert am ${today}</div>
    ${blocks}
    <div class="legend">
      <span><span class="sw" style="background:${ZUSATZ}"></span>Zusatz</span>
      <span><span class="sw vert" style="background:${VERTRETUNG}"></span>Vertretung</span>
      <span style="margin-left:auto;color:#b4bac3">Erstellt mit ZeitBlick</span>
    </div>
  </body></html>`;
}

/**
 * Erzeugt eine Personalübersicht als Mail-Text für einen Wochenbereich.
 * Format orientiert sich an der manuellen Mail an die Produktion:
 *   KW xx
 *   <Datum>:
 *   <Name> (<Position>)
 *   <Straße>
 *   <PLZ Ort>
 *   <E-Mail>
 *   <Telefon>
 * Tage ohne Personen werden mit „—" markiert. Vertretungen werden gekennzeichnet.
 *
 * @returns {{ subject: string, body: string }}
 */
function buildPersonnelReport(calendarEntries, team, projektFilter, fromMonday, toSunday) {
  const dayMs = 86400000;
  const WD = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];
  const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const teamByName = new Map((team || []).map(m => [m.name.toLowerCase(), m]));

  // KW range for subject
  const kwFrom = getKWNumber(fromMonday);
  const kwTo = getKWNumber(toSunday);
  const kwLabel = kwFrom === kwTo ? `KW ${kwFrom}` : `KW ${kwFrom}/${kwTo}`;
  const subject = `Zusatzpersonal ${kwLabel}`;

  const lines = [];
  lines.push('Hallo Zusammen,');
  lines.push('');
  lines.push('hier die Personalübersicht für den kommenden Zeitraum.');
  lines.push('');

  let curKW = null;
  for (let t = fromMonday.getTime(); t <= toSunday.getTime(); t += dayMs) {
    const d = new Date(t);
    const kw = getKWNumber(d);
    if (kw !== curKW) {
      curKW = kw;
      lines.push(`KW ${kw}`);
      lines.push('');
    }
    const iso = isoOf(d);
    const dd = `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.`;
    lines.push(`${dd} (${WD[d.getDay()]}):`);

    const entries = (calendarEntries[iso] || []).filter(e => !projektFilter || (e.projekt || '') === projektFilter);
    if (entries.length === 0) {
      lines.push('—');
    } else {
      entries.forEach(en => {
        const m = teamByName.get((en.name || '').toLowerCase());
        const pos = en.position || (m && m.position) || '';
        const kindTag = en.kind === 'vertretung' ? ' – Vertretung' : '';
        lines.push(`${en.name}${pos ? ` (${pos})` : ''}${kindTag}`);
        if (m) {
          if (m.strasse) lines.push(m.strasse);
          const cityLine = [m.plz, m.ort].filter(Boolean).join(' ');
          if (cityLine) lines.push(cityLine);
          if (m.email) lines.push(m.email);
          if (m.phone) lines.push(m.phone);
        }
        lines.push('');
      });
    }
    lines.push('');
  }

  lines.push('Liebe Grüße');
  const body = lines.join('\n').replace(/\n{3,}/g, '\n\n');
  return { subject, body };
}

// ──────────────────────────────────────────────────
// Tab 3: Kalender (Drag-Drop Calendar Planning)
// ──────────────────────────────────────────────────
function KalenderTab({ team, calendarEntries, onCalendarChange, projects }) {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth());
  const [dragInfo, setDragInfo] = useState(null);
  const [dragOverDate, setDragOverDate] = useState(null);
  const [selectedProject, setSelectedProject] = useState('');
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState('');
  const [exportScope, setExportScope] = useState('month'); // 'week' | 'month' | 'range'
  const [showReport, setShowReport] = useState(false);
  const [reportFrom, setReportFrom] = useState(() => formatDateISO(getMonday(new Date())));
  const [reportTo, setReportTo] = useState(() => {
    const m = getMonday(new Date()); m.setDate(m.getDate() + 6); return formatDateISO(m);
  });
  const projectNames = useMemo(() => Object.keys(projects || {}).sort(), [projects]);

  const filteredTeam = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = !q ? [...(team || [])]
      : (team || []).filter(m => m.name.toLowerCase().includes(q) || (m.position || '').toLowerCase().includes(q));
    const rank = (pos) => {
      const idx = POSITIONS.findIndex(p => p.toLowerCase() === (pos || '').trim().toLowerCase());
      return idx === -1 ? POSITIONS.length + 1 : idx;
    };
    return list.sort((a, b) => {
      const pr = rank(a.position) - rank(b.position);
      if (pr !== 0) return pr;
      return getLastName(a.name).localeCompare(getLastName(b.name), 'de');
    });
  }, [team, search]);

  const goToToday = useCallback(() => {
    const now = new Date();
    setYear(now.getFullYear());
    setMonth(now.getMonth());
  }, []);

  const goToPrevMonth = useCallback(() => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  }, [month]);

  const goToNextMonth = useCallback(() => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  }, [month]);

  const todayISO = useMemo(() => formatDateISO(new Date()), []);

  const calendarDays = useMemo(() => {
    const days = [];
    const firstOfMonth = new Date(year, month, 1);
    const lastOfMonth = new Date(year, month + 1, 0);
    const start = new Date(firstOfMonth);
    const dow = start.getDay();
    start.setDate(start.getDate() - (dow === 0 ? 6 : dow - 1));
    const end = new Date(lastOfMonth);
    const dowEnd = end.getDay();
    if (dowEnd !== 0) end.setDate(end.getDate() + (7 - dowEnd));
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const iso = formatDateISO(d);
      const wd = d.getDay();
      days.push({ iso, num: d.getDate(), isCurrentMonth: d.getMonth() === month, isWeekend: wd === 0 || wd === 6, isToday: iso === todayISO });
    }
    return days;
  }, [year, month, todayISO]);

  // Only show entries tagged for the selected project (untagged entries visible when 'Alle')
  const filteredEntries = useMemo(() => {
    if (!selectedProject) return calendarEntries || {};
    const result = {};
    for (const [date, arr] of Object.entries(calendarEntries || {})) {
      const f = (arr || []).filter(e => (e.projekt || '') === selectedProject);
      if (f.length > 0) result[date] = f;
    }
    return result;
  }, [calendarEntries, selectedProject]);

  // Zusatztage: Vertretungen werden NICHT mitgezählt
  const zusatzTageCount = useMemo(() =>
    Object.values(filteredEntries).reduce((s, a) =>
      s + (Array.isArray(a) ? a.filter(e => e.kind !== 'vertretung').length : 0), 0),
  [filteredEntries]);

  const handleDragStart = useCallback((e, info) => {
    e.dataTransfer.setData('application/json', JSON.stringify(info));
    e.dataTransfer.effectAllowed = 'move';
    setDragInfo(info);
  }, []);

  const handleDragOver = useCallback((e, dateISO) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverDate(dateISO);
  }, []);

  const handleDragLeave = useCallback((e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setDragOverDate(null);
  }, []);

  const handleDrop = useCallback((e, targetDateISO) => {
    e.preventDefault();
    e.stopPropagation();
    let info = dragInfo;
    if (!info) {
      try { info = JSON.parse(e.dataTransfer.getData('application/json')); } catch { return; }
    }
    if (!info) return;
    const updated = { ...(calendarEntries || {}) };
    if (info.type === 'new') {
      const { member } = info;
      updated[targetDateISO] = [...(updated[targetDateISO] || []), { id: generateId(), memberId: member.id, name: member.name, position: member.position || '', projekt: selectedProject }];
    } else if (info.type === 'existing') {
      if (info.dateISO === targetDateISO) { setDragInfo(null); setDragOverDate(null); return; }
      const srcEntries = [...(updated[info.dateISO] || [])];
      const idx = srcEntries.findIndex(en => en.id === info.entryId);
      if (idx < 0) { setDragInfo(null); setDragOverDate(null); return; }
      const [entry] = srcEntries.splice(idx, 1);
      updated[info.dateISO] = srcEntries;
      updated[targetDateISO] = [...(updated[targetDateISO] || []), entry];
    }
    onCalendarChange(updated);
    setDragInfo(null);
    setDragOverDate(null);
  }, [dragInfo, calendarEntries, onCalendarChange, selectedProject]);

  const handleDragEnd = useCallback(() => { setDragInfo(null); setDragOverDate(null); }, []);

  const handleExport = useCallback(async (scope) => {
    setExporting(true);
    try {
      const html = generateAttendanceHTML(calendarEntries, selectedProject, year, month, scope);
      const proj = selectedProject || 'Alle';
      let name;
      if (scope === 'week') name = `Anwesenheit_${proj}_KW${getKWNumber(new Date(year, month, 1))}_${year}`;
      else if (scope === 'range') name = `Anwesenheit_${proj}_Zeitraum`;
      else name = `Anwesenheit_${proj}_${MONTH_NAMES_DE[month]}_${year}`;
      await window.electronAPI.exportPDF(html, name);
    } finally {
      setExporting(false);
    }
  }, [calendarEntries, selectedProject, year, month]);

  const handleRemoveEntry = useCallback((dateISO, entryId) => {
    const updated = { ...(calendarEntries || {}) };
    updated[dateISO] = (updated[dateISO] || []).filter(en => en.id !== entryId);
    onCalendarChange(updated);
  }, [calendarEntries, onCalendarChange]);

  // Personalbericht (Mail-Text) für gewählten Wochenbereich
  const report = useMemo(() => {
    const from = getMonday(new Date(reportFrom + 'T12:00:00'));
    let to = new Date(reportTo + 'T12:00:00');
    // auf Sonntag der gewählten Woche normalisieren
    to = getMonday(to); to.setDate(to.getDate() + 6);
    if (to < from) return null;
    return buildPersonnelReport(calendarEntries, team, selectedProject, from, to);
  }, [reportFrom, reportTo, calendarEntries, team, selectedProject]);

  const handleOpenMail = useCallback(() => {
    if (!report) return;
    const url = `mailto:?subject=${encodeURIComponent(report.subject)}&body=${encodeURIComponent(report.body)}`;
    window.location.href = url;
  }, [report]);

  const handleCopyReport = useCallback(async () => {
    if (!report) return;
    try { await navigator.clipboard.writeText(report.body); } catch { /* ignore */ }
  }, [report]);

  return (
    <div className="kalender-container">
      {/* Top bar: project selector + export */}
      <div className="kalender-topbar">
        <div className="kalender-project-select">
          <label className="kalender-project-label">Projekt:</label>
          <select className="kalender-project-dropdown" value={selectedProject} onChange={e => setSelectedProject(e.target.value)}>
            <option value="">Alle Projekte</option>
            {projectNames.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="kalender-export-actions">
          <div className="kalender-scope-seg">
            <button className={exportScope === 'week' ? 'active' : ''} onClick={() => setExportScope('week')}>Woche</button>
            <button className={exportScope === 'month' ? 'active' : ''} onClick={() => setExportScope('month')}>Monat</button>
            <button className={exportScope === 'range' ? 'active' : ''} onClick={() => setExportScope('range')}>Zeitraum</button>
          </div>
          <button className="btn btn-primary kalender-export-btn" onClick={() => handleExport(exportScope)} disabled={exporting}>
            Exportieren
          </button>
          <button className="btn btn-secondary kalender-export-btn" onClick={() => setShowReport(s => !s)}>
            ✉ Personal-Mail
          </button>
        </div>
      </div>

      {showReport && (
        <div className="kalender-report">
          <div className="kalender-report-head">
            <div className="kalender-report-title">Personalübersicht als Mail</div>
            <button className="kalender-report-close" onClick={() => setShowReport(false)}>×</button>
          </div>
          <div className="kalender-report-controls">
            <div className="kalender-report-field">
              <label>Von (Woche)</label>
              <input type="date" value={reportFrom} onChange={e => setReportFrom(e.target.value)} />
            </div>
            <div className="kalender-report-field">
              <label>Bis (Woche)</label>
              <input type="date" value={reportTo} onChange={e => setReportTo(e.target.value)} />
            </div>
            <div className="kalender-report-actions">
              <button className="btn btn-secondary" onClick={handleCopyReport} disabled={!report}>Text kopieren</button>
              <button className="btn btn-primary" onClick={handleOpenMail} disabled={!report}>✉ In Mail öffnen</button>
            </div>
          </div>
          {report ? (
            <>
              <div className="kalender-report-subject">Betreff: <strong>{report.subject}</strong></div>
              <pre className="kalender-report-preview">{report.body}</pre>
            </>
          ) : (
            <div className="kalender-report-empty">Bitte einen gültigen Zeitraum wählen (Bis ≥ Von).</div>
          )}
        </div>
      )}
      <div className="kalender-layout">
        {/* Left: team member drag sources */}
        <div className="kalender-sidebar">
          <div className="kalender-sidebar-head">
            <div className="kalender-sidebar-title">Team</div>
            <div className="kalender-sidebar-sub">Person in einen Tag ziehen</div>
          </div>
          <div className="kalender-search">
            <span className="kalender-search-ic">⌕</span>
            <input
              type="text"
              placeholder="Person suchen…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="kalender-roster">
            {(team || []).length === 0 ? (
              <div className="kalender-sidebar-empty">Kein Team angelegt.<br />Füge Mitglieder im Tab „Personen" hinzu.</div>
            ) : filteredTeam.length === 0 ? (
              <div className="kalender-sidebar-empty">Keine Person gefunden.</div>
            ) : filteredTeam.map(member => {
              const color = getMemberColor(member.name);
              return (
                <div
                  key={member.id}
                  className="kalender-member-row"
                  draggable
                  onDragStart={e => handleDragStart(e, { type: 'new', member })}
                  onDragEnd={handleDragEnd}
                  title={`${member.name}${member.position ? ` – ${member.position}` : ''} — in Kalender ziehen`}
                >
                  <span className="kalender-member-avatar" style={{ background: hexToRgba(color, 0.15), color }}>
                    {member.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                  </span>
                  <div className="kalender-member-info">
                    <span className="kalender-member-name">{member.name}</span>
                    {member.position && <span className="kalender-member-pos">{member.position}</span>}
                  </div>
                  <span className="kalender-member-grip">⋮⋮</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: calendar */}
        <div className="kalender-main">
          <div className="kalender-header">
            <div className="kalender-nav">
              <button className="kalender-nav-btn" onClick={goToPrevMonth}>‹</button>
              <button className="kalender-nav-btn" onClick={goToNextMonth}>›</button>
              <span className="kalender-month-label">{MONTH_NAMES_DE[month]} <span className="kalender-month-year">{year}</span></span>
              <button className="kalender-today-btn" onClick={goToToday}>Heute</button>
            </div>
            <div className="kalender-badge">
              <span className="kalender-badge-label">Verplante Zusatztage</span>
              <span className="kalender-badge-count">{zusatzTageCount}</span>
            </div>
          </div>

          <div className="kalender-grid">
            {['Mo','Di','Mi','Do','Fr','Sa','So'].map(d => (
              <div key={d} className="kalender-wday">{d}</div>
            ))}
            {calendarDays.map(day => {
              const entries = filteredEntries[day.iso] || [];
              return (
                <div
                  key={day.iso}
                  className={['kalender-day', !day.isCurrentMonth && 'kalender-day--other', day.isWeekend && 'kalender-day--weekend', day.isToday && 'kalender-day--today', dragOverDate === day.iso && 'kalender-day--over'].filter(Boolean).join(' ')}
                  onDragOver={e => handleDragOver(e, day.iso)}
                  onDragLeave={handleDragLeave}
                  onDrop={e => handleDrop(e, day.iso)}
                >
                  <div className="kalender-day-num"><span className={day.isToday ? 'kalender-day-num--today' : ''}>{day.num}</span></div>
                  <div className="kalender-day-chips">
                    {entries.map(entry => {
                      const color = getMemberColor(entry.name);
                      // Nachbartage prüfen → durchgehender Balken (Apple-Kalender-Stil)
                      const shift = (iso, delta) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + delta); return formatDateISO(d); };
                      const sameRun = (iso) => (filteredEntries[iso] || []).some(e => e.name === entry.name && (e.projekt || '') === (entry.projekt || '') && (e.kind || 'zusatz') === (entry.kind || 'zusatz'));
                      const contPrev = sameRun(shift(day.iso, -1));
                      const contNext = sameRun(shift(day.iso, 1));
                      const isWeekStart = new Date(day.iso + 'T12:00:00').getDay() === 1; // Montag
                      const showLabel = !contPrev || isWeekStart;
                      const isVertretung = entry.kind === 'vertretung';
                      const barColor = isVertretung ? '#E83A3A' : color;
                      // continuing segments bleed 1px over cell border for a seamless run
                      const roundL = !contPrev;
                      const roundR = !contNext;
                      return (
                        <div
                          key={entry.id}
                          className={`kalender-chip kalender-chip--bar${roundL ? ' kalender-chip--r-l' : ''}${roundR ? ' kalender-chip--r-r' : ''}${isVertretung ? ' kalender-chip--vertretung' : ''}`}
                          draggable
                          onDragStart={e => handleDragStart(e, { type: 'existing', dateISO: day.iso, entryId: entry.id })}
                          onDragEnd={handleDragEnd}
                          title={`${entry.name}${entry.position ? ` – ${entry.position}` : ''}${entry.projekt ? ` · ${entry.projekt}` : ''}${isVertretung ? ' · Vertretung' : ' · Zusatz'}`}
                          style={{
                            background: barColor,
                            marginLeft: contPrev ? '-1px' : '0',
                            marginRight: contNext ? '-1px' : '0',
                          }}
                        >
                          {showLabel ? (
                            <span className="kalender-chip-label">{entry.name}</span>
                          ) : (
                            <span className="kalender-chip-label" style={{ opacity: 0 }}>·</span>
                          )}
                          {roundR && (
                            <button
                              className="kalender-chip-remove"
                              onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }}
                              onClick={e => { e.stopPropagation(); handleRemoveEntry(day.iso, entry.id); }}
                            >×</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// Simple KW calculation (ISO week number)
function getKWNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

// ──────────────────────────────────────────────────
// Tab: Projekte (Projektverwaltung)
// ──────────────────────────────────────────────────
function ProjekteTab({ projects, onProjectsChange, onMergeProjects, timesheets, completedProjects = {}, onToggleProjectComplete }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', kuerzel: '', projektnummer: '', produktionsfirma: '', drehStartDatum: '' });
  const [editingName, setEditingName] = useState(null);
  const [showMerge, setShowMerge] = useState(false);
  const [mergeSource, setMergeSource] = useState('');
  const [mergeTarget, setMergeTarget] = useState('');
  const [mergeConfirm, setMergeConfirm] = useState(false);

  // Merge project names from settings AND imported timesheets
  const projectEntries = useMemo(() => {
    const map = { ...(projects || {}) };
    for (const ts of (timesheets || [])) {
      const p = ts.projekt;
      if (p && !map[p]) map[p] = {};
    }
    return Object.entries(map).sort((a, b) => {
      const aDone = !!completedProjects[a[0]];
      const bDone = !!completedProjects[b[0]];
      if (aDone !== bDone) return aDone ? 1 : -1;
      return a[0].localeCompare(b[0], 'de');
    });
  }, [projects, timesheets, completedProjects]);

  const resetForm = () => {
    setForm({ name: '', kuerzel: '', projektnummer: '', produktionsfirma: '', drehStartDatum: '' });
    setEditingName(null);
    setShowForm(false);
  };

  const handleSave = () => {
    const name = form.name.trim();
    if (!name) return;
    const current = { ...(projects || {}) };
    if (editingName && editingName !== name) delete current[editingName];
    current[name] = {
      ...(current[name] || {}),
      kuerzel: form.kuerzel.trim(),
      projektnummer: form.projektnummer.trim(),
      produktionsfirma: form.produktionsfirma.trim(),
      drehStartDatum: form.drehStartDatum,
    };
    onProjectsChange(current);
    resetForm();
  };

  const handleEdit = (name, data) => {
    setForm({ name, kuerzel: data.kuerzel || '', projektnummer: data.projektnummer || '', produktionsfirma: data.produktionsfirma || '', drehStartDatum: data.drehStartDatum || '' });
    setEditingName(name);
    setShowForm(true);
  };

  const handleDelete = (name) => {
    const current = { ...(projects || {}) };
    delete current[name];
    onProjectsChange(current);
  };

  return (
    <>
      <div className="team-header">
        <div className="team-header-left">
          <span className="team-count">{projectEntries.length} Projekte</span>
        </div>
        <div className="team-header-actions">
          {projectEntries.length > 1 && (
            <button className="btn btn-secondary" onClick={() => { setShowMerge(s => !s); setMergeSource(''); setMergeTarget(''); }}>🔀 Zusammenführen</button>
          )}
          <button className="btn btn-primary" onClick={() => { resetForm(); setShowForm(true); }}>+ Projekt anlegen</button>
        </div>
      </div>

      {showMerge && (
        <div className="team-form-card">
          <h3>Projekte zusammenführen</h3>
          <p className="staffing-hint">Alle Stundenzettel und die Stammcrew des Quell-Projekts werden ins Ziel-Projekt übernommen. Das Quell-Projekt wird danach entfernt.</p>
          <div className="team-form-grid">
            <div className="team-form-field">
              <label>Quelle (wird entfernt)</label>
              <select value={mergeSource} onChange={e => setMergeSource(e.target.value)}>
                <option value="">— wählen —</option>
                {projectEntries.map(([n]) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div className="team-form-field">
              <label>Ziel (bleibt bestehen)</label>
              <select value={mergeTarget} onChange={e => setMergeTarget(e.target.value)}>
                <option value="">— wählen —</option>
                {projectEntries.filter(([n]) => n !== mergeSource).map(([n]) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>
          <div className="team-form-actions">
            <button className="btn btn-secondary" onClick={() => setShowMerge(false)}>Abbrechen</button>
            <button className="btn btn-primary" disabled={!mergeSource || !mergeTarget || mergeSource === mergeTarget} onClick={() => setMergeConfirm(true)}>Zusammenführen</button>
          </div>
        </div>
      )}

      {mergeConfirm && (
        <div className="confirm-overlay">
          <div className="confirm-dialog">
            <h3>Projekte zusammenführen?</h3>
            <p><strong>„{mergeSource}"</strong> wird in <strong>„{mergeTarget}"</strong> überführt und anschließend entfernt. Diese Aktion kann nicht automatisch rückgängig gemacht werden.</p>
            <div className="confirm-actions">
              <button className="btn-cancel" onClick={() => setMergeConfirm(false)}>Abbrechen</button>
              <button className="btn-confirm-delete" onClick={() => { onMergeProjects && onMergeProjects(mergeSource, mergeTarget); setMergeConfirm(false); setShowMerge(false); setMergeSource(''); setMergeTarget(''); }}>Zusammenführen</button>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="team-form-card">
          <h3>{editingName ? 'Projekt bearbeiten' : 'Neues Projekt'}</h3>
          <div className="team-form-grid">
            <div className="team-form-field">
              <label>Projektname *</label>
              <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="z.B. Plötzlich Mama" autoFocus />
            </div>
            <div className="team-form-field">
              <label>Kürzel</label>
              <input type="text" value={form.kuerzel} onChange={e => setForm(f => ({ ...f, kuerzel: e.target.value }))} placeholder="z.B. PM" />
            </div>
            <div className="team-form-field">
              <label>Projektnummer</label>
              <input type="text" value={form.projektnummer} onChange={e => setForm(f => ({ ...f, projektnummer: e.target.value }))} placeholder="z.B. 2026-042" />
            </div>
            <div className="team-form-field">
              <label>Produktionsfirma</label>
              <input type="text" value={form.produktionsfirma} onChange={e => setForm(f => ({ ...f, produktionsfirma: e.target.value }))} placeholder="z.B. Storytelle" />
            </div>
            <div className="team-form-field">
              <label>Drehstart</label>
              <input type="date" value={form.drehStartDatum} onChange={e => setForm(f => ({ ...f, drehStartDatum: e.target.value }))} />
            </div>
          </div>
          <div className="team-form-actions">
            <button className="btn btn-secondary" onClick={resetForm}>Abbrechen</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={!form.name.trim()}>{editingName ? 'Speichern' : 'Anlegen'}</button>
          </div>
        </div>
      )}

      {projectEntries.length === 0 ? (
        <div className="team-empty">Noch keine Projekte angelegt.</div>
      ) : (
        <div className="team-grid">
          {projectEntries.map(([name, data]) => {
            const isCompleted = !!completedProjects[name];
            return (
            <div key={name} className={`team-card${isCompleted ? ' team-card-completed' : ''}`}>
              <div className="team-card-avatar">{name.slice(0, 2).toUpperCase()}</div>
              <div className="team-card-info">
                <div className="team-card-name">
                  {name}
                  {isCompleted && <span className="project-completed-icon" title="Abgeschlossen">✅</span>}
                </div>
                <div className="team-card-meta">
                  {data.kuerzel && <span className="team-card-contact">🏷 {data.kuerzel}</span>}
                  {data.projektnummer && <span className="team-card-contact"># {data.projektnummer}</span>}
                  {data.produktionsfirma && <span className="team-card-contact">🏢 {data.produktionsfirma}</span>}
                  {data.drehStartDatum && <span className="team-card-contact">📅 {data.drehStartDatum}</span>}
                </div>
              </div>
              <div className="team-card-actions">
                {onToggleProjectComplete && (
                  <button
                    className={`btn-icon${isCompleted ? ' btn-icon-active' : ''}`}
                    onClick={() => onToggleProjectComplete(name)}
                    title={isCompleted ? 'Projekt wieder öffnen' : 'Projekt abschließen'}
                  >
                    {isCompleted ? '🔓' : '✅'}
                  </button>
                )}
                <button className="btn-icon" onClick={() => handleEdit(name, data)} title="Bearbeiten">✏️</button>
                <button className="btn-icon btn-icon-danger" onClick={() => handleDelete(name)} title="Entfernen">🗑</button>
              </div>
            </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ──────────────────────────────────────────────────
// Tab: Crew (Stammcrew pro Projekt)
// ──────────────────────────────────────────────────
function CrewTab({ team, projects, timesheets, resolveName, projectCrews, onProjectCrewsChange }) {
  const [selectedProject, setSelectedProject] = useState('');
  const [addName, setAddName] = useState('');
  const resolve = resolveName || ((n) => n);

  const projectNames = useMemo(() => {
    const fromSettings = Object.keys(projects || {});
    const fromTimesheets = [...new Set((timesheets || []).map(ts => ts.projekt).filter(Boolean))];
    return [...new Set([...fromSettings, ...fromTimesheets])].sort((a, b) => a.localeCompare(b, 'de'));
  }, [projects, timesheets]);

  const crew = useMemo(() => (selectedProject && projectCrews[selectedProject]) ? projectCrews[selectedProject] : [], [selectedProject, projectCrews]);

  // Team members not yet in crew
  const availableMembers = useMemo(() => {
    const inCrew = new Set(crew.map(n => n.toLowerCase()));
    return (team || []).filter(m => !inCrew.has(m.name.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }, [team, crew]);

  const updateCrew = (newCrew) => {
    onProjectCrewsChange({ ...projectCrews, [selectedProject]: newCrew });
  };

  const handleAdd = () => {
    if (!addName || !selectedProject) return;
    if (crew.some(n => n.toLowerCase() === addName.toLowerCase())) { setAddName(''); return; }
    updateCrew([...crew, addName]);
    setAddName('');
  };

  const handleRemove = (name) => updateCrew(crew.filter(n => n !== name));
  const moveUp = (idx) => { if (idx === 0) return; const c = [...crew]; [c[idx-1], c[idx]] = [c[idx], c[idx-1]]; updateCrew(c); };
  const moveDown = (idx) => { if (idx >= crew.length - 1) return; const c = [...crew]; [c[idx+1], c[idx]] = [c[idx], c[idx+1]]; updateCrew(c); };

  return (
    <>
      <div className="staffing-project-select">
        <label>Projekt auswählen:</label>
        <select value={selectedProject} onChange={e => setSelectedProject(e.target.value)}>
          <option value="">— Projekt wählen —</option>
          {projectNames.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {!selectedProject && (
        <div className="team-empty">
          {projectNames.length === 0
            ? 'Noch keine Projekte angelegt. Lege zuerst ein Projekt im Tab „Projekte" an.'
            : 'Wähle ein Projekt, um die Stammcrew festzulegen.'}
        </div>
      )}

      {selectedProject && (
        <div className="staffing-section">
          <div className="staffing-section-header">
            <h3>Stammcrew — {selectedProject}</h3>
            <span className="team-count">{crew.length} Personen</span>
          </div>

          {crew.length > 0 && (
            <div className="staffing-list">
              {crew.map((name, idx) => (
                <div key={name} className="staffing-row">
                  <div className="staffing-row-avatar">{name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}</div>
                  <div className="staffing-row-info">
                    <span className="staffing-row-name">{resolve(name)}</span>
                  </div>
                  <div className="staffing-row-dates">
                    <button className="btn-icon" onClick={() => moveUp(idx)} disabled={idx === 0} title="Nach oben">↑</button>
                    <button className="btn-icon" onClick={() => moveDown(idx)} disabled={idx === crew.length - 1} title="Nach unten">↓</button>
                  </div>
                  <button className="btn-icon btn-icon-danger" onClick={() => handleRemove(name)} title="Aus Crew entfernen">🗑</button>
                </div>
              ))}
            </div>
          )}

          <div className="staffing-add-row">
            <select value={addName} onChange={e => setAddName(e.target.value)}>
              <option value="">+ Teammitglied zur Stammcrew…</option>
              {availableMembers.map(m => (
                <option key={m.id} value={m.name}>{m.name}{m.position ? ` (${m.position})` : ''}</option>
              ))}
            </select>
            <button className="btn btn-primary" onClick={handleAdd} disabled={!addName}>Hinzufügen</button>
          </div>
          {(team || []).length === 0 && (
            <p className="staffing-hint">Lege zuerst Teammitglieder im Tab „Personen" an.</p>
          )}
        </div>
      )}
    </>
  );
}

// ──────────────────────────────────────────────────
// Main TeamManager with Tabs
// ──────────────────────────────────────────────────
export default function TeamManager({ team, onTeamChange, timesheets, resolveName, projects, onProjectsChange, onMergeProjects, projectCrews, onProjectCrewsChange, staffing, onStaffingChange, onCreateTimesheets, calendarEntries, onCalendarChange, settings, onSettings, onSyncN8N, completedProjects = {}, onToggleProjectComplete }) {
  const [activeTab, setActiveTab] = useState('projekte');

  return (
    <div className="team-manager">
      <div className="team-title-row">
        <h2 className="section-title">Team &amp; Projekte</h2>
      </div>
      <div className="team-tabs">
        <button className={`team-tab${activeTab === 'projekte' ? ' team-tab-active' : ''}`} onClick={() => setActiveTab('projekte')}>
          Projekte
        </button>
        <button className={`team-tab${activeTab === 'crew' ? ' team-tab-active' : ''}`} onClick={() => setActiveTab('crew')}>
          Crew
        </button>
        <button className={`team-tab${activeTab === 'personen' ? ' team-tab-active' : ''}`} onClick={() => setActiveTab('personen')}>
          Personen
        </button>
        <button className={`team-tab${activeTab === 'kalender' ? ' team-tab-active' : ''}`} onClick={() => setActiveTab('kalender')}>
          Zusatz-Kalender
        </button>
      </div>

      {activeTab === 'projekte' && (
        <ProjekteTab projects={projects} onProjectsChange={onProjectsChange} onMergeProjects={onMergeProjects} timesheets={timesheets} completedProjects={completedProjects} onToggleProjectComplete={onToggleProjectComplete} />
      )}
      {activeTab === 'crew' && (
        <CrewTab team={team} projects={projects} timesheets={timesheets} resolveName={resolveName}
          projectCrews={projectCrews || {}} onProjectCrewsChange={onProjectCrewsChange} />
      )}
      {activeTab === 'personen' && (
        <PersonenTab team={team} onTeamChange={onTeamChange} timesheets={timesheets} resolveName={resolveName} />
      )}
      {activeTab === 'kalender' && (
        <KalenderTab
          team={team}
          calendarEntries={calendarEntries || {}}
          onCalendarChange={onCalendarChange}
          projects={projects}
        />
      )}
    </div>
  );
}

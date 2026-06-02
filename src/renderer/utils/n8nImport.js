// n8n-Import: wandelt JSON-Einträge in Kalendereinträge & Stundenzettel um.
//  typ "zusatzpersonal" → nur Kalender (kind 'zusatz')
//  typ "vertretung"     → nur Kalender (kind 'vertretung')
//  typ "zeiten"         → Stundenzettel, nur für Tage mit echten Zeiten.
//                         Beim Erstellen wird gegen den Kalender geprüft, ob jemand
//                         Zusatz oder Vertretung war (→ Bemerkung / Rückfrage).
import { getInitials, calcNightHours } from './helpers';
import { parseTime } from './holidays';

// Berechnet Stunden/Überstunden/Nacht für einen Tag aus start/ende/pause (analog TimesheetCreate).
function computeDayTotals(day) {
  const d = { ...day };
  const s = parseTime(d.start);
  const e = parseTime(d.ende);
  if (s === null || e === null || !d.start || !d.ende) {
    return { ...d, stundenTotal: d.stundenTotal || 0, ueberstunden25: d.ueberstunden25 || 0, ueberstunden50: d.ueberstunden50 || 0, nacht25: d.nacht25 || 0 };
  }
  let diff = e - s;
  if (diff < 0) diff += 24; // über Mitternacht
  diff -= d.pause || 0;
  const total = Math.max(0, Math.round(diff * 100) / 100);
  return {
    ...d,
    stundenTotal: total,
    ueberstunden25: Math.round(Math.max(0, Math.min(total - 10, 1)) * 100) / 100,
    ueberstunden50: Math.round(Math.max(0, total - 11) * 100) / 100,
    nacht25: calcNightHours(d.start, d.ende, parseTime),
  };
}

const DAY_NAMES = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function pad(n) { return String(n).padStart(2, '0'); }

function normalizeDate(s, year) {
  s = (s || '').trim();
  const m = s.match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?$/);
  if (!m) return s;
  let y = m[3] || String(year || new Date().getFullYear());
  if (y.length === 2) y = '20' + y;
  return `${pad(+m[1])}.${pad(+m[2])}.${y}`;
}
function parseDMY(s) { const p = (s || '').split('.'); if (p.length !== 3) return null; return new Date(+p[2], +p[1] - 1, +p[0]); }
function dmyToISO(s) { const p = (s || '').split('.'); if (p.length !== 3) return null; return `${p[2]}-${pad(+p[1])}-${pad(+p[0])}`; }
function fmtDMY(d) { return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`; }
function weekday(dateStr) { const d = parseDMY(dateStr); return d ? DAY_NAMES[d.getDay()] : ''; }
function toMin(t) { const m = (t || '').match(/^(\d{1,2}):(\d{2})$/); return m ? (+m[1]) * 60 + (+m[2]) : null; }
function fromMin(min) { if (min == null) return ''; const m = ((min % 1440) + 1440) % 1440; return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; }

export function expandZeitraeume(zeitraeume, year) {
  const out = [];
  for (const z of (zeitraeume || [])) {
    const parts = String(z).split('-').map(x => x.trim()).filter(Boolean);
    if (parts.length === 1) { out.push(normalizeDate(parts[0], year)); continue; }
    const a = parseDMY(normalizeDate(parts[0], year));
    const b = parseDMY(normalizeDate(parts[1], year));
    if (!a || !b) { out.push(normalizeDate(parts[0], year)); continue; }
    for (let d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) out.push(fmtDMY(d));
  }
  return out;
}

function emptyDay(datum, extra = {}) {
  return {
    tag: weekday(datum), datum, start: '', ende: '', pause: 0.75,
    stundenTotal: 0, ueberstunden25: 0, ueberstunden50: 0, ueberstunden100: 0,
    nacht25: 0, fahrzeit: 0, anmerkungen: '', ...extra,
  };
}

function sumTotals(days) {
  return days.reduce((t, d) => ({
    stundenTotal: t.stundenTotal + (d.stundenTotal || 0),
    ueberstunden25: t.ueberstunden25 + (d.ueberstunden25 || 0),
    ueberstunden50: t.ueberstunden50 + (d.ueberstunden50 || 0),
    ueberstunden100: t.ueberstunden100 + (d.ueberstunden100 || 0),
    nacht25: t.nacht25 + (d.nacht25 || 0),
    fahrzeit: t.fahrzeit + (d.fahrzeit || 0),
  }), { stundenTotal: 0, ueberstunden25: 0, ueberstunden50: 0, ueberstunden100: 0, nacht25: 0, fahrzeit: 0 });
}

function makeSheet({ projekt, name, position }, days) {
  const computedDays = days.map(d => computeDayTotals(d));
  return {
    id: genId(), importDate: new Date().toISOString(), createdManually: true, source: 'n8n', filePath: '',
    projekt, projektnummer: '', produktionsfirma: '', name, position: position || '', abteilung: '', pause: 0.75,
    days: computedDays, totals: sumTotals(computedDays),
  };
}

function initialsMatch(name, ini) {
  if (!ini) return false;
  const words = (name || '').trim().split(/\s+/).filter(Boolean);
  const letter = ini[0].toUpperCase();
  if (words.some(w => w[0] && w[0].toUpperCase() === letter)) return true;
  return getInitials(name).toUpperCase().includes(ini.toUpperCase());
}

/**
 * Verarbeitet alle n8n-Einträge.
 * @returns {
 *   calendarAdds,   // Kalendereinträge aus zusatz/vertretung [{name,position,projekt,dateISO,kind}]
 *   sheets,         // Stundenzettel aus "zeiten" (nur Tage mit Zeiten)
 *   deviations,     // initialen-basierte Zeit-Abweichungen
 *   substitutions,  // zu klärende Vertretungen [{id,projekt,datum,name,position,crew}]
 *   unknownNames, newProjects, errors
 * }
 */
export function processN8N(entries, { resolveName, projectCrews = {}, team = [], projects = {}, calendarEntries = {} } = {}) {
  const resolve = resolveName || ((n) => n);
  const teamNames = new Set((team || []).map(m => (m.name || '').toLowerCase()));
  const isKnown = (name) => teamNames.has((name || '').toLowerCase()) || teamNames.has(resolve(name || '').toLowerCase());
  const posOf = (name) => {
    const m = (team || []).find(t => (t.name || '').toLowerCase() === (name || '').toLowerCase());
    return m ? (m.position || '') : '';
  };

  // Projekt-Kürzel → voller Projektname
  const kuerzelMap = {};
  for (const [pName, pData] of Object.entries(projects || {})) {
    if (pData && pData.kuerzel) kuerzelMap[pData.kuerzel.trim().toLowerCase()] = pName;
  }
  const newProjects = new Set();
  const resolveProjekt = (p) => {
    if (!p) return 'Sonstiges';
    const key = String(p).trim().toLowerCase();
    if (projects && projects[p]) return p;
    if (kuerzelMap[key]) return kuerzelMap[key];
    if (p !== 'Sonstiges') newProjects.add(p);
    return p;
  };

  const errors = [];
  const sheets = [];
  const deviations = [];
  const substitutions = [];
  const unknownNames = new Set();
  const calendarAdds = []; // {name, position, projekt, dateISO, kind}
  const noteUnknown = (name) => { if (name && !isKnown(name)) unknownNames.add(name); };

  // Anwesenheits-Index aus bestehendem Kalender + diesem Import-Batch:
  // key `${projekt}|${iso}` → Map(nameLower → { name, kind, position })
  const presence = {};
  const presKey = (projekt, iso) => `${projekt}|${iso}`;
  const addPresence = (projekt, iso, name, kind, position) => {
    const k = presKey(projekt, iso);
    if (!presence[k]) presence[k] = new Map();
    const cur = presence[k].get(name.toLowerCase());
    // Vertretung hat Vorrang vor Zusatz bei der Markierung
    if (!cur || (kind === 'vertretung')) presence[k].set(name.toLowerCase(), { name, kind, position: position || (cur && cur.position) || '' });
  };

  // bestehende Kalendereinträge einlesen
  for (const [iso, list] of Object.entries(calendarEntries || {})) {
    for (const e of (list || [])) {
      if (!e || !e.name) continue;
      addPresence(e.projekt || '', iso, e.name, e.kind || 'zusatz', e.position);
    }
  }

  // 1) Zusatzpersonal & Vertretung → nur Kalender
  for (const { file, data } of (entries || [])) {
    if (!data) continue;
    const kind = data.typ === 'vertretung' ? 'vertretung' : (data.typ === 'zusatzpersonal' ? 'zusatz' : null);
    if (!kind) continue;
    const projekt = resolveProjekt(data.projekt);
    for (const p of (data.personen || [])) {
      if (!p || !p.name) { errors.push({ file, error: `${kind}-Person ohne Namen` }); continue; }
      noteUnknown(p.name);
      const dates = expandZeitraeume(p.zeitraeume, undefined);
      for (const d of dates) {
        const iso = dmyToISO(d);
        if (!iso) continue;
        calendarAdds.push({ name: p.name, position: p.position || '', projekt, dateISO: iso, kind });
        addPresence(projekt, iso, p.name, kind, p.position);
      }
    }
  }

  // 2) Zeiten → Stundenzettel (nur Tage mit Zeiten)
  for (const { file, data } of (entries || [])) {
    if (!data || data.typ !== 'zeiten') continue;
    const projekt = resolveProjekt(data.projekt);
    const crewNames = (projectCrews[projekt] || []).map(n => resolve(n));
    const personDays = {}; // name -> { position, days: {datum: day} }
    const ensure = (name, pos) => { if (!personDays[name]) personDays[name] = { position: pos || posOf(name), days: {} }; };

    for (const tag of (data.tage || [])) {
      const datum = normalizeDate(tag.datum);
      const iso = dmyToISO(datum);
      const teamTime = tag.team || {};
      const hasTimes = !!(teamTime.start && teamTime.ende);
      if (!hasTimes) continue; // nur Tage mit Zeiten erzeugen Zettel
      const pause = typeof teamTime.pause === 'number' ? teamTime.pause : 0.75;

      // Anwesende: Stammcrew + alle Kalender-Personen (Zusatz/Vertretung) an dem Tag
      const present = new Map(); // name → { kind }
      for (const n of crewNames) present.set(n, { kind: 'crew' });
      for (const e of (presence[presKey(projekt, iso)] ? presence[presKey(projekt, iso)].values() : [])) {
        present.set(e.name, { kind: e.kind, position: e.position });
      }

      for (const [name, info] of present) {
        ensure(name, info.position);
        const extra = { start: teamTime.start || '', ende: teamTime.ende || '', pause };
        if (info.kind === 'zusatz') extra.anmerkungen = 'Zusatz';
        personDays[name].days[datum] = emptyDay(datum, extra);
        noteUnknown(name);
        // Vertretung an diesem Tag → zur Klärung vormerken
        if (info.kind === 'vertretung') {
          substitutions.push({
            id: genId(), projekt, datum, name, position: info.position || posOf(name),
            crew: crewNames.map(n => ({ name: n, position: posOf(n) })),
          });
        }
      }

      // Initialen-basierte Zeit-Abweichungen
      for (const ab of (tag.abweichungen || [])) {
        const ini = (ab.initiale || '').trim();
        const all = [...present.keys()];
        const matched = all.filter(n => initialsMatch(n, ini));
        deviations.push({
          id: genId(), projekt, datum, start: ab.start || '', ende: ab.ende || '', initiale: ini,
          candidates: matched.length ? matched : all,
          teamStart: teamTime.start || '', teamEnde: teamTime.ende || '', pause,
        });
      }
    }

    for (const [name, info] of Object.entries(personDays)) {
      const days = Object.values(info.days).sort((a, b) => (parseDMY(a.datum) - parseDMY(b.datum)));
      if (days.length === 0) continue;
      sheets.push(makeSheet({ projekt, name, position: info.position }, days));
    }
  }

  return {
    calendarAdds, sheets, deviations, substitutions,
    unknownNames: [...unknownNames], newProjects: [...newProjects], errors,
  };
}

function recalcTotals(sheet) {
  sheet.totals = sumTotals(sheet.days);
}

/** Wendet eine geklärte Zeit-Abweichung (Initiale) auf den Stundenzettel an. */
export function applyDeviation(sheets, deviation, chosenName) {
  const sheet = sheets.find(s => s.name === chosenName && s.projekt === deviation.projekt);
  if (!sheet) return;
  const day = sheet.days.find(d => d.datum === deviation.datum);
  if (!day) return;
  const starts = [toMin(deviation.teamStart), toMin(deviation.start)].filter(v => v != null);
  const ends = [toMin(deviation.teamEnde), toMin(deviation.ende)].filter(v => v != null);
  if (starts.length) day.start = fromMin(Math.min(...starts));
  if (ends.length) day.ende = fromMin(Math.max(...ends));
  day.pause = deviation.pause;
  const note = `Abweichung: ${deviation.initiale} ${deviation.start}–${deviation.ende}`;
  day.anmerkungen = day.anmerkungen ? `${day.anmerkungen} · ${note}` : note;
  Object.assign(day, computeDayTotals(day));
  recalcTotals(sheet);
}

/**
 * Wendet eine geklärte Vertretung an.
 * choice = { forWhom, reason, position, crewAdjust: { [name]: positionHeute } }
 */
export function applySubstitution(sheets, sub, choice) {
  if (!choice) return;
  const sheet = sheets.find(s => s.name === sub.name && s.projekt === sub.projekt);
  if (sheet) {
    const day = sheet.days.find(d => d.datum === sub.datum);
    if (day) {
      const parts = [];
      parts.push(`Vertretung${choice.forWhom ? ' für ' + choice.forWhom : ''}`);
      if (choice.reason) parts.push(`(${choice.reason})`);
      if (choice.position) parts.push(`– als ${choice.position}`);
      const note = parts.join(' ');
      day.anmerkungen = day.anmerkungen ? `${day.anmerkungen} · ${note}` : note;
      if (choice.position) sheet.position = sheet.position || choice.position;
    }
  }
  // Aufrücken der übrigen Stammcrew an diesem Tag
  if (choice.crewAdjust) {
    for (const [name, posHeute] of Object.entries(choice.crewAdjust)) {
      if (!posHeute) continue;
      const s = sheets.find(x => x.name === name && x.projekt === sub.projekt);
      if (!s) continue;
      const d = s.days.find(dd => dd.datum === sub.datum);
      if (!d) continue;
      const note = `Heute als ${posHeute}${choice.forWhom ? ` (Ausfall ${choice.forWhom}${choice.reason ? ', ' + choice.reason : ''})` : ''}`;
      d.anmerkungen = d.anmerkungen ? `${d.anmerkungen} · ${note}` : note;
    }
  }
}

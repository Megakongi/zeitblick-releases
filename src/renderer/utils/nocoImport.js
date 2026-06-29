// NocoDB-Direktimport: wandelt Records der "Zeiten"-Tabelle in das n8n-Import-Schema
// (typ:"zeiten") um, das von processN8N() verarbeitet wird.
//
// Annahme über die NocoDB-Tabelle (eine Zeile = ein Tag):
//   Datum        z.B. "23.06.26" oder ISO "2026-06-23"
//   Projekt      Projekt-Kürzel oder -Name, z.B. "PM"
//   Von-Bis      Teamzeit als "9:00-17:30"
//   Abweichungen Initialen-Einzelzeiten "FZ 8:30-18:00, MM 7:00-18:00"
//   Notizen      Freitext, wird zur Tages-Bemerkung
//
// Zeilen mit gleichem Projekt werden zu einem typ:"zeiten"-Eintrag mit mehreren `tage`
// gruppiert – exakt die Struktur, die der bestehende n8n-Pfad erwartet.

const DEFAULT_FIELDS = {
  datum: 'Datum',
  projekt: 'Projekt',
  vonBis: 'Von-Bis',
  abweichungen: 'Abweichungen',
  notizen: 'Notizen',
};

const DEFAULT_PAUSE = 0.75; // identisch zum n8n-Default

// ISO "2026-06-23" → "23.06.2026"; alles andere unverändert (DD.MM[.YY] wird
// downstream von normalizeDate/dmyToISO behandelt).
export function normalizeNocoDate(value) {
  const v = String(value ?? '').trim();
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}.${iso[2]}.${iso[1]}`;
  return v;
}

// "9:00-17:30" → { start:"9:00", ende:"17:30" }. Akzeptiert -, – und —.
export function parseVonBis(value) {
  const parts = String(value ?? '').split(/[-–—]/).map(x => x.trim());
  return { start: parts[0] || '', ende: parts[1] || '' };
}

// "FZ 8:30-18:00, MM 7:00-18:00" → [{ initiale, start, ende }, ...]
export function parseAbweichungen(value) {
  if (!value) return [];
  return String(value)
    .split(/[,;]+/)
    .map(seg => seg.trim())
    .filter(Boolean)
    .map(seg => {
      const m = seg.match(/^(\S+)\s+(.+)$/);
      const initiale = (m ? m[1] : seg).trim();
      const { start, ende } = parseVonBis(m ? m[2] : '');
      return { initiale, start, ende };
    })
    .filter(a => a.initiale);
}

// Stabile Record-ID aus NocoDB (System-Feld "Id").
export function recordId(rec) {
  if (!rec) return null;
  return rec.Id ?? rec.id ?? rec.ID ?? null;
}

// Behält nur Records mit Id, die noch nicht importiert wurden.
export function filterNewRecords(records, importedIds = []) {
  const seen = new Set((importedIds || []).map(String));
  return (records || []).filter(rec => {
    const id = recordId(rec);
    return id != null && !seen.has(String(id));
  });
}

/**
 * Wandelt NocoDB-Records in n8n-Import-Einträge um.
 * @param {Array<object>} records  NocoDB-Records (Feld = Spaltenname)
 * @param {object} [fieldMap]      Optionales Mapping abweichender Spaltennamen
 * @returns {Array<{file:string, data:object}>}
 */
export function nocoRecordsToEntries(records, fieldMap = {}) {
  const F = { ...DEFAULT_FIELDS, ...fieldMap };
  const byProjekt = new Map();

  for (const rec of (records || [])) {
    if (!rec) continue;
    const datum = normalizeNocoDate(rec[F.datum]);
    if (!datum) continue; // ohne Datum kein Tag
    const projekt = String(rec[F.projekt] ?? '').trim() || 'Sonstiges';
    const { start, ende } = parseVonBis(rec[F.vonBis]);

    const tag = {
      datum,
      team: { start, ende, pause: DEFAULT_PAUSE },
      abweichungen: parseAbweichungen(rec[F.abweichungen]),
    };
    const notiz = String(rec[F.notizen] ?? '').trim();
    if (notiz) tag.notiz = notiz;

    if (!byProjekt.has(projekt)) byProjekt.set(projekt, []);
    byProjekt.get(projekt).push(tag);
  }

  const entries = [];
  for (const [projekt, tage] of byProjekt) {
    entries.push({ file: `nocodb:${projekt}`, data: { typ: 'zeiten', projekt, tage } });
  }
  return entries;
}

/**
 * StdWeb-Übertragung: mappt einen ZeitBlick-Stundenzettel auf das StdWeb-Format
 * und steuert das Vorausfüllen im eingebetteten StdWeb-Fenster.
 *
 * Sendet NICHT ab – „Beantragen" macht der Nutzer in StdWeb selbst.
 */

const TAG_INDEX = {
  montag: 1, dienstag: 2, mittwoch: 3, donnerstag: 4, freitag: 5, samstag: 6, sonntag: 7,
};

/** Dezimalstunden → "HH:MM" (z.B. 0.75 → "00:45"). Leer bei 0/leer. */
function decimalToHHMM(h) {
  const n = Number(h);
  if (!n || Number.isNaN(n) || n <= 0) return '';
  const hours = Math.floor(n);
  const mins = Math.round((n - hours) * 60);
  return String(hours).padStart(2, '0') + ':' + String(mins).padStart(2, '0');
}

/** Dezimalzahl → deutsche Schreibweise mit Komma (z.B. 2.5 → "2,5"). Leer bei 0. */
function decimalToComma(n) {
  const v = Number(n);
  if (!v || Number.isNaN(v) || v <= 0) return '';
  return String(v).replace('.', ',');
}

/** Normalisiert "9:00" → "09:00"; gibt '' bei ungültig/leer. */
function normalizeTime(t) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '').trim());
  if (!m) return '';
  return String(parseInt(m[1], 10)).padStart(2, '0') + ':' + m[2];
}

/**
 * Wandelt einen Stundenzettel in das StdWeb-Tagesarray um.
 * @returns {Array<{tag:number, von:string, bis:string, pause:string, bemerkung:string, reise:string}>}
 */
export function timesheetToStdWebDays(sheet) {
  const days = (sheet && sheet.days) || [];
  const out = [];
  for (const d of days) {
    const tag = TAG_INDEX[String(d.tag || '').trim().toLowerCase()];
    if (!tag) continue;
    const von = normalizeTime(d.start);
    const bis = normalizeTime(d.ende);
    const pause = decimalToHHMM(d.pause);
    const bemerkung = String(d.anmerkungen || '').trim();
    const reise = decimalToComma(d.fahrzeit);
    // Nur Tage mit Inhalt übertragen
    if (!von && !bis && !pause && !bemerkung && !reise) continue;
    out.push({ tag, von, bis, pause, bemerkung, reise });
  }
  return out;
}

/** Montag-Datum der Stundenzettel-Woche ("DD.MM.YYYY") für die Wochen-Ansteuerung. */
export function sheetMondayDate(sheet) {
  const days = (sheet && sheet.days) || [];
  const mo = days.find(d => String(d.tag || '').trim().toLowerCase() === 'montag' && d.datum);
  if (mo) return mo.datum;
  const first = days.find(d => d.datum);
  return first ? first.datum : '';
}

/** Kurzlabel der Stundenzettel-Woche für Anzeige/Abgleich, z.B. "16.02.–22.02.2026". */
export function sheetWeekLabel(sheet) {
  const dates = ((sheet && sheet.days) || []).map(d => d.datum).filter(Boolean);
  if (!dates.length) return '';
  return dates[0] + (dates.length > 1 ? ' – ' + dates[dates.length - 1] : '');
}

/** Prüft grob, ob das StdWeb-Wochenlabel zum Stundenzettel passt (per erstem Datum dd.mm.). */
function weekMatches(stdwebLabel, sheet) {
  const first = ((sheet && sheet.days) || []).map(d => d.datum).filter(Boolean)[0];
  if (!first || !stdwebLabel) return null; // unbekannt
  const ddmm = first.slice(0, 6); // "16.02."
  return stdwebLabel.includes(ddmm);
}

/**
 * Überträgt einen Stundenzettel ins offene StdWeb-Fenster.
 * Öffnet das Fenster bei Bedarf; prüft die offene Woche; fragt bei Unstimmigkeit nach.
 * @returns {Promise<{ok:boolean, message:string, report?:any}>}
 */
export async function sendTimesheetToStdWeb(sheet) {
  const api = window.electronAPI;
  if (!api || !api.fillStdWeb) return { ok: false, message: 'StdWeb-Funktion nicht verfügbar.' };

  const days = timesheetToStdWebDays(sheet);
  if (!days.length) return { ok: false, message: 'Dieser Stundenzettel hat keine übertragbaren Zeiten.' };

  // Fenster sicherstellen
  const opened = await api.openStdWeb();
  if (!opened || !opened.success) return { ok: false, message: 'StdWeb-Fenster konnte nicht geöffnet werden.' };

  // Richtige Woche ansteuern (vorhandene wählen oder neu anlegen)
  const monday = sheetMondayDate(sheet);
  if (api.navigateStdWeb && monday) {
    const nav = await api.navigateStdWeb(monday);
    const navRep = nav && nav.report;
    if (!nav || !nav.success || !navRep || !navRep.ok) {
      const note = (navRep && navRep.note) || (nav && nav.error) || 'unbekannt';
      const proceed = window.confirm(
        'Konnte die passende StdWeb-Woche nicht automatisch ansteuern.\n' +
        '(Montag ' + monday + ' · ' + note + ')\n\n' +
        'Bist du eingeloggt und ist die richtige Produktion gewählt?\n\n' +
        'Trotzdem die aktuell offene Woche füllen?');
      if (!proceed) return { ok: false, message: 'Abgebrochen – Woche nicht angesteuert (' + note + ').' };
    }
  } else {
    // Fallback: offene Woche grob prüfen
    const wk = await api.stdwebWeekInfo();
    if (wk && wk.success && wk.label && weekMatches(wk.label, sheet) === false) {
      const proceed = window.confirm('Offene StdWeb-Woche (' + wk.label + ') passt evtl. nicht zum Stundenzettel (' + sheetWeekLabel(sheet) + ').\n\nTrotzdem füllen?');
      if (!proceed) return { ok: false, message: 'Abgebrochen (Woche passte nicht).' };
    }
  }

  const res = await api.fillStdWeb(days);
  if (!res || !res.success) return { ok: false, message: 'Fehler beim Füllen: ' + ((res && res.error) || 'unbekannt') };

  const filled = (res.report || []).filter(r => r.ok).length;
  return {
    ok: true,
    message: `${filled} Tag(e) in StdWeb vorausgefüllt. Bitte in StdWeb prüfen und selbst „Beantragen“.`,
    report: res.report,
  };
}

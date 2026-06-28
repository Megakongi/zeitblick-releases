import React, { useState, useMemo } from 'react';
import { getHolidays } from '../utils/holidays';
import { getKW } from '../utils/calendarWeek';

/* ZeitBlick Kalenderansicht — Monatskalender mit Drehtagen, Urlaub/Krank/AZV,
 * Dispos und ArbZG-/Ruhezeit-Verletzungen. */

const MONTH_NAMES = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

const PROJECT_PALETTE = ['#5159E8', '#1FB97A', '#E0A82E', '#E83A3A', '#06B6D4', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];
function colorFor(name = '') {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PROJECT_PALETTE[h % PROJECT_PALETTE.length];
}

/** dd.mm.yyyy (auch 1-stellig / 2-stelliges Jahr) → "yyyy-mm-dd" oder null */
function toISO(datum) {
  if (!datum) return null;
  const m = String(datum).match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (!m) return null;
  let year = m[3];
  if (year.length === 2) year = (parseInt(year, 10) >= 70 ? '19' : '20') + year;
  return `${year}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

const s = {
  wrap:      { padding: '24px 28px', maxWidth: 1200, margin: '0 auto' },
  head:      { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 },
  title:     { fontSize: 22, fontWeight: 700, color: 'var(--text)', minWidth: 220 },
  navBtn:    { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', color: 'var(--text)', fontSize: 15 },
  todayBtn:  { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', color: 'var(--text)', fontSize: 13, fontWeight: 500 },
  legend:    { display: 'flex', gap: 14, flexWrap: 'wrap', marginLeft: 'auto', fontSize: 12, color: 'var(--muted)' },
  legendDot: (bg) => ({ display: 'inline-block', width: 9, height: 9, borderRadius: 99, background: bg, marginRight: 5 }),
  grid:      { display: 'grid', gridTemplateColumns: '44px repeat(7, 1fr)', gap: 6 },
  dow:       { textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', padding: '4px 0' },
  kw:        { display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 8, fontSize: 11, color: 'var(--hint)', fontWeight: 600 },
  cell:      (inMonth, isToday, isWeekend) => ({
    minHeight: 92, borderRadius: 10, padding: '6px 8px',
    background: inMonth ? (isWeekend ? 'var(--p-50, rgba(81,89,232,0.04))' : 'var(--card)') : 'transparent',
    border: isToday ? '2px solid var(--p-500, #5159E8)' : '1px solid var(--border)',
    opacity: inMonth ? 1 : 0.35, overflow: 'hidden',
  }),
  dayNum:    (isHoliday) => ({ fontSize: 12, fontWeight: 600, color: isHoliday ? 'var(--r-600, #c0392b)' : 'var(--text)', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }),
  holidayLbl:{ fontSize: 9, color: 'var(--r-600, #c0392b)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  entry:     (bg) => ({ marginTop: 3, fontSize: 10.5, lineHeight: '14px', padding: '1px 6px', borderRadius: 5, background: bg + '22', color: bg, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }),
  flag:      (bg, fg) => ({ marginTop: 3, fontSize: 10.5, lineHeight: '14px', padding: '1px 6px', borderRadius: 5, background: bg, color: fg, fontWeight: 600, display: 'inline-block', marginRight: 4 }),
  warnDot:   { display: 'inline-block', width: 8, height: 8, borderRadius: 99, background: 'var(--r-500, #e5484d)', marginLeft: 4 },
};

export default function CalendarView({ timesheets = [], dispos = [], calculations = {}, onViewDetail, resolveName }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-basiert

  const resolve = resolveName || ((n) => n);

  // Tages-Index: iso → { entries, flags, dispoTitles, warn }
  const dayIndex = useMemo(() => {
    const idx = new Map();
    const get = (iso) => {
      if (!idx.has(iso)) idx.set(iso, { entries: [], flags: new Set(), dispos: [], warn: [] });
      return idx.get(iso);
    };

    for (const ts of timesheets) {
      for (const day of ts.days || []) {
        const iso = toISO(day.datum);
        if (!iso) continue;
        const anm = (day.anmerkungen || '').toLowerCase().trim();
        const slot = get(iso);
        if (anm.includes('urlaub') || anm === 'u') { slot.flags.add('urlaub'); continue; }
        if (anm.includes('krank')) { slot.flags.add('krank'); continue; }
        if (anm.includes('azv') || anm === 'za') { slot.flags.add('azv'); continue; }
        const hasWork = Number(day.stundenTotal) > 0 || (day.start && String(day.start).includes(':'));
        if (hasWork) {
          slot.entries.push({
            projekt: ts.projekt || 'Sonstiges',
            name: resolve(ts.name || ''),
            stunden: Number(day.stundenTotal) || 0,
            sheet: ts,
          });
          if (Number(day.stundenTotal) > 13) slot.warn.push('>13h (ArbZG)');
        }
      }
    }

    for (const d of dispos) {
      if (!d.datumISO) continue;
      get(d.datumISO).dispos.push(d.drehtag || d.title || d.originalName || 'Dispo');
    }

    for (const v of calculations.ruhezeitVerletzungen || []) {
      const iso = toISO(v.datum2);
      if (iso) get(iso).warn.push(`Ruhezeit ${v.ruhezeit}h`);
    }

    for (const p of calculations.pausenVerstoesse || []) {
      const iso = toISO(p.datum);
      if (iso) get(iso).warn.push(`Pause ${p.pauseIst}h (Soll ${p.pauseSoll}h)`);
    }

    return idx;
  }, [timesheets, dispos, calculations, resolve]);

  const holidays = useMemo(() => getHolidays(year), [year]);

  // Kalender-Wochen des Monats (Mo-Start)
  const weeks = useMemo(() => {
    const first = new Date(year, month, 1);
    const start = new Date(first);
    start.setDate(first.getDate() - ((first.getDay() + 6) % 7)); // zurück zum Montag
    const result = [];
    const cursor = new Date(start);
    do {
      const week = [];
      for (let i = 0; i < 7; i++) {
        week.push(new Date(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }
      result.push(week);
    } while (cursor.getMonth() === month && cursor.getFullYear() === year);
    return result;
  }, [year, month]);

  const navigate = (delta) => {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const ddmmyyyy = (d) => `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
  const todayISO = isoOf(today);

  return (
    <div style={s.wrap}>
      <div style={s.head}>
        <h2 style={s.title}>{MONTH_NAMES[month]} {year}</h2>
        <button style={s.navBtn} onClick={() => navigate(-1)} aria-label="Voriger Monat">‹</button>
        <button style={s.todayBtn} onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()); }}>Heute</button>
        <button style={s.navBtn} onClick={() => navigate(1)} aria-label="Nächster Monat">›</button>
        <div style={s.legend}>
          <span><span style={s.legendDot('var(--p-500, #5159E8)')} />Drehtag</span>
          <span><span style={s.legendDot('#1FB97A')} />Urlaub</span>
          <span><span style={s.legendDot('#E83A3A')} />Krank</span>
          <span><span style={s.legendDot('#06B6D4')} />AZV</span>
          <span><span style={s.legendDot('#E0A82E')} />Dispo</span>
          <span><span style={s.warnDot} /> Warnung</span>
        </div>
      </div>

      <div style={s.grid}>
        <div style={s.dow}>KW</div>
        {WEEKDAYS.map(w => <div key={w} style={s.dow}>{w}</div>)}

        {weeks.map((week, wi) => (
          <React.Fragment key={wi}>
            <div style={s.kw}>{getKW(week[3])}</div>
            {week.map((d, di) => {
              const iso = isoOf(d);
              const inMonth = d.getMonth() === month;
              const slot = dayIndex.get(iso);
              const holiday = holidays.get(ddmmyyyy(d)) || null;
              const isWeekend = di >= 5;
              return (
                <div key={iso} style={s.cell(inMonth, iso === todayISO, isWeekend)}>
                  <div style={s.dayNum(!!holiday)}>
                    <span>{d.getDate()}</span>
                    {slot && slot.warn.length > 0 && <span style={s.warnDot} title={slot.warn.join(' · ')} />}
                  </div>
                  {holiday && <div style={s.holidayLbl} title={holiday}>{holiday}</div>}
                  {slot && (
                    <>
                      {slot.entries.slice(0, 3).map((e, i) => (
                        <div
                          key={i}
                          style={{ ...s.entry(colorFor(e.projekt)), cursor: onViewDetail ? 'pointer' : 'default' }}
                          title={`${e.projekt}${e.name ? ' · ' + e.name : ''} · ${e.stunden.toLocaleString('de-DE')} Std.`}
                          onClick={() => onViewDetail && onViewDetail(e.sheet)}
                        >
                          {e.stunden > 0 ? `${e.stunden.toLocaleString('de-DE')}h ` : ''}{e.projekt}
                        </div>
                      ))}
                      {slot.entries.length > 3 && (
                        <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>+{slot.entries.length - 3} weitere</div>
                      )}
                      {slot.flags.has('urlaub') && <span style={s.flag('#1FB97A22', '#1FB97A')}>Urlaub</span>}
                      {slot.flags.has('krank') && <span style={s.flag('#E83A3A22', '#E83A3A')}>Krank</span>}
                      {slot.flags.has('azv') && <span style={s.flag('#06B6D422', '#06B6D4')}>AZV</span>}
                      {slot.dispos.slice(0, 2).map((t, i) => (
                        <div key={`d${i}`} style={s.entry('#E0A82E')} title={t}>📋 {t}</div>
                      ))}
                    </>
                  )}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

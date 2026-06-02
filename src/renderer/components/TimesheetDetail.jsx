import React, { useMemo, useState } from 'react';
import { calculateSheetTVFFS } from '../utils/tvffsCalculator';
import { isHoliday } from '../utils/holidays';
import { sendTimesheetToStdWeb } from '../utils/stdweb';

/* Hilfsfunktion: Initialen aus Name */
function getInitials(name = '') {
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

/* Hash → Projektfarbe (konsistent mit Sidebar) */
const PROJECT_PALETTE = ['#5159E8','#1FB97A','#E0A82E','#E83A3A','#06B6D4','#8B5CF6','#EC4899','#14B8A6','#F97316'];
function colorFor(name = '') {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PROJECT_PALETTE[h % PROJECT_PALETTE.length];
}

function fmtNum(v) {
  const n = parseFloat(v);
  return isNaN(n) || v === '' || v === null || v === undefined ? null : n.toFixed(2);
}

function formatCurrency(value) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value || 0);
}

/* Wochentag-Kürzel aus dd.mm.yyyy */
const DAY_NAMES = ['So','Mo','Di','Mi','Do','Fr','Sa'];
function dayLabel(datum = '') {
  const parts = datum.split('.');
  if (parts.length < 3) return '';
  const [d, m, y] = parts.map(Number);
  const date = new Date(y, m - 1, d);
  return DAY_NAMES[date.getDay()] || '';
}

export default function TimesheetDetail({ sheet, settings, onBack, onEdit, allTimesheets, onSelectSheet }) {
  const calc = calculateSheetTVFFS(sheet, settings);
  const hasGage = settings.tagesgage > 0;
  const [stdwebSending, setStdwebSending] = useState(false);
  const [stdwebMsg, setStdwebMsg] = useState('');

  const handleSendStdWeb = async () => {
    setStdwebSending(true);
    setStdwebMsg('');
    try {
      const res = await sendTimesheetToStdWeb(sheet);
      setStdwebMsg(res.message);
    } finally {
      setStdwebSending(false);
    }
  };

  /* Vorheriger / nächster Zettel derselben Person */
  const { prevSheet, nextSheet } = useMemo(() => {
    if (!allTimesheets || !onSelectSheet) return {};
    const samePersonSheets = allTimesheets
      .filter(t => t.name === sheet.name)
      .sort((a, b) => {
        const dateA = a.days?.[0]?.datum || '';
        const dateB = b.days?.[0]?.datum || '';
        const [dA, mA, yA] = dateA.split('.').map(Number);
        const [dB, mB, yB] = dateB.split('.').map(Number);
        return (yA * 10000 + mA * 100 + dA) - (yB * 10000 + mB * 100 + dB);
      });
    const idx = samePersonSheets.findIndex(t => t.id === sheet.id);
    return {
      prevSheet: idx > 0 ? samePersonSheets[idx - 1] : null,
      nextSheet: idx < samePersonSheets.length - 1 ? samePersonSheets[idx + 1] : null,
    };
  }, [allTimesheets, sheet, onSelectSheet]);

  /* Datum-Range-Label */
  const firstDate = sheet.days?.find(d => d.datum)?.datum || '';
  const lastDate = sheet.days ? [...sheet.days].reverse().find(d => d.datum)?.datum || '' : '';
  const kwLabel = sheet.kw ? `KW ${sheet.kw}` : '';
  const dateRange = firstDate ? `${firstDate}${lastDate && lastDate !== firstDate ? ' – ' + lastDate : ''}` : kwLabel;

  const personColor = colorFor(sheet.name || '');
  const initials = getInitials(sheet.name || '?');

  return (
    <div className="timesheet-detail" style={{ maxWidth: 1000 }}>
      {/* Navigationsleiste */}
      <div className="v3-detail-nav">
        <button className="v3-detail-back" onClick={onBack}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Zurück zur Liste
        </button>
        {prevSheet && (
          <button className="v3-nav-prev-btn" onClick={() => onSelectSheet(prevSheet)} title="Vorheriger Stundenzettel">
            ← Vorherige
          </button>
        )}
        {nextSheet && (
          <button className="v3-nav-next-btn" onClick={() => onSelectSheet(nextSheet)} title="Nächster Stundenzettel">
            Nächste →
          </button>
        )}
      </div>

      {/* Hero-Karte */}
      <div className="v3-detail-hero">
        <div className="v3-detail-hero-row">
          <div className="v3-detail-hero-avatar" style={{ background: personColor }}>
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="v3-detail-hero-name">{sheet.name || 'Unbekannt'}</div>
            <div className="v3-detail-hero-sub">
              {sheet.projekt && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="4" y="3" width="16" height="18" rx="2"/>
                    <line x1="8" y1="8" x2="16" y2="8"/>
                  </svg>
                  {sheet.projekt}
                </span>
              )}
              {dateRange && <span>{dateRange}</span>}
              {sheet.position && <span>{sheet.position}</span>}
              {sheet.produktionsfirma && <span>{sheet.produktionsfirma}</span>}
            </div>
          </div>
          <div className="v3-detail-hero-actions">
            {onEdit && (
              <button className="btn-secondary" onClick={() => onEdit(sheet)}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                Bearbeiten
              </button>
            )}
            <button className="btn-secondary" onClick={handleSendStdWeb} disabled={stdwebSending} title="Stunden ins offene StdWeb-Fenster vorausfüllen (sendet nicht ab)">
              📤 {stdwebSending ? 'Sende…' : 'An StdWeb'}
            </button>
          </div>
        </div>

        {stdwebMsg && (
          <div className="stdweb-banner" onClick={() => setStdwebMsg('')} title="Ausblenden">
            {stdwebMsg}
          </div>
        )}

        {/* KPI-Zeile */}
        <div className="v3-detail-kpis">
          <div className="v3-detail-kpi">
            <div className="v3-detail-kpi-val">{calc.totalArbeitstage}</div>
            <div className="v3-detail-kpi-lbl">Drehtage</div>
          </div>
          <div className="v3-detail-kpi">
            <div className="v3-detail-kpi-val" style={{ color: 'var(--mint-600)' }}>
              {Number(calc.totalStunden).toFixed(1)}
            </div>
            <div className="v3-detail-kpi-lbl">Gesamtstunden</div>
          </div>
          <div className="v3-detail-kpi">
            <div className="v3-detail-kpi-val" style={{ color: 'var(--amber-600)' }}>
              {Number(calc.totalUeberstunden).toFixed(1)}
            </div>
            <div className="v3-detail-kpi-lbl">Überstunden</div>
          </div>
          <div className="v3-detail-kpi">
            <div className="v3-detail-kpi-val" style={{ color: 'var(--p-600)' }}>
              {Number(calc.totalNacht).toFixed(1)}
            </div>
            <div className="v3-detail-kpi-lbl">Nachtstunden</div>
          </div>
          <div className="v3-detail-kpi">
            <div className="v3-detail-kpi-val">
              {Number(calc.totalFahrzeit || 0).toFixed(1)}
            </div>
            <div className="v3-detail-kpi-lbl">Fahrzeit</div>
          </div>
        </div>
      </div>

      {/* Tages-Tabelle */}
      <div className="v3-detail-days">
        <div className="v3-detail-days-head">
          <div>Datum</div>
          <div style={{ textAlign: 'right' }}>Tag</div>
          <div style={{ textAlign: 'right' }}>Von</div>
          <div style={{ textAlign: 'right' }}>Bis</div>
          <div style={{ textAlign: 'right' }}>Std. Ges.</div>
          <div style={{ textAlign: 'right' }}>ÜS 25%</div>
          <div style={{ textAlign: 'right' }}>ÜS 50%</div>
          <div style={{ textAlign: 'right' }}>ÜS 100%</div>
          <div style={{ textAlign: 'right' }}>Nacht</div>
          <div style={{ textAlign: 'right' }}>Fahrzeit</div>
        </div>

        {sheet.days.map((day, idx) => {
          const isActive = day.stundenTotal > 0 || day.start;
          const dayIsHoliday = day.datum ? isHoliday(day.datum) : false;
          const anmerkung = (day.anmerkungen || '').trim();
          return (
            <div
              key={idx}
              className="v3-detail-day-row"
              style={{ opacity: !isActive && !anmerkung ? 0.45 : 1 }}
            >
              <div className="v3-detail-day-date">
                {day.datum || '—'}
                {dayIsHoliday && <span title="Feiertag" style={{ marginLeft: 4 }}>🎄</span>}
              </div>
              <div className="v3-detail-day-num" style={{ color: 'var(--muted)' }}>
                {day.tag || dayLabel(day.datum || '')}
              </div>
              <div className="v3-detail-day-num">{day.start || '—'}</div>
              <div className="v3-detail-day-num">{day.ende || '—'}</div>
              <div className="v3-detail-day-num" style={{ color: isActive ? 'var(--ink)' : undefined, fontWeight: isActive ? 600 : undefined }}>
                {fmtNum(day.stundenTotal) ?? '—'}
              </div>
              <div className={`v3-detail-day-num${day.ueberstunden25 > 0 ? ' ot' : ''}`}>
                {fmtNum(day.ueberstunden25) ?? '—'}
              </div>
              <div className={`v3-detail-day-num${day.ueberstunden50 > 0 ? ' ot' : ''}`}>
                {fmtNum(day.ueberstunden50) ?? '—'}
              </div>
              <div className={`v3-detail-day-num${day.ueberstunden100 > 0 ? ' ot' : ''}`}>
                {fmtNum(day.ueberstunden100) ?? '—'}
              </div>
              <div className={`v3-detail-day-num${day.nacht25 > 0 ? ' night' : ''}`}>
                {fmtNum(day.nacht25) ?? '—'}
              </div>
              <div className="v3-detail-day-num">
                {fmtNum(day.fahrzeit) ?? '—'}
              </div>
            </div>
          );
        })}

        {/* Summen-Zeile */}
        <div className="v3-detail-day-row total-row" style={{ background: 'var(--p-50)' }}>
          <div className="v3-detail-day-date" style={{ color: 'var(--p-700)' }}>Gesamt</div>
          <div className="v3-detail-day-num" />
          <div className="v3-detail-day-num" />
          <div className="v3-detail-day-num" />
          <div className="v3-detail-day-num" style={{ color: 'var(--ink)', fontWeight: 700 }}>
            {Number(sheet.totals?.stundenTotal || 0).toFixed(2)}
          </div>
          <div className="v3-detail-day-num ot">
            {Number(sheet.totals?.ueberstunden25 || 0).toFixed(2)}
          </div>
          <div className="v3-detail-day-num ot">
            {Number(sheet.totals?.ueberstunden50 || 0).toFixed(2)}
          </div>
          <div className="v3-detail-day-num ot">
            {Number(sheet.totals?.ueberstunden100 || 0).toFixed(2)}
          </div>
          <div className="v3-detail-day-num night">
            {Number(sheet.totals?.nacht25 || 0).toFixed(2)}
          </div>
          <div className="v3-detail-day-num">
            {Number(sheet.totals?.fahrzeit || 0).toFixed(2)}
          </div>
        </div>
      </div>

      {/* Vergütungsabrechnung */}
      {hasGage && (
        <div className="v3-detail-earnings">
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 14 }}>
            Vergütung dieser Woche
          </div>
          <EarningRow label={`Bezahlte Tage${calc.totalKranktage > 0 ? ` (inkl. ${calc.totalKranktage} krank)` : ''}`} value={calc.totalBezahlteTage} />
          <EarningRow label={`Grundgage (${calc.totalBezahlteTage} × ${formatCurrency(calc.tagesgageEffective)})`} value={formatCurrency(calc.grundgage)} />
          {!settings.zeitkonto && calc.totalUeberstunden > 0 && (
            <EarningRow
              label={`Ü-Grundvergütung (${Number(calc.totalUeberstunden).toFixed(2)} Std. × ${formatCurrency(calc.stundensatz)})`}
              value={formatCurrency(calc.ueberstundenGrundverguetung)}
            />
          )}
          {settings.zeitkonto && calc.totalUeberstunden > 0 && (
            <EarningRow label={`Überstunden → Zeitkonto (${Number(calc.zeitkontoStunden).toFixed(2)} Std.)`} value="—" />
          )}
          {calc.totalUeberstundenZuschlag > 0 && (
            <EarningRow label="Ü-Zuschläge (25%/50%/100%)" value={formatCurrency(calc.totalUeberstundenZuschlag)} />
          )}
          {calc.nachtZuschlag > 0 && (
            <EarningRow label={`Nachtzuschlag 25% (${Number(calc.totalNacht).toFixed(2)} Std.)`} value={formatCurrency(calc.nachtZuschlag)} />
          )}
          {calc.samstagZuschlag > 0 && (
            <EarningRow label={`Sa-Zuschlag 25% (${Number(calc.totalSamstagsstunden).toFixed(2)} Std.)`} value={formatCurrency(calc.samstagZuschlag)} />
          )}
          {calc.sonntagZuschlag > 0 && (
            <EarningRow label={`So-Zuschlag 75% (${Number(calc.totalSonntagsstunden).toFixed(2)} Std.)`} value={formatCurrency(calc.sonntagZuschlag)} />
          )}
          {calc.feiertagZuschlag > 0 && (
            <EarningRow label={`Feiertagszuschlag 100% (${Number(calc.totalFeiertagsstunden).toFixed(2)} Std.)`} value={formatCurrency(calc.feiertagZuschlag)} />
          )}
          {calc.weeklyOTGrundverguetung > 0 && (
            <EarningRow label="Wöch. Ü Grundvergütung (TZ 5.4.3.3)" value={formatCurrency(calc.weeklyOTGrundverguetung)} />
          )}
          {calc.weeklyOTZuschlag25 > 0 && (
            <EarningRow label={`Wöch. Ü-Zuschlag 25% (${Number(calc.weeklyOT25).toFixed(2)} Std.)`} value={formatCurrency(calc.weeklyOTZuschlag25)} />
          )}
          {calc.weeklyOTZuschlag50 > 0 && (
            <EarningRow label={`Wöch. Ü-Zuschlag 50% (${Number(calc.weeklyOT50).toFixed(2)} Std.)`} value={formatCurrency(calc.weeklyOTZuschlag50)} />
          )}
          <div style={{ borderTop: '2px solid var(--border-token)', marginTop: 8, paddingTop: 10, display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 700, color: 'var(--mint-600)' }}>
            <span>Gesamtverdienst</span>
            <span>{formatCurrency(calc.gesamtVerdienst)}</span>
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: 'var(--muted)' }}>
            + {Number(calc.urlaubstage).toFixed(2)} Urlaubstag{calc.urlaubstage !== 1 ? 'e' : ''} gesammelt
          </div>
        </div>
      )}
    </div>
  );
}

function EarningRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border-token)', fontSize: 13, color: 'var(--text)' }}>
      <span>{label}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}

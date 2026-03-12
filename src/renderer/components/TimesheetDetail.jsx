import React, { useMemo } from 'react';
import { calculateSheetTVFFS } from '../utils/tvffsCalculator';
import { isHoliday } from '../utils/holidays';

export default function TimesheetDetail({ sheet, settings, onBack, onEdit, allTimesheets, onSelectSheet }) {
  const calc = calculateSheetTVFFS(sheet, settings);
  const fmt2 = v => { const n = parseFloat(v); return isNaN(n) || v === '' || v === null || v === undefined ? null : n.toFixed(2); };

  // Determine prev/next sheets for the same person (sorted by date)
  const { prevSheet, nextSheet } = useMemo(() => {
    if (!allTimesheets || !onSelectSheet) return {};
    const samePersonSheets = allTimesheets
      .filter(t => t.name === sheet.name)
      .sort((a, b) => {
        const dateA = a.days?.[0]?.datum || '';
        const dateB = b.days?.[0]?.datum || '';
        // Parse dd.mm.yyyy for comparison
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

  return (
    <div className="timesheet-detail">
      <div className="detail-top-bar">
        <button className="back-btn" onClick={onBack} aria-label="Zurück zur Liste">← Zurück</button>
        <div className="detail-nav-buttons">
          {prevSheet && (
            <button className="nav-prev-btn" onClick={() => onSelectSheet(prevSheet)} aria-label="Vorheriger Stundenzettel" title={`← KW ${prevSheet.days?.[0]?.datum || ''}`}>
              ← Vorherige
            </button>
          )}
          {nextSheet && (
            <button className="nav-next-btn" onClick={() => onSelectSheet(nextSheet)} aria-label="Nächster Stundenzettel" title={`KW ${nextSheet.days?.[0]?.datum || ''} →`}>
              Nächste →
            </button>
          )}
        </div>
        {onEdit && (
          <button className="edit-sheet-btn" onClick={() => onEdit(sheet)} aria-label="Stundenzettel bearbeiten">✏️ Bearbeiten</button>
        )}
      </div>

      <div className="detail-header">
        <div className="detail-meta">
          <h2>{sheet.projekt || 'Projekt'}</h2>
          <div className="detail-info-grid">
            <InfoItem label="Name" value={sheet.name} />
            <InfoItem label="Position" value={sheet.position} />
            <InfoItem label="Abteilung" value={sheet.abteilung} />
            <InfoItem label="Produktionsfirma" value={sheet.produktionsfirma} />
            <InfoItem label="Projektnummer" value={sheet.projektnummer} />
            <InfoItem label="Standardpause" value={`${sheet.pause} Std.`} />
          </div>
        </div>
      </div>

      {/* Tagesübersicht */}
      <div className="detail-section">
        <h3>Wochenübersicht</h3>
        <div className="table-wrapper">
          <table className="detail-table">
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
              {sheet.days.map((day, idx) => {
                const isActive = day.stundenTotal > 0 || day.start;
                const dayIsHoliday = day.datum ? isHoliday(day.datum) : false;
                return (
                  <tr key={idx} className={`${isActive ? 'row-active' : 'row-empty'} ${dayIsHoliday ? 'row-holiday' : ''} ${idx >= 5 ? 'row-weekend' : ''}`}>
                    <td className="col-tag">
                      {day.tag}
                      {dayIsHoliday && <span className="holiday-badge" title="Feiertag">🎄</span>}
                    </td>
                    <td>{day.datum || '—'}</td>
                    <td>{day.start || '—'}</td>
                    <td>{day.ende || '—'}</td>
                    <td>{day.pause || '—'}</td>
                    <td className="col-hours">{fmt2(day.stundenTotal) || '—'}</td>
                    <td className={day.ueberstunden25 > 0 ? 'highlight-yellow' : ''}>{fmt2(day.ueberstunden25) || '—'}</td>
                    <td className={day.ueberstunden50 > 0 ? 'highlight-orange' : ''}>{fmt2(day.ueberstunden50) || '—'}</td>
                    <td className={day.ueberstunden100 > 0 ? 'highlight-red' : ''}>{fmt2(day.ueberstunden100) || '—'}</td>
                    <td className={day.nacht25 > 0 ? 'highlight-indigo' : ''}>{fmt2(day.nacht25) || '—'}</td>
                    <td>{fmt2(day.fahrzeit) || '—'}</td>
                    <td className="col-notes">{day.anmerkungen || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="totals-row">
                <td colSpan="5"><strong>Summe</strong></td>
                <td className="col-hours"><strong>{Number(sheet.totals?.stundenTotal || 0).toFixed(2)}</strong></td>
                <td><strong>{Number(sheet.totals?.ueberstunden25 || 0).toFixed(2)}</strong></td>
                <td><strong>{Number(sheet.totals?.ueberstunden50 || 0).toFixed(2)}</strong></td>
                <td><strong>{Number(sheet.totals?.ueberstunden100 || 0).toFixed(2)}</strong></td>
                <td><strong>{Number(sheet.totals?.nacht25 || 0).toFixed(2)}</strong></td>
                <td><strong>{Number(sheet.totals?.fahrzeit || 0).toFixed(2)}</strong></td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Vergütung für diesen Zettel */}
      {settings.tagesgage > 0 && (
        <div className="detail-section">
          <h3>Vergütung dieser Woche</h3>
          <div className="detail-earnings">
            <div className="detail-earning-row">
              <span>Bezahlte Tage{calc.totalKranktage > 0 ? ` (inkl. ${calc.totalKranktage} krank)` : ''}</span>
              <span>{calc.totalBezahlteTage}</span>
            </div>
            <div className="detail-earning-row">
              <span>Grundgage ({calc.totalBezahlteTage} × {formatCurrency(calc.tagesgageEffective)})</span>
              <span>{formatCurrency(calc.grundgage)}</span>
            </div>
            {!settings.zeitkonto && calc.totalUeberstunden > 0 && (
              <div className="detail-earning-row">
                <span>Ü-Grundvergütung ({Number(calc.totalUeberstunden).toFixed(2)} Std. × {formatCurrency(calc.stundensatz)})</span>
                <span>{formatCurrency(calc.ueberstundenGrundverguetung)}</span>
              </div>
            )}
            {settings.zeitkonto && calc.totalUeberstunden > 0 && (
              <div className="detail-earning-row">
                <span>Überstunden → Zeitkonto ({Number(calc.zeitkontoStunden).toFixed(2)} Std.)</span>
                <span>—</span>
              </div>
            )}
            {calc.totalUeberstundenZuschlag > 0 && (
              <div className="detail-earning-row">
                <span>Ü-Zuschläge (25%/50%/100%)</span>
                <span>{formatCurrency(calc.totalUeberstundenZuschlag)}</span>
              </div>
            )}
            {calc.nachtZuschlag > 0 && (
              <div className="detail-earning-row">
                <span>Nachtzuschlag 25% ({Number(calc.totalNacht).toFixed(2)} Std.)</span>
                <span>{formatCurrency(calc.nachtZuschlag)}</span>
              </div>
            )}
            {calc.samstagZuschlag > 0 && (
              <div className="detail-earning-row">
                <span>Sa-Zuschlag 25% ({Number(calc.totalSamstagsstunden).toFixed(2)} Std.)</span>
                <span>{formatCurrency(calc.samstagZuschlag)}</span>
              </div>
            )}
            {calc.sonntagZuschlag > 0 && (
              <div className="detail-earning-row">
                <span>So-Zuschlag 75% ({Number(calc.totalSonntagsstunden).toFixed(2)} Std.)</span>
                <span>{formatCurrency(calc.sonntagZuschlag)}</span>
              </div>
            )}
            {calc.feiertagZuschlag > 0 && (
              <div className="detail-earning-row">
                <span>Feiertagszuschlag 100% ({Number(calc.totalFeiertagsstunden).toFixed(2)} Std.)</span>
                <span>{formatCurrency(calc.feiertagZuschlag)}</span>
              </div>
            )}
            {calc.weeklyOTGrundverguetung > 0 && (
              <div className="detail-earning-row">
                <span>Wöch. Ü Grundvergütung (TZ 5.4.3.3)</span>
                <span>{formatCurrency(calc.weeklyOTGrundverguetung)}</span>
              </div>
            )}
            {calc.weeklyOTZuschlag25 > 0 && (
              <div className="detail-earning-row">
                <span>Wöch. Ü-Zuschlag 25% ({Number(calc.weeklyOT25).toFixed(2)} Std.)</span>
                <span>{formatCurrency(calc.weeklyOTZuschlag25)}</span>
              </div>
            )}
            {calc.weeklyOTZuschlag50 > 0 && (
              <div className="detail-earning-row">
                <span>Wöch. Ü-Zuschlag 50% ({Number(calc.weeklyOT50).toFixed(2)} Std.)</span>
                <span>{formatCurrency(calc.weeklyOTZuschlag50)}</span>
              </div>
            )}
            <div className="detail-earning-row total">
              <span>Gesamtverdienst</span>
              <span>{formatCurrency(calc.gesamtVerdienst)}</span>
            </div>
            <div className="detail-earning-row">
              <span>+ {Number(calc.urlaubstage).toFixed(2)} Urlaubstag{calc.urlaubstage !== 1 ? 'e' : ''} gesammelt</span>
              <span></span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoItem({ label, value }) {
  if (!value) return null;
  return (
    <div className="info-item">
      <span className="info-label">{label}</span>
      <span className="info-value">{value}</span>
    </div>
  );
}

function formatCurrency(value) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value);
}

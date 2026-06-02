import React, { useState, useEffect } from 'react';

/**
 * Geführter Dialog nach einem n8n-Import. Phasen nacheinander:
 *  1. project — neu angelegte Projekte prüfen/ergänzen
 *  2. dev     — Zeit-Abweichungen (Initialen) der gemeinten Person zuordnen
 *  3. sub     — Vertretungen klären (für wen, Grund, Position, Aufrücken der Crew)
 *  4. name    — unbekannte Namen optional ins Team aufnehmen
 *
 * onComplete({ devChoices, subChoices, newPeople, projectData })
 */
export default function N8NImportOverlay({ deviations = [], substitutions = [], unknownNames = [], newProjects = [], onComplete, onCancel }) {
  const [projIdx, setProjIdx] = useState(0);
  const [devIdx, setDevIdx] = useState(0);
  const [subIdx, setSubIdx] = useState(0);
  const [nameIdx, setNameIdx] = useState(0);
  const [devChoices, setDevChoices] = useState({});
  const [subChoices, setSubChoices] = useState({});
  const [newPeople, setNewPeople] = useState([]);
  const [projectData, setProjectData] = useState({});
  const [projForm, setProjForm] = useState({ kuerzel: '', projektnummer: '', produktionsfirma: '', drehStartDatum: '' });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ position: '', email: '', phone: '', spezials: '' });
  const [subForm, setSubForm] = useState({ forWhom: '', reason: '', position: '', crewAdjust: {} });

  const phase = projIdx < newProjects.length ? 'project'
    : devIdx < deviations.length ? 'dev'
    : subIdx < substitutions.length ? 'sub'
    : (nameIdx < unknownNames.length ? 'name' : 'done');

  useEffect(() => {
    if (phase === 'done') onComplete({ devChoices, subChoices, newPeople, projectData });
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  if (phase === 'done') return null;

  // ---- Neues Projekt prüfen/ergänzen ----
  if (phase === 'project') {
    const projName = newProjects[projIdx];
    const saveProj = () => {
      setProjectData(d => ({ ...d, [projName]: { ...projForm, kuerzel: projForm.kuerzel.trim(), projektnummer: projForm.projektnummer.trim(), produktionsfirma: projForm.produktionsfirma.trim() } }));
      setProjForm({ kuerzel: '', projektnummer: '', produktionsfirma: '', drehStartDatum: '' });
      setProjIdx(i => i + 1);
    };
    const skipProj = () => {
      setProjectData(d => ({ ...d, [projName]: {} }));
      setProjForm({ kuerzel: '', projektnummer: '', produktionsfirma: '', drehStartDatum: '' });
      setProjIdx(i => i + 1);
    };
    return (
      <div className="confirm-overlay">
        <div className="confirm-dialog" style={{ maxWidth: 480 }}>
          <h3>Neues Projekt ({projIdx + 1}/{newProjects.length})</h3>
          <p>ZeitBlick legt das Projekt <strong>„{projName}"</strong> neu an. Du kannst hier gleich Details ergänzen:</p>
          <div className="team-form-grid" style={{ margin: '10px 0' }}>
            <div className="team-form-field">
              <label>Kürzel</label>
              <input type="text" value={projForm.kuerzel} onChange={e => setProjForm(f => ({ ...f, kuerzel: e.target.value }))} placeholder="z.B. PM" autoFocus />
            </div>
            <div className="team-form-field">
              <label>Projektnummer</label>
              <input type="text" value={projForm.projektnummer} onChange={e => setProjForm(f => ({ ...f, projektnummer: e.target.value }))} placeholder="z.B. 2026-042" />
            </div>
            <div className="team-form-field">
              <label>Produktionsfirma</label>
              <input type="text" value={projForm.produktionsfirma} onChange={e => setProjForm(f => ({ ...f, produktionsfirma: e.target.value }))} placeholder="z.B. Storytelle" />
            </div>
            <div className="team-form-field">
              <label>Drehstart</label>
              <input type="date" value={projForm.drehStartDatum} onChange={e => setProjForm(f => ({ ...f, drehStartDatum: e.target.value }))} />
            </div>
          </div>
          <div className="confirm-actions">
            <button className="btn-cancel" onClick={skipProj}>Ohne Details anlegen</button>
            <button className="btn btn-primary" onClick={saveProj}>Speichern</button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Abweichungs-Zuordnung (Initialen) ----
  if (phase === 'dev') {
    const d = deviations[devIdx];
    const choose = (name) => { setDevChoices(c => ({ ...c, [d.id]: name })); setDevIdx(i => i + 1); };
    return (
      <div className="confirm-overlay">
        <div className="confirm-dialog" style={{ maxWidth: 480 }}>
          <h3>Abweichung zuordnen ({devIdx + 1}/{deviations.length})</h3>
          <p>
            Am <strong>{d.datum}</strong> ({d.projekt}) gibt es eine zeitliche Abweichung
            <strong> „{d.initiale}" {d.start}–{d.ende}</strong>
            {d.teamStart && <> (Team: {d.teamStart}–{d.teamEnde})</>}.<br />
            Welche Person ist gemeint?
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '12px 0' }}>
            {d.candidates.map(name => (
              <button key={name} className="btn btn-secondary" style={{ justifyContent: 'flex-start' }} onClick={() => choose(name)}>
                {name}
              </button>
            ))}
          </div>
          <div className="confirm-actions">
            <button className="btn-cancel" onClick={() => choose(null)}>Überspringen</button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Vertretung klären ----
  if (phase === 'sub') {
    const s = substitutions[subIdx];
    const crew = s.crew || [];
    const advanceSub = (choice) => {
      if (choice) setSubChoices(c => ({ ...c, [s.id]: choice }));
      setSubForm({ forWhom: '', reason: '', position: '', crewAdjust: {} });
      setSubIdx(i => i + 1);
    };
    const positions = [...new Set(crew.map(c => c.position).filter(Boolean))];
    return (
      <div className="confirm-overlay">
        <div className="confirm-dialog" style={{ maxWidth: 520 }}>
          <h3>Vertretung klären ({subIdx + 1}/{substitutions.length})</h3>
          <p>
            <strong>{s.name}</strong> war am <strong>{s.datum}</strong> ({s.projekt}) als Vertretung im Einsatz.
          </p>
          <div className="team-form-grid" style={{ margin: '10px 0' }}>
            <div className="team-form-field">
              <label>Für wen?</label>
              <input list="sub-crew-list" value={subForm.forWhom} onChange={e => setSubForm(f => ({ ...f, forWhom: e.target.value }))} placeholder="Name der ausgefallenen Person" autoFocus />
              <datalist id="sub-crew-list">{crew.map(c => <option key={c.name} value={c.name} />)}</datalist>
            </div>
            <div className="team-form-field">
              <label>Grund des Ausfalls</label>
              <input value={subForm.reason} onChange={e => setSubForm(f => ({ ...f, reason: e.target.value }))} placeholder="z.B. krank, Urlaub" />
            </div>
            <div className="team-form-field">
              <label>Auf welcher Position hat {s.name.split(' ')[0]} gearbeitet?</label>
              <input list="sub-pos-list" value={subForm.position} onChange={e => setSubForm(f => ({ ...f, position: e.target.value }))} placeholder="z.B. Beleuchter" />
              <datalist id="sub-pos-list">{positions.map(p => <option key={p} value={p} />)}</datalist>
            </div>
          </div>

          {crew.length > 0 && (
            <details style={{ margin: '6px 0 12px' }}>
              <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--muted)' }}>
                Aufrücken der Stammcrew an diesem Tag (optional)
              </summary>
              <p className="settings-description" style={{ margin: '6px 0' }}>
                Wenn jemand aufgerückt ist (z.B. Best-Boy → Oberbeleuchter), hier die Position für diesen Tag eintragen. Wird in der Bemerkung vermerkt.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {crew.map(c => (
                  <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ flex: 1, fontSize: 13 }}>{c.name}{c.position ? ` (${c.position})` : ''}</span>
                    <input
                      style={{ flex: 1 }}
                      placeholder="Position heute (falls geändert)"
                      value={subForm.crewAdjust[c.name] || ''}
                      onChange={e => setSubForm(f => ({ ...f, crewAdjust: { ...f.crewAdjust, [c.name]: e.target.value } }))}
                    />
                  </div>
                ))}
              </div>
            </details>
          )}

          <div className="confirm-actions">
            <button className="btn-cancel" onClick={() => advanceSub(null)}>Überspringen</button>
            <button className="btn btn-primary" onClick={() => advanceSub({ ...subForm })}>Übernehmen</button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Unbekannte Person ----
  const currentName = unknownNames[nameIdx];
  const advance = () => { setShowForm(false); setForm({ position: '', email: '', phone: '', spezials: '' }); setNameIdx(i => i + 1); };
  const savePerson = () => {
    setNewPeople(p => [...p, { name: currentName, ...form }]);
    advance();
  };

  return (
    <div className="confirm-overlay">
      <div className="confirm-dialog" style={{ maxWidth: 480 }}>
        <h3>Neue Person ({nameIdx + 1}/{unknownNames.length})</h3>
        {!showForm ? (
          <>
            <p><strong>{currentName}</strong> ist noch nicht im Team. Zum Team hinzufügen?</p>
            <div className="confirm-actions">
              <button className="btn-cancel" onClick={advance}>Nein, überspringen</button>
              <button className="btn btn-primary" onClick={() => setShowForm(true)}>Ja, hinzufügen</button>
            </div>
          </>
        ) : (
          <>
            <p>Daten für <strong>{currentName}</strong>:</p>
            <div className="team-form-grid" style={{ margin: '10px 0' }}>
              <div className="team-form-field">
                <label>Position</label>
                <input type="text" value={form.position} onChange={e => setForm(f => ({ ...f, position: e.target.value }))} placeholder="z.B. Beleuchter" autoFocus />
              </div>
              <div className="team-form-field">
                <label>E-Mail</label>
                <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@example.com" />
              </div>
              <div className="team-form-field">
                <label>Telefon</label>
                <input type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+49 …" />
              </div>
              <div className="team-form-field">
                <label>Spezials</label>
                <input type="text" value={form.spezials} onChange={e => setForm(f => ({ ...f, spezials: e.target.value }))} placeholder="z.B. Führerschein, Kran…" />
              </div>
            </div>
            <div className="confirm-actions">
              <button className="btn-cancel" onClick={advance}>Doch nicht hinzufügen</button>
              <button className="btn btn-primary" onClick={savePerson}>Speichern</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

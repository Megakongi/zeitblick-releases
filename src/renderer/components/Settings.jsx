import React, { useState, useMemo } from 'react';
import { useUpdateChecker } from './UpdateOverlay';

export default function Settings({ settings, onSave, timesheets, setTimesheets }) {
  const [newPosition, setNewPosition] = useState('');
  const [newPositionGage, setNewPositionGage] = useState('');

  // Project management state
  const [newProjectName, setNewProjectName] = useState('');
  const [editingProject, setEditingProject] = useState(null);
  const [renamingProject, setRenamingProject] = useState(null);
  const [renameProjectValue, setRenameProjectValue] = useState('');

  // Crew management state
  const [newCrewName, setNewCrewName] = useState('');
  const [editingCrew, setEditingCrew] = useState(null); // crew name being edited
  const [renamingCrew, setRenamingCrew] = useState(null); // crew name being renamed
  const [renameValue, setRenameValue] = useState('');
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberPosition, setNewMemberPosition] = useState('');
  const [newMemberAbteilung, setNewMemberAbteilung] = useState('');

  // Backup state
  const [backups, setBackups] = useState([]);
  const [backupsLoaded, setBackupsLoaded] = useState(false);
  const [backupStatus, setBackupStatus] = useState(''); // status message
  const [importStatus, setImportStatus] = useState('');
  const [restoreConfirm, setRestoreConfirm] = useState(null);
  const [restoring, setRestoring] = useState(false);

  // Auto-Updater
  const { checking, result: updateResult, checkForUpdates } = useUpdateChecker();

  const positionGagen = settings.positionGagen || {};
  const nameAliases = settings.nameAliases || {};
  const crews = settings.crews || {};
  const projects = settings.projects || {};

  // ===== Project Management Handlers =====
  const handleAddProject = () => {
    if (!newProjectName.trim()) return;
    const updatedProjects = { ...projects, [newProjectName.trim()]: { projektnummer: '', produktionsfirma: '', crew: '', drehStartDatum: '' } };
    onSave({ ...settings, projects: updatedProjects });
    setNewProjectName('');
    setEditingProject(newProjectName.trim());
  };

  const handleDeleteProject = (name) => {
    const updatedProjects = { ...projects };
    delete updatedProjects[name];
    onSave({ ...settings, projects: updatedProjects });
    if (editingProject === name) setEditingProject(null);
  };

  const handleRenameProject = (oldName, newName) => {
    if (!newName.trim() || newName === oldName || projects[newName]) return;
    const updatedProjects = { ...projects };
    updatedProjects[newName.trim()] = updatedProjects[oldName];
    delete updatedProjects[oldName];
    onSave({ ...settings, projects: updatedProjects });
    if (editingProject === oldName) setEditingProject(newName.trim());
  };

  const handleUpdateProject = (projectName, field, value) => {
    let normalizedValue = value;
    // Normalize drehStartDatum: ensure 4-digit year (HTML date inputs may store 2-digit years)
    if (field === 'drehStartDatum' && value) {
      const parts = value.split('-');
      if (parts.length === 3) {
        let y = parseInt(parts[0]);
        if (y < 100) y += 2000;
        normalizedValue = String(y) + '-' + parts[1] + '-' + parts[2];
      }
    }
    const updatedProjects = { ...projects };
    updatedProjects[projectName] = { ...(updatedProjects[projectName] || {}), [field]: normalizedValue };
    onSave({ ...settings, projects: updatedProjects });
  };

  // Default positions if none configured yet
  const defaultPositions = ['Oberbeleuchter', 'Best-Boy', 'Beleuchter', 'Lichtassistent'];

  // All configured positions (defaults + manually added)
  const allPositions = useMemo(() => {
    const set = new Set([...defaultPositions, ...Object.keys(positionGagen)]);
    return [...set].sort();
  }, [positionGagen]);

  // Detect potential name duplicates (similar names that might be the same person)
  const nameGroups = useMemo(() => {
    if (!timesheets || timesheets.length === 0) return [];
    const names = [...new Set(timesheets.map(ts => ts.name || 'Unbekannt'))].sort();
    
    // Find names that could be aliases (one is a substring/prefix of another + same last name)
    const suggestions = [];
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const a = names[i];
        const b = names[j];
        const partsA = a.split(/\s+/);
        const partsB = b.split(/\s+/);
        // Same last name and one first name is prefix of the other
        if (partsA.length >= 2 && partsB.length >= 2) {
          const lastA = partsA[partsA.length - 1].toLowerCase();
          const lastB = partsB[partsB.length - 1].toLowerCase();
          if (lastA === lastB) {
            const firstA = partsA[0].toLowerCase();
            const firstB = partsB[0].toLowerCase();
            if (firstA.startsWith(firstB) || firstB.startsWith(firstA)) {
              // Longer name is the canonical one
              const canonical = a.length >= b.length ? a : b;
              const alias = a.length >= b.length ? b : a;
              suggestions.push({ alias, canonical });
            }
          }
        }
      }
    }
    return suggestions;
  }, [timesheets]);

  // All unique names from timesheets
  const allNames = useMemo(() => {
    if (!timesheets || timesheets.length === 0) return [];
    return [...new Set(timesheets.map(ts => ts.name || 'Unbekannt'))].sort();
  }, [timesheets]);

  const handlePositionGageChange = (pos, value) => {
    const numVal = parseFloat(String(value).replace(',', '.')) || 0;
    const pog = { ...positionGagen };
    pog[pos] = { ...(pog[pos] || {}), tagesgage: numVal, gageType: pog[pos]?.gageType || 'tag' };
    onSave({ ...settings, positionGagen: pog });
  };

  const handlePositionGageTypeChange = (pos, type) => {
    const pog = { ...positionGagen };
    pog[pos] = { ...(pog[pos] || {}), gageType: type };
    onSave({ ...settings, positionGagen: pog });
  };

  const handleAddPosition = () => {
    if (!newPosition.trim()) return;
    const numVal = parseFloat(String(newPositionGage).replace(',', '.')) || 0;
    const pog = { ...positionGagen };
    pog[newPosition.trim()] = { tagesgage: numVal, gageType: 'tag' };
    onSave({ ...settings, positionGagen: pog });
    setNewPosition('');
    setNewPositionGage('');
  };

  const handleDeletePosition = (pos) => {
    const pog = { ...positionGagen };
    delete pog[pos];
    onSave({ ...settings, positionGagen: pog });
  };

  // Name alias handlers
  const handleAddAlias = (alias, canonical) => {
    const na = { ...nameAliases, [alias]: canonical };
    onSave({ ...settings, nameAliases: na });
  };

  const handleRemoveAlias = (alias) => {
    const na = { ...nameAliases };
    delete na[alias];
    onSave({ ...settings, nameAliases: na });
  };

  // ===== Crew Management Handlers =====
  const handleAddCrew = () => {
    if (!newCrewName.trim()) return;
    const updatedCrews = { ...crews, [newCrewName.trim()]: { members: [] } };
    onSave({ ...settings, crews: updatedCrews });
    setNewCrewName('');
    setEditingCrew(newCrewName.trim());
  };

  const handleDeleteCrew = (crewName) => {
    const updatedCrews = { ...crews };
    delete updatedCrews[crewName];
    onSave({ ...settings, crews: updatedCrews });
    if (editingCrew === crewName) setEditingCrew(null);
  };

  const handleRenameCrew = (oldName, newName) => {
    if (!newName.trim() || newName === oldName || crews[newName]) return;
    const updatedCrews = { ...crews };
    updatedCrews[newName.trim()] = updatedCrews[oldName];
    delete updatedCrews[oldName];
    onSave({ ...settings, crews: updatedCrews });
    if (editingCrew === oldName) setEditingCrew(newName.trim());
  };

  const handleAddMember = (crewName) => {
    if (!newMemberName.trim()) return;
    const crew = { ...crews[crewName] };
    crew.members = [...(crew.members || []), {
      name: newMemberName.trim(),
      position: newMemberPosition.trim(),
      abteilung: newMemberAbteilung.trim(),
    }];
    onSave({ ...settings, crews: { ...crews, [crewName]: crew } });
    setNewMemberName('');
    setNewMemberPosition('');
    setNewMemberAbteilung('');
  };

  const handleRemoveMember = (crewName, memberIdx) => {
    const crew = { ...crews[crewName] };
    crew.members = crew.members.filter((_, i) => i !== memberIdx);
    onSave({ ...settings, crews: { ...crews, [crewName]: crew } });
  };

  const handleUpdateMember = (crewName, memberIdx, field, value) => {
    const crew = { ...crews[crewName] };
    crew.members = crew.members.map((m, i) => i === memberIdx ? { ...m, [field]: value } : m);
    onSave({ ...settings, crews: { ...crews, [crewName]: crew } });
  };

  // Unique names/positions/abteilungen from existing timesheets for suggestions
  const allNamesFromSheets = useMemo(() => {
    if (!timesheets || timesheets.length === 0) return [];
    return [...new Set(timesheets.map(ts => ts.name).filter(Boolean))].sort();
  }, [timesheets]);

  const allPositionsFromSheets = useMemo(() => {
    if (!timesheets || timesheets.length === 0) return [];
    return [...new Set(timesheets.map(ts => ts.position).filter(Boolean))].sort();
  }, [timesheets]);

  const allAbteilungenFromSheets = useMemo(() => {
    if (!timesheets || timesheets.length === 0) return [];
    return [...new Set(timesheets.map(ts => ts.abteilung).filter(Boolean))].sort();
  }, [timesheets]);

  return (
    <div className="settings-view">
      <h2>Einstellungen</h2>

      {/* Project Management */}
      <div className="settings-card">
        <h3>🎬 Projekte verwalten</h3>
        <p className="settings-description">Erstelle Projekte mit Produktionsname, Firma und Crew. Beim Erstellen von Stundenzetteln kannst du ein Projekt auswählen, um alle Felder automatisch auszufüllen. Der Drehtag wird automatisch in die Bemerkung geschrieben.</p>
        
        {Object.keys(projects).length > 0 && (
          <div className="crew-list">
            {Object.entries(projects).map(([projectName, project]) => (
              <div key={projectName} className={`crew-card ${editingProject === projectName ? 'crew-card-editing' : ''}`}>
                <div className="crew-card-header">
                  {renamingProject === projectName ? (
                    <div className="crew-rename-row">
                      <input
                        type="text"
                        value={renameProjectValue}
                        onChange={e => setRenameProjectValue(e.target.value)}
                        className="crew-rename-input"
                        autoFocus
                        onKeyDown={e => {
                          if (e.key === 'Enter') { handleRenameProject(projectName, renameProjectValue); setRenamingProject(null); }
                          if (e.key === 'Escape') setRenamingProject(null);
                        }}
                        onBlur={() => {
                          if (renameProjectValue.trim() && renameProjectValue !== projectName) {
                            handleRenameProject(projectName, renameProjectValue);
                          }
                          setRenamingProject(null);
                        }}
                        placeholder="Neuer Projektname..."
                      />
                      <button className="crew-rename-save" onClick={() => { handleRenameProject(projectName, renameProjectValue); setRenamingProject(null); }} title="Speichern">✓</button>
                    </div>
                  ) : (
                    <>
                      <div className="crew-card-title" onClick={() => setEditingProject(editingProject === projectName ? null : projectName)}>
                        <span className={`crew-chevron ${editingProject === projectName ? 'open' : ''}`}>›</span>
                        <span className="crew-name">{projectName}</span>
                        <span className="crew-member-count">
                          {project.produktionsfirma || 'Keine Firma'}
                          {project.crew ? ` · Crew: ${project.crew}` : ''}
                        </span>
                      </div>
                      <div className="crew-header-actions">
                        <button className="crew-action-btn" onClick={(e) => { e.stopPropagation(); setRenamingProject(projectName); setRenameProjectValue(projectName); }} title="Projekt umbenennen">✏️</button>
                        <button className="crew-action-btn crew-action-delete" onClick={() => handleDeleteProject(projectName)} title="Projekt löschen">🗑</button>
                      </div>
                    </>
                  )}
                </div>

                {editingProject === projectName && (
                  <div className="crew-card-body">
                    <div className="project-fields-grid">
                      <div className="project-field">
                        <label>Projektnummer</label>
                        <input
                          type="text"
                          value={project.projektnummer || ''}
                          onChange={e => handleUpdateProject(projectName, 'projektnummer', e.target.value)}
                          placeholder="z.B. 12345"
                        />
                      </div>
                      <div className="project-field">
                        <label>Produktionsfirma</label>
                        <input
                          type="text"
                          value={project.produktionsfirma || ''}
                          onChange={e => handleUpdateProject(projectName, 'produktionsfirma', e.target.value)}
                          placeholder="z.B. Bavaria Film"
                          list="suggest-firmen-project"
                        />
                      </div>
                      <div className="project-field">
                        <label>Crew zuweisen</label>
                        <select
                          value={project.crew || ''}
                          onChange={e => handleUpdateProject(projectName, 'crew', e.target.value)}
                          className="project-crew-select"
                        >
                          <option value="">Keine Crew</option>
                          {Object.entries(crews).map(([crewName, crew]) => (
                            <option key={crewName} value={crewName}>
                              {crewName} ({(crew.members || []).length} Personen)
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="project-field">
                        <label>Erster Drehtag</label>
                        <input
                          type="date"
                          value={project.drehStartDatum || ''}
                          onChange={e => handleUpdateProject(projectName, 'drehStartDatum', e.target.value)}
                        />
                        <span className="project-field-hint">Für automatische Drehtag-Berechnung</span>
                      </div>
                    </div>
                    {project.crew && crews[project.crew] && (
                      <div className="project-crew-preview">
                        <span className="project-crew-preview-label">Crew „{project.crew}":</span>
                        <div className="crew-preview-members">
                          {(crews[project.crew].members || []).map((m, i) => (
                            <span key={i} className="crew-preview-chip">{m.name}{m.position ? ` (${m.position})` : ''}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="crew-add-row">
          <input
            type="text"
            value={newProjectName}
            onChange={e => setNewProjectName(e.target.value)}
            className="crew-name-input"
            placeholder="Neues Projekt erstellen..."
            onKeyDown={e => e.key === 'Enter' && handleAddProject()}
          />
          <button className="spesen-add-btn" onClick={handleAddProject} title="Projekt erstellen">+</button>
        </div>

        {/* Datalist for firma suggestions in projects */}
        <datalist id="suggest-firmen-project">
          {[...new Set(timesheets.map(ts => ts.produktionsfirma).filter(Boolean))].map(f => <option key={f} value={f} />)}
        </datalist>
      </div>

      {/* Crew Management */}
      <div className="settings-card">
        <h3>👥 Crews verwalten</h3>
        <p className="settings-description">Erstelle Crews mit mehreren Personen. Beim Erstellen von Stundenzetteln kannst du eine Crew auswählen, um für alle Mitglieder gleichzeitig Zettel zu erstellen.</p>
        
        {Object.keys(crews).length > 0 && (
          <div className="crew-list">
            {Object.entries(crews).map(([crewName, crew]) => (
              <div key={crewName} className={`crew-card ${editingCrew === crewName ? 'crew-card-editing' : ''}`}>
                <div className="crew-card-header">
                  {renamingCrew === crewName ? (
                    <div className="crew-rename-row">
                      <input
                        type="text"
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        className="crew-rename-input"
                        autoFocus
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            handleRenameCrew(crewName, renameValue);
                            setRenamingCrew(null);
                          }
                          if (e.key === 'Escape') setRenamingCrew(null);
                        }}
                        onBlur={() => {
                          if (renameValue.trim() && renameValue !== crewName) {
                            handleRenameCrew(crewName, renameValue);
                          }
                          setRenamingCrew(null);
                        }}
                        placeholder="Neuer Crew-Name..."
                      />
                      <button className="crew-rename-save" onClick={() => { handleRenameCrew(crewName, renameValue); setRenamingCrew(null); }} title="Speichern">✓</button>
                    </div>
                  ) : (
                    <>
                      <div className="crew-card-title" onClick={() => setEditingCrew(editingCrew === crewName ? null : crewName)}>
                        <span className={`crew-chevron ${editingCrew === crewName ? 'open' : ''}`}>›</span>
                        <span className="crew-name">{crewName}</span>
                        <span className="crew-member-count">{(crew.members || []).length} Mitglieder</span>
                      </div>
                      <div className="crew-header-actions">
                        <button className="crew-action-btn" onClick={(e) => { e.stopPropagation(); setRenamingCrew(crewName); setRenameValue(crewName); }} title="Crew umbenennen">✏️</button>
                        <button className="crew-action-btn crew-action-delete" onClick={() => handleDeleteCrew(crewName)} title="Crew löschen">🗑</button>
                      </div>
                    </>
                  )}
                </div>

                {editingCrew === crewName && (
                  <div className="crew-card-body">
                    {(crew.members || []).length > 0 && (
                      <div className="crew-members-list">
                        {crew.members.map((member, idx) => (
                          <div key={idx} className="crew-member-row">
                            <input
                              type="text"
                              value={member.name}
                              onChange={e => handleUpdateMember(crewName, idx, 'name', e.target.value)}
                              className="crew-member-input crew-member-name"
                              placeholder="Name"
                              list="crew-suggest-names"
                            />
                            <input
                              type="text"
                              value={member.position}
                              onChange={e => handleUpdateMember(crewName, idx, 'position', e.target.value)}
                              className="crew-member-input crew-member-pos"
                              placeholder="Position"
                              list="crew-suggest-positions"
                            />
                            <input
                              type="text"
                              value={member.abteilung}
                              onChange={e => handleUpdateMember(crewName, idx, 'abteilung', e.target.value)}
                              className="crew-member-input crew-member-abt"
                              placeholder="Abteilung"
                              list="crew-suggest-abteilungen"
                            />
                            <button className="spesen-delete-btn" onClick={() => handleRemoveMember(crewName, idx)} title="Mitglied entfernen">×</button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="crew-member-row crew-member-add">
                      <input
                        type="text"
                        value={newMemberName}
                        onChange={e => setNewMemberName(e.target.value)}
                        className="crew-member-input crew-member-name"
                        placeholder="Neuer Name..."
                        list="crew-suggest-names"
                        onKeyDown={e => e.key === 'Enter' && handleAddMember(crewName)}
                      />
                      <input
                        type="text"
                        value={newMemberPosition}
                        onChange={e => setNewMemberPosition(e.target.value)}
                        className="crew-member-input crew-member-pos"
                        placeholder="Position"
                        list="crew-suggest-positions"
                        onKeyDown={e => e.key === 'Enter' && handleAddMember(crewName)}
                      />
                      <input
                        type="text"
                        value={newMemberAbteilung}
                        onChange={e => setNewMemberAbteilung(e.target.value)}
                        className="crew-member-input crew-member-abt"
                        placeholder="Abteilung"
                        list="crew-suggest-abteilungen"
                        onKeyDown={e => e.key === 'Enter' && handleAddMember(crewName)}
                      />
                      <button className="spesen-add-btn" onClick={() => handleAddMember(crewName)} title="Mitglied hinzufügen">+</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="crew-add-row">
          <input
            type="text"
            value={newCrewName}
            onChange={e => setNewCrewName(e.target.value)}
            className="crew-name-input"
            placeholder="Neue Crew erstellen..."
            onKeyDown={e => e.key === 'Enter' && handleAddCrew()}
          />
          <button className="spesen-add-btn" onClick={handleAddCrew} title="Crew erstellen">+</button>
        </div>

        {/* Datalists for autocomplete */}
        <datalist id="crew-suggest-names">
          {allNamesFromSheets.map(n => <option key={n} value={n} />)}
        </datalist>
        <datalist id="crew-suggest-positions">
          {allPositionsFromSheets.map(p => <option key={p} value={p} />)}
        </datalist>
        <datalist id="crew-suggest-abteilungen">
          {allAbteilungenFromSheets.map(a => <option key={a} value={a} />)}
        </datalist>
      </div>

      {/* Name Aliases */}
      {(Object.keys(nameAliases).length > 0 || nameGroups.length > 0) && (
        <div className="settings-card">
          <h3>👤 Namen zusammenführen</h3>
          <p className="settings-description">Gleiche Personen mit verschiedenen Schreibweisen zusammenfassen. Alle Einträge werden unter dem Hauptnamen zusammengeführt.</p>
          
          {/* Active aliases */}
          {Object.keys(nameAliases).length > 0 && (
            <div className="person-gage-list" style={{ marginBottom: '12px' }}>
              {Object.entries(nameAliases).map(([alias, canonical]) => (
                <div key={alias} className="person-gage-row">
                  <div className="person-gage-info">
                    <span className="person-gage-name">{alias}</span>
                    <span className="person-gage-position">→ wird als "{canonical}" behandelt</span>
                  </div>
                  <button className="spesen-delete-btn" onClick={() => handleRemoveAlias(alias)} title="Alias entfernen">×</button>
                </div>
              ))}
            </div>
          )}

          {/* Suggestions */}
          {nameGroups.filter(s => !nameAliases[s.alias]).length > 0 && (
            <div className="person-gage-list">
              <p className="settings-description" style={{ marginBottom: '8px', fontSize: '0.8rem', color: 'var(--accent-yellow, #f9ca24)' }}>⚠️ Mögliche Duplikate erkannt:</p>
              {nameGroups.filter(s => !nameAliases[s.alias]).map(s => (
                <div key={s.alias} className="person-gage-row" style={{ borderColor: 'var(--accent-yellow, #f9ca24)', borderStyle: 'dashed' }}>
                  <div className="person-gage-info">
                    <span className="person-gage-name">"{s.alias}" → "{s.canonical}"</span>
                    <span className="person-gage-position">Gleiche Person?</span>
                  </div>
                  <button className="apply-position-btn" style={{ width: 'auto', padding: '5px 14px', marginTop: 0, fontSize: '0.8rem' }} onClick={() => handleAddAlias(s.alias, s.canonical)}>
                    Zusammenführen
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Manual alias */}
          {allNames.length > 1 && (
            <ManualAliasAdder names={allNames} existingAliases={nameAliases} onAdd={handleAddAlias} />
          )}
        </div>
      )}

      {/* Position-based Gage Defaults */}
      <div className="settings-card">
        <h3>🎬 Gagen nach Position</h3>
        <p className="settings-description">Standard-Gagen für Positionen festlegen. Diese Gagen werden automatisch für Personen mit der jeweiligen Position verwendet.</p>
        <div className="person-gage-list">
          {allPositions.map(pos => {
            const pg = positionGagen[pos] || {};
            const gt = pg.gageType || 'tag';
            return (
              <div key={pos} className="person-gage-row">
                <div className="person-gage-info">
                  <span className="person-gage-name">{pos}</span>
                </div>
                <div className="person-gage-inputs">
                  <div className="mini-gage-toggle">
                    <button className={`mini-toggle-btn ${gt === 'tag' ? 'active' : ''}`} onClick={() => handlePositionGageTypeChange(pos, 'tag')}>Tag</button>
                    <button className={`mini-toggle-btn ${gt === 'woche' ? 'active' : ''}`} onClick={() => handlePositionGageTypeChange(pos, 'woche')}>Woche</button>
                  </div>
                  <div className="person-gage-input-group">
                    <input
                      type="text"
                      className="person-gage-input"
                      value={pg.tagesgage || ''}
                      onChange={e => handlePositionGageChange(pos, e.target.value)}
                      placeholder={gt === 'tag' ? 'z.B. 500' : 'z.B. 2.500'}
                    />
                    <span className="person-gage-unit">€/{gt === 'tag' ? 'Tag' : 'Wo.'}</span>
                  </div>
                  {!defaultPositions.includes(pos) && (
                    <button className="spesen-delete-btn" onClick={() => handleDeletePosition(pos)} title="Position entfernen">×</button>
                  )}
                </div>
              </div>
            );
          })}
          <div className="person-gage-row person-gage-add">
            <input
              type="text"
              className="person-gage-input"
              placeholder="Neue Position..."
              value={newPosition}
              onChange={e => setNewPosition(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddPosition()}
            />
            <input
              type="text"
              className="person-gage-input"
              placeholder="Gage"
              value={newPositionGage}
              onChange={e => setNewPositionGage(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddPosition()}
            />
            <button className="spesen-add-btn" onClick={handleAddPosition} title="Position hinzufügen">+</button>
          </div>
        </div>
      </div>

      {/* Backup & Data Management */}
      <div className="settings-card">
        <h3>💾 Backup & Daten</h3>
        <p className="settings-description">Erstelle Backups deiner Daten, stelle sie wieder her, oder exportiere/importiere alle Daten.</p>
        
        <div className="backup-actions-grid">
          <div className="backup-action-group">
            <h4 className="backup-group-title">Backup</h4>
            <button className="backup-btn backup-btn-create" onClick={async () => {
              try {
                setBackupStatus('Erstelle Backup...');
                const result = await window.electronAPI.createBackup();
                if (result.success) {
                  setBackupStatus(`✅ Backup erstellt: ${result.path.split('/').pop()}`);
                  setBackupsLoaded(false); // refresh list
                } else {
                  setBackupStatus(`❌ Fehler: ${result.error}`);
                }
              } catch (e) { setBackupStatus(`❌ ${e.message}`); }
            }}>
              📦 Backup erstellen
            </button>
            <button className="backup-btn" onClick={async () => {
              try {
                const list = await window.electronAPI.listBackups();
                if (list.success) {
                  setBackups(list.backups || []);
                  setBackupsLoaded(true);
                } else {
                  setBackupStatus(`❌ ${list.error}`);
                }
              } catch (e) { setBackupStatus(`❌ ${e.message}`); }
            }}>
              📋 Backups anzeigen
            </button>
          </div>

          <div className="backup-action-group">
            <h4 className="backup-group-title">Daten-Export/Import</h4>
            <button className="backup-btn" onClick={async () => {
              try {
                setImportStatus('Exportiere...');
                const result = await window.electronAPI.exportData();
                if (result.success) {
                  setImportStatus(`✅ Exportiert nach: ${result.path.split('/').pop()}`);
                } else if (result.cancelled) {
                  setImportStatus('');
                } else {
                  setImportStatus(`❌ ${result.error}`);
                }
              } catch (e) { setImportStatus(`❌ ${e.message}`); }
            }}>
              📤 Daten exportieren (JSON)
            </button>
            <button className="backup-btn" onClick={async () => {
              if (!confirm('Importierte Daten ERSETZEN alle aktuellen Daten. Vorher ein Backup erstellen!\n\nFortfahren?')) return;
              try {
                setImportStatus('Importiere...');
                const result = await window.electronAPI.importDataFile();
                if (result.success) {
                  setImportStatus(`✅ ${result.count || 0} Stundenzettel importiert. App wird neu geladen...`);
                  setTimeout(() => window.location.reload(), 1500);
                } else if (result.cancelled) {
                  setImportStatus('');
                } else {
                  setImportStatus(`❌ ${result.error}`);
                }
              } catch (e) { setImportStatus(`❌ ${e.message}`); }
            }}>
              📥 Daten importieren (JSON)
            </button>
          </div>
        </div>

        {backupStatus && <p className="backup-status">{backupStatus}</p>}
        {importStatus && <p className="backup-status">{importStatus}</p>}

        {/* Backup list */}
        {backupsLoaded && backups.length > 0 && (
          <div className="backup-list">
            <h4>Vorhandene Backups ({backups.length})</h4>
            {backups.map((b, i) => (
              <div key={i} className="backup-row">
                <div className="backup-row-info">
                  <span className="backup-row-name">{b.name}</span>
                  <span className="backup-row-date">{new Date(b.created).toLocaleString('de-DE')}</span>
                  <span className="backup-row-size">{(b.size / 1024).toFixed(0)} KB</span>
                </div>
                <button className="backup-btn backup-btn-restore" onClick={() => setRestoreConfirm(b)}>
                  🔄 Wiederherstellen
                </button>
              </div>
            ))}
          </div>
        )}
        {backupsLoaded && backups.length === 0 && (
          <p className="settings-description" style={{ marginTop: '8px' }}>Keine Backups vorhanden.</p>
        )}

        {/* Restore confirmation dialog */}
        {restoreConfirm && (
          <div className="confirm-overlay">
            <div className="confirm-dialog">
              <h3>Backup wiederherstellen?</h3>
              <p>Alle aktuellen Daten werden durch das Backup <strong>{restoreConfirm.name}</strong> vom {new Date(restoreConfirm.created).toLocaleString('de-DE')} ersetzt.</p>
              <p style={{ color: 'var(--accent-red, #e74c3c)' }}>⚠️ Diese Aktion kann nicht rückgängig gemacht werden!</p>
              <div className="confirm-actions">
                <button className="btn-cancel" onClick={() => setRestoreConfirm(null)} disabled={restoring}>Abbrechen</button>
                <button className="btn-confirm-delete" onClick={async () => {
                  setRestoring(true);
                  try {
                    const result = await window.electronAPI.restoreBackup(restoreConfirm.path);
                    if (result.success) {
                      setBackupStatus('✅ Backup wiederhergestellt. App wird neu geladen...');
                      setRestoreConfirm(null);
                      setTimeout(() => window.location.reload(), 1500);
                    } else {
                      setBackupStatus(`❌ ${result.error}`);
                      setRestoreConfirm(null);
                    }
                  } catch (e) {
                    setBackupStatus(`❌ ${e.message}`);
                    setRestoreConfirm(null);
                  }
                  setRestoring(false);
                }} disabled={restoring}>
                  {restoring ? '⏳ Wiederherstellung...' : 'Wiederherstellen'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Updates */}
      <div className="settings-card">
        <h3>🔄 Updates</h3>
        <p className="settings-description">ZeitBlick prüft automatisch auf neue Versionen. Du kannst auch manuell nach Updates suchen.</p>
        <div className="update-check-section">
          <button className="backup-btn" onClick={checkForUpdates} disabled={checking}>
            {checking ? '⏳ Prüfe...' : '🔍 Nach Updates suchen'}
          </button>
          {updateResult && (
            <span className="update-check-result">
              {updateResult.error 
                ? `❌ ${updateResult.error}` 
                : updateResult.success && updateResult.updateInfo
                  ? `✅ Version ${updateResult.updateInfo.version} verfügbar!`
                  : '✅ Du hast die neueste Version.'
              }
            </span>
          )}
        </div>
      </div>

      <div className="settings-card">
        <h3>TV-FFS 2025 – Berechnungsregeln</h3>
        <p className="settings-description">Tarifvertrag vom 12. Oktober 2024, Gagentarifvertrag 2024-2026</p>
        <div className="tvffs-info">
          <div className="tvffs-rule">
            <span className="rule-label">Wochengage (TZ 5.3.1)</span>
            <span className="rule-value">5-Tage-Woche, bis 50h/Woche</span>
          </div>
          <div className="tvffs-rule">
            <span className="rule-label">Stundengage (TZ 5.7.1)</span>
            <span className="rule-value">1/10 Tagesgage = 1/50 Wochengage</span>
          </div>
          <div className="tvffs-rule">
            <span className="rule-label">Tägl. Mehrarbeit (TZ 5.4.3.2)</span>
            <span className="rule-value">11. Std: 25%, ab 12. Std: 50%</span>
          </div>
          <div className="tvffs-rule">
            <span className="rule-label">Wöch. Mehrarbeit (TZ 5.4.3.3)</span>
            <span className="rule-value">51.–55. Std: 25%, ab 56. Std: 50%</span>
          </div>
          <div className="tvffs-rule">
            <span className="rule-label">Nachtzuschlag (TZ 5.5)</span>
            <span className="rule-value">25% (22:00–06:00)</span>
          </div>
          <div className="tvffs-rule">
            <span className="rule-label">Samstag (TZ 5.6.4)</span>
            <span className="rule-value">25% Zuschlag</span>
          </div>
          <div className="tvffs-rule">
            <span className="rule-label">Sonntag (TZ 5.6.3)</span>
            <span className="rule-value">75% Zuschlag + Ruhetag</span>
          </div>
          <div className="tvffs-rule">
            <span className="rule-label">Feiertag (TZ 5.6.3)</span>
            <span className="rule-value">100% Zuschlag</span>
          </div>
          <div className="tvffs-rule">
            <span className="rule-label">Urlaub (TZ 14.1)</span>
            <span className="rule-value">0,5 Tage / 7 Tage Vertragszeit (gesammelt, nicht ausgezahlt)</span>
          </div>
          <div className="tvffs-rule">
            <span className="rule-label">Krankheit (TZ 13.3)</span>
            <span className="rule-value">Bezahlter Tag, bis 6 Wochen</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Small sub-component for manually adding aliases
function ManualAliasAdder({ names, existingAliases, onAdd }) {
  const [aliasFrom, setAliasFrom] = useState('');
  const [aliasTo, setAliasTo] = useState('');

  const availableNames = names.filter(n => !existingAliases[n]);

  const handleAdd = () => {
    if (aliasFrom && aliasTo && aliasFrom !== aliasTo) {
      onAdd(aliasFrom, aliasTo);
      setAliasFrom('');
      setAliasTo('');
    }
  };

  return (
    <div className="person-gage-row person-gage-add" style={{ marginTop: '10px' }}>
      <select
        className="person-gage-input"
        value={aliasFrom}
        onChange={e => setAliasFrom(e.target.value)}
        style={{ width: '140px' }}
      >
        <option value="">Alias-Name...</option>
        {availableNames.map(n => <option key={n} value={n}>{n}</option>)}
      </select>
      <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>→</span>
      <select
        className="person-gage-input"
        value={aliasTo}
        onChange={e => setAliasTo(e.target.value)}
        style={{ width: '140px' }}
      >
        <option value="">Hauptname...</option>
        {availableNames.filter(n => n !== aliasFrom).map(n => <option key={n} value={n}>{n}</option>)}
      </select>
      <button className="spesen-add-btn" onClick={handleAdd} title="Alias hinzufügen">+</button>
    </div>
  );
}

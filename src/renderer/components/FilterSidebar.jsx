import React from 'react';

/* ZeitBlick Filter-Sidebar (Redesign)
 * Sekundäre Sidebar zwischen Icon-Sidebar und Main-Content.
 * Zeigt Personen (mit Anzahl Stundenzetteln), Projekte und Zeitraum.
 */

// Stable color for a person name (hash → palette index)
const PERSON_PALETTE = ['#6366F1', '#22C58F', '#F59E0B', '#F43F5E', '#06B6D4', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];
function colorFor(name = '') {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PERSON_PALETTE[h % PERSON_PALETTE.length];
}

export default function FilterSidebar({
  persons = [],
  personCounts = {},
  personFilter,
  onPersonFilter,
  projects = [],
  projectCounts = {},
  projectFilter,
  onProjectFilter,
  timeFilter = 'all',
  onTimeFilter,
}) {
  const totalSheets = Object.values(personCounts).reduce((s, n) => s + n, 0);
  const projectSelected = projectFilter && projectFilter !== 'all';

  return (
    <aside className="app-filterbar" aria-label="Filter">
      {projects.length > 0 && (
        <div className="fb-section">
          <div className="fb-label">Projekte</div>
          <ul className="fb-list">
            <li>
              <button
                className={`fb-item ${projectFilter === 'all' ? 'active' : ''}`}
                onClick={() => onProjectFilter('all')}
              >
                <span className="fb-item-name">Alle Projekte</span>
              </button>
            </li>
            {projects.map(name => (
              <li key={name}>
                <button
                  className={`fb-item ${projectFilter === name ? 'active' : ''}`}
                  onClick={() => onProjectFilter(name)}
                  title={name}
                >
                  <span className="fb-dot" style={{ background: colorFor(name) }} aria-hidden="true"></span>
                  <span className="fb-item-name">{name}</span>
                  <span className="fb-item-count">{projectCounts[name] || 0}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="fb-section">
        <div className="fb-label">Personen</div>
        <ul className="fb-list">
          <li>
            <button
              className={`fb-item ${personFilter === 'all' ? 'active' : ''}`}
              onClick={() => onPersonFilter('all')}
            >
              <span className="fb-dot" style={{ background: 'var(--border-strong)' }} aria-hidden="true"></span>
              <span className="fb-item-name">Alle Personen</span>
              <span className="fb-item-count">{totalSheets}</span>
            </button>
          </li>
          {projectSelected && persons.map(name => (
            <li key={name}>
              <button
                className={`fb-item ${personFilter === name ? 'active' : ''}`}
                onClick={() => onPersonFilter(name)}
                title={name}
              >
                <span className="fb-dot" style={{ background: colorFor(name) }} aria-hidden="true"></span>
                <span className="fb-item-name">{name}</span>
                <span className="fb-item-count">{personCounts[name] || 0}</span>
              </button>
            </li>
          ))}
          {projectSelected && persons.length === 0 && (
            <li style={{ padding: '8px 10px', color: 'var(--muted)', fontSize: 12 }}>
              Keine Personen im Projekt.
            </li>
          )}
          {!projectSelected && projects.length > 0 && (
            <li style={{ padding: '6px 10px', color: 'var(--muted)', fontSize: 12, fontStyle: 'italic' }}>
              Projekt wählen für Einzelpersonen.
            </li>
          )}
        </ul>
      </div>

      {onTimeFilter && (
        <div className="fb-section">
          <div className="fb-label">Zeitraum</div>
          <ul className="fb-list">
            {[
              { key: 'all', label: 'Alle Zeiträume' },
              { key: 'week', label: 'Aktuelle Woche' },
              { key: '4weeks', label: 'Letzte 4 Wochen' },
              { key: 'month', label: 'Aktueller Monat' },
            ].map(({ key, label }) => (
              <li key={key}>
                <button
                  className={`fb-item ${timeFilter === key ? 'active' : ''}`}
                  onClick={() => onTimeFilter(key)}
                >
                  <span className="fb-item-name">{label}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}

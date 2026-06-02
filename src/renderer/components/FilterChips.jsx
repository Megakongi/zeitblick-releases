import React from 'react';

/* ZeitBlick Filter-Chips
 * Zeigt aktive Filter (Person, Projekt) als Pillen mit ×-Button.
 * Erscheint nur, wenn mindestens ein Filter gesetzt ist.
 */

export default function FilterChips({
  personFilter,
  onPersonFilter,
  projectFilter,
  onProjectFilter,
}) {
  const chips = [];
  if (personFilter && personFilter !== 'all') {
    chips.push({ key: 'person', label: 'Person', value: personFilter, clear: () => onPersonFilter('all') });
  }
  if (projectFilter && projectFilter !== 'all') {
    chips.push({ key: 'projekt', label: 'Projekt', value: projectFilter, clear: () => onProjectFilter('all') });
  }
  if (chips.length === 0) return null;

  const clearAll = () => {
    if (personFilter && personFilter !== 'all') onPersonFilter('all');
    if (projectFilter && projectFilter !== 'all') onProjectFilter('all');
  };

  return (
    <div className="filter-chips" role="region" aria-label="Aktive Filter">
      {chips.map(c => (
        <span className="filter-chip" key={c.key}>
          {c.label}: <strong>{c.value}</strong>
          <button
            className="filter-chip-x"
            onClick={c.clear}
            aria-label={`Filter ${c.label} entfernen`}
            title="Filter entfernen"
          >
            ×
          </button>
        </span>
      ))}
      {chips.length > 1 && (
        <button className="filter-chips-clear" onClick={clearAll}>
          Alle Filter löschen
        </button>
      )}
    </div>
  );
}

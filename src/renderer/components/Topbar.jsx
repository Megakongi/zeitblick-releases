import React, { useState, useEffect } from 'react';

/* ZeitBlick Topbar — Redesign V2
 * Minimale Bar: Breadcrumbs links, Aktionen rechts.
 * Suche lebt jetzt in der Sidebar.
 */

const Icon = ({ children, size = 16, strokeWidth = 1.8 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

const IconUpload = () => (
  <Icon>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </Icon>
);
const IconPlus = () => (
  <Icon strokeWidth={2}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </Icon>
);
const IconChevronDown = () => (
  <Icon size={14}>
    <polyline points="6 9 12 15 18 9" />
  </Icon>
);

const VIEW_LABELS = {
  dashboard:  'Übersicht',
  timesheets: 'Stundenzettel',
  calendar:   'Kalender',
  detail:     'Detail',
  create:     'Neuer Stundenzettel',
  team:       'Team & Projekte',
  settings:   'Einstellungen',
};

export default function Topbar({
  currentView,
  contextLabel,
  onCreate,
  onImport,
  onImportFolder,
  onSearch,
  theme,
  onToggleTheme,
  userInitials = 'TP',
}) {
  const [importOpen, setImportOpen] = useState(false);

  // Close import menu on outside click
  useEffect(() => {
    if (!importOpen) return;
    const close = () => setImportOpen(false);
    setTimeout(() => document.addEventListener('click', close), 0);
    return () => document.removeEventListener('click', close);
  }, [importOpen]);

  const viewLabel = VIEW_LABELS[currentView] || currentView;

  return (
    <header className="app-topbar" role="banner">
      {/* Breadcrumbs */}
      <div className="topbar-crumbs">
        <strong>{viewLabel}</strong>
        {contextLabel && (
          <>
            <span className="topbar-crumb-sep">›</span>
            <span className="topbar-context">{contextLabel}</span>
          </>
        )}
      </div>

      {/* Actions */}
      <div className="topbar-actions">
        {/* Import dropdown — hidden on views that have their own import UI */}
        {onImport && <div style={{ position: 'relative' }}>
          <button
            className="btn-secondary"
            type="button"
            onClick={(e) => { e.stopPropagation(); setImportOpen(v => !v); }}
            aria-haspopup="true"
            aria-expanded={importOpen}
          >
            <IconUpload />
            Import
            <IconChevronDown />
          </button>
          {importOpen && (
            <div
              role="menu"
              style={{
                position: 'absolute',
                right: 0, top: 'calc(100% + 6px)',
                background: 'var(--card)',
                border: '1px solid var(--border-token)',
                borderRadius: 'var(--r-md)',
                boxShadow: 'var(--shadow)',
                padding: 6,
                minWidth: 220,
                zIndex: 50,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="btn-ghost"
                style={{ width: '100%', justifyContent: 'flex-start' }}
                onClick={() => { setImportOpen(false); onImport && onImport(); }}
                role="menuitem"
              >
                PDF-Dateien wählen…
              </button>
              <button
                className="btn-ghost"
                style={{ width: '100%', justifyContent: 'flex-start' }}
                onClick={() => { setImportOpen(false); onImportFolder && onImportFolder(); }}
                role="menuitem"
              >
                Ordner mit PDFs wählen…
              </button>
              <div style={{ padding: '6px 12px', fontSize: 11, color: 'var(--muted)' }}>
                Tipp: PDFs auch per Drag-and-Drop ablegen.
              </div>
            </div>
          )}
        </div>}

        <button className="btn-primary" type="button" onClick={onCreate}>
          <IconPlus />
          Neuer Stundenzettel
        </button>
      </div>
    </header>
  );
}

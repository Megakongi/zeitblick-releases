import React from 'react';

const PERSON_COLORS = ['#4a7dff', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#14b8a6', '#6366f1', '#f97316'];

export default function Sidebar({ currentView, onNavigate, onImport, onImportFolder, onCreate, onSearch, timesheetCount, theme, onToggleTheme }) {

  const navItems = [
    { id: 'dashboard', label: 'Übersicht', icon: '📊' },
    { id: 'timesheets', label: 'Einträge', icon: '📋', badge: timesheetCount },
    { id: 'create', label: 'Erstellen', icon: '✏️' },
    { id: 'settings', label: 'Einstellungen', icon: '⚙️' },
  ];

  return (
    <aside className="sidebar" role="navigation" aria-label="Hauptnavigation">
      <div className="sidebar-header">
        <h1 className="sidebar-title">ZeitBlick</h1>
        <span className="sidebar-subtitle">Arbeitszeitverwaltung</span>
      </div>

      <nav className="sidebar-nav" aria-label="Seitennavigation">
        {navItems.map(item => (
          <button
            key={item.id}
            className={`nav-item ${currentView === item.id ? 'active' : ''}`}
            onClick={() => item.id === 'create' ? onCreate() : onNavigate(item.id)}
            aria-label={item.label}
            aria-current={currentView === item.id ? 'page' : undefined}
          >
            <span className="nav-icon" aria-hidden="true">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
            {item.badge > 0 && <span className="nav-badge" aria-label={`${item.badge} Einträge`}>{item.badge}</span>}
          </button>
        ))}
      </nav>

      {/* Search button */}
      <button className="search-trigger-btn" onClick={onSearch} aria-label="Suche öffnen (⌘K)">
        <span className="search-trigger-icon" aria-hidden="true">🔍</span>
        <span className="search-trigger-label">Suche…</span>
        <kbd className="search-trigger-kbd">⌘K</kbd>
      </button>

      <div className="sidebar-footer">
        <button className="import-btn" onClick={onImport} aria-label="PDF importieren">
          <span className="import-icon" aria-hidden="true">+</span>
          PDF importieren
        </button>
        <button className="import-btn import-folder-btn" onClick={onImportFolder} aria-label="Ordner importieren">
          <span className="import-icon" aria-hidden="true">📂</span>
          Ordner importieren
        </button>
        <button className="theme-toggle-btn" onClick={onToggleTheme} aria-label={theme === 'dark' ? 'Zu hellem Modus wechseln' : 'Zu dunklem Modus wechseln'}>
          <span className="theme-icon" aria-hidden="true">{theme === 'dark' ? '☀️' : '🌙'}</span>
          <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
        </button>
        <div className="sidebar-version">v1.3</div>
      </div>
    </aside>
  );
}

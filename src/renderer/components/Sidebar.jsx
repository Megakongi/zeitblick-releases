import React from 'react';

/* ZeitBlick Sidebar — Redesign V2
 * Breite 240px-Sidebar mit Text-Labels, Brand, Schnellsuche,
 * Navigationssektionen und Projektfilter-Quicklinks.
 */

const Icon = ({ children, size = 16 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

const IconHome = () => (
  <Icon>
    <path d="M3 12l9-9 9 9" />
    <path d="M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10" />
  </Icon>
);
const IconSheets = () => (
  <Icon>
    <rect x="4" y="3" width="16" height="18" rx="2" />
    <line x1="8" y1="8" x2="16" y2="8" />
    <line x1="8" y1="12" x2="16" y2="12" />
    <line x1="8" y1="16" x2="13" y2="16" />
  </Icon>
);
const IconDispo = () => (
  <Icon>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <line x1="3" y1="9" x2="21" y2="9" />
    <line x1="8" y1="4" x2="8" y2="20" />
    <line x1="11" y1="13" x2="18" y2="13" />
    <line x1="11" y1="16" x2="16" y2="16" />
  </Icon>
);
const IconAbrechnung = () => (
  <Icon>
    <rect x="4" y="2" width="16" height="20" rx="2" />
    <line x1="8" y1="7" x2="16" y2="7" />
    <line x1="8" y1="11" x2="16" y2="11" />
    <line x1="8" y1="15" x2="12" y2="15" />
    <path d="M14 17l1.5 1.5L18 15" />
  </Icon>
);
const IconSesam = () => (
  <Icon>
    <path d="M9 3H5a2 2 0 0 0-2 2v4"/><path d="M9 21H5a2 2 0 0 1-2-2v-4"/>
    <path d="M15 3h4a2 2 0 0 1 2 2v4"/><path d="M15 21h4a2 2 0 0 0 2-2v-4"/>
    <line x1="9" y1="12" x2="15" y2="12"/>
    <line x1="12" y1="9" x2="12" y2="15"/>
  </Icon>
);
const IconTeam = () => (
  <Icon>
    <path d="M17 20v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="3" />
    <path d="M23 20v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </Icon>
);
const IconSettings = () => (
  <Icon>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1A2 2 0 1 1 4.3 17l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1A1.7 1.7 0 0 0 10 3.1V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </Icon>
);
const IconSearch = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--hint)' }}>
    <circle cx="11" cy="11" r="7" />
    <line x1="21" y1="21" x2="16.6" y2="16.6" />
  </svg>
);
const IconClock = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <polyline points="12 7 12 12 15 14" />
  </svg>
);
const IconSun = () => (
  <Icon size={15}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2" /><path d="M12 20v2" />
    <path d="M4.93 4.93l1.41 1.41" /><path d="M17.66 17.66l1.41 1.41" />
    <path d="M2 12h2" /><path d="M20 12h2" />
    <path d="M4.93 19.07l1.41-1.41" /><path d="M17.66 6.34l1.41-1.41" />
  </Icon>
);
const IconMoon = () => (
  <Icon size={15}>
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </Icon>
);

// Stable colour for a project name (hash → palette)
const PROJECT_PALETTE = ['#5159E8', '#1FB97A', '#E0A82E', '#E83A3A', '#06B6D4', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];
function colorFor(name = '') {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PROJECT_PALETTE[h % PROJECT_PALETTE.length];
}

export default function Sidebar({
  currentView,
  onNavigate,
  timesheetCount,
  sesamCount = 0,
  projects = [],
  projectCounts = {},
  projectFilter = 'all',
  onProjectFilter,
  onSearch,
  theme = 'light',
  onToggleTheme,
  userInitials = 'TP',
}) {
  const isDark = theme === 'dark';

  const navItems = [
    { id: 'dashboard',     label: 'Übersicht',       icon: <IconHome />,        badge: 0 },
    { id: 'timesheets',    label: 'Stundenzettel',    icon: <IconSheets />,      badge: timesheetCount },
    { id: 'dispos',        label: 'Dispos',           icon: <IconDispo />,       badge: 0 },
    { id: 'abrechnungen',  label: 'Abrechnungen',     icon: <IconAbrechnung />,  badge: 0 },
    { id: 'sesam',         label: 'Sesam Abgleich',   icon: <IconSesam />,       badge: sesamCount },
  ];
  const masterItems = [
    { id: 'team',     label: 'Team & Projekte', icon: <IconTeam /> },
  ];

  return (
    <aside className="app-sidebar" role="navigation" aria-label="Hauptnavigation">

      {/* Brand */}
      <div className="app-sidebar-brand">
        <div className="app-sidebar-brand-mark">
          <IconClock />
        </div>
        <div>
          <div className="app-sidebar-brand-name">ZeitBlick</div>
          <div className="app-sidebar-brand-tag">Stundenzettel</div>
        </div>
      </div>

      {/* Search */}
      <div
        className="app-sidebar-search"
        role="button"
        tabIndex={0}
        aria-label="Schnellsuche öffnen"
        onClick={onSearch}
        onKeyDown={(e) => e.key === 'Enter' && onSearch && onSearch()}
      >
        <IconSearch />
        <span className="app-sidebar-search-input" style={{ pointerEvents: 'none', color: 'var(--hint)', fontSize: 13 }}>
          Schnellsuche…
        </span>
        <kbd className="app-sidebar-search-kbd">⌘K</kbd>
      </div>

      <ul className="app-sidebar-nav-list">
        {navItems.map(item => (
          <li key={item.id}>
            <button
              className={`app-nav-item ${currentView === item.id ? 'active' : ''}`}
              onClick={() => onNavigate(item.id)}
              aria-current={currentView === item.id ? 'page' : undefined}
            >
              {item.icon}
              {item.label}
              {item.badge > 0 && (
                <span className="app-nav-badge">{item.badge > 99 ? '99+' : item.badge}</span>
              )}
            </button>
          </li>
        ))}
        {masterItems.map(item => (
          <li key={item.id}>
            <button
              className={`app-nav-item ${currentView === item.id ? 'active' : ''}`}
              onClick={() => onNavigate(item.id)}
              aria-current={currentView === item.id ? 'page' : undefined}
            >
              {item.icon}
              {item.label}
            </button>
          </li>
        ))}
      </ul>

      <div className="app-sidebar-spacer" />

      {/* Bottom: avatar + theme toggle */}
      <div className="app-sidebar-bottom">
        <button
          className={`app-sidebar-theme-btn${currentView === 'settings' ? ' active' : ''}`}
          onClick={() => onNavigate('settings')}
          aria-label="Einstellungen"
          title="Einstellungen"
        >
          <IconSettings />
        </button>
        <button
          className="app-sidebar-theme-btn"
          onClick={onToggleTheme}
          aria-label={isDark ? 'Zu hellem Modus wechseln' : 'Zu dunklem Modus wechseln'}
          title={isDark ? 'Heller Modus' : 'Dunkler Modus'}
        >
          {isDark ? <IconSun /> : <IconMoon />}
        </button>
      </div>
    </aside>
  );
}

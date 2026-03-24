import { createContext, useContext } from 'react';

/**
 * FilterContext — provides filter state and setters for project/person filters.
 */
export const FilterContext = createContext({
  projectFilter: 'all',
  personFilter: 'all',
  onProjectFilter: () => {},
  onPersonFilter: () => {},
});

export function useFilters() {
  return useContext(FilterContext);
}

/**
 * SettingsContext — provides global settings and the setter.
 */
export const SettingsContext = createContext({
  settings: {},
  effectiveSettings: {},
  onSettings: () => {},
  getPersonSettings: () => ({}),
  resolveName: (n) => n,
  getBaseProject: (p) => p || 'Sonstiges',
});

export function useSettings() {
  return useContext(SettingsContext);
}

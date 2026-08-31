/**
 * Pure docking contract for tab strips.
 *
 * Keeping the edge vocabulary and browser-storage boundary outside the React
 * surface gives every tab host the same persisted setting and keeps the C0
 * mount contract testable without importing the application shell.
 */

export type SettingsTabDockEdge = 'left' | 'right' | 'top' | 'bottom';

export const SETTINGS_TAB_DOCK_STORAGE_KEY = 'od.settings.tabs.dockEdge';

export const SETTINGS_TAB_DOCK_EDGES: readonly SettingsTabDockEdge[] = [
  'left',
  'right',
  'top',
  'bottom',
];

export function settingsTabDockIsVertical(edge: SettingsTabDockEdge): boolean {
  return edge === 'left' || edge === 'right';
}

export function readSettingsTabDockEdge(): SettingsTabDockEdge {
  if (typeof window === 'undefined') return 'left';
  try {
    const value = window.localStorage.getItem(SETTINGS_TAB_DOCK_STORAGE_KEY);
    return SETTINGS_TAB_DOCK_EDGES.includes(value as SettingsTabDockEdge)
      ? (value as SettingsTabDockEdge)
      : 'left';
  } catch {
    return 'left';
  }
}

export function writeSettingsTabDockEdge(edge: SettingsTabDockEdge): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SETTINGS_TAB_DOCK_STORAGE_KEY, edge);
  } catch {
    // Private-mode storage must not stop the settings surface moving.
  }
}

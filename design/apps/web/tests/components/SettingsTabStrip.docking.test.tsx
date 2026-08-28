import { beforeEach, describe, expect, it } from 'vitest';

import {
  readSettingsTabDockEdge,
  SETTINGS_TAB_DOCK_STORAGE_KEY,
  type SettingsTabDockEdge,
  writeSettingsTabDockEdge,
} from '../../src/components/settings/SettingsTabStrip';

describe('SettingsTabStrip docking persistence', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('defaults to the left edge when no preference exists', () => {
    expect(readSettingsTabDockEdge()).toBe('left');
  });

  it('accepts and restores every supported edge', () => {
    const edges: SettingsTabDockEdge[] = ['left', 'right', 'top', 'bottom'];
    for (const edge of edges) {
      writeSettingsTabDockEdge(edge);
      expect(window.localStorage.getItem(SETTINGS_TAB_DOCK_STORAGE_KEY)).toBe(edge);
      expect(readSettingsTabDockEdge()).toBe(edge);
    }
  });

  it('fails closed to the left edge for a hand-edited value', () => {
    window.localStorage.setItem(SETTINGS_TAB_DOCK_STORAGE_KEY, 'diagonal');
    expect(readSettingsTabDockEdge()).toBe('left');
  });
});

// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';

import {
  readSettingsTabDockEdge,
  SETTINGS_TAB_DOCK_STORAGE_KEY,
  SETTINGS_TAB_DOCK_EDGES,
  settingsTabDockIsVertical,
  type SettingsTabDockEdge,
  writeSettingsTabDockEdge,
} from '../../src/components/tabs/docking';

describe('SettingsTabStrip docking persistence', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('defaults to the left edge when no preference exists', () => {
    expect(readSettingsTabDockEdge()).toBe('left');
  });

  it('accepts and restores every supported edge', () => {
    const edges: SettingsTabDockEdge[] = [...SETTINGS_TAB_DOCK_EDGES];
    for (const edge of edges) {
      writeSettingsTabDockEdge(edge);
      expect(window.localStorage.getItem(SETTINGS_TAB_DOCK_STORAGE_KEY)).toBe(edge);
      expect(readSettingsTabDockEdge()).toBe(edge);
    }
  });

  it('maps side docks to vertical semantics and top or bottom to horizontal semantics', () => {
    expect(settingsTabDockIsVertical('left')).toBe(true);
    expect(settingsTabDockIsVertical('right')).toBe(true);
    expect(settingsTabDockIsVertical('top')).toBe(false);
    expect(settingsTabDockIsVertical('bottom')).toBe(false);
  });

  it('fails closed to the left edge for a hand-edited value', () => {
    window.localStorage.setItem(SETTINGS_TAB_DOCK_STORAGE_KEY, 'diagonal');
    expect(readSettingsTabDockEdge()).toBe('left');
  });
});

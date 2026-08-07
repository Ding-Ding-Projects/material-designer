// @vitest-environment jsdom

// Settings used to navigate through a seventeen-item scrolling rail with no
// search field at all. These specs pin the two things that replaced it: a real
// tab strip (roles, roving focus, an overflow surface, persistence) and a search
// field wired to the command palette's own settings index.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SettingsDialog } from '../../src/components/SettingsDialog';
import {
  SETTINGS_LAST_SECTION_STORAGE_KEY,
  SETTINGS_TAB_ORDER,
  readLastSettingsSection,
} from '../../src/components/settings/settingsTabs';
import { fetchConnectors, fetchDesignTemplates, fetchSkills } from '../../src/providers/registry';
import { en } from '../../src/i18n/locales/en';
import type { AppConfig } from '../../src/types';

vi.mock('../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/registry')>(
    '../../src/providers/registry',
  );
  return {
    ...actual,
    fetchConnectors: vi.fn(),
    fetchDesignTemplates: vi.fn(),
    fetchSkills: vi.fn(),
  };
});

const originalFetch = globalThis.fetch;

const baseConfig: AppConfig = {
  mode: 'api',
  apiKey: 'sk-test',
  apiProtocol: 'anthropic',
  baseUrl: 'https://api.anthropic.com',
  model: 'claude-sonnet-4-5',
  apiProviderBaseUrl: 'https://api.anthropic.com',
  agentId: null,
  skillId: null,
  designSystemId: null,
};

function renderSettings(initialSection: 'execution' | 'appearance' = 'execution') {
  return render(
    <SettingsDialog
      initial={baseConfig}
      agents={[]}
      daemonLive
      appVersionInfo={null}
      initialSection={initialSection}
      onPersist={vi.fn()}
      onPersistComposioKey={vi.fn()}
      onClose={vi.fn()}
      onRefreshAgents={vi.fn()}
    />,
  );
}

/** Tabs are addressed by their section token, not by translated copy. */
function tab(section: string): HTMLButtonElement {
  const node = document.querySelector<HTMLButtonElement>(
    `[role="tab"][data-section="${section}"]`,
  );
  if (!node) throw new Error(`no settings tab for '${section}'`);
  return node;
}

function tabPanel(): HTMLElement {
  const node = document.querySelector<HTMLElement>('#settings-tabpanel');
  if (!node) throw new Error('settings tabpanel is missing');
  return node;
}

function typeInSearch(value: string): void {
  fireEvent.change(screen.getByTestId('settings-search'), { target: { value } });
}

beforeEach(() => {
  vi.mocked(fetchConnectors).mockResolvedValue([]);
  vi.mocked(fetchDesignTemplates).mockResolvedValue([]);
  vi.mocked(fetchSkills).mockResolvedValue([]);
  globalThis.fetch = vi.fn(async () => new Response(null, { status: 404 })) as typeof fetch;
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('Settings: the tab strip', () => {
  it('presents every section as a tab in one labelled tablist', () => {
    renderSettings();

    const tablist = screen.getByRole('tablist', { name: en['settings.tabsAria'] });
    const tabs = tablist.querySelectorAll('[role="tab"]');
    expect(tabs).toHaveLength(SETTINGS_TAB_ORDER.length);
    expect(Array.from(tabs, (node) => node.getAttribute('data-section'))).toEqual([
      ...SETTINGS_TAB_ORDER,
    ]);
  });

  it('wires the selected tab to the one panel every tab controls', () => {
    renderSettings();

    expect(tab('execution').getAttribute('aria-selected')).toBe('true');
    expect(tab('appearance').getAttribute('aria-selected')).toBe('false');

    const panel = tabPanel();
    expect(panel.getAttribute('role')).toBe('tabpanel');
    expect(panel.getAttribute('aria-labelledby')).toBe('settings-tab-execution');
    expect(tab('execution').getAttribute('aria-controls')).toBe('settings-tabpanel');
  });

  it('keeps exactly one tab in the page tab order (roving focus)', () => {
    renderSettings();

    expect(tab('execution').tabIndex).toBe(0);
    expect(tab('appearance').tabIndex).toBe(-1);

    fireEvent.click(tab('appearance'));

    expect(tab('appearance').tabIndex).toBe(0);
    expect(tab('execution').tabIndex).toBe(-1);
  });

  it('switches the panel when a tab is clicked', () => {
    renderSettings();

    fireEvent.click(tab('privacy'));

    expect(tab('privacy').getAttribute('aria-selected')).toBe('true');
    expect(tabPanel().getAttribute('data-od-setting')).toBe('section:privacy');
    expect(tabPanel().getAttribute('aria-labelledby')).toBe('settings-tab-privacy');
  });

  it('moves between tabs with the arrow keys, and wraps at the ends', () => {
    renderSettings();
    const tablist = screen.getByRole('tablist', { name: en['settings.tabsAria'] });

    fireEvent.keyDown(tablist, { key: 'ArrowRight' });
    expect(tab(SETTINGS_TAB_ORDER[1] ?? '').getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(tablist, { key: 'Home' });
    expect(tab('execution').getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(tablist, { key: 'ArrowLeft' });
    const last = SETTINGS_TAB_ORDER[SETTINGS_TAB_ORDER.length - 1] ?? '';
    expect(tab(last).getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(tablist, { key: 'End' });
    expect(tab(last).getAttribute('aria-selected')).toBe('true');
  });

  it('offers an overflow surface listing every section, so none is ever unreachable', () => {
    renderSettings();

    fireEvent.click(screen.getByTestId('settings-tabs-overflow'));
    const menu = screen.getByTestId('settings-tabs-overflow-menu');
    const items = Array.from(menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
    expect(items).toHaveLength(SETTINGS_TAB_ORDER.length);

    const item = items[SETTINGS_TAB_ORDER.indexOf('language')];
    expect(item).toBeTruthy();
    fireEvent.click(item as HTMLButtonElement);

    expect(screen.queryByTestId('settings-tabs-overflow-menu')).toBeNull();
    expect(tab('language').getAttribute('aria-selected')).toBe('true');
  });

  it('gives the overflow menu its own searchable regex field and keyboard route', () => {
    renderSettings();

    const overflow = screen.getByTestId('settings-tabs-overflow');
    fireEvent.click(overflow);

    const menu = screen.getByTestId('settings-tabs-overflow-menu');
    const search = screen.getByTestId('settings-tabs-overflow-search') as HTMLInputElement;
    expect(search.getAttribute('data-regex-mode')).toBe('text');
    expect(menu.querySelectorAll('[role="menuitem"]')).toHaveLength(SETTINGS_TAB_ORDER.length);

    fireEvent.change(search, { target: { value: 'appearance' } });
    const filtered = menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.getAttribute('data-section')).toBe('appearance');

    fireEvent.click(screen.getByTestId('settings-tabs-overflow-search-regex-toggle'));
    expect(screen.getByTestId('settings-tabs-overflow-search-regex-popover')).toBeTruthy();

    fireEvent.change(search, { target: { value: '' } });
    const allItems = menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    allItems[0]?.focus();
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(allItems[1]);
    fireEvent.keyDown(menu, { key: 'End' });
    expect(document.activeElement).toBe(allItems[allItems.length - 1]);
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(document.activeElement).toBe(overflow);
    expect(screen.queryByTestId('settings-tabs-overflow-menu')).toBeNull();
  });

  it('persists the tab so the next generic open lands where the user left off', () => {
    renderSettings();

    fireEvent.click(tab('privacy'));

    expect(window.localStorage.getItem(SETTINGS_LAST_SECTION_STORAGE_KEY)).toBe('privacy');
    expect(readLastSettingsSection()).toBe('privacy');
  });

  it('falls back to the first tab when storage holds a section it must not restore', () => {
    // Connectors / External MCP / MCP server are tabs here but are rerouted to
    // the Integrations surface by `openSettings`, so restoring one of them
    // would send a user who pressed "Settings" somewhere that is not settings.
    window.localStorage.setItem(SETTINGS_LAST_SECTION_STORAGE_KEY, 'composio');
    expect(readLastSettingsSection()).toBe('execution');

    window.localStorage.setItem(SETTINGS_LAST_SECTION_STORAGE_KEY, 'not-a-section');
    expect(readLastSettingsSection()).toBe('execution');
  });
});

describe('Settings: the search field', () => {
  it('renders a search field with its own regex builder, plain text by default', () => {
    renderSettings();

    const input = screen.getByTestId('settings-search') as HTMLInputElement;
    expect(input.getAttribute('data-regex-mode')).toBe('text');
    expect(screen.queryByTestId('settings-search-regex-popover')).toBeNull();

    fireEvent.click(screen.getByTestId('settings-search-regex-toggle'));
    expect(screen.getByTestId('settings-search-regex-popover')).toBeTruthy();
  });

  it('shows nothing until something is typed', () => {
    renderSettings();
    expect(screen.queryByTestId('settings-search-results')).toBeNull();
  });

  it('finds a setting by a keyword alias the palette index carries', () => {
    renderSettings();

    typeInSearch('dark mode');

    const results = screen.getByTestId('settings-search-results');
    const rows = results.querySelectorAll('[data-anchor]');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.getAttribute('data-anchor')).toBe('appearance.theme');
  });

  it('says plainly when the match is on a tab other than the one on screen', () => {
    renderSettings();

    typeInSearch('dark mode');
    expect(screen.getByTestId('settings-search-elsewhere').textContent).toContain('1');

    // Same query, viewed from the tab the match actually lives on: nothing is
    // elsewhere any more, so the callout goes away rather than lying.
    fireEvent.click(tab('appearance'));
    expect(screen.queryByTestId('settings-search-elsewhere')).toBeNull();
  });

  it('teleports to the hit tab when a result is picked', () => {
    renderSettings();

    typeInSearch('custom instructions');
    const row = screen
      .getByTestId('settings-search-results')
      .querySelector<HTMLButtonElement>('[data-anchor="instructions.customInstructions"]');
    expect(row).toBeTruthy();
    fireEvent.click(row as HTMLButtonElement);

    expect(tab('instructions').getAttribute('aria-selected')).toBe('true');
    expect(tabPanel().getAttribute('data-od-setting')).toBe('section:instructions');
  });

  it('answers an unmatched query honestly instead of showing an empty list', () => {
    renderSettings();

    typeInSearch('zzzz-no-such-setting');

    const results = screen.getByTestId('settings-search-results');
    expect(results.querySelectorAll('[data-anchor]')).toHaveLength(0);
    expect(results.textContent).toContain(en['settings.searchNoMatches']);
  });
});

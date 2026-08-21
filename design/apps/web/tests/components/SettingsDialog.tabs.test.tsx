// @vitest-environment jsdom

// Settings used to navigate through a seventeen-item scrolling rail with no
// search field at all. These specs pin the two things that replaced it: a real
// tab strip (roles, roving focus, an overflow surface, persistence) and a search
// field wired to the command palette's own settings index.

import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SettingsDialog } from '../../src/components/SettingsDialog';
import {
  SETTINGS_SECTION_TOKENS,
} from '../../src/components/command-palette/settingsIndex';
import {
  SETTINGS_LAST_SECTION_STORAGE_KEY,
  SETTINGS_TAB_DEFS,
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
const originalInnerWidth = window.innerWidth;
const originalInnerHeight = window.innerHeight;
const SETTINGS_TABS_CSS = readFileSync(
  new URL('../../src/components/settings/SettingsTabs.module.css', import.meta.url),
  'utf8',
);
const SETTINGS_PAGE_CSS = readFileSync(
  new URL('../../src/components/settings/SettingsPage.module.css', import.meta.url),
  'utf8',
);
const SETTINGS_GLOBAL_CSS = readFileSync(
  new URL('../../src/styles/workspace/mention-home.css', import.meta.url),
  'utf8',
);
const REGEX_SEARCH_CSS = readFileSync(
  new URL('../../src/components/regex/RegexSearchField.module.css', import.meta.url),
  'utf8',
);
const APPEARANCE_CONTROLS_CSS = readFileSync(
  new URL('../../src/components/appearance/AppearanceControls.module.css', import.meta.url),
  'utf8',
);
const APPEARANCE_PICKER_CSS = readFileSync(
  new URL('../../src/components/appearance/InfiniteColorPicker.module.css', import.meta.url),
  'utf8',
);
const SETTINGS_DIALOG_SOURCE = readFileSync(
  new URL('../../src/components/SettingsDialog.tsx', import.meta.url),
  'utf8',
);
const APP_SOURCE = readFileSync(
  new URL('../../src/App.tsx', import.meta.url),
  'utf8',
);

// Keep this list hand-written: a source guard that discovers only the
// sections it already sees cannot notice a section disappearing altogether.
// The named renderer markers also protect the former General children, whose
// reachability was the defect that prompted this lane.
const SETTINGS_RENDER_CONTRACTS: ReadonlyArray<readonly [string, string]> = [
  ['execution', "activeSection === 'execution'"],
  ['workspace', '<SettingsWorkspaceSection context={workspaceContext} />'],
  ['instructions', "activeSection === 'instructions'"],
  ['memory', "activeSection === 'memory'"],
  ['media', "activeSection === 'media'"],
  ['mcpClient', "activeSection === 'mcpClient'"],
  ['composio', "activeSection === 'composio'"],
  ['integrations', "activeSection === 'integrations'"],
  ['language', "activeSection === 'language'"],
  ['appearance', '<AppearanceSection cfg={cfg} setCfg={setCfg} />'],
  ['narrator', "activeSection === 'narrator'"],
  ['critiqueTheater', '<CritiqueTheaterSection'],
  ['notifications', '<NotificationsSection cfg={cfg} setCfg={setCfg} />'],
  ['pet', '<PetSettings cfg={cfg} setCfg={setCfg} />'],
  ['designSystems', "activeSection === 'designSystems'"],
  ['projectLocations', '<ProjectLocationsSection cfg={cfg} setCfg={setCfg}'],
  ['privacy', "activeSection === 'privacy'"],
  ['about', "activeSection === 'about'"],
];

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
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalInnerWidth });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalInnerHeight });
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

  it('records an explicit tab or null ownership decision for every section token', () => {
    expect(Object.keys(SETTINGS_TAB_DEFS).sort()).toEqual(Object.keys(SETTINGS_SECTION_TOKENS).sort());
    expect(SETTINGS_TAB_DEFS.workspace).not.toBeNull();
    expect(SETTINGS_TAB_DEFS.orbit).not.toBeNull();
    expect(SETTINGS_TAB_DEFS.routines).not.toBeNull();
    expect(SETTINGS_TAB_DEFS.library).toBeNull();
  });

  it('does not advertise a permission-hidden Workspace palette destination', () => {
    expect(SETTINGS_DIALOG_SOURCE).toContain('visibleSettingsTabs');
    expect(SETTINGS_DIALOG_SOURCE).toContain("tab.section !== 'workspace' || showWorkspaceSettings");
    expect(SETTINGS_DIALOG_SOURCE).toContain('rawSettingsSearchHits.filter');
    expect(SETTINGS_DIALOG_SOURCE).toContain("selectSettingsSection('execution')");
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

  it('gives each tab a stable hint description and exposes no-match state without dimming the selection', () => {
    renderSettings();

    const appearance = tab('appearance');
    expect(appearance.getAttribute('aria-describedby')).toBe('settings-tab-appearance-hint');
    expect(document.getElementById('settings-tab-appearance-hint')).toBeTruthy();

    typeInSearch('a value that matches no settings label');
    expect(appearance.getAttribute('aria-selected')).toBe('true');
    expect(appearance.getAttribute('aria-describedby')).toContain('settings-tab-appearance-no-match');
    expect(document.getElementById('settings-tab-appearance-no-match')?.textContent)
      .toBe(en['settings.searchNoMatches']);
  });

  it('switches the panel when a tab is clicked', () => {
    renderSettings();

    fireEvent.click(tab('privacy'));

    expect(tab('privacy').getAttribute('aria-selected')).toBe('true');
    expect(tabPanel().getAttribute('data-od-setting')).toBe('section:privacy');
    expect(tabPanel().getAttribute('aria-labelledby')).toBe('settings-tab-privacy');
  });

  it('normalizes the typed Appearance URL across close, reopen, refresh, and integration tabs', () => {
    window.history.replaceState(null, '', '/settings/appearance');
    const onSectionChange = vi.fn();
    const first = render(
      <SettingsDialog
        presentation="page"
        initial={baseConfig}
        agents={[]}
        daemonLive
        appVersionInfo={null}
        initialSection="appearance"
        onSectionChange={onSectionChange}
        onPersist={vi.fn()}
        onPersistComposioKey={vi.fn()}
        onClose={vi.fn()}
        onRefreshAgents={vi.fn()}
      />,
    );

    fireEvent.click(tab('integrations'));

    expect(window.location.pathname).toBe('/settings');
    expect(onSectionChange).toHaveBeenCalledWith('integrations');
    expect(tab('integrations').getAttribute('aria-selected')).toBe('true');

    // Closing and reopening uses the section App retained from the callback,
    // rather than falling back to Appearance or the generic first tab.
    first.unmount();
    const reopened = render(
      <SettingsDialog
        presentation="page"
        initial={baseConfig}
        agents={[]}
        daemonLive
        appVersionInfo={null}
        initialSection="integrations"
        onSectionChange={onSectionChange}
        onPersist={vi.fn()}
        onPersistComposioKey={vi.fn()}
        onClose={vi.fn()}
        onRefreshAgents={vi.fn()}
      />,
    );
    expect(tab('integrations').getAttribute('aria-selected')).toBe('true');

    // A refresh/remount from the explicit route still selects Appearance,
    // while the generic route remains the normalized URL for other tabs.
    reopened.unmount();
    window.history.replaceState(null, '', '/settings/appearance');
    render(
      <SettingsDialog
        presentation="page"
        initial={baseConfig}
        agents={[]}
        daemonLive
        appVersionInfo={null}
        initialSection="appearance"
        onSectionChange={onSectionChange}
        onPersist={vi.fn()}
        onPersistComposioKey={vi.fn()}
        onClose={vi.fn()}
        onRefreshAgents={vi.fn()}
      />,
    );
    expect(tab('appearance').getAttribute('aria-selected')).toBe('true');
    window.history.replaceState(null, '', '/');
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

  it('keeps the overflow surface inside a narrow, short viewport', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 240 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 150 });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.dataset.testid === 'settings-tabs-overflow') {
        return {
          x: 180,
          y: 92,
          width: 32,
          height: 32,
          top: 92,
          right: 212,
          bottom: 124,
          left: 180,
          toJSON: () => ({}),
        };
      }
      return {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        toJSON: () => ({}),
      };
    });

    renderSettings();
    fireEvent.click(screen.getByTestId('settings-tabs-overflow'));

    const menu = screen.getByTestId('settings-tabs-overflow-menu') as HTMLElement;
    expect(menu.style.width).toBe('216px');
    expect(menu.style.top).toBe('auto');
    expect(menu.style.bottom).toBe('62px');
    expect(menu.style.maxHeight).toBe('76px');
  });

  it('keeps active Material roles and adequate targets owned by the current components', () => {
    expect(SETTINGS_GLOBAL_CSS).not.toContain('.settings-page-shell .settings-nav-item.active');
    expect(SETTINGS_TABS_CSS).toContain('color: var(--md-sys-color-primary);');
    expect(SETTINGS_TABS_CSS).toContain('min-height: 48px;');
    expect(SETTINGS_TABS_CSS).toContain('min-width: 48px;');
    expect(SETTINGS_TABS_CSS).toContain('white-space: normal;');
    expect(REGEX_SEARCH_CSS).toContain('min-width: 48px;');
    expect(REGEX_SEARCH_CSS).toContain('min-height: 48px;');
    expect(APPEARANCE_CONTROLS_CSS).toContain('min-height: 48px;');
    expect(APPEARANCE_PICKER_CSS).toContain('min-width: 48px;');
    expect(APPEARANCE_PICKER_CSS).toContain('min-height: 48px;');
    expect(SETTINGS_GLOBAL_CSS).toContain('.settings-page-back');
    expect(SETTINGS_GLOBAL_CSS).toContain('min-width: 48px;');
    expect(SETTINGS_GLOBAL_CSS).toContain('min-height: 48px;');
    expect(SETTINGS_GLOBAL_CSS).toContain('.settings-content .settings-section button');
    expect(SETTINGS_GLOBAL_CSS).toContain('min-height: 48px;');
    expect(SETTINGS_GLOBAL_CSS).toContain('.modal-settings .modal-body');
    expect(SETTINGS_GLOBAL_CSS).toContain('flex-direction: column;');
    expect(SETTINGS_GLOBAL_CSS).not.toContain('grid-template-columns: 240px minmax(0, 1fr);');
    expect(SETTINGS_GLOBAL_CSS).not.toContain('grid-template-columns: 272px minmax(0, 1fr);');
  });

  it('keeps a portalled overflow surface above the opaque settings page', () => {
    const menuZ = Number(SETTINGS_TABS_CSS.match(/\.menu\s*\{[\s\S]*?z-index:\s*(\d+)/)?.[1]);
    const pageZ = Number(SETTINGS_PAGE_CSS.match(/\.page\s*\{[\s\S]*?z-index:\s*(\d+)/)?.[1]);
    expect(menuZ).toBeGreaterThan(pageZ);
  });

  it('keeps the menu in the viewport when the trigger is outside a tiny viewport', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 10 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 8 });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.dataset.testid === 'settings-tabs-overflow') {
        return {
          x: -120,
          y: -40,
          width: 32,
          height: 32,
          top: -40,
          right: -88,
          bottom: -8,
          left: -120,
          toJSON: () => ({}),
        };
      }
      return {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        toJSON: () => ({}),
      };
    });

    renderSettings();
    fireEvent.click(screen.getByTestId('settings-tabs-overflow'));

    const menu = screen.getByTestId('settings-tabs-overflow-menu') as HTMLElement;
    const left = Number.parseFloat(menu.style.left);
    const top = Number.parseFloat(menu.style.top);
    const width = Number.parseFloat(menu.style.width);
    const maxHeight = Number.parseFloat(menu.style.maxHeight);
    expect(left).toBeGreaterThanOrEqual(0);
    expect(left + width).toBeLessThanOrEqual(window.innerWidth);
    expect(top).toBeGreaterThanOrEqual(0);
    expect(top + maxHeight).toBeLessThanOrEqual(window.innerHeight);
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
    const regexPopover = screen.getByTestId('settings-tabs-overflow-search-regex-popover');
    expect(regexPopover.getAttribute('data-focus-scope')).toBeTruthy();
    const regexControl = regexPopover.querySelector<HTMLElement>('button, input, select, textarea');
    expect(regexControl).toBeTruthy();
    regexControl?.focus();
    fireEvent.keyDown(regexControl!, { key: 'Tab' });
    expect(screen.getByTestId('settings-tabs-overflow-menu')).toBeTruthy();

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

  it('restores every visible settings tab, including integration sections', () => {
    window.localStorage.setItem(SETTINGS_LAST_SECTION_STORAGE_KEY, 'composio');
    expect(readLastSettingsSection()).toBe('composio');

    window.localStorage.setItem(SETTINGS_LAST_SECTION_STORAGE_KEY, 'not-a-section');
    expect(readLastSettingsSection()).toBe('execution');
  });
});

describe('Settings: Appearance reachability', () => {
  it('mounts the real Appearance controls when that tab is selected', () => {
    renderSettings('appearance');

    expect(tab('appearance').getAttribute('aria-selected')).toBe('true');
    expect(tabPanel().getAttribute('data-od-setting')).toBe('section:appearance');
    expect(screen.getByTestId('appearance-ui-scale')).toBeTruthy();
    expect(screen.getByTestId('appearance-reset')).toBeTruthy();
  });

  it('keeps the System / Light / Dark theme control live on the Appearance tab', () => {
    renderSettings('appearance');

    const themeGroup = screen.getByRole('group', { name: en['settings.appearance'] });
    const controls = within(themeGroup).getAllByRole('button');
    expect(controls).toHaveLength(3);

    fireEvent.click(within(themeGroup).getByRole('button', { name: en['settings.themeDark'] }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    fireEvent.click(within(themeGroup).getByRole('button', { name: en['settings.themeSystem'] }));
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('keeps one authoritative section state and one Appearance metadata entry', () => {
    expect(SETTINGS_DIALOG_SOURCE.match(/const \[activeSection/g) ?? []).toHaveLength(1);
    expect(SETTINGS_DIALOG_SOURCE.match(/^\s*appearance:\s*\{/gm) ?? []).toHaveLength(1);
    expect(SETTINGS_DIALOG_SOURCE.match(/<AppearanceSection\s+cfg=/g) ?? []).toHaveLength(1);
    expect(SETTINGS_DIALOG_SOURCE).not.toContain('normalizeSettingsSection');
    expect(SETTINGS_DIALOG_SOURCE).not.toContain('settings-nav-item');
    expect(SETTINGS_DIALOG_SOURCE.match(/className="settings-content"/g) ?? []).toHaveLength(1);
    expect(SETTINGS_DIALOG_SOURCE.match(/<SettingsTabStrip\b/g) ?? []).toHaveLength(1);
    for (const [section, marker] of SETTINGS_RENDER_CONTRACTS) {
      expect(SETTINGS_DIALOG_SOURCE, `${section} renderer contract`).toContain(marker);
    }
  });

  it('lets the typed direct route choose Appearance before the page mounts', () => {
    expect(APP_SOURCE).toContain("route.settingsSection");
    expect(APP_SOURCE).toContain("settingsSection: 'appearance'");
  });

  it('gives the direct page route a visible landmark name, initial focus, and opener restore', () => {
    expect(SETTINGS_DIALOG_SOURCE).toContain("id=\"settings-page-title\"");
    expect(SETTINGS_DIALOG_SOURCE).toContain(
      "aria-labelledby={pageMode ? 'settings-page-title' : 'settings-dialog-title'}",
    );
    expect(SETTINGS_DIALOG_SOURCE).toContain('settingsPageRef.current?.focus({ preventScroll: true });');
    expect(SETTINGS_DIALOG_SOURCE).toContain('ref={pageMode ? settingsPageRef : undefined}');
    expect(SETTINGS_PAGE_CSS).toContain('.settings-page-surface:focus-visible');
    expect(APP_SOURCE).toContain('captureSettingsOpener');
    expect(APP_SOURCE).toContain('restoreSettingsOpenerFocus');
  });

  it('keeps integration sections visible and truthful in tab persistence', () => {
    expect(SETTINGS_DIALOG_SOURCE).toContain("activeSection === 'composio'");
    expect(SETTINGS_DIALOG_SOURCE).toContain("activeSection === 'mcpClient'");
    expect(SETTINGS_DIALOG_SOURCE).toContain("activeSection === 'integrations'");
    expect(APP_SOURCE).not.toContain(
      "section === 'composio' || section === 'mcpClient' || section === 'integrations'",
    );
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

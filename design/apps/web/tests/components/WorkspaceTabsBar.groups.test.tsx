// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkspaceTabsBar } from '../../src/components/WorkspaceTabsBar';
import { navigate, type Route } from '../../src/router';
import type { Project } from '../../src/types';
import {
  WORKSPACE_TAB_ACTIVATION_KEY_PREFIX,
  WORKSPACE_TAB_WINDOW_KEY_PREFIX,
  parseWorkspaceTabActivationRequest,
  parseWorkspaceTabWindowSnapshot,
  publishWorkspaceTabWindowSnapshot,
} from '../../src/components/workspace-tabs/windowRegistry';

// Deliberately NOT mocking i18n here: this file asserts on real rendered copy
// (the group headings, the four search headings) and on the accessible names
// they build, so a key that exists in `types.ts` but in no locale would show up
// as a raw key in an assertion rather than passing quietly.
vi.mock('../../src/router', async () => {
  const actual = await vi.importActual<typeof import('../../src/router')>('../../src/router');
  return { ...actual, navigate: vi.fn() };
});

afterEach(cleanup);

const homeRoute: Route = { kind: 'home', view: 'home' };

const LONG_NAME = 'Welcome to Material Designer — the very long project name';

function project(id: string, name: string): Project {
  return {
    id,
    name,
    skillId: null,
    designSystemId: null,
    createdAt: 1,
    updatedAt: 1,
  } as Project;
}

const projects = [project('alpha', LONG_NAME), project('beta', 'Beta')];

/** A v3 payload: two project tabs, the first filed into a group. */
function seedWorkspace(
  collapsed = false,
  activeTabId = 'entry:home:seed',
) {
  window.localStorage.setItem(
    'open-design:workspace-tabs:v1',
    JSON.stringify({
      version: 3,
      activeTabId,
      tabs: [
        { id: 'entry:home:seed', kind: 'entry', view: 'home', createdAt: 1, lastActiveAt: 9 },
        {
          id: 'project:alpha:seed',
          kind: 'project',
          projectId: 'alpha',
          conversationId: null,
          fileName: null,
          createdAt: 2,
          lastActiveAt: 3,
        },
        {
          id: 'project:beta:seed',
          kind: 'project',
          projectId: 'beta',
          conversationId: null,
          fileName: null,
          createdAt: 3,
          lastActiveAt: 2,
        },
      ],
      pinnedTabIds: [],
      groups: [{ id: 'group:docs', name: 'Docs', color: 'moss', collapsed }],
      groupMembership: { 'project:alpha:seed': 'group:docs' },
      groupDecorations: {},
    }),
  );
}

beforeEach(() => {
  window.localStorage.clear();
  vi.mocked(navigate).mockClear();
});

async function openTabSearch() {
  fireEvent.click(screen.getByRole('button', { name: 'Search tabs' }));
  return waitFor(() => screen.getByRole('dialog', { name: 'Search tabs' }));
}

describe('the strip restores a group and renders it', () => {
  it('restores group name, colour and membership from the stored payload', async () => {
    seedWorkspace();
    render(<WorkspaceTabsBar route={homeRoute} projects={projects} />);

    const header = await screen.findByRole('button', { name: /^Docs: 1 tabs$/u });
    expect(header.getAttribute('aria-expanded')).toBe('true');
    // The colour is a stored NAME, not a hex value, so a theme change moves it.
    expect(header.closest('[data-tab-group-id]')?.getAttribute('data-tab-group-color'))
      .toBe('moss');
    expect(header.closest('[data-tab-group-id]')?.getAttribute('data-tab-group-id'))
      .toBe('group:docs');
  });

  it('restores a collapsed group collapsed, and hides its members', async () => {
    seedWorkspace(true);
    render(<WorkspaceTabsBar route={homeRoute} projects={projects} />);

    const header = await screen.findByRole('button', { name: /^Docs: 1 tabs$/u });
    expect(header.getAttribute('aria-expanded')).toBe('false');
    // Home and Beta remain; the grouped Alpha tab is behind the collapsed head.
    expect(screen.queryByRole('tab', { name: LONG_NAME })).toBeNull();
    expect(screen.getByRole('tab', { name: 'Beta' })).toBeTruthy();
  });

  it('collapses and expands from the header without losing the tab', async () => {
    seedWorkspace();
    render(<WorkspaceTabsBar route={homeRoute} projects={projects} />);

    const header = await screen.findByRole('button', { name: /^Docs: 1 tabs$/u });
    fireEvent.click(header);
    await waitFor(() => {
      expect(screen.queryByRole('tab', { name: LONG_NAME })).toBeNull();
    });
    // The count in the accessible name still says one tab: it is hidden, not gone.
    fireEvent.click(screen.getByRole('button', { name: /^Docs: 1 tabs$/u }));
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: LONG_NAME })).toBeTruthy();
    });
  });

  it('keeps the active grouped tab visible and focused when its group collapses', async () => {
    seedWorkspace(false, 'project:alpha:seed');
    const projectRoute: Route = {
      kind: 'project',
      projectId: 'alpha',
      conversationId: null,
      fileName: null,
    };
    render(<WorkspaceTabsBar route={projectRoute} projects={projects} />);

    const activeTab = await screen.findByRole('tab', { name: LONG_NAME });
    activeTab.focus();
    fireEvent.click(screen.getByRole('button', { name: /^Docs: 1 tabs$/u }));

    await waitFor(() => {
      const representative = screen.getByRole('tab', { name: LONG_NAME });
      expect(representative.getAttribute('aria-selected')).toBe('true');
      expect(representative.getAttribute('tabindex')).toBe('0');
      expect(document.activeElement).toBe(representative);
    });
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('tab semantics', () => {
  it('puts role=tab on the focusable element and points it at a real panel', async () => {
    seedWorkspace();
    render(<WorkspaceTabsBar route={homeRoute} projects={projects} />);

    const tabs = await screen.findAllByRole('tab');
    for (const tab of tabs) {
      // The tab IS the button. A role="tab" wrapper around a button gives the
      // tablist a tab focus never lands on.
      expect(tab.tagName).toBe('BUTTON');
      expect(tab.getAttribute('aria-controls')).toBe('workspace-tab-panel');
    }
  });

  it('keeps exactly one tab in the tab order (roving focus)', async () => {
    seedWorkspace();
    render(<WorkspaceTabsBar route={homeRoute} projects={projects} />);

    const tabs = await screen.findAllByRole('tab');
    const inOrder = tabs.filter((tab) => tab.getAttribute('tabindex') === '0');
    expect(inOrder).toHaveLength(1);
    expect(inOrder[0]?.getAttribute('aria-selected')).toBe('true');
  });

  it('moves focus along the strip with the arrow keys', async () => {
    seedWorkspace();
    render(<WorkspaceTabsBar route={homeRoute} projects={projects} />);

    const home = await screen.findByRole('tab', { name: 'Home' });
    home.focus();
    fireEvent.keyDown(home, { key: 'ArrowRight' });
    await waitFor(() => {
      expect(document.activeElement).not.toBe(home);
    });
    expect((document.activeElement as HTMLElement).getAttribute('role')).toBe('tab');
  });
});

describe('a truncating label is recoverable with a pointer', () => {
  // Reported against a released build: a tab capped at 104px truncated to
  // "Welcome t…" with no `title`, so a sighted user had no way back to the full
  // text. The accessible name always carried it, which is why it went unnoticed.
  it('carries the full label in title, on every tab', async () => {
    seedWorkspace();
    render(<WorkspaceTabsBar route={homeRoute} projects={projects} />);

    const tab = await screen.findByRole('tab', { name: LONG_NAME });
    expect(tab.getAttribute('title')).toBe(LONG_NAME);
  });

  it('does not give an ordinary tab a second competing accessible name', async () => {
    seedWorkspace();
    render(<WorkspaceTabsBar route={homeRoute} projects={projects} />);

    const tab = await screen.findByRole('tab', { name: LONG_NAME });
    // The visible text is the accessible name. An `aria-label` carrying the
    // same string as `title` is what makes some screen readers say it twice.
    expect(tab.getAttribute('aria-label')).toBeNull();
    expect(tab.textContent).toContain(LONG_NAME);
  });

  it('carries the full group name in the header title too', async () => {
    seedWorkspace();
    render(<WorkspaceTabsBar route={homeRoute} projects={projects} />);

    const header = await screen.findByRole('button', { name: /^Docs: 1 tabs$/u });
    expect(header.getAttribute('title')).toBe('Docs');
  });
});

describe('the four tab-discovery searches', () => {
  it('focuses the current-strip search on open and returns focus on Escape', async () => {
    seedWorkspace();
    render(<WorkspaceTabsBar route={homeRoute} projects={projects} />);
    const trigger = screen.getByRole('button', { name: 'Search tabs' });
    fireEvent.click(trigger);

    const search = await screen.findByTestId('workspace-tabs-strip-search');
    await waitFor(() => expect(document.activeElement).toBe(search));
    fireEvent.keyDown(search, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Search tabs' })).toBeNull();
      expect(document.activeElement).toBe(trigger);
    });
  });

  it('renders all four, each with its own regex builder affordance', async () => {
    seedWorkspace();
    render(<WorkspaceTabsBar route={homeRoute} projects={projects} />);
    await openTabSearch();

    // 1. the current strip, 2. inside this group, 3. groups by name,
    // 4. every open tab across every window.
    for (const testId of [
      'workspace-tabs-strip-search',
      'workspace-tabs-group-tab-search-group:docs',
      'workspace-tabs-group-search',
      'workspace-tabs-master-search',
    ]) {
      expect(screen.getByTestId(testId)).toBeTruthy();
      expect(screen.getByTestId(`${testId}-regex-toggle`)).toBeTruthy();
    }
  });

  it('gives each field its own builder — turning regex on in one leaves the rest in text mode', async () => {
    seedWorkspace();
    render(<WorkspaceTabsBar route={homeRoute} projects={projects} />);
    await openTabSearch();

    fireEvent.click(screen.getByTestId('workspace-tabs-master-search-regex-toggle'));
    const popover = await screen.findByTestId('workspace-tabs-master-search-regex-popover');
    fireEvent.click(within(popover).getByTestId('workspace-tabs-master-search-regex-mode-regex'));

    await waitFor(() => {
      expect(
        screen.getByTestId('workspace-tabs-master-search').getAttribute('data-regex-mode'),
      ).toBe('regex');
    });
    // The other three are untouched. One shared controller would have moved
    // all four, and a pattern built here would silently start filtering them.
    for (const testId of [
      'workspace-tabs-strip-search',
      'workspace-tabs-group-search',
      'workspace-tabs-group-tab-search-group:docs',
    ]) {
      expect(screen.getByTestId(testId).getAttribute('data-regex-mode')).toBe('text');
    }
  });

  it('filters the strip search without touching the group search', async () => {
    seedWorkspace();
    render(<WorkspaceTabsBar route={homeRoute} projects={projects} />);
    await openTabSearch();

    fireEvent.change(screen.getByTestId('workspace-tabs-strip-search'), {
      target: { value: 'Beta' },
    });
    await waitFor(() => {
      expect(screen.getByTestId('workspace-tabs-strip-search')).toHaveProperty('value', 'Beta');
    });
    // The per-group field kept its own (empty) query.
    expect(screen.getByTestId('workspace-tabs-group-tab-search-group:docs')).toHaveProperty(
      'value',
      '',
    );
  });

  it('searches groups by their visible name', async () => {
    seedWorkspace();
    render(<WorkspaceTabsBar route={homeRoute} projects={projects} />);
    await openTabSearch();

    fireEvent.change(screen.getByTestId('workspace-tabs-group-search'), {
      target: { value: 'nothing-matches-this' },
    });
    await waitFor(() => {
      expect(screen.getByText('No groups match.')).toBeTruthy();
    });
  });

  it('lists this window’s own tabs in the master search', async () => {
    seedWorkspace();
    render(<WorkspaceTabsBar route={homeRoute} projects={projects} />);
    await openTabSearch();

    // The window publishes its own strip, so the master search sees it without
    // a second window being open.
    await waitFor(() => {
      expect(screen.getAllByText('This window · Workspace strip · Docs').length).toBeGreaterThan(0);
    });
  });

  it('publishes an operable activation request for another window and keeps a return path', async () => {
    publishWorkspaceTabWindowSnapshot(window.localStorage, {
      windowId: 'other-window',
      stripId: 'workspace',
      updatedAt: Date.now(),
      tabs: [{
        id: 'project:other',
        title: 'Other Window Project',
        meta: 'Project',
        pinned: false,
        active: false,
        groupId: null,
        groupName: null,
        groupCollapsed: false,
      }],
    });
    const focus = vi.spyOn(window, 'focus').mockImplementation(() => {});
    seedWorkspace();
    render(<WorkspaceTabsBar route={homeRoute} projects={projects} />);
    await openTabSearch();

    const otherResult = await screen.findByRole('button', { name: /Other Window Project/u });
    expect(otherResult).not.toBeDisabled();
    otherResult.focus();
    fireEvent.click(otherResult);

    const activationKey = Object.keys(window.localStorage)
      .find((key) => key.startsWith(WORKSPACE_TAB_ACTIVATION_KEY_PREFIX));
    expect(activationKey).toBeTruthy();
    expect(parseWorkspaceTabActivationRequest(window.localStorage.getItem(activationKey!)))
      .toMatchObject({
        targetWindowId: 'other-window',
        tabId: 'project:other',
      });
    expect(await screen.findByRole('status')).toHaveTextContent('Other Window Project');

    fireEvent.click(screen.getByRole('button', { name: 'This window' }));
    expect(focus).toHaveBeenCalled();
    expect(document.activeElement).toBe(otherResult);
  });

  it('receives an activation request, selects the tab, navigates, and focuses its window', async () => {
    const focus = vi.spyOn(window, 'focus').mockImplementation(() => {});
    seedWorkspace();
    render(<WorkspaceTabsBar route={homeRoute} projects={projects} />);

    let currentWindowId = '';
    await waitFor(() => {
      const key = Object.keys(window.localStorage)
        .find((entry) => entry.startsWith(WORKSPACE_TAB_WINDOW_KEY_PREFIX));
      const snapshot = key
        ? parseWorkspaceTabWindowSnapshot(window.localStorage.getItem(key))
        : null;
      currentWindowId = snapshot?.windowId ?? '';
      expect(currentWindowId).not.toBe('');
    });
    const request = {
      requestId: 'activate-alpha',
      sourceWindowId: 'source-window',
      targetWindowId: currentWindowId,
      tabId: 'project:alpha:seed',
      requestedAt: Date.now(),
    };
    const key = `${WORKSPACE_TAB_ACTIVATION_KEY_PREFIX}${request.requestId}`;
    const value = JSON.stringify(request);
    window.localStorage.setItem(key, value);
    window.dispatchEvent(new StorageEvent('storage', { key, newValue: value }));

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: LONG_NAME }).getAttribute('aria-selected'))
        .toBe('true');
      expect(navigate).toHaveBeenCalledWith({
        kind: 'project',
        projectId: 'alpha',
        conversationId: null,
        fileName: null,
      });
      expect(focus).toHaveBeenCalled();
    });
    expect(window.localStorage.getItem(key)).toBeNull();
  });

  it('protects pinned tabs from direct discovery close while ordinary tabs remain closable', async () => {
    seedWorkspace();
    render(<WorkspaceTabsBar route={homeRoute} projects={projects} />);
    await openTabSearch();

    const stripSearch = screen.getByTestId('workspace-tabs-strip-search');
    const stripSection = stripSearch.closest('section')!;
    const betaRow = within(stripSection)
      .getByRole('button', { name: /Beta/u })
      .closest('li')!;
    fireEvent.click(within(betaRow).getByRole('button', { name: 'Pin' }));

    await waitFor(() => {
      const updatedBetaRow = within(stripSection)
        .getByRole('button', { name: /Beta/u })
        .closest('li')!;
      expect(within(updatedBetaRow).getByRole('button', { name: 'Unpin' })).toBeTruthy();
      expect(within(updatedBetaRow).queryByRole('button', { name: 'Close: Beta' })).toBeNull();
    });
    const updatedBetaRow = within(stripSection)
      .getByRole('button', { name: /Beta/u })
      .closest('li')!;
    fireEvent.click(within(updatedBetaRow).getByRole('button', { name: /Beta/u }));
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Beta' }).getAttribute('aria-selected')).toBe('true');
    });
    fireEvent.keyDown(document, { key: 'w', ctrlKey: true });
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Beta' })).toBeTruthy());

    const alphaRow = within(stripSection)
      .getByRole('button', { name: new RegExp(LONG_NAME, 'u') })
      .closest('li')!;
    fireEvent.click(within(alphaRow).getByRole('button', { name: `Close: ${LONG_NAME}` }));
    await waitFor(() => expect(screen.queryByRole('tab', { name: LONG_NAME })).toBeNull());
    expect(screen.getByRole('tab', { name: 'Beta' })).toBeTruthy();
  });
});

describe('revealing a result inside a collapsed group', () => {
  it('shows the tab without expanding the group', async () => {
    seedWorkspace(true);
    render(<WorkspaceTabsBar route={homeRoute} projects={projects} />);
    await openTabSearch();

    const reveal = await screen.findAllByRole('button', { name: `Reveal — ${LONG_NAME}` });
    fireEvent.click(reveal[0]!);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: LONG_NAME })).toBeTruthy();
    });
    // The collapsed preference is the user's; a search result is permission to
    // see one tab, not permission to throw that preference away.
    expect(
      screen.getByRole('button', { name: /^Docs: 1 tabs$/u }).getAttribute('aria-expanded'),
    ).toBe('false');
  });
});

describe('group management from the panel', () => {
  it('creates a group, and renames it in place', async () => {
    seedWorkspace();
    render(<WorkspaceTabsBar route={homeRoute} projects={projects} />);
    await openTabSearch();

    fireEvent.click(screen.getByRole('button', { name: 'New group' }));
    await waitFor(() => {
      expect(screen.getAllByRole('textbox', { name: 'Group name' })).toHaveLength(2);
    });

    const fields = screen.getAllByRole('textbox', { name: 'Group name' });
    fireEvent.change(fields[1]!, { target: { value: 'Drafts' } });
    await waitFor(() => {
       expect(screen.getByRole('button', { name: /^Drafts: 0 tabs$/u })).toBeTruthy();
    });
  });

  it('removes a group without closing the tab that was in it', async () => {
    seedWorkspace();
    render(<WorkspaceTabsBar route={homeRoute} projects={projects} />);
    await openTabSearch();

    fireEvent.click(screen.getByRole('button', { name: 'Remove group' }));
    await waitFor(() => {
       expect(screen.queryByRole('button', { name: /^Docs: 1 tabs$/u })).toBeNull();
    });
    // The tab is ungrouped, not closed. This is the difference between tidying
    // and losing work.
    expect(screen.getByRole('tab', { name: LONG_NAME })).toBeTruthy();
  });
});

describe('group menu and assignment search', () => {
  it('gives the live group context menu an isolated regex search and returns focus', async () => {
    seedWorkspace();
    render(<WorkspaceTabsBar route={homeRoute} projects={projects} />);
    const header = await screen.findByRole('button', { name: /^Docs: 1 tabs$/u });
    fireEvent.contextMenu(header);

    const menu = await screen.findByRole('menu', { name: 'Docs' });
    const search = within(menu).getByTestId('workspace-tab-group-context-search');
    await waitFor(() => expect(document.activeElement).toBe(search));
    expect(within(menu).getByTestId('workspace-tab-group-context-search-regex-toggle'))
      .toBeTruthy();
    fireEvent.change(search, { target: { value: 'nothing-matches' } });
    await waitFor(() => expect(within(menu).getByRole('status')).toHaveTextContent('No groups match.'));

    fireEvent.keyDown(search, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('menu', { name: 'Docs' })).toBeNull();
      expect(document.activeElement).toBe(header);
    });
  });

  it('gives each group-assignment picker its own regex search, no-match state, and focus return', async () => {
    seedWorkspace();
    render(<WorkspaceTabsBar route={homeRoute} projects={projects} />);
    await openTabSearch();
    const trigger = screen.getByRole('button', { name: 'Add a tab' });
    fireEvent.click(trigger);

    const picker = await screen.findByRole('dialog', { name: 'Move to group: Docs' });
    const search = within(picker).getByTestId(
      'workspace-tabs-group-assignment-search-group:docs',
    );
    await waitFor(() => expect(document.activeElement).toBe(search));
    expect(within(picker).getByTestId(
      'workspace-tabs-group-assignment-search-group:docs-regex-toggle',
    )).toBeTruthy();
    fireEvent.change(search, { target: { value: 'nothing-matches' } });
    await waitFor(() => expect(within(picker).getByRole('status')).toHaveTextContent('No tabs match.'));

    fireEvent.keyDown(search, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Move to group: Docs' })).toBeNull();
      expect(document.activeElement).toBe(trigger);
    });
  });
});

describe('the group appearance editor', () => {
  it('opens anchored from the group header on Shift+right-click', async () => {
    seedWorkspace();
    render(<WorkspaceTabsBar route={homeRoute} projects={projects} />);

     const header = await screen.findByRole('button', { name: /^Docs: 1 tabs$/u });
    fireEvent.contextMenu(header, { shiftKey: true });

    const editor = await screen.findByTestId('tab-group-appearance-editor');
    expect(within(editor).getByText('Appearance — Docs')).toBeTruthy();
    // No menu in between: the modifier is the shortcut.
    expect(screen.queryByRole('menu', { name: 'Docs' })).toBeNull();
  });

  it('offers Edit group appearance… from the plain right-click menu', async () => {
    seedWorkspace();
    render(<WorkspaceTabsBar route={homeRoute} projects={projects} />);

     const header = await screen.findByRole('button', { name: /^Docs: 1 tabs$/u });
    fireEvent.contextMenu(header);

    const menu = await screen.findByRole('menu', { name: 'Docs' });
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Edit group appearance…' }));
    expect(await screen.findByTestId('tab-group-appearance-editor')).toBeTruthy();
  });

  it('reports an unset property as the theme default, and resets one back to it', async () => {
    seedWorkspace();
    render(<WorkspaceTabsBar route={homeRoute} projects={projects} />);

     const header = await screen.findByRole('button', { name: /^Docs: 1 tabs$/u });
    fireEvent.contextMenu(header, { shiftKey: true });
    const editor = await screen.findByTestId('tab-group-appearance-editor');

    const radius = within(editor).getByRole('slider', { name: 'Corner radius' });
    fireEvent.change(radius, { target: { value: '10' } });

    await waitFor(() => {
      expect(within(editor).getByText('10px')).toBeTruthy();
    });
    // The value reaches the strip as a custom property the stylesheet reads.
    expect(
      screen
         .getByRole('button', { name: /^Docs: 1 tabs$/u })
        .closest('[data-tab-group-id]')
        ?.getAttribute('style'),
    ).toContain('--wt-group-radius: 10px');

    fireEvent.click(
      within(editor).getByRole('button', { name: 'Reset — Corner radius' }),
    );
    await waitFor(() => {
      expect(within(editor).getAllByText('Theme default').length).toBeGreaterThan(0);
    });
    expect(
      screen
         .getByRole('button', { name: /^Docs: 1 tabs$/u })
        .closest('[data-tab-group-id]')
        ?.getAttribute('style'),
    ).not.toContain('--wt-group-radius');
  });
});

describe('production ownership wiring', () => {
  it('imports and mounts the real state, discovery and appearance modules', () => {
    const source = readFileSync(
      new URL('../../src/components/WorkspaceTabsBar.tsx', import.meta.url),
      'utf8',
    );
    for (const required of [
      "from './workspace-tabs/WorkspaceTabDiscovery'",
      "from './workspace-tabs/TabGroupAppearanceEditor'",
      "from './workspace-tabs/tabGroups'",
      "from './workspace-tabs/tabPinning'",
      "from './workspace-tabs/windowRegistry'",
      '<WorkspaceTabDiscovery',
      '<TabGroupAppearanceEditor',
      'pinnedTabIds:',
      'groupMembership:',
      'groupDecorations:',
    ]) {
      expect(source).toContain(required);
    }
    expect(source).not.toContain('The tab-search button (and its popover) was removed');
  });

  it('mounts search and account actions in the real no-drag chrome at narrow-safe sizes', () => {
    render(<WorkspaceTabsBar route={homeRoute} projects={projects} />);
    const header = screen.getByRole('banner', { name: 'Workspace tabs' });
    expect(header.contains(screen.getByTestId('workspace-chrome-account-actions'))).toBe(true);
    expect(header.contains(screen.getByTestId('workspace-tabs-search-trigger'))).toBe(true);

    const css = readFileSync(
      new URL('../../src/components/WorkspaceTabsBar.module.css', import.meta.url),
      'utf8',
    );
    expect(css).toMatch(/\.discoveryTrigger\s*\{[^}]*width:\s*40px;[^}]*height:\s*40px;/s);
    expect(css).toMatch(/\.discoveryTrigger\s*\{[^}]*-webkit-app-region:\s*no-drag;/s);
    expect(css).toMatch(/\.discoveryPopover\s*\{[^}]*width:\s*min\(760px, calc\(100vw - 24px\)\);/s);
  });
});

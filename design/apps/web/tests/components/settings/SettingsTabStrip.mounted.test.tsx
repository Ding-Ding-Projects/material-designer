// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/i18n', () => ({
  useT: () => (key: string) => key,
}));

vi.mock('../../../src/security/toy-lock-core', () => ({
  createAttemptBudget: () => ({ maximum: 5, remaining: 5 }),
  interceptLockedActivation: (target: { targetId: string }, _budget: unknown, invoke: () => void) => {
    invoke();
    return { kind: 'invoked', targetId: target.targetId };
  },
}));

vi.mock('../../../src/components/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span aria-hidden>{name}</span>,
}));

vi.mock('../../../src/components/regex/RegexSearchField', () => ({
  RegexSearchField: ({ search, testId, ariaControls, autoFocus }: {
    search: { query: string; setQuery: (value: string) => void };
    testId?: string;
    ariaControls?: string;
    autoFocus?: boolean;
  }) => (
    <input
      type="search"
      data-testid={testId}
      aria-controls={ariaControls}
      autoFocus={autoFocus}
      value={search.query}
      onChange={(event) => search.setQuery(event.currentTarget.value)}
    />
  ),
}));

vi.mock('../../../src/components/ToyLockAuthenticationPopover', () => ({
  ToyLockAuthenticationPopover: () => null,
}));

import { SettingsTabStrip } from '../../../src/components/settings/SettingsTabStrip';

const tabs = [
  { section: 'general' as const, icon: 'settings' as const, titleKey: 'settings.general' as const, hintKey: 'settings.generalHint' as const },
  { section: 'workspace' as const, icon: 'users' as const, titleKey: 'settings.workspace' as const, hintKey: 'settings.workspaceHint' as const },
];

describe('SettingsTabStrip mounted docking and menu ownership', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
    cleanup();
  });

  it('maps dock edges to orientation and arrow-key selection', () => {
    const onSelect = vi.fn();
    render(
      <SettingsTabStrip
        activeSection="general"
        onSelect={onSelect}
        matchCounts={null}
        searchField={<span data-testid="settings-search-field" />}
        tabs={tabs}
      />,
    );
    const tablist = screen.getByRole('tablist');
    expect(tablist).toHaveAttribute('aria-orientation', 'vertical');
    fireEvent.keyDown(tablist, { key: 'ArrowDown' });
    expect(onSelect).toHaveBeenCalledWith('workspace');

    fireEvent.click(screen.getByTestId('settings-tabs-dock-top'));
    expect(tablist).toHaveAttribute('aria-orientation', 'horizontal');
    fireEvent.keyDown(tablist, { key: 'ArrowLeft' });
    expect(onSelect).toHaveBeenCalledWith('workspace');
  });

  it('keeps the editable search outside the menu, traverses radio items, and restores focus', async () => {
    render(
      <SettingsTabStrip
        activeSection="general"
        onSelect={() => undefined}
        matchCounts={null}
        searchField={<span data-testid="settings-search-field" />}
        tabs={tabs}
      />,
    );
    fireEvent.click(screen.getByTestId('settings-tabs-overflow'));
    const menu = screen.getByRole('menu');
    expect(menu.querySelector('input[type="search"]')).toBeNull();
    expect(screen.getByTestId('settings-tabs-overflow-search')).not.toBe(null);
    expect(menu.querySelectorAll('[role="menuitemradio"]')).toHaveLength(4);
    expect(screen.getByTestId('settings-tabs-context-dock-right')).toHaveAttribute('aria-checked', 'false');

    const left = screen.getByTestId('settings-tabs-context-dock-left');
    const right = screen.getByTestId('settings-tabs-context-dock-right');
    left.focus();
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(right);
    fireEvent.keyDown(right, { key: ' ' });
    await Promise.resolve();
    expect(screen.getByTestId('settings-tabs-overflow')).toHaveFocus();
    expect(screen.getByTestId('settings-tabs-dock-edges').closest('[data-settings-tabs-dock]'))
      .toHaveAttribute('data-settings-tabs-dock', 'right');
    expect(screen.getByRole('tablist')).toHaveAttribute('aria-orientation', 'vertical');
    expect(window.localStorage.getItem('od.settings.tabs.dockEdge')).toBe('right');

    fireEvent.click(screen.getByTestId('settings-tabs-overflow'));
    expect(screen.getByTestId('settings-tabs-context-dock-right')).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByTestId('settings-tabs-context-dock-bottom'));
    await Promise.resolve();
    expect(screen.getByTestId('settings-tabs-overflow')).toHaveFocus();
    expect(screen.getByRole('tablist')).toHaveAttribute('aria-orientation', 'horizontal');
    expect(screen.getByTestId('settings-tabs-dock-edges').closest('[data-settings-tabs-dock]'))
      .toHaveAttribute('data-settings-tabs-dock', 'bottom');
  });

  it('computes narrow vertical overflow from measured top and bottom bounds', () => {
    render(
      <SettingsTabStrip
        activeSection="general"
        onSelect={() => undefined}
        matchCounts={null}
        searchField={<span data-testid="settings-search-field" />}
        tabs={tabs}
      />,
    );
    const tablist = screen.getByRole('tablist');
    const tabButtons = Array.from(tablist.querySelectorAll<HTMLElement>('[role="tab"]'));
    const bounds = { top: 0, bottom: 80, left: 0, right: 56, width: 56, height: 80 };
    vi.spyOn(tablist, 'getBoundingClientRect').mockReturnValue(bounds as DOMRect);
    vi.spyOn(tabButtons[0]!, 'getBoundingClientRect').mockReturnValue({
      top: 0, bottom: 48, height: 48, left: 0, right: 56, width: 56,
    } as DOMRect);
    vi.spyOn(tabButtons[1]!, 'getBoundingClientRect').mockReturnValue({
      top: 60, bottom: 108, height: 48, left: 0, right: 56, width: 56,
    } as DOMRect);
    fireEvent(window, new Event('resize'));
    expect(screen.getByTestId('settings-tabs-overflow')).toHaveTextContent('1');
  });
});

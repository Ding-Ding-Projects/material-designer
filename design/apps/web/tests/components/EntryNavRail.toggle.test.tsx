// @vitest-environment jsdom

// The rail's own toggle, and the state it used to lie about.
//
// It called `onClose` unconditionally and was always labelled "Collapse
// sidebar" — inside a rail whose default state is collapsed. So the first
// thing a user clicked on a fresh profile set `false` to `false`: nothing
// moved, nothing was announced, and the control read as broken because in
// that state it was.
//
// These assertions are deliberately about the *collapsed* case, because the
// expanded one always worked and is not where the defect lived. A test that
// only checked "clicking collapse collapses it" would have gone green
// throughout.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EntryNavRail } from '../../src/components/EntryNavRail';
import { ENTRY_RAIL_TOGGLE_EVENT } from '../../src/components/entryRailBridge';

vi.mock('../../src/i18n', () => ({
  useT: () => (key: string) => key,
}));

vi.mock('../../src/components/EntryHelpMenu', () => ({
  EntryHelpMenu: () => null,
}));

function renderRail(open: boolean) {
  const onToggle = vi.fn();
  const listener = (event: Event) => onToggle(event);
  window.addEventListener(ENTRY_RAIL_TOGGLE_EVENT, listener);
  const rendered = render(
    <EntryNavRail
      view="home"
      onViewChange={() => {}}
      onNewProject={() => {}}
      open={open}
      context={null}
    />,
  );
  return {
    ...rendered,
    onToggle,
    dispose: () => window.removeEventListener(ENTRY_RAIL_TOGGLE_EVENT, listener),
  };
}

afterEach(cleanup);

describe('EntryNavRail toggle', () => {
  it('expands the rail when it is collapsed, instead of collapsing it again', () => {
    const { onToggle, dispose } = renderRail(false);

    fireEvent.click(screen.getByTestId('entry-nav-collapse'));

    expect(onToggle).toHaveBeenCalledTimes(1);
    dispose();
  });

  it('collapses the rail when it is expanded', () => {
    const { onToggle, dispose } = renderRail(true);

    fireEvent.click(screen.getByTestId('entry-nav-collapse'));

    expect(onToggle).toHaveBeenCalledTimes(1);
    dispose();
  });

  it('names the action it will take, not the state it is in', () => {
    const collapsedRail = renderRail(false);
    const collapsed = screen.getByTestId('entry-nav-collapse');
    // Collapsed: pressing it expands, so it must say so.
    expect(collapsed).toHaveAttribute('aria-label', 'entry.navExpand');
    expect(collapsed).toHaveAttribute('aria-expanded', 'false');

    collapsedRail.dispose();
    cleanup();

    const expandedRail = renderRail(true);
    const expanded = screen.getByTestId('entry-nav-collapse');
    expect(expanded).toHaveAttribute('aria-label', 'entry.navCollapse');
    expect(expanded).toHaveAttribute('aria-expanded', 'true');
    expandedRail.dispose();
  });
});

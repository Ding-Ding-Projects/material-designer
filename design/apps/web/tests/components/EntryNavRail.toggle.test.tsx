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

vi.mock('../../src/i18n', () => ({
  useT: () => (key: string) => key,
}));

vi.mock('../../src/components/EntryHelpMenu', () => ({
  EntryHelpMenu: () => null,
}));

function renderRail(open: boolean, handlers: { onOpen: () => void; onClose: () => void }) {
  return render(
    <EntryNavRail
      view="home"
      onViewChange={() => {}}
      onNewProject={() => {}}
      open={open}
      onClose={handlers.onClose}
      onOpen={handlers.onOpen}
    />,
  );
}

afterEach(cleanup);

describe('EntryNavRail toggle', () => {
  it('expands the rail when it is collapsed, instead of collapsing it again', () => {
    const onOpen = vi.fn();
    const onClose = vi.fn();
    renderRail(false, { onOpen, onClose });

    fireEvent.click(screen.getByTestId('entry-nav-collapse'));

    expect(onOpen).toHaveBeenCalledTimes(1);
    // The whole defect: this used to fire, setting false to false.
    expect(onClose).not.toHaveBeenCalled();
  });

  it('collapses the rail when it is expanded', () => {
    const onOpen = vi.fn();
    const onClose = vi.fn();
    renderRail(true, { onOpen, onClose });

    fireEvent.click(screen.getByTestId('entry-nav-collapse'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('names the action it will take, not the state it is in', () => {
    const handlers = { onOpen: vi.fn(), onClose: vi.fn() };
    renderRail(false, handlers);
    const collapsed = screen.getByTestId('entry-nav-collapse');
    // Collapsed: pressing it expands, so it must say so.
    expect(collapsed).toHaveAttribute('aria-label', 'entry.navExpand');
    expect(collapsed).toHaveAttribute('aria-expanded', 'false');

    cleanup();

    renderRail(true, handlers);
    const expanded = screen.getByTestId('entry-nav-collapse');
    expect(expanded).toHaveAttribute('aria-label', 'entry.navCollapse');
    expect(expanded).toHaveAttribute('aria-expanded', 'true');
  });
});

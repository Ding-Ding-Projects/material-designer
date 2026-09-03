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
  useI18n: () => ({ t: (key: string) => key }),
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
  it('does not expose a dead expand control inside the inert collapsed rail', () => {
    const { dispose } = renderRail(false);

    expect(screen.queryByTestId('entry-rail-collapse')).toBeNull();
    dispose();
  });

  it('collapses the rail when it is expanded', () => {
    const { onToggle, dispose } = renderRail(true);

    fireEvent.click(screen.getByTestId('entry-rail-collapse'));

    expect(onToggle).toHaveBeenCalledTimes(1);
    dispose();
  });

  it('keeps the in-rail control collapse-only', () => {
    const expandedRail = renderRail(true);
    const expanded = screen.getByTestId('entry-rail-collapse');
    expect(expanded).toHaveAttribute('aria-label', 'entry.navCollapse');
    expect(expanded).toHaveAttribute('aria-expanded', 'true');
    expandedRail.dispose();
  });

  it('wires the new-project entry point and disabled state', () => {
    const onNewProject = vi.fn();
    const { rerender } = render(
      <EntryNavRail
        view="home"
        onViewChange={() => {}}
        onNewProject={onNewProject}
        open
        context={null}
      />,
    );

    fireEvent.click(screen.getByTestId('entry-nav-new-project'));
    expect(onNewProject).toHaveBeenCalledTimes(1);

    rerender(
      <EntryNavRail
        view="home"
        onViewChange={() => {}}
        onNewProject={onNewProject}
        newProjectDisabled
        open
        context={null}
      />,
    );
    expect(screen.getByTestId('entry-nav-new-project')).toBeDisabled();
  });
});

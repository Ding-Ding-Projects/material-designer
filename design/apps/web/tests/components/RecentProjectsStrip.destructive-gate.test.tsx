// @vitest-environment jsdom
//
// The Home strip's project delete, and why it needed the same gate the Projects
// tab already had.
//
// Both surfaces call the same `onDelete`, which cancels in-flight runs, drops
// the SQLite row and removes the whole project directory — an operation no
// history domain covers and nothing in the product undoes. `DesignsTab` put the
// two-key-plus-slider gate in front of it; this strip asked with a single
// button and a `?`, so the route a user happened to take decided how much stood
// between them and the deletion, and the shortest route had the least. A gate
// that guards one of two doors to the same room is closer to a false assurance
// than to a safety feature.
//
// Every query below that could match the project's name is scoped to (or away
// from) the gate on purpose: the gate names the thing it will destroy, so while
// it is open the name is on screen twice, and an unscoped `getByText` fails
// with "found multiple elements" rather than with anything about the gate.

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RecentProjectsStrip } from '../../src/components/RecentProjectsStrip';
import type { Project } from '../../src/types';

vi.mock('../../src/providers/registry', () => ({
  fetchProjectFileText: vi.fn(async () => null),
  fetchProjectFiles: vi.fn(async () => []),
  projectFileUrl: (projectId: string, fileName: string) =>
    `/api/projects/${projectId}/files/${fileName}`,
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const project: Project = {
  id: 'project-1',
  name: 'Landing refresh',
  skillId: null,
  designSystemId: null,
  createdAt: 1,
  updatedAt: 2,
  status: { value: 'not_started' },
};

/**
 * Drive the gate all the way: both keys, then the slider end to end.
 *
 * Five advances, not one. `gateMachine` rations forward travel to a fifth of
 * the range per input event precisely so a single far-end click or one `End`
 * press cannot satisfy a control whose point is deliberate full-range movement,
 * so this is the gesture a user actually has to make rather than a workaround
 * for one.
 */
function authorizeDestructiveGate(): void {
  const gate = screen.getByTestId('destructive-gate');
  // Engage each key only if it is not already engaged. The keys are toggles,
  // so a test that turns one on first — to prove the slider stays locked on
  // one key — would otherwise have it turned back off here, and the gate would
  // never arm. Reading `aria-checked` makes the helper safe to call from any
  // state rather than only from an untouched gate.
  for (const testId of ['destructive-gate-key-first', 'destructive-gate-key-second']) {
    const key = within(gate).getByTestId(testId);
    if (key.getAttribute('aria-checked') !== 'true') fireEvent.click(key);
  }
  // Five advances, because the slider rations how far one input event may
  // carry it — a single jump to the end is refused by design.
  for (const value of ['20', '40', '60', '80', '100']) {
    fireEvent.change(within(gate).getByTestId('destructive-gate-slider'), {
      target: { value },
    });
  }
}

/** Open the card's overflow menu and press its Delete item. */
function requestDeleteFromCard(): void {
  fireEvent.click(screen.getByRole('button', { name: /More actions/u }));
  fireEvent.click(screen.getByRole('menuitem', { name: /Delete/u }));
}

function renderStrip(onDelete: (id: string) => Promise<boolean | void> | boolean | void) {
  return render(
    <RecentProjectsStrip
      projects={[project]}
      onOpen={() => {}}
      onViewAll={() => {}}
      onDelete={onDelete}
    />,
  );
}

describe('RecentProjectsStrip delete', () => {
  it('opens the super-confirmation gate rather than a one-button confirm', async () => {
    const onDelete = vi.fn().mockResolvedValue(true);
    renderStrip(onDelete);

    requestDeleteFromCard();

    const gate = await screen.findByTestId('destructive-gate');
    // Two keys and a slider — the shape a stray Enter cannot answer.
    expect(within(gate).getByTestId('destructive-gate-key-first')).toBeTruthy();
    expect(within(gate).getByTestId('destructive-gate-key-second')).toBeTruthy();
    expect(within(gate).getByTestId('destructive-gate-slider')).toBeTruthy();
    // It names the project rather than asking "are you sure?", and says plainly
    // that this one does not come back.
    expect(within(gate).getAllByText(/Landing refresh/u).length).toBeGreaterThan(0);
    expect(
      within(gate).getByTestId('destructive-gate-reversibility').textContent,
    ).toMatch(/cannot be undone/iu);

    // Nothing has happened yet: opening the gate is not authorizing it.
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('deletes only after both keys and the full slider', async () => {
    const onDelete = vi.fn().mockResolvedValue(true);
    renderStrip(onDelete);

    requestDeleteFromCard();
    await screen.findByTestId('destructive-gate');

    // One key alone leaves the slider locked, so nothing can fire.
    const gate = screen.getByTestId('destructive-gate');
    fireEvent.click(within(gate).getByTestId('destructive-gate-key-first'));
    expect(
      within(gate).getByTestId('destructive-gate-slider').hasAttribute('disabled'),
    ).toBe(true);
    expect(onDelete).not.toHaveBeenCalled();

    authorizeDestructiveGate();

    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledWith('project-1');
    });
  });

  it('escaping the gate deletes nothing and leaves the card in place', async () => {
    const onDelete = vi.fn().mockResolvedValue(true);
    const { container } = renderStrip(onDelete);

    requestDeleteFromCard();
    await screen.findByTestId('destructive-gate');

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByTestId('destructive-gate')).toBeNull();
    });
    expect(onDelete).not.toHaveBeenCalled();
    // Scoped to the card, because with the gate gone the name is on screen
    // exactly once and this is the copy that must have survived.
    expect(container.querySelector('.recent-projects__card-name')?.textContent).toBe(
      'Landing refresh',
    );
  });

  // A refused delete used to close the dialog over a project that was still
  // there. The handler's own verdict is now returned, so `false` holds the gate
  // open saying so.
  it('holds the gate open when the delete fails', async () => {
    const onDelete = vi.fn().mockResolvedValue(false);
    renderStrip(onDelete);

    requestDeleteFromCard();
    await screen.findByTestId('destructive-gate');
    authorizeDestructiveGate();

    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledWith('project-1');
    });
    await waitFor(() => {
      expect(
        screen.getByTestId('destructive-gate').getAttribute('data-phase'),
      ).toBe('failed');
    });
    expect(screen.queryByTestId('destructive-gate')).not.toBeNull();
  });
});

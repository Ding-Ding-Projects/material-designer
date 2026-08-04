// @vitest-environment jsdom
//
// Deleting a conversation used to be a `confirm()` on the row's "×": one
// blocking browser dialog, answered by one mistimed Enter, and every message
// in the thread was gone with nothing in the product to put them back. It now
// opens the app's own super-confirmation gate, which is what this file pins —
// that the click alone deletes nothing, that the gate names the conversation
// the user is about to lose, and that backing out leaves the thread intact.

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConversationsMenu } from '../../src/components/ConversationsMenu';
import { I18nProvider } from '../../src/i18n';
import type { Conversation } from '../../src/types';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const conversations: Conversation[] = [
  {
    id: 'conv-1',
    projectId: 'project-1',
    title: 'Landing page copy',
    createdAt: 1,
    updatedAt: 2,
  },
  {
    id: 'conv-2',
    projectId: 'project-1',
    title: 'Pricing table',
    createdAt: 3,
    updatedAt: 4,
  },
];

function renderMenu(onDelete: (id: string) => void) {
  return render(
    <I18nProvider initial="en">
      <ConversationsMenu
        conversations={conversations}
        activeId="conv-1"
        onSelect={() => {}}
        onCreate={() => {}}
        onDelete={onDelete}
        onRename={() => {}}
      />
    </I18nProvider>,
  );
}

/** Open the dropdown and press the "×" on the named conversation's row. */
function pressDeleteFor(title: string): void {
  // The pill shows the active conversation's own title, so before the
  // dropdown opens that string appears exactly once and identifies the pill.
  const pill = screen.getByText('Landing page copy').closest('button');
  if (!pill) throw new Error('Expected the conversations pill');
  fireEvent.click(pill);
  const row = screen
    .getAllByText(title)
    .map((node) => node.closest('li'))
    .find((node): node is HTMLLIElement => node !== null);
  if (!row) throw new Error(`Expected a conversation row for ${title}`);
  fireEvent.click(within(row).getByTitle('Delete conversation'));
}

describe('ConversationsMenu delete', () => {
  it('opens the destructive gate instead of deleting on the first click', () => {
    const onDelete = vi.fn();
    renderMenu(onDelete);

    pressDeleteFor('Pricing table');

    expect(screen.getByTestId('destructive-gate')).toBeTruthy();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('names the conversation and what goes with it', () => {
    renderMenu(vi.fn());

    pressDeleteFor('Pricing table');

    const gate = screen.getByTestId('destructive-gate');
    // The title has to appear as the target, so the user can check the slider
    // against the thread they meant rather than against "Are you sure?".
    expect(gate.textContent).toContain('Pricing table');
    expect(within(gate).getByTestId('destructive-gate-items').textContent).toContain(
      'every message in it',
    );
    expect(
      within(gate).getByTestId('destructive-gate-reversibility').textContent,
    ).toMatch(/cannot be undone/i);
  });

  it('deletes only after both keys and the whole slider', async () => {
    const onDelete = vi.fn();
    renderMenu(onDelete);

    pressDeleteFor('Pricing table');

    const gate = screen.getByTestId('destructive-gate');
    // One key alone leaves the slider locked, so dragging it does nothing.
    fireEvent.click(within(gate).getByTestId('destructive-gate-key-first'));
    fireEvent.change(within(gate).getByTestId('destructive-gate-slider'), {
      target: { value: '100' },
    });
    expect(onDelete).not.toHaveBeenCalled();

    fireEvent.click(within(gate).getByTestId('destructive-gate-key-second'));
    // Both keys on, but a single jump to the end is rationed back — the whole
    // point of the control is travel the user has to keep making.
    fireEvent.change(within(gate).getByTestId('destructive-gate-slider'), {
      target: { value: '100' },
    });
    expect(onDelete).not.toHaveBeenCalled();

    for (const value of ['40', '60', '80', '100']) {
      fireEvent.change(within(gate).getByTestId('destructive-gate-slider'), {
        target: { value },
      });
    }

    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledWith('conv-2');
    });
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('leaves the conversation alone when the emergency exit is used', async () => {
    const onDelete = vi.fn();
    renderMenu(onDelete);

    pressDeleteFor('Pricing table');

    const gate = screen.getByTestId('destructive-gate');
    fireEvent.click(within(gate).getByTestId('destructive-gate-key-first'));
    fireEvent.click(within(gate).getByTestId('destructive-gate-key-second'));
    fireEvent.change(within(gate).getByTestId('destructive-gate-slider'), {
      target: { value: '20' },
    });
    fireEvent.click(within(gate).getByTestId('destructive-gate-exit'));

    await waitFor(() => {
      expect(screen.queryByTestId('destructive-gate')).toBeNull();
    });
    expect(onDelete).not.toHaveBeenCalled();
    // The dropdown is still open behind the gate, so the row the user aimed
    // at is still there to aim at again.
    expect(screen.getByText('Pricing table')).toBeTruthy();
  });

  it('keeps the dropdown open while the gate is up so focus has somewhere to return', () => {
    renderMenu(vi.fn());

    pressDeleteFor('Pricing table');

    const gate = screen.getByTestId('destructive-gate');
    // Turning a key is a mousedown outside the menu. Before the gate existed
    // that closed the dropdown; now it must not, or the "×" the gate hands
    // focus back to would have been unmounted underneath it.
    fireEvent.mouseDown(within(gate).getByTestId('destructive-gate-key-first'));
    fireEvent.click(within(gate).getByTestId('destructive-gate-key-first'));

    // Two rows still in the list, so the one that was aimed at is still there.
    expect(screen.getAllByTitle('Delete conversation')).toHaveLength(2);
  });
});

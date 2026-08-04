// @vitest-environment jsdom

// The gate's rules live in `gateMachine.ts` and are asserted directly there.
// What is left for this file is everything the machine cannot see: what happens
// when the gate is re-pointed at a different target, what a `<input
// type="range">` actually delivers on one gesture, where a failure goes when the
// dialog is no longer mounted to show it, and where focus lands on the way out.

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DestructiveGate,
  type DestructiveGateOutcome,
  type DestructiveGateProps,
} from '../../../src/components/destructive/DestructiveGate';
import {
  clearNotifications,
  readNotifications,
} from '../../../src/components/notifications/notificationStore';

function slider(): HTMLInputElement {
  return screen.getByTestId('destructive-gate-slider') as HTMLInputElement;
}

function keyFirst(): HTMLElement {
  return screen.getByTestId('destructive-gate-key-first');
}

function keySecond(): HTMLElement {
  return screen.getByTestId('destructive-gate-key-second');
}

function turnBothKeys(): void {
  fireEvent.click(keyFirst());
  fireEvent.click(keySecond());
}

/**
 * The whole travel, as a hand makes it. The gate rations how far one change
 * event may carry the slider, so arming it takes several advances — which is
 * the point of the control and therefore the point of this helper.
 */
function slideToEnd(): void {
  for (const value of [20, 40, 60, 80, 100]) {
    fireEvent.change(slider(), { target: { value: String(value) } });
  }
}

function gate(props: Partial<DestructiveGateProps> = {}) {
  return (
    <DestructiveGate
      action="Delete project"
      target="Alpha"
      items={['Alpha files']}
      irreversible
      onConfirm={() => true}
      onClose={() => {}}
      {...props}
    />
  );
}

beforeEach(() => {
  clearNotifications();
  // jsdom ships no `matchMedia`. Answering it here — and answering "yes, less
  // motion" — makes the completion hold zero-length, so the completed path is
  // observable without a real 900ms wait.
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
});

afterEach(() => {
  cleanup();
  clearNotifications();
});

describe('destructive gate — re-pointed at another target', () => {
  it('throws away keys and slider that were turned for the previous target', () => {
    const { rerender } = render(gate({ target: 'Alpha', items: ['Alpha files'] }));
    turnBothKeys();
    fireEvent.change(slider(), { target: { value: '20' } });
    expect(keyFirst()).toHaveAttribute('aria-checked', 'true');
    expect(keySecond()).toHaveAttribute('aria-checked', 'true');

    rerender(gate({ target: 'Beta', items: ['Beta files'] }));

    // Authorisation was given for Alpha. Beta gets none of it.
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(keyFirst()).toHaveAttribute('aria-checked', 'false');
    expect(keySecond()).toHaveAttribute('aria-checked', 'false');
    expect(slider().value).toBe('0');
    expect(slider()).toBeDisabled();
  });

  it('keeps the keys through a re-render that changes nothing about the target', () => {
    const { rerender } = render(gate({ items: ['Alpha files'] }));
    turnBothKeys();
    // A fresh array with identical contents, which is what a host re-render
    // routinely produces. Resetting here would throw the user's work away for
    // no reason at all.
    rerender(gate({ items: ['Alpha files'] }));
    expect(keyFirst()).toHaveAttribute('aria-checked', 'true');
    expect(keySecond()).toHaveAttribute('aria-checked', 'true');
  });
});

describe('destructive gate — the slider cannot be crossed in one gesture', () => {
  it('does not authorize when the whole range arrives in a single change', () => {
    const onConfirm = vi.fn(() => true);
    render(gate({ onConfirm }));
    turnBothKeys();

    // A click on the far end of the track, or one press of `End`: the control
    // hands over 100 in one event.
    fireEvent.change(slider(), { target: { value: '100' } });

    expect(onConfirm).not.toHaveBeenCalled();
    expect(slider().getAttribute('aria-valuetext')).toContain('20');
    expect(screen.getByTestId('destructive-gate')).toHaveAttribute('data-phase', 'idle');
  });

  it('authorizes once the same jump has been repeated across the range', () => {
    const onConfirm = vi.fn(() => true);
    render(gate({ onConfirm }));
    turnBothKeys();

    // The keyboard route stays open: `End` still works, it just has to be
    // pressed again. Five presses is the whole range at a fifth per press.
    for (let press = 0; press < 5; press += 1) {
      fireEvent.change(slider(), { target: { value: '100' } });
    }

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe('destructive gate — a failure that outlives the gate', () => {
  it('raises a notification when the action rejects after the gate has closed', async () => {
    // Held open so the case decides exactly when the action fails — after the
    // gate has gone, which is the whole point.
    let reject!: (reason: unknown) => void;
    const onConfirm = () =>
      new Promise<boolean>((_resolve, rejectPromise) => {
        reject = rejectPromise;
      });

    const { unmount } = render(gate({ onConfirm }));
    turnBothKeys();
    slideToEnd();
    expect(screen.getByTestId('destructive-gate')).toHaveAttribute('data-phase', 'authorizing');

    // The user closes the dialog while the deletion is still in flight, and
    // only then does it fail. Before, that rejection was swallowed whole.
    unmount();
    await act(async () => {
      reject(new Error('the daemon refused'));
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(readNotifications()).toHaveLength(1));
    expect(readNotifications()[0]).toMatchObject({
      severity: 'error',
      // The action names itself, so the notification is readable on its own —
      // the gate that carried the context is gone.
      title: 'Delete project',
      body: 'the daemon refused',
    });
  });

  it('shows the failure in place when the gate is still open', async () => {
    const onConfirm = () => Promise.reject(new Error('the daemon refused'));
    render(gate({ onConfirm }));
    turnBothKeys();
    slideToEnd();

    await waitFor(() =>
      expect(screen.getByTestId('destructive-gate-failure')).toHaveTextContent(
        'the daemon refused',
      ),
    );
    // Nothing is raised twice: the open gate is already saying it.
    expect(readNotifications()).toHaveLength(0);
  });
});

describe('destructive gate — what it reports on the way out', () => {
  it('reports a cancellation when nothing has run', () => {
    const onClose = vi.fn();
    render(gate({ onClose }));
    fireEvent.click(screen.getByTestId('destructive-gate-exit'));
    expect(onClose).toHaveBeenCalledWith('cancelled');
  });

  it('refuses to report a cancellation once the action is running', () => {
    const onClose = vi.fn();
    // Never settles: the gate stays in flight for the whole case.
    const onConfirm = () => new Promise<boolean>(() => {});
    render(gate({ onClose, onConfirm }));
    turnBothKeys();
    slideToEnd();

    fireEvent.keyDown(slider(), { key: 'Escape' });

    expect(onClose).toHaveBeenCalledWith('dismissed');
    expect(onClose).not.toHaveBeenCalledWith('cancelled');
  });

  it('refuses to report a cancellation from the emergency exit either', () => {
    const onClose = vi.fn();
    const onConfirm = () => new Promise<boolean>(() => {});
    render(gate({ onClose, onConfirm }));
    turnBothKeys();
    slideToEnd();

    fireEvent.click(screen.getByTestId('destructive-gate-exit'));

    expect(onClose).toHaveBeenCalledWith('dismissed');
  });
});

interface HarnessProps {
  onOutcome?: (outcome: DestructiveGateOutcome) => void;
  onConfirm?: () => Promise<boolean | void> | boolean | void;
}

/**
 * A control that opens the gate, so focus has somewhere real to come from and
 * somewhere real to go back to.
 */
function Harness({ onOutcome, onConfirm }: HarnessProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" data-testid="opener" onClick={() => setOpen(true)}>
        Delete project
      </button>
      {open ? (
        <DestructiveGate
          action="Delete project"
          target="Alpha"
          items={['Alpha files']}
          irreversible
          onConfirm={onConfirm ?? (() => true)}
          onClose={(outcome) => {
            onOutcome?.(outcome);
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

function openGate(props: HarnessProps = {}): HTMLElement {
  render(<Harness {...props} />);
  const opener = screen.getByTestId('opener');
  // jsdom's click does not move focus, so the opener is focused explicitly —
  // which is what a real click would have done before the gate opened.
  opener.focus();
  fireEvent.click(opener);
  expect(document.activeElement).not.toBe(opener);
  return opener;
}

describe('destructive gate — focus goes back where it came from', () => {
  it('after the emergency exit', () => {
    const opener = openGate();
    fireEvent.click(screen.getByTestId('destructive-gate-exit'));
    expect(document.activeElement).toBe(opener);
  });

  it('after Escape', () => {
    const opener = openGate();
    fireEvent.keyDown(keyFirst(), { key: 'Escape' });
    expect(document.activeElement).toBe(opener);
  });

  it('after Escape while the action is in flight', () => {
    const opener = openGate({ onConfirm: () => new Promise<boolean>(() => {}) });
    turnBothKeys();
    slideToEnd();
    fireEvent.keyDown(slider(), { key: 'Escape' });
    expect(document.activeElement).toBe(opener);
  });

  it('after the action completes', async () => {
    const onOutcome = vi.fn();
    const opener = openGate({ onOutcome });
    turnBothKeys();
    slideToEnd();
    await waitFor(() => expect(onOutcome).toHaveBeenCalledWith('completed'));
    expect(document.activeElement).toBe(opener);
  });
});

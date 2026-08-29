// @vitest-environment jsdom

import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ToyLockActivationBoundary, type ToyLockActivationBoundaryHandle } from '../../src/components/toy-locks/ToyLockActivationBoundary';
import { createAttemptBudget } from '../../src/security/toy-lock-core';

afterEach(cleanup);

describe('ToyLockActivationBoundary', () => {
  it('intercepts pointer and keyboard routes before a protected child action', () => {
    const invoke = vi.fn();
    const auth = vi.fn();
    const { getByRole } = render(
      <ToyLockActivationBoundary
        target={{ targetId: 'button', policy: 'pin', locked: true }}
        budget={createAttemptBudget()}
        onRequestAuthentication={auth}
        onInvoked={invoke}
      >
        <button type="button" onClick={invoke}>Protected</button>
      </ToyLockActivationBoundary>,
    );
    const button = getByRole('button', { name: 'Protected' });
    fireEvent.click(button);
    fireEvent.keyDown(button, { key: 'Enter' });
    expect(invoke).not.toHaveBeenCalled();
    expect(auth).toHaveBeenCalledTimes(1);
    expect(auth).toHaveBeenCalledWith(expect.objectContaining({ kind: 'authentication-required' }), expect.any(String));
  });

  it('intercepts the imperative programmatic route and invokes only when unlocked', () => {
    const auth = vi.fn();
    const invoke = vi.fn();
    const ref = { current: null as ToyLockActivationBoundaryHandle | null };
    render(<ToyLockActivationBoundary ref={ref} target={{ targetId: 'locked', policy: 'password', locked: true }} budget={createAttemptBudget()} onRequestAuthentication={auth} onInvoked={invoke}><button type="button">Protected</button></ToyLockActivationBoundary>);
    expect(ref.current?.activate('programmatic').kind).toBe('authentication-required');
    expect(invoke).not.toHaveBeenCalled();
    cleanup();
    render(<ToyLockActivationBoundary ref={ref} target={{ targetId: 'open', policy: 'password', locked: false }} budget={createAttemptBudget()} onRequestAuthentication={auth} onInvoked={invoke}><button type="button">Open</button></ToyLockActivationBoundary>);
    expect(ref.current?.activate('programmatic').kind).toBe('invoked');
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});

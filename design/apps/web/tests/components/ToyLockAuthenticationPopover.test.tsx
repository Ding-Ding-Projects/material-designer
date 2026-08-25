// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  TOY_LOCK_POLICIES,
  factorsForPolicy,
  type ToyLockFactor,
  type ToyLockPolicy,
} from '../../src/security/toy-lock-core';
import {
  ToyLockAuthenticationPopover,
  type ToyLockVerificationRequest,
} from '../../src/components/ToyLockAuthenticationPopover';

afterEach(() => {
  cleanup();
  document.querySelectorAll('[data-toy-lock-test-anchor]').forEach((element) => element.remove());
});

function opener(): HTMLButtonElement {
  const button = document.createElement('button');
  button.textContent = 'Protected action';
  button.dataset.toyLockTestAnchor = 'true';
  document.body.append(button);
  button.focus();
  return button;
}

function renderPrompt(
  policy: ToyLockPolicy,
  verifyFactor: (request: ToyLockVerificationRequest) => boolean | Promise<boolean> = () => true,
) {
  const anchor = opener();
  const onAuthenticated = vi.fn();
  const onCancel = vi.fn();
  render(
    <ToyLockAuthenticationPopover
      targetId="save-button"
      targetLabel="Save button"
      policy={policy}
      anchor={anchor}
      verifyFactor={verifyFactor}
      onAuthenticated={onAuthenticated}
      onCancel={onCancel}
    />,
  );
  return { anchor, onAuthenticated, onCancel };
}

function enterFactor(factor: ToyLockFactor) {
  if (factor === 'pin') {
    fireEvent.click(screen.getByRole('button', { name: '1' }));
    fireEvent.click(screen.getByRole('button', { name: '2' }));
    fireEvent.click(screen.getByRole('button', { name: '3' }));
    fireEvent.click(screen.getByRole('button', { name: '4' }));
  } else {
    fireEvent.change(screen.getByLabelText(factor === 'password' ? 'Password' : 'Authenticator code'), {
      target: { value: factor === 'password' ? 'correct horse' : '123456' },
    });
  }
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
}

describe('ToyLockAuthenticationPopover', () => {
  it.each(TOY_LOCK_POLICIES)('accepts every configured factor before authorizing %s', async (policy) => {
    const verify = vi.fn(() => true);
    const { onAuthenticated } = renderPrompt(policy, verify);
    const factors = factorsForPolicy(policy);

    for (const [index, factor] of factors.entries()) {
      enterFactor(factor);
      await waitFor(() => expect(verify).toHaveBeenCalledTimes(index + 1));
      if (index < factors.length - 1) {
        expect(onAuthenticated).not.toHaveBeenCalled();
        const next = factors[index + 1]!;
        await waitFor(() => expect(screen.getByText(
          `Factor ${index + 2} of ${factors.length}: ${next === 'pin' ? 'PIN' : next === 'password' ? 'Password' : 'Authenticator code'}`,
        )).toBeTruthy());
      }
    }

    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledTimes(1));
    expect(onAuthenticated).toHaveBeenCalledWith({
      targetId: 'save-button',
      policy,
      acceptedFactors: factors,
    });
  });

  it('normalizes both access-keypad and manual PIN entry before verification', async () => {
    const verify = vi.fn(() => true);
    const first = renderPrompt('pin', verify);
    enterFactor('pin');
    await waitFor(() => expect(first.onAuthenticated).toHaveBeenCalledTimes(1));
    expect(verify).toHaveBeenLastCalledWith(expect.objectContaining({ value: '1234', pinSource: 'keypad' }));
    cleanup();

    const second = renderPrompt('pin', verify);
    fireEvent.click(screen.getByRole('button', { name: 'Manual PIN entry' }));
    fireEvent.change(screen.getByTestId('toy-lock-factor-input'), { target: { value: ' 1234 ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(second.onAuthenticated).toHaveBeenCalledTimes(1));
    expect(verify).toHaveBeenLastCalledWith(expect.objectContaining({ value: '1234', pinSource: 'manual' }));
  });

  it('shows and exhausts one visible attempt budget without authorizing', async () => {
    const verify = vi.fn(() => false);
    const { onAuthenticated } = renderPrompt('password', verify);

    expect(screen.getByText('5 of 5 attempts remaining')).toBeTruthy();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } });
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
      await waitFor(() => expect(verify).toHaveBeenCalledTimes(attempt + 1));
      await waitFor(() => expect(screen.getByText(`${4 - attempt} of 5 attempts remaining`)).toBeTruthy());
    }

    expect(screen.getByText('0 of 5 attempts remaining')).toBeTruthy();
    expect(screen.getByText('No attempts remain. Cancel and reopen this prompt to try again.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    expect(onAuthenticated).not.toHaveBeenCalled();
  });

  it('rejects malformed PINs before calling the host verifier', () => {
    const verify = vi.fn(() => true);
    renderPrompt('pin', verify);
    fireEvent.click(screen.getByRole('button', { name: '1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByText('Enter a PIN containing 4 to 12 digits.')).toBeTruthy();
    expect(verify).not.toHaveBeenCalled();
  });

  it('cancels with Escape, restores focus, and never runs the protected callback', () => {
    const { anchor, onAuthenticated, onCancel } = renderPrompt('password');
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onAuthenticated).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(anchor);
  });

  it('cancels while verification is pending and ignores its late acceptance', async () => {
    let accept!: (matched: boolean) => void;
    const verify = vi.fn(() => new Promise<boolean>((resolve) => { accept = resolve; }));
    const { onAuthenticated, onCancel } = renderPrompt('password', verify);
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pending' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(verify).toHaveBeenCalledTimes(1));

    const cancelButtons = screen.getAllByRole('button', { name: 'Cancel' });
    fireEvent.click(cancelButtons[cancelButtons.length - 1]!);
    expect(onCancel).toHaveBeenCalledTimes(1);
    accept(true);
    await Promise.resolve();
    expect(onAuthenticated).not.toHaveBeenCalled();
  });

  it('reports verifier errors without consuming an attempt', async () => {
    renderPrompt('password', () => Promise.reject(new Error('credential store unavailable')));
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'candidate' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByText('The factor could not be checked. Try again.')).toBeTruthy();
    expect(screen.getByText('5 of 5 attempts remaining')).toBeTruthy();
  });
});

// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { UnlockLadder } from '../../../src/components/unlock-ladder/UnlockLadder';

describe('unlock ladder surface', () => {
  test('starts a host challenge and states that only the wait is cleared', async () => {
    const bridge = { issue: vi.fn().mockResolvedValue({ nonce: 'n1', stage: 'dish', expiresAtMs: Date.now() + 10_000, choices: ['har-gow', 'siu-mai', 'cheung-fun', 'char-siu-bao'] }), submit: vi.fn().mockResolvedValue({ ok: true, clearedWait: true, state: { stage: 'clock', waitingUntilMs: Date.now(), remainingAttempts: 2, consecutiveLockouts: 1, ladderUsesInWindow: 1, windowStartedAtMs: Date.now() } }) };
    render(<UnlockLadder lockoutId="lock-1" bridge={bridge} />);
    expect(screen.getByText(/clears the waiting time only/iu)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Play the unlock ladder' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'har-gow' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'har-gow' }));
    await waitFor(() => expect(bridge.submit).toHaveBeenCalledWith('lock-1', 'n1', 0));
    expect(await screen.findByRole('alert')).toHaveTextContent(/normal credential/iu);
  });
});

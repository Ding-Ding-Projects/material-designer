// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import { withToyLockUiDeadline } from '../../src/components/toy-locks/host-call';

describe('withToyLockUiDeadline', () => {
  afterEach(() => vi.useRealTimers());

  it('supports synchronous host adapters and clears its timer', async () => {
    vi.useFakeTimers();
    await expect(withToyLockUiDeadline(() => 'ready')).resolves.toBe('ready');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects a missing host reply at the bounded deadline', async () => {
    vi.useFakeTimers();
    const result = withToyLockUiDeadline(() => new Promise<string>(() => undefined), 25);
    const expectation = expect(result).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(25);
    await expectation;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears the deadline when the host adapter throws synchronously', async () => {
    vi.useFakeTimers();
    const failure = new Error('synchronous host failure');
    await expect(withToyLockUiDeadline(() => { throw failure; })).rejects.toBe(failure);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(vi.getTimerCount()).toBe(0);
  });
});

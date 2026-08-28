// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import { withToyLockUiDeadline } from '../../src/components/settings/toy-lock-host-call';

describe('withToyLockUiDeadline', () => {
  afterEach(() => vi.useRealTimers());

  it('clears the deadline when the operation throws before returning a promise', async () => {
    vi.useFakeTimers();
    const failure = new Error('synchronous host failure');
    const result = withToyLockUiDeadline(() => { throw failure; });
    await expect(result).rejects.toBe(failure);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(vi.getTimerCount()).toBe(0);
  });
});

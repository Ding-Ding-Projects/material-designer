import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  HISTORY_REQUEST_TIMEOUT_MS,
  requestHistory,
} from '../../src/lib/history/client';

describe('history request deadlines', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('aborts a stalled request and clears its timeout', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | null | undefined;
    vi.stubGlobal('fetch', vi.fn((_path: string, init?: RequestInit) => {
      signal = init?.signal;
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
      });
    }));

    const pending = requestHistory('/api/history');
    await vi.advanceTimersByTimeAsync(HISTORY_REQUEST_TIMEOUT_MS);
    const result = await pending;

    expect(signal?.aborted).toBe(true);
    expect(result).toEqual({
      ok: false,
      error: `history request timed out after ${HISTORY_REQUEST_TIMEOUT_MS} ms`,
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears the deadline after a successful response', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));

    await expect(requestHistory('/api/history')).resolves.toEqual({
      ok: true,
      value: { ok: true },
    });
    expect(vi.getTimerCount()).toBe(0);
  });
});

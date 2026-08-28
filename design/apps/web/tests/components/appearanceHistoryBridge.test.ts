import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  acknowledgeAppearanceMutation,
  APPEARANCE_HISTORY_TIMEOUT_MS,
} from '../../src/components/appearance/appearanceHistoryBridge';

describe('appearance history acknowledgement bridge', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('posts only the bounded redacted metadata and returns the acknowledgement', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      acknowledged: true,
      duplicate: false,
      historyRevisionId: 'history-1',
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(acknowledgeAppearanceMutation({
      domainId: 'appearance',
      targetId: 'tab:home:label',
      action: 'updated',
      revisionId: 'client-revision-1',
    })).resolves.toEqual({ acknowledged: true, duplicate: false, historyRevisionId: 'history-1' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual({
      domainId: 'appearance',
      targetId: 'tab:home:label',
      action: 'updated',
      revisionId: 'client-revision-1',
    });
  });

  it('rejects paths and malformed acknowledgements before applying them', async () => {
    await expect(acknowledgeAppearanceMutation({
      domainId: 'appearance',
      targetId: '../secret',
      action: 'updated',
      revisionId: 'client-revision-2',
    })).rejects.toThrow('invalid appearance history mutation metadata');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
    await expect(acknowledgeAppearanceMutation({
      domainId: 'appearance',
      targetId: 'tab:home:label',
      action: 'updated',
      revisionId: 'client-revision-3',
    })).rejects.toThrow('appearance history acknowledgement was malformed');
  });

  it('rejects a stalled endpoint at the bounded deadline', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_path: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    })));
    const pending = acknowledgeAppearanceMutation({
      domainId: 'appearance',
      targetId: 'tab:home:label',
      action: 'updated',
      revisionId: 'client-revision-4',
    });
    const assertion = expect(pending).rejects.toThrow(`timed out after ${APPEARANCE_HISTORY_TIMEOUT_MS} ms`);
    await vi.advanceTimersByTimeAsync(APPEARANCE_HISTORY_TIMEOUT_MS);
    await assertion;
  });
});

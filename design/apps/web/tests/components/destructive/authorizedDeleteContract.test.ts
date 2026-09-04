import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  canonicalDeletePayload,
  confirmedDelete,
  confirmedDeleteWithResult,
  createDeleteRequestSnapshot,
  deleteRequestIdentity,
  serializeDeletePayload,
} from '../../../src/lib/confirm-delete';

const summary = {
  kind: 'project' as const,
  id: 'p1',
  label: 'Alpha',
  items: ['Alpha files'],
  reversible: false as const,
};

function confirmingFetch() {
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    if (url.endsWith('/confirm-delete')) {
      return new Response(JSON.stringify({
        token: 'token-1',
        expiresAt: Date.now() + 120_000,
        expiresInMs: 120_000,
        summary,
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(null, { status: 204 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('authorized destructive request identity', () => {
  it('canonicalizes object keys so equivalent payloads share an identity', async () => {
    expect(canonicalDeletePayload({ b: 2, a: 1 })).toBe(canonicalDeletePayload({ a: 1, b: 2 }));
    await expect(deleteRequestIdentity('/api/projects/p1', { b: 2, a: 1 })).resolves.toBe(
      await deleteRequestIdentity('/api/projects/p1', { a: 1, b: 2 }),
    );
  });

  it('accepts only plain JSON data and rejects executable or ambiguous values', () => {
    class CustomPayload { value = 1; }
    const getter = {} as { value: number };
    Object.defineProperty(getter, 'value', { enumerable: true, get: () => 1 });
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    for (const value of [new Date(), new CustomPayload(), getter, cycle, 1n, Number.NaN, Number.POSITIVE_INFINITY, { missing: undefined }]) {
      expect(() => serializeDeletePayload(value)).toThrow();
    }
    expect(serializeDeletePayload({ text: '安全', count: 2 })).toMatchObject({ text: '{"count":2,"text":"安全"}' });
  });

  it('refuses a request when the displayed preflight identity no longer matches', async () => {
    const fetchMock = confirmingFetch();
    const identity = await deleteRequestIdentity('/api/projects/p1', { path: 'drafts' });
    await expect(confirmedDelete('/api/projects/p1', { path: 'final' }, {
      expectedRequestIdentity: identity,
    })).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a request when the daemon summary changes after preflight', async () => {
    const fetchMock = confirmingFetch();
    await expect(confirmedDelete('/api/projects/p1', undefined, {
      expectedSummary: { ...summary, items: ['A different captured set'] },
    })).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps a successful DELETE successful when optional result handling throws', async () => {
    const fetchMock = confirmingFetch();
    const result = await confirmedDelete('/api/projects/p1', undefined, {
      onSuccess: () => { throw new Error('receipt rendering failed'); },
    });
    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reports an onSuccess failure separately without issuing a second DELETE', async () => {
    const fetchMock = confirmingFetch();
    const onReceiptWarning = vi.fn();
    await expect(confirmedDelete('/api/projects/p1', undefined, {
      throwOnFailure: true,
      onSuccess: () => { throw new Error('receipt rendering failed'); },
      onReceiptWarning,
    })).resolves.toBe(true);
    expect(onReceiptWarning).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'success-callback',
      message: 'receipt rendering failed',
    }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps the result successful and carries a receipt warning with throwOnFailure', async () => {
    const fetchMock = confirmingFetch();
    const result = await confirmedDeleteWithResult('/api/projects/p1', undefined, {
      throwOnFailure: true,
      onSuccess: () => { throw new Error('receipt rendering failed'); },
    });
    expect(result.ok).toBe(true);
    expect(result.warning).toMatchObject({ phase: 'success-callback', message: 'receipt rendering failed' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reuses one immutable payload body for preflight and DELETE', async () => {
    const fetchMock = confirmingFetch();
    const snapshot = await createDeleteRequestSnapshot('/api/projects/p1', { text: '安全', count: 2 });
    await expect(confirmedDelete('/api/projects/p1', undefined, {
      requestSnapshot: snapshot,
      expectedRequestIdentity: snapshot.requestIdentity,
      expectedSummary: summary,
    })).resolves.toBe(true);
    const preflightBody = fetchMock.mock.calls[0]?.[1]?.body;
    const deleteBody = fetchMock.mock.calls[1]?.[1]?.body;
    expect(Array.from(preflightBody as Uint8Array)).toEqual(Array.from(deleteBody as Uint8Array));
  });

  it('binds a non-secret authenticated context without putting it in the hash', async () => {
    const snapshot = await createDeleteRequestSnapshot('/api/projects/p1', { path: 'drafts' }, 'workspace-a');
    const samePayloadDifferentContext = await createDeleteRequestSnapshot('/api/projects/p1', { path: 'drafts' }, 'workspace-b');
    expect(snapshot.requestIdentity).toBe(samePayloadDifferentContext.requestIdentity);
    expect(snapshot.authenticatedContextIdentity).toBe('workspace-a');
  });
});

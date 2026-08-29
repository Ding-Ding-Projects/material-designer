import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  canonicalDeletePayload,
  confirmedDelete,
  deleteRequestIdentity,
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
});

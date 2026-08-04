// The client half of the daemon's destructive-delete handshake.
//
// Most gated resources are named entirely by their URL, so the mint is a bare
// POST and there is nothing for the two legs to disagree about.
// `DELETE /api/projects/:id/folders` is the exception: the folder travels in
// the request body, and the daemon binds the token to the (project, folder)
// pair so a grant for `drafts/` cannot remove `final/`.
//
// That makes one thing load-bearing that is invisible in the types — **the
// mint and the DELETE must carry the same body**. Re-deriving it on the second
// leg, or forgetting it there, produces a token bound to one folder spent at
// another: a `resource-mismatch` 428 for every correct caller, on a path no
// unit test would otherwise look at.

import { afterEach, describe, expect, it, vi } from 'vitest';

import { confirmedDelete, requestDeleteConfirmation } from '../../src/lib/confirm-delete';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

interface Call {
  url: string;
  method: string;
  body: string | undefined;
  token: string | undefined;
}

/** A daemon that mints one token and accepts the DELETE, recording both legs. */
function stubConfirmingDaemon(deleteStatus = 200) {
  const calls: Call[] = [];
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({
      url,
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? init.body : undefined,
      token: headers['x-od-confirm-token'],
    });
    if (url.endsWith('/confirm-delete')) {
      return new Response(
        JSON.stringify({
          token: 'tok-1',
          expiresAt: Date.now() + 120_000,
          expiresInMs: 120_000,
          summary: {
            kind: 'project-folder',
            id: 'p1drafts',
            label: 'drafts',
            items: ['The folder "drafts" and everything beneath it'],
            reversible: false,
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    return new Response(null, { status: deleteStatus });
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

describe('confirmedDelete', () => {
  it('sends the same payload to the mint and to the DELETE', async () => {
    const calls = stubConfirmingDaemon();

    await expect(
      confirmedDelete('/api/projects/p1/folders', { path: 'drafts' }),
    ).resolves.toBe(true);

    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({
      url: '/api/projects/p1/folders/confirm-delete',
      method: 'POST',
      body: JSON.stringify({ path: 'drafts' }),
    });
    expect(calls[1]).toMatchObject({
      url: '/api/projects/p1/folders',
      method: 'DELETE',
      body: JSON.stringify({ path: 'drafts' }),
    });
    // The token rides in a header, never the URL — a URL-borne token lands in
    // every access and proxy log on the way.
    expect(calls[1]?.token).toBe('tok-1');
    expect(calls[1]?.url).not.toContain('tok-1');
  });

  it('leaves a URL-addressed resource bodyless on both legs, as it was', async () => {
    const calls = stubConfirmingDaemon();

    await expect(confirmedDelete('/api/projects/p1')).resolves.toBe(true);

    expect(calls[0]?.body).toBeUndefined();
    expect(calls[1]?.body).toBeUndefined();
    expect(calls[1]?.token).toBe('tok-1');
  });

  it('reports failure without attempting the delete when no token is issued', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(null, { status: 428 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      confirmedDelete('/api/projects/p1/folders', { path: 'drafts' }),
    ).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // The gate treats `false` as a failure and holds itself open, which is the
  // correct outcome for a refused DELETE: the record is still there.
  it('reports failure when the DELETE itself is refused', async () => {
    stubConfirmingDaemon(500);

    await expect(
      confirmedDelete('/api/projects/p1/folders', { path: 'drafts' }),
    ).resolves.toBe(false);
  });
});

describe('requestDeleteConfirmation', () => {
  it('returns the daemon\'s own account of the blast radius', async () => {
    stubConfirmingDaemon();

    const confirmation = await requestDeleteConfirmation('/api/projects/p1/folders', {
      path: 'drafts',
    });

    // The interface renders this rather than its own guess at the scope, so a
    // dropped summary would be a gate naming something it is not deleting.
    expect(confirmation?.summary.label).toBe('drafts');
    expect(confirmation?.summary.reversible).toBe(false);
  });
});

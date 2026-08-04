// Test-side driver for the daemon's destructive-delete confirmation handshake.
//
// `DELETE /api/projects/:id`, `/api/brands/:id` and `/api/library/assets/:id`
// are refused without a single-use token minted for that exact resource — see
// `src/http/confirm-delete.ts`. Suites that delete one of those as *cleanup*
// (rather than as the thing under test) need the two-step exchange, and this
// is it, in one place, so a future change to the header or the mint path does
// not have to be chased through half a dozen `afterAll` blocks.
//
// Suites that are testing the gate itself must NOT use this — they should
// drive the two legs explicitly so the assertion is on the real exchange.
// `tests/confirm-delete.test.ts` does exactly that.

import { CONFIRM_DELETE_HEADER } from '@open-design/contracts';

/**
 * Mint a confirmation for `resourceUrl` and spend it on the DELETE.
 *
 * Resolves the DELETE's `Response`, or `null` when the mint leg failed (a 404
 * for an already-absent record, most often). Never throws, so it is safe in an
 * `afterAll` that must not mask the real test failure.
 */
export async function confirmedDeleteFetch(
  resourceUrl: string,
  /** Extra headers both legs need — e.g. an `authorization` bearer. */
  headers: Record<string, string> = {},
): Promise<Response | null> {
  try {
    const mint = await fetch(`${resourceUrl}/confirm-delete`, { method: 'POST', headers });
    if (!mint.ok) return null;
    const body = (await mint.json()) as { token?: unknown };
    if (typeof body.token !== 'string' || body.token.length === 0) return null;
    return await fetch(resourceUrl, {
      method: 'DELETE',
      headers: { ...headers, [CONFIRM_DELETE_HEADER]: body.token },
    });
  } catch {
    return null;
  }
}

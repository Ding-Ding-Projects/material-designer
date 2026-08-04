// Client half of the daemon's destructive-delete confirmation.
//
// The daemon now refuses `DELETE /api/projects/:id`, `/api/brands/:id` and
// `/api/library/assets/:id` unless the request carries a single-use token
// minted for that exact resource — see `apps/daemon/src/http/confirm-delete.ts`
// and `docs/standards/super-confirmation.md`. That refusal is an authorization
// boundary in the handler; the two-key-plus-slider `DestructiveGate` remains
// the user-facing half, unchanged.
//
// Every web delete of a gated resource therefore becomes a two-step exchange,
// and it lives here rather than being copy-pasted into three call sites, so the
// header name and the failure semantics cannot drift between them.
//
// **The token is never put in a URL and never logged.** It goes in a header for
// the reason the contract file gives: request and proxy logs record method and
// path, so a URL-borne token is a token written to disk by machinery nobody
// configured.

import {
  CONFIRM_DELETE_HEADER,
  confirmDeleteUrlFor,
  type ConfirmDeleteResponse,
} from '@open-design/contracts';

/**
 * Ask the daemon for a confirmation token bound to one resource.
 *
 * Returns the daemon's own account of what the delete will destroy alongside
 * the token. The standard requires the scope to be "computed from the same
 * captured set the operation will act on", and the handler is the only place
 * that knows it, so this is the authoritative summary — not the interface's
 * guess at one.
 */
export async function requestDeleteConfirmation(
  resourcePath: string,
): Promise<ConfirmDeleteResponse | null> {
  try {
    const resp = await fetch(confirmDeleteUrlFor(resourcePath), { method: 'POST' });
    if (!resp.ok) return null;
    const body = (await resp.json()) as ConfirmDeleteResponse;
    if (typeof body?.token !== 'string' || body.token.length === 0) return null;
    return body;
  } catch {
    return null;
  }
}

/**
 * Mint a confirmation and immediately spend it on the DELETE.
 *
 * Minting at confirm time rather than when the gate opens is deliberate: the
 * token's lifetime is short, and a user can sit on an open gate for far longer
 * than that. Obtaining it at the moment of authorization means a slow reader
 * never meets an expired token, and the window in which a live token exists is
 * the width of one round trip.
 *
 * Resolves `false` on every failure — a refused mint, a refused DELETE, or a
 * transport error. The gate's `onConfirm` contract treats `false` as a failure
 * and holds itself open, which is the correct outcome for all three: the record
 * is still there.
 */
export async function confirmedDelete(resourcePath: string): Promise<boolean> {
  const confirmation = await requestDeleteConfirmation(resourcePath);
  if (!confirmation) return false;
  try {
    const resp = await fetch(resourcePath, {
      method: 'DELETE',
      headers: { [CONFIRM_DELETE_HEADER]: confirmation.token },
    });
    return resp.ok;
  } catch {
    return false;
  }
}

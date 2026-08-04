// The authorization half of the destructive-delete gate.
//
// `docs/standards/super-confirmation.md`, security considerations:
//
//   "A safety control that is not enforced at the operation is not a safety
//    control. […] This is an authorization boundary, and boundaries are
//    enforced in the handler, never in the interface."
//
// Before this module there were two gates and no boundary. The web app put a
// two-key-plus-slider `DestructiveGate` in front of a delete button; the `od`
// CLI refused the same verb without `--confirm`. Both are real, and both are
// properties of a *surface* — so `curl -X DELETE /api/projects/p1` satisfied
// neither and succeeded anyway, as did every third-party client, every script,
// and (already, today) `RecentProjectsStrip.tsx`, which reaches the same
// `deleteProject()` through a plain one-button dialog.
//
// The fix is a confirmation the caller has to *obtain*:
//
//   POST /api/projects/:id/confirm-delete   -> { token, expiresAt, summary }
//   DELETE /api/projects/:id
//     x-od-confirm-token: <token>
//
// and it is deliberately not a `?confirm=true` flag. A constant is not a
// boundary: anything with enough reach to call the route has enough reach to
// set it, so it would refuse exactly the callers who are already careful and
// stop none of the ones who are not. The token is unguessable, bound to one
// resource, single-use and short-lived, which are the four properties the
// standard's own wording asks for — "Completing the slider authorizes one
// execution of one captured set. It does not authorize a retry, a second
// identical action, or the same action after the selection changed."
//
// It does NOT replace either interface gate. The slider still makes a human
// prove intent, the `--confirm` flag still refuses before any HTTP request is
// made. Those remain the user-facing half; this is the half that holds when
// the caller is not a user.
//
// **The token never enters a log.** It travels in a header, so the method-and-
// URL line that every access log, proxy, browser history and shell history
// records does not contain it. Nothing in this module logs, and the one place
// it is written to a response body is the mint route's own JSON.

import { randomBytes } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import {
  CONFIRM_DELETE_HEADER,
  CONFIRM_DELETE_TTL_MS,
  confirmDeleteUrlFor,
  type ConfirmDeleteResponse,
  type ConfirmationRefusalReason,
  type ConfirmationRequiredDetails,
  type DestructiveDeleteSummary,
  type DestructiveResourceKind,
} from '@open-design/contracts';
import { sendApiError } from './api-errors.js';

/**
 * How many live tokens the store will hold. Reaching this means something is
 * minting tokens it never spends; the oldest are dropped rather than letting
 * an unbounded map grow inside a long-lived daemon. Two minutes of a human
 * opening delete dialogs does not come close.
 */
const MAX_LIVE_TOKENS = 256;

interface IssuedToken {
  kind: DestructiveResourceKind;
  id: string;
  expiresAt: number;
}

export interface IssuedConfirmation {
  token: string;
  expiresAt: number;
}

export type ConfirmationCheck =
  | { ok: true }
  | { ok: false; reason: ConfirmationRefusalReason };

export interface ConfirmDeleteStore {
  issue: (kind: DestructiveResourceKind, id: string, now?: number) => IssuedConfirmation;
  /**
   * Spend a token against the resource it must be bound to. A successful check
   * removes it, so the same token can never authorize a second delete.
   */
  consume: (
    kind: DestructiveResourceKind,
    id: string,
    token: string | undefined,
    now?: number,
  ) => ConfirmationCheck;
  /** Live (unexpired, unspent) token count. Exposed for tests and diagnostics. */
  size: () => number;
}

/**
 * Tokens live in memory only, and that is the correct storage.
 *
 * Persisting them would mean a token minted before a daemon restart still
 * authorizes a delete after it — an authorization outliving the session that
 * granted it, which is the opposite of what a short-lived single-use grant is
 * for. A restart invalidating every outstanding confirmation is the safe
 * failure: the caller mints another one, and the cost of being wrong is a
 * second HTTP request rather than an unintended deletion.
 */
export function createConfirmDeleteStore(): ConfirmDeleteStore {
  const live = new Map<string, IssuedToken>();

  function sweep(now: number): void {
    for (const [token, entry] of live) {
      if (entry.expiresAt <= now) live.delete(token);
    }
    // Map iterates in insertion order and the TTL is constant, so the first
    // surviving entries are the oldest.
    for (const oldest of live.keys()) {
      if (live.size <= MAX_LIVE_TOKENS) break;
      live.delete(oldest);
    }
  }

  return {
    issue(kind, id, now = Date.now()) {
      sweep(now);
      // 256 bits from the CSPRNG. Guessing is not a threat model this has to
      // reason about further, which is also why `consume` does a plain map
      // lookup rather than a constant-time scan: there is no timing signal
      // worth extracting from a value with this much entropy, and a linear
      // constant-time search would be security theatre with a real cost.
      const token = randomBytes(32).toString('base64url');
      const expiresAt = now + CONFIRM_DELETE_TTL_MS;
      live.set(token, { kind, id, expiresAt });
      return { token, expiresAt };
    },

    consume(kind, id, token, now = Date.now()) {
      if (typeof token !== 'string' || token.length === 0) {
        return { ok: false, reason: 'missing' };
      }
      const entry = live.get(token);
      // Covers "never issued" and "already spent" with one answer on purpose:
      // telling a caller which of the two it was would confirm that a token
      // it does not hold once existed.
      if (!entry) return { ok: false, reason: 'unknown' };
      if (entry.expiresAt <= now) {
        live.delete(token);
        return { ok: false, reason: 'expired' };
      }
      if (entry.kind !== kind || entry.id !== id) {
        // Left in the store deliberately. The token is still valid for the
        // resource it was minted for, and the caller who legitimately holds it
        // should not lose it because someone sent it at the wrong URL.
        return { ok: false, reason: 'resource-mismatch' };
      }
      live.delete(token);
      return { ok: true };
    },

    size() {
      return live.size;
    },
  };
}

/**
 * The daemon's store. Routes and their middleware must share one, and the
 * daemon is a single process with a single route table, so a module-level
 * instance is the whole of the plumbing. Tests build their own through
 * `createConfirmDeleteStore()` and pass it in rather than reaching for a reset
 * backdoor.
 */
export const confirmDeleteStore: ConfirmDeleteStore = createConfirmDeleteStore();

function refusalMessage(
  reason: ConfirmationRefusalReason,
  kind: DestructiveResourceKind,
  id: string,
  confirmUrl: string,
): string {
  const what = `${kind} "${id}"`;
  switch (reason) {
    case 'missing':
      return `deleting ${what} is irreversible and requires a confirmation token; POST ${confirmUrl} to obtain one and send it as ${CONFIRM_DELETE_HEADER}`;
    case 'unknown':
      return `the confirmation token was never issued or has already been used; POST ${confirmUrl} for a fresh one`;
    case 'expired':
      return `the confirmation token has expired; POST ${confirmUrl} for a fresh one`;
    case 'resource-mismatch':
      return `the confirmation token was issued for a different resource, not ${what}; POST ${confirmUrl} for one bound to it`;
    default:
      return `deleting ${what} requires a confirmation token; POST ${confirmUrl} to obtain one`;
  }
}

export interface RequireDeleteConfirmationOptions {
  kind: DestructiveResourceKind;
  /** Pull the resource id out of the request — usually `req.params.id`. */
  resourceId: (req: Request) => string;
  /**
   * The resource's own API path, without a trailing slash — e.g.
   * `/api/projects/p1`. `confirm-delete` is appended to build the mint URL the
   * refusal points at, so the client never has to guess or hardcode it.
   */
  resourcePath: (req: Request, id: string) => string;
  store?: ConfirmDeleteStore;
  now?: () => number;
}

/**
 * Express middleware that refuses a destructive request that carries no valid
 * confirmation.
 *
 * Fail-closed by construction: every path through it either calls `next()`
 * after a token was successfully spent, or sends a 428. There is no branch
 * that falls through to the handler on an unrecognized state, and a throw
 * inside it reaches Express's error handler rather than the delete.
 */
// The return type deliberately mirrors `requireLocalDaemonRequest` in
// `local-daemon-request.ts` — a plain `(req, res, next)` function rather than
// Express's generic `RequestHandler` — so it composes with `:id` routes under
// `strictFunctionTypes` exactly the way the existing middleware already does.
export function requireDeleteConfirmation(
  options: RequireDeleteConfirmationOptions,
): (req: Request, res: Response, next: NextFunction) => void {
  const store = options.store ?? confirmDeleteStore;
  const now = options.now ?? (() => Date.now());

  return function confirmDeleteGuard(req: Request, res: Response, next: NextFunction) {
    const id = options.resourceId(req);
    const header = req.get(CONFIRM_DELETE_HEADER);
    const result = store.consume(options.kind, id, header, now());
    if (result.ok) {
      next();
      return;
    }

    const confirmUrl = confirmDeleteUrlFor(options.resourcePath(req, id));
    const details: ConfirmationRequiredDetails = {
      kind: 'confirmation-required',
      resource: { kind: options.kind, id },
      reason: result.reason,
      confirmUrl,
      header: CONFIRM_DELETE_HEADER,
    };
    // 428 Precondition Required (RFC 6585), not 409. 409 means the request
    // conflicts with the resource's current state, and these routes already
    // use it for exactly that (a rename that could not be written through, an
    // EEXIST on a file write) — reusing it here would make two different
    // failures indistinguishable on the same endpoint. 428's own definition is
    // "the origin server requires the request to be conditional", which is
    // precisely this: the request is well-formed and permitted, and is missing
    // a precondition the caller must go and obtain.
    sendApiError(
      res,
      428,
      'CONFIRMATION_REQUIRED',
      refusalMessage(result.reason, options.kind, id, confirmUrl),
      { details },
    );
  };
}

/**
 * Mint a token and build the mint route's response body.
 *
 * The summary is computed here, in the handler, from the same record the
 * delete will act on. The standard requires the gate to "name the real scope"
 * and to compute it "from the same captured set the operation will act on —
 * not recomputed afterwards, or the preview and the execution can diverge".
 * The interface therefore renders the daemon's account of the blast radius
 * instead of its own guess at it.
 */
export function issueDeleteConfirmation(
  summary: DestructiveDeleteSummary,
  options: { store?: ConfirmDeleteStore; now?: () => number } = {},
): ConfirmDeleteResponse {
  const store = options.store ?? confirmDeleteStore;
  const at = (options.now ?? (() => Date.now()))();
  const issued = store.issue(summary.kind, summary.id, at);
  return {
    token: issued.token,
    expiresAt: issued.expiresAt,
    expiresInMs: issued.expiresAt - at,
    summary,
  };
}

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

export type ConfirmedDeletePhase = 'confirm' | 'delete' | 'success-callback';

/**
 * Opt-in detailed failure for callers that must preserve daemon authorization
 * errors. Existing callers keep the original `false`-on-failure contract.
 */
export class ConfirmedDeleteError extends Error {
  constructor(
    readonly phase: ConfirmedDeletePhase,
    readonly response?: Response,
    readonly requestCause?: unknown,
  ) {
    super(
      response
        ? `${phase} request failed with status ${response.status}`
        : `${phase} request failed`,
    );
    this.name = 'ConfirmedDeleteError';
  }
}

export interface ConfirmedDeleteOptions {
  /** Identity/authorization headers that must accompany both handshake legs. */
  headers?: HeadersInit;
  /** Throw a phase-aware error instead of resolving `false` on failure. */
  throwOnFailure?: boolean;
  /** Inspect a successful response without changing the boolean contract. */
  onSuccess?: (response: Response) => void | Promise<void>;
  /** Expected request identity from the immutable preflight summary. */
  expectedRequestIdentity?: string;
  /** Expected handler summary from the immutable preflight. */
  expectedSummary?: ConfirmDeleteResponse['summary'];
}

interface DeleteConfirmationAttempt {
  confirmation: ConfirmDeleteResponse | null;
  response: Response;
}

/** Stable JSON for request identity checks. Object keys are sorted recursively. */
export function canonicalDeletePayload(value: unknown): string {
  if (value === undefined) return '';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalDeletePayload).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalDeletePayload(record[key])}`).join(',')}}`;
}

/** SHA-256 identity for the exact resource path and canonical request body. */
export async function deleteRequestIdentity(resourcePath: string, payload: unknown): Promise<string> {
  const input = `${resourcePath}\u0000${canonicalDeletePayload(payload)}`;
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto is unavailable for destructive request identity.');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function sameSummary(a: ConfirmDeleteResponse['summary'], b: ConfirmDeleteResponse['summary']): boolean {
  return Boolean(a && b && Array.isArray(a.items) && Array.isArray(b.items))
    && a.kind === b.kind && a.id === b.id && a.label === b.label && a.reversible === b.reversible
    && a.items.length === b.items.length && a.items.every((item, index) => item === b.items[index]);
}

function requestHeaders(
  headers: HeadersInit | undefined,
  payload: unknown,
): Headers | undefined {
  const merged = new Headers(headers);
  // A stale/caller-supplied confirmation value belongs to neither leg. The
  // mint never needs one, and the DELETE receives the freshly minted value
  // below after every other caller header has been copied.
  merged.delete(CONFIRM_DELETE_HEADER);
  if (payload !== undefined) merged.set('Content-Type', 'application/json');
  let hasHeaders = false;
  merged.forEach(() => { hasHeaders = true; });
  return hasHeaders ? merged : undefined;
}

async function requestDeleteConfirmationAttempt(
  resourcePath: string,
  payload: unknown,
  headers?: HeadersInit,
): Promise<DeleteConfirmationAttempt> {
  const mergedHeaders = requestHeaders(headers, payload);
  const resp = await fetch(confirmDeleteUrlFor(resourcePath), {
    method: 'POST',
    ...(mergedHeaders ? { headers: mergedHeaders } : {}),
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
  if (!resp.ok) return { confirmation: null, response: resp };
  // Parse a clone so an opt-in caller can still inspect an invalid successful
  // envelope through ConfirmedDeleteError.response without meeting a consumed
  // body stream.
  const body = (await resp.clone().json()) as ConfirmDeleteResponse;
  if (typeof body?.token !== 'string' || body.token.length === 0) {
    return { confirmation: null, response: resp };
  }
  return { confirmation: body, response: resp };
}

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
  payload?: unknown,
  headers?: HeadersInit,
): Promise<ConfirmDeleteResponse | null> {
  try {
    const attempt = await requestDeleteConfirmationAttempt(resourcePath, payload, headers);
    return attempt.confirmation;
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
export async function confirmedDelete(
  resourcePath: string,
  payload?: unknown,
  options: ConfirmedDeleteOptions = {},
): Promise<boolean> {
  if (options.expectedRequestIdentity !== undefined) {
    let actualIdentity: string;
    try {
      actualIdentity = await deleteRequestIdentity(resourcePath, payload);
    } catch (error) {
      if (options.throwOnFailure) throw new ConfirmedDeleteError('confirm', undefined, error);
      return false;
    }
    if (actualIdentity !== options.expectedRequestIdentity) {
      if (options.throwOnFailure) {
        throw new ConfirmedDeleteError('confirm', undefined, new Error('destructive request identity changed after preflight'));
      }
      return false;
    }
  }
  // The same value goes to both legs, deliberately: the daemon binds the token
  // to what the mint was told, and re-deriving the body for the DELETE is how
  // the two come to name different folders and every correct caller gets a 428.
  let attempt: DeleteConfirmationAttempt;
  try {
    attempt = await requestDeleteConfirmationAttempt(
      resourcePath,
      payload,
      options.headers,
    );
  } catch (error) {
    if (options.throwOnFailure) throw new ConfirmedDeleteError('confirm', undefined, error);
    return false;
  }
  if (!attempt.confirmation) {
    if (options.throwOnFailure) {
      throw new ConfirmedDeleteError('confirm', attempt.response);
    }
    return false;
  }
  if (options.expectedSummary && !sameSummary(attempt.confirmation.summary, options.expectedSummary)) {
    if (options.throwOnFailure) {
      throw new ConfirmedDeleteError('confirm', attempt.response, new Error('destructive preflight summary changed'));
    }
    return false;
  }
  try {
    const headers = requestHeaders(options.headers, payload) ?? new Headers();
    // Set this after caller headers so no caller-supplied value can replace the
    // freshly minted, single-use token.
    headers.set(CONFIRM_DELETE_HEADER, attempt.confirmation.token);
    const resp = await fetch(resourcePath, {
      method: 'DELETE',
      headers,
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    });
    if (!resp.ok && options.throwOnFailure) {
      throw new ConfirmedDeleteError('delete', resp);
    }
    if (resp.ok) {
      try {
        await options.onSuccess?.(resp.clone());
      } catch (error) {
        // The DELETE already succeeded. Keep that fact separate from optional
        // result handling so a reporting callback cannot turn success into a
        // false retry signal or cause a duplicate destructive request.
        if (options.throwOnFailure) throw new ConfirmedDeleteError('success-callback', resp, error);
      }
    }
    return resp.ok;
  } catch (error) {
    if (error instanceof ConfirmedDeleteError) throw error;
    if (options.throwOnFailure) throw new ConfirmedDeleteError('delete', undefined, error);
    return false;
  }
}

import { randomBytes } from "node:crypto";
import { snapshotDestination, sameDestinationSnapshot } from "./host.js";
import type { DestinationSnapshot, OverwriteChallenge, OverwriteRequest } from "./types.js";

const DEFAULT_TTL_MS = 60_000;
const MAX_PENDING_AUTHORIZATIONS = 128;

type PendingAuthorization = {
  request: OverwriteRequest;
  destination: DestinationSnapshot;
  expiresAtMs: number;
};

function sameRequest(a: OverwriteRequest, b: OverwriteRequest): boolean {
  return (
    a.sourcePath === b.sourcePath &&
    a.destinationPath === b.destinationPath &&
    a.adapterId === b.adapterId &&
    a.targetFormat === b.targetFormat
  );
}

function assertRequest(request: OverwriteRequest): void {
  for (const value of [request.sourcePath, request.destinationPath, request.adapterId, request.targetFormat]) {
    if (typeof value !== "string" || value.length === 0) throw new Error("The overwrite request is incomplete.");
  }
}

/**
 * Host-only, in-memory authorization for one replacement of one exact file.
 * The token is never persisted and is consumed before the request is checked,
 * so a token cannot be replayed or retargeted after a failed attempt.
 */
export class OverwriteAuthorizationStore {
  readonly #now: () => number;
  readonly #ttlMs: number;
  readonly #pending = new Map<string, PendingAuthorization>();

  constructor(options: { now?: () => number; ttlMs?: number } = {}) {
    this.#now = options.now ?? Date.now;
    this.#ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    if (!Number.isSafeInteger(this.#ttlMs) || this.#ttlMs < 1_000 || this.#ttlMs > 10 * 60_000) {
      throw new Error("The overwrite authorization lifetime is outside its safety bound.");
    }
  }

  #pruneExpired(): void {
    const now = this.#now();
    for (const [expiredToken, pending] of this.#pending) if (pending.expiresAtMs <= now) this.#pending.delete(expiredToken);
  }

  async issue(request: OverwriteRequest): Promise<OverwriteChallenge> {
    assertRequest(request);
    this.#pruneExpired();
    if (this.#pending.size >= MAX_PENDING_AUTHORIZATIONS) throw new Error("Too many pending overwrite authorizations; finish or cancel an existing confirmation first.");
    const destination = await snapshotDestination(request.destinationPath);
    if (!destination.exists) throw new Error("The destination does not exist, so overwrite confirmation is not required.");
    const token = randomBytes(32).toString("base64url");
    const expiresAtMs = this.#now() + this.#ttlMs;
    this.#pending.set(token, { request: { ...request }, destination, expiresAtMs });
    return { token, expiresAtMs, destination };
  }

  async consume(token: string, request: OverwriteRequest): Promise<{ expectedDestination: DestinationSnapshot }> {
    if (typeof token !== "string" || token.length === 0) throw new Error("The overwrite authorization token is missing.");
    assertRequest(request);
    const pending = this.#pending.get(token);
    // Delete before any await or validation. The one-use property must also
    // hold when the caller submits the wrong action or a changed destination.
    this.#pending.delete(token);
    if (!pending) throw new Error("The overwrite authorization is unknown or already used.");
    if (pending.expiresAtMs <= this.#now()) throw new Error("The overwrite authorization has expired.");
    if (!sameRequest(pending.request, request)) throw new Error("The overwrite authorization is bound to a different conversion action.");
    const current = await snapshotDestination(request.destinationPath);
    if (!sameDestinationSnapshot(current, pending.destination)) throw new Error("The destination changed after confirmation; overwrite was refused.");
    return { expectedDestination: pending.destination };
  }

  clear(): void {
    this.#pending.clear();
  }
}

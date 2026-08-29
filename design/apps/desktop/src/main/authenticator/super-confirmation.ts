import { randomUUID } from 'node:crypto';

const TOKEN_TTL_MS = 60_000;
const MAX_TOKENS = 64;
const MAX_SCOPE_LENGTH = 256;

type PendingToken = {
  action: string;
  ids: string;
  expiresAtMs: number;
};

/** Host-owned, one-use scope verifier for destructive and sensitive actions. */
export class SuperConfirmationVerifier {
  readonly #tokens = new Map<string, PendingToken>();

  issue(action: string, ids: readonly string[], nowMs = Date.now()): string {
    if (
      !action ||
      action.length > MAX_SCOPE_LENGTH ||
      ids.length > 1_000 ||
      ids.some((id) => typeof id !== 'string' || id.length > MAX_SCOPE_LENGTH)
    ) throw new Error('Confirmation scope is invalid.');
    if (!Number.isSafeInteger(nowMs) || nowMs < 0) throw new Error('Confirmation time is invalid.');
    this.#purge(nowMs);
    if (this.#tokens.size >= MAX_TOKENS) throw new Error('Too many pending confirmations.');
    const token = randomUUID();
    this.#tokens.set(token, { action, ids: JSON.stringify([...ids]), expiresAtMs: nowMs + TOKEN_TTL_MS });
    return token;
  }

  consume(token: string, action: string, ids: readonly string[], nowMs = Date.now()): boolean {
    if (!Number.isSafeInteger(nowMs) || nowMs < 0) return false;
    const pending = this.#tokens.get(token);
    this.#tokens.delete(token);
    if (!pending || nowMs > pending.expiresAtMs) return false;
    return pending.action === action && pending.ids === JSON.stringify([...ids]);
  }

  #purge(nowMs: number): void {
    for (const [token, pending] of this.#tokens) {
      if (pending.expiresAtMs < nowMs) this.#tokens.delete(token);
    }
  }
}

import { randomUUID } from "node:crypto";

const TOKEN_TTL_MS = 60_000;
const MAX_TOKENS = 64;

type PendingToken = { action: string; ids: string; expiresAtMs: number; used: boolean };

/** Host-owned one-use token verifier for the real two-key slider surface. */
export class SuperConfirmationVerifier {
  readonly #tokens = new Map<string, PendingToken>();
  issue(action: string, ids: readonly string[], nowMs = Date.now()): string {
    if (!action || action.length > 256 || ids.length > 1000 || ids.some((id) => typeof id !== "string" || id.length > 256)) throw new Error("Confirmation scope is invalid.");
    if (this.#tokens.size >= MAX_TOKENS) this.#purge(nowMs);
    if (this.#tokens.size >= MAX_TOKENS) throw new Error("Too many pending confirmations.");
    const token = randomUUID(); this.#tokens.set(token, { action, ids: JSON.stringify([...ids]), expiresAtMs: nowMs + TOKEN_TTL_MS, used: false }); return token;
  }
  consume(token: string, action: string, ids: readonly string[], nowMs = Date.now()): boolean {
    const pending = this.#tokens.get(token); this.#tokens.delete(token);
    if (!pending || pending.used || nowMs > pending.expiresAtMs || pending.action !== action || pending.ids !== JSON.stringify([...ids])) return false;
    pending.used = true; return true;
  }
  #purge(nowMs: number): void { for (const [token, pending] of this.#tokens) if (pending.used || pending.expiresAtMs < nowMs) this.#tokens.delete(token); }
}

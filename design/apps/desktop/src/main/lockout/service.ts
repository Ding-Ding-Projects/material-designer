import { randomInt, randomUUID } from "node:crypto";
import type { LadderChallenge, LadderResult, LadderStage, LadderState } from "./protocol.js";

const WINDOW_MS = 60 * 60 * 1000;
const CHALLENGE_TTL_MS = 60 * 1000;
const MOLE_ROUND_MS = 5_000;
const MOLE_COUNT = 8;
const SUM_COUNT = 10;
const MAX_LADDER_USES = 3;
const MAX_PINNED_ANSWER_LENGTH = 128;

type ChallengeRecord = { challenge: LadderChallenge; answer: unknown; used: boolean };
type BudgetRecord = { windowStartedAtMs: number; uses: number };
type LockoutRecord = { state: LadderState; schoolMode: boolean; wrongDishes: number; challenge: ChallengeRecord | null; budgetKey: string };

export interface LadderClock { now(): number; }
export interface LadderRandom { uuid(): string; integer(maxExclusive: number): number; }

const systemClock: LadderClock = Object.freeze({ now: () => Date.now() });
const systemRandom: LadderRandom = Object.freeze({ uuid: randomUUID, integer: (maxExclusive) => randomInt(maxExclusive) });

function cloneState(state: LadderState): LadderState { return { ...state }; }
function validNow(now: number): boolean { return Number.isSafeInteger(now) && now >= 0; }
function nextStage(stage: LadderStage): LadderStage { return stage === "dish" ? "sums" : stage === "sums" ? "mole" : "clock"; }

/**
 * Host-owned unlock ladder. It only clears a wait. It never verifies a credential,
 * issues a session, changes the attempt budget, or emits a cookie.
 */
export class UnlockLadderHost {
  readonly #clock: LadderClock;
  readonly #random: LadderRandom;
  readonly #records = new Map<string, LockoutRecord>();
  readonly #nonceIndex = new Map<string, string>();
  readonly #budgets = new Map<string, BudgetRecord>();
  constructor(options: { clock?: LadderClock; random?: LadderRandom } = {}) { this.#clock = options.clock ?? systemClock; this.#random = options.random ?? systemRandom; }

  recordLockout(lockoutId: string, options: { waitingUntilMs: number; remainingAttempts: number; consecutiveLockouts: number; schoolMode?: boolean; budgetKey?: string }): LadderState {
    const now = this.#clock.now(); if (!lockoutId || !validNow(now) || !validNow(options.waitingUntilMs) || options.waitingUntilMs <= now || !Number.isSafeInteger(options.remainingAttempts) || options.remainingAttempts < 0 || !Number.isSafeInteger(options.consecutiveLockouts) || options.consecutiveLockouts < 1) throw new Error("Invalid lockout state.");
    const previous = this.#records.get(lockoutId); if (previous?.challenge) this.#nonceIndex.delete(previous.challenge.challenge.nonce);
    const budgetKey = options.budgetKey ?? lockoutId; const budget = this.#budgets.get(budgetKey) ?? { windowStartedAtMs: now, uses: 0 }; const state: LadderState = { stage: options.schoolMode ? "sums" : "dish", waitingUntilMs: options.waitingUntilMs, remainingAttempts: options.remainingAttempts, consecutiveLockouts: options.consecutiveLockouts, ladderUsesInWindow: budget.uses, windowStartedAtMs: budget.windowStartedAtMs };
    this.#budgets.set(budgetKey, budget); this.#records.set(lockoutId, { state, schoolMode: options.schoolMode ?? false, wrongDishes: 0, challenge: null, budgetKey }); return cloneState(state);
  }

  state(lockoutId: string): LadderState | null { const record = this.#records.get(lockoutId); return record ? cloneState(record.state) : null; }

  issue(lockoutId: string): LadderChallenge | LadderResult {
    const record = this.#records.get(lockoutId); if (!record) return { ok: false, code: "not-locked" };
    const now = this.#clock.now(); if (!validNow(now) || now >= record.state.waitingUntilMs) return { ok: false, code: "not-locked" };
    if (record.state.stage === "clock") return { ok: false, code: "clock-only" };
    const budget = this.#budgets.get(record.budgetKey) ?? { windowStartedAtMs: now, uses: 0 }; if (now - budget.windowStartedAtMs >= WINDOW_MS) { budget.windowStartedAtMs = now; budget.uses = 0; }
    record.state.windowStartedAtMs = budget.windowStartedAtMs; record.state.ladderUsesInWindow = budget.uses; this.#budgets.set(record.budgetKey, budget);
    if (budget.uses >= MAX_LADDER_USES) return { ok: false, code: "budget-exhausted" };
    if (record.challenge && !record.challenge.used && record.challenge.challenge.expiresAtMs > now) return record.challenge.challenge;
    if (record.challenge) this.#nonceIndex.delete(record.challenge.challenge.nonce); const challenge = this.#makeChallenge(record.state.stage, now); record.challenge = challenge; this.#nonceIndex.set(challenge.challenge.nonce, lockoutId); return challenge.challenge;
  }

  submit(lockoutId: string, nonce: string, answer: unknown): LadderResult {
    const record = this.#records.get(lockoutId); if (!record) return { ok: false, code: "not-locked" };
    const challengeRecord = record.challenge; const now = this.#clock.now();
    if (!challengeRecord || this.#nonceIndex.get(nonce) !== lockoutId || challengeRecord.challenge.nonce !== nonce) return { ok: false, code: "invalid-nonce" };
    if (challengeRecord.used) return { ok: false, code: "already-used" };
    challengeRecord.used = true; this.#nonceIndex.delete(nonce);
    if (now > challengeRecord.challenge.expiresAtMs) return { ok: false, code: "expired-nonce" };
    if (challengeRecord.challenge.stage === "mole" && now < (challengeRecord.challenge.startedAtMs ?? now) + MOLE_ROUND_MS) return { ok: false, code: "early-submit" };
    if (challengeRecord.challenge.stage === "mole" && !Array.isArray(answer)) return { ok: false, code: "incomplete-moles" };
    if (challengeRecord.challenge.stage === "mole" && Array.isArray(answer)) {
      const ids = answer.filter((value): value is { id: string } => typeof value === "object" && value !== null && typeof (value as { id?: unknown }).id === "string").map((value) => value.id);
      if (new Set(ids).size !== ids.length) return { ok: false, code: "duplicate-mole" };
    }
    const outcome = this.#grade(record, challengeRecord, answer, now);
    if (!outcome) {
      record.state.stage = challengeRecord.challenge.stage === "dish"
        ? (record.wrongDishes >= 5 ? "sums" : "dish")
        : nextStage(record.state.stage);
      record.challenge = null;
      return { ok: false, code: "wrong-answer" };
    }
    record.challenge = null; const budget = this.#budgets.get(record.budgetKey) ?? { windowStartedAtMs: now, uses: 0 }; budget.uses += 1; this.#budgets.set(record.budgetKey, budget); record.state.ladderUsesInWindow = budget.uses;
    if (record.state.stage === "dish") { record.wrongDishes = 0; record.state.stage = "clock"; record.state.waitingUntilMs = now; return { ok: true, clearedWait: true, state: cloneState(record.state) }; }
    if (record.state.stage === "sums") { record.state.stage = "clock"; record.state.waitingUntilMs = now; return { ok: true, clearedWait: true, state: cloneState(record.state) }; }
    if (record.state.stage === "mole") { record.state.stage = "clock"; record.state.waitingUntilMs = now; return { ok: true, clearedWait: true, state: cloneState(record.state) }; }
    return { ok: false, code: "clock-only" };
  }

  #makeChallenge(stage: Exclude<LadderStage, "clock">, now: number): ChallengeRecord {
    const nonce = this.#random.uuid(); const expiresAtMs = stage === "mole" ? now + MOLE_ROUND_MS + CHALLENGE_TTL_MS : now + CHALLENGE_TTL_MS;
    if (stage === "dish") { const correct = this.#random.integer(4); const choices = ["har-gow", "siu-mai", "cheung-fun", "char-siu-bao"]; return { used: false, answer: correct, challenge: { nonce, stage, expiresAtMs, choices } }; }
    if (stage === "sums") {
      const sums = Array.from({ length: SUM_COUNT }, (_, index) => ({ left: index % 2 === 0 ? index + 3 : index + 7, right: index % 3 === 0 ? 2 : 4 }));
      const expected = sums.map((sum) => sum.left + sum.right);
      return { used: false, answer: expected, challenge: { nonce, stage, expiresAtMs, prompt: "Solve ten single- and double-digit sums.", sums } };
    }
    const cells = new Set<number>(); const moles = Array.from({ length: MOLE_COUNT }, (_, index) => { let cell = this.#random.integer(25); while (cells.has(cell)) cell = (cell + 1) % 25; cells.add(cell); return { id: `mole-${index + 1}`, cell, visibleFromMs: now + index * 400, visibleUntilMs: now + index * 400 + 900 }; }); return { used: false, answer: moles.map((mole) => mole.id), challenge: { nonce, stage, startedAtMs: now, expiresAtMs, durationMs: MOLE_ROUND_MS, moles } };
  }

  #grade(record: LockoutRecord, challenge: ChallengeRecord, answer: unknown, now: number): boolean {
    if (typeof answer === "string" && answer.length > MAX_PINNED_ANSWER_LENGTH) return false;
    if (challenge.challenge.stage === "dish") { if (answer !== challenge.answer) record.wrongDishes += 1; return answer === challenge.answer; }
    if (challenge.challenge.stage === "sums") return Array.isArray(answer) && answer.length === SUM_COUNT && Array.isArray(challenge.answer) && answer.every((value, index) => Number.isSafeInteger(value) && value === challenge.answer[index]);
    if (challenge.challenge.stage === "mole") {
      if (!Array.isArray(answer) || !challenge.challenge.moles || now < challenge.challenge.moles[challenge.challenge.moles.length - 1].visibleUntilMs) return false;
      const hits = answer.filter((value): value is { id: string; atMs: number } => typeof value === "object" && value !== null && typeof (value as { id?: unknown }).id === "string" && Number.isSafeInteger((value as { atMs?: unknown }).atMs));
      const expected = new Set(challenge.answer as string[]); const ids = hits.map((hit) => hit.id); if (new Set(ids).size !== ids.length) return false;
      return ids.length === expected.size && hits.every((hit) => expected.has(hit.id) && challenge.challenge.moles!.some((mole) => mole.id === hit.id && hit.atMs >= mole.visibleFromMs && hit.atMs <= mole.visibleUntilMs));
    }
    return false;
  }
}

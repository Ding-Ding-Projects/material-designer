import { randomInt, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { LADDER_STAGES, type C5, type LadderChallenge, type LadderRecordLockoutOptions, type LadderResult, type LadderStage, type LadderState, type MoleClickResult } from './protocol.js';

export const LADDER_WINDOW_MS = 60 * 60 * 1_000;
export const LADDER_CHALLENGE_TTL_MS = 60 * 1_000;
export const MOLE_ROUND_MS = 5_000;
export const MOLE_COUNT = 8;
export const SUM_COUNT = 10;
export const MAX_LADDER_USES = 3;
export const LADDER_BUDGET_ID_PREFIX = 'unlock-ladder-budget:v1:';
const MAX_ANSWER_LENGTH = 128;
const MAX_PERSISTED_BYTES = 2 * 1024 * 1024;
const RENAME_RETRIES = 6;

type ServerMoleHit = { id: string; cell: number; atMs: number };
type ChallengeRecord = { challenge: LadderChallenge; answer: unknown; used: boolean; hitRecords: ServerMoleHit[]; clickCount: number };
type BudgetRecord = { windowStartedAtMs: number; uses: number };
type LockoutRecord = {
  state: LadderState;
  schoolMode: boolean;
  wrongDishes: number;
  challenge: ChallengeRecord | null;
  budgetKey: string;
};

export type UnlockLadderDurableSnapshot = {
  version: 1;
  budgets: Record<string, BudgetRecord>;
  lockouts: Record<string, Omit<LockoutRecord, 'challenge'>>;
};

export interface LadderClock { now(): number; }
export interface LadderRandom { uuid(): string; integer(maxExclusive: number): number; }
export interface LadderPersistence {
  load(): Promise<UnlockLadderDurableSnapshot | null>;
  save(snapshot: UnlockLadderDurableSnapshot): Promise<void>;
}

/** Stable identity shared by every lockout belonging to one account or local profile. */
export function stableLadderBudgetKey(identity: string): string {
  if (typeof identity !== 'string' || identity.length === 0 || identity.length > 256 || /[\u0000-\u001f\u007f]/u.test(identity)) {
    throw new Error('Unlock ladder budget identity is invalid.');
  }
  return `${LADDER_BUDGET_ID_PREFIX}${identity}`;
}

const systemClock: LadderClock = Object.freeze({ now: () => Date.now() });
const systemRandom: LadderRandom = Object.freeze({ uuid: randomUUID, integer: (maxExclusive: number) => randomInt(maxExclusive) });

function validNow(value: number): boolean { return Number.isSafeInteger(value) && value >= 0; }
function cloneState(state: LadderState): LadderState { return { ...state }; }
function nextStage(stage: LadderStage): LadderStage { return stage === 'dish' ? 'sums' : stage === 'sums' ? 'mole' : 'clock'; }
/**
 * Host-owned unlock ladder. It only clears a wait. It never verifies a
 * credential, issues a session, changes the attempt budget, or emits a cookie.
 */
export class UnlockLadderHost implements C5 {
  readonly #clock: LadderClock;
  readonly #random: LadderRandom;
  readonly #records = new Map<string, LockoutRecord>();
  readonly #nonceIndex = new Map<string, string>();
  readonly #budgets = new Map<string, BudgetRecord>();

  constructor(options: { clock?: LadderClock; random?: LadderRandom } = {}) {
    this.#clock = options.clock ?? systemClock;
    this.#random = options.random ?? systemRandom;
  }

  recordLockout(lockoutId: string, options: LadderRecordLockoutOptions): LadderState {
    const now = this.#clock.now();
    if (!lockoutId || !validNow(now) || !validNow(options.waitingUntilMs) || options.waitingUntilMs <= now ||
      !Number.isSafeInteger(options.remainingAttempts) || options.remainingAttempts < 0 ||
      !Number.isSafeInteger(options.consecutiveLockouts) || options.consecutiveLockouts < 1 ||
      (options.budgetKey !== undefined && (options.budgetKey.length === 0 || options.budgetKey.length > 256 || /[\u0000-\u001f\u007f]/u.test(options.budgetKey)))) {
      throw new Error('Invalid lockout state.');
    }
    const previous = this.#records.get(lockoutId);
    if (previous?.challenge) this.#nonceIndex.delete(previous.challenge.challenge.nonce);
    const budgetKey = options.budgetKey ?? stableLadderBudgetKey(lockoutId);
    const budget = this.#budgets.get(budgetKey) ?? { windowStartedAtMs: now, uses: 0 };
    const stage = options.schoolMode ? 'sums' : 'dish';
    const state: LadderState = {
      stage,
      waitingUntilMs: options.waitingUntilMs,
      remainingAttempts: options.remainingAttempts,
      consecutiveLockouts: options.consecutiveLockouts,
      ladderUsesInWindow: budget.uses,
      windowStartedAtMs: budget.windowStartedAtMs,
    };
    this.#budgets.set(budgetKey, budget);
    this.#records.set(lockoutId, { state, schoolMode: options.schoolMode ?? false, wrongDishes: 0, challenge: null, budgetKey });
    return cloneState(state);
  }

  state(lockoutId: string): LadderState | null {
    const record = this.#records.get(lockoutId);
    return record ? cloneState(record.state) : null;
  }

  exportState(): UnlockLadderDurableSnapshot {
    return {
      version: 1,
      budgets: Object.fromEntries([...this.#budgets].map(([key, value]) => [key, { ...value }])),
      lockouts: Object.fromEntries([...this.#records].map(([id, record]) => [id, {
        state: cloneState(record.state), schoolMode: record.schoolMode, wrongDishes: record.wrongDishes, budgetKey: record.budgetKey,
      }])),
    };
  }

  restoreState(snapshot: UnlockLadderDurableSnapshot): void {
    if (!snapshot || snapshot.version !== 1 || typeof snapshot.budgets !== 'object' || typeof snapshot.lockouts !== 'object') {
      throw new Error('Unlock ladder snapshot is invalid.');
    }
    this.#budgets.clear();
    this.#records.clear();
    for (const [key, budget] of Object.entries(snapshot.budgets)) {
      if (!key || !validNow(budget.windowStartedAtMs) || !Number.isSafeInteger(budget.uses) || budget.uses < 0 || budget.uses > MAX_LADDER_USES) {
        throw new Error('Unlock ladder budget snapshot is invalid.');
      }
      this.#budgets.set(key, { ...budget });
    }
    for (const [id, record] of Object.entries(snapshot.lockouts)) {
      if (!id || !record || !record.state || !LADDER_STAGES.includes(record.state.stage) || !validNow(record.state.waitingUntilMs) || !validNow(record.state.windowStartedAtMs) ||
        !Number.isSafeInteger(record.state.remainingAttempts) || record.state.remainingAttempts < 0 ||
        !Number.isSafeInteger(record.state.ladderUsesInWindow) || record.state.ladderUsesInWindow < 0 || record.state.ladderUsesInWindow > MAX_LADDER_USES ||
        !Number.isSafeInteger(record.state.consecutiveLockouts) || record.state.consecutiveLockouts < 1 ||
        !Number.isSafeInteger(record.wrongDishes) || record.wrongDishes < 0 || typeof record.budgetKey !== 'string') {
        throw new Error('Unlock ladder lockout snapshot is invalid.');
      }
      const budget = this.#budgets.get(record.budgetKey);
      if (!budget || record.state.ladderUsesInWindow !== budget.uses) throw new Error('Unlock ladder snapshot budget linkage is invalid.');
      this.#records.set(id, { ...record, state: cloneState(record.state), challenge: null });
    }
    this.#nonceIndex.clear();
  }

  issue(lockoutId: string): LadderChallenge | LadderResult {
    const record = this.#records.get(lockoutId);
    if (!record) return { ok: false, code: 'not-locked' };
    const now = this.#clock.now();
    if (!validNow(now) || now >= record.state.waitingUntilMs) return { ok: false, code: 'not-locked' };
    if (record.state.stage === 'clock') return { ok: false, code: 'clock-only' };
    const budget = this.#budgets.get(record.budgetKey) ?? { windowStartedAtMs: now, uses: 0 };
    if (now - budget.windowStartedAtMs >= LADDER_WINDOW_MS) { budget.windowStartedAtMs = now; budget.uses = 0; }
    record.state.windowStartedAtMs = budget.windowStartedAtMs;
    record.state.ladderUsesInWindow = budget.uses;
    this.#budgets.set(record.budgetKey, budget);
    if (budget.uses >= MAX_LADDER_USES) return { ok: false, code: 'budget-exhausted' };
    if (record.challenge && !record.challenge.used && record.challenge.challenge.expiresAtMs > now) return record.challenge.challenge;
    if (record.challenge) this.#nonceIndex.delete(record.challenge.challenge.nonce);
    const challenge = this.#makeChallenge(record.state.stage, now);
    record.challenge = challenge;
    this.#nonceIndex.set(challenge.challenge.nonce, lockoutId);
    return challenge.challenge;
  }

  submit(lockoutId: string, nonce: string, answer: unknown): LadderResult {
    const record = this.#records.get(lockoutId);
    if (!record) return { ok: false, code: 'not-locked' };
    const challengeRecord = record.challenge;
    const now = this.#clock.now();
    if (!challengeRecord || challengeRecord.challenge.nonce !== nonce) return { ok: false, code: 'invalid-nonce' };
    if (challengeRecord.used) return { ok: false, code: 'already-used' };
    if (this.#nonceIndex.get(nonce) !== lockoutId) return { ok: false, code: 'invalid-nonce' };
    challengeRecord.used = true;
    this.#nonceIndex.delete(nonce);
    if (!validNow(now) || now > challengeRecord.challenge.expiresAtMs) return { ok: false, code: 'expired-nonce' };
    if (challengeRecord.challenge.stage === 'mole' && now < (challengeRecord.challenge.startedAtMs ?? now) + MOLE_ROUND_MS) return { ok: false, code: 'early-submit' };
    if (challengeRecord.challenge.stage === 'mole' && (!answer || typeof answer !== 'object' || (answer as { kind?: unknown }).kind !== 'mole-round')) return { ok: false, code: 'invalid-answer' };
    const outcome = this.#grade(record, challengeRecord, answer, now);
    record.challenge = null;
    if (!outcome) {
      record.state.stage = challengeRecord.challenge.stage === 'dish' ? (record.wrongDishes >= 5 ? 'sums' : 'dish') : nextStage(record.state.stage);
      return { ok: false, code: 'wrong-answer' };
    }
    const budget = this.#budgets.get(record.budgetKey) ?? { windowStartedAtMs: now, uses: 0 };
    budget.uses += 1;
    this.#budgets.set(record.budgetKey, budget);
    record.state.ladderUsesInWindow = budget.uses;
    record.state.stage = 'clock';
    record.state.waitingUntilMs = now;
    if (challengeRecord.challenge.stage === 'dish') record.wrongDishes = 0;
    return { ok: true, clearedWait: true, state: cloneState(record.state) };
  }

  recordMoleHit(lockoutId: string, nonce: string, cell: number): MoleClickResult {
    const record = this.#records.get(lockoutId);
    if (!record) return { ok: false, code: 'not-locked' };
    const challengeRecord = record.challenge;
    const now = this.#clock.now();
    if (!challengeRecord || this.#nonceIndex.get(nonce) !== lockoutId || challengeRecord.challenge.nonce !== nonce) return { ok: false, code: 'invalid-nonce' };
    if (challengeRecord.used) return { ok: false, code: 'already-used' };
    if (challengeRecord.challenge.stage !== 'mole') return { ok: false, code: 'invalid-answer' };
    if (!validNow(now) || now > challengeRecord.challenge.expiresAtMs) return { ok: false, code: 'expired-nonce' };
    if (!Number.isSafeInteger(cell) || cell < 0 || cell >= 25) return { ok: false, code: 'mole-not-visible' };
    challengeRecord.clickCount += 1;
    if (challengeRecord.clickCount > MOLE_COUNT * 4) return { ok: false, code: 'mole-click-budget-exhausted' };
    const mole = challengeRecord.challenge.moles?.find((candidate) => candidate.cell === cell);
    if (!mole || now < mole.visibleFromMs || now > mole.visibleUntilMs) return { ok: false, code: 'mole-not-visible' };
    if (challengeRecord.hitRecords.some((hit) => hit.id === mole.id)) return { ok: false, code: 'duplicate-mole' };
    challengeRecord.hitRecords.push({ id: mole.id, cell: mole.cell, atMs: now });
    return { ok: true, accepted: true, cell, hitCount: challengeRecord.hitRecords.length };
  }

  #makeChallenge(stage: Exclude<LadderStage, 'clock'>, now: number): ChallengeRecord {
    const nonce = this.#random.uuid();
    const expiresAtMs = stage === 'mole' ? now + MOLE_ROUND_MS + LADDER_CHALLENGE_TTL_MS : now + LADDER_CHALLENGE_TTL_MS;
    if (stage === 'dish') {
      const correct = this.#random.integer(4);
      const choices = ['har-gow', 'siu-mai', 'cheung-fun', 'char-siu-bao'];
      return { used: false, answer: correct, hitRecords: [], clickCount: 0, challenge: { nonce, stage, expiresAtMs, choices } };
    }
    if (stage === 'sums') {
      const sums = Array.from({ length: SUM_COUNT }, (_, index) => ({ left: index % 2 === 0 ? index + 3 : index + 7, right: index % 3 === 0 ? 2 : 4 }));
      return { used: false, answer: sums.map((sum) => sum.left + sum.right), hitRecords: [], clickCount: 0, challenge: { nonce, stage, expiresAtMs, prompt: 'Solve ten single- and double-digit sums.', sums } };
    }
    const cells = new Set<number>();
    const moles = Array.from({ length: MOLE_COUNT }, (_, index) => {
      let cell = this.#random.integer(25);
      while (cells.has(cell)) cell = (cell + 1) % 25;
      cells.add(cell);
      return { id: `mole-${index + 1}`, cell, visibleFromMs: now + index * 400, visibleUntilMs: now + index * 400 + 900 };
    });
    return { used: false, answer: moles.map((mole) => mole.id), hitRecords: [], clickCount: 0, challenge: { nonce, stage, startedAtMs: now, expiresAtMs, durationMs: MOLE_ROUND_MS, moles } };
  }

  #grade(record: LockoutRecord, challenge: ChallengeRecord, answer: unknown, now: number): boolean {
    if (typeof answer === 'string' && answer.length > MAX_ANSWER_LENGTH) return false;
    if (challenge.challenge.stage === 'dish') {
      if (answer !== challenge.answer) record.wrongDishes += 1;
      return answer === challenge.answer;
    }
    if (challenge.challenge.stage === 'sums') {
      const expected = Array.isArray(challenge.answer) ? challenge.answer as number[] : null;
      return Array.isArray(answer) && answer.length === SUM_COUNT && expected !== null && answer.every((value, index) => Number.isSafeInteger(value) && value === expected[index]);
    }
    if (challenge.challenge.stage === 'mole') {
      if (!challenge.challenge.moles || now < challenge.challenge.moles[challenge.challenge.moles.length - 1].visibleUntilMs) return false;
      const moles = challenge.challenge.moles;
      if (!moles) return false;
      const expected = new Set(challenge.answer as string[]);
      const ids = challenge.hitRecords.map((hit) => hit.id);
      return challenge.hitRecords.length === expected.size && new Set(ids).size === ids.length && challenge.hitRecords.every((hit) => expected.has(hit.id) && moles.some((mole) => mole.id === hit.id && mole.cell === hit.cell && hit.atMs >= mole.visibleFromMs && hit.atMs <= mole.visibleUntilMs));
    }
    return false;
  }
}

export class JsonUnlockLadderPersistence implements LadderPersistence {
  readonly #path: string;
  constructor(path: string) { this.#path = path; }
  async load(): Promise<UnlockLadderDurableSnapshot | null> {
    try {
      const raw = await readFile(this.#path, 'utf8');
      if (raw.length > MAX_PERSISTED_BYTES) throw new Error('Unlock ladder persistence exceeds the bounded size.');
      return JSON.parse(raw) as UnlockLadderDurableSnapshot;
    }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
  }
  async save(snapshot: UnlockLadderDurableSnapshot): Promise<void> {
    await mkdir(dirname(this.#path), { recursive: true });
    const payload = `${JSON.stringify(snapshot)}\n`;
    if (payload.length > MAX_PERSISTED_BYTES) throw new Error('Unlock ladder persistence exceeds the bounded size.');
    const temporary = `${this.#path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, payload, { encoding: 'utf8', flag: 'wx' });
      let lastError: unknown;
      for (let attempt = 0; attempt < RENAME_RETRIES; attempt++) {
        try {
          await rename(temporary, this.#path);
          lastError = undefined;
          break;
        } catch (error) {
          lastError = error;
          const code = (error as NodeJS.ErrnoException).code;
          if (code !== 'EPERM' && code !== 'EACCES' && code !== 'EBUSY') throw error;
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      }
      if (lastError) throw lastError;
    } finally {
      try { await unlink(temporary); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') { /* preserve the write result */ } }
    }
  }
}

export class DurableUnlockLadderHost implements C5 {
  readonly #host: UnlockLadderHost;
  readonly #persistence: LadderPersistence;
  readonly #ready: Promise<void>;
  constructor(options: { persistence: LadderPersistence; clock?: LadderClock; random?: LadderRandom }) {
    this.#host = new UnlockLadderHost(options);
    this.#persistence = options.persistence;
    this.#ready = this.#restore();
  }
  async recordLockout(lockoutId: string, options: Parameters<UnlockLadderHost['recordLockout']>[1]): Promise<LadderState> { await this.#ready; return this.#mutate(() => this.#host.recordLockout(lockoutId, options)); }
  async state(lockoutId: string): Promise<LadderState | null> { await this.#ready; return this.#host.state(lockoutId); }
  async issue(lockoutId: string): Promise<ReturnType<UnlockLadderHost['issue']>> { await this.#ready; return this.#mutate(() => this.#host.issue(lockoutId)); }
  async submit(lockoutId: string, nonce: string, answer: unknown): Promise<ReturnType<UnlockLadderHost['submit']>> { await this.#ready; return this.#mutate(() => this.#host.submit(lockoutId, nonce, answer)); }
  async recordMoleHit(lockoutId: string, nonce: string, cell: number): Promise<MoleClickResult> { await this.#ready; return this.#mutate(() => this.#host.recordMoleHit(lockoutId, nonce, cell)); }
  async #restore(): Promise<void> { const snapshot = await this.#persistence.load(); if (snapshot) this.#host.restoreState(snapshot); }
  async #save(): Promise<void> { await this.#persistence.save(this.#host.exportState()); }
  async #mutate<T>(operation: () => T): Promise<T> {
    const before = this.#host.exportState();
    try {
      const result = operation();
      await this.#save();
      return result;
    } catch (error) {
      this.#host.restoreState(before);
      throw error;
    }
  }
}

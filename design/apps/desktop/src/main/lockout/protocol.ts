export const LADDER_STAGES = ['dish', 'sums', 'mole', 'clock'] as const;
export type LadderStage = (typeof LADDER_STAGES)[number];

export type LadderState = {
  stage: LadderStage;
  waitingUntilMs: number;
  remainingAttempts: number;
  consecutiveLockouts: number;
  ladderUsesInWindow: number;
  windowStartedAtMs: number;
};

export type LadderRecordLockoutOptions = {
  waitingUntilMs: number;
  remainingAttempts: number;
  consecutiveLockouts: number;
  schoolMode?: boolean;
  budgetKey?: string;
};

export type LadderChallenge = {
  nonce: string;
  stage: Exclude<LadderStage, 'clock'>;
  startedAtMs?: number;
  expiresAtMs: number;
  choices?: readonly string[];
  prompt?: string;
  sums?: readonly { left: number; right: number }[];
  durationMs?: number;
  moles?: readonly { id: string; cell: number; visibleFromMs: number; visibleUntilMs: number }[];
};

export type LadderResult =
  | { ok: true; clearedWait: true; state: LadderState }
  | { ok: true; accepted: true; state: LadderState }
  | {
      ok: false;
      code:
        | 'not-locked'
        | 'clock-only'
        | 'budget-exhausted'
        | 'invalid-nonce'
        | 'expired-nonce'
        | 'already-used'
        | 'wrong-answer'
        | 'early-submit'
        | 'invalid-answer'
        | 'duplicate-mole'
        | 'incomplete-moles'
        | 'mole-click-budget-exhausted'
        | 'mole-not-visible'
        | 'school-mode';
    };

export type MoleHit = { id: string; cell: number };
export type MoleClickResult =
  | { ok: true; accepted: true; cell: number; hitCount: number }
  | { ok: false; code: Extract<LadderResult, { ok: false }>['code'] };

/**
 * C5 is the host-facing contract. The wait may be cleared, but credentials,
 * sessions, cookies, and attempt budgets remain outside this interface.
 */
export interface C5 {
  recordLockout(lockoutId: string, options: LadderRecordLockoutOptions): Promise<LadderState> | LadderState;
  issue(lockoutId: string): Promise<LadderChallenge | LadderResult> | LadderChallenge | LadderResult;
  submit(lockoutId: string, nonce: string, answer: unknown): Promise<LadderResult> | LadderResult;
  recordMoleHit(lockoutId: string, nonce: string, cell: number): Promise<MoleClickResult> | MoleClickResult;
  state(lockoutId: string): Promise<LadderState | null> | LadderState | null;
}

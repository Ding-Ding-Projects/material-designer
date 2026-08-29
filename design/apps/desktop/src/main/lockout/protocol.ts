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
        | 'school-mode';
    };

export type MoleHit = { id: string; cell: number; atMs: number };

/**
 * C5 is the host-facing contract. The wait may be cleared, but credentials,
 * sessions, cookies, and attempt budgets remain outside this interface.
 */
export interface C5 {
  issue(lockoutId: string): Promise<LadderChallenge | LadderResult> | LadderChallenge | LadderResult;
  submit(lockoutId: string, nonce: string, answer: unknown): Promise<LadderResult> | LadderResult;
  state(lockoutId: string): Promise<LadderState | null> | LadderState | null;
}

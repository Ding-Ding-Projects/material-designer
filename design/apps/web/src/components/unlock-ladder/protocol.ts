export type { C5, LadderChallenge, LadderRecordLockoutOptions, LadderResult, LadderStage, LadderState, MoleClickResult, MoleHit } from '../../../../desktop/src/main/lockout/protocol';
import type { LadderRecordLockoutOptions, LadderState } from '../../../../desktop/src/main/lockout/protocol';

export const UNLOCK_LADDER_STAGES = ['dish', 'sums', 'mole', 'clock'] as const;
export type UnlockLadderStage = (typeof UNLOCK_LADDER_STAGES)[number];

export type UnlockLadderChallenge = {
  nonce: string;
  stage: Exclude<UnlockLadderStage, 'clock'>;
  expiresAtMs: number;
  startedAtMs?: number;
  choices?: readonly string[];
  prompt?: string;
  sums?: readonly { left: number; right: number }[];
  durationMs?: number;
  moles?: readonly { id: string; cell: number; visibleFromMs: number; visibleUntilMs: number }[];
};

export type UnlockLadderState = {
  stage: UnlockLadderStage;
  waitingUntilMs: number;
  remainingAttempts: number;
  consecutiveLockouts: number;
  ladderUsesInWindow: number;
  windowStartedAtMs: number;
};

export type UnlockLadderResponse =
  | { ok: true; clearedWait: true; state: UnlockLadderState }
  | { ok: true; accepted: true; state: UnlockLadderState }
  | { ok: false; code: string };

export interface UnlockLadderBridge {
  recordLockout?(lockoutId: string, options: LadderRecordLockoutOptions): Promise<LadderState>;
  issue(lockoutId: string): Promise<UnlockLadderChallenge | UnlockLadderResponse>;
  submit(lockoutId: string, nonce: string, answer: unknown): Promise<UnlockLadderResponse>;
  recordMoleHit(lockoutId: string, nonce: string, cell: number): Promise<UnlockLadderResponse>;
}

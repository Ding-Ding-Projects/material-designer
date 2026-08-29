export type { C5, LadderChallenge, LadderResult, LadderStage, LadderState, MoleHit } from '../../../../desktop/src/main/lockout/protocol';

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
  issue(lockoutId: string): Promise<UnlockLadderChallenge | UnlockLadderResponse>;
  submit(lockoutId: string, nonce: string, answer: unknown): Promise<UnlockLadderResponse>;
}

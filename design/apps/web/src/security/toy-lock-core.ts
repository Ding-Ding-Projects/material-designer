export const TOY_LOCK_POLICIES = Object.freeze([
  'pin',
  'password',
  'pin-password',
  'password-totp',
  'pin-totp',
  'password-pin-totp',
] as const);

export type ToyLockPolicy = (typeof TOY_LOCK_POLICIES)[number];
export type ToyLockFactor = 'pin' | 'password' | 'totp';
export type PinEntrySource = 'keypad' | 'manual';

const POLICY_FACTORS: Readonly<Record<ToyLockPolicy, readonly ToyLockFactor[]>> = Object.freeze({
  pin: Object.freeze(['pin']),
  password: Object.freeze(['password']),
  'pin-password': Object.freeze(['pin', 'password']),
  'password-totp': Object.freeze(['password', 'totp']),
  'pin-totp': Object.freeze(['pin', 'totp']),
  'password-pin-totp': Object.freeze(['password', 'pin', 'totp']),
});

export interface PinInput {
  source: PinEntrySource;
  value: string;
}

export type PinNormalizationResult =
  | { ok: true; value: string }
  | { ok: false; reason: 'empty' | 'non-digit' | 'too-short' | 'too-long' };

export interface AttemptBudget {
  readonly maximum: number;
  readonly remaining: number;
}

export type AttemptResult =
  | { accepted: true; budget: AttemptBudget }
  | { accepted: false; exhausted: boolean; budget: AttemptBudget };

export interface LockedTarget {
  readonly targetId: string;
  readonly policy: ToyLockPolicy;
  readonly locked: boolean;
}

export type LockedActivationResult =
  | { kind: 'invoked'; targetId: string }
  | { kind: 'authentication-required'; targetId: string; policy: ToyLockPolicy; factors: readonly ToyLockFactor[] }
  | { kind: 'attempts-exhausted'; targetId: string; policy: ToyLockPolicy };

export function factorsForPolicy(policy: ToyLockPolicy): readonly ToyLockFactor[] {
  return POLICY_FACTORS[policy];
}

export function normalizePin(input: PinInput, minimumLength = 4, maximumLength = 12): PinNormalizationResult {
  if (!Number.isInteger(minimumLength) || !Number.isInteger(maximumLength) || minimumLength < 1 || maximumLength < minimumLength) {
    throw new RangeError('PIN length bounds must be positive integers in ascending order');
  }

  const normalized = input.value.trim();
  if (normalized.length === 0) return { ok: false, reason: 'empty' };
  if (!/^\d+$/.test(normalized)) return { ok: false, reason: 'non-digit' };
  if (normalized.length < minimumLength) return { ok: false, reason: 'too-short' };
  if (normalized.length > maximumLength) return { ok: false, reason: 'too-long' };
  return { ok: true, value: normalized };
}

export function createAttemptBudget(maximum = 5): AttemptBudget {
  if (!Number.isInteger(maximum) || maximum < 1) {
    throw new RangeError('Attempt maximum must be a positive integer');
  }
  return Object.freeze({ maximum, remaining: maximum });
}

export function recordAttempt(budget: AttemptBudget, matched: boolean): AttemptResult {
  if (budget.remaining < 0 || budget.remaining > budget.maximum) {
    throw new RangeError('Attempt budget is outside its declared bounds');
  }
  if (matched) return { accepted: true, budget: createAttemptBudget(budget.maximum) };

  const remaining = Math.max(0, budget.remaining - 1);
  return {
    accepted: false,
    exhausted: remaining === 0,
    budget: Object.freeze({ maximum: budget.maximum, remaining }),
  };
}

export function interceptLockedActivation(
  target: LockedTarget,
  budget: AttemptBudget,
  invokeProtectedAction: () => void,
): LockedActivationResult {
  if (!target.locked) {
    invokeProtectedAction();
    return { kind: 'invoked', targetId: target.targetId };
  }

  if (budget.remaining === 0) {
    return { kind: 'attempts-exhausted', targetId: target.targetId, policy: target.policy };
  }

  return {
    kind: 'authentication-required',
    targetId: target.targetId,
    policy: target.policy,
    factors: factorsForPolicy(target.policy),
  };
}

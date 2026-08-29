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
export type ToyLockActivationSource = 'pointer' | 'keyboard' | 'touch' | 'assistive' | 'programmatic' | 'shortcut';
export type ToyLockUnlockDuration = 'surface' | '5-minutes' | 'until-close';

export const TOY_LOCK_UNLOCK_DURATIONS = Object.freeze([
  'surface',
  '5-minutes',
  'until-close',
] as const);

/** Every route is listed explicitly so a new route cannot silently bypass a lock. */
export const TOY_LOCK_ACTIVATION_SOURCES = Object.freeze([
  'pointer',
  'keyboard',
  'touch',
  'assistive',
  'programmatic',
  'shortcut',
] as const satisfies readonly ToyLockActivationSource[]);

const freezeFactors = <const Factors extends readonly ToyLockFactor[]>(...factors: Factors): Readonly<Factors> =>
  Object.freeze(factors);

const POLICY_FACTORS = Object.freeze({
  pin: freezeFactors('pin'),
  password: freezeFactors('password'),
  'pin-password': freezeFactors('pin', 'password'),
  'password-totp': freezeFactors('password', 'totp'),
  'pin-totp': freezeFactors('pin', 'totp'),
  'password-pin-totp': freezeFactors('password', 'pin', 'totp'),
} satisfies Readonly<Record<ToyLockPolicy, readonly ToyLockFactor[]>>);

/** Hand-written policy and input-route inventory consumed by UI and guards. */
export const TOY_LOCK_POLICY_INPUT_INVENTORY = Object.freeze([
  Object.freeze({ policy: 'pin', factors: Object.freeze(['pin'] as const), inputRoutes: Object.freeze(['keypad', 'manual'] as const) }),
  Object.freeze({ policy: 'password', factors: Object.freeze(['password'] as const), inputRoutes: Object.freeze(['manual'] as const) }),
  Object.freeze({ policy: 'pin-password', factors: Object.freeze(['pin', 'password'] as const), inputRoutes: Object.freeze(['keypad', 'manual'] as const) }),
  Object.freeze({ policy: 'password-totp', factors: Object.freeze(['password', 'totp'] as const), inputRoutes: Object.freeze(['manual'] as const) }),
  Object.freeze({ policy: 'pin-totp', factors: Object.freeze(['pin', 'totp'] as const), inputRoutes: Object.freeze(['keypad', 'manual'] as const) }),
  Object.freeze({ policy: 'password-pin-totp', factors: Object.freeze(['password', 'pin', 'totp'] as const), inputRoutes: Object.freeze(['keypad', 'manual'] as const) }),
] as const);

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

export interface ToyLockState extends LockedTarget {
  readonly unlockDuration: ToyLockUnlockDuration;
  readonly unlockUntilMs: number | null;
}

export type LockedActivationResult =
  | { kind: 'invoked'; targetId: string }
  | { kind: 'authentication-required'; targetId: string; policy: ToyLockPolicy; factors: readonly ToyLockFactor[] }
  | { kind: 'attempts-exhausted'; targetId: string; policy: ToyLockPolicy };

export function factorsForPolicy(policy: ToyLockPolicy): readonly ToyLockFactor[] {
  return POLICY_FACTORS[policy];
}

export function isToyLockPolicy(value: unknown): value is ToyLockPolicy {
  return typeof value === 'string' && (TOY_LOCK_POLICIES as readonly string[]).includes(value);
}

export function requiresToyLockFactor(policy: ToyLockPolicy, factor: ToyLockFactor): boolean {
  return factorsForPolicy(policy).includes(factor);
}

/** Build one independent lock record. No credential or target state is shared. */
export function createToyLockState(
  targetId: string,
  policy: ToyLockPolicy,
  unlockDuration: ToyLockUnlockDuration = 'surface',
): ToyLockState {
  if (targetId.trim().length === 0) throw new RangeError('Toy-lock target id must not be empty');
  if (!isToyLockPolicy(policy)) throw new RangeError('Unsupported toy-lock policy');
  if (!(TOY_LOCK_UNLOCK_DURATIONS as readonly string[]).includes(unlockDuration)) {
    throw new RangeError('Unsupported toy-lock unlock duration');
  }
  return Object.freeze({
    targetId,
    policy,
    locked: true,
    unlockDuration,
    unlockUntilMs: null,
  });
}

export function unlockExpiryMs(nowMs: number, duration: ToyLockUnlockDuration): number | null {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) throw new RangeError('Unlock time must be a non-negative safe integer');
  if (duration === 'surface') return 0;
  if (duration === 'until-close') return null;
  return nowMs + 5 * 60_000;
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

export function hydrateAttemptBudget(maximum: number, remaining: number): AttemptBudget {
  if (!Number.isSafeInteger(maximum) || maximum < 1) throw new RangeError('Attempt maximum must be a positive integer');
  if (!Number.isSafeInteger(remaining) || remaining < 0 || remaining > maximum) {
    throw new RangeError('Attempt remaining count is outside its declared bounds');
  }
  return Object.freeze({ maximum, remaining });
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

/**
 * Route every activation source through the same interceptor. The callback is
 * called only for an unlocked target, regardless of whether activation began
 * with a pointer, keyboard, touch, assistive technology, a shortcut, or code.
 */
export function interceptLockedActivationForRoute(
  target: LockedTarget,
  budget: AttemptBudget,
  source: ToyLockActivationSource,
  invokeProtectedAction: () => void,
): LockedActivationResult {
  if (!(TOY_LOCK_ACTIVATION_SOURCES as readonly string[]).includes(source)) {
    throw new RangeError('Unknown toy-lock activation source');
  }
  return interceptLockedActivation(target, budget, invokeProtectedAction);
}

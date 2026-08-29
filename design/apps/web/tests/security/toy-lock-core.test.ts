import { describe, expect, it, vi } from 'vitest';

import {
  TOY_LOCK_POLICIES,
  TOY_LOCK_ACTIVATION_SOURCES,
  TOY_LOCK_POLICY_INPUT_INVENTORY,
  TOY_LOCK_UNLOCK_DURATIONS,
  createAttemptBudget,
  createToyLockState,
  factorsForPolicy,
  hydrateAttemptBudget,
  interceptLockedActivation,
  interceptLockedActivationForRoute,
  normalizePin,
  recordAttempt,
  unlockExpiryMs,
  type ToyLockFactor,
  type ToyLockPolicy,
} from '../../src/security/toy-lock-core';

const EXPECTED_POLICIES: Readonly<Record<ToyLockPolicy, readonly ToyLockFactor[]>> = {
  pin: ['pin'],
  password: ['password'],
  'pin-password': ['pin', 'password'],
  'password-totp': ['password', 'totp'],
  'pin-totp': ['pin', 'totp'],
  'password-pin-totp': ['password', 'pin', 'totp'],
};

// @ts-expect-error Invalid factor names must remain compile-time errors.
const INVALID_FACTOR_REJECTION: ToyLockFactor = 'biometric';
void INVALID_FACTOR_REJECTION;

describe('toy-lock policy registry', () => {
  it('contains exactly the six supported policies with exact factor order', () => {
    expect(TOY_LOCK_POLICIES).toEqual(Object.keys(EXPECTED_POLICIES));
    for (const policy of TOY_LOCK_POLICIES) {
      expect(factorsForPolicy(policy)).toEqual(EXPECTED_POLICIES[policy]);
    }
  });

  it('cannot be satisfied by a renamed or seventh policy', () => {
    const mutated = [...TOY_LOCK_POLICIES.slice(0, -1), 'password-pin-totp-renamed'];
    expect(mutated).not.toEqual(Object.keys(EXPECTED_POLICIES));
  });

  it('does not allow callers to mutate the canonical policy or factor lists', () => {
    expect(Object.isFrozen(TOY_LOCK_POLICIES)).toBe(true);
    for (const policy of TOY_LOCK_POLICIES) {
      expect(Object.isFrozen(factorsForPolicy(policy))).toBe(true);
    }
  });

  it('keeps one explicit input-route row for each of the six policies', () => {
    expect(TOY_LOCK_POLICY_INPUT_INVENTORY.map((entry) => entry.policy)).toEqual(TOY_LOCK_POLICIES);
    expect(TOY_LOCK_POLICY_INPUT_INVENTORY.map((entry) => entry.inputRoutes)).toEqual([
      ['keypad', 'manual'], ['manual'], ['keypad', 'manual'], ['manual'], ['keypad', 'manual'], ['keypad', 'manual'],
    ]);
    expect(Object.isFrozen(TOY_LOCK_POLICY_INPUT_INVENTORY)).toBe(true);
  });

  it('enumerates every activation route and creates independent locked state', () => {
    expect(TOY_LOCK_ACTIVATION_SOURCES).toEqual(['pointer', 'keyboard', 'touch', 'assistive', 'programmatic', 'shortcut']);
    expect(TOY_LOCK_UNLOCK_DURATIONS).toEqual(['surface', '5-minutes', 'until-close']);
    const first = createToyLockState('first', 'pin');
    const second = createToyLockState('second', 'pin');
    expect(first).not.toBe(second);
    expect(first).toMatchObject({ targetId: 'first', locked: true, policy: 'pin', unlockDuration: 'surface' });
  });
});

describe('PIN normalization', () => {
  it.each(['keypad', 'manual'] as const)('uses one validator for %s entry', (source) => {
    expect(normalizePin({ source, value: ' 012345 ' })).toEqual({ ok: true, value: '012345' });
  });

  it.each([
    ['', 'empty'],
    ['12a4', 'non-digit'],
    ['123', 'too-short'],
    ['1234567890123', 'too-long'],
  ] as const)('rejects %j as %s', (value, reason) => {
    expect(normalizePin({ source: 'manual', value })).toEqual({ ok: false, reason });
  });
});

describe('attempt budget', () => {
  it('shares one bounded budget across entry sources and exhausts exactly once', () => {
    let budget = createAttemptBudget(2);
    const keypadMiss = recordAttempt(budget, false);
    expect(keypadMiss).toMatchObject({ accepted: false, exhausted: false, budget: { remaining: 1 } });
    budget = keypadMiss.budget;

    const manualMiss = recordAttempt(budget, false);
    expect(manualMiss).toMatchObject({ accepted: false, exhausted: true, budget: { remaining: 0 } });
  });

  it('resets the budget only after a matched attempt', () => {
    const miss = recordAttempt(createAttemptBudget(3), false);
    expect(recordAttempt(miss.budget, true)).toEqual({
      accepted: true,
      budget: { maximum: 3, remaining: 3 },
    });
  });

  it('hydrates host-owned remaining attempts only inside declared bounds', () => {
    expect(hydrateAttemptBudget(5, 3)).toEqual({ maximum: 5, remaining: 3 });
    expect(() => hydrateAttemptBudget(5, 6)).toThrow(RangeError);
    expect(() => hydrateAttemptBudget(0, 0)).toThrow(RangeError);
  });
});

describe('locked activation interception', () => {
  it('routes a locked target to its exact authentication policy without invoking its action', () => {
    const invoke = vi.fn();
    const result = interceptLockedActivation(
      { targetId: 'export-button', policy: 'password-pin-totp', locked: true },
      createAttemptBudget(),
      invoke,
    );

    expect(invoke).not.toHaveBeenCalled();
    expect(result).toEqual({
      kind: 'authentication-required',
      targetId: 'export-button',
      policy: 'password-pin-totp',
      factors: ['password', 'pin', 'totp'],
    });
  });

  it('does not invoke a locked target after its attempt budget is exhausted', () => {
    const invoke = vi.fn();
    expect(interceptLockedActivation(
      { targetId: 'export-button', policy: 'pin', locked: true },
      { maximum: 3, remaining: 0 },
      invoke,
    )).toEqual({ kind: 'attempts-exhausted', targetId: 'export-button', policy: 'pin' });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('invokes the protected action exactly once when the target is unlocked', () => {
    const invoke = vi.fn();
    expect(interceptLockedActivation(
      { targetId: 'export-button', policy: 'pin', locked: false },
      createAttemptBudget(),
      invoke,
    )).toEqual({ kind: 'invoked', targetId: 'export-button' });
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it.each(TOY_LOCK_ACTIVATION_SOURCES)('refuses the %s route while locked', (source) => {
    const invoke = vi.fn();
    const result = interceptLockedActivationForRoute(
      { targetId: 'any-element', policy: 'pin', locked: true },
      createAttemptBudget(),
      source,
      invoke,
    );
    expect(result.kind).toBe('authentication-required');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('rejects an unknown activation source instead of providing a bypass', () => {
    expect(() => interceptLockedActivationForRoute(
      { targetId: 'any-element', policy: 'pin', locked: true },
      createAttemptBudget(),
      'unknown' as never,
      vi.fn(),
    )).toThrow(RangeError);
  });

  it('calculates bounded unlock durations without sharing lock state', () => {
    expect(unlockExpiryMs(1_000, 'surface')).toBe(0);
    expect(unlockExpiryMs(1_000, '5-minutes')).toBe(301_000);
    expect(unlockExpiryMs(1_000, 'until-close')).toBeNull();
  });
});

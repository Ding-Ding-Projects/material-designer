// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createToyLockIntegrationApi } from '../../src/security/toy-lock-integration';

afterEach(() => vi.useRealTimers());

describe('toy-lock integration API', () => {
  it('keeps the host-owned policy and recovery seams bounded', async () => {
    const host = {
      openRecoveryFolder: vi.fn(async () => ({ ok: true as const, path: 'C:/example/app-data' })),
      beginTotpEnrollment: vi.fn(),
      confirmTotpEnrollment: vi.fn(),
      configure: vi.fn(async () => ({ ok: true as const, lock: { targetId: 'general' as const, policy: 'pin' as const, revision: 1, maximumAttempts: 5, remainingAttempts: 5, cooldownUntilMs: null, unlocked: false, unlockDuration: 'surface' as const, unlockUntilMs: null } })),
      list: vi.fn(async () => ({ ok: true as const, locks: [], protectionAvailable: true })),
      remove: vi.fn(async () => ({ ok: true as const })),
      relock: vi.fn(async () => ({ ok: true as const, lock: { targetId: 'general' as const, policy: 'pin' as const, revision: 1, maximumAttempts: 5, remainingAttempts: 5, cooldownUntilMs: null, unlocked: false, unlockDuration: 'surface' as const, unlockUntilMs: null } })),
      verify: vi.fn(async () => ({ ok: true as const, matched: true, lock: { targetId: 'general' as const, policy: 'pin' as const, revision: 2, maximumAttempts: 5, remainingAttempts: 5, cooldownUntilMs: null, unlocked: true, unlockDuration: 'surface' as const, unlockUntilMs: null } })),
    };
    const api = createToyLockIntegrationApi(host);
    await expect(api.list()).resolves.toEqual([]);
    await expect(api.verifyPolicy({ targetId: 'general', policy: 'pin', revision: 1, factors: { pin: '1234' } })).resolves.toEqual({ matched: true, maximumAttempts: 5, remainingAttempts: 5, revision: 2, unlocked: true, unlockUntilMs: null });
    await expect(api.openRecoveryFolder()).resolves.toEqual({ ok: true, path: 'C:/example/app-data' });
    await expect(api.relock('general', 1)).resolves.toMatchObject({ ok: true, lock: { unlocked: false } });
    expect(host.verify).toHaveBeenCalledWith({ targetId: 'general', revision: 1, factors: { pin: '1234' } });
  });

  it('fails safe for an unavailable host and old hosts without recovery', async () => {
    const api = createToyLockIntegrationApi(undefined);
    await expect(api.list()).resolves.toEqual([]);
    await expect(api.openRecoveryFolder()).resolves.toEqual({ ok: false, reason: 'host-unavailable' });
    await expect(api.relock('general', 1)).resolves.toEqual({ ok: false, reason: 'relock-unavailable' });
  });

  it('turns configure and remove hangs into structured failures and clears timers', async () => {
    vi.useFakeTimers();
    const pending = new Promise<never>(() => undefined);
    const host = {
      beginTotpEnrollment: vi.fn(), confirmTotpEnrollment: vi.fn(), list: vi.fn(async () => ({ ok: true as const, locks: [], protectionAvailable: true })),
      verify: vi.fn(), openRecoveryFolder: vi.fn(), relock: vi.fn(),
      configure: vi.fn(() => pending),
      remove: vi.fn(() => pending),
    };
    const api = createToyLockIntegrationApi(host);
    const configure = api.configure({ expectedRevision: null, factors: { pin: '1234' }, policy: 'pin', targetId: 'general' });
    const remove = api.remove('general', 1);
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(configure).resolves.toEqual({ code: 'operation-failed', ok: false });
    await expect(remove).resolves.toEqual({ code: 'operation-failed', ok: false });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('turns synchronous configure failures into structured failures', async () => {
    const host = {
      beginTotpEnrollment: vi.fn(), confirmTotpEnrollment: vi.fn(), list: vi.fn(async () => ({ ok: true as const, locks: [], protectionAvailable: true })),
      verify: vi.fn(), openRecoveryFolder: vi.fn(), relock: vi.fn(), remove: vi.fn(async () => ({ ok: true as const })),
      configure: vi.fn(() => { throw new Error('host unavailable'); }),
    };
    const api = createToyLockIntegrationApi(host);
    await expect(api.configure({ expectedRevision: null, factors: { pin: '1234' }, policy: 'pin', targetId: 'general' })).resolves.toEqual({ code: 'operation-failed', ok: false });
  });
});

// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

import { createToyLockIntegrationApi } from '../../src/security/toy-lock-integration';

describe('toy-lock integration API', () => {
  it('keeps the host-owned policy and recovery seams bounded', async () => {
    const host = {
      openRecoveryFolder: vi.fn(async () => ({ ok: true as const, path: 'C:/example/app-data' })),
      beginTotpEnrollment: vi.fn(),
      confirmTotpEnrollment: vi.fn(),
      configure: vi.fn(async () => ({ ok: true as const, lock: { targetId: 'general' as const, policy: 'pin' as const, revision: 1, maximumAttempts: 5, remainingAttempts: 5, cooldownUntilMs: null } })),
      list: vi.fn(async () => ({ ok: true as const, locks: [], protectionAvailable: true })),
      remove: vi.fn(async () => ({ ok: true as const })),
      verify: vi.fn(async () => ({ ok: true as const, matched: true, lock: { targetId: 'general' as const, policy: 'pin' as const, revision: 1, maximumAttempts: 5, remainingAttempts: 5, cooldownUntilMs: null } })),
    };
    const api = createToyLockIntegrationApi(host);
    await expect(api.list()).resolves.toEqual([]);
    await expect(api.verifyPolicy({ targetId: 'general', policy: 'pin', revision: 1, factors: { pin: '1234' } })).resolves.toEqual({ matched: true, maximumAttempts: 5, remainingAttempts: 5 });
    await expect(api.openRecoveryFolder()).resolves.toEqual({ ok: true, path: 'C:/example/app-data' });
    expect(host.verify).toHaveBeenCalledWith({ targetId: 'general', revision: 1, factors: { pin: '1234' } });
  });

  it('fails safe for an unavailable host and old hosts without recovery', async () => {
    const api = createToyLockIntegrationApi(undefined);
    await expect(api.list()).resolves.toEqual([]);
    await expect(api.openRecoveryFolder()).resolves.toEqual({ ok: false, reason: 'host-unavailable' });
  });
});

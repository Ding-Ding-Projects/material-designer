import { describe, expect, test, vi } from 'vitest';

import { createCanonicalAuthenticatorBridge, createCanonicalUnlockLadderBridge, type CanonicalHostShape } from '../../src/main/authenticator/bridge.js';

function fakeHost(): CanonicalHostShape {
  const entry = { id: 'entry-1', issuer: 'Example', account: 'designer@example.invalid', algorithm: 'SHA-1' as const, digits: 6 as const, period: 30, group: null, order: 0 };
  const view = { ...entry, currentCode: '123 456', nextCode: '654 321', secondsRemaining: 30, clockWarning: null };
  return {
    vaultStatus: vi.fn(async () => ({ ok: true as const, value: { available: true } })),
    trustedTimeStatus: vi.fn(async () => ({ ok: true as const, value: { available: true, source: 'test' } })),
    generateSecret: vi.fn(async () => ({ ok: true as const, value: { secretBase32: 'JBSWY3DPEHPK3PXP' } })),
    list: vi.fn(async () => ({ ok: true as const, value: { entries: [entry] } })),
    view: vi.fn(async () => ({ ok: true as const, value: { entry: view } })),
    register: vi.fn(async () => ({ ok: true as const, value: { entry } })),
    qrFor: vi.fn(async () => ({ ok: true as const, value: { uri: 'otpauth://totp/E:a', version: 5 as const, size: 37 as const, quietZone: 4 as const, renderedSize: 45 as const, modules: [[false]], renderedModules: [[false]] } })),
    copyCurrentCode: vi.fn(async () => ({ ok: true as const, value: { code: '123456' } })),
    setGroup: vi.fn(async () => ({ ok: true as const, value: undefined })),
    reorder: vi.fn(async () => ({ ok: true as const, value: undefined })),
    issueSuperConfirmation: vi.fn(async () => ({ ok: true as const, value: { confirmationToken: 'confirmation-1' } })),
    remove: vi.fn(async () => ({ ok: true as const, value: undefined })),
    historyUnlock: vi.fn(async () => ({ ok: true as const, value: undefined })),
    historyList: vi.fn(async () => ({ ok: true as const, value: { records: [] } })),
    historyDiff: vi.fn(async () => ({ ok: true as const, value: { diff: '{}' } })),
    historyRestore: vi.fn(async () => ({ ok: true as const, value: { historyRecorded: true, recovery: null } })),
    historyExportRedacted: vi.fn(async () => ({ ok: true as const, value: { content: '{}' } })),
    historyExportSensitive: vi.fn(async () => ({ ok: true as const, value: { content: '{}' } })),
    ladderRecordLockout: vi.fn(async () => ({ stage: 'dish' as const, waitingUntilMs: 60_000, remainingAttempts: 2, consecutiveLockouts: 1, ladderUsesInWindow: 0, windowStartedAtMs: 0 })),
    ladderIssue: vi.fn(async () => ({ ok: false as const, code: 'clock-only' as const })),
    ladderRecordMoleHit: vi.fn(async () => ({ ok: false as const, code: 'invalid-nonce' as const })),
    ladderSubmit: vi.fn(async () => ({ ok: false as const, code: 'invalid-nonce' as const })),
    ladderState: vi.fn(async () => null),
  };
}

describe('canonical typed host adapter', () => {
  test('maps host list, view, register, QR, copy, and history shapes exactly', async () => {
    const host = fakeHost();
    const bridge = createCanonicalAuthenticatorBridge(host);
    await expect(bridge.list('Example')).resolves.toMatchObject({ ok: true, value: [{ id: 'entry-1' }] });
    await expect(bridge.view('entry-1')).resolves.toMatchObject({ ok: true, value: { currentCode: '123 456' } });
    await expect(bridge.register({ kind: 'otpauth-uri', value: 'otpauth://totp/E:a', confirmationCode: '123456' })).resolves.toMatchObject({ ok: true, value: { id: 'entry-1' } });
    const qr = await bridge.qrFor({ issuer: 'E', account: 'a', secretBase32: 'JBSWY3DPEHPK3PXP' });
    expect(qr).toMatchObject({ ok: true, value: { uri: 'otpauth://totp/E:a', matrix: { quietZone: 4, renderedSize: 45 } } });
    if (qr.ok) expect(qr.value.matrix).not.toHaveProperty('uri');
    await expect(bridge.copyCurrentCode('entry-1')).resolves.toMatchObject({ ok: true, value: { code: '123456' } });
    await expect(bridge.historyList()).resolves.toMatchObject({ ok: true, value: [] });
    expect(host.list).toHaveBeenCalledWith('Example');
    expect(host.view).toHaveBeenCalledWith('entry-1');
  });

  test('maps the mole route without accepting renderer timestamps or hit arrays', async () => {
    const host = fakeHost();
    const bridge = createCanonicalUnlockLadderBridge(host);
    await expect(bridge.issue('lock-1')).resolves.toMatchObject({ ok: false, code: 'clock-only' });
    await expect(bridge.recordMoleHit('lock-1', 'nonce-1', 3)).resolves.toMatchObject({ ok: false, code: 'invalid-nonce' });
    await expect(bridge.submit('lock-1', 'nonce-1', { kind: 'mole-round' })).resolves.toMatchObject({ ok: false, code: 'invalid-nonce' });
    expect(host.ladderRecordMoleHit).toHaveBeenCalledWith('lock-1', 'nonce-1', 3);
    expect(host.ladderSubmit).toHaveBeenCalledWith('lock-1', 'nonce-1', { kind: 'mole-round' });
  });

  test('exposes the stable budget and School-mode lockout seam', async () => {
    const host = fakeHost();
    const bridge = createCanonicalUnlockLadderBridge(host);
    await bridge.recordLockout('lock-1', { budgetKey: 'unlock-ladder-budget:v1:account-1', schoolMode: true, waitingUntilMs: 60_000, remainingAttempts: 2, consecutiveLockouts: 1 });
    expect(host.ladderRecordLockout).toHaveBeenCalledWith('lock-1', expect.objectContaining({ budgetKey: 'unlock-ladder-budget:v1:account-1', schoolMode: true }));
  });
});

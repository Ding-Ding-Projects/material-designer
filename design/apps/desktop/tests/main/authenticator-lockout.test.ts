import { describe, expect, test } from 'vitest';

import { AuthenticatorDestination } from '../../src/main/authenticator/destination.js';
import { UnavailableSecretVault } from '../../src/main/authenticator/electron-vault.js';
import {
  buildOtpauthUri,
  decodeBase32,
  decodeLocalQr,
  encodeBase32,
  encodeLocalQr,
  hotp,
  nextTotp,
  parseOtpauthUri,
  secondsRemaining,
  totp,
  verifyLocalQrParity,
} from '../../src/main/authenticator/protocol.js';
import { AuthenticatorStore, type AuthenticatorEntry, type AuthenticatorMetadataStore, type SecretVault } from '../../src/main/authenticator/store.js';
import { DurableUnlockLadderHost, JsonUnlockLadderPersistence, UnlockLadderHost, stableLadderBudgetKey, type LadderClock, type LadderRandom } from '../../src/main/lockout/service.js';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('local authenticator protocol', () => {
  test('round-trips strict Base32 and refuses non-zero trailing bits', () => {
    const bytes = Uint8Array.from([0x48, 0x65, 0x6c, 0x6c, 0x6f]);
    expect(decodeBase32(encodeBase32(bytes))).toEqual(bytes);
    expect(() => decodeBase32('AB')).toThrow(/trailing bits/iu);
  });

  test('builds and decodes local otpauth QR matrices for all masks', () => {
    const parameters = { issuer: 'Example', account: 'designer@example.invalid', secret: decodeBase32('JBSWY3DPEHPK3PXP'), algorithm: 'SHA-1' as const, digits: 6 as const, period: 30 };
    const uri = buildOtpauthUri(parameters);
    expect(parseOtpauthUri(uri)).toMatchObject({ issuer: 'Example', account: parameters.account, algorithm: 'SHA-1', digits: 6, period: 30 });
    for (const mask of [0, 1, 2, 3, 4, 5, 6, 7] as const) {
      const matrix = encodeLocalQr(uri, mask);
      expect(decodeLocalQr(matrix)).toBe(uri);
      expect(verifyLocalQrParity(matrix)).toBe(true);
      expect(matrix.renderedSize).toBe(matrix.size + 8);
      expect(matrix.renderedModules.slice(0, 4).flat().every((cell) => !cell)).toBe(true);
      expect(matrix.renderedModules.slice(-4).flat().every((cell) => !cell)).toBe(true);
      expect(matrix.renderedModules.every((row) => row.slice(0, 4).every((cell) => !cell) && row.slice(-4).every((cell) => !cell))).toBe(true);
    }
    const shortUri = buildOtpauthUri({ ...parameters, issuer: 'E', account: 'a' });
    const shortMatrix = encodeLocalQr(shortUri);
    expect(shortMatrix.version).toBe(5);
    expect(decodeLocalQr(shortMatrix)).toBe(shortUri);
  });

  test('matches RFC 4226 and RFC 6238 SHA-1, SHA-256, and SHA-512 vectors', () => {
    const secret = new TextEncoder().encode('12345678901234567890');
    expect(hotp(secret, 0n, 'SHA-1', 6)).toBe('755224');
    expect(totp({ secret, algorithm: 'SHA-1', digits: 8, period: 30 }, 59_000)).toBe('94287082');
    expect(totp({ secret: new TextEncoder().encode('12345678901234567890123456789012'), algorithm: 'SHA-256', digits: 8, period: 30 }, 59_000)).toBe('46119246');
    expect(totp({ secret: new TextEncoder().encode('1234567890123456789012345678901234567890123456789012345678901234'), algorithm: 'SHA-512', digits: 8, period: 30 }, 59_000)).toBe('90693936');
    expect(secondsRemaining(30, 59_000)).toBe(1);
    expect(nextTotp({ secret, algorithm: 'SHA-1', digits: 8, period: 30 }, 59_000)).toBe('37359152');
  });

  test('runs the complete RFC schedules at six, seven, and eight digits', () => {
    const schedules = [
      { secret: new TextEncoder().encode('12345678901234567890'), algorithm: 'SHA-1' as const, values: ['94287082', '07081804', '14050471', '89005924', '69279037', '65353130'] },
      { secret: new TextEncoder().encode('12345678901234567890123456789012'), algorithm: 'SHA-256' as const, values: ['46119246', '68084774', '67062674', '91819424', '90698825', '77737706'] },
      { secret: new TextEncoder().encode('1234567890123456789012345678901234567890123456789012345678901234'), algorithm: 'SHA-512' as const, values: ['90693936', '25091201', '99943326', '93441116', '38618901', '47863826'] },
    ];
    const times = [59, 1_111_111_109, 1_111_111_111, 1_234_567_890, 2_000_000_000, 20_000_000_000];
    for (const schedule of schedules) for (const [index, expected] of schedule.values.entries()) {
      const nowMs = times[index]! * 1_000;
      for (const digits of [6, 7, 8] as const) expect(totp({ secret: schedule.secret, algorithm: schedule.algorithm, digits, period: 30 }, nowMs)).toBe(expected.slice(-digits));
    }
    const hotpExpected = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];
    for (const [counter, expected] of hotpExpected.entries()) expect(hotp(new TextEncoder().encode('12345678901234567890'), BigInt(counter), 'SHA-1', 6)).toBe(expected);
  });

  test('rejects duplicate URI parameters and malformed QR matrices', () => {
    expect(() => parseOtpauthUri('otpauth://totp/E:a?secret=JBSWY3DPEHPK3PXP&secret=MZXW6YTBOI======')).toThrow(/repeats/iu);
    expect(() => parseOtpauthUri('otpauth://totp/E:a?secret=JBSWY3DPEHPK3PXP&foo=1&foo=2')).toThrow(/repeats/iu);
    expect(() => decodeLocalQr([[true, false], [false, true]])).toThrow(/bounded version/iu);
    const parameters = { issuer: 'E', account: 'a', secret: decodeBase32('JBSWY3DPEHPK3PXP'), algorithm: 'SHA-1' as const, digits: 6 as const, period: 30 };
    const matrix = encodeLocalQr(buildOtpauthUri(parameters));
    const tampered = matrix.modules.map((row) => row.slice());
    tampered[20]![20] = !tampered[20]![20];
    expect(verifyLocalQrParity(tampered)).toBe(false);
    expect(() => decodeLocalQr(matrix.renderedModules)).toThrow(/bounded version/iu);
  });
});

describe('authenticator destination and vault-only store', () => {
  class MemoryVault implements SecretVault {
    readonly kind = 'operating-system-vault' as const;
    readonly values = new Map<string, Uint8Array>();
    async put(key: string, value: Uint8Array) { this.values.set(key, value.slice()); }
    async get(key: string) { return this.values.get(key)?.slice() ?? null; }
    async delete(key: string) { this.values.delete(key); }
  }
  class MemoryMetadata implements AuthenticatorMetadataStore {
    entries: AuthenticatorEntry[] = [];
    async read() { return this.entries.map((entry) => ({ ...entry })); }
    async write(entries: AuthenticatorEntry[]) { this.entries = entries.map((entry) => ({ ...entry })); }
  }

  test('requires pairing confirmation and keeps the secret out of metadata/export', async () => {
    const metadata = new MemoryMetadata();
    const vault = new MemoryVault();
    const store = await AuthenticatorStore.open({ metadata, vault, id: () => 'entry-1' });
    const now = 1_700_000_000_000;
    const destination = new AuthenticatorDestination({ store, now: () => now, qrDecoder: { decode: () => '' } });
    expect(destination.generateSecret()).toMatch(/^[A-Z2-7]+$/u);
    const parameters = { issuer: 'Example', account: 'designer@example.invalid', secret: decodeBase32('JBSWY3DPEHPK3PXP'), algorithm: 'SHA-1' as const, digits: 6 as const, period: 30 };
    const input = { kind: 'manual' as const, value: { issuer: parameters.issuer, account: parameters.account, secret: 'JBSWY3DPEHPK3PXP' }, confirmationCode: '000000' };
    await expect(destination.register(input)).rejects.toThrow(/current authenticator code/iu);
    const entry = await destination.register({ ...input, confirmationCode: totp(parameters, now) });
    expect(await store.secret(entry.id)).toEqual(parameters.secret);
    expect(metadata.entries[0]).not.toHaveProperty('secret');
    expect(store.exportPublic()).toMatchObject({ secretsOmitted: true });
    await expect(store.exportCleartext([entry.id], { kind: 'super-confirmation', isValid: () => false })).rejects.toThrow(/super confirmation/iu);
    await expect(store.exportCleartext([entry.id], { kind: 'super-confirmation', isValid: () => true })).resolves.toMatchObject({ entries: [{ secret: 'JBSWY3DPEHPK3PXP' }] });
  });

  test('reports camera unavailability and provides grouped code views', async () => {
    const metadata = new MemoryMetadata();
    const vault = new MemoryVault();
    const store = await AuthenticatorStore.open({ metadata, vault, id: () => 'entry-1' });
    const now = 1_700_000_000_000;
    const destination = new AuthenticatorDestination({ store, now: () => now, qrDecoder: { decode: () => '' }, camera: { available: false, read: async () => '' } });
    await expect(destination.register({ kind: 'camera', confirmationCode: '000000' })).rejects.toThrow(/Camera QR capture is unavailable/iu);
    const parameters = { issuer: 'Example', account: 'designer@example.invalid', secret: decodeBase32('JBSWY3DPEHPK3PXP'), algorithm: 'SHA-1' as const, digits: 6 as const, period: 30 };
    const entry = await destination.register({ kind: 'manual', value: { issuer: parameters.issuer, account: parameters.account, secret: 'JBSWY3DPEHPK3PXP' }, confirmationCode: totp(parameters, now) });
    const view = await destination.view(entry.id);
    expect(view.currentCode).toMatch(/^\d{3} \d{3}$/u);
    expect(view.secondsRemaining).toBeGreaterThanOrEqual(1);
    expect(view.secondsRemaining).toBeLessThanOrEqual(30);
  });

  test('fails closed when the operating-system vault is unavailable', async () => {
    const vault = new UnavailableSecretVault();
    await expect(vault.put('authenticator:entry', Uint8Array.from([1, 2, 3]))).rejects.toThrow(/credential vault is unavailable/iu);
  });
});

describe('host-owned unlock ladder', () => {
  class FakeClock implements LadderClock { value = 1_000_000; now() { return this.value; } }
  class FakeRandom implements LadderRandom { next = 0; uuid() { this.next += 1; return `nonce-${this.next}`; } integer(maxExclusive: number) { return this.next++ % maxExclusive; } }

  test('School mode starts at sums and clears only the wait', () => {
    const clock = new FakeClock();
    const host = new UnlockLadderHost({ clock, random: new FakeRandom() });
    const initial = host.recordLockout('lock', { waitingUntilMs: clock.value + 60_000, remainingAttempts: 2, consecutiveLockouts: 4, schoolMode: true });
    const challenge = host.issue('lock');
    expect(challenge).toMatchObject({ stage: 'sums' });
    if ('nonce' in challenge && challenge.sums) {
      const result = host.submit('lock', challenge.nonce, challenge.sums.map((sum) => sum.left + sum.right));
      expect(result).toMatchObject({ ok: true, clearedWait: true });
      expect(host.state('lock')).toMatchObject({ waitingUntilMs: clock.value, remainingAttempts: initial.remainingAttempts, consecutiveLockouts: initial.consecutiveLockouts });
    }
  });

  test('five wrong dishes escalate to sums without refunding attempts', () => {
    const clock = new FakeClock();
    const host = new UnlockLadderHost({ clock, random: new FakeRandom() });
    host.recordLockout('lock', { waitingUntilMs: clock.value + 60_000, remainingAttempts: 3, consecutiveLockouts: 2 });
    for (let index = 0; index < 5; index++) { const challenge = host.issue('lock'); expect(challenge).toMatchObject({ stage: 'dish' }); if ('nonce' in challenge) expect(host.submit('lock', challenge.nonce, 'wrong')).toMatchObject({ ok: false, code: 'wrong-answer' }); }
    expect(host.state('lock')).toMatchObject({ stage: 'sums', remainingAttempts: 3 });
  });

  test('consumes mole nonces before grading and rejects early replay', () => {
    const clock = new FakeClock();
    const host = new UnlockLadderHost({ clock, random: new FakeRandom() });
    host.recordLockout('lock', { waitingUntilMs: clock.value + 60_000, remainingAttempts: 3, consecutiveLockouts: 1 });
    for (let index = 0; index < 5; index++) { const challenge = host.issue('lock'); if ('nonce' in challenge) host.submit('lock', challenge.nonce, 'wrong'); }
    const sums = host.issue('lock');
    if ('nonce' in sums && sums.sums) host.submit('lock', sums.nonce, sums.sums.map((sum) => sum.left + sum.right + 1));
    const mole = host.issue('lock');
    expect(mole).toMatchObject({ stage: 'mole' });
    if ('nonce' in mole) {
      expect(host.submit('lock', mole.nonce, [])).toMatchObject({ ok: false, code: 'early-submit' });
      expect(host.submit('lock', mole.nonce, [])).toMatchObject({ ok: false, code: 'already-used' });
    }
  });

  test('records mole hits through the host with exact visible cells and one-hit state', () => {
    const clock = new FakeClock();
    const host = new UnlockLadderHost({ clock, random: new FakeRandom() });
    host.recordLockout('lock', { waitingUntilMs: clock.value + 60_000, remainingAttempts: 3, consecutiveLockouts: 1 });
    for (let index = 0; index < 5; index++) { const challenge = host.issue('lock'); if ('nonce' in challenge) host.submit('lock', challenge.nonce, 'wrong'); }
    const sums = host.issue('lock');
    if ('nonce' in sums && sums.sums) host.submit('lock', sums.nonce, sums.sums.map((sum) => sum.left + sum.right + 1));
    const mole = host.issue('lock');
    expect(mole).toMatchObject({ stage: 'mole' });
    if (!('nonce' in mole) || !mole.moles) return;
    clock.value = mole.moles[0]!.visibleFromMs;
    expect(host.recordMoleHit('lock', mole.nonce, mole.moles[0]!.cell)).toMatchObject({ ok: true, hitCount: 1 });
    expect(host.recordMoleHit('lock', mole.nonce, mole.moles[0]!.cell)).toMatchObject({ ok: false, code: 'duplicate-mole' });
    expect(host.recordMoleHit('lock', mole.nonce, 24)).toMatchObject({ ok: false, code: 'mole-not-visible' });
    clock.value = (mole.startedAtMs ?? clock.value) + 5_000;
    expect(host.submit('lock', mole.nonce, [{ id: 'renderer-supplied', cell: 0, atMs: 0 }])).toMatchObject({ ok: false, code: 'invalid-answer' });
  });

  test('shares the three-use rolling budget across lockouts', () => {
    const clock = new FakeClock();
    let next = 0;
    const host = new UnlockLadderHost({ clock, random: { uuid: () => `nonce-${++next}`, integer: () => 0 } });
    for (let index = 0; index < 3; index++) { host.recordLockout(`lock-${index}`, { budgetKey: 'account', waitingUntilMs: clock.value + 60_000, remainingAttempts: 2, consecutiveLockouts: index + 1 }); const challenge = host.issue(`lock-${index}`); if ('nonce' in challenge) expect(host.submit(`lock-${index}`, challenge.nonce, 0)).toMatchObject({ ok: true, clearedWait: true }); }
    host.recordLockout('lock-3', { budgetKey: 'account', waitingUntilMs: clock.value + 60_000, remainingAttempts: 2, consecutiveLockouts: 4 });
    expect(host.issue('lock-3')).toMatchObject({ ok: false, code: 'budget-exhausted' });
  });

  test('restores lockout state without restoring a challenge nonce', () => {
    const clock = new FakeClock();
    const host = new UnlockLadderHost({ clock, random: { uuid: () => 'nonce-1', integer: () => 0 } });
    host.recordLockout('lock', { budgetKey: 'account', waitingUntilMs: clock.value + 60_000, remainingAttempts: 2, consecutiveLockouts: 3 });
    host.issue('lock');
    const restored = new UnlockLadderHost({ clock, random: { uuid: () => 'nonce-2', integer: () => 0 } });
    restored.restoreState(host.exportState());
    expect(restored.issue('lock')).toMatchObject({ stage: 'dish' });
    expect(restored.submit('lock', 'nonce-1', 0)).toMatchObject({ ok: false, code: 'invalid-nonce' });
  });

  test('uses a stable budget identity and atomically persists lockout state', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'auth-ladder-persistence-'));
    try {
      const path = join(directory, 'state.json');
      const persistence = new JsonUnlockLadderPersistence(path);
      const snapshot = { version: 1 as const, budgets: { [stableLadderBudgetKey('account-1')]: { windowStartedAtMs: 1_000_000, uses: 2 } }, lockouts: {} };
      await persistence.save(snapshot);
      expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(snapshot);
      expect(await persistence.load()).toEqual(snapshot);
      expect(stableLadderBudgetKey('account-1')).toBe('unlock-ladder-budget:v1:account-1');
      expect(() => stableLadderBudgetKey('')).toThrow(/identity/iu);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test('rolls back in-memory lockout state when durable persistence rejects a mutation', async () => {
    const durable = new DurableUnlockLadderHost({ persistence: { load: async () => null, save: async () => { throw new Error('persistence unavailable'); } }, clock: new FakeClock(), random: { uuid: () => 'nonce-1', integer: () => 0 } });
    await expect(durable.recordLockout('lock', { waitingUntilMs: 1_060_000, remainingAttempts: 2, consecutiveLockouts: 1 })).rejects.toThrow(/persistence unavailable/iu);
    await expect(durable.state('lock')).resolves.toBeNull();
  });
});

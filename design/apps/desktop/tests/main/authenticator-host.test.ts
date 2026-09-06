import { describe, expect, test, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { authenticatorPersistenceFailure, DesktopAuthenticatorHost } from '../../src/main/authenticator/host.js';
import { AuthenticatorRollbackIncompleteError } from '../../src/main/authenticator/store.js';
import { CredentialVaultUnavailableError, type OperatingSystemCredentialVault } from '../../src/main/authenticator/electron-vault.js';
import { buildOtpauthJson, decodeBase32, totp } from '../../src/main/authenticator/protocol.js';

class MemoryCredentialVault implements OperatingSystemCredentialVault {
  readonly kind = 'operating-system-vault' as const;
  readonly values = new Map<string, Uint8Array>();
  isAvailable() { return true; }
  async put(key: string, value: Uint8Array) { this.values.set(key, value.slice()); }
  async get(key: string) { return this.values.get(key)?.slice() ?? null; }
  async delete(key: string) { this.values.delete(key); }
  async seal(value: Uint8Array, aad = '') { return new TextEncoder().encode(`${aad}\n${Buffer.from(value).toString('base64')}`); }
  async unseal(value: Uint8Array, aad = '') { const [actual, payload] = new TextDecoder().decode(value).split('\n'); if (actual !== aad || !payload) throw new Error('AAD mismatch'); return new Uint8Array(Buffer.from(payload, 'base64')); }
}

class WriteUnavailableCredentialVault extends MemoryCredentialVault {
  override async put(_key: string, _value: Uint8Array): Promise<void> { throw new CredentialVaultUnavailableError(); }
}

describe('feature-owned authenticator host seam', () => {
  test('reports incomplete authenticator rollback through the generic persistence failure shape', () => {
    const result = authenticatorPersistenceFailure<void>(
      new AuthenticatorRollbackIncompleteError(new Error('vault deletion failed'), true, 1),
      'Authenticator entries could not be removed.',
    );
    expect(result).toEqual({
      ok: false,
      code: 'persistence-failed',
      reason: 'Authenticator deletion did not fully recover after the original persistence failure.',
      recovery: 'Authenticator deletion recovery is incomplete. Some listed entries may have no usable secret. After credential vault access returns, re-register entries whose codes cannot display, or restore a verified encrypted history snapshot when one is available.',
      rollbackIncomplete: true,
    });
  });

  test('keeps QR generation local and exposes trusted clock drift', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'auth-host-'));
    try {
      const now = 1_700_000_000_000;
      const host = new DesktopAuthenticatorHost({ directory, credentialVault: new MemoryCredentialVault(), now: () => now, trustedTime: { now: () => now - 120_000 } });
      await expect(host.vaultStatus()).resolves.toMatchObject({ ok: true, value: { available: true } });
      const qr = await host.qrFor({ issuer: 'E', account: 'a', secretBase32: 'JBSWY3DPEHPK3PXP' });
      expect(qr).toMatchObject({ ok: true, value: { quietZone: 4, renderedSize: 45 } });
      const parameters = { issuer: 'Example', account: 'designer@example.invalid', secret: decodeBase32('JBSWY3DPEHPK3PXP'), algorithm: 'SHA-1' as const, digits: 6 as const, period: 30 };
      const registered = await host.register({ kind: 'manual', issuer: parameters.issuer, account: parameters.account, secretBase32: 'JBSWY3DPEHPK3PXP', confirmationCode: totp(parameters, now) });
      expect(registered).toMatchObject({ ok: true, value: { entry: { id: expect.any(String) } } });
      if (registered.ok) await expect(host.view(registered.value.entry.id)).resolves.toMatchObject({ ok: true, value: { entry: { clockWarning: expect.stringContaining('120 seconds') } } });
      const json = buildOtpauthJson(parameters);
      await expect(host.register({ kind: 'otpauth-json', value: json, confirmationCode: totp(parameters, now) })).resolves.toMatchObject({ ok: true, value: { entry: { account: parameters.account } } });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test('keeps the host unavailable when no real credential vault is supplied', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'auth-host-unavailable-'));
    try {
      const host = new DesktopAuthenticatorHost({ directory });
      await expect(host.vaultStatus()).resolves.toMatchObject({ ok: false, code: 'vault-unavailable' });
      await expect(host.register({ kind: 'manual', issuer: 'E', account: 'a', secretBase32: 'JBSWY3DPEHPK3PXP', confirmationCode: '000000' })).resolves.toMatchObject({ ok: false, code: 'vault-unavailable' });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test('classifies a vault write refusal as unavailable without reclassifying malformed registration input', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'auth-host-write-unavailable-'));
    try {
      const now = 1_700_000_000_000;
      const parameters = { issuer: 'Example', account: 'designer@example.invalid', secret: decodeBase32('JBSWY3DPEHPK3PXP'), algorithm: 'SHA-1' as const, digits: 6 as const, period: 30 };
      const host = new DesktopAuthenticatorHost({ directory, credentialVault: new WriteUnavailableCredentialVault(), now: () => now });
      await expect(host.register({ kind: 'manual', issuer: parameters.issuer, account: parameters.account, secretBase32: 'JBSWY3DPEHPK3PXP', confirmationCode: totp(parameters, now) })).resolves.toMatchObject({ ok: false, code: 'vault-unavailable' });
      await expect(host.register({ kind: 'manual', issuer: parameters.issuer, account: parameters.account, secretBase32: '!!!!!', confirmationCode: '000000' })).resolves.toMatchObject({ ok: false, code: 'invalid-input' });
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  test('rejects bounded QR metadata before invoking the decoder', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'auth-host-qr-bounds-'));
    const decode = vi.fn(() => 'otpauth://totp/E:a?secret=JBSWY3DPEHPK3PXP');
    try {
      const host = new DesktopAuthenticatorHost({
        directory,
        credentialVault: new MemoryCredentialVault(),
        qrDecoder: { preflight: () => ({ width: 5_000, height: 5_000, frames: 1, decodedBytes: 1 }), decode },
      });
      const result = await host.register({ kind: 'qr-image', bytes: Uint8Array.from([1, 2, 3]), confirmationCode: '000000' });
      expect(result).toMatchObject({ ok: false, code: 'invalid-input' });
      expect(decode).not.toHaveBeenCalled();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

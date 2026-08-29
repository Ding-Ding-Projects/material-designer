import { describe, expect, test } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DesktopAuthenticatorHost } from '../../src/main/authenticator/host.js';
import type { OperatingSystemCredentialVault } from '../../src/main/authenticator/electron-vault.js';
import { decodeBase32, totp } from '../../src/main/authenticator/protocol.js';

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

describe('feature-owned authenticator host seam', () => {
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
});

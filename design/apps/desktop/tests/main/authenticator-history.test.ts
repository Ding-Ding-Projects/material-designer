import { describe, expect, test } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { assertRedacted, PasswordProtectedHistory, type AuthenticatorHistorySnapshot, type HistoryKeyVault } from '../../src/main/authenticator/history.js';
import { SuperConfirmationVerifier } from '../../src/main/authenticator/super-confirmation.js';
import { AuthenticatorStore, type AuthenticatorEntry, type AuthenticatorMetadataStore, type HistoryWriter, type SecretVault } from '../../src/main/authenticator/store.js';
import { decodeBase32 } from '../../src/main/authenticator/protocol.js';

describe('authenticator history safety boundaries', () => {
  test('rejects credential-shaped snapshot fields before encryption', () => {
    expect(() => assertRedacted({ entries: [{ id: 'entry-1', issuer: 'Example' }] })).not.toThrow();
    expect(() => assertRedacted({ entries: [{ secret: 'never' }] })).toThrow(/credential fields/iu);
    expect(() => assertRedacted({ nested: { passwordHash: 'never' } })).toThrow(/credential fields/iu);
  });

  test('consumes a scoped confirmation once and refuses expiry or mismatch', () => {
    const verifier = new SuperConfirmationVerifier();
    const token = verifier.issue('export authenticator history secrets', ['entry-1'], 10_000);
    expect(verifier.consume(token, 'wrong action', ['entry-1'], 10_001)).toBe(false);
    expect(verifier.consume(token, 'export authenticator history secrets', ['entry-1'], 10_001)).toBe(false);
    const second = verifier.issue('export authenticator history secrets', ['entry-1'], 10_000);
    expect(verifier.consume(second, 'export authenticator history secrets', ['entry-1'], 70_001)).toBe(false);
  });

  test('password-protected history records bounded password metadata', async () => {
    const vault: HistoryKeyVault = { seal: async (value) => value, unseal: async (value) => value };
    const directory = await mkdtemp(join(tmpdir(), 'auth-history-'));
    try {
      const manager = await PasswordProtectedHistory.create(directory, vault, 'local-test-password');
      expect(manager.passwordDigestMetadata).toEqual({ saltBytes: 16, digestBytes: 32 });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test('reports a recovery state when a history commit fails after the live metadata save', async () => {
    const values = new Map<string, Uint8Array>();
    const vault: SecretVault = { kind: 'operating-system-vault', put: async (key, value) => { values.set(key, value.slice()); }, get: async (key) => values.get(key)?.slice() ?? null, delete: async (key) => { values.delete(key); }, seal: async (value) => value.slice(), unseal: async (value) => value.slice() };
    const metadata: AuthenticatorMetadataStore = { entries: [], read: async () => metadata.entries, write: async (entries) => { metadata.entries = entries; } };
    const history: HistoryWriter = { append: async () => { throw new Error('history commit unavailable'); } };
    const store = await AuthenticatorStore.open({ metadata, vault, history, id: () => 'entry-1' });
    const parameters = { issuer: 'Example', account: 'designer@example.invalid', secret: decodeBase32('JBSWY3DPEHPK3PXP'), algorithm: 'SHA-1' as const, digits: 6 as const, period: 30 };
    const result = await store.addWithStatus(parameters);
    expect(result.value.id).toBe('entry-1');
    expect(result.historyRecorded).toBe(false);
    expect(result.recovery).toMatch(/history was not recorded/iu);
    expect(metadata.entries).toHaveLength(1);
  });

  test('restores metadata and vault secrets using stable entry-id AAD', async () => {
    const values = new Map<string, Uint8Array>();
    const encode = (value: Uint8Array, aad: string) => new TextEncoder().encode(`${aad}\n${Buffer.from(value).toString('base64')}`);
    const decode = (value: Uint8Array, aad: string) => { const [actual, payload] = new TextDecoder().decode(value).split('\n'); if (actual !== aad || !payload) throw new Error('AAD mismatch'); return new Uint8Array(Buffer.from(payload, 'base64')); };
    const vault: SecretVault = { kind: 'operating-system-vault', put: async (key, value) => { values.set(key, value.slice()); }, get: async (key) => values.get(key)?.slice() ?? null, delete: async (key) => { values.delete(key); }, seal: async (value, aad) => encode(value, aad), unseal: async (value, aad) => decode(value, aad) };
    const metadata: AuthenticatorMetadataStore = { entries: [], read: async () => metadata.entries, write: async (entries) => { metadata.entries = entries; } };
    const snapshots: AuthenticatorHistorySnapshot[] = [];
    const history: HistoryWriter = { append: async (_action, snapshot) => { snapshots.push(snapshot as AuthenticatorHistorySnapshot); } };
    const store = await AuthenticatorStore.open({ metadata, vault, history, id: () => 'entry-1' });
    const parameters = { issuer: 'Example', account: 'designer@example.invalid', secret: decodeBase32('JBSWY3DPEHPK3PXP'), algorithm: 'SHA-1' as const, digits: 6 as const, period: 30 };
    await store.add(parameters);
    expect(snapshots).toHaveLength(1);
    await vault.put('authenticator:entry-1', decodeBase32('MZXW6YTBOI======'));
    const status = await store.restoreSnapshot(snapshots[0]!);
    expect(status.historyRecorded).toBe(true);
    expect(await store.secret('entry-1')).toEqual(parameters.secret);
    const tampered = { ...snapshots[0]!, secrets: snapshots[0]!.secrets.map((secret) => ({ ...secret, aad: 'wrong-aad' })) };
    await expect(store.restoreSnapshot(tampered)).rejects.toThrow(/AAD/iu);
  });

  test('rolls back metadata and vault values when a removal write fails', async () => {
    const values = new Map<string, Uint8Array>();
    const secret = decodeBase32('JBSWY3DPEHPK3PXP');
    let failDelete = true;
    const vault: SecretVault = { kind: 'operating-system-vault', put: async (key, value) => { values.set(key, value.slice()); }, get: async (key) => values.get(key)?.slice() ?? null, delete: async (key) => { if (failDelete) { failDelete = false; throw new Error('vault write unavailable'); } values.delete(key); }, seal: async (value, aad = '') => new TextEncoder().encode(`${aad}\n${Buffer.from(value).toString('base64')}`), unseal: async (value, aad = '') => { const [actual, payload] = new TextDecoder().decode(value).split('\n'); if (actual !== aad || !payload) throw new Error('AAD mismatch'); return new Uint8Array(Buffer.from(payload, 'base64')); } };
    const metadata: AuthenticatorMetadataStore = { entries: [], read: async () => metadata.entries, write: async (entries) => { metadata.entries = entries; } };
    const store = await AuthenticatorStore.open({ metadata, vault, id: () => 'entry-1' });
    await store.add({ issuer: 'Example', account: 'designer@example.invalid', secret, algorithm: 'SHA-1', digits: 6, period: 30 });
    await expect(store.remove(['entry-1'])).rejects.toThrow(/vault write unavailable/iu);
    expect(store.list()).toHaveLength(1);
    expect(await store.secret('entry-1')).toEqual(secret);
  });
});

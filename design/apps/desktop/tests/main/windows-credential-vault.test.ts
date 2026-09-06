import { describe, expect, test } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

import { CredentialManagerBackend, WindowsCredentialVault, migrateLegacyElectronVault, type WindowsCredentialBackend } from '../../src/main/authenticator/windows-credential-vault.js';

class DeterministicCredentialBackend implements WindowsCredentialBackend {
  readonly available: boolean;
  readonly values = new Map<string, Uint8Array>();
  constructor(available = true) { this.available = available; }
  async read(name: string): Promise<Uint8Array | null> { return this.values.get(name)?.slice() ?? null; }
  async write(name: string, value: Uint8Array): Promise<void> { this.values.set(name, value.slice()); }
  async remove(name: string): Promise<void> { this.values.delete(name); }
}

const deterministicRandom = (size: number) => Uint8Array.from({ length: size }, (_value, index) => (index + 17) % 256);

describe('Windows Credential Manager authenticator vault', () => {
  test('uses the operating-system backend for secret persistence and returns defensive copies', async () => {
    const backend = new DeterministicCredentialBackend();
    const vault = new WindowsCredentialVault({ backend, random: deterministicRandom });
    const transient = Uint8Array.from([1, 2, 3]);
    await vault.put('authenticator:entry-1', transient);
    transient[0] = 99;
    const read = await vault.get('authenticator:entry-1');
    expect(read).toEqual(Uint8Array.from([1, 2, 3]));
    if (read) read[0] = 88;
    await expect(vault.get('authenticator:entry-1')).resolves.toEqual(Uint8Array.from([1, 2, 3]));
    await vault.delete('authenticator:entry-1');
    await expect(vault.get('authenticator:entry-1')).resolves.toBeNull();
    expect(vault.isAvailable()).toBe(true);
  });

  test('persists the non-exported encryption key through a restart and binds ciphertext to AAD', async () => {
    const backend = new DeterministicCredentialBackend();
    const first = new WindowsCredentialVault({ backend, random: deterministicRandom });
    const sealed = await first.seal(Uint8Array.from([4, 5, 6]), 'authenticator-entry:entry-1:v1');
    const restarted = new WindowsCredentialVault({ backend, random: deterministicRandom });
    await expect(restarted.unseal(sealed, 'authenticator-entry:entry-1:v1')).resolves.toEqual(Uint8Array.from([4, 5, 6]));
    await expect(restarted.unseal(sealed, 'authenticator-entry:entry-2:v1')).rejects.toThrow();
    expect([...backend.values.keys()]).toContain('__material_designer_authenticator_master_key_v1');
  });

  test('fails closed for unavailable backends, invalid names, oversized values, and malformed encrypted input', async () => {
    const unavailable = new WindowsCredentialVault({ backend: new DeterministicCredentialBackend(false) });
    expect(unavailable.isAvailable()).toBe(false);
    await expect(unavailable.put('authenticator:entry-1', Uint8Array.from([1]))).rejects.toThrow('unavailable');
    const vault = new WindowsCredentialVault({ backend: new DeterministicCredentialBackend(), random: deterministicRandom });
    await expect(vault.put('../outside', Uint8Array.from([1]))).rejects.toThrow('unavailable');
    await expect(vault.put('authenticator:entry-1', new Uint8Array(513))).rejects.toThrow('outside the supported bounded size');
    await expect(vault.unseal(Uint8Array.from([0]))).rejects.toThrow('invalid');
  });

  test('rejects a master-key readback mismatch instead of retaining a locally generated fallback', async () => {
    const backend = new DeterministicCredentialBackend();
    let wrote = false;
    backend.read = async (name: string) => name === '__material_designer_authenticator_master_key_v1' && wrote ? new Uint8Array(32).fill(1) : null;
    backend.write = async () => { wrote = true; };
    const vault = new WindowsCredentialVault({ backend, random: deterministicRandom });
    await expect(vault.seal(Uint8Array.from([1]))).rejects.toThrow('could not be verified');
  });

  test('migrates a protected legacy entry only after Credential Manager readback, then removes only that legacy entry', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'auth-vault-migration-'));
    const backend = new DeterministicCredentialBackend();
    const target = new WindowsCredentialVault({ backend, random: deterministicRandom });
    const key = 'authenticator:entry-1';
    const legacyPath = join(directory, `${Buffer.from(key, 'utf8').toString('hex')}.vault`);
    try {
      await writeFile(legacyPath, Buffer.from(Buffer.from([7, 8, 9]).toString('base64')).toString('base64'), 'utf8');
      const published: string[] = [];
      const result = await migrateLegacyElectronVault({ directory, keys: [key], target, publishMetadata: async (migratedKey) => { published.push(migratedKey); }, legacySafeStorage: { isEncryptionAvailable: () => true, decryptString: (value) => value.toString('utf8') } });
      expect(result).toEqual({ migrated: [key], skipped: [] });
      expect(published).toEqual([key]);
      await expect(target.get(key)).resolves.toEqual(Uint8Array.from([7, 8, 9]));
      await expect(migrateLegacyElectronVault({ directory, keys: [key], target, publishMetadata: async () => undefined, legacySafeStorage: { isEncryptionAvailable: () => true, decryptString: () => '' } })).resolves.toEqual({ migrated: [], skipped: [key] });
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  test('keeps a legacy source entry when atomic metadata publication fails', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'auth-vault-migration-retain-'));
    const key = 'authenticator:entry-1';
    const legacyPath = join(directory, `${Buffer.from(key, 'utf8').toString('hex')}.vault`);
    try {
      await writeFile(legacyPath, Buffer.from(Buffer.from([7, 8, 9]).toString('base64')).toString('base64'), 'utf8');
      const target = new WindowsCredentialVault({ backend: new DeterministicCredentialBackend(), random: deterministicRandom });
      await expect(migrateLegacyElectronVault({ directory, keys: [key], target, publishMetadata: async () => { throw new Error('metadata') }, legacySafeStorage: { isEncryptionAvailable: () => true, decryptString: (value) => value.toString('utf8') } })).rejects.toThrow('metadata');
      await expect(readFile(legacyPath, 'utf8')).resolves.toBeTruthy();
      await expect(migrateLegacyElectronVault({ directory, keys: [key], target, publishMetadata: async () => undefined, legacySafeStorage: { isEncryptionAvailable: () => true, decryptString: (value) => value.toString('utf8') } })).resolves.toEqual({ migrated: [key], skipped: [] });
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  test.skipIf(process.platform !== 'win32')('uses the actual Credential Manager backend under a disposable task namespace', async () => {
    const serviceName = `MaterialDesigner/authenticator/test-${randomUUID()}`;
    const backend = new CredentialManagerBackend(serviceName);
    const key = `authenticator:test-${randomUUID()}`;
    try {
      await backend.write(key, Uint8Array.from([1, 2, 3]));
      const independentReader = new CredentialManagerBackend(serviceName);
      await expect(independentReader.read(key)).resolves.toEqual(Uint8Array.from([1, 2, 3]));
    } finally { await backend.remove(key); }
  });
});

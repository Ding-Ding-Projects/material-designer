import { describe, expect, test } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { assertRedacted, PasswordProtectedHistory, type HistoryKeyVault } from '../../src/main/authenticator/history.js';
import { SuperConfirmationVerifier } from '../../src/main/authenticator/super-confirmation.js';

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
});

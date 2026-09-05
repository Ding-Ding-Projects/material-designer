import { describe, expect, test } from 'vitest';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { JsonMetadata } from '../../src/main/authenticator/host.js';
import { replaceFileAtomically } from '../../src/main/authenticator/persistence.js';
import { AuthenticatorRollbackIncompleteError, AuthenticatorStore, type AuthenticatorEntry, type AuthenticatorMetadataStore, type SecretVault } from '../../src/main/authenticator/store.js';

const entries = (): AuthenticatorEntry[] => [
  { id: 'entry-a', issuer: 'Example', account: 'a@example.invalid', algorithm: 'SHA-1', digits: 6, period: 30, group: null, order: 0 },
  { id: 'entry-b', issuer: 'Example', account: 'b@example.invalid', algorithm: 'SHA-1', digits: 6, period: 30, group: null, order: 1 },
];

class MemoryMetadata implements AuthenticatorMetadataStore {
  entries = entries();
  rejectNext = false;

  async read(): Promise<AuthenticatorEntry[]> { return this.entries.map((entry) => ({ ...entry })); }
  async write(next: AuthenticatorEntry[]): Promise<void> {
    if (this.rejectNext) {
      this.rejectNext = false;
      throw new Error('metadata replacement rejected');
    }
    this.entries = next.map((entry) => ({ ...entry }));
  }
}

const vault = (): SecretVault => ({
  kind: 'operating-system-vault',
  put: async () => undefined,
  get: async () => new Uint8Array([1]),
  delete: async () => undefined,
});

describe('authenticator persistence boundaries', () => {
  test('writes metadata through the real filesystem and removes its unique temporary file', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'authenticator-metadata-'));
    const path = join(directory, 'metadata.json');
    try {
      const metadata = new JsonMetadata(path);
      await metadata.write(entries());
      expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject(entries());
      expect((await readdir(directory)).filter((name) => name.endsWith('.tmp'))).toEqual([]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test('does not publish or later persist a rejected reorder or group candidate', async () => {
    const metadata = new MemoryMetadata();
    const store = await AuthenticatorStore.open({ metadata, vault: vault() });

    metadata.rejectNext = true;
    await expect(store.reorder(['entry-b', 'entry-a'])).rejects.toThrow(/replacement rejected/iu);
    expect(store.list().map((entry) => entry.id)).toEqual(['entry-a', 'entry-b']);

    metadata.rejectNext = true;
    await expect(store.setGroup(['entry-b'], 'Saved')).rejects.toThrow(/replacement rejected/iu);
    expect(store.list().find((entry) => entry.id === 'entry-b')?.group).toBeNull();

    await store.reorder(['entry-b', 'entry-a']);
    const reopened = await AuthenticatorStore.open({ metadata, vault: vault() });
    expect(reopened.list()).toMatchObject([
      { id: 'entry-b', group: null, order: 0 },
      { id: 'entry-a', group: null, order: 1 },
    ]);
  });

  test('serializes conflicting reorder and group mutations against the durable candidate', async () => {
    const metadata = new MemoryMetadata();
    const store = await AuthenticatorStore.open({ metadata, vault: vault() });

    await Promise.all([
      store.reorder(['entry-b', 'entry-a']),
      store.setGroup(['entry-b'], 'Priority'),
    ]);

    expect(store.list()).toMatchObject([
      { id: 'entry-b', group: 'Priority', order: 0 },
      { id: 'entry-a', group: null, order: 1 },
    ]);
    expect((await AuthenticatorStore.open({ metadata, vault: vault() })).list()).toMatchObject([
      { id: 'entry-b', group: 'Priority', order: 0 },
      { id: 'entry-a', group: null, order: 1 },
    ]);
  });

  test('does not record a deletion history event when a later vault deletion rolls the transaction back', async () => {
    const metadata = new MemoryMetadata();
    const values = new Map<string, Uint8Array>([
      ['authenticator:entry-a', new Uint8Array([1])],
      ['authenticator:entry-b', new Uint8Array([2])],
    ]);
    let deleteCalls = 0;
    const localVault: SecretVault = {
      kind: 'operating-system-vault',
      put: async (key, value) => {
        if (key === 'authenticator:entry-a' && deleteCalls >= 2) throw new Error('first secret restoration rejected');
        values.set(key, value.slice());
      },
      get: async (key) => values.get(key)?.slice() ?? null,
      delete: async (key) => {
        deleteCalls += 1;
        if (deleteCalls === 2) throw new Error('second vault deletion rejected');
        values.delete(key);
      },
    };
    const actions: string[] = [];
    const store = await AuthenticatorStore.open({ metadata, vault: localVault, history: { append: async (action) => { actions.push(action); } } });

    const error = await store.remove(['entry-a', 'entry-b']).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(AuthenticatorRollbackIncompleteError);
    expect(error).toMatchObject({
      primaryCause: expect.objectContaining({ message: 'second vault deletion rejected' }),
      metadataRestored: true,
      failedSecretRestorations: 1,
    });
    expect(actions).toEqual([]);
    expect(store.list().map((entry) => entry.id)).toEqual(['entry-a', 'entry-b']);
    expect(await localVault.get('authenticator:entry-a')).toBeNull();
    expect(await localVault.get('authenticator:entry-b')).not.toBeNull();
    expect((await AuthenticatorStore.open({ metadata, vault: localVault })).list().map((entry) => entry.id)).toEqual(['entry-a', 'entry-b']);
  });

  test('retries only transient replacement failures, then preserves the terminal error', async () => {
    const delays: number[] = [];
    let calls = 0;
    await expect(replaceFileAtomically({ rename: async () => {
      calls += 1;
      if (calls < 3) throw Object.assign(new Error('busy'), { code: 'EPERM' });
    } }, 'temporary', 'destination', { delay: async (milliseconds) => { delays.push(milliseconds); } })).resolves.toBeUndefined();
    expect(calls).toBe(3);
    expect(delays).toEqual([25, 50]);

    calls = 0;
    await expect(replaceFileAtomically({ rename: async () => {
      calls += 1;
      throw Object.assign(new Error('access blocked'), { code: 'EACCES' });
    } }, 'temporary', 'destination', { attempts: 2, delay: async () => undefined })).rejects.toThrow(/access blocked/iu);
    expect(calls).toBe(2);

    calls = 0;
    await expect(replaceFileAtomically({ rename: async () => {
      calls += 1;
      throw Object.assign(new Error('destination missing'), { code: 'ENOENT' });
    } }, 'temporary', 'destination', { delay: async () => undefined })).rejects.toThrow(/destination missing/iu);
    expect(calls).toBe(1);
  });
});

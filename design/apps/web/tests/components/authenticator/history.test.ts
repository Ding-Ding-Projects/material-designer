import { describe, expect, test } from 'vitest';

import { AppendOnlyAuthenticatorHistory, type AuthenticatorHistoryCipher, type AuthenticatorHistoryStorage, type StoredHistoryRecord } from '../../../src/components/authenticator/history';

class MemoryCipher implements AuthenticatorHistoryCipher {
  async seal(value: Uint8Array) { return value.slice(); }
  async unseal(value: Uint8Array) { return value.slice(); }
}

class MemoryStorage implements AuthenticatorHistoryStorage {
  records: StoredHistoryRecord[] = [];
  async read() { return this.records.map((record) => ({ ...record })); }
  async append(record: StoredHistoryRecord) { this.records.push({ ...record }); }
}

describe('append-only authenticator history', () => {
  test('encrypts redacted snapshots and omits sensitive fields from ordinary export', async () => {
    const storage = new MemoryStorage();
    const history = new AppendOnlyAuthenticatorHistory({ storage, cipher: new MemoryCipher(), id: () => 'history-1', now: () => new Date('2026-01-01T00:00:00.000Z') });
    await expect(history.append('created', 'Added authenticator entry', { entries: [{ id: 'entry-1', issuer: 'Example' }] })).resolves.toMatchObject({ id: 'history-1', redacted: true });
    const exported = await history.exportRedacted();
    expect(exported).toMatchObject({ version: 1, secretsOmitted: true, records: [{ id: 'history-1' }] });
    expect(storage.records[0]).toHaveProperty('encryptedSnapshot');
    await expect(history.append('created', 'Bad snapshot', { secret: 'never' })).rejects.toThrow(/credential fields/iu);
  });

  test('restores only through validated encrypted records', async () => {
    const storage = new MemoryStorage();
    const history = new AppendOnlyAuthenticatorHistory({ storage, cipher: new MemoryCipher(), id: () => 'history-2', now: () => new Date('2026-01-02T00:00:00.000Z') });
    await history.append('updated', 'Changed group', { entries: [{ id: 'entry-1', group: 'Work' }] });
    await expect(history.restore('history-2')).resolves.toEqual({ entries: [{ id: 'entry-1', group: 'Work' }] });
    await expect(history.restore('unknown')).rejects.toThrow(/unavailable/iu);
  });
});

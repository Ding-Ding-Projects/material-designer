import { describe, expect, it, vi } from 'vitest';

import {
  createLocalStatusFallback,
  createStatusHubClient,
  normalizeStatusSnapshot,
  type StatusSnapshot,
} from '../../src/runtime/status-hub';
import { STATUS_HUB_MOUNT_IDS } from '../../src/components/status/StatusHubCard';

const snapshot: Omit<StatusSnapshot, 'schemaVersion' | 'source'> = {
  sessionId: 'session-1',
  projectId: 'project-1',
  title: 'Build status',
  state: 'running',
  summary: 'One lane is still running.',
  updatedAt: '2026-08-29T12:00:00Z',
  baseline: 'abc123',
  lanes: [
    {
      id: 'lane-1',
      title: 'Web surface',
      state: 'verified',
      summary: 'The surface is ready.',
      evidence: [],
      nextChecks: ['Review the release note.'],
    },
  ],
  evidence: [],
  nextChecks: ['Wait for the build.'],
};

describe('status hub data boundary', () => {
  it('keeps the four integration mount ids explicit', () => {
    expect(STATUS_HUB_MOUNT_IDS).toEqual(['C0', 'C2', 'C7', 'C12']);
  });

  it('normalizes a complete snapshot and rejects another session', () => {
    const normalized = normalizeStatusSnapshot({ ...snapshot, schemaVersion: 1 }, 'session-1');
    expect(normalized?.sessionId).toBe('session-1');
    expect(normalized?.source).toBe('hub');
    expect(normalizeStatusSnapshot({ ...snapshot, schemaVersion: 1 }, 'other-session')).toBeNull();
  });

  it('drops malformed evidence rather than exposing unbounded server values', () => {
    const normalized = normalizeStatusSnapshot({
      ...snapshot,
      schemaVersion: 1,
      evidence: [
        { id: 'e1', label: 'Good', state: 'verified', detail: 'ready' },
        { id: 'bad', label: 'Bad', state: 'made-up' },
      ],
    });
    expect(normalized?.evidence.map((item) => item.id)).toEqual(['e1']);
  });
});

describe('status hub client', () => {
  it('does not report publication when the server withholds acknowledgement', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ acknowledged: false }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const client = createStatusHubClient({ sessionId: 'session-1', fetchImpl });
    const result = await client.publish({ ...snapshot, schemaVersion: 1, source: 'hub' });
    expect(result).toEqual({ ok: true, acknowledged: false, error: 'unavailable' });
  });

  it('keeps credentials out of the request body and returns an acknowledgement revision', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ acknowledged: true, revision: 'r-2' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const client = createStatusHubClient({
      sessionId: 'session-1',
      getAccessToken: () => 'secret-value',
      fetchImpl,
    });
    const result = await client.publish({ ...snapshot, schemaVersion: 1, source: 'hub' });
    expect(result).toEqual({ ok: true, acknowledged: true, revision: 'r-2' });
    const [, init] = fetchImpl.mock.calls[0] ?? [];
    expect(String(init?.body)).not.toContain('secret-value');
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer secret-value');
  });
});

describe('local status fallback', () => {
  it('updates only after its own in-memory acknowledgement', async () => {
    const fallback = createLocalStatusFallback(snapshot);
    const before = await fallback.read();
    expect(before.ok && before.snapshot.source).toBe('local-fallback');
    const result = await fallback.publish({ ...snapshot, schemaVersion: 1, source: 'hub', summary: 'Updated.' });
    expect(result.acknowledged).toBe(true);
    const after = await fallback.read();
    expect(after.ok && after.snapshot.summary).toBe('Updated.');
  });
});

import { describe, expect, it, vi } from 'vitest';

import {
  createLocalStatusFallback,
  createStatusHubClient,
  normalizeStatusSnapshot,
  STATUS_HUB_MAX_BODY_BYTES,
  STATUS_HUB_MAX_EVIDENCE,
  STATUS_HUB_MAX_REPLIES,
  safeIso,
  type StatusSnapshot,
} from '../../src/runtime/status-hub';
import { STATUS_HUB_MOUNT_IDS } from '../../src/components/status/StatusHubCard';

const snapshot: Omit<StatusSnapshot, 'schemaVersion' | 'source' | 'freshness' | 'ageSeconds' | 'lastKnownState'> = {
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

  it('bounds array traversal before mapping and slicing', () => {
    const manyEvidence = Array.from({ length: STATUS_HUB_MAX_EVIDENCE * 3 }, (_, index) => ({
      id: `e-${index}`,
      label: `Evidence ${index}`,
      state: 'verified',
    }));
    const normalized = normalizeStatusSnapshot({ ...snapshot, schemaVersion: 1, evidence: manyEvidence });
    expect(normalized?.evidence).toHaveLength(STATUS_HUB_MAX_EVIDENCE);
  });

  it('marks an old running snapshot stale instead of retaining running as current', () => {
    const normalized = normalizeStatusSnapshot(
      { ...snapshot, schemaVersion: 1 },
      'session-1',
      Date.parse('2026-08-29T13:00:00Z'),
    );
    expect(normalized?.freshness).toBe('stale');
    expect(normalized?.state).toBe('waiting');
    expect(normalized?.lastKnownState).toBe('running');
    expect(normalized?.ageSeconds).toBe(3600);
  });

  it('rejects timestamps whose local calendar fields would roll over', () => {
    expect(safeIso('2024-02-30T12:00:00Z')).toBeUndefined();
    expect(safeIso('2024-02-29T12:00:00Z')).toBe('2024-02-29T12:00:00Z');
    expect(safeIso('2024-01-01T24:00:00Z')).toBeUndefined();
  });
});

describe('status hub client', () => {
  it('allows same-origin and HTTPS, and only allows loopback HTTP when explicitly enabled', () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    expect(createStatusHubClient({ sessionId: 'session-1', fetchImpl }).transportScope).toBe('same-origin');
    expect(createStatusHubClient({ sessionId: 'session-1', baseUrl: 'api/status-hub', fetchImpl }).transportScope).toBe('same-origin');
    expect(createStatusHubClient({ sessionId: 'session-1', baseUrl: 'https://status.example.invalid', fetchImpl }).transportScope).toBe('https');
    expect(() => createStatusHubClient({ sessionId: 'session-1', baseUrl: 'http://127.0.0.1:8099', fetchImpl })).toThrow('same-origin, HTTPS');
    expect(() => createStatusHubClient({ sessionId: 'session-1', baseUrl: 'http://status.example.invalid', getAccessToken: () => { throw new Error('credential callback must not run'); }, fetchImpl })).toThrow('same-origin, HTTPS');
    expect(() => createStatusHubClient({ sessionId: 'session-1', baseUrl: '//status.example.invalid', getAccessToken: () => { throw new Error('credential callback must not run'); }, fetchImpl })).toThrow('protocol-relative');
    expect(() => createStatusHubClient({ sessionId: 'session-1', baseUrl: 'https:\\status.example.invalid', getAccessToken: () => { throw new Error('credential callback must not run'); }, fetchImpl })).toThrow('backslashes');
    expect(() => createStatusHubClient({ sessionId: 'session-1', baseUrl: 'https://[malformed', getAccessToken: () => { throw new Error('credential callback must not run'); }, fetchImpl })).toThrow('malformed');
    expect(createStatusHubClient({ sessionId: 'session-1', baseUrl: 'http://127.0.0.1:8099', allowLoopbackHttp: true, fetchImpl }).transportScope).toBe('loopback-development');
  });

  it('does not report publication when the server withholds acknowledgement', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ acknowledged: false }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const client = createStatusHubClient({ sessionId: 'session-1', fetchImpl });
    const result = await client.publish({ ...snapshot, schemaVersion: 1, source: 'hub' });
    expect(result).toEqual({ ok: true, acknowledged: false, delivered: false, source: 'hub', error: 'unavailable' });
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
    expect(result).toEqual({ ok: true, acknowledged: true, delivered: true, source: 'hub', revision: 'r-2' });
    const [, init] = fetchImpl.mock.calls[0] ?? [];
    expect(String(init?.body)).not.toContain('secret-value');
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer secret-value');
  });

  it('rejects an oversized response body before mapping its contents', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('x'.repeat(STATUS_HUB_MAX_BODY_BYTES + 1), { status: 200 }),
    );
    const client = createStatusHubClient({ sessionId: 'session-1', fetchImpl });
    await expect(client.read()).resolves.toEqual({ ok: false, error: 'unavailable' });
  });

  it('refuses a null response body without a bounded Content-Length', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    const client = createStatusHubClient({ sessionId: 'session-1', fetchImpl });
    await expect(client.read()).resolves.toEqual({ ok: false, error: 'unavailable' });
  });

  it('times out a credential callback before starting the request', async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
      const client = createStatusHubClient({
        sessionId: 'session-1',
        getAccessToken: () => new Promise<string | null>(() => undefined),
        fetchImpl,
        timeoutMs: 500,
      });
      const pending = client.read();
      await vi.advanceTimersByTimeAsync(500);
      await expect(pending).resolves.toEqual({ ok: false, error: 'timed-out' });
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels a response stream that never yields its next chunk', async () => {
    vi.useFakeTimers();
    try {
      const stream = new ReadableStream<Uint8Array>({ pull: () => new Promise(() => undefined) });
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(stream, { status: 200 }));
      const client = createStatusHubClient({ sessionId: 'session-1', fetchImpl, timeoutMs: 500 });
      const pending = client.read();
      await vi.advanceTimersByTimeAsync(500);
      await expect(pending).resolves.toEqual({ ok: false, error: 'timed-out' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('bounds reply traversal before mapping the reply list', async () => {
    const replies = Array.from({ length: STATUS_HUB_MAX_REPLIES * 3 }, (_, index) => ({
      id: `reply-${index}`,
      body: `Reply ${index}`,
      createdAt: '2026-08-29T12:00:00Z',
    }));
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ replies }), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    const client = createStatusHubClient({ sessionId: 'session-1', fetchImpl });
    const result = await client.pollReplies();
    expect(result.ok).toBe(true);
    expect(result.replies).toHaveLength(STATUS_HUB_MAX_REPLIES);
  });
});

describe('local status fallback', () => {
  it('updates only after its own in-memory acknowledgement', async () => {
    const fallback = createLocalStatusFallback(snapshot);
    const before = await fallback.read();
    expect(before.ok && before.snapshot.source).toBe('local-fallback');
    const result = await fallback.publish({ ...snapshot, schemaVersion: 1, source: 'hub', summary: 'Updated.' });
    expect(result.acknowledged).toBe(false);
    expect(result.delivered).toBe(false);
    expect(result.acceptedLocally).toBe(true);
    const after = await fallback.read();
    expect(after.ok && after.snapshot.summary).toBe('Updated.');
  });

  it('uses an unavailable timestamp and advertises no shared delivery or polling', async () => {
    const fallback = createLocalStatusFallback({ ...snapshot, updatedAt: null });
    const read = await fallback.read();
    expect(read.ok && read.snapshot.updatedAt).toBeNull();
    expect(read.ok && read.snapshot.freshness).toBe('unavailable');
    expect(fallback.sharedDelivery).toBe(false);
    const replies = await fallback.pollReplies();
    expect(replies.pollable).toBe(false);
    expect(replies.source).toBe('local-fallback');
  });
});

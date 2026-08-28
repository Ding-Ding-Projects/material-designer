import { describe, expect, it } from 'vitest';

import {
  collectCatalog,
  computeHardwareFit,
  attachmentCapability,
  createPullQueue,
  isLoopbackOllamaOrigin,
  parseCatalogPage,
  parseCatalogSnapshot,
  reconcileInstalledModels,
  validateHarnessProfile,
  type OllamaPullRecord,
} from '../../src/runtime/ollama-suite';

describe('local Ollama suite domain', () => {
  it('accepts only credential-free loopback origins', () => {
    expect(isLoopbackOllamaOrigin('http://127.0.0.1:11434')).toBe(true);
    expect(isLoopbackOllamaOrigin('http://localhost:11434')).toBe(true);
    expect(isLoopbackOllamaOrigin('https://example.invalid')).toBe(false);
    expect(isLoopbackOllamaOrigin('http://127.0.0.1:11434?token=secret')).toBe(false);
  });

  it('rejects malformed catalog pages and unknown fit labels', () => {
    expect(parseCatalogPage({ variants: [{ tag: 'qwen:7b', fit: 'maybe' }] })).toMatchObject({ ok: false });
    expect(parseCatalogPage({ variants: [{ tag: 'qwen:7b', fit: 'unknown' }] })).toMatchObject({ ok: true });
  });

  it('walks every catalog page and records completeness', async () => {
    const pages = new Map<string | null, unknown>([
      [null, { variants: [{ tag: 'tiny:latest', fit: 'unknown' }], nextPageToken: 'next', sourceRevision: 'r1', sourceIdentity: 'catalog:r1' }],
      ['next', { variants: [{ tag: 'large:latest', fit: 'unknown' }], nextPageToken: null, sourceRevision: 'r1', sourceIdentity: 'catalog:r1' }],
    ]);
    const result = await collectCatalog(async (token) => pages.get(token), new AbortController().signal, () => '2026-08-27T00:00:00.000Z');
    expect(result).toMatchObject({ ok: true, value: { pageCount: 2, complete: true, sourceRevision: 'r1' } });
    if (result.ok) expect(result.value.variants.map((item) => item.tag)).toEqual(['tiny:latest', 'large:latest']);
  });

  it('refuses repeated pagination tokens instead of looping', async () => {
    const result = await collectCatalog(async () => ({ variants: [], nextPageToken: 'same' }), new AbortController().signal);
    expect(result).toMatchObject({ ok: false, error: { code: 'malformed-response' } });
  });

  it('rejects a cached snapshot without source revision or identity', () => {
    expect(parseCatalogSnapshot({ variants: [], sourceRevision: null, sourceIdentity: null, fetchedAt: '2026-08-27T00:00:00Z', pageCount: 1, complete: true, stale: false, staleAfterMs: 1000 })).toMatchObject({ ok: false });
  });

  it('reconciles installed tags that are absent from the verified catalog', () => {
    const result = reconcileInstalledModels([], ['local:tag'], ['local:tag']);
    expect(result[0]).toMatchObject({ tag: 'local:tag', installed: true, running: true, fit: 'unknown' });
  });

  it('returns Unknown when hardware evidence is incomplete', () => {
    expect(computeHardwareFit({ blobBytes: 100, parameterCount: null, quantization: null, contextWindow: null }, { ramBytes: null, vramBytes: null, freeDiskBytes: null, architecture: null, backendSupported: null, backend: null, driver: null })).toMatchObject({ verdict: 'unknown' });
  });

  it('returns conservative storage and RAM verdicts', () => {
    const variant = { blobBytes: 1_000_000_000, parameterCount: 7_000_000_000, quantization: 'Q4', contextWindow: 8192 } as const;
    expect(computeHardwareFit(variant, { ramBytes: 2_000_000_000, vramBytes: null, freeDiskBytes: 2_000_000_000, architecture: 'x64', backendSupported: true, backend: 'cpu', driver: null }).verdict).toBe('unlikely');
    expect(computeHardwareFit(variant, { ramBytes: 4_000_000_000, vramBytes: null, freeDiskBytes: 2_000_000_000, architecture: 'x64', backendSupported: true, backend: 'cpu', driver: null }).verdict).toBe('runs-well');
    expect(computeHardwareFit(variant, { ramBytes: 4_000_000_000, vramBytes: null, freeDiskBytes: 2_000_000_000, architecture: 'x64', backendSupported: false, backend: 'unsupported', driver: null }).verdict).toBe('unlikely');
  });

  it('rejects shell syntax in registered harness profiles', () => {
    expect(validateHarnessProfile({ id: 'bad', name: 'Bad', executable: 'ollama && whoami', arguments: [], modelTag: 'tiny:latest' })).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(validateHarnessProfile({ id: 'good', name: 'Good', executable: 'ollama', arguments: ['run', 'tiny:latest'], workingDirectory: null, environmentKeys: [], modelTag: 'tiny:latest', registered: false })).toMatchObject({ ok: true });
  });

  it('keeps attachments visible but refuses unsupported capabilities', () => {
    expect(attachmentCapability({ capabilities: [] }, { mimeType: 'image/png', bytes: 100 })).toMatchObject({ allowed: false });
    expect(attachmentCapability({ capabilities: ['vision'] }, { mimeType: 'image/png', bytes: 100 })).toMatchObject({ allowed: true });
  });

  it('recovers pulling queue records and caps active work at two items', async () => {
    let saved: OllamaPullRecord[] = [{ id: 'old', tag: 'tiny:latest', state: 'pulling', completedBytes: 2, totalBytes: 4, detail: null, attempts: 1, queuedAt: '2026-08-27T00:00:00Z', updatedAt: '2026-08-27T00:00:00Z', retryable: true }];
    const queue = createPullQueue({ load: async () => saved, save: async (next) => { saved = [...next]; } }, () => '2026-08-27T01:00:00Z');
    expect((await queue.list())[0]).toMatchObject({ state: 'queued', detail: 'Recovered after restart.' });
    const first = await queue.enqueue('first:latest');
    const second = await queue.enqueue('second:latest');
    const third = await queue.enqueue('third:latest');
    expect([first, second, third].every((item) => item.ok)).toBe(true);
    expect((await queue.list()).filter((item) => item.state === 'pulling').length).toBeLessThanOrEqual(2);
  });
});

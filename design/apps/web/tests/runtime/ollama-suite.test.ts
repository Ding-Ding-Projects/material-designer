import { describe, expect, it } from 'vitest';

import {
  collectCatalog,
  computeHardwareFit,
  attachmentCapability,
  createChatSession,
  createOllamaSuiteClient,
  decodedBase64Bytes,
  DEFAULT_CHAT_PARAMETERS,
  isLoopbackOllamaOrigin,
  parseCatalogPage,
  parseCatalogSnapshot,
  parseHardwareFacts,
  parsePullRecord,
  reconcileInstalledModels,
  resolveOllamaHostBridge,
  validateHarnessProfile,
  validateChatParameters,
  redactChatExport,
  parseChatSession,
  renameChatSession,
  searchChatSessions,
} from '../../src/runtime/ollama-suite';

describe('local Ollama suite domain', () => {
  it('accepts only credential-free loopback origins', () => {
    expect(isLoopbackOllamaOrigin('http://127.0.0.1:11434')).toBe(true);
    expect(isLoopbackOllamaOrigin('http://localhost:11434')).toBe(true);
    expect(isLoopbackOllamaOrigin('https://example.invalid')).toBe(false);
    expect(isLoopbackOllamaOrigin('http://127.0.0.1:11434?token=secret')).toBe(false);
  });

  it('rejects malformed catalog pages and unknown fit labels', () => {
    expect(parseCatalogPage({ variants: [{ tag: 'qwen:7b', fit: 'maybe' }], nextPageToken: null, sourceRevision: 'r1', sourceIdentity: 'catalog:r1' })).toMatchObject({ ok: false });
    expect(parseCatalogPage({ variants: [{ tag: 'qwen:7b', fit: 'unknown' }], nextPageToken: null, sourceRevision: 'r1', sourceIdentity: 'catalog:r1' })).toMatchObject({ ok: true });
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

  it('stops at the bounded catalog page limit without claiming completeness', async () => {
    const result = await collectCatalog(async (token) => {
      const page = Number(token ?? '0');
      return { variants: [{ tag: `model-${page}:latest`, fit: 'unknown' }], nextPageToken: String(page + 1), sourceRevision: 'r1', sourceIdentity: 'catalog:r1' };
    }, new AbortController().signal);
    expect(result).toMatchObject({ ok: true, value: { pageCount: 10_000, complete: false } });
  });

  it('refuses repeated pagination tokens instead of looping', async () => {
    const result = await collectCatalog(async () => ({ variants: [], nextPageToken: 'same' }), new AbortController().signal);
    expect(result).toMatchObject({ ok: false, error: { code: 'malformed-response' } });
  });

  it('refuses catalog revision or tag drift between pages', async () => {
    const revisionDrift = await collectCatalog(async (token) => token ? { variants: [], nextPageToken: null, sourceRevision: 'r2', sourceIdentity: 'catalog:r1' } : { variants: [], nextPageToken: 'next', sourceRevision: 'r1', sourceIdentity: 'catalog:r1' }, new AbortController().signal);
    expect(revisionDrift).toMatchObject({ ok: false, error: { code: 'malformed-response' } });
    const tagDrift = await collectCatalog(async (token) => token ? { variants: [{ tag: 'same:latest', fit: 'unknown' }], nextPageToken: null, sourceRevision: 'r1', sourceIdentity: 'catalog:r1' } : { variants: [{ tag: 'same:latest', fit: 'unknown' }], nextPageToken: 'next', sourceRevision: 'r1', sourceIdentity: 'catalog:r1' }, new AbortController().signal);
    expect(tagDrift).toMatchObject({ ok: false, error: { code: 'malformed-response' } });
  });

  it('rejects a cached snapshot without source revision or identity', () => {
    expect(parseCatalogSnapshot({ variants: [], sourceRevision: null, sourceIdentity: null, fetchedAt: '2026-08-27T00:00:00Z', pageCount: 1, complete: true, stale: false, staleAfterMs: 1000 })).toMatchObject({ ok: false });
  });

  it('requires explicit host hardware facts before calculating a fit', () => {
    expect(parseHardwareFacts({ ramBytes: 4_000_000_000, vramBytes: null, freeDiskBytes: 8_000_000_000, architecture: 'x64', gpu: null, driver: null, backend: 'cpu', backendSupported: true, detectedAt: '2026-08-27T00:00:00Z' })).toMatchObject({ ok: false });
    expect(parseHardwareFacts({ ramBytes: 4_000_000_000, availableRamBytes: 3_000_000_000, vramBytes: null, freeDiskBytes: 8_000_000_000, architecture: 'x64', gpu: null, driver: null, backend: 'cpu', backendSupported: true, detectedAt: '2026-08-27T00:00:00Z' })).toMatchObject({ ok: true });
  });

  it('reconciles installed tags that are absent from the verified catalog', () => {
    const result = reconcileInstalledModels([{ tag: 'catalog:latest', family: null, parameterSize: null, parameterCount: null, quantization: null, blobBytes: null, contextWindow: null, contextOverheadBytes: null, capabilities: [], installed: false, running: false, fit: 'unknown', fitEvidence: [] }], ['local:tag'], ['local:tag', 'running:only']);
    expect(result[0]).toMatchObject({ tag: 'local:tag', installed: true, running: true, fit: 'unknown' });
    expect(result.find((item) => item.tag === 'running:only')).toMatchObject({ installed: true, running: true });
    expect(result.find((item) => item.tag === 'catalog:latest')).toMatchObject({ installed: false, running: false });
  });

  it('returns Unknown when hardware evidence is incomplete', () => {
    expect(computeHardwareFit({ blobBytes: 100, parameterCount: null, quantization: null, contextWindow: null }, { ramBytes: null, availableRamBytes: null, vramBytes: null, freeDiskBytes: null, architecture: null, backendSupported: null, backend: null, driver: null })).toMatchObject({ verdict: 'unknown' });
  });

  it('returns conservative storage and RAM verdicts', () => {
    const variant = { blobBytes: 1_000_000_000, parameterCount: 7_000_000_000, quantization: 'Q4', contextWindow: 8192 } as const;
    expect(computeHardwareFit(variant, { ramBytes: 2_000_000_000, availableRamBytes: 2_000_000_000, vramBytes: null, freeDiskBytes: 2_000_000_000, architecture: 'x64', backendSupported: true, backend: 'cpu', driver: null }).verdict).toBe('unlikely');
    expect(computeHardwareFit(variant, { ramBytes: 4_000_000_000, availableRamBytes: 4_000_000_000, vramBytes: null, freeDiskBytes: 2_000_000_000, architecture: 'x64', backendSupported: true, backend: 'cpu', driver: null }).verdict).toBe('runs-well');
    expect(computeHardwareFit(variant, { ramBytes: 4_000_000_000, availableRamBytes: 4_000_000_000, vramBytes: null, freeDiskBytes: 2_000_000_000, architecture: 'x64', backendSupported: false, backend: 'unsupported', driver: null }).verdict).toBe('unlikely');
  });

  it('rejects shell syntax in registered harness profiles', () => {
    expect(validateHarnessProfile({ id: 'bad', name: 'Bad', executable: 'ollama && whoami', arguments: [], modelTag: 'tiny:latest' })).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(validateHarnessProfile({ id: 'good', name: 'Good', executable: 'ollama', arguments: ['run', 'tiny:latest'], workingDirectory: null, environmentKeys: [], modelTag: 'tiny:latest', registered: false })).toMatchObject({ ok: true });
  });

  it('keeps attachments visible but refuses unsupported capabilities', () => {
    expect(attachmentCapability({ capabilities: [] }, { mimeType: 'image/png', bytes: 100 })).toMatchObject({ allowed: false });
    expect(attachmentCapability({ capabilities: ['vision'] }, { mimeType: 'image/png', bytes: 100 })).toMatchObject({ allowed: true });
    expect(attachmentCapability({ capabilities: ['file'] }, { mimeType: 'application/octet-stream', bytes: 100 })).toMatchObject({ allowed: false });
  });

  it('accepts only complete durable pull records', () => {
    expect(parsePullRecord({ id: 'id', tag: 'tiny:latest', state: 'pulling', completedBytes: 0, totalBytes: null, detail: null, attempts: 1, queuedAt: '2026-08-27T00:00:00Z', updatedAt: '2026-08-27T00:00:00Z', retryable: true, providerStatus: 'pulling', rateBytesPerSecond: null, etaSeconds: null, partialOutcome: 'none', generation: 1, leaseId: 'lease-one', leaseExpiresAt: '2099-08-27T00:00:00Z' })).not.toBeNull();
    expect(parsePullRecord({ id: 'id', tag: 'tiny:latest', state: 'pulling', completedBytes: 0, totalBytes: null, detail: null, attempts: 1, queuedAt: '2026-08-27T00:00:00Z', updatedAt: '2026-08-27T00:00:00Z', retryable: true })).toBeNull();
    expect(parsePullRecord({ id: 'id', tag: 'tiny:latest', state: 'pulling', completedBytes: 0, totalBytes: '4', detail: null, attempts: 1, queuedAt: '2026-08-27T00:00:00Z', updatedAt: '2026-08-27T00:00:00Z', retryable: true, providerStatus: 'pulling', rateBytesPerSecond: null, etaSeconds: null, partialOutcome: 'none', generation: 1, leaseId: 'lease-one', leaseExpiresAt: '2099-08-27T00:00:00Z' })).toBeNull();
    expect(parsePullRecord({ id: 'id', tag: 'tiny:latest', state: 'completed', completedBytes: 4, totalBytes: 4, detail: 'done', attempts: 1, queuedAt: '2026-08-27T00:00:00Z', updatedAt: '2026-08-27T00:00:00Z', retryable: true, providerStatus: 'success', rateBytesPerSecond: 1, etaSeconds: 0, partialOutcome: 'all', generation: 1, leaseId: null, leaseExpiresAt: null })).toBeNull();
    expect(parsePullRecord({ id: 'id', tag: 'tiny:latest', state: 'completed', completedBytes: 4, totalBytes: 4, detail: 'done', attempts: 1, queuedAt: '2026-08-27T00:00:00Z', updatedAt: '2026-08-27T00:00:00Z', retryable: false, providerStatus: 'success', rateBytesPerSecond: 1, etaSeconds: 0, partialOutcome: 'all', generation: 1, leaseId: null, leaseExpiresAt: null })).not.toBeNull();
  });

  it('bounds chat parameters and redacts a local session export to safe fields', () => {
    expect(validateChatParameters({ temperature: 9, topP: 0.9, topK: 40, numCtx: 8192, seed: null })).toMatchObject({ ok: false });
    const session = createChatSession('tiny:latest', 'Local session', () => '2026-08-27T00:00:00Z');
    session.messages.push({ role: 'user', content: 'hello', attachments: [{ name: 'note.txt', mimeType: 'text/plain', bytes: 4 }] });
    expect(redactChatExport(session)).toMatchObject({ version: 1, id: session.id, messages: [{ role: 'user', content: 'hello', attachments: [{ name: 'note.txt', mimeType: 'text/plain', bytes: 4 }] }] });
    const parsed = parseChatSession({ ...session, parameters: session.parameters });
    expect(parsed.ok).toBe(true);
    expect(searchChatSessions([session], 'local session')).toHaveLength(1);
    expect(renameChatSession(session, '', () => '2026-08-27T01:00:00Z')).toMatchObject({ ok: false });
    expect(renameChatSession(session, 'Renamed', () => '2026-08-27T01:00:00Z')).toMatchObject({ ok: true, value: { name: 'Renamed', updatedAt: '2026-08-27T01:00:00Z' } });
    if (parsed.ok) expect(parsed.value.messages[0]?.attachments).toEqual([{ name: 'note.txt', mimeType: 'text/plain', bytes: 4 }]);
    const redacted = redactChatExport({ ...session, systemPrompt: 'apiKey=apiValue client_secret=clientValue access_key="accessValue" provider_token: providerValue PROVIDER_ACCESS_KEY: "providerAccessValue" Authorization: Bearer bearerValue\nproxy-authorization: Basic "basicValue"\nBEARER bareValue C:\\Users\\private\\draft.txt' });
    expect(redacted).toMatchObject({ redactionManifest: { version: 1, removedFields: ['attachment.dataBase64'], secretLikeValuesRedacted: 8, authorizationSchemesRedacted: 3, privatePathsRedacted: 1 } });
    expect(JSON.stringify(redacted)).not.toContain('apiValue');
    expect(JSON.stringify(redacted)).not.toContain('clientValue');
    expect(JSON.stringify(redacted)).not.toContain('accessValue');
    expect(JSON.stringify(redacted)).not.toContain('providerValue');
    expect(JSON.stringify(redacted)).not.toContain('providerAccessValue');
    expect(JSON.stringify(redacted)).not.toContain('bearerValue');
    expect(JSON.stringify(redacted)).not.toContain('basicValue');
    expect(JSON.stringify(redacted)).not.toContain('bareValue');
    expect(JSON.stringify(redacted)).not.toContain('C:\\Users\\private');
  });

  it('rejects non-canonical base64 padding before any host request', async () => {
    expect(decodedBase64Bytes('AQ==')).toBe(1);
    expect(decodedBase64Bytes('AB==')).toBeNull();
    expect(decodedBase64Bytes('AQ===')).toBeNull();
    let called = false;
    const client = createOllamaSuiteClient(async () => { called = true; return new Response(''); });
    const result = await client.chat('tiny:latest', [{ role: 'user', content: 'continue', attachments: [{ name: 'bad.bin', mimeType: 'application/octet-stream', bytes: 1, dataBase64: 'AB==' }] }], DEFAULT_CHAT_PARAMETERS);
    expect(result).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(called).toBe(false);
  });

  it('keeps the host seam honest when the bridge is absent or incomplete', () => {
    expect(resolveOllamaHostBridge(undefined)).toMatchObject({ available: false });
    expect(resolveOllamaHostBridge({ runtime: () => Promise.resolve({ ok: false }) })).toMatchObject({ available: false });
  });

  it('rejects non-Ollama executables and malformed client payloads', async () => {
    expect(validateHarnessProfile({ id: 'bad', name: 'Bad', executable: 'python', arguments: ['run', 'tiny:latest'], environmentKeys: [], modelTag: 'tiny:latest' })).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    const client = createOllamaSuiteClient(async () => new Response('x'.repeat(8 * 1024 * 1024 + 1), { status: 200 }));
    expect(await client.runtime()).toMatchObject({ ok: false, error: { code: 'response-too-large' } });
  });

  it('never forwards a caller-selected base URL to the host route', async () => {
    let body = '';
    const client = createOllamaSuiteClient(async (_input, init) => {
      body = String(init?.body ?? '');
      return new Response(JSON.stringify({ id: 'pull-1', tag: 'tiny:latest', state: 'queued', completedBytes: 0, totalBytes: null, detail: null, attempts: 0, queuedAt: '2026-08-29T00:00:00Z', updatedAt: '2026-08-29T00:00:00Z', retryable: true, providerStatus: 'queued', rateBytesPerSecond: null, etaSeconds: null, partialOutcome: 'none', generation: 0, leaseId: null, leaseExpiresAt: null }), { status: 202 });
    });
    expect(await client.pull('tiny:latest')).toMatchObject({ ok: true, value: { id: 'pull-1' } });
    expect(body).toBe('{"tag":"tiny:latest"}');
    expect(body).not.toContain('baseUrl');
  });

  it('forwards only the bounded selected model hint for local detail priority', async () => {
    let requestPath = '';
    const client = createOllamaSuiteClient(async (input) => {
      requestPath = String(input);
      return new Response(JSON.stringify({ variants: [], nextPageToken: null, sourceRevision: 'r1', sourceIdentity: 'catalog:r1' }), { status: 200 });
    });
    expect(await client.catalogPage(null, undefined, 'tiny:model')).toMatchObject({ ok: true });
    expect(requestPath).toBe('/api/ollama/catalog?selectedTag=tiny%3Amodel');
  });

  it('refuses metadata-only historic attachments before any request is made', async () => {
    let called = false;
    const client = createOllamaSuiteClient(async () => { called = true; return new Response(''); });
    const result = await client.chat('tiny:latest', [{ role: 'user', content: 'continue', attachments: [{ name: 'old.txt', mimeType: 'text/plain', bytes: 4 }] }], DEFAULT_CHAT_PARAMETERS);
    expect(result).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(called).toBe(false);
  });

});

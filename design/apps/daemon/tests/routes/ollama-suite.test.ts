import { describe, expect, it } from 'vitest';

import {
  OLLAMA_MAX_CATALOG_MODELS,
  OLLAMA_MAX_NDJSON_LINE_BYTES,
  OLLAMA_MAX_NDJSON_LINES,
  OLLAMA_MAX_RESPONSE_INACTIVITY_MS,
  OLLAMA_MAX_STREAM_BYTES,
  OLLAMA_LOCAL_DETAIL_CONCURRENCY,
  OLLAMA_LOCAL_DETAIL_BUDGET_MS,
  consumeOllamaProviderStream,
  decodeOllamaBase64,
  matchesOllamaPullAttempt,
  isOllamaPullLeaseExpired,
  isOllamaLoopbackOrigin,
  normalizeOllamaCatalogPageToken,
  prioritizeOllamaDetailTags,
  resolveOllamaCatalogRevision,
  validateOllamaHarnessProfile,
} from '../../src/routes/ollama-suite';

const unregisteredProfile = {
  id: 'profile-1',
  name: 'Local harness',
  executable: 'ollama.exe',
  arguments: ['run', 'tiny:latest'],
  workingDirectory: null,
  environmentKeys: [],
  modelTag: 'tiny:latest',
  registered: false,
};

const registeredExecutable = process.platform === 'win32' ? 'C:\\Tools\\ollama.exe' : '/tmp/ollama';
const registeredProfile = {
  ...unregisteredProfile,
  registered: true,
  executable: registeredExecutable,
  executableIdentity: { path: registeredExecutable, size: 12, mtimeMs: 4, sha256: 'a'.repeat(64) },
};

describe('local Ollama route contracts', () => {
  it('allows only credential-free loopback origins', () => {
    expect(isOllamaLoopbackOrigin('http://127.0.0.1:11434')).toBe(true);
    expect(isOllamaLoopbackOrigin('http://localhost:11434')).toBe(true);
    expect(isOllamaLoopbackOrigin('https://example.invalid')).toBe(false);
    expect(isOllamaLoopbackOrigin('http://127.0.0.1:11434?token=secret')).toBe(false);
  });

  it('clears a terminal catalog page token and rejects malformed tokens', () => {
    expect(normalizeOllamaCatalogPageToken({ nextPageToken: null })).toBeNull();
    expect(normalizeOllamaCatalogPageToken({ nextPageToken: 'page-2' })).toBe('page-2');
    expect(normalizeOllamaCatalogPageToken({ next_page_token: null, next: 'stale-token' })).toBeNull();
    expect(() => normalizeOllamaCatalogPageToken({ nextPageToken: 'x'.repeat(501) })).toThrow('invalid-page-token');
    expect(resolveOllamaCatalogRevision({ models: ['one'] }, '"etag-one"')).toBe('"etag-one"');
    expect(resolveOllamaCatalogRevision({ models: ['one'] }, null)).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('requires registration, identity, controlled arguments, and safe environment keys', () => {
    expect(validateOllamaHarnessProfile(unregisteredProfile)).not.toBeNull();
    expect(validateOllamaHarnessProfile(unregisteredProfile, true)).toBeNull();
    expect(validateOllamaHarnessProfile(registeredProfile, true)).not.toBeNull();
    expect(validateOllamaHarnessProfile({ ...registeredProfile, arguments: ['run', 'tiny:latest', '&&', 'whoami'] }, true)).toBeNull();
    expect(validateOllamaHarnessProfile({ ...registeredProfile, environmentKeys: ['OLLAMA_TOKEN'] }, true)).toBeNull();
  });

  it('keeps provider stream limits explicit and bounded', () => {
    expect(OLLAMA_MAX_STREAM_BYTES).toBe(8 * 1024 * 1024);
    expect(OLLAMA_MAX_NDJSON_LINE_BYTES).toBe(128 * 1024);
    expect(OLLAMA_MAX_NDJSON_LINES).toBe(100_000);
    expect(OLLAMA_MAX_RESPONSE_INACTIVITY_MS).toBe(30_000);
    expect(OLLAMA_MAX_CATALOG_MODELS).toBe(100_000);
    expect(OLLAMA_LOCAL_DETAIL_CONCURRENCY).toBe(4);
    expect(OLLAMA_LOCAL_DETAIL_BUDGET_MS).toBe(10_000);
  });

  it('decodes attachment payloads once with canonical padding and exact size', () => {
    expect(decodeOllamaBase64('AQ==')).toEqual(Buffer.from([1]));
    expect(decodeOllamaBase64('AB==')).toBeNull();
    expect(decodeOllamaBase64('AQ===')).toBeNull();
  });

  it('prioritizes the selected and installed tags within the detail bound', () => {
    expect(prioritizeOllamaDetailTags(['catalog-a', 'installed-a', 'catalog-b'], ['installed-a', 'installed-b'], 'selected-a', 4)).toEqual(['selected-a', 'installed-a', 'installed-b', 'catalog-a']);
    expect(prioritizeOllamaDetailTags(['one', 'two'], [], null, 1)).toEqual(['one']);
  });

  it('refuses stale pull terminal updates after pause, resume, or cancel races', () => {
    const first = { generation: 1, leaseId: 'lease-one' };
    const resumed = { generation: 2, leaseId: 'lease-two' };
    expect(matchesOllamaPullAttempt(first, first)).toBe(true);
    expect(matchesOllamaPullAttempt(resumed, first)).toBe(false);
    expect(matchesOllamaPullAttempt(null, first)).toBe(false);
    expect(isOllamaPullLeaseExpired('2020-01-01T00:00:00Z', Date.parse('2020-01-02T00:00:00Z'))).toBe(true);
    expect(isOllamaPullLeaseExpired('2099-01-01T00:00:00Z', Date.parse('2020-01-02T00:00:00Z'))).toBe(false);
  });

  it('maps provider success, malformed lines, oversized lines, and aborts to bounded outcomes', async () => {
    const success = await consumeOllamaProviderStream(new Response('{"status":"success"}\n'), new AbortController().signal, () => 'success');
    expect(success).toMatchObject({ success: true, reason: null });

    const malformed = await consumeOllamaProviderStream(new Response('{not-json}\n'), new AbortController().signal, () => undefined);
    expect(malformed).toMatchObject({ success: false, reason: 'Provider returned malformed NDJSON.' });

    const oversized = await consumeOllamaProviderStream(new Response(`{"status":"progress","detail":"${'x'.repeat(OLLAMA_MAX_NDJSON_LINE_BYTES)}"}\n`), new AbortController().signal, () => undefined);
    expect(oversized.success).toBe(false);
    expect(oversized.reason).toBe('stream-line-too-large');

    const controller = new AbortController();
    controller.abort();
    const aborted = await consumeOllamaProviderStream(new Response(new ReadableStream<Uint8Array>({ pull() { return new Promise(() => undefined); } })), controller.signal, () => undefined);
    expect(aborted).toMatchObject({ success: false, reason: 'aborted' });
  });
});

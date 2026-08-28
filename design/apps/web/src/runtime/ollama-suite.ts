/**
 * Local Ollama suite domain and transport.
 *
 * This module deliberately owns validation at the privileged daemon boundary:
 * the renderer never accepts an arbitrary origin, shell command, or unbounded
 * response. The default transport is same-origin and the daemon is responsible
 * for forwarding only to an explicitly configured loopback Ollama service.
 */

export const OLLAMA_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
export const OLLAMA_MAX_CATALOG_PAGES = 10_000;
export const OLLAMA_MAX_VARIANTS = 100_000;
export const OLLAMA_MAX_MODEL_NAME = 160;
export const OLLAMA_MAX_PROFILE_NAME = 120;
export const OLLAMA_MAX_ARGUMENTS = 64;

export type OllamaRuntimeState =
  | 'missing'
  | 'stopped'
  | 'healthy'
  | 'unhealthy'
  | 'offline';

export type OllamaFitVerdict = 'runs-well' | 'runs-with-limits' | 'unlikely' | 'unknown';

export interface OllamaRuntimeStatus {
  state: OllamaRuntimeState;
  version: string | null;
  detail: string;
  checkedAt: string;
}

export interface OllamaModelVariant {
  tag: string;
  family: string | null;
  parameterSize: string | null;
  parameterCount: number | null;
  quantization: string | null;
  blobBytes: number | null;
  contextWindow: number | null;
  capabilities: string[];
  installed: boolean;
  running: boolean;
  fit: OllamaFitVerdict;
  fitEvidence: string[];
}

export interface OllamaCatalogSnapshot {
  variants: OllamaModelVariant[];
  sourceRevision: string | null;
  fetchedAt: string;
  pageCount: number;
  complete: boolean;
  stale: boolean;
  staleAfterMs: number;
}

export interface OllamaHardwareFacts {
  ramBytes: number | null;
  vramBytes: number | null;
  freeDiskBytes: number | null;
  architecture: string | null;
  gpu: string | null;
  driver: string | null;
  detectedAt: string;
}

export interface OllamaPullRecord {
  id: string;
  tag: string;
  state: 'queued' | 'pulling' | 'paused' | 'completed' | 'cancelled' | 'failed';
  completedBytes: number;
  totalBytes: number | null;
  detail: string | null;
}

export interface OllamaHarnessProfile {
  id: string;
  name: string;
  executable: string;
  arguments: string[];
  workingDirectory: string | null;
  environmentKeys: string[];
  modelTag: string;
  registered: boolean;
}

export interface OllamaApiError {
  code:
  | 'invalid-origin'
  | 'invalid-input'
  | 'response-too-large'
  | 'malformed-response'
  | 'offline'
  | 'request-failed';
  message: string;
}

export type OllamaResult<T> = { ok: true; value: T } | { ok: false; error: OllamaApiError };

function resultError(
  code: OllamaApiError['code'],
  message: string,
): OllamaResult<never> {
  return { ok: false, error: { code, message } };
}

function boundedString(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max
    ? value.trim()
    : null;
}

function boundedNumber(value: unknown, max = Number.MAX_SAFE_INTEGER): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max
    ? value
    : null;
}

function stringArray(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, maxItems)
    .filter((item): item is string => typeof item === 'string' && item.length <= maxLength)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function isLoopbackOllamaOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      (url.hostname === 'localhost' ||
        url.hostname === '127.0.0.1' ||
        url.hostname === '[::1]' ||
        url.hostname === '::1') &&
      url.username === '' &&
      url.password === '' &&
      url.search === '' &&
      url.hash === ''
    );
  } catch {
    return false;
  }
}

export function parseRuntimeStatus(value: unknown): OllamaResult<OllamaRuntimeStatus> {
  if (!value || typeof value !== 'object') return resultError('malformed-response', 'Runtime status was not an object.');
  const raw = value as Record<string, unknown>;
  const state = raw.state;
  if (!['missing', 'stopped', 'healthy', 'unhealthy', 'offline'].includes(String(state))) {
    return resultError('malformed-response', 'Runtime status used an unknown state.');
  }
  const checkedAt = boundedString(raw.checkedAt, 80);
  if (!checkedAt) return resultError('malformed-response', 'Runtime status did not include a timestamp.');
  return {
    ok: true,
    value: {
      state: state as OllamaRuntimeState,
      version: boundedString(raw.version, 80),
      detail: boundedString(raw.detail, 500) ?? 'No diagnostic was provided.',
      checkedAt,
    },
  };
}

function parseVariant(value: unknown): OllamaResult<OllamaModelVariant> {
  if (!value || typeof value !== 'object') return resultError('malformed-response', 'A model variant was not an object.');
  const raw = value as Record<string, unknown>;
  const tag = boundedString(raw.tag, OLLAMA_MAX_MODEL_NAME);
  if (!tag) return resultError('malformed-response', 'A model variant did not include a valid tag.');
  const fit = raw.fit;
  if (!['runs-well', 'runs-with-limits', 'unlikely', 'unknown'].includes(String(fit))) {
    return resultError('malformed-response', `Model ${tag} used an unknown hardware-fit verdict.`);
  }
  return {
    ok: true,
    value: {
      tag,
      family: boundedString(raw.family, 80),
      parameterSize: boundedString(raw.parameterSize, 40),
      parameterCount: boundedNumber(raw.parameterCount),
      quantization: boundedString(raw.quantization, 40),
      blobBytes: boundedNumber(raw.blobBytes),
      contextWindow: boundedNumber(raw.contextWindow, 10_000_000),
      capabilities: stringArray(raw.capabilities, 32, 80),
      installed: raw.installed === true,
      running: raw.running === true,
      fit: fit as OllamaFitVerdict,
      fitEvidence: stringArray(raw.fitEvidence, 24, 300),
    },
  };
}

export function parseCatalogPage(value: unknown): OllamaResult<{
  variants: OllamaModelVariant[];
  nextPageToken: string | null;
  sourceRevision: string | null;
}> {
  if (!value || typeof value !== 'object') return resultError('malformed-response', 'Catalog page was not an object.');
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.variants)) return resultError('malformed-response', 'Catalog page omitted variants.');
  const variants: OllamaModelVariant[] = [];
  for (const item of raw.variants.slice(0, OLLAMA_MAX_VARIANTS)) {
    const parsed = parseVariant(item);
    if (!parsed.ok) return parsed;
    variants.push(parsed.value);
  }
  return {
    ok: true,
    value: {
      variants,
      nextPageToken: boundedString(raw.nextPageToken, 500),
      sourceRevision: boundedString(raw.sourceRevision, 200),
    },
  };
}

export async function collectCatalog(
  fetchPage: (pageToken: string | null, signal: AbortSignal) => Promise<unknown>,
  signal: AbortSignal,
  now = () => new Date().toISOString(),
  staleAfterMs = 6 * 60 * 60 * 1000,
): Promise<OllamaResult<OllamaCatalogSnapshot>> {
  const variants: OllamaModelVariant[] = [];
  const seenTokens = new Set<string>();
  let pageToken: string | null = null;
  let sourceRevision: string | null = null;
  let pageCount = 0;
  try {
    while (pageCount < OLLAMA_MAX_CATALOG_PAGES) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      pageCount += 1;
      const parsed = parseCatalogPage(await fetchPage(pageToken, signal));
      if (!parsed.ok) return parsed;
      sourceRevision ??= parsed.value.sourceRevision;
      variants.push(...parsed.value.variants);
      const next = parsed.value.nextPageToken;
      if (!next) break;
      if (seenTokens.has(next)) return resultError('malformed-response', 'Catalog pagination repeated a page token.');
      seenTokens.add(next);
      pageToken = next;
    }
    const complete = pageCount < OLLAMA_MAX_CATALOG_PAGES && pageToken === null;
    const fetchedAt = now();
    return {
      ok: true,
      value: {
        variants,
        sourceRevision,
        fetchedAt,
        pageCount,
        complete,
        stale: false,
        staleAfterMs,
      },
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    return resultError('offline', error instanceof Error ? error.message : 'Catalog request failed.');
  }
}

export function markCatalogStaleness(snapshot: OllamaCatalogSnapshot, now = Date.now()): OllamaCatalogSnapshot {
  const age = now - Date.parse(snapshot.fetchedAt);
  return { ...snapshot, stale: !Number.isFinite(age) || age > snapshot.staleAfterMs };
}

export function computeHardwareFit(
  variant: Pick<OllamaModelVariant, 'blobBytes' | 'parameterCount' | 'quantization' | 'contextWindow'>,
  hardware: Pick<OllamaHardwareFacts, 'ramBytes' | 'vramBytes' | 'freeDiskBytes' | 'architecture'>,
): { verdict: OllamaFitVerdict; evidence: string[] } {
  const evidence: string[] = [];
  if (!variant.blobBytes || !hardware.ramBytes || !hardware.freeDiskBytes) {
    return { verdict: 'unknown', evidence: ['Blob size, RAM, and free destination storage are required.'] };
  }
  const overhead = Math.max(512 * 1024 * 1024, Math.round(variant.blobBytes * 0.2));
  const requiredRam = variant.blobBytes + overhead;
  const requiredDisk = variant.blobBytes + Math.round(variant.blobBytes * 0.1);
  evidence.push(`RAM estimate: ${requiredRam} bytes including bounded runtime overhead.`);
  evidence.push(`Storage estimate: ${requiredDisk} bytes including a bounded download margin.`);
  if (hardware.architecture) evidence.push(`Architecture: ${hardware.architecture}.`);
  if (hardware.freeDiskBytes < requiredDisk) return { verdict: 'unlikely', evidence: [...evidence, 'Free destination storage is below the conservative estimate.'] };
  if (hardware.ramBytes < requiredRam) return { verdict: 'unlikely', evidence: [...evidence, 'System RAM is below the conservative estimate.'] };
  if (variant.contextWindow && variant.contextWindow > 131_072) {
    return { verdict: 'runs-with-limits', evidence: [...evidence, 'The declared context window is large and may need a lower setting.'] };
  }
  return { verdict: 'runs-well', evidence: [...evidence, 'Known size and hardware facts meet the conservative estimate.'] };
}

export function reconcileInstalledModels(
  catalog: readonly OllamaModelVariant[],
  installedTags: readonly string[],
  runningTags: readonly string[] = [],
): OllamaModelVariant[] {
  const installed = new Set(installedTags);
  const running = new Set(runningTags);
  const byTag = new Map(catalog.map((item) => [item.tag, item]));
  for (const tag of installed) {
    if (byTag.has(tag)) continue;
    byTag.set(tag, {
      tag,
      family: null,
      parameterSize: null,
      parameterCount: null,
      quantization: null,
      blobBytes: null,
      contextWindow: null,
      capabilities: [],
      installed: true,
      running: running.has(tag),
      fit: 'unknown',
      fitEvidence: ['Installed locally, but no verified catalog metadata is available.'],
    });
  }
  return [...byTag.values()].map((item) => ({
    ...item,
    installed: item.installed || installed.has(item.tag),
    running: item.running || running.has(item.tag),
  }));
}

export function validateHarnessProfile(value: unknown): OllamaResult<OllamaHarnessProfile> {
  if (!value || typeof value !== 'object') return resultError('invalid-input', 'Harness profile must be an object.');
  const raw = value as Record<string, unknown>;
  const id = boundedString(raw.id, 80);
  const name = boundedString(raw.name, OLLAMA_MAX_PROFILE_NAME);
  const executable = boundedString(raw.executable, 400);
  const modelTag = boundedString(raw.modelTag, OLLAMA_MAX_MODEL_NAME);
  const args = stringArray(raw.arguments, OLLAMA_MAX_ARGUMENTS, 500);
  const env = stringArray(raw.environmentKeys, 64, 120);
  if (!id || !name || !executable || !modelTag) return resultError('invalid-input', 'Harness profile needs id, name, executable, and model tag.');
  if (/[;&|<>`$\r\n]/.test(executable) || args.some((arg) => /[;&|<>`\r\n]/.test(arg))) {
    return resultError('invalid-input', 'Shell syntax is not allowed in an executable or argument.');
  }
  if (typeof raw.workingDirectory !== 'undefined' && raw.workingDirectory !== null && boundedString(raw.workingDirectory, 500) === null) {
    return resultError('invalid-input', 'Working directory is not a bounded path value.');
  }
  return {
    ok: true,
    value: {
      id,
      name,
      executable,
      arguments: args,
      workingDirectory: raw.workingDirectory === null ? null : boundedString(raw.workingDirectory, 500),
      environmentKeys: env,
      modelTag,
      registered: raw.registered === true,
    },
  };
}

export interface OllamaSuiteClient {
  runtime(signal?: AbortSignal): Promise<OllamaResult<OllamaRuntimeStatus>>;
  installed(signal?: AbortSignal): Promise<OllamaResult<{ tags: string[]; running: string[] }>>;
  catalogPage(pageToken: string | null, signal?: AbortSignal): Promise<OllamaResult<unknown>>;
  pull(tag: string, signal?: AbortSignal): Promise<OllamaResult<ReadableStream<Uint8Array> | null>>;
  chat(tag: string, messages: readonly { role: string; content: string }[], signal?: AbortSignal): Promise<OllamaResult<ReadableStream<Uint8Array> | null>>;
}

async function boundedJson(response: Response): Promise<OllamaResult<unknown>> {
  const length = Number(response.headers.get('content-length') ?? '0');
  if (Number.isFinite(length) && length > OLLAMA_MAX_RESPONSE_BYTES) return resultError('response-too-large', 'The local runtime response exceeded the bounded size.');
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > OLLAMA_MAX_RESPONSE_BYTES) return resultError('response-too-large', 'The local runtime response exceeded the bounded size.');
  try { return { ok: true, value: JSON.parse(text) }; } catch { return resultError('malformed-response', 'The local runtime returned malformed JSON.'); }
}

function validateClientPath(path: string): boolean {
  return path.startsWith('/api/ollama/') && !path.includes('..') && !path.includes('\\');
}

export function createOllamaSuiteClient(fetcher: typeof fetch = fetch): OllamaSuiteClient {
  const request = async (path: string, init: RequestInit = {}): Promise<Response | null> => {
    if (!validateClientPath(path)) return null;
    try { return await fetcher(path, { ...init, cache: 'no-store' }); } catch { return null; }
  };
  return {
    async runtime(signal) {
      const response = await request('/api/ollama/runtime', { signal });
      if (!response) return resultError('offline', 'The local runtime endpoint could not be reached.');
      if (!response.ok) return resultError('request-failed', `The local runtime returned HTTP ${response.status}.`);
      const parsed = await boundedJson(response);
      return parsed.ok ? parseRuntimeStatus(parsed.value) : parsed;
    },
    async installed(signal) {
      const response = await request('/api/ollama/installed', { signal });
      if (!response) return resultError('offline', 'Installed model state is unavailable offline.');
      if (!response.ok) return resultError('request-failed', `Installed model state returned HTTP ${response.status}.`);
      const parsed = await boundedJson(response);
      if (!parsed.ok) return parsed;
      const raw = parsed.value as Record<string, unknown>;
      return { ok: true, value: { tags: stringArray(raw.tags, OLLAMA_MAX_VARIANTS, OLLAMA_MAX_MODEL_NAME), running: stringArray(raw.running, OLLAMA_MAX_VARIANTS, OLLAMA_MAX_MODEL_NAME) } };
    },
    async catalogPage(pageToken, signal) {
      const query = pageToken ? `?pageToken=${encodeURIComponent(pageToken)}` : '';
      const response = await request(`/api/ollama/catalog${query}`, { signal });
      if (!response) return resultError('offline', 'The last verified catalog is unavailable offline.');
      if (!response.ok) return resultError('request-failed', `The model catalog returned HTTP ${response.status}.`);
      const parsed = await boundedJson(response);
      return parsed.ok ? parseCatalogPage(parsed.value) : parsed;
    },
    async pull(tag, signal) {
      if (!boundedString(tag, OLLAMA_MAX_MODEL_NAME)) return resultError('invalid-input', 'A model tag is required.');
      const response = await request('/api/ollama/pull', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tag }), signal });
      if (!response) return resultError('offline', 'The local runtime could not start the pull.');
      if (!response.ok) return resultError('request-failed', `The pull request returned HTTP ${response.status}.`);
      return { ok: true, value: response.body };
    },
    async chat(tag, messages, signal) {
      if (!boundedString(tag, OLLAMA_MAX_MODEL_NAME) || messages.length > 100) return resultError('invalid-input', 'Chat needs a bounded model tag and message history.');
      const safeMessages = messages.map((message) => ({ role: message.role.slice(0, 32), content: message.content.slice(0, 100_000) }));
      const response = await request('/api/ollama/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tag, messages: safeMessages }), signal });
      if (!response) return resultError('offline', 'The local runtime could not start chat.');
      if (!response.ok) return resultError('request-failed', `The chat request returned HTTP ${response.status}.`);
      return { ok: true, value: response.body };
    },
  };
}

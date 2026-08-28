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
export const OLLAMA_MAX_QUEUE_ITEMS = 10_000;

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
  contextOverheadBytes: number | null;
  capabilities: string[];
  installed: boolean;
  running: boolean;
  fit: OllamaFitVerdict;
  fitEvidence: string[];
}

export interface OllamaCatalogSnapshot {
  variants: OllamaModelVariant[];
  sourceRevision: string | null;
  sourceIdentity: string | null;
  fetchedAt: string;
  pageCount: number;
  complete: boolean;
  stale: boolean;
  staleAfterMs: number;
  catalogKind: 'official';
}

export interface OllamaHardwareFacts {
  ramBytes: number | null;
  availableRamBytes: number | null;
  vramBytes: number | null;
  freeDiskBytes: number | null;
  architecture: string | null;
  gpu: string | null;
  driver: string | null;
  backend: string | null;
  backendSupported: boolean | null;
  detectedAt: string;
}

export interface OllamaPullRecord {
  id: string;
  tag: string;
  state: 'queued' | 'pulling' | 'paused' | 'completed' | 'cancelled' | 'failed';
  completedBytes: number;
  totalBytes: number | null;
  detail: string | null;
  attempts: number;
  queuedAt: string;
  updatedAt: string;
  retryable: boolean;
  providerStatus: 'queued' | 'pulling' | 'success' | 'error' | 'cancelled' | null;
}

export interface OllamaAttachment {
  name: string;
  mimeType: string;
  bytes: number;
}

export interface OllamaChatParameters {
  temperature: number;
  topP: number;
  topK: number;
  numCtx: number;
  seed: number | null;
}

export interface OllamaChatSession {
  id: string;
  name: string;
  modelTag: string;
  systemPrompt: string;
  parameters: OllamaChatParameters;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string; attachments?: OllamaAttachment[] }>;
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_CHAT_PARAMETERS: OllamaChatParameters = {
  temperature: 0.7,
  topP: 0.9,
  topK: 40,
  numCtx: 8192,
  seed: null,
};

export interface OllamaQueueStorage {
  load(): Promise<OllamaPullRecord[]>;
  save(records: readonly OllamaPullRecord[]): Promise<void>;
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
      contextOverheadBytes: boundedNumber(raw.contextOverheadBytes),
      capabilities: stringArray(raw.capabilities, 32, 80),
      installed: raw.installed === true,
      running: raw.running === true,
      fit: fit as OllamaFitVerdict,
      fitEvidence: stringArray(raw.fitEvidence, 24, 300),
    },
  };
}

function parsePullRecord(value: unknown): OllamaPullRecord | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const id = boundedString(raw.id, 160);
  const tag = boundedString(raw.tag, OLLAMA_MAX_MODEL_NAME);
  const state = raw.state;
  const providerStatus = raw.providerStatus;
  if (!id || !tag || !['queued', 'pulling', 'paused', 'completed', 'cancelled', 'failed'].includes(String(state)) || (providerStatus !== null && !['queued', 'pulling', 'success', 'error', 'cancelled'].includes(String(providerStatus)))) return null;
  const completedBytes = boundedNumber(raw.completedBytes);
  const totalBytes = raw.totalBytes === null ? null : boundedNumber(raw.totalBytes);
  const attempts = boundedNumber(raw.attempts, 100);
  const queuedAt = boundedString(raw.queuedAt, 80);
  const updatedAt = boundedString(raw.updatedAt, 80);
  if (completedBytes === null || totalBytes === undefined || attempts === null || !queuedAt || !updatedAt || typeof raw.retryable !== 'boolean') return null;
  return { id, tag, state: state as OllamaPullRecord['state'], completedBytes, totalBytes, detail: typeof raw.detail === 'string' ? raw.detail.slice(0, 500) : null, attempts, queuedAt, updatedAt, retryable: raw.retryable, providerStatus: providerStatus as OllamaPullRecord['providerStatus'] };
}

export function parseCatalogPage(value: unknown): OllamaResult<{
  variants: OllamaModelVariant[];
  nextPageToken: string | null;
  sourceRevision: string | null;
  sourceIdentity: string | null;
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
      sourceIdentity: boundedString(raw.sourceIdentity, 500),
    },
  };
}

export function parseCatalogSnapshot(value: unknown): OllamaResult<OllamaCatalogSnapshot> {
  if (!value || typeof value !== 'object') return resultError('malformed-response', 'Catalog snapshot was not an object.');
  const raw = value as Record<string, unknown>;
  const page = parseCatalogPage({
    variants: raw.variants,
    nextPageToken: null,
    sourceRevision: raw.sourceRevision,
    sourceIdentity: raw.sourceIdentity,
  });
  if (!page.ok) return page;
  const fetchedAt = boundedString(raw.fetchedAt, 80);
  const pageCount = boundedNumber(raw.pageCount, OLLAMA_MAX_CATALOG_PAGES);
  const staleAfterMs = boundedNumber(raw.staleAfterMs, 7 * 24 * 60 * 60 * 1000);
  if (!fetchedAt || pageCount === null || staleAfterMs === null || raw.complete !== true || raw.catalogKind !== 'official' || !page.value.sourceRevision || !page.value.sourceIdentity) {
    return resultError('malformed-response', 'Catalog snapshot metadata is incomplete.');
  }
  return { ok: true, value: { variants: page.value.variants, sourceRevision: page.value.sourceRevision, sourceIdentity: page.value.sourceIdentity, fetchedAt, pageCount, complete: true, stale: raw.stale === true, staleAfterMs, catalogKind: 'official' } };
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
  let sourceIdentity: string | null = null;
  let pageCount = 0;
  try {
    while (pageCount < OLLAMA_MAX_CATALOG_PAGES) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      pageCount += 1;
      const parsed = parseCatalogPage(await fetchPage(pageToken, signal));
      if (!parsed.ok) return parsed;
      if (sourceRevision !== null && parsed.value.sourceRevision !== sourceRevision) return resultError('malformed-response', 'Official catalog revision changed during pagination.');
      if (sourceIdentity !== null && parsed.value.sourceIdentity !== sourceIdentity) return resultError('malformed-response', 'Official catalog source identity changed during pagination.');
      sourceRevision ??= parsed.value.sourceRevision;
      sourceIdentity ??= parsed.value.sourceIdentity;
      if (variants.some((item) => parsed.value.variants.some((pageItem) => pageItem.tag === item.tag))) return resultError('malformed-response', 'Official catalog pagination repeated a model tag.');
      variants.push(...parsed.value.variants);
      const next = parsed.value.nextPageToken;
      if (!next) break;
      if (seenTokens.has(next)) return resultError('malformed-response', 'Catalog pagination repeated a page token.');
      seenTokens.add(next);
      pageToken = next;
    }
    const complete = pageCount < OLLAMA_MAX_CATALOG_PAGES && pageToken === null && sourceRevision !== null && sourceIdentity !== null;
    const fetchedAt = now();
    return {
      ok: true,
      value: {
        variants,
        sourceRevision,
        sourceIdentity,
        fetchedAt,
        pageCount,
        complete,
        stale: false,
        staleAfterMs,
        catalogKind: 'official',
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
  hardware: Pick<OllamaHardwareFacts, 'ramBytes' | 'availableRamBytes' | 'vramBytes' | 'freeDiskBytes' | 'architecture' | 'backendSupported' | 'backend' | 'driver'>,
): { verdict: OllamaFitVerdict; evidence: string[] } {
  const evidence: string[] = [];
  if (!variant.blobBytes || !hardware.ramBytes || !hardware.availableRamBytes || !hardware.freeDiskBytes) {
    return { verdict: 'unknown', evidence: ['Blob size, total RAM, available RAM, and free destination storage are required.'] };
  }
  const overhead = Math.max(512 * 1024 * 1024, Math.round(variant.blobBytes * 0.2));
  const contextOverhead = variant.contextWindow ? Math.min(4 * 1024 * 1024 * 1024, variant.contextWindow * 4096) : 0;
  const requiredRam = variant.blobBytes + overhead + contextOverhead;
  const requiredDisk = variant.blobBytes + Math.round(variant.blobBytes * 0.1);
  evidence.push(`RAM estimate: ${requiredRam} bytes including bounded runtime overhead.`);
  evidence.push(`Storage estimate: ${requiredDisk} bytes including a bounded download margin.`);
  if (variant.contextWindow) evidence.push(`Context overhead estimate: ${contextOverhead} bytes for ${variant.contextWindow} tokens.`);
  if (hardware.architecture) evidence.push(`Architecture: ${hardware.architecture}.`);
  if (hardware.backend) evidence.push(`Backend: ${hardware.backend}.`);
  if (hardware.driver) evidence.push(`Driver: ${hardware.driver}.`);
  if (hardware.freeDiskBytes < requiredDisk) return { verdict: 'unlikely', evidence: [...evidence, 'Free destination storage is below the conservative estimate.'] };
  if (hardware.availableRamBytes < requiredRam) return { verdict: 'unlikely', evidence: [...evidence, 'Available RAM is below the conservative estimate.'] };
  if (hardware.backendSupported === false) return { verdict: 'unlikely', evidence: [...evidence, 'The detected backend does not support this runtime.'] };
  if (hardware.backendSupported === null) return { verdict: 'runs-with-limits', evidence: [...evidence, 'Backend support is unknown, so the verdict is conservative.'] };
  if (hardware.vramBytes !== null && hardware.vramBytes < variant.blobBytes) return { verdict: 'runs-with-limits', evidence: [...evidence, 'VRAM is below the model blob size, so CPU or shared-memory execution may be required.'] };
  if (variant.contextWindow && variant.contextWindow > 131_072) {
    return { verdict: 'runs-with-limits', evidence: [...evidence, 'The declared context window is large and may need a lower setting.'] };
  }
  if (variant.parameterCount === null || variant.quantization === null) {
    return { verdict: 'runs-with-limits', evidence: [...evidence, 'Parameter count or quantization metadata is missing, so the verdict is conservative.'] };
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
      contextOverheadBytes: null,
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

export function attachmentCapability(
  variant: Pick<OllamaModelVariant, 'capabilities'>,
  attachment: Pick<OllamaAttachment, 'mimeType' | 'bytes'>,
): { allowed: boolean; reason: string } {
  const type = attachment.mimeType.toLowerCase();
  const capability = type.startsWith('image/')
    ? 'vision'
    : type.startsWith('text/') || type === 'application/json'
      ? 'text'
      : 'file';
  if (!variant.capabilities.includes(capability)) {
    return { allowed: false, reason: `Selected model does not declare ${capability} capability.` };
  }
  if (!Number.isFinite(attachment.bytes) || attachment.bytes < 0 || attachment.bytes > 20 * 1024 * 1024) {
    return { allowed: false, reason: 'Attachment exceeds the bounded 20 MiB limit.' };
  }
  return { allowed: true, reason: 'Selected model declares this attachment capability.' };
}

export function validateChatParameters(value: unknown): OllamaResult<OllamaChatParameters> {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const temperature = boundedNumber(raw.temperature, 2);
  const topP = boundedNumber(raw.topP, 1);
  const topK = boundedNumber(raw.topK, 1_000);
  const numCtx = boundedNumber(raw.numCtx, 1_000_000);
  const seed = raw.seed === null || typeof raw.seed === 'undefined' ? null : boundedNumber(raw.seed, 2_147_483_647);
  if (temperature === null || topP === null || topK === null || numCtx === null || (raw.seed !== null && typeof raw.seed !== 'undefined' && seed === null)) {
    return resultError('invalid-input', 'Chat parameters are outside their documented bounds.');
  }
  return { ok: true, value: { temperature, topP, topK, numCtx, seed } };
}

export function createChatSession(modelTag: string, name = 'Local chat', now = () => new Date().toISOString()): OllamaChatSession {
  const timestamp = now();
  return { id: typeof globalThis.crypto?.randomUUID === 'function' ? globalThis.crypto.randomUUID() : `chat-${Date.now()}`, name: name.slice(0, 120), modelTag: modelTag.slice(0, OLLAMA_MAX_MODEL_NAME), systemPrompt: '', parameters: { ...DEFAULT_CHAT_PARAMETERS }, messages: [], createdAt: timestamp, updatedAt: timestamp };
}

export function redactChatExport(session: OllamaChatSession): Record<string, unknown> {
  return { version: 1, id: session.id, name: session.name, modelTag: session.modelTag, systemPrompt: session.systemPrompt, parameters: session.parameters, messages: session.messages.map((message) => ({ role: message.role, content: message.content, attachments: message.attachments?.map((attachment) => ({ name: attachment.name, mimeType: attachment.mimeType, bytes: attachment.bytes })) })) };
}

export function createPullQueue(storage: OllamaQueueStorage, now = () => new Date().toISOString()) {
  let records: OllamaPullRecord[] = [];
  let paused = false;
  let active = 0;
  const controllers = new Map<string, AbortController>();
  const ready = storage.load().then((loaded) => {
    records = loaded.slice(0, OLLAMA_MAX_QUEUE_ITEMS).map((record) => record.state === 'pulling'
      ? { ...record, state: 'queued', detail: 'Recovered after restart.', updatedAt: now(), retryable: true }
      : record);
  });
  const persist = async () => storage.save(records);
  const schedule = async () => {
    await ready;
    if (paused || active >= 2) return;
    const next = records.find((record) => record.state === 'queued');
    if (!next) return;
    active += 1;
    next.state = 'pulling';
    next.attempts += 1;
    next.updatedAt = now();
    next.detail = 'Starting local pull.';
    controllers.set(next.id, new AbortController());
    await persist();
  };
  return {
    async list(): Promise<OllamaPullRecord[]> { await ready; return records.map((record) => ({ ...record })); },
    async enqueue(tag: string): Promise<OllamaResult<OllamaPullRecord>> {
      await ready;
      if (!boundedString(tag, OLLAMA_MAX_MODEL_NAME)) return resultError('invalid-input', 'A model tag is required.');
      if (records.length >= OLLAMA_MAX_QUEUE_ITEMS) return resultError('invalid-input', 'The durable pull queue reached its bounded item limit.');
      const record: OllamaPullRecord = { id: typeof globalThis.crypto?.randomUUID === 'function' ? globalThis.crypto.randomUUID() : `${tag}-${Date.now()}-${Math.random().toString(16).slice(2)}`, tag, state: 'queued', completedBytes: 0, totalBytes: null, detail: null, attempts: 0, queuedAt: now(), updatedAt: now(), retryable: true, providerStatus: 'queued' };
      records.push(record);
      await persist();
      await schedule();
      return { ok: true, value: { ...record } };
    },
    async update(id: string, patch: Partial<OllamaPullRecord>): Promise<OllamaResult<OllamaPullRecord>> {
      await ready;
      const record = records.find((item) => item.id === id);
      if (!record) return resultError('invalid-input', 'Unknown pull queue item.');
      Object.assign(record, patch, { updatedAt: now() });
      await persist();
      if (record.state === 'completed' || record.state === 'failed' || record.state === 'cancelled') {
        active = Math.max(0, active - 1);
        controllers.delete(record.id);
      }
      await schedule();
      return { ok: true, value: { ...record } };
    },
    async pause(): Promise<void> {
      paused = true;
      await ready;
      for (const record of records) if (record.state === 'pulling') record.state = 'paused';
      await persist();
    },
    async resume(): Promise<void> { paused = false; await schedule(); },
    async cancel(id: string): Promise<OllamaResult<OllamaPullRecord>> {
      controllers.get(id)?.abort();
      return this.update(id, { state: 'cancelled', detail: 'Cancelled by the user.', retryable: false });
    },
    async retry(id: string): Promise<OllamaResult<OllamaPullRecord>> {
      return this.update(id, { state: 'queued', detail: 'Queued for retry.', retryable: true });
    },
    async reconcile(): Promise<OllamaPullRecord[]> {
      await ready;
      records = records.filter((record) => record.state !== 'cancelled');
      await persist();
      return this.list();
    },
  };
}

export interface OllamaSuiteClient {
  runtime(signal?: AbortSignal): Promise<OllamaResult<OllamaRuntimeStatus>>;
  hardware(signal?: AbortSignal): Promise<OllamaResult<OllamaHardwareFacts>>;
  installed(signal?: AbortSignal): Promise<OllamaResult<{ tags: string[]; running: string[] }>>;
  pulls(signal?: AbortSignal): Promise<OllamaResult<{ records: OllamaPullRecord[]; concurrency: number }>>;
  pullAction(id: string, action: 'cancel' | 'pause' | 'resume' | 'retry', signal?: AbortSignal): Promise<OllamaResult<OllamaPullRecord>>;
  catalogPage(pageToken: string | null, signal?: AbortSignal): Promise<OllamaResult<unknown>>;
  pull(tag: string, signal?: AbortSignal): Promise<OllamaResult<{ stream: ReadableStream<Uint8Array> | null; id: string | null }>>;
  chat(tag: string, messages: readonly { role: string; content: string }[], parameters?: OllamaChatParameters, signal?: AbortSignal, systemPrompt?: string): Promise<OllamaResult<ReadableStream<Uint8Array> | null>>;
  harnessPreflight(profile: OllamaHarnessProfile, signal?: AbortSignal): Promise<OllamaResult<Record<string, unknown>>>;
  harnessLaunch(profile: OllamaHarnessProfile, signal?: AbortSignal): Promise<OllamaResult<Record<string, unknown>>>;
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
    async hardware(signal) {
      const response = await request('/api/ollama/hardware', { signal });
      if (!response) return resultError('offline', 'Host hardware facts are unavailable.');
      if (!response.ok) return resultError('request-failed', `Hardware facts returned HTTP ${response.status}.`);
      const parsed = await boundedJson(response);
      if (!parsed.ok) return parsed;
      const raw = parsed.value as Record<string, unknown>;
      return { ok: true, value: { ramBytes: boundedNumber(raw.ramBytes), vramBytes: boundedNumber(raw.vramBytes), freeDiskBytes: boundedNumber(raw.freeDiskBytes), architecture: boundedString(raw.architecture, 40), gpu: boundedString(raw.gpu, 160), driver: boundedString(raw.driver, 160), backend: boundedString(raw.backend, 80), backendSupported: typeof raw.backendSupported === 'boolean' ? raw.backendSupported : null, detectedAt: boundedString(raw.detectedAt, 80) ?? new Date(0).toISOString() } };
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
    async pulls(signal) {
      const response = await request('/api/ollama/pulls', { signal });
      if (!response) return resultError('offline', 'The durable pull queue is unavailable.');
      if (!response.ok) return resultError('request-failed', `The pull queue returned HTTP ${response.status}.`);
      const parsed = await boundedJson(response);
      if (!parsed.ok) return parsed;
      const raw = parsed.value as Record<string, unknown>;
      const records = Array.isArray(raw.records) ? raw.records.flatMap((item) => { const record = parsePullRecord(item); return record ? [record] : []; }) : [];
      return { ok: true, value: { records, concurrency: typeof raw.concurrency === 'number' ? raw.concurrency : 2 } };
    },
    async pullAction(id, action, signal) {
      if (!/^[a-zA-Z0-9._:-]{1,240}$/.test(id)) return resultError('invalid-input', 'Pull queue id is invalid.');
      const response = await request(`/api/ollama/pulls/${encodeURIComponent(id)}/${action}`, { method: 'POST', signal });
      if (!response) return resultError('offline', 'The durable pull queue is unavailable.');
      const parsed = await boundedJson(response);
      if (!parsed.ok) return parsed;
      if (!response.ok) return resultError('request-failed', `Pull action returned HTTP ${response.status}.`);
      return { ok: true, value: parsed.value as OllamaPullRecord };
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
      return { ok: true, value: { stream: response.body, id: response.headers.get('x-ollama-pull-id') } };
    },
    async chat(tag, messages, parameters = DEFAULT_CHAT_PARAMETERS, signal, systemPrompt = '') {
      if (!boundedString(tag, OLLAMA_MAX_MODEL_NAME) || messages.length > 100) return resultError('invalid-input', 'Chat needs a bounded model tag and message history.');
      const checkedParameters = validateChatParameters(parameters);
      if (!checkedParameters.ok) return checkedParameters;
      const safeMessages = messages.map((message) => ({ role: message.role.slice(0, 32), content: message.content.slice(0, 100_000) }));
      const safeSystemPrompt = systemPrompt.slice(0, 100_000);
      const response = await request('/api/ollama/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tag, messages: safeMessages, parameters: checkedParameters.value, systemPrompt: safeSystemPrompt }), signal });
      if (!response) return resultError('offline', 'The local runtime could not start chat.');
      if (!response.ok) return resultError('request-failed', `The chat request returned HTTP ${response.status}.`);
      return { ok: true, value: response.body };
    },
    async harnessPreflight(profile, signal) {
      const validated = validateHarnessProfile(profile);
      if (!validated.ok) return validated;
      const response = await request('/api/ollama/harness/preflight', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ profile: validated.value }), signal });
      if (!response) return resultError('offline', 'Harness preflight is unavailable.');
      const parsed = await boundedJson(response);
      if (!parsed.ok) return parsed;
      return response.ok ? { ok: true, value: parsed.value as Record<string, unknown> } : resultError('request-failed', 'Harness preflight was refused.');
    },
    async harnessLaunch(profile, signal) {
      const validated = validateHarnessProfile(profile);
      if (!validated.ok) return validated;
      const response = await request('/api/ollama/harness/launch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ profile: validated.value }), signal });
      if (!response) return resultError('offline', 'Harness launch is unavailable.');
      const parsed = await boundedJson(response);
      if (!parsed.ok) return parsed;
      return response.ok ? { ok: true, value: parsed.value as Record<string, unknown> } : resultError('request-failed', 'Harness launch was refused.');
    },
  };
}

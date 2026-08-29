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
export const OLLAMA_MAX_TOTAL_CATALOG_VARIANTS = OLLAMA_MAX_VARIANTS + 100;
export const OLLAMA_MAX_LOCAL_DETAIL_MODELS = 100;
export const OLLAMA_MAX_MODEL_NAME = 160;
export const OLLAMA_MAX_PROFILE_NAME = 120;
export const OLLAMA_MAX_ARGUMENTS = 64;
export const OLLAMA_MAX_MESSAGES = 100;
export const OLLAMA_MAX_MESSAGE_CHARS = 100_000;
export const OLLAMA_MAX_MESSAGE_BYTES = 100_000;
export const OLLAMA_MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const OLLAMA_MAX_ATTACHMENT_TOTAL_BYTES = 20 * 1024 * 1024;
export const OLLAMA_RESPONSE_READ_TIMEOUT_MS = 15_000;
export const OLLAMA_MAX_STREAM_BYTES = 8 * 1024 * 1024;
export const OLLAMA_MAX_NDJSON_LINE_BYTES = 128 * 1024;
export const OLLAMA_MAX_NDJSON_LINES = 100_000;

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

export interface OllamaLocalModelDetail {
  tag: string;
  capabilities: string[];
  contextWindow: number | null;
  parameterCount: number | null;
  installed: boolean;
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

export interface OllamaHostBridge {
  runtime(signal?: AbortSignal): Promise<OllamaResult<OllamaRuntimeStatus>>;
  hardware(signal?: AbortSignal): Promise<OllamaResult<OllamaHardwareFacts>>;
  installed(signal?: AbortSignal): Promise<OllamaResult<{ tags: string[]; running: string[] }>>;
  pulls(signal?: AbortSignal): Promise<OllamaResult<{ records: OllamaPullRecord[]; concurrency: number }>>;
  pullAction(id: string, action: 'cancel' | 'pause' | 'resume' | 'retry', signal?: AbortSignal): Promise<OllamaResult<OllamaPullRecord>>;
  catalogPage(pageToken: string | null, signal?: AbortSignal, selectedTag?: string | null, refreshId?: string): Promise<OllamaResult<unknown>>;
  pull(tag: string, signal?: AbortSignal): Promise<OllamaResult<{ stream: ReadableStream<Uint8Array> | null; id: string | null }>>;
  chat(tag: string, messages: readonly OllamaChatMessage[], parameters?: OllamaChatParameters, signal?: AbortSignal, systemPrompt?: string): Promise<OllamaResult<ReadableStream<Uint8Array> | null>>;
  harnessPreflight(profile: OllamaHarnessProfile, signal?: AbortSignal): Promise<OllamaResult<Record<string, unknown>>>;
  harnessRegister(profile: OllamaHarnessProfile, signal?: AbortSignal): Promise<OllamaResult<OllamaHarnessProfile>>;
  harnessLaunch(profile: OllamaHarnessProfile, signal?: AbortSignal): Promise<OllamaResult<Record<string, unknown>>>;
  harnessRestore(profileId: string, signal?: AbortSignal): Promise<OllamaResult<Record<string, unknown>>>;
}

export type OllamaHostBridgeState =
  | { available: true; bridge: OllamaSuiteClient }
  | { available: false; reason: string };

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
  rateBytesPerSecond: number | null;
  etaSeconds: number | null;
  partialOutcome: 'none' | 'some' | 'all' | null;
}

export interface OllamaAttachment {
  name: string;
  mimeType: string;
  bytes: number;
  dataBase64?: string;
}

export interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  attachments?: OllamaAttachment[];
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
  messages: OllamaChatMessage[];
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


export interface OllamaHarnessProfile {
  id: string;
  name: string;
  executable: string;
  arguments: string[];
  workingDirectory: string | null;
  environmentKeys: string[];
  modelTag: string;
  healthUrl: string | null;
  registered: boolean;
  executableIdentity?: { path: string; size: number; mtimeMs: number; sha256: string };
  snapshotId?: string;
  preflightNonce?: string;
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

function boundedInteger(value: unknown, max = Number.MAX_SAFE_INTEGER): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max
    ? value
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
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
  if (!isRecord(value)) return resultError('malformed-response', 'Runtime status was not an object.');
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
  if (!isRecord(value)) return resultError('malformed-response', 'A model variant was not an object.');
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

export function parsePullRecord(value: unknown): OllamaPullRecord | null {
  if (!isRecord(value)) return null;
  const raw = value as Record<string, unknown>;
  const id = boundedString(raw.id, 160);
  const tag = boundedString(raw.tag, OLLAMA_MAX_MODEL_NAME);
  const state = raw.state;
  const providerStatus = raw.providerStatus;
  if (!id || !tag || !['queued', 'pulling', 'paused', 'completed', 'cancelled', 'failed'].includes(String(state)) || (providerStatus !== null && !['queued', 'pulling', 'success', 'error', 'cancelled'].includes(String(providerStatus)))) return null;
  if (!Object.prototype.hasOwnProperty.call(raw, 'totalBytes') || !Object.prototype.hasOwnProperty.call(raw, 'providerStatus') || !Object.prototype.hasOwnProperty.call(raw, 'partialOutcome') || !Object.prototype.hasOwnProperty.call(raw, 'detail') || !Object.prototype.hasOwnProperty.call(raw, 'rateBytesPerSecond') || !Object.prototype.hasOwnProperty.call(raw, 'etaSeconds')) return null;
  const completedBytes = boundedInteger(raw.completedBytes);
  const totalBytes = raw.totalBytes === null ? null : boundedInteger(raw.totalBytes);
  const attempts = boundedInteger(raw.attempts, 100);
  const queuedAt = boundedString(raw.queuedAt, 80);
  const updatedAt = boundedString(raw.updatedAt, 80);
  if (completedBytes === null || totalBytes === undefined || (raw.totalBytes !== null && totalBytes === null) || attempts === null || !queuedAt || !updatedAt || typeof raw.retryable !== 'boolean') return null;
  const detail = raw.detail === null ? null : boundedString(raw.detail, 500);
  if (raw.detail !== null && detail === null) return null;
  const rateBytesPerSecond = raw.rateBytesPerSecond === null ? null : boundedNumber(raw.rateBytesPerSecond);
  const etaSeconds = raw.etaSeconds === null ? null : boundedNumber(raw.etaSeconds, 31_536_000);
  if (raw.rateBytesPerSecond !== null && rateBytesPerSecond === null || raw.etaSeconds !== null && etaSeconds === null) return null;
  const partialOutcome = raw.partialOutcome === null ? null : ['none', 'some', 'all'].includes(String(raw.partialOutcome)) ? raw.partialOutcome as 'none' | 'some' | 'all' : null;
  if (partialOutcome === null && raw.partialOutcome !== null) return null;
  const stateValue = state as OllamaPullRecord['state'];
  const providerValue = providerStatus as OllamaPullRecord['providerStatus'];
  const terminalConsistent = stateValue === 'completed'
    ? providerValue === 'success' && raw.retryable === false && partialOutcome === 'all'
    : stateValue === 'failed'
      ? providerValue === 'error' && raw.retryable === true
      : stateValue === 'cancelled'
        ? providerValue === 'cancelled' && raw.retryable === false
        : stateValue === 'queued'
          ? providerValue === 'queued'
          : stateValue === 'paused'
            ? providerValue === 'cancelled'
            : providerValue === 'pulling';
  if (!terminalConsistent) return null;
  return { id, tag, state: stateValue, completedBytes, totalBytes, detail, attempts, queuedAt, updatedAt, retryable: raw.retryable, providerStatus: providerValue, rateBytesPerSecond, etaSeconds, partialOutcome };
}

export function parseCatalogPage(value: unknown): OllamaResult<{
  variants: OllamaModelVariant[];
  localDetails: OllamaLocalModelDetail[];
  nextPageToken: string | null;
  sourceRevision: string | null;
  sourceIdentity: string | null;
}> {
  if (!isRecord(value)) return resultError('malformed-response', 'Catalog page was not an object.');
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.variants)) return resultError('malformed-response', 'Catalog page omitted variants.');
  if (raw.variants.length > OLLAMA_MAX_TOTAL_CATALOG_VARIANTS) return resultError('malformed-response', 'Catalog page exceeded the variant bound.');
  if (!Object.prototype.hasOwnProperty.call(raw, 'nextPageToken') || !Object.prototype.hasOwnProperty.call(raw, 'sourceRevision') || !Object.prototype.hasOwnProperty.call(raw, 'sourceIdentity')) return resultError('malformed-response', 'Catalog page omitted pagination or source metadata.');
  if ((raw.nextPageToken !== null && boundedString(raw.nextPageToken, 500) === null) || (raw.sourceRevision !== null && boundedString(raw.sourceRevision, 200) === null) || (raw.sourceIdentity !== null && boundedString(raw.sourceIdentity, 500) === null)) return resultError('malformed-response', 'Catalog page contained invalid pagination or source metadata.');
  const pageTags = new Set<string>();
  const variants: OllamaModelVariant[] = [];
  for (const item of raw.variants) {
    const parsed = parseVariant(item);
    if (!parsed.ok) return parsed;
    if (pageTags.has(parsed.value.tag)) return resultError('malformed-response', 'Catalog page repeated a model tag.');
    pageTags.add(parsed.value.tag);
    variants.push(parsed.value);
  }
  const localDetails: OllamaLocalModelDetail[] = [];
  if (raw.localDetails !== undefined) {
    if (!Array.isArray(raw.localDetails) || raw.localDetails.length > OLLAMA_MAX_LOCAL_DETAIL_MODELS) return resultError('malformed-response', 'Catalog local detail metadata exceeded its bound.');
    const localDetailTags = new Set<string>();
    for (const item of raw.localDetails) {
      if (!isRecord(item)) return resultError('malformed-response', 'Catalog local detail metadata was malformed.');
      const tag = boundedString(item.tag, OLLAMA_MAX_MODEL_NAME);
      const capabilities = stringArray(item.capabilities, 8, 40);
      const contextWindow = item.contextWindow === null ? null : boundedNumber(item.contextWindow, 10_000_000);
      const parameterCount = item.parameterCount === null ? null : boundedNumber(item.parameterCount);
      const fitEvidence = stringArray(item.fitEvidence, 8, 300);
      if (!tag || localDetailTags.has(tag) || !Array.isArray(item.capabilities) || (item.contextWindow !== null && contextWindow === null) || (item.parameterCount !== null && parameterCount === null) || !Array.isArray(item.fitEvidence) || typeof item.installed !== 'boolean') return resultError('malformed-response', 'Catalog local detail metadata was invalid.');
      localDetailTags.add(tag);
      localDetails.push({ tag, capabilities, contextWindow, parameterCount, installed: item.installed, fitEvidence });
    }
  }
  return {
    ok: true,
    value: {
      variants,
      localDetails,
      nextPageToken: boundedString(raw.nextPageToken, 500),
      sourceRevision: boundedString(raw.sourceRevision, 200),
      sourceIdentity: boundedString(raw.sourceIdentity, 500),
    },
  };
}

export function parseCatalogSnapshot(value: unknown): OllamaResult<OllamaCatalogSnapshot> {
  if (!isRecord(value)) return resultError('malformed-response', 'Catalog snapshot was not an object.');
  const raw = value as Record<string, unknown>;
  const page = parseCatalogPage({
    variants: raw.variants,
    localDetails: raw.localDetails,
    nextPageToken: null,
    sourceRevision: raw.sourceRevision,
    sourceIdentity: raw.sourceIdentity,
  });
  if (!page.ok) return page;
  const fetchedAt = boundedString(raw.fetchedAt, 80);
  const pageCount = boundedNumber(raw.pageCount, OLLAMA_MAX_CATALOG_PAGES);
  const staleAfterMs = boundedNumber(raw.staleAfterMs, 7 * 24 * 60 * 60 * 1000);
  if (!fetchedAt || pageCount === null || staleAfterMs === null || typeof raw.complete !== 'boolean' || raw.catalogKind !== 'official' || !page.value.sourceIdentity || (raw.complete && !page.value.sourceRevision)) {
    return resultError('malformed-response', 'Catalog snapshot metadata is incomplete.');
  }
  return { ok: true, value: { variants: page.value.variants, sourceRevision: page.value.sourceRevision, sourceIdentity: page.value.sourceIdentity, fetchedAt, pageCount, complete: raw.complete, stale: raw.stale === true, staleAfterMs, catalogKind: 'official' } };
}

let ollamaRefreshCounter = 0;

export function createOllamaRefreshId(randomUUID: (() => string) | null = typeof globalThis.crypto?.randomUUID === 'function' ? () => globalThis.crypto.randomUUID() : null): string {
  const candidate = randomUUID?.();
  if (candidate && /^[a-f0-9-]{20,80}$/i.test(candidate)) return candidate;
  ollamaRefreshCounter = (ollamaRefreshCounter + 1) % 0xfffffff;
  const timestamp = Date.now().toString(16);
  const counter = ollamaRefreshCounter.toString(16).padStart(7, '0');
  const entropy = Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
  return `${timestamp}-${counter}-${entropy}`;
}

export async function collectCatalog(
  fetchPage: (pageToken: string | null, signal: AbortSignal) => Promise<unknown>,
  signal: AbortSignal,
  now = () => new Date().toISOString(),
  staleAfterMs = 6 * 60 * 60 * 1000,
): Promise<OllamaResult<OllamaCatalogSnapshot>> {
  const variants: OllamaModelVariant[] = [];
  const seenTokens = new Set<string>();
  const seenTags = new Set<string>();
  let pageToken: string | null = null;
  let sourceRevision: string | null = null;
  let sourceIdentity: string | null = null;
  const localDetailsByTag = new Map<string, OllamaLocalModelDetail>();
  let revisionVerified = true;
  let pageCount = 0;
  try {
    while (pageCount < OLLAMA_MAX_CATALOG_PAGES) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      pageCount += 1;
      const parsed = parseCatalogPage(await fetchPage(pageToken, signal));
      if (!parsed.ok) return parsed;
      if (!parsed.value.sourceIdentity) return resultError('malformed-response', 'Official catalog page omitted source identity.');
      if (sourceIdentity !== null && parsed.value.sourceIdentity !== sourceIdentity) return resultError('malformed-response', 'Official catalog source identity changed during pagination.');
      sourceIdentity ??= parsed.value.sourceIdentity;
      if (parsed.value.sourceRevision === null) {
        revisionVerified = false;
        sourceRevision = null;
      } else if (revisionVerified && sourceRevision !== null && parsed.value.sourceRevision !== sourceRevision) {
        return resultError('malformed-response', 'Official catalog revision changed during pagination.');
      } else if (revisionVerified) {
        sourceRevision ??= parsed.value.sourceRevision;
      }
      if (variants.length + parsed.value.variants.length > OLLAMA_MAX_VARIANTS) return resultError('malformed-response', 'Official catalog exceeded the variant bound.');
      if (parsed.value.variants.some((item) => seenTags.has(item.tag))) return resultError('malformed-response', 'Official catalog pagination repeated a model tag.');
      for (const detail of parsed.value.localDetails) localDetailsByTag.set(detail.tag, detail);
      parsed.value.variants.forEach((item) => seenTags.add(item.tag));
      variants.push(...parsed.value.variants);
      const next = parsed.value.nextPageToken;
      if (!next) {
        pageToken = null;
        break;
      }
      if (seenTokens.has(next)) return resultError('malformed-response', 'Catalog pagination repeated a page token.');
      seenTokens.add(next);
      pageToken = next;
    }
    for (const [tag, detail] of localDetailsByTag) {
      if (seenTags.has(tag) || variants.length >= OLLAMA_MAX_TOTAL_CATALOG_VARIANTS) continue;
      variants.push({ tag, family: null, parameterSize: null, parameterCount: detail.parameterCount, quantization: null, blobBytes: null, contextWindow: detail.contextWindow, contextOverheadBytes: null, capabilities: detail.capabilities, installed: detail.installed, running: false, fit: 'unknown', fitEvidence: detail.fitEvidence });
    }
    const complete = pageCount < OLLAMA_MAX_CATALOG_PAGES && pageToken === null && revisionVerified && sourceRevision !== null && sourceIdentity !== null;
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
  variant: Pick<OllamaModelVariant, 'blobBytes' | 'parameterCount' | 'quantization' | 'contextWindow'> & Partial<Pick<OllamaModelVariant, 'contextOverheadBytes'>>,
  hardware: Pick<OllamaHardwareFacts, 'ramBytes' | 'vramBytes' | 'freeDiskBytes' | 'architecture' | 'backendSupported' | 'backend' | 'driver'> & Partial<Pick<OllamaHardwareFacts, 'availableRamBytes'>>,
): { verdict: OllamaFitVerdict; evidence: string[] } {
  const evidence: string[] = [];
  if (variant.blobBytes === null || variant.blobBytes === undefined || variant.blobBytes <= 0 || hardware.ramBytes === null || hardware.ramBytes === undefined || hardware.availableRamBytes === null || hardware.availableRamBytes === undefined || hardware.freeDiskBytes === null || hardware.freeDiskBytes === undefined) {
    return { verdict: 'unknown', evidence: ['Blob size, total RAM, available RAM, and free destination storage are required.'] };
  }
  const overhead = Math.max(512 * 1024 * 1024, Math.round(variant.blobBytes * 0.2));
  const contextOverhead = variant.contextOverheadBytes ?? (variant.contextWindow ? Math.min(4 * 1024 * 1024 * 1024, variant.contextWindow * 4096) : 0);
  const requiredRam = variant.blobBytes + overhead + contextOverhead;
  const requiredDisk = variant.blobBytes + Math.round(variant.blobBytes * 0.1);
  if (hardware.ramBytes < hardware.availableRamBytes) evidence.push('Available RAM exceeds reported total RAM, so the hardware facts are inconsistent.');
  evidence.push(`RAM estimate: ${requiredRam} bytes including bounded runtime overhead.`);
  evidence.push(`Storage estimate: ${requiredDisk} bytes including a bounded download margin.`);
  if (variant.contextWindow) evidence.push(`Context overhead estimate: ${contextOverhead} bytes for ${variant.contextWindow} tokens.`);
  if (hardware.architecture) evidence.push(`Architecture: ${hardware.architecture}.`);
  if (hardware.backend) evidence.push(`Backend: ${hardware.backend}.`);
  if (hardware.driver) evidence.push(`Driver: ${hardware.driver}.`);
  if (!hardware.vramBytes) evidence.push('VRAM evidence is unavailable; the verdict does not promise GPU execution.');
  if (!hardware.driver) evidence.push('Driver evidence is unavailable; the verdict stays conservative.');
  if (hardware.freeDiskBytes < requiredDisk) return { verdict: 'unlikely', evidence: [...evidence, 'Free destination storage is below the conservative estimate.'] };
  if (hardware.availableRamBytes < requiredRam) return { verdict: 'unlikely', evidence: [...evidence, 'Available RAM is below the conservative estimate.'] };
  if (hardware.ramBytes < hardware.availableRamBytes) return { verdict: 'unknown', evidence: [...evidence, 'Total and available RAM facts disagree.'] };
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

export function parseHardwareFacts(value: unknown): OllamaResult<OllamaHardwareFacts> {
  if (!isRecord(value)) return resultError('malformed-response', 'Hardware facts were not an object.');
  const optionalNumber = (key: string): number | null => value[key] === null ? null : boundedNumber(value[key]);
  const ramBytes = optionalNumber('ramBytes');
  const availableRamBytes = optionalNumber('availableRamBytes');
  const vramBytes = optionalNumber('vramBytes');
  const freeDiskBytes = optionalNumber('freeDiskBytes');
  const detectedAt = boundedString(value.detectedAt, 80);
  if (value.ramBytes !== null && ramBytes === null || value.availableRamBytes !== null && availableRamBytes === null || value.vramBytes !== null && vramBytes === null || value.freeDiskBytes !== null && freeDiskBytes === null || !detectedAt) {
    return resultError('malformed-response', 'Hardware facts were incomplete or outside their bounds.');
  }
  return {
    ok: true,
    value: {
      ramBytes,
      availableRamBytes,
      vramBytes,
      freeDiskBytes,
      architecture: boundedString(value.architecture, 40),
      gpu: boundedString(value.gpu, 160),
      driver: boundedString(value.driver, 160),
      backend: boundedString(value.backend, 80),
      backendSupported: typeof value.backendSupported === 'boolean' ? value.backendSupported : null,
      detectedAt,
    },
  };
}

function parseInstalledState(value: unknown): OllamaResult<{ tags: string[]; running: string[] }> {
  if (!isRecord(value) || !Array.isArray(value.tags) || !Array.isArray(value.running)) return resultError('malformed-response', 'Installed model state was malformed.');
  if (value.tags.length > OLLAMA_MAX_VARIANTS || value.running.length > OLLAMA_MAX_VARIANTS) return resultError('malformed-response', 'Installed model state exceeded the variant bound.');
  const tags = stringArray(value.tags, OLLAMA_MAX_VARIANTS, OLLAMA_MAX_MODEL_NAME);
  const running = stringArray(value.running, OLLAMA_MAX_VARIANTS, OLLAMA_MAX_MODEL_NAME);
  if (tags.length !== value.tags.length || running.length !== value.running.length) return resultError('malformed-response', 'Installed model state contained an invalid tag.');
  return { ok: true, value: { tags, running } };
}

function parsePullList(value: unknown): OllamaResult<{ records: OllamaPullRecord[]; concurrency: number }> {
  if (!isRecord(value) || !Array.isArray(value.records)) return resultError('malformed-response', 'The durable pull queue response was malformed.');
  if (value.records.length > OLLAMA_MAX_VARIANTS) return resultError('malformed-response', 'The durable pull queue exceeded its bound.');
  const records: OllamaPullRecord[] = [];
  for (const item of value.records) {
    const record = parsePullRecord(item);
    if (!record) return resultError('malformed-response', 'The durable pull queue contained an invalid record.');
    records.push(record);
  }
  const concurrency = boundedInteger(value.concurrency, 64);
  if (concurrency === null || concurrency === 0) return resultError('malformed-response', 'The durable pull queue reported an invalid concurrency.');
  return { ok: true, value: { records, concurrency } };
}

export function validateHarnessProfile(value: unknown): OllamaResult<OllamaHarnessProfile> {
  if (!isRecord(value)) return resultError('invalid-input', 'Harness profile must be an object.');
  const raw = value as Record<string, unknown>;
  const id = boundedString(raw.id, 80);
  const name = boundedString(raw.name, OLLAMA_MAX_PROFILE_NAME);
  const executable = boundedString(raw.executable, 400);
  const modelTag = boundedString(raw.modelTag, OLLAMA_MAX_MODEL_NAME);
  const healthUrl = raw.healthUrl === null || typeof raw.healthUrl === 'undefined' ? null : boundedString(raw.healthUrl, 300);
  if (!Array.isArray(raw.arguments) || !Array.isArray(raw.environmentKeys)) return resultError('invalid-input', 'Harness profile arguments and environment keys must be arrays.');
  const args = stringArray(raw.arguments, OLLAMA_MAX_ARGUMENTS, 500);
  const env = stringArray(raw.environmentKeys, 64, 120);
  if (!id || !name || !executable || !modelTag) return resultError('invalid-input', 'Harness profile needs id, name, executable, and model tag.');
  if (args.length !== raw.arguments.length || env.length !== raw.environmentKeys.length) return resultError('invalid-input', 'Harness profile arguments and environment keys must be bounded strings.');
  if (raw.healthUrl !== null && typeof raw.healthUrl !== 'undefined' && !healthUrl) return resultError('invalid-input', 'Health URL must be a bounded loopback URL.');
  if (healthUrl && !isLoopbackOllamaOrigin(healthUrl)) return resultError('invalid-input', 'Health URL must use a credential-free loopback origin.');
  if (/[;&|<>`$\r\n]/.test(executable) || args.some((arg) => /[;&|<>`\r\n]/.test(arg))) {
    return resultError('invalid-input', 'Shell syntax is not allowed in an executable or argument.');
  }
  const executableName = executable.replaceAll('\\', '/').split('/').pop()?.toLowerCase();
  if (executableName !== 'ollama' && executableName !== 'ollama.exe') return resultError('invalid-input', 'Only the verified Ollama executable is allowed.');
  if (args.length < 2 || args[0] !== 'run' || args[1] !== modelTag || args.slice(2).some((arg) => !['--verbose', '--nowordwrap'].includes(arg))) return resultError('invalid-input', 'Harness arguments must use the allowlisted Ollama run profile.');
  if (typeof raw.workingDirectory !== 'undefined' && raw.workingDirectory !== null && boundedString(raw.workingDirectory, 500) === null) {
    return resultError('invalid-input', 'Working directory is not a bounded path value.');
  }
  const identity = raw.executableIdentity;
  if (identity !== undefined && (!isRecord(identity) || typeof identity.path !== 'string' || identity.path.length > 500 || typeof identity.size !== 'number' || !Number.isSafeInteger(identity.size) || identity.size < 0 || typeof identity.mtimeMs !== 'number' || !Number.isFinite(identity.mtimeMs) || identity.mtimeMs < 0 || typeof identity.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(identity.sha256))) return resultError('invalid-input', 'Executable identity is malformed.');
  const snapshotId = raw.snapshotId;
  if (snapshotId !== undefined && (typeof snapshotId !== 'string' || !/^[a-f0-9-]{20,80}$/i.test(snapshotId))) return resultError('invalid-input', 'Harness snapshot id is malformed.');
  const preflightNonce = raw.preflightNonce;
  if (preflightNonce !== undefined && (typeof preflightNonce !== 'string' || !/^[a-f0-9-]{20,80}$/i.test(preflightNonce))) return resultError('invalid-input', 'Harness preflight nonce is malformed.');
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
      healthUrl,
      registered: raw.registered === true,
      ...(identity ? { executableIdentity: { path: (identity as Record<string, unknown>).path as string, size: (identity as Record<string, unknown>).size as number, mtimeMs: (identity as Record<string, unknown>).mtimeMs as number, sha256: ((identity as Record<string, unknown>).sha256 as string).toLowerCase() } } : {}),
      ...(snapshotId ? { snapshotId } : {}),
      ...(preflightNonce ? { preflightNonce } : {}),
    },
  };
}

export function attachmentCapability(
  variant: Pick<OllamaModelVariant, 'capabilities'>,
  attachment: Pick<OllamaAttachment, 'mimeType' | 'bytes'>,
): { allowed: boolean; reason: string } {
  if (!isRecord(variant) || !Array.isArray(variant.capabilities) || !isRecord(attachment) || typeof attachment.mimeType !== 'string') {
    return { allowed: false, reason: 'Attachment capability metadata is unavailable.' };
  }
  const type = attachment.mimeType.toLowerCase();
  const capability = type.startsWith('image/')
    ? 'vision'
    : type.startsWith('text/') || type === 'application/json'
      ? 'text'
      : 'file';
  if (!Number.isInteger(attachment.bytes) || attachment.bytes < 0 || attachment.bytes > OLLAMA_MAX_ATTACHMENT_BYTES) {
    return { allowed: false, reason: 'Attachment exceeds the bounded 20 MiB limit.' };
  }
  if (capability === 'text' && attachment.bytes > OLLAMA_MAX_MESSAGE_BYTES) {
    return { allowed: false, reason: 'Text attachments exceed the bounded 100,000-byte chat message limit.' };
  }
  if (capability === 'file') return { allowed: false, reason: 'The local API does not accept this attachment type.' };
  if (!variant.capabilities.includes(capability)) {
    return { allowed: false, reason: `Selected model does not declare ${capability} capability.` };
  }
  return { allowed: true, reason: 'Selected model declares this attachment capability.' };
}

export function validateChatParameters(value: unknown): OllamaResult<OllamaChatParameters> {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const temperature = boundedNumber(raw.temperature, 2);
  const topP = boundedNumber(raw.topP, 1);
  const topK = boundedInteger(raw.topK, 1_000);
  const numCtx = boundedInteger(raw.numCtx, 1_000_000);
  const seed = raw.seed === null || typeof raw.seed === 'undefined' ? null : boundedInteger(raw.seed, 2_147_483_647);
  if (temperature === null || topP === null || topK === null || numCtx === null || (raw.seed !== null && typeof raw.seed !== 'undefined' && seed === null)) {
    return resultError('invalid-input', 'Chat parameters are outside their documented bounds.');
  }
  return { ok: true, value: { temperature, topP, topK, numCtx, seed } };
}

export function createChatSession(modelTag: string, name = 'Local chat', now = () => new Date().toISOString()): OllamaChatSession {
  const timestamp = now();
  return { id: typeof globalThis.crypto?.randomUUID === 'function' ? globalThis.crypto.randomUUID() : `chat-${Date.now()}`, name: name.slice(0, 120), modelTag: modelTag.slice(0, OLLAMA_MAX_MODEL_NAME), systemPrompt: '', parameters: { ...DEFAULT_CHAT_PARAMETERS }, messages: [], createdAt: timestamp, updatedAt: timestamp };
}

function redactExportText(value: string): { value: string; secretCount: number; authCount: number; pathCount: number } {
  const authPattern = /\b(?:authorization|proxy-authorization)\b\s*[:=]\s*(?:(?:bearer|basic)\s+)?(?:"[^"]*"|'[^']*'|[^\s,;\r\n]+)/gi;
  const bareAuthPattern = /\b(?:bearer|basic)\s+(?:"[^"]*"|'[^']*'|[^\s,;\r\n]+)/gi;
  const secretPattern = /\b(?:api[_ -]?(?:key|token|secret)|access[_ -]?(?:token|key|secret)|refresh[_ -]?(?:token|key|secret)|client[_ -]?(?:secret|token|key)|provider(?:[_ -]?(?:access[_ -]?)?(?:token|key|secret|credential))|session[_ -]?(?:token|key|secret)|auth[_ -]?(?:token|key|secret)|token|credential|password|secret)\b\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;\r\n]+)/gi;
  const pathPattern = /(?:[A-Za-z]:[\\/]|\\\\|(?:\/Users\/|\/home\/))[^\s,;]+/g;
  let secretCount = 0;
  let authCount = 0;
  let pathCount = 0;
  const withoutAuth = value.replace(authPattern, () => { authCount += 1; return '<authorization redacted>'; }).replace(bareAuthPattern, () => { authCount += 1; return '<authorization redacted>'; });
  const withoutSecrets = withoutAuth.replace(secretPattern, () => { secretCount += 1; return '<secret redacted>'; });
  const redacted = withoutSecrets.replace(pathPattern, () => { pathCount += 1; return '<private path redacted>'; });
  return { value: redacted, secretCount, authCount, pathCount };
}

export function redactChatExport(session: OllamaChatSession): Record<string, unknown> {
  let secretCount = 0;
  let authCount = 0;
  let pathCount = 0;
  const redact = (value: string): string => {
    const result = redactExportText(value);
    secretCount += result.secretCount;
    authCount += result.authCount;
    pathCount += result.pathCount;
    return result.value;
  };
  return {
    version: 1,
    id: session.id,
    name: redact(session.name),
    modelTag: session.modelTag,
    systemPrompt: redact(session.systemPrompt),
    parameters: session.parameters,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    messages: session.messages.map((message) => ({ role: message.role, content: redact(message.content), attachments: message.attachments?.map((attachment) => ({ name: redact(attachment.name), mimeType: attachment.mimeType, bytes: attachment.bytes })) })),
    redactionManifest: {
      version: 1,
      removedFields: ['attachment.dataBase64'],
      secretLikeValuesRedacted: secretCount + authCount,
      authorizationSchemesRedacted: authCount,
      privatePathsRedacted: pathCount,
      note: 'Secrets, credential-like values, private paths, and attachment payload bytes are omitted from this export.',
    },
  };
}

export function parseChatSession(value: unknown): OllamaResult<OllamaChatSession> {
  if (!isRecord(value)) return resultError('malformed-response', 'Chat session was not an object.');
  const raw = value as Record<string, unknown>;
  const id = boundedString(raw.id, 160);
  const name = boundedString(raw.name, 120);
  const modelTag = boundedString(raw.modelTag, OLLAMA_MAX_MODEL_NAME);
  const systemPrompt = typeof raw.systemPrompt === 'string' && raw.systemPrompt.length <= 100_000 ? raw.systemPrompt : null;
  const createdAt = boundedString(raw.createdAt, 80);
  const updatedAt = boundedString(raw.updatedAt, 80);
  const parameters = validateChatParameters(raw.parameters);
  if (!id || !name || !modelTag || systemPrompt === null || !createdAt || !updatedAt || !parameters.ok || !Array.isArray(raw.messages) || raw.messages.length > OLLAMA_MAX_MESSAGES) return resultError('malformed-response', 'Chat session exceeded a bounded schema.');
  const messages: OllamaChatMessage[] = [];
  for (const message of raw.messages) {
    if (!isRecord(message)) return resultError('malformed-response', 'Chat session contained an invalid message.');
    const item = message as Record<string, unknown>;
    if (!['system', 'user', 'assistant'].includes(String(item.role)) || typeof item.content !== 'string' || item.content.length > OLLAMA_MAX_MESSAGE_CHARS) return resultError('malformed-response', 'Chat session contained an invalid message.');
    let attachments: OllamaAttachment[] | undefined;
    if (item.attachments !== undefined) {
      if (!Array.isArray(item.attachments)) return resultError('malformed-response', 'Chat session contained invalid attachments.');
      attachments = [];
      let totalBytes = 0;
      for (const attachment of item.attachments) {
        if (!isRecord(attachment) || typeof attachment.name !== 'string' || typeof attachment.mimeType !== 'string' || !Number.isInteger(attachment.bytes) || attachment.bytes < 0 || attachment.bytes > OLLAMA_MAX_ATTACHMENT_BYTES || attachment.name.length > 240 || attachment.mimeType.length > 120) return resultError('malformed-response', 'Chat session contained invalid attachments.');
        totalBytes += attachment.bytes;
        if (totalBytes > OLLAMA_MAX_ATTACHMENT_TOTAL_BYTES) return resultError('malformed-response', 'Chat session attachments exceeded the bounded size.');
        attachments.push({ name: attachment.name.slice(0, 240), mimeType: attachment.mimeType.slice(0, 120), bytes: attachment.bytes });
      }
    }
    messages.push({ role: item.role as OllamaChatMessage['role'], content: item.content, ...(attachments ? { attachments } : {}) });
  }
  return { ok: true, value: { id, name, modelTag, systemPrompt, parameters: parameters.value, messages, createdAt, updatedAt } };
}

export function searchChatSessions(sessions: readonly OllamaChatSession[], query: string): OllamaChatSession[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [...sessions];
  return sessions.filter((session) => `${session.name} ${session.modelTag}`.toLocaleLowerCase().includes(needle));
}

export function renameChatSession(session: OllamaChatSession, name: string, now = () => new Date().toISOString()): OllamaResult<OllamaChatSession> {
  const nextName = boundedString(name, 120);
  if (!nextName) return resultError('invalid-input', 'A chat session name is required.');
  return { ok: true, value: { ...session, name: nextName, updatedAt: now() } };
}

export interface OllamaSuiteClient {
  runtime(signal?: AbortSignal): Promise<OllamaResult<OllamaRuntimeStatus>>;
  hardware(signal?: AbortSignal): Promise<OllamaResult<OllamaHardwareFacts>>;
  installed(signal?: AbortSignal): Promise<OllamaResult<{ tags: string[]; running: string[] }>>;
  pulls(signal?: AbortSignal): Promise<OllamaResult<{ records: OllamaPullRecord[]; concurrency: number }>>;
  pullAction(id: string, action: 'cancel' | 'pause' | 'resume' | 'retry', signal?: AbortSignal): Promise<OllamaResult<OllamaPullRecord>>;
  catalogPage(pageToken: string | null, signal?: AbortSignal, selectedTag?: string | null, refreshId?: string): Promise<OllamaResult<unknown>>;
  pull(tag: string, signal?: AbortSignal): Promise<OllamaResult<{ stream: ReadableStream<Uint8Array> | null; id: string | null }>>;
  chat(tag: string, messages: readonly OllamaChatMessage[], parameters?: OllamaChatParameters, signal?: AbortSignal, systemPrompt?: string): Promise<OllamaResult<ReadableStream<Uint8Array> | null>>;
  harnessPreflight(profile: OllamaHarnessProfile, signal?: AbortSignal): Promise<OllamaResult<Record<string, unknown>>>;
  harnessRegister(profile: OllamaHarnessProfile, signal?: AbortSignal): Promise<OllamaResult<OllamaHarnessProfile>>;
  harnessLaunch(profile: OllamaHarnessProfile, signal?: AbortSignal): Promise<OllamaResult<Record<string, unknown>>>;
  harnessRestore(profileId: string, signal?: AbortSignal): Promise<OllamaResult<Record<string, unknown>>>;
}

export function resolveOllamaHostBridge(value: unknown): OllamaHostBridgeState {
  if (!isRecord(value)) return { available: false, reason: 'The host bridge is unavailable; local Ollama controls remain disabled.' };
  const requiredMethods = ['runtime', 'hardware', 'installed', 'pulls', 'pullAction', 'catalogPage', 'pull', 'chat', 'harnessPreflight', 'harnessRegister', 'harnessLaunch', 'harnessRestore'];
  if (!requiredMethods.every((name) => typeof value[name] === 'function')) return { available: false, reason: 'The host bridge is incomplete; local Ollama controls remain disabled.' };
  return { available: true, bridge: value as unknown as OllamaSuiteClient };
}

async function boundedJson(response: Response): Promise<OllamaResult<unknown>> {
  const length = Number(response.headers.get('content-length') ?? '0');
  if (Number.isFinite(length) && length > OLLAMA_MAX_RESPONSE_BYTES) return resultError('response-too-large', 'The local runtime response exceeded the bounded size.');
  if (!response.body) return resultError('malformed-response', 'The local runtime returned an empty response.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const next = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error('response-read-timeout')), OLLAMA_RESPONSE_READ_TIMEOUT_MS);
        }),
      ]).finally(() => {
        if (timeout !== undefined) clearTimeout(timeout);
      });
      if (next.done) break;
      total += next.value.byteLength;
      if (total > OLLAMA_MAX_RESPONSE_BYTES) {
        await reader.cancel();
        return resultError('response-too-large', 'The local runtime response exceeded the bounded size.');
      }
      chunks.push(next.value);
    }
  } catch {
    await reader.cancel().catch(() => undefined);
    return resultError('request-failed', 'The local runtime response could not be read.');
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder().decode(bytes);
  try { return { ok: true, value: JSON.parse(text) }; } catch { return resultError('malformed-response', 'The local runtime returned malformed JSON.'); }
}

function parseObjectResponse(value: unknown, message: string): OllamaResult<Record<string, unknown>> {
  return isRecord(value) ? { ok: true, value } : resultError('malformed-response', message);
}

export function decodedBase64Bytes(value: string): number | null {
  if (value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) return null;
  try {
    const decoded = atob(value);
    return btoa(decoded) === value ? decoded.length : null;
  } catch { return null; }
}

function validateChatMessages(messages: readonly OllamaChatMessage[]): OllamaResult<OllamaChatMessage[]> {
  if (!Array.isArray(messages) || messages.length > OLLAMA_MAX_MESSAGES) return resultError('invalid-input', 'Chat needs a bounded message history.');
  const safeMessages: OllamaChatMessage[] = [];
  let attachmentBytes = 0;
  for (const message of messages) {
    if (!isRecord(message) || !['system', 'user', 'assistant'].includes(String(message.role)) || typeof message.content !== 'string' || message.content.length > OLLAMA_MAX_MESSAGE_CHARS) return resultError('invalid-input', 'Chat contained an invalid message.');
    let attachments: OllamaAttachment[] | undefined;
    if (message.attachments !== undefined) {
      if (!Array.isArray(message.attachments)) return resultError('invalid-input', 'Chat contained invalid attachments.');
      attachments = [];
      for (const attachment of message.attachments) {
        if (!isRecord(attachment) || typeof attachment.name !== 'string' || typeof attachment.mimeType !== 'string' || !Number.isInteger(attachment.bytes) || attachment.bytes < 0 || attachment.bytes > OLLAMA_MAX_ATTACHMENT_BYTES) return resultError('invalid-input', 'Chat contained an invalid attachment.');
        const dataBase64 = attachment.dataBase64;
        if (typeof dataBase64 !== 'string') return resultError('invalid-input', 'Attachment payload is unavailable; choose the local file again before sending.');
        if (dataBase64.length > Math.ceil(OLLAMA_MAX_ATTACHMENT_BYTES * 4 / 3) + 4) return resultError('invalid-input', 'Chat attachment data exceeded the bounded size.');
        const decodedBytes = decodedBase64Bytes(dataBase64);
        if (decodedBytes === null || decodedBytes !== attachment.bytes) return resultError('invalid-input', 'Chat attachment bytes do not match the claimed size.');
        attachmentBytes += decodedBytes;
        if (attachmentBytes > OLLAMA_MAX_ATTACHMENT_TOTAL_BYTES) return resultError('invalid-input', 'Chat attachments exceeded the bounded size.');
        attachments.push({ name: attachment.name.slice(0, 240), mimeType: attachment.mimeType.slice(0, 120), bytes: attachment.bytes, ...(dataBase64 ? { dataBase64 } : {}) });
      }
    }
    safeMessages.push({ role: message.role as OllamaChatMessage['role'], content: message.content, ...(attachments ? { attachments } : {}) });
  }
  return { ok: true, value: safeMessages };
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
      return parseHardwareFacts(parsed.value);
    },
    async installed(signal) {
      const response = await request('/api/ollama/installed', { signal });
      if (!response) return resultError('offline', 'Installed model state is unavailable offline.');
      if (!response.ok) return resultError('request-failed', `Installed model state returned HTTP ${response.status}.`);
      const parsed = await boundedJson(response);
      if (!parsed.ok) return parsed;
      return parseInstalledState(parsed.value);
    },
    async pulls(signal) {
      const response = await request('/api/ollama/pulls', { signal });
      if (!response) return resultError('offline', 'The durable pull queue is unavailable.');
      if (!response.ok) return resultError('request-failed', `The pull queue returned HTTP ${response.status}.`);
      const parsed = await boundedJson(response);
      if (!parsed.ok) return parsed;
      return parsePullList(parsed.value);
    },
    async pullAction(id, action, signal) {
      if (!/^[a-zA-Z0-9._:-]{1,240}$/.test(id)) return resultError('invalid-input', 'Pull queue id is invalid.');
      if (!['cancel', 'pause', 'resume', 'retry'].includes(action)) return resultError('invalid-input', 'Pull queue action is invalid.');
      const response = await request(`/api/ollama/pulls/${encodeURIComponent(id)}/${action}`, { method: 'POST', signal });
      if (!response) return resultError('offline', 'The durable pull queue is unavailable.');
      const parsed = await boundedJson(response);
      if (!parsed.ok) return parsed;
      if (!response.ok) return resultError('request-failed', `Pull action returned HTTP ${response.status}.`);
      const record = parsePullRecord(parsed.value);
      return record ? { ok: true, value: record } : resultError('malformed-response', 'The pull action returned an invalid record.');
    },
    async catalogPage(pageToken, signal, selectedTag, refreshId) {
      if (pageToken !== null && (!boundedString(pageToken, 500) || /[\r\n]/.test(pageToken))) return resultError('invalid-input', 'Catalog page token is invalid.');
      if (selectedTag !== undefined && selectedTag !== null && (!boundedString(selectedTag, OLLAMA_MAX_MODEL_NAME) || /[\r\n]/.test(selectedTag))) return resultError('invalid-input', 'Selected model tag is invalid.');
      if (refreshId !== undefined && (!/^[a-f0-9-]{20,80}$/i.test(refreshId))) return resultError('invalid-input', 'Catalog refresh id is invalid.');
      const params = new URLSearchParams();
      if (pageToken) params.set('pageToken', pageToken);
      if (selectedTag) params.set('selectedTag', selectedTag);
      if (refreshId) params.set('refreshId', refreshId);
      const encodedQuery = params.toString();
      const query = encodedQuery ? `?${encodedQuery}` : '';
      const response = await request(`/api/ollama/catalog${query}`, { signal });
      if (!response) return resultError('offline', 'The last verified catalog is unavailable offline.');
      if (!response.ok) return resultError('request-failed', `The model catalog returned HTTP ${response.status}.`);
      const parsed = await boundedJson(response);
      return parsed.ok ? parseCatalogPage(parsed.value) : parsed;
    },
    async pull(tag, signal) {
      if (!boundedString(tag, OLLAMA_MAX_MODEL_NAME) || /[\r\n]/.test(tag)) return resultError('invalid-input', 'A model tag is required.');
      const response = await request('/api/ollama/pull', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tag }), signal });
      if (!response) return resultError('offline', 'The local runtime could not start the pull.');
      if (!response.ok) return resultError('request-failed', `The pull request returned HTTP ${response.status}.`);
      if (response.status === 202) {
        const queued = await boundedJson(response);
        if (!queued.ok) return queued;
        const record = parsePullRecord(queued.value);
        if (!record) return resultError('malformed-response', 'The queued pull response was malformed.');
        return { ok: true, value: { stream: null, id: record.id } };
      }
      return { ok: true, value: { stream: response.body, id: response.headers.get('x-ollama-pull-id') } };
    },
    async chat(tag, messages, parameters = DEFAULT_CHAT_PARAMETERS, signal, systemPrompt = '') {
      if (!boundedString(tag, OLLAMA_MAX_MODEL_NAME) || typeof systemPrompt !== 'string' || systemPrompt.length > OLLAMA_MAX_MESSAGE_CHARS) return resultError('invalid-input', 'Chat needs a bounded model tag and system prompt.');
      const checkedParameters = validateChatParameters(parameters);
      if (!checkedParameters.ok) return checkedParameters;
      const checkedMessages = validateChatMessages(messages);
      if (!checkedMessages.ok) return checkedMessages;
      const response = await request('/api/ollama/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tag, messages: checkedMessages.value, parameters: checkedParameters.value, systemPrompt }), signal });
      if (!response) return resultError('offline', 'The local runtime could not start chat.');
      if (!response.ok) return resultError('request-failed', `The chat request returned HTTP ${response.status}.`);
      return { ok: true, value: response.body };
    },
    async harnessRegister(profile, signal) {
      const validated = validateHarnessProfile(profile);
      if (!validated.ok) return validated;
      const response = await request('/api/ollama/harness/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ profile: validated.value }), signal });
      if (!response) return resultError('offline', 'Harness registration is unavailable.');
      const parsed = await boundedJson(response);
      if (!parsed.ok) return parsed;
      if (!response.ok || !isRecord(parsed.value) || !isRecord(parsed.value.profile)) return resultError('request-failed', 'Harness registration was refused.');
      const registered = validateHarnessProfile(parsed.value.profile);
      return response.ok && registered.ok && registered.value.registered ? registered : resultError('malformed-response', 'Harness registration returned an unregistered profile.');
    },
    async harnessPreflight(profile, signal) {
      const validated = validateHarnessProfile(profile);
      if (!validated.ok) return validated;
      const response = await request('/api/ollama/harness/preflight', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ profile: validated.value }), signal });
      if (!response) return resultError('offline', 'Harness preflight is unavailable.');
      const parsed = await boundedJson(response);
      if (!parsed.ok) return parsed;
      const object = parseObjectResponse(parsed.value, 'Harness preflight returned a malformed response.');
      return response.ok ? object : resultError('request-failed', 'Harness preflight was refused.');
    },
    async harnessLaunch(profile, signal) {
      const validated = validateHarnessProfile(profile);
      if (!validated.ok) return validated;
      const response = await request('/api/ollama/harness/launch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ profile: validated.value, snapshotId: validated.value.snapshotId ?? null, preflightNonce: validated.value.preflightNonce ?? null }), signal });
      if (!response) return resultError('offline', 'Harness launch is unavailable.');
      const parsed = await boundedJson(response);
      if (!parsed.ok) return parsed;
      const object = parseObjectResponse(parsed.value, 'Harness launch returned a malformed response.');
      return response.ok ? object : resultError('request-failed', 'Harness launch was refused.');
    },
    async harnessRestore(profileId, signal) {
      if (!/^[a-zA-Z0-9._:-]{1,160}$/.test(profileId)) return resultError('invalid-input', 'Harness profile id is invalid.');
      const response = await request('/api/ollama/harness/restore', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ snapshotId: profileId }), signal });
      if (!response) return resultError('offline', 'Harness restore is unavailable.');
      const parsed = await boundedJson(response);
      if (!parsed.ok) return parsed;
      const object = parseObjectResponse(parsed.value, 'Harness restore returned a malformed response.');
      return response.ok ? object : resultError('request-failed', 'Harness restore was refused.');
    },
  };
}

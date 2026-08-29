import type { Express, Request, Response } from 'express';
import { createReadStream, promises as fs } from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

export const OLLAMA_ROUTE_PREFIX = '/api/ollama';
export const OLLAMA_DEFAULT_BASE_URL = 'http://127.0.0.1:11434';
export const OLLAMA_MAX_JSON_BYTES = 8 * 1024 * 1024;
export const OLLAMA_MAX_STREAM_BYTES = 8 * 1024 * 1024;
export const OLLAMA_MAX_NDJSON_LINE_BYTES = 128 * 1024;
export const OLLAMA_MAX_NDJSON_LINES = 100_000;
export const OLLAMA_MAX_RESPONSE_INACTIVITY_MS = 30_000;
export const OLLAMA_MAX_MODEL_TAG = 160;
export const OLLAMA_MAX_MESSAGES = 100;
export const OLLAMA_MAX_MESSAGE_BYTES = 100_000;
export const OLLAMA_MAX_SYSTEM_PROMPT_BYTES = 100_000;
export const OLLAMA_MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const OLLAMA_MAX_ATTACHMENT_TOTAL_BYTES = 20 * 1024 * 1024;
export const OLLAMA_MAX_PULL_QUEUE_ITEMS = 10_000;
export const OLLAMA_MAX_CATALOG_MODELS = 100_000;
export const OLLAMA_MAX_HARNESS_ARGUMENTS = 64;
export const OLLAMA_MAX_HARNESS_ENVIRONMENT_KEYS = 16;
export const OLLAMA_MAX_LOCAL_DETAIL_MODELS = 100;
export const OLLAMA_OFFICIAL_CATALOG_URL = 'https://ollama.com/api/tags';
export const OLLAMA_OFFICIAL_CATALOG_ID = 'ollama-official-model-tags-v1';
const ALLOWED_HARNESS_ENVIRONMENT_KEYS = new Set<string>();

export interface OllamaSuiteRouteRegistration {
  mounted: true;
  prefix: typeof OLLAMA_ROUTE_PREFIX;
}

export interface OllamaExecutableIdentity {
  path: string;
  size: number;
  mtimeMs: number;
  sha256: string;
}

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
  executableIdentity?: OllamaExecutableIdentity;
}

export interface OllamaPullAttempt {
  generation: number;
  leaseId: string;
}

export function matchesOllamaPullAttempt(current: OllamaPullAttempt | null | undefined, expected: OllamaPullAttempt): boolean {
  return current?.generation === expected.generation && current.leaseId === expected.leaseId;
}

interface DurablePull {
  id: string;
  tag: string;
  baseUrl: string;
  state: 'queued' | 'pulling' | 'paused' | 'completed' | 'cancelled' | 'failed';
  completedBytes: number;
  totalBytes: number | null;
  attempts: number;
  detail: string | null;
  queuedAt: string;
  updatedAt: string;
  retryable: boolean;
  providerStatus: 'queued' | 'pulling' | 'success' | 'error' | 'cancelled' | null;
  rateBytesPerSecond: number | null;
  etaSeconds: number | null;
  partialOutcome: 'none' | 'some' | 'all' | null;
  generation: number;
  leaseId: string | null;
  leaseExpiresAt: string | null;
}

interface CatalogVariant {
  tag: string;
  family: string | null;
  parameterSize: string | null;
  parameterCount: number | null;
  quantization: string | null;
  blobBytes: number | null;
  contextWindow: number | null;
  contextOverheadBytes: number | null;
  capabilities: string[];
  installed: false;
  running: false;
  fit: 'unknown';
  fitEvidence: string[];
}

interface HarnessSnapshot {
  id: string;
  createdAt: string;
  profile: OllamaHarnessProfile;
  previousProfile: OllamaHarnessProfile | null;
  profileHash: string;
  previousProfileHash: string | null;
}

interface PreflightLease {
  profileHash: string;
  snapshotId: string;
  expiresAt: number;
}

interface ActiveHarness {
  profile: OllamaHarnessProfile;
  child: ChildProcess;
  snapshotId: string;
}

interface PullControllerLease {
  attempt: OllamaPullAttempt;
  controller: AbortController;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function loopbackBaseUrl(value: unknown): URL | null {
  const candidate = typeof value === 'string' && value.trim() ? value.trim() : OLLAMA_DEFAULT_BASE_URL;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname)) return null;
    if (url.username || url.password || url.search || url.hash) return null;
    return url;
  } catch {
    return null;
  }
}

export function isOllamaLoopbackOrigin(value: unknown): boolean {
  return typeof value === 'string' && loopbackBaseUrl(value) !== null;
}

function modelTag(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim() || value.length > OLLAMA_MAX_MODEL_TAG || /[\u0000-\u001f\u007f]/.test(value)) return null;
  return value.trim();
}

function boundedString(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= max ? value : null;
}

function safeEnvironmentKey(value: unknown): value is string {
  return typeof value === 'string'
    && /^[A-Z_][A-Z0-9_]{0,63}$/.test(value)
    && !/(TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH|PRIVATE|KEY)/.test(value)
    && ALLOWED_HARNESS_ENVIRONMENT_KEYS.has(value);
}

function controlledWorkingDirectory(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !value.trim() || value.length > 500 || /[\u0000-\u001f\u007f]/.test(value)) return undefined;
  if (!path.isAbsolute(value) || value.split(/[\\/]+/).includes('..')) return undefined;
  return path.normalize(value);
}

function parseExecutableIdentity(value: unknown): OllamaExecutableIdentity | undefined {
  if (!isRecord(value) || typeof value.path !== 'string' || !path.isAbsolute(value.path) || typeof value.size !== 'number' || !Number.isSafeInteger(value.size) || value.size < 0 || typeof value.mtimeMs !== 'number' || !Number.isFinite(value.mtimeMs) || value.mtimeMs < 0 || typeof value.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(value.sha256)) return undefined;
  return { path: path.normalize(value.path), size: value.size, mtimeMs: value.mtimeMs, sha256: value.sha256.toLowerCase() };
}

function allowlistedHarness(value: unknown, requireRegistered = false): OllamaHarnessProfile | null {
  if (!isRecord(value)) return null;
  const id = boundedString(value.id, 160);
  const name = boundedString(value.name, 120);
  const executable = boundedString(value.executable, 500);
  const model = modelTag(value.modelTag);
  const args = value.arguments;
  const environmentKeys = value.environmentKeys;
  const workingDirectory = controlledWorkingDirectory(value.workingDirectory);
  const healthUrl = value.healthUrl === undefined || value.healthUrl === null ? null : boundedString(value.healthUrl, 300);
  const registered = value.registered === true;
  const executableIdentity = parseExecutableIdentity(value.executableIdentity);
  if (!id || !name || !executable || !model || !Array.isArray(args) || !Array.isArray(environmentKeys) || args.length > OLLAMA_MAX_HARNESS_ARGUMENTS || environmentKeys.length > OLLAMA_MAX_HARNESS_ENVIRONMENT_KEYS || workingDirectory === undefined) return null;
  if (requireRegistered && (!registered || !executableIdentity)) return null;
  const executableName = executable.replaceAll('\\', '/').split('/').pop()?.toLowerCase();
  if ((executableName !== 'ollama' && executableName !== 'ollama.exe') || /[;&|<>`$\r\n]/.test(executable)) return null;
  if (!args.every((arg): arg is string => typeof arg === 'string' && arg.length <= 500 && !/[;&|<>`$\r\n]/.test(arg)) || args.length < 2 || args[0] !== 'run' || args[1] !== model || args.slice(2).some((arg) => !['--verbose', '--nowordwrap'].includes(arg))) return null;
  if (!environmentKeys.every(safeEnvironmentKey)) return null;
  if (healthUrl && !loopbackBaseUrl(healthUrl)) return null;
  return { id, name, executable: path.normalize(executable), arguments: [...args], workingDirectory, environmentKeys: [...environmentKeys], modelTag: model, healthUrl, registered, ...(executableIdentity ? { executableIdentity } : {}) };
}

export function validateOllamaHarnessProfile(value: unknown, requireRegistered = false): OllamaHarnessProfile | null {
  return allowlistedHarness(value, requireRegistered);
}

export function normalizeOllamaCatalogPageToken(payload: Record<string, unknown>): string | null {
  let raw: unknown = null;
  if (Object.prototype.hasOwnProperty.call(payload, 'nextPageToken')) raw = payload.nextPageToken;
  else if (Object.prototype.hasOwnProperty.call(payload, 'next_page_token')) raw = payload.next_page_token;
  else if (Object.prototype.hasOwnProperty.call(payload, 'next')) raw = payload.next;
  if (raw === null) return null;
  if (typeof raw !== 'string' || raw.length > 500 || !raw.trim() || /[\r\n]/.test(raw)) throw new Error('invalid-page-token');
  return raw;
}

function publicProfile(profile: OllamaHarnessProfile): Record<string, unknown> {
  return {
    id: profile.id,
    name: profile.name,
    executable: profile.executable,
    arguments: profile.arguments,
    workingDirectory: profile.workingDirectory,
    environmentKeys: profile.environmentKeys,
    modelTag: profile.modelTag,
    healthUrl: profile.healthUrl,
    registered: profile.registered,
    executableIdentity: profile.executableIdentity,
  };
}

function profileHash(profile: OllamaHarnessProfile): string {
  return createHash('sha256').update(JSON.stringify(publicProfile(profile))).digest('hex');
}

async function executableIdentity(executable: string): Promise<OllamaExecutableIdentity | null> {
  try {
    const stat = await fs.lstat(executable);
    if (!stat.isFile()) return null;
    if (stat.isSymbolicLink()) return null;
    if (stat.size > 512 * 1024 * 1024) return null;
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(executable)) hash.update(chunk);
    return { path: path.normalize(executable), size: stat.size, mtimeMs: stat.mtimeMs, sha256: hash.digest('hex') };
  } catch {
    return null;
  }
}

function sameExecutableIdentity(expected: OllamaExecutableIdentity | undefined, actual: OllamaExecutableIdentity | null): boolean {
  return Boolean(expected && actual && path.normalize(expected.path) === path.normalize(actual.path) && expected.sha256 === actual.sha256);
}

async function safeDirectory(value: string): Promise<boolean> {
  try {
    const stat = await fs.lstat(value);
    return stat.isDirectory() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}

function originPath(base: URL, requestPath: string): string {
  return new URL(requestPath, `${base.origin}${base.pathname.endsWith('/') ? base.pathname : `${base.pathname}/`}`).toString();
}

async function readBoundedText(response: globalThis.Response, maxBytes: number, inactivityMs = OLLAMA_MAX_RESPONSE_INACTIVITY_MS): Promise<string> {
  const declared = Number(response.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error('response-too-large');
  if (!response.body) throw new Error('empty-response');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await readWithDeadline(reader, undefined, inactivityMs);
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maxBytes) throw new Error('response-too-large');
      chunks.push(next.value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

async function boundedJson(response: globalThis.Response): Promise<unknown> {
  const text = await readBoundedText(response, OLLAMA_MAX_JSON_BYTES);
  return JSON.parse(text) as unknown;
}

async function localRequest(base: URL, requestPath: string, init: RequestInit = {}): Promise<globalThis.Response> {
  return fetch(originPath(base, requestPath), { ...init, redirect: 'error', signal: init.signal ?? AbortSignal.timeout(15_000) });
}

async function officialCatalogRequest(pageToken: string | null): Promise<globalThis.Response> {
  const url = new URL(OLLAMA_OFFICIAL_CATALOG_URL);
  if (pageToken) url.searchParams.set('pageToken', pageToken);
  return fetch(url, { redirect: 'error', signal: AbortSignal.timeout(20_000), headers: { accept: 'application/json' } });
}

async function localModelDetail(base: URL, tag: string): Promise<{ capabilities: string[]; contextWindow: number | null; parameterCount: number | null } | null> {
  try {
    const response = await localRequest(base, 'api/show', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: tag }), signal: AbortSignal.timeout(5_000) });
    if (!response.ok) return null;
    const payload = await boundedJson(response);
    if (!isRecord(payload)) return null;
    const capabilities = Array.isArray(payload.capabilities) ? payload.capabilities.filter((item): item is string => typeof item === 'string' && item.length <= 40 && ['vision', 'text', 'file'].includes(item)) : [];
    const modelInfo = isRecord(payload.model_info) ? payload.model_info : {};
    const contextWindow = typeof payload.context_length === 'number' && Number.isSafeInteger(payload.context_length) && payload.context_length > 0 && payload.context_length <= 10_000_000 ? payload.context_length : typeof modelInfo['context_length'] === 'number' && Number.isSafeInteger(modelInfo['context_length']) && modelInfo['context_length'] > 0 && modelInfo['context_length'] <= 10_000_000 ? modelInfo['context_length'] : null;
    const parameterCount = typeof payload.parameter_count === 'number' && Number.isSafeInteger(payload.parameter_count) && payload.parameter_count > 0 ? payload.parameter_count : null;
    return { capabilities: [...new Set(capabilities)], contextWindow, parameterCount };
  } catch { return null; }
}

async function readWithDeadline(reader: ReadableStreamDefaultReader<Uint8Array>, signal: AbortSignal | undefined, inactivityMs: number): Promise<ReadableStreamReadResult<Uint8Array>> {
  if (signal?.aborted) throw new Error('aborted');
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abortHandler: (() => void) | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('response-inactivity-timeout')), inactivityMs); });
  const aborted = signal ? new Promise<never>((_, reject) => { abortHandler = () => reject(new Error('aborted')); signal.addEventListener('abort', abortHandler, { once: true }); }) : null;
  try {
    const racers: Array<Promise<ReadableStreamReadResult<Uint8Array>>> = [reader.read(), timeout];
    if (aborted) racers.push(aborted);
    return await Promise.race(racers);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (signal && abortHandler) signal.removeEventListener('abort', abortHandler);
  }
}

function isDurablePull(value: unknown): value is DurablePull {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string' && value.id.length > 0 && value.id.length <= 160
    && modelTag(value.tag) !== null
    && typeof value.baseUrl === 'string' && loopbackBaseUrl(value.baseUrl) !== null
    && ['queued', 'pulling', 'paused', 'completed', 'cancelled', 'failed'].includes(String(value.state))
    && typeof value.completedBytes === 'number' && Number.isSafeInteger(value.completedBytes) && value.completedBytes >= 0
    && (value.totalBytes === null || (typeof value.totalBytes === 'number' && Number.isSafeInteger(value.totalBytes) && value.totalBytes >= 0))
    && typeof value.attempts === 'number' && Number.isInteger(value.attempts) && value.attempts >= 0 && value.attempts <= 100
    && typeof value.queuedAt === 'string' && value.queuedAt.length <= 80
    && typeof value.updatedAt === 'string' && value.updatedAt.length <= 80
    && (value.detail === null || (typeof value.detail === 'string' && value.detail.length <= 500))
    && typeof value.retryable === 'boolean'
    && (value.providerStatus === null || ['queued', 'pulling', 'success', 'error', 'cancelled'].includes(String(value.providerStatus)))
    && (value.rateBytesPerSecond === null || (typeof value.rateBytesPerSecond === 'number' && Number.isFinite(value.rateBytesPerSecond) && value.rateBytesPerSecond >= 0))
    && (value.etaSeconds === null || (typeof value.etaSeconds === 'number' && Number.isFinite(value.etaSeconds) && value.etaSeconds >= 0 && value.etaSeconds <= 31_536_000))
    && (value.partialOutcome === null || ['none', 'some', 'all'].includes(String(value.partialOutcome)))
    && typeof value.generation === 'number' && Number.isSafeInteger(value.generation) && value.generation >= 0
    && (value.leaseId === null || (typeof value.leaseId === 'string' && /^[a-f0-9-]{20,80}$/i.test(value.leaseId)))
    && (value.leaseExpiresAt === null || (typeof value.leaseExpiresAt === 'string' && value.leaseExpiresAt.length <= 80))
    && (value.state !== 'completed' || value.providerStatus === 'success')
    && (value.state !== 'cancelled' || value.providerStatus === 'cancelled')
    && (value.state !== 'failed' || value.providerStatus === 'error')
    && (value.state === 'pulling' ? value.leaseId !== null && value.leaseExpiresAt !== null : value.leaseId === null && value.leaseExpiresAt === null);
}

async function writeAtomic(file: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary, content, 'utf8');
  let lastError: unknown;
  try {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try { await fs.rename(temporary, file); return; } catch (error) {
        lastError = error;
        const code = error && typeof error === 'object' ? (error as { code?: string }).code : undefined;
        if (!['EPERM', 'EACCES', 'EBUSY'].includes(code ?? '')) throw error;
        await new Promise((resolve) => setTimeout(resolve, 30 * (attempt + 1)));
      }
    }
    throw lastError instanceof Error ? lastError : new Error('atomic-write-failed');
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

function createPullStore(dataDir: string) {
  const file = path.join(dataDir, 'ollama-suite', 'pulls.json');
  let records: DurablePull[] = [];
  let loaded = false;
  let loading: Promise<void> | null = null;
  let mutationTail = Promise.resolve();
  const withMutationLock = async <T>(work: () => Promise<T>): Promise<T> => {
    const previous = mutationTail;
    let release!: () => void;
    mutationTail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try { return await work(); } finally { release(); }
  };
  const load = async (): Promise<void> => {
    if (loaded) return;
    if (loading) return loading;
    loading = (async () => {
      try {
        const raw = await fs.readFile(file, 'utf8');
        if (Buffer.byteLength(raw, 'utf8') > OLLAMA_MAX_JSON_BYTES) throw new Error('queue-too-large');
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) records = parsed.slice(0, OLLAMA_MAX_PULL_QUEUE_ITEMS).filter(isDurablePull);
      } catch { records = []; }
      for (const record of records) if (record.state === 'pulling') { record.state = 'queued'; record.providerStatus = 'queued'; record.leaseId = null; record.leaseExpiresAt = null; record.detail = 'Recovered after restart.'; }
      loaded = true;
    })();
    await loading;
  };
  const save = async (): Promise<void> => writeAtomic(file, JSON.stringify(records));
  return {
    async list() { return withMutationLock(async () => { await load(); return records.map((record) => ({ ...record })); }); },
    async get(id: string) { return withMutationLock(async () => { await load(); return records.find((record) => record.id === id) ? { ...records.find((record) => record.id === id)! } : null; }); },
    async add(tag: string, baseUrl: string) { return withMutationLock(async () => { await load(); const now = new Date().toISOString(); const record: DurablePull = { id: randomUUID(), tag, baseUrl, state: 'queued', completedBytes: 0, totalBytes: null, attempts: 0, detail: null, queuedAt: now, updatedAt: now, retryable: true, providerStatus: 'queued', rateBytesPerSecond: null, etaSeconds: null, partialOutcome: 'none', generation: 0, leaseId: null, leaseExpiresAt: null }; records.push(record); await save(); return { ...record }; }); },
    async claim(id: string) { return withMutationLock(async () => { await load(); const record = records.find((item) => item.id === id); if (!record || record.state !== 'queued') return null; Object.assign(record, { state: 'pulling', providerStatus: 'pulling', attempts: record.attempts + 1, generation: record.generation + 1, leaseId: randomUUID(), leaseExpiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(), detail: 'Starting queued pull.', updatedAt: new Date().toISOString() }); await save(); return { ...record }; }); },
    async update(id: string, changes: Partial<DurablePull>, expected?: OllamaPullAttempt) { return withMutationLock(async () => { await load(); const record = records.find((item) => item.id === id); if (!record) return null; if (expected && (!matchesOllamaPullAttempt(record.leaseId ? { generation: record.generation, leaseId: record.leaseId } : null, expected) || !record.leaseExpiresAt || Date.parse(record.leaseExpiresAt) <= Date.now())) return null; if (changes.state && changes.state !== 'pulling') Object.assign(record, { leaseId: null, leaseExpiresAt: null }); Object.assign(record, changes, { updatedAt: new Date().toISOString() }); await save(); return { ...record }; }); },
  };
}

async function readRegisteredProfiles(dataDir: string): Promise<OllamaHarnessProfile[]> {
  const file = path.join(dataDir, 'ollama-suite', 'harness-profiles.json');
  try {
    const raw = await fs.readFile(file, 'utf8');
    if (Buffer.byteLength(raw, 'utf8') > OLLAMA_MAX_JSON_BYTES) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.flatMap((item) => { const profile = allowlistedHarness(item, true); return profile ? [profile] : []; }) : [];
  } catch { return []; }
}

async function writeRegisteredProfiles(dataDir: string, profiles: readonly OllamaHarnessProfile[]): Promise<void> {
  await writeAtomic(path.join(dataDir, 'ollama-suite', 'harness-profiles.json'), JSON.stringify(profiles.map(publicProfile)));
}

async function registeredProfile(dataDir: string, profile: OllamaHarnessProfile): Promise<OllamaHarnessProfile | null> {
  const profiles = await readRegisteredProfiles(dataDir);
  const stored = profiles.find((candidate) => candidate.id === profile.id);
  if (!stored || stored.executable !== profile.executable || stored.name !== profile.name || stored.modelTag !== profile.modelTag || JSON.stringify(stored.arguments) !== JSON.stringify(profile.arguments) || stored.workingDirectory !== profile.workingDirectory || JSON.stringify(stored.environmentKeys) !== JSON.stringify(profile.environmentKeys) || stored.healthUrl !== profile.healthUrl || !sameExecutableIdentity(profile.executableIdentity, stored.executableIdentity) || !sameExecutableIdentity(stored.executableIdentity, await executableIdentity(stored.executable))) return null;
  return stored;
}

async function healthyProfile(profile: OllamaHarnessProfile, base: URL): Promise<boolean> {
  try {
    const response = profile.healthUrl ? await fetch(profile.healthUrl, { redirect: 'error', signal: AbortSignal.timeout(5_000) }) : await localRequest(base, 'api/version', { signal: AbortSignal.timeout(5_000) });
    return response.ok;
  } catch { return false; }
}

function safeChildEnvironment(keys: readonly string[]): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const key of keys) if (safeEnvironmentKey(key) && process.env[key] !== undefined) environment[key] = process.env[key];
  return environment;
}

function startChild(profile: OllamaHarnessProfile): ChildProcess {
  return spawn(profile.executable, profile.arguments, { cwd: profile.workingDirectory ?? undefined, env: safeChildEnvironment(profile.environmentKeys), shell: false, windowsHide: true, stdio: 'ignore' });
}

async function readSnapshot(dataDir: string, snapshotId: string): Promise<HarnessSnapshot | null> {
  if (!/^[a-f0-9-]{20,80}$/i.test(snapshotId)) return null;
  try {
    const raw = await fs.readFile(path.join(dataDir, 'ollama-suite', 'harness-snapshots', `${snapshotId}.json`), 'utf8');
    if (Buffer.byteLength(raw, 'utf8') > 256 * 1024) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    const profile = allowlistedHarness(parsed.profile, true);
    const previousProfile = parsed.previousProfile === null ? null : allowlistedHarness(parsed.previousProfile, true);
    if (!profile || (parsed.previousProfile !== null && !previousProfile) || parsed.id !== snapshotId || typeof parsed.createdAt !== 'string' || typeof parsed.profileHash !== 'string' || !/^[a-f0-9]{64}$/i.test(parsed.profileHash) || parsed.profileHash !== profileHash(profile) || (parsed.previousProfileHash !== null && (typeof parsed.previousProfileHash !== 'string' || !/^[a-f0-9]{64}$/i.test(parsed.previousProfileHash) || !previousProfile || parsed.previousProfileHash !== profileHash(previousProfile)))) return null;
    return { id: snapshotId, createdAt: parsed.createdAt, profile, previousProfile, profileHash: parsed.profileHash, previousProfileHash: parsed.previousProfileHash === null ? null : parsed.previousProfileHash as string };
  } catch { return null; }
}

async function writeSnapshot(dataDir: string, snapshot: HarnessSnapshot): Promise<void> {
  await writeAtomic(path.join(dataDir, 'ollama-suite', 'harness-snapshots', `${snapshot.id}.json`), JSON.stringify(snapshot));
}

function sendFailure(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ ok: false, error: { code, message } });
}

type ProviderLineResult = 'success' | 'error' | undefined;

export async function consumeOllamaProviderStream(
  response: globalThis.Response,
  signal: AbortSignal,
  onRecord: (record: Record<string, unknown>) => Promise<ProviderLineResult> | ProviderLineResult,
): Promise<{ success: boolean; reason: string | null }> {
  if (!response.body) return { success: false, reason: 'Provider returned no stream.' };
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let totalBytes = 0;
  let lines = 0;
  let success = false;
  let reason: string | null = null;
  const consumeLine = async (line: string): Promise<boolean> => {
    if (!line.trim()) return false;
    lines += 1;
    if (lines > OLLAMA_MAX_NDJSON_LINES) throw new Error('stream-line-bound');
    if (Buffer.byteLength(line, 'utf8') > OLLAMA_MAX_NDJSON_LINE_BYTES) throw new Error('stream-line-too-large');
    let parsed: unknown;
    try { parsed = JSON.parse(line); } catch { reason = 'Provider returned malformed NDJSON.'; return true; }
    if (!isRecord(parsed)) { reason = 'Provider returned a non-object progress record.'; return true; }
    const outcome = await onRecord(parsed);
    if (outcome === 'success') { success = true; return true; }
    if (outcome === 'error') { reason ??= 'Provider reported an error.'; return true; }
    return false;
  };
  try {
    while (true) {
      const next = await readWithDeadline(reader, signal, OLLAMA_MAX_RESPONSE_INACTIVITY_MS);
      if (next.done) break;
      totalBytes += next.value.byteLength;
      if (totalBytes > OLLAMA_MAX_STREAM_BYTES) throw new Error('stream-byte-bound');
      buffer += decoder.decode(next.value, { stream: true });
      if (Buffer.byteLength(buffer, 'utf8') > OLLAMA_MAX_NDJSON_LINE_BYTES) throw new Error('stream-line-too-large');
      const parts = buffer.split('\n');
      buffer = parts.pop() ?? '';
      for (const line of parts) if (await consumeLine(line)) return { success, reason };
    }
    buffer += decoder.decode();
    if (buffer.trim()) await consumeLine(buffer);
  } catch (error) {
    reason = error instanceof Error ? error.message : 'Provider stream failed.';
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return { success, reason };
}

function validateChatRequest(body: unknown): OllamaResult {
  if (!isRecord(body)) return { ok: false, message: 'Chat request must be an object.' };
  const tag = modelTag(body.tag);
  const messages = body.messages;
  if (!tag || !Array.isArray(messages) || messages.length > OLLAMA_MAX_MESSAGES) return { ok: false, message: 'Chat needs a bounded model tag and message history.' };
  const safeMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string; attachments: Array<{ name: string; mimeType: string; bytes: number; dataBase64?: string }> }> = [];
  let attachmentBytes = 0;
  for (const item of messages) {
    if (!isRecord(item) || !['system', 'user', 'assistant'].includes(String(item.role)) || typeof item.content !== 'string' || Buffer.byteLength(item.content, 'utf8') > OLLAMA_MAX_MESSAGE_BYTES) return { ok: false, message: 'Every chat message must have a bounded role and content.' };
    const attachments = item.attachments;
    const safeAttachments: Array<{ name: string; mimeType: string; bytes: number; dataBase64?: string }> = [];
    if (attachments !== undefined) {
      if (!Array.isArray(attachments)) return { ok: false, message: 'Chat attachment metadata is malformed.' };
      for (const entry of attachments) {
        if (!isRecord(entry) || typeof entry.name !== 'string' || typeof entry.mimeType !== 'string' || !Number.isInteger(entry.bytes) || entry.bytes < 0 || entry.bytes > OLLAMA_MAX_ATTACHMENT_BYTES || typeof entry.dataBase64 !== 'string' || entry.dataBase64.length > Math.ceil(OLLAMA_MAX_ATTACHMENT_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(entry.dataBase64)) return { ok: false, message: 'Chat attachment data is malformed or too large.' };
        attachmentBytes += entry.bytes;
        if (attachmentBytes > OLLAMA_MAX_ATTACHMENT_TOTAL_BYTES) return { ok: false, message: 'Chat attachments exceeded the bounded size.' };
        safeAttachments.push({ name: entry.name.slice(0, 240), mimeType: entry.mimeType.slice(0, 120), bytes: entry.bytes, dataBase64: entry.dataBase64 });
      }
    }
    safeMessages.push({ role: item.role as 'system' | 'user' | 'assistant', content: item.content, attachments: safeAttachments });
  }
  const params = isRecord(body.parameters) ? body.parameters : {};
  const temperature = params.temperature;
  const topP = params.topP;
  const topK = params.topK;
  const numCtx = params.numCtx;
  const seed = params.seed;
  if (typeof temperature !== 'number' || !Number.isFinite(temperature) || temperature < 0 || temperature > 2 || typeof topP !== 'number' || !Number.isFinite(topP) || topP < 0 || topP > 1 || typeof topK !== 'number' || !Number.isInteger(topK) || topK < 1 || topK > 1000 || typeof numCtx !== 'number' || !Number.isInteger(numCtx) || numCtx < 1 || numCtx > 1_000_000 || (seed !== null && seed !== undefined && (typeof seed !== 'number' || !Number.isInteger(seed) || seed < 0 || seed > 2_147_483_647))) return { ok: false, message: 'Chat parameters are outside their documented bounds.' };
  const systemPrompt = body.systemPrompt === undefined ? '' : body.systemPrompt;
  if (typeof systemPrompt !== 'string' || Buffer.byteLength(systemPrompt, 'utf8') > OLLAMA_MAX_SYSTEM_PROMPT_BYTES) return { ok: false, message: 'The system prompt exceeded its bounded size.' };
  return { ok: true, tag, messages: safeMessages, parameters: { temperature: temperature as number, topP: topP as number, topK: topK as number, numCtx: numCtx as number, seed: typeof seed === 'number' ? seed : null }, systemPrompt };
}

type OllamaResult = { ok: true; tag: string; messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string; attachments: Array<{ name: string; mimeType: string; bytes: number; dataBase64?: string }> }>; parameters: { temperature: number; topP: number; topK: number; numCtx: number; seed: number | null }; systemPrompt: string } | { ok: false; message: string };

export function registerOllamaSuiteRoutes(app: Express, dataDir = process.env.OD_DATA_DIR ?? process.cwd()): OllamaSuiteRouteRegistration {
  const configuredBase = loopbackBaseUrl(process.env.OD_OLLAMA_BASE_URL) ?? new URL(OLLAMA_DEFAULT_BASE_URL);
  const pullStore = createPullStore(dataDir);
  const pullControllers = new Map<string, PullControllerLease>();
  const activeHarnesses = new Map<string, ActiveHarness>();
  const preflightLeases = new Map<string, PreflightLease>();
  let schedulerTail = Promise.resolve();

  const scheduleQueuedPulls = (): Promise<void> => {
    const run = schedulerTail.then(runQueuedPulls, runQueuedPulls);
    schedulerTail = run.catch(() => undefined);
    return run;
  };

  const markPullFailed = async (id: string, detail: string, partialOutcome: 'none' | 'some' | 'all' = 'none', attempt?: OllamaPullAttempt) => {
    await pullStore.update(id, { state: 'failed', providerStatus: 'error', detail, retryable: true, partialOutcome }, attempt);
  };

  const processPull = async (record: DurablePull): Promise<void> => {
    const controller = new AbortController();
    const leaseId = record.leaseId;
    if (!leaseId) return;
    const attempt: OllamaPullAttempt = { generation: record.generation, leaseId };
    pullControllers.set(record.id, { attempt, controller });
    try {
      const base = configuredBase;
      if (!base) { await markPullFailed(record.id, 'Stored runtime origin is no longer valid.', 'none', attempt); return; }
      const response = await localRequest(base, 'api/pull', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: record.tag, stream: true }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30 * 60 * 1000)]) });
      if (!response.ok || !response.body) { await markPullFailed(record.id, `Queued pull returned HTTP ${response.status}.`, 'none', attempt); return; }
      const result = await consumeOllamaProviderStream(response, controller.signal, async (value) => {
        const status = typeof value.status === 'string' ? value.status : null;
        const completed = typeof value.completed === 'number' && Number.isSafeInteger(value.completed) && value.completed >= 0 ? value.completed : null;
        const total = typeof value.total === 'number' && Number.isSafeInteger(value.total) && value.total >= 0 ? value.total : null;
        if (status === 'error' || value.error !== undefined) return 'error';
        if (completed !== null) await pullStore.update(record.id, { completedBytes: completed, ...(total === null ? {} : { totalBytes: total }), partialOutcome: completed > 0 ? 'some' : 'none', detail: status }, attempt);
        if (status === 'success') return 'success';
        return undefined;
      });
      if (result.success) await pullStore.update(record.id, { state: 'completed', providerStatus: 'success', detail: 'Pull stream completed.', retryable: false, partialOutcome: 'all' }, attempt);
      else {
        const current = await pullStore.get(record.id);
        await markPullFailed(record.id, result.reason ?? 'Provider stream ended without a success status.', current?.partialOutcome === 'some' ? 'some' : 'none', attempt);
      }
    } catch (error) {
      const current = await pullStore.get(record.id);
      if (current?.state !== 'cancelled' && current?.state !== 'paused') await markPullFailed(record.id, error instanceof Error ? error.message : 'Pull stream failed.', current?.partialOutcome === 'some' ? 'some' : 'none', attempt);
    } finally {
      const currentLease = pullControllers.get(record.id);
      if (currentLease && matchesOllamaPullAttempt(currentLease.attempt, attempt)) pullControllers.delete(record.id);
      void scheduleQueuedPulls();
    }
  };

  async function runQueuedPulls(): Promise<void> {
    const records = await pullStore.list();
    let active = records.filter((record) => record.state === 'pulling').length;
    for (const queued of records.filter((record) => record.state === 'queued')) {
      if (active >= 2) break;
      active += 1;
      const claimed = await pullStore.claim(queued.id);
      if (claimed) void processPull(claimed);
    }
  }

  app.get(`${OLLAMA_ROUTE_PREFIX}/hardware`, async (_req, res) => {
    let freeDiskBytes: number | null = null;
    try { const stats = await fs.statfs(dataDir); freeDiskBytes = Number(stats.bavail) * Number(stats.bsize); } catch { /* Unknown is safer than a guess. */ }
    return res.json({ ramBytes: os.totalmem(), availableRamBytes: os.freemem(), vramBytes: null, freeDiskBytes, architecture: os.arch(), gpu: null, driver: null, backend: null, backendSupported: null, detectedAt: new Date().toISOString(), evidence: ['RAM and architecture come from the host runtime.', 'GPU, VRAM, driver, and backend support are unavailable without a verified platform probe.'] });
  });

  app.get(`${OLLAMA_ROUTE_PREFIX}/pulls`, async (_req, res) => res.json({ records: await pullStore.list(), concurrency: 2 }));

  app.post(`${OLLAMA_ROUTE_PREFIX}/harness/register`, async (req, res) => {
    const profile = allowlistedHarness(req.body?.profile ?? req.body);
    if (!profile) return sendFailure(res, 400, 'INVALID_PROFILE', 'Harness profile is not allowlisted.');
    const identity = await executableIdentity(profile.executable);
    if (!identity) return sendFailure(res, 400, 'EXECUTABLE_NOT_FOUND', 'The selected executable does not exist.');
    const registered = { ...profile, id: randomUUID(), registered: true, executableIdentity: identity };
    const profiles = await readRegisteredProfiles(dataDir);
    profiles.push(registered);
    await writeRegisteredProfiles(dataDir, profiles);
    return res.status(201).json({ ok: true, profile: publicProfile(registered) });
  });

  app.post(`${OLLAMA_ROUTE_PREFIX}/harness/preflight`, async (req, res) => {
    const incoming = allowlistedHarness(req.body?.profile ?? req.body, true);
    if (!incoming) return sendFailure(res, 400, 'INVALID_PROFILE', 'Harness profile must be registered before preflight.');
    const profile = await registeredProfile(dataDir, incoming);
    if (!profile) return sendFailure(res, 409, 'PROFILE_CHANGED', 'The registered executable identity no longer matches. Register it again.');
    if (profile.workingDirectory && !(await safeDirectory(profile.workingDirectory))) return sendFailure(res, 400, 'INVALID_WORKING_DIRECTORY', 'The controlled working directory is unavailable or is a link.');
    const snapshotId = randomUUID();
    const preflightNonce = randomUUID();
    for (const [nonce, candidate] of preflightLeases) if (candidate.expiresAt <= Date.now()) preflightLeases.delete(nonce);
    preflightLeases.set(preflightNonce, { profileHash: profileHash(profile), snapshotId, expiresAt: Date.now() + 60_000 });
    return res.json({ ok: true, ...publicProfile(profile), snapshotId, preflightNonce, health: await healthyProfile(profile, configuredBase), rollback: 'A snapshot is written before launch and restored automatically when health verification fails.' });
  });

  app.post(`${OLLAMA_ROUTE_PREFIX}/harness/launch`, async (req, res) => {
    const incoming = allowlistedHarness(req.body?.profile ?? req.body, true);
    if (!incoming) return sendFailure(res, 400, 'INVALID_PROFILE', 'Harness profile must be registered before launch.');
    const preflightNonce = typeof req.body?.preflightNonce === 'string' ? req.body.preflightNonce : '';
    const lease = preflightLeases.get(preflightNonce);
    preflightLeases.delete(preflightNonce);
    if (!lease || lease.expiresAt <= Date.now() || lease.profileHash !== profileHash(incoming)) return sendFailure(res, 409, 'PREFLIGHT_EXPIRED', 'A current preflight nonce bound to this exact profile is required.');
    const profile = await registeredProfile(dataDir, incoming);
    if (!profile) return sendFailure(res, 409, 'PROFILE_CHANGED', 'The registered executable identity no longer matches. Register it again.');
    if (profile.workingDirectory && !(await safeDirectory(profile.workingDirectory))) return sendFailure(res, 400, 'INVALID_WORKING_DIRECTORY', 'The controlled working directory is unavailable or is a link.');
    const snapshotId = typeof req.body?.snapshotId === 'string' && /^[a-f0-9-]{20,80}$/i.test(req.body.snapshotId) ? req.body.snapshotId : randomUUID();
    const previous = activeHarnesses.get(profile.id)?.profile ?? null;
    if (snapshotId !== lease.snapshotId) return sendFailure(res, 409, 'SNAPSHOT_MISMATCH', 'The launch snapshot does not match the current preflight.');
    const snapshot: HarnessSnapshot = { id: snapshotId, createdAt: new Date().toISOString(), profile, previousProfile: previous, profileHash: profileHash(profile), previousProfileHash: previous ? profileHash(previous) : null };
    let child: ChildProcess | null = null;
    try {
      await writeSnapshot(dataDir, snapshot);
      const active = activeHarnesses.get(profile.id);
      active?.child.kill();
      child = startChild(profile);
      if (!child.pid) throw new Error('launch-failed');
      activeHarnesses.set(profile.id, { profile, child, snapshotId });
      if (!(await healthyProfile(profile, configuredBase))) throw new Error('health-check-failed');
      return res.status(202).json({ ok: true, pid: child.pid, snapshotId, health: 'healthy', rollback: 'Automatic rollback uses this stable snapshot when health verification fails.' });
    } catch (error) {
      child?.kill();
      activeHarnesses.delete(profile.id);
      if (previous) {
        const restoredChild = startChild(previous);
        if (restoredChild.pid && await healthyProfile(previous, configuredBase)) activeHarnesses.set(profile.id, { profile: previous, child: restoredChild, snapshotId });
      }
      return sendFailure(res, 502, error instanceof Error && error.message === 'health-check-failed' ? 'HEALTH_CHECK_FAILED' : 'LAUNCH_FAILED', 'Harness launch failed and the stable snapshot was restored when possible.');
    }
  });

  app.post(`${OLLAMA_ROUTE_PREFIX}/harness/restore`, async (req, res) => {
    const snapshotId = typeof req.body?.snapshotId === 'string' ? req.body.snapshotId : typeof req.body?.snapshot === 'string' ? req.body.snapshot.replace(/\.json$/i, '') : '';
    const snapshot = await readSnapshot(dataDir, snapshotId);
    if (!snapshot) return sendFailure(res, 404, 'SNAPSHOT_NOT_FOUND', 'Snapshot could not be read.');
    if (!(await registeredProfile(dataDir, snapshot.profile))) return sendFailure(res, 409, 'PROFILE_CHANGED', 'The registered executable identity no longer matches the snapshot.');
    const current = activeHarnesses.get(snapshot.profile.id);
    current?.child.kill();
    const child = startChild(snapshot.profile);
    if (!child.pid || !(await healthyProfile(snapshot.profile, configuredBase))) { child.kill(); return sendFailure(res, 502, 'RESTORE_FAILED', 'Snapshot restore did not pass the local health check.'); }
    activeHarnesses.set(snapshot.profile.id, { profile: snapshot.profile, child, snapshotId: snapshot.id });
    return res.json({ ok: true, restored: true, snapshotId: snapshot.id, health: 'healthy', profile: publicProfile(snapshot.profile) });
  });

  app.post(`${OLLAMA_ROUTE_PREFIX}/pull`, async (req, res) => {
    const tag = modelTag(req.body?.tag);
    if (!tag) return sendFailure(res, 400, 'INVALID_INPUT', 'A bounded model tag is required.');
    const existing = (await pullStore.list()).find((record) => record.tag === tag && ['queued', 'pulling', 'paused'].includes(record.state));
    if (existing) return res.status(202).json(existing);
    const record = await pullStore.add(tag, configuredBase.toString());
    void scheduleQueuedPulls();
    return res.status(202).json(record);
  });

  const actionRoute = (action: 'cancel' | 'pause' | 'resume' | 'retry') => `${OLLAMA_ROUTE_PREFIX}/pulls/:id/${action}`;
  app.post(actionRoute('cancel'), async (req, res) => { pullControllers.get(req.params.id)?.controller.abort(); const record = await pullStore.update(req.params.id, { state: 'cancelled', providerStatus: 'cancelled', retryable: false, detail: 'Cancelled by the user.' }); void scheduleQueuedPulls(); return record ? res.json(record) : sendFailure(res, 404, 'NOT_FOUND', 'Unknown pull queue item.'); });
  app.post(actionRoute('pause'), async (req, res) => { pullControllers.get(req.params.id)?.controller.abort(); const record = await pullStore.update(req.params.id, { state: 'paused', providerStatus: 'cancelled', detail: 'Paused by the user.' }); void scheduleQueuedPulls(); return record ? res.json(record) : sendFailure(res, 404, 'NOT_FOUND', 'Unknown pull queue item.'); });
  app.post(actionRoute('resume'), async (req, res) => { const record = await pullStore.get(req.params.id); if (!record || record.state !== 'paused') return sendFailure(res, 409, 'NOT_RESUMABLE', 'Only a paused pull can resume.'); const queued = await pullStore.update(req.params.id, { state: 'queued', providerStatus: 'queued', detail: 'Queued for resume.', retryable: true }); void scheduleQueuedPulls(); return queued ? res.json(queued) : sendFailure(res, 404, 'NOT_FOUND', 'Unknown pull queue item.'); });
  app.post(actionRoute('retry'), async (req, res) => { const record = await pullStore.get(req.params.id); if (!record) return sendFailure(res, 404, 'NOT_FOUND', 'Unknown pull queue item.'); if (!record.retryable || !['failed', 'cancelled'].includes(record.state)) return sendFailure(res, 409, 'NOT_RETRYABLE', 'This pull is not in a retryable state.'); const queued = await pullStore.update(req.params.id, { state: 'queued', providerStatus: 'queued', detail: 'Queued for retry.', retryable: true }); void scheduleQueuedPulls(); return queued ? res.json(queued) : sendFailure(res, 404, 'NOT_FOUND', 'Unknown pull queue item.'); });

  app.get(`${OLLAMA_ROUTE_PREFIX}/runtime`, async (req, res) => {
    try {
      const response = await localRequest(configuredBase, 'api/version');
      if (!response.ok) return res.json({ state: 'unhealthy', version: null, detail: `Local runtime returned HTTP ${response.status}.`, checkedAt: new Date().toISOString() });
      const payload = await boundedJson(response);
      if (!isRecord(payload)) return res.json({ state: 'unhealthy', version: null, detail: 'Local runtime returned malformed status.', checkedAt: new Date().toISOString() });
      return res.json({ state: 'healthy', version: typeof payload.version === 'string' ? payload.version.slice(0, 80) : null, detail: 'Local runtime responded.', checkedAt: new Date().toISOString() });
    } catch (error) { return res.json({ state: 'offline', version: null, detail: error instanceof Error && error.message === 'response-too-large' ? 'Local runtime response exceeded the size bound.' : 'Local runtime could not be reached.', checkedAt: new Date().toISOString() }); }
  });

  app.get(`${OLLAMA_ROUTE_PREFIX}/installed`, async (req, res) => {
    try {
      const response = await localRequest(configuredBase, 'api/tags');
      if (!response.ok) return sendFailure(res, 503, 'RUNTIME_UNHEALTHY', `Local tags returned HTTP ${response.status}.`);
      const payload = await boundedJson(response);
      if (!isRecord(payload) || !Array.isArray(payload.models) || payload.models.length > OLLAMA_MAX_CATALOG_MODELS) return sendFailure(res, 502, 'MALFORMED_RESPONSE', 'Installed model state was malformed.');
      const tags = payload.models.flatMap((item) => isRecord(item) && modelTag(item.name) ? [modelTag(item.name)!] : []);
      if (tags.length !== payload.models.length) return sendFailure(res, 502, 'MALFORMED_RESPONSE', 'Installed model state contained an invalid model row.');
      let running: string[] = [];
      try { const runningResponse = await localRequest(configuredBase, 'api/ps'); if (runningResponse.ok) { const runningPayload = await boundedJson(runningResponse); if (isRecord(runningPayload) && Array.isArray(runningPayload.models)) running = runningPayload.models.flatMap((item) => isRecord(item) && modelTag(item.name) ? [modelTag(item.name)!] : []); } } catch { running = []; }
      return res.json({ tags, running });
    } catch { return sendFailure(res, 503, 'OFFLINE', 'Installed model state is unavailable.'); }
  });

  app.get(`${OLLAMA_ROUTE_PREFIX}/catalog`, async (req, res) => {
    const supplied = typeof req.query.pageToken === 'string' ? req.query.pageToken : null;
    const pageToken = supplied && supplied.length <= 500 && !/[\r\n]/.test(supplied) ? supplied : supplied === null ? null : undefined;
    if (pageToken === undefined) return sendFailure(res, 400, 'INVALID_INPUT', 'Catalog page token is invalid.');
    try {
      const response = await officialCatalogRequest(pageToken);
      if (!response.ok) return sendFailure(res, 503, 'CATALOG_UNAVAILABLE', `Official catalog returned HTTP ${response.status}.`);
      const payload = await boundedJson(response);
      if (!isRecord(payload) || !Array.isArray(payload.models) || payload.models.length > OLLAMA_MAX_CATALOG_MODELS) return sendFailure(res, 502, 'CATALOG_INCOMPLETE', 'Official catalog omitted models or exceeded the model bound.');
      const rawNextPageToken = normalizeOllamaCatalogPageToken(payload);
      const variants: CatalogVariant[] = payload.models.map((item) => {
        if (!isRecord(item) || !modelTag(item.name)) throw new Error('invalid-model-row');
        const details = isRecord(item.details) ? item.details : {};
        return { tag: modelTag(item.name)!, family: typeof details.family === 'string' ? details.family.slice(0, 80) : null, parameterSize: typeof details.parameter_size === 'string' ? details.parameter_size.slice(0, 40) : null, parameterCount: null, quantization: typeof details.quantization_level === 'string' ? details.quantization_level.slice(0, 40) : null, blobBytes: typeof item.size === 'number' && Number.isSafeInteger(item.size) && item.size >= 0 ? item.size : null, contextWindow: null, contextOverheadBytes: null, capabilities: [], installed: false, running: false, fit: 'unknown', fitEvidence: ['Official catalog metadata requires host hardware facts before a fit verdict can be computed.'] };
      });
      let localDetailsAvailable = false;
      try { localDetailsAvailable = (await localRequest(configuredBase, 'api/version', { signal: AbortSignal.timeout(5_000) })).ok; } catch { localDetailsAvailable = false; }
      for (let index = 0; localDetailsAvailable && index < Math.min(variants.length, OLLAMA_MAX_LOCAL_DETAIL_MODELS); index += 1) {
        const variant = variants[index];
        if (!variant) continue;
        const detail = await localModelDetail(configuredBase, variant.tag);
        if (detail) {
          variant.capabilities = detail.capabilities;
          variant.contextWindow = detail.contextWindow;
          variant.parameterCount = detail.parameterCount;
          variant.fitEvidence = [...variant.fitEvidence, 'Capabilities and model details were read from the bounded local /api/show response.'];
        } else {
          variant.fitEvidence = [...variant.fitEvidence, 'Local model detail is unavailable; attachment controls remain disabled.'];
        }
      }
      const sourceRevision = response.headers.get('etag')?.trim() || `sha256:${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`;
      return res.json({ variants, nextPageToken: rawNextPageToken, sourceRevision, sourceIdentity: OLLAMA_OFFICIAL_CATALOG_ID });
    } catch (error) { return sendFailure(res, 502, 'CATALOG_INCOMPLETE', error instanceof Error && error.message === 'invalid-model-row' ? 'Official catalog contained an invalid model row.' : 'Official catalog response was malformed.'); }
  });

  app.post(`${OLLAMA_ROUTE_PREFIX}/chat`, async (req, res) => {
    const request = validateChatRequest(req.body);
    if (!request.ok) return sendFailure(res, 400, 'INVALID_INPUT', request.message);
    const ollamaMessages: Array<{ role: string; content: string; images?: string[] }> = [];
    for (const message of (request.systemPrompt ? [{ role: 'system' as const, content: request.systemPrompt, attachments: [] }, ...request.messages] : request.messages)) {
      const imageAttachments = message.attachments.filter((attachment) => attachment.mimeType.toLowerCase().startsWith('image/'));
      const textAttachments = message.attachments.filter((attachment) => attachment.mimeType.toLowerCase().startsWith('text/') || attachment.mimeType.toLowerCase() === 'application/json');
      const unsupportedAttachments = message.attachments.filter((attachment) => !attachment.mimeType.toLowerCase().startsWith('image/') && !attachment.mimeType.toLowerCase().startsWith('text/') && attachment.mimeType.toLowerCase() !== 'application/json');
      if (unsupportedAttachments.length) return sendFailure(res, 400, 'UNSUPPORTED_ATTACHMENT', 'The local API does not accept this attachment type.');
      const textContent = textAttachments.map((attachment) => `\n[Attachment ${attachment.name}]\n${Buffer.from(attachment.dataBase64!, 'base64').toString('utf8')}`).join('');
      ollamaMessages.push({ role: message.role, content: `${message.content}${textContent}`.slice(0, OLLAMA_MAX_MESSAGE_BYTES), ...(imageAttachments.length ? { images: imageAttachments.map((attachment) => attachment.dataBase64!) } : {}) });
    }
    const controller = new AbortController();
    const abort = () => controller.abort();
    req.once('aborted', abort);
    res.once('close', abort);
    try {
      const response = await localRequest(configuredBase, 'api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: request.tag, messages: ollamaMessages, options: { temperature: request.parameters.temperature, top_p: request.parameters.topP, top_k: request.parameters.topK, num_ctx: request.parameters.numCtx, ...(request.parameters.seed === null ? {} : { seed: request.parameters.seed }) }, stream: true }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30 * 60 * 1000)]) });
      if (!response.ok || !response.body) return sendFailure(res, 502, 'CHAT_FAILED', `Local chat returned HTTP ${response.status}.`);
      res.status(response.status).setHeader('content-type', 'application/x-ndjson').setHeader('x-ollama-chat-status', 'streaming');
      const result = await consumeOllamaProviderStream(response, controller.signal, (value) => {
        if (value.error !== undefined) { res.write(`${JSON.stringify({ error: 'Provider reported an error.' })}\n`); return 'error'; }
        const encoded = JSON.stringify(value);
        if (Buffer.byteLength(encoded, 'utf8') > OLLAMA_MAX_NDJSON_LINE_BYTES) return 'error';
        res.write(`${encoded}\n`);
        return undefined;
      });
      if (!result.success && !res.writableEnded) res.write(`${JSON.stringify({ error: result.reason ?? 'Local chat stream failed.' })}\n`);
      if (!res.writableEnded) res.end();
    } catch { if (!res.headersSent) sendFailure(res, 503, 'OFFLINE', 'The local runtime could not start chat.'); else if (!res.writableEnded) res.end(); }
    finally { req.removeListener('aborted', abort); res.removeListener('close', abort); }
  });

  return { mounted: true, prefix: OLLAMA_ROUTE_PREFIX };
}

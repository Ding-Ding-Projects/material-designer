import { appendFile, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { watch, type FSWatcher } from 'node:fs';
import { execFile } from 'node:child_process';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { randomUUID } from 'node:crypto';
import { request as httpsRequest } from 'node:https';
import { Readable } from 'node:stream';
import type { IncomingMessage } from 'node:http';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const MAX_BYTES = 512 * 1024;
const MAX_DEPTH = 8;
const MAX_COLLECTION_ITEMS = 500;
export const UNIVERSAL_SCHEDULE_RESPONSE_MAX_BYTES = 64 * 1024;
export const UNIVERSAL_SCHEDULE_TIMEOUT_MS = 4_000;
export const UNIVERSAL_SCHEDULE_DNS_TIMEOUT_MS = 2_000;
const SECRET_KEY = /^(?:password|passcode|pin|totp|secret|token|totpSecretBase32)$/i;
const ALLOWED_STATE_KEYS = new Set([
  'schemaVersion', 'revision', 'updatedAt', 'languageMode', 'funnyEnglish',
  'funnyCantonese', 'showDialogEmoji', 'school', 'displayName', 'theme',
  'density', 'accentColor', 'uiFontFamily', 'narrator', 'schedules', 'adhd',
  'nextAction', 'momentumSnoozedUntil', 'notifications',
]);
const ALLOWED_NESTED_KEYS: Record<string, ReadonlySet<string>> = {
  school: new Set(['enabled', 'name', 'credentialConfigured', 'credentialBackend']),
  narrator: new Set(['enabled', 'language', 'englishVoiceId', 'cantoneseVoiceId', 'rate', 'pitch', 'quiet']),
  adhd: new Set(['focus', 'lowStimulation', 'timeAwareness', 'oneThing', 'momentum']),
  schedules: new Set(['id', 'label', 'enabled', 'priority', 'startDate', 'endDate', 'startTime', 'endTime', 'weekdays', 'source', 'sourceUrl', 'sourceBaseUrl', 'sourceEntity', 'values']),
  notifications: new Set(['id', 'title', 'body', 'tone', 'createdAt', 'read']),
};
const ALLOWED_SCHEDULE_VALUE_KEYS = new Set([
  'languageMode', 'theme', 'density', 'accentColor', 'uiFontFamily',
]);
let temporarySequence = 0;
function temporaryPath(path: string): string {
  temporarySequence += 1;
  return `${path}.${process.pid}.${Date.now()}.${temporarySequence}.${randomUUID()}.tmp`;
}

export type UniversalSettingsRecord = Record<string, unknown> & {
  schemaVersion: 1;
  revision: number;
  updatedAt: number;
};

export type UniversalSettingsStoreResult =
  | { ok: true; state: UniversalSettingsRecord }
  | { ok: false; code: 'invalid-input' | 'stale-revision' | 'persistence-failed' | 'store-corrupt' };

export type UniversalSettingsSecretResult =
  | { ok: true }
  | { ok: false; code: 'invalid-input' | 'protection-unavailable' | 'persistence-failed' };

export type UniversalStatusReport = {
  sessionId: string;
  project: string;
  state: 'running' | 'waiting' | 'blocked' | 'failed' | 'verified' | 'unavailable';
  summary: string;
  evidence: readonly { label: string; url: string | null; verified: boolean }[];
  sourceRevision: string | null;
  updatedAt: number;
};

export type UniversalStatusResult =
  | { ok: true; report: UniversalStatusReport; delivery: 'hub' | 'local-fallback'; noDeliveryReason: string | null }
  | { ok: false; code: 'invalid-input' | 'persistence-failed' | 'unavailable' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function containsSecretKey(value: unknown, depth = 0, seen = new WeakSet<object>()): boolean {
  // A value deeper than the declared schema is rejected, rather than treated
  // as safe. Otherwise a secret hidden below the scan depth would pass the
  // host boundary and land in a supposedly redacted record.
  if (depth > MAX_DEPTH) return true;
  if (Array.isArray(value)) {
    if (value.length > MAX_COLLECTION_ITEMS || seen.has(value)) return true;
    seen.add(value);
    return value.some((item) => containsSecretKey(item, depth + 1, seen));
  }
  if (!isRecord(value)) return false;
  if (seen.has(value)) return true;
  seen.add(value);
  return Object.entries(value).some(([key, child]) => SECRET_KEY.test(key) || containsSecretKey(child, depth + 1, seen));
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>, maxKeys = 64): boolean {
  const keys = Object.keys(value);
  return keys.length <= maxKeys && keys.every((key) => allowed.has(key));
}

function isSafeText(value: unknown, maxLength: number): value is string {
  return typeof value === 'string'
    && value.length <= maxLength
    && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value);
}

function validClockText(value: unknown): boolean {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/u.test(value)) return false;
  const [hours, minutes] = value.split(':').map(Number);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

function validCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(from, to);
      return;
    } catch (error: unknown) {
      const code = isRecord(error) ? error.code : undefined;
      if (!['EPERM', 'EACCES', 'EBUSY'].includes(String(code)) || attempt >= 5) throw error;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 25 * (attempt + 1)));
    }
  }
}

function validState(value: unknown): value is UniversalSettingsRecord {
  if (!isRecord(value) || value.schemaVersion !== 1
    || typeof value.revision !== 'number' || !Number.isSafeInteger(value.revision) || value.revision < 0
    || typeof value.updatedAt !== 'number' || !Number.isFinite(value.updatedAt) || value.updatedAt < 0) return false;
  if (!hasOnlyKeys(value, ALLOWED_STATE_KEYS)) return false;
  if (containsSecretKey(value)) return false;
  for (const [key, allowed] of Object.entries(ALLOWED_NESTED_KEYS)) {
    const child = value[key];
    if (key === 'schedules' || key === 'notifications') {
      if (child !== undefined && (!Array.isArray(child) || child.some((item) => !isRecord(item) || !hasOnlyKeys(item, allowed)))) return false;
    } else if (child !== undefined && (!isRecord(child) || !hasOnlyKeys(child, allowed))) return false;
  }
  if (value.languageMode !== undefined && !['english', 'cantonese', 'bilingual'].includes(String(value.languageMode))) return false;
  if (value.funnyEnglish !== undefined && (typeof value.funnyEnglish !== 'number' || !Number.isInteger(value.funnyEnglish) || value.funnyEnglish < 1 || value.funnyEnglish > 5)) return false;
  if (value.funnyCantonese !== undefined && (typeof value.funnyCantonese !== 'number' || !Number.isInteger(value.funnyCantonese) || value.funnyCantonese < 1 || value.funnyCantonese > 5)) return false;
  if (value.displayName !== undefined && !isSafeText(value.displayName, 120)) return false;
  if (value.nextAction !== undefined && !isSafeText(value.nextAction, 240)) return false;
  if (value.momentumSnoozedUntil !== undefined && (typeof value.momentumSnoozedUntil !== 'number' || !Number.isFinite(value.momentumSnoozedUntil) || value.momentumSnoozedUntil < 0)) return false;
  if (value.accentColor !== undefined && (typeof value.accentColor !== 'string' || !/^(?:#[0-9a-f]{6}|#[0-9a-f]{8})$/iu.test(value.accentColor))) return false;
  if (value.uiFontFamily !== undefined && !isSafeText(value.uiFontFamily, 160)) return false;
  if (value.school !== undefined && (!isRecord(value.school)
    || (value.school.enabled !== undefined && typeof value.school.enabled !== 'boolean')
    || (value.school.name !== undefined && !isSafeText(value.school.name, 80))
    || (value.school.credentialConfigured !== undefined && typeof value.school.credentialConfigured !== 'boolean')
    || (value.school.credentialBackend !== undefined && !['host-vault', 'browser-local', 'unavailable'].includes(String(value.school.credentialBackend))))) return false;
  if (value.narrator !== undefined && (!isRecord(value.narrator)
    || (value.narrator.enabled !== undefined && typeof value.narrator.enabled !== 'boolean')
    || (value.narrator.language !== undefined && !['english', 'cantonese', 'both'].includes(String(value.narrator.language)))
    || (value.narrator.englishVoiceId !== undefined && value.narrator.englishVoiceId !== null && !isSafeText(value.narrator.englishVoiceId, 240))
    || (value.narrator.cantoneseVoiceId !== undefined && value.narrator.cantoneseVoiceId !== null && !isSafeText(value.narrator.cantoneseVoiceId, 240))
    || (value.narrator.rate !== undefined && (typeof value.narrator.rate !== 'number' || !Number.isFinite(value.narrator.rate) || value.narrator.rate < 0.1 || value.narrator.rate > 3))
    || (value.narrator.pitch !== undefined && (typeof value.narrator.pitch !== 'number' || !Number.isFinite(value.narrator.pitch) || value.narrator.pitch < 0 || value.narrator.pitch > 2))
    || (value.narrator.quiet !== undefined && typeof value.narrator.quiet !== 'boolean'))) return false;
  if (value.adhd !== undefined && (!isRecord(value.adhd) || !hasOnlyKeys(value.adhd, ALLOWED_NESTED_KEYS.adhd) || Object.values(value.adhd).some((flag) => typeof flag !== 'boolean'))) return false;
  if (value.notifications !== undefined && Array.isArray(value.notifications) && (value.notifications.length > MAX_COLLECTION_ITEMS || value.notifications.some((item) => !isRecord(item) || typeof item.id !== 'string' || item.id.length > 96 || typeof item.title !== 'string' || item.title.length > 240 || typeof item.body !== 'string' || item.body.length > 1000 || typeof item.createdAt !== 'number' || !Number.isFinite(item.createdAt) || typeof item.read !== 'boolean' || !['info', 'success', 'warning', 'error'].includes(String(item.tone))))) return false;
  if (Array.isArray(value.schedules)) {
    for (const item of value.schedules) {
      if (!isRecord(item)) return false;
      if (typeof item.label === 'string' && item.label.length > 120) return false;
      if (typeof item.priority !== 'number' || !Number.isFinite(item.priority) || item.priority < -1000 || item.priority > 1000) return false;
      if (!validClockText(item.startTime) || !validClockText(item.endTime)) return false;
      if (typeof item.id !== 'string' || item.id.length === 0 || item.id.length > 96 || (item.startDate !== null && item.startDate !== undefined && !validCalendarDate(item.startDate)) || (item.endDate !== null && item.endDate !== undefined && !validCalendarDate(item.endDate)) || (item.startDate && item.endDate && item.startDate > item.endDate) || !['local', 'api', 'homeAssistant'].includes(String(item.source)) || (item.weekdays !== 'all' && (!Array.isArray(item.weekdays) || item.weekdays.length > 7 || item.weekdays.length === 0 || item.weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)))) return false;
      if (item.values === undefined) continue;
      if (!isRecord(item.values) || !hasOnlyKeys(item.values, ALLOWED_SCHEDULE_VALUE_KEYS)) return false;
      if (item.values.languageMode !== undefined && !['english', 'cantonese', 'bilingual'].includes(String(item.values.languageMode))) return false;
      if (item.values.theme !== undefined && !['light', 'dark', 'system'].includes(String(item.values.theme))) return false;
      if (item.values.density !== undefined && !['comfortable', 'compact', 'spacious'].includes(String(item.values.density))) return false;
      if (item.values.accentColor !== undefined && (typeof item.values.accentColor !== 'string' || !/^(?:#[0-9a-f]{6}|#[0-9a-f]{8})$/iu.test(item.values.accentColor))) return false;
      if (item.values.uiFontFamily !== undefined && !isSafeText(item.values.uiFontFamily, 160)) return false;
    }
  }
  try { return Buffer.byteLength(JSON.stringify(value), 'utf8') <= MAX_BYTES; } catch { return false; }
}

export type UniversalScheduleSourceRequest =
  | { source: 'api'; url: string }
  | { source: 'homeAssistant'; baseUrl: string; entity: string };

export type UniversalScheduleSourceResult =
  | { ok: true; values: Record<string, unknown>; observedAt: number; sourceState: 'on' | 'off' | 'local' }
  | { ok: false; code: 'invalid-input' | 'credential-unavailable' | 'offline' | 'timeout' | 'invalid-response' };

const SCHEDULE_REQUEST_KEYS = new Set(['source', 'url', 'baseUrl', 'entity']);

function isPrivateAddress(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^\[|\]$/gu, '');
  if (normalized === '::' || normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd')
    || normalized.startsWith('2001:db8:') || /^(?:fe[89ab]):/u.test(normalized)) return true;
  if (normalized.startsWith('::ffff:')) return isPrivateAddress(normalized.slice('::ffff:'.length));
  if (isIP(normalized) !== 4) return false;
  const octets = normalized.split('.').map(Number);
  const [first, second] = octets;
  return first === 0 || first === 10 || first === 127 || first === 169 && second === 254
    || first === 192 && second === 168
    || first === 192 && second === 0
    || first === 192 && second === 2
    || first === 192 && second === 88
    || first === 172 && second !== undefined && second >= 16 && second <= 31
    || first === 100 && second !== undefined && second >= 64 && second <= 127
    || first === 198 && second !== undefined && (second === 18 || second === 19 || second === 51 || second === 100)
    || first === 203 && second === 0 && octets[2] === 113
    || first >= 224;
}

export const universalAddressIsPrivate = isPrivateAddress;

function isSafeScheduleUrl(value: unknown): value is string {
  if (!isSafeText(value, 500)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.hash
      && url.hostname.length > 0;
  } catch {
    return false;
  }
}

export function validateUniversalScheduleSourceRequest(value: unknown): UniversalScheduleSourceRequest | null {
  if (!isRecord(value) || !hasOnlyKeys(value, SCHEDULE_REQUEST_KEYS, 3)) return null;
  if (value.source === 'api' && isSafeScheduleUrl(value.url)) return { source: 'api', url: value.url };
  if (value.source === 'homeAssistant'
    && isSafeScheduleUrl(value.baseUrl)
    && isSafeText(value.entity, 160)
    && /^(?:binary_sensor|input_boolean)\.[a-z0-9_]+$/iu.test(value.entity)) {
    return { source: 'homeAssistant', baseUrl: value.baseUrl, entity: value.entity };
  }
  return null;
}

async function lookupWithTimeout(
  hostname: string,
  dnsLookup: typeof lookup,
): Promise<readonly { address: string }[]> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      dnsLookup(hostname, { all: true, verbatim: true }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('dns-timeout')), UNIVERSAL_SCHEDULE_DNS_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function resolvePublicScheduleAddress(
  url: string,
  dnsLookup: typeof lookup = lookup,
): Promise<string | null> {
  let parsed: URL;
  try { parsed = new URL(url); } catch { return null; }
  if (isIP(parsed.hostname) !== 0) return isPrivateAddress(parsed.hostname) ? null : parsed.hostname;
  try {
    const answers = await lookupWithTimeout(parsed.hostname, dnsLookup);
    if (answers.length === 0 || answers.some(({ address }: { address: string }) => isPrivateAddress(address))) return null;
    return answers[0]?.address ?? null;
  } catch {
    return null;
  }
}

function requestPinnedHttps(
  url: string,
  address: string,
  headers: Record<string, string>,
  signal: AbortSignal,
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace(/^\[|\]$/gu, '');
    const request = httpsRequest({
      hostname: address,
      port: parsed.port ? Number(parsed.port) : 443,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      servername: hostname,
      headers: { ...headers, Host: parsed.host },
      rejectUnauthorized: true,
      signal,
    }, (response: IncomingMessage) => {
      const stream = Readable.toWeb(response) as ReadableStream<Uint8Array>;
      const responseHeaders = new Headers();
      for (const [key, value] of Object.entries(response.headers)) {
        if (typeof value === 'string') responseHeaders.set(key, value);
      }
      resolve(new Response(stream, {
        status: response.statusCode ?? 0,
        headers: responseHeaders,
      }));
    });
    request.once('error', reject);
    request.end();
  });
}

async function readBoundedBody(response: Response): Promise<Uint8Array | null> {
  const declaredLength = response.headers.get('content-length');
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0 || parsedLength > UNIVERSAL_SCHEDULE_RESPONSE_MAX_BYTES) return null;
  }
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      if (!part.value) continue;
      total += part.value.byteLength;
      if (total > UNIVERSAL_SCHEDULE_RESPONSE_MAX_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function normalizeRemoteValues(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ALLOWED_SCHEDULE_VALUE_KEYS, ALLOWED_SCHEDULE_VALUE_KEYS.size)) return null;
  const values: Record<string, unknown> = {};
  if (value.languageMode === 'english' || value.languageMode === 'cantonese' || value.languageMode === 'bilingual') values.languageMode = value.languageMode;
  if (value.theme === 'light' || value.theme === 'dark' || value.theme === 'system') values.theme = value.theme;
  if (value.density === 'comfortable' || value.density === 'compact' || value.density === 'spacious') values.density = value.density;
  if (typeof value.accentColor === 'string' && /^(?:#[0-9a-f]{6}|#[0-9a-f]{8})$/iu.test(value.accentColor)) values.accentColor = value.accentColor;
  if (isSafeText(value.uiFontFamily, 160)) values.uiFontFamily = value.uiFontFamily;
  for (const key of Object.keys(value)) {
    if (!(key in values)) return null;
  }
  return values;
}

export class UniversalSettingsStore {
  readonly #path: string;
  readonly #secretPath: string;
  readonly #historyPath: string;
  readonly #historyRepoPath: string;
  readonly #statusPath: string;
  readonly #protect: ((value: string) => Buffer) | null;
  readonly #unprotect: ((value: Buffer) => string) | null;
  #state: UniversalSettingsRecord | null = null;
  #watcher: FSWatcher | null = null;
  #writeQueue: Promise<unknown> = Promise.resolve();
  #statusQueue: Promise<unknown> = Promise.resolve();
  #lastPublishedRevision = -1;
  readonly #listeners = new Set<(state: UniversalSettingsRecord) => void>();

  constructor(directory: string, options: {
    protect?: (value: string) => Buffer;
    unprotect?: (value: Buffer) => string;
  } = {}) {
    this.#path = join(directory, 'settings.v1.json');
    this.#secretPath = join(directory, 'home-assistant-token.bin');
    this.#historyPath = join(directory, 'history.v1.jsonl');
    this.#historyRepoPath = join(directory, 'history-repository');
    this.#statusPath = join(directory, 'status.v1.json');
    this.#protect = options.protect ?? null;
    this.#unprotect = options.unprotect ?? null;
  }

  async read(): Promise<UniversalSettingsStoreResult> {
    if (this.#state) return { ok: true, state: structuredClone(this.#state) };
    try {
      const raw = await readFile(this.#path, 'utf8');
      if (Buffer.byteLength(raw, 'utf8') > MAX_BYTES) return { ok: false, code: 'store-corrupt' };
      const value: unknown = JSON.parse(raw);
      if (!validState(value)) return { ok: false, code: 'store-corrupt' };
      this.#state = structuredClone(value);
      return { ok: true, state: structuredClone(value) };
    } catch (error: unknown) {
      if (isRecord(error) && error.code === 'ENOENT') {
        const initial: UniversalSettingsRecord = { schemaVersion: 1, revision: 0, updatedAt: 0 };
        this.#state = initial;
        return { ok: true, state: structuredClone(initial) };
      }
      return { ok: false, code: 'persistence-failed' };
    }
  }

  async write(next: unknown, expectedRevision: number): Promise<UniversalSettingsStoreResult> {
    const operation = this.#writeQueue.catch(() => undefined).then(() => this.#writeInternal(next, expectedRevision));
    this.#writeQueue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  async #writeInternal(next: unknown, expectedRevision: number): Promise<UniversalSettingsStoreResult> {
    if (!validState(next) || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) return { ok: false, code: 'invalid-input' };
    const current = await this.read();
    if (!current.ok) return current;
    const currentRevision = current.state.revision;
    if (currentRevision !== expectedRevision) return { ok: false, code: 'stale-revision' };
    if (next.revision !== expectedRevision + 1) return { ok: false, code: 'invalid-input' };
    const state = structuredClone(next);
    const temporary = temporaryPath(this.#path);
    try {
      await mkdir(dirname(this.#path), { recursive: true });
      await writeFile(temporary, JSON.stringify(state), 'utf8');
      await renameWithRetry(temporary, this.#path);
      this.#state = state;
      this.#lastPublishedRevision = state.revision;
      await appendFile(this.#historyPath, `${JSON.stringify({
        revision: state.revision,
        updatedAt: state.updatedAt,
        action: 'settings changed',
        fields: Object.keys(state).filter((key) => key !== 'notifications'),
      })}\n`, 'utf8').catch(() => undefined);
      await this.#recordGitHistory(state);
      for (const listener of this.#listeners) listener(structuredClone(state));
      return { ok: true, state: structuredClone(state) };
    } catch {
      await unlink(temporary).catch(() => undefined);
      return { ok: false, code: 'persistence-failed' };
    }
  }

  /** Keep an isolated append-only Git history beside the host-owned settings.
   * Only redacted metadata and non-secret settings are written. A history
   * failure never rolls back the user's successful settings mutation. */
  async #recordGitHistory(state: UniversalSettingsRecord): Promise<void> {
    try {
      await mkdir(this.#historyRepoPath, { recursive: true });
      const snapshot = Object.fromEntries(Object.entries(state).filter(([key]) => !SECRET_KEY.test(key)));
      const snapshotPath = join(this.#historyRepoPath, 'state.v1.json');
      await writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf8');
      const run = (args: string[]) => execFileAsync('git', args, { cwd: this.#historyRepoPath, windowsHide: true, maxBuffer: 128 * 1024 });
      try { await run(['rev-parse', '--git-dir']); } catch { await run(['init', '--quiet']); }
      await run(['add', '--', 'state.v1.json']);
      await run(['-c', 'user.name=Material Designer local history', '-c', 'user.email=local-history@invalid', 'commit', '--quiet', '-m', `settings revision ${state.revision}`]);
    } catch {
      // The JSONL stream remains the recovery fallback, and callers are not
      // told that a settings write failed merely because Git was unavailable.
    }
  }

  async #recordGitHistoryEvent(action: string): Promise<void> {
    try {
      await mkdir(this.#historyRepoPath, { recursive: true });
      const eventsPath = join(this.#historyRepoPath, 'events.v1.jsonl');
      await appendFile(eventsPath, `${JSON.stringify({ action, recordedAt: Date.now() })}\n`, 'utf8');
      const run = (args: string[]) => execFileAsync('git', args, { cwd: this.#historyRepoPath, windowsHide: true, maxBuffer: 128 * 1024 });
      try { await run(['rev-parse', '--git-dir']); } catch { await run(['init', '--quiet']); }
      await run(['add', '--', 'events.v1.jsonl']);
      await run(['-c', 'user.name=Material Designer local history', '-c', 'user.email=local-history@invalid', 'commit', '--quiet', '-m', action]);
    } catch {
      // The credential itself is never copied into this repository.
    }
  }

  subscribe(listener: (state: UniversalSettingsRecord) => void): () => void {
    this.#listeners.add(listener);
    if (!this.#watcher) {
      void mkdir(dirname(this.#path), { recursive: true }).then(() => {
        if (this.#watcher) return;
        this.#watcher = watch(dirname(this.#path), (_event: string, filename: string | Buffer | null) => {
          if (filename?.toString() !== 'settings.v1.json') return;
          this.#state = null;
          void this.read().then((result) => {
            if (!result.ok) return;
            if (result.state.revision === this.#lastPublishedRevision) return;
            this.#lastPublishedRevision = result.state.revision;
            for (const target of this.#listeners) target(structuredClone(result.state));
          });
        });
      }).catch(() => undefined);
    }
    return () => {
      this.#listeners.delete(listener);
      if (this.#listeners.size === 0) {
        this.#watcher?.close();
        this.#watcher = null;
      }
    };
  }

  close(): void {
    this.#watcher?.close();
    this.#watcher = null;
    this.#listeners.clear();
  }

  async setHomeAssistantToken(value: unknown): Promise<UniversalSettingsSecretResult> {
    if (typeof value !== 'string' || value.length === 0 || value.length > 4096 || !this.#protect) {
      return { ok: false, code: this.#protect ? 'invalid-input' : 'protection-unavailable' };
    }
    const temporary = temporaryPath(this.#secretPath);
    try {
      const protectedValue = this.#protect(value);
      await mkdir(dirname(this.#secretPath), { recursive: true });
      await writeFile(temporary, protectedValue);
      await renameWithRetry(temporary, this.#secretPath);
      await this.#recordGitHistoryEvent('home-assistant credential configured');
      return { ok: true };
    } catch {
      await unlink(temporary).catch(() => undefined);
      return { ok: false, code: 'persistence-failed' };
    }
  }

  async clearHomeAssistantToken(): Promise<UniversalSettingsSecretResult> {
    try {
      await unlink(this.#secretPath);
      await this.#recordGitHistoryEvent('home-assistant credential cleared');
      return { ok: true };
    } catch (error: unknown) {
      return isRecord(error) && error.code === 'ENOENT'
        ? { ok: true }
        : { ok: false, code: 'persistence-failed' };
    }
  }

  async readHomeAssistantToken(): Promise<string | null> {
    if (!this.#unprotect) return null;
    try {
      const protectedValue = await readFile(this.#secretPath);
      return this.#unprotect(protectedValue);
    } catch {
      return null;
    }
  }

  async resolveScheduleSource(request: unknown): Promise<UniversalScheduleSourceResult> {
    const source = validateUniversalScheduleSourceRequest(request);
    const sourceUrl = source?.source === 'api' ? source.url : source?.baseUrl;
    const address = sourceUrl ? await resolvePublicScheduleAddress(sourceUrl) : null;
    if (!source || !address) {
      return { ok: false, code: 'invalid-input' };
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), UNIVERSAL_SCHEDULE_TIMEOUT_MS);
    try {
      let url: string;
      const headers: Record<string, string> = {};
      if (source.source === 'api') {
        url = source.url;
      } else {
        const token = await this.readHomeAssistantToken();
        if (!token) return { ok: false, code: 'credential-unavailable' };
        url = `${source.baseUrl.replace(/\/$/u, '')}/api/states/${encodeURIComponent(source.entity)}`;
        headers.Authorization = `Bearer ${token}`;
      }
      const response = await requestPinnedHttps(url, address, headers, controller.signal);
      if (response.status >= 300 && response.status < 400) return { ok: false, code: 'invalid-response' };
      if (!response.ok) return { ok: false, code: 'offline' };
      const bytes = await readBoundedBody(response);
      if (!bytes) return { ok: false, code: 'invalid-response' };
      let parsed: unknown;
      try { parsed = JSON.parse(new TextDecoder().decode(bytes)); } catch { return { ok: false, code: 'invalid-response' }; }
      if (source.source === 'api') {
        if (!isRecord(parsed) || parsed.schemaVersion !== 1) return { ok: false, code: 'invalid-response' };
        const values = normalizeRemoteValues(parsed.values);
        return values === null
          ? { ok: false, code: 'invalid-response' }
          : { ok: true, values, observedAt: Date.now(), sourceState: 'on' };
      }
      if (!isRecord(parsed) || parsed.entity_id !== source.entity || (parsed.state !== 'on' && parsed.state !== 'off')) {
        return { ok: false, code: 'invalid-response' };
      }
      if (parsed.state === 'off') return { ok: true, values: {}, observedAt: Date.now(), sourceState: 'off' };
      const attributes = parsed.attributes;
      const candidate = isRecord(attributes) ? attributes.values : {};
      const values = normalizeRemoteValues(candidate);
      return values === null
        ? { ok: false, code: 'invalid-response' }
        : { ok: true, values, observedAt: Date.now(), sourceState: 'on' };
    } catch (error: unknown) {
      if (isRecord(error) && error.name === 'AbortError') return { ok: false, code: 'timeout' };
      return { ok: false, code: 'offline' };
    } finally {
      clearTimeout(timeout);
    }
  }

  async resolveSchedule(request: unknown): Promise<UniversalScheduleSourceResult> {
    return this.resolveScheduleSource(request);
  }

  async readHistory(): Promise<readonly Record<string, unknown>[]> {
    try {
      const raw = await readFile(this.#historyPath, 'utf8');
      return raw.split(/\r?\n/).filter(Boolean).slice(-500).flatMap((line: string) => {
        try {
          const value = JSON.parse(line);
          return isRecord(value) ? [value] : [];
        } catch {
          return [];
        }
      });
    } catch {
      return [];
    }
  }

  /**
   * Keep one bounded local projection per session. A desktop build may not
   * have a network Status Hub, so the result explicitly says local-fallback
   * instead of presenting a successful delivery claim.
   */
  async registerStatus(report: unknown): Promise<UniversalStatusResult> {
    return this.writeStatus(report);
  }

  async reportStatus(report: unknown): Promise<UniversalStatusResult> {
    return this.writeStatus(report);
  }

  async heartbeatStatus(sessionId: unknown, updatedAt: unknown): Promise<UniversalStatusResult> {
    if (typeof sessionId !== 'string' || sessionId.length === 0 || sessionId.length > 120 || typeof updatedAt !== 'number' || !Number.isFinite(updatedAt) || updatedAt < 0) {
      return { ok: false, code: 'invalid-input' };
    }
    const current = await this.readStatusRecords();
    const report = current[sessionId];
    if (!report) return { ok: false, code: 'unavailable' };
    return this.writeStatus({ ...report, updatedAt });
  }

  async readStatus(sessionId: unknown): Promise<UniversalStatusResult> {
    if (typeof sessionId !== 'string' || sessionId.length === 0 || sessionId.length > 120) {
      return { ok: false, code: 'invalid-input' };
    }
    const records = await this.readStatusRecords();
    const report = records[sessionId];
    if (!report) return { ok: false, code: 'unavailable' };
    return { ok: true, report: structuredClone(report), delivery: 'local-fallback', noDeliveryReason: 'No authenticated shared Status Hub endpoint is connected; the local host projection is current.' };
  }

  private writeStatus(value: unknown): Promise<UniversalStatusResult> {
    const operation = this.#statusQueue.catch(() => undefined).then(() => this.#writeStatusInternal(value));
    this.#statusQueue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  async #writeStatusInternal(value: unknown): Promise<UniversalStatusResult> {
    const report = normalizeStatusReport(value);
    if (!report) return { ok: false, code: 'invalid-input' };
    const records = await this.readStatusRecords();
    records[report.sessionId] = report;
    const ids = Object.keys(records);
    if (ids.length > 50) delete records[ids[0]];
    const temporary = temporaryPath(this.#statusPath);
    try {
      await mkdir(dirname(this.#statusPath), { recursive: true });
      await writeFile(temporary, JSON.stringify(records), 'utf8');
      await renameWithRetry(temporary, this.#statusPath);
      return { ok: true, report: structuredClone(report), delivery: 'local-fallback', noDeliveryReason: 'No authenticated shared Status Hub endpoint is connected; the local host projection is current.' };
    } catch {
      await unlink(temporary).catch(() => undefined);
      return { ok: false, code: 'persistence-failed' };
    }
  }

  private async readStatusRecords(): Promise<Record<string, UniversalStatusReport>> {
    try {
      const raw = await readFile(this.#statusPath, 'utf8');
      if (Buffer.byteLength(raw, 'utf8') > MAX_BYTES) return {};
      const parsed: unknown = JSON.parse(raw);
      if (!isRecord(parsed)) return {};
      return Object.fromEntries(Object.entries(parsed).flatMap(([key, value]) => {
        const report = normalizeStatusReport(value);
        return report && report.sessionId === key ? [[key, report]] : [];
      }));
    } catch {
      return {};
    }
  }
}

export function createUniversalSettingsStore(
  directory: string,
  options: { protect?: (value: string) => Buffer; unprotect?: (value: Buffer) => string } = {},
): UniversalSettingsStore {
  return new UniversalSettingsStore(directory, options);
}

function normalizeStatusReport(value: unknown): UniversalStatusReport | null {
  if (!isRecord(value)) return null;
  if (!hasOnlyKeys(value, new Set(['sessionId', 'project', 'state', 'summary', 'evidence', 'sourceRevision', 'updatedAt']), 7)) return null;
  const sessionId = typeof value.sessionId === 'string' ? value.sessionId.trim() : '';
  const project = typeof value.project === 'string' ? value.project.trim() : '';
  const summary = typeof value.summary === 'string' ? value.summary.trim() : '';
  const allowedStates = new Set(['running', 'waiting', 'blocked', 'failed', 'verified', 'unavailable']);
  if (!sessionId || sessionId.length > 120 || !project || project.length > 180 || !summary || summary.length > 1000 || !allowedStates.has(String(value.state)) || !Number.isFinite(value.updatedAt)) return null;
  if (value.sourceRevision !== null && (typeof value.sourceRevision !== 'string' || value.sourceRevision.length > 120)) return null;
  if (!Array.isArray(value.evidence) || value.evidence.length > 50) return null;
  const evidence = value.evidence.flatMap((item) => {
    if (!isRecord(item) || !hasOnlyKeys(item, new Set(['label', 'url', 'verified']), 3)
      || !isSafeText(item.label, 180) || item.label.length === 0 || typeof item.verified !== 'boolean') return [];
    if (item.url !== null && (typeof item.url !== 'string' || item.url.length > 2000 || !/^https:\/\//iu.test(item.url))) return [];
    return [{ label: item.label, url: item.url as string | null, verified: item.verified }];
  });
  if (evidence.length !== value.evidence.length) return null;
  return { sessionId, project, state: value.state as UniversalStatusReport['state'], summary, evidence, sourceRevision: value.sourceRevision as string | null, updatedAt: value.updatedAt as number };
}

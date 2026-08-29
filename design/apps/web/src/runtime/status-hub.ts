/**
 * Small, transport-only client for the shared status service.
 *
 * The renderer receives status facts, never an access credential. A caller
 * supplies a short-lived credential through a callback and the client keeps it
 * inside the request closure. Status snapshots are deliberately boring data:
 * bounded strings, allow-listed states, and no credential-shaped fields.
 */

export const STATUS_HUB_SCHEMA_VERSION = 1 as const;
export const STATUS_HUB_DEFAULT_TIMEOUT_MS = 5_000;
export const STATUS_HUB_MAX_TEXT = 2_000;
export const STATUS_HUB_MAX_ID = 160;
export const STATUS_HUB_MAX_LANES = 100;
export const STATUS_HUB_MAX_EVIDENCE = 200;
export const STATUS_HUB_MAX_NEXT_CHECKS = 100;
export const STATUS_HUB_MAX_REPLIES = 200;
export const STATUS_HUB_STALE_AFTER_MS = 5 * 60 * 1000;
export const STATUS_HUB_MAX_BODY_BYTES = 512 * 1024;

export type StatusState = 'idle' | 'running' | 'waiting' | 'blocked' | 'failed' | 'verified';
export type StatusSource = 'hub' | 'local-fallback';
export type StatusFreshness = 'current' | 'stale' | 'unavailable';
export type StatusTransportScope = 'same-origin' | 'https' | 'loopback-development';

export interface StatusEvidence {
  readonly id: string;
  readonly label: string;
  readonly state: StatusState;
  readonly detail?: string;
  readonly href?: string;
  readonly sourceCommit?: string;
  readonly updatedAt?: string;
}

export interface StatusLane {
  readonly id: string;
  readonly title: string;
  readonly state: StatusState;
  readonly summary: string;
  readonly evidence: readonly StatusEvidence[];
  readonly nextChecks: readonly string[];
}

export interface StatusSnapshot {
  readonly schemaVersion: typeof STATUS_HUB_SCHEMA_VERSION;
  readonly sessionId: string;
  readonly projectId?: string;
  readonly title: string;
  readonly state: StatusState;
  readonly summary: string;
  readonly updatedAt: string | null;
  readonly freshness: StatusFreshness;
  readonly ageSeconds: number | null;
  /** The last server state is retained as context, never as the current state. */
  readonly lastKnownState: StatusState | null;
  readonly baseline?: string;
  readonly lanes: readonly StatusLane[];
  readonly evidence: readonly StatusEvidence[];
  readonly nextChecks: readonly string[];
  readonly source: StatusSource;
  readonly acknowledgedRevision?: string;
}

export interface StatusReply {
  readonly id: string;
  readonly questionId?: string;
  readonly body: string;
  readonly createdAt: string;
}

export interface StatusReadResult {
  readonly ok: true;
  readonly snapshot: StatusSnapshot;
}

export interface StatusFailure {
  readonly ok: false;
  readonly error: 'unavailable' | 'invalid-response' | 'timed-out' | 'unauthorized';
}

export type StatusReadResponse = StatusReadResult | StatusFailure;

export interface StatusAcknowledgement {
  readonly ok: boolean;
  readonly acknowledged: boolean;
  readonly delivered: boolean;
  readonly source: StatusSource;
  readonly acceptedLocally?: boolean;
  readonly revision?: string;
  readonly error?: StatusFailure['error'];
}

export interface StatusRepliesResult {
  readonly ok: boolean;
  readonly replies: readonly StatusReply[];
  readonly nextCursor: string | null;
  readonly source: StatusSource;
  readonly pollable: boolean;
  readonly error?: StatusFailure['error'];
}

export interface StatusHubClient {
  readonly source: StatusSource;
  readonly transportScope: StatusTransportScope;
  readonly sharedDelivery: boolean;
  readonly read: () => Promise<StatusReadResponse>;
  readonly publish: (snapshot: StatusSnapshot) => Promise<StatusAcknowledgement>;
  readonly pollReplies: (cursor?: string | null) => Promise<StatusRepliesResult>;
  readonly answer: (questionId: string, body: string) => Promise<StatusAcknowledgement>;
}

export interface StatusHubClientOptions {
  readonly sessionId: string;
  readonly baseUrl?: string;
  /** HTTP is accepted only for an explicitly enabled loopback development URL. */
  readonly allowLoopbackHttp?: boolean;
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
  /** Resolved only for a request, and never placed in status state. */
  readonly getAccessToken?: () => string | null | Promise<string | null>;
}

export type LocalStatusSnapshotInput = Omit<
  StatusSnapshot,
  'schemaVersion' | 'source' | 'freshness' | 'ageSeconds' | 'lastKnownState'
>;

const STATUS_STATES: readonly StatusState[] = [
  'idle',
  'running',
  'waiting',
  'blocked',
  'failed',
  'verified',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function boundedString(value: unknown, max = STATUS_HUB_MAX_TEXT): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length > 0 && text.length <= max ? text : null;
}

function boundedOptionalString(value: unknown, max = STATUS_HUB_MAX_TEXT): string | undefined {
  return boundedString(value, max) ?? undefined;
}

function isStatusState(value: unknown): value is StatusState {
  return typeof value === 'string' && STATUS_STATES.includes(value as StatusState);
}

function boundedId(value: unknown): string | null {
  return boundedString(value, STATUS_HUB_MAX_ID);
}

function safeHref(value: unknown): string | undefined {
  const href = boundedString(value, 2_048);
  if (!href || href.includes('\\')) return undefined;
  try {
    const parsed = new URL(href, typeof window === 'undefined' ? 'http://localhost' : window.location.href);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return undefined;
    return parsed.href;
  } catch {
    return undefined;
  }
}

function safeIso(value: unknown): string | undefined {
  const text = boundedString(value, 80);
  if (!text || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(text)) {
    return undefined;
  }
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? text : undefined;
}

function safeList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  const list: string[] = [];
  const count = Math.min(value.length, max);
  for (let index = 0; index < count; index += 1) {
    const text = boundedString(value[index]);
    if (text != null) list.push(text);
  }
  return list;
}

function freshnessFor(updatedAt: string | null, nowMs = Date.now()): {
  readonly freshness: StatusFreshness;
  readonly ageSeconds: number | null;
} {
  if (updatedAt == null) return { freshness: 'unavailable', ageSeconds: null };
  const ageSeconds = Math.max(0, Math.floor((nowMs - Date.parse(updatedAt)) / 1000));
  return ageSeconds * 1000 >= STATUS_HUB_STALE_AFTER_MS
    ? { freshness: 'stale', ageSeconds }
    : { freshness: 'current', ageSeconds };
}

function boundedMap<T>(value: unknown, max: number, mapper: (value: unknown) => T | null): T[] {
  if (!Array.isArray(value)) return [];
  const result: T[] = [];
  const count = Math.min(value.length, max);
  for (let index = 0; index < count; index += 1) {
    const mapped = mapper(value[index]);
    if (mapped != null) result.push(mapped);
  }
  return result;
}

function normalizeEvidence(value: unknown): StatusEvidence | null {
  if (!isRecord(value)) return null;
  const id = boundedId(value.id);
  const label = boundedString(value.label);
  if (!id || !label || !isStatusState(value.state)) return null;
  const sourceCommit = boundedString(value.sourceCommit, 128);
  return {
    id,
    label,
    state: value.state,
    ...(boundedOptionalString(value.detail) ? { detail: boundedString(value.detail)! } : {}),
    ...(safeHref(value.href) ? { href: safeHref(value.href)! } : {}),
    ...(sourceCommit ? { sourceCommit } : {}),
    ...(safeIso(value.updatedAt) ? { updatedAt: safeIso(value.updatedAt)! } : {}),
  };
}

function normalizeLane(value: unknown): StatusLane | null {
  if (!isRecord(value)) return null;
  const id = boundedId(value.id);
  const title = boundedString(value.title);
  const summary = boundedString(value.summary);
  if (!id || !title || !summary || !isStatusState(value.state)) return null;
  const evidence = boundedMap(value.evidence, STATUS_HUB_MAX_EVIDENCE, normalizeEvidence);
  return {
    id,
    title,
    state: value.state,
    summary,
    evidence,
    nextChecks: safeList(value.nextChecks, STATUS_HUB_MAX_NEXT_CHECKS),
  };
}

function normalizeReply(value: unknown): StatusReply | null {
  if (!isRecord(value)) return null;
  const id = boundedId(value.id);
  const body = boundedString(value.body);
  const createdAt = safeIso(value.createdAt);
  if (!id || !body || !createdAt) return null;
  const questionId = boundedOptionalString(value.questionId, STATUS_HUB_MAX_ID);
  return { id, body, createdAt, ...(questionId ? { questionId } : {}) };
}

/** Normalize server data before it can become user-visible state. */
export function normalizeStatusSnapshot(
  value: unknown,
  expectedSessionId?: string,
  nowMs = Date.now(),
): StatusSnapshot | null {
  const candidate = isRecord(value) && isRecord(value.status) ? value.status : value;
  if (!isRecord(candidate)) return null;
  const schemaVersion = candidate.schemaVersion;
  const sessionId = boundedId(candidate.sessionId);
  const title = boundedString(candidate.title);
  const summary = boundedString(candidate.summary);
  const updatedAt = safeIso(candidate.updatedAt) ?? null;
  const source = candidate.source === 'local-fallback' ? 'local-fallback' : 'hub';
  if (schemaVersion !== STATUS_HUB_SCHEMA_VERSION || !sessionId || !title || !summary) return null;
  if (source === 'hub' && updatedAt == null) return null;
  if (expectedSessionId != null && sessionId !== expectedSessionId) return null;
  if (!isStatusState(candidate.state)) return null;
  const freshnessValue = freshnessFor(updatedAt, nowMs);
  const stale = freshnessValue.freshness === 'stale';
  const evidence = boundedMap(candidate.evidence, STATUS_HUB_MAX_EVIDENCE, normalizeEvidence);
  const lanes = boundedMap(candidate.lanes, STATUS_HUB_MAX_LANES, normalizeLane);
  return {
    schemaVersion: STATUS_HUB_SCHEMA_VERSION,
    sessionId,
    ...(boundedOptionalString(candidate.projectId, STATUS_HUB_MAX_ID) ? { projectId: boundedString(candidate.projectId, STATUS_HUB_MAX_ID)! } : {}),
    title,
    state: stale ? 'waiting' : candidate.state,
    summary,
    updatedAt,
    freshness: freshnessValue.freshness,
    ageSeconds: freshnessValue.ageSeconds,
    lastKnownState: stale ? candidate.state : null,
    ...(boundedOptionalString(candidate.baseline) ? { baseline: boundedString(candidate.baseline)! } : {}),
    lanes,
    evidence,
    nextChecks: safeList(candidate.nextChecks, STATUS_HUB_MAX_NEXT_CHECKS),
    source,
    ...(boundedOptionalString(candidate.acknowledgedRevision, STATUS_HUB_MAX_ID)
      ? { acknowledgedRevision: boundedString(candidate.acknowledgedRevision, STATUS_HUB_MAX_ID)! }
      : {}),
  };
}

export function createLocalStatusFallback(
  initial: LocalStatusSnapshotInput,
): StatusHubClient {
  const initialFreshness = freshnessFor(initial.updatedAt);
  let snapshot: StatusSnapshot = {
    ...initial,
    schemaVersion: STATUS_HUB_SCHEMA_VERSION,
    source: 'local-fallback',
    freshness: initialFreshness.freshness,
    ageSeconds: initialFreshness.ageSeconds,
    state: initialFreshness.freshness === 'stale' ? 'waiting' : initial.state,
    lastKnownState: initialFreshness.freshness === 'stale' ? initial.state : null,
  };
  let revision = 0;
  return {
    source: 'local-fallback',
    transportScope: 'same-origin',
    sharedDelivery: false,
    async read() {
      return { ok: true, snapshot };
    },
    async publish(next) {
      const normalized = normalizeStatusSnapshot({ ...next, source: 'local-fallback' }, snapshot.sessionId);
      if (!normalized) return { ok: false, acknowledged: false, delivered: false, source: 'local-fallback', error: 'invalid-response' };
      revision += 1;
      snapshot = { ...normalized, source: 'local-fallback', acknowledgedRevision: String(revision) };
      return { ok: true, acknowledged: false, delivered: false, source: 'local-fallback', acceptedLocally: true, revision: String(revision) };
    },
    async pollReplies() {
      return { ok: true, replies: [], nextCursor: null, source: 'local-fallback', pollable: false };
    },
    async answer() {
      return { ok: false, acknowledged: false, delivered: false, source: 'local-fallback', error: 'unavailable' };
    },
  };
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, '');
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '[::1]' || normalized === '::1';
}

function normalizeBaseUrl(
  value: string | undefined,
  allowLoopbackHttp: boolean,
): { url: string; scope: StatusTransportScope; origin: string } {
  const base = (value ?? '/api/status-hub').trim();
  const reference = typeof window === 'undefined' ? 'http://localhost/' : window.location.href;
  const referenceUrl = new URL(reference);
  if (base.includes('\\')) throw new Error('Status Hub endpoint must not contain backslashes');
  if (base.startsWith('//')) throw new Error('Status Hub endpoint must not use a protocol-relative URL');
  let parsed: URL;
  try {
    parsed = new URL(base || '/api/status-hub', referenceUrl);
  } catch {
    throw new Error('Status Hub endpoint is malformed or outside the allowed transport scope');
  }
  const hasExplicitScheme = /^[A-Za-z][A-Za-z\d+.-]*:/.test(base);
  if (!hasExplicitScheme && parsed.origin === referenceUrl.origin && !parsed.search && !parsed.hash) {
    return { url: parsed.href.replace(/\/$/, ''), scope: 'same-origin', origin: parsed.origin };
  }
  if (parsed.protocol === 'https:' && !parsed.search && !parsed.hash) return { url: parsed.href.replace(/\/$/, ''), scope: 'https', origin: parsed.origin };
  if (parsed.protocol === 'http:' && allowLoopbackHttp && isLoopbackHostname(parsed.hostname)) {
    if (parsed.search || parsed.hash) throw new Error('Status Hub endpoint must be path-only');
    return { url: parsed.href.replace(/\/$/, ''), scope: 'loopback-development', origin: parsed.origin };
  }
  throw new Error('Status Hub endpoint must be same-origin, HTTPS, or explicitly enabled loopback development HTTP');
}

function failureFor(error: unknown): StatusFailure {
  if (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError') return { ok: false, error: 'timed-out' };
  return { ok: false, error: 'unavailable' };
}

interface JsonResponse {
  readonly status: number;
  readonly ok: boolean;
  readonly body: unknown;
}

async function readTextWithDeadline(response: Response, signal: AbortSignal): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const onAbort = () => reject(new DOMException('aborted', 'AbortError'));
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
    void response.text().then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

async function readBoundedJson(response: Response, signal: AbortSignal): Promise<unknown> {
  if (!response.body) {
    if (response.status === 204 || response.status === 304) return null;
    const declaredLength = response.headers.get('content-length');
    const length = declaredLength == null ? NaN : Number(declaredLength);
    if (!Number.isSafeInteger(length) || length < 0 || length > STATUS_HUB_MAX_BODY_BYTES) {
      throw new Error('Status response without a stream must declare a bounded Content-Length');
    }
    const text = await readTextWithDeadline(response, signal);
    if (new TextEncoder().encode(text).byteLength > STATUS_HUB_MAX_BODY_BYTES) throw new Error('Status response exceeds the byte limit');
    return text.trim().length === 0 ? null : JSON.parse(text);
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const next = await new Promise<ReadableStreamReadResult<Uint8Array>>((resolve, reject) => {
      const onAbort = () => {
        void reader.cancel();
        reject(new DOMException('aborted', 'AbortError'));
      };
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
      void reader.read().then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
    });
    if (next.done) break;
    total += next.value.byteLength;
    if (total > STATUS_HUB_MAX_BODY_BYTES) {
      await reader.cancel();
      throw new Error('Status response exceeds the byte limit');
    }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder().decode(bytes);
  return text.trim().length === 0 ? null : JSON.parse(text);
}

export function createStatusHubClient(options: StatusHubClientOptions): StatusHubClient {
  const sessionId = boundedId(options.sessionId);
  if (!sessionId) throw new Error('Status session id is invalid');
  const base = normalizeBaseUrl(options.baseUrl, options.allowLoopbackHttp === true);
  const timeoutMs = Math.max(250, Math.min(options.timeoutMs ?? STATUS_HUB_DEFAULT_TIMEOUT_MS, 30_000));
  const fetchImpl = options.fetchImpl ?? fetch;
  const reference = typeof window === 'undefined' ? 'http://localhost/' : window.location.href;
  const endpoint = new URL(`sessions/${encodeURIComponent(sessionId)}/`, new URL(`${base.url}/`, reference));
  if (endpoint.origin !== base.origin) throw new Error('Status Hub endpoint origin normalization failed');

  async function request(path: string, init: RequestInit = {}): Promise<JsonResponse> {
    if (path.includes('\\') || path.startsWith('//')) throw new Error('Status Hub request path is malformed');
    const target = new URL(path.replace(/^\/+/, ''), endpoint);
    if (target.origin !== endpoint.origin || !target.pathname.startsWith(endpoint.pathname)) {
      throw new Error('Status Hub request escaped its normalized endpoint');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let accessTokenTimer: ReturnType<typeof setTimeout> | null = null;
    try {
      const accessTokenPromise = Promise.resolve().then(() => options.getAccessToken?.() ?? null);
      const accessTokenTimeout = new Promise<string | null>((resolve) => {
        accessTokenTimer = setTimeout(() => resolve(null), timeoutMs);
      });
      const accessToken = await Promise.race([accessTokenPromise, accessTokenTimeout]);
      if (controller.signal.aborted) throw new DOMException('aborted', 'AbortError');
      const headers = new Headers(init.headers);
      headers.set('Accept', 'application/json');
      if (init.body != null) headers.set('Content-Type', 'application/json');
      if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
      const response = await fetchImpl(target.href, { ...init, headers, signal: controller.signal });
      return { status: response.status, ok: response.ok, body: await readBoundedJson(response, controller.signal) };
    } finally {
      clearTimeout(timer);
      if (accessTokenTimer != null) clearTimeout(accessTokenTimer);
    }
  }

  return {
    source: 'hub',
    transportScope: base.scope,
    sharedDelivery: true,
    async read() {
      try {
        const response = await request('/status');
        if (response.status === 401 || response.status === 403) return { ok: false, error: 'unauthorized' };
        if (!response.ok) return { ok: false, error: 'unavailable' };
        const snapshot = normalizeStatusSnapshot(response.body, sessionId);
        return snapshot ? { ok: true, snapshot: { ...snapshot, source: 'hub' } } : { ok: false, error: 'invalid-response' };
      } catch (error) {
        return failureFor(error);
      }
    },
    async publish(snapshot) {
      const normalized = normalizeStatusSnapshot(snapshot, sessionId);
      if (!normalized) return { ok: false, acknowledged: false, delivered: false, source: 'hub', error: 'invalid-response' };
      try {
        const response = await request('/status', {
          method: 'PUT',
          body: JSON.stringify({ ...normalized, source: undefined }),
        });
        if (response.status === 401 || response.status === 403) return { ok: false, acknowledged: false, delivered: false, source: 'hub', error: 'unauthorized' };
        if (!response.ok) return { ok: false, acknowledged: false, delivered: false, source: 'hub', error: 'unavailable' };
        const record = isRecord(response.body) ? response.body : {};
        if (record.accepted === false || record.acknowledged === false) return { ok: true, acknowledged: false, delivered: false, source: 'hub', error: 'unavailable' };
        const revision = boundedOptionalString(record.revision, STATUS_HUB_MAX_ID);
        return { ok: true, acknowledged: true, delivered: true, source: 'hub', ...(revision ? { revision } : {}) };
      } catch (error) {
        const failure = failureFor(error);
        return { ok: false, acknowledged: false, delivered: false, source: 'hub', error: failure.error };
      }
    },
    async pollReplies(cursor) {
      try {
        const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
        const response = await request(`/replies${query}`);
        if (response.status === 401 || response.status === 403) return { ok: false, replies: [], nextCursor: null, source: 'hub', pollable: true, error: 'unauthorized' };
        if (!response.ok) return { ok: false, replies: [], nextCursor: null, source: 'hub', pollable: true, error: 'unavailable' };
        const record = isRecord(response.body) ? response.body : {};
        const replies = boundedMap(record.replies, STATUS_HUB_MAX_REPLIES, normalizeReply);
        return { ok: true, replies, nextCursor: boundedOptionalString(record.nextCursor, STATUS_HUB_MAX_ID) ?? null, source: 'hub', pollable: true };
      } catch (error) {
        return { ok: false, replies: [], nextCursor: null, source: 'hub', pollable: true, error: failureFor(error).error };
      }
    },
    async answer(questionId, body) {
      const safeQuestionId = boundedId(questionId);
      const safeBody = boundedString(body);
      if (!safeQuestionId || !safeBody) return { ok: false, acknowledged: false, delivered: false, source: 'hub', error: 'invalid-response' };
      try {
        const response = await request('/replies', { method: 'POST', body: JSON.stringify({ questionId: safeQuestionId, body: safeBody }) });
        if (response.status === 401 || response.status === 403) return { ok: false, acknowledged: false, delivered: false, source: 'hub', error: 'unauthorized' };
        if (!response.ok) return { ok: false, acknowledged: false, delivered: false, source: 'hub', error: 'unavailable' };
        const record = isRecord(response.body) ? response.body : {};
        if (record.accepted === false || record.acknowledged === false || record.delivered === false) return { ok: true, acknowledged: false, delivered: false, source: 'hub', error: 'unavailable' };
        const revision = boundedOptionalString(record.revision, STATUS_HUB_MAX_ID);
        return { ok: true, acknowledged: true, delivered: true, source: 'hub', ...(revision ? { revision } : {}) };
      } catch (error) {
        return { ok: false, acknowledged: false, delivered: false, source: 'hub', error: failureFor(error).error };
      }
    },
  };
}

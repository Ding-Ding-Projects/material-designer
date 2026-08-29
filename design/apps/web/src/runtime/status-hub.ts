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

export type StatusState = 'idle' | 'running' | 'waiting' | 'blocked' | 'failed' | 'verified';
export type StatusSource = 'hub' | 'local-fallback';

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
  readonly updatedAt: string;
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
  readonly revision?: string;
  readonly error?: StatusFailure['error'];
}

export interface StatusRepliesResult {
  readonly ok: boolean;
  readonly replies: readonly StatusReply[];
  readonly nextCursor: string | null;
  readonly error?: StatusFailure['error'];
}

export interface StatusHubClient {
  readonly read: () => Promise<StatusReadResponse>;
  readonly publish: (snapshot: StatusSnapshot) => Promise<StatusAcknowledgement>;
  readonly pollReplies: (cursor?: string | null) => Promise<StatusRepliesResult>;
  readonly answer: (questionId: string, body: string) => Promise<StatusAcknowledgement>;
}

export interface StatusHubClientOptions {
  readonly sessionId: string;
  readonly baseUrl?: string;
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
  /** Resolved only for a request, and never placed in status state. */
  readonly getAccessToken?: () => string | null | Promise<string | null>;
}

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
  if (!href) return undefined;
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
  for (const item of value) {
    const text = boundedString(item);
    if (text != null) list.push(text);
    if (list.length >= max) break;
  }
  return list;
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
  const evidence = Array.isArray(value.evidence)
    ? value.evidence.map(normalizeEvidence).filter((item): item is StatusEvidence => item != null).slice(0, STATUS_HUB_MAX_EVIDENCE)
    : [];
  return {
    id,
    title,
    state: value.state,
    summary,
    evidence,
    nextChecks: safeList(value.nextChecks, STATUS_HUB_MAX_NEXT_CHECKS),
  };
}

/** Normalize server data before it can become user-visible state. */
export function normalizeStatusSnapshot(value: unknown, expectedSessionId?: string): StatusSnapshot | null {
  const candidate = isRecord(value) && isRecord(value.status) ? value.status : value;
  if (!isRecord(candidate)) return null;
  const schemaVersion = candidate.schemaVersion;
  const sessionId = boundedId(candidate.sessionId);
  const title = boundedString(candidate.title);
  const summary = boundedString(candidate.summary);
  const updatedAt = safeIso(candidate.updatedAt);
  if (schemaVersion !== STATUS_HUB_SCHEMA_VERSION || !sessionId || !title || !summary || !updatedAt) return null;
  if (expectedSessionId != null && sessionId !== expectedSessionId) return null;
  if (!isStatusState(candidate.state)) return null;
  const evidence = Array.isArray(candidate.evidence)
    ? candidate.evidence.map(normalizeEvidence).filter((item): item is StatusEvidence => item != null).slice(0, STATUS_HUB_MAX_EVIDENCE)
    : [];
  const lanes = Array.isArray(candidate.lanes)
    ? candidate.lanes.map(normalizeLane).filter((item): item is StatusLane => item != null).slice(0, STATUS_HUB_MAX_LANES)
    : [];
  return {
    schemaVersion: STATUS_HUB_SCHEMA_VERSION,
    sessionId,
    ...(boundedOptionalString(candidate.projectId, STATUS_HUB_MAX_ID) ? { projectId: boundedString(candidate.projectId, STATUS_HUB_MAX_ID)! } : {}),
    title,
    state: candidate.state,
    summary,
    updatedAt,
    ...(boundedOptionalString(candidate.baseline) ? { baseline: boundedString(candidate.baseline)! } : {}),
    lanes,
    evidence,
    nextChecks: safeList(candidate.nextChecks, STATUS_HUB_MAX_NEXT_CHECKS),
    source: candidate.source === 'local-fallback' ? 'local-fallback' : 'hub',
    ...(boundedOptionalString(candidate.acknowledgedRevision, STATUS_HUB_MAX_ID)
      ? { acknowledgedRevision: boundedString(candidate.acknowledgedRevision, STATUS_HUB_MAX_ID)! }
      : {}),
  };
}

export function createLocalStatusFallback(
  initial: Omit<StatusSnapshot, 'schemaVersion' | 'source'>,
): StatusHubClient {
  let snapshot: StatusSnapshot = {
    ...initial,
    schemaVersion: STATUS_HUB_SCHEMA_VERSION,
    source: 'local-fallback',
  };
  let revision = 0;
  return {
    async read() {
      return { ok: true, snapshot };
    },
    async publish(next) {
      const normalized = normalizeStatusSnapshot({ ...next, source: 'local-fallback' }, snapshot.sessionId);
      if (!normalized) return { ok: false, acknowledged: false, error: 'invalid-response' };
      revision += 1;
      snapshot = { ...normalized, source: 'local-fallback', acknowledgedRevision: String(revision) };
      return { ok: true, acknowledged: true, revision: String(revision) };
    },
    async pollReplies() {
      return { ok: true, replies: [], nextCursor: null };
    },
    async answer() {
      return { ok: false, acknowledged: false, error: 'unavailable' };
    },
  };
}

function normalizeBaseUrl(value: string | undefined): string {
  const base = (value ?? '/api/status-hub').trim();
  if (!base) return '/api/status-hub';
  try {
    const parsed = new URL(base, typeof window === 'undefined' ? 'http://localhost' : window.location.href);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return '/api/status-hub';
    return parsed.href.replace(/\/$/, '');
  } catch {
    return base.startsWith('/') ? base.replace(/\/$/, '') : '/api/status-hub';
  }
}

function failureFor(error: unknown): StatusFailure {
  if (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError') return { ok: false, error: 'timed-out' };
  return { ok: false, error: 'unavailable' };
}

export function createStatusHubClient(options: StatusHubClientOptions): StatusHubClient {
  const sessionId = boundedId(options.sessionId);
  if (!sessionId) throw new Error('Status session id is invalid');
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const timeoutMs = Math.max(250, Math.min(options.timeoutMs ?? STATUS_HUB_DEFAULT_TIMEOUT_MS, 30_000));
  const fetchImpl = options.fetchImpl ?? fetch;
  const endpoint = `${baseUrl}/sessions/${encodeURIComponent(sessionId)}`;

  async function request(path: string, init: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let accessTokenTimer: ReturnType<typeof setTimeout> | null = null;
    try {
      const accessTokenPromise = Promise.resolve().then(() => options.getAccessToken?.() ?? null);
      const accessTokenTimeout = new Promise<string | null>((resolve) => {
        accessTokenTimer = setTimeout(() => resolve(null), timeoutMs);
      });
      const accessToken = await Promise.race([accessTokenPromise, accessTokenTimeout]);
      const headers = new Headers(init.headers);
      headers.set('Accept', 'application/json');
      if (init.body != null) headers.set('Content-Type', 'application/json');
      if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
      return await fetchImpl(`${endpoint}${path}`, { ...init, headers, signal: controller.signal });
    } finally {
      clearTimeout(timer);
      if (accessTokenTimer != null) clearTimeout(accessTokenTimer);
    }
  }

  return {
    async read() {
      try {
        const response = await request('/status');
        if (response.status === 401 || response.status === 403) return { ok: false, error: 'unauthorized' };
        if (!response.ok) return { ok: false, error: 'unavailable' };
        const snapshot = normalizeStatusSnapshot(await response.json(), sessionId);
        return snapshot ? { ok: true, snapshot: { ...snapshot, source: 'hub' } } : { ok: false, error: 'invalid-response' };
      } catch (error) {
        return failureFor(error);
      }
    },
    async publish(snapshot) {
      const normalized = normalizeStatusSnapshot(snapshot, sessionId);
      if (!normalized) return { ok: false, acknowledged: false, error: 'invalid-response' };
      try {
        const response = await request('/status', {
          method: 'PUT',
          body: JSON.stringify({ ...normalized, source: undefined }),
        });
        if (response.status === 401 || response.status === 403) return { ok: false, acknowledged: false, error: 'unauthorized' };
        if (!response.ok) return { ok: false, acknowledged: false, error: 'unavailable' };
        let body: unknown = null;
        try { body = await response.json(); } catch { /* 204 is an acknowledgement */ }
        const record = isRecord(body) ? body : {};
        if (record.accepted === false || record.acknowledged === false) return { ok: true, acknowledged: false, error: 'unavailable' };
        const revision = boundedOptionalString(record.revision, STATUS_HUB_MAX_ID);
        return { ok: true, acknowledged: true, ...(revision ? { revision } : {}) };
      } catch (error) {
        const failure = failureFor(error);
        return { ok: false, acknowledged: false, error: failure.error };
      }
    },
    async pollReplies(cursor) {
      try {
        const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
        const response = await request(`/replies${query}`);
        if (response.status === 401 || response.status === 403) return { ok: false, replies: [], nextCursor: null, error: 'unauthorized' };
        if (!response.ok) return { ok: false, replies: [], nextCursor: null, error: 'unavailable' };
        const body: unknown = await response.json();
        const record = isRecord(body) ? body : {};
        const rawReplies = Array.isArray(record.replies) ? record.replies : [];
        const replies: StatusReply[] = [];
        for (const raw of rawReplies) {
          if (!isRecord(raw)) continue;
          const id = boundedId(raw.id);
          const text = boundedString(raw.body);
          const createdAt = safeIso(raw.createdAt);
          if (id && text && createdAt) replies.push({ id, body: text, createdAt, ...(boundedOptionalString(raw.questionId, STATUS_HUB_MAX_ID) ? { questionId: boundedString(raw.questionId, STATUS_HUB_MAX_ID)! } : {}) });
        }
        return { ok: true, replies, nextCursor: boundedOptionalString(record.nextCursor, STATUS_HUB_MAX_ID) ?? null };
      } catch (error) {
        return { ok: false, replies: [], nextCursor: null, error: failureFor(error).error };
      }
    },
    async answer(questionId, body) {
      const safeQuestionId = boundedId(questionId);
      const safeBody = boundedString(body);
      if (!safeQuestionId || !safeBody) return { ok: false, acknowledged: false, error: 'invalid-response' };
      try {
        const response = await request('/replies', { method: 'POST', body: JSON.stringify({ questionId: safeQuestionId, body: safeBody }) });
        if (response.status === 401 || response.status === 403) return { ok: false, acknowledged: false, error: 'unauthorized' };
        if (!response.ok) return { ok: false, acknowledged: false, error: 'unavailable' };
        let record: Record<string, unknown> = {};
        try { const parsed: unknown = await response.json(); if (isRecord(parsed)) record = parsed; } catch { /* 204 is an acknowledgement */ }
        if (record.accepted === false || record.acknowledged === false || record.delivered === false) return { ok: true, acknowledged: false, error: 'unavailable' };
        const revision = boundedOptionalString(record.revision, STATUS_HUB_MAX_ID);
        return { ok: true, acknowledged: true, ...(revision ? { revision } : {}) };
      } catch (error) {
        return { ok: false, acknowledged: false, error: failureFor(error).error };
      }
    },
  };
}

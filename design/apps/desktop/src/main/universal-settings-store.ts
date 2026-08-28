import { appendFile, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { watch, type FSWatcher } from 'node:fs';
import { execFile } from 'node:child_process';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const MAX_BYTES = 512 * 1024;
const MAX_DEPTH = 8;
const MAX_COLLECTION_ITEMS = 500;
const SECRET_KEY = /^(?:password|passcode|pin|totp|secret|token|totpSecretBase32)$/i;
const ALLOWED_STATE_KEYS = new Set([
  'schemaVersion', 'revision', 'updatedAt', 'languageMode', 'funnyEnglish',
  'funnyCantonese', 'showDialogEmoji', 'school', 'displayName', 'theme',
  'density', 'accentColor', 'uiFontFamily', 'narrator', 'schedules', 'adhd',
  'nextAction', 'notifications',
]);
const ALLOWED_NESTED_KEYS: Record<string, ReadonlySet<string>> = {
  school: new Set(['enabled', 'name', 'credentialConfigured', 'credentialBackend']),
  narrator: new Set(['enabled', 'language', 'englishVoiceId', 'cantoneseVoiceId', 'rate', 'pitch', 'quiet']),
  adhd: new Set(['focus', 'lowStimulation', 'timeAwareness', 'oneThing', 'momentum']),
  schedules: new Set(['id', 'label', 'enabled', 'priority', 'startDate', 'endDate', 'startTime', 'endTime', 'weekdays', 'source', 'sourceUrl', 'sourceBaseUrl', 'sourceEntity', 'values']),
  notifications: new Set(['id', 'title', 'body', 'tone', 'createdAt', 'read']),
};
const ALLOWED_SCHEDULE_VALUE_KEYS = new Set([
  'languageMode', 'funnyEnglish', 'funnyCantonese', 'showDialogEmoji',
  'displayName', 'theme', 'density', 'accentColor', 'uiFontFamily',
]);

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

function containsSecretKey(value: unknown, depth = 0): boolean {
  // A value deeper than the declared schema is rejected, rather than treated
  // as safe. Otherwise a secret hidden below the scan depth would pass the
  // host boundary and land in a supposedly redacted record.
  if (depth > MAX_DEPTH) return true;
  if (Array.isArray(value)) return value.length > MAX_COLLECTION_ITEMS || value.some((item) => containsSecretKey(item, depth + 1));
  if (!isRecord(value)) return false;
  return Object.entries(value).some(([key, child]) => SECRET_KEY.test(key) || containsSecretKey(child, depth + 1));
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function validClockText(value: unknown): boolean {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/u.test(value)) return false;
  const [hours, minutes] = value.split(':').map(Number);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
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
  if (!isRecord(value) || value.schemaVersion !== 1 || !Number.isSafeInteger(value.revision) || value.revision < 0 || !Number.isFinite(value.updatedAt) || value.updatedAt < 0) return false;
  if (!hasOnlyKeys(value, ALLOWED_STATE_KEYS)) return false;
  if (containsSecretKey(value)) return false;
  for (const [key, allowed] of Object.entries(ALLOWED_NESTED_KEYS)) {
    const child = value[key];
    if (key === 'schedules' || key === 'notifications') {
      if (child !== undefined && (!Array.isArray(child) || child.some((item) => !isRecord(item) || !hasOnlyKeys(item, allowed)))) return false;
    } else if (child !== undefined && (!isRecord(child) || !hasOnlyKeys(child, allowed))) return false;
  }
  if (value.languageMode !== undefined && !['english', 'cantonese', 'bilingual'].includes(String(value.languageMode))) return false;
  if (value.funnyEnglish !== undefined && (!Number.isInteger(value.funnyEnglish) || value.funnyEnglish < 1 || value.funnyEnglish > 5)) return false;
  if (value.funnyCantonese !== undefined && (!Number.isInteger(value.funnyCantonese) || value.funnyCantonese < 1 || value.funnyCantonese > 5)) return false;
  if (value.displayName !== undefined && (typeof value.displayName !== 'string' || value.displayName.length > 120)) return false;
  if (value.nextAction !== undefined && (typeof value.nextAction !== 'string' || value.nextAction.length > 240)) return false;
  if (value.accentColor !== undefined && (typeof value.accentColor !== 'string' || !/^(?:#[0-9a-f]{6}|#[0-9a-f]{8})$/iu.test(value.accentColor))) return false;
  if (value.uiFontFamily !== undefined && (typeof value.uiFontFamily !== 'string' || value.uiFontFamily.length > 160)) return false;
  if (value.school !== undefined && (!isRecord(value.school) || typeof value.school.enabled !== 'boolean' || (value.school.name !== undefined && (typeof value.school.name !== 'string' || value.school.name.length > 80)) || (value.school.credentialConfigured !== undefined && typeof value.school.credentialConfigured !== 'boolean') || (value.school.credentialBackend !== undefined && !['host-vault', 'browser-session', 'none'].includes(String(value.school.credentialBackend))))) return false;
  if (value.narrator !== undefined && (!isRecord(value.narrator) || typeof value.narrator.enabled !== 'boolean' || !['english', 'cantonese', 'both'].includes(String(value.narrator.language)) || (value.narrator.englishVoiceId !== undefined && value.narrator.englishVoiceId !== null && (typeof value.narrator.englishVoiceId !== 'string' || value.narrator.englishVoiceId.length > 240)) || (value.narrator.cantoneseVoiceId !== undefined && value.narrator.cantoneseVoiceId !== null && (typeof value.narrator.cantoneseVoiceId !== 'string' || value.narrator.cantoneseVoiceId.length > 240)) || (value.narrator.rate !== undefined && (typeof value.narrator.rate !== 'number' || !Number.isFinite(value.narrator.rate) || value.narrator.rate < 0.1 || value.narrator.rate > 3)) || (value.narrator.pitch !== undefined && (typeof value.narrator.pitch !== 'number' || !Number.isFinite(value.narrator.pitch) || value.narrator.pitch < 0 || value.narrator.pitch > 2)) || (value.narrator.quiet !== undefined && typeof value.narrator.quiet !== 'boolean'))) return false;
  if (value.adhd !== undefined && (!isRecord(value.adhd) || !hasOnlyKeys(value.adhd, ALLOWED_NESTED_KEYS.adhd) || Object.values(value.adhd).some((flag) => typeof flag !== 'boolean'))) return false;
  if (value.notifications !== undefined && Array.isArray(value.notifications) && (value.notifications.length > MAX_COLLECTION_ITEMS || value.notifications.some((item) => !isRecord(item) || typeof item.id !== 'string' || item.id.length > 96 || typeof item.title !== 'string' || item.title.length > 240 || typeof item.body !== 'string' || item.body.length > 1000 || typeof item.createdAt !== 'number' || !Number.isFinite(item.createdAt) || typeof item.read !== 'boolean' || !['info', 'success', 'warning', 'error'].includes(String(item.tone))))) return false;
  if (Array.isArray(value.schedules)) {
    for (const item of value.schedules) {
      if (!isRecord(item)) return false;
      if (typeof item.label === 'string' && item.label.length > 120) return false;
      if (typeof item.priority !== 'number' || !Number.isFinite(item.priority) || item.priority < -1000 || item.priority > 1000) return false;
      if (!validClockText(item.startTime) || !validClockText(item.endTime)) return false;
      if (typeof item.id !== 'string' || item.id.length === 0 || item.id.length > 96 || (item.startDate !== null && item.startDate !== undefined && (typeof item.startDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(item.startDate))) || (item.endDate !== null && item.endDate !== undefined && (typeof item.endDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(item.endDate))) || !['local', 'api', 'homeAssistant'].includes(String(item.source)) || (item.weekdays !== 'all' && (!Array.isArray(item.weekdays) || item.weekdays.length > 7 || item.weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)))) return false;
      if (item.values === undefined) continue;
      if (!isRecord(item.values) || !hasOnlyKeys(item.values, ALLOWED_SCHEDULE_VALUE_KEYS)) return false;
    }
  }
  try { return Buffer.byteLength(JSON.stringify(value), 'utf8') <= MAX_BYTES; } catch { return false; }
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
    if (!current.ok && current.code !== 'persistence-failed') return current;
    const currentRevision = current.ok ? current.state.revision : 0;
    if (currentRevision !== expectedRevision) return { ok: false, code: 'stale-revision' };
    if (next.revision !== expectedRevision + 1) return { ok: false, code: 'invalid-input' };
    const state = structuredClone(next);
    const temporary = `${this.#path}.${process.pid}.${Date.now()}.tmp`;
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
        this.#watcher = watch(dirname(this.#path), (_event, filename) => {
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

  async setHomeAssistantToken(value: unknown): Promise<UniversalSettingsSecretResult> {
    if (typeof value !== 'string' || value.length === 0 || value.length > 4096 || !this.#protect) {
      return { ok: false, code: this.#protect ? 'invalid-input' : 'protection-unavailable' };
    }
    const temporary = `${this.#secretPath}.${process.pid}.${Date.now()}.tmp`;
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

  async readHistory(): Promise<readonly Record<string, unknown>[]> {
    try {
      const raw = await readFile(this.#historyPath, 'utf8');
      return raw.split(/\r?\n/).filter(Boolean).slice(-500).flatMap((line) => {
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
    if (typeof sessionId !== 'string' || sessionId.length === 0 || sessionId.length > 120 || !Number.isFinite(updatedAt)) {
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

  private async #writeStatusInternal(value: unknown): Promise<UniversalStatusResult> {
    const report = normalizeStatusReport(value);
    if (!report) return { ok: false, code: 'invalid-input' };
    const records = await this.readStatusRecords();
    records[report.sessionId] = report;
    const ids = Object.keys(records);
    if (ids.length > 50) delete records[ids[0]];
    const temporary = `${this.#statusPath}.${process.pid}.${Date.now()}.tmp`;
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

function normalizeStatusReport(value: unknown): UniversalStatusReport | null {
  if (!isRecord(value)) return null;
  const sessionId = typeof value.sessionId === 'string' ? value.sessionId.trim() : '';
  const project = typeof value.project === 'string' ? value.project.trim() : '';
  const summary = typeof value.summary === 'string' ? value.summary.trim() : '';
  const allowedStates = new Set(['running', 'waiting', 'blocked', 'failed', 'verified', 'unavailable']);
  if (!sessionId || sessionId.length > 120 || !project || project.length > 180 || !summary || summary.length > 1000 || !allowedStates.has(String(value.state)) || !Number.isFinite(value.updatedAt)) return null;
  if (value.sourceRevision !== null && (typeof value.sourceRevision !== 'string' || value.sourceRevision.length > 120)) return null;
  if (!Array.isArray(value.evidence) || value.evidence.length > 50) return null;
  const evidence = value.evidence.flatMap((item) => {
    if (!isRecord(item) || typeof item.label !== 'string' || item.label.length === 0 || item.label.length > 180 || typeof item.verified !== 'boolean') return [];
    if (item.url !== null && (typeof item.url !== 'string' || item.url.length > 2000 || !/^https:\/\//iu.test(item.url))) return [];
    return [{ label: item.label, url: item.url as string | null, verified: item.verified }];
  });
  if (evidence.length !== value.evidence.length) return null;
  return { sessionId, project, state: value.state as UniversalStatusReport['state'], summary, evidence, sourceRevision: value.sourceRevision as string | null, updatedAt: value.updatedAt as number };
}

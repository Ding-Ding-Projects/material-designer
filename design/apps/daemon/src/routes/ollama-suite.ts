import type { Express, Response } from 'express';
import { promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

const DEFAULT_OLLAMA_BASE_URL = 'http://127.0.0.1:11434';
const MAX_JSON_BYTES = 8 * 1024 * 1024;
const MAX_MODEL_TAG = 160;
const MAX_MESSAGES = 100;
const MAX_MESSAGE_BYTES = 100_000;
const MAX_SYSTEM_PROMPT_BYTES = 100_000;
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const OFFICIAL_CATALOG_URL = 'https://ollama.com/api/tags';
const OFFICIAL_CATALOG_ID = 'ollama-official-model-tags-v1';
const MAX_PULL_QUEUE_ITEMS = 10_000;
const MAX_CATALOG_MODELS = 100_000;

function loopbackBaseUrl(value: unknown): URL | null {
  const candidate = typeof value === 'string' && value.trim() ? value.trim() : DEFAULT_OLLAMA_BASE_URL;
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

function modelTag(value: unknown): string | null {
  return typeof value === 'string' && value.trim() && value.length <= MAX_MODEL_TAG ? value.trim() : null;
}

function allowlistedHarness(value: unknown): { executable: string; arguments: string[]; modelTag: string; workingDirectory: string | null; healthUrl: string | null } | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const executable = typeof raw.executable === 'string' ? raw.executable.trim() : '';
  const model = modelTag(raw.modelTag);
  const args = Array.isArray(raw.arguments) && raw.arguments.every((item) => typeof item === 'string' && item.length <= 500) ? raw.arguments as string[] : [];
  const workingDirectory = raw.workingDirectory === null || typeof raw.workingDirectory === 'undefined' ? null : typeof raw.workingDirectory === 'string' ? raw.workingDirectory.trim() : null;
  const healthUrl = raw.healthUrl === null || typeof raw.healthUrl === 'undefined' ? null : typeof raw.healthUrl === 'string' ? raw.healthUrl.trim() : null;
  const base = path.basename(executable).toLowerCase();
  if (!model || !['ollama', 'ollama.exe'].includes(base) || args.length > 64 || args.some((arg) => /[;&|<>`$\r\n]/.test(arg)) || /[;&|<>`$\r\n]/.test(executable)) return null;
  if (args.length < 2 || args[0] !== 'run' || args[1] !== model || args.slice(2).some((arg) => !['--verbose', '--nowordwrap'].includes(arg))) return null;
  if (workingDirectory !== null && (!workingDirectory || workingDirectory.length > 500)) return null;
  if (healthUrl !== null && (!healthUrl || healthUrl.length > 300)) return null;
  if (healthUrl) {
    try { const parsed = new URL(healthUrl); if (!['http:', 'https:'].includes(parsed.protocol) || !['localhost', '127.0.0.1', '[::1]', '::1'].includes(parsed.hostname) || parsed.username || parsed.password || parsed.search || parsed.hash) return null; } catch { return null; }
  }
  return { executable, arguments: args, modelTag: model, workingDirectory, healthUrl };
}

function originPath(base: URL, path: string): string {
  return new URL(path, `${base.origin}${base.pathname.endsWith('/') ? base.pathname : `${base.pathname}/`}`).toString();
}

async function boundedJson(response: globalThis.Response): Promise<unknown> {
  const declared = Number(response.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > MAX_JSON_BYTES) throw new Error('response-too-large');
  const text = await response.text();
  if (Buffer.byteLength(text, 'utf8') > MAX_JSON_BYTES) throw new Error('response-too-large');
  return JSON.parse(text) as unknown;
}

function sendFailure(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ ok: false, error: { code, message } });
}

async function localRequest(base: URL, path: string, init: RequestInit = {}): Promise<globalThis.Response> {
  return fetch(originPath(base, path), {
    ...init,
    redirect: 'error',
    signal: init.signal ?? AbortSignal.timeout(15_000),
  });
}

async function officialCatalogRequest(pageToken: string | null): Promise<globalThis.Response> {
  const url = new URL(OFFICIAL_CATALOG_URL);
  if (pageToken) url.searchParams.set('pageToken', pageToken);
  return fetch(url, { redirect: 'error', signal: AbortSignal.timeout(20_000), headers: { accept: 'application/json' } });
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
}

function isDurablePull(value: unknown): value is DurablePull {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
    return typeof item.id === 'string' && item.id.length > 0 && item.id.length <= 160
    && typeof item.tag === 'string' && item.tag.length > 0 && item.tag.length <= MAX_MODEL_TAG
    && typeof item.baseUrl === 'string' && item.baseUrl.length <= 300
    && ['queued', 'pulling', 'paused', 'completed', 'cancelled', 'failed'].includes(String(item.state))
    && typeof item.completedBytes === 'number' && Number.isFinite(item.completedBytes) && item.completedBytes >= 0
    && (item.totalBytes === null || (typeof item.totalBytes === 'number' && Number.isFinite(item.totalBytes) && item.totalBytes >= 0))
    && typeof item.attempts === 'number' && Number.isInteger(item.attempts) && item.attempts >= 0 && item.attempts <= 100
    && typeof item.queuedAt === 'string' && item.queuedAt.length <= 80
    && typeof item.updatedAt === 'string' && item.updatedAt.length <= 80
    && (item.detail === null || typeof item.detail === 'string')
    && typeof item.retryable === 'boolean'
    && (item.providerStatus === null || ['queued', 'pulling', 'success', 'error', 'cancelled'].includes(String(item.providerStatus)))
    && (item.rateBytesPerSecond === null || (typeof item.rateBytesPerSecond === 'number' && Number.isFinite(item.rateBytesPerSecond) && item.rateBytesPerSecond >= 0))
    && (item.etaSeconds === null || (typeof item.etaSeconds === 'number' && Number.isFinite(item.etaSeconds) && item.etaSeconds >= 0 && item.etaSeconds <= 31_536_000))
    && (item.partialOutcome === null || ['none', 'some', 'all'].includes(String(item.partialOutcome)));
}

function createPullStore(dataDir: string) {
  const file = path.join(dataDir, 'ollama-suite', 'pulls.json');
  let records: DurablePull[] = [];
  let loaded = false;
  let loading: Promise<void> | null = null;
  const load = async () => {
    if (loaded) return;
    if (loading) return loading;
    loading = (async () => {
      try {
        const parsed: unknown = JSON.parse(await fs.readFile(file, 'utf8'));
        if (Array.isArray(parsed)) records = parsed.slice(0, MAX_PULL_QUEUE_ITEMS).filter(isDurablePull);
      } catch {
        records = [];
      }
      for (const record of records) if (record.state === 'pulling') { record.state = 'queued'; record.detail = 'Recovered after restart.'; }
      loaded = true;
    })();
    await loading;
  };
  const save = async () => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(records), 'utf8');
    let lastError: unknown;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try { await fs.rename(temporary, file); return; } catch (error) {
        lastError = error;
        const code = error && typeof error === 'object' ? (error as { code?: string }).code : undefined;
        if (!['EPERM', 'EACCES', 'EBUSY'].includes(code ?? '')) throw error;
        await new Promise((resolve) => setTimeout(resolve, 30 * (attempt + 1)));
      }
    }
    throw lastError instanceof Error ? lastError : new Error('queue-persistence-failed');
  };
  return {
    async list() { await load(); return records.map((record) => ({ ...record })); },
    async get(id: string) { await load(); return records.find((record) => record.id === id) ?? null; },
    async add(tag: string, baseUrl: string) { await load(); const now = new Date().toISOString(); const record: DurablePull = { id: randomUUID(), tag, baseUrl, state: 'queued', completedBytes: 0, totalBytes: null, attempts: 0, detail: null, queuedAt: now, updatedAt: now, retryable: true, providerStatus: 'queued', rateBytesPerSecond: null, etaSeconds: null, partialOutcome: 'none' }; records.push(record); await save(); return record; },
    async update(id: string, changes: Partial<DurablePull>) { await load(); const record = records.find((item) => item.id === id); if (!record) return null; Object.assign(record, changes, { updatedAt: new Date().toISOString() }); await save(); return record; },
  };
}

async function hardwareFacts(dataDir: string) {
  let freeDiskBytes: number | null = null;
  try {
    const stats = await fs.statfs(dataDir);
    freeDiskBytes = Number(stats.bavail) * Number(stats.bsize);
  } catch {
    // The exact storage probe is platform dependent. Unknown is safer than a guess.
  }
  return {
    ramBytes: os.totalmem(),
    availableRamBytes: os.freemem(),
    vramBytes: null,
    freeDiskBytes,
    architecture: os.arch(),
    gpu: null,
    driver: null,
    backend: null,
    backendSupported: null,
    detectedAt: new Date().toISOString(),
    evidence: ['RAM and architecture come from the host runtime.', 'GPU, VRAM, driver, and backend support are unavailable without a verified platform probe.'],
  };
}

export function registerOllamaSuiteRoutes(app: Express, dataDir = process.env.OD_DATA_DIR ?? process.cwd()): void {
  const pullStore = createPullStore(dataDir);
  const pullControllers = new Map<string, AbortController>();
  const schedulerClaims = new Set<string>();
  const runQueuedPulls = async (): Promise<void> => {
    const records = await pullStore.list();
    let active = records.filter((record) => record.state === 'pulling').length;
    for (const record of records.filter((item) => item.state === 'queued')) {
      if (active >= 2) break;
      if (schedulerClaims.has(record.id)) continue;
      active += 1;
      schedulerClaims.add(record.id);
      const controller = new AbortController();
      pullControllers.set(record.id, controller);
      await pullStore.update(record.id, { state: 'pulling', providerStatus: 'pulling', attempts: record.attempts + 1, detail: 'Starting queued pull.' });
      void (async () => {
        try {
          const base = loopbackBaseUrl(record.baseUrl);
          if (!base) { await pullStore.update(record.id, { state: 'failed', providerStatus: 'error', detail: 'Stored runtime origin is no longer valid.', retryable: false }); return; }
          const response = await localRequest(base, 'api/pull', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: record.tag, stream: true }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30 * 60 * 1000)]) });
          if (!response.ok || !response.body) { await pullStore.update(record.id, { state: 'failed', providerStatus: 'error', detail: `Queued pull returned HTTP ${response.status}.`, retryable: true }); return; }
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let success = false;
          const pullStartedAt = Date.now();
          while (true) {
            const next = await reader.read();
            if (next.done) break;
            buffer += decoder.decode(next.value, { stream: true });
            if (Buffer.byteLength(buffer, 'utf8') > 128 * 1024) throw new Error('progress-record-too-large');
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            for (const line of lines) {
              if (!line.trim()) continue;
              try {
                const value = JSON.parse(line) as Record<string, unknown>;
                const status = typeof value.status === 'string' ? value.status : null;
                const completedBytes = typeof value.completed === 'number' ? value.completed : null;
                const totalBytes = typeof value.total === 'number' ? value.total : null;
                const elapsedSeconds = Math.max(0.001, (Date.now() - pullStartedAt) / 1000);
                const rateBytesPerSecond = completedBytes === null ? null : Math.round(completedBytes / elapsedSeconds);
                const etaSeconds = totalBytes !== null && rateBytesPerSecond ? Math.max(0, Math.ceil((totalBytes - (completedBytes ?? 0)) / rateBytesPerSecond)) : null;
                await pullStore.update(record.id, { ...(completedBytes === null ? {} : { completedBytes }), ...(totalBytes === null ? {} : { totalBytes }), rateBytesPerSecond, etaSeconds, ...(status === 'success' ? { providerStatus: 'success' } : status === 'error' ? { providerStatus: 'error', detail: 'Provider reported an error.' } : { detail: status }) });
                if (status === 'success') success = true;
                if (status === 'error') {
                  await pullStore.update(record.id, { state: 'failed', providerStatus: 'error', detail: 'Provider reported an error.', retryable: true, partialOutcome: completedBytes && completedBytes > 0 ? 'some' : 'none' });
                  return;
                }
              } catch {
                await pullStore.update(record.id, { detail: 'Provider returned an invalid progress record.' });
              }
            }
          }
          if (buffer.trim()) {
            try { const value = JSON.parse(buffer) as Record<string, unknown>; success = success || value.status === 'success'; } catch { success = false; }
          }
          await pullStore.update(record.id, success ? { state: 'completed', providerStatus: 'success', detail: 'Queued pull completed.', retryable: false } : { state: 'failed', providerStatus: 'error', detail: 'Provider stream ended without success.', retryable: true });
        } catch {
          const current = await pullStore.get(record.id);
          if (current?.state !== 'cancelled' && current?.state !== 'paused') await pullStore.update(record.id, { state: 'failed', providerStatus: 'error', detail: 'Queued pull was interrupted.', retryable: true });
        } finally {
          pullControllers.delete(record.id);
          schedulerClaims.delete(record.id);
          void runQueuedPulls();
        }
      })();
    }
  };
  app.get('/api/ollama/hardware', async (_req, res) => res.json(await hardwareFacts(dataDir)));
  app.get('/api/ollama/pulls', async (_req, res) => res.json({ records: await pullStore.list(), concurrency: 2 }));
  app.post('/api/ollama/harness/preflight', async (req, res) => {
    const profile = allowlistedHarness(req.body?.profile ?? req.body);
    if (!profile) return sendFailure(res, 400, 'INVALID_PROFILE', 'Harness profile is not allowlisted.');
    try { await fs.access(profile.executable); } catch { return sendFailure(res, 400, 'EXECUTABLE_NOT_FOUND', 'The selected executable does not exist.'); }
    return res.json({ ok: true, executable: path.basename(profile.executable), arguments: profile.arguments, modelTag: profile.modelTag, workingDirectory: profile.workingDirectory, healthUrl: profile.healthUrl, environmentKeys: [], network: 'local Ollama API only', snapshot: 'A redacted profile snapshot is written before launch.' });
  });
  app.post('/api/ollama/harness/launch', async (req, res) => {
    const profile = allowlistedHarness(req.body?.profile ?? req.body);
    if (!profile) return sendFailure(res, 400, 'INVALID_PROFILE', 'Harness profile is not allowlisted.');
    try { await fs.access(profile.executable); } catch { return sendFailure(res, 400, 'EXECUTABLE_NOT_FOUND', 'The selected executable does not exist.'); }
    const snapshotDir = path.join(dataDir, 'ollama-suite', 'harness-snapshots');
    const snapshotPath = path.join(snapshotDir, `${Date.now()}.json`);
    try {
      await fs.mkdir(snapshotDir, { recursive: true });
      await fs.writeFile(snapshotPath, JSON.stringify({ executable: profile.executable, arguments: profile.arguments, modelTag: profile.modelTag, workingDirectory: profile.workingDirectory, healthUrl: profile.healthUrl }), 'utf8');
      const child = spawn(profile.executable, profile.arguments.length ? profile.arguments : ['run', profile.modelTag], { cwd: profile.workingDirectory ?? undefined, shell: false, windowsHide: true, stdio: 'ignore' });
      const pid = child.pid;
      if (!pid) { await fs.rm(snapshotPath, { force: true }); return sendFailure(res, 502, 'LAUNCH_FAILED', 'Allowlisted harness did not start.'); }
      let health = 'unhealthy';
      try {
        const response = profile.healthUrl
          ? await fetch(profile.healthUrl, { redirect: 'error', signal: AbortSignal.timeout(5_000) })
          : await localRequest(new URL(DEFAULT_OLLAMA_BASE_URL), 'api/version', { signal: AbortSignal.timeout(5_000) });
        health = response.ok ? 'healthy' : 'unhealthy';
      } catch {
        health = 'unhealthy';
      }
      if (health !== 'healthy') {
        child.kill();
        await fs.rm(snapshotPath, { force: true });
        return sendFailure(res, 502, 'HEALTH_CHECK_FAILED', 'Harness launch did not pass the local health check; the snapshot was rolled back.');
      }
      return res.status(202).json({ ok: true, pid, snapshot: path.basename(snapshotPath), health, rollback: 'Use the snapshot restore action if a later health check fails.' });
    } catch {
      await fs.rm(snapshotPath, { force: true }).catch(() => undefined);
      return sendFailure(res, 502, 'LAUNCH_FAILED', 'Allowlisted harness launch failed and the snapshot was rolled back.');
    }
  });
  app.post('/api/ollama/harness/restore', async (req, res) => {
    const snapshot = typeof req.body?.snapshot === 'string' ? req.body.snapshot : '';
    if (!snapshot || path.basename(snapshot) !== snapshot || !snapshot.endsWith('.json')) return sendFailure(res, 400, 'INVALID_SNAPSHOT', 'Snapshot name is invalid.');
    const snapshotPath = path.join(dataDir, 'ollama-suite', 'harness-snapshots', snapshot);
    try {
      const value = JSON.parse(await fs.readFile(snapshotPath, 'utf8')) as Record<string, unknown>;
      const profile = allowlistedHarness(value);
      if (!profile) return sendFailure(res, 400, 'INVALID_SNAPSHOT', 'Snapshot contents are not an allowlisted profile.');
      return res.json({ ok: true, restored: true, modelTag: profile.modelTag, executable: path.basename(profile.executable), healthUrl: profile.healthUrl });
    } catch {
      return sendFailure(res, 404, 'SNAPSHOT_NOT_FOUND', 'Snapshot could not be read.');
    }
  });
  app.post('/api/ollama/pulls/:id/cancel', async (req, res) => {
    pullControllers.get(req.params.id)?.abort();
    const record = await pullStore.update(req.params.id, { state: 'cancelled', providerStatus: 'cancelled', retryable: false, detail: 'Cancelled by the user.' });
    if (record) void runQueuedPulls();
    return record ? res.json(record) : sendFailure(res, 404, 'NOT_FOUND', 'Unknown pull queue item.');
  });
  app.post('/api/ollama/pulls/:id/pause', async (req, res) => {
    pullControllers.get(req.params.id)?.abort();
    const record = await pullStore.update(req.params.id, { state: 'paused', providerStatus: 'cancelled', detail: 'Paused by the user.' });
    if (record) void runQueuedPulls();
    return record ? res.json(record) : sendFailure(res, 404, 'NOT_FOUND', 'Unknown pull queue item.');
  });
  app.post('/api/ollama/pulls/:id/resume', async (req, res) => {
    const record = await pullStore.update(req.params.id, { state: 'queued', providerStatus: 'queued', detail: 'Queued for resume.' });
    if (record) void runQueuedPulls();
    return record ? res.json(record) : sendFailure(res, 404, 'NOT_FOUND', 'Unknown pull queue item.');
  });
  app.post('/api/ollama/pulls/:id/retry', async (req, res) => {
    const record = await pullStore.get(req.params.id);
    if (!record) return sendFailure(res, 404, 'NOT_FOUND', 'Unknown pull queue item.');
    if (!record.retryable || !['failed', 'cancelled'].includes(record.state)) return sendFailure(res, 409, 'NOT_RETRYABLE', 'This pull is not in a retryable state.');
    const queued = await pullStore.update(record.id, { state: 'queued', providerStatus: 'queued', detail: 'Queued for retry.', retryable: true });
    void runQueuedPulls();
    return res.json(queued);
  });
  app.get('/api/ollama/runtime', async (req, res) => {
    const base = loopbackBaseUrl(req.query.baseUrl);
    if (!base) return sendFailure(res, 400, 'INVALID_ORIGIN', 'Only a credential-free loopback origin is allowed.');
    try {
      const response = await localRequest(base, 'api/version');
      if (!response.ok) return sendFailure(res, 503, 'RUNTIME_UNHEALTHY', `Local runtime returned HTTP ${response.status}.`);
      const payload = await boundedJson(response) as Record<string, unknown>;
      return res.json({ state: 'healthy', version: typeof payload.version === 'string' ? payload.version.slice(0, 80) : null, detail: 'Local runtime responded.', checkedAt: new Date().toISOString() });
    } catch (error) {
      return res.json({ state: 'offline', version: null, detail: error instanceof Error && error.message === 'response-too-large' ? 'Local runtime response exceeded the size bound.' : 'Local runtime could not be reached.', checkedAt: new Date().toISOString() });
    }
  });

  app.get('/api/ollama/installed', async (req, res) => {
    const base = loopbackBaseUrl(req.query.baseUrl);
    if (!base) return sendFailure(res, 400, 'INVALID_ORIGIN', 'Only a credential-free loopback origin is allowed.');
    try {
      const response = await localRequest(base, 'api/tags');
      if (!response.ok) return sendFailure(res, 503, 'RUNTIME_UNHEALTHY', `Local tags returned HTTP ${response.status}.`);
      const payload = await boundedJson(response) as Record<string, unknown>;
      const models = Array.isArray(payload.models) ? payload.models : [];
      const tags = models.flatMap((item) => {
        const value = item && typeof item === 'object' ? modelTag((item as Record<string, unknown>).name) : null;
        return value ? [value] : [];
      });
      let running: string[] = [];
      try {
        const runningResponse = await localRequest(base, 'api/ps');
        if (runningResponse.ok) {
          const runningPayload = await boundedJson(runningResponse) as Record<string, unknown>;
          const runningModels = Array.isArray(runningPayload.models) ? runningPayload.models : [];
          running = runningModels.flatMap((item) => { const value = item && typeof item === 'object' ? modelTag((item as Record<string, unknown>).name) : null; return value ? [value] : []; });
        }
      } catch {
        running = [];
      }
      return res.json({ tags, running });
    } catch {
      return sendFailure(res, 503, 'OFFLINE', 'Installed model state is unavailable.');
    }
  });

  app.get('/api/ollama/catalog', async (req, res) => {
    try {
      const response = await officialCatalogRequest(typeof req.query.pageToken === 'string' ? req.query.pageToken : null);
      if (!response.ok) return sendFailure(res, 503, 'CATALOG_UNAVAILABLE', `Official catalog returned HTTP ${response.status}.`);
      const payload = await boundedJson(response) as Record<string, unknown>;
      if (!Array.isArray(payload.models) || payload.models.length > MAX_CATALOG_MODELS) return sendFailure(res, 502, 'CATALOG_INCOMPLETE', 'Official catalog omitted models or exceeded the model bound.');
      const rawNextPageToken = payload.nextPageToken ?? payload.next_page_token ?? payload.next;
      if (typeof rawNextPageToken !== 'undefined' && rawNextPageToken !== null && (typeof rawNextPageToken !== 'string' || rawNextPageToken.length > 500 || !rawNextPageToken.trim())) return sendFailure(res, 502, 'CATALOG_INCOMPLETE', 'Official catalog returned an invalid page token.');
      const models = payload.models;
      const variants = models.flatMap((item) => {
        if (!item || typeof item !== 'object') throw new Error('invalid-model-row');
        const raw = item as Record<string, unknown>;
        const tag = modelTag(raw.name);
        if (!tag) throw new Error('invalid-model-row');
        const details = raw.details && typeof raw.details === 'object' ? raw.details as Record<string, unknown> : {};
        return [{
          tag,
          family: typeof details.family === 'string' ? details.family.slice(0, 80) : null,
          parameterSize: typeof details.parameter_size === 'string' ? details.parameter_size.slice(0, 40) : null,
          parameterCount: null,
          quantization: typeof details.quantization_level === 'string' ? details.quantization_level.slice(0, 40) : null,
          blobBytes: typeof raw.size === 'number' && Number.isFinite(raw.size) ? raw.size : null,
          contextWindow: null,
          contextOverheadBytes: null,
          capabilities: [],
          installed: false,
          running: false,
          fit: 'unknown',
          fitEvidence: ['Official catalog metadata requires host hardware facts before a fit verdict can be computed.'],
        }];
      });
      return res.json({ variants, nextPageToken: typeof rawNextPageToken === 'string' ? rawNextPageToken : null, sourceRevision: response.headers.get('etag'), sourceIdentity: OFFICIAL_CATALOG_ID });
    } catch (error) {
      if (error instanceof Error && error.message === 'invalid-model-row') return sendFailure(res, 502, 'CATALOG_INCOMPLETE', 'Official catalog contained an invalid model row.');
      return sendFailure(res, 503, 'OFFLINE', 'The local catalog is unavailable.');
    }
  });

  app.post('/api/ollama/pull', async (req, res) => {
    const base = loopbackBaseUrl(req.body?.baseUrl);
    const tag = modelTag(req.body?.tag);
    if (!base || !tag) return sendFailure(res, 400, 'INVALID_INPUT', 'A loopback origin and bounded model tag are required.');
    const existing = (await pullStore.list()).find((record) => record.tag === tag && ['queued', 'pulling', 'paused'].includes(record.state));
    if (existing) return res.status(202).json(existing);
    const active = (await pullStore.list()).filter((record) => record.state === 'pulling').length;
    const record = await pullStore.add(tag, base.toString());
    if (active >= 2) return res.status(202).json(record);
    const pullController = new AbortController();
    pullControllers.set(record.id, pullController);
    try {
      await pullStore.update(record.id, { state: 'pulling', providerStatus: 'pulling', attempts: 1, detail: 'Starting local pull.' });
      const response = await localRequest(base, 'api/pull', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: tag, stream: true }), signal: AbortSignal.any([pullController.signal, AbortSignal.timeout(30 * 60 * 1000)]) });
      if (!response.ok) { await pullStore.update(record.id, { state: 'failed', providerStatus: 'error', detail: `Local pull returned HTTP ${response.status}.`, retryable: true }); return sendFailure(res, 502, 'PULL_FAILED', `Local pull returned HTTP ${response.status}.`); }
      res.status(response.status);
      res.setHeader('content-type', 'application/x-ndjson');
      res.setHeader('x-ollama-pull-id', record.id);
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const pullStartedAt = Date.now();
      while (reader) {
        const next = await reader.read();
        if (next.done) break;
        res.write(Buffer.from(next.value));
        buffer += decoder.decode(next.value, { stream: true });
        if (Buffer.byteLength(buffer, 'utf8') > 128 * 1024) throw new Error('progress-record-too-large');
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          try {
            const value = JSON.parse(line) as Record<string, unknown>;
            const completedBytes = typeof value.completed === 'number' ? value.completed : undefined;
            const totalBytes = typeof value.total === 'number' ? value.total : undefined;
            const status = typeof value.status === 'string' ? value.status : undefined;
            const elapsedSeconds = Math.max(0.001, (Date.now() - pullStartedAt) / 1000);
            const rateBytesPerSecond = completedBytes === undefined ? undefined : Math.round(completedBytes / elapsedSeconds);
            const etaSeconds = totalBytes !== undefined && rateBytesPerSecond ? Math.max(0, Math.ceil((totalBytes - (completedBytes ?? 0)) / rateBytesPerSecond)) : undefined;
            await pullStore.update(record.id, { ...(completedBytes === undefined ? {} : { completedBytes }), ...(totalBytes === undefined ? {} : { totalBytes }), ...(rateBytesPerSecond === undefined ? {} : { rateBytesPerSecond }), ...(etaSeconds === undefined ? {} : { etaSeconds }), ...(completedBytes === undefined ? {} : { partialOutcome: completedBytes > 0 ? 'some' : 'none' }), ...(status === 'success' ? { state: 'completed', providerStatus: 'success', retryable: false, partialOutcome: 'all' } : status === 'error' ? { state: 'failed', providerStatus: 'error', retryable: true, detail: 'Provider reported an error.', partialOutcome: completedBytes && completedBytes > 0 ? 'some' : 'none' } : { detail: status ?? null }) });
          } catch {
            // Keep forwarding provider lines, but never let malformed progress corrupt queue state.
          }
        }
      }
      if (buffer.trim()) {
        try {
          const value = JSON.parse(buffer) as Record<string, unknown>;
          if (value.status === 'success') await pullStore.update(record.id, { providerStatus: 'success' });
          if (value.status === 'error') await pullStore.update(record.id, { providerStatus: 'error', detail: 'Provider reported an error.' });
        } catch {
          await pullStore.update(record.id, { detail: 'Provider returned an incomplete final progress record.' });
        }
      }
      const final = await pullStore.get(record.id);
      if (final?.providerStatus === 'success') await pullStore.update(record.id, { state: 'completed', detail: 'Pull stream completed.', retryable: false });
      else await pullStore.update(record.id, { state: 'failed', providerStatus: 'error', detail: 'Provider stream ended without a success status.', retryable: true });
      void runQueuedPulls();
      res.end();
    } catch {
      const current = await pullStore.get(record.id);
      if (current?.state !== 'cancelled' && current?.state !== 'paused') {
        await pullStore.update(record.id, { state: 'failed', providerStatus: 'error', detail: 'The pull stream ended before completion.', retryable: true });
      }
      pullControllers.delete(record.id);
      if (res.headersSent) return res.end();
      void runQueuedPulls();
      return sendFailure(res, 503, 'OFFLINE', 'The local runtime could not start the pull.');
    }
    finally {
      pullControllers.delete(record.id);
    }
  });

  app.post('/api/ollama/chat', async (req, res) => {
    const base = loopbackBaseUrl(req.body?.baseUrl);
    const tag = modelTag(req.body?.tag);
    const messages = Array.isArray(req.body?.messages) ? req.body.messages : null;
    if (!base || !tag || !messages || messages.length > MAX_MESSAGES) return sendFailure(res, 400, 'INVALID_INPUT', 'Chat needs a loopback origin, model tag, and bounded messages.');
    const safeMessages = messages.flatMap((item: unknown) => {
      if (!item || typeof item !== 'object') return [];
      const raw = item as Record<string, unknown>;
      if (typeof raw.role !== 'string' || typeof raw.content !== 'string' || Buffer.byteLength(raw.content, 'utf8') > MAX_MESSAGE_BYTES) return [];
      const attachments = Array.isArray(raw.attachments) ? raw.attachments.flatMap((entry: unknown) => {
        if (!entry || typeof entry !== 'object') return [];
        const attachment = entry as Record<string, unknown>;
        if (typeof attachment.name !== 'string' || typeof attachment.mimeType !== 'string' || typeof attachment.bytes !== 'number' || !Number.isInteger(attachment.bytes) || attachment.bytes < 0 || attachment.bytes > MAX_ATTACHMENT_BYTES || typeof attachment.dataBase64 !== 'string' || attachment.dataBase64.length > Math.ceil(MAX_ATTACHMENT_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(attachment.dataBase64)) return [];
        return [{ name: attachment.name.slice(0, 240), mimeType: attachment.mimeType.slice(0, 120), bytes: attachment.bytes, dataBase64: attachment.dataBase64 }];
      }) : [];
      if (Array.isArray(raw.attachments) && attachments.length !== raw.attachments.length) return [];
      return [{ role: raw.role.slice(0, 32), content: raw.content.slice(0, MAX_MESSAGE_BYTES), attachments }];
    });
    if (safeMessages.length !== messages.length) return sendFailure(res, 400, 'INVALID_INPUT', 'Every chat message must have a bounded role and content.');
    const rawParameters = req.body?.parameters && typeof req.body.parameters === 'object' ? req.body.parameters as Record<string, unknown> : {};
    const temperature = rawParameters.temperature;
    const topP = rawParameters.topP;
    const topK = rawParameters.topK;
    const numCtx = rawParameters.numCtx;
    const seed = rawParameters.seed;
    if (typeof temperature !== 'number' || !Number.isFinite(temperature) || temperature < 0 || temperature > 2 || typeof topP !== 'number' || !Number.isFinite(topP) || topP < 0 || topP > 1 || typeof topK !== 'number' || !Number.isInteger(topK) || topK < 1 || topK > 1000 || typeof numCtx !== 'number' || !Number.isInteger(numCtx) || numCtx < 1 || numCtx > 1_000_000 || (seed !== null && typeof seed !== 'undefined' && (typeof seed !== 'number' || !Number.isInteger(seed) || seed < 0 || seed > 2_147_483_647))) return sendFailure(res, 400, 'INVALID_INPUT', 'Chat parameters are outside their documented bounds.');
    const systemPrompt = typeof req.body?.systemPrompt === 'string' && Buffer.byteLength(req.body.systemPrompt, 'utf8') <= MAX_SYSTEM_PROMPT_BYTES ? req.body.systemPrompt.slice(0, MAX_SYSTEM_PROMPT_BYTES) : '';
    const ollamaMessages = (systemPrompt ? [{ role: 'system', content: systemPrompt, attachments: [] }, ...safeMessages] : safeMessages).map((message) => ({ role: message.role, content: message.content, ...(message.attachments.length ? { images: message.attachments.filter((attachment) => attachment.mimeType.startsWith('image/')).map((attachment) => attachment.dataBase64) } : {}) }));
    try {
      const response = await localRequest(base, 'api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: tag, messages: ollamaMessages, options: { temperature, top_p: topP, top_k: topK, num_ctx: numCtx, ...(seed === null || typeof seed === 'undefined' ? {} : { seed }) }, stream: true }), signal: AbortSignal.timeout(30 * 60 * 1000) });
      if (!response.ok) return sendFailure(res, 502, 'CHAT_FAILED', `Local chat returned HTTP ${response.status}.`);
      res.status(response.status);
      res.setHeader('content-type', 'application/x-ndjson');
      response.body?.pipeTo(new WritableStream<Uint8Array>({ write(chunk: Uint8Array) { res.write(Buffer.from(chunk)); }, close() { res.end(); }, abort() { res.end(); } })).catch(() => res.end());
    } catch {
      return sendFailure(res, 503, 'OFFLINE', 'The local runtime could not start chat.');
    }
  });
}

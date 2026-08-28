import type { Express, Response } from 'express';
import { promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const DEFAULT_OLLAMA_BASE_URL = 'http://127.0.0.1:11434';
const MAX_JSON_BYTES = 8 * 1024 * 1024;
const MAX_MODEL_TAG = 160;
const MAX_MESSAGES = 100;
const MAX_MESSAGE_BYTES = 100_000;
const OFFICIAL_CATALOG_URL = 'https://ollama.com/api/tags';
const MAX_PULL_QUEUE_ITEMS = 10_000;

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

function allowlistedHarness(value: unknown): { executable: string; arguments: string[]; modelTag: string; workingDirectory: string | null } | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const executable = typeof raw.executable === 'string' ? raw.executable.trim() : '';
  const model = modelTag(raw.modelTag);
  const args = Array.isArray(raw.arguments) && raw.arguments.every((item) => typeof item === 'string' && item.length <= 500) ? raw.arguments as string[] : [];
  const workingDirectory = raw.workingDirectory === null || typeof raw.workingDirectory === 'undefined' ? null : typeof raw.workingDirectory === 'string' ? raw.workingDirectory.trim() : null;
  const base = path.basename(executable).toLowerCase();
  if (!model || !['ollama', 'ollama.exe'].includes(base) || args.length > 64 || args.some((arg) => /[;&|<>`$\r\n]/.test(arg)) || /[;&|<>`$\r\n]/.test(executable)) return null;
  if (workingDirectory !== null && (!workingDirectory || workingDirectory.length > 500)) return null;
  return { executable, arguments: args, modelTag: model, workingDirectory };
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
  state: 'queued' | 'pulling' | 'paused' | 'completed' | 'cancelled' | 'failed';
  completedBytes: number;
  totalBytes: number | null;
  attempts: number;
  detail: string | null;
  queuedAt: string;
  updatedAt: string;
  retryable: boolean;
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
        if (Array.isArray(parsed)) records = parsed.slice(0, MAX_PULL_QUEUE_ITEMS) as DurablePull[];
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
    async add(tag: string) { await load(); const now = new Date().toISOString(); const record: DurablePull = { id: `${tag}-${Date.now()}`, tag, state: 'queued', completedBytes: 0, totalBytes: null, attempts: 0, detail: null, queuedAt: now, updatedAt: now, retryable: true }; records.push(record); await save(); return record; },
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
  app.get('/api/ollama/hardware', async (_req, res) => res.json(await hardwareFacts(dataDir)));
  app.get('/api/ollama/pulls', async (_req, res) => res.json({ records: await pullStore.list(), concurrency: 2 }));
  app.post('/api/ollama/harness/preflight', async (req, res) => {
    const profile = allowlistedHarness(req.body?.profile ?? req.body);
    if (!profile) return sendFailure(res, 400, 'INVALID_PROFILE', 'Harness profile is not allowlisted.');
    return res.json({ ok: true, executable: path.basename(profile.executable), arguments: profile.arguments, modelTag: profile.modelTag, workingDirectory: profile.workingDirectory, environmentKeys: [], network: 'local Ollama API only', snapshot: 'A redacted profile snapshot is written before launch.' });
  });
  app.post('/api/ollama/harness/launch', async (req, res) => {
    const profile = allowlistedHarness(req.body?.profile ?? req.body);
    if (!profile) return sendFailure(res, 400, 'INVALID_PROFILE', 'Harness profile is not allowlisted.');
    const snapshotDir = path.join(dataDir, 'ollama-suite', 'harness-snapshots');
    const snapshotPath = path.join(snapshotDir, `${Date.now()}.json`);
    try {
      await fs.mkdir(snapshotDir, { recursive: true });
      await fs.writeFile(snapshotPath, JSON.stringify({ executable: profile.executable, arguments: profile.arguments, modelTag: profile.modelTag, workingDirectory: profile.workingDirectory }), 'utf8');
      const child = spawn(profile.executable, profile.arguments.length ? profile.arguments : ['run', profile.modelTag], { cwd: profile.workingDirectory ?? undefined, shell: false, windowsHide: true, stdio: 'ignore' });
      const pid = child.pid;
      if (!pid) { await fs.rm(snapshotPath, { force: true }); return sendFailure(res, 502, 'LAUNCH_FAILED', 'Allowlisted harness did not start.'); }
      let health = 'unhealthy';
      try {
        const response = await localRequest(new URL(DEFAULT_OLLAMA_BASE_URL), 'api/version', { signal: AbortSignal.timeout(5_000) });
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
      return res.json({ ok: true, restored: true, modelTag: profile.modelTag, executable: path.basename(profile.executable) });
    } catch {
      return sendFailure(res, 404, 'SNAPSHOT_NOT_FOUND', 'Snapshot could not be read.');
    }
  });
  app.post('/api/ollama/pulls/:id/cancel', async (req, res) => {
    const record = await pullStore.update(req.params.id, { state: 'cancelled', retryable: false, detail: 'Cancelled by the user.' });
    return record ? res.json(record) : sendFailure(res, 404, 'NOT_FOUND', 'Unknown pull queue item.');
  });
  app.post('/api/ollama/pulls/:id/pause', async (req, res) => {
    const record = await pullStore.update(req.params.id, { state: 'paused', detail: 'Paused by the user.' });
    return record ? res.json(record) : sendFailure(res, 404, 'NOT_FOUND', 'Unknown pull queue item.');
  });
  app.post('/api/ollama/pulls/:id/resume', async (req, res) => {
    const record = await pullStore.update(req.params.id, { state: 'queued', detail: 'Queued for resume.' });
    return record ? res.json(record) : sendFailure(res, 404, 'NOT_FOUND', 'Unknown pull queue item.');
  });
  app.post('/api/ollama/pulls/:id/retry', async (req, res) => {
    const record = await pullStore.get(req.params.id);
    if (!record) return sendFailure(res, 404, 'NOT_FOUND', 'Unknown pull queue item.');
    if (!record.retryable || !['failed', 'cancelled'].includes(record.state)) return sendFailure(res, 409, 'NOT_RETRYABLE', 'This pull is not in a retryable state.');
    return res.json(await pullStore.update(record.id, { state: 'queued', detail: 'Queued for retry.', retryable: true }));
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
      return res.json({ tags, running: [] });
    } catch {
      return sendFailure(res, 503, 'OFFLINE', 'Installed model state is unavailable.');
    }
  });

  app.get('/api/ollama/catalog', async (req, res) => {
    try {
      const response = await officialCatalogRequest(typeof req.query.pageToken === 'string' ? req.query.pageToken : null);
      if (!response.ok) return sendFailure(res, 503, 'CATALOG_UNAVAILABLE', `Official catalog returned HTTP ${response.status}.`);
      const payload = await boundedJson(response) as Record<string, unknown>;
      const models = Array.isArray(payload.models) ? payload.models : [];
      const variants = models.flatMap((item) => {
        if (!item || typeof item !== 'object') return [];
        const raw = item as Record<string, unknown>;
        const tag = modelTag(raw.name);
        if (!tag) return [];
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
          installed: true,
          running: false,
          fit: 'unknown',
          fitEvidence: ['Official catalog metadata requires host hardware facts before a fit verdict can be computed.'],
        }];
      });
      return res.json({ variants, nextPageToken: typeof payload.nextPageToken === 'string' ? payload.nextPageToken : null, sourceRevision: response.headers.get('etag'), sourceIdentity: `${response.url}|${req.query.pageToken ?? ''}` });
    } catch {
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
    const record = await pullStore.add(tag);
    if (active >= 2) return res.status(202).json(record);
    try {
      await pullStore.update(record.id, { state: 'pulling', attempts: 1, detail: 'Starting local pull.' });
      const response = await localRequest(base, 'api/pull', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: tag, stream: true }), signal: AbortSignal.timeout(30 * 60 * 1000) });
      if (!response.ok) { await pullStore.update(record.id, { state: 'failed', detail: `Local pull returned HTTP ${response.status}.`, retryable: true }); return sendFailure(res, 502, 'PULL_FAILED', `Local pull returned HTTP ${response.status}.`); }
      res.status(response.status);
      res.setHeader('content-type', 'application/x-ndjson');
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (reader) {
        const next = await reader.read();
        if (next.done) break;
        res.write(Buffer.from(next.value));
        buffer += decoder.decode(next.value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          try {
            const value = JSON.parse(line) as Record<string, unknown>;
            const completedBytes = typeof value.completed === 'number' ? value.completed : undefined;
            const totalBytes = typeof value.total === 'number' ? value.total : undefined;
            const status = typeof value.status === 'string' ? value.status : undefined;
            await pullStore.update(record.id, { ...(completedBytes === undefined ? {} : { completedBytes }), ...(totalBytes === undefined ? {} : { totalBytes }), ...(status === 'success' ? { state: 'completed', retryable: false } : { detail: status ?? null }) });
          } catch {
            // Keep forwarding provider lines, but never let malformed progress corrupt queue state.
          }
        }
      }
      await pullStore.update(record.id, { state: 'completed', detail: 'Pull stream completed.', retryable: false });
      res.end();
    } catch {
      await pullStore.update(record.id, { state: 'failed', detail: 'The pull stream ended before completion.', retryable: true });
      if (res.headersSent) return res.end();
      return sendFailure(res, 503, 'OFFLINE', 'The local runtime could not start the pull.');
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
      return [{ role: raw.role.slice(0, 32), content: raw.content.slice(0, MAX_MESSAGE_BYTES) }];
    });
    if (safeMessages.length !== messages.length) return sendFailure(res, 400, 'INVALID_INPUT', 'Every chat message must have a bounded role and content.');
    try {
      const response = await localRequest(base, 'api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: tag, messages: safeMessages, stream: true }), signal: AbortSignal.timeout(30 * 60 * 1000) });
      if (!response.ok) return sendFailure(res, 502, 'CHAT_FAILED', `Local chat returned HTTP ${response.status}.`);
      res.status(response.status);
      res.setHeader('content-type', 'application/x-ndjson');
      response.body?.pipeTo(new WritableStream<Uint8Array>({ write(chunk: Uint8Array) { res.write(Buffer.from(chunk)); }, close() { res.end(); }, abort() { res.end(); } })).catch(() => res.end());
    } catch {
      return sendFailure(res, 503, 'OFFLINE', 'The local runtime could not start chat.');
    }
  });
}

import type { Express, Request, Response } from 'express';

const DEFAULT_OLLAMA_BASE_URL = 'http://127.0.0.1:11434';
const MAX_JSON_BYTES = 8 * 1024 * 1024;
const MAX_MODEL_TAG = 160;
const MAX_MESSAGES = 100;
const MAX_MESSAGE_BYTES = 100_000;

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

export function registerOllamaSuiteRoutes(app: Express): void {
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
    const base = loopbackBaseUrl(req.query.baseUrl);
    if (!base) return sendFailure(res, 400, 'INVALID_ORIGIN', 'Only a credential-free loopback origin is allowed.');
    try {
      const response = await localRequest(base, 'api/tags');
      if (!response.ok) return sendFailure(res, 503, 'RUNTIME_UNHEALTHY', `Local catalog returned HTTP ${response.status}.`);
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
          capabilities: [],
          installed: true,
          running: false,
          fit: 'unknown',
          fitEvidence: ['Local tags do not provide enough hardware evidence for a fit verdict.'],
        }];
      });
      return res.json({ variants, nextPageToken: null, sourceRevision: `local-tags:${new Date().toISOString().slice(0, 10)}` });
    } catch {
      return sendFailure(res, 503, 'OFFLINE', 'The local catalog is unavailable.');
    }
  });

  app.post('/api/ollama/pull', async (req, res) => {
    const base = loopbackBaseUrl(req.body?.baseUrl);
    const tag = modelTag(req.body?.tag);
    if (!base || !tag) return sendFailure(res, 400, 'INVALID_INPUT', 'A loopback origin and bounded model tag are required.');
    try {
      const response = await localRequest(base, 'api/pull', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: tag, stream: true }), signal: AbortSignal.timeout(30 * 60 * 1000) });
      if (!response.ok) return sendFailure(res, 502, 'PULL_FAILED', `Local pull returned HTTP ${response.status}.`);
      res.status(response.status);
      res.setHeader('content-type', 'application/x-ndjson');
      response.body?.pipeTo(new WritableStream<Uint8Array>({ write(chunk: Uint8Array) { res.write(Buffer.from(chunk)); }, close() { res.end(); }, abort() { res.end(); } })).catch(() => res.end());
    } catch {
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

#!/usr/bin/env node

import http from 'node:http';
import readline from 'node:readline';

const ENDPOINT = Object.freeze({ hostname: '127.0.0.1', port: 8765, path: '/mcp' });
const PROTOCOL_VERSION = '2025-03-26';
const MAX_INPUT_BYTES = 256 * 1024;
const MAX_RESPONSE_BYTES = 32 * 1024 * 1024;
const ALLOWED_TOOLS = new Set([
  'startup_status',
  'list_headless_desktops',
  'launch_on_headless_desktop',
  'list_headless_windows',
  'win_send_keys',
  'screenshot',
  'kill_process',
  'close_headless_desktop',
]);

let sessionId = null;
let nextRpcId = 1;
let boundNonce = null;
let initialized = false;
let toolDefinitions = null;

function exactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new Error(`${label} fields are invalid`);
}

function parseResponses(body, contentType) {
  if (body.length > MAX_RESPONSE_BYTES) throw new Error('Lowlevel response exceeds the byte bound');
  const text = body.toString('utf8');
  if (!text.trim()) return [];
  if (!contentType.includes('text/event-stream')) {
    const decoded = JSON.parse(text);
    return Array.isArray(decoded) ? decoded : [decoded];
  }
  const responses = [];
  let lines = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('data:')) lines.push(line.slice(5).trimStart());
    else if (!line.trim() && lines.length) {
      responses.push(JSON.parse(lines.join('\n')));
      lines = [];
    }
  }
  if (lines.length) responses.push(JSON.parse(lines.join('\n')));
  return responses;
}

function post(payload) {
  const bytes = Buffer.from(JSON.stringify(payload));
  return new Promise((resolve, reject) => {
    const request = http.request({
      ...ENDPOINT,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'Content-Length': String(bytes.length),
        'MCP-Protocol-Version': PROTOCOL_VERSION,
        ...(sessionId ? { 'MCP-Session-Id': sessionId } : {}),
      },
      timeout: 60000,
    }, (response) => {
      const chunks = [];
      let length = 0;
      response.on('data', (chunk) => {
        length += chunk.length;
        if (length > MAX_RESPONSE_BYTES) request.destroy(new Error('Lowlevel response exceeds the byte bound'));
        else chunks.push(chunk);
      });
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) return reject(new Error(`Lowlevel returned HTTP ${response.statusCode}`));
        const returnedSession = response.headers['mcp-session-id'];
        if (typeof returnedSession === 'string' && returnedSession.length > 0) sessionId = returnedSession;
        try { resolve(parseResponses(Buffer.concat(chunks), String(response.headers['content-type'] ?? ''))); }
        catch (error) { reject(error); }
      });
    });
    request.on('timeout', () => request.destroy(new Error('Lowlevel request timed out')));
    request.on('error', reject);
    request.end(bytes);
  });
}

async function rpc(method, params = undefined) {
  const id = nextRpcId++;
  const responses = await post({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) });
  const response = responses.find((candidate) => candidate?.id === id);
  if (!response || response.error || !Object.hasOwn(response, 'result')) throw new Error(`Lowlevel JSON-RPC ${method} failed`);
  return response.result;
}

async function notify(method, params = undefined) {
  await post({ jsonrpc: '2.0', method, ...(params === undefined ? {} : { params }) });
}

async function initialize() {
  if (initialized) return;
  await rpc('initialize', { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'material-designer-lang-gui-live-proof', version: '1' } });
  await notify('notifications/initialized');
  const inventory = await rpc('tools/list', {});
  if (!Array.isArray(inventory?.tools)) throw new Error('Lowlevel tool inventory is invalid');
  toolDefinitions = inventory.tools;
  initialized = true;
}

async function callTool(tool, params) {
  if (!ALLOWED_TOOLS.has(tool)) throw new Error('Lowlevel tool is outside the driver allowlist');
  const definition = toolDefinitions.find((candidate) => candidate?.name === tool);
  if (!definition) throw new Error('Lowlevel tool is unavailable');
  const properties = definition.inputSchema?.properties;
  const result = await rpc('tools/call', { name: tool, arguments: properties && Object.hasOwn(properties, 'params') ? { params } : params });
  if (!result || typeof result !== 'object' || !Array.isArray(result.content)) throw new Error('Lowlevel tool result is invalid');
  const text = result.content.filter((item) => item?.type === 'text' && typeof item.text === 'string').map((item) => item.text);
  const images = result.content.filter((item) => item?.type === 'image' && typeof item.data === 'string' && typeof item.mimeType === 'string').map((item) => ({ data: item.data, mimeType: item.mimeType }));
  let payload = {};
  if (text.length === 1) {
    try { payload = JSON.parse(text[0]); }
    catch { payload = { text }; }
  } else if (text.length > 0) payload = { text };
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) payload = { value: payload };
  if (!Object.hasOwn(payload, 'ok')) payload.ok = result.isError !== true;
  return { ...payload, images, isError: result.isError === true, client_ok: payload.ok === true && result.isError !== true && payload.timed_out !== true && (!Object.hasOwn(payload, 'returncode') || payload.returncode === 0) };
}

async function handle(request) {
  if (!Number.isInteger(request.id) || request.id < 1 || typeof request.nonce !== 'string' || !/^[0-9a-f]{64}$/.test(request.nonce) || request.version !== 1) throw new Error('Driver request identity is invalid');
  if (boundNonce === null) boundNonce = request.nonce;
  if (request.nonce !== boundNonce) throw new Error('Driver nonce replay or substitution was rejected');
  await initialize();
  if (request.action === 'preflight') {
    exactKeys(request, ['version', 'nonce', 'id', 'action', 'required'], 'preflight request');
    if (!Array.isArray(request.required) || request.required.some((name) => !ALLOWED_TOOLS.has(name))) throw new Error('Preflight requirements are outside the driver allowlist');
    const names = new Set(toolDefinitions.map((definition) => definition?.name));
    const missing = request.required.filter((name) => !names.has(name));
    return { missing, toolCount: names.size };
  }
  if (request.action === 'call') {
    exactKeys(request, ['version', 'nonce', 'id', 'action', 'tool', 'params'], 'tool request');
    if (!request.params || typeof request.params !== 'object' || Array.isArray(request.params)) throw new Error('Tool parameters must be an object');
    return await callTool(request.tool, request.params);
  }
  throw new Error('Driver action is unsupported');
}

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity, terminal: false });
input.on('line', async (line) => {
  input.pause();
  let request = null;
  try {
    if (Buffer.byteLength(line) === 0 || Buffer.byteLength(line) > MAX_INPUT_BYTES) throw new Error('Driver request exceeds the byte bound');
    request = JSON.parse(line);
    const result = await handle(request);
    process.stdout.write(`${JSON.stringify({ version: 1, nonce: boundNonce, id: request.id, ok: true, result })}\n`);
  } catch {
    process.stdout.write(`${JSON.stringify({ version: 1, nonce: boundNonce, id: request?.id ?? null, ok: false })}\n`);
  } finally {
    input.resume();
  }
});

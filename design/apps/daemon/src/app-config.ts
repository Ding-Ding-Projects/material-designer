// Daemon-backed app preferences (onboarding state, agent/skill/DS selection).
//
// The web frontend pushes preferences here via PUT /api/app-config; the
// daemon persists them to <dataDir>/app-config.json (where dataDir defaults
// to <projectRoot>/.od but follows OD_DATA_DIR when set, keeping test and
// multi-namespace runs isolated). This survives browser storage resets and
// origin changes so onboarding and agent selection don't reappear unexpectedly.
//
// `agentCliEnv` is intentionally limited by allowlist below. It is the
// explicit low-level launch environment for Local CLI runs, separate from
// provider BYOK. API-key entries here configure the underlying CLI itself;
// BASE_URL is optional and, when omitted, the CLI uses its default endpoint.
// `agentCliEnvIntent` records when API-key entries were saved under that new
// CLI-override contract. Older builds labeled the same fields as proxy-only,
// so legacy standalone keys without a base URL are dropped unless this marker
// or a matching base URL proves that the user intended to activate them.
// These values are local-only and should not be logged or returned outside
// this machine.

import { readFileSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import { expandHomePrefix } from './home-expansion.js';

import {
  readInstallationFile,
  readInstallationFileSync,
  resolveInstallationDir,
  writeInstallationFile,
  type InstallationFilePatch,
} from './installation.js';

// Plugin-system env knobs. See docs/plans/plugins-implementation.md F6 / F9.
// Phase 1 only reads them; the GC worker that enforces snapshot expiry lands
// in Phase 5. Centralized here to keep daemon modules from sprinkling magic
// numbers across the codebase.
export interface PluginEnvKnobs {
  // Hard ceiling on devloop iterations per stage (spec §10.2).
  maxDevloopIterations: number;
  // Days before an unreferenced applied_plugin_snapshots row expires. A
  // value of 0 means "keep forever" (operators can opt out of GC entirely).
  snapshotUnreferencedTtlDays: number;
  // Optional cap on how long even a referenced snapshot stays around once
  // its run/conversation/project is terminal. Default unset -> unlimited.
  snapshotRetentionDays: number | null;
  // GC worker tick interval. Phase 5 reads this; Phase 1 just exposes the
  // knob through `od config get` so operators can plan ahead.
  snapshotGcIntervalMs: number;
}

function intFromEnv(key: string, fallback: number): number {
  const raw = process.env[key];
  if (typeof raw !== 'string' || raw.trim().length === 0) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.floor(parsed);
}

function nullableIntFromEnv(key: string): number | null {
  const raw = process.env[key];
  if (typeof raw !== 'string' || raw.trim().length === 0) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.floor(parsed);
}

export function readPluginEnvKnobs(): PluginEnvKnobs {
  return {
    maxDevloopIterations:        intFromEnv('OD_MAX_DEVLOOP_ITERATIONS', 10),
    snapshotUnreferencedTtlDays: intFromEnv('OD_SNAPSHOT_UNREFERENCED_TTL_DAYS', 30),
    snapshotRetentionDays:       nullableIntFromEnv('OD_SNAPSHOT_RETENTION_DAYS'),
    snapshotGcIntervalMs:        intFromEnv('OD_SNAPSHOT_GC_INTERVAL_MS', 6 * 60 * 60 * 1000),
  };
}

export interface AgentModelPrefs {
  model?: string;
  reasoning?: string;
  serviceTier?: string;
}

export type AgentCliEnvPrefs = Record<string, Record<string, string>>;
export type AgentCliEnvIntentPrefs = Record<string, { apiKeyOverride?: boolean }>;

export interface TelemetryPrefs {
  metrics?: boolean;
  content?: boolean;
  artifactManifest?: boolean;
}

export interface OrbitConfigPrefs {
  enabled: boolean;
  time: string;
  templateSkillId?: string | null;
  workspaceScope?: {
    workspaceId: string;
    workspaceMemberId: string;
  } | null;
}

export interface ProjectLocationPrefs {
  id: string;
  name: string;
  path: string;
}

// Persisted "open in external editor" choice (GET /api/editor/detect,
// POST /api/editor/open). `command` is an absolute executable path and only
// meaningful for the `custom` id — the editor the user added themselves. It is
// always spawned with an argument vector and never through a shell, so it is a
// path and not a command line: no flags, no arguments, no metacharacters are
// interpreted out of it.
export interface ExternalEditorPrefs {
  id: string;
  command?: string | null;
  label?: string | null;
  supportsFolders?: boolean;
}

export interface AppConfigPrefs {
  onboardingCompleted?: boolean;
  agentId?: string | null;
  agentModels?: Record<string, AgentModelPrefs>;
  agentCliEnv?: AgentCliEnvPrefs;
  agentCliEnvIntent?: AgentCliEnvIntentPrefs;
  skillId?: string | null;
  designSystemId?: string | null;
  disabledSkills?: string[];
  disabledDesignSystems?: string[];
  installationId?: string | null;
  telemetry?: TelemetryPrefs;
  privacyDecisionAt?: number | null;
  allowSilentUpdates?: boolean;
  orbit?: OrbitConfigPrefs;
  customInstructions?: string | null;
  projectLocations?: ProjectLocationPrefs[];
  defaultProjectLocationId?: string | null;
  // Most-recently-used local working directories the user granted the agent
  // read access to from the Home composer. Become a project's
  // `metadata.linkedDirs` (read-only `--add-dir` awareness, no Design Files
  // import). Stored most-recent-first; capped at RECENT_LINKED_DIRS_MAX.
  recentLinkedDirs?: string[];
  // Which external editor "Open in…" uses. Null/absent means the user has not
  // chosen, so the daemon auto-picks (VS Code first). An explicit choice that
  // is no longer installed is reported as missing rather than silently
  // replaced with whatever else happens to be on the machine.
  externalEditor?: ExternalEditorPrefs | null;
  /** Presentation-only logo state, validated and bounded below. */
  appLogo?: unknown;
}

// Cap on how many recent working directories we remember. Keeps the picker's
// "Recent" submenu short and the config file bounded.
export const RECENT_LINKED_DIRS_MAX = 5;

const ALLOWED_KEYS: ReadonlySet<keyof AppConfigPrefs> = new Set([
  'onboardingCompleted',
  'agentId',
  'agentModels',
  'agentCliEnv',
  'agentCliEnvIntent',
  'skillId',
  'designSystemId',
  'disabledSkills',
  'disabledDesignSystems',
  'installationId',
  'telemetry',
  'privacyDecisionAt',
  'allowSilentUpdates',
  'orbit',
  'customInstructions',
  'projectLocations',
  'defaultProjectLocationId',
  'recentLinkedDirs',
  'externalEditor',
  'appLogo',
] as const);

function configFile(dataDir: string): string {
  return path.join(dataDir, 'app-config.json');
}

export function appConfigDir(projectRoot: string, env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.OD_DATA_DIR;
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return path.join(projectRoot, '.od');
  }
  const expanded = expandHomePrefix(raw.trim());
  return path.isAbsolute(expanded) ? expanded : path.resolve(projectRoot, expanded);
}

const AGENT_MODEL_KEYS: ReadonlySet<string> = new Set([
  'model',
  'reasoning',
  'serviceTier',
]);
const RETIRED_AGENT_IDS: ReadonlySet<string> = new Set(['gemini']);

const TELEMETRY_KEYS: ReadonlySet<string> = new Set([
  'metrics',
  'content',
  'artifactManifest',
]);

function validateTelemetry(raw: unknown): TelemetryPrefs | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const result: Record<string, boolean> = Object.create(null);
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (k === '__proto__' || k === 'constructor') continue;
    if (!TELEMETRY_KEYS.has(k)) continue;
    if (typeof v === 'boolean') result[k] = v;
  }
  return Object.keys(result).length > 0 ? (result as TelemetryPrefs) : undefined;
}

const AGENT_CLI_ENV_KEYS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ['amr', new Set([
    'VELA_BIN',
    'VELA_API_URL',
    'VELA_LINK_URL',
    'VELA_RUNTIME_KEY',
    'VELA_OPENCODE_BIN',
    'OPEN_DESIGN_AMR_PROFILE',
    'OPENCODE_TEST_HOME',
  ])],
  ['aider', new Set(['AIDER_BIN'])],
  ['claude', new Set(['CLAUDE_CONFIG_DIR', 'CLAUDE_BIN', 'ANTHROPIC_BASE_URL', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'MMD_MODEL_ROUTES_FILE'])],
  ['codex', new Set(['CODEX_HOME', 'CODEX_BIN', 'OPENAI_BASE_URL', 'CODEX_API_KEY', 'OPENAI_API_KEY'])],
  ['copilot', new Set(['COPILOT_BIN'])],
  ['cursor-agent', new Set(['CURSOR_AGENT_BIN'])],
  ['deepseek', new Set(['DEEPSEEK_BIN'])],
  ['devin', new Set(['DEVIN_BIN'])],
  ['mimo', new Set(['MIMO_BIN'])],
  ['hermes', new Set(['HERMES_BIN'])],
  ['kimi', new Set(['KIMI_BIN'])],
  ['kiro', new Set(['KIRO_BIN'])],
  ['kilo', new Set(['KILO_BIN'])],
  ['opencode', new Set(['OPENCODE_BIN'])],
  ['pi', new Set(['PI_BIN'])],
  ['qoder', new Set(['QODER_BIN'])],
  ['qwen', new Set(['QWEN_BIN'])],
  ['trae-cli', new Set(['TRAE_CLI_BIN'])],
  ['vibe', new Set(['VIBE_BIN'])],
]);

const AGENT_CLI_AUTH_ENV_KEYS: ReadonlyMap<string, {
  auth: ReadonlySet<string>;
  baseUrl: ReadonlySet<string>;
}> = new Map([
  ['claude', {
    auth: new Set(['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN']),
    baseUrl: new Set(['ANTHROPIC_BASE_URL']),
  }],
  ['codex', {
    auth: new Set(['CODEX_API_KEY', 'OPENAI_API_KEY']),
    baseUrl: new Set(['OPENAI_BASE_URL']),
  }],
]);

function isValidAgentModelEntry(v: unknown): v is AgentModelPrefs {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const obj = v as Record<string, unknown>;
  for (const k of Object.keys(obj)) {
    if (!AGENT_MODEL_KEYS.has(k)) return false;
    if (obj[k] !== undefined && typeof obj[k] !== 'string') return false;
  }
  return true;
}

function validateAgentModels(
  raw: unknown,
): Record<string, AgentModelPrefs> | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const result: Record<string, AgentModelPrefs> = Object.create(null);
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (k === '__proto__' || k === 'constructor') continue;
    if (isValidAgentModelEntry(v)) {
      result[k] = v;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

export function validateAgentCliEnv(raw: unknown): AgentCliEnvPrefs | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const result: AgentCliEnvPrefs = Object.create(null);
  for (const [agentId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (agentId === '__proto__' || agentId === 'constructor') continue;
    const allowed = AGENT_CLI_ENV_KEYS.get(agentId);
    if (!allowed || typeof value !== 'object' || value === null || Array.isArray(value)) {
      continue;
    }
    const env: Record<string, string> = Object.create(null);
    for (const [envKey, envValue] of Object.entries(value as Record<string, unknown>)) {
      if (!allowed.has(envKey)) continue;
      if (typeof envValue !== 'string') continue;
      const trimmed = envValue.trim();
      if (!trimmed) continue;
      env[envKey] = trimmed;
    }
    if (Object.keys(env).length > 0) result[agentId] = env;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

export function validateAgentCliEnvIntent(raw: unknown): AgentCliEnvIntentPrefs | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const result: AgentCliEnvIntentPrefs = Object.create(null);
  for (const [agentId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (agentId === '__proto__' || agentId === 'constructor') continue;
    if (!AGENT_CLI_ENV_KEYS.has(agentId)) continue;
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const obj = value as Record<string, unknown>;
    if (obj.apiKeyOverride === true) {
      result[agentId] = { apiKeyOverride: true };
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function isValidOrbitTime(time: string): boolean {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return false;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

function validateOrbit(raw: unknown): OrbitConfigPrefs | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const obj = raw as Record<string, unknown>;
  const enabled = typeof obj.enabled === 'boolean' ? obj.enabled : false;
  const time = typeof obj.time === 'string' && isValidOrbitTime(obj.time)
    ? obj.time
    : '08:00';
  const orbit: OrbitConfigPrefs = { enabled, time };

  if (Object.hasOwn(obj, 'templateSkillId')) {
    orbit.templateSkillId = typeof obj.templateSkillId === 'string' && obj.templateSkillId.trim()
      ? obj.templateSkillId.trim()
      : null;
  }
  if (Object.hasOwn(obj, 'workspaceScope')) {
    const rawScope = obj.workspaceScope;
    if (rawScope && typeof rawScope === 'object' && !Array.isArray(rawScope)) {
      const workspaceId =
        typeof (rawScope as Record<string, unknown>).workspaceId === 'string'
          ? ((rawScope as Record<string, unknown>).workspaceId as string).trim()
          : '';
      const workspaceMemberId =
        typeof (rawScope as Record<string, unknown>).workspaceMemberId === 'string'
          ? ((rawScope as Record<string, unknown>).workspaceMemberId as string).trim()
          : '';
      orbit.workspaceScope =
        workspaceId && workspaceMemberId ? { workspaceId, workspaceMemberId } : null;
    } else {
      orbit.workspaceScope = null;
    }
  }

  return orbit;
}

function normalizeLocationId(raw: string, fallback: string): string {
  const trimmed = raw.trim();
  if (/^[A-Za-z0-9._-]{1,128}$/.test(trimmed) && trimmed !== 'default') {
    return trimmed;
  }
  return fallback;
}

function autoProjectLocationId(pathKey: string): string {
  return `loc_${createHash('sha256').update(pathKey).digest('base64url').slice(0, 16)}`;
}

function validateProjectLocations(raw: unknown): ProjectLocationPrefs[] | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!Array.isArray(raw)) return undefined;
  const result: ProjectLocationPrefs[] = [];
  const seenIds = new Set<string>();
  const seenPaths = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const obj = item as Record<string, unknown>;
    if (typeof obj.path !== 'string') continue;
    const expanded = expandHomePrefix(obj.path.trim());
    if (!expanded || !path.isAbsolute(expanded)) continue;
    const normalizedPath = path.normalize(expanded);
    const pathKey = process.platform === 'win32' ? normalizedPath.toLowerCase() : normalizedPath;
    if (seenPaths.has(pathKey)) continue;
    const id = normalizeLocationId(
      typeof obj.id === 'string' ? obj.id : '',
      autoProjectLocationId(pathKey),
    );
    if (seenIds.has(id)) continue;
    const rawName = typeof obj.name === 'string' ? obj.name.trim() : '';
    result.push({ id, name: rawName || path.basename(normalizedPath) || normalizedPath, path: normalizedPath });
    seenIds.add(id);
    seenPaths.add(pathKey);
  }
  return result;
}

export function agentCliEnvForAgent(
  prefs: AgentCliEnvPrefs | undefined,
  agentId: string,
): Record<string, string> {
  if (!prefs || typeof agentId !== 'string') return {};
  const env = prefs[agentId === 'byok-opencode' ? 'opencode' : agentId];
  if (!env || typeof env !== 'object' || Array.isArray(env)) return {};
  return { ...env };
}

function normalizeAgentCliEnvPrefs(prefs: AppConfigPrefs): AppConfigPrefs {
  const agentCliEnv = prefs.agentCliEnv;
  if (!agentCliEnv) {
    if (!prefs.agentCliEnvIntent) return prefs;
    const next = { ...prefs };
    delete next.agentCliEnvIntent;
    return next;
  }

  let nextAgentCliEnv = agentCliEnv;
  let changed = false;

  for (const [agentId, keys] of AGENT_CLI_AUTH_ENV_KEYS) {
    const env = nextAgentCliEnv[agentId];
    if (!env) continue;
    const hasBaseUrl = Object.keys(env).some((key) => keys.baseUrl.has(key));
    const hasExplicitApiKeyIntent = prefs.agentCliEnvIntent?.[agentId]?.apiKeyOverride === true;
    if (hasBaseUrl || hasExplicitApiKeyIntent) continue;

    let nextEnv = env;
    for (const authKey of keys.auth) {
      if (!Object.prototype.hasOwnProperty.call(nextEnv, authKey)) continue;
      if (nextEnv === env) nextEnv = { ...env };
      delete nextEnv[authKey];
      changed = true;
    }
    if (nextEnv === env) continue;
    nextAgentCliEnv = { ...nextAgentCliEnv };
    if (Object.keys(nextEnv).length > 0) {
      nextAgentCliEnv[agentId] = nextEnv;
    } else {
      delete nextAgentCliEnv[agentId];
    }
  }

  let nextAgentCliEnvIntent = prefs.agentCliEnvIntent;
  if (nextAgentCliEnvIntent) {
    for (const agentId of Object.keys(nextAgentCliEnvIntent)) {
      if (nextAgentCliEnv[agentId]) continue;
      nextAgentCliEnvIntent = { ...nextAgentCliEnvIntent };
      delete nextAgentCliEnvIntent[agentId];
      changed = true;
    }
  }

  const normalizedAgentCliEnv = Object.keys(nextAgentCliEnv).length > 0 ? nextAgentCliEnv : undefined;
  const normalizedIntent = nextAgentCliEnvIntent && Object.keys(nextAgentCliEnvIntent).length > 0
    ? nextAgentCliEnvIntent
    : undefined;

  if (
    !changed &&
    normalizedAgentCliEnv === prefs.agentCliEnv &&
    normalizedIntent === prefs.agentCliEnvIntent
  ) {
    return prefs;
  }

  const next = { ...prefs };
  if (normalizedAgentCliEnv) {
    next.agentCliEnv = normalizedAgentCliEnv;
  } else {
    delete next.agentCliEnv;
  }
  if (normalizedIntent) {
    next.agentCliEnvIntent = normalizedIntent;
  } else {
    delete next.agentCliEnvIntent;
  }
  return next;
}

function normalizeRetiredAgentPrefs(prefs: AppConfigPrefs): AppConfigPrefs {
  let changed = false;
  let next = prefs;

  if (typeof next.agentId === 'string' && RETIRED_AGENT_IDS.has(next.agentId)) {
    next = { ...next };
    delete next.agentId;
    changed = true;
  }

  if (next.agentModels) {
    let nextAgentModels = next.agentModels;
    for (const agentId of RETIRED_AGENT_IDS) {
      if (!Object.prototype.hasOwnProperty.call(nextAgentModels, agentId)) continue;
      if (nextAgentModels === next.agentModels) nextAgentModels = { ...next.agentModels };
      delete nextAgentModels[agentId];
      changed = true;
    }
    const normalizedAgentModels = Object.keys(nextAgentModels).length > 0 ? nextAgentModels : undefined;
    if (normalizedAgentModels !== next.agentModels) {
      next = next === prefs ? { ...next } : next;
      if (normalizedAgentModels) {
        next.agentModels = normalizedAgentModels;
      } else {
        delete next.agentModels;
      }
    }
  }

  return changed ? next : prefs;
}

function inferAgentCliEnvIntentForExplicitEnvWrite(prefs: AppConfigPrefs): AppConfigPrefs {
  if (!prefs.agentCliEnv) return prefs;
  let nextAgentCliEnvIntent = prefs.agentCliEnvIntent;
  let changed = false;

  for (const [agentId, keys] of AGENT_CLI_AUTH_ENV_KEYS) {
    const env = prefs.agentCliEnv[agentId];
    if (!env) continue;
    const hasBaseUrl = Object.keys(env).some((key) => keys.baseUrl.has(key));
    if (hasBaseUrl) continue;
    const hasAuthKey = Object.keys(env).some((key) => keys.auth.has(key));
    if (!hasAuthKey) continue;
    if (nextAgentCliEnvIntent?.[agentId]?.apiKeyOverride === true) continue;
    nextAgentCliEnvIntent = {
      ...(nextAgentCliEnvIntent ?? {}),
      [agentId]: { apiKeyOverride: true },
    };
    changed = true;
  }

  if (!changed || !nextAgentCliEnvIntent) return prefs;
  return { ...prefs, agentCliEnvIntent: nextAgentCliEnvIntent };
}

// A NUL byte truncates an argv element and every other C0/DEL character is
// noise no real executable path carries, so a stored editor command containing
// one is dropped rather than persisted.
const EDITOR_COMMAND_CONTROL_CHARS_RE = /[\u0000-\u001f\u007f]/;

// The stored editor choice is an id plus, for the user-added `custom` entry,
// the absolute executable to spawn. Deliberately narrow: no argument template,
// no working directory, no environment. The daemon builds the argument vector
// itself (see external-editors.ts), so a stored value can never smuggle in a
// flag or a second command — it is a path, and paths are data.
export function validateExternalEditor(raw: unknown): ExternalEditorPrefs | null | undefined {
  if (raw === null) return null;
  if (raw === undefined) return undefined;
  if (typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const value = raw as Record<string, unknown>;
  const id = typeof value.id === 'string' ? value.id.trim() : '';
  if (!id || id.length > 64) return undefined;
  const rawCommand = typeof value.command === 'string' ? value.command.trim() : '';
  // A NUL byte truncates an argv element, and a control character in a stored
  // path is never a real executable — reject rather than persist either.
  //
  // Absoluteness is checked here for the same reason `assertEditorPathArg`
  // checks it on the argument vector, and it matters more here: this is the one
  // string in the request that BECOMES the spawned binary. Nothing downstream
  // re-checks it — `resolveCustomEntry` hands it to a bare `stat` — so a stored
  // `tools/mine` or `code` would resolve against the daemon's own working
  // directory and then be spawned. A relative value is dropped rather than
  // persisted, which for `id === 'custom'` falls into the "no usable
  // executable" branch below.
  const command = rawCommand
    && !EDITOR_COMMAND_CONTROL_CHARS_RE.test(rawCommand)
    && path.isAbsolute(rawCommand)
    ? rawCommand
    : '';
  // `custom` without a usable executable is not a choice, it is a broken one.
  if (id === 'custom' && !command) return undefined;
  const rawLabel = typeof value.label === 'string' ? value.label.trim() : '';
  const label = rawLabel.slice(0, 120);
  return {
    id,
    ...(command ? { command } : {}),
    ...(label ? { label } : {}),
    ...(typeof value.supportsFolders === 'boolean'
      ? { supportsFolders: value.supportsFolders }
      : {}),
  };
}

const APP_LOGO_PRESETS = new Set(['material', 'warm', 'monochrome', 'outline']);
const APP_LOGO_FITS = new Set(['contain', 'cover', 'fill']);
const APP_LOGO_BACKGROUND_RE = /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/iu;
const APP_LOGO_DATA_URL_MAX = 2 * 1024 * 1024 * 2;
const APP_LOGO_VARIANTS = new Set(['favicon', 'toolbar', 'titlebar', 'sidebar', 'installer']);
const APP_LOGO_VARIANT_DIMS: Readonly<Record<string, readonly [number, number]>> = { favicon: [16, 16], toolbar: [32, 32], titlebar: [48, 48], sidebar: [128, 128], installer: [256, 256] };
const APP_LOGO_KEYS = new Set(['schemaVersion', 'presetId', 'custom', 'fit', 'crop', 'focalPoint', 'background', 'safeArea', 'rainbowSpeedLevel', 'schedules']);
const APP_LOGO_PATCH_KEYS = new Set(['presetId', 'fit', 'background', 'safeArea', 'rainbowSpeedLevel', 'crop', 'focalPoint']);
const APP_LOGO_CUSTOM_KEYS = new Set(['dataUrl', 'mimeType', 'byteLength', 'width', 'height', 'hasAlpha', 'frameCount', 'sourceMimeType', 'sourceHasAlpha', 'losses', 'renderFingerprint', 'variants']);

function finiteFraction(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function decodePngDataUrl(value: unknown, maxBytes: number): Buffer | undefined {
  if (typeof value !== 'string' || !value.startsWith('data:image/png;base64,')) return undefined;
  const encoded = value.slice('data:image/png;base64,'.length);
  if (!encoded || encoded.length > maxBytes * 2 || !/^[A-Za-z0-9+/]*={0,2}$/u.test(encoded)) return undefined;
  try {
    const bytes = Buffer.from(encoded, 'base64');
    if (bytes.length < 33 || bytes.length > maxBytes
      || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47
      || bytes[4] !== 0x0d || bytes[5] !== 0x0a || bytes[6] !== 0x1a || bytes[7] !== 0x0a
      || bytes.subarray(12, 16).toString('ascii') !== 'IHDR') return undefined;
    return bytes;
  } catch {
    return undefined;
  }
}

/** Keep the durable daemon copy schema-safe and bounded for settings history. */
function validateAppLogoPrefs(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  if (Object.keys(raw).some((key) => !APP_LOGO_KEYS.has(key))) return undefined;
  if (raw.schemaVersion !== 1 || typeof raw.presetId !== 'string' || !APP_LOGO_PRESETS.has(raw.presetId)
    || typeof raw.fit !== 'string' || !APP_LOGO_FITS.has(raw.fit)
    || (raw.background !== 'transparent' && raw.background !== 'rainbow' && (typeof raw.background !== 'string' || !APP_LOGO_BACKGROUND_RE.test(raw.background)))
    || typeof raw.safeArea !== 'boolean' || typeof raw.rainbowSpeedLevel !== 'number' || !Number.isInteger(raw.rainbowSpeedLevel) || raw.rainbowSpeedLevel < 1 || raw.rainbowSpeedLevel > 5) return undefined;
  const crop = raw.crop;
  if (!crop || typeof crop !== 'object' || Array.isArray(crop)) return undefined;
  const cropRecord = crop as Record<string, unknown>;
  if (![cropRecord.x, cropRecord.y, cropRecord.width, cropRecord.height].every(finiteFraction)) return undefined;
  const focal = raw.focalPoint;
  if (!focal || typeof focal !== 'object' || Array.isArray(focal)) return undefined;
  const focalRecord = focal as Record<string, unknown>;
  if (!finiteFraction(focalRecord.x) || !finiteFraction(focalRecord.y)) return undefined;
  if (!Array.isArray(raw.schedules) || raw.schedules.length > 12) return undefined;
  for (const schedule of raw.schedules) {
    if (!schedule || typeof schedule !== 'object' || Array.isArray(schedule)) return undefined;
    const entry = schedule as Record<string, unknown>;
    if (typeof entry.id !== 'string' || entry.id.length === 0 || entry.id.length > 80
      || typeof entry.label !== 'string' || entry.label.length === 0 || entry.label.length > 120
      || typeof entry.startAt !== 'string' || entry.startAt.length > 32
      || typeof entry.endAt !== 'string' || entry.endAt.length > 32
      || typeof entry.enabled !== 'boolean'
      || typeof entry.timezone !== 'string' || entry.timezone.length === 0 || entry.timezone.length > 80
      || !Array.isArray(entry.weekdays) || entry.weekdays.length === 0 || entry.weekdays.length > 7
      || entry.weekdays.some((day) => !Number.isInteger(day) || (day as number) < 0 || (day as number) > 6)
      || !entry.patch || typeof entry.patch !== 'object' || Array.isArray(entry.patch)) return undefined;
    const patch = entry.patch as Record<string, unknown>;
    if (Object.keys(patch).some((key) => !APP_LOGO_PATCH_KEYS.has(key))) return undefined;
    if (patch.presetId !== undefined && (typeof patch.presetId !== 'string' || !APP_LOGO_PRESETS.has(patch.presetId))) return undefined;
    if (patch.fit !== undefined && (typeof patch.fit !== 'string' || !APP_LOGO_FITS.has(patch.fit))) return undefined;
    if (patch.background !== undefined && patch.background !== 'transparent' && patch.background !== 'rainbow' && (typeof patch.background !== 'string' || !APP_LOGO_BACKGROUND_RE.test(patch.background))) return undefined;
    if (patch.safeArea !== undefined && typeof patch.safeArea !== 'boolean') return undefined;
    if (patch.rainbowSpeedLevel !== undefined && (typeof patch.rainbowSpeedLevel !== 'number' || !Number.isInteger(patch.rainbowSpeedLevel) || patch.rainbowSpeedLevel < 1 || patch.rainbowSpeedLevel > 5)) return undefined;
    const patchCrop = patch.crop as Record<string, unknown> | undefined;
    if (patch.crop !== undefined && (!patchCrop || Array.isArray(patchCrop) || ![patchCrop.x, patchCrop.y, patchCrop.width, patchCrop.height].every(finiteFraction))) return undefined;
    const patchFocal = patch.focalPoint as Record<string, unknown> | undefined;
    if (patch.focalPoint !== undefined && (!patchFocal || Array.isArray(patchFocal) || !finiteFraction(patchFocal.x) || !finiteFraction(patchFocal.y))) return undefined;
  }
  if (raw.custom !== null) {
    if (!raw.custom || typeof raw.custom !== 'object' || Array.isArray(raw.custom)) return undefined;
    const custom = raw.custom as Record<string, unknown>;
    if (Object.keys(custom).some((key) => !APP_LOGO_CUSTOM_KEYS.has(key))) return undefined;
    const customBytes = decodePngDataUrl(custom.dataUrl, 2 * 1024 * 1024);
    if (custom.mimeType !== 'image/png' || typeof custom.dataUrl !== 'string' || !customBytes
      || custom.dataUrl.length > APP_LOGO_DATA_URL_MAX
      || typeof custom.byteLength !== 'number' || custom.byteLength < 1 || custom.byteLength > 2 * 1024 * 1024) return undefined;
    if (!Number.isInteger(custom.width) || !Number.isInteger(custom.height) || (custom.width as number) < 1 || (custom.height as number) < 1
      || (custom.width as number) > 4096 || (custom.height as number) > 4096
      || typeof custom.hasAlpha !== 'boolean' || custom.frameCount !== 1
      || (custom.sourceMimeType !== undefined && (custom.sourceMimeType !== 'image/png' && custom.sourceMimeType !== 'image/jpeg' && custom.sourceMimeType !== 'image/webp'))
      || (custom.sourceHasAlpha !== undefined && typeof custom.sourceHasAlpha !== 'boolean')
      || (custom.renderFingerprint !== undefined && (typeof custom.renderFingerprint !== 'string' || custom.renderFingerprint.length > 256))
      || (custom.losses !== undefined && (!Array.isArray(custom.losses) || custom.losses.some((loss) => !['format', 'metadata', 'profile', 'crop', 'transparency'].includes(String(loss))))) return undefined;
    if (custom.variants !== undefined) {
      if (!custom.variants || typeof custom.variants !== 'object' || Array.isArray(custom.variants)) return undefined;
      const variants = custom.variants as Record<string, unknown>;
      if (Object.keys(variants).some((key) => !APP_LOGO_VARIANTS.has(key))) return undefined;
      let aggregateBytes = custom.byteLength as number;
      for (const target of APP_LOGO_VARIANTS) {
        const candidate = variants[target];
        if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return undefined;
        const asset = candidate as Record<string, unknown>;
        const variantBytes = decodePngDataUrl(asset.dataUrl, 2 * 1024 * 1024);
        if (typeof asset.dataUrl !== 'string' || !variantBytes || asset.dataUrl.length > APP_LOGO_DATA_URL_MAX || typeof asset.byteLength !== 'number'
          || asset.byteLength < 1 || asset.byteLength > 2 * 1024 * 1024 || asset.frameCount !== 1
          || typeof asset.width !== 'number' || typeof asset.height !== 'number' || typeof asset.hasAlpha !== 'boolean'
          || asset.width !== APP_LOGO_VARIANT_DIMS[target][0] || asset.height !== APP_LOGO_VARIANT_DIMS[target][1]) return undefined;
        aggregateBytes += asset.byteLength as number;
      }
      if (aggregateBytes > 8 * 1024 * 1024) return undefined;
    }
  }
  try {
    const serialized = JSON.stringify(raw);
    if (!serialized || serialized.length > 12 * 1024 * 1024) return undefined;
  } catch {
    return undefined;
  }
  return raw;
}

function applyConfigValue(
  target: Record<string, unknown>,
  key: keyof AppConfigPrefs,
  value: unknown,
): void {
  if (key === 'onboardingCompleted') {
    if (typeof value === 'boolean') target[key] = value;
    return;
  }
  if (key === 'agentId' || key === 'skillId' || key === 'designSystemId') {
    if (typeof value === 'string' || value === null) target[key] = value;
    return;
  }
  if (key === 'agentModels') {
    const validated = validateAgentModels(value);
    if (validated !== undefined) {
      target[key] = validated;
    } else {
      delete target[key];
    }
  }
  if (key === 'agentCliEnv') {
    const validated = validateAgentCliEnv(value);
    if (validated !== undefined) {
      target[key] = validated;
    } else {
      delete target[key];
    }
  }
  if (key === 'agentCliEnvIntent') {
    const validated = validateAgentCliEnvIntent(value);
    if (validated !== undefined) {
      target[key] = validated;
    } else {
      delete target[key];
    }
  }
  if (key === 'disabledSkills' || key === 'disabledDesignSystems') {
    if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
      target[key] = value;
    } else {
      delete target[key];
    }
  }
  if (key === 'installationId') {
    if (typeof value === 'string' || value === null) target[key] = value;
    return;
  }
  if (key === 'telemetry') {
    const validated = validateTelemetry(value);
    if (validated !== undefined) {
      target[key] = validated;
    } else {
      delete target[key];
    }
  }
  if (key === 'privacyDecisionAt') {
    if (
      value === null ||
      (typeof value === 'number' && Number.isFinite(value) && value >= 0)
    ) {
      target[key] = value;
    } else {
      delete target[key];
    }
    return;
  }
  if (key === 'allowSilentUpdates') {
    if (typeof value === 'boolean') {
      target[key] = value;
    } else {
      delete target[key];
    }
    return;
  }
  if (key === 'orbit') {
    const validated = validateOrbit(value);
    if (validated !== undefined) {
      const existingOrbit = target[key] as OrbitConfigPrefs | undefined;
      if (
        value
        && typeof value === 'object'
        && !Array.isArray(value)
        && !Object.hasOwn(value, 'workspaceScope')
        && existingOrbit?.workspaceScope
      ) {
        // Older clients do not know this field. Editing Orbit time/enabled
        // must not silently convert an already-scoped unattended automation
        // back into an ambient/unbound one. An explicit null still clears it.
        validated.workspaceScope = existingOrbit.workspaceScope;
      }
      target[key] = validated;
    } else {
      delete target[key];
    }
  }
  if (key === 'customInstructions') {
    if (typeof value === 'string') {
      target[key] = value.slice(0, 5000);
    } else if (value === null) {
      target[key] = value;
    }
    return;
  }
  if (key === 'projectLocations') {
    const validated = validateProjectLocations(value);
    if (validated !== undefined) {
      target[key] = validated;
    } else {
      delete target[key];
    }
    return;
  }
  if (key === 'defaultProjectLocationId') {
    if (typeof value === 'string') {
      target[key] = normalizeLocationId(value, 'default');
    } else if (value === null) {
      target[key] = null;
    } else {
      delete target[key];
    }
    return;
  }
  if (key === 'recentLinkedDirs') {
    if (Array.isArray(value)) {
      // Keep non-empty strings, trim, de-dupe preserving most-recent-first
      // order, and cap the list. Path existence/safety is enforced later by
      // validateLinkedDirs when the dir is actually attached to a project, so
      // a folder that was since deleted simply drops out at use time rather
      // than corrupting the whole config write here.
      const seen = new Set<string>();
      const cleaned: string[] = [];
      for (const entry of value) {
        if (typeof entry !== 'string') continue;
        const trimmed = entry.trim();
        if (!trimmed || seen.has(trimmed)) continue;
        seen.add(trimmed);
        cleaned.push(trimmed);
        if (cleaned.length >= RECENT_LINKED_DIRS_MAX) break;
      }
      target[key] = cleaned;
    } else {
      delete target[key];
    }
    return;
  }
  if (key === 'externalEditor') {
    const validated = validateExternalEditor(value);
    // `null` is the user clearing their choice, which must persist as an
    // explicit null so the daemon goes back to auto-picking rather than
    // rereading a stale id. `undefined` is a value that failed validation —
    // drop it instead of writing something the open route cannot launch.
    if (validated === undefined) {
      delete target[key];
    } else {
      target[key] = validated;
    }
    return;
  }
  if (key === 'appLogo') {
    const validated = validateAppLogoPrefs(value);
    if (validated !== undefined) target[key] = validated;
    else delete target[key];
    return;
  }
}

function filterAllowedKeys(obj: Record<string, unknown>): AppConfigPrefs {
  const result: Record<string, unknown> = Object.create(null);
  for (const key of Object.keys(obj)) {
    if (ALLOWED_KEYS.has(key as keyof AppConfigPrefs)) {
      applyConfigValue(result, key as keyof AppConfigPrefs, obj[key]);
    }
  }
  return normalizeRetiredAgentPrefs(normalizeAgentCliEnvPrefs(result as AppConfigPrefs));
}

// Fill in telemetry defaults when the saved config has no `telemetry`
// field at all (fresh install, pre-disclosure). `metrics` / `content`
// default to true so onboarding-funnel events emit from the first
// render — without these defaults the gate at
// `analytics.ts` (`if (cfg.telemetry?.metrics !== true) return`)
// dropped every event a user fired before the post-onboarding
// disclosure modal had a chance to set them. An EXPLICIT `false`
// the user previously saved is preserved (only `undefined` gets
// the new default), so opt-out users stay opted out across the
// 0.7.x → 0.8.0 upgrade.
function applyTelemetryDefaults(prefs: AppConfigPrefs): AppConfigPrefs {
  if (prefs.telemetry === undefined) {
    return {
      ...prefs,
      telemetry: { metrics: true, content: true },
    };
  }
  return prefs;
}

export async function readAppConfig(dataDir: string): Promise<AppConfigPrefs> {
  const base = await readAppConfigFileOnly(dataDir);
  // Channel-root installation file is the new authoritative source for the
  // identity bits that must survive a namespace-scoped data-dir wipe. It
  // lives outside `<namespace>/data/` so a reinstall of the same channel
  // (which might churn the namespace token, or eventually clear per-
  // namespace data) keeps the same id.
  //
  // Migration: when this daemon is the first to boot with installation.json
  // support and finds an existing installationId in the legacy app-config
  // path, mirror it forward exactly once so PostHog continues to see the
  // same person across the 0.7.x → 0.8.0 upgrade. Without this mirror, the
  // user count would double when 0.8.0 ships.
  const installationDir = resolveInstallationDir(dataDir);
  const installation = await readInstallationFile(installationDir);
  if (typeof installation.installationId === 'string' && installation.installationId.length > 0) {
    return applyTelemetryDefaults({ ...base, installationId: installation.installationId });
  }
  if (typeof base.installationId === 'string' && base.installationId.length > 0) {
    // Best-effort migration. A write failure here doesn't break the read —
    // we still serve the legacy id. The next write through writeAppConfig
    // will retry the mirror.
    try {
      await writeInstallationFile(installationDir, { installationId: base.installationId });
    } catch {
      // swallow — observability beats correctness on this path
    }
  }
  return applyTelemetryDefaults(base);
}

// Synchronous mirror of readAppConfig for callers that cannot await — e.g.
// building the spawn env for the vela CLI inside the synchronous
// spawnEnvForAgent. It reuses the exact same parsing, validation and telemetry
// defaulting as the async path, so the consent decision and installationId can
// never drift from what the rest of the daemon (and the web analytics config)
// sees. The only intentional difference is that it skips the best-effort
// legacy→channel-root migration *write*, which is a side effect rather than
// part of the read result.
export function readAppConfigSync(dataDir: string): AppConfigPrefs {
  const base = readAppConfigFileOnlySync(dataDir);
  const installation = readInstallationFileSync(resolveInstallationDir(dataDir));
  if (
    typeof installation.installationId === 'string' &&
    installation.installationId.length > 0
  ) {
    return applyTelemetryDefaults({
      ...base,
      installationId: installation.installationId,
    });
  }
  return applyTelemetryDefaults(base);
}

function readAppConfigFileOnlySync(dataDir: string): AppConfigPrefs {
  try {
    const parsed: unknown = JSON.parse(
      readFileSync(configFile(dataDir), 'utf8'),
    );
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return filterAllowedKeys(parsed as Record<string, unknown>);
    }
    return {};
  } catch (err: unknown) {
    const e = err as { code?: string; name?: string };
    if (e.code === 'ENOENT') return {};
    if (e.name === 'SyntaxError') return {};
    throw err;
  }
}

async function readAppConfigFileOnly(dataDir: string): Promise<AppConfigPrefs> {
  try {
    const raw = await readFile(configFile(dataDir), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return filterAllowedKeys(parsed as Record<string, unknown>);
    }
    console.warn('[app-config] Invalid shape in config file, returning empty');
    return {};
  } catch (err: unknown) {
    const e = err as { code?: string; name?: string; message?: string };
    if (e.code === 'ENOENT') return {};
    if (e.name === 'SyntaxError') {
      console.error('[app-config] Corrupted JSON, returning empty:', e.message);
      return {};
    }
    throw err;
  }
}

// Serialize concurrent writes to the same dataDir so the read-modify-write
// cycle doesn't lose updates when two PUT requests overlap.
const writeLocks = new Map<string, Promise<unknown>>();

export async function writeAppConfig(
  dataDir: string,
  partial: Record<string, unknown>,
): Promise<AppConfigPrefs> {
  const prev = writeLocks.get(dataDir) ?? Promise.resolve();
  const task = prev.catch(() => {}).then(() => doWrite(dataDir, partial));
  writeLocks.set(dataDir, task);
  try {
    return await task;
  } finally {
    if (writeLocks.get(dataDir) === task) writeLocks.delete(dataDir);
  }
}

async function doWrite(
  dataDir: string,
  partial: Record<string, unknown>,
): Promise<AppConfigPrefs> {
  const existing = await readAppConfig(dataDir);
  const next: Record<string, unknown> = { ...existing };
  for (const key of Object.keys(partial)) {
    if (!ALLOWED_KEYS.has(key as keyof AppConfigPrefs)) continue;
    applyConfigValue(next, key as keyof AppConfigPrefs, partial[key]);
  }
  const nextWithInferredIntent = Object.prototype.hasOwnProperty.call(partial, 'agentCliEnv')
    ? inferAgentCliEnvIntentForExplicitEnvWrite(next as AppConfigPrefs)
    : next as AppConfigPrefs;
  const normalizedNext = normalizeAgentCliEnvPrefs(nextWithInferredIntent);
  const normalizedNextWithoutRetiredAgents = normalizeRetiredAgentPrefs(normalizedNext);
  const file = configFile(dataDir);
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = file + '.' + randomBytes(4).toString('hex') + '.tmp';
  await writeFile(tmp, JSON.stringify(normalizedNextWithoutRetiredAgents, null, 2), 'utf8');
  await rename(tmp, file);
  const installationIdWasExplicitlyReset = Object.prototype.hasOwnProperty.call(partial, 'installationId')
    && (partial.installationId == null || (
      typeof existing.installationId === 'string'
      && typeof normalizedNextWithoutRetiredAgents.installationId === 'string'
      && existing.installationId !== normalizedNextWithoutRetiredAgents.installationId
    ));
  const metricsWereExplicitlyDisabled = isMetricsExplicitlyDisabled(partial.telemetry);
  const shouldClearAttribution = installationIdWasExplicitlyReset || metricsWereExplicitlyDisabled;
  // Mirror the identity bits to the channel-root installation file so they
  // survive a namespace-scoped data-dir wipe. Only fires when the caller
  // explicitly touches installation identity or consent lifecycle state
  // (avoiding noisy writes on every unrelated app-config update). A write
  // failure here doesn't roll back the app-config write — the next read
  // merges them transparently.
  if (Object.prototype.hasOwnProperty.call(partial, 'installationId') || shouldClearAttribution) {
    const id = normalizedNextWithoutRetiredAgents.installationId;
    // Caller explicitly touched installationId — mirror the outcome
    // (including the clear case) to installation.json so a future read
    // doesn't keep serving the old value out of the channel-root file.
    // "Delete my data" relies on this clear path.
    const installPatch: InstallationFilePatch = {
      ...(Object.prototype.hasOwnProperty.call(partial, 'installationId')
        ? { installationId: typeof id === 'string' && id.length > 0 ? id : null }
        : {}),
      ...(shouldClearAttribution
        ? {
            pendingAttribution: null,
            attributionClaimedAt: null,
            attributionClaimResultAt: null,
          }
        : {}),
    };
    try {
      await writeInstallationFile(resolveInstallationDir(dataDir), installPatch);
    } catch {
      // swallow — install file mirroring is best-effort; the canonical
      // app-config write already succeeded.
    }
  }
  return normalizedNextWithoutRetiredAgents;
}

function isMetricsExplicitlyDisabled(value: unknown): boolean {
  return value != null
    && typeof value === 'object'
    && !Array.isArray(value)
    && (value as Record<string, unknown>).metrics === false;
}

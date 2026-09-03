/**
 * Shared local settings contract.
 *
 * This module is intentionally independent of AppConfig. These values belong
 * to every surface, so keeping them in a versioned local record lets multiple
 * app windows observe one state without teaching the product configuration
 * object about presentation-only preferences. Secrets are never represented,
 * only the fact that the host vault has a configured record.
 */
import { getOpenDesignHost } from '@open-design/host';

/**
 * Optional host seams are structural here on purpose. The desktop host adds
 * these methods in its own lane, while the web package must remain buildable
 * against older hosts that do not expose them yet. Keeping the narrow
 * boundary here gives later mounting code one stable feature-detected API
 * without editing the shared host protocol from this lane.
 */
export interface UniversalSettingsHostBridge {
  read(): Promise<{ ok: true; state: unknown } | { ok: false; code: string }>;
  write(state: UniversalSettingsState, expectedRevision: number): Promise<{ ok: true; state: unknown } | { ok: false; code: string }>;
  subscribe(listener: (state: unknown) => void): () => void;
  resolveSchedule(request: { source: 'api'; url: string } | { source: 'homeAssistant'; baseUrl: string; entity: string }): Promise<
    | { ok: true; values: Record<string, unknown>; observedAt: number; sourceState: 'on' | 'off' | 'local' }
    | { ok: false; code: string }
  >;
  setHomeAssistantToken(value: string): Promise<{ ok: true } | { ok: false; code: string }>;
  clearHomeAssistantToken(): Promise<{ ok: true } | { ok: false; code: string }>;
}

export interface UniversalStatusHubReport {
  sessionId: string;
  project: string;
  state: 'running' | 'waiting' | 'blocked' | 'failed' | 'verified' | 'unavailable';
  summary: string;
  evidence: readonly { label: string; url: string | null; verified: boolean }[];
  sourceRevision: string | null;
  updatedAt: number;
}

export interface UniversalStatusHubBridge {
  register(report: UniversalStatusHubReport): Promise<
    | { ok: true; delivery: 'hub' | 'local-fallback'; noDeliveryReason: string | null }
    | { ok: false; code: string }
  >;
  report(report: UniversalStatusHubReport): Promise<
    | { ok: true; report: UniversalStatusHubReport }
    | { ok: false; code: string }
  >;
  heartbeat(sessionId: string, updatedAt: number): Promise<
    | { ok: true; report: UniversalStatusHubReport }
    | { ok: false; code: string }
  >;
  read(sessionId: string): Promise<
    | { ok: true; report: UniversalStatusHubReport }
    | { ok: false; code: string }
  >;
}

type UniversalHostSurface = {
  universalSettings?: UniversalSettingsHostBridge;
  statusHub?: UniversalStatusHubBridge;
};

export function getUniversalHostSurface(): UniversalHostSurface | null {
  return getOpenDesignHost() as unknown as UniversalHostSurface | null;
}

export function getUniversalSettingsHost(): UniversalSettingsHostBridge | null {
  return getUniversalHostSurface()?.universalSettings ?? null;
}

export function getUniversalStatusHub(): UniversalStatusHubBridge | null {
  return getUniversalHostSurface()?.statusHub ?? null;
}

export const UNIVERSAL_SETTINGS_SCHEMA_VERSION = 1 as const;
export const UNIVERSAL_SETTINGS_STORAGE_KEY = 'material-designer:universal-settings:v1';
export const UNIVERSAL_SETTINGS_EVENT = 'material-designer:universal-settings-changed';
export const UNIVERSAL_SURFACE_SEARCH_INVENTORY = Object.freeze([
  'language', 'school', 'narrator', 'schedule', 'adhd', 'notifications', 'status',
  'narrator-language-picker', 'english-voice-picker', 'cantonese-voice-picker',
  'schedule-source-picker', 'notification-list',
] as const);

export const UNIVERSAL_SETTINGS_CENTRAL_HANDOFF_INVENTORY = Object.freeze([
  { id: 'settings-panel', path: 'design/apps/web/src/components/SettingsDialog.tsx', status: 'mounted' },
  { id: 'shell-runtime', path: 'design/apps/web/src/App.tsx', status: 'mounted' },
  { id: 'command-palette', path: 'design/apps/web/src/components/command-palette/CommandPalette.tsx', status: 'pending-c0' },
  { id: 'notification-center', path: 'design/apps/web/src/components/notifications/NotificationCenter.tsx', status: 'mounted' },
  { id: 'school-consumers', path: 'design/apps/web/src/components/school-mode-consumers.ts', status: 'pending-c0' },
  { id: 'desktop-host-bridge', path: 'design/apps/desktop/src/main/preload.cts', status: 'pending-c0' },
  { id: 'desktop-host-runtime', path: 'design/apps/desktop/src/main/runtime.ts', status: 'pending-c0' },
  { id: 'page-registration', path: 'site/assets/js/canonical-feature-suite.js', status: 'mounted' },
  { id: 'page-markup', path: 'site/index.html', status: 'mounted' },
] as const);

export type UniversalLanguageMode = 'english' | 'cantonese' | 'bilingual';
export type UniversalNarratorLanguage = 'english' | 'cantonese' | 'both';
export type UniversalAdhdMode = 'focus' | 'lowStimulation' | 'timeAwareness' | 'oneThing' | 'momentum';
export type UniversalScheduleSource = 'local' | 'api' | 'homeAssistant';
export type UniversalNotificationTone = 'info' | 'success' | 'warning' | 'error';

export interface UniversalNotification {
  id: string;
  title: string;
  body: string;
  tone: UniversalNotificationTone;
  createdAt: number;
  read: boolean;
}

export interface UniversalScheduleRule {
  id: string;
  label: string;
  enabled: boolean;
  priority: number;
  startDate: string | null;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  weekdays: 'all' | number[];
  source: UniversalScheduleSource;
  sourceUrl: string | null;
  sourceBaseUrl: string | null;
  sourceEntity: string | null;
  values: Partial<Pick<UniversalSettingsState, 'languageMode' | 'theme' | 'density' | 'accentColor' | 'uiFontFamily'>>;
}

export interface UniversalNarratorSettings {
  enabled: boolean;
  language: UniversalNarratorLanguage;
  englishVoiceId: string | null;
  cantoneseVoiceId: string | null;
  rate: number;
  pitch: number;
  quiet: boolean;
}

export interface UniversalSchoolSettings {
  enabled: boolean;
  name: string;
  credentialConfigured: boolean;
  credentialBackend: 'host-vault' | 'browser-local' | 'unavailable';
}

export interface UniversalSettingsState {
  schemaVersion: typeof UNIVERSAL_SETTINGS_SCHEMA_VERSION;
  languageMode: UniversalLanguageMode;
  funnyEnglish: 1 | 2 | 3 | 4 | 5;
  funnyCantonese: 1 | 2 | 3 | 4 | 5;
  showDialogEmoji: boolean;
  school: UniversalSchoolSettings;
  displayName: string;
  theme: 'light' | 'dark' | 'system';
  density: 'comfortable' | 'compact' | 'spacious';
  accentColor: string;
  uiFontFamily: string;
  narrator: UniversalNarratorSettings;
  schedules: UniversalScheduleRule[];
  adhd: Record<UniversalAdhdMode, boolean>;
  nextAction: string;
  momentumSnoozedUntil: number;
  notifications: UniversalNotification[];
  revision: number;
  updatedAt: number;
}

export interface UniversalStatusCard {
  id: string;
  title: string;
  state: 'verified' | 'running' | 'unrun' | 'failed' | 'blocked';
  detail: string;
  evidenceUrl?: string;
}

export const UNIVERSAL_ADHD_MODES: readonly UniversalAdhdMode[] = [
  'focus',
  'lowStimulation',
  'timeAwareness',
  'oneThing',
  'momentum',
];

export const UNIVERSAL_SCHEDULE_DAYS = [0, 1, 2, 3, 4, 5, 6] as const;

const MAX_SETTINGS_KEYS = 64;
const MAX_SETTINGS_SERIALIZED_BYTES = 512 * 1024;
const MAX_SCHEDULE_KEYS = 24;
const MAX_NOTIFICATION_KEYS = 8;
const TOP_LEVEL_KEYS = new Set([
  'schemaVersion', 'languageMode', 'funnyEnglish', 'funnyCantonese',
  'showDialogEmoji', 'school', 'displayName', 'theme', 'density',
  'accentColor', 'uiFontFamily', 'narrator', 'schedules', 'adhd',
  'nextAction', 'momentumSnoozedUntil', 'notifications', 'revision', 'updatedAt',
]);
const SCHOOL_KEYS = new Set(['enabled', 'name', 'credentialConfigured', 'credentialBackend']);
const NARRATOR_KEYS = new Set([
  'enabled', 'language', 'englishVoiceId', 'cantoneseVoiceId', 'rate', 'pitch', 'quiet',
]);
const SCHEDULE_KEYS = new Set([
  'id', 'label', 'enabled', 'priority', 'startDate', 'endDate', 'startTime',
  'endTime', 'weekdays', 'source', 'sourceUrl', 'sourceBaseUrl', 'sourceEntity', 'values',
]);
const SCHEDULE_VALUE_KEYS = new Set(['languageMode', 'theme', 'density', 'accentColor', 'uiFontFamily']);
const NOTIFICATION_KEYS = new Set(['id', 'title', 'body', 'tone', 'createdAt', 'read']);
const ADHD_KEYS = new Set(['focus', 'lowStimulation', 'timeAwareness', 'oneThing', 'momentum']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>, maxKeys: number): boolean {
  const keys = Object.keys(value);
  return keys.length <= maxKeys && keys.every((key) => allowed.has(key));
}

function isSafeString(value: unknown, max: number): value is string {
  return typeof value === 'string'
    && value.length <= max
    && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value);
}

function clampLevel(value: unknown, fallback: 1 | 2 | 3 | 4 | 5): 1 | 2 | 3 | 4 | 5 {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5
    ? value as 1 | 2 | 3 | 4 | 5
    : fallback;
}

function boundedString(value: unknown, fallback: string, max = 160): string {
  return isSafeString(value, max) ? value : fallback;
}

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validTime(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) return false;
  const [hours = Number.NaN, minutes = Number.NaN] = value.split(':').map(Number);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

function validHex(value: unknown): value is string {
  return typeof value === 'string' && /^(?:#[0-9a-f]{6}|#[0-9a-f]{8})$/i.test(value);
}

function validScheduleUrl(value: unknown): value is string {
  if (!isSafeString(value, 500)) return false;
  try {
    const url = new URL(value);
    if (url.username || url.password || url.hash) return false;
    return url.protocol === 'https:' && url.hostname.length > 0;
  } catch {
    return false;
  }
}

export type UniversalScheduleSourceRequest =
  | { source: 'api'; url: string }
  | { source: 'homeAssistant'; baseUrl: string; entity: string };

export function scheduleSourceRequest(rule: UniversalScheduleRule): UniversalScheduleSourceRequest | null {
  if (validateScheduleRule(rule)) return null;
  return rule.source === 'api'
    ? { source: 'api', url: rule.sourceUrl! }
    : rule.source === 'homeAssistant'
      ? { source: 'homeAssistant', baseUrl: rule.sourceBaseUrl!, entity: rule.sourceEntity! }
      : null;
}

function validVoiceId(value: unknown): value is string | null {
  return value === null || isSafeString(value, 240);
}

function freshId(prefix: string): string {
  const uuid = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${uuid}`;
}

export function createDefaultUniversalSettings(): UniversalSettingsState {
  return {
    schemaVersion: UNIVERSAL_SETTINGS_SCHEMA_VERSION,
    languageMode: 'english',
    // Level 1 is the neutral base dictionary, and the same default
    // `DEFAULT_FUNNY_LEVELS` in `i18n/index.tsx` states: copy the user has
    // not opted into reads plainly. These defaulted to 5, and
    // `UniversalSettingsRuntime` pushes them into i18n on every boot, so a
    // fresh install persisted level 5 and shipped the playful voice to
    // everyone — "Back to base" where the product means Home.
    funnyEnglish: 1,
    funnyCantonese: 1,
    showDialogEmoji: false,
    school: {
      enabled: false,
      name: 'School mode',
      credentialConfigured: false,
      credentialBackend: 'unavailable',
    },
    displayName: 'Material Designer',
    theme: 'system',
    density: 'comfortable',
    accentColor: '#6750A4',
    uiFontFamily: 'system-ui',
    narrator: {
      enabled: false,
      language: 'both',
      englishVoiceId: null,
      cantoneseVoiceId: null,
      rate: 1,
      pitch: 1,
      quiet: false,
    },
    schedules: [],
    adhd: {
      focus: false,
      lowStimulation: false,
      timeAwareness: false,
      oneThing: false,
      momentum: false,
    },
    nextAction: '',
    momentumSnoozedUntil: 0,
    notifications: [],
    revision: 0,
    updatedAt: 0,
  };
}

function normalizeSchedule(value: unknown, index: number): UniversalScheduleRule | null {
  if (!isRecord(value)) return null;
  if (!hasOnlyKeys(value, SCHEDULE_KEYS, MAX_SCHEDULE_KEYS)) return null;
  const weekdaysValue = value.weekdays;
  const weekdays = weekdaysValue === 'all'
    ? 'all'
    : Array.isArray(weekdaysValue)
      ? [...new Set(weekdaysValue.filter((day): day is number =>
        typeof day === 'number' && Number.isInteger(day) && day >= 0 && day <= 6))]
      : null;
  if (weekdays === null) return null;
  const startDate = value.startDate == null ? null : validDate(value.startDate) ? value.startDate : null;
  const endDate = value.endDate == null ? null : validDate(value.endDate) ? value.endDate : null;
  const startTime = value.startTime == null ? null : validTime(value.startTime) ? value.startTime : null;
  const endTime = value.endTime == null ? null : validTime(value.endTime) ? value.endTime : null;
  if ((value.startDate != null && startDate === null)
    || (value.endDate != null && endDate === null)
    || (value.startTime != null && startTime === null)
    || (value.endTime != null && endTime === null)) return null;
  if (startDate && endDate && startDate > endDate) return null;
  if (!startTime || !endTime) return null;
  const source = value.source === 'api' || value.source === 'homeAssistant' ? value.source : 'local';
  const values = isRecord(value.values) ? value.values : {};
  if (!hasOnlyKeys(values, SCHEDULE_VALUE_KEYS, SCHEDULE_VALUE_KEYS.size)) return null;
  if (values.languageMode !== undefined && values.languageMode !== 'english' && values.languageMode !== 'cantonese' && values.languageMode !== 'bilingual') return null;
  if (values.theme !== undefined && values.theme !== 'light' && values.theme !== 'dark' && values.theme !== 'system') return null;
  if (values.density !== undefined && values.density !== 'comfortable' && values.density !== 'compact' && values.density !== 'spacious') return null;
  if (values.accentColor !== undefined && !validHex(values.accentColor)) return null;
  if (values.uiFontFamily !== undefined && !isSafeString(values.uiFontFamily, 160)) return null;
  const safeValues: UniversalScheduleRule['values'] = {};
  if (values.languageMode === 'english' || values.languageMode === 'cantonese' || values.languageMode === 'bilingual') {
    safeValues.languageMode = values.languageMode;
  }
  if (values.theme === 'light' || values.theme === 'dark' || values.theme === 'system') safeValues.theme = values.theme;
  if (values.density === 'comfortable' || values.density === 'compact' || values.density === 'spacious') safeValues.density = values.density;
  if (validHex(values.accentColor)) safeValues.accentColor = values.accentColor;
  if (typeof values.uiFontFamily === 'string' && values.uiFontFamily.length <= 160) safeValues.uiFontFamily = values.uiFontFamily;
  return {
    id: boundedString(value.id, `rule-${index}`, 96),
    label: boundedString(value.label, `Schedule ${index + 1}`),
    enabled: value.enabled !== false,
    priority: typeof value.priority === 'number' && Number.isFinite(value.priority)
      ? Math.max(-1000, Math.min(1000, Math.trunc(value.priority)))
      : 0,
    startDate,
    endDate,
    startTime,
    endTime,
    weekdays,
    source,
    sourceUrl: source === 'api' ? boundedString(value.sourceUrl, '', 500) || null : null,
    sourceBaseUrl: source === 'homeAssistant' ? boundedString(value.sourceBaseUrl, '', 500) || null : null,
    sourceEntity: source === 'homeAssistant' ? boundedString(value.sourceEntity, '', 160) || null : null,
    values: safeValues,
  };
}

function normalizeNotification(value: unknown, index: number): UniversalNotification | null {
  if (!isRecord(value)) return null;
  if (!hasOnlyKeys(value, NOTIFICATION_KEYS, MAX_NOTIFICATION_KEYS)) return null;
  if (value.tone !== 'info' && value.tone !== 'success' && value.tone !== 'warning' && value.tone !== 'error') return null;
  const tone = value.tone === 'success' || value.tone === 'warning' || value.tone === 'error'
    ? value.tone
    : 'info';
  const createdAt = typeof value.createdAt === 'number' && Number.isFinite(value.createdAt)
    ? value.createdAt
    : 0;
  return {
    id: boundedString(value.id, `notification-${index}`, 96),
    title: boundedString(value.title, 'Notification', 240),
    body: boundedString(value.body, '', 1000),
    tone,
    createdAt,
    read: value.read === true,
  };
}

/** Validate and normalize the complete record before it reaches the renderer. */
export function normalizeUniversalSettings(value: unknown): UniversalSettingsState {
  const defaults = createDefaultUniversalSettings();
  if (!isRecord(value) || value.schemaVersion !== UNIVERSAL_SETTINGS_SCHEMA_VERSION) return defaults;
  if (!hasOnlyKeys(value, TOP_LEVEL_KEYS, MAX_SETTINGS_KEYS)) return defaults;
  const narrator = isRecord(value.narrator) ? value.narrator : {};
  const school = isRecord(value.school) ? value.school : {};
  const adhd = isRecord(value.adhd) ? value.adhd : {};
  if (isRecord(value.narrator) && !hasOnlyKeys(narrator, NARRATOR_KEYS, NARRATOR_KEYS.size)) return defaults;
  if (isRecord(value.school) && !hasOnlyKeys(school, SCHOOL_KEYS, SCHOOL_KEYS.size)) return defaults;
  if (isRecord(value.adhd) && !hasOnlyKeys(adhd, ADHD_KEYS, ADHD_KEYS.size)) return defaults;
  const schedules = Array.isArray(value.schedules)
    ? value.schedules.map(normalizeSchedule).filter((item): item is UniversalScheduleRule => item !== null).slice(0, 100)
    : [];
  const notifications = Array.isArray(value.notifications)
    ? value.notifications.map(normalizeNotification).filter((item): item is UniversalNotification => item !== null).slice(0, 500)
    : [];
  return {
    ...defaults,
    languageMode: value.languageMode === 'cantonese' || value.languageMode === 'bilingual' ? value.languageMode : defaults.languageMode,
    funnyEnglish: clampLevel(value.funnyEnglish, defaults.funnyEnglish),
    funnyCantonese: clampLevel(value.funnyCantonese, defaults.funnyCantonese),
    showDialogEmoji: value.showDialogEmoji === true,
    school: {
      enabled: school.enabled === true,
      name: boundedString(school.name, defaults.school.name, 80).trim() || defaults.school.name,
      credentialConfigured: school.credentialConfigured === true,
      credentialBackend: school.credentialBackend === 'host-vault' || school.credentialBackend === 'browser-local'
        ? school.credentialBackend
        : 'unavailable',
    },
    displayName: boundedString(value.displayName, defaults.displayName, 120).trim() || defaults.displayName,
    theme: value.theme === 'light' || value.theme === 'dark' ? value.theme : defaults.theme,
    density: value.density === 'compact' || value.density === 'spacious' ? value.density : defaults.density,
    accentColor: validHex(value.accentColor) ? value.accentColor : defaults.accentColor,
    uiFontFamily: boundedString(value.uiFontFamily, defaults.uiFontFamily, 160),
    narrator: {
      enabled: narrator.enabled === true,
      language: narrator.language === 'english' || narrator.language === 'cantonese' ? narrator.language : 'both',
      englishVoiceId: validVoiceId(narrator.englishVoiceId) ? narrator.englishVoiceId : null,
      cantoneseVoiceId: validVoiceId(narrator.cantoneseVoiceId) ? narrator.cantoneseVoiceId : null,
      rate: typeof narrator.rate === 'number' && Number.isFinite(narrator.rate) ? Math.max(0.1, Math.min(10, narrator.rate)) : 1,
      pitch: typeof narrator.pitch === 'number' && Number.isFinite(narrator.pitch) ? Math.max(0, Math.min(2, narrator.pitch)) : 1,
      quiet: narrator.quiet === true,
    },
    schedules,
    adhd: {
      focus: adhd.focus === true,
      lowStimulation: adhd.lowStimulation === true,
      timeAwareness: adhd.timeAwareness === true,
      oneThing: adhd.oneThing === true,
      momentum: adhd.momentum === true,
    },
    nextAction: boundedString(value.nextAction, '', 240),
    momentumSnoozedUntil: typeof value.momentumSnoozedUntil === 'number' && Number.isFinite(value.momentumSnoozedUntil) && value.momentumSnoozedUntil >= 0
      ? value.momentumSnoozedUntil
      : 0,
    notifications,
    revision: typeof value.revision === 'number' && Number.isSafeInteger(value.revision) && value.revision >= 0
      ? value.revision
      : 0,
    updatedAt: typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt) && value.updatedAt >= 0
      ? value.updatedAt
      : 0,
  };
}

export function readUniversalSettings(storage: Pick<Storage, 'getItem'> | null =
  typeof window === 'undefined' ? null : window.localStorage): UniversalSettingsState {
  if (!storage) return createDefaultUniversalSettings();
  try {
    const raw = storage.getItem(UNIVERSAL_SETTINGS_STORAGE_KEY);
    if (raw && raw.length > MAX_SETTINGS_SERIALIZED_BYTES) return createDefaultUniversalSettings();
    return raw ? normalizeUniversalSettings(JSON.parse(raw)) : createDefaultUniversalSettings();
  } catch {
    return createDefaultUniversalSettings();
  }
}

export function writeUniversalSettings(
  next: UniversalSettingsState,
  storage: Pick<Storage, 'setItem'> | null = typeof window === 'undefined' ? null : window.localStorage,
): UniversalSettingsState {
  const normalized = normalizeUniversalSettings({
    ...next,
    revision: next.revision + 1,
    updatedAt: Date.now(),
  });
  if (storage) {
    try { storage.setItem(UNIVERSAL_SETTINGS_STORAGE_KEY, JSON.stringify(normalized)); } catch { /* storage is best effort */ }
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(UNIVERSAL_SETTINGS_EVENT, { detail: normalized }));
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const channel = new BroadcastChannel(UNIVERSAL_SETTINGS_EVENT);
        channel.postMessage(normalized);
        channel.close();
      }
    } catch { /* BroadcastChannel can be unavailable in private contexts */ }
  }
  return normalized;
}

/** Write-through used by rich controls such as the command palette. The host
 * record is authoritative on desktop; browser surfaces retain the local
 * record. A serialized queue prevents two palette clicks from reusing one
 * revision and silently dropping the first change. */
let hostWriteQueue: Promise<unknown> = Promise.resolve();
export function writeUniversalSettingsPatch(patch: Partial<UniversalSettingsState>): void {
  const bridge = getUniversalSettingsHost();
  if (!bridge) {
    writeUniversalSettings({ ...readUniversalSettings(), ...patch });
    return;
  }
  hostWriteQueue = hostWriteQueue.catch(() => undefined).then(async () => {
    const currentResult = await bridge.read();
    if (!currentResult.ok) return;
    const current = normalizeUniversalSettings(currentResult.state);
    const mergedPatch = patch.narrator
      ? { ...patch, narrator: { ...current.narrator, ...patch.narrator } }
      : patch;
    const next = normalizeUniversalSettings({ ...current, ...mergedPatch, revision: current.revision + 1, updatedAt: Date.now() });
    const result = await bridge.write(next, current.revision);
    if (!result.ok) return;
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(UNIVERSAL_SETTINGS_EVENT, { detail: normalizeUniversalSettings(result.state) }));
  });
}

export function subscribeUniversalSettings(listener: (state: UniversalSettingsState) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const apply = (value: unknown): void => listener(normalizeUniversalSettings(value));
  const onCustomEvent = (event: Event): void => apply((event as CustomEvent).detail);
  const onStorage = (event: StorageEvent): void => {
    if (event.key !== UNIVERSAL_SETTINGS_STORAGE_KEY || !event.newValue) return;
    try { apply(JSON.parse(event.newValue)); } catch { /* invalid state is ignored */ }
  };
  let channel: BroadcastChannel | null = null;
  const onBroadcast = (event: MessageEvent): void => apply(event.data);
  window.addEventListener(UNIVERSAL_SETTINGS_EVENT, onCustomEvent);
  window.addEventListener('storage', onStorage);
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel(UNIVERSAL_SETTINGS_EVENT);
      channel.addEventListener('message', onBroadcast);
    }
  } catch { channel = null; }
  return () => {
    window.removeEventListener(UNIVERSAL_SETTINGS_EVENT, onCustomEvent);
    window.removeEventListener('storage', onStorage);
    channel?.removeEventListener('message', onBroadcast);
    channel?.close();
  };
}

export function resetUniversalSettings(): UniversalSettingsState {
  return writeUniversalSettings(createDefaultUniversalSettings());
}

export function validateScheduleRule(rule: UniversalScheduleRule): string | null {
  if (!rule.id || !rule.label) return 'A schedule needs an id and label.';
  if (!validTime(rule.startTime) || !validTime(rule.endTime)) return 'Start and end times must use HH:mm.';
  if (rule.startDate && !validDate(rule.startDate)) return 'The start date is invalid.';
  if (rule.endDate && !validDate(rule.endDate)) return 'The end date is invalid.';
  if (rule.startDate && rule.endDate && rule.startDate > rule.endDate) return 'The date range is reversed.';
  if (rule.weekdays !== 'all' && (rule.weekdays.length === 0 || rule.weekdays.some((day) => !UNIVERSAL_SCHEDULE_DAYS.includes(day as 0 | 1 | 2 | 3 | 4 | 5 | 6)))) {
    return 'Choose at least one weekday.';
  }
  if (rule.source === 'api' && !validScheduleUrl(rule.sourceUrl)) return 'API schedules require an HTTPS URL.';
  if (rule.source === 'homeAssistant' && (!validScheduleUrl(rule.sourceBaseUrl) || !rule.sourceEntity || !/^(?:binary_sensor|input_boolean)\.[a-z0-9_]+$/i.test(rule.sourceEntity))) {
    return 'Home Assistant schedules require an HTTPS base URL and a boolean entity.';
  }
  return null;
}

function dateOnly(value: Date): string {
  return `${String(value.getFullYear()).padStart(4, '0')}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function timeOnly(value: Date): string {
  return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
}

export function scheduleRuleMatches(rule: UniversalScheduleRule, date: Date): boolean {
  if (!rule.enabled || validateScheduleRule(rule)) return false;
  const currentTime = timeOnly(date);
  const previous = new Date(date);
  previous.setDate(previous.getDate() - 1);
  return scheduleWallClockMatches(rule, {
    date: dateOnly(date),
    previousDate: dateOnly(previous),
    day: date.getDay(),
    previousDay: (date.getDay() + 6) % 7,
    time: currentTime,
  });
}

export interface ScheduleWallClock {
  date: string;
  previousDate: string;
  day: number;
  previousDay: number;
  time: string;
}

/**
 * Resolve a local wall-clock tuple independently from Date's DST conversion.
 * A spring-forward gap is represented by the platform's normalized local
 * instant, while both fall-back instants carry the same wall-clock tuple and
 * therefore receive the same schedule result.
 */
export function scheduleWallClockMatches(rule: UniversalScheduleRule, clock: ScheduleWallClock): boolean {
  if (!rule.enabled || validateScheduleRule(rule)) return false;
  const currentTime = clock.time;
  const overnight = Boolean(rule.startTime && rule.endTime && rule.startTime > rule.endTime);
  const inWindow = overnight
    ? currentTime >= rule.startTime! || currentTime <= rule.endTime!
    : currentTime >= rule.startTime! && currentTime <= rule.endTime!;
  // Equal start and end values are a one-minute wall-clock instant, not an
  // all-day rule. Date getters intentionally use the configured local zone,
  // so DST gaps follow the platform's normalized local instant and both
  // repeated fall-back instants share the same matching wall-clock window.
  if (!inWindow) return false;

  // For a cross-midnight rule, the after-midnight portion belongs to the
  // previous calendar day. This keeps a Monday 22:00–02:00 rule from
  // unexpectedly activating on every Tuesday when Tuesday was not selected.
  const startsOnCurrentDay = !overnight || currentTime >= rule.startTime!;
  const scheduleDay = startsOnCurrentDay ? clock.day : clock.previousDay;
  if (rule.weekdays !== 'all' && !rule.weekdays.includes(scheduleDay)) return false;
  const scheduleDate = startsOnCurrentDay ? clock.date : clock.previousDate;
  if (rule.startDate && scheduleDate < rule.startDate) return false;
  if (rule.endDate && scheduleDate > rule.endDate) return false;
  return true;
}

export function resolveScheduledSettings(
  base: UniversalSettingsState,
  rules: readonly UniversalScheduleRule[],
  date = new Date(),
): UniversalSettingsState {
  const matching = rules.filter((rule) => scheduleRuleMatches(rule, date)).sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
  return matching.reduce<UniversalSettingsState>((state, rule) => ({ ...state, ...rule.values }), base);
}

export function createScheduleRule(overrides: Partial<UniversalScheduleRule> = {}): UniversalScheduleRule {
  return {
    id: freshId('schedule'),
    label: 'New local schedule',
    enabled: true,
    priority: 0,
    startDate: null,
    endDate: null,
    startTime: '09:00',
    endTime: '17:00',
    weekdays: 'all',
    source: 'local',
    sourceUrl: null,
    sourceBaseUrl: null,
    sourceEntity: null,
    values: { theme: 'system' },
    ...overrides,
  };
}

export function appendNotification(
  state: UniversalSettingsState,
  notification: Omit<UniversalNotification, 'id' | 'createdAt' | 'read'>,
): UniversalSettingsState {
  return {
    ...state,
    notifications: [
      { ...notification, id: freshId('notice'), createdAt: Date.now(), read: false },
      ...state.notifications,
    ].slice(0, 500),
  };
}

export function bulkReadNotifications(
  state: UniversalSettingsState,
  ids: ReadonlySet<string>,
): UniversalSettingsState {
  return {
    ...state,
    notifications: state.notifications.map((item) => ids.has(item.id) ? { ...item, read: true } : item),
  };
}

export function narrationParts(text: { english: string; cantonese: string }, language: UniversalNarratorLanguage): string[] {
  if (language === 'english') return [text.english];
  if (language === 'cantonese') return [text.cantonese];
  return [text.english, text.cantonese];
}

export function narratorLanguageOrder(language: UniversalNarratorLanguage): ('english' | 'cantonese')[] {
  if (language === 'english') return ['english'];
  if (language === 'cantonese') return ['cantonese'];
  return ['english', 'cantonese'];
}

export function chooseVoiceId(voices: readonly SpeechSynthesisVoice[], language: 'english' | 'cantonese', preferred: string | null): string | null {
  const expected = language === 'english' ? /^en(?:-|$)/i : /^(?:zh-(?:HK|Hant)|yue)(?:-|$)/i;
  const match = preferred ? voices.find((voice) => voice.voiceURI === preferred && expected.test(voice.lang)) : undefined;
  if (match) return match.voiceURI;
  return voices.find((voice) => expected.test(voice.lang))?.voiceURI ?? null;
}

export function createStatusCards(version: string | null, updatedAt: string | null, mountedAcknowledged = false): UniversalStatusCard[] {
  const provenanceState = version && updatedAt ? 'verified' : 'unrun';
  return [
    {
      id: 'provenance',
      title: 'Build provenance',
      state: provenanceState,
      detail: version && updatedAt ? `${version}, updated ${updatedAt}` : 'Version and updated-at provenance are unavailable.',
    },
    {
      id: 'settings',
      title: 'Universal settings contract',
      state: mountedAcknowledged ? 'running' : 'unrun',
      detail: mountedAcknowledged
        ? 'Shared local state, live propagation, persistence, and reset paths are mounted in this surface.'
        : 'Universal settings are source-ready but await an explicit shell mount acknowledgement.',
    },
    {
      id: 'evidence',
      title: 'Built-artifact evidence',
      state: 'unrun',
      detail: 'Headless drive and per-action capture evidence remain pending for the current candidate.',
    },
  ];
}

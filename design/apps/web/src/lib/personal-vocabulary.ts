import { getOpenDesignHost } from '@open-design/host';

/**
 * Local-only personal vocabulary loader.
 *
 * This module deliberately knows only the neutral file contract. It never
 * ships a vocabulary value, reads a bundled vocabulary, or sends a payload
 * anywhere. Callers must opt into the private UI boundary explicitly; all
 * other boundaries return their original text unchanged.
 */

export const PERSONAL_VOCABULARY_SCHEMA_VERSION = 1 as const;
export const PERSONAL_VOCABULARY_MAX_BYTES = 256 * 1024;
export const PERSONAL_VOCABULARY_MAX_ENTRIES = 2048;
export const PERSONAL_VOCABULARY_MAX_KEY_LENGTH = 128;
export const PERSONAL_VOCABULARY_MAX_VALUE_LENGTH = 256;
export const PERSONAL_VOCABULARY_MAX_DEPTH = 4;
export const PERSONAL_VOCABULARY_STORAGE_KEY = 'open-design:personal-vocabulary:v1';
export const PERSONAL_VOCABULARY_EVENT = 'open-design:personal-vocabulary-changed';
export const PERSONAL_VOCABULARY_SCHOOL_MODE_KEY = 'material-designer:universal-settings:v1';
export const PERSONAL_VOCABULARY_SCHOOL_MODE_EVENT = 'material-designer:universal-settings-changed';
export const PERSONAL_VOCABULARY_C1_EVENT = 'material-designer:personal-vocabulary-c1-changed';
export const PERSONAL_VOCABULARY_HISTORY_KEY = 'open-design:personal-vocabulary-history:v1';
export const PERSONAL_VOCABULARY_MATCH_NORMALIZATION = 'none' as const;

/**
 * C1 is the only boundary this feature uses to observe the shared School
 * setting. The implementation can inject the canonical settings adapter at
 * startup, while the local browser adapter keeps the standalone page usable.
 * The vocabulary loader does not import or own the universal-settings store.
 */
export interface PersonalVocabularyC1 {
  /** Null means the canonical host has not answered yet and must fail closed. */
  readonly readSchoolMode: () => boolean | null;
  readonly subscribeSchoolMode: (listener: (enabled: boolean) => void) => () => void;
}

export interface PersonalVocabularyPayload {
  readonly schemaVersion: typeof PERSONAL_VOCABULARY_SCHEMA_VERSION;
  readonly entries: Readonly<Record<string, string>>;
}

export type PersonalVocabularyLoadResult =
  | { readonly ok: true; readonly payload: PersonalVocabularyPayload }
  | { readonly ok: false; readonly code: PersonalVocabularyErrorCode; readonly message: string };

export type PersonalVocabularyErrorCode =
  | 'too-large'
  | 'malformed-json'
  | 'duplicate-key'
  | 'unsupported-schema'
  | 'unexpected-field'
  | 'unsafe-key'
  | 'invalid-shape'
  | 'too-deep'
  | 'too-many-entries'
  | 'entry-too-long'
  | 'factual-key'
  | 'non-string-entry';

export type PersonalVocabularyMutationResult =
  | { readonly ok: true; readonly action: 'loaded' | 'replaced' | 'cleared'; readonly historyRecorded: true }
  | { readonly ok: false; readonly code: 'storage-unavailable' | 'write-failed' | 'readback-mismatch' | 'history-failed'; readonly message: string };

export interface PersonalVocabularyHistoryEvent {
  readonly schemaVersion: typeof PERSONAL_VOCABULARY_SCHEMA_VERSION;
  readonly action: 'loaded' | 'replaced' | 'cleared' | 'deleted';
  readonly at: number;
}

export interface PersonalVocabularyStateSnapshot {
  readonly payload: PersonalVocabularyPayload | null;
  readonly history: readonly PersonalVocabularyHistoryEvent[];
  readonly historyRaw: string | null;
}

const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const FACTUAL_KEY_PATTERN = /\p{Number}/u;
const PRIVATE_UI_BOUNDARY = 'private-ui' as const;
const PRIVATE_UI_TRANSLATION_KEYS = new Set([
  'nav.settings',
  'nav.about',
  'settings.general',
  'settings.generalHint',
  'settings.appearance',
  'settings.appearanceHint',
  'settings.language',
  'settings.languageHint',
  'settings.languageHint',
  'settings.notifications',
  'settings.notificationsHint',
  'settings.privacy',
  'settings.privacyHint',
  'settings.about',
  'settings.aboutHint',
  'settings.languageModeTitle',
  'settings.languageModeHint',
  'personalVocabulary.title',
  'personalVocabulary.description',
]);

function fail(code: PersonalVocabularyErrorCode, message: string): PersonalVocabularyLoadResult {
  return { ok: false, code, message };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * A small JSON structural scanner. JSON.parse discards duplicate keys, so a
 * schema check after parsing cannot detect the duplicate-key input the
 * contract explicitly rejects. The scanner parses strings and nested values
 * without retaining any private data beyond the current key.
 */
function hasDuplicateKeys(source: string): boolean {
  let index = 0;
  const whitespace = (char: string) => char === ' ' || char === '\n' || char === '\r' || char === '\t';

  const skipWhitespace = () => {
    while (index < source.length && whitespace(source[index] ?? '')) index += 1;
  };

  const parseString = (): string => {
    const start = index;
    if (source[index] !== '"') throw new Error('string');
    index += 1;
    while (index < source.length) {
      const char = source[index];
      if (char === undefined) throw new Error('unterminated');
      if (char === '\\') {
        index += 2;
        continue;
      }
      if (char === '"') {
        index += 1;
        return JSON.parse(source.slice(start, index)) as string;
      }
      if (char < ' ') throw new Error('control');
      index += 1;
    }
    throw new Error('unterminated');
  };

  const parseValue = (depth: number): void => {
    if (depth > PERSONAL_VOCABULARY_MAX_DEPTH) throw new Error('depth');
    skipWhitespace();
    const char = source[index];
    if (char === '{') {
      index += 1;
      skipWhitespace();
      const keys = new Set<string>();
      if (source[index] === '}') {
        index += 1;
        return;
      }
      while (index < source.length) {
        skipWhitespace();
        const key = parseString();
        if (keys.has(key)) throw new Error('duplicate');
        keys.add(key);
        skipWhitespace();
        if (source[index] !== ':') throw new Error('colon');
        index += 1;
        parseValue(depth + 1);
        skipWhitespace();
        if (source[index] === '}') {
          index += 1;
          return;
        }
        if (source[index] !== ',') throw new Error('comma');
        index += 1;
      }
      throw new Error('object');
    }
    if (char === '[') {
      index += 1;
      skipWhitespace();
      if (source[index] === ']') {
        index += 1;
        return;
      }
      while (index < source.length) {
        parseValue(depth + 1);
        skipWhitespace();
        if (source[index] === ']') {
          index += 1;
          return;
        }
        if (source[index] !== ',') throw new Error('comma');
        index += 1;
      }
      throw new Error('array');
    }
    if (char === '"') {
      parseString();
      return;
    }
    if (source.startsWith('true', index)) {
      index += 4;
      return;
    }
    if (source.startsWith('false', index)) {
      index += 5;
      return;
    }
    if (source.startsWith('null', index)) {
      index += 4;
      return;
    }
    const number = source.slice(index).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u);
    if (number?.[0]) {
      index += number[0].length;
      return;
    }
    throw new Error('value');
  };

  parseValue(0);
  skipWhitespace();
  return index !== source.length;
}

function parseWithoutDuplicateKeys(source: string): unknown | PersonalVocabularyLoadResult {
  try {
    if (hasDuplicateKeys(source)) return fail('malformed-json', 'The file contains trailing data.');
  } catch (error) {
    const reason = error instanceof Error ? error.message : '';
    if (reason === 'duplicate') return fail('duplicate-key', 'Duplicate object keys are not accepted.');
    if (reason === 'depth') return fail('too-deep', 'The file exceeds the supported nesting depth.');
    return fail('malformed-json', 'The file is not valid JSON.');
  }
  try {
    return JSON.parse(source) as unknown;
  } catch {
    return fail('malformed-json', 'The file is not valid JSON.');
  }
}

export function validatePersonalVocabularyText(source: string): PersonalVocabularyLoadResult {
  const bytes = new TextEncoder().encode(source).byteLength;
  if (bytes > PERSONAL_VOCABULARY_MAX_BYTES) {
    return fail('too-large', `The file exceeds the ${PERSONAL_VOCABULARY_MAX_BYTES}-byte limit.`);
  }
  const parsed = parseWithoutDuplicateKeys(source);
  if (isPersonalVocabularyFailure(parsed)) return parsed;
  if (!isPlainObject(parsed)) return fail('invalid-shape', 'The top-level value must be an object.');
  const keys = Object.keys(parsed);
  if (keys.some((key) => UNSAFE_KEYS.has(key))) return fail('unsafe-key', 'Unsafe object keys are not accepted.');
  if (keys.some((key) => key !== 'schemaVersion' && key !== 'entries')) {
    return fail('unexpected-field', 'Only schemaVersion and entries are accepted.');
  }
  if (parsed.schemaVersion !== PERSONAL_VOCABULARY_SCHEMA_VERSION) {
    return fail('unsupported-schema', 'This vocabulary schema version is not supported.');
  }
  if (!isPlainObject(parsed.entries)) return fail('invalid-shape', 'entries must be an object.');
  const entryKeys = Object.keys(parsed.entries);
  if (entryKeys.length > PERSONAL_VOCABULARY_MAX_ENTRIES) {
    return fail('too-many-entries', `The file exceeds the ${PERSONAL_VOCABULARY_MAX_ENTRIES}-entry limit.`);
  }
  const entries: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const key of entryKeys) {
    const value = parsed.entries[key];
    if (UNSAFE_KEYS.has(key)) return fail('unsafe-key', 'Unsafe object keys are not accepted.');
    if (FACTUAL_KEY_PATTERN.test(key)) return fail('factual-key', 'Keys containing numeric facts are not accepted.');
    if (typeof value !== 'string') return fail('non-string-entry', 'Every entry replacement must be a string.');
    if (hasForbiddenUnicode(key)) return fail('invalid-shape', 'Keys cannot contain control, format, bidi, or unpaired-surrogate characters.');
    if (hasForbiddenUnicode(value)) return fail('invalid-shape', 'Replacements cannot contain control, format, bidi, or unpaired-surrogate characters.');
    if (key.length === 0 || key.length > PERSONAL_VOCABULARY_MAX_KEY_LENGTH || typeof value !== 'string') {
      return typeof value === 'string'
        ? fail('entry-too-long', 'An entry key exceeds its length limit or is empty.')
        : fail('non-string-entry', 'Every entry replacement must be a string.');
    }
    if (value.length === 0 || value.length > PERSONAL_VOCABULARY_MAX_VALUE_LENGTH) {
      return fail('entry-too-long', 'An entry replacement exceeds its length limit or is empty.');
    }
    entries[key] = value;
  }
  return { ok: true, payload: { schemaVersion: PERSONAL_VOCABULARY_SCHEMA_VERSION, entries } };
}

function isPersonalVocabularyFailure(value: unknown): value is Extract<PersonalVocabularyLoadResult, { readonly ok: false }> {
  return isPlainObject(value) && value.ok === false && typeof value.code === 'string';
}

function hasForbiddenUnicode(value: string): boolean {
  for (let index = 0; index < value.length;) {
    const codePoint = value.codePointAt(index);
    if (codePoint === undefined) return true;
    if (codePoint >= 0xd800 && codePoint <= 0xdfff) return true;
    const character = String.fromCodePoint(codePoint);
    if (/\p{Cc}|\p{Cf}/u.test(character)) return true;
    index += codePoint > 0xffff ? 2 : 1;
  }
  return false;
}

export function validatePersonalVocabularyBytes(bytes: Uint8Array): PersonalVocabularyLoadResult {
  if (bytes.byteLength > PERSONAL_VOCABULARY_MAX_BYTES) {
    return fail('too-large', `The file exceeds the ${PERSONAL_VOCABULARY_MAX_BYTES}-byte limit.`);
  }
  try {
    return validatePersonalVocabularyText(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return fail('malformed-json', 'The file is not valid UTF-8 JSON.');
  }
}

export function readPersonalVocabularyCache(): PersonalVocabularyPayload | null {
  if (typeof window === 'undefined') return null;
  try {
    const source = window.localStorage.getItem(PERSONAL_VOCABULARY_STORAGE_KEY);
    if (!source) return null;
    const result = validatePersonalVocabularyText(source);
    return result.ok ? result.payload : null;
  } catch {
    return null;
  }
}

function mutationFailure(
  code: Extract<PersonalVocabularyMutationResult, { readonly ok: false }>['code'],
  message: string,
): PersonalVocabularyMutationResult {
  return { ok: false, code, message };
}

function readHistory(): PersonalVocabularyHistoryEvent[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PERSONAL_VOCABULARY_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const valid = parsed.every((event): event is PersonalVocabularyHistoryEvent => (
      isPlainObject(event)
      && event.schemaVersion === PERSONAL_VOCABULARY_SCHEMA_VERSION
      && (event.action === 'loaded' || event.action === 'replaced' || event.action === 'cleared' || event.action === 'deleted')
      && typeof event.at === 'number'
      && Number.isSafeInteger(event.at)
    ));
    return valid ? parsed.slice(-64) as PersonalVocabularyHistoryEvent[] : null;
  } catch {
    return null;
  }
}

export function readPersonalVocabularyStateSnapshot(): PersonalVocabularyStateSnapshot {
  const historyRaw = typeof window === 'undefined'
    ? null
    : (() => {
        try { return window.localStorage.getItem(PERSONAL_VOCABULARY_HISTORY_KEY); } catch { return null; }
      })();
  return {
    payload: readPersonalVocabularyCache(),
    history: readHistory() ?? [],
    historyRaw,
  };
}

export function readPersonalVocabularyHistory(): readonly PersonalVocabularyHistoryEvent[] {
  return readHistory() ?? [];
}

function recordPersonalVocabularyHistory(action: PersonalVocabularyHistoryEvent['action']): boolean {
  if (typeof window === 'undefined') return false;
  const current = readHistory();
  if (current === null) return false;
  const next = [
    ...current,
    { schemaVersion: PERSONAL_VOCABULARY_SCHEMA_VERSION, action, at: Date.now() },
  ].slice(-64);
  try {
    window.localStorage.setItem(PERSONAL_VOCABULARY_HISTORY_KEY, JSON.stringify(next));
    const readBack = readHistory();
    return readBack !== null
      && readBack.length === next.length
      && readBack.at(-1)?.action === action
      && readBack.at(-1)?.at === next.at(-1)?.at;
  } catch {
    return false;
  }
}

function restoreCache(raw: string | null): boolean {
  try {
    if (raw === null) window.localStorage.removeItem(PERSONAL_VOCABULARY_STORAGE_KEY);
    else window.localStorage.setItem(PERSONAL_VOCABULARY_STORAGE_KEY, raw);
    return window.localStorage.getItem(PERSONAL_VOCABULARY_STORAGE_KEY) === raw;
  } catch {
    return false;
  }
}

function restoreStorageRaw(cacheRaw: string | null, historyRaw: string | null): boolean {
  try {
    if (cacheRaw === null) window.localStorage.removeItem(PERSONAL_VOCABULARY_STORAGE_KEY);
    else window.localStorage.setItem(PERSONAL_VOCABULARY_STORAGE_KEY, cacheRaw);
    if (historyRaw === null) window.localStorage.removeItem(PERSONAL_VOCABULARY_HISTORY_KEY);
    else window.localStorage.setItem(PERSONAL_VOCABULARY_HISTORY_KEY, historyRaw);
    return window.localStorage.getItem(PERSONAL_VOCABULARY_STORAGE_KEY) === cacheRaw
      && window.localStorage.getItem(PERSONAL_VOCABULARY_HISTORY_KEY) === historyRaw;
  } catch {
    return false;
  }
}

export function storePersonalVocabulary(payload: PersonalVocabularyPayload): PersonalVocabularyMutationResult {
  let serializedPayload: string;
  try {
    serializedPayload = JSON.stringify(payload);
  } catch {
    return mutationFailure('write-failed', 'The local cache payload could not be serialized.');
  }
  const result = validatePersonalVocabularyText(serializedPayload);
  if (!result.ok) return mutationFailure('write-failed', result.message);
  if (typeof window === 'undefined') return mutationFailure('storage-unavailable', 'Local storage is unavailable.');
  let previous: string | null = null;
  let previousHistory: string | null = null;
  let captured = false;
  let hadValidCache = false;
  try {
    previous = window.localStorage.getItem(PERSONAL_VOCABULARY_STORAGE_KEY);
    previousHistory = window.localStorage.getItem(PERSONAL_VOCABULARY_HISTORY_KEY);
    captured = true;
    hadValidCache = readPersonalVocabularyCache() !== null;
    window.localStorage.setItem(PERSONAL_VOCABULARY_STORAGE_KEY, serializedPayload);
    const readBack = window.localStorage.getItem(PERSONAL_VOCABULARY_STORAGE_KEY);
    const readBackResult = readBack ? validatePersonalVocabularyText(readBack) : null;
    if (!readBackResult?.ok || JSON.stringify(readBackResult.payload) !== JSON.stringify(result.payload)) {
      restoreStorageRaw(previous, previousHistory);
      return mutationFailure('readback-mismatch', 'The local cache did not verify after writing.');
    }
    const action = hadValidCache ? 'replaced' : 'loaded';
    if (!recordPersonalVocabularyHistory(action)) {
      restoreStorageRaw(previous, previousHistory);
      return mutationFailure('history-failed', 'The local history event did not verify.');
    }
    window.dispatchEvent(new Event(PERSONAL_VOCABULARY_EVENT));
    return { ok: true, action, historyRecorded: true };
  } catch {
    if (captured) restoreStorageRaw(previous, previousHistory);
    return mutationFailure('storage-unavailable', 'Local storage is unavailable.');
  }
}

export function clearPersonalVocabulary(): PersonalVocabularyMutationResult {
  if (typeof window === 'undefined') return mutationFailure('storage-unavailable', 'Local storage is unavailable.');
  let previous: string | null = null;
  let previousHistory: string | null = null;
  let captured = false;
  try {
    previous = window.localStorage.getItem(PERSONAL_VOCABULARY_STORAGE_KEY);
    previousHistory = window.localStorage.getItem(PERSONAL_VOCABULARY_HISTORY_KEY);
    captured = true;
    window.localStorage.removeItem(PERSONAL_VOCABULARY_STORAGE_KEY);
    if (window.localStorage.getItem(PERSONAL_VOCABULARY_STORAGE_KEY) !== null) {
      restoreStorageRaw(previous, previousHistory);
      return mutationFailure('readback-mismatch', 'The local cache did not clear.');
    }
    if (!recordPersonalVocabularyHistory('cleared')) {
      restoreStorageRaw(previous, previousHistory);
      return mutationFailure('history-failed', 'The local history event did not verify.');
    }
    window.dispatchEvent(new Event(PERSONAL_VOCABULARY_EVENT));
    return { ok: true, action: 'cleared', historyRecorded: true };
  } catch {
    if (captured) restoreStorageRaw(previous, previousHistory);
    return mutationFailure('storage-unavailable', 'Local storage is unavailable.');
  }
}

/** Restore cache and redacted local history together after an external refusal. */
export function restorePersonalVocabularyState(snapshot: PersonalVocabularyStateSnapshot): boolean {
  if (typeof window === 'undefined') return false;
  let serializedPayload: string | null = null;
  let previousPayload: string | null = null;
  let previousHistory: string | null = null;
  let captured = false;
  try {
    if (snapshot.payload !== null) {
      const payloadResult = validatePersonalVocabularyText(JSON.stringify(snapshot.payload));
      if (!payloadResult.ok) return false;
      serializedPayload = JSON.stringify(payloadResult.payload);
    }
    const history = snapshot.history.slice(-64);
    if (!history.every((event) => (
      event.schemaVersion === PERSONAL_VOCABULARY_SCHEMA_VERSION
      && (event.action === 'loaded' || event.action === 'replaced' || event.action === 'cleared' || event.action === 'deleted')
      && Number.isSafeInteger(event.at)
    ))) return false;
    previousPayload = window.localStorage.getItem(PERSONAL_VOCABULARY_STORAGE_KEY);
    previousHistory = window.localStorage.getItem(PERSONAL_VOCABULARY_HISTORY_KEY);
    captured = true;
    if (serializedPayload === null) window.localStorage.removeItem(PERSONAL_VOCABULARY_STORAGE_KEY);
    else window.localStorage.setItem(PERSONAL_VOCABULARY_STORAGE_KEY, serializedPayload);
    if (snapshot.historyRaw === null) window.localStorage.removeItem(PERSONAL_VOCABULARY_HISTORY_KEY);
    else window.localStorage.setItem(PERSONAL_VOCABULARY_HISTORY_KEY, JSON.stringify(history));
    const restored = (serializedPayload === null
      ? window.localStorage.getItem(PERSONAL_VOCABULARY_STORAGE_KEY) === null
      : window.localStorage.getItem(PERSONAL_VOCABULARY_STORAGE_KEY) === serializedPayload)
      && (snapshot.historyRaw === null
        ? window.localStorage.getItem(PERSONAL_VOCABULARY_HISTORY_KEY) === null
        : JSON.stringify(readHistory() ?? []) === JSON.stringify(history));
    if (restored) {
      window.dispatchEvent(new Event(PERSONAL_VOCABULARY_EVENT));
      return true;
    }
    restoreStorageRaw(previousPayload, previousHistory);
    return false;
  } catch {
    if (captured) restoreStorageRaw(previousPayload, previousHistory);
    return false;
  }
}

/** Restore the previously validated cache after an external history boundary refuses a mutation. */
export function restorePersonalVocabularyCache(payload: PersonalVocabularyPayload | null): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (payload !== null) {
      const validation = validatePersonalVocabularyText(JSON.stringify(payload));
      if (!validation.ok) return false;
    }
    if (payload === null) window.localStorage.removeItem(PERSONAL_VOCABULARY_STORAGE_KEY);
    else window.localStorage.setItem(PERSONAL_VOCABULARY_STORAGE_KEY, JSON.stringify(payload));
    const restored = readPersonalVocabularyCache();
    const matches = payload === null ? restored === null : JSON.stringify(restored) === JSON.stringify(payload);
    if (matches) window.dispatchEvent(new Event(PERSONAL_VOCABULARY_EVENT));
    return matches;
  } catch {
    return false;
  }
}

type HostUniversalSettingsBridge = {
  read: () => Promise<{ ok: boolean; state?: { school?: { enabled?: boolean } } }>;
  subscribe: (listener: (state: { school?: { enabled?: boolean } }) => void) => () => void;
};

function readLocalSchoolMode(): boolean {
  if (typeof document !== 'undefined' && document.documentElement.getAttribute('data-universal-school-mode') === 'true') return true;
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.localStorage.getItem(PERSONAL_VOCABULARY_SCHOOL_MODE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return false;
    const school = (parsed as { school?: unknown }).school;
    return typeof school === 'object' && school !== null && !Array.isArray(school)
      && (school as { enabled?: unknown }).enabled === true;
  } catch {
    return false;
  }
}

const LOCAL_C1: PersonalVocabularyC1 = Object.freeze({
  readSchoolMode: readLocalSchoolMode,
  subscribeSchoolMode: (listener: (enabled: boolean) => void): (() => void) => {
    if (typeof window === 'undefined') return () => undefined;
    const notify = (enabled?: boolean) => listener(enabled ?? readLocalSchoolMode());
    const onStorage = (event: StorageEvent) => {
      if (event.key === PERSONAL_VOCABULARY_SCHOOL_MODE_KEY) notify();
    };
    const onSettingsEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ school?: { enabled?: boolean }; enabled?: boolean }>).detail;
      notify(detail && typeof detail.enabled === 'boolean'
        ? detail.enabled
        : detail?.school?.enabled === true);
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(PERSONAL_VOCABULARY_SCHOOL_MODE_EVENT, onSettingsEvent);
    window.addEventListener('material-designer:universal-school-mode', onSettingsEvent);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(PERSONAL_VOCABULARY_SCHOOL_MODE_EVENT, onSettingsEvent);
      window.removeEventListener('material-designer:universal-school-mode', onSettingsEvent);
    };
  },
});

let injectedC1: PersonalVocabularyC1 | null = null;

/** Register or clear the app's canonical C1 School-mode adapter. */
export function configurePersonalVocabularyC1(adapter: PersonalVocabularyC1 | null): void {
  injectedC1 = adapter;
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(PERSONAL_VOCABULARY_C1_EVENT));
}

function hostC1(): PersonalVocabularyC1 | null {
  const host = (getOpenDesignHost() as unknown as { universalSettings?: HostUniversalSettingsBridge } | null)?.universalSettings;
  if (!host) return null;
  return {
    // The host read is asynchronous, so the synchronous read fails closed
    // until the host emits its first definite state.
    readSchoolMode: () => null,
    subscribeSchoolMode: (listener: (enabled: boolean) => void): (() => void) => {
      let active = true;
      void host.read().then((result) => {
        if (active && result.ok) listener(result.state?.school?.enabled === true);
      }).catch(() => undefined);
      const unsubscribe = host.subscribe((state) => listener(state.school?.enabled === true));
      return () => {
        active = false;
        unsubscribe();
      };
    },
  };
}

function resolveC1(adapter?: PersonalVocabularyC1): PersonalVocabularyC1 {
  return adapter ?? injectedC1 ?? hostC1() ?? LOCAL_C1;
}

export function readPersonalVocabularySchoolMode(adapter?: PersonalVocabularyC1): boolean | null {
  return resolveC1(adapter).readSchoolMode();
}

/** Observe the canonical School setting through the injected C1 boundary. */
export function subscribeToPersonalVocabularySchoolMode(
  listener: (enabled: boolean) => void,
  adapter?: PersonalVocabularyC1,
): () => void {
  const source = resolveC1(adapter);
  const unsubscribe = source.subscribeSchoolMode(listener);
  if (typeof window === 'undefined') return unsubscribe;
  const onC1Change = () => listener(resolveC1(adapter).readSchoolMode() !== false);
  window.addEventListener(PERSONAL_VOCABULARY_C1_EVENT, onC1Change);
  return () => {
    unsubscribe();
    window.removeEventListener(PERSONAL_VOCABULARY_C1_EVENT, onC1Change);
  };
}

export function isPersonalVocabularySuppressed(adapter?: PersonalVocabularyC1): boolean {
  if (typeof document !== 'undefined' && document.documentElement.getAttribute('data-universal-school-mode') === 'true') return true;
  return readPersonalVocabularySchoolMode(adapter) !== false;
}

export function subscribeToPersonalVocabulary(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const onStorage = (event: StorageEvent) => {
    if (event.key === PERSONAL_VOCABULARY_STORAGE_KEY) onChange();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(PERSONAL_VOCABULARY_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(PERSONAL_VOCABULARY_EVENT, onChange);
  };
}

/**
 * Personal replacements are intentionally restricted to the private UI text
 * boundary. Commands, links, paths, identifiers and exported or recorded
 * text must call this with another boundary and therefore remain unchanged.
 */
export function applyPersonalVocabulary(
  text: string,
  payload: PersonalVocabularyPayload | null,
  boundary: typeof PRIVATE_UI_BOUNDARY | 'technical' | 'public' = PRIVATE_UI_BOUNDARY,
): string {
  if (!payload || boundary !== PRIVATE_UI_BOUNDARY || text.length === 0) return text;
  const entries = Object.entries(payload.entries)
    .filter(([ordinary]) => ordinary.length > 0)
    .sort(([left], [right]) => right.length - left.length);
  if (entries.length === 0) return text;
  const chunks: string[] = [];
  let index = 0;
  while (index < text.length) {
    const match = entries.find(([ordinary]) => matchesAtBoundary(text, ordinary, index));
    if (match) {
      chunks.push(match[1]);
      index += match[0].length;
    } else {
      chunks.push(text[index] ?? '');
      index += 1;
    }
  }
  // Replacements are resolved in one pass. A replacement that happens to
  // contain another ordinary key must not be rewritten a second time.
  return chunks.join('');
}

const WORDISH = /[\p{Letter}\p{Mark}\p{Number}\p{Connector_Punctuation}\p{Dash_Punctuation}]/u;
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

function codePointBefore(text: string, index: number): number | undefined {
  if (index <= 0) return undefined;
  const previous = text.charCodeAt(index - 1);
  return previous >= 0xdc00 && previous <= 0xdfff && index > 1
    ? text.codePointAt(index - 2)
    : text.codePointAt(index - 1);
}

function isWordish(codePoint: number | undefined): boolean {
  return codePoint === undefined ? false : WORDISH.test(String.fromCodePoint(codePoint));
}

function isMark(codePoint: number | undefined): boolean {
  return codePoint === undefined ? false : /\p{Mark}/u.test(String.fromCodePoint(codePoint));
}

function matchesAtBoundary(text: string, ordinary: string, index: number): boolean {
  if (!text.startsWith(ordinary, index)) return false;
  const end = index + ordinary.length;
  const previous = codePointBefore(text, index);
  const next = text.codePointAt(end);
  // Never split a combining sequence, even for a CJK phrase.
  if (isMark(previous) || isMark(next)) return false;
  // CJK phrases are intentionally matched wherever they occur. Latin and
  // punctuation-word keys require non-word boundaries on both sides.
  if (CJK.test(ordinary)) return true;
  return !isWordish(previous) && !isWordish(next);
}

/** Apply replacements to a bounded, known private-UI translation key only. */
export function applyPersonalVocabularyToPrivateUiKey(
  key: string,
  text: string,
): string {
  if (!PRIVATE_UI_TRANSLATION_KEYS.has(key) || isPersonalVocabularySuppressed()) return text;
  return applyPersonalVocabulary(text, readPersonalVocabularyCache(), PRIVATE_UI_BOUNDARY);
}

export function personalVocabularyErrorMessage(result: Extract<PersonalVocabularyLoadResult, { readonly ok: false }>): string {
  return result.message;
}

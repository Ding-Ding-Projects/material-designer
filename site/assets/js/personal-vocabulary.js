/*
 * The site's local personal-wording control.
 *
 * This is a neutral, payload-free implementation of the same bounded file
 * contract used by the desktop renderer. It never contains a private mapping,
 * reads a private source file, sends a request, or writes anything outside
 * this visitor's browser storage.
 */

import * as i18n from './i18n.js';
import * as regex from './regex.js';

export const PERSONAL_VOCABULARY_SCHEMA_VERSION = 1;
export const PERSONAL_VOCABULARY_MAX_BYTES = 256 * 1024;
export const PERSONAL_VOCABULARY_MAX_ENTRIES = 2048;
export const PERSONAL_VOCABULARY_MAX_KEY_LENGTH = 128;
export const PERSONAL_VOCABULARY_MAX_VALUE_LENGTH = 256;
export const PERSONAL_VOCABULARY_MAX_DEPTH = 4;
export const PERSONAL_VOCABULARY_STORAGE_KEY = 'open-design:personal-vocabulary:v1';
export const PERSONAL_VOCABULARY_EVENT = 'open-design:personal-vocabulary-changed';
export const PERSONAL_VOCABULARY_HISTORY_KEY = 'open-design:personal-vocabulary-history:v1';
export const PERSONAL_VOCABULARY_SCHOOL_MODE_KEY = 'material-designer:universal-settings:v1';
export const PERSONAL_VOCABULARY_SCHOOL_MODE_EVENT = 'material-designer:universal-settings-changed';
export const PERSONAL_VOCABULARY_C1_EVENT = 'material-designer:personal-vocabulary-c1-changed';
export const PERSONAL_VOCABULARY_MOUNT_EVENT = 'material-designer:personal-vocabulary-mounted';
export const PERSONAL_VOCABULARY_OPEN_EVENT = 'material-designer:personal-vocabulary-open';
export const PERSONAL_VOCABULARY_SETTINGS_ID = 'personalVocabulary';
export const PERSONAL_VOCABULARY_PALETTE_ID = 'setting:personalVocabulary';
export const PERSONAL_VOCABULARY_MATCH_NORMALIZATION = 'none';
const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const FACTUAL_KEY_PATTERN = /\p{Number}/u;

let injectedC1 = null;

/** C1 is injected by the page shell; null means its canonical state is unresolved. */
export function configurePersonalVocabularyC1(adapter) {
  injectedC1 = adapter || null;
  document.dispatchEvent(new Event(PERSONAL_VOCABULARY_C1_EVENT));
}

export function openPersonalVocabulary() {
  document.dispatchEvent(new CustomEvent(PERSONAL_VOCABULARY_OPEN_EVENT, {
    detail: { id: PERSONAL_VOCABULARY_SETTINGS_ID },
  }));
}

const PAIRS = {
  title: { en: 'Personal wording', yue: 'Personal wording' },
  help: { en: 'Choose a versioned local JSON file to adapt private UI wording. The original wording stays active until a valid file is supplied.', yue: '揀一個有版本嘅本地 JSON file，改私人 UI wording。未有有效 file 之前，原本 wording 照用。' },
  disclosure: { en: 'Nothing is uploaded, networked, logged, exported, or written into history. Replacements apply only to this private UI boundary.', yue: '乜都唔會上載、出網、寫 log、匯出或者放入 history。Replacement 只會套用喺呢個私人 UI boundary。' },
  searchLabel: { en: 'Search personal wording controls', yue: '搜尋 personal wording controls' },
  searchPlaceholder: { en: 'Search this surface', yue: '搜尋呢個 surface' },
  choose: { en: 'Choose JSON file', yue: '揀 JSON file' },
  replace: { en: 'Replace file', yue: '換 file' },
  clear: { en: 'Clear and restore original wording', yue: '清除並還原原本 wording' },
  localFile: { en: 'Local JSON file', yue: '本地 JSON file' },
  onlyBoundary: { en: 'Only this private boundary applies replacements.', yue: '只係呢個私人 boundary 會套用 replacements。' },
  sample: { en: 'Sample text', yue: 'Sample text' },
  preview: { en: 'Private UI preview', yue: 'Private UI 預覽' },
  noFile: { en: 'No file loaded. Original wording is active.', yue: '未有 file，原本 wording 生效。' },
  loaded: { en: '{count} entries loaded locally.', yue: '本地載入咗 {count} 個 entries。' },
  cleared: { en: 'Cleared. Original wording is active again.', yue: '清除咗，原本 wording 再次生效。' },
  noMatches: { en: 'No matching controls on this surface.', yue: '呢個 surface 搵唔到相符 controls。' },
  valid: { en: 'Vocabulary file loaded locally.', yue: '本地 vocabulary file 載入咗。' },
  malformed: { en: 'The file is not valid UTF-8 JSON. Nothing was changed.', yue: '個 file 唔係有效 UTF-8 JSON，乜都冇改。' },
  duplicate: { en: 'Duplicate object keys are not accepted. Nothing was changed.', yue: '唔接受重複 object key，乜都冇改。' },
  schema: { en: 'This schema version is not supported. Nothing was changed.', yue: '呢個 schema version 唔支援，乜都冇改。' },
  unexpected: { en: 'The file contains an unexpected field. Nothing was changed.', yue: '個 file 有唔預期欄位，乜都冇改。' },
  unsafe: { en: 'Unsafe object keys are not accepted. Nothing was changed.', yue: '唔接受唔安全 object key，乜都冇改。' },
  shape: { en: 'The file shape is not supported. Nothing was changed.', yue: '個 file 個形狀唔支援，乜都冇改。' },
  deep: { en: 'The file is nested too deeply. Nothing was changed.', yue: '個 file 巢得太深，乜都冇改。' },
  entries: { en: 'The file has too many entries. Nothing was changed.', yue: '個 file 有太多 entries，乜都冇改。' },
  length: { en: 'An entry is empty or exceeds its length limit. Nothing was changed.', yue: '有 entry 係空白，或者超出長度上限，乜都冇改。' },
  factual: { en: 'Keys containing numeric facts are not accepted. Nothing was changed.', yue: '包含數字事實嘅 key 唔接受，乜都冇改。' },
  string: { en: 'Every replacement must be a string. Nothing was changed.', yue: '每個 replacement 都要係 string，乜都冇改。' },
  tooLarge: { en: `The file is larger than ${PERSONAL_VOCABULARY_MAX_BYTES} bytes. Nothing was changed; the previous valid cache remains active.`, yue: `個 file 大過 ${PERSONAL_VOCABULARY_MAX_BYTES} bytes，乜都冇改；上一份有效 cache 繼續生效。` },
  historyTitle: { en: 'Local change history', yue: '本地變更 history' },
  historyHelp: { en: 'Only redacted action and time are kept here. File contents and metadata never enter history.', yue: '呢度只保留 redact 咗嘅 action 同時間，file 內容同 metadata 永遠唔入 history。' },
  historySearchLabel: { en: 'Search local history', yue: '搜尋本地 history' },
  historySearchPlaceholder: { en: 'Search history', yue: '搜尋 history' },
  historyDate: { en: 'Date', yue: '日期' },
  historyDateFrom: { en: 'Date from', yue: '日期由' },
  historyDateTo: { en: 'Date to', yue: '日期到' },
  historyPreset: { en: 'Date preset', yue: '日期 preset' },
  historyAnyDate: { en: 'Any date', yue: '任何日期' },
  historyToday: { en: 'Today', yue: '今日' },
  historyLast7: { en: 'Last 7 days', yue: '最近 7 日' },
  historyPresetSearchPlaceholder: { en: 'Search date presets', yue: '搜尋日期 preset' },
  historyActionSearchLabel: { en: 'Action search', yue: '搜尋 action' },
  historyActionSearchPlaceholder: { en: 'Search actions', yue: '搜尋 actions' },
  historyAction: { en: 'Action', yue: 'Action' },
  historyAll: { en: 'All actions', yue: '所有 actions' },
  historyLoaded: { en: 'Loaded', yue: '載入' },
  historyReplaced: { en: 'Replaced', yue: '替換' },
  historyCleared: { en: 'Cleared', yue: '清除' },
  historyExport: { en: 'Export redacted history', yue: '匯出 redact 咗嘅 history' },
  historySelectAll: { en: 'Select all visible', yue: '揀晒目前顯示' },
  historyInvert: { en: 'Invert selection', yue: '反轉選取' },
  historyDelete: { en: 'Delete selected history', yue: '刪除選取嘅 history' },
  historyConfirmTitle: { en: 'Confirm history deletion', yue: '確認刪除 history' },
  historyConfirmHelp: { en: 'This removes only selected redacted history events. Enter two independent keys and complete the slider.', yue: '只會刪除選取嘅 redacted history event，輸入兩個獨立 key，再完成 slider。' },
  historyKeyOne: { en: 'First key', yue: '第一個 key' },
  historyKeyTwo: { en: 'Second key', yue: '第二個 key' },
  historyConfirmSlider: { en: 'Confirmation progress', yue: '確認進度' },
  historyCancel: { en: 'Cancel', yue: '取消' },
  historyConfirm: { en: 'Delete selected', yue: '刪除選取' },
  historyEmpty: { en: 'No history matches these filters.', yue: '呢啲 filters 搵唔到 history。' },
  historyCorrupt: { en: 'History is unavailable because its local record is malformed. Nothing was overwritten.', yue: 'History 用唔到，因為本地 record 壞咗，乜都冇覆寫。' },
};

function copy(pair) {
  const state = i18n.getState ? i18n.getState() : { mode: 'en', funny: { en: 1, yue: 1 } };
  const english = toneText(pair.en, 'en', state.funny?.en);
  const cantonese = toneText(pair.yue, 'yue', state.funny?.yue);
  if (state.mode === 'bilingual') return `${english} · ${cantonese}`;
  return state.mode === 'yue' ? cantonese : english;
}

function toneText(text, language, level) {
  const suffixes = language === 'en'
    ? ['', ' · local', ' · clear and local', ' · pleasantly local', ' · local, no cloud drama']
    : ['', ' · 本地', ' · 清楚本地', ' · 本地幾鬼馬', ' · 本地唔上雲'];
  const safeLevel = Number.isInteger(level) ? Math.min(5, Math.max(1, level)) : 1;
  return safeLevel <= 1 ? text : `${text}${suffixes[safeLevel - 1] ?? ''}`;
}

function parseDuplicateSafe(source) {
  let index = 0;
  const skip = () => { while (/\s/u.test(source[index] || '')) index += 1; };
  const string = () => {
    const start = index;
    if (source[index] !== '"') throw new Error('string');
    index += 1;
    while (index < source.length) {
      if (source[index] === '\\') { index += 2; continue; }
      if (source[index] === '"') { index += 1; return JSON.parse(source.slice(start, index)); }
      if (source.charCodeAt(index) < 32) throw new Error('control');
      index += 1;
    }
    throw new Error('unterminated');
  };
  const value = (depth) => {
    if (depth > PERSONAL_VOCABULARY_MAX_DEPTH) throw new Error('depth');
    skip();
    const char = source[index];
    if (char === '{') {
      index += 1; skip();
      const keys = new Set();
      if (source[index] === '}') { index += 1; return; }
      while (index < source.length) {
        skip(); const key = string();
        if (keys.has(key)) throw new Error('duplicate');
        keys.add(key); skip(); if (source[index] !== ':') throw new Error('colon');
        index += 1; value(depth + 1); skip();
        if (source[index] === '}') { index += 1; return; }
        if (source[index] !== ',') throw new Error('comma');
        index += 1;
      }
      throw new Error('object');
    }
    if (char === '[') {
      index += 1; skip(); if (source[index] === ']') { index += 1; return; }
      while (index < source.length) {
        value(depth + 1); skip();
        if (source[index] === ']') { index += 1; return; }
        if (source[index] !== ',') throw new Error('comma');
        index += 1;
      }
      throw new Error('array');
    }
    if (char === '"') { string(); return; }
    if (source.startsWith('true', index)) { index += 4; return; }
    if (source.startsWith('false', index)) { index += 5; return; }
    if (source.startsWith('null', index)) { index += 4; return; }
    const number = source.slice(index).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u);
    if (number) { index += number[0].length; return; }
    throw new Error('value');
  };
  value(0); skip();
  if (index !== source.length) throw new Error('trailing');
  return JSON.parse(source);
}

function hasForbiddenUnicode(value) {
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

export function validatePersonalVocabularyText(source) {
  if (new TextEncoder().encode(source).byteLength > PERSONAL_VOCABULARY_MAX_BYTES) return { ok: false, code: 'too-large' };
  let parsed;
  try { parsed = parseDuplicateSafe(source); } catch (error) {
    return { ok: false, code: error?.message === 'duplicate' ? 'duplicate-key' : error?.message === 'depth' ? 'too-deep' : 'malformed-json' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ok: false, code: 'invalid-shape' };
  const topKeys = Object.keys(parsed);
  if (topKeys.some((key) => UNSAFE_KEYS.has(key))) return { ok: false, code: 'unsafe-key' };
  if (topKeys.some((key) => key !== 'schemaVersion' && key !== 'entries')) return { ok: false, code: 'unexpected-field' };
  if (parsed.schemaVersion !== PERSONAL_VOCABULARY_SCHEMA_VERSION) return { ok: false, code: 'unsupported-schema' };
  if (!parsed.entries || typeof parsed.entries !== 'object' || Array.isArray(parsed.entries)) return { ok: false, code: 'invalid-shape' };
  const keys = Object.keys(parsed.entries);
  if (keys.length > PERSONAL_VOCABULARY_MAX_ENTRIES) return { ok: false, code: 'too-many-entries' };
  const entries = Object.create(null);
  for (const key of keys) {
    const replacement = parsed.entries[key];
    if (UNSAFE_KEYS.has(key)) return { ok: false, code: 'unsafe-key' };
    if (FACTUAL_KEY_PATTERN.test(key)) return { ok: false, code: 'factual-key' };
    if (typeof replacement !== 'string') return { ok: false, code: 'non-string-entry' };
    if (hasForbiddenUnicode(key) || hasForbiddenUnicode(replacement)) return { ok: false, code: 'invalid-shape' };
    if (!key || key.length > PERSONAL_VOCABULARY_MAX_KEY_LENGTH || !replacement || replacement.length > PERSONAL_VOCABULARY_MAX_VALUE_LENGTH) return { ok: false, code: 'entry-too-long' };
    entries[key] = replacement;
  }
  return { ok: true, payload: { schemaVersion: PERSONAL_VOCABULARY_SCHEMA_VERSION, entries } };
}

function readCache() {
  try {
    const value = localStorage.getItem(PERSONAL_VOCABULARY_STORAGE_KEY);
    if (!value) return null;
    const result = validatePersonalVocabularyText(value);
    return result.ok ? result.payload : null;
  } catch { return null; }
}

function readHistory() {
  try {
    const raw = localStorage.getItem(PERSONAL_VOCABULARY_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const valid = parsed.every((event) => event && typeof event === 'object'
      && event.schemaVersion === PERSONAL_VOCABULARY_SCHEMA_VERSION
      && ['loaded', 'replaced', 'cleared', 'deleted'].includes(event.action)
      && Number.isSafeInteger(event.at));
    return valid ? parsed.slice(-64) : null;
  } catch { return null; }
}

export function readPersonalVocabularyStateSnapshot() {
  let historyRaw = null;
  try { historyRaw = localStorage.getItem(PERSONAL_VOCABULARY_HISTORY_KEY); } catch { /* handled by readHistory */ }
  return { payload: readCache(), history: readHistory() || [], historyRaw };
}

function recordHistory(action) {
  const current = readHistory();
  if (current === null) return false;
  const next = [...current, { schemaVersion: PERSONAL_VOCABULARY_SCHEMA_VERSION, action, at: Date.now() }].slice(-64);
  try {
    localStorage.setItem(PERSONAL_VOCABULARY_HISTORY_KEY, JSON.stringify(next));
    const readBack = readHistory();
    const last = readBack[readBack.length - 1];
    return readBack.length === next.length && last?.action === action && last?.at === next[next.length - 1].at;
  } catch { return false; }
}

function restoreCache(raw) {
  try {
    if (raw === null) localStorage.removeItem(PERSONAL_VOCABULARY_STORAGE_KEY);
    else localStorage.setItem(PERSONAL_VOCABULARY_STORAGE_KEY, raw);
    return localStorage.getItem(PERSONAL_VOCABULARY_STORAGE_KEY) === raw;
  } catch { return false; }
}

function restoreStorageRaw(cacheRaw, historyRaw) {
  try {
    if (cacheRaw === null) localStorage.removeItem(PERSONAL_VOCABULARY_STORAGE_KEY);
    else localStorage.setItem(PERSONAL_VOCABULARY_STORAGE_KEY, cacheRaw);
    if (historyRaw === null) localStorage.removeItem(PERSONAL_VOCABULARY_HISTORY_KEY);
    else localStorage.setItem(PERSONAL_VOCABULARY_HISTORY_KEY, historyRaw);
    return localStorage.getItem(PERSONAL_VOCABULARY_STORAGE_KEY) === cacheRaw
      && localStorage.getItem(PERSONAL_VOCABULARY_HISTORY_KEY) === historyRaw;
  } catch { return false; }
}

function writeCache(payload) {
  let serialized;
  try { serialized = JSON.stringify(payload); } catch { return { ok: false, code: 'write-failed' }; }
  const result = validatePersonalVocabularyText(serialized);
  if (!result.ok) return { ok: false, code: result.code || 'malformed-json' };
  let previous = null;
  let previousHistory = null;
  let captured = false;
  let hadValidCache = false;
  try {
    previous = localStorage.getItem(PERSONAL_VOCABULARY_STORAGE_KEY);
    previousHistory = localStorage.getItem(PERSONAL_VOCABULARY_HISTORY_KEY);
    captured = true;
    hadValidCache = readCache() !== null;
    localStorage.setItem(PERSONAL_VOCABULARY_STORAGE_KEY, serialized);
    const readBack = localStorage.getItem(PERSONAL_VOCABULARY_STORAGE_KEY);
    const readBackResult = readBack ? validatePersonalVocabularyText(readBack) : null;
    if (!readBackResult?.ok || JSON.stringify(readBackResult.payload) !== JSON.stringify(result.payload)) {
      restoreStorageRaw(previous, previousHistory);
      return { ok: false, code: 'readback-mismatch' };
    }
    const action = hadValidCache ? 'replaced' : 'loaded';
    if (!recordHistory(action)) {
      restoreStorageRaw(previous, previousHistory);
      return { ok: false, code: 'history-failed' };
    }
    document.dispatchEvent(new Event(PERSONAL_VOCABULARY_EVENT));
    return { ok: true, action, historyRecorded: true };
  } catch { if (captured) restoreStorageRaw(previous, previousHistory); return { ok: false, code: 'storage-unavailable' }; }
}

function clearCache() {
  let previous = null;
  let previousHistory = null;
  let captured = false;
  try {
    previous = localStorage.getItem(PERSONAL_VOCABULARY_STORAGE_KEY);
    previousHistory = localStorage.getItem(PERSONAL_VOCABULARY_HISTORY_KEY);
    captured = true;
    localStorage.removeItem(PERSONAL_VOCABULARY_STORAGE_KEY);
    if (localStorage.getItem(PERSONAL_VOCABULARY_STORAGE_KEY) !== null) {
      restoreStorageRaw(previous, previousHistory);
      return { ok: false, code: 'readback-mismatch' };
    }
    if (!recordHistory('cleared')) {
      restoreStorageRaw(previous, previousHistory);
      return { ok: false, code: 'history-failed' };
    }
    document.dispatchEvent(new Event(PERSONAL_VOCABULARY_EVENT));
    return { ok: true, action: 'cleared', historyRecorded: true };
  } catch { if (captured) restoreStorageRaw(previous, previousHistory); return { ok: false, code: 'storage-unavailable' }; }
}

export function restorePersonalVocabularyState(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return false;
  let serialized = null;
  let captured = false;
  let previousPayload = null;
  let previousHistory = null;
  try {
    if (snapshot.payload !== null && snapshot.payload !== undefined) {
      const payloadResult = validatePersonalVocabularyText(JSON.stringify(snapshot.payload));
      if (!payloadResult.ok) return false;
      serialized = JSON.stringify(payloadResult.payload);
    }
    const history = Array.isArray(snapshot.history) ? snapshot.history.slice(-64) : [];
    if (!history.every((event) => event && event.schemaVersion === PERSONAL_VOCABULARY_SCHEMA_VERSION
      && ['loaded', 'replaced', 'cleared', 'deleted'].includes(event.action)
      && Number.isSafeInteger(event.at))) return false;
    previousPayload = localStorage.getItem(PERSONAL_VOCABULARY_STORAGE_KEY);
    previousHistory = localStorage.getItem(PERSONAL_VOCABULARY_HISTORY_KEY);
    captured = true;
    if (serialized === null) localStorage.removeItem(PERSONAL_VOCABULARY_STORAGE_KEY);
    else localStorage.setItem(PERSONAL_VOCABULARY_STORAGE_KEY, serialized);
    if (snapshot.historyRaw === null) localStorage.removeItem(PERSONAL_VOCABULARY_HISTORY_KEY);
    else localStorage.setItem(PERSONAL_VOCABULARY_HISTORY_KEY, JSON.stringify(history));
    const restored = (serialized === null
      ? localStorage.getItem(PERSONAL_VOCABULARY_STORAGE_KEY) === null
      : localStorage.getItem(PERSONAL_VOCABULARY_STORAGE_KEY) === serialized)
      && (snapshot.historyRaw === null
        ? localStorage.getItem(PERSONAL_VOCABULARY_HISTORY_KEY) === null
        : JSON.stringify(readHistory() || []) === JSON.stringify(history));
    if (restored) {
      document.dispatchEvent(new Event(PERSONAL_VOCABULARY_EVENT));
      return true;
    }
    restoreStorageRaw(previousPayload, previousHistory);
    return false;
  } catch {
    if (captured) restoreStorageRaw(previousPayload, previousHistory);
    return false;
  }
}

function readLocalSchoolMode() {
  try {
    const raw = localStorage.getItem(PERSONAL_VOCABULARY_SCHOOL_MODE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return Boolean(parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      && parsed.school && typeof parsed.school === 'object' && parsed.school.enabled === true);
  } catch { return false; }
}

export function readPersonalVocabularySchoolMode(adapter = injectedC1) {
  if (adapter && typeof adapter.readSchoolMode === 'function') {
    const result = adapter.readSchoolMode();
    return result === true || result === false ? result : null;
  }
  return readLocalSchoolMode();
}

export function subscribeToPersonalVocabularySchoolMode(listener, adapter = injectedC1) {
  if (adapter && typeof adapter.subscribeSchoolMode === 'function') {
    return adapter.subscribeSchoolMode(listener);
  }
  const onStorage = (event) => {
    if (event.key === PERSONAL_VOCABULARY_SCHOOL_MODE_KEY) listener(readLocalSchoolMode());
  };
  const onSettings = (event) => {
    const detail = event.detail;
    listener(detail && typeof detail.enabled === 'boolean'
      ? detail.enabled
      : Boolean(detail && detail.school && detail.school.enabled === true));
  };
  window.addEventListener('storage', onStorage);
  document.addEventListener(PERSONAL_VOCABULARY_SCHOOL_MODE_EVENT, onSettings);
  return () => {
    window.removeEventListener('storage', onStorage);
    document.removeEventListener(PERSONAL_VOCABULARY_SCHOOL_MODE_EVENT, onSettings);
  };
}

export function isPersonalVocabularySuppressed() {
  return readPersonalVocabularySchoolMode() !== false;
}

export function applyPersonalVocabulary(text, payload, boundary = 'private-ui') {
  if (!payload || boundary !== 'private-ui' || isPersonalVocabularySuppressed()) return text;
  const entries = Object.entries(payload.entries)
    .filter(([ordinary]) => ordinary.length > 0)
    .sort(([left], [right]) => right.length - left.length);
  const chunks = [];
  for (let index = 0; index < text.length;) {
    const match = entries.find(([ordinary]) => matchesAtBoundary(text, ordinary, index));
    if (match) {
      chunks.push(match[1]);
      index += match[0].length;
    } else {
      chunks.push(text[index] || '');
      index += 1;
    }
  }
  return chunks.join('');
}

const WORDISH = /[\p{Letter}\p{Mark}\p{Number}\p{Connector_Punctuation}\p{Dash_Punctuation}]/u;
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
function codePointBefore(text, index) {
  if (index <= 0) return undefined;
  const previous = text.charCodeAt(index - 1);
  return previous >= 0xdc00 && previous <= 0xdfff && index > 1
    ? text.codePointAt(index - 2)
    : text.codePointAt(index - 1);
}
function matchesAtBoundary(text, ordinary, index) {
  if (!text.startsWith(ordinary, index)) return false;
  const previous = codePointBefore(text, index);
  const next = text.codePointAt(index + ordinary.length);
  if ((previous !== undefined && /\p{Mark}/u.test(String.fromCodePoint(previous)))
    || (next !== undefined && /\p{Mark}/u.test(String.fromCodePoint(next)))) return false;
  if (CJK.test(ordinary)) return true;
  return !(previous !== undefined && WORDISH.test(String.fromCodePoint(previous)))
    && !(next !== undefined && WORDISH.test(String.fromCodePoint(next)));
}

function statusFor(result, payload = null) {
  if (result.ok) return applyPersonalVocabulary(copy(PAIRS.valid), payload, 'private-ui');
  const pairs = {
    'too-large': PAIRS.tooLarge,
    'duplicate-key': PAIRS.duplicate,
    'unsupported-schema': PAIRS.schema,
    'unexpected-field': PAIRS.unexpected,
    'unsafe-key': PAIRS.unsafe,
    'invalid-shape': PAIRS.shape,
    'too-deep': PAIRS.deep,
    'too-many-entries': PAIRS.entries,
    'entry-too-long': PAIRS.length,
    'factual-key': PAIRS.factual,
    'non-string-entry': PAIRS.string,
    'malformed-json': PAIRS.malformed,
  };
  return applyPersonalVocabulary(copy(pairs[result.code] || PAIRS.malformed), payload, 'private-ui');
}

function mutationStatusFor(result, payload = null) {
  if (result.ok) return applyPersonalVocabulary(copy(result.action === 'cleared' ? PAIRS.cleared : PAIRS.valid), payload, 'private-ui');
  const messages = {
    'storage-unavailable': { en: 'Local storage is unavailable. Nothing was changed.', yue: '本地 storage 用唔到，乜都冇改。' },
    'readback-mismatch': { en: 'The local cache did not verify. Nothing was changed.', yue: '本地 cache 驗證唔成功，乜都冇改。' },
    'history-failed': { en: 'The local history event did not verify. Nothing was changed.', yue: '本地 history event 驗證唔成功，乜都冇改。' },
    'write-failed': { en: 'The local cache was not written. Nothing was changed.', yue: '本地 cache 寫唔到，乜都冇改。' },
  };
  return applyPersonalVocabulary(copy(messages[result.code] || PAIRS.malformed), payload, 'private-ui');
}

export function mountPersonalVocabulary(rootOverride = null, options = {}) {
  const root = rootOverride || document.querySelector('[data-personal-vocabulary]');
  if (!root) return () => undefined;
  // Hide before reading the canonical C1 state. An unresolved host must never
  // flash the feature into view before it has answered.
  root.hidden = true;
  const schoolSource = options && options.schoolModeSource;
  const file = root.querySelector('[data-personal-vocabulary-file]');
  const status = root.querySelector('[data-personal-vocabulary-status]');
  const count = root.querySelector('[data-personal-vocabulary-count]');
  const clear = root.querySelector('[data-personal-vocabulary-clear]');
  const sample = root.querySelector('[data-personal-vocabulary-sample]');
  const output = root.querySelector('[data-personal-vocabulary-output]');
  const search = root.querySelector('[data-personal-vocabulary-search]');
  const noMatches = root.querySelector('[data-personal-vocabulary-no-matches]');
  const historySearch = root.querySelector('[data-personal-vocabulary-history-search]');
  const historyDateFrom = root.querySelector('[data-personal-vocabulary-history-date-from]');
  const historyDateTo = root.querySelector('[data-personal-vocabulary-history-date-to]');
  const historyPreset = root.querySelector('[data-personal-vocabulary-history-preset-value]');
  const historyPresetOptions = root.querySelector('[data-personal-vocabulary-history-preset-options]');
  const historyPresetSearch = root.querySelector('[data-personal-vocabulary-history-preset-search]');
  const historyActionSearch = root.querySelector('[data-personal-vocabulary-history-action-search]');
  const historyAction = root.querySelector('[data-personal-vocabulary-history-action-value]');
  const historyActionOptions = root.querySelector('[data-personal-vocabulary-history-action-options]');
  const historyStatus = root.querySelector('[data-personal-vocabulary-history-status]');
  const historyList = root.querySelector('[data-personal-vocabulary-history-list]');
  const historyExport = root.querySelector('[data-personal-vocabulary-history-export]');
  const historySelectAll = root.querySelector('[data-personal-vocabulary-history-select-all]');
  const historyInvert = root.querySelector('[data-personal-vocabulary-history-invert]');
  const historyDelete = root.querySelector('[data-personal-vocabulary-history-delete]');
  const historyConfirm = root.querySelector('[data-personal-vocabulary-history-confirm]');
  const historyConfirmCount = root.querySelector('[data-personal-vocabulary-history-confirm-count]');
  const historyKeyOne = root.querySelector('[data-personal-vocabulary-history-key-one]');
  const historyKeyTwo = root.querySelector('[data-personal-vocabulary-history-key-two]');
  const historySlider = root.querySelector('[data-personal-vocabulary-history-slider]');
  const historyProgress = root.querySelector('[data-personal-vocabulary-history-progress]');
  const historyConfirmStatus = root.querySelector('[data-personal-vocabulary-history-confirm-status]');
  const historyCancel = root.querySelector('[data-personal-vocabulary-history-cancel]');
  const historyConfirmAction = root.querySelector('[data-personal-vocabulary-history-confirm-action]');
  const rows = () => Array.from(root.querySelectorAll('[data-personal-vocabulary-row]'));
  let payload = readCache();
  let schoolState = readPersonalVocabularySchoolMode(schoolSource);
  const selectedHistory = new Set();
  let lastSelectedHistoryIndex = -1;
  i18n.setPrivateUiAdapter?.((text) => applyPersonalVocabulary(text, payload, 'private-ui'));
  const refreshI18n = () => i18n.applyI18n?.(document);

  const privateCopy = (pair) => applyPersonalVocabulary(copy(pair), payload, 'private-ui');
  const schoolMode = () => schoolState !== false;
  const historyCopy = (action) => privateCopy({
    en: action === 'loaded' ? 'Loaded' : action === 'replaced' ? 'Replaced' : action === 'cleared' ? 'Cleared' : 'Deleted',
    yue: action === 'loaded' ? '載入' : action === 'replaced' ? '替換' : action === 'cleared' ? '清除' : '刪除',
  });
  const historyEventId = (event, history) => `${history.indexOf(event)}:${event.action}:${event.at}`;
  const localDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  const actionMatcher = () => {
    const query = historyActionSearch?.value.trim() || '';
    const controller = historyActionSearch && regex.getBuilder(historyActionSearch);
    const state = controller?.getState?.();
    if (state?.valid === false) return { query, invalid: true, matches: () => false };
    const matcher = controller?.matcher?.() || ((text) => !query || text.toLowerCase().includes(query.toLowerCase()));
    return { query, invalid: false, matches: matcher };
  };
  const renderActionOptions = (history) => {
    if (!historyAction) return;
    const selected = historyAction?.dataset.value || '';
    const options = [...new Set(history.map((event) => event.action))].sort();
    const matcher = actionMatcher();
    if (!historyActionOptions) return;
    historyActionOptions.textContent = '';
    const all = document.createElement('button');
    all.type = 'button';
    all.className = 'md-list-item';
    all.setAttribute('role', 'option');
    all.textContent = privateCopy(PAIRS.historyAll);
    all.addEventListener('click', () => {
      historyAction.dataset.value = '';
      historyAction.textContent = privateCopy(PAIRS.historyAll);
      historyAction.setAttribute('aria-expanded', 'false');
      historyActionOptions.hidden = true;
      renderHistory();
    });
    historyActionOptions.append(all);
    for (const action of options) {
      if (!matcher.matches(historyCopy(action))) continue;
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'md-list-item';
      option.setAttribute('role', 'option');
      option.textContent = historyCopy(action);
      option.addEventListener('click', () => {
        historyAction.dataset.value = action;
        historyAction.textContent = historyCopy(action);
        historyAction.setAttribute('aria-expanded', 'false');
        historyActionOptions.hidden = true;
        renderHistory();
      });
      historyActionOptions.append(option);
    }
    if (!options.includes(selected)) {
      historyAction.dataset.value = '';
      historyAction.textContent = privateCopy(PAIRS.historyAll);
    }
  };
  const filteredHistory = () => {
    const history = readHistory();
    if (history === null) return { history: null, visible: [], invalid: false };
    renderActionOptions(history);
    const query = historySearch?.value.trim() || '';
    const controller = historySearch && regex.getBuilder(historySearch);
    const state = controller?.getState?.();
    const invalid = state?.valid === false;
    const invalidActionPattern = actionMatcher().invalid;
    const matcher = invalid ? () => false : controller?.matcher?.() || ((text) => !query || text.toLowerCase().includes(query.toLowerCase()));
    const dateFrom = historyDateFrom?.value || '';
    const dateTo = historyDateTo?.value || '';
    const action = historyAction?.dataset.value || '';
    const invalidRange = Boolean(dateFrom && dateTo && dateFrom > dateTo);
    const visible = history.filter((event) => {
      const day = localDate(new Date(event.at));
      return (!dateFrom || day >= dateFrom) && (!dateTo || day <= dateTo) && (!action || event.action === action)
        && matcher(`${historyCopy(event.action)} ${day}`);
    });
    return { history, visible: invalidRange || invalidActionPattern ? [] : visible, invalid: invalid || invalidRange || invalidActionPattern };
  };
  const renderHistory = () => {
    if (!historyList) return;
    historyList.textContent = '';
    const result = filteredHistory();
    if (result.history === null) {
      if (historyStatus) historyStatus.textContent = privateCopy(PAIRS.historyCorrupt);
      return;
    }
    if (historyStatus) historyStatus.textContent = result.invalid
      ? privateCopy({ en: 'Invalid history or action pattern, or date range.', yue: 'History 或 action pattern，或者日期範圍無效。' }) : '';
    for (const event of result.visible) {
      const item = document.createElement('li');
      item.className = 'md-list-item';
      const id = historyEventId(event, result.history);
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = selectedHistory.has(id);
      checkbox.setAttribute('aria-label', privateCopy({ en: `Select ${historyCopy(event.action)} history event`, yue: `揀選 ${historyCopy(event.action)} history event` }));
      checkbox.addEventListener('click', (clickEvent) => {
        const index = result.visible.indexOf(event);
        if (clickEvent.shiftKey && lastSelectedHistoryIndex >= 0) {
          const start = Math.min(lastSelectedHistoryIndex, index);
          const end = Math.max(lastSelectedHistoryIndex, index);
          for (const rangeEvent of result.visible.slice(start, end + 1)) selectedHistory.add(historyEventId(rangeEvent, result.history));
          checkbox.checked = true;
        } else if (checkbox.checked) selectedHistory.add(id);
        else selectedHistory.delete(id);
        lastSelectedHistoryIndex = index;
      });
      item.append(checkbox, document.createTextNode(` ${historyCopy(event.action)} · ${new Date(event.at).toLocaleString()}`));
      historyList.append(item);
    }
    if (!result.visible.length && !result.invalid && historyStatus) historyStatus.textContent = privateCopy(PAIRS.historyEmpty);
  };
  const paint = () => {
    root.hidden = schoolMode();
    root.querySelectorAll('[data-personal-vocabulary-copy]').forEach((node) => {
      const key = node.getAttribute('data-personal-vocabulary-copy');
      if (key && PAIRS[key]) node.textContent = privateCopy(PAIRS[key]);
    });
    if (count) count.textContent = payload ? privateCopy({ en: `${Object.keys(payload.entries).length} entries loaded locally.`, yue: `本地載入咗 ${Object.keys(payload.entries).length} 個 entries。` }) : privateCopy(PAIRS.noFile);
    if (clear) {
      clear.disabled = !payload;
      if (root.hidden) {
        clear.removeAttribute('data-md-command');
        clear.removeAttribute('data-md-command-yue');
      } else {
        clear.setAttribute('data-md-command', privateCopy(PAIRS.clear));
        clear.setAttribute('data-md-command-yue', privateCopy(PAIRS.clear));
      }
    }
    if (file) file.setAttribute('aria-label', privateCopy({ en: payload ? 'Replace local JSON file' : 'Choose a local JSON file', yue: payload ? '換本地 JSON file' : '揀本地 JSON file' }));
    if (search) {
      search.setAttribute('aria-label', privateCopy(PAIRS.searchLabel));
      search.setAttribute('placeholder', privateCopy(PAIRS.searchPlaceholder));
      if (root.hidden) {
        search.removeAttribute('data-md-setting');
        search.removeAttribute('data-md-setting-yue');
      } else {
        search.setAttribute('data-md-setting', privateCopy(PAIRS.searchLabel));
        search.setAttribute('data-md-setting-yue', privateCopy(PAIRS.searchLabel));
      }
    }
    if (sample && output) output.textContent = applyPersonalVocabulary(sample.value, payload, 'private-ui');
    if (historySearch) {
      historySearch.setAttribute('aria-label', privateCopy(PAIRS.historySearchLabel));
      historySearch.setAttribute('placeholder', privateCopy(PAIRS.historySearchPlaceholder));
    }
    if (historyActionSearch) {
      historyActionSearch.setAttribute('aria-label', privateCopy(PAIRS.historyActionSearchLabel));
      historyActionSearch.setAttribute('placeholder', privateCopy(PAIRS.historyActionSearchPlaceholder));
    }
    if (historyPresetSearch) historyPresetSearch.setAttribute('placeholder', privateCopy(PAIRS.historyPresetSearchPlaceholder));
    renderHistory();
  };
  const filter = () => {
    const controller = search && regex.getBuilder(search);
    const query = search?.value.trim() || '';
    const controllerState = controller && controller.getState ? controller.getState() : null;
    if (controllerState && controllerState.valid === false) {
      for (const row of rows()) row.hidden = false;
      if (noMatches) noMatches.hidden = true;
      return;
    }
    const controllerMatcher = controller && controller.matcher ? controller.matcher() : null;
    const matcher = typeof controllerMatcher === 'function'
      ? controllerMatcher
      : (value) => !query || value.toLowerCase().includes(query.toLowerCase());
    for (const row of rows()) row.hidden = !matcher(row.textContent || '');
    if (noMatches) noMatches.hidden = !query || rows().some((row) => !row.hidden);
  };
  file?.addEventListener('change', async () => {
    const selected = file.files?.[0];
    if (!selected) return;
    try {
      if (selected.size > PERSONAL_VOCABULARY_MAX_BYTES) { if (status) status.textContent = privateCopy(PAIRS.tooLarge); return; }
      const bytes = new Uint8Array(await selected.arrayBuffer());
      const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      const result = validatePersonalVocabularyText(source);
      if (!result.ok) { if (status) status.textContent = statusFor(result, payload); return; }
      const stored = writeCache(result.payload);
      if (!stored.ok) { if (status) status.textContent = mutationStatusFor(stored, payload); return; }
      payload = result.payload;
      if (status) status.textContent = mutationStatusFor(stored, payload);
      paint();
      filter();
      refreshI18n();
    } catch { if (status) status.textContent = privateCopy(PAIRS.malformed); }
    finally { file.value = ''; }
  });
  clear?.addEventListener('click', () => {
    const result = clearCache();
    if (!result.ok) { if (status) status.textContent = mutationStatusFor(result, payload); return; }
    payload = null;
    if (status) status.textContent = mutationStatusFor(result, payload);
    paint();
    filter();
    refreshI18n();
  });
  sample?.addEventListener('input', paint);
  search?.addEventListener('input', filter);
  historySearch?.addEventListener('input', renderHistory);
  historyDateFrom?.addEventListener('input', renderHistory);
  historyDateTo?.addEventListener('input', renderHistory);
  historyPresetSearch?.addEventListener('input', () => {
    const query = historyPresetSearch.value.trim().toLowerCase();
    const controller = regex.getBuilder(historyPresetSearch);
    const matcher = controller?.matcher?.() || ((text) => !query || text.toLowerCase().includes(query));
    historyPresetOptions?.querySelectorAll('[data-value]').forEach((option) => { option.hidden = !matcher(option.textContent || ''); });
  });
  historyPreset?.addEventListener('click', () => {
    if (!historyPresetOptions) return;
    historyPresetOptions.hidden = !historyPresetOptions.hidden;
    historyPreset.setAttribute('aria-expanded', String(!historyPresetOptions.hidden));
    if (!historyPresetOptions.hidden) historyPresetOptions.querySelector('[role="option"]:not([hidden])')?.focus();
  });
  historyPreset?.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && historyPresetOptions && !historyPresetOptions.hidden) {
      event.preventDefault();
      historyPresetOptions.hidden = true;
      historyPreset.setAttribute('aria-expanded', 'false');
      historyPreset.focus();
    }
  });
  historyPresetOptions?.querySelectorAll('[data-value]').forEach((option) => option.addEventListener('click', () => {
    const value = option.getAttribute('data-value') || '';
    historyPreset.dataset.value = value;
    historyPreset.textContent = option.textContent || privateCopy(PAIRS.historyAnyDate);
    historyPreset.setAttribute('aria-expanded', 'false');
    historyPresetOptions.hidden = true;
    if (!value) {
      if (historyDateFrom) historyDateFrom.value = '';
      if (historyDateTo) historyDateTo.value = '';
      renderHistory();
      return;
    }
    const now = new Date();
    if (value === 'today') {
      if (historyDateFrom) historyDateFrom.value = localDate(now);
      if (historyDateTo) historyDateTo.value = localDate(now);
    } else if (value === 'last7') {
      const start = new Date(now);
      start.setDate(start.getDate() - 6);
      if (historyDateFrom) historyDateFrom.value = localDate(start);
      if (historyDateTo) historyDateTo.value = localDate(now);
    }
    renderHistory();
  }));
  historyActionSearch?.addEventListener('input', renderHistory);
  historyAction?.addEventListener('click', () => {
    if (!historyActionOptions) return;
    historyActionOptions.hidden = !historyActionOptions.hidden;
    historyAction.setAttribute('aria-expanded', String(!historyActionOptions.hidden));
    if (!historyActionOptions.hidden) historyActionOptions.querySelector('[role="option"]:not([hidden])')?.focus();
  });
  historyAction?.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && historyActionOptions && !historyActionOptions.hidden) {
      event.preventDefault();
      historyActionOptions.hidden = true;
      historyAction.setAttribute('aria-expanded', 'false');
      historyAction.focus();
    }
  });
  historyExport?.addEventListener('click', () => {
    const result = filteredHistory();
    if (result.history === null) { if (historyStatus) historyStatus.textContent = privateCopy(PAIRS.historyCorrupt); return; }
    if (result.invalid) { if (historyStatus) historyStatus.textContent = privateCopy({ en: 'Invalid history or action pattern, or date range.', yue: 'History 或 action pattern，或者日期範圍無效。' }); return; }
    const body = JSON.stringify({ schemaVersion: PERSONAL_VOCABULARY_SCHEMA_VERSION, events: result.visible.map(({ action, at }) => ({ action, at })) }, null, 2);
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([body], { type: 'application/json' }));
    link.download = 'personal-vocabulary-history-redacted.json';
    link.click();
    URL.revokeObjectURL(link.href);
    if (historyStatus) historyStatus.textContent = privateCopy({ en: 'Redacted history exported locally.', yue: 'Redact 咗嘅 history 已經本地匯出。' });
  });
  historySelectAll?.addEventListener('click', () => {
    const result = filteredHistory();
    if (result.history !== null) for (const event of result.visible) selectedHistory.add(historyEventId(event, result.history));
    renderHistory();
  });
  historyInvert?.addEventListener('click', () => {
    const result = filteredHistory();
    if (result.history !== null) for (const event of result.visible) {
      const id = historyEventId(event, result.history);
      if (selectedHistory.has(id)) selectedHistory.delete(id); else selectedHistory.add(id);
    }
    renderHistory();
  });
  historyDelete?.addEventListener('click', () => {
    if (selectedHistory.size === 0) { if (historyStatus) historyStatus.textContent = privateCopy({ en: 'Select at least one history event first.', yue: '先揀至少一個 history event。' }); return; }
    if (historyConfirmCount) historyConfirmCount.textContent = `${selectedHistory.size} selected history events will be removed.`;
    historyConfirm?.showModal?.();
  });
  const updateHistoryConfirmation = () => {
    const ready = Boolean(historyKeyOne?.value && historyKeyTwo?.value && historyKeyOne.value !== historyKeyTwo.value && Number(historySlider?.value || 0) >= 100);
    if (historyConfirmAction) historyConfirmAction.disabled = !ready;
    if (historyProgress && historySlider) historyProgress.value = Number(historySlider.value || 0);
  };
  historyKeyOne?.addEventListener('input', updateHistoryConfirmation);
  historyKeyTwo?.addEventListener('input', updateHistoryConfirmation);
  historySlider?.addEventListener('input', updateHistoryConfirmation);
  historyCancel?.addEventListener('click', () => historyConfirm?.close?.());
  historyConfirmAction?.addEventListener('click', () => {
    const first = historyKeyOne?.value || '';
    const second = historyKeyTwo?.value || '';
    const progress = Number(historySlider?.value || 0);
    if (!first || !second || first === second || progress < 100) {
      if (historyStatus) historyStatus.textContent = privateCopy({ en: 'Both independent keys and the full confirmation slider are required.', yue: '要有兩個獨立 key 同完成確認 slider。' });
      return;
    }
    const history = readHistory();
    if (!history) { if (historyStatus) historyStatus.textContent = privateCopy(PAIRS.historyCorrupt); return; }
    const next = [
      ...history.filter((event) => !selectedHistory.has(historyEventId(event, history))),
      { schemaVersion: PERSONAL_VOCABULARY_SCHEMA_VERSION, action: 'deleted', at: Date.now() },
    ].slice(-64);
    try {
      localStorage.setItem(PERSONAL_VOCABULARY_HISTORY_KEY, JSON.stringify(next));
      const readBack = readHistory();
      if (!readBack || readBack.length !== next.length || readBack.at(-1)?.action !== 'deleted') throw new Error('readback');
      selectedHistory.clear();
      historyKeyOne.value = '';
      historyKeyTwo.value = '';
      historySlider.value = '0';
      if (historyConfirmStatus) historyConfirmStatus.textContent = privateCopy({ en: 'History deletion complete.', yue: 'History 刪除完成。' });
      historyConfirm?.classList.add('personal-vocabulary__history-confirm--complete');
      window.setTimeout(() => historyConfirm?.close?.(), 350);
      renderHistory();
    } catch {
      if (historyStatus) historyStatus.textContent = privateCopy({ en: 'Selected history was not removed.', yue: '選取嘅 history 冇刪到。' });
    }
  });
  const refreshSurface = () => { payload = readCache(); paint(); filter(); renderHistory(); refreshI18n(); };
  const onStorage = (event) => {
    if (event.key === PERSONAL_VOCABULARY_STORAGE_KEY || event.key === PERSONAL_VOCABULARY_HISTORY_KEY) refreshSurface();
    if (event.key === PERSONAL_VOCABULARY_SCHOOL_MODE_KEY) {
      schoolState = readPersonalVocabularySchoolMode(schoolSource);
      refreshSurface();
    }
  };
  const onVocabularyChange = () => refreshSurface();
  const onSchoolChange = (event) => {
    const detail = event.detail;
    schoolState = detail && typeof detail.enabled === 'boolean'
      ? detail.enabled
      : readPersonalVocabularySchoolMode(schoolSource);
    refreshSurface();
  };
  const onC1Change = () => {
    schoolState = readPersonalVocabularySchoolMode(schoolSource);
    refreshSurface();
  };
  const onI18nApplied = () => { paint(); filter(); };
  const onOpen = (event) => {
    const requestedRoot = event.detail && event.detail.root;
    if (requestedRoot && requestedRoot !== root) return;
    if (root.hidden) return;
    root.scrollIntoView?.({ block: 'nearest' });
    const target = root.querySelector('[data-personal-vocabulary-search]')
      || root.querySelector('[data-personal-vocabulary-file]');
    target?.focus();
  };
  window.addEventListener('storage', onStorage);
  document.addEventListener(PERSONAL_VOCABULARY_EVENT, onVocabularyChange);
  document.addEventListener(PERSONAL_VOCABULARY_SCHOOL_MODE_EVENT, onSchoolChange);
  document.addEventListener(PERSONAL_VOCABULARY_C1_EVENT, onC1Change);
  document.addEventListener(PERSONAL_VOCABULARY_OPEN_EVENT, onOpen);
  document.addEventListener('md-i18n-applied', onI18nApplied);
  const unsubscribeSchool = subscribeToPersonalVocabularySchoolMode((enabled) => {
    schoolState = enabled;
    refreshSurface();
  }, schoolSource);
  paint();
  filter();
  renderHistory();
  document.dispatchEvent(new CustomEvent(PERSONAL_VOCABULARY_MOUNT_EVENT, {
    detail: { id: PERSONAL_VOCABULARY_SETTINGS_ID, root },
  }));
  return () => {
    unsubscribeSchool();
    window.removeEventListener('storage', onStorage);
    document.removeEventListener(PERSONAL_VOCABULARY_EVENT, onVocabularyChange);
    document.removeEventListener(PERSONAL_VOCABULARY_SCHOOL_MODE_EVENT, onSchoolChange);
    document.removeEventListener(PERSONAL_VOCABULARY_C1_EVENT, onC1Change);
    document.removeEventListener(PERSONAL_VOCABULARY_OPEN_EVENT, onOpen);
    document.removeEventListener('md-i18n-applied', onI18nApplied);
  };
}

export function initPersonalVocabulary(root, options) {
  return mountPersonalVocabulary(root, options);
}

export default {
  initPersonalVocabulary,
  mountPersonalVocabulary,
  openPersonalVocabulary,
  validatePersonalVocabularyText,
  applyPersonalVocabulary,
};

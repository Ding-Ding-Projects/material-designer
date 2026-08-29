// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyPersonalVocabulary,
  applyPersonalVocabularyToPrivateUiKey,
  clearPersonalVocabulary,
  configurePersonalVocabularyC1,
  PERSONAL_VOCABULARY_MAX_BYTES,
  PERSONAL_VOCABULARY_MAX_DEPTH,
  PERSONAL_VOCABULARY_MAX_ENTRIES,
  PERSONAL_VOCABULARY_HISTORY_KEY,
  readPersonalVocabularyCache,
  readPersonalVocabularyHistory,
  readPersonalVocabularyStateSnapshot,
  readPersonalVocabularySchoolMode,
  isPersonalVocabularySuppressed,
  restorePersonalVocabularyCache,
  restorePersonalVocabularyState,
  storePersonalVocabulary,
  subscribeToPersonalVocabularySchoolMode,
  validatePersonalVocabularyBytes,
  validatePersonalVocabularyText,
} from '../../src/lib/personal-vocabulary';

const valid = (entries: Record<string, string> = { label: 'display' }) =>
  JSON.stringify({ schemaVersion: 1, entries });

afterEach(() => {
  window.localStorage.clear();
  configurePersonalVocabularyC1(null);
  vi.unstubAllGlobals();
});

describe('personal vocabulary contract', () => {
  it('accepts the bounded versioned object and stores only validated data', () => {
    const result = validatePersonalVocabularyText(valid({ label: 'display', heading: 'title' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.payload.entries)).toEqual(['label', 'heading']);
    expect(storePersonalVocabulary(result.payload)).toMatchObject({ ok: true, action: 'loaded', historyRecorded: true });
    expect(readPersonalVocabularyCache()?.entries.label).toBe('display');
    expect(readPersonalVocabularyHistory()).toHaveLength(1);
    expect(window.localStorage.getItem(PERSONAL_VOCABULARY_HISTORY_KEY)).not.toContain('display');
  });

  it('rejects duplicate keys before JSON parsing can collapse them', () => {
    expect(validatePersonalVocabularyText('{"schemaVersion":1,"schemaVersion":1,"entries":{}}')).toMatchObject({
      ok: false,
      code: 'duplicate-key',
    });
    expect(validatePersonalVocabularyText('{"schemaVersion":1,"entries":{"label":"a","label":"b"}}')).toMatchObject({
      ok: false,
      code: 'duplicate-key',
    });
  });

  it('rejects unknown versions, fields, unsafe keys, non-strings, and empty values', () => {
    expect(validatePersonalVocabularyText('{"schemaVersion":2,"entries":{}}')).toMatchObject({ ok: false, code: 'unsupported-schema' });
    expect(validatePersonalVocabularyText('{"schemaVersion":1,"entries":{},"extra":true}')).toMatchObject({ ok: false, code: 'unexpected-field' });
    expect(validatePersonalVocabularyText('{"schemaVersion":1,"entries":{"__proto__":"x"}}')).toMatchObject({ ok: false, code: 'unsafe-key' });
    expect(validatePersonalVocabularyText('{"schemaVersion":1,"entries":{"label":42}}')).toMatchObject({ ok: false, code: 'non-string-entry' });
    expect(validatePersonalVocabularyText('{"schemaVersion":1,"entries":{"label2":"x"}}')).toMatchObject({ ok: false, code: 'factual-key' });
    expect(validatePersonalVocabularyText('{"schemaVersion":1,"entries":{"":"x"}}')).toMatchObject({ ok: false, code: 'entry-too-long' });
    expect(validatePersonalVocabularyText('{"schemaVersion":1,"entries":{"label":""}}')).toMatchObject({ ok: false, code: 'entry-too-long' });
  });

  it('rejects every Unicode Number category in factual keys', () => {
    for (const key of ['label١', 'label१', 'labelⅣ', 'label²', 'label¼']) {
      expect(validatePersonalVocabularyText(valid({ [key]: 'value' })).code).toBe('factual-key');
    }
  });

  it('rejects decoded controls, format and bidi code points and unpaired surrogates', () => {
    for (const value of ['before\\u0000after', 'before\\u202Eafter', 'before\\u200Eafter', 'before\\uD800after']) {
      expect(validatePersonalVocabularyText(`{"schemaVersion":1,"entries":{"label":"${value}"}}`)).toEqual({
        ok: false,
        code: 'invalid-shape',
        message: 'Replacements cannot contain control, format, bidi, or unpaired-surrogate characters.',
      });
    }
    for (const key of ['la\\u0000bel', 'la\\u202Ebel', 'la\\u200Ebel', 'la\\uD800bel']) {
      expect(validatePersonalVocabularyText(`{"schemaVersion":1,"entries":{"${key}":"value"}}`)).toMatchObject({ ok: false, code: 'invalid-shape' });
    }
  });

  it('rejects oversized, deeply nested, and over-count inputs', () => {
    expect(validatePersonalVocabularyBytes(new Uint8Array(PERSONAL_VOCABULARY_MAX_BYTES + 1))).toMatchObject({ ok: false, code: 'too-large' });
    const deep = `${'['.repeat(PERSONAL_VOCABULARY_MAX_DEPTH + 2)}1${']'.repeat(PERSONAL_VOCABULARY_MAX_DEPTH + 2)}`;
    expect(validatePersonalVocabularyText(deep)).toMatchObject({ ok: false, code: 'too-deep' });
    const entries: Record<string, string> = {};
    for (let index = 0; index <= PERSONAL_VOCABULARY_MAX_ENTRIES; index += 1) entries[`key-${index}`] = 'value';
    expect(validatePersonalVocabularyText(valid(entries))).toMatchObject({ ok: false, code: 'too-many-entries' });
  });

  it('refuses malformed UTF-8 before JSON parsing', () => {
    expect(validatePersonalVocabularyBytes(new Uint8Array([0x7b, 0xff, 0x7d]))).toMatchObject({ ok: false, code: 'malformed-json' });
  });

  it('never partially applies a rejected file and clears back to original wording', () => {
    const result = validatePersonalVocabularyText(valid({ label: 'display' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(storePersonalVocabulary(result.payload)).toMatchObject({ ok: true });
    const cached = readPersonalVocabularyCache();
    expect(applyPersonalVocabulary('label', cached, 'private-ui')).toBe('display');
    expect(applyPersonalVocabulary('label', cached, 'technical')).toBe('label');
    expect(applyPersonalVocabulary('label', cached, 'public')).toBe('label');
    expect(validatePersonalVocabularyText('{"schemaVersion":1,"entries":{"next":42}}').ok).toBe(false);
    expect(readPersonalVocabularyCache()?.entries.label).toBe('display');
    expect(clearPersonalVocabulary()).toMatchObject({ ok: true, action: 'cleared', historyRecorded: true });
    expect(readPersonalVocabularyCache()).toBeNull();
    expect(applyPersonalVocabulary('label', readPersonalVocabularyCache(), 'private-ui')).toBe('label');
  });

  it('applies only to allowlisted private i18n keys and preserves technical facts', () => {
    const result = validatePersonalVocabularyText(valid({ Appearance: 'My look', Version: 'My version' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(storePersonalVocabulary(result.payload)).toMatchObject({ ok: true });
    expect(applyPersonalVocabularyToPrivateUiKey('settings.appearance', 'Appearance')).toBe('My look');
    expect(applyPersonalVocabularyToPrivateUiKey('settings.privacyMetricsHint', 'Run count 12, duration 4s')).toBe('Run count 12, duration 4s');
    expect(applyPersonalVocabularyToPrivateUiKey('version.label', 'Version 12')).toBe('Version 12');
  });

  it('suppresses private-key replacements while School mode is active', () => {
    const result = validatePersonalVocabularyText(valid({ Appearance: 'My look' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(storePersonalVocabulary(result.payload)).toMatchObject({ ok: true });
    document.documentElement.setAttribute('data-universal-school-mode', 'true');
    expect(applyPersonalVocabularyToPrivateUiKey('settings.appearance', 'Appearance')).toBe('Appearance');
    document.documentElement.removeAttribute('data-universal-school-mode');
  });

  it('applies replacements in one pass without cascading replacement values', () => {
    const result = validatePersonalVocabularyText(valid({ label: 'display', display: 'shown' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(applyPersonalVocabulary('label display', result.payload, 'private-ui')).toBe('display shown');
  });

  it('keeps Latin keys at word boundaries, combining marks coherent, and CJK phrases unrestricted', () => {
    const result = validatePersonalVocabularyText(valid({ label: 'display', '蝦餃': 'dumpling' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(applyPersonalVocabulary('label labels label.', result.payload, 'private-ui')).toBe('display labels display.');
    expect(applyPersonalVocabulary('e\u0301label label\u0301', result.payload, 'private-ui')).toBe('e\u0301label label\u0301');
    expect(applyPersonalVocabulary('蝦餃小食 小蝦餃', result.payload, 'private-ui')).toBe('dumpling小食 小dumpling');
  });

  it('matches raw Unicode code points without NFC/NFD or confusable folding', () => {
    const result = validatePersonalVocabularyText(valid({ 'café': 'coffee', pay: 'settle' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(applyPersonalVocabulary('café cafe\u0301 pay раy', result.payload, 'private-ui')).toBe('coffee cafe\u0301 settle раy');
  });

  it('reports a clear failure and keeps the prior cache when removal cannot be verified', () => {
    const result = validatePersonalVocabularyText(valid({ label: 'display' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(storePersonalVocabulary(result.payload)).toMatchObject({ ok: true });
    const remove = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    expect(clearPersonalVocabulary()).toMatchObject({ ok: false, code: 'storage-unavailable' });
    expect(readPersonalVocabularyCache()?.entries.label).toBe('display');
    remove.mockRestore();
  });

  it('restores the prior cache after the app history boundary refuses a mutation', () => {
    const result = validatePersonalVocabularyText(valid({ label: 'display' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(storePersonalVocabulary(result.payload)).toMatchObject({ ok: true });
    expect(restorePersonalVocabularyCache(null)).toBe(true);
    expect(readPersonalVocabularyCache()).toBeNull();
    expect(restorePersonalVocabularyCache(result.payload)).toBe(true);
    expect(readPersonalVocabularyCache()?.entries.label).toBe('display');
  });

  it('preserves corrupt local history instead of replacing it', () => {
    window.localStorage.setItem(PERSONAL_VOCABULARY_HISTORY_KEY, '{"corrupt":true}');
    const before = window.localStorage.getItem(PERSONAL_VOCABULARY_HISTORY_KEY);
    const result = validatePersonalVocabularyText(valid({ label: 'display' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(storePersonalVocabulary(result.payload)).toMatchObject({ ok: false, code: 'history-failed' });
    expect(window.localStorage.getItem(PERSONAL_VOCABULARY_HISTORY_KEY)).toBe(before);
    expect(readPersonalVocabularyCache()).toBeNull();
  });

  it('uses the injected C1 School adapter for reads and live suppression', () => {
    let enabled = false;
    const listeners = new Set<(next: boolean | null) => void>();
    const source = {
      readSchoolMode: () => enabled,
      subscribeSchoolMode: (listener: (next: boolean | null) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    configurePersonalVocabularyC1(source);
    expect(readPersonalVocabularySchoolMode()).toBe(false);
    const observed: boolean[] = [];
    const unsubscribe = subscribeToPersonalVocabularySchoolMode((next) => observed.push(next));
    enabled = true;
    listeners.forEach((listener) => listener(enabled));
    expect(observed).toEqual([true]);
    expect(readPersonalVocabularySchoolMode()).toBe(true);
    unsubscribe();
    enabled = false;
    listeners.forEach((listener) => listener(enabled));
    expect(observed).toEqual([true]);
  });

  it('preserves null when the canonical School adapter is unavailable', () => {
    const listeners = new Set<(next: boolean | null) => void>();
    const source = {
      readSchoolMode: () => null,
      subscribeSchoolMode: (listener: (next: boolean | null) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    configurePersonalVocabularyC1(source);
    expect(readPersonalVocabularySchoolMode()).toBeNull();
    const observed: Array<boolean | null> = [];
    const unsubscribe = subscribeToPersonalVocabularySchoolMode((next) => observed.push(next));
    listeners.forEach((listener) => listener(null));
    expect(observed).toEqual([null]);
    expect(isPersonalVocabularySuppressed()).toBe(true);
    unsubscribe();
  });

  it('restores cache and local history together after an external refusal', () => {
    const first = validatePersonalVocabularyText(valid({ label: 'display' }));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(storePersonalVocabulary(first.payload)).toMatchObject({ ok: true });
    const before = readPersonalVocabularyStateSnapshot();
    const second = validatePersonalVocabularyText(valid({ label: 'changed' }));
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(storePersonalVocabulary(second.payload)).toMatchObject({ ok: true });
    expect(restorePersonalVocabularyState(before)).toBe(true);
    const after = readPersonalVocabularyStateSnapshot();
    expect(after.payload?.entries.label).toBe('display');
    expect(after.history).toEqual(before.history);
  });

  it('rejects an unvalidated rollback payload without changing the cache', () => {
    const validResult = validatePersonalVocabularyText(valid({ label: 'display' }));
    expect(validResult.ok).toBe(true);
    if (!validResult.ok) return;
    expect(storePersonalVocabulary(validResult.payload)).toMatchObject({ ok: true });
    const invalidPayload = { schemaVersion: 1, entries: { label: 42 } } as never;
    expect(restorePersonalVocabularyCache(invalidPayload)).toBe(false);
    expect(readPersonalVocabularyCache()?.entries.label).toBe('display');
  });

  it('keeps vocabulary handling local and never calls fetch', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = validatePersonalVocabularyText(valid({ label: 'display' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(storePersonalVocabulary(result.payload)).toMatchObject({ ok: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

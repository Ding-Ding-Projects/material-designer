import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyPersonalVocabulary,
  applyPersonalVocabularyToPrivateUiKey,
  clearPersonalVocabulary,
  PERSONAL_VOCABULARY_MAX_BYTES,
  PERSONAL_VOCABULARY_MAX_DEPTH,
  PERSONAL_VOCABULARY_MAX_ENTRIES,
  PERSONAL_VOCABULARY_HISTORY_KEY,
  readPersonalVocabularyCache,
  readPersonalVocabularyHistory,
  restorePersonalVocabularyCache,
  storePersonalVocabulary,
  validatePersonalVocabularyBytes,
  validatePersonalVocabularyText,
} from '../../src/lib/personal-vocabulary';

vi.mock('../../src/components/universal/universalSettings', () => ({
  readUniversalSettings: () => ({ school: { enabled: false } }),
  UNIVERSAL_SETTINGS_EVENT: 'material-designer:universal-settings-changed',
  UNIVERSAL_SETTINGS_STORAGE_KEY: 'material-designer:universal-settings:v1',
}));

const valid = (entries: Record<string, string> = { label: 'display' }) =>
  JSON.stringify({ schemaVersion: 1, entries });

afterEach(() => {
  window.localStorage.clear();
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

  it('rejects oversized, deeply nested, and over-count inputs', () => {
    expect(validatePersonalVocabularyBytes(new Uint8Array(PERSONAL_VOCABULARY_MAX_BYTES + 1))).toMatchObject({ ok: false, code: 'too-large' });
    const deep = `${'{'.repeat(PERSONAL_VOCABULARY_MAX_DEPTH + 2)}"x":1${'}'.repeat(PERSONAL_VOCABULARY_MAX_DEPTH + 2)}`;
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
});

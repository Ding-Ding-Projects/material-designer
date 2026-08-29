import { useCallback, useEffect, useMemo, useState } from 'react';
import { useI18n } from '../i18n';
import { RegexSearchField } from './regex/RegexSearchField';
import { useRegexSearch } from './regex/useRegexSearch';
import {
  applyPersonalVocabulary,
  clearPersonalVocabulary,
  PERSONAL_VOCABULARY_MAX_BYTES,
  PERSONAL_VOCABULARY_EVENT,
  readPersonalVocabularyCache,
  readPersonalVocabularySchoolMode,
  readPersonalVocabularyStateSnapshot,
  restorePersonalVocabularyState,
  storePersonalVocabulary,
  subscribeToPersonalVocabulary,
  subscribeToPersonalVocabularySchoolMode,
  validatePersonalVocabularyBytes,
  type PersonalVocabularyLoadResult,
  type PersonalVocabularyPayload,
  type PersonalVocabularyC1,
} from '../lib/personal-vocabulary';
import styles from './PersonalVocabularySettings.module.css';

interface CopyPair {
  readonly en: string;
  readonly yue: string;
}

export type PersonalVocabularyHistoryAction = 'loaded' | 'replaced' | 'cleared' | 'deleted';
export type PersonalVocabularyHistoryMutation =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string };

/** Stable C0 identifiers used by the Settings surface and command palette. */
export const PERSONAL_VOCABULARY_SETTINGS_ID = 'personalVocabulary' as const;
export const PERSONAL_VOCABULARY_SETTINGS_SECTION = 'general' as const;
export const PERSONAL_VOCABULARY_PALETTE_ID = `setting:${PERSONAL_VOCABULARY_SETTINGS_ID}` as const;

export const PERSONAL_VOCABULARY_SETTINGS_MOUNT = Object.freeze({
  id: PERSONAL_VOCABULARY_SETTINGS_ID,
  section: PERSONAL_VOCABULARY_SETTINGS_SECTION,
  paletteId: PERSONAL_VOCABULARY_PALETTE_ID,
});

export interface PersonalVocabularySettingsProps {
  onHistoryMutation?: (
    action: PersonalVocabularyHistoryAction,
  ) => Promise<PersonalVocabularyHistoryMutation> | PersonalVocabularyHistoryMutation;
  /** C1 is injected by the app shell so this component never owns School state. */
  schoolModeSource?: PersonalVocabularyC1;
}

function useCopy() {
  const { locale, languageMode, funnyLevels } = useI18n();
  return useCallback(
    (pair: CopyPair, playful?: CopyPair): string => {
      const englishSource = playful && funnyLevels.en >= 4 ? playful.en : pair.en;
      const cantoneseSource = playful && funnyLevels['zh-HK'] >= 4 ? playful.yue : pair.yue;
      const english = toneText(englishSource, 'en', funnyLevels.en);
      const cantonese = toneText(cantoneseSource, 'yue', funnyLevels['zh-HK']);
      if (languageMode === 'bilingual') return `${english} · ${cantonese}`;
      return locale === 'zh-HK' ? cantonese : english;
    },
    [funnyLevels, languageMode, locale],
  );
}

function toneText(text: string, language: 'en' | 'yue', level: number): string {
  if (level <= 1) return text;
  const suffixes = language === 'en'
    ? ['', ' · local', ' · clear and local', ' · pleasantly local', ' · local, no cloud drama']
    : ['', ' · 本地', ' · 清楚本地', ' · 本地幾鬼馬', ' · 本地唔上雲'];
  const safeLevel = Math.min(5, Math.max(1, Math.trunc(level)));
  return `${text}${suffixes[safeLevel - 1] ?? ''}`;
}

function usePersonalVocabularyState() {
  const [payload, setPayload] = useState<PersonalVocabularyPayload | null>(() => readPersonalVocabularyCache());
  const refresh = useCallback(() => setPayload(readPersonalVocabularyCache()), []);
  useEffect(() => subscribeToPersonalVocabulary(refresh), [refresh]);
  const apply = useCallback(
    (next: PersonalVocabularyPayload | null) => {
      const result = next ? storePersonalVocabulary(next) : clearPersonalVocabulary();
      refresh();
      return result;
    },
    [refresh],
  );
  return { payload, apply };
}

function useSchoolMode(source?: PersonalVocabularyC1): boolean | null {
  const read = useCallback(() => readPersonalVocabularySchoolMode(source), [source]);
  const [enabled, setEnabled] = useState<boolean | null>(read);
  useEffect(() => {
    const unsubscribe = subscribeToPersonalVocabularySchoolMode(setEnabled, source);
    const sync = () => setEnabled(read());
    window.addEventListener(PERSONAL_VOCABULARY_EVENT, sync);
    return () => {
      unsubscribe();
      window.removeEventListener(PERSONAL_VOCABULARY_EVENT, sync);
    };
  }, [read]);
  return enabled;
}

function fileResultMessage(
  result: PersonalVocabularyLoadResult,
  c: (pair: CopyPair, playful?: CopyPair) => string,
): string {
  if (result.ok) return c(
    { en: 'Vocabulary file loaded locally.', yue: '本地 vocabulary file 載入咗。' },
    { en: 'Loaded locally, with zero cloud pigeons involved.', yue: '本地載入，冇雲端鴿仔嚟插手。' },
  );
  const messages: Record<string, CopyPair> = {
    'too-large': { en: `The file is larger than ${PERSONAL_VOCABULARY_MAX_BYTES} bytes. Nothing was changed; the previous valid cache remains active.`, yue: `個 file 大過 ${PERSONAL_VOCABULARY_MAX_BYTES} bytes，乜都冇改；上一份有效 cache 繼續生效。` },
    'duplicate-key': { en: 'Duplicate object keys are not accepted.', yue: '唔接受重複 object key。' },
    'unsupported-schema': { en: 'This schema version is not supported.', yue: '呢個 schema version 唔支援。' },
    'unexpected-field': { en: 'The file contains an unexpected field.', yue: '個 file 有唔預期欄位。' },
    'unsafe-key': { en: 'Unsafe object keys are not accepted.', yue: '唔接受唔安全 object key。' },
    'too-deep': { en: 'The file is nested too deeply.', yue: '個 file 巢得太深。' },
    'too-many-entries': { en: 'The file has too many entries.', yue: '個 file 有太多 entries。' },
    'entry-too-long': { en: 'An entry is empty or exceeds its length limit.', yue: '有 entry 係空白，或者超出長度上限。' },
    'factual-key': { en: 'Keys containing numeric facts are not accepted.', yue: '包含數字事實嘅 key 唔接受。' },
    'non-string-entry': { en: 'Every replacement must be a string.', yue: '每個 replacement 都要係 string。' },
    'invalid-shape': { en: 'The file shape is not supported.', yue: '個 file 個形狀唔支援。' },
    'malformed-json': { en: 'The file is not valid UTF-8 JSON.', yue: '個 file 唔係有效 UTF-8 JSON。' },
  };
  return c(messages[result.code] ?? messages['malformed-json']);
}

export function PersonalVocabularySettings({ onHistoryMutation, schoolModeSource }: PersonalVocabularySettingsProps) {
  const c = useCopy();
  const schoolMode = useSchoolMode(schoolModeSource);
  const { payload, apply } = usePersonalVocabularyState();
  const privateCopy = useCallback(
    (pair: CopyPair, playful?: CopyPair) => applyPersonalVocabulary(c(pair, playful), payload, 'private-ui'),
    [c, payload],
  );
  const [status, setStatus] = useState('');
  const [sample, setSample] = useState('A private UI label can be adapted here.');
  const [fileInputKey, setFileInputKey] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const search = useRegexSearch(searchQuery, setSearchQuery);
  const sampleOutput = useMemo(
    () => applyPersonalVocabulary(sample, payload, 'private-ui'),
    [payload, sample],
  );

  const onFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      if (file.size > PERSONAL_VOCABULARY_MAX_BYTES) {
        setStatus(fileResultMessage({ ok: false, code: 'too-large', message: '' }, privateCopy));
        setFileInputKey((value) => value + 1);
        return;
      }
      try {
        const result = validatePersonalVocabularyBytes(new Uint8Array(await file.arrayBuffer()));
        if (!result.ok) {
          setStatus(fileResultMessage(result, privateCopy));
          return;
        }
        const previousState = readPersonalVocabularyStateSnapshot();
        const stored = apply(result.payload);
        if (!stored.ok) {
          setStatus(privateCopy(
            { en: stored.message, yue: '本地儲存驗證唔成功，乜都冇改。' },
          ));
          return;
        }
        if (onHistoryMutation) {
          const history = await onHistoryMutation(stored.action);
          if (!history.ok) {
            restorePersonalVocabularyState(previousState);
            setStatus(privateCopy({ en: history.message, yue: '本地 Git history 未驗證，舊狀態保留。' }));
            return;
          }
        }
        setStatus(fileResultMessage(result, privateCopy));
      } catch {
        setStatus(privateCopy(
          { en: 'The file could not be read. Nothing was changed.', yue: '個 file 讀唔到，乜都冇改。' },
        ));
      } finally {
        setFileInputKey((value) => value + 1);
      }
    },
    [apply, onHistoryMutation, payload, privateCopy],
  );

  if (schoolMode !== false) return null;

  const rows = [
    privateCopy({ en: 'Personal wording file', yue: 'Personal wording file' }),
    privateCopy({ en: 'Upload a local JSON file', yue: '上載本地 JSON file' }),
    privateCopy({ en: 'Clear and restore original wording', yue: '清除並還原原本 wording' }),
    privateCopy({ en: 'Private UI preview', yue: 'Private UI 預覽' }),
  ];
  const visible = rows.some((row) => search.matches(row));
  const showDisclosure = search.matches(privateCopy({ en: 'Nothing is uploaded, networked, logged, exported, or included in history. This control changes private UI text only.', yue: '乜都唔會上載、出網、寫 log、匯出或者放入 history。呢個 control 只改私人 UI text。' }));
  const showUpload = search.matches(rows[1]);
  const showClear = search.matches(rows[2]);
  const showPreview = search.matches(rows[3]);
  if (!visible && search.query.trim()) {
    return (
      <section className={styles.section} data-od-setting="personalVocabulary" aria-labelledby="personal-vocabulary-title">
        <div className={styles.header}>
          <h3 id="personal-vocabulary-title">{privateCopy({ en: 'Personal wording', yue: 'Personal wording' })}</h3>
          <RegexSearchField search={search} fieldLabel={privateCopy({ en: 'personal wording settings', yue: 'personal wording 設定' })} placeholder={privateCopy({ en: 'Search this surface', yue: '搜尋呢個 surface' })} ariaLabel={privateCopy({ en: 'Search personal wording settings', yue: '搜尋 personal wording 設定' })} testId="personal-vocabulary-search" />
        </div>
        <p className={styles.empty} role="status">{privateCopy({ en: 'No matching controls on this surface.', yue: '呢個 surface 搵唔到相符 controls。' })}</p>
      </section>
    );
  }

  return (
    <section className={styles.section} data-od-setting="personalVocabulary" data-personal-vocabulary="true" aria-labelledby="personal-vocabulary-title">
      <div className={styles.header}>
        <div>
          <h3 id="personal-vocabulary-title">{privateCopy({ en: 'Personal wording', yue: 'Personal wording' })}</h3>
          <p className={styles.help}>
            {privateCopy(
              { en: 'Supply a versioned local JSON file to adapt private UI wording. Before a file exists, the original shipped wording remains active.', yue: '你可以提供一個有版本嘅本地 JSON file，改私人 UI wording。未有 file 之前，原本 shipped wording 照用。' },
              { en: 'Bring your own tiny wording map. It stays local, behaves itself, and does not fly to a cloud.', yue: '拎你自己嗰張細細張 wording map 嚟，留喺本地，乖乖哋唔會飛上雲。' },
            )}
          </p>
        </div>
        <RegexSearchField search={search} fieldLabel={privateCopy({ en: 'personal wording settings', yue: 'personal wording 設定' })} placeholder={privateCopy({ en: 'Search this surface', yue: '搜尋呢個 surface' })} ariaLabel={privateCopy({ en: 'Search personal wording settings', yue: '搜尋 personal wording 設定' })} testId="personal-vocabulary-search" />
      </div>

      {showDisclosure ? (
        <p className={styles.disclosure}>
          {privateCopy({ en: 'Nothing is uploaded, networked, logged, exported, or included in history. This control changes private UI text only.', yue: '乜都唔會上載、出網、寫 log、匯出或者放入 history。呢個 control 只改私人 UI text。' })}
        </p>
      ) : null}

      {showUpload ? <div className={styles.row} data-od-setting="personalVocabulary.upload">
        <div>
          <strong>{privateCopy({ en: 'Local JSON file', yue: '本地 JSON file' })}</strong>
          <span className={styles.meta} role="status" aria-live="polite">
            {payload
              ? privateCopy({ en: `${Object.keys(payload.entries).length} entries loaded locally.`, yue: `本地載入咗 ${Object.keys(payload.entries).length} 個 entries。` })
              : privateCopy({ en: 'No file loaded. Original wording is active.', yue: '未有 file，原本 wording 生效。' })}
          </span>
        </div>
        <label className={styles.fileButton}>
          <span>{payload ? privateCopy({ en: 'Replace file', yue: '換 file' }) : privateCopy({ en: 'Choose JSON file', yue: '揀 JSON file' })}</span>
          <input key={fileInputKey} type="file" accept=".json,application/json" aria-label={privateCopy(payload ? { en: 'Replace local JSON file', yue: '替換本地 JSON file' } : { en: 'Choose a local vocabulary JSON file', yue: '揀本地 vocabulary JSON file' })} onChange={(event) => void onFile(event.target.files?.[0])} />
        </label>
      </div> : null}

      {showPreview ? <div className={styles.row} data-od-setting="personalVocabulary.preview">
        <div className={styles.previewCopy}>
          <strong>{privateCopy({ en: 'Private UI preview', yue: 'Private UI 預覽' })}</strong>
          <span className={styles.meta}>{privateCopy({ en: 'Only this private boundary applies replacements.', yue: '只係呢個私人 boundary 會套用 replacements。' })}</span>
        </div>
        <div className={styles.previewFields}>
          <label>
            <span>{privateCopy({ en: 'Sample text', yue: 'Sample text' })}</span>
            <input value={sample} maxLength={2000} onChange={(event) => setSample(event.target.value)} />
          </label>
          <output aria-live="polite">{sampleOutput}</output>
        </div>
      </div> : null}

      {showClear ? <div className={styles.actions}>
        <button type="button" className="button-component button-component--text" disabled={!payload} onClick={() => { void (async () => { const previousState = readPersonalVocabularyStateSnapshot(); const result = apply(null); if (!result.ok) { setStatus(privateCopy({ en: result.message, yue: '本地清除驗證唔成功，原本狀態保留。' })); return; } if (onHistoryMutation) { const history = await onHistoryMutation('cleared'); if (!history.ok) { restorePersonalVocabularyState(previousState); setStatus(privateCopy({ en: history.message, yue: '本地 Git history 未驗證，舊狀態保留。' })); return; } } setStatus(privateCopy({ en: 'Cleared. Original wording is active again.', yue: '清除咗，原本 wording 再次生效。' })); })(); }}>
          {privateCopy({ en: 'Clear and restore original wording', yue: '清除並還原原本 wording' })}
        </button>
      </div> : null}
      {status ? <p className={styles.status} role="status" aria-live="polite">{status}</p> : null}
    </section>
  );
}

/** C0 render hook for SettingsDialog and the command-palette teleport target. */
export function mountPersonalVocabularySettings(
  props: PersonalVocabularySettingsProps = {},
) {
  return <PersonalVocabularySettings {...props} />;
}


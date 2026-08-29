import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { getOpenDesignHost } from '@open-design/host';
import { useI18n } from '../../i18n';
import { useNarrator } from '../narrator/narrator';
import type { AppVersionInfo } from '../../types';
import { RegexSearchField } from '../regex/RegexSearchField';
import { useRegexSearch } from '../regex/useRegexSearch';
import styles from './UniversalSettingsPanel.module.css';
import {
  appendNotification,
  chooseVoiceId,
  createDefaultUniversalSettings,
  createScheduleRule,
  createStatusCards,
  narrationParts,
  narratorLanguageOrder,
  normalizeUniversalSettings,
  readUniversalSettings,
  resolveScheduledSettings,
  scheduleRuleMatches,
  scheduleSourceRequest,
  subscribeUniversalSettings,
  validateScheduleRule,
  writeUniversalSettings,
  getUniversalSettingsHost,
  getUniversalStatusHub,
  type UniversalAdhdMode,
  type UniversalLanguageMode,
  type UniversalNarratorLanguage,
  type UniversalScheduleRule,
  type UniversalSettingsState,
} from './universalSettings';
import { ADHD_MODE_LABELS, ADHD_MODE_ORDER } from './adhd';
import { SCHOOL_MODE_VISIBLE_SECTIONS } from './schoolMode';
import { TOY_LOCK_POLICIES, type ToyLockPolicy } from '../../security/toy-lock-core';
import { ToyLockAuthenticationPopover, type ToyLockVerificationRequest } from '../ToyLockAuthenticationPopover';
import { DestructiveGate } from '../destructive/DestructiveGate';
import {
  clearNotificationIds,
  markNotificationIdsRead,
  useNotifications,
  type NotificationRecord,
} from '../notifications/notificationStore';

export interface UniversalSettingsPanelProps {
  appVersionInfo?: AppVersionInfo | null;
  initialSection?: SectionId;
  mountAcknowledged?: boolean;
}

type SectionId = 'language' | 'school' | 'narrator' | 'schedule' | 'adhd' | 'notifications' | 'status';

const SECTION_IDS: readonly SectionId[] = [
  'language',
  'school',
  'narrator',
  'schedule',
  'adhd',
  'notifications',
  'status',
];

const SECTION_LABELS: Record<SectionId, { en: string; yue: string }> = {
  language: { en: 'Language and tone', yue: '語言同語氣' },
  school: { en: 'School mode and display name', yue: 'School mode 同顯示名稱' },
  narrator: { en: 'Narrator', yue: '旁白' },
  schedule: { en: 'Scheduled settings', yue: '排程設定' },
  adhd: { en: 'Attention modes', yue: '專注模式' },
  notifications: { en: 'Notifications', yue: '通知' },
  status: { en: 'Status Hub', yue: '狀態 Hub' },
};

const COPY: Record<string, { en: string; yue: string; levels?: Partial<Record<1 | 2 | 3 | 4 | 5, { en: string; yue: string }>> }> = {
  heading: { en: 'Universal settings', yue: '通用設定' },
  lede: { en: 'These settings belong to this app and its local companion surfaces. Changes propagate live to open surfaces.', yue: '呢啲設定屬於呢個 app 同本機配套頁面，改動會即時傳去開住嘅介面。' },
  mode: { en: 'Language mode', yue: '語言模式' },
  modeHelp: { en: 'Choose English, playful Hong Kong Cantonese, or bilingual copy.', yue: '揀英文、玩味香港粵語，或者雙語內容。' },
  funny: { en: 'Funny level', yue: '搞笑程度', levels: { 1: { en: 'Fully serious', yue: '正經到底' }, 2: { en: 'Dry', yue: '淡淡然' }, 3: { en: 'Warm', yue: '有溫度' }, 4: { en: 'Cheeky', yue: '鬼馬' }, 5: { en: 'Maximum playfulness', yue: '玩到最盡' } } },
  funnyHelp: { en: 'English and Cantonese are independent. The level changes voice, never facts, including warnings and errors.', yue: '英文同粵語各自獨立，程度只改語氣唔改事實，包括警告同錯誤。' },
  emoji: { en: 'Show emojis in dialogs and message boxes', yue: '喺對話框同訊息框顯示 emoji' },
  displayName: { en: 'Display name', yue: '顯示名稱' },
  displayNameHelp: { en: 'This changes visible labels only. Package identity, install location, update feed, and data location stay unchanged.', yue: '只會改畫面見到嘅名稱，套件身份、安裝位置、更新來源同資料位置唔會郁。' },
  school: { en: 'School mode', yue: 'School mode' },
  schoolHelp: { en: 'When on, surfaces use English and suppress Cantonese, bilingual, funny-level, vocabulary, and dim sum controls until unlocked.', yue: '開啟後，介面用英文，隱藏粵語、雙語、搞笑程度、詞彙同點心控制，解鎖後先恢復。' },
  credential: { en: 'Shared unlock credential', yue: '共用解鎖憑證' },
  credentialHelp: { en: 'The shared credential is stored by the host vault. This panel stores only whether a record exists.', yue: '共用憑證由主機保管庫保存，呢度只記錄有冇設定，唔會保存秘密內容。' },
  configure: { en: 'Open credential setup', yue: '開啟憑證設定' },
  unavailable: { en: 'Host credential setup is unavailable in this surface.', yue: '呢個介面暫時冇主機憑證設定。' },
  narratorHelp: { en: 'Off by default. Both speaks English first, then Cantonese, one utterance at a time.', yue: '預設關閉。雙語會先講英文，再講粵語，一句一句排隊。' },
  narratorOn: { en: 'Enable narrator', yue: '開啟旁白' },
  narratorLanguage: { en: 'Narrated language', yue: '旁白語言' },
  automatic: { en: 'Choose automatically', yue: '自動選擇' },
  voiceUnavailable: { en: 'The selected voice is not installed. The choice is kept and the runtime falls back.', yue: '揀選嘅聲音未安裝，選擇會保留，但執行時會退回可用聲音。' },
  noSpeech: { en: 'Speech synthesis is unavailable on this computer.', yue: '呢部電腦冇語音合成。' },
  speak: { en: 'Speak sample', yue: '讀出樣本' },
  stop: { en: 'Stop narrator', yue: '停止旁白' },
  scheduleHelp: { en: 'Rules use the local timezone shown by this computer. External sources are validated and fail safe to the local base value.', yue: '規則用呢部電腦顯示嘅本地時區。外部來源會驗證，失敗就安全退回本機基準值。' },
  addSchedule: { en: 'Add local schedule', yue: '加入本機排程' },
  invalidSchedule: { en: 'This rule is incomplete or invalid. It will not be applied.', yue: '呢條規則未完整或者無效，唔會套用。' },
  adhdHelp: { en: 'These are interface accommodations, not medical features. Every mode is off until you choose it.', yue: '呢啲係介面配合，唔係醫療功能。每個模式都要你自己開先會生效。' },
  notificationsHelp: { en: 'Notifications are local, reviewable, and bulk-manageable. Nothing is sent by this panel.', yue: '通知只喺本機保存，可以翻查同批量管理，呢個面板唔會傳送資料。' },
  selectAll: { en: 'Select all visible', yue: '揀晒可見項目' },
  invert: { en: 'Invert selection', yue: '反轉選擇' },
  markRead: { en: 'Mark selected read', yue: '標記所選為已讀' },
  clear: { en: 'Clear selected', yue: '清除所選' },
  empty: { en: 'Nothing matches this search.', yue: '冇項目符合呢個搜尋。' },
  reset: { en: 'Reset universal settings', yue: '重設通用設定' },
  statusHelp: { en: 'This is an evidence view. A missing provenance value is shown as unavailable, never guessed.', yue: '呢度係證據檢視，缺少來源資料就顯示未有，絕不估。' },
  verified: { en: 'Verified', yue: '已驗證' },
  running: { en: 'Running', yue: '進行中' },
  unrun: { en: 'Unrun', yue: '未執行' },
};

function copy(key: string, state: UniversalSettingsState, vars: Record<string, string | number> = {}): string {
  if (key === 'school') return state.school.name;
  const item = COPY[key] ?? { en: key, yue: key };
  const language = state.school.enabled ? 'english' : state.languageMode;
  const englishLevel: 1 | 2 | 3 | 4 | 5 = state.school.enabled ? 1 : state.funnyEnglish;
  const cantoneseLevel: 1 | 2 | 3 | 4 | 5 = state.school.enabled ? 1 : state.funnyCantonese;
  const englishItem = item.levels?.[englishLevel];
  const cantoneseItem = item.levels?.[cantoneseLevel];
  const en = englishItem?.en ?? item.en;
  const yue = cantoneseItem?.yue ?? item.yue;
  const selected = language === 'cantonese' ? yue : language === 'bilingual' ? `${en} · ${yue}` : en;
  return selected.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`));
}

function modeLabel(mode: UniversalLanguageMode, state: UniversalSettingsState): string {
  if (mode === 'english') return state.languageMode === 'cantonese' ? '英文' : 'English';
  if (mode === 'cantonese') return state.languageMode === 'english' ? 'Playful Hong Kong Cantonese' : '玩味香港粵語';
  return state.languageMode === 'cantonese' ? '雙語' : 'Bilingual';
}

function safeVoiceLanguage(voice: SpeechSynthesisVoice): 'english' | 'cantonese' | null {
  if (/^en(?:-|$)/i.test(voice.lang)) return 'english';
  if (/^(?:zh-(?:HK|Hant)|yue)(?:-|$)/i.test(voice.lang)) return 'cantonese';
  return null;
}

function useUniversalSettings(): [UniversalSettingsState, (patch: Partial<UniversalSettingsState>) => void] {
  const [state, setState] = useState<UniversalSettingsState>(() =>
    getUniversalSettingsHost() ? createDefaultUniversalSettings() : readUniversalSettings(),
  );
  const stateRef = useRef(state);
  const writeQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  useEffect(() => {
    const bridge = getUniversalSettingsHost();
    if (bridge) {
      let mounted = true;
      void bridge.read().then((result) => {
        if (!mounted || !result.ok) return;
        const next = normalizeUniversalSettings(result.state);
        stateRef.current = next;
        setState(next);
      });
      const unsubscribe = bridge.subscribe((value) => {
        const next = normalizeUniversalSettings(value);
        stateRef.current = next;
        setState(next);
      });
      return () => {
        mounted = false;
        unsubscribe();
      };
    }
    return subscribeUniversalSettings((next) => {
      stateRef.current = next;
      setState(next);
    });
  }, []);
  const update = useCallback((patch: Partial<UniversalSettingsState>) => {
    const current = stateRef.current;
    const candidate = normalizeUniversalSettings({
      ...current,
      ...patch,
      revision: current.revision + 1,
      updatedAt: Date.now(),
    });
    stateRef.current = candidate;
    setState(candidate);
    const bridge = getUniversalSettingsHost();
    if (!bridge) {
      stateRef.current = writeUniversalSettings({ ...current, ...patch });
      setState(stateRef.current);
      return;
    }
    writeQueueRef.current = writeQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const result = await bridge.write(candidate, current.revision);
        if (result.ok) {
          const next = normalizeUniversalSettings(result.state);
          stateRef.current = next;
          setState(next);
          return;
        }
        const refreshed = await bridge.read();
        if (refreshed.ok) {
          const next = normalizeUniversalSettings(refreshed.state);
          stateRef.current = next;
          setState(next);
        }
      });
  }, []);
  return [state, update];
}

export function UniversalSettingsPanel({ appVersionInfo = null, initialSection = 'language', mountAcknowledged = false }: UniversalSettingsPanelProps) {
  const [state, update] = useUniversalSettings();
  const { setLocale, setLanguageMode, setFunnyLevel } = useI18n();
  const narratorRuntime = useNarrator();
  const [active, setActive] = useState<SectionId>(initialSection);
  const [selectedNotifications, setSelectedNotifications] = useState<Set<string>>(() => new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [speechAvailable, setSpeechAvailable] = useState(false);

  useEffect(() => {
    if (state.school.enabled && active !== 'school' && active !== 'status') setActive('school');
  }, [active, state.school.enabled]);

  useEffect(() => {
    if (typeof document !== 'undefined') document.title = state.displayName;
  }, [state.displayName]);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      const root = document.documentElement;
      root.setAttribute('data-universal-school-mode', String(state.school.enabled));
      root.setAttribute('data-universal-school-name', state.school.name);
      root.setAttribute('data-universal-dialog-emoji', String(state.showDialogEmoji));
      root.setAttribute('data-universal-display-name', state.displayName);
    }
    if (state.school.enabled) {
      setLocale('en');
      setLanguageMode('single');
    } else if (state.languageMode === 'cantonese') {
      setLocale('zh-HK');
      setLanguageMode('single');
    } else if (state.languageMode === 'bilingual') {
      setLocale('en');
      setLanguageMode('bilingual');
    } else {
      setLocale('en');
      setLanguageMode('single');
    }
    setFunnyLevel('en', state.funnyEnglish);
    setFunnyLevel('zh-HK', state.funnyCantonese);
  }, [setFunnyLevel, setLanguageMode, setLocale, state.displayName, state.funnyCantonese, state.funnyEnglish, state.languageMode, state.school.enabled, state.showDialogEmoji]);

  useEffect(() => {
    const language = state.narrator.language === 'english'
      ? 'en'
      : state.narrator.language === 'cantonese'
        ? 'zh-HK'
        : 'both';
    const current = narratorRuntime.preferences;
    if (current.enabled === state.narrator.enabled && current.language === language && current.quiet === state.narrator.quiet && current.rate === state.narrator.rate && current.pitch === state.narrator.pitch && current.englishVoiceId === state.narrator.englishVoiceId && current.cantoneseVoiceId === state.narrator.cantoneseVoiceId) return;
    narratorRuntime.setPreferences({ ...current, enabled: state.narrator.enabled, language, quiet: state.narrator.quiet, rate: state.narrator.rate, pitch: state.narrator.pitch, englishVoiceId: state.narrator.englishVoiceId, cantoneseVoiceId: state.narrator.cantoneseVoiceId });
  }, [narratorRuntime.preferences.enabled, narratorRuntime.preferences.language, narratorRuntime.preferences.quiet, narratorRuntime.preferences.rate, narratorRuntime.preferences.pitch, narratorRuntime.preferences.englishVoiceId, narratorRuntime.preferences.cantoneseVoiceId, narratorRuntime.setPreferences, state.narrator.enabled, state.narrator.language, state.narrator.quiet, state.narrator.rate, state.narrator.pitch, state.narrator.englishVoiceId, state.narrator.cantoneseVoiceId]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return undefined;
    setSpeechAvailable(true);
    const read = () => setVoices(window.speechSynthesis.getVoices());
    read();
    window.speechSynthesis.addEventListener('voiceschanged', read);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', read);
  }, []);

  const visibleSections: readonly SectionId[] = state.school.enabled
    ? SCHOOL_MODE_VISIBLE_SECTIONS
    : SECTION_IDS;
  const displayVersion = appVersionInfo?.version ?? null;
  const displayUpdatedAt = (appVersionInfo as (AppVersionInfo & { updatedAt?: string }) | null)?.updatedAt ?? null;

  const updateState = useCallback((patch: Partial<UniversalSettingsState>) => {
    update(patch);
    setNotice(null);
  }, [update]);

  return (
    <section className={styles.panel} data-testid="universal-settings-panel" data-od-setting="universal-settings">
      <div className={styles.sectionHead}>
        <h3 className={styles.heading}>{copy('heading', state)}</h3>
        <p className={styles.lede}>{copy('lede', state)}</p>
      </div>
      <div className={styles.tabs} role="tablist" aria-label={copy('heading', state)}>
        {visibleSections.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={id === active}
            tabIndex={id === active ? 0 : -1}
            id={`universal-settings-tab-${id}`}
            aria-controls={`universal-settings-${id}`}
            className={styles.tab}
            onClick={() => setActive(id)}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft' && event.key !== 'Home' && event.key !== 'End') return;
              event.preventDefault();
              const currentIndex = visibleSections.indexOf(id);
              const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? visibleSections.length - 1 : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + visibleSections.length) % visibleSections.length;
              const nextId = visibleSections[nextIndex] ?? id;
              setActive(nextId);
              window.requestAnimationFrame(() => document.getElementById(`universal-settings-tab-${nextId}`)?.focus());
            }}
          >
            {sectionText(id, state)}
          </button>
        ))}
      </div>
      {notice ? <p className={styles.notice} role="status" aria-live="polite">{notice}</p> : null}
      {active === 'language' ? <LanguageSection state={state} update={updateState} /> : null}
      {active === 'school' ? <SchoolSection state={state} update={updateState} /> : null}
      {active === 'narrator' ? <NarratorSection state={state} update={updateState} voices={voices} speechAvailable={speechAvailable} /> : null}
      {active === 'schedule' ? <ScheduleSection state={state} update={updateState} /> : null}
      {active === 'adhd' ? <AdhdSection state={state} update={updateState} /> : null}
      {active === 'notifications' ? <NotificationsSection state={state} selected={selectedNotifications} setSelected={setSelectedNotifications} /> : null}
      {active === 'status' ? <StatusSection state={state} version={displayVersion} updatedAt={displayUpdatedAt} sourceRevision={appVersionInfo?.provenance?.sourceCommit ?? null} mountedAcknowledged={mountAcknowledged} /> : null}
      <div className={styles.buttonRow}>
        <button type="button" className={`${styles.button} ${styles.buttonDanger}`} onClick={() => update(createDefaultUniversalSettings())}>
          {copy('reset', state)}
        </button>
        <span className={styles.hint}>Revision {state.revision}</span>
      </div>
    </section>
  );
}

function sectionText(id: SectionId, state: UniversalSettingsState): string {
  if (id === 'school') return state.school.name;
  const labels = SECTION_LABELS[id];
  return state.school.enabled || state.languageMode === 'english'
    ? labels.en
    : state.languageMode === 'cantonese'
      ? labels.yue
      : `${labels.en} · ${labels.yue}`;
}

function SectionShell({ id, title, hint, state, children, items }: { id: SectionId; title: string; hint: string; state: UniversalSettingsState; children: ReactNode; items: string[] }) {
  const [query, setQuery] = useState('');
  const search = useRegexSearch(query, setQuery);
  const matches = search.matches;
  const filtered = items.filter((item) => matches(item));
  const sectionRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const controls = sectionRef.current?.querySelectorAll<HTMLElement>('[data-universal-search-value]');
    controls?.forEach((control) => {
      const value = control.dataset.universalSearchValue ?? '';
      control.hidden = Boolean(query.trim()) && !matches(value);
    });
  }, [matches, query]);
  return (
    <div ref={sectionRef} id={`universal-settings-${id}`} className={styles.section} role="tabpanel" aria-labelledby={`universal-settings-tab-${id}`}>
      <div className={styles.sectionHead}><h4 className={styles.sectionTitle}>{title}</h4><p className={styles.sectionHint}>{hint}</p></div>
      <RegexSearchField search={search} fieldLabel={title} ariaLabel={title} placeholder={state.languageMode === 'cantonese' ? '搜尋此分頁' : 'Search this tab'} className={styles.search} testId={`universal-search-${id}`} />
      {query.trim() && filtered.length === 0 ? <p className={styles.empty}>{copy('empty', state)}</p> : children}
    </div>
  );
}

function LanguageSection({ state, update }: { state: UniversalSettingsState; update: (patch: Partial<UniversalSettingsState>) => void }) {
  const items = [COPY.mode.en, COPY.mode.yue, COPY.funny.en, COPY.emoji.en, COPY.displayName.en];
  return <SectionShell id="language" title={copy('mode', state)} hint={copy('modeHelp', state)} state={state} items={items}>
    <div className={styles.cardGrid}>
      <div className={styles.card} data-universal-search-value={COPY.mode.en}>
        <SearchableChoice id="universal-language-mode" label={copy('mode', state)} value={state.languageMode} options={[{ value: 'english', label: modeLabel('english', state) }, { value: 'cantonese', label: modeLabel('cantonese', state) }, { value: 'bilingual', label: modeLabel('bilingual', state) }]} onChange={(value) => update({ languageMode: value as UniversalLanguageMode })} state={state} />
      </div>
      <FunnySlider id="universal-funny-english" label="English" value={state.funnyEnglish} onChange={(value) => update({ funnyEnglish: value })} state={state} />
      <FunnySlider id="universal-funny-cantonese" label="Cantonese · 粵語" value={state.funnyCantonese} onChange={(value) => update({ funnyCantonese: value })} state={state} />
      <label className={styles.checkRow} data-od-setting="universal.showDialogEmoji" data-universal-search-value={COPY.emoji.en}>
        <input type="checkbox" checked={state.showDialogEmoji} onChange={(event) => update({ showDialogEmoji: event.target.checked })} />
        <span className={styles.rowText}><span className={styles.label}>{copy('emoji', state)}</span><span className={styles.hint}>{copy('funnyHelp', state)}</span></span>
      </label>
    </div>
  </SectionShell>;
}

function FunnySlider({ id, label, value, onChange, state }: { id: string; label: string; value: 1 | 2 | 3 | 4 | 5; onChange: (value: 1 | 2 | 3 | 4 | 5) => void; state: UniversalSettingsState }) {
  const settingId = id.includes('cantonese') ? 'universal.funnyCantonese' : 'universal.funnyEnglish';
  return <div className={styles.card} data-od-setting={settingId} data-universal-search-value={label}>
    <label className={styles.label} htmlFor={id}>{label}</label>
    <input id={id} className={styles.range} type="range" min="1" max="5" step="1" value={value} onChange={(event) => onChange(Number(event.target.value) as 1 | 2 | 3 | 4 | 5)} />
    <span className={styles.rangeValue} aria-live="polite">{value} · {copy('funny', state)}</span>
    <p className={styles.hint}>{copy('funnyHelp', state)}</p>
  </div>;
}

function SearchableChoice({ id, label, value, options, onChange, state, disabled = false }: { id: string; label: string; value: string; options: readonly { value: string; label: string }[]; onChange: (value: string) => void; state: UniversalSettingsState; disabled?: boolean }) {
  const [query, setQuery] = useState('');
  const search = useRegexSearch(query, setQuery);
  const visible = options.filter((option) => search.matches(option.label));
  return <div className={styles.section}><label className={styles.label} htmlFor={id}>{label}</label><RegexSearchField search={search} fieldLabel={label} ariaLabel={`Search choices for ${label}`} placeholder="Search choices" className={styles.search} testId={`${id}-search`} disabled={disabled} /><select id={id} className={styles.select} disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)}>{visible.length ? visible.map((option) => <option key={option.value} value={option.value}>{option.label}</option>) : <option value={value}>{copy('empty', state)}</option>}</select></div>;
}

function SchoolSection({ state, update }: { state: UniversalSettingsState; update: (patch: Partial<UniversalSettingsState>) => void }) {
  const items = [state.school.name, COPY.displayName.en, COPY.credential.en];
  const [configureOpen, setConfigureOpen] = useState(false);
  const [policy, setPolicy] = useState<ToyLockPolicy>('password');
  const [pin, setPin] = useState('');
  const [password, setPassword] = useState('');
  const [totpSecret, setTotpSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authRevision, setAuthRevision] = useState<number | null>(null);
  const schoolControlRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const host = getOpenDesignHost();
    if (!host?.toyLocks) return;
    void host.toyLocks.list().then((result) => {
      const lock = result.ok ? result.locks.find((item) => item.targetId === 'general') : undefined;
      if (lock) {
        setAuthRevision(lock.revision);
        setPolicy(lock.policy);
      }
    }).catch(() => undefined);
  }, [state.school.credentialConfigured]);
  const configure = async () => {
    const host = getOpenDesignHost();
    if (!host?.toyLocks) {
      setError(copy('unavailable', state));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await host.toyLocks.configure({
        targetId: 'general',
        policy,
        expectedRevision: null,
        factors: {
          ...(pin ? { pin } : {}),
          ...(password ? { password } : {}),
          ...(totpSecret ? { totpSecretBase32: totpSecret } : {}),
        },
      });
      if (!result.ok) {
        setError(`Credential setup was refused: ${result.code}`);
        return;
      }
      setAuthRevision(result.lock.revision);
      update({ school: { ...state.school, credentialConfigured: true, credentialBackend: 'host-vault' } });
      setConfigureOpen(false);
      setPin('');
      setPassword('');
      setTotpSecret('');
    } catch {
      setError('Credential setup could not be completed. No secret was stored by this surface.');
    } finally {
      setBusy(false);
    }
  };
  return <SectionShell id="school" title={copy('school', state)} hint={copy('schoolHelp', state)} state={state} items={items}>
    <div className={styles.cardGrid}>
      <label className={styles.card} data-od-setting="universal.displayName" data-universal-search-value={COPY.displayName.en}><span className={styles.label}>{copy('displayName', state)}</span><input className={styles.textInput} value={state.displayName} maxLength={120} onChange={(event) => update({ displayName: event.target.value })} /><span className={styles.hint}>{copy('displayNameHelp', state)}</span></label>
      <label className={styles.checkRow} data-od-setting="universal.schoolMode" data-universal-search-value={COPY.school.en}><input ref={schoolControlRef} type="checkbox" checked={state.school.enabled} onChange={(event) => { if (event.target.checked) { update({ school: { ...state.school, enabled: true } }); return; } event.target.checked = true; if (state.school.credentialConfigured && authRevision !== null) setAuthOpen(true); else setError('Configure the shared credential before disabling this mode.'); }} /><span className={styles.rowText}><span className={styles.label}>{copy('school', state)}</span><span className={styles.hint}>{copy('schoolHelp', state)}</span></span></label>
      <label className={styles.card} data-od-setting="universal.schoolName" data-universal-search-value={COPY.school.en}><span className={styles.label}>{copy('school', state)} name</span><input className={styles.textInput} value={state.school.name} maxLength={80} onChange={(event) => update({ school: { ...state.school, name: event.target.value } })} /></label>
      <div className={styles.card} data-od-setting="universal.schoolCredential" data-universal-search-value={COPY.credential.en}><span className={styles.label}>{copy('credential', state)}</span><span className={styles.hint}>{copy('credentialHelp', state)}</span><span className={styles.statusChip}>{state.school.credentialConfigured ? 'Configured' : 'Not configured'}</span><button type="button" className={styles.button} onClick={() => setConfigureOpen((value) => !value)}>{copy('configure', state)}</button>{configureOpen ? <div className={styles.section}><SearchableChoice id="universal-school-policy" label="Policy" value={policy} options={TOY_LOCK_POLICIES.map((value) => ({ value, label: value }))} onChange={(value) => setPolicy(value as ToyLockPolicy)} state={state} disabled={busy} />{policy.includes('pin') ? <label className={styles.label}>PIN<input className={styles.textInput} type="password" inputMode="numeric" autoComplete="new-password" value={pin} onChange={(event) => setPin(event.target.value)} /></label> : null}{policy.includes('password') ? <label className={styles.label}>Password<input className={styles.textInput} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label> : null}{policy.includes('totp') ? <label className={styles.label}>TOTP secret<input className={styles.textInput} type="password" autoComplete="off" value={totpSecret} onChange={(event) => setTotpSecret(event.target.value)} /></label> : null}<div className={styles.buttonRow}><button type="button" className={`${styles.button} ${styles.buttonPrimary}`} disabled={busy} onClick={() => void configure()}>{busy ? 'Saving…' : 'Save in host vault'}</button><button type="button" className={styles.button} disabled={busy} onClick={() => { setConfigureOpen(false); setPin(''); setPassword(''); setTotpSecret(''); }}>Cancel</button></div>{error ? <p className={styles.notice} role="alert">{error}</p> : null}</div> : null}</div>
      {authOpen && authRevision !== null ? <ToyLockAuthenticationPopover targetId="general" targetLabel={state.school.name} policy={policy} anchor={schoolControlRef.current} verifyFactor={async (request: ToyLockVerificationRequest) => { const host = getOpenDesignHost(); if (!host?.toyLocks) return false; const factors = request.factor === 'pin' ? { pin: request.value } : request.factor === 'password' ? { password: request.value } : { totp: request.value }; const result = await host.toyLocks.verify({ targetId: 'general', revision: authRevision, factors }); return result.ok && result.matched; }} onAuthenticated={() => { setAuthOpen(false); update({ school: { ...state.school, enabled: false } }); }} onCancel={() => setAuthOpen(false)} /> : null}
    </div>
  </SectionShell>;
}

function NarratorSection({ state, update, voices, speechAvailable }: { state: UniversalSettingsState; update: (patch: Partial<UniversalSettingsState>) => void; voices: SpeechSynthesisVoice[]; speechAvailable: boolean }) {
  const items = [COPY.narratorOn.en, COPY.narratorLanguage.en, COPY.speak.en, COPY.stop.en];
  const englishVoices = voices.filter((voice) => safeVoiceLanguage(voice) === 'english');
  const cantoneseVoices = voices.filter((voice) => safeVoiceLanguage(voice) === 'cantonese');
  const setNarrator = (patch: Partial<UniversalSettingsState['narrator']>) => update({ narrator: { ...state.narrator, ...patch } });
  const speak = () => {
    if (!speechAvailable || typeof window === 'undefined') return;
    window.speechSynthesis.cancel();
    const parts = narrationParts({ english: 'The narrator is active.', cantonese: '旁白而家開咗。' }, state.narrator.language);
    let partIndex = 0;
    const order = narratorLanguageOrder(state.narrator.language);
    const playNext = () => {
      const language = order[partIndex];
      const text = language === 'english' ? parts[0] : language === 'cantonese' ? parts[1] : undefined;
      partIndex += 1;
      if (!text) return;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = state.narrator.rate;
      utterance.pitch = state.narrator.pitch;
      const preferred = language === 'english' ? state.narrator.englishVoiceId : state.narrator.cantoneseVoiceId;
      const voiceId = chooseVoiceId(voices, language, preferred);
      utterance.voice = voices.find((voice) => voice.voiceURI === voiceId) ?? null;
      utterance.onend = playNext;
      window.speechSynthesis.speak(utterance);
    };
    playNext();
  };
  return <SectionShell id="narrator" title={copy('narratorOn', state)} hint={copy('narratorHelp', state)} state={state} items={items}>
    <div className={styles.cardGrid}>
      <label className={styles.checkRow} data-universal-search-value={COPY.narratorOn.en}><input type="checkbox" checked={state.narrator.enabled} onChange={(event) => setNarrator({ enabled: event.target.checked })} /><span className={styles.label}>{copy('narratorOn', state)}</span></label>
      <div className={styles.card} data-universal-search-value={COPY.narratorLanguage.en}><SearchableChoice id="universal-narrator-language" label={copy('narratorLanguage', state)} value={state.narrator.language} options={[{ value: 'english', label: 'English' }, { value: 'cantonese', label: '粵語' }, { value: 'both', label: 'Both · 兩種' }]} onChange={(value) => setNarrator({ language: value as UniversalNarratorLanguage })} state={state} disabled={!state.narrator.enabled} /></div>
      <VoicePicker label="English voice" voices={englishVoices} selected={state.narrator.englishVoiceId} disabled={!state.narrator.enabled} onChange={(value) => setNarrator({ englishVoiceId: value })} state={state} />
      <VoicePicker label="Cantonese voice · 粵語聲音" voices={cantoneseVoices} selected={state.narrator.cantoneseVoiceId} disabled={!state.narrator.enabled} onChange={(value) => setNarrator({ cantoneseVoiceId: value })} state={state} />
      <div className={styles.card} data-universal-search-value="Rate"><label className={styles.label} htmlFor="universal-narrator-rate">Rate {state.narrator.rate.toFixed(1)}</label><input id="universal-narrator-rate" className={styles.range} type="range" min="0.1" max="3" step="0.1" value={state.narrator.rate} onChange={(event) => setNarrator({ rate: Number(event.target.value) })} /><label className={styles.label} htmlFor="universal-narrator-pitch">Pitch {state.narrator.pitch.toFixed(1)}</label><input id="universal-narrator-pitch" className={styles.range} type="range" min="0" max="2" step="0.1" value={state.narrator.pitch} onChange={(event) => setNarrator({ pitch: Number(event.target.value) })} /></div>
    </div>
    <div className={styles.buttonRow} data-universal-search-value={COPY.speak.en + ' ' + COPY.stop.en}><button type="button" className={`${styles.button} ${styles.buttonPrimary}`} disabled={!state.narrator.enabled || !speechAvailable} onClick={speak}>{copy('speak', state)}</button><button type="button" className={styles.button} disabled={!speechAvailable} onClick={() => window.speechSynthesis.cancel()}>{copy('stop', state)}</button></div>
    {!speechAvailable ? <p className={styles.notice}>{copy('noSpeech', state)}</p> : voices.length === 0 ? <p className={styles.notice}>{copy('voiceUnavailable', state)}</p> : englishVoices.length === 0 || cantoneseVoices.length === 0 ? <p className={styles.notice}>{copy('voiceUnavailable', state)}</p> : null}
  </SectionShell>;
}

function VoicePicker({ label, voices, selected, disabled, onChange, state }: { label: string; voices: SpeechSynthesisVoice[]; selected: string | null; disabled: boolean; onChange: (value: string | null) => void; state: UniversalSettingsState }) {
  const selectedMissing = selected !== null && !voices.some((voice) => voice.voiceURI === selected);
  return <div className={styles.card} data-universal-search-value={label}><SearchableChoice id={`voice-${label.replace(/\W+/g, '-').toLowerCase()}`} label={label} value={selected ?? ''} options={[{ value: '', label: copy('automatic', state) }, ...voices.map((voice) => ({ value: voice.voiceURI, label: `${voice.name} · ${voice.lang}` }))]} onChange={(value) => onChange(value || null)} state={state} disabled={disabled} />{selectedMissing ? <span className={styles.hint}>{copy('voiceUnavailable', state)}</span> : null}</div>;
}

function ScheduleSection({ state, update }: { state: UniversalSettingsState; update: (patch: Partial<UniversalSettingsState>) => void }) {
  const [externalResults, setExternalResults] = useState<Record<string, { ok: boolean; detail: string; values?: Record<string, unknown>; sourceState?: 'on' | 'off' | 'local' }>>({});
  const [homeAssistantToken, setHomeAssistantToken] = useState('');
  const [homeAssistantTokenStatus, setHomeAssistantTokenStatus] = useState<string | null>(null);
  const items = state.schedules.map((rule) => `${rule.label} ${rule.source} ${rule.startTime} ${rule.endTime}`);
  const add = () => update({ schedules: [...state.schedules, createScheduleRule()] });
  const updateRule = (id: string, patch: Partial<UniversalScheduleRule>) => update({ schedules: state.schedules.map((rule) => rule.id === id ? { ...rule, ...patch } : rule) });
  const remove = (id: string) => update({ schedules: state.schedules.filter((rule) => rule.id !== id) });
  useEffect(() => {
    const bridge = getUniversalSettingsHost();
    if (!bridge) return undefined;
    let cancelled = false;
    const external = state.schedules.filter((rule) => rule.source !== 'local');
    void Promise.all(external.map(async (rule) => {
      const request = scheduleSourceRequest(rule);
      if (!request) return [rule.id, { ok: false, code: 'invalid-input', detail: 'Source rule is invalid and was not sent to the host.' }] as const;
      const result = await bridge.resolveSchedule(request);
      return [rule.id, result] as const;
    })).then((entries) => {
      if (cancelled) return;
      const next: Record<string, { ok: boolean; detail: string; values?: Record<string, unknown>; sourceState?: 'on' | 'off' | 'local' }> = {};
      for (const [id, result] of entries) {
        next[id] = result.ok
          ? { ok: true, detail: `Source observed at ${new Date(result.observedAt).toISOString()}`, values: result.values, sourceState: result.sourceState }
          : { ok: false, detail: `Source unavailable: ${result.code}` };
      }
      setExternalResults(next);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [state.schedules]);
  const effectiveRules = state.schedules.flatMap((rule) => {
    const result = externalResults[rule.id];
    if (rule.source !== 'local' && (!result?.ok || result.values === undefined || result.sourceState === 'off')) return [];
    return result?.ok && result.values
      ? [{ ...rule, values: { ...rule.values, ...result.values } as UniversalScheduleRule['values'] }]
      : [rule];
  });
  const effective = resolveScheduledSettings(state, effectiveRules, new Date());
  const saveHomeAssistantToken = async () => {
    const bridge = getUniversalSettingsHost();
    if (!bridge || !homeAssistantToken) {
      setHomeAssistantTokenStatus('The host vault is unavailable or the token is empty.');
      return;
    }
    const result = await bridge.setHomeAssistantToken(homeAssistantToken);
    setHomeAssistantTokenStatus(result.ok ? 'Home Assistant token saved in the host vault.' : `Token was not saved: ${result.code}`);
    if (result.ok) setHomeAssistantToken('');
  };
  const clearHomeAssistantToken = async () => {
    const bridge = getUniversalSettingsHost();
    if (!bridge) {
      setHomeAssistantTokenStatus('The host vault is unavailable.');
      return;
    }
    const result = await bridge.clearHomeAssistantToken();
    setHomeAssistantTokenStatus(result.ok ? 'Home Assistant token cleared.' : `Token was not cleared: ${result.code}`);
  };
  return <SectionShell id="schedule" title={copy('scheduleHelp', state)} hint={copy('scheduleHelp', state)} state={state} items={items}>
    <div className={styles.buttonRow} data-universal-search-value={COPY.addSchedule.en}><button type="button" className={`${styles.button} ${styles.buttonPrimary}`} onClick={add}>{copy('addSchedule', state)}</button><span className={styles.hint}>Local timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone}</span></div>
    {getUniversalSettingsHost() ? <div className={styles.card}><label className={styles.label} htmlFor="universal-home-assistant-token">Home Assistant access token<input id="universal-home-assistant-token" className={styles.textInput} type="password" autoComplete="new-password" value={homeAssistantToken} onChange={(event) => setHomeAssistantToken(event.target.value)} /></label><div className={styles.buttonRow}><button type="button" className={styles.button} onClick={() => void saveHomeAssistantToken()}>Save in host vault</button><button type="button" className={styles.button} onClick={() => void clearHomeAssistantToken()}>Clear host token</button></div>{homeAssistantTokenStatus ? <p className={styles.hint} role="status">{homeAssistantTokenStatus}</p> : null}</div> : null}
    {state.schedules.length === 0 ? <p className={styles.empty}>{copy('empty', state)}</p> : state.schedules.map((rule) => <ScheduleCard key={rule.id} rule={rule} state={state} update={(patch) => updateRule(rule.id, patch)} remove={() => remove(rule.id)} externalResult={externalResults[rule.id]} />)}
    <p className={styles.hint}>Effective local appearance: {effective.theme}, {effective.density}, {effective.accentColor}. Invalid or unavailable external sources retain the local base value.</p>
  </SectionShell>;
}

function ScheduleCard({ rule, state, update, remove, externalResult }: { rule: UniversalScheduleRule; state: UniversalSettingsState; update: (patch: Partial<UniversalScheduleRule>) => void; remove: () => void; externalResult?: { ok: boolean; detail: string; values?: Record<string, unknown> } }) {
  const error = validateScheduleRule(rule);
  const updateValues = (patch: UniversalScheduleRule['values']): void => update({ values: { ...rule.values, ...patch } });
  return <div className={styles.card} data-universal-search-value={rule.label + ' ' + rule.source}>
    <label className={styles.checkRow}><input type="checkbox" checked={rule.enabled} onChange={(event) => update({ enabled: event.target.checked })} /><span className={styles.label}>{rule.label}</span></label>
    <div className={styles.scheduleGrid}><label className={styles.scheduleItem}>Label<input className={styles.textInput} value={rule.label} maxLength={120} onChange={(event) => update({ label: event.target.value })} /></label><label className={styles.scheduleItem}>Priority<input className={styles.textInput} type="number" value={rule.priority} onChange={(event) => update({ priority: Number(event.target.value) })} /></label><label className={styles.scheduleItem}>Start date<input className={styles.dateInput} type="date" value={rule.startDate ?? ''} onChange={(event) => update({ startDate: event.target.value || null })} /></label><label className={styles.scheduleItem}>End date<input className={styles.dateInput} type="date" value={rule.endDate ?? ''} onChange={(event) => update({ endDate: event.target.value || null })} /></label><label className={styles.scheduleItem}>Start time<input className={styles.timeInput} type="time" value={rule.startTime ?? ''} onChange={(event) => update({ startTime: event.target.value || null })} /></label><label className={styles.scheduleItem}>End time<input className={styles.timeInput} type="time" value={rule.endTime ?? ''} onChange={(event) => update({ endTime: event.target.value || null })} /></label><div className={styles.scheduleItem}><SearchableChoice id={`schedule-source-${rule.id}`} label="Source" value={rule.source} options={[{ value: 'local', label: 'Local' }, { value: 'api', label: 'Validated HTTPS API' }, { value: 'homeAssistant', label: 'Home Assistant boolean' }]} onChange={(value) => update({ source: value as UniversalScheduleRule['source'] })} state={state} /></div></div>
    <div className={styles.scheduleGrid}>
      <div className={styles.scheduleItem}><SearchableChoice id={`schedule-language-${rule.id}`} label="Scheduled language" value={rule.values.languageMode ?? ''} options={[{ value: '', label: 'Keep current language' }, { value: 'english', label: 'English' }, { value: 'cantonese', label: 'Cantonese' }, { value: 'bilingual', label: 'Bilingual' }]} onChange={(value) => updateValues({ languageMode: value ? value as UniversalSettingsState['languageMode'] : undefined })} state={state} /></div>
      <div className={styles.scheduleItem}><SearchableChoice id={`schedule-theme-${rule.id}`} label="Scheduled theme" value={rule.values.theme ?? 'system'} options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} onChange={(value) => updateValues({ theme: value as UniversalSettingsState['theme'] })} state={state} /></div>
      <div className={styles.scheduleItem}><SearchableChoice id={`schedule-density-${rule.id}`} label="Scheduled density" value={rule.values.density ?? 'comfortable'} options={[{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }, { value: 'spacious', label: 'Spacious' }]} onChange={(value) => updateValues({ density: value as UniversalSettingsState['density'] })} state={state} /></div>
      <label className={styles.scheduleItem}>Scheduled accent colour<input className={styles.textInput} value={rule.values.accentColor ?? ''} placeholder="#6750A4" onChange={(event) => updateValues({ accentColor: event.target.value })} /></label>
      <label className={styles.scheduleItem}>Scheduled UI font family<input className={styles.textInput} value={rule.values.uiFontFamily ?? ''} placeholder="system-ui" onChange={(event) => updateValues({ uiFontFamily: event.target.value })} /></label>
    </div>
    <div className={styles.weekdayGrid}>{[0, 1, 2, 3, 4, 5, 6].map((day) => <button key={day} type="button" className={styles.weekday} aria-pressed={rule.weekdays === 'all' || rule.weekdays.includes(day)} onClick={() => { const current = rule.weekdays === 'all' ? [0, 1, 2, 3, 4, 5, 6] : [...rule.weekdays]; const next = current.includes(day) ? current.filter((value) => value !== day) : [...current, day]; update({ weekdays: next.length === 7 ? 'all' : next }); }}>{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day]}</button>)}</div>
    {rule.source === 'api' ? <label>HTTPS URL<input className={styles.textInput} value={rule.sourceUrl ?? ''} onChange={(event) => update({ sourceUrl: event.target.value })} /></label> : null}
    {rule.source === 'homeAssistant' ? <><label>HTTPS base URL<input className={styles.textInput} value={rule.sourceBaseUrl ?? ''} onChange={(event) => update({ sourceBaseUrl: event.target.value })} /></label><label>Boolean entity<input className={styles.textInput} value={rule.sourceEntity ?? ''} onChange={(event) => update({ sourceEntity: event.target.value })} /></label></> : null}
    {rule.source !== 'local' && externalResult ? <p className={styles.hint} role="status">{externalResult.detail}</p> : null}
    {error ? <p className={styles.notice}>{copy('invalidSchedule', state)} {error}</p> : null}
    <button type="button" className={`${styles.button} ${styles.buttonDanger}`} onClick={remove}>Remove schedule</button>
  </div>;
}

function AdhdSection({ state, update }: { state: UniversalSettingsState; update: (patch: Partial<UniversalSettingsState>) => void }) {
  const items = ADHD_MODE_ORDER.map((mode) => mode);
  return <SectionShell id="adhd" title={sectionText('adhd', state)} hint={copy('adhdHelp', state)} state={state} items={items}>
    <div className={styles.cardGrid}>{ADHD_MODE_ORDER.map((mode) => <label key={mode} className={styles.card} data-universal-search-value={adhdLabel(mode, state)}><span className={styles.checkRow}><input type="checkbox" checked={state.adhd[mode]} onChange={(event) => update({ adhd: { ...state.adhd, [mode]: event.target.checked } })} /><span className={styles.label}>{adhdLabel(mode, state)}</span></span><span className={styles.hint}>{adhdDescription(mode, state)}</span></label>)}<label className={styles.card} data-od-setting="universal.adhd.nextAction" data-universal-search-value="Current next action"><span className={styles.label}>Current next action</span><input className={styles.textInput} maxLength={240} value={state.nextAction} onChange={(event) => update({ nextAction: event.target.value })} /><span className={styles.hint}>One user-chosen action remains visible when One thing at a time is enabled.</span></label></div>
  </SectionShell>;
}

function adhdLabel(mode: UniversalAdhdMode, state: UniversalSettingsState): string {
  const label = ADHD_MODE_LABELS[mode];
  return state.languageMode === 'cantonese' ? label.yue : state.languageMode === 'bilingual' ? `${label.en} · ${label.yue}` : label.en;
}

function adhdDescription(mode: UniversalAdhdMode, state: UniversalSettingsState): string {
  const descriptions: Record<UniversalAdhdMode, { en: string; yue: string }> = { focus: { en: 'Bring the active item forward without hiding the rest.', yue: '突出目前項目，但唔會收埋其他內容。' }, lowStimulation: { en: 'Reduce non-essential motion and notification noise.', yue: '減少非必要動畫同通知噪音。' }, timeAwareness: { en: 'Show elapsed session time where the work happens.', yue: '喺工作位置顯示經過時間。' }, oneThing: { en: 'Keep one user-chosen next action visible.', yue: '保持一個由你揀嘅下一步。' }, momentum: { en: 'Offer a dismissible prompt after a quiet period.', yue: '一段時間冇郁時先提示，亦可以唔理。' } };
  const desc = descriptions[mode];
  return state.languageMode === 'cantonese' ? desc.yue : state.languageMode === 'bilingual' ? `${desc.en} · ${desc.yue}` : desc.en;
}

function NotificationsSection({ state, selected, setSelected }: { state: UniversalSettingsState; selected: Set<string>; setSelected: (value: Set<string>) => void }) {
  const records = useNotifications();
  const items = records.map((notice) => notice.title + ' ' + (notice.body ?? '') + ' ' + notice.severity);
  const [confirmClear, setConfirmClear] = useState(false);
  return <SectionShell id="notifications" title={sectionText('notifications', state)} hint={copy('notificationsHelp', state)} state={state} items={items}>
    <div className={styles.buttonRow} data-universal-search-value={COPY.selectAll.en + ' ' + COPY.invert.en + ' ' + COPY.markRead.en + ' ' + COPY.clear.en}><button type="button" className={styles.button} disabled={records.length === 0} onClick={() => setSelected(new Set(records.map((notice) => notice.id)))}>{copy('selectAll', state)}</button><button type="button" className={styles.button} disabled={records.length === 0} onClick={() => setSelected(new Set(records.filter((notice) => !selected.has(notice.id)).map((notice) => notice.id)))}>{copy('invert', state)}</button><button type="button" className={styles.button} disabled={selected.size === 0} onClick={() => { markNotificationIdsRead(selected); setSelected(new Set()); }}>{copy('markRead', state)}</button><button type="button" className={styles.button + ' ' + styles.buttonDanger} disabled={selected.size === 0} onClick={() => setConfirmClear(true)}>{copy('clear', state)}</button></div>
    <div className={styles.notificationList}>{records.length === 0 ? <p className={styles.empty}>{copy('empty', state)}</p> : records.map((notice) => <NotificationSettingRow key={notice.id} record={notice} selected={selected.has(notice.id)} onSelected={(checked) => { const next = new Set(selected); if (checked) next.add(notice.id); else next.delete(notice.id); setSelected(next); }} />)}</div>
    {confirmClear ? <DestructiveGate action="Remove selected notifications" target={selected.size + ' selected notification' + (selected.size === 1 ? '' : 's')} items={records.filter((record) => selected.has(record.id)).map((record) => record.title)} detail="This permanently removes selected notification history records." irreversible onConfirm={() => { clearNotificationIds(selected); setSelected(new Set()); return true; }} onClose={() => setConfirmClear(false)} /> : null}
  </SectionShell>;
}

function NotificationSettingRow({ record, selected, onSelected }: { record: NotificationRecord; selected: boolean; onSelected: (checked: boolean) => void }) {
  const className = styles.notification + (record.read ? '' : ' ' + styles.notificationUnread);
  return <label className={className} data-universal-search-value={record.title + ' ' + (record.body ?? '') + ' ' + record.severity}>
    <input type="checkbox" checked={selected} onChange={(event) => onSelected(event.target.checked)} aria-label={'Select notification ' + record.title} />
    <span className={styles.rowText}><span className={styles.label}>{record.title}</span>{record.body ? <span>{record.body}</span> : null}<span className={styles.hint}>{record.severity} · {new Date(record.createdAt).toLocaleString()}</span></span>
  </label>;
}

function StatusSection({ state, version, updatedAt, sourceRevision, mountedAcknowledged }: { state: UniversalSettingsState; version: string | null; updatedAt: string | null; sourceRevision: string | null; mountedAcknowledged: boolean }) {
  const cards = useMemo(() => createStatusCards(version, updatedAt, mountedAcknowledged).map((card) => card.id === 'provenance' && sourceRevision && /^[0-9a-f]{40}$/iu.test(sourceRevision) ? { ...card, evidenceUrl: `https://github.com/Ding-Ding-Projects/material-designer/commit/${sourceRevision}` } : card), [mountedAcknowledged, sourceRevision, updatedAt, version]);
  const [delivery, setDelivery] = useState<string>('not connected');
  const [hubReport, setHubReport] = useState<string | null>(null);
  useEffect(() => {
    const hub = getUniversalStatusHub();
    if (!hub) {
      setDelivery('local page only, no host delivery channel');
      return undefined;
    }
    let active = true;
    const report = {
      sessionId: 'universal-settings',
      project: 'Material Designer',
      state: mountedAcknowledged ? 'running' as const : 'unavailable' as const,
      summary: mountedAcknowledged
        ? 'Universal settings source, live propagation, schedules, notifications, and accessibility surfaces are mounted.'
        : 'Universal settings source is ready but the central mount has not acknowledged it.',
      evidence: cards.map((card) => ({ label: card.title, url: card.evidenceUrl ?? null, verified: card.state === 'verified' })),
      sourceRevision: sourceRevision && /^[0-9a-f]{40}$/iu.test(sourceRevision) ? sourceRevision : null,
      updatedAt: Date.now(),
    };
    void hub.register(report).then(async (result) => {
      if (!active) return;
      if (result.ok) {
        const reported = await hub.report(report);
        if (!active) return;
        if (!reported.ok) {
          setDelivery(`registered locally, report unavailable: ${reported.code}`);
          return;
        }
        const readback = await hub.read('universal-settings');
        if (!active) return;
        if (!readback.ok) {
          setDelivery(`reported locally, readback unavailable: ${readback.code}`);
          return;
        }
        setDelivery(result.delivery === 'hub' ? 'hub delivered' : `local fallback, ${result.noDeliveryReason ?? 'no delivery reason recorded'}`);
        setHubReport(`Registered, reported, and read back at ${new Date(readback.report.updatedAt).toISOString()}`);
      } else {
        setDelivery(`unavailable: ${result.code}`);
      }
    }).catch(() => {
      if (active) setDelivery('unavailable: host status call did not settle');
    });
    return () => { active = false; };
  }, [cards, mountedAcknowledged, state.revision]);
  useEffect(() => {
    const hub = getUniversalStatusHub();
    if (!hub) return undefined;
    const timer = window.setInterval(() => {
      void hub.heartbeat('universal-settings', Date.now()).then((result) => {
        if (result.ok) setHubReport(`Heartbeat at ${new Date(result.report.updatedAt).toISOString()}`);
      }).catch(() => undefined);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return <SectionShell id="status" title={sectionText('status', state)} hint={copy('statusHelp', state)} state={state} items={cards.map((card) => `${card.title} ${card.detail}`)}><div className={styles.cardGrid}>{cards.map((card) => <article className={styles.card} key={card.id} data-universal-search-value={card.title + ' ' + card.detail}><span className={styles.cardTitle}>{card.title}</span><span className={styles.statusChip} data-state={card.state}>{card.state === 'verified' ? '✅ ' : card.state === 'running' ? '🏃 ' : '⏳ '}{card.state}</span><p className={styles.cardDetail}>{card.detail}</p>{card.evidenceUrl ? <a href={card.evidenceUrl}>Evidence</a> : <span className={styles.hint}>Evidence link unavailable for this state.</span>}</article>)}</div><p className={styles.hint}>Status delivery: {delivery}. {hubReport ?? 'No heartbeat has been acknowledged yet.'}</p><p className={styles.hint}>State revision {state.revision}, updated locally at {state.updatedAt ? new Date(state.updatedAt).toISOString() : 'not yet written'}.</p></SectionShell>;
}

export const __universalSettingsTestExports = {
  normalizeUniversalSettings,
  createDefaultUniversalSettings,
  validateScheduleRule,
  scheduleRuleMatches,
  resolveScheduledSettings,
  appendNotification,
};

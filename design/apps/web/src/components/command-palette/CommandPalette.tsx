// The command palette.
//
// Separate from `QuickSwitcher.tsx` on purpose. That surface answers one
// question fast — "which file?" — on Cmd/Ctrl+P, and it stays exactly as it
// was. This one answers "what can this app do, and where does it live?", on
// Cmd/Ctrl+Shift+P, and it swallows the quick switcher as one scope among
// several rather than replacing it.
//
// Three things here are load-bearing rather than decorative:
//
// 1. A row that IS a setting renders that setting's real control. The switch,
//    the slider and the select below are wired to the same state the Settings
//    dialog writes — flipping one here changes the product, not a copy of it.
//    A palette that only *links* to settings makes the user do the work twice.
// 2. Choosing a row finishes the journey. It opens the surface, then scrolls to
//    the exact control and flashes it (`reveal.ts`). Landing the user on the
//    right tab and leaving them to hunt is not arriving.
// 3. Size is the user's choice and it is remembered. The bounded card is the
//    default because a search box that swallows the whole window is startling
//    on a large display; the full-window mode exists because on a small one the
//    card is the thing that feels cramped.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { Select } from '@open-design/components';
import { modalOverlay, scaleIn } from '../../motion';
import {
  FUNNY_LEVELS,
  LANGUAGE_MODES,
  LOCALES,
  LOCALE_LABEL,
  tv,
  useI18n,
} from '../../i18n';
import type { FunnyLanguage, FunnyLevel, LanguageMode, Locale, TranslationVars } from '../../i18n';
import type { Dict } from '../../i18n/types';
import { navigate, type Route } from '../../router';
import {
  ACCENT_SWATCHES,
  DEFAULT_ACCENT_COLOR,
  applyAppearanceToDocument,
  normalizeAccentColor,
} from '../../state/appearance';
import type { AppConfig, AppTheme } from '../../types';
import { Icon } from '../Icon';
import { useNarrator } from '../narrator/narrator';
import type { NarratorLanguage } from '../narrator/queue';
import { NARRATOR_LANGUAGES, NARRATOR_LANGUAGE_LABEL_KEYS } from '../narrator/settings';
import type { SettingsSection } from '../SettingsDialog';
import { openWorkspaceTab } from '../WorkspaceTabsBar';
import styles from './CommandPalette.module.css';
import { createBoundedMatcher } from '../regex/evaluate';
import { compilePattern } from '../regex/pattern';
import {
  PALETTE_SCOPES,
  buildPaletteRows,
  filterPaletteRows,
  parsePaletteQuery,
  type PaletteRegexFilter,
  type PaletteRow,
  type PaletteScopeId,
  type ParsedPaletteQuery,
} from './commands';
import { quickSwitcherScopeResults, useQuickSwitcherScope } from './quickSwitcherScope';
import { requestSettingsReveal } from './reveal';
import type { SettingsControlId, SettingsIndexEntry } from './settingsIndex';

export type PaletteDisplayMode = 'card' | 'full';

const DISPLAY_MODE_STORAGE_KEY = 'open-design:command-palette:display-mode';

/** How many file/tab hits ride along in the unscoped list before it gets noisy. */
const FILE_ROWS_IN_ALL_SCOPE = 6;

/**
 * Label maps for the three inline controls. Typed against `Dict` so renaming a
 * key fails typecheck here instead of rendering the key name at the user. They
 * mirror the private maps in `SettingsDialog.tsx`; the dialog cannot be
 * imported for its values without dragging nine thousand lines into every test
 * that touches the palette.
 */
const THEME_LABEL_KEYS: Record<AppTheme, keyof Dict> = {
  system: 'settings.themeSystem',
  light: 'settings.themeLight',
  dark: 'settings.themeDark',
};

const LANGUAGE_MODE_LABEL_KEYS: Record<LanguageMode, keyof Dict> = {
  single: 'settings.languageModeSingle',
  bilingual: 'settings.languageModeBilingual',
};

const FUNNY_LEVEL_LABEL_KEYS: Record<FunnyLevel, keyof Dict> = {
  1: 'settings.funnyLevel1',
  2: 'settings.funnyLevel2',
  3: 'settings.funnyLevel3',
  4: 'settings.funnyLevel4',
  5: 'settings.funnyLevel5',
};

const THEME_CYCLE: AppTheme[] = ['system', 'light', 'dark'];

export function readPaletteDisplayMode(): PaletteDisplayMode {
  if (typeof window === 'undefined') return 'card';
  try {
    return window.localStorage.getItem(DISPLAY_MODE_STORAGE_KEY) === 'full' ? 'full' : 'card';
  } catch {
    // Private-mode storage: the palette still opens, it just forgets the size.
    return 'card';
  }
}

export function writePaletteDisplayMode(mode: PaletteDisplayMode): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DISPLAY_MODE_STORAGE_KEY, mode);
  } catch {
    // Best-effort. A failed write must never stop the resize itself.
  }
}

interface Props {
  config: AppConfig;
  /** Persist a whole config. Wired to the same autosave path Settings uses. */
  onConfigChange: (next: AppConfig) => void;
  onOpenSettings: (section: SettingsSection) => void;
  onClose: () => void;
  /**
   * What the palette starts with, when something opened it on the user's
   * behalf — today, the header search field. Absent when the shortcut opened
   * it, which is why the palette still starts empty by default.
   */
  seedQuery?: string;
  /**
   * The pattern and flags that field had switched on. The palette compiles it
   * under its own bounded matcher and filters with it until the user edits the
   * query here, at which point it says so and steps back to plain text.
   */
  seedRegex?: { source: string; flags: string } | null;
}

export function CommandPalette({
  config,
  onConfigChange,
  onOpenSettings,
  onClose,
  seedQuery,
  seedRegex,
}: Props) {
  const {
    t,
    locale,
    setLocale,
    languageMode,
    setLanguageMode,
    funnyLevels,
    setFunnyLevel,
  } = useI18n();
  const [rawQuery, setRawQuery] = useState(seedQuery ?? '');
  // Seeded once, on mount. The palette is mounted fresh on every open, so a
  // later prop change cannot smuggle a pattern in behind the user's edits.
  const [regexSeed, setRegexSeed] = useState<{ source: string; flags: string } | null>(
    () => seedRegex ?? null,
  );
  const [scopeOverride, setScopeOverride] = useState<PaletteScopeId | null>(null);
  const [cursor, setCursor] = useState(0);
  const [displayMode, setDisplayMode] = useState<PaletteDisplayMode>(() => readPaletteDisplayMode());
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const fileScope = useQuickSwitcherScope();

  // Where focus came from, so Escape can put it back.
  //
  // Captured in the `useRef` INITIALIZER, during the first render — not in an
  // effect. The search input's ref callback focuses it, and ref callbacks run
  // before passive effects, so an effect would faithfully record the palette's
  // own input as "where focus came from" and return focus to a node that no
  // longer exists.
  //
  // An action that navigates somewhere deliberately does NOT restore it: the
  // reveal moves focus onto the control the user asked for, and yanking it back
  // would undo the arrival.
  const returnFocusRef = useRef<HTMLElement | null>(
    typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );
  const restoreFocusRef = useRef(true);
  useEffect(() => () => {
    if (!restoreFocusRef.current) return;
    const target = returnFocusRef.current;
    if (target && target.isConnected) target.focus?.();
  }, []);

  const setInputRef = useCallback((node: HTMLInputElement | null) => {
    inputRef.current = node;
    node?.focus();
  }, []);

  // The pattern the palette is actually matching with, or null for plain text.
  //
  // Compiled here rather than carried in from the field: a `RegExp` with the
  // `g` flag keeps `lastIndex` between calls, so a shared instance would match
  // every other row and look like a ranking bug. A pattern that no longer
  // compiles drops the seed entirely instead of quietly matching nothing.
  const regexFilter = useMemo<PaletteRegexFilter | null>(() => {
    if (!regexSeed) return null;
    const { regex } = compilePattern(regexSeed.source, regexSeed.flags);
    if (!regex) return null;
    const bounded = createBoundedMatcher(regex);
    return {
      source: regexSeed.source,
      flags: regexSeed.flags,
      matches: (text: string) => bounded.test(text),
    };
  }, [regexSeed]);

  // A scope prefix and a regular expression cannot both own the first
  // character. `#\d+` is a perfectly good pattern and `parsePaletteQuery` would
  // eat its `#` as the files-scope prefix, so while a pattern is live the
  // prefixes are off and the scope comes from the chips alone.
  const parsed: ParsedPaletteQuery = regexFilter
    ? { scope: null, query: rawQuery }
    : parsePaletteQuery(rawQuery);
  const scope: PaletteScopeId = parsed.scope ?? scopeOverride ?? 'all';
  const query = parsed.query;

  const close = useCallback(
    (options: { restoreFocus?: boolean } = {}) => {
      restoreFocusRef.current = options.restoreFocus !== false;
      onClose();
    },
    [onClose],
  );

  const toggleFullWindow = useCallback(() => {
    setDisplayMode((current) => {
      const next: PaletteDisplayMode = current === 'full' ? 'card' : 'full';
      writePaletteDisplayMode(next);
      return next;
    });
  }, []);

  const openSettingsEntry = useCallback(
    (entry: SettingsIndexEntry) => {
      // Ask for the reveal BEFORE the section opens: the dialog consumes the
      // request as it mounts, and the control it points at may not exist for
      // another frame or two.
      requestSettingsReveal(entry.id);
      onOpenSettings(entry.section);
      close({ restoreFocus: false });
    },
    [close, onOpenSettings],
  );

  const goTo = useCallback(
    (route: Route) => {
      navigate(route);
      close({ restoreFocus: false });
    },
    [close],
  );

  const openInNewTab = useCallback(
    (route: Route) => {
      openWorkspaceTab(route);
      close({ restoreFocus: false });
    },
    [close],
  );

  // ---- live setting writes -------------------------------------------------
  // Every one of these goes through the same persistence path the Settings
  // dialog uses, so a change made here is the change, not a shadow of it.

  const writeConfig = useCallback(
    (next: AppConfig) => {
      onConfigChange(next);
    },
    [onConfigChange],
  );

  const theme: AppTheme = config.theme ?? 'system';
  const setTheme = useCallback(
    (next: AppTheme) => {
      // Paint first so the flip is instant; the app's own layout effect would
      // otherwise wait on a full re-render of the tree.
      applyAppearanceToDocument({ theme: next, accentColor: config.accentColor });
      writeConfig({ ...config, theme: next });
    },
    [config, writeConfig],
  );

  const accentColor = normalizeAccentColor(config.accentColor) ?? DEFAULT_ACCENT_COLOR;
  const setAccentColor = useCallback(
    (next: string) => {
      // The default swatch is the Material Design 3 `primary` role rather than a
      // hex, so it never normalizes — match it first or picking "Default" would
      // silently keep the previous accent.
      const picked = next === DEFAULT_ACCENT_COLOR ? DEFAULT_ACCENT_COLOR : normalizeAccentColor(next);
      if (!picked) return;
      applyAppearanceToDocument({ theme: config.theme, accentColor: picked });
      writeConfig({ ...config, accentColor: picked });
    },
    [config, writeConfig],
  );

  const notifications = config.notifications;
  const setNotification = useCallback(
    (patch: Partial<NonNullable<AppConfig['notifications']>>) => {
      const current = config.notifications;
      if (!current) return;
      writeConfig({ ...config, notifications: { ...current, ...patch } });
    },
    [config, writeConfig],
  );

  // The narrator keeps its own store rather than riding in AppConfig, so the
  // palette reads it through the same hook the settings panel uses. Changing
  // it here changes it there: one store, two surfaces.
  const narrator = useNarrator();
  const setNarratorEnabled = useCallback(
    (enabled: boolean) => {
      narrator.setPreferences({ ...narrator.preferences, enabled });
    },
    [narrator],
  );
  const setNarratorLanguage = useCallback(
    (language: NarratorLanguage) => {
      narrator.setPreferences({ ...narrator.preferences, language });
    },
    [narrator],
  );

  const pet = config.pet;
  const setPetEnabled = useCallback(
    (enabled: boolean) => {
      const current = config.pet;
      if (!current) return;
      writeConfig({ ...config, pet: { ...current, enabled } });
    },
    [config, writeConfig],
  );

  const setMetrics = useCallback(
    (enabled: boolean) => {
      writeConfig({
        ...config,
        telemetry: { ...(config.telemetry ?? {}), metrics: enabled },
      });
    },
    [config, writeConfig],
  );

  const cycleTheme = useCallback(() => {
    const index = THEME_CYCLE.indexOf(theme);
    setTheme(THEME_CYCLE[(index + 1) % THEME_CYCLE.length] ?? 'system');
  }, [setTheme, theme]);

  const toggleLanguageMode = useCallback(() => {
    setLanguageMode(languageMode === 'bilingual' ? 'single' : 'bilingual');
  }, [languageMode, setLanguageMode]);

  const setScope = useCallback(
    (next: PaletteScopeId) => {
      setScopeOverride(next);
      // Drop any typed prefix so the chip and the query cannot disagree about
      // which scope is live — but only when the box holds a query. While a
      // pattern is live the prefixes are off, and `#\d+` would come back from
      // the parser as `\d+`: a silently different pattern, from a click that
      // was only ever about scope.
      if (!regexSeed) setRawQuery((current) => parsePaletteQuery(current).query);
      setCursor(0);
      inputRef.current?.focus();
    },
    [regexSeed],
  );

  const registryRows = useMemo(
    () =>
      buildPaletteRows({
        t,
        openSettingsEntry,
        goTo,
        openInNewTab,
        setScope,
        toggleFullWindow,
        fullWindow: displayMode === 'full',
        cycleTheme,
        toggleLanguageMode,
      }),
    [
      t,
      openSettingsEntry,
      goTo,
      openInNewTab,
      setScope,
      toggleFullWindow,
      displayMode,
      cycleTheme,
      toggleLanguageMode,
    ],
  );

  const fileRows = useMemo<PaletteRow[]>(() => {
    if (!fileScope) return [];
    // In the unscoped list, files only join once the user has typed something:
    // an empty query would otherwise bury the command registry under whatever
    // happens to be open in the current project.
    if (scope !== 'files' && (scope !== 'all' || !query.trim())) return [];
    const limit = scope === 'files' ? 50 : FILE_ROWS_IN_ALL_SCOPE;
    // The quick switcher scores plain text and knows nothing about patterns, so
    // a live regex asks it for the unfiltered list and applies the same matcher
    // the registry rows get. Files silently ignoring the pattern while commands
    // honoured it would be the worst of both.
    const results = regexFilter
      ? quickSwitcherScopeResults(fileScope, '', 400)
          .filter((result) => regexFilter.matches(result.title) || regexFilter.matches(result.detail))
          .slice(0, limit)
      : quickSwitcherScopeResults(fileScope, query, limit);
    return results.map((result) => ({
      kind: 'destination' as const,
      id: `file:${result.id}`,
      title: result.title,
      hint: result.detail,
      group: t('commandPalette.groupFiles'),
      icon: result.kind === 'tab' ? 'panel-left' : 'file',
      run: () => {
        result.run();
        close({ restoreFocus: false });
      },
    }));
  }, [close, fileScope, query, regexFilter, scope, t]);

  const rows = useMemo<PaletteRow[]>(() => {
    if (scope === 'files') return fileRows;
    // `fileRows` is empty for every scope but `all` (and only once a query has
    // been typed), so this concatenation is a no-op elsewhere.
    return [...filterPaletteRows(registryRows, query, scope, 60, regexFilter), ...fileRows];
  }, [fileRows, query, regexFilter, registryRows, scope]);

  useEffect(() => {
    setCursor(0);
  }, [rawQuery, regexFilter, scope]);

  useEffect(() => {
    const element = listRef.current?.querySelector<HTMLElement>(`[data-row-index="${cursor}"]`);
    element?.scrollIntoView?.({ block: 'nearest' });
  }, [cursor, rows.length]);

  const activeRow = rows[cursor];

  function moveCursor(delta: number) {
    if (rows.length === 0) return;
    setCursor((current) => (current + delta + rows.length) % rows.length);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    // Never steer the list while an IME composition is open: ↑↓ and Enter are
    // how a CJK candidate list is driven, and stealing them makes the palette
    // unusable in exactly the locales this product ships most carefully.
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveCursor(1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveCursor(-1);
      return;
    }
    if (event.key === 'Home' && rows.length > 0) {
      event.preventDefault();
      setCursor(0);
      return;
    }
    if (event.key === 'End' && rows.length > 0) {
      event.preventDefault();
      setCursor(rows.length - 1);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      activeRow?.run();
      return;
    }
    // Ctrl/Cmd + ↹ style scope cycling without stealing plain Tab, which still
    // has to reach the highlighted row's live control.
    if (event.key === 'Tab' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      const order = PALETTE_SCOPES.map((definition) => definition.id);
      const index = order.indexOf(scope);
      const next = order[(index + (event.shiftKey ? -1 : 1) + order.length) % order.length];
      if (next) setScope(next);
    }
  }

  const emptyLabel = scope === 'files' && !fileScope
    ? t('commandPalette.filesUnavailable')
    : t('commandPalette.noResults');

  const body = (
    <motion.div
      className={styles.overlay}
      onMouseDown={() => close()}
      role="presentation"
      variants={modalOverlay}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      <motion.div
        className={`${styles.palette} ${displayMode === 'full' ? styles.full : styles.card}`}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('commandPalette.title')}
        data-testid="command-palette"
        data-display-mode={displayMode}
        variants={scaleIn}
        initial="hidden"
        animate="visible"
        exit="exit"
      >
        <div className={styles.searchRow}>
          <Icon name="search" size={15} aria-hidden />
          <input
            ref={setInputRef}
            className={styles.input}
            value={rawQuery}
            onChange={(event) => {
              setRawQuery(event.target.value);
              // Editing the text here is the user taking the query back. The
              // pattern came from a builder that is no longer on screen, so
              // keeping it live would leave the palette matching one thing
              // while the box shows another.
              setRegexSeed(null);
            }}
            onKeyDown={onKeyDown}
            placeholder={t('commandPalette.placeholder')}
            aria-label={t('commandPalette.placeholder')}
            aria-controls="command-palette-list"
            aria-activedescendant={activeRow ? `command-palette-row-${cursor}` : undefined}
            spellCheck={false}
            autoComplete="off"
          />
          <button
            type="button"
            className={styles.sizeButton}
            data-testid="command-palette-size"
            onClick={toggleFullWindow}
            aria-pressed={displayMode === 'full'}
            title={
              displayMode === 'full'
                ? t('commandPalette.commandExitFullWindow')
                : t('commandPalette.commandFullWindow')
            }
            aria-label={
              displayMode === 'full'
                ? t('commandPalette.commandExitFullWindow')
                : t('commandPalette.commandFullWindow')
            }
          >
            <Icon name={displayMode === 'full' ? 'minimize' : 'maximize'} size={14} />
          </button>
        </div>

        {/* A pattern arrived from the header field's builder, and the list is
            being matched with it rather than with the text in the box. Saying
            so is not decoration: without it the same query would produce two
            different result sets on two different openings and nothing on
            screen would explain why. `role="status"` so a screen-reader user
            hears the mode change too, and the button is the way back out. */}
        {regexFilter ? (
          <p className={styles.regexNote} role="status" data-testid="command-palette-regex-note">
            <span>
              {t('commandPalette.regexNote', {
                pattern: `/${regexFilter.source}/${regexFilter.flags}`,
              })}
            </span>
            <button
              type="button"
              className={styles.regexClear}
              data-testid="command-palette-regex-clear"
              onClick={() => setRegexSeed(null)}
            >
              {t('commandPalette.regexClear')}
            </button>
          </p>
        ) : null}

        <div className={styles.scopes} role="group" aria-label={t('commandPalette.scopeLabel')}>
          {PALETTE_SCOPES.map((definition) => (
            <button
              key={definition.id}
              type="button"
              className={`${styles.scopeChip}${scope === definition.id ? ` ${styles.scopeChipActive}` : ''}`}
              aria-pressed={scope === definition.id}
              onClick={() => setScope(definition.id)}
            >
              {t(definition.labelKey)}
              {definition.prefix ? <kbd className={styles.scopeKey}>{definition.prefix}</kbd> : null}
            </button>
          ))}
        </div>

        <div
          className={styles.list}
          id="command-palette-list"
          ref={listRef}
          role="listbox"
          aria-label={t('commandPalette.title')}
        >
          {rows.length === 0 ? (
            <p className={styles.empty}>{emptyLabel}</p>
          ) : (
            rows.map((row, index) => {
              const previous = rows[index - 1];
              const heading = !previous || previous.group !== row.group ? row.group : null;
              const active = index === cursor;
              return (
                <div key={row.id} role="presentation">
                  {heading ? <p className={styles.groupHeading}>{heading}</p> : null}
                  <div className={`${styles.row}${active ? ` ${styles.rowActive}` : ''}`} role="presentation">
                    <div
                      id={`command-palette-row-${index}`}
                      data-row-index={index}
                      role="option"
                      aria-selected={active}
                      className={styles.rowMain}
                      onMouseEnter={() => setCursor(index)}
                      onClick={() => row.run()}
                    >
                      <span className={styles.rowIcon} aria-hidden>
                        <Icon name={row.icon} size={15} />
                      </span>
                      <span className={styles.rowText}>
                        <span className={styles.rowTitle}>{row.title}</span>
                        {row.hint ? <span className={styles.rowHint}>{row.hint}</span> : null}
                      </span>
                    </div>
                    {row.kind === 'setting' && row.entry.control ? (
                      <div className={styles.rowControl} role="presentation">
                        <SettingRowControl
                          control={row.entry.control}
                          tabIndex={active ? 0 : -1}
                          t={t}
                          locale={locale}
                          setLocale={setLocale}
                          languageMode={languageMode}
                          setLanguageMode={setLanguageMode}
                          funnyLevels={funnyLevels}
                          setFunnyLevel={setFunnyLevel}
                          theme={theme}
                          setTheme={setTheme}
                          accentColor={accentColor}
                          setAccentColor={setAccentColor}
                          soundEnabled={notifications?.soundEnabled ?? false}
                          desktopEnabled={notifications?.desktopEnabled ?? false}
                          setNotification={setNotification}
                          narratorEnabled={narrator.preferences.enabled}
                          setNarratorEnabled={setNarratorEnabled}
                          narratorLanguage={narrator.preferences.language}
                          setNarratorLanguage={setNarratorLanguage}
                          petEnabled={pet?.enabled ?? false}
                          setPetEnabled={setPetEnabled}
                          metricsEnabled={config.telemetry?.metrics === true}
                          setMetrics={setMetrics}
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className={styles.footer}>
          <span><kbd>↑</kbd><kbd>↓</kbd> {t('quickSwitcher.navigate')}</span>
          <span><kbd>↵</kbd> {t('commandPalette.footerOpen')}</span>
          <span><kbd>esc</kbd> {t('quickSwitcher.close')}</span>
        </div>
      </motion.div>
    </motion.div>
  );

  if (typeof document === 'undefined') return body;
  return createPortal(body, document.body);
}

interface SettingRowControlProps {
  control: SettingsControlId;
  tabIndex: number;
  t: (key: keyof Dict, vars?: TranslationVars) => string;
  locale: Locale;
  setLocale: (next: Locale) => void;
  languageMode: LanguageMode;
  setLanguageMode: (next: LanguageMode) => void;
  funnyLevels: Record<FunnyLanguage, FunnyLevel>;
  setFunnyLevel: (language: FunnyLanguage, level: FunnyLevel) => void;
  theme: AppTheme;
  setTheme: (next: AppTheme) => void;
  accentColor: string;
  setAccentColor: (next: string) => void;
  soundEnabled: boolean;
  desktopEnabled: boolean;
  setNotification: (patch: Partial<NonNullable<AppConfig['notifications']>>) => void;
  narratorEnabled: boolean;
  setNarratorEnabled: (next: boolean) => void;
  narratorLanguage: NarratorLanguage;
  setNarratorLanguage: (next: NarratorLanguage) => void;
  petEnabled: boolean;
  setPetEnabled: (next: boolean) => void;
  metricsEnabled: boolean;
  setMetrics: (next: boolean) => void;
}

/**
 * The live control for one indexed setting.
 *
 * The `SettingsControlId` union is exhaustive here on purpose: adding an id to
 * the index without teaching this switch about it is a typecheck error at the
 * `never` below, not a row that quietly renders nothing.
 */
function SettingRowControl(props: SettingRowControlProps) {
  const { control, t, tabIndex } = props;
  switch (control) {
    case 'appearance.theme':
      return (
        <Select
          className={styles.select}
          tabIndex={tabIndex}
          aria-label={t('settings.appearance')}
          value={props.theme}
          onChange={(event) => props.setTheme(event.target.value as AppTheme)}
        >
          {(Object.keys(THEME_LABEL_KEYS) as AppTheme[]).map((value) => (
            <option key={value} value={value}>{t(THEME_LABEL_KEYS[value])}</option>
          ))}
        </Select>
      );
    case 'appearance.accent':
      return (
        <Select
          className={styles.select}
          tabIndex={tabIndex}
          aria-label={t('pet.fieldAccent')}
          value={props.accentColor}
          onChange={(event) => props.setAccentColor(event.target.value)}
        >
          {ACCENT_SWATCHES.map((swatch) => (
            <option key={swatch} value={swatch}>
              {swatch === DEFAULT_ACCENT_COLOR ? t('common.default') : swatch}
            </option>
          ))}
        </Select>
      );
    case 'language.locale':
      return (
        <Select
          className={styles.select}
          tabIndex={tabIndex}
          aria-label={t('settings.language')}
          value={props.locale}
          onChange={(event) => props.setLocale(event.target.value as Locale)}
        >
          {LOCALES.map((code) => (
            <option key={code} value={code}>{LOCALE_LABEL[code]}</option>
          ))}
        </Select>
      );
    case 'language.mode':
      return (
        <Select
          className={styles.select}
          tabIndex={tabIndex}
          aria-label={t('settings.languageModeTitle')}
          value={props.languageMode}
          onChange={(event) => props.setLanguageMode(event.target.value as LanguageMode)}
        >
          {LANGUAGE_MODES.map((mode) => (
            <option key={mode} value={mode}>{t(LANGUAGE_MODE_LABEL_KEYS[mode])}</option>
          ))}
        </Select>
      );
    case 'language.funnyEn':
      return (
        <FunnyLevelSlider
          language="en"
          labelKey="settings.funnyEnglishLabel"
          level={props.funnyLevels.en}
          setFunnyLevel={props.setFunnyLevel}
          tabIndex={tabIndex}
          t={t}
        />
      );
    case 'language.funnyZhHk':
      return (
        <FunnyLevelSlider
          language="zh-HK"
          labelKey="settings.funnyCantoneseLabel"
          level={props.funnyLevels['zh-HK']}
          setFunnyLevel={props.setFunnyLevel}
          tabIndex={tabIndex}
          t={t}
        />
      );
    case 'notifications.sound':
      return (
        <SettingSwitch
          label={t('settings.notifyCompletionSound')}
          checked={props.soundEnabled}
          onChange={(next) => props.setNotification({ soundEnabled: next })}
          tabIndex={tabIndex}
          t={t}
        />
      );
    case 'notifications.desktop':
      return (
        <SettingSwitch
          label={t('settings.notifyDesktop')}
          checked={props.desktopEnabled}
          onChange={(next) => props.setNotification({ desktopEnabled: next })}
          tabIndex={tabIndex}
          t={t}
        />
      );
    case 'narrator.enable':
      return (
        <SettingSwitch
          label={t('narrator.enable')}
          checked={props.narratorEnabled}
          onChange={props.setNarratorEnabled}
          tabIndex={tabIndex}
          t={t}
        />
      );
    case 'narrator.language':
      return (
        <Select
          className={styles.select}
          tabIndex={tabIndex}
          aria-label={t('narrator.language')}
          value={props.narratorLanguage}
          onChange={(event) => props.setNarratorLanguage(event.target.value as NarratorLanguage)}
        >
          {NARRATOR_LANGUAGES.map((language) => (
            <option key={language} value={language}>
              {t(NARRATOR_LANGUAGE_LABEL_KEYS[language])}
            </option>
          ))}
        </Select>
      );
    case 'pet.enabled':
      return (
        <SettingSwitch
          label={t('pet.wakeTitle')}
          checked={props.petEnabled}
          onChange={props.setPetEnabled}
          tabIndex={tabIndex}
          t={t}
        />
      );
    case 'privacy.metrics':
      return (
        <SettingSwitch
          label={t('settings.privacyMetrics')}
          checked={props.metricsEnabled}
          onChange={props.setMetrics}
          tabIndex={tabIndex}
          t={t}
        />
      );
    default: {
      const exhaustive: never = control;
      return exhaustive;
    }
  }
}

function SettingSwitch({
  label,
  checked,
  onChange,
  tabIndex,
  t,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  tabIndex: number;
  t: (key: keyof Dict) => string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      tabIndex={tabIndex}
      className={`${styles.switch}${checked ? ` ${styles.switchOn}` : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.switchTrack} aria-hidden />
      <span className={styles.switchLabel}>
        {checked ? t('common.active') : t('common.offline')}
      </span>
    </button>
  );
}

function FunnyLevelSlider({
  language,
  labelKey,
  level,
  setFunnyLevel,
  tabIndex,
  t,
}: {
  language: FunnyLanguage;
  labelKey: keyof Dict;
  level: FunnyLevel;
  setFunnyLevel: (language: FunnyLanguage, level: FunnyLevel) => void;
  tabIndex: number;
  t: (key: keyof Dict, vars?: TranslationVars) => string;
}) {
  const valueText = t('settings.funnyLevelValue', {
    // The level's name is copy, so each language of the readout reads its
    // own name for the level rather than repeating the pair.
    level,
    name: tv(FUNNY_LEVEL_LABEL_KEYS[level]),
  });
  return (
    <span className={styles.slider}>
      <input
        type="range"
        min={1}
        max={5}
        step={1}
        value={level}
        tabIndex={tabIndex}
        aria-label={t(labelKey)}
        aria-valuetext={valueText}
        onChange={(event) => {
          const next = Number(event.target.value);
          const picked = FUNNY_LEVELS.find((candidate) => candidate === next);
          if (picked) setFunnyLevel(language, picked);
        }}
      />
      <span className={styles.sliderValue}>{valueText}</span>
    </span>
  );
}

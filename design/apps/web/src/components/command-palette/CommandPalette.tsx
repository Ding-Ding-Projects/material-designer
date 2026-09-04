// The command palette.
//
// Separate from `QuickSwitcher.tsx` on purpose. That surface answers one
// question fast — "which file?" — on Cmd/Ctrl+P, and it stays exactly as it
// was. This one answers "what can this app do, and where does it live?", on
// Cmd/Ctrl+Shift+F, and it swallows the quick switcher as one scope among
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
import { Switch } from '../Switch';
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
  APPEARANCE_DENSITIES,
  APPEARANCE_SEEDS,
  DEFAULT_ACCENT_COLOR,
  FONT_STACK_IDS,
  MAX_FONT_SIZE_PX,
  MAX_UI_SCALE,
  MIN_FONT_SIZE_PX,
  MIN_UI_SCALE,
  UI_SCALE_STEP,
  applyAppearanceToDocument,
  normalizeAccentColor,
  quantizeUiScale,
  type AppearanceDensity,
  type AppearancePreferences,
  type AppearanceSeed,
  type AppearanceTypography,
  type FontStackId,
} from '../../state/appearance';
import {
  DENSITY_LABEL_KEY,
  FONT_LABEL_KEY,
  SEED_LABEL_KEY,
} from '../appearance/labels';
import { useAppearancePreferences } from '../appearance/store';
import { notificationPermission, requestNotificationPermission } from '../../utils/notifications';
import type { AppConfig, AppTheme } from '../../types';
import { DEFAULT_LOGO_STATE, LOGO_PRESETS, normalizeLogoState } from '../../state/logoCustomization';
import { Icon } from '../Icon';
import { useNarrator } from '../narrator/narrator';
import type { NarratorLanguage } from '../narrator/queue';
import { NARRATOR_LANGUAGES, NARRATOR_LANGUAGE_LABEL_KEYS } from '../narrator/settings';
import type { SettingsSection } from '../SettingsDialog';
import { openWorkspaceTab } from '../WorkspaceTabsBar';
import { openVersionHistory } from '../history/open-history';
import styles from './CommandPalette.module.css';
import { REGEX_FLAGS } from '../regex/pattern';
import { RegexSearchField } from '../regex/RegexSearchField';
import { useRegexSearch } from '../regex/useRegexSearch';
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
import { useWorkspaceContext } from '../../collab/useWorkspaceContext';
import { canShowWorkspaceSettings } from '../../collab/settings-access';
import { writeUniversalSettingsPatch } from '../universal/universalSettings';

export type PaletteDisplayMode = 'card' | 'full';

const DISPLAY_MODE_STORAGE_KEY = 'open-design:command-palette:display-mode';
const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** How many file/tab hits ride along in the unscoped list before it gets noisy. */
const FILE_ROWS_IN_ALL_SCOPE = 6;

function isSchoolAllowedPaletteRow(row: PaletteRow, schoolName: string): boolean {
  const haystack = [row.id, row.title, row.hint ?? '', ...(row.keywords ?? []), schoolName].join(' ').toLowerCase();
  return /school|status hub|unlock|credential/.test(haystack);
}

/**
 * The cap on registry rows in one list.
 *
 * It was 60, which was above the registry's size when it was written and is
 * the kind of number that stops being true without anything failing: the
 * settings index alone is forty-three entries now, and the rows are pushed
 * commands-then-destinations-then-settings, so the first entries to fall off
 * a too-low cap would have been the last settings tabs — silently, with the
 * palette still claiming to list every setting. The cap exists to bound a
 * pathological list, not to trim a real one, so it sits well clear of it.
 */
const REGISTRY_ROWS_IN_LIST = 200;

/**
 * Label maps for the inline controls whose owning surface is `SettingsDialog`.
 * Typed against `Dict` so renaming a key fails typecheck here instead of
 * rendering the key name at the user. They mirror the private maps in that
 * file; it cannot be imported for its values without dragging nine thousand
 * lines into every test that touches the palette.
 *
 * The appearance maps are NOT mirrored — `components/appearance/labels.ts` is
 * a module both surfaces import, which is the arrangement to prefer whenever
 * the owning file is small enough to split.
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
  const [schoolMode, setSchoolMode] = useState<boolean>(() =>
    typeof document !== 'undefined'
      && document.documentElement.getAttribute('data-universal-school-mode') === 'true',
  );
  const [schoolModeName, setSchoolModeName] = useState<string>(() =>
    typeof document !== 'undefined' ? document.documentElement.getAttribute('data-universal-school-name') || 'School mode' : 'School mode',
  );
  // This controller belongs to this palette field alone. It is deliberately
  // not shared with the header field that may have opened the palette: the
  // palette needs its own mode, flags, guided parts and validation state once
  // it is on screen.
  const search = useRegexSearch(rawQuery, setRawQuery);
  const seedAppliedRef = useRef(false);
  const [scopeOverride, setScopeOverride] = useState<PaletteScopeId | null>(null);
  const [cursor, setCursor] = useState(0);
  const [displayMode, setDisplayMode] = useState<PaletteDisplayMode>(() => readPaletteDisplayMode());
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const paletteRef = useRef<HTMLDivElement | null>(null);
  const fileScope = useQuickSwitcherScope();
  const { context: workspaceContext } = useWorkspaceContext();
  const workspaceSettingsVisible = canShowWorkspaceSettings(workspaceContext);

  useEffect(() => {
    const onSchoolMode = (event: Event): void => {
      const detail = (event as CustomEvent<{ enabled?: unknown }>).detail;
      setSchoolMode(detail?.enabled === true);
      if (typeof (detail as { name?: unknown } | undefined)?.name === 'string') setSchoolModeName((detail as { name: string }).name);
    };
    window.addEventListener('material-designer:universal-school-mode', onSchoolMode);
    return () => window.removeEventListener('material-designer:universal-school-mode', onSchoolMode);
  }, []);

  // The header may hand the palette a plain serialisable seed. Apply it to
  // this field's controller exactly once; subsequent edits belong entirely to
  // the palette and cannot mutate the header's controller.
  useEffect(() => {
    if (!seedRegex || seedAppliedRef.current) return;
    seedAppliedRef.current = true;
    if (search.query !== seedRegex.source) search.setQuery(seedRegex.source);
    search.setMode('regex');
    for (const flag of REGEX_FLAGS) {
      const shouldBeEnabled = seedRegex.flags.includes(flag);
      if (search.flags.includes(flag) !== shouldBeEnabled) search.toggleFlag(flag);
    }
  }, [search, seedRegex]);

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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const palette = paletteRef.current;
      if (!palette) return;
      const focusScopes = [
        palette,
        ...Array.from(document.querySelectorAll<HTMLElement>('[data-focus-scope="command-palette"]')),
      ];
      const focusable = focusScopes.flatMap((scope) =>
        Array.from(scope.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)));
      if (focusable.length === 0) {
        event.preventDefault();
        palette.focus();
        return;
      }
      const firstFocusable = focusable[0];
      const lastFocusable = focusable[focusable.length - 1];
      if (!firstFocusable || !lastFocusable) return;
      const activeElement = document.activeElement;
      const activeIndex = activeElement instanceof HTMLElement ? focusable.indexOf(activeElement) : -1;
      if (activeIndex === -1) {
        event.preventDefault();
        (event.shiftKey ? lastFocusable : firstFocusable).focus();
      } else if (event.shiftKey && activeIndex === 0) {
        event.preventDefault();
        lastFocusable.focus();
      } else if (!event.shiftKey && activeIndex === focusable.length - 1) {
        event.preventDefault();
        firstFocusable.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // Adapt the field controller to the command registry's existing filter
  // contract. `search.matches` is already bounded and safe for invalid or
  // slow patterns, and the wrapper is recreated from this field's state so no
  // RegExp instance or hidden builder state can leak in from another search.
  const regexFilter = useMemo<PaletteRegexFilter | null>(() => {
    if (search.mode !== 'regex') return null;
    return {
      source: search.query,
      flags: search.flags,
      matches: search.matches,
    };
  }, [search.flags, search.matches, search.mode, search.query]);

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
      if (entry.section === 'handoff') {
        // This row is a destination disguised as a SettingsSection token so
        // the settings search and palette share one inventory. It never asks
        // SettingsDialog to render a fake panel or write a last-section value.
        requestSettingsReveal(null);
        navigate({ kind: 'home', view: 'handoff' });
        close({ restoreFocus: false });
        return;
      }
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

  // Seed, density, UI scale, auto-fit and typography do NOT live in AppConfig.
  // They live in the appearance store, which persists to local storage and
  // writes the document attributes in the same call — so the palette reads and
  // writes them through the very hook `AppearanceControls` uses. One value, two
  // surfaces: a seed picked here is applied and stored before this line
  // returns, exactly as it is in Settings · Appearance.
  const { preferences: appearance, update: updateAppearance } = useAppearancePreferences();
  const setTypography = useCallback(
    (patch: Partial<AppearanceTypography>) => {
      updateAppearance({ typography: { ...appearance.typography, ...patch } });
    },
    [appearance.typography, updateAppearance],
  );

  const customInstructions = config.customInstructions ?? '';
  const setCustomInstructions = useCallback(
    (next: string) => {
      // `|| undefined` is the settings surface's own rule: an emptied box
      // removes the key rather than persisting an empty string that later
      // reads as "the user set an instruction, and it is nothing".
      writeConfig({ ...config, customInstructions: next || undefined });
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

  // Desktop notifications are the one toggle whose "on" is not the app's to
  // grant. Settings asks the browser first and stores what it was told; a
  // palette switch that only wrote `true` would report a setting the platform
  // has refused, and the user would be left waiting for banners that can never
  // arrive. Same order here: ask, then store the answer.
  //
  // Read once, on mount, exactly as the settings panel reads it: a platform
  // with no `Notification` at all disables the control rather than offering a
  // switch that can never stay on.
  const [notificationSupport] = useState(() => notificationPermission());
  const setDesktopNotifications = useCallback(
    (enabled: boolean) => {
      if (!enabled) {
        setNotification({ desktopEnabled: false });
        return;
      }
      void requestNotificationPermission().then((result) => {
        setNotification({ desktopEnabled: result === 'granted' });
      });
    },
    [setNotification],
  );

  // The narrator keeps its own store rather than riding in AppConfig, so the
  // palette reads it through the same hook the settings panel uses. Changing
  // it here changes it there: one store, two surfaces.
  const narrator = useNarrator();
  const setPaletteLanguageMode = useCallback((next: LanguageMode) => {
    setLanguageMode(next);
    writeUniversalSettingsPatch({ languageMode: next === 'bilingual' ? 'bilingual' : locale === 'zh-HK' ? 'cantonese' : 'english' });
  }, [locale, setLanguageMode]);
  const setPaletteFunnyLevel = useCallback((language: FunnyLanguage, level: FunnyLevel) => {
    setFunnyLevel(language, level);
    writeUniversalSettingsPatch(language === 'en' ? { funnyEnglish: level } : { funnyCantonese: level });
  }, [setFunnyLevel]);
  const setNarratorEnabled = useCallback(
    (enabled: boolean) => {
      narrator.setPreferences({ ...narrator.preferences, enabled });
      writeUniversalSettingsPatch({ narrator: { enabled } });
    },
    [narrator],
  );
  const setNarratorLanguage = useCallback(
    (language: NarratorLanguage) => {
      narrator.setPreferences({ ...narrator.preferences, language });
      writeUniversalSettingsPatch({ narrator: { language: language === 'en' ? 'english' : language === 'zh-HK' ? 'cantonese' : 'both' } });
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
      if (search.mode !== 'regex') setRawQuery((current) => parsePaletteQuery(current).query);
      setCursor(0);
      inputRef.current?.focus();
    },
    [search.mode],
  );

  const registryRows = useMemo(
    () =>
      buildPaletteRows({
        t,
        workspaceSettingsVisible,
        openSettingsEntry,
        goTo,
        openInNewTab,
        setScope,
        toggleFullWindow,
        fullWindow: displayMode === 'full',
        cycleTheme,
        toggleLanguageMode,
        openVersionHistory,
      }),
    [
      t,
      workspaceSettingsVisible,
      openSettingsEntry,
      goTo,
      openInNewTab,
      setScope,
      toggleFullWindow,
      displayMode,
      cycleTheme,
      toggleLanguageMode,
      openVersionHistory,
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
    const allRows = [
      ...filterPaletteRows(registryRows, query, scope, REGISTRY_ROWS_IN_LIST, regexFilter),
      ...fileRows,
    ];
    return schoolMode ? allRows.filter((row) => isSchoolAllowedPaletteRow(row, schoolModeName)) : allRows;
  }, [fileRows, query, regexFilter, registryRows, schoolMode, schoolModeName, scope]);

  useEffect(() => {
    setCursor(0);
  }, [rawQuery, regexFilter, scope]);

  useEffect(() => {
    const element = listRef.current?.querySelector<HTMLElement>(`[data-row-index="${cursor}"]`);
    element?.scrollIntoView?.({ block: 'nearest' });
  }, [cursor, rows.length]);

  const activeRow = rows[cursor];

  // `RegexSearchField` owns the input element, so keep the palette's live list
  // relationship on that element without changing the shared field contract.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.setAttribute('aria-controls', 'command-palette-list');
    if (activeRow) {
      input.setAttribute('aria-activedescendant', `command-palette-row-${cursor}`);
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  }, [activeRow, cursor]);

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
      event.stopPropagation();
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
      onMouseDown={(event) => {
        // The regex builder is portalled to `document.body`; React still
        // bubbles its events through this tree. Only the actual backdrop is a
        // close target, so interacting with the builder cannot dismiss the
        // palette underneath it.
        if (event.target === event.currentTarget) close();
      }}
      role="presentation"
      variants={modalOverlay}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      <motion.div
        className={`${styles.palette} ${displayMode === 'full' ? styles.full : styles.card}`}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          // The search field handles Escape itself so the regex builder can
          // close first, and the builder stops the event in its own portal.
          // This dialog-level fallback covers every other focused control:
          // size, scope, and live setting controls must all have the same
          // reliable escape route.
          if (
            event.key !== 'Escape'
            || event.defaultPrevented
            || event.nativeEvent.isComposing
          ) return;
          event.preventDefault();
          event.stopPropagation();
          close();
        }}
        role="dialog"
        aria-modal="true"
        aria-label={t('commandPalette.title')}
        data-testid="command-palette"
        data-display-mode={displayMode}
        ref={paletteRef}
        variants={scaleIn}
        initial="hidden"
        animate="visible"
        exit="exit"
      >
        <div className={styles.searchRow}>
          <Icon name="search" size={15} aria-hidden />
          <RegexSearchField
            search={search}
            fieldLabel={t('commandPalette.placeholder')}
            className={styles.input}
            // The shared field keeps its compact glyph button for dense
            // toolbars. The palette is a modal search surface, so its own
            // affordance gets the full 48px keyboard/touch target while the
            // input still gives up width first at narrow viewports.
            toggleClassName={styles.regexToggle}
            placeholder={t('commandPalette.placeholder')}
            ariaLabel={t('commandPalette.placeholder')}
            inputRef={inputRef}
            fieldId="command-palette-search"
            testId="command-palette-search"
            focusScopeId="command-palette"
            autoFocus
            spellCheck={false}
            autoComplete="off"
            onKeyDown={onKeyDown}
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

        {/* A pattern is active in this field, and the list is being matched
            with it rather than with plain-text scoring. Saying so is not
            decoration: without it the same query would produce two different
            result sets and nothing on screen would explain why. `role="status"`
            lets a screen-reader user hear the mode change too, and the button
            is the way back out. */}
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
              onClick={() => search.setMode('text')}
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
                          config={config}
                          onConfigChange={onConfigChange}
                          locale={locale}
                          setLocale={setLocale}
                          languageMode={languageMode}
                          setLanguageMode={setPaletteLanguageMode}
                          funnyLevels={funnyLevels}
                          setFunnyLevel={setPaletteFunnyLevel}
                          theme={theme}
                          setTheme={setTheme}
                          accentColor={accentColor}
                          setAccentColor={setAccentColor}
                          appearance={appearance}
                          updateAppearance={updateAppearance}
                          setTypography={setTypography}
                          customInstructions={customInstructions}
                          setCustomInstructions={setCustomInstructions}
                          soundEnabled={notifications?.soundEnabled ?? false}
                          desktopEnabled={notifications?.desktopEnabled ?? false}
                          setNotification={setNotification}
                          setDesktopNotifications={setDesktopNotifications}
                          desktopSupported={notificationSupport !== 'unsupported'}
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
  config: AppConfig;
  onConfigChange: (next: AppConfig) => void;
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
  appearance: AppearancePreferences;
  updateAppearance: (patch: Partial<AppearancePreferences>) => void;
  setTypography: (patch: Partial<AppearanceTypography>) => void;
  customInstructions: string;
  setCustomInstructions: (next: string) => void;
  soundEnabled: boolean;
  desktopEnabled: boolean;
  setNotification: (patch: Partial<NonNullable<AppConfig['notifications']>>) => void;
  setDesktopNotifications: (enabled: boolean) => void;
  desktopSupported: boolean;
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
    case 'appearance.logo':
      return (
        <Select
          className={styles.select}
          tabIndex={tabIndex}
          aria-label={t('brandDetail.logo')}
          value={props.config.appLogo?.presetId ?? DEFAULT_LOGO_STATE.presetId}
          onChange={(event) => {
            const current = normalizeLogoState(props.config.appLogo ?? DEFAULT_LOGO_STATE);
            props.onConfigChange({
              ...props.config,
              appLogo: { ...current, presetId: event.target.value as typeof current.presetId, custom: null },
            });
          }}
        >
          {LOGO_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{t(`appLogo.${preset.id}` as keyof Dict)}</option>)}
        </Select>
      );
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
    case 'appearance.seed':
      return (
        <Select
          className={styles.select}
          tabIndex={tabIndex}
          aria-label={t('appearance.seedLabel')}
          value={props.appearance.seed}
          onChange={(event) =>
            props.updateAppearance({ seed: event.target.value as AppearanceSeed })
          }
        >
          {APPEARANCE_SEEDS.map((seed) => (
            <option key={seed} value={seed}>{t(SEED_LABEL_KEY[seed])}</option>
          ))}
        </Select>
      );
    case 'appearance.density':
      return (
        <Select
          className={styles.select}
          tabIndex={tabIndex}
          aria-label={t('appearance.densityLabel')}
          value={props.appearance.density}
          onChange={(event) =>
            props.updateAppearance({ density: event.target.value as AppearanceDensity })
          }
        >
          {APPEARANCE_DENSITIES.map((density) => (
            <option key={density} value={density}>{t(DENSITY_LABEL_KEY[density])}</option>
          ))}
        </Select>
      );
    case 'appearance.uiScale':
      return (
        <SettingStepper
          label={t('appearance.uiScaleLabel')}
          // Percent, like the editor's slider and the status bar readout —
          // the stored value is a factor, and a stepper offering 0.05 steps
          // of a unitless number would be a control nobody can read.
          value={Math.round(props.appearance.uiScale * 100)}
          min={Math.round(MIN_UI_SCALE * 100)}
          max={Math.round(MAX_UI_SCALE * 100)}
          step={Math.round(UI_SCALE_STEP * 100)}
          unit="%"
          // Auto-fit owns the scale while it is on; the editor disables its
          // slider for the same reason, and the number stays visible because
          // it is still the truthful readout of what is on screen.
          disabled={props.appearance.autoFit}
          onChange={(next) => props.updateAppearance({ uiScale: quantizeUiScale(next / 100) })}
          tabIndex={tabIndex}
        />
      );
    case 'appearance.autoFit':
      return (
        <Switch
          label={t('appearance.autoFit')}
          checked={props.appearance.autoFit}
          onChange={(next) => props.updateAppearance({ autoFit: next })}
          tabIndex={tabIndex}
        />
      );
    case 'appearance.fontFamily':
      return (
        <Select
          className={styles.select}
          tabIndex={tabIndex}
          aria-label={t('appearance.fontFamily')}
          value={props.appearance.typography.fontStackId}
          onChange={(event) =>
            props.setTypography({ fontStackId: event.target.value as FontStackId })
          }
        >
          {FONT_STACK_IDS.map((id) => (
            <option key={id} value={id}>{t(FONT_LABEL_KEY[id])}</option>
          ))}
        </Select>
      );
    case 'appearance.fontSize':
      return (
        <SettingStepper
          label={t('appearance.fontSize')}
          value={props.appearance.typography.fontSizePx}
          min={MIN_FONT_SIZE_PX}
          max={MAX_FONT_SIZE_PX}
          step={0.5}
          unit="px"
          onChange={(next) => props.setTypography({ fontSizePx: next })}
          tabIndex={tabIndex}
        />
      );
    case 'appearance.fontWeight':
      return (
        <SettingStepper
          label={t('appearance.fontWeight')}
          value={props.appearance.typography.fontWeight}
          min={100}
          max={900}
          step={100}
          onChange={(next) => props.setTypography({ fontWeight: next })}
          tabIndex={tabIndex}
        />
      );
    case 'appearance.lineHeight':
      return (
        <SettingStepper
          label={t('appearance.lineHeight')}
          value={props.appearance.typography.lineHeight}
          min={1}
          max={2.4}
          step={0.05}
          onChange={(next) => props.setTypography({ lineHeight: next })}
          tabIndex={tabIndex}
        />
      );
    case 'appearance.letterSpacing':
      return (
        <SettingStepper
          label={t('appearance.letterSpacing')}
          value={props.appearance.typography.letterSpacingEm}
          min={-0.05}
          max={0.2}
          step={0.005}
          unit="em"
          onChange={(next) => props.setTypography({ letterSpacingEm: next })}
          tabIndex={tabIndex}
        />
      );
    case 'instructions.customInstructions':
      return (
        <SettingTextField
          label={t('settings.customInstructionsTitle')}
          placeholder={t('settings.customInstructionsPlaceholder')}
          value={props.customInstructions}
          // The same 5000-character ceiling the textarea in Settings ·
          // Instructions enforces. Two numbers would be two different
          // settings wearing one name.
          maxLength={5000}
          onCommit={props.setCustomInstructions}
          tabIndex={tabIndex}
        />
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
        <Switch
          label={t('settings.notifyCompletionSound')}
          checked={props.soundEnabled}
          onChange={(next) => props.setNotification({ soundEnabled: next })}
          tabIndex={tabIndex}
        />
      );
    case 'notifications.desktop':
      return (
        <Switch
          label={t('settings.notifyDesktop')}
          checked={props.desktopEnabled}
          onChange={props.setDesktopNotifications}
          disabled={!props.desktopSupported}
          tabIndex={tabIndex}
        />
      );
    case 'narrator.enable':
      return (
        <Switch
          label={t('narrator.enable')}
          checked={props.narratorEnabled}
          onChange={props.setNarratorEnabled}
          tabIndex={tabIndex}
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
        <Switch
          label={t('pet.wakeTitle')}
          checked={props.petEnabled}
          onChange={props.setPetEnabled}
          tabIndex={tabIndex}
        />
      );
    case 'privacy.metrics':
      return (
        <Switch
          label={t('settings.privacyMetrics')}
          checked={props.metricsEnabled}
          onChange={props.setMetrics}
          tabIndex={tabIndex}
        />
      );
    default: {
      const exhaustive: never = control;
      return exhaustive;
    }
  }
}

/**
 * A number this row can be nudged with, bounded by the same range the
 * settings editor's slider is bounded by.
 *
 * The draft state is what makes it typeable. A bare controlled number input
 * cannot be edited from 100 to 18: clearing it hands `''` to the change
 * handler, the parse fails or reads as zero, and whatever gets written is
 * rendered straight back over what the user is halfway through typing. So the
 * box keeps the text, the setting keeps the number, and the two are reconciled
 * on every valid keystroke and again on blur — where anything out of range is
 * clamped rather than dropped, exactly as dragging a slider to its end is.
 *
 * `value` still wins whenever it changes underneath: the store is shared, and
 * a scale changed by auto-fit or by the editor in another surface has to show
 * up here rather than being masked by a stale draft.
 */
function SettingStepper({
  label,
  value,
  min,
  max,
  step,
  unit,
  disabled = false,
  onChange,
  tabIndex,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  disabled?: boolean;
  onChange: (next: number) => void;
  tabIndex: number;
}) {
  const [draft, setDraft] = useState(() => String(value));
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setDraft(String(value));
  }

  const clamp = (candidate: number) => Math.min(max, Math.max(min, candidate));

  return (
    <span className={styles.stepper}>
      <input
        type="number"
        className={styles.stepperInput}
        value={draft}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        tabIndex={tabIndex}
        aria-label={label}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          const parsed = Number(next);
          if (next.trim() === '' || !Number.isFinite(parsed)) return;
          if (parsed < min || parsed > max) return;
          onChange(parsed);
        }}
        onBlur={() => {
          const parsed = Number(draft);
          if (draft.trim() === '' || !Number.isFinite(parsed)) {
            setDraft(String(value));
            return;
          }
          const settled = clamp(parsed);
          setDraft(String(settled));
          if (settled !== value) onChange(settled);
        }}
      />
      {unit ? <span className={styles.stepperUnit} aria-hidden>{unit}</span> : null}
    </span>
  );
}

/**
 * A text setting, edited in the row and committed when the user leaves it.
 *
 * Committed on blur rather than on every keystroke, because this one goes
 * through `onConfigChange` — which saves the config and syncs it to the daemon.
 * A per-character write would be one save and one sync per character typed.
 * The settings surface reaches the same place through a debounce; this reaches
 * it when the field is done.
 *
 * A `textarea`, not an `input`, and the reason is not the height: an
 * `<input type="text">` strips newlines out of its value, so a multi-line
 * instruction opened here and committed back would silently come out as one
 * line. A one-row textarea looks the same in the row and keeps the text.
 */
function SettingTextField({
  label,
  placeholder,
  value,
  maxLength,
  onCommit,
  tabIndex,
}: {
  label: string;
  placeholder?: string;
  value: string;
  maxLength: number;
  onCommit: (next: string) => void;
  tabIndex: number;
}) {
  const [draft, setDraft] = useState(value);
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setDraft(value);
  }

  // Closing the palette while the field still has focus never fires `blur`,
  // and an edit that vanishes because the surface it was typed into went away
  // is the worst kind of data loss: silent, and blamed on the user. So the
  // pending draft is committed on the way out too.
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const valueRef = useRef(value);
  valueRef.current = value;
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;
  useEffect(
    () => () => {
      if (draftRef.current !== valueRef.current) commitRef.current(draftRef.current);
    },
    [],
  );

  return (
    <textarea
      className={styles.textField}
      rows={1}
      value={draft}
      maxLength={maxLength}
      placeholder={placeholder}
      aria-label={label}
      tabIndex={tabIndex}
      spellCheck={false}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft !== value) onCommit(draft);
      }}
    />
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

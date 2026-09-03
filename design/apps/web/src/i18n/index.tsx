'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { de } from './locales/de';
import { en } from './locales/en';
import { id } from './locales/id';
import { esES } from './locales/es-ES';
import { fa } from './locales/fa';
import { ar } from './locales/ar';
import { ja } from './locales/ja';
import { ko } from './locales/ko';
import { ptBR } from './locales/pt-BR';
import { ru } from './locales/ru';
import { zhCN } from './locales/zh-CN';
import { zhTW } from './locales/zh-TW';
import { zhHK } from './locales/zh-HK';
import { pl } from './locales/pl';
import { hu } from './locales/hu';
import { fr } from './locales/fr';
import { uk } from './locales/uk';
import { tr } from './locales/tr';
import { th } from './locales/th';
import { it } from './locales/it';
import { getOpenDesignHost } from '@open-design/host';
import { EN_FUNNY } from './funny/en';
import { ZH_HK_FUNNY } from './funny/zh-HK';
import {
  LOCALES,
  type Dict,
  type FunnyLanguage,
  type FunnyLevel,
  type FunnyOverrides,
  type LanguageMode,
  type Locale,
} from './types';
import {
  keepsTheFacts,
  renderBilingual,
  renderInLanguage,
  type Translate,
} from './interpolate';
import {
  isStudioFixtureCaptureStorageLocked,
  studioFixtureActiveRouteFromCurrentLocation,
  studioFixtureCaptureFunnyLevels,
  STUDIO_FIXTURE_LIFECYCLE_EVENT,
} from '../capture/studio-fixture';

export { LOCALES, LOCALE_LABEL, LANGUAGE_MODES, FUNNY_LEVELS } from './types';
export type { Locale, LanguageMode, FunnyLanguage, FunnyLevel } from './types';
// The pure composition/interpolation half of the translator lives in
// `./interpolate` so a non-React helper can import `tv()` without pulling in
// this provider. It is re-exported here so `../i18n` stays the one import
// site every component already uses.
export { keepsTheFacts, renderBilingual, renderInLanguage };
export type { Translate };
export { bilingualJoiner, composeBilingual, isTranslatedVar, tv } from './interpolate';
export type { TranslatedVar, TranslationVars } from './interpolate';

type DictKey = keyof Dict;

const DICTS: Record<Locale, Dict> = {
  'en': en,
  'id': id,
  'de': de,
  'zh-CN': zhCN,
  'zh-TW': zhTW,
  'zh-HK': zhHK,
  'pt-BR': ptBR,
  'es-ES': esES,
  'ru': ru,
  'fa': fa,
  'ar': ar,
  'ja': ja,
  'ko': ko,
  'pl': pl,
  'hu': hu,
  'fr': fr,
  'uk': uk,
  'tr': tr,
  'th': th,
  'it': it,
};

const LS_KEY = 'open-design:locale';
// Marker that says "the value in LS_KEY came from a deliberate user
// action through setLocale, not from some auto-detection path". Only
// values tagged this way win over the desktop host's injected OS
// locale, so a stale auto-detected pick can't pin the app forever once
// the user changes their system language.
const LS_SOURCE_KEY = 'open-design:locale-source';
const MANUAL_LOCALE_SOURCE = 'manual';
const LS_LANGUAGE_MODE_KEY = 'open-design:language-mode';
const LS_FUNNY_LEVEL_PREFIX = 'open-design:funny-level:';
const LS_FUNNY_DISCLOSURE_KEY = 'open-design:funny-disclosure-seen';

export function resolveSystemLocale(languages: readonly string[]): Locale | null {
  const supported = LOCALES as readonly string[];
  for (const raw of languages) {
    const normalized = raw.trim();
    if (!normalized) continue;

    const exact = LOCALES.find((locale) => locale.toLowerCase() === normalized.toLowerCase());
    if (exact) return exact;

    const subtags = normalized.toLowerCase().split('-');
    const language = subtags[0];
    if (language === 'zh') {
      // Region beats script. macOS reports Hong Kong as `zh-Hant-HK` and
      // Windows as `zh-HK`; both are Cantonese speakers, so a `hk` / `mo`
      // subtag anywhere in the tag wins over the `Hant` that may sit
      // beside it. A tag that only says Traditional (or says Taiwan)
      // still lands on zh-TW, which is what it means.
      const region = subtags.slice(1);
      if (region.includes('hk') || region.includes('mo')) return 'zh-HK';
      if (region.includes('hant') || region.includes('tw')) return 'zh-TW';
      return 'zh-CN';
    }

    const baseMatch = LOCALES.find((locale) => locale.toLowerCase().split('-')[0] === language);
    if (baseMatch && supported.includes(baseMatch)) return baseMatch;
  }
  return null;
}

// The two languages a bilingual render pairs, and the two that carry a
// funny-level dictionary. Everything else renders at its neutral base text
// however the sliders are set — no override map has been written for it,
// and quietly pretending otherwise would be worse than saying so.
const FUNNY_DICTS: Record<FunnyLanguage, FunnyOverrides> = {
  'en': EN_FUNNY,
  'zh-HK': ZH_HK_FUNNY,
};

function isFunnyLanguage(locale: Locale): locale is FunnyLanguage {
  return locale === 'en' || locale === 'zh-HK';
}

/**
 * The language shown beside the active one in bilingual mode.
 *
 * English pairs with 廣東話 and everything else pairs with English, so the
 * pair always contains a language the reader chose plus one they are very
 * likely to read — never two languages neither of which they picked.
 */
export function secondaryLocaleFor(locale: Locale): Locale {
  return locale === 'en' ? 'zh-HK' : 'en';
}

function applyFunny(
  language: FunnyLanguage,
  key: DictKey,
  base: string,
  level: FunnyLevel,
): string {
  if (level <= 1) return base;
  const entry = FUNNY_DICTS[language][key];
  if (!entry) return base;
  // The maps are sparse in both dimensions, so walk down to the nearest
  // defined step: a key that writes only 3 and 5 still reads playfully at 4
  // instead of snapping back to the neutral base.
  for (let step: number = level; step >= 2; step -= 1) {
    const candidate = entry[step as Exclude<FunnyLevel, 1>];
    if (candidate && keepsTheFacts(base, candidate)) return candidate;
  }
  return base;
}

function stringFor(
  locale: Locale,
  key: DictKey,
  funnyLevels: Record<FunnyLanguage, FunnyLevel>,
): string {
  const dict = DICTS[locale] ?? en;
  const base = dict[key] ?? en[key] ?? key;
  if (!isFunnyLanguage(locale)) return base;
  return applyFunny(locale, key, base, funnyLevels[locale]);
}

const DEFAULT_LANGUAGE_MODE: LanguageMode = 'single';
// Level 1 is the neutral base dictionary. Defaulting there means an install
// that never opens the setting reads exactly as it did before this existed,
// which is the honest default for copy the user has not opted into.
const DEFAULT_FUNNY_LEVELS: Record<FunnyLanguage, FunnyLevel> = { 'en': 1, 'zh-HK': 1 };

function readStored(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export function detectInitialLanguageMode(): LanguageMode {
  const route = studioFixtureActiveRouteFromCurrentLocation();
  if (route) return 'single';
  return readStored(LS_LANGUAGE_MODE_KEY) === 'bilingual' ? 'bilingual' : DEFAULT_LANGUAGE_MODE;
}

export function detectInitialFunnyLevels(): Record<FunnyLanguage, FunnyLevel> {
  const route = studioFixtureActiveRouteFromCurrentLocation();
  if (route) return { ...studioFixtureCaptureFunnyLevels };
  const levels: Record<FunnyLanguage, FunnyLevel> = { ...DEFAULT_FUNNY_LEVELS };
  for (const language of ['en', 'zh-HK'] as const) {
    const stored = Number(readStored(`${LS_FUNNY_LEVEL_PREFIX}${language}`));
    if (stored >= 1 && stored <= 5 && Number.isInteger(stored)) {
      levels[language] = stored as FunnyLevel;
    }
  }
  return levels;
}

export function detectFunnyDisclosureSeen(): boolean {
  return readStored(LS_FUNNY_DISCLOSURE_KEY) === 'seen';
}

/**
 * A `t()` bound to an explicit content-language tag rather than the app UI
 * locale. Used by the question-form card so host-rendered strings inside the
 * card (the "Other" chip, custom-answer copy) match the language the model
 * localized the form into — a Chinese form in an English UI must not mix
 * scripts. Returns null when the tag doesn't resolve to a bundled locale;
 * callers fall back to the context `t`.
 */
export function tForLanguageTag(tag: string | undefined): Translate | null {
  if (!tag || !tag.trim()) return null;
  const locale = resolveSystemLocale([tag]);
  if (!locale) return null;
  const dict = DICTS[locale] ?? en;
  const read = (key: DictKey): string => dict[key] ?? en[key] ?? key;
  return (key, vars) => renderInLanguage(read, key, vars);
}

// Read the OS locale the desktop host attached to its client descriptor.
// Packaged desktop builds need this because Chromium otherwise reports
// en-US through navigator.language regardless of the OS setting. We go
// through `getOpenDesignHost` rather than reading the bridge global by
// name so the web/preload boundary stays single-source (see the
// `host bridge boundary` guard test).
function readDesktopHostOsLocale(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const host = getOpenDesignHost();
  const value = host?.client?.osLocale;
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

// First-run defaults to the user's OS / browser language when possible.
// Priority: explicit user pick saved to localStorage (only when tagged
// as manual) > OS locale that the desktop host injected (packaged
// Electron) > navigator.languages > 'en'. The source tag matters
// because untagged localStorage values are treated as legacy /
// auto-detected — they don't override a fresh OS locale read.
// Exported so tests can pin the priority chain without spinning up the
// full I18nProvider.
export function detectInitialLocale(): Locale {
  if (typeof window === 'undefined') return 'en';
  if (studioFixtureActiveRouteFromCurrentLocation()) return 'en';
  let storedLocale: string | null = null;
  let storedSource: string | null = null;
  try {
    storedLocale = window.localStorage.getItem(LS_KEY);
    storedSource = window.localStorage.getItem(LS_SOURCE_KEY);
  } catch {
    /* ignore */
  }
  if (
    storedSource === MANUAL_LOCALE_SOURCE &&
    storedLocale &&
    (LOCALES as string[]).includes(storedLocale)
  ) {
    return storedLocale as Locale;
  }
  const hostOsLocale = readDesktopHostOsLocale();
  if (hostOsLocale) {
    const fromHost = resolveSystemLocale([hostOsLocale]);
    if (fromHost) return fromHost;
  }
  const detected = resolveSystemLocale(
    navigator.languages?.length ? navigator.languages : [navigator.language],
  );
  return detected ?? 'en';
}

interface I18nContextValue {
  locale: Locale;
  setLocale: (next: Locale) => void;
  t: Translate;
  languageMode: LanguageMode;
  setLanguageMode: (next: LanguageMode) => void;
  funnyLevels: Record<FunnyLanguage, FunnyLevel>;
  setFunnyLevel: (language: FunnyLanguage, level: FunnyLevel) => void;
  funnyDisclosureSeen: boolean;
  dismissFunnyDisclosure: () => void;
}

const I18nContext = createContext<I18nContextValue | null>(null);

// Stand-alone English translator used when no provider is mounted (e.g. an
// isolated test). It MUST be a module-level singleton, not rebuilt per render:
// components legitimately list `t` in effect dependency arrays, and inside the
// provider `t` is identity-stable (useCallback on [locale]). A fresh closure
// here would break that contract only on the provider-less path, turning any
// such effect into an infinite render loop that spins instead of failing —
// which reads as a hung test suite rather than a bug.
const FALLBACK_I18N: I18nContextValue = {
  locale: 'en',
  setLocale: () => { },
  t: (key, vars) => renderInLanguage((k) => en[k] ?? k, key, vars),
  // A provider-less render is a test harness or an isolated component, so
  // it receives the same neutral shipped defaults as a fresh provider. The
  // disclosure is treated as already seen because an isolated component
  // cannot persist that decision and must not show first-run copy on its own.
  languageMode: DEFAULT_LANGUAGE_MODE,
  setLanguageMode: () => { },
  funnyLevels: { ...DEFAULT_FUNNY_LEVELS },
  setFunnyLevel: () => { },
  funnyDisclosureSeen: true,
  dismissFunnyDisclosure: () => { },
};

interface ProviderProps {
  initial?: Locale;
  children: ReactNode;
}

const RTL_LOCALES: Locale[] = ['ar', 'fa'];

/**
 * Whether a locale lays out right-to-left. Exported because direction also
 * flips side-anchored UI (the nav rail moves to the right edge, so its
 * tooltips have to open toward the left) and those callers must not
 * re-declare the locale list.
 */
export function isRtlLocale(locale: Locale): boolean {
  return RTL_LOCALES.includes(locale);
}

export function I18nProvider({ initial, children }: ProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(() => initial ?? detectInitialLocale());
  const [languageMode, setLanguageModeState] = useState<LanguageMode>(detectInitialLanguageMode);
  const [funnyLevels, setFunnyLevelsState] = useState<Record<FunnyLanguage, FunnyLevel>>(
    detectInitialFunnyLevels,
  );
  const [funnyDisclosureSeen, setFunnyDisclosureSeenState] = useState<boolean>(
    detectFunnyDisclosureSeen,
  );

  // Keep <html lang="…" dir="…"> in sync so screen readers and CSS hooks
  // pick the right language token and direction without each component
  // having to set it itself.
  useEffect(() => {
    if (typeof document !== 'undefined') {
      const dir = isRtlLocale(locale) ? 'rtl' : 'ltr';
      document.documentElement.setAttribute('lang', locale);
      document.documentElement.setAttribute('dir', dir);
    }
  }, [locale]);

  // Bilingual mode pairs two languages into every single label, so it is the
  // mode that produces the longest string the product ever renders — and the
  // mode a layout measured against English runs out of room in first.
  // Publishing it beside `lang` and `dir` lets a stylesheet reserve that room
  // for the case that needs it without widening the single-language layout
  // too, and without any component having to know the setting exists — the
  // same single-interception-point rule the copy itself follows.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-od-language-mode', languageMode);
  }, [languageMode]);

  // The capture tuple owns language while a fixture session is active. The
  // lifecycle event also rehydrates the ordinary persisted choices when the
  // user leaves the queryless fixture continuation.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const syncCaptureLanguage = () => {
      const route = studioFixtureActiveRouteFromCurrentLocation();
      if (route) {
        setLocaleState('en');
        setLanguageModeState('single');
        setFunnyLevelsState({ ...studioFixtureCaptureFunnyLevels });
        return;
      }
      setLocaleState(initial ?? detectInitialLocale());
      setLanguageModeState(detectInitialLanguageMode());
      setFunnyLevelsState(detectInitialFunnyLevels());
    };
    window.addEventListener(STUDIO_FIXTURE_LIFECYCLE_EVENT, syncCaptureLanguage);
    syncCaptureLanguage();
    return () => window.removeEventListener(STUDIO_FIXTURE_LIFECYCLE_EVENT, syncCaptureLanguage);
  }, [initial]);

  const setLocale = useCallback((next: Locale) => {
    if (isStudioFixtureCaptureStorageLocked()) return;
    setLocaleState(next);
    try {
      window.localStorage.setItem(LS_KEY, next);
      // Marker so detectInitialLocale knows this came from a deliberate
      // user action and should beat the desktop host's OS locale.
      window.localStorage.setItem(LS_SOURCE_KEY, MANUAL_LOCALE_SOURCE);
    } catch {
      /* ignore */
    }
  }, []);

  const setLanguageMode = useCallback((next: LanguageMode) => {
    if (isStudioFixtureCaptureStorageLocked()) return;
    setLanguageModeState(next);
    writeStored(LS_LANGUAGE_MODE_KEY, next);
  }, []);

  const setFunnyLevel = useCallback((language: FunnyLanguage, level: FunnyLevel) => {
    if (isStudioFixtureCaptureStorageLocked()) return;
    setFunnyLevelsState((current) => {
      const next: Record<FunnyLanguage, FunnyLevel> = { ...current };
      next[language] = level;
      return next;
    });
    writeStored(`${LS_FUNNY_LEVEL_PREFIX}${language}`, String(level));
  }, []);

  const dismissFunnyDisclosure = useCallback(() => {
    if (isStudioFixtureCaptureStorageLocked()) return;
    setFunnyDisclosureSeenState(true);
    writeStored(LS_FUNNY_DISCLOSURE_KEY, 'seen');
  }, []);

  // Every component already reaches its copy through this one function, so
  // the funny level and the bilingual pairing are applied here and nowhere
  // else — no component knows either feature exists.
  //
  // Interpolation happens PER LANGUAGE, before the two halves are joined.
  // It used to happen last, on the already-composed string, which is
  // harmless for a number or a filename — the same value belongs in both
  // halves — but wrong for a value that is itself translated copy: it
  // arrived bilingual and was substituted into both halves, so
  // `t('statusBar.density', { level: <already "Default · 預設"> })` rendered
  // "Default · 預設 density · Default · 預設密度". Rendering each language
  // separately and joining afterwards fills the English template from the
  // English dictionary and the 廣東話 template from the 廣東話 one, giving
  // "Default density · 預設密度". Callers say which variables are copy by
  // wrapping them in `tv(key)`; everything else is still a plain value.
  //
  // The join decision still reads the two raw templates (see
  // `bilingualJoiner`), so a unit like `{n}m` declines to compose on the
  // same grounds it always did.
  const t = useCallback<Translate>(
    (key, vars) => {
      const readPrimary = (k: DictKey): string => stringFor(locale, k, funnyLevels);
      if (languageMode !== 'bilingual') return renderInLanguage(readPrimary, key, vars);
      const secondary = secondaryLocaleFor(locale);
      const readSecondary = (k: DictKey): string => stringFor(secondary, k, funnyLevels);
      return renderBilingual(readPrimary, readSecondary, key, vars);
    },
    [locale, languageMode, funnyLevels],
  );

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t,
      languageMode,
      setLanguageMode,
      funnyLevels,
      setFunnyLevel,
      funnyDisclosureSeen,
      dismissFunnyDisclosure,
    }),
    [
      locale,
      setLocale,
      t,
      languageMode,
      setLanguageMode,
      funnyLevels,
      setFunnyLevel,
      funnyDisclosureSeen,
      dismissFunnyDisclosure,
    ],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  // Falling back keeps the API safe to call without requiring every callsite
  // to wrap in a provider. See FALLBACK_I18N on why it is a shared singleton.
  return useContext(I18nContext) ?? FALLBACK_I18N;
}

// Convenience for components that only need the translator function.
export function useT(): I18nContextValue['t'] {
  return useI18n().t;
}

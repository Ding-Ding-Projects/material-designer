// Narrator preferences, and the one honest admission this feature has to
// make out loud.
//
// The queue can yield to or duck under a screen reader. What no web page
// can do is *detect* one: the platform exposes no API for it, and every
// popular heuristic (looking for focus patterns, timing, a hidden probe
// element) is a guess that is wrong in both directions — silencing the
// narrator for a sighted keyboard user, or talking over a real screen
// reader it failed to notice. Guessing wrong here is worse than not
// guessing, because the users it fails are exactly the ones the rule is
// written to protect.
//
// So `screenReaderRunning` is a preference the user sets, the settings
// panel says why it is not automatic, and the mechanism it drives is fully
// wired and tested. If the desktop host ever exposes Chromium's own
// accessibility-support signal, this becomes its default and the toggle
// becomes an override — no other code has to change.

import {
  DEFAULT_NARRATOR_SETTINGS,
  type NarratorLanguage,
  type NarratorSettings,
} from './queue';

export interface NarratorPreferences extends NarratorSettings {
  /**
   * The user's declaration that assistive technology is running. Drives
   * the yield-and-duck rule in `NarratorQueue`.
   */
  screenReaderRunning: boolean;
}

export const DEFAULT_NARRATOR_PREFERENCES: NarratorPreferences = {
  ...DEFAULT_NARRATOR_SETTINGS,
  screenReaderRunning: false,
};

export const NARRATOR_LANGUAGES: readonly NarratorLanguage[] = ['en', 'zh-HK', 'both'];

/**
 * What each spoken language is called on screen.
 *
 * Shared rather than restated: the settings panel and the command palette's
 * inline language control both render this list, and two copies of a label
 * map are two chances to call the same setting different things.
 */
export const NARRATOR_LANGUAGE_LABEL_KEYS: Record<
  NarratorLanguage,
  'narrator.languageEnglish' | 'narrator.languageCantonese' | 'narrator.languageBoth'
> = {
  'en': 'narrator.languageEnglish',
  'zh-HK': 'narrator.languageCantonese',
  'both': 'narrator.languageBoth',
};

const STORAGE_KEY = 'open-design:narrator';

export function normalizeNarratorPreferences(value: unknown): NarratorPreferences {
  const raw = (value ?? {}) as Partial<Record<keyof NarratorPreferences, unknown>>;
  return {
    // `=== true` rather than a truthiness test: a stored `"false"`, a `1`
    // from some future migration, or a missing key must all leave the
    // narrator off. Off is the only safe reading of an unclear value.
    enabled: raw.enabled === true,
    language:
      raw.language === 'zh-HK' || raw.language === 'both' || raw.language === 'en'
        ? raw.language
        : DEFAULT_NARRATOR_PREFERENCES.language,
    quiet: raw.quiet === true,
    screenReaderRunning: raw.screenReaderRunning === true,
  };
}

export function readStoredNarratorPreferences(): NarratorPreferences {
  if (typeof window === 'undefined') return DEFAULT_NARRATOR_PREFERENCES;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_NARRATOR_PREFERENCES;
    return normalizeNarratorPreferences(JSON.parse(raw));
  } catch {
    return DEFAULT_NARRATOR_PREFERENCES;
  }
}

export function writeStoredNarratorPreferences(prefs: NarratorPreferences): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

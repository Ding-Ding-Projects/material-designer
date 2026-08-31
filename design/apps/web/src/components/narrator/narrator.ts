// The one narrator.
//
// A module singleton rather than a React context, and that is a design
// decision rather than a shortcut. There is exactly one audio output and
// exactly one queue that must never be allowed to overlap; two providers
// mounted by accident, or a provider that remounts on a route change,
// would produce two voices talking at once — the single failure this
// feature is built to avoid. A singleton cannot be instantiated twice.
//
// The module still does nothing at import time. The queue is built on
// first use, so importing this into a component tree that also renders on
// the server does not reach for `window`.

import { useCallback, useEffect, useState } from 'react';

import { useI18n } from '../../i18n';
import type { Dict, FunnyLanguage, FunnyLevel } from '../../i18n/types';
import { narrationLine } from './lines';
import {
  NarratorQueue,
  type EnqueueOutcome,
  type NarratorCategory,
  type NarratorEnvironment,
} from './queue';
import {
  DEFAULT_NARRATOR_PREFERENCES,
  normalizeNarratorPreferences,
  readStoredNarratorPreferences,
  writeStoredNarratorPreferences,
  type NarratorPreferences,
} from './settings';
import { createBrowserNarratorEnvironment } from './speech';

let preferences: NarratorPreferences | null = null;
let queue: NarratorQueue | null = null;
const listeners = new Set<(prefs: NarratorPreferences) => void>();

function getPreferences(): NarratorPreferences {
  if (preferences === null) {
    preferences = typeof window === 'undefined'
      ? DEFAULT_NARRATOR_PREFERENCES
      : readStoredNarratorPreferences();
  }
  return preferences;
}

function getQueue(): NarratorQueue {
  if (queue === null) {
    queue = new NarratorQueue(createBrowserNarratorEnvironment(getPreferences));
    queue.setSettings(getPreferences());
  }
  return queue;
}

export function setNarratorPreferences(next: NarratorPreferences): void {
  const normalized = normalizeNarratorPreferences(next);
  preferences = normalized;
  writeStoredNarratorPreferences(normalized);
  getQueue().setSettings(normalized);
  for (const listener of listeners) listener(normalized);
}

export function getNarratorPreferences(): NarratorPreferences {
  return { ...getPreferences() };
}

/**
 * Replace the queue's environment. Only tests need this; the browser
 * environment is otherwise built once and never swapped.
 */
export function __setNarratorEnvironmentForTests(env: NarratorEnvironment | null): void {
  queue = env === null ? null : new NarratorQueue(env);
  if (queue) queue.setSettings(getPreferences());
}

export interface NarrateOptions {
  category: NarratorCategory;
  /**
   * Supersession identity. Defaults to the dictionary key, which is
   * usually right: the same key narrated twice is the same announcement.
   * Pass one explicitly when several keys describe one changing thing.
   */
  key?: string;
  vars?: Record<string, string | number>;
  /** Only the "speak a sample" button sets this. See `NarrationRequest`. */
  force?: boolean;
}

export interface Narrator {
  preferences: NarratorPreferences;
  setPreferences: (next: NarratorPreferences) => void;
  /** Say a dictionary key. Returns what the queue decided to do with it. */
  narrate: (key: keyof Dict, options: NarrateOptions) => EnqueueOutcome;
  /** Stop immediately and drop anything waiting. */
  stop: () => void;
  enabled: boolean;
}

export function useNarrator(): Narrator {
  const { funnyLevels } = useI18n();
  const [prefs, setPrefs] = useState<NarratorPreferences>(getPreferences);

  useEffect(() => {
    setPrefs(getPreferences());
    listeners.add(setPrefs);
    return () => {
      listeners.delete(setPrefs);
    };
  }, []);

  const narrate = useCallback(
    (key: keyof Dict, options: NarrateOptions): EnqueueOutcome => {
      // The funny levels are read from the provider on every call rather
      // than captured once, so a line queued after the slider moved is
      // spoken at the level the slider is on now.
      const levels: Record<FunnyLanguage, FunnyLevel> = funnyLevels;
      const line = narrationLine(key, levels, options.vars);
      return getQueue().enqueue({
        key: options.key ?? String(key),
        category: options.category,
        en: line.en,
        zhHK: line.zhHK,
        force: options.force,
      });
    },
    [funnyLevels],
  );

  const stop = useCallback(() => {
    getQueue().reset();
  }, []);

  const setPreferencesCallback = useCallback((next: NarratorPreferences) => {
    setNarratorPreferences(next);
  }, []);

  return {
    preferences: prefs,
    setPreferences: setPreferencesCallback,
    narrate,
    stop,
    enabled: prefs.enabled,
  };
}

// One appearance, shared by everything that reads or writes it.
//
// A module-level store rather than a hook per component, and rather than
// the per-field controller pattern the regex builder uses. The difference
// is that two regex fields on one screen must NOT see each other, whereas
// there is exactly one running appearance: if the editor's slider and the
// runtime that applies it held separate copies, the copy the user is
// dragging and the copy on screen would drift the moment either
// re-mounted. So the store is the single value, `setPreferences` persists
// and applies it in the same call, and every subscriber re-renders from
// the same object.
//
// Reads are lazy. The module does nothing at import time — no localStorage
// access, no DOM write — because it is imported into a Next.js tree that
// also renders on the server, and a module that touched `window` on import
// would break the build rather than the feature.

import { useCallback, useEffect, useState } from 'react';

import {
  DEFAULT_APPEARANCE_PREFERENCES,
  applyAppearancePreferencesToDocument,
  readStoredAppearancePreferences,
  writeStoredAppearancePreferences,
  type AppearancePreferences,
} from '../../state/appearance';
import {
  isStudioFixtureCaptureStorageLocked,
  studioFixtureCaptureAppearanceForCurrentLocation,
} from '../../capture/studio-fixture';

type Listener = (prefs: AppearancePreferences) => void;

const listeners = new Set<Listener>();
let current: AppearancePreferences | null = null;

function ensureLoaded(): AppearancePreferences {
  if (current === null) {
    current = typeof window === 'undefined'
      ? DEFAULT_APPEARANCE_PREFERENCES
      : isStudioFixtureCaptureStorageLocked()
        ? studioFixtureCaptureAppearanceForCurrentLocation()
        : readStoredAppearancePreferences();
  }
  return current;
}

export function getAppearancePreferences(): AppearancePreferences {
  return ensureLoaded();
}

/**
 * Write, persist, apply, notify — in that order, and never partially.
 *
 * Applying inside the setter rather than in a subscriber's effect is what
 * makes a dragged slider feel attached to the UI: the DOM is updated in
 * the same task as the input event, not one React commit later.
 */
export function setAppearancePreferences(next: AppearancePreferences): void {
  current = next;
  if (!isStudioFixtureCaptureStorageLocked()) writeStoredAppearancePreferences(next);
  if (typeof document !== 'undefined') {
    applyAppearancePreferencesToDocument(next);
  }
  for (const listener of listeners) listener(next);
}

export function subscribeToAppearancePreferences(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Reset the module's cached value.
 *
 * Only tests need this: without it, a store loaded during one test keeps
 * that value for every test after it in the same file, and a suite that
 * checks "an install that never opened the editor" would be reading the
 * previous test's slider position.
 */
export function resetAppearancePreferencesCache(): void {
  current = null;
}

export interface AppearanceStore {
  preferences: AppearancePreferences;
  setPreferences: (next: AppearancePreferences) => void;
  /** Change one property without restating the other three. */
  update: (patch: Partial<AppearancePreferences>) => void;
}

export function useAppearancePreferences(): AppearanceStore {
  const [preferences, setLocal] = useState<AppearancePreferences>(ensureLoaded);

  useEffect(() => {
    // Catch up first: another subscriber may have written between this
    // component's render and its effect, and starting from a stale value
    // would show the editor a state the document no longer has.
    setLocal(getAppearancePreferences());
    return subscribeToAppearancePreferences(setLocal);
  }, []);

  const setPreferences = useCallback((next: AppearancePreferences) => {
    setAppearancePreferences(next);
  }, []);

  const update = useCallback((patch: Partial<AppearancePreferences>) => {
    setAppearancePreferences({ ...getAppearancePreferences(), ...patch });
  }, []);

  return { preferences, setPreferences, update };
}

// Applies the stored appearance at boot, and keeps applying it.
//
// Mounted once by App. It renders nothing: its whole job is to make the
// saved seed, density, scale and typography real on the first paint, so a
// user who set a 125% UI scale last week does not spend a frame at 100%.
//
// `useLayoutEffect` for the same reason App's own theme effect uses it —
// it runs before the browser paints, so there is no flash of the default
// appearance. Safe here because this tree is `ssr: false`.

import { useLayoutEffect } from 'react';

import { applyAppearancePreferencesToDocument } from '../../state/appearance';
import { useAppearancePreferences } from './store';

export function AppearanceRuntime() {
  const { preferences } = useAppearancePreferences();

  // The store applies on every write, so this effect is only load-bearing
  // for the first render and for a remount. Re-applying an already-applied
  // appearance writes the same attributes and properties back, which is a
  // no-op the browser does not repaint for.
  useLayoutEffect(() => {
    applyAppearancePreferencesToDocument(preferences);
  }, [preferences]);

  return null;
}

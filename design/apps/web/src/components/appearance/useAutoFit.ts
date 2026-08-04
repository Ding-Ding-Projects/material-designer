// Auto-fit: let the window choose the UI scale.
//
// The whole feature is one sentence — "keep `uiScale` at whatever makes the
// design width fit this window" — and three things about it are not
// obvious:
//
//   1. It writes into `uiScale` rather than living beside it. A second
//      stored number would be a second answer to "how big is the UI", and
//      the status bar, the preset comparison and the exported theme file
//      would each have to know which of the two was currently real. One
//      number, one truth, and turning auto-fit off simply stops updating
//      it — the scale the window last chose stays put and becomes the
//      manual one, which is also the least surprising thing to hand back.
//
//   2. The measurement is immune to the thing it changes. Scaling divides
//      the layout viewport, so measuring the layout viewport to decide the
//      scale is a loop; `measureAutoFitUiScale` multiplies the applied
//      factor back out and measures the WINDOW, which scaling cannot move.
//      See `state/appearance.ts` for the two-mechanism derivation.
//
//   3. It only ever writes a CHANGED value. The store persists and applies
//      on every call and notifies every subscriber, so re-writing the same
//      factor on every resize event would be a localStorage write and a
//      re-render per pixel of a drag.
//
// A frame of debounce, because a resize during host scaling can briefly be
// observed with the new factor and the old layout width, and acting on that
// intermediate would show a scale nobody asked for for one frame.

import { useEffect } from 'react';

import { measureAutoFitUiScale } from '../../state/appearance';
import { getAppearancePreferences, setAppearancePreferences } from './store';

export function useAutoFit(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined') return;

    let frame: number | null = null;

    const fit = () => {
      frame = null;
      const prefs = getAppearancePreferences();
      // Re-read rather than closing over the enabled flag's preferences:
      // the switch may have been turned off between the resize and this
      // frame, and fitting after that would fight the user's own slider.
      if (!prefs.autoFit) return;
      const next = measureAutoFitUiScale();
      if (next === prefs.uiScale) return;
      setAppearancePreferences({ ...prefs, uiScale: next });
    };

    const schedule = () => {
      if (frame !== null) return;
      frame =
        typeof window.requestAnimationFrame === 'function'
          ? window.requestAnimationFrame(fit)
          : window.setTimeout(fit, 0);
    };

    // Fit once on enable, so turning the switch on does something visible
    // without waiting for the window to be dragged.
    fit();
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('resize', schedule);
      if (frame !== null) {
        if (typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(frame);
        else window.clearTimeout(frame);
      }
    };
  }, [enabled]);
}

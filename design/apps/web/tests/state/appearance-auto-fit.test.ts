// @vitest-environment jsdom

// Auto-fit's arithmetic, in isolation from the DOM it eventually writes to.
//
// The specs that matter here are the two that are easy to get wrong and
// impossible to see in a screenshot: that the fit is computed from a width
// scaling cannot move (otherwise the control chases itself), and that the
// factor it produces lands on the same grid the slider does (otherwise
// turning auto-fit off jumps the UI on the first drag).

import { afterEach, describe, expect, it } from 'vitest';

import {
  AUTO_FIT_REFERENCE_WIDTH,
  DEFAULT_APPEARANCE_PREFERENCES,
  MAX_UI_SCALE,
  MIN_UI_SCALE,
  autoFitUiScale,
  measureAutoFitUiScale,
  normalizeAppearancePreferences,
  quantizeUiScale,
  uiScaleApplication,
  unscaledViewportWidth,
} from '../../src/state/appearance';

afterEach(() => {
  document.documentElement.style.removeProperty('--od-scale');
  document.documentElement.style.removeProperty('--od-css-zoom');
});

describe('quantizeUiScale', () => {
  it('rounds onto the slider’s own five-point grid', () => {
    expect(quantizeUiScale(1.0733)).toBe(1.05);
    expect(quantizeUiScale(0.9249)).toBe(0.9);
    expect(quantizeUiScale(1.0)).toBe(1);
  });

  it('produces a clean two-decimal number rather than a float artefact', () => {
    // 12 * 0.05 is 0.6000000000000001 in binary floating point, and a stored
    // scale that never compares equal to a preset's 0.6 is a bug that only
    // shows up as "the preset never looks active".
    //
    // The value has to sit inside [MIN_UI_SCALE, MAX_UI_SCALE] to demonstrate
    // anything: an out-of-range one is clamped first and the rounding never
    // runs, which is how this assertion originally failed against a perfectly
    // correct function.
    expect(quantizeUiScale(0.6)).toBe(0.6);
    expect(String(quantizeUiScale(0.59))).toBe('0.6');
  });

  it('holds the range and survives nonsense', () => {
    expect(quantizeUiScale(9)).toBe(MAX_UI_SCALE);
    expect(quantizeUiScale(0.01)).toBe(MIN_UI_SCALE);
    expect(quantizeUiScale(Number.NaN)).toBe(1);
  });
});

describe('unscaledViewportWidth', () => {
  it('multiplies the factor back out when the host divided the viewport', () => {
    // Host scaling at 2x: a 1280px window lays out as 640px.
    const applied = uiScaleApplication(2, true);
    expect(applied.zoom).toBeNull();
    expect(applied.cssZoom).toBe('1');
    expect(unscaledViewportWidth(640, Number(applied.cssZoom), Number(applied.odScale))).toBe(1280);
  });

  it('leaves the width alone when CSS zoom is carrying the scale', () => {
    // The fallback path magnifies the paint and never moves the layout
    // viewport, so the layout width already IS the window width.
    const applied = uiScaleApplication(2, false);
    expect(applied.zoom).toBe('2');
    expect(unscaledViewportWidth(1280, Number(applied.cssZoom), Number(applied.odScale))).toBe(1280);
  });

  it('is the identity at scale 1 under either mechanism', () => {
    expect(unscaledViewportWidth(1440, 1, 1)).toBe(1440);
  });

  it('refuses to invent a width from a nonsense measurement', () => {
    expect(unscaledViewportWidth(0, 1, 1)).toBe(0);
    expect(unscaledViewportWidth(Number.NaN, 1, 1)).toBe(0);
  });
});

describe('autoFitUiScale', () => {
  it('is exactly 1 at the width the layout was designed against', () => {
    expect(autoFitUiScale(AUTO_FIT_REFERENCE_WIDTH)).toBe(1);
  });

  it('scales down for a narrow window and up for a wide one', () => {
    expect(autoFitUiScale(1080)).toBe(0.75);
    expect(autoFitUiScale(2160)).toBe(1.5);
  });

  it('never leaves the supported range, however extreme the window', () => {
    expect(autoFitUiScale(200)).toBe(MIN_UI_SCALE);
    expect(autoFitUiScale(100000)).toBe(MAX_UI_SCALE);
  });
});

describe('measureAutoFitUiScale', () => {
  it('reads the applied scaling off the document rather than re-deriving it', () => {
    const root = document.documentElement;
    // jsdom reports clientWidth 0, so the width is stubbed to make the
    // multiply-back explicit: a 720px layout viewport under host scaling at
    // 2x is a 1440px window, which is exactly the reference width.
    Object.defineProperty(root, 'clientWidth', { configurable: true, value: 720 });
    root.style.setProperty('--od-scale', '2');
    root.style.setProperty('--od-css-zoom', '1');

    expect(measureAutoFitUiScale()).toBe(1);

    // Same numbers, CSS carrying the zoom: 720px really is the window, so
    // the fit is half.
    root.style.setProperty('--od-css-zoom', '2');
    expect(measureAutoFitUiScale()).toBe(0.5);
  });
});

describe('the autoFit preference', () => {
  it('is off on an install that never opened the editor', () => {
    expect(DEFAULT_APPEARANCE_PREFERENCES.autoFit).toBe(false);
  });

  it('only reads as on for a real boolean true', () => {
    expect(normalizeAppearancePreferences({ autoFit: true }).autoFit).toBe(true);
    expect(normalizeAppearancePreferences({ autoFit: 'true' }).autoFit).toBe(false);
    expect(normalizeAppearancePreferences({ autoFit: 1 }).autoFit).toBe(false);
    expect(normalizeAppearancePreferences({}).autoFit).toBe(false);
  });

  it('survives a round trip through the stored payload', () => {
    const stored = JSON.parse(
      JSON.stringify({ ...DEFAULT_APPEARANCE_PREFERENCES, autoFit: true, uiScale: 1.25 }),
    );
    const back = normalizeAppearancePreferences(stored);
    expect(back.autoFit).toBe(true);
    expect(back.uiScale).toBe(1.25);
  });
});

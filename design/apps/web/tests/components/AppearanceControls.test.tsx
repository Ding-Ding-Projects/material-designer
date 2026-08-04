// @vitest-environment jsdom

// The runtime appearance controls.
//
// The state layer for seed, density, UI scale and typography shipped before
// any of it had a control: the store persisted it, the runtime applied it,
// and the only way to reach it was to pick a preset. These specs pin that
// each control exists, writes through the store, and lands on the document
// — because "shipped in the bundle, reachable by nobody" is exactly how the
// appearance editor failed once already.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { AppearanceControls } from '../../src/components/appearance/AppearanceControls';
import { AppearanceRuntime } from '../../src/components/appearance/AppearanceRuntime';
import {
  getAppearancePreferences,
  resetAppearancePreferencesCache,
  setAppearancePreferences,
} from '../../src/components/appearance/store';
import { DEFAULT_APPEARANCE_PREFERENCES, FONT_STACKS } from '../../src/state/appearance';

function clearAppliedAppearance(): void {
  const root = document.documentElement;
  root.removeAttribute('data-seed');
  root.removeAttribute('data-density');
  root.style.removeProperty('--od-scale');
  root.style.removeProperty('--od-css-zoom');
  root.style.removeProperty('zoom');
  root.style.removeProperty('--md-ref-typeface-plain');
  root.style.removeProperty('--od-ui-font-size');
  root.style.removeProperty('--od-ui-font-weight');
  root.style.removeProperty('--od-ui-line-height');
  root.style.removeProperty('--od-ui-letter-spacing');
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  resetAppearancePreferencesCache();
  clearAppliedAppearance();
});

describe('AppearanceControls: seed', () => {
  it('offers the four documented seeds and writes the one that is picked', () => {
    render(<AppearanceControls />);

    const group = screen.getByRole('radiogroup', { name: 'Seed colour' });
    expect(group).toBeTruthy();
    expect(screen.getByTestId('appearance-seed-sunset')).toBeTruthy();
    expect(screen.getByTestId('appearance-seed-violet')).toBeTruthy();
    expect(screen.getByTestId('appearance-seed-teal')).toBeTruthy();
    expect(screen.getByTestId('appearance-seed-lime')).toBeTruthy();

    fireEvent.click(screen.getByTestId('appearance-seed-violet'));

    expect(getAppearancePreferences().seed).toBe('violet');
    expect(document.documentElement.getAttribute('data-seed')).toBe('violet');
  });

  it('paints each swatch in its own seed rather than in the active one', () => {
    // Every swatch drawn with `--md-sys-color-primary` would be the same
    // colour, because that property already holds whichever seed is on.
    render(<AppearanceControls />);
    const sunset = screen.getByTestId('appearance-seed-sunset') as HTMLElement;
    const teal = screen.getByTestId('appearance-seed-teal') as HTMLElement;
    expect(sunset.style.background).not.toBe('');
    expect(sunset.style.background).not.toBe(teal.style.background);
  });

  it('removes the attribute for the baseline seed, which is :root itself', () => {
    setAppearancePreferences({ ...DEFAULT_APPEARANCE_PREFERENCES, seed: 'lime' });
    render(<AppearanceControls />);
    expect(document.documentElement.getAttribute('data-seed')).toBe('lime');

    fireEvent.click(screen.getByTestId('appearance-seed-sunset'));

    expect(getAppearancePreferences().seed).toBe('sunset');
    expect(document.documentElement.getAttribute('data-seed')).toBeNull();
  });
});

describe('AppearanceControls: density', () => {
  it('offers all three levels and applies the chosen one to the document', () => {
    render(<AppearanceControls />);

    expect(screen.getByRole('radiogroup', { name: 'Density' })).toBeTruthy();

    fireEvent.click(screen.getByTestId('appearance-density-comfortable'));
    expect(getAppearancePreferences().density).toBe('comfortable');
    expect(document.documentElement.getAttribute('data-density')).toBe('comfortable');

    fireEvent.click(screen.getByTestId('appearance-density-compact'));
    expect(document.documentElement.getAttribute('data-density')).toBe('compact');

    // "default" is the :root block, so it is applied by removing the
    // attribute rather than by writing it.
    fireEvent.click(screen.getByTestId('appearance-density-default'));
    expect(getAppearancePreferences().density).toBe('default');
    expect(document.documentElement.getAttribute('data-density')).toBeNull();
  });
});

describe('AppearanceControls: UI scale and auto-fit', () => {
  it('runs 50–200 in steps of 5 and writes the factor, not the percentage', () => {
    render(<AppearanceControls />);

    const slider = screen.getByTestId('appearance-ui-scale') as HTMLInputElement;
    expect(slider.min).toBe('50');
    expect(slider.max).toBe('200');
    expect(slider.step).toBe('5');

    fireEvent.change(slider, { target: { value: '125' } });

    expect(getAppearancePreferences().uiScale).toBe(1.25);
    expect(document.documentElement.style.getPropertyValue('--od-scale')).toBe('1.25');
  });

  it('does not reintroduce CSS zoom when the scale is 1', () => {
    // The mockup scaled with a non-standard `zoom` property that magnified
    // the paint without moving the layout viewport. An untouched install
    // must carry no `zoom` at all.
    render(<AppearanceControls />);
    expect(document.documentElement.style.getPropertyValue('zoom')).toBe('');
  });

  it('locks the slider while auto-fit owns the scale, without hiding it', () => {
    render(<AppearanceControls />);

    const slider = screen.getByTestId('appearance-ui-scale') as HTMLInputElement;
    expect(slider.disabled).toBe(false);

    fireEvent.click(screen.getByTestId('appearance-auto-fit'));

    expect(getAppearancePreferences().autoFit).toBe(true);
    // Still on screen: the thumb is the truthful readout of the current
    // scale even when the window is choosing it.
    expect(screen.getByTestId('appearance-ui-scale')).toBeTruthy();
    expect((screen.getByTestId('appearance-ui-scale') as HTMLInputElement).disabled).toBe(true);
  });

  it('fits the scale to the window as soon as the runtime sees the switch on', () => {
    // A 720px layout viewport with nothing scaling it is a 720px window,
    // which is half the 1440px reference width.
    Object.defineProperty(document.documentElement, 'clientWidth', {
      configurable: true,
      value: 720,
    });
    setAppearancePreferences({ ...DEFAULT_APPEARANCE_PREFERENCES, autoFit: true });

    render(<AppearanceRuntime />);

    expect(getAppearancePreferences().uiScale).toBe(0.5);
    expect(document.documentElement.style.getPropertyValue('--od-scale')).toBe('0.5');
  });
});

describe('AppearanceControls: typography', () => {
  it('lists every offered face with a sample rendered in that face', () => {
    render(<AppearanceControls />);

    for (const id of Object.keys(FONT_STACKS)) {
      expect(screen.getByTestId(`appearance-font-${id}`)).toBeTruthy();
    }

    const serif = screen.getByTestId('appearance-font-serif') as HTMLElement;
    const sample = serif.querySelector('span[style]') as HTMLElement | null;
    expect(sample).not.toBeNull();
    // The stack the row offers, ending in the CJK tail — rendered, not
    // described, so what is in the list is what the interface becomes.
    expect(sample?.style.fontFamily).toContain('Source Serif Pro');
    expect(sample?.style.fontFamily).toContain('Noto Serif CJK HK');
  });

  it('re-faces the whole typescale through the one reference token', () => {
    render(<AppearanceControls />);

    fireEvent.click(screen.getByTestId('appearance-font-mono'));

    expect(getAppearancePreferences().typography.fontStackId).toBe('mono');
    const applied = document.documentElement.style.getPropertyValue('--md-ref-typeface-plain');
    expect(applied).toContain('Roboto Mono');
    // Every stack ends in a CJK-capable family, so a Chinese, Japanese or
    // Korean interface never loses its face to a Latin-only first choice.
    expect(applied).toContain('Noto Sans Mono CJK HK');
  });

  it('returns to the token sheet’s own face rather than writing its value back', () => {
    setAppearancePreferences({
      ...DEFAULT_APPEARANCE_PREFERENCES,
      typography: { ...DEFAULT_APPEARANCE_PREFERENCES.typography, fontStackId: 'serif' },
    });
    render(<AppearanceControls />);
    expect(document.documentElement.style.getPropertyValue('--md-ref-typeface-plain')).not.toBe('');

    fireEvent.click(screen.getByTestId('appearance-font-default'));

    expect(document.documentElement.style.getPropertyValue('--md-ref-typeface-plain')).toBe('');
  });

  it('applies size, weight, line height and letter spacing live', () => {
    render(<AppearanceControls />);
    const root = document.documentElement;

    fireEvent.change(screen.getByTestId('appearance-font-size'), { target: { value: '16' } });
    expect(root.style.getPropertyValue('--od-ui-font-size')).toBe('16px');

    fireEvent.change(screen.getByTestId('appearance-font-weight'), { target: { value: '600' } });
    expect(root.style.getPropertyValue('--od-ui-font-weight')).toBe('600');

    fireEvent.change(screen.getByTestId('appearance-line-height'), { target: { value: '1.7' } });
    expect(root.style.getPropertyValue('--od-ui-line-height')).toBe('1.7');

    fireEvent.change(screen.getByTestId('appearance-letter-spacing'), { target: { value: '0.02' } });
    expect(root.style.getPropertyValue('--od-ui-letter-spacing')).toBe('0.02em');
  });

  it('keeps the properties this platform cannot honour visible and saved', () => {
    render(<AppearanceControls />);

    // Rendered rather than hidden: hiding them would make the editor look
    // unfinished and make an exported theme lossy.
    fireEvent.change(screen.getByTestId('appearance-optical-size'), { target: { value: '48' } });
    fireEvent.click(screen.getByTestId('appearance-small-caps'));

    const saved = getAppearancePreferences().typography;
    expect(saved.opticalSize).toBe(48);
    expect(saved.smallCaps).toBe(true);
    // Saved, and deliberately not written to the document.
    expect(document.documentElement.style.getPropertyValue('font-variant-caps')).toBe('');
  });
});

describe('AppearanceControls: persistence and reset', () => {
  it('writes every change to storage as it happens, with no Save step', () => {
    render(<AppearanceControls />);

    fireEvent.click(screen.getByTestId('appearance-density-compact'));
    fireEvent.click(screen.getByTestId('appearance-seed-teal'));
    fireEvent.change(screen.getByTestId('appearance-ui-scale'), { target: { value: '90' } });

    const raw = window.localStorage.getItem('open-design:appearance');
    expect(raw).not.toBeNull();
    const stored = JSON.parse(raw ?? '{}');
    expect(stored.density).toBe('compact');
    expect(stored.seed).toBe('teal');
    expect(stored.uiScale).toBe(0.9);
  });

  it('restores what was stored on a fresh mount, not the defaults', () => {
    setAppearancePreferences({
      ...DEFAULT_APPEARANCE_PREFERENCES,
      seed: 'teal',
      density: 'comfortable',
      uiScale: 1.15,
    });
    clearAppliedAppearance();
    resetAppearancePreferencesCache();

    render(<AppearanceControls />);

    expect(document.documentElement.getAttribute('data-seed')).toBe('teal');
    expect(document.documentElement.getAttribute('data-density')).toBe('comfortable');
    expect((screen.getByTestId('appearance-ui-scale') as HTMLInputElement).value).toBe('115');
  });

  it('resets every control at once, back to an untouched install', () => {
    setAppearancePreferences({
      ...DEFAULT_APPEARANCE_PREFERENCES,
      seed: 'lime',
      density: 'compact',
      uiScale: 1.4,
      autoFit: true,
    });
    render(<AppearanceControls />);

    fireEvent.click(screen.getByTestId('appearance-reset'));

    expect(getAppearancePreferences()).toEqual(DEFAULT_APPEARANCE_PREFERENCES);
    expect(document.documentElement.getAttribute('data-seed')).toBeNull();
    expect(document.documentElement.getAttribute('data-density')).toBeNull();
    expect(document.documentElement.style.getPropertyValue('--od-scale')).toBe('1');
  });
});

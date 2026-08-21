// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_ACCENT_COLOR,
  applyAppearanceToDocument,
  normalizeAccentColor,
  resolveAccentColor,
  uiScaleApplication,
} from '../../src/state/appearance';

describe('normalizeAccentColor', () => {
  it('accepts six-digit hex colors and normalizes casing', () => {
    expect(normalizeAccentColor('  #4F46E5  ')).toBe('#4f46e5');
  });

  it('rejects invalid accent colors', () => {
    expect(normalizeAccentColor('blue')).toBeNull();
    expect(normalizeAccentColor('#123')).toBeNull();
    expect(normalizeAccentColor('#12345g')).toBeNull();
  });
});

describe('resolveAccentColor', () => {
  it('falls back to the first appearance color for missing or invalid values', () => {
    expect(resolveAccentColor(undefined)).toBe(DEFAULT_ACCENT_COLOR);
    expect(resolveAccentColor('blue')).toBe(DEFAULT_ACCENT_COLOR);
  });
});

describe('applyAppearanceToDocument', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.removeProperty('--accent');
    document.documentElement.style.removeProperty('--accent-strong');
    document.documentElement.style.removeProperty('--accent-soft');
    document.documentElement.style.removeProperty('--accent-tint');
    document.documentElement.style.removeProperty('--accent-hover');
  });

  it('applies the forced light theme and accent variables to the root element', () => {
    applyAppearanceToDocument({ accentColor: '#4F46E5' });

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#4f46e5');
    expect(document.documentElement.style.getPropertyValue('--accent-hover')).toContain('#4f46e5');
  });

  it('does not apply appearance colors to global background variables', () => {
    document.documentElement.style.setProperty('--bg', '#fafafa');
    document.documentElement.style.setProperty('--bg-app', '#f7f7f7');

    applyAppearanceToDocument({ accentColor: '#059669' });

    expect(document.documentElement.style.getPropertyValue('--bg')).toBe('#fafafa');
    expect(document.documentElement.style.getPropertyValue('--bg-app')).toBe('#f7f7f7');

    document.documentElement.style.removeProperty('--bg');
    document.documentElement.style.removeProperty('--bg-app');
  });

  it('applies accent variables while forcing a stale dark theme back to light', () => {
    document.documentElement.setAttribute('data-theme', 'dark');

    applyAppearanceToDocument({ accentColor: '#10B981' });

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#10b981');
    expect(document.documentElement.style.getPropertyValue('--accent-strong')).toContain('#10b981');
    expect(document.documentElement.style.getPropertyValue('--accent-soft')).toContain('#10b981');
    expect(document.documentElement.style.getPropertyValue('--accent-tint')).toContain('#10b981');
    expect(document.documentElement.style.getPropertyValue('--accent-hover')).toContain('#10b981');
  });

  it('replaces existing accent variables when the saved color changes', () => {
    applyAppearanceToDocument({ accentColor: '#4F46E5' });

    applyAppearanceToDocument({ accentColor: '#EF4444' });

    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#ef4444');
    expect(document.documentElement.style.getPropertyValue('--accent-strong')).toContain('#ef4444');
    expect(document.documentElement.style.getPropertyValue('--accent-strong')).not.toContain('#4f46e5');
    expect(document.documentElement.style.getPropertyValue('--accent-soft')).toContain('#ef4444');
    expect(document.documentElement.style.getPropertyValue('--accent-tint')).toContain('#ef4444');
    expect(document.documentElement.style.getPropertyValue('--accent-hover')).toContain('#ef4444');
  });

  it('falls back to the default accent when no valid accent is configured', () => {
    document.documentElement.style.setProperty('--accent', '#4f46e5');

    applyAppearanceToDocument({ accentColor: 'not-a-color' });

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe(DEFAULT_ACCENT_COLOR);
  });
});

// The UI scale used to be CSS `zoom` on `<html>` unconditionally, which
// magnified the paint and left the layout viewport alone: at 150% and 200%
// the packaged window grew a horizontal scrollbar, the home heading was cut
// off mid-word, and the status bar was pushed off the bottom edge. The host
// now scales its own web contents where it can, because that moves the real
// layout viewport; CSS scales the page only where there is no such host.
// These cases pin which of the two is in charge, and pin that 100% still
// writes nothing that could move a pixel.
describe('uiScaleApplication', () => {
  it('removes zoom entirely at 100%, so an untouched install is unchanged', () => {
    expect(uiScaleApplication(1, false)).toEqual({ cssZoom: '1', odScale: '1', zoom: null });
  });

  it('scales the page itself when no host took the job', () => {
    expect(uiScaleApplication(1.5, false)).toEqual({ cssZoom: '1.5', odScale: '1.5', zoom: '1.5' });
    expect(uiScaleApplication(2, false)).toEqual({ cssZoom: '2', odScale: '2', zoom: '2' });
  });

  // The important one. Leaving `zoom` on here would scale twice — once in the
  // host's viewport and once in the page — and leaving `--od-css-zoom` at the
  // user's factor would make the stylesheets divide the window lengths by a
  // zoom that was never applied, shrinking the shell into a corner.
  it('scales nothing in CSS when the host scaled its own web contents', () => {
    expect(uiScaleApplication(2, true)).toEqual({ cssZoom: '1', odScale: '2', zoom: null });
    expect(uiScaleApplication(1.25, true)).toEqual({ cssZoom: '1', odScale: '1.25', zoom: null });
  });

  // The status bar reads this, and the packaged capture harness verifies the
  // scale it asked for by reading it back off the document — so it carries
  // the user's factor on every route, including the one where CSS is idle.
  it('always reports the factor the user chose as --od-scale', () => {
    for (const scale of [0.5, 0.9, 1, 1.15, 1.25, 1.5, 2]) {
      expect(uiScaleApplication(scale, false).odScale).toBe(String(scale));
      expect(uiScaleApplication(scale, true).odScale).toBe(String(scale));
    }
  });
});

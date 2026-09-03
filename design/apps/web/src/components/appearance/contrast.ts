// WCAG 2.1 contrast, and the one thing every contrast readout gets wrong.
//
// The mistake is computing the ratio from a translucent foreground as if
// it were opaque. A 30%-alpha near-black on white is not a 21:1 pair; it
// is whatever it composites to, which is roughly 2:1 and fails everything.
// So `describeContrast` composites first and says that it did, because a
// readout that silently changed the colour it measured would be reporting
// a number about a colour the user is not looking at.
//
// Everything here is sRGB, which is what `relativeLuminance` assumes: the
// piecewise transfer function below is the sRGB one, not a generic gamma.

import { clamp, parseHex, type Rgb, type Rgba } from './color';

/** sRGB relative luminance, WCAG 2.1 §Relative luminance. */
export function relativeLuminance(rgb: Rgb): number {
  const channel = (value: number): number => {
    const c = clamp(value, 0, 255) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

/**
 * Contrast ratio between two opaque colours, from 1 to 21.
 *
 * Order does not matter: the brighter of the two always becomes the
 * numerator, so `contrastRatio(a, b) === contrastRatio(b, a)`.
 */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Straight-alpha source-over compositing of a colour onto an opaque one. */
export function compositeOver(fg: Rgba, bg: Rgb): Rgb {
  const a = clamp(fg.a, 0, 1);
  return {
    r: fg.r * a + bg.r * (1 - a),
    g: fg.g * a + bg.g * (1 - a),
    b: fg.b * a + bg.b * (1 - a),
  };
}

/**
 * WCAG conformance levels. `largeText` is 18pt, or 14pt bold — the
 * threshold is lower there because the strokes are wider, not because the
 * requirement is softer.
 */
export type ContrastLevel = 'AAA' | 'AA' | 'fail';

export const AA_NORMAL = 4.5;
export const AAA_NORMAL = 7;
export const AA_LARGE = 3;
export const AAA_LARGE = 4.5;
/** SC 1.4.11: icons, borders and focus rings, at any size. */
export const NON_TEXT_MIN = 3;

export function levelForNormalText(ratio: number): ContrastLevel {
  if (ratio >= AAA_NORMAL) return 'AAA';
  if (ratio >= AA_NORMAL) return 'AA';
  return 'fail';
}

export function levelForLargeText(ratio: number): ContrastLevel {
  if (ratio >= AAA_LARGE) return 'AAA';
  if (ratio >= AA_LARGE) return 'AA';
  return 'fail';
}

export interface ContrastReport {
  /** Ratio of the composited foreground against the background, 1–21. */
  ratio: number;
  normalText: ContrastLevel;
  largeText: ContrastLevel;
  /** SC 1.4.11 — passes at 3:1 whatever the text size. */
  nonText: boolean;
  /**
   * True when the foreground carried alpha and was composited before
   * measuring. The readout says so; the number means nothing without it.
   */
  composited: boolean;
}

export function describeContrast(foreground: Rgba, background: Rgb): ContrastReport {
  const composited = clamp(foreground.a, 0, 1) < 1;
  const solid = composited ? compositeOver(foreground, background) : foreground;
  const ratio = contrastRatio(solid, background);
  return {
    ratio,
    normalText: levelForNormalText(ratio),
    largeText: levelForLargeText(ratio),
    nonText: ratio >= NON_TEXT_MIN,
    composited,
  };
}

/** One decimal, the precision every WCAG tool quotes. `4.4972` → `"4.5"`. */
export function formatRatio(ratio: number): string {
  return `${(Math.round(ratio * 10) / 10).toFixed(1)}:1`;
}

/**
 * The most readable of black or white over an arbitrary background colour.
 *
 * This exists for grounds the user picks, such as the pet accent. A Material
 * `on-*` role names the ink for a container the design system owns, and none
 * of them knows what an arbitrary hex the user typed has to contrast against,
 * so the ink for such a ground has to be computed from it rather than named.
 * The default pet accent `#87ea5c` is the case that proves it: white sits at
 * 1.5:1 on that green and black at 14:1, so a literal ink is not a choice, it
 * is a coin toss the user loses.
 *
 * An unparseable value returns white, which is what these call sites painted
 * before this function existed, so an unexpected input keeps behaving exactly
 * as it does today instead of changing in some way nobody predicted.
 *
 * Any alpha on the background is ignored rather than composited, because the
 * surface underneath a user-chosen colour is not known here; a translucent
 * accent is measured as the colour it names.
 */
export function readableInkOn(background: string): string {
  const rgb = parseHex(background);
  if (!rgb) return 'white';
  const onBlack = contrastRatio(rgb, { r: 0, g: 0, b: 0 });
  const onWhite = contrastRatio(rgb, { r: 255, g: 255, b: 255 });
  return onBlack >= onWhite ? 'black' : 'white';
}

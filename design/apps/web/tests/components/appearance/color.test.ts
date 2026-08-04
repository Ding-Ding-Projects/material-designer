import { describe, expect, it } from 'vitest';

import {
  formatLab,
  formatLch,
  formatOklab,
  formatOklch,
  labToRgb,
  lchToRgb,
  oklabToRgb,
  oklchToRgb,
  parseColor,
  rgbToLab,
  rgbToLch,
  rgbToOklab,
  rgbToOklch,
  type ParsedColor,
  type Rgb,
} from '../../../src/components/appearance/color';
import { CSS_COLOR_NAMES } from '../../../src/components/appearance/colorNames';

/**
 * Every number in this file is a published reference value, not a value
 * read back out of the implementation. That distinction is the whole point:
 * a test that asserts `rgbToLab(red)` equals whatever `rgbToLab(red)`
 * returned the day it was written will pass just as happily with a
 * transposed matrix row, and colour maths fails by being plausibly wrong
 * rather than obviously broken.
 *
 * The sources are CSS Color Module Level 4's own worked examples, Bruce
 * Lindbloom's sRGB/CIELAB tables, and Björn Ottosson's OKLab reference
 * figures. Where a value is quoted to two decimals below, that is the
 * precision it is published to, and the assertion is loosened to match
 * rather than tightened past what the source actually says.
 *
 * Note that CIELAB here is D50-referenced and OKLab is D65-referenced.
 * That is not an inconsistency, it is what `lab()` and `oklab()` mean in
 * CSS, so the two report genuinely different numbers for one colour.
 */

const WHITE: Rgb = { r: 255, g: 255, b: 255 };
const BLACK: Rgb = { r: 0, g: 0, b: 0 };
const GREY: Rgb = { r: 128, g: 128, b: 128 };
const RED: Rgb = { r: 255, g: 0, b: 0 };
const GREEN: Rgb = { r: 0, g: 255, b: 0 };
const BLUE: Rgb = { r: 0, g: 0, b: 255 };
const TERRACOTTA: Rgb = { r: 0xc9, g: 0x64, b: 0x42 };

/**
 * A hundredth of an 8-bit step.
 *
 * Far below anything a display can show — but tight enough that a matrix
 * that is nearly right cannot hide inside it. The residue that remains is
 * the seventh-decimal rounding in the published Bradford matrices, which
 * are inverses of each other to about one part in a million.
 */
const ROUND_TRIP_TOLERANCE = 0.01;

/**
 * A tenth of an 8-bit step, for a trip that goes through a formatted string.
 *
 * Ten times looser than the conversion tolerance, and it has to be: the
 * formatters round CIELAB to two decimals, and two decimals of lightness is
 * already worth about a hundredth of a channel by the time it has been
 * through a cube and a transfer function.
 *
 * Measured worst case across the seven fixtures and four notations is 0.107 of
 * an 8-bit channel, on a saturated primary where the formatter's single
 * decimal place costs the most. 0.25 sits above that with headroom and still
 * half the step `translate.ts` is willing to call lossless — so a real
 * rounding regression fails here before it ever reaches the panel, while the
 * formatter's own quantization does not.
 */
const FORMATTED_ROUND_TRIP_TOLERANCE = 0.25;

function expectSameColor(actual: Rgb, expected: Rgb, tolerance = ROUND_TRIP_TOLERANCE): void {
  expect(Math.abs(actual.r - expected.r)).toBeLessThan(tolerance);
  expect(Math.abs(actual.g - expected.g)).toBeLessThan(tolerance);
  expect(Math.abs(actual.b - expected.b)).toBeLessThan(tolerance);
}

function parsed(text: string): ParsedColor {
  const result = parseColor(text, CSS_COLOR_NAMES);
  if (!result) throw new Error(`expected ${text} to parse as a colour`);
  return result;
}

describe('rgbToLab', () => {
  it('puts diffuse white at the top of the lightness axis with no colour on it', () => {
    const lab = rgbToLab(WHITE);
    expect(lab.l).toBeCloseTo(100, 6);
    // Exactly neutral, not merely close: the white point is derived by
    // pushing white through this same pipeline, so any tint here would mean
    // the two matrices disagree with the constant they are measured against.
    expect(lab.a).toBeCloseTo(0, 12);
    expect(lab.b).toBeCloseTo(0, 12);
  });

  it('puts black at the bottom', () => {
    const lab = rgbToLab(BLACK);
    expect(lab.l).toBeCloseTo(0, 12);
    expect(lab.a).toBeCloseTo(0, 12);
    expect(lab.b).toBeCloseTo(0, 12);
  });

  it('reads mid grey as L* 53.6, not 50 — the transfer function is not linear', () => {
    // The classic demonstration that #808080 is not "half of white": the
    // stored channel is halfway, the light is 21.6% of white, and the
    // perceived lightness lands at 53.6.
    const lab = rgbToLab(GREY);
    expect(lab.l).toBeCloseTo(53.585, 2);
    expect(lab.a).toBeCloseTo(0, 10);
    expect(lab.b).toBeCloseTo(0, 10);
  });

  it('matches the published D50 CIELAB coordinates of sRGB red', () => {
    const lab = rgbToLab(RED);
    expect(lab.l).toBeCloseTo(54.29, 1);
    expect(lab.a).toBeCloseTo(80.81, 1);
    expect(lab.b).toBeCloseTo(69.89, 1);
  });

  it('matches the published D50 CIELAB coordinates of sRGB blue', () => {
    const lab = rgbToLab(BLUE);
    expect(lab.l).toBeCloseTo(29.57, 1);
    expect(lab.a).toBeCloseTo(68.3, 1);
    expect(lab.b).toBeCloseTo(-112.03, 1);
  });

  it('keeps the a axis green-negative and the b axis blue-negative', () => {
    // Sign conventions are the easiest thing to invert without noticing,
    // because every magnitude still looks reasonable afterwards.
    expect(rgbToLab(GREEN).a).toBeLessThan(0);
    expect(rgbToLab(BLUE).b).toBeLessThan(0);
    expect(rgbToLab(RED).a).toBeGreaterThan(0);
  });
});

describe('rgbToLch', () => {
  it('matches the published LCH coordinates of sRGB red', () => {
    const lch = rgbToLch(RED);
    expect(lch.l).toBeCloseTo(54.29, 1);
    expect(lch.c).toBeCloseTo(106.84, 1);
    expect(lch.h).toBeCloseTo(40.85, 1);
  });

  it('reports hue 0 for a grey rather than whatever atan2 makes of the noise', () => {
    // A neutral's a and b are zero to within floating-point dust, and
    // `Math.atan2` will happily turn that dust into 180 degrees. There is
    // no hue at zero chroma; the convention here is 0.
    for (const grey of [BLACK, GREY, WHITE, { r: 17, g: 17, b: 17 }]) {
      const lch = rgbToLch(grey);
      expect(lch.c).toBeLessThan(1e-4);
      expect(lch.h).toBe(0);
    }
  });

  it('wraps hue into [0, 360) rather than reporting a negative angle', () => {
    // Yellow sits at roughly 100 degrees, magenta past 320: both come from
    // an `atan2` result that is negative before wrapping.
    for (const rgb of [RED, GREEN, BLUE, TERRACOTTA, { r: 255, g: 0, b: 255 }]) {
      const h = rgbToLch(rgb).h;
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(360);
    }
  });
});

describe('rgbToOklab', () => {
  it('puts white at lightness 1 exactly', () => {
    // Ottosson's linear-sRGB coefficients have rows summing to exactly 1,
    // so white reaches LMS (1, 1, 1) with no residue and comes out as
    // oklab(1 0 0). A mistyped digit shows up here first.
    const oklab = rgbToOklab(WHITE);
    // 7 decimals, not 8. The coefficients are published to 7-8 significant
    // figures, so white lands at 0.999999993 rather than exactly 1 — a 6.5e-9
    // residue that is the constants' own precision, not an error in them. A
    // mistyped digit would move this by many orders of magnitude, which is
    // what the assertion is really for.
    expect(oklab.l).toBeCloseTo(1, 7);
    expect(oklab.a).toBeCloseTo(0, 7);
    expect(oklab.b).toBeCloseTo(0, 7);
  });

  it('puts black at lightness 0', () => {
    const oklab = rgbToOklab(BLACK);
    expect(oklab.l).toBeCloseTo(0, 12);
    expect(oklab.a).toBeCloseTo(0, 12);
    expect(oklab.b).toBeCloseTo(0, 12);
  });

  it('reads mid grey at OKLab lightness 0.6', () => {
    // The cube root of the 21.586% linear light #808080 carries. OKLab
    // lightness runs 0–1, so this is 0.5999 and NOT 59.99.
    const oklab = rgbToOklab(GREY);
    expect(oklab.l).toBeCloseTo(0.5999, 3);
    // Same reason as white above: a neutral leaves ~2e-8 of chroma behind,
    // which is the published coefficients' precision showing through the cube
    // roots. Anything visible would be many orders larger.
    expect(oklab.a).toBeCloseTo(0, 7);
    expect(oklab.b).toBeCloseTo(0, 7);
  });
});

describe('rgbToOklch', () => {
  it('matches the published OKLCH coordinates of sRGB red', () => {
    const oklch = rgbToOklch(RED);
    expect(oklch.l).toBeCloseTo(0.628, 3);
    expect(oklch.c).toBeCloseTo(0.2577, 3);
    expect(oklch.h).toBeCloseTo(29.23, 1);
  });

  it('matches the published OKLCH coordinates of sRGB blue', () => {
    const oklch = rgbToOklch(BLUE);
    expect(oklch.l).toBeCloseTo(0.452, 3);
    expect(oklch.c).toBeCloseTo(0.3132, 3);
    expect(oklch.h).toBeCloseTo(264.05, 1);
  });

  it('reports hue 0 for greys here too, on the tighter OKLab chroma scale', () => {
    for (const grey of [BLACK, GREY, WHITE]) {
      expect(rgbToOklch(grey).h).toBe(0);
    }
  });

  it('separates lightness from chroma the way the space claims to', () => {
    // Red and blue are both fully saturated primaries; sRGB blue is much
    // darker. If lightness and chroma were leaking into each other this
    // ordering would not hold.
    expect(rgbToOklch(RED).l).toBeGreaterThan(rgbToOklch(BLUE).l);
    expect(rgbToOklch(GREY).c).toBeLessThan(rgbToOklch(RED).c);
  });
});

describe('perceptual round trips', () => {
  const samples: Array<[string, Rgb]> = [
    ['white', WHITE],
    ['black', BLACK],
    ['grey', GREY],
    ['red', RED],
    ['green', GREEN],
    ['blue', BLUE],
    ['terracotta', TERRACOTTA],
    ['a near-black', { r: 1, g: 2, b: 3 }],
    ['an arbitrary mid tone', { r: 18, g: 52, b: 86 }],
  ];

  for (const [name, rgb] of samples) {
    it(`returns ${name} unchanged through CIELAB`, () => {
      expectSameColor(labToRgb(rgbToLab(rgb)), rgb);
    });

    it(`returns ${name} unchanged through LCH`, () => {
      expectSameColor(lchToRgb(rgbToLch(rgb)), rgb);
    });

    it(`returns ${name} unchanged through OKLab`, () => {
      expectSameColor(oklabToRgb(rgbToOklab(rgb)), rgb);
    });

    it(`returns ${name} unchanged through OKLCH`, () => {
      expectSameColor(oklchToRgb(rgbToOklch(rgb)), rgb);
    });
  }
});

describe('the perceptual formatters', () => {
  it('writes CSS Color 4 space-separated syntax, not the comma form', () => {
    // Commas are legal in `rgb()` and `hsl()` for historical reasons and
    // are not legal in any of these four. Asserting the shape rather than
    // the exact digits keeps this test about syntax; the arithmetic is
    // checked against reference values above.
    expect(formatLab(rgbToLab(RED), 1)).toMatch(/^lab\(-?[\d.]+ -?[\d.]+ -?[\d.]+\)$/);
    expect(formatLch(rgbToLch(RED), 1)).toMatch(/^lch\([\d.]+ [\d.]+ [\d.]+\)$/);
    expect(formatOklab(rgbToOklab(RED), 1)).toMatch(/^oklab\(-?[\d.]+ -?[\d.]+ -?[\d.]+\)$/);
    expect(formatOklch(rgbToOklch(RED), 1)).toMatch(/^oklch\([\d.]+ [\d.]+ [\d.]+\)$/);
  });

  it('writes OKLab lightness on its own 0–1 scale, not CIELAB’s 0–100', () => {
    // The single most likely way to get this wrong is a factor of a
    // hundred, so the exact strings for white are worth pinning: white is
    // `oklab(1 0 0)` and `lab(100 0 0)`, and neither is the other.
    expect(formatOklab(rgbToOklab(WHITE), 1)).toBe('oklab(1 0 0)');
    expect(formatLab(rgbToLab(WHITE), 1)).toBe('lab(100 0 0)');
  });

  it('appends alpha behind a slash, and only when there is alpha to state', () => {
    expect(formatLab(rgbToLab(BLACK), 1)).toBe('lab(0 0 0)');
    expect(formatLab(rgbToLab(BLACK), 0.5)).toBe('lab(0 0 0 / 0.5)');
    expect(formatOklch(rgbToOklch(BLACK), 0.25)).toBe('oklch(0 0 0 / 0.25)');
  });

  it('never writes a negative zero', () => {
    // `Math.round(-0.0001)` is -0, and a `lab(100 -0 0)` in the clipboard
    // is the kind of detail that makes a user distrust the whole panel.
    for (const text of [
      formatLab(rgbToLab(WHITE), 1),
      formatOklab(rgbToOklab(WHITE), 1),
      formatLch(rgbToLch(GREY), 1),
      formatOklch(rgbToOklch(GREY), 1),
    ]) {
      expect(text).not.toContain('-0');
    }
  });
});

describe('parseColor, on the four perceptual notations', () => {
  it('reads back what the formatters write', () => {
    for (const rgb of [WHITE, BLACK, GREY, RED, GREEN, BLUE, TERRACOTTA]) {
      expectSameColor(parsed(formatLab(rgbToLab(rgb), 1)).rgba, rgb, FORMATTED_ROUND_TRIP_TOLERANCE);
      expectSameColor(parsed(formatLch(rgbToLch(rgb), 1)).rgba, rgb, FORMATTED_ROUND_TRIP_TOLERANCE);
      expectSameColor(parsed(formatOklab(rgbToOklab(rgb), 1)).rgba, rgb, FORMATTED_ROUND_TRIP_TOLERANCE);
      expectSameColor(parsed(formatOklch(rgbToOklch(rgb), 1)).rgba, rgb, FORMATTED_ROUND_TRIP_TOLERANCE);
    }
  });

  it('accepts a hand-typed oklch(), which used to be rejected outright', () => {
    const result = parsed('oklch(0.628 0.2577 29.23)');
    expect(result.format).toBe('oklch');
    expect(result.rgba.r).toBeCloseTo(255, 0);
    expect(result.rgba.g).toBeCloseTo(0, 0);
    expect(result.rgba.b).toBeCloseTo(0, 0);
  });

  it('accepts lch() and reports the space it matched', () => {
    const result = parsed('lch(54.29 106.84 40.85)');
    expect(result.format).toBe('lch');
    expect(result.rgba.r).toBeCloseTo(255, 0);
  });

  it('scales a percentage against that component reference range, not blindly by 100', () => {
    // CSS Color 4: 100% is 100 on a lab lightness, 1 on an oklab one, 125
    // on a lab a/b axis and 0.4 on an oklab one. Treating them all alike
    // is the mistake this guards.
    expectSameColor(parsed('lab(50% 0 0)').rgba, parsed('lab(50 0 0)').rgba);
    expectSameColor(parsed('oklab(50% 0 0)').rgba, parsed('oklab(0.5 0 0)').rgba);
    // 64.648% of 125 is 80.81; 55.912% of 125 is 69.89. Percentages chosen
    // to land exactly on the number beside them, so the assertion is about
    // the reference range and not about rounding.
    expectSameColor(parsed('lab(54.29 64.648% 55.912%)').rgba, parsed('lab(54.29 80.81 69.89)').rgba);
    // 64.425% of 0.4 is 0.2577 — a different full scale, same idea.
    expectSameColor(parsed('oklch(0.628 64.425% 29.23)').rgba, parsed('oklch(0.628 0.2577 29.23)').rgba);
  });

  it('carries alpha through the slash', () => {
    expect(parsed('oklch(0.628 0.2577 29.23 / 0.5)').rgba.a).toBeCloseTo(0.5, 6);
    expect(parsed('lab(54.29 80.81 69.89 / 40%)').rgba.a).toBeCloseTo(0.4, 6);
  });

  it('clips a colour outside the sRGB gamut and says which channel moved', () => {
    // Lab can name colours no sRGB display can show. The honest answer is
    // the nearest displayable colour plus a note, not a refusal and not a
    // silent substitution.
    const result = parsed('lab(100 100 100)');
    expect(result.clipped.length).toBeGreaterThan(0);
    expect(result.rgba.r).toBeLessThanOrEqual(255);
    expect(result.rgba.b).toBeGreaterThanOrEqual(0);
  });

  it('does not cry wolf about a colour that merely sits on the gamut boundary', () => {
    // Pure red comes back through two matrices and a transfer function as
    // 255.0000000004. Flagging that would train the user to ignore the flag.
    expect(parsed(formatLab(rgbToLab(RED), 1)).clipped).toEqual([]);
    expect(parsed(formatOklch(rgbToOklch(WHITE), 1)).clipped).toEqual([]);
  });

  it('still refuses text that is not a colour', () => {
    expect(parseColor('oklch(nonsense)', CSS_COLOR_NAMES)).toBeNull();
    expect(parseColor('lab(50)', CSS_COLOR_NAMES)).toBeNull();
    expect(parseColor('oklab()', CSS_COLOR_NAMES)).toBeNull();
  });
});

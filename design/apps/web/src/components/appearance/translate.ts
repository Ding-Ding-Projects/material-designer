// The colour translator: one colour, every representation, and an honest
// account of what each one costs.
//
// The interesting part is not the conversion — `color.ts` does that — it
// is `loss`. A translator that lists a dozen formats and copies them out
// without comment is telling the user they are interchangeable, and they
// are not: `#c96442` drops the alpha the picker is holding, `hsl()` rounds
// the hue to a tenth of a degree, `device-cmyk()` is not a colour anything
// can render without a profile, and `hsv()` is not CSS at all. Each of
// those is a real surprise waiting for someone who pastes the value
// somewhere else, so each one is declared here and rendered as a warning
// beside the value rather than discovered later.
//
// `rounding` is detected by DOING the round trip, never by predicting it:
// the value is formatted at the precision the user will copy, converted
// back, and compared to the source. That way the rounding rules live in
// exactly one place (the formatters) and this file cannot disagree with
// them. That applies to alpha too — a row that carries alpha proves it the
// same way, because "lossless" measured on three channels out of four is
// not a measurement, it is a hope.

import {
  clamp,
  cmykToRgb,
  formatCmyk,
  formatHex,
  formatHex8,
  formatHsl,
  formatHsla,
  formatHsv,
  formatHwb,
  formatLab,
  formatLch,
  formatOklab,
  formatOklch,
  formatRgb,
  formatRgba,
  hslToRgb,
  hsvToRgb,
  hwbToRgb,
  labToRgb,
  lchToRgb,
  oklabToRgb,
  oklchToRgb,
  parseHex,
  rgbToCmyk,
  rgbToHsl,
  rgbToHsv,
  rgbToHwb,
  rgbToLab,
  rgbToLch,
  rgbToOklab,
  rgbToOklch,
  type Rgb,
  type Rgba,
} from './color';
import { colorNameFor } from './colorNames';

export type ColorRepresentationId =
  | 'name'
  | 'hex'
  | 'hex8'
  | 'rgb'
  | 'rgba'
  | 'hsl'
  | 'hsla'
  | 'hsv'
  | 'hwb'
  | 'lab'
  | 'lch'
  | 'oklab'
  | 'oklch'
  | 'cmyk';

/**
 * Why a representation is not a lossless statement of the current colour.
 *
 * These are tokens rather than sentences so the component owns the copy
 * and the language modes apply to it; this module states the fact.
 */
export type ColorLoss =
  /** The format cannot carry alpha, and the colour has some. */
  | 'alpha'
  /** Formatting rounded the value; converting back lands elsewhere. */
  | 'rounding'
  /** Not a CSS colour value — it will not work in a stylesheet. */
  | 'not-css'
  /** Not colour-managed: no profile, no ink limit, no paper. */
  | 'unmanaged';

/**
 * The colour space the numbers are in.
 *
 * These are CSS Color 4's own space keywords rather than names invented
 * here, so `lab` and `lch` are listed separately even though LCH is only
 * CIELAB in polar form — CSS treats them as two spaces and a user pasting
 * either one is choosing between two different function names.
 */
export type ColorSpaceId = 'srgb' | 'lab' | 'lch' | 'oklab' | 'oklch' | 'device-cmyk';

export interface ColorRepresentation {
  id: ColorRepresentationId;
  /** Format name — `HEX`, `RGB`. Not translated: these are identifiers. */
  label: string;
  /** The text a copy button puts on the clipboard. */
  value: string;
  space: ColorSpaceId;
  loss: ColorLoss[];
}

/** How far two colours may differ and still count as the same colour. */
const ROUNDING_TOLERANCE = 0.5;

/**
 * How far alpha may move and still count as the same alpha.
 *
 * Not `ROUNDING_TOLERANCE / 255`, which is the tempting symmetry and is
 * wrong. The colour tolerance is half of an 8-bit step because r/g/b end up
 * in a byte on a display, so a difference below that renders identically.
 * Alpha does not: the picker holds it as a float and CSS carries it as a
 * float, so nothing quantises it on the way out and a move of 0.002 is a
 * real move.
 *
 * Half a step of the three decimals every alpha-carrying formatter here
 * writes is the honest bar. It clears `rgba()`, `hsla()`, `hwb()` and the
 * four perceptual notations, which all round to exactly that. It does not
 * clear HEX8, which stores alpha in one byte: 0.5 writes as `80` and reads
 * back as 0.501961, four times this tolerance out. That row now says so.
 */
const ALPHA_TOLERANCE = 0.0005;

function sameColor(a: Rgb, b: Rgb): boolean {
  return (
    Math.abs(a.r - b.r) < ROUNDING_TOLERANCE
    && Math.abs(a.g - b.g) < ROUNDING_TOLERANCE
    && Math.abs(a.b - b.b) < ROUNDING_TOLERANCE
  );
}

/**
 * The alpha a representation carries and the alpha it gives back.
 *
 * Omitted for a representation that cannot express alpha at all — those
 * declare `'alpha'` outright and there is nothing to round-trip. Supplied
 * by every representation that does carry it, because a row claiming a
 * lossless trip on the strength of three channels while quietly dropping
 * precision on the fourth is the same lie the `rounding` flag exists to
 * stop telling.
 */
interface AlphaTrip {
  source: number;
  roundTripped: number;
}

function withRounding(
  source: Rgb,
  roundTripped: Rgb,
  loss: ColorLoss[],
  alpha?: AlphaTrip,
): ColorLoss[] {
  const colorHeld = sameColor(source, roundTripped);
  const alphaHeld = !alpha || Math.abs(alpha.source - alpha.roundTripped) < ALPHA_TOLERANCE;
  return colorHeld && alphaHeld ? loss : [...loss, 'rounding'];
}

/**
 * Re-read a formatted value the way a machine would, so the round trip
 * measures what was actually written rather than what we meant to write.
 * Only the numbers matter, so a tolerant split is enough and a full CSS
 * parser is not.
 */
function numbersIn(text: string): number[] {
  return Array.from(text.matchAll(/-?\d+(?:\.\d+)?/g), (match) => Number(match[0]));
}

/**
 * Read one channel out of a list this module produced a line earlier by
 * formatting a colour it already holds, then parsing its own output back.
 *
 * The index is therefore always present. The fallback exists because the
 * compiler cannot know that, and it is 0 rather than a throw so a regression
 * in the formatter shows up as a visibly wrong colour in a settings panel
 * instead of taking the panel down. It is deliberately not a non-null
 * assertion: an assertion would silence the same compiler without leaving
 * anything behind for the next reader.
 */
function channelAt(values: number[], index: number): number {
  return values[index] ?? 0;
}

export function translateColor(rgba: Rgba): ColorRepresentation[] {
  const source: Rgb = { r: rgba.r, g: rgba.g, b: rgba.b };
  const alpha = clamp(rgba.a, 0, 1);
  const opaque = alpha >= 1;

  const hex = formatHex(source);
  const hex8 = formatHex8({ ...source, a: alpha });
  const hsl = rgbToHsl(source);
  const hsv = rgbToHsv(source);
  const hwb = rgbToHwb(source);
  const lab = rgbToLab(source);
  const lch = rgbToLch(source);
  const oklab = rgbToOklab(source);
  const oklch = rgbToOklch(source);
  const cmyk = rgbToCmyk(source);

  // Every round trip below starts from the FORMATTED string, not from the
  // component object, so a formatter that rounds to one decimal is caught
  // by its own output.
  const hexBack = parseHex(hex);
  const hex8Back = parseHex(hex8);
  const rgbaText = formatRgba({ ...source, a: alpha });
  const rgbaBack = numbersIn(rgbaText);
  const rgbText = formatRgb(source);
  const rgbBack = numbersIn(rgbText);
  const hslText = formatHsl(hsl);
  const hslBack = numbersIn(hslText);
  const hslaText = formatHsla(hsl, alpha);
  const hslaBack = numbersIn(hslaText);
  const hsvText = formatHsv(hsv);
  const hsvBack = numbersIn(hsvText);
  const hwbText = formatHwb(hwb, alpha);
  const hwbBack = numbersIn(hwbText);
  const labText = formatLab(lab, alpha);
  const labBack = numbersIn(labText);
  const lchText = formatLch(lch, alpha);
  const lchBack = numbersIn(lchText);
  const oklabText = formatOklab(oklab, alpha);
  const oklabBack = numbersIn(oklabText);
  const oklchText = formatOklch(oklch, alpha);
  const oklchBack = numbersIn(oklchText);
  const cmykText = formatCmyk(cmyk);
  const cmykBack = numbersIn(cmykText);

  /**
   * The alpha a slash-syntax formatter wrote back, or 1 when it wrote none.
   *
   * `formatHwb`, `formatLab` and their neighbours omit `/ A` entirely at
   * full opacity, so the fourth number is simply absent — reading index 3
   * regardless would find nothing, fall back to 0, and report every opaque
   * colour as having lost its alpha.
   */
  const trailingAlpha = (values: number[]): number => (opaque ? 1 : channelAt(values, 3));

  const representations: ColorRepresentation[] = [];

  const name = colorNameFor(hex);
  if (name) {
    representations.push({
      id: 'name',
      label: 'Name',
      value: name,
      space: 'srgb',
      // The name is looked up FROM `hex`, so it inherits whatever `hex`
      // lost on the way — it is not a second, exact statement of the
      // colour. It used to claim `opaque ? [] : ['alpha']` and nothing
      // else, which put "Name: gray" with a clean badge directly above
      // "HEX: #808080 · rounding" for the single colour r=g=b=127.5. Same
      // hex, same rounding, so: same check.
      loss: withRounding(source, hexBack ?? source, opaque ? [] : ['alpha']),
    });
  }

  representations.push({
    id: 'hex',
    label: 'HEX',
    value: hex,
    space: 'srgb',
    loss: withRounding(
      source,
      hexBack ?? source,
      opaque ? [] : ['alpha'],
    ),
  });

  representations.push({
    id: 'hex8',
    label: 'HEX8',
    value: hex8,
    space: 'srgb',
    // HEX8 carries alpha, but only to 1/255 — an alpha of 0.5 stores as
    // 0x80 and reads back as 0.502. That is a real round-trip failure and
    // it is now measured rather than described: the alpha goes through the
    // same format-then-reparse the colour channels do.
    loss: withRounding(source, hex8Back ?? source, [], {
      source: alpha,
      roundTripped: hex8Back?.a ?? alpha,
    }),
  });

  representations.push({
    id: 'rgb',
    label: 'RGB',
    value: rgbText,
    space: 'srgb',
    loss: withRounding(
      source,
      { r: channelAt(rgbBack, 0), g: channelAt(rgbBack, 1), b: channelAt(rgbBack, 2) },
      opaque ? [] : ['alpha'],
    ),
  });

  if (!opaque) {
    representations.push({
      id: 'rgba',
      label: 'RGBA',
      value: rgbaText,
      space: 'srgb',
      loss: withRounding(
        source,
        { r: channelAt(rgbaBack, 0), g: channelAt(rgbaBack, 1), b: channelAt(rgbaBack, 2) },
        [],
        { source: alpha, roundTripped: channelAt(rgbaBack, 3) },
      ),
    });
  }

  representations.push({
    id: 'hsl',
    label: 'HSL',
    value: hslText,
    space: 'srgb',
    loss: withRounding(
      source,
      hslToRgb({ h: channelAt(hslBack, 0), s: channelAt(hslBack, 1), l: channelAt(hslBack, 2) }),
      opaque ? [] : ['alpha'],
    ),
  });

  if (!opaque) {
    representations.push({
      id: 'hsla',
      label: 'HSLA',
      value: hslaText,
      space: 'srgb',
      loss: withRounding(
        source,
        hslToRgb({ h: channelAt(hslaBack, 0), s: channelAt(hslaBack, 1), l: channelAt(hslaBack, 2) }),
        [],
        { source: alpha, roundTripped: channelAt(hslaBack, 3) },
      ),
    });
  }

  representations.push({
    id: 'hsv',
    label: 'HSV',
    value: hsvText,
    space: 'srgb',
    // `hsv()` is the picker's own editing model and a notation every design
    // tool understands, but CSS has no such function — pasting it into a
    // stylesheet produces an invalid declaration, which is worth one word
    // of warning next to it.
    loss: withRounding(
      source,
      hsvToRgb({ h: channelAt(hsvBack, 0), s: channelAt(hsvBack, 1), v: channelAt(hsvBack, 2) }),
      opaque ? ['not-css'] : ['not-css', 'alpha'],
    ),
  });

  representations.push({
    id: 'hwb',
    label: 'HWB',
    value: hwbText,
    space: 'srgb',
    // `hwb()` takes `/ alpha` in CSS Color 4, so this one is complete.
    loss: withRounding(
      source,
      hwbToRgb({ h: channelAt(hwbBack, 0), w: channelAt(hwbBack, 1), b: channelAt(hwbBack, 2) }),
      [],
      { source: alpha, roundTripped: trailingAlpha(hwbBack) },
    ),
  });

  // The four perceptual notations. All are CSS Color 4, all carry alpha
  // behind a slash, and all are colour-managed against a defined white —
  // so unlike `hsv()` and `device-cmyk()` they have nothing to declare
  // beyond whatever their own rounding costs.
  representations.push({
    id: 'lab',
    label: 'CIELAB',
    value: labText,
    space: 'lab',
    loss: withRounding(
      source,
      labToRgb({ l: channelAt(labBack, 0), a: channelAt(labBack, 1), b: channelAt(labBack, 2) }),
      [],
      { source: alpha, roundTripped: trailingAlpha(labBack) },
    ),
  });

  representations.push({
    id: 'lch',
    label: 'LCH',
    value: lchText,
    space: 'lch',
    loss: withRounding(
      source,
      lchToRgb({ l: channelAt(lchBack, 0), c: channelAt(lchBack, 1), h: channelAt(lchBack, 2) }),
      [],
      { source: alpha, roundTripped: trailingAlpha(lchBack) },
    ),
  });

  representations.push({
    id: 'oklab',
    label: 'OKLab',
    value: oklabText,
    space: 'oklab',
    loss: withRounding(
      source,
      oklabToRgb({ l: channelAt(oklabBack, 0), a: channelAt(oklabBack, 1), b: channelAt(oklabBack, 2) }),
      [],
      { source: alpha, roundTripped: trailingAlpha(oklabBack) },
    ),
  });

  representations.push({
    id: 'oklch',
    label: 'OKLCH',
    value: oklchText,
    space: 'oklch',
    loss: withRounding(
      source,
      oklchToRgb({ l: channelAt(oklchBack, 0), c: channelAt(oklchBack, 1), h: channelAt(oklchBack, 2) }),
      [],
      { source: alpha, roundTripped: trailingAlpha(oklchBack) },
    ),
  });

  representations.push({
    id: 'cmyk',
    label: 'CMYK',
    value: cmykText,
    space: 'device-cmyk',
    loss: withRounding(
      source,
      cmykToRgb({ c: channelAt(cmykBack, 0), m: channelAt(cmykBack, 1), y: channelAt(cmykBack, 2), k: channelAt(cmykBack, 3) }),
      opaque ? ['unmanaged'] : ['unmanaged', 'alpha'],
    ),
  });

  return representations;
}

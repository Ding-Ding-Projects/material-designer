// The colour translator: one colour, every representation, and an honest
// account of what each one costs.
//
// The interesting part is not the conversion — `color.ts` does that — it
// is `loss`. A translator that lists ten formats and copies them out
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
// them.

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
  formatRgb,
  formatRgba,
  hslToRgb,
  hsvToRgb,
  hwbToRgb,
  parseHex,
  rgbToCmyk,
  rgbToHsl,
  rgbToHsv,
  rgbToHwb,
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

/** The colour space the numbers are in. Everything but CMYK is sRGB. */
export type ColorSpaceId = 'srgb' | 'device-cmyk';

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

function sameColor(a: Rgb, b: Rgb): boolean {
  return (
    Math.abs(a.r - b.r) < ROUNDING_TOLERANCE
    && Math.abs(a.g - b.g) < ROUNDING_TOLERANCE
    && Math.abs(a.b - b.b) < ROUNDING_TOLERANCE
  );
}

function withRounding(source: Rgb, roundTripped: Rgb, loss: ColorLoss[]): ColorLoss[] {
  return sameColor(source, roundTripped) ? loss : [...loss, 'rounding'];
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

export function translateColor(rgba: Rgba): ColorRepresentation[] {
  const source: Rgb = { r: rgba.r, g: rgba.g, b: rgba.b };
  const alpha = clamp(rgba.a, 0, 1);
  const opaque = alpha >= 1;

  const hex = formatHex(source);
  const hex8 = formatHex8({ ...source, a: alpha });
  const hsl = rgbToHsl(source);
  const hsv = rgbToHsv(source);
  const hwb = rgbToHwb(source);
  const cmyk = rgbToCmyk(source);

  // Every round trip below starts from the FORMATTED string, not from the
  // component object, so a formatter that rounds to one decimal is caught
  // by its own output.
  const hexBack = parseHex(hex);
  const rgbText = formatRgb(source);
  const rgbBack = numbersIn(rgbText);
  const hslText = formatHsl(hsl);
  const hslBack = numbersIn(hslText);
  const hsvText = formatHsv(hsv);
  const hsvBack = numbersIn(hsvText);
  const hwbText = formatHwb(hwb, alpha);
  const hwbBack = numbersIn(hwbText);
  const cmykText = formatCmyk(cmyk);
  const cmykBack = numbersIn(cmykText);

  const representations: ColorRepresentation[] = [];

  const name = colorNameFor(hex);
  if (name) {
    representations.push({
      id: 'name',
      label: 'Name',
      value: name,
      space: 'srgb',
      // A named colour is a name for an exact hex, so it never rounds; it
      // simply has no way to say "half transparent".
      loss: opaque ? [] : ['alpha'],
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
    // 0x80 and reads back as 0.502. The colour channels are what the
    // rounding flag reports on; the alpha step is stated in the panel.
    loss: withRounding(source, hexBack ?? source, []),
  });

  representations.push({
    id: 'rgb',
    label: 'RGB',
    value: rgbText,
    space: 'srgb',
    loss: withRounding(
      source,
      { r: rgbBack[0], g: rgbBack[1], b: rgbBack[2] },
      opaque ? [] : ['alpha'],
    ),
  });

  if (!opaque) {
    representations.push({
      id: 'rgba',
      label: 'RGBA',
      value: formatRgba({ ...source, a: alpha }),
      space: 'srgb',
      loss: withRounding(source, { r: rgbBack[0], g: rgbBack[1], b: rgbBack[2] }, []),
    });
  }

  representations.push({
    id: 'hsl',
    label: 'HSL',
    value: hslText,
    space: 'srgb',
    loss: withRounding(
      source,
      hslToRgb({ h: hslBack[0], s: hslBack[1], l: hslBack[2] }),
      opaque ? [] : ['alpha'],
    ),
  });

  if (!opaque) {
    representations.push({
      id: 'hsla',
      label: 'HSLA',
      value: formatHsla(hsl, alpha),
      space: 'srgb',
      loss: withRounding(source, hslToRgb({ h: hslBack[0], s: hslBack[1], l: hslBack[2] }), []),
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
      hsvToRgb({ h: hsvBack[0], s: hsvBack[1], v: hsvBack[2] }),
      opaque ? ['not-css'] : ['not-css', 'alpha'],
    ),
  });

  representations.push({
    id: 'hwb',
    label: 'HWB',
    value: hwbText,
    space: 'srgb',
    // `hwb()` takes `/ alpha` in CSS Color 4, so this one is complete.
    loss: withRounding(source, hwbToRgb({ h: hwbBack[0], w: hwbBack[1], b: hwbBack[2] }), []),
  });

  representations.push({
    id: 'cmyk',
    label: 'CMYK',
    value: cmykText,
    space: 'device-cmyk',
    loss: withRounding(
      source,
      cmykToRgb({ c: cmykBack[0], m: cmykBack[1], y: cmykBack[2], k: cmykBack[3] }),
      opaque ? ['unmanaged'] : ['unmanaged', 'alpha'],
    ),
  });

  return representations;
}

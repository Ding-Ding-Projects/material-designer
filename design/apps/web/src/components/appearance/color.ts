// Colour conversion for the infinite picker and its translator.
//
// One canonical model, sRGB with straight (non-premultiplied) alpha, and a
// conversion to and from every representation the translator offers. Two
// rules hold everywhere in this file:
//
//   1. Nothing rounds until it is formatted. Every function takes and
//      returns floating-point components, so a chain like
//      rgb → hsl → hwb → rgb is lossless to within floating-point error
//      rather than losing a little on each hop through an integer.
//   2. Alpha is carried, never invented. A conversion that changes only the
//      colour model leaves `a` exactly as it found it; a *format* that
//      cannot express alpha is the translator's problem to declare, not
//      this file's problem to hide (see `translate.ts`).
//
// Component ranges follow CSS, which is what the formatted output has to
// be valid in: r/g/b 0–255, h 0–360, everything else a percentage 0–100,
// and alpha 0–1.

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Rgba extends Rgb {
  a: number;
}

export interface Hsl {
  h: number;
  s: number;
  l: number;
}

export interface Hsv {
  h: number;
  s: number;
  v: number;
}

export interface Hwb {
  h: number;
  w: number;
  b: number;
}

export interface Cmyk {
  c: number;
  m: number;
  y: number;
  k: number;
}

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/** Wrap a hue into [0, 360). Negative hues are legal input; -30 is 330. */
export function normalizeHue(h: number): number {
  if (!Number.isFinite(h)) return 0;
  const wrapped = h % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

export function clampRgba(rgba: Rgba): Rgba {
  return {
    r: clamp(rgba.r, 0, 255),
    g: clamp(rgba.g, 0, 255),
    b: clamp(rgba.b, 0, 255),
    a: clamp(rgba.a, 0, 1),
  };
}

/**
 * Hue from already-normalized 0–1 channels.
 *
 * `%` in JavaScript keeps the sign of the dividend, so the red branch can
 * come out negative (a magenta at h ≈ -30). The wrap at the end is what
 * turns that into 330 rather than a hue no other function accepts.
 */
function hueFrom(r: number, g: number, b: number, max: number, delta: number): number {
  if (delta === 0) return 0;
  let h: number;
  if (max === r) {
    h = ((g - b) / delta) % 6;
  } else if (max === g) {
    h = (b - r) / delta + 2;
  } else {
    h = (r - g) / delta + 4;
  }
  h *= 60;
  return h < 0 ? h + 360 : h;
}

export function rgbToHsl(rgb: Rgb): Hsl {
  const r = clamp(rgb.r, 0, 255) / 255;
  const g = clamp(rgb.g, 0, 255) / 255;
  const b = clamp(rgb.b, 0, 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const l = (max + min) / 2;
  // The denominator is 0 only when l is 0 or 1, and both of those force
  // delta to 0 as well, so the guard on delta covers the division too.
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  return { h: hueFrom(r, g, b, max, delta), s: s * 100, l: l * 100 };
}

export function hslToRgb(hsl: Hsl): Rgb {
  const h = normalizeHue(hsl.h);
  const s = clamp(hsl.s, 0, 100) / 100;
  const l = clamp(hsl.l, 0, 100) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r1, g1, b1] = sectorOf(h, c, x);
  return { r: (r1 + m) * 255, g: (g1 + m) * 255, b: (b1 + m) * 255 };
}

/** The six 60° sectors both HSL and HSV reconstruct their channels from. */
function sectorOf(h: number, c: number, x: number): [number, number, number] {
  if (h < 60) return [c, x, 0];
  if (h < 120) return [x, c, 0];
  if (h < 180) return [0, c, x];
  if (h < 240) return [0, x, c];
  if (h < 300) return [x, 0, c];
  return [c, 0, x];
}

export function rgbToHsv(rgb: Rgb): Hsv {
  const r = clamp(rgb.r, 0, 255) / 255;
  const g = clamp(rgb.g, 0, 255) / 255;
  const b = clamp(rgb.b, 0, 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const s = max === 0 ? 0 : delta / max;
  return { h: hueFrom(r, g, b, max, delta), s: s * 100, v: max * 100 };
}

export function hsvToRgb(hsv: Hsv): Rgb {
  const h = normalizeHue(hsv.h);
  const s = clamp(hsv.s, 0, 100) / 100;
  const v = clamp(hsv.v, 0, 100) / 100;
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r1, g1, b1] = sectorOf(h, c, x);
  return { r: (r1 + m) * 255, g: (g1 + m) * 255, b: (b1 + m) * 255 };
}

export function rgbToHwb(rgb: Rgb): Hwb {
  const r = clamp(rgb.r, 0, 255) / 255;
  const g = clamp(rgb.g, 0, 255) / 255;
  const b = clamp(rgb.b, 0, 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return {
    h: hueFrom(r, g, b, max, max - min),
    w: min * 100,
    b: (1 - max) * 100,
  };
}

export function hwbToRgb(hwb: Hwb): Rgb {
  const h = normalizeHue(hwb.h);
  const w = clamp(hwb.w, 0, 100) / 100;
  const black = clamp(hwb.b, 0, 100) / 100;
  // CSS Color 4: when whiteness and blackness sum to 1 or more the hue is
  // gone entirely and the result is the grey their ratio describes. Without
  // this branch `1 - w - black` goes negative and the channels invert.
  if (w + black >= 1) {
    const grey = (w / (w + black)) * 255;
    return { r: grey, g: grey, b: grey };
  }
  const pure = hsvToRgb({ h, s: 100, v: 100 });
  const span = 1 - w - black;
  return {
    r: (pure.r / 255) * span * 255 + w * 255,
    g: (pure.g / 255) * span * 255 + w * 255,
    b: (pure.b / 255) * span * 255 + w * 255,
  };
}

/**
 * Naive device CMYK.
 *
 * This is the arithmetic every colour picker calls CMYK, and it is NOT a
 * colour-managed separation: there is no ICC profile, no ink limit and no
 * paper white, so the numbers describe a hypothetical device rather than a
 * press. It round-trips exactly, which is what makes it safe to offer as a
 * translation; it is not safe to send to a printer and expect this colour.
 * The translator labels it `device-cmyk` and says so in the interface.
 */
export function rgbToCmyk(rgb: Rgb): Cmyk {
  const r = clamp(rgb.r, 0, 255) / 255;
  const g = clamp(rgb.g, 0, 255) / 255;
  const b = clamp(rgb.b, 0, 255) / 255;
  const max = Math.max(r, g, b);
  const k = 1 - max;
  if (max === 0) {
    // Pure black. Every ratio below would be 0/0; black is all key.
    return { c: 0, m: 0, y: 0, k: 100 };
  }
  return {
    c: ((1 - r - k) / (1 - k)) * 100,
    m: ((1 - g - k) / (1 - k)) * 100,
    y: ((1 - b - k) / (1 - k)) * 100,
    k: k * 100,
  };
}

export function cmykToRgb(cmyk: Cmyk): Rgb {
  const c = clamp(cmyk.c, 0, 100) / 100;
  const m = clamp(cmyk.m, 0, 100) / 100;
  const y = clamp(cmyk.y, 0, 100) / 100;
  const k = clamp(cmyk.k, 0, 100) / 100;
  return {
    r: 255 * (1 - c) * (1 - k),
    g: 255 * (1 - m) * (1 - k),
    b: 255 * (1 - y) * (1 - k),
  };
}

/* ---- CIE XYZ, CIELAB and OKLab --------------------------------------

   Everything above this line is algebra on r/g/b. HSL, HSV, HWB and device
   CMYK re-slice the same cube and none of them knows what a colour looks
   like: the midpoint of two HSL lightnesses is not the colour halfway
   between them to an eye.

   Lab and OKLab do know. Getting there costs three stages, and skipping any
   one of them produces numbers that look plausible and are wrong:

     1. Undo the transfer function. sRGB channels are stored non-linearly,
        so 128 is not half the light of 255. Matrices only work on light.
     2. Matrix into CIE XYZ, which is linear light in a device-independent
        basis.
     3. Compress non-linearly again, this time the way the eye compresses,
        so that equal numeric steps are roughly equal perceived steps.

   One deliberate wrinkle, and it is the one thing here most likely to look
   like a bug: `lab()` and `lch()` in CSS Color 4 are **D50**-referenced,
   while `oklab()`, `oklch()` and sRGB itself are D65. So the CIELAB path
   carries a Bradford chromatic adaptation from D65 to D50 that the OKLab
   path does not, and the two report different numbers for the same colour
   on purpose. Dropping the adaptation would still produce a well-formed
   `lab(...)` string — it would simply be a different colour from the one
   the picker is holding once a browser read it back, which is exactly the
   sort of quiet surprise `translate.ts` exists to prevent. -------------- */

/**
 * CIELAB, D50-referenced to match CSS `lab()`.
 *
 * `Lab` and `Oklab` are structurally identical, so TypeScript will let you
 * hand one to a function expecting the other. It will not stop you; the
 * ranges are what tell them apart — Lab lightness runs 0–100 and OKLab
 * lightness runs 0–1, so a mix-up is off by a factor of a hundred and shows
 * up immediately rather than subtly.
 */
export interface Lab {
  /** Lightness, 0 (black) to 100 (diffuse white). */
  l: number;
  /** Green (negative) to red (positive). sRGB reaches roughly ±95. */
  a: number;
  /** Blue (negative) to yellow (positive). sRGB reaches roughly ±110. */
  b: number;
}

/** CIELAB in polar form: the same colour, chroma and hue instead of a/b. */
export interface Lch {
  l: number;
  /** Chroma. 0 is grey; sRGB reaches roughly 132. */
  c: number;
  /** Hue angle in degrees, 0–360. */
  h: number;
}

/** OKLab, D65-referenced to match CSS `oklab()`. Lightness is 0–1. */
export interface Oklab {
  /** Lightness, 0 to 1 — NOT 0 to 100. CSS `oklab()` takes it this way. */
  l: number;
  a: number;
  b: number;
}

/** OKLab in polar form. Chroma is 0–~0.32 across sRGB, not 0–132. */
export interface Oklch {
  l: number;
  c: number;
  h: number;
}

/** Linear light, device-independent. Only ever an intermediate here. */
type Xyz = readonly [number, number, number];

/**
 * The sRGB transfer function, decoding a stored channel to linear light.
 *
 * Threshold and exponent are IEC 61966-2-1: below 0.04045 the curve is the
 * straight segment `/12.92`, above it the offset power curve. The encoding
 * direction crosses over at 0.0031308, which is the same point mapped
 * through the linear segment and is deliberately not the same number.
 *
 * Both directions mirror a negative input through zero. The spec does not
 * define negatives because a display cannot emit them, but Lab can name a
 * colour outside sRGB and the inverse conversion lands there; mirroring
 * keeps the function monotonic across zero instead of folding negative
 * light back into positive and inventing a colour.
 */
function srgbToLinear(channel: number): number {
  const sign = channel < 0 ? -1 : 1;
  const c = Math.abs(channel);
  return sign * (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
}

function linearToSrgb(channel: number): number {
  const sign = channel < 0 ? -1 : 1;
  const c = Math.abs(channel);
  return sign * (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
}

/**
 * Linear sRGB → CIE XYZ, D65-referenced (the sRGB primaries as tabulated by
 * Lindbloom).
 *
 * Each row sums to the matching component of the D65 white point
 * (0.95047, 1, 1.08883), and that is the arithmetic check that the matrix
 * has been transcribed correctly: white in must be white out. A single
 * mistyped digit breaks that sum, which is why the rows are written out in
 * full rather than folded into a loop over a flat array.
 */
function linearRgbToXyz(r: number, g: number, b: number): Xyz {
  return [
    0.4124564 * r + 0.3575761 * g + 0.1804375 * b,
    0.2126729 * r + 0.7151522 * g + 0.072175 * b,
    0.0193339 * r + 0.119192 * g + 0.9503041 * b,
  ];
}

function xyzToLinearRgb(x: number, y: number, z: number): Xyz {
  return [
    3.2404542 * x - 1.5371385 * y - 0.4985314 * z,
    -0.969266 * x + 1.8760108 * y + 0.041556 * z,
    0.0556434 * x - 0.2040259 * y + 1.0572252 * z,
  ];
}

/**
 * Bradford chromatic adaptation between the D65 white sRGB is defined
 * against and the D50 white CSS `lab()` is defined against.
 *
 * Same self-check as above, one step further along: pushing the D65 white
 * (0.95047, 1, 1.08883) through this must land on the D50 white
 * (0.96422, 1, 0.82521). It does, to five decimal places.
 */
function xyzD65ToD50(x: number, y: number, z: number): Xyz {
  return [
    1.0478112 * x + 0.0228866 * y - 0.050127 * z,
    0.0295424 * x + 0.9904844 * y - 0.0170491 * z,
    -0.0092345 * x + 0.0150436 * y + 0.7521316 * z,
  ];
}

function xyzD50ToD65(x: number, y: number, z: number): Xyz {
  return [
    0.9555766 * x - 0.0230393 * y + 0.0631636 * z,
    -0.0282895 * x + 1.0099416 * y + 0.0210077 * z,
    0.0122982 * x - 0.020483 * y + 1.3299098 * z,
  ];
}

/**
 * The white Lab is measured against, derived rather than tabulated.
 *
 * Hard-coding (0.96422, 1, 0.82521) here would be the usual thing to do and
 * would be very slightly wrong: it is not exactly the image of sRGB white
 * under the two matrices above, so pure white would come out as
 * `lab(100 0.01 -0.01)` and every grey would carry a trace of colour.
 * Running white through the same pipeline the conversion uses makes
 * neutrality exact by construction instead of exact to five decimals.
 */
const LAB_WHITE: Xyz = xyzD65ToD50(...linearRgbToXyz(1, 1, 1));

/**
 * CIE 1976 constants, in the exact-integer form the CIE adopted in 2004.
 *
 * They are usually quoted as 0.008856 and 903.3, and those decimals leave a
 * visible discontinuity at the join between the two branches. 216/24389 and
 * 24389/27 are the values that make the curve continuous.
 */
const LAB_EPSILON = 216 / 24389;
const LAB_KAPPA = 24389 / 27;

function labF(t: number): number {
  return t > LAB_EPSILON ? Math.cbrt(t) : (LAB_KAPPA * t + 16) / 116;
}

function labFInverse(f: number): number {
  const cubed = f ** 3;
  return cubed > LAB_EPSILON ? cubed : (116 * f - 16) / LAB_KAPPA;
}

export function rgbToLab(rgb: Rgb): Lab {
  const [x, y, z] = xyzD65ToD50(
    ...linearRgbToXyz(
      srgbToLinear(clamp(rgb.r, 0, 255) / 255),
      srgbToLinear(clamp(rgb.g, 0, 255) / 255),
      srgbToLinear(clamp(rgb.b, 0, 255) / 255),
    ),
  );
  const fx = labF(x / LAB_WHITE[0]);
  const fy = labF(y / LAB_WHITE[1]);
  const fz = labF(z / LAB_WHITE[2]);
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

export function labToRgb(lab: Lab): Rgb {
  const fy = (lab.l + 16) / 116;
  const fx = lab.a / 500 + fy;
  const fz = fy - lab.b / 200;
  // Y gets the shortcut the other two axes do not: L is defined from Y
  // alone, so it inverts directly. `LAB_KAPPA * LAB_EPSILON` is exactly 8,
  // the lightness at which the curve changes branch.
  const yr = lab.l > LAB_KAPPA * LAB_EPSILON ? fy ** 3 : lab.l / LAB_KAPPA;
  const [lr, lg, lb] = xyzToLinearRgb(
    ...xyzD50ToD65(labFInverse(fx) * LAB_WHITE[0], yr * LAB_WHITE[1], labFInverse(fz) * LAB_WHITE[2]),
  );
  // Deliberately unclamped, per this file's first rule: an out-of-gamut Lab
  // value comes back as an out-of-range channel so the caller can say so.
  return { r: linearToSrgb(lr) * 255, g: linearToSrgb(lg) * 255, b: linearToSrgb(lb) * 255 };
}

/**
 * Below this chroma there is no hue to report.
 *
 * `Math.atan2` is perfectly happy to turn floating-point noise into an
 * angle: a pure grey whose `a` lands on -1e-16 comes back as hue 180,
 * which then formats as a confident `lch(53.59 0 180)`. Hue at zero chroma
 * is undefined, so this file picks 0 and states the convention rather than
 * letting a rounding artefact pick it. The thresholds are far below
 * anything an eye or an 8-bit channel can resolve.
 */
const LAB_ACHROMATIC = 1e-4;
const OKLAB_ACHROMATIC = 1e-6;

function toPolar(a: number, b: number, achromatic: number): { c: number; h: number } {
  const c = Math.hypot(a, b);
  return { c, h: c < achromatic ? 0 : normalizeHue((Math.atan2(b, a) * 180) / Math.PI) };
}

export function labToLch(lab: Lab): Lch {
  const { c, h } = toPolar(lab.a, lab.b, LAB_ACHROMATIC);
  return { l: lab.l, c, h };
}

export function lchToLab(lch: Lch): Lab {
  const radians = (normalizeHue(lch.h) * Math.PI) / 180;
  // Negative chroma is not a colour, it is the same colour half a turn
  // away; CSS clamps it to 0 and so does this.
  const c = Math.max(0, lch.c);
  return { l: lch.l, a: c * Math.cos(radians), b: c * Math.sin(radians) };
}

export function rgbToLch(rgb: Rgb): Lch {
  return labToLch(rgbToLab(rgb));
}

export function lchToRgb(lch: Lch): Rgb {
  return labToRgb(lchToLab(lch));
}

/**
 * OKLab, per Björn Ottosson's definition.
 *
 * Two matrices with a cube root between them: linear sRGB into a
 * cone-response (LMS) basis, the cube root of each of those, then a second
 * matrix into the opponent axes. The cube root is the whole trick — it is
 * what makes the space behave under interpolation, and applying the second
 * matrix to raw LMS instead produces a space that is neither OKLab nor
 * useful.
 *
 * These are Ottosson's linear-sRGB coefficients rather than the XYZ ones,
 * which is the same transform with the sRGB matrix folded in; it saves a
 * hop and, more usefully, every row sums to exactly 1, so white maps to
 * LMS (1, 1, 1) and out to `oklab(1 0 0)` with no residue at all. The
 * second matrix's rows sum to 1, 0 and 0 for the same reason.
 */
export function rgbToOklab(rgb: Rgb): Oklab {
  const r = srgbToLinear(clamp(rgb.r, 0, 255) / 255);
  const g = srgbToLinear(clamp(rgb.g, 0, 255) / 255);
  const b = srgbToLinear(clamp(rgb.b, 0, 255) / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

export function oklabToRgb(oklab: Oklab): Rgb {
  // Cubed, not cube-rooted: this is the inverse of the forward direction's
  // `Math.cbrt`. `**` on a negative base is fine here and is meant to be —
  // an out-of-gamut OKLab value has negative cone responses.
  const l = (oklab.l + 0.3963377774 * oklab.a + 0.2158037573 * oklab.b) ** 3;
  const m = (oklab.l - 0.1055613458 * oklab.a - 0.0638541728 * oklab.b) ** 3;
  const s = (oklab.l - 0.0894841775 * oklab.a - 1.291485548 * oklab.b) ** 3;
  return {
    r: linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s) * 255,
    g: linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s) * 255,
    b: linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s) * 255,
  };
}

export function oklabToOklch(oklab: Oklab): Oklch {
  const { c, h } = toPolar(oklab.a, oklab.b, OKLAB_ACHROMATIC);
  return { l: oklab.l, c, h };
}

export function oklchToOklab(oklch: Oklch): Oklab {
  const radians = (normalizeHue(oklch.h) * Math.PI) / 180;
  const c = Math.max(0, oklch.c);
  return { l: oklch.l, a: c * Math.cos(radians), b: c * Math.sin(radians) };
}

export function rgbToOklch(rgb: Rgb): Oklch {
  return oklabToOklch(rgbToOklab(rgb));
}

export function oklchToRgb(oklch: Oklch): Rgb {
  return oklabToRgb(oklchToOklab(oklch));
}

/* ---- Formatting -----------------------------------------------------
   Every formatter rounds, and rounding is the only place a value is lost.
   `translate.ts` detects that loss by parsing the formatted string back
   and comparing, so the rounding rules live here and are not duplicated
   anywhere else. -------------------------------------------------- */

function round(value: number, places = 0): number {
  const factor = 10 ** places;
  // `Math.round(-0.4)` is -0, which formats as "-0". Adding 0 normalizes it.
  return Math.round(value * factor) / factor + 0;
}

function hex2(value: number): string {
  return Math.round(clamp(value, 0, 255)).toString(16).padStart(2, '0');
}

export function formatHex(rgb: Rgb): string {
  return `#${hex2(rgb.r)}${hex2(rgb.g)}${hex2(rgb.b)}`;
}

export function formatHex8(rgba: Rgba): string {
  return `${formatHex(rgba)}${hex2(clamp(rgba.a, 0, 1) * 255)}`;
}

export function formatRgb(rgb: Rgb): string {
  return `rgb(${round(rgb.r)}, ${round(rgb.g)}, ${round(rgb.b)})`;
}

export function formatRgba(rgba: Rgba): string {
  return `rgba(${round(rgba.r)}, ${round(rgba.g)}, ${round(rgba.b)}, ${round(rgba.a, 3)})`;
}

export function formatHsl(hsl: Hsl): string {
  return `hsl(${round(hsl.h, 1)}, ${round(hsl.s, 1)}%, ${round(hsl.l, 1)}%)`;
}

export function formatHsla(hsl: Hsl, alpha: number): string {
  return `hsla(${round(hsl.h, 1)}, ${round(hsl.s, 1)}%, ${round(hsl.l, 1)}%, ${round(alpha, 3)})`;
}

export function formatHsv(hsv: Hsv): string {
  return `hsv(${round(hsv.h, 1)}, ${round(hsv.s, 1)}%, ${round(hsv.v, 1)}%)`;
}

export function formatHwb(hwb: Hwb, alpha: number): string {
  const base = `hwb(${round(hwb.h, 1)} ${round(hwb.w, 1)}% ${round(hwb.b, 1)}%`;
  return alpha >= 1 ? `${base})` : `${base} / ${round(alpha, 3)})`;
}

export function formatCmyk(cmyk: Cmyk): string {
  return `device-cmyk(${round(cmyk.c, 1)}% ${round(cmyk.m, 1)}% ${round(cmyk.y, 1)}% ${round(cmyk.k, 1)}%)`;
}

/**
 * CSS Color 4's four perceptual notations, all space-separated with alpha
 * behind a slash — `lab(54.29 80.81 69.89 / 0.5)`.
 *
 * Precision is chosen per space, and the temptation to use one number
 * everywhere is a trap: these ranges differ by two orders of magnitude.
 * A Lab axis spans about ±128 and gets two decimals; an OKLab axis spans
 * about ±0.4, so the SAME resolution needs five, and the four decimals that
 * look generous next to `hsl()`'s one are in fact six times coarser than
 * what CIELAB is getting. The cost of getting that wrong shows up on
 * saturated primaries, where a channel sits at 0 and the sRGB transfer
 * function multiplies any error there by 12.92 on the way back.
 *
 * Hue gets more places than the one HSL uses for the same reason inverted:
 * chroma multiplies it. At the edge of the sRGB gamut a Lab chroma of 130
 * turns a tenth of a degree into a fifth of a unit, where the same tenth of
 * a degree in HSL is bounded by a saturation that never exceeds 100.
 */
export function formatLab(lab: Lab, alpha: number): string {
  const base = `lab(${round(lab.l, 2)} ${round(lab.a, 2)} ${round(lab.b, 2)}`;
  return alpha >= 1 ? `${base})` : `${base} / ${round(alpha, 3)})`;
}

export function formatLch(lch: Lch, alpha: number): string {
  const base = `lch(${round(lch.l, 2)} ${round(lch.c, 2)} ${round(lch.h, 2)}`;
  return alpha >= 1 ? `${base})` : `${base} / ${round(alpha, 3)})`;
}

export function formatOklab(oklab: Oklab, alpha: number): string {
  const base = `oklab(${round(oklab.l, 5)} ${round(oklab.a, 5)} ${round(oklab.b, 5)}`;
  return alpha >= 1 ? `${base})` : `${base} / ${round(alpha, 3)})`;
}

export function formatOklch(oklch: Oklch, alpha: number): string {
  const base = `oklch(${round(oklch.l, 5)} ${round(oklch.c, 5)} ${round(oklch.h, 3)}`;
  return alpha >= 1 ? `${base})` : `${base} / ${round(alpha, 3)})`;
}

/* ---- Parsing --------------------------------------------------------
   `parseColor` is what the numeric-entry field runs on every keystroke,
   so it never throws and it reports what it had to change rather than
   silently accepting an out-of-range component. "Clipped" here means the
   user asked for something outside the range the format allows and got
   the nearest legal value — the picker warns before committing it.
   ------------------------------------------------------------------ */

export interface ParsedColor {
  rgba: Rgba;
  /** The syntax that matched, for the "you are editing sRGB" readout. */
  format:
    | 'hex'
    | 'named'
    | 'rgb'
    | 'hsl'
    | 'hsv'
    | 'hwb'
    | 'cmyk'
    | 'lab'
    | 'lch'
    | 'oklab'
    | 'oklch';
  /** Component names that were outside their legal range and got clamped. */
  clipped: string[];
}

const HEX_PATTERN = /^#?([0-9a-f]{3,8})$/i;

export function parseHex(text: string): Rgba | null {
  const match = HEX_PATTERN.exec(text.trim());
  if (!match) return null;
  // The capture group is guaranteed by a successful match, and the characters
  // below are guaranteed by the length checks. Neither is visible to the
  // compiler under checked index access, so both are stated rather than
  // asserted away — an assertion here would be a promise, and this is a parser
  // whose whole job is to distrust its input.
  const digits = match[1];
  if (digits === undefined) return null;
  const expand = (pair: string): number => parseInt(pair, 16);
  if (digits.length === 3 || digits.length === 4) {
    const [r, g, b, a] = digits.split('');
    if (r === undefined || g === undefined || b === undefined) return null;
    return {
      r: expand(`${r}${r}`),
      g: expand(`${g}${g}`),
      b: expand(`${b}${b}`),
      a: a === undefined ? 1 : expand(`${a}${a}`) / 255,
    };
  }
  if (digits.length === 6 || digits.length === 8) {
    return {
      r: expand(digits.slice(0, 2)),
      g: expand(digits.slice(2, 4)),
      b: expand(digits.slice(4, 6)),
      a: digits.length === 8 ? expand(digits.slice(6, 8)) / 255 : 1,
    };
  }
  // 5 and 7 digits are not a hex colour in any spec; refusing beats guessing.
  return null;
}

/**
 * Pull the numeric arguments out of a functional colour notation.
 *
 * Accepts both the legacy comma syntax and the modern space syntax, and
 * treats `/` as an alpha separator wherever it appears, so
 * `rgb(0 128 255 / 50%)` and `rgba(0, 128, 255, 0.5)` both come back as
 * four numbers. A percentage is returned as its number plus a flag, since
 * `50%` means 127.5 for a channel and 50 for a saturation.
 */
interface Arg {
  value: number;
  percent: boolean;
}

function parseArgs(body: string): Arg[] | null {
  const tokens = body
    .replace(/\//g, ' ')
    .split(/[\s,]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
  if (tokens.length === 0) return null;
  const args: Arg[] = [];
  for (const token of tokens) {
    const percent = token.endsWith('%');
    const numeric = percent ? token.slice(0, -1) : token;
    // Reject 'deg', 'none', 'calc(…)' and anything else rather than
    // letting Number() turn '' into 0 and produce a confident wrong colour.
    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(numeric)) return null;
    args.push({ value: Number(numeric), percent });
  }
  return args;
}

function channelOf(arg: Arg): number {
  return arg.percent ? (arg.value / 100) * 255 : arg.value;
}

function alphaOf(arg: Arg | undefined): number {
  if (!arg) return 1;
  return arg.percent ? arg.value / 100 : arg.value;
}

function noteClipped(name: string, value: number, min: number, max: number, into: string[]): number {
  if (value < min || value > max) into.push(name);
  return clamp(value, min, max);
}

/**
 * A percentage in a CSS colour function means a fraction of that
 * component's reference range, and the range differs per notation:
 * `50%` is 62.5 on a `lab()` a-axis, 0.2 on an `oklab()` one, and 50 on a
 * lightness. Passing the full-scale value in beats a `percent` boolean at
 * every call site guessing which is which.
 */
function scaledOf(arg: Arg, fullScale: number): number {
  return arg.percent ? (arg.value / 100) * fullScale : arg.value;
}

/**
 * Lab, LCH, OKLab and OKLCH can all name colours sRGB cannot display —
 * that is much of the point of them. Converting one back lands outside
 * 0–255, and the honest answer is the nearest displayable colour plus a
 * note that it moved, which is the same contract the other notations use
 * for an out-of-range component.
 *
 * The half-step of slack is not politeness, it is noise suppression: a
 * `lab(100 0 0)` white comes back through two matrices and a transfer
 * function as 255.0000000004, and warning that plain white was clipped
 * would teach the user to ignore the warning.
 */
function clipToGamut(name: string, value: number, into: string[]): number {
  if (value < -0.5 || value > 255.5) into.push(name);
  return clamp(value, 0, 255);
}

function gamutClipped(rgb: Rgb, into: string[]): Rgb {
  return {
    r: clipToGamut('r', rgb.r, into),
    g: clipToGamut('g', rgb.g, into),
    b: clipToGamut('b', rgb.b, into),
  };
}

const FUNCTION_PATTERN = /^([a-z-]+)\(([^)]*)\)$/i;

export function parseColor(input: string, names: Record<string, string>): ParsedColor | null {
  const text = input.trim();
  if (!text) return null;

  // Object.hasOwn, not a bare index. The name map is a plain object literal,
  // so it inherits Object.prototype — and typing `constructor`, `toString`,
  // `valueOf` or `__proto__` into the colour field returned an inherited
  // function, which is truthy, which then reached parseHex and threw
  // `text.trim is not a function` out of a React change handler. The entry
  // field parses on every keystroke, so this was reachable by paste, and it
  // broke this function's own documented promise never to throw.
  const key = text.toLowerCase();
  const named = Object.hasOwn(names, key) ? names[key] : undefined;
  if (named) {
    const rgba = parseHex(named);
    if (rgba) return { rgba, format: 'named', clipped: [] };
  }

  const hex = parseHex(text);
  if (hex) return { rgba: hex, format: 'hex', clipped: [] };

  const fn = FUNCTION_PATTERN.exec(text);
  if (!fn) return null;
  const rawName = fn[1];
  const rawArgs = fn[2];
  if (rawName === undefined || rawArgs === undefined) return null;
  const name = rawName.toLowerCase();
  const args = parseArgs(rawArgs);
  if (!args) return null;
  // Bind the three positional channels once. Every branch below is guarded by
  // `args.length >= 3`, which the compiler does not translate into "index 0..2
  // are present" — so bind and check here instead of repeating a cast at each
  // of the twelve use sites.
  const [arg0, arg1, arg2, arg3] = args;
  const clipped: string[] = [];
  if (arg0 === undefined || arg1 === undefined || arg2 === undefined) return null;

  if ((name === 'rgb' || name === 'rgba') && args.length >= 3) {
    const rgba: Rgba = {
      r: noteClipped('r', channelOf(arg0), 0, 255, clipped),
      g: noteClipped('g', channelOf(arg1), 0, 255, clipped),
      b: noteClipped('b', channelOf(arg2), 0, 255, clipped),
      a: noteClipped('a', alphaOf(arg3), 0, 1, clipped),
    };
    return { rgba, format: 'rgb', clipped };
  }

  if ((name === 'hsl' || name === 'hsla') && args.length >= 3) {
    const rgb = hslToRgb({
      h: arg0.value,
      s: noteClipped('s', arg1.value, 0, 100, clipped),
      l: noteClipped('l', arg2.value, 0, 100, clipped),
    });
    return {
      rgba: { ...rgb, a: noteClipped('a', alphaOf(arg3), 0, 1, clipped) },
      format: 'hsl',
      clipped,
    };
  }

  if ((name === 'hsv' || name === 'hsva' || name === 'hsb') && args.length >= 3) {
    const rgb = hsvToRgb({
      h: arg0.value,
      s: noteClipped('s', arg1.value, 0, 100, clipped),
      v: noteClipped('v', arg2.value, 0, 100, clipped),
    });
    return {
      rgba: { ...rgb, a: noteClipped('a', alphaOf(arg3), 0, 1, clipped) },
      format: 'hsv',
      clipped,
    };
  }

  if (name === 'hwb' && args.length >= 3) {
    const rgb = hwbToRgb({
      h: arg0.value,
      w: noteClipped('w', arg1.value, 0, 100, clipped),
      b: noteClipped('b', arg2.value, 0, 100, clipped),
    });
    return {
      rgba: { ...rgb, a: noteClipped('a', alphaOf(arg3), 0, 1, clipped) },
      format: 'hwb',
      clipped,
    };
  }

  // The four perceptual notations. Their percentage reference ranges are
  // CSS Color 4's, and they are not interchangeable: 100% is 125 on a
  // `lab()` a/b axis, 150 on an `lch()` chroma, and 0.4 on either OKLab
  // one. Lightness is clamped because CSS clamps it; a and b are not,
  // because a Lab value outside the sRGB gamut is legal input and gets
  // reported through `clipped` after conversion rather than refused here.
  if (name === 'lab' && args.length >= 3) {
    const rgb = labToRgb({
      l: noteClipped('l', scaledOf(arg0, 100), 0, 100, clipped),
      a: scaledOf(arg1, 125),
      b: scaledOf(arg2, 125),
    });
    return {
      rgba: { ...gamutClipped(rgb, clipped), a: noteClipped('a', alphaOf(arg3), 0, 1, clipped) },
      format: 'lab',
      clipped,
    };
  }

  if (name === 'lch' && args.length >= 3) {
    const rgb = lchToRgb({
      l: noteClipped('l', scaledOf(arg0, 100), 0, 100, clipped),
      c: noteClipped('c', scaledOf(arg1, 150), 0, Number.POSITIVE_INFINITY, clipped),
      h: arg2.value,
    });
    return {
      rgba: { ...gamutClipped(rgb, clipped), a: noteClipped('a', alphaOf(arg3), 0, 1, clipped) },
      format: 'lch',
      clipped,
    };
  }

  if (name === 'oklab' && args.length >= 3) {
    const rgb = oklabToRgb({
      l: noteClipped('l', scaledOf(arg0, 1), 0, 1, clipped),
      a: scaledOf(arg1, 0.4),
      b: scaledOf(arg2, 0.4),
    });
    return {
      rgba: { ...gamutClipped(rgb, clipped), a: noteClipped('a', alphaOf(arg3), 0, 1, clipped) },
      format: 'oklab',
      clipped,
    };
  }

  if (name === 'oklch' && args.length >= 3) {
    const rgb = oklchToRgb({
      l: noteClipped('l', scaledOf(arg0, 1), 0, 1, clipped),
      c: noteClipped('c', scaledOf(arg1, 0.4), 0, Number.POSITIVE_INFINITY, clipped),
      h: arg2.value,
    });
    return {
      rgba: { ...gamutClipped(rgb, clipped), a: noteClipped('a', alphaOf(arg3), 0, 1, clipped) },
      format: 'oklch',
      clipped,
    };
  }

  if ((name === 'cmyk' || name === 'device-cmyk') && args.length >= 4) {
    // This is the one notation needing a fourth channel, so it carries its own
    // guard rather than widening the shared one above and letting the
    // three-channel notations through with a missing argument.
    if (arg3 === undefined) return null;
    const rgb = cmykToRgb({
      c: noteClipped('c', arg0.value, 0, 100, clipped),
      m: noteClipped('m', arg1.value, 0, 100, clipped),
      y: noteClipped('y', arg2.value, 0, 100, clipped),
      k: noteClipped('k', arg3.value, 0, 100, clipped),
    });
    return {
      rgba: { ...rgb, a: noteClipped('a', alphaOf(args[4]), 0, 1, clipped) },
      format: 'cmyk',
      clipped,
    };
  }

  return null;
}

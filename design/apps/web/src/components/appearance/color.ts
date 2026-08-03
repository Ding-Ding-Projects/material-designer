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
  format: 'hex' | 'named' | 'rgb' | 'hsl' | 'hsv' | 'hwb' | 'cmyk';
  /** Component names that were outside their legal range and got clamped. */
  clipped: string[];
}

const HEX_PATTERN = /^#?([0-9a-f]{3,8})$/i;

export function parseHex(text: string): Rgba | null {
  const match = HEX_PATTERN.exec(text.trim());
  if (!match) return null;
  const digits = match[1];
  const expand = (pair: string): number => parseInt(pair, 16);
  if (digits.length === 3 || digits.length === 4) {
    const [r, g, b, a] = digits.split('');
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

const FUNCTION_PATTERN = /^([a-z-]+)\(([^)]*)\)$/i;

export function parseColor(input: string, names: Record<string, string>): ParsedColor | null {
  const text = input.trim();
  if (!text) return null;

  const named = names[text.toLowerCase()];
  if (named) {
    const rgba = parseHex(named);
    if (rgba) return { rgba, format: 'named', clipped: [] };
  }

  const hex = parseHex(text);
  if (hex) return { rgba: hex, format: 'hex', clipped: [] };

  const fn = FUNCTION_PATTERN.exec(text);
  if (!fn) return null;
  const name = fn[1].toLowerCase();
  const args = parseArgs(fn[2]);
  if (!args) return null;
  const clipped: string[] = [];

  if ((name === 'rgb' || name === 'rgba') && args.length >= 3) {
    const rgba: Rgba = {
      r: noteClipped('r', channelOf(args[0]), 0, 255, clipped),
      g: noteClipped('g', channelOf(args[1]), 0, 255, clipped),
      b: noteClipped('b', channelOf(args[2]), 0, 255, clipped),
      a: noteClipped('a', alphaOf(args[3]), 0, 1, clipped),
    };
    return { rgba, format: 'rgb', clipped };
  }

  if ((name === 'hsl' || name === 'hsla') && args.length >= 3) {
    const rgb = hslToRgb({
      h: args[0].value,
      s: noteClipped('s', args[1].value, 0, 100, clipped),
      l: noteClipped('l', args[2].value, 0, 100, clipped),
    });
    return {
      rgba: { ...rgb, a: noteClipped('a', alphaOf(args[3]), 0, 1, clipped) },
      format: 'hsl',
      clipped,
    };
  }

  if ((name === 'hsv' || name === 'hsva' || name === 'hsb') && args.length >= 3) {
    const rgb = hsvToRgb({
      h: args[0].value,
      s: noteClipped('s', args[1].value, 0, 100, clipped),
      v: noteClipped('v', args[2].value, 0, 100, clipped),
    });
    return {
      rgba: { ...rgb, a: noteClipped('a', alphaOf(args[3]), 0, 1, clipped) },
      format: 'hsv',
      clipped,
    };
  }

  if (name === 'hwb' && args.length >= 3) {
    const rgb = hwbToRgb({
      h: args[0].value,
      w: noteClipped('w', args[1].value, 0, 100, clipped),
      b: noteClipped('b', args[2].value, 0, 100, clipped),
    });
    return {
      rgba: { ...rgb, a: noteClipped('a', alphaOf(args[3]), 0, 1, clipped) },
      format: 'hwb',
      clipped,
    };
  }

  if ((name === 'cmyk' || name === 'device-cmyk') && args.length >= 4) {
    const rgb = cmykToRgb({
      c: noteClipped('c', args[0].value, 0, 100, clipped),
      m: noteClipped('m', args[1].value, 0, 100, clipped),
      y: noteClipped('y', args[2].value, 0, 100, clipped),
      k: noteClipped('k', args[3].value, 0, 100, clipped),
    });
    return {
      rgba: { ...rgb, a: noteClipped('a', alphaOf(args[4]), 0, 1, clipped) },
      format: 'cmyk',
      clipped,
    };
  }

  return null;
}

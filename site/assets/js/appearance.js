/*
 * appearance.js — Material Designer site
 * ---------------------------------------------------------------------------
 * Persisted, live appearance customization for the site:
 *
 *   • theme    — light / dark / system (system follows prefers-color-scheme)
 *   • density  — compact / default / comfortable  (drives --gap/--pad/--row/--card)
 *   • seed     — sunset / violet / teal / lime, PLUS any arbitrary colour
 *   • uiScale  — 50%–200% in steps of 5, published as the --ui-scale token
 *
 * Plus a colour translator that shows the current colour simultaneously as
 * HEX / RGB / HSL / HSV, each copyable, with a WCAG contrast readout against
 * the current surface colour.
 *
 * Design notes
 * ------------
 * 1. This module has NO imports. It is deliberately dependency-free so it can
 *    be loaded first, in <head>, and apply the stored appearance at import time
 *    — i.e. before first paint — so the page never flashes the wrong theme.
 *    Wiring to i18n.js and to the toast system is done by injection
 *    (setTranslator / setNotifier) plus DOM CustomEvents, never by import, so
 *    load order can never break appearance restoration.
 *
 * 2. An ARBITRARY seed colour has to actually work, not just tint one button.
 *    The four named seeds are defined in tokens.css via [data-seed="…"]. For a
 *    custom colour we set data-seed="custom" and write the same handful of
 *    dependent colour roles as inline custom properties on <html>, derived from
 *    the chosen colour with CSS color-mix() in the oklab space. Inline styles
 *    beat any stylesheet rule, so the custom seed correctly overrides both the
 *    light and the dark blocks; we recompute on every theme change so the dark
 *    tones are genuinely dark tones and not just the light ones re-used.
 *
 * 3. The mix percentages are not guessed. Mixing toward black/white in oklab
 *    interpolates oklab L linearly, and for a neutral grey the oklab L of a
 *    colour whose CIELAB tone is T is exactly (T + 16) / 116 — the same cube
 *    root appears in both formulae. So we can hit an M3 tone (40 / 80 / 90 /
 *    30 / 10 / 20) precisely by solving for the mix percentage. The identical
 *    arithmetic is mirrored in JS so the module can report the resulting colour
 *    and fall back to plain hex where color-mix() is unsupported.
 *
 * Storage: every preference lives under the "md-designer:appearance." prefix.
 */

/* ===========================================================================
 * 0. Constants
 * ======================================================================== */

/** Prefix for every localStorage key this module owns. */
export const STORAGE_PREFIX = 'md-designer:appearance.';

/** Event dispatched on `document` whenever appearance state changes. */
export const CHANGE_EVENT = 'md-appearance-change';

/** Event this module dispatches to ask a toast system to show a message. */
export const TOAST_EVENT = 'md-toast';

/** Event this module listens for so it can re-label itself on language change. */
export const LANGUAGE_EVENT = 'md-language-change';

/**
 * The four named seeds from the project's M3 token contract.
 * `swatch` is the RAW seed input shown as the chip in Settings — deliberately
 * not the same as the generated `--md-sys-color-primary` for that seed (sunset
 * is seeded from #C96442 but generates #8F4C34 as its light primary).
 */
export const NAMED_SEEDS = Object.freeze([
  { id: 'sunset', labelKey: 'appearance.seed.sunset', labelEn: 'Sunset', swatch: '#C96442' },
  { id: 'violet', labelKey: 'appearance.seed.violet', labelEn: 'Violet', swatch: '#65558F' },
  { id: 'teal', labelKey: 'appearance.seed.teal', labelEn: 'Teal', swatch: '#00696D' },
  { id: 'lime', labelKey: 'appearance.seed.lime', labelEn: 'Lime', swatch: '#4C6700' },
]);

export const THEMES = Object.freeze([
  { id: 'light', labelKey: 'appearance.theme.light', labelEn: 'Light' },
  { id: 'dark', labelKey: 'appearance.theme.dark', labelEn: 'Dark' },
  { id: 'system', labelKey: 'appearance.theme.system', labelEn: 'System' },
]);

export const DENSITIES = Object.freeze([
  { id: 'compact', labelKey: 'appearance.density.compact', labelEn: 'Compact' },
  { id: 'default', labelKey: 'appearance.density.default', labelEn: 'Default' },
  { id: 'comfortable', labelKey: 'appearance.density.comfortable', labelEn: 'Comfortable' },
]);

/** UI scale bounds, mirroring the mockup's props schema exactly. */
export const SCALE = Object.freeze({ min: 50, max: 200, step: 5, unit: '%' });

/** Factory defaults. `reset()` returns to exactly this. */
export const DEFAULTS = Object.freeze({
  theme: 'system',
  density: 'default',
  seed: 'sunset',
  customSeed: '#C96442',
  scale: 100,
});

/**
 * The colour roles a custom seed overrides. Each entry says which M3 tone the
 * role takes in light and in dark, and which of the three derived source hues
 * (primary / secondary / tertiary) it is built from. `null` means "leave the
 * stylesheet's value alone in this theme".
 *
 * These are the same roles the named seeds override in tokens.css, so a custom
 * seed and a named seed change exactly the same surface area of the design.
 */
const CUSTOM_SEED_ROLES = Object.freeze([
  { role: 'primary', src: 'p', light: 40, dark: 80 },
  { role: 'on-primary', src: 'p', light: 100, dark: 20 },
  { role: 'primary-container', src: 'p', light: 90, dark: 30 },
  { role: 'on-primary-container', src: 'p', light: 10, dark: 90 },
  { role: 'secondary', src: 's', light: 40, dark: 80 },
  { role: 'on-secondary', src: 's', light: 100, dark: 20 },
  { role: 'secondary-container', src: 's', light: 90, dark: 30 },
  { role: 'on-secondary-container', src: 's', light: 10, dark: 90 },
  { role: 'tertiary', src: 't', light: 40, dark: 80 },
  { role: 'on-tertiary', src: 't', light: 100, dark: 20 },
  { role: 'tertiary-container', src: 't', light: 90, dark: 30 },
  { role: 'on-tertiary-container', src: 't', light: 10, dark: 90 },
  // inverse-primary is the primary of the OPPOSITE theme, by definition.
  { role: 'inverse-primary', src: 'p', light: 80, dark: 40 },
]);

/* ===========================================================================
 * 1. Colour mathematics
 *
 * Everything here is pure: hex string in, numbers out. Written out longhand
 * rather than pulled from a library because the site ships no dependencies,
 * and checked against known values (see the notes beside each conversion).
 * ======================================================================== */

const clamp = (n, lo, hi) => (n < lo ? lo : n > hi ? hi : n);

/**
 * Parse a hex colour into {r,g,b} with channels in 0..255.
 * Accepts #RGB, #RRGGBB, and the same without the leading '#'.
 * Returns null for anything else — callers must handle null rather than
 * silently substituting a colour the user did not choose.
 */
export function parseHex(input) {
  if (typeof input !== 'string') return null;
  let hex = input.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
  const n = parseInt(hex, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** Format {r,g,b} (0..255, may be fractional) as an uppercase #RRGGBB string. */
export function toHex({ r, g, b }) {
  const c = (v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0').toUpperCase();
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** sRGB channel (0..1) → linear-light. IEC 61966-2-1 transfer function. */
const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

/** Linear-light → sRGB channel (0..1). Inverse of the above. */
const linearToSrgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

/**
 * sRGB (0..255) → OKLab. Björn Ottosson's matrices.
 * Sanity check: #FFFFFF → L = 1, a = b = 0; #000000 → L = a = b = 0.
 */
export function rgbToOklab({ r, g, b }) {
  const lr = srgbToLinear(r / 255);
  const lg = srgbToLinear(g / 255);
  const lb = srgbToLinear(b / 255);

  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  return {
    L: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  };
}

/** OKLab → sRGB (0..255), *unclamped* so callers can test for gamut escape. */
function oklabToRgbRaw({ L, a, b }) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  return {
    r: 255 * linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: 255 * linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: 255 * linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  };
}

const IN_GAMUT_EPS = 0.5 / 255; // half a quantisation step of tolerance

const isInGamut = ({ r, g, b }) =>
  r >= -0.5 && r <= 255.5 && g >= -0.5 && g <= 255.5 && b >= -0.5 && b <= 255.5;

/**
 * OKLab → sRGB, gamut-mapped by reducing chroma (a/b) while holding lightness
 * and hue. Straight clamping would shift the hue of a saturated colour, which
 * is exactly the failure that makes an arbitrary seed look wrong; binary
 * searching the chroma keeps the hue the user picked.
 */
export function oklabToRgb(lab) {
  const direct = oklabToRgbRaw(lab);
  if (isInGamut(direct)) {
    return { r: clamp(direct.r, 0, 255), g: clamp(direct.g, 0, 255), b: clamp(direct.b, 0, 255) };
  }
  // Lightness outside [0,1] cannot be fixed by chroma reduction.
  const L = clamp(lab.L, 0, 1);
  let lo = 0;
  let hi = 1;
  let best = { r: 0, g: 0, b: 0 };
  for (let i = 0; i < 24 && hi - lo > IN_GAMUT_EPS; i += 1) {
    const mid = (lo + hi) / 2;
    const candidate = oklabToRgbRaw({ L, a: lab.a * mid, b: lab.b * mid });
    if (isInGamut(candidate)) {
      best = candidate;
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return { r: clamp(best.r, 0, 255), g: clamp(best.g, 0, 255), b: clamp(best.b, 0, 255) };
}

/**
 * The OKLab lightness that corresponds to Material's tone T (0..100).
 *
 * Material tone is CIELAB L*. For a neutral grey with linear luminance Y:
 *     L* = 116 · cbrt(Y) − 16                (CIELAB, above the linear knee)
 * and OKLab's L collapses to cbrt(Y) too, because its three coefficients
 * (0.2104542553 + 0.7936177850 − 0.0040720468) sum to 1 and l = m = s = Y for
 * a grey. Solving the first for cbrt(Y) gives:
 *     okL = (T + 16) / 116
 * Check: T=100 → 1.0 exactly (white); T=0 → 0.138, the CIELAB/OKLab
 * disagreement at the very bottom, which is why no role uses tone 0.
 */
const toneToOkL = (tone) => (tone + 16) / 116;

/**
 * Work out how to reach a target tone from a base colour by mixing it with
 * black or white in oklab — the operation CSS color-mix(in oklab, …) performs.
 *
 * Mixing colour X with black at fraction p gives L = L₀·(1 − p), so to land on
 * Lt we need p = 1 − Lt/L₀. Mixing with white (L = 1, a = b = 0) at fraction p
 * gives L = L₀ + p·(1 − L₀), so p = (Lt − L₀)/(1 − L₀).
 *
 * @returns {{ mixWith: '#000000'|'#FFFFFF', percent: number, rgb: {r,g,b} }}
 */
function toneMix(baseRgb, tone) {
  const base = rgbToOklab(baseRgb);
  const target = toneToOkL(tone);
  let mixWith;
  let p;

  if (Math.abs(target - base.L) < 1e-4) {
    mixWith = '#000000';
    p = 0;
  } else if (target < base.L) {
    mixWith = '#000000';
    p = base.L <= 1e-6 ? 0 : 1 - target / base.L;
  } else {
    mixWith = '#FFFFFF';
    p = base.L >= 1 - 1e-6 ? 0 : (target - base.L) / (1 - base.L);
  }
  p = clamp(p, 0, 1);

  // Mirror the browser's arithmetic so we can report/fall back to a real hex.
  const other = mixWith === '#000000' ? { L: 0, a: 0, b: 0 } : { L: 1, a: 0, b: 0 };
  const mixed = {
    L: base.L * (1 - p) + other.L * p,
    a: base.a * (1 - p) + other.a * p,
    b: base.b * (1 - p) + other.b * p,
  };

  return { mixWith, percent: p * 100, rgb: oklabToRgb(mixed) };
}

/**
 * Rotate hue and scale chroma of an sRGB colour, in OKLCh.
 * Used to derive the secondary (same hue, much less chroma) and tertiary
 * (hue + 60°, slightly less chroma) source colours from the one seed the user
 * picked — the same relationship Material's own scheme generation uses.
 */
function adjustOklch(rgb, { hueShiftDeg = 0, chromaScale = 1 } = {}) {
  const { L, a, b } = rgbToOklab(rgb);
  const chroma = Math.hypot(a, b) * chromaScale;
  const hue = Math.atan2(b, a) + (hueShiftDeg * Math.PI) / 180;
  return oklabToRgb({ L, a: Math.cos(hue) * chroma, b: Math.sin(hue) * chroma });
}

/** {r,g,b} 0..255 → {h: 0..360, s: 0..100, l: 0..100}. */
export function rgbToHsl({ r, g, b }) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  const l = (max + min) / 2;

  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: s * 100, l: l * 100 };
}

/** {r,g,b} 0..255 → {h: 0..360, s: 0..100, v: 0..100}. */
export function rgbToHsv({ r, g, b }) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;

  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return { h, s: s * 100, v: max * 100 };
}

/** WCAG 2.x relative luminance of an sRGB colour. */
export function relativeLuminance({ r, g, b }) {
  return (
    0.2126 * srgbToLinear(r / 255) +
    0.7152 * srgbToLinear(g / 255) +
    0.0722 * srgbToLinear(b / 255)
  );
}

/** WCAG contrast ratio between two sRGB colours: 1 (identical) … 21 (b/w). */
export function contrastRatio(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const light = Math.max(la, lb);
  const dark = Math.min(la, lb);
  return (light + 0.05) / (dark + 0.05);
}

/**
 * WCAG rating for a contrast ratio, as a stable id plus English fallback text.
 * Thresholds are the normative ones: 7 AAA, 4.5 AA, 3 AA for large text.
 */
export function contrastRating(ratio) {
  if (ratio >= 7) return { id: 'aaa', en: 'AAA' };
  if (ratio >= 4.5) return { id: 'aa', en: 'AA' };
  if (ratio >= 3) return { id: 'aa-large', en: 'AA (large text only)' };
  return { id: 'fail', en: 'Fails WCAG' };
}

/* ===========================================================================
 * 2. Resolving colours that are already on the page
 * ======================================================================== */

let colourProbe = null;
let canvasProbe = null;

/** Pull the numeric arguments out of a `fn(a b c / d)` or `fn(a, b, c)` form. */
function colorArgs(str, name) {
  const m = str.match(new RegExp(`^${name}\\(([^)]*)\\)$`, 'i'));
  if (!m) return null;
  return m[1]
    .replace(/\//g, ' ')
    .split(/[\s,]+/)
    .filter(Boolean);
}

/** "50%" → 0.5 · scale; "0.1" → 0.1. `none` (a valid CSS keyword) → 0. */
function num(token, percentScale = 1) {
  if (token == null || token === 'none') return 0;
  const value = parseFloat(token);
  if (!Number.isFinite(value)) return 0;
  return token.endsWith('%') ? (value / 100) * percentScale : value;
}

/**
 * Parse a *computed* CSS colour string into {r,g,b}.
 *
 * Browsers do not serialize a resolved color-mix() back to rgb(): Chrome,
 * Safari and Firefox all return `oklab(L a b)` for a mix performed in oklab.
 * An rgb()-only reader therefore fails on exactly the colours this module
 * generates, which is why every form we can actually meet is handled here.
 */
export function parseColorString(input) {
  if (typeof input !== 'string') return null;
  const str = input.trim();
  if (!str) return null;

  const hex = parseHex(str);
  if (hex) return hex;

  const rgbArgs = colorArgs(str, 'rgba?');
  if (rgbArgs && rgbArgs.length >= 3) {
    return {
      r: clamp(num(rgbArgs[0], 255), 0, 255),
      g: clamp(num(rgbArgs[1], 255), 0, 255),
      b: clamp(num(rgbArgs[2], 255), 0, 255),
    };
  }

  const okLabArgs = colorArgs(str, 'oklab');
  if (okLabArgs && okLabArgs.length >= 3) {
    return oklabToRgb({
      L: num(okLabArgs[0], 1),
      a: num(okLabArgs[1], 0.4), // 100% of the a/b axes is 0.4 per CSS Color 4
      b: num(okLabArgs[2], 0.4),
    });
  }

  const okLchArgs = colorArgs(str, 'oklch');
  if (okLchArgs && okLchArgs.length >= 3) {
    const L = num(okLchArgs[0], 1);
    const C = num(okLchArgs[1], 0.4);
    const h = (num(okLchArgs[2]) * Math.PI) / 180;
    return oklabToRgb({ L, a: Math.cos(h) * C, b: Math.sin(h) * C });
  }

  const colorFn = colorArgs(str, 'color');
  if (colorFn && colorFn.length >= 4) {
    const [space, ...channels] = colorFn;
    const c = channels.slice(0, 3).map((token) => num(token, 1));
    if (/^srgb$/i.test(space)) {
      return { r: clamp(c[0] * 255, 0, 255), g: clamp(c[1] * 255, 0, 255), b: clamp(c[2] * 255, 0, 255) };
    }
    if (/^srgb-linear$/i.test(space)) {
      return {
        r: clamp(linearToSrgb(c[0]) * 255, 0, 255),
        g: clamp(linearToSrgb(c[1]) * 255, 0, 255),
        b: clamp(linearToSrgb(c[2]) * 255, 0, 255),
      };
    }
  }

  return null;
}

/**
 * Last-resort resolution for a colour space we do not parse by hand (lab, lch,
 * display-p3…): let a 1×1 canvas rasterise it and read the pixel back.
 */
function rasterizeColor(value) {
  try {
    if (!canvasProbe) {
      canvasProbe = document.createElement('canvas');
      canvasProbe.width = 1;
      canvasProbe.height = 1;
    }
    const ctx = canvasProbe.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#000000';
    ctx.fillStyle = value; // an unparseable value leaves the sentinel in place
    if (ctx.fillStyle === '#000000' && !/^#0{3,8}$|black/i.test(value)) return null;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return { r, g, b };
  } catch {
    return null;
  }
}

/**
 * Resolve ANY CSS colour string (hex, rgb(), oklab(), color-mix(), a token's
 * computed value…) to {r,g,b} by letting the browser resolve it and then
 * parsing whatever serialization it hands back. Returns null if the string is
 * not a colour the browser understands.
 */
export function resolveCssColor(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const direct = parseHex(value);
  if (direct) return direct;

  if (!colourProbe || !colourProbe.isConnected) {
    colourProbe = document.createElement('span');
    colourProbe.setAttribute('aria-hidden', 'true');
    colourProbe.style.cssText =
      'position:absolute;width:0;height:0;overflow:hidden;visibility:hidden;pointer-events:none;';
    (document.body || document.documentElement).appendChild(colourProbe);
  }

  // Assigning an invalid value to a CSSStyleDeclaration is a no-op, so an empty
  // specified value afterwards means the browser rejected it. Testing the
  // SPECIFIED value rather than a sentinel colour avoids a false negative when
  // a legitimate colour happens to equal whatever sentinel we picked.
  colourProbe.style.color = '';
  colourProbe.style.color = value.trim();
  if (colourProbe.style.color === '') return null;

  const computed = getComputedStyle(colourProbe).color;
  const parsed = parseColorString(computed);
  if (parsed) return parsed;
  // A colour space we do not decode by hand — rasterise it instead.
  return rasterizeColor(computed) || rasterizeColor(value.trim());
}

/** Read an M3 colour role off <html> and resolve it to {r,g,b}. */
export function readColorRole(role, fallback = null) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(`--md-sys-color-${role}`);
  return resolveCssColor(raw) || fallback;
}

/* ===========================================================================
 * 3. State + persistence
 * ======================================================================== */

const store = {
  get(key) {
    try {
      return window.localStorage.getItem(STORAGE_PREFIX + key);
    } catch {
      // Private mode / disabled storage: appearance still works, just per-session.
      return null;
    }
  },
  set(key, value) {
    try {
      window.localStorage.setItem(STORAGE_PREFIX + key, value);
    } catch {
      /* ignore — a failed preference write must never break the page */
    }
  },
  remove(key) {
    try {
      window.localStorage.removeItem(STORAGE_PREFIX + key);
    } catch {
      /* ignore */
    }
  },
};

const isOneOf = (value, list) => list.some((entry) => entry.id === value);

/** Read persisted state, discarding anything that is not a value we recognise. */
function loadState() {
  const theme = store.get('theme');
  const density = store.get('density');
  const seed = store.get('seed');
  const customSeed = store.get('customSeed');
  const scaleRaw = Number.parseInt(store.get('scale') ?? '', 10);

  return {
    theme: isOneOf(theme, THEMES) ? theme : DEFAULTS.theme,
    density: isOneOf(density, DENSITIES) ? density : DEFAULTS.density,
    seed: seed === 'custom' || isOneOf(seed, NAMED_SEEDS) ? seed : DEFAULTS.seed,
    customSeed: parseHex(customSeed) ? toHex(parseHex(customSeed)) : DEFAULTS.customSeed,
    scale: Number.isFinite(scaleRaw)
      ? clamp(Math.round(scaleRaw / SCALE.step) * SCALE.step, SCALE.min, SCALE.max)
      : DEFAULTS.scale,
  };
}

let state = loadState();

const listeners = new Set();

/** Subscribe to appearance changes. Returns an unsubscribe function. */
export function subscribe(fn) {
  if (typeof fn !== 'function') return () => {};
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(changed) {
  const snapshot = getState();
  listeners.forEach((fn) => {
    try {
      fn(snapshot, changed);
    } catch (error) {
      console.error('[appearance] subscriber failed', error);
    }
  });
  document.dispatchEvent(
    new CustomEvent(CHANGE_EVENT, { detail: { state: snapshot, changed }, bubbles: true }),
  );
}

/** Current appearance state, including the resolved theme for 'system'. */
export function getState() {
  return { ...state, resolvedTheme: resolveTheme(state.theme), seedColor: currentSeedColor() };
}

/** The hex colour the seed controls are currently showing. */
function currentSeedColor() {
  if (state.seed === 'custom') return state.customSeed;
  const named = NAMED_SEEDS.find((s) => s.id === state.seed);
  return named ? named.swatch : DEFAULTS.customSeed;
}

/* ===========================================================================
 * 4. Applying state to the document
 * ======================================================================== */

const systemDark =
  typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;

function resolveTheme(theme) {
  if (theme === 'light' || theme === 'dark') return theme;
  return systemDark && systemDark.matches ? 'dark' : 'light';
}

/** True when the browser can evaluate color-mix() — all current ones can. */
const supportsColorMix =
  typeof CSS !== 'undefined' &&
  typeof CSS.supports === 'function' &&
  CSS.supports('color', 'color-mix(in oklab, #000000, #ffffff 50%)');

/**
 * Compute the custom-seed role overrides for one theme.
 * Returns [[propertyName, cssValue, resolvedHex], …].
 */
export function deriveSeedRoles(seedHex, theme) {
  const seed = parseHex(seedHex);
  if (!seed) return [];

  const sources = {
    p: seed,
    // Secondary: same hue, heavily muted — Material's secondary is a low-chroma
    // companion, not a second accent competing with primary.
    s: adjustOklch(seed, { chromaScale: 0.34 }),
    // Tertiary: rotated 60° for a genuinely different accent, slightly muted.
    t: adjustOklch(seed, { hueShiftDeg: 60, chromaScale: 0.72 }),
  };

  const isDark = theme === 'dark';
  return CUSTOM_SEED_ROLES.map(({ role, src, light, dark }) => {
    const tone = isDark ? dark : light;
    const { mixWith, percent, rgb } = toneMix(sources[src], tone);
    const hex = toHex(rgb);
    const value =
      supportsColorMix && percent > 0.001
        ? `color-mix(in oklab, ${toHex(sources[src])}, ${mixWith} ${percent.toFixed(3)}%)`
        : hex;
    return [`--md-sys-color-${role}`, value, hex];
  });
}

/** Write (or clear) the inline custom-seed properties on <html>. */
function applySeed(root) {
  const previous = root.dataset.seed;
  if (state.seed === 'custom') {
    root.dataset.seed = 'custom';
    deriveSeedRoles(state.customSeed, resolveTheme(state.theme)).forEach(([prop, value]) => {
      root.style.setProperty(prop, value);
    });
  } else {
    root.dataset.seed = state.seed;
    if (previous === 'custom') {
      CUSTOM_SEED_ROLES.forEach(({ role }) => root.style.removeProperty(`--md-sys-color-${role}`));
    }
  }
}

/**
 * Apply the whole of `state` to the document. Safe to call before <body>
 * exists, which is what makes the pre-paint restore possible.
 */
export function apply() {
  const root = document.documentElement;
  const resolved = resolveTheme(state.theme);

  root.dataset.theme = resolved;
  root.dataset.themePreference = state.theme; // so 'system' is still inspectable
  root.dataset.density = state.density;
  root.style.setProperty('--ui-scale', String(state.scale / 100));
  root.style.colorScheme = resolved; // native form controls + scrollbars follow

  applySeed(root);
}

/* ---------------------------------------------------------------------------
 * UI-scale safety net.
 *
 * --ui-scale is meant to be consumed by tokens.css (typically as a root
 * font-size multiplier). If no stylesheet on the page actually reads it, the
 * slider would look like a working control while doing nothing — which the
 * project's rules treat as a defect, not a nicety. So: after stylesheets have
 * parsed, check whether anything references var(--ui-scale); if nothing does,
 * install a minimal rule ourselves. When tokens.css does its job, we stay out
 * of the way entirely and no double-scaling can occur.
 * ------------------------------------------------------------------------ */

function stylesheetReferencesUiScale() {
  for (const sheet of Array.from(document.styleSheets)) {
    const owner = sheet.ownerNode;
    if (owner && owner.dataset && owner.dataset.appearanceScaleFallback !== undefined) continue;
    let rules;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // opaque sheet; nothing we ship should hit this
    }
    if (!rules) continue;
    try {
      // Only top-level rules are walked, and deliberately so: a grouping rule's
      // cssText already serializes its children, so @media/@supports/@layer
      // content is covered without recursing. Recursing would in fact be wrong
      // on current browsers — CSS Nesting made every CSSStyleRule a grouping
      // rule, so `rule.cssRules` is a truthy EMPTY list on ordinary rules and a
      // naive recursion skips their text entirely.
      for (const rule of rules) {
        if (rule.cssText && rule.cssText.includes('var(--ui-scale')) return true;
      }
    } catch {
      /* ignore malformed rule lists */
    }
  }
  return false;
}

const SCALE_FALLBACK_SELECTOR = 'style[data-appearance-scale-fallback]';

/**
 * Guarantee the UI-scale slider has a visible effect.
 *
 * --ui-scale is meant to be consumed by tokens.css. If nothing on the page
 * reads it, install a minimal rule so the slider is a working control rather
 * than a decorative one; if a real consumer shows up later (a stylesheet that
 * had not finished parsing), take our rule back out so nothing is applied twice.
 */
function ensureUiScaleIsLive() {
  const existing = document.querySelector(SCALE_FALLBACK_SELECTOR);
  if (stylesheetReferencesUiScale()) {
    if (existing) existing.remove();
    return;
  }
  if (existing) return;

  const style = document.createElement('style');
  style.dataset.appearanceScaleFallback = '';
  style.textContent =
    '/* Fallback: no stylesheet consumed --ui-scale, so the slider gets its effect here. */\n' +
    'html { font-size: calc(100% * var(--ui-scale, 1)); }\n';
  document.head.appendChild(style);
}

/* ===========================================================================
 * 5. Mutations
 * ======================================================================== */

function commit(key, value, storageValue = String(value)) {
  if (state[key] === value) return false;
  state = { ...state, [key]: value };
  store.set(key, storageValue);
  apply();
  emit(key);
  return true;
}

export function setTheme(theme) {
  if (!isOneOf(theme, THEMES)) return false;
  return commit('theme', theme);
}

export function setDensity(density) {
  if (!isOneOf(density, DENSITIES)) return false;
  return commit('density', density);
}

/** Select one of the named seeds. */
export function setSeed(seed) {
  if (seed !== 'custom' && !isOneOf(seed, NAMED_SEEDS)) return false;
  return commit('seed', seed);
}

/**
 * Set an arbitrary seed colour. Switches the seed to 'custom'.
 * Returns the normalised hex, or null if the input was not a colour — callers
 * must surface that rather than quietly keeping the old value.
 */
export function setCustomSeed(hexish) {
  const parsed = parseHex(hexish);
  if (!parsed) return null;
  const hex = toHex(parsed);
  const changedColor = state.customSeed !== hex;
  const changedMode = state.seed !== 'custom';
  if (!changedColor && !changedMode) return hex;

  state = { ...state, customSeed: hex, seed: 'custom' };
  store.set('customSeed', hex);
  store.set('seed', 'custom');
  apply();
  emit('seed');
  return hex;
}

export function setScale(percent) {
  const n = Number(percent);
  if (!Number.isFinite(n)) return false;
  const snapped = clamp(Math.round(n / SCALE.step) * SCALE.step, SCALE.min, SCALE.max);
  return commit('scale', snapped);
}

/** Reset one property to its factory default. */
export function resetProperty(key) {
  if (!(key in DEFAULTS)) return false;
  if (key === 'seed') {
    state = { ...state, seed: DEFAULTS.seed, customSeed: DEFAULTS.customSeed };
    store.remove('seed');
    store.remove('customSeed');
  } else {
    state = { ...state, [key]: DEFAULTS[key] };
    store.remove(key);
  }
  apply();
  emit(key);
  return true;
}

/** Reset every appearance property. */
export function reset() {
  state = { ...DEFAULTS };
  Object.keys(DEFAULTS).forEach((key) => store.remove(key));
  apply();
  emit('all');
  return true;
}

/* ===========================================================================
 * 6. Early boot — runs at import time, before first paint
 * ======================================================================== */

apply();

/**
 * A classic-JS snippet for index.html to inline in <head>, ABOVE the
 * stylesheets, as `<script>…</script>` (not a module).
 *
 * Module scripts are deferred, so they run after the document has parsed. That
 * is normally still before first paint, but on a slow or long document it need
 * not be — and the failure mode is the one thing a theme control must never do:
 * flash the wrong theme. This snippet is deliberately tiny and duplicates only
 * the cheap attribute writes; the full module takes over moments later and
 * fills in a custom seed's derived roles.
 *
 * It is exported as a string so the markup and this module cannot drift apart:
 * the storage prefix and the defaults are interpolated from the values above.
 */
export const EARLY_BOOT_SNIPPET = `(function(){try{
var P=${JSON.stringify(STORAGE_PREFIX)},d=document.documentElement,g=function(k){try{return localStorage.getItem(P+k)}catch(e){return null}};
var t=g('theme')||${JSON.stringify(DEFAULTS.theme)};
var r=(t==='light'||t==='dark')?t:(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
d.dataset.theme=r;d.dataset.themePreference=t;d.style.colorScheme=r;
d.dataset.density=g('density')||${JSON.stringify(DEFAULTS.density)};
d.dataset.seed=g('seed')||${JSON.stringify(DEFAULTS.seed)};
var s=parseInt(g('scale'),10);d.style.setProperty('--ui-scale',String((isNaN(s)?${DEFAULTS.scale}:Math.min(${SCALE.max},Math.max(${SCALE.min},s)))/100));
}catch(e){}})();`;

if (systemDark) {
  const onSystemChange = () => {
    if (state.theme === 'system') {
      apply();
      emit('theme');
    }
  };
  if (typeof systemDark.addEventListener === 'function') {
    systemDark.addEventListener('change', onSystemChange);
  } else if (typeof systemDark.addListener === 'function') {
    systemDark.addListener(onSystemChange); // Safari < 14
  }
}

// Keep multiple tabs of the site in agreement.
window.addEventListener('storage', (event) => {
  if (!event.key || !event.key.startsWith(STORAGE_PREFIX)) return;
  state = loadState();
  apply();
  emit('all');
  refreshMountedControls();
});

/* ===========================================================================
 * 7. Translation + notification bridges
 *
 * Injected rather than imported so this module never depends on load order.
 * main.js is expected to call setTranslator(...) once i18n.js is ready; until
 * then every label falls back to its English text, so the panel is never blank.
 * ======================================================================== */

let translator = null;

/**
 * @param {(key: string, fallback: string) => string} fn
 */
export function setTranslator(fn) {
  translator = typeof fn === 'function' ? fn : null;
  refreshMountedControls();
}

function t(key, fallbackEn) {
  if (!translator) return fallbackEn;
  try {
    const out = translator(key, fallbackEn);
    return typeof out === 'string' && out.length ? out : fallbackEn;
  } catch {
    return fallbackEn;
  }
}

let notifier = null;

/**
 * @param {(message: {title: string, body?: string, tone?: string}) => void} fn
 */
export function setNotifier(fn) {
  notifier = typeof fn === 'function' ? fn : null;
}

function notify(message) {
  if (notifier) {
    try {
      notifier(message);
      return;
    } catch (error) {
      console.error('[appearance] notifier failed', error);
    }
  }
  // No notifier wired yet: let ui.js pick this up off the document instead.
  document.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: message, bubbles: true }));
}

document.addEventListener(LANGUAGE_EVENT, refreshMountedControls);

/* ===========================================================================
 * 8. Styles for the controls this module renders
 *
 * Built only on M3 tokens, at single-class specificity, so app.css can restyle
 * anything here without !important. Injected from JS because this module has
 * to work whether or not the page author remembered to include a rule for it.
 * ======================================================================== */

const PANEL_CSS = `
.ap-panel { display: flex; flex-direction: column; gap: var(--gap, 16px); }
.ap-field { display: flex; flex-direction: column; gap: 8px; }
.ap-field-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.ap-label { font-size: 14px; font-weight: 600; color: var(--md-sys-color-on-surface, #221A17); }
.ap-hint { font-size: 12px; line-height: 1.45; color: var(--md-sys-color-on-surface-variant, #53433E); }
.ap-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }

.ap-seg { display: inline-flex; padding: 3px; gap: 2px;
  border: 1px solid var(--md-sys-color-outline, #85736D);
  border-radius: var(--md-sys-shape-corner-full, 9999px);
  background: var(--md-sys-color-surface-container-low, transparent); }
.ap-seg-item { appearance: none; border: 0; cursor: pointer; font: inherit; font-size: 13px;
  font-weight: 600; padding: 0 16px; min-height: 36px;
  border-radius: var(--md-sys-shape-corner-full, 9999px); background: transparent;
  color: var(--md-sys-color-on-surface-variant, #53433E); }
.ap-seg-item[aria-checked="true"] { background: var(--md-sys-color-secondary-container, #FFDBCF);
  color: var(--md-sys-color-on-secondary-container, #2C160D); }
.ap-seg-item:hover { background: var(--ripple, rgba(0,0,0,.08)); }
.ap-seg-item[aria-checked="true"]:hover { background: var(--md-sys-color-secondary-container, #FFDBCF); }

.ap-swatches { display: flex; flex-wrap: wrap; gap: 10px; padding: 2px; }
.ap-swatch { appearance: none; cursor: pointer; width: 40px; height: 40px; padding: 0;
  border-radius: var(--md-sys-shape-corner-full, 9999px);
  border: 3px solid transparent; background-clip: padding-box; }
.ap-swatch[aria-checked="true"] { border-color: var(--md-sys-color-on-surface, #221A17); }

.ap-icon-btn { appearance: none; cursor: pointer; display: inline-grid; place-items: center;
  width: 32px; height: 32px; padding: 0; border: 0; background: transparent;
  border-radius: var(--md-sys-shape-corner-full, 9999px);
  color: var(--md-sys-color-on-surface-variant, #53433E); }
.ap-icon-btn:hover { background: var(--ripple, rgba(0,0,0,.08)); }
.ap-icon-btn svg { width: 18px; height: 18px; fill: currentColor; }

.ap-text { font: inherit; font-size: 13px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  min-height: 40px; padding: 0 12px; width: 10.5ch;
  color: var(--md-sys-color-on-surface, #221A17);
  background: var(--md-sys-color-surface-container-highest, transparent);
  border: 1px solid var(--md-sys-color-outline, #85736D);
  border-radius: var(--md-sys-shape-corner-s, 8px); }
.ap-text[aria-invalid="true"] { border-color: var(--md-sys-color-error, #BA1A1A); border-width: 2px; }

.ap-color { appearance: none; -webkit-appearance: none; cursor: pointer;
  width: 56px; height: 40px; padding: 2px; background: transparent;
  border: 1px solid var(--md-sys-color-outline, #85736D);
  border-radius: var(--md-sys-shape-corner-s, 8px); }
.ap-color::-webkit-color-swatch-wrapper { padding: 0; }
.ap-color::-webkit-color-swatch { border: 0; border-radius: 5px; }
.ap-color::-moz-color-swatch { border: 0; border-radius: 5px; }

.ap-range { flex: 1 1 180px; min-width: 140px; height: 24px;
  accent-color: var(--md-sys-color-primary, #8F4C34); }
.ap-range-value { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px; min-width: 5ch; text-align: right;
  color: var(--md-sys-color-on-surface-variant, #53433E); }

.ap-error { font-size: 12px; color: var(--md-sys-color-error, #BA1A1A); }
.ap-error:empty { display: none; }

.ap-translator { display: flex; flex-direction: column; gap: 8px; padding: 12px;
  border: 1px solid var(--md-sys-color-outline-variant, #D8C2BB);
  border-radius: var(--md-sys-shape-corner-m, 12px);
  background: var(--md-sys-color-surface-container-low, transparent); }
.ap-translator-grid { display: grid; grid-template-columns: auto 1fr auto; gap: 6px 10px; align-items: center; }
.ap-translator-key { font-size: 12px; font-weight: 600;
  color: var(--md-sys-color-on-surface-variant, #53433E); }
.ap-translator-val { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px; overflow-wrap: anywhere;
  color: var(--md-sys-color-on-surface, #221A17); }
.ap-contrast { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: baseline; font-size: 12px;
  color: var(--md-sys-color-on-surface-variant, #53433E); }
.ap-badge { font-size: 11px; font-weight: 700; padding: 2px 8px;
  border-radius: var(--md-sys-shape-corner-full, 9999px);
  background: var(--md-sys-color-surface-container-highest, transparent);
  color: var(--md-sys-color-on-surface, #221A17); }
.ap-badge[data-rating="aaa"], .ap-badge[data-rating="aa"] {
  background: var(--md-sys-color-success-container, #B8F0C8);
  color: var(--md-sys-color-on-surface, #221A17); }
.ap-badge[data-rating="fail"] { background: var(--md-sys-color-error-container, #FFDAD6);
  color: var(--md-sys-color-on-error-container, #410002); }

.ap-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.ap-btn { appearance: none; cursor: pointer; font: inherit; font-size: 14px; font-weight: 600;
  min-height: 40px; padding: 0 20px;
  border: 1px solid var(--md-sys-color-outline, #85736D);
  border-radius: var(--md-sys-shape-corner-full, 9999px);
  background: transparent; color: var(--md-sys-color-primary, #8F4C34); }
.ap-btn:hover { background: var(--ripple, rgba(0,0,0,.08)); }

.ap-panel :focus-visible { outline: 3px solid var(--md-sys-color-primary, #8F4C34);
  outline-offset: 2px; border-radius: var(--md-sys-shape-corner-xs, 4px); }

.ap-sr { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0;
  overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }

@media (prefers-reduced-motion: no-preference) {
  .ap-seg-item, .ap-swatch, .ap-icon-btn, .ap-btn {
    transition: background 200ms var(--md-sys-motion-emphasized, cubic-bezier(.2,0,0,1)),
                border-color 200ms var(--md-sys-motion-emphasized, cubic-bezier(.2,0,0,1)); }
}
`;

function ensureStyles() {
  if (document.querySelector('style[data-appearance-styles]')) return;
  const style = document.createElement('style');
  style.dataset.appearanceStyles = '';
  style.textContent = PANEL_CSS;
  document.head.appendChild(style);
}

/* Two inline SVG icons — the site ships no icon font, so icons are drawn. */
const ICON_RESET =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 5V2L8 6l4 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7Z"/></svg>';
const ICON_COPY =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1Zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Zm0 16H8V7h11v14Z"/></svg>';

/* ===========================================================================
 * 9. Small DOM helpers
 * ======================================================================== */

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([key, value]) => {
    if (value == null) return;
    if (key === 'class') node.className = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else node.setAttribute(key, String(value));
  });
  (Array.isArray(children) ? children : [children]).forEach((child) => {
    if (child == null) return;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  });
  return node;
}

let uid = 0;
const nextId = (prefix) => `${prefix}-${(uid += 1)}`;

/** Copy text to the clipboard, with a fallback for non-secure contexts. */
async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const ta = el('textarea', { class: 'ap-sr', 'aria-hidden': 'true' });
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

/**
 * Build a radiogroup out of buttons with proper roving-tabindex keyboard
 * behaviour: arrows move and select, Home/End jump to the ends. Buttons rather
 * than <input type=radio> so the swatches can be arbitrary colour chips while
 * still announcing correctly.
 */
function buildRadioGroup({ items, getValue, onSelect, itemClass, labelledBy, render }) {
  const group = el('div', { role: 'radiogroup', class: itemClass.group, 'aria-labelledby': labelledBy });
  const buttons = [];

  const sync = () => {
    const value = getValue();
    buttons.forEach((btn) => {
      const checked = btn.dataset.value === value;
      btn.setAttribute('aria-checked', checked ? 'true' : 'false');
      btn.tabIndex = checked ? 0 : -1;
    });
    // Nothing matched (e.g. seed === 'custom'): keep the group reachable.
    if (!buttons.some((b) => b.tabIndex === 0) && buttons[0]) buttons[0].tabIndex = 0;
  };

  items.forEach((item) => {
    const btn = el('button', {
      type: 'button',
      role: 'radio',
      class: itemClass.item,
      dataset: { value: item.id },
      'aria-checked': 'false',
      tabindex: '-1',
      onclick: () => {
        onSelect(item.id);
        sync();
      },
      onkeydown: (event) => {
        const idx = buttons.indexOf(btn);
        let target = null;
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') target = buttons[(idx + 1) % buttons.length];
        else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') target = buttons[(idx - 1 + buttons.length) % buttons.length];
        else if (event.key === 'Home') target = buttons[0];
        else if (event.key === 'End') target = buttons[buttons.length - 1];
        if (!target) return;
        event.preventDefault();
        onSelect(target.dataset.value);
        sync();
        target.focus();
      },
    });
    render(btn, item);
    buttons.push(btn);
    group.appendChild(btn);
  });

  sync();
  return { group, sync, buttons };
}

/* ===========================================================================
 * 10. The appearance controls
 * ======================================================================== */

/** Every mounted panel, so language/state changes can refresh all of them. */
const mounted = new Set();

function refreshMountedControls() {
  mounted.forEach((refresh) => {
    try {
      refresh();
    } catch (error) {
      console.error('[appearance] refresh failed', error);
    }
  });
}

/**
 * Render the appearance controls into `container`.
 *
 * @param {Element} container
 * @param {{ includeTranslator?: boolean, heading?: boolean }} [options]
 * @returns {{ refresh: () => void, destroy: () => void }}
 */
export function mountAppearanceControls(container, options = {}) {
  if (!container) return { refresh() {}, destroy() {} };
  const { includeTranslator = true, heading = true } = options;

  ensureStyles();
  container.textContent = '';

  const panel = el('div', { class: 'ap-panel' });
  const refreshers = [];

  /* --- reset button factory --------------------------------------------- */
  const resetButton = (key, labelEn, labelKey) =>
    el('button', {
      type: 'button',
      class: 'ap-icon-btn',
      html: ICON_RESET,
      title: t(labelKey, labelEn),
      'aria-label': t(labelKey, labelEn),
      onclick: () => {
        resetProperty(key);
        refreshMountedControls();
        notify({
          tone: 'info',
          title: t('appearance.toast.resetOne', 'Setting reset'),
          body: t(labelKey, labelEn),
        });
      },
    });

  /* --- heading ----------------------------------------------------------- */
  const headingId = nextId('ap-heading');
  if (heading) {
    const h = el('h3', { id: headingId, class: 'ap-label', text: t('appearance.title', 'Appearance') });
    panel.appendChild(h);
    refreshers.push(() => {
      h.textContent = t('appearance.title', 'Appearance');
    });
    panel.setAttribute('role', 'group');
    panel.setAttribute('aria-labelledby', headingId);
  }

  /* --- theme ------------------------------------------------------------- */
  {
    const labelId = nextId('ap-theme');
    const label = el('span', { id: labelId, class: 'ap-label', text: t('appearance.theme.label', 'Theme') });
    const resetBtn = resetButton('theme', 'Reset theme', 'appearance.theme.reset');
    const { group, sync, buttons } = buildRadioGroup({
      items: THEMES,
      labelledBy: labelId,
      itemClass: { group: 'ap-seg', item: 'ap-seg-item' },
      getValue: () => state.theme,
      onSelect: (id) => setTheme(id),
      render: (btn, item) => {
        btn.textContent = t(item.labelKey, item.labelEn);
      },
    });

    panel.appendChild(
      el('div', { class: 'ap-field' }, [
        el('div', { class: 'ap-field-head' }, [label, resetBtn]),
        group,
      ]),
    );

    refreshers.push(() => {
      label.textContent = t('appearance.theme.label', 'Theme');
      buttons.forEach((btn, i) => {
        btn.textContent = t(THEMES[i].labelKey, THEMES[i].labelEn);
      });
      sync();
    });
  }

  /* --- density ----------------------------------------------------------- */
  {
    const labelId = nextId('ap-density');
    const label = el('span', { id: labelId, class: 'ap-label', text: t('appearance.density.label', 'Density') });
    const resetBtn = resetButton('density', 'Reset density', 'appearance.density.reset');
    const { group, sync, buttons } = buildRadioGroup({
      items: DENSITIES,
      labelledBy: labelId,
      itemClass: { group: 'ap-seg', item: 'ap-seg-item' },
      getValue: () => state.density,
      onSelect: (id) => setDensity(id),
      render: (btn, item) => {
        btn.textContent = t(item.labelKey, item.labelEn);
      },
    });

    panel.appendChild(
      el('div', { class: 'ap-field' }, [
        el('div', { class: 'ap-field-head' }, [label, resetBtn]),
        group,
      ]),
    );

    refreshers.push(() => {
      label.textContent = t('appearance.density.label', 'Density');
      buttons.forEach((btn, i) => {
        btn.textContent = t(DENSITIES[i].labelKey, DENSITIES[i].labelEn);
      });
      sync();
    });
  }

  /* --- seed colour ------------------------------------------------------- */
  let translatorApi = null;
  {
    const labelId = nextId('ap-seed');
    const label = el('span', { id: labelId, class: 'ap-label', text: t('appearance.seed.label', 'Seed colour') });
    const resetBtn = resetButton('seed', 'Reset seed colour', 'appearance.seed.reset');

    const { group: swatches, sync: syncSwatches, buttons: swatchButtons } = buildRadioGroup({
      items: NAMED_SEEDS,
      labelledBy: labelId,
      itemClass: { group: 'ap-swatches', item: 'ap-swatch' },
      getValue: () => state.seed,
      onSelect: (id) => {
        setSeed(id);
        syncSeedInputs();
      },
      render: (btn, item) => {
        btn.style.backgroundColor = item.swatch;
        btn.setAttribute('aria-label', `${t(item.labelKey, item.labelEn)} — ${item.swatch}`);
        btn.title = `${t(item.labelKey, item.labelEn)} — ${item.swatch}`;
      },
    });

    const colorId = nextId('ap-color');
    const hexId = nextId('ap-hex');
    const errorId = nextId('ap-hex-error');

    const colorInput = el('input', {
      type: 'color',
      id: colorId,
      class: 'ap-color',
      value: currentSeedColor(),
    });
    const colorLabel = el('label', {
      for: colorId,
      class: 'ap-hint',
      text: t('appearance.seed.picker', 'Any colour'),
    });

    const hexInput = el('input', {
      type: 'text',
      id: hexId,
      class: 'ap-text',
      value: currentSeedColor(),
      spellcheck: 'false',
      autocomplete: 'off',
      inputmode: 'text',
      maxlength: '7',
      'aria-describedby': errorId,
    });
    const hexLabel = el('label', {
      for: hexId,
      class: 'ap-hint',
      text: t('appearance.seed.hex', 'Hex'),
    });
    const hexError = el('p', { id: errorId, class: 'ap-error', role: 'status' });

    // Keep the two inputs and the swatch selection in step.
    function syncSeedInputs() {
      const hex = currentSeedColor();
      colorInput.value = hex;
      // Do not stamp on what the user is mid-way through typing.
      if (document.activeElement !== hexInput) hexInput.value = hex;
      syncSwatches();
      if (translatorApi) translatorApi.setColor(hex);
    }

    colorInput.addEventListener('input', () => {
      setCustomSeed(colorInput.value);
      hexError.textContent = '';
      hexInput.setAttribute('aria-invalid', 'false');
      syncSeedInputs();
    });

    hexInput.addEventListener('input', () => {
      const candidate = hexInput.value;
      const parsed = parseHex(candidate);
      if (!parsed) {
        // Keep the user's text — never silently discard an input we can't use.
        hexInput.setAttribute('aria-invalid', 'true');
        hexError.textContent = t(
          'appearance.seed.hexInvalid',
          'Not a hex colour. Use #RGB or #RRGGBB.',
        );
        return;
      }
      hexInput.setAttribute('aria-invalid', 'false');
      hexError.textContent = '';
      setCustomSeed(candidate);
      colorInput.value = toHex(parsed);
      syncSwatches();
      if (translatorApi) translatorApi.setColor(toHex(parsed));
    });

    hexInput.addEventListener('blur', () => {
      // On leaving the field, snap back to the value actually in force.
      if (!parseHex(hexInput.value)) {
        hexInput.value = currentSeedColor();
        hexInput.setAttribute('aria-invalid', 'false');
        hexError.textContent = '';
      }
    });

    const hint = el('p', {
      class: 'ap-hint',
      text: t(
        'appearance.seed.hint',
        'Any colour works: the dependent colour roles are derived from it so contrast stays readable in both themes.',
      ),
    });

    const field = el('div', { class: 'ap-field' }, [
      el('div', { class: 'ap-field-head' }, [label, resetBtn]),
      swatches,
      el('div', { class: 'ap-row' }, [
        el('div', { class: 'ap-row' }, [colorInput, colorLabel]),
        el('div', { class: 'ap-row' }, [hexInput, hexLabel]),
      ]),
      hexError,
      hint,
    ]);

    if (includeTranslator) {
      const translatorHost = el('div');
      field.appendChild(translatorHost);
      translatorApi = mountColorTranslator(translatorHost, { color: currentSeedColor() });
    }

    panel.appendChild(field);

    refreshers.push(() => {
      label.textContent = t('appearance.seed.label', 'Seed colour');
      colorLabel.textContent = t('appearance.seed.picker', 'Any colour');
      hexLabel.textContent = t('appearance.seed.hex', 'Hex');
      hint.textContent = t(
        'appearance.seed.hint',
        'Any colour works: the dependent colour roles are derived from it so contrast stays readable in both themes.',
      );
      swatchButtons.forEach((btn, i) => {
        const item = NAMED_SEEDS[i];
        const name = `${t(item.labelKey, item.labelEn)} — ${item.swatch}`;
        btn.setAttribute('aria-label', name);
        btn.title = name;
      });
      syncSeedInputs();
      if (translatorApi) translatorApi.refresh();
    });
  }

  /* --- UI scale ---------------------------------------------------------- */
  {
    const rangeId = nextId('ap-scale');
    const label = el('label', {
      for: rangeId,
      class: 'ap-label',
      text: t('appearance.scale.label', 'UI scale'),
    });
    const resetBtn = resetButton('scale', 'Reset UI scale', 'appearance.scale.reset');

    const value = el('output', { class: 'ap-range-value', for: rangeId, text: `${state.scale}%` });
    const range = el('input', {
      type: 'range',
      id: rangeId,
      class: 'ap-range',
      min: String(SCALE.min),
      max: String(SCALE.max),
      step: String(SCALE.step),
      value: String(state.scale),
      'aria-valuetext': `${state.scale}%`,
    });

    range.addEventListener('input', () => {
      setScale(range.value);
      value.textContent = `${state.scale}%`;
      range.setAttribute('aria-valuetext', `${state.scale}%`);
    });

    panel.appendChild(
      el('div', { class: 'ap-field' }, [
        el('div', { class: 'ap-field-head' }, [label, resetBtn]),
        el('div', { class: 'ap-row' }, [range, value]),
        el('p', {
          class: 'ap-hint',
          text: `${SCALE.min}–${SCALE.max}${SCALE.unit}`,
        }),
      ]),
    );

    refreshers.push(() => {
      label.textContent = t('appearance.scale.label', 'UI scale');
      range.value = String(state.scale);
      value.textContent = `${state.scale}%`;
      range.setAttribute('aria-valuetext', `${state.scale}%`);
    });
  }

  /* --- global reset ------------------------------------------------------ */
  {
    const btn = el('button', {
      type: 'button',
      class: 'ap-btn',
      text: t('appearance.resetAll', 'Reset appearance'),
      onclick: () => {
        reset();
        refreshMountedControls();
        notify({
          tone: 'info',
          title: t('appearance.toast.resetAll', 'Appearance reset'),
          body: t('appearance.toast.resetAllBody', 'Theme, density, seed colour and UI scale are back to their defaults.'),
        });
      },
    });
    panel.appendChild(el('div', { class: 'ap-actions' }, [btn]));
    refreshers.push(() => {
      btn.textContent = t('appearance.resetAll', 'Reset appearance');
    });
  }

  container.appendChild(panel);

  const refresh = () => refreshers.forEach((fn) => fn());
  mounted.add(refresh);

  // Keep the panel in step with changes made elsewhere (palette, another tab).
  const unsubscribe = subscribe(() => refresh());

  return {
    refresh,
    destroy() {
      mounted.delete(refresh);
      unsubscribe();
      if (translatorApi) translatorApi.destroy();
      container.textContent = '';
    },
  };
}

/* ===========================================================================
 * 11. The colour translator
 * ======================================================================== */

/**
 * Render the colour translator into `container`.
 *
 * Shows one colour in HEX, RGB, HSL and HSV at once, each with a copy button,
 * plus its WCAG contrast against the current surface and the contrast the
 * derived primary would have on that same surface — so an unreadable seed is
 * visible as unreadable before it is committed to.
 *
 * @param {Element} container
 * @param {{ color?: string, followSeed?: boolean }} [options]
 *   followSeed (default true) keeps the translator showing the seed colour as
 *   it changes. Pass false to pin it to one colour — otherwise a standalone
 *   translator would be yanked back to the seed by any appearance change.
 */
export function mountColorTranslator(container, options = {}) {
  if (!container) return { setColor() {}, refresh() {}, destroy() {} };
  ensureStyles();
  container.textContent = '';

  const followSeed = options.followSeed !== false;
  let color = parseHex(options.color) ? toHex(parseHex(options.color)) : currentSeedColor();

  const titleId = nextId('ap-translator');
  const rows = [
    { id: 'hex', labelKey: 'appearance.translator.hex', labelEn: 'HEX' },
    { id: 'rgb', labelKey: 'appearance.translator.rgb', labelEn: 'RGB' },
    { id: 'hsl', labelKey: 'appearance.translator.hsl', labelEn: 'HSL' },
    { id: 'hsv', labelKey: 'appearance.translator.hsv', labelEn: 'HSV' },
  ];

  const grid = el('div', { class: 'ap-translator-grid' });
  const valueNodes = {};
  const keyNodes = {};
  const copyButtons = {};

  rows.forEach((row) => {
    const key = el('span', { class: 'ap-translator-key', text: t(row.labelKey, row.labelEn) });
    const val = el('span', { class: 'ap-translator-val', dataset: { format: row.id } });
    const copy = el('button', {
      type: 'button',
      class: 'ap-icon-btn',
      html: ICON_COPY,
      onclick: async () => {
        const text = val.textContent || '';
        const ok = await copyText(text);
        notify({
          tone: ok ? 'success' : 'error',
          title: ok
            ? t('appearance.translator.copied', 'Copied')
            : t('appearance.translator.copyFailed', 'Could not copy'),
          body: text,
        });
      },
    });
    keyNodes[row.id] = key;
    valueNodes[row.id] = val;
    copyButtons[row.id] = copy;
    grid.append(key, val, copy);
  });

  const contrastLine = el('p', { class: 'ap-contrast', role: 'status', 'aria-live': 'polite' });
  const primaryLine = el('p', { class: 'ap-contrast' });

  const title = el('p', {
    id: titleId,
    class: 'ap-label',
    text: t('appearance.translator.title', 'Colour translator'),
  });

  const wrap = el('div', { class: 'ap-translator', role: 'group', 'aria-labelledby': titleId }, [
    title,
    grid,
    contrastLine,
    primaryLine,
  ]);
  container.appendChild(wrap);

  /** Rebuild every readout from `color` and the live surface colour. */
  function refresh() {
    const rgb = parseHex(color);
    if (!rgb) return;

    const hsl = rgbToHsl(rgb);
    const hsv = rgbToHsv(rgb);
    const r0 = (n) => Math.round(n);

    valueNodes.hex.textContent = toHex(rgb);
    valueNodes.rgb.textContent = `rgb(${r0(rgb.r)}, ${r0(rgb.g)}, ${r0(rgb.b)})`;
    valueNodes.hsl.textContent = `hsl(${hsl.h.toFixed(1)}, ${hsl.s.toFixed(1)}%, ${hsl.l.toFixed(1)}%)`;
    // HSV is not a CSS colour function; it is labelled as a representation.
    valueNodes.hsv.textContent = `hsv(${hsv.h.toFixed(1)}, ${hsv.s.toFixed(1)}%, ${hsv.v.toFixed(1)}%)`;

    rows.forEach((row) => {
      keyNodes[row.id].textContent = t(row.labelKey, row.labelEn);
      const name = t('appearance.translator.copyLabel', 'Copy {format}').replace(
        '{format}',
        t(row.labelKey, row.labelEn),
      );
      copyButtons[row.id].setAttribute('aria-label', name);
      copyButtons[row.id].title = name;
    });

    title.textContent = t('appearance.translator.title', 'Colour translator');

    // Contrast against whatever --md-sys-color-surface currently resolves to.
    const surface =
      readColorRole('surface') ||
      (resolveTheme(state.theme) === 'dark' ? { r: 26, g: 18, b: 15 } : { r: 255, g: 248, b: 246 });

    const ratio = contrastRatio(rgb, surface);
    const rating = contrastRating(ratio);
    contrastLine.textContent = '';
    contrastLine.append(
      el('span', {
        text: t('appearance.translator.contrast', 'On the current surface: {ratio}:1').replace(
          '{ratio}',
          ratio.toFixed(2),
        ),
      }),
      el('span', {
        class: 'ap-badge',
        dataset: { rating: rating.id },
        text: t(`appearance.translator.rating.${rating.id}`, rating.en),
      }),
    );

    // The role that actually gets used: the derived primary for this theme.
    const derived = deriveSeedRoles(color, resolveTheme(state.theme)).find(
      ([prop]) => prop === '--md-sys-color-primary',
    );
    if (derived) {
      const derivedRgb = parseHex(derived[2]);
      const derivedRatio = contrastRatio(derivedRgb, surface);
      const derivedRating = contrastRating(derivedRatio);
      primaryLine.textContent = '';
      primaryLine.append(
        el('span', {
          text: t(
            'appearance.translator.derived',
            'Derived primary {hex} on the surface: {ratio}:1',
          )
            .replace('{hex}', derived[2])
            .replace('{ratio}', derivedRatio.toFixed(2)),
        }),
        el('span', {
          class: 'ap-badge',
          dataset: { rating: derivedRating.id },
          text: t(`appearance.translator.rating.${derivedRating.id}`, derivedRating.en),
        }),
      );
    }
  }

  refresh();
  mounted.add(refresh);
  const unsubscribe = subscribe(() => {
    // Theme changes move the surface, so the contrast readout must follow even
    // when the translated colour itself is pinned.
    if (followSeed) color = currentSeedColor();
    refresh();
  });

  return {
    setColor(next) {
      const parsed = parseHex(next);
      if (!parsed) return;
      color = toHex(parsed);
      refresh();
    },
    getColor: () => color,
    refresh,
    destroy() {
      mounted.delete(refresh);
      unsubscribe();
      container.textContent = '';
    },
  };
}

/* ===========================================================================
 * 12. Descriptors for the command palette and the settings search
 *
 * Every appearance setting, described well enough that ui.js can render a LIVE
 * control for it inline in a palette row without knowing anything about this
 * module's internals.
 * ======================================================================== */

export function describeSettings() {
  return [
    {
      id: 'appearance.theme',
      section: t('appearance.title', 'Appearance'),
      label: t('appearance.theme.label', 'Theme'),
      keywords: ['theme', 'light', 'dark', 'system', 'colour scheme', 'color scheme', '主題', '深色', '淺色'],
      type: 'select',
      options: THEMES.map((item) => ({ value: item.id, label: t(item.labelKey, item.labelEn) })),
      get: () => state.theme,
      set: setTheme,
      reset: () => resetProperty('theme'),
    },
    {
      id: 'appearance.density',
      section: t('appearance.title', 'Appearance'),
      label: t('appearance.density.label', 'Density'),
      keywords: ['density', 'compact', 'comfortable', 'spacing', '密度'],
      type: 'select',
      options: DENSITIES.map((item) => ({ value: item.id, label: t(item.labelKey, item.labelEn) })),
      get: () => state.density,
      set: setDensity,
      reset: () => resetProperty('density'),
    },
    {
      id: 'appearance.seed',
      section: t('appearance.title', 'Appearance'),
      label: t('appearance.seed.label', 'Seed colour'),
      keywords: ['seed', 'colour', 'color', 'accent', 'palette', 'hex', '主色', '顏色'],
      type: 'color',
      options: NAMED_SEEDS.map((item) => ({
        value: item.id,
        label: t(item.labelKey, item.labelEn),
        swatch: item.swatch,
      })),
      get: currentSeedColor,
      set: (value) => (isOneOf(value, NAMED_SEEDS) ? setSeed(value) : setCustomSeed(value)),
      reset: () => resetProperty('seed'),
    },
    {
      id: 'appearance.scale',
      section: t('appearance.title', 'Appearance'),
      label: t('appearance.scale.label', 'UI scale'),
      keywords: ['scale', 'zoom', 'size', 'bigger', 'smaller', '縮放', '大細'],
      type: 'range',
      min: SCALE.min,
      max: SCALE.max,
      step: SCALE.step,
      unit: SCALE.unit,
      get: () => state.scale,
      set: setScale,
      reset: () => resetProperty('scale'),
    },
  ];
}

/* ===========================================================================
 * 13. Auto-mount
 *
 * index.html only has to provide an empty element with the right hook; nothing
 * else needs to import this module for the controls to exist.
 * ======================================================================== */

function autoMount() {
  ensureUiScaleIsLive();
  document
    .querySelectorAll('[data-appearance-controls]')
    .forEach((node) =>
      mountAppearanceControls(node, {
        includeTranslator: node.dataset.appearanceControls !== 'no-translator',
      }),
    );
  document
    .querySelectorAll('[data-colour-translator], [data-color-translator]')
    .forEach((node) => mountColorTranslator(node, { color: currentSeedColor() }));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', autoMount, { once: true });
} else {
  autoMount();
}

// Stylesheets may still have been arriving at DOMContentLoaded; re-check once
// everything has settled so the --ui-scale safety net is accurate.
window.addEventListener('load', ensureUiScaleIsLive);

/* ===========================================================================
 * 14. Default export — a single object for consumers that prefer one import
 * ======================================================================== */

const appearance = {
  STORAGE_PREFIX,
  EARLY_BOOT_SNIPPET,
  CHANGE_EVENT,
  TOAST_EVENT,
  LANGUAGE_EVENT,
  THEMES,
  DENSITIES,
  NAMED_SEEDS,
  SCALE,
  DEFAULTS,
  getState,
  subscribe,
  apply,
  setTheme,
  setDensity,
  setSeed,
  setCustomSeed,
  setScale,
  resetProperty,
  reset,
  setTranslator,
  setNotifier,
  mountAppearanceControls,
  mountColorTranslator,
  describeSettings,
  deriveSeedRoles,
  // colour utilities, exposed because regex.js/ui.js may want the same maths
  parseHex,
  toHex,
  rgbToHsl,
  rgbToHsv,
  rgbToOklab,
  oklabToRgb,
  contrastRatio,
  contrastRating,
  parseColorString,
  resolveCssColor,
  readColorRole,
};

export default appearance;

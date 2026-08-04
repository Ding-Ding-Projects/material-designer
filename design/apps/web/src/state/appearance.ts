import { getOpenDesignHost } from '@open-design/host';

import type { AppTheme } from '../types';

const ACCENT_VARS = [
  '--accent',
  '--accent-strong',
  '--accent-soft',
  '--accent-tint',
  '--accent-hover',
] as const;

/**
 * The accent used until the user picks one, written as the Material Design
 * 3 `primary` role rather than as a colour. That is load-bearing, not
 * decorative: `applyAppearanceToDocument` below writes all five accent
 * properties as inline style on `<html>`, which no stylesheet can outrank,
 * so a literal hex here would pin one colour on every install whose owner
 * never opens the accent picker — including in dark, where `primary` is a
 * different tone, and under a different seed, where it is a different hue.
 * As the role it resolves exactly the way `styles/tokens.css` declares it
 * and follows the theme for free. It is deliberately not a valid `#rrggbb`,
 * so `normalizeAccentColor` rejects it and it can never be confused with a
 * colour the user chose.
 */
export const DEFAULT_ACCENT_COLOR = 'var(--md-sys-color-primary)';

/**
 * What the custom-colour control starts from while the accent is the
 * default. `<input type="color">` can only hold a hex, so it cannot show a
 * role; this is the terracotta the product used as its default accent
 * before that default became the role.
 */
export const CUSTOM_ACCENT_FALLBACK = '#c96442';

export const ACCENT_SWATCHES = [
  DEFAULT_ACCENT_COLOR,
  CUSTOM_ACCENT_FALLBACK,
  '#2563eb',
  '#7c3aed',
  '#059669',
  '#dc2626',
  '#d97706',
  '#0891b2',
  '#db2777',
] as const;

export function normalizeAccentColor(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed.toLowerCase() : null;
}

export function resolveAccentColor(value: unknown): string {
  return normalizeAccentColor(value) ?? DEFAULT_ACCENT_COLOR;
}

function accentVars(accentColor: string): Record<(typeof ACCENT_VARS)[number], string> {
  return {
    '--accent': accentColor,
    // Keep these mix ratios in sync with the pre-hydration script in app/layout.tsx.
    '--accent-strong': `color-mix(in srgb, ${accentColor} 86%, var(--text-strong))`,
    '--accent-soft': `color-mix(in srgb, ${accentColor} 22%, var(--bg-panel))`,
    '--accent-tint': `color-mix(in srgb, ${accentColor} 12%, var(--bg-panel))`,
    '--accent-hover': `color-mix(in srgb, ${accentColor} 90%, var(--text-strong))`,
  };
}

export function applyAppearanceToDocument({
  theme,
  accentColor,
}: {
  theme?: AppTheme;
  accentColor?: string;
}): void {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') {
    root.setAttribute('data-theme', theme);
  } else {
    root.removeAttribute('data-theme');
  }

  const normalized = resolveAccentColor(accentColor);
  const vars = accentVars(normalized);
  for (const name of ACCENT_VARS) {
    root.style.setProperty(name, vars[name]);
  }
}

/* ============================================================
   The rest of the appearance contract: seed, density, UI scale
   and typography.

   These live beside theme and accent but are applied by a SECOND
   function, `applyAppearancePreferencesToDocument`, rather than being
   folded into the one above. That is deliberate and load-bearing.
   `applyAppearanceToDocument` is called from four places with a
   `{ theme, accentColor }` literal — App's layout effect, App's quick
   theme switch, the command palette, and SettingsDialog's cancel path
   that reverts to the last saved appearance. If it also owned density,
   any one of those calls would silently reset four properties it never
   mentioned, and Settings-cancel would reset them on every close. Two
   functions, two disjoint sets of properties, no call site able to
   clobber a property it did not name.

   Every value here is written as the token `md3-tokens.css` already
   declares for it, so this module chooses no colours and no sizes: it
   selects between variants the design contract owns.
   ============================================================ */

/** M3 seed variants declared by `styles/md3-tokens.css`. */
export type AppearanceSeed = 'sunset' | 'violet' | 'teal' | 'lime';

export const APPEARANCE_SEEDS: readonly AppearanceSeed[] = ['sunset', 'violet', 'teal', 'lime'];

/**
 * Density levels declared by `styles/md3-tokens.css`.
 *
 * `default` is the `:root` block itself — the sheet deliberately has no
 * `[data-density="default"]` selector — so applying it means *removing*
 * the attribute rather than writing it.
 */
export type AppearanceDensity = 'compact' | 'default' | 'comfortable';

export const APPEARANCE_DENSITIES: readonly AppearanceDensity[] = [
  'compact',
  'default',
  'comfortable',
];

/**
 * The font stacks the appearance editor offers.
 *
 * `default` is not a stack: it is the absence of an override, so the
 * `--md-ref-typeface-plain` the token sheet declares applies untouched.
 * Writing the sheet's own value back as an inline style would work today
 * and drift the moment the contract changes its face, so the default is
 * expressed as "remove the property" instead.
 *
 * The app bundles no font binaries. Every stack below is therefore a
 * *request* resolved against what the platform has, and each one ends in
 * the same CJK-capable tail the sheet uses, so a Chinese, Japanese or
 * Korean UI never loses its face to a Latin-only first choice. The editor
 * says both of those things out loud rather than implying the faces ship
 * with the app.
 */
export type FontStackId = 'default' | 'system' | 'grotesque' | 'humanist' | 'serif' | 'mono';

export const FONT_STACK_IDS: readonly FontStackId[] = [
  'default',
  'system',
  'grotesque',
  'humanist',
  'serif',
  'mono',
];

// The CJK tail, copied from `--md-ref-typeface-plain` in md3-tokens.css.
// Kept as one constant so a stack cannot accidentally ship without it.
const CJK_SANS_TAIL =
  "'Microsoft YaHei UI', 'PingFang HK', 'Noto Sans CJK HK', 'Noto Sans', sans-serif";
const CJK_SERIF_TAIL = "'Songti SC', 'Noto Serif CJK HK', 'Noto Serif', serif";
const CJK_MONO_TAIL = "'Sarasa Mono HC', 'Noto Sans Mono CJK HK', monospace";

export interface FontStack {
  id: FontStackId;
  /** The `font-family` value, or null for "leave the token sheet alone". */
  value: string | null;
  /**
   * The first family in the stack, so a preview can ask
   * `document.fonts.check` whether this machine actually has it rather
   * than showing a fallback and calling it the chosen face.
   */
  probeFamily: string | null;
}

export const FONT_STACKS: Record<FontStackId, FontStack> = {
  'default': { id: 'default', value: null, probeFamily: 'Roboto Flex' },
  'system': {
    id: 'system',
    value: `system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, ${CJK_SANS_TAIL}`,
    probeFamily: 'system-ui',
  },
  'grotesque': {
    id: 'grotesque',
    value: `'Helvetica Neue', Helvetica, Arial, ${CJK_SANS_TAIL}`,
    probeFamily: 'Helvetica Neue',
  },
  'humanist': {
    id: 'humanist',
    value: `'Inter', 'Segoe UI', 'Open Sans', ${CJK_SANS_TAIL}`,
    probeFamily: 'Inter',
  },
  'serif': {
    id: 'serif',
    value: `'Source Serif Pro', 'Source Serif 4', 'Iowan Old Style', Georgia, 'Times New Roman', ${CJK_SERIF_TAIL}`,
    probeFamily: 'Source Serif Pro',
  },
  'mono': {
    id: 'mono',
    value: `'Roboto Mono', ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, ${CJK_MONO_TAIL}`,
    probeFamily: 'Roboto Mono',
  },
};

/**
 * Typography the user can set.
 *
 * The last four fields are the ones the platform cannot honour here, and
 * they are ordinary fields on purpose. A saved value for an unsupported
 * property survives a save, an export, an import and a reinstall exactly
 * like a supported one — the editor keeps its control visible, explains
 * why nothing changes on screen, and never quietly drops what the user
 * typed. `TYPOGRAPHY_SUPPORT` in `components/appearance/typography.ts` is
 * where "can this be honoured" is answered; storage does not ask.
 */
export interface AppearanceTypography {
  fontStackId: FontStackId;
  /** Base UI text size in px. The sheet's own body size is 13.5. */
  fontSizePx: number;
  fontWeight: number;
  lineHeight: number;
  letterSpacingEm: number;
  /** `opsz` variable axis. No bundled face declares one. */
  opticalSize: number;
  /** `GRAD` variable axis. No bundled face declares one. */
  grade: number;
  /** `font-variant-caps: small-caps`, unreadable for CJK — not applied. */
  smallCaps: boolean;
  /** A text shadow behind chrome text. Refused: it fails contrast checks. */
  glow: boolean;
}

export interface AppearancePreferences {
  seed: AppearanceSeed;
  density: AppearanceDensity;
  /** Unitless scale factor, 0.5–2, written as `--od-scale`. */
  uiScale: number;
  typography: AppearanceTypography;
}

export const MIN_UI_SCALE = 0.5;
export const MAX_UI_SCALE = 2;
export const MIN_FONT_SIZE_PX = 10;
export const MAX_FONT_SIZE_PX = 22;

export const DEFAULT_TYPOGRAPHY: AppearanceTypography = {
  fontStackId: 'default',
  // 13.5px and 1.5 are `body`'s own values in styles/base.css; the defaults
  // here restate them so "reset" lands exactly where an untouched install is.
  fontSizePx: 13.5,
  fontWeight: 400,
  lineHeight: 1.5,
  letterSpacingEm: 0,
  opticalSize: 14,
  grade: 0,
  smallCaps: false,
  glow: false,
};

export const DEFAULT_APPEARANCE_PREFERENCES: AppearancePreferences = {
  seed: 'sunset',
  density: 'default',
  uiScale: 1,
  typography: DEFAULT_TYPOGRAPHY,
};

const APPEARANCE_STORAGE_KEY = 'open-design:appearance';

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/**
 * Total: any input at all produces a usable typography block. A field the
 * payload does not carry, or carries as nonsense, falls back to the default
 * for that one field rather than throwing the whole block away — a preset
 * file written by an older build should lose the property it did not know
 * about, not the four it did.
 */
export function normalizeTypography(value: unknown): AppearanceTypography {
  const raw = (value ?? {}) as Partial<Record<keyof AppearanceTypography, unknown>>;
  return {
    fontStackId: oneOf(raw.fontStackId, FONT_STACK_IDS, DEFAULT_TYPOGRAPHY.fontStackId),
    fontSizePx: clampNumber(
      raw.fontSizePx,
      MIN_FONT_SIZE_PX,
      MAX_FONT_SIZE_PX,
      DEFAULT_TYPOGRAPHY.fontSizePx,
    ),
    fontWeight: clampNumber(raw.fontWeight, 100, 900, DEFAULT_TYPOGRAPHY.fontWeight),
    lineHeight: clampNumber(raw.lineHeight, 1, 2.4, DEFAULT_TYPOGRAPHY.lineHeight),
    letterSpacingEm: clampNumber(
      raw.letterSpacingEm,
      -0.05,
      0.2,
      DEFAULT_TYPOGRAPHY.letterSpacingEm,
    ),
    opticalSize: clampNumber(raw.opticalSize, 8, 144, DEFAULT_TYPOGRAPHY.opticalSize),
    grade: clampNumber(raw.grade, -200, 150, DEFAULT_TYPOGRAPHY.grade),
    smallCaps: raw.smallCaps === true,
    glow: raw.glow === true,
  };
}

export function normalizeAppearancePreferences(value: unknown): AppearancePreferences {
  const raw = (value ?? {}) as Partial<Record<keyof AppearancePreferences, unknown>>;
  return {
    seed: oneOf(raw.seed, APPEARANCE_SEEDS, DEFAULT_APPEARANCE_PREFERENCES.seed),
    density: oneOf(raw.density, APPEARANCE_DENSITIES, DEFAULT_APPEARANCE_PREFERENCES.density),
    uiScale: clampNumber(
      raw.uiScale,
      MIN_UI_SCALE,
      MAX_UI_SCALE,
      DEFAULT_APPEARANCE_PREFERENCES.uiScale,
    ),
    typography: normalizeTypography(raw.typography),
  };
}

export function readStoredAppearancePreferences(): AppearancePreferences {
  if (typeof window === 'undefined') return DEFAULT_APPEARANCE_PREFERENCES;
  try {
    const raw = window.localStorage.getItem(APPEARANCE_STORAGE_KEY);
    if (!raw) return DEFAULT_APPEARANCE_PREFERENCES;
    return normalizeAppearancePreferences(JSON.parse(raw));
  } catch {
    // A corrupt payload is not worth an unusable app; the defaults are a
    // complete, correct appearance and the next write repairs the entry.
    return DEFAULT_APPEARANCE_PREFERENCES;
  }
}

export function writeStoredAppearancePreferences(prefs: AppearancePreferences): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore — a full or blocked store must not break the live preview */
  }
}

/* ============================================================
   UI scale.

   A page cannot scale itself correctly, and this is the file where
   that fact bites. CSS `zoom` — which the M3 mockup this contract was
   transcribed from used, and which was ported with it — multiplies the
   painted result without moving the layout viewport. A 1280px window at
   150% still lays out as 1280px and is then drawn 1.5x larger, so
   `100vw`/`100vh` keep meaning the *unscaled* window, every width media
   query keeps answering for a width the content no longer has, and the
   shell overflows: a horizontal scrollbar, the home heading cut off
   mid-word, the status bar pushed off the bottom edge. That is arithmetic
   rather than a styling accident, and no per-rule patching reaches it.

   The host can do what the page cannot. `webContents.setZoomFactor`
   divides the layout viewport by the factor, exactly as the browser's own
   zoom shortcut does, so a 1280x900 window at 200% becomes a 640x450
   layout viewport: the layout genuinely REFLOWS, viewport units and media
   queries stay truthful, and `getBoundingClientRect` keeps reporting in
   the same space pointer events do. So the desktop shell is asked first,
   and CSS scales nothing at all when it answers.

   Where there is no such host — a plain browser tab served by the daemon —
   the page falls back to `zoom`, and declares the factor it is carrying as
   `--od-css-zoom` so `styles/md3-tokens.css` can divide the viewport units
   the app shell is sized in back down. That keeps the window from
   overflowing, which is the visible half of the defect; it cannot fix the
   width media queries, which have no way to read a custom property. The
   fallback is therefore a smaller magnifying glass, not the same fix.
   ============================================================ */

/** What one scale factor means for the document's own properties. */
export interface UiScaleApplication {
  /**
   * `--od-css-zoom`: the factor CSS `zoom` is actually carrying, so the
   * token sheet can compensate the viewport units by exactly that much.
   * `'1'` whenever CSS is not doing the scaling — including when the host
   * is — because compensating for a zoom that was never applied would
   * shrink the shell to a fraction of the window.
   */
  cssZoom: string;
  /** `--od-scale`: the factor the user chose. Always written. */
  odScale: string;
  /** The CSS `zoom` property, or `null` to remove it. */
  zoom: string | null;
}

/**
 * Pure: what to write for `uiScale`, given whether the host took the job.
 *
 * At scale 1 the `zoom` property is REMOVED rather than written as `1`, so
 * an install whose owner never touches the control has exactly the layout
 * it had before any of this existed.
 */
export function uiScaleApplication(uiScale: number, hostScaled: boolean): UiScaleApplication {
  const factor = String(uiScale);
  if (hostScaled || uiScale === 1) {
    return { cssZoom: '1', odScale: factor, zoom: null };
  }
  return { cssZoom: factor, odScale: factor, zoom: factor };
}

/**
 * Ask the desktop shell to scale its own web contents, and report whether
 * the request was delivered.
 *
 * Feature-detected rather than assumed: the namespace is optional on the
 * bridge, absent in a browser, and absent on a host build that predates it.
 * A throw is treated as "not delivered" so a host that refuses cannot take
 * down the layout effect that applies the whole saved appearance at boot.
 */
function requestHostUiScale(factor: number): boolean {
  const uiScale = getOpenDesignHost()?.uiScale;
  if (uiScale == null) return false;
  try {
    uiScale.set(factor);
    return true;
  } catch {
    return false;
  }
}

/**
 * Apply seed, density, UI scale and typography to `<html>`.
 *
 * Everything is written as an attribute or a custom property the token
 * sheet already reads — `--od-scale` included, which the sheet now consumes
 * as the default source of `--od-css-zoom` rather than declaring and
 * ignoring.
 */
export function applyAppearancePreferencesToDocument(prefs: AppearancePreferences): void {
  const root = document.documentElement;
  const normalized = normalizeAppearancePreferences(prefs);

  if (normalized.seed === 'sunset') {
    // The baseline seed is the `:root` block; it has no selector of its own.
    root.removeAttribute('data-seed');
  } else {
    root.setAttribute('data-seed', normalized.seed);
  }

  if (normalized.density === 'default') {
    root.removeAttribute('data-density');
  } else {
    root.setAttribute('data-density', normalized.density);
  }

  const scale = uiScaleApplication(normalized.uiScale, requestHostUiScale(normalized.uiScale));
  root.style.setProperty('--od-scale', scale.odScale);
  // Written even at 1, never removed: the sheet's own fallback for this
  // property is `var(--od-scale)`, which is right for a browser that has to
  // scale itself and exactly wrong for a host that already did. An explicit
  // value leaves no case where the two disagree.
  root.style.setProperty('--od-css-zoom', scale.cssZoom);
  if (scale.zoom === null) {
    root.style.removeProperty('zoom');
  } else {
    root.style.setProperty('zoom', scale.zoom);
  }

  const stack = FONT_STACKS[normalized.typography.fontStackId];
  if (stack.value === null) {
    root.style.removeProperty('--md-ref-typeface-plain');
  } else {
    // `--md-ref-typeface-brand` is declared as `var(--md-ref-typeface-plain)`
    // and `--sans` in tokens.css reads the same one, so overriding this single
    // property re-faces every typescale role and the body copy at once.
    root.style.setProperty('--md-ref-typeface-plain', stack.value);
  }

  root.style.setProperty('--od-ui-font-size', `${normalized.typography.fontSizePx}px`);
  root.style.setProperty('--od-ui-font-weight', String(normalized.typography.fontWeight));
  root.style.setProperty('--od-ui-line-height', String(normalized.typography.lineHeight));
  root.style.setProperty(
    '--od-ui-letter-spacing',
    normalized.typography.letterSpacingEm === 0
      ? 'normal'
      : `${normalized.typography.letterSpacingEm}em`,
  );
}

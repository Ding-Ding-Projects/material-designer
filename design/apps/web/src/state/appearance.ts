import { getOpenDesignHost, hasAcknowledgedAppearanceThemeBridge } from '@open-design/host';
import type { OpenDesignHostActionResult } from '@open-design/host';

import type { AppTheme } from '../types';

export const FORCED_APP_THEME = 'light' as const;

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
  '#353535',
  '#202020',
  '#848484',
  '#87ea5c',
  '#0d5400',
  '#1a74ff',
  '#ffba12',
  '#ff7528',
  '#f04142',
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
    '--accent-strong': `color-mix(in srgb, ${accentColor} 82%, var(--text-strong))`,
    '--accent-soft': `color-mix(in srgb, ${accentColor} 12%, var(--bg-subtle))`,
    '--accent-tint': `color-mix(in srgb, ${accentColor} 6%, var(--bg-panel))`,
    '--accent-hover': `color-mix(in srgb, ${accentColor} 86%, var(--text-strong))`,
  };
}

/**
 * Resolve a persisted theme without allowing malformed values to leak into
 * the document or the native shell. `system` is represented by the absence of
 * `data-theme`, which lets the stylesheet's media queries choose the palette.
 */
export function resolveAppTheme(persisted?: AppTheme | null): AppTheme {
  return persisted === 'light' || persisted === 'dark' || persisted === 'system'
    ? persisted
    : 'system';
}

export type AppearanceHostSyncResult =
  | { ok: true; host: 'desktop' | 'web' }
  | { ok: false; host: 'desktop'; reason: string };

const APPEARANCE_HOST_ACK_TIMEOUT_MS = 1500;
const pendingAppearanceThemeSyncs = new Map<
  AppTheme,
  Promise<AppearanceHostSyncResult>
>();

function isSuccessfulHostAction(value: unknown): value is { ok: true } {
  return typeof value === 'object' && value != null && (value as { ok?: unknown }).ok === true;
}

/**
 * Ask the optional native shell to accept the resolved theme.
 *
 * The DOM is deliberately handled by `applyAppearanceToDocument` before this
 * promise is awaited. A browser/web build therefore keeps applying its local
 * theme even when a malformed or throwing optional host is present. Desktop
 * startup uses the result as its second half of the mounted witness and gets
 * a bounded, truthful failure instead of waiting forever on an IPC promise.
 */
export function syncAppearanceThemeWithHost(theme: AppTheme): Promise<AppearanceHostSyncResult> {
  const pending = pendingAppearanceThemeSyncs.get(theme);
  if (pending) return pending;

  const request = (async (): Promise<AppearanceHostSyncResult> => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    try {
      const host = getOpenDesignHost();
      const appearance = host?.appearance;
      if (appearance == null) return { ok: true, host: 'web' };
      if (!hasAcknowledgedAppearanceThemeBridge(host)) {
        return {
          ok: false,
          host: 'desktop',
          reason: 'native appearance host does not advertise acknowledged theme support',
        };
      }

      const result: unknown = await Promise.race<OpenDesignHostActionResult | { ok: false; reason: string }>([
        Promise.resolve().then(() => appearance.setTheme(theme)),
        new Promise<{ ok: false; reason: string }>((resolve) => {
          timeout = setTimeout(
            () => resolve({ ok: false, reason: 'native appearance acknowledgement timed out' }),
            APPEARANCE_HOST_ACK_TIMEOUT_MS,
          );
        }),
      ]);
      if (isSuccessfulHostAction(result)) return { ok: true, host: 'desktop' };
      const reason =
        typeof result === 'object'
        && result !== null
        && 'reason' in result
        && typeof result.reason === 'string'
        && result.reason.trim()
          ? result.reason
          : null;
      return {
        ok: false,
        host: 'desktop',
        reason: reason ?? 'native appearance host rejected the theme',
      };
    } catch (error) {
      return {
        ok: false,
        host: 'desktop',
        reason: error instanceof Error ? error.message : String(error),
      };
    } finally {
      if (timeout != null) clearTimeout(timeout);
    }
  })();
  pendingAppearanceThemeSyncs.set(theme, request);
  void request.finally(() => {
    if (pendingAppearanceThemeSyncs.get(theme) === request) {
      pendingAppearanceThemeSyncs.delete(theme);
    }
  }).catch(() => undefined);
  return request;
}

export function applyAppearanceToDocument({
  theme,
  accentColor,
}: {
  theme?: AppTheme;
  accentColor?: string;
}): void {
  const root = document.documentElement;
  const resolvedTheme = resolveAppTheme(theme);
  if (resolvedTheme === 'light' || resolvedTheme === 'dark') {
    root.setAttribute('data-theme', resolvedTheme);
  } else {
    root.removeAttribute('data-theme');
  }
  // Desktop shell: keep the native window appearance (the macOS vibrancy
  // glass material) in step with the app theme. Without this the glass
  // follows the OS appearance, so the light app over a dark OS sat on dark
  // glass and read as a muddy gray (#94). Feature-detected — browsers and
  // older host builds have no appearance capability.
  // Optional host compatibility must never prevent local DOM styling. The
  // startup witness calls `syncAppearanceThemeWithHost` separately and waits
  // for its validated acknowledgement; ordinary theme changes stay best
  // effort and deliberately cannot create an unhandled rejection.
  void syncAppearanceThemeWithHost(resolvedTheme);

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
  /**
   * Whether `uiScale` is chosen by the window rather than by the user.
   *
   * A derived scale rather than a second one: when this is on, the runtime
   * keeps writing the fitted factor into `uiScale` itself, so the status
   * bar readout, the preset comparison, the export file and the stored
   * entry all keep describing the scale that is actually on screen. The
   * alternative — an `autoFitScale` living beside `uiScale` — gives two
   * numbers that disagree the moment the window is resized, and every
   * reader has to know which of them is the real one.
   */
  autoFit: boolean;
  typography: AppearanceTypography;
}

export const MIN_UI_SCALE = 0.5;
export const MAX_UI_SCALE = 2;
export const MIN_FONT_SIZE_PX = 10;
export const MAX_FONT_SIZE_PX = 22;

/**
 * The slider's granularity, as a factor rather than a percentage.
 *
 * 0.05 is the mockup's five-point step, and auto-fit quantizes to the same
 * grid on purpose: a continuous fit would rewrite the stored scale on every
 * pixel of a drag-resize, and the status bar would flicker through numbers
 * nobody asked for.
 */
export const UI_SCALE_STEP = 0.05;

/**
 * The width the layout was designed against, which is what "fit" means.
 *
 * 1440 is the mockup's own `$preview` width, so scale 1 is the size the
 * surfaces were drawn at rather than a number chosen here.
 */
export const AUTO_FIT_REFERENCE_WIDTH = 1440;

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
  autoFit: false,
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
    // Strictly `=== true`, like `smallCaps` and `glow` above: a payload
    // carrying the string "false" must not read as on.
    autoFit: raw.autoFit === true,
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
 * Round a factor onto the slider's grid and hold it inside the range.
 *
 * Exported because auto-fit and the slider must land on the *same* set of
 * values: if the fit produced 1.0733 and the slider only speaks in
 * twentieths, turning auto-fit off would jump the UI on the first drag and
 * the readout would disagree with the thumb until it did.
 */
export function quantizeUiScale(value: number): number {
  if (!Number.isFinite(value)) return 1;
  const stepped = Math.round(value / UI_SCALE_STEP) * UI_SCALE_STEP;
  // Two decimals: 0.05 is not exactly representable in binary floating
  // point, so `7 * 0.05` is 0.35000000000000003 and would be stored,
  // exported and compared against a preset's clean 0.35 as a different
  // number for the rest of its life.
  const rounded = Math.round(stepped * 100) / 100;
  if (rounded < MIN_UI_SCALE) return MIN_UI_SCALE;
  if (rounded > MAX_UI_SCALE) return MAX_UI_SCALE;
  return rounded;
}

/**
 * The window's own width, recovered from the layout viewport.
 *
 * Auto-fit has to measure the thing it is about to change, which is the
 * loop this function exists to break. Whichever mechanism carried the last
 * scale, the *window* did not move — so the fit is computed from a width
 * that scaling cannot alter, and setting a new scale cannot feed back into
 * the next measurement.
 *
 *   * Host scaling (and scale 1) divide the layout viewport by the factor,
 *     so the window is `layout × factor`.
 *   * The CSS `zoom` fallback leaves the layout viewport alone and only
 *     magnifies the paint, so the window IS the layout width.
 *
 * `cssZoom` is the discriminator because it is exactly what
 * `uiScaleApplication` writes for the two cases: `1` when CSS is scaling
 * nothing, and the factor itself when CSS is carrying it.
 */
export function unscaledViewportWidth(
  layoutWidthPx: number,
  cssZoom: number,
  odScale: number,
): number {
  if (!Number.isFinite(layoutWidthPx) || layoutWidthPx <= 0) return 0;
  if (Number.isFinite(cssZoom) && cssZoom !== 1) return layoutWidthPx;
  return layoutWidthPx * (Number.isFinite(odScale) && odScale > 0 ? odScale : 1);
}

/** The scale that makes `AUTO_FIT_REFERENCE_WIDTH` fit the window. */
export function autoFitUiScale(unscaledWidthPx: number): number {
  if (!Number.isFinite(unscaledWidthPx) || unscaledWidthPx <= 0) return 1;
  return quantizeUiScale(unscaledWidthPx / AUTO_FIT_REFERENCE_WIDTH);
}

/**
 * Measure the live document, then fit.
 *
 * Reads the two custom properties `applyAppearancePreferencesToDocument`
 * wrote rather than re-deriving them, so the measurement describes the
 * scaling that is actually applied — including on a host build that
 * refused the request and fell back to CSS.
 */
export function measureAutoFitUiScale(): number {
  if (typeof document === 'undefined') return 1;
  const root = document.documentElement;
  const cssZoom = Number(root.style.getPropertyValue('--od-css-zoom') || '1');
  const odScale = Number(root.style.getPropertyValue('--od-scale') || '1');
  return autoFitUiScale(unscaledViewportWidth(root.clientWidth, cssZoom, odScale));
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

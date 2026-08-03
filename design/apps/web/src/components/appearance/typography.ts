// Which typography properties this platform can actually honour.
//
// The rule this table exists to serve: a property the platform cannot
// support stays VISIBLE, with an explanation, and keeps whatever the user
// saved. The tempting alternative — hide the control, or drop the value on
// save — produces the two worst outcomes available. Hiding it makes the
// editor look like it was never finished; dropping the value makes a
// preset file lossy, so exporting a theme on a machine that cannot do
// small caps and importing it on one that can loses a setting that was
// never the exporting machine's to discard.
//
// So storage (`state/appearance.ts`) never asks whether a property is
// supported; it just keeps it. This module answers "can it be honoured
// here", the editor renders the answer beside the control, and
// `applyAppearancePreferencesToDocument` writes only the supported ones.

import { FONT_STACKS, type AppearanceTypography, type FontStackId } from '../../state/appearance';

/** Properties the editor exposes, supported or not. */
export type TypographyPropertyId =
  | 'fontStackId'
  | 'fontSizePx'
  | 'fontWeight'
  | 'lineHeight'
  | 'letterSpacingEm'
  | 'opticalSize'
  | 'grade'
  | 'smallCaps'
  | 'glow';

export type TypographySupport =
  /** Applied to the live UI. */
  | 'applied'
  /** Stored and exported, but nothing on screen changes. */
  | 'unsupported';

/**
 * The reason an unsupported property cannot be honoured, as a token the
 * component turns into copy. Each is a different kind of "no", and saying
 * which one it is turns a dead control into an explanation:
 *
 *   `no-variable-font` — the app bundles no font binaries at all, so no
 *     face here declares a variable axis to drive. If a variable face is
 *     bundled later this becomes `applied` and the saved value starts
 *     doing something, which is precisely why the value is kept.
 *   `cjk-unsafe`      — the property is real CSS that renders badly or not
 *     at all for the scripts this UI ships in.
 *   `contrast-unsafe` — refused on purpose rather than unavailable. Text
 *     shadow behind UI chrome defeats the contrast rules the rest of the
 *     product is held to, so the editor declines to write it.
 */
export type UnsupportedReason = 'no-variable-font' | 'cjk-unsafe' | 'contrast-unsafe';

export interface TypographyPropertyInfo {
  id: TypographyPropertyId;
  support: TypographySupport;
  reason?: UnsupportedReason;
}

export const TYPOGRAPHY_SUPPORT: Record<TypographyPropertyId, TypographyPropertyInfo> = {
  fontStackId: { id: 'fontStackId', support: 'applied' },
  fontSizePx: { id: 'fontSizePx', support: 'applied' },
  fontWeight: { id: 'fontWeight', support: 'applied' },
  lineHeight: { id: 'lineHeight', support: 'applied' },
  letterSpacingEm: { id: 'letterSpacingEm', support: 'applied' },
  opticalSize: { id: 'opticalSize', support: 'unsupported', reason: 'no-variable-font' },
  grade: { id: 'grade', support: 'unsupported', reason: 'no-variable-font' },
  smallCaps: { id: 'smallCaps', support: 'unsupported', reason: 'cjk-unsafe' },
  glow: { id: 'glow', support: 'unsupported', reason: 'contrast-unsafe' },
};

export const UNSUPPORTED_TYPOGRAPHY_PROPERTIES: readonly TypographyPropertyId[] = (
  Object.keys(TYPOGRAPHY_SUPPORT) as TypographyPropertyId[]
).filter((id) => TYPOGRAPHY_SUPPORT[id].support === 'unsupported');

/**
 * Whether the first family in a stack is present on this machine.
 *
 * `null` means "cannot tell" — `document.fonts` is absent in a test
 * environment and in older engines — and the preview says "cannot tell"
 * rather than guessing, because the two wrong answers are equally bad: a
 * claim the face is there when the user is looking at a fallback, or a
 * claim it is missing when it is rendering perfectly.
 */
export function isFaceAvailable(stackId: FontStackId): boolean | null {
  const probe = FONT_STACKS[stackId].probeFamily;
  if (!probe) return null;
  if (typeof document === 'undefined') return null;
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (!fonts || typeof fonts.check !== 'function') return null;
  try {
    // A size is mandatory in the shorthand; `12px` is arbitrary and does
    // not affect the answer. Quoting keeps multi-word families valid.
    return fonts.check(`12px "${probe}"`);
  } catch {
    return null;
  }
}

/**
 * The inline style for a live per-typeface preview.
 *
 * The preview deliberately renders in the stack it is offering rather than
 * in a picture of it, so what the user sees in the list is what the UI
 * becomes. `default` has no stack of its own — it is the token sheet's
 * value — so the preview inherits, which is exactly right.
 */
export function previewStyleFor(stackId: FontStackId): { fontFamily?: string } {
  const value = FONT_STACKS[stackId].value;
  return value === null ? {} : { fontFamily: value };
}

/** The sample the preview renders: Latin and CJK, so the tail is visible too. */
export const TYPEFACE_PREVIEW_SAMPLE = 'Aa Bb Cc 123 — 廣東話 早晨';

/**
 * A one-line summary of the typography, for the preset list.
 *
 * Reads the stored values, not the applied ones, so a preset saved with an
 * unsupported property still describes itself completely.
 */
export function summarizeTypography(typography: AppearanceTypography): string {
  const parts = [
    `${typography.fontSizePx}px`,
    `w${typography.fontWeight}`,
    `×${typography.lineHeight}`,
  ];
  return parts.join(' · ');
}

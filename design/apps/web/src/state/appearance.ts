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

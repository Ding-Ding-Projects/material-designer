/** The only appearance values the renderer may forward to nativeTheme. */
export const DESKTOP_APPEARANCE_THEMES = ['system', 'light', 'dark'] as const;

export type DesktopAppearanceTheme = (typeof DESKTOP_APPEARANCE_THEMES)[number];

export function parseDesktopAppearanceTheme(value: unknown): DesktopAppearanceTheme | null {
  return typeof value === 'string'
    && (DESKTOP_APPEARANCE_THEMES as readonly string[]).includes(value)
    ? value as DesktopAppearanceTheme
    : null;
}

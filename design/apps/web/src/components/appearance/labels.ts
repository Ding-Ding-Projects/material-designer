// The names the appearance contract's values are called on screen.
//
// A module of its own, and not three `const`s inside `AppearanceControls`,
// because there are two surfaces that render these choices now: the editor in
// Settings · Appearance, and the live rows the command palette draws for the
// same settings. Two copies of "which key names the `lime` seed" is two places
// for the same word to drift, and the drift would be invisible — both surfaces
// would keep rendering *a* label, just not the same one.
//
// Typed against `Dict`, so renaming a key fails typecheck here rather than
// printing the key name at the user.

import type { Dict } from '../../i18n/types';
import type { AppearanceDensity, AppearanceSeed, FontStackId } from '../../state/appearance';

/**
 * The seed labels reuse the built-in presets' names.
 *
 * Not a shortcut to avoid four translation keys: the four colour presets ARE
 * these four seeds, named after them, so two key sets would be two places for
 * the same word to be translated differently and drift.
 */
export const SEED_LABEL_KEY: Record<AppearanceSeed, keyof Dict> = {
  sunset: 'appearance.preset.sunset',
  violet: 'appearance.preset.violet',
  teal: 'appearance.preset.teal',
  lime: 'appearance.preset.lime',
};

export const DENSITY_LABEL_KEY: Record<AppearanceDensity, keyof Dict> = {
  compact: 'statusBar.densityCompact',
  default: 'statusBar.densityDefault',
  comfortable: 'statusBar.densityComfortable',
};

export const FONT_LABEL_KEY: Record<FontStackId, keyof Dict> = {
  'default': 'appearance.font.default',
  'system': 'appearance.font.system',
  'grotesque': 'appearance.font.grotesque',
  'humanist': 'appearance.font.humanist',
  'serif': 'appearance.font.serif',
  'mono': 'appearance.font.mono',
};

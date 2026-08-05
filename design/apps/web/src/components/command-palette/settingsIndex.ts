// A hand-authored index of everything Settings contains.
//
// Hand-authored, because the alternative does not exist: `SettingsDialog.tsx`
// renders nineteen sections as nineteen bespoke JSX trees, and there is no
// declarative table to walk. So this file is the table, written once, and the
// risk it carries is drift — a section added to `SettingsSection` next month
// that nobody indexes, leaving a setting the palette swears does not exist.
//
// Two guards, at two different times:
//
//   compile time — `SETTINGS_SECTION_TOKENS` is a `Record<SettingsSection, true>`.
//                  A new token that is not listed fails typecheck here; a token
//                  listed that no longer exists fails too.
//   test time    — `tests/components/CommandPalette.settings-index.test.ts`
//                  asserts every token in that record has at least one entry
//                  below. The record can be kept exhaustive by rote; that test
//                  is what makes someone actually write the index entry.
//
// The index is deliberately not exhaustive over every *option* in the product
// (there are hundreds of BYOK fields alone). It covers every section, plus the
// options a user is likely to go looking for by name — and every entry that
// carries a `control` renders that control live in the palette, so those rows
// are not links to a setting, they are the setting.

import type { Dict } from '../../i18n/types';
import type { SettingsSection } from '../SettingsDialog';

/**
 * The live controls the palette knows how to render inline. Adding one here
 * means adding a case to `SettingRowControl` in `CommandPalette.tsx`; the union
 * is what makes that a typecheck error rather than a silently missing control.
 */
export type SettingsControlId =
  | 'appearance.theme'
  | 'appearance.accent'
  | 'appearance.seed'
  | 'appearance.density'
  | 'appearance.uiScale'
  | 'appearance.autoFit'
  | 'appearance.fontFamily'
  | 'appearance.fontSize'
  | 'appearance.fontWeight'
  | 'appearance.lineHeight'
  | 'appearance.letterSpacing'
  | 'instructions.customInstructions'
  | 'language.locale'
  | 'language.mode'
  | 'language.funnyEn'
  | 'language.funnyZhHk'
  | 'narrator.enable'
  | 'narrator.language'
  | 'notifications.sound'
  | 'notifications.desktop'
  | 'pet.enabled'
  | 'privacy.metrics';

export interface SettingsIndexEntry {
  /**
   * Stable id. Doubles as the reveal anchor: `SettingsDialog` renders
   * `data-od-setting="<id>"` on the control this entry describes, and the
   * palette scrolls to that node and flashes it after opening the section.
   * Entries that describe a whole section anchor on `section:<token>`, which
   * the dialog stamps on its content container for every section at once.
   */
  id: string;
  section: SettingsSection;
  titleKey: keyof Dict;
  hintKey?: keyof Dict;
  /**
   * Untranslated search aliases. They are matched alongside the translated
   * title so "dark mode" finds Appearance in every locale — a user who knows
   * the English word for a setting should not have to know its translation.
   */
  keywords: readonly string[];
  /** Present when this row IS the setting rather than a link to it. */
  control?: SettingsControlId;
}

/**
 * Every `SettingsSection` token, exhaustively. Written as a record rather than
 * an array so the type checker enforces both directions — no missing token, no
 * token that no longer exists.
 */
export const SETTINGS_SECTION_TOKENS: Record<SettingsSection, true> = {
  execution: true,
  instructions: true,
  media: true,
  composio: true,
  orbit: true,
  routines: true,
  integrations: true,
  mcpClient: true,
  language: true,
  appearance: true,
  narrator: true,
  critiqueTheater: true,
  notifications: true,
  pet: true,
  designSystems: true,
  projectLocations: true,
  memory: true,
  privacy: true,
  library: true,
  about: true,
};

export function settingsSectionTokens(): SettingsSection[] {
  return Object.keys(SETTINGS_SECTION_TOKENS) as SettingsSection[];
}

/** The anchor a whole-section entry points at. */
export function sectionAnchorFor(section: SettingsSection): string {
  return `section:${section}`;
}

export const SETTINGS_INDEX: readonly SettingsIndexEntry[] = [
  {
    id: sectionAnchorFor('execution'),
    section: 'execution',
    titleKey: 'settings.title',
    hintKey: 'settings.subtitle',
    keywords: ['execution', 'agent', 'model', 'cli', 'byok', 'api key', 'provider'],
  },
  {
    id: sectionAnchorFor('instructions'),
    section: 'instructions',
    titleKey: 'settings.instructionsTitle',
    hintKey: 'settings.instructionsSubtitle',
    keywords: ['instructions', 'rules', 'system prompt'],
  },
  {
    id: 'instructions.customInstructions',
    section: 'instructions',
    titleKey: 'settings.customInstructionsTitle',
    hintKey: 'settings.customInstructionsDesc',
    keywords: ['custom instructions', 'prompt', 'rules'],
    control: 'instructions.customInstructions',
  },
  {
    id: sectionAnchorFor('media'),
    section: 'media',
    titleKey: 'settings.mediaProviders',
    hintKey: 'settings.mediaProvidersHint',
    keywords: ['media', 'image', 'video', 'speech', 'provider'],
  },
  {
    id: sectionAnchorFor('composio'),
    section: 'composio',
    titleKey: 'connectors.title',
    hintKey: 'connectors.subtitle',
    keywords: ['connectors', 'composio', 'integrations'],
  },
  {
    id: sectionAnchorFor('orbit'),
    section: 'orbit',
    titleKey: 'settings.orbit.title',
    hintKey: 'settings.orbit.lede',
    keywords: ['orbit', 'briefing', 'daily'],
  },
  {
    id: sectionAnchorFor('routines'),
    section: 'routines',
    titleKey: 'routines.title',
    hintKey: 'routines.subtitle',
    keywords: ['routines', 'automations', 'schedule'],
  },
  {
    id: sectionAnchorFor('integrations'),
    section: 'integrations',
    titleKey: 'settings.mcpServerTitle',
    hintKey: 'settings.mcpServerHint',
    keywords: ['mcp server', 'use everywhere', 'integrations'],
  },
  {
    id: sectionAnchorFor('mcpClient'),
    section: 'mcpClient',
    titleKey: 'settings.externalMcpTitle',
    hintKey: 'settings.externalMcpHint',
    keywords: ['mcp', 'external', 'client', 'tools'],
  },
  {
    id: sectionAnchorFor('language'),
    section: 'language',
    titleKey: 'settings.language',
    hintKey: 'settings.languageHint',
    keywords: ['language', 'locale', 'translation'],
  },
  {
    id: 'language.locale',
    section: 'language',
    titleKey: 'settings.language',
    hintKey: 'settings.languageHint',
    keywords: ['language', 'locale', 'english', 'cantonese', 'chinese'],
    control: 'language.locale',
  },
  {
    id: 'language.mode',
    section: 'language',
    titleKey: 'settings.languageModeTitle',
    hintKey: 'settings.languageModeHint',
    keywords: ['bilingual', 'language mode', 'both'],
    control: 'language.mode',
  },
  {
    id: 'language.funnyEn',
    section: 'language',
    titleKey: 'settings.funnyEnglishLabel',
    hintKey: 'settings.funnyHint',
    keywords: ['funny', 'humour', 'humor', 'tone', 'english'],
    control: 'language.funnyEn',
  },
  {
    id: 'language.funnyZhHk',
    section: 'language',
    titleKey: 'settings.funnyCantoneseLabel',
    hintKey: 'settings.funnyHint',
    keywords: ['funny', 'humour', 'humor', 'tone', 'cantonese'],
    control: 'language.funnyZhHk',
  },
  {
    id: sectionAnchorFor('appearance'),
    section: 'appearance',
    titleKey: 'settings.appearance',
    hintKey: 'settings.appearanceHint',
    keywords: ['appearance', 'theme', 'colour', 'color'],
  },
  {
    id: 'appearance.theme',
    section: 'appearance',
    titleKey: 'settings.appearance',
    hintKey: 'settings.appearanceHint',
    keywords: ['theme', 'dark mode', 'light mode', 'system'],
    control: 'appearance.theme',
  },
  {
    id: 'appearance.accent',
    section: 'appearance',
    titleKey: 'pet.fieldAccent',
    keywords: ['accent', 'colour', 'color', 'swatch'],
    control: 'appearance.accent',
  },
  // The runtime controls. Every one of these writes through
  // `useAppearancePreferences`, which is the same store `AppearanceControls`
  // writes through — one value, two surfaces, so a seed picked here IS the
  // seed, persisted and applied to the document in the same call.
  {
    id: 'appearance.seed',
    section: 'appearance',
    titleKey: 'appearance.seedLabel',
    hintKey: 'appearance.seedHint',
    keywords: ['seed', 'palette', 'colour', 'color', 'sunset', 'violet', 'teal', 'lime'],
    control: 'appearance.seed',
  },
  {
    id: 'appearance.density',
    section: 'appearance',
    titleKey: 'appearance.densityLabel',
    keywords: ['density', 'compact', 'comfortable', 'spacing', 'padding'],
    control: 'appearance.density',
  },
  {
    id: 'appearance.uiScale',
    section: 'appearance',
    titleKey: 'appearance.uiScaleLabel',
    keywords: ['ui scale', 'zoom', 'bigger', 'smaller', 'percent'],
    control: 'appearance.uiScale',
  },
  {
    id: 'appearance.autoFit',
    section: 'appearance',
    titleKey: 'appearance.autoFit',
    hintKey: 'appearance.autoFitHint',
    keywords: ['auto fit', 'autofit', 'fit to window', 'responsive'],
    control: 'appearance.autoFit',
  },
  {
    // Deliberately still a reveal anchor. This entry names the typography
    // CARD — a face list plus eight properties — and no single inline
    // control can be "the typography setting". The properties it holds are
    // indexed individually below and each of those IS live; a row here
    // would have to pick one of them and call it the whole card.
    id: 'appearance.typography',
    section: 'appearance',
    titleKey: 'appearance.typography',
    hintKey: 'appearance.typographyHint',
    keywords: ['typography', 'font', 'typeface', 'text size', 'weight', 'line height'],
  },
  {
    id: 'appearance.fontFamily',
    section: 'appearance',
    titleKey: 'appearance.fontFamily',
    keywords: ['font', 'family', 'typeface', 'serif', 'mono', 'cjk'],
    control: 'appearance.fontFamily',
  },
  {
    id: 'appearance.fontSize',
    section: 'appearance',
    titleKey: 'appearance.fontSize',
    keywords: ['font size', 'text size', 'bigger text', 'smaller text', 'px'],
    control: 'appearance.fontSize',
  },
  {
    id: 'appearance.fontWeight',
    section: 'appearance',
    titleKey: 'appearance.fontWeight',
    keywords: ['font weight', 'bold', 'light', 'regular'],
    control: 'appearance.fontWeight',
  },
  {
    id: 'appearance.lineHeight',
    section: 'appearance',
    titleKey: 'appearance.lineHeight',
    keywords: ['line height', 'leading', 'line spacing'],
    control: 'appearance.lineHeight',
  },
  {
    id: 'appearance.letterSpacing',
    section: 'appearance',
    titleKey: 'appearance.letterSpacing',
    keywords: ['letter spacing', 'tracking', 'em'],
    control: 'appearance.letterSpacing',
  },
  {
    id: sectionAnchorFor('narrator'),
    section: 'narrator',
    titleKey: 'narrator.title',
    hintKey: 'narrator.hint',
    keywords: ['narrator', 'speech', 'spoken', 'voice', 'tts', 'read aloud', 'cantonese'],
  },
  {
    id: 'narrator.enable',
    section: 'narrator',
    titleKey: 'narrator.enable',
    hintKey: 'narrator.enableHint',
    keywords: ['narrator', 'speak', 'voice', 'off', 'on'],
    control: 'narrator.enable',
  },
  {
    id: 'narrator.language',
    section: 'narrator',
    titleKey: 'narrator.language',
    hintKey: 'narrator.languageBothHint',
    keywords: ['narrator language', 'spoken language', 'english', 'cantonese', 'both'],
    control: 'narrator.language',
  },
  {
    id: sectionAnchorFor('critiqueTheater'),
    section: 'critiqueTheater',
    titleKey: 'critiqueTheater.settingsNav',
    hintKey: 'critiqueTheater.settingsNavHint',
    keywords: ['critique', 'design review', 'theater', 'theatre'],
  },
  {
    id: sectionAnchorFor('notifications'),
    section: 'notifications',
    titleKey: 'settings.notifications',
    hintKey: 'settings.notificationsHint',
    keywords: ['notifications', 'sound', 'desktop', 'alerts'],
  },
  {
    id: 'notifications.sound',
    section: 'notifications',
    titleKey: 'settings.notifyCompletionSound',
    hintKey: 'settings.notifyCompletionSoundHint',
    keywords: ['sound', 'chime', 'audio', 'completion'],
    control: 'notifications.sound',
  },
  {
    id: 'notifications.desktop',
    section: 'notifications',
    titleKey: 'settings.notifyDesktop',
    hintKey: 'settings.notifyDesktopHint',
    keywords: ['desktop notification', 'banner', 'system notification'],
    control: 'notifications.desktop',
  },
  {
    id: sectionAnchorFor('pet'),
    section: 'pet',
    titleKey: 'pet.title',
    hintKey: 'pet.subtitle',
    keywords: ['pet', 'companion', 'mascot'],
  },
  {
    id: 'pet.enabled',
    section: 'pet',
    titleKey: 'pet.wakeTitle',
    keywords: ['pet', 'wake', 'tuck', 'show pet'],
    control: 'pet.enabled',
  },
  {
    id: sectionAnchorFor('designSystems'),
    section: 'designSystems',
    titleKey: 'settings.designSystems',
    hintKey: 'settings.designSystemsHint',
    keywords: ['design systems', 'brand', 'tokens'],
  },
  {
    id: sectionAnchorFor('projectLocations'),
    section: 'projectLocations',
    titleKey: 'settings.projectLocations',
    hintKey: 'settings.projectLocationsHint',
    keywords: ['project locations', 'folder', 'workspace path'],
  },
  {
    id: sectionAnchorFor('memory'),
    section: 'memory',
    titleKey: 'settings.memory',
    hintKey: 'settings.memoryHint',
    keywords: ['memory', 'profile', 'hooks'],
  },
  {
    id: sectionAnchorFor('privacy'),
    section: 'privacy',
    titleKey: 'settings.privacy',
    hintKey: 'settings.privacyHint',
    keywords: ['privacy', 'telemetry', 'analytics', 'data'],
  },
  {
    id: 'privacy.metrics',
    section: 'privacy',
    titleKey: 'settings.privacyMetrics',
    hintKey: 'settings.privacyMetricsHint',
    keywords: ['telemetry', 'metrics', 'analytics', 'opt out'],
    control: 'privacy.metrics',
  },
  {
    // The one section token with no dialog panel: `library` is opened through
    // the entry shell's own route (see the comment on `SettingsSection`). It is
    // indexed anyway, because a user typing "library" is asking for the surface,
    // not for the implementation detail of which component renders it.
    id: sectionAnchorFor('library'),
    section: 'library',
    titleKey: 'commandPalette.destinationLibrary',
    keywords: ['library', 'assets', 'images'],
  },
  {
    id: sectionAnchorFor('about'),
    section: 'about',
    titleKey: 'settings.about',
    hintKey: 'settings.aboutHint',
    keywords: ['about', 'version', 'update', 'changelog'],
  },
];

/** Entries belonging to one section, in index order. */
export function settingsIndexForSection(section: SettingsSection): SettingsIndexEntry[] {
  return SETTINGS_INDEX.filter((entry) => entry.section === section);
}

/**
 * Section tokens with no index entry. Empty is the only acceptable value; the
 * settings-index test asserts exactly that, and the palette can call it in a
 * development build to fail loudly rather than quietly under-report.
 */
export function unindexedSettingsSections(): SettingsSection[] {
  return settingsSectionTokens().filter(
    (section) => !SETTINGS_INDEX.some((entry) => entry.section === section),
  );
}

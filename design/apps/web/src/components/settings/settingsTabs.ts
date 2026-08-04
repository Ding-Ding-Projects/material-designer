// The settings surface's tab table.
//
// Settings used to render its sections as a seventeen-item scrolling column in
// a left-hand rail — a navigation idiom that appeared nowhere else in the
// product. It is a browser-style tab strip now, and this file is the table the
// strip walks: one entry per tab, in strip order, with the icon and label keys
// that used to be seventeen hand-written JSX buttons inside `SettingsDialog`.
//
// Two guards, deliberately different in kind:
//
//   compile time — `SETTINGS_TAB_DEFS` is a `Record<SettingsSection, … | null>`.
//                  A section token added to `SettingsSection` without a decision
//                  recorded here fails typecheck. `null` is the decision "this
//                  token has no tab", which the three non-panel tokens take.
//   test time    — `tests/components/SettingsDialog.tabs.test.tsx` asserts the
//                  order array and the record agree in both directions. The
//                  record cannot catch a def that exists but was left out of the
//                  order array, because ordering is data the type system has no
//                  opinion about.
//
// This is the third exhaustive map over `SettingsSection` (after `sectionHeader`
// in `SettingsDialog.tsx` and `SETTINGS_SECTION_TOKENS` in `settingsIndex.ts`).
// That is on purpose: three compile errors on a forgotten section is a cheap
// morning, and one silently missing tab is a section nobody can reach.

import type { Dict } from '../../i18n/types';
import type { IconName } from '../Icon';
import type { SettingsSection } from '../SettingsDialog';

export interface SettingsTabDef {
  section: SettingsSection;
  icon: IconName;
  /** The tab's visible label. Kept identical to the old nav item's `<strong>`. */
  titleKey: keyof Dict;
  /** Secondary line. Rendered but visually hidden at the current density. */
  hintKey: keyof Dict;
}

/**
 * Every `SettingsSection`, exhaustively, mapped to its tab or to `null`.
 *
 * The three `null`s are not oversights:
 *   - `orbit` and `routines` have panels in the dialog but are reached from
 *     their own surfaces, not from settings navigation.
 *   - `library` has no panel at all; the entry shell owns that route.
 */
export const SETTINGS_TAB_DEFS: Record<SettingsSection, SettingsTabDef | null> = {
  execution: {
    section: 'execution',
    icon: 'sliders',
    titleKey: 'settings.envConfigure',
    hintKey: 'settings.subtitle',
  },
  instructions: {
    section: 'instructions',
    icon: 'edit',
    titleKey: 'settings.instructionsTitle',
    hintKey: 'settings.instructionsNavSub',
  },
  memory: {
    section: 'memory',
    icon: 'history',
    titleKey: 'settings.memory',
    hintKey: 'settings.memoryHint',
  },
  media: {
    section: 'media',
    icon: 'image',
    titleKey: 'settings.mediaProviders',
    hintKey: 'settings.mediaProvidersHint',
  },
  mcpClient: {
    section: 'mcpClient',
    icon: 'sparkles',
    titleKey: 'settings.externalMcpTitle',
    hintKey: 'settings.externalMcpHint',
  },
  composio: {
    section: 'composio',
    icon: 'sliders',
    titleKey: 'connectors.title',
    hintKey: 'settings.connectorsNavHint',
  },
  integrations: {
    section: 'integrations',
    icon: 'link',
    titleKey: 'settings.mcpServerTitle',
    hintKey: 'settings.mcpServerHint',
  },
  language: {
    section: 'language',
    icon: 'languages',
    titleKey: 'settings.language',
    hintKey: 'settings.languageHint',
  },
  appearance: {
    section: 'appearance',
    icon: 'sun-moon',
    titleKey: 'settings.appearance',
    hintKey: 'settings.appearanceHint',
  },
  narrator: {
    section: 'narrator',
    icon: 'volume',
    titleKey: 'narrator.title',
    hintKey: 'narrator.hint',
  },
  critiqueTheater: {
    section: 'critiqueTheater',
    icon: 'comment',
    titleKey: 'critiqueTheater.settingsNav',
    hintKey: 'critiqueTheater.settingsNavHint',
  },
  notifications: {
    section: 'notifications',
    icon: 'bell',
    titleKey: 'settings.notifications',
    hintKey: 'settings.notificationsHint',
  },
  pet: {
    section: 'pet',
    icon: 'sparkles',
    titleKey: 'pet.navTitle',
    hintKey: 'pet.navHint',
  },
  designSystems: {
    section: 'designSystems',
    icon: 'draw',
    titleKey: 'settings.designSystems',
    hintKey: 'settings.designSystemsHint',
  },
  projectLocations: {
    section: 'projectLocations',
    icon: 'folder',
    titleKey: 'settings.projectLocations',
    hintKey: 'settings.projectLocationsHint',
  },
  privacy: {
    section: 'privacy',
    icon: 'eye',
    titleKey: 'settings.privacy',
    hintKey: 'settings.privacyHint',
  },
  about: {
    section: 'about',
    icon: 'settings',
    titleKey: 'settings.about',
    hintKey: 'settings.aboutHint',
  },
  orbit: null,
  routines: null,
  library: null,
};

/**
 * Strip order, left to right. Deliberately the order the old rail used, so a
 * user who knew where "Appearance" sat does not have to relearn the surface on
 * the same day it changed shape.
 */
export const SETTINGS_TAB_ORDER: readonly SettingsSection[] = [
  'execution',
  'instructions',
  'memory',
  'media',
  'mcpClient',
  'composio',
  'integrations',
  'language',
  'appearance',
  'narrator',
  'critiqueTheater',
  'notifications',
  'pet',
  'designSystems',
  'projectLocations',
  'privacy',
  'about',
];

/** The tabs, in strip order. Never contains a `null` def. */
export const SETTINGS_TABS: readonly SettingsTabDef[] = SETTINGS_TAB_ORDER.map((section) => {
  const def = SETTINGS_TAB_DEFS[section];
  if (!def) {
    // Unreachable while the tabs test holds. Throwing rather than filtering,
    // because a silently shorter strip is exactly the failure the test exists
    // to catch and this would hide it in production.
    throw new Error(`settingsTabs: '${section}' is in SETTINGS_TAB_ORDER but has no tab def`);
  }
  return def;
});

export function settingsTabDef(section: SettingsSection): SettingsTabDef | null {
  return SETTINGS_TAB_DEFS[section];
}

/** Sections the strip shows. Used to keep search results to reachable tabs. */
export function isTabbedSettingsSection(value: unknown): value is SettingsSection {
  return typeof value === 'string' && (SETTINGS_TAB_ORDER as readonly string[]).includes(value);
}

// `App.openSettings` reroutes these three to the Integrations route rather than
// opening the dialog on them. Restoring one of them would therefore send a user
// who just pressed "Settings" somewhere that is not settings, so they are held
// out of persistence in both directions.
const NOT_RESTORABLE: readonly string[] = ['composio', 'mcpClient', 'integrations'];

export function isRestorableSettingsSection(value: unknown): value is SettingsSection {
  return isTabbedSettingsSection(value) && !NOT_RESTORABLE.includes(value);
}

export const SETTINGS_LAST_SECTION_STORAGE_KEY = 'od.settings.lastSection';

/**
 * The tab settings should open on when the caller did not ask for a particular
 * one. Falls back to `execution` for a missing, unreadable, stale or
 * non-restorable value — the tab strip must always have exactly one selection.
 */
export function readLastSettingsSection(): SettingsSection {
  if (typeof window === 'undefined') return 'execution';
  try {
    const stored = window.localStorage.getItem(SETTINGS_LAST_SECTION_STORAGE_KEY);
    return isRestorableSettingsSection(stored) ? stored : 'execution';
  } catch {
    // Private-mode storage: settings still opens, it just forgets the tab.
    return 'execution';
  }
}

export function writeLastSettingsSection(section: SettingsSection): void {
  if (typeof window === 'undefined') return;
  if (!isRestorableSettingsSection(section)) return;
  try {
    window.localStorage.setItem(SETTINGS_LAST_SECTION_STORAGE_KEY, section);
  } catch {
    // Best-effort. A failed write must never stop the tab switch itself.
  }
}

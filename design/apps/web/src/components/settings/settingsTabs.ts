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
 * The one `null` is deliberate: `library` has no panel at all; the entry shell
 * owns that route. Workspace, Orbit and Routines are dialog-owned panels, so
 * palette results can select a real tab with a matching labelled panel.
 */
export const SETTINGS_TAB_DEFS: Record<SettingsSection, SettingsTabDef | null> = {
  execution: {
    section: 'execution',
    icon: 'sliders',
    titleKey: 'settings.envConfigure',
    hintKey: 'settings.subtitle',
  },
  general: {
    section: 'general',
    icon: 'settings',
    titleKey: 'settings.general',
    hintKey: 'settings.generalHint',
  },
  labs: {
    section: 'labs',
    icon: 'sparkles',
    titleKey: 'labs.title',
    hintKey: 'labs.navHint',
  },
  workspace: {
    section: 'workspace',
    icon: 'users',
    titleKey: 'settings.workspace',
    hintKey: 'settings.workspaceHint',
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
  orbit: {
    section: 'orbit',
    icon: 'orbit',
    titleKey: 'settings.orbit.title',
    hintKey: 'settings.orbit.lede',
  },
  routines: {
    section: 'routines',
    icon: 'refresh',
    titleKey: 'routines.title',
    hintKey: 'routines.subtitle',
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
  library: null,
  handoff: {
    section: 'handoff',
    icon: 'layers-filled',
    titleKey: 'handoff.title',
    hintKey: 'handoff.tabHint',
  },
};

/**
 * Section order, top to bottom. The first eleven follow the mockup's settings
 * aside (`mockups/open-design-m3`): Appearance, Language & tone, Execution,
 * Accounts, Cloud & keys, Memory, Notifications, Accessibility, Version
 * history, Changelog, Handoff & tokens — mapped onto the sections this
 * application actually has: `workspace` stands where Accounts is drawn,
 * `media` and `mcpClient` (providers and external MCP keys) where "Cloud &
 * keys" is (this project has no cloud), `narrator` where Accessibility is,
 * and `about` where Version history and Changelog are, because the changelog
 * viewer opens from there and version history is a dialog. Everything this
 * application has beyond the mockup's eleven follows, in the order the old
 * rail used, so nothing a user knew has moved relative to its neighbours.
 * Each mapping is a recorded deviation in the design-parity inventory.
 */
export const SETTINGS_TAB_ORDER: readonly SettingsSection[] = [
  'appearance',
  'language',
  'execution',
  'workspace',
  'media',
  'mcpClient',
  'memory',
  'notifications',
  'narrator',
  'about',
  'handoff',
  'general',
  'labs',
  'instructions',
  'composio',
  'orbit',
  'routines',
  'integrations',
  'critiqueTheater',
  'pet',
  'designSystems',
  'projectLocations',
  'privacy',
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

export function isRestorableSettingsSection(value: unknown): value is SettingsSection {
  // Every visible tab is owned by SettingsDialog, including the three
  // integration sections. Explicit callers select a section directly; a bare
  // Settings open restores whichever visible tab the user last chose. Only
  // `handoff` is excluded: it is its own page, not a panel.
  return isTabbedSettingsSection(value) && value !== 'handoff';
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

// The settings search predicate, away from React.
//
// The thing worth pinning here is not "search finds things" — it is that the
// search finds them in the *palette's* index. If someone ever writes a second
// list of settings for this field, these specs keep passing while the two lists
// drift, so they assert against `SETTINGS_INDEX` itself rather than a fixture.

import { describe, expect, it } from 'vitest';

import { SETTINGS_INDEX } from '../../src/components/command-palette/settingsIndex';
import {
  matchSettingsIndex,
  settingsHitCountsBySection,
  settingsHitsElsewhere,
} from '../../src/components/settings/settingsSearchMatch';
import {
  SETTINGS_TABS,
  SETTINGS_TAB_DEFS,
  SETTINGS_TAB_ORDER,
  isRestorableSettingsSection,
  isTabbedSettingsSection,
} from '../../src/components/settings/settingsTabs';
import { en } from '../../src/i18n/locales/en';
import type { Dict } from '../../src/i18n/types';
import type { SettingsSection } from '../../src/components/SettingsDialog';

function translation(key: keyof Dict): string {
  const value = en[key];
  if (typeof value !== 'string') {
    throw new Error(`English locale is missing required key '${String(key)}'`);
  }
  return value;
}

const translate = (key: keyof Dict): string => translation(key);

const sectionLabel = (section: SettingsSection): string => {
  const def = SETTINGS_TAB_DEFS[section];
  if (!def) return section;
  return translation(def.titleKey);
};

/** The controller's plain-text predicate, reproduced exactly. */
const plainText = (needle: string) => {
  const lowered = needle.trim().toLowerCase();
  return (text: string) => text.toLowerCase().includes(lowered);
};

function search(needle: string, activeSection: SettingsSection = 'execution') {
  return matchSettingsIndex({
    entries: SETTINGS_INDEX,
    matches: plainText(needle),
    translate,
    sectionLabel,
    activeSection,
  });
}

describe('settings tab table', () => {
  it('gives every ordered section a tab def, and every tab def a place in the order', () => {
    for (const section of SETTINGS_TAB_ORDER) {
      expect(SETTINGS_TAB_DEFS[section], `no tab def for '${section}'`).toBeTruthy();
    }
    const defined = (Object.keys(SETTINGS_TAB_DEFS) as SettingsSection[]).filter(
      (section) => SETTINGS_TAB_DEFS[section] !== null,
    );
    expect([...defined].sort()).toEqual([...SETTINGS_TAB_ORDER].sort());
    expect(SETTINGS_TABS).toHaveLength(SETTINGS_TAB_ORDER.length);
  });

  it('holds the one section with no settings panel out of the strip', () => {
    // `orbit` and `routines` do have panels in this dialog and are reachable
    // from the entry settings menu, so they keep their tabs; only `library`
    // has no panel at all.
    expect(SETTINGS_TAB_DEFS.orbit).not.toBeNull();
    expect(SETTINGS_TAB_DEFS.routines).not.toBeNull();
    expect(SETTINGS_TAB_DEFS.library).toBeNull();
    expect(isTabbedSettingsSection('library')).toBe(false);
  });

  it('restores every visible tab, and refuses the page that is not a panel', () => {
    // The integration sections are real, visible tabs of this dialog (see
    // SettingsDialog.tabs "keeps integration sections visible and truthful"),
    // so a bare open may restore them; `handoff` is its own page.
    expect(isRestorableSettingsSection('appearance')).toBe(true);
    expect(isRestorableSettingsSection('composio')).toBe(true);
    expect(isRestorableSettingsSection('mcpClient')).toBe(true);
    expect(isRestorableSettingsSection('integrations')).toBe(true);
    expect(isRestorableSettingsSection('handoff')).toBe(false);
    expect(isRestorableSettingsSection('nonsense')).toBe(false);
  });
});

describe('settings search matching', () => {
  it('matches an untranslated keyword alias from the palette index', () => {
    const hits = search('dark mode');
    expect(hits.map((hit) => hit.entry.id)).toContain('appearance.theme');
  });

  it('matches on the tab name, so a tab name surfaces everything on that tab', () => {
    const hits = search('narrator');
    expect(hits.length).toBeGreaterThan(1);
    expect(hits.every((hit) => hit.section === 'narrator')).toBe(true);
  });

  it('sorts hits on the active tab ahead of hits anywhere else', () => {
    // "language" hits the Language tab, and the narrator's language control.
    const fromNarrator = search('language', 'narrator');
    expect(fromNarrator[0]?.section).toBe('narrator');
    const fromLanguage = search('language', 'language');
    expect(fromLanguage[0]?.section).toBe('language');
  });

  it('counts the hits sitting on a tab other than the one on screen', () => {
    const hits = search('dark mode', 'execution');
    expect(hits).toHaveLength(1);
    expect(settingsHitsElsewhere(hits, 'execution')).toBe(1);
    expect(settingsHitsElsewhere(hits, 'appearance')).toBe(0);
  });

  it('reports per-tab counts for the strip badges', () => {
    const counts = settingsHitCountsBySection(search('narrator'));
    expect(counts.get('narrator')).toBeGreaterThan(0);
    expect(counts.get('privacy')).toBeUndefined();
  });

  it('never returns a hit on a section the strip cannot open', () => {
    // 'routines' and 'orbit' are indexed for the palette but have no tab.
    for (const needle of ['routines', 'orbit', 'library']) {
      for (const hit of search(needle)) {
        expect(isTabbedSettingsSection(hit.section)).toBe(true);
      }
    }
  });

  it('returns nothing when nothing matches, rather than everything', () => {
    expect(search('zzzz-no-such-setting')).toHaveLength(0);
  });
});

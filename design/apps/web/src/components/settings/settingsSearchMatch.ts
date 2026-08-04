// Matching for the settings search bar.
//
// There is exactly one index of what settings contains, and it already exists:
// `command-palette/settingsIndex.ts`. The command palette searches it, so the
// settings search bar searches it too — the same entries, the same title and
// hint keys, the same untranslated keyword aliases. A second index written for
// this field would drift from that one within a release, and the two surfaces
// would then disagree about whether a setting exists.
//
// This module owns only what the palette does not need: which tab a hit sits
// on, and how the hits are ordered relative to the tab the user is looking at.
// The actual text predicate comes from the field's own `RegexSearchController`,
// so plain text stays the default and regex stays an explicit opt-in with no
// second matching implementation to keep in step.

import type { Dict } from '../../i18n/types';
import type { SettingsIndexEntry } from '../command-palette/settingsIndex';
import type { SettingsSection } from '../SettingsDialog';
import { SETTINGS_TAB_ORDER, isTabbedSettingsSection } from './settingsTabs';

export interface SettingsSearchHit {
  entry: SettingsIndexEntry;
  /** Already translated, because the row renders it and the sort compares it. */
  title: string;
  hint: string | null;
  section: SettingsSection;
}

export interface MatchSettingsIndexOptions {
  entries: readonly SettingsIndexEntry[];
  /** The controller's predicate. Never throws; matches everything when idle. */
  matches: (text: string) => boolean;
  translate: (key: keyof Dict) => string;
  /** The tab's visible label, so typing a tab name finds everything on it. */
  sectionLabel: (section: SettingsSection) => string;
  /** Hits on this tab sort first and skip the "on another tab" badge. */
  activeSection: SettingsSection;
}

const TAB_POSITION = new Map<SettingsSection, number>(
  SETTINGS_TAB_ORDER.map((section, index) => [section, index]),
);

/**
 * Every index entry whose title, hint, keyword aliases or tab name satisfies the
 * predicate.
 *
 * Each candidate string is tested on its own rather than concatenated into one
 * haystack. That matters for regex mode and nowhere else: `^theme` should anchor
 * to the start of a field the user can see, not to the start of a joined blob
 * whose seams they cannot.
 */
export function matchSettingsIndex(options: MatchSettingsIndexOptions): SettingsSearchHit[] {
  const { entries, matches, translate, sectionLabel, activeSection } = options;
  const hits: SettingsSearchHit[] = [];

  for (const entry of entries) {
    // Sections with no tab (`orbit`, `routines`, `library`) are reached from
    // their own surfaces. Offering a result that cannot be opened from here
    // is worse than offering none.
    if (!isTabbedSettingsSection(entry.section)) continue;

    const title = translate(entry.titleKey);
    const hint = entry.hintKey ? translate(entry.hintKey) : null;
    const candidates: string[] = [title, sectionLabel(entry.section), ...entry.keywords];
    if (hint) candidates.push(hint);

    if (!candidates.some((candidate) => matches(candidate))) continue;
    hits.push({ entry, title, hint, section: entry.section });
  }

  return sortSettingsHits(hits, activeSection);
}

/**
 * Hits on the active tab first, then the rest in strip order. Within a tab the
 * index's own order is preserved, which puts the whole-section entry above the
 * individual controls that live under it.
 */
export function sortSettingsHits(
  hits: readonly SettingsSearchHit[],
  activeSection: SettingsSection,
): SettingsSearchHit[] {
  const rank = (section: SettingsSection): number => {
    if (section === activeSection) return -1;
    return TAB_POSITION.get(section) ?? Number.MAX_SAFE_INTEGER;
  };
  return hits
    .map((hit, index) => ({ hit, index }))
    .sort((a, b) => {
      const delta = rank(a.hit.section) - rank(b.hit.section);
      return delta !== 0 ? delta : a.index - b.index;
    })
    .map(({ hit }) => hit);
}

/** How many hits each tab holds. Drives the per-tab count badges. */
export function settingsHitCountsBySection(
  hits: readonly SettingsSearchHit[],
): Map<SettingsSection, number> {
  const counts = new Map<SettingsSection, number>();
  for (const hit of hits) {
    counts.set(hit.section, (counts.get(hit.section) ?? 0) + 1);
  }
  return counts;
}

/**
 * Hits sitting on a tab other than the one on screen.
 *
 * Reported as a number rather than left for the user to notice, because the
 * whole failure mode of a filtered settings surface is a user concluding a
 * setting does not exist when it is simply one tab over.
 */
export function settingsHitsElsewhere(
  hits: readonly SettingsSearchHit[],
  activeSection: SettingsSection,
): number {
  return hits.reduce((total, hit) => (hit.section === activeSection ? total : total + 1), 0);
}

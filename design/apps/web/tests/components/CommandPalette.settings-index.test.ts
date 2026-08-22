import { describe, expect, it, vi } from 'vitest';

import { en } from '../../src/i18n/locales/en';
import {
  SETTINGS_INDEX,
  SETTINGS_SECTION_TOKENS,
  sectionAnchorFor,
  settingsIndexForSection,
  settingsSectionTokens,
  unindexedSettingsSections,
} from '../../src/components/command-palette/settingsIndex';
import {
  PALETTE_SCOPES,
  buildPaletteRows,
  filterPaletteRows,
  parsePaletteQuery,
  paletteRowScope,
  scorePaletteRow,
  type PaletteRegistryContext,
  type PaletteRow,
} from '../../src/components/command-palette/commands';

// The settings index is hand-authored against nineteen bespoke JSX sections.
// `SETTINGS_SECTION_TOKENS` is what stops a new section token from going
// unnoticed at compile time; THIS file is what stops someone from adding the
// token to that record and never writing the index entry. Without it the index
// can drift silently, and a palette that swears a setting does not exist is
// worse than one that never claimed to list everything.

describe('settings index coverage', () => {
  it('gives every settings section token at least one index entry', () => {
    const missing = settingsSectionTokens().filter(
      (section) => settingsIndexForSection(section).length === 0,
    );
    expect(missing).toEqual([]);
  });

  it('agrees with its own drift check', () => {
    expect(unindexedSettingsSections()).toEqual([]);
  });

  it('indexes no section that is not a real token', () => {
    const known = new Set(Object.keys(SETTINGS_SECTION_TOKENS));
    for (const entry of SETTINGS_INDEX) {
      expect(known.has(entry.section)).toBe(true);
    }
  });

  it('gives every entry a unique id', () => {
    const ids = SETTINGS_INDEX.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('names every section with its own section anchor exactly once', () => {
    for (const section of settingsSectionTokens()) {
      const anchors = SETTINGS_INDEX.filter((entry) => entry.id === sectionAnchorFor(section));
      expect(anchors).toHaveLength(1);
    }
  });

  it('points every entry at translation keys that exist', () => {
    for (const entry of SETTINGS_INDEX) {
      const known = Object.prototype.hasOwnProperty.call(en, entry.titleKey);
      expect(
        known,
        `${entry.id} titleKey ${String(entry.titleKey)} is not in the English dictionary`,
      ).toBe(true);
      if (entry.hintKey) {
        expect(
          Object.prototype.hasOwnProperty.call(en, entry.hintKey),
          `${entry.id} hintKey ${String(entry.hintKey)} is not in the English dictionary`,
        ).toBe(true);
      }
    }
  });

  it('wires each live control to exactly one entry', () => {
    const controls = SETTINGS_INDEX
      .map((entry) => entry.control)
      .filter((control): control is NonNullable<typeof control> => control !== undefined);
    expect(new Set(controls).size).toBe(controls.length);
    // A row that IS a setting is the point of the index, not a nice-to-have.
    expect(controls.length).toBeGreaterThan(0);
  });

  it('gives every entry search keywords', () => {
    for (const entry of SETTINGS_INDEX) {
      expect(entry.keywords.length, `${entry.id} has no keywords`).toBeGreaterThan(0);
    }
  });
});

function testContext(overrides: Partial<PaletteRegistryContext> = {}): PaletteRegistryContext {
  return {
    // Return the key itself: this suite is about registry structure, and a
    // translated title would make the assertions depend on English copy.
    t: (key) => String(key),
    openSettingsEntry: vi.fn(),
    goTo: vi.fn(),
    openInNewTab: vi.fn(),
    setScope: vi.fn(),
    toggleFullWindow: vi.fn(),
    fullWindow: false,
    cycleTheme: vi.fn(),
    toggleLanguageMode: vi.fn(),
    ...overrides,
  };
}

describe('command registry', () => {
  it('lists commands, destinations and settings', () => {
    const rows = buildPaletteRows(testContext());
    const kinds = new Set(rows.map((row) => row.kind));
    expect(kinds).toEqual(new Set(['command', 'destination', 'setting']));
  });

  it('gives every row a unique id', () => {
    const ids = buildPaletteRows(testContext()).map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('builds the rows without running any of them', () => {
    const context = testContext();
    buildPaletteRows(context);
    expect(context.goTo).not.toHaveBeenCalled();
    expect(context.openSettingsEntry).not.toHaveBeenCalled();
    expect(context.toggleFullWindow).not.toHaveBeenCalled();
  });

  it('routes a settings row through the reveal-aware opener', () => {
    const context = testContext();
    const row = buildPaletteRows(context).find((candidate) => candidate.kind === 'setting');
    expect(row).toBeDefined();
    row?.run();
    expect(context.openSettingsEntry).toHaveBeenCalledTimes(1);
  });

  it('omits the theme and language commands when no bridge supplies them', () => {
    const rows = buildPaletteRows(
      testContext({ cycleTheme: undefined, toggleLanguageMode: undefined }),
    );
    expect(rows.some((row) => row.id === 'command.cycleTheme')).toBe(false);
    expect(rows.some((row) => row.id === 'command.toggleLanguageMode')).toBe(false);
  });

  it('omits permission-hidden Workspace settings while retaining dialog-owned Orbit and Routines', () => {
    const rows = buildPaletteRows(testContext({ workspaceSettingsVisible: false }));
    expect(rows.some((row) => row.kind === 'setting' && row.entry.section === 'workspace')).toBe(false);
    expect(rows.some((row) => row.kind === 'setting' && row.entry.section === 'orbit')).toBe(true);
    expect(rows.some((row) => row.kind === 'setting' && row.entry.section === 'routines')).toBe(true);
  });
});

describe('palette query parsing', () => {
  it('reads a scope prefix and strips it from the query', () => {
    expect(parsePaletteQuery('>theme')).toEqual({ scope: 'commands', query: 'theme' });
    expect(parsePaletteQuery('@ notif')).toEqual({ scope: 'settings', query: 'notif' });
    expect(parsePaletteQuery('/home')).toEqual({ scope: 'go', query: 'home' });
    expect(parsePaletteQuery('#index')).toEqual({ scope: 'files', query: 'index' });
  });

  it('leaves an unprefixed query alone', () => {
    expect(parsePaletteQuery('theme')).toEqual({ scope: null, query: 'theme' });
    expect(parsePaletteQuery('')).toEqual({ scope: null, query: '' });
  });

  it('declares a prefix for every scope but the default', () => {
    for (const scope of PALETTE_SCOPES) {
      if (scope.id === 'all') expect(scope.prefix).toBeNull();
      else expect(scope.prefix).toHaveLength(1);
    }
    const prefixes = PALETTE_SCOPES.map((scope) => scope.prefix).filter(Boolean);
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });
});

describe('palette filtering', () => {
  const rows = buildPaletteRows(testContext());

  it('narrows to one scope', () => {
    const settings = filterPaletteRows(rows, '', 'settings', 500);
    expect(settings.length).toBeGreaterThan(0);
    expect(settings.every((row) => row.kind === 'setting')).toBe(true);
    expect(filterPaletteRows(rows, '', 'commands', 500)
      .every((row) => paletteRowScope(row) === 'commands')).toBe(true);
  });

  it('finds a setting by an untranslated keyword', () => {
    // "dark mode" is not in any title; it is a keyword on the theme entry, and
    // matching it is what lets a reader of any locale find the setting by the
    // English name they already know.
    const hits = filterPaletteRows(rows, 'dark mode', 'all', 500);
    expect(hits.some((row) => row.id === 'setting:appearance.theme')).toBe(true);
  });

  it('ranks an exact title above a keyword hit', () => {
    const rowLike = (title: string, keywords: string[]): PaletteRow => ({
      kind: 'command',
      id: `probe:${title}`,
      title,
      group: 'probe',
      icon: 'search',
      keywords,
      run: () => {},
    });
    expect(scorePaletteRow(rowLike('telemetry', []), 'telemetry')).toBeGreaterThan(
      scorePaletteRow(rowLike('unrelated', ['telemetry']), 'telemetry'),
    );
  });

  it('returns nothing for a query nothing matches', () => {
    expect(filterPaletteRows(rows, 'zzzz-no-such-row', 'all', 500)).toEqual([]);
  });

  it('keeps registry order for equally scored rows', () => {
    const unfiltered = filterPaletteRows(rows, '', 'all', 500);
    expect(unfiltered.map((row) => row.id)).toEqual(rows.map((row) => row.id));
  });
});

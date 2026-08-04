// The header search field's regex builder is only real if the palette actually
// filters with what it produces. This suite is that proof, at the pure layer:
// no DOM, no palette component, just the registry and the filter it goes
// through — which is the layer that decides what a user sees.

import { describe, expect, it, vi } from 'vitest';

import { createBoundedMatcher } from '../../src/components/regex/evaluate';
import { compilePattern } from '../../src/components/regex/pattern';
import {
  buildPaletteRows,
  filterPaletteRows,
  scorePaletteRowByRegex,
  type PaletteRegexFilter,
  type PaletteRegistryContext,
  type PaletteRow,
} from '../../src/components/command-palette/commands';

function testContext(overrides: Partial<PaletteRegistryContext> = {}): PaletteRegistryContext {
  return {
    // The key itself, so the assertions do not depend on English copy.
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

/** Built exactly the way the palette builds it, so this tests the real path. */
function filterFor(source: string, flags = 'gi'): PaletteRegexFilter {
  const { regex } = compilePattern(source, flags);
  if (!regex) throw new Error(`test pattern did not compile: /${source}/${flags}`);
  const bounded = createBoundedMatcher(regex);
  return { source, flags, matches: (text: string) => bounded.test(text) };
}

const rows = buildPaletteRows(testContext());

function probe(title: string, keywords: string[] = [], hint?: string): PaletteRow {
  return {
    kind: 'command',
    id: `probe:${title}`,
    title,
    hint,
    group: 'probe',
    icon: 'search',
    keywords,
    run: () => {},
  };
}

describe('filterPaletteRows — plain text is untouched', () => {
  it('behaves identically when no pattern is handed in', () => {
    expect(filterPaletteRows(rows, 'dark mode', 'all', 500)).toEqual(
      filterPaletteRows(rows, 'dark mode', 'all', 500, null),
    );
  });

  it('still treats a metacharacter as an ordinary character', () => {
    // `entry.navH.me` would match `entry.navHome` as a pattern. Without a
    // pattern it must match nothing, or plain text would have stopped being
    // the default the moment this parameter was added.
    const hits = filterPaletteRows(rows, 'entry.navH.me', 'all', 500);
    expect(hits).toEqual([]);
  });
});

describe('filterPaletteRows — a pattern from the search bar', () => {
  it('matches rows the same literal query could not', () => {
    const literal = filterPaletteRows(rows, 'entry.navH.me', 'all', 500);
    const pattern = filterPaletteRows(rows, '', 'all', 500, filterFor('entry\\.navH.me'));
    expect(literal).toEqual([]);
    expect(pattern.some((row) => row.id === 'go.home')).toBe(true);
  });

  it('ignores the text query entirely while a pattern is live', () => {
    const withQuery = filterPaletteRows(rows, 'nonsense', 'all', 500, filterFor('^go\\.'));
    const withoutQuery = filterPaletteRows(rows, '', 'all', 500, filterFor('^go\\.'));
    expect(withQuery).toEqual(withoutQuery);
  });

  it('still honours the scope chips', () => {
    const settings = filterPaletteRows(rows, '', 'settings', 500, filterFor('.'));
    expect(settings.length).toBeGreaterThan(0);
    expect(settings.every((row) => row.kind === 'setting')).toBe(true);
  });

  it('returns every row for an empty pattern, rather than none', () => {
    // `//` matches everything. Saying so is honest; silently returning nothing
    // would look like the palette had broken.
    const all = filterPaletteRows(rows, '', 'all', 500, filterFor(''));
    expect(all.length).toBe(filterPaletteRows(rows, '', 'all', 500).length);
  });

  it('finds a row by an untranslated keyword, exactly as text search does', () => {
    const hits = filterPaletteRows(rows, '', 'all', 500, filterFor('^dark mode$'));
    expect(hits.some((row) => row.id === 'setting:appearance.theme')).toBe(true);
  });

  it('respects the limit', () => {
    expect(filterPaletteRows(rows, '', 'all', 3, filterFor('.')).length).toBe(3);
  });

  it('does not carry lastIndex between rows the way a shared global regex would', () => {
    // The bug this guards: a `/g` regex reused across calls resumes from where
    // it stopped, so it matches every OTHER row. Ten identical titles must all
    // match or the palette's ranking is a coin toss.
    const identical = Array.from({ length: 10 }, (_, index) => probe(`same-${index}`));
    expect(filterPaletteRows(identical, '', 'all', 50, filterFor('same')).length).toBe(10);
  });
});

describe('scorePaletteRowByRegex', () => {
  const filter = () => filterFor('needle');

  it('ranks a title hit above a keyword hit above a hint hit', () => {
    const title = scorePaletteRowByRegex(probe('needle'), filter());
    const keyword = scorePaletteRowByRegex(probe('unrelated', ['needle']), filter());
    const hint = scorePaletteRowByRegex(probe('unrelated', [], 'needle'), filter());
    expect(title).toBeGreaterThan(keyword);
    expect(keyword).toBeGreaterThan(hint);
    expect(hint).toBeGreaterThan(0);
  });

  it('scores a row nothing when the pattern matches none of its text', () => {
    expect(scorePaletteRowByRegex(probe('unrelated', ['also'], 'nope'), filter())).toBe(0);
  });

  it('orders the filtered list by where the pattern hit', () => {
    const list = [probe('unrelated', ['needle']), probe('needle')];
    const hits = filterPaletteRows(list, '', 'all', 50, filterFor('needle'));
    expect(hits.map((row) => row.title)).toEqual(['needle', 'unrelated']);
  });
});

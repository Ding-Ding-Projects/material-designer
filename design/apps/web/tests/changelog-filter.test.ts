import { describe, expect, it } from 'vitest';

import {
  addMonths,
  isoDate,
  monthGrid,
  parseTypedDate,
  withinRange,
} from '../src/lib/changelog/dates';
import {
  EMPTY_CHANGELOG_FILTER,
  filterChangelog,
  renderChangelogMarkdown,
  renderChangelogText,
  searchTerms,
  type ChangelogExportLabels,
} from '../src/lib/changelog/filter';
import type { ChangelogEntry, ChangelogRelease } from '../src/lib/changelog/parse';

function entry(
  id: string,
  text: string,
  date: string | null,
  extra: Partial<ChangelogEntry> = {},
): ChangelogEntry {
  return {
    id,
    category: 'Added',
    subcategory: null,
    title: null,
    text,
    commit:
      date == null
        ? { state: 'unrecorded', referenced: [] }
        : {
            state: 'verified',
            sha: `${id.padEnd(40, '0')}`.slice(0, 40),
            shortSha: id,
            url: `https://example.test/commit/${id}`,
            date: `${date}T12:00:00-04:00`,
            summarizes: 1,
          },
    date,
    ...extra,
  };
}

function release(
  version: string,
  entries: ChangelogEntry[],
  date: string | null = null,
): ChangelogRelease {
  const dates = entries.map((one) => one.date).filter((one): one is string => one != null).sort();
  return {
    version,
    isVersion: version !== 'Not a version',
    title: null,
    sourcePath: 'CHANGELOG.md',
    date: date ?? dates[dates.length - 1] ?? null,
    dateSource: date != null ? 'source' : dates.length > 0 ? 'commits' : null,
    dateRange:
      dates.length > 0 ? { first: dates[0]!, last: dates[dates.length - 1]! } : null,
    categories: [{ name: 'Added', entries }],
    entryCount: entries.length,
  };
}

const RELEASES: ChangelogRelease[] = [
  release('Unreleased', [
    entry('aaa1111', 'A toast that shows a dish on startup', '2026-08-03'),
    entry('bbb2222', 'A changelog viewer with a date filter', '2026-08-01'),
    entry('ccc3333', 'Something nothing dates', null),
  ]),
  release('1.2.0', [entry('ddd4444', 'An older change to the toast', '2026-06-01')], '2026-06-02'),
];

const LABELS: ChangelogExportLabels = {
  heading: 'Changelog',
  scope: 'Showing 2 of 4 entries · dated 2026-08-01 to 2026-08-03',
  commitUnrecorded: 'no commit recorded',
  commitUnresolved: 'commit not in this repository',
  commitSummarizes: 'summarizes {count} commits',
  dateUnrecorded: 'no date recorded',
};

describe('search terms', () => {
  it('requires every term, in any order', () => {
    expect(searchTerms('  toast   Dish ')).toEqual(['toast', 'dish']);
    const result = filterChangelog(RELEASES, { ...EMPTY_CHANGELOG_FILTER, query: 'dish toast' });
    expect(result.scope.matched).toBe(1);
    expect(result.releases[0]?.categories[0]?.entries[0]?.id).toBe('aaa1111');
  });

  it('searches the version and the commit abbreviation too', () => {
    expect(
      filterChangelog(RELEASES, { ...EMPTY_CHANGELOG_FILTER, query: '1.2.0' }).scope.matched,
    ).toBe(1);
    expect(
      filterChangelog(RELEASES, { ...EMPTY_CHANGELOG_FILTER, query: 'bbb2222' }).scope.matched,
    ).toBe(1);
  });

  it('drops releases and categories that keep nothing', () => {
    const result = filterChangelog(RELEASES, { ...EMPTY_CHANGELOG_FILTER, query: 'older' });
    expect(result.releases.map((one) => one.version)).toEqual(['1.2.0']);
    expect(result.scope.total).toBe(4);
  });
});

describe('date range', () => {
  it('is inclusive at both ends', () => {
    const result = filterChangelog(RELEASES, {
      query: '',
      from: '2026-08-01',
      to: '2026-08-03',
    });
    expect(result.scope.matched).toBe(2);
    expect(result.scope.firstDate).toBe('2026-08-01');
    expect(result.scope.lastDate).toBe('2026-08-03');
  });

  it('leaves one end open when only one bound is set', () => {
    expect(
      filterChangelog(RELEASES, { query: '', from: '2026-07-01', to: null }).scope.matched,
    ).toBe(2);
    expect(
      filterChangelog(RELEASES, { query: '', from: null, to: '2026-07-01' }).scope.matched,
    ).toBe(1);
  });

  it('excludes undated entries and says how many', () => {
    // An undated entry cannot be shown to be inside a range. Keeping it would
    // make the range a suggestion; dropping it silently would hide a change.
    const result = filterChangelog(RELEASES, { query: '', from: '2026-01-01', to: '2026-12-31' });
    expect(result.scope.matched).toBe(3);
    expect(result.scope.undatedExcluded).toBe(1);
  });

  it('counts nothing as excluded when no range is set', () => {
    const result = filterChangelog(RELEASES, EMPTY_CHANGELOG_FILTER);
    expect(result.scope.matched).toBe(4);
    expect(result.scope.undatedExcluded).toBe(0);
    expect(result.scope.versions).toEqual(['Unreleased', '1.2.0']);
  });

  it('does not count a non-version section as a version', () => {
    // "Not done yet" is part of the changelog and is shown, but a scope line
    // that says "across N versions" must not count it as one.
    const withSection = filterChangelog(
      [...RELEASES, release('Not a version', [entry('eee5555', 'A standing statement', null)])],
      EMPTY_CHANGELOG_FILTER,
    );
    expect(withSection.scope.matched).toBe(5);
    expect(withSection.scope.versions).toEqual(['Unreleased', '1.2.0']);
  });
});

describe('filter composition', () => {
  it('narrows with both the search and the range rather than one overriding the other', () => {
    const searchOnly = filterChangelog(RELEASES, {
      ...EMPTY_CHANGELOG_FILTER,
      query: 'toast',
    });
    expect(searchOnly.scope.matched).toBe(2);

    const rangeOnly = filterChangelog(RELEASES, { query: '', from: '2026-08-01', to: null });
    expect(rangeOnly.scope.matched).toBe(2);

    const both = filterChangelog(RELEASES, {
      query: 'toast',
      from: '2026-08-01',
      to: null,
    });
    expect(both.scope.matched).toBe(1);
    expect(both.releases[0]?.categories[0]?.entries[0]?.id).toBe('aaa1111');
    expect(both.scope.query).toBe('toast');
    expect(both.scope.from).toBe('2026-08-01');
  });

  it('reports a release entry count for what survived, not for the source', () => {
    const result = filterChangelog(RELEASES, { ...EMPTY_CHANGELOG_FILTER, query: 'dish' });
    expect(result.releases[0]?.entryCount).toBe(1);
  });
});

describe('export', () => {
  const filtered = filterChangelog(RELEASES, { query: 'toast', from: null, to: null });

  it('states the range it covers, in both formats', () => {
    expect(renderChangelogMarkdown(filtered.releases, LABELS)).toContain(LABELS.scope);
    expect(renderChangelogText(filtered.releases, LABELS)).toContain(LABELS.scope);
  });

  it('exports exactly what the filter kept', () => {
    const markdown = renderChangelogMarkdown(filtered.releases, LABELS);
    expect(markdown).toContain('A toast that shows a dish on startup');
    expect(markdown).toContain('An older change to the toast');
    expect(markdown).not.toContain('A changelog viewer with a date filter');
  });

  it('links a verified commit and refuses to link anything else', () => {
    const withMissing = filterChangelog(
      [
        release('Unreleased', [
          entry('aaa1111', 'Linked', '2026-08-03'),
          entry('none', 'Unlinked', null),
          {
            ...entry('other', 'Unknown', null),
            commit: { state: 'unresolved', referenced: ['fff9999'] },
          },
        ]),
      ],
      EMPTY_CHANGELOG_FILTER,
    );
    const markdown = renderChangelogMarkdown(withMissing.releases, LABELS);
    expect(markdown).toContain('[`aaa1111`](https://example.test/commit/aaa1111)');
    expect(markdown).toContain('(no commit recorded)');
    expect(markdown).toContain('(commit not in this repository: fff9999)');
    expect(markdown).not.toContain('commit/fff9999');

    const text = renderChangelogText(withMissing.releases, LABELS);
    expect(text).toContain('— no commit recorded');
    expect(text).toContain('— commit not in this repository (fff9999)');
  });

  it('says a release has no recorded date rather than inventing one', () => {
    const undated = filterChangelog(
      [release('0.1.0', [entry('none', 'Nothing dates this', null)])],
      EMPTY_CHANGELOG_FILTER,
    );
    expect(renderChangelogText(undated.releases, LABELS)).toContain('0.1.0 — no date recorded');
  });

  it('says when an entry summarizes several commits', () => {
    const summarized = filterChangelog(
      [
        release('Unreleased', [
          {
            ...entry('aaa1111', 'Took several goes', '2026-08-03'),
            commit: {
              state: 'verified',
              sha: 'a'.repeat(40),
              shortSha: 'aaa1111',
              url: 'https://example.test/commit/aaa1111',
              date: '2026-08-03T12:00:00-04:00',
              summarizes: 4,
            },
          },
        ]),
      ],
      EMPTY_CHANGELOG_FILTER,
    );
    expect(renderChangelogMarkdown(summarized.releases, LABELS)).toContain(
      'summarizes 4 commits',
    );
    expect(renderChangelogText(summarized.releases, LABELS)).toContain('summarizes 4 commits');
  });
});

describe('typed dates', () => {
  it('accepts ISO in every locale order', () => {
    for (const order of ['ymd', 'dmy', 'mdy'] as const) {
      expect(parseTypedDate('2026-08-04', order)).toEqual({ kind: 'ok', iso: '2026-08-04' });
    }
  });

  it('reads a non-ISO date in the locale\'s own field order', () => {
    expect(parseTypedDate('04/08/2026', 'dmy')).toEqual({ kind: 'ok', iso: '2026-08-04' });
    expect(parseTypedDate('08/04/2026', 'mdy')).toEqual({ kind: 'ok', iso: '2026-08-04' });
    expect(parseTypedDate('2026.8.4', 'dmy')).toEqual({ kind: 'ok', iso: '2026-08-04' });
  });

  it('calls a half-typed date unfinished, not wrong', () => {
    expect(parseTypedDate('2026', 'ymd')).toEqual({ kind: 'partial', reason: 'fields' });
    expect(parseTypedDate('2026-08', 'ymd')).toEqual({ kind: 'partial', reason: 'fields' });
    expect(parseTypedDate('4/8/26', 'dmy')).toEqual({ kind: 'partial', reason: 'year' });
  });

  it('rejects a day that does not exist, and characters that are not a date', () => {
    expect(parseTypedDate('2026-02-31', 'ymd')).toEqual({ kind: 'invalid', reason: 'range' });
    expect(parseTypedDate('2026-13-01', 'ymd')).toEqual({ kind: 'invalid', reason: 'range' });
    expect(parseTypedDate('yesterday', 'ymd')).toEqual({ kind: 'invalid', reason: 'shape' });
    expect(parseTypedDate('2026-08-04-05', 'ymd')).toEqual({ kind: 'invalid', reason: 'shape' });
  });

  it('treats an empty field as no bound at all', () => {
    expect(parseTypedDate('   ', 'ymd')).toEqual({ kind: 'empty' });
  });
});

describe('calendar arithmetic', () => {
  it('wraps months across a year boundary in both directions', () => {
    expect(addMonths(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
    expect(addMonths(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(addMonths(2026, 6, 0)).toEqual({ year: 2026, month: 6 });
  });

  it('lays a month out in whole weeks, padded with nothing clickable', () => {
    const weeks = monthGrid(2026, 2);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    const days = weeks.flat().filter((day) => day != null);
    expect(days).toHaveLength(28);
    expect(days[0]).toBe('2026-02-01');
    expect(days[27]).toBe('2026-02-28');
  });

  it('formats and bounds dates as plain strings', () => {
    expect(isoDate(2026, 8, 4)).toBe('2026-08-04');
    expect(withinRange('2026-08-04', '2026-08-04', '2026-08-04')).toBe(true);
    expect(withinRange('2026-08-04', '2026-08-05', null)).toBe(false);
    expect(withinRange('2026-08-04', null, null)).toBe(true);
  });
});

// The changelog's search bar gained the regex builder every other search bar in
// the product already had. `filterChangelog` therefore takes an optional
// predicate — passed ONLY in regex mode, because plain text keeps the
// term-splitting path above and routing it through a single compiled pattern
// would silently turn "dialog focus" from "both words, any order" into a
// contiguous substring match.
describe('filterChangelog with a regex predicate', () => {
  // `category: 'Changed'` is explicit here, not incidental: `entry()`'s
  // default is `'Added'`, which is also the word this block's own regex
  // tests filter on. Left at the default, `entryHaystackRaw` folds the
  // category into every entry's haystack, so /Added/ is satisfied by ALL
  // three entries regardless of what their text says — the predicate looks
  // broken while it is actually reading a fixture that quietly answers its
  // own question. 'Changed' shares no substring with 'Added' or 'Fixed', so
  // only the entry text drives the match, which is what these tests are for.
  const releases = [
    release('1.1.0', [
      entry('aaa1', 'Fixed the dialog focus trap', '2026-02-01', { category: 'Changed' }),
      entry('bbb2', 'Added a density control', '2026-02-02', { category: 'Changed' }),
      entry('ccc3', 'Fixed the density readout clipping', '2026-02-03', { category: 'Changed' }),
    ]),
  ];

  function texts(result: ReturnType<typeof filterChangelog>): string[] {
    return result.releases.flatMap((one) => one.categories.flatMap((c) => c.entries.map((e) => e.text)));
  }

  it('uses the predicate instead of the term split when one is given', () => {
    const onlyDensity = filterChangelog(
      releases,
      { ...EMPTY_CHANGELOG_FILTER, query: '^Added' },
      (text) => /Added/.test(text),
    );
    expect(texts(onlyDensity)).toEqual(['Added a density control']);
  });

  it('still applies the date range alongside the predicate', () => {
    const ranged = filterChangelog(
      releases,
      { ...EMPTY_CHANGELOG_FILTER, query: 'Fixed', from: '2026-02-03', to: null },
      (text) => /Fixed/.test(text),
    );
    expect(texts(ranged)).toEqual(['Fixed the density readout clipping']);
  });

  it('hands the predicate the original case, not the folded search text', () => {
    // The plain-text path folds both the query and the haystack, which is
    // right for it and wrong for a regex: a lowercased haystack makes
    // /Added/ unsatisfiable and strips the `i` flag of any meaning, because
    // there is no case left to ignore. This is the assertion that caught it.
    const seen: string[] = [];
    filterChangelog(releases, { ...EMPTY_CHANGELOG_FILTER, query: 'Added' }, (text) => {
      seen.push(text);
      return /Added/.test(text);
    });
    expect(seen.some((text) => text.includes('Added a density control'))).toBe(true);
  });

  it('keeps the multi-term plain-text behaviour when no predicate is given', () => {
    // Two words, neither contiguous in the source text: the term split finds
    // it, a substring match would not. This is what the regex path must not
    // quietly replace.
    const both = filterChangelog(releases, { ...EMPTY_CHANGELOG_FILTER, query: 'density readout' });
    expect(texts(both)).toEqual(['Fixed the density readout clipping']);

    const reordered = filterChangelog(releases, {
      ...EMPTY_CHANGELOG_FILTER,
      query: 'readout density',
    });
    expect(texts(reordered)).toEqual(['Fixed the density readout clipping']);
  });
});

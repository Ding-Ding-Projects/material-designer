import { describe, expect, it } from 'vitest';

import {
  MAX_BULK_CLOSE_QUERY_LENGTH,
  compileBulkCloseMatcher,
  oppositeBulkCloseDirection,
  planBulkClose,
  type BulkCloseCandidate,
  type BulkCloseDirection,
  type BulkCloseQuery,
} from '../../src/components/workspace-tabs/bulkClose';

// "Close tabs containing text" and "close tabs NOT containing text" are one
// predicate and its negation. Written as two matchers they drift — one
// lowercases, the other forgets the `i` flag — and a user who runs the second
// expecting the complement of the first loses tabs the preview said were safe.
// The symmetry block below is the encoded form of that promise.

const tabs: BulkCloseCandidate[] = [
  { id: 'entry', label: 'Home', pinned: false, permanent: true },
  { id: 'a', label: 'Marketing site', pinned: false, permanent: false },
  { id: 'b', label: 'marketing deck', pinned: false, permanent: false },
  { id: 'c', label: 'Design system', pinned: true, permanent: false },
  { id: 'd', label: 'Invoices', pinned: false, permanent: false },
  { id: 'e', label: 'MARKETING plan', pinned: true, permanent: false },
];

function compiled(query: BulkCloseQuery) {
  const matcher = compileBulkCloseMatcher(query);
  if (!matcher.ok) throw new Error(`expected a usable matcher, got ${matcher.reason}`);
  return matcher;
}

describe('compileBulkCloseMatcher', () => {
  it('refuses an empty query', () => {
    // An empty query matches every tab in "not containing" mode, which is a way
    // to close the whole workspace by pressing a button twice.
    expect(compileBulkCloseMatcher({ query: '', mode: 'text', caseSensitive: false }))
      .toEqual({ ok: false, reason: 'empty' });
    expect(compileBulkCloseMatcher({ query: '   ', mode: 'regex', caseSensitive: false }))
      .toEqual({ ok: false, reason: 'empty' });
  });

  it('refuses a query long enough to be a denial of service', () => {
    const query = 'a'.repeat(MAX_BULK_CLOSE_QUERY_LENGTH + 1);
    expect(compileBulkCloseMatcher({ query, mode: 'regex', caseSensitive: false }))
      .toEqual({ ok: false, reason: 'tooLong' });
  });

  it('refuses a pattern that does not compile, and says why', () => {
    const matcher = compileBulkCloseMatcher({ query: '[', mode: 'regex', caseSensitive: false });
    expect(matcher.ok).toBe(false);
    if (matcher.ok) throw new Error('unreachable');
    expect(matcher.reason).toBe('invalid');
    expect(matcher.detail).toBeTruthy();
  });

  it('matches plain text case-insensitively by default', () => {
    const matcher = compiled({ query: 'MARKET', mode: 'text', caseSensitive: false });
    expect(matcher.test('Marketing site')).toBe(true);
    expect(matcher.test('Invoices')).toBe(false);
  });

  it('respects case sensitivity in both modes', () => {
    expect(compiled({ query: 'market', mode: 'text', caseSensitive: true }).test('Marketing'))
      .toBe(false);
    expect(compiled({ query: '^market', mode: 'regex', caseSensitive: true }).test('Marketing'))
      .toBe(false);
    expect(compiled({ query: '^market', mode: 'regex', caseSensitive: false }).test('Marketing'))
      .toBe(true);
  });

  it('does not carry state between calls', () => {
    const matcher = compiled({ query: 'a', mode: 'regex', caseSensitive: false });
    expect(matcher.test('banana')).toBe(true);
    expect(matcher.test('banana')).toBe(true);
    expect(matcher.test('banana')).toBe(true);
  });
});

describe('planBulkClose direction symmetry', () => {
  const queries: BulkCloseQuery[] = [
    { query: 'market', mode: 'text', caseSensitive: false },
    { query: 'Market', mode: 'text', caseSensitive: true },
    { query: '^m', mode: 'regex', caseSensitive: false },
    { query: 'zzz-no-match', mode: 'text', caseSensitive: false },
    { query: '.', mode: 'regex', caseSensitive: false },
  ];

  for (const query of queries) {
    it(`partitions every tab exactly once for ${query.mode} "${query.query}" (case ${query.caseSensitive ? 'on' : 'off'})`, () => {
      const matcher = compiled(query);
      const containing = planBulkClose(tabs, matcher, 'containing');
      const notContaining = planBulkClose(tabs, matcher, 'notContaining');

      const ids = (list: BulkCloseCandidate[]) => list.map((tab) => tab.id).sort();
      const union = [...containing.selected, ...notContaining.selected];
      // Every tab lands in exactly one side: the union is the whole input and
      // the intersection is empty. Two independent matchers cannot promise this.
      expect(ids(union)).toEqual(ids(tabs));
      expect(
        containing.selected.filter((tab) =>
          notContaining.selected.some((other) => other.id === tab.id)),
      ).toEqual([]);
    });
  }

  it('names the opposite direction', () => {
    expect(oppositeBulkCloseDirection('containing')).toBe('notContaining');
    expect(oppositeBulkCloseDirection('notContaining')).toBe('containing');
  });

  it('applies the same exclusions whichever direction selected the tab', () => {
    const matcher = compiled({ query: 'design', mode: 'text', caseSensitive: false });
    const forward = planBulkClose(tabs, matcher, 'containing');
    const inverse = planBulkClose(tabs, matcher, 'notContaining');
    // 'Design system' is pinned. It is selected by "containing" and held back;
    // it is not selected at all by "not containing". Either way it never closes.
    expect(forward.close.map((tab) => tab.id)).toEqual([]);
    expect(forward.excluded).toEqual([
      { tab: tabs.find((tab) => tab.id === 'c'), reason: 'pinned' },
    ]);
    expect(inverse.close.map((tab) => tab.id)).not.toContain('c');
  });
});

describe('planBulkClose exclusions', () => {
  const matcher = compiled({ query: 'm', mode: 'text', caseSensitive: false });

  it('excludes pinned tabs by default and reports them rather than pretending they closed', () => {
    const plan = planBulkClose(tabs, matcher, 'containing');
    expect(plan.close.map((tab) => tab.id)).toEqual(['a', 'b']);
    expect(plan.selected.map((tab) => tab.id)).toEqual(['entry', 'a', 'b', 'c', 'e']);
    expect(plan.excluded.map((entry) => [entry.tab.id, entry.reason])).toEqual([
      ['entry', 'permanent'],
      ['c', 'pinned'],
      ['e', 'pinned'],
    ]);
  });

  it('includes pinned tabs when the user explicitly opts in', () => {
    const plan = planBulkClose(tabs, matcher, 'containing', { includePinned: true });
    expect(plan.close.map((tab) => tab.id)).toEqual(['a', 'b', 'c', 'e']);
    expect(plan.excluded.map((entry) => entry.reason)).toEqual(['permanent']);
  });

  it('never closes the permanent tab, whatever the user opts into', () => {
    for (const direction of ['containing', 'notContaining'] as BulkCloseDirection[]) {
      const plan = planBulkClose(tabs, matcher, direction, { includePinned: true });
      expect(plan.close.map((tab) => tab.id)).not.toContain('entry');
    }
  });

  it('closes nothing when nothing matches', () => {
    const empty = compiled({ query: 'nothing-matches-this', mode: 'text', caseSensitive: false });
    const plan = planBulkClose(tabs, empty, 'containing');
    expect(plan.selected).toEqual([]);
    expect(plan.close).toEqual([]);
    expect(plan.excluded).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';

import type { HistoryRevisionSummary } from '@open-design/contracts';

import {
  EMPTY_HISTORY_FILTER,
  actionsForRevision,
  filterHistory,
  historyActionFacets,
  historyFilterIsActive,
  indexRevisions,
  localIsoDay,
} from '../../src/lib/history/actions';

/**
 * The action filter is derived from the recorded revisions, never from a fixed
 * menu, and the four filters compose rather than override. Both claims are only
 * as true as these assertions.
 */

let clock = 0;

/**
 * `details` defaults to `[label]` rather than to a fixed string, because the
 * daemon's own reader does exactly that when a revision recorded one change —
 * and a fixture whose details contradict its label would test a shape the store
 * never produces.
 */
function revision(over: Partial<HistoryRevisionSummary> = {}): HistoryRevisionSummary {
  clock += 1;
  const label = over.label ?? 'Updated the setting theme';
  return {
    id: `rev-${clock}`,
    commit: `commit-${clock}`,
    kind: 'mutation',
    label,
    details: [label],
    createdAt: Date.UTC(2026, 6, 1, 12, 0, 0),
    domainIds: ['settings'],
    changeCount: 1,
    restoredFromId: null,
    ...over,
  };
}

const NO_MATCHER = null;

describe('actionsForRevision', () => {
  it('reads the verb the store actually recorded', () => {
    const created = revision({ label: 'Added the connector account github', domainIds: ['connectors'] });
    const deleted = revision({ label: 'Deleted the connector account github', domainIds: ['connectors'] });
    const updated = revision({ label: 'Updated the MCP server local', domainIds: ['mcp'] });

    const byId = indexRevisions([created, deleted, updated]);
    expect(actionsForRevision(created, byId)).toEqual(['created']);
    expect(actionsForRevision(deleted, byId)).toEqual(['deleted']);
    expect(actionsForRevision(updated, byId)).toEqual(['updated']);
  });

  it('reads the lower-case path-level fallback sentence too', () => {
    // `describeChangedPaths` in the daemon writes this shape when a source has
    // no record structure to diff. It is still a real recorded action.
    const fallback = revision({
      label: 'Memory: deleted 2 memory files, added 1 memory file',
      details: ['Memory: deleted 2 memory files, added 1 memory file'],
      domainIds: ['memory'],
    });
    expect(actionsForRevision(fallback, indexRevisions([fallback]))).toEqual(['created', 'deleted']);
  });

  it('carries several actions when one revision coalesced several changes', () => {
    const burst = revision({
      label: 'Deleted the connector account github',
      details: ['Deleted the connector account github', 'Added the connector account gitlab'],
      domainIds: ['connectors'],
    });
    expect(actionsForRevision(burst, indexRevisions([burst]))).toEqual(['created', 'deleted']);
  });

  it('does not guess a verb it cannot see', () => {
    const opaque = revision({ label: 'Recorded a change', details: [], domainIds: ['orbit'] });
    expect(actionsForRevision(opaque, indexRevisions([opaque]))).toEqual(['recorded']);
  });

  it('marks a settings revision as settings as well as by its verb', () => {
    const settings = revision({ label: 'Updated the setting theme', domainIds: ['settings'] });
    expect(actionsForRevision(settings, indexRevisions([settings]))).toEqual([
      'updated',
      'settings',
    ]);
  });

  it('calls a restore of a restore an undo, and only when the target is loaded', () => {
    const first = revision({ id: 'r1', kind: 'restore', restoredFromId: 'r0', domainIds: [] });
    const second = revision({ id: 'r2', kind: 'restore', restoredFromId: 'r1', domainIds: [] });
    const orphan = revision({ id: 'r3', kind: 'restore', restoredFromId: 'gone', domainIds: [] });

    const byId = indexRevisions([first, second, orphan]);
    expect(actionsForRevision(first, byId)).toEqual(['restored']);
    expect(actionsForRevision(second, byId)).toEqual(['restored', 'undone']);
    // An unloaded target is never guessed at.
    expect(actionsForRevision(orphan, byId)).toEqual(['restored']);
  });

  it('names the first snapshot and the prune event by their kind', () => {
    const initial = revision({ kind: 'initial', domainIds: [] });
    const pruned = revision({ kind: 'prune', domainIds: [] });
    const byId = indexRevisions([initial, pruned]);
    expect(actionsForRevision(initial, byId)).toEqual(['initial']);
    expect(actionsForRevision(pruned, byId)).toEqual(['pruned']);
  });
});

describe('historyActionFacets', () => {
  it('offers only actions that occurred, with their counts', () => {
    const facets = historyActionFacets([
      revision({ label: 'Added the MCP server a', domainIds: ['mcp'] }),
      revision({ label: 'Added the MCP server b', domainIds: ['mcp'] }),
      revision({ label: 'Deleted the MCP server a', domainIds: ['mcp'] }),
    ]);
    expect(facets).toEqual([
      { id: 'created', count: 2 },
      { id: 'deleted', count: 1 },
    ]);
  });

  it('never offers an action the app has not recorded', () => {
    // "Imported" is in nobody's list because the daemon records no import
    // event. A hard-coded menu would offer a filter that can never match.
    const ids = historyActionFacets([revision()]).map((facet) => facet.id);
    expect(ids).not.toContain('restored');
    expect(ids).not.toContain('pruned');
    expect(ids).toEqual(['updated', 'settings']);
  });

  it('counts a revision once per action even when it says so twice', () => {
    const twice = revision({
      label: 'Added the memory file a',
      details: ['Added the memory file a', 'Added the memory file b'],
      domainIds: ['memory'],
    });
    expect(historyActionFacets([twice])).toEqual([{ id: 'created', count: 1 }]);
  });

  it('returns nothing for an empty history rather than a row of zeroes', () => {
    expect(historyActionFacets([])).toEqual([]);
  });
});

describe('localIsoDay', () => {
  it('reports the calendar day the user reads, not the UTC one', () => {
    const local = new Date(2026, 6, 4, 23, 30, 0);
    expect(localIsoDay(local.getTime())).toBe('2026-07-04');
  });
});

describe('filterHistory', () => {
  const july1 = new Date(2026, 6, 1, 9, 0, 0).getTime();
  const july5 = new Date(2026, 6, 5, 9, 0, 0).getTime();
  const july9 = new Date(2026, 6, 9, 9, 0, 0).getTime();

  const sample = [
    revision({ id: 'a', label: 'Added the connector account github', createdAt: july1, domainIds: ['connectors'] }),
    revision({ id: 'b', label: 'Deleted the connector account gitlab', createdAt: july5, domainIds: ['connectors'] }),
    revision({ id: 'c', label: 'Updated the setting theme', createdAt: july9, domainIds: ['settings'] }),
  ];

  it('passes everything through when nothing is set', () => {
    const result = filterHistory(sample, EMPTY_HISTORY_FILTER, NO_MATCHER);
    expect(result.matched).toBe(3);
    expect(result.total).toBe(3);
    expect(result.bounds).toEqual({ first: '2026-07-01', last: '2026-07-09' });
  });

  it('bounds the date range inclusively at both ends', () => {
    const result = filterHistory(
      sample,
      { ...EMPTY_HISTORY_FILTER, from: '2026-07-01', to: '2026-07-05' },
      NO_MATCHER,
    );
    expect(result.revisions.map((entry) => entry.id)).toEqual(['a', 'b']);
  });

  it('takes the union of several selected actions', () => {
    const result = filterHistory(
      sample,
      { ...EMPTY_HISTORY_FILTER, actions: ['created', 'deleted'] },
      NO_MATCHER,
    );
    expect(result.revisions.map((entry) => entry.id)).toEqual(['a', 'b']);
  });

  it('composes the date range, the actions and the search rather than overriding', () => {
    const result = filterHistory(
      sample,
      {
        from: '2026-07-01',
        to: '2026-07-06',
        actions: ['created', 'deleted'],
        domainIds: ['connectors'],
        query: 'gitlab',
      },
      NO_MATCHER,
    );
    // Only `b` satisfies all four at once; three of them alone would keep `a`.
    expect(result.revisions.map((entry) => entry.id)).toEqual(['b']);
  });

  it('keeps the facet counts describing the loaded set, not the filtered one', () => {
    const result = filterHistory(
      sample,
      { ...EMPTY_HISTORY_FILTER, actions: ['deleted'] },
      NO_MATCHER,
    );
    expect(result.matched).toBe(1);
    // The counts must not collapse to what is on screen, or clicking a facet
    // would rewrite the numbers that explain why it is worth clicking.
    expect(result.facets).toEqual([
      { id: 'created', count: 1 },
      { id: 'updated', count: 1 },
      { id: 'deleted', count: 1 },
      { id: 'settings', count: 1 },
    ]);
  });

  it('uses the field’s own compiled predicate when one is supplied', () => {
    const result = filterHistory(
      sample,
      { ...EMPTY_HISTORY_FILTER, query: 'git(hub|lab)' },
      (text) => /git(hub|lab)/u.test(text),
    );
    expect(result.revisions.map((entry) => entry.id)).toEqual(['a', 'b']);
  });

  it('splits plain-text search into terms that must all appear', () => {
    const result = filterHistory(
      sample,
      { ...EMPTY_HISTORY_FILTER, query: 'connector gitlab' },
      NO_MATCHER,
    );
    expect(result.revisions.map((entry) => entry.id)).toEqual(['b']);
  });

  it('searches the detail lines, not only the headline label', () => {
    const detailed = revision({
      id: 'd',
      label: 'Deleted the connector account one',
      details: ['Deleted the connector account one', 'Added the connector account needle'],
      createdAt: july1,
      domainIds: ['connectors'],
    });
    const result = filterHistory([detailed], { ...EMPTY_HISTORY_FILTER, query: 'needle' }, NO_MATCHER);
    expect(result.matched).toBe(1);
  });

  it('filters by domain independently of the action', () => {
    const result = filterHistory(
      sample,
      { ...EMPTY_HISTORY_FILTER, domainIds: ['settings'] },
      NO_MATCHER,
    );
    expect(result.revisions.map((entry) => entry.id)).toEqual(['c']);
  });
});

describe('historyFilterIsActive', () => {
  it('is false only when genuinely nothing is narrowing the list', () => {
    expect(historyFilterIsActive(EMPTY_HISTORY_FILTER)).toBe(false);
    expect(historyFilterIsActive({ ...EMPTY_HISTORY_FILTER, query: '   ' })).toBe(false);
    expect(historyFilterIsActive({ ...EMPTY_HISTORY_FILTER, from: '2026-07-01' })).toBe(true);
    expect(historyFilterIsActive({ ...EMPTY_HISTORY_FILTER, actions: ['deleted'] })).toBe(true);
    expect(historyFilterIsActive({ ...EMPTY_HISTORY_FILTER, domainIds: ['mcp'] })).toBe(true);
    expect(historyFilterIsActive({ ...EMPTY_HISTORY_FILTER, query: 'x' })).toBe(true);
  });
});

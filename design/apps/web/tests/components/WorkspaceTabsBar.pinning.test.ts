import { describe, expect, it } from 'vitest';

import {
  WORKSPACE_TABS_PAYLOAD_VERSION,
  isTabPinned,
  orderTabsWithPinnedFirst,
  parseStoredWorkspaceTabsPayload,
  reconcilePinnedTabIds,
  sanitizePinnedTabIds,
  serializeWorkspaceTabsPayload,
  togglePinnedTabId,
} from '../../src/components/workspace-tabs/tabPinning';

// The stored workspace is the one piece of tab state that outlives the code
// that wrote it, so most of what matters here is what happens when the shape on
// disk is not the shape the current build expects: a v1 payload from before
// pinning existed, a hand-edited one, a pin for a tab that was closed in
// another window. Every one of those has to restore a usable strip.

const tab = (id: string, kind: 'entry' | 'project' = 'project') => ({ id, kind });
const isEntry = (candidate: { kind: string }) => candidate.kind === 'entry';

describe('parseStoredWorkspaceTabsPayload', () => {
  it('reads a v1 payload — no version, no pins — as an unpinned workspace', () => {
    const v1 = JSON.stringify({
      tabs: [{ id: 'entry:1', kind: 'entry' }, { id: 'project:2', kind: 'project' }],
      activeTabId: 'project:2',
    });
    expect(parseStoredWorkspaceTabsPayload(v1)).toEqual({
      tabs: [{ id: 'entry:1', kind: 'entry' }, { id: 'project:2', kind: 'project' }],
      activeTabId: 'project:2',
      pinnedTabIds: [],
      // v3 added groups. A v1 payload has none, which is exactly the state the
      // user was already in — every tab restores, in no group.
      groups: [],
      groupMembership: {},
      groupDecorations: {},
    });
  });

  it('reads a v2 payload with its pins intact', () => {
    const v2 = serializeWorkspaceTabsPayload({
      tabs: [tab('a'), tab('b')],
      activeTabId: 'a',
      pinnedTabIds: ['b'],
    });
    expect(JSON.parse(v2).version).toBe(WORKSPACE_TABS_PAYLOAD_VERSION);
    expect(parseStoredWorkspaceTabsPayload(v2)?.pinnedTabIds).toEqual(['b']);
  });

  it('round-trips a v3 payload with its groups, membership and decoration', () => {
    // One write, one read, one shape — for the same reason the pins are in
    // here. A workspace that restored its tabs and lost which group they were
    // in looks right and behaves wrong.
    const v3 = serializeWorkspaceTabsPayload({
      tabs: [tab('a'), tab('b')],
      activeTabId: 'a',
      pinnedTabIds: [],
      groups: [{ id: 'g1', name: 'Docs', color: 'moss', collapsed: true }],
      groupMembership: { b: 'g1' },
      groupDecorations: { g1: { radius: 8 } },
    });
    const restored = parseStoredWorkspaceTabsPayload(v3);
    expect(restored?.groups).toEqual([
      { id: 'g1', name: 'Docs', color: 'moss', collapsed: true },
    ]);
    expect(restored?.groupMembership).toEqual({ b: 'g1' });
    expect(restored?.groupDecorations).toEqual({ g1: { radius: 8 } });
  });

  it('returns null only when there is nothing usable at all', () => {
    expect(parseStoredWorkspaceTabsPayload(null)).toBeNull();
    expect(parseStoredWorkspaceTabsPayload('')).toBeNull();
    expect(parseStoredWorkspaceTabsPayload('{not json')).toBeNull();
    expect(parseStoredWorkspaceTabsPayload('"a string"')).toBeNull();
    expect(parseStoredWorkspaceTabsPayload('[1, 2]')).toBeNull();
  });

  it('tolerates a stored shape whose fields are the wrong type', () => {
    const broken = JSON.stringify({
      tabs: 'nope',
      activeTabId: 7,
      pinnedTabIds: 'b',
      groups: 'also nope',
      groupMembership: ['not a map'],
      groupDecorations: 9,
    });
    expect(parseStoredWorkspaceTabsPayload(broken)).toEqual({
      tabs: [],
      activeTabId: '',
      pinnedTabIds: [],
      groups: [],
      groupMembership: {},
      groupDecorations: {},
    });
  });

  it('drops non-string, empty and duplicate pins', () => {
    expect(sanitizePinnedTabIds(['a', 'a', 3, null, '  ', ' b ', undefined]))
      .toEqual(['a', 'b']);
    expect(sanitizePinnedTabIds(undefined)).toEqual([]);
    expect(sanitizePinnedTabIds({ 0: 'a' })).toEqual([]);
  });
});

describe('reconcilePinnedTabIds', () => {
  it('drops pins whose tab no longer exists and keeps the pin order', () => {
    expect(reconcilePinnedTabIds(['c', 'a', 'gone'], ['a', 'b', 'c'])).toEqual(['c', 'a']);
  });

  it('returns the same array when nothing was dropped, so callers can skip a re-render', () => {
    const pinned = ['a', 'b'];
    expect(reconcilePinnedTabIds(pinned, ['a', 'b', 'c'])).toBe(pinned);
  });

  it('treats a missing pin list as empty', () => {
    expect(reconcilePinnedTabIds(undefined, ['a'])).toEqual([]);
  });
});

describe('orderTabsWithPinnedFirst', () => {
  it('puts the permanent tab first, then pinned tabs in pin order, then the rest', () => {
    const tabs = [tab('entry', 'entry'), tab('a'), tab('b'), tab('c')];
    const ordered = orderTabsWithPinnedFirst(tabs, ['c', 'a'], isEntry);
    expect(ordered.map((item) => item.id)).toEqual(['entry', 'c', 'a', 'b']);
  });

  it('moves the permanent tab to the front even when it was stored elsewhere', () => {
    const tabs = [tab('a'), tab('entry', 'entry'), tab('b')];
    const ordered = orderTabsWithPinnedFirst(tabs, ['b'], isEntry);
    expect(ordered.map((item) => item.id)).toEqual(['entry', 'b', 'a']);
  });

  it('returns the same array when the order already holds', () => {
    const tabs = [tab('entry', 'entry'), tab('a'), tab('b')];
    expect(orderTabsWithPinnedFirst(tabs, ['a'], isEntry)).toBe(tabs);
    expect(orderTabsWithPinnedFirst(tabs, [], isEntry)).toBe(tabs);
  });

  it('ignores pins for tabs that are not present', () => {
    const tabs = [tab('a'), tab('b')];
    expect(orderTabsWithPinnedFirst(tabs, ['gone'], isEntry).map((item) => item.id))
      .toEqual(['a', 'b']);
  });
});

describe('togglePinnedTabId', () => {
  it('pins, unpins, and appends new pins at the end', () => {
    expect(togglePinnedTabId([], 'a')).toEqual(['a']);
    expect(togglePinnedTabId(['a'], 'b')).toEqual(['a', 'b']);
    expect(togglePinnedTabId(['a', 'b'], 'a')).toEqual(['b']);
  });

  it('honours an explicit intent instead of flipping a stale value', () => {
    expect(togglePinnedTabId(['a'], 'a', true)).toEqual(['a']);
    expect(togglePinnedTabId([], 'a', false)).toEqual([]);
  });

  it('returns the same array when the request is already satisfied', () => {
    const pinned = ['a'];
    expect(togglePinnedTabId(pinned, 'a', true)).toBe(pinned);
    expect(togglePinnedTabId(pinned, 'b', false)).toBe(pinned);
  });
});

describe('isTabPinned', () => {
  it('answers for a missing pin list without throwing', () => {
    expect(isTabPinned(undefined, 'a')).toBe(false);
    expect(isTabPinned(['a'], 'a')).toBe(true);
    expect(isTabPinned(['a'], 'b')).toBe(false);
  });
});

describe('round trip', () => {
  it('survives serialize → parse with the pins and the active tab intact', () => {
    const raw = serializeWorkspaceTabsPayload({
      tabs: [tab('entry', 'entry'), tab('a'), tab('b')],
      activeTabId: 'a',
      pinnedTabIds: ['b', 'b', 'b'],
    });
    const parsed = parseStoredWorkspaceTabsPayload(raw);
    expect(parsed?.activeTabId).toBe('a');
    expect(parsed?.pinnedTabIds).toEqual(['b']);
    expect(parsed?.tabs).toHaveLength(3);
  });
});

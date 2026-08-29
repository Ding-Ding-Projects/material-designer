import { describe, expect, it } from 'vitest';

import {
  WORKSPACE_TAB_WINDOW_KEY_PREFIX,
  WORKSPACE_TAB_ACTIVATION_KEY_PREFIX,
  WORKSPACE_TAB_WINDOW_TTL_MS,
  createWorkspaceTabWindowId,
  flattenWorkspaceTabWindowSnapshots,
  isWorkspaceTabActivationKey,
  isWorkspaceTabWindowKey,
  parseWorkspaceTabWindowSnapshot,
  parseWorkspaceTabActivationRequest,
  publishWorkspaceTabActivationRequest,
  publishWorkspaceTabWindowSnapshot,
  readWorkspaceTabWindowSnapshots,
  removeWorkspaceTabWindowSnapshot,
  removeWorkspaceTabActivationRequest,
  workspaceTabActivationKey,
  workspaceTabWindowKey,
  type WorkspaceTabWindowSnapshot,
  type WorkspaceTabWindowStorage,
} from '../../../src/components/workspace-tabs/windowRegistry';

// The master search is the one discovery search that cannot read its answer out
// of React state, because most of its answer is in other windows. This is the
// transport, and the two things it has to survive are a window that died
// without cleaning up, and a payload somebody edited by hand.

function storage(seed: Record<string, string> = {}): WorkspaceTabWindowStorage & {
  entries: Record<string, string>;
} {
  const entries: Record<string, string> = { ...seed };
  return {
    entries,
    get length() {
      return Object.keys(entries).length;
    },
    key: (index: number) => Object.keys(entries)[index] ?? null,
    getItem: (key: string) => entries[key] ?? null,
    setItem: (key: string, value: string) => {
      entries[key] = value;
    },
    removeItem: (key: string) => {
      delete entries[key];
    },
  };
}

const snapshot = (
  windowId: string,
  updatedAt: number,
  tabs: WorkspaceTabWindowSnapshot['tabs'] = [],
  scopeKey = 'account-a::workspace-a',
): WorkspaceTabWindowSnapshot => ({ windowId, scopeKey, stripId: 'workspace', updatedAt, tabs });

const tab = (id: string, over: Partial<WorkspaceTabWindowSnapshot['tabs'][number]> = {}) => ({
  id,
  title: id,
  meta: 'Project',
  pinned: false,
  active: false,
  groupId: null,
  groupName: null,
  groupCollapsed: false,
  ...over,
});

describe('keys', () => {
  it('namespaces its keys so nothing else in the store is mistaken for one', () => {
    expect(workspaceTabWindowKey('abc')).toBe(`${WORKSPACE_TAB_WINDOW_KEY_PREFIX}abc`);
    expect(isWorkspaceTabWindowKey(workspaceTabWindowKey('abc'))).toBe(true);
    expect(isWorkspaceTabWindowKey('open-design:workspace-tabs:v1')).toBe(false);
  });

  it('mints a distinct id per window', () => {
    expect(createWorkspaceTabWindowId()).not.toBe(createWorkspaceTabWindowId());
  });

  it('keeps activation requests in a separate namespace', () => {
    expect(workspaceTabActivationKey('request-1'))
      .toBe(`${WORKSPACE_TAB_ACTIVATION_KEY_PREFIX}request-1`);
    expect(isWorkspaceTabActivationKey(workspaceTabActivationKey('request-1'))).toBe(true);
    expect(isWorkspaceTabActivationKey(workspaceTabWindowKey('window-1'))).toBe(false);
  });
});

describe('cross-window activation requests', () => {
  it('publishes, parses, and removes one exact handoff', () => {
    const store = storage();
    const request = {
      requestId: 'request-1',
      sourceWindowId: 'source-window',
      targetWindowId: 'target-window',
      scopeKey: 'account-a::workspace-a',
      tabId: 'project:alpha',
      requestedAt: 123,
    };
    const key = publishWorkspaceTabActivationRequest(store, request);
    expect(key).toBe(workspaceTabActivationKey(request.requestId));
    expect(parseWorkspaceTabActivationRequest(store.getItem(key!))).toEqual(request);
    removeWorkspaceTabActivationRequest(store, request.requestId);
    expect(store.getItem(key!)).toBeNull();
  });

  it('rejects partial or malformed handoffs', () => {
    expect(parseWorkspaceTabActivationRequest(null)).toBeNull();
    expect(parseWorkspaceTabActivationRequest('{broken')).toBeNull();
    expect(parseWorkspaceTabActivationRequest(JSON.stringify({
      requestId: 'request-1',
      sourceWindowId: 'source-window',
      targetWindowId: '',
      scopeKey: 'account-a::workspace-a',
      tabId: 'project:alpha',
      requestedAt: 123,
    }))).toBeNull();
    expect(parseWorkspaceTabActivationRequest(JSON.stringify({
      requestId: 'request-2',
      sourceWindowId: 'source-window',
      targetWindowId: 'target-window',
      tabId: 'project:alpha',
      requestedAt: 123,
    }))).toBeNull();
  });
});

describe('parseWorkspaceTabWindowSnapshot', () => {
  it('round-trips a published snapshot', () => {
    const store = storage();
    const published = snapshot('w1', 1_000, [tab('a', { pinned: true, groupName: 'Docs' })]);
    publishWorkspaceTabWindowSnapshot(store, published);
    expect(parseWorkspaceTabWindowSnapshot(store.getItem(workspaceTabWindowKey('w1')))).toEqual(
      published,
    );
  });

  it('returns null rather than throwing on anything unusable', () => {
    expect(parseWorkspaceTabWindowSnapshot(null)).toBeNull();
    expect(parseWorkspaceTabWindowSnapshot('{not json')).toBeNull();
    expect(parseWorkspaceTabWindowSnapshot('[]')).toBeNull();
    expect(parseWorkspaceTabWindowSnapshot('{"tabs":[]}')).toBeNull();
    expect(parseWorkspaceTabWindowSnapshot(JSON.stringify({
      windowId: 'missing-scope',
      updatedAt: 5,
      tabs: [],
    }))).toBeNull();
  });

  it('drops individual tabs it cannot read, keeping the rest of the window', () => {
    const parsed = parseWorkspaceTabWindowSnapshot(
      JSON.stringify({
        windowId: 'w1',
        scopeKey: 'account-a::workspace-a',
        updatedAt: 5,
        tabs: [{ id: 'a' }, { title: 'no id' }, 7],
      }),
    );
    expect(parsed?.tabs.map((entry) => entry.id)).toEqual(['a']);
    expect(parsed?.stripId).toBe('workspace');
  });
});

describe('readWorkspaceTabWindowSnapshots', () => {
  it('prunes a window that died without cleaning up', () => {
    const now = 1_000_000;
    const store = storage();
    publishWorkspaceTabWindowSnapshot(store, snapshot('alive', now - 1_000));
    publishWorkspaceTabWindowSnapshot(
      store,
      snapshot('crashed', now - WORKSPACE_TAB_WINDOW_TTL_MS - 1),
    );
    const live = readWorkspaceTabWindowSnapshots(store, now);
    expect(live.map((entry) => entry.windowId)).toEqual(['alive']);
    // Pruned from the store too, not merely filtered out of the answer.
    expect(store.entries[workspaceTabWindowKey('crashed')]).toBeUndefined();
  });

  it('prunes a corrupt payload instead of letting it take the search down', () => {
    const store = storage({ [workspaceTabWindowKey('bad')]: '{half-writ' });
    publishWorkspaceTabWindowSnapshot(store, snapshot('good', 10));
    expect(readWorkspaceTabWindowSnapshots(store, 20).map((s) => s.windowId)).toEqual(['good']);
    expect(store.entries[workspaceTabWindowKey('bad')]).toBeUndefined();
  });

  it('ignores keys that belong to something else in the same store', () => {
    const store = storage({ 'open-design:workspace-tabs:v1': '{"tabs":[]}' });
    expect(readWorkspaceTabWindowSnapshots(store, 0)).toEqual([]);
    expect(store.entries['open-design:workspace-tabs:v1']).toBe('{"tabs":[]}');
  });

  it('forgets a window the moment it closes in an orderly way', () => {
    const store = storage();
    publishWorkspaceTabWindowSnapshot(store, snapshot('w1', 10));
    removeWorkspaceTabWindowSnapshot(store, 'w1');
    expect(readWorkspaceTabWindowSnapshots(store, 11)).toEqual([]);
  });
});

describe('flattenWorkspaceTabWindowSnapshots', () => {
  it('puts the searching window first and identifies every result', () => {
    const results = flattenWorkspaceTabWindowSnapshots(
      [
        snapshot('other', 200, [tab('x', { groupName: 'Docs', groupCollapsed: true })]),
        snapshot('mine', 100, [tab('a', { pinned: true, active: true })]),
      ],
      'mine',
      'account-a::workspace-a',
    );
    expect(results.map((entry) => entry.id)).toEqual(['a', 'x']);
    expect(results[0]).toMatchObject({
      isCurrentWindow: true,
      windowIndex: 1,
      pinned: true,
      active: true,
      stripId: 'workspace',
    });
    expect(results[1]).toMatchObject({
      isCurrentWindow: false,
      windowIndex: 2,
      groupName: 'Docs',
      groupCollapsed: true,
    });
  });

  it('survives the searching window not being in the list yet', () => {
    const results = flattenWorkspaceTabWindowSnapshots(
      [snapshot('other', 1, [tab('x')])],
      'mine',
      'account-a::workspace-a',
    );
    expect(results).toHaveLength(1);
    expect(results[0]?.isCurrentWindow).toBe(false);
  });

  it('filters cross-account and cross-workspace snapshots even when tab ids match', () => {
    const results = flattenWorkspaceTabWindowSnapshots(
      [
        snapshot('exact', 4, [tab('same-tab')], 'account-a::workspace-a'),
        snapshot('other-account', 3, [tab('same-tab')], 'account-b::workspace-a'),
        snapshot('other-workspace', 2, [tab('same-tab')], 'account-a::workspace-b'),
      ],
      'exact',
      'account-a::workspace-a',
    );
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      windowId: 'exact',
      scopeKey: 'account-a::workspace-a',
      id: 'same-tab',
    });
  });

  it('returns no master results while identity is pending', () => {
    expect(flattenWorkspaceTabWindowSnapshots(
      [snapshot('exact', 1, [tab('a')])],
      'exact',
      null,
    )).toEqual([]);
  });
});

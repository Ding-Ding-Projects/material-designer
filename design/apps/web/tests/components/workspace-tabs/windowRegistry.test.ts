import { describe, expect, it } from 'vitest';

import {
  WORKSPACE_TAB_WINDOW_KEY_PREFIX,
  WORKSPACE_TAB_WINDOW_TTL_MS,
  createWorkspaceTabWindowId,
  flattenWorkspaceTabWindowSnapshots,
  isWorkspaceTabWindowKey,
  parseWorkspaceTabWindowSnapshot,
  publishWorkspaceTabWindowSnapshot,
  readWorkspaceTabWindowSnapshots,
  removeWorkspaceTabWindowSnapshot,
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
): WorkspaceTabWindowSnapshot => ({ windowId, stripId: 'workspace', updatedAt, tabs });

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
  });

  it('drops individual tabs it cannot read, keeping the rest of the window', () => {
    const parsed = parseWorkspaceTabWindowSnapshot(
      JSON.stringify({ windowId: 'w1', updatedAt: 5, tabs: [{ id: 'a' }, { title: 'no id' }, 7] }),
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
    const results = flattenWorkspaceTabWindowSnapshots([snapshot('other', 1, [tab('x')])], 'mine');
    expect(results).toHaveLength(1);
    expect(results[0]?.isCurrentWindow).toBe(false);
  });
});

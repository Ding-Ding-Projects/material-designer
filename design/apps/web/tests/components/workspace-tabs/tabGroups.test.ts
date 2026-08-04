import { describe, expect, it } from 'vitest';

import {
  DEFAULT_TAB_GROUP_COLOR,
  assignTabToGroup,
  createTabGroup,
  groupIdForTab,
  isTabInCollapsedGroup,
  moveTabGroup,
  nextTabGroupColor,
  normalizeTabGroupName,
  orderTabsByGroupMembership,
  partitionTabsByGroup,
  reconcileTabGroupMembership,
  removeTabGroup,
  renameTabGroup,
  sanitizeTabGroupMembership,
  sanitizeTabGroups,
  setTabGroupColor,
  tabGroupDisplayName,
  tabIdsInGroup,
  toggleTabGroupCollapsed,
  type WorkspaceTabGroup,
} from '../../../src/components/workspace-tabs/tabGroups';

// Two things are being defended here and they are worth stating, because both
// are failure modes that look like data loss to the user.
//
// 1. A group must never take a tab with it. Removing a group, reconciling a
//    stale payload, dragging the last member out — none of them may make a tab
//    disappear from the strip.
// 2. The stored shape outlives the code that wrote it. A v2 payload has no
//    groups at all; a hand-edited one can hold numbers, unknown colours, or
//    membership pointing at a group deleted three sessions ago.

const group = (id: string, over: Partial<WorkspaceTabGroup> = {}): WorkspaceTabGroup => ({
  id,
  name: id,
  color: DEFAULT_TAB_GROUP_COLOR,
  collapsed: false,
  ...over,
});

const tab = (id: string) => ({ id });

describe('sanitizeTabGroups', () => {
  it('reads nothing at all as no groups, rather than throwing', () => {
    expect(sanitizeTabGroups(undefined)).toEqual([]);
    expect(sanitizeTabGroups(null)).toEqual([]);
    expect(sanitizeTabGroups('{}')).toEqual([]);
    expect(sanitizeTabGroups({ id: 'a' })).toEqual([]);
  });

  it('drops entries with no id, and keeps the first of a duplicate pair', () => {
    expect(
      sanitizeTabGroups([
        { id: '', name: 'nameless' },
        { id: 'a', name: 'first' },
        { id: 'a', name: 'second' },
        42,
      ]),
    ).toEqual([{ id: 'a', name: 'first', color: DEFAULT_TAB_GROUP_COLOR, collapsed: false }]);
  });

  it('falls back to the default colour for one it does not recognise', () => {
    const [restored] = sanitizeTabGroups([{ id: 'a', color: 'octarine' }]);
    expect(restored?.color).toBe(DEFAULT_TAB_GROUP_COLOR);
  });

  it('keeps a collapsed group collapsed across a restart', () => {
    const [restored] = sanitizeTabGroups([{ id: 'a', name: 'Docs', collapsed: true }]);
    expect(restored).toEqual({ id: 'a', name: 'Docs', color: DEFAULT_TAB_GROUP_COLOR, collapsed: true });
  });
});

describe('normalizeTabGroupName', () => {
  it('keeps a trailing space, so a multi-word name can actually be typed', () => {
    // The rename field writes through this on every keystroke. A trim here
    // turns "Design " into "Design", so the next character gives "Designs" and
    // the space can never be entered at all.
    expect(normalizeTabGroupName('Design ')).toBe('Design ');
    expect(normalizeTabGroupName('Design system')).toBe('Design system');
  });

  it('flattens anything that would break a single-line label', () => {
    expect(normalizeTabGroupName('Design\nsystem')).toBe('Design system');
  });

  it('leaves an unnamed group unnamed rather than inventing a default', () => {
    // What an unnamed group is *called* is copy, and therefore translated. The
    // model has no business picking a language.
    expect(normalizeTabGroupName('')).toBe('');
    expect(normalizeTabGroupName(undefined)).toBe('');
  });

  it('bounds the length', () => {
    expect(normalizeTabGroupName('x'.repeat(200))).toHaveLength(64);
  });
});

describe('tabGroupDisplayName', () => {
  it('drops the whitespace at the point of display, not in the model', () => {
    expect(tabGroupDisplayName(group('g1', { name: '  Docs  ' }), 'Untitled group')).toBe('Docs');
  });

  it('falls back to the caller’s translated string for an unnamed group', () => {
    expect(tabGroupDisplayName(group('g1', { name: '   ' }), 'Untitled group'))
      .toBe('Untitled group');
  });
});

describe('sanitizeTabGroupMembership', () => {
  it('drops anything that is not a string-to-string pair', () => {
    expect(
      sanitizeTabGroupMembership({ 'tab-a': 'group-1', 'tab-b': 7, '': 'group-1', 'tab-c': '' }),
    ).toEqual({ 'tab-a': 'group-1' });
  });

  it('reads an array or a null as no membership', () => {
    expect(sanitizeTabGroupMembership(['a'])).toEqual({});
    expect(sanitizeTabGroupMembership(null)).toEqual({});
  });
});

describe('reconcileTabGroupMembership', () => {
  it('drops a membership entry whose tab was closed in another window', () => {
    expect(
      reconcileTabGroupMembership({ a: 'g1', b: 'g1' }, [group('g1')], ['a']),
    ).toEqual({ a: 'g1' });
  });

  it('drops a membership entry whose group no longer exists', () => {
    expect(
      reconcileTabGroupMembership({ a: 'gone' }, [group('g1')], ['a']),
    ).toEqual({});
  });

  it('keeps an emptied group — it is still a group the user named', () => {
    const groups = [group('g1', { name: 'Docs' })];
    // Every member has gone, and the group survives regardless. Removing it is
    // an explicit act, never a side effect of a move.
    const membership = reconcileTabGroupMembership({ a: 'g1' }, groups, []);
    expect(membership).toEqual({});
    expect(groups).toHaveLength(1);
  });

  it('returns the same object when nothing changed, so a caller can skip a render', () => {
    const membership = { a: 'g1' };
    expect(reconcileTabGroupMembership(membership, [group('g1')], ['a'])).toBe(membership);
  });
});

describe('partitionTabsByGroup', () => {
  const groups = [group('g1'), group('g2')];
  const membership = { b: 'g1', d: 'g2', e: 'g1' };
  const tabs = ['a', 'b', 'c', 'd', 'e'].map(tab);

  it('returns sections in group order, with each section in strip order', () => {
    const partition = partitionTabsByGroup(tabs, groups, membership);
    expect(partition.sections.map((section) => section.group.id)).toEqual(['g1', 'g2']);
    expect(partition.sections[0]?.tabs.map((t) => t.id)).toEqual(['b', 'e']);
    expect(partition.sections[1]?.tabs.map((t) => t.id)).toEqual(['d']);
    expect(partition.ungrouped.map((t) => t.id)).toEqual(['a', 'c']);
  });

  it('renders an empty group as an empty section rather than omitting it', () => {
    const partition = partitionTabsByGroup([tab('a')], groups, {});
    expect(partition.sections.map((section) => section.tabs)).toEqual([[], []]);
  });

  it('never loses a tab whose group id survived reconciliation by accident', () => {
    // Defence in depth: membership pointing at a group that is not in the list
    // should have been reconciled away, but if one slips through, the tab still
    // has to appear in the strip.
    const partition = partitionTabsByGroup([tab('a')], groups, { a: 'ghost' });
    expect(partition.ungrouped.map((t) => t.id)).toEqual(['a']);
  });
});

describe('orderTabsByGroupMembership', () => {
  it('makes each group contiguous and puts the groups in group order', () => {
    const tabs = ['home', 'a', 'b', 'c', 'd'].map(tab);
    const ordered = orderTabsByGroupMembership(
      tabs,
      [group('g2'), group('g1')],
      { a: 'g1', c: 'g2' },
      (t) => t.id === 'home',
    );
    // Sticky first, then g2's members, then g1's, then everything ungrouped.
    expect(ordered.map((t) => t.id)).toEqual(['home', 'c', 'a', 'b', 'd']);
  });

  it('returns the same array when the order already holds', () => {
    const tabs = [tab('home'), tab('a')];
    expect(
      orderTabsByGroupMembership(tabs, [group('g1')], { a: 'g1' }, (t) => t.id === 'home'),
    ).toBe(tabs);
  });

  it('is a no-op when there are no groups at all', () => {
    const tabs = [tab('a'), tab('b')];
    expect(orderTabsByGroupMembership(tabs, [], {}, () => false)).toBe(tabs);
  });
});

describe('group mutations', () => {
  it('renames, recolours and collapses without touching the other groups', () => {
    const groups = [group('g1'), group('g2')];
    expect(renameTabGroup(groups, 'g1', 'Docs ')[0]?.name).toBe('Docs ');
    expect(renameTabGroup(groups, 'g1', 'Docs')[1]).toEqual(groups[1]);
    expect(setTabGroupColor(groups, 'g2', 'moss')[1]?.color).toBe('moss');
    expect(toggleTabGroupCollapsed(groups, 'g1')[0]?.collapsed).toBe(true);
    expect(toggleTabGroupCollapsed(groups, 'g1', false)[0]?.collapsed).toBe(false);
  });

  it('clamps a group move rather than wrapping it around the strip', () => {
    const groups = [group('g1'), group('g2'), group('g3')];
    expect(moveTabGroup(groups, 'g1', -1).map((g) => g.id)).toEqual(['g1', 'g2', 'g3']);
    expect(moveTabGroup(groups, 'g1', 1).map((g) => g.id)).toEqual(['g2', 'g1', 'g3']);
    expect(moveTabGroup(groups, 'g1', 99).map((g) => g.id)).toEqual(['g2', 'g3', 'g1']);
  });

  it('releases a removed group’s tabs instead of closing them', () => {
    const result = removeTabGroup([group('g1'), group('g2')], { a: 'g1', b: 'g2' }, 'g1');
    expect(result.groups.map((g) => g.id)).toEqual(['g2']);
    // `a` is now ungrouped. It is emphatically still a tab.
    expect(result.membership).toEqual({ b: 'g2' });
  });

  it('treats into, out of and between as one reassignment', () => {
    let membership = assignTabToGroup({}, 'a', 'g1');
    expect(membership).toEqual({ a: 'g1' });
    membership = assignTabToGroup(membership, 'a', 'g2');
    expect(membership).toEqual({ a: 'g2' });
    membership = assignTabToGroup(membership, 'a', null);
    expect(membership).toEqual({});
  });

  it('picks an unused colour for a new group, then rotates once they run out', () => {
    expect(nextTabGroupColor([])).toBe('sky');
    expect(nextTabGroupColor([group('g1', { color: 'sky' })])).toBe('grape');
    const all = ['sky', 'grape', 'citrus', 'moss', 'clay', 'slate'] as const;
    const taken = all.map((color, index) => group(`g${index}`, { color }));
    expect(all).toContain(nextTabGroupColor(taken));
  });

  it('creates a group with the default colour and no name', () => {
    expect(createTabGroup({ id: 'g1' })).toEqual({
      id: 'g1',
      name: '',
      color: DEFAULT_TAB_GROUP_COLOR,
      collapsed: false,
    });
  });
});

describe('collapsed-group lookups', () => {
  it('reports a tab inside a collapsed group without changing anything', () => {
    const groups = [group('g1', { collapsed: true }), group('g2')];
    expect(isTabInCollapsedGroup(groups, { a: 'g1' }, 'a')).toBe(true);
    expect(isTabInCollapsedGroup(groups, { b: 'g2' }, 'b')).toBe(false);
    expect(isTabInCollapsedGroup(groups, {}, 'c')).toBe(false);
    // The whole point: asking did not expand it.
    expect(groups[0]?.collapsed).toBe(true);
  });

  it('resolves a tab’s group id, and null for an ungrouped one', () => {
    expect(groupIdForTab({ a: 'g1' }, 'a')).toBe('g1');
    expect(groupIdForTab({ a: 'g1' }, 'b')).toBeNull();
    expect(groupIdForTab(undefined, 'a')).toBeNull();
  });

  it('lists a group’s members in strip order', () => {
    expect(tabIdsInGroup(['a', 'b', 'c'].map(tab), { c: 'g1', a: 'g1' }, 'g1')).toEqual(['a', 'c']);
  });
});

// Tab groups: the model, and the shape that has to survive a restart.
//
// Three rules shape this file, and they are the reason it is pure.
//
// 1. **Membership is a map, order is a list.** A group does not own an array of
//    tab ids. It would immediately disagree with `state.tabs` — the strip's own
//    order, which drag-reorder rewrites — and then two sources of truth would
//    have to be reconciled on every drop. Instead `tabId -> groupId` says which
//    group a tab is in, `groups` says what order the groups sit in, and the
//    order of tabs *within* a group is simply their order in `state.tabs`.
//    Nothing can drift, because there is only one list.
// 2. **Empty groups are kept.** A group whose last tab was dragged out is still
//    a group the user named, coloured and may be about to refill. Removal is an
//    explicit act (`removeTabGroup`), never a side effect of a move.
// 3. **The reader trusts nothing.** Groups are persisted into the same
//    localStorage payload as the tabs, which outlives the code that wrote it.
//    Parsing is total: a v2 payload has no groups at all, a hand-edited one can
//    hold numbers, unknown colours, duplicate ids or membership pointing at a
//    group that was deleted two sessions ago. Every one of those has to restore
//    a usable strip rather than throw.

/** The colours a group header can take. Names, not hex: the values live in the
 *  stylesheet, and a stored colour survives a change to what they resolve to.
 *
 *  They do not move with the theme, and should not. Each name is a promise
 *  about a hue, so a "Sky" group that came out olive would be a worse answer
 *  than a fixed one, and the six have to stay apart from each other across a
 *  strip. The contract has no blue and no purple to map them onto anyway. The
 *  stylesheet records that decision on each rule rather than leaving the fixed
 *  values looking like an oversight. */
export const TAB_GROUP_COLORS = [
  'sky',
  'grape',
  'citrus',
  'moss',
  'clay',
  'slate',
] as const;

export type TabGroupColor = (typeof TAB_GROUP_COLORS)[number];

export const DEFAULT_TAB_GROUP_COLOR: TabGroupColor = 'sky';

/** Bumped when the payload gains a field. v1 had no pins, v2 had no groups. */
export const WORKSPACE_TAB_GROUPS_MAX_NAME_LENGTH = 64;

export interface WorkspaceTabGroup {
  id: string;
  name: string;
  color: TabGroupColor;
  collapsed: boolean;
}

/** `tabId -> groupId`. A tab with no entry is ungrouped. */
export type TabGroupMembership = Readonly<Record<string, string>>;

export interface TabGroupSection<T> {
  group: WorkspaceTabGroup;
  tabs: T[];
}

export interface TabGroupPartition<T> {
  sections: TabGroupSection<T>[];
  ungrouped: T[];
}

function isTabGroupColor(value: unknown): value is TabGroupColor {
  return typeof value === 'string' && (TAB_GROUP_COLORS as readonly string[]).includes(value);
}

/**
 * Bound the length and flatten anything that would break a single-line label.
 *
 * Deliberately does NOT trim. The rename field writes straight through this on
 * every keystroke, and a trim there makes multi-word names impossible to type:
 * "Design " becomes "Design", so the next character produces "Designs" and the
 * space can never be entered. Leading and trailing space is therefore kept in
 * the model and dropped at the point of *display* instead — see
 * `tabGroupDisplayName`.
 *
 * An empty result stays empty: what an unnamed group is *called* is copy, and
 * therefore translated, which is not a decision the model gets to make.
 */
export function normalizeTabGroupName(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\r\n\t]+/gu, ' ')
    .slice(0, WORKSPACE_TAB_GROUPS_MAX_NAME_LENGTH);
}

/** What a group is called on screen: its name, or the caller's translated
 *  fallback when it has not been named. One helper so every surface — the
 *  strip header, the three menus, the four searches and the appearance editor
 *  — agrees about what an unnamed group is called. */
export function tabGroupDisplayName(group: WorkspaceTabGroup, fallback: string): string {
  return group.name.trim() || fallback;
}

export function createTabGroup(options: {
  id: string;
  name?: string;
  color?: TabGroupColor;
  collapsed?: boolean;
}): WorkspaceTabGroup {
  return {
    id: options.id,
    name: normalizeTabGroupName(options.name),
    color: options.color && isTabGroupColor(options.color) ? options.color : DEFAULT_TAB_GROUP_COLOR,
    collapsed: options.collapsed === true,
  };
}

/** Pick the colour a new group should get: the first one not already in use,
 *  falling back to rotating through the palette once every colour is taken.
 *  Two adjacent groups in the same colour are indistinguishable at a glance,
 *  which is the entire point of the colour. */
export function nextTabGroupColor(groups: readonly WorkspaceTabGroup[]): TabGroupColor {
  const used = new Set(groups.map((group) => group.color));
  const free = TAB_GROUP_COLORS.find((color) => !used.has(color));
  return free ?? TAB_GROUP_COLORS[groups.length % TAB_GROUP_COLORS.length]!;
}

/** Total. Unknown shapes become an empty list, unknown fields take defaults,
 *  duplicate ids keep the first occurrence. */
export function sanitizeTabGroups(value: unknown): WorkspaceTabGroup[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const groups: WorkspaceTabGroup[] = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    const id = typeof record.id === 'string' ? record.id.trim() : '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    groups.push({
      id,
      name: normalizeTabGroupName(record.name),
      color: isTabGroupColor(record.color) ? record.color : DEFAULT_TAB_GROUP_COLOR,
      collapsed: record.collapsed === true,
    });
  }
  return groups;
}

/** Total. Every key and value must be a non-empty string; anything else is
 *  dropped rather than allowed to become a group id nothing can resolve. */
export function sanitizeTabGroupMembership(value: unknown): Record<string, string> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {};
  const membership: Record<string, string> = {};
  for (const [tabId, groupId] of Object.entries(value as Record<string, unknown>)) {
    if (typeof groupId !== 'string') continue;
    const tab = tabId.trim();
    const group = groupId.trim();
    if (!tab || !group) continue;
    membership[tab] = group;
  }
  return membership;
}

/**
 * Drop membership entries whose tab is gone or whose group no longer exists.
 * Groups themselves are kept whether or not anything is in them — see rule 2.
 *
 * Returns the input object itself when nothing changed, so a caller can use
 * reference equality to skip a re-render.
 */
export function reconcileTabGroupMembership(
  membership: TabGroupMembership | undefined,
  groups: readonly WorkspaceTabGroup[],
  availableTabIds: readonly string[],
): TabGroupMembership {
  const source = membership ?? {};
  const groupIds = new Set(groups.map((group) => group.id));
  const tabIds = new Set(availableTabIds);
  const kept: Record<string, string> = {};
  let changed = false;
  for (const [tabId, groupId] of Object.entries(source)) {
    if (!tabIds.has(tabId) || !groupIds.has(groupId)) {
      changed = true;
      continue;
    }
    kept[tabId] = groupId;
  }
  return changed ? kept : source;
}

export function groupIdForTab(
  membership: TabGroupMembership | undefined,
  tabId: string,
): string | null {
  const groupId = (membership ?? {})[tabId];
  return typeof groupId === 'string' && groupId ? groupId : null;
}

export function findTabGroup(
  groups: readonly WorkspaceTabGroup[],
  groupId: string | null,
): WorkspaceTabGroup | null {
  if (!groupId) return null;
  return groups.find((group) => group.id === groupId) ?? null;
}

/** True when the tab is in a group that is currently collapsed. The four
 *  discovery searches use it to label a result honestly, and to reveal it
 *  WITHOUT flipping the group open — the collapsed state is a preference the
 *  user set, and a search result is not permission to discard it. */
export function isTabInCollapsedGroup(
  groups: readonly WorkspaceTabGroup[],
  membership: TabGroupMembership | undefined,
  tabId: string,
): boolean {
  const group = findTabGroup(groups, groupIdForTab(membership, tabId));
  return group !== null && group.collapsed;
}

/**
 * Split a flat tab list into its group sections plus the ungrouped remainder.
 *
 * Sections come out in `groups` order — that is what makes group reordering a
 * one-line array move — and the tabs inside each section keep their order from
 * the input list, which is the strip's own order.
 */
export function partitionTabsByGroup<T extends { id: string }>(
  tabs: readonly T[],
  groups: readonly WorkspaceTabGroup[],
  membership: TabGroupMembership | undefined,
): TabGroupPartition<T> {
  const byGroup = new Map<string, T[]>();
  const ungrouped: T[] = [];
  for (const tab of tabs) {
    const groupId = groupIdForTab(membership, tab.id);
    if (!groupId) {
      ungrouped.push(tab);
      continue;
    }
    const bucket = byGroup.get(groupId);
    if (bucket) bucket.push(tab);
    else byGroup.set(groupId, [tab]);
  }
  const sections = groups.map((group) => ({ group, tabs: byGroup.get(group.id) ?? [] }));
  // A membership entry pointing at a group that is not in `groups` should have
  // been reconciled away; if one survives, its tabs must still render rather
  // than vanish from the strip.
  for (const [groupId, bucket] of byGroup) {
    if (!groups.some((group) => group.id === groupId)) ungrouped.push(...bucket);
  }
  return { sections, ungrouped };
}

/**
 * Rewrite a tab list so every group's members are contiguous and the groups
 * appear in `groups` order, with ungrouped tabs last.
 *
 * The strip renders from the partition above, so this is not what makes the
 * groups *look* right — it is what makes the arithmetic right. Drag-reorder
 * splices one array by index; if the underlying list interleaved two groups,
 * a drop that looked like "third in this group" would land somewhere else
 * entirely. Ordering the source list means the visible order and the stored
 * order are the same order.
 *
 * Returns the input array itself when the order already holds.
 */
export function orderTabsByGroupMembership<T extends { id: string }>(
  tabs: T[],
  groups: readonly WorkspaceTabGroup[],
  membership: TabGroupMembership | undefined,
  isSticky: (tab: T) => boolean,
): T[] {
  if (tabs.length < 2 || groups.length === 0) return tabs;
  const rank = new Map(groups.map((group, index) => [group.id, index] as const));
  const sticky: T[] = [];
  const buckets = new Map<number, T[]>();
  const ungrouped: T[] = [];
  for (const tab of tabs) {
    if (isSticky(tab)) {
      sticky.push(tab);
      continue;
    }
    const groupRank = rank.get(groupIdForTab(membership, tab.id) ?? '');
    if (groupRank === undefined) {
      ungrouped.push(tab);
      continue;
    }
    const bucket = buckets.get(groupRank);
    if (bucket) bucket.push(tab);
    else buckets.set(groupRank, [tab]);
  }
  const ordered = [...sticky];
  for (let index = 0; index < groups.length; index += 1) {
    const bucket = buckets.get(index);
    if (bucket) ordered.push(...bucket);
  }
  ordered.push(...ungrouped);
  return ordered.every((tab, index) => tab === tabs[index]) ? tabs : ordered;
}

export function renameTabGroup(
  groups: readonly WorkspaceTabGroup[],
  groupId: string,
  name: string,
): WorkspaceTabGroup[] {
  const next = normalizeTabGroupName(name);
  return groups.map((group) => (group.id === groupId ? { ...group, name: next } : group));
}

export function setTabGroupColor(
  groups: readonly WorkspaceTabGroup[],
  groupId: string,
  color: TabGroupColor,
): WorkspaceTabGroup[] {
  if (!isTabGroupColor(color)) return groups.slice();
  return groups.map((group) => (group.id === groupId ? { ...group, color } : group));
}

export function toggleTabGroupCollapsed(
  groups: readonly WorkspaceTabGroup[],
  groupId: string,
  next?: boolean,
): WorkspaceTabGroup[] {
  return groups.map((group) =>
    group.id === groupId ? { ...group, collapsed: next ?? !group.collapsed } : group,
  );
}

/** Move a group by `offset` positions. Clamped rather than wrapped: a group at
 *  the left edge nudged left should stay put, not teleport to the right end. */
export function moveTabGroup(
  groups: readonly WorkspaceTabGroup[],
  groupId: string,
  offset: number,
): WorkspaceTabGroup[] {
  const index = groups.findIndex((group) => group.id === groupId);
  if (index < 0 || offset === 0) return groups.slice();
  const target = Math.max(0, Math.min(groups.length - 1, index + offset));
  if (target === index) return groups.slice();
  const next = groups.slice();
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved!);
  return next;
}

/**
 * Remove a group. Its tabs are NOT closed — they become ungrouped and stay in
 * the strip. Losing a tab because a group was tidied away would make grouping
 * a destructive operation, which is exactly what it must never be.
 */
export function removeTabGroup(
  groups: readonly WorkspaceTabGroup[],
  membership: TabGroupMembership | undefined,
  groupId: string,
): { groups: WorkspaceTabGroup[]; membership: Record<string, string> } {
  const source = membership ?? {};
  const nextMembership: Record<string, string> = {};
  for (const [tabId, id] of Object.entries(source)) {
    if (id !== groupId) nextMembership[tabId] = id;
  }
  return {
    groups: groups.filter((group) => group.id !== groupId),
    membership: nextMembership,
  };
}

/** Put a tab into a group, or take it out of every group when `groupId` is
 *  null. One call covers "into", "out of" and "between": a tab belongs to at
 *  most one group, so a move is a reassignment, not a remove-then-add. */
export function assignTabToGroup(
  membership: TabGroupMembership | undefined,
  tabId: string,
  groupId: string | null,
): Record<string, string> {
  const next = { ...(membership ?? {}) };
  if (groupId) next[tabId] = groupId;
  else delete next[tabId];
  return next;
}

export function tabIdsInGroup(
  tabs: readonly { id: string }[],
  membership: TabGroupMembership | undefined,
  groupId: string,
): string[] {
  return tabs.filter((tab) => groupIdForTab(membership, tab.id) === groupId).map((tab) => tab.id);
}

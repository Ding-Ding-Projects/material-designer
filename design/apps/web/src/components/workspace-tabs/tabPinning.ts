// Pinned tabs, and the persisted shape that has to survive a restart.
//
// Two rules shape this file.
//
// 1. The pins live in the SAME localStorage payload as the tabs, not in a
//    second key. A workspace that restored its tabs but lost its pins (or the
//    reverse) is worse than one that lost both, because the strip then looks
//    right and behaves wrong. One write, one read, one shape.
// 2. The reader trusts nothing. The stored payload is user-writable data that
//    outlives the code that wrote it: a v1 payload has no `pinnedTabIds` at
//    all, a hand-edited one can hold numbers, duplicates or ids for tabs that
//    were closed three sessions ago. Every one of those cases has to restore a
//    usable strip rather than throw, so parsing is total and reconciliation
//    against the live tab list happens on every normalize, not only on load.

import {
  sanitizeTabGroupMembership,
  sanitizeTabGroups,
  type WorkspaceTabGroup,
} from './tabGroups';
import {
  sanitizeTabGroupDecorations,
  type TabGroupDecoration,
} from './groupAppearance';

/**
 * Bumped when the payload gains a field. v1 payloads simply carry no version;
 * v2 carried pins but no groups; v3 carries the groups, their membership and
 * their decorations in the same write as the tabs — for the same reason the
 * pins are in it, stated in rule 1 above. A workspace that restored its tabs
 * and lost which group they were in looks right and behaves wrong.
 */
export const WORKSPACE_TABS_PAYLOAD_VERSION = 3;

export interface StoredWorkspaceTabsPayload {
  /** Left as `unknown[]`: reviving a tab is the tab bar's job, not this file's. */
  tabs: unknown[];
  activeTabId: string;
  pinnedTabIds: string[];
  groups: WorkspaceTabGroup[];
  /** `tabId -> groupId`, already reconciled against `groups`. */
  groupMembership: Record<string, string>;
  groupDecorations: Record<string, TabGroupDecoration>;
}

/**
 * Read a stored payload of any vintage. Returns `null` only when there is
 * nothing usable at all — a missing key, unparseable JSON, or a non-object —
 * so the caller can tell "no saved workspace" apart from "saved workspace with
 * no pins", which are different situations with the same empty pin list.
 */
export function parseStoredWorkspaceTabsPayload(
  raw: string | null | undefined,
): StoredWorkspaceTabsPayload | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  return {
    tabs: Array.isArray(record.tabs) ? record.tabs : [],
    activeTabId: typeof record.activeTabId === 'string' ? record.activeTabId : '',
    // v1 payloads reach this line with `undefined`, which sanitizes to `[]`:
    // an upgrade restores every tab and simply starts with nothing pinned.
    pinnedTabIds: sanitizePinnedTabIds(record.pinnedTabIds),
    // v1 and v2 payloads reach these with `undefined` too, and sanitize to
    // empty: an upgrade restores every tab with no groups, which is exactly the
    // state the user was already in.
    groups: sanitizeTabGroups(record.groups),
    groupMembership: sanitizeTabGroupMembership(record.groupMembership),
    groupDecorations: sanitizeTabGroupDecorations(record.groupDecorations),
  };
}

/** Serialize the state the tab bar holds. Always writes the current version. */
export function serializeWorkspaceTabsPayload(state: {
  tabs: unknown[];
  activeTabId: string;
  pinnedTabIds?: readonly string[];
  groups?: readonly WorkspaceTabGroup[];
  groupMembership?: Readonly<Record<string, string>>;
  groupDecorations?: Readonly<Record<string, TabGroupDecoration>>;
}): string {
  return JSON.stringify({
    version: WORKSPACE_TABS_PAYLOAD_VERSION,
    tabs: state.tabs,
    activeTabId: state.activeTabId,
    pinnedTabIds: sanitizePinnedTabIds(state.pinnedTabIds),
    groups: sanitizeTabGroups(state.groups),
    groupMembership: sanitizeTabGroupMembership(state.groupMembership),
    groupDecorations: sanitizeTabGroupDecorations(state.groupDecorations),
  });
}

/** Non-empty strings, first occurrence wins, everything else dropped. */
export function sanitizePinnedTabIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const id = entry.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/**
 * Drop pins whose tab is gone, keeping the user's pin order for the ones that
 * remain. Returns the input array itself when nothing changed so callers can
 * use reference equality to skip a re-render.
 */
export function reconcilePinnedTabIds(
  pinnedTabIds: readonly string[] | undefined,
  availableTabIds: readonly string[],
): readonly string[] {
  const sanitized = pinnedTabIds ?? [];
  const available = new Set(availableTabIds);
  const kept = sanitized.filter((id) => available.has(id));
  return kept.length === sanitized.length ? sanitized : kept;
}

/**
 * The strip's stable regions, in order: permanent tabs (the entry tab, which
 * is permanent whatever section it shows), then pinned tabs in the user's pin
 * order, then everything else in its existing order.
 *
 * Returns the input array itself when the order already holds — `reorderTab`
 * compares by reference to decide whether a drag actually moved anything.
 */
export function orderTabsWithPinnedFirst<T extends { id: string }>(
  tabs: T[],
  pinnedTabIds: readonly string[],
  isPermanent: (tab: T) => boolean,
): T[] {
  if (tabs.length < 2) return tabs;
  const pinnedRank = new Map(pinnedTabIds.map((id, index) => [id, index] as const));
  const permanent: T[] = [];
  const pinned: T[] = [];
  const rest: T[] = [];
  for (const tab of tabs) {
    if (isPermanent(tab)) permanent.push(tab);
    else if (pinnedRank.has(tab.id)) pinned.push(tab);
    else rest.push(tab);
  }
  pinned.sort((a, b) => (pinnedRank.get(a.id) ?? 0) - (pinnedRank.get(b.id) ?? 0));
  const ordered = [...permanent, ...pinned, ...rest];
  return ordered.every((tab, index) => tab === tabs[index]) ? tabs : ordered;
}

/**
 * Pin or unpin one tab. `next` states the intent explicitly so a caller that
 * knows what it wants (a menu item labelled "Unpin") cannot accidentally
 * toggle a stale value back on.
 */
export function togglePinnedTabId(
  pinnedTabIds: readonly string[],
  tabId: string,
  next?: boolean,
): readonly string[] {
  const isPinned = pinnedTabIds.includes(tabId);
  const shouldPin = next ?? !isPinned;
  if (shouldPin === isPinned) return pinnedTabIds;
  return shouldPin
    ? [...pinnedTabIds, tabId]
    : pinnedTabIds.filter((id) => id !== tabId);
}

export function isTabPinned(
  pinnedTabIds: readonly string[] | undefined,
  tabId: string,
): boolean {
  return (pinnedTabIds ?? []).includes(tabId);
}

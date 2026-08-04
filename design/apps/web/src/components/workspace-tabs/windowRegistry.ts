// The master tab search needs tabs it cannot see.
//
// Three of the four discovery searches read `state.tabs` directly, because they
// are about the strip in front of the user. The fourth is defined as "every
// open tab across all windows, workspaces, strips and groups the app owns" —
// and a React component can only ever see its own window's state.
//
// So each window publishes a snapshot of its strip into `localStorage` under
// its own key, and the master search reads every key back. `localStorage` is
// the right transport rather than a clever one: it is shared by every window of
// the same profile (browser tabs and Electron `BrowserWindow`s alike), it
// already carries the workspace payload, and it raises a `storage` event in the
// *other* windows on write, so a master search stays live without polling.
//
// Two failure modes are designed for rather than hoped against:
//
//   * **A window that closed without cleaning up.** A crash, a kill, a machine
//     that slept. Every snapshot carries `updatedAt` and is republished on a
//     heartbeat; a snapshot older than the TTL is treated as gone and pruned on
//     the next read. Nothing shows tabs from a window that is not there.
//   * **A hand-edited or half-written payload.** Parsing is total, exactly as
//     it is for the workspace payload itself: an unreadable snapshot is skipped,
//     never thrown from, so one corrupt key cannot take the search down.

export const WORKSPACE_TAB_WINDOW_KEY_PREFIX = 'open-design:workspace-tabs:window:';

/** A snapshot older than this is treated as a window that is gone. Comfortably
 *  more than the heartbeat below, so an idle-but-alive window is never pruned
 *  out from under a search that is looking at it. */
export const WORKSPACE_TAB_WINDOW_TTL_MS = 90_000;

/** How often a live window republishes, independently of state changes. */
export const WORKSPACE_TAB_WINDOW_HEARTBEAT_MS = 25_000;

export interface WorkspaceTabWindowTab {
  id: string;
  title: string;
  meta: string;
  pinned: boolean;
  active: boolean;
  groupId: string | null;
  groupName: string | null;
  /** True when this tab's group is collapsed in that window right now. */
  groupCollapsed: boolean;
}

export interface WorkspaceTabWindowSnapshot {
  windowId: string;
  /** The strip this snapshot describes. One window, one strip today; the field
   *  exists so a second strip does not need a second storage shape. */
  stripId: string;
  updatedAt: number;
  tabs: WorkspaceTabWindowTab[];
}

export function workspaceTabWindowKey(windowId: string): string {
  return `${WORKSPACE_TAB_WINDOW_KEY_PREFIX}${windowId}`;
}

export function isWorkspaceTabWindowKey(key: string): boolean {
  return key.startsWith(WORKSPACE_TAB_WINDOW_KEY_PREFIX);
}

/** A random id for this window. Not persisted: a reloaded window is a new
 *  publisher, and the old snapshot ages out on its own. */
export function createWorkspaceTabWindowId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function sanitizeTab(value: unknown): WorkspaceTabWindowTab | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === 'string' ? record.id.trim() : '';
  if (!id) return null;
  return {
    id,
    title: typeof record.title === 'string' ? record.title : '',
    meta: typeof record.meta === 'string' ? record.meta : '',
    pinned: record.pinned === true,
    active: record.active === true,
    groupId: typeof record.groupId === 'string' && record.groupId ? record.groupId : null,
    groupName: typeof record.groupName === 'string' && record.groupName ? record.groupName : null,
    groupCollapsed: record.groupCollapsed === true,
  };
}

/** Total. Returns null for anything that is not a usable snapshot. */
export function parseWorkspaceTabWindowSnapshot(
  raw: string | null | undefined,
): WorkspaceTabWindowSnapshot | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  const windowId = typeof record.windowId === 'string' ? record.windowId.trim() : '';
  if (!windowId) return null;
  const tabs = Array.isArray(record.tabs)
    ? record.tabs.map(sanitizeTab).filter((tab): tab is WorkspaceTabWindowTab => tab !== null)
    : [];
  return {
    windowId,
    stripId: typeof record.stripId === 'string' && record.stripId ? record.stripId : 'workspace',
    updatedAt: typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt)
      ? record.updatedAt
      : 0,
    tabs,
  };
}

export function serializeWorkspaceTabWindowSnapshot(
  snapshot: WorkspaceTabWindowSnapshot,
): string {
  return JSON.stringify(snapshot);
}

/** The minimal storage surface this module needs. Declared rather than taking
 *  `Storage` so a test can hand it a plain object. */
export interface WorkspaceTabWindowStorage {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function publishWorkspaceTabWindowSnapshot(
  storage: WorkspaceTabWindowStorage,
  snapshot: WorkspaceTabWindowSnapshot,
): void {
  try {
    storage.setItem(
      workspaceTabWindowKey(snapshot.windowId),
      serializeWorkspaceTabWindowSnapshot(snapshot),
    );
  } catch {
    // A full or blocked store must not break the strip. The master search then
    // simply does not see this window, which it reports honestly.
  }
}

export function removeWorkspaceTabWindowSnapshot(
  storage: WorkspaceTabWindowStorage,
  windowId: string,
): void {
  try {
    storage.removeItem(workspaceTabWindowKey(windowId));
  } catch {
    // Same reasoning as above; a stale key ages out via the TTL anyway.
  }
}

/**
 * Every live snapshot, newest first, with the stale ones pruned from storage as
 * a side effect. Pruning on read rather than on a timer keeps the cost where
 * the benefit is: the only code that cares whether a window is gone is the
 * search that is about to list it.
 */
export function readWorkspaceTabWindowSnapshots(
  storage: WorkspaceTabWindowStorage,
  now: number,
  ttlMs: number = WORKSPACE_TAB_WINDOW_TTL_MS,
): WorkspaceTabWindowSnapshot[] {
  const keys: string[] = [];
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key && isWorkspaceTabWindowKey(key)) keys.push(key);
    }
  } catch {
    return [];
  }

  const snapshots: WorkspaceTabWindowSnapshot[] = [];
  const stale: string[] = [];
  for (const key of keys) {
    let raw: string | null = null;
    try {
      raw = storage.getItem(key);
    } catch {
      continue;
    }
    const snapshot = parseWorkspaceTabWindowSnapshot(raw);
    if (!snapshot) {
      stale.push(key);
      continue;
    }
    if (now - snapshot.updatedAt > ttlMs) {
      stale.push(key);
      continue;
    }
    snapshots.push(snapshot);
  }
  for (const key of stale) {
    try {
      storage.removeItem(key);
    } catch {
      // Best effort; the TTL check above already excluded it from the results.
    }
  }
  return snapshots.sort((a, b) => b.updatedAt - a.updatedAt);
}

export interface MasterTabResult extends WorkspaceTabWindowTab {
  windowId: string;
  stripId: string;
  /** True when the result is in the window doing the searching. */
  isCurrentWindow: boolean;
  /** 1-based, stable within one read, for labelling "Window 2". */
  windowIndex: number;
}

/**
 * Flatten every snapshot into one result list, with the searching window's own
 * tabs first. A result from another window is still identified in full — window,
 * strip, group, pinned state and label — because "which window is that in" is
 * the only question the master search exists to answer.
 */
export function flattenWorkspaceTabWindowSnapshots(
  snapshots: readonly WorkspaceTabWindowSnapshot[],
  currentWindowId: string,
): MasterTabResult[] {
  const ordered = [...snapshots].sort((a, b) => {
    if (a.windowId === currentWindowId) return -1;
    if (b.windowId === currentWindowId) return 1;
    return b.updatedAt - a.updatedAt;
  });
  const results: MasterTabResult[] = [];
  ordered.forEach((snapshot, index) => {
    for (const tab of snapshot.tabs) {
      results.push({
        ...tab,
        windowId: snapshot.windowId,
        stripId: snapshot.stripId,
        isCurrentWindow: snapshot.windowId === currentWindowId,
        windowIndex: index + 1,
      });
    }
  });
  return results;
}

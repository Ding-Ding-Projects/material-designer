// Every notification the application raises, kept.
//
// The product already had toasts, and a toast is by design a thing that goes
// away: `Toast.tsx` counts down a TTL and then unmounts, and the sentence it
// carried is gone from the session with nothing that remembers it. That is the
// right behaviour for "copied to clipboard" and the wrong behaviour for almost
// everything else — a user who looked away for forty seconds while a run
// finished has no route back to what they were told.
//
// So the *record* is the primitive here, not the toast. `notify()` writes a
// record; the record lives in the history whether or not anything is mounted to
// draw it, and the on-screen stack is one view over the records that are still
// `live`. Dismissing clears `live` and never removes the record, because
// dismissing means "I have seen it", not "it never happened".
//
// The store is a module singleton rather than a React context on purpose. A
// notification is raised from click handlers, from promise rejections, from
// effects in components that are about to unmount, and from modules that are
// not components at all; requiring a hook to reach it would mean every one of
// those callers first has to be given a way to see the tree.

import { useSyncExternalStore } from 'react';

/**
 * What kind of thing happened. This decides two things and nothing else: which
 * ARIA politeness the toast is announced at, and whether it auto-dismisses.
 *
 * `progress` is deliberately distinct from `info`: it says work is under way,
 * so it is announced politely and lingers a little longer than a plain notice,
 * but it is still only telling the user something — it never gates anything.
 */
export type NotificationSeverity = 'info' | 'success' | 'progress' | 'warning' | 'error';

export interface NotificationAction {
  label: string;
  run: () => void;
}

export interface NotificationRecord {
  id: string;
  severity: NotificationSeverity;
  title: string;
  body: string | null;
  /**
   * The label of the action the notification carried, recorded separately from
   * the callback. The history has to be able to say "this one offered Retry"
   * long after the closure behind it stopped being meaningful.
   */
  actionLabel: string | null;
  action: NotificationAction | null;
  createdAt: number;
  /** Still on screen as a toast. Cleared by dismissal or by the TTL. */
  live: boolean;
  read: boolean;
}

export interface NotificationInput {
  severity: NotificationSeverity;
  title: string;
  body?: string | null;
  action?: NotificationAction | null;
  /** Override the severity's own lifetime. `0` pins the toast open. */
  ttlMs?: number;
  /**
   * Record it without raising a toast for it.
   *
   * For the surfaces that already draw their own transient message — the
   * in-panel `Toast` a tab owns, an inline error beside the control that
   * failed. Those messages should still be reviewable afterwards, which is the
   * whole point of the history, but announcing them a second time in the
   * corner would put two copies of one sentence on screen at once. A silent
   * record lands in the centre unread, exactly like a loud one.
   */
  silent?: boolean;
}

/**
 * How long each severity stays on screen.
 *
 * Errors and warnings are `0` — they persist until the user dismisses them.
 * That is the whole difference between "here is what happened" and "here is
 * what went wrong": the second one must not be able to expire unread while the
 * user is looking at something else.
 */
export const NOTIFICATION_TTL_MS: Record<NotificationSeverity, number> = {
  info: 5_000,
  success: 4_000,
  progress: 6_000,
  warning: 0,
  error: 0,
};

/** The history is bounded so a long session cannot grow it without limit. */
export const NOTIFICATION_HISTORY_LIMIT = 200;

/**
 * How many live toasts the corner stack draws at once. Beyond this the extras
 * stay live in the centre and the stack says how many it is not showing —
 * quietly dropping them would be the one failure this whole file exists to
 * prevent.
 */
export const NOTIFICATION_STACK_LIMIT = 4;

const EMPTY: readonly NotificationRecord[] = [];

let records: readonly NotificationRecord[] = EMPTY;
const listeners = new Set<() => void>();
const timers = new Map<string, number>();
let seq = 0;

function emit(): void {
  for (const listener of [...listeners]) listener();
}

function commit(next: readonly NotificationRecord[]): void {
  records = next;
  emit();
}

function clearTimer(id: string): void {
  const handle = timers.get(id);
  if (handle === undefined) return;
  timers.delete(id);
  if (typeof window !== 'undefined') window.clearTimeout(handle);
}

/**
 * Raise a notification. Returns its id so a caller can dismiss or supersede its
 * own earlier one — a progress line replaced by its outcome, say.
 *
 * The TTL is owned here rather than by the toast component so a record's
 * lifetime is the same whether or not anything is drawing it. A success raised
 * while the window is on another route still stops being live on schedule, and
 * still lands in the history the moment it is raised.
 */
export function notify(input: NotificationInput): string {
  seq += 1;
  const id = `od-notification-${seq}`;
  const live = input.silent !== true;
  const record: NotificationRecord = {
    id,
    severity: input.severity,
    title: input.title,
    body: input.body ?? null,
    actionLabel: input.action?.label ?? null,
    action: input.action ?? null,
    createdAt: Date.now(),
    live,
    read: false,
  };
  commit([record, ...records].slice(0, NOTIFICATION_HISTORY_LIMIT));
  const ttl = input.ttlMs ?? NOTIFICATION_TTL_MS[input.severity];
  if (live && ttl > 0 && typeof window !== 'undefined') {
    timers.set(
      id,
      window.setTimeout(() => dismissNotification(id), ttl),
    );
  }
  return id;
}

/** Take it off the screen. It stays in the history, unread until read. */
export function dismissNotification(id: string): void {
  clearTimer(id);
  let changed = false;
  const next = records.map((record) => {
    if (record.id !== id || !record.live) return record;
    changed = true;
    return { ...record, live: false };
  });
  if (changed) commit(next);
}

export function markNotificationRead(id: string): void {
  let changed = false;
  const next = records.map((record) => {
    if (record.id !== id || record.read) return record;
    changed = true;
    return { ...record, read: true };
  });
  if (changed) commit(next);
}

export function markAllNotificationsRead(): void {
  let changed = false;
  const next = records.map((record) => {
    if (record.read) return record;
    changed = true;
    return { ...record, read: true };
  });
  if (changed) commit(next);
}

/**
 * Empty the history. Every pending TTL goes with it, so a record cannot be
 * resurrected as "dismissed" a moment after it stopped existing.
 */
export function clearNotifications(): void {
  for (const id of [...timers.keys()]) clearTimer(id);
  if (records.length === 0) return;
  commit(EMPTY);
}

export function readNotifications(): readonly NotificationRecord[] {
  return records;
}

export function subscribeNotifications(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function serverSnapshot(): readonly NotificationRecord[] {
  return EMPTY;
}

/** Newest first. */
export function useNotifications(): readonly NotificationRecord[] {
  return useSyncExternalStore(subscribeNotifications, readNotifications, serverSnapshot);
}

export function unreadNotificationCount(list: readonly NotificationRecord[]): number {
  return list.reduce((count, record) => (record.read ? count : count + 1), 0);
}

export function liveNotifications(
  list: readonly NotificationRecord[],
): readonly NotificationRecord[] {
  return list.filter((record) => record.live);
}

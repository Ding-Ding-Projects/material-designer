// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  NOTIFICATION_HISTORY_LIMIT,
  NOTIFICATION_TTL_MS,
  clearNotificationIds,
  clearNotifications,
  dismissNotification,
  liveNotifications,
  markAllNotificationsRead,
  markNotificationIdsRead,
  markNotificationRead,
  notify,
  readNotifications,
  invertNotificationIds,
  selectAllNotificationIds,
  setNotificationQuietMode,
  subscribeNotifications,
  unreadNotificationCount,
} from '../../../src/components/notifications/notificationStore';

beforeEach(() => {
  setNotificationQuietMode(false);
  clearNotifications();
});

afterEach(() => {
  setNotificationQuietMode(false);
  clearNotifications();
  vi.useRealTimers();
});

describe('notificationStore — recording', () => {
  it('records severity, title, body, timestamp and the action it carried', () => {
    const before = Date.now();
    notify({
      severity: 'error',
      title: 'Could not open the project',
      body: 'The daemon refused the request.',
      action: { label: 'Retry', run: () => {} },
    });

    const [record] = readNotifications();
    expect(record).toBeTruthy();
    expect(record?.severity).toBe('error');
    expect(record?.title).toBe('Could not open the project');
    expect(record?.body).toBe('The daemon refused the request.');
    expect(record?.actionLabel).toBe('Retry');
    expect(record?.createdAt).toBeGreaterThanOrEqual(before);
    expect(record?.live).toBe(true);
    expect(record?.read).toBe(false);
  });

  it('keeps the newest first', () => {
    notify({ severity: 'info', title: 'first' });
    notify({ severity: 'info', title: 'second' });
    expect(readNotifications().map((record) => record.title)).toEqual(['second', 'first']);
  });

  it('bounds the history so a long session cannot grow it without limit', () => {
    for (let index = 0; index < NOTIFICATION_HISTORY_LIMIT + 25; index += 1) {
      notify({ severity: 'info', title: `message ${index}`, silent: true });
    }
    const list = readNotifications();
    expect(list).toHaveLength(NOTIFICATION_HISTORY_LIMIT);
    expect(list[0]?.title).toBe(`message ${NOTIFICATION_HISTORY_LIMIT + 24}`);
  });
});

describe('notificationStore — what expires and what does not', () => {
  it('auto-dismisses an informational notification but keeps the record', () => {
    vi.useFakeTimers();
    notify({ severity: 'info', title: 'Screenshot copied' });
    expect(liveNotifications(readNotifications())).toHaveLength(1);

    vi.advanceTimersByTime(NOTIFICATION_TTL_MS.info);

    expect(liveNotifications(readNotifications())).toHaveLength(0);
    // The whole point: gone from the screen, still reviewable.
    expect(readNotifications()).toHaveLength(1);
    expect(readNotifications()[0]?.title).toBe('Screenshot copied');
  });

  it('never expires an error or a warning', () => {
    vi.useFakeTimers();
    notify({ severity: 'error', title: 'Upload failed' });
    notify({ severity: 'warning', title: 'Running low on disk' });

    vi.advanceTimersByTime(10 * 60 * 1000);

    expect(liveNotifications(readNotifications())).toHaveLength(2);
    expect(NOTIFICATION_TTL_MS.error).toBe(0);
    expect(NOTIFICATION_TTL_MS.warning).toBe(0);
  });

  it('records a silent notification without putting it on screen', () => {
    notify({ severity: 'success', title: 'Two projects deleted', silent: true });
    expect(liveNotifications(readNotifications())).toHaveLength(0);
    expect(readNotifications()).toHaveLength(1);
    expect(unreadNotificationCount(readNotifications())).toBe(1);
  });
});

describe('notificationStore — reviewing', () => {
  it('dismissal clears live and leaves the record behind', () => {
    const id = notify({ severity: 'error', title: 'Upload failed' });
    dismissNotification(id);
    expect(liveNotifications(readNotifications())).toHaveLength(0);
    expect(readNotifications()).toHaveLength(1);
    expect(readNotifications()[0]?.read).toBe(false);
  });

  it('counts unread and clears it one at a time or all at once', () => {
    const first = notify({ severity: 'info', title: 'a', silent: true });
    notify({ severity: 'info', title: 'b', silent: true });
    expect(unreadNotificationCount(readNotifications())).toBe(2);

    markNotificationRead(first);
    expect(unreadNotificationCount(readNotifications())).toBe(1);

    markAllNotificationsRead();
    expect(unreadNotificationCount(readNotifications())).toBe(0);
  });

  it('clearing empties the history and cancels the pending auto-dismiss', () => {
    vi.useFakeTimers();
    notify({ severity: 'info', title: 'Screenshot copied' });
    clearNotifications();
    expect(readNotifications()).toHaveLength(0);

    // The cleared record must not come back as a "dismissal" of something that
    // no longer exists.
    notify({ severity: 'error', title: 'Upload failed' });
    vi.advanceTimersByTime(NOTIFICATION_TTL_MS.info * 4);
    expect(liveNotifications(readNotifications())).toHaveLength(1);
  });

  it('clears only selected records and cancels their timers', () => {
    vi.useFakeTimers();
    const keep = notify({ severity: 'error', title: 'Keep this record' });
    const remove = notify({ severity: 'info', title: 'Remove this record' });
    clearNotificationIds(new Set([remove]));
    expect(readNotifications().map((record) => record.id)).toEqual([keep]);
    vi.advanceTimersByTime(NOTIFICATION_TTL_MS.info * 2);
    expect(readNotifications().map((record) => record.id)).toEqual([keep]);
  });

  it('keeps urgent notifications visible while low stimulation records ordinary notices', () => {
    const existing = notify({ severity: 'success', title: 'Before quiet mode' });
    setNotificationQuietMode(true);
    expect(liveNotifications(readNotifications()).map((record) => record.id)).not.toContain(existing);
    notify({ severity: 'info', title: 'Quiet info' });
    const warning = notify({ severity: 'warning', title: 'Urgent warning' });
    const error = notify({ severity: 'error', title: 'Urgent error' });
    expect(liveNotifications(readNotifications()).map((record) => record.id)).toEqual([error, warning]);
    markNotificationIdsRead(new Set([existing]));
    markNotificationIdsRead(new Set([warning, error]));
    expect(unreadNotificationCount(readNotifications())).toBe(1);
  });

  it('exposes stable bulk selection helpers for sibling list surfaces', () => {
    const first = notify({ severity: 'info', title: 'first', silent: true });
    const second = notify({ severity: 'info', title: 'second', silent: true });
    const list = readNotifications();
    expect(selectAllNotificationIds(list)).toEqual(new Set([second, first]));
    expect(invertNotificationIds(list, new Set([second]))).toEqual(new Set([first]));
  });
});

describe('notificationStore — subscription', () => {
  it('notifies subscribers on change and hands back a stable snapshot', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeNotifications(listener);

    notify({ severity: 'info', title: 'a', silent: true });
    expect(listener).toHaveBeenCalledTimes(1);

    const snapshot = readNotifications();
    // No change means the same array identity, which is what
    // `useSyncExternalStore` needs to avoid an infinite render loop.
    expect(readNotifications()).toBe(snapshot);

    markNotificationRead('od-notification-does-not-exist');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(readNotifications()).toBe(snapshot);

    unsubscribe();
    notify({ severity: 'info', title: 'b', silent: true });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  notify,
  readNotifications,
} from '../../../src/components/notifications/notificationStore';
import {
  createNotificationBulkStore,
  describeNotificationBulkDelete,
  getNotificationBulkStore,
  serializeNotificationExport,
} from '../../../src/components/notifications/notificationBulk';

describe('notification selection actions', () => {
  afterEach(() => {
    // The store intentionally has one process-wide history. Clear the rows
    // through the public action after every case so the next test cannot
    // mistake an earlier notification for its own selection.
    const ids = readNotifications().map((record) => record.id);
    getNotificationBulkStore().dismiss(ids);
  });

  it('marks only the selected records read', () => {
    const first = notify({ severity: 'info', title: 'First' });
    const second = notify({ severity: 'info', title: 'Second' });
    getNotificationBulkStore().markRead([first]);
    const rows = readNotifications();
    expect(rows.find((row) => row.id === first)?.read).toBe(true);
    expect(rows.find((row) => row.id === second)?.read).toBe(false);
  });

  it('dismisses only the selected records while retaining them in history', () => {
    const first = notify({ severity: 'info', title: 'First' });
    const second = notify({ severity: 'info', title: 'Second' });
    getNotificationBulkStore().dismiss([first]);
    const rows = readNotifications();
    expect(rows.find((row) => row.id === first)?.live).toBe(false);
    expect(rows.find((row) => row.id === second)?.live).toBe(true);
    expect(rows.find((row) => row.id === first)).toBeTruthy();
    expect(rows.find((row) => row.id === second)).toBeTruthy();
  });

  it('serializes the selected records and states the callback omission', () => {
    const first = notify({
      severity: 'success',
      title: 'Export me',
      action: { label: 'Retry', run: () => undefined },
    });
    const second = notify({ severity: 'info', title: 'Leave me out' });
    const body = serializeNotificationExport(readNotifications(), [first]);
    const parsed = JSON.parse(body) as {
      omitted: string[];
      records: Array<{ id: string; action?: unknown }>;
    };
    expect(parsed.omitted).toEqual(['action callbacks']);
    expect(parsed.records.map((record) => record.id)).toEqual([first]);
    expect(parsed.records[0]).not.toHaveProperty('action');
    expect(body).not.toContain(second);
  });

  it('keeps deletion unavailable until the store exposes its bulk port', () => {
    expect(getNotificationBulkStore().delete(['missing'])).toMatchObject({
      ok: false,
      skipped: ['missing'],
      failed: [],
      reason: expect.stringContaining('bulk delete operation'),
    });
  });

  it('keeps a rich successful delete result when the store supplies the port', () => {
    const clearNotificationIds = vi.fn(() => [
      { id: 'a', status: 'deleted' as const },
      { id: 'b', status: 'deleted' as const },
    ]);
    const markNotificationIdsRead = vi.fn();
    const store = createNotificationBulkStore({
      markNotificationRead: () => undefined,
      dismissNotification: () => undefined,
      markNotificationIdsRead,
      clearNotificationIds,
    });
    expect(store.deleteAvailability).toEqual({ available: true, reason: null });
    expect(store.delete(['a', 'b'])).toMatchObject({
      ok: true,
      deleted: ['a', 'b'],
      skipped: [],
      failed: [],
    });
    expect(clearNotificationIds).toHaveBeenCalledWith(new Set(['a', 'b']));
    store.markRead(['a', 'b']);
    expect(markNotificationIdsRead).toHaveBeenCalledWith(new Set(['a', 'b']));
  });

  it('preserves structured per-record delete outcomes and an exact partial description', () => {
    const store = createNotificationBulkStore({
      markNotificationRead: () => undefined,
      dismissNotification: () => undefined,
      clearNotificationIds: () => ({
        outcomes: [
          { id: 'a', status: 'deleted' },
          { id: 'b', status: 'skipped', reason: 'pinned' },
          { id: 'c', status: 'failed', reason: 'store busy' },
        ],
      }),
    });
    const result = store.delete(['a', 'b', 'c']);
    expect(result).toEqual({
      ok: false,
      outcomes: [
        { id: 'a', status: 'deleted' },
        { id: 'b', status: 'skipped', reason: 'pinned' },
        { id: 'c', status: 'failed', reason: 'store busy' },
      ],
      deleted: ['a'],
      skipped: ['b'],
      failed: ['c'],
      reason: null,
    });
    expect(describeNotificationBulkDelete(result)).toBe(
      'Deleted 1 notification. Skipped 1: b (pinned). Failed 1: c (store busy).',
    );
  });

  it('fails closed when the C1 store omits or invents a per-record outcome', () => {
    const store = createNotificationBulkStore({
      markNotificationRead: () => undefined,
      dismissNotification: () => undefined,
      clearNotificationIds: () => [{ id: 'foreign', status: 'deleted' }],
    });
    const result = store.delete(['a', 'b']);
    expect(result.ok).toBe(false);
    expect(result.deleted).toEqual([]);
    expect(result.failed).toEqual(['a', 'b']);
    expect(result.reason).toBe('Notification store returned an incomplete or invalid bulk delete result.');
  });
});

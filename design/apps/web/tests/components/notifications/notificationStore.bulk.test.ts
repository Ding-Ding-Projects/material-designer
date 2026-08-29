import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  notify,
  readNotifications,
} from '../../../src/components/notifications/notificationStore';
import {
  createNotificationBulkStore,
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
    expect(getNotificationBulkStore().delete(['missing'])).toEqual({
      ok: false,
      reason: expect.stringContaining('bulk delete operation'),
    });
  });

  it('keeps a rich successful delete result when the store supplies the port', () => {
    const deleteNotifications = vi.fn();
    const store = createNotificationBulkStore({
      markNotificationRead: () => undefined,
      dismissNotification: () => undefined,
      deleteNotifications,
    });
    expect(store.deleteAvailability).toEqual({ available: true, reason: null });
    expect(store.delete(['a', 'b'])).toEqual({ ok: true });
    expect(deleteNotifications).toHaveBeenCalledWith(['a', 'b']);
  });
});

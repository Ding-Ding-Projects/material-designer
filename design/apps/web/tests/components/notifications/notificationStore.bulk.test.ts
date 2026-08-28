import { afterEach, describe, expect, it } from 'vitest';

import {
  dismissNotifications,
  markNotificationsRead,
  notify,
  readNotifications,
} from '../../../src/components/notifications/notificationStore';

describe('notification selection actions', () => {
  afterEach(() => {
    // The store intentionally has one process-wide history. Clear the rows
    // through the public action after every case so the next test cannot
    // mistake an earlier notification for its own selection.
    const ids = readNotifications().map((record) => record.id);
    dismissNotifications(ids);
  });

  it('marks only the selected records read', () => {
    const first = notify({ severity: 'info', title: 'First' });
    const second = notify({ severity: 'info', title: 'Second' });
    markNotificationsRead([first]);
    const rows = readNotifications();
    expect(rows.find((row) => row.id === first)?.read).toBe(true);
    expect(rows.find((row) => row.id === second)?.read).toBe(false);
  });

  it('dismisses only the selected records while retaining them in history', () => {
    const first = notify({ severity: 'info', title: 'First' });
    const second = notify({ severity: 'info', title: 'Second' });
    dismissNotifications([first]);
    const rows = readNotifications();
    expect(rows.find((row) => row.id === first)?.live).toBe(false);
    expect(rows.find((row) => row.id === second)?.live).toBe(true);
    expect(rows.find((row) => row.id === first)).toBeTruthy();
    expect(rows.find((row) => row.id === second)).toBeTruthy();
  });
});

import { describe, expect, it } from 'vitest';

import { clearNotificationIds, markNotificationRead } from '../../src/components/notifications/notificationStore';

describe('notification bulk controls', () => {
  it('exports a selected-record removal operation', () => {
    expect(clearNotificationIds).toEqual(expect.any(Function));
    expect(markNotificationRead).toEqual(expect.any(Function));
  });
});

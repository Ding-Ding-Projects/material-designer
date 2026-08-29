/**
 * Notification-centre bulk orchestration.
 *
 * The centre owns selection and presentation. This module owns the boundary to
 * the notification store, so adding multi-record operations does not make the
 * centre reach into store internals. C1 supplies the optional bulk exports as
 * the store grows; until then, mark-read and dismiss degrade to the existing
 * public single-record operations and delete remains explicitly unavailable.
 */

import * as notificationStore from './notificationStore';
import type { NotificationRecord } from './notificationStore';

export interface NotificationStoreBulkPort {
  markRead(ids: readonly string[]): void;
  dismiss(ids: readonly string[]): void;
  readonly deleteAvailability: NotificationDeleteAvailability;
  delete(ids: readonly string[]): NotificationBulkDeleteResult;
}

export interface NotificationDeleteAvailability {
  readonly available: boolean;
  readonly reason: string | null;
}

export type NotificationBulkDeleteResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

/**
 * Public exports C1's store implementation may provide. Keeping this typed at
 * the seam means this lane can compile against the base store while C1 can add
 * stronger persistence and batching without touching the centre component.
 */
export interface NotificationStoreBulkDependencies {
  markNotificationRead: (id: string) => void;
  dismissNotification: (id: string) => void;
  markNotificationsRead?: (ids: readonly string[]) => void;
  dismissNotifications?: (ids: readonly string[]) => void;
  deleteNotifications?: (ids: readonly string[]) => void;
}

const storeWithBulk = notificationStore as typeof notificationStore & NotificationStoreBulkDependencies;

const DELETE_UNAVAILABLE =
  'Notification deletion is unavailable until the notification store exposes its bulk delete operation.';

export function getNotificationBulkStore(): NotificationStoreBulkPort {
  return createNotificationBulkStore(storeWithBulk);
}

export function createNotificationBulkStore(
  store: NotificationStoreBulkDependencies,
): NotificationStoreBulkPort {
  const deleteAvailability: NotificationDeleteAvailability = {
    available: typeof store.deleteNotifications === 'function',
    reason: typeof store.deleteNotifications === 'function' ? null : DELETE_UNAVAILABLE,
  };
  return {
    markRead(ids) {
      if (ids.length === 0) return;
      if (typeof store.markNotificationsRead === 'function') {
        store.markNotificationsRead(ids);
        return;
      }
      for (const id of ids) store.markNotificationRead(id);
    },
    dismiss(ids) {
      if (ids.length === 0) return;
      if (typeof store.dismissNotifications === 'function') {
        store.dismissNotifications(ids);
        return;
      }
      for (const id of ids) store.dismissNotification(id);
    },
    deleteAvailability,
    delete(ids) {
      if (ids.length === 0) return { ok: false, reason: DELETE_UNAVAILABLE };
      if (!deleteAvailability.available) {
        return { ok: false, reason: DELETE_UNAVAILABLE };
      }
      store.deleteNotifications?.(ids);
      return { ok: true };
    },
  };
}

export interface NotificationExportPayload {
  readonly schema: 'material-designer.notification-export.v1';
  readonly omitted: readonly ['action callbacks'];
  readonly records: readonly Omit<NotificationRecord, 'action'>[];
}

/** Serialize only the selected records, explicitly excluding executable callbacks. */
export function serializeNotificationExport(
  records: readonly NotificationRecord[],
  ids: readonly string[],
): string {
  const selected = new Set(ids);
  const payload: NotificationExportPayload = {
    schema: 'material-designer.notification-export.v1',
    omitted: ['action callbacks'],
    records: records
      .filter((record) => selected.has(record.id))
      .map(({ action: _action, ...record }) => record),
  };
  return JSON.stringify(payload, null, 2);
}

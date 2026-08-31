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

export interface NotificationDeleteOutcome {
  readonly id: string;
  readonly status: 'deleted' | 'skipped' | 'failed';
  readonly reason?: string;
}

export interface NotificationBulkDeleteResult {
  readonly ok: boolean;
  readonly outcomes: readonly NotificationDeleteOutcome[];
  readonly deleted: readonly string[];
  readonly skipped: readonly string[];
  readonly failed: readonly string[];
  readonly reason: string | null;
}

/**
 * Public exports C1's store implementation may provide. Keeping this typed at
 * the seam means this lane can compile against the base store while C1 can add
 * stronger persistence and batching without touching the centre component.
 */
export interface NotificationStoreBulkDependencies {
  markNotificationRead: (id: string) => void;
  dismissNotification: (id: string) => void;
  /** C1's universal settings bulk API takes a set, not an array. */
  markNotificationIdsRead?: (ids: ReadonlySet<string>) => void;
  dismissNotifications?: (ids: readonly string[]) => void;
  /** C1's destructive bulk API returns per-record outcomes through this name. */
  clearNotificationIds?: (ids: ReadonlySet<string>) => unknown;
}

const storeWithBulk = notificationStore as typeof notificationStore & NotificationStoreBulkDependencies;

const DELETE_UNAVAILABLE =
  'Notification deletion is unavailable until the notification store exposes its bulk delete operation.';

function deleteResultFromOutcomes(
  outcomes: readonly NotificationDeleteOutcome[],
  reason: string | null = null,
): NotificationBulkDeleteResult {
  const deleted = outcomes.filter((outcome) => outcome.status === 'deleted').map((outcome) => outcome.id);
  const skipped = outcomes.filter((outcome) => outcome.status === 'skipped').map((outcome) => outcome.id);
  const failed = outcomes.filter((outcome) => outcome.status === 'failed').map((outcome) => outcome.id);
  return {
    ok: skipped.length === 0 && failed.length === 0,
    outcomes,
    deleted,
    skipped,
    failed,
    reason,
  };
}

const INVALID_DELETE_RESPONSE = 'Notification store returned an incomplete or invalid bulk delete result.';

/**
 * Align the store response with the universal bulk-action contract. Every
 * requested id gets exactly one outcome, in request order. Missing, duplicate,
 * or foreign ids become failed outcomes rather than being mistaken for a
 * successful delete.
 */
function normalizeDeleteOutcomes(
  ids: readonly string[],
  outcomes: readonly NotificationDeleteOutcome[],
  reason: string | null = null,
): NotificationBulkDeleteResult {
  const requested = new Set(ids);
  const byId = new Map<string, NotificationDeleteOutcome>();
  let invalid = false;
  for (const outcome of outcomes) {
    if (!requested.has(outcome.id) || byId.has(outcome.id)) {
      invalid = true;
      continue;
    }
    byId.set(outcome.id, outcome);
  }
  const normalized = ids.map((id) => byId.get(id) ?? {
    id,
    status: 'failed' as const,
    reason: INVALID_DELETE_RESPONSE,
  });
  if (invalid) {
    return deleteResultFromOutcomes(
      normalized.map((outcome) => outcome.status === 'deleted'
        ? { ...outcome, status: 'failed' as const, reason: INVALID_DELETE_RESPONSE }
        : outcome),
      reason ?? INVALID_DELETE_RESPONSE,
    );
  }
  return deleteResultFromOutcomes(normalized, reason);
}

function isDeleteOutcome(value: unknown): value is NotificationDeleteOutcome {
  if (value === null || typeof value !== 'object') return false;
  const outcome = value as Record<string, unknown>;
  return typeof outcome.id === 'string'
    && (outcome.status === 'deleted' || outcome.status === 'skipped' || outcome.status === 'failed')
    && (outcome.reason === undefined || typeof outcome.reason === 'string');
}

/** Render the exact per-record result for the destructive gate and centre. */
export function describeNotificationBulkDelete(result: NotificationBulkDeleteResult): string {
  const parts = [`Deleted ${result.deleted.length} notification${result.deleted.length === 1 ? '' : 's'}.`];
  const describeIds = (status: NotificationDeleteOutcome['status'], ids: readonly string[]) =>
    result.outcomes
      .filter((outcome) => outcome.status === status && ids.includes(outcome.id))
      .map((outcome) => outcome.reason ? `${outcome.id} (${outcome.reason})` : outcome.id)
      .join(', ');
  if (result.skipped.length > 0) {
    parts.push(`Skipped ${result.skipped.length}: ${describeIds('skipped', result.skipped)}.`);
  }
  if (result.failed.length > 0) {
    parts.push(`Failed ${result.failed.length}: ${describeIds('failed', result.failed)}.`);
  }
  if (result.reason) parts.push(result.reason);
  return parts.join(' ');
}

export function getNotificationBulkStore(): NotificationStoreBulkPort {
  return createNotificationBulkStore(storeWithBulk);
}

export function createNotificationBulkStore(
  store: NotificationStoreBulkDependencies,
): NotificationStoreBulkPort {
  const deleteAvailability: NotificationDeleteAvailability = {
    available: typeof store.clearNotificationIds === 'function',
    reason: typeof store.clearNotificationIds === 'function' ? null : DELETE_UNAVAILABLE,
  };
  return {
    markRead(ids) {
      if (ids.length === 0) return;
      if (typeof store.markNotificationIdsRead === 'function') {
        store.markNotificationIdsRead(new Set(ids));
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
      if (ids.length === 0) return deleteResultFromOutcomes([], DELETE_UNAVAILABLE);
      if (!deleteAvailability.available) {
        return normalizeDeleteOutcomes(
          ids,
          ids.map((id) => ({ id, status: 'skipped', reason: DELETE_UNAVAILABLE })),
          DELETE_UNAVAILABLE,
        );
      }
      try {
        const response = store.clearNotificationIds?.(new Set(ids));
        if (Array.isArray(response) && response.every(isDeleteOutcome)) {
          return normalizeDeleteOutcomes(ids, response);
        }
        if (response !== null && typeof response === 'object') {
          const candidate = response as Partial<NotificationBulkDeleteResult>;
          if (Array.isArray(candidate.outcomes) && candidate.outcomes.every(isDeleteOutcome)) {
            return normalizeDeleteOutcomes(
              ids,
              candidate.outcomes,
              typeof candidate.reason === 'string' ? candidate.reason : null,
            );
          }
        }
        return normalizeDeleteOutcomes(ids, [], INVALID_DELETE_RESPONSE);
      } catch (error) {
        const failure = error instanceof Error ? error.message : String(error);
        return normalizeDeleteOutcomes(ids, [], failure || INVALID_DELETE_RESPONSE);
      }
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

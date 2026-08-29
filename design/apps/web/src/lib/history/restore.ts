import type { HistoryRestoreResponse } from '@open-design/contracts';

/**
 * Consumer-side proof that a restore is append-only. An unchanged restore is
 * the only valid response without a new revision; every changed restore must
 * point at a new restore revision whose parent target is the requested one.
 */
export function isAppendOnlyRestoreResult(response: HistoryRestoreResponse): boolean {
  if (response.unchanged) return response.recorded === null;
  return response.recorded !== null
    && response.recorded.id !== response.from.id
    && response.recorded.kind === 'restore'
    && response.recorded.restoredFromId === response.from.id;
}

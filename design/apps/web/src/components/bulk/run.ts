// Running a plan, and reporting what actually happened.
//
// The failure this file exists to prevent is the cheerful "42 items deleted"
// after nine of them returned 500. A batch is a sequence of independent
// operations and any of them can fail on its own; a runner that reports one
// verdict for all of them is throwing away the only information the user needs
// to decide what to do next.
//
// It runs items one at a time on purpose. Firing forty deletes in parallel is
// faster and makes progress meaningless, cancellation impossible, and the order
// of the failures arbitrary — and for the sizes a person actually selects by
// hand, the sequential version is fast enough that nobody notices.
//
// Cancellation stops between items rather than mid-flight, because there is no
// way to un-send a request that is already on the wire. Anything not reached is
// reported as `notAttempted` rather than folded into the failures: "we never
// tried" and "we tried and it broke" call for different responses.

import type { BulkItem } from './plan';

export interface BulkRunFailure<T extends BulkItem> {
  readonly item: T;
  readonly error: string;
}

export interface BulkRunResult<T extends BulkItem> {
  readonly succeeded: readonly T[];
  readonly failed: readonly BulkRunFailure<T>[];
  /** Items the run never reached, because it was cancelled. */
  readonly notAttempted: readonly T[];
  readonly cancelled: boolean;
}

export interface BulkRunProgress {
  readonly total: number;
  /** Attempted so far, successful or not. */
  readonly done: number;
  readonly succeeded: number;
  readonly failed: number;
  /** The label of the item in flight, or null once the run is over. */
  readonly current: string | null;
}

/**
 * The part of `AbortSignal` this needs.
 *
 * Narrow so a test can hand over `{ aborted: false }` and flip it, and so a
 * caller can use a real `AbortController` without adaptation.
 */
export interface BulkAbortLike {
  readonly aborted: boolean;
}

export interface BulkRunOptions {
  readonly onProgress?: (progress: BulkRunProgress) => void;
  readonly signal?: BulkAbortLike;
}

/**
 * Perform one item. Resolving means success; throwing OR resolving `false`
 * means failure, because half the app's delete helpers report failure by
 * returning false rather than throwing, and a runner that only understood
 * exceptions would count those as wins.
 */
export type BulkPerform<T extends BulkItem> = (
  item: T,
  index: number,
) => Promise<boolean | void> | boolean | void;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runBulkAction<T extends BulkItem>(
  items: readonly T[],
  perform: BulkPerform<T>,
  options: BulkRunOptions = {},
): Promise<BulkRunResult<T>> {
  const { onProgress, signal } = options;
  const succeeded: T[] = [];
  const failed: BulkRunFailure<T>[] = [];
  const total = items.length;

  const report = (index: number, current: string | null) => {
    onProgress?.({
      total,
      done: index,
      succeeded: succeeded.length,
      failed: failed.length,
      current,
    });
  };

  report(0, items.length > 0 ? (items[0]?.label ?? null) : null);

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (item === undefined) continue;
    if (signal?.aborted) {
      // Everything from here on was never attempted. Naming them is the whole
      // difference between an honest partial result and a silent one.
      const notAttempted = items.slice(index);
      report(index, null);
      return { succeeded, failed, notAttempted, cancelled: true };
    }
    report(index, item.label);
    try {
      const outcome = await perform(item, index);
      if (outcome === false) failed.push({ item, error: 'refused' });
      else succeeded.push(item);
    } catch (error) {
      failed.push({ item, error: messageOf(error) });
    }
  }

  report(total, null);
  return { succeeded, failed, notAttempted: [], cancelled: false };
}

export type BulkRunVerdict = 'done' | 'partial' | 'failed' | 'cancelled' | 'empty';

/**
 * One word for what happened, so the toast can pick its tone without
 * re-deriving the arithmetic and getting it subtly different each time.
 *
 * `cancelled` wins over `partial` because it is the more actionable fact: the
 * user stopped it, and the remainder is still there to retry.
 */
export function bulkRunVerdict<T extends BulkItem>(result: BulkRunResult<T>): BulkRunVerdict {
  if (result.cancelled) return 'cancelled';
  const attempted = result.succeeded.length + result.failed.length;
  if (attempted === 0) return 'empty';
  if (result.failed.length === 0) return 'done';
  if (result.succeeded.length === 0) return 'failed';
  return 'partial';
}

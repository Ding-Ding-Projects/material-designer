// What the toast says afterwards.
//
// Every list that runs a bulk action has to report the same five outcomes, and
// each one that writes its own sentence gets one of them subtly wrong — usually
// the partial, which is the one that matters. "42 deleted" after nine failures
// is not a rounding error, it is a false statement about the user's data.
//
// The skipped count rides along on every message. A run that succeeded
// perfectly over the rows it was given, while the plan quietly held back three,
// is still a run the user should be told about — otherwise the only place the
// skip was ever mentioned was a dialog that has since closed.

import type { Dict } from '../../i18n/types';
import type { BulkItem, BulkPlan } from './plan';
import { bulkRunVerdict, type BulkRunResult } from './run';
import type { TranslationVars } from '../../i18n';

type Translate = (key: keyof Dict, vars?: TranslationVars) => string;

export interface BulkOutcomeMessage {
  readonly message: string;
  readonly tone: 'success' | 'error' | 'default';
  /** `alert` is announced immediately; reserved for outcomes that lost work. */
  readonly role: 'status' | 'alert';
}

export function bulkOutcomeMessage<T extends BulkItem>(
  t: Translate,
  result: BulkRunResult<T>,
  plan?: BulkPlan<T>,
): BulkOutcomeMessage {
  const verdict = bulkRunVerdict(result);
  const skipped = plan?.skipped.length ?? 0;
  const skippedSuffix = skipped > 0 ? ` ${t('bulk.resultSkipped', { n: skipped })}` : '';

  if (verdict === 'cancelled') {
    const attempted = result.succeeded.length + result.failed.length;
    return {
      message:
        t('bulk.resultCancelled', {
          done: result.succeeded.length,
          total: attempted + result.notAttempted.length,
          remaining: result.notAttempted.length,
        }) + skippedSuffix,
      tone: 'default',
      role: 'status',
    };
  }
  if (verdict === 'failed') {
    return {
      message: t('bulk.resultFailed', { n: result.failed.length }) + skippedSuffix,
      tone: 'error',
      role: 'alert',
    };
  }
  if (verdict === 'partial') {
    return {
      message:
        t('bulk.resultPartial', {
          done: result.succeeded.length,
          failed: result.failed.length,
        }) + skippedSuffix,
      tone: 'error',
      role: 'alert',
    };
  }
  if (verdict === 'empty') {
    return { message: t('bulk.resultNothing') + skippedSuffix, tone: 'default', role: 'status' };
  }
  return {
    message: t('bulk.resultDone', { n: result.succeeded.length }) + skippedSuffix,
    tone: 'success',
    role: 'status',
  };
}

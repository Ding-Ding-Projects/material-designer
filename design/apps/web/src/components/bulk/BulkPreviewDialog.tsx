// Say what will happen before it happens.
//
// This is the review step every bulk action goes through. It exists because a
// count on a button is not a preview: "Delete 42" tells the user a number and
// nothing about which 42, and it quietly conflates the rows the action will
// touch with the rows they ticked. Those differ often enough — a file an agent
// is mid-write on, a row deleted from another surface since — that the
// difference has to be on screen, named, before the button is live.
//
// So the dialog leads with two numbers that are allowed to disagree, and then
// accounts for every row in the gap: what will change, what is being skipped
// and why, and what has gone missing from the list entirely. Nothing is
// silently dropped, because "it just didn't happen" is the one outcome a bulk
// action must never produce.
//
// SUPER-CONFIRMATION GATE: destructive bulk actions are meant to run through the
// app's two-key + slider gate. No such component exists under `components/` at
// the time of writing — a search for `SuperConfirm*` finds nothing — so this
// falls back to the app's existing `Dialog` confirmation, with `role="alertdialog"`
// and no autofocus on the destructive button. When the gate lands, `danger`
// is the flag that should switch this footer over to it; the counts, the
// skip accounting and the progress reporting above it all stay as they are.

import { useEffect, useRef } from 'react';
import { Button, Dialog, DialogDescription, DialogFooter, DialogTitle } from '@open-design/components';

import { useT } from '../../i18n';
import { Icon } from '../Icon';
import {
  bulkPlanCounts,
  bulkPlanRunnable,
  groupBulkSkips,
  type BulkItem,
  type BulkPlan,
  type BulkSkipReason,
} from './plan';
import type { BulkRunProgress } from './run';
import styles from './BulkPreviewDialog.module.css';

/** How many names are listed before the tail is summarised as a count. */
const PREVIEW_LIMIT = 8;
const SKIP_PREVIEW_LIMIT = 4;

export interface BulkPreviewDialogProps<T extends BulkItem> {
  readonly plan: BulkPlan<T>;
  readonly title: string;
  readonly confirmLabel: string;
  readonly danger?: boolean;
  /** Turn a skip reason token into the sentence this list would use for it. */
  readonly describeSkip: (reason: BulkSkipReason) => string;
  /** Non-null while the run is in flight. */
  readonly progress?: BulkRunProgress | null;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
  /** Stop after the item currently in flight. Required once running. */
  readonly onStop?: () => void;
  readonly titleId: string;
  readonly testId?: string;
}

export function BulkPreviewDialog<T extends BulkItem>({
  plan,
  title,
  confirmLabel,
  danger = false,
  describeSkip,
  progress = null,
  onCancel,
  onConfirm,
  onStop,
  titleId,
  testId,
}: BulkPreviewDialogProps<T>) {
  const t = useT();
  const counts = bulkPlanCounts(plan);
  const runnable = bulkPlanRunnable(plan);
  const running = progress !== null;
  const skipGroups = groupBulkSkips(plan);
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  // Focus lands on Cancel, not on the destructive button. A dialog that opens
  // with "Delete 42" pre-focused is one stray Enter away from doing it.
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  const shown = plan.willChange.slice(0, PREVIEW_LIMIT);
  const overflow = plan.willChange.length - shown.length;

  return (
    <Dialog
      className={styles.dialog}
      role="alertdialog"
      onClose={running ? undefined : onCancel}
      closeOnBackdrop={!running}
      ariaLabelledBy={titleId}
      data-testid={testId}
    >
      <DialogTitle id={titleId}>{title}</DialogTitle>

      {/* The two numbers, side by side and allowed to differ. This is the whole
          point of the dialog, so it goes above everything else. */}
      <DialogDescription
        className={styles.counts}
        data-testid={testId ? `${testId}-counts` : undefined}
      >
        {t('bulk.previewCounts', { selected: counts.selected, willChange: counts.willChange })}
      </DialogDescription>

      <div className={styles.body}>
        {runnable ? (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>
              {t('bulk.previewWillChange', { n: counts.willChange })}
            </h3>
            <ul className={styles.list} data-testid={testId ? `${testId}-will-change` : undefined}>
              {shown.map((item) => (
                <li key={item.id} className={styles.row} title={item.label}>
                  {item.label}
                </li>
              ))}
            </ul>
            {overflow > 0 ? (
              <p className={styles.more}>{t('bulk.previewMore', { n: overflow })}</p>
            ) : null}
          </section>
        ) : (
          <p className={styles.nothing} data-testid={testId ? `${testId}-nothing` : undefined}>
            {t('bulk.previewNothing')}
          </p>
        )}

        {/* Skipped rows are grouped by cause. Thirty rows held back for one
            reason read as one line with a count; thirty identical lines are how
            a reviewable preview stops being read. */}
        {skipGroups.length > 0 ? (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>
              <span className={styles.warnIcon} aria-hidden>
                <Icon name="alert-triangle" size={13} />
              </span>
              {t('bulk.previewSkipped', { n: counts.skipped })}
            </h3>
            <ul className={styles.list} data-testid={testId ? `${testId}-skipped` : undefined}>
              {skipGroups.map((group) => (
                <li key={group.reason} className={styles.skipGroup}>
                  <span className={styles.skipReason}>
                    {describeSkip(group.reason)} ({group.items.length})
                  </span>
                  <span className={styles.skipNames}>
                    {group.items
                      .slice(0, SKIP_PREVIEW_LIMIT)
                      .map((item) => item.label)
                      .join(', ')}
                    {group.items.length > SKIP_PREVIEW_LIMIT
                      ? ` — ${t('bulk.previewMore', {
                          n: group.items.length - SKIP_PREVIEW_LIMIT,
                        })}`
                      : ''}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {counts.missing > 0 ? (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>
              {t('bulk.previewMissing', { n: counts.missing })}
            </h3>
            <p className={styles.more}>{t('bulk.previewMissingNote')}</p>
          </section>
        ) : null}
      </div>

      {/* Progress replaces nothing — it is added beneath the accounting so the
          user can still see what the run is working through while it runs. */}
      {progress ? (
        <div
          className={styles.progress}
          role="status"
          aria-live="polite"
          data-testid={testId ? `${testId}-progress` : undefined}
        >
          <progress className={styles.meter} value={progress.done} max={progress.total} />
          <span className={styles.progressText}>
            {progress.failed > 0
              ? t('bulk.progressFailed', {
                  done: progress.done,
                  total: progress.total,
                  failed: progress.failed,
                })
              : t('bulk.progress', { done: progress.done, total: progress.total })}
          </span>
          {progress.current ? (
            <span className={styles.progressCurrent}>
              {t('bulk.progressCurrent', { label: progress.current })}
            </span>
          ) : null}
        </div>
      ) : null}

      <DialogFooter className="row">
        <Button
          ref={cancelRef}
          onClick={running ? onStop : onCancel}
          data-testid={testId ? `${testId}-cancel` : undefined}
        >
          {running ? t('bulk.stop') : t('common.cancel')}
        </Button>
        <Button
          variant="primary"
          className={danger ? styles.dangerConfirm : undefined}
          disabled={!runnable || running}
          onClick={onConfirm}
          data-testid={testId ? `${testId}-confirm` : undefined}
        >
          {confirmLabel}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

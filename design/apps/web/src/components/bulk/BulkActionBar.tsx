// The bar that appears once more than nothing is selected.
//
// Its job is mostly arithmetic honesty. "42 selected" is ambiguous the moment a
// list has both a page and a filter behind it: it could mean the 42 rows on
// screen or the 42 the search matched, and a user who assumes the wrong one is
// about to delete a different 42. So the count is always qualified by what it
// spans, and the two ways of widening it are offered as separate, separately
// labelled buttons rather than one "select all" that quietly picks a side.
//
// The keycaps on those buttons come from `shortcuts/registry`, the same table
// `selectionKeyDown` matches against — so the bar advertises the keys the list
// genuinely answers to.

import { Button } from '@open-design/components';

import { useT } from '../../i18n';
import { Icon, type IconName } from '../Icon';
import { ariaKeyShortcuts, formatShortcut } from '../shortcuts/registry';
import type { SelectionSummary } from './selection';
import styles from './BulkActionBar.module.css';

export interface BulkAction {
  readonly id: string;
  readonly label: string;
  readonly icon?: IconName;
  readonly danger?: boolean;
  readonly disabled?: boolean;
  /** Overrides the `<bar testId>-action-<id>` default, for existing selectors. */
  readonly testId?: string;
  readonly onRun: () => void;
}

export interface BulkActionBarProps {
  readonly summary: SelectionSummary;
  /**
   * The same things the list offers one at a time. A bar that exposes a subset
   * sends the user back to doing the rest forty times by hand, which is the
   * problem it was added to solve.
   */
  readonly actions: readonly BulkAction[];
  readonly onSelectPage: () => void;
  readonly onSelectEveryMatch: () => void;
  readonly onInvert: () => void;
  readonly onClear: () => void;
  readonly testId?: string;
}

export function BulkActionBar({
  summary,
  actions,
  onSelectPage,
  onSelectEveryMatch,
  onInvert,
  onClear,
  testId,
}: BulkActionBarProps) {
  const t = useT();

  // What the selection currently spans, said out loud. Derived from the sets
  // rather than from how the user got here: ticking the page and then unticking
  // one row is no longer "the page", however it started.
  const countLabel = summary.coversEveryMatch
    ? t('bulk.selectedEveryMatch', { n: summary.count })
    : summary.coversPage
      ? t('bulk.selectedOnPage', { n: summary.count })
      : t('bulk.selected', { n: summary.count });

  // Offer a widening only when it would actually widen. "Select every match"
  // beside a selection that already is every match is a button that does
  // nothing, and a button that does nothing teaches the user to distrust the
  // ones beside it.
  const canSelectPage = !summary.coversPage && summary.pageCount > 0;
  const canSelectEveryMatch =
    !summary.coversEveryMatch &&
    summary.matchCount > 0 &&
    summary.matchCount !== summary.pageCount;

  return (
    <div
      className={styles.bar}
      role="group"
      aria-label={t('bulk.barLabel')}
      data-testid={testId}
    >
      <span className={styles.count} data-testid={testId ? `${testId}-count` : undefined}>
        {countLabel}
      </span>

      <div className={styles.scope}>
        {canSelectPage ? (
          <button
            type="button"
            className={styles.scopeButton}
            onClick={onSelectPage}
            title={formatShortcut('selection.selectPage')}
            aria-keyshortcuts={ariaKeyShortcuts('selection.selectPage')}
            data-testid={testId ? `${testId}-select-page` : undefined}
          >
            {t('bulk.selectPage', { n: summary.pageCount })}
          </button>
        ) : null}
        {canSelectEveryMatch ? (
          <button
            type="button"
            className={styles.scopeButton}
            onClick={onSelectEveryMatch}
            title={formatShortcut('selection.selectEveryMatch')}
            aria-keyshortcuts={ariaKeyShortcuts('selection.selectEveryMatch')}
            data-testid={testId ? `${testId}-select-every-match` : undefined}
          >
            {t('bulk.selectEveryMatch', { n: summary.matchCount })}
          </button>
        ) : null}
        <button
          type="button"
          className={styles.scopeButton}
          onClick={onInvert}
          title={formatShortcut('selection.invert')}
          aria-keyshortcuts={ariaKeyShortcuts('selection.invert')}
          data-testid={testId ? `${testId}-invert` : undefined}
        >
          {t('bulk.invert')}
        </button>
      </div>

      <div className={styles.actions}>
        {actions.map((action) => (
          <Button
            key={action.id}
            variant={action.danger ? 'default' : 'subtle'}
            className={action.danger ? styles.danger : undefined}
            disabled={action.disabled || summary.count === 0}
            onClick={action.onRun}
            data-testid={action.testId ?? (testId ? `${testId}-action-${action.id}` : undefined)}
          >
            {action.icon ? <Icon name={action.icon} size={13} /> : null}
            <span>{action.label}</span>
          </Button>
        ))}
        <button
          type="button"
          className={styles.clear}
          onClick={onClear}
          title={formatShortcut('selection.clear')}
          aria-keyshortcuts={ariaKeyShortcuts('selection.clear')}
          data-testid={testId ? `${testId}-clear` : undefined}
        >
          {t('bulk.clear')}
        </button>
      </div>
    </div>
  );
}

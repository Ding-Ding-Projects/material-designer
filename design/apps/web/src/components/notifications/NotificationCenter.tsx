// The notification centre, reachable from the app chrome.
//
// This is the half of the feature that makes the other half honest. A toast
// that auto-dismissed is information the user cannot get back; a centre that
// lists every record ever raised — with its timestamp, its severity and the
// action it carried — means dismissing a toast costs nothing, which is what
// lets the toasts be as short-lived as they should be.
//
// It is a popover on the bell, not a route and not a modal: reviewing what the
// app said is not a task that should take the screen away from whatever the
// user was doing when it said it. The panel portals to the body because the
// chrome header it hangs from is `overflow: hidden` (see `styles/shell.css`),
// so an in-flow popover would be clipped to a 38px strip.

import { useEffect, useId, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';

import { useT } from '../../i18n';
import { Icon } from '../Icon';
import { BulkActionBar } from '../bulk/BulkActionBar';
import { DestructiveGate } from '../destructive/DestructiveGate';
import {
  describeSelection,
  emptySelection,
  extendTo,
  invertWithin,
  pruneSelection,
  selectAllOf,
  toggleOne,
  type SelectionState,
} from '../bulk/selection';
import { RegexSearchField } from '../regex/RegexSearchField';
import { useRegexSearch } from '../regex/useRegexSearch';
import { SEVERITY_ICON, SEVERITY_LABEL_KEYS } from './NotificationHost';
import {
  markAllNotificationsRead,
  markNotificationsRead,
  markNotificationRead,
  unreadNotificationCount,
  useNotifications,
  type NotificationRecord,
} from './notificationStore';
import {
  describeNotificationBulkDelete,
  getNotificationBulkStore,
  serializeNotificationExport,
  type NotificationBulkDeleteResult,
} from './notificationBulk';
import styles from './NotificationCenter.module.css';

/** Past this the badge stops being a number and becomes "a lot". */
const BADGE_CAP = 99;

function formatClock(value: number): string {
  const date = new Date(value);
  try {
    return date.toLocaleTimeString();
  } catch {
    // Locale data missing in a stripped runtime. The stamp still has to be
    // readable, so fall back to the machine form rather than to nothing.
    return date.toISOString();
  }
}

function formatStamp(value: number): string {
  const date = new Date(value);
  try {
    return date.toISOString();
  } catch {
    return String(value);
  }
}

export function NotificationCenter() {
  const t = useT();
  const records = useNotifications();
  const unread = unreadNotificationCount(records);
  const bulkStore = getNotificationBulkStore();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selection, setSelection] = useState<SelectionState>(emptySelection);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[] | null>(null);
  const [deleteResult, setDeleteResult] = useState<NotificationBulkDeleteResult | null>(null);
  // This field's own controller. `useRegexSearch` is never shared between two
  // fields, so the pattern built here cannot leak into the tab search that
  // sits two buttons away in the same chrome.
  const search = useRegexSearch(query, setQuery);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const close = () => {
      setOpen(false);
      buttonRef.current?.focus();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      close();
    };
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (panelRef.current?.contains(target)) return;
      if (buttonRef.current?.contains(target)) return;
      // The regex builder portals its own `role="dialog"` popover to the body,
      // outside this panel's subtree, so a click inside it is not "outside".
      // Closing the centre out from under a half-built pattern would throw the
      // pattern away — and the builder's own Escape handler already covers the
      // case where the user wants it gone.
      if (target instanceof Element && target.closest('[role="dialog"]')) return;
      setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open]);

  const visible = records.filter((record) => matchesRecord(record, search.matches, t));
  const visibleIds = visible.map((record) => record.id);
  const visibleKey = visibleIds.join('\u0000');
  useEffect(() => {
    setSelection((current) => pruneSelection(current, visibleIds));
  }, [visibleKey]);
  const selectionSummary = describeSelection(selection, visibleIds, visibleIds);

  function selectNotification(id: string, event: Pick<ReactMouseEvent, 'shiftKey' | 'ctrlKey' | 'metaKey'>) {
    setSelection((current) => {
      if (event.shiftKey) return extendTo(current, id, visibleIds);
      if (event.ctrlKey || event.metaKey) return toggleOne(current, id);
      // A checkbox is an additive control. Plain pointer and Space activation
      // must toggle the row, while Shift still owns the range gesture.
      return toggleOne(current, id);
    });
  }

  function clearSelectedSelection() {
    setSelection(emptySelection());
  }

  function selectedIdsInOrder(): string[] {
    return visibleIds.filter((id) => selection.ids.has(id));
  }

  function exportSelected(ids: readonly string[]) {
    const body = serializeNotificationExport(records, ids);
    const url = URL.createObjectURL(new Blob([body], { type: 'application/json;charset=utf-8' }));
    try {
      const link = document.createElement('a');
      link.href = url;
      link.download = 'notifications.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
    } finally {
      // Keep the object URL alive long enough for slower browsers, while still
      // revoking it when the click path throws before the download starts.
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
  }
  const badge = unread > BADGE_CAP ? `${BADGE_CAP}+` : String(unread);
  const label = unread > 0
    ? `${t('notifications.open')} — ${t('notifications.unread', { count: unread })}`
    : t('notifications.open');

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`workspace-tabs-icon-btn od-tooltip${open ? ' is-active' : ''} ${styles.bell}`}
        onClick={() => setOpen((value) => !value)}
        title={label}
        data-tooltip={t('notifications.title')}
        data-tooltip-placement="bottom"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-testid="notification-bell"
      >
        <Icon name="bell" size={15} />
        {unread > 0 ? (
          <span className={styles.badge} aria-hidden data-testid="notification-badge">
            {badge}
          </span>
        ) : null}
      </button>
      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={panelRef}
              className={styles.panel}
              role="dialog"
              aria-labelledby={titleId}
              data-testid="notification-center"
            >
              <div className={styles.header}>
                <h2 id={titleId} className={styles.heading}>
                  {t('notifications.title')}
                </h2>
                <span className={styles.count}>
                  {t('notifications.unread', { count: unread })}
                </span>
                <button
                  type="button"
                  className={styles.close}
                  onClick={() => {
                    setOpen(false);
                    buttonRef.current?.focus();
                  }}
                  title={t('common.close')}
                  aria-label={t('common.close')}
                >
                  <Icon name="close" size={13} />
                </button>
              </div>
              <div className={styles.searchRow}>
                <RegexSearchField
                  search={search}
                  fieldLabel={t('notifications.searchLabel')}
                  placeholder={t('notifications.searchPlaceholder')}
                  ariaLabel={t('notifications.searchLabel')}
                  className={styles.searchInput}
                  hostClassName={styles.searchHost}
                  testId="notification-search"
                />
              </div>
              <div className={styles.actions}>
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set(visibleIds))}
                  disabled={visible.length === 0}
                  data-testid="notification-select-all"
                >
                  Select visible ({visible.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set(visibleIds.filter((id) => !selectedIds.has(id))))}
                  disabled={visible.length === 0}
                  data-testid="notification-invert-selection"
                >
                  Invert
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const selected = selectedIds;
                    for (const id of selected) markNotificationRead(id);
                    setSelectedIds(new Set());
                  }}
                  disabled={selectedIds.size === 0}
                  data-testid="notification-mark-selected-read"
                >
                  Mark selected read ({selectedIds.size})
                </button>
                <button
                  type="button"
                  onClick={markAllNotificationsRead}
                  disabled={unread === 0}
                  data-testid="notification-mark-all-read"
                >
                  {t('notifications.markAllRead')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDeleteResult(null);
                    setPendingDeleteIds(records.map((record) => record.id));
                  }}
                  disabled={records.length === 0 || !bulkStore.deleteAvailability.available}
                  title={bulkStore.deleteAvailability.reason ?? undefined}
                  data-testid="notification-clear"
                >
                  {t('notifications.clear')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (selectedIds.size === 0) return;
                    setConfirmSelectedClear(true);
                  }}
                  disabled={selectedIds.size === 0}
                  data-testid="notification-clear-selected"
                >
                  Clear selected
                </button>
              </div>
              {visible.length > 0 ? (
                <BulkActionBar
                  summary={selectionSummary}
                  onSelectPage={() => setSelection(selectAllOf(visibleIds, 'page'))}
                  onSelectEveryMatch={() => setSelection(selectAllOf(visibleIds, 'match'))}
                  onInvert={() => setSelection(invertWithin(selection, visibleIds, selection.scope === 'match' ? 'match' : 'page'))}
                  onClear={clearSelectedSelection}
                  testId="notification-bulk"
                  actions={[
                    {
                      id: 'export',
                      icon: 'download',
                      label: t('preview.exportMenu'),
                      onRun: () => {
                        exportSelected(selectedIdsInOrder());
                        clearSelectedSelection();
                      },
                    },
                    {
                      id: 'read',
                      icon: 'check',
                      label: t('notifications.markAllRead'),
                      onRun: () => {
                        getNotificationBulkStore().markRead(selectedIdsInOrder());
                        clearSelectedSelection();
                      },
                    },
                    {
                      id: 'dismiss',
                      icon: 'close',
                      label: t('notifications.dismiss'),
                      onRun: () => {
                        getNotificationBulkStore().dismiss(selectedIdsInOrder());
                        clearSelectedSelection();
                      },
                    },
                    {
                      id: 'delete',
                      icon: 'trash',
                      label: t('notifications.clear'),
                      danger: true,
                      disabled: !bulkStore.deleteAvailability.available,
                      disabledReason: bulkStore.deleteAvailability.reason ?? undefined,
                      onRun: () => {
                        setDeleteResult(null);
                        setPendingDeleteIds(selectedIdsInOrder());
                      },
                    },
                  ]}
                />
              ) : null}
              <div className={styles.list} data-testid="notification-list">
                {visible.length === 0 ? (
                  <p className={styles.empty} data-testid="notification-empty">
                    {records.length === 0
                      ? t('notifications.empty')
                      : t('notifications.noMatches')}
                  </p>
                ) : (
                  <ul className={styles.rows}>
                    {visible.map((record) => (
                      <NotificationRow
                        key={record.id}
                        record={record}
                        selected={selection.ids.has(record.id)}
                        onSelect={selectNotification}
                      />
                    ))}
                  </ul>
                )}
              </div>
              {deleteResult ? (
                <p className={styles.deleteResult} role="alert" data-testid="notification-delete-result">
                  {describeNotificationBulkDelete(deleteResult)}
                </p>
              ) : null}
            </div>,
            document.body,
          )
        : null}
      {pendingDeleteIds && pendingDeleteIds.length > 0 ? (
        <DestructiveGate
          action={t('notifications.clear')}
          target={t('notifications.title')}
          items={pendingDeleteIds.map((id) => records.find((record) => record.id === id)?.title ?? id)}
          detail={deleteResult ? describeNotificationBulkDelete(deleteResult) : t('notifications.clear')}
          irreversible
          onConfirm={() => {
            const outcome = bulkStore.delete(pendingDeleteIds);
            if (
              !outcome.ok
              || outcome.skipped.length > 0
              || outcome.failed.length > 0
            ) {
              // Keep failed and skipped rows selected so the user can review,
              // retry, export, or dismiss exactly the records that remain.
              setDeleteResult(outcome);
              const remainingDeleteIds = outcome.outcomes
                .filter((record) => record.status !== 'deleted')
                .map((record) => record.id);
              setSelection(selectAllOf(remainingDeleteIds, 'explicit'));
              if (remainingDeleteIds.length === 0) {
                // There is nothing left to retry. Close the gate after
                // retaining the exact result instead of remounting it with an
                // empty request.
                setPendingDeleteIds(null);
                return true;
              }
              // Changing the request identity remounts the gate, resetting
              // both keys and the slider for only the rows still unresolved.
              setPendingDeleteIds(remainingDeleteIds);
              return false;
            }
            setDeleteResult(null);
            setPendingDeleteIds(null);
            clearSelectedSelection();
            return true;
          }}
          onClose={() => setPendingDeleteIds(null)}
        />
      ) : null}
    </>
  );
}

/**
 * What the search bar looks at. Everything the row renders, so a user who can
 * see a word in the list can find it by typing that word — including the
 * severity, which is how "show me the errors" works without a filter control.
 */
function matchesRecord(
  record: NotificationRecord,
  matches: (text: string) => boolean,
  t: ReturnType<typeof useT>,
): boolean {
  const haystack = [
    record.title,
    record.body ?? '',
    record.actionLabel ?? '',
    t(SEVERITY_LABEL_KEYS[record.severity]),
  ].join('\n');
  return matches(haystack);
}

function NotificationRow({
  record,
  selected,
  onSelect,
}: {
  record: NotificationRecord;
  selected: boolean;
  onSelect: (id: string, event: Pick<ReactMouseEvent, 'shiftKey' | 'ctrlKey' | 'metaKey'>) => void;
}) {
  const t = useT();
  const action = record.action;
  return (
    <li
      className={styles.row}
      data-severity={record.severity}
      data-read={record.read ? 'true' : 'false'}
      data-testid="notification-row"
    >
      <input
        type="checkbox"
        className={styles.rowSelect}
        checked={selected}
        aria-label={record.title}
        // The click event carries Shift/Ctrl/Meta for pointer and keyboard
        // activation. ChangeEvent does not reliably preserve those modifiers,
        // so selection is intentionally driven from one event path.
        onClick={(event) => {
          event.stopPropagation();
          onSelect(record.id, event);
        }}
        onChange={() => undefined}
      />
      <span className={styles.rowIcon} aria-hidden>
        <Icon name={SEVERITY_ICON[record.severity]} size={14} />
      </span>
      <div className={styles.rowText}>
        <span className={styles.rowMeta}>
          <span className={styles.rowSeverity}>{t(SEVERITY_LABEL_KEYS[record.severity])}</span>
          {/* Both forms: the readable clock for a person, the machine stamp on
              `dateTime` so the record is unambiguous when it is copied out of
              the DOM or read by a tool. */}
          <time className={styles.rowTime} dateTime={formatStamp(record.createdAt)}>
            {formatClock(record.createdAt)}
          </time>
        </span>
        <span className={styles.rowTitle}>{record.title}</span>
        {record.body ? <span className={styles.rowBody}>{record.body}</span> : null}
        {record.actionLabel ? (
          action ? (
            <button
              type="button"
              className={styles.rowAction}
              onClick={() => {
                markNotificationRead(record.id);
                action.run();
              }}
            >
              {record.actionLabel}
            </button>
          ) : (
            // The label survives in the history even when the callback behind
            // it did not, so the record still says what was on offer instead
            // of quietly dropping it.
            <span className={styles.rowActionSpent}>
              {t('notifications.actionOffered', { label: record.actionLabel })}
            </span>
          )
        ) : null}
      </div>
      {record.read ? null : (
        <button
          type="button"
          className={styles.rowRead}
          onClick={() => markNotificationRead(record.id)}
          title={t('notifications.markRead')}
          aria-label={t('notifications.markRead')}
          data-testid="notification-row-read"
        >
          <Icon name="check" size={12} />
        </button>
      )}
    </li>
  );
}

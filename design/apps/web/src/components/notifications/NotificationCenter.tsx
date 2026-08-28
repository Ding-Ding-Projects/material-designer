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
import { createPortal } from 'react-dom';

import { useT } from '../../i18n';
import { Icon } from '../Icon';
import { RegexSearchField } from '../regex/RegexSearchField';
import { useRegexSearch } from '../regex/useRegexSearch';
import { SEVERITY_ICON, SEVERITY_LABEL_KEYS } from './NotificationHost';
import {
  clearNotifications,
  clearNotificationIds,
  markAllNotificationsRead,
  markNotificationRead,
  unreadNotificationCount,
  useNotifications,
  type NotificationRecord,
} from './notificationStore';
import styles from './NotificationCenter.module.css';
import { DestructiveGate } from '../destructive/DestructiveGate';

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
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [confirmSelectedClear, setConfirmSelectedClear] = useState(false);
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
                  onClick={clearNotifications}
                  disabled={records.length === 0}
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
                        selected={selectedIds.has(record.id)}
                        onSelected={(checked) => setSelectedIds((current) => {
                          const next = new Set(current);
                          if (checked) next.add(record.id);
                          else next.delete(record.id);
                          return next;
                        })}
                      />
                    ))}
                  </ul>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
      {confirmSelectedClear ? (
        <DestructiveGate
          action="Remove selected notifications"
          target={`${selectedIds.size} selected notification${selectedIds.size === 1 ? '' : 's'}`}
          items={records.filter((record) => selectedIds.has(record.id)).map((record) => record.title)}
          detail="This removes the selected notification history records. It cannot be undone from this panel."
          irreversible
          onConfirm={() => {
            clearNotificationIds(selectedIds);
            setSelectedIds(new Set());
            return true;
          }}
          onClose={() => setConfirmSelectedClear(false)}
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

function NotificationRow({ record, selected, onSelected }: { record: NotificationRecord; selected: boolean; onSelected: (checked: boolean) => void }) {
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
        checked={selected}
        onChange={(event) => onSelected(event.currentTarget.checked)}
        aria-label={`Select notification ${record.title}`}
        data-testid="notification-row-select"
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

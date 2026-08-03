// The corner stack: the live view over `notificationStore`.
//
// Three properties of it are requirements rather than styling choices.
//
// 1. **It is anchored in a corner and it stacks.** The app's existing
//    `Toast.tsx` is a single bottom-centre element; two of them at once would
//    sit on top of each other, because nothing about a `position: fixed;
//    left: 50%` element knows another one exists. This host owns a flex column
//    instead, so N toasts occupy N rows and none of them can cover another.
// 2. **It never takes focus.** Not on mount, not when a new record arrives, not
//    when one leaves. Announcement is done entirely with `role`/`aria-live`, so
//    a screen-reader user hears the message where they are instead of being
//    dragged to it mid-sentence — and a keyboard user's caret stays put.
// 3. **Errors and warnings do not expire.** That is the store's TTL table
//    talking, not this component, but it is visible here: an urgent toast has
//    no countdown and only the dismiss button removes it.

import { useT } from '../../i18n';
import { Icon, type IconName } from '../Icon';
import {
  NOTIFICATION_STACK_LIMIT,
  dismissNotification,
  liveNotifications,
  markNotificationRead,
  useNotifications,
  type NotificationRecord,
  type NotificationSeverity,
} from './notificationStore';
import styles from './NotificationHost.module.css';

export const SEVERITY_ICON: Record<NotificationSeverity, IconName> = {
  info: 'info',
  success: 'check',
  progress: 'spinner',
  warning: 'alert-triangle',
  error: 'alert-triangle',
};

/**
 * Exported because the centre lists the same severities and has to name them
 * the same way; two maps would be two vocabularies for one concept. Typed
 * against the translator's key so a renamed key fails typecheck here rather
 * than rendering its own name at the user.
 */
export const SEVERITY_LABEL_KEYS = {
  info: 'notifications.severityInfo',
  success: 'notifications.severitySuccess',
  progress: 'notifications.severityProgress',
  warning: 'notifications.severityWarning',
  error: 'notifications.severityError',
} as const satisfies Record<NotificationSeverity, Parameters<ReturnType<typeof useT>>[0]>;

/**
 * Urgent means "the user must be told now, and it must not vanish on its own".
 * One switch behind both the assertive announcement and the pinned-open
 * behaviour, so the two can never disagree about which messages matter.
 */
export function isUrgentSeverity(severity: NotificationSeverity): boolean {
  return severity === 'error' || severity === 'warning';
}

export function NotificationHost() {
  const t = useT();
  const records = useNotifications();
  const live = liveNotifications(records);
  if (live.length === 0) return null;

  const shown = live.slice(0, NOTIFICATION_STACK_LIMIT);
  const overflow = live.length - shown.length;
  // `live` is newest-first (the store prepends). Reversing puts the newest
  // nearest the corner, which is where the eye already is after an action.
  const stack = [...shown].reverse();

  return (
    <div className={styles.host} data-testid="notification-host">
      {overflow > 0 ? (
        <p className={styles.overflow} data-testid="notification-overflow">
          {t('notifications.stackOverflow', { count: overflow })}
        </p>
      ) : null}
      {stack.map((record) => (
        <NotificationToast key={record.id} record={record} />
      ))}
    </div>
  );
}

function NotificationToast({ record }: { record: NotificationRecord }) {
  const t = useT();
  const urgent = isUrgentSeverity(record.severity);
  const action = record.action;
  return (
    <div
      className={styles.toast}
      data-severity={record.severity}
      data-testid="notification-toast"
      // `alert` is announced assertively and interrupts; `status` waits for a
      // pause. Both are live regions, so neither moves focus.
      role={urgent ? 'alert' : 'status'}
      aria-live={urgent ? 'assertive' : 'polite'}
    >
      <span className={styles.icon} aria-hidden>
        <Icon name={SEVERITY_ICON[record.severity]} size={15} />
      </span>
      <div className={styles.text}>
        {/* The severity is stated in words as well as in colour and glyph, or a
            reader with no colour perception is told a failure in exactly the
            same voice as a success. */}
        <span className={styles.severity}>{t(SEVERITY_LABEL_KEYS[record.severity])}</span>
        <span className={styles.title}>{record.title}</span>
        {record.body ? <span className={styles.body}>{record.body}</span> : null}
        {action ? (
          <button
            type="button"
            className={styles.action}
            onClick={() => {
              // Read and dismissed before the callback runs: the action may
              // navigate away or unmount this subtree, and a record that is
              // still "live and unread" after the user acted on it would show
              // up as an unread badge for something they have already done.
              markNotificationRead(record.id);
              dismissNotification(record.id);
              action.run();
            }}
          >
            {action.label}
          </button>
        ) : null}
      </div>
      <button
        type="button"
        className={styles.dismiss}
        onClick={() => dismissNotification(record.id)}
        title={t('notifications.dismiss')}
        aria-label={t('notifications.dismiss')}
      >
        <Icon name="close" size={13} />
      </button>
    </div>
  );
}

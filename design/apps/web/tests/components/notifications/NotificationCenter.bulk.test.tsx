// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('../../../src/i18n', () => ({
  useT: () => (key: string, vars?: Record<string, unknown>) =>
    vars == null ? key : `${key}:${JSON.stringify(vars)}`,
}));

vi.mock('../../../src/components/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span aria-hidden>{name}</span>,
}));

vi.mock('../../../src/components/regex/RegexSearchField', () => ({
  RegexSearchField: ({ search, placeholder, className }: {
    search: { query: string; setQuery: (value: string) => void };
    placeholder?: string;
    className?: string;
  }) => (
    <input
      aria-label="notifications.searchLabel"
      placeholder={placeholder}
      className={className}
      value={search.query}
      onChange={(event) => search.setQuery(event.currentTarget.value)}
    />
  ),
}));

vi.mock('../../../src/components/bulk/BulkActionBar', () => ({
  BulkActionBar: ({
    actions,
    onSelectEveryMatch,
  }: {
    actions: Array<{ id: string; label: string; onRun: () => void; disabled?: boolean; disabledReason?: string }>;
    onSelectEveryMatch: () => void;
  }) => (
    <div data-testid="notification-bulk-mock">
      <button type="button" onClick={onSelectEveryMatch}>select every match</button>
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          disabled={action.disabled}
          data-testid={`notification-bulk-action-${action.id}`}
          aria-label={action.disabled && action.disabledReason ? `${action.label}: ${action.disabledReason}` : undefined}
          onClick={action.onRun}
        >
          {action.label}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('../../../src/components/destructive/DestructiveGate', () => ({
  DestructiveGate: ({ detail, onConfirm }: { detail?: string | null; onConfirm: () => boolean }) => (
    <div data-testid="destructive-gate-mock">
      <span data-testid="destructive-gate-detail">{detail}</span>
      <button type="button" data-testid="destructive-gate-confirm" onClick={onConfirm}>confirm</button>
    </div>
  ),
}));

vi.mock('../../../src/components/notifications/NotificationHost', () => ({
  SEVERITY_ICON: { info: 'info', success: 'check', progress: 'spinner', warning: 'alert', error: 'alert' },
  SEVERITY_LABEL_KEYS: {
    info: 'notifications.severityInfo',
    success: 'notifications.severitySuccess',
    progress: 'notifications.severityProgress',
    warning: 'notifications.severityWarning',
    error: 'notifications.severityError',
  },
}));

import { NotificationCenter } from '../../../src/components/notifications/NotificationCenter';
import { clearNotifications, notify } from '../../../src/components/notifications/notificationStore';
import * as notificationBulk from '../../../src/components/notifications/notificationBulk';

describe('NotificationCenter mounted bulk selection', () => {
  afterEach(() => {
    clearNotifications();
    vi.restoreAllMocks();
    cleanup();
  });

  it('toggles a notification checkbox with pointer activation and preserves Shift ranges', () => {
    notify({ severity: 'info', title: 'First notification' });
    notify({ severity: 'info', title: 'Second notification' });
    render(<NotificationCenter />);
    fireEvent.click(screen.getByTestId('notification-bell'));

    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]!);
    expect(checkboxes[0]).toBeChecked();
    fireEvent.click(checkboxes[0]!);
    expect(checkboxes[0]).not.toBeChecked();
    fireEvent.click(checkboxes[0]!);
    fireEvent.click(checkboxes[1]!, { shiftKey: true });
    expect(checkboxes.every((checkbox) => (checkbox as HTMLInputElement).checked)).toBe(true);
  });

  it('keeps the delete action disabled before the store exposes bulk deletion', () => {
    notify({ severity: 'info', title: 'Only notification' });
    render(<NotificationCenter />);
    fireEvent.click(screen.getByTestId('notification-bell'));
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    const deleteButton = screen.getByRole('button', {
      name: /notifications\.clear: Notification deletion is unavailable until the notification store exposes its bulk delete operation\./,
    });
    expect(deleteButton).toBeDisabled();
    expect(screen.queryByTestId('destructive-gate-mock')).toBeNull();
  });

  it('renders structured partial delete results and keeps only failed records selected', () => {
    const first = notify({ severity: 'info', title: 'Deleted record' });
    const second = notify({ severity: 'info', title: 'Failed record' });
    const deleteResult: notificationBulk.NotificationBulkDeleteResult = {
      ok: false,
      outcomes: [
        { id: first, status: 'deleted' },
        { id: second, status: 'failed', reason: 'store busy' },
      ],
      deleted: [first],
      skipped: [],
      failed: [second],
      reason: null,
    };
    const retryResult: notificationBulk.NotificationBulkDeleteResult = {
      ok: false,
      outcomes: [{ id: second, status: 'failed', reason: 'store busy' }],
      deleted: [],
      skipped: [],
      failed: [second],
      reason: null,
    };
    const deleteMock = vi.fn((ids: readonly string[]) => ids.length === 2 ? deleteResult : retryResult);
    vi.spyOn(notificationBulk, 'getNotificationBulkStore').mockReturnValue({
      markRead: () => undefined,
      dismiss: () => undefined,
      deleteAvailability: { available: true, reason: null },
      delete: deleteMock,
    });
    render(<NotificationCenter />);
    fireEvent.click(screen.getByTestId('notification-bell'));
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]!);
    fireEvent.click(checkboxes[1]!);
    fireEvent.click(screen.getByTestId('notification-bulk-action-delete'));
    fireEvent.click(screen.getByTestId('destructive-gate-confirm'));
    expect(deleteMock).toHaveBeenCalledWith([second, first]);
    expect(screen.getByTestId('destructive-gate-detail')).toHaveTextContent(
      'Deleted 1 notification. Failed 1: ' + second + ' (store busy).',
    );
    expect(screen.getByTestId('notification-delete-result')).toHaveTextContent(
      'Deleted 1 notification. Failed 1: ' + second + ' (store busy).',
    );
    expect((screen.getAllByRole('checkbox')[0] as HTMLInputElement).checked).toBe(true);
    expect((screen.getAllByRole('checkbox')[1] as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByTestId('destructive-gate-confirm'));
    expect(deleteMock).toHaveBeenNthCalledWith(2, [second]);
    expect(deleteMock).toHaveBeenCalledTimes(2);
  });
});

// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const historyClient = vi.hoisted(() => ({
  HISTORY_PAGE_SIZE: 500,
  fetchHistoryPage: vi.fn(),
  fetchHistoryRevision: vi.fn(),
  restoreHistoryRevision: vi.fn(),
  setHistoryRetention: vi.fn(),
  pruneHistory: vi.fn(),
}));

vi.mock('@open-design/components', async () => {
  const React = await import('react');
  const primitive = ({ children, ...props }: { children?: unknown; [key: string]: unknown }) => (
    <div {...props}>{children}</div>
  );
  const Button = React.forwardRef<HTMLButtonElement, Record<string, unknown> & { children?: unknown }>(
    ({ children, ...props }, ref) => <button ref={ref} {...props}>{children}</button>,
  );
  const Input = React.forwardRef<HTMLInputElement, Record<string, unknown> & { children?: unknown }>(
    ({ children: _children, ...props }, ref) => <input ref={ref} {...props} />,
  );
  return {
    Button,
    Dialog: primitive,
    DialogBody: primitive,
    DialogDescription: primitive,
    DialogFooter: primitive,
    DialogHeader: primitive,
    DialogTitle: primitive,
    Input,
    VisuallyHidden: primitive,
  };
});

vi.mock('../../../src/i18n', () => ({
  useI18n: () => ({
    locale: 'en',
    t: (key: string, vars?: Record<string, unknown>) =>
      vars == null ? key : `${key}:${JSON.stringify(vars)}`,
  }),
}));

vi.mock('../../../src/components/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span aria-hidden>{name}</span>,
}));

vi.mock('../../../src/components/regex/RegexSearchField', () => ({
  RegexSearchField: ({ search, inputRef, ariaLabel, placeholder, className }: {
    search: { query: string; setQuery: (value: string) => void };
    inputRef?: { current: HTMLInputElement | null };
    ariaLabel?: string;
    placeholder?: string;
    className?: string;
  }) => (
    <input
      aria-label={ariaLabel}
      placeholder={placeholder}
      className={className}
      ref={(node) => {
        if (inputRef) inputRef.current = node;
      }}
      value={search.query}
      onChange={(event) => search.setQuery(event.currentTarget.value)}
    />
  ),
}));

vi.mock('../../../src/components/changelog/ChangelogDateRange', () => ({
  ChangelogDateRange: () => <div data-testid="history-date-range" />,
}));

vi.mock('../../../src/components/bulk/BulkActionBar', () => ({
  BulkActionBar: ({ actions, onSelectEveryMatch, everyMatchState }: {
    actions: Array<{ id: string; label: string; onRun: () => void }>;
    onSelectEveryMatch: () => void;
    everyMatchState?: 'ready' | 'loading' | 'unavailable';
  }) => (
    <div data-testid="history-bulk">
      <button
        type="button"
        data-testid="history-bulk-select-every"
        disabled={everyMatchState !== 'ready'}
        onClick={onSelectEveryMatch}
      >
        select every match
      </button>
      {actions.map((action) => (
        <button key={action.id} type="button" onClick={action.onRun}>{action.label}</button>
      ))}
    </div>
  ),
}));

vi.mock('../../../src/lib/history/client', () => historyClient);

import { VersionHistoryDialog } from '../../../src/components/history/VersionHistoryDialog';

const retention = { maxRevisions: null, maxAgeDays: null };
const revisions = [{
  id: 'revision-safe',
  commit: 'commit-safe',
  kind: 'mutation' as const,
  label: 'Updated the setting theme',
  details: ['Updated the setting theme'],
  createdAt: Date.UTC(2026, 7, 29),
  domainIds: ['settings'],
  changeCount: 1,
  restoredFromId: null,
}];

describe('VersionHistoryDialog mounted bulk state', () => {
  afterEach(() => {
    historyClient.fetchHistoryPage.mockReset();
    historyClient.fetchHistoryRevision.mockReset();
    vi.clearAllMocks();
    cleanup();
  });

  it('preserves selection when load-all ends incomplete and shows the exact reason', async () => {
    historyClient.fetchHistoryPage
      .mockResolvedValueOnce({
        ok: true,
        value: {
          available: true,
          unavailableReason: null,
          domains: [{ id: 'settings', label: 'Settings', sensitive: false }],
          revisions,
          total: 2,
          retention,
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        value: {
          available: true,
          unavailableReason: null,
          domains: [{ id: 'settings', label: 'Settings', sensitive: false }],
          revisions,
          total: 2,
          retention,
        },
      })
      .mockResolvedValueOnce({ ok: false, error: 'history page 2 unavailable' });

    render(<VersionHistoryDialog />);
    window.dispatchEvent(new Event('od:open-version-history'));
    const checkbox = await screen.findByRole('checkbox', { name: 'Updated the setting theme' });
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();

    fireEvent.click(await screen.findByTestId('history-load-all'));
    await waitFor(() => expect(screen.getByTestId('history-every-match-status')).toHaveTextContent('history page 2 unavailable'));
    expect(checkbox).toBeChecked();
    expect(screen.getByTestId('history-bulk-select-every')).toBeDisabled();
  });
});

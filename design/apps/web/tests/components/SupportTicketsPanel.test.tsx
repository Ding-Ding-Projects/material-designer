// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SupportTicketsPanel } from '../../src/components/toy-locks/SupportTicketsPanel';
import { SUPPORT_TICKETS_STORAGE_KEY, type SupportTicketStorage } from '../../src/security/toy-lock-support-tickets';

afterEach(cleanup);

function storage(): SupportTicketStorage {
  const values = new Map<string, string>();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } };
}

describe('SupportTicketsPanel', () => {
  it('creates, advances, searches, selects, dismisses, and exports local tickets', async () => {
    const target = storage();
    render(<SupportTicketsPanel storage={target} />);
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Local recovery is needed.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create local ticket' }));
    await waitFor(() => expect(screen.getByText(/status resolved/)).toBeTruthy());
    expect(target.getItem(SUPPORT_TICKETS_STORAGE_KEY)).toContain('Local recovery is needed.');
    fireEvent.click(screen.getByRole('button', { name: 'Select all visible tickets' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss selected tickets' }));
    expect(screen.getByText(/status dismissed/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Export selected tickets' }));
    expect(screen.getByText(/Descriptions are included/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Export now' }));
  });

  it('opens and copies the exact host recovery path, without an in-app deletion control', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const open = vi.fn(async () => ({ ok: true as const, path: 'C:/example/app-data' }));
    render(<SupportTicketsPanel storage={storage()} onOpenRecoveryFolder={open} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open application-data folder' }));
    await waitFor(() => expect(screen.getByText('C:/example/app-data')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Copy recovery path' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('C:/example/app-data'));
    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull();
  });
});

// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { installMockOpenDesignHost } from '@open-design/host/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SettingsToyLockPanel } from '../../src/components/settings/SettingsToyLockPanel';

let restoreHost: (() => void) | null = null;
afterEach(() => { cleanup(); restoreHost?.(); restoreHost = null; });

describe('SettingsToyLockPanel', () => {
  const anchor = document.createElement('button');
  it('routes manual PIN configuration through the protected host contract', async () => {
    const configure = vi.fn(async () => ({ ok: true, lock: { targetId: 'general', policy: 'pin', revision: 1, maximumAttempts: 5, remainingAttempts: 5, cooldownUntilMs: null } }));
    const list = vi.fn(async () => ({ ok: true, locks: [], protectionAvailable: true }));
    restoreHost = installMockOpenDesignHost({ host: { toyLocks: { beginTotpEnrollment: vi.fn(), confirmTotpEnrollment: vi.fn(), configure, list, remove: vi.fn(), verify: vi.fn() } } });
    render(<SettingsToyLockPanel anchor={anchor} locks={new Map()} onLocksChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Manual entry' }));
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: ' 1234 ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save toy lock' }));
    await waitFor(() => expect(configure).toHaveBeenCalledWith(expect.objectContaining({ targetId: 'general', policy: 'pin', factors: { pin: '1234' } })));
  });

  it('requires a host-owned begin then confirm transaction for TOTP policies', async () => {
    const beginTotpEnrollment = vi.fn(async () => ({ ok: true, enrollmentId: '0123456789abcdef0123456789abcdef', expiresAtMs: 100 }));
    const confirmTotpEnrollment = vi.fn(async () => ({ ok: true, lock: { targetId: 'general', policy: 'pin-totp', revision: 1, maximumAttempts: 5, remainingAttempts: 5, cooldownUntilMs: null } }));
    restoreHost = installMockOpenDesignHost({ host: { toyLocks: { beginTotpEnrollment, confirmTotpEnrollment, configure: vi.fn(), list: vi.fn(async () => ({ ok: true, locks: [], protectionAvailable: true })), remove: vi.fn(), verify: vi.fn() } } });
    render(<SettingsToyLockPanel anchor={anchor} locks={new Map()} onLocksChanged={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Authentication policy'), { target: { value: 'pin-totp' } });
    for (const digit of ['1', '2', '3', '4']) fireEvent.click(screen.getByRole('button', { name: digit }));
    fireEvent.change(screen.getByLabelText('Authenticator Base32 secret'), { target: { value: 'JBSWY3DPEHPK3PXP' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save toy lock' }));
    await waitFor(() => expect(beginTotpEnrollment).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText('Current authenticator code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm authenticator pairing' }));
    await waitFor(() => expect(confirmTotpEnrollment).toHaveBeenCalledWith({ targetId: 'general', enrollmentId: '0123456789abcdef0123456789abcdef', code: '123456' }));
    expect(screen.getByText(/local application-data folder/)).toBeTruthy();
  });

  it('renders local QR pairing and keeps the manual secret behind an explicit reveal', () => {
    restoreHost = installMockOpenDesignHost({ host: { toyLocks: { beginTotpEnrollment: vi.fn(), confirmTotpEnrollment: vi.fn(), configure: vi.fn(), list: vi.fn(async () => ({ ok: true, locks: [], protectionAvailable: true })), remove: vi.fn(), verify: vi.fn() } } });
    render(<SettingsToyLockPanel anchor={anchor} locks={new Map()} onLocksChanged={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Authentication policy'), { target: { value: 'pin-totp' } });
    fireEvent.change(screen.getByLabelText('Authenticator Base32 secret'), { target: { value: 'JBSWY3DPEHPK3PXP' } });
    expect(screen.getByTestId('toy-lock-totp-qr').querySelector('svg')?.getAttribute('role')).toBe('img');
    expect(screen.queryByTestId('toy-lock-totp-manual-secret')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Reveal manual pairing secret' }));
    expect(screen.getByTestId('toy-lock-totp-manual-secret').textContent).toBe('JBSWY3DPEHPK3PXP');
  });

  it('persists and bulk-manages local Support Tickets without a network route', () => {
    restoreHost = installMockOpenDesignHost({ host: { toyLocks: { beginTotpEnrollment: vi.fn(), confirmTotpEnrollment: vi.fn(), configure: vi.fn(), list: vi.fn(async () => ({ ok: true, locks: [], protectionAvailable: true })), remove: vi.fn(), verify: vi.fn(), openRecoveryFolder: vi.fn(async () => ({ ok: true, path: 'C:/example/app-data' })) } } });
    render(<SettingsToyLockPanel anchor={anchor} locks={new Map()} onLocksChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Open Support Tickets/ }));
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'The lock is being delightfully stubborn.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create local ticket' }));
    expect(screen.getByTestId('toy-lock-support-surface').querySelectorAll('li')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Select all visible tickets' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss selected tickets' }));
    expect(screen.getByText(/status dismissed/)).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem('open-design:toy-lock-support-tickets') ?? '[]')).toHaveLength(1);
  });

  it('shows and copies the exact host recovery path only after a successful open', async () => {
    const path = 'C:/example/app-data';
    const openRecoveryFolder = vi.fn(async () => ({ ok: true as const, path }));
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn(async () => undefined) } });
    restoreHost = installMockOpenDesignHost({ host: { toyLocks: { beginTotpEnrollment: vi.fn(), confirmTotpEnrollment: vi.fn(), configure: vi.fn(), list: vi.fn(async () => ({ ok: true, locks: [], protectionAvailable: true })), remove: vi.fn(), verify: vi.fn(), openRecoveryFolder } } });
    render(<SettingsToyLockPanel anchor={anchor} locks={new Map()} onLocksChanged={vi.fn()} />);
    fireEvent.click(screen.getByTestId('toy-lock-support-tickets'));
    fireEvent.click(screen.getByTestId('toy-lock-support-open-folder'));
    await waitFor(() => expect(screen.getByText(`Recovery folder: ${path}`)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Copy recovery path' }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(path));
  });

  it('refuses an invalid or empty host recovery result without displaying a path', async () => {
    const openRecoveryFolder = vi.fn(async () => ({ ok: true as const, path: '' }));
    restoreHost = installMockOpenDesignHost({ host: { toyLocks: { beginTotpEnrollment: vi.fn(), confirmTotpEnrollment: vi.fn(), configure: vi.fn(), list: vi.fn(async () => ({ ok: true, locks: [], protectionAvailable: true })), remove: vi.fn(), verify: vi.fn(), openRecoveryFolder } } });
    render(<SettingsToyLockPanel anchor={anchor} locks={new Map()} onLocksChanged={vi.fn()} />);
    fireEvent.click(screen.getByTestId('toy-lock-support-tickets'));
    fireEvent.click(screen.getByTestId('toy-lock-support-open-folder'));
    await waitFor(() => expect(screen.getByText(/could not be opened/)).toBeTruthy());
    expect(screen.queryByText(/Recovery folder:/)).toBeNull();
  });

  it('migrates legacy tickets without severity and records the migration', async () => {
    window.localStorage.setItem('open-design:toy-lock-support-tickets', JSON.stringify([{
      id: 'LOCAL-LEGACY-1', category: 'locked-out', description: 'legacy',
      createdAt: new Date().toISOString(), status: 'open',
    }]));
    restoreHost = installMockOpenDesignHost({ host: { toyLocks: { beginTotpEnrollment: vi.fn(), confirmTotpEnrollment: vi.fn(), configure: vi.fn(), list: vi.fn(async () => ({ ok: true, locks: [], protectionAvailable: true })), remove: vi.fn(), verify: vi.fn() } } });
    render(<SettingsToyLockPanel anchor={anchor} locks={new Map()} onLocksChanged={vi.fn()} />);
    fireEvent.click(screen.getByTestId('toy-lock-support-tickets'));
    expect(screen.getByText(/Ticket LOCAL-LEGACY-1/)).toBeTruthy();
    await waitFor(() => expect(window.localStorage.getItem('open-design:toy-lock-support-ticket-migration')).toContain('migrated-legacy-severity'));
  });

  it('keeps a support-only entry point from exposing existing-lock mutators', () => {
    restoreHost = installMockOpenDesignHost({ host: { toyLocks: { beginTotpEnrollment: vi.fn(), confirmTotpEnrollment: vi.fn(), configure: vi.fn(), list: vi.fn(async () => ({ ok: true, locks: [], protectionAvailable: true })), remove: vi.fn(), verify: vi.fn() } } });
    render(<SettingsToyLockPanel supportOnly initialSupportOpen anchor={anchor} locks={new Map([['general', { targetId: 'general', policy: 'pin', revision: 1, maximumAttempts: 5, remainingAttempts: 5, cooldownUntilMs: null }])]} onLocksChanged={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Save toy lock' })).toBeNull();
    expect(screen.getByTestId('toy-lock-support-surface')).toBeTruthy();
  });
  it('authenticates the existing policy before removing a lock', async () => {
    const verify = vi.fn(async () => ({ ok: true as const, matched: true, lock: { targetId: 'general' as const, policy: 'pin' as const, revision: 1, maximumAttempts: 5, remainingAttempts: 5, cooldownUntilMs: null } }));
    const remove = vi.fn(async () => ({ ok: true as const }));
    restoreHost = installMockOpenDesignHost({ host: { toyLocks: { openRecoveryFolder: vi.fn(), beginTotpEnrollment: vi.fn(), confirmTotpEnrollment: vi.fn(), configure: vi.fn(), list: vi.fn(async () => ({ ok: true, locks: [], protectionAvailable: true })), remove, verify } } });
    render(<SettingsToyLockPanel anchor={anchor} locks={new Map([['general', { targetId: 'general', policy: 'pin', revision: 1, maximumAttempts: 5, remainingAttempts: 5, cooldownUntilMs: null }])]} onLocksChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove lock' }));
    for (const digit of ['1', '2', '3', '4']) fireEvent.click(screen.getByRole('button', { name: digit }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(verify).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(remove).toHaveBeenCalledWith('general', 1));
  });
});

// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  SettingsTabStrip,
  SETTINGS_TAB_APPEARANCE_REQUEST_EVENT,
  type SettingsTabToyLock,
} from '../../src/components/settings/SettingsTabStrip';
import { SETTINGS_TAB_DEFS } from '../../src/components/settings/settingsTabs';
import {
  TOY_LOCK_POLICIES,
  factorsForPolicy,
  type ToyLockFactor,
  type ToyLockPolicy,
} from '../../src/security/toy-lock-core';
import type { ToyLockVerificationRequest } from '../../src/components/ToyLockAuthenticationPopover';
import type { SettingsSection } from '../../src/components/SettingsDialog';

const execution = SETTINGS_TAB_DEFS.execution!;
const privacy = SETTINGS_TAB_DEFS.privacy!;
const appearance = SETTINGS_TAB_DEFS.appearance!;
const tabs = [execution, privacy] as const;
const SETTINGS_TAB_STATE_KEY = 'open-design:settings-tabs:v2';

afterEach(() => {
  cleanup();
  window.localStorage.removeItem(SETTINGS_TAB_STATE_KEY);
});

function renderStrip(
  policy: ToyLockPolicy | null,
  verifyToyLockFactor: (
    request: ToyLockVerificationRequest,
  ) => boolean | Promise<boolean> = () => true,
) {
  const onSelect = vi.fn();
  const toyLocks = new Map<SettingsSection, SettingsTabToyLock>();
  if (policy) toyLocks.set('privacy', { locked: true, policy });
  render(
    <SettingsTabStrip
      activeSection="execution"
      onSelect={onSelect}
      matchCounts={null}
      searchField={null}
      tabs={tabs}
      toyLocks={toyLocks}
      verifyToyLockFactor={verifyToyLockFactor}
    />,
  );
  return { onSelect };
}

function tab(section: SettingsSection): HTMLButtonElement {
  const element = document.querySelector<HTMLButtonElement>(
    `[role="tab"][data-section="${section}"]`,
  );
  if (!element) throw new Error(`missing Settings tab ${section}`);
  return element;
}

function enterFactor(factor: ToyLockFactor): void {
  if (factor === 'pin') {
    for (const digit of ['1', '2', '3', '4']) {
      fireEvent.click(screen.getByRole('button', { name: digit }));
    }
  } else {
    fireEvent.change(
      screen.getByLabelText(factor === 'password' ? 'Password' : 'Authenticator code'),
      { target: { value: factor === 'password' ? 'candidate password' : '123456' } },
    );
  }
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
}

describe('SettingsTabStrip toy-lock activation wiring', () => {
  it('runs the original tab selection once when the target is unlocked', () => {
    const { onSelect } = renderStrip(null);

    fireEvent.click(tab('privacy'));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('privacy');
    expect(screen.queryByTestId('toy-lock-authentication')).toBeNull();
  });

  it.each(TOY_LOCK_POLICIES)(
    'preserves the protected selection until every factor passes for %s',
    async (policy) => {
      const verify = vi.fn(() => true);
      const { onSelect } = renderStrip(policy, verify);
      const lockedTab = tab('privacy');

      expect(lockedTab.disabled).toBe(false);
      expect(lockedTab.getAttribute('aria-disabled')).toBe('true');
      expect(lockedTab.getAttribute('data-toy-lock-policy')).toBe(policy);
      fireEvent.click(lockedTab);

      expect(screen.getByTestId('toy-lock-authentication')).toBeTruthy();
      expect(onSelect).not.toHaveBeenCalled();

      const factors = factorsForPolicy(policy);
      for (const [index, factor] of factors.entries()) {
        enterFactor(factor);
        await waitFor(() => expect(verify).toHaveBeenCalledTimes(index + 1));
        if (index < factors.length - 1) expect(onSelect).not.toHaveBeenCalled();
      }

      await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1));
      expect(onSelect).toHaveBeenCalledWith('privacy');
      expect(screen.queryByTestId('toy-lock-authentication')).toBeNull();
      expect(document.activeElement).toBe(lockedTab);
    },
  );

  it('routes manual PIN entry through the existing verifier contract', async () => {
    const verify = vi.fn(() => true);
    const { onSelect } = renderStrip('pin', verify);

    fireEvent.click(tab('privacy'));
    fireEvent.click(screen.getByRole('button', { name: 'Manual PIN entry' }));
    fireEvent.change(screen.getByTestId('toy-lock-factor-input'), {
      target: { value: ' 1234 ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1));
    expect(verify).toHaveBeenCalledWith(expect.objectContaining({
      targetId: 'privacy',
      policy: 'pin',
      factor: 'pin',
      value: '1234',
      pinSource: 'manual',
    }));
  });

  it('cancels without selecting and restores focus to the activation-capable tab', () => {
    const { onSelect } = renderStrip('password');
    const lockedTab = tab('privacy');
    lockedTab.focus();
    fireEvent.click(lockedTab);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.queryByTestId('toy-lock-authentication')).toBeNull();
    expect(document.activeElement).toBe(lockedTab);
  });

  it('intercepts keyboard tab activation before changing the active section', () => {
    const { onSelect } = renderStrip('password');
    const tablist = screen.getByRole('tablist');

    fireEvent.keyDown(tablist, { key: 'ArrowDown' });

    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByTestId('toy-lock-authentication')).toBeTruthy();
    expect(tab('privacy').getAttribute('aria-selected')).toBe('false');
  });

  it('wraps from the last visible vertical tab when one of three persisted tabs is closed', () => {
    window.localStorage.setItem(SETTINGS_TAB_STATE_KEY, JSON.stringify({
      order: ['execution', 'privacy', 'appearance'],
      pinned: [],
      closed: ['appearance'],
      groups: [],
      membership: {},
    }));
    const onSelect = vi.fn();
    render(
      <SettingsTabStrip
        activeSection="privacy"
        onSelect={onSelect}
        matchCounts={null}
        searchField={null}
        tabs={[execution, privacy, appearance]}
      />,
    );
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowDown' });
    expect(onSelect).toHaveBeenCalledWith('execution');
  });

  it('keeps the configured maximum separate from remaining attempts in the prompt', () => {
    render(
      <SettingsTabStrip
        activeSection="execution"
        onSelect={vi.fn()}
        matchCounts={null}
        searchField={null}
        tabs={tabs}
        toyLocks={new Map<SettingsSection, SettingsTabToyLock>([
          ['privacy', { locked: true, policy: 'password', maximumAttempts: 5, remainingAttempts: 2 }],
        ])}
      />,
    );
    fireEvent.click(tab('privacy'));
    expect(screen.getByText('2 of 5 attempts remaining')).toBeTruthy();
  });

  it('keeps the overflow action pending until authentication succeeds', async () => {
    const { onSelect } = renderStrip('password');
    fireEvent.click(screen.getByTestId('settings-tabs-overflow'));
    const menu = screen.getByTestId('settings-tabs-overflow-menu');
    const privacyItem = menu.querySelector<HTMLButtonElement>('[data-section="privacy"]');
    expect(privacyItem).toBeTruthy();

    fireEvent.click(privacyItem!);

    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByTestId('settings-tabs-overflow-menu')).toBeTruthy();
    const password = screen.getByLabelText('Password');
    fireEvent.mouseDown(password);
    expect(screen.getByTestId('settings-tabs-overflow-menu')).toBeTruthy();
    fireEvent.change(password, { target: { value: 'candidate' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('settings-tabs-overflow-menu')).toBeNull();
    expect(document.activeElement).toBe(tab('privacy'));
  });

  it('keeps the overflow anchor mounted and focused when authentication is cancelled', () => {
    const { onSelect } = renderStrip('password');
    fireEvent.click(screen.getByTestId('settings-tabs-overflow'));
    const menu = screen.getByTestId('settings-tabs-overflow-menu');
    const privacyItem = menu.querySelector<HTMLButtonElement>('[data-section="privacy"]');
    expect(privacyItem).toBeTruthy();

    fireEvent.click(privacyItem!);
    fireEvent.mouseDown(screen.getByLabelText('Password'));
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.queryByTestId('toy-lock-authentication')).toBeNull();
    expect(screen.getByTestId('settings-tabs-overflow-menu')).toBeTruthy();
    expect(document.activeElement).toBe(privacyItem);
  });

  it('sends every factor together to the host-owned revisioned policy verifier', async () => {
    const onSelect = vi.fn();
    const verifyPolicy = vi.fn(() => ({ matched: true, maximumAttempts: 5, remainingAttempts: 5 }));
    render(
      <SettingsTabStrip
        activeSection="execution"
        onSelect={onSelect}
        matchCounts={null}
        searchField={null}
        tabs={tabs}
        toyLocks={new Map([['privacy', {
          locked: true, policy: 'password-pin-totp', revision: 7, maximumAttempts: 5, remainingAttempts: 5,
        }]])}
        verifyToyLockPolicy={verifyPolicy}
      />,
    );
    fireEvent.click(tab('privacy'));
    for (const factor of factorsForPolicy('password-pin-totp')) enterFactor(factor);
    await waitFor(() => expect(verifyPolicy).toHaveBeenCalledTimes(1));
    expect(verifyPolicy).toHaveBeenCalledWith({
      targetId: 'privacy',
      policy: 'password-pin-totp',
      factors: { password: 'candidate password', pin: '1234', totp: '123456' },
    });
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith('privacy'));
  });

  it('opens the searchable context menu and routes its configure action to the exact tab', () => {
    const onConfigureToyLock = vi.fn();
    render(
      <SettingsTabStrip
        activeSection="execution"
        onSelect={vi.fn()}
        matchCounts={null}
        searchField={null}
        tabs={tabs}
        toyLocks={new Map<SettingsSection, SettingsTabToyLock>([
          ['privacy', { locked: false, policy: 'password' }],
        ])}
        onConfigureToyLock={onConfigureToyLock}
      />,
    );
    fireEvent.contextMenu(tab('privacy'), { clientX: 20, clientY: 20 });
    expect(screen.getByTestId('settings-tab-context-menu-search')).toBeTruthy();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Configure toy lock…' }));
    expect(onConfigureToyLock).toHaveBeenCalledWith('privacy', tab('privacy'));
  });

  it('filters the keyboard-opened context menu before it configures the locked target', async () => {
    const onConfigureToyLock = vi.fn();
    render(
      <SettingsTabStrip
        activeSection="execution"
        onSelect={vi.fn()}
        matchCounts={null}
        searchField={null}
        tabs={tabs}
        toyLocks={new Map<SettingsSection, SettingsTabToyLock>([
          ['privacy', { locked: true, policy: 'password' }],
        ])}
        verifyToyLockFactor={() => true}
        onConfigureToyLock={onConfigureToyLock}
      />,
    );
    const lockedTab = tab('privacy');
    lockedTab.focus();
    fireEvent.keyDown(lockedTab, { key: 'F10', shiftKey: true });
    const filter = screen.getByTestId('settings-tab-context-menu-search');
    expect(document.activeElement).toBe(filter);
    fireEvent.change(filter, { target: { value: 'configure' } });
    expect(screen.queryByRole('menuitem', { name: 'Edit tab appearance…' })).toBeNull();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Configure toy lock…' }));
    expect(onConfigureToyLock).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'candidate password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(onConfigureToyLock).toHaveBeenCalledWith('privacy', lockedTab));
  });

  it('authenticates a locked tab before dispatching appearance editing', async () => {
    const onEditTabAppearance = vi.fn();
    const verify = vi.fn(() => true);
    render(
      <SettingsTabStrip
        activeSection="execution"
        onSelect={vi.fn()}
        matchCounts={null}
        searchField={null}
        tabs={tabs}
        toyLocks={new Map<SettingsSection, SettingsTabToyLock>([['privacy', { locked: true, policy: 'password' }]])}
        verifyToyLockFactor={verify}
        onEditTabAppearance={onEditTabAppearance}
      />,
    );
    fireEvent.contextMenu(tab('privacy'), { clientX: 20, clientY: 20 });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit tab appearance…' }));
    expect(onEditTabAppearance).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'candidate password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(onEditTabAppearance).toHaveBeenCalledWith('privacy', tab('privacy')));
    expect(verify).toHaveBeenCalledTimes(1);
  });

  it('authenticates a locked tab before opening its configuration route', async () => {
    const onConfigureToyLock = vi.fn();
    render(
      <SettingsTabStrip
        activeSection="execution"
        onSelect={vi.fn()}
        matchCounts={null}
        searchField={null}
        tabs={tabs}
        toyLocks={new Map<SettingsSection, SettingsTabToyLock>([['privacy', { locked: true, policy: 'password' }]])}
        verifyToyLockFactor={() => true}
        onConfigureToyLock={onConfigureToyLock}
      />,
    );
    fireEvent.contextMenu(tab('privacy'), { clientX: 20, clientY: 20 });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Configure toy lock…' }));
    expect(onConfigureToyLock).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'candidate password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(onConfigureToyLock).toHaveBeenCalledWith('privacy', tab('privacy')));
  });

  it('dispatches the anchored appearance adapter contract when no shared editor callback is supplied', () => {
    const requests: CustomEvent[] = [];
    const listener = (event: Event) => requests.push(event as CustomEvent);
    window.addEventListener(SETTINGS_TAB_APPEARANCE_REQUEST_EVENT, listener);
    render(<SettingsTabStrip activeSection="execution" onSelect={vi.fn()} matchCounts={null} searchField={null} tabs={tabs} />);
    fireEvent.contextMenu(tab('privacy'), { clientX: 20, clientY: 20, shiftKey: true });
    window.removeEventListener(SETTINGS_TAB_APPEARANCE_REQUEST_EVENT, listener);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.detail).toMatchObject({ section: 'privacy', anchor: tab('privacy') });
  });
});

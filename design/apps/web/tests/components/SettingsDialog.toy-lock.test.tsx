// @vitest-environment jsdom
import { act, cleanup, render, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OpenDesignToyLockMetadata } from '@open-design/host';
import { useSettingsToyLocks } from '../../src/components/SettingsDialog.toy-lock';

const host = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock('@open-design/host', async (original) => ({ ...(await original<object>()), getOpenDesignHost: () => host.current }));
const metadata: OpenDesignToyLockMetadata = {
  targetId: 'privacy', policy: 'password-pin-totp', revision: 7,
  remainingAttempts: 4, maximumAttempts: 5, cooldownUntilMs: null,
  unlocked: false, unlockDuration: 'surface', unlockUntilMs: null,
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
}
beforeEach(() => { host.current = undefined; });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('SettingsDialog host-backed toy lock controller', () => {
  it('reports unavailable instead of inventing an unlocked surface without a host', () => {
    const { result } = renderHook(() => useSettingsToyLocks());
    expect(result.current.settingsToyLockStatus).toBe('unavailable');
  });
  it('waits for metadata, derives tab locks and retains configured durations', async () => {
    const pending = deferred<unknown>();
    host.current = { toyLocks: { list: () => pending.promise } };
    const { result } = renderHook(() => useSettingsToyLocks());
    expect(result.current.settingsToyLockStatus).toBe('loading');
    await act(async () => pending.resolve({ ok: true, locks: [{ ...metadata, unlockDuration: '5-minutes' }] }));
    expect(result.current.settingsToyLockStatus).toBe('ready');
    expect(result.current.settingsTabToyLocks.get('privacy')).toMatchObject({ locked: true, revision: 7 });
    expect(result.current.settingsToyLockDurations.get('privacy')).toBe('5-minutes');
  });
  it.each(['rejected', 'refused'] as const)('reports unavailable for a %s list', async (kind) => {
    host.current = { toyLocks: { list: () => kind === 'rejected' ? Promise.reject(new Error('unavailable')) : Promise.resolve({ ok: false, code: 'store-corrupt' }) } };
    const { result } = renderHook(() => useSettingsToyLocks());
    await waitFor(() => expect(result.current.settingsToyLockStatus).toBe('unavailable'));
  });
  it('bounds a host that never settles', async () => {
    vi.useFakeTimers();
    host.current = { toyLocks: { list: () => new Promise(() => {}) } };
    const { result } = renderHook(() => useSettingsToyLocks());
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(result.current.settingsToyLockStatus).toBe('unavailable');
  });
  it('submits every factor once and refreshes authoritative attempt metadata', async () => {
    const updated = { ...metadata, revision: 8, remainingAttempts: 3, cooldownUntilMs: 500 };
    const verify = vi.fn(async () => ({ ok: true, matched: false, lock: updated }));
    host.current = { toyLocks: { list: async () => ({ ok: true, locks: [metadata] }), verify } };
    const { result } = renderHook(() => useSettingsToyLocks());
    await waitFor(() => expect(result.current.settingsToyLockStatus).toBe('ready'));
    const factors = { password: 'test-only', pin: '1234', totp: '123456' };
    await act(async () => {
      expect(await result.current.verifySettingsTabToyLockPolicy({ targetId: 'privacy', policy: metadata.policy, revision: 7, factors })).toMatchObject({ matched: false, remainingAttempts: 3 });
    });
    expect(verify).toHaveBeenCalledExactlyOnceWith({ targetId: 'privacy', revision: 7, factors });
    expect(result.current.settingsToyLocks.get('privacy')).toEqual(updated);
    expect(result.current.settingsTabToyLocks.get('privacy')).toMatchObject({ locked: true, cooldownUntilMs: 500 });
  });
  it('refuses mismatched targets, policies and stale revisions before host verification', async () => {
    const verify = vi.fn();
    host.current = { toyLocks: { list: async () => ({ ok: true, locks: [metadata] }), verify } };
    const { result } = renderHook(() => useSettingsToyLocks());
    await waitFor(() => expect(result.current.settingsToyLockStatus).toBe('ready'));
    for (const request of [
      { targetId: 'missing', policy: metadata.policy, revision: 7, factors: {} },
      { targetId: 'privacy', policy: 'pin' as const, revision: 7, factors: {} },
      { targetId: 'privacy', policy: metadata.policy, revision: 6, factors: {} },
    ]) expect(await result.current.verifySettingsTabToyLockPolicy(request)).toBeNull();
    expect(verify).not.toHaveBeenCalled();
  });
  it('ignores an older list after a newer refresh completes', async () => {
    const first = deferred<unknown>();
    const list = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue({ ok: true, locks: [] });
    host.current = { toyLocks: { list } };
    const { result } = renderHook(() => useSettingsToyLocks());
    await act(async () => result.current.refreshSettingsToyLocks());
    await act(async () => first.resolve({ ok: true, locks: [metadata] }));
    expect(result.current.settingsToyLocks.size).toBe(0);
    expect(result.current.settingsToyLockStatus).toBe('ready');
  });
  it('invalidates pending verification on unmount', async () => {
    const pending = deferred<unknown>();
    host.current = { toyLocks: { list: async () => ({ ok: true, locks: [metadata] }), verify: () => pending.promise } };
    const { result, unmount } = renderHook(() => useSettingsToyLocks());
    await waitFor(() => expect(result.current.settingsToyLockStatus).toBe('ready'));
    const response = result.current.verifySettingsTabToyLockPolicy({ targetId: 'privacy', policy: metadata.policy, factors: {} });
    unmount();
    pending.resolve({ ok: true, matched: true, lock: { ...metadata, unlocked: true } });
    expect(await response).toBeNull();
  });
  it('opens recovery against a real anchor and marks it support-only', () => {
    let controller: ReturnType<typeof useSettingsToyLocks> | undefined;
    function Surface() {
      controller = useSettingsToyLocks(true);
      return <button ref={controller.settingsSupportAnchorRef}>Settings</button>;
    }
    const { getByRole } = render(<Surface />);
    expect(controller?.toyLockConfigurationTarget).toEqual({ targetId: 'general', anchor: getByRole('button'), supportOpen: true, supportOnly: true });
  });
});
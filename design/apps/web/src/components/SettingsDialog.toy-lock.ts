import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getOpenDesignHost, OPEN_DESIGN_SETTINGS_TOY_LOCK_TARGETS, type OpenDesignSettingsToyLockTarget } from '@open-design/host';
import type { SettingsSection } from './SettingsDialog';
import type { SettingsTabToyLock, UnlockDuration } from './settings/SettingsTabStrip';
import type { SettingsToyLockMap } from './settings/SettingsToyLockPanel';
import type { ToyLockPolicyVerificationRequest } from './ToyLockAuthenticationPopover';
import { withToyLockUiDeadline } from './settings/toy-lock-host-call';

function isSettingsToyLockTarget(value: string): value is OpenDesignSettingsToyLockTarget {
  return (OPEN_DESIGN_SETTINGS_TOY_LOCK_TARGETS as readonly string[]).includes(value);
}

export function useSettingsToyLocks(initialSupportTicketsOpen = false) {
  const settingsSupportAnchorRef = useRef<HTMLButtonElement | null>(null);
  const [settingsToyLocks, setSettingsToyLocks] = useState<SettingsToyLockMap>(() => new Map());
  const [settingsToyLockStatus, setSettingsToyLockStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [settingsToyLockDurations, setSettingsToyLockDurations] = useState<ReadonlyMap<OpenDesignSettingsToyLockTarget, UnlockDuration>>(() => new Map());
  const [toyLockConfigurationTarget, setToyLockConfigurationTarget] = useState<{
    targetId: OpenDesignSettingsToyLockTarget;
    anchor: HTMLElement;
    supportOpen?: boolean;
    supportOnly?: boolean;
  } | null>(null);
  const toyLockRequestGeneration = useRef(0);
  const acceptSettingsToyLocks = useCallback((locks: SettingsToyLockMap) => {
    toyLockRequestGeneration.current += 1;
    setSettingsToyLocks(new Map(locks));
    setSettingsToyLockDurations(new Map(Array.from(locks, ([id, lock]) => [id, lock.unlockDuration])));
    setSettingsToyLockStatus('ready');
  }, []);
  const settingsTabToyLocks = useMemo(() => new Map<SettingsSection, SettingsTabToyLock>(
    Array.from(settingsToyLocks, ([id, lock]) => [id, { ...lock, locked: !lock.unlocked }]),
  ), [settingsToyLocks]);
  const refreshSettingsToyLocks = useCallback(async () => {
    const generation = ++toyLockRequestGeneration.current;
    const host = getOpenDesignHost();
    setSettingsToyLockStatus('loading');
    if (!host?.toyLocks) {
      setSettingsToyLockStatus('unavailable');
      return;
    }
    const toyLocks = host.toyLocks;
    try {
      const result = await withToyLockUiDeadline(() => toyLocks.list());
      if (generation !== toyLockRequestGeneration.current) return;
      if (!result?.ok) {
        setSettingsToyLockStatus('unavailable');
        return;
      }
      acceptSettingsToyLocks(new Map(result.locks.filter((lock) => isSettingsToyLockTarget(lock.targetId)).map((lock) => [lock.targetId, lock])));
    } catch {
      if (generation === toyLockRequestGeneration.current) setSettingsToyLockStatus('unavailable');
    }
  }, [acceptSettingsToyLocks]);
  useEffect(() => {
    void refreshSettingsToyLocks();
    return () => { toyLockRequestGeneration.current += 1; };
  }, [refreshSettingsToyLocks]);
  useEffect(() => {
    if (initialSupportTicketsOpen && settingsSupportAnchorRef.current) {
      setToyLockConfigurationTarget({ targetId: 'general', anchor: settingsSupportAnchorRef.current, supportOpen: true, supportOnly: true });
    }
  }, [initialSupportTicketsOpen]);
  const verifySettingsTabToyLockPolicy = useCallback(async (request: ToyLockPolicyVerificationRequest) => {
    if (!isSettingsToyLockTarget(request.targetId)) return null;
    const lock = settingsToyLocks.get(request.targetId);
    const host = getOpenDesignHost();
    if (!lock || lock.policy !== request.policy || !host?.toyLocks
      || (request.revision !== undefined && request.revision !== lock.revision)) return null;
    const generation = toyLockRequestGeneration.current;
    const targetId = request.targetId;
    const toyLocks = host.toyLocks;
    try {
      const result = await withToyLockUiDeadline(() => toyLocks.verify({
        targetId, revision: lock.revision, factors: request.factors,
      }));
      if (generation !== toyLockRequestGeneration.current) return null;
      if (!result?.ok) {
        void refreshSettingsToyLocks();
        return null;
      }
      if (result.lock.targetId !== targetId) return null;
      setSettingsToyLocks((current) => current.get(targetId)?.revision === lock.revision
        ? new Map(current).set(targetId, result.lock) : current);
      return { ...result.lock, matched: result.matched };
    } catch {
      if (generation === toyLockRequestGeneration.current) setSettingsToyLockStatus('unavailable');
      return null;
    }
  }, [refreshSettingsToyLocks, settingsToyLocks]);
  return { settingsSupportAnchorRef, settingsToyLocks, settingsToyLockStatus, settingsToyLockDurations,
    setSettingsToyLockDurations, toyLockConfigurationTarget, setToyLockConfigurationTarget,
    acceptSettingsToyLocks, settingsTabToyLocks, refreshSettingsToyLocks, verifySettingsTabToyLockPolicy };
}
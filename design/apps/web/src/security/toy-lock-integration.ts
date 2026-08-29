import type {
  OpenDesignHostToyLocks,
  OpenDesignSettingsToyLockTarget,
  OpenDesignToyLockMetadata,
  OpenDesignToyLockPolicy,
} from '@open-design/host';

import { withToyLockUiDeadline } from '../components/toy-locks/host-call';
import {
  createAttemptBudget,
  factorsForPolicy,
  TOY_LOCK_POLICY_INPUT_INVENTORY,
  type AttemptBudget,
  type ToyLockPolicy,
  type ToyLockUnlockDuration,
} from './toy-lock-core';

/** Older desktop builds may expose the original six operations only. */
export type ToyLockHost = Omit<OpenDesignHostToyLocks, 'openRecoveryFolder'>
  & Partial<Pick<OpenDesignHostToyLocks, 'openRecoveryFolder'>>;

export interface ToyLockIntegrationApi {
  readonly policyInventory: typeof TOY_LOCK_POLICY_INPUT_INVENTORY;
  readonly createBudget: (maximum?: number) => AttemptBudget;
  readonly factorsForPolicy: (policy: ToyLockPolicy) => readonly string[];
  readonly list: () => Promise<OpenDesignToyLockMetadata[]>;
  readonly verifyPolicy: (request: {
    readonly targetId: OpenDesignSettingsToyLockTarget;
    readonly policy: OpenDesignToyLockPolicy;
    readonly revision: number;
    readonly factors: Readonly<Partial<Record<'pin' | 'password' | 'totp', string>>>;
  }) => Promise<{ matched: boolean; maximumAttempts: number; remainingAttempts: number } | null>;
  readonly openRecoveryFolder: () => Promise<{ ok: true; path: string } | { ok: false; reason: string }>;
  readonly configure: ToyLockHost['configure'];
  readonly remove: ToyLockHost['remove'];
}

/**
 * Small adapter shared by settings, tabs, appearance and authenticator lanes.
 * It keeps host calls bounded and leaves credentials owned by the host.
 */
export function createToyLockIntegrationApi(host: ToyLockHost | null | undefined): ToyLockIntegrationApi {
  const list = async () => {
    if (!host) return [];
    const result = await withToyLockUiDeadline(() => host.list());
    return result.ok ? result.locks : [];
  };
  const verifyPolicy: ToyLockIntegrationApi['verifyPolicy'] = async ({ targetId, policy, revision, factors }) => {
    if (!host) return null;
    const result = await withToyLockUiDeadline(() => host.verify({
      targetId,
      revision,
      factors: Object.fromEntries(Object.entries(factors).filter(([, value]) => value !== undefined)) as {
        password?: string;
        pin?: string;
        totp?: string;
      },
    }));
    if (!result.ok) return null;
    return {
      matched: result.matched,
      maximumAttempts: result.lock.maximumAttempts,
      remainingAttempts: result.lock.remainingAttempts,
    };
  };
  const openRecoveryFolder = async () => {
    if (!host) return { ok: false as const, reason: 'host-unavailable' };
    if (!host.openRecoveryFolder) return { ok: false as const, reason: 'recovery-folder-unavailable' };
    const result = await withToyLockUiDeadline(() => host.openRecoveryFolder!());
    if (!result.ok) return result;
    return result.path.trim().length > 0 ? result : { ok: false as const, reason: 'recovery-folder-invalid' };
  };
  return {
    policyInventory: TOY_LOCK_POLICY_INPUT_INVENTORY,
    createBudget: createAttemptBudget,
    factorsForPolicy: (policy) => factorsForPolicy(policy),
    list,
    verifyPolicy,
    openRecoveryFolder,
    configure: (...args: Parameters<ToyLockHost['configure']>) => host
      ? host.configure(...args)
      : Promise.resolve({ code: 'os-protection-unavailable' as const, ok: false as const }),
    remove: (...args: Parameters<ToyLockHost['remove']>) => host
      ? host.remove(...args)
      : Promise.resolve({ code: 'os-protection-unavailable' as const, ok: false as const }),
  };
}

export type { ToyLockUnlockDuration };

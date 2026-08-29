import type { SecretVault } from './store.js';

/**
 * The central desktop seam supplies this interface from the platform's real
 * credential vault. This feature does not claim that an encrypted file is a
 * credential vault and has no file-backed fallback.
 */
export interface OperatingSystemCredentialVault extends SecretVault {
  readonly kind: 'operating-system-vault';
  isAvailable(): boolean;
  seal(value: Uint8Array, aad?: string): Promise<Uint8Array>;
  unseal(value: Uint8Array, aad?: string): Promise<Uint8Array>;
}

export class UnavailableSecretVault implements SecretVault {
  readonly kind = 'unavailable' as const;
  async put(): Promise<void> { throw new Error('The operating-system credential vault is unavailable.'); }
  async get(): Promise<Uint8Array | null> { throw new Error('The operating-system credential vault is unavailable.'); }
  async delete(): Promise<void> { throw new Error('The operating-system credential vault is unavailable.'); }
  async seal(): Promise<Uint8Array> { throw new Error('The operating-system credential vault is unavailable.'); }
  async unseal(): Promise<Uint8Array> { throw new Error('The operating-system credential vault is unavailable.'); }
}

export function requireOperatingSystemVault(vault: SecretVault): OperatingSystemCredentialVault {
  if (vault.kind !== 'operating-system-vault' || !('isAvailable' in vault) || typeof vault.isAvailable !== 'function' || !vault.isAvailable()) {
    throw new Error('The operating-system credential vault is unavailable.');
  }
  return vault as OperatingSystemCredentialVault;
}

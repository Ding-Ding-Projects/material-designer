import type { SecretVault } from './store.js';

export class CredentialVaultUnavailableError extends Error {
  constructor(message = 'The operating-system credential vault is unavailable.') { super(message); this.name = 'CredentialVaultUnavailableError'; }
}

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
  async put(_key: string, _secret: Uint8Array): Promise<void> { throw new CredentialVaultUnavailableError(); }
  async get(_key: string): Promise<Uint8Array | null> { throw new CredentialVaultUnavailableError(); }
  async delete(_key: string): Promise<void> { throw new CredentialVaultUnavailableError(); }
  async seal(_value: Uint8Array, _aad?: string): Promise<Uint8Array> { throw new CredentialVaultUnavailableError(); }
  async unseal(_value: Uint8Array, _aad?: string): Promise<Uint8Array> { throw new CredentialVaultUnavailableError(); }
}

export function requireOperatingSystemVault(vault: SecretVault): OperatingSystemCredentialVault {
  if (vault.kind !== 'operating-system-vault' || !('isAvailable' in vault) || typeof vault.isAvailable !== 'function' || !vault.isAvailable()) {
    throw new CredentialVaultUnavailableError();
  }
  return vault as OperatingSystemCredentialVault;
}

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { HistoryKeyVault } from './history.js';
import type { SecretVault } from './store.js';

const RETRY_DELAYS_MS = [0, 20, 50, 100, 150] as const;
const MAX_KEY_LENGTH = 128;
const MAX_SECRET_BYTES = 128;

export interface SafeStorageAdapter {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

export interface VaultFileOps {
  mkdir: typeof mkdir;
  readFile: typeof readFile;
  rename: typeof rename;
  unlink: typeof unlink;
  writeFile: typeof writeFile;
}

export class ElectronSecretVault implements SecretVault, HistoryKeyVault {
  readonly kind = 'operating-system-vault' as const;
  readonly #directory: string;
  readonly #safeStorage: SafeStorageAdapter;
  readonly #files: VaultFileOps;

  constructor(options: { directory: string; safeStorage: SafeStorageAdapter; fileOps?: Partial<VaultFileOps> }) {
    this.#directory = options.directory;
    this.#safeStorage = options.safeStorage;
    this.#files = { mkdir, readFile, rename, unlink, writeFile, ...options.fileOps };
  }

  isAvailable(): boolean {
    return this.#safeStorage.isEncryptionAvailable();
  }

  async seal(value: Uint8Array): Promise<Uint8Array> {
    this.#assertAvailable();
    return new Uint8Array(this.#safeStorage.encryptString(Buffer.from(value).toString('base64')));
  }

  async unseal(value: Uint8Array): Promise<Uint8Array> {
    this.#assertAvailable();
    const decoded = this.#safeStorage.decryptString(Buffer.from(value));
    const result = Buffer.from(decoded, 'base64');
    if (result.length > 512 * 1024) throw new Error('Vault payload exceeds the bounded size.');
    return new Uint8Array(result);
  }

  async put(key: string, secret: Uint8Array): Promise<void> {
    this.#assertAvailable();
    this.#assertKey(key);
    if (secret.length === 0 || secret.length > MAX_SECRET_BYTES) {
      throw new Error('Authenticator secret is outside the bounded size.');
    }
    const path = this.#path(key);
    await this.#files.mkdir(this.#directory, { recursive: true });
    const envelope = this.#safeStorage.encryptString(Buffer.from(secret).toString('base64'));
    await this.#atomicWrite(path, envelope.toString('base64'));
  }

  async get(key: string): Promise<Uint8Array | null> {
    this.#assertAvailable();
    this.#assertKey(key);
    try {
      const encoded = await this.#files.readFile(this.#path(key), 'utf8');
      const value = this.#safeStorage.decryptString(Buffer.from(encoded, 'base64'));
      const secret = Buffer.from(value, 'base64');
      if (secret.length === 0 || secret.length > MAX_SECRET_BYTES) {
        throw new Error('Authenticator secret is outside the bounded size.');
      }
      return new Uint8Array(secret);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw new Error('Authenticator secret could not be read from the operating-system vault.');
    }
  }

  async delete(key: string): Promise<void> {
    this.#assertAvailable();
    this.#assertKey(key);
    try {
      await this.#files.unlink(this.#path(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw new Error('Authenticator secret could not be removed from the operating-system vault.');
      }
    }
  }

  #path(key: string): string {
    return join(this.#directory, `${Buffer.from(key, 'utf8').toString('hex')}.vault`);
  }

  #assertAvailable(): void {
    if (!this.#safeStorage.isEncryptionAvailable()) {
      throw new Error('The operating-system credential vault is unavailable.');
    }
  }

  #assertKey(key: string): void {
    if (!/^[a-z0-9:_-]+$/iu.test(key) || key.length > MAX_KEY_LENGTH) {
      throw new Error('Authenticator vault key is invalid.');
    }
  }

  async #atomicWrite(path: string, value: string): Promise<void> {
    const temporary = `${path}.${randomUUID()}.tmp`;
    try {
      await this.#files.writeFile(temporary, value, { encoding: 'utf8', flag: 'wx' });
      let last: unknown;
      for (const delay of RETRY_DELAYS_MS) {
        if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
        try {
          await this.#files.rename(temporary, path);
          return;
        } catch (error) {
          last = error;
          const code = (error as NodeJS.ErrnoException).code;
          if (!code || !['EPERM', 'EACCES', 'EBUSY'].includes(code)) throw error;
        }
      }
      throw last instanceof Error ? last : new Error('Vault rename failed.');
    } finally {
      try { await this.#files.unlink(temporary); } catch { /* best effort cleanup */ }
    }
  }
}

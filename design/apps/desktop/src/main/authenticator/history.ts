import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

import type { HistoryWriter } from './store.js';

const execFileAsync = promisify(execFile);
const HISTORY_VERSION = 1 as const;
const MAX_SNAPSHOT_BYTES = 512 * 1024;
const MAX_HISTORY_RECORDS = 10_000;

export interface HistoryKeyVault {
  seal(value: Uint8Array, aad?: string): Promise<Uint8Array>;
  unseal(value: Uint8Array, aad?: string): Promise<Uint8Array>;
}

export interface AuthenticatorSecretSnapshotVault {
  get(key: string): Promise<Uint8Array | null>;
  seal(value: Uint8Array, aad: string): Promise<Uint8Array>;
  unseal(value: Uint8Array, aad: string): Promise<Uint8Array>;
  put(key: string, value: Uint8Array): Promise<void>;
  delete(key: string): Promise<void>;
}

export type EncryptedAuthenticatorSecret = {
  entryId: string;
  aad: string;
  ciphertext: string;
};

export type AuthenticatorHistorySnapshot = {
  version: 1;
  entries: unknown[];
  secrets: EncryptedAuthenticatorSecret[];
};

export function authenticatorEntryAad(entryId: string): string {
  if (!entryId || entryId.length > 128) throw new Error('Authenticator entry id is outside the bounded size.');
  return `authenticator-entry:${entryId}:v1`;
}

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

function base64ToBytes(value: string): Uint8Array {
  const result = Buffer.from(value, 'base64');
  if (result.length === 0 || result.length > 128) throw new Error('Encrypted authenticator secret is outside the bounded size.');
  return new Uint8Array(result);
}

export async function encryptAuthenticatorHistorySnapshot(
  entries: readonly unknown[],
  readSecret: (entryId: string) => Promise<Uint8Array | null>,
  seal: (value: Uint8Array, aad: string) => Promise<Uint8Array>,
): Promise<AuthenticatorHistorySnapshot> {
  const secrets: EncryptedAuthenticatorSecret[] = [];
  for (const value of entries) {
    if (!value || typeof value !== 'object' || typeof (value as { id?: unknown }).id !== 'string') throw new Error('Authenticator snapshot entry is malformed.');
    const entryId = (value as { id: string }).id;
    const secret = await readSecret(entryId);
    if (!secret) throw new Error(`Authenticator secret for ${entryId} is unavailable.`);
    const aad = authenticatorEntryAad(entryId);
    secrets.push({ entryId, aad, ciphertext: bytesToBase64(await seal(secret, aad)) });
  }
  return { version: 1, entries: entries.map((entry) => ({ ...(entry as Record<string, unknown>) })), secrets };
}

export async function decryptAuthenticatorHistorySnapshot(
  snapshot: unknown,
  unseal: (value: Uint8Array, aad: string) => Promise<Uint8Array>,
): Promise<{ entries: unknown[]; secrets: Map<string, Uint8Array> }> {
  if (!snapshot || typeof snapshot !== 'object') throw new Error('Authenticator history snapshot is malformed.');
  const value = snapshot as { version?: unknown; entries?: unknown; secrets?: unknown };
  if (value.version !== 1 || !Array.isArray(value.entries) || !Array.isArray(value.secrets)) throw new Error('Authenticator history snapshot version is unsupported.');
  if (value.entries.length > 1_000 || value.secrets.length !== value.entries.length) throw new Error('Authenticator history snapshot entry count is invalid.');
  const ids = new Set<string>();
  const secrets = new Map<string, Uint8Array>();
  for (const entry of value.entries) {
    if (!entry || typeof entry !== 'object' || typeof (entry as { id?: unknown }).id !== 'string' || ids.has((entry as { id: string }).id)) throw new Error('Authenticator history snapshot contains an invalid entry id.');
    ids.add((entry as { id: string }).id);
  }
  for (const encrypted of value.secrets) {
    if (!encrypted || typeof encrypted !== 'object' || typeof (encrypted as { entryId?: unknown }).entryId !== 'string' || typeof (encrypted as { aad?: unknown }).aad !== 'string' || typeof (encrypted as { ciphertext?: unknown }).ciphertext !== 'string') throw new Error('Authenticator encrypted secret record is malformed.');
    const entryId = (encrypted as { entryId: string }).entryId;
    const aad = authenticatorEntryAad(entryId);
    if ((encrypted as { aad: string }).aad !== aad || !ids.has(entryId) || secrets.has(entryId)) throw new Error('Authenticator encrypted secret AAD is invalid.');
    const plain = await unseal(base64ToBytes((encrypted as { ciphertext: string }).ciphertext), aad);
    if (plain.length === 0 || plain.length > 128) throw new Error('Authenticator secret is outside the bounded size.');
    secrets.set(entryId, plain);
  }
  if (secrets.size !== ids.size) throw new Error('Authenticator history snapshot is missing a secret.');
  return { entries: value.entries, secrets };
}

export type HistoryRecord = {
  version: typeof HISTORY_VERSION;
  id: string;
  action: string;
  createdAt: string;
  encryptedSnapshot: string;
};

export class LocalGitHistory implements HistoryWriter {
  readonly #directory: string;
  readonly #vault: HistoryKeyVault;
  readonly #now: () => Date;

  constructor(options: { directory: string; vault: HistoryKeyVault; now?: () => Date }) {
    this.#directory = options.directory;
    this.#vault = options.vault;
    this.#now = options.now ?? (() => new Date());
  }

  async init(): Promise<void> {
    await mkdir(this.#directory, { recursive: true });
    try {
      await execFileAsync('git', ['-C', this.#directory, 'rev-parse', '--git-dir']);
    } catch {
      await execFileAsync('git', ['-C', this.#directory, 'init', '--quiet']);
    }
  }

  async append(action: string, snapshot: unknown): Promise<void> {
    if (!action || action.length > 128) throw new Error('History action is outside the bounded size.');
    await this.init();
    assertRedacted(snapshot);
    const createdAt = this.#now().toISOString();
    const plain = new TextEncoder().encode(JSON.stringify({ action, snapshot, createdAt }));
    if (plain.length > MAX_SNAPSHOT_BYTES) throw new Error('History snapshot exceeds the bounded size.');
    const sealed = await this.#vault.seal(plain);
    const record: HistoryRecord = {
      version: HISTORY_VERSION,
      id: createHash('sha256').update(sealed).digest('hex').slice(0, 24),
      action,
      createdAt,
      encryptedSnapshot: Buffer.from(sealed).toString('base64'),
    };
    const path = join(this.#directory, `${record.id}.json`);
    await writeFile(path, `${JSON.stringify(record)}\n`, { encoding: 'utf8', flag: 'wx' });
    await execFileAsync('git', ['-C', this.#directory, 'add', '--', `${record.id}.json`]);
    await execFileAsync('git', [
      '-C', this.#directory,
      '-c',
      'user.name=Material Designer local history',
      '-c',
      'user.email=local-history@invalid',
      'commit',
      '--quiet',
      '-m',
      `Record ${action}`,
    ]);
  }

}

export class PasswordProtectedHistory {
  readonly #directory: string;
  readonly #vault: HistoryKeyVault;
  readonly #salt: Uint8Array;
  readonly #digest: Uint8Array;

  private constructor(directory: string, vault: HistoryKeyVault, salt: Uint8Array, digest: Uint8Array) {
    this.#directory = directory;
    this.#vault = vault;
    this.#salt = salt;
    this.#digest = digest;
  }

  static async create(directory: string, vault: HistoryKeyVault, password: string): Promise<PasswordProtectedHistory> {
    if (!password || password.length > 512) throw new Error('History password is empty or too long.');
    const salt = randomBytes(16);
    const digest = await derive(password, salt);
    const instance = new PasswordProtectedHistory(directory, vault, salt, digest);
    await mkdir(directory, { recursive: true });
    await writeFile(
      join(directory, 'history-access.json'),
      `${JSON.stringify({ version: 1, salt: Buffer.from(salt).toString('base64'), digest: Buffer.from(digest).toString('base64') })}\n`,
      { flag: 'wx' },
    );
    return instance;
  }

  static async open(directory: string, vault: HistoryKeyVault, password: string): Promise<PasswordProtectedHistory> {
    if (!password || password.length > 512) throw new Error('History password is empty or too long.');
    const document = JSON.parse(await readFile(join(directory, 'history-access.json'), 'utf8')) as { version: number; salt: string; digest: string };
    if (document.version !== 1) throw new Error('History access metadata is unsupported.');
    const salt = Buffer.from(document.salt, 'base64');
    const expected = Buffer.from(document.digest, 'base64');
    if (salt.length !== 16 || expected.length !== 32) throw new Error('History access metadata is malformed.');
    const actual = await derive(password, salt);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error('History password did not match.');
    return new PasswordProtectedHistory(directory, vault, salt, expected);
  }

  async records(): Promise<HistoryRecord[]> {
    const { stdout } = await execFileAsync('git', ['-C', this.#directory, 'ls-files', '--', '*.json']);
    const paths = stdout.split(/\r?\n/).filter((path: string) => path && path !== 'history-access.json');
    if (paths.length > MAX_HISTORY_RECORDS) throw new Error('History record count exceeds the bounded limit.');
    const rows: HistoryRecord[] = [];
    for (const path of paths) {
      const record = JSON.parse(await readFile(join(this.#directory, path), 'utf8')) as HistoryRecord;
      if (record.version !== HISTORY_VERSION || !record.id || !record.action || !record.createdAt || !record.encryptedSnapshot) {
        throw new Error('History record is malformed.');
      }
      rows.push(record);
    }
    return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async prune(beforeMs: number): Promise<number> {
    if (!Number.isSafeInteger(beforeMs) || beforeMs < 0) throw new Error('History prune time is invalid.');
    const records = await this.records();
    const paths = records.filter((record) => Date.parse(record.createdAt) < beforeMs).map((record) => `${record.id}.json`);
    if (paths.length === 0) return 0;
    await execFileAsync('git', ['-C', this.#directory, 'rm', '--quiet', '--', ...paths]);
    await execFileAsync('git', [
      '-C',
      this.#directory,
      '-c',
      'user.name=Material Designer local history',
      '-c',
      'user.email=local-history@invalid',
      'commit',
      '--quiet',
      '-m',
      'Prune local history',
    ]);
    return paths.length;
  }

  async restore(record: HistoryRecord): Promise<unknown> {
    if (record.version !== HISTORY_VERSION) throw new Error('History record version is unsupported.');
    const bytes = await this.#vault.unseal(Buffer.from(record.encryptedSnapshot, 'base64'));
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as { snapshot?: unknown };
    assertRedacted(parsed.snapshot);
    return parsed.snapshot;
  }

  get passwordDigestMetadata(): { saltBytes: number; digestBytes: number } {
    return { saltBytes: this.#salt.length, digestBytes: this.#digest.length };
  }
}

function derive(password: string, salt: Uint8Array): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, 32, { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error: Error | null, derived: Buffer) => {
      if (error) reject(error);
      else resolve(new Uint8Array(derived));
    });
  });
}

export function assertRedacted(value: unknown, depth = 0): void {
  if (depth > 12) throw new Error('History snapshot exceeds the nesting bound.');
  if (Array.isArray(value)) {
    for (const item of value) assertRedacted(item, depth + 1);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (/(password|passphrase|secret|pin|totp|token|code|credential)/iu.test(key)) {
      throw new Error('History snapshots cannot contain credential fields.');
    }
    assertRedacted(child, depth + 1);
  }
}

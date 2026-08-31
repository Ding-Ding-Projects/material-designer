import type { HistoryRecord, RedactedHistoryExport, SensitiveHistoryExport } from './contracts';

const HISTORY_VERSION = 1 as const;
const MAX_RECORDS = 10_000;
const MAX_SNAPSHOT_BYTES = 512 * 1024;

export interface AuthenticatorHistoryCipher {
  seal(value: Uint8Array): Promise<Uint8Array>;
  unseal(value: Uint8Array): Promise<Uint8Array>;
}

export interface AuthenticatorHistoryStorage {
  read(): Promise<StoredHistoryRecord[]>;
  append(record: StoredHistoryRecord): Promise<void>;
}

export type StoredHistoryRecord = HistoryRecord & {
  version: typeof HISTORY_VERSION;
  encryptedSnapshot: string;
};

export type SensitiveHistoryConfirmation = {
  readonly kind: 'super-confirmation';
  isValid(action: string): boolean;
};

function bytesToBase64(bytes: Uint8Array): string {
  let value = '';
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

/** Reject usable credential fields before the snapshot reaches any storage. */
export function assertRedactedSnapshot(value: unknown, depth = 0): void {
  if (depth > 12) throw new Error('History snapshot exceeds the nesting bound.');
  if (Array.isArray(value)) {
    for (const child of value) assertRedactedSnapshot(child, depth + 1);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (/(password|passphrase|secret|pin|totp|token|code|credential)/iu.test(key)) {
      throw new Error('History snapshots cannot contain credential fields.');
    }
    assertRedactedSnapshot(child, depth + 1);
  }
}

function cloneRecord(record: StoredHistoryRecord): StoredHistoryRecord {
  return { ...record };
}

export class AppendOnlyAuthenticatorHistory {
  readonly #storage: AuthenticatorHistoryStorage;
  readonly #cipher: AuthenticatorHistoryCipher;
  readonly #now: () => Date;
  readonly #id: () => string;

  constructor(options: {
    storage: AuthenticatorHistoryStorage;
    cipher: AuthenticatorHistoryCipher;
    now?: () => Date;
    id?: () => string;
  }) {
    this.#storage = options.storage;
    this.#cipher = options.cipher;
    this.#now = options.now ?? (() => new Date());
    this.#id = options.id ?? (() => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
  }

  async append(action: string, summary: string, snapshot: unknown): Promise<HistoryRecord> {
    if (!action || action.length > 128 || !summary || summary.length > 512) {
      throw new Error('History action or summary is outside the bounded size.');
    }
    assertRedactedSnapshot(snapshot);
    const plain = new TextEncoder().encode(JSON.stringify({ action, summary, snapshot }));
    if (plain.length > MAX_SNAPSHOT_BYTES) throw new Error('History snapshot exceeds the bounded size.');
    const encryptedSnapshot = await this.#cipher.seal(plain);
    const record: StoredHistoryRecord = {
      version: HISTORY_VERSION,
      id: this.#id(),
      action,
      createdAt: this.#now().toISOString(),
      summary,
      redacted: true,
      encryptedSnapshot: bytesToBase64(encryptedSnapshot),
    };
    await this.#storage.append(cloneRecord(record));
    return this.#publicRecord(record);
  }

  async records(): Promise<HistoryRecord[]> {
    const records = await this.#storage.read();
    if (!Array.isArray(records) || records.length > MAX_RECORDS) throw new Error('History record count exceeds the bounded limit.');
    return records.map((record) => this.#publicRecord(record)).sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async restore(recordId: string): Promise<unknown> {
    const stored = (await this.#storage.read()).find((record) => record.id === recordId);
    if (!stored || stored.version !== HISTORY_VERSION) throw new Error('History record is unavailable.');
    const bytes = await this.#cipher.unseal(base64ToBytes(stored.encryptedSnapshot));
    const decoded = JSON.parse(new TextDecoder().decode(bytes)) as { snapshot?: unknown };
    assertRedactedSnapshot(decoded.snapshot);
    return decoded.snapshot;
  }

  async exportRedacted(query = ''): Promise<RedactedHistoryExport> {
    const records = await this.records();
    const needle = query.trim().toLocaleLowerCase();
    return {
      version: 1,
      secretsOmitted: true,
      records: records.filter((record) => !needle || `${record.action} ${record.summary}`.toLocaleLowerCase().includes(needle)),
    };
  }

  async exportSensitive(query: string, confirmation: SensitiveHistoryConfirmation): Promise<SensitiveHistoryExport> {
    if (confirmation.kind !== 'super-confirmation' || !confirmation.isValid('export authenticator history secrets')) {
      throw new Error('Cleartext history export requires the in-app super confirmation.');
    }
    const records = await this.records();
    const needle = query.trim().toLocaleLowerCase();
    return {
      version: 1,
      warning: 'This export contains encrypted history records and may include usable authenticator secrets after decryption.',
      records: records.filter((record) => !needle || `${record.action} ${record.summary}`.toLocaleLowerCase().includes(needle)),
    };
  }

  #publicRecord(record: StoredHistoryRecord): HistoryRecord {
    return { id: record.id, action: record.action, createdAt: record.createdAt, summary: record.summary, redacted: true };
  }
}

/** Web Crypto adapter for a non-extractable AES-GCM key held outside settings. */
export class WebCryptoHistoryCipher implements AuthenticatorHistoryCipher {
  readonly #key: CryptoKey;
  constructor(key: CryptoKey) { this.#key = key; }
  async seal(value: Uint8Array): Promise<Uint8Array> {
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, this.#key, value as unknown as BufferSource);
    const output = new Uint8Array(iv.length + ciphertext.byteLength);
    output.set(iv);
    output.set(new Uint8Array(ciphertext), iv.length);
    return output;
  }
  async unseal(value: Uint8Array): Promise<Uint8Array> {
    if (value.length < 13) throw new Error('Encrypted history record is malformed.');
    try {
      return new Uint8Array(await globalThis.crypto.subtle.decrypt({ name: 'AES-GCM', iv: value.slice(0, 12) }, this.#key, value.slice(12) as unknown as BufferSource));
    } catch {
      throw new Error('Encrypted history record could not be opened.');
    }
  }
}

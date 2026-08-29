import { randomUUID } from 'node:crypto';

import { encodeBase32, type OtpParameters } from './protocol.js';

export const MAX_AUTHENTICATOR_ENTRIES = 1_000;
const MAX_ID_LENGTH = 128;
const MAX_LABEL_LENGTH = 256;

export type AuthenticatorEntry = {
  id: string;
  issuer: string;
  account: string;
  algorithm: OtpParameters['algorithm'];
  digits: OtpParameters['digits'];
  period: number;
  group: string | null;
  order: number;
};

export interface SecretVault {
  readonly kind: 'operating-system-vault';
  put(key: string, secret: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
}

export interface AuthenticatorMetadataStore {
  read(): Promise<AuthenticatorEntry[]>;
  write(entries: AuthenticatorEntry[]): Promise<void>;
}

export interface HistoryWriter {
  append(action: string, snapshot: unknown): Promise<void>;
}

export interface SuperConfirmation {
  readonly kind: 'super-confirmation';
  isValid(action: string): boolean;
}

export type AuthenticatorStoreOptions = {
  metadata: AuthenticatorMetadataStore;
  vault: SecretVault;
  history?: HistoryWriter;
  historyFailure?: (error: unknown) => void;
  id?: () => string;
};

function cloneEntry(entry: AuthenticatorEntry): AuthenticatorEntry {
  return { ...entry };
}

export function validateAuthenticatorEntries(entries: AuthenticatorEntry[]): AuthenticatorEntry[] {
  if (!Array.isArray(entries) || entries.length > MAX_AUTHENTICATOR_ENTRIES) {
    throw new Error('Authenticator metadata exceeds the bounded entry count.');
  }
  const seen = new Set<string>();
  return entries.map((entry, index) => {
    if (
      !entry ||
      typeof entry.id !== 'string' ||
      entry.id.length === 0 ||
      entry.id.length > MAX_ID_LENGTH ||
      seen.has(entry.id) ||
      typeof entry.issuer !== 'string' ||
      entry.issuer.length > MAX_LABEL_LENGTH ||
      typeof entry.account !== 'string' ||
      entry.account.length === 0 ||
      entry.account.length > MAX_LABEL_LENGTH ||
      !(['SHA-1', 'SHA-256', 'SHA-512'] as const).includes(entry.algorithm) ||
      !([6, 7, 8] as const).includes(entry.digits) ||
      !Number.isSafeInteger(entry.period) ||
      entry.period < 1 ||
      entry.period > 86_400 ||
      (entry.group !== null &&
        (typeof entry.group !== 'string' || entry.group.length > MAX_LABEL_LENGTH))
    ) {
      throw new Error('Authenticator metadata is invalid.');
    }
    seen.add(entry.id);
    return { ...entry, group: entry.group ?? null, order: index };
  });
}

export class AuthenticatorStore {
  #entries: AuthenticatorEntry[] = [];
  readonly #metadata: AuthenticatorMetadataStore;
  readonly #vault: SecretVault;
  readonly #history?: HistoryWriter;
  readonly #historyFailure?: (error: unknown) => void;
  readonly #id: () => string;

  private constructor(options: AuthenticatorStoreOptions) {
    this.#metadata = options.metadata;
    this.#vault = options.vault;
    this.#history = options.history;
    this.#historyFailure = options.historyFailure;
    this.#id = options.id ?? randomUUID;
  }

  static async open(options: AuthenticatorStoreOptions): Promise<AuthenticatorStore> {
    if (options.vault.kind !== 'operating-system-vault') {
      throw new Error('Authenticator secrets require the operating-system vault.');
    }
    const store = new AuthenticatorStore(options);
    store.#entries = validateAuthenticatorEntries(await options.metadata.read());
    return store;
  }

  list(query = ''): AuthenticatorEntry[] {
    if (query.length > 256) throw new Error('Authenticator search query exceeds the bounded length.');
    const needle = query.trim().toLocaleLowerCase();
    return this.#entries
      .filter((entry) =>
        !needle ||
        `${entry.issuer} ${entry.account} ${entry.group ?? ''}`.toLocaleLowerCase().includes(needle),
      )
      .slice()
      .sort((a, b) => a.order - b.order)
      .slice(0, MAX_AUTHENTICATOR_ENTRIES)
      .map(cloneEntry);
  }

  async add(parameters: OtpParameters, group: string | null = null): Promise<AuthenticatorEntry> {
    if (this.#entries.length >= MAX_AUTHENTICATOR_ENTRIES) {
      throw new Error('The authenticator entry limit has been reached.');
    }
    const id = this.#id();
    if (typeof id !== 'string' || id.length === 0 || id.length > MAX_ID_LENGTH) {
      throw new Error('Authenticator entry id is invalid.');
    }
    const entry: AuthenticatorEntry = {
      id,
      issuer: parameters.issuer,
      account: parameters.account,
      algorithm: parameters.algorithm,
      digits: parameters.digits,
      period: parameters.period,
      group,
      order: this.#entries.length,
    };
    const next = validateAuthenticatorEntries([...this.#entries, entry]);
    await this.#vault.put(`authenticator:${id}`, parameters.secret);
    const previous = this.#entries;
    this.#entries = next;
    try {
      await this.#persist('created', { entries: this.#entries });
      return cloneEntry(entry);
    } catch (error) {
      this.#entries = previous;
      try { await this.#metadata.write(previous.map(cloneEntry)); } catch { /* retain the primary failure */ }
      try { await this.#vault.delete(`authenticator:${id}`); } catch { /* retain the primary failure */ }
      throw error;
    }
  }

  async secret(id: string): Promise<Uint8Array> {
    const secret = await this.#vault.get(`authenticator:${id}`);
    if (!secret) throw new Error('The authenticator secret is unavailable in the operating-system vault.');
    return secret;
  }

  async restoreEntries(entries: AuthenticatorEntry[]): Promise<void> {
    const next = validateAuthenticatorEntries(entries);
    const previous = this.#entries;
    this.#entries = next;
    try {
      await this.#persist('restored', { entries: this.#entries });
    } catch (error) {
      this.#entries = previous;
      try { await this.#metadata.write(previous.map(cloneEntry)); } catch { /* retain the primary failure */ }
      throw error;
    }
  }

  async reorder(ids: readonly string[]): Promise<void> {
    const selected = new Set(ids);
    if (
      ids.length > MAX_AUTHENTICATOR_ENTRIES ||
      selected.size !== ids.length ||
      ids.some((id) => !this.#entries.some((entry) => entry.id === id))
    ) throw new Error('Reorder contains an unknown or duplicate entry.');
    const moved = ids.map((id) => this.#entries.find((entry) => entry.id === id)!);
    const rest = this.#entries.filter((entry) => !selected.has(entry.id));
    this.#entries = validateAuthenticatorEntries([...moved, ...rest]);
    await this.#persist('reordered', { entries: this.#entries });
  }

  async setGroup(ids: readonly string[], group: string | null): Promise<void> {
    const selected = new Set(ids);
    if (
      ids.length > MAX_AUTHENTICATOR_ENTRIES ||
      selected.size !== ids.length ||
      ids.some((id) => !this.#entries.some((entry) => entry.id === id)) ||
      (group !== null && (group.length > MAX_LABEL_LENGTH || group.trim().length === 0))
    ) throw new Error('Group action contains an unknown, duplicate, or invalid entry.');
    this.#entries = validateAuthenticatorEntries(
      this.#entries.map((entry) => (selected.has(entry.id) ? { ...entry, group } : entry)),
    );
    await this.#persist('group changed', { entries: this.#entries });
  }

  async remove(ids: readonly string[]): Promise<void> {
    const selected = new Set(ids);
    if (
      ids.length > MAX_AUTHENTICATOR_ENTRIES ||
      selected.size !== ids.length ||
      ids.some((id) => !this.#entries.some((entry) => entry.id === id))
    ) throw new Error('Remove contains an unknown or duplicate entry.');
    const previous = this.#entries;
    this.#entries = validateAuthenticatorEntries(this.#entries.filter((entry) => !selected.has(entry.id)));
    try {
      await this.#persist('deleted', { entries: this.#entries });
      for (const id of selected) await this.#vault.delete(`authenticator:${id}`);
    } catch (error) {
      this.#entries = previous;
      try { await this.#metadata.write(previous.map(cloneEntry)); } catch { /* retain the primary failure */ }
      throw error;
    }
  }

  exportPublic(): { version: 1; secretsOmitted: true; entries: AuthenticatorEntry[] } {
    return { version: 1, secretsOmitted: true, entries: this.list() };
  }

  async exportCleartext(
    ids: readonly string[],
    confirmation: SuperConfirmation,
  ): Promise<{ version: 1; warning: string; entries: Array<AuthenticatorEntry & { secret: string }> }> {
    if (
      confirmation.kind !== 'super-confirmation' ||
      !confirmation.isValid('export authenticator secrets')
    ) throw new Error('Cleartext authenticator export requires the in-app super confirmation.');
    const entries: Array<AuthenticatorEntry & { secret: string }> = [];
    for (const id of ids) {
      const entry = this.#entries.find((candidate) => candidate.id === id);
      if (!entry) throw new Error('Cleartext export contains an unknown entry.');
      entries.push({ ...entry, secret: encodeBase32(await this.secret(id)) });
    }
    return {
      version: 1,
      warning: 'This export contains usable authenticator secrets in cleartext.',
      entries,
    };
  }

  async #persist(action: string, snapshot: unknown): Promise<void> {
    await this.#metadata.write(this.#entries.map(cloneEntry));
    if (!this.#history) return;
    try {
      await this.#history.append(action, snapshot);
    } catch (error) {
      this.#historyFailure?.(error);
    }
  }
}

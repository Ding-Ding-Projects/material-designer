import { randomUUID } from "node:crypto";
import { encodeBase32, type OtpParameters } from "./protocol.js";

export type AuthenticatorEntry = {
  id: string;
  issuer: string;
  account: string;
  algorithm: OtpParameters["algorithm"];
  digits: OtpParameters["digits"];
  period: number;
  group: string | null;
  order: number;
};

export interface SecretVault {
  readonly kind: "operating-system-vault";
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
  readonly kind: "super-confirmation";
  isValid(action: string): boolean;
}

export type AuthenticatorStoreOptions = {
  metadata: AuthenticatorMetadataStore;
  vault: SecretVault;
  history?: HistoryWriter;
  historyFailure?: (error: unknown) => void;
  id?: () => string;
};

function cloneEntry(entry: AuthenticatorEntry): AuthenticatorEntry { return { ...entry }; }
function safeEntries(entries: AuthenticatorEntry[]): AuthenticatorEntry[] {
  const seen = new Set<string>();
  return entries.map((entry, index) => {
    if (!entry.id || entry.id.length > 128 || seen.has(entry.id) || !Number.isSafeInteger(entry.order) || entry.order < 0
      || typeof entry.issuer !== "string" || entry.issuer.length > 256 || typeof entry.account !== "string" || entry.account.length === 0 || entry.account.length > 256
      || !(["SHA-1", "SHA-256", "SHA-512"] as const).includes(entry.algorithm) || !([6, 7, 8] as const).includes(entry.digits)
      || !Number.isSafeInteger(entry.period) || entry.period < 1 || entry.period > 86_400 || (entry.group !== null && (typeof entry.group !== "string" || entry.group.length > 256))) throw new Error("Authenticator metadata is invalid.");
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

  private constructor(options: AuthenticatorStoreOptions) { this.#metadata = options.metadata; this.#vault = options.vault; this.#history = options.history; this.#historyFailure = options.historyFailure; this.#id = options.id ?? randomUUID; }

  static async open(options: AuthenticatorStoreOptions): Promise<AuthenticatorStore> {
    if (options.vault.kind !== "operating-system-vault") throw new Error("Authenticator secrets require the operating-system vault.");
    const store = new AuthenticatorStore(options); store.#entries = safeEntries(await options.metadata.read()); return store;
  }

  list(query = ""): AuthenticatorEntry[] {
    const needle = query.trim().toLocaleLowerCase();
    return this.#entries.filter((entry) => !needle || `${entry.issuer} ${entry.account} ${entry.group ?? ""}`.toLocaleLowerCase().includes(needle)).sort((a, b) => a.order - b.order).map(cloneEntry);
  }

  async add(parameters: OtpParameters, group: string | null = null): Promise<AuthenticatorEntry> {
    const id = this.#id();
    const entry: AuthenticatorEntry = { id, issuer: parameters.issuer, account: parameters.account, algorithm: parameters.algorithm, digits: parameters.digits, period: parameters.period, group, order: this.#entries.length };
    await this.#vault.put(`authenticator:${id}`, parameters.secret);
    this.#entries = [...this.#entries, entry]; await this.#persist("created", entry); return cloneEntry(entry);
  }

  async secret(id: string): Promise<Uint8Array> { const secret = await this.#vault.get(`authenticator:${id}`); if (!secret) throw new Error("The authenticator secret is unavailable in the operating-system vault."); return secret; }

  async reorder(ids: readonly string[]): Promise<void> {
    const selected = new Set(ids); if (selected.size !== ids.length || ids.some((id) => !this.#entries.some((entry) => entry.id === id))) throw new Error("Reorder contains an unknown or duplicate entry.");
    const moved = ids.map((id) => this.#entries.find((entry) => entry.id === id)!); const rest = this.#entries.filter((entry) => !selected.has(entry.id)); this.#entries = [...moved, ...rest].map((entry, order) => ({ ...entry, order })); await this.#persist("reordered", this.#entries);
  }

  async setGroup(ids: readonly string[], group: string | null): Promise<void> {
    const selected = new Set(ids); if (selected.size !== ids.length || ids.some((id) => !this.#entries.some((entry) => entry.id === id))) throw new Error("Group action contains an unknown or duplicate entry.");
    this.#entries = this.#entries.map((entry) => selected.has(entry.id) ? { ...entry, group } : entry); await this.#persist("group changed", { ids: [...ids], group });
  }

  async remove(ids: readonly string[]): Promise<void> {
    const selected = new Set(ids); if (selected.size !== ids.length || ids.some((id) => !this.#entries.some((entry) => entry.id === id))) throw new Error("Remove contains an unknown or duplicate entry.");
    for (const id of selected) await this.#vault.delete(`authenticator:${id}`);
    this.#entries = this.#entries.filter((entry) => !selected.has(entry.id)).map((entry, order) => ({ ...entry, order })); await this.#persist("deleted", { ids: [...ids] });
  }

  exportPublic(): { version: 1; secretsOmitted: true; entries: AuthenticatorEntry[] } { return { version: 1, secretsOmitted: true, entries: this.list() }; }

  async exportCleartext(ids: readonly string[], confirmation: SuperConfirmation): Promise<{ version: 1; warning: string; entries: Array<AuthenticatorEntry & { secret: string }> }> {
    if (confirmation.kind !== "super-confirmation" || !confirmation.isValid("export authenticator secrets")) throw new Error("Cleartext authenticator export requires the in-app super confirmation.");
    const entries = [] as Array<AuthenticatorEntry & { secret: string }>;
    for (const id of ids) { const entry = this.#entries.find((candidate) => candidate.id === id); if (!entry) throw new Error("Cleartext export contains an unknown entry."); const secret = await this.secret(id); entries.push({ ...entry, secret: encodeBase32(secret) }); }
    return { version: 1, warning: "This export contains usable authenticator secrets in cleartext.", entries };
  }

  async #persist(action: string, snapshot: unknown): Promise<void> { await this.#metadata.write(this.#entries.map(cloneEntry)); if (this.#history) { try { await this.#history.append(action, snapshot); } catch (error) { this.#historyFailure?.(error); } } }
}

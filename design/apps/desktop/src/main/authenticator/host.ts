import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import type {
  OpenDesignAuthenticatorEntry,
  OpenDesignAuthenticatorHistoryFilter,
  OpenDesignAuthenticatorHistoryRecord,
  OpenDesignAuthenticatorRegistration,
  OpenDesignAuthenticatorResult,
  OpenDesignAuthenticatorView,
  OpenDesignHostAuthenticator,
} from "@open-design/host";
import { AuthenticatorStore, type AuthenticatorMetadataStore } from "./store.js";
import { decodeBase32, parseOtpauthUri, totp } from "./protocol.js";
import { ElectronSecretVault, type SafeStorageAdapter } from "./electron-vault.js";

class JsonMetadata implements AuthenticatorMetadataStore {
  readonly #path: string;
  constructor(path: string) { this.#path = path; }
  async read() { try { return JSON.parse(await readFile(this.#path, "utf8")) as OpenDesignAuthenticatorEntry[]; } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; } }
  async write(entries: OpenDesignAuthenticatorEntry[]) { await mkdir(dirname(this.#path), { recursive: true }); const temp = `${this.#path}.${randomUUID()}.tmp`; await writeFile(temp, JSON.stringify(entries) + "\n", "utf8"); await rename(temp, this.#path); }
}

const unavailable = <T>(reason: string, code: Extract<OpenDesignAuthenticatorResult<never>, { ok: false }>["code"] = "unavailable"): OpenDesignAuthenticatorResult<T> => ({ ok: false, code, reason });
const success = <T>(value: T): OpenDesignAuthenticatorResult<T> => ({ ok: true, ...value });

export class DesktopAuthenticatorHost implements OpenDesignHostAuthenticator {
  readonly #vault: ElectronSecretVault;
  readonly #metadata: JsonMetadata;
  readonly #now: () => number;
  #store: Promise<AuthenticatorStore> | null = null;
  constructor(options: { directory: string; safeStorage: SafeStorageAdapter; now?: () => number }) { this.#vault = new ElectronSecretVault({ directory: `${options.directory}/vault`, safeStorage: options.safeStorage }); this.#metadata = new JsonMetadata(`${options.directory}/entries.json`); this.#now = options.now ?? Date.now; }
  vaultStatus(): Promise<{ available: boolean; reason?: string }> { return Promise.resolve(this.#vault.isAvailable() ? { available: true } : { available: false, reason: "The operating-system credential vault is unavailable." }); }
  async list(query?: string): Promise<OpenDesignAuthenticatorResult<{ entries: OpenDesignAuthenticatorEntry[] }>> { try { return success({ entries: (await this.store()).list(query) }); } catch { return unavailable("Authenticator metadata could not be read.", "persistence-failed"); } }
  async view(id: string, trustedNowMs?: number): Promise<OpenDesignAuthenticatorResult<{ entry: OpenDesignAuthenticatorView }>> { try { const entry = (await this.store()).list().find((candidate) => candidate.id === id); if (!entry) return unavailable("Authenticator entry was not found.", "not-found"); const secret = await (await this.store()).secret(id); const parameters = { secret, algorithm: entry.algorithm, digits: entry.digits, period: entry.period } as const; const now = this.#now(); return success({ entry: { ...entry, currentCode: groupCode(totp(parameters, now)), nextCode: groupCode(totp(parameters, (Math.floor(now / 1000 / entry.period) + 1) * entry.period * 1000)), secondsRemaining: entry.period - (Math.floor(now / 1000) % entry.period), clockWarning: trustedNowMs !== undefined && Math.abs(now - trustedNowMs) > 90_000 ? `Clock differs from the trusted reference by ${Math.round((now - trustedNowMs) / 1000)} seconds.` : null } }); } catch { return unavailable("Authenticator entry could not be read from the operating-system vault.", "vault-unavailable"); } }
  async register(input: OpenDesignAuthenticatorRegistration): Promise<OpenDesignAuthenticatorResult<{ entry: OpenDesignAuthenticatorEntry }>> { if (!this.#vault.isAvailable()) return unavailable("The operating-system credential vault is unavailable.", "vault-unavailable"); if (!input || typeof input !== "object" || typeof input.kind !== "string") return unavailable("Authenticator registration input is invalid.", "invalid-input"); try { const parameters = input.kind === "manual" ? { issuer: input.issuer, account: input.account, secret: decodeBase32(input.secretBase32), algorithm: input.algorithm ?? "SHA-1", digits: input.digits ?? 6, period: input.period ?? 30 } : input.kind === "otpauth-uri" ? parseOtpauthUri(input.value) : null; if (!parameters) return unavailable("QR image, clipboard, and camera decoding are unavailable until a bounded local decoder is connected."); const current = totp(parameters, this.#now()); if (input.confirmationCode !== current) return unavailable("Registration requires one current authenticator code before the entry is armed.", "confirmation-required"); return success({ entry: await (await this.store()).add(parameters) }); } catch (error) { return unavailable(error instanceof Error ? error.message : "Authenticator registration failed.", "invalid-input"); } }
  async reorder(ids: readonly string[]): Promise<OpenDesignAuthenticatorResult> { try { await (await this.store()).reorder(ids); return success({}); } catch { return unavailable("Authenticator order could not be saved.", "persistence-failed"); } }
  async setGroup(ids: readonly string[], group: string | null): Promise<OpenDesignAuthenticatorResult> { try { await (await this.store()).setGroup(ids, group); return success({}); } catch { return unavailable("Authenticator groups could not be saved.", "persistence-failed"); } }
  async remove(ids: readonly string[]): Promise<OpenDesignAuthenticatorResult> { try { await (await this.store()).remove(ids); return success({}); } catch { return unavailable("Authenticator entries could not be removed.", "persistence-failed"); } }
  historyList(_filter?: OpenDesignAuthenticatorHistoryFilter): Promise<OpenDesignAuthenticatorResult<{ records: OpenDesignAuthenticatorHistoryRecord[] }>> { return Promise.resolve(unavailable("History manager authentication is required.", "history-locked")); }
  historyDiff(_id: string): Promise<OpenDesignAuthenticatorResult<{ diff: string }>> { return Promise.resolve(unavailable("History manager authentication is required.", "history-locked")); }
  historyRestore(_id: string): Promise<OpenDesignAuthenticatorResult> { return Promise.resolve(unavailable("History manager authentication is required.", "history-locked")); }
  historySetRetention(_retention: "keep-all" | "30-days" | "90-days"): Promise<OpenDesignAuthenticatorResult> { return Promise.resolve(unavailable("History manager authentication is required.", "history-locked")); }
  historyExportRedacted(_filter?: OpenDesignAuthenticatorHistoryFilter): Promise<OpenDesignAuthenticatorResult<{ content: string }>> { return Promise.resolve(unavailable("History manager authentication is required.", "history-locked")); }
  historyExportSensitive(_filter: OpenDesignAuthenticatorHistoryFilter | undefined, _confirmationToken: string): Promise<OpenDesignAuthenticatorResult<{ content: string }>> { return Promise.resolve(unavailable("Sensitive history export requires the real in-app super confirmation.", "super-confirmation-required")); }
  #storeReady(): Promise<AuthenticatorStore> { return this.#store ??= AuthenticatorStore.open({ metadata: this.#metadata, vault: this.#vault }); }
  private store(): Promise<AuthenticatorStore> { return this.#storeReady(); }
}

function groupCode(value: string): string { return value.match(/.{1,3}/g)?.join(" ") ?? value; }

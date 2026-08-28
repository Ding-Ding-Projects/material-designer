import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { join } from "node:path";
import type { HistoryWriter } from "./store.js";

const execFileAsync = promisify(execFile);
const HISTORY_VERSION = 1 as const;
const MAX_SNAPSHOT_BYTES = 512 * 1024;

export interface HistoryKeyVault { seal(value: Uint8Array): Promise<Uint8Array>; unseal(value: Uint8Array): Promise<Uint8Array>; }

export type HistoryRecord = { version: typeof HISTORY_VERSION; id: string; action: string; createdAt: string; encryptedSnapshot: string };

export class LocalGitHistory implements HistoryWriter {
  readonly #directory: string;
  readonly #vault: HistoryKeyVault;
  readonly #now: () => Date;
  constructor(options: { directory: string; vault: HistoryKeyVault; now?: () => Date }) { this.#directory = options.directory; this.#vault = options.vault; this.#now = options.now ?? (() => new Date()); }
  async init(): Promise<void> { await mkdir(this.#directory, { recursive: true }); try { await execFileAsync("git", ["-C", this.#directory, "rev-parse", "--git-dir"]); } catch { await execFileAsync("git", ["-C", this.#directory, "init", "--quiet"]); } }
  async append(action: string, snapshot: unknown): Promise<void> {
    await this.init(); assertRedacted(snapshot); const createdAt = this.#now().toISOString(); const plain = new TextEncoder().encode(JSON.stringify({ action, snapshot, createdAt })); if (plain.length > MAX_SNAPSHOT_BYTES) throw new Error("History snapshot exceeds the bounded size.");
    const sealed = await this.#vault.seal(plain); const record: HistoryRecord = { version: HISTORY_VERSION, id: createHash("sha256").update(sealed).digest("hex").slice(0, 24), action, createdAt, encryptedSnapshot: Buffer.from(sealed).toString("base64") };
    const path = join(this.#directory, `${record.id}.json`); await writeFile(path, JSON.stringify(record) + "\n", { encoding: "utf8", flag: "wx" }); await execFileAsync("git", ["-C", this.#directory, "add", "--", `${record.id}.json"]); await execFileAsync("git", ["-C", this.#directory, "-c", "user.name=Material Designer local history", "-c", "user.email=local-history@invalid", "commit", "--quiet", "-m", `Record ${action}`]);
  }
}

export class PasswordProtectedHistory {
  readonly #directory: string; readonly #vault: HistoryKeyVault; readonly #salt: Uint8Array; readonly #digest: Uint8Array;
  private constructor(directory: string, vault: HistoryKeyVault, salt: Uint8Array, digest: Uint8Array) { this.#directory = directory; this.#vault = vault; this.#salt = salt; this.#digest = digest; }
  static async create(directory: string, vault: HistoryKeyVault, password: string): Promise<PasswordProtectedHistory> { if (!password) throw new Error("History password is empty."); const salt = randomBytes(16); const digest = await derive(password, salt); const instance = new PasswordProtectedHistory(directory, vault, salt, digest); await mkdir(directory, { recursive: true }); await writeFile(join(directory, "history-access.json"), JSON.stringify({ version: 1, salt: Buffer.from(salt).toString("base64"), digest: Buffer.from(digest).toString("base64") }) + "\n", { flag: "wx" }); return instance; }
  static async open(directory: string, vault: HistoryKeyVault, password: string): Promise<PasswordProtectedHistory> { const document = JSON.parse(await readFile(join(directory, "history-access.json"), "utf8")) as { version: number; salt: string; digest: string }; if (document.version !== 1) throw new Error("History access metadata is unsupported."); const salt = Buffer.from(document.salt, "base64"); const expected = Buffer.from(document.digest, "base64"); if (salt.length !== 16 || expected.length !== 32) throw new Error("History access metadata is malformed."); const actual = await derive(password, salt); if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error("History password did not match."); return new PasswordProtectedHistory(directory, vault, salt, expected); }
  async records(): Promise<HistoryRecord[]> { const { stdout } = await execFileAsync("git", ["-C", this.#directory, "ls-files", "--", "*.json"]); const paths = stdout.split(/\r?\n/).filter((path) => path && path !== "history-access.json"); const rows: HistoryRecord[] = []; for (const path of paths) rows.push(JSON.parse(await readFile(join(this.#directory, path), "utf8")) as HistoryRecord); return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt)); }
  async restore(record: HistoryRecord): Promise<unknown> { if (record.version !== HISTORY_VERSION) throw new Error("History record version is unsupported."); return JSON.parse(new TextDecoder().decode(await this.#vault.unseal(Buffer.from(record.encryptedSnapshot, "base64")))).snapshot; }
  get passwordDigestMetadata(): { saltBytes: number; digestBytes: number } { return { saltBytes: this.#salt.length, digestBytes: this.#digest.length }; }
}

function derive(password: string, salt: Uint8Array): Promise<Uint8Array> { return new Promise((resolve, reject) => scryptCallback(password, salt, 32, { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, derived) => error ? reject(error) : resolve(new Uint8Array(derived)))); }

function assertRedacted(value: unknown, depth = 0): void {
  if (depth > 12) throw new Error("History snapshot exceeds the nesting bound.");
  if (Array.isArray(value)) { for (const item of value) assertRedacted(item, depth + 1); return; }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) { if (/(password|passphrase|secret|pin|totp|token|code)/i.test(key)) throw new Error("History snapshots cannot contain credential fields."); assertRedacted(child, depth + 1); }
}

import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { mkdir, readFile, open, stat } from "node:fs/promises";
import { join } from "node:path";
import { atomicWrite, snapshotDestination } from "./host.js";
import { WindowsNativeConverterWriter } from "./windows-writer.js";

export type ConverterNotification = {
  id: string;
  severity: "info" | "success" | "progress" | "warning" | "error";
  title: string;
  body: string;
  createdAt: number;
  readAt?: number;
  dismissedAt?: number;
};

export type ConverterHistoryEvent = {
  id: string;
  action: "created" | "updated" | "deleted" | "restored" | "imported" | "settings-changed" | "conversion";
  summary: string;
  createdAt: number;
  revision?: string;
};

export type ConverterPage<T> = { items: readonly T[]; nextCursor?: string };

const execFileAsync = promisify(execFile);
const MAX_TEXT = 2048;
const MAX_PAGE_SIZE = 200;
const MAX_ORDER_LINE_BYTES = 1024;

export type ConverterNotificationInput = Pick<ConverterNotification, "severity" | "title" | "body">;
export type ConverterHistoryInput = Pick<ConverterHistoryEvent, "action" | "summary">;

export type AuditResult<T> = { ok: true; value: T } | { ok: false; reason: string };

function boundedText(value: string, fallback: string): string {
  const clean = value.replace(/\0/g, " ").trim();
  return clean.length > 0 ? clean.slice(0, MAX_TEXT) : fallback;
}

function parseCursor(cursor: string | undefined): number {
  if (cursor == null || cursor === "") return 0;
  const value = Number.parseInt(cursor, 10);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("The converter audit cursor is invalid.");
  return value;
}

function boundedPageSize(pageSize: number | undefined): number {
  const value = pageSize ?? 50;
  if (!Number.isFinite(value)) throw new Error("The converter audit page size is invalid.");
  return Math.max(1, Math.min(MAX_PAGE_SIZE, Math.floor(value)));
}

async function writeJsonSnapshot(path: string, value: unknown, windowsWriterResourceRoot?: string): Promise<void> {
  const bytes = new TextEncoder().encode(`${JSON.stringify(value)}\n`);
  const inspected = process.platform === "win32"
    ? await new WindowsNativeConverterWriter(windowsWriterResourceRoot).inspectDestination(path)
    : undefined;
  const current = inspected?.snapshot ?? await snapshotDestination(path);
  await atomicWrite(path, bytes, {
    ...(current.exists ? { replace: true, expected: current } : {}),
    ...(inspected ? { expectedParentIdentity: inspected.parentIdentity } : {}),
    windowsWriterResourceRoot,
  });
}

async function readJsonSnapshot<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function appendAndFlush(path: string, text: string): Promise<void> {
  const handle = await open(path, "a", 0o600);
  try {
    const bytes = Buffer.from(text, "utf8");
    let offset = 0;
    while (offset < bytes.length) {
      const result = await handle.write(bytes.subarray(offset), undefined);
      if (!Number.isSafeInteger(result.bytesWritten) || result.bytesWritten <= 0) throw new Error("The converter audit journal write made no progress.");
      offset += result.bytesWritten;
    }
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function frameOrderId(id: string): string {
  return JSON.stringify({ id, checksum: createHash("sha256").update(id, "utf8").digest("hex") });
}

function parseOrderId(raw: unknown): string {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("The converter audit index contains invalid state.");
  const value = raw as { id?: unknown; checksum?: unknown };
  if (typeof value.id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value.id)) throw new Error("The converter audit index contains an incomplete id.");
  if (value.checksum !== undefined) {
    if (typeof value.checksum !== "string" || value.checksum !== createHash("sha256").update(value.id, "utf8").digest("hex")) throw new Error("The converter audit index checksum is invalid.");
  }
  return value.id;
}

async function* readLinesWithTail(path: string): AsyncGenerator<{ line: string; terminated: boolean }> {
  const input = (await import("node:fs")).createReadStream(path, { encoding: "utf8" });
  let pending = "";
  for await (const chunk of input) {
    pending += String(chunk);
    let newline = pending.indexOf("\n");
    while (newline >= 0) {
      const line = pending.slice(0, newline).replace(/\r$/, "");
      if (Buffer.byteLength(line, "utf8") > MAX_ORDER_LINE_BYTES) {
        throw new Error("The converter audit index record exceeds its read bound.");
      }
      yield { line, terminated: true };
      pending = pending.slice(newline + 1);
      newline = pending.indexOf("\n");
    }
    if (Buffer.byteLength(pending, "utf8") > MAX_ORDER_LINE_BYTES) {
      throw new Error("The converter audit index record exceeds its read bound.");
    }
  }
  if (pending.length > 0) yield { line: pending.replace(/\r$/, ""), terminated: false };
}

function normalizeNotification(raw: unknown): ConverterNotification {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("The converter notification record is invalid.");
  const value = raw as Record<string, unknown>;
  const severity = value.severity;
  if (severity !== "info" && severity !== "success" && severity !== "progress" && severity !== "warning" && severity !== "error") throw new Error("The converter notification severity is invalid.");
  if (typeof value.id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value.id) || typeof value.title !== "string" || typeof value.body !== "string" || typeof value.createdAt !== "number" || !Number.isFinite(value.createdAt)) throw new Error("The converter notification record is incomplete.");
  return {
    id: value.id,
    severity: severity as ConverterNotification["severity"],
    title: value.title.slice(0, MAX_TEXT),
    body: value.body.slice(0, MAX_TEXT),
    createdAt: value.createdAt as number,
    ...(typeof value.readAt === "number" ? { readAt: value.readAt } : {}),
    ...(typeof value.dismissedAt === "number" ? { dismissedAt: value.dismissedAt } : {}),
  };
}

function normalizeHistory(raw: unknown): ConverterHistoryEvent {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("The converter history record is invalid.");
  const value = raw as Record<string, unknown>;
  const action = value.action;
  if (action !== "created" && action !== "updated" && action !== "deleted" && action !== "restored" && action !== "imported" && action !== "settings-changed" && action !== "conversion" || typeof value.id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value.id) || typeof value.summary !== "string" || typeof value.createdAt !== "number" || !Number.isFinite(value.createdAt)) throw new Error("The converter history record is incomplete.");
  return {
    id: value.id,
    action: action as ConverterHistoryEvent["action"],
    summary: value.summary.slice(0, MAX_TEXT),
    createdAt: value.createdAt as number,
    ...(typeof value.revision === "string" && /^[0-9a-f]{40}$/.test(value.revision) ? { revision: value.revision } : {}),
  };
}

/**
 * Host-owned notification and local history persistence for converter actions.
 * Notifications use per-entry snapshots plus an append-only order file, so
 * listing one page never loads all dismissed notifications. History uses the
 * same layout and records one redacted event in an isolated local Git store.
 */
export class ConverterAuditStore {
  readonly #notificationsRoot: string;
  readonly #notificationItems: string;
  readonly #notificationOrder: string;
  readonly #historyRoot: string;
  readonly #historyItems: string;
  readonly #historyOrder: string;
  readonly #gitRoot: string;
  readonly #windowsWriterResourceRoot?: string;
  #writeChain: Promise<void> = Promise.resolve();

  constructor(root: string, options: { windowsWriterResourceRoot?: string } = {}) {
    this.#notificationsRoot = join(root, "notifications");
    this.#notificationItems = join(this.#notificationsRoot, "items");
    this.#notificationOrder = join(this.#notificationsRoot, "order.jsonl");
    this.#historyRoot = join(root, "history");
    this.#gitRoot = join(this.#historyRoot, "git");
    this.#historyItems = join(this.#gitRoot, "items");
    this.#historyOrder = join(this.#gitRoot, "order.jsonl");
    this.#windowsWriterResourceRoot = options.windowsWriterResourceRoot;
  }

  async #ensureDirectories(): Promise<void> {
    await Promise.all([
      mkdir(this.#notificationItems, { recursive: true }),
      mkdir(this.#historyItems, { recursive: true }),
      mkdir(this.#gitRoot, { recursive: true }),
    ]);
  }

  #notificationPath(id: string): string {
    return join(this.#notificationItems, `${id}.json`);
  }

  #historyPath(id: string): string {
    return join(this.#historyItems, `${id}.json`);
  }

  async notify(input: ConverterNotificationInput, now = Date.now()): Promise<AuditResult<ConverterNotification>> {
    const value: ConverterNotification = {
      id: randomUUID(),
      severity: input.severity,
      title: boundedText(input.title, "Converter notification"),
      body: boundedText(input.body, "No additional details were provided."),
      createdAt: now,
    };
    try {
      const operation = this.#writeChain.then(async () => {
        await this.#ensureDirectories();
        await writeJsonSnapshot(this.#notificationPath(value.id), value, this.#windowsWriterResourceRoot);
        await appendAndFlush(this.#notificationOrder, `${frameOrderId(value.id)}\n`);
      });
      this.#writeChain = operation.catch(() => undefined);
      await operation;
      return { ok: true, value };
    } catch {
      return { ok: false, reason: "The converter notification could not be persisted." };
    }
  }

  async #notificationPage(cursor: string | undefined, pageSize: number | undefined): Promise<ConverterPage<ConverterNotification>> {
    await this.#ensureDirectories();
    const start = parseCursor(cursor);
    const limit = boundedPageSize(pageSize);
    const items: ConverterNotification[] = [];
    let position = 0;
    const source = await stat(this.#notificationOrder).then(() => this.#notificationOrder).catch(() => undefined);
    if (!source) return { items };
    for await (const record of readLinesWithTail(source)) {
      const line = record.line;
      if (!line.trim()) continue;
      if (position < start) {
        position += 1;
        continue;
      }
      let orderId: string;
      try { orderId = parseOrderId(JSON.parse(line)); } catch (error) {
        if (!record.terminated) break;
        throw error;
      }
      const item = normalizeNotification(await readJsonSnapshot<ConverterNotification>(this.#notificationPath(orderId)));
      items.push(item);
      position += 1;
      if (items.length >= limit) break;
    }
    return { items, nextCursor: items.length >= limit ? String(position) : undefined };
  }

  async notificationsPage(cursor?: string, pageSize?: number): Promise<AuditResult<ConverterPage<ConverterNotification>>> {
    try {
      return { ok: true, value: await this.#notificationPage(cursor, pageSize) };
    } catch {
      return { ok: false, reason: "The converter notification centre could not be read." };
    }
  }

  async #updateNotifications(ids: readonly string[] | undefined, field: "readAt" | "dismissedAt"): Promise<AuditResult<void>> {
    const selected = ids == null ? undefined : new Set(ids.filter((id) => typeof id === "string" && id.length > 0));
    try {
      let cursor: string | undefined;
      do {
        const page = await this.#notificationPage(cursor, MAX_PAGE_SIZE);
        const targets = selected == null ? page.items : page.items.filter((item) => selected.has(item.id));
        if (targets.length > 0) {
          const operation = this.#writeChain.then(async () => {
            await this.#ensureDirectories();
            const now = Date.now();
            for (const item of targets) await writeJsonSnapshot(this.#notificationPath(item.id), { ...item, [field]: now }, this.#windowsWriterResourceRoot);
          });
          this.#writeChain = operation.catch(() => undefined);
          await operation;
        }
        cursor = page.nextCursor;
      } while (cursor);
      return { ok: true, value: undefined };
    } catch {
      return { ok: false, reason: "The converter notification state could not be updated." };
    }
  }

  markRead(ids?: readonly string[]): Promise<AuditResult<void>> {
    return this.#updateNotifications(ids, "readAt");
  }

  dismiss(ids?: readonly string[]): Promise<AuditResult<void>> {
    return this.#updateNotifications(ids, "dismissedAt");
  }

  async #historyPage(cursor: string | undefined, pageSize: number | undefined): Promise<ConverterPage<ConverterHistoryEvent>> {
    await this.#ensureDirectories();
    const start = parseCursor(cursor);
    const limit = boundedPageSize(pageSize);
    const items: ConverterHistoryEvent[] = [];
    let position = 0;
    const source = await stat(this.#historyOrder).then(() => this.#historyOrder).catch(() => undefined);
    if (!source) return { items };
    for await (const record of readLinesWithTail(source)) {
      const line = record.line;
      if (!line.trim()) continue;
      if (position < start) {
        position += 1;
        continue;
      }
      let orderId: string;
      try { orderId = parseOrderId(JSON.parse(line)); } catch (error) {
        if (!record.terminated) break;
        throw error;
      }
      items.push(normalizeHistory(await readJsonSnapshot<ConverterHistoryEvent>(this.#historyPath(orderId))));
      position += 1;
      if (items.length >= limit) break;
    }
    return { items, nextCursor: items.length >= limit ? String(position) : undefined };
  }

  async historyPage(cursor?: string, pageSize?: number): Promise<AuditResult<ConverterPage<ConverterHistoryEvent>>> {
    try {
      return { ok: true, value: await this.#historyPage(cursor, pageSize) };
    } catch {
      return { ok: false, reason: "The converter local history could not be read." };
    }
  }

  async #ensureGit(): Promise<void> {
    await mkdir(this.#gitRoot, { recursive: true });
    const env = {
      ...process.env,
      GIT_AUTHOR_NAME: "Claude Fable 5",
      GIT_AUTHOR_EMAIL: "noreply@anthropic.com",
      GIT_COMMITTER_NAME: "Claude Fable 5",
      GIT_COMMITTER_EMAIL: "noreply@anthropic.com",
    };
    await execFileAsync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: this.#gitRoot, env, windowsHide: true, timeout: 10_000 }).catch(async () => {
      await execFileAsync("git", ["init", "--quiet"], { cwd: this.#gitRoot, env, windowsHide: true, timeout: 10_000 });
    });
  }

  async #commitHistoryState(env: NodeJS.ProcessEnv): Promise<string> {
    await execFileAsync("git", ["add", "--", "items", "order.jsonl"], { cwd: this.#gitRoot, env, windowsHide: true, timeout: 10_000 });
    await execFileAsync("git", ["commit", "--quiet", "--no-verify", "-m", "Record converter history event", "-m", "The converter writes one redacted event at a time, so its private history can tell the story without keeping secret bytes.\n\n記低 converter 事件，一次一筆，歷史有記性但唔會偷藏秘密。\n\nCo-Authored-By: Claude Fable 5 <noreply@anthropic.com>"], { cwd: this.#gitRoot, env, windowsHide: true, timeout: 10_000 });
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: this.#gitRoot, env, windowsHide: true, timeout: 10_000 });
    return stdout.trim();
  }

  async recordMutation(input: ConverterHistoryInput, now = Date.now()): Promise<AuditResult<ConverterHistoryEvent>> {
    const value: ConverterHistoryEvent = {
      id: randomUUID(),
      action: input.action,
      summary: boundedText(input.summary, "Converter state changed."),
      createdAt: now,
    };
    try {
      const operation = this.#writeChain.then(async () => {
        await this.#ensureDirectories();
        await this.#ensureGit();
        await writeJsonSnapshot(this.#historyPath(value.id), value, this.#windowsWriterResourceRoot);
        await appendAndFlush(this.#historyOrder, `${frameOrderId(value.id)}\n`);
        const env = {
          ...process.env,
          GIT_AUTHOR_NAME: "Claude Fable 5",
          GIT_AUTHOR_EMAIL: "noreply@anthropic.com",
          GIT_COMMITTER_NAME: "Claude Fable 5",
          GIT_COMMITTER_EMAIL: "noreply@anthropic.com",
        };
        const revision = await this.#commitHistoryState(env);
        value.revision = revision;
        const followUp: ConverterHistoryEvent = {
          id: randomUUID(),
          action: "updated",
          summary: "Recorded the local Git revision for the converter mutation.",
          createdAt: now,
          revision,
        };
        await writeJsonSnapshot(this.#historyPath(followUp.id), followUp, this.#windowsWriterResourceRoot);
        await appendAndFlush(this.#historyOrder, `${frameOrderId(followUp.id)}\n`);
        await this.#commitHistoryState(env);
      });
      this.#writeChain = operation.catch(() => undefined);
      await operation;
      return { ok: true, value };
    } catch {
      return { ok: false, reason: "The converter history could not be recorded; the requested operation may continue without a history revision." };
    }
  }
}

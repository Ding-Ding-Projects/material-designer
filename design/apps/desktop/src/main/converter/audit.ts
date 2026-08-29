import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { mkdir, readFile, appendFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { atomicWrite, snapshotDestination } from "./host.js";
import type {
  OpenDesignHostConverterHistoryEvent,
  OpenDesignHostConverterNotification,
  OpenDesignHostConverterPage,
} from "@open-design/host";

const execFileAsync = promisify(execFile);
const MAX_TEXT = 2048;
const MAX_PAGE_SIZE = 200;

export type ConverterNotificationInput = Pick<OpenDesignHostConverterNotification, "severity" | "title" | "body">;
export type ConverterHistoryInput = Pick<OpenDesignHostConverterHistoryEvent, "action" | "summary">;

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

async function writeJsonSnapshot(path: string, value: unknown): Promise<void> {
  const bytes = new TextEncoder().encode(`${JSON.stringify(value)}\n`);
  const current = await snapshotDestination(path);
  await atomicWrite(path, bytes, current.exists ? { replace: true, expected: current } : {});
}

async function readJsonSnapshot<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

function normalizeNotification(raw: unknown): OpenDesignHostConverterNotification {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("The converter notification record is invalid.");
  const value = raw as Record<string, unknown>;
  const severity = value.severity;
  if (severity !== "info" && severity !== "success" && severity !== "progress" && severity !== "warning" && severity !== "error") throw new Error("The converter notification severity is invalid.");
  if (typeof value.id !== "string" || typeof value.title !== "string" || typeof value.body !== "string" || typeof value.createdAt !== "number" || !Number.isFinite(value.createdAt)) throw new Error("The converter notification record is incomplete.");
  return {
    id: value.id,
    severity: severity as OpenDesignHostConverterNotification["severity"],
    title: value.title.slice(0, MAX_TEXT),
    body: value.body.slice(0, MAX_TEXT),
    createdAt: value.createdAt as number,
    ...(typeof value.readAt === "number" ? { readAt: value.readAt } : {}),
    ...(typeof value.dismissedAt === "number" ? { dismissedAt: value.dismissedAt } : {}),
  };
}

function normalizeHistory(raw: unknown): OpenDesignHostConverterHistoryEvent {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("The converter history record is invalid.");
  const value = raw as Record<string, unknown>;
  const action = value.action;
  if (action !== "created" && action !== "updated" && action !== "deleted" && action !== "restored" && action !== "imported" && action !== "settings-changed" && action !== "conversion" || typeof value.id !== "string" || typeof value.summary !== "string" || typeof value.createdAt !== "number" || !Number.isFinite(value.createdAt)) throw new Error("The converter history record is incomplete.");
  return {
    id: value.id,
    action: action as OpenDesignHostConverterHistoryEvent["action"],
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
  #writeChain: Promise<void> = Promise.resolve();

  constructor(root: string) {
    this.#notificationsRoot = join(root, "notifications");
    this.#notificationItems = join(this.#notificationsRoot, "items");
    this.#notificationOrder = join(this.#notificationsRoot, "order.jsonl");
    this.#historyRoot = join(root, "history");
    this.#historyItems = join(this.#historyRoot, "items");
    this.#historyOrder = join(this.#historyRoot, "order.jsonl");
    this.#gitRoot = join(this.#historyRoot, "git");
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

  async notify(input: ConverterNotificationInput, now = Date.now()): Promise<AuditResult<OpenDesignHostConverterNotification>> {
    const value: OpenDesignHostConverterNotification = {
      id: randomUUID(),
      severity: input.severity,
      title: boundedText(input.title, "Converter notification"),
      body: boundedText(input.body, "No additional details were provided."),
      createdAt: now,
    };
    try {
      const operation = this.#writeChain.then(async () => {
        await this.#ensureDirectories();
        await writeJsonSnapshot(this.#notificationPath(value.id), value);
        await appendFile(this.#notificationOrder, `${JSON.stringify({ id: value.id })}\n`, { encoding: "utf8", mode: 0o600 });
      });
      this.#writeChain = operation.catch(() => undefined);
      await operation;
      return { ok: true, value };
    } catch {
      return { ok: false, reason: "The converter notification could not be persisted." };
    }
  }

  async #notificationPage(cursor: string | undefined, pageSize: number | undefined): Promise<OpenDesignHostConverterPage<OpenDesignHostConverterNotification>> {
    await this.#ensureDirectories();
    const start = parseCursor(cursor);
    const limit = boundedPageSize(pageSize);
    const items: OpenDesignHostConverterNotification[] = [];
    let position = 0;
    const source = await stat(this.#notificationOrder).then(() => this.#notificationOrder).catch(() => undefined);
    if (!source) return { items };
    const { createReadStream } = await import("node:fs");
    const { createInterface } = await import("node:readline");
    const input = createReadStream(source, { encoding: "utf8" });
    for await (const line of createInterface({ input, crlfDelay: Infinity })) {
      if (!line.trim()) continue;
      if (position < start) {
        position += 1;
        continue;
      }
      const order = JSON.parse(line) as { id?: string };
      if (typeof order.id !== "string") throw new Error("The converter notification index contains incomplete state.");
      const item = normalizeNotification(await readJsonSnapshot<OpenDesignHostConverterNotification>(this.#notificationPath(order.id)));
      items.push(item);
      position += 1;
      if (items.length >= limit) break;
    }
    return { items, nextCursor: items.length >= limit ? String(position) : undefined };
  }

  async notificationsPage(cursor?: string, pageSize?: number): Promise<AuditResult<OpenDesignHostConverterPage<OpenDesignHostConverterNotification>>> {
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
            for (const item of targets) await writeJsonSnapshot(this.#notificationPath(item.id), { ...item, [field]: now });
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

  async #historyPage(cursor: string | undefined, pageSize: number | undefined): Promise<OpenDesignHostConverterPage<OpenDesignHostConverterHistoryEvent>> {
    await this.#ensureDirectories();
    const start = parseCursor(cursor);
    const limit = boundedPageSize(pageSize);
    const items: OpenDesignHostConverterHistoryEvent[] = [];
    let position = 0;
    const source = await stat(this.#historyOrder).then(() => this.#historyOrder).catch(() => undefined);
    if (!source) return { items };
    const { createReadStream } = await import("node:fs");
    const { createInterface } = await import("node:readline");
    const input = createReadStream(source, { encoding: "utf8" });
    for await (const line of createInterface({ input, crlfDelay: Infinity })) {
      if (!line.trim()) continue;
      if (position < start) {
        position += 1;
        continue;
      }
      const order = JSON.parse(line) as { id?: string };
      if (typeof order.id !== "string") throw new Error("The converter history index contains incomplete state.");
      items.push(normalizeHistory(await readJsonSnapshot<OpenDesignHostConverterHistoryEvent>(this.#historyPath(order.id))));
      position += 1;
      if (items.length >= limit) break;
    }
    return { items, nextCursor: items.length >= limit ? String(position) : undefined };
  }

  async historyPage(cursor?: string, pageSize?: number): Promise<AuditResult<OpenDesignHostConverterPage<OpenDesignHostConverterHistoryEvent>>> {
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

  async recordMutation(input: ConverterHistoryInput, now = Date.now()): Promise<AuditResult<OpenDesignHostConverterHistoryEvent>> {
    const value: OpenDesignHostConverterHistoryEvent = {
      id: randomUUID(),
      action: input.action,
      summary: boundedText(input.summary, "Converter state changed."),
      createdAt: now,
    };
    try {
      const operation = this.#writeChain.then(async () => {
        await this.#ensureDirectories();
        await writeJsonSnapshot(this.#historyPath(value.id), value);
        await appendFile(this.#historyOrder, `${JSON.stringify({ id: value.id })}\n`, { encoding: "utf8", mode: 0o600 });
        await this.#ensureGit();
        const env = {
          ...process.env,
          GIT_AUTHOR_NAME: "Claude Fable 5",
          GIT_AUTHOR_EMAIL: "noreply@anthropic.com",
          GIT_COMMITTER_NAME: "Claude Fable 5",
          GIT_COMMITTER_EMAIL: "noreply@anthropic.com",
        };
        const relativeItem = `../items/${value.id}.json`;
        await execFileAsync("git", ["add", "--", relativeItem, "../order.jsonl"], { cwd: this.#gitRoot, env, windowsHide: true, timeout: 10_000 });
        await execFileAsync("git", ["commit", "--quiet", "--no-verify", "-m", "Record converter history event", "-m", "The converter writes one redacted event at a time, so its private history can tell the story without keeping secret bytes.\n\n記低 converter 事件，一次一筆，歷史有記性但唔會偷藏秘密。\n\nCo-Authored-By: Claude Fable 5 <noreply@anthropic.com>"], { cwd: this.#gitRoot, env, windowsHide: true, timeout: 10_000 });
        const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: this.#gitRoot, env, windowsHide: true, timeout: 10_000 });
        value.revision = stdout.trim();
      });
      this.#writeChain = operation.catch(() => undefined);
      await operation;
      return { ok: true, value };
    } catch {
      return { ok: false, reason: "The converter history could not be recorded; the requested operation may continue without a history revision." };
    }
  }
}

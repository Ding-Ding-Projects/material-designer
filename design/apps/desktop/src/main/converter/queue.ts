import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  mkdir,
  link,
  open,
  readFile,
  rename,
  rm,
  stat as statFile,
  unlink,
} from "node:fs/promises";
import { createInterface } from "node:readline";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { withPromotionLock } from "./host.js";
import { assertHandleRelativeWriteSupport, assertNoReparsePath, openStableDirectory, sameIdentity, snapshotForStats, snapshotStableChild, stableChildPath } from "./path-safety.js";
import type { ConversionOutcome, QueueItem, QueuePage } from "./types.js";
import { WindowsNativeConverterWriter } from "./windows-writer.js";

const INDEX_SCHEMA_VERSION = 1 as const;
const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 1000;
const ORDER_CHUNK_ITEMS = 256;
const MAX_LEGACY_BYTES = 32 * 1024 * 1024;
const MAX_LEGACY_RECORD_BYTES = 2 * 1024 * 1024;
const MAX_QUEUE_RECORD_BYTES = 64 * 1024;
const MAX_QUEUE_ID_LENGTH = 128;
const MAX_QUEUE_PATH_LENGTH = 32 * 1024;
const MAX_QUEUE_FORMAT_LENGTH = 128;
const MAX_QUEUE_REASON_LENGTH = 4096;
const MAX_CURSOR_LENGTH = 64;
const MAX_ORDER_LINE_BYTES = 1024;
const PROGRESS_PERSIST_INTERVAL_MS = 100;
const TRANSIENT_RENAME_CODES = new Set(["EPERM", "EACCES", "EBUSY"]);
const QUEUE_STATES = new Set<QueueItem["state"]>([
  "queued",
  "running",
  "paused",
  "converted",
  "skipped",
  "cancelled",
  "failed",
]);

export interface QueueStore {
  loadPage(cursor?: string, pageSize?: number): Promise<QueuePage>;
  save(item: QueueItem): Promise<void>;
}

export class MemoryQueueStore implements QueueStore {
  readonly #items = new Map<string, QueueItem>();

  async loadPage(cursor?: string, pageSize = DEFAULT_PAGE_SIZE): Promise<QueuePage> {
    // The in-memory implementation is only a test double. The durable store
    // below is the production path and never materializes the complete queue.
    const values = [...this.#items.values()].sort((a, b) => a.id.localeCompare(b.id));
    const offset = parseOffsetCursor(cursor);
    if (offset > values.length) throw new Error("The converter queue cursor is beyond the indexed records.");
    const items = values.slice(offset, offset + boundedPageSize(pageSize));
    return {
      items,
      nextCursor:
        offset + items.length < values.length ? String(offset + items.length) : undefined,
    };
  }

  async save(item: QueueItem): Promise<void> {
    this.#items.set(item.id, { ...item });
  }
}

type QueueIndexMeta = {
  schemaVersion: typeof INDEX_SCHEMA_VERSION;
  nextSequence: number;
  totalItems: number;
  journalSize: number;
};

type QueueOrderEntry = { id: string; sequence: number };

function itemFileName(id: string): string {
  return `${createHash("sha256").update(id, "utf8").digest("hex")}.json`;
}

function parseOffsetCursor(cursor: string | undefined): number {
  if (cursor == null || cursor === "") return 0;
  if (cursor.length > MAX_CURSOR_LENGTH || !/^\d+$/.test(cursor)) throw new Error("The converter queue cursor is invalid.");
  const value = Number.parseInt(cursor, 10);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("The converter queue cursor is invalid.");
  return value;
}

function boundedPageSize(pageSize: number): number {
  if (!Number.isFinite(pageSize) || !Number.isSafeInteger(pageSize) || pageSize < 1) throw new Error("The converter queue page size is invalid.");
  return Math.min(MAX_PAGE_SIZE, pageSize);
}

function parseIndexedCursor(cursor: string | undefined): { chunk: number; offset: number } {
  if (cursor == null || cursor === "") return { chunk: 0, offset: 0 };
  if (cursor.length > MAX_CURSOR_LENGTH) throw new Error("The converter queue cursor is invalid.");
  const match = /^(\d+):(\d+)$/.exec(cursor);
  if (!match) throw new Error("The converter queue cursor is invalid.");
  const chunk = Number.parseInt(match[1]!, 10);
  const offset = Number.parseInt(match[2]!, 10);
  if (!Number.isSafeInteger(chunk) || !Number.isSafeInteger(offset) || chunk < 0 || offset < 0) {
    throw new Error("The converter queue cursor is invalid.");
  }
  if (offset >= ORDER_CHUNK_ITEMS) throw new Error("The converter queue cursor offset is invalid.");
  return { chunk, offset };
}

function normalizeQueueItem(raw: unknown, lineNumber?: number): QueueItem {
  const suffix = lineNumber == null ? "" : ` at record ${lineNumber}`;
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`The durable converter queue contains invalid state${suffix}.`);
  }
  const value = raw as Record<string, unknown>;
  if (
    typeof value.id !== "string" ||
    value.id.length === 0 ||
    typeof value.sourcePath !== "string" ||
    typeof value.destinationPath !== "string" ||
    typeof value.targetFormat !== "string"
  ) {
    throw new Error(`The durable converter queue contains incomplete state${suffix}.`);
  }
  if (
    value.id.length > MAX_QUEUE_ID_LENGTH ||
    value.sourcePath.length > MAX_QUEUE_PATH_LENGTH ||
    value.destinationPath.length > MAX_QUEUE_PATH_LENGTH ||
    value.targetFormat.length === 0 ||
    value.targetFormat.length > MAX_QUEUE_FORMAT_LENGTH
  ) {
    throw new Error(`The durable converter queue contains overlong fields${suffix}.`);
  }
  const state = typeof value.state === "string" ? value.state : "failed";
  if (!QUEUE_STATES.has(state as QueueItem["state"])) {
    throw new Error(`The durable converter queue contains an unknown state${suffix}.`);
  }
  const bytesProcessed = typeof value.bytesProcessed === "number" ? value.bytesProcessed : 0;
  const updatedAt = typeof value.updatedAt === "number" ? value.updatedAt : Date.now();
  if (!Number.isSafeInteger(bytesProcessed) || bytesProcessed < 0 || !Number.isFinite(updatedAt) || updatedAt < 0) {
    throw new Error(`The durable converter queue contains invalid progress${suffix}.`);
  }
  const optionalNumber = (key: string): number | undefined => {
    const candidate = value[key];
    return typeof candidate === "number" && Number.isFinite(candidate) && candidate >= 0
      ? candidate
      : undefined;
  };
  const totalBytes = optionalNumber("totalBytes");
  const bytesPerSecond = optionalNumber("bytesPerSecond");
  const etaSeconds = optionalNumber("etaSeconds");
  if (totalBytes !== undefined && bytesProcessed > totalBytes) throw new Error(`The durable converter queue contains progress beyond its total${suffix}.`);
  const reason = value.reason;
  if (reason !== undefined && (typeof reason !== "string" || reason.length > MAX_QUEUE_REASON_LENGTH)) {
    throw new Error(`The durable converter queue contains an overlong reason${suffix}.`);
  }
  return {
    id: value.id,
    adapterId:
      typeof value.adapterId === "string" && value.adapterId.length > 0
        ? value.adapterId
        : "text-structured-local",
    sourcePath: value.sourcePath,
    destinationPath: value.destinationPath,
    targetFormat: value.targetFormat,
    state: state as QueueItem["state"],
    bytesProcessed,
    ...(totalBytes === undefined ? {} : { totalBytes }),
    ...(bytesPerSecond === undefined ? {} : { bytesPerSecond }),
    ...(etaSeconds === undefined ? {} : { etaSeconds }),
    updatedAt,
    ...(typeof reason === "string" && reason.length > 0 ? { reason } : {}),
  };
}

async function readUtf8Bounded(path: string, maxBytes: number): Promise<string> {
  const info = await statFile(path);
  if (!info.isFile() || !Number.isSafeInteger(info.size) || info.size > maxBytes) {
    throw new Error("The durable converter queue record exceeds its read bound.");
  }
  const bytes = await readFile(path);
  if (bytes.length > maxBytes) throw new Error("The durable converter queue record exceeds its read bound.");
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

async function renameWithRetry(source: string, destination: string): Promise<void> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      await rename(source, destination);
      return;
    } catch (error) {
      const code =
        typeof error === "object" && error != null && "code" in error && typeof error.code === "string"
          ? error.code
          : "";
      if (!TRANSIENT_RENAME_CODES.has(code) || attempt === 5) throw error;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 25 * (attempt + 1)));
    }
  }
}

async function renameReplacing(source: string, destination: string): Promise<void> {
  try {
    await renameWithRetry(source, destination);
    return;
  } catch (firstError) {
    const existing = await statFile(destination).catch(() => undefined);
    if (!existing) throw firstError;
    const backup = `${destination}.${process.pid}.${randomUUID()}.backup`;
    await renameWithRetry(destination, backup);
    try {
      await renameWithRetry(source, destination);
      await unlink(backup).catch(() => undefined);
    } catch (replacementError) {
      await unlink(destination).catch(() => undefined);
      await renameWithRetry(backup, destination).catch(() => undefined);
      throw replacementError;
    }
  }
}

async function appendAndFlush(path: string, text: string): Promise<void> {
  const handle = await open(path, "a", 0o600);
  try {
    await writeAll(handle, text);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function writeAll(handle: { write(data: Uint8Array, position?: number | null): Promise<{ bytesWritten: number }> }, text: string): Promise<void> {
  const bytes = Buffer.from(text, "utf8");
  let offset = 0;
  while (offset < bytes.length) {
    const result = await handle.write(bytes.subarray(offset), undefined);
    if (!Number.isSafeInteger(result.bytesWritten) || result.bytesWritten <= 0) throw new Error("The converter queue write made no progress.");
    offset += result.bytesWritten;
  }
}

function frameJournalItem(item: QueueItem): string {
  const serialized = JSON.stringify(item);
  const checksum = createHash("sha256").update(serialized, "utf8").digest("hex");
  return JSON.stringify({ item, checksum });
}

function parseJournalItem(raw: unknown, lineNumber: number): QueueItem {
  if (raw && typeof raw === "object" && !Array.isArray(raw) && "item" in raw && "checksum" in raw) {
    const frame = raw as { item?: unknown; checksum?: unknown };
    if (typeof frame.checksum !== "string" || !/^[0-9a-f]{64}$/i.test(frame.checksum) || frame.item == null) throw new Error(`The durable converter queue contains an invalid checksum frame at record ${lineNumber}.`);
    const serialized = JSON.stringify(frame.item);
    const expected = createHash("sha256").update(serialized, "utf8").digest("hex");
    if (expected !== frame.checksum.toLowerCase()) throw new Error(`The durable converter queue checksum is invalid at record ${lineNumber}.`);
    return normalizeQueueItem(frame.item, lineNumber);
  }
  return normalizeQueueItem(raw, lineNumber);
}

async function* readLinesWithTail(path: string, maxBytes: number): AsyncGenerator<{ line: string; terminated: boolean }> {
  const input = createReadStream(path, { encoding: "utf8" });
  let pending = "";
  for await (const chunk of input) {
    pending += String(chunk);
    if (Buffer.byteLength(pending, "utf8") > maxBytes) throw new Error("The durable converter queue record exceeds its read bound.");
    let newline = pending.indexOf("\n");
    while (newline >= 0) {
      yield { line: pending.slice(0, newline).replace(/\r$/, ""), terminated: true };
      pending = pending.slice(newline + 1);
      newline = pending.indexOf("\n");
    }
  }
  if (pending.length > 0) yield { line: pending.replace(/\r$/, ""), terminated: false };
}

async function writeAndFlushNewFile(path: string, text: string, mode = 0o600): Promise<void> {
  const handle = await open(path, "wx", mode);
  try {
    await writeAll(handle, text);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

/**
 * Durable queue records. Payload bytes never enter this store, only bounded
 * metadata and paths. The journal is retained for recovery, while the order
 * chunks and per-item snapshots form a small on-disk index. A page reads one
 * order chunk and one snapshot per returned item, so queue length does not
 * change the memory required for a page.
 */
export class FileQueueStore implements QueueStore {
  readonly #path: string;
  readonly #legacyPath?: string;
  readonly #indexRoot: string;
  readonly #itemsRoot: string;
  readonly #orderRoot: string;
  readonly #metaPath: string;
  #writeChain: Promise<void> = Promise.resolve();
  #indexReady: Promise<void> | null = null;
  readonly #afterJournal?: () => Promise<void>;

  constructor(path: string, legacyPath?: string, options: { afterJournal?: () => Promise<void> } = {}) {
    this.#path = path;
    this.#legacyPath = legacyPath;
    this.#indexRoot = `${path}.index`;
    this.#itemsRoot = join(this.#indexRoot, "items");
    this.#orderRoot = join(this.#indexRoot, "order");
    this.#metaPath = join(this.#indexRoot, "meta.json");
    this.#afterJournal = options.afterJournal;
  }

  #itemPath(id: string): string {
    return join(this.#itemsRoot, itemFileName(id));
  }

  #orderPath(chunk: number): string {
    return join(this.#orderRoot, `${String(chunk).padStart(12, "0")}.jsonl`);
  }

  async #readMeta(): Promise<QueueIndexMeta | null> {
    try {
      const parsed = JSON.parse(await readUtf8Bounded(this.#metaPath, 1024)) as Partial<QueueIndexMeta>;
      const nextSequence = parsed.nextSequence;
      const totalItems = parsed.totalItems;
      const journalSize = parsed.journalSize;
      if (
        parsed.schemaVersion !== INDEX_SCHEMA_VERSION ||
        typeof nextSequence !== "number" ||
        !Number.isSafeInteger(nextSequence) ||
        nextSequence < 0 ||
        typeof totalItems !== "number" ||
        !Number.isSafeInteger(totalItems) ||
        totalItems < 0 ||
        totalItems !== nextSequence ||
        typeof journalSize !== "number" ||
        !Number.isSafeInteger(journalSize) ||
        journalSize < 0
      ) return null;
      return { schemaVersion: INDEX_SCHEMA_VERSION, nextSequence, totalItems, journalSize };
    } catch {
      return null;
    }
  }

  async #writeMeta(meta: QueueIndexMeta): Promise<void> {
    const temporary = `${this.#metaPath}.${process.pid}.${randomUUID()}.tmp`;
    const serialized = `${JSON.stringify(meta)}\n`;
    if (Buffer.byteLength(serialized, "utf8") > 1024) throw new Error("The converter queue index metadata exceeds its bound.");
    await writeAndFlushNewFile(temporary, serialized);
    try {
      await renameReplacing(temporary, this.#metaPath);
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
  }

  async #writeSnapshot(item: QueueItem): Promise<void> {
    const path = this.#itemPath(item.id);
    const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
    const serialized = `${JSON.stringify(item)}\n`;
    if (Buffer.byteLength(serialized, "utf8") > MAX_QUEUE_RECORD_BYTES) throw new Error("The converter queue record exceeds its write bound.");
    await writeAndFlushNewFile(temporary, serialized);
    try {
      await renameReplacing(temporary, path);
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
  }

  async #appendOrder(entry: QueueOrderEntry): Promise<void> {
    const chunk = Math.floor(entry.sequence / ORDER_CHUNK_ITEMS);
    const serialized = `${JSON.stringify(entry)}\n`;
    if (Buffer.byteLength(serialized, "utf8") > MAX_ORDER_LINE_BYTES) throw new Error("The converter queue index record exceeds its write bound.");
    await appendAndFlush(this.#orderPath(chunk), serialized);
  }

  async #existingItem(id: string): Promise<boolean> {
    return statFile(this.#itemPath(id)).then((info: { isFile(): boolean }) => info.isFile()).catch(() => false);
  }

  async #readSourcePath(): Promise<string | undefined> {
    const current = await statFile(this.#path).catch(() => undefined);
    if (current && current.size > 0) return this.#path;
    if (this.#legacyPath && await statFile(this.#legacyPath).then(() => true).catch(() => false)) return this.#legacyPath;
    return current ? this.#path : undefined;
  }

  async *#migrateLegacyArray(sourcePath: string): AsyncGenerator<QueueItem> {
    const info = await statFile(sourcePath);
    if (info.size > MAX_LEGACY_BYTES) throw new Error("The legacy converter queue exceeds the migration bound.");
    const input = createReadStream(sourcePath, { encoding: "utf8" });
    let started = false;
    let finished = false;
    let objectDepth = 0;
    let inString = false;
    let escaped = false;
    let currentObject = "";
    for await (const chunk of input) {
      const text = String(chunk);
      for (let index = 0; index < text.length; index += 1) {
        const char = text[index]!;
        if (!started) {
          if (/\s/.test(char)) continue;
          if (char !== "[") throw new Error("The legacy converter queue is not an array.");
          started = true;
          continue;
        }
        if (finished) {
          if (!/\s/.test(char)) throw new Error("The legacy converter queue contains trailing data.");
          continue;
        }
        if (objectDepth === 0) {
          if (/\s|,/.test(char)) continue;
          if (char === "]") { finished = true; continue; }
          if (char !== "{") throw new Error("The legacy converter queue contains a non-object record.");
          currentObject = char;
          objectDepth = 1;
          inString = false;
          escaped = false;
          continue;
        }
        currentObject += char;
        if (currentObject.length > MAX_LEGACY_RECORD_BYTES) throw new Error("A legacy converter queue record exceeds the migration bound.");
        if (inString) {
          if (escaped) escaped = false;
          else if (char === "\\") escaped = true;
          else if (char === '"') inString = false;
          continue;
        }
        if (char === '"') { inString = true; continue; }
        if (char === "{") objectDepth += 1;
        else if (char === "}") {
          objectDepth -= 1;
          if (objectDepth === 0) {
            yield normalizeQueueItem(JSON.parse(currentObject));
            currentObject = "";
          }
        }
      }
    }
    if (!started || !finished || objectDepth !== 0 || inString) throw new Error("The legacy converter queue is incomplete.");
  }

  async #firstCharacter(sourcePath: string): Promise<string> {
    const input = createReadStream(sourcePath, { encoding: "utf8", highWaterMark: 64 });
    try {
      for await (const chunk of input) {
        const text = String(chunk);
        const first = text.trimStart().slice(0, 1);
        if (first) return first;
      }
      return "";
    } finally {
      input.destroy();
    }
  }

  async #buildIndex(): Promise<void> {
    const currentMeta = await this.#readMeta();
    const journal = await statFile(this.#path).catch(() => undefined);
    if (currentMeta && (journal?.size ?? 0) === currentMeta.journalSize) return;

    // A crash before the completion marker leaves partial generated index
    // files. Rebuild that generated index from the append-only journal, never
    // from half-written snapshots, while retaining the canonical journal.
    await rm(this.#indexRoot, { recursive: true, force: true });
    await mkdir(this.#itemsRoot, { recursive: true });
    await mkdir(this.#orderRoot, { recursive: true });

    const sourcePath = await this.#readSourcePath();
    let sequence = 0;
    let totalItems = 0;
    const addItem = async (item: QueueItem): Promise<void> => {
      const existed = await this.#existingItem(item.id);
      if (!existed) {
        await this.#appendOrder({ id: item.id, sequence });
        sequence += 1;
        totalItems += 1;
      }
      await this.#writeSnapshot(item);
    };

    if (sourcePath) {
      const firstBytes = await this.#firstCharacter(sourcePath);
      if (firstBytes === "[") {
        for await (const item of this.#migrateLegacyArray(sourcePath)) await addItem(item);
      } else {
        let lineNumber = 0;
        for await (const record of readLinesWithTail(sourcePath, MAX_QUEUE_RECORD_BYTES)) {
          lineNumber += 1;
          const line = record.line;
          if (!line.trim()) continue;
          let parsed: unknown;
          try {
            parsed = JSON.parse(line);
          } catch {
            if (!record.terminated) break;
            throw new Error(`The durable converter queue contains malformed state at record ${lineNumber}.`);
          }
          if (Array.isArray(parsed)) {
            for (const item of parsed) await addItem(normalizeQueueItem(item, lineNumber));
          } else {
            await addItem(parseJournalItem(parsed, lineNumber));
          }
        }
      }
    }
    const journalSize = (await statFile(this.#path).catch(() => ({ size: 0 }))).size;
    await this.#writeMeta({ schemaVersion: INDEX_SCHEMA_VERSION, nextSequence: sequence, totalItems, journalSize });
  }

  async #ensureIndex(): Promise<void> {
    if (this.#indexReady == null) this.#indexReady = this.#buildIndex();
    try {
      await this.#indexReady;
    } catch (error) {
      this.#indexReady = null;
      throw error;
    }
  }

  async #readIndexedPage(cursor: string | undefined, pageSize: number): Promise<QueuePage> {
    const meta = await this.#readMeta();
    if (!meta) throw new Error("The converter queue index is unavailable or corrupt.");
    const parsed = parseIndexedCursor(cursor);
    const pageLimit = boundedPageSize(pageSize);
    const absolute = parsed.chunk * ORDER_CHUNK_ITEMS + parsed.offset;
    if (absolute > meta.nextSequence) throw new Error("The converter queue cursor is beyond the indexed records.");
    if (absolute === meta.nextSequence) return { items: [] };

    const items: QueueItem[] = [];
    let nextChunk = parsed.chunk;
    let nextOffset = parsed.offset;
    while (items.length < pageLimit && nextChunk * ORDER_CHUNK_ITEMS + nextOffset < meta.nextSequence) {
      const orderPath = this.#orderPath(nextChunk);
      let opened = false;
      try {
        const input = createReadStream(orderPath, { encoding: "utf8" });
        opened = true;
        let lineNumber = 0;
        for await (const line of createInterface({ input, crlfDelay: Infinity })) {
          if (Buffer.byteLength(line, "utf8") > MAX_ORDER_LINE_BYTES) throw new Error(`The converter queue index contains an overlong order record at chunk ${nextChunk}.`);
          if (lineNumber < nextOffset) {
            lineNumber += 1;
            continue;
          }
          if (!line.trim()) {
            lineNumber += 1;
            continue;
          }
          let entry: QueueOrderEntry;
          try {
            entry = JSON.parse(line) as QueueOrderEntry;
          } catch {
            throw new Error(`The converter queue index contains malformed order state at chunk ${nextChunk}.`);
          }
          if (typeof entry.id !== "string" || entry.id.length === 0 || entry.id.length > MAX_QUEUE_ID_LENGTH || !Number.isSafeInteger(entry.sequence) || entry.sequence < 0 || entry.sequence !== nextChunk * ORDER_CHUNK_ITEMS + lineNumber) {
            throw new Error(`The converter queue index contains incomplete order state at chunk ${nextChunk}.`);
          }
          const snapshot = normalizeQueueItem(JSON.parse(await readUtf8Bounded(this.#itemPath(entry.id), MAX_QUEUE_RECORD_BYTES)));
          items.push(snapshot);
          lineNumber += 1;
          nextOffset = lineNumber;
          if (items.length >= pageLimit) break;
        }
      } catch (error) {
        if (opened || (error instanceof Error && !error.message.includes("ENOENT"))) throw error;
      }
      if (items.length >= pageLimit) break;
      nextChunk += 1;
      nextOffset = 0;
    }
    const hasMore = nextChunk * ORDER_CHUNK_ITEMS + nextOffset < meta.nextSequence;
    return { items, nextCursor: hasMore ? `${nextChunk}:${nextOffset}` : undefined };
  }

  async loadPage(cursor?: string, pageSize = DEFAULT_PAGE_SIZE): Promise<QueuePage> {
    await this.#ensureIndex();
    return this.#readIndexedPage(cursor, pageSize);
  }

  async save(item: QueueItem): Promise<void> {
    const normalized = normalizeQueueItem(item);
    const operation = this.#writeChain.then(async () => {
      await this.#ensureIndex();
      const existed = await this.#existingItem(normalized.id);
      await mkdir(dirname(this.#path), { recursive: true });
      await appendAndFlush(this.#path, `${frameJournalItem(normalized)}\n`);
      await this.#afterJournal?.();
      await this.#writeSnapshot(normalized);
      if (!existed) {
        const meta = await this.#readMeta();
        if (!meta) throw new Error("The converter queue index is unavailable or corrupt.");
        await this.#appendOrder({ id: normalized.id, sequence: meta.nextSequence });
        await this.#writeMeta({
          schemaVersion: INDEX_SCHEMA_VERSION,
          nextSequence: meta.nextSequence + 1,
          totalItems: meta.totalItems + 1,
          journalSize: (await statFile(this.#path)).size,
        });
      } else {
        const meta = await this.#readMeta();
        if (!meta) throw new Error("The converter queue index is unavailable or corrupt.");
        await this.#writeMeta({ ...meta, journalSize: (await statFile(this.#path)).size });
      }
    });
    this.#writeChain = operation.catch(() => undefined);
    await operation;
  }

  /**
   * Rewrites only the latest snapshot of each item into the journal, one line
   * at a time. It never builds a second array containing the queue and uses a
   * unique temporary file plus bounded rename retries.
   */
  async compact(): Promise<void> {
    const operation = this.#writeChain.then(async () => {
      await this.#ensureIndex();
      const meta = await this.#readMeta();
      if (!meta) throw new Error("The converter queue index is unavailable or corrupt.");
      await mkdir(dirname(this.#path), { recursive: true });
      const temporary = `${this.#path}.${process.pid}.${randomUUID()}.compact.tmp`;
      await writeAndFlushNewFile(temporary, "");
      try {
        const output = await open(temporary, "a");
        try {
          for (let chunk = 0; chunk * ORDER_CHUNK_ITEMS < meta.nextSequence; chunk += 1) {
            const input = createReadStream(this.#orderPath(chunk), { encoding: "utf8" });
            let lineNumber = 0;
            for await (const line of createInterface({ input, crlfDelay: Infinity })) {
              if (Buffer.byteLength(line, "utf8") > MAX_ORDER_LINE_BYTES) throw new Error(`The converter queue index contains an overlong order record at chunk ${chunk}.`);
              if (!line.trim()) continue;
              const entry = JSON.parse(line) as QueueOrderEntry;
              if (typeof entry.id !== "string" || entry.id.length === 0 || entry.id.length > MAX_QUEUE_ID_LENGTH || !Number.isSafeInteger(entry.sequence) || entry.sequence !== chunk * ORDER_CHUNK_ITEMS + lineNumber) throw new Error(`The converter queue index contains incomplete order state at chunk ${chunk}.`);
              const item = normalizeQueueItem(JSON.parse(await readUtf8Bounded(this.#itemPath(entry.id), MAX_QUEUE_RECORD_BYTES)));
              await writeAll(output, `${frameJournalItem(item)}\n`);
              lineNumber += 1;
            }
          }
          await output.sync();
        } finally { await output.close(); }
        await renameReplacing(temporary, this.#path);
        const refreshed = await this.#readMeta();
        if (refreshed) await this.#writeMeta({ ...refreshed, journalSize: (await statFile(this.#path)).size });
      } finally {
        await unlink(temporary).catch(() => undefined);
      }
    });
    this.#writeChain = operation.catch(() => undefined);
    await operation;
  }
}

export interface QueueProgress {
  bytesProcessed: number;
  totalBytes?: number;
  bytesPerSecond?: number;
  etaSeconds?: number;
}

export interface QueueExportOptions {
  maxItems?: number;
  maxBytes?: number;
}

export interface QueueExportResult {
  items: number;
  bytes: number;
  destination: string;
}

export interface QueueExportRuntimeOptions {
  /** Focused adversarial hook, never exposed through the renderer bridge. */
  windowsAfterOpen?: () => Promise<void>;
  /** Host-only packaged resource root. Never supplied by the renderer. */
  windowsWriterResourceRoot?: string;
  signal?: AbortSignal;
}

async function* queueExportChunks(
  store: QueueStore,
  maxItems: number,
  maxBytes: number,
  progress: { bytes: number; items: number },
): AsyncGenerator<Uint8Array> {
  const header = Buffer.from('{"schemaVersion":1,"encoding":"UTF-8","lineEndings":"LF","scope":"complete-queue"}\n', "utf8");
  progress.bytes += header.byteLength;
  yield header;
  let cursor: string | undefined;
  const seenCursors = new Set<string>();
  for (;;) {
    if (cursor !== undefined) {
      if (seenCursors.has(cursor)) throw new Error("The queue export encountered a repeated cursor.");
      seenCursors.add(cursor);
    }
    const page = await store.loadPage(cursor, 256);
    for (const item of page.items) {
      progress.items += 1;
      const line = Buffer.from(`${JSON.stringify(item)}\n`, "utf8");
      progress.bytes += line.byteLength;
      if (progress.items > maxItems || progress.bytes > maxBytes) throw new Error("The queue export exceeded its bounded record or byte limit.");
      yield line;
    }
    if (page.nextCursor === undefined) break;
    cursor = page.nextCursor;
  }
}

/** Streams the complete queue to a user-approved, new JSONL destination. */
export async function exportQueueToFile(
  store: QueueStore,
  destinationPath: string,
  options: QueueExportOptions = {},
  runtime: QueueExportRuntimeOptions = {},
): Promise<QueueExportResult> {
  if (!isAbsolute(destinationPath) || destinationPath.includes("\0")) throw new Error("Queue export destinations must be absolute local paths.");
  const destination = resolve(destinationPath);
  assertHandleRelativeWriteSupport();
  await assertNoReparsePath(destination);
  const maxItems = options.maxItems ?? 1_000_000;
  const maxBytes = options.maxBytes ?? 512 * 1024 * 1024;
  if (!Number.isSafeInteger(maxItems) || maxItems < 1 || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 512 * 1024 * 1024) throw new Error("Queue export limits are invalid.");
  if (process.platform === "win32") {
    const progress = { bytes: 0, items: 0 };
    const writer = new WindowsNativeConverterWriter(runtime.windowsWriterResourceRoot);
    await writer.writeAtomic(destination, queueExportChunks(store, maxItems, maxBytes, progress), {
      afterOpen: runtime.windowsAfterOpen,
      maxBytes,
      signal: runtime.signal,
    });
    return { items: progress.items, bytes: progress.bytes, destination };
  }
  let result: QueueExportResult | undefined;
  const parent = await openStableDirectory(dirname(destination));
  try {
    await withPromotionLock(destination, async () => {
      const destinationName = basename(destination);
      const relativeDestination = stableChildPath(parent, destinationName);
      if ((await snapshotStableChild(parent, destinationName)).exists) throw new Error("The selected queue export destination already exists.");
      const temporary = stableChildPath(parent, `.converter-${randomUUID()}.export.tmp`);
      const output = await open(temporary, "wx", 0o600);
      let items = 0;
      let bytes = 0;
      let cursor: string | undefined;
      const seenCursors = new Set<string>();
      let promoted = false;
      try {
        const header = '{"schemaVersion":1,"encoding":"UTF-8","lineEndings":"LF","scope":"complete-queue"}\n';
        await writeAll(output, header);
        bytes += Buffer.byteLength(header, "utf8");
        for (;;) {
          if (cursor !== undefined) {
            if (seenCursors.has(cursor)) throw new Error("The queue export encountered a repeated cursor.");
            seenCursors.add(cursor);
          }
          const page = await store.loadPage(cursor, 256);
          for (const item of page.items) {
            items += 1;
            const line = `${JSON.stringify(item)}\n`;
            bytes += Buffer.byteLength(line, "utf8");
            if (items > maxItems || bytes > maxBytes) throw new Error("The queue export exceeded its bounded record or byte limit.");
            await writeAll(output, line);
          }
          if (page.nextCursor === undefined) break;
          cursor = page.nextCursor;
        }
        await output.sync();
        result = { items, bytes, destination };
        await output.close();
        if (!sameIdentity(parent.snapshot, snapshotForStats(await parent.handle.stat()))) throw new Error("The queue export destination folder changed during export.");
        if ((await snapshotStableChild(parent, destinationName)).exists) throw new Error("The selected queue export destination appeared during export.");
        await link(temporary, relativeDestination);
        try {
          await unlink(temporary);
        } catch (error) {
          await unlink(relativeDestination).catch(() => undefined);
          throw error;
        }
        promoted = true;
      } finally {
        await output.close().catch(() => undefined);
        if (!promoted) await unlink(temporary).catch(() => undefined);
      }
    }, parent);
  } finally {
    await parent.handle.close();
  }
  if (!result) throw new Error("The complete queue export did not produce a result.");
  return result;
}

export interface QueueWorker {
  (item: QueueItem, signal: AbortSignal, onProgress?: (progress: QueueProgress) => void): Promise<ConversionOutcome>;
}

/** Unlimited queue length, bounded in-flight work, paged reads, and durable item states. */
export class ConversionQueue {
  readonly #store: QueueStore;
  readonly #worker: QueueWorker;
  readonly #concurrency: number;
  #paused = false;
  #cancelled = false;
  #active = 0;
  #controller = new AbortController();
  #pending: QueueItem[] = [];
  #running = false;
  readonly #itemControllers = new Map<string, AbortController>();

  constructor(store: QueueStore, worker: QueueWorker, concurrency = 2) {
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) {
      throw new Error("Queue concurrency must be between 1 and 8.");
    }
    this.#store = store;
    this.#worker = worker;
    this.#concurrency = concurrency;
  }

  async enqueue(
    sourcePath: string,
    destinationPath: string,
    targetFormat: string,
    adapterId = "text-structured-local",
    totalBytes?: number,
  ): Promise<QueueItem> {
    const item: QueueItem = {
      id: randomUUID(),
      adapterId,
      sourcePath,
      destinationPath,
      targetFormat,
      state: "queued",
      bytesProcessed: 0,
      ...(totalBytes === undefined ? {} : { totalBytes }),
      updatedAt: Date.now(),
    };
    await this.#store.save(item);
    return item;
  }

  pause(): void {
    this.#paused = true;
  }

  resume(): void {
    this.#paused = false;
  }

  cancel(): void {
    this.#cancelled = true;
    this.#controller.abort();
    for (const controller of this.#itemControllers.values()) controller.abort();
    for (const item of this.#pending) {
      item.state = "cancelled";
      item.reason = "Cancelled by the user.";
    }
  }

  get activeCount(): number {
    return this.#active;
  }

  get running(): boolean {
    return this.#running;
  }

  async listPage(cursor?: string, pageSize = 256): Promise<QueuePage> {
    return this.#store.loadPage(cursor, pageSize);
  }

  /**
   * Compatibility surface deliberately disabled. A whole-queue snapshot is
   * not safe for an unbounded queue; callers must use listPage instead.
   */
  async list(): Promise<QueueItem[]> {
    throw new Error("Full converter queue snapshots are disabled; use paged queue reads.");
  }

  async reconcileAfterRestart(): Promise<void> {
    let cursor: string | undefined;
    do {
      const page = await this.#store.loadPage(cursor, 256);
      for (const item of page.items) {
        if (item.state !== "running") continue;
        item.state = "failed";
        item.reason = "The previous conversion stopped before completion; retry after reviewing the source and destination.";
        item.updatedAt = Date.now();
        await this.#store.save(item);
      }
      cursor = page.nextCursor;
    } while (cursor);
  }

  async cancelSelected(ids?: readonly string[]): Promise<void> {
    const selected = ids == null ? null : new Set(ids);
    if (selected == null) {
      this.cancel();
    }
    if (selected == null) {
      let allCursor: string | undefined;
      do {
        const page = await this.#store.loadPage(allCursor, 256);
        for (const item of page.items) {
          if (item.state !== "queued" && item.state !== "paused") continue;
          item.state = "cancelled";
          item.reason = "Cancelled by the user.";
          item.updatedAt = Date.now();
          await this.#store.save(item);
        }
        allCursor = page.nextCursor;
      } while (allCursor);
      return;
    }
    for (const [id, controller] of this.#itemControllers) if (selected.has(id)) controller.abort();
    let cursor: string | undefined;
    do {
      const page = await this.#store.loadPage(cursor, 256);
      for (const item of page.items) {
        if (!selected.has(item.id) || (item.state !== "queued" && item.state !== "paused")) continue;
        item.state = "cancelled";
        item.reason = "Cancelled by the user.";
        item.updatedAt = Date.now();
        await this.#store.save(item);
      }
      cursor = page.nextCursor;
    } while (cursor);
  }

  async retry(ids?: readonly string[]): Promise<void> {
    const selected = ids == null ? null : new Set(ids);
    let cursor: string | undefined;
    do {
      const page = await this.#store.loadPage(cursor, 256);
      for (const item of page.items) {
        if (selected != null && !selected.has(item.id)) continue;
        if (item.state !== "failed" && item.state !== "cancelled" && item.state !== "skipped") continue;
        item.state = "queued";
        item.reason = undefined;
        item.bytesProcessed = 0;
        item.bytesPerSecond = undefined;
        item.etaSeconds = undefined;
        item.updatedAt = Date.now();
        await this.#store.save(item);
      }
      cursor = page.nextCursor;
    } while (cursor);
  }

  async run(onProgress?: (item: QueueItem) => void): Promise<void> {
    if (this.#running) return;
    this.#running = true;
    this.#cancelled = false;
    this.#controller = new AbortController();
    let cursor: string | undefined;
    const pending: QueueItem[] = [];
    this.#pending = pending;
    const fill = async () => {
      if (pending.length >= this.#concurrency || this.#cancelled) return;
      const page = await this.#store.loadPage(cursor, Math.max(1, this.#concurrency - pending.length));
      cursor = page.nextCursor;
      pending.push(...page.items.filter((item) => item.state === "queued" || item.state === "paused"));
    };
    for (;;) {
      await fill();
      if (this.#cancelled && pending.length > 0) {
        for (const item of pending.splice(0)) {
          item.state = "cancelled";
          item.reason = "Cancelled by the user.";
          item.updatedAt = Date.now();
          await this.#store.save(item);
          onProgress?.(item);
        }
      }
      if (pending.length === 0) {
        if (cursor && !this.#cancelled) continue;
        while (this.#active > 0) await new Promise((resolveDelay) => setTimeout(resolveDelay, 5));
        this.#pending = [];
        this.#running = false;
        return;
      }
      if (this.#paused) {
        for (const item of pending) {
          item.state = "paused";
          item.updatedAt = Date.now();
          await this.#store.save(item);
          onProgress?.(item);
        }
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 10));
        continue;
      }
      const item = pending.shift()!;
      const itemController = new AbortController();
      this.#itemControllers.set(item.id, itemController);
      this.#active += 1;
      item.state = "running";
      item.updatedAt = Date.now();
      await this.#store.save(item);
      onProgress?.(item);
      void this.#runOne(item, onProgress, itemController.signal).finally(() => {
        this.#itemControllers.delete(item.id);
        this.#active -= 1;
      });
      while (this.#active >= this.#concurrency) await new Promise((resolveDelay) => setTimeout(resolveDelay, 5));
    }
  }

  async #runOne(
    item: QueueItem,
    onProgress: ((item: QueueItem) => void) | undefined,
    signal: AbortSignal,
  ): Promise<void> {
    const startedAt = Date.now();
    let progressTimer: ReturnType<typeof setTimeout> | undefined;
    let progressWrite: Promise<void> = Promise.resolve();
    let progressWriteError: unknown;
    const enqueueProgressWrite = (): void => {
      const snapshot = { ...item };
      progressWrite = progressWrite.then(() => this.#store.save(snapshot)).catch((error: unknown) => {
        progressWriteError ??= error;
      });
    };
    const flushProgress = async (): Promise<void> => {
      if (progressTimer !== undefined) {
        clearTimeout(progressTimer);
        progressTimer = undefined;
        enqueueProgressWrite();
      }
      await progressWrite;
      if (progressWriteError !== undefined) throw progressWriteError;
    };
    const scheduleProgressWrite = (): void => {
      if (progressTimer !== undefined) return;
      progressTimer = setTimeout(() => {
        progressTimer = undefined;
        enqueueProgressWrite();
      }, PROGRESS_PERSIST_INTERVAL_MS);
    };
    const report = (progress: QueueProgress) => {
      item.bytesProcessed = progress.bytesProcessed;
      item.totalBytes = progress.totalBytes ?? item.totalBytes;
      item.bytesPerSecond = progress.bytesPerSecond;
      item.etaSeconds = progress.etaSeconds;
      item.updatedAt = Date.now();
      scheduleProgressWrite();
      onProgress?.(item);
    };
    try {
      const result = await this.#worker(item, signal, report);
      item.state = result.status === "converted" ? "converted" : result.status;
      item.reason = result.status === "converted" ? undefined : result.reason;
      item.bytesProcessed = result.status === "converted" ? result.bytes : item.bytesProcessed;
      if (result.status === "converted") {
        const elapsed = Math.max(1, Date.now() - startedAt);
        item.bytesPerSecond = Math.round((result.bytes * 1000) / elapsed);
        item.etaSeconds = 0;
      }
    } catch (error) {
      item.state = signal.aborted ? "cancelled" : "failed";
      item.reason = signal.aborted
        ? "Cancelled by the user."
        : error instanceof Error
          ? error.message
          : "Queue worker failed.";
    }
    item.updatedAt = Date.now();
    try {
      await flushProgress();
    } catch (error) {
      item.state = "failed";
      item.reason = "Queue progress could not be persisted safely.";
      progressWriteError = error;
    }
    await this.#store.save(item);
    onProgress?.(item);
  }
}

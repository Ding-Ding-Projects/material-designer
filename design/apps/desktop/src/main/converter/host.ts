import { createReadStream } from "node:fs";
import {
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  statfs,
  unlink,
  writeFile,
} from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import { dirname, isAbsolute, parse, relative, resolve, sep } from "node:path";
import { adapterFor } from "./registry.js";
import { detectSource } from "./detect.js";
import { inspectPdf, type PdfDocument } from "./pdf.js";
import {
  MAX_OUTPUT_BYTES,
  MAX_SOURCE_BYTES,
  type ByteProgress,
  type ConversionOutcome,
  type ConversionPreview,
  type DestinationSnapshot,
} from "./types.js";
import type { QueueProgress } from "./queue.js";

const TRANSIENT_RENAME_CODES = new Set(["EPERM", "EACCES", "EBUSY"]);
const promotionTails = new Map<string, Promise<void>>();

export type BoundedReadProgress = (progress: ByteProgress) => void;

export async function readBoundedFile(
  path: string,
  maxBytes = MAX_SOURCE_BYTES,
  onProgress?: BoundedReadProgress,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const checked = assertLocalPath(path);
  await assertNoReparsePath(checked);
  const info = await stat(checked);
  if (!info.isFile()) throw new Error("The selected source is not a regular file.");
  if (!Number.isSafeInteger(info.size) || info.size > maxBytes) {
    throw new Error("The selected source exceeds the bounded input size.");
  }
  const expectedSize = info.size;
  const chunks: Buffer[] = [];
  let total = 0;
  const startedAt = Date.now();
  onProgress?.({ bytesProcessed: 0, totalBytes: expectedSize, bytesPerSecond: 0, etaSeconds: expectedSize === 0 ? 0 : undefined });
  for await (const chunk of createReadStream(checked, { highWaterMark: 64 * 1024 })) {
    if (signal?.aborted) throw new Error("The source read was cancelled.");
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += bytes.length;
    if (total > maxBytes) throw new Error("The selected source exceeded the bounded input size while reading.");
    chunks.push(bytes);
    const elapsed = Math.max(1, Date.now() - startedAt);
    const rate = Math.round((total * 1000) / elapsed);
    onProgress?.({
      bytesProcessed: total,
      totalBytes: expectedSize,
      bytesPerSecond: rate,
      etaSeconds: rate > 0 ? Math.max(0, Math.ceil((expectedSize - total) / rate)) : undefined,
    });
  }
  const after = await stat(checked);
  if (after.size !== expectedSize || after.mtimeMs !== info.mtimeMs) {
    throw new Error("The source changed while it was being read; conversion was refused.");
  }
  if (total !== expectedSize) throw new Error("The source changed size while it was being read.");
  return new Uint8Array(Buffer.concat(chunks, total));
}

export function snapshotForStats(info: { size: number; mtimeMs: number; ctimeMs?: number }): DestinationSnapshot {
  return {
    exists: true,
    size: info.size,
    mtimeMs: info.mtimeMs,
    ...(typeof info.ctimeMs === "number" ? { ctimeMs: info.ctimeMs } : {}),
  };
}

export async function snapshotDestination(path: string): Promise<DestinationSnapshot> {
  const checked = assertLocalPath(path);
  await assertNoReparsePath(checked);
  const info = await stat(checked).catch(() => undefined);
  return info?.isFile() ? snapshotForStats(info) : { exists: false, size: 0, mtimeMs: 0 };
}

export function sameDestinationSnapshot(a: DestinationSnapshot, b: DestinationSnapshot): boolean {
  return a.exists === b.exists && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
}

function assertLocalPath(path: string): string {
  if (!isAbsolute(path)) throw new Error("Converter paths must be absolute host paths.");
  const resolved = resolve(path);
  if (resolved.includes("\0")) throw new Error("Converter paths cannot contain NUL bytes.");
  return resolved;
}

export async function assertNoReparsePath(path: string): Promise<void> {
  const resolved = assertLocalPath(path);
  const root = parse(resolved).root;
  const remainder = relative(root, resolved);
  let current = root;
  for (const segment of remainder.split(/[\\/]/).filter(Boolean)) {
    current = `${current.endsWith(sep) ? current : `${current}${sep}`}${segment}`;
    const info = await lstat(current).catch(() => undefined);
    if (info?.isSymbolicLink()) throw new Error("Converter paths cannot traverse symbolic links or reparse points.");
  }
}

export interface ConverterHostOptions {
  allowedRoot?: string;
  read?: (path: string, maxBytes: number, onProgress?: BoundedReadProgress, signal?: AbortSignal) => Promise<Uint8Array>;
}

export interface AuthorizedPromotion {
  expectedDestination: DestinationSnapshot;
}

async function withDeadline<T>(operation: Promise<T>, timeoutMs: number, signal?: AbortSignal): Promise<T> {
  const boundedTimeout = Math.max(1, Math.min(timeoutMs, 5 * 60_000));
  let timer: ReturnType<typeof setTimeout> | undefined;
  let removeAbort: (() => void) | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("The converter adapter exceeded its CPU time bound.")), boundedTimeout);
    if (signal) {
      const abort = () => reject(new Error("Conversion was cancelled."));
      if (signal.aborted) abort();
      else { signal.addEventListener("abort", abort, { once: true }); removeAbort = () => signal.removeEventListener("abort", abort); }
    }
  });
  try {
    return await Promise.race([operation, deadline]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    removeAbort?.();
  }
}

export class ConverterHost {
  readonly #allowedRoot?: string;
  readonly #read: (path: string, maxBytes: number, onProgress?: BoundedReadProgress, signal?: AbortSignal) => Promise<Uint8Array>;

  constructor(options: ConverterHostOptions = {}) {
    this.#allowedRoot = options.allowedRoot == null ? undefined : assertLocalPath(options.allowedRoot);
    this.#read = options.read ?? ((path, maxBytes, onProgress, signal) => readBoundedFile(path, maxBytes, onProgress, signal));
  }

  #checkPath(path: string): string {
    const resolved = assertLocalPath(path);
    if (
      this.#allowedRoot &&
      resolved !== this.#allowedRoot &&
      !resolved.startsWith(`${this.#allowedRoot}/`) &&
      !resolved.startsWith(`${this.#allowedRoot}\\`)
    ) {
      throw new Error("The source or destination is outside the converter's selected folder.");
    }
    return resolved;
  }

  async inspectPdf(sourcePath: string): Promise<PdfDocument> {
    const checked = this.#checkPath(sourcePath);
    await assertNoReparsePath(checked);
    const bytes = await this.#read(checked, MAX_SOURCE_BYTES);
    return inspectPdf(bytes);
  }

  async preview(sourcePath: string, destinationPath: string, adapterId: string, targetFormat: string): Promise<ConversionPreview> {
    const adapter = adapterFor(adapterId);
    if (!adapter) throw new Error("The selected converter adapter is unknown.");
    if (!adapter.bundled || !adapter.convert) {
      throw new Error(adapter.unavailableReason ?? "The selected format has no bundled adapter.");
    }
    if (!adapter.capabilities.incrementalProgress) {
      throw new Error("The selected adapter cannot report incremental byte progress and is unavailable.");
    }
    const checkedSource = this.#checkPath(sourcePath);
    const checkedDestination = this.#checkPath(destinationPath);
    if (checkedSource === checkedDestination) throw new Error("The source and destination must be different files.");
    await assertNoReparsePath(checkedSource);
    await assertNoReparsePath(checkedDestination);
    const bytes = await this.#read(checkedSource, adapter.bounds.maxInputBytes);
    if (bytes.length > MAX_SOURCE_BYTES || bytes.length > adapter.bounds.maxInputBytes) {
      throw new Error("The source exceeds the selected adapter's bounded input size.");
    }
    const source = detectSource(bytes, checkedSource);
    if (!adapter.sourceFormats.includes(source.format)) {
      throw new Error(`The source signature is ${source.format}, which the selected adapter does not accept.`);
    }
    if (!adapter.targetFormats.includes(targetFormat)) {
      throw new Error("The selected target format is not supplied by this adapter.");
    }
    const destination = await snapshotDestination(checkedDestination);
    const lossy = !adapter.capabilities.lossless || targetFormat !== source.format;
    return {
      sourcePath: checkedSource,
      source,
      adapterId,
      targetFormat,
      lossy,
      disclosure: lossy
        ? "This conversion may change encoding, metadata, layout, or unsupported content. Review before converting."
        : "This conversion preserves the adapter's supported representation.",
      destination: checkedDestination,
      destinationSnapshot: destination,
    };
  }

  async convert(
    preview: ConversionPreview,
    signal?: AbortSignal,
    onProgress?: (progress: QueueProgress) => void,
  ): Promise<ConversionOutcome> {
    return this.#convertInternal(preview, signal, onProgress, undefined);
  }

  async convertAuthorized(
    preview: ConversionPreview,
    authorization: AuthorizedPromotion,
    signal?: AbortSignal,
    onProgress?: (progress: QueueProgress) => void,
  ): Promise<ConversionOutcome> {
    return this.#convertInternal(preview, signal, onProgress, authorization);
  }

  async #convertInternal(
    preview: ConversionPreview,
    signal: AbortSignal | undefined,
    onProgress: ((progress: QueueProgress) => void) | undefined,
    authorization: AuthorizedPromotion | undefined,
  ): Promise<ConversionOutcome> {
    const adapter = adapterFor(preview.adapterId);
    if (!adapter?.bundled || !adapter.convert || !adapter.capabilities.incrementalProgress) {
      return {
        status: "failed",
        source: preview.source.format,
        destination: preview.destination,
        reason: adapter?.unavailableReason ?? "The adapter is unavailable.",
      };
    }
    if (signal?.aborted) {
      return { status: "cancelled", source: preview.source.format, destination: preview.destination, reason: "Conversion was cancelled before reading the source." };
    }
    try {
      const checkedSource = this.#checkPath(preview.sourcePath);
      const checkedDestination = this.#checkPath(preview.destination);
      if (checkedSource === checkedDestination) throw new Error("The source and destination must be different files.");
      await assertNoReparsePath(checkedSource);
      await assertNoReparsePath(checkedDestination);
      const input = await this.#read(
        checkedSource,
        adapter.bounds.maxInputBytes,
        (progress) => onProgress?.(progress),
        signal,
      );
      if (input.length > adapter.bounds.maxInputBytes) throw new Error("The source exceeds the adapter input bound.");
      if (signal?.aborted) return { status: "cancelled", source: preview.source.format, destination: preview.destination, reason: "Conversion was cancelled." };
      const output = await withDeadline(adapter.convert(
        input,
        preview.targetFormat,
        { ...preview.options, sourceFormat: preview.source.format },
        (progress) => onProgress?.(progress),
      ), adapter.bounds.maxCpuMs, signal);
      onProgress?.({ bytesProcessed: input.length, totalBytes: input.length });
      if (signal?.aborted) return { status: "cancelled", source: preview.source.format, destination: preview.destination, reason: "Conversion was cancelled before output promotion." };
      if (output.length > Math.min(MAX_OUTPUT_BYTES, adapter.bounds.maxOutputBytes)) throw new Error("The converted output exceeds the adapter output bound.");
      const validation = adapter.validateOutput(output, preview.targetFormat);
      if (!validation.ok) throw new Error(validation.reason ?? "Output validation refused the result.");
      const existing = await snapshotDestination(checkedDestination);
      if (existing.exists && authorization == null) throw new Error("The destination already exists; complete overwrite confirmation before replacing it.");
      if (authorization && !sameDestinationSnapshot(existing, authorization.expectedDestination)) {
        throw new Error("The destination changed after confirmation; the one-use authorization is no longer valid.");
      }
      await ensureDestinationCapacity(checkedDestination, output.length);
      await atomicWrite(checkedDestination, output, { replace: existing.exists, expected: authorization?.expectedDestination });
      const reopened = await readBoundedFile(checkedDestination, Math.min(MAX_OUTPUT_BYTES, adapter.bounds.maxOutputBytes));
      const reopenedValidation = adapter.validateOutput(reopened, preview.targetFormat);
      if (!reopenedValidation.ok || reopened.length !== output.length) throw new Error("The promoted output failed post-write validation.");
      return { status: "converted", source: preview.sourcePath, destination: preview.destination, bytes: output.length, format: preview.targetFormat };
    } catch (error) {
      return {
        status: signal?.aborted ? "cancelled" : "failed",
        source: preview.sourcePath,
        destination: preview.destination,
        reason: signal?.aborted ? "Conversion was cancelled." : error instanceof Error ? error.message : "Conversion failed.",
      };
    }
  }
}

export interface AtomicWriteOptions {
  replace?: boolean;
  expected?: DestinationSnapshot;
}

async function withPromotionLock<T>(destination: string, operation: () => Promise<T>): Promise<T> {
  const previous = promotionTails.get(destination) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolveRelease) => { release = resolveRelease; });
  const queued = previous.then(() => current);
  promotionTails.set(destination, queued);
  await previous;
  const lockPath = `${destination}.material-designer-lock`;
  let lockAcquired = false;
  try {
    try {
      await mkdir(lockPath);
      lockAcquired = true;
    } catch {
      throw new Error("The destination is busy in another converter operation.");
    }
    return await operation();
  } finally {
    if (lockAcquired) await rm(lockPath, { recursive: true, force: true }).catch(() => undefined);
    release();
    if (promotionTails.get(destination) === queued) promotionTails.delete(destination);
  }
}

async function renameWithRetry(source: string, destination: string): Promise<void> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      await rename(source, destination);
      return;
    } catch (error) {
      const code = typeof error === "object" && error != null && "code" in error && typeof error.code === "string" ? error.code : "";
      if (!TRANSIENT_RENAME_CODES.has(code) || attempt === 5) throw error;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 25 * (attempt + 1)));
    }
  }
}

/** Writes a validated file, optionally replacing the exact confirmed target. */
export async function atomicWrite(path: string, bytes: Uint8Array, options: AtomicWriteOptions = {}): Promise<void> {
  const destination = assertLocalPath(path);
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
  await writeFile(temporary, bytes, { flag: "wx", mode: 0o600 });
  try {
    await withPromotionLock(destination, async () => {
      const current = await snapshotDestination(destination);
      if (!options.replace && current.exists) throw new Error("The destination already exists; overwrite confirmation is required.");
      if (options.replace && (!options.expected || !sameDestinationSnapshot(current, options.expected))) {
        throw new Error("The destination changed after confirmation; promotion was refused.");
      }
      if (!current.exists) {
        await renameWithRetry(temporary, destination);
        return;
      }
      // Windows rename does not replace an open destination. Keep a rollback
      // copy while the per-destination lock is held, so a failed replacement
      // restores the confirmed original rather than leaving a partial file.
      const backup = `${destination}.${process.pid}.${randomUUID()}.backup`;
      await renameWithRetry(destination, backup);
      try {
        await renameWithRetry(temporary, destination);
        await unlink(backup).catch(() => undefined);
      } catch (error) {
        await unlink(destination).catch(() => undefined);
        await renameWithRetry(backup, destination).catch(() => undefined);
        throw error;
      }
    });
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}

export async function ensureDestinationCapacity(destinationPath: string, requiredBytes: number): Promise<void> {
  const checked = assertLocalPath(destinationPath);
  await assertNoReparsePath(checked);
  const directory = dirname(checked);
  const info = await stat(directory).catch(() => undefined);
  if (!info?.isDirectory()) throw new Error("The destination folder does not exist.");
  if (!Number.isSafeInteger(requiredBytes) || requiredBytes < 0 || requiredBytes > MAX_OUTPUT_BYTES) {
    throw new Error("The requested output size is outside the converter bound.");
  }
  const filesystem = await statfs(directory);
  const available = Number(filesystem.bavail) * Number(filesystem.bsize);
  if (!Number.isFinite(available) || available < requiredBytes) {
    throw new Error("The destination folder does not have enough available storage for the bounded output.");
  }
}

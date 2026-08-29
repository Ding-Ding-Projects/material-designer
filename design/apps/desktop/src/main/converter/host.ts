import { createReadStream } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
  statfs,
  unlink,
} from "node:fs/promises";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Worker } from "node:worker_threads";
import { dirname, isAbsolute, parse, relative, resolve, sep } from "node:path";
import { ADAPTER_CATALOG, adapterFor } from "./registry.js";
import { detectSource } from "./detect.js";
import { inspectPdf, type PdfDocument } from "./pdf.js";
import {
  MAX_OUTPUT_BYTES,
  MAX_SOURCE_BYTES,
  DISCLOSURE_TTL_MS,
  type ConverterAdapter,
  type DisclosureAcknowledgement,
  type ByteProgress,
  type ConversionOutcome,
  type ConversionPreview,
  type DestinationSnapshot,
} from "./types.js";
import type { QueueProgress } from "./queue.js";

const TRANSIENT_RENAME_CODES = new Set(["EPERM", "EACCES", "EBUSY"]);
const promotionTails = new Map<string, Promise<void>>();
const disclosureTokens = new Map<string, DisclosureAcknowledgement>();
const MAX_OPTIONS_DEPTH = 16;
const MAX_OPTIONS_KEYS = 64;

function normalizeOptionValue(value: unknown, depth = 0): unknown {
  if (depth > MAX_OPTIONS_DEPTH) throw new Error("Conversion options exceed the recursion bound.");
  if (value == null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Conversion options contain a non-finite number.");
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_OPTIONS_KEYS) throw new Error("Conversion options contain too many items.");
    return value.map((item) => normalizeOptionValue(item, depth + 1));
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length > MAX_OPTIONS_KEYS) throw new Error("Conversion options contain too many keys.");
    return Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => {
      if (key === "__proto__" || key === "constructor" || key === "prototype") throw new Error("Conversion options contain an unsafe key.");
      return [key, normalizeOptionValue(item, depth + 1)];
    }));
  }
  throw new Error("Conversion options contain an unsupported value.");
}

function optionsDigest(options: Record<string, unknown> | undefined): { normalized: Record<string, unknown>; digest: string } {
  const normalized = normalizeOptionValue(options ?? {}) as Record<string, unknown>;
  const serialized = JSON.stringify(normalized);
  return { normalized, digest: createHash("sha256").update(serialized, "utf8").digest("hex") };
}

const CONVERSION_WORKER_SOURCE = `
  import { parentPort, workerData } from 'node:worker_threads';
  try {
    const input = new Uint8Array(workerData.inputBuffer);
    parentPort.postMessage({ type: 'progress', progress: { bytesProcessed: input.byteLength, totalBytes: input.byteLength } });
    let output;
    if (workerData.adapterId === 'binary-inspector-local') {
      const text = workerData.targetFormat === 'hex'
        ? Array.from(input, (value) => value.toString(16).padStart(2, '0')).join('')
        : Buffer.from(input).toString('base64');
      output = new TextEncoder().encode(text);
    } else if (workerData.adapterId === 'structured-data-local' || workerData.adapterId === 'text-structured-local') {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(input);
      output = new TextEncoder().encode(workerData.targetFormat === 'html'
        ? '<pre>' + text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</pre>\\n'
        : text);
    } else throw new Error('The packaged converter worker could not resolve the adapter.');
    if (!(output instanceof Uint8Array)) throw new Error('The converter worker returned an invalid output buffer.');
    parentPort.postMessage({ type: 'result', output }, [output.buffer]);
  } catch (error) {
    parentPort.postMessage({ type: 'error', reason: error instanceof Error ? error.message : 'The converter worker failed.' });
  }
`;

export type BoundedReadProgress = (progress: ByteProgress) => void;

async function runIsolatedConversion(
  input: Uint8Array,
  adapterId: string,
  targetFormat: string,
  options: Record<string, unknown> | undefined,
  maxCpuMs: number,
  maxMemoryBytes: number,
  signal: AbortSignal | undefined,
  onProgress: ((progress: ByteProgress) => void) | undefined,
): Promise<Uint8Array> {
  const inputBytes = input.byteLength;
  const inputBuffer = input.buffer as ArrayBuffer;
  const worker = new Worker(CONVERSION_WORKER_SOURCE, {
    eval: true,
    type: "module",
    workerData: {
      adapterId,
      inputBuffer,
      options,
      targetFormat,
    },
    transferList: [inputBuffer],
    resourceLimits: { maxOldGenerationSizeMb: Math.max(16, Math.floor(maxMemoryBytes / (1024 * 1024))) },
  });
  return new Promise<Uint8Array>((resolveOutput, rejectOutput) => {
    let settled = false;
    const timer = setTimeout(() => {
      void worker.terminate();
      settleReject(new Error("The converter adapter exceeded its CPU time bound."));
    }, Math.max(1, Math.min(maxCpuMs, 5 * 60_000)));
    const abort = () => {
      void worker.terminate();
      settleReject(new Error("Conversion was cancelled."));
    };
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      worker.removeAllListeners();
    };
    const settleResolve = (output: Uint8Array) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolveOutput(output);
    };
    const settleReject = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      rejectOutput(error);
    };
    worker.on("message", (message: { type?: string; output?: Uint8Array; progress?: ByteProgress; reason?: string }) => {
      if (settled || signal?.aborted) return;
      if (message.type === "progress" && message.progress) onProgress?.(message.progress);
      else if (message.type === "result" && message.output instanceof Uint8Array) {
        if (message.output.byteLength > maxMemoryBytes - inputBytes) {
          void worker.terminate();
          settleReject(new Error("The converter worker output exceeded the combined memory bound."));
          return;
        }
        settleResolve(message.output);
      } else if (message.type === "error") {
        settleReject(new Error(message.reason ?? "The converter worker failed."));
      }
    });
    worker.on("error", (error: unknown) => settleReject(error instanceof Error ? error : new Error("The converter worker failed.")));
    worker.on("exit", (code: number) => {
      if (!settled && code !== 0) settleReject(new Error(`The converter worker exited before producing output (code ${code}).`));
    });
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
  });
}

async function writeAllAndFlush(path: string, bytes: Uint8Array): Promise<void> {
  const handle = await open(path, "wx", 0o600);
  try {
    let offset = 0;
    while (offset < bytes.byteLength) {
      const result = await handle.write(bytes.subarray(offset), undefined);
      if (!Number.isSafeInteger(result.bytesWritten) || result.bytesWritten <= 0) throw new Error("The converter output write made no progress.");
      offset += result.bytesWritten;
    }
    await handle.sync();
  } finally {
    await handle.close();
  }
}

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
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

export function snapshotForStats(info: { size: number; mtimeMs: number; ctimeMs?: number; dev?: number; ino?: number }): DestinationSnapshot {
  return {
    exists: true,
    size: info.size,
    mtimeMs: info.mtimeMs,
    ...(typeof info.ctimeMs === "number" ? { ctimeMs: info.ctimeMs } : {}),
    ...(typeof info.dev === "number" && typeof info.ino === "number" ? { identity: `${info.dev}:${info.ino}` } : {}),
  };
}

async function snapshotFile(path: string): Promise<DestinationSnapshot> {
  const checked = assertLocalPath(path);
  await assertNoReparsePath(checked);
  const info = await stat(checked);
  if (!info.isFile()) throw new Error("The selected source is not a regular file.");
  return snapshotForStats(info);
}

export async function snapshotDestination(path: string): Promise<DestinationSnapshot> {
  const checked = assertLocalPath(path);
  await assertNoReparsePath(checked);
  const info = await stat(checked).catch((error: unknown) => {
    if (typeof error === "object" && error != null && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  });
  return info?.isFile() ? snapshotForStats(info) : { exists: false, size: 0, mtimeMs: 0 };
}

export function sameDestinationSnapshot(a: DestinationSnapshot, b: DestinationSnapshot): boolean {
  return a.exists === b.exists && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs && a.identity === b.identity;
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
  adapters?: readonly ConverterAdapter[];
}

export interface AuthorizedPromotion {
  expectedDestination: DestinationSnapshot;
}

function assertAdapterBounds(adapter: ConverterAdapter): void {
  const bounds = adapter.bounds;
  if (!Number.isSafeInteger(bounds.maxInputBytes) || bounds.maxInputBytes <= 0
    || !Number.isSafeInteger(bounds.maxOutputBytes) || bounds.maxOutputBytes <= 0
    || !Number.isSafeInteger(bounds.maxCpuMs) || bounds.maxCpuMs <= 0
    || !Number.isSafeInteger(bounds.maxMemoryBytes) || bounds.maxMemoryBytes < bounds.maxInputBytes * 2
    || !Number.isSafeInteger(bounds.maxItems) || bounds.maxItems <= 0
    || !Number.isSafeInteger(bounds.maxRecursionDepth) || bounds.maxRecursionDepth <= 0) {
    throw new Error("The selected adapter has invalid resource bounds and is unavailable.");
  }
}

export class ConverterHost {
  readonly #allowedRoot?: string;
  readonly #read: (path: string, maxBytes: number, onProgress?: BoundedReadProgress, signal?: AbortSignal) => Promise<Uint8Array>;
  readonly #adapters: readonly ConverterAdapter[];

  constructor(options: ConverterHostOptions = {}) {
    this.#allowedRoot = options.allowedRoot == null ? undefined : assertLocalPath(options.allowedRoot);
    this.#read = options.read ?? ((path, maxBytes, onProgress, signal) => readBoundedFile(path, maxBytes, onProgress, signal));
    this.#adapters = options.adapters ?? ADAPTER_CATALOG;
  }

  catalog(): readonly ConverterAdapter[] {
    return this.#adapters;
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

  async preview(sourcePath: string, destinationPath: string, adapterId: string, targetFormat: string, options?: Record<string, unknown>): Promise<ConversionPreview> {
    const adapter = adapterFor(adapterId, this.#adapters);
    if (!adapter) throw new Error("The selected converter adapter is unknown.");
    if (!adapter.bundled || !adapter.convert || adapter.packageProof?.kind !== "packaged") {
      throw new Error(adapter.unavailableReason ?? "The selected format has no bundled adapter.");
    }
    assertAdapterBounds(adapter);
    if (!adapter.capabilities.incrementalProgress) {
      throw new Error("The selected adapter cannot report incremental byte progress and is unavailable.");
    }
    const checkedSource = this.#checkPath(sourcePath);
    const checkedDestination = this.#checkPath(destinationPath);
    if (checkedSource === checkedDestination) throw new Error("The source and destination must be different files.");
    await assertNoReparsePath(checkedSource);
    await assertNoReparsePath(checkedDestination);
    const sourceSnapshot = await snapshotFile(checkedSource);
    const bytes = await this.#read(checkedSource, Math.min(MAX_SOURCE_BYTES, adapter.bounds.maxInputBytes, adapter.bounds.maxMemoryBytes));
    if (bytes.length > MAX_SOURCE_BYTES || bytes.length > adapter.bounds.maxInputBytes) {
      throw new Error("The source exceeds the selected adapter's bounded input size.");
    }
    const afterRead = await snapshotFile(checkedSource);
    if (!sameDestinationSnapshot(sourceSnapshot, afterRead)) throw new Error("The source changed while it was being previewed; conversion was refused.");
    const source = detectSource(bytes, checkedSource);
    if (!adapter.sourceFormats.includes(source.format)) {
      throw new Error(`The source signature is ${source.format}, which the selected adapter does not accept.`);
    }
    if (!adapter.targetFormats.includes(targetFormat)) {
      throw new Error("The selected target format is not supplied by this adapter.");
    }
    const optionState = optionsDigest(options);
    const destination = await snapshotDestination(checkedDestination);
    const lossy = !adapter.capabilities.lossless || targetFormat !== source.format;
    return {
      previewId: randomUUID(),
      sourcePath: checkedSource,
      source,
      sourceDigest: createHash("sha256").update(bytes).digest("hex"),
      sourceSnapshot,
      adapterId,
      targetFormat,
      lossy,
      disclosure: lossy
        ? "This conversion may change encoding, metadata, layout, or unsupported content. Review before converting."
        : "This conversion preserves the adapter's supported representation.",
      destination: checkedDestination,
      destinationSnapshot: destination,
      optionsDigest: optionState.digest,
      options: optionState.normalized,
    };
  }

  acknowledgeDisclosure(preview: ConversionPreview, now = Date.now()): DisclosureAcknowledgement {
    if (!preview.lossy) throw new Error("This conversion does not require a loss disclosure acknowledgement.");
    const adapter = adapterFor(preview.adapterId, this.#adapters);
    if (!adapter?.bundled || !adapter.convert || adapter.packageProof?.kind !== "packaged") throw new Error("The selected adapter is unavailable for acknowledgement.");
    const acknowledgement: DisclosureAcknowledgement = {
      token: randomBytes(24).toString("hex"),
      expiresAtMs: now + DISCLOSURE_TTL_MS,
      previewId: preview.previewId,
      adapterId: preview.adapterId,
      targetFormat: preview.targetFormat,
      sourcePath: preview.sourcePath,
      sourceDigest: preview.sourceDigest,
      sourceSnapshot: preview.sourceSnapshot,
      destinationSnapshot: preview.destinationSnapshot,
      detectedFormat: preview.source.format,
      optionsDigest: preview.optionsDigest,
    };
    disclosureTokens.set(acknowledgement.token, acknowledgement);
    return acknowledgement;
  }

  #consumeDisclosure(preview: ConversionPreview, token: string | undefined, now = Date.now()): void {
    if (!preview.lossy) return;
    if (!token) throw new Error("A current loss disclosure acknowledgement is required before conversion.");
    const acknowledgement = disclosureTokens.get(token);
    disclosureTokens.delete(token);
    if (!acknowledgement || acknowledgement.expiresAtMs <= now || acknowledgement.previewId !== preview.previewId || acknowledgement.adapterId !== preview.adapterId || acknowledgement.targetFormat !== preview.targetFormat || acknowledgement.sourcePath !== preview.sourcePath || acknowledgement.sourceDigest !== preview.sourceDigest || !sameDestinationSnapshot(acknowledgement.sourceSnapshot, preview.sourceSnapshot) || !sameDestinationSnapshot(acknowledgement.destinationSnapshot, preview.destinationSnapshot) || acknowledgement.detectedFormat !== preview.source.format || acknowledgement.optionsDigest !== preview.optionsDigest) {
      throw new Error("The loss disclosure acknowledgement is missing, stale, or for a different conversion.");
    }
  }

  async convert(
    preview: ConversionPreview,
    signal?: AbortSignal,
    onProgress?: (progress: QueueProgress) => void,
    disclosureAcknowledgementToken?: string,
  ): Promise<ConversionOutcome> {
    try {
      this.#consumeDisclosure(preview, disclosureAcknowledgementToken);
    } catch (error) {
      return { status: "failed", source: preview.sourcePath, destination: preview.destination, reason: error instanceof Error ? error.message : "A current loss disclosure acknowledgement is required before conversion." };
    }
    return this.#convertInternal(preview, signal, onProgress, undefined);
  }

  async convertAuthorized(
    preview: ConversionPreview,
    authorization: AuthorizedPromotion,
    signal?: AbortSignal,
    onProgress?: (progress: QueueProgress) => void,
    disclosureAcknowledgementToken?: string,
  ): Promise<ConversionOutcome> {
    try {
      this.#consumeDisclosure(preview, disclosureAcknowledgementToken);
    } catch (error) {
      return { status: "failed", source: preview.sourcePath, destination: preview.destination, reason: error instanceof Error ? error.message : "A current loss disclosure acknowledgement is required before conversion." };
    }
    return this.#convertInternal(preview, signal, onProgress, authorization);
  }

  async #convertInternal(
    preview: ConversionPreview,
    signal: AbortSignal | undefined,
    onProgress: ((progress: QueueProgress) => void) | undefined,
    authorization: AuthorizedPromotion | undefined,
  ): Promise<ConversionOutcome> {
    const adapter = adapterFor(preview.adapterId, this.#adapters);
    if (!adapter?.bundled || !adapter.convert || adapter.packageProof?.kind !== "packaged" || !adapter.capabilities.incrementalProgress) {
      return {
        status: "failed",
        source: preview.source.format,
        destination: preview.destination,
        reason: adapter?.unavailableReason ?? "The adapter is unavailable.",
      };
    }
    try {
      assertAdapterBounds(adapter);
    } catch (error) {
      return { status: "failed", source: preview.sourcePath, destination: preview.destination, reason: error instanceof Error ? error.message : "The selected adapter has invalid resource bounds and is unavailable." };
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
      const sourceBeforeRead = await snapshotFile(checkedSource);
      if (!sameDestinationSnapshot(sourceBeforeRead, preview.sourceSnapshot)) throw new Error("The source changed after preview; conversion was refused.");
      const destinationBeforeRead = await snapshotDestination(checkedDestination);
      if (!sameDestinationSnapshot(destinationBeforeRead, preview.destinationSnapshot)) throw new Error("The destination changed after preview; conversion was refused.");
      const optionState = optionsDigest(preview.options);
      if (optionState.digest !== preview.optionsDigest) throw new Error("Conversion options changed after preview; conversion was refused.");
      const input = await this.#read(
        checkedSource,
        Math.min(MAX_SOURCE_BYTES, adapter.bounds.maxInputBytes, adapter.bounds.maxMemoryBytes),
        (progress) => onProgress?.(progress),
        signal,
      );
      const inputBytes = input.byteLength;
      if (inputBytes > adapter.bounds.maxInputBytes) throw new Error("The source exceeds the adapter input bound.");
      const sourceAfterRead = await snapshotFile(checkedSource);
      const detected = detectSource(input, checkedSource);
      if (!sameDestinationSnapshot(sourceAfterRead, preview.sourceSnapshot) || createHash("sha256").update(input).digest("hex") !== preview.sourceDigest || detected.format !== preview.source.format || detected.category !== preview.source.category) {
        throw new Error("The source changed or was re-detected after preview; conversion was refused.");
      }
      if (signal?.aborted) return { status: "cancelled", source: preview.source.format, destination: preview.destination, reason: "Conversion was cancelled." };
      if (input.byteLength > adapter.bounds.maxMemoryBytes) throw new Error("The source exceeds the adapter memory bound.");
      const output = await runIsolatedConversion(
        input,
        preview.adapterId,
        preview.targetFormat,
        { ...preview.options, sourceFormat: preview.source.format },
        adapter.bounds.maxCpuMs,
        adapter.bounds.maxMemoryBytes,
        signal,
        (progress) => onProgress?.(progress),
      );
      onProgress?.({ bytesProcessed: inputBytes, totalBytes: inputBytes });
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
  await assertNoReparsePath(destination);
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
  await writeAllAndFlush(temporary, bytes);
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

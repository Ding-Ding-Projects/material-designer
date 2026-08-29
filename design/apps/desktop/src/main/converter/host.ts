import {
  mkdir,
  open,
  rename,
  rm,
  stat,
  statfs,
  unlink,
} from "node:fs/promises";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Worker } from "node:worker_threads";
import { basename, dirname } from "node:path";
import { ADAPTER_CATALOG, adapterFor } from "./registry.js";
import { hasPackagedAdapterCapability } from "./provenance.js";
import { detectSource } from "./detect.js";
import { inspectPdf, type PdfDocument } from "./pdf.js";
import { assertHandleRelativeWriteSupport, assertLocalPath, assertNoReparsePath, openStableDirectory, openStableFile, sameIdentity, sameSnapshot, snapshotForStats, snapshotStableChild, stableChildPath, type StableDirectoryHandle } from "./path-safety.js";
import { WindowsNativeConverterWriter, singleWindowsWriterChunk } from "./windows-writer.js";
export { assertHandleRelativeWriteSupport, assertLocalPath, assertNoReparsePath, sameIdentity, sameSnapshot, snapshotForStats } from "./path-safety.js";
import {
  MAX_OUTPUT_BYTES,
  MAX_SOURCE_BYTES,
  DISCLOSURE_TTL_MS,
  type ConverterAdapter,
  type DisclosureAcknowledgement,
  type OpaqueDisclosureAcknowledgement,
  type ByteProgress,
  type ConversionOutcome,
  type ConversionPreview,
  type DestinationSnapshot,
} from "./types.js";
import type { QueueProgress } from "./queue.js";

const TRANSIENT_RENAME_CODES = new Set(["EPERM", "EACCES", "EBUSY"]);
const promotionTails = new Map<string, Promise<void>>();
const disclosureTokens = new Map<string, DisclosureAcknowledgement>();
const disclosureTokensByPreview = new Map<string, string>();
const MAX_DISCLOSURE_TOKENS = 4_096;
type HostPreviewRecord = ConversionPreview & { expiresAtMs: number };
const previewRecords = new Map<string, HostPreviewRecord>();
const MAX_OPTIONS_DEPTH = 16;
const MAX_OPTIONS_KEYS = 64;
const WORKER_OVERHEAD_BYTES = 8 * 1024 * 1024;

function removeDisclosureToken(token: string): void {
  const acknowledgement = disclosureTokens.get(token);
  if (!acknowledgement) return;
  disclosureTokens.delete(token);
  if (disclosureTokensByPreview.get(acknowledgement.previewId) === token) disclosureTokensByPreview.delete(acknowledgement.previewId);
}

function pruneDisclosureState(now: number): void {
  for (const [previewId, preview] of previewRecords) {
    if (preview.expiresAtMs <= now) {
      previewRecords.delete(previewId);
      const token = disclosureTokensByPreview.get(previewId);
      if (token) removeDisclosureToken(token);
    }
  }
  for (const [token, acknowledgement] of disclosureTokens) {
    if (acknowledgement.expiresAtMs <= now || !previewRecords.has(acknowledgement.previewId)) removeDisclosureToken(token);
  }
  while (disclosureTokens.size >= MAX_DISCLOSURE_TOKENS) {
    const oldest = disclosureTokens.keys().next().value;
    if (typeof oldest !== "string") break;
    removeDisclosureToken(oldest);
  }
}

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
    if (!Number.isSafeInteger(workerData.maxItems) || workerData.maxItems < 1 || !Number.isSafeInteger(workerData.maxRecursionDepth) || workerData.maxRecursionDepth < 1 || !Number.isSafeInteger(workerData.maxOutputBytes) || workerData.maxOutputBytes < 1 || !Number.isSafeInteger(workerData.maxMemoryBytes) || workerData.maxMemoryBytes < 1) throw new Error('The converter worker received invalid resource bounds.');
    const input = new Uint8Array(workerData.inputBuffer);
    parentPort.postMessage({ type: 'progress', progress: { bytesProcessed: input.byteLength, totalBytes: input.byteLength } });
    const encoder = new TextEncoder();
    const reserve = 8 * 1024 * 1024;
    const admit = (bytes) => {
      if (!Number.isSafeInteger(bytes) || bytes > workerData.maxOutputBytes || input.byteLength + bytes + reserve > workerData.maxMemoryBytes) throw new Error('The converter worker output exceeded the bounded memory or output limit.');
    };
    const hex = '0123456789abcdef';
    const encodeHex = () => {
      if (input.byteLength > workerData.maxItems || input.byteLength > Math.floor((workerData.maxMemoryBytes - reserve) / 2)) throw new Error('The converter item or memory limit was exceeded.');
      const outputBytes = input.byteLength * 2;
      admit(outputBytes);
      const output = new Uint8Array(outputBytes);
      for (let offset = 0; offset < input.byteLength; offset += 64 * 1024) {
        const end = Math.min(input.byteLength, offset + 64 * 1024);
        for (let index = offset; index < end; index += 1) {
          output[index * 2] = hex.charCodeAt(input[index] >>> 4);
          output[index * 2 + 1] = hex.charCodeAt(input[index] & 15);
        }
      }
      return output;
    };
    const encodeBase64 = () => {
      if (input.byteLength > workerData.maxItems) throw new Error('The converter item limit was exceeded.');
      const outputBytes = Math.ceil(input.byteLength / 3) * 4;
      admit(outputBytes);
      const output = new Uint8Array(outputBytes);
      const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      let outputOffset = 0;
      for (let offset = 0; offset < input.byteLength; offset += 3) {
        const first = input[offset];
        const second = offset + 1 < input.byteLength ? input[offset + 1] : 0;
        const third = offset + 2 < input.byteLength ? input[offset + 2] : 0;
        const remaining = input.byteLength - offset;
        output[outputOffset++] = alphabet.charCodeAt(first >>> 2);
        output[outputOffset++] = alphabet.charCodeAt(((first & 3) << 4) | (second >>> 4));
        output[outputOffset++] = remaining > 1 ? alphabet.charCodeAt(((second & 15) << 2) | (third >>> 6)) : 61;
        output[outputOffset++] = remaining > 2 ? alphabet.charCodeAt(third & 63) : 61;
      }
      return output;
    };
    const escape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const forEachTextChunk = (callback) => {
      const decoder = new TextDecoder('utf-8', { fatal: true });
      let offset = 0;
      let chunkCount = 0;
      if (workerData.targetFormat === 'html') callback('<pre>');
      while (offset < input.byteLength) {
        const end = Math.min(input.byteLength, offset + 64 * 1024);
        const text = decoder.decode(input.subarray(offset, end), { stream: end < input.byteLength });
        offset = end;
        if (text.length > 0) {
          chunkCount += 1;
          if (chunkCount > workerData.maxItems) throw new Error('The converter item limit was exceeded.');
          callback(workerData.targetFormat === 'html' ? escape(text) : text);
        }
      }
      const tail = decoder.decode();
      if (tail.length > 0) {
        chunkCount += 1;
        if (chunkCount > workerData.maxItems) throw new Error('The converter item limit was exceeded.');
        callback(workerData.targetFormat === 'html' ? escape(tail) : tail);
      }
      if (workerData.targetFormat === 'html') callback('</pre>\\n');
    };
    const encodeText = () => {
      let size = 0;
      forEachTextChunk((chunk) => {
        const bytes = encoder.encode(chunk);
        size += bytes.byteLength;
        admit(size);
      });
      const output = new Uint8Array(size);
      admit(output.byteLength);
      let offset = 0;
      forEachTextChunk((chunk) => {
        const bytes = encoder.encode(chunk);
        output.set(bytes, offset);
        offset += bytes.byteLength;
      });
      return output;
    };
    let output;
    if (workerData.adapterId === 'binary-inspector-local') {
      output = workerData.targetFormat === 'hex' ? encodeHex() : encodeBase64();
    } else if (workerData.adapterId === 'structured-data-local' || workerData.adapterId === 'text-structured-local') {
      if (input.byteLength + workerData.maxOutputBytes + reserve > workerData.maxMemoryBytes) throw new Error('The converter text workspace exceeds the conservative memory bound.');
      output = encodeText();
    } else throw new Error('The packaged converter worker could not resolve the adapter.');
    if (!(output instanceof Uint8Array)) throw new Error('The converter worker returned an invalid output buffer.');
    parentPort.postMessage({ type: 'result', output }, [output.buffer]);
  } catch (error) {
    parentPort.postMessage({ type: 'error', reason: error instanceof Error ? error.message : 'The converter worker failed.' });
  }
`;

export type BoundedReadProgress = (progress: ByteProgress) => void;

export type PublicConversionPreview = {
  previewId: string;
  source: Pick<ConversionPreview["source"], "format" | "category" | "bytes" | "confidence" | "mime">;
  adapterId: string;
  targetFormat: string;
  lossy: boolean;
  disclosure: string;
  destinationHandle: string;
};

export function publicConversionPreview(preview: ConversionPreview, destinationHandle: string): PublicConversionPreview {
  return {
    previewId: preview.previewId,
    source: preview.source,
    adapterId: preview.adapterId,
    targetFormat: preview.targetFormat,
    lossy: preview.lossy,
    disclosure: preview.disclosure,
    destinationHandle,
  };
}

export async function runBoundedWorker(
  input: Uint8Array,
  adapterId: string,
  targetFormat: string,
  options: Record<string, unknown> | undefined,
  maxCpuMs: number,
  maxOutputBytes: number,
  maxMemoryBytes: number,
  maxItems: number,
  maxRecursionDepth: number,
  signal: AbortSignal | undefined,
  onProgress: ((progress: ByteProgress) => void) | undefined,
): Promise<Uint8Array> {
  const inputBytes = input.byteLength;
  const inputBuffer = input.buffer as ArrayBuffer;
  if (!(inputBuffer instanceof ArrayBuffer) || input.byteOffset !== 0 || input.byteLength !== inputBuffer.byteLength) {
    throw new Error("The converter input buffer is not transfer-owned.");
  }
  const worker = new Worker(CONVERSION_WORKER_SOURCE, {
    eval: true,
    type: "module",
    workerData: {
      adapterId,
      inputBuffer,
      maxItems,
      maxRecursionDepth,
      maxOutputBytes,
      maxMemoryBytes,
      options,
      targetFormat,
    },
    transferList: [inputBuffer],
    resourceLimits: { maxOldGenerationSizeMb: Math.max(16, Math.floor((maxMemoryBytes - WORKER_OVERHEAD_BYTES) / (1024 * 1024))) },
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
  const opened = await openStableFile(checked);
  try {
    if (!Number.isSafeInteger(opened.snapshot.size) || opened.snapshot.size > maxBytes) {
      throw new Error("The selected source exceeds the bounded input size.");
    }
    const expectedSize = opened.snapshot.size;
    const output = new Uint8Array(expectedSize);
    let total = 0;
    const startedAt = Date.now();
    onProgress?.({ bytesProcessed: 0, totalBytes: expectedSize, bytesPerSecond: 0, etaSeconds: expectedSize === 0 ? 0 : undefined });
    while (total < expectedSize) {
      if (signal?.aborted) throw new Error("The source read was cancelled.");
      const result = await opened.handle.read(output, total, Math.min(64 * 1024, expectedSize - total), total);
      if (!Number.isSafeInteger(result.bytesRead) || result.bytesRead <= 0) throw new Error("The source changed size while it was being read.");
      total += result.bytesRead;
      const elapsed = Math.max(1, Date.now() - startedAt);
      const rate = Math.round((total * 1000) / elapsed);
      onProgress?.({
        bytesProcessed: total,
        totalBytes: expectedSize,
        bytesPerSecond: rate,
        etaSeconds: rate > 0 ? Math.max(0, Math.ceil((expectedSize - total) / rate)) : undefined,
      });
    }
    await assertNoReparsePath(checked);
    const afterHandle = snapshotForStats(await opened.handle.stat());
    const afterPath = snapshotForStats(await stat(checked));
    if (!sameSnapshot(opened.snapshot, afterHandle) || !sameSnapshot(opened.snapshot, afterPath)) {
      throw new Error("The source changed while it was being read; conversion was refused.");
    }
    return output;
  } finally {
    await opened.handle.close();
  }
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


export interface ConverterHostOptions {
  allowedRoot?: string;
  read?: (path: string, maxBytes: number, onProgress?: BoundedReadProgress, signal?: AbortSignal) => Promise<Uint8Array>;
  adapters?: readonly ConverterAdapter[];
  windowsWriterResourceRoot?: string;
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
    || bounds.maxMemoryBytes < bounds.maxInputBytes + Math.min(MAX_OUTPUT_BYTES, bounds.maxOutputBytes) + WORKER_OVERHEAD_BYTES
    || !Number.isSafeInteger(bounds.maxItems) || bounds.maxItems <= 0
    || !Number.isSafeInteger(bounds.maxRecursionDepth) || bounds.maxRecursionDepth <= 0) {
    throw new Error("The selected adapter has invalid resource bounds and is unavailable.");
  }
}

export class ConverterHost {
  readonly #allowedRoot?: string;
  readonly #read: (path: string, maxBytes: number, onProgress?: BoundedReadProgress, signal?: AbortSignal) => Promise<Uint8Array>;
  readonly #adapters: readonly ConverterAdapter[];
  readonly #windowsWriterResourceRoot?: string;
  readonly #windowsWriter: WindowsNativeConverterWriter;

  constructor(options: ConverterHostOptions = {}) {
    this.#allowedRoot = options.allowedRoot == null ? undefined : assertLocalPath(options.allowedRoot);
    this.#read = options.read ?? ((path, maxBytes, onProgress, signal) => readBoundedFile(path, maxBytes, onProgress, signal));
    this.#adapters = options.adapters ?? ADAPTER_CATALOG;
    this.#windowsWriterResourceRoot = options.windowsWriterResourceRoot;
    this.#windowsWriter = new WindowsNativeConverterWriter(options.windowsWriterResourceRoot);
  }

  async #destinationSnapshot(path: string): Promise<DestinationSnapshot> {
    return process.platform === "win32"
      ? this.#windowsWriter.inspectChild(path)
      : snapshotDestination(path);
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
    pruneDisclosureState(Date.now());
    const adapter = adapterFor(adapterId, this.#adapters);
    if (!adapter) throw new Error("The selected converter adapter is unknown.");
    if (!adapter.bundled || !adapter.convert || adapter.packageProof?.kind !== "packaged" || !hasPackagedAdapterCapability(adapter)) {
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
    if (!sameSnapshot(sourceSnapshot, afterRead)) throw new Error("The source changed while it was being previewed; conversion was refused.");
    const source = detectSource(bytes, checkedSource);
    if (!adapter.sourceFormats.includes(source.format)) {
      throw new Error(`The source signature is ${source.format}, which the selected adapter does not accept.`);
    }
    if (!adapter.targetFormats.includes(targetFormat)) {
      throw new Error("The selected target format is not supplied by this adapter.");
    }
    const optionState = optionsDigest(options);
    const destination = await this.#destinationSnapshot(checkedDestination);
    const lossy = !adapter.capabilities.lossless || targetFormat !== source.format;
    const record: ConversionPreview = {
      previewId: randomUUID(),
      sourcePath: checkedSource,
      source: Object.freeze({ ...source }),
      sourceDigest: createHash("sha256").update(bytes).digest("hex"),
      sourceSnapshot: Object.freeze({ ...sourceSnapshot }),
      adapterId,
      targetFormat,
      lossy,
      disclosure: lossy
        ? "This conversion may change encoding, metadata, layout, or unsupported content. Review before converting."
        : "This conversion preserves the adapter's supported representation.",
      destination: checkedDestination,
      destinationSnapshot: Object.freeze({ ...destination }),
      optionsDigest: optionState.digest,
      options: Object.freeze(optionState.normalized),
    };
    if (previewRecords.size >= 1_000) {
      const oldest = previewRecords.keys().next().value;
      if (typeof oldest === "string") {
        previewRecords.delete(oldest);
        const token = disclosureTokensByPreview.get(oldest);
        if (token) removeDisclosureToken(token);
      }
    }
    previewRecords.set(record.previewId, Object.freeze({ ...record, expiresAtMs: Date.now() + DISCLOSURE_TTL_MS }));
    return record;
  }

  acknowledgeDisclosure(previewId: string, now = Date.now()): OpaqueDisclosureAcknowledgement {
    pruneDisclosureState(now);
    const preview = this.#previewForId(previewId);
    if (!preview.lossy) throw new Error("This conversion does not require a loss disclosure acknowledgement.");
    const adapter = adapterFor(preview.adapterId, this.#adapters);
    if (!adapter?.bundled || !adapter.convert || adapter.packageProof?.kind !== "packaged" || !hasPackagedAdapterCapability(adapter)) throw new Error("The selected adapter is unavailable for acknowledgement.");
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
    const previousToken = disclosureTokensByPreview.get(preview.previewId);
    if (previousToken) removeDisclosureToken(previousToken);
    pruneDisclosureState(now);
    disclosureTokens.set(acknowledgement.token, acknowledgement);
    disclosureTokensByPreview.set(acknowledgement.previewId, acknowledgement.token);
    return { token: acknowledgement.token, expiresAtMs: acknowledgement.expiresAtMs, previewId: acknowledgement.previewId };
  }

  #consumeDisclosure(preview: ConversionPreview, token: string | undefined, now = Date.now()): void {
    if (!preview.lossy) return;
    if (!token) throw new Error("A current loss disclosure acknowledgement is required before conversion.");
    pruneDisclosureState(now);
    const acknowledgement = disclosureTokens.get(token);
    removeDisclosureToken(token);
    if (!acknowledgement || acknowledgement.expiresAtMs <= now || acknowledgement.previewId !== preview.previewId || acknowledgement.adapterId !== preview.adapterId || acknowledgement.targetFormat !== preview.targetFormat || acknowledgement.sourcePath !== preview.sourcePath || acknowledgement.sourceDigest !== preview.sourceDigest || !sameSnapshot(acknowledgement.sourceSnapshot, preview.sourceSnapshot) || !sameSnapshot(acknowledgement.destinationSnapshot, preview.destinationSnapshot) || acknowledgement.detectedFormat !== preview.source.format || acknowledgement.optionsDigest !== preview.optionsDigest) {
      throw new Error("The loss disclosure acknowledgement is missing, stale, or for a different conversion.");
    }
  }

  #previewForId(previewId: string): ConversionPreview {
    pruneDisclosureState(Date.now());
    const preview = previewRecords.get(previewId);
    if (!preview || preview.expiresAtMs <= Date.now()) {
      previewRecords.delete(previewId);
      const token = disclosureTokensByPreview.get(previewId);
      if (token) removeDisclosureToken(token);
      throw new Error("The conversion preview is unknown or expired.");
    }
    return preview;
  }

  async convert(
    previewId: string,
    signal?: AbortSignal,
    onProgress?: (progress: QueueProgress) => void,
    disclosureAcknowledgementToken?: string,
  ): Promise<ConversionOutcome> {
    const preview = this.#previewForId(previewId);
    try {
      this.#consumeDisclosure(preview, disclosureAcknowledgementToken);
    } catch (error) {
      return { status: "failed", source: preview.sourcePath, destination: preview.destination, reason: error instanceof Error ? error.message : "A current loss disclosure acknowledgement is required before conversion." };
    }
    return this.#convertInternal(preview, signal, onProgress, undefined);
  }

  async convertAuthorized(
    previewId: string,
    authorization: AuthorizedPromotion,
    signal?: AbortSignal,
    onProgress?: (progress: QueueProgress) => void,
    disclosureAcknowledgementToken?: string,
  ): Promise<ConversionOutcome> {
    const preview = this.#previewForId(previewId);
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
    if (!adapter?.bundled || !adapter.convert || adapter.packageProof?.kind !== "packaged" || !hasPackagedAdapterCapability(adapter) || !adapter.capabilities.incrementalProgress) {
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
      if (!sameSnapshot(sourceBeforeRead, preview.sourceSnapshot)) throw new Error("The source changed after preview; conversion was refused.");
      const destinationBeforeRead = await this.#destinationSnapshot(checkedDestination);
      if (!sameSnapshot(destinationBeforeRead, preview.destinationSnapshot)) throw new Error("The destination changed after preview; conversion was refused.");
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
      if (!sameSnapshot(sourceAfterRead, preview.sourceSnapshot) || createHash("sha256").update(input).digest("hex") !== preview.sourceDigest || detected.format !== preview.source.format || detected.category !== preview.source.category) {
        throw new Error("The source changed or was re-detected after preview; conversion was refused.");
      }
      if (signal?.aborted) return { status: "cancelled", source: preview.source.format, destination: preview.destination, reason: "Conversion was cancelled." };
      if (input.byteLength > adapter.bounds.maxMemoryBytes) throw new Error("The source exceeds the adapter memory bound.");
      const maxOutputBytes = Math.min(MAX_OUTPUT_BYTES, adapter.bounds.maxOutputBytes);
      if (inputBytes + maxOutputBytes + WORKER_OVERHEAD_BYTES > adapter.bounds.maxMemoryBytes) throw new Error("The conversion input, output, and worker workspace exceed the conservative memory bound.");
      const output = await runBoundedWorker(
        input,
        preview.adapterId,
        preview.targetFormat,
        { ...preview.options, sourceFormat: preview.source.format },
        adapter.bounds.maxCpuMs,
        maxOutputBytes,
        adapter.bounds.maxMemoryBytes,
        adapter.bounds.maxItems,
        adapter.bounds.maxRecursionDepth,
        signal,
        (progress) => onProgress?.(progress),
      );
      onProgress?.({ bytesProcessed: inputBytes, totalBytes: inputBytes });
      if (signal?.aborted) return { status: "cancelled", source: preview.source.format, destination: preview.destination, reason: "Conversion was cancelled before output promotion." };
      if (output.length > Math.min(MAX_OUTPUT_BYTES, adapter.bounds.maxOutputBytes)) throw new Error("The converted output exceeds the adapter output bound.");
      const validation = adapter.validateOutput(output, preview.targetFormat);
      if (!validation.ok) throw new Error(validation.reason ?? "Output validation refused the result.");
      const existing = await this.#destinationSnapshot(checkedDestination);
      if (existing.exists && authorization == null) throw new Error("The destination already exists; complete overwrite confirmation before replacing it.");
      if (authorization && !sameSnapshot(existing, authorization.expectedDestination)) {
        throw new Error("The destination changed after confirmation; the one-use authorization is no longer valid.");
      }
      await ensureDestinationCapacity(checkedDestination, output.length);
      await atomicWrite(checkedDestination, output, {
        replace: existing.exists,
        expected: authorization?.expectedDestination,
        signal,
        windowsWriterResourceRoot: this.#windowsWriterResourceRoot,
      });
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
  expectedParentIdentity?: string;
  signal?: AbortSignal;
  windowsAfterOpen?: () => Promise<void>;
  windowsBeforeLaunch?: () => Promise<void>;
  windowsWriterResourceRoot?: string;
  /** Focused adversarial hook, never exposed through the renderer bridge. */
  beforeCreate?: (directory: StableDirectoryHandle) => Promise<void>;
}

export async function withPromotionLock<T>(destination: string, operation: () => Promise<T>, directory: StableDirectoryHandle): Promise<T> {
  const previous = promotionTails.get(destination) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolveRelease) => { release = resolveRelease; });
  const queued = previous.then(() => current);
  promotionTails.set(destination, queued);
  await previous;
  let lockPath: string | undefined;
  let lockAcquired = false;
  try {
    lockPath = stableChildPath(directory, `${basename(destination)}.material-designer-lock`);
    try {
      await mkdir(lockPath);
      lockAcquired = true;
    } catch {
      throw new Error("The destination is busy in another converter operation.");
    }
    return await operation();
  } finally {
    if (lockAcquired && lockPath) await rm(lockPath, { recursive: true, force: true }).catch(() => undefined);
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
  if (process.platform === "win32") {
    const writer = new WindowsNativeConverterWriter(options.windowsWriterResourceRoot);
    const expectedParentIdentity = options.expectedParentIdentity
      ?? await writer.inspectParent(dirname(destination));
    await options.windowsBeforeLaunch?.();
    await writer.writeAtomic(destination, singleWindowsWriterChunk(bytes), {
      afterOpen: options.windowsAfterOpen,
      expectedDestination: options.expected,
      expectedParentIdentity,
      maxBytes: bytes.byteLength,
      replace: options.replace,
      signal: options.signal,
    });
    return;
  }
  assertHandleRelativeWriteSupport();
  const parent = await openStableDirectory(dirname(destination));
  try {
    const destinationName = basename(destination);
    const temporary = stableChildPath(parent, `.converter-${randomUUID()}.tmp`);
    await options.beforeCreate?.(parent);
    await writeAllAndFlush(temporary, bytes);
    try {
      await withPromotionLock(destination, async () => {
        const relativeDestination = stableChildPath(parent, destinationName);
        const current = await snapshotStableChild(parent, destinationName);
        if (!options.replace && current.exists) throw new Error("The destination already exists; overwrite confirmation is required.");
        if (options.replace && (!options.expected || !sameSnapshot(current, options.expected))) {
          throw new Error("The destination changed after confirmation; promotion was refused.");
        }
        if (!current.exists) {
          await renameWithRetry(temporary, relativeDestination);
          return;
        }
        // Keep a rollback copy while the per-destination lock is held, so a
        // failed replacement restores the confirmed original rather than
        // leaving a partial file.
        const backup = stableChildPath(parent, `.converter-${randomUUID()}.backup`);
        await renameWithRetry(relativeDestination, backup);
        try {
          await renameWithRetry(temporary, relativeDestination);
          await unlink(backup).catch(() => undefined);
        } catch (error) {
          await unlink(relativeDestination).catch(() => undefined);
          await renameWithRetry(backup, relativeDestination).catch(() => undefined);
          throw error;
        }
      }, parent);
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
  } finally {
    await parent.handle.close();
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

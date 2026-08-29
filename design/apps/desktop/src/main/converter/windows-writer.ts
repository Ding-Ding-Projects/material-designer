import { createHash } from "node:crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import type { Readable, Writable } from "node:stream";
import { openStableFile } from "./path-safety.js";
import type { DestinationSnapshot } from "./types.js";

const REQUEST_BYTES = 104;
const RESPONSE_BYTES = 64;
const PROTOCOL_VERSION = 1;
const OPERATION_INSPECT_PARENT = 1;
const OPERATION_INSPECT_CHILD = 2;
const OPERATION_WRITE = 3;
const FLAG_EXPECTED_PARENT = 1 << 0;
const FLAG_EXPECTED_CHILD = 1 << 1;
const FLAG_REPLACE = 1 << 2;
const RESPONSE_OPENED = 1;
const RESPONSE_RESULT = 2;
const RESPONSE_ERROR = 3;
const RESPONSE_CANCELLED = 4;
const ACTION_CONTINUE = 1;
const ACTION_CANCEL = 2;
const CANCEL_CHUNK = 0xffffffff;
const MAX_RESPONSE_MESSAGE_BYTES = 4096;
const MAX_CHUNK_BYTES = 1024 * 1024;
const MAX_EXECUTABLE_BYTES = 4 * 1024 * 1024;
const WINDOWS_EPOCH_TICKS = 116444736000000000n;

const REQUEST_MAGIC = Buffer.from("MDCWREQ1", "ascii");
const RESPONSE_MAGIC = Buffer.from("MDCWRES1", "ascii");
const WRITER_FILE = "material-designer-converter-writer.exe";
const WRITER_MANIFEST = "manifest.json";
const WRITER_VERSION = "1.0.0";

type WriterManifest = {
  bytes: number;
  file: typeof WRITER_FILE;
  protocolVersion: typeof PROTOCOL_VERSION;
  schemaVersion: 1;
  sha256: string;
  sourceSha256: string;
  version: typeof WRITER_VERSION;
};

type NativeIdentity = {
  fileId: Buffer;
  lastWrite: bigint;
  volume: bigint;
};

type NativeResponse = {
  code: number;
  fileId: Buffer;
  lastWrite: bigint;
  message: string;
  size: bigint;
  type: number;
  volume: bigint;
};

type WriterRuntime = {
  executablePath: string;
  manifest: WriterManifest;
};

export type WindowsWriterAtomicOptions = {
  afterOpen?: () => Promise<void>;
  deadlineMs?: number;
  expectedDestination?: DestinationSnapshot;
  expectedParentIdentity?: string;
  maxBytes: number;
  replace?: boolean;
  signal?: AbortSignal;
};

export type WindowsDestinationInspection = {
  parentIdentity: string;
  snapshot: DestinationSnapshot;
};

class BoundedBinaryReader {
  readonly #input: Readable;
  readonly #iterator: AsyncIterator<unknown>;
  #buffer = Buffer.alloc(0);

  constructor(input: Readable) {
    this.#input = input;
    this.#iterator = input[Symbol.asyncIterator]();
  }

  async readExactly(length: number): Promise<Buffer> {
    if (!Number.isSafeInteger(length) || length < 0 || length > MAX_RESPONSE_MESSAGE_BYTES + RESPONSE_BYTES) {
      throw new Error("The converter writer returned an invalid response length.");
    }
    while (this.#buffer.byteLength < length) {
      const next = await this.#iterator.next();
      if (next.done) throw new Error("The converter writer exited before completing its response.");
      const chunk = Buffer.isBuffer(next.value) ? next.value : Buffer.from(next.value as Uint8Array);
      if (chunk.byteLength === 0) continue;
      this.#buffer = this.#buffer.byteLength === 0 ? chunk : Buffer.concat([this.#buffer, chunk]);
      if (this.#buffer.byteLength > RESPONSE_BYTES + MAX_RESPONSE_MESSAGE_BYTES) {
        throw new Error("The converter writer response exceeded its bound.");
      }
    }
    const output = this.#buffer.subarray(0, length);
    this.#buffer = this.#buffer.subarray(length);
    return output;
  }

  destroy(): void {
    this.#input.destroy();
  }
}

function assertWriterManifest(raw: unknown): WriterManifest {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("The converter writer manifest is invalid.");
  const value = raw as Record<string, unknown>;
  if (value.schemaVersion !== 1 || value.protocolVersion !== PROTOCOL_VERSION || value.file !== WRITER_FILE || value.version !== WRITER_VERSION
      || typeof value.bytes !== "number" || !Number.isSafeInteger(value.bytes) || value.bytes < 1024 || value.bytes > MAX_EXECUTABLE_BYTES
      || typeof value.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(value.sha256)
      || typeof value.sourceSha256 !== "string" || !/^[0-9a-f]{64}$/.test(value.sourceSha256)) {
    throw new Error("The converter writer manifest is outside its fixed provenance contract.");
  }
  return value as WriterManifest;
}

function assertPortableExecutable(bytes: Uint8Array): void {
  if (bytes.byteLength < 1024 || bytes.byteLength > MAX_EXECUTABLE_BYTES || bytes[0] !== 0x4d || bytes[1] !== 0x5a) {
    throw new Error("The converter writer is not a bounded PE executable.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const peOffset = view.getUint32(0x3c, true);
  if (peOffset < 0x40 || peOffset + 6 >= bytes.byteLength
      || bytes[peOffset] !== 0x50 || bytes[peOffset + 1] !== 0x45 || bytes[peOffset + 2] !== 0 || bytes[peOffset + 3] !== 0
      || view.getUint16(peOffset + 4, true) !== 0x8664) {
    throw new Error("The converter writer is not an x64 PE executable.");
  }
}

function defaultResourceRoot(): string {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  if (typeof resourcesPath !== "string" || !isAbsolute(resourcesPath)) {
    throw new Error("The packaged converter writer resource root is unavailable.");
  }
  return join(resourcesPath, "open-design");
}

async function validateWriterRuntime(resourceRootInput?: string): Promise<WriterRuntime> {
  const resourceRoot = resolve(resourceRootInput ?? defaultResourceRoot());
  if (!isAbsolute(resourceRoot) || resourceRoot.includes("\0")) throw new Error("The converter writer resource root is invalid.");
  const root = join(resourceRoot, "bin", "converter-writer");
  const manifestPath = join(root, WRITER_MANIFEST);
  const manifestOpened = await openStableFile(manifestPath);
  let manifest: WriterManifest;
  try {
    if (manifestOpened.snapshot.size > 16 * 1024) throw new Error("The converter writer manifest exceeds its bound.");
    manifest = assertWriterManifest(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(await manifestOpened.handle.readFile())));
  } finally {
    await manifestOpened.handle.close();
  }
  const executablePath = join(root, manifest.file);
  const executableOpened = await openStableFile(executablePath);
  try {
    if (executableOpened.snapshot.size !== manifest.bytes) throw new Error("The converter writer size does not match its packaged manifest.");
    const bytes = await executableOpened.handle.readFile();
    assertPortableExecutable(bytes);
    if (createHash("sha256").update(bytes).digest("hex") !== manifest.sha256) {
      throw new Error("The converter writer digest does not match its packaged manifest.");
    }
  } finally {
    await executableOpened.handle.close();
  }
  return { executablePath, manifest };
}

function parseNativeIdentity(identity: string | undefined, includeLastWrite: boolean): NativeIdentity | undefined {
  if (identity == null) return undefined;
  const match = includeLastWrite
    ? /^win:([0-9a-f]{16}):([0-9a-f]{32}):([0-9a-f]{16})$/.exec(identity)
    : /^win:([0-9a-f]{16}):([0-9a-f]{32})$/.exec(identity);
  if (!match) throw new Error("The converter writer received an invalid native identity witness.");
  return {
    volume: BigInt(`0x${match[1]}`),
    fileId: Buffer.from(match[2]!, "hex"),
    lastWrite: includeLastWrite ? BigInt(`0x${match[3]}`) : 0n,
  };
}

function parentIdentity(response: Pick<NativeResponse, "fileId" | "volume">): string {
  return `win:${response.volume.toString(16).padStart(16, "0")}:${response.fileId.toString("hex")}`;
}

function parentIdentityFromMessage(message: string): string {
  const match = /^parent:([0-9a-f]{16}):([0-9a-f]{32})$/.exec(message);
  if (!match) throw new Error("The converter writer omitted the opened parent identity.");
  return `win:${match[1]}:${match[2]}`;
}

function destinationSnapshot(response: NativeResponse): DestinationSnapshot {
  if (response.code === 0) return { exists: false, size: 0, mtimeMs: 0 };
  const ticks = BigInt.asUintN(64, response.lastWrite);
  return {
    exists: true,
    size: Number(response.size),
    mtimeMs: Number((ticks - WINDOWS_EPOCH_TICKS) / 10_000n),
    identity: `${parentIdentity(response)}:${ticks.toString(16).padStart(16, "0")}`,
  };
}

function encodeRequest(input: {
  deadlineMs: number;
  expectedDestination?: DestinationSnapshot;
  expectedParentIdentity?: string;
  maxBytes: number;
  name?: string;
  operation: number;
  parentPath: string;
  replace?: boolean;
}): Buffer {
  const parent = Buffer.from(input.parentPath, "utf8");
  const name = Buffer.from(input.name ?? "", "utf8");
  if (parent.byteLength < 1 || parent.byteLength > 32 * 1024 || name.byteLength > 1024) throw new Error("The converter writer request names exceed their bounds.");
  if (!Number.isSafeInteger(input.maxBytes) || input.maxBytes < 0 || input.maxBytes > 512 * 1024 * 1024) throw new Error("The converter writer byte limit is invalid.");
  if (!Number.isSafeInteger(input.deadlineMs) || input.deadlineMs < 100 || input.deadlineMs > 120_000) throw new Error("The converter writer deadline is invalid.");
  const parentWitness = parseNativeIdentity(input.expectedParentIdentity, false);
  const destinationWitness = input.expectedDestination?.exists ? parseNativeIdentity(input.expectedDestination.identity, true) : undefined;
  let flags = 0;
  if (parentWitness) flags |= FLAG_EXPECTED_PARENT;
  if (destinationWitness) flags |= FLAG_EXPECTED_CHILD;
  if (input.replace) flags |= FLAG_REPLACE;
  if (input.replace && (!destinationWitness || input.expectedDestination?.exists !== true)) {
    throw new Error("Authorized replacement requires the exact native destination witness.");
  }
  const header = Buffer.alloc(REQUEST_BYTES);
  REQUEST_MAGIC.copy(header, 0);
  header.writeUInt32LE(PROTOCOL_VERSION, 8);
  header.writeUInt32LE(input.operation, 12);
  header.writeUInt32LE(flags, 16);
  header.writeUInt32LE(parent.byteLength, 20);
  header.writeUInt32LE(name.byteLength, 24);
  header.writeUInt32LE(input.deadlineMs, 28);
  header.writeBigUInt64LE(BigInt(input.maxBytes), 32);
  if (parentWitness) {
    header.writeBigUInt64LE(parentWitness.volume, 40);
    parentWitness.fileId.copy(header, 48);
  }
  if (destinationWitness && input.expectedDestination) {
    header.writeBigUInt64LE(destinationWitness.volume, 64);
    destinationWitness.fileId.copy(header, 72);
    header.writeBigUInt64LE(BigInt(input.expectedDestination.size), 88);
    header.writeBigInt64LE(BigInt.asIntN(64, destinationWitness.lastWrite), 96);
  }
  return Buffer.concat([header, parent, name]);
}

async function writeStream(output: Writable, bytes: Uint8Array): Promise<void> {
  if (!output.write(bytes)) await once(output, "drain");
}

async function readResponse(reader: BoundedBinaryReader): Promise<NativeResponse> {
  const header = await reader.readExactly(RESPONSE_BYTES);
  if (!header.subarray(0, RESPONSE_MAGIC.byteLength).equals(RESPONSE_MAGIC) || header.readUInt32LE(8) !== PROTOCOL_VERSION) {
    throw new Error("The converter writer returned an unknown protocol response.");
  }
  const messageBytes = header.readUInt32LE(20);
  if (messageBytes > MAX_RESPONSE_MESSAGE_BYTES) throw new Error("The converter writer response message exceeded its bound.");
  const message = messageBytes === 0 ? "" : new TextDecoder("utf-8", { fatal: true }).decode(await reader.readExactly(messageBytes));
  return {
    type: header.readUInt32LE(12),
    code: header.readUInt32LE(16),
    message,
    volume: header.readBigUInt64LE(24),
    fileId: Buffer.from(header.subarray(32, 48)),
    size: header.readBigUInt64LE(48),
    lastWrite: header.readBigInt64LE(56),
  };
}

function responseError(response: NativeResponse): Error {
  const reason = response.message || `The converter writer failed with code ${response.code}.`;
  return new Error(reason);
}

async function waitForExit(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode != null) return;
  await once(child, "exit");
}

async function stopWriterProcess(
  child: ChildProcessWithoutNullStreams,
  stage: "request" | "opened" | "streaming" | "complete",
): Promise<void> {
  if (child.exitCode != null) return;
  try {
    if (stage === "opened") await writeStream(child.stdin, Uint8Array.of(ACTION_CANCEL));
    else if (stage === "streaming") {
      const cancel = Buffer.alloc(4);
      cancel.writeUInt32LE(CANCEL_CHUNK);
      await writeStream(child.stdin, cancel);
    } else if (stage === "request") child.kill();
  } catch {
    child.kill();
  }
  child.stdin.end();
  await Promise.race([
    waitForExit(child),
    new Promise<void>((resolveDelay) => setTimeout(resolveDelay, 500)),
  ]);
  if (child.exitCode == null) {
    child.kill();
    await waitForExit(child).catch(() => undefined);
  }
}

export class WindowsNativeConverterWriter {
  readonly #resourceRoot?: string;
  #runtime?: Promise<WriterRuntime>;

  constructor(resourceRoot?: string) {
    this.#resourceRoot = resourceRoot;
  }

  #validatedRuntime(): Promise<WriterRuntime> {
    this.#runtime ??= validateWriterRuntime(this.#resourceRoot);
    return this.#runtime;
  }

  async #start(): Promise<{ child: ChildProcessWithoutNullStreams; reader: BoundedBinaryReader }> {
    if (process.platform !== "win32") throw new Error("The Windows converter writer is unavailable on this platform.");
    const runtime = await this.#validatedRuntime();
    const child = spawn(runtime.executablePath, [], {
      cwd: dirname(runtime.executablePath),
      env: {},
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    await Promise.race([
      once(child, "spawn"),
      once(child, "error").then(([error]) => { throw error; }),
    ]);
    return { child, reader: new BoundedBinaryReader(child.stdout) };
  }

  async inspectParent(parentPath: string, deadlineMs = 10_000): Promise<string> {
    const parent = resolve(parentPath);
    const { child, reader } = await this.#start();
    const request = encodeRequest({ deadlineMs, maxBytes: 0, operation: OPERATION_INSPECT_PARENT, parentPath: parent });
    try {
      await writeStream(child.stdin, request);
      child.stdin.end();
      const response = await readResponse(reader);
      if (response.type !== RESPONSE_RESULT || response.code !== 1) throw responseError(response);
      return parentIdentity(response);
    } finally {
      await waitForExit(child).catch(() => child.kill());
      reader.destroy();
    }
  }

  async inspectDestination(path: string, deadlineMs = 10_000): Promise<WindowsDestinationInspection> {
    const destination = resolve(path);
    const { child, reader } = await this.#start();
    const request = encodeRequest({
      deadlineMs,
      maxBytes: 0,
      name: basename(destination),
      operation: OPERATION_INSPECT_CHILD,
      parentPath: dirname(destination),
    });
    try {
      await writeStream(child.stdin, request);
      child.stdin.end();
      const response = await readResponse(reader);
      if (response.type !== RESPONSE_RESULT || (response.code !== 0 && response.code !== 1)) throw responseError(response);
      return { parentIdentity: parentIdentityFromMessage(response.message), snapshot: destinationSnapshot(response) };
    } finally {
      await waitForExit(child).catch(() => child.kill());
      reader.destroy();
    }
  }


  async inspectChild(path: string, deadlineMs = 10_000): Promise<DestinationSnapshot> {
    return (await this.inspectDestination(path, deadlineMs)).snapshot;
  }

  async writeAtomic(path: string, chunks: AsyncIterable<Uint8Array> | Iterable<Uint8Array>, options: WindowsWriterAtomicOptions): Promise<DestinationSnapshot> {
    const destination = resolve(path);
    const deadlineMs = options.deadlineMs ?? 30_000;
    const { child, reader } = await this.#start();
    let stage: "request" | "opened" | "streaming" | "complete" = "request";
    let cancelled = false;
    let cancelFrameSent = false;
    const sendCancel = async () => {
      if (cancelFrameSent) return;
      cancelFrameSent = true;
      if (stage === "opened") await writeStream(child.stdin, Uint8Array.of(ACTION_CANCEL));
      else if (stage === "streaming") {
        const frame = Buffer.alloc(4);
        frame.writeUInt32LE(CANCEL_CHUNK);
        await writeStream(child.stdin, frame);
      } else if (stage === "request") child.kill();
    };
    const cancel = () => {
      cancelled = true;
      void sendCancel().catch(() => child.kill());
    };
    options.signal?.addEventListener("abort", cancel, { once: true });
    let forceKillTimer: ReturnType<typeof setTimeout> | undefined;
    const hardTimer = setTimeout(() => {
      cancelled = true;
      void sendCancel().catch(() => undefined).finally(() => {
        forceKillTimer = setTimeout(() => child.kill(), 500);
        forceKillTimer.unref();
      });
    }, deadlineMs + 100);
    hardTimer.unref();
    try {
      const request = encodeRequest({
        deadlineMs,
        expectedDestination: options.expectedDestination,
        expectedParentIdentity: options.expectedParentIdentity,
        maxBytes: options.maxBytes,
        name: basename(destination),
        operation: OPERATION_WRITE,
        parentPath: dirname(destination),
        replace: options.replace,
      });
      await writeStream(child.stdin, request);
      const opened = await readResponse(reader);
      if (opened.type !== RESPONSE_OPENED) throw responseError(opened);
      stage = "opened";
      if (cancelled || options.signal?.aborted) {
        await sendCancel();
      } else {
        await options.afterOpen?.();
        if (options.signal?.aborted) await sendCancel();
        else {
          await writeStream(child.stdin, Uint8Array.of(ACTION_CONTINUE));
          stage = "streaming";
          let total = 0;
          for await (const input of chunks) {
            if (!(input instanceof Uint8Array)) throw new Error("The converter writer accepts byte chunks only.");
            for (let offset = 0; offset < input.byteLength; offset += MAX_CHUNK_BYTES) {
              if (options.signal?.aborted) {
                cancel();
                break;
              }
              const chunk = input.subarray(offset, Math.min(input.byteLength, offset + MAX_CHUNK_BYTES));
              total += chunk.byteLength;
              if (total > options.maxBytes) throw new Error("The converter writer stream exceeded its bounded byte limit.");
              const frame = Buffer.alloc(4);
              frame.writeUInt32LE(chunk.byteLength);
              await writeStream(child.stdin, frame);
              await writeStream(child.stdin, chunk);
            }
            if (options.signal?.aborted) break;
          }
          if (!options.signal?.aborted) {
            const end = Buffer.alloc(4);
            end.writeUInt32LE(0);
            await writeStream(child.stdin, end);
          }
        }
      }
      const response = await readResponse(reader);
      stage = "complete";
      child.stdin.end();
      if (response.type === RESPONSE_CANCELLED || cancelled || options.signal?.aborted) throw new Error("Conversion was cancelled.");
      if (response.type !== RESPONSE_RESULT || response.code !== 1) throw responseError(response);
      return destinationSnapshot(response);
    } finally {
      clearTimeout(hardTimer);
      if (forceKillTimer !== undefined) clearTimeout(forceKillTimer);
      options.signal?.removeEventListener("abort", cancel);
      await stopWriterProcess(child, stage).catch(() => child.kill());
      reader.destroy();
    }
  }
}

export async function* singleWindowsWriterChunk(bytes: Uint8Array): AsyncGenerator<Uint8Array> {
  yield bytes;
}

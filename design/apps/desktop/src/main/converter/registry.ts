import { createHash } from "node:crypto";
import type { ByteProgress, ConverterAdapter, ConverterCategory, OutputValidation, PackagedAdapterProof } from "./types.js";

const utf8 = new TextEncoder();

function validateText(bytes: Uint8Array, format: string): OutputValidation {
  const ok = format === "txt" || format === "md" || format === "markdown" || format === "html" || format === "json" || format === "jsonl" || format === "csv" || format === "tsv" || format === "yaml" || format === "toml" || format === "xml" || format === "js" || format === "ts";
  return { ok, format, bytes: bytes.length, reason: ok ? undefined : "The output format is not a supported text target." };
}

function validatePdf(bytes: Uint8Array, format: string): OutputValidation {
  const ok = format === "pdf" && new TextDecoder("ascii").decode(bytes.subarray(0, 5)) === "%PDF-" && bytes.length >= 16 && new TextDecoder("ascii").decode(bytes.subarray(-6)).includes("%%EOF");
  return { ok, format, bytes: bytes.length, reason: ok ? undefined : "The output is not a complete PDF with a header and EOF marker." };
}

function validatePassthrough(bytes: Uint8Array, format: string): OutputValidation {
  return { ok: bytes.length > 0, format, bytes: bytes.length, reason: bytes.length > 0 ? undefined : "The output is empty." };
}

async function textConvert(input: Uint8Array, targetFormat: string, options?: Record<string, unknown>, onProgress?: (progress: ByteProgress) => void): Promise<Uint8Array> {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(input);
  onProgress?.({ bytesProcessed: input.length, totalBytes: input.length });
  const sourceFormat = typeof options?.sourceFormat === "string" ? options.sourceFormat : "unknown";
  if ((targetFormat === "js" || targetFormat === "ts") && sourceFormat !== targetFormat) {
    throw new Error(`The ${targetFormat} target requires a source already identified as ${targetFormat}; no extension-only relabelling is performed.`);
  }
  if (targetFormat === "json") {
    const value: unknown = sourceFormat === "txt" || sourceFormat === "md" || sourceFormat === "markdown" ? text : JSON.parse(text);
    return utf8.encode(`${JSON.stringify(value, null, 2)}\n`);
  }
  if (targetFormat === "jsonl") {
    const rows = sourceFormat === "jsonl"
      ? text.split(/\r?\n/).filter((line) => line.trim().length > 0).map((line) => JSON.parse(line))
      : sourceFormat === "json" ? [JSON.parse(text)] : [text];
    return utf8.encode(`${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
  }
  if (targetFormat === "html") {
    const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return utf8.encode(`<pre>${escaped}</pre>\n`);
  }
  if (targetFormat === "txt") return utf8.encode(text);
  if (targetFormat === "md" || targetFormat === "markdown") return utf8.encode(text);
  return utf8.encode(text);
}

const textFormats = ["txt", "md", "markdown", "json", "jsonl", "csv", "tsv", "yaml", "toml", "xml", "html", "js", "ts"] as const;
const textTargets = ["txt", "md", "markdown", "html"] as const;

export const CONVERTER_ADAPTERS: readonly ConverterAdapter[] = [
  {
    id: "structured-data-local",
    category: "structured-data",
    label: "Structured data and spreadsheet adapter",
    sourceFormats: ["json", "jsonl", "csv", "tsv", "yaml", "toml", "xml"],
    targetFormats: ["txt"],
    sourceSignatures: ["UTF-8 text", "JSON", "CSV/TSV"],
    bundled: false,
    unavailableReason: "Awaiting verified packaged adapter proof.",
    capabilities: { inspect: true, convert: false, preview: false, batch: false, lossless: true, metadata: false, encoding: "UTF-8", incrementalProgress: true },
    bounds: { maxInputBytes: 32 * 1024 * 1024, maxOutputBytes: 64 * 1024 * 1024, maxCpuMs: 10_000, maxMemoryBytes: 128 * 1024 * 1024, maxItems: 100_000, maxRecursionDepth: 64 },
    sandbox: "in-process-bounded",
    validateOutput: validateText,
    convert: textConvert,
  },
  {
    id: "text-structured-local",
    category: "code-text",
    label: "Code and text document adapter",
    sourceFormats: textFormats,
    targetFormats: textTargets,
    sourceSignatures: ["UTF-8 text", "JSON", "CSV/TSV"],
    bundled: false,
    unavailableReason: "Awaiting verified packaged adapter proof.",
    capabilities: { inspect: true, convert: false, preview: false, batch: false, lossless: true, metadata: false, encoding: "UTF-8", incrementalProgress: true },
    bounds: { maxInputBytes: 32 * 1024 * 1024, maxOutputBytes: 64 * 1024 * 1024, maxCpuMs: 10_000, maxMemoryBytes: 128 * 1024 * 1024, maxItems: 100_000, maxRecursionDepth: 64 },
    sandbox: "in-process-bounded",
    validateOutput: validateText,
    convert: textConvert,
  },
  {
    id: "pdf-local-bounded",
    category: "documents-pdf",
    label: "PDF document adapter",
    sourceFormats: ["pdf"],
    targetFormats: [],
    sourceSignatures: ["%PDF-"],
    bundled: false,
    unavailableReason: "Content-preserving PDF rewrite is not bundled in this build; inspect is available, edits remain disabled.",
    capabilities: { inspect: false, convert: false, preview: false, batch: false, lossless: false, metadata: true, encoding: "PDF object inspection only", incrementalProgress: false },
    bounds: { maxInputBytes: 256 * 1024 * 1024, maxOutputBytes: 512 * 1024 * 1024, maxCpuMs: 30_000, maxMemoryBytes: 256 * 1024 * 1024, maxItems: 10_000, maxRecursionDepth: 64 },
    sandbox: "in-process-bounded",
    validateOutput: validatePdf,
  },
  {
    id: "binary-inspector-local",
    category: "binary-encodings",
    label: "Binary inspection adapter",
    sourceFormats: ["png", "jpeg", "gif", "webp", "zip", "gz", "mp3", "ogg", "flac", "mp4"],
    targetFormats: ["hex", "base64"],
    sourceSignatures: ["PNG", "JPEG", "GIF", "WebP", "ZIP", "GZIP", "MP3", "Ogg", "FLAC", "ISO BMFF"],
    bundled: false,
    unavailableReason: "Awaiting verified packaged adapter proof.",
    capabilities: { inspect: true, convert: false, preview: false, batch: false, lossless: true, metadata: false, encoding: "binary", incrementalProgress: true },
    bounds: { maxInputBytes: 32 * 1024 * 1024, maxOutputBytes: 64 * 1024 * 1024, maxCpuMs: 10_000, maxMemoryBytes: 128 * 1024 * 1024, maxItems: 100_000, maxRecursionDepth: 8 },
    sandbox: "in-process-bounded",
    validateOutput: validatePassthrough,
    convert: async (input, targetFormat) => targetFormat === "hex" ? utf8.encode(Buffer.from(input).toString("hex")) : utf8.encode(Buffer.from(input).toString("base64")),
  },
];

const UNAVAILABLE_INPUT: readonly [string, ConverterCategory, string, readonly string[], readonly string[], string][] = [
  ["image-pixel-adapter", "images", "Image conversion adapter", ["png", "jpeg", "webp"], ["png", "jpeg", "webp"], "Bundled pixel codec is not present in this build."],
  ["audio-transcode-adapter", "audio", "Audio conversion adapter", ["mp3", "wav", "flac"], ["mp3", "wav", "flac"], "Bundled audio codec is not present in this build."],
  ["video-transcode-adapter", "video", "Video conversion adapter", ["mp4", "webm", "mov"], ["mp4", "webm"], "Bundled video codec is not present in this build."],
  ["archive-adapter", "archives", "Archive conversion adapter", ["zip", "7z", "tar"], ["zip", "7z"], "Bundled archive codec is not present in this build."],
];
const UNAVAILABLE: readonly ConverterAdapter[] = UNAVAILABLE_INPUT.map(([id, category, label, sourceFormats, targetFormats, reason]) => ({
  id: id as string,
  category: category as ConverterCategory,
  label: label as string,
  sourceFormats: sourceFormats as string[], targetFormats: targetFormats as string[], sourceSignatures: [], bundled: false,
  unavailableReason: reason as string,
  capabilities: { inspect: false, convert: false, preview: false, batch: false, lossless: false, metadata: false, encoding: "unavailable", incrementalProgress: false },
  bounds: { maxInputBytes: 0, maxOutputBytes: 0, maxCpuMs: 0, maxMemoryBytes: 0, maxItems: 0, maxRecursionDepth: 0 }, sandbox: "unavailable" as const,
  validateOutput: (bytes: Uint8Array, format: string) => ({ ok: false, format, bytes: bytes.length, reason }),
}));

function addSourceProof(adapter: ConverterAdapter): ConverterAdapter {
  return { ...adapter, packageProof: { kind: "source-contract", path: "apps/desktop/src/main/converter", version: "1", digest: adapterFingerprint(adapter) } };
}

export const ADAPTER_CATALOG: readonly ConverterAdapter[] = [...CONVERTER_ADAPTERS, ...UNAVAILABLE].map(addSourceProof);

export function withPackagedProof(adapter: ConverterAdapter, proof: PackagedAdapterProof): ConverterAdapter {
  if (proof.kind !== "packaged" || !proof.path || !proof.version || !/^[0-9a-f]{64}$/i.test(proof.digest)) {
    throw new Error("Packaged converter proof is incomplete or has an invalid digest.");
  }
  if (!adapter.convert || adapter.category === "documents-pdf") {
    return { ...adapter, packageProof: proof };
  }
  return {
    ...adapter,
    bundled: true,
    unavailableReason: undefined,
    capabilities: { ...adapter.capabilities, convert: true, preview: true, batch: true },
    packageProof: proof,
  };
}

export function adapterFor(id: string, catalog: readonly ConverterAdapter[] = ADAPTER_CATALOG): ConverterAdapter | undefined {
  return catalog.find((adapter) => adapter.id === id);
}
export function adaptersForCategory(category: ConverterCategory, catalog: readonly ConverterAdapter[] = ADAPTER_CATALOG): readonly ConverterAdapter[] {
  return catalog.filter((adapter) => adapter.category === category);
}
export function adapterFingerprint(adapter: ConverterAdapter): string { return createHash("sha256").update(JSON.stringify({ id: adapter.id, sourceFormats: adapter.sourceFormats, targetFormats: adapter.targetFormats, bundled: adapter.bundled, incrementalProgress: adapter.capabilities.incrementalProgress, bounds: adapter.bounds })).digest("hex"); }

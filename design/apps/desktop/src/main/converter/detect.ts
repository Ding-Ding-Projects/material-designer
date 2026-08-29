import type { ConverterCategory, DetectedSource } from "./types.js";

const TEXT_EXTENSIONS: ReadonlyMap<string, string> = new Map([
  [".txt", "text/plain"], [".md", "text/markdown"], [".markdown", "text/markdown"],
  [".json", "application/json"], [".jsonl", "application/x-ndjson"], [".ndjson", "application/x-ndjson"],
  [".csv", "text/csv"], [".tsv", "text/tab-separated-values"], [".yaml", "application/yaml"],
  [".yml", "application/yaml"], [".toml", "application/toml"], [".xml", "application/xml"],
  [".html", "text/html"], [".htm", "text/html"], [".js", "text/javascript"], [".ts", "text/typescript"],
]);

function ext(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot < 0 ? "" : path.slice(dot).toLowerCase();
}

function categoryFor(format: string): ConverterCategory {
  if (format === "pdf") return "documents-pdf";
  if (["png", "jpeg", "gif", "webp", "bmp", "tiff"].includes(format)) return "images";
  if (["mp3", "wav", "flac", "ogg"].includes(format)) return "audio";
  if (["mp4", "webm", "mov", "mkv"].includes(format)) return "video";
  if (["zip", "7z", "tar", "gz"].includes(format)) return "archives";
  if (["json", "jsonl", "csv", "tsv", "yaml", "toml", "xml"].includes(format)) return "structured-data";
  if (["txt", "md", "markdown", "html", "js", "ts"].includes(format)) return "code-text";
  return "binary-encodings";
}

function signatureFormat(bytes: Uint8Array): { format: string; mime?: string } | undefined {
  const starts = (values: number[]) => values.every((value, index) => bytes[index] === value);
  if (starts([0x25, 0x50, 0x44, 0x46])) return { format: "pdf", mime: "application/pdf" };
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { format: "png", mime: "image/png" };
  if (starts([0xff, 0xd8, 0xff])) return { format: "jpeg", mime: "image/jpeg" };
  if (starts([0x47, 0x49, 0x46, 0x38])) return { format: "gif", mime: "image/gif" };
  if (starts([0x52, 0x49, 0x46, 0x46]) && bytes.slice(8, 12).every((v, i) => v === [0x57, 0x45, 0x42, 0x50][i])) return { format: "webp", mime: "image/webp" };
  if (starts([0x50, 0x4b, 0x03, 0x04]) || starts([0x50, 0x4b, 0x05, 0x06])) return { format: "zip", mime: "application/zip" };
  if (starts([0x1f, 0x8b])) return { format: "gz", mime: "application/gzip" };
  if (starts([0x49, 0x44, 0x33])) return { format: "mp3", mime: "audio/mpeg" };
  if (starts([0x4f, 0x67, 0x67, 0x53])) return { format: "ogg", mime: "audio/ogg" };
  if (starts([0x66, 0x4c, 0x61, 0x43])) return { format: "flac", mime: "audio/flac" };
  if (starts([0x00, 0x00, 0x00]) && bytes.length > 8 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) return { format: "mp4", mime: "video/mp4" };
  return undefined;
}

function isText(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, Math.min(bytes.length, 8192));
  if (sample.length === 0 || sample.includes(0)) return false;
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(sample);
  } catch {
    return false;
  }
  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint === 0 || (codePoint < 0x20 && codePoint !== 9 && codePoint !== 10 && codePoint !== 13) || codePoint === 0x7f) return false;
  }
  return true;
}

/** Detect by bytes first. The extension is only a hint for text formats. */
export function detectSource(bytes: Uint8Array, pathHint = ""): DetectedSource {
  const signed = signatureFormat(bytes);
  if (signed) return { format: signed.format, category: categoryFor(signed.format), mime: signed.mime, bytes: bytes.length, confidence: "signature" };
  const extension = ext(pathHint);
  const mime = TEXT_EXTENSIONS.get(extension);
  const format = extension.slice(1);
  if (mime && isText(bytes)) return { format, category: categoryFor(format), mime, bytes: bytes.length, confidence: "text-heuristic" };
  return { format: "unknown", category: "binary-encodings", bytes: bytes.length, confidence: "unknown" };
}

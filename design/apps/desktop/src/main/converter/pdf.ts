import { MAX_PDF_PAGES, MAX_SOURCE_BYTES } from "./types.js";

export interface PdfPage { index: number; }
export interface PdfMetadata { title?: string; author?: string; subject?: string; creator?: string; }
export interface PdfDocument { pages: PdfPage[]; metadata: PdfMetadata; encrypted: boolean; signed: boolean; sourceBytes: number; pageCountMode: "heuristic"; }

const PDF_SCAN_CHUNK_BYTES = 64 * 1024;
const PDF_TOKEN_WINDOW = 1024;

function ascii(bytes: Uint8Array): string { return new TextDecoder("latin1").decode(bytes); }

/** Bounded inspection only. No synthetic PDF writer is shipped. */
export function inspectPdf(bytes: Uint8Array): PdfDocument {
  if (bytes.length > MAX_SOURCE_BYTES) throw new Error("PDF exceeds the bounded converter input size.");
  if (ascii(bytes.subarray(0, 5)) !== "%PDF-") throw new Error("The source is not a PDF signature.");
  let encrypted = false;
  let signed = false;
  let sawEof = false;
  let count = 0;
  let title: string | undefined;
  let author: string | undefined;
  let carry = "";
  for (let offset = 0; offset < bytes.length; offset += PDF_SCAN_CHUNK_BYTES) {
    const combined = carry + ascii(bytes.subarray(offset, Math.min(bytes.length, offset + PDF_SCAN_CHUNK_BYTES)));
    const boundary = carry.length;
    const eofIndex = combined.indexOf("%%EOF", Math.max(0, boundary - 4));
    if (eofIndex >= 0 && eofIndex + 5 > boundary) sawEof = true;
    if (!encrypted && /\/Encrypt\b/.test(combined.slice(Math.max(0, boundary - 16)))) encrypted = true;
    if (!signed && (/\/ByteRange\s*\[/.test(combined.slice(Math.max(0, boundary - 32))) || /\/Type\s*\/Sig\b/.test(combined.slice(Math.max(0, boundary - 24))))) signed = true;
    for (const match of combined.matchAll(/\/Type\s*\/Page(?!s)\b/g)) {
      if ((match.index ?? 0) + match[0].length <= boundary) continue;
      count += 1;
      if (count > MAX_PDF_PAGES) throw new Error("The PDF contains more pages than the bounded converter limit.");
    }
    if (title === undefined) {
      const match = /\/Title\s*\(([^)]{0,512})\)/.exec(combined);
      if (match && (match.index ?? 0) + match[0].length > boundary) title = match[1];
    }
    if (author === undefined) {
      const match = /\/Author\s*\(([^)]{0,512})\)/.exec(combined);
      if (match && (match.index ?? 0) + match[0].length > boundary) author = match[1];
    }
    carry = combined.slice(-PDF_TOKEN_WINDOW);
  }
  if (!sawEof) throw new Error("The PDF has no complete EOF marker.");
  if (encrypted) throw new Error("Encrypted PDFs require user-supplied access and are not handled by this offline adapter.");
  if (signed) throw new Error("Signed PDFs are not rewritten because any edit would invalidate the signature.");
  if (count === 0) throw new Error("The PDF contains no readable page objects.");
  return { pages: Array.from({ length: count }, (_, index) => ({ index })), metadata: { title, author }, encrypted, signed, sourceBytes: bytes.length, pageCountMode: "heuristic" };
}

import { MAX_SOURCE_BYTES } from "./types.js";

export interface PdfPage { index: number; }
export interface PdfMetadata { title?: string; author?: string; subject?: string; creator?: string; }
export interface PdfDocument { pages: PdfPage[]; metadata: PdfMetadata; encrypted: boolean; signed: boolean; sourceBytes: number; }

function ascii(bytes: Uint8Array): string { return new TextDecoder("latin1").decode(bytes); }

/** Bounded inspection only. No synthetic PDF writer is shipped. */
export function inspectPdf(bytes: Uint8Array): PdfDocument {
  if (bytes.length > MAX_SOURCE_BYTES) throw new Error("PDF exceeds the bounded converter input size.");
  const text = ascii(bytes);
  if (!text.startsWith("%PDF-")) throw new Error("The source is not a PDF signature.");
  if (!text.includes("%%EOF")) throw new Error("The PDF has no complete EOF marker.");
  const encrypted = /\/Encrypt\b/.test(text);
  const signed = /\/ByteRange\s*\[/.test(text) || /\/Type\s*\/Sig\b/.test(text);
  if (encrypted) throw new Error("Encrypted PDFs require user-supplied access and are not handled by this offline adapter.");
  if (signed) throw new Error("Signed PDFs are not rewritten because any edit would invalidate the signature.");
  const count = [...text.matchAll(/\/Type\s*\/Page(?!s)\b/g)].length;
  if (count === 0) throw new Error("The PDF contains no readable page objects.");
  return { pages: Array.from({ length: count }, (_, index) => ({ index })), metadata: { title: text.match(/\/Title\s*\(([^)]{0,512})\)/)?.[1], author: text.match(/\/Author\s*\(([^)]{0,512})\)/)?.[1] }, encrypted, signed, sourceBytes: bytes.length };
}

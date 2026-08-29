/**
 * Local file conversion contracts.  The renderer never receives arbitrary
 * paths or bytes: the host resolves and bounds inputs before this namespace is
 * called, and every adapter advertises the limits it enforces.
 */

export const CONVERTER_SCHEMA_VERSION = 1 as const;
export const MAX_SOURCE_BYTES = 256 * 1024 * 1024;
export const MAX_OUTPUT_BYTES = 512 * 1024 * 1024;
export const MAX_QUEUE_ITEMS = Number.MAX_SAFE_INTEGER;
export const MAX_PDF_PAGES = 10_000;
export const DISCLOSURE_TTL_MS = 5 * 60_000;

export type ConverterCategory =
  | "documents-pdf"
  | "images"
  | "audio"
  | "video"
  | "archives"
  | "structured-data"
  | "code-text"
  | "binary-encodings";

export const CONVERTER_CATEGORIES: readonly ConverterCategory[] = [
  "documents-pdf",
  "images",
  "audio",
  "video",
  "archives",
  "structured-data",
  "code-text",
  "binary-encodings",
];

export interface ResourceBounds {
  maxInputBytes: number;
  maxOutputBytes: number;
  maxCpuMs: number;
  maxMemoryBytes: number;
  maxItems: number;
  maxRecursionDepth: number;
}

export interface AdapterCapabilities {
  inspect: boolean;
  convert: boolean;
  preview: boolean;
  batch: boolean;
  lossless: boolean;
  metadata: boolean;
  encoding: string;
  /** Every enabled adapter must expose incremental source-byte progress. */
  incrementalProgress: boolean;
}

export interface ConverterAdapter {
  id: string;
  category: ConverterCategory;
  label: string;
  sourceFormats: readonly string[];
  targetFormats: readonly string[];
  sourceSignatures: readonly string[];
  bundled: boolean;
  unavailableReason?: string;
  capabilities: AdapterCapabilities;
  bounds: ResourceBounds;
  sandbox: "isolated-host" | "in-process-bounded" | "unavailable";
  packageProof?: { kind: "source-contract"; path: string; version: string; digest: string } | PackagedAdapterProof;
  /** Validate output bytes before the destination is promoted. */
  validateOutput: (bytes: Uint8Array, targetFormat: string) => OutputValidation;
  convert?: (input: Uint8Array, targetFormat: string, options?: Record<string, unknown>, onProgress?: (progress: ByteProgress) => void) => Promise<Uint8Array>;
}

declare const PACKAGED_PROOF_BRAND: unique symbol;
export type PackagedAdapterProof = {
  readonly kind: "packaged";
  readonly path: string;
  readonly version: string;
  readonly digest: string;
  readonly [PACKAGED_PROOF_BRAND]: true;
};

export interface PackagedAdapterManifest {
  adapterId: string;
  path: string;
  version: string;
  digest: string;
}

export interface DisclosureAcknowledgement {
  token: string;
  expiresAtMs: number;
  previewId: string;
  adapterId: string;
  targetFormat: string;
  sourcePath: string;
  sourceDigest: string;
  sourceSnapshot: DestinationSnapshot;
  destinationSnapshot: DestinationSnapshot;
  detectedFormat: string;
  optionsDigest: string;
}

export interface OpaqueDisclosureAcknowledgement {
  token: string;
  expiresAtMs: number;
  previewId: string;
}

export interface OutputValidation {
  ok: boolean;
  format: string;
  bytes: number;
  reason?: string;
}

export interface DetectedSource {
  format: string;
  category: ConverterCategory;
  mime?: string;
  bytes: number;
  confidence: "signature" | "text-heuristic" | "unknown";
  encrypted?: boolean;
}

export type ConversionOutcome =
  | { status: "converted"; source: string; destination: string; bytes: number; format: string }
  | { status: "skipped" | "cancelled" | "failed"; source: string; destination?: string; reason: string };

export interface ConversionPreview {
  previewId: string;
  sourcePath: string;
  source: DetectedSource;
  sourceDigest: string;
  sourceSnapshot: DestinationSnapshot;
  adapterId: string;
  targetFormat: string;
  lossy: boolean;
  disclosure: string;
  estimatedOutputBytes?: number;
  destination: string;
  /** Host-only native parent witness. Never crosses the renderer bridge. */
  destinationParentIdentity?: string;
  destinationSnapshot: DestinationSnapshot;
  optionsDigest: string;
  options?: Record<string, unknown>;
}

export interface QueueItem {
  id: string;
  adapterId: string;
  sourcePath: string;
  destinationPath: string;
  targetFormat: string;
  state: "queued" | "running" | "paused" | "converted" | "skipped" | "cancelled" | "failed";
  bytesProcessed: number;
  totalBytes?: number;
  bytesPerSecond?: number;
  etaSeconds?: number;
  updatedAt: number;
  reason?: string;
}

export interface QueuePage {
  items: QueueItem[];
  nextCursor?: string;
}

export interface ByteProgress {
  bytesProcessed: number;
  totalBytes: number;
  bytesPerSecond?: number;
  etaSeconds?: number;
}

export interface DestinationSnapshot {
  exists: boolean;
  size: number;
  mtimeMs: number;
  ctimeMs?: number;
  /** Stable host file identity used to detect replacement by another writer. */
  identity?: string;
}

export interface OverwriteRequest {
  sourcePath: string;
  destinationPath: string;
  adapterId: string;
  targetFormat: string;
}

export interface OverwriteChallenge {
  token: string;
  expiresAtMs: number;
  destination: DestinationSnapshot;
}

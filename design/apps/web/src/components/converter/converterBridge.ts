import { getOpenDesignHost } from '@open-design/host';

export const FILE_CONVERTER_ROUTE = '/file-converter' as const;
export const FILE_CONVERTER_SURFACE_ID = 'file-converter-surface' as const;

export type ConverterFailure = { ok: false; reason: string };

export type ConverterAdapter = {
  id: string;
  category: string;
  label: string;
  sourceFormats: readonly string[];
  targetFormats: readonly string[];
  bundled: boolean;
  unavailableReason?: string;
  capabilities: Readonly<Record<string, boolean | string>>;
  bounds: Readonly<Record<string, number>>;
  packageProof?: { kind: 'packaged'; path: string; version: string; digest: string };
};

export type ConverterFile = {
  handle: string;
  name: string;
  bytes: number;
  format: string;
  mime?: string;
  exists?: boolean;
};

export type ConverterPreview = {
  sourcePath?: string;
  source: { format: string; category: string; bytes: number; confidence: string; mime?: string };
  adapterId: string;
  targetFormat: string;
  lossy: boolean;
  disclosure: string;
  destinationHandle: string;
};

export type DisclosureAcknowledgement = {
  token: string;
  expiresAtMs: number;
  adapterId: string;
  targetFormat: string;
  sourcePath: string;
};

export type ConverterOverwriteChallenge = {
  ok: true;
  token: string;
  expiresAtMs: number;
  destination: { exists: boolean; size: number; mtimeMs: number };
};

export type ConverterNotification = {
  id: string;
  severity: 'info' | 'success' | 'progress' | 'warning' | 'error';
  title: string;
  body: string;
  createdAt: number;
  readAt?: number;
  dismissedAt?: number;
};

export type ConverterHistoryEvent = {
  id: string;
  action: 'created' | 'updated' | 'deleted' | 'restored' | 'imported' | 'settings-changed' | 'conversion';
  summary: string;
  createdAt: number;
  revision?: string;
};

export type ConverterPage<T> = { items: readonly T[]; nextCursor?: string };

export type ConverterResult =
  | { ok: true; status: 'converted'; bytes: number; format: string; destination: ConverterFile }
  | { ok: false; status: 'cancelled' | 'failed'; reason: string };

export type ConverterPdfResult =
  | { ok: true; operation: string; pages?: number; metadata?: Readonly<Record<string, string | undefined>>; destination?: ConverterFile }
  | ConverterFailure;

export type ConverterQueueItem = {
  id: string;
  sourceName: string;
  destinationName: string;
  targetFormat: string;
  state: 'queued' | 'running' | 'paused' | 'converted' | 'skipped' | 'cancelled' | 'failed';
  bytesProcessed: number;
  totalBytes?: number;
  bytesPerSecond?: number;
  etaSeconds?: number;
  reason?: string;
  updatedAt: number;
};

export type ConverterBridge = {
  catalog(): Promise<readonly ConverterAdapter[]>;
  pickSource(): Promise<ConverterFile | { ok: false; canceled: true } | ConverterFailure>;
  pickSources(): Promise<readonly ConverterFile[] | { ok: false; canceled: true } | ConverterFailure>;
  pickDestination(suggestedName?: string): Promise<ConverterFile | { ok: false; canceled: true } | ConverterFailure>;
  preview(sourceHandle: string, destinationHandle: string, adapterId: string, targetFormat: string): Promise<ConverterPreview | ConverterFailure>;
  acknowledgeDisclosure(preview: ConverterPreview): Promise<DisclosureAcknowledgement | ConverterFailure>;
  convert(sourceHandle: string, destinationHandle: string, adapterId: string, targetFormat: string, acknowledgementToken?: string, options?: Record<string, unknown>): Promise<ConverterResult>;
  requestOverwrite(sourceHandle: string, destinationHandle: string, adapterId: string, targetFormat: string): Promise<ConverterOverwriteChallenge | ConverterFailure>;
  overwrite(sourceHandle: string, destinationHandle: string, adapterId: string, targetFormat: string, token: string, acknowledgementToken?: string, options?: Record<string, unknown>): Promise<ConverterResult>;
  pdfOperation(sourceHandle: string, destinationHandle: string, operation: string, options?: Record<string, unknown>, sourceHandles?: readonly string[], destinationHandles?: readonly string[]): Promise<ConverterPdfResult>;
  queue: {
    page(cursor?: string, pageSize?: number): Promise<ConverterPage<ConverterQueueItem> | ConverterFailure>;
    enqueue(sourceHandle: string, destinationHandle: string, adapterId: string, targetFormat: string, acknowledgementToken?: string): Promise<ConverterQueueItem | ConverterFailure>;
    start(): Promise<{ ok: true } | ConverterFailure>;
    pause(): Promise<{ ok: true } | ConverterFailure>;
    resume(): Promise<{ ok: true } | ConverterFailure>;
    cancel(ids?: readonly string[]): Promise<{ ok: true } | ConverterFailure>;
    retry(ids?: readonly string[]): Promise<{ ok: true } | ConverterFailure>;
  };
  notifications: {
    page(cursor?: string, pageSize?: number): Promise<ConverterPage<ConverterNotification> | ConverterFailure>;
    markRead(ids?: readonly string[]): Promise<{ ok: true } | ConverterFailure>;
    dismiss(ids?: readonly string[]): Promise<{ ok: true } | ConverterFailure>;
  };
  history: { page(cursor?: string, pageSize?: number): Promise<ConverterPage<ConverterHistoryEvent> | ConverterFailure> };
};

type HostWithConverter = { converter?: ConverterBridge };

/** Feature-owned bridge lookup until the central host protocol registers it. */
export function getFileConverterBridge(): ConverterBridge | null {
  const host = getOpenDesignHost() as unknown as HostWithConverter | null;
  return host?.converter ?? null;
}

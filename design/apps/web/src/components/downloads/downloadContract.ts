/**
 * Contracts for an extension-originated download handoff.
 *
 * The browser extension owns the actual browser download. These values are the
 * narrow, serializable boundary between that owner and the web surface. Every
 * state transition is explicit so a presentational surface cannot imply that a
 * transfer started, paused, or completed when the owner never reported it.
 */

export type DownloadStage =
  | 'start'
  | 'downloading'
  | 'paused'
  | 'completed'
  | 'cancelled'
  | 'failed';

export type AlwaysOnTopState = 'requested' | 'active' | 'unsupported' | 'unknown';

export interface ExtensionOrigin {
  /** The complete origin, for example `chrome-extension://abcdefghijklmnop`. */
  origin: string;
  /** Provider-specific stable extension id, never a display name. */
  id: string;
  /** Browser extension scheme used by the sender. */
  scheme: 'chrome-extension' | 'moz-extension';
}

export interface DownloadRequest {
  id: string;
  filename: string;
  source: string;
  destination: string;
  extension: ExtensionOrigin;
  totalBytes?: number;
  alwaysOnTop?: AlwaysOnTopState;
}

export interface DownloadProgress {
  receivedBytes: number;
  totalBytes?: number;
  /** Measured transfer rate, in bytes per second. */
  rateBytesPerSecond?: number;
  /** Measured or derived remaining time, in seconds. */
  etaSeconds?: number;
}

export interface DownloadJob extends DownloadRequest {
  stage: DownloadStage;
  progress: DownloadProgress;
  error: string | null;
  startedAt: number | null;
  finishedAt: number | null;
}

export interface DownloadQueueState {
  jobs: readonly DownloadJob[];
}

export type ExtensionDownloadRequest = Omit<DownloadRequest, 'extension'> & {
  extensionOrigin: string;
};

export type DownloadContractErrorCode =
  | 'INVALID_EXTENSION_ORIGIN'
  | 'DUPLICATE_DOWNLOAD_ID'
  | 'INVALID_DOWNLOAD_TRANSITION'
  | 'INVALID_PROGRESS';

export class DownloadContractError extends Error {
  readonly code: DownloadContractErrorCode;

  constructor(code: DownloadContractErrorCode, message: string) {
    super(message);
    this.name = 'DownloadContractError';
    this.code = code;
  }
}

/**
 * Parse and validate the sender origin supplied by the extension handoff.
 * Ordinary web origins are deliberately refused. A source URL may be any
 * valid URL, but the sender must be an identified extension.
 */
export function parseExtensionOrigin(value: string): ExtensionOrigin {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new DownloadContractError(
      'INVALID_EXTENSION_ORIGIN',
      'The download sender did not provide a valid extension origin.',
    );
  }

  const scheme = parsed.protocol.slice(0, -1);
  if (scheme !== 'chrome-extension' && scheme !== 'moz-extension') {
    throw new DownloadContractError(
      'INVALID_EXTENSION_ORIGIN',
      'Only a browser-extension sender may open the download surface.',
    );
  }
  const id = parsed.hostname;
  if (!/^[a-z0-9][a-z0-9._-]*$/u.test(id)) {
    throw new DownloadContractError(
      'INVALID_EXTENSION_ORIGIN',
      'The browser-extension sender id is not valid.',
    );
  }

  return {
    origin: `${parsed.protocol}//${parsed.host}`,
    id,
    scheme: scheme as ExtensionOrigin['scheme'],
  };
}

function finiteNonNegative(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new DownloadContractError('INVALID_PROGRESS', `${label} must be a finite non-negative number.`);
  }
  return Math.floor(value);
}

function optionalFiniteNonNegative(value: number | undefined, label: string): number | undefined {
  return value === undefined ? undefined : finiteNonNegative(value, label);
}

export function normalizeProgress(progress: DownloadProgress): DownloadProgress {
  const receivedBytes = finiteNonNegative(progress.receivedBytes, 'receivedBytes');
  const totalBytes = optionalFiniteNonNegative(progress.totalBytes, 'totalBytes');
  if (totalBytes !== undefined && receivedBytes > totalBytes) {
    throw new DownloadContractError(
      'INVALID_PROGRESS',
      'receivedBytes cannot exceed totalBytes.',
    );
  }
  const rateBytesPerSecond = progress.rateBytesPerSecond === undefined
    ? undefined
    : finiteNonNegative(progress.rateBytesPerSecond, 'rateBytesPerSecond');
  const etaSeconds = progress.etaSeconds === undefined
    ? rateBytesPerSecond !== undefined && rateBytesPerSecond > 0 && totalBytes !== undefined
      ? Math.max(0, Math.ceil((totalBytes - receivedBytes) / rateBytesPerSecond))
      : undefined
    : finiteNonNegative(progress.etaSeconds, 'etaSeconds');
  return {
    receivedBytes,
    ...(totalBytes === undefined ? {} : { totalBytes }),
    ...(rateBytesPerSecond === undefined ? {} : { rateBytesPerSecond }),
    ...(etaSeconds === undefined ? {} : { etaSeconds }),
  };
}

export function createDownloadQueue(): DownloadQueueState {
  return { jobs: [] };
}

export function createDownloadJob(request: DownloadRequest): DownloadJob {
  if (!request.id.trim() || !request.filename.trim()) {
    throw new DownloadContractError('DUPLICATE_DOWNLOAD_ID', 'A download needs a stable id and filename.');
  }
  const extension = parseExtensionOrigin(request.extension.origin);
  if (extension.id !== request.extension.id || extension.scheme !== request.extension.scheme) {
    throw new DownloadContractError(
      'INVALID_EXTENSION_ORIGIN',
      'The extension id and origin do not describe the same sender.',
    );
  }
  const initialProgress = normalizeProgress({
    receivedBytes: 0,
    ...(request.totalBytes === undefined ? {} : { totalBytes: request.totalBytes }),
  });
  return {
    ...request,
    extension,
    stage: 'start',
    progress: initialProgress,
    error: null,
    startedAt: null,
    finishedAt: null,
    alwaysOnTop: request.alwaysOnTop ?? 'unknown',
  };
}

function findJob(state: DownloadQueueState, id: string): DownloadJob {
  const job = state.jobs.find((candidate) => candidate.id === id);
  if (!job) {
    throw new DownloadContractError('INVALID_DOWNLOAD_TRANSITION', `Unknown download id: ${id}`);
  }
  return job;
}

function replaceJob(state: DownloadQueueState, next: DownloadJob): DownloadQueueState {
  return { jobs: state.jobs.map((job) => (job.id === next.id ? next : job)) };
}

function transition(
  state: DownloadQueueState,
  id: string,
  allowed: readonly DownloadStage[],
  next: DownloadJob,
): DownloadQueueState {
  const current = findJob(state, id);
  if (!allowed.includes(current.stage)) {
    throw new DownloadContractError(
      'INVALID_DOWNLOAD_TRANSITION',
      `Cannot move download ${id} from ${current.stage} to ${next.stage}.`,
    );
  }
  return replaceJob(state, next);
}

/** Add a handoff to the queue. The extension identity remains attached to it. */
export function enqueueDownload(state: DownloadQueueState, request: DownloadRequest): DownloadQueueState {
  if (state.jobs.some((job) => job.id === request.id)) {
    throw new DownloadContractError('DUPLICATE_DOWNLOAD_ID', `Download id already exists: ${request.id}`);
  }
  return { jobs: [...state.jobs, createDownloadJob(request)] };
}

/**
 * Convert the raw sender value from the browser message into an identified
 * queue item. Keeping this adapter at the boundary prevents callers from
 * forgetting to bind a download to its extension origin.
 */
export function enqueueExtensionDownload(
  state: DownloadQueueState,
  request: ExtensionDownloadRequest,
): DownloadQueueState {
  const extension = parseExtensionOrigin(request.extensionOrigin);
  const { extensionOrigin: _extensionOrigin, ...rest } = request;
  return enqueueDownload(state, { ...rest, extension });
}

export const queueExtensionDownload = enqueueExtensionDownload;

export function startDownload(state: DownloadQueueState, id: string, now = Date.now()): DownloadQueueState {
  const current = findJob(state, id);
  return transition(state, id, ['start'], {
    ...current,
    stage: 'downloading',
    error: null,
    startedAt: current.startedAt ?? now,
  });
}

export function updateDownloadProgress(
  state: DownloadQueueState,
  id: string,
  progress: DownloadProgress,
): DownloadQueueState {
  const current = findJob(state, id);
  const normalized = normalizeProgress(progress);
  if (current.stage !== 'downloading') {
    throw new DownloadContractError(
      'INVALID_DOWNLOAD_TRANSITION',
      `Progress is only accepted while download ${id} is downloading.`,
    );
  }
  if (normalized.receivedBytes < current.progress.receivedBytes) {
    throw new DownloadContractError(
      'INVALID_PROGRESS',
      'Download progress cannot move backwards.',
    );
  }
  return replaceJob(state, { ...current, progress: normalized });
}

export function pauseDownload(state: DownloadQueueState, id: string): DownloadQueueState {
  const current = findJob(state, id);
  return transition(state, id, ['downloading'], { ...current, stage: 'paused' });
}

export function resumeDownload(state: DownloadQueueState, id: string): DownloadQueueState {
  const current = findJob(state, id);
  return transition(state, id, ['paused'], { ...current, stage: 'downloading' });
}

export function cancelDownload(state: DownloadQueueState, id: string, now = Date.now()): DownloadQueueState {
  const current = findJob(state, id);
  return transition(state, id, ['start', 'downloading', 'paused'], {
    ...current,
    stage: 'cancelled',
    finishedAt: now,
  });
}

export function completeDownload(state: DownloadQueueState, id: string, now = Date.now()): DownloadQueueState {
  const current = findJob(state, id);
  const completedProgress = current.progress.totalBytes === undefined
    ? current.progress
    : { ...current.progress, receivedBytes: current.progress.totalBytes, etaSeconds: 0 };
  return transition(state, id, ['downloading', 'paused'], {
    ...current,
    stage: 'completed',
    progress: completedProgress,
    error: null,
    finishedAt: now,
  });
}

export function failDownload(
  state: DownloadQueueState,
  id: string,
  error: string,
  now = Date.now(),
): DownloadQueueState {
  const current = findJob(state, id);
  const message = error.trim() || 'The download failed.';
  return transition(state, id, ['start', 'downloading', 'paused'], {
    ...current,
    stage: 'failed',
    error: message,
    finishedAt: now,
  });
}

export function retryDownload(state: DownloadQueueState, id: string): DownloadQueueState {
  const current = findJob(state, id);
  return transition(state, id, ['failed', 'cancelled'], {
    ...current,
    stage: 'start',
    error: null,
    finishedAt: null,
    progress: { receivedBytes: 0, ...(current.progress.totalBytes === undefined ? {} : { totalBytes: current.progress.totalBytes }) },
  });
}

export function setAlwaysOnTopState(
  state: DownloadQueueState,
  id: string,
  alwaysOnTop: AlwaysOnTopState,
): DownloadQueueState {
  const current = findJob(state, id);
  return replaceJob(state, { ...current, alwaysOnTop });
}

export function getDownload(state: DownloadQueueState, id: string): DownloadJob | undefined {
  return state.jobs.find((job) => job.id === id);
}

export function isTerminalDownload(job: DownloadJob): boolean {
  return job.stage === 'completed' || job.stage === 'cancelled' || job.stage === 'failed';
}

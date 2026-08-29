import { useEffect, useId, useRef, useState } from 'react';

import type { DownloadJob } from './downloadContract';
import styles from './DownloadSurfaces.module.css';

export interface DownloadProgressCopy {
  title: string;
  paused: string;
  downloading: string;
  failed: string;
  filename: string;
  source: string;
  destination: string;
  extension: string;
  received: string;
  totalUnknown: string;
  rateUnknown: string;
  etaUnknown: string;
  pause: string;
  resume: string;
  cancel: string;
  retry: string;
  dismiss: string;
  actionFailed: string;
  alwaysOnTop: string;
}

const DEFAULT_COPY: DownloadProgressCopy = {
  title: 'Downloading',
  paused: 'Paused',
  downloading: 'Downloading',
  failed: 'Download failed',
  filename: 'Filename',
  source: 'Source',
  destination: 'Destination',
  extension: 'Extension sender',
  received: 'Received',
  totalUnknown: 'Total size is not available yet',
  rateUnknown: 'Transfer rate is not available yet',
  etaUnknown: 'ETA is not available yet',
  pause: 'Pause',
  resume: 'Resume',
  cancel: 'Cancel',
  retry: 'Retry',
  dismiss: 'Dismiss',
  actionFailed: 'The download action could not be completed.',
  alwaysOnTop: 'This active transfer surface requests always-on-top presentation.',
};

export interface DownloadProgressDialogProps {
  job: DownloadJob;
  onPause: () => Promise<boolean | void> | boolean | void;
  onResume: () => Promise<boolean | void> | boolean | void;
  onCancel: () => Promise<boolean | void> | boolean | void;
  onRetry?: () => Promise<boolean | void> | boolean | void;
  onDismiss?: () => Promise<boolean | void> | boolean | void;
  copy?: Partial<DownloadProgressCopy>;
}

export function formatByteCount(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value) || value < 0) return 'unknown';
  if (value < 1024) return `${Math.floor(value)} B`;
  const units = ['KiB', 'MiB', 'GiB', 'TiB'];
  let amount = value;
  let index = -1;
  while (amount >= 1024 && index < units.length - 1) {
    amount /= 1024;
    index += 1;
  }
  return `${amount.toFixed(amount >= 10 ? 0 : 1)} ${units[index]}`;
}

export function formatRate(value: number | undefined): string {
  return value === undefined ? 'unknown' : `${formatByteCount(value)}/s`;
}

export function formatEta(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value) || value < 0) return 'unknown';
  const seconds = Math.floor(value);
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes > 0 ? `${minutes}m ${String(remainder).padStart(2, '0')}s` : `${remainder}s`;
}

export function progressPercent(job: DownloadJob): number | undefined {
  const { receivedBytes, totalBytes } = job.progress;
  if (totalBytes === undefined || totalBytes <= 0) return undefined;
  return Math.min(100, Math.max(0, Math.round((receivedBytes / totalBytes) * 100)));
}

function stateLabel(job: DownloadJob, labels: DownloadProgressCopy): string {
  if (job.stage === 'paused') return labels.paused;
  if (job.stage === 'failed') return labels.failed;
  return labels.downloading;
}

export function DownloadProgressDialog({
  job,
  onPause,
  onResume,
  onCancel,
  onRetry,
  onDismiss,
  copy,
}: DownloadProgressDialogProps) {
  const labels = { ...DEFAULT_COPY, ...copy };
  const titleId = useId();
  const statusId = useId();
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const percent = progressPercent(job);
  const isPaused = job.stage === 'paused';
  const isFailed = job.stage === 'failed';

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  async function invoke(name: string, action: () => Promise<boolean | void> | boolean | void): Promise<void> {
    if (pendingAction) return;
    setPendingAction(name);
    setActionError(null);
    try {
      const result = await action();
      if (result === false) setActionError(labels.actionFailed);
    } catch (error) {
      setActionError(error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' && error.message.trim() ? error.message : labels.actionFailed);
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <section
      className={styles.surface}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-testid="download-progress-dialog"
      data-stage={job.stage}
      data-download-id={job.id}
      data-extension-origin={job.extension.origin}
      data-always-on-top={job.alwaysOnTop}
    >
      <header className={styles.heading}>
        <div className={styles.headingText}>
          <h2 className={styles.title} id={titleId}>{labels.title}</h2>
          <p className={styles.subtitle}>{stateLabel(job, labels)}: {job.filename}</p>
        </div>
      </header>

      <dl className={styles.facts}>
        <dt>{labels.filename}</dt>
        <dd>{job.filename}</dd>
        <dt>{labels.source}</dt>
        <dd>{job.source}</dd>
        <dt>{labels.destination}</dt>
        <dd>{job.destination}</dd>
        <dt>{labels.extension}</dt>
        <dd data-sensitive="origin">{job.extension.origin}</dd>
      </dl>

      <div className={styles.progressBlock} aria-describedby={statusId}>
        <div className={styles.progressTrack} role="progressbar" aria-label={`${labels.title}: ${job.filename}`} aria-valuemin={0} aria-valuemax={job.progress.totalBytes ?? undefined} aria-valuenow={job.progress.totalBytes === undefined ? undefined : job.progress.receivedBytes} aria-valuetext={percent === undefined ? labels.totalUnknown : `${percent}%`}>
          <div className={styles.progressValue} style={{ width: `${percent ?? 0}%` }} />
        </div>
        <div className={styles.progressMeta} id={statusId} aria-live="polite" aria-atomic="true">
          <span>{labels.received}: {formatByteCount(job.progress.receivedBytes)}{job.progress.totalBytes === undefined ? ` (${labels.totalUnknown})` : ` / ${formatByteCount(job.progress.totalBytes)}`}</span>
          <span>{job.progress.rateBytesPerSecond === undefined ? labels.rateUnknown : formatRate(job.progress.rateBytesPerSecond)}</span>
          <span>{job.progress.etaSeconds === undefined ? labels.etaUnknown : formatEta(job.progress.etaSeconds)}</span>
        </div>
      </div>

      <div className={styles.state} data-testid="download-progress-always-on-top">
        <span className={styles.stateLabel}>Window state</span>
        <span className={styles.stateValue}>{labels.alwaysOnTop} ({job.alwaysOnTop})</span>
      </div>

      {job.error ? <p className={styles.error} role="alert" data-testid="download-progress-error">{job.error}</p> : null}

      <div className={styles.actions}>
        {!isFailed ? (
          <button type="button" className={styles.secondary} onClick={() => void invoke(isPaused ? 'resume' : 'pause', isPaused ? onResume : onPause)} disabled={pendingAction !== null} data-testid={isPaused ? 'download-resume' : 'download-pause'}>
            {isPaused ? labels.resume : labels.pause}
          </button>
        ) : null}
        {isFailed && onRetry ? (
          <button type="button" className={styles.secondary} onClick={() => void invoke('retry', onRetry)} disabled={pendingAction !== null} data-testid="download-retry">{labels.retry}</button>
        ) : null}
        {isFailed ? (
          <button type="button" ref={cancelRef} className={styles.secondary} onClick={() => void invoke('dismiss', onDismiss ?? onCancel)} disabled={pendingAction !== null} data-testid="download-failed-dismiss">
            {labels.dismiss}
          </button>
        ) : (
          <button type="button" ref={cancelRef} className={styles.danger} onClick={() => void invoke('cancel', onCancel)} disabled={pendingAction !== null} data-testid="download-cancel">
            {labels.cancel}
          </button>
        )}
      </div>
      {actionError ? <p className={styles.error} role="alert" data-testid="download-action-error">{actionError}</p> : null}
    </section>
  );
}

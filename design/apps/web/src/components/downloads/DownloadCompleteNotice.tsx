import { useId, useState } from 'react';

import type { DownloadJob } from './downloadContract';
import { formatByteCount } from './DownloadProgressDialog';
import styles from './DownloadSurfaces.module.css';

export interface DownloadCompleteCopy {
  title: string;
  description: string;
  filename: string;
  destination: string;
  received: string;
  extension: string;
  open: string;
  openPending: string;
  openFailed: string;
  dismiss: string;
  failed: string;
  cancelled: string;
}

const DEFAULT_COPY: DownloadCompleteCopy = {
  title: 'Download complete',
  description: 'The browser reported that this transfer completed.',
  filename: 'Filename',
  destination: 'Destination',
  received: 'Received',
  extension: 'Extension sender',
  open: 'Open file',
  openPending: 'Opening…',
  openFailed: 'The file could not be opened.',
  dismiss: 'Dismiss',
  failed: 'Download failed',
  cancelled: 'Download cancelled',
};

export interface DownloadCompleteNoticeProps {
  job: DownloadJob;
  onOpen?: () => Promise<boolean | void> | boolean | void;
  onDismiss: () => void;
  copy?: Partial<DownloadCompleteCopy>;
}

export function DownloadCompleteNotice({ job, onOpen, onDismiss, copy }: DownloadCompleteNoticeProps) {
  const labels = { ...DEFAULT_COPY, ...copy };
  const titleId = useId();
  const [openPending, setOpenPending] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const isSuccess = job.stage === 'completed';
  const title = isSuccess ? labels.title : job.stage === 'cancelled' ? labels.cancelled : labels.failed;

  async function openFile(): Promise<void> {
    if (!onOpen || openPending) return;
    setOpenPending(true);
    setOpenError(null);
    try {
      const result = await onOpen();
      if (result === false) setOpenError(labels.openFailed);
    } catch (error) {
      setOpenError(error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' && error.message.trim() ? error.message : labels.openFailed);
    } finally {
      setOpenPending(false);
    }
  }

  return (
    <aside
      className={styles.surface}
      role="status"
      aria-labelledby={titleId}
      data-testid="download-completion-notice"
      data-stage={job.stage}
      data-download-id={job.id}
      data-extension-origin={job.extension.origin}
      data-always-on-top={job.alwaysOnTop}
    >
      <header className={styles.heading}>
        <div className={styles.headingText}>
          <h2 className={styles.title} id={titleId}>{title}</h2>
          <p className={styles.subtitle}>{isSuccess ? labels.description : job.error ?? title}</p>
        </div>
      </header>

      <dl className={styles.facts}>
        <dt>{labels.filename}</dt>
        <dd>{job.filename}</dd>
        <dt>{labels.destination}</dt>
        <dd>{job.destination}</dd>
        <dt>{labels.received}</dt>
        <dd>{formatByteCount(job.progress.receivedBytes)}</dd>
        <dt>{labels.extension}</dt>
        <dd data-sensitive="origin">{job.extension.origin}</dd>
      </dl>

      <div className={styles.actions}>
        {isSuccess && onOpen ? <button type="button" className={styles.primary} onClick={() => void openFile()} disabled={openPending} data-testid="download-open-file">{openPending ? labels.openPending : labels.open}</button> : null}
        <button type="button" className={styles.secondary} onClick={onDismiss} data-testid="download-dismiss">{labels.dismiss}</button>
      </div>
      {openError ? <p className={styles.error} role="alert" data-testid="download-open-error">{openError}</p> : null}
    </aside>
  );
}

import { useEffect, useId, useRef, useState } from 'react';

import type { AlwaysOnTopState, DownloadRequest } from './downloadContract';
import styles from './DownloadSurfaces.module.css';

export interface DownloadStartCopy {
  title: string;
  description: string;
  filename: string;
  source: string;
  destination: string;
  extension: string;
  start: string;
  cancel: string;
  starting: string;
  startFailed: string;
  alwaysOnTop: Record<AlwaysOnTopState, string>;
}

const DEFAULT_COPY: DownloadStartCopy = {
  title: 'Start download',
  description: 'Review this transfer before it enters the download queue.',
  filename: 'Filename',
  source: 'Source',
  destination: 'Destination',
  extension: 'Extension sender',
  start: 'Start download',
  cancel: 'Cancel',
  starting: 'Starting download…',
  startFailed: 'The download could not be started.',
  alwaysOnTop: {
    requested: 'This surface requested always-on-top presentation.',
    active: 'Always-on-top presentation is active.',
    unsupported: 'This browser does not support always-on-top presentation.',
    unknown: 'Always-on-top presentation has not been confirmed.',
  },
};

export interface DownloadStartDialogProps {
  request: DownloadRequest;
  onStart: () => Promise<boolean | void> | boolean | void;
  onCancel: () => void;
  alwaysOnTop?: AlwaysOnTopState;
  copy?: Partial<DownloadStartCopy>;
}

function messageFrom(error: unknown, fallback: string): string {
  return error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' && error.message.trim() ? error.message : fallback;
}

export function DownloadStartDialog({
  request,
  onStart,
  onCancel,
  alwaysOnTop = request.alwaysOnTop ?? 'unknown',
  copy,
}: DownloadStartDialogProps) {
  const labels = { ...DEFAULT_COPY, ...copy, alwaysOnTop: { ...DEFAULT_COPY.alwaysOnTop, ...copy?.alwaysOnTop } };
  const titleId = useId();
  const descriptionId = useId();
  const startRef = useRef<HTMLButtonElement | null>(null);
  const [starting, setStarting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    startRef.current?.focus();
  }, []);

  async function start(): Promise<void> {
    if (starting) return;
    setStarting(true);
    setFailure(null);
    try {
      const result = await onStart();
      if (result === false) setFailure(labels.startFailed);
    } catch (error) {
      setFailure(messageFrom(error, labels.startFailed));
    } finally {
      setStarting(false);
    }
  }

  return (
    <section
      className={styles.surface}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      data-testid="download-start-dialog"
      data-stage="start"
      data-extension-origin={request.extension.origin}
      data-always-on-top={alwaysOnTop}
    >
      <header className={styles.heading}>
        <div className={styles.headingText}>
          <h2 className={styles.title} id={titleId}>{labels.title}</h2>
          <p className={styles.subtitle} id={descriptionId}>{labels.description}</p>
        </div>
      </header>

      <dl className={styles.facts}>
        <dt>{labels.filename}</dt>
        <dd>{request.filename}</dd>
        <dt>{labels.source}</dt>
        <dd>{request.source}</dd>
        <dt>{labels.destination}</dt>
        <dd>{request.destination}</dd>
        <dt>{labels.extension}</dt>
        <dd data-sensitive="origin">{request.extension.origin}</dd>
      </dl>

      <div className={styles.state} data-testid="download-start-always-on-top">
        <span className={styles.stateLabel}>Window state</span>
        <span className={styles.stateValue}>{labels.alwaysOnTop[alwaysOnTop]}</span>
      </div>

      {failure ? <p className={styles.error} role="alert" data-testid="download-start-error">{failure}</p> : null}

      <div className={styles.actions}>
        <button type="button" className={styles.secondary} onClick={onCancel} disabled={starting} data-testid="download-start-cancel">
          {labels.cancel}
        </button>
        <button type="button" ref={startRef} className={styles.primary} onClick={() => void start()} disabled={starting} data-testid="download-start-confirm">
          {starting ? labels.starting : labels.start}
        </button>
      </div>
    </section>
  );
}

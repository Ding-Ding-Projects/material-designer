import { DownloadCompleteNotice } from './DownloadCompleteNotice';
import { DownloadProgressDialog } from './DownloadProgressDialog';
import { DownloadStartDialog } from './DownloadStartDialog';
import type { DownloadJob, DownloadQueueState } from './downloadContract';

export interface DownloadQueueSurfaceProps {
  queue: DownloadQueueState;
  activeId: string;
  onStart: (job: DownloadJob) => Promise<boolean | void> | boolean | void;
  onPause: (job: DownloadJob) => Promise<boolean | void> | boolean | void;
  onResume: (job: DownloadJob) => Promise<boolean | void> | boolean | void;
  onCancel: (job: DownloadJob) => Promise<boolean | void> | boolean | void;
  onRetry?: (job: DownloadJob) => Promise<boolean | void> | boolean | void;
  onOpen?: (job: DownloadJob) => void;
  onDismiss: (job: DownloadJob) => void;
}

/**
 * Render one stage at a time. The start decision and active transfer are
 * intentionally separate surfaces, so an implementation cannot replace a
 * real progress dialog with a background-only row.
 */
export function DownloadQueueSurface({
  queue,
  activeId,
  onStart,
  onPause,
  onResume,
  onCancel,
  onRetry,
  onOpen,
  onDismiss,
}: DownloadQueueSurfaceProps) {
  const job = queue.jobs.find((candidate) => candidate.id === activeId);
  if (!job) return null;

  if (job.stage === 'start') {
    return (
      <DownloadStartDialog
        request={job}
        onStart={() => onStart(job)}
        onCancel={() => void onCancel(job)}
      />
    );
  }

  if (job.stage === 'downloading' || job.stage === 'paused' || job.stage === 'failed') {
    return (
      <DownloadProgressDialog
        job={job}
        onPause={() => onPause(job)}
        onResume={() => onResume(job)}
        onCancel={() => onCancel(job)}
        onRetry={onRetry ? () => onRetry(job) : undefined}
      />
    );
  }

  return (
    <DownloadCompleteNotice
      job={job}
      onOpen={onOpen ? () => onOpen(job) : undefined}
      onDismiss={() => onDismiss(job)}
    />
  );
}

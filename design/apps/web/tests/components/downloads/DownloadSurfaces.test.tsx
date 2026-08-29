// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DownloadCompleteNotice } from '../../../src/components/downloads/DownloadCompleteNotice';
import { DownloadProgressDialog } from '../../../src/components/downloads/DownloadProgressDialog';
import { DownloadStartDialog } from '../../../src/components/downloads/DownloadStartDialog';
import { DownloadQueueSurface } from '../../../src/components/downloads/DownloadQueueSurface';
import { completeDownload, createDownloadQueue, enqueueDownload, startDownload, updateDownloadProgress, type DownloadJob } from '../../../src/components/downloads/downloadContract';

const request = {
  id: 'download-1',
  filename: 'capture.fig',
  source: 'https://example.test/capture.fig',
  destination: 'Downloads/capture.fig',
  extension: {
    origin: 'chrome-extension://abcdefghijklmnop' as const,
    id: 'abcdefghijklmnop',
    scheme: 'chrome-extension' as const,
  },
  totalBytes: 1_000,
};

function job(stage: 'start' | 'downloading' | 'paused' | 'completed' | 'failed' = 'start'): DownloadJob {
  let state = enqueueDownload(createDownloadQueue(), request);
  if (stage !== 'start') state = startDownload(state, request.id, 1);
  if (stage === 'paused') {
    const progress = updateDownloadProgress(state, request.id, { receivedBytes: 500, totalBytes: 1_000, rateBytesPerSecond: 100 });
    state = { jobs: progress.jobs.map((item) => item.id === request.id ? { ...item, stage: 'paused' as const } : item) };
  }
  if (stage === 'completed') state = completeDownload(state, request.id, 2);
  if (stage === 'failed') state = { jobs: state.jobs.map((item) => item.id === request.id ? { ...item, stage: 'failed' as const, error: 'network interrupted' } : item) };
  return state.jobs[0] as DownloadJob;
}

describe('download surfaces', () => {
  it('shows a real Start decision with filename, source, destination, and extension origin', () => {
    const onStart = vi.fn();
    const onCancel = vi.fn();
    render(<DownloadStartDialog request={request} onStart={onStart} onCancel={onCancel} alwaysOnTop="requested" />);
    expect(screen.getByTestId('download-start-dialog')).toHaveAttribute('data-stage', 'start');
    expect(screen.getByText('capture.fig')).toBeInTheDocument();
    expect(screen.getByText('https://example.test/capture.fig')).toBeInTheDocument();
    expect(screen.getByText('Downloads/capture.fig')).toBeInTheDocument();
    expect(screen.getByText('chrome-extension://abcdefghijklmnop')).toBeInTheDocument();
    expect(screen.getByTestId('download-start-always-on-top')).toHaveTextContent(/requested/i);
    fireEvent.click(screen.getByTestId('download-start-cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onStart).not.toHaveBeenCalled();
  });

  it('does not re-enter the Start handler while a transfer is being admitted', async () => {
    let resolve!: (value: boolean) => void;
    const onStart = vi.fn(() => new Promise<boolean>((done) => { resolve = done; }));
    render(<DownloadStartDialog request={request} onStart={onStart} onCancel={() => {}} />);
    fireEvent.click(screen.getByTestId('download-start-confirm'));
    fireEvent.click(screen.getByTestId('download-start-confirm'));
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('download-start-confirm')).toBeDisabled();
    resolve(true);
    await waitFor(() => expect(screen.getByTestId('download-start-confirm')).not.toBeDisabled());
  });

  it('renders active progress as a separate surface with truthful metrics and controls', () => {
    const active = job('downloading');
    const onPause = vi.fn();
    const onResume = vi.fn();
    const onCancel = vi.fn();
    render(<DownloadProgressDialog job={{ ...active, progress: { receivedBytes: 250, totalBytes: 1_000, rateBytesPerSecond: 125, etaSeconds: 6 } }} onPause={onPause} onResume={onResume} onCancel={onCancel} />);
    expect(screen.getByTestId('download-progress-dialog')).toHaveAttribute('data-stage', 'downloading');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '250');
    expect(screen.getByText(/250 B \/ 1000 B/)).toBeInTheDocument();
    expect(screen.getByText(/125 B\/s/)).toBeInTheDocument();
    expect(screen.getByText('6s')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('download-pause'));
    fireEvent.click(screen.getByTestId('download-cancel'));
    expect(onPause).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('download-start-dialog')).not.toBeInTheDocument();
  });

  it('keeps paused and failed states actionable without inventing progress', () => {
    const paused = job('paused');
    const onResume = vi.fn();
    render(<DownloadProgressDialog job={paused} onPause={() => {}} onResume={onResume} onCancel={() => {}} />);
    expect(screen.getByTestId('download-resume')).toHaveTextContent('Resume');
    fireEvent.click(screen.getByTestId('download-resume'));
    expect(onResume).toHaveBeenCalledTimes(1);

    const failed = job('failed');
    const onCancel = vi.fn();
    render(<DownloadProgressDialog job={failed} onPause={() => {}} onResume={() => {}} onCancel={onCancel} onRetry={() => {}} onDismiss={() => {}} />);
    expect(screen.getByTestId('download-progress-error')).toHaveTextContent('network interrupted');
    expect(screen.getByTestId('download-retry')).toBeInTheDocument();
    expect(screen.getByTestId('download-failed-dismiss')).toBeInTheDocument();
    expect(screen.queryByTestId('download-cancel')).not.toBeInTheDocument();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('uses a non-blocking completion notice and exposes the honest window state', () => {
    const completed = { ...job('completed'), alwaysOnTop: 'unsupported' as const };
    const onOpen = vi.fn();
    const onDismiss = vi.fn();
    render(<DownloadCompleteNotice job={completed} onOpen={onOpen} onDismiss={onDismiss} />);
    const notice = screen.getByTestId('download-completion-notice');
    expect(notice).toHaveAttribute('role', 'status');
    expect(notice).toHaveAttribute('data-stage', 'completed');
    expect(notice).toHaveAttribute('data-always-on-top', 'unsupported');
    fireEvent.click(screen.getByTestId('download-open-file'));
    fireEvent.click(screen.getByTestId('download-dismiss'));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('does not autofocus completion and latches a pending Open action', async () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    let resolve!: (value: boolean) => void;
    const onOpen = vi.fn(() => new Promise<boolean>((done) => { resolve = done; }));
    render(<DownloadCompleteNotice job={job('completed')} onOpen={onOpen} onDismiss={() => {}} />);
    expect(document.activeElement).toBe(opener);
    fireEvent.click(screen.getByTestId('download-open-file'));
    fireEvent.click(screen.getByTestId('download-open-file'));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('download-open-file')).toBeDisabled();
    resolve(false);
    await waitFor(() => expect(screen.getByTestId('download-open-error')).toHaveTextContent(/could not be opened/i));
    opener.remove();
  });

  it('selects exactly one stage in the queue surface', () => {
    const queuedState = enqueueDownload(createDownloadQueue(), request);
    const onStart = vi.fn();
    const onCancel = vi.fn();
    const { rerender } = render(<DownloadQueueSurface queue={queuedState} activeId={request.id} onStart={onStart} onPause={() => {}} onResume={() => {}} onCancel={onCancel} onDismiss={() => {}} />);
    expect(screen.getByTestId('download-start-dialog')).toBeInTheDocument();
    let active = startDownload(queuedState, request.id, 1);
    active = updateDownloadProgress(active, request.id, { receivedBytes: 500, totalBytes: 1_000, rateBytesPerSecond: 100 });
    rerender(<DownloadQueueSurface queue={active} activeId={request.id} onStart={onStart} onPause={() => {}} onResume={() => {}} onCancel={onCancel} onDismiss={() => {}} />);
    expect(screen.getByTestId('download-progress-dialog')).toBeInTheDocument();
    expect(screen.queryByTestId('download-start-dialog')).not.toBeInTheDocument();
  });
});

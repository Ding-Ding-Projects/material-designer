import { describe, expect, it } from 'vitest';

import {
  cancelDownload,
  completeDownload,
  createDownloadQueue,
  enqueueExtensionDownload,
  enqueueDownload,
  failDownload,
  getDownload,
  normalizeProgress,
  parseExtensionOrigin,
  pauseDownload,
  resumeDownload,
  retryDownload,
  setAlwaysOnTopState,
  startDownload,
  updateDownloadProgress,
  type DownloadRequest,
} from '../../../src/components/downloads/downloadContract';

const request: DownloadRequest = {
  id: 'download-1',
  filename: 'capture.fig',
  source: 'https://example.test/capture.fig',
  destination: 'Downloads/capture.fig',
  extension: {
    origin: 'chrome-extension://abcdefghijklmnop',
    id: 'abcdefghijklmnop',
    scheme: 'chrome-extension',
  },
  totalBytes: 1_000,
};

function queued() {
  return enqueueDownload(createDownloadQueue(), request);
}

describe('download contract', () => {
  it('requires a browser extension origin and keeps its stable identity', () => {
    expect(parseExtensionOrigin('chrome-extension://abcdefghijklmnop')).toEqual({
      origin: 'chrome-extension://abcdefghijklmnop',
      id: 'abcdefghijklmnop',
      scheme: 'chrome-extension',
    });
    expect(() => parseExtensionOrigin('https://example.test')).toThrow(/extension sender/i);
  });

  it('binds a raw extension handoff before it enters the queue', () => {
    const { extension: _extension, ...rawRequest } = request;
    const state = enqueueExtensionDownload(createDownloadQueue(), {
      ...rawRequest,
      extensionOrigin: request.extension.origin,
    });
    expect(getDownload(state, request.id)?.extension.origin).toBe(request.extension.origin);
    expect(() => enqueueExtensionDownload(createDownloadQueue(), {
      ...rawRequest,
      extensionOrigin: 'https://example.test',
    })).toThrow(/extension sender/i);
  });

  it('binds each queue item to the extension handoff and rejects duplicate ids', () => {
    const state = queued();
    expect(getDownload(state, request.id)).toMatchObject({
      id: request.id,
      stage: 'start',
      extension: request.extension,
      progress: { receivedBytes: 0, totalBytes: 1_000 },
    });
    expect(() => enqueueDownload(state, request)).toThrow(/already exists/i);
    expect(() => enqueueDownload(createDownloadQueue(), { ...request, id: '' })).toMatchObject({ code: 'INVALID_DOWNLOAD_REQUEST' });
  });

  it('requires Start before accepting active progress', () => {
    expect(() => updateDownloadProgress(queued(), request.id, { receivedBytes: 20, totalBytes: 1_000 })).toThrow(/only accepted/i);
    const started = startDownload(queued(), request.id, 123);
    expect(getDownload(started, request.id)).toMatchObject({ stage: 'downloading', startedAt: 123 });
  });

  it('keeps byte, rate, and ETA values factual and monotonic', () => {
    const started = startDownload(queued(), request.id, 123);
    const active = updateDownloadProgress(started, request.id, {
      receivedBytes: 250,
      totalBytes: 1_000,
      rateBytesPerSecond: 125,
    });
    expect(getDownload(active, request.id)?.progress).toEqual({
      receivedBytes: 250,
      totalBytes: 1_000,
      rateBytesPerSecond: 125,
      etaSeconds: 6,
    });
    expect(() => updateDownloadProgress(active, request.id, { receivedBytes: 249, totalBytes: 1_000 })).toThrow(/backwards/i);
    expect(() => updateDownloadProgress(active, request.id, { receivedBytes: 300, totalBytes: 900 })).toThrow(/totalBytes.*backwards/i);
    expect(() => normalizeProgress({ receivedBytes: 1_001, totalBytes: 1_000 })).toThrow(/exceed/i);
    expect(normalizeProgress({ receivedBytes: 10 })).toEqual({ receivedBytes: 10 });
  });

  it('supports real pause, resume, cancel, and terminal completion transitions', () => {
    const started = startDownload(queued(), request.id, 10);
    const paused = pauseDownload(started, request.id);
    expect(getDownload(paused, request.id)?.stage).toBe('paused');
    const resumed = resumeDownload(paused, request.id);
    expect(getDownload(resumed, request.id)?.stage).toBe('downloading');
    const completed = completeDownload(resumed, request.id, 20);
    expect(getDownload(completed, request.id)).toMatchObject({
      stage: 'completed',
      progress: { receivedBytes: 1_000, etaSeconds: 0 },
      finishedAt: 20,
    });
    expect(() => resumeDownload(completed, request.id)).toThrow(/Cannot move/i);
    const cancelled = cancelDownload(started, request.id, 30);
    expect(getDownload(cancelled, request.id)).toMatchObject({ stage: 'cancelled', finishedAt: 30 });
  });

  it('keeps failure text and permits an explicit retry from the start surface', () => {
    const started = startDownload(queued(), request.id, 10);
    const failed = failDownload(started, request.id, 'network interrupted', 20);
    expect(getDownload(failed, request.id)).toMatchObject({ stage: 'failed', error: 'network interrupted' });
    const retried = retryDownload(failed, request.id);
    expect(getDownload(retried, request.id)).toMatchObject({ stage: 'start', error: null, startedAt: null, progress: { receivedBytes: 0 } });
  });

  it('records the honest always-on-top outcome instead of claiming browser support', () => {
    const updated = setAlwaysOnTopState(queued(), request.id, 'unsupported');
    expect(getDownload(updated, request.id)?.alwaysOnTop).toBe('unsupported');
  });
});

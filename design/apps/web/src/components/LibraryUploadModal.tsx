// OD Library — manual upload modal.
//
// Opened from the Library toolbar's Upload button (and seeded by a section-wide
// file drop). Supports every common way to get bytes in:
//   • choose files   — native multi-select picker
//   • drag & drop     — onto the dropzone
//   • paste           — image/file from the clipboard, or a text/JSON snippet
//
// Every file runs the shared upload policy (images, fonts, text, HTML, JSON /
// design data; no audio/video; size-capped). The daemon enforces the same
// policy as the source of truth, so a rejected file shows a per-row reason here
// without trusting the client. Uploads run concurrently and the grid refreshes
// once the batch settles (live clipper-style SSE also refreshes it).
//
// User-facing copy is localized through the shared Library catalog.

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LIBRARY_UPLOAD_MAX_BYTES, libraryUploadAcceptAttr } from '@open-design/contracts';
import { Button, Dialog } from '@open-design/components';
import { Icon } from './Icon';
import { useT } from '../i18n';
import { uploadLibraryFile, uploadLibraryText, type LibraryUploadOutcome } from '../providers/registry';
import styles from './LibraryUploadModal.module.css';

type ItemStatus = 'uploading' | 'done' | 'deduped' | 'error' | 'cancelled';

interface UploadItem {
  id: string;
  batchId: string;
  name: string;
  size: number;
  status: ItemStatus;
  progress: number;
  message?: string;
  /** Raw daemon/network detail is retained only for diagnostics, never UI copy. */
  diagnostic?: string;
}

interface Props {
  /** Files to enqueue immediately (e.g. from a section-wide drop). */
  seedFiles: File[] | null;
  onClose: () => void;
  /** Fired after the batch settles so the grid can refresh. */
  onUploaded: () => void;
}

let uploadSeq = 0;
let uploadBatchSeq = 0;
const nextItemId = () => `upload-${(uploadSeq += 1)}`;
const nextBatchId = () => `batch-${(uploadBatchSeq += 1)}`;
const maxMb = Math.round(LIBRARY_UPLOAD_MAX_BYTES / 1_000_000);

function localizedUploadError(outcome: LibraryUploadOutcome, t: ReturnType<typeof useT>): string {
  switch (outcome.code) {
    case 'PAYLOAD_TOO_LARGE': return t('library.uploadTooLarge', { count: maxMb });
    case 'UNSUPPORTED_MEDIA_TYPE': return t('library.uploadUnsupported');
    case 'ABORTED': return t('library.uploadCancelled');
    case 'NETWORK_ERROR': return t('library.uploadNetworkError');
    default: return t('library.uploadFailed');
  }
}

export function LibraryUploadModal({ seedFiles, onClose, onUploaded }: Props) {
  const t = useT();
  const titleId = useId();
  const [items, setItems] = useState<UploadItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const inFlight = useRef(0);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const seededRef = useRef<File[] | null>(null);
  const aliveRef = useRef(true);
  const batchGenerationRef = useRef(0);
  const progressTimersRef = useRef(new Map<string, number>());
  const pendingProgressRef = useRef(new Map<string, number>());
  const [cancelRequested, setCancelRequested] = useState(false);
  const [currentBatchId, setCurrentBatchId] = useState<string | null>(null);

  useEffect(() => () => {
    aliveRef.current = false;
    batchGenerationRef.current += 1;
    // The modal normally refuses to close while work is pending, but a parent
    // route can still unmount it. Cancel the exact batch in that case so a
    // late response cannot update a surface that no longer owns the upload.
    uploadAbortRef.current?.abort();
    uploadAbortRef.current = null;
    for (const timer of progressTimersRef.current.values()) window.clearTimeout(timer);
    progressTimersRef.current.clear();
    pendingProgressRef.current.clear();
  }, []);

  const updateProgress = useCallback((id: string, progress: number, generation: number) => {
    if (!aliveRef.current || generation !== batchGenerationRef.current) return;
    pendingProgressRef.current.set(id, Math.max(0, Math.min(100, Math.round(progress))));
    if (progressTimersRef.current.has(id)) return;
    const timer = window.setTimeout(() => {
      progressTimersRef.current.delete(id);
      const nextProgress = pendingProgressRef.current.get(id);
      pendingProgressRef.current.delete(id);
      if (!aliveRef.current || generation !== batchGenerationRef.current || nextProgress === undefined) return;
      setItems((prev) => prev.map((item) => (
        item.id === id && item.status === 'uploading'
          ? { ...item, progress: nextProgress }
          : item
      )));
    }, 100);
    progressTimersRef.current.set(id, timer);
  }, []);

  const finishItem = useCallback((id: string, outcome: LibraryUploadOutcome, generation: number) => {
    if (!aliveRef.current || generation !== batchGenerationRef.current) return;
    inFlight.current = Math.max(0, inFlight.current - 1);
    const cancelled = outcome.code === 'ABORTED';
    const measuredProgress = pendingProgressRef.current.get(id);
    pendingProgressRef.current.delete(id);
    setItems((prev) =>
      prev.map((it) =>
        it.id === id
          ? outcome.ok
            ? { ...it, status: outcome.deduped ? 'deduped' : 'done', progress: 100 }
            : {
                ...it,
                status: cancelled ? 'cancelled' : 'error',
                // A failed or cancelled transfer did not complete. Keeping
                // the last measured byte progress makes the aggregate honest
                // instead of painting a green-looking 100% row for a request
                // that stopped halfway through.
                progress: measuredProgress ?? it.progress,
                message: localizedUploadError(outcome, t),
                diagnostic: outcome.error,
              }
          : it,
      ),
    );
    // Refresh the grid once every dispatched upload has settled.
    if (inFlight.current === 0 && aliveRef.current && generation === batchGenerationRef.current) {
      uploadAbortRef.current = null;
      setCancelRequested(false);
      onUploaded();
    }
  }, [onUploaded, t]);

  const addFiles = useCallback(
    (files: File[]) => {
      if (inFlight.current > 0) return;
      const generation = batchGenerationRef.current + 1;
      batchGenerationRef.current = generation;
      const batchId = nextBatchId();
      setCurrentBatchId(batchId);
      const controller = new AbortController();
      uploadAbortRef.current = controller;
      setCancelRequested(false);
      for (const file of files) {
        const id = nextItemId();
        setItems((prev) => [{ batchId, id, name: file.name, size: file.size, status: 'uploading', progress: 0 }, ...prev]);
        inFlight.current += 1;
        void uploadLibraryFile(file, {
          signal: controller.signal,
          onProgress: (progress) => updateProgress(id, progress, generation),
        })
          .then((outcome) => finishItem(id, outcome, generation))
          .catch(() => finishItem(id, { ok: false, code: 'NETWORK_ERROR', error: 'Upload failed' }, generation));
      }
    },
    [finishItem, t, updateProgress],
  );

  const addText = useCallback(
    (text: string) => {
      if (inFlight.current > 0) return;
      const generation = batchGenerationRef.current + 1;
      batchGenerationRef.current = generation;
      const batchId = nextBatchId();
      setCurrentBatchId(batchId);
      const controller = new AbortController();
      uploadAbortRef.current = controller;
      setCancelRequested(false);
      const id = nextItemId();
      const size = new Blob([text]).size;
      setItems((prev) => [{ batchId, id, name: t('library.pastedText', { count: text.length }), size, status: 'uploading', progress: 0 }, ...prev]);
      inFlight.current += 1;
      void uploadLibraryText(text, {}, {
        signal: controller.signal,
        onProgress: (progress) => updateProgress(id, progress, generation),
      })
        .then((outcome) => finishItem(id, outcome, generation))
        .catch(() => finishItem(id, { ok: false, code: 'NETWORK_ERROR', error: 'Upload failed' }, generation));
    },
    [finishItem, t, updateProgress],
  );

  // Enqueue files handed in from a section-wide drop. The ref guard makes this
  // idempotent (StrictMode double-invoke / parent re-renders re-pass the same
  // array reference, which we only process once).
  useEffect(() => {
    if (seedFiles && seedFiles.length && seedFiles !== seededRef.current) {
      seededRef.current = seedFiles;
      addFiles(seedFiles);
    }
  }, [seedFiles, addFiles]);

  // Clipboard paste: prefer image/file payloads, fall back to a text snippet.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const dt = e.clipboardData;
      if (!dt) return;
      const files = Array.from(dt.files ?? []);
      if (!files.length) {
        for (const item of Array.from(dt.items ?? [])) {
          if (item.kind === 'file') {
            const f = item.getAsFile();
            if (f) files.push(f);
          }
        }
      }
      if (files.length) {
        e.preventDefault();
        addFiles(files);
        return;
      }
      const text = dt.getData('text/plain');
      if (text && text.trim()) {
        e.preventDefault();
        addText(text);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [addFiles, addText]);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (inFlight.current > 0) return;
    const files = Array.from(e.target.files ?? []);
    if (files.length) addFiles(files);
    e.target.value = ''; // let the same file be re-picked
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (inFlight.current > 0) return;
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length) addFiles(files);
  };

  const currentItems = items.filter((item) => item.batchId === currentBatchId);
  const pending = currentItems.some((it) => it.status === 'uploading');
  const okCount = currentItems.filter((it) => it.status === 'done' || it.status === 'deduped').length;
  const errCount = currentItems.filter((it) => it.status === 'error').length;
  const cancelledCount = currentItems.filter((it) => it.status === 'cancelled').length;
  const totalBytes = currentItems.reduce((total, item) => total + item.size, 0);
  const overallProgress = totalBytes > 0
    ? Math.round(currentItems.reduce((total, item) => total + item.size * item.progress, 0) / totalBytes)
    : 0;
  const cancelUpload = useCallback(() => {
    if (!pending || cancelRequested) return;
    setCancelRequested(true);
    uploadAbortRef.current?.abort();
  }, [cancelRequested, pending]);
  const requestClose = useCallback(() => {
    if (inFlight.current > 0) return;
    onClose();
  }, [onClose]);

  const modal = (
    <Dialog
      className={styles.modal}
      backdropClassName={styles.backdrop}
      includeChromeClassName={false}
      role="dialog"
      ariaLabelledBy={titleId}
      closeOnBackdrop={!pending}
      closeOnEscape={!pending}
      onClose={requestClose}
      data-testid="library-upload-modal"
    >
        <header className={styles.head} aria-busy={pending}>
          <h2 id={titleId} className={styles.headTitle}>{t('library.upload')}</h2>
          <button type="button" className={styles.closeBtn} onClick={requestClose} disabled={pending} aria-label={t('common.close')}>
            <Icon name="close" size={18} />
          </button>
        </header>

        <div
          className={styles.dropzone}
          data-drag={dragOver ? 'true' : 'false'}
          onDragEnter={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={(e) => {
            e.preventDefault();
            setDragOver(false);
          }}
          onDrop={onDrop}
          aria-disabled={pending}
          onClick={() => {
            if (!pending) inputRef.current?.click();
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              if (!pending) inputRef.current?.click();
            }
          }}
        >
          <Icon name="upload" size={26} className={styles.dropIcon} />
          <p className={styles.dropTitle}>{t('library.dropToUpload')}</p>
          <p className={styles.dropHint}>{t('library.uploadTooltip')} · {t('library.uploadMaxHint', { count: maxMb })}</p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={libraryUploadAcceptAttr()}
            className={styles.fileInput}
            onChange={onPick}
          />
        </div>

        {items.length > 0 ? (
          <ul className={styles.list} aria-busy={pending} aria-live="polite">
            {items.map((it) => (
              <li key={it.id} className={styles.item} data-status={it.status}>
                <span className={styles.itemIcon} aria-hidden>
                  {it.status === 'uploading' ? (
                    <Icon name="spinner" size={15} className={styles.spin} />
                  ) : it.status === 'error' ? (
                    <Icon name="alert-triangle" size={15} />
                  ) : it.status === 'cancelled' ? (
                    <Icon name="close" size={15} />
                  ) : (
                    <Icon name="check" size={15} />
                  )}
                </span>
                <span className={styles.itemName} title={it.name}>
                  {it.name}
                </span>
                <span className={styles.itemStatus} role="status">
                  {it.status === 'uploading'
                    ? t('library.uploadStatus')
                    : it.status === 'deduped'
                      ? t('library.uploadDeduped')
                      : it.status === 'done'
                        ? t('library.uploadDone')
                        : it.status === 'cancelled'
                          ? t('library.uploadCancelled')
                        : (it.message ?? t('library.uploadFailed'))}
                  {it.status === 'uploading' ? ` · ${it.progress}%` : ''}
                </span>
                {it.status === 'uploading' ? (
                  <progress
                    className={styles.itemProgress}
                    value={it.progress}
                    max={100}
                    aria-label={t('library.uploadProgress', { progress: it.progress })}
                    aria-valuetext={t('library.uploadProgress', { progress: it.progress })}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}

        <footer className={styles.foot}>
          <span className={styles.summary} role="status" aria-live="polite" aria-atomic="true">
            {currentItems.length === 0
              ? t('library.uploadNothing')
              : pending
                ? (cancelRequested
                  ? t('library.cancellingUpload')
                  : t('library.uploadProgress', { progress: overallProgress }))
                : t('library.uploadSummary', { added: okCount, failed: errCount + cancelledCount })}
          </span>
          {pending ? (
            <progress
              className={styles.aggregateProgress}
              value={overallProgress}
              max={100}
              aria-label={t('library.uploadProgress', { progress: overallProgress })}
            />
          ) : null}
          {pending ? (
            <Button variant="ghost" onClick={cancelUpload} disabled={cancelRequested}>
              {cancelRequested ? t('library.cancellingUpload') : t('library.cancelUpload')}
            </Button>
          ) : null}
          <Button variant="ghost" onClick={requestClose} disabled={pending}>
            {t('common.close')}
          </Button>
        </footer>
    </Dialog>
  );

  if (typeof document === 'undefined') return modal;
  return createPortal(modal, document.body);
}

// Import from Figma — offline `.fig` decode (or a Figma URL) → webpage.
//
// Reachable from the composer "+" menu on the homepage and in a project chat.
// A dropped/browsed `.fig` is decoded fully offline on the daemon (no Figma
// account) into a `figma/` snapshot; the modal shows the recovered inventory
// and hands the host a ready-to-send reshape prompt. A pasted Figma URL is
// delegated to the host (`onFigmaUrl`), which routes it through the existing
// od-figma-migration scenario (OAuth lives in the run pipeline).
//
// Copy is intentionally inline (matching LibraryUploadModal). The durable
// URL and notes field labels use the existing dsCreate catalog keys so the
// normal locale lookup and English fallback remain in charge.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import type { FigmaImportResult } from '@open-design/contracts';
import { Button, VisuallyHidden } from '@open-design/components';
import { Icon } from './Icon';
import { useT } from '../i18n';
import { modalOverlay, modalContent } from '../motion';
import { importProjectFigma } from '../providers/registry';
import styles from './FigmaImportModal.module.css';

interface Props {
  onClose: () => void;
  /** Resolve the project to import into — an existing id (chat) or a freshly
   *  created one (homepage). Null means it couldn't be resolved. */
  resolveProjectId: () => Promise<string | null>;
  /** Fired after a successful `.fig` import with the snapshot + project id. */
  onImported: (result: FigmaImportResult, projectId: string) => void;
  /** Fired when the user submits a Figma URL instead of a file; omit to hide
   *  the URL tab. */
  onFigmaUrl?: (url: string, notes: string) => void | Promise<void>;
}

type Mode = 'file' | 'url';
type Status = 'idle' | 'importing' | 'done' | 'error';
type ErrorTarget = 'file' | 'url';
interface ImportError {
  message: string;
  target: ErrorTarget;
  invalid: boolean;
}

export const FIGMA_URL_RE = /^https:\/\/(?:www\.)?figma\.com\/(?:file|design)\/[A-Za-z0-9]+(?:\/[A-Za-z0-9._~-]+)?(?:\?[^#\s]*)?(?:#[^\s]*)?$/;
const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const FILE_INPUT_ID = 'figma-import-file';
const FILE_INPUT_LABEL_ID = 'figma-import-file-label';
const FILE_INPUT_HELPER_ID = 'figma-import-file-helper';

export function FigmaImportModal({ onClose, resolveProjectId, onImported, onFigmaUrl }: Props) {
  const t = useT();
  const [mode, setMode] = useState<Mode>('file');
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<ImportError | null>(null);
  const [result, setResult] = useState<FigmaImportResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const focusFileInputAfterModeRef = useRef(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(
    typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );

  useEffect(() => {
    const modal = modalRef.current;
    if (modal) {
      const first = modal.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      first?.focus();
    }
    return () => {
      const opener = openerRef.current;
      openerRef.current = null;
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  useEffect(() => {
    if (mode !== 'file' || !focusFileInputAfterModeRef.current) return;
    focusFileInputAfterModeRef.current = false;
    inputRef.current?.focus();
  }, [mode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && status !== 'importing') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const dialog = modalRef.current;
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) {
        e.preventDefault();
        dialog.focus();
        return;
      }
      const activeElement = document.activeElement;
      const activeIndex = activeElement instanceof HTMLElement ? focusable.indexOf(activeElement) : -1;
      if (activeIndex === -1) {
        e.preventDefault();
        (e.shiftKey ? focusable[focusable.length - 1] : focusable[0]).focus();
      } else if (e.shiftKey && activeIndex === 0) {
        e.preventDefault();
        focusable[focusable.length - 1].focus();
      } else if (!e.shiftKey && activeIndex === focusable.length - 1) {
        e.preventDefault();
        focusable[0].focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, status]);

  const pickFile = useCallback((files: File[]) => {
    if (files.length === 0) return;
    focusFileInputAfterModeRef.current = true;
    setMode('file');
    if (mode === 'file') {
      focusFileInputAfterModeRef.current = false;
      inputRef.current?.focus();
    }
    const fig = files.find((f) => f.name.toLowerCase().endsWith('.fig'));
    if (!fig) {
      setFile(null);
      setError({
        message: t('dsCreate.figmaInvalidFile'),
        target: 'file',
        invalid: true,
      });
      return;
    }
    setFile(fig);
    setError(null);
  }, [mode, t]);

  const runImport = useCallback(async () => {
    if (!file) return;
    setStatus('importing');
    setError(null);
    const projectId = await resolveProjectId();
    if (!projectId) {
      setStatus('error');
      setError({
        message: t('dsCreate.figmaProjectUnavailable'),
        target: 'file',
        invalid: false,
      });
      return;
    }
    const outcome = await importProjectFigma(projectId, file, notes ? { notes } : undefined);
    if (!outcome.ok) {
      setStatus('error');
      setError({
        message: outcome.error || t('dsCreate.figmaImportFailed'),
        target: 'file',
        invalid: false,
      });
      return;
    }
    setResult(outcome.result);
    setStatus('done');
    // Close first so a host callback that focuses the underlying composer
    // never runs while this aria-modal surface is still mounted.
    onClose();
    // Hand the snapshot + prompt to the host (prefill composer / navigate).
    onImported(outcome.result, projectId);
  }, [file, notes, resolveProjectId, onClose, onImported, t]);

  const submitUrl = useCallback(async () => {
    const trimmed = url.trim();
    if (!FIGMA_URL_RE.test(trimmed)) {
      setError({
        message: t('dsCreate.figmaInvalidUrl'),
        target: 'url',
        invalid: true,
      });
      return;
    }
    setStatus('importing');
    setError(null);
    try {
      await onFigmaUrl?.(trimmed, notes.trim());
      setStatus('done');
      onClose();
    } catch (caught) {
      setStatus('error');
      setError({
        message: caught instanceof Error && caught.message.trim()
          ? caught.message
          : t('dsCreate.figmaImportFailed'),
        target: 'url',
        invalid: false,
      });
    }
  }, [url, notes, onFigmaUrl, onClose, t]);

  const activateMode = useCallback((next: Mode) => {
    setMode(next);
    setError(null);
    document.getElementById(`figma-import-tab-${next}`)?.focus();
  }, []);

  const onTabKeyDown = useCallback((event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (!onFigmaUrl) return;
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next: Mode = event.key === 'Home'
      ? 'file'
      : event.key === 'End'
        ? 'url'
        : mode === 'file'
          ? 'url'
          : 'file';
    activateMode(next);
  }, [activateMode, mode, onFigmaUrl]);

  const importing = status === 'importing';

  const modal = (
    <motion.div
      className={styles.backdrop}
      onClick={() => (importing ? undefined : onClose())}
      // Swallow drag/drop on the backdrop so a near-miss never makes the
      // browser navigate to (open) the dropped .fig and lose the dialog.
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => e.preventDefault()}
      variants={modalOverlay}
      initial="hidden"
      animate="visible"
      exit="exit"
      role="presentation"
    >
      <motion.div
        className={styles.modal}
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        // The whole dialog is a drop target (not just the inner dashed zone),
        // so dropping a .fig anywhere in the modal captures it.
        onDragOver={(e) => {
          e.preventDefault();
          if (status !== 'done') setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (status !== 'done') pickFile(Array.from(e.dataTransfer.files ?? []));
        }}
        variants={modalContent}
        initial="hidden"
        animate="visible"
        exit="exit"
        role="dialog"
        aria-modal="true"
        aria-labelledby="figma-import-title"
      >
        <header className={styles.head}>
          <span className={styles.headTitle} id="figma-import-title">
            <Icon name="import" size={16} /> {t('dsCreate.figmaImportTitle')}
          </span>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label={t('common.close')} disabled={importing}>
            <Icon name="close" size={18} />
          </button>
        </header>

        {status === 'done' && result ? (
          <div className={styles.body}>
            <FigmaImportSummary result={result} />
          </div>
        ) : (
          <>
            <div className={styles.body}>
            {onFigmaUrl ? (
              <div className={styles.tabs} role="tablist" aria-label={t('dsCreate.figmaImportSource')}>
                <button
                  id="figma-import-tab-file"
                  type="button"
                  role="tab"
                  aria-selected={mode === 'file'}
                  aria-controls="figma-import-panel-file"
                  tabIndex={mode === 'file' ? 0 : -1}
                  className={styles.tab}
                  data-active={mode === 'file'}
                  onClick={() => activateMode('file')}
                  onKeyDown={onTabKeyDown}
                >
                  {t('dsCreate.uploadFigLabel')}
                </button>
                <button
                  id="figma-import-tab-url"
                  type="button"
                  role="tab"
                  aria-selected={mode === 'url'}
                  aria-controls="figma-import-panel-url"
                  tabIndex={mode === 'url' ? 0 : -1}
                  className={styles.tab}
                  data-active={mode === 'url'}
                  onClick={() => activateMode('url')}
                  onKeyDown={onTabKeyDown}
                >
                  {t('dsCreate.figmaUrl')}
                </button>
              </div>
            ) : null}

            {mode === 'file' ? (
              <div
                id="figma-import-panel-file"
                role={onFigmaUrl ? 'tabpanel' : undefined}
                aria-labelledby={onFigmaUrl ? 'figma-import-tab-file' : undefined}
                aria-label={!onFigmaUrl ? t('dsCreate.uploadFigLabel') : undefined}
                tabIndex={onFigmaUrl ? 0 : undefined}
                className={styles.tabPanel}
              >
                <div className={styles.filePicker}>
                  <label
                    htmlFor={FILE_INPUT_ID}
                    className={styles.dropzone}
                    data-drag={dragOver ? 'true' : 'false'}
                    onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragOver={(e) => e.preventDefault()}
                    onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDragOver(false);
                      pickFile(Array.from(e.dataTransfer.files ?? []));
                    }}
                  >
                    <VisuallyHidden id={FILE_INPUT_LABEL_ID}>{t('dsCreate.uploadFigLabel')}</VisuallyHidden>
                    <Icon name={file ? 'check' : 'upload'} size={26} className={styles.dropIcon} />
                    <span className={styles.dropTitle}>
                      {file ? file.name : t('dsCreate.uploadFigPrompt')}
                    </span>
                    <span id={FILE_INPUT_HELPER_ID} className={styles.dropHint}>
                      {t('dsCreate.uploadFigHelper')}
                    </span>
                  </label>
                  <input
                    ref={inputRef}
                    id={FILE_INPUT_ID}
                    type="file"
                    accept=".fig"
                    className={styles.fileInput}
                    aria-labelledby={FILE_INPUT_LABEL_ID}
                    aria-invalid={error?.target === 'file' && error.invalid ? true : undefined}
                    aria-describedby={error?.target === 'file'
                      ? `${FILE_INPUT_HELPER_ID} figma-import-error`
                      : FILE_INPUT_HELPER_ID}
                    onChange={(e) => {
                      pickFile(Array.from(e.target.files ?? []));
                      e.target.value = '';
                    }}
                  />
                </div>
              </div>
            ) : (
              <div
                id="figma-import-panel-url"
                role="tabpanel"
                aria-labelledby="figma-import-tab-url"
                tabIndex={0}
                className={styles.tabPanel}
              >
                <div className={styles.urlPane}>
                  <label className={styles.fieldLabel} htmlFor="figma-import-url">{t('dsCreate.figmaUrl')}</label>
                  <input
                    id="figma-import-url"
                    type="url"
                    className={styles.urlInput}
                    placeholder={t('dsCreate.figmaPlaceholder')}
                    aria-invalid={error?.target === 'url' && error.invalid ? true : undefined}
                    aria-describedby={error?.target === 'url' ? 'figma-import-error' : undefined}
                    value={url}
                    onChange={(e) => { setUrl(e.target.value); setError(null); }}
                  />
                  <p className={styles.dropHint}>
                    {t('dsCreate.figmaConnectorHelper')}
                  </p>
                </div>
              </div>
            )}

            <div className={styles.notesField}>
              <label className={styles.fieldLabel} htmlFor="figma-import-notes">{t('dsCreate.notes')}</label>
              <textarea
                id="figma-import-notes"
                className={styles.notes}
                placeholder={t('dsCreate.notesPlaceholder')}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>

            {error ? <p id="figma-import-error" className={styles.error} role="alert" aria-live="assertive">{error.message}</p> : null}
            </div>

            <footer className={styles.foot}>
              <Button variant="ghost" onClick={onClose} disabled={importing}>{t('common.cancel')}</Button>
              {mode === 'file' ? (
                <Button onClick={() => void runImport()} disabled={!file || importing}>
                  {importing ? (<><Icon name="spinner" size={14} className={styles.spin} /> {t('dsCreate.figmaDecoding')}</>) : t('dsCreate.figmaImportAction')}
                </Button>
              ) : (
                <Button onClick={() => void submitUrl()} disabled={!url.trim() || importing}>
                  {importing ? (<><Icon name="spinner" size={14} className={styles.spin} /> {t('dsCreate.figmaImporting')}</>) : t('dsCreate.figmaImportAction')}
                </Button>
              )}
            </footer>
          </>
        )}
      </motion.div>
    </motion.div>
  );

  if (typeof document === 'undefined') return modal;
  return createPortal(modal, document.body);
}

function FigmaImportSummary({ result }: { result: FigmaImportResult }) {
  const t = useT();
  const inv = result.inventory;
  return (
    <div className={styles.summaryPane}>
      <p className={styles.summaryLead}>
        <Icon name="check" size={15} /> {t('dsCreate.figmaImported')} <strong>{result.label}</strong>
        {inv.decoded ? '' : ` (${t('dsCreate.figmaAssetsOnly')})`}
      </p>
      <ul className={styles.summaryStats}>
        <li><strong>{inv.nodeCount}</strong> {t('dsCreate.figmaNodes')}</li>
        <li><strong>{inv.pageCount}</strong> {t('dsCreate.figmaPages')}</li>
        <li><strong>{inv.frameCount}</strong> {t('dsCreate.figmaFrames')}</li>
        <li><strong>{inv.componentCount}</strong> {t('dsCreate.figmaComponents')}</li>
        <li><strong>{inv.colors.length}</strong> {t('dsCreate.figmaColors')}</li>
        <li><strong>{inv.fonts.length}</strong> {t('dsCreate.figmaFonts')}</li>
        <li><strong>{inv.assetCount}</strong> {t('dsCreate.figmaAssets')}</li>
      </ul>
      {inv.colors.length ? (
        <div className={styles.swatches} aria-label={t('dsCreate.figmaColorTokens')}>
          {inv.colors.slice(0, 16).map((c) => (
            <span key={c} className={styles.swatch} style={{ background: c }} title={c} />
          ))}
        </div>
      ) : null}
      <p className={styles.summaryFoot}>{t('dsCreate.figmaSummaryFoot')}</p>
    </div>
  );
}

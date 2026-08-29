import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { DestructiveGate, type DestructiveGateOutcome } from './destructive/DestructiveGate';
import { RegexSearchField } from './regex/RegexSearchField';
import { useRegexSearch } from './regex/useRegexSearch';
import { ConverterSearchableChoice, usePersistedConverterSearch, type ConverterChoiceOption } from './converter/ConverterSearchableChoice';
import { CATEGORY_COPY_KEYS, useConverterCopy } from './converter/converterCopy';
import { getFileConverterBridge, type ConverterAdapter, type ConverterFile, type ConverterHistoryEvent, type ConverterNotification, type ConverterPreview, type ConverterQueueItem, type DisclosureAcknowledgement } from './converter/converterBridge';
import styles from './FileConverterView.module.css';

type Category = 'documents-pdf' | 'images' | 'audio' | 'video' | 'archives' | 'structured-data' | 'code-text' | 'binary-encodings';
type QueueRow = ConverterQueueItem;

const CATEGORIES: readonly Category[] = ['documents-pdf', 'images', 'audio', 'video', 'archives', 'structured-data', 'code-text', 'binary-encodings'];

const FALLBACK_CATALOG: ConverterAdapter[] = [
  { id: 'structured-data-local', category: 'structured-data', label: 'Structured data and spreadsheet adapter', sourceFormats: ['json', 'jsonl', 'csv', 'tsv', 'yaml', 'toml', 'xml'], targetFormats: ['txt'], bundled: false, unavailableReason: 'Awaiting verified packaged adapter proof.', capabilities: { inspect: true, convert: false, preview: true, batch: true, lossless: true, metadata: false, encoding: 'UTF-8', incrementalProgress: true }, bounds: { maxInputBytes: 33554432, maxOutputBytes: 67108864 } },
  { id: 'text-structured-local', category: 'code-text', label: 'Code and text document adapter', sourceFormats: ['txt', 'md', 'markdown', 'json', 'jsonl', 'csv', 'tsv', 'yaml', 'toml', 'xml', 'html', 'js', 'ts'], targetFormats: ['txt', 'md', 'markdown', 'html'], bundled: false, unavailableReason: 'Awaiting verified packaged adapter proof.', capabilities: { inspect: true, convert: false, preview: true, batch: true, lossless: true, metadata: false, encoding: 'UTF-8', incrementalProgress: true }, bounds: { maxInputBytes: 33554432, maxOutputBytes: 67108864 } },
  { id: 'pdf-local-bounded', category: 'documents-pdf', label: 'PDF document inspector', sourceFormats: ['pdf'], targetFormats: [], bundled: false, unavailableReason: 'Awaiting verified packaged adapter proof. Content-preserving PDF edits remain unavailable.', capabilities: { inspect: false, convert: false, preview: false, batch: false, lossless: false, metadata: true, encoding: 'PDF object inspection only', incrementalProgress: false }, bounds: { maxInputBytes: 268435456, maxOutputBytes: 536870912 } },
  { id: 'binary-inspector-local', category: 'binary-encodings', label: 'Binary inspection adapter', sourceFormats: ['png', 'jpeg', 'gif', 'webp', 'zip', 'gz', 'mp3', 'ogg', 'flac', 'mp4'], targetFormats: ['hex', 'base64'], bundled: false, unavailableReason: 'Awaiting verified packaged adapter proof.', capabilities: { inspect: true, convert: false, preview: true, batch: true, lossless: true, metadata: false, encoding: 'binary', incrementalProgress: true }, bounds: { maxInputBytes: 33554432, maxOutputBytes: 67108864 } },
  { id: 'image-pixel-adapter', category: 'images', label: 'Image conversion adapter', sourceFormats: ['png', 'jpeg', 'webp'], targetFormats: ['png', 'jpeg', 'webp'], bundled: false, unavailableReason: 'Bundled pixel codec is not present in this build.', capabilities: { inspect: false, convert: false, preview: false, batch: false, lossless: false, metadata: false, encoding: 'unavailable', incrementalProgress: false }, bounds: {} },
  { id: 'audio-transcode-adapter', category: 'audio', label: 'Audio conversion adapter', sourceFormats: ['mp3', 'wav', 'flac'], targetFormats: ['mp3', 'wav', 'flac'], bundled: false, unavailableReason: 'Bundled audio codec is not present in this build.', capabilities: { inspect: false, convert: false, preview: false, batch: false, lossless: false, metadata: false, encoding: 'unavailable', incrementalProgress: false }, bounds: {} },
  { id: 'video-transcode-adapter', category: 'video', label: 'Video conversion adapter', sourceFormats: ['mp4', 'webm', 'mov'], targetFormats: ['mp4', 'webm'], bundled: false, unavailableReason: 'Bundled video codec is not present in this build.', capabilities: { inspect: false, convert: false, preview: false, batch: false, lossless: false, metadata: false, encoding: 'unavailable', incrementalProgress: false }, bounds: {} },
  { id: 'archive-adapter', category: 'archives', label: 'Archive conversion adapter', sourceFormats: ['zip', '7z', 'tar'], targetFormats: ['zip', '7z'], bundled: false, unavailableReason: 'Bundled archive codec is not present in this build.', capabilities: { inspect: false, convert: false, preview: false, batch: false, lossless: false, metadata: false, encoding: 'unavailable', incrementalProgress: false }, bounds: {} },
];

const PDF_OPERATIONS: readonly ConverterChoiceOption[] = [
  { value: 'inspect', label: 'Inspect' },
  { value: 'split', label: 'Split', disabled: true, disabledReason: 'Unavailable without a content-preserving rewrite engine.' },
  { value: 'merge', label: 'Merge', disabled: true, disabledReason: 'Unavailable without a content-preserving rewrite engine.' },
  { value: 'extract', label: 'Extract text', disabled: true, disabledReason: 'Unavailable without a content-preserving rewrite engine.' },
  { value: 'reorder', label: 'Reorder', disabled: true, disabledReason: 'Unavailable without a content-preserving rewrite engine.' },
  { value: 'rotate', label: 'Rotate', disabled: true, disabledReason: 'Unavailable without a content-preserving rewrite engine.' },
  { value: 'metadata', label: 'Metadata', disabled: true, disabledReason: 'Unavailable without a content-preserving rewrite engine.' },
];

function readConverterPreference(key: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  try { return window.localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}

function writeConverterPreference(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(key, value); } catch { /* local preference storage is best effort */ }
}

function AdapterTargetChoice({ category, adapter, value, onChange, source, destination, busy, copy, focusScopeId }: { category: Category; adapter: ConverterAdapter; value: string; onChange: (value: string) => void; source: ConverterFile | null; destination: ConverterFile | null; busy: boolean; copy: ReturnType<typeof useConverterCopy>; focusScopeId: string }) {
  const search = usePersistedConverterSearch(`material-designer:converter:${category}:${adapter.id}:target`);
  const options = adapter.targetFormats.map((format) => ({ value: format, label: format }));
  return <ConverterSearchableChoice id={`${adapter.id}-target`} label={copy('targetFormat')} value={value} options={options} onChange={onChange} search={search} searchLabel={copy('targetFormats', { name: adapter.label })} disabled={!source || !destination || busy} disabledReason={copy('desktopRequired')} testId={`${adapter.id}-target-choice`} focusScopeId={focusScopeId} />;
}

function CategoryPanel({ category, adapters, source, destination, onChooseDestination, onPreview, onQueue, onConvert, onPdfAction, preview, busy, disclosureAcknowledgement, onAcknowledgeDisclosure }: { category: Category; adapters: ConverterAdapter[]; source: ConverterFile | null; destination: ConverterFile | null; onChooseDestination: () => void; onPreview: (adapter: ConverterAdapter, target: string) => void; onQueue: (adapter: ConverterAdapter, target: string) => void | Promise<void>; onConvert: (adapter: ConverterAdapter, target: string) => void | Promise<void>; onPdfAction: (operation: string) => void; preview: ConverterPreview | null; busy: boolean; disclosureAcknowledgement: DisclosureAcknowledgement | null; onAcknowledgeDisclosure: () => void | Promise<void> }) {
  const copy = useConverterCopy();
  const categoryLabel = copy(CATEGORY_COPY_KEYS[category]);
  const search = usePersistedConverterSearch(`material-designer:converter:${category}:adapters`);
  const targetSearch = usePersistedConverterSearch(`material-designer:converter:${category}:targets`);
  const operationSearch = usePersistedConverterSearch('material-designer:converter:pdf-operation');
  const [targets, setTargets] = useState<Record<string, string>>(() => {
    try {
      const parsed = JSON.parse(readConverterPreference(`material-designer:converter:${category}:target-values`, '{}')) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      return Object.fromEntries(Object.entries(parsed).filter(([key, value]) => typeof key === 'string' && typeof value === 'string'));
    } catch { return {}; }
  });
  useEffect(() => writeConverterPreference(`material-designer:converter:${category}:target-values`, JSON.stringify(targets)), [category, targets]);
  const [pdfOperation, setPdfOperationState] = useState(() => readConverterPreference('material-designer:converter:pdf-operation:value', 'inspect'));
  const setPdfOperation = (next: string) => { setPdfOperationState(next); writeConverterPreference('material-designer:converter:pdf-operation:value', next); };
  const visible = adapters.filter((adapter) => search.matches(`${adapter.label} ${adapter.sourceFormats.join(' ')} ${adapter.targetFormats.join(' ')} ${adapter.unavailableReason ?? ''}`) && targetSearch.matches(`${adapter.label} ${adapter.targetFormats.join(' ')}`));
  const selectedOperation = PDF_OPERATIONS.some((option) => option.value === pdfOperation) ? pdfOperation : 'inspect';

  return <section className={styles.categoryPanel} aria-labelledby={`${category}-heading`} data-testid={`converter-category-${category}`}>
    <div className={styles.categoryHeader}>
      <h2 id={`${category}-heading`}>{categoryLabel}</h2>
      <span className={styles.resultCount} role="status">{copy('adapters', { name: visible.length })}</span>
    </div>
    <RegexSearchField search={search} fieldLabel={copy('adapters', { name: categoryLabel })} ariaLabel={copy('searchAdapters')} placeholder={copy('searchAdapters')} testId={`converter-search-${category}`} ariaControls={`${category}-adapters`} focusScopeId={`converter-${category}`} />
    <RegexSearchField search={targetSearch} fieldLabel={copy('targetFormats', { name: categoryLabel })} ariaLabel={copy('searchTargets')} placeholder={copy('searchTargets')} testId={`converter-target-search-${category}`} ariaControls={`${category}-targets`} focusScopeId={`converter-${category}-targets`} />
    {category === 'documents-pdf' ? <fieldset className={styles.pdfTools} data-converter-dropdown="pdf-operation">
      <legend>{copy('pdfTools')}</legend>
      <ConverterSearchableChoice id="converter-pdf-operation" label={copy('operation')} value={selectedOperation} options={PDF_OPERATIONS} onChange={setPdfOperation} search={operationSearch} searchLabel={copy('operation')} testId="converter-pdf-operation-choice" focusScopeId="converter-documents-pdf" />
      <button type="button" onClick={() => onPdfAction(selectedOperation)} disabled={!source || (selectedOperation !== 'inspect' && !destination) || busy}>{copy('inspectPdf')}</button>
      <p className={styles.disabledReason}>{copy('pdfUnavailable')}</p>
    </fieldset> : null}
    <div id={`${category}-adapters`} className={styles.adapterList} role="list" aria-label={categoryLabel}>
      {visible.length === 0 ? <p className={styles.empty} role="status">{copy('noAdapters')}</p> : visible.map((adapter) => {
        const target = targets[adapter.id] ?? adapter.targetFormats[0] ?? '';
        return <article key={adapter.id} className={styles.adapterCard} role="listitem" data-bundled={adapter.bundled ? 'true' : 'false'}>
          <div><h3>{adapter.label}</h3><p>{adapter.sourceFormats.join(', ')} → {adapter.targetFormats.join(', ') || copy('inspect')}</p><small>{adapter.bundled ? copy('bundledOffline', { encoding: String(adapter.capabilities.encoding) }) : copy('unavailable', { reason: adapter.unavailableReason ?? copy('unavailable', { reason: 'No bundled adapter.' }) })}</small></div>
          <div className={styles.adapterActions}>
            {adapter.bundled && adapter.targetFormats.length > 0 ? <>
              <AdapterTargetChoice category={category} adapter={adapter} value={target} onChange={(next) => setTargets((current) => ({ ...current, [adapter.id]: next }))} source={source} destination={destination} busy={busy} copy={copy} focusScopeId={`converter-${category}-${adapter.id}`} />
              <button type="button" onClick={() => onPreview(adapter, target)} disabled={!source || !destination || !target || busy}>{copy('preview')}</button>
              <button type="button" onClick={() => onQueue(adapter, target)} disabled={!source || !destination || !target || busy}>{copy('addQueue')}</button>
              <button type="button" onClick={() => onConvert(adapter, target)} disabled={!source || !destination || !target || busy}>{copy('convertNow')}</button>
            </> : <span className={styles.disabledReason}>{adapter.unavailableReason ?? copy('inspect')}</span>}
          </div>
        </article>;
      })}
    </div>
    {preview?.adapterId ? <div className={styles.preview} role="region" aria-label={copy('conversionPreview')}><strong>{copy('conversionPreview')}: {preview.targetFormat}</strong><span>{preview.source.format}, {preview.source.bytes} bytes</span><p>{preview.disclosure}</p>{preview.lossy ? <button type="button" onClick={() => void onAcknowledgeDisclosure()} disabled={Boolean(disclosureAcknowledgement) || busy}>{disclosureAcknowledgement ? copy('disclosureAcknowledged') : copy('acknowledgeDisclosure')}</button> : null}</div> : null}
    <button type="button" className={styles.browseButton} onClick={onChooseDestination}>{copy('chooseDestination')}</button>
  </section>;
}

export function FileConverterView() {
  const copy = useConverterCopy();
  const [catalog, setCatalog] = useState<ConverterAdapter[]>(FALLBACK_CATALOG);
  const [activeCategory, setActiveCategory] = useState<Category>('documents-pdf');
  const [source, setSource] = useState<ConverterFile | null>(null);
  const [sources, setSources] = useState<ConverterFile[]>([]);
  const [destination, setDestination] = useState<ConverterFile | null>(null);
  const [browserFile, setBrowserFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ConverterPreview | null>(null);
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [queueNextCursor, setQueueNextCursor] = useState<string | undefined>();
  const [queuePageNumber, setQueuePageNumber] = useState(1);
  const queueCursorRef = useRef<string | undefined>(undefined);
  const [selectedQueue, setSelectedQueue] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState(() => copy('chooseSourceNotice'));
  const [notificationHistory, setNotificationHistory] = useState<ConverterNotification[]>([]);
  const [localHistoryEvents, setLocalHistoryEvents] = useState<ConverterHistoryEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [overwriteGate, setOverwriteGate] = useState<{ previewId: string; acknowledgementToken?: string } | null>(null);
  const [disclosureAcknowledgement, setDisclosureAcknowledgement] = useState<DisclosureAcknowledgement | null>(null);
  const [contextMenu, setContextMenu] = useState(false);
  const [contextQuery, setContextQuery] = useState('');
  const host = useMemo(() => getFileConverterBridge(), []);
  const contextSearch = useRegexSearch(contextQuery, setContextQuery);
  const adapters = catalog.filter((adapter) => adapter.category === activeCategory);

  useEffect(() => {
    let active = true;
    void host?.catalog().then((next) => { if (active && next.length > 0) setCatalog([...next]); }).catch(() => setMessage(copy('unavailable', { reason: 'The bundled adapter catalog is unavailable, so the local fallback catalog is shown.' })));
    return () => { active = false; };
  }, [copy, host]);

  const loadQueuePage = async (cursor: string | undefined, pageNumber: number) => {
    if (!host) return;
    const next = await host.queue.page(cursor, 100);
    if ('items' in next) {
      queueCursorRef.current = cursor;
      setQueue([...next.items]);
      setQueueNextCursor(next.nextCursor);
      setQueuePageNumber(pageNumber);
      setSelectedQueue(new Set());
    } else setMessage(next.reason);
  };
  const refreshQueue = async () => loadQueuePage(queueCursorRef.current, queuePageNumber);
  const resetQueue = async () => loadQueuePage(undefined, 1);
  const nextQueuePage = async () => {
    if (queueNextCursor == null) return;
    await loadQueuePage(queueNextCursor, queuePageNumber + 1);
  };
  useEffect(() => { void refreshQueue(); if (!host) return; const timer = window.setInterval(() => void refreshQueue(), 750); return () => window.clearInterval(timer); }, [host]);
  useEffect(() => {
    if (!host?.notifications?.page) return;
    void host.notifications.page(undefined, 200).then((page) => { if (!('reason' in page)) setNotificationHistory([...page.items]); }).catch(() => undefined);
  }, [host, message]);
  useEffect(() => {
    if (!host?.history?.page) return;
    void host.history.page(undefined, 200).then((page) => { if (!('reason' in page)) setLocalHistoryEvents([...page.items]); }).catch(() => undefined);
  }, [host, message]);
  const clearPreview = () => {
    setPreview(null);
    setDisclosureAcknowledgement(null);
  };

  const pickSource = async () => {
    if (!host) { setMessage(copy('desktopRequired')); return; }
    const result = await host.pickSources();
    if (Array.isArray(result)) { setSources([...result]); setSource(result[0] ?? null); clearPreview(); setMessage(copy('sourcesSelected', { n: result.length })); }
    else if ('canceled' in result) setMessage(copy('cancelled', { what: 'Source' }));
    else setMessage(result.reason);
  };
  const pickDestination = async () => {
    if (!host) { setMessage(copy('desktopRequired')); return; }
    const result = await host.pickDestination('converted-output');
    if ('handle' in result) { setDestination(result); clearPreview(); setMessage(copy('destinationSelected', { name: result.name })); }
    else if ('canceled' in result) setMessage(copy('cancelled', { what: 'Destination' }));
    else setMessage(result.reason);
  };
  const onBrowserSource = (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0] ?? null; setBrowserFile(file); clearPreview(); if (file) setMessage(copy('browserSourceSelected', { name: file.name, bytes: file.size })); };
  const runPreview = async (adapter: ConverterAdapter, target: string) => {
    if (!host || !source || !destination) { setMessage(copy('desktopRequired')); return; }
    setBusy(true);
    try { const result = await host.preview(source.handle, destination.handle, adapter.id, target); if ('reason' in result) setMessage(result.reason); else { setPreview(result); setDisclosureAcknowledgement(null); setMessage(`${copy('previewReady', { target })} ${copy('reviewDisclosure')}`); } }
    finally { setBusy(false); }
  };
  const acknowledgeDisclosure = async () => {
    if (!host || !preview?.lossy) { setMessage(copy('disclosureRequired')); return; }
    setBusy(true);
    try {
      const result = await host.acknowledgeDisclosure(preview.previewId);
      if ('reason' in result) setMessage(result.reason);
      else { setDisclosureAcknowledgement(result); setMessage(copy('disclosureAcknowledged')); }
    } finally { setBusy(false); }
  };
  const addToQueue = async (adapter: ConverterAdapter, target: string) => {
    if (!host || !source || !destination) { setMessage(copy('desktopRequired')); return; }
    if (!preview || preview.adapterId !== adapter.id || preview.targetFormat !== target) { setMessage(copy('previewRequired')); return; }
    if (preview.lossy && (!disclosureAcknowledgement || disclosureAcknowledgement.previewId !== preview.previewId)) { setMessage(copy('disclosureRequired')); return; }
    if (preview.lossy) { setMessage(copy('lossyQueueUnavailable')); return; }
    const result = await host.queue.enqueue(preview.previewId, disclosureAcknowledgement?.token);
    if ('reason' in result) setMessage(result.reason); else { clearPreview(); setMessage(copy('queued', { name: result.sourceName, target })); await refreshQueue(); }
  };
  const convertNow = async (adapter: ConverterAdapter, target: string) => {
    if (!host || !source || !destination) { setMessage(copy('desktopRequired')); return; }
    if (!preview || preview.adapterId !== adapter.id || preview.targetFormat !== target) { setMessage(copy('previewRequired')); return; }
    if (preview.lossy && (!disclosureAcknowledgement || disclosureAcknowledgement.previewId !== preview.previewId)) { setMessage(copy('disclosureRequired')); return; }
    setBusy(true);
    try {
      if (destination.exists === true) { setOverwriteGate({ previewId: preview.previewId, acknowledgementToken: disclosureAcknowledgement?.token }); return; }
      const converted = await host.convert(preview.previewId, disclosureAcknowledgement?.token);
      if (converted.ok) { clearPreview(); setMessage(copy('conversionComplete')); } else setMessage(converted.status === 'cancelled' ? copy('conversionCancelled') : copy('conversionFailed', { reason: converted.reason }));
    } finally { setBusy(false); }
  };
  const startQueue = async () => { if (!host) { setMessage(copy('desktopRequired')); return; } setBusy(true); const result = await host.queue.start(); setMessage(result.ok ? copy('queueStarted') : result.reason); await refreshQueue(); setBusy(false); };
  const cancelQueue = async () => { if (!host) return; await host.queue.cancel(); await refreshQueue(); setMessage(copy('queueCancelled')); };
  const pauseQueue = async () => { if (!host) return; await host.queue.pause(); await refreshQueue(); setMessage(copy('queuePaused')); };
  const resumeQueue = async () => { if (!host) return; await host.queue.resume(); await refreshQueue(); setMessage(copy('queueResumed')); };
  const toggleAllQueue = () => setSelectedQueue((current) => current.size === queue.length ? new Set() : new Set(queue.map((item) => item.id)));
  const cancelSelectedQueue = async () => { if (!host) return; await host.queue.cancel([...selectedQueue]); setSelectedQueue(new Set()); await refreshQueue(); setMessage(copy('selectedCancelled')); };
  const retrySelectedQueue = async () => { if (!host) return; const result = await host.queue.retry(selectedQueue.size > 0 ? [...selectedQueue] : undefined); setSelectedQueue(new Set()); await refreshQueue(); setMessage(result.ok ? copy('selectedRetried') : result.reason); };
  const runPdfOperation = async (operation: string) => { if (!host || !source || (operation !== 'inspect' && !destination)) { setMessage(copy('desktopRequired')); return; } setBusy(true); try { const result = await host.pdfOperation(source.handle, destination?.handle ?? '', operation, {}, operation === 'merge' ? sources.map((item) => item.handle) : undefined, undefined); setMessage('reason' in result ? result.reason : `${copy('inspectPdf')} ${operation}.`); } finally { setBusy(false); } };
  const exportQueue = async () => {
    if (!host) return;
    setBusy(true);
    try {
      const destination = await host.pickDestination('converter-queue.json');
      if ('reason' in destination) { setMessage(destination.reason); return; }
      if ('canceled' in destination) { setMessage(copy('cancelled', { what: 'Queue export' })); return; }
      const result = await host.queue.export(destination.handle);
      setMessage('reason' in result ? result.reason : copy('queueExported'));
    } catch (error) {
      setMessage(copy('conversionFailed', { reason: error instanceof Error ? error.message : 'The complete queue could not be exported.' }));
    } finally {
      setBusy(false);
    }
  };
  const contextMatches = (label: string) => contextSearch.matches(label);
  const dispatchTargetAction = (type: 'appearance' | 'toy-lock') => {
    if (typeof window === 'undefined') return false;
    const event = new CustomEvent(type === 'appearance' ? 'od:appearance:request' : 'od:toy-lock:request', { bubbles: true, cancelable: true, detail: { targetId: 'file-converter-surface' } });
    const handled = !window.dispatchEvent(event);
    if (handled) setMessage(type === 'appearance' ? copy('editAppearance') : copy('lockElement'));
    else setMessage(copy('integrationRequired'));
    return handled;
  };
  const completeOverwrite = async (): Promise<boolean> => {
    if (!host || !overwriteGate) return false;
    const challenge = await host.requestOverwrite(overwriteGate.previewId);
    if ('reason' in challenge) { setMessage(challenge.reason); return false; }
    const result = await host.overwrite(overwriteGate.previewId, challenge.token, overwriteGate.acknowledgementToken);
    if (result.ok) { clearPreview(); setMessage(copy('conversionComplete')); return true; }
    setMessage(result.status === 'cancelled' ? copy('conversionCancelled') : copy('conversionFailed', { reason: result.reason }));
    return false;
  };
  const closeOverwrite = (outcome: DestructiveGateOutcome) => { if (outcome === 'cancelled') setMessage(copy('overwriteFailed')); setOverwriteGate(null); };

  const activeLabel = copy(CATEGORY_COPY_KEYS[activeCategory]);
  return <main className={styles.surface} data-testid="file-converter-view" onContextMenu={(event) => { event.preventDefault(); setContextQuery(''); setContextMenu(true); }}>
    <header className={styles.header}><div><p className={styles.eyebrow}>{copy('localTools')}</p><h1>{copy('title')}</h1><p>{copy('description')}</p></div><div className={styles.sourceActions}><button type="button" onClick={() => void pickSource()}>{copy('chooseSources')}</button><label className={styles.browserFallback}>{copy('browserFallback')}<input type="file" onChange={onBrowserSource} aria-label={copy('browserFallback')} /></label><span>{sources.length > 0 ? copy('sourcesSelected', { n: sources.length }) : source?.name ?? browserFile?.name ?? copy('noSource')}</span></div></header>
    <div className={styles.notice} role="status" aria-live="polite">{message}</div>
    <nav className={styles.tabs} role="tablist" aria-label={copy('title')}>{CATEGORIES.map((category) => <button key={category} type="button" role="tab" aria-selected={activeCategory === category} aria-controls={`${category}-panel`} onClick={() => setActiveCategory(category)}>{copy(CATEGORY_COPY_KEYS[category])}</button>)}</nav>
    <div id={`${activeCategory}-panel`} role="tabpanel" aria-label={activeLabel}>
      <CategoryPanel category={activeCategory} adapters={adapters} source={source} destination={destination} onChooseDestination={() => void pickDestination()} onPreview={(adapter, target) => void runPreview(adapter, target)} onQueue={addToQueue} onConvert={convertNow} onPdfAction={(operation) => void runPdfOperation(operation)} preview={preview} busy={busy} disclosureAcknowledgement={disclosureAcknowledgement} onAcknowledgeDisclosure={acknowledgeDisclosure} />
    </div>
    <section className={styles.queue} aria-labelledby="converter-queue-title" data-converter-queue-page={queuePageNumber}><div className={styles.queueHeader}><h2 id="converter-queue-title">{copy('queueTitle')}</h2><span role="status">{copy('queuePageRecords', { n: queue.length, page: queuePageNumber })}</span><div><button type="button" onClick={() => void startQueue()} disabled={busy || queue.every((item) => item.state !== 'queued')}>{copy('start')}</button><button type="button" onClick={() => void pauseQueue()} disabled={busy || queue.every((item) => item.state !== 'queued')}>{copy('pause')}</button><button type="button" onClick={() => void resumeQueue()} disabled={busy || queue.every((item) => item.state !== 'paused')}>{copy('resume')}</button><button type="button" onClick={() => void cancelQueue()} disabled={busy || queue.every((item) => item.state !== 'running' && item.state !== 'queued' && item.state !== 'paused')}>{copy('cancel')}</button><button type="button" onClick={() => void cancelSelectedQueue()} disabled={selectedQueue.size === 0}>{copy('cancelSelected')}</button><button type="button" onClick={() => void retrySelectedQueue()} disabled={selectedQueue.size === 0}>{copy('retrySelected')}</button><button type="button" onClick={exportQueue} disabled={!host}>{copy('exportQueue')}</button><button type="button" onClick={() => void resetQueue()} disabled={!host || queuePageNumber === 1}>{copy('firstQueuePage')}</button><button type="button" onClick={() => void nextQueuePage()} disabled={!host || !queueNextCursor}>{copy('nextQueuePage')}</button></div></div>{queue.length === 0 ? <p className={styles.empty}>{copy('emptyQueue')}</p> : <><label className={styles.selectAll}><input type="checkbox" checked={selectedQueue.size === queue.length} onChange={toggleAllQueue} /> {copy('selectAllPage')}</label><ul>{queue.map((item) => <li key={item.id}><label><input type="checkbox" checked={selectedQueue.has(item.id)} onChange={() => setSelectedQueue((current) => { const next = new Set(current); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); })} aria-label={item.sourceName} /> <span>{item.sourceName} → {item.destinationName}</span></label><progress max={item.totalBytes ?? 1} value={item.totalBytes && item.totalBytes > 0 ? Math.min(item.totalBytes, item.bytesProcessed) : item.state === 'converted' ? 1 : 0}>{item.totalBytes && item.totalBytes > 0 ? Math.round((item.bytesProcessed / item.totalBytes) * 100) : 0}%</progress><strong>{item.state}</strong>{item.bytesPerSecond ? <small>{item.bytesPerSecond} bytes/s</small> : null}{item.reason ? <small>{item.reason}</small> : null}</li>)}</ul></>}</section>
    <section className={styles.auditColumns} aria-label={copy('historyDisclosure')}><div data-converter-notification-history><h2>{copy('notificationHistory')}</h2><ul>{notificationHistory.map((entry) => <li key={entry.id}><button type="button" onClick={() => void host?.notifications?.markRead([entry.id])}>{entry.title}: {entry.body}</button></li>)}</ul></div><div data-converter-local-history><h2>{copy('localHistory')}</h2><p>{copy('historyDisclosure')}</p><ul>{localHistoryEvents.map((entry) => <li key={entry.id}>{entry.summary} ({entry.createdAt})</li>)}</ul></div></section>
    {contextMenu ? <aside className={styles.contextMenu} role="menu" aria-label={copy('contextActions')}><RegexSearchField search={contextSearch} fieldLabel={copy('contextActions')} ariaLabel={copy('contextActions')} placeholder={copy('contextActions')} testId="converter-context-search" focusScopeId="converter-context-menu" />{contextMatches(copy('editAppearance')) ? <button type="button" role="menuitem" onClick={() => { setContextMenu(false); dispatchTargetAction('appearance'); }}>{copy('editAppearance')}</button> : null}{contextMatches(copy('lockElement')) ? <button type="button" role="menuitem" onClick={() => { setContextMenu(false); dispatchTargetAction('toy-lock'); }}>{copy('lockElement')}</button> : null}{contextMatches(copy('closeMenu')) ? <button type="button" role="menuitem" onClick={() => setContextMenu(false)}>{copy('closeMenu')}</button> : null}</aside> : null}
    {overwriteGate ? <DestructiveGate action={copy('overwriteAction')} target={copy('overwriteTarget', { name: destination?.name ?? copy('noDestination') })} items={[copy('overwriteItem', { name: destination?.name ?? copy('noDestination') })]} detail={copy('overwriteDetail')} irreversible onConfirm={completeOverwrite} onClose={closeOverwrite} /> : null}
  </main>;
}

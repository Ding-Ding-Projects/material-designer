import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import {
  getOpenDesignHost,
  type OpenDesignHostConverterAdapter,
  type OpenDesignHostConverterFile,
  type OpenDesignHostConverterHistoryEvent,
  type OpenDesignHostConverterNotification,
  type OpenDesignHostConverterPreview,
  type OpenDesignHostConverterQueueItem,
} from '@open-design/host';
import { DestructiveGate, type DestructiveGateOutcome } from './destructive/DestructiveGate';
import { RegexSearchField } from './regex/RegexSearchField';
import { useRegexSearch } from './regex/useRegexSearch';
import { ConverterSearchableChoice, usePersistedConverterSearch, type ConverterChoiceOption } from './converter/ConverterSearchableChoice';
import { CATEGORY_COPY_KEYS, useConverterCopy } from './converter/converterCopy';
import styles from './FileConverterView.module.css';

type Category = 'documents-pdf' | 'images' | 'audio' | 'video' | 'archives' | 'structured-data' | 'code-text' | 'binary-encodings';
type QueueRow = OpenDesignHostConverterQueueItem;

const CATEGORIES: readonly Category[] = ['documents-pdf', 'images', 'audio', 'video', 'archives', 'structured-data', 'code-text', 'binary-encodings'];

const FALLBACK_CATALOG: OpenDesignHostConverterAdapter[] = [
  { id: 'structured-data-local', category: 'structured-data', label: 'Structured data and spreadsheet adapter', sourceFormats: ['json', 'jsonl', 'csv', 'tsv', 'yaml', 'toml', 'xml'], targetFormats: ['json', 'jsonl', 'txt'], bundled: true, capabilities: { inspect: true, convert: true, preview: true, batch: true, lossless: true, metadata: false, encoding: 'UTF-8', incrementalProgress: true }, bounds: { maxInputBytes: 33554432, maxOutputBytes: 67108864 } },
  { id: 'text-structured-local', category: 'code-text', label: 'Code and text document adapter', sourceFormats: ['txt', 'md', 'markdown', 'json', 'jsonl', 'csv', 'tsv', 'yaml', 'toml', 'xml', 'html', 'js', 'ts'], targetFormats: ['txt', 'md', 'markdown', 'json', 'jsonl', 'html', 'js', 'ts'], bundled: true, capabilities: { inspect: true, convert: true, preview: true, batch: true, lossless: true, metadata: false, encoding: 'UTF-8', incrementalProgress: true }, bounds: { maxInputBytes: 33554432, maxOutputBytes: 67108864 } },
  { id: 'pdf-local-bounded', category: 'documents-pdf', label: 'PDF document inspector', sourceFormats: ['pdf'], targetFormats: [], bundled: true, unavailableReason: 'Content-preserving PDF rewrite is not bundled in this build; inspect is available, edits remain disabled.', capabilities: { inspect: true, convert: false, preview: true, batch: false, lossless: false, metadata: true, encoding: 'PDF object inspection only', incrementalProgress: true }, bounds: { maxInputBytes: 268435456, maxOutputBytes: 536870912 } },
  { id: 'binary-inspector-local', category: 'binary-encodings', label: 'Binary inspection adapter', sourceFormats: ['png', 'jpeg', 'gif', 'webp', 'zip', 'gz', 'mp3', 'ogg', 'flac', 'mp4'], targetFormats: ['hex', 'base64'], bundled: true, capabilities: { inspect: true, convert: true, preview: false, batch: true, lossless: true, metadata: false, encoding: 'binary', incrementalProgress: true }, bounds: { maxInputBytes: 33554432, maxOutputBytes: 67108864 } },
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

function AdapterTargetChoice({ category, adapter, value, onChange, source, destination, busy, copy, focusScopeId }: { category: Category; adapter: OpenDesignHostConverterAdapter; value: string; onChange: (value: string) => void; source: OpenDesignHostConverterFile | null; destination: OpenDesignHostConverterFile | null; busy: boolean; copy: ReturnType<typeof useConverterCopy>; focusScopeId: string }) {
  const search = usePersistedConverterSearch(`material-designer:converter:${category}:${adapter.id}:target`);
  const options = adapter.targetFormats.map((format) => ({ value: format, label: format }));
  return <ConverterSearchableChoice id={`${adapter.id}-target`} label={copy('targetFormat')} value={value} options={options} onChange={onChange} search={search} searchLabel={copy('targetFormats', { name: adapter.label })} disabled={!source || !destination || busy} disabledReason={copy('desktopRequired')} testId={`${adapter.id}-target-choice`} focusScopeId={focusScopeId} />;
}

function CategoryPanel({ category, adapters, source, destination, onChooseDestination, onPreview, onQueue, onConvert, onPdfAction, preview, busy }: { category: Category; adapters: OpenDesignHostConverterAdapter[]; source: OpenDesignHostConverterFile | null; destination: OpenDesignHostConverterFile | null; onChooseDestination: () => void; onPreview: (adapter: OpenDesignHostConverterAdapter, target: string) => void; onQueue: (adapter: OpenDesignHostConverterAdapter, target: string) => void | Promise<void>; onConvert: (adapter: OpenDesignHostConverterAdapter, target: string) => void | Promise<void>; onPdfAction: (operation: string) => void; preview: OpenDesignHostConverterPreview | null; busy: boolean }) {
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
    {preview?.adapterId ? <div className={styles.preview} role="region" aria-label={copy('conversionPreview')}><strong>{copy('conversionPreview')}: {preview.targetFormat}</strong><span>{preview.source.format}, {preview.source.bytes} bytes</span><p>{preview.disclosure}</p></div> : null}
    <button type="button" className={styles.browseButton} onClick={onChooseDestination}>{copy('chooseDestination')}</button>
  </section>;
}

function downloadJson(value: unknown, filename: string, onDone: () => void): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  onDone();
}

export function FileConverterView() {
  const copy = useConverterCopy();
  const [catalog, setCatalog] = useState<OpenDesignHostConverterAdapter[]>(FALLBACK_CATALOG);
  const [activeCategory, setActiveCategory] = useState<Category>('documents-pdf');
  const [source, setSource] = useState<OpenDesignHostConverterFile | null>(null);
  const [sources, setSources] = useState<OpenDesignHostConverterFile[]>([]);
  const [destination, setDestination] = useState<OpenDesignHostConverterFile | null>(null);
  const [browserFile, setBrowserFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<OpenDesignHostConverterPreview | null>(null);
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [selectedQueue, setSelectedQueue] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState(() => copy('chooseSourceNotice'));
  const [notificationHistory, setNotificationHistory] = useState<OpenDesignHostConverterNotification[]>([]);
  const [localHistoryEvents, setLocalHistoryEvents] = useState<OpenDesignHostConverterHistoryEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [overwriteGate, setOverwriteGate] = useState<{ adapterId: string; target: string; sourceHandle: string; destinationHandle: string } | null>(null);
  const [contextMenu, setContextMenu] = useState(false);
  const [contextQuery, setContextQuery] = useState('');
  const host = useMemo(() => getOpenDesignHost(), []);
  const contextSearch = useRegexSearch(contextQuery, setContextQuery);
  const adapters = catalog.filter((adapter) => adapter.category === activeCategory);

  useEffect(() => {
    let active = true;
    void host?.converter?.catalog().then((next) => { if (active && next.length > 0) setCatalog([...next]); }).catch(() => setMessage(copy('unavailable', { reason: 'The bundled adapter catalog is unavailable, so the local fallback catalog is shown.' })));
    return () => { active = false; };
  }, [copy, host]);

  const refreshQueue = async () => {
    if (!host?.converter) return;
    const pageMethod = (host.converter.queue as typeof host.converter.queue & { page?: (cursor?: string, pageSize?: number) => Promise<unknown> }).page;
    const next = typeof pageMethod === 'function' ? await pageMethod(undefined, 256) : await host.converter.queue.list();
    if (Array.isArray(next)) { setQueue([...next]); return; }
    if (next && typeof next === 'object' && 'items' in next && Array.isArray((next as { items: unknown[] }).items)) setQueue([...(next as { items: QueueRow[] }).items]);
    else if (next && typeof next === 'object' && 'reason' in next) setMessage(String((next as { reason: string }).reason));
  };
  useEffect(() => { void refreshQueue(); if (!host?.converter) return; const timer = window.setInterval(() => void refreshQueue(), 750); return () => window.clearInterval(timer); }, [host]);
  useEffect(() => {
    if (!host?.converter?.notifications?.page) return;
    void host.converter.notifications.page(undefined, 200).then((page) => { if (!('reason' in page)) setNotificationHistory([...page.items]); }).catch(() => undefined);
  }, [host, message]);
  useEffect(() => {
    if (!host?.converter?.history?.page) return;
    void host.converter.history.page(undefined, 200).then((page) => { if (!('reason' in page)) setLocalHistoryEvents([...page.items]); }).catch(() => undefined);
  }, [host, message]);

  const pickSource = async () => {
    if (!host?.converter) { setMessage(copy('desktopRequired')); return; }
    const result = await host.converter.pickSources();
    if (Array.isArray(result)) { setSources([...result]); setSource(result[0] ?? null); setMessage(copy('sourcesSelected', { n: result.length })); }
    else if ('canceled' in result) setMessage(copy('cancelled', { what: 'Source' }));
    else setMessage(result.reason);
  };
  const pickDestination = async () => {
    if (!host?.converter) { setMessage(copy('desktopRequired')); return; }
    const result = await host.converter.pickDestination('converted-output');
    if ('handle' in result) { setDestination(result); setMessage(copy('destinationSelected', { name: result.name })); }
    else if ('canceled' in result) setMessage(copy('cancelled', { what: 'Destination' }));
    else setMessage(result.reason);
  };
  const onBrowserSource = (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0] ?? null; setBrowserFile(file); if (file) setMessage(copy('browserSourceSelected', { name: file.name, bytes: file.size })); };
  const runPreview = async (adapter: OpenDesignHostConverterAdapter, target: string) => {
    if (!host?.converter || !source || !destination) { setMessage(copy('desktopRequired')); return; }
    setBusy(true);
    try { const result = await host.converter.preview(source.handle, destination.handle, adapter.id, target); if ('reason' in result) setMessage(result.reason); else { setPreview(result); setMessage(`${copy('previewReady', { target })} ${copy('reviewDisclosure')}`); } }
    finally { setBusy(false); }
  };
  const addToQueue = async (adapter: OpenDesignHostConverterAdapter, target: string) => {
    if (!host?.converter || !source || !destination) { setMessage(copy('desktopRequired')); return; }
    const result = await host.converter.queue.enqueue(source.handle, destination.handle, adapter.id, target);
    if ('reason' in result) setMessage(result.reason); else { setMessage(copy('queued', { name: result.sourceName, target })); await refreshQueue(); }
    void runPreview(adapter, target);
  };
  const convertNow = async (adapter: OpenDesignHostConverterAdapter, target: string) => {
    if (!host?.converter || !source || !destination) { setMessage(copy('desktopRequired')); return; }
    setBusy(true);
    try {
      const result = await host.converter.preview(source.handle, destination.handle, adapter.id, target);
      if ('reason' in result) { setMessage(result.reason); return; }
      if (destination.exists === true) { setOverwriteGate({ adapterId: adapter.id, target, sourceHandle: source.handle, destinationHandle: destination.handle }); return; }
      const converted = await host.converter.convert(source.handle, destination.handle, adapter.id, target);
      if (converted.ok) setMessage(copy('conversionComplete')); else setMessage(converted.status === 'cancelled' ? copy('conversionCancelled') : copy('conversionFailed', { reason: converted.reason }));
    } finally { setBusy(false); }
  };
  const startQueue = async () => { if (!host?.converter) { setMessage(copy('desktopRequired')); return; } setBusy(true); const result = await host.converter.queue.start(); setMessage(result.ok ? copy('queueStarted') : result.reason); await refreshQueue(); setBusy(false); };
  const cancelQueue = async () => { if (!host?.converter) return; await host.converter.queue.cancel(); await refreshQueue(); setMessage(copy('queueCancelled')); };
  const pauseQueue = async () => { if (!host?.converter) return; await host.converter.queue.pause(); await refreshQueue(); setMessage(copy('queuePaused')); };
  const resumeQueue = async () => { if (!host?.converter) return; await host.converter.queue.resume(); await refreshQueue(); setMessage(copy('queueResumed')); };
  const toggleAllQueue = () => setSelectedQueue((current) => current.size === queue.length ? new Set() : new Set(queue.map((item) => item.id)));
  const cancelSelectedQueue = async () => { if (!host?.converter) return; await host.converter.queue.cancel([...selectedQueue]); setSelectedQueue(new Set()); await refreshQueue(); setMessage(copy('selectedCancelled')); };
  const retrySelectedQueue = async () => { if (!host?.converter) return; await host.converter.queue.retry(selectedQueue.size > 0 ? [...selectedQueue] : undefined); setSelectedQueue(new Set()); await refreshQueue(); setMessage(copy('selectedRetried')); };
  const runPdfOperation = async (operation: string) => { if (!host?.converter || !source || (operation !== 'inspect' && !destination)) { setMessage(copy('desktopRequired')); return; } setBusy(true); try { const result = await host.converter.pdfOperation(source.handle, destination?.handle ?? '', operation, {}, operation === 'merge' ? sources.map((item) => item.handle) : undefined, undefined); setMessage('reason' in result ? result.reason : `${copy('inspectPdf')} ${operation}.`); } finally { setBusy(false); } };
  const exportQueue = () => { downloadJson({ schemaVersion: 1, encoding: 'UTF-8', lineEndings: 'LF', queue }, 'converter-queue.json', () => setMessage(copy('queueExported'))); };
  const contextMatches = (label: string) => contextSearch.matches(label);
  const dispatchTargetAction = (type: 'appearance' | 'toy-lock') => {
    if (typeof window === 'undefined') return false;
    const event = new CustomEvent(type === 'appearance' ? 'od:appearance:request' : 'od:toy-lock:request', { bubbles: true, cancelable: true, detail: { targetId: 'file-converter-surface' } });
    const delivered = window.dispatchEvent(event);
    if (delivered) setMessage(type === 'appearance' ? copy('editAppearance') : copy('lockElement'));
    return !delivered;
  };
  const completeOverwrite = async (): Promise<boolean> => {
    if (!host?.converter || !overwriteGate) return false;
    const challenge = await host.converter.requestOverwrite(overwriteGate.sourceHandle, overwriteGate.destinationHandle, overwriteGate.adapterId, overwriteGate.target);
    if ('reason' in challenge) { setMessage(challenge.reason); return false; }
    const result = await host.converter.overwrite(overwriteGate.sourceHandle, overwriteGate.destinationHandle, overwriteGate.adapterId, overwriteGate.target, challenge.token);
    if (result.ok) { setMessage(copy('conversionComplete')); return true; }
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
      <CategoryPanel category={activeCategory} adapters={adapters} source={source} destination={destination} onChooseDestination={() => void pickDestination()} onPreview={(adapter, target) => void runPreview(adapter, target)} onQueue={addToQueue} onConvert={convertNow} onPdfAction={(operation) => void runPdfOperation(operation)} preview={preview} busy={busy} />
    </div>
    <section className={styles.queue} aria-labelledby="converter-queue-title"><div className={styles.queueHeader}><h2 id="converter-queue-title">{copy('queueTitle')}</h2><span role="status">{copy('queueRecords', { n: queue.length })}</span><div><button type="button" onClick={() => void startQueue()} disabled={busy || queue.every((item) => item.state !== 'queued')}>{copy('start')}</button><button type="button" onClick={() => void pauseQueue()} disabled={busy || queue.every((item) => item.state !== 'queued')}>{copy('pause')}</button><button type="button" onClick={() => void resumeQueue()} disabled={busy || queue.every((item) => item.state !== 'paused')}>{copy('resume')}</button><button type="button" onClick={() => void cancelQueue()} disabled={busy || queue.every((item) => item.state !== 'queued' && item.state !== 'paused')}>{copy('cancel')}</button><button type="button" onClick={() => void cancelSelectedQueue()} disabled={selectedQueue.size === 0}>{copy('cancelSelected')}</button><button type="button" onClick={() => void retrySelectedQueue()} disabled={selectedQueue.size === 0}>{copy('retrySelected')}</button><button type="button" onClick={exportQueue} disabled={queue.length === 0}>{copy('exportQueue')}</button></div></div>{queue.length === 0 ? <p className={styles.empty}>{copy('emptyQueue')}</p> : <><label className={styles.selectAll}><input type="checkbox" checked={selectedQueue.size === queue.length} onChange={toggleAllQueue} /> {copy('selectAll')}</label><ul>{queue.map((item) => <li key={item.id}><label><input type="checkbox" checked={selectedQueue.has(item.id)} onChange={() => setSelectedQueue((current) => { const next = new Set(current); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; })} aria-label={item.sourceName} /> <span>{item.sourceName} → {item.destinationName}</span></label><progress max={item.totalBytes ?? 1} value={item.totalBytes && item.totalBytes > 0 ? Math.min(item.totalBytes, item.bytesProcessed) : item.state === 'converted' ? 1 : 0}>{item.totalBytes && item.totalBytes > 0 ? Math.round((item.bytesProcessed / item.totalBytes) * 100) : 0}%</progress><strong>{item.state}</strong>{item.bytesPerSecond ? <small>{item.bytesPerSecond} bytes/s</small> : null}{item.reason ? <small>{item.reason}</small> : null}</li>)}</ul></>}</section>
    <section className={styles.auditColumns} aria-label={copy('historyDisclosure')}><div data-converter-notification-history><h2>{copy('notificationHistory')}</h2><ul>{notificationHistory.map((entry) => <li key={entry.id}><button type="button" onClick={() => void host?.converter?.notifications?.markRead([entry.id])}>{entry.title}: {entry.body}</button></li>)}</ul></div><div data-converter-local-history><h2>{copy('localHistory')}</h2><p>{copy('historyDisclosure')}</p><ul>{localHistoryEvents.map((entry) => <li key={entry.id}>{entry.summary} ({entry.createdAt})</li>)}</ul></div></section>
    {contextMenu ? <aside className={styles.contextMenu} role="menu" aria-label={copy('contextActions')}><RegexSearchField search={contextSearch} fieldLabel={copy('contextActions')} ariaLabel={copy('contextActions')} placeholder={copy('contextActions')} testId="converter-context-search" focusScopeId="converter-context-menu" />{contextMatches(copy('editAppearance')) ? <button type="button" role="menuitem" onClick={() => { setContextMenu(false); dispatchTargetAction('appearance'); }}>{copy('editAppearance')}</button> : null}{contextMatches(copy('lockElement')) ? <button type="button" role="menuitem" onClick={() => { setContextMenu(false); dispatchTargetAction('toy-lock'); }}>{copy('lockElement')}</button> : null}{contextMatches(copy('closeMenu')) ? <button type="button" role="menuitem" onClick={() => setContextMenu(false)}>{copy('closeMenu')}</button> : null}</aside> : null}
    {overwriteGate ? <DestructiveGate action={copy('overwriteAction')} target={copy('overwriteTarget', { name: destination?.name ?? copy('noDestination') })} items={[copy('overwriteItem', { name: destination?.name ?? copy('noDestination') })]} detail={copy('overwriteDetail')} irreversible onConfirm={completeOverwrite} onClose={closeOverwrite} /> : null}
  </main>;
}

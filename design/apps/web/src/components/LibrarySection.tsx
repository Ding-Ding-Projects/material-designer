// OD Library tab — the global asset registry grid.
//
// Shows every asset that has entered the system (clipper capture, manual
// upload, agent task, design-system staging, AI generation) with a source
// badge, a kind badge, and back-links. Captures from the browser extension
// stream in live over the `/api/library/events` SSE feed. The OD Clipper is
// zero-config — it connects automatically whenever OpenDesign is running
// locally, so there is no pairing step here.
//
// Each card thumbnail is kind-aware (image / video / html / font / color) and
// opens a full-size, kind-aware preview (LibraryPreviewModal) on click. Cards
// are also multi-selectable — checkbox, Cmd/Ctrl+click, Shift+click range, a
// rubber-band box drag, Cmd/Ctrl+A — and the selection can be bulk-deleted from
// the action bar or with Delete / Backspace.
//
// Every delete — one card or a whole selection — goes through the destructive
// super-confirmation gate. Removing an asset drops its Library record outright
// (caption, OCR text, tags, palette), and for a Library-owned asset the daemon
// also unlinks the stored bytes; nothing writes a revision, so none of it is
// recoverable from inside the product.
//
// User-facing copy is routed through the shared locale catalog; provider and
// metadata identifiers remain exact data.

import { memo, useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { ChatAttachment, DesignSystemSummary, LibraryAsset } from '@open-design/contracts';
import {
  applyLibraryAsset,
  deleteLibraryAsset,
  editLibraryAssetAsPage,
  fetchDesignSystem,
  fetchDesignSystems,
  fetchLibraryAsset,
  fetchAllLibraryAssets,
  fetchLibraryAssetAsFile,
  libraryAssetRawUrl,
  syncLibrary,
  type LibraryAssetQuery,
  type LibraryAssetFetchError,
  type LibraryDeleteOutcome,
} from '../providers/registry';
import { useInView } from './plugins-home/useInView';
import { navigate } from '../router';
import { setPendingDesignSystemCreateEntry } from '../analytics/ds-create-entry';
import { setComposerSeed, setDesignSystemAssetSeed, setHomeComposerAssetSeed } from '../state/libraryHandoff';
import { Button, VisuallyHidden } from '@open-design/components';
import { DestructiveGate } from './destructive/DestructiveGate';
import { Icon } from './Icon';
import {
  KindIcon,
  SOURCE_LABELS,
  assetTitle,
  badgeKind,
  fontFamilyFor,
  kindLabel,
  kindTint,
  matchesKindFilter,
  originDesignSystemId,
  originProjectId,
  primarySource,
  libraryAssetSearchText,
  type KindFilterValue,
} from './LibraryAssetMeta';
import { LibraryPreviewModal } from './LibraryPreviewModal';
import { LibraryUploadModal } from './LibraryUploadModal';
import { RegexSearchField } from './regex/RegexSearchField';
import { useRegexSearch } from './regex/useRegexSearch';
import styles from './LibrarySection.module.css';
import { useT } from '../i18n';
import { useWorkspaceContext } from '../collab/useWorkspaceContext';
import { workspaceIdentityCacheKey } from '../collab/workspace-identity';
import { resolveProjectWorkspaceContext } from '../collab/useProjectWorkspaceScope';

type Translate = ReturnType<typeof useT>;

interface Props {
  active: boolean;
  /** Open a project, optionally deep-linking to a specific file in the editor. */
  onOpenProject: (projectId: string, fileName?: string) => void;
}

// `value` is matched against an asset's `badgeKind` (not its raw storage kind),
// so `element` isolates clipper element-pick captures and `image` excludes them.
function kindFilters(t: Translate): Array<{ value: string; label: string }> {
  return [
    { value: '', label: t('library.kindAll') },
    { value: 'image', label: t('library.kindImages') },
    { value: 'element', label: t('library.kindElements') },
    { value: 'design-system', label: t('library.kindDesignSystems') },
    { value: 'video', label: t('library.kindVideo') },
    { value: 'html', label: 'HTML' },
    { value: 'font', label: t('library.kindFonts') },
    { value: 'color', label: t('library.kindColors') },
    { value: 'text', label: t('library.kindText') },
    { value: 'url', label: t('library.kindLinks') },
  ];
}

function sourceFilters(t: Translate): Array<{ value: string; label: string }> {
  return [
    { value: '', label: t('library.sourceAll') },
    { value: 'clipper', label: t('library.sourceClipper') },
    { value: 'manual-upload', label: t('library.upload') },
    { value: 'agent-task', label: t('library.sourceAgent') },
    { value: 'design-system', label: t('library.sourceDesignSystem') },
    { value: 'generated', label: t('library.sourceGenerated') },
  ];
}

function localizedLibraryKindLabel(kind: ReturnType<typeof badgeKind>, t: Translate): string {
  switch (kind) {
    case 'image': return t('library.kindImages');
    case 'element': return t('library.kindElements');
    case 'design-system': return t('library.kindDesignSystems');
    case 'video': return t('library.kindVideo');
    case 'font': return t('library.kindFonts');
    case 'color': return t('library.kindColors');
    case 'text': return t('library.kindText');
    case 'url': return t('library.kindLinks');
    case 'html': return 'HTML';
    default: return kindLabel(kind);
  }
}

function localizedLibrarySourceLabel(source: keyof typeof SOURCE_LABELS, t: Translate): string {
  switch (source) {
    case 'clipper': return t('library.sourceClipper');
    case 'manual-upload': return t('library.upload');
    case 'agent-task': return t('library.sourceAgent');
    case 'design-system': return t('library.sourceDesignSystem');
    case 'generated': return t('library.sourceGenerated');
    default: return SOURCE_LABELS[source];
  }
}

interface LibraryFilterComboboxProps {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  testId: string;
  noMatchesLabel: string;
}

/**
 * A real searchable filter picker. Each instance owns its query, regex mode,
 * flags and anchored builder; the kind and source controls never share hidden
 * search state or accidentally apply one filter's pattern to the other.
 */
function LibraryFilterCombobox({
  label,
  value,
  options,
  onChange,
  testId,
  noMatchesLabel,
}: LibraryFilterComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const search = useRegexSearch(query, setQuery);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});
  const listId = `${testId}-list`;
  const selectedLabel = options.find((option) => option.value === value)?.label ?? options[0]?.label ?? label;
  const visible = options.filter((option) => search.matches(option.label));

  const measurePanel = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger || typeof window === 'undefined') return;
    const rect = trigger.getBoundingClientRect();
    const margin = 12;
    const width = Math.max(1, Math.min(320, window.innerWidth - margin * 2));
    const below = window.innerHeight - rect.bottom - margin;
    const above = rect.top - margin;
    const placeAbove = below < 220 && above > below;
    const left = Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin));
    const room = Math.max(1, (placeAbove ? above : below) - 6);
    setPanelStyle({
      position: 'fixed',
      top: placeAbove ? rect.top - 6 : rect.bottom + 6,
      left,
      width,
      maxHeight: Math.min(360, room),
      transform: placeAbove ? 'translateY(-100%)' : undefined,
    });
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    measurePanel();
    const onViewportChange = () => measurePanel();
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      const regexPopover = (event.target as HTMLElement | null)?.closest(
        `[data-testid="${testId}-search-regex-popover"]`,
      );
      if (!regexPopover && !panelRef.current?.contains(target) && !triggerRef.current?.contains(target)) close();
    };
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target as HTMLElement | null;
      const regexPopover = target?.closest(`[data-testid="${testId}-search-regex-popover"]`);
      if (!regexPopover && !panelRef.current?.contains(event.target as Node) && !triggerRef.current?.contains(event.target as Node)) {
        close();
      }
    };
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('focusin', onFocusIn);
    };
  }, [close, measurePanel, open, testId]);

  const focusOption = useCallback((delta: number) => {
    const optionsNow = Array.from(panelRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []);
    if (!optionsNow.length) return;
    const current = optionsNow.indexOf(document.activeElement as HTMLButtonElement);
    const next = current < 0 ? (delta > 0 ? 0 : optionsNow.length - 1) : (current + delta + optionsNow.length) % optionsNow.length;
    optionsNow[next]?.focus();
  }, []);

  return (
    <div className={styles.filterCombo} data-testid={testId}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.filterComboTrigger}
        role="combobox"
        aria-label={`${label}: ${selectedLabel}`}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {
          setQuery('');
          setOpen((current) => !current);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setQuery('');
            setOpen(true);
          }
        }}
      >
        <span className={styles.filterComboLabel}>{selectedLabel}</span>
        <Icon name="chevron-down" size={14} aria-hidden />
      </button>
      {open ? (
        <div
          ref={panelRef}
          className={styles.filterComboPanel}
          style={panelStyle}
          role="group"
          aria-label={`${label} options`}
          onKeyDown={(event) => {
            const target = event.target as HTMLElement | null;
            const typing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
            if (typing && event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Escape') return;
            if (event.key === 'Escape') {
              event.preventDefault();
              close();
            } else if (event.key === 'ArrowDown') {
              event.preventDefault();
              focusOption(1);
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              focusOption(-1);
            } else if (event.key === 'Home') {
              event.preventDefault();
              panelRef.current?.querySelector<HTMLButtonElement>('[role="option"]')?.focus();
            } else if (event.key === 'End') {
              event.preventDefault();
              const items = panelRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]');
              items?.[items.length - 1]?.focus();
            }
          }}
        >
          <RegexSearchField
            search={search}
            fieldLabel={label}
            hostClassName={styles.filterComboSearch}
            placeholder={label}
            ariaLabel={label}
            testId={`${testId}-search`}
            inputRef={inputRef}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                event.stopPropagation();
                focusOption(1);
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                event.stopPropagation();
                focusOption(-1);
              }
            }}
          />
          <div className={styles.filterComboOptions} aria-live="polite">
            <div id={listId} role="listbox" aria-label={label}>
              {visible.map((option) => (
                <button
                  key={option.value || '__all'}
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  className={styles.filterComboOption}
                  onClick={() => {
                    onChange(option.value);
                    close();
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {!visible.length ? <div className={styles.filterComboEmpty} role="status">{noMatchesLabel}</div> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Text owned by one Library record and searched by the local controller.
 * Keeping this projection explicit means plain text and regex mode share one
 * bounded matcher without asking the browser to search rendered DOM or
 * sending a regex pattern to the daemon's keyword endpoint.
 */
// Keep the historical import path stable for focused tests and other Library
// surfaces while sharing the complete projection with LibraryPicker.
export { libraryAssetSearchText } from './LibraryAssetMeta';

/** Local `YYYY-MM-DD` for a Date — matches the daemon's `archivedDate` bucket. */
function ymdLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** The day bucket an asset belongs to (prefers the daemon's archive date). */
function dayKeyOf(asset: LibraryAsset): string {
  return asset.archivedDate || ymdLocal(new Date(asset.capturedAt));
}

/** Human heading for a `YYYY-MM-DD` day bucket — Today / Yesterday / a date. */
function dayHeading(key: string, t: Translate): string {
  const today = ymdLocal(new Date());
  const yesterday = ymdLocal(new Date(Date.now() - 86_400_000));
  if (key === today) return t('library.today');
  if (key === yesterday) return t('library.yesterday');
  const [y, m, d] = key.split('-').map(Number);
  if (!y || !m || !d) return key;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// Image / video / html / design-system thumbnail with a shimmer-until-loaded
// skeleton, mirroring the clipper's "Select images to save" picker
// (clipper/content.js → `.thumb.shim`). The skeleton fills the 4:3 box and
// animates only while the bytes are in flight; the media fades in over it on
// `load`, then the skeleton unmounts. On `error` the skeleton also clears so a
// broken asset doesn't shimmer forever, and a cached image that finished
// loading before React attached `onLoad` is caught via the `complete` probe on
// mount. Because heavy kinds are gated by {@link LibraryThumb} (which only
// mounts in view) and `.card` carries `content-visibility:auto`, no off-screen
// card runs the shimmer animation.
function MediaThumb({ asset }: { asset: LibraryAsset }) {
  const [loaded, setLoaded] = useState(false);
  const rawUrl = libraryAssetRawUrl(asset.id);
  const title = assetTitle(asset);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth > 0) setLoaded(true);
  }, []);

  const flag = loaded ? 'true' : 'false';
  let media: React.ReactNode;
  if (asset.kind === 'video') {
    media = (
      <>
        <video
          className={styles.thumbImg}
          src={rawUrl}
          muted
          preload="metadata"
          playsInline
          aria-hidden="true"
          tabIndex={-1}
          data-loaded={flag}
          onLoadedData={() => setLoaded(true)}
          onError={() => setLoaded(true)}
        />
        <span className={styles.playGlyph} aria-hidden>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M8 5v14l11-7z" />
          </svg>
        </span>
      </>
    );
  } else if (asset.kind === 'html' || asset.kind === 'design-system') {
    // Static (no scripts) sandboxed render — a faithful, lightweight preview
    // of the captured page. The modal re-renders it with scripts for motion.
    media = (
      <iframe
        className={styles.thumbFrame}
        src={rawUrl}
        sandbox=""
        scrolling="no"
        loading="lazy"
        tabIndex={-1}
        aria-hidden
        title={title}
        data-loaded={flag}
        onLoad={() => setLoaded(true)}
      />
    );
  } else {
    media = (
      <img
        ref={imgRef}
        className={styles.thumbImg}
        src={rawUrl}
        alt={title}
        loading="lazy"
        decoding="async"
        data-loaded={flag}
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
      />
    );
  }

  return (
    <>
      {loaded ? null : <span className={styles.thumbSkeleton} aria-hidden />}
      {media}
    </>
  );
}

/** Kind-aware thumbnail. Stays fetch-free so the grid scrolls cheaply. */
function Thumb({ asset }: { asset: LibraryAsset }) {
  switch (asset.kind) {
    case 'image':
    case 'video':
    case 'design-system':
    case 'html':
      return <MediaThumb asset={asset} />;
    case 'font':
      return (
        <div className={styles.thumbFont} style={{ fontFamily: `"${fontFamilyFor(asset.id)}", sans-serif` }}>
          Ag
        </div>
      );
    case 'color': {
      const swatch = asset.palette?.find((c) => typeof c === 'string' && c.trim());
      return swatch ? (
        <div className={styles.thumbColor} style={{ background: swatch }} />
      ) : (
        <div className={styles.thumbGlyph}>
          <KindIcon kind="color" size={34} />
        </div>
      );
    }
    case 'text':
    case 'url':
    default:
      return (
        <div className={styles.thumbGlyph}>
          <KindIcon kind={asset.kind} size={34} />
        </div>
      );
  }
}

// Kinds whose thumbnail does real off-screen work — a network fetch (image,
// video, font face) or a whole browsing context (html `<iframe>`). These mount
// lazily; cheap kinds (color swatch / text / url glyph) render immediately.
const LAZY_THUMB_KINDS = new Set<string>(['image', 'video', 'design-system', 'html', 'font']);

// Wraps {@link Thumb} so the heavy content (full-bytes `<img>`/`<video>`, the
// `<iframe>` html preview, or an injected `@font-face` specimen) only mounts
// once the card scrolls near the viewport. Until then a faint kind glyph holds
// the 4:3 box. `once: true` keeps it mounted after first reveal so scrolling
// back does not tear down and recreate an iframe browsing context. The wrapper
// fills the `.thumb` box without changing the card's outer dimensions, so the
// flat `index` and box-select rects stay stable whether or not it has mounted.
function LibraryThumb({ asset }: { asset: LibraryAsset }) {
  const lazy = LAZY_THUMB_KINDS.has(asset.kind);
  const { ref, inView } = useInView<HTMLDivElement>({ once: true, rootMargin: '300px' });
  if (!lazy) return <Thumb asset={asset} />;
  return (
    <div ref={ref} className={styles.thumbLazy}>
      {inView ? (
        <Thumb asset={asset} />
      ) : (
        <div className={styles.thumbGlyph} aria-hidden>
          <KindIcon kind={badgeKind(asset)} size={34} />
        </div>
      )}
    </div>
  );
}

/**
 * Merge freshly-fetched library assets into the current list for an incremental
 * SSE update. Assets already present are refreshed in place (a dedup re-ingest
 * does NOT bump `created_at`, so it must not reorder); genuinely new assets are
 * prepended, latest-first, to match the server's `created_at DESC` order.
 */
export function mergeIngestedAssets(prev: LibraryAsset[], fetched: LibraryAsset[]): LibraryAsset[] {
  if (fetched.length === 0) return prev;
  const byId = new Map(fetched.map((a) => [a.id, a]));
  const present = new Set(prev.map((a) => a.id));
  const merged = prev.map((a) => byId.get(a.id) ?? a);
  const fresh = [...byId.values()].filter((a) => !present.has(a.id)).reverse();
  return fresh.length ? [...fresh, ...merged] : merged;
}

/** Parse `{ assetId }` out of a library SSE `data:` payload, or null. */
export function parseEventAssetId(data: unknown): string | null {
  if (typeof data !== 'string') return null;
  try {
    const parsed = JSON.parse(data) as { assetId?: unknown };
    return typeof parsed.assetId === 'string' ? parsed.assetId : null;
  } catch {
    return null;
  }
}

/** A card's viewport-space box, snapshotted for hit-testing during a drag. */
export interface CardRect {
  id: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Snapshot every rendered card's viewport rect (id + bounds) under `grid`. */
export function snapshotCardRects(grid: HTMLElement | null): CardRect[] {
  const out: CardRect[] = [];
  if (!grid) return out;
  grid.querySelectorAll<HTMLElement>('[data-asset-card]').forEach((el) => {
    const id = el.dataset.assetId;
    if (!id) return;
    const r = el.getBoundingClientRect();
    out.push({ id, left: r.left, top: r.top, right: r.right, bottom: r.bottom });
  });
  return out;
}

/** Ids of cards whose snapshotted rect intersects the band rectangle. */
export function cardIdsInBand(rects: CardRect[], band: Band): string[] {
  const left = band.x;
  const top = band.y;
  const right = band.x + band.w;
  const bottom = band.y + band.h;
  const ids: string[] = [];
  for (const r of rects) {
    if (r.left < right && r.right > left && r.top < bottom && r.bottom > top) ids.push(r.id);
  }
  return ids;
}

export interface Band {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const LIBRARY_MAX_CONCURRENCY = 4;

export interface LibraryPoolResult<T, R> {
  item: T;
  ok: boolean;
  value?: R;
  error?: unknown;
}

/** Run Library work through a small, abort-aware worker pool. */
export async function runLibraryPool<T, R>(
  items: readonly T[],
  worker: (item: T, signal: AbortSignal) => Promise<R>,
  options: { concurrency?: number; signal?: AbortSignal } = {},
): Promise<LibraryPoolResult<T, R>[]> {
  const concurrency = Math.max(
    1,
    Math.min(Math.floor(options.concurrency ?? LIBRARY_MAX_CONCURRENCY), LIBRARY_MAX_CONCURRENCY),
  );
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onAbort, { once: true });
  const out: Array<LibraryPoolResult<T, R> | undefined> = new Array(items.length);
  let next = 0;
  const workerLoop = async () => {
    while (!controller.signal.aborted) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      const item = items[index];
      try {
        out[index] = { item, ok: true, value: await worker(item, controller.signal) };
      } catch (error) {
        out[index] = { item, ok: false, error };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => workerLoop()));
  options.signal?.removeEventListener('abort', onAbort);
  return out.filter((entry): entry is LibraryPoolResult<T, R> => Boolean(entry));
}

function deleteOutcomeSucceeded(value: LibraryDeleteOutcome | boolean): boolean {
  return typeof value === 'boolean' ? value : value.status === 'deleted';
}

/** How many assets the gate names one line each before it starts counting. */
export const MAX_GATE_ITEMS = 12;

/**
 * What deleting one asset actually costs, in that asset's own name.
 *
 * The two storage models lose different things and the gate has to say which.
 * An `owned` asset is one the Library holds its own copy of (a clipper
 * capture, an upload, an import): the daemon unlinks those bytes from the
 * Library folder. A `referenced` asset's bytes live inside a project or design
 * system and are left alone — only the pointer goes.
 *
 * Neither one keeps the Library record. The caption, OCR text, tags and
 * palette are deleted with the row, and Sync re-derives an asset from its
 * source rather than restoring what was there, so "you can just sync it back"
 * is not true of the parts a person curated.
 */
export function describeAssetLoss(asset: LibraryAsset, t?: Translate): string {
  const title = assetTitle(asset);
  if (t) {
    return asset.storage === 'owned'
      ? t('library.deleteItemOwned', { title })
      : t('library.deleteItemReferenced', { title });
  }
  return asset.storage === 'owned'
    ? `${title} — the file stored in your Library, plus its caption, OCR text, tags and palette`
    : `${title} — its Library record: caption, OCR text, tags and palette. The file itself stays in the project that owns it.`;
}

/**
 * One line per asset, then an honest count for whatever the cap left out. A
 * Cmd+A selection can run to hundreds; a list that long buries the keys and
 * the slider under a scroll, and a list that silently stopped at twelve would
 * under-report what is about to go.
 */
export function describeAssetItems(assets: readonly LibraryAsset[], t?: Translate): string[] {
  const named = assets.slice(0, MAX_GATE_ITEMS).map((asset) => describeAssetLoss(asset, t));
  const rest = assets.length - named.length;
  if (rest > 0) {
    named.push(t ? t('library.deleteMore', { count: rest }) : `…and ${rest} more asset${rest === 1 ? '' : 's'} in the selection`);
  }
  return named;
}

/** The blast-radius sentence, keyed on which storage models are in the set. */
export function describeDeleteDetail(assets: readonly LibraryAsset[], t?: Translate): string {
  const owned = assets.filter((a) => a.storage === 'owned').length;
  const referenced = assets.length - owned;
  if (t) {
    if (owned > 0 && referenced > 0) return t('library.deleteDetailMixed', { owned, referenced });
    if (owned > 0) return t('library.deleteDetailOwned', { count: owned });
    return t('library.deleteDetailReferenced', { count: referenced });
  }
  if (owned > 0 && referenced > 0) {
    return (
      `${owned} of these ${owned === 1 ? 'is' : 'are'} stored by the Library and ${owned === 1 ? 'its file is' : 'their files are'} ` +
      `deleted from disk. The other ${referenced} only lose ${referenced === 1 ? 'its' : 'their'} Library record. ` +
      'Nothing here is kept in version history, so none of it comes back.'
    );
  }
  if (owned > 0) {
    return (
      `The ${owned === 1 ? 'file is' : 'files are'} unlinked from the Library folder. ` +
      'Nothing else keeps a second copy, so this cannot be undone.'
    );
  }
  return (
    `The ${referenced === 1 ? 'file stays' : 'files stay'} in the project that owns ${referenced === 1 ? 'it' : 'them'}; ` +
    `what goes is the Library record. Sync can index ${referenced === 1 ? 'it' : 'them'} again, but the caption, OCR text, ` +
    'tags and palette are derived from scratch rather than restored.'
  );
}

interface LibraryCardProps {
  asset: LibraryAsset;
  /** Flat position in the currently visible result set — drives shift-range. */
  index: number;
  selected: boolean;
  /** This card's asset is mid "Edit as page" (spinner gate). */
  editing: boolean;
  onToggle: (id: string, index: number) => void;
  onRange: (index: number) => void;
  onPreview: (id: string) => void;
  onDelete: (id: string) => void;
  onEditAsPage: (id: string) => void;
  onOpenProject: (projectId: string, fileName?: string) => void;
}

// One asset card. Shared by the grid and timeline views. Memoized so a
// selection change — including the per-frame `setSelectedIds` of a rubber-band
// drag — only re-renders the cards whose `selected`/`editing` actually flipped,
// not the whole grid. On a large Library that turn-the-whole-list re-render was
// the single biggest cost; all the callbacks below are stable (useCallback /
// setState) so React.memo's shallow compare holds across those updates.
const LibraryCard = memo(function LibraryCard({
  asset,
  index,
  selected,
  editing,
  onToggle,
  onRange,
  onPreview,
  onDelete,
  onEditAsPage,
  onOpenProject,
}: LibraryCardProps) {
  const t = useT();
  const src = primarySource(asset);
  const projectId = originProjectId(asset);
  const designSystemId = originDesignSystemId(asset);
  const title = assetTitle(asset);
  return (
    <figure
      className={styles.card}
      data-asset-card
      data-asset-id={asset.id}
      data-selected={selected ? 'true' : 'false'}
    >
      <div className={styles.thumb}>
        <LibraryThumb asset={asset} />
        <button
          type="button"
          className={styles.thumbButton}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey) {
              onToggle(asset.id, index);
              return;
            }
            if (e.shiftKey) {
              onRange(index);
              return;
            }
            onPreview(asset.id);
          }}
          aria-label={t('library.previewAsset', { title })}
        >
          <span className={styles.previewOverlay} aria-hidden>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </span>
        </button>
        <button
          type="button"
          className={styles.selectCheck}
          data-checked={selected ? 'true' : 'false'}
          aria-pressed={selected}
          aria-label={selected ? t('library.deselectAsset') : t('library.selectAsset')}
          onClick={(e) => {
            e.stopPropagation();
            if (e.shiftKey) onRange(index);
            else onToggle(asset.id, index);
          }}
        >
          {selected ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M20 6 9 17l-5-5" />
            </svg>
          ) : null}
        </button>
        {src ? (
          <span className={styles.badge} data-source={src}>
            {localizedLibrarySourceLabel(src, t)}
          </span>
        ) : null}
        <span
          className={styles.kindBadge}
          style={{ ['--kind-tint' as string]: kindTint(badgeKind(asset)) }}
        >
          <KindIcon kind={badgeKind(asset)} size={12} />
          {localizedLibraryKindLabel(badgeKind(asset), t)}
        </span>
      </div>
      <figcaption className={styles.meta}>
        <button
          type="button"
          className={styles.title}
          title={asset.sourceTitle ?? asset.sourceUrl ?? asset.id}
          aria-label={t('library.previewAsset', { title })}
          onClick={() => onPreview(asset.id)}
        >
          {title}
        </button>
        <span className={styles.sub}>
          {asset.width && asset.height
            ? `${asset.width}×${asset.height}`
            : localizedLibraryKindLabel(badgeKind(asset), t)}
        </span>
      </figcaption>
      <div className={styles.cardActions}>
        {/* Jump back to an asset's origin. A synced design-system / project
            asset links to where it lives; a clipper html capture (no origin)
            still offers "Edit as page"; otherwise the external source. */}
        {designSystemId ? (
          <button
            type="button"
            className={styles.linkBtn}
            onClick={() => navigate({ kind: 'design-system-detail', designSystemId })}
          >
            {t('library.openDesignSystem')}
          </button>
        ) : projectId ? (
          <button
            type="button"
            className={styles.linkBtn}
            onClick={() => onOpenProject(projectId, asset.relPath)}
          >
            {t('library.openProject')}
          </button>
        ) : asset.kind === 'html' ? (
          <button
            type="button"
            className={styles.linkBtn}
            onClick={() => onEditAsPage(asset.id)}
            disabled={editing}
          >
            {editing ? t('library.opening') : t('library.editAsPage')}
          </button>
        ) : asset.sourceUrl ? (
          <a className={styles.linkBtn} href={asset.sourceUrl} target="_blank" rel="noreferrer">
            {t('library.viewSource')}
          </a>
        ) : (
          <span />
        )}
        <button type="button" className={styles.deleteBtn} onClick={() => onDelete(asset.id)}>
          {t('library.remove')}
        </button>
      </div>
    </figure>
  );
});

export function LibrarySection({ active, onOpenProject }: Props) {
  const t = useT();
  const dsMenuId = useId();
  const { context: workspaceContext } = useWorkspaceContext();
  const workspaceIdentity = workspaceIdentityCacheKey(workspaceContext);
  const [assets, setAssets] = useState<LibraryAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);
  const [kind, setKind] = useState('');
  const [source, setSource] = useState('');
  const [search, setSearch] = useState('');
  // This controller belongs to this field only. RegexSearchField renders the
  // adjacent builder and returns focus to this input when it closes; no
  // module-level controller or shared builder state is involved.
  const librarySearch = useRegexSearch(search, setSearch);
  const { matches: matchesLibraryAsset } = librarySearch;
  // The input updates `search` instantly; the debounced mirror only schedules
  // a bounded complete-page reload after a typing pause.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [libraryError, setLibraryError] = useState<LibraryAssetFetchError | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [band, setBand] = useState<Band | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [seedFiles, setSeedFiles] = useState<File[] | null>(null);
  // What the super-confirmation gate is currently pointed at, or null when it
  // is closed. Both delete routes — the per-card "Remove" and the selection
  // bar's "Delete N" — fill this in; neither one deletes anything on its own
  // any more.
  const [deleteGate, setDeleteGate] = useState<{
    action: string;
    target: string;
    items: string[];
    detail: string;
    onConfirm: () => Promise<boolean>;
  } | null>(null);
  const [deleteOutcome, setDeleteOutcome] = useState<{
    deleted: LibraryAsset[];
    failed: LibraryAsset[];
    skipped: LibraryAsset[];
    residue: string[];
  } | null>(null);
  // Asset currently being turned into an editable OD page (spinner gate).
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingIdsRef = useRef(new Set<string>());
  const [viewMode, setViewMode] = useState<'grid' | 'timeline'>('grid');
  // "Use in design system" menu state (multi-select → design system).
  const [dsMenuOpen, setDsMenuOpen] = useState(false);
  const [dsList, setDsList] = useState<DesignSystemSummary[]>([]);
  const [dsBusy, setDsBusy] = useState(false);
  const dsBusyRef = useRef(false);
  const dsLoadedRef = useRef(false);
  const dsMenuWrapRef = useRef<HTMLDivElement>(null);
  const dsMenuButtonRef = useRef<HTMLButtonElement>(null);
  const dsMenuPanelRef = useRef<HTMLDivElement>(null);
  const dsMenuRef = useRef<HTMLDivElement>(null);
  const dsMenuSearchInputRef = useRef<HTMLInputElement>(null);
  const [dsMenuQuery, setDsMenuQuery] = useState('');
  const [dsMenuStyle, setDsMenuStyle] = useState<CSSProperties | undefined>(undefined);
  const dsMenuSearch = useRegexSearch(dsMenuQuery, setDsMenuQuery);
  const [fileDragActive, setFileDragActive] = useState(false);
  const fileDragDepth = useRef(0);
  const loadedOnce = useRef(false);
  const gridRef = useRef<HTMLDivElement>(null);
  // Full page walks and targeted SSE merges share one generation/abort domain.
  // A newer operation therefore cancels both kinds of stale work rather than
  // letting a late targeted response overwrite a newer full projection.
  const loadGenerationRef = useRef(0);
  const loadAbortRef = useRef<AbortController | null>(null);
  // Updated from the rendered result set below so keyboard and shift-range
  // actions never reach hidden rows when a search/filter is active.
  const visibleAssetsRef = useRef<LibraryAsset[]>([]);
  const anchorRef = useRef<number | null>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    additive: boolean;
    base: Set<string>;
    moved: boolean;
    rects: CardRect[];
  } | null>(null);

  const beginDesignSystemAction = useCallback(() => {
    if (dsBusyRef.current) return false;
    dsBusyRef.current = true;
    setDsBusy(true);
    return true;
  }, []);

  const endDesignSystemAction = useCallback(() => {
    dsBusyRef.current = false;
    setDsBusy(false);
  }, []);

  // Debounce the search box before it touches the network (250ms trailing).
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const query = useMemo<LibraryAssetQuery>(() => {
    const q: LibraryAssetQuery = {};
    // `element` is a badge identity, not a storage kind: element clips are
    // image screenshots or HTML snapshots marked in metadata. Leave the
    // storage-kind query open and split client-side from that marker.
    if (kind && kind !== 'element') q.kind = kind;
    if (source) q.source = source;
    return q;
  }, [kind, source]);

  // Whether any filter narrows the default newest-first feed. Tracked in a ref
  // so the long-lived SSE subscription can read it without resubscribing on
  // every keystroke. When filters are active the SSE handler can't safely
  // predict membership (source is an EXISTS join and search is a complete
  // client projection), so it falls back to a single full reload.
  const filtersActive = !!(kind || source || debouncedSearch.trim());
  const filtersActiveRef = useRef(filtersActive);
  useEffect(() => {
    filtersActiveRef.current = filtersActive;
  }, [filtersActive]);

  const beginRefresh = useCallback(() => {
    const generation = loadGenerationRef.current + 1;
    loadGenerationRef.current = generation;
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;
    return { generation, controller };
  }, []);

  const load = useCallback(async () => {
    const { generation, controller } = beginRefresh();
    const hadLoadedRows = loadedOnce.current;
    setLoading(true);
    if (!hadLoadedRows) setLibraryError(null);
    try {
      // Fetch every bounded page before applying either plain text or regex
      // locally. The daemon's first-page default is never a hidden search cap,
      // and both modes therefore see the same complete projection.
      const result = await fetchAllLibraryAssets(query, { signal: controller.signal });
      if (generation !== loadGenerationRef.current) return;
      if (!result.ok) {
        if (result.error.kind === 'aborted') return;
        setLibraryError(result.error);
        return;
      }
      // Final filtering is badge-aware (shared with the picker) so `image` excludes
      // element captures and `element` keeps only them; other kinds pass through.
      loadedOnce.current = true;
      setAssets(result.assets.filter((a) => matchesKindFilter(a, kind as KindFilterValue)));
    } finally {
      if (generation === loadGenerationRef.current && loadAbortRef.current === controller) {
        loadAbortRef.current = null;
        setLoading(false);
      }
    }
  }, [beginRefresh, debouncedSearch, kind, query]);

  useEffect(() => () => {
    loadGenerationRef.current += 1;
    loadAbortRef.current?.abort();
    loadAbortRef.current = null;
  }, []);

  // Force a reconcile (design systems + agent deliverables → referenced Library
  // rows), then reload so the freshly-indexed assets appear. The throttle lives
  // on the daemon; this is the explicit "pull everything in now" action.
  const runSync = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      await syncLibrary();
      await load();
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [load]);

  // Fetch when the tab becomes active or filters change.
  useEffect(() => {
    if (!active) return;
    void load();
  }, [active, load]);

  // Latest `load` for the long-lived SSE subscription to call on fallback,
  // without re-subscribing (which would drop+recreate the EventSource) on every
  // filter change.
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  // Live updates: clipper captures and deletes patch the grid incrementally.
  // A burst of captures used to trigger one full refetch + full re-render PER
  // event; here events are coalesced over a short window and applied as a
  // targeted merge (fetch the one new asset / drop the one deleted id). When a
  // filter is active — or any per-id fetch is ambiguous — we fall back to a
  // single full reload for that window.
  useEffect(() => {
    if (!active) return;
    let es: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let alive = true;
    const pendingIngest = new Set<string>();
    const pendingDelete = new Set<string>();
    let pendingFull = false;

    const flush = async () => {
      timer = null;
      const { generation, controller } = beginRefresh();
      const current = () => alive && generation === loadGenerationRef.current && !controller.signal.aborted;
      // Deletes are free (no fetch); apply them first.
      if (pendingDelete.size) {
        const del = new Set(pendingDelete);
        pendingDelete.clear();
        for (const id of del) pendingIngest.delete(id);
        if (current()) {
          setAssets((prev) => prev.filter((a) => !del.has(a.id)));
          setLibraryError(null);
        }
      }
      // A filtered view can't predict membership client-side — one reload.
      if (pendingFull || filtersActiveRef.current) {
        pendingFull = false;
        pendingIngest.clear();
        if (!current()) return;
        await loadRef.current();
        return;
      }
      if (pendingIngest.size) {
        const ids = [...pendingIngest];
        pendingIngest.clear();
        const fetched = await runLibraryPool(
          ids,
          (id, signal) => fetchLibraryAsset(id, { signal }),
          { signal: controller.signal },
        );
        if (!current()) return;
        // A missing fetch is ambiguous (filtered out? race?) — reload instead.
        if (fetched.some((entry) => !entry.ok || entry.value === null)) {
          await loadRef.current();
          return;
        }
        const resolved = fetched
          .map((entry) => entry.value)
          .filter((a): a is LibraryAsset => a !== null && a !== undefined);
        if (!current()) return;
        setAssets((prev) => mergeIngestedAssets(prev, resolved));
        setLibraryError(null);
      }
    };

    const schedule = () => {
      if (timer) return;
      timer = setTimeout(() => void flush(), 200);
    };

    try {
      es = new EventSource('/api/library/events');
      const onIngest = (ev: MessageEvent) => {
        const id = parseEventAssetId(ev.data);
        if (id) pendingIngest.add(id);
        else pendingFull = true;
        schedule();
      };
      const onDelete = (ev: MessageEvent) => {
        const id = parseEventAssetId(ev.data);
        if (id) pendingDelete.add(id);
        else pendingFull = true;
        schedule();
      };
      const onReconcile = () => {
        // Reconcile can change rows that have no individual ingest id. Every
        // active view gets the same bounded reload, including filtered views.
        pendingFull = true;
        schedule();
      };
      es.addEventListener('ingest', onIngest);
      es.addEventListener('delete', onDelete);
      es.addEventListener('reconcile', onReconcile);
    } catch {
      // EventSource unavailable — manual Refresh remains the fallback.
    }
    return () => {
      alive = false;
      loadGenerationRef.current += 1;
      loadAbortRef.current?.abort();
      if (timer) clearTimeout(timer);
      es?.close();
    };
  }, [active, beginRefresh]);

  // Drop selected ids that no longer exist after a reload / delete. Membership
  // is a single Set lookup so a large grid + large selection stays O(n).
  useEffect(() => {
    setSelectedIds((prev) => {
      if (!prev.size) return prev;
      const live = new Set(assets.map((a) => a.id));
      const next = new Set([...prev].filter((id) => live.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [assets]);

  // The delete itself. Reports failure rather than swallowing it, so a daemon
  // that refused leaves the gate open saying so instead of closing on a
  // removal that did not happen.
  const onDelete = useCallback(async (id: string) => {
    const asset = assets.find((candidate) => candidate.id === id);
    const result = await deleteLibraryAsset(id);
    if (!deleteOutcomeSucceeded(result)) {
      if (asset) setDeleteOutcome({ deleted: [], failed: [asset], skipped: [], residue: [] });
      return false;
    }
    if (asset && typeof result !== 'boolean' && result.residue?.length) {
      setDeleteOutcome({ deleted: [asset], failed: [], skipped: [], residue: result.residue });
    }
    setAssets((prev) => prev.filter((a) => a.id !== id));
    return true;
  }, [assets]);

  // Removing one asset had no confirmation at all: a single click on a small
  // button inside a hover-revealed row, and the bytes were gone. It now names
  // the asset and routes through the same two-key-plus-slider gate the rest of
  // the product uses for anything it cannot put back.
  const requestDeleteAsset = useCallback(
    (id: string) => {
      const asset = assets.find((a) => a.id === id);
      if (!asset) return;
      setDeleteOutcome(null);
      setDeleteGate({
        action: t('library.deleteAction', { count: 1 }),
        // The asset's own title, so the user can check the gate against the
        // card they meant to act on rather than against a generic noun.
        target: assetTitle(asset),
        items: describeAssetItems([asset], t),
        detail: describeDeleteDetail([asset], t),
        onConfirm: () => onDelete(id),
      });
    },
    [assets, onDelete, t],
  );

  // "Edit as page": turn a captured html asset into a fresh editable OD project
  // and open it on its index.html. The daemon owns the project creation; here we
  // just gate a spinner and navigate on success.
  const handleEditAsPage = useCallback(
    async (assetId: string) => {
      if (editingIdsRef.current.has(assetId)) return;
      editingIdsRef.current.add(assetId);
      setEditingId(assetId);
      try {
        const result = await editLibraryAssetAsPage(assetId);
        if (result) {
          setPreviewId(null);
          onOpenProject(result.projectId, result.relPath);
        }
      } finally {
        editingIdsRef.current.delete(assetId);
        setEditingId(null);
      }
    },
    [onOpenProject],
  );

  const deleteSelectedRef = useRef<(previewedIds: readonly string[]) => Promise<boolean>>(async () => false);
  const deleteSelected = useCallback(async (previewedIds: readonly string[]) => {
    const ids = [...previewedIds];
    if (!ids.length) return false;
    const results = await runLibraryPool(
      ids,
      async (id) => deleteLibraryAsset(id),
      { concurrency: LIBRARY_MAX_CONCURRENCY },
    );
    const resultById = new Map(results.map((entry) => [entry.item, entry]));
    const deletedIds = new Set(
      ids.filter((id) => {
        const result = resultById.get(id);
        return Boolean(result?.ok && result.value && deleteOutcomeSucceeded(result.value));
      }),
    );
    const failedIds = new Set(ids.filter((id) => !deletedIds.has(id)));
    const deletedAssets = assets.filter((asset) => deletedIds.has(asset.id));
    const failedAssets = assets.filter((asset) => failedIds.has(asset.id));
    // The ledger is itemized and survives a partial attempt. Failed rows stay
    // selected and the gate returns false, so DestructiveGate shows its failed
    // phase instead of playing the completion animation over half a delete.
    const residue = results.flatMap((entry) => (
      entry.ok && entry.value && typeof entry.value !== 'boolean' ? entry.value.residue ?? [] : []
    ));
    setDeleteOutcome({ deleted: deletedAssets, failed: failedAssets, skipped: [], residue });
    if (deletedIds.size) {
      setAssets((prev) => prev.filter((a) => !deletedIds.has(a.id)));
      setPreviewId((cur) => (cur && deletedIds.has(cur) ? null : cur));
    }
    setSelectedIds(new Set(failedIds));
    if (failedIds.size) {
      setDeleteGate((current) => {
        if (!current) return current;
        return {
          ...current,
          action: t('library.deleteAction', { count: failedAssets.length }),
          target: t('library.deleteTarget', { count: failedAssets.length }),
          items: describeAssetItems(failedAssets, t),
          detail: describeDeleteDetail(failedAssets, t),
          onConfirm: () => deleteSelectedRef.current([...failedIds]),
        };
      });
      return false;
    }
    return deletedIds.size > 0;
  }, [assets, t]);
  useEffect(() => {
    deleteSelectedRef.current = deleteSelected;
  }, [deleteSelected]);

  // Bulk delete is destructive and very easy to trigger — a button in the
  // selection bar, or Delete/Backspace with a box-selection still live. The
  // dialog it used to raise was answered by one click on an autofocused
  // button, which a stray Enter supplies; the gate cannot be answered by one
  // reflex, and it lists what is in the selection rather than only counting it.
  const requestDeleteSelected = useCallback(() => {
    const visibleIds = new Set(visibleAssetsRef.current.map((asset) => asset.id));
    const chosen = assets.filter((a) => visibleIds.has(a.id) && selectedIds.has(a.id));
    if (!chosen.length) return;
    setDeleteOutcome(null);
    const previewedIds = Object.freeze(chosen.map((asset) => asset.id));
    setDeleteGate({
      action: t('library.deleteAction', { count: chosen.length }),
      target: t('library.deleteTarget', { count: chosen.length }),
      items: describeAssetItems(chosen, t),
      detail: describeDeleteDetail(chosen, t),
      onConfirm: () => deleteSelected(previewedIds),
    });
  }, [assets, deleteSelected, selectedIds, t]);

  // --- multi-select → design system ---------------------------------------

  useEffect(() => {
    dsLoadedRef.current = false;
    setDsList([]);
  }, [workspaceIdentity]);

  // Lazily load the user's own (editable) design systems the first time the
  // "Use in design system" menu opens — these are the ones that can be refined.
  useEffect(() => {
    if (!dsMenuOpen || dsLoadedRef.current) return;
    dsLoadedRef.current = true;
    let cancelled = false;
    void fetchDesignSystems(workspaceContext).then((list) =>
      !cancelled && setDsList(list.filter((d) => d.source === 'user')));
    return () => {
      cancelled = true;
    };
  }, [dsMenuOpen, workspaceIdentity]);

  const closeDsMenu = useCallback(() => {
    setDsMenuOpen(false);
    setDsMenuQuery('');
    window.setTimeout(() => dsMenuButtonRef.current?.focus(), 0);
  }, []);

  const closeDsMenuWithoutFocus = useCallback(() => {
    setDsMenuOpen(false);
    setDsMenuQuery('');
  }, []);

  const visibleDesignSystemMenuItems = useMemo(
    () => dsList.filter((ds) => dsMenuSearch.matches(`${ds.title}\n${t('library.addAssetsAndRefine')}`)),
    [dsList, dsMenuSearch.matches, t],
  );

  const positionDsMenu = useCallback(() => {
    const trigger = dsMenuButtonRef.current;
    const panel = dsMenuPanelRef.current;
    if (!trigger || !panel || typeof window === 'undefined') return;
    const rect = trigger.getBoundingClientRect();
    const margin = 12;
    const gap = 6;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 320;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 320;
    const width = Math.min(320, Math.max(200, viewportWidth - margin * 2));
    const measuredHeight = Math.max(1, panel.scrollHeight);
    const below = Math.max(0, viewportHeight - rect.bottom - margin - gap);
    const above = Math.max(0, rect.top - margin - gap);
    const placeAbove = below < Math.min(measuredHeight, 220) && above > below;
    const maxHeight = Math.max(120, Math.min(measuredHeight, placeAbove ? above : below));
    const left = Math.max(margin, Math.min(rect.right - width, viewportWidth - width - margin));
    if (placeAbove) {
      setDsMenuStyle({ position: 'fixed', left, bottom: Math.max(margin, viewportHeight - rect.top + gap), width, maxHeight });
    } else {
      setDsMenuStyle({ position: 'fixed', left, top: Math.max(margin, rect.bottom + gap), width, maxHeight });
    }
  }, []);

  useEffect(() => {
    if (!dsMenuOpen) return;
    const frame = window.requestAnimationFrame(positionDsMenu);
    const onViewportChange = () => positionDsMenu();
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
    };
  }, [dsMenuOpen, positionDsMenu, visibleDesignSystemMenuItems.length, dsMenuQuery]);

  // Dismiss the menu on outside click / Escape. Deliberately NOT a full-screen
  // backdrop element: a stray bare overlay can paint opaque (e.g. UA button
  // styling) and blank the whole page behind it.
  useEffect(() => {
    if (!dsMenuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const regexPopover = target?.closest('[data-testid="library-design-system-menu-search-regex-popover"]');
      if (!regexPopover && !dsMenuWrapRef.current?.contains(e.target as Node)) closeDsMenuWithoutFocus();
    };
    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as Node | null;
      const regexPopover = (target as HTMLElement | null)?.closest('[data-testid="library-design-system-menu-search-regex-popover"]');
      if (!regexPopover && !dsMenuWrapRef.current?.contains(target)) closeDsMenuWithoutFocus();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeDsMenu();
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('keydown', onKey);
    };
  }, [closeDsMenu, closeDsMenuWithoutFocus, dsMenuOpen]);

  useEffect(() => {
    if (!dsMenuOpen) return;
    dsMenuSearchInputRef.current?.focus();
  }, [dsMenuOpen]);

  const moveDesignSystemMenuFocus = useCallback((delta: number) => {
    const items = Array.from(dsMenuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []);
    if (!items.length) return;
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = current < 0 ? (delta > 0 ? 0 : items.length - 1) : (current + delta + items.length) % items.length;
    items[next]?.focus();
  }, []);

  // Path A: open the create-design-system flow pre-seeded with the selected
  // assets as source material (fetched into File objects via a hand-off store).
  const createDesignSystemFromSelection = useCallback(async () => {
    const visibleIds = new Set(visibleAssetsRef.current.map((asset) => asset.id));
    const chosen = assets.filter((a) => visibleIds.has(a.id) && selectedIds.has(a.id));
    if (!chosen.length || !beginDesignSystemAction()) return;
    try {
      const files = (await Promise.all(chosen.map((a) => fetchLibraryAssetAsFile(a)))).filter(
        (f): f is File => f !== null,
      );
      setDesignSystemAssetSeed({ files });
      closeDsMenu();
      setSelectedIds(new Set());
      setPendingDesignSystemCreateEntry('library');
      navigate({ kind: 'design-system-create' });
    } finally {
      endDesignSystemAction();
    }
  }, [assets, beginDesignSystemAction, closeDsMenu, endDesignSystemAction, selectedIds]);

  // "Chat to design": fetch the selected assets into File objects, hand them to
  // the Home chat composer, and navigate there. The user lands in the creation
  // composer with the assets staged, describes what to build, and Runs to spawn
  // a new project — the assets ride the normal upload-on-Run path. Mirrors the
  // create-design-system File hand-off above, but the destination is Home.
  const chatToDesignFromSelection = useCallback(async () => {
    const visibleIds = new Set(visibleAssetsRef.current.map((asset) => asset.id));
    const chosen = assets.filter((a) => visibleIds.has(a.id) && selectedIds.has(a.id));
    if (!chosen.length || !beginDesignSystemAction()) return;
    try {
      const files = (await Promise.all(chosen.map((a) => fetchLibraryAssetAsFile(a)))).filter(
        (f): f is File => f !== null,
      );
      if (!files.length) return;
      setHomeComposerAssetSeed({ files });
      closeDsMenu();
      setSelectedIds(new Set());
      navigate({ kind: 'home', view: 'home' });
    } finally {
      endDesignSystemAction();
    }
  }, [assets, beginDesignSystemAction, closeDsMenu, endDesignSystemAction, selectedIds]);

  // Path B: copy the selected assets into an existing design system's project,
  // stage a composer seed (query + the copied assets as attachments), and open
  // that project so the user can review and Send to refine the system.
  const optimizeExistingDesignSystem = useCallback(
    async (ds: DesignSystemSummary) => {
      const visibleIds = new Set(visibleAssetsRef.current.map((asset) => asset.id));
      const chosen = assets.filter((a) => visibleIds.has(a.id) && selectedIds.has(a.id));
      if (!chosen.length || !beginDesignSystemAction()) return;
      try {
        const mutationWorkspaceContext = workspaceContext;
        let projectId = ds.projectId;
        if (!projectId) {
          const detail = await fetchDesignSystem(ds.id, mutationWorkspaceContext);
          projectId = detail?.projectId;
        }
        if (!projectId) {
          closeDsMenu();
          return;
        }
        const projectWorkspaceContext = await resolveProjectWorkspaceContext(
          projectId,
          mutationWorkspaceContext,
          mutationWorkspaceContext?.workspaceId ?? null,
        );
        const attachments: ChatAttachment[] = [];
        for (const a of chosen) {
          const res = await applyLibraryAsset(
            a.id,
            projectId,
            undefined,
            { includeElement: true },
            projectWorkspaceContext,
          );
          if (res?.relPath) {
            attachments.push({
              path: res.relPath,
              name: res.relPath.split('/').pop() || res.relPath,
              kind: a.kind === 'image' ? 'image' : 'file',
            });
          }
          // An element-pick capture also brings its markup; stage it so the
          // design-system refinement can read the element's HTML, not just the
          // screenshot.
          if (res?.elementRelPath) {
            attachments.push({
              path: res.elementRelPath,
              name: res.elementRelPath.split('/').pop() || res.elementRelPath,
              kind: 'file',
            });
          }
        }
        const n = chosen.length;
        const text = t('library.handoffPrompt', { count: n });
        setComposerSeed({ projectId, text, attachments });
        closeDsMenu();
        setSelectedIds(new Set());
        onOpenProject(projectId);
      } finally {
        endDesignSystemAction();
      }
    },
    [assets, beginDesignSystemAction, closeDsMenu, endDesignSystemAction, onOpenProject, selectedIds, t, workspaceIdentity],
  );

  const toggleOne = useCallback((id: string, index: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    anchorRef.current = index;
  }, []);

  const rangeTo = useCallback(
    (index: number) => {
      const anchor = anchorRef.current ?? index;
      const lo = Math.min(anchor, index);
      const hi = Math.max(anchor, index);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (let i = lo; i <= hi; i++) {
          const asset = visibleAssetsRef.current[i];
          if (asset) next.add(asset.id);
        }
        return next;
      });
    },
    [],
  );

  const selectAll = useCallback(
    () => setSelectedIds(new Set(visibleAssetsRef.current.map((asset) => asset.id))),
    [],
  );
  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  // --- file upload (drop-anywhere + Upload button) -------------------------
  const openUpload = useCallback((files?: File[]) => {
    setSeedFiles(files && files.length ? files : null);
    setUploadOpen(true);
  }, []);

  // A drag carrying OS files anywhere over the section reveals a drop overlay;
  // dropping seeds the upload modal. enter/leave are depth-counted so child
  // elements don't flicker the overlay. Pure-internal drags (rubber-band box
  // select) never set the `Files` type, so they don't trigger this.
  const dragHasFiles = (e: React.DragEvent) => e.dataTransfer?.types?.includes('Files');
  const onSectionDragEnter = useCallback((e: React.DragEvent) => {
    if (!dragHasFiles(e)) return;
    e.preventDefault();
    fileDragDepth.current += 1;
    setFileDragActive(true);
  }, []);
  const onSectionDragOver = useCallback((e: React.DragEvent) => {
    if (!dragHasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);
  const onSectionDragLeave = useCallback((e: React.DragEvent) => {
    if (!dragHasFiles(e)) return;
    fileDragDepth.current = Math.max(0, fileDragDepth.current - 1);
    if (fileDragDepth.current === 0) setFileDragActive(false);
  }, []);
  const onSectionDrop = useCallback(
    (e: React.DragEvent) => {
      if (!dragHasFiles(e)) return;
      e.preventDefault();
      fileDragDepth.current = 0;
      setFileDragActive(false);
      const files = Array.from(e.dataTransfer.files ?? []);
      if (files.length) openUpload(files);
    },
    [openUpload],
  );

  // --- box selection (rubber band) ----------------------------------------
  const onGridMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      // Starting on a card is a click / preview gesture, not a box select.
      if (target.closest('[data-asset-card]')) return;
      const additive = e.metaKey || e.ctrlKey || e.shiftKey;
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        additive,
        base: new Set(additive ? selectedIds : []),
        moved: false,
        // Snapshot every card's box ONCE here, while the whole grid is laid out
        // (content-visibility reserves the same box for off-screen cards). The
        // move handler then hit-tests these cached rects instead of forcing a
        // querySelectorAll + getBoundingClientRect reflow on every mouse move.
        rects: snapshotCardRects(gridRef.current),
      };
      setBand({ x: e.clientX, y: e.clientY, w: 0, h: 0 });
      setDragging(true);
    },
    [selectedIds],
  );

  useEffect(() => {
    if (!dragging) return;
    let raf = 0;
    let lastX = dragRef.current?.startX ?? 0;
    let lastY = dragRef.current?.startY ?? 0;

    const apply = () => {
      raf = 0;
      const d = dragRef.current;
      if (!d) return;
      const band: Band = {
        x: Math.min(d.startX, lastX),
        y: Math.min(d.startY, lastY),
        w: Math.abs(lastX - d.startX),
        h: Math.abs(lastY - d.startY),
      };
      setBand(band);
      const next = new Set(d.base);
      // `.band` is position:fixed, so the snapshotted viewport rects and the
      // band share a coordinate space; the scroll handler re-snapshots so the
      // selection still tracks content that scrolls under a stationary band.
      for (const id of cardIdsInBand(d.rects, band)) next.add(id);
      setSelectedIds(next);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const move = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      d.moved = true;
      lastX = e.clientX;
      lastY = e.clientY;
      schedule();
    };
    const onScroll = () => {
      const d = dragRef.current;
      if (!d) return;
      d.rects = snapshotCardRects(gridRef.current);
      schedule();
    };
    const up = () => {
      const d = dragRef.current;
      // A click on empty space (no drag) clears the selection.
      if (d && !d.moved && !d.additive) setSelectedIds(new Set());
      dragRef.current = null;
      setDragging(false);
      setBand(null);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    // Capture so a scrolling inner pane (not just the window) re-snapshots.
    window.addEventListener('scroll', onScroll, true);
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = 'none';
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('scroll', onScroll, true);
      document.body.style.userSelect = prevUserSelect;
    };
  }, [dragging]);

  // --- keyboard shortcuts --------------------------------------------------
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      // The upload modal, the destructive gate, and the design-system menu own
      // shortcuts while open. Escape is already taken by the gate in the
      // capture phase; Delete/Backspace and Cmd+A are not, so this guard is
      // what stops a second gate being raised over the open one.
      if (uploadOpen || deleteGate || dsMenuOpen) return;
      const el = document.activeElement as HTMLElement | null;
      const typing =
        !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && (e.key === 'a' || e.key === 'A')) {
        if (typing || !assets.length) return;
        e.preventDefault();
        selectAll();
      } else if (e.key === 'Escape') {
        if (previewId) return; // the preview modal owns Escape while it's open
        if (selectedIds.size) setSelectedIds(new Set());
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (typing || previewId || !selectedIds.size) return;
        e.preventDefault();
        requestDeleteSelected();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, assets, selectedIds, previewId, uploadOpen, deleteGate, dsMenuOpen, selectAll, requestDeleteSelected]);

  // `@font-face` rules for every font asset on screen, so both the grid
  // thumbnails and the preview specimen render in the real typeface.
  const fontFaceCss = useMemo(
    () =>
      assets
        .filter((a) => a.kind === 'font')
        .map(
          (a) =>
            `@font-face{font-family:"${fontFamilyFor(a.id)}";src:url("${libraryAssetRawUrl(
              a.id,
            )}");font-display:swap;}`,
        )
        .join('\n'),
    [assets],
  );

  // Search locally over the real provider results. `useRegexSearch` supplies
  // plain-text matching by default and a bounded regex matcher after the
  // explicit opt-in. Preserve each source index so range selection and box
  // selection keep their existing semantics when a query narrows the view.
  const visibleAssetEntries = useMemo(
    () => assets
      .map((asset, index) => ({ asset, index }))
      .filter(({ asset }) => matchesLibraryAsset(libraryAssetSearchText(asset))),
    [assets, matchesLibraryAsset],
  );
  visibleAssetsRef.current = visibleAssetEntries.map(({ asset }) => asset);
  useEffect(() => {
    // A query change must not leave a hidden row selected while the new result
    // set is waiting for the next user action.
    const visibleIds = new Set(visibleAssetsRef.current.map((asset) => asset.id));
    setSelectedIds((prev) => {
      const next = new Set([...prev].filter((id) => visibleIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [visibleAssetEntries]);
  const searchActive = search.trim().length > 0 || kind !== '' || source !== '';
  // Preview navigation follows the same visible projection as the grid. A
  // hidden filtered row must never become the next/previous destination.
  const previewIndex = previewId
    ? visibleAssetEntries.findIndex(({ asset }) => asset.id === previewId)
    : -1;
  const previewAsset = previewIndex >= 0 ? visibleAssetEntries[previewIndex]?.asset ?? null : null;
  useEffect(() => {
    if (previewId && previewIndex < 0) setPreviewId(null);
  }, [previewId, previewIndex]);
  const selectedCount = selectedIds.size;

  // Day-bucketed groups for the timeline view (newest day first). Items keep
  // their flat index in `assets` so range/box selection stays consistent across
  // both views. Grouping by a Map collapses non-contiguous same-day assets.
  const timelineGroups = useMemo(() => {
    const map = new Map<string, Array<{ asset: LibraryAsset; index: number }>>();
    visibleAssetEntries.forEach(({ asset }, visibleIndex) => {
      const key = dayKeyOf(asset);
      const bucket = map.get(key);
      if (bucket) bucket.push({ asset, index: visibleIndex });
      else map.set(key, [{ asset, index: visibleIndex }]);
    });
    return [...map.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
      .map(([key, items]) => ({ key, items }));
  }, [visibleAssetEntries]);

  const kindFilterOptions = useMemo(() => kindFilters(t), [t]);
  const sourceFilterOptions = useMemo(() => sourceFilters(t), [t]);

  // Render one memoized card. The wrapper just wires this render's per-card
  // props; `LibraryCard` itself is what skips re-rendering when only another
  // card's selection changed.
  const renderCard = (asset: LibraryAsset, index: number) => (
    <LibraryCard
      key={asset.id}
      asset={asset}
      index={index}
      selected={selectedIds.has(asset.id)}
      editing={editingId === asset.id}
      onToggle={toggleOne}
      onRange={rangeTo}
      onPreview={setPreviewId}
      onDelete={requestDeleteAsset}
      onEditAsPage={handleEditAsPage}
      onOpenProject={onOpenProject}
    />
  );

  return (
    <div
      className={`entry-section ${styles.root}`}
      data-testid="library-section"
      onDragEnter={onSectionDragEnter}
      onDragOver={onSectionDragOver}
      onDragLeave={onSectionDragLeave}
      onDrop={onSectionDrop}
    >
      {fontFaceCss ? <style>{fontFaceCss}</style> : null}
      <header className="entry-section__head">
        <h1 className="entry-section__title">{t('library.title')}</h1>
        <div className={styles.clipperHint}>
          <p className={styles.headerHint}>{t('library.headerHint')}</p>
          <a
            className={styles.clipperDownload}
            href="https://open-design.ai/clipper"
            target="_blank"
            rel="noreferrer"
          >
            <Icon name="download" size={15} />
            {t('library.getClipper')}
          </a>
        </div>
      </header>

      <div className={styles.toolbar}>
        <div className={styles.searchWrap}>
          <Icon name="search" size={15} className={styles.searchIcon} />
          <RegexSearchField
            search={librarySearch}
            fieldLabel={t('library.title')}
            className={styles.search}
            hostClassName={styles.searchFieldHost}
            placeholder={t('library.searchPlaceholder')}
            ariaLabel={t('library.searchPlaceholder')}
            testId="library-search"
          />
        </div>
        <VisuallyHidden
          role="status"
          aria-live="polite"
          data-testid="library-search-results"
        >
          {t('library.resultsCount', { count: visibleAssetEntries.length })}
        </VisuallyHidden>
        <LibraryFilterCombobox
          label={t('library.filterByKind')}
          value={kind}
          options={kindFilterOptions}
          onChange={setKind}
          noMatchesLabel={t('library.noMatches')}
          testId="library-kind-filter"
        />
        <LibraryFilterCombobox
          label={t('library.filterBySource')}
          value={source}
          options={sourceFilterOptions}
          onChange={setSource}
          noMatchesLabel={t('library.noMatches')}
          testId="library-source-filter"
        />
        <div className={styles.viewToggle} role="group" aria-label={t('library.viewMode')}>
          <button
            type="button"
            className={`${styles.viewToggleBtn} od-tooltip`}
            data-active={viewMode === 'grid' ? 'true' : 'false'}
            aria-pressed={viewMode === 'grid'}
            onClick={() => setViewMode('grid')}
            data-tooltip={t('library.viewGridTooltip')}
            data-tooltip-placement="bottom"
          >
            {t('library.viewGrid')}
          </button>
          <button
            type="button"
            className={`${styles.viewToggleBtn} od-tooltip`}
            data-active={viewMode === 'timeline' ? 'true' : 'false'}
            aria-pressed={viewMode === 'timeline'}
            onClick={() => setViewMode('timeline')}
            data-tooltip={t('library.viewTimelineTooltip')}
            data-tooltip-placement="bottom"
          >
            {t('library.viewTimeline')}
          </button>
        </div>
        <Button
          variant="ghost"
          className={`${styles.refreshBtn} od-tooltip`}
          onClick={() => void load()}
          aria-busy={loading}
          data-tooltip={t('library.refreshTooltip')}
          data-tooltip-placement="bottom"
        >
          <Icon name="refresh" size={15} className={loading ? styles.spin : undefined} />
          {t('library.refresh')}
        </Button>
        <Button
          variant="ghost"
          className={`${styles.refreshBtn} od-tooltip`}
          onClick={() => void runSync()}
          aria-busy={syncing}
          disabled={syncing}
          data-tooltip={t('library.syncTooltip')}
          data-tooltip-placement="bottom"
        >
          <Icon name="refresh" size={15} className={syncing ? styles.spin : undefined} />
          {syncing ? t('library.syncing') : t('library.sync')}
        </Button>
        <Button
          className={`${styles.uploadBtn} od-tooltip`}
          onClick={() => openUpload()}
          data-tooltip={t('library.uploadTooltip')}
          data-tooltip-placement="bottom"
        >
          <Icon name="upload" size={15} />
          {t('library.upload')}
        </Button>
      </div>

      {libraryError ? (
        <div className={styles.loadError} role="alert" data-testid="library-load-error">
          <span>{t('library.loadError')}</span>
          <button type="button" className={styles.selectionLink} onClick={() => void load()}>
            {t('library.retry')}
          </button>
        </div>
      ) : null}

      {deleteOutcome && (deleteOutcome.failed.length > 0 || deleteOutcome.residue.length > 0) ? (
        <div className={styles.loadError} role="alert" data-testid="library-delete-outcome">
          <div>
            <div>{t('library.uploadSummary', {
              added: deleteOutcome.deleted.length,
              failed: deleteOutcome.failed.length + deleteOutcome.skipped.length + deleteOutcome.residue.length,
            })}</div>
            <ul className={styles.outcomeItems}>
              {deleteOutcome.failed.map((asset) => <li key={asset.id}>{assetTitle(asset)}</li>)}
              {deleteOutcome.skipped.map((asset) => <li key={asset.id}>{assetTitle(asset)}</li>)}
              {deleteOutcome.residue.length > 0 ? <li>{deleteOutcome.residue.join(', ')}</li> : null}
            </ul>
          </div>
          <button type="button" className={styles.selectionLink} onClick={requestDeleteSelected}>
            {t('library.retry')}
          </button>
        </div>
      ) : null}

      {selectedCount > 0 && !dragging ? (
        <div className={styles.selectionBar}>
          <span className={styles.selectionCount}>
            {t('library.selectedCount', { count: selectedCount })}
          </span>
          <span className={styles.selectionScope} data-testid="library-selection-scope">
            {t('library.scopeVisible', { count: visibleAssetEntries.length })}
          </span>
          <button type="button" className={styles.selectionLink} onClick={selectAll}>
            {t('library.selectAll')}
          </button>
          <button type="button" className={styles.selectionLink} onClick={clearSelection}>
            {t('library.clear')}
          </button>
          <span className={styles.selectionSpacer} />
          <button
            type="button"
            className={styles.chatBtn}
            onClick={() => void chatToDesignFromSelection()}
            disabled={dsBusy}
            title={t('library.chatToDesignTitle', { count: selectedCount })}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            {t('library.chatToDesign')}
          </button>
          <div className={styles.dsMenuWrap} ref={dsMenuWrapRef}>
            <button
              ref={dsMenuButtonRef}
              type="button"
              className={styles.dsMenuBtn}
              onClick={() => {
                if (dsMenuOpen) closeDsMenu();
                else setDsMenuOpen(true);
              }}
              aria-haspopup="menu"
              aria-expanded={dsMenuOpen}
              aria-controls={dsMenuId}
              aria-label={t('library.useInDesignSystem')}
              disabled={dsBusy}
            >
              {dsBusy ? t('library.working') : t('library.useInDesignSystem')}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            {dsMenuOpen ? (
              <div
                className={styles.dsMenu}
                ref={dsMenuPanelRef}
                style={dsMenuStyle}
                role="group"
                aria-label={t('library.useInDesignSystem')}
              >
                <RegexSearchField
                  search={dsMenuSearch}
                  fieldLabel={t('library.useInDesignSystem')}
                  hostClassName={styles.dsMenuSearch}
                  placeholder={t('library.useInDesignSystem')}
                  ariaLabel={t('library.useInDesignSystem')}
                  inputRef={dsMenuSearchInputRef}
                  testId="library-design-system-menu-search"
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowDown') {
                      event.preventDefault();
                      moveDesignSystemMenuFocus(1);
                    } else if (event.key === 'ArrowUp') {
                      event.preventDefault();
                      const items = dsMenuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)');
                      items?.[items.length - 1]?.focus();
                    }
                  }}
                />
                <div
                  ref={dsMenuRef}
                  id={dsMenuId}
                  className={styles.dsMenuItems}
                  role="menu"
                  aria-label={t('library.useInDesignSystem')}
                  aria-live="polite"
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      closeDsMenu();
                    } else if (event.key === 'ArrowDown') {
                      event.preventDefault();
                      moveDesignSystemMenuFocus(1);
                    } else if (event.key === 'ArrowUp') {
                      event.preventDefault();
                      moveDesignSystemMenuFocus(-1);
                    } else if (event.key === 'Home') {
                      event.preventDefault();
                      dsMenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus();
                    } else if (event.key === 'End') {
                      event.preventDefault();
                      const items = dsMenuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)');
                      items?.[items.length - 1]?.focus();
                    }
                  }}
                >
                  {dsMenuSearch.matches(t('library.createDesignSystem')) ? (
                    <button
                      type="button"
                      className={styles.dsMenuItem}
                      role="menuitem"
                      disabled={dsBusy}
                      aria-busy={dsBusy}
                      onClick={() => void createDesignSystemFromSelection()}
                    >
                      <span className={styles.dsMenuItemTitle}>{t('library.createDesignSystem')}</span>
                      <span className={styles.dsMenuItemSub}>
                        {t('library.createDesignSystemSub', { count: selectedCount })}
                      </span>
                    </button>
                  ) : null}
                  {dsList.length > 0 ? <div className={styles.dsMenuDivider} role="separator" /> : null}
                  {dsList.length > 0 ? <div className={styles.dsMenuHeader} role="presentation">{t('library.refineExisting')}</div> : null}
                  {visibleDesignSystemMenuItems.map((ds) => (
                    <button
                      key={ds.id}
                      type="button"
                      className={styles.dsMenuItem}
                      role="menuitem"
                      disabled={dsBusy}
                      aria-busy={dsBusy}
                      onClick={() => void optimizeExistingDesignSystem(ds)}
                    >
                      <span className={styles.dsMenuItemTitle}>{ds.title}</span>
                      <span className={styles.dsMenuItemSub}>{t('library.addAssetsAndRefine')}</span>
                    </button>
                  ))}
                </div>
                {visibleDesignSystemMenuItems.length === 0 && !dsMenuSearch.matches(t('library.createDesignSystem')) ? (
                  <div className={styles.dsMenuEmpty} role="status">{t('library.noMatches')}</div>
                ) : null}
              </div>
            ) : null}
          </div>
          <button type="button" className={styles.selectionDelete} onClick={requestDeleteSelected}>
            {t('library.deleteCount', { count: selectedCount })}
          </button>
        </div>
      ) : null}

      {loading && assets.length === 0 ? (
        <p className={styles.empty}>{t('library.loading')}</p>
      ) : assets.length === 0 ? (
        <div className={styles.empty}>
          <p>{t('library.emptyTitle')}</p>
          <p className={styles.emptyHint}>
            {t('library.emptyHintBefore')}{' '}
            <code>od library import &lt;file&gt;</code>
            {t('library.emptyHintAfter')}
          </p>
        </div>
      ) : searchActive && visibleAssetEntries.length === 0 ? (
        <div className={styles.empty} data-testid="library-search-empty">
          <p>{t('library.noMatches')}</p>
        </div>
      ) : viewMode === 'timeline' ? (
        <div
          className={styles.timeline}
          ref={gridRef}
          onMouseDown={onGridMouseDown}
          data-selecting={selectedCount > 0 ? 'true' : 'false'}
        >
          {timelineGroups.map((group) => (
            <section key={group.key} className={styles.timelineDay}>
              <div className={styles.timelineHead}>
                <span className={styles.timelineDot} aria-hidden />
                <h2 className={styles.timelineDate}>{dayHeading(group.key, t)}</h2>
                <span className={styles.timelineCount}>{group.items.length}</span>
              </div>
              <div className={styles.timelineGrid}>
                {group.items.map(({ asset, index }) => renderCard(asset, index))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div
          className={styles.grid}
          ref={gridRef}
          onMouseDown={onGridMouseDown}
          data-selecting={selectedCount > 0 ? 'true' : 'false'}
        >
          {visibleAssetEntries.map(({ asset }, visibleIndex) => renderCard(asset, visibleIndex))}
        </div>
      )}

      {band ? (
        <div
          className={styles.band}
          style={{ left: band.x, top: band.y, width: band.w, height: band.h }}
        />
      ) : null}

      {fileDragActive ? (
        <div className={styles.dropOverlay} aria-hidden>
          <div className={styles.dropOverlayInner}>
            <Icon name="upload" size={30} />
            <span className={styles.dropOverlayText}>{t('library.dropToUpload')}</span>
          </div>
        </div>
      ) : null}

      {uploadOpen ? (
        <LibraryUploadModal
          seedFiles={seedFiles}
          onClose={() => {
            setUploadOpen(false);
            setSeedFiles(null);
          }}
          onUploaded={load}
        />
      ) : null}

      {deleteGate ? (
        <DestructiveGate
          action={deleteGate.action}
          target={deleteGate.target}
          items={deleteGate.items}
          detail={deleteGate.detail}
          // True for both storage models, for different reasons: an owned
          // asset loses its bytes, and every asset loses the Library record
          // that carried its caption, OCR text, tags and palette.
          irreversible
          onConfirm={deleteGate.onConfirm}
          // `cancelled` means nothing ran and the selection is untouched;
          // `dismissed` and `completed` both mean the delete was started, and
          // the grid already reflects whatever landed.
          onClose={() => setDeleteGate(null)}
        />
      ) : null}

      {previewAsset ? (
        <LibraryPreviewModal
          asset={previewAsset}
          hasPrev={previewIndex > 0}
          hasNext={previewIndex >= 0 && previewIndex < visibleAssetEntries.length - 1}
          onPrev={() => {
            const prev = visibleAssetEntries[previewIndex - 1]?.asset;
            if (prev) setPreviewId(prev.id);
          }}
          onNext={() => {
            const next = visibleAssetEntries[previewIndex + 1]?.asset;
            if (next) setPreviewId(next.id);
          }}
          onClose={() => setPreviewId(null)}
          // The preview closes BEFORE the gate opens, and it has to: the
          // preview is a portal at `z-index: 1000` and the gate's dialog
          // backdrop sits at 100, so a gate raised underneath it would be
          // invisible — a super-confirmation nobody can see is worse than the
          // unguarded delete this replaced. Cancelling therefore returns the
          // user to the grid rather than to the preview; nothing is deleted.
          onDelete={(id) => {
            setPreviewId(null);
            requestDeleteAsset(id);
          }}
          onOpenProject={onOpenProject}
          onEditAsPage={handleEditAsPage}
        />
      ) : null}
    </div>
  );
}

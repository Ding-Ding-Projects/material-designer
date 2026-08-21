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
// Copy is intentionally inline (not yet i18n-keyed) — localization of the
// Library surface is a tracked follow-up.

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChatAttachment, DesignSystemSummary, LibraryAsset } from '@open-design/contracts';
import {
  applyLibraryAsset,
  deleteLibraryAsset,
  editLibraryAssetAsPage,
  fetchDesignSystem,
  fetchDesignSystems,
  fetchLibraryAsset,
  fetchLibraryAssets,
  fetchLibraryAssetAsFile,
  libraryAssetRawUrl,
  syncLibrary,
  type LibraryAssetQuery,
} from '../providers/registry';
import { useInView } from './plugins-home/useInView';
import { navigate } from '../router';
import { setPendingDesignSystemCreateEntry } from '../analytics/ds-create-entry';
import { setComposerSeed, setDesignSystemAssetSeed, setHomeComposerAssetSeed } from '../state/libraryHandoff';
import { Button } from '@open-design/components';
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
  type KindFilterValue,
} from './LibraryAssetMeta';
import { LibraryPreviewModal } from './LibraryPreviewModal';
import { LibraryUploadModal } from './LibraryUploadModal';
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
export function describeAssetLoss(asset: LibraryAsset): string {
  const title = assetTitle(asset);
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
export function describeAssetItems(assets: readonly LibraryAsset[]): string[] {
  const named = assets.slice(0, MAX_GATE_ITEMS).map(describeAssetLoss);
  const rest = assets.length - named.length;
  if (rest > 0) named.push(`…and ${rest} more asset${rest === 1 ? '' : 's'} in the selection`);
  return named;
}

/** The blast-radius sentence, keyed on which storage models are in the set. */
export function describeDeleteDetail(assets: readonly LibraryAsset[]): string {
  const owned = assets.filter((a) => a.storage === 'owned').length;
  const referenced = assets.length - owned;
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
      'Nothing in Open Design keeps a second copy, so this cannot be undone.'
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
  /** Flat position in `assets` — drives shift-range + box selection. */
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
            {SOURCE_LABELS[src]}
          </span>
        ) : null}
        <span
          className={styles.kindBadge}
          style={{ ['--kind-tint' as string]: kindTint(badgeKind(asset)) }}
        >
          <KindIcon kind={badgeKind(asset)} size={12} />
          {kindLabel(badgeKind(asset))}
        </span>
      </div>
      <figcaption className={styles.meta}>
        <button
          type="button"
          className={styles.title}
          title={asset.sourceTitle ?? asset.sourceUrl ?? asset.id}
          onClick={() => onPreview(asset.id)}
        >
          {title}
        </button>
        <span className={styles.sub}>
          {asset.width && asset.height
            ? `${asset.width}×${asset.height}`
            : kindLabel(badgeKind(asset))}
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
  const { context: workspaceContext } = useWorkspaceContext();
  const workspaceIdentity = workspaceIdentityCacheKey(workspaceContext);
  const [assets, setAssets] = useState<LibraryAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [kind, setKind] = useState('');
  const [source, setSource] = useState('');
  const [search, setSearch] = useState('');
  // The input updates `search` instantly (responsive typing) but the server
  // query keys off `debouncedSearch`, so a fast typist fires one request, not
  // one per keystroke.
  const [debouncedSearch, setDebouncedSearch] = useState('');
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
  // Asset currently being turned into an editable OD page (spinner gate).
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'timeline'>('grid');
  // "Use in design system" menu state (multi-select → design system).
  const [dsMenuOpen, setDsMenuOpen] = useState(false);
  const [dsList, setDsList] = useState<DesignSystemSummary[]>([]);
  const [dsBusy, setDsBusy] = useState(false);
  const dsLoadedRef = useRef(false);
  const dsMenuWrapRef = useRef<HTMLDivElement>(null);
  const [fileDragActive, setFileDragActive] = useState(false);
  const fileDragDepth = useRef(0);
  const loadedOnce = useRef(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<number | null>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    additive: boolean;
    base: Set<string>;
    moved: boolean;
    rects: CardRect[];
  } | null>(null);

  // Debounce the search box before it touches the network (250ms trailing).
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const query = useMemo<LibraryAssetQuery>(() => {
    const q: LibraryAssetQuery = {};
    // `element` is a badge identity, not a storage kind (element clips are
    // stored as `image`); narrow to images on the server, then split client-side.
    if (kind) q.kind = kind === 'element' ? 'image' : kind;
    if (source) q.source = source;
    if (debouncedSearch.trim()) q.q = debouncedSearch.trim();
    return q;
  }, [kind, source, debouncedSearch]);

  // Whether any filter narrows the default newest-first feed. Tracked in a ref
  // so the long-lived SSE subscription can read it without resubscribing on
  // every keystroke. When filters are active the SSE handler can't safely
  // predict membership (server `source` is an EXISTS join, `q` is a fuzzy
  // match), so it falls back to a single full reload.
  const filtersActive = !!(kind || source || debouncedSearch.trim());
  const filtersActiveRef = useRef(filtersActive);
  useEffect(() => {
    filtersActiveRef.current = filtersActive;
  }, [filtersActive]);

  const load = useCallback(async () => {
    setLoading(true);
    const next = await fetchLibraryAssets(query);
    // Final filtering is badge-aware (shared with the picker) so `image` excludes
    // element captures and `element` keeps only them; other kinds pass through.
    setAssets(next.filter((a) => matchesKindFilter(a, kind as KindFilterValue)));
    setLoading(false);
  }, [query, kind]);

  // Force a reconcile (design systems + agent deliverables → referenced Library
  // rows), then reload so the freshly-indexed assets appear. The throttle lives
  // on the daemon; this is the explicit "pull everything in now" action.
  const runSync = useCallback(async () => {
    setSyncing(true);
    try {
      await syncLibrary();
      await load();
    } finally {
      setSyncing(false);
    }
  }, [load]);

  // Fetch when the tab becomes active or filters change.
  useEffect(() => {
    if (!active) return;
    loadedOnce.current = true;
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
    const pendingIngest = new Set<string>();
    const pendingDelete = new Set<string>();
    let pendingFull = false;

    const flush = async () => {
      timer = null;
      // Deletes are free (no fetch); apply them first.
      if (pendingDelete.size) {
        const del = new Set(pendingDelete);
        pendingDelete.clear();
        for (const id of del) pendingIngest.delete(id);
        setAssets((prev) => prev.filter((a) => !del.has(a.id)));
      }
      // A filtered view can't predict membership client-side — one reload.
      if (pendingFull || filtersActiveRef.current) {
        pendingFull = false;
        pendingIngest.clear();
        await loadRef.current();
        return;
      }
      if (pendingIngest.size) {
        const ids = [...pendingIngest];
        pendingIngest.clear();
        const fetched = await Promise.all(ids.map((id) => fetchLibraryAsset(id)));
        // A missing fetch is ambiguous (filtered out? race?) — reload instead.
        if (fetched.some((a) => a === null)) {
          await loadRef.current();
          return;
        }
        const resolved = fetched.filter((a): a is LibraryAsset => a !== null);
        setAssets((prev) => mergeIngestedAssets(prev, resolved));
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
      es.addEventListener('ingest', onIngest);
      es.addEventListener('delete', onDelete);
    } catch {
      // EventSource unavailable — manual Refresh remains the fallback.
    }
    return () => {
      if (timer) clearTimeout(timer);
      es?.close();
    };
  }, [active]);

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
    const ok = await deleteLibraryAsset(id);
    if (!ok) return false;
    setAssets((prev) => prev.filter((a) => a.id !== id));
    return true;
  }, []);

  // Removing one asset had no confirmation at all: a single click on a small
  // button inside a hover-revealed row, and the bytes were gone. It now names
  // the asset and routes through the same two-key-plus-slider gate the rest of
  // the product uses for anything it cannot put back.
  const requestDeleteAsset = useCallback(
    (id: string) => {
      const asset = assets.find((a) => a.id === id);
      if (!asset) return;
      setDeleteGate({
        action: 'Delete asset',
        // The asset's own title, so the user can check the gate against the
        // card they meant to act on rather than against a generic noun.
        target: assetTitle(asset),
        items: describeAssetItems([asset]),
        detail: describeDeleteDetail([asset]),
        onConfirm: () => onDelete(id),
      });
    },
    [assets, onDelete],
  );

  // "Edit as page": turn a captured html asset into a fresh editable OD project
  // and open it on its index.html. The daemon owns the project creation; here we
  // just gate a spinner and navigate on success.
  const handleEditAsPage = useCallback(
    async (assetId: string) => {
      setEditingId(assetId);
      try {
        const result = await editLibraryAssetAsPage(assetId);
        if (result) {
          setPreviewId(null);
          onOpenProject(result.projectId, result.relPath);
        }
      } finally {
        setEditingId(null);
      }
    },
    [onOpenProject],
  );

  const deleteSelected = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return false;
    const results = await Promise.all(ids.map((id) => deleteLibraryAsset(id)));
    const deleted = new Set(ids.filter((_, i) => results[i]));
    // Nothing landed — reported as a failure so the gate says so rather than
    // closing over a selection that is still entirely there.
    if (!deleted.size) return false;
    setAssets((prev) => prev.filter((a) => !deleted.has(a.id)));
    setSelectedIds(new Set());
    setPreviewId((cur) => (cur && deleted.has(cur) ? null : cur));
    return true;
  }, [selectedIds]);

  // Bulk delete is destructive and very easy to trigger — a button in the
  // selection bar, or Delete/Backspace with a box-selection still live. The
  // dialog it used to raise was answered by one click on an autofocused
  // button, which a stray Enter supplies; the gate cannot be answered by one
  // reflex, and it lists what is in the selection rather than only counting it.
  const requestDeleteSelected = useCallback(() => {
    const chosen = assets.filter((a) => selectedIds.has(a.id));
    if (!chosen.length) return;
    setDeleteGate({
      action: `Delete ${chosen.length} ${chosen.length === 1 ? 'asset' : 'assets'}`,
      target: `${chosen.length} selected ${chosen.length === 1 ? 'asset' : 'assets'}`,
      items: describeAssetItems(chosen),
      detail: describeDeleteDetail(chosen),
      onConfirm: () => deleteSelected(),
    });
  }, [assets, selectedIds, deleteSelected]);

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

  // Dismiss the menu on outside click / Escape. Deliberately NOT a full-screen
  // backdrop element: a stray bare overlay can paint opaque (e.g. UA button
  // styling) and blank the whole page behind it.
  useEffect(() => {
    if (!dsMenuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!dsMenuWrapRef.current?.contains(e.target as Node)) setDsMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDsMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [dsMenuOpen]);

  // Path A: open the create-design-system flow pre-seeded with the selected
  // assets as source material (fetched into File objects via a hand-off store).
  const createDesignSystemFromSelection = useCallback(async () => {
    const chosen = assets.filter((a) => selectedIds.has(a.id));
    if (!chosen.length) return;
    setDsBusy(true);
    try {
      const files = (await Promise.all(chosen.map((a) => fetchLibraryAssetAsFile(a)))).filter(
        (f): f is File => f !== null,
      );
      setDesignSystemAssetSeed({ files });
      setDsMenuOpen(false);
      setSelectedIds(new Set());
      setPendingDesignSystemCreateEntry('library');
      navigate({ kind: 'design-system-create' });
    } finally {
      setDsBusy(false);
    }
  }, [assets, selectedIds]);

  // "Chat to design": fetch the selected assets into File objects, hand them to
  // the Home chat composer, and navigate there. The user lands in the creation
  // composer with the assets staged, describes what to build, and Runs to spawn
  // a new project — the assets ride the normal upload-on-Run path. Mirrors the
  // create-design-system File hand-off above, but the destination is Home.
  const chatToDesignFromSelection = useCallback(async () => {
    const chosen = assets.filter((a) => selectedIds.has(a.id));
    if (!chosen.length) return;
    setDsBusy(true);
    try {
      const files = (await Promise.all(chosen.map((a) => fetchLibraryAssetAsFile(a)))).filter(
        (f): f is File => f !== null,
      );
      if (!files.length) return;
      setHomeComposerAssetSeed({ files });
      setSelectedIds(new Set());
      navigate({ kind: 'home', view: 'home' });
    } finally {
      setDsBusy(false);
    }
  }, [assets, selectedIds]);

  // Path B: copy the selected assets into an existing design system's project,
  // stage a composer seed (query + the copied assets as attachments), and open
  // that project so the user can review and Send to refine the system.
  const optimizeExistingDesignSystem = useCallback(
    async (ds: DesignSystemSummary) => {
      const chosen = assets.filter((a) => selectedIds.has(a.id));
      if (!chosen.length) return;
      setDsBusy(true);
      try {
        const mutationWorkspaceContext = workspaceContext;
        let projectId = ds.projectId;
        if (!projectId) {
          const detail = await fetchDesignSystem(ds.id, mutationWorkspaceContext);
          projectId = detail?.projectId;
        }
        if (!projectId) {
          setDsMenuOpen(false);
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
        const text =
          `Use ${n} reference${n > 1 ? 's' : ''} I just added from my Library to refine this design ` +
          `system — pull the palette, typography, and component patterns that fit and update the design tokens.`;
        setComposerSeed({ projectId, text, attachments });
        setDsMenuOpen(false);
        setSelectedIds(new Set());
        onOpenProject(projectId);
      } finally {
        setDsBusy(false);
      }
    },
    [assets, onOpenProject, selectedIds, workspaceIdentity],
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
          const a = assets[i];
          if (a) next.add(a.id);
        }
        return next;
      });
    },
    [assets],
  );

  const selectAll = useCallback(() => setSelectedIds(new Set(assets.map((a) => a.id))), [assets]);
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

  const previewIndex = previewId ? assets.findIndex((a) => a.id === previewId) : -1;
  const previewAsset = previewIndex >= 0 ? assets[previewIndex] : null;
  const selectedCount = selectedIds.size;

  // Day-bucketed groups for the timeline view (newest day first). Items keep
  // their flat index in `assets` so range/box selection stays consistent across
  // both views. Grouping by a Map collapses non-contiguous same-day assets.
  const timelineGroups = useMemo(() => {
    const map = new Map<string, Array<{ asset: LibraryAsset; index: number }>>();
    assets.forEach((asset, index) => {
      const key = dayKeyOf(asset);
      const bucket = map.get(key);
      if (bucket) bucket.push({ asset, index });
      else map.set(key, [{ asset, index }]);
    });
    return [...map.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
      .map(([key, items]) => ({ key, items }));
  }, [assets]);

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
          <input
            className={styles.search}
            type="search"
            placeholder={t('library.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select aria-label={t('library.filterByKind')} className={styles.select} value={kind} onChange={(e) => setKind(e.target.value)}>
          {kindFilterOptions.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <select aria-label={t('library.filterBySource')} className={styles.select} value={source} onChange={(e) => setSource(e.target.value)}>
          {sourceFilterOptions.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
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

      {selectedCount > 0 && !dragging ? (
        <div className={styles.selectionBar}>
          <span className={styles.selectionCount}>
            {t('library.selectedCount', { count: selectedCount })}
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
              type="button"
              className={styles.dsMenuBtn}
              onClick={() => setDsMenuOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={dsMenuOpen}
              disabled={dsBusy}
            >
              {dsBusy ? t('library.working') : t('library.useInDesignSystem')}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            {dsMenuOpen ? (
              <div className={styles.dsMenu} role="menu">
                <button
                  type="button"
                  className={styles.dsMenuItem}
                  role="menuitem"
                  onClick={() => void createDesignSystemFromSelection()}
                >
                  <span className={styles.dsMenuItemTitle}>{t('library.createDesignSystem')}</span>
                  <span className={styles.dsMenuItemSub}>
                    {t('library.createDesignSystemSub', { count: selectedCount })}
                  </span>
                </button>
                <div className={styles.dsMenuDivider} />
                <div className={styles.dsMenuHeader}>{t('library.refineExisting')}</div>
                {dsList.length === 0 ? (
                  <div className={styles.dsMenuEmpty}>{t('library.noEditableDesignSystems')}</div>
                ) : (
                  dsList.map((ds) => (
                    <button
                      key={ds.id}
                      type="button"
                      className={styles.dsMenuItem}
                      role="menuitem"
                      onClick={() => void optimizeExistingDesignSystem(ds)}
                    >
                      <span className={styles.dsMenuItemTitle}>{ds.title}</span>
                      <span className={styles.dsMenuItemSub}>{t('library.addAssetsAndRefine')}</span>
                    </button>
                  ))
                )}
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
          {assets.map((asset, index) => renderCard(asset, index))}
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
      {confirmDeleteOpen ? (
        <Dialog
          className="modal-confirm"
          role="alertdialog"
          onClose={() => setConfirmDeleteOpen(false)}
          closeOnEscape
          ariaLabelledBy={confirmDeleteTitleId}
        >
          <DialogTitle id={confirmDeleteTitleId}>
            {selectedCount === 1
              ? t('library.confirmDeleteTitleOne', { count: selectedCount })
              : t('library.confirmDeleteTitleMany', { count: selectedCount })}
          </DialogTitle>
          <DialogDescription className="modal-confirm-message">
            {selectedCount === 1
              ? t('library.confirmDeleteBodyOne')
              : t('library.confirmDeleteBodyMany')}
          </DialogDescription>
          <DialogFooter className="row">
            <button type="button" onClick={() => setConfirmDeleteOpen(false)}>
              {t('library.cancel')}
            </button>
            <button type="button" className="primary danger" autoFocus onClick={confirmDeleteSelected}>
              {t('library.deleteCount', { count: selectedCount })}
            </button>
          </DialogFooter>
        </Dialog>
      ) : null}

      {previewAsset ? (
        <LibraryPreviewModal
          asset={previewAsset}
          hasPrev={previewIndex > 0}
          hasNext={previewIndex >= 0 && previewIndex < assets.length - 1}
          onPrev={() => {
            const prev = assets[previewIndex - 1];
            if (prev) setPreviewId(prev.id);
          }}
          onNext={() => {
            const next = assets[previewIndex + 1];
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

// Reusable "Select from library" modal.
//
// Surfaces the OD Library (资源库) as a multi-select grid so a user can pull
// existing assets into the chat composer (as context attachments) or into a
// project's Design Files. The caller owns what "confirm" means via `onConfirm`
// — both entry points materialize the picks through the same
// `applyLibraryAsset` registry helper (POST /api/library/assets/:id/apply),
// which copies the bytes into the project AND records a provenance back-link so
// the registry knows the asset was consumed.

import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { LibraryAsset } from '@open-design/contracts';
import { Button, Dialog } from '@open-design/components';
import { useT } from '../i18n';
import { fetchAllLibraryAssets, libraryAssetRawUrl, type LibraryAssetFetchError } from '../providers/registry';
import {
  KindIcon,
  assetTitle,
  badgeKind,
  colorOf,
  kindLabel,
  kindTint,
  matchesKindFilter,
} from './LibraryAssetMeta';
import type { BadgeKind } from './LibraryAssetMeta';
import { Icon } from './Icon';
import { useInView } from './plugins-home/useInView';
import { useRegexSearch } from './regex/useRegexSearch';
import { RegexSearchField } from './regex/RegexSearchField';
import styles from './LibraryPicker.module.css';
import { RegexSearchField, useRegexSearch } from './regex';

// Mirrors the Library grid's chips. `element` is a badge-only identity (an image
// clip carrying `metadata.element`), so it has no storage kind of its own; the
// filter keys off `badgeKind` via `matchesKindFilter`.
const KIND_FILTERS: BadgeKind[] = [
  'image',
  'element',
  'design-system',
  'video',
  'html',
  'font',
  'color',
  'text',
  'url',
];

function localizedKindLabel(kind: BadgeKind, t: ReturnType<typeof useT>): string {
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

function libraryAssetSearchText(asset: LibraryAsset): string {
  return `${assetTitle(asset)} ${asset.tags?.join(' ') ?? ''} ${asset.caption ?? ''} ${asset.sourceDomain ?? ''} ${asset.ocrText ?? ''}`;
}

interface Props {
  onClose: () => void;
  /**
   * Invoked with the chosen assets when the user confirms. May be async — the
   * picker keeps a busy state until it resolves. A complete result closes the
   * picker; a partial/failed result remains open with failed ids selected.
   */
  onConfirm: (assets: LibraryAsset[]) => LibraryPickerConfirmResult | void | Promise<LibraryPickerConfirmResult | void>;
  /** Heading override; defaults to the shared "Select from library" copy. */
  title?: string;
  /** Confirm-button label override; defaults to "Add". */
  confirmLabel?: string;
}

export interface LibraryPickerFailure {
  assetId: string;
  reason?: string;
}

export interface LibraryPickerConfirmResult {
  applied: string[];
  failed: LibraryPickerFailure[];
  skipped: LibraryPickerFailure[];
}

export function LibraryPicker({ onClose, onConfirm, title, confirmLabel }: Props) {
  const t = useT();
  const titleId = useId();
  const [assets, setAssets] = useState<LibraryAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<LibraryAssetFetchError | null>(null);
  const [kind, setKind] = useState<BadgeKind | ''>('');
  const [search, setSearch] = useState('');
  const searchRegex = useRegexSearch(search, setSearch);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const aliveRef = useRef(true);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const loadGenerationRef = useRef(0);
  const loadAbortRef = useRef<AbortController | null>(null);
  const loadedOnceRef = useRef(false);
  const focusScopeId = `${titleId}-focus-scope`;

  const load = useCallback(async () => {
    const generation = loadGenerationRef.current + 1;
    loadGenerationRef.current = generation;
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;
    setLoading(true);
    setLoadError(null);
    try {
      const result = await fetchAllLibraryAssets({}, { signal: controller.signal });
      if (generation !== loadGenerationRef.current) return;
      if (!result.ok) {
        if (result.error.kind === 'aborted') return;
        setLoadError(result.error);
        return;
      }
      loadedOnceRef.current = true;
      setAssets(result.assets);
    } finally {
      if (generation === loadGenerationRef.current) {
        loadAbortRef.current = null;
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => () => {
    aliveRef.current = false;
    loadGenerationRef.current += 1;
    loadAbortRef.current?.abort();
    loadAbortRef.current = null;
  }, []);

  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape' && !busy) onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  useEffect(() => {
    void load();
    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/library/events');
      const refresh = () => void load();
      es.addEventListener('ingest', refresh);
      es.addEventListener('delete', refresh);
      es.addEventListener('reconcile', refresh);
    } catch {
      // The retry action remains available when EventSource is unavailable.
    }
    return () => {
      es?.close();
    };
  }, [load]);

  useEffect(() => {
    const frame = window.setTimeout(() => searchInputRef.current?.focus(), 0);
    return () => window.clearTimeout(frame);
  }, []);

  const visible = useMemo(() => {
    return assets.filter((asset) => {
      if (!matchesKindFilter(asset, kind)) return false;
      return searchRegex.matches(libraryAssetSearchText(asset));
    });
  }, [assets, kind, searchRegex.matches]);

  const visibleSelectedCount = visible.filter((asset) => selected.has(asset.id)).length;
  const [confirmResult, setConfirmResult] = useState<LibraryPickerConfirmResult | null>(null);

  useEffect(() => {
    if (busyRef.current) return;
    const visibleIds = new Set(visible.map((asset) => asset.id));
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => visibleIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [visible, busy]);

  // Stable so the memoized PickerCard's shallow-prop compare holds: a selection
  // toggle then only re-renders the one card whose `selected` flipped, not every
  // visible card.
  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  async function confirm() {
    const visibleIds = new Set(visible.map((asset) => asset.id));
    const picked = assets.filter((asset) => visibleIds.has(asset.id) && selected.has(asset.id));
    if (picked.length === 0 || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    const reviewedIds = new Set(picked.map((asset) => asset.id));
    try {
      const result = await onConfirm(picked);
      const normalizedBase: LibraryPickerConfirmResult = result ?? {
        applied: picked.map((asset) => asset.id),
        failed: [],
        skipped: [],
      };
      const accounted = new Set([
        ...normalizedBase.applied,
        ...normalizedBase.failed.map((item) => item.assetId),
        ...normalizedBase.skipped.map((item) => item.assetId),
      ]);
      const normalized: LibraryPickerConfirmResult = accounted.size === reviewedIds.size
        ? normalizedBase
        : {
          ...normalizedBase,
          skipped: [
            ...normalizedBase.skipped,
            ...picked
              .filter((asset) => !accounted.has(asset.id))
              .map((asset) => ({ assetId: asset.id, reason: 'not-reported' })),
          ],
        };
      const failedIds = new Set([
        ...normalized.failed.map((item) => item.assetId),
        ...normalized.skipped.map((item) => item.assetId),
      ]);
      setConfirmResult(normalized);
      setSelected((current) => new Set([...current].filter((id) => failedIds.has(id))));
      if (failedIds.size > 0 || normalized.applied.length < reviewedIds.size) return;
      onClose();
    } finally {
      busyRef.current = false;
      if (aliveRef.current) {
        setBusy(false);
      }
    }
  }

  const count = visibleSelectedCount;
  const searchActive = search.trim().length > 0 || kind !== '';
  const resultFailedCount = (confirmResult?.failed.length ?? 0) + (confirmResult?.skipped.length ?? 0);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <Dialog
      className={styles.panel}
      backdropClassName="modal-backdrop"
      includeChromeClassName={false}
      role="dialog"
      ariaLabelledBy={titleId}
      focusScopeId={focusScopeId}
      closeOnBackdrop={!busy}
      closeOnEscape={!busy}
      onClose={() => {
        if (!busy) onClose();
      }}
      data-testid="library-picker"
    >
        <header className={styles.header}>
          <div className={styles.heading}>
            <Icon name="layers-filled" size={16} />
            <h2 id={titleId}>{title ?? t('libraryPicker.title')}</h2>
          </div>
          <button
            type="button"
            className={styles.close}
            onClick={() => {
              if (!busy) onClose();
            }}
            disabled={busy}
            aria-label={t('common.cancel')}
          >
            <Icon name="close" size={20} />
          </button>
        </header>

        <div className={styles.toolbar}>
          <RegexSearchField
            search={searchRegex}
            fieldLabel={t('libraryPicker.title')}
            hostClassName={styles.searchFieldHost}
            placeholder={t('libraryPicker.searchPlaceholder')}
            ariaLabel={t('libraryPicker.searchPlaceholder')}
            inputRef={searchInputRef}
            focusScopeId={focusScopeId}
            autoFocus
            disabled={busy}
            testId="library-picker-search"
          />
          <div className={styles.kinds} role="group" aria-label={t('libraryPicker.kindFilter')}>
            <button
              type="button"
              aria-pressed={kind === ''}
              className={`${styles.chip}${kind === '' ? ` ${styles.chipActive}` : ''}`}
              onClick={() => setKind('')}
              disabled={busy}
            >
              {t('libraryPicker.allKinds')}
            </button>
            {KIND_FILTERS.map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                className={`${styles.chip}${kind === k ? ` ${styles.chipActive}` : ''}`}
                onClick={() => setKind((prev) => (prev === k ? '' : k))}
                disabled={busy}
              >
                {localizedKindLabel(k, t)}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.body} aria-busy={loading || busy} aria-disabled={busy}>
          {loadError && loadedOnceRef.current ? (
            <div className={styles.inlineError} role="alert" data-testid="library-picker-refresh-error">
              <span>{t('library.loadError')}</span>
              <Button onClick={() => void load()} disabled={busy}>{t('library.retry')}</Button>
            </div>
          ) : null}
          {loadError && !loadedOnceRef.current ? (
            <div className={styles.placeholder} role="alert" data-testid="library-picker-load-error">
              <p>{t('library.loadError')}</p>
              <Button onClick={() => void load()}>{t('library.retry')}</Button>
            </div>
          ) : loading && assets.length === 0 ? (
            <div className={styles.placeholder} role="status" aria-live="polite">{t('libraryPicker.loading')}</div>
          ) : visible.length === 0 ? (
            <div className={styles.placeholder}>{searchActive ? t('library.noMatches') : t('libraryPicker.empty')}</div>
          ) : (
            <ul className={styles.grid}>
              {visible.map((asset) => (
                <PickerCard
                  key={asset.id}
                  asset={asset}
                  selected={selected.has(asset.id)}
                  onToggle={toggle}
                  disabled={busy}
                />
              ))}
            </ul>
          )}
          <span className={styles.liveCount} role="status" aria-live="polite" aria-atomic="true">
            {searchActive && visible.length === 0
              ? t('library.noMatches')
              : t('library.scopeVisible', { count: visible.length })}
            {` · ${t('library.selectedCount', { count: visibleSelectedCount })}`}
            {` · ${t('library.uploadSummary', { added: assets.length, failed: resultFailedCount })}`}
          </span>
          {confirmResult && resultFailedCount > 0 ? (
            <div className={styles.inlineError} role="alert" data-testid="library-picker-confirm-result">
              <div>
                <div>{t('library.uploadSummary', { added: confirmResult.applied.length, failed: resultFailedCount })}</div>
                <ul className={styles.resultItems}>
                  {[...confirmResult.failed, ...confirmResult.skipped].map((item) => (
                    <li key={item.assetId}>{assetTitle(assets.find((asset) => asset.id === item.assetId) ?? ({ id: item.assetId } as LibraryAsset))}</li>
                  ))}
                </ul>
              </div>
              <Button onClick={() => void confirm()} disabled={busy || count === 0}>{t('library.retry')}</Button>
            </div>
          ) : null}
        </div>

        <footer className={styles.footer}>
          <Button onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={confirm}
            disabled={count === 0 || busy}
            data-testid="library-picker-confirm"
          >
            {busy ? t('libraryPicker.loading') : confirmLabel ?? t('libraryPicker.add')}
            {count > 0 && !busy ? ` (${count})` : ''}
          </Button>
        </footer>
    </Dialog>,
    document.body,
  );
}

interface PickerCardProps {
  asset: LibraryAsset;
  selected: boolean;
  onToggle: (id: string) => void;
  disabled: boolean;
}

// One picker grid cell. Memoized so toggling one asset's selection re-renders
// only that card, not every visible card — the whole-grid re-render was the
// picker's biggest cost on a large Library. `onToggle` is a stable useCallback,
// so the shallow-prop compare holds until this card's `selected` flips.
const PickerCard = memo(function PickerCard({ asset, selected, onToggle, disabled }: PickerCardProps) {
  return (
    <li>
      <button
        type="button"
        className={`${styles.card}${selected ? ` ${styles.cardSelected}` : ''}`}
        onClick={() => onToggle(asset.id)}
        disabled={disabled}
        aria-pressed={selected}
        title={assetTitle(asset)}
      >
        <span className={styles.thumb}>
          <AssetThumb asset={asset} />
          <span
            className={styles.kindBadge}
            style={{ ['--kind-tint' as string]: kindTint(badgeKind(asset)) }}
          >
            <KindIcon kind={badgeKind(asset)} size={11} />
            {kindLabel(badgeKind(asset))}
          </span>
          {selected ? (
            <span className={styles.check} aria-hidden>
              <Icon name="check" size={14} />
            </span>
          ) : null}
        </span>
        <span className={styles.label}>{assetTitle(asset)}</span>
      </button>
    </li>
  );
});

// Kinds whose thumbnail pulls full bytes over the network (a grid cell loads
// the original image/video). They mount lazily so opening the picker doesn't
// fire one full-bytes request per asset; a kind glyph holds the box until the
// card scrolls in. `once: true` keeps it mounted after first reveal.
const PICKER_LAZY_KINDS = new Set<string>(['image', 'video']);

function AssetThumb({ asset }: { asset: LibraryAsset }) {
  const lazy = PICKER_LAZY_KINDS.has(asset.kind);
  const { ref, inView } = useInView<HTMLSpanElement>({ once: true, rootMargin: '240px' });
  // Shimmer-until-loaded skeleton, mirroring the clipper's "Select images to
  // save" picker (clipper/content.js → `.thumb.shim`): the media fades in over
  // the skeleton on `load`. A cached image that finished before React attached
  // `onLoad` is caught via the `complete` probe once the card mounts in view.
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth > 0) setLoaded(true);
  }, [inView]);

  if (lazy) {
    const flag = loaded ? 'true' : 'false';
    return (
      <span ref={ref} className={styles.thumbLazy}>
        {!inView ? (
          <span className={styles.glyph} aria-hidden>
            <KindIcon kind={badgeKind(asset)} size={26} />
          </span>
        ) : (
          <>
            {loaded ? null : <span className={styles.thumbSkeleton} aria-hidden />}
            {asset.kind === 'image' ? (
              <img
                ref={imgRef}
                src={libraryAssetRawUrl(asset.id)}
                alt=""
                loading="lazy"
                decoding="async"
                className={styles.thumbImg}
                data-loaded={flag}
                onLoad={() => setLoaded(true)}
                onError={() => setLoaded(true)}
              />
            ) : (
              <video
                src={libraryAssetRawUrl(asset.id)}
                muted
                playsInline
                preload="metadata"
                className={styles.thumbImg}
                data-loaded={flag}
                onLoadedData={() => setLoaded(true)}
                onError={() => setLoaded(true)}
              />
            )}
          </>
        )}
      </span>
    );
  }
  if (asset.kind === 'color') {
    const color = colorOf(asset);
    if (color) {
      return <span className={styles.swatch} style={{ background: color }} aria-hidden />;
    }
  }
  return (
    <span className={styles.glyph} aria-hidden>
      <KindIcon kind={asset.kind} size={26} />
    </span>
  );
}

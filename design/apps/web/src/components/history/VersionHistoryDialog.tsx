// The version-history panel: browse, filter, diff, label, restore, prune.
//
// Three things shape this surface, all of them consequences of the store it is
// a window onto:
//
//   * History is append-only, so **restore is not a rewind**. Restoring writes
//     the historical bytes back and records that as a NEW revision on top of
//     the tip — which is why the restore control is an ordinary button and not
//     a destructive gate: nothing is lost by pressing it, and the revision it
//     replaced is still there to restore in turn. The panel says so in words,
//     because a history panel nobody trusts is a history panel nobody opens.
//   * The daemon refuses to hand back the stored bytes of a credential-adjacent
//     domain. That is not a bug to work around: the panel shows the size and
//     the SHA-256 instead, so a revision stays verifiable without history
//     becoming a side channel that reads out a secret the normal API would
//     refuse.
//   * A filter that is quietly excluding rows is how a user comes to believe
//     their data is missing. The filter row collapses, but it says how many
//     revisions it is hiding whenever anything is active, and the action facets
//     carry their counts so an empty one is visibly absent rather than
//     mysteriously unclickable.
//
// The arithmetic — action derivation, counts, composition of the four filters,
// export rendering — lives in `lib/history/`, where it is tested without a
// daemon. This file is the surface: layout, keyboard, fetching and copy.

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';

import {
  Button,
  Dialog,
  DialogBody,
  DialogHeader,
  Input,
  VisuallyHidden,
} from '@open-design/components';
import type {
  HistoryChange,
  HistoryDomainInfo,
  HistoryEntryContent,
  HistoryRetentionPolicy,
  HistoryRevision,
  HistoryRevisionSummary,
} from '@open-design/contracts';

import { Icon } from '../Icon';
import { BulkActionBar } from '../bulk/BulkActionBar';
import {
  describeSelection,
  emptySelection,
  extendTo,
  invertWithin,
  pruneSelection,
  selectAllOf,
  selectOnly,
  toggleOne,
  type SelectionState,
} from '../bulk/selection';
import { useI18n } from '../../i18n';
import type { Dict } from '../../i18n/types';
import { RegexSearchField } from '../regex/RegexSearchField';
import { useRegexSearch } from '../regex/useRegexSearch';
import { ChangelogDateRange } from '../changelog/ChangelogDateRange';
import {
  EMPTY_HISTORY_FILTER,
  filterHistory,
  historyFilterIsActive,
  type HistoryActionId,
  type HistoryFilter,
} from '../../lib/history/actions';
import {
  HISTORY_PAGE_SIZE,
  fetchHistoryPage,
  fetchHistoryRevision,
  pruneHistory,
  restoreHistoryRevision,
  setHistoryRetention,
} from '../../lib/history/client';
import {
  HISTORY_EXPORT_EXTENSIONS,
  HISTORY_EXPORT_MEDIA_TYPES,
  renderHistoryExport,
  type HistoryExportFormat,
  type HistoryExportLabels,
} from '../../lib/history/export';
import { HISTORY_OPEN_EVENT, type OpenVersionHistoryDetail } from './open-history';
import styles from './VersionHistoryDialog.module.css';

const STATUS_CLEAR_MS = 6000;

/** Facet id → its label key. Exhaustive by construction, so a new action id is
 *  a typecheck error here rather than a blank chip on screen. */
const ACTION_LABEL_KEYS: Readonly<Record<HistoryActionId, keyof Dict>> = {
  initial: 'history.actionInitial',
  created: 'history.actionCreated',
  updated: 'history.actionUpdated',
  deleted: 'history.actionDeleted',
  restored: 'history.actionRestored',
  undone: 'history.actionUndone',
  pruned: 'history.actionPruned',
  settings: 'history.actionSettings',
  recorded: 'history.actionRecorded',
};

const KIND_LABEL_KEYS: Readonly<Record<HistoryRevisionSummary['kind'], keyof Dict>> = {
  initial: 'history.actionInitial',
  mutation: 'history.kindMutation',
  restore: 'history.actionRestored',
  prune: 'history.actionPruned',
};

const CHANGE_STATUS_KEYS: Readonly<Record<HistoryChange['status'], keyof Dict>> = {
  added: 'history.actionCreated',
  modified: 'history.actionUpdated',
  deleted: 'history.actionDeleted',
};

function downloadFile(name: string, body: string, mediaType: string): void {
  const url = URL.createObjectURL(new Blob([body], { type: `${mediaType};charset=utf-8` }));
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** `null` means "no limit", which is a different thing from `0`. */
function parseLimit(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

interface LoadState {
  readonly available: boolean;
  readonly unavailableReason: string | null;
  readonly domains: readonly HistoryDomainInfo[];
  readonly revisions: readonly HistoryRevisionSummary[];
  readonly total: number;
  readonly retention: HistoryRetentionPolicy;
}

const EMPTY_LOAD: LoadState = {
  available: true,
  unavailableReason: null,
  domains: [],
  revisions: [],
  total: 0,
  retention: { maxRevisions: null, maxAgeDays: null },
};

export function VersionHistoryDialog() {
  const { locale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const [load, setLoad] = useState<LoadState>(EMPTY_LOAD);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<HistoryFilter>(EMPTY_HISTORY_FILTER);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selection, setSelection] = useState<SelectionState>(emptySelection);
  const [status, setStatus] = useState<string | null>(null);

  const titleId = useId();
  const searchRef = useRef<HTMLInputElement | null>(null);
  const statusTimer = useRef<number | null>(null);

  const flashStatus = useCallback((message: string) => {
    setStatus(message);
    if (statusTimer.current != null) window.clearTimeout(statusTimer.current);
    statusTimer.current = window.setTimeout(() => setStatus(null), STATUS_CLEAR_MS);
  }, []);

  useEffect(() => () => {
    if (statusTimer.current != null) window.clearTimeout(statusTimer.current);
  }, []);

  /**
   * Load a page. `offset > 0` appends, so "load more" grows the set the facet
   * counts describe rather than replacing it under the user.
   */
  const loadPage = useCallback(async (offset: number) => {
    setLoading(true);
    const result = await fetchHistoryPage(offset);
    setLoading(false);
    if (!result.ok) {
      // A history read that fails never takes the panel down with it: the list
      // that was already there stays, and the failure is stated above it.
      setLoadError(result.error);
      return;
    }
    setLoadError(null);
    setLoad((current) => ({
      available: result.value.available,
      unavailableReason: result.value.unavailableReason,
      domains: result.value.domains,
      revisions:
        offset === 0
          ? result.value.revisions
          : [...current.revisions, ...result.value.revisions],
      total: result.value.total,
      retention: result.value.retention,
    }));
  }, []);

  useEffect(() => {
    function onOpen(event: Event) {
      const detail = (event as CustomEvent<OpenVersionHistoryDetail>).detail ?? {};
      setOpen(true);
      if (detail.revisionId != null) setSelectedId(detail.revisionId);
      const domainId = detail.domainId;
      if (domainId != null) {
        setFilter((current) => ({ ...current, domainIds: [domainId] }));
        setFiltersOpen(true);
      }
    }
    window.addEventListener(HISTORY_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(HISTORY_OPEN_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadPage(0);
  }, [loadPage, open]);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  // This panel's own regex controller, bound to this field's query. Never
  // shared with any other search bar in the application.
  const searchRegex = useRegexSearch(filter.query, (next) =>
    setFilter((current) => ({ ...current, query: next })),
  );
  const regexMatches = searchRegex.mode === 'regex' ? searchRegex.matches : null;

  const result = useMemo(
    () => filterHistory(load.revisions, filter, regexMatches),
    [filter, load.revisions, regexMatches],
  );
  const visibleRevisionIds = result.revisions.map((revision) => revision.id);
  const visibleRevisionKey = visibleRevisionIds.join('\u0000');
  useEffect(() => {
    setSelection((current) => pruneSelection(current, visibleRevisionIds));
  }, [visibleRevisionKey]);
  const selectionSummary = describeSelection(
    selection,
    visibleRevisionIds,
    visibleRevisionIds,
  );

  const filterActive = historyFilterIsActive(filter);
  const hidden = result.total - result.matched;

  const scopeSentence = useMemo(() => {
    const base =
      result.matched === result.total
        ? t('history.scopeAll', { matched: result.matched })
        : t('history.scopeFiltered', { matched: result.matched, total: result.total });
    if (load.total > load.revisions.length) {
      return `${base} · ${t('history.loadedOf', {
        loaded: load.revisions.length,
        total: load.total,
      })}`;
    }
    return base;
  }, [load.revisions.length, load.total, result.matched, result.total, t]);

  const exportLabels = useMemo<HistoryExportLabels>(
    () => ({
      heading: t('history.title'),
      scope: scopeSentence,
      kindLabel: (kind) => t(KIND_LABEL_KEYS[kind]),
      restoredFrom: (id) => t('history.restoredFrom', { id }),
      changeCount: (count) => t('history.changeCount', { count }),
      empty: t('history.noMatch'),
    }),
    [scopeSentence, t],
  );

  const handleExport = useCallback(
    (format: HistoryExportFormat, revisions = result.revisions) => {
      const name = `version-history-${new Date().toISOString().slice(0, 10)}.${
        HISTORY_EXPORT_EXTENSIONS[format]
      }`;
      downloadFile(
        name,
        renderHistoryExport(format, revisions, exportLabels),
        HISTORY_EXPORT_MEDIA_TYPES[format],
      );
      flashStatus(t('history.exported', { filename: name }));
    },
    [exportLabels, flashStatus, result.revisions, t],
  );

  const selectRevision = useCallback((
    id: string,
    event: Pick<ReactMouseEvent, 'shiftKey' | 'ctrlKey' | 'metaKey'>,
  ) => {
    setSelection((current) => {
      if (event.shiftKey) return extendTo(current, id, visibleRevisionIds);
      if (event.ctrlKey || event.metaKey) return toggleOne(current, id);
      return selectOnly(id);
    });
  }, [visibleRevisionKey]);

  const selectedRevisions = useCallback(
    () => result.revisions.filter((revision) => selection.ids.has(revision.id)),
    [result.revisions, selection.ids],
  );

  const clearRevisionSelection = useCallback(() => {
    setSelection(emptySelection());
  }, []);

  const toggleAction = useCallback((action: HistoryActionId) => {
    setFilter((current) => ({
      ...current,
      actions: current.actions.includes(action)
        ? current.actions.filter((entry) => entry !== action)
        : [...current.actions, action],
    }));
  }, []);

  const toggleDomain = useCallback((domainId: string) => {
    setFilter((current) => ({
      ...current,
      domainIds: current.domainIds.includes(domainId)
        ? current.domainIds.filter((entry) => entry !== domainId)
        : [...current.domainIds, domainId],
    }));
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setStatus(null);
    setSelectedId(null);
    setSelection(emptySelection());
  }, []);

  if (!open) return null;

  // Looked up in the loaded set rather than the filtered one, so a surface that
  // opens history *at* a revision still shows it when the current filter would
  // have excluded it.
  const selected = load.revisions.find((revision) => revision.id === selectedId) ?? null;

  return (
    <Dialog
      ariaLabelledBy={titleId}
      className={styles.dialog}
      closeOnEscape
      layout="sectioned"
      onClose={close}
    >
      <DialogHeader className={styles.header}>
        <div className={styles.headerText}>
          <h2 className={styles.title} id={titleId}>
            {t('history.title')}
          </h2>
          <p className={styles.subtitle}>{t('history.subtitle')}</p>
        </div>
        <div className={styles.headerActions}>
          <Button
            aria-label={t('history.refresh')}
            size="icon"
            variant="ghost"
            onClick={() => void loadPage(0)}
          >
            <Icon name="refresh" size={14} />
          </Button>
          <Button aria-label={t('common.close')} size="icon" variant="ghost" onClick={close}>
            <Icon name="close" size={14} />
          </Button>
        </div>
      </DialogHeader>

      <div className={styles.controls}>
        <label className={styles.search}>
          <span className={styles.searchLabel}>{t('history.searchLabel')}</span>
          <RegexSearchField
            search={searchRegex}
            fieldLabel={t('history.title')}
            inputRef={searchRef}
            placeholder={t('history.searchPlaceholder')}
            ariaLabel={t('history.searchLabel')}
            testId="history-search"
          />
        </label>
        <Button
          aria-expanded={filtersOpen}
          className={styles.filterToggle}
          variant="ghost"
          onClick={() => setFiltersOpen((current) => !current)}
        >
          <Icon name={filtersOpen ? 'chevron-down' : 'chevron-right'} size={13} />
          <span>{t('history.filters')}</span>
        </Button>
      </div>

      {/* A collapsed filter row that is quietly excluding results is how a user
          comes to believe their data is missing, so it says so even when shut. */}
      {!filtersOpen && filterActive && hidden > 0 ? (
        <p className={styles.filterWarning} role="status">
          {t('history.filtersHiding', { count: hidden })}
        </p>
      ) : null}

      {filtersOpen ? (
        <div className={styles.filters}>
          <ChangelogDateRange
            bounds={result.bounds}
            value={{ from: filter.from, to: filter.to }}
            onChange={(next) => setFilter((current) => ({ ...current, ...next }))}
          />
          <div className={styles.facetGroup}>
            <span className={styles.facetLabel}>{t('history.actionsLabel')}</span>
            <div className={styles.facets}>
              {result.facets.length === 0 ? (
                <span className={styles.facetEmpty}>{t('common.none')}</span>
              ) : (
                result.facets.map((facet) => {
                  const active = filter.actions.includes(facet.id);
                  return (
                    <button
                      aria-pressed={active}
                      className={`${styles.facet}${active ? ` ${styles.facetActive}` : ''}`}
                      key={facet.id}
                      type="button"
                      onClick={() => toggleAction(facet.id)}
                    >
                      <span>{t(ACTION_LABEL_KEYS[facet.id])}</span>
                      <span className={styles.facetCount}>{facet.count}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
          <div className={styles.facetGroup}>
            <span className={styles.facetLabel}>{t('history.domainsLabel')}</span>
            <div className={styles.facets}>
              {load.domains.map((domain) => {
                const active = filter.domainIds.includes(domain.id);
                return (
                  <button
                    aria-pressed={active}
                    className={`${styles.facet}${active ? ` ${styles.facetActive}` : ''}`}
                    key={domain.id}
                    title={domain.note ?? undefined}
                    type="button"
                    onClick={() => toggleDomain(domain.id)}
                  >
                    <span>{domain.label}</span>
                    {/* `Icon` hard-codes `aria-hidden`, so the padlock is
                        decoration and the fact it stands for has to be said in
                        text a screen reader will actually reach. */}
                    {domain.sensitive ? (
                      <>
                        <Icon name="lock" size={11} />
                        <VisuallyHidden>{t('history.sensitive')}</VisuallyHidden>
                      </>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
          {filterActive ? (
            <Button
              className={styles.clearFilters}
              variant="ghost"
              onClick={() => setFilter(EMPTY_HISTORY_FILTER)}
            >
              {t('common.clear')}
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className={styles.scopeRow}>
        <p className={styles.scope} data-testid="history-scope">
          {scopeSentence}
        </p>
        <div className={styles.actions}>
          <Button variant="ghost" onClick={() => handleExport('markdown')}>
            <Icon name="download" size={13} />
            <span>{t('history.exportMarkdown')}</span>
          </Button>
          <Button variant="ghost" onClick={() => handleExport('text')}>
            <Icon name="download" size={13} />
            <span>{t('history.exportText')}</span>
          </Button>
          <Button variant="ghost" onClick={() => handleExport('json')}>
            <Icon name="download" size={13} />
            <span>{t('history.exportJson')}</span>
          </Button>
        </div>
      </div>

      {status != null ? (
        <p className={styles.status} role="status">
          {status}
        </p>
      ) : null}
      {loadError != null ? (
        <p className={styles.error} role="alert">
          {t('history.loadFailed', { error: loadError })}
        </p>
      ) : null}
      {!load.available ? (
        <p className={styles.error} role="alert">
          {t('history.unavailable', { reason: load.unavailableReason ?? '' })}
        </p>
      ) : null}

      {result.revisions.length > 0 ? (
        <BulkActionBar
          summary={selectionSummary}
          onSelectPage={() => setSelection(selectAllOf(visibleRevisionIds, 'page'))}
          onSelectEveryMatch={() => setSelection(selectAllOf(visibleRevisionIds, 'match'))}
          onInvert={() => setSelection(invertWithin(
            selection,
            visibleRevisionIds,
            selection.scope === 'match' ? 'match' : 'page',
          ))}
          onClear={clearRevisionSelection}
          testId="history-bulk"
          actions={[
            {
              id: 'export-markdown',
              icon: 'download',
              label: t('history.exportMarkdown'),
              onRun: () => handleExport('markdown', selectedRevisions()),
            },
            {
              id: 'export-text',
              icon: 'download',
              label: t('history.exportText'),
              onRun: () => handleExport('text', selectedRevisions()),
            },
            {
              id: 'export-json',
              icon: 'download',
              label: t('history.exportJson'),
              onRun: () => handleExport('json', selectedRevisions()),
            },
          ]}
        />
      ) : null}

      <DialogBody className={styles.body}>
        <div className={styles.list}>
          {result.revisions.length === 0 ? (
            <div className={styles.empty}>
              <p className={styles.emptyTitle}>
                {load.revisions.length === 0
                  ? loading
                    ? t('common.loading')
                    : t('history.empty')
                  : t('history.noMatch')}
              </p>
              {load.revisions.length === 0 && !loading ? (
                <p className={styles.emptyHint}>{t('history.emptyHint')}</p>
              ) : null}
            </div>
          ) : (
            <ul className={styles.revisions}>
              {result.revisions.map((revision) => (
                <li key={revision.id} className={styles.revisionRow}>
                  <input
                    type="checkbox"
                    className={styles.revisionSelect}
                    checked={selection.ids.has(revision.id)}
                    aria-label={revision.label}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => selectRevision(revision.id, event.nativeEvent as MouseEvent)}
                  />
                  <button
                    aria-current={revision.id === selectedId}
                    className={`${styles.revision}${
                      revision.id === selectedId ? ` ${styles.revisionActive}` : ''
                    }`}
                    type="button"
                    onClick={() =>
                      setSelectedId((current) => (current === revision.id ? null : revision.id))
                    }
                  >
                    <span className={styles.revisionKind}>{t(KIND_LABEL_KEYS[revision.kind])}</span>
                    <span className={styles.revisionLabel}>{revision.label}</span>
                    <span className={styles.revisionMeta}>
                      {new Date(revision.createdAt).toLocaleString(locale)}
                      {' · '}
                      {t('history.changeCount', { count: revision.changeCount })}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {load.total > load.revisions.length ? (
            <Button
              className={styles.loadMore}
              disabled={loading}
              variant="ghost"
              onClick={() => void loadPage(load.revisions.length)}
            >
              {t('history.loadMore', { count: Math.min(HISTORY_PAGE_SIZE, load.total - load.revisions.length) })}
            </Button>
          ) : null}
        </div>

        <div className={styles.detail}>
          {selected == null ? (
            <RetentionPanel
              retention={load.retention}
              onSaved={(next) => {
                setLoad((current) => ({ ...current, retention: next }));
                flashStatus(t('history.retentionSaved'));
              }}
              onPruned={() => {
                void loadPage(0);
              }}
              flashStatus={flashStatus}
            />
          ) : (
            <RevisionDetail
              key={selected.id}
              summary={selected}
              onRestored={(message) => {
                flashStatus(message);
                void loadPage(0);
              }}
            />
          )}
        </div>
      </DialogBody>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

function RevisionDetail({
  summary,
  onRestored,
}: {
  summary: HistoryRevisionSummary;
  onRestored: (message: string) => void;
}) {
  const { t } = useI18n();
  const [revision, setRevision] = useState<HistoryRevision | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [entry, setEntry] = useState<HistoryEntryContent | null>(null);
  const [entryPath, setEntryPath] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await fetchHistoryRevision(summary.id);
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      setRevision(result.value.revision);
    })();
    return () => {
      cancelled = true;
    };
  }, [summary.id]);

  const showEntry = useCallback(
    async (path: string) => {
      if (entryPath === path) {
        setEntryPath(null);
        setEntry(null);
        return;
      }
      setEntryPath(path);
      setEntry(null);
      const result = await fetchHistoryRevision(summary.id, path);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      setEntry(result.value.entry);
    },
    [entryPath, summary.id],
  );

  const restore = useCallback(async () => {
    setBusy(true);
    const trimmed = label.trim();
    const result = await restoreHistoryRevision(
      trimmed.length > 0 ? { revisionId: summary.id, label: trimmed } : { revisionId: summary.id },
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      onRestored(t('history.restoreFailed', { error: result.error }));
      return;
    }
    // An unchanged state records nothing, so saying "restored" would be a
    // claim the store did not make.
    onRestored(
      result.value.unchanged
        ? t('history.restoreUnchanged')
        : t('history.restoreDone', { count: result.value.changes.length }),
    );
  }, [label, onRestored, summary.id, t]);

  return (
    <section className={styles.detailInner}>
      <h3 className={styles.detailTitle}>{summary.label}</h3>
      <dl className={styles.detailMeta}>
        <div>
          <dt>{t('history.detailTitle')}</dt>
          <dd>
            <code>{summary.id}</code>
          </dd>
        </div>
        <div>
          <dt>{t('history.changesTitle')}</dt>
          <dd>{t('history.changeCount', { count: summary.changeCount })}</dd>
        </div>
        {summary.restoredFromId != null ? (
          <div>
            <dt>{t('history.actionRestored')}</dt>
            <dd>
              <code>{t('history.restoredFrom', { id: summary.restoredFromId })}</code>
            </dd>
          </div>
        ) : null}
      </dl>

      {summary.details.filter((line) => line !== summary.label).length > 0 ? (
        <ul className={styles.details}>
          {summary.details
            .filter((line) => line !== summary.label)
            .map((line) => (
              <li key={line}>{line}</li>
            ))}
        </ul>
      ) : null}

      {error != null ? (
        <p className={styles.error} role="alert">
          {t('history.loadFailed', { error })}
        </p>
      ) : null}

      {revision != null ? (
        <ul className={styles.changes}>
          {revision.changes.map((change) => (
            <li className={styles.change} key={`${change.status}:${change.path}`}>
              <span className={styles.changeStatus}>{t(CHANGE_STATUS_KEYS[change.status])}</span>
              <code className={styles.changePath}>{change.path}</code>
              {change.status === 'deleted' ? null : (
                <button
                  className={styles.changeView}
                  type="button"
                  onClick={() => void showEntry(change.path)}
                >
                  {entryPath === change.path ? t('history.hideEntry') : t('history.viewEntry')}
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {entry != null ? (
        <div className={styles.entry}>
          {/* Size and digest are what a sensitive entry has instead of its
              bytes, so they are shown for every entry rather than only the
              redacted ones — the same evidence in both cases. */}
          <p className={styles.entryMeta}>
            {entry.size}&nbsp;B · <code>{entry.digest.slice(0, 16)}</code>
          </p>
          {entry.redacted ? (
            <p className={styles.entryRedacted}>{t('history.entryRedacted')}</p>
          ) : (
            <pre className={styles.entryBody}>{entry.content ?? ''}</pre>
          )}
        </div>
      ) : null}

      <div className={styles.restore}>
        <p className={styles.appendOnly}>{t('history.appendOnly')}</p>
        <label className={styles.restoreLabel}>
          <span>{t('history.restoreLabel')}</span>
          <Input
            placeholder={t('history.restoreLabelPlaceholder')}
            value={label}
            onChange={(event) => setLabel(event.currentTarget.value)}
          />
        </label>
        <Button disabled={busy} onClick={() => void restore()}>
          <Icon name="undo" size={13} />
          <span>{t('history.restore')}</span>
        </Button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

function RetentionPanel({
  retention,
  onSaved,
  onPruned,
  flashStatus,
}: {
  retention: HistoryRetentionPolicy;
  onSaved: (next: HistoryRetentionPolicy) => void;
  onPruned: () => void;
  flashStatus: (message: string) => void;
}) {
  const { t } = useI18n();
  const [revisionsText, setRevisionsText] = useState(
    retention.maxRevisions == null ? '' : String(retention.maxRevisions),
  );
  const [daysText, setDaysText] = useState(
    retention.maxAgeDays == null ? '' : String(retention.maxAgeDays),
  );
  const [preview, setPreview] = useState<{ removed: number; kept: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const policy = useMemo<HistoryRetentionPolicy>(
    () => ({ maxRevisions: parseLimit(revisionsText), maxAgeDays: parseLimit(daysText) }),
    [daysText, revisionsText],
  );

  const save = useCallback(async () => {
    setBusy(true);
    const result = await setHistoryRetention(policy);
    setBusy(false);
    if (!result.ok) {
      flashStatus(result.error);
      return;
    }
    onSaved(result.value.retention);
  }, [flashStatus, onSaved, policy]);

  // Always the dry run first: the preview is what the user confirms against,
  // so nothing is removed before somebody has read what would go.
  const runPreview = useCallback(async () => {
    setBusy(true);
    const result = await pruneHistory({ policy, dryRun: true });
    setBusy(false);
    if (!result.ok) {
      flashStatus(result.error);
      return;
    }
    setPreview({ removed: result.value.removed.length, kept: result.value.keptCount });
  }, [flashStatus, policy]);

  const apply = useCallback(async () => {
    setBusy(true);
    const result = await pruneHistory({ policy, dryRun: false });
    setBusy(false);
    if (!result.ok) {
      flashStatus(result.error);
      return;
    }
    setPreview(null);
    flashStatus(t('history.pruneDone', { count: result.value.removed.length }));
    onPruned();
  }, [flashStatus, onPruned, policy, t]);

  return (
    <section className={styles.detailInner}>
      <h3 className={styles.detailTitle}>{t('history.retentionTitle')}</h3>
      <div className={styles.retentionFields}>
        <label className={styles.retentionField}>
          <span>{t('history.retentionRevisions')}</span>
          <Input
            inputMode="numeric"
            placeholder={t('history.retentionUnlimited')}
            value={revisionsText}
            onChange={(event) => setRevisionsText(event.currentTarget.value)}
          />
        </label>
        <label className={styles.retentionField}>
          <span>{t('history.retentionDays')}</span>
          <Input
            inputMode="numeric"
            placeholder={t('history.retentionUnlimited')}
            value={daysText}
            onChange={(event) => setDaysText(event.currentTarget.value)}
          />
        </label>
      </div>
      <div className={styles.retentionActions}>
        <Button disabled={busy} variant="ghost" onClick={() => void save()}>
          {t('common.save')}
        </Button>
        <Button disabled={busy} variant="ghost" onClick={() => void runPreview()}>
          {t('history.prunePreview')}
        </Button>
      </div>
      <h4 className={styles.pruneTitle}>{t('history.pruneTitle')}</h4>
      {preview == null ? null : preview.removed === 0 ? (
        <p className={styles.pruneNothing}>{t('history.pruneNothing')}</p>
      ) : (
        <div className={styles.pruneReview}>
          <p>{t('history.pruneWould', { count: preview.removed, kept: preview.kept })}</p>
          <Button disabled={busy} onClick={() => void apply()}>
            <Icon name="trash" size={13} />
            <span>{t('history.pruneApply')}</span>
          </Button>
        </div>
      )}
    </section>
  );
}

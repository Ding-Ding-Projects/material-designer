// The in-app changelog: every version the repository records, with its date,
// its categorized changes, and the commit that made each one.
//
// Three things it refuses to do, because a changelog that does them is worse
// than none:
//
//   * invent an entry, a date or a version — a release with nothing recorded
//     says so, and a date derived from commit history is labelled as the
//     newest change rather than dressed up as a release date;
//   * emit a commit link the build could not resolve — an entry whose commit
//     this repository does not contain says that plainly instead of offering a
//     link that 404s;
//   * export something other than what is on screen — copy and export honour
//     the search and the date range, and the file states the range it covers.
//
// The parsing, the filtering, the date handling and the export rendering are
// all pure modules under `lib/changelog/`, tested there. This file is the
// surface: layout, keyboard, clipboard and copy.

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import { Button, Dialog, DialogBody, DialogHeader, Input } from '@open-design/components';
import { Icon } from '../Icon';
import { useI18n } from '../../i18n';
import { copyToClipboard } from '../../lib/copy-to-clipboard';
import { changelogReleases, type ChangelogEntry, type ChangelogRelease } from '../../lib/changelog';
import { formatIsoDate } from '../../lib/changelog/dates';
import {
  EMPTY_CHANGELOG_FILTER,
  filterChangelog,
  renderChangelogMarkdown,
  renderChangelogText,
  type ChangelogExportLabels,
  type ChangelogFilter,
  type ChangelogScope,
} from '../../lib/changelog/filter';
import { ChangelogDateRange } from './ChangelogDateRange';
import { CHANGELOG_OPEN_EVENT } from './open-changelog';
import styles from './ChangelogDialog.module.css';

const STATUS_CLEAR_MS = 4000;

type ExportFormat = 'markdown' | 'text';

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

export function ChangelogDialog() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<ChangelogFilter>(EMPTY_CHANGELOG_FILTER);
  const [status, setStatus] = useState<string | null>(null);
  const titleId = useId();
  const searchRef = useRef<HTMLInputElement | null>(null);
  const statusTimer = useRef<number | null>(null);

  useEffect(() => {
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener(CHANGELOG_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(CHANGELOG_OPEN_EVENT, onOpen);
  }, []);

  useEffect(() => () => {
    if (statusTimer.current != null) window.clearTimeout(statusTimer.current);
  }, []);

  // Parsing is memoized inside `changelogReleases`, so this costs nothing after
  // the first open — and nothing at all until the viewer is first opened.
  const releases = useMemo<readonly ChangelogRelease[]>(() => (open ? changelogReleases() : []), [open]);
  const result = useMemo(() => filterChangelog(releases, filter), [filter, releases]);

  const bounds = useMemo(() => {
    let first: string | null = null;
    let last: string | null = null;
    for (const release of releases) {
      if (release.dateRange == null) continue;
      if (first == null || release.dateRange.first < first) first = release.dateRange.first;
      if (last == null || release.dateRange.last > last) last = release.dateRange.last;
    }
    return { first, last };
  }, [releases]);

  const flashStatus = useCallback((message: string) => {
    setStatus(message);
    if (statusTimer.current != null) window.clearTimeout(statusTimer.current);
    statusTimer.current = window.setTimeout(() => setStatus(null), STATUS_CLEAR_MS);
  }, []);

  /**
   * One sentence saying exactly what the reader (and any export) is looking
   * at. It is assembled from the filter's own report rather than from the
   * component's state, so a file can never claim a range the list did not use.
   */
  const scopeSentence = useCallback(
    (scope: ChangelogScope): string => {
      const parts: string[] = [
        scope.matched === scope.total
          ? t('changelog.scopeAll', { matched: scope.matched, versions: scope.versions.length })
          : t('changelog.scopeFiltered', { matched: scope.matched, total: scope.total }),
      ];
      if (scope.query != null) parts.push(t('changelog.scopeSearch', { query: scope.query }));
      if (scope.from != null && scope.to != null) {
        parts.push(t('changelog.scopeRange', { from: scope.from, to: scope.to }));
      } else if (scope.from != null) {
        parts.push(t('changelog.scopeRangeFrom', { from: scope.from }));
      } else if (scope.to != null) {
        parts.push(t('changelog.scopeRangeTo', { to: scope.to }));
      }
      let sentence = `${parts.join(' · ')}`;
      if (scope.undatedExcluded > 0) {
        sentence = `${sentence} ${t('changelog.scopeUndated', { count: scope.undatedExcluded })}`;
      }
      return sentence;
    },
    [t],
  );

  const exportLabels = useMemo<ChangelogExportLabels>(
    () => ({
      heading: t('changelog.title'),
      scope: scopeSentence(result.scope),
      commitUnrecorded: t('changelog.commitUnrecorded'),
      commitUnresolved: t('changelog.commitUnresolved'),
      // Passed without vars on purpose: the renderer substitutes `{count}`
      // per entry, so the label has to arrive still carrying its placeholder.
      commitSummarizes: t('changelog.commitSummarizes'),
      dateUnrecorded: t('changelog.releaseDateUnknown'),
    }),
    [result.scope, scopeSentence, t],
  );

  const render = useCallback(
    (format: ExportFormat) =>
      format === 'markdown'
        ? renderChangelogMarkdown(result.releases, exportLabels)
        : renderChangelogText(result.releases, exportLabels),
    [exportLabels, result.releases],
  );

  const handleCopy = useCallback(async () => {
    const ok = await copyToClipboard(render('text'));
    flashStatus(ok ? t('changelog.copied') : t('changelog.copyFailed'));
  }, [flashStatus, render, t]);

  const handleExport = useCallback(
    (format: ExportFormat) => {
      const extension = format === 'markdown' ? 'md' : 'txt';
      const name = `changelog-${new Date().toISOString().slice(0, 10)}.${extension}`;
      downloadFile(name, render(format), format === 'markdown' ? 'text/markdown' : 'text/plain');
      flashStatus(t('changelog.exported', { filename: name }));
    },
    [flashStatus, render, t],
  );

  const close = useCallback(() => {
    setOpen(false);
    setStatus(null);
  }, []);

  useEffect(() => {
    if (!open) return;
    // Focus the search rather than a destructive control, and only once the
    // dialog is actually up.
    const id = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  if (!open) return null;

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
            {t('changelog.title')}
          </h2>
          <p className={styles.subtitle}>{t('changelog.subtitle')}</p>
        </div>
        <Button aria-label={t('common.close')} size="icon" variant="ghost" onClick={close}>
          <Icon name="close" size={14} />
        </Button>
      </DialogHeader>

      <div className={styles.controls}>
        <label className={styles.search}>
          <span className={styles.searchLabel}>{t('changelog.searchLabel')}</span>
          <Input
            placeholder={t('changelog.searchPlaceholder')}
            ref={searchRef}
            type="search"
            value={filter.query}
            onChange={(event) =>
              setFilter((current) => ({ ...current, query: event.currentTarget.value }))
            }
          />
        </label>
        <ChangelogDateRange
          bounds={bounds}
          value={{ from: filter.from, to: filter.to }}
          onChange={(next) => setFilter((current) => ({ ...current, ...next }))}
        />
      </div>

      <div className={styles.scopeRow}>
        <p className={styles.scope} data-testid="changelog-scope">
          {scopeSentence(result.scope)}
        </p>
        <div className={styles.actions}>
          <Button variant="ghost" onClick={() => void handleCopy()}>
            <Icon name="copy" size={13} />
            <span>{t('changelog.copy')}</span>
          </Button>
          <Button variant="ghost" onClick={() => handleExport('markdown')}>
            <Icon name="download" size={13} />
            <span>{t('changelog.exportMarkdown')}</span>
          </Button>
          <Button variant="ghost" onClick={() => handleExport('text')}>
            <Icon name="download" size={13} />
            <span>{t('changelog.exportText')}</span>
          </Button>
        </div>
      </div>
      {status != null ? (
        <p className={styles.status} role="status">
          {status}
        </p>
      ) : null}

      <DialogBody className={styles.body}>
        {result.releases.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>{t('changelog.empty')}</p>
            <p className={styles.emptyHint}>{t('changelog.emptyHint')}</p>
          </div>
        ) : (
          result.releases.map((release) => (
            <ReleaseSection key={`${release.sourcePath}:${release.version}`} release={release} />
          ))
        )}
      </DialogBody>
    </Dialog>
  );
}

function ReleaseSection({ release }: { release: ChangelogRelease }) {
  const { locale, t } = useI18n();
  // A section that is not a version gets no date line at all. "No date
  // recorded" beside "Not done yet" would imply a release that has one
  // missing, when in fact the section is not a release.
  const dateLabel = !release.isVersion
    ? null
    : release.date == null
      ? t('changelog.releaseDateUnknown')
      : release.dateSource === 'source'
        ? t('changelog.releaseDateSource', { date: formatIsoDate(release.date, locale) })
        : t('changelog.releaseDateCommits', { date: formatIsoDate(release.date, locale) });

  return (
    <section className={styles.release}>
      <header className={styles.releaseHeader}>
        <h3 className={styles.version}>{release.version}</h3>
        {dateLabel != null ? <span className={styles.releaseDate}>{dateLabel}</span> : null}
        <span className={styles.releaseCount}>
          {t('changelog.entryCount', { count: release.entryCount })}
        </span>
      </header>
      {release.title != null ? <p className={styles.releaseTitle}>{release.title}</p> : null}
      <p className={styles.releaseSource}>
        {t('changelog.sourceLabel', { path: release.sourcePath })}
      </p>
      {release.categories.map((category) => (
        <div className={styles.category} key={category.name}>
          <h4 className={styles.categoryName}>{category.name}</h4>
          <ul className={styles.entries}>
            {category.entries.map((entry) => (
              <EntryRow entry={entry} key={entry.id} />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function EntryRow({ entry }: { entry: ChangelogEntry }) {
  const { t } = useI18n();
  return (
    <li className={styles.entry}>
      {entry.subcategory != null ? (
        <span className={styles.subcategory}>{entry.subcategory}</span>
      ) : null}
      <p className={styles.entryText}>
        {entry.title != null ? <strong className={styles.entryTitle}>{entry.title}</strong> : null}
        {entry.title != null && entry.text.length > 0 ? ' ' : null}
        {entry.text}
      </p>
      <div className={styles.entryMeta}>
        {entry.commit.state === 'verified' ? (
          <>
            <a
              aria-label={t('changelog.commitLinkAria', { sha: entry.commit.shortSha })}
              className={styles.commit}
              href={entry.commit.url}
              rel="noreferrer noopener"
              target="_blank"
            >
              <Icon name="fork" size={12} />
              <code>{entry.commit.shortSha}</code>
            </a>
            {entry.commit.summarizes > 1 ? (
              <span className={styles.commitNote}>
                {t('changelog.commitSummarizes', { count: entry.commit.summarizes })}
              </span>
            ) : null}
          </>
        ) : (
          // Never a link. The entry says which of the two it is: the source
          // named no commit, or named one this repository does not have.
          <span className={styles.commitMissing}>
            {entry.commit.state === 'unrecorded'
              ? t('changelog.commitUnrecorded')
              : t('changelog.commitUnresolved')}
            {entry.commit.state === 'unresolved' && entry.commit.referenced.length > 0
              ? ` (${entry.commit.referenced.join(', ')})`
              : null}
          </span>
        )}
        {entry.date != null ? <span className={styles.entryDate}>{entry.date}</span> : null}
      </div>
    </li>
  );
}

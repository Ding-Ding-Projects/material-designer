import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { useI18n } from '../../i18n';
import { copyToClipboard } from '../../lib/copy-to-clipboard';
import { Icon } from '../Icon';
import { notify } from '../notifications/notificationStore';
import { RegexSearchField } from '../regex/RegexSearchField';
import { useRegexSearch } from '../regex/useRegexSearch';
import {
  assertHandoffRegistry,
  HANDOFF_COMPONENT_EXPORT_FIELDS,
  HANDOFF_COMPONENT_OWNERS,
  HANDOFF_EXPORT_OMISSIONS,
  HANDOFF_EXPORT_SCHEMA,
  HANDOFF_TOKEN_EXPORT_FIELDS,
  HANDOFF_TOKEN_MAPPINGS,
  requireHandoffComponentOwner,
  requireHandoffTokenMapping,
  type HandoffComponentOwner,
  type HandoffStatus,
  type HandoffTokenMapping,
} from './registry';
import { downloadTextDeferred } from './export';
import {
  EMPTY_HANDOFF_SELECTION,
  invertHandoffSelection,
  selectHandoffIds,
  toggleHandoffSelection,
  type HandoffSelectionState,
} from './selection';
import styles from './HandoffView.module.css';

type HandoffRow = HandoffTokenMapping | HandoffComponentOwner;

interface HandoffViewProps {
  onBack: () => void;
}

const STATUS_LABEL_KEY: Record<HandoffStatus, 'handoff.statusImplemented' | 'handoff.statusPartial' | 'handoff.statusUnverified'> = {
  implemented: 'handoff.statusImplemented',
  partial: 'handoff.statusPartial',
  unverified: 'handoff.statusUnverified',
};

function rowSearchText(row: HandoffRow): string {
  if ('md3Token' in row) {
    return [
      row.id,
      row.md3Token,
      row.appVariable,
      row.designSourcePath,
      row.appSourcePath,
      row.status,
      row.evidence,
    ].join(' ');
  }
  return [row.id, row.owner, row.sourcePath, row.status, row.evidence].join(' ');
}

function rowId(row: HandoffRow): string {
  return row.id;
}

function canonicalRows(rows: readonly HandoffRow[]): HandoffRow[] {
  assertHandoffRegistry();
  return rows.map((row) => {
    if ('md3Token' in row) {
      const projected = Object.fromEntries(
        HANDOFF_TOKEN_EXPORT_FIELDS.map((field) => [field, row[field]]),
      );
      return requireHandoffTokenMapping(projected);
    }
    const projected = Object.fromEntries(
      HANDOFF_COMPONENT_EXPORT_FIELDS.map((field) => [field, row[field]]),
    );
    return requireHandoffComponentOwner(projected);
  });
}

function jsonForRows(rows: readonly HandoffRow[]): string {
  const canonical = canonicalRows(rows);
  return JSON.stringify(
    {
      schema: HANDOFF_EXPORT_SCHEMA,
      source: 'checked-in source registry',
      omissions: HANDOFF_EXPORT_OMISSIONS,
      rows: canonical,
    },
    null,
    2,
  );
}

function markdownCell(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/`/g, '\\`')
    .replace(/\r?\n/g, '<br>');
}

function markdownForRows(rows: readonly HandoffRow[]): string {
  const canonical = canonicalRows(rows);
  const lines = [
    '# Material Designer handoff registry',
    '',
    `Schema: \`${HANDOFF_EXPORT_SCHEMA}\`.`,
    `Omitted: ${HANDOFF_EXPORT_OMISSIONS.join(', ')}.`,
    '',
  ];
  if (canonical.some((row) => 'md3Token' in row)) {
    lines.push('| ID | Material Design 3 token | App variable | Design source | Application source | Status | Evidence |', '| --- | --- | --- | --- | --- | --- | --- |');
    for (const row of canonical) {
      if (!('md3Token' in row)) continue;
      lines.push(`| ${markdownCell(row.id)} | \`${markdownCell(row.md3Token)}\` | \`${markdownCell(row.appVariable)}\` | \`${markdownCell(row.designSourcePath)}\` | \`${markdownCell(row.appSourcePath)}\` | ${markdownCell(row.status)} | ${markdownCell(row.evidence)} |`);
    }
    lines.push('');
  }
  if (canonical.some((row) => 'owner' in row)) {
    lines.push('| ID | Component owner | Source path | Status | Evidence |', '| --- | --- | --- | --- | --- |');
    for (const row of canonical) {
      if (!('owner' in row)) continue;
      lines.push(`| ${markdownCell(row.id)} | ${markdownCell(row.owner)} | \`${markdownCell(row.sourcePath)}\` | ${markdownCell(row.status)} | ${markdownCell(row.evidence)} |`);
    }
  }
  return `${lines.join('\n')}\n`;
}

function csvForRows(rows: readonly HandoffRow[]): string {
  const canonical = canonicalRows(rows);
  const escape = (value: string) => {
    const neutralized = /^[\t ]*[=+\-@]/.test(value) ? `'${value}` : value;
    return `"${neutralized.replace(/"/g, '""')}"`;
  };
  const omissionText = HANDOFF_EXPORT_OMISSIONS.join('; ');
  const lines = ['schema,omissions,kind,id,token_or_owner,app_variable,design_source,application_source,status,evidence'];
  for (const row of canonical) {
    if ('md3Token' in row) {
      lines.push([
        HANDOFF_EXPORT_SCHEMA,
        omissionText,
        'token',
        row.id,
        row.md3Token,
        row.appVariable,
        row.designSourcePath,
        row.appSourcePath,
        row.status,
        row.evidence,
      ].map(escape).join(','));
    } else {
      lines.push([
        HANDOFF_EXPORT_SCHEMA,
        omissionText,
        'component',
        row.id,
        row.owner,
        row.sourcePath,
        '',
        '',
        row.status,
        row.evidence,
      ].map(escape).join(','));
    }
  }
  return `${lines.join('\n')}\n`;
}

function selectedRows(rows: readonly HandoffRow[], selection: HandoffSelectionState): HandoffRow[] {
  return rows.filter((row) => selection.selected.has(row.id));
}

interface RegistrySectionProps<T extends HandoffRow> {
  title: string;
  description: string;
  rows: readonly T[];
  filteredRows: readonly T[];
  selection: HandoffSelectionState;
  onSelectionChange: (next: HandoffSelectionState) => void;
  search: ReturnType<typeof useRegexSearch>;
  searchId: string;
  children: (row: T) => ReactNode;
}

function RegistrySection<T extends HandoffRow>({
  title,
  description,
  rows,
  filteredRows,
  selection,
  onSelectionChange,
  search,
  searchId,
  children,
}: RegistrySectionProps<T>) {
  const { t } = useI18n();
  const allIds = useMemo(() => rows.map(rowId), [rows]);
  const filteredIds = useMemo(() => filteredRows.map(rowId), [filteredRows]);
  const selectedCount = selection.selected.size;
  const toggle = useCallback((id: string, extend: boolean) => {
    // Shift ranges are defined only over the currently visible/filtered
    // ordering. If the anchor is hidden by a new filter, the clicked row is a
    // fresh anchor rather than a range through rows the user cannot see.
    onSelectionChange(toggleHandoffSelection(selection, id, filteredIds, extend));
  }, [filteredIds, onSelectionChange, selection]);
  const onRowKeyDown = useCallback((event: KeyboardEvent<HTMLLIElement>, id: string) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const rows = Array.from(event.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[data-handoff-row]') ?? []);
      const index = rows.indexOf(event.currentTarget);
      const nextIndex = event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? rows.length - 1
          : Math.max(0, Math.min(rows.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
      rows[nextIndex]?.focus();
      return;
    }
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    toggle(id, event.shiftKey);
  }, [toggle]);
  const selectVisible = useCallback(() => {
    onSelectionChange(selectHandoffIds(selection, allIds));
  }, [allIds, onSelectionChange, selection]);
  const selectAll = useCallback(() => {
    onSelectionChange(selectHandoffIds(selection, filteredIds));
  }, [filteredIds, onSelectionChange, selection]);
  const invert = useCallback(() => {
    onSelectionChange(invertHandoffSelection(selection, filteredIds));
  }, [filteredIds, onSelectionChange, selection]);

  return (
    <section className={styles.registrySection} aria-labelledby={`${searchId}-title`}>
      <div className={styles.sectionHeading}>
        <div>
          <h2 id={`${searchId}-title`}>{title}</h2>
          <p>{description}</p>
        </div>
        <span className={styles.count} role="status" aria-live="polite">
          {t('handoff.selectionCount', { selected: selectedCount, visible: filteredRows.length, total: rows.length })}
        </span>
      </div>
      <div className={styles.searchRow}>
        <RegexSearchField
          search={search}
          fieldLabel={title}
          ariaLabel={t('handoff.searchAria', { title })}
          placeholder={t('handoff.searchPlaceholder')}
          testId={searchId}
          hostClassName={styles.searchHost}
          className={styles.searchInput}
          ariaInvalid={Boolean(search.error)}
          ariaDescribedBy={search.error ? `${searchId}-regex-error` : undefined}
        />
        {search.error ? (
          <p id={`${searchId}-regex-error`} className={styles.regexError} role="status" aria-live="polite">
            {t('handoff.regexInvalid', { field: title })}
          </p>
        ) : null}
      </div>
      <div className={styles.bulkBar} role="toolbar" aria-label={t('handoff.bulkAria', { title })}>
        <button type="button" className={styles.textButton} onClick={selectVisible} disabled={filteredRows.length === 0}>
          {t('handoff.selectThisList')}
        </button>
        <button type="button" className={styles.textButton} onClick={selectAll} disabled={filteredRows.length === 0}>
          {t('handoff.selectAllMatches')}
        </button>
        <button type="button" className={styles.textButton} onClick={invert} disabled={filteredRows.length === 0}>
          {t('handoff.invertSelection')}
        </button>
        <button type="button" className={styles.textButton} onClick={() => onSelectionChange(EMPTY_HANDOFF_SELECTION)} disabled={selectedCount === 0}>
          {t('handoff.clearSelection')}
        </button>
      </div>
      <ul className={styles.rows} aria-label={title}>
        {filteredRows.length === 0 ? (
          <li className={styles.noMatch} role="status">{t('handoff.noMatches')}</li>
        ) : filteredRows.map((row) => {
          const selected = selection.selected.has(row.id);
          return (
            <li
              key={row.id}
              className={`${styles.row}${selected ? ` ${styles.rowSelected}` : ''}`}
              tabIndex={0}
              data-handoff-row="true"
              onClick={(event) => toggle(row.id, event.shiftKey)}
              onKeyDown={(event) => onRowKeyDown(event, row.id)}
              data-testid={`${searchId}-row-${row.id}`}
            >
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={selected}
                aria-label={t('handoff.selectRow', { id: row.id })}
                onChange={(event) => {
                  event.stopPropagation();
                  toggle(row.id, false);
                }}
              />
              <div className={styles.rowContent}>{children(row)}</div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function HandoffView({ onBack }: HandoffViewProps) {
  const { t } = useI18n();
  assertHandoffRegistry();
  const pageRef = useRef<HTMLElement | null>(null);
  const [tokenQuery, setTokenQuery] = useState('');
  const [componentQuery, setComponentQuery] = useState('');
  const tokenSearch = useRegexSearch(tokenQuery, setTokenQuery);
  const componentSearch = useRegexSearch(componentQuery, setComponentQuery);
  const [tokenSelection, setTokenSelection] = useState<HandoffSelectionState>(EMPTY_HANDOFF_SELECTION);
  const [componentSelection, setComponentSelection] = useState<HandoffSelectionState>(EMPTY_HANDOFF_SELECTION);

  useLayoutEffect(() => {
    pageRef.current?.focus({ preventScroll: true });
  }, []);

  const filteredTokens = useMemo(
    () => HANDOFF_TOKEN_MAPPINGS.filter((row) => tokenSearch.matches(rowSearchText(row))),
    [tokenSearch, tokenQuery],
  );
  const filteredComponents = useMemo(
    () => HANDOFF_COMPONENT_OWNERS.filter((row) => componentSearch.matches(rowSearchText(row))),
    [componentSearch, componentQuery],
  );
  const selectedTokenRows = useMemo(
    () => selectedRows(HANDOFF_TOKEN_MAPPINGS, tokenSelection),
    [tokenSelection],
  );
  const selectedComponentRows = useMemo(
    () => selectedRows(HANDOFF_COMPONENT_OWNERS, componentSelection),
    [componentSelection],
  );
  const selected = useMemo(
    () => [...selectedTokenRows, ...selectedComponentRows],
    [selectedComponentRows, selectedTokenRows],
  );
  const allRows = useMemo(
    () => [...HANDOFF_TOKEN_MAPPINGS, ...HANDOFF_COMPONENT_OWNERS],
    [],
  );

  const exportRows = useCallback(async (format: 'json' | 'markdown' | 'csv', rows: readonly HandoffRow[], scope: string) => {
    const extension = format === 'json' ? 'json' : format === 'markdown' ? 'md' : 'csv';
    const mime = format === 'json' ? 'application/json' : format === 'markdown' ? 'text/markdown' : 'text/csv';
    const text = format === 'json' ? jsonForRows(rows) : format === 'markdown' ? markdownForRows(rows) : csvForRows(rows);
    const result = await downloadTextDeferred(text, `material-designer-handoff-${scope}.${extension}`, mime);
    notify({
      severity: result.ok ? 'success' : 'error',
      title: result.ok ? t('handoff.downloadSucceeded') : t('handoff.downloadFailed'),
    });
  }, [t]);
  const copySelected = useCallback(async () => {
    const ok = await copyToClipboard(jsonForRows(selected));
    notify({
      severity: ok ? 'success' : 'error',
      title: ok ? t('handoff.copied') : t('handoff.copyFailed'),
    });
  }, [selected, t]);
  const copyAll = useCallback(async () => {
    const ok = await copyToClipboard(jsonForRows(allRows));
    notify({
      severity: ok ? 'success' : 'error',
      title: ok ? t('handoff.copied') : t('handoff.copyFailed'),
    });
  }, [allRows, t]);

  return (
    <main
      ref={pageRef}
      className={styles.page}
      tabIndex={-1}
      aria-labelledby="handoff-title"
      data-testid="handoff-page"
    >
      <div className={styles.pageInner}>
        <button type="button" className={styles.backButton} onClick={onBack} data-testid="handoff-back-to-settings">
          <Icon name="arrow-left" size={18} />
          <span>{t('handoff.backToSettings')}</span>
        </button>
        <header className={styles.header}>
          <div className={styles.eyebrow}>{t('handoff.eyebrow')}</div>
          <h1 id="handoff-title">{t('handoff.title')}</h1>
          <p>{t('handoff.subtitle')}</p>
          <p className={styles.statusNote} role="status">{t('handoff.statusNote')}</p>
        </header>
        <div className={styles.exportBar} role="toolbar" aria-label={t('handoff.exportAria')}>
          <span className={styles.exportLabel}>{t('handoff.exportLabel')}</span>
          <button type="button" className={styles.primaryButton} onClick={() => void copySelected()} disabled={selected.length === 0} data-testid="handoff-copy-selected">
            <Icon name="copy" size={16} /> {t('handoff.copySelected')}
          </button>
          <button type="button" className={styles.textButton} onClick={() => void copyAll()} data-testid="handoff-copy-all">
            {t('handoff.copyAll')}
          </button>
          {(['json', 'markdown', 'csv'] as const).map((format) => (
            <button key={`selected-${format}`} type="button" className={styles.textButton} onClick={() => void exportRows(format, selected, 'selected')} disabled={selected.length === 0} data-testid={`handoff-export-selected-${format}`}>
              {t('handoff.exportSelected', { format: format.toUpperCase() })}
            </button>
          ))}
          {(['json', 'markdown', 'csv'] as const).map((format) => (
            <button key={`all-${format}`} type="button" className={styles.textButton} onClick={() => void exportRows(format, allRows, 'all')} data-testid={`handoff-export-all-${format}`}>
              {t('handoff.exportAll', { format: format.toUpperCase() })}
            </button>
          ))}
        </div>
        <div className={styles.registryGrid}>
          <RegistrySection
            title={t('handoff.tokensTitle')}
            description={t('handoff.tokensDescription')}
            rows={HANDOFF_TOKEN_MAPPINGS}
            filteredRows={filteredTokens}
            selection={tokenSelection}
            onSelectionChange={setTokenSelection}
            search={tokenSearch}
            searchId="handoff-token-search"
          >
            {(row) => (
              <>
                <div className={styles.rowTitle}>
                  <span className={styles.swatch} style={{ background: `var(${row.appVariable})` }} role="img" aria-label={t('handoff.swatchAria', { variable: row.appVariable })} />
                  <code>{row.md3Token}</code>
                  <span className={`${styles.status} ${styles[`status${row.status}`]}`}>{t(STATUS_LABEL_KEY[row.status])}</span>
                </div>
                <div className={styles.rowMeta}><code>{row.appVariable}</code> · {row.designSourcePath} → {row.appSourcePath}</div>
                <p className={styles.evidence}>{row.evidence}</p>
              </>
            )}
          </RegistrySection>
          <RegistrySection
            title={t('handoff.componentsTitle')}
            description={t('handoff.componentsDescription')}
            rows={HANDOFF_COMPONENT_OWNERS}
            filteredRows={filteredComponents}
            selection={componentSelection}
            onSelectionChange={setComponentSelection}
            search={componentSearch}
            searchId="handoff-component-search"
          >
            {(row) => (
              <>
                <div className={styles.rowTitle}>
                  <span className={styles.ownerIcon} aria-hidden><Icon name="layers-filled" size={17} /></span>
                  <strong>{row.owner}</strong>
                  <span className={`${styles.status} ${styles[`status${row.status}`]}`}>{t(STATUS_LABEL_KEY[row.status])}</span>
                </div>
                <div className={styles.rowMeta}><code>{row.sourcePath}</code></div>
                <p className={styles.evidence}>{row.evidence}</p>
              </>
            )}
          </RegistrySection>
        </div>
        <p className={styles.footerNote}>{t('handoff.privacyNote')}</p>
      </div>
    </main>
  );
}

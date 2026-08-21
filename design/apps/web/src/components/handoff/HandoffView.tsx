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
import { Icon } from '../Icon';
import { RegexSearchField } from '../regex/RegexSearchField';
import { useRegexSearch } from '../regex/useRegexSearch';
import {
  HANDOFF_COMPONENT_OWNERS,
  HANDOFF_TOKEN_MAPPINGS,
  type HandoffComponentOwner,
  type HandoffStatus,
  type HandoffTokenMapping,
} from './registry';
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

const STATUS_LABEL: Record<HandoffStatus, string> = {
  implemented: 'Implemented',
  partial: 'Partial',
  unverified: 'Unverified',
};

function rowSearchText(row: HandoffRow): string {
  if ('md3Token' in row) {
    return [row.id, row.md3Token, row.appVariable, row.status, row.evidence].join(' ');
  }
  return [row.id, row.owner, row.sourcePath, row.status, row.evidence].join(' ');
}

function rowId(row: HandoffRow): string {
  return row.id;
}

function jsonForRows(rows: readonly HandoffRow[]): string {
  return JSON.stringify(
    {
      schema: 'material-designer.handoff.v1',
      source: 'checked-in source registry',
      privateData: 'omitted',
      rows,
    },
    null,
    2,
  );
}

function markdownForRows(rows: readonly HandoffRow[]): string {
  const lines = [
    '# Material Designer handoff registry',
    '',
    'Schema: `material-designer.handoff.v1`.',
    'Private user data and machine-specific paths are omitted.',
    '',
  ];
  if (rows.some((row) => 'md3Token' in row)) {
    lines.push('| ID | Material Design 3 token | App variable | Status | Evidence |', '| --- | --- | --- | --- | --- |');
    for (const row of rows) {
      if (!('md3Token' in row)) continue;
      lines.push(`| ${row.id} | \`${row.md3Token}\` | \`${row.appVariable}\` | ${row.status} | ${row.evidence} |`);
    }
    lines.push('');
  }
  if (rows.some((row) => 'owner' in row)) {
    lines.push('| ID | Component owner | Source path | Status | Evidence |', '| --- | --- | --- | --- | --- |');
    for (const row of rows) {
      if (!('owner' in row)) continue;
      lines.push(`| ${row.id} | ${row.owner} | \`${row.sourcePath}\` | ${row.status} | ${row.evidence} |`);
    }
  }
  return `${lines.join('\n')}\n`;
}

function csvForRows(rows: readonly HandoffRow[]): string {
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const lines = ['schema,id,token_or_owner,app_variable_or_source,status,evidence'];
  for (const row of rows) {
    if ('md3Token' in row) {
      lines.push([
        'material-designer.handoff.v1',
        row.id,
        row.md3Token,
        row.appVariable,
        row.status,
        row.evidence,
      ].map(escape).join(','));
    } else {
      lines.push([
        'material-designer.handoff.v1',
        row.id,
        row.owner,
        row.sourcePath,
        row.status,
        row.evidence,
      ].map(escape).join(','));
    }
  }
  return `${lines.join('\n')}\n`;
}

function downloadText(text: string, fileName: string, type: string): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return;
  const urlApi = URL as typeof URL & { createObjectURL?: (blob: Blob) => string; revokeObjectURL?: (url: string) => void };
  if (!urlApi.createObjectURL) return;
  const url = urlApi.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  urlApi.revokeObjectURL?.(url);
}

async function copyText(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
  }
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
    onSelectionChange(toggleHandoffSelection(selection, id, allIds, extend));
  }, [allIds, onSelectionChange, selection]);
  const onRowKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>, id: string) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    toggle(id, event.shiftKey);
  }, [toggle]);
  const selectVisible = useCallback(() => {
    onSelectionChange(selectHandoffIds(selection, filteredIds));
  }, [filteredIds, onSelectionChange, selection]);
  const selectAll = useCallback(() => {
    onSelectionChange(selectHandoffIds(selection, allIds));
  }, [allIds, onSelectionChange, selection]);
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
        />
      </div>
      <div className={styles.bulkBar} role="toolbar" aria-label={t('handoff.bulkAria', { title })}>
        <button type="button" className={styles.textButton} onClick={selectVisible} disabled={filteredRows.length === 0}>
          {t('handoff.selectThisList')}
        </button>
        <button type="button" className={styles.textButton} onClick={selectAll} disabled={rows.length === 0}>
          {t('handoff.selectAllMatches')}
        </button>
        <button type="button" className={styles.textButton} onClick={invert} disabled={filteredRows.length === 0}>
          {t('handoff.invertSelection')}
        </button>
        <button type="button" className={styles.textButton} onClick={() => onSelectionChange(EMPTY_HANDOFF_SELECTION)} disabled={selectedCount === 0}>
          {t('handoff.clearSelection')}
        </button>
      </div>
      <div className={styles.rows} role="listbox" aria-multiselectable="true" aria-label={title}>
        {filteredRows.length === 0 ? (
          <p className={styles.noMatch} role="status">{t('handoff.noMatches')}</p>
        ) : filteredRows.map((row) => {
          const selected = selection.selected.has(row.id);
          return (
            <div
              key={row.id}
              className={`${styles.row}${selected ? ` ${styles.rowSelected}` : ''}`}
              role="option"
              aria-selected={selected}
              tabIndex={0}
              onClick={(event) => toggle(row.id, event.shiftKey)}
              onKeyDown={(event) => onRowKeyDown(event, row.id)}
              data-testid={`${searchId}-row-${row.id}`}
            >
              <button
                type="button"
                className={styles.checkbox}
                role="checkbox"
                aria-checked={selected}
                aria-label={t('handoff.selectRow', { id: row.id })}
                onClick={(event) => {
                  event.stopPropagation();
                  toggle(row.id, event.shiftKey);
                }}
              >
                {selected ? <Icon name="check" size={16} /> : null}
              </button>
              <div className={styles.rowContent}>{children(row)}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function HandoffView({ onBack }: HandoffViewProps) {
  const { t } = useI18n();
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

  const exportRows = useCallback((format: 'json' | 'markdown' | 'csv', rows: readonly HandoffRow[], scope: string) => {
    const extension = format === 'json' ? 'json' : format === 'markdown' ? 'md' : 'csv';
    const mime = format === 'json' ? 'application/json' : format === 'markdown' ? 'text/markdown' : 'text/csv';
    const text = format === 'json' ? jsonForRows(rows) : format === 'markdown' ? markdownForRows(rows) : csvForRows(rows);
    downloadText(text, `material-designer-handoff-${scope}.${extension}`, mime);
  }, []);
  const copySelected = useCallback(() => { void copyText(jsonForRows(selected)); }, [selected]);
  const copyAll = useCallback(() => { void copyText(jsonForRows(allRows)); }, [allRows]);

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
          <button type="button" className={styles.primaryButton} onClick={copySelected} disabled={selected.length === 0} data-testid="handoff-copy-selected">
            <Icon name="copy" size={16} /> {t('handoff.copySelected')}
          </button>
          <button type="button" className={styles.textButton} onClick={copyAll} data-testid="handoff-copy-all">
            {t('handoff.copyAll')}
          </button>
          {(['json', 'markdown', 'csv'] as const).map((format) => (
            <button key={`selected-${format}`} type="button" className={styles.textButton} onClick={() => exportRows(format, selected, 'selected')} disabled={selected.length === 0} data-testid={`handoff-export-selected-${format}`}>
              {t('handoff.exportSelected', { format: format.toUpperCase() })}
            </button>
          ))}
          {(['json', 'markdown', 'csv'] as const).map((format) => (
            <button key={`all-${format}`} type="button" className={styles.textButton} onClick={() => exportRows(format, allRows, 'all')} data-testid={`handoff-export-all-${format}`}>
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
                  <span className={`${styles.status} ${styles[`status${row.status}`]}`}>{STATUS_LABEL[row.status]}</span>
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
                  <span className={`${styles.status} ${styles[`status${row.status}`]}`}>{STATUS_LABEL[row.status]}</span>
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

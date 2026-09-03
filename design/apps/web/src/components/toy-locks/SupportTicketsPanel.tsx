import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useI18n } from '../../i18n';
import { RegexSearchField } from '../regex/RegexSearchField';
import { useRegexSearch } from '../regex/useRegexSearch';
import {
  advanceSupportTicket,
  createSupportTicket,
  dismissSupportTickets,
  exportSupportTickets,
  filterSupportTickets,
  persistSupportTickets,
  readSupportTickets,
  SUPPORT_TICKET_CATEGORIES,
  SUPPORT_TICKET_MAX_DESCRIPTION_LENGTH,
  SUPPORT_TICKET_MIGRATION_KEY,
  SUPPORT_TICKETS_STORAGE_KEY,
  type SupportTicket,
  type SupportTicketCategory,
  type SupportTicketStorage,
} from '../../security/toy-lock-support-tickets';

import styles from './SupportTicketsPanel.module.css';

export type ToyLockRecoveryResult =
  | { readonly ok: true; readonly path: string }
  | { readonly ok: false; readonly reason: string };

export interface SupportTicketsPanelProps {
  readonly storage?: SupportTicketStorage | null;
  readonly onOpenRecoveryFolder?: () => Promise<ToyLockRecoveryResult>;
  readonly onClose?: () => void;
  readonly testId?: string;
}
type Copy = {
  title: string;
  disclosure: string;
  search: string;
  category: string;
  description: string;
  create: string;
  selectAll: string;
  invert: string;
  dismiss: string;
  export: string;
  exportWarning: string;
  confirmExport: string;
  empty: string;
  close: string;
  openFolder: string;
  folderOpened: string;
  folderFailed: string;
  copyPath: string;
  pathCopied: string;
  copyFailed: string;
  status: string;
  firstResponse: string;
  migration: string;
  invalidDescription: string;
  selected: string;
  noSelection: string;
  storageUnavailable: string;
  ticketIdFailed: string;
  categoryLockedOut: string;
  categoryAuthenticator: string;
  categoryOther: string;
  statusOpen: string;
  statusResolved: string;
  statusDismissed: string;
};

const EN: Copy = {
  title: 'Support Tickets',
  disclosure: 'This is a local fictional desk. Nothing is sent anywhere, no ticket exists outside this computer, no network request is made, no data is collected, and nobody is reading it.',
  search: 'Search local tickets', category: 'Category', description: 'Description', create: 'Create local ticket',
  selectAll: 'Select all visible tickets', invert: 'Invert selection', dismiss: 'Dismiss selected tickets', export: 'Export selected tickets',
  exportWarning: 'Descriptions are included. Review them for secrets before saving.', confirmExport: 'Export now',
  empty: 'No tickets match this search.', close: 'Close', openFolder: 'Open application-data folder',
  folderOpened: 'Recovery folder opened.', folderFailed: 'The recovery folder could not be opened.', copyPath: 'Copy recovery path',
  pathCopied: 'Recovery path copied.', copyFailed: 'The recovery path could not be copied.',
  status: 'Ticket {id}: status {status}', firstResponse: 'The desk read the manual once. Delete the local application-data folder yourself to recover the lock.',
  migration: 'Migrated {count} older local ticket records.', invalidDescription: 'Enter a description from 1 to 2,000 characters.',
  selected: '{count} selected', noSelection: 'Select at least one visible ticket first.',
  storageUnavailable: 'Local ticket storage is unavailable or full.', ticketIdFailed: 'A local ticket number could not be created.',
  categoryLockedOut: 'Locked out', categoryAuthenticator: 'Authenticator', categoryOther: 'Other',
  statusOpen: 'open', statusResolved: 'resolved', statusDismissed: 'dismissed',
};

const ZH_HK: Copy = {
  title: 'Support Tickets',
  disclosure: '呢個係本機虛構服務台。資料唔會傳去任何地方，ticket 唔會出本機，唔會發出網絡請求，唔會收集資料，亦冇人睇緊。',
  search: '搜尋本機 tickets', category: '類別', description: '描述', create: '建立本機 ticket',
  selectAll: '揀晒顯示中 tickets', invert: '反轉選擇', dismiss: '收起已選 tickets', export: '匯出已選 tickets',
  exportWarning: '匯出會包括描述。儲存之前請檢查有冇密鑰。', confirmExport: '而家匯出',
  empty: '搵唔到符合搜尋嘅 ticket。', close: '關閉', openFolder: '開啟應用程式資料夾',
  folderOpened: '復原資料夾已開啟。', folderFailed: '復原資料夾開唔到。', copyPath: '複製復原路徑',
  pathCopied: '復原路徑已複製。', copyFailed: '復原路徑複製唔到。',
  status: 'Ticket {id}：狀態 {status}', firstResponse: '服務台睇過一次說明書。要復原玩具鎖，請你自己刪除本機應用程式資料夾。',
  migration: '已遷移 {count} 張舊本機 ticket 記錄。', invalidDescription: '請輸入 1 至 2,000 個字嘅描述。',
  selected: '已選 {count} 張', noSelection: '先揀至少一張顯示中 ticket。',
  storageUnavailable: '本機 ticket 儲存空間用唔到或者已滿。', ticketIdFailed: '本機 ticket 編號建立唔到。',
  categoryLockedOut: '鎖住咗', categoryAuthenticator: '驗證器', categoryOther: '其他',
  statusOpen: '開啟', statusResolved: '已處理', statusDismissed: '已收起',
};

function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? `{${key}}`));
}

function copyFor(locale: string, bilingual: boolean): Copy {
  const primary = locale === 'zh-HK' ? ZH_HK : EN;
  if (!bilingual) return primary;
  return Object.fromEntries(
    (Object.keys(EN) as Array<keyof Copy>).map((key) => [key, `${EN[key]}\n${ZH_HK[key]}`]),
  ) as Copy;
}

function applyFunnyLevel(copy: Copy, englishLevel: number, cantoneseLevel: number, bilingual: boolean, locale: string): Copy {
  const decorate = (value: string, level: number, english: boolean): string => {
    if (level <= 1) return value;
    if (english) return `${value} ${level >= 5 ? 'The tiny desk has brought snacks.' : 'The tiny desk is checking its notes.'}`;
    return `${value} ${level >= 5 ? '細細個服務台帶埋點心。' : '服務台而家翻緊筆記。'}`;
  };
  const result = { ...copy };
  const decorateKey = (key: keyof Copy) => bilingual
    ? `${decorate(EN[key], englishLevel, true)}\n${decorate(ZH_HK[key], cantoneseLevel, false)}`
    : decorate(copy[key], locale === 'zh-HK' ? cantoneseLevel : englishLevel, locale !== 'zh-HK');
  for (const key of ['disclosure', 'firstResponse', 'invalidDescription', 'folderFailed', 'noSelection'] as const) result[key] = decorateKey(key);
  return result;
}

function browserStorage(): SupportTicketStorage | null {
  if (typeof window === 'undefined') return null;
  try { return window.localStorage; } catch { return null; }
}

function localizedCategory(copy: Copy, category: SupportTicketCategory): string {
  return category === 'locked-out' ? copy.categoryLockedOut : category === 'authenticator' ? copy.categoryAuthenticator : copy.categoryOther;
}

function localizedStatus(copy: Copy, status: SupportTicket['status']): string {
  return status === 'open' ? copy.statusOpen : status === 'resolved' ? copy.statusResolved : copy.statusDismissed;
}

function downloadJson(payload: string): boolean {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return false;
  try {
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'toy-lock-support-tickets.json';
    link.click();
    URL.revokeObjectURL(url);
    return true;
  } catch { return false; }
}

export function SupportTicketsPanel({ storage, onOpenRecoveryFolder, onClose, testId = 'toy-lock-support-surface' }: SupportTicketsPanelProps) {
  const { locale, languageMode, funnyLevels } = useI18n();
  const copy = useMemo(() => applyFunnyLevel(
    copyFor(locale, languageMode === 'bilingual'),
    funnyLevels.en,
    funnyLevels['zh-HK'],
    languageMode === 'bilingual',
    locale,
  ), [funnyLevels, languageMode, locale]);
  const ticketStorage = storage === undefined ? browserStorage() : storage;
  const initial = useMemo(() => readSupportTickets(ticketStorage), [ticketStorage]);
  const [tickets, setTickets] = useState<SupportTicket[]>(() => [...initial.tickets]);
  const [category, setCategory] = useState<SupportTicketCategory>('locked-out');
  const [description, setDescription] = useState('');
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [status, setStatus] = useState('');
  const [exportReady, setExportReady] = useState(false);
  const [recoveryPath, setRecoveryPath] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const search = useRegexSearch(query, setQuery);

  const filtered = useMemo(() => filterSupportTickets(tickets, query, search.mode === 'regex' ? search.matches : undefined), [query, search, tickets]);
  const visibleSelected = useMemo(() => new Set(filtered.filter((ticket) => selectedIds.has(ticket.id)).map((ticket) => ticket.id)), [filtered, selectedIds]);

  useEffect(() => {
    if (!persistSupportTickets(tickets, ticketStorage)) setStatus(copy.storageUnavailable);
  }, [copy.storageUnavailable, ticketStorage, tickets]);

  useEffect(() => {
    if (initial.migrated === 0 || !ticketStorage) return;
    try {
      ticketStorage.setItem(SUPPORT_TICKET_MIGRATION_KEY, JSON.stringify({
        version: 1,
        action: 'migrated-legacy-severity',
        count: initial.migrated,
        recordedAt: new Date().toISOString(),
      }));
      setStatus(fill(copy.migration, { count: initial.migrated }));
    } catch { setStatus(fill(copy.migration, { count: initial.migrated })); }
  }, [copy.migration, initial.migrated, ticketStorage]);

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
  }, []);

  const create = useCallback(() => {
    const result = createSupportTicket({ category, description }, tickets);
    if (!result.ok) {
      setStatus(result.reason === 'description-too-long' || result.reason === 'empty-description' ? copy.invalidDescription : copy.ticketIdFailed);
      return;
    }
    const ticket = result.ticket;
    setTickets((current) => [ticket, ...current]);
    setSelectedIds(new Set([ticket.id]));
    setDescription('');
    setStatus(fill(copy.status, { id: ticket.id, status: localizedStatus(copy, ticket.status) }));
    timerRef.current = window.setTimeout(() => {
      setTickets((current) => [...advanceSupportTicket(current, ticket.id, copy.firstResponse)]);
      setStatus(fill(copy.status, { id: ticket.id, status: localizedStatus(copy, 'resolved') }));
      timerRef.current = null;
    }, 250);
  }, [category, copy, description, tickets]);

  const selectAll = useCallback(() => setSelectedIds(new Set(filtered.map((ticket) => ticket.id))), [filtered]);
  const invert = useCallback(() => setSelectedIds(new Set(filtered.filter((ticket) => !selectedIds.has(ticket.id)).map((ticket) => ticket.id))), [filtered, selectedIds]);
  const dismiss = useCallback(() => {
    if (visibleSelected.size === 0) { setStatus(copy.noSelection); return; }
    setTickets((current) => [...dismissSupportTickets(current, visibleSelected)]);
    setStatus(fill(copy.selected, { count: visibleSelected.size }));
  }, [copy.noSelection, copy.selected, visibleSelected]);
  const requestExport = useCallback(() => {
    if (visibleSelected.size === 0) { setStatus(copy.noSelection); return; }
    setExportReady(true);
    setStatus(copy.exportWarning);
  }, [copy.exportWarning, copy.noSelection, visibleSelected]);
  const exportSelected = useCallback(() => {
    if (visibleSelected.size === 0) { setStatus(copy.noSelection); return; }
    const exported = downloadJson(exportSupportTickets(filtered.filter((ticket) => visibleSelected.has(ticket.id))));
    setExportReady(false);
    setStatus(exported ? fill(copy.selected, { count: visibleSelected.size }) : copy.copyFailed);
  }, [copy.copyFailed, copy.noSelection, copy.selected, filtered, visibleSelected]);
  const openFolder = useCallback(async () => {
    if (!onOpenRecoveryFolder) { setStatus(copy.folderFailed); return; }
    try {
      const result = await onOpenRecoveryFolder();
      if (result.ok && result.path.trim().length > 0) {
        setRecoveryPath(result.path);
        setStatus(copy.folderOpened);
      } else setStatus(copy.folderFailed);
    } catch { setStatus(copy.folderFailed); }
  }, [copy.folderFailed, copy.folderOpened, onOpenRecoveryFolder]);
  const copyPath = useCallback(async () => {
    if (!recoveryPath || !navigator.clipboard?.writeText) { setStatus(copy.copyFailed); return; }
    try { await navigator.clipboard.writeText(recoveryPath); setStatus(copy.pathCopied); }
    catch { setStatus(copy.copyFailed); }
  }, [copy.copyFailed, copy.pathCopied, recoveryPath]);

  return (
    <section className={styles.panel} role="dialog" aria-modal="false" aria-labelledby={`${testId}-title`} data-testid={testId}>
      <header className={styles.header}>
        <div><h2 id={`${testId}-title`}>{copy.title}</h2><p>{copy.disclosure}</p></div>
        {onClose ? <button type="button" onClick={onClose} aria-label={copy.close}>{copy.close}</button> : null}
      </header>
      <RegexSearchField search={search} fieldLabel={copy.search} ariaLabel={copy.search} placeholder={copy.search} testId={`${testId}-search`} />
      <label className={styles.field}>
        <span>{copy.category}</span>
        <select value={category} onChange={(event) => setCategory(event.currentTarget.value as SupportTicketCategory)}>
          {SUPPORT_TICKET_CATEGORIES.map((value) => <option key={value} value={value}>{localizedCategory(copy, value)}</option>)}
        </select>
      </label>
      <label className={styles.field}>
        <span>{copy.description}</span>
        <textarea value={description} maxLength={SUPPORT_TICKET_MAX_DESCRIPTION_LENGTH} onChange={(event) => setDescription(event.currentTarget.value)} />
      </label>
      <button type="button" onClick={create}>{copy.create}</button>
      <div className={styles.actions}>
        <button type="button" onClick={selectAll}>{copy.selectAll}</button>
        <button type="button" onClick={invert}>{copy.invert}</button>
        <button type="button" onClick={dismiss} disabled={visibleSelected.size === 0}>{copy.dismiss}</button>
        <button type="button" onClick={requestExport} disabled={visibleSelected.size === 0}>{copy.export}</button>
        {exportReady ? <button type="button" onClick={exportSelected}>{copy.confirmExport}</button> : null}
      </div>
      <p className={styles.status} role="status" aria-live="polite">{status || fill(copy.selected, { count: visibleSelected.size })}</p>
      {filtered.length === 0 ? <p role="status">{copy.empty}</p> : (
        <ul className={styles.list} aria-label={copy.title}>
          {filtered.map((ticket) => (
            <li key={ticket.id}>
              <label><input type="checkbox" aria-label={fill(copy.status, { id: ticket.id, status: localizedStatus(copy, ticket.status) })} checked={selectedIds.has(ticket.id)} onChange={() => setSelectedIds((current) => {
                const next = new Set(current); if (next.has(ticket.id)) next.delete(ticket.id); else next.add(ticket.id); return next;
              })} /> <span>{fill(copy.status, { id: ticket.id, status: localizedStatus(copy, ticket.status) })}</span></label>
              <p>{ticket.description}</p>
              {ticket.response ? <p role="status">{ticket.response}</p> : null}
            </li>
          ))}
        </ul>
      )}
      <p>{copy.firstResponse}</p>
      <button type="button" onClick={() => void openFolder()}>{copy.openFolder}</button>
      {recoveryPath ? <p><strong>{recoveryPath}</strong> <button type="button" onClick={() => void copyPath()}>{copy.copyPath}</button></p> : null}
    </section>
  );
}

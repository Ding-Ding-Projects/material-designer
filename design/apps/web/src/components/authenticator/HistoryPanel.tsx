'use client';

import { useEffect, useState } from 'react';

import { RegexSearchField } from '../regex/RegexSearchField';
import { useRegexSearch } from '../regex/useRegexSearch';
import type { AuthenticatorBridge, HistoryRecord } from './contracts';
import styles from './AuthenticatorDestination.module.css';

export interface AuthenticatorHistoryPanelProps {
  bridge: AuthenticatorBridge;
  labels?: { title?: string; password?: string; unlock?: string; search?: string };
}

/** A small standalone history surface for hosts that mount it beside the destination. */
export function AuthenticatorHistoryPanel({ bridge, labels }: AuthenticatorHistoryPanelProps) {
  const [password, setPassword] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const search = useRegexSearch(query, setQuery);

  useEffect(() => {
    if (!unlocked) return;
    void bridge.historyList(search.mode === 'regex' ? '' : query).then((result) => {
      if (result.ok) setRecords(result.value);
      else setNotice(result.reason);
    }).catch((error: unknown) => setNotice(error instanceof Error ? error.message : String(error)));
  }, [bridge, query, search.mode, unlocked]);

  const unlock = async () => {
    const result = await bridge.historyUnlock(password);
    if (result.ok) {
      setUnlocked(true);
      setPassword('');
      setNotice(null);
    } else setNotice(result.reason);
  };

  return (
    <section className={styles.panel} aria-labelledby="authenticator-history-title" data-testid="authenticator-history-panel">
      <h2 id="authenticator-history-title">{labels?.title ?? 'Protected authenticator history'}</h2>
      {!unlocked ? (
        <div className={styles.historyLock}>
          <label className={styles.field}><span>{labels?.password ?? 'History manager password'}</span><input type="password" value={password} onChange={(event) => setPassword(event.currentTarget.value)} /></label>
          <button type="button" onClick={() => void unlock()}>{labels?.unlock ?? 'Unlock history'}</button>
        </div>
      ) : (
        <>
          <RegexSearchField search={search} fieldLabel={labels?.search ?? 'Search protected history'} ariaLabel={labels?.search ?? 'Search protected history'} testId="authenticator-history-panel-search" />
          {notice ? <p className={styles.error} role="alert">{notice}</p> : null}
          <div className={styles.historyList}>
            {records.length === 0 ? <p className={styles.notice} role="status">No protected history records match.</p> : records.map((record) => <article className={styles.historyRecord} key={record.id}><strong>{record.summary}</strong><span>{record.action} · {new Date(record.createdAt).toLocaleString()} · sensitive values omitted</span></article>)}
          </div>
        </>
      )}
    </section>
  );
}

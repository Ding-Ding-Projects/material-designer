import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../i18n';
import { useRegexSearch } from './regex/useRegexSearch';
import { RegexSearchField } from './regex/RegexSearchField';
import styles from './AuthenticatorDestination.module.css';

type AuthenticatorTab = 'codes' | 'register' | 'history';
type Entry = { id: string; issuer: string; account: string; group: string; code: string; nextCode: string; remaining: number };

const EMPTY_ENTRIES: Entry[] = [];

export function AuthenticatorDestination() {
  const { locale, languageMode } = useI18n();
  const [tab, setTab] = useState<AuthenticatorTab>(() => {
    try { const persisted = typeof window !== 'undefined' ? window.localStorage.getItem('material-designer:authenticator-tab') : null; return persisted === 'register' || persisted === 'history' || persisted === 'codes' ? persisted : 'codes'; } catch { return 'codes'; }
  });
  const [entries] = useState<Entry[]>(EMPTY_ENTRIES);
  const [query, setQuery] = useState('');
  const [historyQuery, setHistoryQuery] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [vaultAvailable, setVaultAvailable] = useState<boolean | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const search = useRegexSearch(query, setQuery);
  const historySearch = useRegexSearch(historyQuery, setHistoryQuery);
  const cantonese = locale.toLowerCase().startsWith('zh');
  const bilingual = languageMode === 'bilingual';
  const text = (english: string, chinese: string) => bilingual ? `${english} · ${chinese}` : cantonese ? chinese : english;
  const filtered = useMemo(() => entries.filter((entry) => search.matches(`${entry.issuer} ${entry.account} ${entry.group}`)), [entries, search.matches]);
  useEffect(() => {
    let active = true;
    const probe = window.openDesignDesktop?.authenticatorVaultStatus;
    if (!probe) { setVaultAvailable(false); return () => { active = false; }; }
    void probe().then((result) => { if (active) setVaultAvailable(result.available); }).catch(() => { if (active) setVaultAvailable(false); });
    return () => { active = false; };
  }, []);
  const vaultLabel = vaultAvailable === true
    ? text('Credential vault: available', '憑證保管庫：可以使用')
    : vaultAvailable === false
      ? text('Credential vault: unavailable', '憑證保管庫：未能使用')
      : text('Credential vault: checking', '憑證保管庫：檢查中');
  const selectTab = (next: AuthenticatorTab) => { setTab(next); try { localStorage.setItem('material-designer:authenticator-tab', next); } catch { /* private storage is optional */ } };

  return (
    <section className={styles.surface} aria-labelledby="authenticator-title" data-testid="authenticator-destination">
      <header className={styles.header}>
        <div><p className={styles.eyebrow}>{text('Local authenticator', '本機驗證器')}</p><h1 id="authenticator-title">{text('Authenticator', '驗證器')}</h1><p className={styles.lede}>{text('Codes stay on this computer. No account, sync, telemetry, or network route is used.', '驗證碼只留喺呢部電腦，唔需要帳戶、同步、遙測或者網絡。')}</p></div>
        <span className={styles.vaultState} role="status">{vaultLabel}</span>
      </header>
      <nav className={styles.tabs} role="tablist" aria-label={text('Authenticator sections', '驗證器分頁')}>
        {(['codes', 'register', 'history'] as const).map((item) => <button key={item} type="button" role="tab" aria-selected={tab === item} className={tab === item ? styles.tabActive : styles.tab} onClick={() => selectTab(item)}>{item === 'codes' ? text('Codes', '驗證碼') : item === 'register' ? text('Register', '登記') : text('History', '歷史')}</button>)}
      </nav>
      {tab === 'codes' ? (
        <div className={styles.panel} role="tabpanel">
          <div className={styles.searchRow}><RegexSearchField search={search} fieldLabel={text('Search authenticator entries', '搜尋驗證器項目')} placeholder={text('Search issuer, account, or group', '搜尋發行者、帳戶或群組')} ariaLabel={text('Search authenticator entries', '搜尋驗證器項目')} ariaControls="authenticator-entry-list" testId="authenticator-search" /></div>
          <div className={styles.entryActions} aria-label={text('Authenticator list actions', '驗證器清單動作')}>
            <button type="button" disabled={entries.length === 0} title={text('There are no entries to select.', '暫時未有項目可以選擇。')}>{text('Select all', '全部選擇')}</button>
            <button type="button" disabled={entries.length === 0} title={text('There are no entries to group.', '暫時未有項目可以分組。')}>{text('Group selected', '將選擇項目分組')}</button>
            <button type="button" disabled={entries.length < 2} title={text('At least two entries are required to reorder.', '最少需要兩個項目先可以重新排序。')}>{text('Reorder selected', '重新排列選擇項目')}</button>
            <button type="button" disabled={entries.length === 0} title={text('There are no entries to remove.', '暫時未有項目可以移除。')}>{text('Remove selected', '移除選擇項目')}</button>
          </div>
          {filtered.length === 0 ? <div className={styles.empty} role="status"><strong>{text('No authenticator entries yet', '暫時未有驗證器項目')}</strong><span>{text('Register one locally, then its current code, next code, and text countdown will appear here.', '喺本機登記之後，當前碼、下一個碼同文字倒數會喺呢度出現。')}</span><button type="button" onClick={() => selectTab('register')}>{text('Register an entry', '登記項目')}</button></div> : <div id="authenticator-entry-list" className={styles.entryList}>{filtered.map((entry) => <article className={styles.entry} key={entry.id}><div><h2>{entry.issuer}</h2><p>{entry.account} · {entry.group}</p></div><strong aria-label={text('Current code', '當前驗證碼')}>{entry.code}</strong><span>{text(`Next ${entry.nextCode}, ${entry.remaining} seconds remaining`, `下一個 ${entry.nextCode}，仲有 ${entry.remaining} 秒`)}</span><button type="button" onClick={() => void navigator.clipboard?.writeText(entry.code.replace(/\s+/g, ''))}>{text('Copy current code', '複製當前驗證碼')}</button></article>)}</div>}
        </div>
      ) : null}
      {tab === 'register' ? (
        <div className={styles.panel} role="tabpanel">
          <div className={styles.registrationGrid}>
            <label>{text('Paste an otpauth URI', '貼上 otpauth URI')}<textarea aria-label={text('Paste an otpauth URI', '貼上 otpauth URI')} placeholder="otpauth://totp/..." /></label>
            <label>{text('Manual Base32 secret', '手動 Base32 密鑰')}<input aria-label={text('Manual Base32 secret', '手動 Base32 密鑰')} inputMode="text" autoComplete="off" /></label>
            <label>{text('Issuer', '發行者')}<input aria-label={text('Issuer', '發行者')} /></label>
            <label>{text('Account', '帳戶')}<input aria-label={text('Account', '帳戶')} /></label>
            <label>{text('Algorithm', '演算法')}<select aria-label={text('Algorithm', '演算法')} defaultValue="SHA-1"><option>SHA-1</option><option>SHA-256</option><option>SHA-512</option></select></label>
            <label>{text('Digits', '位數')}<select aria-label={text('Digits', '位數')} defaultValue="6"><option>6</option><option>7</option><option>8</option></select></label>
            <label>{text('Period in seconds', '週期秒數')}<input aria-label={text('Period in seconds', '週期秒數')} type="number" min="1" max="86400" defaultValue="30" /></label>
            <label>{text('Current code confirmation', '當前驗證碼確認')}<input aria-label={text('Current code confirmation', '當前驗證碼確認')} inputMode="numeric" autoComplete="one-time-code" /></label>
          </div>
          <div className={styles.importActions}>
            <label className={styles.filePicker}>{text('Choose QR image or JSON file', '選擇 QR 圖片或 JSON 檔案')}<input type="file" accept="image/*,.json" onChange={(event) => setSelectedFile(event.currentTarget.files?.[0]?.name ?? null)} />{selectedFile ? <span role="status">{text(`Selected ${selectedFile}`, `已選擇 ${selectedFile}`)}</span> : null}</label>
            <button type="button" disabled title={text('Camera QR capture is unavailable until a local camera decoder is connected.', '本機相機解碼器接通前，鏡頭 QR 擷取未能使用。')} onClick={() => setNotice(text('Camera QR capture is unavailable on this computer.', '呢部電腦未能使用鏡頭 QR 擷取。'))}>{text('Use camera', '使用鏡頭')}</button>
            <button type="button" disabled title={text('The desktop credential vault is unavailable.', '桌面憑證保管庫未能使用。')}>{text('Confirm and arm entry', '確認並啟用項目')}</button>
          </div>
          <p className={styles.disclosure}>{text('A current code is required before an entry is armed. The desktop host must provide an operating-system credential vault; no plaintext fallback is available.', '啟用項目前必須確認當前驗證碼。桌面主機必須提供作業系統憑證保管庫，唔會使用明文後備方案。')}</p>
        </div>
      ) : null}
      {tab === 'history' ? (
        <div className={styles.panel} role="tabpanel">
          <div className={styles.historyFilters}>
            <RegexSearchField search={historySearch} fieldLabel={text('Search history', '搜尋歷史')} placeholder={text('Search actions and labels', '搜尋動作同標籤')} ariaLabel={text('Search history', '搜尋歷史')} testId="authenticator-history-search" />
            <label>{text('From date', '開始日期')}<input type="date" aria-label={text('From date', '開始日期')} disabled title={text('Protected history bridge unavailable.', '受保護歷史橋接未能使用。')} /></label>
            <label>{text('To date', '結束日期')}<input type="date" aria-label={text('To date', '結束日期')} disabled title={text('Protected history bridge unavailable.', '受保護歷史橋接未能使用。')} /></label>
            <label>{text('Filter by action', '按動作篩選')}<select aria-label={text('Filter by action', '按動作篩選')} disabled><option>{text('All recorded actions', '所有已記錄動作')}</option><option>created</option><option>updated</option><option>deleted</option><option>restored</option><option>settings changed</option></select></label>
          </div>
          <div className={styles.historyActions} aria-label={text('Protected history actions', '受保護歷史動作')}>
            {['Inspect diff', 'Restore revision', 'Set retention', 'Export redacted', 'Export sensitive'].map((action) => <button key={action} type="button" disabled title={text('Protected history bridge unavailable.', '受保護歷史橋接未能使用。')}>{text(action, action === 'Inspect diff' ? '檢視差異' : action === 'Restore revision' ? '還原修訂' : action === 'Set retention' ? '設定保留期限' : action === 'Export redacted' ? '匯出刪減版' : '匯出敏感資料')}</button>)}
          </div>
          <div className={styles.empty}><strong>{text('History manager is protected', '歷史管理器受保護')}</strong><span>{text('The desktop host must unlock this manager before date, action, text, diff, restore, retention, and export controls can operate. Sensitive export always requires the real in-app super confirmation.', '桌面主機解鎖後，日期、動作、文字、差異、還原、保留期限同匯出控制先可以操作。敏感資料匯出永遠需要應用程式內真正嘅超級確認。')}</span><button type="button" disabled title={text('Protected history bridge unavailable.', '受保護歷史橋接未能使用。')}>{text('Unlock history manager', '解鎖歷史管理器')}</button></div>
        </div>
      ) : null}
      {notice ? <p className={styles.notice} role="alert">{notice}</p> : null}
    </section>
  );
}

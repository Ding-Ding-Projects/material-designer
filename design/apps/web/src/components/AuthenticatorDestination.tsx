import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useI18n } from '../i18n';
import type { OpenDesignHostAuthenticator } from '@open-design/host';
import { useRegexSearch } from './regex/useRegexSearch';
import { RegexSearchField } from './regex/RegexSearchField';
import { DestructiveGate } from './destructive/DestructiveGate';
import styles from './AuthenticatorDestination.module.css';

type AuthenticatorTab = 'codes' | 'register' | 'history';
type Entry = { id: string; issuer: string; account: string; group: string; code: string; nextCode: string; remaining: number };
type HistoryRecord = { id: string; action: string; createdAt: string; summary: string };

type LocalBarcode = { rawValue?: string };
type LocalBarcodeDetector = { detect(source: ImageBitmap | HTMLVideoElement): Promise<LocalBarcode[]> };
type LocalBarcodeDetectorConstructor = new (options?: { formats?: string[] }) => LocalBarcodeDetector;

function localBarcodeDetector(): LocalBarcodeDetector | null {
  const candidate = (globalThis as typeof globalThis & { BarcodeDetector?: LocalBarcodeDetectorConstructor }).BarcodeDetector;
  try { return candidate ? new candidate({ formats: ['qr_code'] }) : null; } catch { return null; }
}

async function decodeLocalQrBlob(blob: Blob): Promise<string> {
  const detector = localBarcodeDetector(); if (!detector || typeof createImageBitmap !== 'function') throw new Error('This computer has no local QR image decoder.');
  const bitmap = await createImageBitmap(blob); try { const [result] = await detector.detect(bitmap); if (!result?.rawValue) throw new Error('The selected image has no readable QR payload.'); return result.rawValue; } finally { bitmap.close(); }
}

declare global {
  interface Window { __od__?: { authenticator?: OpenDesignHostAuthenticator }; }
}

const EMPTY_ENTRIES: Entry[] = [];

export function AuthenticatorDestination() {
  const { locale, languageMode } = useI18n();
  const [tab, setTab] = useState<AuthenticatorTab>(() => {
    try { const persisted = typeof window !== 'undefined' ? window.localStorage.getItem('material-designer:authenticator-tab') : null; return persisted === 'register' || persisted === 'history' || persisted === 'codes' ? persisted : 'codes'; } catch { return 'codes'; }
  });
  const [entries, setEntries] = useState<Entry[]>(EMPTY_ENTRIES);
  const [query, setQuery] = useState('');
  const [historyQuery, setHistoryQuery] = useState('');
  const [historyPassword, setHistoryPassword] = useState('');
  const [historyUnlocked, setHistoryUnlocked] = useState(false);
  const [historyRecords, setHistoryRecords] = useState<HistoryRecord[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [vaultAvailable, setVaultAvailable] = useState<boolean | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [removeGateOpen, setRemoveGateOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState('General');
  const [refreshRevision, setRefreshRevision] = useState(0);
  const [registration, setRegistration] = useState({ uri: '', issuer: '', account: '', secretBase32: '', algorithm: 'SHA-1' as const, digits: 6 as const, period: 30, confirmationCode: '' });
  const [qrPreview, setQrPreview] = useState<{ size: 37 | 41; modules: readonly (readonly boolean[])[] } | null>(null);
  const search = useRegexSearch(query, setQuery);
  const historySearch = useRegexSearch(historyQuery, setHistoryQuery);
  const bridge = typeof window !== 'undefined' ? window.__od__?.authenticator : undefined;
  const cantonese = locale.toLowerCase().startsWith('zh');
  const bilingual = languageMode === 'bilingual';
  const text = (english: string, chinese: string) => bilingual ? `${english} · ${chinese}` : cantonese ? chinese : english;
  const filtered = useMemo(() => entries.filter((entry) => search.matches(`${entry.issuer} ${entry.account} ${entry.group}`)), [entries, search.matches]);
  const listQuery = search.mode === 'regex' ? '' : query;
  useEffect(() => {
    if (!bridge) { setEntries([]); return; }
    let active = true;
    void bridge.list(listQuery).then(async (result) => {
      if (!result.ok) { if (active) setNotice(result.reason); return; }
      const views = await Promise.all(result.entries.map(async (entry) => bridge.view(entry.id)));
      if (!active) return;
      setEntries(views.flatMap((view) => view.ok ? [{ id: view.entry.id, issuer: view.entry.issuer, account: view.entry.account, group: view.entry.group ?? '', code: view.entry.currentCode, nextCode: view.entry.nextCode, remaining: view.entry.secondsRemaining }] : []));
    }).catch(() => { if (active) setNotice(text('Authenticator entries could not be loaded.', '驗證器項目未能載入。')); });
    return () => { active = false; };
  }, [bridge, listQuery, refreshRevision]);
  useEffect(() => {
    if (!bridge) return;
    const timer = window.setInterval(() => {
      void bridge.list(listQuery).then(async (result) => {
        if (!result.ok) return;
        const views = await Promise.all(result.entries.map(async (entry) => bridge.view(entry.id)));
        setEntries(views.flatMap((view) => view.ok ? [{ id: view.entry.id, issuer: view.entry.issuer, account: view.entry.account, group: view.entry.group ?? '', code: view.entry.currentCode, nextCode: view.entry.nextCode, remaining: view.entry.secondsRemaining }] : []));
      }).catch(() => undefined);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [bridge, listQuery]);
  useEffect(() => {
    if (tab !== 'history' || !bridge || !historyUnlocked) return;
    void bridge.historyList({ query: historySearch.mode === 'regex' ? '' : historyQuery }).then((result) => { if (!result.ok) setNotice(result.reason); else setHistoryRecords(result.records); }).catch(() => setNotice(text('Protected history could not be loaded.', '受保護歷史未能載入。')));
  }, [bridge, historyQuery, historySearch.mode, historyUnlocked, tab]);
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
  const updateRegistration = <K extends keyof typeof registration>(key: K, value: (typeof registration)[K]) => setRegistration((current) => ({ ...current, [key]: value }));
  const runBulk = async (action: 'group' | 'reorder' | 'remove') => {
    if (!bridge || selectedIds.length === 0) return;
    const result = action === 'group'
      ? await bridge.setGroup(selectedIds, selectedGroup)
      : action === 'reorder'
        ? await bridge.reorder(selectedIds)
        : await bridge.remove(selectedIds, '');
    setNotice(result.ok ? text('Authenticator list updated locally.', '驗證器清單已喺本機更新。') : result.reason);
    if (result.ok) { setSelectedIds([]); setRefreshRevision((current) => current + 1); }
  };
  const confirmRemove = async () => {
    if (!bridge) return false;
    const issued = await bridge.issueSuperConfirmation('remove authenticator entries', selectedIds);
    if (!issued.ok) { setNotice(issued.reason); return false; }
    const result = await bridge.remove(selectedIds, issued.confirmationToken);
    setNotice(result.ok ? text('Authenticator entries removed locally.', '驗證器項目已喺本機移除。') : result.reason);
    if (result.ok) { setSelectedIds([]); setRefreshRevision((current) => current + 1); }
    return result.ok;
  };
  const submitRegistration = async (event: FormEvent) => {
    event.preventDefault();
    if (!bridge) { setNotice(text('The desktop authenticator bridge is unavailable.', '桌面驗證器橋接未能使用。')); return; }
    const input = registration.uri.trim()
      ? { kind: 'otpauth-uri' as const, value: registration.uri.trim(), confirmationCode: registration.confirmationCode }
      : { kind: 'manual' as const, issuer: registration.issuer.trim(), account: registration.account.trim(), secretBase32: registration.secretBase32.trim(), algorithm: registration.algorithm, digits: registration.digits, period: registration.period, confirmationCode: registration.confirmationCode };
    const result = await bridge.register(input);
    setNotice(result.ok ? text('Authenticator entry armed locally.', '驗證器項目已喺本機啟用。') : result.reason);
    if (result.ok) { setRegistration((current) => ({ ...current, uri: '', issuer: '', account: '', secretBase32: '', confirmationCode: '' })); selectTab('codes'); }
  };
  const importClipboardQr = async () => {
    if (!bridge) { setNotice(text('The desktop authenticator bridge is unavailable.', '桌面驗證器橋接未能使用。')); return; }
    try {
      if (navigator.clipboard.read) {
        for (const item of await navigator.clipboard.read()) for (const type of item.types) if (type.startsWith('image/')) { const uri = await decodeLocalQrBlob(await item.getType(type)); setRegistration((current) => ({ ...current, uri })); setNotice(text('Clipboard QR decoded locally. Confirm the current code to arm it.', '剪貼簿 QR 已喺本機解碼，請確認當前碼先啟用。')); return; }
      }
      const value = await navigator.clipboard.readText(); const result = await bridge.register({ kind: 'qr-clipboard', value, confirmationCode: registration.confirmationCode }); setNotice(result.ok ? text('Authenticator entry armed locally.', '驗證器項目已喺本機啟用。') : result.reason);
    } catch { setNotice(text('Clipboard QR reading is unavailable on this computer.', '呢部電腦未能讀取剪貼簿 QR。')); }
  };
  const importCameraQr = async () => {
    if (!bridge || !navigator.mediaDevices?.getUserMedia) { setNotice(text('Camera QR capture is unavailable on this computer.', '呢部電腦未能使用鏡頭 QR 擷取。')); return; }
    const detector = localBarcodeDetector(); if (!detector) { setNotice(text('This computer has no local camera QR decoder.', '呢部電腦未有本機鏡頭 QR 解碼器。')); return; }
    let stream: MediaStream | null = null; try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }); const video = document.createElement('video'); video.srcObject = stream; await video.play(); const deadline = Date.now() + 3_000; while (Date.now() < deadline) { const [result] = await detector.detect(video); if (result?.rawValue) { setRegistration((current) => ({ ...current, uri: result.rawValue ?? '' })); setNotice(text('Camera QR decoded locally. Confirm the current code to arm it.', '鏡頭 QR 已喺本機解碼，請確認當前碼先啟用。')); return; } await new Promise((resolve) => setTimeout(resolve, 100)); } throw new Error('No QR payload was found before the bounded camera scan ended.'); } catch { setNotice(text('Camera QR capture could not read a local payload.', '鏡頭 QR 擷取未能讀取本機資料。')); } finally { stream?.getTracks().forEach((track) => track.stop()); }
  };
  const generateQrPreview = async () => {
    if (!bridge) { setNotice(text('The desktop authenticator bridge is unavailable.', '桌面驗證器橋接未能使用。')); return; }
    const result = await bridge.qrFor({ issuer: registration.issuer.trim(), account: registration.account.trim(), secretBase32: registration.secretBase32.trim(), algorithm: registration.algorithm, digits: registration.digits, period: registration.period });
    if (result.ok) { setQrPreview({ size: result.size, modules: result.modules }); setNotice(text('Local QR preview generated. Confirm the current code before arming.', '本機 QR 預覽已生成，啟用前請確認當前碼。')); } else setNotice(result.reason);
  };
  const runHistoryAction = async (action: 'diff' | 'restore' | 'retention' | 'redacted' | 'sensitive') => {
    if (!bridge) { setNotice(text('The protected history bridge is unavailable.', '受保護歷史橋接未能使用。')); return; }
    const result = action === 'diff'
      ? await bridge.historyDiff(selectedIds[0] ?? '')
      : action === 'restore'
        ? await bridge.historyRestore(selectedIds[0] ?? '')
        : action === 'retention'
          ? await bridge.historySetRetention('keep-all')
          : action === 'redacted'
            ? await bridge.historyExportRedacted({ query: historyQuery })
            : await bridge.historyExportSensitive({ query: historyQuery }, '');
    if (!result.ok) setNotice(result.reason); else setNotice(text('Protected history action completed locally.', '受保護歷史動作已喺本機完成。'));
  };
  const unlockHistory = async () => {
    if (!bridge) { setNotice(text('The protected history bridge is unavailable.', '受保護歷史橋接未能使用。')); return; }
    const result = await bridge.historyUnlock(historyPassword);
    setNotice(result.ok ? text('History manager unlocked for this session.', '歷史管理器已為今次工作階段解鎖。') : result.reason);
    if (result.ok) { setHistoryUnlocked(true); setHistoryPassword(''); }
  };

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
            <button type="button" disabled={filtered.length === 0} aria-pressed={selectedIds.length === filtered.length && filtered.length > 0} onClick={() => setSelectedIds(filtered.map((entry) => entry.id))} title={text('Select every matching entry.', '選擇所有符合項目。')}>{text('Select all', '全部選擇')}</button>
            <select aria-label={text('Group selected entries', '將選擇項目分組')} value={selectedGroup} onChange={(event) => setSelectedGroup(event.currentTarget.value)}><option>General</option><option>Work</option><option>Personal</option></select>
            <button type="button" disabled={selectedIds.length === 0} onClick={() => void runBulk('group')} title={text('Choose a group, then apply it to the selected entries.', '先選擇群組，再套用到已選項目。')}>{text('Group selected', '將選擇項目分組')}</button>
            <button type="button" disabled={selectedIds.length < 2} onClick={() => void runBulk('reorder')} title={text('At least two entries are required to reorder.', '最少需要兩個項目先可以重新排序。')}>{text('Reorder selected', '重新排列選擇項目')}</button>
            <button type="button" disabled={selectedIds.length === 0} onClick={() => setRemoveGateOpen(true)} title={text('Remove selected entries from the local vault.', '從本機保管庫移除已選項目。')}>{text('Remove selected', '移除選擇項目')}</button>
          </div>
          {filtered.length === 0 ? <div className={styles.empty} role="status"><strong>{text('No authenticator entries yet', '暫時未有驗證器項目')}</strong><span>{text('Register one locally, then its current code, next code, and text countdown will appear here.', '喺本機登記之後，當前碼、下一個碼同文字倒數會喺呢度出現。')}</span><button type="button" onClick={() => selectTab('register')}>{text('Register an entry', '登記項目')}</button></div> : <div id="authenticator-entry-list" className={styles.entryList}>{filtered.map((entry) => <article className={styles.entry} key={entry.id}><label><input type="checkbox" checked={selectedIds.includes(entry.id)} onChange={(event) => setSelectedIds((current) => event.currentTarget.checked ? [...current, entry.id] : current.filter((id) => id !== entry.id))} aria-label={text(`Select ${entry.issuer}`, `選擇 ${entry.issuer}`)} /></label><div><h2>{entry.issuer}</h2><p>{entry.account} · {entry.group}</p></div><strong aria-label={text('Current code', '當前驗證碼')}>{entry.code}</strong><span>{text(`Next ${entry.nextCode}, ${entry.remaining} seconds remaining`, `下一個 ${entry.nextCode}，仲有 ${entry.remaining} 秒`)}</span><button type="button" onClick={() => void navigator.clipboard?.writeText(entry.code.replace(/\s+/g, ''))}>{text('Copy current code', '複製當前驗證碼')}</button></article>)}</div>}
        </div>
      ) : null}
      {tab === 'register' ? (
        <form className={styles.panel} role="tabpanel" onSubmit={(event) => void submitRegistration(event)}>
          <div className={styles.registrationGrid}>
            <label>{text('Paste an otpauth URI', '貼上 otpauth URI')}<textarea aria-label={text('Paste an otpauth URI', '貼上 otpauth URI')} placeholder="otpauth://totp/..." value={registration.uri} onChange={(event) => updateRegistration('uri', event.currentTarget.value)} /></label>
            <label>{text('Manual Base32 secret', '手動 Base32 密鑰')}<input aria-label={text('Manual Base32 secret', '手動 Base32 密鑰')} inputMode="text" autoComplete="off" value={registration.secretBase32} onChange={(event) => updateRegistration('secretBase32', event.currentTarget.value)} /></label>
            <label>{text('Issuer', '發行者')}<input aria-label={text('Issuer', '發行者')} value={registration.issuer} onChange={(event) => updateRegistration('issuer', event.currentTarget.value)} /></label>
            <label>{text('Account', '帳戶')}<input aria-label={text('Account', '帳戶')} value={registration.account} onChange={(event) => updateRegistration('account', event.currentTarget.value)} /></label>
            <label>{text('Algorithm', '演算法')}<select aria-label={text('Algorithm', '演算法')} value={registration.algorithm} onChange={(event) => updateRegistration('algorithm', event.currentTarget.value as typeof registration.algorithm)}><option>SHA-1</option><option>SHA-256</option><option>SHA-512</option></select></label>
            <label>{text('Digits', '位數')}<select aria-label={text('Digits', '位數')} value={String(registration.digits)} onChange={(event) => updateRegistration('digits', Number(event.currentTarget.value) as typeof registration.digits)}><option value="6">6</option><option value="7">7</option><option value="8">8</option></select></label>
            <label>{text('Period in seconds', '週期秒數')}<input aria-label={text('Period in seconds', '週期秒數')} type="number" min="1" max="86400" value={registration.period} onChange={(event) => updateRegistration('period', Number(event.currentTarget.value))} /></label>
            <label>{text('Current code confirmation', '當前驗證碼確認')}<input aria-label={text('Current code confirmation', '當前驗證碼確認')} inputMode="numeric" autoComplete="one-time-code" value={registration.confirmationCode} onChange={(event) => updateRegistration('confirmationCode', event.currentTarget.value)} /></label>
          </div>
          <div className={styles.importActions}>
            <button type="button" disabled={!bridge || vaultAvailable !== true} onClick={() => void generateQrPreview()} title={text('Generate a local QR pairing preview from the entered parameters.', '用已輸入參數生成本機 QR 配對預覽。')}>{text('Create local QR preview', '建立本機 QR 預覽')}</button>
            <label className={styles.filePicker}>{text('Choose QR image or JSON file', '選擇 QR 圖片或 JSON 檔案')}<input type="file" accept="image/*,.json" onChange={(event) => { const file = event.currentTarget.files?.[0]; setSelectedFile(file?.name ?? null); if (!file || file.size > 4 * 1024 * 1024) { if (file) setNotice(text('The selected file exceeds the bounded 4 MB local decoder limit.', '所選檔案超過本機解碼器 4 MB 上限。')); return; } void decodeLocalQrBlob(file).then((uri) => { setRegistration((current) => ({ ...current, uri })); setNotice(text('QR image decoded locally. Confirm the current code to arm it.', 'QR 圖片已喺本機解碼，請確認當前碼先啟用。')); }).catch((error) => setNotice(error instanceof Error ? error.message : text('QR image decoding failed.', 'QR 圖片解碼失敗。'))); }} />{selectedFile ? <span role="status">{text(`Selected ${selectedFile}`, `已選擇 ${selectedFile}`)}</span> : null}</label>
            <button type="button" disabled={!bridge} onClick={() => void importClipboardQr()} title={text('Read a local QR payload from the clipboard.', '從剪貼簿讀取本機 QR 資料。')}>{text('Read clipboard QR', '讀取剪貼簿 QR')}</button>
            <button type="button" onClick={() => void importCameraQr()} title={text('Use the local camera when this computer provides a QR decoder.', '如果呢部電腦提供 QR 解碼器，就使用本機鏡頭。')}>{text('Use camera', '使用鏡頭')}</button>
            <button type="submit" disabled={vaultAvailable !== true || !bridge} title={vaultAvailable === true ? text('A current code is required before the entry is armed.', '啟用項目前必須確認當前驗證碼。') : text('The desktop credential vault is unavailable.', '桌面憑證保管庫未能使用。')}>{text('Confirm and arm entry', '確認並啟用項目')}</button>
          </div>
          {qrPreview ? <div className={styles.qrPreview} role="img" aria-label={text('Local QR pairing preview. The encoded URI remains hidden until deliberate reveal.', '本機 QR 配對預覽，編碼 URI 會保持隱藏直到使用者刻意顯示。')} style={{ gridTemplateColumns: `repeat(${qrPreview.size}, minmax(2px, 1fr))` }}>{qrPreview.modules.flatMap((row, y) => row.map((on, x) => <span key={`${x}-${y}`} className={on ? styles.qrOn : styles.qrOff} aria-hidden />))}</div> : null}
          <p className={styles.disclosure}>{text('A current code is required before an entry is armed. The desktop host must provide an operating-system credential vault; no plaintext fallback is available.', '啟用項目前必須確認當前驗證碼。桌面主機必須提供作業系統憑證保管庫，唔會使用明文後備方案。')}</p>
        </form>
      ) : null}
      {tab === 'history' ? (
        <div className={styles.panel} role="tabpanel">
          <div className={styles.historyUnlock}>
            <label>{text('History password', '歷史密碼')}<input type="password" value={historyPassword} onChange={(event) => setHistoryPassword(event.currentTarget.value)} autoComplete="current-password" aria-label={text('History password', '歷史密碼')} /></label>
            <button type="button" disabled={!bridge || historyPassword.length === 0} onClick={() => void unlockHistory()}>{text('Unlock history manager', '解鎖歷史管理器')}</button>
          </div>
          <div className={styles.historyFilters}>
            <RegexSearchField search={historySearch} fieldLabel={text('Search history', '搜尋歷史')} placeholder={text('Search actions and labels', '搜尋動作同標籤')} ariaLabel={text('Search history', '搜尋歷史')} testId="authenticator-history-search" />
            <label>{text('From date', '開始日期')}<input type="date" aria-label={text('From date', '開始日期')} disabled={!historyUnlocked} title={text('Unlock history before filtering.', '解鎖歷史先可以篩選。')} /></label>
            <label>{text('To date', '結束日期')}<input type="date" aria-label={text('To date', '結束日期')} disabled={!historyUnlocked} title={text('Unlock history before filtering.', '解鎖歷史先可以篩選。')} /></label>
            <label>{text('Filter by action', '按動作篩選')}<select aria-label={text('Filter by action', '按動作篩選')} disabled={!historyUnlocked}><option>{text('All recorded actions', '所有已記錄動作')}</option><option>created</option><option>updated</option><option>deleted</option><option>restored</option><option>settings changed</option></select></label>
          </div>
          {historyRecords.length > 0 ? <div className={styles.entryList} aria-label={text('History records', '歷史紀錄')}>{historyRecords.map((record) => <label className={styles.historyRecord} key={record.id}><input type="checkbox" checked={selectedIds.includes(record.id)} onChange={(event) => setSelectedIds((current) => event.currentTarget.checked ? [...current, record.id] : current.filter((id) => id !== record.id))} aria-label={record.summary} /><span><strong>{record.summary}</strong><small>{record.action} · {record.createdAt}</small></span></label>)}</div> : null}
          <div className={styles.historyActions} aria-label={text('Protected history actions', '受保護歷史動作')}>
            {(['diff', 'restore', 'retention', 'redacted', 'sensitive'] as const).map((action) => { const label = action === 'diff' ? 'Inspect diff' : action === 'restore' ? 'Restore revision' : action === 'retention' ? 'Set retention' : action === 'redacted' ? 'Export redacted' : 'Export sensitive'; const chinese = action === 'diff' ? '檢視差異' : action === 'restore' ? '還原修訂' : action === 'retention' ? '設定保留期限' : action === 'redacted' ? '匯出刪減版' : '匯出敏感資料'; return <button key={action} type="button" disabled={!bridge || !historyUnlocked || (action !== 'retention' && selectedIds.length === 0)} onClick={() => void runHistoryAction(action)} title={text('Protected history is unavailable until its password or factor is verified.', '受保護歷史要先驗證密碼或驗證因素先可以使用。')}>{text(label, chinese)}</button>; })}
          </div>
          <div className={styles.empty}><strong>{text('History manager is protected', '歷史管理器受保護')}</strong><span>{text('The desktop host must unlock this manager before date, action, text, diff, restore, retention, and export controls can operate. Sensitive export always requires the real in-app super confirmation.', '桌面主機解鎖後，日期、動作、文字、差異、還原、保留期限同匯出控制先可以操作。敏感資料匯出永遠需要應用程式內真正嘅超級確認。')}</span><button type="button" disabled title={text('Protected history bridge unavailable.', '受保護歷史橋接未能使用。')}>{text('Unlock history manager', '解鎖歷史管理器')}</button></div>
        </div>
      ) : null}
      {notice ? <p className={styles.notice} role="alert">{notice}</p> : null}
      {removeGateOpen ? <DestructiveGate action={text('Remove authenticator entries', '移除驗證器項目')} target={text('Selected local entries', '已選本機項目')} items={selectedIds} irreversible={false} onConfirm={confirmRemove} onClose={() => setRemoveGateOpen(false)} /> : null}
    </section>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react';

import { RegexSearchField } from '../regex/RegexSearchField';
import { useRegexSearch } from '../regex/useRegexSearch';
import { useI18n } from '../../i18n';
import { copyToClipboard } from '../../lib/copy-to-clipboard';
import type {
  AuthenticatorBridge,
  AuthenticatorCodeView,
  AuthenticatorEntry,
  AuthenticatorResult,
  HistoryRecord,
} from './contracts';
import styles from './AuthenticatorDestination.module.css';

type AuthenticatorTab = 'codes' | 'register' | 'history';
type RegistrationState = {
  uri: string;
  issuer: string;
  account: string;
  secretBase32: string;
  algorithm: 'SHA-1' | 'SHA-256' | 'SHA-512';
  digits: 6 | 7 | 8;
  period: number;
  confirmationCode: string;
};
type CameraSource = { available: boolean; read(): Promise<string> };

export interface AuthenticatorDestinationProps {
  bridge?: AuthenticatorBridge;
  camera?: CameraSource;
  decodeQrImage?: (bytes: Uint8Array) => Promise<string>;
  onRequestRemoval?: (ids: readonly string[]) => Promise<string | null>;
  onRequestSensitiveExport?: (scope: { query?: string }) => Promise<string | null>;
}

const INITIAL_REGISTRATION: RegistrationState = {
  uri: '',
  issuer: '',
  account: '',
  secretBase32: '',
  algorithm: 'SHA-1',
  digits: 6,
  period: 30,
  confirmationCode: '',
};

function bilingualText(english: string, chinese: string, locale: string, languageMode: string): string {
  if (languageMode === 'bilingual') return `${english} · ${chinese}`;
  return locale.toLowerCase().startsWith('zh') ? chinese : english;
}

function isEntry(value: AuthenticatorEntry | AuthenticatorCodeView): value is AuthenticatorCodeView {
  return 'currentCode' in value;
}

function readInitialTab(): AuthenticatorTab {
  if (typeof window === 'undefined') return 'codes';
  try {
    const value = window.localStorage.getItem('material-designer:authenticator-tab');
    return value === 'register' || value === 'history' || value === 'codes' ? value : 'codes';
  } catch {
    return 'codes';
  }
}

export function AuthenticatorDestination({
  bridge,
  camera,
  decodeQrImage,
  onRequestRemoval,
  onRequestSensitiveExport,
}: AuthenticatorDestinationProps) {
  const { locale, languageMode } = useI18n();
  const text = useCallback(
    (english: string, chinese: string) => bilingualText(english, chinese, locale, languageMode),
    [languageMode, locale],
  );
  const [tab, setTab] = useState<AuthenticatorTab>(readInitialTab);
  const [entries, setEntries] = useState<AuthenticatorCodeView[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedGroup, setSelectedGroup] = useState('General');
  const [query, setQuery] = useState('');
  const [historyQuery, setHistoryQuery] = useState('');
  const [historyPassword, setHistoryPassword] = useState('');
  const [historyUnlocked, setHistoryUnlocked] = useState(false);
  const [historyRecords, setHistoryRecords] = useState<HistoryRecord[]>([]);
  const [registration, setRegistration] = useState<RegistrationState>(INITIAL_REGISTRATION);
  const [qrPreview, setQrPreview] = useState<{ uri: string; size: number; modules: readonly (readonly boolean[])[] } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [vaultAvailable, setVaultAvailable] = useState<boolean | null>(null);
  const search = useRegexSearch(query, setQuery);
  const historySearch = useRegexSearch(historyQuery, setHistoryQuery);

  const refresh = useCallback(async () => {
    if (!bridge) {
      setEntries([]);
      setVaultAvailable(false);
      return;
    }
    const listed = await bridge.list(search.mode === 'regex' ? '' : query);
    if (!listed.ok) {
      setNotice(listed.reason);
      return;
    }
    const views = await Promise.all(listed.value.map((entry) => bridge.view(entry.id)));
    setEntries(views.flatMap((result) => (result.ok && isEntry(result.value) ? [result.value] : [])));
  }, [bridge, query, search.mode]);

  useEffect(() => {
    void refresh().catch((error: unknown) => setNotice(error instanceof Error ? error.message : String(error)));
  }, [refresh]);

  useEffect(() => {
    if (!bridge) return undefined;
    let active = true;
    const timer = window.setInterval(() => {
      void bridge.list(search.mode === 'regex' ? '' : query).then(async (listed) => {
        if (!active || !listed.ok) return;
        const views = await Promise.all(listed.value.map((entry) => bridge.view(entry.id)));
        if (active) setEntries(views.flatMap((result) => (result.ok && isEntry(result.value) ? [result.value] : [])));
      }).catch(() => undefined);
    }, 1_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [bridge, query, search.mode]);

  useEffect(() => {
    if (!bridge) {
      setVaultAvailable(false);
      return undefined;
    }
    let active = true;
    void bridge.vaultStatus().then((result) => {
      if (active && result.ok) setVaultAvailable(result.value.available);
    }).catch(() => { if (active) setVaultAvailable(false); });
    return () => { active = false; };
  }, [bridge]);

  useEffect(() => {
    if (tab !== 'history' || !historyUnlocked || !bridge) return;
    void bridge.historyList(historySearch.mode === 'regex' ? '' : historyQuery).then((result) => {
      if (result.ok) setHistoryRecords(result.value);
      else setNotice(result.reason);
    }).catch((error: unknown) => setNotice(error instanceof Error ? error.message : String(error)));
  }, [bridge, historyPassword, historyQuery, historySearch.mode, historyUnlocked, tab]);

  const filteredEntries = useMemo(
    () => entries.filter((entry) => search.matches(`${entry.issuer} ${entry.account} ${entry.group ?? ''}`)),
    [entries, search.matches],
  );
  const vaultLabel = vaultAvailable === true
    ? text('Credential vault: available', '憑證保管庫：可以使用')
    : vaultAvailable === false
      ? text('Credential vault: unavailable', '憑證保管庫：未能使用')
      : text('Credential vault: checking', '憑證保管庫：檢查中');

  const selectTab = (next: AuthenticatorTab) => {
    setTab(next);
    try { window.localStorage.setItem('material-designer:authenticator-tab', next); } catch { /* optional local preference */ }
  };

  const updateRegistration = <K extends keyof RegistrationState>(key: K, value: RegistrationState[K]) => {
    setRegistration((current) => ({ ...current, [key]: value }));
  };

  const resultNotice = (result: AuthenticatorResult<unknown>, successEnglish: string, successChinese: string) => {
    setNotice(result.ok ? text(successEnglish, successChinese) : result.reason);
  };

  const runGroup = async () => {
    if (!bridge || selectedIds.length === 0) return;
    resultNotice(await bridge.setGroup(selectedIds, selectedGroup), 'Selected entries were grouped locally.', '已選項目已喺本機分組。');
    await refresh();
    setSelectedIds([]);
  };

  const runReorder = async () => {
    if (!bridge || selectedIds.length < 2) return;
    resultNotice(await bridge.reorder(selectedIds), 'Selected entries were reordered locally.', '已選項目已喺本機重新排列。');
    await refresh();
  };

  const runRemove = async () => {
    if (!bridge || selectedIds.length === 0 || !onRequestRemoval) {
      setNotice(text('Removal needs the in-app super confirmation.', '移除項目需要應用程式內超級確認。'));
      return;
    }
    const confirmationToken = await onRequestRemoval(selectedIds);
    if (!confirmationToken) return;
    resultNotice(await bridge.remove(selectedIds, confirmationToken), 'Selected entries were removed locally.', '已選項目已喺本機移除。');
    await refresh();
    setSelectedIds([]);
  };

  const submitRegistration = async (event: FormEvent) => {
    event.preventDefault();
    if (!bridge) {
      setNotice(text('The local authenticator bridge is unavailable.', '本機驗證器橋接未能使用。'));
      return;
    }
    const input = registration.uri.trim()
      ? { kind: 'otpauth-uri' as const, value: registration.uri.trim(), confirmationCode: registration.confirmationCode }
      : { kind: 'manual' as const, value: { issuer: registration.issuer.trim(), account: registration.account.trim(), secret: registration.secretBase32.trim(), algorithm: registration.algorithm, digits: registration.digits, period: registration.period }, confirmationCode: registration.confirmationCode };
    const result = await bridge.register(input);
    resultNotice(result, 'Authenticator entry armed locally.', '驗證器項目已喺本機啟用。');
    if (result.ok) {
      setRegistration(INITIAL_REGISTRATION);
      setQrPreview(null);
      selectTab('codes');
      await refresh();
    }
  };

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setNotice(text('The selected QR image is too large.', '選擇嘅 QR 圖像太大。'));
      return;
    }
    try {
      if (file.type === 'application/json' || file.name.toLowerCase().endsWith('.json')) {
        const content = await file.text();
        setRegistration((current) => ({ ...current, uri: content.trim() }));
      } else if (decodeQrImage) {
        const payload = await decodeQrImage(new Uint8Array(await file.arrayBuffer()));
        setRegistration((current) => ({ ...current, uri: payload }));
      } else {
        throw new Error(text('A local QR image decoder is unavailable.', '本機 QR 圖像解碼器未能使用。'));
      }
      setNotice(text('Local QR input loaded. Confirm the current code before arming.', '本機 QR 資料已載入，啟用前請確認當前碼。'));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  };

  const importClipboard = async () => {
    try {
      if (decodeQrImage && navigator.clipboard.read) {
        for (const item of await navigator.clipboard.read()) {
          const imageType = item.types.find((type) => type.startsWith('image/'));
          if (imageType) {
            const payload = await decodeQrImage(new Uint8Array(await (await item.getType(imageType)).arrayBuffer()));
            setRegistration((current) => ({ ...current, uri: payload }));
            setNotice(text('Clipboard QR decoded locally.', '剪貼簿 QR 已喺本機解碼。'));
            return;
          }
        }
      }
      const value = await navigator.clipboard.readText();
      setRegistration((current) => ({ ...current, uri: value.trim() }));
      setNotice(text('Clipboard text loaded. Confirm the current code before arming.', '剪貼簿文字已載入，啟用前請確認當前碼。'));
    } catch {
      setNotice(text('Clipboard QR reading is unavailable on this computer.', '呢部電腦未能讀取剪貼簿 QR。'));
    }
  };

  const importCamera = async () => {
    if (!camera?.available) {
      setNotice(text('Camera QR capture is unavailable on this computer.', '呢部電腦未能使用鏡頭 QR 擷取。'));
      return;
    }
    try {
      const uri = await camera.read();
      setRegistration((current) => ({ ...current, uri }));
      setNotice(text('Camera QR loaded locally.', '鏡頭 QR 已喺本機載入。'));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  };

  const generateQr = async () => {
    if (!bridge) return;
    const result = await bridge.qrFor({ issuer: registration.issuer.trim(), account: registration.account.trim(), secretBase32: registration.secretBase32.trim(), algorithm: registration.algorithm, digits: registration.digits, period: registration.period });
    if (!result.ok) {
      setNotice(result.reason);
      return;
    }
    setQrPreview({ uri: result.value.uri, size: result.value.matrix.size, modules: result.value.matrix.modules });
    setNotice(text('Local QR preview generated. Confirm the current code before arming.', '本機 QR 預覽已生成，啟用前請確認當前碼。'));
  };

  const generateSecret = async () => {
    if (!bridge) return;
    const result = await bridge.generateSecret();
    if (result.ok) {
      setRegistration((current) => ({ ...current, secretBase32: result.value.secretBase32 }));
      setNotice(text('A fresh secret was generated locally. It is shown only for this pairing.', '本機已生成新密鑰，只會喺今次配對顯示。'));
    } else setNotice(result.reason);
  };

  const unlockHistory = async () => {
    if (!bridge) return;
    const result = await bridge.historyUnlock(historyPassword);
    resultNotice(result, 'Protected history unlocked for this session.', '受保護歷史已為今次工作階段解鎖。');
    if (result.ok) {
      setHistoryUnlocked(true);
      setHistoryPassword('');
    }
  };

  const exportRedactedHistory = async () => {
    if (!bridge) return;
    resultNotice(await bridge.historyExportRedacted(historyQuery), 'Redacted history export prepared.', '已準備刪除敏感資料嘅歷史匯出。');
  };

  return (
    <section className={styles.surface} aria-labelledby="authenticator-title" data-testid="authenticator-destination">
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>{text('Local authenticator', '本機驗證器')}</p>
          <h1 className={styles.title} id="authenticator-title">{text('Authenticator', '驗證器')}</h1>
          <p className={styles.lede}>{text('Codes stay on this computer. No account, sync, telemetry, or network route is used.', '驗證碼只留喺呢部電腦，唔需要帳戶、同步、遙測或者網絡。')}</p>
        </div>
        <span className={styles.vaultState} role="status">{vaultLabel}</span>
      </header>

      <nav className={styles.tabs} role="tablist" aria-label={text('Authenticator sections', '驗證器分頁')}>
        {(['codes', 'register', 'history'] as const).map((item) => (
          <button key={item} className={tab === item ? styles.tabActive : styles.tab} type="button" role="tab" aria-selected={tab === item} aria-controls={`authenticator-panel-${item}`} onClick={() => selectTab(item)}>
            {item === 'codes' ? text('Codes', '驗證碼') : item === 'register' ? text('Register', '登記') : text('History', '歷史')}
          </button>
        ))}
      </nav>

      {tab === 'codes' ? (
        <div className={styles.panel} role="tabpanel" id="authenticator-panel-codes">
          <div className={styles.searchRow}>
            <RegexSearchField search={search} fieldLabel={text('Search authenticator entries', '搜尋驗證器項目')} placeholder={text('Search issuer, account, or group', '搜尋發行者、帳戶或群組')} ariaLabel={text('Search authenticator entries', '搜尋驗證器項目')} ariaControls="authenticator-entry-list" testId="authenticator-search" />
          </div>
          <div className={styles.entryActions} aria-label={text('Authenticator list actions', '驗證器清單動作')}>
            <button type="button" disabled={filteredEntries.length === 0} aria-pressed={selectedIds.length === filteredEntries.length && filteredEntries.length > 0} onClick={() => setSelectedIds(filteredEntries.map((entry) => entry.id))}>{text('Select all matching', '選擇所有符合項目')}</button>
            <button type="button" onClick={() => setSelectedIds([])} disabled={selectedIds.length === 0}>{text('Clear selection', '清除選擇')}</button>
            <label className={styles.field}>
              <span>{text('Group', '群組')}</span>
              <select aria-label={text('Group selected entries', '將選擇項目分組')} value={selectedGroup} onChange={(event) => setSelectedGroup(event.currentTarget.value)}><option>General</option><option>Work</option><option>Personal</option></select>
            </label>
            <button type="button" disabled={selectedIds.length === 0} onClick={() => void runGroup()}>{text('Group selected', '將選擇項目分組')}</button>
            <button type="button" disabled={selectedIds.length < 2} onClick={() => void runReorder()}>{text('Reorder selected', '重新排列選擇項目')}</button>
            <button type="button" disabled={selectedIds.length === 0} onClick={() => void runRemove()}>{text('Remove selected', '移除選擇項目')}</button>
          </div>
          {filteredEntries.length === 0 ? (
            <div className={styles.empty} role="status"><strong>{text('No authenticator entries yet', '暫時未有驗證器項目')}</strong><span>{text('Register one locally, then its current code, next code, and text countdown will appear here.', '喺本機登記之後，當前碼、下一個碼同文字倒數會喺呢度出現。')}</span><button type="button" onClick={() => selectTab('register')}>{text('Register an entry', '登記項目')}</button></div>
          ) : (
            <div className={styles.entryList} id="authenticator-entry-list">
              {filteredEntries.map((entry) => (
                <article className={styles.entry} key={entry.id}>
                  <input type="checkbox" checked={selectedIds.includes(entry.id)} onChange={(event) => setSelectedIds((current) => event.currentTarget.checked ? [...current, entry.id] : current.filter((id) => id !== entry.id))} aria-label={text(`Select ${entry.issuer}`, `選擇 ${entry.issuer}`)} />
                  <div><h2>{entry.issuer}</h2><p>{entry.account} · {entry.group ?? text('General', '一般')}</p></div>
                  <strong aria-label={text('Current code', '當前驗證碼')}>{entry.currentCode}</strong>
                  <span>{text(`Next ${entry.nextCode}, ${entry.secondsRemaining} seconds remaining`, `下一個 ${entry.nextCode}，仲有 ${entry.secondsRemaining} 秒`)}</span>
                  {entry.clockWarning ? <span className={styles.error} role="alert">{entry.clockWarning}</span> : null}
                  <button type="button" onClick={() => void (bridge ? bridge.copyCurrentCode(entry.id).then((result) => resultNotice(result, 'Current code copied.', '當前驗證碼已複製。')) : copyToClipboard(entry.currentCode.replace(/\s+/gu, '')).then((ok) => setNotice(ok ? text('Current code copied.', '當前驗證碼已複製。') : text('Copy was unavailable.', '未能複製。'))))}>{text('Copy current code', '複製當前驗證碼')}</button>
                </article>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {tab === 'register' ? (
        <form className={styles.panel} role="tabpanel" id="authenticator-panel-register" onSubmit={(event) => void submitRegistration(event)}>
          <label className={styles.fileField}><span>{text('Load a local QR image or otpauth JSON', '載入本機 QR 圖像或 otpauth JSON')}</span><input type="file" accept="image/*,.json,application/json" onChange={(event) => void importFile(event.currentTarget.files?.[0])} /><small>{text('The file stays on this computer and is decoded locally.', '檔案只留喺呢部電腦，並喺本機解碼。')}</small></label>
          <div className={styles.registrationActions}><button className={styles.secondary} type="button" onClick={() => void importClipboard()}>{text('Read clipboard QR', '讀取剪貼簿 QR')}</button><button className={styles.secondary} type="button" onClick={() => void importCamera()}>{text('Use camera QR', '使用鏡頭 QR')}</button></div>
          <div className={styles.registrationGrid}>
            <label className={styles.field}><span>{text('Paste an otpauth URI', '貼上 otpauth URI')}</span><textarea aria-label={text('Paste an otpauth URI', '貼上 otpauth URI')} placeholder="otpauth://totp/..." value={registration.uri} onChange={(event) => updateRegistration('uri', event.currentTarget.value)} /></label>
            <label className={styles.field}><span>{text('Manual Base32 secret', '手動 Base32 密鑰')}</span><input aria-label={text('Manual Base32 secret', '手動 Base32 密鑰')} autoComplete="off" value={registration.secretBase32} onChange={(event) => updateRegistration('secretBase32', event.currentTarget.value)} /></label>
            <label className={styles.field}><span>{text('Issuer', '發行者')}</span><input value={registration.issuer} onChange={(event) => updateRegistration('issuer', event.currentTarget.value)} /></label>
            <label className={styles.field}><span>{text('Account', '帳戶')}</span><input value={registration.account} onChange={(event) => updateRegistration('account', event.currentTarget.value)} /></label>
            <label className={styles.field}><span>{text('Algorithm', '演算法')}</span><select value={registration.algorithm} onChange={(event) => updateRegistration('algorithm', event.currentTarget.value as RegistrationState['algorithm'])}><option>SHA-1</option><option>SHA-256</option><option>SHA-512</option></select></label>
            <label className={styles.field}><span>{text('Digits', '位數')}</span><select value={registration.digits} onChange={(event) => updateRegistration('digits', Number(event.currentTarget.value) as RegistrationState['digits'])}><option value={6}>6</option><option value={7}>7</option><option value={8}>8</option></select></label>
            <label className={styles.field}><span>{text('Period in seconds', '週期秒數')}</span><input type="number" min={1} max={86400} step={1} value={registration.period} onChange={(event) => updateRegistration('period', Number(event.currentTarget.value))} /></label>
            <label className={styles.field}><span>{text('Current code confirmation', '當前驗證碼確認')}</span><input inputMode="numeric" pattern="[0-9]{6,8}" maxLength={8} value={registration.confirmationCode} onChange={(event) => updateRegistration('confirmationCode', event.currentTarget.value)} /></label>
          </div>
          <div className={styles.registrationActions}><button type="button" className={styles.secondary} disabled={vaultAvailable === false} onClick={() => void generateSecret()}>{text('Generate local secret', '生成本機密鑰')}</button><button type="button" className={styles.secondary} disabled={vaultAvailable === false} onClick={() => void generateQr()}>{text('Generate local QR preview', '生成本機 QR 預覽')}</button><button type="submit" disabled={vaultAvailable === false}>{text('Arm entry after confirmation', '確認後啟用項目')}</button></div>
          {qrPreview ? <div className={styles.qrCard}><div><strong>{text('Local QR preview', '本機 QR 預覽')}</strong><p className={styles.qrText}>{text('The QR is rendered in this application. It is not saved or uploaded.', 'QR 喺應用程式內繪製，不會儲存或上載。')}</p><code>{qrPreview.uri}</code></div><div className={styles.qrMatrix} role="img" aria-label={text('QR code for this authenticator pairing', '此驗證器配對用 QR 碼')} style={{ '--qr-size': qrPreview.size } as CSSProperties}>{qrPreview.modules.flatMap((row, y) => row.map((on, x) => <span className={on ? styles.qrCellOn : styles.qrCell} key={`${x}-${y}`} aria-hidden="true" />))}</div></div> : null}
        </form>
      ) : null}

      {tab === 'history' ? (
        <div className={styles.panel} role="tabpanel" id="authenticator-panel-history">
          {!historyUnlocked ? <div className={styles.historyLock}><label className={styles.field}><span>{text('History manager password', '歷史管理器密碼')}</span><input type="password" autoComplete="current-password" value={historyPassword} onChange={(event) => setHistoryPassword(event.currentTarget.value)} /></label><button type="button" onClick={() => void unlockHistory()}>{text('Unlock history', '解鎖歷史')}</button></div> : <><div className={styles.historyToolbar}><RegexSearchField search={historySearch} fieldLabel={text('Search protected history', '搜尋受保護歷史')} ariaLabel={text('Search protected history', '搜尋受保護歷史')} testId="authenticator-history-search" /><button type="button" onClick={() => void exportRedactedHistory()}>{text('Export redacted history', '匯出刪除敏感資料嘅歷史')}</button>{onRequestSensitiveExport ? <button type="button" onClick={() => void onRequestSensitiveExport({ query: historyQuery })}>{text('Export sensitive history', '匯出敏感歷史')}</button> : null}</div><div className={styles.historyList}>{historyRecords.length === 0 ? <p className={styles.notice} role="status">{text('No protected history records match.', '未有符合嘅受保護歷史記錄。')}</p> : historyRecords.map((record) => <article className={styles.historyRecord} key={record.id}><strong>{record.summary}</strong><span>{record.action} · {new Date(record.createdAt).toLocaleString(locale)} · {text('sensitive values omitted', '敏感值已省略')}</span></article>)}</div></>}
        </div>
      ) : null}
      {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
    </section>
  );
}

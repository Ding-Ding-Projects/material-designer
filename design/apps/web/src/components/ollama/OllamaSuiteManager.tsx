import { useCallback, useEffect, useMemo, useState } from 'react';

import { Icon } from '../Icon';
import { RegexSearchField } from '../regex/RegexSearchField';
import { useRegexSearch } from '../regex/useRegexSearch';
import {
  attachmentCapability,
  collectCatalog,
  computeHardwareFit,
  createOllamaSuiteClient,
  markCatalogStaleness,
  parseCatalogSnapshot,
  reconcileInstalledModels,
  validateHarnessProfile,
  type OllamaCatalogSnapshot,
  type OllamaHardwareFacts,
  type OllamaHarnessProfile,
  type OllamaModelVariant,
  type OllamaPullRecord,
  type OllamaRuntimeStatus,
} from '../../runtime/ollama-suite';
import styles from './OllamaSuiteManager.module.css';

type SuiteTab = 'store' | 'pulls' | 'chat' | 'harness' | 'recovery';
type CopyMode = 'english' | 'cantonese' | 'bilingual';

const TAB_LABELS: Record<SuiteTab, string> = {
  store: 'Model Store',
  pulls: 'Pull queue',
  chat: 'Local chat',
  harness: 'Harness profiles',
  recovery: 'Recovery help',
};

const FIT_LABELS = {
  'runs-well': 'Runs well',
  'runs-with-limits': 'Runs with limits',
  unlikely: 'Unlikely',
  unknown: 'Unknown',
} as const;

function useSuiteCopy() {
  const [mode, setMode] = useState<CopyMode>('english');
  useEffect(() => {
    const saved = window.localStorage.getItem('material-designer.ollama.language');
    if (saved === 'english' || saved === 'cantonese' || saved === 'bilingual') setMode(saved);
  }, []);
  const choose = useCallback((next: CopyMode) => {
    setMode(next);
    window.localStorage.setItem('material-designer.ollama.language', next);
  }, []);
  const text = useCallback((english: string, cantonese: string) => {
    if (mode === 'cantonese') return cantonese;
    if (mode === 'bilingual') return `${english} · ${cantonese}`;
    return english;
  }, [mode]);
  return { mode, choose, text };
}

function readableError(error: { message: string } | null): string {
  return error?.message ?? 'No diagnostic is available.';
}

async function readNdjson(
  body: ReadableStream<Uint8Array> | null,
  onRecord: (record: Record<string, unknown>) => void,
): Promise<void> {
  if (!body) return;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    buffer += decoder.decode(next.value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines.slice(0, 200)) {
      if (!line.trim()) continue;
      try {
        const value: unknown = JSON.parse(line);
        if (value && typeof value === 'object' && !Array.isArray(value)) onRecord(value as Record<string, unknown>);
      } catch {
        // A partial or provider-authored line is ignored until a complete JSON record arrives.
      }
    }
  }
}

export function OllamaSuiteManager() {
  const client = useMemo(() => createOllamaSuiteClient(), []);
  const { mode, choose, text } = useSuiteCopy();
  const [tab, setTab] = useState<SuiteTab>('store');
  const [runtime, setRuntime] = useState<OllamaRuntimeStatus | null>(null);
  const [hardware, setHardware] = useState<OllamaHardwareFacts | null>(null);
  const [catalog, setCatalog] = useState<OllamaCatalogSnapshot | null>(null);
  const [models, setModels] = useState<OllamaModelVariant[]>([]);
  const [pulls, setPulls] = useState<OllamaPullRecord[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<Array<{ role: string; content: string }>>([]);
  const [chatBusy, setChatBusy] = useState(false);
  const [profiles, setProfiles] = useState<OllamaHarnessProfile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [attachmentNotice, setAttachmentNotice] = useState<string | null>(null);
  const [harnessNotice, setHarnessNotice] = useState<string | null>(null);

  const [storeQuery, setStoreQuery] = useState('');
  const [pullsQuery, setPullsQuery] = useState('');
  const [chatQuery, setChatQuery] = useState('');
  const [harnessQuery, setHarnessQuery] = useState('');
  const [recoveryQuery, setRecoveryQuery] = useState('');
  const storeSearch = useRegexSearch(storeQuery, setStoreQuery);
  const pullsSearch = useRegexSearch(pullsQuery, setPullsQuery);
  const chatSearch = useRegexSearch(chatQuery, setChatQuery);
  const harnessSearch = useRegexSearch(harnessQuery, setHarnessQuery);
  const recoverySearch = useRegexSearch(recoveryQuery, setRecoveryQuery);
  const activeSearch = { store: storeSearch, pulls: pullsSearch, chat: chatSearch, harness: harnessSearch, recovery: recoverySearch }[tab];

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    const runtimeResult = await client.runtime();
    if (runtimeResult.ok) setRuntime(runtimeResult.value);
    else setError(readableError(runtimeResult.error));
    const hardwareResult = await client.hardware();
    if (hardwareResult.ok) setHardware(hardwareResult.value);
    const hardwareForFit = hardwareResult.ok ? hardwareResult.value : hardware;
    const installedResult = await client.installed();
    const installedTags = installedResult.ok ? installedResult.value.tags : [];
    const runningTags = installedResult.ok ? installedResult.value.running : [];
    const pullResult = await client.pulls();
    if (pullResult.ok) setPulls(pullResult.value.records);
    const catalogResult = await collectCatalog((token, signal) => client.catalogPage(token, signal).then((result) => result.ok ? result.value : Promise.reject(new Error(result.error.message))), new AbortController().signal);
    if (catalogResult.ok) {
      const next = markCatalogStaleness(catalogResult.value);
      setCatalog(next);
      window.localStorage.setItem('material-designer.ollama.catalog-cache', JSON.stringify(next));
      const reconciled = reconcileInstalledModels(next.variants, installedTags, runningTags);
      setModels(reconciled.map((item) => {
        const fit = computeHardwareFit(item, hardwareForFit ?? { ramBytes: null, vramBytes: null, freeDiskBytes: null, architecture: null, backendSupported: null, backend: null, driver: null });
        return { ...item, fit: fit.verdict, fitEvidence: fit.evidence };
      }));
      setSelectedModel((current) => current || reconciled[0]?.tag || '');
    } else if (!catalogResult.ok) {
      setError(readableError(catalogResult.error));
    }
    setRefreshing(false);
  }, [client, hardware]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('material-designer.ollama.catalog-cache');
      if (raw) {
        const cached = parseCatalogSnapshot(JSON.parse(raw));
        if (cached.ok) {
          const snapshot = markCatalogStaleness(cached.value);
          setCatalog(snapshot);
          setModels(snapshot.variants);
        }
      }
    } catch {
      // Invalid cache is treated as absent and never blocks a fresh refresh.
    }
    void refresh();
    try {
      const raw = window.localStorage.getItem('material-designer.ollama.harness-profiles');
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) setProfiles(parsed.flatMap((item) => {
          const validated = validateHarnessProfile(item);
          return validated.ok ? [validated.value] : [];
        }));
      }
    } catch {
      // Invalid local profiles are discarded, while the live runtime stays usable.
    }
  }, [refresh]);

  const filteredModels = models.filter((item) => activeSearch.matches(`${item.tag} ${item.family ?? ''} ${item.quantization ?? ''} ${FIT_LABELS[item.fit]}`));
  const filteredPulls = pulls.filter((item) => activeSearch.matches(`${item.tag} ${item.state} ${item.detail ?? ''}`));
  const filteredProfiles = profiles.filter((item) => activeSearch.matches(`${item.name} ${item.executable} ${item.modelTag}`));
  const selectedModelInfo = models.find((model) => model.tag === selectedModel);
  const attachmentEnabled = Boolean(selectedModelInfo?.capabilities.some((capability) => capability === 'vision' || capability === 'text' || capability === 'file'));

  const startPull = useCallback(async (tag: string) => {
    const id = `${tag}-${Date.now()}`;
    const now = new Date().toISOString();
    setPulls((current) => [...current, { id, tag, state: 'pulling', completedBytes: 0, totalBytes: null, detail: null, attempts: 1, queuedAt: now, updatedAt: now, retryable: true }]);
    const result = await client.pull(tag);
    if (!result.ok) {
      setPulls((current) => current.map((pull) => pull.id === id ? { ...pull, state: 'failed', detail: result.error.message } : pull));
      return;
    }
    await readNdjson(result.value, (record) => {
      const status = typeof record.status === 'string' ? record.status : null;
      const completedBytes = typeof record.completed === 'number' ? record.completed : 0;
      const totalBytes = typeof record.total === 'number' ? record.total : null;
      setPulls((current) => current.map((pull) => pull.id === id ? {
        ...pull,
        completedBytes,
        totalBytes,
        detail: status,
        state: status === 'success' ? 'completed' : 'pulling',
      } : pull));
    });
  }, [client]);

  const pullAction = useCallback(async (id: string, action: 'cancel' | 'pause' | 'resume' | 'retry') => {
    const result = await client.pullAction(id, action);
    if (result.ok) setPulls((current) => current.map((pull) => pull.id === id ? result.value : pull));
    else setError(result.error.message);
  }, [client]);

  const sendChat = useCallback(async () => {
    if (!selectedModel || !chatInput.trim() || chatBusy) return;
    const userMessage = { role: 'user', content: chatInput.trim() };
    const nextMessages = [...chatMessages, userMessage];
    setChatMessages([...nextMessages, { role: 'assistant', content: '' }]);
    setChatInput('');
    setChatBusy(true);
    const result = await client.chat(selectedModel, nextMessages);
    if (!result.ok) {
      setError(result.error.message);
      setChatBusy(false);
      return;
    }
    await readNdjson(result.value, (record) => {
      const message = record.message;
      const content = message && typeof message === 'object' && typeof (message as Record<string, unknown>).content === 'string'
        ? (message as Record<string, string>).content
        : typeof record.response === 'string' ? record.response : '';
      if (!content) return;
      setChatMessages((current) => current.map((item, index) => index === current.length - 1 ? { ...item, content: `${item.content}${content}` } : item));
    });
    setChatBusy(false);
  }, [chatBusy, chatInput, chatMessages, client, selectedModel]);

  const saveProfile = useCallback(() => {
    const raw = { id: `profile-${Date.now()}`, name: 'Local harness', executable: 'ollama', arguments: ['run', selectedModel], workingDirectory: null, environmentKeys: [], modelTag: selectedModel, registered: false };
    const validated = validateHarnessProfile(raw);
    if (!validated.ok) { setError(validated.error.message); return; }
    const next = [...profiles, validated.value];
    setProfiles(next);
    window.localStorage.setItem('material-designer.ollama.harness-profiles', JSON.stringify(next));
  }, [profiles, selectedModel]);

  const runHarness = useCallback(async (profile: OllamaHarnessProfile) => {
    setHarnessNotice('Running local preflight…');
    const preflight = await client.harnessPreflight(profile);
    if (!preflight.ok) { setHarnessNotice(preflight.error.message); return; }
    setHarnessNotice(`Preflight ready: ${String(preflight.value.executable)} ${String(preflight.value.modelTag)}. Snapshot will be written before launch.`);
    const launched = await client.harnessLaunch(profile);
    setHarnessNotice(launched.ok ? `Launch health: ${String(launched.value.health ?? 'unknown')}. Snapshot: ${String(launched.value.snapshot ?? 'not reported')}.` : launched.error.message);
  }, [client]);

  return (
    <section className={styles.root} data-testid="ollama-suite-manager" aria-label={text('Local Ollama suite manager', '本機 Ollama 工具箱')}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>{text('Local runtime only', '只用本機服務')}</p>
          <h3>{text('Ollama suite manager', 'Ollama 工具箱')}</h3>
          <p className={styles.lede}>{text('Models, pulls, chat, and allowlisted harnesses stay on this computer.', '模型、拉取、對話同白名單工具全部留喺呢部電腦。')}</p>
        </div>
        <div className={styles.headerActions}>
          <label className={styles.compactField}>
            <span>{text('Language', '語言')}</span>
            <select value={mode} onChange={(event) => choose(event.target.value as CopyMode)} aria-label={text('Ollama language', 'Ollama 語言')}>
              <option value="english">English</option><option value="cantonese">廣東話</option><option value="bilingual">Bilingual · 雙語</option>
            </select>
          </label>
          <button type="button" className={styles.refresh} onClick={() => void refresh()} disabled={refreshing}>
            <Icon name="refresh" size={14} /> {refreshing ? text('Refreshing…', '刷新緊…') : text('Refresh', '刷新')}
          </button>
        </div>
      </header>
      <div className={styles.runtime} role="status" aria-live="polite">
        <span className={`${styles.dot} ${runtime?.state === 'healthy' ? styles.healthy : styles.warn}`} aria-hidden="true" />
        <strong>{runtime?.state ?? 'offline'}</strong>
        <span>{runtime?.version ? `v${runtime.version}` : text('No local runtime version available.', '未有本機服務版本。')}</span>
        <span className={styles.runtimeDetail}>{runtime?.detail ?? error ?? text('Checking the local runtime.', '檢查緊本機服務。')}</span>
      </div>
      <nav className={styles.tabs} role="tablist" aria-label={text('Ollama suite sections', 'Ollama 工具箱分頁')}>
        {(Object.keys(TAB_LABELS) as SuiteTab[]).map((item) => (
          <button key={item} type="button" role="tab" aria-selected={tab === item} className={tab === item ? styles.activeTab : styles.tab} onClick={() => setTab(item)}>{TAB_LABELS[item]}</button>
        ))}
      </nav>
      <div className={styles.searchRow}>
        <RegexSearchField search={activeSearch} fieldLabel={`${TAB_LABELS[tab]} search`} ariaLabel={`${TAB_LABELS[tab]} search`} placeholder="Search this section" testId={`ollama-${tab}-search`} />
        <span className={styles.searchHint}>{activeSearch.mode === 'regex' ? 'Regex enabled' : 'Plain text search'}</span>
      </div>
      {tab === 'store' ? (
        <div className={styles.panel} role="tabpanel">
          <div className={styles.panelHead}><div><h4>{text('Verified model catalog', '已驗證模型目錄')}</h4><p>{catalog ? `${catalog.variants.length} variants, ${catalog.pageCount} page(s), ${catalog.complete ? 'complete' : 'incomplete'}${catalog.stale ? ', stale' : ''}.` : text('No verified catalog yet.', '未有已驗證目錄。')}</p></div><span className={styles.badge}>{catalog?.sourceRevision ?? 'unknown revision'}</span></div>
          <div className={styles.modelGrid}>
            {filteredModels.map((model) => <article key={model.tag} className={styles.modelCard}><div className={styles.modelTitle}><strong>{model.tag}</strong><span className={styles.fit}>{FIT_LABELS[model.fit]}</span></div><p>{model.family ?? 'Family metadata unavailable'} · {model.quantization ?? 'quantization unknown'}</p><small>{model.fitEvidence.join(' ')}</small><button type="button" onClick={() => void startPull(model.tag)} disabled={model.installed || model.fit === 'unlikely' || model.fit === 'unknown' || Boolean(catalog && (catalog.stale || !catalog.complete))}>{model.installed ? 'Installed' : model.fit === 'unlikely' ? 'Unavailable for this hardware' : model.fit === 'unknown' ? 'Hardware evidence required' : catalog?.stale || catalog && !catalog.complete ? 'Refresh verified catalog first' : 'Queue pull'}</button></article>)}
          </div>
          {filteredModels.length === 0 ? <p className={styles.empty}>{text('No models match this search.', '呢個搜尋冇模型。')}</p> : null}
        </div>
      ) : null}
      {tab === 'pulls' ? <div className={styles.panel} role="tabpanel"><h4>{text('Durable pull queue', '可恢復拉取隊列')}</h4>{filteredPulls.map((pull) => <div className={styles.pullRow} key={pull.id}><strong>{pull.tag}</strong><span>{pull.state}</span><progress max={pull.totalBytes ?? undefined} value={pull.totalBytes ? pull.completedBytes : undefined} /><small>{pull.totalBytes ? `${pull.completedBytes} / ${pull.totalBytes} bytes` : pull.detail ?? 'Waiting for byte totals'}</small><span className={styles.pullActions}>{pull.state === 'pulling' ? <button type="button" onClick={() => void pullAction(pull.id, 'pause')}>Pause</button> : null}{pull.state === 'paused' ? <button type="button" onClick={() => void pullAction(pull.id, 'resume')}>Resume</button> : null}{pull.state === 'failed' && pull.retryable ? <button type="button" onClick={() => void pullAction(pull.id, 'retry')}>Retry</button> : null}{['queued', 'pulling', 'paused'].includes(pull.state) ? <button type="button" onClick={() => void pullAction(pull.id, 'cancel')}>Cancel</button> : null}</span></div>)}{filteredPulls.length === 0 ? <p className={styles.empty}>{text('No pulls are queued.', '未有拉取工作。')}</p> : null}</div> : null}
      {tab === 'chat' ? <div className={styles.panel} role="tabpanel"><h4>{text('Local streamed chat', '本機串流對話')}</h4><label className={styles.field}><span>{text('Model tag', '模型標籤')}</span><select value={selectedModel} onChange={(event) => setSelectedModel(event.target.value)}>{models.filter((model) => model.installed).map((model) => <option key={model.tag} value={model.tag}>{model.tag}</option>)}<option value="">No installed model</option></select></label><label className={styles.field}><span>{text('Attachment, capability-gated', '附件，按能力開關')}</span><input type="file" disabled={!attachmentEnabled} aria-describedby="ollama-attachment-status" onChange={(event) => { const file = event.target.files?.[0]; if (!file || !selectedModelInfo) return; const result = attachmentCapability(selectedModelInfo, { mimeType: file.type, bytes: file.size }); setAttachmentNotice(result.reason); }} /><small id="ollama-attachment-status">{attachmentNotice ?? (attachmentEnabled ? text('Choose a bounded local file.', '揀一個有大小限制嘅本機檔案。') : text('This model declares no attachment capability. Filter models to find one that supports this type.', '呢個模型未宣告附件能力，請篩選支援呢種檔案嘅模型。'))}</small></label><div className={styles.chatLog} aria-live="polite">{chatMessages.map((message, index) => <p key={`${message.role}-${index}`}><strong>{message.role}:</strong> {message.content}</p>)}</div><div className={styles.chatComposer}><textarea value={chatInput} onChange={(event) => setChatInput(event.target.value.slice(0, 100_000))} placeholder="Write a local prompt" aria-label="Local chat prompt" /><button type="button" onClick={() => void sendChat()} disabled={chatBusy || !selectedModel || !chatInput.trim()}>{chatBusy ? 'Streaming…' : 'Send'}</button></div></div> : null}
      {tab === 'harness' ? <div className={styles.panel} role="tabpanel"><h4>{text('Allowlisted harness profiles', '白名單工具設定')}</h4><p>{text('Shell syntax and arbitrary environment expansion are refused. The profile preview is local and reviewable before launch.', '會拒絕 shell 語法同任意環境展開，啟動前會喺本機顯示可審閱預覽。')}</p>{harnessNotice ? <p role="status">{harnessNotice}</p> : null}{filteredProfiles.map((profile) => <div className={styles.profileRow} key={profile.id}><strong>{profile.name}</strong><code>{profile.executable} {profile.arguments.join(' ')}</code><span>{profile.modelTag}</span><button type="button" onClick={() => void runHarness(profile)}>Preflight and launch</button></div>)}<button type="button" onClick={saveProfile} disabled={!selectedModel}>Save a safe local profile</button></div> : null}
      {tab === 'recovery' ? <div className={styles.panel} role="tabpanel"><h4>{text('Recovery and offline states', '恢復同離線狀態')}</h4><p>{text('If the local service is missing, stopped, unhealthy, or offline, the last verified catalog and installed model list remain usable. Refresh after starting the service.', '如果本機服務未安裝、停咗、唔健康或者離線，最後一次已驗證目錄同已安裝模型清單仍然用得。開返服務後再刷新。')}</p><ul><li>Missing service: install it locally and return here.</li><li>Stopped service: start the local service and refresh.</li><li>Stale catalog: inspect the revision and refresh when online.</li><li>Unknown hardware fit: provide bounded hardware facts before pulling.</li></ul></div> : null}
    </section>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent as ReactChangeEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';

import { Icon } from '../Icon';
import { RegexSearchField } from '../regex/RegexSearchField';
import { useRegexSearch } from '../regex/useRegexSearch';
import {
  attachmentCapability,
  collectCatalog,
  computeHardwareFit,
  createChatSession,
  createOllamaSuiteClient,
  DEFAULT_CHAT_PARAMETERS,
  OLLAMA_MAX_MESSAGE_CHARS,
  OLLAMA_MAX_NDJSON_LINE_BYTES,
  OLLAMA_MAX_NDJSON_LINES,
  OLLAMA_MAX_RESPONSE_BYTES,
  OLLAMA_MAX_STREAM_BYTES,
  OLLAMA_RESPONSE_READ_TIMEOUT_MS,
  markCatalogStaleness,
  parseCatalogSnapshot,
  parseChatSession,
  reconcileInstalledModels,
  redactChatExport,
  renameChatSession,
  resolveOllamaHostBridge,
  validateHarnessProfile,
  type OllamaCatalogSnapshot,
  type OllamaAttachment,
  type OllamaHardwareFacts,
  type OllamaHarnessProfile,
  type OllamaModelVariant,
  type OllamaPullRecord,
  type OllamaRuntimeStatus,
  type OllamaChatMessage,
  type OllamaChatSession,
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
  signal?: AbortSignal,
): Promise<void> {
  if (!body) return;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let totalBytes = 0;
  let recordCount = 0;
  const consumeLine = (line: string) => {
    if (!line.trim()) return;
    recordCount += 1;
    if (recordCount > OLLAMA_MAX_NDJSON_LINES) throw new Error('The local stream exceeded the bounded record count.');
    if (new TextEncoder().encode(line).byteLength > OLLAMA_MAX_NDJSON_LINE_BYTES) throw new Error('The local stream line exceeded the bounded size.');
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      throw new Error('The local stream returned malformed NDJSON.');
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('The local stream returned a non-object record.');
    onRecord(value as Record<string, unknown>);
  };
  const readWithDeadline = async (): Promise<ReadableStreamReadResult<Uint8Array>> => {
    if (signal?.aborted) throw new Error('The local stream was cancelled.');
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let abortHandler: (() => void) | undefined;
    const timer = new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('The local stream timed out while waiting for data.')), OLLAMA_RESPONSE_READ_TIMEOUT_MS); });
    const aborted = signal ? new Promise<never>((_, reject) => { abortHandler = () => reject(new Error('The local stream was cancelled.')); signal.addEventListener('abort', abortHandler, { once: true }); }) : null;
    try {
      const racers: Array<Promise<ReadableStreamReadResult<Uint8Array>>> = [reader.read(), timer];
      if (aborted) racers.push(aborted);
      return await Promise.race(racers);
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
      if (signal && abortHandler) signal.removeEventListener('abort', abortHandler);
    }
  };
  try {
    while (true) {
      const next = await readWithDeadline();
      if (next.done) break;
      totalBytes += next.value.byteLength;
      if (totalBytes > OLLAMA_MAX_STREAM_BYTES) throw new Error('The local stream exceeded the bounded response size.');
      buffer += decoder.decode(next.value, { stream: true });
      if (new TextEncoder().encode(buffer).byteLength > OLLAMA_MAX_NDJSON_LINE_BYTES) throw new Error('The local stream line exceeded the bounded size.');
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) consumeLine(line);
    }
    buffer += decoder.decode();
    consumeLine(buffer);
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

export function OllamaSuiteManager() {
  const bridgeHint = useMemo(() => resolveOllamaHostBridge((globalThis as { ollamaSuiteBridge?: unknown }).ollamaSuiteBridge), []);
  const client = useMemo(() => bridgeHint.available ? bridgeHint.bridge : createOllamaSuiteClient(), [bridgeHint]);
  const { mode, choose, text } = useSuiteCopy();
  const [tab, setTab] = useState<SuiteTab>('store');
  const [runtime, setRuntime] = useState<OllamaRuntimeStatus | null>(null);
  const [hardware, setHardware] = useState<OllamaHardwareFacts | null>(null);
  const [catalog, setCatalog] = useState<OllamaCatalogSnapshot | null>(null);
  const [models, setModels] = useState<OllamaModelVariant[]>([]);
  const [pulls, setPulls] = useState<OllamaPullRecord[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<OllamaChatMessage[]>([]);
  const [chatSessions, setChatSessions] = useState<OllamaChatSession[]>([]);
  const [chatSessionName, setChatSessionName] = useState('Local chat');
  const historicFileRef = useRef<HTMLInputElement | null>(null);
  const [historicAttachmentTarget, setHistoricAttachmentTarget] = useState<{ messageIndex: number; attachmentIndex: number } | null>(null);
  const [chatAttachments, setChatAttachments] = useState<OllamaAttachment[]>([]);
  const [chatSystemPrompt, setChatSystemPrompt] = useState('');
  const [chatParameters, setChatParameters] = useState(DEFAULT_CHAT_PARAMETERS);
  const [chatSessionId, setChatSessionId] = useState<string | null>(null);
  const [chatBusy, setChatBusy] = useState(false);
  const chatAbortRef = useRef<AbortController | null>(null);
  const pullAbortRef = useRef(new Map<string, AbortController>());
  const [profiles, setProfiles] = useState<OllamaHarnessProfile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [attachmentNotice, setAttachmentNotice] = useState<string | null>(null);
  const [harnessNotice, setHarnessNotice] = useState<string | null>(null);
  const [harnessExecutable, setHarnessExecutable] = useState('');
  const [harnessPreview, setHarnessPreview] = useState<{ profile: OllamaHarnessProfile; value: Record<string, unknown> } | null>(null);
  const [harnessSnapshots, setHarnessSnapshots] = useState<Record<string, string>>({});
  const [hostBridgeAvailable, setHostBridgeAvailable] = useState(bridgeHint.available);
  const [hostBridgeReason, setHostBridgeReason] = useState(bridgeHint.available ? '' : bridgeHint.reason);
  const hardwareRef = useRef<OllamaHardwareFacts | null>(null);
  const selectedModelRef = useRef('');
  selectedModelRef.current = selectedModel;
  const refreshGenerationRef = useRef(0);
  const refreshAbortRef = useRef<AbortController | null>(null);

  useEffect(() => () => {
    chatAbortRef.current?.abort();
    refreshAbortRef.current?.abort();
    pullAbortRef.current.forEach((controller) => controller.abort());
    pullAbortRef.current.clear();
  }, []);

  const [storeQuery, setStoreQuery] = useState('');
  const [pullsQuery, setPullsQuery] = useState('');
  const [chatQuery, setChatQuery] = useState('');
  const [modelPickerQuery, setModelPickerQuery] = useState('');
  const [harnessQuery, setHarnessQuery] = useState('');
  const [recoveryQuery, setRecoveryQuery] = useState('');
  const storeSearch = useRegexSearch(storeQuery, setStoreQuery);
  const pullsSearch = useRegexSearch(pullsQuery, setPullsQuery);
  const chatSearch = useRegexSearch(chatQuery, setChatQuery);
  const modelPickerSearch = useRegexSearch(modelPickerQuery, setModelPickerQuery);
  const harnessSearch = useRegexSearch(harnessQuery, setHarnessQuery);
  const recoverySearch = useRegexSearch(recoveryQuery, setRecoveryQuery);
  const activeSearch = { store: storeSearch, pulls: pullsSearch, chat: chatSearch, harness: harnessSearch, recovery: recoverySearch }[tab];
  const activePanelId = `ollama-panel-${tab}`;

  const refresh = useCallback(async () => {
    const generation = refreshGenerationRef.current + 1;
    refreshGenerationRef.current = generation;
    refreshAbortRef.current?.abort();
    const controller = new AbortController();
    refreshAbortRef.current = controller;
    setRefreshing(true);
    setError(null);
    const runtimeResult = await client.runtime(controller.signal);
    if (generation !== refreshGenerationRef.current) return;
    if (runtimeResult.ok) {
      setRuntime(runtimeResult.value);
      setHostBridgeAvailable(true);
      setHostBridgeReason('');
    } else {
      setHostBridgeAvailable(false);
      setHostBridgeReason(runtimeResult.error.message);
      setError(readableError(runtimeResult.error));
    }
    const hardwareResult = await client.hardware(controller.signal);
    if (generation !== refreshGenerationRef.current) return;
    if (hardwareResult.ok) {
      setHardware(hardwareResult.value);
      hardwareRef.current = hardwareResult.value;
    }
    const hardwareForFit = hardwareResult.ok ? hardwareResult.value : hardwareRef.current;
    const installedResult = await client.installed(controller.signal);
    if (generation !== refreshGenerationRef.current) return;
    const installedTags = installedResult.ok ? installedResult.value.tags : [];
    const runningTags = installedResult.ok ? installedResult.value.running : [];
    const pullResult = await client.pulls(controller.signal);
    if (generation !== refreshGenerationRef.current) return;
    if (pullResult.ok) setPulls(pullResult.value.records);
    const catalogResult = await collectCatalog((token, signal) => client.catalogPage(token, signal, selectedModelRef.current || null).then((result) => result.ok ? result.value : Promise.reject(new Error(result.error.message))), controller.signal);
    if (generation !== refreshGenerationRef.current) return;
    if (catalogResult.ok) {
      const next = markCatalogStaleness(catalogResult.value);
      setCatalog(next);
      window.localStorage.setItem('material-designer.ollama.catalog-cache', JSON.stringify(next));
      const reconciled = reconcileInstalledModels(next.variants, installedTags, runningTags);
      setModels(reconciled.map((item) => {
        const fit = computeHardwareFit(item, hardwareForFit ?? { ramBytes: null, availableRamBytes: null, vramBytes: null, freeDiskBytes: null, architecture: null, backendSupported: null, backend: null, driver: null });
        return { ...item, fit: fit.verdict, fitEvidence: fit.evidence };
      }));
      setSelectedModel((current) => current || reconciled[0]?.tag || '');
    } else if (!catalogResult.ok) {
      setError(readableError(catalogResult.error));
    }
    if (generation === refreshGenerationRef.current) {
      setRefreshing(false);
      refreshAbortRef.current = null;
    }
  }, [client]);

  useEffect(() => {
    if (selectedModel) void refresh();
  }, [refresh, selectedModel]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('material-designer.ollama.catalog-cache');
      if (raw && new TextEncoder().encode(raw).byteLength <= OLLAMA_MAX_RESPONSE_BYTES) {
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
      const sessionRaw = window.localStorage.getItem('material-designer.ollama.chat-sessions') ?? window.localStorage.getItem('material-designer.ollama.chat-session');
      if (sessionRaw && new TextEncoder().encode(sessionRaw).byteLength <= OLLAMA_MAX_RESPONSE_BYTES) {
        const decoded: unknown = JSON.parse(sessionRaw);
        const candidates = Array.isArray(decoded) ? decoded : [decoded];
        if (candidates.length > 100) throw new Error('Chat session cache exceeded its bound.');
        const sessions = candidates.flatMap((item) => {
          const parsed = parseChatSession(item);
          return parsed.ok ? [parsed.value] : [];
        });
        if (sessions.length !== candidates.length) throw new Error('Chat session cache contained an invalid session.');
        setChatSessions(sessions);
        const session = sessions[0];
        if (session) {
          setChatSessionId(session.id);
          setChatSessionName(session.name);
          setChatSystemPrompt(session.systemPrompt);
          setChatParameters(session.parameters);
          setChatMessages(session.messages);
        }
      }
      const raw = window.localStorage.getItem('material-designer.ollama.harness-profiles');
      if (raw && new TextEncoder().encode(raw).byteLength <= OLLAMA_MAX_RESPONSE_BYTES) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length <= 100) {
          const validatedProfiles = parsed.flatMap((item) => {
          const validated = validateHarnessProfile(item);
          return validated.ok ? [validated.value] : [];
          });
          if (validatedProfiles.length !== parsed.length) throw new Error('Harness profile cache contained an invalid profile.');
          setProfiles(validatedProfiles);
        } else if (Array.isArray(parsed)) throw new Error('Harness profile cache exceeded its bound.');
      }
    } catch {
      // Invalid local profiles are discarded, while the live runtime stays usable.
    }
  }, [refresh]);

  useEffect(() => {
    if (!pulls.some((pull) => ['queued', 'pulling', 'paused'].includes(pull.state))) return;
    const timer = window.setInterval(() => {
      void client.pulls().then((result) => { if (result.ok) setPulls(result.value.records); });
    }, 2_000);
    return () => window.clearInterval(timer);
  }, [client, pulls]);

  const filteredModels = models.filter((item) => activeSearch.matches(`${item.tag} ${item.family ?? ''} ${item.quantization ?? ''} ${FIT_LABELS[item.fit]}`));
  const filteredPulls = pulls.filter((item) => activeSearch.matches(`${item.tag} ${item.state} ${item.detail ?? ''}`));
  const filteredProfiles = profiles.filter((item) => activeSearch.matches(`${item.name} ${item.executable} ${item.modelTag}`));
  const filteredChatSessions = chatSessions.filter((item) => chatSearch.matches(`${item.name} ${item.modelTag}`));
  const filteredInstalledModels = models.filter((item) => item.installed && modelPickerSearch.matches(item.tag));
  const selectedModelInfo = models.find((model) => model.tag === selectedModel);
  const attachmentEnabled = Boolean(selectedModelInfo?.capabilities.some((capability) => capability === 'vision' || capability === 'text'));
  const canOperate = hostBridgeAvailable && runtime?.state === 'healthy';

  const startPull = useCallback(async (tag: string) => {
    if (!canOperate) { setError('The local runtime is unavailable; cached models remain read-only.'); return; }
    const id = `${tag}-${Date.now()}`;
    const controller = new AbortController();
    pullAbortRef.current.set(id, controller);
    const now = new Date().toISOString();
    setPulls((current) => [...current, { id, tag, state: 'pulling', completedBytes: 0, totalBytes: null, detail: null, attempts: 1, queuedAt: now, updatedAt: now, retryable: true, providerStatus: 'pulling', rateBytesPerSecond: null, etaSeconds: null, partialOutcome: 'none' }]);
    const result = await client.pull(tag, controller.signal);
    if (!result.ok) {
      setPulls((current) => current.map((pull) => pull.id === id ? { ...pull, state: 'failed', detail: result.error.message } : pull));
      pullAbortRef.current.delete(id);
      return;
    }
    const streamId = result.value.id ?? id;
    if (streamId !== id) {
      setPulls((current) => current.map((pull) => pull.id === id ? { ...pull, id: streamId } : pull));
      pullAbortRef.current.delete(id);
      pullAbortRef.current.set(streamId, controller);
    }
    if (!result.value.stream) {
      setPulls((current) => current.map((pull) => pull.id === streamId ? { ...pull, state: 'queued', providerStatus: 'queued', detail: 'Queued by the daemon; progress will appear here.' } : pull));
      pullAbortRef.current.delete(streamId);
      return;
    }
    try {
      await readNdjson(result.value.stream, (record) => {
        const status = typeof record.status === 'string' ? record.status : null;
        const completedBytes = typeof record.completed === 'number' && Number.isSafeInteger(record.completed) && record.completed >= 0 ? record.completed : 0;
        const totalBytes = typeof record.total === 'number' && Number.isSafeInteger(record.total) && record.total >= 0 ? record.total : null;
        const providerError = status === 'error' || record.error !== undefined;
        setPulls((current) => current.map((pull) => pull.id === streamId ? {
          ...pull,
          completedBytes,
          totalBytes,
          detail: providerError ? 'Provider reported an error.' : status,
          state: status === 'success' ? 'completed' : providerError ? 'failed' : 'pulling',
          providerStatus: status === 'success' ? 'success' : providerError ? 'error' : 'pulling',
          retryable: status !== 'success',
          partialOutcome: status === 'success' ? 'all' : completedBytes > 0 ? 'some' : 'none',
        } : pull));
      }, controller.signal);
    } catch (streamError) {
      setPulls((current) => current.map((pull) => pull.id === streamId ? { ...pull, state: 'failed', providerStatus: 'error', retryable: true, detail: streamError instanceof Error ? streamError.message : 'Pull stream failed.' } : pull));
    } finally {
      if (pullAbortRef.current.get(streamId) === controller) pullAbortRef.current.delete(streamId);
    }
  }, [canOperate, client]);

  const pullAction = useCallback(async (id: string, action: 'cancel' | 'pause' | 'resume' | 'retry') => {
    if (!canOperate) { setError('The local runtime is unavailable; pull controls remain read-only.'); return; }
    const result = await client.pullAction(id, action);
    if (result.ok) setPulls((current) => current.map((pull) => pull.id === id ? result.value : pull));
    else setError(result.error.message);
  }, [canOperate, client]);

  const sendChat = useCallback(async () => {
    if (!canOperate || !selectedModel || !chatInput.trim() || chatBusy) return;
    const controller = new AbortController();
    chatAbortRef.current = controller;
    const userMessage: OllamaChatMessage = { role: 'user', content: chatInput.trim(), attachments: chatAttachments.length ? chatAttachments : undefined };
    const nextMessages = [...chatMessages, userMessage];
    setChatMessages([...nextMessages, { role: 'assistant', content: '' }]);
    setChatInput('');
    setChatAttachments([]);
    setChatBusy(true);
    const result = await client.chat(selectedModel, nextMessages, chatParameters, controller.signal, chatSystemPrompt);
    if (!result.ok) {
      if (!controller.signal.aborted) setError(result.error.message);
      setChatBusy(false);
      chatAbortRef.current = null;
      return;
    }
    let assistantContent = '';
    try {
      await readNdjson(result.value, (record) => {
        if (record.error !== undefined) throw new Error('The local chat provider reported an error.');
        const message = record.message;
        const content = message && typeof message === 'object' && typeof (message as Record<string, unknown>).content === 'string'
          ? (message as Record<string, string>).content
          : typeof record.response === 'string' ? record.response : '';
        if (!content) return;
        if (assistantContent.length + content.length > OLLAMA_MAX_MESSAGE_CHARS) throw new Error('The local chat response exceeded the bounded message size.');
        assistantContent += content;
        setChatMessages((current) => current.map((item, index) => index === current.length - 1 ? { ...item, content: `${item.content}${content}` } : item));
      });
    } catch (streamError) {
      if (!controller.signal.aborted) setError(streamError instanceof Error ? streamError.message : 'The local chat stream could not be read.');
      setChatBusy(false);
      chatAbortRef.current = null;
      return;
    }
    if (!assistantContent) {
      setError('The local chat stream ended without response content.');
      setChatBusy(false);
      chatAbortRef.current = null;
      return;
    }
    if (controller.signal.aborted) {
      setChatBusy(false);
      chatAbortRef.current = null;
      return;
    }
    const existingSession = chatSessions.find((item) => item.id === chatSessionId);
    const session = existingSession ? { ...existingSession } : createChatSession(selectedModel, chatSessionName || 'Local chat');
    session.id = chatSessionId ?? session.id;
    session.name = chatSessionName || session.name || 'Local chat';
    session.modelTag = selectedModel;
    session.systemPrompt = chatSystemPrompt;
    session.parameters = chatParameters;
    session.messages = [...nextMessages, { role: 'assistant', content: assistantContent }];
    session.updatedAt = new Date().toISOString();
    const nextSessions = [...chatSessions.filter((item) => item.id !== session.id), session];
    setChatSessions(nextSessions);
    window.localStorage.setItem('material-designer.ollama.chat-sessions', JSON.stringify(nextSessions.map(redactChatExport)));
    setChatSessionId(session.id);
    setChatSessionName(session.name);
    setChatBusy(false);
    chatAbortRef.current = null;
  }, [canOperate, chatAttachments, chatBusy, chatInput, chatMessages, chatParameters, chatSessionId, chatSessionName, chatSessions, chatSystemPrompt, client, selectedModel]);

  const stopChat = useCallback(() => {
    chatAbortRef.current?.abort();
    chatAbortRef.current = null;
    setChatBusy(false);
  }, []);

  const newChatSession = useCallback(() => {
    const session = createChatSession(selectedModel || 'pending', 'Local chat');
    setChatSessions((current) => {
      const next = [...current, session];
      window.localStorage.setItem('material-designer.ollama.chat-sessions', JSON.stringify(next.map(redactChatExport)));
      return next;
    });
    setChatMessages([]);
    setChatSessionId(session.id);
    setChatSessionName(session.name);
    setChatSystemPrompt('');
    setChatAttachments([]);
    setChatParameters({ ...DEFAULT_CHAT_PARAMETERS });
  }, [selectedModel]);

  const renameCurrentChat = useCallback(() => {
    if (!chatSessionId) return;
    const current = chatSessions.find((item) => item.id === chatSessionId);
    if (!current) return;
    const renamed = renameChatSession(current, chatSessionName);
    if (!renamed.ok) { setError(renamed.error.message); return; }
    const next = chatSessions.map((item) => item.id === chatSessionId ? renamed.value : item);
    setChatSessions(next);
    setChatSessionName(renamed.value.name);
    window.localStorage.setItem('material-designer.ollama.chat-sessions', JSON.stringify(next.map(redactChatExport)));
  }, [chatSessionId, chatSessionName, chatSessions]);

  const selectChatSession = useCallback((session: OllamaChatSession) => {
    setChatSessionId(session.id);
    setChatSessionName(session.name);
    setChatSystemPrompt(session.systemPrompt);
    setChatParameters(session.parameters);
    setChatMessages(session.messages);
  }, []);

  const removeHistoricAttachment = useCallback((messageIndex: number, attachmentIndex: number) => {
    const nextMessages = chatMessages.map((message, index) => index !== messageIndex ? message : { ...message, attachments: (message.attachments ?? []).filter((_, candidate) => candidate !== attachmentIndex) });
    setChatMessages(nextMessages);
    if (chatSessionId) {
      const nextSessions = chatSessions.map((session) => session.id === chatSessionId ? { ...session, messages: nextMessages, updatedAt: new Date().toISOString() } : session);
      setChatSessions(nextSessions);
      window.localStorage.setItem('material-designer.ollama.chat-sessions', JSON.stringify(nextSessions.map(redactChatExport)));
    }
  }, [chatMessages, chatSessionId, chatSessions]);

  const selectHistoricAttachmentFile = useCallback((messageIndex: number, attachmentIndex: number) => {
    setHistoricAttachmentTarget({ messageIndex, attachmentIndex });
    historicFileRef.current?.click();
  }, []);

  const replaceHistoricAttachment = useCallback(async (event: ReactChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const target = historicAttachmentTarget;
    event.target.value = '';
    if (!file || !target) return;
    const result = attachmentCapability(selectedModelInfo ?? { capabilities: [] }, { mimeType: file.type, bytes: file.size });
    setAttachmentNotice(result.reason);
    if (!result.allowed) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)));
    const replacement: OllamaAttachment = { name: file.name.slice(0, 240), mimeType: file.type.slice(0, 120), bytes: file.size, dataBase64: btoa(binary) };
    const nextMessages = chatMessages.map((message, messageIndex) => messageIndex !== target.messageIndex ? message : { ...message, attachments: (message.attachments ?? []).map((attachment, attachmentIndex) => attachmentIndex === target.attachmentIndex ? replacement : attachment) });
    setChatMessages(nextMessages);
    if (chatSessionId) {
      const nextSessions = chatSessions.map((session) => session.id === chatSessionId ? { ...session, messages: nextMessages, updatedAt: new Date().toISOString() } : session);
      setChatSessions(nextSessions);
      window.localStorage.setItem('material-designer.ollama.chat-sessions', JSON.stringify(nextSessions.map(redactChatExport)));
    }
    setHistoricAttachmentTarget(null);
  }, [chatMessages, chatSessionId, chatSessions, historicAttachmentTarget, selectedModelInfo]);

  const handleTabKey = useCallback((event: ReactKeyboardEvent<HTMLButtonElement>, current: SuiteTab) => {
    const tabs = Object.keys(TAB_LABELS) as SuiteTab[];
    const index = tabs.indexOf(current);
    const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (!direction) return;
    event.preventDefault();
    const next = tabs[(index + direction + tabs.length) % tabs.length] ?? tabs[0];
    if (!next) return;
    setTab(next);
    window.setTimeout(() => document.getElementById(`ollama-tab-${next}`)?.focus(), 0);
  }, []);

  const exportChat = useCallback(() => {
    if (!chatSessionId) return;
    const session = chatSessions.find((item) => item.id === chatSessionId) ?? createChatSession(selectedModel, chatSessionName || 'Local chat');
    session.id = chatSessionId;
    session.name = chatSessionName || session.name;
    session.modelTag = selectedModel;
    session.systemPrompt = chatSystemPrompt;
    session.parameters = chatParameters;
    session.messages = chatMessages;
    const blob = new Blob([JSON.stringify(redactChatExport(session), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'local-chat-export.json';
    link.click();
    URL.revokeObjectURL(url);
  }, [chatMessages, chatParameters, chatSessionId, chatSessionName, chatSessions, chatSystemPrompt, selectedModel]);

  const saveProfile = useCallback(async () => {
    if (!canOperate) { setHarnessNotice('The host bridge or local runtime is unavailable; register and launch controls are disabled.'); return; }
    const raw = { id: `profile-${Date.now()}`, name: 'Local harness', executable: harnessExecutable, arguments: ['run', selectedModel], workingDirectory: null, healthUrl: null, environmentKeys: [], modelTag: selectedModel, registered: false };
    const validated = validateHarnessProfile(raw);
    if (!validated.ok) { setError(validated.error.message); return; }
    const registered = await client.harnessRegister(validated.value);
    if (!registered.ok) { setError(registered.error.message); return; }
    const next = [...profiles, registered.value];
    setProfiles(next);
    window.localStorage.setItem('material-designer.ollama.harness-profiles', JSON.stringify(next));
  }, [canOperate, client, harnessExecutable, profiles, selectedModel]);

  const runHarness = useCallback(async (profile: OllamaHarnessProfile) => {
    if (!canOperate) { setHarnessNotice('The host bridge or local runtime is unavailable; preflight is disabled.'); return; }
    setHarnessNotice('Running local preflight…');
    const preflight = await client.harnessPreflight(profile);
    if (!preflight.ok) { setHarnessNotice(preflight.error.message); return; }
    const snapshotId = typeof preflight.value.snapshotId === 'string' ? preflight.value.snapshotId : undefined;
    const preflightNonce = typeof preflight.value.preflightNonce === 'string' ? preflight.value.preflightNonce : undefined;
    const previewProfile = snapshotId || preflightNonce ? { ...profile, ...(snapshotId ? { snapshotId } : {}), ...(preflightNonce ? { preflightNonce } : {}) } : profile;
    if (snapshotId) setHarnessSnapshots((current) => ({ ...current, [profile.id]: snapshotId }));
    setHarnessPreview({ profile: previewProfile, value: preflight.value });
    setHarnessNotice(`Preflight ready: ${String(preflight.value.executable)} ${String(preflight.value.modelTag)}. Review the snapshot and launch explicitly.`);
  }, [canOperate, client]);

  const launchHarness = useCallback(async () => {
    if (!harnessPreview) return;
    setHarnessNotice('Launching the reviewed local profile…');
    const launched = await client.harnessLaunch(harnessPreview.profile);
    setHarnessNotice(launched.ok ? `Launch health: ${String(launched.value.health ?? 'unknown')}. Snapshot: ${String(launched.value.snapshotId ?? 'not reported')}.` : launched.error.message);
    if (launched.ok) {
      if (typeof launched.value.snapshotId === 'string') setHarnessSnapshots((current) => ({ ...current, [harnessPreview.profile.id]: launched.value.snapshotId as string }));
      setHarnessPreview(null);
    }
  }, [client, harnessPreview]);

  const restoreHarness = useCallback(async (profileId: string) => {
    if (!canOperate) { setHarnessNotice('The host bridge or local runtime is unavailable; restore is disabled.'); return; }
    const snapshotId = harnessSnapshots[profileId];
    if (!snapshotId) { setHarnessNotice('No stable snapshot is available for this profile yet. Run preflight first.'); return; }
    setHarnessNotice('Restoring the last local harness snapshot…');
    const restored = await client.harnessRestore(snapshotId);
    setHarnessNotice(restored.ok ? `Snapshot restored: ${String(restored.value.snapshotId ?? snapshotId)}.` : restored.error.message);
  }, [canOperate, client, harnessSnapshots]);

  const discardHarnessPreview = useCallback(() => {
    setHarnessPreview(null);
    setHarnessNotice('Harness preflight dismissed; no process was launched.');
  }, []);

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
        <span data-testid="ollama-host-bridge-state">{hostBridgeAvailable ? text('Host bridge available', '本機橋接可用') : text(`Host bridge unavailable: ${hostBridgeReason || 'no response'}`, `本機橋接未可用：${hostBridgeReason || '未有回應'}`)}</span>
        <strong>{runtime?.state ?? 'offline'}</strong>
        <span>{runtime?.version ? `v${runtime.version}` : text('No local runtime version available.', '未有本機服務版本。')}</span>
        <span className={styles.runtimeDetail}>{runtime?.detail ?? error ?? text('Checking the local runtime.', '檢查緊本機服務。')}</span>
      </div>
      <nav className={styles.tabs} role="tablist" aria-label={text('Ollama suite sections', 'Ollama 工具箱分頁')}>
        {(Object.keys(TAB_LABELS) as SuiteTab[]).map((item) => (
          <button key={item} id={`ollama-tab-${item}`} type="button" role="tab" aria-selected={tab === item} aria-controls={`ollama-panel-${item}`} tabIndex={tab === item ? 0 : -1} className={tab === item ? styles.activeTab : styles.tab} onClick={() => setTab(item)} onKeyDown={(event) => handleTabKey(event, item)}>{TAB_LABELS[item]}</button>
        ))}
      </nav>
      <div className={styles.searchRow}>
        <RegexSearchField search={activeSearch} fieldLabel={`${TAB_LABELS[tab]} search`} ariaLabel={`${TAB_LABELS[tab]} search`} placeholder="Search this section" testId={`ollama-${tab}-search`} />
        <span className={styles.searchHint}>{activeSearch.mode === 'regex' ? 'Regex enabled' : 'Plain text search'}</span>
      </div>
      {tab === 'chat' ? <div className={styles.sessionPanel} data-testid="ollama-chat-sessions"><div className={styles.panelHead}><strong>{text('Named local sessions', '有名本機對話')}</strong><button type="button" onClick={newChatSession}>{text('New session', '新對話')}</button></div><div className={styles.sessionList} role="list">{filteredChatSessions.map((session) => <button key={session.id} type="button" role="listitem" className={session.id === chatSessionId ? styles.activeSession : styles.session} onClick={() => selectChatSession(session)}>{session.name} · {session.modelTag}</button>)}</div><label className={styles.compactField}><span>{text('Session name', '對話名稱')}</span><input value={chatSessionName} maxLength={120} onChange={(event) => setChatSessionName(event.target.value)} onBlur={renameCurrentChat} aria-label="Session name" /></label></div> : null}
      {tab === 'chat' ? <div className={styles.modelPicker} data-testid="ollama-model-picker"><RegexSearchField search={modelPickerSearch} fieldLabel={text('Installed model picker', '已安裝模型選擇')} ariaLabel={text('Search installed models', '搜尋已安裝模型')} placeholder={text('Search installed models', '搜尋已安裝模型')} testId="ollama-model-picker-search" /><label className={styles.compactField}><span>{text('Filtered model', '篩選模型')}</span><select value={selectedModel} onChange={(event) => setSelectedModel(event.target.value)} disabled={!canOperate}>{filteredInstalledModels.map((model) => <option key={model.tag} value={model.tag}>{model.tag}</option>)}{filteredInstalledModels.length === 0 ? <option value="">{text('No matching installed model', '未有相符已安裝模型')}</option> : null}</select></label><small>{filteredInstalledModels.length} installed model(s) match.</small></div> : null}
      {tab === 'chat' ? <div className={styles.historicAttachments} data-testid="ollama-historic-attachments"><input ref={historicFileRef} type="file" hidden onChange={(event) => void replaceHistoricAttachment(event)} />{chatMessages.flatMap((message, messageIndex) => (message.attachments ?? []).map((attachment, attachmentIndex) => ({ attachment, messageIndex, attachmentIndex }))).filter(({ attachment }) => !attachment.dataBase64).map(({ attachment, messageIndex, attachmentIndex }) => <div className={styles.historicAttachment} key={`${messageIndex}-${attachmentIndex}`}><span>{text(`Attachment metadata needs a local file: ${attachment.name}`, `附件資料需要重新揀本機檔案：${attachment.name}`)}</span><button type="button" onClick={() => selectHistoricAttachmentFile(messageIndex, attachmentIndex)} disabled={!canOperate}>{text('Reselect', '重新揀')}</button><button type="button" onClick={() => removeHistoricAttachment(messageIndex, attachmentIndex)}>{text('Remove', '移除')}</button></div>)}</div> : null}
      {tab === 'store' ? (
        <div className={styles.panel} id={activePanelId} aria-labelledby="ollama-tab-store" role="tabpanel">
          <div className={styles.panelHead}><div><h4>{text('Verified model catalog', '已驗證模型目錄')}</h4><p>{catalog ? `${catalog.variants.length} variants, ${catalog.pageCount} page(s), ${catalog.complete ? 'complete' : 'incomplete'}${catalog.stale ? ', stale' : ''}.` : text('No verified catalog yet.', '未有已驗證目錄。')}</p></div><span className={styles.badge}>{catalog?.sourceRevision ?? 'unknown revision'}</span></div>
          <div className={styles.modelGrid}>
            {filteredModels.map((model) => <article key={model.tag} className={styles.modelCard}><div className={styles.modelTitle}><strong>{model.tag}</strong><span className={styles.fit}>{FIT_LABELS[model.fit]}</span></div><p>{model.family ?? 'Family metadata unavailable'} · {model.quantization ?? 'quantization unknown'}</p><small>{model.fitEvidence.join(' ')}</small><button type="button" onClick={() => void startPull(model.tag)} disabled={!canOperate || model.installed || model.fit === 'unlikely' || model.fit === 'unknown' || Boolean(catalog && (catalog.stale || !catalog.complete))}>{model.installed ? 'Installed' : !canOperate ? 'Host runtime unavailable' : model.fit === 'unlikely' ? 'Unavailable for this hardware' : model.fit === 'unknown' ? 'Hardware evidence required' : catalog?.stale || catalog && !catalog.complete ? 'Refresh verified catalog first' : 'Queue pull'}</button></article>)}
          </div>
          {filteredModels.length === 0 ? <p className={styles.empty}>{text('No models match this search.', '呢個搜尋冇模型。')}</p> : null}
        </div>
      ) : null}
      {tab === 'pulls' ? <div className={styles.panel} id={activePanelId} aria-labelledby="ollama-tab-pulls" role="tabpanel"><h4>{text('Durable pull queue', '可恢復拉取隊列')}</h4><p>{canOperate ? text('Pull controls are available while the host bridge and local runtime are healthy.', '本機橋接同服務健康時先可以操作拉取。') : text('Pull controls are disabled until the host bridge and local runtime are healthy.', '本機橋接同服務健康前，拉取控制已停用。')}</p>{filteredPulls.map((pull) => <div className={styles.pullRow} key={pull.id}><strong>{pull.tag}</strong><span>{pull.state}</span><progress max={pull.totalBytes ?? undefined} value={pull.totalBytes ? pull.completedBytes : undefined} /><span aria-live="polite">{pull.rateBytesPerSecond ? `${pull.rateBytesPerSecond} bytes/s` : ''}{pull.etaSeconds !== null ? ` ETA ${pull.etaSeconds}s` : ''}{pull.partialOutcome === 'some' ? ' Partial outcome' : ''}</span><small>{pull.totalBytes ? `${pull.completedBytes} / ${pull.totalBytes} bytes` : pull.detail ?? 'Waiting for byte totals'}</small><span className={styles.pullActions}>{pull.state === 'pulling' ? <button type="button" disabled={!canOperate} onClick={() => void pullAction(pull.id, 'pause')}>Pause</button> : null}{pull.state === 'paused' ? <button type="button" disabled={!canOperate} onClick={() => void pullAction(pull.id, 'resume')}>Resume</button> : null}{pull.state === 'failed' && pull.retryable ? <button type="button" disabled={!canOperate} onClick={() => void pullAction(pull.id, 'retry')}>Retry</button> : null}{['queued', 'pulling', 'paused'].includes(pull.state) ? <button type="button" disabled={!canOperate} onClick={() => void pullAction(pull.id, 'cancel')}>Cancel</button> : null}</span></div>)}{filteredPulls.length === 0 ? <p className={styles.empty}>{text('No pulls are queued.', '未有拉取工作。')}</p> : null}</div> : null}
      {tab === 'chat' ? <div className={styles.panel} id={activePanelId} aria-labelledby="ollama-tab-chat" role="tabpanel"><div className={styles.panelHead}><h4>{text('Local streamed chat', '本機串流對話')}</h4><span className={styles.chatSessionMeta}>{chatSessionId ? `Session ${chatSessionId.slice(0, 8)}` : 'New session'}</span></div><label className={styles.field}><span>{text('Model tag', '模型標籤')}</span><select data-testid="ollama-chat-model-select" value={selectedModel} onChange={(event) => setSelectedModel(event.target.value)} disabled={!canOperate}>{filteredInstalledModels.map((model) => <option key={model.tag} value={model.tag}>{model.tag}</option>)}<option value="">No installed model</option></select><small>{text('This list uses the installed model search above, including its regex builder.', '呢張表用上面已安裝模型搜尋，包括佢嘅正則建立器。')}</small></label><label className={styles.field}><span>{text('System prompt', '系統提示')}</span><textarea value={chatSystemPrompt} onChange={(event) => setChatSystemPrompt(event.target.value.slice(0, 100_000))} placeholder="Optional local system prompt" aria-label="Local system prompt" /></label><div className={styles.parameterGrid}><label className={styles.compactField}><span>Temperature</span><input type="number" min="0" max="2" step="0.1" value={chatParameters.temperature} onChange={(event) => setChatParameters((current) => ({ ...current, temperature: Math.min(2, Math.max(0, Number(event.target.value))) }))} /></label><label className={styles.compactField}><span>Top P</span><input type="number" min="0" max="1" step="0.05" value={chatParameters.topP} onChange={(event) => setChatParameters((current) => ({ ...current, topP: Math.min(1, Math.max(0, Number(event.target.value))) }))} /></label><label className={styles.compactField}><span>Context</span><input type="number" min="1" max="1000000" value={chatParameters.numCtx} onChange={(event) => setChatParameters((current) => ({ ...current, numCtx: Math.min(1_000_000, Math.max(1, Math.trunc(Number(event.target.value)))) }))} /></label></div><label className={styles.field}><span>{text('Attachment, capability-gated', '附件，按能力開關')}</span><input type="file" disabled={!canOperate || !attachmentEnabled} aria-describedby="ollama-attachment-status" onChange={async (event) => { const file = event.target.files?.[0]; if (!file || !selectedModelInfo) return; const result = attachmentCapability(selectedModelInfo, { mimeType: file.type, bytes: file.size }); setAttachmentNotice(result.reason); if (!result.allowed) return; const bytes = new Uint8Array(await file.arrayBuffer()); let binary = ''; for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length))); setChatAttachments([{ name: file.name.slice(0, 240), mimeType: file.type.slice(0, 120), bytes: file.size, dataBase64: btoa(binary) }]); }} /><small id="ollama-attachment-status">{attachmentNotice ?? (attachmentEnabled ? text('Choose a bounded local file.', '揀一個有大小限制嘅本機檔案。') : text('This model declares no attachment capability. Filter models to find one that supports this type.', '呢個模型未宣告附件能力，請篩選支援呢種檔案嘅模型。'))}</small></label><div className={styles.chatLog} aria-live="polite">{chatMessages.map((message, index) => <p key={`${message.role}-${index}`}><strong>{message.role}:</strong> {message.content}</p>)}</div><div className={styles.chatComposer}><textarea value={chatInput} onChange={(event) => setChatInput(event.target.value.slice(0, 100_000))} placeholder="Write a local prompt" aria-label="Local chat prompt" /><button type="button" onClick={() => void sendChat()} disabled={!canOperate || chatBusy || !selectedModel || !chatInput.trim()}>{chatBusy ? 'Streaming…' : 'Send'}</button><button type="button" onClick={stopChat} disabled={!chatBusy}>Stop</button><button type="button" onClick={newChatSession}>New session</button><button type="button" onClick={exportChat} disabled={!chatSessionId}>Export</button></div></div> : null}
      {tab === 'harness' ? <div className={styles.panel} id={activePanelId} aria-labelledby="ollama-tab-harness" role="tabpanel"><h4>{text('Allowlisted harness profiles', '白名單工具設定')}</h4><p>{text('Shell syntax and arbitrary environment expansion are refused. The local preflight is reviewable before launch, and a failed health check can be restored.', '會拒絕 shell 語法同任意環境展開，本機預檢可以先審閱，健康檢查失敗可以恢復。')}</p><label className={styles.field}><span>{text('Executable picker', '揀執行檔')}</span><input type="file" aria-label="Harness executable" onChange={(event) => { const file = event.target.files?.[0] as (File & { path?: string }) | undefined; setHarnessExecutable(file?.path ?? ''); }} /><small>{harnessExecutable || text('Choose an existing Ollama executable.', '揀一個已存在嘅 Ollama 執行檔。')}</small></label>{harnessNotice ? <p role="status">{harnessNotice}</p> : null}{harnessPreview ? <div className={styles.preview} data-testid="ollama-harness-preview"><strong>{text('Review before launch', '啟動前審閱')}</strong><code>{String(harnessPreview.value.executable ?? harnessPreview.profile.executable)} {harnessPreview.profile.arguments.join(' ')}</code><small>{text('The daemon writes a stable snapshot before launch and rolls it back when health verification fails.', '服務會喺啟動前寫低穩定快照，健康檢查失敗就自動恢復。')}</small><div className={styles.pullActions}><button type="button" onClick={() => void launchHarness()} disabled={!canOperate}>{text('Launch reviewed profile', '啟動已審閱設定')}</button><button type="button" onClick={discardHarnessPreview}>{text('Cancel launch', '取消啟動')}</button></div></div> : null}{filteredProfiles.map((profile) => <div className={styles.profileRow} key={profile.id}><strong>{profile.name}</strong><code>{profile.executable} {profile.arguments.join(' ')}</code><span>{profile.modelTag}</span><button type="button" onClick={() => void runHarness(profile)} disabled={!canOperate}>{text('Preflight', '預檢')}</button><button type="button" onClick={() => void restoreHarness(profile.id)} disabled={!canOperate}>{text('Restore snapshot', '恢復快照')}</button></div>)}<button type="button" onClick={() => void saveProfile()} disabled={!canOperate || !selectedModel || !harnessExecutable}>{text('Save a safe local profile', '儲存安全本機設定')}</button></div> : null}
      {tab === 'recovery' ? <div className={styles.panel} id={activePanelId} aria-labelledby="ollama-tab-recovery" role="tabpanel"><h4>{text('Recovery and offline states', '恢復同離線狀態')}</h4><p data-testid="ollama-recovery-status">{hostBridgeAvailable ? runtime?.state === 'healthy' ? text('The host bridge is mounted and the local runtime is healthy.', '本機橋接已掛載，本機服務健康。') : text(`The host bridge is mounted, but the local runtime is ${runtime?.state ?? 'unavailable'}. Cached catalog data is read-only until it is healthy.`, `本機橋接已掛載，但本機服務目前${runtime?.state ?? '未可用'}。目錄快取只讀，服務健康後先可以操作。`) : text(`The host bridge is unavailable: ${hostBridgeReason || 'no response'}. Start the host service, then refresh. Cached catalog data is read-only.`, `本機橋接未可用：${hostBridgeReason || '未有回應'}。啟動本機服務後再刷新，目錄快取只讀。`)}</p><ul><li>{text('Missing bridge: mount the feature route, then refresh this surface.', '橋接未掛載：掛載功能路線後再刷新呢個畫面。')}</li><li>{text('Offline runtime: keep using verified cached data and retry when the local service responds.', '本機服務離線：繼續睇已驗證快取，服務回應後再試。')}</li><li>{text('Stale catalog: inspect its revision and refresh only when the official source responds.', '目錄過期：先睇來源修訂，再喺官方來源回應後刷新。')}</li><li>{text('Unknown hardware fit: provide verified host facts before enabling a pull.', '硬件配合未知：有已驗證本機資料後先可以啟用拉取。')}</li></ul></div> : null}
    </section>
  );
}

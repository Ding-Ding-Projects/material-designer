const I18N_DOWNLOAD = globalThis.OD_CLIPPER_I18N;
const localeDownload = I18N_DOWNLOAD?.currentLocale ? I18N_DOWNLOAD.currentLocale() : 'en';
const tDownload = (key, vars) => I18N_DOWNLOAD?.t ? I18N_DOWNLOAD.t(key, vars, localeDownload) : key;
if (I18N_DOWNLOAD?.translateDocument) I18N_DOWNLOAD.translateDocument(document, localeDownload);

const params = new URLSearchParams(location.search);
const flowId = params.get('flow');
const $download = (id) => document.getElementById(id);
let windowId = null;
let pollHandle = null;
let actionPending = false;
let currentState = 'start';

function armPolling() {
  clearInterval(pollHandle);
  pollHandle = setInterval(refreshState, 500);
}

function sendDownload(message) {
  return new Promise((resolve) => chrome.runtime.sendMessage(message, (response) => resolve(response || { ok: false, error: tDownload('noResponse') })));
}

function showError(message, options = {}) {
  currentState = options.canRetry === true ? 'failed' : currentState === 'start' ? 'failed' : currentState;
  const error = $download('error');
  error.textContent = message || tDownload('unknown');
  error.hidden = false;
  $download('start').hidden = true;
  $download('cancel').hidden = currentState === 'failed';
  $download('pause').hidden = true;
  $download('resume').hidden = true;
  $download('retry').hidden = options.canRetry !== true;
  $download('open').hidden = true;
  $download('close').hidden = false;
}

function showOpenError(message) {
  currentState = 'complete';
  $download('error').textContent = message || tDownload('downloadOpenFailed');
  $download('error').hidden = false;
  $download('progress').hidden = true;
  $download('complete').hidden = false;
  $download('start').hidden = true;
  $download('cancel').hidden = true;
  $download('pause').hidden = true;
  $download('resume').hidden = true;
  $download('retry').hidden = true;
  $download('open').hidden = false;
  $download('close').hidden = false;
}

function formatBytes(value) {
  if (value == null || !Number.isFinite(Number(value)) || Number(value) < 0) return tDownload('downloadSizeUnknown');
  return `${Math.floor(Number(value))} ${tDownload('downloadBytesUnit')}`;
}

function formatRate(value) {
  if (value == null || !Number.isFinite(Number(value)) || Number(value) <= 0) return tDownload('downloadRateUnknown');
  return `${Math.round(Number(value))} ${tDownload('downloadRateUnit')}`;
}

function formatEta(value) {
  if (value == null || !Number.isFinite(Number(value)) || Number(value) < 0) return tDownload('downloadEtaUnknown');
  return tDownload('downloadEta', { seconds: Math.floor(Number(value)) });
}

function setButtonPending(pending) {
  actionPending = Boolean(pending);
  for (const id of ['start', 'cancel', 'pause', 'resume', 'retry', 'open', 'close']) {
    const button = $download(id);
    if (button && !button.hidden) button.disabled = actionPending;
  }
}

function renderState(state) {
  const priorState = currentState;
  currentState = state.state || 'start';
  if (state.filename) $download('filename').textContent = state.filename;
  $download('filesize').textContent = state.bytes == null ? tDownload('downloadSizeUnknown') : formatBytes(state.bytes);
  if (state.source) $download('source').textContent = state.source;
  if (state.destination) $download('destination').textContent = state.destination;
  if (state.extensionOrigin) $download('extension-origin').textContent = state.extensionOrigin;

  const total = state.totalBytes;
  const received = Number(state.receivedBytes || 0);
  const percent = total != null && total > 0 ? Math.min(100, Math.max(0, Math.round(received / total * 100))) : 0;
  $download('bar').value = percent;
  $download('bar').max = 100;
  $download('percent').textContent = total == null ? tDownload('downloadPercentUnknown') : `${percent}%`;
  $download('progress-detail').textContent = total == null
    ? tDownload('downloadProgressDetailUnknown', { received: formatBytes(received) })
    : tDownload('downloadProgressDetail', { received: formatBytes(received), total: formatBytes(total) });
  $download('progress-rate').textContent = `${formatRate(state.rateBytesPerSecond)} · ${formatEta(state.etaSeconds)}`;
  $download('always-on-top').textContent = tDownload('downloadAlwaysOnTop', { state: state.alwaysOnTop || 'unknown' });

  const operationError = state.operationError || '';
  const error = $download('error');
  if (operationError) {
    error.textContent = operationError;
    error.hidden = false;
  } else if (state.state !== 'failed') {
    error.hidden = true;
  }

  if (state.state === 'start') {
    $download('summary').textContent = tDownload('downloadStartSummary');
    $download('progress').hidden = true;
    $download('complete').hidden = true;
    $download('start').hidden = false;
    $download('cancel').hidden = false;
    $download('pause').hidden = true;
    $download('resume').hidden = true;
    $download('retry').hidden = true;
    $download('open').hidden = true;
    $download('close').hidden = true;
  } else if (state.state === 'downloading' || state.state === 'paused') {
    $download('summary').textContent = state.state === 'paused' ? tDownload('downloadPausedSummary') : tDownload('downloadProgressSummary');
    $download('progress').hidden = false;
    $download('complete').hidden = true;
    $download('start').hidden = true;
    $download('cancel').hidden = false;
    $download('pause').hidden = state.state !== 'downloading';
    $download('resume').hidden = state.state !== 'paused';
    $download('retry').hidden = true;
    $download('open').hidden = true;
    $download('close').hidden = true;
  } else if (state.state === 'complete') {
    $download('progress').hidden = true;
    $download('complete').hidden = false;
    $download('complete-detail').textContent = tDownload('downloadCompleteDetail', { filename: state.filename });
    $download('complete-size').textContent = `${tDownload('downloadReceivedLabel')}: ${formatBytes(state.receivedBytes)}`;
    $download('start').hidden = true;
    $download('cancel').hidden = true;
    $download('pause').hidden = true;
    $download('resume').hidden = true;
    $download('retry').hidden = true;
    $download('open').hidden = false;
    $download('close').hidden = false;
  } else if (state.state === 'cancelled') {
    $download('progress').hidden = true;
    $download('complete').hidden = false;
    $download('complete-detail').textContent = tDownload('downloadCancelledDetail', { filename: state.filename });
    $download('complete-size').textContent = `${tDownload('downloadReceivedLabel')}: ${formatBytes(state.receivedBytes)}`;
    $download('start').hidden = true;
    $download('cancel').hidden = true;
    $download('pause').hidden = true;
    $download('resume').hidden = true;
    $download('retry').hidden = false;
    $download('open').hidden = true;
    $download('close').hidden = false;
  } else if (state.state === 'failed') {
    $download('progress').hidden = false;
    $download('complete').hidden = true;
    $download('start').hidden = true;
    $download('cancel').hidden = true;
    $download('pause').hidden = true;
    $download('resume').hidden = true;
    $download('retry').hidden = false;
    $download('open').hidden = true;
    $download('close').hidden = false;
    showError(state.error || tDownload('downloadFailedMessage', { error: tDownload('unknown') }), { canRetry: true });
  }
  if (priorState === 'start' && currentState !== 'start') {
    globalThis.OD_CLIPPER_DIALOG?.focusAvailable(document.querySelector('.surface'));
  }
}

async function refreshState() {
  if (!flowId) {
    showError(tDownload('downloadProposalExpired'));
    return;
  }
  const state = await sendDownload({ type: 'getDownloadState', flowId });
  if (!state.ok) {
    showError(state.error || tDownload('downloadProposalExpired'));
    return;
  }
  renderState(state);
  if (state.state === 'complete' || state.state === 'failed' || state.state === 'cancelled') {
    clearInterval(pollHandle);
    pollHandle = null;
  }
}

async function runAction(buttonId, message, after = refreshState) {
  if (actionPending) return;
  setButtonPending(true);
  try {
    const result = await sendDownload({ ...message, flowId });
    if (!result.ok) {
      if (buttonId === 'open') showOpenError(result.error || tDownload('downloadOpenFailed'));
      else showError(result.error || tDownload('downloadFailedMessage', { error: tDownload('unknown') }), { canRetry: buttonId === 'start' });
      return;
    }
    await after(result);
    if (buttonId === 'retry') armPolling();
  } catch (error) {
    showError(error instanceof Error ? error.message : tDownload('unknown'), {
      canRetry: buttonId === 'start',
    });
  } finally {
    setButtonPending(false);
    if (buttonId === 'start') globalThis.OD_CLIPPER_DIALOG?.focusAvailable(document.querySelector('.surface'));
  }
}

$download('start').addEventListener('click', () => void runAction('start', { type: 'confirmDownload', windowId }));
$download('cancel').addEventListener('click', () => void runAction('cancel', { type: 'cancelDownload' }, async () => { window.close(); }));
$download('pause').addEventListener('click', () => void runAction('pause', { type: 'pauseDownload' }));
$download('resume').addEventListener('click', () => void runAction('resume', { type: 'resumeDownload' }));
$download('retry').addEventListener('click', () => void runAction('retryDownload', { type: 'retryDownload' }));
$download('open').addEventListener('click', () => void runAction('open', { type: 'openDownload' }, async (result) => {
  if (!result.opened) showOpenError(result.error || tDownload('downloadOpenFailed'));
}));
$download('close').addEventListener('click', () => window.close());

// The extension window uses the shared dialog primitive. Escape cancels only
// while work can still be cancelled, and otherwise closes a terminal surface.
const disposeDialog = globalThis.OD_CLIPPER_DIALOG?.mount(document.querySelector('.surface'), {
  onEscape: () => {
    if (actionPending) return;
    if (['start', 'downloading', 'paused'].includes(currentState)) $download('cancel').click();
    else window.close();
  },
});

window.addEventListener('beforeunload', () => {
  clearInterval(pollHandle);
  disposeDialog?.();
});

chrome.windows.getCurrent((win) => {
  windowId = win?.id ?? null;
  $download('start').focus();
  void refreshState();
  armPolling();
});

const I18N_DOWNLOAD = globalThis.OD_CLIPPER_I18N;
const localeDownload = I18N_DOWNLOAD?.currentLocale ? I18N_DOWNLOAD.currentLocale() : 'en';
const tDownload = (key, vars) => I18N_DOWNLOAD?.t ? I18N_DOWNLOAD.t(key, vars, localeDownload) : key;
if (I18N_DOWNLOAD?.translateDocument) I18N_DOWNLOAD.translateDocument(document, localeDownload);

const params = new URLSearchParams(location.search);
const flowId = params.get('flow');
const $download = (id) => document.getElementById(id);
let windowId = null;
let pollHandle = null;

function sendDownload(message) {
  return new Promise((resolve) => chrome.runtime.sendMessage(message, (response) => resolve(response || { ok: false, error: tDownload('noResponse') })));
}

function showError(message) {
  $download('error').textContent = message;
  $download('error').hidden = false;
  $download('start').hidden = true;
  $download('cancel').hidden = true;
  $download('pause').hidden = true;
  $download('resume').hidden = true;
}

function renderState(state) {
  if (state.filename) $download('filename').textContent = state.filename;
  if (state.bytes != null) $download('filesize').textContent = tDownload('downloadFileSize', { bytes: state.bytes });
  if (state.source) $download('source').textContent = state.source;
  if (state.destination) $download('destination').textContent = state.destination;
  const total = Number(state.total || state.bytes || 0);
  const received = Number(state.received || 0);
  const percent = total > 0 ? Math.min(100, Math.round(received / total * 100)) : 0;
  $download('bar').value = percent;
  $download('percent').textContent = `${percent}%`;
  $download('progress-detail').textContent = tDownload('downloadProgressDetail', { received, total });
  $download('progress-rate').textContent = state.rate > 0
    ? `${tDownload('downloadRate', { rate: Math.round(state.rate) })}${state.etaSeconds != null ? ` · ${tDownload('downloadEta', { seconds: state.etaSeconds })}` : ''}`
    : '';
  if (state.state === 'downloading' || state.state === 'paused') {
    $download('summary').textContent = tDownload('downloadProgressSummary');
    $download('progress').hidden = false;
    $download('start').hidden = true;
    $download('cancel').hidden = false;
    $download('pause').hidden = state.state !== 'downloading';
    $download('resume').hidden = state.state !== 'paused';
    $download('pause').disabled = state.state !== 'downloading';
    $download('resume').disabled = state.state !== 'paused';
  } else if (state.state === 'complete') {
    $download('progress').hidden = true;
    $download('complete').hidden = false;
    $download('complete-detail').textContent = tDownload('downloadCompleteDetail', { filename: state.filename });
    $download('close').hidden = false;
    $download('start').hidden = true;
    $download('cancel').hidden = true;
    $download('pause').hidden = true;
    $download('resume').hidden = true;
  } else if (state.state === 'failed') {
    showError(tDownload('downloadFailedMessage', { error: state.error || tDownload('unknown') }));
  }
}

async function refreshState() {
  const state = await sendDownload({ type: 'getDownloadState', flowId });
  if (!state.ok) {
    showError(state.error || tDownload('downloadProposalExpired'));
    return;
  }
  renderState(state);
  if (state.state === 'complete' || state.state === 'failed') clearInterval(pollHandle);
}

$download('start').addEventListener('click', async () => {
  $download('start').disabled = true;
  const result = await sendDownload({ type: 'confirmDownload', flowId, windowId });
  if (!result.ok) {
    showError(result.error || tDownload('downloadFailedMessage', { error: tDownload('unknown') }));
    return;
  }
  await refreshState();
});

$download('cancel').addEventListener('click', async () => {
  await sendDownload({ type: 'cancelDownload', flowId });
  window.close();
});
$download('pause').addEventListener('click', async () => {
  await sendDownload({ type: 'pauseDownload', flowId });
  await refreshState();
});
$download('resume').addEventListener('click', async () => {
  await sendDownload({ type: 'resumeDownload', flowId });
  await refreshState();
});
$download('close').addEventListener('click', () => window.close());

chrome.windows.getCurrent((win) => {
  windowId = win?.id ?? null;
  void refreshState();
  pollHandle = setInterval(refreshState, 500);
});

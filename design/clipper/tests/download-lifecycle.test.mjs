import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function loadWorker() {
  const listeners = { message: null, changed: null, clicked: null };
  const calls = { downloads: [], pauses: [], resumes: [], cancels: [], opens: [], notifications: [], pauseError: false, resumeError: false, openError: false };
  const runtimeId = 'abcdefghijklmnop';
  const timer = (callback, delay) => {
    const handle = globalThis.setTimeout(callback, delay);
    handle.unref?.();
    return handle;
  };
  const chrome = {
    runtime: {
      id: runtimeId,
      getURL: (path) => `chrome-extension://${runtimeId}/${path}`,
      onMessage: { addListener: (fn) => { listeners.message = fn; } },
      onInstalled: { addListener: () => {} },
      lastError: null,
    },
    tabs: {
      query: async () => [{ id: 9, windowId: 8, url: 'https://example.test/page', title: 'Example' }],
      sendMessage: (_id, _message, callback) => callback({ ok: true }),
      executeScript: async () => [{ result: { html: '<main></main>', title: 'Example', url: 'https://example.test/page', resources: [] } }],
      captureVisibleTab: async () => 'data:image/png;base64,AA==',
    },
    storage: { local: { get: async () => ({}), set: async () => {} } },
    contextMenus: { create: () => {}, onClicked: { addListener: () => {} } },
    action: { setBadgeBackgroundColor: async () => {}, setBadgeText: async () => {} },
    notifications: {
      create: (id, details) => { calls.notifications.push({ id, details }); },
      update: () => {},
      onClicked: { addListener: (fn) => { listeners.clicked = fn; } },
    },
    windows: {
      get: async () => ({ id: 12, alwaysOnTop: true }),
      update: async (id, details) => ({ id, alwaysOnTop: details.alwaysOnTop === true }),
    },
    downloads: {
      onChanged: { addListener: (fn) => { listeners.changed = fn; } },
      download: async (details) => { calls.downloads.push(details); return 6 + calls.downloads.length; },
      pause: async (id) => { calls.pauses.push(id); if (calls.pauseError) throw new Error('pause refused'); },
      resume: async (id) => { calls.resumes.push(id); if (calls.resumeError) throw new Error('resume refused'); },
      cancel: async (id) => { calls.cancels.push(id); },
      open: async (id) => { calls.opens.push(id); if (calls.openError) throw new Error('open refused'); },
    },
  };
  const context = {
    chrome,
    URL,
    URLSearchParams,
    TextEncoder,
    setTimeout: timer,
    clearTimeout,
    fetch: async () => new Response('{}'),
    btoa: (value) => Buffer.from(value, 'binary').toString('base64'),
    globalThis: null,
  };
  context.globalThis = context;
  context.OD_CLIPPER_I18N = { t: (key, vars) => Object.entries(vars || {}).reduce((text, [name, value]) => text.replace(`{${name}}`, String(value)), key) };
  context.importScripts = () => {};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(new URL('../background.js', import.meta.url), 'utf8'), context, { filename: 'background.js' });
  vm.runInContext("capturePage = async () => ({ figmaIr: { type: 'DOCUMENT' }, title: 'Example', url: 'https://example.test/page', resources: [] });", context);
  return { context, listeners, calls, runtimeId };
}

function message(worker, payload, sender) {
  return new Promise((resolve) => worker.listeners.message(payload, sender, resolve));
}

test('extension proposal starts no transfer and trusted Start begins one transfer', async () => {
  const worker = loadWorker();
  const trusted = { id: worker.runtimeId, url: `chrome-extension://${worker.runtimeId}/popup.html` };
  const proposal = await message(worker, { type: 'downloadFigma', opts: {} }, trusted);
  assert.equal(proposal.ok, true);
  assert.equal(worker.calls.downloads.length, 0);

  const spoofed = await message(worker, { type: 'confirmDownload', flowId: proposal.flowId, windowId: 12 }, {
    id: 'spoofed-extension',
    url: trusted.url,
  });
  assert.equal(spoofed.ok, false);
  assert.equal(worker.calls.downloads.length, 0);

  const started = await message(worker, { type: 'confirmDownload', flowId: proposal.flowId, windowId: 12 }, trusted);
  assert.equal(started.ok, true);
  assert.equal(worker.calls.downloads.length, 1);
  const duplicate = await message(worker, { type: 'confirmDownload', flowId: proposal.flowId, windowId: 12 }, trusted);
  assert.equal(duplicate.ok, false);
  assert.equal(worker.calls.downloads.length, 1);
});

test('content-script handoff uses browser-supplied extension identity without accepting a page spoof', async () => {
  const worker = loadWorker();
  const contentSender = {
    id: worker.runtimeId,
    url: 'https://example.test/page',
    tab: { id: 9, windowId: 8 },
  };
  const proposal = await message(worker, { type: 'downloadFigma', opts: {}, extensionOrigin: 'chrome-extension://spoofed' }, contentSender);
  assert.equal(proposal.ok, true);
  assert.equal(proposal.extensionOrigin, `chrome-extension://${worker.runtimeId}`);
  const spoofed = await message(worker, { type: 'downloadFigma', opts: {} }, {
    url: 'https://example.test/page',
    tab: { id: 9, windowId: 8 },
  });
  assert.equal(spoofed.ok, false);
  assert.equal(worker.calls.downloads.length, 0);
  const portSpoof = await message(worker, { type: 'downloadFigma', opts: {} }, {
    id: worker.runtimeId,
    url: `chrome-extension://${worker.runtimeId}:443/popup.html`,
  });
  assert.equal(portSpoof.ok, false);
});

test('browser download events drive metrics, pause/resume, completion, and open', async () => {
  const worker = loadWorker();
  const trusted = { id: worker.runtimeId, url: `chrome-extension://${worker.runtimeId}/download.html` };
  const proposal = await message(worker, { type: 'downloadFigma', opts: {} }, trusted);
  const windowState = await message(worker, { type: 'setDownloadWindowState', flowId: proposal.flowId, windowId: 12 }, trusted);
  assert.equal(windowState.alwaysOnTop, 'active');
  await message(worker, { type: 'confirmDownload', flowId: proposal.flowId, windowId: 12 }, trusted);
  worker.listeners.changed({ id: 7, bytesReceived: { current: 4 }, totalBytes: { current: 10 }, state: { current: 'in_progress' } });
  let state = await message(worker, { type: 'getDownloadState', flowId: proposal.flowId }, trusted);
  assert.equal(state.receivedBytes, 4);
  assert.equal(state.totalBytes, 10);
  assert.equal(state.state, 'downloading');
  assert.equal(typeof state.rateBytesPerSecond, 'number');
  worker.listeners.changed({ id: 7, bytesReceived: { current: 4 }, totalBytes: { current: 5 }, state: { current: 'in_progress' } });
  state = await message(worker, { type: 'getDownloadState', flowId: proposal.flowId }, trusted);
  assert.equal(state.receivedBytes, 4);
  assert.equal(state.totalBytes, 10);
  await message(worker, { type: 'pauseDownload', flowId: proposal.flowId }, trusted);
  await message(worker, { type: 'resumeDownload', flowId: proposal.flowId }, trusted);
  assert.deepEqual(worker.calls.pauses, [7]);
  assert.deepEqual(worker.calls.resumes, [7]);
  worker.listeners.changed({ id: 7, bytesReceived: { current: 10 }, state: { current: 'complete' } });
  state = await message(worker, { type: 'getDownloadState', flowId: proposal.flowId }, trusted);
  assert.equal(state.state, 'complete');
  assert.equal(state.receivedBytes, 10);
  assert.equal(state.etaSeconds, 0);
  worker.listeners.changed({ id: 7, bytesReceived: { current: 12 }, totalBytes: { current: 12 }, state: { current: 'in_progress' } });
  state = await message(worker, { type: 'getDownloadState', flowId: proposal.flowId }, trusted);
  assert.equal(state.state, 'complete');
  assert.equal(state.receivedBytes, 10);
  worker.calls.openError = true;
  const failedOpen = await message(worker, { type: 'openDownload', flowId: proposal.flowId }, trusted);
  assert.equal(failedOpen.ok, false);
  state = await message(worker, { type: 'getDownloadState', flowId: proposal.flowId }, trusted);
  assert.equal(state.state, 'complete');
  assert.equal(state.operationError, 'open refused');
  worker.calls.openError = false;
  const opened = await message(worker, { type: 'openDownload', flowId: proposal.flowId }, trusted);
  assert.equal(opened.opened, true);
  state = await message(worker, { type: 'getDownloadState', flowId: proposal.flowId }, trusted);
  assert.equal(state.operationError, null);
  assert.deepEqual(worker.calls.opens, [7, 7]);
});

test('retry returns to a fresh Start proposal with no stale start time', async () => {
  const worker = loadWorker();
  const trusted = { id: worker.runtimeId, url: `chrome-extension://${worker.runtimeId}/download.html` };
  const proposal = await message(worker, { type: 'downloadFigma', opts: {} }, trusted);
  await message(worker, { type: 'confirmDownload', flowId: proposal.flowId, windowId: 12 }, trusted);
  worker.listeners.changed({ id: 7, state: { current: 'interrupted' }, error: { current: 'NETWORK_FAILED' } });
  const retry = await message(worker, { type: 'retryDownload', flowId: proposal.flowId }, trusted);
  assert.equal(retry.ok, true);
  let state = await message(worker, { type: 'getDownloadState', flowId: proposal.flowId }, trusted);
  assert.equal(state.state, 'start');
  assert.equal(state.pendingAction, null);
  const restarted = await message(worker, { type: 'confirmDownload', flowId: proposal.flowId, windowId: 12 }, trusted);
  assert.equal(restarted.ok, true);
  state = await message(worker, { type: 'getDownloadState', flowId: proposal.flowId }, trusted);
  assert.equal(state.state, 'downloading');
  assert.equal(typeof state.startedAt, 'number');
});

test('failed browser actions stay visible and clear after a later success', async () => {
  const worker = loadWorker();
  const trusted = { id: worker.runtimeId, url: `chrome-extension://${worker.runtimeId}/download.html` };
  const proposal = await message(worker, { type: 'downloadFigma', opts: {} }, trusted);
  await message(worker, { type: 'confirmDownload', flowId: proposal.flowId, windowId: 12 }, trusted);
  worker.calls.pauseError = true;
  const failedPause = await message(worker, { type: 'pauseDownload', flowId: proposal.flowId }, trusted);
  assert.equal(failedPause.ok, false);
  let state = await message(worker, { type: 'getDownloadState', flowId: proposal.flowId }, trusted);
  assert.equal(state.operationError, 'pause refused');
  worker.calls.pauseError = false;
  const paused = await message(worker, { type: 'pauseDownload', flowId: proposal.flowId }, trusted);
  assert.equal(paused.ok, true);
  state = await message(worker, { type: 'getDownloadState', flowId: proposal.flowId }, trusted);
  assert.equal(state.operationError, null);
});

test('unknown active ids and interrupted transfers remain observable failures', async () => {
  const worker = loadWorker();
  const trusted = { id: worker.runtimeId, url: `chrome-extension://${worker.runtimeId}/download.html` };
  const unknown = await message(worker, { type: 'getDownloadState', flowId: 'missing' }, trusted);
  assert.equal(unknown.ok, false);
  const proposal = await message(worker, { type: 'downloadFigma', opts: {} }, trusted);
  await message(worker, { type: 'confirmDownload', flowId: proposal.flowId, windowId: 12 }, trusted);
  worker.listeners.changed({ id: 7, state: { current: 'interrupted' }, error: { current: 'NETWORK_FAILED' } });
  const failed = await message(worker, { type: 'getDownloadState', flowId: proposal.flowId }, trusted);
  assert.equal(failed.state, 'failed');
  assert.equal(failed.error, 'NETWORK_FAILED');
  assert.equal(failed.alwaysOnTop, 'unknown');
});

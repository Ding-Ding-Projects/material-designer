/* Local browser equivalent of the desktop converter.  It never asks for a
 * server path or sends bytes over the network.  The desktop host owns real
 * filesystem writes; this page can only retain a bounded in-memory/local
 * browser queue and download a user-selected result. */

import * as regex from './regex.js';
import * as ui from './ui.js';

const STORAGE_KEY = 'md-designer.site.converter.queue';
const CATEGORIES = Object.freeze(['documents-pdf', 'images', 'audio', 'video', 'archives', 'structured-data', 'code-text', 'binary-encodings']);

function readQueue() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((row) => row && typeof row.name === 'string') : [];
  } catch { return []; }
}

function writeQueue(queue) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(queue)); return true; } catch { return false; }
}

async function detect(file) {
  const sample = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const starts = (values) => values.every((value, index) => sample[index] === value);
  if (starts([0x25, 0x50, 0x44, 0x46])) return { format: 'pdf', category: 'documents-pdf' };
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { format: 'png', category: 'images' };
  if (starts([0xff, 0xd8, 0xff])) return { format: 'jpeg', category: 'images' };
  if (starts([0x50, 0x4b, 0x03, 0x04])) return { format: 'zip', category: 'archives' };
  const type = String(file.type || '').toLowerCase();
  const name = String(file.name || '').toLowerCase();
  if (type === 'application/pdf' || name.endsWith('.pdf')) return { format: 'pdf', category: 'documents-pdf' };
  if (type.startsWith('image/')) return { format: type.slice(6), category: 'images' };
  if (type.startsWith('audio/')) return { format: type.slice(6), category: 'audio' };
  if (type.startsWith('video/')) return { format: type.slice(6), category: 'video' };
  if (/\.(json|jsonl|ndjson|csv|tsv|yaml|yml|toml|xml)$/.test(name)) return { format: name.split('.').pop(), category: 'structured-data' };
  if (/\.(md|markdown|txt|html|js|ts)$/.test(name)) return { format: name.split('.').pop(), category: 'code-text' };
  if (/\.(zip|7z|tar|gz)$/.test(name)) return { format: name.split('.').pop(), category: 'archives' };
  return { format: 'unknown', category: 'binary-encodings' };
}

function init() {
  const sourceInput = document.querySelector('[data-converter-source]');
  const destinationInput = document.querySelector('[data-converter-destination]');
  const status = document.querySelector('#converter-source-status');
  const addButton = document.querySelector('[data-converter-queue-add]');
  const cancelButton = document.querySelector('[data-converter-queue-cancel]');
  const exportButton = document.querySelector('[data-converter-queue-export]');
  const startButton = document.querySelector('[data-converter-queue-start]');
  const queueStatus = document.querySelector('[data-converter-queue-status]');
  const queueList = document.querySelector('[data-converter-queue-list]');
  if (!sourceInput || !destinationInput || !addButton || !queueList) return;
  let source = null;
  let queue = readQueue();

  function paintQueue() {
    queueList.replaceChildren();
    for (const [index, row] of queue.entries()) {
      const item = document.createElement('li'); item.className = 'md-list-item';
      const check = document.createElement('input'); check.type = 'checkbox'; check.checked = false; check.dataset.queueIndex = String(index); check.setAttribute('aria-label', `Select ${row.name}`);
      const label = document.createElement('span'); label.textContent = `${row.name} → ${row.target} · ${row.state}`;
      item.append(check, label); queueList.append(item);
    }
    if (queueStatus) queueStatus.textContent = queue.length ? `${queue.length} local queue records. No bytes leave this browser.` : 'No files are queued.';
    addButton.disabled = !source;
    if (startButton) startButton.disabled = !queue.some((row) => row.state === 'queued') || !source;
    if (cancelButton) cancelButton.disabled = !queue.length;
    if (exportButton) exportButton.disabled = !queue.length;
  }

  sourceInput.addEventListener('change', async () => {
    source = sourceInput.files?.[0] || null;
    if (!source) { if (status) status.textContent = 'No source selected.'; paintQueue(); return; }
    const detected = await detect(source);
    if (status) status.textContent = `Selected ${source.name}, ${source.size} bytes, detected as ${detected.format}. Browser-local equivalent only.`;
    paintQueue();
  });
  addButton.addEventListener('click', async () => {
    if (!source) return;
    const detected = await detect(source);
    const row = { name: source.name, bytes: source.size, target: String(destinationInput.value || 'converted-output'), state: 'queued', category: detected.category, format: detected.format, createdAt: Date.now() };
    queue.push(row); writeQueue(queue); paintQueue(); ui.notify({ kind: 'success', title: 'converter.queued', record: true });
  });
  startButton?.addEventListener('click', async () => {
    if (!source) return;
    for (const row of queue.filter((candidate) => candidate.state === 'queued')) {
      if (row.category !== 'code-text' && row.category !== 'structured-data') { row.state = 'failed'; row.reason = 'This browser equivalent only converts local text and structured data; the selected adapter is unavailable.'; continue; }
      try {
        const text = await source.text();
        const output = row.target.toLowerCase().endsWith('.json') ? JSON.stringify(JSON.parse(text), null, 2) + '\n' : text;
        const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([output], { type: 'text/plain' })); link.download = row.target; link.click(); URL.revokeObjectURL(link.href); row.state = 'converted'; row.reason = 'Browser-local output downloaded.';
      } catch { row.state = 'failed'; row.reason = 'The source is not valid UTF-8 or the selected structured target is invalid.'; }
    }
    writeQueue(queue); paintQueue(); ui.notify({ kind: 'success', title: 'converter.completed', record: true });
  });
  cancelButton?.addEventListener('click', () => { const selected = new Set([...queueList.querySelectorAll('input[data-queue-index]:checked')].map((node) => Number(node.dataset.queueIndex))); queue = queue.map((row, index) => (selected.size === 0 || !selected.has(index) || row.state !== 'queued') ? row : { ...row, state: 'cancelled' }); writeQueue(queue); paintQueue(); ui.notify({ kind: 'info', title: 'converter.cancelled', record: true }); });
  exportButton?.addEventListener('click', () => { const blob = new Blob([JSON.stringify({ schemaVersion: 1, queue, sourceBytesOmitted: true }, null, 2)], { type: 'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'converter-queue.json'; link.click(); URL.revokeObjectURL(link.href); });
  for (const category of CATEGORIES) {
    const card = document.querySelector(`[data-converter-category="${category}"]`); if (!card) continue;
    const input = card.querySelector('[data-converter-search] input'); const mode = card.querySelector('[data-regex-mode]'); const trigger = card.querySelector('[data-regex-builder]'); const empty = card.querySelector('[data-converter-empty]'); const list = card.querySelector('[data-converter-adapters]');
    if (!input || !list) continue;
    let currentMatcher = (text) => text.toLowerCase().includes('');
    const apply = () => { const query = String(input.value || '').trim(); for (const row of list.querySelectorAll('[data-adapter]')) row.hidden = Boolean(query && !currentMatcher(row.getAttribute('data-adapter') || '')); const visible = [...list.querySelectorAll('[data-adapter]')].filter((row) => !row.hidden).length; if (empty) empty.hidden = visible !== 0; };
    const builder = regex.attachRegexBuilder(input, { trigger, modeToggle: mode, key: `converter.${category}`, onApply: (_pattern, flags) => { currentMatcher = (text) => { try { return new RegExp(input.value, flags || 'gi').test(text); } catch { return false; } }; apply(); } });
    input.addEventListener('input', () => { const state = builder.getState(); currentMatcher = state.mode === 'regex' ? builder.matcher() : (text) => text.toLowerCase().includes(input.value.toLowerCase()); apply(); });
  }
  paintQueue();
}

export { init };

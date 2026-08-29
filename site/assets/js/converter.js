const QUEUE_DATABASE = 'md-designer-site-converter-v1';
const QUEUE_STORE = 'records';
const QUEUE_OFFSET_KEY = 'md-designer.site.converter.queue.offset';
const MAX_INSPECTION_BYTES = 8 * 1024 * 1024;
const QUEUE_PAGE_SIZE = 50;
const CATEGORIES = Object.freeze([
  'documents-pdf',
  'images',
  'audio',
  'video',
  'archives',
  'structured-data',
  'code-text',
  'binary-encodings',
]);

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

function readQueueOffset() {
  try {
    return Math.max(0, Number.parseInt(localStorage.getItem(QUEUE_OFFSET_KEY) || '0', 10) || 0);
  } catch {
    return 0;
  }
}

function writeQueueOffset(offset) {
  try {
    localStorage.setItem(QUEUE_OFFSET_KEY, String(Math.max(0, offset)));
  } catch {
    // Refused preference storage leaves the current in-memory page usable.
  }
}

function bytesStartWith(bytes, values) {
  return values.every((value, index) => bytes[index] === value);
}

function ascii(bytes, start, length) {
  return new TextDecoder('ascii').decode(bytes.subarray(start, start + length));
}

async function detect(file) {
  if (!(file instanceof File)) throw new Error('Choose one local file first.');
  if (file.size > MAX_INSPECTION_BYTES) {
    throw new Error(`Browser inspection is limited to ${MAX_INSPECTION_BYTES} bytes per file.`);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  let format = 'unknown';
  let category = 'binary-encodings';
  let confidence = 'heuristic';
  if (ascii(bytes, 0, 5) === '%PDF-') {
    format = 'pdf'; category = 'documents-pdf'; confidence = 'signature';
  } else if (bytesStartWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    format = 'png'; category = 'images'; confidence = 'signature';
  } else if (bytesStartWith(bytes, [0xff, 0xd8, 0xff])) {
    format = 'jpeg'; category = 'images'; confidence = 'signature';
  } else if (ascii(bytes, 0, 6) === 'GIF87a' || ascii(bytes, 0, 6) === 'GIF89a') {
    format = 'gif'; category = 'images'; confidence = 'signature';
  } else if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
    format = 'webp'; category = 'images'; confidence = 'signature';
  } else if (bytesStartWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    format = 'zip'; category = 'archives'; confidence = 'signature';
  } else if (bytesStartWith(bytes, [0x1f, 0x8b])) {
    format = 'gzip'; category = 'archives'; confidence = 'signature';
  } else if (ascii(bytes, 0, 4) === 'OggS') {
    format = 'ogg'; category = 'audio'; confidence = 'signature';
  } else if (ascii(bytes, 0, 4) === 'fLaC') {
    format = 'flac'; category = 'audio'; confidence = 'signature';
  } else if (ascii(bytes, 4, 4) === 'ftyp') {
    format = 'mp4'; category = 'video'; confidence = 'signature';
  } else {
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      const trimmed = text.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        JSON.parse(trimmed);
        format = 'json';
        category = 'structured-data';
      } else {
        format = 'text';
        category = 'code-text';
      }
      confidence = 'content';
    } catch {
      format = 'binary';
      category = 'binary-encodings';
    }
  }
  return Object.freeze({ name: file.name, bytes: file.size, format, category, confidence });
}

function openQueueDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(QUEUE_DATABASE, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(QUEUE_STORE)) {
        const store = database.createObjectStore(QUEUE_STORE, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('The browser-local queue database could not be opened.'));
    request.onblocked = () => reject(new Error('The browser-local queue database upgrade is blocked by another page.'));
  });
}

async function addQueueRecord(record) {
  const database = await openQueueDatabase();
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(QUEUE_STORE, 'readwrite');
      transaction.objectStore(QUEUE_STORE).put(record);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('The browser-local queue record could not be saved.'));
      transaction.onabort = () => reject(transaction.error || new Error('The browser-local queue record was not saved.'));
    });
  } finally {
    database.close();
  }
}

async function readQueuePage(offset = 0) {
  const database = await openQueueDatabase();
  try {
    const total = await new Promise((resolve, reject) => {
      const request = database.transaction(QUEUE_STORE, 'readonly').objectStore(QUEUE_STORE).count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('The browser-local queue count could not be read.'));
    });
    const items = await new Promise((resolve, reject) => {
      const values = [];
      let advanced = false;
      const transaction = database.transaction(QUEUE_STORE, 'readonly');
      const request = transaction.objectStore(QUEUE_STORE).index('createdAt').openCursor(null, 'prev');
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor && offset > 0 && !advanced) {
          advanced = true;
          cursor.advance(offset);
          return;
        }
        if (!cursor || values.length >= QUEUE_PAGE_SIZE) {
          resolve(values);
          return;
        }
        values.push(cursor.value);
        cursor.continue();
      };
      request.onerror = () => reject(request.error || new Error('The browser-local queue page could not be read.'));
    });
    return { items, total, offset };
  } finally {
    database.close();
  }
}

export async function clearConverterQueue() {
  const database = await openQueueDatabase();
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(QUEUE_STORE, 'readwrite');
      transaction.objectStore(QUEUE_STORE).clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('The browser-local queue could not be cleared.'));
      transaction.onabort = () => reject(transaction.error || new Error('The browser-local queue was not cleared.'));
    });
  } finally {
    database.close();
  }
}

function renderQueue(root, page) {
  const list = $('[data-converter-queue]', root);
  const status = $('[data-converter-queue-status]', root);
  const previous = $('[data-converter-queue-previous]', root);
  const next = $('[data-converter-queue-next]', root);
  if (!list || !status) return;
  list.textContent = '';
  for (const record of page.items) {
    const item = document.createElement('li');
    item.className = 'md-list__item';
    const name = document.createElement('strong');
    name.textContent = record.name;
    const detail = document.createElement('span');
    detail.textContent = `${record.format} · ${record.bytes} bytes · ${record.state}`;
    item.append(name, detail);
    list.append(item);
  }
  status.textContent = page.total === 0
    ? 'No browser-local queue records.'
    : `${page.total} browser-local queue records. Showing ${page.offset + 1}-${page.offset + page.items.length} from a bounded page.`;
  if (previous) previous.disabled = page.offset <= 0;
  if (next) next.disabled = page.offset + page.items.length >= page.total;
}

function createMatcher(input, modeButton) {
  return () => {
    const query = input.value.trim();
    if (!query) return () => true;
    if (modeButton.getAttribute('aria-pressed') !== 'true') {
      const folded = query.toLocaleLowerCase();
      return (value) => value.toLocaleLowerCase().includes(folded);
    }
    try {
      const flags = input.dataset.regexFlags || 'iu';
      const pattern = new RegExp(query, flags);
      return (value) => {
        pattern.lastIndex = 0;
        return pattern.test(value);
      };
    } catch {
      return () => false;
    }
  };
}

function wireCategorySearches(root, regex) {
  for (const category of CATEGORIES) {
    const section = root.querySelector(`[data-converter-category="${category}"]`);
    if (!section) throw new Error(`File converter category is missing: ${category}`);
    const input = $('[data-converter-search]', section);
    const modeButton = $('[data-converter-search-mode]', section);
    const builderButton = $('[data-converter-search-builder]', section);
    const rows = $$('[data-converter-adapter]', section);
    if (!input || !modeButton || !builderButton) {
      throw new Error(`File converter search controls are incomplete: ${category}`);
    }
    const filter = () => {
      const matches = createMatcher(input, modeButton)();
      let visible = 0;
      for (const row of rows) {
        const shown = matches(row.textContent || '');
        row.hidden = !shown;
        if (shown) visible += 1;
      }
      const status = $('[data-converter-search-status]', section);
      if (status) status.textContent = `${visible} adapters match in ${category}.`;
    };
    input.addEventListener('input', filter);
    modeButton.addEventListener('click', () => {
      const active = modeButton.getAttribute('aria-pressed') !== 'true';
      modeButton.setAttribute('aria-pressed', String(active));
      filter();
    });
    regex.attachRegexBuilder(input, {
      trigger: builderButton,
      translate: (_key, fallback) => fallback,
      onApply: (pattern, flags) => {
        input.value = pattern;
        input.dataset.regexFlags = flags;
        modeButton.setAttribute('aria-pressed', 'true');
        filter();
      },
    });
  }
}

export function initConverter({ regex, i18n, ui }) {
  const root = document.querySelector('[data-tab-panel="converter"]');
  if (!root || root.dataset.converterReady === 'true') return;
  root.dataset.converterReady = 'true';
  i18n.register({
    'converter.title': { en: 'Browser-local file converter', yue: '瀏覽器本機檔案轉換器' },
    'converter.boundary': {
      en: 'This documentation page can inspect a file you choose and keep local queue metadata in this browser. It cannot write desktop files or call the desktop host.',
      yue: '呢個文件頁可以檢查你揀嘅檔案，亦可以將本機隊列資料留喺呢個瀏覽器。佢唔可以寫入桌面檔案，亦唔會呼叫桌面主機。',
    },
  });
  i18n.applyI18n(root);
  wireCategorySearches(root, regex);
  const source = $('[data-converter-source]', root);
  const inspectButton = $('[data-converter-inspect]', root);
  const enqueueButton = $('[data-converter-enqueue]', root);
  const clearButton = $('[data-converter-clear]', root);
  const previousButton = $('[data-converter-queue-previous]', root);
  const nextButton = $('[data-converter-queue-next]', root);
  const clearGate = $('[data-converter-clear-gate]', root);
  const clearGateCount = $('[data-converter-clear-count]', root);
  const clearGateKeys = $$('[data-converter-clear-key]', root);
  const clearGateSlider = $('[data-converter-clear-slider]', root);
  const clearGateCancel = $('[data-converter-clear-cancel]', root);
  const clearGateStatus = $('#converter-clear-gate-status', root);
  const status = $('[data-converter-status]', root);
  let inspection = null;
  let queueOffset = readQueueOffset();
  const refreshQueue = async () => {
    let page = await readQueuePage(queueOffset);
    if (page.total > 0 && page.items.length === 0 && queueOffset > 0) {
      queueOffset = Math.max(0, Math.floor((page.total - 1) / QUEUE_PAGE_SIZE) * QUEUE_PAGE_SIZE);
      page = await readQueuePage(queueOffset);
    }
    writeQueueOffset(queueOffset);
    renderQueue(root, page);
  };
  void refreshQueue().catch((error) => {
    if (status) status.textContent = error instanceof Error ? error.message : String(error);
  });
  const inspectSelected = async () => {
    const file = source?.files?.[0];
    inspection = await detect(file);
    if (status) {
      status.textContent = `${inspection.name}: ${inspection.format}, ${inspection.category}, ${inspection.bytes} bytes, ${inspection.confidence} detection.`;
    }
    return inspection;
  };
  inspectButton?.addEventListener('click', () => {
    void inspectSelected().catch((error) => {
      inspection = null;
      if (status) status.textContent = error instanceof Error ? error.message : String(error);
    });
  });
  enqueueButton?.addEventListener('click', () => {
    void (async () => {
      const current = inspection ?? await inspectSelected();
      await addQueueRecord({
        id: crypto.randomUUID(),
        name: current.name,
        bytes: current.bytes,
        format: current.format,
        category: current.category,
        state: 'inspected-only',
        createdAt: Date.now(),
      });
      await refreshQueue();
      ui.notify({ title: 'Browser-local queue updated', tone: 'info' });
    })().catch((error) => {
      if (status) status.textContent = error instanceof Error ? error.message : String(error);
    });
  });
  const closeClearGate = () => {
    if (clearGate) clearGate.hidden = true;
    for (const key of clearGateKeys) key.checked = false;
    if (clearGateSlider) {
      clearGateSlider.value = '0';
      clearGateSlider.disabled = true;
    }
    clearButton?.focus();
  };
  const updateClearGate = () => {
    const ready = clearGateKeys.length === 2 && clearGateKeys.every((key) => key.checked);
    if (clearGateSlider) clearGateSlider.disabled = !ready;
    if (clearGateStatus) {
      clearGateStatus.textContent = ready
        ? 'Move the slider to 100 to clear the exact queue record count shown above.'
        : 'Operate both keys to enable the full-range slider.';
    }
  };
  clearButton?.addEventListener('click', () => {
    void readQueuePage(0).then((page) => {
      if (page.total === 0) {
        if (status) status.textContent = 'The browser-local queue is already empty.';
        return;
      }
      if (clearGateCount) clearGateCount.textContent = `This action will remove exactly ${page.total} browser-local queue records.`;
      if (clearGate) clearGate.hidden = false;
      updateClearGate();
      clearGateKeys[0]?.focus();
    }).catch((error) => {
      if (status) status.textContent = error instanceof Error ? error.message : String(error);
    });
  });
  for (const key of clearGateKeys) key.addEventListener('change', updateClearGate);
  clearGateCancel?.addEventListener('click', closeClearGate);
  clearGate?.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeClearGate();
    }
  });
  clearGateSlider?.addEventListener('input', () => {
    if (clearGateSlider.disabled || Number(clearGateSlider.value) < 100) return;
    clearGateSlider.disabled = true;
    void clearConverterQueue().then(async () => {
      queueOffset = 0;
      await refreshQueue();
      ui.notify({ title: 'Browser-local queue cleared', tone: 'info' });
      closeClearGate();
    }).catch((error) => {
      if (clearGateStatus) clearGateStatus.textContent = error instanceof Error ? error.message : String(error);
      updateClearGate();
    });
  });
  previousButton?.addEventListener('click', () => {
    queueOffset = Math.max(0, queueOffset - QUEUE_PAGE_SIZE);
    void refreshQueue();
  });
  nextButton?.addEventListener('click', () => {
    queueOffset += QUEUE_PAGE_SIZE;
    void refreshQueue();
  });
}

export { CATEGORIES, detect };

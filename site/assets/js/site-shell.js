/*
 * site-shell.js
 *
 * Cross-feature shell behavior for the static documentation surface. Deep
 * feature engines remain in their own modules. This file owns the navigation
 * contract that every engine can use: settings tabs, tab groups and docking,
 * four independent tab searches, bulk-close previews, target-specific context
 * menus, picker filters, front-screen provenance, and the hand-written surface
 * inventory hook.
 */

import * as i18n from './i18n.js';
import * as regex from './regex.js';
import * as tabs from './tabs.js';

const SHELL_STORAGE_KEY = 'md-designer.site.shell.v2';
const SETTINGS_STORAGE_KEY = 'md-designer.site.settings-tabs.v2';
const SETTINGS_DEFAULT_EDGE = 'left';
const EDGES = Object.freeze(['left', 'right', 'top', 'bottom']);
let popoverSequence = 0;

const NESTED_SURFACES = Object.freeze([
  ['overview-status', 'ov-status-title'], ['overview-what', 'ov-what-title'], ['overview-adds', 'ov-adds-title'], ['overview-verified', 'ov-verified-title'],
  ['features-today', 'ft-today-title'], ['features-network', 'ft-network-title'], ['features-building', 'ft-building-title'], ['features-design', 'ft-design-title'],
  ['install-main', 'in-title'], ['install-will', 'in-will-title'], ['install-until', 'in-until-title'],
  ['releases-main', 'rl-title'], ['releases-contains', 'rl-contains-title'], ['releases-tag', 'rl-tag-title'], ['releases-codename', 'rl-codename-title'], ['releases-lines', 'rl-lines-title'], ['releases-evidence', 'rl-evidence-title'], ['releases-caveat', 'rl-caveat-title'],
  ['building-main', 'bd-title'], ['verifying-main', 'vf-title'], ['standards-main', 'st-title'],
  ['docs-main', 'dc-title'], ['docs-start', 'dc-start-title'], ['docs-categories', 'dc-cat-title'], ['docs-articles', 'dc-articles-title'], ['docs-convention', 'dc-convention-title'], ['docs-outside', 'dc-outside-title'],
  ['provenance-main', 'pv-title'],
]);

const INVENTORY = Object.freeze({
  pages: Object.freeze([
    'overview', 'features', 'install', 'releases', 'building',
    'verifying', 'standards', 'docs', 'provenance', 'settings',
  ]),
  settings: Object.freeze([
    'settings-language', 'settings-tone', 'settings-appearance',
    'settings-toy-locks', 'settings-reset',
  ]),
  tabSearches: Object.freeze(['strip', 'group-members', 'groups', 'master']),
  contextActions: Object.freeze(['appearance', 'lock']),
  nestedSurfaces: Object.freeze(NESTED_SURFACES.map(([id, labelledBy]) => Object.freeze({ id, labelledBy, search: `nested-${id}-search` }))),
});

const STRINGS = Object.freeze({
  'shell.tabs.find': { en: 'Find tabs', yue: '搵分頁' },
  'shell.tabs.groups': { en: 'Tab groups', yue: '分頁群組' },
  'shell.tabs.bulk': { en: 'Bulk close', yue: '批量關閉' },
  'shell.tabs.dock': { en: 'Dock tabs', yue: '停泊分頁' },
  'shell.tabs.closed': { en: 'Closed tabs', yue: '已關閉分頁' },
  'shell.tabs.scope.strip': { en: 'Current tab strip', yue: '目前分頁條' },
  'shell.tabs.scope.group': { en: 'Inside each group', yue: '每個群組入面' },
  'shell.tabs.scope.groups': { en: 'Tab groups by name', yue: '按名搵分頁群組' },
  'shell.tabs.scope.master': { en: 'Master search across open tabs', yue: '全域搵所有開啟分頁' },
  'shell.tabs.closeContaining': { en: 'Close tabs containing text', yue: '關閉包含文字嘅分頁' },
  'shell.tabs.closeNotContaining': { en: 'Close tabs not containing text', yue: '關閉唔包含文字嘅分頁' },
  'shell.tabs.includePinned': { en: 'Include pinned tabs', yue: '包括釘住嘅分頁' },
  'shell.tabs.preview': { en: '{count} tabs match. Pinned tabs are excluded unless included.', yue: '有 {count} 個分頁夾到。釘住嘅分頁除非揀咗，否則唔會郁。' },
  'shell.tabs.noMatch': { en: 'No tabs match this bounded search.', yue: '冇分頁夾到呢個有限搜尋。' },
  'shell.tabs.reopen': { en: 'Reopen', yue: '重新開啟' },
  'shell.settings.layout': { en: 'Settings layout', yue: '設定版面' },
  'shell.settings.createGroup': { en: 'Create group', yue: '建立群組' },
  'shell.settings.groupName': { en: 'New group name', yue: '新群組名' },
  'shell.settings.move': { en: 'Move into group', yue: '移入群組' },
  'shell.settings.sections': { en: 'Settings sections', yue: '設定部分' },
  'shell.settings.general': { en: 'General', yue: '一般' },
  'shell.settings.pinned': { en: 'Pinned settings', yue: '釘住嘅設定' },
  'shell.settings.docking': { en: 'Settings tab docking', yue: '設定分頁停泊位置' },
  'shell.settings.groups': { en: 'Settings groups', yue: '設定群組' },
  'se.reset.all.title': { en: 'Confirm reset of site settings', yue: '確認重設網站設定' },
  'shell.settings.emptyGroup': { en: 'This settings group is empty. Move a settings tab into it from its context menu.', yue: '呢個設定群組而家係空嘅，可以喺內容選單將設定分頁移入嚟。' },
  'shell.settings.none': { en: 'No settings match this search.', yue: '冇設定夾到呢個搜尋。' },
  'shell.dock.left': { en: 'Left', yue: '左' },
  'shell.dock.right': { en: 'Right', yue: '右' },
  'shell.dock.top': { en: 'Top', yue: '上' },
  'shell.dock.bottom': { en: 'Bottom', yue: '下' },
  'shell.context.appearance': { en: 'Edit appearance…', yue: '編輯外觀…' },
  'shell.context.lock': { en: 'Lock this element…', yue: '鎖定呢個元素…' },
  'shell.context.unavailable': { en: 'Editor unavailable', yue: 'Editor 暫時用唔到' },
  'shell.context.actions': { en: 'Element actions', yue: '元素動作' },
  'shell.context.open': { en: 'Open destination', yue: '開啟目的地' },
  'shell.context.copy': { en: 'Copy accessible name', yue: '複製無障礙名稱' },
  'shell.dropdown.filter': { en: 'Filter choices', yue: '篩選選項' },
  'shell.dropdown.empty': { en: 'No choices match this search.', yue: '冇選項夾到呢個搜尋。' },
  'shell.group.search': { en: 'Search tab groups by name', yue: '按名搵分頁群組' },
  'shell.group.newName': { en: 'New group name', yue: '新群組名' },
  'shell.group.create': { en: 'Create group', yue: '建立群組' },
  'shell.group.pin': { en: 'Pin group', yue: '釘住群組' },
  'shell.group.unpin': { en: 'Unpin group', yue: '解開群組' },
  'shell.group.expand': { en: 'Expand', yue: '展開' },
  'shell.group.collapse': { en: 'Collapse', yue: '收埋' },
  'shell.group.up': { en: 'Up', yue: '上移' },
  'shell.group.down': { en: 'Down', yue: '下移' },
  'shell.group.remove': { en: 'Remove group', yue: '移除群組' },
  'shell.group.rename': { en: 'Rename', yue: '改名' },
  'shell.group.color': { en: 'Color', yue: '顏色' },
  'shell.close.confirm': { en: 'Confirm the tab close', yue: '確認關閉分頁' },
  'shell.close.keyOne': { en: 'Confirmation key 1', yue: '確認鍵 1' },
  'shell.close.keyTwo': { en: 'Confirmation key 2', yue: '確認鍵 2' },
  'shell.close.slider': { en: 'Slide to confirm closing tabs', yue: '滑到底確認關閉分頁' },
  'shell.close.exit': { en: 'Emergency exit', yue: '緊急離開' },
  'shell.close.action': { en: 'Close reviewed tabs', yue: '關閉已審閱分頁' },
  'shell.close.includeLocked': { en: 'Include locked tabs', yue: '包括鎖定分頁' },
  'shell.close.enter': { en: 'Enter text or enable regex before closing tabs.', yue: '關閉分頁前請輸入文字或者開啟 regex。' },
  'shell.close.ready': { en: 'Confirmation ready. Slider completion: {percent}%.', yue: '確認完成，滑動進度：{percent}%。' },
  'shell.close.needsKeys': { en: 'Two independent confirmation keys are required before the slider becomes active.', yue: '滑桿啟用前需要兩個獨立確認鍵。' },
  'shell.close.summary': { en: '{count} tab(s) will close. {excluded} excluded by current protection choices.', yue: '將會關閉 {count} 個分頁，按目前保護選擇排除 {excluded} 個。' },
  'shell.close.newExclusions': { en: 'New exclusions: {items}. Review the protection choices again.', yue: '新排除項目：{items}。請重新檢查保護選擇。' },
  'shell.close.completed': { en: 'Confirmation completed. Applying the reviewed action.', yue: '確認完成，依家套用已檢查嘅動作。' },
  'shell.context.search': { en: 'Search actions', yue: '搵動作' },
  'shell.context.noMatch': { en: 'No actions match this search.', yue: '冇動作夾到呢個搜尋。' },
  'shell.consumer.unavailable': { en: 'This editor is not connected on this surface yet. The action was not applied.', yue: '呢個 editor 暫時未接駁到呢個表面，未有套用任何動作。' },
  'shell.context.confirmed': { en: '{count} tab(s) closed. {skipped} skipped.', yue: '已關閉 {count} 個分頁，跳過 {skipped} 個。' },
  'shell.page.matches': { en: '{count} sections match', yue: '有 {count} 個區段夾到' },
  'shell.page.noMatch': { en: 'No content matches this search.', yue: '冇內容夾到呢個搜尋。' },
  'shell.search.invalid': { en: 'Invalid pattern', yue: '表達式有錯' },
  'shell.group.noMatch': { en: 'No groups match this search.', yue: '冇群組夾到呢個搜尋。' },
  'shell.dropdown.count': { en: '{count} choices', yue: '{count} 個選項' },
  'shell.dropdown.choose': { en: 'Choose an option', yue: '選擇一個選項' },
  'shell.dropdown.choices': { en: 'Choices', yue: '選項' },
  'shell.search.builderUnavailable': { en: 'Pattern builder unavailable. Plain-text search remains available.', yue: 'Pattern 產生器暫時用唔到，純文字搜尋仍然可以用。' },
  'shell.provenance.version': { en: 'Version', yue: '版本' },
  'shell.provenance.updated': { en: 'Updated at', yue: '更新時間' },
  'shell.provenance.unavailable': { en: 'Unavailable until build provenance is supplied.', yue: '未有建置出處，所以暫時未能提供。' },
  'shell.provenance.invalid': { en: 'Build provenance is present but invalid.', yue: '建置出處存在，但格式唔啱。' },
  'shell.provenance.recorded': { en: 'Provenance recorded in the build metadata.', yue: '出處已記錄喺建置 metadata 入面。' },
  'shell.action.changed': { en: 'The action changed while confirmation was open. Review the exclusions and try again.', yue: '確認期間動作有變，請重新檢查排除項目再試。' },
  'shell.destructive.body': { en: 'This action changes {kind}. Review it before confirming.', yue: '呢個動作會改變 {kind}，確認之前請先檢查。' },
  'shell.destructive.title': { en: 'Confirm destructive action', yue: '確認破壞性動作' },
  'shell.tabs.pinnedSuffix': { en: 'Pinned', yue: '已釘住' },
  'shell.tabs.closedSuffix': { en: 'Closed', yue: '已關閉' },
  'shell.tabs.noLongerMatches': { en: 'no longer matches', yue: '已經唔再相符' },
  'shell.tabs.noLongerOpen': { en: 'no longer open', yue: '已經唔再開啟' },
});

function registerStrings() {
  try {
    i18n.register(STRINGS);
    i18n.applyI18n?.(document);
  } catch (error) { console.warn('[site-shell] string registration failed', error); }
}

function text(key, fallback) {
  try { return i18n.has(key) ? i18n.t(key) : fallback; } catch { return fallback; }
}

function bilingual(key, fallbackEn, fallbackYue = fallbackEn) {
  try {
    if (i18n.has(key) && typeof i18n.tParts === 'function') {
      const parts = i18n.tParts(key);
      return parts.secondary ? `${parts.primary} · ${parts.secondary}` : parts.primary;
    }
  } catch { /* fall back to the public neutral strings */ }
  return fallbackEn === fallbackYue ? fallbackEn : `${fallbackEn} · ${fallbackYue}`;
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, String(value));
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const value = JSON.parse(raw);
    return value && typeof value === 'object' ? value : fallback;
  } catch { return fallback; }
}

function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

function makeSearchField({ id, label, onChange, sample = '' }) {
  const input = el('input', {
    type: 'search', id, class: 'md-shell-search__input',
    autocomplete: 'off', spellcheck: 'false', placeholder: label,
    'aria-label': label, 'data-regex-builder': '', 'data-regex-key': `site-shell.${id}`,
  });
  if (sample) input.value = sample;
  const mode = el('button', {
    type: 'button', class: 'md-shell-search__mode', text: '.*',
    'aria-pressed': 'false', 'aria-label': text('search.mode.regex', 'Use a regular expression'),
  });
  const builderButton = el('button', {
    type: 'button', class: 'md-shell-search__builder', text: '⌘',
    'aria-haspopup': 'dialog', 'aria-expanded': 'false',
    'aria-label': text('regex.builder.open', 'Open the pattern builder'),
  });
  const root = el('div', { class: 'md-shell-search', 'data-shell-search': id }, input, mode, builderButton);
  let controller = null;
  try {
    controller = regex.attachRegexBuilder(input, {
      key: `site-shell.${id}`,
      trigger: builderButton,
      modeToggle: mode,
      dialect: 'ECMAScript (JavaScript RegExp)',
      onChange: () => onChange?.(api),
    });
  } catch (error) {
    root.dataset.builderError = 'true';
    root.dataset.builderState = 'unavailable';
    const unavailable = text('shell.search.builderUnavailable', 'Pattern builder unavailable. Plain-text search remains available.');
    mode.disabled = true;
    mode.setAttribute('aria-disabled', 'true');
    builderButton.disabled = true;
    builderButton.setAttribute('aria-disabled', 'true');
    builderButton.setAttribute('aria-label', unavailable);
    builderButton.title = unavailable;
    console.warn('[site-shell] builder attachment failed', id, error);
  }
  root.dataset.builderCallback = controller ? 'owner' : 'unavailable';

  let api;
  api = {
    root, input, mode, builderButton, controller,
    get matcher() {
      if (!controller) {
        const query = input.value.trim().toLowerCase();
        return { ok: true, empty: !query, test: (value) => !query || String(value).toLowerCase().includes(query) };
      }
      const state = controller.getState();
      const fn = controller.matcher();
      fn.reset?.();
      return { ok: state.valid && fn.isUsable(), empty: !input.value.trim(), error: state.error, test: (value) => fn(String(value ?? '')) };
    },
    refresh() { onChange?.(api); },
  };
  input.addEventListener('input', () => onChange?.(api));
  return api;
}

function createPopover(anchor, label, contentBuilder) {
  const panelId = `md-shell-popover-${++popoverSequence}`;
  const panel = el('div', { class: 'md-shell-popover', id: panelId, role: 'dialog', 'aria-label': label, hidden: true });
  panel.style.resize = 'both';
  panel.style.minWidth = '280px';
  panel.style.minHeight = '120px';
  document.body.append(panel);
  const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (open) position(); }) : null;
  resizeObserver?.observe(panel);
  if (anchor instanceof Element) {
    anchor.setAttribute('aria-haspopup', 'dialog');
    anchor.setAttribute('aria-controls', panelId);
    anchor.setAttribute('aria-expanded', 'false');
  }
  let open = false;
  let manualPosition = false;
  let drag = null;
  const identityAttribute = anchor instanceof Element
    ? [...anchor.attributes].find((attribute) => attribute.name.startsWith('data-'))
    : null;
  const anchorIdentity = anchor instanceof Element
    ? (anchor.id || (identityAttribute ? `${identityAttribute.name}=${identityAttribute.value}` : ''))
    : '';
  const geometryKey = String(anchorIdentity || `shell:${label}`).slice(0, 120);
  panel.dataset.geometryId = geometryKey;
  const geometry = () => readJson(SHELL_STORAGE_KEY, {}).popovers?.[geometryKey] || null;
  const saveGeometry = () => {
    const all = readJson(SHELL_STORAGE_KEY, {});
    all.popovers = all.popovers && typeof all.popovers === 'object' ? all.popovers : {};
    all.popovers[geometryKey] = {
      left: Number.parseInt(panel.style.left, 10) || undefined,
      top: Number.parseInt(panel.style.top, 10) || undefined,
      width: panel.offsetWidth,
      height: panel.offsetHeight,
    };
    writeJson(SHELL_STORAGE_KEY, all);
  };
  const clamp = (value, size, limit) => Math.max(10, Math.min(Math.max(10, limit - size - 10), value));
  const position = () => {
    if (!open) return;
    const saved = geometry();
    const rect = anchor.getBoundingClientRect();
    panel.hidden = false;
    panel.style.visibility = 'hidden';
    if (saved?.width) panel.style.width = `${saved.width}px`;
    if (saved?.height) panel.style.height = `${saved.height}px`;
    const width = panel.offsetWidth;
    const height = panel.offsetHeight;
    const margin = 10;
    if (manualPosition || saved?.left !== undefined && saved?.top !== undefined) {
      manualPosition = true;
      panel.style.left = `${clamp(saved?.left ?? (Number.parseInt(panel.style.left, 10) || rect.left), width, window.innerWidth)}px`;
      panel.style.top = `${clamp(saved?.top ?? (Number.parseInt(panel.style.top, 10) || rect.bottom + 8), height, window.innerHeight)}px`;
      panel.style.visibility = '';
      return;
    }
    let left = Math.min(rect.left, window.innerWidth - width - margin);
    let top = rect.bottom + 8;
    if (left < margin) left = margin;
    if (top + height > window.innerHeight - margin) top = Math.max(margin, rect.top - height - 8);
    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(top)}px`;
    panel.style.visibility = '';
  };
  const close = (restore = true) => {
    if (!open) return;
    open = false; panel.hidden = true;
    if (anchor instanceof Element) anchor.setAttribute('aria-expanded', 'false');
    panel.querySelectorAll('[data-regex-builder]').forEach((input) => regex.getBuilder?.(input)?.destroy?.());
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', keydown, true);
    window.removeEventListener('resize', position);
    window.removeEventListener('scroll', position, true);
    if (restore && anchor.isConnected) anchor.focus();
  };
  const outside = (event) => {
    if (!open || panel.contains(event.target) || anchor.contains(event.target)) return;
    if (event.target instanceof Element && event.target.closest('.mdrx-pop')) return;
    const shellOwner = event.target instanceof Element ? event.target.closest('.md-shell-popover') : null;
    if (shellOwner && shellOwner !== panel) return;
    close();
  };
  const keydown = (event) => {
    if (event.key === 'Escape') {
      if (event.target instanceof Element && event.target.closest('.mdrx-pop')) return;
      const shellOwner = event.target instanceof Element ? event.target.closest('.md-shell-popover') : null;
      if (shellOwner && shellOwner !== panel) return;
      event.preventDefault(); event.stopPropagation(); close();
      return;
    }
    if (event.altKey && event.key.startsWith('Arrow')) {
      event.preventDefault(); event.stopPropagation();
      manualPosition = true;
      const left = Number.parseInt(panel.style.left, 10) || 10;
      const top = Number.parseInt(panel.style.top, 10) || 10;
      if (event.ctrlKey) {
        panel.style.width = `${Math.max(280, panel.offsetWidth + (event.key === 'ArrowRight' ? 24 : event.key === 'ArrowLeft' ? -24 : 0))}px`;
        panel.style.height = `${Math.max(120, panel.offsetHeight + (event.key === 'ArrowDown' ? 24 : event.key === 'ArrowUp' ? -24 : 0))}px`;
      } else {
        panel.style.left = `${clamp(left + (event.key === 'ArrowRight' ? 16 : event.key === 'ArrowLeft' ? -16 : 0), panel.offsetWidth, window.innerWidth)}px`;
        panel.style.top = `${clamp(top + (event.key === 'ArrowDown' ? 16 : event.key === 'ArrowUp' ? -16 : 0), panel.offsetHeight, window.innerHeight)}px`;
      }
      saveGeometry();
      return;
    }
  };
  panel.addEventListener('pointerdown', (event) => {
    const handle = event.target instanceof Element ? event.target.closest('.md-shell-popover__head') : null;
    if (!handle || event.target.closest('button,input,select,textarea')) return;
    manualPosition = true;
    drag = { x: event.clientX, y: event.clientY, left: panel.offsetLeft, top: panel.offsetTop };
    panel.setPointerCapture?.(event.pointerId);
  });
  panel.addEventListener('pointermove', (event) => {
    if (!drag) return;
    panel.style.left = `${clamp(drag.left + event.clientX - drag.x, panel.offsetWidth, window.innerWidth)}px`;
    panel.style.top = `${clamp(drag.top + event.clientY - drag.y, panel.offsetHeight, window.innerHeight)}px`;
  });
  panel.addEventListener('pointerup', (event) => { if (drag) { drag = null; panel.releasePointerCapture?.(event.pointerId); saveGeometry(); } });
  return {
    panel,
    open() { if (open) return; open = true; panel.hidden = false; if (anchor instanceof Element) anchor.setAttribute('aria-expanded', 'true'); contentBuilder?.(panel); position(); document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', keydown, true); window.addEventListener('resize', position); window.addEventListener('scroll', position, true); },
    close,
    toggle() { open ? close() : this.open(); },
    reposition: position,
    destroy(restore = true) { close(restore); resizeObserver?.disconnect(); panel.remove(); },
    get isOpen() { return open; },
  };
}

function updateSettingLabels() {
  document.querySelectorAll('[data-shell-settings-tab]').forEach((node) => {
    const id = node.dataset.shellSettingsTab;
    const group = document.getElementById(id);
    if (!group) return;
    const heading = group.querySelector('h3');
    if (heading) node.textContent = heading.textContent.trim();
    node.setAttribute('aria-label', node.textContent.trim());
  });
}

function loadSettingsState(ids) {
  const saved = readJson(SETTINGS_STORAGE_KEY, {});
  const order = Array.isArray(saved.order) ? saved.order.filter((id) => ids.includes(id)) : [];
  for (const id of ids) if (!order.includes(id)) order.push(id);
  const groups = saved.groups && typeof saved.groups === 'object' ? saved.groups : {};
  if (!groups.general) groups.general = { id: 'general', name: text('shell.settings.general', 'General'), tabs: [], collapsed: false, pinned: false, color: '' };
  const assigned = new Set();
  for (const [groupId, group] of Object.entries(groups)) {
    if (!group || typeof group !== 'object') { delete groups[groupId]; continue; }
    if (!Array.isArray(group.tabs)) { group.tabs = []; continue; }
    group.tabs = group.tabs.filter((id) => ids.includes(id) && !assigned.has(id));
    group.id = String(group.id || 'general');
    group.name = String(group.name || group.id);
    group.collapsed = Boolean(group.collapsed);
    group.pinned = Boolean(group.pinned);
    for (const id of group.tabs) assigned.add(id);
  }
  for (const id of order) if (!assigned.has(id)) groups.general.tabs.push(id);
  const active = ids.includes(saved.active) ? saved.active : order[0];
  const pinned = new Set(Array.isArray(saved.pinned) ? saved.pinned.filter((id) => ids.includes(id)) : []);
  const edge = EDGES.includes(saved.edge) ? saved.edge : SETTINGS_DEFAULT_EDGE;
  return { order, active, pinned, groups, edge };
}

function saveSettingsState(state) {
  writeJson(SETTINGS_STORAGE_KEY, {
    order: state.order, active: state.active, pinned: [...state.pinned], groups: state.groups, edge: state.edge,
  });
}

function settingsGroupFor(state, id) {
  return Object.values(state.groups).find((group) => group.tabs.includes(id)) || state.groups.general;
}

function renderSettingsShell() {
  const root = document.querySelector('#tab-panel-settings');
  const settings = root?.querySelector('.settings');
  const main = settings?.querySelector('.settings__main');
  const aside = settings?.querySelector('.settings__aside');
  if (!root || !settings || !main || !aside || settings.dataset.shellReady === 'true') return null;
  settings.dataset.shellReady = 'true';

  const groups = [...main.querySelectorAll(':scope > .settings-group')];
  const ids = groups.map((group) => group.id).filter(Boolean);
  const state = loadSettingsState(ids);
  aside.replaceChildren();
  aside.className = 'settings__tabs';
  aside.setAttribute('aria-label', text('shell.settings.sections', 'Settings sections'));
  aside.dataset.edge = state.edge;
  settings.dataset.edge = state.edge;

  const isSettingsVertical = () => (state.edge === 'left' || state.edge === 'right') && !(window.matchMedia?.('(max-width: 720px)').matches);
  const tablist = el('div', { class: 'settings__tablist', role: 'tablist', 'aria-orientation': isSettingsVertical() ? 'vertical' : 'horizontal' });
  const toolbar = el('div', { class: 'settings__tab-tools' });
  const layoutButton = el('button', { type: 'button', class: 'md-btn md-btn--text', text: bilingual('shell.settings.layout', 'Settings layout', '設定版面'), 'data-settings-layout': '' });
  toolbar.append(layoutButton);
  aside.append(toolbar, tablist);

  const panelRoot = el('div', { class: 'settings__panels' });
  const globalSearch = main.querySelector('#settings-search');
  const globalStatus = main.querySelector('#settings-search-status');
  if (globalSearch) globalSearch.setAttribute('data-shell-global-search', 'true');
  main.append(panelRoot);

  const settingsTabs = new Map();
  const settingsPanels = new Map();
  const perTabSearches = new Map();

  for (const group of groups) {
    const panel = el('section', {
      class: 'settings__panel', id: `settings-panel-${group.id}`, role: 'tabpanel',
      tabindex: '0', 'aria-labelledby': `settings-tab-${group.id}`,
    });
    const heading = group.querySelector('h3')?.textContent.trim() || group.id;
    const search = makeSearchField({
      id: `settings-${group.id}-search`,
      label: `${text('settings.search.label', 'Search settings')}: ${heading}`,
      onChange: (field) => {
        const matcher = field.matcher;
        const rows = [...group.querySelectorAll('[data-setting-unit]')];
        const query = field.input.value.trim();
        group.hidden = Boolean(query) && !matcher.ok;
        for (const row of rows) row.hidden = Boolean(query) && (!matcher.ok || !matcher.test(row.textContent.replace(/\s+/g, ' ').trim()));
        const visible = rows.some((row) => !row.hidden);
        if (query && !visible) {
          if (!group.querySelector(':scope > .settings__tab-no-match')) group.append(el('p', { class: 'settings__tab-no-match', text: text('shell.settings.none', 'No settings match this search.') }));
        } else group.querySelector(':scope > .settings__tab-no-match')?.remove();
        if (query && matcher.ok) panel.dataset.filtered = 'true'; else delete panel.dataset.filtered;
      },
    });
    panel.append(search.root, group);
    panelRoot.append(panel);
    perTabSearches.set(group.id, search);
    settingsPanels.set(group.id, panel);
    const tab = el('button', {
      type: 'button', class: 'settings__tab', role: 'tab', id: `settings-tab-${group.id}`,
      'aria-controls': panel.id, 'data-shell-settings-tab': group.id,
      draggable: 'true', tabindex: '-1',
    });
    tab.addEventListener('click', () => activateSettingsTab(group.id, true));
    tab.addEventListener('keydown', (event) => {
      const visible = state.order;
      const index = visible.indexOf(group.id);
      const vertical = isSettingsVertical();
      const previousKey = vertical ? 'ArrowUp' : 'ArrowLeft';
      const nextKey = vertical ? 'ArrowDown' : 'ArrowRight';
      if ((event.ctrlKey || event.metaKey) && event.key === previousKey) {
        event.preventDefault(); moveSettingsTab(group.id, -1); return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key === nextKey) {
        event.preventDefault(); moveSettingsTab(group.id, 1); return;
      }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'p') {
        event.preventDefault(); state.pinned.has(group.id) ? state.pinned.delete(group.id) : state.pinned.add(group.id); saveSettingsState(state); renderSettingsNav(); tab.focus(); return;
      }
      if (event.key === previousKey) { event.preventDefault(); activateSettingsTab(visible[(index - 1 + visible.length) % visible.length], true); }
      else if (event.key === nextKey) { event.preventDefault(); activateSettingsTab(visible[(index + 1) % visible.length], true); }
      else if (event.key === 'Home') { event.preventDefault(); activateSettingsTab(visible[0], true); }
      else if (event.key === 'End') { event.preventDefault(); activateSettingsTab(visible[visible.length - 1], true); }
      else if (event.key === 'ContextMenu' || event.key === 'F10' && event.shiftKey) { event.preventDefault(); openSettingsContext(group.id, tab); }
    });
    tab.addEventListener('contextmenu', (event) => { event.preventDefault(); openSettingsContext(group.id, tab, event.clientX, event.clientY); });
    tab.addEventListener('dragstart', (event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', group.id); tab.dataset.dragging = 'true'; });
    tab.addEventListener('dragend', () => { delete tab.dataset.dragging; });
    tab.addEventListener('dragover', (event) => { event.preventDefault(); tab.dataset.drop = 'true'; });
    tab.addEventListener('dragleave', () => { delete tab.dataset.drop; });
    tab.addEventListener('drop', (event) => { event.preventDefault(); const dragged = event.dataTransfer.getData('text/plain'); delete tab.dataset.drop; if (dragged && dragged !== group.id) moveSettingsBefore(dragged, group.id); });
    settingsTabs.set(group.id, tab);
  }

  function renderSettingsNav() {
    tablist.replaceChildren();
    const vertical = isSettingsVertical();
    tablist.setAttribute('aria-orientation', vertical ? 'vertical' : 'horizontal');
    const pinnedRegion = el('div', { class: 'settings__pinned-region', role: 'group', 'aria-label': text('shell.settings.pinned', 'Pinned settings') });
    for (const id of state.order) {
      if (!state.pinned.has(id)) continue;
      const tab = settingsTabs.get(id);
      if (!tab) continue;
      tab.hidden = false;
      tab.dataset.pinned = 'true';
      pinnedRegion.append(tab);
    }
    if (pinnedRegion.children.length) tablist.append(pinnedRegion);
    const buckets = Object.values(state.groups).sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)));
    for (const bucket of buckets) {
      const header = el('div', { class: 'settings__group-header', role: 'presentation' }, el('span', { text: bucket.name }), el('button', { type: 'button', class: 'settings__group-collapse', text: bucket.collapsed ? '+' : '−', 'aria-label': `${text(bucket.collapsed ? 'shell.group.expand' : 'shell.group.collapse', bucket.collapsed ? 'Expand' : 'Collapse')} ${bucket.name}`, 'aria-expanded': String(!bucket.collapsed) }));
      header.dataset.shellSettingsGroupId = bucket.id;
      if (bucket.color) header.style.borderInlineStart = `3px solid ${bucket.color}`;
      header.querySelector('button').addEventListener('click', () => { bucket.collapsed = !bucket.collapsed; saveSettingsState(state); renderSettingsNav(); });
      header.addEventListener('contextmenu', (event) => { event.preventDefault(); document.dispatchEvent(new CustomEvent('md:site-context-request', { detail: { element: header, target: `settings-group:${bucket.id}`, x: event.clientX, y: event.clientY } })); });
      tablist.append(header);
      if (!bucket.tabs.length) tablist.append(el('p', { class: 'settings__group-empty', text: text('shell.settings.emptyGroup', 'This settings group is empty. Move a settings tab into it from its context menu.') }));
      for (const id of state.order) {
        if (!bucket.tabs.includes(id)) continue;
        if (state.pinned.has(id)) continue;
        const tab = settingsTabs.get(id);
        if (!tab) continue;
        tab.hidden = bucket.collapsed && id !== state.active;
        tab.dataset.pinned = String(state.pinned.has(id));
        tablist.append(tab);
      }
    }
    for (const [id, tab] of settingsTabs) {
      const selected = id === state.active;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      tab.classList.toggle('is-active', selected);
      const panel = settingsPanels.get(id);
      if (panel) panel.hidden = !selected;
    }
    aside.dataset.edge = state.edge;
    settings.dataset.edge = state.edge;
  }

  function activateSettingsTab(id, focus) {
    if (!settingsTabs.has(id)) return;
    state.active = id; saveSettingsState(state); renderSettingsNav();
    if (focus) settingsTabs.get(id).focus();
  }
  function moveSettingsTab(id, delta) {
    const from = state.order.indexOf(id); const to = from + Math.sign(delta);
    if (from < 0 || to < 0 || to >= state.order.length) return;
    const neighbour = state.order[to];
    const group = settingsGroupFor(state, id); const neighbourGroup = settingsGroupFor(state, neighbour);
    if (group.id !== neighbourGroup.id) return;
    state.order.splice(from, 1); state.order.splice(to, 0, id); saveSettingsState(state); renderSettingsNav(); settingsTabs.get(id).focus();
  }
  function moveSettingsBefore(id, before) {
    const from = state.order.indexOf(id); if (from < 0) return;
    const to = state.order.indexOf(before); if (to < 0 || settingsGroupFor(state, id).id !== settingsGroupFor(state, before).id) return;
    state.order.splice(from, 1); state.order.splice(state.order.indexOf(before), 0, id); saveSettingsState(state); renderSettingsNav();
  }
  function createSettingsGroup(name) {
    const safe = String(name || '').trim().replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 48);
    if (!safe || state.groups[safe]) return false;
    state.groups[safe] = { id: safe, name: String(name).trim().slice(0, 120), tabs: [], collapsed: false, pinned: false, color: '' };
    saveSettingsState(state); renderSettingsNav(); return true;
  }
  function moveSettingsToGroup(id, groupId) {
    if (!state.groups[groupId] || !settingsTabs.has(id)) return false;
    for (const bucket of Object.values(state.groups)) bucket.tabs = bucket.tabs.filter((tabId) => tabId !== id);
    state.groups[groupId].tabs.push(id); state.groups[groupId].collapsed = false;
    saveSettingsState(state); renderSettingsNav(); return true;
  }
  function moveSettingsGroup(groupId, delta) {
    const ids = Object.keys(state.groups);
    const from = ids.indexOf(groupId); const to = from + Math.sign(delta);
    if (from < 0 || to < 0 || to >= ids.length) return false;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    const reordered = {};
    for (const id of ids) reordered[id] = state.groups[id];
    state.groups = reordered; saveSettingsState(state); renderSettingsNav(); return true;
  }
  function removeSettingsGroup(groupId) {
    if (groupId === 'general' || !state.groups[groupId]) return false;
    const fallback = state.groups.general;
    fallback.tabs.push(...state.groups[groupId].tabs);
    delete state.groups[groupId]; saveSettingsState(state); renderSettingsNav(); return true;
  }

  const layoutPopover = createPopover(layoutButton, text('shell.settings.layout', 'Settings layout'), (panel) => {
    panel.replaceChildren(el('div', { class: 'md-shell-popover__head', text: text('shell.settings.layout', 'Settings layout') }));
    const edgeRow = el('div', { class: 'md-shell-edge-list', role: 'group', 'aria-label': text('shell.settings.docking', 'Settings tab docking') });
    for (const edge of EDGES) edgeRow.append(el('button', { type: 'button', class: 'md-btn md-btn--text', text: bilingual(`shell.dock.${edge}`, edge[0].toUpperCase() + edge.slice(1), edge), 'aria-pressed': String(state.edge === edge) }));
    [...edgeRow.children].forEach((button, index) => button.addEventListener('click', () => { state.edge = EDGES[index]; saveSettingsState(state); renderSettingsNav(); layoutPopover.close(); }));
    const groupName = el('input', { type: 'text', class: 'md-input', placeholder: text('shell.settings.groupName', 'New group name'), 'aria-label': text('shell.settings.groupName', 'New group name') });
    const create = el('button', { type: 'button', class: 'md-btn md-btn--outlined', text: text('shell.settings.createGroup', 'Create group') });
    create.addEventListener('click', () => { if (createSettingsGroup(groupName.value)) { groupName.value = ''; layoutPopover.reposition(); } });
    const groupSearch = makeSearchField({ id: 'settings-group-manager-search', label: text('shell.group.search', 'Search tab groups by name') });
    const groupList = el('div', { class: 'md-shell-list', 'aria-label': text('shell.settings.groups', 'Settings groups') });
    for (const bucket of Object.values(state.groups)) {
      const memberText = bucket.tabs.map((id) => settingsTabs.get(id)?.textContent || id).join(' ');
      const row = el('div', { class: 'md-shell-group-row', dataset: { shellSettingsGroupId: bucket.id, shellGroupSearchText: `${bucket.name} ${memberText} ${bucket.tabs.length}` } });
      const name = el('input', { type: 'text', class: 'md-input', value: bucket.name, 'aria-label': `${text('shell.group.rename', 'Rename')}: ${bucket.name}` });
      const color = el('input', { type: 'color', class: 'md-ui-color', value: /^#[0-9a-f]{6}$/i.test(bucket.color) ? bucket.color : '#8F4C34', 'aria-label': `${text('shell.group.color', 'Color')}: ${bucket.name}` });
      const pin = el('button', { type: 'button', class: 'md-btn md-btn--text', text: text(bucket.pinned ? 'shell.group.unpin' : 'shell.group.pin', bucket.pinned ? 'Unpin' : 'Pin'), 'aria-pressed': String(bucket.pinned) });
      const up = el('button', { type: 'button', class: 'md-btn md-btn--text', text: text('shell.group.up', 'Up') });
      const down = el('button', { type: 'button', class: 'md-btn md-btn--text', text: text('shell.group.down', 'Down') });
      const remove = el('button', { type: 'button', class: 'md-btn md-btn--text', text: text('shell.group.remove', 'Remove group') });
      name.addEventListener('change', () => { bucket.name = name.value.trim() || bucket.name; saveSettingsState(state); renderSettingsNav(); });
      color.addEventListener('input', () => { bucket.color = color.value; saveSettingsState(state); });
      pin.addEventListener('click', () => { bucket.pinned = !bucket.pinned; saveSettingsState(state); });
      up.addEventListener('click', () => { moveSettingsGroup(bucket.id, -1); layoutPopover.close(false); layoutPopover.open(); });
      down.addEventListener('click', () => { moveSettingsGroup(bucket.id, 1); layoutPopover.close(false); layoutPopover.open(); });
      remove.addEventListener('click', () => { if (removeSettingsGroup(bucket.id)) { layoutPopover.close(false); layoutPopover.open(); } });
      row.append(name, color, pin, up, down, remove); groupList.append(row);
    }
    groupSearch.input.addEventListener('input', () => {
      const matcher = safeMatcher(groupSearch);
      for (const row of groupList.querySelectorAll('[data-shell-settings-group-id]')) row.hidden = !matcher.ok || (!matcher.empty && !matcher.test(row.dataset.shellGroupSearchText || row.textContent));
    });
    groupSearch.controller?.onChange?.(() => groupSearch.input.dispatchEvent(new Event('input')));
    panel.append(edgeRow, groupSearch.root, el('div', { class: 'md-shell-inline-form' }, groupName, create), groupList);
    groupSearch.input.dispatchEvent(new Event('input'));
  });
  layoutButton.addEventListener('click', () => layoutPopover.toggle());
  window.addEventListener('resize', () => renderSettingsNav(), { passive: true });

  function openSettingsContext(id, anchor, x, y) {
    const target = anchor;
    const event = new CustomEvent('md:site-context-request', { detail: { element: target, target: `settings:${id}`, x, y, settingsId: id } });
    document.dispatchEvent(event);
  }
  document.addEventListener('md:settings-group-request', (event) => {
    const id = event.detail?.id; if (!settingsTabs.has(id)) return;
    const picker = createPopover(settingsTabs.get(id), text('shell.settings.move', 'Move into group'), (panel) => {
      const field = makeSearchField({ id: `settings-move-${id}`, label: text('shell.settings.move', 'Move into group') });
      const list = el('div', { class: 'md-shell-list' });
      const render = () => { const matcher = field.matcher; list.replaceChildren(); for (const bucket of Object.values(state.groups)) { if (!matcher.empty && (!matcher.ok || !matcher.test(bucket.name))) continue; const row = el('button', { type: 'button', class: 'md-btn md-btn--text', text: `${bucket.name} (${bucket.tabs.length})` }); row.addEventListener('click', () => { moveSettingsToGroup(id, bucket.id); picker.close(); }); list.append(row); } if (!list.children.length) list.append(el('p', { class: 'md-shell-empty', text: text('shell.settings.none', 'No settings groups match this search.') })); };
      field.input.addEventListener('input', render); panel.append(field.root, list); render(); requestAnimationFrame(() => field.input.focus());
      field.controller?.onChange?.(render);
    });
    picker.open();
  });

  updateSettingLabels();
  renderSettingsNav();
  window.MATERIAL_DESIGNER_SETTINGS_ACTIVATE = activateSettingsTab;
  window.MATERIAL_DESIGNER_SETTINGS_LOCAL_REFRESH = () => {
    for (const field of perTabSearches.values()) field.refresh();
  };
  return { state, renderSettingsNav, activateSettingsTab, moveSettingsToGroup, settingsTabs, perTabSearches };
}

function installPageSearches() {
  const pages = [];
  for (const panel of document.querySelectorAll('[data-tab-panel]')) {
    const id = panel.getAttribute('data-tab-panel');
    if (!id || id === 'settings' || id === 'search-results' || panel.querySelector(':scope > [data-shell-page-search]')) continue;
    const heading = panel.querySelector('h1,h2')?.textContent.trim() || id;
    const field = makeSearchField({
      id: `page-${id}-search`,
      label: `${bilingual('search.label', 'Search this page', '搵呢版')}: ${heading}`,
      onChange: () => apply(),
    });
    field.root.dataset.shellPageSearch = id;
    const status = el('p', { class: 'md-shell-page-search-status', role: 'status', 'aria-live': 'polite' });
    const targets = [...panel.children].filter((node) => node !== field.root && !node.matches('[data-shell-page-search-status]'));
    let apply = () => {};
    apply = () => {
      const matcher = safeMatcher(field);
      const query = field.input.value.trim();
      if (!query) {
        for (const node of targets) node.hidden = false;
        status.textContent = '';
        return;
      }
      if (!matcher.ok) {
        for (const node of targets) node.hidden = true;
        status.textContent = matcher.error || 'Invalid pattern';
        return;
      }
      let visible = 0;
      for (const node of targets) {
        const matches = matcher.test(node.textContent.replace(/\s+/g, ' ').trim());
        node.hidden = !matches;
        if (matches) visible += 1;
      }
      status.textContent = visible ? text('shell.page.matches', '{count} sections match').replace('{count}', String(visible)) : text('shell.page.noMatch', 'No content matches this search.');
    };
    field.input.addEventListener('input', apply);
    status.dataset.shellPageSearchStatus = id;
    panel.insertBefore(field.root, panel.firstChild);
    panel.insertBefore(status, field.root.nextSibling);
    pages.push({ id, field, panel });
  }
  return pages;
}

function installNestedSurfaceSearches() {
  const installed = [];
  for (const [surfaceId, labelledBy] of NESTED_SURFACES) {
    const target = document.querySelector(`[aria-labelledby="${CSS.escape(labelledBy)}"]`);
    if (!target || target.querySelector(':scope > [data-shell-nested-search]')) continue;
    const heading = document.getElementById(labelledBy)?.textContent.trim() || surfaceId;
    let apply = () => {};
    const field = makeSearchField({
      id: `nested-${surfaceId}-search`,
      label: `${bilingual('search.label', 'Search this section', '搵呢個部分')}: ${heading}`,
      onChange: () => apply(),
    });
    field.root.dataset.shellNestedSearch = surfaceId;
    const status = el('p', { class: 'md-shell-page-search-status', role: 'status', 'aria-live': 'polite' });
    const children = [...target.children].filter((node) => !node.matches('[data-shell-nested-search], h1, h2, h3, h4, h5, h6'));
    apply = () => {
      const matcher = safeMatcher(field);
      const query = field.input.value.trim();
      if (!query) {
        for (const node of children) node.hidden = false;
        status.textContent = '';
        return;
      }
      if (!matcher.ok) {
        for (const node of children) node.hidden = true;
        status.textContent = matcher.error || text('shell.search.invalid', 'Invalid pattern');
        return;
      }
      let visible = 0;
      for (const node of children) {
        const matches = matcher.test(node.textContent.replace(/\s+/g, ' ').trim());
        node.hidden = !matches;
        if (matches) visible += 1;
      }
      status.textContent = visible ? text('shell.page.matches', '{count} sections match').replace('{count}', String(visible)) : text('shell.page.noMatch', 'No content matches this search.');
    };
    target.insertBefore(field.root, target.firstChild);
    target.insertBefore(status, field.root.nextSibling);
    field.input.addEventListener('input', apply);
    apply();
    installed.push({ id: surfaceId, field, target });
  }
  return installed;
}

function safeMatcher(field) {
  const matcher = field.matcher;
  if (!matcher.ok) return { ok: false, empty: false, test: () => false, error: matcher.error || 'Invalid pattern' };
  return matcher;
}

function stableTargetId(element) {
  if (element.id) return element.id;
  if (element.dataset?.shellTargetId) return element.dataset.shellTargetId;
  let path = '';
  let node = element;
  while (node && node !== document.body) {
    const parent = node.parentElement;
    const signature = [node.tagName, node.id, node.getAttribute('role'), node.getAttribute('aria-label'), node.getAttribute('name'), node.getAttribute('data-tab-panel')].filter(Boolean).join(':');
    const peers = parent ? [...parent.children].filter((candidate) => candidate.tagName === node.tagName && candidate.id === node.id && candidate.getAttribute('role') === node.getAttribute('role') && candidate.getAttribute('aria-label') === node.getAttribute('aria-label')) : [];
    const occurrence = peers.indexOf(node);
    path = `${signature}:${Math.max(0, occurrence)}/${path}`;
    node = parent;
  }
  let hash = 2166136261;
  for (const char of path) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  const id = `shell-${String(element.tagName || 'element').toLowerCase()}-${(hash >>> 0).toString(36)}`;
  if (element.dataset) element.dataset.shellTargetId = id;
  return id;
}

function invokeConsumer(name, eventName, detail) {
  const consumer = window[name];
  if (consumer && typeof consumer.open === 'function') {
    consumer.open(detail);
    return true;
  }
  const event = new CustomEvent(eventName, { cancelable: true, detail });
  const handled = !document.dispatchEvent(event);
  if (!handled) document.dispatchEvent(new CustomEvent('md:toast', { detail: { kind: 'info', title: text('shell.context.unavailable', 'Editor unavailable'), body: text('shell.consumer.unavailable', 'This editor is not connected on this surface yet. The action was not applied.') } }));
  return handled;
}

function relocateOuterTabs(root, edge) {
  const body = document.querySelector('.app-body');
  const main = document.querySelector('.app-main');
  if (!body || !main || !root || !EDGES.includes(edge)) return;
  body.dataset.tabsEdge = edge;
  if (edge === 'left' || edge === 'top') body.insertBefore(root, main);
  else body.append(root);
  root.dataset.dockEdge = edge;
  root.dataset.relocated = 'true';
}

function openDestructiveGate(anchor, title, body, run, options = {}) {
  if (!(anchor instanceof Element)) return;
  const expectedOne = String(options.keyOne || 'CONFIRM ACTION');
  const expectedTwo = String(options.keyTwo || 'CONFIRM COUNT');
  const gate = createPopover(anchor, title, (panel) => {
    panel.replaceChildren(el('div', { class: 'md-shell-popover__head', text: title }), el('p', { class: 'md-shell-preview', text: body }));
    const keyOne = el('input', { type: 'text', class: 'md-input', placeholder: `${text('shell.close.keyOne', 'Confirmation key 1')}: ${expectedOne}`, 'aria-label': `${text('shell.close.keyOne', 'Confirmation key 1')}: ${expectedOne}`, autocomplete: 'off' });
    const keyTwo = el('input', { type: 'text', class: 'md-input', placeholder: `${text('shell.close.keyTwo', 'Confirmation key 2')}: ${expectedTwo}`, 'aria-label': `${text('shell.close.keyTwo', 'Confirmation key 2')}: ${expectedTwo}`, autocomplete: 'off' });
    const slider = el('input', { type: 'range', class: 'md-slider', min: '0', max: '100', step: '1', value: '0', disabled: true, 'aria-label': text('shell.close.slider', 'Slide to confirm closing tabs') });
    const progress = el('div', { class: 'md-shell-gate-progress', role: 'progressbar', 'aria-label': text('shell.close.slider', 'Slide to confirm closing tabs'), 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0' }, el('span'));
    const status = el('p', { class: 'md-shell-preview', role: 'status', 'aria-live': 'polite', text: text('shell.close.needsKeys', 'Two independent confirmation keys are required before the slider becomes active.') });
    const cancel = el('button', { type: 'button', class: 'md-btn md-btn--text', text: text('shell.close.exit', 'Emergency exit') });
    const confirm = el('button', { type: 'button', class: 'md-btn md-btn--danger', text: text('shell.close.action', 'Confirm'), disabled: true });
    const update = () => {
      const ready = keyOne.value.trim() === expectedOne && keyTwo.value.trim() === expectedTwo;
      const percent = Number(slider.value) || 0;
      slider.disabled = !ready;
      confirm.disabled = !ready || percent !== 100;
      panel.dataset.gateState = percent > 0 ? 'progress' : (ready ? 'armed' : 'locked');
      progress.setAttribute('aria-valuenow', String(percent));
      progress.firstElementChild.style.width = `${percent}%`;
      status.textContent = ready ? text('shell.close.ready', 'Confirmation ready. Slider completion: {percent}%.').replace('{percent}', String(percent)) : text('shell.close.needsKeys', 'Two independent confirmation keys are required before the slider becomes active.');
    };
    keyOne.addEventListener('input', update); keyTwo.addEventListener('input', update); slider.addEventListener('input', update);
    cancel.addEventListener('click', () => gate.destroy());
    confirm.addEventListener('click', () => {
      if (confirm.disabled) return;
      const check = options.validate?.();
      if (check && check.ok === false) {
        slider.value = '0'; update(); status.textContent = check.message || text('shell.action.changed', 'The action changed while confirmation was open. Review the exclusions and try again.'); return;
      }
      panel.dataset.gateState = 'complete';
      status.textContent = text('shell.close.completed', 'Confirmation completed. Applying the reviewed action.');
      requestAnimationFrame(() => { run?.(); gate.destroy(); });
    });
    panel.append(keyOne, keyTwo, slider, progress, status, el('div', { class: 'md-shell-inline-form' }, cancel, confirm));
    requestAnimationFrame(() => keyOne.focus());
  });
  gate.open();
}

function installSharedDestructiveGate() {
  if (window.MATERIAL_DESIGNER_SHARED_DESTRUCTIVE_GATE?.open) return;
  window.MATERIAL_DESIGNER_SHARED_DESTRUCTIVE_GATE = {
    open(detail = {}) {
      openDestructiveGate(
        detail.anchor || detail.element,
        detail.title || text('shell.close.confirm', 'Confirm the tab close'),
        detail.body || text('shell.destructive.body', 'This action changes {kind}. Review it before confirming.').replace('{kind}', detail.kind || 'the selected site state'),
        detail.run,
        { keyOne: detail.keyOne, keyTwo: detail.keyTwo, validate: detail.validate },
      );
    },
  };
}

function installOuterTabShell() {
  const root = document.querySelector('#tab-strip');
  const strip = tabs.getTabStrip();
  if (!root || !strip || root.dataset.shellReady === 'true') return null;
  root.dataset.shellReady = 'true';
  const initialEdge = strip.getDockEdge?.() || 'left';
  relocateOuterTabs(root, initialEdge);
  const actions = root.querySelector('.md-tabs__actions');
  if (!actions) return null;

  const find = el('button', { type: 'button', class: 'md-tabs__btn md-tabs__shell-btn', text: text('shell.tabs.find', 'Find tabs'), 'data-shell-tabs-find': '' });
  const groups = el('button', { type: 'button', class: 'md-tabs__btn md-tabs__shell-btn', text: text('shell.tabs.groups', 'Tab groups'), 'data-shell-tabs-groups': '' });
  const bulk = el('button', { type: 'button', class: 'md-tabs__btn md-tabs__shell-btn', text: text('shell.tabs.bulk', 'Bulk close'), 'data-shell-tabs-bulk': '' });
  const dock = el('button', { type: 'button', class: 'md-tabs__btn md-tabs__shell-btn', text: text('shell.tabs.dock', 'Dock tabs'), 'data-shell-tabs-dock': '' });
  actions.append(find, groups, bulk, dock);

  const makeTabSearch = (scope) => makeSearchField({ id: `tabs-${scope}-search`, label: bilingual(`shell.tabs.scope.${scope}`, scope, scope) });

  const findPopover = createPopover(find, text('shell.tabs.find', 'Find tabs'), (panel) => {
    panel.replaceChildren(el('div', { class: 'md-shell-popover__head', text: text('shell.tabs.find', 'Find tabs') }));
    const scopes = [
      ['strip', text('shell.tabs.scope.strip', 'Current tab strip')],
      ['group-members', text('shell.tabs.scope.group', 'Inside each group')],
      ['groups', text('shell.tabs.scope.groups', 'Tab groups by name')],
      ['master', text('shell.tabs.scope.master', 'Master search across open tabs')],
    ];
    const resultHost = el('div', { class: 'md-shell-list' });
    const fields = scopes.map(([id, label]) => ({ id, label, field: makeTabSearch(id) }));
    const render = () => {
      const list = strip.listTabs(); const groupsData = strip.listGroups?.() || [];
      resultHost.replaceChildren();
      for (const { id, label, field } of fields) {
        const matcher = safeMatcher(field); const section = el('section', { class: 'md-shell-search-scope', 'aria-label': label });
        section.append(el('h3', { class: 'md-shell-scope-title', text: label }));
        let rows = [];
        if (id === 'groups') {
          rows = groupsData.filter((group) => matcher.empty || matcher.test(group.name)).map((group) => ({ id: group.tabs[0], label: `${group.name} (${group.tabs.length})`, group: group.id }));
        } else {
          rows = list.filter((tab) => {
            if (id === 'group-members' && !tab.group) return false;
            if (id === 'master' && tab.closed) return false;
            return matcher.empty || matcher.test(tab.label);
          });
        }
        if (!matcher.ok || !rows.length) section.append(el('p', { class: 'md-shell-empty', text: matcher.ok ? text('shell.tabs.noMatch', 'No tabs match this bounded search.') : matcher.error }));
        for (const row of rows) {
          const stateSuffix = row.group ? '' : `${row.pinned ? ` · ${text('shell.tabs.pinnedSuffix', 'Pinned')}` : ''}${row.closed ? ` · ${text('shell.tabs.closedSuffix', 'Closed')}` : ''}`;
          const button = el('button', { type: 'button', class: 'md-btn md-btn--text md-shell-result', text: `${row.label}${stateSuffix}` });
          button.addEventListener('click', () => {
            if (row.id) {
              if (strip.getClosed?.().includes(row.id)) strip.reopenTabs([row.id]);
              strip.goToTab?.(row.id); tabs.goToTab(row.id, { focus: true, highlight: true });
            } else if (row.group) {
              findPopover.close();
              groupPopover.open();
              groupPopover.panel.querySelector(`[data-shell-group-id="${CSS.escape(row.group)}"]`)?.scrollIntoView({ block: 'nearest' });
            }
          });
          section.append(button);
        }
        resultHost.append(section);
      }
    };
    for (const { field } of fields) field.input.addEventListener('input', render);
    for (const { field } of fields) field.controller?.onChange?.(render);
    for (const { field } of fields) panel.append(field.root);
    panel.append(resultHost); render(); requestAnimationFrame(() => fields[0].field.input.focus());
  });

  const groupPopover = createPopover(groups, text('shell.tabs.groups', 'Tab groups'), (panel) => {
    const groupsData = strip.listGroups?.() || [];
    panel.replaceChildren(el('div', { class: 'md-shell-popover__head', text: text('shell.tabs.groups', 'Tab groups') }));
    const findField = makeSearchField({ id: 'tab-groups-manager-search', label: text('shell.group.search', 'Search tab groups by name') });
    const newName = el('input', { type: 'text', class: 'md-input', placeholder: text('shell.group.newName', 'New group name'), 'aria-label': text('shell.group.newName', 'New group name') });
    const create = el('button', { type: 'button', class: 'md-btn md-btn--outlined', text: text('shell.group.create', 'Create group') });
    const list = el('div', { class: 'md-shell-list' });
    create.addEventListener('click', () => { const name = newName.value.trim(); if (!name) return; const id = `group-${Date.now().toString(36)}`; strip.createGroup?.(id, name, ''); newName.value = ''; groupPopover.close(false); groupPopover.open(); });
    panel.append(findField.root, el('div', { class: 'md-shell-inline-form' }, newName, create), list);
    const tabLabels = new Map(strip.listTabs().map((tab) => [tab.id, tab.label]));
    for (const group of groupsData) {
      const groupSearchText = `${group.name} ${group.tabs.map((id) => tabLabels.get(id) || id).join(' ')} ${group.tabs.length}`;
      const row = el('div', { class: 'md-shell-group-row', dataset: { shellGroupId: group.id, shellGroupSearchText: groupSearchText } });
      const title = el('strong', { text: `${group.name} (${group.tabs.length})` });
      const pin = el('button', { type: 'button', class: 'md-btn md-btn--text', text: text(group.pinned ? 'shell.group.unpin' : 'shell.group.pin', group.pinned ? 'Unpin group' : 'Pin group'), 'aria-pressed': String(group.pinned) });
      const collapse = el('button', { type: 'button', class: 'md-btn md-btn--text', text: text(group.collapsed ? 'shell.group.expand' : 'shell.group.collapse', group.collapsed ? 'Expand' : 'Collapse') });
      const up = el('button', { type: 'button', class: 'md-btn md-btn--text', text: text('shell.group.up', 'Up'), 'aria-label': `${text('shell.group.up', 'Up')}: ${group.name}` });
      const down = el('button', { type: 'button', class: 'md-btn md-btn--text', text: text('shell.group.down', 'Down'), 'aria-label': `${text('shell.group.down', 'Down')}: ${group.name}` });
      const rename = el('input', { type: 'text', class: 'md-input', value: group.name, 'aria-label': `${text('shell.group.rename', 'Rename')}: ${group.name}` });
      const color = el('input', { type: 'color', class: 'md-ui-color', value: /^#[0-9a-f]{6}$/i.test(group.color) ? group.color : '#8F4C34', 'aria-label': `${text('shell.group.color', 'Color')}: ${group.name}` });
      const remove = el('button', { type: 'button', class: 'md-btn md-btn--text', text: text('shell.group.remove', 'Remove group') });
      pin.addEventListener('click', () => { strip.setGroupPinned?.(group.id, !group.pinned); groupPopover.close(false); groupPopover.open(); });
      collapse.addEventListener('click', () => { strip.setGroupCollapsed?.(group.id, !group.collapsed); groupPopover.close(false); groupPopover.open(); });
      up.addEventListener('click', () => { strip.moveGroup?.(group.id, -1); groupPopover.close(false); groupPopover.open(); });
      down.addEventListener('click', () => { strip.moveGroup?.(group.id, 1); groupPopover.close(false); groupPopover.open(); });
      rename.addEventListener('change', () => { strip.renameGroup?.(group.id, rename.value); groupPopover.close(false); groupPopover.open(); });
      color.addEventListener('input', () => strip.setGroupColor?.(group.id, color.value));
      remove.addEventListener('click', () => document.dispatchEvent(new CustomEvent('md:destructive-request', { cancelable: true, detail: { kind: 'remove-tab-group', groupId: group.id, element: row, anchor: groups, keyOne: 'REMOVE GROUP', keyTwo: `REMOVE ${group.name}`, run: () => strip.removeGroup?.(group.id) } })));
      row.addEventListener('contextmenu', (event) => { event.preventDefault(); document.dispatchEvent(new CustomEvent('md:site-context-request', { detail: { element: row, target: `tab-group:${group.id}`, x: event.clientX, y: event.clientY } })); });
      row.append(title, pin, collapse, up, down, rename, color, remove);
      list.append(row);
      for (const tabId of group.tabs) {
        const tab = strip.listTabs().find((candidate) => candidate.id === tabId); if (!tab) continue;
        const member = el('button', { type: 'button', class: 'md-btn md-btn--text md-shell-member', text: tab.label });
        member.addEventListener('click', () => { strip.reopenTabs?.([tabId]); tabs.goToTab(tabId, { focus: true, highlight: true }); groupPopover.close(); });
        list.append(member);
      }
    }
    const closed = strip.listTabs().filter((tab) => tab.closed);
    if (closed.length && findField.input.value.trim() === '') {
      const closedHost = el('div', { dataset: { shellClosedTabs: 'true' } });
      closedHost.append(el('h3', { class: 'md-shell-scope-title', text: text('shell.tabs.closed', 'Closed tabs') }));
      for (const tab of closed) { const reopen = el('button', { type: 'button', class: 'md-btn md-btn--text', text: `${text('shell.tabs.reopen', 'Reopen')}: ${tab.label}` }); reopen.addEventListener('click', () => { strip.reopenTabs([tab.id]); groupPopover.close(false); groupPopover.open(); }); closedHost.append(reopen); }
      list.append(closedHost);
    }
    findField.input.addEventListener('input', () => {
      const matcher = safeMatcher(findField);
      for (const row of list.querySelectorAll('[data-shell-group-id]')) row.hidden = !matcher.ok || (!matcher.empty && !matcher.test(row.dataset.shellGroupSearchText || row.textContent));
      const closedHost = list.querySelector('[data-shell-closed-tabs]');
      if (closedHost) closedHost.hidden = !matcher.empty;
    });
    findField.controller?.onChange?.(() => findField.input.dispatchEvent(new Event('input')));
    findField.input.dispatchEvent(new Event('input'));
    for (const row of list.querySelectorAll('[data-shell-group-id]')) row.dataset.shellGroupId = row.dataset.shellGroupId || '';
    requestAnimationFrame(() => findField.input.focus());
  });

  document.addEventListener('md:tab-group-request', (event) => {
    const id = event.detail?.id;
    const anchor = document.querySelector(`#tab-${CSS.escape(id || '')}`);
    if (!id || !anchor) return;
    const picker = createPopover(anchor, text('shell.settings.move', 'Move into group'), (panel) => {
      const field = makeSearchField({ id: `tab-move-${id}`, label: text('shell.settings.move', 'Move into group') });
      const list = el('div', { class: 'md-shell-list' });
      const render = () => {
        const matcher = safeMatcher(field); list.replaceChildren();
        for (const group of strip.listGroups?.() || []) {
          if (!matcher.ok || !matcher.empty && !matcher.test(group.name)) continue;
          const row = el('button', { type: 'button', class: 'md-btn md-btn--text', text: `${group.name} (${group.tabs.length})` });
          row.addEventListener('click', () => { strip.assignTabToGroup?.(id, group.id); picker.close(); });
          list.append(row);
        }
        if (!list.children.length) list.append(el('p', { class: 'md-shell-empty', text: matcher.ok ? text('shell.group.noMatch', 'No groups match this search.') : matcher.error }));
      };
      field.input.addEventListener('input', render); field.controller?.onChange?.(render); panel.append(field.root, list); render(); requestAnimationFrame(() => field.input.focus());
    });
    picker.open();
  });

  const bulkPopover = createPopover(bulk, text('shell.tabs.bulk', 'Bulk close'), (panel) => {
    panel.replaceChildren(el('div', { class: 'md-shell-popover__head', text: text('shell.tabs.bulk', 'Bulk close') }));
    const include = el('input', { type: 'checkbox', id: 'shell-include-pinned' });
    const includeLabel = el('label', { for: include.id, text: text('shell.tabs.includePinned', 'Include pinned tabs') });
    const includeLocked = el('input', { type: 'checkbox', id: 'shell-include-locked' });
    const includeLockedLabel = el('label', { for: includeLocked.id, text: text('shell.close.includeLocked', 'Include locked tabs') });
    const actionsHost = el('div', { class: 'md-shell-bulk-actions' });
    const isLocked = (id) => {
      const node = document.querySelector(`#tab-${CSS.escape(id)}`);
      return Boolean(node?.dataset.locked === 'true' || node?.dataset.toyLocked === 'true' || node?.getAttribute('aria-disabled') === 'true');
    };
    for (const mode of ['containing', 'not-containing']) {
      const title = text(`shell.tabs.close${mode === 'containing' ? 'Containing' : 'NotContaining'}`, mode === 'containing' ? 'Close tabs containing text' : 'Close tabs not containing text');
      const field = makeSearchField({ id: `tabs-bulk-${mode}`, label: title });
      const preview = el('p', { class: 'md-shell-preview', role: 'status', 'aria-live': 'polite' });
      const button = el('button', { type: 'button', class: 'md-btn md-btn--danger', text: title });
      const calculate = () => {
        const matcher = safeMatcher(field); const list = strip.listTabs();
        const matches = list.filter((tab) => !tab.closed && (matcher.empty ? false : matcher.ok && matcher.test(tab.label)));
        const matched = list.filter((tab) => !tab.closed && (mode === 'containing' ? matches.some((candidate) => candidate.id === tab.id) : !matches.some((candidate) => candidate.id === tab.id)));
        const skippedPinned = matched.filter((tab) => !include.checked && tab.pinned);
        const skippedLocked = matched.filter((tab) => !includeLocked.checked && isLocked(tab.id));
        const skipped = [...skippedPinned, ...skippedLocked].map((tab) => `${tab.label}${tab.pinned ? ' (pinned)' : ''}${isLocked(tab.id) ? ' (locked)' : ''}`);
        const ids = matched.filter((tab) => !skippedPinned.includes(tab) && !skippedLocked.includes(tab)).map((tab) => tab.id);
        preview.textContent = matcher.empty ? text('shell.close.enter', 'Enter text or enable regex before closing tabs.') : !matcher.ok ? matcher.error : text('shell.close.summary', '{count} tab(s) will close. {excluded} excluded by current protection choices.').replace('{count}', String(ids.length)).replace('{excluded}', String(skipped.length));
        button.disabled = matcher.empty || !matcher.ok || ids.length <= 0;
        button.dataset.closeState = JSON.stringify({ ids, skipped });
      };
      field.input.addEventListener('input', calculate); field.controller?.onChange?.(calculate); include.addEventListener('change', calculate); includeLocked.addEventListener('change', calculate);
      button.addEventListener('click', () => {
        const closeState = JSON.parse(button.dataset.closeState || '{}');
        if (!closeState.ids?.length) return;
        const latest = () => {
          const current = strip.listTabs();
          const matcher = safeMatcher(field);
          const currentEligible = matcher.ok && !matcher.empty
            ? new Set(current.filter((tab) => !tab.closed && (mode === 'containing' ? matcher.test(tab.label) : !matcher.test(tab.label))).map((tab) => tab.id))
            : new Set();
          const newExcluded = current.filter((tab) => closeState.ids.includes(tab.id) && (tab.closed || !currentEligible.has(tab.id) || (!include.checked && tab.pinned) || (!includeLocked.checked && isLocked(tab.id))));
          const missing = closeState.ids.filter((id) => !current.some((tab) => tab.id === id));
          const labels = [...newExcluded.map((tab) => `${tab.label}${!currentEligible.has(tab.id) ? ` (${text('shell.tabs.noLongerMatches', 'no longer matches')})` : ''}`), ...missing.map((id) => `${id} (${text('shell.tabs.noLongerOpen', 'no longer open')})`)];
          return labels.length ? { ok: false, message: text('shell.close.newExclusions', 'New exclusions: {items}. Review the protection choices again.').replace('{items}', labels.join(', ')) } : { ok: true };
        };
        document.dispatchEvent(new CustomEvent('md:destructive-request', { cancelable: true, detail: {
          kind: 'close-tabs', element: button, anchor: bulk, title, keyOne: 'CLOSE TABS', keyTwo: `CLOSE ${closeState.ids.length}`,
          includePinned: include.checked, includeLocked: includeLocked.checked, excluded: closeState.skipped || [],
          validate: latest,
          run: () => {
            const result = strip.closeTabs?.(closeState.ids, { includePinned: include.checked });
            document.dispatchEvent(new CustomEvent('md:toast', { detail: { kind: 'success', title: text('shell.tabs.bulk', 'Bulk close'), body: text('shell.context.confirmed', '{count} tab(s) closed. {skipped} skipped.').replace('{count}', String(result?.closed?.length || 0)).replace('{skipped}', String(result?.skipped?.length || 0)) } }));
            bulkPopover.close();
          },
        } }));
      });
      actionsHost.append(el('h3', { class: 'md-shell-scope-title', text: title }), field.root, preview, button); calculate();
    }
    panel.append(el('div', { class: 'md-shell-checkbox' }, include, includeLabel), el('div', { class: 'md-shell-checkbox' }, includeLocked, includeLockedLabel), actionsHost);
  });

  const dockPopover = createPopover(dock, text('shell.tabs.dock', 'Dock tabs'), (panel) => {
    panel.replaceChildren(el('div', { class: 'md-shell-popover__head', text: text('shell.tabs.dock', 'Dock tabs') }));
    for (const edge of EDGES) { const button = el('button', { type: 'button', class: 'md-btn md-btn--text', text: bilingual(`shell.dock.${edge}`, edge[0].toUpperCase() + edge.slice(1), edge), 'aria-pressed': String(strip.getDockEdge?.() === edge) }); button.addEventListener('click', () => { strip.setDockEdge?.(edge); root.dataset.dockEdge = edge; dockPopover.close(false); dockPopover.open(); }); panel.append(button); }
  });
  find.addEventListener('click', () => findPopover.toggle());
  groups.addEventListener('click', () => groupPopover.toggle());
  bulk.addEventListener('click', () => bulkPopover.toggle());
  dock.addEventListener('click', () => dockPopover.toggle());

  strip.on?.('groups', () => { root.dataset.groupCount = String(strip.listGroups?.().length || 0); });
  strip.on?.('dock', ({ edge }) => { relocateOuterTabs(root, edge); });
  return { root, findPopover, groupPopover, bulkPopover, dockPopover };
}

function installUniversalContextMenus() {
  if (document.documentElement.dataset.contextShellReady === 'true') return;
  document.documentElement.dataset.contextShellReady = 'true';
  let current = null;
  const trigger = el('span', { class: 'md-shell-context-anchor', tabindex: '-1', dataset: { shellContextAnchor: 'true' } });
  document.body.append(trigger);
  const menu = createPopover(trigger, text('shell.context.actions', 'Element actions'), (panel) => {
    const field = makeSearchField({ id: `context-${current?.targetId || 'element'}`, label: text('shell.context.search', 'Search actions') });
    const list = el('div', { class: 'md-shell-list' });
    const render = () => {
      const matcher = safeMatcher(field); list.replaceChildren();
      const actions = [
        { label: text('shell.context.appearance', 'Edit appearance…'), run: () => invokeConsumer('MATERIAL_DESIGNER_APPEARANCE_CONSUMER', 'md:appearance-request', current) },
        { label: text('shell.context.lock', 'Lock this element…'), run: () => invokeConsumer('MATERIAL_DESIGNER_TOY_LOCK_CONSUMER', 'md:lock-request', current) },
        { label: text('shell.context.copy', 'Copy accessible name'), run: () => navigator.clipboard?.writeText(current?.element?.getAttribute('aria-label') || current?.element?.textContent?.trim() || '') },
      ];
      if (current?.settingsId) actions.push({ label: text('shell.settings.move', 'Move into group'), run: () => document.dispatchEvent(new CustomEvent('md:settings-group-request', { detail: { id: current.settingsId } })) });
      if (current?.element?.matches?.('[data-goto-tab]')) actions.push({ label: text('shell.context.open', 'Open destination'), run: () => current.element.click() });
      for (const item of actions) if (matcher.ok && (matcher.empty || matcher.test(item.label))) { const button = el('button', { type: 'button', class: 'md-btn md-btn--text', text: item.label }); button.addEventListener('click', () => { menu.close(); item.run(); }); list.append(button); }
      if (!list.children.length) list.append(el('p', { class: 'md-shell-empty', text: matcher.ok ? text('shell.context.noMatch', 'No actions match this search.') : matcher.error }));
    };
    field.input.addEventListener('input', render); field.controller?.onChange?.(render); panel.append(field.root, list); render(); requestAnimationFrame(() => field.input.focus());
  });
  menu.panel.classList.add('md-shell-context');

  function openFor(element, x, y) {
    if (!(element instanceof Element) || element === document.body || element.closest('#tab-strip .md-tab,.md-shell-context')) return;
    const rect = element.getBoundingClientRect();
    Object.assign(trigger.style, { position: 'fixed', left: `${x ?? rect.left + 12}px`, top: `${y ?? rect.bottom}px`, width: '1px', height: '1px' });
    current = { element, targetId: stableTargetId(element), settingsId: element.dataset?.shellSettingsTab || null, x, y };
    menu.close(false); menu.open();
  }
  document.addEventListener('md:site-context-request', (event) => openFor(event.detail?.element, event.detail?.x, event.detail?.y));
  document.addEventListener('md:destructive-request', (event) => {
    if (event.defaultPrevented || !event.detail?.run) return;
    event.preventDefault();
    const target = event.detail.anchor || event.detail.element;
    const shared = window.MATERIAL_DESIGNER_SHARED_DESTRUCTIVE_GATE;
    if (shared && typeof shared.open === 'function') {
      shared.open(event.detail);
      return;
    }
    openDestructiveGate(target, event.detail.title || text('shell.destructive.title', 'Confirm destructive action'), event.detail.body || text('shell.destructive.body', 'This action changes {kind}. Review it before confirming.').replace('{kind}', event.detail.kind || 'the selected site state'), event.detail.run, { keyOne: event.detail.keyOne, keyTwo: event.detail.keyTwo, validate: event.detail.validate });
  });
  document.addEventListener('contextmenu', (event) => { const target = event.target instanceof Element ? event.target.closest('*') : null; if (!target || target.closest('#tab-strip .md-tab,.md-shell-context')) return; event.preventDefault(); openFor(target, event.clientX, event.clientY); }, true);
  document.addEventListener('keydown', (event) => { if (event.key !== 'ContextMenu' && !(event.key === 'F10' && event.shiftKey)) return; const target = document.activeElement instanceof Element ? document.activeElement : null; if (!target || target.closest('#tab-strip .md-tab,.md-shell-context')) return; event.preventDefault(); openFor(target); }, true);

  let longPress = 0;
  document.addEventListener('pointerdown', (event) => { if (event.pointerType !== 'touch') return; const target = event.target instanceof Element ? event.target.closest('*') : null; if (!target || target.closest('#tab-strip .md-tab,.md-shell-context')) return; longPress = window.setTimeout(() => openFor(target, event.clientX, event.clientY), 650); }, true);
  document.addEventListener('pointerup', () => { window.clearTimeout(longPress); }, true);
  document.addEventListener('pointercancel', () => { window.clearTimeout(longPress); }, true);
}

function installDropdownSearches() {
  const attach = (select) => {
    if (!(select instanceof HTMLSelectElement) || select.dataset.shellDropdownReady === 'true') return;
    select.dataset.shellDropdownReady = 'true';
    const stableId = select.id || `select-${[...document.querySelectorAll('select')].indexOf(select)}`;
    const wrapper = el('div', { class: 'md-shell-dropdown', 'data-shell-dropdown': stableId });
    const field = makeSearchField({ id: `dropdown-${stableId}`, label: text('shell.dropdown.filter', 'Filter choices') });
    const status = el('span', { class: 'md-shell-dropdown__status', id: `md-shell-status-${stableId}`, role: 'status', 'aria-live': 'polite' });
    const button = el('button', { type: 'button', class: 'md-shell-select__button', 'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-controls': `md-shell-options-${stableId}`, 'aria-describedby': `md-shell-status-${stableId}`, 'aria-label': select.getAttribute('aria-label') || select.id || text('shell.dropdown.choose', 'Choose an option') });
    const list = el('div', { class: 'md-shell-select__panel', id: `md-shell-options-${stableId}`, role: 'listbox', tabindex: '-1', 'aria-label': text('shell.dropdown.choices', 'Choices'), hidden: true });
    select.parentNode.insertBefore(wrapper, select);
    wrapper.append(button, select, list, status);
    select.hidden = true;
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');
    wrapper.append(field.root);
    list.append(field.root);
    const render = () => {
      const matcher = safeMatcher(field);
      const selected = select.selectedOptions[0];
      button.textContent = selected?.label || selected?.textContent || text('shell.dropdown.choose', 'Choose an option');
      list.querySelectorAll('[data-shell-option]').forEach((node) => node.remove());
      let count = 0;
      for (const [optionIndex, option] of [...select.options].entries()) {
        const visible = matcher.ok && (matcher.empty || matcher.test(option.textContent || option.label));
        if (!visible) continue;
        const item = el('button', { type: 'button', class: 'md-shell-option', id: `md-shell-option-${stableId}-${optionIndex}`, role: 'option', 'data-shell-option': option.value, 'aria-selected': String(option.selected), text: option.label || option.textContent });
        item.addEventListener('click', () => { select.value = option.value; select.dispatchEvent(new Event('input', { bubbles: true })); select.dispatchEvent(new Event('change', { bubbles: true })); list.hidden = true; button.setAttribute('aria-expanded', 'false'); button.focus(); });
        item.addEventListener('focus', () => list.setAttribute('aria-activedescendant', item.id));
        item.addEventListener('keydown', (event) => {
          const options = [...list.querySelectorAll('[data-shell-option]')]; const index = options.indexOf(item);
          if (event.key === 'ArrowDown') { event.preventDefault(); options[(index + 1) % options.length]?.focus(); }
          else if (event.key === 'ArrowUp') { event.preventDefault(); options[(index - 1 + options.length) % options.length]?.focus(); }
          else if (event.key === 'Home') { event.preventDefault(); options[0]?.focus(); }
          else if (event.key === 'End') { event.preventDefault(); options.at(-1)?.focus(); }
          else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); item.click(); }
          else if (event.key === 'Escape') { event.preventDefault(); list.hidden = true; button.setAttribute('aria-expanded', 'false'); button.focus(); }
        });
        list.append(item); count += 1;
      }
      list.setAttribute('aria-activedescendant', list.querySelector('[aria-selected="true"]')?.id || '');
      status.textContent = count ? text('shell.dropdown.count', '{count} choices').replace('{count}', String(count)) : text('shell.dropdown.empty', 'No choices match this search.');
    };
    button.addEventListener('click', () => { list.hidden = !list.hidden; button.setAttribute('aria-expanded', String(!list.hidden)); if (!list.hidden) { field.input.value = ''; render(); requestAnimationFrame(() => field.input.focus()); } });
    button.addEventListener('keydown', (event) => { if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') { event.preventDefault(); button.click(); } });
    field.input.addEventListener('input', render);
    field.controller?.onChange?.(render);
    field.input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { event.preventDefault(); list.hidden = true; button.setAttribute('aria-expanded', 'false'); button.focus(); }
      else if (event.key === 'ArrowDown') { event.preventDefault(); list.querySelector('[data-shell-option]')?.focus(); }
    });
    select.addEventListener('change', render);
    const optionObserver = new MutationObserver(render);
    optionObserver.observe(select, { childList: true, subtree: true });
    document.addEventListener('pointerdown', (event) => { if (!wrapper.contains(event.target)) { list.hidden = true; button.setAttribute('aria-expanded', 'false'); } }, true);
    render();
  };
  document.querySelectorAll('select').forEach(attach);
  const observer = new MutationObserver(() => document.querySelectorAll('select').forEach(attach));
  observer.observe(document.body, { childList: true, subtree: true });
}

function initFrontProvenance() {
  const host = document.querySelector('[data-site-provenance]');
  if (!host) return;
  const versionNode = host.querySelector('[data-provenance-version]');
  const updatedNode = host.querySelector('[data-provenance-updated]');
  const source = window.__MATERIAL_DESIGNER_PROVENANCE__ || {};
  const version = typeof source.version === 'string' ? source.version : host.dataset.version;
  const updated = typeof source.updatedAt === 'string' ? source.updatedAt : host.dataset.updatedAt;
  const validVersion = typeof version === 'string' && /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version);
  const validDate = typeof updated === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(updated) && Number.isFinite(Date.parse(updated));
  host.dataset.state = validVersion && validDate ? 'verified' : (version || updated ? 'invalid' : 'unavailable');
  if (versionNode) versionNode.textContent = validVersion ? version : 'Unavailable';
  if (updatedNode) updatedNode.textContent = validDate ? updated : 'Unavailable';
  if (updatedNode) updatedNode.setAttribute('datetime', validDate ? updated : '');
  const status = host.querySelector('[data-provenance-status]');
  if (status) status.textContent = host.dataset.state === 'verified' ? text('shell.provenance.recorded', 'Provenance recorded in the build metadata.') : text(host.dataset.state === 'invalid' ? 'shell.provenance.invalid' : 'shell.provenance.unavailable', host.dataset.state === 'invalid' ? 'Build provenance is present but invalid.' : 'Unavailable until build provenance is supplied.');
}

function exposeInventory() {
  window.MATERIAL_DESIGNER_SITE_INVENTORY = INVENTORY;
  document.documentElement.dataset.siteInventory = 'registered';
  document.dispatchEvent(new CustomEvent('md:site-shell-ready', { detail: { inventory: INVENTORY } }));
}

function registerPaletteSurface() {
  // The palette must index the real controls, not only controls whose author
  // remembered a marker. Stable ids are required so a destination survives a
  // language change and remains a real teleport target.
  document.querySelectorAll('input:not([type="hidden"]), select, textarea').forEach((node) => {
    if (node.id.startsWith('site-search') || node.id.startsWith('settings-search') || node.dataset.mdSetting) return;
    if (!node.id) return;
    const label = document.querySelector(`label[for="${CSS.escape(node.id)}"]`)?.textContent.trim() || node.getAttribute('aria-label') || node.id;
    node.setAttribute('data-md-setting', label);
    node.setAttribute('data-md-setting-section', node.closest('[data-tab-panel]')?.getAttribute('data-tab-panel') || 'settings');
  });
  document.querySelectorAll('button[id], a[data-goto-tab]').forEach((node) => {
    if (node.hasAttribute('data-md-command') || node.hasAttribute('data-md-palette-open') || node.hasAttribute('data-md-notifications-toggle')) return;
    if (node.matches('[role="tab"], .md-tabs__btn, .settings__tab')) return;
    const label = node.textContent.replace(/\s+/g, ' ').trim() || node.getAttribute('aria-label') || node.id;
    if (label) node.setAttribute('data-md-command', label);
  });
}

export function initSiteShell() {
  registerStrings();
  installSharedDestructiveGate();
  initFrontProvenance();
  const settings = renderSettingsShell();
  const outer = installOuterTabShell();
  const pages = installPageSearches();
  const nested = installNestedSurfaceSearches();
  installUniversalContextMenus();
  installDropdownSearches();
  registerPaletteSurface();
  exposeInventory();
  return { settings, outer, pages, nested, inventory: INVENTORY };
}

export { INVENTORY, SHELL_STORAGE_KEY, SETTINGS_STORAGE_KEY };

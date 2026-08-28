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
  'shell.settings.none': { en: 'No settings match this search.', yue: '冇設定夾到呢個搜尋。' },
  'shell.dock.left': { en: 'Left', yue: '左' },
  'shell.dock.right': { en: 'Right', yue: '右' },
  'shell.dock.top': { en: 'Top', yue: '上' },
  'shell.dock.bottom': { en: 'Bottom', yue: '下' },
  'shell.context.appearance': { en: 'Edit appearance…', yue: '編輯外觀…' },
  'shell.context.lock': { en: 'Lock this element…', yue: '鎖定呢個元素…' },
  'shell.context.open': { en: 'Open destination', yue: '開啟目的地' },
  'shell.context.copy': { en: 'Copy accessible name', yue: '複製無障礙名稱' },
  'shell.dropdown.filter': { en: 'Filter choices', yue: '篩選選項' },
  'shell.dropdown.empty': { en: 'No choices match this search.', yue: '冇選項夾到呢個搜尋。' },
  'shell.provenance.version': { en: 'Version', yue: '版本' },
  'shell.provenance.updated': { en: 'Updated at', yue: '更新時間' },
  'shell.provenance.unavailable': { en: 'Unavailable until build provenance is supplied.', yue: '未有建置出處，所以暫時未能提供。' },
  'shell.provenance.invalid': { en: 'Build provenance is present but invalid.', yue: '建置出處存在，但格式唔啱。' },
});

function registerStrings() {
  try { i18n.register(STRINGS); } catch (error) { console.warn('[site-shell] string registration failed', error); }
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
    console.warn('[site-shell] builder attachment failed', id, error);
  }

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
  const panel = el('div', { class: 'md-shell-popover', role: 'dialog', 'aria-label': label, hidden: true });
  document.body.append(panel);
  let open = false;
  const position = () => {
    if (!open) return;
    const rect = anchor.getBoundingClientRect();
    panel.hidden = false;
    panel.style.visibility = 'hidden';
    const width = panel.offsetWidth;
    const height = panel.offsetHeight;
    const margin = 10;
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
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', keydown, true);
    window.removeEventListener('resize', position);
    window.removeEventListener('scroll', position, true);
    if (restore && anchor.isConnected) anchor.focus();
  };
  const outside = (event) => {
    if (!open || panel.contains(event.target) || anchor.contains(event.target)) return;
    if (event.target instanceof Element && event.target.closest('.mdrx-pop')) return;
    close();
  };
  const keydown = (event) => {
    if (event.key !== 'Escape' || event.target instanceof Element && event.target.closest('.mdrx-pop')) return;
    event.preventDefault(); event.stopPropagation(); close();
  };
  return {
    panel,
    open() { if (open) return; open = true; panel.hidden = false; contentBuilder?.(panel); position(); document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', keydown, true); window.addEventListener('resize', position); window.addEventListener('scroll', position, true); },
    close,
    toggle() { open ? close() : this.open(); },
    reposition: position,
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
  if (!groups.general) groups.general = { id: 'general', name: 'General', tabs: [], collapsed: false, color: '' };
  const assigned = new Set();
  for (const [groupId, group] of Object.entries(groups)) {
    if (!group || typeof group !== 'object') { delete groups[groupId]; continue; }
    if (!Array.isArray(group.tabs)) { group.tabs = []; continue; }
    group.tabs = group.tabs.filter((id) => ids.includes(id) && !assigned.has(id));
    group.id = String(group.id || 'general');
    group.name = String(group.name || group.id);
    group.collapsed = Boolean(group.collapsed);
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
  aside.setAttribute('aria-label', 'Settings sections');
  aside.dataset.edge = state.edge;

  const tablist = el('div', { class: 'settings__tablist', role: 'tablist', 'aria-orientation': 'vertical' });
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
      if ((event.ctrlKey || event.metaKey) && event.key === 'ArrowUp' || (event.ctrlKey || event.metaKey) && event.key === 'ArrowLeft') {
        event.preventDefault(); moveSettingsTab(group.id, -1); return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key === 'ArrowDown' || (event.ctrlKey || event.metaKey) && event.key === 'ArrowRight') {
        event.preventDefault(); moveSettingsTab(group.id, 1); return;
      }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'p') {
        event.preventDefault(); state.pinned.has(group.id) ? state.pinned.delete(group.id) : state.pinned.add(group.id); saveSettingsState(state); renderSettingsNav(); tab.focus(); return;
      }
      if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') { event.preventDefault(); activateSettingsTab(visible[(index - 1 + visible.length) % visible.length], true); }
      else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') { event.preventDefault(); activateSettingsTab(visible[(index + 1) % visible.length], true); }
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
    for (const [groupId, bucket] of Object.entries(state.groups)) {
      if (!bucket.tabs.length) continue;
      const header = el('div', { class: 'settings__group-header', role: 'presentation' }, el('span', { text: bucket.name }), el('button', { type: 'button', class: 'settings__group-collapse', text: bucket.collapsed ? '+' : '−', 'aria-label': `${bucket.collapsed ? 'Expand' : 'Collapse'} ${bucket.name}` }));
      header.querySelector('button').addEventListener('click', () => { bucket.collapsed = !bucket.collapsed; saveSettingsState(state); renderSettingsNav(); });
      tablist.append(header);
      for (const id of state.order) {
        if (!bucket.tabs.includes(id)) continue;
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
    state.groups[safe] = { id: safe, name: String(name).trim().slice(0, 120), tabs: [], collapsed: false, color: '' };
    saveSettingsState(state); renderSettingsNav(); return true;
  }
  function moveSettingsToGroup(id, groupId) {
    if (!state.groups[groupId] || !settingsTabs.has(id)) return false;
    for (const bucket of Object.values(state.groups)) bucket.tabs = bucket.tabs.filter((tabId) => tabId !== id);
    state.groups[groupId].tabs.push(id); state.groups[groupId].collapsed = false;
    saveSettingsState(state); renderSettingsNav(); return true;
  }

  const layoutPopover = createPopover(layoutButton, text('shell.settings.layout', 'Settings layout'), (panel) => {
    panel.replaceChildren(el('div', { class: 'md-shell-popover__head', text: text('shell.settings.layout', 'Settings layout') }));
    const edgeRow = el('div', { class: 'md-shell-edge-list', role: 'group', 'aria-label': 'Settings tab docking' });
    for (const edge of EDGES) edgeRow.append(el('button', { type: 'button', class: 'md-btn md-btn--text', text: bilingual(`shell.dock.${edge}`, edge[0].toUpperCase() + edge.slice(1), edge), 'aria-pressed': String(state.edge === edge) }));
    [...edgeRow.children].forEach((button, index) => button.addEventListener('click', () => { state.edge = EDGES[index]; saveSettingsState(state); renderSettingsNav(); layoutPopover.close(); }));
    const groupName = el('input', { type: 'text', class: 'md-input', placeholder: text('shell.settings.groupName', 'New group name'), 'aria-label': text('shell.settings.groupName', 'New group name') });
    const create = el('button', { type: 'button', class: 'md-btn md-btn--outlined', text: text('shell.settings.createGroup', 'Create group') });
    create.addEventListener('click', () => { if (createSettingsGroup(groupName.value)) { groupName.value = ''; layoutPopover.reposition(); } });
    panel.append(edgeRow, el('div', { class: 'md-shell-inline-form' }, groupName, create));
  });
  layoutButton.addEventListener('click', () => layoutPopover.toggle());

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
    });
    picker.open();
  });

  updateSettingLabels();
  renderSettingsNav();
  window.MATERIAL_DESIGNER_SETTINGS_ACTIVATE = activateSettingsTab;
  return { state, renderSettingsNav, activateSettingsTab, moveSettingsToGroup, settingsTabs, perTabSearches };
}

function safeMatcher(field) {
  const matcher = field.matcher;
  if (!matcher.ok) return { ok: false, empty: false, test: () => false, error: matcher.error || 'Invalid pattern' };
  return matcher;
}

function installOuterTabShell() {
  const root = document.querySelector('#tab-strip');
  const strip = tabs.getTabStrip();
  if (!root || !strip || root.dataset.shellReady === 'true') return null;
  root.dataset.shellReady = 'true';
  root.dataset.dockEdge = strip.getDockEdge?.() || 'left';
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
            return matcher.empty || matcher.test(tab.label);
          });
        }
        if (!matcher.ok || !rows.length) section.append(el('p', { class: 'md-shell-empty', text: matcher.ok ? text('shell.tabs.noMatch', 'No tabs match this bounded search.') : matcher.error }));
        for (const row of rows) {
          const button = el('button', { type: 'button', class: 'md-btn md-btn--text md-shell-result', text: row.group ? row.label : `${row.label}${row.pinned ? ' · Pinned' : ''}${row.closed ? ' · Closed' : ''}` });
          button.addEventListener('click', () => { if (row.id) { if (strip.getClosed?.().includes(row.id)) strip.reopenTabs([row.id]); strip.goToTab?.(row.id); tabs.goToTab(row.id, { focus: true, highlight: true }); } });
          section.append(button);
        }
        resultHost.append(section);
      }
    };
    for (const { field } of fields) field.input.addEventListener('input', render);
    for (const { field } of fields) panel.append(field.root);
    panel.append(resultHost); render(); requestAnimationFrame(() => fields[0].field.input.focus());
  });

  const groupPopover = createPopover(groups, text('shell.tabs.groups', 'Tab groups'), (panel) => {
    const groupsData = strip.listGroups?.() || [];
    panel.replaceChildren(el('div', { class: 'md-shell-popover__head', text: text('shell.tabs.groups', 'Tab groups') }));
    const newName = el('input', { type: 'text', class: 'md-input', placeholder: 'New group name', 'aria-label': 'New group name' });
    const create = el('button', { type: 'button', class: 'md-btn md-btn--outlined', text: 'Create group' });
    const list = el('div', { class: 'md-shell-list' });
    create.addEventListener('click', () => { const name = newName.value.trim(); if (!name) return; const id = `group-${Date.now().toString(36)}`; strip.createGroup?.(id, name, ''); newName.value = ''; groupPopover.close(false); groupPopover.open(); });
    panel.append(el('div', { class: 'md-shell-inline-form' }, newName, create), list);
    for (const group of groupsData) {
      const row = el('div', { class: 'md-shell-group-row' });
      const title = el('strong', { text: `${group.name} (${group.tabs.length})` });
      const collapse = el('button', { type: 'button', class: 'md-btn md-btn--text', text: group.collapsed ? 'Expand' : 'Collapse' });
      collapse.addEventListener('click', () => { strip.setGroupCollapsed?.(group.id, !group.collapsed); groupPopover.close(false); groupPopover.open(); });
      row.append(title, collapse);
      list.append(row);
      for (const tabId of group.tabs) {
        const tab = strip.listTabs().find((candidate) => candidate.id === tabId); if (!tab) continue;
        const member = el('button', { type: 'button', class: 'md-btn md-btn--text md-shell-member', text: tab.label });
        member.addEventListener('click', () => { strip.reopenTabs?.([tabId]); tabs.goToTab(tabId, { focus: true, highlight: true }); groupPopover.close(); });
        list.append(member);
      }
    }
    const closed = strip.listTabs().filter((tab) => tab.closed);
    if (closed.length) {
      list.append(el('h3', { class: 'md-shell-scope-title', text: text('shell.tabs.closed', 'Closed tabs') }));
      for (const tab of closed) { const reopen = el('button', { type: 'button', class: 'md-btn md-btn--text', text: `${text('shell.tabs.reopen', 'Reopen')}: ${tab.label}` }); reopen.addEventListener('click', () => { strip.reopenTabs([tab.id]); groupPopover.close(false); groupPopover.open(); }); list.append(reopen); }
    }
  });

  const bulkPopover = createPopover(bulk, text('shell.tabs.bulk', 'Bulk close'), (panel) => {
    panel.replaceChildren(el('div', { class: 'md-shell-popover__head', text: text('shell.tabs.bulk', 'Bulk close') }));
    const include = el('input', { type: 'checkbox', id: 'shell-include-pinned' });
    const includeLabel = el('label', { for: include.id, text: text('shell.tabs.includePinned', 'Include pinned tabs') });
    const actionsHost = el('div', { class: 'md-shell-bulk-actions' });
    for (const mode of ['containing', 'not-containing']) {
      const title = text(`shell.tabs.close${mode === 'containing' ? 'Containing' : 'NotContaining'}`, mode === 'containing' ? 'Close tabs containing text' : 'Close tabs not containing text');
      const field = makeSearchField({ id: `tabs-bulk-${mode}`, label: title });
      const preview = el('p', { class: 'md-shell-preview', role: 'status', 'aria-live': 'polite' });
      const button = el('button', { type: 'button', class: 'md-btn md-btn--danger', text: title });
      const calculate = () => {
        const matcher = safeMatcher(field); const list = strip.listTabs(); const matches = list.filter((tab) => !tab.closed && (matcher.empty ? false : matcher.ok && matcher.test(tab.label))); const ids = list.filter((tab) => !tab.closed && (mode === 'containing' ? matches.some((candidate) => candidate.id === tab.id) : !matches.some((candidate) => candidate.id === tab.id))).map((tab) => tab.id); const skipped = ids.filter((id) => !include.checked && strip.getPinned?.().includes(id));
        preview.textContent = matcher.empty ? 'Enter text or enable regex before closing tabs.' : !matcher.ok ? matcher.error : text('shell.tabs.preview', 'Tabs match.') .replace('{count}', String(Math.max(0, ids.length - skipped.length)));
        button.disabled = matcher.empty || !matcher.ok || ids.length - skipped.length <= 0;
        button.dataset.closeIds = JSON.stringify(ids);
      };
      field.input.addEventListener('input', calculate); include.addEventListener('change', calculate);
      button.addEventListener('click', () => { const ids = JSON.parse(button.dataset.closeIds || '[]'); if (!ids.length || !window.confirm(`${title}: ${ids.length}?`)) return; strip.closeTabs?.(ids, { includePinned: include.checked }); calculate(); });
      actionsHost.append(el('h3', { class: 'md-shell-scope-title', text: title }), field.root, preview, button); calculate();
    }
    panel.append(el('div', { class: 'md-shell-checkbox' }, include, includeLabel), actionsHost);
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
  strip.on?.('dock', ({ edge }) => { root.dataset.dockEdge = edge; });
  return { root, findPopover, groupPopover, bulkPopover, dockPopover };
}

function installUniversalContextMenus() {
  if (document.documentElement.dataset.contextShellReady === 'true') return;
  document.documentElement.dataset.contextShellReady = 'true';
  let current = null;
  const trigger = el('span', { class: 'md-shell-context-anchor', tabindex: '-1' });
  document.body.append(trigger);
  const menu = createPopover(trigger, 'Element actions', (panel) => {
    const field = makeSearchField({ id: `context-${current?.targetId || 'element'}`, label: 'Search actions' });
    const list = el('div', { class: 'md-shell-list' });
    const render = () => {
      const matcher = safeMatcher(field); list.replaceChildren();
      const actions = [
        { label: text('shell.context.appearance', 'Edit appearance…'), run: () => document.dispatchEvent(new CustomEvent('md:appearance-request', { detail: current })) },
        { label: text('shell.context.lock', 'Lock this element…'), run: () => document.dispatchEvent(new CustomEvent('md:lock-request', { detail: current })) },
        { label: text('shell.context.copy', 'Copy accessible name'), run: () => navigator.clipboard?.writeText(current?.element?.getAttribute('aria-label') || current?.element?.textContent?.trim() || '') },
      ];
      if (current?.settingsId) actions.push({ label: text('shell.settings.move', 'Move into group'), run: () => document.dispatchEvent(new CustomEvent('md:settings-group-request', { detail: { id: current.settingsId } })) });
      if (current?.element?.matches?.('[data-goto-tab]')) actions.push({ label: text('shell.context.open', 'Open destination'), run: () => current.element.click() });
      for (const item of actions) if (matcher.ok && (matcher.empty || matcher.test(item.label))) { const button = el('button', { type: 'button', class: 'md-btn md-btn--text', text: item.label }); button.addEventListener('click', () => { menu.close(); item.run(); }); list.append(button); }
      if (!list.children.length) list.append(el('p', { class: 'md-shell-empty', text: matcher.ok ? 'No actions match this search.' : matcher.error }));
    };
    field.input.addEventListener('input', render); panel.append(field.root, list); render(); requestAnimationFrame(() => field.input.focus());
  });

  function openFor(element, x, y) {
    if (!(element instanceof HTMLElement) || element === document.body || element.closest('#tab-strip,[role="tab"],.md-shell-popover,.mdrx-pop,.md-palette,.md-notif')) return;
    const rect = element.getBoundingClientRect();
    Object.assign(trigger.style, { position: 'fixed', left: `${x ?? rect.left + 12}px`, top: `${y ?? rect.bottom}px`, width: '1px', height: '1px' });
    current = { element, targetId: element.id || element.dataset?.setting || element.tagName.toLowerCase(), settingsId: element.dataset?.shellSettingsTab || null, x, y };
    menu.close(false); menu.open();
  }
  document.addEventListener('md:site-context-request', (event) => openFor(event.detail?.element, event.detail?.x, event.detail?.y));
  document.addEventListener('contextmenu', (event) => { const target = event.target instanceof Element ? event.target.closest('*') : null; if (!target || target.closest('#tab-strip,[role="tab"],.md-shell-popover,.mdrx-pop,.md-palette,.md-notif')) return; event.preventDefault(); openFor(target, event.clientX, event.clientY); }, true);
  document.addEventListener('keydown', (event) => { if (event.key !== 'ContextMenu' && !(event.key === 'F10' && event.shiftKey)) return; const target = document.activeElement instanceof HTMLElement ? document.activeElement : null; if (!target || target.closest('#tab-strip,[role="tab"],.md-shell-popover,.mdrx-pop,.md-palette,.md-notif')) return; event.preventDefault(); openFor(target); }, true);

  let longPress = 0;
  document.addEventListener('pointerdown', (event) => { if (event.pointerType !== 'touch') return; const target = event.target instanceof Element ? event.target.closest('*') : null; if (!target || target.closest('#tab-strip,[role="tab"],.md-shell-popover,.mdrx-pop,.md-palette,.md-notif')) return; longPress = window.setTimeout(() => openFor(target, event.clientX, event.clientY), 650); }, true);
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
    const status = el('span', { class: 'md-shell-dropdown__status', role: 'status', 'aria-live': 'polite' });
    select.parentNode.insertBefore(wrapper, select); wrapper.append(field.root, select, status);
    const render = () => {
      const matcher = safeMatcher(field); let count = 0;
      for (const option of select.options) { const visible = matcher.ok && (matcher.empty || matcher.test(option.textContent || option.label)); option.hidden = !visible; if (visible) count += 1; }
      status.textContent = count ? `${count} choices` : text('shell.dropdown.empty', 'No choices match this search.');
    };
    field.input.addEventListener('input', render); render();
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
  if (status) status.textContent = host.dataset.state === 'verified' ? 'Provenance recorded in the build metadata.' : text(host.dataset.state === 'invalid' ? 'shell.provenance.invalid' : 'shell.provenance.unavailable', host.dataset.state === 'invalid' ? 'Build provenance is present but invalid.' : 'Unavailable until build provenance is supplied.');
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
  initFrontProvenance();
  const settings = renderSettingsShell();
  const outer = installOuterTabShell();
  installUniversalContextMenus();
  installDropdownSearches();
  registerPaletteSurface();
  exposeInventory();
  return { settings, outer, inventory: INVENTORY };
}

export { INVENTORY, SHELL_STORAGE_KEY, SETTINGS_STORAGE_KEY };

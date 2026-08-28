/* Target-specific appearance editing for the documentation site.
 *
 * This is a browser-local equivalent of the desktop editor. It deliberately
 * accepts only explicit data-appearance-id or id values. Anonymous DOM nodes
 * are reported as unsupported instead of receiving an ordinal identity that
 * could retarget a saved style after a reorder or reload.
 */

export const STATES = Object.freeze([
  'normal', 'hover', 'focus', 'pressed', 'selected', 'disabled', 'dragged',
  'validation', 'loading', 'success', 'warning', 'error',
]);
export const STORAGE_KEY = 'md-designer:element-appearance.v1';
export const HISTORY_KEY = 'md-designer:element-appearance-history.v1';
export const PRESETS_KEY = 'md-designer:element-appearance-presets.v1';
export const RAINBOW_SENTINEL = 'appearance-rainbow-sentinel';
const MAX_TARGETS = 2000;
const MAX_HISTORY = 200;
const MAX_IMPORT_BYTES = 500000;
const pending = new WeakMap();
let registry = new Map();
let records = null;
let history = null;
let copied = null;

const CAPABILITIES = Object.freeze([
  ['layers', true, 'Layer visibility, order, opacity and blending are projected onto the target.'],
  ['typography', true, 'Family, size, weight, styles, spacing, direction and alignment are projected onto the target.'],
  ['continuous-colour', true, 'Use the site colour translator and numeric entry for any sRGB value.'],
  ['rainbow-sentinel', true, 'The rainbow is a shared stylesheet animation with a reduced-motion single hue.'],
  ['transform', true, 'Affine translation, scale and rotation are projected onto the target.'],
  ['raster-selections', false, 'The browser surface stores selection metadata but has no raster compositor.'],
  ['channels-masks-adjustments', false, 'The browser surface stores metadata but has no channel or adjustment compositor.'],
  ['smart-embedded-content', false, 'The browser surface cannot host a non-destructive smart object.'],
  ['warp-perspective', false, 'The browser surface consumes affine transforms only.'],
]);

function now() { return new Date().toISOString(); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function read(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch (_) { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (_) { return false; }
}
function styleDefault() {
  return { layers: [{ id: 'base', name: 'Base appearance', kind: 'shape', visible: true, locked: false, opacity: 1, blendMode: 'normal', parentId: null, fill: 'transparent', stroke: 'transparent', effects: [], transform: { x: 0, y: 0, width: 100, height: 100, rotation: 0 } }], selections: [], channels: ['composite'], masks: [], fontFamily: 'system-ui', fontSize: 14, fontWeight: 400, italic: false, underline: 'none', strike: 'none', overline: false, capitalization: 'none', textColor: 'var(--md-sys-color-on-surface)', highlightColor: 'transparent', letterSpacing: 0, wordSpacing: 0, lineHeight: 1.5, baselineOffset: 0, textDirection: 'auto', alignment: 'start', motion: 'default', rainbowSpeedLevel: 3, inheritedFrom: null, overrides: {} };
}
function emptyRecord(id) {
  const base = styleDefault();
  return { targetId: id, activeState: 'normal', zoom: 1, rulers: true, guides: true, updatedAt: now(), states: Object.fromEntries(STATES.map((state) => [state, clone(base)])) };
}
function ensureLoaded() {
  if (records && history) return;
  const stored = read(STORAGE_KEY, {});
  records = stored && typeof stored === 'object' && !Array.isArray(stored) ? Object.fromEntries(Object.entries(stored).slice(0, MAX_TARGETS)) : {};
  history = read(HISTORY_KEY, []);
  if (!Array.isArray(history)) history = [];
  history = history.slice(-MAX_HISTORY);
}
function targetId(element) {
  const explicit = element.getAttribute('data-appearance-id') || element.id;
  return explicit ? `site:${explicit}` : null;
}
function targetLabel(element) { return element.getAttribute('aria-label') || element.getAttribute('title') || element.textContent?.trim().replace(/\s+/g, ' ').slice(0, 100) || element.tagName.toLowerCase(); }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character])); }
function targetFor(element) {
  const id = targetId(element);
  return id ? { id, element, label: targetLabel(element), role: element.getAttribute('role') || element.tagName.toLowerCase() } : null;
}
function resolved(record, state) {
  const current = record.states[state] || styleDefault();
  if (!current.inheritedFrom || current.inheritedFrom === state) return current;
  const parent = resolved(record, current.inheritedFrom);
  return { ...parent, ...current, layers: current.layers.length ? current.layers : parent.layers, selections: current.selections.length ? current.selections : parent.selections, channels: current.channels.length ? current.channels : parent.channels, masks: current.masks.length ? current.masks : parent.masks };
}
function apply(target, style, state) {
  if (!target?.element) return;
  const element = target.element;
  const visible = style.layers.filter((layer) => layer.visible);
  const top = visible[visible.length - 1];
  element.style.color = style.textColor === RAINBOW_SENTINEL ? 'transparent' : style.textColor;
  element.style.fontFamily = style.fontFamily;
  element.style.fontSize = `${style.fontSize}px`;
  element.style.fontWeight = String(style.fontWeight);
  element.style.fontStyle = style.italic ? 'italic' : 'normal';
  element.style.textDecorationLine = [style.underline !== 'none' ? 'underline' : '', style.strike !== 'none' ? 'line-through' : '', style.overline ? 'overline' : ''].filter(Boolean).join(' ') || 'none';
  element.style.textTransform = style.capitalization === 'none' ? 'none' : style.capitalization;
  element.style.letterSpacing = `${style.letterSpacing}em`;
  element.style.wordSpacing = `${style.wordSpacing}em`;
  element.style.lineHeight = String(style.lineHeight);
  element.style.borderRadius = `${style.borderRadius}px`;
  element.style.textAlign = style.alignment === 'start' ? '' : style.alignment;
  element.dir = style.textDirection === 'auto' ? '' : style.textDirection;
  element.style.opacity = String(visible.reduce((value, layer) => value * layer.opacity, 1));
  element.style.mixBlendMode = top?.blendMode === 'normal' ? '' : top?.blendMode || '';
  if (top?.fill && top.fill !== 'transparent') element.style.background = top.fill;
  if (top?.stroke && top.stroke !== 'transparent') element.style.border = top.stroke;
  element.style.transform = top ? `translate(${top.transform.x}px, ${top.transform.y}px) rotate(${top.transform.rotation}deg) scale(${top.transform.width / 100}, ${top.transform.height / 100})` : '';
  element.style.setProperty('--appearance-rainbow-duration', ['30s', '15s', '8s', '4s', '2s'][style.rainbowSpeedLevel - 1] || '8s');
  element.dataset.appearanceState = state;
  if (style.textColor === RAINBOW_SENTINEL) element.dataset.appearanceRainbow = 'true'; else delete element.dataset.appearanceRainbow;
}
function clear(target) {
  if (!target?.element) return;
  const element = target.element;
  ['color', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-decoration-line', 'text-transform', 'letter-spacing', 'word-spacing', 'line-height', 'border-radius', 'text-align', 'opacity', 'mix-blend-mode', 'background', 'border', 'transform'].forEach((property) => element.style.removeProperty(property));
  delete element.dataset.appearanceState;
  delete element.dataset.appearanceRainbow;
}
function record(target, next, action) {
  ensureLoaded();
  const previous = records[target.id] || emptyRecord(target.id);
  history.push({ id: `${Date.now()}-${target.id}`, targetId: target.id, action, at: now(), snapshot: clone(previous) });
  history = history.slice(-MAX_HISTORY);
  records[target.id] = clone(next);
  const saved = write(STORAGE_KEY, records) && write(HISTORY_KEY, history);
  target.element.dataset.appearancePersistence = saved ? 'saved' : 'unsaved';
  apply(target, resolved(next, next.activeState), next.activeState);
}
function strictText(text) {
  if (typeof text !== 'string' || text.length > MAX_IMPORT_BYTES) return null;
  let escaped = false; let inString = false; let start = -1; const scopes = [];
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (inString) { if (escaped) { escaped = false; continue; } if (character === '\\') { escaped = true; continue; } if (character === '"') { inString = false; if (/^\s*:/.test(text.slice(index + 1)) && scopes.length) { const key = JSON.parse(text.slice(start, index + 1)); const scope = scopes[scopes.length - 1]; if (scope.has(key)) return null; scope.add(key); } } continue; }
    if (character === '"') { inString = true; start = index; } else if (character === '{') scopes.push(new Set()); else if (character === '}') scopes.pop();
  }
  if (inString || scopes.length) return null;
  try { return JSON.parse(text); } catch (_) { return null; }
}
function validImport(value) {
  if (!value || typeof value !== 'object' || Object.keys(value).some((key) => !['schema', 'version', 'targetId', 'appearance'].includes(key)) || value.schema !== 'material-designer.element-appearance' || value.version !== 1 || typeof value.appearance !== 'object' || typeof value.targetId !== 'string' || value.targetId.length > 240) return null;
  const keys = ['targetId', 'activeState', 'zoom', 'rulers', 'guides', 'updatedAt', 'states'];
  if (Object.keys(value.appearance).some((key) => !keys.includes(key)) || !STATES.every((state) => value.appearance.states[state] && typeof value.appearance.states[state] === 'object')) return null;
  const styleKeys = ['layers', 'selections', 'channels', 'masks', 'fontFamily', 'fontSize', 'fontWeight', 'italic', 'underline', 'strike', 'overline', 'capitalization', 'textColor', 'highlightColor', 'letterSpacing', 'wordSpacing', 'lineHeight', 'baselineOffset', 'textDirection', 'alignment', 'motion', 'rainbowSpeedLevel', 'inheritedFrom', 'overrides'];
  if (STATES.some((state) => Object.keys(value.appearance.states[state]).some((key) => !styleKeys.includes(key)))) return null;
  if (!STATES.includes(value.appearance.activeState) || !Number.isFinite(value.appearance.zoom) || value.appearance.zoom < 0.25 || value.appearance.zoom > 4) return null;
  return value;
}
function addRegex(input, regex) {
  if (!input || !regex?.attachRegexBuilder) return;
  input.dataset.regexBuilder = '';
  regex.attachRegexBuilder(input, { key: `appearance:${input.id || Math.random().toString(36).slice(2)}` });
}
function editor(target, close, regex, copy) {
  ensureLoaded();
  const recordValue = records[target.id] || emptyRecord(target.id);
  let active = recordValue.activeState;
  const before = clone(recordValue);
  const safeLabel = escapeHtml(target.label);
  const safeRole = escapeHtml(target.role);
  const host = document.createElement('section'); host.className = 'element-appearance-editor'; host.setAttribute('role', 'dialog'); host.setAttribute('aria-modal', 'false'); host.setAttribute('aria-label', `${copy('Edit appearance', '編輯外觀')} ${target.label}`); host.dataset.appearanceEditor = 'true';
  host.innerHTML = `<header><div><h2>${copy('Edit appearance', '編輯外觀')}</h2><p>${safeLabel} · ${safeRole}</p></div><button type="button" data-close aria-label="${copy('Close appearance editor', '關閉外觀編輯器')}">×</button></header><div class="element-appearance-toolbar"><button type="button" data-undo>Undo</button><button type="button" data-redo>Redo</button><button type="button" data-reset>Reset element</button><button type="button" data-copy>Copy style</button><button type="button" data-paste>Paste style</button><button type="button" data-export>Export appearance</button><button type="button" data-import>Import appearance</button><input type="file" data-import-file accept="application/json,.json" hidden><input data-preset-name placeholder="Preset name" maxlength="120"><button type="button" data-save-preset>Save preset</button><select data-presets aria-label="Apply named preset"><option value="">Apply preset…</option></select></div><div data-editor-body></div>`;
  const body = host.querySelector('[data-editor-body]');
  const render = () => {
    const current = recordValue.states[active];
    body.innerHTML = `<div class="element-appearance-state-tabs" role="tablist">${STATES.map((state) => `<button type="button" role="tab" aria-selected="${state === active}" data-state="${state}">${state}</button>`).join('')}</div><div class="element-appearance-preview"><div><small>Before</small><div data-before>${safeLabel}</div></div><div><small>After</small><div data-after>${safeLabel}</div></div></div><div class="element-appearance-state-preview">${STATES.map((state) => `<button type="button" data-preview-state="${state}">${state}<span>Aa</span></button>`).join('')}</div><label>Property search<input type="search" id="element-appearance-property-search" placeholder="Search properties"><button type="button" data-property-regex>.*</button></label><div class="element-appearance-form"><label>Font family<input data-property="fontFamily" value="${escapeHtml(current.fontFamily)}"></label><label>Font size<input type="number" data-property="fontSize" min="6" max="160" value="${current.fontSize}"></label><label>Weight<input type="number" data-property="fontWeight" min="100" max="900" step="100" value="${current.fontWeight}"></label><label>Line height<input type="number" data-property="lineHeight" min="0.5" max="4" step=".05" value="${current.lineHeight}"></label><label>Text color<input data-property="textColor" value="${escapeHtml(current.textColor)}"></label><button type="button" data-rainbow>Use animated rainbow</button><label>Letter spacing<input type="number" data-property="letterSpacing" step=".01" value="${current.letterSpacing}"></label><label>Word spacing<input type="number" data-property="wordSpacing" step=".01" value="${current.wordSpacing}"></label><label>Border radius<input type="number" data-property="borderRadius" min="0" max="200" value="${current.borderRadius}"></label><label>Elevation<input type="number" data-property="elevation" min="0" max="24" value="${current.elevation}"></label><label>State inheritance<select data-property="inheritedFrom"><option value="">Explicit values</option>${STATES.filter((state) => state !== active).map((state) => `<option value="${state}" ${current.inheritedFrom === state ? 'selected' : ''}>${state}</option>`).join('')}</select></label></div><h3>Layers and groups</h3><div data-layers>${current.layers.map((layer) => `<div class="element-appearance-layer"><input data-layer-name="${escapeHtml(layer.id)}" value="${escapeHtml(layer.name)}"><button type="button" data-layer-visibility="${escapeHtml(layer.id)}">${layer.visible ? 'Hide' : 'Show'}</button><button type="button" data-layer-lock="${escapeHtml(layer.id)}">${layer.locked ? 'Unlock' : 'Lock'}</button><button type="button" data-layer-duplicate="${escapeHtml(layer.id)}">Duplicate</button><button type="button" data-layer-up="${escapeHtml(layer.id)}">Up</button><button type="button" data-layer-down="${escapeHtml(layer.id)}">Down</button><button type="button" data-layer-delete="${escapeHtml(layer.id)}" ${layer.id === 'base' ? 'disabled' : ''}>Delete</button></div>`).join('')}</div><button type="button" data-layer-add>Add layer</button><button type="button" data-layer-add-group>Add group</button><h3>Capability matrix</h3><div class="element-appearance-capabilities">${CAPABILITIES.map(([id, supported, reason]) => `<div><span>${escapeHtml(id)}</span><small>${supported ? 'Available' : `Unavailable: ${escapeHtml(reason)}`}</small></div>`).join('')}</div>`;
    const search = body.querySelector('#element-appearance-property-search'); addRegex(search, regex);
    body.querySelectorAll('[data-state]').forEach((button) => button.addEventListener('click', () => { active = button.dataset.state; recordValue.activeState = active; recordValue.states[active] = recordValue.states[active] || styleDefault(); render(); record(target, recordValue, `Selected ${active} state`); }));
    body.querySelectorAll('[data-preview-state]').forEach((button) => button.addEventListener('click', () => { active = button.dataset.previewState; recordValue.activeState = active; render(); apply(target, resolved(recordValue, active), active); }));
    body.querySelectorAll('[data-property]').forEach((input) => input.addEventListener('change', () => { const key = input.dataset.property; const value = ['fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'wordSpacing', 'borderRadius', 'elevation'].includes(key) ? Number(input.value) : input.value; recordValue.states[active][key] = value; record(target, recordValue, `Changed ${key}`); render(); }));
    body.querySelector('[data-rainbow]')?.addEventListener('click', () => { recordValue.states[active].textColor = RAINBOW_SENTINEL; record(target, recordValue, 'Enabled rainbow color'); render(); });
    body.querySelectorAll('[data-layer-visibility]').forEach((button) => button.addEventListener('click', () => { const layer = recordValue.states[active].layers.find((item) => item.id === button.dataset.layerVisibility); if (layer) { layer.visible = !layer.visible; record(target, recordValue, 'Changed layer visibility'); render(); } }));
    body.querySelectorAll('[data-layer-lock]').forEach((button) => button.addEventListener('click', () => { const layer = recordValue.states[active].layers.find((item) => item.id === button.dataset.layerLock); if (layer) { layer.locked = !layer.locked; record(target, recordValue, 'Changed layer lock'); render(); } }));
    body.querySelectorAll('[data-layer-name]').forEach((input) => input.addEventListener('change', () => { const layer = recordValue.states[active].layers.find((item) => item.id === input.dataset.layerName); if (layer && !layer.locked) { layer.name = input.value.slice(0, 120); record(target, recordValue, 'Renamed layer'); } }));
    body.querySelectorAll('[data-layer-delete]').forEach((button) => button.addEventListener('click', () => { recordValue.states[active].layers = recordValue.states[active].layers.filter((layer) => layer.id !== button.dataset.layerDelete); record(target, recordValue, 'Deleted layer'); render(); }));
    body.querySelectorAll('[data-layer-duplicate]').forEach((button) => button.addEventListener('click', () => { const layer = recordValue.states[active].layers.find((item) => item.id === button.dataset.layerDuplicate); if (layer) { recordValue.states[active].layers.push({ ...clone(layer), id: `layer-${Date.now()}`, name: `${layer.name} copy` }); record(target, recordValue, 'Duplicated layer'); render(); } }));
    body.querySelectorAll('[data-layer-up], [data-layer-down]').forEach((button) => button.addEventListener('click', () => { const layers = recordValue.states[active].layers; const index = layers.findIndex((item) => item.id === button.dataset.layerUp || item.id === button.dataset.layerDown); const delta = button.hasAttribute('data-layer-up') ? -1 : 1; const nextIndex = index + delta; if (index >= 0 && nextIndex >= 0 && nextIndex < layers.length) { const moved = layers.splice(index, 1)[0]; layers.splice(nextIndex, 0, moved); record(target, recordValue, 'Reordered layer'); render(); } }));
    body.querySelector('[data-layer-add]')?.addEventListener('click', () => { recordValue.states[active].layers.push({ ...clone(styleDefault().layers[0]), id: `layer-${Date.now()}`, name: 'New layer' }); record(target, recordValue, 'Added layer'); render(); });
    body.querySelector('[data-layer-add-group]')?.addEventListener('click', () => { recordValue.states[active].layers.push({ ...clone(styleDefault().layers[0]), id: `group-${Date.now()}`, name: 'New group', kind: 'group' }); record(target, recordValue, 'Added layer group'); render(); });
    body.querySelector('[data-before]').style.cssText = previewCss(resolved(before, before.activeState)); body.querySelector('[data-after]').style.cssText = previewCss(resolved(recordValue, active));
  };
  host.querySelector('[data-close]').addEventListener('click', close); host.querySelector('[data-export]').addEventListener('click', () => { const blob = new Blob([JSON.stringify({ schema: 'material-designer.element-appearance', version: 1, targetId: target.id, appearance: recordValue }, null, 2)], { type: 'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `${target.id.replace(/[^a-zA-Z0-9_-]/g, '_')}-appearance.json`; link.click(); URL.revokeObjectURL(link.href); });
  host.querySelector('[data-import]').addEventListener('click', () => host.querySelector('[data-import-file]').click()); host.querySelector('[data-import-file]').addEventListener('change', async (event) => { const file = event.target.files?.[0]; event.target.value = ''; if (!file || file.size > MAX_IMPORT_BYTES) return; const parsed = validImport(strictText(await file.text())); if (!parsed) return; Object.assign(recordValue, clone(parsed.appearance), { targetId: target.id }); record(target, recordValue, 'Imported appearance'); render(); });
  host.querySelector('[data-copy]').addEventListener('click', () => { copied = clone(recordValue.states[active]); }); host.querySelector('[data-paste]').addEventListener('click', () => { if (copied) { recordValue.states[active] = clone(copied); record(target, recordValue, 'Pasted appearance style'); render(); } }); host.querySelector('[data-reset]').addEventListener('click', () => { delete records[target.id]; clear(target); write(STORAGE_KEY, records); render(); });
  host.querySelector('[data-save-preset]').addEventListener('click', () => { const name = host.querySelector('[data-preset-name]').value.trim().slice(0, 120); if (!name) return; const presets = read(PRESETS_KEY, []); presets.push({ id: `preset-${Date.now()}`, name, state: clone(recordValue.states[active]), createdAt: now() }); write(PRESETS_KEY, presets.slice(-100)); renderPresets(host, target, recordValue, active, render); });
  render(); renderPresets(host, target, recordValue, active, render); document.body.append(host); host.querySelector('[data-close]').focus();
}
function renderPresets(host, target, recordValue, active, render) { const select = host.querySelector('[data-presets]'); if (!select) return; select.innerHTML = '<option value="">Apply preset…</option>' + read(PRESETS_KEY, []).slice(-100).map((preset) => `<option value="${escapeHtml(preset.id)}">${escapeHtml(preset.name)}</option>`).join(''); select.onchange = () => { const preset = read(PRESETS_KEY, []).find((item) => item.id === select.value); if (!preset) return; recordValue.states[active] = clone(preset.state); record(target, recordValue, `Applied preset ${preset.name}`); render(); }; }
function previewCss(style) { const top = style.layers.filter((layer) => layer.visible).at(-1); return `color:${style.textColor === RAINBOW_SENTINEL ? 'transparent' : style.textColor};font-family:${style.fontFamily};font-size:${style.fontSize}px;font-weight:${style.fontWeight};border-radius:${style.borderRadius}px;background:${top?.fill || 'transparent'};opacity:${style.layers.reduce((value, layer) => value * layer.opacity, 1)};padding:8px;min-height:32px`; }
export function init({ regex, i18n }) {
  ensureLoaded();
  const root = document.body;
  const unsupported = document.createElement('p'); unsupported.className = 'element-appearance-unsupported'; unsupported.setAttribute('role', 'status'); unsupported.setAttribute('aria-live', 'polite'); root.prepend(unsupported);
  const scan = () => { const owners = new Map(); let unsupportedCount = 0; document.querySelectorAll('*').forEach((element) => { const target = targetFor(element); if (!target) { if (element !== unsupported && !element.closest('[data-appearance-editor]')) unsupportedCount += 1; return; } if (owners.has(target.id) && owners.get(target.id) !== element) { unsupportedCount += 1; return; } owners.set(target.id, element); registry.set(target.id, target); if (records[target.id]) apply(target, resolved(records[target.id], records[target.id].activeState), records[target.id].activeState); }); unsupported.textContent = unsupportedCount ? `${unsupportedCount} rendered elements need an explicit product-owned id before appearance editing is available.` : ''; };
  const open = (target, x, y, direct = false) => { if (!target) return; if (direct) { editor(target, () => { document.querySelector('[data-appearance-editor="true"]')?.remove(); target.element.focus(); }, regex, (en, zh) => i18nCopy(en, zh)); return; } const menu = document.createElement('div'); menu.className = 'element-appearance-menu'; menu.dataset.appearanceEditor = 'menu'; menu.style.cssText = `position:fixed;left:${Math.max(12, Math.min(x, innerWidth - 320))}px;top:${Math.max(12, Math.min(y, innerHeight - 280))}px`; menu.setAttribute('role', 'menu'); menu.innerHTML = `<input type="search" id="element-appearance-menu-search" placeholder="Search actions" aria-label="Search actions"><button type="button" role="menuitem" data-edit>Edit appearance…</button><button type="button" role="menuitem" data-lock>Lock this element…</button><p role="status" aria-live="polite">Actions for ${escapeHtml(target.label)}</p>`; document.body.append(menu); addRegex(menu.querySelector('input'), regex); const close = () => { menu.remove(); target.element.focus(); document.removeEventListener('mousedown', outside, true); }; const outside = (event) => { if (!menu.contains(event.target)) close(); }; document.addEventListener('mousedown', outside, true); menu.querySelector('[data-edit]').onclick = () => { menu.remove(); document.removeEventListener('mousedown', outside, true); editor(target, close, regex, (en, zh) => i18nCopy(en, zh)); }; menu.querySelector('[data-lock]').onclick = () => { const detail = { targetId: target.id, targetLabel: target.label, anchor: target.element }; document.dispatchEvent(new CustomEvent('md-element-toy-lock-request', { detail })); document.dispatchEvent(new CustomEvent('open-design:element-toy-lock-request', { detail })); close(); }; menu.onkeydown = (event) => { if (event.key === 'Escape') { event.preventDefault(); const input = menu.querySelector('input'); if (input.value) { input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); return; } close(); } if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); const items = [...menu.querySelectorAll('[role="menuitem"]')]; const index = items.indexOf(document.activeElement); items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus(); } }; menu.querySelector('input').focus(); };
  const i18nCopy = (english, cantonese) => { const state = i18n?.getState?.() || {}; const mode = state.mode || document.documentElement.dataset.langMode || 'en'; if (mode === 'bilingual') return `${english} · ${cantonese}`; const primary = mode === 'yue' ? cantonese : english; const level = mode === 'yue' ? state.funny?.yue : state.funny?.en; return level >= 5 ? (mode === 'yue' ? `${primary}，玩足` : `${primary}, full toolbox`) : primary; };
  document.addEventListener('contextmenu', (event) => { const target = targetFor(event.target); if (!target) return; event.preventDefault(); open(target, event.clientX, event.clientY, event.shiftKey); }, true);
  document.addEventListener('keydown', (event) => { if (!(event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey))) return; const target = targetFor(document.activeElement); if (!target) return; event.preventDefault(); const rect = target.element.getBoundingClientRect(); open(target, rect.left, rect.bottom); }, true);
  let timer = null; document.addEventListener('pointerdown', (event) => { if (event.pointerType !== 'touch') return; const target = targetFor(event.target); if (!target) return; timer = setTimeout(() => open(target, target.element.getBoundingClientRect().left, target.element.getBoundingClientRect().bottom), 550); }, true); ['pointerup', 'pointercancel', 'pointermove'].forEach((name) => document.addEventListener(name, () => { if (timer) clearTimeout(timer); timer = null; }, true));
  const observer = new MutationObserver(scan); observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['id', 'data-appearance-id', 'aria-label', 'title'] }); scan(); return { scan, registry };
}

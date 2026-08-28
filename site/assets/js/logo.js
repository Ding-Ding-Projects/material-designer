/*
 * Local app-logo customization for the documentation surface.
 *
 * This module intentionally has no imports and no network path. It validates
 * image signatures and dimensions before creating an ImageBitmap, converts
 * accepted input to one bounded PNG, and stores only the validated private
 * data URL plus presentation choices in this browser's storage.
 */

export const STORAGE_KEY = 'md-designer:app-logo:v1';
export const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
export const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
export const MAX_DIMENSION = 4096;
export const MAX_PIXELS = 16 * 1024 * 1024;
export const MAX_DECODE_TIME_MS = 2000;

const PRESET_MARK = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="7" fill="#8f4c34"/><path fill="#ffdbcf" d="M4 20V4h3.6l4.4 8.2L16.4 4H20v16h-3.4v-9.4L12 19l-4.6-8.4V20H4Z"/></svg>');
const WARM_MARK = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="7" fill="#00696d"/><path fill="#b2ebeb" d="M4 20V4h3.6l4.4 8.2L16.4 4H20v16h-3.4v-9.4L12 19l-4.6-8.4V20H4Z"/></svg>');
const MONO_MARK = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="7" fill="#252525"/><path fill="#fff" d="M4 20V4h3.6l4.4 8.2L16.4 4H20v16h-3.4v-9.4L12 19l-4.6-8.4V20H4Z"/></svg>');
const OUTLINE_MARK = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="1" y="1" width="22" height="22" rx="7" fill="none" stroke="#8f4c34" stroke-width="2"/><path fill="none" stroke="#8f4c34" stroke-width="2" d="M4 20V4h3.6l4.4 8.2L16.4 4H20v16"/></svg>');

export const PRESETS = Object.freeze([
  { id: 'material', label: 'Material mark', src: PRESET_MARK },
  { id: 'warm', label: 'Warm mark', src: WARM_MARK },
  { id: 'monochrome', label: 'Monochrome mark', src: MONO_MARK },
  { id: 'outline', label: 'Outline mark', src: OUTLINE_MARK },
]);

export const DISPLAY_TARGETS = Object.freeze([
  { id: 'favicon', label: 'Favicon', width: 16, height: 16 },
  { id: 'toolbar', label: 'Toolbar', width: 32, height: 32 },
  { id: 'titlebar', label: 'Title bar', width: 48, height: 48 },
  { id: 'sidebar', label: 'Sidebar', width: 128, height: 128 },
  { id: 'installer', label: 'Installer', width: 256, height: 256 },
]);

export const DEFAULTS = Object.freeze({
  schemaVersion: 1,
  presetId: 'material',
  custom: null,
  fit: 'contain',
  crop: { x: 0, y: 0, width: 1, height: 1 },
  focalPoint: { x: 0.5, y: 0.5 },
  background: 'transparent',
  safeArea: true,
});

const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function bounds(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) return { ok: false, code: 'malformed', detail: 'The image dimensions are invalid.' };
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) return { ok: false, code: 'too-large-dimension', detail: `The image exceeds the ${MAX_DIMENSION}px dimension limit.` };
  if (width * height > MAX_PIXELS) return { ok: false, code: 'too-many-pixels', detail: `The image exceeds the ${MAX_PIXELS}-pixel decoded limit.` };
  return null;
}

function pngInfo(bytes) {
  if (bytes.length < 33) return { ok: false, code: 'malformed', detail: 'The PNG header is incomplete.' };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  const limit = bounds(width, height);
  if (limit) return limit;
  const colorType = bytes[25];
  let offset = 8;
  let animated = false;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset, false);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const next = offset + length + 12;
    if (next < offset || next > bytes.length) return { ok: false, code: 'malformed', detail: 'A PNG chunk exceeds the input.' };
    if (type === 'acTL') animated = true;
    offset = next;
    if (type === 'IEND') break;
  }
  if (animated) return { ok: false, code: 'animated', detail: 'Animated PNG input is not accepted.' };
  return { ok: true, mimeType: 'image/png', width, height, hasAlpha: colorType === 4 || colorType === 6, frameCount: 1 };
}

function jpegInfo(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return { ok: false, code: 'malformed', detail: 'The JPEG signature is incomplete.' };
  let offset = 2;
  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    const marker = bytes[offset + 1]; offset += 2;
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01) continue;
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) break;
    const frame = (marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf);
    if (frame && length >= 7) {
      const height = (bytes[offset + 3] << 8) | bytes[offset + 4];
      const width = (bytes[offset + 5] << 8) | bytes[offset + 6];
      const limit = bounds(width, height);
      if (limit) return limit;
      return { ok: true, mimeType: 'image/jpeg', width, height, hasAlpha: false, frameCount: 1 };
    }
    offset += length;
  }
  return { ok: false, code: 'malformed', detail: 'The JPEG frame header could not be read.' };
}

function webpInfo(bytes) {
  if (bytes.length < 16) return { ok: false, code: 'malformed', detail: 'The WebP header is incomplete.' };
  const chunk = String.fromCharCode(...bytes.subarray(12, 16));
  if (chunk !== 'VP8X' || bytes.length < 30) return { ok: false, code: 'unsupported-format', detail: 'Only static VP8X WebP is accepted.' };
  const flags = bytes[20];
  if ((flags & 0x02) !== 0) return { ok: false, code: 'animated', detail: 'Animated WebP input is not accepted.' };
  const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
  const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
  const limit = bounds(width, height);
  if (limit) return limit;
  return { ok: true, mimeType: 'image/webp', width, height, hasAlpha: (flags & 0x10) !== 0, frameCount: 1 };
}

export function validateBytes(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (!bytes.length) return { ok: false, code: 'empty', detail: 'The selected file is empty.' };
  if (bytes.length > MAX_SOURCE_BYTES) return { ok: false, code: 'too-large', detail: `The selected file exceeds ${MAX_SOURCE_BYTES} bytes.` };
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return pngInfo(bytes);
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return webpInfo(bytes);
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) return jpegInfo(bytes);
  return { ok: false, code: 'unsupported-format', detail: 'Accepted custom formats are static PNG, JPEG, and WebP.' };
}

function safeCrop(crop) {
  const x = clamp(Number.isFinite(Number(crop?.x)) ? Number(crop.x) : 0, 0, 0.99);
  const y = clamp(Number.isFinite(Number(crop?.y)) ? Number(crop.y) : 0, 0, 0.99);
  return { x, y, width: clamp(Number(crop?.width) || 1, 0.01, 1 - x), height: clamp(Number(crop?.height) || 1, 0.01, 1 - y) };
}

export function normalizeState(value) {
  const raw = value && typeof value === 'object' ? value : {};
  const presetId = PRESETS.some((preset) => preset.id === raw.presetId) ? raw.presetId : DEFAULTS.presetId;
  let custom = null;
  if (raw.custom && typeof raw.custom === 'object' && raw.custom.mimeType === 'image/png' && typeof raw.custom.dataUrl === 'string' && raw.custom.dataUrl.startsWith('data:image/png;base64,') && raw.custom.dataUrl.length <= MAX_OUTPUT_BYTES * 2) {
    try {
      const encoded = raw.custom.dataUrl.slice(raw.custom.dataUrl.indexOf(',') + 1);
      const bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
      const validation = validateBytes(bytes);
      if (validation.ok && validation.mimeType === 'image/png' && validation.width === Number(raw.custom.width) && validation.height === Number(raw.custom.height) && bytes.length <= MAX_OUTPUT_BYTES) custom = { ...raw.custom, byteLength: bytes.length, width: validation.width, height: validation.height, hasAlpha: validation.hasAlpha, frameCount: 1 };
    } catch { custom = null; }
  }
  return {
    ...DEFAULTS,
    presetId,
    custom,
    fit: raw.fit === 'cover' || raw.fit === 'fill' ? raw.fit : DEFAULTS.fit,
    crop: safeCrop(raw.crop),
    focalPoint: { x: clamp(Number(raw.focalPoint?.x) || 0.5, 0, 1), y: clamp(Number(raw.focalPoint?.y) || 0.5, 0, 1) },
    background: raw.background === 'transparent' || (typeof raw.background === 'string' && /^#[0-9a-f]{6}$/iu.test(raw.background)) ? raw.background : DEFAULTS.background,
    safeArea: raw.safeArea !== false,
  };
}

export function read() {
  try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? normalizeState(JSON.parse(raw)) : normalizeState(DEFAULTS); } catch { return normalizeState(DEFAULTS); }
}

function write(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeState(state))); } catch { /* storage-disabled browsers stay session-local */ }
}

export function apply(state) {
  const next = normalizeState(state);
  const root = document.documentElement;
  const source = next.custom?.dataUrl || PRESETS.find((preset) => preset.id === next.presetId)?.src || PRESET_MARK;
  root.dataset.logoPreset = next.custom ? 'custom' : next.presetId;
  root.style.setProperty('--app-logo-image', `url(${JSON.stringify(source)})`);
  root.style.setProperty('--app-logo-background', next.background);
  const image = document.querySelector('[data-app-logo-image]');
  if (image) image.setAttribute('src', source);
  document.querySelectorAll('[data-app-logo-preview]').forEach((node) => {
    node.setAttribute('src', source);
    node.style.objectFit = next.fit;
    node.style.objectPosition = `${next.focalPoint.x * 100}% ${next.focalPoint.y * 100}%`;
  });
  write(next);
  document.dispatchEvent(new CustomEvent('md-logo-change', { detail: { state: next } }));
}

export async function convert(file, crop = DEFAULTS.crop, outputSize = 512) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const info = validateBytes(bytes);
  if (!info.ok) throw new Error(info.detail);
  if (typeof createImageBitmap !== 'function') throw new Error('Local image decoding is unavailable in this browser.');
  const bitmapPromise = createImageBitmap(file);
  let decodeTimer;
  const bitmap = await Promise.race([bitmapPromise, new Promise((resolve, reject) => { decodeTimer = window.setTimeout(() => reject(new Error('Local image decoding exceeded the bounded time limit.')), MAX_DECODE_TIME_MS); })]).catch((error) => { void bitmapPromise.then((lateBitmap) => lateBitmap.close(), () => undefined); throw error; });
  if (decodeTimer !== undefined) window.clearTimeout(decodeTimer);
  try {
    if (bitmap.width !== info.width || bitmap.height !== info.height) throw new Error('The decoded dimensions do not match the validated image header.');
    const canvas = document.createElement('canvas');
    canvas.width = clamp(Math.round(outputSize), 1, MAX_DIMENSION);
    canvas.height = canvas.width;
    const context = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
    if (!context) throw new Error('The local pixel surface could not be created.');
    const x = Math.round(bitmap.width * crop.x);
    const y = Math.round(bitmap.height * crop.y);
    const width = Math.max(1, Math.round(bitmap.width * crop.width));
    const height = Math.max(1, Math.round(bitmap.height * crop.height));
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, x, y, width, height, 0, 0, canvas.width, canvas.height);
    const dataUrl = await new Promise((resolve, reject) => canvas.toBlob((blob) => {
      if (!blob || blob.size > MAX_OUTPUT_BYTES) { reject(new Error(`Converted output exceeds ${MAX_OUTPUT_BYTES} bytes.`)); return; }
      const reader = new FileReader(); reader.onerror = () => reject(new Error('The converted image could not be read back.')); reader.onload = () => resolve(String(reader.result)); reader.readAsDataURL(blob);
    }, 'image/png'));
    const encoded = dataUrl.slice(dataUrl.indexOf(',') + 1);
    const outBytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
    const output = validateBytes(outBytes);
    if (!output.ok || output.mimeType !== 'image/png') throw new Error('The converted image failed its signature roundtrip.');
    return { dataUrl, mimeType: 'image/png', byteLength: outBytes.length, width: output.width, height: output.height, hasAlpha: true, frameCount: 1 };
  } finally { bitmap.close(); }
}

function hexToRgb(hex) {
  const value = /^#[0-9a-f]{6}$/iu.test(hex) ? hex.slice(1) : 'fff8f6';
  return { r: parseInt(value.slice(0, 2), 16), g: parseInt(value.slice(2, 4), 16), b: parseInt(value.slice(4, 6), 16) };
}

function rgbToHsv({ r, g, b }) {
  const rn = r / 255; const gn = g / 255; const bn = b / 255;
  const max = Math.max(rn, gn, bn); const min = Math.min(rn, gn, bn); const delta = max - min;
  let h = 0;
  if (delta) {
    if (max === rn) h = 60 * (((gn - bn) / delta) % 6);
    else if (max === gn) h = 60 * ((bn - rn) / delta + 2);
    else h = 60 * ((rn - gn) / delta + 4);
  }
  if (h < 0) h += 360;
  return { h, s: max ? (delta / max) * 100 : 0, v: max * 100 };
}

function hsvToHex({ h, s, v }) {
  const saturation = clamp(s, 0, 100) / 100; const value = clamp(v, 0, 100) / 100;
  const c = value * saturation; const x = c * (1 - Math.abs(((h / 60) % 2) - 1)); const m = value - c;
  const rgb = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return '#' + rgb.map((channel) => Math.round((channel + m) * 255).toString(16).padStart(2, '0')).join('');
}

function mount(host, { label = 'Logo' } = {}) {
  const state = read();
  let current = state;
  let searchMatcher = null;
  const search = host.querySelector('[data-logo-search]');
  const status = host.querySelector('[data-logo-status]');
  const source = () => current.custom?.dataUrl || PRESETS.find((preset) => preset.id === current.presetId)?.src || PRESET_MARK;
  const setStatus = (message) => { if (status) status.textContent = message; };
  const render = () => {
    host.querySelectorAll('[data-logo-preset]').forEach((button) => {
      const active = !current.custom && button.dataset.logoPreset === current.presetId;
      button.setAttribute('aria-pressed', String(active));
      const text = `${button.dataset.logoPreset} ${button.textContent || ''}`;
      button.hidden = Boolean(searchMatcher ? !searchMatcher(text) : search?.value && !text.toLowerCase().includes(search.value.toLowerCase()));
    });
    host.querySelectorAll('[data-logo-live], [data-app-logo-preview]').forEach((node) => node.setAttribute('src', source()));
    const fit = host.querySelector('[data-logo-fit]'); if (fit) fit.value = current.fit;
    const transparent = host.querySelector('[data-logo-transparent]'); if (transparent) transparent.checked = current.background === 'transparent';
    const bg = host.querySelector('[data-logo-background]'); if (bg && current.background !== 'transparent') bg.value = current.background;
    const picker = host.querySelector('[data-logo-color-picker]');
    const hsv = rgbToHsv(hexToRgb(current.background === 'transparent' ? '#fff8f6' : current.background));
    if (picker) {
      const field = picker.querySelector('[data-logo-color-field]');
      if (field) { field.style.background = `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv.h} 100% 50%))`; field.setAttribute('aria-valuenow', String(Math.round(hsv.s))); field.setAttribute('aria-valuetext', `Saturation ${Math.round(hsv.s)}%, brightness ${Math.round(hsv.v)}%`); }
      const hue = picker.querySelector('[data-logo-bg-hue]'); if (hue) hue.value = String(Math.round(hsv.h));
      const saturation = picker.querySelector('[data-logo-bg-saturation]'); if (saturation) saturation.value = String(Math.round(hsv.s));
      const brightness = picker.querySelector('[data-logo-bg-brightness]'); if (brightness) brightness.value = String(Math.round(hsv.v));
      const hex = picker.querySelector('[data-logo-bg-hex]'); if (hex) hex.value = current.background === 'transparent' ? '#fff8f6' : current.background;
    }
    const focalX = host.querySelector('[data-logo-focal-x]'); if (focalX) focalX.value = String(current.focalPoint.x);
    const focalY = host.querySelector('[data-logo-focal-y]'); if (focalY) focalY.value = String(current.focalPoint.y);
    const focalXValue = host.querySelector('[data-logo-focal-x-value]'); if (focalXValue) focalXValue.textContent = `${Math.round(current.focalPoint.x * 100)}%`;
    const focalYValue = host.querySelector('[data-logo-focal-y-value]'); if (focalYValue) focalYValue.textContent = `${Math.round(current.focalPoint.y * 100)}%`;
    const safeArea = host.querySelector('[data-logo-safe-area]'); if (safeArea) safeArea.checked = current.safeArea;
    host.querySelectorAll('[data-logo-crop]').forEach((field) => { const name = field.dataset.logoCrop; if (name && current.crop[name] != null) field.value = String(current.crop[name]); });
    const stage = host.querySelector('[data-logo-stage]');
    const live = host.querySelector('[data-logo-live]');
    if (live) {
      live.style.objectFit = current.fit;
      live.style.objectPosition = `${current.focalPoint.x * 100}% ${current.focalPoint.y * 100}%`;
      live.style.clipPath = `inset(${current.crop.y * 100}% ${(1 - current.crop.x - current.crop.width) * 100}% ${(1 - current.crop.y - current.crop.height) * 100}% ${current.crop.x * 100}%)`;
    }
    if (stage) {
      stage.dataset.safeArea = current.safeArea ? 'on' : 'off';
      stage.style.backgroundColor = current.background === 'transparent' ? '' : current.background;
    }
    host.querySelectorAll('[data-logo-target]').forEach((node) => node.setAttribute('src', source()));
    apply(current);
  };
  host.querySelectorAll('[data-logo-preset]').forEach((button) => button.addEventListener('click', () => { current = normalizeState({ ...current, presetId: button.dataset.logoPreset, custom: null }); setStatus('Preset applied locally.'); render(); }));
  search?.addEventListener('input', render);
  host.querySelector('[data-logo-fit]')?.addEventListener('change', (event) => { current = normalizeState({ ...current, fit: event.target.value }); render(); });
  host.querySelector('[data-logo-transparent]')?.addEventListener('change', (event) => { current = normalizeState({ ...current, background: event.target.checked ? 'transparent' : '#fff8f6' }); render(); });
  host.querySelector('[data-logo-background]')?.addEventListener('change', (event) => { current = normalizeState({ ...current, background: event.target.value }); render(); });
  const colorPicker = host.querySelector('[data-logo-color-picker]');
  const updateFromHsvControls = () => {
    if (!colorPicker) return;
    const h = Number(colorPicker.querySelector('[data-logo-bg-hue]')?.value || 0);
    const s = Number(colorPicker.querySelector('[data-logo-bg-saturation]')?.value || 0);
    const v = Number(colorPicker.querySelector('[data-logo-bg-brightness]')?.value || 0);
    current = normalizeState({ ...current, background: hsvToHex({ h, s, v }) }); render();
  };
  colorPicker?.querySelectorAll('[data-logo-bg-hue], [data-logo-bg-saturation], [data-logo-bg-brightness]').forEach((control) => control.addEventListener('input', updateFromHsvControls));
  colorPicker?.querySelector('[data-logo-bg-hex]')?.addEventListener('change', (event) => { if (/^#[0-9a-f]{6}$/iu.test(event.target.value)) { current = normalizeState({ ...current, background: event.target.value }); render(); } });
  colorPicker?.querySelector('[data-logo-color-field]')?.addEventListener('pointerdown', (event) => {
    const field = event.currentTarget; const rect = field.getBoundingClientRect(); if (!rect.width || !rect.height) return;
    const hsv = rgbToHsv(hexToRgb(current.background === 'transparent' ? '#fff8f6' : current.background));
    current = normalizeState({ ...current, background: hsvToHex({ h: hsv.h, s: clamp((event.clientX - rect.left) / rect.width, 0, 1) * 100, v: (1 - clamp((event.clientY - rect.top) / rect.height, 0, 1)) * 100 }) }); render();
  });
  colorPicker?.querySelector('[data-logo-color-field]')?.addEventListener('keydown', (event) => {
    const hsv = rgbToHsv(hexToRgb(current.background === 'transparent' ? '#fff8f6' : current.background));
    const step = event.shiftKey ? 10 : 1;
    if (event.key === 'ArrowLeft') hsv.s = clamp(hsv.s - step, 0, 100);
    else if (event.key === 'ArrowRight') hsv.s = clamp(hsv.s + step, 0, 100);
    else if (event.key === 'ArrowUp') hsv.v = clamp(hsv.v + step, 0, 100);
    else if (event.key === 'ArrowDown') hsv.v = clamp(hsv.v - step, 0, 100);
    else return;
    event.preventDefault(); current = normalizeState({ ...current, background: hsvToHex(hsv) }); render();
  });
  host.querySelector('[data-logo-focal-x]')?.addEventListener('input', (event) => { current = normalizeState({ ...current, focalPoint: { ...current.focalPoint, x: Number(event.target.value) } }); render(); });
  host.querySelector('[data-logo-focal-y]')?.addEventListener('input', (event) => { current = normalizeState({ ...current, focalPoint: { ...current.focalPoint, y: Number(event.target.value) } }); render(); });
  host.querySelector('[data-logo-safe-area]')?.addEventListener('change', (event) => { current = normalizeState({ ...current, safeArea: event.target.checked }); render(); });
  host.querySelectorAll('[data-logo-crop]').forEach((field) => field.addEventListener('change', (event) => { const name = event.currentTarget.dataset.logoCrop; if (!name) return; current = normalizeState({ ...current, crop: { ...current.crop, [name]: Number(event.currentTarget.value) } }); render(); }));
  host.querySelector('[data-logo-reset]')?.addEventListener('click', () => { current = normalizeState(DEFAULTS); setStatus('Logo selection reset to the shipped mark.'); render(); });
  host.querySelector('[data-logo-upload]')?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0]; if (!file) return;
    setStatus('Validating and converting locally…');
    try { const custom = await convert(file, current.crop); current = normalizeState({ ...current, custom, crop: DEFAULTS.crop }); setStatus(`Converted locally to a verified ${custom.width}×${custom.height} PNG.`); render(); }
    catch (error) { setStatus(error instanceof Error ? error.message : 'The image could not be converted locally.'); }
    event.target.value = '';
  });
  render();
  return {
    getState: () => ({ ...current }),
    setSearchMatcher: (matcher) => { searchMatcher = typeof matcher === 'function' ? matcher : null; render(); },
    reset: () => { current = normalizeState(DEFAULTS); render(); },
  };
}

export function init() {
  const host = document.querySelector('[data-logo-customization]');
  if (!host) return null;
  return mount(host);
}

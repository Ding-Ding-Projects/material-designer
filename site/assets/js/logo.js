/*
 * Local app-logo customization for the documentation surface.
 *
 * This module intentionally has no imports and no network path. It validates
 * image signatures and dimensions before creating an ImageBitmap, converts
 * accepted input to one bounded PNG, and stores only the validated private
 * data URL plus presentation choices in this browser's storage.
 */

export const STORAGE_KEY = 'md-designer:app-logo:v1';
export const HISTORY_KEY = 'md-designer:app-logo-history:v1';
export const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
export const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
export const MAX_AGGREGATE_BYTES = 8 * 1024 * 1024;
export const MAX_TRANSFER_BYTES = 16 * 1024 * 1024;
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
  rainbowSpeedLevel: 3,
  schedules: [],
});

function logoRenderFingerprint(options) {
  return JSON.stringify({ crop: safeCrop(options.crop), fit: options.fit, focalPoint: options.focalPoint, safeArea: options.safeArea, background: options.background });
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const CRC_TABLE = (() => { const table = new Uint32Array(256); for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; } return table; })();
const crc32 = (bytes, start, end) => { let value = 0xffffffff; for (let i = start; i < end; i += 1) value = CRC_TABLE[(value ^ (bytes[i] || 0)) & 0xff] ^ (value >>> 8); return (value ^ 0xffffffff) >>> 0; };

function bounds(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) return { ok: false, code: 'malformed', detail: 'The image dimensions are invalid.' };
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) return { ok: false, code: 'too-large-dimension', detail: `The image exceeds the ${MAX_DIMENSION}px dimension limit.` };
  if (width * height > MAX_PIXELS) return { ok: false, code: 'too-many-pixels', detail: `The image exceeds the ${MAX_PIXELS}-pixel decoded limit.` };
  return null;
}

function pngInfo(bytes) {
  if (bytes.length < 57) return { ok: false, code: 'malformed', detail: 'The PNG header or required chunks are incomplete.' };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0; let height = 0; let bitDepth = -1; let colorType = -1; let hasAlpha = false;
  let seenIHDR = false; let seenIDAT = false; let seenIEND = false; let seenPLTE = false; let animated = false; let offset = 8;
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) return { ok: false, code: 'malformed', detail: 'A PNG chunk header is truncated.' };
    const length = view.getUint32(offset, false); const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8)); const next = offset + length + 12;
    if (next < offset || next > bytes.length || !/^[A-Za-z]{4}$/.test(type)) return { ok: false, code: 'malformed', detail: 'A PNG chunk is invalid or exceeds the input.' };
    if (view.getUint32(next - 4, false) !== crc32(bytes, offset + 4, offset + 8 + length)) return { ok: false, code: 'malformed', detail: `PNG chunk ${type} has an invalid CRC.` };
    const dataStart = offset + 8;
    if (!seenIHDR && type !== 'IHDR') return { ok: false, code: 'malformed', detail: 'PNG IHDR must be first.' };
    if (type === 'IHDR') {
      if (seenIHDR || length !== 13) return { ok: false, code: 'malformed', detail: 'PNG requires one 13-byte IHDR.' };
      seenIHDR = true; width = view.getUint32(dataStart, false); height = view.getUint32(dataStart + 4, false); bitDepth = bytes[dataStart + 8]; colorType = bytes[dataStart + 9];
      const validDepths = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
      if (!validDepths[colorType] || !validDepths[colorType].includes(bitDepth) || bytes[dataStart + 10] !== 0 || bytes[dataStart + 11] !== 0 || (bytes[dataStart + 12] !== 0 && bytes[dataStart + 12] !== 1)) return { ok: false, code: 'malformed', detail: 'PNG bit depth, colour type, or method is invalid.' };
      const limit = bounds(width, height); if (limit) return limit; hasAlpha = colorType === 4 || colorType === 6;
    } else if (type === 'PLTE') {
      if (seenIDAT || seenPLTE || !length || length % 3 || length > 768) return { ok: false, code: 'malformed', detail: 'PNG PLTE is late or malformed.' }; seenPLTE = true;
    } else if (type === 'tRNS') {
      const validTransparencyLength = colorType === 3 ? seenPLTE && length <= 256 : colorType === 0 ? length <= 2 : colorType === 2 ? length <= 6 : false;
      if (seenIDAT || !validTransparencyLength || colorType === 4 || colorType === 6) return { ok: false, code: 'malformed', detail: 'PNG tRNS is late, oversized, or invalid with this colour type.' }; hasAlpha = true;
    } else if (type === 'IDAT') {
      if (colorType === 3 && !seenPLTE) return { ok: false, code: 'malformed', detail: 'PNG palette data must precede IDAT.' }; seenIDAT = true;
    } else if (type === 'acTL' || type === 'fcTL' || type === 'fdAT') animated = true;
    else if (type === 'IEND') {
      if (length || !seenIDAT || (colorType === 3 && !seenPLTE)) return { ok: false, code: 'malformed', detail: 'PNG IEND arrived before required image data.' }; seenIEND = true;
    } else if (type.charCodeAt(0) >= 65 && type.charCodeAt(0) <= 90) return { ok: false, code: 'unsupported-format', detail: `Unsupported critical PNG chunk ${type}.` };
    offset = next; if (seenIEND) break;
  }
  if (!seenIHDR || !seenIDAT || !seenIEND || offset !== bytes.length) return { ok: false, code: 'malformed', detail: 'PNG must end with one validated IEND chunk.' };
  if (animated) return { ok: false, code: 'animated', detail: 'Animated PNG input is not accepted.' };
  return { ok: true, mimeType: 'image/png', width, height, hasAlpha, frameCount: 1 };
}

function jpegInfo(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) return { ok: false, code: 'malformed', detail: 'The JPEG signature or EOI is incomplete.' };
  let offset = 2; let width = 0; let height = 0; let sawFrame = false; let sawSos = false;
  while (offset + 1 < bytes.length) {
    if (bytes[offset] !== 0xff) return { ok: false, code: 'malformed', detail: 'JPEG marker alignment is invalid.' };
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === 0xd9) break;
    if (marker === 0xda) {
      if (offset + 2 > bytes.length) return { ok: false, code: 'malformed', detail: 'JPEG scan header is truncated.' };
      const length = (bytes[offset] << 8) | bytes[offset + 1]; if (length < 2 || offset + length > bytes.length) return { ok: false, code: 'malformed', detail: 'JPEG scan length is invalid.' }; sawSos = true; offset += length;
      while (offset + 1 < bytes.length) { if (bytes[offset] !== 0xff) { offset += 1; continue; } let markerOffset = offset; while (markerOffset < bytes.length && bytes[markerOffset] === 0xff) markerOffset += 1; if (bytes[markerOffset] === 0x00) { offset = markerOffset + 1; continue; } if (bytes[markerOffset] !== 0xd9) return { ok: false, code: 'malformed', detail: 'JPEG entropy marker is invalid.' }; offset = markerOffset + 1; break; }
      break;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) return { ok: false, code: 'malformed', detail: 'JPEG segment length is truncated.' };
    const length = (bytes[offset] << 8) | bytes[offset + 1]; if (length < 2 || offset + length > bytes.length) return { ok: false, code: 'malformed', detail: 'JPEG segment length is invalid.' };
    const frame = (marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf);
    if (frame) { if (sawFrame || length < 7 || bytes[offset + 2] !== 8) return { ok: false, code: 'malformed', detail: 'JPEG frame precision or ordering is unsupported.' }; height = (bytes[offset + 3] << 8) | bytes[offset + 4]; width = (bytes[offset + 5] << 8) | bytes[offset + 6]; const limit = bounds(width, height); if (limit) return limit; sawFrame = true; }
    offset += length;
  }
  if (!sawFrame || !sawSos || offset !== bytes.length) return { ok: false, code: 'malformed', detail: 'JPEG requires one frame, one scan, and a final EOI.' };
  return { ok: true, mimeType: 'image/jpeg', width, height, hasAlpha: false, frameCount: 1 };
}

function webpInfo(bytes) {
  if (bytes.length < 20) return { ok: false, code: 'malformed', detail: 'The WebP RIFF header is incomplete.' };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(4, true) !== bytes.length - 8 || String.fromCharCode(...bytes.subarray(8, 12)) !== 'WEBP') return { ok: false, code: 'malformed', detail: 'WebP RIFF size or signature is invalid.' };
  let offset = 12; let width = 0; let height = 0; let imageWidth = 0; let imageHeight = 0; let alpha = false; let image = false; let extended = false; let animated = false;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) return { ok: false, code: 'malformed', detail: 'WebP chunk header is truncated.' };
    const type = String.fromCharCode(...bytes.subarray(offset, offset + 4)); const length = view.getUint32(offset + 4, true); const data = offset + 8; const end = data + length + (length % 2);
    if (end < data || end > bytes.length) return { ok: false, code: 'malformed', detail: `WebP chunk ${type} exceeds the RIFF payload.` };
    if (type === 'VP8X') { if (extended || length !== 10) return { ok: false, code: 'malformed', detail: 'WebP VP8X is duplicated or malformed.' }; extended = true; const flags = bytes[data]; if (flags & 0x01) return { ok: false, code: 'malformed', detail: 'WebP VP8X reserved flag is set.' }; animated ||= Boolean(flags & 0x02); alpha ||= Boolean(flags & 0x10); width = 1 + bytes[data + 4] + (bytes[data + 5] << 8) + (bytes[data + 6] << 16); height = 1 + bytes[data + 7] + (bytes[data + 8] << 8) + (bytes[data + 9] << 16); }
    else if (type === 'VP8 ') { if (image || length < 10 || bytes[data + 3] !== 0x9d || bytes[data + 4] !== 0x01 || bytes[data + 5] !== 0x2a) return { ok: false, code: 'malformed', detail: 'WebP VP8 image header is invalid or duplicated.' }; imageWidth = view.getUint16(data + 6, true) & 0x3fff; imageHeight = view.getUint16(data + 8, true) & 0x3fff; width = imageWidth; height = imageHeight; image = true; }
    else if (type === 'VP8L') { if (image || length < 5 || bytes[data] !== 0x2f) return { ok: false, code: 'malformed', detail: 'WebP VP8L image header is invalid or duplicated.' }; const bits = bytes[data + 1] | (bytes[data + 2] << 8) | (bytes[data + 3] << 16) | (bytes[data + 4] << 24); imageWidth = 1 + (bits & 0x3fff); imageHeight = 1 + ((bits >>> 14) & 0x3fff); width = imageWidth; height = imageHeight; alpha = true; image = true; }
    else if (type === 'ANIM' || type === 'ANMF') animated = true;
    offset = end;
  }
  if (animated) return { ok: false, code: 'animated', detail: 'Animated WebP input is not accepted.' };
  if (!image || (extended && (!width || !height || width !== imageWidth || height !== imageHeight))) return { ok: false, code: 'malformed', detail: 'WebP must contain one valid image chunk matching its VP8X canvas.' };
  const limit = bounds(width, height); if (limit) return limit;
  return { ok: true, mimeType: 'image/webp', width, height, hasAlpha: alpha, frameCount: 1 };
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

function validSourceDataUrl(value) {
  if (typeof value !== 'string' || value.length > MAX_SOURCE_BYTES * 2 || !/^data:image\/(?:png|jpeg|webp);base64,/iu.test(value)) return false;
  try {
    const comma = value.indexOf(',');
    const bytes = Uint8Array.from(atob(value.slice(comma + 1)), (char) => char.charCodeAt(0));
    const validation = validateBytes(bytes);
    return validation.ok && value.slice('data:'.length, value.indexOf(';')).toLowerCase() === validation.mimeType;
  } catch { return false; }
}

export function normalizeState(value) {
  const raw = value && typeof value === 'object' ? value : {};
  if (raw.schemaVersion !== undefined && raw.schemaVersion !== 1) return { ...DEFAULTS };
  const presetId = PRESETS.some((preset) => preset.id === raw.presetId) ? raw.presetId : DEFAULTS.presetId;
  let custom = null;
  if (raw.custom && typeof raw.custom === 'object' && raw.custom.mimeType === 'image/png' && typeof raw.custom.dataUrl === 'string' && raw.custom.dataUrl.startsWith('data:image/png;base64,') && raw.custom.dataUrl.length <= MAX_OUTPUT_BYTES * 2 && raw.custom.variants !== undefined) {
    try {
      const encoded = raw.custom.dataUrl.slice(raw.custom.dataUrl.indexOf(',') + 1);
      const bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
      const validation = validateBytes(bytes);
      if (validation.ok && validation.mimeType === 'image/png' && validation.width === Number(raw.custom.width) && validation.height === Number(raw.custom.height) && bytes.length <= MAX_OUTPUT_BYTES) {
        if (raw.custom.sourceDataUrl !== undefined && !validSourceDataUrl(raw.custom.sourceDataUrl)) throw new Error('invalid source cache');
        let variants;
        if (raw.custom.variants !== undefined) {
          if (!raw.custom.variants || typeof raw.custom.variants !== 'object') throw new Error('invalid variants');
          variants = {};
          for (const target of DISPLAY_TARGETS) {
            const candidate = raw.custom.variants[target.id];
            if (!candidate || typeof candidate.dataUrl !== 'string' || !candidate.dataUrl.startsWith('data:image/png;base64,')) throw new Error('missing variant');
            const candidateBytes = Uint8Array.from(atob(candidate.dataUrl.slice(candidate.dataUrl.indexOf(',') + 1)), (char) => char.charCodeAt(0));
            const candidateValidation = validateBytes(candidateBytes);
            if (!candidateValidation.ok || candidateValidation.mimeType !== 'image/png' || candidateValidation.width !== target.width || candidateValidation.height !== target.height || candidateBytes.length > MAX_OUTPUT_BYTES) throw new Error('invalid variant');
            variants[target.id] = { ...candidate, byteLength: candidateBytes.length, width: target.width, height: target.height, hasAlpha: candidateValidation.hasAlpha, frameCount: 1 };
          }
          const aggregateBytes = bytes.length + Object.values(variants).reduce((total, asset) => total + (asset?.byteLength || 0), 0);
          if (aggregateBytes > MAX_AGGREGATE_BYTES) throw new Error('aggregate variants exceed bound');
        }
        custom = { ...raw.custom, byteLength: bytes.length, width: validation.width, height: validation.height, hasAlpha: validation.hasAlpha, frameCount: 1, variants };
      }
    } catch { custom = null; }
  }
  const schedules = Array.isArray(raw.schedules) ? raw.schedules.slice(0, 12).filter((rule) => rule && typeof rule === 'object' && typeof rule.id === 'string' && typeof rule.startAt === 'string' && typeof rule.endAt === 'string').map((rule) => ({ id: rule.id.slice(0, 80), label: typeof rule.label === 'string' && rule.label.trim() ? rule.label.trim().slice(0, 120) : rule.id.slice(0, 80), enabled: rule.enabled !== false, startAt: rule.startAt.slice(0, 32), endAt: rule.endAt.slice(0, 32), weekdays: Array.isArray(rule.weekdays) && rule.weekdays.length ? Array.from(new Set(rule.weekdays.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))) : [0, 1, 2, 3, 4, 5, 6], timezone: typeof rule.timezone === 'string' && rule.timezone ? rule.timezone.slice(0, 80) : 'local', patch: { ...(PRESETS.some((preset) => preset.id === rule.patch?.presetId) ? { presetId: rule.patch.presetId } : {}), ...(rule.patch?.fit === 'contain' || rule.patch?.fit === 'cover' || rule.patch?.fit === 'fill' ? { fit: rule.patch.fit } : {}), ...(rule.patch?.background === 'transparent' || rule.patch?.background === 'rainbow' || (typeof rule.patch?.background === 'string' && /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/iu.test(rule.patch.background)) ? { background: rule.patch.background } : {}), ...(typeof rule.patch?.safeArea === 'boolean' ? { safeArea: rule.patch.safeArea } : {}), ...(typeof rule.patch?.rainbowSpeedLevel === 'number' ? { rainbowSpeedLevel: clamp(Math.round(rule.patch.rainbowSpeedLevel), 1, 5) } : {}), ...(rule.patch?.crop && typeof rule.patch.crop === 'object' ? { crop: safeCrop(rule.patch.crop) } : {}), ...(rule.patch?.focalPoint && typeof rule.patch.focalPoint === 'object' ? { focalPoint: { x: clamp(Number(rule.patch.focalPoint.x), 0, 1), y: clamp(Number(rule.patch.focalPoint.y), 0, 1) } } : {}) } })) : [];
  return {
    ...DEFAULTS,
    presetId,
    custom,
    fit: raw.fit === 'cover' || raw.fit === 'fill' ? raw.fit : DEFAULTS.fit,
    crop: safeCrop(raw.crop),
    focalPoint: { x: clamp(typeof raw.focalPoint?.x === 'number' && Number.isFinite(raw.focalPoint.x) ? raw.focalPoint.x : 0.5, 0, 1), y: clamp(typeof raw.focalPoint?.y === 'number' && Number.isFinite(raw.focalPoint.y) ? raw.focalPoint.y : 0.5, 0, 1) },
    background: raw.background === 'transparent' || raw.background === 'rainbow' || (typeof raw.background === 'string' && /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/iu.test(raw.background)) ? raw.background : DEFAULTS.background,
    safeArea: raw.safeArea !== false,
    rainbowSpeedLevel: typeof raw.rainbowSpeedLevel === 'number' && Number.isFinite(raw.rainbowSpeedLevel) ? clamp(Math.round(raw.rainbowSpeedLevel), 1, 5) : DEFAULTS.rainbowSpeedLevel,
    schedules,
  };
}

export function resolveScheduledState(state, now = new Date()) {
  const current = now.getTime(); let resolved = normalizeState(state);
  for (const rule of resolved.schedules) {
    if (!validateLogoSchedule(rule).ok) continue;
    const start = scheduleWallKey(rule.startAt, rule.timezone); const end = scheduleWallKey(rule.endAt, rule.timezone); const currentKey = scheduleNowWallKey(current, rule.timezone);
    if (!rule.enabled || !start || !end || !currentKey || start >= end || currentKey < start || currentKey >= end) continue;
    const weekday = scheduleWeekday(current, rule.timezone);
    const sameDay = currentKey.slice(0, 10) === start.slice(0, 10);
    if (!rule.weekdays.includes(weekday) && (sameDay || currentKey.slice(11) >= end.slice(11) || !rule.weekdays.includes((weekday + 6) % 7))) continue;
    resolved = normalizeState({ ...resolved, ...rule.patch, ...(rule.patch.presetId ? { custom: null } : {}), schedules: state.schedules });
  }
  return resolved;
}

function scheduleParts(timestamp, timezone) {
  try { return Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: normalizedScheduleTimezone(timezone), year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' }).formatToParts(new Date(timestamp)).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value])); } catch { return null; }
}

function normalizedScheduleTimezone(timezone) { const value = String(timezone || '').trim(); return value && value !== 'local' ? value : undefined; }
export function isValidLogoTimezone(timezone) {
  if (!String(timezone || '').trim() || String(timezone).trim() === 'local') return true;
  try { new Intl.DateTimeFormat('en-CA', { timeZone: String(timezone).trim() }).format(new Date(0)); return true; } catch { return false; }
}
const wallTimeStatusCache = new Map();
export function classifyLogoWallTime(value, timezone) {
  const key = `${String(timezone || '').trim()}\u0000${value}`;
  if (wallTimeStatusCache.has(key)) return wallTimeStatusCache.get(key);
  if (!isValidLogoTimezone(timezone) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u.test(value)) return 'invalid';
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/u.exec(value);
  const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3]); const hour = Number(match[4]); const minute = Number(match[5]);
  const baseDate = new Date(Date.UTC(year, month - 1, day, hour, minute));
  if (year < 1 || year > 9999 || month < 1 || month > 12 || hour > 23 || minute > 59 || baseDate.getUTCFullYear() !== year || baseDate.getUTCMonth() !== month - 1 || baseDate.getUTCDate() !== day) return 'invalid';
  let matches = 0;
  for (let delta = -36 * 60; delta <= 36 * 60; delta += 1) if (scheduleNowWallKey(baseDate.getTime() + delta * 60_000, timezone) === value) matches += 1;
  const status = matches === 0 ? 'skipped' : matches > 1 ? 'ambiguous' : 'valid';
  wallTimeStatusCache.set(key, status); if (wallTimeStatusCache.size > 256) wallTimeStatusCache.delete(wallTimeStatusCache.keys().next().value);
  return status;
}
export function validateLogoSchedule(rule) {
  const timezone = String(rule.timezone || '').trim() || 'local';
  if (!isValidLogoTimezone(timezone)) return { ok: false, code: 'invalid-timezone' };
  const start = scheduleWallKey(rule.startAt, timezone); const end = scheduleWallKey(rule.endAt, timezone);
  if (!start) return { ok: false, code: classifyLogoWallTime(rule.startAt, timezone) === 'skipped' ? 'skipped-start' : 'invalid-start' };
  if (!end) return { ok: false, code: classifyLogoWallTime(rule.endAt, timezone) === 'skipped' ? 'skipped-end' : 'invalid-end' };
  if (start >= end) return { ok: false, code: 'invalid-window' };
  const startStatus = classifyLogoWallTime(start, timezone); const endStatus = classifyLogoWallTime(end, timezone);
  if (startStatus === 'skipped') return { ok: false, code: 'skipped-start' };
  if (endStatus === 'skipped') return { ok: false, code: 'skipped-end' };
  return { ok: true, start: startStatus, end: endStatus };
}
function scheduleWallKey(value, timezone) {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u.test(value)) { const status = classifyLogoWallTime(value, timezone); if (status === 'valid' || status === 'ambiguous') return value; return null; }
  const parts = scheduleParts(Date.parse(value), timezone); return parts ? `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}` : null;
}
function scheduleNowWallKey(timestamp, timezone) { const parts = scheduleParts(timestamp, timezone); return parts ? `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}` : null; }
function scheduleWeekday(timestamp, timezone) { return ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[scheduleParts(timestamp, timezone)?.weekday] ?? new Date(timestamp).getDay()); }

export function read() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY); if (!raw) return normalizeState(DEFAULTS);
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && parsed.schemaVersion === 1 ? normalizeState(parsed) : normalizeState(DEFAULTS);
  } catch { return normalizeState(DEFAULTS); }
}

export const FILE_KIND = 'material-designer.app-logo';
const hasOnlyKeys = (value, allowed) => Boolean(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every((key) => allowed.includes(key)));
export function serialize(state) {
  const normalized = normalizeState(state);
  const safe = normalized.custom ? { ...normalized, custom: { ...normalized.custom } } : normalized;
  if (safe.custom) delete safe.custom.sourceDataUrl;
  return JSON.stringify({ kind: FILE_KIND, version: 1, state: safe }, null, 2) + '\n';
}
export function parse(text) {
  try {
    const file = JSON.parse(text);
    if (!file || typeof file !== 'object' || file.kind !== FILE_KIND || file.version !== 1 || !file.state || typeof file.state !== 'object' || file.state.schemaVersion !== 1 || typeof file.state.rainbowSpeedLevel !== 'number' || !Number.isInteger(file.state.rainbowSpeedLevel) || file.state.rainbowSpeedLevel < 1 || file.state.rainbowSpeedLevel > 5 || Object.keys(file).some((key) => !['kind', 'version', 'state'].includes(key))) return null;
    const allowed = new Set(['schemaVersion', 'presetId', 'custom', 'fit', 'crop', 'focalPoint', 'background', 'safeArea', 'rainbowSpeedLevel', 'schedules']);
    if (Object.keys(file.state).some((key) => !allowed.has(key))) return null;
    if (!hasOnlyKeys(file.state.crop, ['x', 'y', 'width', 'height']) || !['x', 'y', 'width', 'height'].every((key) => typeof file.state.crop[key] === 'number' && Number.isFinite(file.state.crop[key]))) return null;
    if (!hasOnlyKeys(file.state.focalPoint, ['x', 'y']) || !['x', 'y'].every((key) => typeof file.state.focalPoint[key] === 'number' && Number.isFinite(file.state.focalPoint[key]))) return null;
    if (file.state.custom !== null) {
      if (!file.state.custom || typeof file.state.custom !== 'object' || Array.isArray(file.state.custom)) return null;
      const customAllowed = new Set(['dataUrl', 'mimeType', 'byteLength', 'width', 'height', 'hasAlpha', 'frameCount', 'sourceMimeType', 'sourceHasAlpha', 'losses', 'renderFingerprint', 'sourceDataUrl', 'variants']);
      if (Object.keys(file.state.custom).some((key) => !customAllowed.has(key))) return null;
      if (file.state.custom.variants !== undefined) {
        if (!hasOnlyKeys(file.state.custom.variants, DISPLAY_TARGETS.map((target) => target.id))) return null;
        for (const target of DISPLAY_TARGETS) if (!hasOnlyKeys(file.state.custom.variants[target.id], ['dataUrl', 'byteLength', 'width', 'height', 'hasAlpha', 'frameCount'])) return null;
      }
    }
    if (!Array.isArray(file.state.schedules) || file.state.schedules.length > 12 || file.state.schedules.some((rule) => {
      if (!rule || typeof rule !== 'object' || Array.isArray(rule)) return true;
      const candidate = rule;
      const scheduleValidation = typeof candidate.startAt === 'string' && typeof candidate.endAt === 'string' && typeof candidate.timezone === 'string' ? validateLogoSchedule(candidate) : { ok: false };
      if (!scheduleValidation.ok) return true;
      return typeof candidate.id !== 'string' || !candidate.id || candidate.id.length > 80
        || typeof candidate.label !== 'string' || !candidate.label || candidate.label.length > 120
        || typeof candidate.enabled !== 'boolean' || typeof candidate.startAt !== 'string' || typeof candidate.endAt !== 'string'
        || !Number.isFinite(Date.parse(candidate.startAt)) || !Number.isFinite(Date.parse(candidate.endAt)) || Date.parse(candidate.endAt) <= Date.parse(candidate.startAt)
        || typeof candidate.timezone !== 'string' || !candidate.timezone || !Array.isArray(candidate.weekdays) || candidate.weekdays.length === 0 || candidate.weekdays.length > 7
        || candidate.weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6) || !candidate.patch || typeof candidate.patch !== 'object' || Array.isArray(candidate.patch)
        || Object.keys(candidate.patch).some((key) => !['presetId', 'fit', 'background', 'safeArea', 'rainbowSpeedLevel', 'crop', 'focalPoint'].includes(key))
        || (candidate.patch.presetId !== undefined && !PRESETS.some((preset) => preset.id === candidate.patch.presetId))
        || (candidate.patch.fit !== undefined && !['contain', 'cover', 'fill'].includes(candidate.patch.fit))
        || (candidate.patch.safeArea !== undefined && typeof candidate.patch.safeArea !== 'boolean')
        || (candidate.patch.rainbowSpeedLevel !== undefined && (typeof candidate.patch.rainbowSpeedLevel !== 'number' || !Number.isInteger(candidate.patch.rainbowSpeedLevel) || candidate.patch.rainbowSpeedLevel < 1 || candidate.patch.rainbowSpeedLevel > 5))
        || (candidate.patch.crop !== undefined && (!hasOnlyKeys(candidate.patch.crop, ['x', 'y', 'width', 'height']) || !['x', 'y', 'width', 'height'].every((key) => typeof candidate.patch.crop[key] === 'number' && Number.isFinite(candidate.patch.crop[key]))))
        || (candidate.patch.focalPoint !== undefined && (!hasOnlyKeys(candidate.patch.focalPoint, ['x', 'y']) || typeof candidate.patch.focalPoint.x !== 'number' || typeof candidate.patch.focalPoint.y !== 'number' || !Number.isFinite(candidate.patch.focalPoint.x) || !Number.isFinite(candidate.patch.focalPoint.y)))
        || (candidate.patch.background !== undefined && candidate.patch.background !== 'transparent' && !(typeof candidate.patch.background === 'string' && /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/iu.test(candidate.patch.background)));
    })) return null;
    const normalized = normalizeState(file.state);
    if (file.state.custom !== null && normalized.custom === null) return null;
    if (Array.isArray(file.state.schedules) && normalized.schedules.length !== file.state.schedules.length) return null;
    return normalized;
  } catch { return null; }
}

function write(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeState(state))); return true; } catch { return false; /* storage-disabled browsers stay session-local */ }
}

export function apply(state) {
  const stored = normalizeState(state);
  const next = resolveScheduledState(stored);
  const root = document.documentElement;
  const source = next.custom?.dataUrl || PRESETS.find((preset) => preset.id === next.presetId)?.src || PRESET_MARK;
  root.dataset.logoPreset = next.custom ? 'custom' : next.presetId;
  root.style.setProperty('--app-logo-image', `url(${JSON.stringify(source)})`);
  root.dataset.logoRainbow = next.background === 'rainbow' ? 'on' : 'off';
  root.style.setProperty('--app-logo-background-size', next.fit === 'fill' ? '100% 100%' : next.fit);
  root.style.setProperty('--app-logo-focal-x', `${next.focalPoint.x * 100}%`);
  root.style.setProperty('--app-logo-focal-y', `${next.focalPoint.y * 100}%`);
  root.style.setProperty('--app-logo-safe-inset', next.safeArea ? '12%' : '0%');
  root.style.setProperty('--app-logo-background', next.background === 'rainbow' ? 'linear-gradient(120deg, hsl(0 90% 60%), hsl(120 90% 60%), hsl(240 90% 60%), hsl(360 90% 60%))' : next.background);
  root.style.setProperty('--app-logo-rainbow-speed', `${[0, 24, 18, 12, 8, 5][next.rainbowSpeedLevel] || 12}s`);
  const image = document.querySelector('[data-app-logo-image]');
  if (image) image.setAttribute('src', source);
  document.querySelectorAll('[data-app-logo-preview]').forEach((node) => {
    node.setAttribute('src', source);
    node.style.objectFit = next.fit;
    node.style.objectPosition = `${next.focalPoint.x * 100}% ${next.focalPoint.y * 100}%`;
  });
  const persisted = write(stored);
  document.dispatchEvent(new CustomEvent('md-logo-change', { detail: { state: next, persisted } }));
  return persisted;
}

export async function convert(file, options = {}) {
  const crop = safeCrop(options.crop || DEFAULTS.crop);
  const fit = options.fit === 'cover' || options.fit === 'fill' ? options.fit : DEFAULTS.fit;
  const focalPoint = { x: clamp(Number(options.focalPoint?.x), 0, 1), y: clamp(Number(options.focalPoint?.y), 0, 1) };
  const safeArea = options.safeArea !== false;
  const background = options.background || DEFAULTS.background;
  const outputSize = clamp(Math.round(Number(options.outputSize) || 512), 1, MAX_DIMENSION);
  const signal = options.signal;
  if (signal?.aborted) throw new Error('conversion-aborted');
  if (file.size > MAX_SOURCE_BYTES) throw new Error(`The selected file exceeds ${MAX_SOURCE_BYTES} bytes.`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const info = validateBytes(bytes);
  if (!info.ok) throw new Error(info.code);
  const validatedFile = fileForValidatedBytes(bytes, info.mimeType);
  const sourceDataUrl = await readSourceDataUrl(validatedFile, signal);
  const workerResult = await convertInWorker(bytes, info.mimeType, { crop, fit, focalPoint, safeArea, background, outputSize }, signal);
  if (signal?.aborted) throw new Error('conversion-aborted');
  const primary = await materializeWorkerAsset(workerResult.primary, outputSize, outputSize, signal);
  const variants = {};
  for (const target of DISPLAY_TARGETS) {
    if (!workerResult.variants[target.id]) throw new Error('output-invalid');
    variants[target.id] = await materializeWorkerAsset(workerResult.variants[target.id], target.width, target.height, signal);
  }
  const aggregateBytes = primary.byteLength + Object.values(variants).reduce((total, asset) => total + (asset?.byteLength || 0), 0);
  if (aggregateBytes > MAX_AGGREGATE_BYTES) throw new Error('aggregate-output-too-large');
  return { ...primary, mimeType: 'image/png', sourceMimeType: info.mimeType, sourceHasAlpha: info.hasAlpha, sourceDataUrl, renderFingerprint: logoRenderFingerprint({ crop, fit, focalPoint, safeArea, background }), losses: Array.from(new Set([info.mimeType === 'image/png' ? 'metadata' : 'format', 'metadata', 'profile', ...(crop.x || crop.y || crop.width !== 1 || crop.height !== 1 ? ['crop'] : []), ...(info.hasAlpha && background !== 'transparent' && background !== 'rainbow' ? ['transparency'] : [])])), variants };
}

function copyBuffer(bytes) {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

function readSourceDataUrl(file, signal) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    let settled = false;
    const timer = window.setTimeout(() => { reader.abort(); finish(reject, new Error('source-retention-timeout')); }, MAX_DECODE_TIME_MS);
    const finish = (done, value) => { if (settled) return; settled = true; window.clearTimeout(timer); signal?.removeEventListener('abort', onAbort); done(value); };
    const onAbort = () => { reader.abort(); finish(reject, new Error('conversion-aborted')); };
    reader.onerror = () => finish(reject, new Error('source-retention-failed'));
    reader.onabort = () => { if (!settled) finish(reject, new Error('conversion-aborted')); };
    reader.onload = () => finish(resolve, String(reader.result));
    if (signal?.aborted) { onAbort(); return; }
    signal?.addEventListener('abort', onAbort, { once: true });
    reader.readAsDataURL(file);
  });
}

function fileForValidatedBytes(bytes, mimeType) {
  return new File([copyBuffer(bytes)], 'local-logo-source', { type: mimeType });
}

function convertInWorker(bytes, mimeType, options, signal) {
  return new Promise((resolve, reject) => {
    if (typeof Worker === 'undefined') { reject(new Error('decoder-unavailable')); return; }
    let worker;
    try { worker = new Worker(new URL('./logo-decoder.worker.js', import.meta.url), { type: 'module' }); }
    catch { reject(new Error('decoder-unavailable')); return; }
    let settled = false;
    const timer = window.setTimeout(() => finish(reject, new Error('decode-timeout')), MAX_DECODE_TIME_MS);
    const onAbort = () => finish(reject, new Error('conversion-aborted'));
    const cleanup = () => { window.clearTimeout(timer); signal?.removeEventListener('abort', onAbort); worker.onmessage = null; worker.onerror = null; worker.terminate(); };
    const finish = (done, value) => { if (settled) return; settled = true; cleanup(); done(value); };
    worker.onmessage = (event) => { const value = event.data; if (value?.ok === true) finish(resolve, value); else finish(reject, new Error(value?.code || 'decode-failed')); };
    worker.onerror = () => finish(reject, new Error('decode-failed'));
    if (signal?.aborted) { onAbort(); return; }
    signal?.addEventListener('abort', onAbort, { once: true });
    const transferable = copyBuffer(bytes);
    try { worker.postMessage({ kind: 'convert', bytes: transferable, mimeType, options }, [transferable]); }
    catch { finish(reject, new Error('decode-failed')); }
  });
}

async function materializeWorkerAsset(asset, expectedWidth, expectedHeight, signal) {
  const bytes = new Uint8Array(asset.bytes);
  const output = validateBytes(bytes);
  if (!output.ok || output.mimeType !== 'image/png' || output.width !== expectedWidth || output.height !== expectedHeight || output.frameCount !== 1 || asset.width !== expectedWidth || asset.height !== expectedHeight || bytes.byteLength > MAX_OUTPUT_BYTES) throw new Error('output-invalid');
  const dataUrl = await readSourceDataUrl(fileForValidatedBytes(bytes, 'image/png'), signal);
  return { dataUrl, byteLength: bytes.byteLength, width: output.width, height: output.height, hasAlpha: output.hasAlpha, frameCount: 1 };
}

function hexToRgb(hex) {
  const value = /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/iu.test(hex) ? hex.slice(1) : 'fff8f6';
  return { r: parseInt(value.slice(0, 2), 16), g: parseInt(value.slice(2, 4), 16), b: parseInt(value.slice(4, 6), 16), a: value.length === 8 ? parseInt(value.slice(6, 8), 16) / 255 : 1 };
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

function hsvToHex({ h, s, v, a = 1 }) {
  const saturation = clamp(s, 0, 100) / 100; const value = clamp(v, 0, 100) / 100;
  const c = value * saturation; const x = c * (1 - Math.abs(((h / 60) % 2) - 1)); const m = value - c;
  const rgb = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const hex = '#' + rgb.map((channel) => Math.round((channel + m) * 255).toString(16).padStart(2, '0')).join('');
  return a >= 0.999 ? hex : hex + Math.round(clamp(a, 0, 1) * 255).toString(16).padStart(2, '0');
}

function hslToRgb({ h, s, l }) {
  const saturation = clamp(s, 0, 100) / 100; const lightness = clamp(l, 0, 100) / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation; const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1)); const m = lightness - chroma / 2;
  const channels = h < 60 ? [chroma, x, 0] : h < 120 ? [x, chroma, 0] : h < 180 ? [0, chroma, x] : h < 240 ? [0, x, chroma] : h < 300 ? [x, 0, chroma] : [chroma, 0, x];
  return { r: Math.round((channels[0] + m) * 255), g: Math.round((channels[1] + m) * 255), b: Math.round((channels[2] + m) * 255), a: 1 };
}

function parseColorRepresentation(name, text) {
  const source = String(text).trim();
  if (name === 'HEX' || name === 'HEX8') return /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/iu.test(source) ? hexToRgb(source) : null;
  const values = Array.from(source.matchAll(/-?\d+(?:\.\d+)?/g), (match) => Number(match[0]));
  const alpha = source.includes('/') ? (values[values.length - 1] ?? 1) : name.includes('A') ? (values[3] ?? 1) : 1;
  if (name === 'RGB' || name === 'RGBA') return { r: values[0] ?? 0, g: values[1] ?? 0, b: values[2] ?? 0, a: alpha > 1 ? alpha / 255 : alpha };
  if (name === 'HSL' || name === 'HSLA') return { ...hslToRgb({ h: values[0] ?? 0, s: values[1] ?? 0, l: values[2] ?? 0 }), a: alpha > 1 ? alpha / 100 : alpha };
  if (name === 'HSV/HSB') return hexToRgb(hsvToHex({ h: values[0] ?? 0, s: values[1] ?? 0, v: values[2] ?? 0, a: alpha }));
  if (name === 'HWB') { const hsv = { h: values[0] ?? 0, s: 100, v: 100 }; const white = (values[1] ?? 0) / 100; const black = (values[2] ?? 0) / 100; const scale = white + black > 1 ? 1 / (white + black) : 1; return hexToRgb(hsvToHex({ ...hsv, s: 100 * (1 - white * scale - black * scale), v: 100 * (1 - black * scale), a: alpha })); }
  if (name === 'CMYK') { const c = (values[0] ?? 0) / 100; const m = (values[1] ?? 0) / 100; const y = (values[2] ?? 0) / 100; const k = (values[3] ?? 0) / 100; return { r: Math.round(255 * (1 - c) * (1 - k)), g: Math.round(255 * (1 - m) * (1 - k)), b: Math.round(255 * (1 - y) * (1 - k)), a: alpha }; }
  if (name === 'CIELAB' || name === 'LCH' || name === 'OKLab' || name === 'OKLCH') {
    const canvas = document.createElement('canvas'); const context = canvas.getContext('2d');
    if (context) {
      context.fillStyle = '#000'; context.fillStyle = source;
      const match = String(context.fillStyle).match(/rgba?\((\d+),?\s*(\d+),?\s*(\d+)/i);
      if (match) return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]), a: alpha };
    }
  }
  return null;
}

function colorInputIsClipped(name, text) {
  const values = Array.from(String(text).matchAll(/-?\d+(?:\.\d+)?/g), (match) => Number(match[0]));
  if (name === 'RGB' || name === 'RGBA') return values.slice(0, 3).some((value) => value < 0 || value > 255);
  if (name === 'HSL' || name === 'HSLA' || name === 'HSV/HSB') return values.slice(1, 3).some((value) => value < 0 || value > 100);
  if (name === 'HWB') return values.slice(1, 3).some((value) => value < 0 || value > 100);
  if (name === 'CMYK') return values.slice(0, 4).some((value) => value < 0 || value > 100);
  return false;
}

function hslFromRgb({ r, g, b }) {
  const rn = r / 255; const gn = g / 255; const bn = b / 255;
  const max = Math.max(rn, gn, bn); const min = Math.min(rn, gn, bn); const delta = max - min;
  const l = (max + min) / 2;
  if (!delta) return { h: 0, s: 0, l: l * 100 };
  const s = delta / (1 - Math.abs(2 * l - 1));
  let h = max === rn ? 60 * (((gn - bn) / delta) % 6) : max === gn ? 60 * ((bn - rn) / delta + 2) : 60 * ((rn - gn) / delta + 4);
  if (h < 0) h += 360;
  return { h, s: s * 100, l: l * 100 };
}

function srgbToLab({ r, g, b }) {
  const linear = (channel) => { const value = channel / 255; return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4; };
  const rl = linear(r); const gl = linear(g); const bl = linear(b);
  const x = (rl * 0.4124 + gl * 0.3576 + bl * 0.1805) / 0.95047;
  const y = (rl * 0.2126 + gl * 0.7152 + bl * 0.0722);
  const z = (rl * 0.0193 + gl * 0.1192 + bl * 0.9505) / 1.08883;
  const pivot = (value) => value > 0.008856 ? value ** (1 / 3) : 7.787 * value + 16 / 116;
  const fx = pivot(x); const fy = pivot(y); const fz = pivot(z);
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

function srgbToOklab({ r, g, b }) {
  const linear = (channel) => { const value = channel / 255; return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4; };
  const rl = linear(r); const gl = linear(g); const bl = linear(b);
  const l = 0.4122214708 * rl + 0.5363325363 * gl + 0.0514459929 * bl;
  const m = 0.2119034982 * rl + 0.6806995451 * gl + 0.1073969566 * bl;
  const s = 0.0883024619 * rl + 0.2817188376 * gl + 0.6299787005 * bl;
  const lRoot = Math.cbrt(l); const mRoot = Math.cbrt(m); const sRoot = Math.cbrt(s);
  return { l: 0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot, a: 1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot, b: 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot };
}

function colorRepresentations(value) {
  const rgb = hexToRgb(value); const hsl = hslFromRgb(rgb); const hsv = rgbToHsv(rgb);
  const max = Math.max(rgb.r, rgb.g, rgb.b) / 255; const min = Math.min(rgb.r, rgb.g, rgb.b) / 255;
  const lab = srgbToLab(rgb); const lch = { l: lab.l, c: Math.hypot(lab.a, lab.b), h: (Math.atan2(lab.b, lab.a) * 180 / Math.PI + 360) % 360 };
  const oklab = srgbToOklab(rgb); const oklch = { l: oklab.l, c: Math.hypot(oklab.a, oklab.b), h: (Math.atan2(oklab.b, oklab.a) * 180 / Math.PI + 360) % 360 };
  const k = 1 - max; const c = max === 0 ? 0 : (max - rgb.r / 255) / (1 - k); const m = max === 0 ? 0 : (max - rgb.g / 255) / (1 - k); const y = max === 0 ? 0 : (max - rgb.b / 255) / (1 - k);
  const alpha = Math.round((rgb.a ?? 1) * 1000) / 1000;
  return [
    ['HEX', value], ['HEX8', value.length === 9 ? value : `${value}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`],
    ['RGB', `rgb(${rgb.r} ${rgb.g} ${rgb.b})`], ['RGBA', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`],
    ['HSL', `hsl(${Math.round(hsl.h)} ${Math.round(hsl.s)}% ${Math.round(hsl.l)}%)`], ['HSLA', `hsla(${Math.round(hsl.h)}, ${Math.round(hsl.s)}%, ${Math.round(hsl.l)}%, ${alpha})`],
    ['HSV/HSB', `hsv(${Math.round(hsv.h)} ${Math.round(hsv.s)}% ${Math.round(hsv.v)}%)`], ['HWB', `hwb(${Math.round(hsv.h)} ${Math.round(min * 100)}% ${Math.round((1 - max) * 100)}% / ${alpha})`],
    ['CIELAB', `lab(${lab.l.toFixed(2)}% ${lab.a.toFixed(2)} ${lab.b.toFixed(2)} / ${alpha})`], ['LCH', `lch(${lch.l.toFixed(2)}% ${lch.c.toFixed(2)} ${lch.h.toFixed(2)} / ${alpha})`],
    ['OKLab', `oklab(${oklab.l.toFixed(4)} ${oklab.a.toFixed(4)} ${oklab.b.toFixed(4)} / ${alpha})`], ['OKLCH', `oklch(${oklch.l.toFixed(4)} ${oklch.c.toFixed(4)} ${oklch.h.toFixed(2)} / ${alpha})`],
    ['CMYK', `cmyk(${Math.round(c * 100)}% ${Math.round(m * 100)}% ${Math.round(y * 100)}% ${Math.round(k * 100)}% / ${alpha})`],
  ];
}

export function mount(host, { label = 'Logo', translate = (_key, fallback) => fallback } = {}) {
  const state = read();
  let current = state;
  let effective = state;
  let lastHistoryJson = JSON.stringify(current);
  let pendingSuccess = null;
  let refreshTimer;
  let refreshGeneration = 0;
  let refreshAbort = null;
  let uploadGeneration = 0;
  let uploadAbort = null;
  let editingScheduleId = null;
  let searchMatcher = null;
  let historyMatcher = null;
  let targetMatcher = null;
  let colorMatcher = null;
  const search = host.querySelector('[data-logo-search]');
  const status = host.querySelector('[data-logo-status]');
  const source = (targetId) => effective.custom?.variants?.[targetId]?.dataUrl || effective.custom?.dataUrl || PRESETS.find((preset) => preset.id === effective.presetId)?.src || PRESET_MARK;
  const t = (key, fallback) => { try { const value = translate(key, fallback); return typeof value === 'string' && value ? value : fallback; } catch { return fallback; } };
  const setStatus = (message) => { if (status) status.textContent = message; };
  const recordHistory = () => {
    const json = JSON.stringify(current);
    if (json === lastHistoryJson) return true;
    lastHistoryJson = json;
    try {
      const existing = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      const entries = Array.isArray(existing) ? existing.slice(-99) : [];
      entries.push({ changedAt: Date.now(), presetId: current.presetId, customActive: Boolean(current.custom), fit: current.fit, background: current.background, safeArea: current.safeArea, rainbowSpeedLevel: current.rainbowSpeedLevel, scheduleCount: current.schedules.length, snapshot: { presetId: current.presetId, fit: current.fit, background: current.background, safeArea: current.safeArea, rainbowSpeedLevel: current.rainbowSpeedLevel } });
      localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
      return true;
    } catch { return false; /* history is best effort and contains no image bytes */ }
  };
  const render = () => {
    effective = resolveScheduledState(current);
    if (current.custom) {
      const options = { crop: current.crop, fit: current.fit, focalPoint: current.focalPoint, safeArea: current.safeArea, background: current.background };
      const fingerprint = logoRenderFingerprint(options);
      if (current.custom.renderFingerprint !== fingerprint) {
        const custom = current.custom; const generation = ++refreshGeneration;
        if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
        refreshAbort?.abort();
        const controller = new AbortController();
        refreshAbort = controller;
        refreshTimer = window.setTimeout(() => {
          try {
            const source = custom.sourceDataUrl || custom.dataUrl;
            const comma = source.indexOf(',');
            const bytes = Uint8Array.from(atob(source.slice(comma + 1)), (char) => char.charCodeAt(0));
            const file = new File([bytes], 'local-logo-source', { type: custom.sourceMimeType || 'image/png' });
            void convert(file, { ...options, outputSize: custom.width, signal: controller.signal }).then((refreshed) => {
              if (generation !== refreshGeneration) return;
              current = normalizeState({ ...current, custom: { ...refreshed, sourceDataUrl: custom.sourceDataUrl, sourceMimeType: custom.sourceMimeType, sourceHasAlpha: custom.sourceHasAlpha, losses: custom.losses } });
              render();
            }).catch((error) => { if (generation === refreshGeneration && !controller.signal.aborted && error?.message !== 'conversion-aborted') setStatus(t('logo.conversionFailure', 'The image could not be converted locally.')); });
          } catch (error) { if (generation === refreshGeneration && !controller.signal.aborted && error?.message !== 'conversion-aborted') setStatus(t('logo.conversionFailure', 'The image could not be converted locally.')); }
        }, 180);
      }
    }
    const historyAcknowledged = recordHistory();
    const successMessage = pendingSuccess;
    pendingSuccess = null;
    const historyList = host.querySelector('[data-logo-history-list]');
    if (historyList) {
      historyList.textContent = '';
      let entries = [];
      try { const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); entries = Array.isArray(parsed) ? parsed : []; } catch { entries = []; }
      const query = host.querySelector('[data-logo-history-search]')?.value?.trim().toLowerCase() || '';
      const visibleHistory = entries.filter((entry) => { const text = `${entry.action || ''} ${entry.presetId || ''} ${entry.changedAt || ''}`; return historyMatcher ? historyMatcher(text) : !query || text.toLowerCase().includes(query); });
      if (!visibleHistory.length) { const empty = document.createElement('li'); empty.textContent = t('logo.historyEmpty', 'No logo changes recorded locally.'); historyList.appendChild(empty); }
      else visibleHistory.slice().reverse().forEach((entry) => { const item = document.createElement('li'); item.append(document.createTextNode(`${new Date(entry.changedAt).toLocaleString()} · ${entry.action || 'updated'} · ${entry.presetId || 'custom'} `)); if (entry.snapshot && typeof entry.snapshot === 'object') { const restore = document.createElement('button'); restore.type = 'button'; restore.className = 'md-btn md-btn--text'; restore.textContent = t('logo.historyRestore', 'Restore settings'); restore.addEventListener('click', () => { current = normalizeState({ ...current, ...entry.snapshot }); render(); }); item.appendChild(restore); } historyList.appendChild(item); });
    }
    host.querySelectorAll('[data-logo-preset]').forEach((button) => {
      const active = !current.custom && button.dataset.logoPreset === current.presetId;
      button.setAttribute('aria-pressed', String(active));
      const text = `${button.dataset.logoPreset} ${button.textContent || ''}`;
      button.hidden = Boolean(searchMatcher ? !searchMatcher(text) : search?.value && !text.toLowerCase().includes(search.value.toLowerCase()));
    });
    host.querySelectorAll('[data-logo-live], [data-app-logo-preview]').forEach((node) => node.setAttribute('src', source()));
    const fit = host.querySelector('[data-logo-fit]'); if (fit) fit.value = current.fit;
    const transparent = host.querySelector('[data-logo-transparent]'); if (transparent) transparent.checked = current.background === 'transparent';
    const rainbow = host.querySelector('[data-logo-rainbow]'); if (rainbow) rainbow.checked = current.background === 'rainbow';
    const rainbowSpeed = host.querySelector('[data-logo-rainbow-speed]'); if (rainbowSpeed) rainbowSpeed.value = String(current.rainbowSpeedLevel);
    const rainbowSpeedWrap = host.querySelector('[data-logo-rainbow-speed-wrap]'); if (rainbowSpeedWrap) rainbowSpeedWrap.hidden = current.background !== 'rainbow';
    const picker = host.querySelector('[data-logo-color-picker]');
    const hsv = rgbToHsv(hexToRgb(current.background === 'transparent' ? '#fff8f6' : current.background));
    if (picker) {
      const field = picker.querySelector('[data-logo-color-field]');
      if (field) { field.style.background = `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv.h} 100% 50%))`; field.setAttribute('aria-valuenow', String(Math.round(hsv.s))); field.setAttribute('aria-valuetext', `Saturation ${Math.round(hsv.s)}%, brightness ${Math.round(hsv.v)}%`); }
      const hue = picker.querySelector('[data-logo-bg-hue]'); if (hue) hue.value = String(Math.round(hsv.h));
      const saturation = picker.querySelector('[data-logo-bg-saturation]'); if (saturation) saturation.value = String(Math.round(hsv.s));
      const brightness = picker.querySelector('[data-logo-bg-brightness]'); if (brightness) brightness.value = String(Math.round(hsv.v));
      const alpha = picker.querySelector('[data-logo-bg-alpha]'); if (alpha) alpha.value = String(Math.round((hexToRgb(current.background === 'transparent' ? '#fff8f6' : current.background).a || 1) * 100));
      const hex = picker.querySelector('[data-logo-bg-hex]'); if (hex) hex.value = current.background === 'transparent' ? '#fff8f6' : current.background;
      const translations = picker.querySelector('[data-logo-color-translations]');
      if (translations) {
        translations.textContent = '';
        for (const [name, representation] of colorRepresentations(current.background === 'transparent' ? '#fff8f6' : current.background)) {
          if (colorMatcher && !colorMatcher(`${name} ${representation}`)) continue;
          const item = document.createElement('div'); item.setAttribute('role', 'listitem');
          const labelNode = document.createElement('label'); labelNode.textContent = `${name}: `;
          const value = document.createElement('input'); value.type = 'text'; value.value = representation; value.setAttribute('aria-label', `${name} colour value`); value.addEventListener('change', () => { const parsed = parseColorRepresentation(name, value.value); if (parsed) { if (colorInputIsClipped(name, value.value)) setStatus(t('logo.colorClipped', 'Some color components were outside the supported range and were clipped. Review the value before applying it.')); current = normalizeState({ ...current, background: hsvToHex({ ...rgbToHsv(parsed), a: parsed.a ?? 1 }) }); render(); } else { setStatus(t(name === 'HEX' || name === 'HEX8' ? 'logo.colorInvalid' : 'logo.colorUnsupported', 'Invalid or unsupported color value. The previous color remains active.')); render(); } });
          const copy = document.createElement('button'); copy.type = 'button'; copy.className = 'md-icon-btn md-icon-btn--small'; copy.textContent = t('logo.copy', 'Copy'); copy.setAttribute('aria-label', `${t('logo.copy', 'Copy')} ${name}`);
          copy.addEventListener('click', () => { void navigator.clipboard?.writeText(representation); });
          labelNode.appendChild(value); item.append(labelNode, copy); translations.appendChild(item);
        }
      }
    }
    const focalX = host.querySelector('[data-logo-focal-x]'); if (focalX) focalX.value = String(current.focalPoint.x);
    const focalY = host.querySelector('[data-logo-focal-y]'); if (focalY) focalY.value = String(current.focalPoint.y);
    const focalXValue = host.querySelector('[data-logo-focal-x-value]'); if (focalXValue) focalXValue.textContent = `${Math.round(current.focalPoint.x * 100)}%`;
    const focalYValue = host.querySelector('[data-logo-focal-y-value]'); if (focalYValue) focalYValue.textContent = `${Math.round(current.focalPoint.y * 100)}%`;
    const safeArea = host.querySelector('[data-logo-safe-area]'); if (safeArea) safeArea.checked = current.safeArea;
    host.querySelectorAll('[data-logo-crop]').forEach((field) => { const name = field.dataset.logoCrop; if (name && current.crop[name] != null) { field.value = String(current.crop[name]); field.setAttribute('aria-label', t(`logo.crop${name[0].toUpperCase()}${name.slice(1)}`, name)); } });
    const stage = host.querySelector('[data-logo-stage]');
    const live = host.querySelector('[data-logo-live]');
    if (live) {
      live.style.objectFit = current.fit;
      live.style.objectPosition = `${current.focalPoint.x * 100}% ${current.focalPoint.y * 100}%`;
      live.style.clipPath = `inset(${current.crop.y * 100}% ${(1 - current.crop.x - current.crop.width) * 100}% ${(1 - current.crop.y - current.crop.height) * 100}% ${current.crop.x * 100}%)`;
    }
    if (stage) {
      stage.dataset.safeArea = current.safeArea ? 'on' : 'off';
      stage.dataset.logoRainbow = current.background === 'rainbow' ? 'on' : 'off';
      stage.style.backgroundColor = current.background === 'transparent' ? '' : current.background;
    }
    host.querySelectorAll('[data-logo-target]').forEach((node) => node.setAttribute('src', source(node.dataset.logoTarget)));
    host.querySelectorAll('.logo-target-grid figure').forEach((figure) => { const text = figure.textContent || ''; figure.hidden = targetMatcher ? !targetMatcher(text) : false; });
    const schedulePreset = host.querySelector('[data-logo-schedule-preset]');
    if (schedulePreset && !schedulePreset.options.length) PRESETS.forEach((preset) => { const option = document.createElement('option'); option.value = preset.id; option.textContent = t(`logo.${preset.id}`, preset.label); schedulePreset.appendChild(option); });
    const scheduleList = host.querySelector('[data-logo-schedule-list]');
    if (scheduleList) {
      scheduleList.textContent = '';
      current.schedules.forEach((rule) => {
        const item = document.createElement('li');
        const title = document.createElement('strong'); title.textContent = `${rule.label}: ${rule.startAt} → ${rule.endAt}`;
        const enabled = document.createElement('input'); enabled.type = 'checkbox'; enabled.checked = rule.enabled; enabled.setAttribute('aria-label', t('logo.scheduleEnabled', 'Enabled')); enabled.addEventListener('change', () => { current = normalizeState({ ...current, schedules: current.schedules.map((entry) => entry.id === rule.id ? { ...entry, enabled: enabled.checked } : entry) }); render(); });
        const toggleLabel = document.createElement('label'); toggleLabel.append(enabled, document.createTextNode(` ${t('logo.scheduleEnabled', 'Enabled')}`));
        const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'md-btn md-btn--text'; remove.textContent = t('logo.scheduleDelete', 'Delete schedule'); remove.addEventListener('click', () => { current = normalizeState({ ...current, schedules: current.schedules.filter((entry) => entry.id !== rule.id) }); render(); });
        const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'md-btn md-btn--text'; edit.textContent = t('logo.scheduleEdit', 'Edit schedule'); edit.addEventListener('click', () => { editingScheduleId = rule.id; host.querySelector('[data-logo-schedule-label]').value = rule.label; host.querySelector('[data-logo-schedule-start]').value = rule.startAt.slice(0, 16); host.querySelector('[data-logo-schedule-end]').value = rule.endAt.slice(0, 16); host.querySelector('[data-logo-schedule-preset]').value = rule.patch.presetId || 'material'; host.querySelectorAll('[data-logo-weekday]').forEach((field) => { field.checked = rule.weekdays.includes(Number(field.dataset.logoWeekday)); }); });
        item.append(title, document.createTextNode(' '), toggleLabel, document.createTextNode(' '), edit, document.createTextNode(' '), remove); scheduleList.appendChild(item);
      });
    }
    const timezone = host.querySelector('[data-logo-timezone]'); if (timezone) timezone.textContent = t('logo.timezone', 'Timezone: {timezone}. Daylight-saving changes follow the platform clock.').replace('{timezone}', Intl.DateTimeFormat().resolvedOptions().timeZone || 'local time');
    const sourceInfo = host.querySelector('[data-logo-source-info]');
    if (sourceInfo) sourceInfo.textContent = effective.custom
      ? `${effective.custom.sourceHasAlpha ? t('logo.sourceAlpha', 'Source includes transparency; generated output alpha is reported separately.') : t('logo.sourceOpaque', 'Source is opaque; generated output alpha is reported separately.')} ${effective.custom.hasAlpha ? t('logo.outputAlpha', 'Output alpha present.') : t('logo.outputOpaque', 'Output opaque.')}`
      : '';
    const persisted = apply(current);
    if (successMessage) setStatus(historyAcknowledged && persisted ? successMessage : t('logo.persistenceUnavailable', 'The latest logo remains active in this session, but local persistence or history acknowledgement is unavailable.'));
    else if (!persisted) setStatus(t('logo.persistenceUnavailable', 'The latest logo remains active in this session, but local persistence is unavailable.'));
  };
  host.querySelectorAll('[data-logo-preset]').forEach((button) => button.addEventListener('click', () => { current = normalizeState({ ...current, presetId: button.dataset.logoPreset, custom: null }); setStatus(t('logo.presetApplied', 'Preset applied locally.')); render(); }));
  search?.addEventListener('input', render);
  host.querySelector('[data-logo-fit]')?.addEventListener('change', (event) => { current = normalizeState({ ...current, fit: event.target.value }); render(); });
  host.querySelector('[data-logo-transparent]')?.addEventListener('change', (event) => { current = normalizeState({ ...current, background: event.target.checked ? 'transparent' : '#fff8f6' }); render(); });
  host.querySelector('[data-logo-rainbow]')?.addEventListener('change', (event) => { current = normalizeState({ ...current, background: event.target.checked ? 'rainbow' : 'transparent' }); render(); });
  host.querySelector('[data-logo-rainbow-speed]')?.addEventListener('input', (event) => { current = normalizeState({ ...current, rainbowSpeedLevel: Number(event.target.value) }); render(); });
  const colorPicker = host.querySelector('[data-logo-color-picker]');
  const updateFromHsvControls = () => {
    if (!colorPicker) return;
    const h = Number(colorPicker.querySelector('[data-logo-bg-hue]')?.value || 0);
    const s = Number(colorPicker.querySelector('[data-logo-bg-saturation]')?.value || 0);
    const v = Number(colorPicker.querySelector('[data-logo-bg-brightness]')?.value || 0);
    const a = Number(colorPicker.querySelector('[data-logo-bg-alpha]')?.value || 100) / 100;
    current = normalizeState({ ...current, background: hsvToHex({ h, s, v, a }) }); render();
  };
  colorPicker?.querySelectorAll('[data-logo-bg-hue], [data-logo-bg-saturation], [data-logo-bg-brightness]').forEach((control) => control.addEventListener('input', updateFromHsvControls));
  colorPicker?.querySelector('[data-logo-bg-hex]')?.addEventListener('change', (event) => { if (/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/iu.test(event.target.value)) { current = normalizeState({ ...current, background: event.target.value }); render(); } else { setStatus(t('logo.colorInvalid', 'Invalid color value. The previous color remains active.')); render(); } });
  colorPicker?.querySelector('[data-logo-color-field]')?.addEventListener('pointerdown', (event) => {
    const field = event.currentTarget; const rect = field.getBoundingClientRect(); if (!rect.width || !rect.height) return;
    const hsv = rgbToHsv(hexToRgb(current.background === 'transparent' ? '#fff8f6' : current.background));
    const alpha = hexToRgb(current.background === 'transparent' ? '#fff8f6' : current.background).a || 1;
    current = normalizeState({ ...current, background: hsvToHex({ h: hsv.h, s: clamp((event.clientX - rect.left) / rect.width, 0, 1) * 100, v: (1 - clamp((event.clientY - rect.top) / rect.height, 0, 1)) * 100, a: alpha }) }); render();
  });
  colorPicker?.querySelector('[data-logo-color-field]')?.addEventListener('keydown', (event) => {
    const hsv = rgbToHsv(hexToRgb(current.background === 'transparent' ? '#fff8f6' : current.background));
    const alpha = hexToRgb(current.background === 'transparent' ? '#fff8f6' : current.background).a || 1;
    const step = event.shiftKey ? 10 : 1;
    if (event.key === 'ArrowLeft') hsv.s = clamp(hsv.s - step, 0, 100);
    else if (event.key === 'ArrowRight') hsv.s = clamp(hsv.s + step, 0, 100);
    else if (event.key === 'ArrowUp') hsv.v = clamp(hsv.v + step, 0, 100);
    else if (event.key === 'ArrowDown') hsv.v = clamp(hsv.v - step, 0, 100);
    else return;
    event.preventDefault(); current = normalizeState({ ...current, background: hsvToHex({ ...hsv, a: alpha }) }); render();
  });
  host.querySelector('[data-logo-focal-x]')?.addEventListener('input', (event) => { current = normalizeState({ ...current, focalPoint: { ...current.focalPoint, x: Number(event.target.value) } }); render(); });
  host.querySelector('[data-logo-focal-y]')?.addEventListener('input', (event) => { current = normalizeState({ ...current, focalPoint: { ...current.focalPoint, y: Number(event.target.value) } }); render(); });
  host.querySelector('[data-logo-safe-area]')?.addEventListener('change', (event) => { current = normalizeState({ ...current, safeArea: event.target.checked }); render(); });
  host.querySelectorAll('[data-logo-crop]').forEach((field) => field.addEventListener('change', (event) => { const name = event.currentTarget.dataset.logoCrop; if (!name) return; current = normalizeState({ ...current, crop: { ...current.crop, [name]: Number(event.currentTarget.value) } }); render(); }));
  host.querySelector('[data-logo-reset]')?.addEventListener('click', () => { current = normalizeState(DEFAULTS); setStatus(t('logo.resetDone', 'Logo selection reset to the shipped mark.')); render(); });
  host.querySelector('[data-logo-export]')?.addEventListener('click', () => { const blob = new Blob([serialize(current)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'material-designer-logo-appearance.json'; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 0); });
  host.querySelector('[data-logo-import]')?.addEventListener('change', async (event) => { const file = event.target.files?.[0]; if (!file || file.size > MAX_TRANSFER_BYTES) { setStatus(t('logo.importError', 'The logo appearance file is invalid or too large.')); return; } try { const imported = parse(await file.text()); if (!imported) throw new Error('invalid'); current = imported; setStatus(t('logo.imported', 'Logo appearance imported locally.')); render(); } catch { setStatus(t('logo.importError', 'The logo appearance file is invalid or uses an unknown schema. Nothing changed.')); } event.target.value = ''; });
  host.querySelector('[data-logo-schedule-add]')?.addEventListener('click', () => { const start = host.querySelector('[data-logo-schedule-start]')?.value; const end = host.querySelector('[data-logo-schedule-end]')?.value; const label = host.querySelector('[data-logo-schedule-label]')?.value; const preset = host.querySelector('[data-logo-schedule-preset]')?.value; const weekdays = Array.from(host.querySelectorAll('[data-logo-weekday]:checked')).map((field) => Number(field.dataset.logoWeekday)); const a = Date.parse(start); const b = Date.parse(end); if (!start || !end || !Number.isFinite(a) || !Number.isFinite(b) || b <= a || weekdays.length === 0) { setStatus(t('logo.scheduleInvalid', 'Enter a valid start and end, with the end after the start.')); return; } const id = editingScheduleId || `logo-schedule-${Date.now().toString(36)}`; const rule = { id, label: label?.trim() || 'Logo schedule', enabled: true, startAt: start.slice(0, 16), endAt: end.slice(0, 16), weekdays, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'local', patch: { presetId: preset, fit: current.fit, background: current.background, safeArea: current.safeArea, rainbowSpeedLevel: current.rainbowSpeedLevel, crop: current.crop, focalPoint: current.focalPoint } }; current = normalizeState({ ...current, schedules: editingScheduleId ? current.schedules.map((entry) => entry.id === editingScheduleId ? rule : entry) : [...current.schedules, rule] }); editingScheduleId = null; setStatus(t('logo.scheduleAdded', 'Logo schedule added locally.')); render(); });
  const scheduleTimer = window.setInterval(render, 60_000);
  host.querySelector('[data-logo-upload]')?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0]; if (!file) return;
    const generation = ++uploadGeneration;
    uploadAbort?.abort();
    const controller = new AbortController();
    uploadAbort = controller;
    setStatus(t('logo.validating', 'Validating and converting locally…'));
    try { const custom = await convert(file, { crop: current.crop, fit: current.fit, focalPoint: current.focalPoint, safeArea: current.safeArea, background: current.background, outputSize: 512, signal: controller.signal }); if (generation !== uploadGeneration || controller.signal.aborted) return; current = normalizeState({ ...current, custom: { ...custom, renderFingerprint: logoRenderFingerprint({ crop: DEFAULTS.crop, fit: current.fit, focalPoint: current.focalPoint, safeArea: current.safeArea, background: current.background }) }, crop: DEFAULTS.crop }); pendingSuccess = t('logo.converted', `Converted locally to a verified ${custom.width}×${custom.height} PNG.`).replace('{width}', String(custom.width)).replace('{height}', String(custom.height)); render(); }
    catch (error) { if (generation === uploadGeneration && !controller.signal.aborted && error?.message !== 'conversion-aborted') setStatus(t('logo.conversionFailure', 'The image could not be converted locally.')); }
    finally { if (generation === uploadGeneration) event.target.value = ''; }
  });
  render();
  return {
    getState: () => ({ ...current }),
    refresh: () => render(),
    setSearchMatcher: (matcher) => { searchMatcher = typeof matcher === 'function' ? matcher : null; render(); },
    setHistoryMatcher: (matcher) => { historyMatcher = typeof matcher === 'function' ? matcher : null; render(); },
    setTargetMatcher: (matcher) => { targetMatcher = typeof matcher === 'function' ? matcher : null; render(); },
    setColorMatcher: (matcher) => { colorMatcher = typeof matcher === 'function' ? matcher : null; render(); },
    reset: () => { current = normalizeState(DEFAULTS); render(); },
    destroy: () => { window.clearInterval(scheduleTimer); if (refreshTimer !== undefined) window.clearTimeout(refreshTimer); refreshAbort?.abort(); uploadAbort?.abort(); refreshGeneration += 1; uploadGeneration += 1; },
  };
}

export function init(options = {}) {
  const host = document.querySelector('[data-logo-customization]');
  if (!host) return null;
  return mount(host, options);
}

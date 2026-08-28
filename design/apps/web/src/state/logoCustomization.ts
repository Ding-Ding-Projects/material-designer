/**
 * Local-first app-logo customization.
 *
 * The logo is presentation state only. Stable package identity, update feed,
 * application-data location and installer identity never read this module's
 * selected value. Uploaded input is inspected from bytes before any decoder is
 * invited to touch it, and all accepted custom data remains in the browser's
 * private application storage.
 */

export const LOGO_SCHEMA_VERSION = 1 as const;
export const LOGO_FILE_KIND = 'open-design.app-logo' as const;
export const LOGO_FILE_VERSION = 1 as const;
export const LOGO_STORAGE_KEY = 'open-design:app-logo:v1';
export const LOGO_HISTORY_STORAGE_KEY = 'open-design:app-logo-history:v1';
export const MAX_LOGO_SOURCE_BYTES = 8 * 1024 * 1024;
export const MAX_LOGO_OUTPUT_BYTES = 2 * 1024 * 1024;
export const MAX_LOGO_AGGREGATE_BYTES = 8 * 1024 * 1024;
export const MAX_LOGO_DIMENSION = 4096;
export const MAX_LOGO_PIXELS = 16 * 1024 * 1024;
export const MAX_LOGO_FRAMES = 1;
export const MAX_LOGO_DECODE_TIME_MS = 2000;

export const LOGO_DISPLAY_TARGETS = [
  { id: 'favicon', label: 'Favicon', width: 16, height: 16 },
  { id: 'toolbar', label: 'Toolbar', width: 32, height: 32 },
  { id: 'titlebar', label: 'Title bar', width: 48, height: 48 },
  { id: 'sidebar', label: 'Sidebar', width: 128, height: 128 },
  { id: 'installer', label: 'Installer', width: 256, height: 256 },
] as const;

export type LogoDisplayTarget = (typeof LOGO_DISPLAY_TARGETS)[number]['id'];
export type LogoFit = 'contain' | 'cover' | 'fill';
export type LogoBackground = string | 'transparent' | 'rainbow';

export interface LogoPreset {
  id: 'material' | 'warm' | 'monochrome' | 'outline';
  label: string;
  /** A local, bundled asset path. It is never a network URL. */
  src: string;
}

function bundledSvg(svg: string): string {
  // Presets are tiny, in-process SVGs. Encoding them as data URLs keeps the
  // source local and makes the asset independent of any runtime origin.
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const MATERIAL_PRESET = bundledSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="7" fill="#8f4c34"/><path fill="#ffdbcf" d="M4 20V4h3.6l4.4 8.2L16.4 4H20v16h-3.4v-9.4L12 19l-4.6-8.4V20H4Z"/></svg>');
const WARM_PRESET = bundledSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="7" fill="#00696d"/><path fill="#b2ebeb" d="M4 20V4h3.6l4.4 8.2L16.4 4H20v16h-3.4v-9.4L12 19l-4.6-8.4V20H4Z"/></svg>');
const MONOCHROME_PRESET = bundledSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="7" fill="#252525"/><path fill="#fff" d="M4 20V4h3.6l4.4 8.2L16.4 4H20v16h-3.4v-9.4L12 19l-4.6-8.4V20H4Z"/></svg>');
const OUTLINE_PRESET = bundledSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="1" y="1" width="22" height="22" rx="7" fill="none" stroke="#8f4c34" stroke-width="2"/><path fill="none" stroke="#8f4c34" stroke-width="2" d="M4 20V4h3.6l4.4 8.2L16.4 4H20v16"/></svg>');

export const LOGO_PRESETS: readonly LogoPreset[] = [
  { id: 'material', label: 'Material mark', src: MATERIAL_PRESET },
  { id: 'warm', label: 'Warm mark', src: WARM_PRESET },
  { id: 'monochrome', label: 'Monochrome mark', src: MONOCHROME_PRESET },
  { id: 'outline', label: 'Outline mark', src: OUTLINE_PRESET },
];

/** Safety scan for the four shipped SVG presets, kept independent of XML DOM. */
export function isSafeBundledSvgPreset(preset: LogoPreset): boolean {
  if (!preset.src.startsWith('data:image/svg+xml,')) return false;
  try {
    const svg = decodeURIComponent(preset.src.slice('data:image/svg+xml,'.length));
    return /^<svg\s[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"[^>]*>/u.test(svg)
      && !/<(?:script|foreignObject|iframe|object|embed)\b/iu.test(svg)
      && !/\b(?:href|xlink:href)\s*=/iu.test(svg)
      && !/url\s*\(/iu.test(svg);
  } catch {
    return false;
  }
}

export interface LogoCustomAsset {
  /** A validated local data URL, never a remote URL. */
  dataUrl: string;
  mimeType: 'image/png';
  byteLength: number;
  width: number;
  height: number;
  hasAlpha: boolean;
  frameCount: 1;
  sourceMimeType?: LogoValidation['mimeType'];
  sourceHasAlpha?: boolean;
  losses?: readonly ('format' | 'metadata' | 'profile' | 'crop' | 'transparency')[];
  renderFingerprint?: string;
  /** Original validated bytes retained only in the private local cache. */
  sourceDataUrl?: string;
  variants?: Partial<Record<LogoDisplayTarget, {
    dataUrl: string;
    byteLength: number;
    width: number;
    height: number;
    hasAlpha: boolean;
    frameCount: 1;
  }>>;
}

type LogoVariantAsset = NonNullable<LogoCustomAsset['variants']>[LogoDisplayTarget];

export interface LogoCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LogoRenderOptions {
  crop: LogoCrop;
  fit: LogoFit;
  focalPoint: { x: number; y: number };
  safeArea: boolean;
  background: LogoBackground;
  outputSize?: number;
}

export function logoRenderFingerprint(options: Pick<LogoRenderOptions, 'crop' | 'fit' | 'focalPoint' | 'safeArea' | 'background'>): string {
  return JSON.stringify({ crop: normalizeLogoCrop(options.crop), fit: options.fit, focalPoint: options.focalPoint, safeArea: options.safeArea, background: options.background });
}

export interface LogoScheduleRule {
  id: string;
  label: string;
  enabled: boolean;
  startAt: string;
  endAt: string;
  weekdays: readonly number[];
  timezone: string;
  patch: Partial<Pick<LogoState, 'presetId' | 'fit' | 'background' | 'safeArea' | 'rainbowSpeedLevel' | 'crop' | 'focalPoint'>>;
}

export interface LogoState {
  schemaVersion: typeof LOGO_SCHEMA_VERSION;
  presetId: LogoPreset['id'];
  custom: LogoCustomAsset | null;
  fit: LogoFit;
  crop: LogoCrop;
  focalPoint: { x: number; y: number };
  background: LogoBackground;
  safeArea: boolean;
  rainbowSpeedLevel: number;
  schedules: readonly LogoScheduleRule[];
}

export const DEFAULT_LOGO_STATE: LogoState = {
  schemaVersion: LOGO_SCHEMA_VERSION,
  presetId: 'material',
  custom: null,
  fit: 'contain',
  crop: { x: 0, y: 0, width: 1, height: 1 },
  focalPoint: { x: 0.5, y: 0.5 },
  background: 'transparent',
  safeArea: true,
  rainbowSpeedLevel: 3,
  schedules: [],
};

export interface LogoValidation {
  ok: true;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  byteLength: number;
  width: number;
  height: number;
  hasAlpha: boolean;
  frameCount: 1;
} | {
  ok: false;
  code:
    | 'empty'
    | 'too-large'
    | 'unsupported-format'
    | 'malformed'
    | 'too-many-pixels'
    | 'too-large-dimension'
    | 'animated';
  detail: string;
};

function uint32(view: DataView, offset: number): number {
  return view.getUint32(offset, false);
}

function byteAt(bytes: Uint8Array, offset: number, fallback = 0): number {
  return bytes[offset] ?? fallback;
}

function uint32LE(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array, start: number, end: number): number {
  let value = 0xffffffff;
  for (let index = start; index < end; index += 1) value = CRC_TABLE[(value ^ (bytes[index] ?? 0)) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function withinBounds(width: number, height: number): LogoValidation | null {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    return { ok: false, code: 'malformed', detail: 'The image dimensions are not positive integers.' };
  }
  if (width > MAX_LOGO_DIMENSION || height > MAX_LOGO_DIMENSION) {
    return { ok: false, code: 'too-large-dimension', detail: `Maximum dimension is ${MAX_LOGO_DIMENSION}px.` };
  }
  if (width * height > MAX_LOGO_PIXELS) {
    return { ok: false, code: 'too-many-pixels', detail: `Maximum decoded area is ${MAX_LOGO_PIXELS} pixels.` };
  }
  return null;
}

function pngMetadata(bytes: Uint8Array): LogoValidation {
  if (bytes.length < 57) return { ok: false, code: 'malformed', detail: 'The PNG header or required chunks are incomplete.' };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0;
  let height = 0;
  let colorType = -1;
  let bitDepth = -1;
  let hasAlpha = false;
  let seenIHDR = false;
  let seenIDAT = false;
  let seenIEND = false;
  let seenPLTE = false;
  let frameCount = 1;
  let offset = 8;
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) return { ok: false, code: 'malformed', detail: 'A PNG chunk header is truncated.' };
    const length = uint32(view, offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const next = offset + 12 + length;
    if (next < offset || next > bytes.length) {
      return { ok: false, code: 'malformed', detail: 'A PNG chunk exceeds the supplied byte payload.' };
    }
    const expectedCrc = uint32(view, next - 4);
    const actualCrc = crc32(bytes, offset + 4, offset + 8 + length);
    if (expectedCrc !== actualCrc) return { ok: false, code: 'malformed', detail: `PNG chunk ${type} has an invalid CRC.` };
    if (!/^[A-Za-z]{4}$/u.test(type)) return { ok: false, code: 'malformed', detail: 'A PNG chunk type is invalid.' };
    const dataStart = offset + 8;
    if (!seenIHDR && type !== 'IHDR') return { ok: false, code: 'malformed', detail: 'PNG IHDR must be the first chunk.' };
    if (type === 'IHDR') {
      if (seenIHDR || length !== 13) return { ok: false, code: 'malformed', detail: 'PNG must contain exactly one 13-byte IHDR.' };
      seenIHDR = true;
      width = uint32(view, dataStart);
      height = uint32(view, dataStart + 4);
      bitDepth = bytes[dataStart + 8] ?? -1;
      colorType = bytes[dataStart + 9] ?? -1;
      if ((bytes[dataStart + 10] ?? -1) !== 0 || (bytes[dataStart + 11] ?? -1) !== 0 || ((bytes[dataStart + 12] ?? -1) !== 0 && (bytes[dataStart + 12] ?? -1) !== 1)) {
        return { ok: false, code: 'malformed', detail: 'PNG compression, filter, or interlace method is unsupported.' };
      }
      const validDepths: Record<number, number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
      if (!validDepths[colorType]?.includes(bitDepth)) return { ok: false, code: 'malformed', detail: 'PNG bit depth and colour type are not a valid pair.' };
      const dimensionError = withinBounds(width, height);
      if (dimensionError) return dimensionError;
      hasAlpha = colorType === 4 || colorType === 6;
    } else if (type === 'PLTE') {
      if (seenIDAT || seenPLTE || length === 0 || length % 3 !== 0 || length > 768) return { ok: false, code: 'malformed', detail: 'PNG PLTE is missing, late, or malformed.' };
      seenPLTE = true;
    } else if (type === 'tRNS') {
      const validTransparencyLength = colorType === 3 ? seenPLTE && length <= 256 : colorType === 0 ? length <= 2 : colorType === 2 ? length <= 6 : false;
      if (seenIDAT || !validTransparencyLength || colorType === 4 || colorType === 6) return { ok: false, code: 'malformed', detail: 'PNG tRNS is late, oversized, or invalid for this colour type.' };
      hasAlpha = true;
    } else if (type === 'IDAT') {
      if (colorType === 3 && !seenPLTE) return { ok: false, code: 'malformed', detail: 'PNG palette data must precede IDAT.' };
      seenIDAT = true;
    } else if (type === 'acTL' || type === 'fcTL' || type === 'fdAT') {
      frameCount = 2;
    } else if (type === 'IEND') {
      if (length !== 0 || !seenIDAT || (colorType === 3 && !seenPLTE)) return { ok: false, code: 'malformed', detail: 'PNG IEND arrived before required image chunks.' };
      seenIEND = true;
    } else if (type.charCodeAt(0) >= 65 && type.charCodeAt(0) <= 90) {
      return { ok: false, code: 'unsupported-format', detail: `Unsupported critical PNG chunk ${type}.` };
    }
    offset = next;
    if (seenIEND) break;
  }
  if (!seenIEND || offset !== bytes.length || !seenIHDR || !seenIDAT) return { ok: false, code: 'malformed', detail: 'PNG must end with one validated IEND chunk.' };
  if (frameCount > MAX_LOGO_FRAMES) return { ok: false, code: 'animated', detail: 'Animated PNG input is not accepted.' };
  return { ok: true, mimeType: 'image/png', byteLength: bytes.length, width, height, hasAlpha, frameCount: 1 };
}

function jpegMetadata(bytes: Uint8Array): LogoValidation {
  if (bytes.length < 4 || byteAt(bytes, 0) !== 0xff || byteAt(bytes, 1) !== 0xd8 || byteAt(bytes, bytes.length - 2) !== 0xff || byteAt(bytes, bytes.length - 1) !== 0xd9) {
    return { ok: false, code: 'malformed', detail: 'The JPEG signature is incomplete.' };
  }
  let offset = 2;
  let width = 0;
  let height = 0;
  let sawFrame = false;
  let sawSos = false;
  while (offset + 3 < bytes.length) {
    if (byteAt(bytes, offset) !== 0xff) {
      if (sawSos) { offset += 1; continue; }
      return { ok: false, code: 'malformed', detail: 'JPEG segment alignment is invalid.' };
    }
    while (offset < bytes.length && byteAt(bytes, offset) === 0xff) offset += 1;
    const marker = byteAt(bytes, offset);
    offset += 1;
    if (marker === 0xd9) break;
    if (marker === 0xda) {
      if (offset + 2 > bytes.length) return { ok: false, code: 'malformed', detail: 'JPEG scan header is truncated.' };
      const length = (byteAt(bytes, offset) << 8) | byteAt(bytes, offset + 1);
      if (length < 2 || offset + length > bytes.length) return { ok: false, code: 'malformed', detail: 'JPEG scan segment length is invalid.' };
      sawSos = true;
      offset += length;
      // Entropy data may contain stuffed FF 00 bytes and fill FF bytes. Walk
      // it explicitly until the final EOI marker, never treating arbitrary
      // bytes as another segment header.
      while (offset + 1 < bytes.length) {
        if (byteAt(bytes, offset) !== 0xff) { offset += 1; continue; }
        let markerOffset = offset;
        while (markerOffset < bytes.length && byteAt(bytes, markerOffset) === 0xff) markerOffset += 1;
        const entropyMarker = byteAt(bytes, markerOffset);
        if (entropyMarker === 0x00) { offset = markerOffset + 1; continue; }
        if (entropyMarker !== 0xd9) return { ok: false, code: 'malformed', detail: 'JPEG entropy data contains an unexpected marker.' };
        offset = markerOffset + 1;
        break;
      }
      break;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) return { ok: false, code: 'malformed', detail: 'JPEG segment length is truncated.' };
    const length = (byteAt(bytes, offset) << 8) | byteAt(bytes, offset + 1);
    if (length < 2 || offset + length > bytes.length) return { ok: false, code: 'malformed', detail: 'JPEG segment length is invalid.' };
    const isFrame = (marker >= 0xc0 && marker <= 0xc3)
      || (marker >= 0xc5 && marker <= 0xc7)
      || (marker >= 0xc9 && marker <= 0xcb)
      || (marker >= 0xcd && marker <= 0xcf);
    if (isFrame) {
      if (sawFrame || length < 7 || byteAt(bytes, offset + 2) !== 8) return { ok: false, code: 'malformed', detail: 'JPEG frame precision or frame ordering is unsupported.' };
      height = (byteAt(bytes, offset + 3) << 8) | byteAt(bytes, offset + 4);
      width = (byteAt(bytes, offset + 5) << 8) | byteAt(bytes, offset + 6);
      const bounds = withinBounds(width, height);
      if (bounds) return bounds;
      sawFrame = true;
    }
    offset += length;
  }
  if (!sawFrame || !sawSos || offset !== bytes.length) return { ok: false, code: 'malformed', detail: 'JPEG must contain one frame, one scan, and a final EOI marker.' };
  return { ok: true, mimeType: 'image/jpeg', byteLength: bytes.length, width, height, hasAlpha: false, frameCount: 1 };
}

function webpMetadata(bytes: Uint8Array): LogoValidation {
  if (bytes.length < 20) return { ok: false, code: 'malformed', detail: 'The WebP RIFF header is incomplete.' };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (byteAt(bytes, 0) !== 0x52 || byteAt(bytes, 1) !== 0x49 || byteAt(bytes, 2) !== 0x46 || byteAt(bytes, 3) !== 0x46 || uint32LE(view, 4) !== bytes.length - 8 || byteAt(bytes, 8) !== 0x57 || byteAt(bytes, 9) !== 0x45 || byteAt(bytes, 10) !== 0x42 || byteAt(bytes, 11) !== 0x50) return { ok: false, code: 'malformed', detail: 'WebP RIFF size or signature is invalid.' };
  let offset = 12;
  let width = 0;
  let height = 0;
  let hasAlpha = false;
  let sawImage = false;
  let animated = false;
  let extended = false;
  let extendedWidth = 0;
  let extendedHeight = 0;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) return { ok: false, code: 'malformed', detail: 'WebP chunk header is truncated.' };
    const type = String.fromCharCode(...bytes.subarray(offset, offset + 4));
    const length = uint32LE(view, offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const paddedEnd = dataEnd + (length % 2);
    if (dataEnd < dataStart || paddedEnd > bytes.length) return { ok: false, code: 'malformed', detail: `WebP chunk ${type} exceeds the RIFF payload.` };
    if (type === 'VP8X') {
      if (extended || length !== 10) return { ok: false, code: 'malformed', detail: 'WebP VP8X extension is duplicated or malformed.' };
      extended = true;
      const flags = byteAt(bytes, dataStart);
      if ((flags & 0x01) !== 0) return { ok: false, code: 'malformed', detail: 'WebP VP8X reserved flag is set.' };
      if ((flags & 0x02) !== 0) animated = true;
      hasAlpha = (flags & 0x10) !== 0;
      width = 1 + byteAt(bytes, dataStart + 4) + (byteAt(bytes, dataStart + 5) << 8) + (byteAt(bytes, dataStart + 6) << 16);
      height = 1 + byteAt(bytes, dataStart + 7) + (byteAt(bytes, dataStart + 8) << 8) + (byteAt(bytes, dataStart + 9) << 16);
      extendedWidth = width;
      extendedHeight = height;
    } else if (type === 'VP8 ') {
      if (length < 10 || byteAt(bytes, dataStart + 3) !== 0x9d || byteAt(bytes, dataStart + 4) !== 0x01 || byteAt(bytes, dataStart + 5) !== 0x2a) return { ok: false, code: 'malformed', detail: 'WebP VP8 image header is invalid.' };
      if (sawImage) return { ok: false, code: 'malformed', detail: 'WebP contains more than one image chunk.' };
      width = view.getUint16(dataStart + 6, true) & 0x3fff;
      height = view.getUint16(dataStart + 8, true) & 0x3fff;
      sawImage = true;
    } else if (type === 'VP8L') {
      if (length < 5 || byteAt(bytes, dataStart) !== 0x2f) return { ok: false, code: 'malformed', detail: 'WebP VP8L image header is invalid.' };
      const bits = byteAt(bytes, dataStart + 1) | (byteAt(bytes, dataStart + 2) << 8) | (byteAt(bytes, dataStart + 3) << 16) | (byteAt(bytes, dataStart + 4) << 24);
      if (sawImage) return { ok: false, code: 'malformed', detail: 'WebP contains more than one image chunk.' };
      width = 1 + (bits & 0x3fff);
      height = 1 + ((bits >>> 14) & 0x3fff);
      hasAlpha = true;
      sawImage = true;
    } else if (type === 'ANIM' || type === 'ANMF') {
      animated = true;
    }
    offset = paddedEnd;
  }
  if (animated) return { ok: false, code: 'animated', detail: 'Animated WebP input is not accepted.' };
  if (!sawImage || (extended && (width < 1 || height < 1 || width !== extendedWidth || height !== extendedHeight))) return { ok: false, code: 'malformed', detail: 'WebP must contain one image matching its VP8X canvas.' };
  const bounds = withinBounds(width, height);
  if (bounds) return bounds;
  return { ok: true, mimeType: 'image/webp', byteLength: bytes.length, width, height, hasAlpha, frameCount: 1 };
}

/** Inspect the signature and bounded metadata without invoking a decoder. */
export function validateLogoBytes(input: ArrayBuffer | Uint8Array): LogoValidation {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length === 0) return { ok: false, code: 'empty', detail: 'The selected file is empty.' };
  if (bytes.length > MAX_LOGO_SOURCE_BYTES) return { ok: false, code: 'too-large', detail: `The selected file exceeds ${MAX_LOGO_SOURCE_BYTES} bytes.` };
  if (bytes.length >= 8
    && byteAt(bytes, 0) === 0x89 && byteAt(bytes, 1) === 0x50 && byteAt(bytes, 2) === 0x4e && byteAt(bytes, 3) === 0x47
    && byteAt(bytes, 4) === 0x0d && byteAt(bytes, 5) === 0x0a && byteAt(bytes, 6) === 0x1a && byteAt(bytes, 7) === 0x0a) {
    return pngMetadata(bytes);
  }
  if (bytes.length >= 12
    && byteAt(bytes, 0) === 0x52 && byteAt(bytes, 1) === 0x49 && byteAt(bytes, 2) === 0x46 && byteAt(bytes, 3) === 0x46
    && byteAt(bytes, 8) === 0x57 && byteAt(bytes, 9) === 0x45 && byteAt(bytes, 10) === 0x42 && byteAt(bytes, 11) === 0x50) {
    return webpMetadata(bytes);
  }
  if (bytes.length >= 2 && byteAt(bytes, 0) === 0xff && byteAt(bytes, 1) === 0xd8) return jpegMetadata(bytes);
  return { ok: false, code: 'unsupported-format', detail: 'Accepted custom formats are static PNG, JPEG, and WebP.' };
}

export function normalizeLogoCrop(crop: Partial<LogoCrop> | null | undefined): LogoCrop {
  const finite = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  const x = Math.min(0.99, Math.max(0, finite(crop?.x, 0)));
  const y = Math.min(0.99, Math.max(0, finite(crop?.y, 0)));
  const width = Math.min(1 - x, Math.max(0.01, finite(crop?.width, 1)));
  const height = Math.min(1 - y, Math.max(0.01, finite(crop?.height, 1)));
  return { x, y, width, height };
}

function normalizeCachedPngAsset(value: unknown, expectedWidth?: number, expectedHeight?: number): LogoCustomAsset | LogoVariantAsset | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<LogoCustomAsset>;
  if (raw.mimeType !== 'image/png' || typeof raw.dataUrl !== 'string' || !raw.dataUrl.startsWith('data:image/png;base64,') || raw.dataUrl.length > MAX_LOGO_OUTPUT_BYTES * 2) return null;
  try {
    const encoded = raw.dataUrl.slice(raw.dataUrl.indexOf(',') + 1);
    const bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
    const validation = validateLogoBytes(bytes);
    if (!validation.ok || validation.mimeType !== 'image/png' || validation.frameCount !== 1 || bytes.length > MAX_LOGO_OUTPUT_BYTES) return null;
    if (expectedWidth !== undefined && validation.width !== expectedWidth) return null;
    if (expectedHeight !== undefined && validation.height !== expectedHeight) return null;
    return {
      dataUrl: raw.dataUrl,
      mimeType: 'image/png',
      byteLength: bytes.length,
      width: validation.width,
      height: validation.height,
      hasAlpha: validation.hasAlpha,
      frameCount: 1,
    };
  } catch {
    return null;
  }
}

function normalizePrivateSource(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > MAX_LOGO_SOURCE_BYTES * 2 || !/^data:image\/(?:png|jpeg|webp);base64,/iu.test(value)) return undefined;
  try {
    const comma = value.indexOf(',');
    const bytes = Uint8Array.from(atob(value.slice(comma + 1)), (char) => char.charCodeAt(0));
    const validation = validateLogoBytes(bytes);
    return validation.ok ? value : undefined;
  } catch {
    return undefined;
  }
}

export function normalizeLogoState(value: unknown): LogoState {
  if (!value || typeof value !== 'object') return { ...DEFAULT_LOGO_STATE };
  const raw = value as Partial<LogoState>;
  if (raw.schemaVersion !== undefined && raw.schemaVersion !== LOGO_SCHEMA_VERSION) return { ...DEFAULT_LOGO_STATE };
  const presetId = LOGO_PRESETS.some((preset) => preset.id === raw.presetId)
    ? raw.presetId as LogoPreset['id']
    : DEFAULT_LOGO_STATE.presetId;
  let custom: LogoCustomAsset | null = null;
  const cachedBase = normalizeCachedPngAsset(
    raw.custom,
    typeof raw.custom?.width === 'number' ? raw.custom.width : undefined,
    typeof raw.custom?.height === 'number' ? raw.custom.height : undefined,
  );
  if (raw.custom && cachedBase && raw.custom.variants === undefined) return { ...DEFAULT_LOGO_STATE };
  if (cachedBase) {
    const rawVariants = raw.custom && typeof raw.custom === 'object' ? raw.custom.variants : undefined;
    let variants: NonNullable<LogoCustomAsset['variants']> | undefined;
    if (rawVariants !== undefined) {
      if (!rawVariants || typeof rawVariants !== 'object') return { ...DEFAULT_LOGO_STATE };
      const nextVariants: NonNullable<LogoCustomAsset['variants']> = {};
      for (const target of LOGO_DISPLAY_TARGETS) {
        const candidate = normalizeCachedPngAsset((rawVariants as Record<string, unknown>)[target.id], target.width, target.height);
        if (!candidate) return { ...DEFAULT_LOGO_STATE };
        nextVariants[target.id] = candidate as LogoVariantAsset;
      }
      const aggregateBytes = (cachedBase as LogoCustomAsset).byteLength + Object.values(nextVariants).reduce((total, asset) => total + (asset?.byteLength ?? 0), 0);
      if (aggregateBytes > MAX_LOGO_AGGREGATE_BYTES) return { ...DEFAULT_LOGO_STATE };
      variants = nextVariants;
    }
    const rawCustom = raw.custom as Partial<LogoCustomAsset>;
    const sourceMimeType = rawCustom.sourceMimeType === 'image/png'
      || rawCustom.sourceMimeType === 'image/jpeg'
      || rawCustom.sourceMimeType === 'image/webp'
      ? rawCustom.sourceMimeType
      : 'image/png';
    const losses = Array.isArray(rawCustom.losses)
      ? rawCustom.losses.filter((entry): entry is NonNullable<LogoCustomAsset['losses']>[number] =>
        entry === 'format' || entry === 'metadata' || entry === 'profile' || entry === 'crop' || entry === 'transparency')
      : undefined;
    custom = {
      ...(cachedBase as LogoCustomAsset),
      sourceMimeType,
      sourceHasAlpha: typeof rawCustom.sourceHasAlpha === 'boolean' ? rawCustom.sourceHasAlpha : (cachedBase as LogoCustomAsset).hasAlpha,
      sourceDataUrl: normalizePrivateSource(rawCustom.sourceDataUrl),
      losses,
      renderFingerprint: typeof rawCustom.renderFingerprint === 'string' ? rawCustom.renderFingerprint.slice(0, 256) : undefined,
      variants,
    };
  }
  const fit: LogoFit = raw.fit === 'cover' || raw.fit === 'fill' ? raw.fit : 'contain';
  const focalX = typeof raw.focalPoint?.x === 'number' && Number.isFinite(raw.focalPoint.x) ? raw.focalPoint.x : 0.5;
  const focalY = typeof raw.focalPoint?.y === 'number' && Number.isFinite(raw.focalPoint.y) ? raw.focalPoint.y : 0.5;
  const focalPoint = {
    x: Math.min(1, Math.max(0, focalX)),
    y: Math.min(1, Math.max(0, focalY)),
  };
  const background = raw.background === 'transparent' || raw.background === 'rainbow'
    ? raw.background
    : typeof raw.background === 'string' && /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/iu.test(raw.background)
      ? raw.background.toLowerCase()
      : DEFAULT_LOGO_STATE.background;
  const schedules: LogoScheduleRule[] = [];
  if (Array.isArray(raw.schedules)) {
    for (const candidate of raw.schedules.slice(0, 12)) {
      if (!candidate || typeof candidate !== 'object') continue;
      const schedule = candidate as Partial<LogoScheduleRule>;
      if (typeof schedule.id !== 'string' || !schedule.id.trim() || typeof schedule.startAt !== 'string' || typeof schedule.endAt !== 'string') continue;
      const weekdays = Array.isArray(schedule.weekdays)
        ? schedule.weekdays.filter((day): day is number => Number.isInteger(day) && day >= 0 && day <= 6)
        : [0, 1, 2, 3, 4, 5, 6];
      const patch = schedule.patch && typeof schedule.patch === 'object' ? schedule.patch : {};
      schedules.push({
        id: schedule.id.slice(0, 80),
        label: typeof schedule.label === 'string' && schedule.label.trim() ? schedule.label.trim().slice(0, 120) : schedule.id.slice(0, 80),
        enabled: schedule.enabled !== false,
        startAt: schedule.startAt.slice(0, 32),
        endAt: schedule.endAt.slice(0, 32),
        weekdays: weekdays.length ? Array.from(new Set(weekdays)) : [0, 1, 2, 3, 4, 5, 6],
        timezone: typeof schedule.timezone === 'string' && schedule.timezone.trim() ? schedule.timezone.slice(0, 80) : 'local',
        patch: {
          ...(LOGO_PRESETS.some((preset) => preset.id === patch.presetId) ? { presetId: patch.presetId } : {}),
          ...(patch.fit === 'contain' || patch.fit === 'cover' || patch.fit === 'fill' ? { fit: patch.fit } : {}),
          ...(patch.background === 'transparent' || patch.background === 'rainbow' || (typeof patch.background === 'string' && /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/iu.test(patch.background)) ? { background: patch.background } : {}),
          ...(typeof patch.rainbowSpeedLevel === 'number' && Number.isFinite(patch.rainbowSpeedLevel) ? { rainbowSpeedLevel: Math.min(5, Math.max(1, Math.round(patch.rainbowSpeedLevel))) } : {}),
          ...(patch.crop && typeof patch.crop === 'object' ? { crop: normalizeLogoCrop(patch.crop) } : {}),
          ...(patch.focalPoint && typeof patch.focalPoint === 'object' && typeof patch.focalPoint.x === 'number' && typeof patch.focalPoint.y === 'number' ? { focalPoint: { x: Math.min(1, Math.max(0, patch.focalPoint.x)), y: Math.min(1, Math.max(0, patch.focalPoint.y)) } } : {}),
          ...(typeof patch.safeArea === 'boolean' ? { safeArea: patch.safeArea } : {}),
        },
      });
    }
  }
  return {
    ...DEFAULT_LOGO_STATE,
    presetId,
    custom,
    fit,
    crop: normalizeLogoCrop(raw.crop),
    focalPoint,
    background,
    safeArea: raw.safeArea !== false,
    rainbowSpeedLevel: typeof raw.rainbowSpeedLevel === 'number' && Number.isFinite(raw.rainbowSpeedLevel) ? Math.min(5, Math.max(1, Math.round(raw.rainbowSpeedLevel))) : DEFAULT_LOGO_STATE.rainbowSpeedLevel,
    schedules,
  };
}

/** Resolve the last matching local schedule without any network source. */
export function resolveScheduledLogoState(state: LogoState, now: Date = new Date()): LogoState {
  const timestamp = now.getTime();
  let resolved = state;
  for (const rule of state.schedules) {
    if (!rule.enabled) continue;
    const start = Date.parse(rule.startAt);
    const end = Date.parse(rule.endAt);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || timestamp < start || timestamp >= end || !rule.weekdays.includes(now.getDay())) continue;
    resolved = normalizeLogoState({
      ...resolved,
      ...rule.patch,
      ...(rule.patch.presetId ? { custom: null } : {}),
      schedules: state.schedules,
    });
  }
  return resolved;
}

export function readStoredLogoState(): LogoState {
  if (typeof window === 'undefined') return { ...DEFAULT_LOGO_STATE };
  try {
    const raw = window.localStorage.getItem(LOGO_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_LOGO_STATE };
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || (parsed as { schemaVersion?: unknown }).schemaVersion !== LOGO_SCHEMA_VERSION) {
      return { ...DEFAULT_LOGO_STATE };
    }
    return normalizeLogoState(parsed);
  } catch {
    return { ...DEFAULT_LOGO_STATE };
  }
}

export type LogoFileParseResult =
  | { ok: true; state: LogoState }
  | { ok: false; code: 'not-json' | 'wrong-kind' | 'future-version' | 'unknown-schema' | 'malformed' };

export function serializeLogoState(state: LogoState): string {
  const sanitized = redactLogoStateForDaemon(normalizeLogoState(state));
  return `${JSON.stringify({ kind: LOGO_FILE_KIND, version: LOGO_FILE_VERSION, state: sanitized }, null, 2)}\n`;
}

export function parseLogoStateFile(text: string): LogoFileParseResult {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return { ok: false, code: 'not-json' }; }
  if (!parsed || typeof parsed !== 'object') return { ok: false, code: 'wrong-kind' };
  const file = parsed as Record<string, unknown>;
  if (file.kind !== LOGO_FILE_KIND) return { ok: false, code: 'wrong-kind' };
  if (file.version !== LOGO_FILE_VERSION) return { ok: false, code: file.version > LOGO_FILE_VERSION ? 'future-version' : 'unknown-schema' };
  if (!file.state || typeof file.state !== 'object') return { ok: false, code: 'malformed' };
  const state = file.state as Record<string, unknown>;
  if (state.schemaVersion !== LOGO_SCHEMA_VERSION) return { ok: false, code: 'unknown-schema' };
  const allowedStateKeys = new Set(['schemaVersion', 'presetId', 'custom', 'fit', 'crop', 'focalPoint', 'background', 'safeArea', 'rainbowSpeedLevel', 'schedules']);
  if (Object.keys(state).some((key) => !allowedStateKeys.has(key))) return { ok: false, code: 'malformed' };
  if (!LOGO_PRESETS.some((preset) => preset.id === state.presetId)
    || (state.fit !== 'contain' && state.fit !== 'cover' && state.fit !== 'fill')
    || !state.crop || typeof state.crop !== 'object'
    || !state.focalPoint || typeof state.focalPoint !== 'object'
    || typeof state.rainbowSpeedLevel !== 'number' || !Number.isInteger(state.rainbowSpeedLevel) || state.rainbowSpeedLevel < 1 || state.rainbowSpeedLevel > 5
    || (state.background !== 'transparent' && state.background !== 'rainbow' && !(typeof state.background === 'string' && /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/iu.test(state.background)))) {
    return { ok: false, code: 'malformed' };
  }
  if (state.custom !== null) {
    if (!state.custom || typeof state.custom !== 'object' || Array.isArray(state.custom)) return { ok: false, code: 'malformed' };
    const customKeys = new Set(['dataUrl', 'mimeType', 'byteLength', 'width', 'height', 'hasAlpha', 'frameCount', 'sourceMimeType', 'sourceHasAlpha', 'losses', 'renderFingerprint', 'sourceDataUrl', 'variants']);
    if (Object.keys(state.custom).some((key) => !customKeys.has(key))) return { ok: false, code: 'malformed' };
  }
  if (!Array.isArray(state.schedules) || state.schedules.length > 12 || state.schedules.some((rule) => {
    if (!rule || typeof rule !== 'object' || Array.isArray(rule)) return true;
    const candidate = rule as Record<string, unknown>;
    return typeof candidate.id !== 'string' || !candidate.id || candidate.id.length > 80
      || typeof candidate.label !== 'string' || !candidate.label || candidate.label.length > 120
      || typeof candidate.enabled !== 'boolean' || typeof candidate.startAt !== 'string' || typeof candidate.endAt !== 'string'
      || !Number.isFinite(Date.parse(candidate.startAt)) || !Number.isFinite(Date.parse(candidate.endAt))
      || Date.parse(candidate.endAt) <= Date.parse(candidate.startAt) || typeof candidate.timezone !== 'string' || !candidate.timezone
      || !Array.isArray(candidate.weekdays) || candidate.weekdays.length === 0 || candidate.weekdays.length > 7
      || candidate.weekdays.some((day) => !Number.isInteger(day) || (day as number) < 0 || (day as number) > 6)
      || !candidate.patch || typeof candidate.patch !== 'object' || Array.isArray(candidate.patch)
      || Object.keys(candidate.patch as object).some((key) => !['presetId', 'fit', 'background', 'safeArea', 'rainbowSpeedLevel', 'crop', 'focalPoint'].includes(key))
      || ((candidate.patch as Record<string, unknown>).presetId !== undefined && !LOGO_PRESETS.some((preset) => preset.id === (candidate.patch as Record<string, unknown>).presetId))
      || ((candidate.patch as Record<string, unknown>).fit !== undefined && !['contain', 'cover', 'fill'].includes(String((candidate.patch as Record<string, unknown>).fit)))
      || ((candidate.patch as Record<string, unknown>).safeArea !== undefined && typeof (candidate.patch as Record<string, unknown>).safeArea !== 'boolean')
      || ((candidate.patch as Record<string, unknown>).crop !== undefined && (!(candidate.patch as Record<string, unknown>).crop || typeof (candidate.patch as Record<string, unknown>).crop !== 'object' || Array.isArray((candidate.patch as Record<string, unknown>).crop)))
      || ((candidate.patch as Record<string, unknown>).focalPoint !== undefined && (!(candidate.patch as Record<string, unknown>).focalPoint || typeof (candidate.patch as Record<string, unknown>).focalPoint !== 'object' || Array.isArray((candidate.patch as Record<string, unknown>).focalPoint)))
      || ((candidate.patch as Record<string, unknown>).background !== undefined && (candidate.patch as Record<string, unknown>).background !== 'transparent' && (candidate.patch as Record<string, unknown>).background !== 'rainbow' && !(typeof (candidate.patch as Record<string, unknown>).background === 'string' && /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/iu.test((candidate.patch as Record<string, unknown>).background as string)));
  })) return { ok: false, code: 'malformed' };
  const normalized = normalizeLogoState(state);
  if (state.custom !== null && normalized.custom === null) return { ok: false, code: 'malformed' };
  if (Array.isArray(state.schedules) && normalized.schedules.length !== state.schedules.length) return { ok: false, code: 'malformed' };
  return { ok: true, state: normalized };
}

export function writeStoredLogoState(state: LogoState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOGO_STORAGE_KEY, JSON.stringify(normalizeLogoState(state)));
  } catch {
    // Storage denial never replaces the active in-memory selection.
  }
}

/** Remove the original source before mirroring presentation state to daemon config. */
export function redactLogoStateForDaemon(state: LogoState): LogoState {
  if (!state.custom) return state;
  const custom = { ...state.custom };
  delete custom.sourceDataUrl;
  return { ...state, custom };
}

export function clearStoredLogoState(): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.removeItem(LOGO_STORAGE_KEY); } catch { /* private mode */ }
}

export interface LogoMutationHistoryEntry {
  changedAt: number;
  action: 'selected-preset' | 'uploaded-custom' | 'updated' | 'reset';
  presetId: LogoPreset['id'];
  customActive: boolean;
  fit: LogoFit;
  background: LogoState['background'];
  safeArea: boolean;
}

/** Record only redacted presentation metadata, never image bytes or paths. */
export function recordLogoMutation(
  action: LogoMutationHistoryEntry['action'],
  state: LogoState,
): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(LOGO_HISTORY_STORAGE_KEY);
    const prior: LogoMutationHistoryEntry[] = raw ? JSON.parse(raw) : [];
    const history = Array.isArray(prior) ? prior.slice(-99) : [];
    history.push({
      changedAt: Date.now(),
      action,
      presetId: state.presetId,
      customActive: state.custom !== null,
      fit: state.fit,
      background: state.background,
      safeArea: state.safeArea,
    });
    window.localStorage.setItem(LOGO_HISTORY_STORAGE_KEY, JSON.stringify(history));
  } catch {
    // History failure never blocks the presentation change and never leaks the source.
  }
}

/** Apply only presentation values. Stable app identity is intentionally absent. */
export function applyLogoStateToDocument(state: LogoState): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.logoPreset = state.custom ? 'custom' : state.presetId;
  root.dataset.logoFit = state.fit;
  root.dataset.logoSafeArea = state.safeArea ? 'on' : 'off';
  root.dataset.logoRainbow = state.background === 'rainbow' ? 'on' : 'off';
  root.style.setProperty('--app-logo-background', state.background === 'rainbow' ? 'linear-gradient(120deg, hsl(0 90% 60%), hsl(120 90% 60%), hsl(240 90% 60%), hsl(360 90% 60%))' : state.background === 'transparent' ? 'transparent' : state.background);
  root.style.setProperty('--app-logo-rainbow-speed', `${[0, 24, 18, 12, 8, 5][state.rainbowSpeedLevel] ?? 12}s`);
  root.style.setProperty('--app-logo-focal-x', `${Math.round(state.focalPoint.x * 100)}%`);
  root.style.setProperty('--app-logo-focal-y', `${Math.round(state.focalPoint.y * 100)}%`);
  const source = state.custom?.dataUrl ?? LOGO_PRESETS.find((preset) => preset.id === state.presetId)?.src ?? LOGO_PRESETS[0].src;
  root.style.setProperty('--app-logo-image', `url(${JSON.stringify(source)})`);
}

export async function fileToValidatedBytes(file: File): Promise<{ bytes: Uint8Array; validation: LogoValidation }> {
  if (file.size > MAX_LOGO_SOURCE_BYTES) {
    return { bytes: new Uint8Array(), validation: { ok: false, code: 'too-large', detail: `The selected file exceeds ${MAX_LOGO_SOURCE_BYTES} bytes.` } };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  return { bytes, validation: validateLogoBytes(bytes) };
}

function dataUrlToByteLength(dataUrl: string): number {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return 0;
  const encoded = dataUrl.slice(comma + 1);
  return Math.floor(encoded.replace(/=/g, '').length * 3 / 4);
}

async function withDecodeDeadline<T>(task: Promise<T>, message: string): Promise<T> {
  let timer: number | undefined;
  try {
    return await Promise.race([task, new Promise<never>((_resolve, reject) => {
      timer = window.setTimeout(() => reject(new Error(message)), MAX_LOGO_DECODE_TIME_MS);
    })]);
  } finally {
    if (timer !== undefined) window.clearTimeout(timer);
  }
}

async function fileToDataUrl(file: File): Promise<string> {
  return await withDecodeDeadline(new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('The local source could not be retained safely.'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  }), 'Local source retention exceeded the bounded time limit.');
}

export async function convertLogoFile(
  file: File,
  options: LogoRenderOptions | LogoCrop = {
    crop: DEFAULT_LOGO_STATE.crop,
    fit: DEFAULT_LOGO_STATE.fit,
    focalPoint: DEFAULT_LOGO_STATE.focalPoint,
    safeArea: DEFAULT_LOGO_STATE.safeArea,
    background: DEFAULT_LOGO_STATE.background,
    outputSize: 512,
  },
): Promise<LogoCustomAsset> {
  const renderOptions: LogoRenderOptions = 'fit' in options
    ? { ...options, crop: normalizeLogoCrop(options.crop) }
    : {
      crop: normalizeLogoCrop(options),
      fit: DEFAULT_LOGO_STATE.fit,
      focalPoint: DEFAULT_LOGO_STATE.focalPoint,
      safeArea: DEFAULT_LOGO_STATE.safeArea,
      background: DEFAULT_LOGO_STATE.background,
      outputSize: 512,
    };
  const { validation } = await fileToValidatedBytes(file);
  if (!validation.ok) throw new Error(validation.detail);
  const sourceDataUrl = await fileToDataUrl(file);
  if (typeof createImageBitmap !== 'function') throw new Error('This browser cannot decode local images safely.');
  const bitmapPromise = createImageBitmap(file);
  let decodeTimer: number | undefined;
  const bitmap = await Promise.race([
    bitmapPromise,
    new Promise<never>((_resolve, reject) => {
      decodeTimer = window.setTimeout(() => reject(new Error('Local image decoding exceeded the bounded time limit.')), MAX_LOGO_DECODE_TIME_MS);
    }),
  ]).catch((error) => {
    // If the platform decoder settles after the deadline, close its result so
    // a decompression-bomb-shaped input cannot retain a native bitmap.
    if (decodeTimer !== undefined) window.clearTimeout(decodeTimer);
    void bitmapPromise.then((lateBitmap) => lateBitmap.close(), () => undefined);
    throw error;
  });
  if (decodeTimer !== undefined) window.clearTimeout(decodeTimer);
  try {
    if (bitmap.width !== validation.width || bitmap.height !== validation.height) {
      throw new Error('The decoded dimensions do not match the validated image header.');
    }
    const crop = renderOptions.crop;
    const sourceX = Math.round(bitmap.width * crop.x);
    const sourceY = Math.round(bitmap.height * crop.y);
    const sourceWidth = Math.max(1, Math.round(bitmap.width * crop.width));
    const sourceHeight = Math.max(1, Math.round(bitmap.height * crop.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.min(MAX_LOGO_DIMENSION, Math.max(1, renderOptions.outputSize ?? 512));
    canvas.height = canvas.width;
    const context = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
    if (!context) throw new Error('The local image decoder could not create a safe pixel surface.');
    const draw = (width: number, height: number) => {
      context.clearRect(0, 0, width, height);
      if (renderOptions.background !== 'transparent' && renderOptions.background !== 'rainbow') {
        context.fillStyle = renderOptions.background;
        context.fillRect(0, 0, width, height);
      }
      const targetRatio = width / height;
      const sourceRatio = sourceWidth / sourceHeight;
      let sx = sourceX;
      let sy = sourceY;
      let sw = sourceWidth;
      let sh = sourceHeight;
      if (renderOptions.fit === 'cover') {
        if (sourceRatio > targetRatio) {
          sw = sourceHeight * targetRatio;
          sx += (sourceWidth - sw) * Math.min(1, Math.max(0, renderOptions.focalPoint.x));
        } else if (sourceRatio < targetRatio) {
          sh = sourceWidth / targetRatio;
          sy += (sourceHeight - sh) * Math.min(1, Math.max(0, renderOptions.focalPoint.y));
        }
      }
      const inset = renderOptions.safeArea ? 0.12 : 0;
      if (renderOptions.fit === 'contain') {
        const scale = Math.min((width * (1 - inset * 2)) / sw, (height * (1 - inset * 2)) / sh);
        const dw = sw * scale;
        const dh = sh * scale;
        context.drawImage(bitmap, sx, sy, sw, sh, (width - dw) / 2, (height - dh) / 2, dw, dh);
      } else {
        context.drawImage(bitmap, sx, sy, sw, sh, width * inset, height * inset, width * (1 - inset * 2), height * (1 - inset * 2));
      }
    };
    draw(canvas.width, canvas.height);
    const renderPng = async (): Promise<LogoCustomAsset> => {
      const blob = await withDecodeDeadline(new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob || blob.size > MAX_LOGO_OUTPUT_BYTES) {
          reject(new Error(`The converted logo exceeds ${MAX_LOGO_OUTPUT_BYTES} bytes.`));
          return;
        }
        resolve(blob);
      }, 'image/png');
      }), 'Logo conversion exceeded the bounded time limit.');
      const roundTripPromise = createImageBitmap(blob);
      let roundTripTimer: number | undefined;
      const roundTrip = await Promise.race([
        roundTripPromise,
        new Promise<never>((_resolve, reject) => {
          roundTripTimer = window.setTimeout(() => reject(new Error('Generated logo validation exceeded the bounded time limit.')), MAX_LOGO_DECODE_TIME_MS);
        }),
      ]).catch((error) => {
        if (roundTripTimer !== undefined) window.clearTimeout(roundTripTimer);
        void roundTripPromise.then((lateBitmap) => lateBitmap.close(), () => undefined);
        throw error;
      });
      if (roundTripTimer !== undefined) window.clearTimeout(roundTripTimer);
      if (roundTrip.width !== canvas.width || roundTrip.height !== canvas.height) {
        roundTrip.close();
        throw new Error('The generated logo failed decoder dimension roundtrip.');
      }
      roundTrip.close();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('The converted logo could not be read back.'));
        reader.onload = () => resolve(String(reader.result));
        reader.readAsDataURL(blob);
      });
      const outputValidation = validateLogoBytes(Uint8Array.from(atob(dataUrl.slice(dataUrl.indexOf(',') + 1)), (char) => char.charCodeAt(0)));
      if (!outputValidation.ok || outputValidation.mimeType !== 'image/png') throw new Error('The converted logo failed signature validation.');
      return { dataUrl, mimeType: 'image/png', byteLength: dataUrlToByteLength(dataUrl), width: outputValidation.width, height: outputValidation.height, hasAlpha: true, frameCount: 1 };
    };
    const primary = await renderPng();
    const variants: NonNullable<LogoCustomAsset['variants']> = {};
    for (const target of LOGO_DISPLAY_TARGETS) {
      canvas.width = target.width;
      canvas.height = target.height;
      draw(target.width, target.height);
      variants[target.id] = await renderPng();
    }
    const aggregateBytes = primary.byteLength + Object.values(variants).reduce((total, asset) => total + (asset?.byteLength ?? 0), 0);
    if (aggregateBytes > MAX_LOGO_AGGREGATE_BYTES) throw new Error(`The generated logo variants exceed the aggregate ${MAX_LOGO_AGGREGATE_BYTES}-byte bound.`);
    const losses: LogoCustomAsset['losses'] = [
      validation.mimeType === 'image/png' ? 'metadata' : 'format',
      'metadata',
      'profile',
      ...(crop.x !== 0 || crop.y !== 0 || crop.width !== 1 || crop.height !== 1 ? ['crop' as const] : []),
    ];
    return {
      ...primary,
      sourceMimeType: validation.mimeType,
      sourceHasAlpha: validation.hasAlpha,
      sourceDataUrl,
      renderFingerprint: logoRenderFingerprint(renderOptions),
      losses: Array.from(new Set(losses)),
      variants,
    };
  } finally {
    bitmap.close();
  }
}

export function logoValidationMessage(validation: LogoValidation): string {
  return validation.ok ? 'Logo bytes validated.' : validation.detail;
}

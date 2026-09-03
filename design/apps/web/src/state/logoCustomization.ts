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
  sourceMimeType?: LogoImageMimeType;
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

export interface LogoStateStore {
  getSnapshot: () => LogoState;
  getServerSnapshot: () => LogoState;
  subscribe: (listener: () => void) => () => void;
  setState: (next: LogoState, action?: LogoMutationHistoryEntry['action']) => number;
  configurePersistence: (bridge: LogoPersistenceBridge | undefined, owner?: LogoPersistenceOwner) => () => void;
  subscribeMutations: (listener: (receipt: LogoMutationReceipt) => void) => () => void;
}

export type LogoPersistenceOwner = 'C0' | 'C1' | 'C4';
export interface LogoPersistenceRequest {
  sequence: number;
  state: LogoState;
  signal: AbortSignal;
}

export interface LogoMutationReceipt {
  sequence: number;
  state: LogoState;
  persisted: boolean;
  historyRecorded: boolean;
  bridgeConfigured: boolean;
  daemonAcknowledged: boolean | null;
}

let sharedLogoState: LogoState = { ...DEFAULT_LOGO_STATE };
let sharedLogoStateReady = false;
const sharedLogoListeners = new Set<() => void>();
const sharedLogoMutationListeners = new Set<(receipt: LogoMutationReceipt) => void>();
let sharedLogoMutationSequence = 0;
export type LogoPersistenceBridge = (request: LogoPersistenceRequest) => Promise<boolean> | boolean;
const LOGO_PERSISTENCE_OWNER_PRIORITY: readonly LogoPersistenceOwner[] = ['C0', 'C1', 'C4'];
const sharedLogoPersistenceBridges = new Map<LogoPersistenceOwner, Set<LogoPersistenceBridge>>();
let sharedLogoPersistenceBridge: LogoPersistenceBridge | undefined;
let sharedLogoPersistenceAbortController: AbortController | undefined;

function currentLogoPersistenceBridge(): LogoPersistenceBridge | undefined {
  for (const owner of LOGO_PERSISTENCE_OWNER_PRIORITY) {
    const bridges = sharedLogoPersistenceBridges.get(owner);
    const bridge = bridges?.values().next().value;
    if (bridge) return bridge;
  }
  return undefined;
}

function selectLogoPersistenceBridge(): void {
  // C0 owns the durable app bridge when it is mounted. C1 and C4 are
  // fallback registrations only, never competing writers.
  const next = currentLogoPersistenceBridge();
  if (next !== sharedLogoPersistenceBridge) sharedLogoPersistenceAbortController?.abort();
  sharedLogoPersistenceBridge = next;
}

function hydrateSharedLogoState(initial?: LogoState): LogoState {
  const stored = readStoredLogoState();
  const candidate = normalizeLogoState(initial ?? stored);
  if (candidate.custom && stored.custom?.dataUrl === candidate.custom.dataUrl && stored.custom.sourceDataUrl) {
    return { ...candidate, custom: { ...candidate.custom, sourceDataUrl: stored.custom.sourceDataUrl } };
  }
  return candidate;
}

/**
 * One external store is shared by every logo mount. Hosts may provide their
 * own instance, but the C0, C1, and C4 wrappers all use this singleton by
 * default rather than creating one React state cell per mount.
 */
export function getLogoStateStore(initial?: LogoState): LogoStateStore {
  if (!sharedLogoStateReady) {
    sharedLogoState = hydrateSharedLogoState(initial);
    sharedLogoStateReady = true;
  }
  return sharedLogoStateStore;
}

const sharedLogoStateStore: LogoStateStore = {
  getSnapshot: () => sharedLogoState,
  getServerSnapshot: () => sharedLogoState,
  subscribe: (listener) => {
    sharedLogoListeners.add(listener);
    return () => sharedLogoListeners.delete(listener);
  },
  setState: (next, action = 'updated') => {
    sharedLogoState = normalizeLogoState(next);
    const sequence = ++sharedLogoMutationSequence;
    const persisted = writeStoredLogoState(sharedLogoState);
    const historyRecorded = recordLogoMutation(action, sharedLogoState);
    sharedLogoPersistenceAbortController?.abort();
    const redactedState = redactLogoStateForDaemon(sharedLogoState);
    const bridge = sharedLogoPersistenceBridge;
    const bridgeConfigured = Boolean(bridge);
    const requestController = bridge ? new AbortController() : undefined;
    sharedLogoPersistenceAbortController = requestController;
    const pending: LogoMutationReceipt = { sequence, state: sharedLogoState, persisted, historyRecorded, bridgeConfigured, daemonAcknowledged: bridgeConfigured ? null : false };
    sharedLogoListeners.forEach((listener) => listener());
    sharedLogoMutationListeners.forEach((listener) => listener(pending));
    if (!bridge || !requestController) return sequence;
    const request: LogoPersistenceRequest = { sequence, state: redactedState, signal: requestController.signal };
    void Promise.resolve()
      .then(() => {
        if (request.signal.aborted || sequence !== sharedLogoMutationSequence) return false;
        return bridge(request);
      })
      .catch(() => false)
      .then((daemonAcknowledged) => {
        if (request.signal.aborted || sequence !== sharedLogoMutationSequence) return;
        const complete: LogoMutationReceipt = { ...pending, daemonAcknowledged };
        sharedLogoMutationListeners.forEach((listener) => listener(complete));
      });
    return sequence;
  },
  configurePersistence: (bridge, owner = 'C1') => {
    if (bridge) {
      const bridges = sharedLogoPersistenceBridges.get(owner) ?? new Set<LogoPersistenceBridge>();
      bridges.add(bridge);
      sharedLogoPersistenceBridges.set(owner, bridges);
      selectLogoPersistenceBridge();
    }
    let released = false;
    return () => {
      if (released || !bridge) return;
      released = true;
      const bridges = sharedLogoPersistenceBridges.get(owner);
      bridges?.delete(bridge);
      if (bridges?.size === 0) sharedLogoPersistenceBridges.delete(owner);
      selectLogoPersistenceBridge();
    };
  },
  subscribeMutations: (listener) => {
    sharedLogoMutationListeners.add(listener);
    return () => sharedLogoMutationListeners.delete(listener);
  },
};

/** Test and host lifecycle seam. It never touches localStorage. */
export function resetLogoStateStoreForTests(): void {
  sharedLogoState = { ...DEFAULT_LOGO_STATE };
  sharedLogoStateReady = false;
  sharedLogoMutationSequence = 0;
  sharedLogoPersistenceBridges.clear();
  sharedLogoPersistenceBridge = undefined;
  sharedLogoPersistenceAbortController?.abort();
  sharedLogoPersistenceAbortController = undefined;
  sharedLogoListeners.forEach((listener) => listener());
}

export type LogoImageMimeType = 'image/png' | 'image/jpeg' | 'image/webp';

export type LogoValidationCode =
  | 'empty'
  | 'too-large'
  | 'unsupported-format'
  | 'malformed'
  | 'too-many-pixels'
  | 'too-large-dimension'
  | 'animated';

export type LogoValidation = {
  ok: true;
  mimeType: LogoImageMimeType;
  byteLength: number;
  width: number;
  height: number;
  hasAlpha: boolean;
  frameCount: 1;
} | {
  ok: false;
  code: LogoValidationCode;
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
  for (let index = start; index < end; index += 1) value = (CRC_TABLE[(value ^ (bytes[index] ?? 0)) & 0xff] ?? 0) ^ (value >>> 8);
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

function isFiniteUnit(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isBoundedLogoCrop(value: unknown): value is LogoCrop {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const crop = value as Record<string, unknown>;
  return Object.keys(crop).length === 4
    && ['x', 'y', 'width', 'height'].every((key) => isFiniteUnit(crop[key]))
    && (crop.x as number) + (crop.width as number) <= 1
    && (crop.y as number) + (crop.height as number) <= 1
    && (crop.width as number) > 0
    && (crop.height as number) > 0;
}

function isBoundedLogoFocalPoint(value: unknown): value is { x: number; y: number } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const focalPoint = value as Record<string, unknown>;
  return Object.keys(focalPoint).length === 2 && isFiniteUnit(focalPoint.x) && isFiniteUnit(focalPoint.y);
}

/** Clamp normalized crop values to at least one real source pixel. */
export function clampLogoCropToPixels(crop: Partial<LogoCrop> | null | undefined, sourceWidth: number, sourceHeight: number): LogoCrop {
  const normalized = normalizeLogoCrop(crop);
  if (!Number.isInteger(sourceWidth) || !Number.isInteger(sourceHeight) || sourceWidth < 1 || sourceHeight < 1) return { x: 0, y: 0, width: 1, height: 1 };
  const x0 = Math.min(sourceWidth - 1, Math.max(0, Math.floor(normalized.x * sourceWidth)));
  const y0 = Math.min(sourceHeight - 1, Math.max(0, Math.floor(normalized.y * sourceHeight)));
  const x1 = Math.min(sourceWidth, Math.max(x0 + 1, Math.ceil((normalized.x + normalized.width) * sourceWidth)));
  const y1 = Math.min(sourceHeight, Math.max(y0 + 1, Math.ceil((normalized.y + normalized.height) * sourceHeight)));
  return { x: x0 / sourceWidth, y: y0 / sourceHeight, width: (x1 - x0) / sourceWidth, height: (y1 - y0) / sourceHeight };
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
    const declaredMime = value.slice('data:'.length, value.indexOf(';')).toLowerCase();
    return validation.ok && declaredMime === validation.mimeType ? value : undefined;
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
      const timezone = typeof schedule.timezone === 'string' && schedule.timezone.trim() ? schedule.timezone.slice(0, 80) : 'local';
      const startAt = schedule.startAt.slice(0, 32);
      const endAt = schedule.endAt.slice(0, 32);
      const scheduleValidation = validateLogoSchedule({ startAt, endAt, timezone });
      if (!scheduleValidation.ok) continue;
      schedules.push({
        id: schedule.id.slice(0, 80),
        label: typeof schedule.label === 'string' && schedule.label.trim() ? schedule.label.trim().slice(0, 120) : schedule.id.slice(0, 80),
        enabled: schedule.enabled !== false,
        startAt,
        endAt,
        weekdays: weekdays.length ? Array.from(new Set(weekdays)) : [0, 1, 2, 3, 4, 5, 6],
        timezone,
        patch: {
          ...(LOGO_PRESETS.some((preset) => preset.id === patch.presetId) ? { presetId: patch.presetId } : {}),
          ...(patch.fit === 'contain' || patch.fit === 'cover' || patch.fit === 'fill' ? { fit: patch.fit } : {}),
          ...(patch.background === 'transparent' || patch.background === 'rainbow' || (typeof patch.background === 'string' && /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/iu.test(patch.background)) ? { background: patch.background } : {}),
          ...(typeof patch.rainbowSpeedLevel === 'number' && Number.isFinite(patch.rainbowSpeedLevel) ? { rainbowSpeedLevel: Math.min(5, Math.max(1, Math.round(patch.rainbowSpeedLevel))) } : {}),
          ...(isBoundedLogoCrop(patch.crop) ? { crop: { ...patch.crop } } : {}),
          ...(isBoundedLogoFocalPoint(patch.focalPoint) ? { focalPoint: { ...patch.focalPoint } } : {}),
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
    if (!rule.enabled || !validateLogoSchedule(rule).ok) continue;
    const startKey = scheduleWallKey(rule.startAt, rule.timezone);
    const endKey = scheduleWallKey(rule.endAt, rule.timezone);
    const currentKey = scheduleNowWallKey(timestamp, rule.timezone);
    const currentWeekday = scheduleWeekday(timestamp, rule.timezone);
    if (!startKey || !endKey || !currentKey || startKey >= endKey || currentKey < startKey || currentKey >= endKey) continue;
    const sameDay = currentKey.slice(0, 10) === startKey.slice(0, 10);
    const weekdayMatches = rule.weekdays.includes(currentWeekday)
      // A selected weekday owns a cross-midnight interval through the early
      // hours of the following wall-clock day. This keeps a Thursday 23:00
      // to Friday 02:00 rule active at Friday 01:00 even when Friday was not
      // separately selected.
      || (!sameDay && currentKey.slice(11) < endKey.slice(11) && rule.weekdays.includes((currentWeekday + 6) % 7));
    if (!weekdayMatches) continue;
    resolved = normalizeLogoState({
      ...resolved,
      ...rule.patch,
      ...(rule.patch.presetId ? { custom: null } : {}),
      schedules: state.schedules,
    });
  }
  return resolved;
}

function scheduleParts(timestamp: number, timezone: string): Record<string, string> | null {
  try {
    // `local` is the persisted sentinel for the host timezone. It is not an
    // IANA timezone name, so passing it to Intl would throw and make a valid
    // local schedule silently never match.
    const timeZone = normalizedScheduleTimezone(timezone);
    const cacheKey = timezone.trim() || 'local';
    let formatter = scheduleFormatterCache.get(cacheKey);
    if (!formatter) {
      formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' });
      scheduleFormatterCache.set(cacheKey, formatter);
    }
    const parts = formatter.formatToParts(new Date(timestamp));
    return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  } catch { return null; }
}

function normalizedScheduleTimezone(timezone: string): string | undefined {
  const candidate = timezone.trim();
  return candidate && candidate !== 'local' ? candidate : undefined;
}

const scheduleFormatterCache = new Map<string, Intl.DateTimeFormat>();

export type LogoWallTimeStatus = 'valid' | 'ambiguous' | 'skipped' | 'invalid-timezone' | 'invalid-format';
const wallTimeStatusCache = new Map<string, LogoWallTimeStatus>();

export function isValidLogoTimezone(timezone: string): boolean {
  if (timezone.trim() === '' || timezone.trim() === 'local') return true;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: timezone.trim() }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

function wallTimeCandidates(value: string, timezone: string): number[] {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/u.exec(value);
  if (!match) return [];
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  if (year < 1 || year > 9999 || month < 1 || month > 12 || hour > 23 || minute > 59) return [];
  const base = Date.UTC(year, month - 1, day, hour, minute);
  const baseDate = new Date(base);
  if (baseDate.getUTCFullYear() !== year || baseDate.getUTCMonth() !== month - 1 || baseDate.getUTCDate() !== day) return [];
  const candidates: number[] = [];
  // Timezone offsets are bounded by the platform's supported range. The
  // 72-hour window also covers historical transitions without unbounded work.
  for (let delta = -36 * 60; delta <= 36 * 60; delta += 1) {
    const timestamp = base + delta * 60_000;
    if (scheduleNowWallKey(timestamp, timezone) === value) candidates.push(timestamp);
  }
  return candidates;
}

export function classifyLogoWallTime(value: string, timezone: string): LogoWallTimeStatus {
  const key = `${timezone}\u0000${value}`;
  const cached = wallTimeStatusCache.get(key);
  if (cached) return cached;
  if (!isValidLogoTimezone(timezone)) return 'invalid-timezone';
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/u.exec(value);
  if (!match) return 'invalid-format';
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const baseDate = new Date(Date.UTC(year, month - 1, day, hour, minute));
  if (year < 1 || year > 9999 || month < 1 || month > 12 || hour > 23 || minute > 59
    || baseDate.getUTCFullYear() !== year || baseDate.getUTCMonth() !== month - 1 || baseDate.getUTCDate() !== day) return 'invalid-format';
  const candidates = wallTimeCandidates(value, timezone);
  const status: LogoWallTimeStatus = candidates.length === 0 ? 'skipped' : candidates.length > 1 ? 'ambiguous' : 'valid';
  wallTimeStatusCache.set(key, status);
  if (wallTimeStatusCache.size > 256) wallTimeStatusCache.delete(wallTimeStatusCache.keys().next().value as string);
  return status;
}

export type LogoScheduleValidation =
  | { ok: true; start: Exclude<LogoWallTimeStatus, 'skipped' | 'invalid-timezone' | 'invalid-format'>; end: Exclude<LogoWallTimeStatus, 'skipped' | 'invalid-timezone' | 'invalid-format'> }
  | { ok: false; code: 'invalid-timezone' | 'invalid-start' | 'invalid-end' | 'skipped-start' | 'skipped-end' | 'invalid-window' };

export function validateLogoSchedule(rule: Pick<LogoScheduleRule, 'startAt' | 'endAt' | 'timezone'>): LogoScheduleValidation {
  const timezone = rule.timezone.trim() || 'local';
  if (!isValidLogoTimezone(timezone)) return { ok: false, code: 'invalid-timezone' };
  const startKey = scheduleWallKey(rule.startAt, timezone);
  const endKey = scheduleWallKey(rule.endAt, timezone);
  if (!startKey) return { ok: false, code: classifyLogoWallTime(rule.startAt, timezone) === 'skipped' ? 'skipped-start' : 'invalid-start' };
  if (!endKey) return { ok: false, code: classifyLogoWallTime(rule.endAt, timezone) === 'skipped' ? 'skipped-end' : 'invalid-end' };
  if (startKey >= endKey) return { ok: false, code: 'invalid-window' };
  const start = classifyLogoWallTime(startKey, timezone);
  const end = classifyLogoWallTime(endKey, timezone);
  if (start === 'skipped') return { ok: false, code: 'skipped-start' };
  if (end === 'skipped') return { ok: false, code: 'skipped-end' };
  if (start === 'invalid-timezone' || end === 'invalid-timezone') return { ok: false, code: 'invalid-timezone' };
  if (start === 'invalid-format') return { ok: false, code: 'invalid-start' };
  if (end === 'invalid-format') return { ok: false, code: 'invalid-end' };
  return { ok: true, start, end };
}

function scheduleWallKey(value: string, timezone: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u.test(value)) {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/u.exec(value);
    const status = classifyLogoWallTime(value, timezone);
    if (match && (status === 'valid' || status === 'ambiguous')) return value;
    return null;
  }
  const timestamp = Date.parse(value);
  const parts = Number.isFinite(timestamp) ? scheduleParts(timestamp, timezone) : null;
  return parts ? `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}` : null;
}

function scheduleNowWallKey(timestamp: number, timezone: string): string | null {
  const parts = scheduleParts(timestamp, timezone);
  return parts ? `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}` : null;
}

function scheduleWeekday(timestamp: number, timezone: string): number {
  const weekday = scheduleParts(timestamp, timezone)?.weekday;
  return ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as Record<string, number>)[weekday ?? ''] ?? new Date(timestamp).getDay();
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

function hasOnlyKeys(value: unknown, allowed: readonly string[]): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every((key) => allowed.includes(key)));
}

export function serializeLogoState(state: LogoState): string {
  const sanitized = redactLogoStateForDaemon(normalizeLogoState(state));
  return `${JSON.stringify({ kind: LOGO_FILE_KIND, version: LOGO_FILE_VERSION, state: sanitized }, null, 2)}\n`;
}

export function parseLogoStateFile(text: string): LogoFileParseResult {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return { ok: false, code: 'not-json' }; }
  if (!parsed || typeof parsed !== 'object') return { ok: false, code: 'wrong-kind' };
  const file = parsed as Record<string, unknown>;
  const allowedFileKeys = new Set(['kind', 'version', 'state']);
  if (Object.keys(file).some((key) => !allowedFileKeys.has(key))) return { ok: false, code: 'malformed' };
  if (file.kind !== LOGO_FILE_KIND) return { ok: false, code: 'wrong-kind' };
  if (typeof file.version !== 'number') return { ok: false, code: 'unknown-schema' };
  if (file.version !== LOGO_FILE_VERSION) return { ok: false, code: file.version > LOGO_FILE_VERSION ? 'future-version' : 'unknown-schema' };
  if (!file.state || typeof file.state !== 'object') return { ok: false, code: 'malformed' };
  const state = file.state as Record<string, unknown>;
  if (state.schemaVersion !== LOGO_SCHEMA_VERSION) return { ok: false, code: 'unknown-schema' };
  const allowedStateKeys = new Set(['schemaVersion', 'presetId', 'custom', 'fit', 'crop', 'focalPoint', 'background', 'safeArea', 'rainbowSpeedLevel', 'schedules']);
  if (Object.keys(state).some((key) => !allowedStateKeys.has(key))) return { ok: false, code: 'malformed' };
  if (!hasOnlyKeys(state.crop, ['x', 'y', 'width', 'height']) || !['x', 'y', 'width', 'height'].every((key) => typeof (state.crop as Record<string, unknown>)[key] === 'number' && Number.isFinite((state.crop as Record<string, unknown>)[key]))) return { ok: false, code: 'malformed' };
  if (!hasOnlyKeys(state.focalPoint, ['x', 'y']) || !['x', 'y'].every((key) => typeof (state.focalPoint as Record<string, unknown>)[key] === 'number' && Number.isFinite((state.focalPoint as Record<string, unknown>)[key]))) return { ok: false, code: 'malformed' };
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
    const custom = state.custom as Record<string, unknown>;
    if (custom.variants !== undefined) {
      if (!hasOnlyKeys(custom.variants, LOGO_DISPLAY_TARGETS.map((target) => target.id))) return { ok: false, code: 'malformed' };
      for (const target of LOGO_DISPLAY_TARGETS) {
        const variant = custom.variants[target.id];
        if (!hasOnlyKeys(variant, ['dataUrl', 'byteLength', 'width', 'height', 'hasAlpha', 'frameCount'])) return { ok: false, code: 'malformed' };
      }
    }
  }
  if (!Array.isArray(state.schedules) || state.schedules.length > 12 || state.schedules.some((rule) => {
    if (!rule || typeof rule !== 'object' || Array.isArray(rule)) return true;
    const candidate = rule as Record<string, unknown>;
    if (typeof candidate.startAt === 'string' && typeof candidate.endAt === 'string' && typeof candidate.timezone === 'string') {
      const scheduleValidation = validateLogoSchedule({ startAt: candidate.startAt, endAt: candidate.endAt, timezone: candidate.timezone });
      if (!scheduleValidation.ok) return true;
    }
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
      || ((candidate.patch as Record<string, unknown>).crop !== undefined && !isBoundedLogoCrop((candidate.patch as Record<string, unknown>).crop))
      || ((candidate.patch as Record<string, unknown>).focalPoint !== undefined && !isBoundedLogoFocalPoint((candidate.patch as Record<string, unknown>).focalPoint))
      || ((candidate.patch as Record<string, unknown>).background !== undefined && (candidate.patch as Record<string, unknown>).background !== 'transparent' && (candidate.patch as Record<string, unknown>).background !== 'rainbow' && !(typeof (candidate.patch as Record<string, unknown>).background === 'string' && /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/iu.test((candidate.patch as Record<string, unknown>).background as string)));
  })) return { ok: false, code: 'malformed' };
  const normalized = normalizeLogoState(state);
  if (state.custom !== null && normalized.custom === null) return { ok: false, code: 'malformed' };
  if (Array.isArray(state.schedules) && normalized.schedules.length !== state.schedules.length) return { ok: false, code: 'malformed' };
  return { ok: true, state: normalized };
}

export function writeStoredLogoState(state: LogoState): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(LOGO_STORAGE_KEY, JSON.stringify(normalizeLogoState(state)));
    return true;
  } catch {
    // Storage denial never replaces the active in-memory selection.
    return false;
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
): boolean {
  if (typeof window === 'undefined') return false;
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
    return true;
  } catch {
    // History failure never blocks the presentation change and never leaks the source.
    return false;
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
  root.style.setProperty('--app-logo-fit', state.fit);
  root.style.setProperty('--app-logo-background-size', state.fit === 'fill' ? '100% 100%' : state.fit);
  root.style.setProperty('--app-logo-focal-x', `${Math.round(state.focalPoint.x * 100)}%`);
  root.style.setProperty('--app-logo-focal-y', `${Math.round(state.focalPoint.y * 100)}%`);
  root.style.setProperty('--app-logo-safe-inset', state.safeArea ? '12%' : '0%');
  root.style.setProperty('--app-logo-background', state.background === 'rainbow' ? 'linear-gradient(120deg, hsl(0 90% 60%), hsl(120 90% 60%), hsl(240 90% 60%), hsl(360 90% 60%))' : state.background === 'transparent' ? 'transparent' : state.background);
  root.style.setProperty('--app-logo-rainbow-speed', `${[0, 24, 18, 12, 8, 5][state.rainbowSpeedLevel] ?? 12}s`);
  root.style.setProperty('--app-logo-focal-x', `${Math.round(state.focalPoint.x * 100)}%`);
  root.style.setProperty('--app-logo-focal-y', `${Math.round(state.focalPoint.y * 100)}%`);
  const source = state.custom?.dataUrl ?? LOGO_PRESETS.find((preset) => preset.id === state.presetId)?.src ?? LOGO_PRESETS[0]?.src ?? '/app-icon.png';
  root.style.setProperty('--app-logo-image', `url(${JSON.stringify(source)})`);
}

export async function fileToValidatedBytes(file: File): Promise<{ bytes: Uint8Array; validation: LogoValidation }> {
  if (file.size > MAX_LOGO_SOURCE_BYTES) {
    return { bytes: new Uint8Array(), validation: { ok: false, code: 'too-large', detail: `The selected file exceeds ${MAX_LOGO_SOURCE_BYTES} bytes.` } };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  return { bytes, validation: validateLogoBytes(bytes) };
}

function fileToDataUrl(file: File, signal?: AbortSignal): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    let settled = false;
    const timer = window.setTimeout(() => {
      reader.abort();
      settle('reject', new Error('source-retention-timeout'));
    }, MAX_LOGO_DECODE_TIME_MS);
    const onAbort = () => {
      reader.abort();
      settle('reject', new Error('conversion-aborted'));
    };
    const cleanup = () => {
      window.clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };
    const settle = (kind: 'resolve' | 'reject', value: string | Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (kind === 'resolve') resolve(value as string);
      else reject(value as Error);
    };
    reader.onerror = () => settle('reject', new Error('source-retention-failed'));
    reader.onabort = () => {
      if (!settled) settle('reject', new Error('conversion-aborted'));
    };
    reader.onload = () => settle('resolve', String(reader.result));
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener('abort', onAbort, { once: true });
    reader.readAsDataURL(file);
  });
}

function fileForValidatedBytes(bytes: Uint8Array, mimeType: LogoImageMimeType): File {
  if (mimeType !== 'image/png' && mimeType !== 'image/jpeg' && mimeType !== 'image/webp') {
    throw new Error('The local image format is not supported.');
  }
  // Decode and retain the bytes under the signature-derived MIME type. The
  // user-provided extension and MIME claim never influence this boundary.
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return new File([copy], 'local-logo-source', { type: mimeType });
}

export interface LogoConversionControl {
  signal?: AbortSignal;
}

interface LogoWorkerAsset {
  bytes: ArrayBuffer;
  width: number;
  height: number;
  hasAlpha: boolean;
  frameCount: 1;
}

interface LogoWorkerResponse {
  ok: true;
  requestId: number;
  primary: LogoWorkerAsset;
  variants: Record<string, LogoWorkerAsset>;
}

interface LogoWorkerError {
  ok: false;
  requestId: number;
  code: string;
}

let nextLogoRequestId = 0;

function copyArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

function convertInWorker(bytes: Uint8Array, mimeType: LogoImageMimeType, options: LogoRenderOptions, signal?: AbortSignal): Promise<LogoWorkerResponse> {
  return new Promise<LogoWorkerResponse>((resolve, reject) => {
    if (typeof Worker === 'undefined') {
      reject(new Error('decoder-unavailable'));
      return;
    }
    let worker: Worker;
    try {
      worker = new Worker(new URL('../components/logo/logo-decoder.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      reject(new Error('decoder-unavailable'));
      return;
    }
    let settled = false;
    const timer = window.setTimeout(() => finish(new Error('decode-timeout')), MAX_LOGO_DECODE_TIME_MS);
    const onAbort = () => finish(new Error('conversion-aborted'));
    const requestId = ++nextLogoRequestId;
    const cleanup = () => {
      window.clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
    };
    const finish = (value: LogoWorkerResponse | Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (value instanceof Error) reject(value);
      else resolve(value);
    };
    worker.onmessage = (event: MessageEvent<LogoWorkerResponse | LogoWorkerError>) => {
      const value = event.data;
      if (!value || value.requestId !== requestId) return;
      if (value?.ok === true) finish(value);
      else finish(new Error(value?.code || 'decode-failed'));
    };
    worker.onerror = () => finish(new Error('decode-failed'));
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener('abort', onAbort, { once: true });
    const transferable = copyArrayBuffer(bytes);
    try {
      worker.postMessage({ kind: 'convert', requestId, bytes: transferable, mimeType, options }, [transferable]);
    } catch {
      finish(new Error('decode-failed'));
    }
  });
}

async function materializeWorkerAsset(asset: LogoWorkerAsset, expectedWidth: number, expectedHeight: number, signal?: AbortSignal): Promise<LogoCustomAsset> {
  const bytes = new Uint8Array(asset.bytes);
  const validation = validateLogoBytes(bytes);
  if (!validation.ok || validation.mimeType !== 'image/png' || validation.width !== expectedWidth || validation.height !== expectedHeight || validation.frameCount !== 1 || asset.width !== expectedWidth || asset.height !== expectedHeight || bytes.byteLength > MAX_LOGO_OUTPUT_BYTES) {
    throw new Error('output-invalid');
  }
  const dataUrl = await fileToDataUrl(fileForValidatedBytes(bytes, 'image/png'), signal);
  return { dataUrl, mimeType: 'image/png', byteLength: bytes.byteLength, width: validation.width, height: validation.height, hasAlpha: validation.hasAlpha, frameCount: 1 };
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
  control: LogoConversionControl = {},
): Promise<LogoCustomAsset> {
  const renderOptionsBase: LogoRenderOptions = 'fit' in options
    ? { ...options, crop: normalizeLogoCrop(options.crop) }
    : {
      crop: normalizeLogoCrop(options),
      fit: DEFAULT_LOGO_STATE.fit,
      focalPoint: DEFAULT_LOGO_STATE.focalPoint,
      safeArea: DEFAULT_LOGO_STATE.safeArea,
      background: DEFAULT_LOGO_STATE.background,
      outputSize: 512,
    };
  const requestedOutputSize = renderOptionsBase.outputSize ?? 512;
  const outputSize = Number.isFinite(requestedOutputSize)
    ? Math.min(MAX_LOGO_DIMENSION, Math.max(1, Math.round(requestedOutputSize)))
    : 512;
  const renderOptions: LogoRenderOptions = { ...renderOptionsBase, outputSize };
  const { bytes, validation } = await fileToValidatedBytes(file);
  if (!validation.ok) throw new Error(validation.detail);
  if (control.signal?.aborted) throw new Error('conversion-aborted');
  const validatedFile = fileForValidatedBytes(bytes, validation.mimeType);
  const sourceDataUrl = await fileToDataUrl(validatedFile, control.signal);
  const workerResult = await convertInWorker(bytes, validation.mimeType, renderOptions, control.signal);
  if (control.signal?.aborted) throw new Error('conversion-aborted');
  const primary = await materializeWorkerAsset(workerResult.primary, outputSize, outputSize, control.signal);
  const variants: NonNullable<LogoCustomAsset['variants']> = {};
  for (const target of LOGO_DISPLAY_TARGETS) {
    const candidate = workerResult.variants[target.id];
    if (!candidate) throw new Error('output-invalid');
    variants[target.id] = await materializeWorkerAsset(candidate, target.width, target.height, control.signal);
  }
  const aggregateBytes = primary.byteLength + Object.values(variants).reduce((total, asset) => total + (asset?.byteLength ?? 0), 0);
  if (aggregateBytes > MAX_LOGO_AGGREGATE_BYTES) throw new Error('aggregate-output-too-large');
  const losses: LogoCustomAsset['losses'] = [
    validation.mimeType === 'image/png' ? 'metadata' : 'format',
    'metadata',
    'profile',
    ...(renderOptions.crop.x !== 0 || renderOptions.crop.y !== 0 || renderOptions.crop.width !== 1 || renderOptions.crop.height !== 1 ? ['crop' as const] : []),
    ...(validation.hasAlpha && renderOptions.background !== 'transparent' && renderOptions.background !== 'rainbow' ? ['transparency' as const] : []),
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
}

export function logoValidationMessage(validation: LogoValidation): string {
  return validation.ok ? 'Logo bytes validated.' : validation.detail;
}

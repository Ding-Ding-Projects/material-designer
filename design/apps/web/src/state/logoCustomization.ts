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
export const LOGO_STORAGE_KEY = 'open-design:app-logo:v1';
export const LOGO_HISTORY_STORAGE_KEY = 'open-design:app-logo-history:v1';
export const MAX_LOGO_SOURCE_BYTES = 8 * 1024 * 1024;
export const MAX_LOGO_OUTPUT_BYTES = 2 * 1024 * 1024;
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

export interface LogoPreset {
  id: 'material' | 'warm' | 'monochrome' | 'outline';
  label: string;
  /** A local, bundled asset path. It is never a network URL. */
  src: string;
}

export const LOGO_PRESETS: readonly LogoPreset[] = [
  { id: 'material', label: 'Material mark', src: '/logo-mark.svg' },
  { id: 'warm', label: 'Warm mark', src: '/logo.svg' },
  { id: 'monochrome', label: 'Monochrome mark', src: '/logo-mark.svg' },
  { id: 'outline', label: 'Outline mark', src: '/logo.svg' },
];

export interface LogoCustomAsset {
  /** A validated local data URL, never a remote URL. */
  dataUrl: string;
  mimeType: 'image/png';
  byteLength: number;
  width: number;
  height: number;
  hasAlpha: boolean;
  frameCount: 1;
  variants?: Partial<Record<LogoDisplayTarget, {
    dataUrl: string;
    byteLength: number;
    width: number;
    height: number;
    hasAlpha: boolean;
    frameCount: 1;
  }>>;
}

export interface LogoCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LogoState {
  schemaVersion: typeof LOGO_SCHEMA_VERSION;
  presetId: LogoPreset['id'];
  custom: LogoCustomAsset | null;
  fit: LogoFit;
  crop: LogoCrop;
  focalPoint: { x: number; y: number };
  background: string | 'transparent';
  safeArea: boolean;
  /** A speed level for the shared rainbow picker contract. */
  rainbowSpeedLevel: 1 | 2 | 3 | 4 | 5;
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
  if (bytes.length < 33) return { ok: false, code: 'malformed', detail: 'The PNG header is incomplete.' };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = uint32(view, 16);
  const height = uint32(view, 20);
  const bounds = withinBounds(width, height);
  if (bounds) return bounds;
  const colorType = bytes[25];
  // PNG colour type 4 and 6 carry alpha. A tRNS chunk also carries it, but
  // accepting the common alpha-bearing types is enough for the custom logo
  // path and avoids scanning untrusted chunk structures unnecessarily.
  const hasAlpha = colorType === 4 || colorType === 6;
  let offset = 8;
  let frameCount = 1;
  while (offset + 12 <= bytes.length) {
    const length = uint32(view, offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (type === 'acTL') frameCount = 2;
    const next = offset + 12 + length;
    if (next < offset || next > bytes.length) {
      return { ok: false, code: 'malformed', detail: 'A PNG chunk exceeds the supplied byte payload.' };
    }
    offset = next;
    if (type === 'IEND') break;
  }
  if (frameCount > MAX_LOGO_FRAMES) return { ok: false, code: 'animated', detail: 'Animated PNG input is not accepted.' };
  return { ok: true, mimeType: 'image/png', byteLength: bytes.length, width, height, hasAlpha, frameCount: 1 };
}

function jpegMetadata(bytes: Uint8Array): LogoValidation {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return { ok: false, code: 'malformed', detail: 'The JPEG signature is incomplete.' };
  }
  let offset = 2;
  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01) continue;
    if (offset + 2 > bytes.length) break;
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) break;
    const isFrame = (marker >= 0xc0 && marker <= 0xc3)
      || (marker >= 0xc5 && marker <= 0xc7)
      || (marker >= 0xc9 && marker <= 0xcb)
      || (marker >= 0xcd && marker <= 0xcf);
    if (isFrame && length >= 7) {
      const height = (bytes[offset + 3] << 8) | bytes[offset + 4];
      const width = (bytes[offset + 5] << 8) | bytes[offset + 6];
      const bounds = withinBounds(width, height);
      if (bounds) return bounds;
      return { ok: true, mimeType: 'image/jpeg', byteLength: bytes.length, width, height, hasAlpha: false, frameCount: 1 };
    }
    offset += length;
  }
  return { ok: false, code: 'malformed', detail: 'The JPEG frame header could not be read.' };
}

function webpMetadata(bytes: Uint8Array): LogoValidation {
  if (bytes.length < 16) return { ok: false, code: 'malformed', detail: 'The WebP header is incomplete.' };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunk = String.fromCharCode(...bytes.subarray(12, 16));
  if (chunk === 'VP8X' && bytes.length >= 30) {
    const flags = bytes[20];
    if ((flags & 0x02) !== 0) return { ok: false, code: 'animated', detail: 'Animated WebP input is not accepted.' };
    const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
    const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
    const bounds = withinBounds(width, height);
    if (bounds) return bounds;
    return { ok: true, mimeType: 'image/webp', byteLength: bytes.length, width, height, hasAlpha: (flags & 0x10) !== 0, frameCount: 1 };
  }
  if (chunk === 'VP8 ' && bytes.length >= 30) {
    const width = view.getUint16(26, true) & 0x3fff;
    const height = view.getUint16(28, true) & 0x3fff;
    const bounds = withinBounds(width, height);
    if (bounds) return bounds;
    return { ok: true, mimeType: 'image/webp', byteLength: bytes.length, width, height, hasAlpha: false, frameCount: 1 };
  }
  return { ok: false, code: 'unsupported-format', detail: 'Only static VP8 and VP8X WebP images are accepted.' };
}

/** Inspect the signature and bounded metadata without invoking a decoder. */
export function validateLogoBytes(input: ArrayBuffer | Uint8Array): LogoValidation {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length === 0) return { ok: false, code: 'empty', detail: 'The selected file is empty.' };
  if (bytes.length > MAX_LOGO_SOURCE_BYTES) return { ok: false, code: 'too-large', detail: `The selected file exceeds ${MAX_LOGO_SOURCE_BYTES} bytes.` };
  if (bytes.length >= 8
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    return pngMetadata(bytes);
  }
  if (bytes.length >= 12
    && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return webpMetadata(bytes);
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) return jpegMetadata(bytes);
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

export function normalizeLogoState(value: unknown): LogoState {
  if (!value || typeof value !== 'object') return { ...DEFAULT_LOGO_STATE };
  const raw = value as Partial<LogoState>;
  const presetId = LOGO_PRESETS.some((preset) => preset.id === raw.presetId)
    ? raw.presetId as LogoPreset['id']
    : DEFAULT_LOGO_STATE.presetId;
  let custom: LogoCustomAsset | null = null;
  if (raw.custom && typeof raw.custom === 'object'
    && raw.custom.mimeType === 'image/png'
    && typeof raw.custom.dataUrl === 'string'
    && raw.custom.dataUrl.startsWith('data:image/png;base64,')
    && raw.custom.dataUrl.length <= MAX_LOGO_OUTPUT_BYTES * 2) {
    // A cache is untrusted input too. Reconstruct bytes and re-run the exact
    // signature, dimension and static-frame validator before accepting it.
    try {
      const encoded = raw.custom.dataUrl.slice(raw.custom.dataUrl.indexOf(',') + 1);
      const bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
      const validation = validateLogoBytes(bytes);
      if (validation.ok && validation.mimeType === 'image/png'
        && validation.width === Number(raw.custom.width)
        && validation.height === Number(raw.custom.height)
        && validation.frameCount === 1
        && bytes.length <= MAX_LOGO_OUTPUT_BYTES) {
        custom = {
          dataUrl: raw.custom.dataUrl,
          mimeType: 'image/png',
          byteLength: bytes.length,
          width: validation.width,
          height: validation.height,
          hasAlpha: validation.hasAlpha,
          frameCount: 1,
          variants: undefined,
        };
      }
    } catch {
      custom = null;
    }
  }
  const fit: LogoFit = raw.fit === 'cover' || raw.fit === 'fill' ? raw.fit : 'contain';
  const focalPoint = {
    x: Math.min(1, Math.max(0, Number(raw.focalPoint?.x) || 0.5)),
    y: Math.min(1, Math.max(0, Number(raw.focalPoint?.y) || 0.5)),
  };
  const background = raw.background === 'transparent'
    ? 'transparent'
    : typeof raw.background === 'string' && /^#[0-9a-f]{6}$/iu.test(raw.background)
      ? raw.background.toLowerCase()
      : DEFAULT_LOGO_STATE.background;
  const speed = Number(raw.rainbowSpeedLevel);
  return {
    ...DEFAULT_LOGO_STATE,
    presetId,
    custom,
    fit,
    crop: normalizeLogoCrop(raw.crop),
    focalPoint,
    background,
    safeArea: raw.safeArea !== false,
    rainbowSpeedLevel: (speed >= 1 && speed <= 5 ? Math.round(speed) : DEFAULT_LOGO_STATE.rainbowSpeedLevel) as LogoState['rainbowSpeedLevel'],
  };
}

export function readStoredLogoState(): LogoState {
  if (typeof window === 'undefined') return { ...DEFAULT_LOGO_STATE };
  try {
    const raw = window.localStorage.getItem(LOGO_STORAGE_KEY);
    return raw ? normalizeLogoState(JSON.parse(raw)) : { ...DEFAULT_LOGO_STATE };
  } catch {
    return { ...DEFAULT_LOGO_STATE };
  }
}

export function writeStoredLogoState(state: LogoState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOGO_STORAGE_KEY, JSON.stringify(normalizeLogoState(state)));
  } catch {
    // Storage denial never replaces the active in-memory selection.
  }
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
  root.style.setProperty('--app-logo-background', state.background === 'transparent' ? 'transparent' : state.background);
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

export async function convertLogoFile(
  file: File,
  crop: LogoCrop = DEFAULT_LOGO_STATE.crop,
  outputSize = 512,
): Promise<LogoCustomAsset> {
  const { validation } = await fileToValidatedBytes(file);
  if (!validation.ok) throw new Error(validation.detail);
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
    void bitmapPromise.then((lateBitmap) => lateBitmap.close(), () => undefined);
    throw error;
  });
  if (decodeTimer !== undefined) window.clearTimeout(decodeTimer);
  try {
    if (bitmap.width !== validation.width || bitmap.height !== validation.height) {
      throw new Error('The decoded dimensions do not match the validated image header.');
    }
    const sourceX = Math.round(bitmap.width * crop.x);
    const sourceY = Math.round(bitmap.height * crop.y);
    const sourceWidth = Math.max(1, Math.round(bitmap.width * crop.width));
    const sourceHeight = Math.max(1, Math.round(bitmap.height * crop.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.min(MAX_LOGO_DIMENSION, Math.max(1, outputSize));
    canvas.height = canvas.width;
    const context = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
    if (!context) throw new Error('The local image decoder could not create a safe pixel surface.');
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
    const renderPng = async (): Promise<LogoCustomAsset> => {
      const dataUrl = await new Promise<string>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob || blob.size > MAX_LOGO_OUTPUT_BYTES) {
          reject(new Error(`The converted logo exceeds ${MAX_LOGO_OUTPUT_BYTES} bytes.`));
          return;
        }
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('The converted logo could not be read back.'));
        reader.onload = () => resolve(String(reader.result));
        reader.readAsDataURL(blob);
      }, 'image/png');
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
      context.clearRect(0, 0, target.width, target.height);
      context.drawImage(bitmap, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, target.width, target.height);
      variants[target.id] = await renderPng();
    }
    return { ...primary, variants };
  } finally {
    bitmap.close();
  }
}

export function logoValidationMessage(validation: LogoValidation): string {
  return validation.ok ? 'Logo bytes validated.' : validation.detail;
}

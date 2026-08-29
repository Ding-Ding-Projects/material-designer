const LOGO_DISPLAY_TARGETS = [
  { id: 'favicon', width: 16, height: 16 },
  { id: 'toolbar', width: 32, height: 32 },
  { id: 'titlebar', width: 48, height: 48 },
  { id: 'sidebar', width: 128, height: 128 },
  { id: 'installer', width: 256, height: 256 },
] as const;
const MAX_LOGO_DIMENSION = 4096;
const MAX_LOGO_OUTPUT_BYTES = 2 * 1024 * 1024;
type LogoImageMimeType = 'image/png' | 'image/jpeg' | 'image/webp';
type LogoFit = 'contain' | 'cover' | 'fill';
type LogoBackground = string | 'transparent' | 'rainbow';

interface WorkerRenderOptions {
  crop: { x: number; y: number; width: number; height: number };
  fit: LogoFit;
  focalPoint: { x: number; y: number };
  safeArea: boolean;
  background: LogoBackground;
  outputSize: number;
}

interface WorkerRequest {
  kind: 'convert';
  bytes: ArrayBuffer;
  mimeType: LogoImageMimeType;
  options: WorkerRenderOptions;
}

interface WorkerAsset {
  bytes: ArrayBuffer;
  width: number;
  height: number;
  hasAlpha: boolean;
  frameCount: 1;
}

interface WorkerSuccess {
  ok: true;
  primary: WorkerAsset;
  variants: Record<string, WorkerAsset>;
}

interface WorkerFailure {
  ok: false;
  code: 'decoder-unavailable' | 'decode-failed' | 'encode-failed' | 'output-invalid';
}

const workerScope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (message: WorkerSuccess | WorkerFailure, transfer?: Transferable[]) => void;
};

function copyBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

function clampFraction(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
}

function clampLogoCropToPixels(crop: WorkerRenderOptions['crop'], sourceWidth: number, sourceHeight: number): WorkerRenderOptions['crop'] {
  const x = Math.min(0.99, Math.max(0, Number.isFinite(crop.x) ? crop.x : 0));
  const y = Math.min(0.99, Math.max(0, Number.isFinite(crop.y) ? crop.y : 0));
  const width = Math.min(1 - x, Math.max(0.01, Number.isFinite(crop.width) ? crop.width : 1));
  const height = Math.min(1 - y, Math.max(0.01, Number.isFinite(crop.height) ? crop.height : 1));
  const x0 = Math.min(sourceWidth - 1, Math.max(0, Math.floor(x * sourceWidth)));
  const y0 = Math.min(sourceHeight - 1, Math.max(0, Math.floor(y * sourceHeight)));
  const x1 = Math.min(sourceWidth, Math.max(x0 + 1, Math.ceil((x + width) * sourceWidth)));
  const y1 = Math.min(sourceHeight, Math.max(y0 + 1, Math.ceil((y + height) * sourceHeight)));
  return { x: x0 / sourceWidth, y: y0 / sourceHeight, width: (x1 - x0) / sourceWidth, height: (y1 - y0) / sourceHeight };
}

async function renderPng(bitmap: ImageBitmap, source: { width: number; height: number }, options: WorkerRenderOptions, width: number, height: number): Promise<WorkerAsset> {
  if (typeof OffscreenCanvas === 'undefined') throw new Error('decoder-unavailable');
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d', { alpha: true });
  if (!context) throw new Error('decoder-unavailable');
  const crop = clampLogoCropToPixels(options.crop, source.width, source.height);
  const sourceX = crop.x * source.width;
  const sourceY = crop.y * source.height;
  const sourceWidth = Math.max(1, crop.width * source.width);
  const sourceHeight = Math.max(1, crop.height * source.height);
  context.clearRect(0, 0, width, height);
  if (options.background !== 'transparent' && options.background !== 'rainbow') {
    context.fillStyle = options.background;
    context.fillRect(0, 0, width, height);
  }
  const targetRatio = width / height;
  const sourceRatio = sourceWidth / sourceHeight;
  let sx = sourceX;
  let sy = sourceY;
  let sw = sourceWidth;
  let sh = sourceHeight;
  if (options.fit === 'cover') {
    if (sourceRatio > targetRatio) {
      sw = sourceHeight * targetRatio;
      sx += (sourceWidth - sw) * clampFraction(options.focalPoint.x, 0.5);
    } else if (sourceRatio < targetRatio) {
      sh = sourceWidth / targetRatio;
      sy += (sourceHeight - sh) * clampFraction(options.focalPoint.y, 0.5);
    }
  }
  const inset = options.safeArea ? 0.12 : 0;
  if (options.fit === 'contain') {
    const scale = Math.min((width * (1 - inset * 2)) / sw, (height * (1 - inset * 2)) / sh);
    const dw = sw * scale;
    const dh = sh * scale;
    context.drawImage(bitmap, sx, sy, sw, sh, (width - dw) / 2, (height - dh) / 2, dw, dh);
  } else {
    context.drawImage(bitmap, sx, sy, sw, sh, width * inset, height * inset, width * (1 - inset * 2), height * (1 - inset * 2));
  }
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  if (blob.size > MAX_LOGO_OUTPUT_BYTES) throw new Error('encode-failed');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return { bytes: copyBuffer(bytes), width, height, hasAlpha: true, frameCount: 1 };
}

workerScope.onmessage = (event) => {
  void (async () => {
    let bitmap: ImageBitmap | undefined;
    try {
      const message = event.data;
      if (!message || message.kind !== 'convert' || !(message.bytes instanceof ArrayBuffer)) throw new Error('decode-failed');
      const bytes = new Uint8Array(message.bytes);
      if (typeof createImageBitmap !== 'function') throw new Error('decoder-unavailable');
      const blob = new Blob([copyBuffer(bytes)], { type: message.mimeType });
      bitmap = await createImageBitmap(blob);
      if (bitmap.width < 1 || bitmap.height < 1 || bitmap.width > MAX_LOGO_DIMENSION || bitmap.height > MAX_LOGO_DIMENSION || bitmap.width * bitmap.height > 16 * 1024 * 1024) throw new Error('decode-failed');
      const options = message.options;
      const outputSize = Math.min(MAX_LOGO_DIMENSION, Math.max(1, Math.round(options.outputSize)));
      const source = { width: bitmap.width, height: bitmap.height };
      const boundedOptions: WorkerRenderOptions = {
        ...options,
        outputSize,
        crop: clampLogoCropToPixels(options.crop, source.width, source.height),
        fit: options.fit === 'cover' || options.fit === 'fill' ? options.fit : 'contain',
        focalPoint: { x: clampFraction(options.focalPoint.x, 0.5), y: clampFraction(options.focalPoint.y, 0.5) },
        safeArea: options.safeArea === true,
        background: options.background === 'transparent' || options.background === 'rainbow' || /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/iu.test(options.background) ? options.background : 'transparent',
      };
      const primary = await renderPng(bitmap, source, boundedOptions, outputSize, outputSize);
      const variants: Record<string, WorkerAsset> = {};
      for (const target of LOGO_DISPLAY_TARGETS) variants[target.id] = await renderPng(bitmap, source, boundedOptions, target.width, target.height);
      const transfer = [primary.bytes, ...Object.values(variants).map((asset) => asset.bytes)];
      workerScope.postMessage({ ok: true, primary, variants }, transfer);
    } catch (error) {
      const code = error instanceof Error && (error.message === 'decoder-unavailable' || error.message === 'encode-failed' || error.message === 'output-invalid') ? error.message : 'decode-failed';
      workerScope.postMessage({ ok: false, code });
    } finally {
      bitmap?.close();
    }
  })();
};

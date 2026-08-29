const DISPLAY_TARGETS = [
  { id: 'favicon', width: 16, height: 16 },
  { id: 'toolbar', width: 32, height: 32 },
  { id: 'titlebar', width: 48, height: 48 },
  { id: 'sidebar', width: 128, height: 128 },
  { id: 'installer', width: 256, height: 256 },
];
const MAX_DIMENSION = 4096;
const MAX_PIXELS = 16 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;

const workerScope = globalThis;

function cropToPixels(crop, width, height) {
  const x = Math.min(0.99, Math.max(0, Number.isFinite(crop?.x) ? crop.x : 0));
  const y = Math.min(0.99, Math.max(0, Number.isFinite(crop?.y) ? crop.y : 0));
  const w = Math.min(1 - x, Math.max(0.01, Number.isFinite(crop?.width) ? crop.width : 1));
  const h = Math.min(1 - y, Math.max(0.01, Number.isFinite(crop?.height) ? crop.height : 1));
  const x0 = Math.min(width - 1, Math.max(0, Math.floor(x * width)));
  const y0 = Math.min(height - 1, Math.max(0, Math.floor(y * height)));
  const x1 = Math.min(width, Math.max(x0 + 1, Math.ceil((x + w) * width)));
  const y1 = Math.min(height, Math.max(y0 + 1, Math.ceil((y + h) * height)));
  return { x: x0 / width, y: y0 / height, width: (x1 - x0) / width, height: (y1 - y0) / height };
}

function boundedFraction(value, fallback) {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
}

function copyBuffer(bytes) {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

async function renderPng(bitmap, source, options, width, height) {
  if (typeof OffscreenCanvas === 'undefined') throw new Error('decoder-unavailable');
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d', { alpha: true });
  if (!context) throw new Error('decoder-unavailable');
  const crop = cropToPixels(options.crop, source.width, source.height);
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
      sx += (sourceWidth - sw) * boundedFraction(options.focalPoint.x, 0.5);
    } else if (sourceRatio < targetRatio) {
      sh = sourceWidth / targetRatio;
      sy += (sourceHeight - sh) * boundedFraction(options.focalPoint.y, 0.5);
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
  if (blob.size > MAX_OUTPUT_BYTES) throw new Error('encode-failed');
  return { bytes: copyBuffer(new Uint8Array(await blob.arrayBuffer())), width, height, hasAlpha: true, frameCount: 1 };
}

workerScope.onmessage = (event) => {
  void (async () => {
    let bitmap;
    try {
      const message = event.data;
      if (!message || message.kind !== 'convert' || !(message.bytes instanceof ArrayBuffer)) throw new Error('decode-failed');
      if (typeof createImageBitmap !== 'function') throw new Error('decoder-unavailable');
      const blob = new Blob([message.bytes], { type: message.mimeType });
      bitmap = await createImageBitmap(blob);
      if (bitmap.width < 1 || bitmap.height < 1 || bitmap.width > MAX_DIMENSION || bitmap.height > MAX_DIMENSION || bitmap.width * bitmap.height > MAX_PIXELS) throw new Error('decode-failed');
      const options = message.options || {};
      const outputSize = Math.min(MAX_DIMENSION, Math.max(1, Math.round(Number(options.outputSize) || 512)));
      const boundedOptions = {
        crop: cropToPixels(options.crop, bitmap.width, bitmap.height),
        fit: options.fit === 'cover' || options.fit === 'fill' ? options.fit : 'contain',
        focalPoint: { x: boundedFraction(options.focalPoint?.x, 0.5), y: boundedFraction(options.focalPoint?.y, 0.5) },
        safeArea: options.safeArea === true,
        background: options.background === 'transparent' || options.background === 'rainbow' || /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/iu.test(options.background) ? options.background : 'transparent',
        outputSize,
      };
      const source = { width: bitmap.width, height: bitmap.height };
      const primary = await renderPng(bitmap, source, boundedOptions, outputSize, outputSize);
      const variants = {};
      for (const target of DISPLAY_TARGETS) variants[target.id] = await renderPng(bitmap, source, boundedOptions, target.width, target.height);
      workerScope.postMessage({ ok: true, primary, variants }, [primary.bytes, ...Object.values(variants).map((asset) => asset.bytes)]);
    } catch (error) {
      const code = error instanceof Error && ['decoder-unavailable', 'encode-failed'].includes(error.message) ? error.message : 'decode-failed';
      workerScope.postMessage({ ok: false, code });
    } finally {
      bitmap?.close();
    }
  })();
};

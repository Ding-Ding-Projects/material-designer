import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOGO_STATE,
  LOGO_STORAGE_KEY,
  LOGO_HISTORY_STORAGE_KEY,
  MAX_LOGO_DIMENSION,
  MAX_LOGO_DECODE_TIME_MS,
  MAX_LOGO_OUTPUT_BYTES,
  LOGO_DISPLAY_TARGETS,
  MAX_LOGO_SOURCE_BYTES,
  normalizeLogoState,
  validateLogoBytes,
} from '../../src/state/logoCustomization';

function pngHeader(width: number, height: number, chunks: string[] = []): Uint8Array {
  const bytes = new Uint8Array(64);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13, false);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  bytes[24] = 8;
  bytes[25] = 6;
  let offset = 33;
  for (const type of chunks) {
    view.setUint32(offset, 0, false);
    bytes.set(Array.from(type).map((char) => char.charCodeAt(0)), offset + 4);
    offset += 12;
  }
  return bytes;
}

describe('app-logo customization contract', () => {
  it('keeps the bounded private storage contract explicit', () => {
    expect(LOGO_STORAGE_KEY).toBe('open-design:app-logo:v1');
    expect(LOGO_HISTORY_STORAGE_KEY).toBe('open-design:app-logo-history:v1');
    expect(MAX_LOGO_SOURCE_BYTES).toBe(8 * 1024 * 1024);
    expect(MAX_LOGO_OUTPUT_BYTES).toBe(2 * 1024 * 1024);
    expect(MAX_LOGO_DECODE_TIME_MS).toBe(2000);
    expect(LOGO_DISPLAY_TARGETS.map((target) => target.id)).toEqual([
      'favicon', 'toolbar', 'titlebar', 'sidebar', 'installer',
    ]);
  });

  it('validates signature and metadata before decoding', () => {
    expect(validateLogoBytes(pngHeader(128, 64))).toMatchObject({
      ok: true,
      mimeType: 'image/png',
      width: 128,
      height: 64,
      hasAlpha: true,
      frameCount: 1,
    });
    expect(validateLogoBytes(new Uint8Array([1, 2, 3]))).toMatchObject({
      ok: false,
      code: 'unsupported-format',
    });
  });

  it('rejects animated and dangerous dimensions without invoking a decoder', () => {
    expect(validateLogoBytes(pngHeader(64, 64, ['acTL']))).toMatchObject({ ok: false, code: 'animated' });
    expect(validateLogoBytes(pngHeader(MAX_LOGO_DIMENSION + 1, 1))).toMatchObject({ ok: false, code: 'too-large-dimension' });
    expect(validateLogoBytes(pngHeader(4096, 4096))).toMatchObject({ ok: true });
  });

  it('normalizes state and never lets a remote custom source become active', () => {
    const normalized = normalizeLogoState({
      schemaVersion: 999,
      presetId: 'missing',
      custom: { mimeType: 'image/svg+xml', dataUrl: 'https://example.invalid/logo.svg' },
      fit: 'cover',
      focalPoint: { x: 7, y: -3 },
      crop: { x: 0.2, y: 0.1, width: 2, height: 2 },
    });
    expect(normalized.presetId).toBe(DEFAULT_LOGO_STATE.presetId);
    expect(normalized.custom).toBeNull();
    expect(normalized.focalPoint).toEqual({ x: 1, y: 0 });
    expect(normalized.crop.x).toBe(0.2);
    expect(normalized.crop.width).toBe(0.8);
    expect(normalized.crop.height).toBe(0.9);
  });
});

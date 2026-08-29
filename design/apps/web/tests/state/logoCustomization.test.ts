import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_LOGO_STATE,
  LOGO_STORAGE_KEY,
  LOGO_HISTORY_STORAGE_KEY,
  MAX_LOGO_DIMENSION,
  MAX_LOGO_DECODE_TIME_MS,
  MAX_LOGO_OUTPUT_BYTES,
  MAX_LOGO_AGGREGATE_BYTES,
  LOGO_DISPLAY_TARGETS,
  LOGO_PRESETS,
  isSafeBundledSvgPreset,
  parseLogoStateFile,
  resolveScheduledLogoState,
  serializeLogoState,
  MAX_LOGO_SOURCE_BYTES,
  normalizeLogoState,
  redactLogoStateForDaemon,
  validateLogoBytes,
  fileToValidatedBytes,
  getLogoStateStore,
  resetLogoStateStoreForTests,
  classifyLogoWallTime,
  validateLogoSchedule,
  clampLogoCropToPixels,
  writeStoredLogoState,
  type LogoState,
} from '../../src/state/logoCustomization';

function fixtureCrc(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return (value ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: number[]): Uint8Array {
  const bytes = new Uint8Array(12 + data.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, data.length, false);
  bytes.set(Array.from(type).map((char) => char.charCodeAt(0)), 4);
  bytes.set(data, 8);
  view.setUint32(8 + data.length, fixtureCrc(bytes.subarray(4, 8 + data.length)), false);
  return bytes;
}

function pngFixture(width: number, height: number, animated = false): Uint8Array {
  const signature = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = pngChunk('IHDR', [
    (width >>> 24) & 0xff, (width >>> 16) & 0xff, (width >>> 8) & 0xff, width & 0xff,
    (height >>> 24) & 0xff, (height >>> 16) & 0xff, (height >>> 8) & 0xff, height & 0xff,
    8, 6, 0, 0, 0,
  ]);
  const idat = pngChunk('IDAT', [0x78, 0x9c, 0x63, 0x60, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01]);
  const animation = animated ? pngChunk('acTL', [0, 0, 0, 1, 0, 0, 0, 0]) : new Uint8Array();
  const iend = pngChunk('IEND', []);
  const all = new Uint8Array(signature.length + ihdr.length + animation.length + idat.length + iend.length);
  let offset = 0;
  for (const chunk of [signature, ihdr, animation, idat, iend]) { all.set(chunk, offset); offset += chunk.length; }
  return all;
}

function jpegFixture(withEoi = true): Uint8Array {
  const bytes = [
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00,
    0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
    0x00,
    ...(withEoi ? [0xff, 0xd9] : []),
  ];
  return Uint8Array.from(bytes);
}

function webpFixture(correctSize = true): Uint8Array {
  const chunks = [
    // VP8X extension, with a 1×1 canvas and no animation flag.
    0x56, 0x50, 0x38, 0x58, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    // Minimal VP8 key-frame header: start code 9d 01 2a, width 1, height 1.
    0x56, 0x50, 0x38, 0x20, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x9d, 0x01, 0x2a, 0x01, 0x00, 0x01, 0x00,
  ];
  const bytes = new Uint8Array(12 + chunks.length);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0);
  new DataView(bytes.buffer).setUint32(4, correctSize ? bytes.length - 8 : 0, true);
  bytes.set([0x57, 0x45, 0x42, 0x50], 8);
  bytes.set(chunks, 12);
  return bytes;
}

describe('app-logo customization contract', () => {
  it('keeps the bounded private storage contract explicit', () => {
    expect(LOGO_STORAGE_KEY).toBe('open-design:app-logo:v1');
    expect(LOGO_HISTORY_STORAGE_KEY).toBe('open-design:app-logo-history:v1');
    expect(MAX_LOGO_SOURCE_BYTES).toBe(8 * 1024 * 1024);
    expect(MAX_LOGO_OUTPUT_BYTES).toBe(2 * 1024 * 1024);
    expect(MAX_LOGO_AGGREGATE_BYTES).toBe(8 * 1024 * 1024);
    expect(MAX_LOGO_DECODE_TIME_MS).toBe(2000);
    expect(LOGO_DISPLAY_TARGETS.map((target) => target.id)).toEqual([
      'favicon', 'toolbar', 'titlebar', 'sidebar', 'installer',
    ]);
  });

  it('validates signature and metadata before decoding', () => {
    expect(validateLogoBytes(pngFixture(128, 64))).toMatchObject({
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

  it('derives the accepted MIME from bytes instead of the filename or MIME claim', async () => {
    const file = new File([pngFixture(2, 3)], 'looks-like-a-jpeg.jpg', { type: 'image/jpeg' });
    const { validation } = await fileToValidatedBytes(file);
    expect(validation).toMatchObject({ ok: true, mimeType: 'image/png', width: 2, height: 3 });
  });

  it('keeps four distinct presets as safe local SVGs', () => {
    expect(new Set(LOGO_PRESETS.map((preset) => preset.src)).size).toBe(4);
    expect(LOGO_PRESETS.every(isSafeBundledSvgPreset)).toBe(true);
  });

  it('proves the safety Shek Qs red on a real mutation and green after restoration', () => {
    const preset = LOGO_PRESETS[0];
    const unsafe = { ...preset, src: `${preset.src}%3Cscript%3Ealert(1)%3C%2Fscript%3E` };
    expect(isSafeBundledSvgPreset(unsafe)).toBe(false);
    expect(isSafeBundledSvgPreset(preset)).toBe(true);

    const valid = pngFixture(1, 1);
    const originalTail = valid[valid.length - 1];
    valid[valid.length - 1] = originalTail ^ 0xff;
    expect(validateLogoBytes(valid)).toMatchObject({ ok: false, code: 'malformed' });
    valid[valid.length - 1] = originalTail;
    expect(validateLogoBytes(valid)).toMatchObject({ ok: true, mimeType: 'image/png' });
  });

  it('rejects animated and dangerous dimensions without invoking a decoder', () => {
    expect(validateLogoBytes(pngFixture(64, 64, true))).toMatchObject({ ok: false, code: 'animated' });
    expect(validateLogoBytes(pngFixture(MAX_LOGO_DIMENSION + 1, 1))).toMatchObject({ ok: false, code: 'too-large-dimension' });
    expect(validateLogoBytes(pngFixture(4096, 4096))).toMatchObject({ ok: true });
    const corrupted = pngFixture(1, 1);
    corrupted[corrupted.length - 1] = 0;
    expect(validateLogoBytes(corrupted)).toMatchObject({ ok: false, code: 'malformed' });
  });

  it('checks complete JPEG segment framing and WebP RIFF/image framing', () => {
    expect(validateLogoBytes(jpegFixture())).toMatchObject({ ok: true, mimeType: 'image/jpeg', width: 1, height: 1 });
    expect(validateLogoBytes(jpegFixture(false))).toMatchObject({ ok: false, code: 'malformed' });
    expect(validateLogoBytes(webpFixture())).toMatchObject({ ok: true, mimeType: 'image/webp', width: 1, height: 1 });
    expect(validateLogoBytes(webpFixture(false))).toMatchObject({ ok: false, code: 'malformed' });
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

  it('rejects unknown schemas and round-trips the scheduled appearance file', () => {
    const state = {
      ...DEFAULT_LOGO_STATE,
      schedules: [{ id: 'rule-1', label: 'Warm workday', enabled: true, startAt: '2026-08-27T00:00:00.000Z', endAt: '2026-08-28T00:00:00.000Z', weekdays: [4], timezone: 'UTC', patch: { presetId: 'warm' as const } }],
    };
    const parsed = parseLogoStateFile(serializeLogoState(state));
    expect(parsed.ok).toBe(true);
    expect(parseLogoStateFile(JSON.stringify({ kind: 'open-design.app-logo', version: 999, state }))).toMatchObject({ ok: false, code: 'future-version' });
    const active = resolveScheduledLogoState(state, new Date('2026-08-27T12:00:00.000Z'));
    expect(active.presetId).toBe('warm');
    expect(active.custom).toBeNull();
    expect(resolveScheduledLogoState(state, new Date('2026-08-28T00:00:00.000Z')).presetId).toBe('material');
  });

  it('rejects unexpected top-level import fields instead of silently dropping them', () => {
    const parsed = JSON.parse(serializeLogoState(DEFAULT_LOGO_STATE)) as Record<string, unknown>;
    parsed.unexpected = true;
    expect(parseLogoStateFile(JSON.stringify(parsed))).toMatchObject({ ok: false, code: 'malformed' });
  });

  it('rejects nested extras and clamps an edge crop to real source pixels', () => {
    const parsed = JSON.parse(serializeLogoState(DEFAULT_LOGO_STATE)) as { state: Record<string, unknown> };
    (parsed.state.crop as Record<string, unknown>).unexpected = true;
    expect(parseLogoStateFile(JSON.stringify(parsed))).toMatchObject({ ok: false, code: 'malformed' });
    const focal = JSON.parse(serializeLogoState(DEFAULT_LOGO_STATE)) as { state: Record<string, unknown> };
    (focal.state.focalPoint as Record<string, unknown>).unexpected = true;
    expect(parseLogoStateFile(JSON.stringify(focal))).toMatchObject({ ok: false, code: 'malformed' });
    expect(clampLogoCropToPixels({ x: 0.99, y: 0.99, width: 1, height: 1 }, 4, 2)).toEqual({ x: 0.75, y: 0.5, width: 0.25, height: 0.5 });
  });

  it('classifies IANA timezones and daylight-saving wall-clock boundaries', () => {
    expect(classifyLogoWallTime('2026-03-08T02:30', 'America/Toronto')).toBe('skipped');
    expect(classifyLogoWallTime('2026-11-01T01:30', 'America/Toronto')).toBe('ambiguous');
    expect(classifyLogoWallTime('2026-03-08T03:30', 'America/Toronto')).toBe('valid');
    expect(classifyLogoWallTime('2026-03-08T03:30', 'Not/AZone')).toBe('invalid-timezone');
    expect(validateLogoSchedule({ startAt: '2026-03-08T02:30', endAt: '2026-03-08T04:00', timezone: 'America/Toronto' })).toMatchObject({ ok: false, code: 'skipped-start' });
  });

  it('rejects non-numeric and out-of-range schedule crop and focal patches', () => {
    const serialized = JSON.parse(serializeLogoState(DEFAULT_LOGO_STATE)) as { state: Record<string, unknown> };
    serialized.state.schedules = [{ id: 'bounded', label: 'Bounded', enabled: true, startAt: '2026-08-27T00:00', endAt: '2026-08-28T00:00', weekdays: [4], timezone: 'UTC', patch: { crop: { x: '0.1', y: 0, width: 1, height: 1 }, focalPoint: { x: 0.5, y: 0.5 } } }];
    expect(parseLogoStateFile(JSON.stringify(serialized))).toMatchObject({ ok: false, code: 'malformed' });
    const outOfRange = JSON.parse(serializeLogoState(DEFAULT_LOGO_STATE)) as { state: Record<string, unknown> };
    outOfRange.schedules = [{ id: 'bounded', label: 'Bounded', enabled: true, startAt: '2026-08-27T00:00', endAt: '2026-08-28T00:00', weekdays: [4], timezone: 'UTC', patch: { crop: { x: 0.8, y: 0, width: 0.5, height: 1 } } }];
    expect(parseLogoStateFile(JSON.stringify(outOfRange))).toMatchObject({ ok: false, code: 'malformed' });
  });

  it('returns one shared external store for every host wrapper', () => {
    resetLogoStateStoreForTests();
    const first = getLogoStateStore(DEFAULT_LOGO_STATE);
    const second = getLogoStateStore({ ...DEFAULT_LOGO_STATE, presetId: 'warm' });
    expect(second).toBe(first);
    first.setState({ ...DEFAULT_LOGO_STATE, presetId: 'outline' });
    expect(second.getSnapshot().presetId).toBe('outline');
    resetLogoStateStoreForTests();
  });

  it('owns persistence and daemon acknowledgement once for multiple subscribers', async () => {
    resetLogoStateStoreForTests();
    const store = getLogoStateStore(DEFAULT_LOGO_STATE);
    const firstBridge = vi.fn(() => true);
    const secondBridge = vi.fn(() => true);
    const releaseFirst = store.configurePersistence(firstBridge, 'C1');
    const releaseSecond = store.configurePersistence(secondBridge, 'C0');
    const receipts: number[] = [];
    const unsubscribeA = store.subscribeMutations((receipt) => receipts.push(receipt.sequence));
    const unsubscribeB = store.subscribeMutations((receipt) => receipts.push(receipt.sequence));
    const sequence = store.setState({ ...DEFAULT_LOGO_STATE, presetId: 'warm' }, 'selected-preset');
    await Promise.resolve();
    await Promise.resolve();
    expect(firstBridge).not.toHaveBeenCalled();
    expect(secondBridge).toHaveBeenCalledTimes(1);
    expect(secondBridge.mock.calls[0][0]).toMatchObject({ sequence, state: expect.any(Object), signal: expect.any(AbortSignal) });
    expect(receipts).toEqual([sequence, sequence, sequence, sequence]);
    unsubscribeA();
    unsubscribeB();
    releaseFirst();
    releaseSecond();
    resetLogoStateStoreForTests();
  });

  it('aborts stale daemon writes and lets only the newest sequence complete', async () => {
    resetLogoStateStoreForTests();
    const store = getLogoStateStore(DEFAULT_LOGO_STATE);
    let releaseFirstRequest: (() => void) | undefined;
    const writes: number[] = [];
    const bridge = vi.fn(async ({ sequence, signal }: { sequence: number; signal: AbortSignal }) => {
      if (sequence === 1) await new Promise<void>((resolve) => { releaseFirstRequest = resolve; });
      if (signal.aborted) return false;
      writes.push(sequence);
      return true;
    });
    const release = store.configurePersistence(bridge, 'C0');
    const receipts: Array<{ sequence: number; daemonAcknowledged: boolean | null }> = [];
    const unsubscribe = store.subscribeMutations((receipt) => receipts.push({ sequence: receipt.sequence, daemonAcknowledged: receipt.daemonAcknowledged }));
    const first = store.setState({ ...DEFAULT_LOGO_STATE, presetId: 'warm' }, 'selected-preset');
    await Promise.resolve();
    const second = store.setState({ ...DEFAULT_LOGO_STATE, presetId: 'outline' }, 'selected-preset');
    releaseFirstRequest?.();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(first).toBe(1);
    expect(second).toBe(2);
    expect(bridge).toHaveBeenCalledTimes(2);
    expect((bridge.mock.calls[0][0] as { signal: AbortSignal }).signal.aborted).toBe(true);
    expect(writes).toEqual([second]);
    expect(receipts.filter((receipt) => receipt.sequence === first)).toEqual([{ sequence: first, daemonAcknowledged: null }]);
    expect(receipts).toContainEqual({ sequence: second, daemonAcknowledged: true });
    unsubscribe();
    release();
    resetLogoStateStoreForTests();
  });

  it('never reports a daemon success when no real persistence bridge is mounted', () => {
    resetLogoStateStoreForTests();
    const store = getLogoStateStore(DEFAULT_LOGO_STATE);
    const receipts: Array<{ bridgeConfigured: boolean; daemonAcknowledged: boolean | null }> = [];
    const unsubscribe = store.subscribeMutations((receipt) => receipts.push({ bridgeConfigured: receipt.bridgeConfigured, daemonAcknowledged: receipt.daemonAcknowledged }));
    store.setState({ ...DEFAULT_LOGO_STATE, presetId: 'warm' }, 'selected-preset');
    expect(receipts).toEqual([{ bridgeConfigured: false, daemonAcknowledged: false }]);
    unsubscribe();
    resetLogoStateStoreForTests();
  });

  it('keeps the newest in-memory choice when persistence is refused', () => {
    const setItem = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => { throw new Error('storage refused'); });
    try {
      expect(writeStoredLogoState({ ...DEFAULT_LOGO_STATE, presetId: 'warm' })).toBe(false);
    } finally {
      setItem.mockRestore();
    }
  });

  it('keeps source alpha and focal zero as factual values', () => {
    const normalized = normalizeLogoState({ ...DEFAULT_LOGO_STATE, focalPoint: { x: 0, y: 0 }, background: '#11223380' });
    expect(normalized.focalPoint).toEqual({ x: 0, y: 0 });
    expect(normalized.background).toBe('#11223380');
  });

  it('keeps the canonical source private while daemon state remains restorable', () => {
    const bytes = pngFixture(1, 1);
    const encoded = btoa(String.fromCharCode(...bytes));
    const state = normalizeLogoState({
      ...DEFAULT_LOGO_STATE,
      custom: {
        dataUrl: `data:image/png;base64,${encoded}`,
        mimeType: 'image/png',
        byteLength: bytes.byteLength,
        width: 1,
        height: 1,
        hasAlpha: true,
        frameCount: 1,
        sourceMimeType: 'image/png',
        sourceHasAlpha: true,
        sourceDataUrl: `data:image/png;base64,${encoded}`,
        variants: {
          favicon: { dataUrl: `data:image/png;base64,${encoded}`, byteLength: bytes.byteLength, width: 1, height: 1, hasAlpha: true, frameCount: 1 },
        },
      },
      rainbowSpeedLevel: 4,
    });
    expect(state.custom).not.toBeNull();
    const daemonState = redactLogoStateForDaemon(state);
    expect(daemonState.custom).toBeNull();
    expect(JSON.stringify(daemonState)).not.toMatch(/dataUrl|sourceDataUrl|variants|byteLength|sourceMimeType|sourceHasAlpha|renderFingerprint/u);
    const exported = JSON.parse(serializeLogoState(state)) as { state: Record<string, unknown> };
    expect(exported.state.custom).toBeNull();
    expect(JSON.stringify(exported)).not.toMatch(/dataUrl|sourceDataUrl|variants|byteLength|sourceMimeType|sourceHasAlpha|renderFingerprint/u);
    expect(resolveScheduledLogoState({ ...state, schedules: [{ id: 'weekday', label: 'Thursday', enabled: true, startAt: '2026-08-27T00:00:00.000Z', endAt: '2026-08-28T00:00:00.000Z', weekdays: [4], timezone: 'UTC', patch: { background: 'rainbow', rainbowSpeedLevel: 2 } }] }, new Date('2026-08-27T12:00:00.000Z')).background).toBe('rainbow');
    expect(resolveScheduledLogoState({ ...state, schedules: [{ id: 'weekday', label: 'Thursday', enabled: true, startAt: '2026-08-27T00:00:00.000Z', endAt: '2026-08-28T00:00:00.000Z', weekdays: [4], timezone: 'UTC', patch: { background: 'rainbow', rainbowSpeedLevel: 2 } }] }, new Date('2026-08-28T12:00:00.000Z')).background).toBe('transparent');
  });

  it('redacts custom bytes from the persistence bridge while retaining the local cache', async () => {
    resetLogoStateStoreForTests();
    const bytes = pngFixture(1, 1);
    const encoded = btoa(String.fromCharCode(...bytes));
    const custom = {
      dataUrl: `data:image/png;base64,${encoded}`,
      mimeType: 'image/png' as const,
      byteLength: bytes.byteLength,
      width: 1,
      height: 1,
      hasAlpha: true,
      frameCount: 1 as const,
      sourceMimeType: 'image/png' as const,
      sourceHasAlpha: true,
      sourceDataUrl: `data:image/png;base64,${encoded}`,
      variants: { favicon: { dataUrl: `data:image/png;base64,${encoded}`, byteLength: bytes.byteLength, width: 1, height: 1, hasAlpha: true, frameCount: 1 as const } },
    };
    const localState = normalizeLogoState({ ...DEFAULT_LOGO_STATE, custom });
    expect(localState.custom).not.toBeNull();
    const bridge = vi.fn(() => true);
    const store = getLogoStateStore(DEFAULT_LOGO_STATE);
    const release = store.configurePersistence(bridge, 'C0');
    store.setState(localState, 'uploaded-custom');
    await Promise.resolve();
    await Promise.resolve();
    expect(store.getSnapshot().custom).not.toBeNull();
    expect(bridge).toHaveBeenCalledTimes(1);
    const payload = bridge.mock.calls[0][0] as { state: LogoState };
    expect(payload.state.custom).toBeNull();
    expect(JSON.stringify(payload.state)).not.toMatch(/dataUrl|sourceDataUrl|variants|byteLength|sourceMimeType|sourceHasAlpha|renderFingerprint/u);
    release();
    resetLogoStateStoreForTests();
  });

  it('keeps a cross-midnight rule active into the next wall-clock day', () => {
    const state = {
      ...DEFAULT_LOGO_STATE,
      schedules: [{
        id: 'overnight',
        label: 'Thursday overnight',
        enabled: true,
        startAt: '2026-08-27T23:00',
        endAt: '2026-08-28T02:00',
        weekdays: [4],
        timezone: 'UTC',
        patch: { presetId: 'warm' as const },
      }],
    };
    expect(resolveScheduledLogoState(state, new Date('2026-08-28T01:30:00.000Z')).presetId).toBe('warm');
    expect(resolveScheduledLogoState(state, new Date('2026-08-28T02:00:00.000Z')).presetId).toBe('material');
  });

  it('treats local as a real timezone sentinel rather than an invalid IANA name', () => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local';
    const now = new Date();
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone === 'local' ? undefined : timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
    }).formatToParts(now).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
    const weekday = ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as Record<string, number>)[parts.weekday as string] ?? 0;
    const localDate = `${parts.year}-${parts.month}-${parts.day}`;
    const state = {
      ...DEFAULT_LOGO_STATE,
      schedules: [{
        id: 'local-now',
        label: 'Local now',
        enabled: true,
        startAt: `${localDate}T00:00`,
        endAt: `${localDate}T23:59`,
        weekdays: [weekday],
        timezone,
        patch: { presetId: 'outline' as const },
      }],
    };
    expect(resolveScheduledLogoState(state, now).presetId).toBe('outline');
    const localSentinelState = { ...state, schedules: state.schedules.map((rule) => ({ ...rule, timezone: 'local' })) };
    expect(resolveScheduledLogoState(localSentinelState, now).presetId).toBe('outline');
  });
});

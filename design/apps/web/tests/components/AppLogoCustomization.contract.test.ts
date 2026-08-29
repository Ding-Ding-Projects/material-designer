import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sourceRoot = resolve(__dirname, '../../src');
const component = readFileSync(resolve(sourceRoot, 'components/logo/LogoCustomizationSection.tsx'), 'utf8');
const moduleSource = readFileSync(resolve(sourceRoot, 'state/logoCustomization.ts'), 'utf8');
const workerSource = readFileSync(resolve(sourceRoot, 'components/logo/logo-decoder.worker.ts'), 'utf8');
const siteLogo = readFileSync(resolve(__dirname, '../../../../site/assets/js/logo.js'), 'utf8');
const siteDecoder = readFileSync(resolve(__dirname, '../../../../site/assets/js/logo-decoder.worker.js'), 'utf8');

describe('app-logo surface inventory', () => {
  it('keeps the hand-written feature surface and safe local routes present', () => {
    for (const marker of [
      'data-testid="logo-customization-section"',
      'data-testid="logo-custom-upload"',
      'data-testid="logo-live-preview"',
      'data-testid={`logo-target-${target.id}`}',
      'InfiniteColorPicker',
      'RegexSearchField',
      'type="number"',
      'safeArea',
      'focalPoint',
      'variants',
      'renderFingerprint',
      'logoRenderFingerprint',
      'sourceDataUrl',
      'redactLogoStateForDaemon',
      'sourceDataUrl',
      'logoRenderFingerprint',
      'data-logo-history-list',
      'scheduleWeekdays',
      'scheduleDelete',
      'rainbowSpeedLevel',
      'parseLogoStateFile',
      'serializeLogoState',
      'resolveScheduledLogoState',
      'isSafeBundledSvgPreset',
      'installerPreviewOnly',
      'onChangeRef',
      'LOGO_MOUNT_POINTS',
      'LogoCustomizationMountProps',
      'LogoCustomizationC0',
      'LogoCustomizationC1',
      'LogoCustomizationC4',
      'data-logo-mount-point',
      'logo-schedule-search',
      'LogoCopy',
      'DEFAULT_LOGO_COPY',
      'injectedCopy',
      'LogoStateStore',
      'injectedStore',
      'useSyncExternalStore',
      'uploadGenerationRef',
      'refreshAbortRef',
      'acknowledgementGenerationRef',
      'AbortController',
    ]) expect(component).toContain(marker);
    expect(component).not.toMatch(/\bt\(['"]appLogo\./u);
  });

  it('keeps signature-first bounds, static-frame refusal, and stable identity separation', () => {
    for (const marker of [
      'MAX_LOGO_SOURCE_BYTES',
      'MAX_LOGO_OUTPUT_BYTES',
      'MAX_LOGO_FRAMES',
      'MAX_LOGO_DECODE_TIME_MS',
      "code: 'animated'",
      'createImageBitmap',
      'LOGO_STORAGE_KEY',
      'Stable app identity is intentionally absent',
      'hasAlpha: validation.hasAlpha',
      'materializeWorkerAsset',
      'output-invalid',
      'new Worker',
      'decode-timeout',
      'worker.terminate',
    ]) expect(moduleSource).toContain(marker);
    expect(moduleSource).not.toContain('fetch(');
    expect(moduleSource).not.toContain('Promise.race');
    expect(workerSource).toContain('createImageBitmap');
    expect(workerSource).toContain('OffscreenCanvas');
    expect(workerSource).toContain('convertToBlob');
  });

  it('keeps the documentation-site binary and persistence boundaries wired', () => {
    for (const marker of ['HISTORY_KEY', 'MAX_SOURCE_BYTES', 'MAX_AGGREGATE_BYTES', 'file.size > MAX_SOURCE_BYTES', 'CRC_TABLE', 'data-logo-color-translations', 'data-logo-history-list', 'logo-decoder.worker.js', 'decode-timeout', 'worker.terminate', 'source-retention-timeout']) {
      expect(siteLogo).toContain(marker);
    }
    for (const marker of ['createImageBitmap', 'OffscreenCanvas', 'convertToBlob', 'postMessage', 'cropToPixels', 'MAX_OUTPUT_BYTES']) expect(siteDecoder).toContain(marker);
    expect(siteLogo).not.toContain('Promise.race');
    expect(siteLogo).not.toContain('createImageBitmap');
    expect(siteLogo).toContain('export function mount(host');
    expect(siteLogo).not.toContain('site/index.html');
  });

  it('keeps exact logo registrations unique instead of trusting substrings', () => {
    for (const id of ['appearance.logo', 'appearance.logo.upload', 'appearance.logo.fit', 'appearance.logo.crop', 'appearance.logo.safeArea', 'appearance.logo.background', 'appearance.logo.schedule', 'appearance.logo.export']) {
      expect(component.split(`data-od-setting="${id}"`).length - 1).toBeGreaterThan(0);
    }
    expect(component.split('data-testid="logo-schedule-search"').length - 1).toBe(1);
  });
});

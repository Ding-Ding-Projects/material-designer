import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sourceRoot = resolve(__dirname, '../../src');
const component = readFileSync(resolve(sourceRoot, 'components/logo/LogoCustomizationSection.tsx'), 'utf8');
const moduleSource = readFileSync(resolve(sourceRoot, 'state/logoCustomization.ts'), 'utf8');
const appSource = readFileSync(resolve(sourceRoot, 'App.tsx'), 'utf8');
const chromeStyles = readFileSync(resolve(sourceRoot, 'styles/shell.css'), 'utf8');

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
    ]) expect(component).toContain(marker);
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
    ]) expect(moduleSource).toContain(marker);
    expect(moduleSource).not.toContain('fetch(');
  });

  it('restores the stored selection before the app renders chrome', () => {
    expect(appSource).toContain('applyLogoStateToDocument(readStoredLogoState())');
    expect(chromeStyles).toContain('var(--app-logo-image)');
    expect(chromeStyles).toContain('html[data-logo-preset]');
  });
});

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sourceRoot = resolve(__dirname, '../../src');
const component = readFileSync(resolve(sourceRoot, 'components/logo/LogoCustomizationSection.tsx'), 'utf8');
const moduleSource = readFileSync(resolve(sourceRoot, 'state/logoCustomization.ts'), 'utf8');
const appSource = readFileSync(resolve(sourceRoot, 'App.tsx'), 'utf8');
const chromeStyles = readFileSync(resolve(sourceRoot, 'styles/shell.css'), 'utf8');
const siteLogo = readFileSync(resolve(__dirname, '../../../../site/assets/js/logo.js'), 'utf8');
const siteIndex = readFileSync(resolve(__dirname, '../../../../site/index.html'), 'utf8');
const configState = readFileSync(resolve(sourceRoot, 'state/config.ts'), 'utf8');
const palette = readFileSync(resolve(sourceRoot, 'components/command-palette/CommandPalette.tsx'), 'utf8');
const settingsIndex = readFileSync(resolve(sourceRoot, 'components/command-palette/settingsIndex.ts'), 'utf8');
const colorPicker = readFileSync(resolve(sourceRoot, 'components/appearance/InfiniteColorPicker.tsx'), 'utf8');

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
    expect(appSource).toContain('readStoredLogoState()');
    expect(appSource).toContain('resolveScheduledLogoState(source)');
    expect(appSource).toContain('window.setInterval(applyScheduledLogo, 60_000)');
    expect(chromeStyles).toContain('var(--app-logo-image)');
    expect(chromeStyles).toContain('html[data-logo-preset]');
  });

  it('keeps the Day Teet Hui binary and persistence boundaries wired', () => {
    for (const marker of ['HISTORY_KEY', 'MAX_SOURCE_BYTES', 'MAX_AGGREGATE_BYTES', 'file.size > MAX_SOURCE_BYTES', 'CRC_TABLE', 'createImageBitmap', 'roundTrip', 'data-logo-color-translations', 'data-logo-history-list', 'installerPreviewOnly']) {
      expect(siteLogo).toContain(marker);
    }
    expect(siteIndex).toContain('data-logo-color-field');
    expect(siteIndex).toContain('targets.every');
    expect(configState).toContain('normalizeLogoState(daemonConfig.appLogo)');
    expect(configState).toContain('appLogo: config.appLogo');
    expect(palette).toContain("case 'appearance.logo'");
    expect(settingsIndex).toContain("control: 'appearance.logo'");
    expect(colorPicker).toContain("appearance.color.editValue");
  });
});

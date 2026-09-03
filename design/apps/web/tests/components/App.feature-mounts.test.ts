import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceRoot = resolve(__dirname, '../../src');
const appSource = readFileSync(resolve(sourceRoot, 'App.tsx'), 'utf8');
const settingsSource = readFileSync(resolve(sourceRoot, 'components/SettingsDialog.tsx'), 'utf8');

describe('feature mount registration', () => {
  it('keeps the universal runtime mounted at the application shell', () => {
    expect(appSource).toContain("import { UniversalSettingsRuntime } from './components/universal-settings';");
    expect(appSource).toContain('<UniversalSettingsRuntime />');
    expect(appSource).toContain('<AppearanceRuntime />');
    expect(appSource).toContain('<ElementAppearanceBoundary>');
  });

  it('keeps addressable routes for the local feature surfaces', () => {
    for (const path of [
      "pathname === '/features'",
      "pathname === '/documentation'",
      "pathname === '/changelog'",
      "pathname === '/file-converter'",
      "pathname === '/ollama'",
      "pathname === '/authenticator'",
      "pathname === '/status'",
      "pathname === '/unlock-ladder'",
    ]) {
      expect(appSource).toContain(path);
    }
    expect(appSource).toContain('<DocumentationBrowserView />');
    expect(appSource).toContain('<CanonicalFeatureHub');
    expect(appSource).toContain('<ChangelogDialog initialOpen mountId="C0" />');
    expect(appSource).toContain('<FileConverterView />');
    expect(appSource).toContain('<OllamaSuiteManager />');
    expect(appSource).toContain('<AuthenticatorDestination');
    expect(appSource).toContain('<StatusHubPanel');
    expect(appSource).toContain('<UnlockLadder');
  });

  it('keeps Settings as a real entry point for universal controls and local tools', () => {
    expect(settingsSource).toContain('<UniversalSettingsPanel');
    expect(settingsSource).toContain('mountPersonalVocabularySettings()');
    expect(settingsSource).toContain('<LogoCustomizationC1 />');
    expect(settingsSource).toContain('registerSettingsTabAppearanceConsumer');
    expect(settingsSource).toContain('emitSettingsTabAppearanceRequest');
    for (const href of [
      'href="/features"',
      'href="/documentation"',
      'href="/changelog"',
      'href="/file-converter"',
      'href="/ollama"',
      'href="/authenticator"',
      'href="/status"',
      'href="/unlock-ladder/default"',
    ]) {
      expect(settingsSource).toContain(href);
    }
    expect(settingsSource).toContain("openChangelogViewer('C0')");
  });

  it('suppresses the startup surprise while School mode is active', () => {
    const surpriseSource = readFileSync(resolve(sourceRoot, 'components/DimSumSurprise.tsx'), 'utf8');
    expect(surpriseSource).toContain("window.addEventListener('material-designer:universal-school-mode'");
    expect(surpriseSource).toContain('schoolModeEnabled || updateInFlight');
  });
});

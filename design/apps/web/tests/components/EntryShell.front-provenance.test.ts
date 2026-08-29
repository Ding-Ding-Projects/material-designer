import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceRoot = resolve(__dirname, '../../src');
const appSource = readFileSync(resolve(sourceRoot, 'App.tsx'), 'utf8');
const entryShellSource = readFileSync(resolve(sourceRoot, 'components/EntryShell.tsx'), 'utf8');
const provenanceSource = readFileSync(resolve(sourceRoot, 'components/FrontScreenProvenance.tsx'), 'utf8');
const localeRoot = resolve(sourceRoot, 'i18n/locales');
const localeSources = readdirSync(localeRoot)
  .filter((file) => file.endsWith('.ts'))
  .map((file) => readFileSync(resolve(localeRoot, file), 'utf8'));

describe('front-screen identity contracts', () => {
  it('mounts the provenance strip before the workspace tab chrome', () => {
    const provenanceMatch = appSource.match(/^\s*<FrontScreenProvenance\s*$/m);
    const provenance = provenanceMatch?.index ?? -1;
    const tabs = appSource.indexOf('<WorkspaceTabsBar');
    expect(provenance).toBeGreaterThanOrEqual(0);
    expect(tabs).toBeGreaterThan(provenance);
  });

  it('keeps navigation and authentication inert until version lookup settles', () => {
    expect(appSource).toContain('data-app-version-state={appVersionInfoSettled ? \'settled\' : \'loading\'}');
    expect(appSource).toContain('inert={!appVersionInfoSettled ? true : undefined}');
    expect(appSource).toContain('aria-hidden={!appVersionInfoSettled}');
    expect(appSource).toMatch(/fetchAppVersionInfo\(\)[\s\S]*?\.catch\(\(\) =>/);
  });

  it('announces loading, verified, and unavailable provenance politely', () => {
    expect(provenanceSource).toContain('<span className={styles.status} role="status">');
    expect(provenanceSource).not.toContain("role={verified ? 'status' : 'alert'}");
  });

  it('uses the product identity in the pre-authentication onboarding surface', () => {
    expect(entryShellSource).toContain('<h1 className="onboarding-cloud__title">{t(\'app.brand\')}</h1>');
    expect(entryShellSource).toContain('© {t(\'app.brand\')} ·');
    expect(entryShellSource).not.toContain('<h1 className="onboarding-cloud__title">{t(\'settings.onboardingCloudTitle\')}</h1>');
    for (const localeSource of localeSources) {
      expect(localeSource).not.toMatch(
        /['"]settings\.onboardingCloud(?:Title|SignIn)['"]\s*:[^\n,]*Open Design Cloud/,
      );
    }
  });
});

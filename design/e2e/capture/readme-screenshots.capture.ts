/**
 * Capture every screenshot `README.md` embeds, from the real application.
 *
 * The images under `assets/screenshots/` used to be captured by hand from a
 * packaged Windows build and then went stale — by the time this lane was
 * written the set still showed 0.16.2, and one image documented a settings
 * surface the product no longer had. This spec exists so the set can be
 * regenerated on any commit by anyone, on any platform the harness runs on:
 *
 *     pnpm --dir design/e2e capture:screenshots
 *
 * It boots the same application the smoke test does, through the same
 * worker-scoped `toolsDev` fixture, with the same mocked API responses — so
 * every capture is deterministic and its sample data is fictional, which
 * `AGENTS.md` requires of anything committed here.
 *
 * Each image is written beside a `.json` sidecar recording the commit, the
 * viewport, the scale, the locale and the theme it was taken at, so the
 * provenance travels with the file instead of living in a caption that drifts.
 */

import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@/playwright/suite';
import { applyStandardMocks, routeSignedOutVelaStatus, STORAGE_KEY } from '@/playwright/mock-factory';
import { ensureRailOpen, openNewProjectModal } from '@/playwright/rail';
import { settingsSurface } from '@/playwright/amr';
import { LOADING_SHELL_TEXT } from '@/loading-shell';
import { T } from '@/timeouts';
import type { Locator, Page } from '@playwright/test';

const captureDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(captureDir, '../../..');
const outputDir = join(repoRoot, 'assets', 'screenshots');

const LOCALE_KEY = 'open-design:locale';
const LOCALE_SOURCE_KEY = 'open-design:locale-source';
const APPEARANCE_KEY = 'open-design:appearance';

const commit = (() => {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
})();

const appVersion = (() => {
  try {
    return execFileSync('node', ['-p', "require('./package.json').version"], {
      cwd: join(repoRoot, 'design'),
      encoding: 'utf8',
    }).trim();
  } catch {
    return 'unknown';
  }
})();

type Seed = {
  /** Locale code as `open-design:locale` stores it, or `undefined` for English. */
  locale?: string;
  theme?: 'light' | 'dark';
  /** 1 is 100%. The README's scale image is 2. */
  uiScale?: number;
  onboardingCompleted?: boolean;
};

/**
 * Seed the three localStorage entries the application boots from, before any
 * script on the page runs. Theme lives in the app config, the locale in its
 * own pair of keys (the `-source` key is what marks the choice as the user's
 * rather than a guess from the browser), and UI scale in the appearance
 * preferences.
 */
async function seed(page: Page, options: Seed = {}): Promise<void> {
  const { locale, theme = 'light', uiScale = 1, onboardingCompleted = true } = options;
  await page.addInitScript(
    ({ configKey, localeKey, localeSourceKey, appearanceKey, config, localeCode, appearance }) => {
      window.localStorage.setItem(configKey, JSON.stringify(config));
      if (localeCode) {
        window.localStorage.setItem(localeKey, localeCode);
        window.localStorage.setItem(localeSourceKey, 'manual');
      }
      window.localStorage.setItem(appearanceKey, JSON.stringify(appearance));
    },
    {
      configKey: STORAGE_KEY,
      localeKey: LOCALE_KEY,
      localeSourceKey: LOCALE_SOURCE_KEY,
      appearanceKey: APPEARANCE_KEY,
      localeCode: locale ?? null,
      config: {
        mode: 'daemon',
        apiKey: '',
        baseUrl: 'https://api.anthropic.com',
        model: 'claude-sonnet-4-5',
        agentId: 'mock',
        skillId: null,
        designSystemId: null,
        onboardingCompleted,
        agentModels: {},
        privacyDecisionAt: 1,
        telemetry: { metrics: false, content: false, artifactManifest: false },
        theme,
      },
      appearance: { seed: 'sunset', density: 'default', uiScale, autoFit: false },
    },
  );
}

async function waitForLoadingToClear(page: Page): Promise<void> {
  await page.getByText(LOADING_SHELL_TEXT).waitFor({ state: 'hidden', timeout: T.long });
  await page.getByText('Loading OpenDesign…').waitFor({ state: 'hidden', timeout: T.long });
}

/** Dismiss the first-run privacy banner when a capture happens to raise it. */
async function dismissPrivacyBanner(page: Page): Promise<void> {
  const banner = page.locator('.privacy-consent-banner');
  if (await banner.isVisible().catch(() => false)) {
    await banner.getByRole('button', { name: /share/i }).first().click();
    await expect(banner).toHaveCount(0);
  }
}

async function gotoHome(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  await dismissPrivacyBanner(page);
  await expect(page.getByTestId('home-hero')).toBeVisible();
}

/**
 * Write the image and its provenance sidecar.
 *
 * `target` is a page for a whole-window capture and a locator when the README
 * caption is about one surface; either way the sidecar records the window the
 * application was laid out in, because that is what the geometry claims in the
 * captions depend on.
 */
async function shoot(
  page: Page,
  name: string,
  target: Page | Locator,
  describe: { screen: string; locale: string; theme: string; scale: number; note?: string },
): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  const file = join(outputDir, `${name}.png`);
  await target.screenshot({ path: file, animations: 'disabled', caret: 'hide' });
  const viewport = page.viewportSize();
  await writeFile(
    join(outputDir, `${name}.json`),
    `${JSON.stringify(
      {
        image: `${name}.png`,
        screen: describe.screen,
        capturedAt: new Date().toISOString(),
        commit,
        appVersion,
        method: 'design/e2e capture:screenshots — the application driven through the repository\'s Playwright harness, with mocked API responses',
        browser: 'chromium',
        platform: process.platform,
        viewport: viewport ? { width: viewport.width, height: viewport.height } : null,
        deviceScaleFactor: 1,
        uiScale: describe.scale,
        locale: describe.locale,
        theme: describe.theme,
        ...(describe.note ? { note: describe.note } : {}),
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
}

test.beforeEach(async ({ page }) => {
  await applyStandardMocks(page);
  await routeSignedOutVelaStatus(page);
  await page.route('**/api/workspace/directory', async (route) => {
    await route.fulfill({ json: { items: [] } });
  });
});

test('captures the home screen', async ({ page }) => {
  await seed(page);
  await gotoHome(page);
  await ensureRailOpen(page);
  await expect(page.getByTestId('entry-nav-home')).toHaveAttribute('aria-current', 'page');
  await shoot(page, 'home', page, { screen: 'home', locale: 'en', theme: 'light', scale: 1 });
});

test('captures the home screen in bilingual mode at a narrow window', async ({ page }) => {
  // The README's point about this image is the geometry: bilingual pairs both
  // languages on every label, so it produces the longest strings the product
  // can render, and the narrow window is where clipping shows up first.
  await page.setViewportSize({ width: 900, height: 800 });
  await seed(page, { locale: 'zh-HK' });
  await gotoHome(page);
  await ensureRailOpen(page);
  await shoot(page, 'home-bilingual-narrow', page, {
    screen: 'home',
    locale: 'zh-HK',
    theme: 'light',
    scale: 1,
    note: 'Narrow window: the longest strings the product renders.',
  });
});

test('captures the home screen at 200% UI scale', async ({ page }) => {
  await seed(page, { uiScale: 2 });
  await gotoHome(page);
  await shoot(page, 'home-scale-200', page, {
    screen: 'home',
    locale: 'en',
    theme: 'light',
    scale: 2,
  });
});

test('captures the home screen in dark theme', async ({ page }) => {
  await seed(page, { theme: 'dark' });
  await gotoHome(page);
  await ensureRailOpen(page);
  await shoot(page, 'home-dark', page, { screen: 'home', locale: 'en', theme: 'dark', scale: 1 });
});

test('captures the header search field', async ({ page }) => {
  await seed(page);
  await gotoHome(page);
  const search = page.getByTestId('entry-screen-header-search').or(page.getByTestId('entry-topbar-search')).first();
  if (await search.isVisible().catch(() => false)) {
    await search.click();
  }
  await shoot(page, 'home-header-search', page, {
    screen: 'home',
    locale: 'en',
    theme: 'light',
    scale: 1,
    note: 'Header search field focused.',
  });
});

test('captures the command palette', async ({ page }) => {
  await seed(page);
  await gotoHome(page);
  await page.keyboard.press('Control+Shift+F');
  const palette = page.getByTestId('command-palette').or(page.locator('.md-palette, .command-palette')).first();
  await expect(palette).toBeVisible({ timeout: T.medium });
  await shoot(page, 'command-palette', page, {
    screen: 'command-palette',
    locale: 'en',
    theme: 'light',
    scale: 1,
  });
});

test('captures the settings surface', async ({ page }) => {
  await seed(page);
  await gotoHome(page);
  await ensureRailOpen(page);
  const settingsButton = page.getByTestId('entry-settings-button');
  await expect(settingsButton).toBeVisible({ timeout: T.medium });
  await settingsButton.evaluate((element: HTMLElement) => element.click());
  const surface = settingsSurface(page);
  await expect(surface).toBeVisible();
  await expect(surface.getByTestId('settings-nav-execution')).toBeVisible();
  await shoot(page, 'settings', page, {
    screen: 'settings',
    locale: 'en',
    theme: 'light',
    scale: 1,
  });
});

test('captures onboarding in English, light', async ({ page }) => {
  await seed(page, { onboardingCompleted: false });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  await shoot(page, 'onboarding-english-light', page, {
    screen: 'onboarding',
    locale: 'en',
    theme: 'light',
    scale: 1,
  });
});

test('captures onboarding in Chinese, light', async ({ page }) => {
  await seed(page, { onboardingCompleted: false, locale: 'zh-TW' });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  await shoot(page, 'onboarding-chinese-light', page, {
    screen: 'onboarding',
    locale: 'zh-TW',
    theme: 'light',
    scale: 1,
  });
});

test('captures onboarding in Chinese, dark', async ({ page }) => {
  await seed(page, { onboardingCompleted: false, locale: 'zh-TW', theme: 'dark' });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  await shoot(page, 'onboarding-chinese-dark', page, {
    screen: 'onboarding',
    locale: 'zh-TW',
    theme: 'dark',
    scale: 1,
  });
});

test('captures the project workspace in English, dark', async ({ page }) => {
  await seed(page, { theme: 'dark' });
  await gotoHome(page);
  await createPrototypeProject(page, 'Aurora dashboard');
  await shoot(page, 'workspace-english-dark', page, {
    screen: 'project-workspace',
    locale: 'en',
    theme: 'dark',
    scale: 1,
  });
});

test('captures the project workspace in Chinese, dark', async ({ page }) => {
  await seed(page, { theme: 'dark', locale: 'zh-TW' });
  await gotoHome(page);
  await createPrototypeProject(page, 'Aurora dashboard');
  await shoot(page, 'workspace-chinese-dark', page, {
    screen: 'project-workspace',
    locale: 'zh-TW',
    theme: 'dark',
    scale: 1,
  });
});

test('captures the project workspace at the narrow supported window', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 800 });
  await seed(page, { theme: 'dark' });
  await gotoHome(page);
  await createPrototypeProject(page, 'Aurora dashboard');
  await shoot(page, 'workspace-narrow-dark', page, {
    screen: 'project-workspace',
    locale: 'en',
    theme: 'dark',
    scale: 1,
    note: 'Narrow supported window.',
  });
});

test('captures the loading shell', async ({ page }) => {
  await seed(page);
  // Hold the shell on screen by never answering the health probe the boot
  // waits on, so the state the user sees first can actually be photographed.
  await page.route('**/api/health', () => { /* never fulfilled */ });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText(LOADING_SHELL_TEXT)).toBeVisible({ timeout: T.medium });
  await shoot(page, 'loading-shell', page, {
    screen: 'loading-shell',
    locale: 'en',
    theme: 'light',
    scale: 1,
    note: 'Health probe held open so the boot state stays on screen.',
  });
});

async function createPrototypeProject(page: Page, name: string): Promise<void> {
  await openNewProjectModal(page);
  await page.getByTestId('new-project-tab-prototype').click();
  await page.getByTestId('new-project-name').fill(name);
  await page.getByTestId('create-project').click();
  await waitForLoadingToClear(page);
  await expect(page).toHaveURL(/\/projects\//);
  await expect(page.getByTestId('chat-composer')).toBeVisible({ timeout: T.long });
  await expect(page.getByTestId('file-workspace')).toBeVisible({ timeout: T.long });
}

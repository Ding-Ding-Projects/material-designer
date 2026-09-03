import { LOADING_SHELL_TEXT } from '@/loading-shell';
import { expect, test } from '@/playwright/suite';
import { applyStandardMocks } from '@/playwright/mock-factory';
import { ensureRailOpen } from '@/playwright/rail';
import { T } from '@/timeouts';

const RECENT_PROJECTS = Array.from({ length: 6 }, (_, i) => ({
  id: `proj-${i}`,
  name: `Project ${i}`,
  skillId: null,
  designSystemId: null,
  createdAt: 1700000000000 + i,
  updatedAt: 1700000000000 + i,
}));

// Regression boundary: the desktop update-ready prompt and the home composer's
// model picker can be open at the same time. The updater lives in the shared
// top-right cluster for both signed-in and signed-out shells. Signed-in keeps
// the prompt within the viewport; signed-out stays clear of the raised composer
// card and its popover in a compact window.

test.beforeEach(async ({ page }) => {
  await applyStandardMocks(page);
  await page.route('**/api/projects', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({ json: { projects: RECENT_PROJECTS } });
  });
  // Fake the packaged-desktop host bridge with a fully-downloaded update so
  // the nav rail shows the updater indicator and its ready prompt.
  await page.addInitScript(() => {
    const downloadedStatus = {
      arch: 'arm64',
      availableVersion: '0.14.1-prerelease.2',
      capabilities: {
        canApplyInPlace: false,
        canDownload: true,
        canOpenInstaller: true,
        requiresManualInstall: true,
      },
      channel: 'prerelease',
      currentVersion: '0.14.1-prerelease.1',
      downloadPath: '/tmp/open-design-update.dmg',
      enabled: true,
      mode: 'package-launcher',
      platform: 'darwin',
      state: 'downloaded',
      supported: true,
    };
    (window as unknown as { __od__?: unknown }).__od__ = {
      version: 2,
      client: { type: 'desktop', platform: 'darwin', osLocale: 'en-US' },
      browser: { clearData: async () => ({ ok: true }) },
      capture: { page: async () => ({ ok: false, reason: 'not mocked' }) },
      pdf: { print: async () => ({ ok: true }) },
      pet: { setVisible: () => {} },
      project: {
        pickAndImport: async () => ({ ok: false, canceled: true }),
        pickAndReplaceWorkingDir: async () => ({ ok: false, canceled: true }),
      },
      shell: {
        openExternal: async () => ({ ok: true }),
        openPath: async () => ({ ok: true }),
      },
      updater: {
        status: async () => downloadedStatus,
        check: async () => downloadedStatus,
        'clear-cache': async () => downloadedStatus,
        download: async () => downloadedStatus,
        install: async () => downloadedStatus,
        quit: async () => ({ ok: true }),
        setMenuLabels: async () => ({ ok: true }),
        subscribe: () => () => {},
        subscribeOpenDialog: () => () => {},
      },
    };
  });
});

test('[P1] update ready prompt paints above the composer and its agent picker', async ({ page }) => {
  test.fail(
    true,
    'The rail-hosted updater prompt currently paints behind the raised Home composer in compact windows.',
  );
  // In the current rail host the prompt grows upward from the footer. A compact
  // desktop window puts it across the centered composer and model popover.
  await page.setViewportSize({ width: 700, height: 600 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByText(LOADING_SHELL_TEXT).waitFor({ state: 'hidden', timeout: T.long });
  await page.getByText('Loading OpenDesign…').waitFor({ state: 'hidden', timeout: T.long });
  await expect(page.getByTestId('home-hero')).toBeVisible();

  // Signed-out has no account capsule, but the updater keeps the same
  // top-right cluster home and remains directly actionable.
  await expect(page.getByTestId('entry-nav-account')).toHaveCount(0);
  const updaterButton = page
    .locator('.entry-top-right-cluster')
    .getByTestId('entry-nav-updater');
  await expect(updaterButton).toBeVisible();
  await updaterButton.click();
  const popup = page.getByTestId('updater-popup');
  await expect(popup).toBeVisible();

  // Open the composer's agent picker with the keyboard. The prompt dismisses
  // on outside MOUSEDOWN only, so keyboard activation keeps both surfaces
  // open at once — the state users hit when the prompt is up (e.g. while an
  // install is in flight) and they interact with the composer.
  const chip = page.getByTestId('inline-model-switcher-chip');
  await chip.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('inline-model-switcher-popover')).toBeVisible();
  await expect(popup).toBeVisible();

  await expect(page.getByTestId('inline-model-switcher-popover')).toBeVisible();
  await expect(popup).toBeVisible();

  // Moving the signed-out updater from the rail footer to the top-right cluster
  // removes the old collision altogether. Keep the geometry assertion after
  // both surfaces open so a future repositioning cannot silently put the
  // prompt back across the composer or its popover.
  const overlapAreas = await page.evaluate(() => {
    const popupEl = document.querySelector('[data-testid="updater-popup"]');
    const overlays = [
      document.querySelector('.home-hero__input-card'),
      document.querySelector('[data-testid="inline-model-switcher-popover"]'),
    ];
    if (popupEl == null || overlays.some((el) => el == null)) {
      return null;
    }
    const p = popupEl.getBoundingClientRect();
    return overlays.map((overlay) => {
      const r = (overlay as Element).getBoundingClientRect();
      const width = Math.min(p.right, r.right) - Math.max(p.left, r.left);
      const height = Math.min(p.bottom, r.bottom) - Math.max(p.top, r.top);
      return width > 0 && height > 0 ? width * height : 0;
    });
  });

  expect(
    overlapAreas,
    'popup, composer card, and agent picker must all be measurable',
  ).not.toBeNull();
  expect(overlapAreas, 'signed-out updater prompt must stay clear of composer surfaces').toEqual([0, 0]);
});

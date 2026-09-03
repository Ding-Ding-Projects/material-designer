import { defineConfig, devices } from '@playwright/test';

import { initializePlaywrightRunNamespace } from './lib/playwright/runtime-identity.ts';

initializePlaywrightRunNamespace();

/**
 * The README screenshot capture lane.
 *
 * Deliberately its own config with its own `testDir`, so neither the
 * functional pool (`playwright.config.ts`, `testDir: ./ui`) nor the visual
 * regression pool (`playwright.visual.config.ts`, also `./ui`) can pick it
 * up. Capturing rewrites files that are committed to the repository, so it
 * has to be something a person asks for by name — `pnpm capture:screenshots`
 * — never a side effect of running the test suite.
 *
 * One worker: the captures share a single booted application through the
 * worker-scoped `toolsDev` fixture, and running them in sequence keeps the
 * images consistent with each other.
 */
export default defineConfig({
  testDir: './capture',
  testMatch: '*.capture.ts',
  outputDir: './capture/reports/test-results',
  // Booting the web app and the daemon, then driving fourteen screens, is
  // slower than a functional spec's budget allows for.
  timeout: Number(process.env.OD_PLAYWRIGHT_TIMEOUT) || 300_000,
  expect: {
    timeout: 20_000,
  },
  retries: 0,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    trace: 'retain-on-failure',
    // The capture writes its own images; Playwright must not add failure
    // screenshots to the same run.
    screenshot: 'off',
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  },
});

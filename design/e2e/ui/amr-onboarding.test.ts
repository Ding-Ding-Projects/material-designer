import { expect, test } from '@/playwright/suite';
import type { Locator, Page } from '@playwright/test';

import {
  dismissPrivacyDialog,
  mockAmrPersonalWorkspace,
  mockAmrWalletSnapshot,
  STORAGE_KEY,
  waitForLoadingToClear,
} from '@/playwright/amr';
import { expectStableCount } from '@/playwright/assertions';
import { ensureRailOpen } from '@/playwright/rail';
import {
  fulfillAgentsRoute,
  routeSuccessfulRuns,
  successfulRunEventBody,
  suppressWhatsNew,
} from '@/playwright/mock-factory';
import { T } from '@/timeouts';

type OnboardingConfig = {
  mode: 'daemon' | 'api';
  apiKey: string;
  apiProtocol?: string;
  baseUrl: string;
  model: string;
  agentId: string | null;
  skillId: null;
  designSystemId: string | null;
  onboardingCompleted: boolean;
  mediaProviders: Record<string, never>;
  agentModels: Record<string, { model: string; reasoning: string }>;
};

declare global {
  interface Window {
    __amrOnboardingCancelCalls?: number;
    __amrOnboardingDelayNextSignedOutStatus?: boolean;
    __amrOnboardingLoginCalls?: number;
    __amrOnboardingSlowStatusResolved?: boolean;
    __amrOnboardingStatusCalls?: number;
  }
}

test.describe.configure({ timeout: T.xlong });

test.beforeEach(async ({ page }) => {
  await suppressWhatsNew(page);
});

test('[P0] @critical onboarding Local CLI card lets the user pick an agent model before continuing', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: false,
    initialLoggedIn: true,
    codexModels: [
      { id: 'gpt-5.4-mini', label: 'gpt-5.4-mini' },
      { id: 'gpt-5.5', label: 'gpt-5.5' },
      { id: 'o3', label: 'o3' },
      { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
      { id: 'glm-5', label: 'GLM 5' },
      { id: 'qwen3-235b', label: 'Qwen3 235B' },
      { id: 'claude-sonnet-4.5', label: 'Claude Sonnet 4.5' },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
      { id: 'kimi-k2.6', label: 'Kimi K2.6' },
    ],
  });

  await page.addInitScript(
    ({ key, value }) => window.localStorage.setItem(key, JSON.stringify(value)),
    { key: STORAGE_KEY, value: config },
  );

  await gotoOnboarding(page);

  // Choose Local Agent after Cloud identity is resolved. Scanning auto-selects
  // the default agent (codex), so its live model picker is available.
  await openModelSourceSetup(page, /Local Agent/i);
  const localPanel = page.locator('.onboarding-view__setup-panel');
  await expect(localPanel).toBeVisible();
  await selectOnboardingOption(localPanel, 'Model', 'GLM 5');

  await expect(expectOnboardingTrigger(localPanel, 'Model')).toContainText('GLM 5');
  await expect(page.getByRole('button', { name: /^Continue$/i })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
});

test('[P0] onboarding Local CLI path completes setup with the selected agent model', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: false,
    initialLoggedIn: true,
    codexModels: [
      { id: 'gpt-5.4-mini', label: 'gpt-5.4-mini' },
      { id: 'glm-5', label: 'GLM 5' },
    ],
  });

  await seedOnboardingConfig(page, config);
  await page.route('**/api/test/connection', async (route) => {
    await route.fulfill({
      json: {
        ok: true,
        kind: 'success',
        latencyMs: 12,
        model: 'glm-5',
        agentName: 'Codex CLI',
        sample: 'Connected',
      },
    });
  });
  await gotoOnboarding(page);

  await openModelSourceSetup(page, /Local Agent/i);
  const localPanel = page.locator('.onboarding-view__setup-panel');
  await expect(localPanel).toBeVisible();
  await selectOnboardingOption(localPanel, 'Model', 'GLM 5');
  await page.getByRole('button', { name: /^Test$/i }).click();
  await expectConnectionSuccess(page);
  await page.getByRole('button', { name: /^Continue$/i }).click();

  await expectOnboardingFinished(page);
  await pollStoredConfig(page).toMatchObject({
    mode: 'daemon',
    agentId: 'codex',
    agentModels: {
      codex: { model: 'glm-5' },
    },
    onboardingCompleted: true,
  });
});

test('[P0] onboarding Local CLI path stays gated when no local CLI is available', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: false,
    initialLoggedIn: true,
    localAgents: [],
  });

  await seedOnboardingConfig(page, config);
  await page.goto('/onboarding', { waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  await dismissPrivacyDialog(page);
  await expect(page.getByText('Local CLI')).toBeVisible();
  await expect(page.getByText(/No agents detected|No local CLI detected/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /Rescan/i })).toBeVisible();

  const continueButton = page.getByRole('button', { name: /^Continue$/i });
  await expect(continueButton).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByRole('heading', { name: /Local Agent|本地 Agent/i })).toBeVisible();
  await expect(page.getByText(/Optional details for better defaults/i)).toHaveCount(0);
});

test('[P0] onboarding Local CLI path stays gated while local agent scan is still running', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: false,
    initialLoggedIn: true,
    agentsDelayMs: 20_000,
  });

  await seedOnboardingConfig(page, config);
  await gotoOnboarding(page);

  await openModelSourceSetup(page, /Local Agent/i);
  await expect(page.getByRole('button', { name: /Scanning|扫描中/i })).toBeVisible();

  const continueButton = page.getByRole('button', { name: /^Continue$/i });
  await expect(continueButton).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByRole('heading', { name: /Local Agent|本地 Agent/i })).toBeVisible();
  await expect(page.getByText(/Optional details for better defaults/i)).toHaveCount(0);
});

test('[P0] onboarding supports Local CLI when the AMR agent is unavailable', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: false,
    initialLoggedIn: true,
  });

  await seedOnboardingConfig(page, config);

  await gotoOnboarding(page);

  // No AMR runtime card exists anymore — the landing cloud button is the only
  // AMR affordance, and there is no "AMR Cloud" named control.
  await expect(page.getByRole('button', { name: /AMR Cloud/i })).toHaveCount(0);
  await openModelSourceSetup(page, /Local Agent/i);
  await expect(page.getByText('Local CLI')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Continue$/i })).toBeVisible();
});

test('[P0] completed BYOK setup stays usable while the unrelated Cloud session is signed out', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: true,
    initialLoggedIn: false,
  });
  Object.assign(config, {
    mode: 'api',
    apiKey: 'persisted-byok-key',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-sonnet-4-5',
    agentId: null,
    onboardingCompleted: true,
  } satisfies Partial<OnboardingConfig>);
  await seedOnboardingConfig(page, config);

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  await dismissPrivacyDialog(page);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('home-hero-input')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Choose your model source|选择模型来源/i })).toHaveCount(0);
  // PRODUCT INVARIANT: Cloud identity gates OpenDesign Cloud execution only.
  // A configured BYOK runtime neither redirects to onboarding nor starts a
  // passive Cloud login merely because the independent AMR status is signed out.
  await expect.poll(() => page.evaluate(() => window.__amrOnboardingLoginCalls ?? 0)).toBe(0);
  await pollStoredConfig(page).toMatchObject({
    mode: 'api',
    apiKey: 'persisted-byok-key',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-sonnet-4-5',
    onboardingCompleted: true,
  });
});

test('[P0] onboarding configuration Back returns to the source chooser with the test gate locked', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: true,
    initialLoggedIn: true,
  });

  await seedOnboardingConfig(page, config);
  await gotoOnboarding(page);

  await expectModelSourceChooser(page);
  await continueWithModelSource(page, /Bring Your Own Key/i);
  await expect(onboardingByokPanel(page)).toBeVisible();

  const continueButton = page.getByRole('button', { name: /^Continue$/i });
  await expect(continueButton).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByRole('heading', { name: /Bring your own key|自己的模型 Key/i })).toBeVisible();
  await page.getByRole('button', { name: /^Back$/i }).click();
  await expectModelSourceChooser(page);
  await expect(page.getByRole('radio', { name: /Bring Your Own Key/i })).toHaveAttribute(
    'aria-checked',
    'true',
  );
});

test('[P0] @critical onboarding BYOK path can fetch models, test the provider, and complete setup', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: true,
    initialLoggedIn: true,
  });

  await page.route('**/api/provider/models', async (route) => {
    await route.fulfill({
      json: {
        ok: true,
        kind: 'success',
        latencyMs: 14,
        models: [
          { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
          { id: 'claude-opus-4-8', label: 'Claude Opus 4.8' },
        ],
      },
    });
  });
  await page.route('**/api/test/connection', async (route) => {
    await route.fulfill({
      json: {
        ok: true,
        kind: 'success',
        latencyMs: 27,
        model: 'claude-opus-4-8',
        sample: 'Connected',
      },
    });
  });

  await seedOnboardingConfig(page, config);
  await gotoOnboarding(page);

  await openModelSourceSetup(page, /Bring Your Own Key/i);
  const byokPanel = onboardingByokPanel(page);
  await expect(byokPanel).toBeVisible();

  await fillInlineField(page, 'API key', 'test-api-key');
  await fillInlineField(page, 'Base URL', 'https://api.anthropic.com');
  await page.getByRole('button', { name: /Fetch models/i }).click();
  await expect(page.getByText(/Fetched 2 models\./)).toBeVisible();
  await selectOnboardingOption(byokPanel, 'Model', 'claude-opus-4-8');

  await page.getByRole('button', { name: /^Test$/i }).click();
  await expectConnectionSuccess(page);

  await page.getByRole('button', { name: /^Continue$/i }).click();
  await expectOnboardingFinished(page);
  await pollStoredConfig(page).toMatchObject({
    mode: 'api',
    apiKey: 'test-api-key',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-opus-4-8',
    onboardingCompleted: true,
  });
});

test('[P0] onboarding BYOK path cannot continue before a successful connection test', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: true,
    initialLoggedIn: true,
  });

  let connectionOk = false;
  await page.route('**/api/provider/models', async (route) => {
    await route.fulfill({
      json: {
        ok: true,
        kind: 'success',
        latencyMs: 14,
        models: [{ id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' }],
      },
    });
  });
  await page.route('**/api/test/connection', async (route) => {
    await route.fulfill({
      json: connectionOk
        ? {
            ok: true,
            kind: 'success',
            latencyMs: 18,
            model: 'claude-sonnet-4-5',
            sample: 'Connected',
          }
        : {
            ok: false,
            kind: 'error',
            latencyMs: 18,
            error: 'Invalid API key',
          },
    });
  });

  await seedOnboardingConfig(page, config);
  await gotoOnboarding(page);

  await openModelSourceSetup(page, /Bring Your Own Key/i);
  const byokPanel = onboardingByokPanel(page);
  await expect(byokPanel).toBeVisible();

  const continueButton = page.getByRole('button', { name: /^Continue$/i });
  await expect(continueButton).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByRole('heading', { name: /Bring your own key|自己的模型 Key/i })).toBeVisible();

  await fillInlineField(page, 'API key', 'bad-api-key');
  await fillInlineField(page, 'Base URL', 'https://api.anthropic.com');
  await page.getByRole('button', { name: /Fetch models/i }).click();
  await expect(page.getByText(/Fetched 1 model/)).toBeVisible();
  await selectOnboardingOption(byokPanel, 'Model', 'Claude Sonnet 4.5');
  await expect(continueButton).toHaveAttribute('aria-disabled', 'true');

  await page.getByRole('button', { name: /^Test$/i }).click();
  await expect(page.getByText(/Invalid API key|Connection failed|failed/i)).toBeVisible();
  await expect(continueButton).toHaveAttribute('aria-disabled', 'true');

  connectionOk = true;
  await fillInlineField(page, 'API key', 'good-api-key');
  await page.getByRole('button', { name: /^Test$/i }).click();
  await expectConnectionSuccess(page);
  await expect(continueButton).not.toHaveAttribute('aria-disabled', 'true');
});

test('[P0] onboarding BYOK path supports Anthropic model selection and API key visibility before completing', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: true,
    initialLoggedIn: true,
  });
  let connectionBody: Record<string, unknown> | null = null;
  await page.route('**/api/test/connection', async (route) => {
    connectionBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      json: {
        ok: true,
        kind: 'success',
        latencyMs: 19,
        model: 'claude-custom-onboarding',
        sample: 'Connected',
      },
    });
  });

  await seedOnboardingConfig(page, config);
  await gotoOnboarding(page);

  await openModelSourceSetup(page, /Bring Your Own Key/i);
  await expect(page.getByRole('tab', { name: /^Anthropic$/i })).toHaveAttribute('aria-selected', 'true');

  const apiKeyField = onboardingField(page, 'API key');
  const apiKeyInput = apiKeyField.locator('input');
  await expect(apiKeyInput).toHaveAttribute('type', 'password');
  await fillInlineField(page, 'API key', 'anthropic-test-key');
  await apiKeyField.getByRole('button', { name: /^Show$/i }).click();
  await expect(apiKeyInput).toHaveAttribute('type', 'text');

  await fillInlineField(page, 'Base URL', 'https://api.anthropic.com');
  const byokPanel = onboardingByokPanel(page);
  await selectOnboardingOption(byokPanel, 'Model', 'claude-sonnet-4-5');
  await page.getByRole('button', { name: /^Test$/i }).click();
  await expectConnectionSuccess(page);

  await expect.poll(() => connectionBody).toMatchObject({
    mode: 'provider',
    protocol: 'anthropic',
    apiKey: 'anthropic-test-key',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-sonnet-4-5',
  });

  await page.getByRole('button', { name: /^Continue$/i }).click();
  await expectOnboardingFinished(page);
  await pollStoredConfig(page).toMatchObject({
    mode: 'api',
    apiProtocol: 'anthropic',
    apiKey: 'anthropic-test-key',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-sonnet-4-5',
    onboardingCompleted: true,
  });
});

test('[P0] onboarding BYOK successful test is invalidated when connection settings change', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: true,
    initialLoggedIn: true,
  });

  await page.route('**/api/provider/models', async (route) => {
    await route.fulfill({
      json: {
        ok: true,
        kind: 'success',
        latencyMs: 11,
        models: [{ id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' }],
      },
    });
  });
  await page.route('**/api/test/connection', async (route) => {
    await route.fulfill({
      json: {
        ok: true,
        kind: 'success',
        latencyMs: 16,
        model: 'claude-sonnet-4-5',
        sample: 'Connected',
      },
    });
  });

  await seedOnboardingConfig(page, config);
  await gotoOnboarding(page);

  await openModelSourceSetup(page, /Bring Your Own Key/i);
  const byokPanel = onboardingByokPanel(page);
  const continueButton = page.getByRole('button', { name: /^Continue$/i });

  await fillInlineField(page, 'API key', 'valid-api-key');
  await fillInlineField(page, 'Base URL', 'https://api.anthropic.com');
  await page.getByRole('button', { name: /Fetch models/i }).click();
  await expect(page.getByText(/Fetched 1 model/)).toBeVisible();
  await selectOnboardingOption(byokPanel, 'Model', 'Claude Sonnet 4.5');
  await page.getByRole('button', { name: /^Test$/i }).click();
  await expectConnectionSuccess(page);
  await expect(continueButton).not.toHaveAttribute('aria-disabled', 'true');

  await fillInlineField(page, 'API key', 'changed-api-key');

  await expect(continueButton).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByRole('heading', { name: /Bring your own key|自己的模型 Key/i })).toBeVisible();
  await expect(page.getByText(/Optional details for better defaults/i)).toHaveCount(0);
});

test('[P0] onboarding BYOK successful test is invalidated when Base URL or model changes', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: true,
    initialLoggedIn: true,
  });

  await page.route('**/api/provider/models', async (route) => {
    await route.fulfill({
      json: {
        ok: true,
        kind: 'success',
        latencyMs: 12,
        models: [
          { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
          { id: 'claude-opus-4-8', label: 'Claude Opus 4.8' },
        ],
      },
    });
  });
  await page.route('**/api/test/connection', async (route) => {
    await route.fulfill({
      json: {
        ok: true,
        kind: 'success',
        latencyMs: 17,
        model: 'claude-sonnet-4-5',
        sample: 'Connected',
      },
    });
  });

  await seedOnboardingConfig(page, config);
  await gotoOnboarding(page);

  await openModelSourceSetup(page, /Bring Your Own Key/i);
  const byokPanel = onboardingByokPanel(page);
  const continueButton = page.getByRole('button', { name: /^Continue$/i });

  await fillInlineField(page, 'API key', 'valid-api-key');
  await fillInlineField(page, 'Base URL', 'https://api.anthropic.com');
  await page.getByRole('button', { name: /Fetch models/i }).click();
  // Scope to the models-status text rather than role=status: both the models
  // status and (after the test below) the connection status share role=status,
  // so a bare getByRole('status') would be ambiguous on later assertions.
  await expect(page.getByText(/Fetched 2 models/)).toBeVisible();
  await selectOnboardingOption(byokPanel, 'Model', 'Claude Sonnet 4.5');
  await page.getByRole('button', { name: /^Test$/i }).click();
  await expectConnectionSuccess(page);
  await expect(continueButton).not.toHaveAttribute('aria-disabled', 'true');

  await fillInlineField(page, 'Base URL', 'https://api.changed.example');
  await expect(continueButton).toHaveAttribute('aria-disabled', 'true');

  await fillInlineField(page, 'Base URL', 'https://api.anthropic.com');
  await page.getByRole('button', { name: /^Test$/i }).click();
  await expectConnectionSuccess(page);
  await expect(continueButton).not.toHaveAttribute('aria-disabled', 'true');

  await selectOnboardingOption(byokPanel, 'Model', 'Claude Opus 4.8');
  await expect(continueButton).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByRole('heading', { name: /Bring your own key|自己的模型 Key/i })).toBeVisible();
  await expect(page.getByText(/Optional details for better defaults/i)).toHaveCount(0);
});

async function wireOnboardingMocks(
  page: Page,
  options: {
    amrAvailable: boolean;
    initialLoggedIn: boolean;
    failAllStatusPolls?: boolean;
    keepAmrLoginIncomplete?: boolean;
    sessionState?: 'signed_out' | 'authenticated' | 'reauth_required';
    delaySignedOutStatusMs?: number;
    agentsDelayMs?: number;
    codexModels?: Array<{ id: string; label: string }>;
    localAgents?: Array<{
      id: string;
      name: string;
      bin: string;
      available: boolean;
      version: string;
      models: Array<{ id: string; label: string }>;
    }>;
  },
): Promise<OnboardingConfig> {
  const config: OnboardingConfig = {
    mode: 'daemon',
    apiKey: '',
    baseUrl: '',
    model: '',
    agentId: options.amrAvailable ? 'amr' : 'codex',
    skillId: null,
    designSystemId: null,
    onboardingCompleted: false,
    mediaProviders: {},
    agentModels: options.amrAvailable
      ? { amr: { model: 'default', reasoning: 'default' } }
      : { codex: { model: 'default', reasoning: 'default' } },
  };

  let loggedIn = options.initialLoggedIn;
  let loginInFlight = false;
  let statusCalls = 0;
  let loginCalls = 0;
  let cancelCalls = 0;
  let authAttemptId: string | null = null;

  await page.route('**/api/health', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });

  await page.route('**/api/projects', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { projects: [] } });
      return;
    }
    await route.continue();
  });

  await page.route('**/api/app-config', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { config } });
      return;
    }
    if (route.request().method() === 'PUT') {
      Object.assign(config, route.request().postDataJSON() as Partial<OnboardingConfig>);
      await route.fulfill({ json: { ok: true } });
      return;
    }
    await route.continue();
  });

  const localAgents = options.localAgents ?? [{
    id: 'codex',
    name: 'Codex CLI',
    bin: 'codex',
    available: true,
    version: 'test',
    models: options.codexModels ?? [{ id: 'default', label: 'Default' }],
  }];

  const agents = [
    ...(options.amrAvailable
      ? [{
          id: 'amr',
          name: 'AMR (vela)',
          bin: 'vela',
          available: true,
          version: '1.0.0',
          models: [{ id: 'default', label: 'Default' }],
        }]
      : []),
    ...localAgents,
  ];

  await page.route('**/api/agents**', async (route) => {
    if (options.agentsDelayMs) {
      await new Promise((resolve) => setTimeout(resolve, options.agentsDelayMs));
    }
    await fulfillAgentsRoute(route, agents);
  });

  await page.route('**/api/integrations/vela/status', async (route) => {
    statusCalls += 1;
    await page.evaluate((calls) => {
      window.__amrOnboardingStatusCalls = calls;
    }, statusCalls);
    if (options.failAllStatusPolls) {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'status unavailable' }),
      });
      return;
    }
    const shouldDelaySignedOutStatus =
      !loggedIn
      && typeof options.delaySignedOutStatusMs === 'number'
      && options.delaySignedOutStatusMs > 0
      && await page.evaluate(() => {
        if (!window.__amrOnboardingDelayNextSignedOutStatus) return false;
        window.__amrOnboardingDelayNextSignedOutStatus = false;
        return true;
      });
    if (shouldDelaySignedOutStatus) {
      await new Promise((resolve) =>
        setTimeout(resolve, options.delaySignedOutStatusMs),
      );
    }
    await route.fulfill({
      json: loggedIn
        ? {
            loggedIn: true,
            loginInFlight: false,
            sessionState: options.sessionState ?? 'authenticated',
            credentialRevision: 'onboarding-test-credential',
            profile: 'local',
            configPath: '/tmp/.amr/config.json',
            user: { id: 'user-1', email: 'onboarding@example.com', plan: 'free' },
          }
        : {
            loggedIn: false,
            loginInFlight,
            sessionState: 'signed_out',
            credentialRevision: 'signed-out',
            profile: 'local',
            configPath: '/tmp/.amr/config.json',
            user: null,
          },
    });
    if (shouldDelaySignedOutStatus) {
      await page.evaluate(() => {
        window.__amrOnboardingSlowStatusResolved = true;
      });
    }
  });

  if (options.amrAvailable) {
    await mockAmrWalletSnapshot(page, {
      email: 'onboarding@example.com',
      loggedIn: () => loggedIn,
      plan: 'free',
      profile: 'local',
    });
  }

  await page.route('**/api/integrations/vela/login', async (route) => {
    const body = route.request().postDataJSON() as { authAttemptId?: string };
    authAttemptId = body.authAttemptId ?? null;
    expect(authAttemptId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    loginCalls += 1;
    loginInFlight = true;
    if (!options.keepAmrLoginIncomplete) {
      loggedIn = true;
      loginInFlight = false;
    }
    await page.evaluate((calls) => {
      window.__amrOnboardingLoginCalls = calls;
    }, loginCalls);
    await route.fulfill({
      status: 202,
      json: {
        pid: 4242,
        startedAt: new Date().toISOString(),
        profile: 'local',
        authAttemptId,
      },
    });
  });

  await page.route('**/api/integrations/vela/login/cancel', async (route) => {
    expect(route.request().postDataJSON()).toEqual({ authAttemptId });
    cancelCalls += 1;
    loginInFlight = false;
    await page.evaluate((calls) => {
      window.__amrOnboardingCancelCalls = calls;
    }, cancelCalls);
    await route.fulfill({ json: { canceled: true, pids: [4242] } });
  });

  await page.route('**/api/integrations/vela/logout', async (route) => {
    loggedIn = false;
    loginInFlight = false;
    await route.fulfill({ json: { ok: true } });
  });

  return config;
}

async function gotoOnboarding(page: Page) {
  await page.goto('/onboarding', { waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  await dismissPrivacyDialog(page);
  await expectModelSourceChooser(page);
}


async function expectModelSourceChooser(page: Page) {
  await expect(
    page.getByRole('heading', { name: /Choose your model source|选择模型来源/i }),
  ).toBeVisible({ timeout: T.long });
  await expect(page.getByRole('radiogroup')).toBeVisible();
}

async function continueWithModelSource(page: Page, sourceName: RegExp) {
  const source = page.getByRole('radio', { name: sourceName });
  await expect(source).toBeVisible();
  await source.click();
  await page.getByRole('button', { name: /^Continue$/i }).click();
}

async function openModelSourceSetup(page: Page, sourceName: RegExp) {
  await expectModelSourceChooser(page);
  await continueWithModelSource(page, sourceName);
}

async function seedOnboardingConfig(page: Page, config: OnboardingConfig) {
  await page.addInitScript(
    ({ key, value }) => window.localStorage.setItem(key, JSON.stringify(value)),
    { key: STORAGE_KEY, value: config },
  );
}

async function expectOnboardingFinished(page: Page) {
  await dismissPrivacyDialog(page);
  const goHome = page.getByRole('button', { name: /Go to home/i });
  if (await goHome.isVisible().catch(() => false)) {
    await goHome.click();
  } else {
    const finishSetup = page.getByRole('button', { name: /Finish setup/i });
    if (await finishSetup.isVisible().catch(() => false)) {
      await finishSetup.click();
    }
  }
  await expect(page).not.toHaveURL(/\/onboarding$/);
  await dismissPrivacyDialog(page);
  await expect(page.getByTestId('home-view')).toBeVisible();
}

function onboardingByokPanel(page: Page) {
  return page.locator('.onboarding-view__setup-panel').filter({
    has: page.getByText('API providers', { exact: true }),
  });
}

async function expectConnectionSuccess(page: Page) {
  await expect(
    page.getByText(/Connected\. Replied in \d+ ms|.+ replied in \d+ ms/),
  ).toBeVisible();
}

function pollStoredConfig(page: Page) {
  return expect.poll(() =>
    page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) || '{}'), STORAGE_KEY),
  );
}

type OnboardingLocatorRoot = Page | Locator;

function onboardingField(root: OnboardingLocatorRoot, label: string) {
  return root.locator('.onboarding-view__select-field, .onboarding-view__inline-field').filter({
    hasText: new RegExp(label, 'i'),
  }).first();
}

function expectOnboardingTrigger(root: OnboardingLocatorRoot, label: string) {
  return onboardingField(root, label).getByRole('button');
}

async function selectOnboardingOption(root: OnboardingLocatorRoot, label: string, option: string) {
  const field = onboardingField(root, label);
  const listbox = field.getByRole('listbox', { name: new RegExp(label, 'i') });
  if (!(await listbox.isVisible().catch(() => false))) {
    await field.getByRole('button').click();
  }
  await listbox.getByRole('option').filter({ hasText: new RegExp(option, 'i') }).first().click();
}

async function fillInlineField(page: Page, label: string, value: string) {
  await onboardingField(page, label).locator('input').fill(value);
}

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  firstLaunchProviderRoute,
  retireCloudExecutionRoute,
} from '../../src/onboarding/first-launch-provider-route';
import type { AgentInfo, AppConfig } from '../../src/types';

function config(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    mode: 'daemon',
    agentId: null,
    apiProtocol: 'anthropic',
    apiProtocolConfigs: {},
    apiKey: '',
    baseUrl: '',
    model: '',
    onboardingCompleted: false,
    ...overrides,
  } as AppConfig;
}

function agent(id: string, available = true): AgentInfo {
  return { id, name: id, bin: id, available } as AgentInfo;
}

describe('first-launch provider routing', () => {
  it('keeps a configured runnable local CLI selected', () => {
    expect(
      firstLaunchProviderRoute(
        config({ mode: 'daemon', agentId: 'codex' }),
        [agent('amr'), agent('codex')],
      ),
    ).toBe('local');
  });

  it('restores a complete BYOK route without cloud authentication', () => {
    expect(
      firstLaunchProviderRoute(
        config({
          mode: 'api',
          agentId: 'amr',
          apiKey: 'configured-key',
          baseUrl: 'https://api.example.test',
          model: 'model-1',
        }),
        [agent('amr')],
      ),
    ).toBe('byok');
  });

  it('uses local setup guidance when neither supported route is configured', () => {
    expect(firstLaunchProviderRoute(config(), [agent('amr')])).toBe('local');
  });

  it('migrates a retired cloud selection once and stays stable across relaunch', () => {
    const migrated = retireCloudExecutionRoute(
      config({ onboardingCompleted: true, agentId: 'amr' }),
      [agent('amr'), agent('claude-code')],
    );
    expect(migrated).toMatchObject({
      mode: 'daemon',
      agentId: 'claude-code',
      onboardingCompleted: true,
    });
    expect(retireCloudExecutionRoute(migrated, [agent('claude-code')])).toBe(migrated);
  });

  it('sends a retired cloud-only profile to local setup rather than sign-in', () => {
    expect(
      retireCloudExecutionRoute(
        config({ onboardingCompleted: true, agentId: 'amr' }),
        [agent('amr')],
      ),
    ).toMatchObject({
      mode: 'daemon',
      agentId: null,
      onboardingCompleted: false,
    });
  });
});

describe('cloud sign-in retirement source boundaries', () => {
  const sourceRoot = join(__dirname, '..', '..', 'src');
  const entryShell = readFileSync(join(sourceRoot, 'components', 'EntryShell.tsx'), 'utf8');
  const chatPane = readFileSync(join(sourceRoot, 'components', 'ChatPane.tsx'), 'utf8');
  const settings = readFileSync(join(sourceRoot, 'components', 'SettingsDialog.tsx'), 'utf8');
  const app = readFileSync(join(sourceRoot, 'App.tsx'), 'utf8');

  it('does not mount cloud authentication in onboarding or execution settings', () => {
    expect(entryShell).not.toContain('function handleCloudSignIn');
    expect(entryShell).not.toContain("modelSource === 'amr'");
    expect(entryShell).not.toContain('onboardingAmrModelSourceLabel');
    expect(entryShell).not.toContain("t('settings.onboardingExecutionBody')");
    expect(entryShell).not.toContain('onboarding-cloud__primary');
    expect(chatPane).not.toContain('<AmrLoginPill');
    expect(chatPane).toContain("onOpenSettings?.('execution')");
    expect(settings).not.toContain('settings-cloud-signin-callout');
  });

  it('does not mount the project cloud recovery prompt', () => {
    expect(app).not.toContain('<ProjectWorkspaceRecoveryTip');
    expect(existsSync(join(sourceRoot, 'components', 'CloudSignInTip.tsx'))).toBe(false);
    expect(existsSync(join(sourceRoot, 'components', 'ProjectWorkspaceRecoveryTip.tsx'))).toBe(
      false,
    );
  });

  it('keeps both supported first-launch routes in the visible chooser', () => {
    expect(entryShell).toContain("const sources = ['local', 'byok'] as const");
    expect(entryShell).toContain("setModelSource('local')");
    expect(entryShell).toContain("setModelSource('byok')");
  });
});

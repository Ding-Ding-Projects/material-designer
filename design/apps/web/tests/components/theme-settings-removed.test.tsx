// @vitest-environment jsdom
//
// Theme belongs to the authoritative Settings → Appearance tab. These tests
// keep the three localized choices reachable and ensure onboarding does not
// grow a second theme owner.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EntryShell } from '../../src/components/EntryShell';
import { SettingsDialog } from '../../src/components/SettingsDialog';
import { I18nProvider } from '../../src/i18n';
import { en } from '../../src/i18n/locales/en';
import { DEFAULT_CONFIG } from '../../src/state/config';
import type { AgentInfo, AppConfig } from '../../src/types';

const analyticsMocks = vi.hoisted(() => ({
  track: vi.fn(),
}));

vi.mock('../../src/analytics/provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/analytics/provider')>();
  return {
    ...actual,
    useAnalytics: () => ({
      newRequestId: vi.fn(() => 'request-1'),
      setConfigureGlobals: vi.fn(),
      setConsent: vi.fn(),
      setIdentity: vi.fn(),
      track: analyticsMocks.track,
    }),
    useAppVersion: () => null,
  };
});

const AGENTS: AgentInfo[] = [
  { id: 'codex', name: 'Codex', bin: 'codex', available: true },
];

const THEME_CONTROL_LABELS = [
  en['settings.themeSystem'],
  en['settings.themeLight'],
  en['settings.themeDark'],
];

const originalResizeObserver = globalThis.ResizeObserver;

class ResizeObserverMock {
  observe() {}
  disconnect() {}
  unobserve() {}
}

afterEach(() => {
  cleanup();
  globalThis.ResizeObserver = originalResizeObserver;
  analyticsMocks.track.mockReset();
});

beforeEach(() => {
  globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;
  analyticsMocks.track.mockReset();
});

describe('Settings → Appearance (theme setting)', () => {
  function renderAppearanceSettings() {
    return render(
      <I18nProvider initial="en">
        <SettingsDialog
          presentation="page"
          initial={{ ...DEFAULT_CONFIG }}
          agents={AGENTS}
          daemonLive
          appVersionInfo={null}
          initialSection="appearance"
          onPersist={vi.fn()}
          onPersistComposioKey={vi.fn()}
          onClose={vi.fn()}
          onRefreshAgents={vi.fn()}
        />
      </I18nProvider>,
    );
  }

  it('renders the localized Appearance group', () => {
    renderAppearanceSettings();

    expect(screen.getByRole('group', { name: en['settings.appearance'] })).toBeTruthy();
  });

  it('renders System / Light / Dark theme buttons in the authoritative tab', () => {
    renderAppearanceSettings();

    for (const label of THEME_CONTROL_LABELS) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
  });

  it('applies an explicit theme without creating a second navigation owner', () => {
    renderAppearanceSettings();

    screen.getByRole('button', { name: en['settings.themeDark'] }).click();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});

describe('Onboarding welcome keeps theme ownership in Settings', () => {
  function baseConfig(overrides: Partial<AppConfig> = {}): AppConfig {
    return {
      mode: 'daemon',
      agentId: null,
      agentModels: {},
      apiProtocol: 'anthropic',
      apiProtocolConfigs: {},
      apiKey: '',
      baseUrl: '',
      model: '',
      ...overrides,
    } as AppConfig;
  }

  function renderOnboarding() {
    window.history.replaceState(null, '', '/onboarding');
    return render(
      <I18nProvider initial="en">
        <EntryShell
          skills={[]}
          designTemplates={[]}
          designSystems={[]}
          projects={[]}
          templates={[]}
          promptTemplates={[]}
          defaultDesignSystemId={null}
          connectors={[]}
          connectorsLoading={false}
          config={baseConfig()}
          agents={AGENTS}
          daemonLive
          onModeChange={vi.fn()}
          onAgentChange={vi.fn()}
          onAgentModelChange={vi.fn()}
          onApiProtocolChange={vi.fn()}
          onApiModelChange={vi.fn()}
          onConfigPersist={vi.fn()}
          onRefreshAgents={vi.fn(() => AGENTS)}
          onCreateProject={vi.fn()}
          onCreatePluginShareProject={vi.fn()}
          onImportClaudeDesign={vi.fn()}
          onOpenProject={vi.fn()}
          onOpenLiveArtifact={vi.fn()}
          onDeleteProject={vi.fn()}
          onRenameProject={vi.fn()}
          onChangeDefaultDesignSystem={vi.fn()}
          onPersistComposioKey={vi.fn()}
          onOpenSettings={vi.fn()}
          onCompleteOnboarding={vi.fn()}
        />
      </I18nProvider>,
    );
  }

  it('does not duplicate the Settings theme control on the welcome pane', () => {
    const { container } = renderOnboarding();

    expect(container.querySelector('.onboarding-cloud__pane')).not.toBeNull();
    expect(container.querySelector('.onboarding-cloud__theme')).toBeNull();
  });

  it('keeps all theme labels available from the Settings surface instead', () => {
    renderOnboarding();

    for (const label of THEME_CONTROL_LABELS) {
      expect(screen.queryByRole('button', { name: label })).toBeNull();
    }
  });
});

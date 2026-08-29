// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../src/App';
import { fetchAmrModels, fetchVelaLoginStatus } from '../../src/providers/daemon';
import {
  daemonIsLive,
  fetchAgentsStream,
  fetchAppVersionInfo,
  fetchDesignSystems,
  fetchDesignTemplates,
  fetchPromptTemplates,
  fetchSkills,
} from '../../src/providers/registry';
import {
  fetchComposioConfigFromDaemon,
  fetchDaemonConfig,
  fetchMediaProvidersFromDaemon,
  loadConfig,
  mergeDaemonConfig,
} from '../../src/state/config';
import { listProjects, listTemplates } from '../../src/state/projects';
import type { AppConfig, AppVersionInfo } from '../../src/types';

const routeState = vi.hoisted(() => ({
  current: { kind: 'home' as const, view: 'home' as const },
}));

vi.mock('../../src/router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/router')>();
  return {
    ...actual,
    navigate: vi.fn(),
    useRoute: () => routeState.current,
  };
});

vi.mock('../../src/components/EntryView', async () => {
  const { createElement: element } = await import('react');
  return {
    EntryView: () => element('button', { type: 'button', 'data-testid': 'front-interactive' }, 'Open project'),
  };
});

vi.mock('../../src/components/ProjectView', async () => {
  const { createElement: element } = await import('react');
  return { ProjectView: () => element('div', null, 'Project view') };
});

vi.mock('../../src/components/EntryNavRail', () => ({
  WorkspaceTopRightAccountCluster: () => null,
}));

vi.mock('../../src/components/pet/PetOverlay', () => ({
  PetOverlay: () => null,
}));

vi.mock('../../src/components/pet/pets', () => ({
  migrateCustomPetAtlas: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../src/components/MemoryToast', async () => {
  const actual = await vi.importActual<typeof import('../../src/components/MemoryToast')>(
    '../../src/components/MemoryToast',
  );
  return { ...actual, MemoryToast: () => null };
});

vi.mock('../../src/components/PrivacyConsentModal', () => ({
  PrivacyConsentModal: () => null,
}));

vi.mock('../../src/components/SettingsDialog', async () => {
  const actual = await vi.importActual<typeof import('../../src/components/SettingsDialog')>(
    '../../src/components/SettingsDialog',
  );
  return { ...actual, SettingsDialog: () => null };
});

vi.mock('../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/registry')>(
    '../../src/providers/registry',
  );
  return {
    ...actual,
    daemonIsLive: vi.fn(),
    fetchAgentsStream: vi.fn(),
    fetchAppVersionInfo: vi.fn(),
    fetchDesignSystems: vi.fn(),
    fetchDesignTemplates: vi.fn(),
    fetchPromptTemplates: vi.fn(),
    fetchSkills: vi.fn(),
  };
});

vi.mock('../../src/providers/daemon', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/daemon')>(
    '../../src/providers/daemon',
  );
  return {
    ...actual,
    fetchAmrModels: vi.fn(),
    fetchVelaLoginStatus: vi.fn(),
  };
});

vi.mock('../../src/state/projects', async () => {
  const actual = await vi.importActual<typeof import('../../src/state/projects')>(
    '../../src/state/projects',
  );
  return {
    ...actual,
    listProjects: vi.fn(),
    listTemplates: vi.fn(),
  };
});

vi.mock('../../src/state/config', async () => {
  const actual = await vi.importActual<typeof import('../../src/state/config')>(
    '../../src/state/config',
  );
  return {
    ...actual,
    fetchComposioConfigFromDaemon: vi.fn(),
    fetchDaemonConfig: vi.fn(),
    fetchMediaProvidersFromDaemon: vi.fn(),
    loadConfig: vi.fn(),
    mergeDaemonConfig: vi.fn(),
    saveConfig: vi.fn(),
    syncComposioConfigToDaemon: vi.fn().mockResolvedValue(true),
    syncConfigToDaemon: vi.fn().mockResolvedValue(undefined),
  };
});

const baseConfig: AppConfig = {
  mode: 'api',
  apiKey: '',
  apiProtocol: 'anthropic',
  apiVersion: '',
  baseUrl: 'https://api.anthropic.com',
  model: 'claude-sonnet-4-5',
  apiProviderBaseUrl: 'https://api.anthropic.com',
  apiProtocolConfigs: {},
  agentId: null,
  skillId: null,
  designSystemId: null,
  onboardingCompleted: true,
  privacyDecisionAt: 1,
  mediaProviders: {},
  composio: {},
  agentModels: {},
  agentCliEnv: {},
};

const mockedDaemonIsLive = vi.mocked(daemonIsLive);
const mockedFetchAgentsStream = vi.mocked(fetchAgentsStream);
const mockedFetchAppVersionInfo = vi.mocked(fetchAppVersionInfo);
const mockedFetchDesignSystems = vi.mocked(fetchDesignSystems);
const mockedFetchDesignTemplates = vi.mocked(fetchDesignTemplates);
const mockedFetchPromptTemplates = vi.mocked(fetchPromptTemplates);
const mockedFetchSkills = vi.mocked(fetchSkills);
const mockedFetchAmrModels = vi.mocked(fetchAmrModels);
const mockedFetchVelaLoginStatus = vi.mocked(fetchVelaLoginStatus);
const mockedFetchDaemonConfig = vi.mocked(fetchDaemonConfig);
const mockedFetchComposioConfig = vi.mocked(fetchComposioConfigFromDaemon);
const mockedFetchMediaProviders = vi.mocked(fetchMediaProvidersFromDaemon);
const mockedLoadConfig = vi.mocked(loadConfig);
const mockedMergeDaemonConfig = vi.mocked(mergeDaemonConfig);
const mockedListProjects = vi.mocked(listProjects);
const mockedListTemplates = vi.mocked(listTemplates);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function validInfo(): AppVersionInfo {
  return {
    version: '1.2.3',
    channel: 'stable',
    packaged: true,
    platform: 'win32',
    arch: 'x64',
    provenance: {
      schemaVersion: 1,
      version: '1.2.3',
      sourceCommit: '0123456789abcdef0123456789abcdef01234567',
      updatedAt: '2026-08-29T18:15:16Z',
    },
  };
}

function provenanceCard(): HTMLElement {
  const card = document.querySelector<HTMLElement>('[data-front-screen-provenance="true"]');
  if (!card) throw new Error('front-screen provenance card is missing');
  return card;
}

function interactiveShell(): HTMLElement {
  const shell = document.querySelector<HTMLElement>('.workspace-shell__interactive');
  if (!shell) throw new Error('interactive shell is missing');
  return shell;
}

describe('front-screen identity contracts', () => {
  beforeEach(() => {
    routeState.current = { kind: 'home', view: 'home' };
    mockedDaemonIsLive.mockResolvedValue(true);
    mockedFetchAgentsStream.mockResolvedValue([]);
    mockedFetchDesignSystems.mockResolvedValue([]);
    mockedFetchDesignTemplates.mockResolvedValue([]);
    mockedFetchPromptTemplates.mockResolvedValue([]);
    mockedFetchSkills.mockResolvedValue([]);
    mockedFetchAmrModels.mockResolvedValue({ source: 'preset', refreshing: false, models: [] });
    mockedFetchVelaLoginStatus.mockResolvedValue({
      loggedIn: false,
      loginInFlight: false,
      profile: 'prod',
      user: null,
      configPath: 'profile.json',
    });
    mockedFetchDaemonConfig.mockResolvedValue({ privacyDecisionAt: 1 });
    mockedFetchComposioConfig.mockResolvedValue(null);
    mockedFetchMediaProviders.mockResolvedValue({ status: 'ok', providers: {} });
    mockedLoadConfig.mockReturnValue({ ...baseConfig });
    mockedMergeDaemonConfig.mockImplementation((local) => local);
    mockedListProjects.mockResolvedValue([]);
    mockedListTemplates.mockResolvedValue([]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })),
    );
    window.localStorage.clear();
    window.history.replaceState(null, '', '/');
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('renders loading before navigation and keeps the interactive shell inert', async () => {
    const lookup = deferred<AppVersionInfo | null>();
    mockedFetchAppVersionInfo.mockReturnValue(lookup.promise);
    const router = await import('../../src/router');

    render(createElement(App));

    const card = provenanceCard();
    const shell = interactiveShell();
    expect(card.getAttribute('data-provenance-status')).toBe('loading');
    expect(card.compareDocumentPosition(shell) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(shell.hasAttribute('inert')).toBe(true);
    expect(shell.getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByRole('alert').textContent).toContain('Loading');
    expect(document.querySelector('[data-testid="front-interactive"]')).not.toBeNull();
    expect(vi.mocked(router.navigate)).not.toHaveBeenCalled();

    lookup.resolve(validInfo());
    await waitFor(() => expect(provenanceCard().getAttribute('data-provenance-status')).toBe('verified'));
  });

  it('renders bound version provenance with seconds and a timezone before enabling the shell', async () => {
    const info = validInfo();
    mockedFetchAppVersionInfo.mockResolvedValue(info);
    const router = await import('../../src/router');

    render(createElement(App));

    await waitFor(() => expect(provenanceCard().getAttribute('data-provenance-status')).toBe('verified'));
    expect(screen.getByText('1.2.3')).toBeTruthy();
    const expectedUpdatedAt = new Intl.DateTimeFormat('en', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short',
    }).format(new Date(info.provenance!.updatedAt));
    expect(document.querySelector('[data-provenance-value="updated-at"]')?.textContent)
      .toBe(expectedUpdatedAt);
    expect(expectedUpdatedAt).toMatch(/\d{2}:\d{2}:\d{2}/);
    expect(expectedUpdatedAt).toMatch(/(?:UTC|GMT|[A-Z]{2,5})/);
    expect(interactiveShell().hasAttribute('inert')).toBe(false);
    expect(interactiveShell().getAttribute('aria-hidden')).toBe('false');
    expect(vi.mocked(router.navigate)).not.toHaveBeenCalled();
  });

  it('rejects invalid provenance while retaining a separately valid version', async () => {
    const info = validInfo();
    mockedFetchAppVersionInfo.mockResolvedValue({
      ...info,
      provenance: { ...info.provenance!, sourceCommit: 'not-a-commit' },
    });

    render(createElement(App));

    await waitFor(() => expect(provenanceCard().getAttribute('data-provenance-status')).toBe('unavailable'));
    expect(screen.getByText('1.2.3')).toBeTruthy();
    expect(document.querySelector('[data-provenance-value="updated-at"]')?.textContent).toBe('Not set');
    expect(screen.getByRole('alert').textContent).toBe('Not set');
    expect(provenanceCard().getAttribute('aria-label')).toBe('Version and Last updated');
    expect(interactiveShell().hasAttribute('inert')).toBe(false);
  });

  it('renders an accessible unavailable state when lookup returns no facts', async () => {
    mockedFetchAppVersionInfo.mockResolvedValue(null);

    render(createElement(App));

    await waitFor(() => expect(provenanceCard().getAttribute('data-provenance-status')).toBe('unavailable'));
    expect(document.querySelector('[data-provenance-value="version"]')?.textContent).toBe('Not set');
    expect(document.querySelector('[data-provenance-value="updated-at"]')?.textContent).toBe('Not set');
    expect(screen.getByRole('alert').textContent).toBe('Not set');
    expect(provenanceCard().getAttribute('aria-label')).toBe('Version and Last updated');
  });
});

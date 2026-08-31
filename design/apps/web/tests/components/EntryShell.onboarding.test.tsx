// @vitest-environment jsdom

import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EntryShell } from '../../src/components/EntryShell';
import { I18nProvider } from '../../src/i18n';
import { fetchProjectFiles } from '../../src/providers/registry';
import type { AgentInfo, AppConfig } from '../../src/types';
import { setHomeHeroPrompt } from '../helpers/home-hero-lexical';

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

const originalFetch = globalThis.fetch;
const originalResizeObserver = globalThis.ResizeObserver;

class ResizeObserverMock {
  observe() {}
  disconnect() {}
  unobserve() {}
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function amrAgent(overrides: Partial<AgentInfo> = {}): AgentInfo {
  return {
    id: 'amr',
    name: 'AMR',
    bin: 'amr',
    available: true,
    models: [{ id: 'amr-model', label: 'AMR Model' }],
    ...overrides,
  };
}

function cliAgent(overrides: Partial<AgentInfo> = {}): AgentInfo {
  return {
    id: 'claude-code',
    name: 'Claude Code',
    bin: 'claude',
    available: true,
    version: '1.0.0',
    models: [{ id: 'sonnet', label: 'Sonnet' }],
    ...overrides,
  };
}

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

function renderOnboarding(
  overrides: Partial<React.ComponentProps<typeof EntryShell>> = {},
) {
  window.history.replaceState(null, '', '/onboarding');
  const props: React.ComponentProps<typeof EntryShell> = {
    skills: [],
    designTemplates: [],
    designSystems: [],
    projects: [],
    templates: [],
    promptTemplates: [],
    defaultDesignSystemId: null,
    connectors: [],
    connectorsLoading: false,
    config: baseConfig(),
    agents: [amrAgent(), cliAgent()],
    daemonLive: true,
    onModeChange: vi.fn(),
    onAgentChange: vi.fn(),
    onAgentModelChange: vi.fn(),
    onApiProtocolChange: vi.fn(),
    onApiModelChange: vi.fn(),
    onConfigPersist: vi.fn(),
    onRefreshAgents: vi.fn(() => [amrAgent(), cliAgent()]),
    onCreateProject: vi.fn(),
    onCreatePluginShareProject: vi.fn(),
    onImportClaudeDesign: vi.fn(),
    onOpenProject: vi.fn(),
    onOpenLiveArtifact: vi.fn(),
    onDeleteProject: vi.fn(),
    onRenameProject: vi.fn(),
    onChangeDefaultDesignSystem: vi.fn(),
    onPersistComposioKey: vi.fn(),
    onOpenSettings: vi.fn(),
    onCompleteOnboarding: vi.fn(),
    ...overrides,
  };

  function Harness() {
    const [config, setConfig] = useState(props.config);
    return (
      <I18nProvider initial="en">
        <EntryShell
          {...props}
          config={config}
          onConfigPersist={(next) => {
            props.onConfigPersist(next);
            setConfig(next as AppConfig);
          }}
        />
      </I18nProvider>
    );
  }

  render(
    <Harness />,
  );

  return props;
}

function renderHome(
  overrides: Partial<React.ComponentProps<typeof EntryShell>> = {},
  path = '/',
) {
  window.history.replaceState(null, '', path);
  const props: React.ComponentProps<typeof EntryShell> = {
    skills: [],
    designTemplates: [],
    designSystems: [],
    projects: [],
    templates: [],
    promptTemplates: [],
    defaultDesignSystemId: null,
    connectors: [],
    connectorsLoading: false,
    config: baseConfig({
      agentId: 'claude-code',
      agentModels: { 'claude-code': { model: 'sonnet' } },
    }),
    agents: [cliAgent()],
    daemonLive: true,
    onModeChange: vi.fn(),
    onAgentChange: vi.fn(),
    onAgentModelChange: vi.fn(),
    onApiProtocolChange: vi.fn(),
    onApiModelChange: vi.fn(),
    onConfigPersist: vi.fn(),
    onRefreshAgents: vi.fn(() => [cliAgent()]),
    onCreateProject: vi.fn(),
    onCreatePluginShareProject: vi.fn(),
    onImportClaudeDesign: vi.fn(),
    onOpenProject: vi.fn(),
    onOpenLiveArtifact: vi.fn(),
    onDeleteProject: vi.fn(),
    onRenameProject: vi.fn(),
    onChangeDefaultDesignSystem: vi.fn(),
    onPersistComposioKey: vi.fn(),
    onOpenSettings: vi.fn(),
    onCompleteOnboarding: vi.fn(),
    ...overrides,
  };

  render(
    <I18nProvider initial="en">
      <EntryShell {...props} />
    </I18nProvider>,
  );

  return props;
}

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  globalThis.ResizeObserver = originalResizeObserver;
  vi.useRealTimers();
  analyticsMocks.track.mockReset();
  window.sessionStorage.clear();
});

beforeEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;
  analyticsMocks.track.mockReset();
});

describe('EntryShell settings menu', () => {
  it('opens settings from the signed-out rail without duplicating the footer action', async () => {
    globalThis.fetch = vi.fn(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url.endsWith('/api/community/discord')) {
        return jsonResponse({
          inviteCode: 'mHAjSMV6gz',
          inviteUrl: 'https://discord.gg/mHAjSMV6gz',
          onlineCount: 1234,
          memberCount: 4321,
          fetchedAt: Date.now(),
          stale: false,
        });
      }
      if (url.endsWith('/api/github/open-design')) {
        return jsonResponse({
          repo: 'nexu-io/open-design',
          stargazers_count: 56100,
          fetchedAt: Date.now(),
          stale: false,
        });
      }
      return jsonResponse({});
    }) as typeof fetch;
    const props = renderHome();

    // The signed-out rail's own settings item (below 扩展) is the single
    // settings entry — the #5517 footer carries none.
    fireEvent.click(await screen.findByTestId('entry-settings-button'));

    expect(props.onOpenSettings).toHaveBeenCalledWith();
    expect(screen.getAllByTestId('entry-settings-button')).toHaveLength(1);
  });
});

describe('EntryShell navigation shortcuts', () => {
  afterEach(() => {
    window.localStorage.removeItem('od.entry.railOpen');
  });

  it('leaves the rail unchanged when the composer owns Cmd/Ctrl+B', async () => {
    window.localStorage.setItem('od.entry.railOpen', 'false');
    renderHome();

    const entry = document.querySelector('.entry');
    expect(entry).toBeInstanceOf(HTMLElement);
    expect(entry?.classList.contains('entry--rail-open')).toBe(false);

    const editor = await screen.findByTestId('home-hero-input');
    fireEvent.keyDown(editor, {
      key: 'b',
      ...(/Mac|iPod|iPhone|iPad/.test(navigator.platform)
        ? { metaKey: true }
        : { ctrlKey: true }),
    });

    expect(entry?.classList.contains('entry--rail-open')).toBe(false);
  });
});

describe('EntryShell design systems view', () => {
  it('leaves workspace-scoped design-system activation to the mounted tab', async () => {
    const onDesignSystemsRefresh = vi.fn();
    renderHome({ onDesignSystemsRefresh }, '/design-systems');

    expect(await screen.findByTestId('entry-view-design-systems')).toHaveAttribute(
      'data-active',
      'true',
    );
    // DesignSystemsTab owns its Team SSE activation and fallback snapshot.
    // Calling the App-level catalog refresh here as well creates a duplicate,
    // differently-scoped request every time the route becomes active.
    expect(onDesignSystemsRefresh).not.toHaveBeenCalled();
  });
});

describe('EntryShell route scroll isolation', () => {
  afterEach(() => {
    window.localStorage.removeItem('od.entry.railOpen');
  });

  function entryScrollContainer(): HTMLElement {
    const scrollContainer = document.querySelector('.entry-main--scroll');
    expect(scrollContainer).toBeInstanceOf(HTMLElement);
    if (!(scrollContainer instanceof HTMLElement)) {
      throw new Error('entry scroll container not found');
    }
    return scrollContainer;
  }

  // #5517 reshaped the rail: the flat `entry-nav-projects` button is gone, and
  // its Drafts / All-projects replacements only mount under a workspace
  // context this render has none of. Design systems is the nearest rail
  // destination that survives in every state, and the reset it exercises is the
  // same shared `.entry-main--scroll` element, so the spec's subject is intact.
  it('resets the shared scroll offset when navigating away from Home', async () => {
    window.localStorage.setItem('od.entry.railOpen', 'true');
    renderHome();

    const scrollContainer = entryScrollContainer();
    scrollContainer.scrollTop = 280;
    fireEvent.click(screen.getByTestId('entry-nav-design-systems'));

    await waitFor(() => {
      expect(
        screen.getByTestId('entry-view-design-systems').getAttribute('data-active'),
      ).toBe('true');
    });
    expect(scrollContainer.scrollTop).toBe(0);
  });

  it('resets the shared scroll offset when navigating from Projects to Home', async () => {
    window.localStorage.setItem('od.entry.railOpen', 'true');
    renderHome({}, '/projects');

    const scrollContainer = entryScrollContainer();
    scrollContainer.scrollTop = 360;
    fireEvent.click(screen.getByTestId('entry-nav-home'));

    await waitFor(() => {
      expect(screen.getByTestId('entry-view-home').getAttribute('data-active')).toBe('true');
    });
    expect(scrollContainer.scrollTop).toBe(0);
  });
});

describe('EntryShell project reopen request priority', () => {
  it('aborts Home cover work, keeps hidden Projects idle, and lets the foreground files read finish', async () => {
    const files = [{
      name: 'index.html',
      path: 'index.html',
      kind: 'html' as const,
      mtime: 1,
      size: 1,
      mime: 'text/html',
    }];
    const fileRequests: Array<RequestInit | undefined> = [];
    const fetchMock = vi.fn(
      async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const url = typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input);
        if (url === '/api/projects/project-reopen/files') {
          // Single-flight (`lib/shared-cancellable-get`) gives every `/files`
          // reader — cancellable or not — one shared request carrying the
          // shared AbortSignal, so "is this the background scan?" is the
          // request ordinal, not the presence of a signal. Request #1 is
          // Home's cover scan and must hang until it is aborted; the
          // foreground read that follows it must be answered.
          const isBackgroundCoverScan = fileRequests.length === 0;
          fileRequests.push(init);
          if (isBackgroundCoverScan) {
            return new Promise<Response>((_resolve, reject) => {
              init?.signal?.addEventListener(
                'abort',
                () => reject(new DOMException('Aborted', 'AbortError')),
                { once: true },
              );
            });
          }
          return jsonResponse({ files });
        }
        if (url.includes('/api/live-artifacts?projectId=project-reopen')) {
          return jsonResponse({ liveArtifacts: [] });
        }
        if (url.endsWith('/api/community/discord')) {
          return jsonResponse({
            inviteCode: 'mHAjSMV6gz',
            inviteUrl: 'https://discord.gg/mHAjSMV6gz',
            onlineCount: 0,
            memberCount: 0,
            fetchedAt: Date.now(),
            stale: false,
          });
        }
        if (url.endsWith('/api/github/open-design')) {
          return jsonResponse({
            repo: 'nexu-io/open-design',
            stargazers_count: 0,
            fetchedAt: Date.now(),
            stale: false,
          });
        }
        return jsonResponse({});
      },
    );
    globalThis.fetch = fetchMock as typeof fetch;
    const onOpenProject = vi.fn((projectId: string) => {
      expect(projectId).toBe('project-reopen');
      // App leaves EntryShell when it opens ProjectView. Model that boundary
      // directly so the mounted Home strip must cancel its background probe.
      cleanup();
    });

    renderHome({
      projects: [{
        id: 'project-reopen',
        name: 'Reopen project',
        skillId: null,
        designSystemId: null,
        createdAt: 1,
        updatedAt: 2,
        status: { value: 'not_started' },
      }],
      onOpenProject,
    });

    await waitFor(() => expect(fileRequests).toHaveLength(1));
    const homeSignal = fileRequests[0]?.signal;
    expect(homeSignal).toBeDefined();
    // DesignsTab is mounted under EntryShell's hidden Projects pane, but its
    // own background files/live-artifact scans must remain dormant.
    expect(
      fetchMock.mock.calls.filter(([input]) =>
        String(input).includes('/api/live-artifacts?projectId=project-reopen'),
      ),
    ).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: /Reopen project/ }));

    expect(onOpenProject).toHaveBeenCalledTimes(1);
    expect(homeSignal?.aborted).toBe(true);
    await expect(fetchProjectFiles('project-reopen')).resolves.toEqual(files);
    expect(fileRequests).toHaveLength(2);
    // The foreground read must own a live request of its own: it neither joins
    // the abandoned scan's dead entry nor inherits its aborted signal.
    const foregroundSignal = fileRequests[1]?.signal;
    expect(foregroundSignal).toBeDefined();
    expect(foregroundSignal).not.toBe(homeSignal);
    expect(foregroundSignal?.aborted).toBe(false);
  });
});

describe('EntryShell new project rail', () => {
  // The rail's "+ New project" button (`entry-nav-new-project`) is gone in
  // #5517's rail: `EntryShell` still passes `onNewProject` — with its
  // `new_project_plus` ui_click — to `EntryNavRail`, but the rail never renders
  // a control that calls it, so the button and that analytics event are both
  // unreachable. The spec that drove it is therefore removed; opening the
  // new-project modal is still covered by the Projects-view CTA below, which is
  // the surviving entry point.

  it('opens the new project modal from the Projects view new-project button', async () => {
    const fetchMock = vi.fn(
      async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
        if (url === '/api/projects' && init?.method === 'POST') {
          return jsonResponse({
            project: {
              id: 'blank-project-from-projects',
              name: 'Untitled',
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
            conversationId: 'conversation-2',
          });
        }
        if (url.endsWith('/api/projects/project-existing/files')) {
          return jsonResponse({ files: [] });
        }
        if (url.endsWith('/api/live-artifacts?projectId=project-existing')) {
          return jsonResponse({ liveArtifacts: [] });
        }
        if (url.endsWith('/api/community/discord')) {
          return jsonResponse({
            inviteCode: 'mHAjSMV6gz',
            inviteUrl: 'https://discord.gg/mHAjSMV6gz',
            onlineCount: 0,
            memberCount: 0,
            fetchedAt: Date.now(),
            stale: false,
          });
        }
        if (url.endsWith('/api/github/open-design')) {
          return jsonResponse({
            repo: 'nexu-io/open-design',
            stargazers_count: 0,
            fetchedAt: Date.now(),
            stale: false,
          });
        }
        return jsonResponse({});
      });
    globalThis.fetch = fetchMock as typeof fetch;
    // Start directly on the Projects view (/projects). The nav rail no longer
    // has a single "Projects" button — the projects list is its own route,
    // reachable via /projects or Home's "view all" — so drive the DesignsTab's
    // own new-project CTA rather than a removed rail button.
    const props = renderHome({
      projects: [
        {
          id: 'project-existing',
          name: 'Existing project',
          skillId: null,
          designSystemId: null,
          createdAt: 1,
          updatedAt: 2,
          status: { value: 'not_started' },
        },
      ],
    }, '/projects');

    fireEvent.click(screen.getByTestId('designs-new-project'));

    await waitFor(() => {
      expect(screen.getByTestId('new-project-modal')).toBeTruthy();
    });
    expect(screen.getByTestId('new-project-panel')).toBeTruthy();
    expect(props.onOpenProject).not.toHaveBeenCalled();
    expect(props.onCreateProject).not.toHaveBeenCalled();
    const createCall = fetchMock.mock.calls.find(
      ([input, init]) => input === '/api/projects' && init?.method === 'POST',
    );
    expect(createCall).toBeUndefined();
    expect(analyticsMocks.track).toHaveBeenCalledWith(
      'ui_click',
      expect.objectContaining({
        page_name: 'projects',
        area: 'list_controls',
        element: 'create_project',
      }),
      undefined,
    );
  });
});

describe('EntryShell Home submit handoff', () => {
  it('keeps the Home run button in sending state until project creation resolves', async () => {
    globalThis.fetch = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url.endsWith('/api/plugins')) return jsonResponse({ plugins: [] });
      if (url.endsWith('/api/mcp/servers')) return jsonResponse({ servers: [] });
      if (url.endsWith('/api/community/discord')) return jsonResponse({ stale: true });
      if (url.endsWith('/api/github/open-design')) return jsonResponse({ stale: true });
      return jsonResponse({});
    }) as typeof fetch;
    let resolveCreate: (accepted: boolean) => void = () => undefined;
    const onCreateProject = vi.fn(
      () => new Promise<boolean>((resolve) => { resolveCreate = resolve; }),
    );
    renderHome({ onCreateProject });

    await screen.findByTestId('home-hero-input');
    setHomeHeroPrompt('Build a landing page');
    const submit = await screen.findByTestId('home-hero-submit') as HTMLButtonElement;
    fireEvent.click(submit);

    await waitFor(() => expect(onCreateProject).toHaveBeenCalledTimes(1));
    expect(submit.disabled).toBe(true);
    // #5517: the submit is icon-only (spinner while sending) — assert the
    // busy state through aria instead of the removed label text.
    expect(submit.getAttribute('aria-busy')).toBe('true');

    resolveCreate(true);
    await waitFor(() => expect(submit.disabled).toBe(false));
  });
});

describe('EntryShell onboarding provider routing', () => {
  it('opens directly on Local Agent and BYOK without mounting cloud sign-in', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}));
    globalThis.fetch = fetchMock as typeof fetch;

    renderOnboarding();

    expect(
      await screen.findByRole('heading', { name: 'Choose your model source' }),
    ).toBeTruthy();
    expect(screen.getByRole('radio', { name: /Local Agent/i }).getAttribute('aria-checked')).toBe(
      'true',
    );
    expect(screen.getByRole('radio', { name: /Bring Your Own Key/i })).toBeTruthy();
    expect(screen.queryByRole('radio', { name: /OpenDesign Hosted/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Sign in to OpenDesign/i })).toBeNull();
    expect(
      fetchMock.mock.calls.some(([input]) => String(input).includes('/api/integrations/vela/login')),
    ).toBe(false);
  });

  it('shows local setup guidance instead of cloud authentication when no route is ready', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({})) as typeof fetch;
    renderOnboarding({
      agents: [amrAgent()],
      onRefreshAgents: vi.fn(() => [amrAgent()]),
    });

    expect(
      await screen.findByText(
        'No agents detected yet. Install one of Claude Code, Codex, Devin for Terminal, OpenCode, Cursor Agent, Qwen, or GitHub Copilot CLI, then click Rescan.',
      ),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: /Rescan/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Sign in to OpenDesign/i })).toBeNull();
  });

  it('restores a complete BYOK route as the selected first-launch source', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({})) as typeof fetch;
    renderOnboarding({
      config: baseConfig({
        mode: 'api',
        agentId: 'amr',
        apiKey: 'configured-key',
        baseUrl: 'https://api.example.test',
        model: 'model-1',
      }),
      agents: [amrAgent()],
    });

    expect(
      (await screen.findByRole('radio', { name: /Bring Your Own Key/i })).getAttribute(
        'aria-checked',
      ),
    ).toBe('true');
    expect(screen.queryByRole('button', { name: /Sign in to OpenDesign/i })).toBeNull();
  });
});

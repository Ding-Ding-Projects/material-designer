import { describe, expect, it } from 'vitest';
import {
  isStudioFixtureProjectId,
  parseStudioFixtureRoute,
  studioFixtureAgent,
  studioFixtureArtifact,
  studioFixtureArtifactPreviewUrl,
  studioFixtureCaptureWitnessMatches,
  studioFixtureConversation,
  studioFixtureFileText,
  studioFixtureFiles,
  studioFixtureInitialFileSelection,
  studioFixtureMessages,
  studioFixtureNetworkAllows,
  studioFixtureProject,
  studioFixtureProjectFilePath,
  studioFixtureProjectPath,
  studioFixtureRun,
  studioFixtureEndpointStatus,
  studioFixtureSafeConfig,
  studioFixtureTabs,
  studioFixtureTabsStateIsValid,
  STUDIO_FIXTURE_ACTIVE_FILE,
  STUDIO_FIXTURE_CONVERSATION_ID,
  STUDIO_FIXTURE_PROJECT_ID,
  STUDIO_FIXTURE_RENDERER_PATH,
  STUDIO_FIXTURE_RENDERER_STATE,
  STUDIO_FIXTURE_REVISION,
  STUDIO_FIXTURE_SOURCE,
} from '../../src/capture/studio-fixture';

const STUDIO_QUERY = [
  'state=default',
  'theme=light',
  'width=1440',
  'height=900',
  'scale=1',
  'locale=en-US',
  `fixture=${STUDIO_FIXTURE_REVISION}`,
  'time=2026-08-02T21%3A22%3A17.000Z',
  'motion=frozen',
  'random=3003',
  'fonts=bundled-roboto-v1',
  'network=disabled',
].join('&');
const STUDIO_RENDERER_URL = `od://app${STUDIO_FIXTURE_RENDERER_PATH}?${STUDIO_QUERY}`;

describe('Studio capture fixture contract', () => {
  it('accepts only the exact deterministic canonical renderer address', () => {
    const route = parseStudioFixtureRoute(STUDIO_RENDERER_URL);
    expect(route).not.toBeNull();
    expect(route?.projectId).toBe(STUDIO_FIXTURE_PROJECT_ID);
    expect(route?.conversationId).toBe(STUDIO_FIXTURE_CONVERSATION_ID);
    expect(route?.fileName).toBe(STUDIO_FIXTURE_ACTIVE_FILE);
    expect(route && studioFixtureProjectPath(route)).toBe(
      `/projects/${STUDIO_FIXTURE_PROJECT_ID}/conversations/${STUDIO_FIXTURE_CONVERSATION_ID}/files/${STUDIO_FIXTURE_ACTIVE_FILE}`,
    );
  });

  it('keeps the canonical renderer tuple stable', () => {
    const launchRoute = parseStudioFixtureRoute(STUDIO_RENDERER_URL);
    const rendererRoute = parseStudioFixtureRoute(STUDIO_RENDERER_URL);
    expect(rendererRoute).not.toBeNull();
    expect(rendererRoute?.projectId).toBe(launchRoute?.projectId);
    expect(rendererRoute?.conversationId).toBe(launchRoute?.conversationId);
    expect(rendererRoute?.fileName).toBe(launchRoute?.fileName);
    expect(rendererRoute?.cacheKey).toBe(STUDIO_RENDERER_URL);
    expect(STUDIO_FIXTURE_RENDERER_STATE).toBe('studio');
    expect(STUDIO_FIXTURE_SOURCE).toBe('capture-provider');
  });

  it('requires the desktop-owned tuple witness for the canonical renderer path', () => {
    const route = parseStudioFixtureRoute(STUDIO_RENDERER_URL);
    expect(route).not.toBeNull();
    const witness = {
      screen: 'studio',
      state: 'default',
      theme: 'light',
      viewport: { width: 1440, height: 900 },
      scale: 1,
      locale: 'en-US',
      fixtureRevision: STUDIO_FIXTURE_REVISION,
      time: '2026-08-02T21:22:17.000Z',
      motion: 'frozen',
      randomSeed: 3003,
      fonts: 'bundled-roboto-v1',
      network: 'disabled',
    };
    expect(studioFixtureCaptureWitnessMatches(route!, witness)).toBe(true);
    expect(studioFixtureCaptureWitnessMatches(route!, { ...witness, fixtureRevision: 'other' })).toBe(false);
    expect(studioFixtureCaptureWitnessMatches(route!, null)).toBe(false);
  });

  it('rejects a revision, state, or query-boundary drift instead of activating a near miss', () => {
    expect(parseStudioFixtureRoute(STUDIO_RENDERER_URL.replace(STUDIO_FIXTURE_REVISION, 'fixture-revision-2'))).toBeNull();
    expect(parseStudioFixtureRoute(STUDIO_RENDERER_URL.replace('state=default', 'state=review'))).toBeNull();
    expect(parseStudioFixtureRoute(`${STUDIO_RENDERER_URL}&extra=ignored`)).toBeNull();
    expect(parseStudioFixtureRoute(`material-designer://studio?${STUDIO_QUERY}`)).toBeNull();
    expect(parseStudioFixtureRoute(STUDIO_RENDERER_URL.replace(STUDIO_FIXTURE_PROJECT_ID, 'another-project'))).toBeNull();
    expect(parseStudioFixtureRoute(STUDIO_RENDERER_URL.replace('od://app', 'od://other'))).toBeNull();
    expect(parseStudioFixtureRoute(`${STUDIO_RENDERER_URL}#drift`)).toBeNull();
    expect(parseStudioFixtureRoute(STUDIO_RENDERER_URL.replace('od://app', 'od://user:pass@app:4173'))).toBeNull();
  });

  it('keeps every deterministic tuple field owned by the desktop capture tuple', () => {
    for (const [key, value] of [
      ['locale=en-US', 'locale=fr-FR'],
      ['time=2026-08-02T21%3A22%3A17.000Z', 'time=2026-08-02T21%3A22%3A18.000Z'],
      ['random=3003', 'random=3004'],
      ['motion=frozen', 'motion=running'],
      ['fonts=bundled-roboto-v1', 'fonts=system'],
      ['network=disabled', 'network=enabled'],
      ['scale=1', 'scale=1.25'],
    ] as const) {
      expect(parseStudioFixtureRoute(STUDIO_RENDERER_URL.replace(key, value))).toBeNull();
    }
  });

  it('keeps one strict public-safe project, conversation, run, files, and artifact graph', () => {
    expect(studioFixtureProject.id).toBe(STUDIO_FIXTURE_PROJECT_ID);
    expect(studioFixtureConversation.projectId).toBe(STUDIO_FIXTURE_PROJECT_ID);
    expect(studioFixtureConversation.id).toBe(STUDIO_FIXTURE_CONVERSATION_ID);
    expect(studioFixtureRun.projectId).toBe(STUDIO_FIXTURE_PROJECT_ID);
    expect(studioFixtureRun.conversationId).toBe(STUDIO_FIXTURE_CONVERSATION_ID);
    expect(studioFixtureRun.artifactPaths).toEqual([STUDIO_FIXTURE_ACTIVE_FILE]);
    expect(studioFixtureArtifact.projectId).toBe(STUDIO_FIXTURE_PROJECT_ID);
    expect(studioFixtureArtifact.createdByRunId).toBe(studioFixtureRun.id);
    expect(studioFixtureFiles.map((file) => file.name)).toEqual([
      'orders-dashboard.html',
      'DESIGN.md',
      'data.json',
    ]);
    expect(studioFixtureTabs.active).toBe(STUDIO_FIXTURE_ACTIVE_FILE);
    expect(studioFixtureTabs.tabs).toContain(`live:${studioFixtureArtifact.id}`);
    expect(studioFixtureMessages).toHaveLength(2);
    expect(studioFixtureMessages[1]?.events?.some((event) => event.kind === 'tool_use')).toBe(true);
    expect(studioFixtureMessages[1]?.events?.some((event) => event.kind === 'live_artifact')).toBe(true);
    expect(studioFixtureFileText[STUDIO_FIXTURE_ACTIVE_FILE]).toContain('Orders dashboard');
    expect(studioFixtureAgent.id).toBe('fixture-agent');
  });

  it('selects the declared file only for the initial fixture route', () => {
    const route = parseStudioFixtureRoute(STUDIO_RENDERER_URL);
    expect(studioFixtureInitialFileSelection(route, STUDIO_FIXTURE_PROJECT_ID, 'initial-route')).toBe(
      STUDIO_FIXTURE_ACTIVE_FILE,
    );
    expect(studioFixtureInitialFileSelection(route, STUDIO_FIXTURE_PROJECT_ID, 'project-switch')).toBeNull();
    expect(studioFixtureInitialFileSelection(route, STUDIO_FIXTURE_PROJECT_ID, 'file-refresh')).toBeNull();
    expect(studioFixtureInitialFileSelection(route, 'another-project', 'initial-route')).toBeNull();
    expect(isStudioFixtureProjectId(STUDIO_FIXTURE_PROJECT_ID)).toBe(true);
    expect(isStudioFixtureProjectId('another-project')).toBe(false);
    expect(studioFixtureProjectFilePath('orders-dashboard.html')).toContain('/files/orders-dashboard.html');
    expect(studioFixtureProjectFilePath('DESIGN.md')).toContain('/files/DESIGN.md');
    expect(studioFixtureProjectFilePath('data.json')).toContain('/files/data.json');
  });

  it('keeps the fixture network boundary local and API-only', () => {
    expect(studioFixtureNetworkAllows('/api/projects/fixture-studio-project/files', true)).toBe(true);
    expect(studioFixtureNetworkAllows('http://127.0.0.1:4173/api/health', true)).toBe(true);
    expect(studioFixtureNetworkAllows('http://127.0.0.1:4173/assets/app.js', true)).toBe(false);
    expect(studioFixtureNetworkAllows('https://example.invalid/data.json', true)).toBe(false);
    expect(studioFixtureNetworkAllows('/api/projects/fixture-studio-project/files', false)).toBe(false);
  });

  it('uses explicit safe config without local account or customization state', () => {
    expect(studioFixtureSafeConfig.apiKey).toBe('');
    expect(studioFixtureSafeConfig.baseUrl).toBe('');
    expect(studioFixtureSafeConfig.installationId).toBeNull();
    expect(studioFixtureSafeConfig.telemetry).toEqual({ metrics: false, content: false, artifactManifest: false });
    expect(studioFixtureSafeConfig.mediaProviders).toEqual({});
    expect(studioFixtureSafeConfig.composio).toEqual({});
    expect(studioFixtureSafeConfig.projectLocations).toEqual([]);
  });

  it('fails closed for unknown endpoints, wrong methods, and malformed tabs', () => {
    expect(studioFixtureEndpointStatus('/api/not-declared', 'GET')).toBe(404);
    expect(studioFixtureEndpointStatus('/api/projects/fixture-studio-project/tabs', 'POST')).toBe(405);
    expect(studioFixtureEndpointStatus('/api/projects/fixture-studio-project/tabs', 'PUT')).toBe(200);
    expect(studioFixtureEndpointStatus('/api/projects/fixture-studio-project/files/DESIGN.md/versions', 'GET')).toBe(200);
    expect(studioFixtureEndpointStatus('/api/live-artifacts/fixture-studio-artifact/refresh', 'POST')).toBe(200);
    expect(studioFixtureEndpointStatus('/api/live-artifacts/fixture-studio-artifact/preview', 'POST')).toBe(405);
    expect(studioFixtureTabsStateIsValid(studioFixtureTabs)).toBe(true);
    expect(studioFixtureTabsStateIsValid({ ...studioFixtureTabs, tabs: ['unknown.txt'] })).toBe(false);
    expect(studioFixtureTabsStateIsValid({ ...studioFixtureTabs, active: 'unknown.txt' })).toBe(false);
    expect(studioFixtureTabsStateIsValid({ ...studioFixtureTabs, extra: true })).toBe(false);
  });

  it('provides a direct-loadable live-artifact preview transport', () => {
    expect(studioFixtureArtifactPreviewUrl(STUDIO_FIXTURE_PROJECT_ID, studioFixtureArtifact.id)).toMatch(/^data:text\/html/);
    expect(studioFixtureArtifactPreviewUrl('another-project', studioFixtureArtifact.id)).toBeNull();
  });
});

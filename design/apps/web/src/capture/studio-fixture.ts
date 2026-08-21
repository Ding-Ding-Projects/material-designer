import type {
  AgentInfo,
  ChatMessage,
  ChatRunStatusResponse,
  Conversation,
  LiveArtifact,
  LiveArtifactSummary,
  Project,
  ProjectFile,
  ProjectTabsState,
} from '@open-design/contracts';
import type { AppConfig } from '../types';

/**
 * The Studio parity route is a developer-only, public-safe fixture. The
 * desktop foundation owns launch-envelope translation; this renderer accepts
 * only the canonical `od://` handoff. A nearby URL must fall back to normal
 * application behavior rather than quietly rendering a mostly-correct state.
 */
export const STUDIO_FIXTURE_REVISION = 'material-designer-m3-v2';
export const STUDIO_FIXTURE_PROJECT_ID = 'fixture-studio-project';
export const STUDIO_FIXTURE_CONVERSATION_ID = 'fixture-studio-conversation';
export const STUDIO_FIXTURE_RUN_ID = 'fixture-studio-run';
export const STUDIO_FIXTURE_ARTIFACT_ID = 'fixture-studio-artifact';
export const STUDIO_FIXTURE_AGENT_ID = 'fixture-agent';
export const STUDIO_FIXTURE_ACTIVE_FILE = 'orders-dashboard.html';
export const STUDIO_FIXTURE_RENDERER_STATE = 'studio';
export const STUDIO_FIXTURE_SOURCE = 'capture-provider';
export const STUDIO_FIXTURE_FILES = [
  'orders-dashboard.html',
  'DESIGN.md',
  'data.json',
] as const;

export const STUDIO_FIXTURE_TIME = '2026-08-02T21:22:17.000Z';

/**
 * Capture-only configuration. It is intentionally not derived from
 * localStorage, daemon preferences, or an existing account. Keeping every
 * credential-bearing and customizable field at an explicit safe value makes a
 * capture reproducible even when the launcher's profile belongs to a person.
 */
export const studioFixtureSafeConfig: AppConfig = {
  mode: 'daemon',
  apiKey: '',
  baseUrl: '',
  model: 'fixture-model',
  apiProtocol: 'anthropic',
  apiVersion: '',
  apiProtocolConfigs: {},
  apiProviderBaseUrl: null,
  agentId: STUDIO_FIXTURE_AGENT_ID,
  skillId: null,
  designSystemId: null,
  theme: 'light',
  accentColor: '#6750A4',
  onboardingCompleted: true,
  mediaProviders: {},
  composio: {},
  agentModels: {},
  agentCliEnv: {},
  agentCliEnvIntent: {},
  byokProviderConfigDrafts: {},
  byokPendingProviderKey: undefined,
  byokImageModel: '',
  byokVideoModel: '',
  byokSpeechModel: '',
  byokSpeechVoice: '',
  maxTokens: 8192,
  pet: {
    adopted: false,
    enabled: false,
    petId: 'mochi',
    custom: {
      name: 'Buddy',
      glyph: '🦄',
      accent: '#353535',
      greeting: 'Hi! I am here whenever you need me.',
    },
  },
  notifications: {
    soundEnabled: false,
    successSoundId: 'success',
    failureSoundId: 'failure',
    desktopEnabled: false,
  },
  orbit: {
    enabled: false,
    time: '08:00',
    templateSkillId: null,
    workspaceScope: null,
  },
  disabledSkills: [],
  disabledDesignSystems: [],
  installationId: null,
  privacyDecisionAt: Date.parse(STUDIO_FIXTURE_TIME),
  allowSilentUpdates: false,
  telemetry: { metrics: false, content: false, artifactManifest: false },
  customInstructions: '',
  projectLocations: [],
  defaultProjectLocationId: 'default',
};

export function createStudioFixtureSafeConfig(): AppConfig {
  return {
    ...studioFixtureSafeConfig,
    apiProtocolConfigs: {},
    mediaProviders: {},
    composio: {},
    agentModels: {},
    agentCliEnv: {},
    agentCliEnvIntent: {},
    byokProviderConfigDrafts: {},
    disabledSkills: [],
    disabledDesignSystems: [],
    projectLocations: [],
    telemetry: { metrics: false, content: false, artifactManifest: false },
    pet: {
      ...studioFixtureSafeConfig.pet!,
      custom: { ...studioFixtureSafeConfig.pet!.custom },
    },
    notifications: { ...studioFixtureSafeConfig.notifications! },
    orbit: { ...studioFixtureSafeConfig.orbit!, workspaceScope: null },
  };
}

let activeStudioFixtureProjectId: string | null = null;
let activeStudioFixtureConversationId: string | null = null;

const STUDIO_ROUTE_QUERY_KEYS = [
  'state',
  'theme',
  'width',
  'height',
  'scale',
  'locale',
  'fixture',
  'time',
  'motion',
  'random',
  'fonts',
  'network',
] as const;

/**
 * The desktop shell validates the developer launch address and then loads the
 * renderer through this canonical `od://` project URL. Keep the path literal
 * beside the tuple parser so the renderer has one route witness for both the
 * launch handoff and the final location.
 */
const STUDIO_RENDERER_PROTOCOL = 'od:';
const STUDIO_RENDERER_HOST = 'app';
function buildStudioFixtureProjectPath(
  projectId: string,
  conversationId: string,
  fileName: string,
): string {
  return `/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(conversationId)}/files/${encodeURIComponent(fileName)}`;
}

const STUDIO_RENDERER_PATH = buildStudioFixtureProjectPath(
  STUDIO_FIXTURE_PROJECT_ID,
  STUDIO_FIXTURE_CONVERSATION_ID,
  STUDIO_FIXTURE_ACTIVE_FILE,
);
export const STUDIO_FIXTURE_RENDERER_PATH = STUDIO_RENDERER_PATH;

export interface StudioFixtureRoute {
  screen: 'studio';
  state: 'default';
  theme: 'light';
  viewport: { width: 1440; height: 900 };
  scale: 1;
  locale: 'en-US';
  fixtureRevision: typeof STUDIO_FIXTURE_REVISION;
  time: typeof STUDIO_FIXTURE_TIME;
  motion: 'frozen';
  randomSeed: 3003;
  fonts: 'bundled-roboto-v1';
  network: 'disabled';
  projectId: typeof STUDIO_FIXTURE_PROJECT_ID;
  conversationId: typeof STUDIO_FIXTURE_CONVERSATION_ID;
  fileName: typeof STUDIO_FIXTURE_ACTIVE_FILE;
  cacheKey: string;
}

/** The typed tuple witness installed by the desktop capture prelude. */
export interface StudioFixtureCaptureWitness {
  screen: unknown;
  state: unknown;
  theme: unknown;
  viewport: unknown;
  scale: unknown;
  locale: unknown;
  fixtureRevision: unknown;
  time: unknown;
  motion: unknown;
  randomSeed: unknown;
  fonts: unknown;
  network: unknown;
}

function exactQueryKeys(url: URL): boolean {
  return JSON.stringify([...url.searchParams.keys()]) === JSON.stringify(STUDIO_ROUTE_QUERY_KEYS);
}

function isStudioFixtureRendererEnvelope(
  url: Pick<URL, 'protocol' | 'hostname' | 'pathname'>,
): boolean {
  return (
    url.protocol === STUDIO_RENDERER_PROTOCOL
    && url.hostname === STUDIO_RENDERER_HOST
    && url.pathname === STUDIO_RENDERER_PATH
  );
}

function isStudioFixtureEnvelope(url: URL): boolean {
  return isStudioFixtureRendererEnvelope(url);
}

/**
 * Parse the exact canonical renderer handoff. The desktop foundation owns the
 * raw developer launch envelope and must translate it before this code runs;
 * ordinary `od://` pages and near-match fixture URLs remain inactive.
 */
export function parseStudioFixtureRoute(input: string | URL | Location): StudioFixtureRoute | null {
  let url: URL;
  try {
    url = input instanceof URL
      ? input
      : new URL(typeof input === 'string' ? input : input.href);
  } catch {
    return null;
  }
  if (!isStudioFixtureEnvelope(url)) return null;
  if (
    url.username.length > 0
    || url.password.length > 0
    || url.port.length > 0
    || url.hash.length > 0
  ) return null;
  if (!exactQueryKeys(url)) return null;
  const expected: Record<string, string> = {
    state: 'default',
    theme: 'light',
    width: '1440',
    height: '900',
    scale: '1',
    locale: 'en-US',
    fixture: STUDIO_FIXTURE_REVISION,
    time: STUDIO_FIXTURE_TIME,
    motion: 'frozen',
    random: '3003',
    fonts: 'bundled-roboto-v1',
    network: 'disabled',
  };
  for (const key of STUDIO_ROUTE_QUERY_KEYS) {
    if (url.searchParams.get(key) !== expected[key]) return null;
  }
  return {
    screen: 'studio',
    state: 'default',
    theme: 'light',
    viewport: { width: 1440, height: 900 },
    scale: 1,
    locale: 'en-US',
    fixtureRevision: STUDIO_FIXTURE_REVISION,
    time: STUDIO_FIXTURE_TIME,
    motion: 'frozen',
    randomSeed: 3003,
    fonts: 'bundled-roboto-v1',
    network: 'disabled',
    projectId: STUDIO_FIXTURE_PROJECT_ID,
    conversationId: STUDIO_FIXTURE_CONVERSATION_ID,
    fileName: STUDIO_FIXTURE_ACTIVE_FILE,
    cacheKey: url.href,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validate the renderer-owned capture tuple without trusting a marker alone.
 * The packaged desktop prelude owns the tuple; this exact comparison keeps an
 * ordinary `od://` page from activating the fixture through a copied witness.
 */
export function studioFixtureCaptureWitnessMatches(
  route: StudioFixtureRoute,
  witness: unknown,
): boolean {
  if (!isRecord(witness) || !isRecord(witness.viewport)) return false;
  const viewport = witness.viewport;
  return witness.screen === route.screen
    && witness.state === route.state
    && witness.theme === route.theme
    && viewport.width === route.viewport.width
    && viewport.height === route.viewport.height
    && witness.scale === route.scale
    && witness.locale === route.locale
    && witness.fixtureRevision === route.fixtureRevision
    && witness.time === route.time
    && witness.motion === route.motion
    && witness.randomSeed === route.randomSeed
    && witness.fonts === route.fonts
    && witness.network === route.network;
}

function currentStudioFixtureCaptureWitness(): unknown {
  if (typeof globalThis === 'undefined') return null;
  return (globalThis as typeof globalThis & {
    __MATERIAL_DESIGNER_CAPTURE_TUPLE__?: StudioFixtureCaptureWitness;
  }).__MATERIAL_DESIGNER_CAPTURE_TUPLE__ ?? null;
}

export function studioFixtureRouteFromCurrentLocation(): StudioFixtureRoute | null {
  if (typeof window === 'undefined') return null;
  const route = parseStudioFixtureRoute(window.location);
  if (!route) return null;
  if (
    isStudioFixtureRendererEnvelope(window.location)
    && !studioFixtureCaptureWitnessMatches(route, currentStudioFixtureCaptureWitness())
  ) return null;
  return route;
}

export function isStudioFixtureProjectId(projectId: string): boolean {
  return projectId === STUDIO_FIXTURE_PROJECT_ID;
}

export function isStudioFixtureCaptureActiveForProjectConversation(
  projectId: string,
  conversationId: string,
): boolean {
  return activeStudioFixtureProjectId === projectId
    && activeStudioFixtureConversationId === conversationId;
}

export function isStudioFixtureCaptureActiveForCurrentLocation(): boolean {
  if (typeof window === 'undefined') return false;
  if (studioFixtureRouteFromCurrentLocation()) return true;
  return activeStudioFixtureProjectId === STUDIO_FIXTURE_PROJECT_ID
    && activeStudioFixtureConversationId === STUDIO_FIXTURE_CONVERSATION_ID
    && isFixtureCaptureLocation(window.location);
}

/** The real project route reached after the canonical capture address is accepted. */
export function studioFixtureProjectPath(route: StudioFixtureRoute): string {
  return buildStudioFixtureProjectPath(route.projectId, route.conversationId, route.fileName);
}

export function studioFixtureProjectFilePath(fileName: string): string {
  return buildStudioFixtureProjectPath(
    STUDIO_FIXTURE_PROJECT_ID,
    STUDIO_FIXTURE_CONVERSATION_ID,
    fileName,
  );
}

export const studioFixtureProject: Project = {
  id: STUDIO_FIXTURE_PROJECT_ID,
  name: 'Signal Garden Studio',
  skillId: null,
  designSystemId: null,
  createdAt: Date.parse(STUDIO_FIXTURE_TIME) - 86_400_000,
  updatedAt: Date.parse(STUDIO_FIXTURE_TIME),
  workspaceId: null,
  metadata: {
    kind: 'prototype',
    entryFile: STUDIO_FIXTURE_ACTIVE_FILE,
  },
};

export const studioFixtureConversation: Conversation = {
  id: STUDIO_FIXTURE_CONVERSATION_ID,
  projectId: STUDIO_FIXTURE_PROJECT_ID,
  title: 'Orders dashboard review',
  sessionMode: 'design',
  messageCount: 2,
  createdAt: Date.parse(STUDIO_FIXTURE_TIME) - 60_000,
  updatedAt: Date.parse(STUDIO_FIXTURE_TIME),
  totalDurationMs: 4_800,
  latestRun: {
    status: 'succeeded',
    startedAt: Date.parse(STUDIO_FIXTURE_TIME) - 4_800,
    endedAt: Date.parse(STUDIO_FIXTURE_TIME),
    durationMs: 4_800,
  },
};

export const studioFixtureFiles: readonly ProjectFile[] = [
  {
    name: 'orders-dashboard.html',
    path: 'orders-dashboard.html',
    type: 'file',
    size: 2_184,
    mtime: Date.parse(STUDIO_FIXTURE_TIME),
    kind: 'html',
    mime: 'text/html',
  },
  {
    name: 'DESIGN.md',
    path: 'DESIGN.md',
    type: 'file',
    size: 1_056,
    mtime: Date.parse(STUDIO_FIXTURE_TIME),
    kind: 'text',
    mime: 'text/markdown',
  },
  {
    name: 'data.json',
    path: 'data.json',
    type: 'file',
    size: 612,
    mtime: Date.parse(STUDIO_FIXTURE_TIME),
    kind: 'code',
    mime: 'application/json',
  },
];

export const studioFixtureMessages: readonly ChatMessage[] = [
  {
    id: 'fixture-studio-user-message',
    role: 'user',
    content: 'Create an orders dashboard with a calm review state and a compact progress summary.',
    createdAt: Date.parse(STUDIO_FIXTURE_TIME) - 4_800,
    sessionMode: 'design',
  },
  {
    id: 'fixture-studio-assistant-message',
    role: 'assistant',
    content: 'The orders dashboard is ready for review. The project stays selected while files remain explicit workspace choices.',
    agentId: 'fixture-agent',
    agentName: 'Fixture Builder',
    runId: STUDIO_FIXTURE_RUN_ID,
    runStatus: 'succeeded',
    resultDeliveryState: 'delivered',
    startedAt: Date.parse(STUDIO_FIXTURE_TIME) - 4_800,
    endedAt: Date.parse(STUDIO_FIXTURE_TIME),
    createdAt: Date.parse(STUDIO_FIXTURE_TIME),
    sessionMode: 'design',
    producedFiles: [studioFixtureFiles[0]!],
    events: [
      { kind: 'status', label: 'Planning', detail: 'Reading the project brief' },
      {
        kind: 'tool_use',
        id: 'fixture-tool-write-dashboard',
        name: 'write_project_file',
        input: { path: STUDIO_FIXTURE_ACTIVE_FILE },
        startedAt: Date.parse(STUDIO_FIXTURE_TIME) - 3_900,
      },
      {
        kind: 'tool_result',
        toolUseId: 'fixture-tool-write-dashboard',
        content: 'Wrote the reviewable dashboard file.',
        isError: false,
      },
      {
        kind: 'live_artifact',
        action: 'created',
        projectId: STUDIO_FIXTURE_PROJECT_ID,
        artifactId: STUDIO_FIXTURE_ARTIFACT_ID,
        title: 'Orders dashboard preview',
        refreshStatus: 'idle',
      },
      { kind: 'status', label: 'Complete', detail: 'Ready for review' },
    ],
  },
];

export const studioFixtureRun: ChatRunStatusResponse = {
  id: STUDIO_FIXTURE_RUN_ID,
  projectId: STUDIO_FIXTURE_PROJECT_ID,
  conversationId: STUDIO_FIXTURE_CONVERSATION_ID,
  assistantMessageId: 'fixture-studio-assistant-message',
  agentId: 'fixture-agent',
  status: 'succeeded',
  createdAt: Date.parse(STUDIO_FIXTURE_TIME) - 4_800,
  updatedAt: Date.parse(STUDIO_FIXTURE_TIME),
  childExited: true,
  exitCode: 0,
  artifactCount: 1,
  artifactPaths: [STUDIO_FIXTURE_ACTIVE_FILE],
  deliverableValid: true,
  deliverableValidation: 'valid',
  deliverableEntryFile: STUDIO_FIXTURE_ACTIVE_FILE,
  deliverableArtifactKind: 'html',
};

export const studioFixtureArtifact: LiveArtifact = {
  schemaVersion: 1,
  id: STUDIO_FIXTURE_ARTIFACT_ID,
  projectId: STUDIO_FIXTURE_PROJECT_ID,
  sessionId: STUDIO_FIXTURE_CONVERSATION_ID,
  createdByRunId: STUDIO_FIXTURE_RUN_ID,
  title: 'Orders dashboard preview',
  slug: 'orders-dashboard-preview',
  status: 'active',
  pinned: true,
  preview: { type: 'html', entry: 'index.html' },
  refreshStatus: 'idle',
  createdAt: STUDIO_FIXTURE_TIME,
  updatedAt: STUDIO_FIXTURE_TIME,
  lastRefreshedAt: STUDIO_FIXTURE_TIME,
  document: {
    format: 'html_template_v1',
    templatePath: 'template.html',
    generatedPreviewPath: 'index.html',
    dataPath: 'data.json',
    dataJson: {
      title: 'Orders dashboard',
      period: 'This week',
      openOrders: 18,
      shippedOrders: 42,
      reviewState: 'Ready for review',
    },
    sourceJson: {
      type: 'local_file',
      input: { path: STUDIO_FIXTURE_ACTIVE_FILE },
      refreshPermission: 'manual_refresh_granted_for_read_only',
    },
  },
};

export const studioFixtureLiveArtifacts: readonly LiveArtifactSummary[] = [
  { ...studioFixtureArtifact, hasDocument: true },
];

export const studioFixtureTabs: ProjectTabsState = {
  tabs: [...STUDIO_FIXTURE_FILES, `live:${STUDIO_FIXTURE_ARTIFACT_ID}`],
  active: STUDIO_FIXTURE_ACTIVE_FILE,
  hasSavedState: true,
  updatedAt: Date.parse(STUDIO_FIXTURE_TIME),
};

export const studioFixtureAgent: AgentInfo = {
  id: 'fixture-agent',
  name: 'Fixture Builder',
  bin: 'fixture-builder',
  available: true,
  authStatus: 'ok',
  version: 'fixture-1.0',
  models: [],
  modelsSource: 'fallback',
};

export const studioFixtureFileText: Readonly<Record<string, string>> = {
  'orders-dashboard.html': `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>Orders dashboard</title></head>
  <body>
    <main>
      <p>Signal Garden Studio</p>
      <h1>Orders dashboard</h1>
      <p>Ready for review · This week</p>
      <section aria-label="Order summary">
        <article><strong>18</strong><span>Open orders</span></article>
        <article><strong>42</strong><span>Shipped orders</span></article>
      </section>
      <p>Last updated 2026-08-02 21:22 UTC</p>
    </main>
  </body>
</html>`,
  'DESIGN.md': `# Orders dashboard

## Review state

- Layout: compact summary with a calm review banner
- Source: fictional fixture data only
- Preview: local and network-disabled

The dashboard is a deterministic capture fixture for the Studio workspace.
`,
  'data.json': JSON.stringify({
    period: 'This week',
    openOrders: 18,
    shippedOrders: 42,
    reviewState: 'Ready for review',
  }, null, 2),
};

/** Direct-loadable transport for the live-artifact iframe in capture mode. */
export function studioFixtureArtifactPreviewUrl(
  projectId: string,
  artifactId: string,
): string | null {
  if (
    projectId !== STUDIO_FIXTURE_PROJECT_ID
    || artifactId !== STUDIO_FIXTURE_ARTIFACT_ID
  ) return null;
  return `data:text/html;charset=utf-8,${encodeURIComponent(studioFixtureFileText[STUDIO_FIXTURE_ACTIVE_FILE])}`;
}

export function studioFixtureProjectRoute(route: StudioFixtureRoute) {
  return {
    kind: 'project' as const,
    projectId: route.projectId,
    conversationId: route.conversationId,
    fileName: route.fileName,
  };
}

/**
 * The fixture's initial file is explicit and one-shot. File refreshes,
 * project switches, and chat context changes must not select a file. Normal
 * routes are intentionally outside this helper and keep their existing rules.
 */
export function studioFixtureInitialFileSelection(
  route: StudioFixtureRoute | null,
  projectId: string,
  phase: 'initial-route' | 'project-switch' | 'file-refresh' | 'user-action',
): string | null {
  if (!route || phase !== 'initial-route' || projectId !== route.projectId) return null;
  return route.fileName;
}

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

function textResponse(body: string, contentType: string, status = 200): Response {
  return new Response(body, { status, headers: { 'Content-Type': contentType } });
}

function sseResponse(agent: AgentInfo): Response {
  const body = [
    `event: agent\ndata: ${JSON.stringify(agent)}\n`,
    'event: done\ndata: {}\n',
  ].join('\n');
  return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });
}

function decodePathSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

type FixtureEndpoint = {
  id: string;
  methods: readonly string[];
  matches: (pathname: string) => boolean;
};

const fixtureProjectPrefix = `/api/projects/${STUDIO_FIXTURE_PROJECT_ID}`;
const fixtureConversationPrefix =
  `${fixtureProjectPrefix}/conversations/${STUDIO_FIXTURE_CONVERSATION_ID}`;
const fixtureArtifactPrefix = `/api/live-artifacts/${STUDIO_FIXTURE_ARTIFACT_ID}`;

function knownFixtureFileName(value: string): boolean {
  return (STUDIO_FIXTURE_FILES as readonly string[]).includes(value);
}

function knownFixtureFilePath(pathname: string, marker: string): string | null {
  if (!pathname.startsWith(marker)) return null;
  const file = decodePathSegment(pathname.slice(marker.length));
  return knownFixtureFileName(file) ? file : null;
}

function knownFixtureFileWithSuffix(
  pathname: string,
  marker: string,
  suffix: string,
): string | null {
  if (!pathname.startsWith(marker) || !pathname.endsWith(suffix)) return null;
  const file = decodePathSegment(pathname.slice(marker.length, -suffix.length));
  return knownFixtureFileName(file) ? file : null;
}

const fixtureEndpointManifest: readonly FixtureEndpoint[] = [
  { id: 'health', methods: ['GET'], matches: (path) => path === '/api/health' },
  { id: 'agents', methods: ['GET'], matches: (path) => path === '/api/agents' },
  { id: 'app-config', methods: ['GET', 'PUT'], matches: (path) => path === '/api/app-config' },
  { id: 'analytics-config', methods: ['GET'], matches: (path) => path === '/api/analytics/config' },
  { id: 'version', methods: ['GET'], matches: (path) => path === '/api/version' },
  { id: 'active', methods: ['GET'], matches: (path) => path === '/api/active' },
  { id: 'media-config', methods: ['GET', 'PUT'], matches: (path) => path === '/api/media/config' },
  { id: 'composio-config', methods: ['GET', 'PUT'], matches: (path) => path === '/api/connectors/composio/config' },
  { id: 'workspace-directory', methods: ['GET'], matches: (path) => path === '/api/workspace/directory' },
  { id: 'workspace-context', methods: ['GET'], matches: (path) => path === '/api/workspace/context' },
  { id: 'skills', methods: ['GET'], matches: (path) => path === '/api/skills' },
  { id: 'design-templates', methods: ['GET'], matches: (path) => path === '/api/design-templates' },
  { id: 'design-systems', methods: ['GET'], matches: (path) => path === '/api/design-systems' },
  { id: 'prompt-templates', methods: ['GET'], matches: (path) => path === '/api/prompt-templates' },
  { id: 'templates', methods: ['GET'], matches: (path) => path === '/api/templates' },
  { id: 'projects', methods: ['GET'], matches: (path) => path === '/api/projects' },
  { id: 'project-scope', methods: ['GET'], matches: (path) => path === `${fixtureProjectPrefix}/workspace-scope` },
  { id: 'project', methods: ['GET'], matches: (path) => path === fixtureProjectPrefix },
  { id: 'conversations', methods: ['GET', 'POST'], matches: (path) => path === `${fixtureProjectPrefix}/conversations` },
  { id: 'conversation', methods: ['GET'], matches: (path) => path === fixtureConversationPrefix },
  { id: 'messages', methods: ['GET'], matches: (path) => path === `${fixtureConversationPrefix}/messages` },
  {
    id: 'message',
    methods: ['GET', 'PUT'],
    matches: (path) => path.startsWith(`${fixtureConversationPrefix}/messages/`)
      && path.slice(`${fixtureConversationPrefix}/messages/`.length).length > 0,
  },
  { id: 'tabs', methods: ['GET', 'PUT'], matches: (path) => path === `${fixtureProjectPrefix}/tabs` },
  { id: 'files', methods: ['GET'], matches: (path) => path === `${fixtureProjectPrefix}/files` },
  { id: 'folders', methods: ['GET'], matches: (path) => path === `${fixtureProjectPrefix}/folders` },
  { id: 'preview-url', methods: ['GET'], matches: (path) => path === `${fixtureProjectPrefix}/preview-url` },
  {
    id: 'file-preview',
    methods: ['GET'],
    matches: (path) => knownFixtureFileWithSuffix(
      path,
      `${fixtureProjectPrefix}/files/`,
      '/preview',
    ) !== null,
  },
  {
    id: 'file-raw',
    methods: ['GET'],
    matches: (path) => knownFixtureFilePath(path, `${fixtureProjectPrefix}/raw/`) !== null,
  },
  {
    id: 'file-preview-transport',
    methods: ['GET'],
    matches: (path) => knownFixtureFileWithSuffix(
      path,
      `${fixtureProjectPrefix}/preview/`,
      '/',
    ) !== null,
  },
  { id: 'live-artifacts', methods: ['GET'], matches: (path) => path === '/api/live-artifacts' },
  { id: 'live-artifact', methods: ['GET'], matches: (path) => path === fixtureArtifactPrefix },
  { id: 'live-artifact-preview', methods: ['GET'], matches: (path) => path === `${fixtureArtifactPrefix}/preview` },
  { id: 'live-artifact-refreshes', methods: ['GET'], matches: (path) => path === `${fixtureArtifactPrefix}/refreshes` },
  { id: 'live-artifact-refresh', methods: ['POST'], matches: (path) => path === `${fixtureArtifactPrefix}/refresh` },
  { id: 'runs', methods: ['GET'], matches: (path) => path === '/api/runs' },
  { id: 'run', methods: ['GET'], matches: (path) => path === `/api/runs/${STUDIO_FIXTURE_RUN_ID}` },
  { id: 'preview-comments', methods: ['GET'], matches: (path) => path === `${fixtureConversationPrefix}/comments` },
  {
    id: 'file-versions',
    methods: ['GET'],
    matches: (path) => knownFixtureFileWithSuffix(
      path,
      `${fixtureProjectPrefix}/files/`,
      '/versions',
    ) !== null,
  },
  {
    id: 'file-version',
    methods: ['GET'],
    matches: (path) => /\/files\/[^/]+\/versions\/[^/]+$/.test(path)
      && knownFixtureFileName(decodePathSegment(path.split('/files/')[1]?.split('/')[0] ?? '')),
  },
];

function fixtureEndpointFor(pathname: string): FixtureEndpoint | null {
  return fixtureEndpointManifest.find((endpoint) => endpoint.matches(pathname)) ?? null;
}

export function studioFixtureEndpointStatus(pathname: string, method: string): number {
  const endpoint = fixtureEndpointFor(pathname);
  if (!endpoint) return 404;
  return endpoint.methods.includes(method.toUpperCase()) ? 200 : 405;
}

function fixtureMethodNotAllowed(endpoint: FixtureEndpoint): Response {
  return jsonResponse(
    { error: { code: 'METHOD_NOT_ALLOWED', message: 'Fixture method is not declared.' } },
    405,
    { Allow: endpoint.methods.join(', ') },
  );
}

function hasExactSearchParams(url: URL, expected: Readonly<Record<string, string>>): boolean {
  const keys = [...url.searchParams.keys()];
  const expectedKeys = Object.keys(expected);
  if (keys.length !== expectedKeys.length || keys.some((key) => !expectedKeys.includes(key))) return false;
  return expectedKeys.every((key) => url.searchParams.get(key) === expected[key]);
}

function validateFixtureTabsState(value: unknown): ProjectTabsState | null {
  if (!isRecord(value)) return null;
  const keys = Object.keys(value).sort();
  if (keys.join('|') !== 'active|hasSavedState|tabs|updatedAt') return null;
  const tabs = value.tabs;
  const active = value.active;
  const hasSavedState = value.hasSavedState;
  const updatedAt = value.updatedAt;
  if (
    !Array.isArray(tabs)
    || tabs.length > STUDIO_FIXTURE_FILES.length + 1
    || tabs.some((tab) => typeof tab !== 'string')
    || new Set(tabs).size !== tabs.length
    || tabs.some((tab) => !knownFixtureFileName(tab) && tab !== `live:${STUDIO_FIXTURE_ARTIFACT_ID}`)
    || (active !== null && typeof active !== 'string')
    || (typeof active === 'string' && !tabs.includes(active))
    || typeof hasSavedState !== 'boolean'
    || typeof updatedAt !== 'number'
    || !Number.isFinite(updatedAt)
    || updatedAt < 0
  ) return null;
  return {
    tabs: [...tabs] as string[],
    active: active as string | null,
    hasSavedState,
    updatedAt,
  };
}

export function studioFixtureTabsStateIsValid(value: unknown): boolean {
  return validateFixtureTabsState(value) !== null;
}

function fixtureResponse(url: URL, method: string, tabsState: { current: ProjectTabsState }): Response {
  const path = url.pathname;
  const endpoint = fixtureEndpointFor(path);
  if (!endpoint) return jsonResponse({ error: { code: 'NOT_FOUND', message: 'Fixture endpoint is not declared.' } }, 404);
  if (!endpoint.methods.includes(method)) return fixtureMethodNotAllowed(endpoint);
  const noQueryEndpointIds = new Set([
    'health', 'app-config', 'analytics-config', 'version', 'active',
    'media-config', 'composio-config', 'workspace-directory', 'workspace-context',
    'skills', 'design-templates', 'design-systems', 'prompt-templates', 'templates',
    'projects', 'project-scope', 'project', 'conversations', 'conversation',
    'messages', 'message', 'tabs', 'files', 'folders', 'file-preview',
    'file-preview-transport', 'live-artifact', 'preview-comments',
    'file-versions', 'file-version',
  ]);
  if (noQueryEndpointIds.has(endpoint.id) && !hasExactSearchParams(url, {})) {
    return jsonResponse({ error: { code: 'BAD_QUERY', message: 'Fixture query is not declared.' } }, 404);
  }
  const projectPrefix = fixtureProjectPrefix;
  const fileNames = [...STUDIO_FIXTURE_FILES];

  if (path === '/api/health' && hasExactSearchParams(url, {})) {
    return jsonResponse({ ok: true, fixture: STUDIO_FIXTURE_REVISION });
  }
  if (path === '/api/agents') {
    if (hasExactSearchParams(url, { stream: '1' })) return sseResponse(studioFixtureAgent);
    if (hasExactSearchParams(url, {})) return jsonResponse({ agents: [studioFixtureAgent] });
    return jsonResponse({ error: { code: 'BAD_QUERY', message: 'Fixture agent query is not declared.' } }, 404);
  }
  if (path === '/api/app-config') {
    if (method === 'PUT') return jsonResponse({ ok: true });
    return jsonResponse({
      config: {
        onboardingCompleted: true,
        agentId: STUDIO_FIXTURE_AGENT_ID,
        agentModels: {},
        agentCliEnv: {},
        agentCliEnvIntent: {},
        skillId: null,
        designSystemId: null,
        disabledSkills: [],
        disabledDesignSystems: [],
        orbit: { enabled: false, time: '08:00', templateSkillId: null, workspaceScope: null },
        installationId: null,
        telemetry: { metrics: false, content: false, artifactManifest: false },
        privacyDecisionAt: Date.parse(STUDIO_FIXTURE_TIME),
        allowSilentUpdates: false,
        customInstructions: null,
        projectLocations: [],
        defaultProjectLocationId: 'default',
      },
    });
  }
  if (path === '/api/analytics/config') {
    return jsonResponse({ enabled: false, key: null, host: null, env: 'fixture', installationId: null });
  }
  if (path === '/api/version') return jsonResponse({ version: { version: 'fixture-1.0' } });
  if (path === '/api/active') return jsonResponse({ active: false });
  if (path === '/api/media/config') return jsonResponse({ providers: [] });
  if (path === '/api/connectors/composio/config') return jsonResponse({});
  if (path === '/api/workspace/directory') return jsonResponse({ items: [], activeWorkspaceId: null });
  if (path === '/api/workspace/context') return jsonResponse({ context: null });
  if (path === '/api/skills') return jsonResponse({ skills: [] });
  if (path === '/api/design-templates') return jsonResponse({ designTemplates: [] });
  if (path === '/api/design-systems') return jsonResponse({ designSystems: [] });
  if (path === '/api/prompt-templates') return jsonResponse({ templates: [] });
  if (path === '/api/templates') return jsonResponse({ templates: [] });
  if (path === '/api/projects') return jsonResponse({ projects: [studioFixtureProject] });
  if (path === `${projectPrefix}/workspace-scope` && hasExactSearchParams(url, {})) {
    return jsonResponse({
      scope: {
        projectId: STUDIO_FIXTURE_PROJECT_ID,
        kind: 'unbound',
        workspaceId: null,
        context: null,
      },
    });
  }
  if (path === projectPrefix && method === 'GET' && hasExactSearchParams(url, {})) {
    return jsonResponse({ project: studioFixtureProject, resolvedDir: null });
  }
  if (path === `${projectPrefix}/conversations` && method === 'GET' && hasExactSearchParams(url, {})) {
    return jsonResponse({ conversations: [studioFixtureConversation] });
  }
  if (path === `${projectPrefix}/conversations` && method === 'POST' && hasExactSearchParams(url, {})) {
    return jsonResponse({ conversation: studioFixtureConversation });
  }
  if (path === `${projectPrefix}/conversations/${STUDIO_FIXTURE_CONVERSATION_ID}` && method === 'GET' && hasExactSearchParams(url, {})) {
    return jsonResponse({ conversation: studioFixtureConversation });
  }
  if (path === `${projectPrefix}/conversations/${STUDIO_FIXTURE_CONVERSATION_ID}/messages` && method === 'GET' && hasExactSearchParams(url, {})) {
    return jsonResponse({ messages: studioFixtureMessages });
  }
  if (path.startsWith(`${projectPrefix}/conversations/${STUDIO_FIXTURE_CONVERSATION_ID}/messages/`) && hasExactSearchParams(url, {})) {
    return method === 'GET'
      ? jsonResponse({ message: studioFixtureMessages[1] })
      : jsonResponse({ ok: true });
  }
  if (path === `${projectPrefix}/tabs` && hasExactSearchParams(url, {})) {
    if (method === 'PUT') {
      return jsonResponse(tabsState.current);
    }
    return jsonResponse(tabsState.current);
  }
  if (path === `${projectPrefix}/files` && hasExactSearchParams(url, {})) return jsonResponse({ files: studioFixtureFiles });
  if (path === `${projectPrefix}/folders` && hasExactSearchParams(url, {})) return jsonResponse({ folders: [] });
  if (path === `${projectPrefix}/preview-url`) {
    const file = url.searchParams.get('file');
    if (!hasExactSearchParams(url, { file: file ?? '' }) || !fileNames.includes(file ?? '')) {
      return jsonResponse({ error: 'fixture file not found' }, 404);
    }
    return jsonResponse({ url: `${projectPrefix}/preview/${encodeURIComponent(file ?? '')}/` });
  }
  if (path.startsWith(`${projectPrefix}/files/`) && path.endsWith('/preview')) {
    const file = knownFixtureFileWithSuffix(path, `${projectPrefix}/files/`, '/preview');
    if (!file) return jsonResponse({ error: 'fixture file not found' }, 404);
    return jsonResponse({ kind: 'document', title: file, sections: [] });
  }
  if (path.startsWith(`${projectPrefix}/raw/`)) {
    const cacheBust = url.searchParams.get('cacheBust');
    if (
      (cacheBust === null && !hasExactSearchParams(url, {}))
      || (cacheBust !== null
        && (!hasExactSearchParams(url, { cacheBust }) || !Number.isFinite(Number(cacheBust))))
    ) return textResponse('fixture raw query is not declared', 'text/plain', 404);
    const file = knownFixtureFilePath(path, `${projectPrefix}/raw/`);
    if (!file) return textResponse('fixture file not found', 'text/plain', 404);
    const text = studioFixtureFileText[file];
    const mime = file.endsWith('.html') ? 'text/html' : file.endsWith('.md') ? 'text/markdown' : 'application/json';
    return textResponse(text, mime);
  }
  if (path.startsWith(`${projectPrefix}/preview/`)) {
    const file = knownFixtureFileWithSuffix(path, `${projectPrefix}/preview/`, '/');
    if (!file) return textResponse('fixture file not found', 'text/plain', 404);
    return textResponse(studioFixtureFileText[file], file.endsWith('.html') ? 'text/html' : 'text/plain');
  }
  if (path === '/api/live-artifacts' && hasExactSearchParams(url, { projectId: STUDIO_FIXTURE_PROJECT_ID })) {
    return jsonResponse({ artifacts: studioFixtureLiveArtifacts });
  }
  if (path === `/api/live-artifacts/${STUDIO_FIXTURE_ARTIFACT_ID}` && hasExactSearchParams(url, { projectId: STUDIO_FIXTURE_PROJECT_ID })) {
    return jsonResponse({ artifact: studioFixtureArtifact });
  }
  if (path === `/api/live-artifacts/${STUDIO_FIXTURE_ARTIFACT_ID}/preview`) {
    const projectId = url.searchParams.get('projectId');
    const variant = url.searchParams.get('variant');
    const version = url.searchParams.get('v');
    const expected: Record<string, string> = { projectId: STUDIO_FIXTURE_PROJECT_ID };
    if (variant !== null) expected.variant = variant;
    if (version !== null) expected.v = version;
    if (
      !hasExactSearchParams(url, expected)
      || (variant !== null && variant !== 'rendered' && variant !== 'template' && variant !== 'rendered-source')
    ) return textResponse('fixture preview scope not found', 'text/plain', 404);
    return textResponse(studioFixtureFileText[STUDIO_FIXTURE_ACTIVE_FILE], 'text/html');
  }
  if (path === `/api/live-artifacts/${STUDIO_FIXTURE_ARTIFACT_ID}/refreshes` && hasExactSearchParams(url, { projectId: STUDIO_FIXTURE_PROJECT_ID })) {
    return jsonResponse({ refreshes: [] });
  }
  if (path === `/api/live-artifacts/${STUDIO_FIXTURE_ARTIFACT_ID}/refresh` && hasExactSearchParams(url, { projectId: STUDIO_FIXTURE_PROJECT_ID })) {
    return jsonResponse({
      artifact: studioFixtureArtifact,
      refresh: {
        id: 'fixture-refresh-1',
        status: 'succeeded',
        refreshedSourceCount: 1,
      },
    });
  }
  if (path === '/api/runs') {
    if (hasExactSearchParams(url, {})) return jsonResponse({ runs: [studioFixtureRun] });
    if (hasExactSearchParams(url, {
      projectId: STUDIO_FIXTURE_PROJECT_ID,
      conversationId: STUDIO_FIXTURE_CONVERSATION_ID,
      status: 'active',
    })) return jsonResponse({ runs: [] });
    return jsonResponse({ error: { code: 'RUN_SCOPE_REQUIRED', message: 'Fixture run scope is not declared.' } }, 404);
  }
  if (path === `/api/runs/${STUDIO_FIXTURE_RUN_ID}` && hasExactSearchParams(url, {})) {
    return jsonResponse(studioFixtureRun);
  }
  if (path === `${fixtureConversationPrefix}/comments` && hasExactSearchParams(url, {})) {
    return jsonResponse({ comments: [] });
  }
  if (path.endsWith('/versions') && path.startsWith(`${projectPrefix}/files/`)) {
    const file = knownFixtureFileWithSuffix(path, `${projectPrefix}/files/`, '/versions');
    if (!file || !hasExactSearchParams(url, {})) return jsonResponse({ error: 'fixture version scope not found' }, 404);
    return jsonResponse({ file: studioFixtureFiles.find((candidate) => candidate.name === file), versions: [] });
  }
  if (path.includes('/versions/') && path.startsWith(`${projectPrefix}/files/`) && hasExactSearchParams(url, {})) {
    return jsonResponse({ file: studioFixtureFiles.find((candidate) => candidate.name === decodePathSegment(path.split('/files/')[1]?.split('/')[0] ?? '')), version: null });
  }
  return jsonResponse({ error: { code: 'FIXTURE_HANDLER_MISSING', message: 'Declared fixture handler is missing.' } }, 500);
}

function isFixtureProjectPath(pathname: string): boolean {
  const projectConversationPath =
    `/projects/${STUDIO_FIXTURE_PROJECT_ID}/conversations/${STUDIO_FIXTURE_CONVERSATION_ID}`;
  if (pathname === projectConversationPath) return true;
  const marker = `${projectConversationPath}/files/`;
  const fileName = pathname.startsWith(marker)
    ? decodePathSegment(pathname.slice(marker.length))
    : null;
  return fileName !== null && knownFixtureFileName(fileName);
}

function isLoopbackHttpUrl(url: URL): boolean {
  const port = url.port.length === 0 ? null : Number(url.port);
  return (url.protocol === 'http:' || url.protocol === 'https:')
    && (url.hostname === '127.0.0.1'
      || url.hostname === 'localhost'
      || url.hostname === '[::1]'
      || url.hostname === '::1')
    && url.username.length === 0
    && url.password.length === 0
    && url.hash.length === 0
    && (port === null || (Number.isInteger(port) && port > 0 && port <= 65_535));
}

function isExactRendererOrigin(url: URL, current: Location): boolean {
  let currentUrl: URL;
  try {
    currentUrl = new URL(current.href);
  } catch {
    return false;
  }
  return url.protocol === 'od:'
    && currentUrl.protocol === 'od:'
    && url.hostname === 'app'
    && currentUrl.hostname === 'app'
    && url.port === ''
    && currentUrl.port === ''
    && url.username === ''
    && url.password === ''
    && currentUrl.username === ''
    && currentUrl.password === ''
    && url.hash === ''
    && currentUrl.hash === '';
}

function isFixtureCaptureLocation(location: Location): boolean {
  let url: URL;
  try {
    url = new URL(location.href);
  } catch {
    return false;
  }
  if (!isExactRendererOrigin(url, location)) return false;
  const canonicalRoute = parseStudioFixtureRoute(url);
  if (canonicalRoute) {
    return studioFixtureCaptureWitnessMatches(canonicalRoute, currentStudioFixtureCaptureWitness());
  }
  return url.search === '' && url.hash === '' && isFixtureProjectPath(url.pathname);
}

/**
 * Install the capture provider only for the exact fixture route. It owns no
 * production state outside that route and rejects network escapes rather than
 * silently allowing a capture to depend on a live service.
 */
export function installStudioFixtureFetch(route: StudioFixtureRoute): () => void {
  if (typeof window === 'undefined') return () => {};
  const originalFetch = window.fetch.bind(window);
  const tabsState = { current: { ...studioFixtureTabs, tabs: [...studioFixtureTabs.tabs] } };
  activeStudioFixtureProjectId = route.projectId;
  activeStudioFixtureConversationId = route.conversationId;
  const patchedFetch: typeof window.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url, window.location.href);
    if (!isFixtureCaptureLocation(window.location)) {
      return originalFetch(input, init);
    }
    const sameRendererOrigin = isExactRendererOrigin(url, window.location);
    const localApiOrigin = isLoopbackHttpUrl(url);
    if (!url.pathname.startsWith('/api/')) {
      if (!sameRendererOrigin) {
        throw new Error('Studio fixture blocked a non-local request');
      }
      return originalFetch(input, init);
    }
    if (!sameRendererOrigin && !localApiOrigin) {
      throw new Error('Studio fixture blocked an external request');
    }
    const method = request.method.toUpperCase();
    if (url.pathname.endsWith(`/projects/${STUDIO_FIXTURE_PROJECT_ID}/tabs`) && method === 'PUT') {
      try {
        const body = await request.clone().json() as unknown;
        const validated = validateFixtureTabsState(body);
        if (!validated) {
          return jsonResponse({ error: { code: 'INVALID_TABS', message: 'Fixture tabs state is invalid.' } }, 400);
        }
        tabsState.current = validated;
      } catch {
        return jsonResponse({ error: { code: 'INVALID_TABS', message: 'Fixture tabs state is invalid JSON.' } }, 400);
      }
    }
    return fixtureResponse(url, method, tabsState);
  };
  window.fetch = patchedFetch;
  return () => {
    if (window.fetch === patchedFetch) window.fetch = originalFetch;
    if (
      activeStudioFixtureProjectId === route.projectId
      && activeStudioFixtureConversationId === route.conversationId
    ) {
      activeStudioFixtureProjectId = null;
      activeStudioFixtureConversationId = null;
    }
  };
}

export function studioFixtureNetworkAllows(
  url: string,
  routeActive: boolean,
  currentOrigin = 'http://localhost',
): boolean {
  if (!routeActive) return false;
  try {
    const parsed = new URL(url, currentOrigin);
    return parsed.pathname.startsWith('/api/')
      && (parsed.origin === currentOrigin || isLoopbackHttpUrl(parsed));
  } catch {
    return false;
  }
}

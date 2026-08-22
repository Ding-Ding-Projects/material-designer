import { randomBytes } from "node:crypto";

/**
 * Developer-only resolver for the checked-in design-parity capture routes.
 *
 * The resolver accepts the hand-written `material-designer://` route shape and
 * maps it to a real renderer pathname. It does not render or inject a screen;
 * the normal web router remains the only owner of production UI state.
 */

export const DETERMINISTIC_PARITY_PROTOCOL = "material-designer:";
export const DETERMINISTIC_PARITY_CAPTURE_FLAG = "--design-parity-capture";
export const DETERMINISTIC_PARITY_CAPTURE_ENV = "OD_DESIGN_PARITY_CAPTURE";
export const DETERMINISTIC_PARITY_FIXTURE_REVISION = "material-designer-m3-v2";
export const DETERMINISTIC_PARITY_TIME = "2026-08-02T21:22:17.000Z";
export const DETERMINISTIC_PARITY_RANDOM_SEED = 3003;
export const DETERMINISTIC_PARITY_FONTS = "bundled-roboto-v1";
export const DETERMINISTIC_PARITY_NETWORK = "disabled";
export const DETERMINISTIC_PARITY_CAPTURE_ROOT_SEGMENT = "design-parity-captures";
const DETERMINISTIC_PARITY_CAPTURE_RUN_ID_PATTERN = /^run-[0-9a-f]{32}$/;

/** Freeze the tuple graph, not only its outer record. */
export function deepFreezeDeterministicParityValue<T>(value: T): T {
  if (value != null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const key of Reflect.ownKeys(value as object)) {
      deepFreezeDeterministicParityValue((value as Record<PropertyKey, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

const QUERY_KEYS = [
  "state",
  "theme",
  "width",
  "height",
  "scale",
  "locale",
  "fixture",
  "time",
  "motion",
  "random",
  "fonts",
  "network",
] as const;

const PRESENTATIONS = [
  { theme: "light", width: 1440, height: 900, scale: 1, locale: "en-US" },
  { theme: "light", width: 1440, height: 900, scale: 1.25, locale: "en-US" },
  { theme: "light", width: 1440, height: 900, scale: 1.5, locale: "en-US" },
  { theme: "light", width: 1440, height: 900, scale: 2, locale: "en-US" },
  { theme: "dark", width: 1440, height: 900, scale: 1, locale: "en-US" },
  { theme: "light", width: 720, height: 900, scale: 1, locale: "bilingual" },
] as const;

type ParityScreen =
  | "home"
  | "projects"
  | "design-systems"
  | "automations"
  | "plugins"
  | "integrations"
  | "studio"
  | "library"
  | "settings"
  | "handoff";

type ParityRouteId =
  | "home-default-light"
  | "projects-default-light"
  | "design-systems-default-light"
  | "automations-default-light"
  | "plugins-default-light"
  | "integrations-default-light"
  | "studio-default-light"
  | "library-default-light"
  | "settings-appearance-light"
  | "handoff-default-light";

export type DeterministicParityTuple = {
  screen: ParityScreen;
  state: "default" | "appearance";
  theme: "light" | "dark";
  viewport: { width: number; height: number };
  scale: number;
  locale: "en-US" | "bilingual";
  fixtureRevision: typeof DETERMINISTIC_PARITY_FIXTURE_REVISION;
  time: typeof DETERMINISTIC_PARITY_TIME;
  motion: "frozen";
  randomSeed: typeof DETERMINISTIC_PARITY_RANDOM_SEED;
  fonts: typeof DETERMINISTIC_PARITY_FONTS;
  network: typeof DETERMINISTIC_PARITY_NETWORK;
};

export type DeterministicParityRoute = {
  id: ParityRouteId;
  tuple: DeterministicParityTuple;
  /** The actual pathname owned by the web router. */
  browserPath: string;
  /** The `od://` URL the packaged renderer loads. */
  browserUrl: string;
  /** The route state a readiness receipt must report. */
  semanticState: {
    screen: ParityScreen;
    state: DeterministicParityTuple["state"];
    browserPath: string;
  };
};

export type DeterministicParityReadiness = {
  version: 2;
  ready: boolean;
  routeId: ParityRouteId;
  requestedTuple: DeterministicParityTuple;
  actual: {
    href: string;
    search: string;
    pathname: string;
    theme: string | null;
    viewport: { width: number; height: number };
    devicePixelRatio: number;
    fonts: {
      robotoFlex: boolean;
      robotoMono: boolean;
      materialSymbolsRounded: boolean;
    };
    semanticState: { screen: string | null; state: string | null; browserPath: string | null };
    rendererWitness: {
      routePath: string | null;
      routeState: string | null;
      fixtureSource: string | null;
      fixtureRevision: string | null;
    };
    captureSettledWitness: {
      settled: boolean;
      routePath: string | null;
      revision: string | null;
    };
    routeInvariant: { selector: string; present: boolean };
    networkPolicy: string | null;
    networkOrigin: string | null;
    networkIsolationReady: boolean;
    appMounted: boolean;
    blockedNetworkRequests: number;
  };
  reasons: string[];
};

type RouteDefinition = {
  id: ParityRouteId;
  screen: ParityScreen;
  state: DeterministicParityTuple["state"];
  /** A real path already handled by `apps/web/src/router.ts`. */
  browserPath: string | null;
  blockerCode?: string;
};

const ROUTE_DEFINITIONS: readonly RouteDefinition[] = [
  { id: "home-default-light", screen: "home", state: "default", browserPath: "/" },
  { id: "projects-default-light", screen: "projects", state: "default", browserPath: "/projects" },
  { id: "design-systems-default-light", screen: "design-systems", state: "default", browserPath: "/design-systems" },
  { id: "automations-default-light", screen: "automations", state: "default", browserPath: "/automations" },
  { id: "plugins-default-light", screen: "plugins", state: "default", browserPath: "/plugins" },
  { id: "integrations-default-light", screen: "integrations", state: "default", browserPath: "/integrations" },
  // These four rows stay explicit in the registry but fail closed until the
  // product owns a semantically identical destination. Mapping them to a
  // merely similar page would turn a route string into false parity evidence.
  {
    id: "studio-default-light",
    screen: "studio",
    state: "default",
    browserPath: null,
    blockerCode: "route.studio_unresolved",
  },
  {
    id: "library-default-light",
    screen: "library",
    state: "default",
    browserPath: null,
    blockerCode: "route.library_hidden",
  },
  {
    id: "settings-appearance-light",
    screen: "settings",
    state: "appearance",
    browserPath: null,
    blockerCode: "route.settings_appearance_unresolved",
  },
  {
    id: "handoff-default-light",
    screen: "handoff",
    state: "default",
    browserPath: null,
    blockerCode: "route.handoff_unresolved",
  },
];

const EXPECTED_ROUTE_IDS = ROUTE_DEFINITIONS.map(({ id }) => id);

export class DeterministicParityRouteError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = "DeterministicParityRouteError";
    this.code = code;
  }
}

function fail(code: string, message: string): never {
  throw new DeterministicParityRouteError(code, message);
}

function isCaptureEnabled(
  argv: readonly string[],
  env: Record<string, string | undefined>,
): boolean {
  return env[DETERMINISTIC_PARITY_CAPTURE_ENV] === "1"
    || argv.includes(DETERMINISTIC_PARITY_CAPTURE_FLAG);
}

export function isDeterministicParityCaptureEnabled(
  argv: readonly string[] = process.argv,
  env: Record<string, string | undefined> = process.env,
): boolean {
  return isCaptureEnabled(argv, env);
}

function routeArgument(argv: readonly string[]): string | null {
  const routes = argv.filter((argument) => argument.startsWith(`${DETERMINISTIC_PARITY_PROTOCOL}//`));
  if (routes.length > 1) {
    fail("route.argv_duplicate", "capture launch must contain exactly one material-designer:// route");
  }
  return routes[0] ?? null;
}

function readRequired(url: URL, key: string): string {
  const value = url.searchParams.get(key);
  if (value == null || value.length === 0) fail("tuple.missing", `missing ${key}`);
  return value;
}

function parseNumber(value: string, key: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) fail("tuple.numeric", `${key} must be numeric`);
  return parsed;
}

function equalPresentation(tuple: DeterministicParityTuple): boolean {
  return PRESENTATIONS.some((candidate) =>
    candidate.theme === tuple.theme
    && candidate.width === tuple.viewport.width
    && candidate.height === tuple.viewport.height
    && candidate.scale === tuple.scale
    && candidate.locale === tuple.locale,
  );
}

function routeIdFor(tuple: Pick<DeterministicParityTuple, "screen" | "state">): RouteDefinition {
  const definition = ROUTE_DEFINITIONS.find((candidate) =>
    candidate.screen === tuple.screen && candidate.state === tuple.state,
  );
  if (!definition) fail("route.unknown", `${tuple.screen}/${tuple.state} is not an inventoried route`);
  return definition;
}

function buildBrowserUrl(browserPath: string, tuple: DeterministicParityTuple): string {
  const url = new URL(`od://app${browserPath === "/" ? "/" : browserPath}`);
  const values: readonly [string, string | number][] = [
    ["state", tuple.state],
    ["theme", tuple.theme],
    ["width", tuple.viewport.width],
    ["height", tuple.viewport.height],
    ["scale", tuple.scale],
    ["locale", tuple.locale],
    ["fixture", tuple.fixtureRevision],
    ["time", tuple.time],
    ["motion", tuple.motion],
    ["random", tuple.randomSeed],
    ["fonts", tuple.fonts],
    ["network", tuple.network],
  ];
  for (const [key, value] of values) url.searchParams.set(key, String(value));
  return url.href;
}

/**
 * Parse and validate one application route. Every field is required, query
 * order is pinned to the inventory, and only the declared presentation matrix
 * is accepted. This is intentionally stricter than a normal deep-link parser.
 */
export function resolveDeterministicParityRoute(
  rawUrl: string,
  options: { captureEnabled?: boolean } = {},
): DeterministicParityRoute {
  if (options.captureEnabled === false) {
    fail("capture.mode_required", "material-designer:// routes require developer capture mode");
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    fail("route.invalid_url", "route is not a valid URL");
  }
  if (url.protocol !== DETERMINISTIC_PARITY_PROTOCOL) fail("route.protocol", "unsupported route protocol");
  if (!url.hostname || url.username || url.password || url.port || url.hash) {
    fail("route.shape", "route authority, credentials, port, and hash are not allowed");
  }
  if (url.pathname !== "" && url.pathname !== "/") fail("route.path", "route pathname must be empty");

  const actualKeys = [...url.searchParams.keys()];
  if (JSON.stringify(actualKeys) !== JSON.stringify(QUERY_KEYS)) {
    fail("route.query_keys", "route query keys are missing, duplicated, extra, or out of order");
  }

  const screen = url.hostname as ParityScreen;
  const state = readRequired(url, "state") as DeterministicParityTuple["state"];
  const theme = readRequired(url, "theme") as DeterministicParityTuple["theme"];
  const width = parseNumber(readRequired(url, "width"), "width");
  const height = parseNumber(readRequired(url, "height"), "height");
  const scale = parseNumber(readRequired(url, "scale"), "scale");
  const locale = readRequired(url, "locale") as DeterministicParityTuple["locale"];
  const fixtureRevision = readRequired(url, "fixture");
  const time = readRequired(url, "time");
  const motion = readRequired(url, "motion");
  const randomSeed = parseNumber(readRequired(url, "random"), "random");
  const fonts = readRequired(url, "fonts");
  const network = readRequired(url, "network");

  if (!ROUTE_DEFINITIONS.some((candidate) => candidate.screen === screen)) fail("route.unknown", `unknown screen ${screen}`);
  if (state !== "default" && state !== "appearance") fail("tuple.state", `unsupported state ${state}`);
  if (theme !== "light" && theme !== "dark") fail("tuple.theme", `unsupported theme ${theme}`);
  if (theme === "dark") fail("route.theme_dark_unresolved", "the production application is currently light-only");
  if (locale !== "en-US" && locale !== "bilingual") fail("tuple.locale", `unsupported locale ${locale}`);
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) fail("tuple.viewport", "viewport dimensions must be positive integers");
  if (scale <= 0) fail("tuple.scale", "scale must be positive");
  if (!Number.isSafeInteger(randomSeed)) fail("tuple.random", "random seed must be a safe integer");
  if (fixtureRevision !== DETERMINISTIC_PARITY_FIXTURE_REVISION) fail("tuple.fixture", "fixture revision is not the declared public fixture");
  if (time !== DETERMINISTIC_PARITY_TIME || Number.isNaN(Date.parse(time))) fail("tuple.time", "time must equal the frozen capture instant");
  if (motion !== "frozen") fail("tuple.motion", "motion must be frozen");
  if (randomSeed !== DETERMINISTIC_PARITY_RANDOM_SEED) fail("tuple.random", "random seed is not the declared capture seed");
  if (fonts !== DETERMINISTIC_PARITY_FONTS) fail("tuple.fonts", "fonts must use the bundled font set");
  if (network !== DETERMINISTIC_PARITY_NETWORK) fail("capture.network_policy", "network access must be disabled");

  const tuple = {
    screen,
    state,
    theme,
    viewport: { width, height },
    scale,
    locale,
    fixtureRevision: fixtureRevision as typeof DETERMINISTIC_PARITY_FIXTURE_REVISION,
    time: time as typeof DETERMINISTIC_PARITY_TIME,
    motion: motion as "frozen",
    randomSeed: randomSeed as typeof DETERMINISTIC_PARITY_RANDOM_SEED,
    fonts: fonts as typeof DETERMINISTIC_PARITY_FONTS,
    network: network as typeof DETERMINISTIC_PARITY_NETWORK,
  } satisfies DeterministicParityTuple;
  const definition = routeIdFor(tuple);
  if (!equalPresentation(tuple)) fail("tuple.presentation", "presentation is not in the required capture matrix");
  if (definition.browserPath == null) {
    fail(
      definition.blockerCode ?? "route.semantic_unresolved",
      `${definition.id} has no semantically identical production destination`,
    );
  }

  return deepFreezeDeterministicParityValue({
    id: definition.id,
    tuple,
    browserPath: definition.browserPath,
    browserUrl: buildBrowserUrl(definition.browserPath, tuple),
    semanticState: {
      browserPath: definition.browserPath,
      screen: tuple.screen,
      state: tuple.state,
    },
  });
}

/**
 * Read the route argument from an Electron launch. A supplied route outside
 * explicit capture mode is rejected rather than silently changing startup.
 */
export function parseDeterministicParityRouteArgv(
  argv: readonly string[] = process.argv,
  env: Record<string, string | undefined> = process.env,
): DeterministicParityRoute | null {
  const raw = routeArgument(argv);
  const enabled = isCaptureEnabled(argv, env);
  if (enabled && raw == null) {
    fail("capture.route_required", "capture mode requires exactly one material-designer:// route");
  }
  if (raw == null) return null;
  return resolveDeterministicParityRoute(raw, { captureEnabled: enabled });
}

export function deterministicParityChromiumLocale(tuple: DeterministicParityTuple): string {
  return tuple.locale === "bilingual" ? "en-US" : tuple.locale;
}

/** In-memory Electron session used only by the capture renderer. */
export function createDeterministicParityCaptureRunId(): string {
  return `run-${randomBytes(16).toString("hex")}`;
}

export function validateDeterministicParityCaptureRunId(value: string): string {
  if (!DETERMINISTIC_PARITY_CAPTURE_RUN_ID_PATTERN.test(value)) {
    fail("capture.run_id_invalid", "capture run identity must match the run-<32 lowercase hex> form");
  }
  return value;
}

export function deterministicParityCaptureRunNamespace(runId: string): string {
  return `${DETERMINISTIC_PARITY_CAPTURE_ROOT_SEGMENT}/${validateDeterministicParityCaptureRunId(runId)}`;
}

/**
 * Capture-only sidecar namespace. The run id is part of the namespace itself,
 * not merely a user-data directory suffix, so IPC paths, process stamps,
 * identity records, and endpoint retirement are unambiguously lease-scoped.
 */
export function deterministicParityCaptureSidecarNamespace(
  route: Pick<DeterministicParityRoute, "id">,
  runId: string,
): string {
  const validatedRunId = validateDeterministicParityCaptureRunId(runId);
  return `capture-${route.id}-${validatedRunId}`;
}

export function deterministicParitySessionPartition(
  route: DeterministicParityRoute,
  runId: string,
): string {
  return `material-designer-parity-${route.id}-${validateDeterministicParityCaptureRunId(runId)}`;
}

/**
 * Capture navigation is exact-route only. This is intentionally stricter than
 * the normal desktop URL policy: a capture renderer must never be redirected
 * to another scheme, path, query, or custom protocol after its tuple is
 * accepted.
 */
export function isDeterministicParityNavigationAllowed(
  route: DeterministicParityRoute,
  url: string,
): boolean {
  return url === route.browserUrl;
}

export const DETERMINISTIC_PARITY_NOT_READY_REASON =
  "deterministic parity capture readiness is not verified";

export function isDeterministicParityCaptureReady(
  readiness: Pick<DeterministicParityReadiness, "ready"> | null,
): boolean {
  return readiness?.ready === true;
}

export function isDeterministicParityReadinessInspectionExpression(expression: string): boolean {
  const normalized = expression.trim();
  return normalized === "globalThis.__MATERIAL_DESIGNER_CAPTURE_READINESS__"
    || normalized === "window.__MATERIAL_DESIGNER_CAPTURE_READINESS__"
    || normalized === "document.documentElement.dataset.odParityReady"
    || normalized === "document.documentElement.dataset.odParityReadinessReasons";
}

/** Exact ids are exported for source-level contract tests and handoff tools. */
export function deterministicParityRouteIds(): readonly string[] {
  return EXPECTED_ROUTE_IDS;
}

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..');
const INVENTORY_PATH = resolve(ROOT, '.codex/verification/design-parity/inventory.json');
const ROUTES_PATH = resolve(ROOT, '.codex/verification/design-parity/routes.json');

export const PARITY_PROTOCOLS = Object.freeze({
  reference: 'design-reference:',
  application: 'material-designer:',
});

export const PARITY_QUERY_KEYS = Object.freeze([
  'state', 'theme', 'width', 'height', 'scale', 'locale', 'fixture', 'time',
  'motion', 'random', 'fonts', 'network',
]);

export const PARITY_TUPLE_KEYS = Object.freeze([
  'screen', 'state', 'theme', 'viewport', 'scale', 'locale', 'fixtureRevision',
  'time', 'motion', 'randomSeed', 'fonts', 'network',
]);

export const PARITY_ROUTE_IDS = Object.freeze([
  'home-default-light',
  'projects-default-light',
  'design-systems-default-light',
  'automations-default-light',
  'plugins-default-light',
  'integrations-default-light',
  'studio-default-light',
  'library-default-light',
  'settings-appearance-light',
  'handoff-default-light',
]);

export const PARITY_PRESENTATIONS = Object.freeze([
  Object.freeze({ theme: 'light', width: 1440, height: 900, scale: 1, locale: 'en-US' }),
  Object.freeze({ theme: 'light', width: 1440, height: 900, scale: 1.25, locale: 'en-US' }),
  Object.freeze({ theme: 'light', width: 1440, height: 900, scale: 1.5, locale: 'en-US' }),
  Object.freeze({ theme: 'light', width: 1440, height: 900, scale: 2, locale: 'en-US' }),
  Object.freeze({ theme: 'dark', width: 1440, height: 900, scale: 1, locale: 'en-US' }),
  Object.freeze({ theme: 'light', width: 720, height: 900, scale: 1, locale: 'bilingual' }),
]);

export const PARITY_CAPTURE_POLICY = Object.freeze({
  headlessRoute: 'cheap-lowlevel-headless',
  network: 'disabled',
  blockedRequestPolicy: 'fail',
  externalRequestsAllowed: false,
  rendererWitnessRequired: true,
  captureSettledWitnessRequired: true,
});

const SCREEN_PATHS = Object.freeze({
  home: '/',
  projects: '/projects',
  'design-systems': '/design-systems',
  automations: '/automations',
  plugins: '/plugins',
  integrations: '/integrations',
  studio: '/studio',
  library: '/library',
  settings: '/settings/appearance',
  handoff: '/handoff',
});

const ROUTE_STATE = Object.freeze({
  home: 'default',
  projects: 'default',
  'design-systems': 'default',
  automations: 'default',
  plugins: 'default',
  integrations: 'default',
  studio: 'default',
  library: 'default',
  settings: 'appearance',
  handoff: 'default',
});

export class ParityRouteContractError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = 'ParityRouteContractError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new ParityRouteContractError(code, message);
}

function readRegistries() {
  return {
    inventory: JSON.parse(readFileSync(INVENTORY_PATH, 'utf8').replace(/^\uFEFF/, '')),
    routes: JSON.parse(readFileSync(ROUTES_PATH, 'utf8').replace(/^\uFEFF/, '')),
  };
}

function requireString(url, key) {
  const value = url.searchParams.get(key);
  if (value == null || value.length === 0) fail('tuple.missing', `missing ${key}`);
  return value;
}

function requireNumber(url, key) {
  const value = requireString(url, key);
  const number = Number(value);
  if (!Number.isFinite(number)) fail('tuple.numeric', `${key} must be finite`);
  return number;
}

function routeIdFor(screen, state) {
  const id = PARITY_ROUTE_IDS.find((candidate) => candidate.startsWith(`${screen}-`)
    && candidate.endsWith(`-${state === 'appearance' ? 'light' : 'light'}`));
  if (!id || ROUTE_STATE[screen] !== state) fail('route.unknown', `${screen}/${state} is not an inventoried route`);
  return id;
}

function isPresentation(tuple) {
  return PARITY_PRESENTATIONS.some((candidate) => candidate.theme === tuple.theme
    && candidate.width === tuple.viewport.width
    && candidate.height === tuple.viewport.height
    && candidate.scale === tuple.scale
    && candidate.locale === tuple.locale);
}

function buildRoute(protocol, tuple) {
  const url = new URL(`${protocol}//${tuple.screen}`);
  const values = [
    ['state', tuple.state], ['theme', tuple.theme], ['width', tuple.viewport.width],
    ['height', tuple.viewport.height], ['scale', tuple.scale], ['locale', tuple.locale],
    ['fixture', tuple.fixtureRevision], ['time', tuple.time], ['motion', tuple.motion],
    ['random', tuple.randomSeed], ['fonts', tuple.fonts], ['network', tuple.network],
  ];
  for (const [key, value] of values) url.searchParams.set(key, String(value));
  return url.href;
}

export function buildParityRoute(protocol, tuple) {
  if (!Object.values(PARITY_PROTOCOLS).includes(protocol)) fail('route.protocol', `unsupported route protocol ${protocol}`);
  return buildRoute(protocol, tuple);
}

function validateUrlShape(rawUrl, protocol) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    fail('route.invalid_url', 'route is not a valid URL');
  }
  if (url.protocol !== protocol) fail('route.protocol', `route must use ${protocol}`);
  if (!url.hostname || url.username || url.password || url.port || url.hash || (url.pathname && url.pathname !== '/')) {
    fail('route.shape', 'route authority, credentials, port, hash, and path are not allowed');
  }
  const keys = [...url.searchParams.keys()];
  if (JSON.stringify(keys) !== JSON.stringify(PARITY_QUERY_KEYS)) {
    fail('route.query_keys', 'route query keys are missing, duplicated, extra, or out of order');
  }
  return url;
}

export function parseParityRoute(rawUrl, { protocol = PARITY_PROTOCOLS.application } = {}) {
  const url = validateUrlShape(rawUrl, protocol);
  const screen = url.hostname;
  const state = requireString(url, 'state');
  const theme = requireString(url, 'theme');
  const width = requireNumber(url, 'width');
  const height = requireNumber(url, 'height');
  const scale = requireNumber(url, 'scale');
  const locale = requireString(url, 'locale');
  const fixtureRevision = requireString(url, 'fixture');
  const time = requireString(url, 'time');
  const motion = requireString(url, 'motion');
  const randomSeed = requireNumber(url, 'random');
  const fonts = requireString(url, 'fonts');
  const network = requireString(url, 'network');
  if (!Object.hasOwn(ROUTE_STATE, screen)) fail('route.unknown', `unknown screen ${screen}`);
  if (state !== ROUTE_STATE[screen]) fail('tuple.state', `${screen} requires state ${ROUTE_STATE[screen]}`);
  if (!['light', 'dark'].includes(theme)) fail('tuple.theme', `unsupported theme ${theme}`);
  if (!['en-US', 'bilingual'].includes(locale)) fail('tuple.locale', `unsupported locale ${locale}`);
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) fail('tuple.viewport', 'viewport dimensions must be positive integers');
  if (scale <= 0 || ![1, 1.25, 1.5, 2].includes(scale)) fail('tuple.scale', 'scale is not in the required matrix');
  if (!Number.isSafeInteger(randomSeed) || randomSeed !== 3003) fail('tuple.random', 'random seed is not the declared capture seed');
  if (fixtureRevision !== 'material-designer-m3-v2') fail('tuple.fixture', 'fixture revision is not the declared fixture');
  if (Number.isNaN(Date.parse(time)) || time !== '2026-08-02T21:22:17.000Z') fail('tuple.time', 'time must equal the frozen capture instant');
  if (motion !== 'frozen') fail('tuple.motion', 'motion must be frozen');
  if (fonts !== 'bundled-roboto-v1') fail('tuple.fonts', 'fonts must use the bundled revision');
  if (network !== 'disabled') fail('capture.network_policy', 'network access must be disabled');
  const tuple = Object.freeze({
    screen, state, theme, viewport: Object.freeze({ width, height }), scale, locale,
    fixtureRevision, time, motion, randomSeed, fonts, network,
  });
  if (!isPresentation(tuple)) fail('tuple.presentation', 'presentation is not in the required six-tuple matrix');
  const id = routeIdFor(screen, state);
  const registries = readRegistries();
  const row = registries.inventory.rows.find((candidate) => candidate.id === id);
  const registryRoute = registries.routes.routes.find((candidate) => candidate.id === id);
  if (!row || !registryRoute) fail('route.registry_missing', `${id} is absent from the hand-written registries`);
  const browserPath = registryRoute.browserPath ?? SCREEN_PATHS[screen];
  if (browserPath !== SCREEN_PATHS[screen]) fail('route.browser_path', `${id} browser path is not the canonical route`);
  return Object.freeze({
    id, tuple, protocol, referenceRoute: buildRoute(PARITY_PROTOCOLS.reference, tuple),
    applicationRoute: buildRoute(PARITY_PROTOCOLS.application, tuple), browserPath,
    identity: Object.freeze({
      surfaceId: 'desktop-application', featureId: id, routeId: id,
      semanticScreen: screen, semanticState: state, headlessRoute: PARITY_CAPTURE_POLICY.headlessRoute,
    }),
    captureIsolation: Object.freeze({
      network: PARITY_CAPTURE_POLICY.network,
      blockedRequestPolicy: PARITY_CAPTURE_POLICY.blockedRequestPolicy,
      externalRequestsAllowed: PARITY_CAPTURE_POLICY.externalRequestsAllowed,
      rendererWitnessRequired: PARITY_CAPTURE_POLICY.rendererWitnessRequired,
      captureSettledWitnessRequired: PARITY_CAPTURE_POLICY.captureSettledWitnessRequired,
    }),
  });
}

export function parseParityRouteFromArgv(argv = process.argv, options = {}) {
  const prefix = `${PARITY_PROTOCOLS.application}//`;
  const matches = argv.filter((value) => value.startsWith(prefix));
  if (matches.length > 1) fail('route.argv_duplicate', 'capture launch must contain exactly one material-designer:// route');
  if (matches.length === 0) return null;
  return parseParityRoute(matches[0], options);
}

export function createCaptureIsolation(routeId, runId) {
  if (!PARITY_ROUTE_IDS.includes(routeId)) fail('capture.route_id', `unknown route id ${routeId}`);
  if (!/^run-[0-9a-f]{32}$/.test(runId)) fail('capture.run_id', 'run identity must use run- followed by 32 lowercase hex characters');
  return Object.freeze({
    partition: `persist:material-designer-parity-${routeId}-${runId}`,
    sidecarNamespace: `capture-${routeId}-${runId}`,
    network: PARITY_CAPTURE_POLICY,
  });
}

export function routeContractIdentity(route) {
  if (!route || !PARITY_ROUTE_IDS.includes(route.id)) fail('route.identity', 'route identity is missing or unknown');
  return Object.freeze({ ...route.identity, ...route.captureIsolation, tuple: route.tuple });
}

export function validateRouteContractRegistry(registries = readRegistries()) {
  const ids = registries.routes.routes.map((route) => route.id);
  if (JSON.stringify(ids) !== JSON.stringify(PARITY_ROUTE_IDS)) fail('route.registry_ids', 'route registry must contain exactly ten stable route ids in order');
  const rowIds = registries.inventory.rows.map((row) => row.id);
  if (JSON.stringify(rowIds) !== JSON.stringify(PARITY_ROUTE_IDS)) fail('inventory.row_ids', 'inventory must contain exactly ten stable row ids in order');
  const seenPaths = new Set();
  for (const route of registries.routes.routes) {
    if (!route.browserPath || !route.browserPath.startsWith('/')) fail('route.browser_path', `${route.id} has no addressable browser path`);
    if (seenPaths.has(route.browserPath)) fail('route.duplicate_path', `${route.browserPath} is used more than once`);
    seenPaths.add(route.browserPath);
    if (route.capture?.network !== PARITY_CAPTURE_POLICY.network || route.capture?.blockedRequestPolicy !== PARITY_CAPTURE_POLICY.blockedRequestPolicy) {
      fail('capture.network_policy', `${route.id} does not fail closed on network requests`);
    }
  }
  return { ok: true, rows: PARITY_ROUTE_IDS.length, presentations: PARITY_PRESENTATIONS.length };
}

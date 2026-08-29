import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadAndPinParityRegistries } from '../../scripts/design-parity-production.mjs';
import {
  PARITY_PROTOCOLS,
  buildParityRoute,
  evaluateCaptureNetwork,
  parseParityRoute,
  requireReferencePostSettleMatch,
  validateReferenceLauncherReadiness,
  validateRouteContractRegistry,
} from './parity-route-contract.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(here, '..', '..');
const desktopRequire = createRequire(resolve(repositoryRoot, 'design/apps/desktop/package.json'));
const { app, BrowserWindow, session } = desktopRequire('electron');
const { routes, inventory, pinnedReference } = loadAndPinParityRegistries(repositoryRoot);
validateRouteContractRegistry({ inventory, routes });

const arg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
};
const defaults = inventory.defaults;
const requestedInput = {
  screen: arg('screen', 'home'),
  state: arg('state', 'default'),
  theme: arg('theme', defaults.theme),
  viewport: { width: Number(arg('width', String(defaults.viewport.width))), height: Number(arg('height', String(defaults.viewport.height))) },
  scale: Number(arg('scale', String(defaults.scale))),
  locale: arg('locale', defaults.locale),
  fixtureRevision: arg('fixture', defaults.fixtureRevision),
  time: arg('time', defaults.time),
  motion: arg('motion', defaults.motion),
  randomSeed: Number(arg('random', String(defaults.randomSeed))),
  fonts: arg('fonts', defaults.fonts),
  network: arg('network', defaults.network),
};
const requested = parseParityRoute(buildParityRoute(PARITY_PROTOCOLS.reference, requestedInput), { protocol: PARITY_PROTOCOLS.reference });
const tuple = requested.tuple;
const route = routes.routes.find((candidate) => candidate.id === requested.id);
const row = inventory.rows.find((candidate) => candidate.id === requested.id);

app.commandLine.appendSwitch('force-device-scale-factor', String(tuple.scale));
app.commandLine.appendSwitch('lang', tuple.locale === 'bilingual' ? 'en-US' : tuple.locale);

const referencePath = pinnedReference.reference.absolutePath;
const pinnedDependency = new Map(pinnedReference.dependencies.map((item) => [item.path, item.absolutePath]));
const packageRoot = (name) => dirname(desktopRequire.resolve(`${name}/package.json`));
const fontCss = pinnedDependency.get('tools/design-reference-app/font-runtime.css');
const localScripts = new Map([
  ['https://unpkg.com/react@18.3.1/umd/react.production.min.js', join(packageRoot('react'), 'umd/react.production.min.js')],
  ['https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js', join(packageRoot('react-dom'), 'umd/react-dom.production.min.js')],
  ['https://fonts.googleapis.com/css2?family=Roboto+Flex:opsz,wght@8..144,300..800&family=Roboto+Mono:wght@400;500&display=swap', fontCss],
  ['https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,0..1,0', fontCss],
]);
const allowedLocalFiles = new Set([
  referencePath,
  ...pinnedReference.dependencies.map((item) => item.absolutePath),
  ...localScripts.values(),
].map((path) => pathToFileURL(path).href));

function actionScript(step) {
  const match = JSON.stringify(step.match);
  const value = JSON.stringify(step.value);
  return `(() => {
    const buttons = [...document.querySelectorAll('button')];
    const target = buttons.find((button) => {
      if (${match} === 'aria-label-exact') return button.getAttribute('aria-label') === ${value};
      if (${match} === 'text-exact') return button.textContent.trim() === ${value};
      return false;
    });
    if (!target) return false;
    target.click();
    return true;
  })()`;
}

function deterministicPrelude(route, reference) {
  const epoch = Date.parse(route.tuple.time);
  const rendererContext = {
    tuple: route.tuple,
    identity: route.identity,
    captureIsolation: route.captureIsolation,
    reference: { path: reference.path, sha256: reference.sha256 },
    referenceRoute: route.referenceRoute,
  };
  return `(() => {
    const deepFreeze = (value, seen = new WeakSet()) => {
      if (value && typeof value === 'object' && !seen.has(value)) {
        seen.add(value);
        for (const key of Reflect.ownKeys(value)) deepFreeze(value[key], seen);
        Object.freeze(value);
      }
      return value;
    };
    const NativeDate = Date;
    class FrozenDate extends NativeDate {
      constructor(...args) { super(...(args.length ? args : [${epoch}])); }
      static now() { return ${epoch}; }
    }
    Object.defineProperty(globalThis, 'Date', { value: FrozenDate, configurable: false, writable: false });
    let state = ${route.tuple.randomSeed} >>> 0;
    const seededRandom = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
    Object.defineProperty(Math, 'random', { value: seededRandom, configurable: false, writable: false });
    const freezeMotion = () => {
      const style = document.createElement('style');
      style.id = 'material-designer-deterministic-motion';
      style.textContent = '*,*::before,*::after{animation-delay:-99999s!important;animation-duration:.001s!important;animation-iteration-count:1!important;animation-fill-mode:both!important;transition-duration:0s!important;scroll-behavior:auto!important}';
      document.documentElement.appendChild(style);
    };
    if (document.documentElement) freezeMotion(); else document.addEventListener('DOMContentLoaded', freezeMotion, { once: true });
    const context = deepFreeze(${JSON.stringify(rendererContext)});
    Object.defineProperty(globalThis, '__MATERIAL_DESIGNER_DEEP_FREEZE__', { value: deepFreeze, configurable: false, writable: false });
    Object.defineProperty(globalThis, '__MATERIAL_DESIGNER_PARITY_CONTEXT__', { value: context, configurable: false, writable: false });
    Object.defineProperty(globalThis, '__MATERIAL_DESIGNER_CAPTURE_TUPLE__', { value: context.tuple, configurable: false, writable: false });
  })();`;
}

const rendererRouteDefinitions = routes.routes.map((candidate) => ({
  routeId: candidate.id,
  screen: candidate.screen,
  state: candidate.state,
  routePath: candidate.browserPath,
  observation: candidate.referenceObservation,
}));

async function readRendererOwnedSnapshot(window) {
  return window.webContents.executeJavaScript(`(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const deepFreeze = globalThis.__MATERIAL_DESIGNER_DEEP_FREEZE__;
    const context = globalThis.__MATERIAL_DESIGNER_PARITY_CONTEXT__;
    if (typeof deepFreeze !== 'function' || !context) throw new Error('Renderer parity prelude is missing');
    const definitions = ${JSON.stringify(rendererRouteDefinitions)};
    const matches = definitions.filter((candidate) => {
      const element = document.querySelector(candidate.observation.selector);
      if (!element) return false;
      const bounds = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const visible = bounds.width > 0 && bounds.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      return visible && element.textContent.trim() === candidate.observation.text;
    });
    if (matches.length !== 1) throw new Error('Renderer route landmark is missing or ambiguous');
    const observed = matches[0];
    const element = document.querySelector(observed.observation.selector);
    const rendererRouteState = deepFreeze({
      routeId: observed.routeId,
      screen: observed.screen,
      state: observed.state,
      routePath: observed.routePath,
      observation: { selector: observed.observation.selector, text: element.textContent.trim() },
    });
    const rendererWitness = deepFreeze({
      routeId: rendererRouteState.routeId,
      routePath: rendererRouteState.routePath,
      routeState: rendererRouteState.state,
      fixtureSource: 'checked-in-reference',
      fixturePath: context.reference.path,
      fixtureRevision: context.tuple.fixtureRevision,
      fixtureSha256: context.reference.sha256,
    });
    const captureSettledWitness = deepFreeze({
      settled: true,
      routePath: rendererRouteState.routePath,
      revision: 'capture-settled-v1',
    });
    const witness = deepFreeze({
      version: 1,
      surfaceId: context.identity.surfaceId,
      featureId: rendererRouteState.routeId,
      routeId: rendererRouteState.routeId,
      screen: rendererRouteState.screen,
      state: rendererRouteState.state,
      theme: context.tuple.theme,
      locale: context.tuple.locale,
      viewportWidth: context.tuple.viewport.width,
      viewportHeight: context.tuple.viewport.height,
      displayScale: context.tuple.scale,
      fixtureRevision: context.tuple.fixtureRevision,
      frozenTime: context.tuple.time,
      motion: context.tuple.motion,
      randomSeed: context.tuple.randomSeed,
      bundledFontRevision: context.tuple.fonts,
      network: context.tuple.network,
      headlessRoute: context.identity.headlessRoute,
      rendererWitness,
      captureSettledWitness,
    });
    const measured = deepFreeze({
      viewport: { width: window.innerWidth, height: window.innerHeight },
      devicePixelRatio: window.devicePixelRatio,
      fonts: {
        robotoFlex: document.fonts.check('16px "Roboto Flex"'),
        robotoMono: document.fonts.check('16px "Roboto Mono"'),
        materialSymbolsRounded: document.fonts.check('16px "Material Symbols Rounded"'),
      },
      motionStyle: Boolean(document.getElementById('material-designer-deterministic-motion')),
      tuple: context.tuple,
    });
    const snapshot = deepFreeze({
      route: context.referenceRoute,
      tuple: context.tuple,
      identity: context.identity,
      rendererRouteState,
      reference: context.reference,
      measured,
      witness,
    });
    const freezeStatus = deepFreeze({
      tuple: Object.isFrozen(context.tuple),
      viewport: Object.isFrozen(context.tuple.viewport),
      identity: Object.isFrozen(context.identity),
      rendererRouteState: Object.isFrozen(rendererRouteState),
      rendererWitness: Object.isFrozen(rendererWitness),
      captureSettledWitness: Object.isFrozen(captureSettledWitness),
      witness: Object.isFrozen(witness),
      snapshot: Object.isFrozen(snapshot),
    });
    const published = deepFreeze({ ...snapshot, freezeStatus });
    if (!Object.hasOwn(globalThis, '__MATERIAL_DESIGNER_REFERENCE_ROUTE__')) {
      Object.defineProperty(globalThis, '__MATERIAL_DESIGNER_REFERENCE_ROUTE__', { value: published, configurable: false, writable: false });
    } else if (JSON.stringify(globalThis.__MATERIAL_DESIGNER_REFERENCE_ROUTE__) !== JSON.stringify(published)) {
      throw new Error('Renderer-owned route state changed after publication');
    }
    return published;
  })()`);
}

function withCaptureNetwork(rendererSnapshot, blockedRequests, localSubstitutions) {
  const network = evaluateCaptureNetwork(blockedRequests, localSubstitutions);
  return {
    route: rendererSnapshot.route,
    tuple: rendererSnapshot.tuple,
    identity: rendererSnapshot.identity,
    rendererRouteState: rendererSnapshot.rendererRouteState,
    reference: rendererSnapshot.reference,
    measured: rendererSnapshot.measured,
    network: {
      policy: rendererSnapshot.tuple.network,
      blockedRequests: network.blockedRequests,
      blockedRequestPolicy: 'fail',
      ready: network.ready,
    },
    witness: rendererSnapshot.witness,
    freezeStatus: rendererSnapshot.freezeStatus,
  };
}

await app.whenReady();
const blockedRequests = [];
session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
  const replacement = localScripts.get(details.url);
  if (replacement) return callback({ redirectURL: pathToFileURL(replacement).href });
  if (details.url.startsWith('file:') && allowedLocalFiles.has(new URL(details.url).href)) return callback({});
  if (details.url.startsWith('devtools:')) return callback({});
  blockedRequests.push({ url: details.url, resourceType: details.resourceType });
  return callback({ cancel: true });
});

const window = new BrowserWindow({
  width: tuple.viewport.width,
  height: tuple.viewport.height,
  show: false,
  useContentSize: true,
  backgroundColor: '#fff7f5',
  webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, zoomFactor: 1 },
});
window.setMenuBarVisibility(false);
window.webContents.debugger.attach('1.3');
await window.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: deterministicPrelude(requested, pinnedReference.reference) });
await window.loadFile(referencePath);
if (tuple.theme === 'dark') {
  const selected = await window.webContents.executeJavaScript(actionScript({ match: 'text-exact', value: 'dark_mode' }));
  if (!selected) throw new Error('Reference dark-theme control was not reachable');
}
for (const step of route.referenceSteps) {
  const selected = await window.webContents.executeJavaScript(actionScript(step));
  if (!selected) throw new Error(`Reference route step was not reachable: ${step.match}:${step.value}`);
}
const localSubstitutions = new Set(localScripts.keys());
const firstRendererSnapshot = await readRendererOwnedSnapshot(window);
const firstSnapshot = withCaptureNetwork(firstRendererSnapshot, blockedRequests, localSubstitutions);
const acceptedSnapshot = validateReferenceLauncherReadiness(requested, pinnedReference.reference, firstSnapshot);
await window.webContents.executeJavaScript('new Promise((resolve) => requestAnimationFrame(resolve))');
const postSettleRendererSnapshot = await readRendererOwnedSnapshot(window);
const postSettleSnapshot = withCaptureNetwork(postSettleRendererSnapshot, blockedRequests, localSubstitutions);
requireReferencePostSettleMatch(requested, pinnedReference.reference, acceptedSnapshot, postSettleSnapshot);
window.showInactive();
process.stdout.write(JSON.stringify({
  version: 2,
  ready: true,
  routeId: row.id,
    route: requested.referenceRoute,
    tuple,
    measured: acceptedSnapshot.measured,
    reference: inventory.reference,
    identity: requested.identity,
    captureIsolation: requested.captureIsolation,
    rendererRouteState: acceptedSnapshot.rendererRouteState,
    witness: acceptedSnapshot.witness,
    network: acceptedSnapshot.network,
}) + '\n');

window.on('closed', () => app.quit());

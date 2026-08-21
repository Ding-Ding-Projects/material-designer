import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(here, '..', '..');
const desktopRequire = createRequire(resolve(repositoryRoot, 'design/apps/desktop/package.json'));
const { app, BrowserWindow, session } = desktopRequire('electron');
const routes = JSON.parse(readFileSync(resolve(repositoryRoot, '.codex/verification/design-parity/routes.json'), 'utf8'));
const inventory = JSON.parse(readFileSync(resolve(repositoryRoot, '.codex/verification/design-parity/inventory.json'), 'utf8'));

const arg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
};
const defaults = inventory.defaults;
const requested = {
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
if (!Number.isInteger(requested.viewport.width) || requested.viewport.width <= 0 || !Number.isInteger(requested.viewport.height) || requested.viewport.height <= 0 || !Number.isFinite(requested.scale) || requested.scale <= 0 || !Number.isSafeInteger(requested.randomSeed)) {
  throw new Error('Invalid deterministic capture tuple');
}
if (Number.isNaN(Date.parse(requested.time)) || requested.motion !== 'frozen' || requested.fonts !== 'bundled-roboto-v1' || requested.network !== 'disabled') {
  throw new Error('Unsupported deterministic input policy');
}
const route = routes.routes.find((candidate) => candidate.screen === requested.screen && candidate.state === requested.state);
const row = inventory.rows.find((candidate) => candidate.id === route?.id);
const presentationMatches = (candidate) => candidate.theme === requested.theme
  && candidate.viewport?.width === requested.viewport.width
  && candidate.viewport?.height === requested.viewport.height
  && candidate.scale === requested.scale
  && candidate.locale === requested.locale;
const deterministicDefaultsMatch = requested.fixtureRevision === defaults.fixtureRevision
  && requested.time === defaults.time
  && requested.motion === defaults.motion
  && requested.randomSeed === defaults.randomSeed
  && requested.fonts === defaults.fonts
  && requested.network === defaults.network;
const declaredVariant = presentationMatches(row?.tuple ?? {}) || inventory.requiredCaptureVariants.some(presentationMatches);
if (!row || !route || !declaredVariant || !deterministicDefaultsMatch) throw new Error('The requested tuple is not in the hand-written route and capture-variant registry');

function routeUrl(protocol, tuple) {
  const url = new URL(`${protocol}//${tuple.screen}`);
  for (const [key, value] of [
    ['state', tuple.state], ['theme', tuple.theme], ['width', tuple.viewport.width], ['height', tuple.viewport.height],
    ['scale', tuple.scale], ['locale', tuple.locale], ['fixture', tuple.fixtureRevision], ['time', tuple.time],
    ['motion', tuple.motion], ['random', tuple.randomSeed], ['fonts', tuple.fonts], ['network', tuple.network],
  ]) url.searchParams.set(key, String(value));
  return url.href;
}

app.commandLine.appendSwitch('force-device-scale-factor', String(requested.scale));
app.commandLine.appendSwitch('lang', requested.locale === 'bilingual' ? 'en-US' : requested.locale);

const referencePath = resolve(repositoryRoot, inventory.reference.path);
const packageRoot = (name) => dirname(desktopRequire.resolve(`${name}/package.json`));
const fontCss = resolve(here, 'font-runtime.css');
const localScripts = new Map([
  ['https://unpkg.com/react@18.3.1/umd/react.production.min.js', join(packageRoot('react'), 'umd/react.production.min.js')],
  ['https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js', join(packageRoot('react-dom'), 'umd/react-dom.production.min.js')],
  ['https://fonts.googleapis.com/css2?family=Roboto+Flex:opsz,wght@8..144,300..800&family=Roboto+Mono:wght@400;500&display=swap', fontCss],
  ['https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,0..1,0', fontCss],
]);

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

function deterministicPrelude(tuple) {
  const epoch = Date.parse(tuple.time);
  return `(() => {
    const NativeDate = Date;
    class FrozenDate extends NativeDate {
      constructor(...args) { super(...(args.length ? args : [${epoch}])); }
      static now() { return ${epoch}; }
    }
    Object.defineProperty(globalThis, 'Date', { value: FrozenDate, configurable: false, writable: false });
    let state = ${tuple.randomSeed} >>> 0;
    const seededRandom = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
    Object.defineProperty(Math, 'random', { value: seededRandom, configurable: false, writable: false });
    const freezeMotion = () => {
      const style = document.createElement('style');
      style.id = 'material-designer-deterministic-motion';
      style.textContent = '*,*::before,*::after{animation-delay:-99999s!important;animation-duration:.001s!important;animation-iteration-count:1!important;animation-fill-mode:both!important;transition-duration:0s!important;scroll-behavior:auto!important}';
      document.documentElement.appendChild(style);
    };
    if (document.documentElement) freezeMotion(); else document.addEventListener('DOMContentLoaded', freezeMotion, { once: true });
    Object.defineProperty(globalThis, '__MATERIAL_DESIGNER_CAPTURE_TUPLE__', { value: Object.freeze(${JSON.stringify(tuple)}), configurable: false, writable: false });
  })();`;
}

await app.whenReady();
const blockedRequests = [];
session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
  const replacement = localScripts.get(details.url);
  if (replacement) return callback({ redirectURL: pathToFileURL(replacement).href });
  if (details.url.startsWith('file:') || details.url.startsWith('devtools:')) return callback({});
  blockedRequests.push({ resourceType: details.resourceType });
  return callback({ cancel: true });
});

const window = new BrowserWindow({
  width: requested.viewport.width,
  height: requested.viewport.height,
  show: false,
  useContentSize: true,
  backgroundColor: '#fff7f5',
  webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, zoomFactor: 1 },
});
window.setMenuBarVisibility(false);
window.webContents.debugger.attach('1.3');
await window.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: deterministicPrelude(requested) });
await window.loadFile(referencePath);
if (requested.theme === 'dark') {
  const selected = await window.webContents.executeJavaScript(actionScript({ match: 'text-exact', value: 'dark_mode' }));
  if (!selected) throw new Error('Reference dark-theme control was not reachable');
}
for (const step of route.referenceSteps) {
  const selected = await window.webContents.executeJavaScript(actionScript(step));
  if (!selected) throw new Error(`Reference route step was not reachable: ${step.match}:${step.value}`);
}
const measured = await window.webContents.executeJavaScript(`(async () => {
  await document.fonts.ready;
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  return {
    viewport: { width: window.innerWidth, height: window.innerHeight },
    devicePixelRatio: window.devicePixelRatio,
    fonts: {
      robotoFlex: document.fonts.check('16px "Roboto Flex"'),
      robotoMono: document.fonts.check('16px "Roboto Mono"'),
      materialSymbolsRounded: document.fonts.check('16px "Material Symbols Rounded"')
    },
    motionStyle: Boolean(document.getElementById('material-designer-deterministic-motion')),
    tuple: globalThis.__MATERIAL_DESIGNER_CAPTURE_TUPLE__
  };
})()`);
if (measured.viewport.width !== requested.viewport.width || measured.viewport.height !== requested.viewport.height || measured.devicePixelRatio !== requested.scale) throw new Error('Measured viewport or device scale differs from the requested tuple');
if (!Object.values(measured.fonts).every(Boolean) || !measured.motionStyle || JSON.stringify(measured.tuple) !== JSON.stringify(requested)) throw new Error('Deterministic renderer controls did not apply');
window.showInactive();
process.stdout.write(JSON.stringify({
  version: 2,
  ready: true,
  routeId: row.id,
  route: routeUrl('design-reference:', requested),
  tuple: requested,
  measured,
  reference: inventory.reference,
  network: { policy: requested.network, blockedRequests },
}) + '\n');

window.on('closed', () => app.quit());

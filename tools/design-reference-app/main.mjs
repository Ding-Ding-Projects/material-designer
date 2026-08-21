import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(here, '..', '..');
const desktopRequire = createRequire(resolve(repositoryRoot, 'design/apps/desktop/package.json'));
const { app, BrowserWindow, session } = desktopRequire('electron');

const screens = new Set(['home', 'projects', 'design-systems', 'automations', 'plugins', 'integrations', 'studio', 'library', 'settings', 'handoff']);
const arg = (name, fallback = null) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
};
const screen = arg('screen', 'home');
const state = arg('state', 'default');
const theme = arg('theme', 'light');
const width = Number(arg('width', '1440'));
const height = Number(arg('height', '900'));
const scale = Number(arg('scale', '1'));
const locale = arg('locale', 'en-US');
const fixture = arg('fixture', 'material-designer-m3-v1');
if (!screens.has(screen)) throw new Error(`Unknown design-reference screen: ${screen}`);
if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0 || !Number.isFinite(scale) || scale <= 0) throw new Error('Invalid deterministic capture tuple');

const referencePath = resolve(repositoryRoot, 'mockups/open-design-m3/Open Design M3.dc.html');
const packageRoot = (name) => dirname(desktopRequire.resolve(`${name}/package.json`));
const localScripts = new Map([
  ['https://unpkg.com/react@18.3.1/umd/react.production.min.js', join(packageRoot('react'), 'umd/react.production.min.js')],
  ['https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js', join(packageRoot('react-dom'), 'umd/react-dom.production.min.js')],
]);

function clickButtonByText(text) {
  const normalized = JSON.stringify(text);
  return `(() => { const target = [...document.querySelectorAll('button')].find((button) => button.textContent.trim() === ${normalized} || button.textContent.includes(${normalized})); if (!target) return false; target.click(); return true; })()`;
}

async function selectReferenceState(window) {
  if (theme === 'dark') await window.webContents.executeJavaScript(clickButtonByText('dark_mode'));
  const labels = {
    projects: 'Projects',
    'design-systems': 'Design systems',
    automations: 'Automations',
    plugins: 'Plugins',
    integrations: 'Integrations',
    library: 'Library',
  };
  if (labels[screen]) {
    const selected = await window.webContents.executeJavaScript(clickButtonByText(labels[screen]));
    if (!selected) throw new Error(`Reference control was not reachable for ${screen}`);
  } else if (screen === 'studio') {
    const selected = await window.webContents.executeJavaScript(clickButtonByText('Run'));
    if (!selected) throw new Error('Reference Studio route was not reachable');
  } else if (screen === 'settings' || screen === 'handoff') {
    const opened = await window.webContents.executeJavaScript(clickButtonByText('settings'));
    if (!opened) throw new Error('Reference Settings route was not reachable');
    if (screen === 'handoff') {
      const selected = await window.webContents.executeJavaScript(clickButtonByText('Handoff & tokens'));
      if (!selected) throw new Error('Reference Handoff route was not reachable');
    } else if (state !== 'appearance') {
      const selected = await window.webContents.executeJavaScript(clickButtonByText(state));
      if (!selected) throw new Error(`Reference Settings state was not reachable: ${state}`);
    }
  }
}

await app.whenReady();
session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
  const replacement = localScripts.get(details.url);
  if (replacement) return callback({ redirectURL: pathToFileURL(replacement).href });
  if (details.url.startsWith('file:') || details.url.startsWith('devtools:')) return callback({});
  return callback({ cancel: true });
});

const window = new BrowserWindow({
  width,
  height,
  show: false,
  useContentSize: true,
  backgroundColor: '#fff7f5',
  webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, zoomFactor: scale },
});
window.setMenuBarVisibility(false);
await window.loadFile(referencePath);
await selectReferenceState(window);
window.showInactive();
process.stdout.write(JSON.stringify({
  ready: true,
  route: `design-reference://${screen}`,
  tuple: { screen, state, theme, viewport: { width, height }, scale, locale, fixtureRevision: fixture },
  reference: referencePath,
}) + '\n');

window.on('closed', () => app.quit());

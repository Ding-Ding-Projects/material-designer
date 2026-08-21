import path from 'node:path';
import { exportPathCollisionKey, redactExportText } from '@open-design/contracts';

export const DESKTOP_SCAFFOLD_FILE_ROLES = {
  package: 'desktop/package.json',
  main: 'desktop/src/main.cjs',
  preload: 'desktop/src/preload.cjs',
  renderer: 'desktop/src/renderer.js',
  config: 'desktop/desktop-scaffold.json',
  readme: 'desktop/README.md',
} as const;

export type DesktopScaffoldFileRole = keyof typeof DESKTOP_SCAFFOLD_FILE_ROLES;

export interface DesktopScaffoldFile {
  path: string;
  role: DesktopScaffoldFileRole;
  body: string;
}

export interface DesktopScaffoldState {
  schemaVersion: 1;
  revision: number;
  framework: 'electron';
  platform: 'windows';
  mode: 'scaffold-only';
  sourceRoot: '..';
  entryFile: string;
  rendererFile: string;
  files: Record<DesktopScaffoldFileRole, string>;
  packagingTarget: 'squirrel-windows';
  codeSigning: 'disabled';
}

export interface DesktopScaffoldBuildInput {
  projectName: string;
  projectId?: string;
  entryFile: string;
  revision?: number;
}

export interface DesktopStarterFile {
  path: string;
  body: string;
}

const RELATIVE_ENTRY_RE = /^(?!\/)(?![A-Za-z]:)[^\\]*$/;

function assertRelativeEntryFile(entryFile: string): string {
  const value = String(entryFile ?? '').trim().replace(/\\/g, '/');
  if (!value || value.startsWith('/') || path.posix.isAbsolute(value) || value.includes('\0')) {
    throw new Error('desktop scaffold entryFile must be relative');
  }
  const normalized = path.posix.normalize(value);
  if (normalized === '.' || normalized.startsWith('../') || normalized.includes('/../') || !RELATIVE_ENTRY_RE.test(normalized)) {
    throw new Error('desktop scaffold entryFile escapes the project root');
  }
  if (!/\.html?$/i.test(normalized)) {
    throw new Error('desktop scaffold requires an HTML entry file');
  }
  return normalized;
}

function safePackageName(projectName: string): string {
  const value = String(projectName ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42);
  return value ? `${value}-desktop` : 'desktop-application';
}

function safeProjectLabel(projectName: string): string {
  const bounded = String(projectName ?? '').trim().replace(/[\r\n\u0000]/g, ' ').slice(0, 120) || 'Desktop application';
  return redactExportText(bounded, 'desktop-scaffold.projectName').value;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function desktopScaffoldState(
  input: Pick<DesktopScaffoldBuildInput, 'entryFile' | 'revision'>,
): DesktopScaffoldState {
  const entryFile = assertRelativeEntryFile(input.entryFile);
  const revision = Number.isInteger(input.revision) && (input.revision as number) > 0
    ? input.revision as number
    : 1;
  return {
    schemaVersion: 1,
    revision,
    framework: 'electron',
    platform: 'windows',
    mode: 'scaffold-only',
    sourceRoot: '..',
    entryFile,
    rendererFile: 'src/renderer.js',
    files: { ...DESKTOP_SCAFFOLD_FILE_ROLES },
    packagingTarget: 'squirrel-windows',
    codeSigning: 'disabled',
  };
}

export function createDesktopStarterFiles(projectName: string): DesktopStarterFile[] {
  const label = safeProjectLabel(projectName);
  const escaped = escapeHtml(label);
  return [
    {
      path: 'index.html',
      body: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escaped}</title>
    <link rel="stylesheet" href="styles.css">
  </head>
  <body>
    <main id="app" aria-labelledby="app-title">
      <p class="eyebrow">Desktop application starter</p>
      <h1 id="app-title">${escaped}</h1>
      <p class="lede">This local starter is ready for the selected agent to wire into a real desktop product.</p>
      <p class="status" role="status">Edit <code>index.html</code>, <code>styles.css</code>, and <code>app.js</code> to begin.</p>
    </main>
    <script src="app.js" defer></script>
  </body>
</html>
`,
    },
    {
      path: 'styles.css',
      body: `:root {
  color-scheme: light dark;
  font-family: system-ui, sans-serif;
  color: #1a1b20;
  background: #f8f7fb;
}

@media (prefers-color-scheme: dark) {
  :root { color: #f1eff7; background: #17171b; }
}

body { margin: 0; min-height: 100vh; display: grid; place-items: center; }
main { width: min(720px, calc(100% - 48px)); padding: 48px; border-radius: 28px; background: color-mix(in srgb, currentColor 8%, transparent); }
.eyebrow { font-size: 0.78rem; letter-spacing: 0.12em; text-transform: uppercase; opacity: 0.7; }
.lede { font-size: 1.2rem; line-height: 1.55; }
.status { line-height: 1.5; }
`,
    },
    {
      path: 'app.js',
      body: `'use strict';

// This starter intentionally has no network, filesystem, shell, credential, or
// arbitrary IPC behavior. Add product behavior here through the reviewed
// desktop bridge rather than reaching for Node APIs from the renderer.
document.documentElement.dataset.desktopStarterReady = 'true';
`,
    },
  ];
}

export function createDesktopScaffoldFiles(input: DesktopScaffoldBuildInput): DesktopScaffoldFile[] {
  const state = desktopScaffoldState(input);
  const label = safeProjectLabel(input.projectName);
  const config = {
    schema: 'open-design.desktop-scaffold.v1',
    ...state,
    projectName: label,
    designManifest: '../DESIGN-MANIFEST.json',
    designHandoff: '../DESIGN-HANDOFF.md',
  };
  const packageJson = {
    name: safePackageName(label),
    version: '0.0.0',
    private: true,
    type: 'commonjs',
    main: 'src/main.cjs',
    scripts: { start: 'electron .' },
    devDependencies: { electron: '41.3.0' },
  };
  const main = `'use strict';
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { fileURLToPath } = require('node:url');
const config = require('../desktop-scaffold.json');

function pathIsInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..' + path.sep) && !path.isAbsolute(relative));
}

function isAbsoluteLike(value) {
  return path.isAbsolute(value) || path.win32.isAbsolute(value) || /^[A-Za-z]:/.test(value) || value.startsWith('\\\\');
}

function isAllowedRendererUrl(rawUrl, sourceRoot) {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol === 'about:' || parsed.protocol === 'blob:' || parsed.protocol === 'data:') return true;
    if (parsed.protocol !== 'file:') return false;
    return pathIsInside(sourceRoot, fileURLToPath(parsed));
  } catch {
    return false;
  }
}

function resolveSource() {
  const desktopRoot = path.resolve(__dirname, '..');
  if (typeof config.sourceRoot !== 'string' || isAbsoluteLike(config.sourceRoot)) {
    throw new Error('sourceRoot must be relative');
  }
  const sourceRoot = path.resolve(desktopRoot, config.sourceRoot);
  if (typeof config.entryFile !== 'string' || isAbsoluteLike(config.entryFile)) {
    throw new Error('entryFile must be relative');
  }
  const entry = path.resolve(sourceRoot, config.entryFile);
  if (!pathIsInside(sourceRoot, entry) || entry === sourceRoot) {
    throw new Error('entryFile escapes the scaffold source root');
  }
  if (typeof config.rendererFile !== 'string' || isAbsoluteLike(config.rendererFile)) {
    throw new Error('rendererFile must be relative');
  }
  const rendererPath = path.resolve(desktopRoot, config.rendererFile);
  if (!pathIsInside(desktopRoot, rendererPath)) throw new Error('rendererFile escapes the desktop scaffold');
  return { entry, sourceRoot, rendererPath };
}

app.whenReady().then(() => {
  const { entry, sourceRoot, rendererPath } = resolveSource();
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
      partition: 'desktop-scaffold',
    },
  });
  window.webContents.session.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !isAllowedRendererUrl(details.url, sourceRoot) });
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  window.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedRendererUrl(url, sourceRoot)) event.preventDefault();
  });
  const rendererSource = fs.readFileSync(rendererPath, 'utf8');
  window.webContents.on('did-finish-load', () => {
    void window.webContents.executeJavaScript('(function(){' + rendererSource + '\\n})()', true).catch(() => {});
  });
  return window.loadFile(entry);
});

app.on('window-all-closed', () => app.quit());
`;
const preload = `'use strict';
const { contextBridge } = require('electron');
contextBridge.exposeInMainWorld('desktopShell', Object.freeze({
  scaffoldVersion: 1,
}));
`;
  const renderer = `'use strict';
// Browser-only bootstrap. It intentionally exposes no Node, shell, filesystem,
// environment, credential, or arbitrary IPC capability.
if (typeof window !== 'undefined' && window.desktopShell?.scaffoldVersion === 1) {
  document.documentElement.dataset.desktopScaffoldReady = 'true';
}
`;
  const readme = `# Desktop application scaffold

This folder is a source scaffold, not a finished or installable application. The project source remains at the archive root, with its machine-readable map in \`DESIGN-MANIFEST.json\` and implementation guidance in \`DESIGN-HANDOFF.md\`.

The scaffold loads the relative HTML entry in \`desktop-scaffold.json\`. Its main process uses Electron's context isolation and sandbox, disables Node integration and webviews, blocks network and out-of-root local-file requests, denies secondary windows, and exposes only a narrow read-only marker through preload. It has no filesystem, shell, environment, credential, or arbitrary IPC bridge.

The selected agent may now wire the real application into the source files. Keep the generated package identity separate from the user's project data and preserve the Squirrel.Windows packaging target. Code signing is intentionally disabled. This source scaffold does not produce an installer or release.
`;
  return [
    { path: DESKTOP_SCAFFOLD_FILE_ROLES.readme, role: 'readme', body: readme },
    { path: DESKTOP_SCAFFOLD_FILE_ROLES.package, role: 'package', body: `${JSON.stringify(packageJson, null, 2)}\n` },
    { path: DESKTOP_SCAFFOLD_FILE_ROLES.config, role: 'config', body: `${JSON.stringify(config, null, 2)}\n` },
    { path: DESKTOP_SCAFFOLD_FILE_ROLES.main, role: 'main', body: main },
    { path: DESKTOP_SCAFFOLD_FILE_ROLES.preload, role: 'preload', body: preload },
    { path: DESKTOP_SCAFFOLD_FILE_ROLES.renderer, role: 'renderer', body: renderer },
  ];
}

export function assertDesktopScaffoldCollisions(
  entries: readonly { relPath?: string; name?: string }[],
): void {
  const existingPaths = new Set(entries.map((entry) => exportPathCollisionKey(String(entry.relPath ?? entry.name ?? ''))).filter(Boolean));
  const generated = Object.values(DESKTOP_SCAFFOLD_FILE_ROLES);
  const collisions = generated.filter((name) => existingPaths.has(exportPathCollisionKey(name)));
  if (existingPaths.has(exportPathCollisionKey('desktop'))) collisions.unshift('desktop');
  if (collisions.length > 0) {
    const err = new Error(`desktop scaffold path already exists: ${collisions.join(', ')}`);
    (err as Error & { code?: string }).code = 'BAD_REQUEST';
    throw err;
  }
}

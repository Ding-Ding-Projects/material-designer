import { createHash, randomUUID } from 'node:crypto';
import { mkdir, lstat, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { exportPathCollisionKey, redactExportText } from '@open-design/contracts';

export const DESKTOP_SCAFFOLD_FILE_ROLES = {
  entry: 'index.html',
  styles: 'styles.css',
  script: 'app.js',
  package: 'desktop/package.json',
  main: 'desktop/src/main.cjs',
  preload: 'desktop/src/preload.cjs',
  renderer: 'desktop/src/renderer.js',
  config: 'desktop/desktop-scaffold.json',
  readme: 'desktop/README.md',
} as const;

export const DESKTOP_SCAFFOLD_CLAIM_FILENAME = '.desktop-scaffold-claim.json';

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

export type DesktopScaffoldClaimState = 'staging' | 'ready' | 'published';

export interface DesktopScaffoldClaim {
  schemaVersion: 1;
  projectId: string;
  ownerNonce: string;
  state: DesktopScaffoldClaimState;
  files: Record<string, string>;
  createdAt: number;
}

export const desktopScaffoldTestHooks = {
  beforeFileWrite: null as null | ((relativePath: string) => void | Promise<void>),
};

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

function stableDesktopPackageName(projectId: string | undefined): string {
  const value = String(projectId ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42);
  return value ? `material-designer-${value}` : 'material-designer-desktop';
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
    // Package identity is immutable project identity, never the renameable
    // display label. A renamed project must keep its installed data and update
    // channel instead of becoming a second application.
    name: stableDesktopPackageName(input.projectId),
    productName: label,
    applicationId: `com.materialdesigner.project.${stableDesktopPackageName(input.projectId)}`,
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

function canonicalPath(root, candidate, kind) {
  const lexicalRoot = path.resolve(root);
  const lexicalCandidate = path.resolve(candidate);
  if (!pathIsInside(lexicalRoot, lexicalCandidate)) {
    throw new Error(kind + ' escapes its canonical root');
  }
  const rootReal = fs.realpathSync.native(lexicalRoot);
  const candidateReal = fs.realpathSync.native(lexicalCandidate);
  if (!pathIsInside(rootReal, candidateReal)) {
    throw new Error(kind + ' leaves its canonical root');
  }
  // Reject symbolic links and Windows reparse points in every existing path
  // component. Comparing native realpaths catches junctions as well as links.
  let cursor = lexicalRoot;
  const relative = path.relative(lexicalRoot, lexicalCandidate);
  for (const segment of relative ? relative.split(path.sep) : []) {
    cursor = path.join(cursor, segment);
    const info = fs.lstatSync(cursor);
    if (info.isSymbolicLink()) throw new Error(kind + ' contains a symlink or reparse point');
    const cursorReal = fs.realpathSync.native(cursor);
    if (path.normalize(cursorReal).toLowerCase() !== path.normalize(cursor).toLowerCase()) {
      throw new Error(kind + ' contains a symlink or reparse point');
    }
  }
  return candidateReal;
}

function canonicalFile(root, candidate, kind) {
  const resolved = canonicalPath(root, candidate, kind);
  const info = fs.statSync(resolved);
  if (!info.isFile()) throw new Error(kind + ' must be a regular file');
  return resolved;
}

function isAllowedRendererUrl(rawUrl, sourceRoot) {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol === 'about:' || parsed.protocol === 'blob:' || parsed.protocol === 'data:') return true;
    if (parsed.protocol !== 'file:') return false;
    canonicalFile(sourceRoot, fileURLToPath(parsed), 'renderer request');
    return true;
  } catch {
    return false;
  }
}

function resolveSource() {
  const desktopRoot = path.resolve(__dirname, '..');
  if (typeof config.sourceRoot !== 'string' || isAbsoluteLike(config.sourceRoot)) {
    throw new Error('sourceRoot must be relative');
  }
  const sourceRoot = canonicalPath(desktopRoot, path.resolve(desktopRoot, config.sourceRoot), 'sourceRoot');
  if (typeof config.entryFile !== 'string' || isAbsoluteLike(config.entryFile)) {
    throw new Error('entryFile must be relative');
  }
  const entryCandidate = path.resolve(sourceRoot, config.entryFile);
  if (!pathIsInside(sourceRoot, entryCandidate) || entryCandidate === sourceRoot) {
    throw new Error('entryFile escapes the scaffold source root');
  }
  if (typeof config.rendererFile !== 'string' || isAbsoluteLike(config.rendererFile)) {
    throw new Error('rendererFile must be relative');
  }
  const entry = canonicalFile(sourceRoot, entryCandidate, 'entryFile');
  const rendererPath = canonicalFile(desktopRoot, path.resolve(desktopRoot, config.rendererFile), 'rendererFile');
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

This scaffold targets Windows only. Its eventual packaging target is Squirrel.Windows; code signing is disabled by project policy. It makes no macOS or Linux packaging claim.

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
  const collisions: string[] = generated.filter((name) => existingPaths.has(exportPathCollisionKey(name)));
  if (existingPaths.has(exportPathCollisionKey('desktop'))) collisions.unshift('desktop');
  if (collisions.length > 0) {
    const err = new Error(`desktop scaffold path already exists: ${collisions.join(', ')}`);
    (err as Error & { code?: string }).code = 'BAD_REQUEST';
    throw err;
  }
}

function desktopProjectIdIsSafe(projectId: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/.test(projectId);
}

function sha256(body: string | Buffer): string {
  const bytes = typeof body === 'string' ? Buffer.from(body, 'utf8') : body;
  return createHash('sha256').update(bytes).digest('hex');
}

function normalizeGeneratedPath(value: string): string {
  const normalized = value.replace(/\\/g, '/');
  if (!normalized || normalized.startsWith('/') || normalized.includes('\0')) {
    throw new Error('desktop scaffold generated path must be relative');
  }
  const safe = path.posix.normalize(normalized);
  if (safe === '.' || safe.startsWith('../') || safe.includes('/../')) {
    throw new Error('desktop scaffold generated path escapes the project root');
  }
  return safe;
}

function pathIsInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

async function assertRealPathComponents(root: string, target: string): Promise<void> {
  const rootReal = await realpath(root);
  const lexicalRoot = path.resolve(root);
  const lexicalTarget = path.resolve(target);
  if (!pathIsInside(lexicalRoot, lexicalTarget)) {
    throw new Error('desktop scaffold path escapes its claimed project root');
  }
  let cursor = lexicalRoot;
  const relative = path.relative(lexicalRoot, lexicalTarget);
  for (const segment of relative ? relative.split(path.sep) : []) {
    cursor = path.join(cursor, segment);
    let info;
    try {
      info = await lstat(cursor);
    } catch (error) {
      if ((error as { code?: unknown })?.code === 'ENOENT') continue;
      throw error;
    }
    if (info.isSymbolicLink()) throw new Error('desktop scaffold path contains a symlink or reparse point');
    const real = await realpath(cursor);
    if (path.normalize(real).toLowerCase() !== path.normalize(cursor).toLowerCase()) {
      throw new Error('desktop scaffold path contains a symlink or reparse point');
    }
  }
  const targetRelative = path.relative(rootReal, await realpath(path.dirname(lexicalTarget)).catch(() => path.dirname(lexicalTarget)));
  if (targetRelative.startsWith('..') || path.isAbsolute(targetRelative)) {
    throw new Error('desktop scaffold path leaves its claimed project root');
  }
}

export async function claimDesktopProjectDirectory(
  projectsRoot: string,
  projectId: string,
): Promise<{ projectDir: string; ownerNonce: string }> {
  if (!desktopProjectIdIsSafe(projectId)) throw new Error('invalid desktop project id');
  await mkdir(projectsRoot, { recursive: true });
  const root = await realpath(projectsRoot);
  const projectDir = path.join(root, projectId);
  try {
    await mkdir(projectDir, { recursive: false });
  } catch (error) {
    if ((error as { code?: unknown })?.code === 'EEXIST') {
      const collision = new Error('desktop project directory already exists');
      collision.code = 'EEXIST';
      throw collision;
    }
    throw error;
  }
  const info = await lstat(projectDir);
  if (!info.isDirectory() || info.isSymbolicLink()) {
    await rm(projectDir, { recursive: true, force: true }).catch(() => {});
    throw new Error('desktop project directory must be a real directory');
  }
  await assertRealPathComponents(root, projectDir);
  return { projectDir, ownerNonce: randomUUID() };
}

function allDesktopGeneratedFiles(input: DesktopScaffoldBuildInput): DesktopScaffoldFile[] {
  const roleForStarterPath = (filePath: string): DesktopScaffoldFileRole => {
    if (filePath === 'index.html') return 'entry';
    if (filePath === 'styles.css') return 'styles';
    if (filePath === 'app.js') return 'script';
    throw new Error(`unknown desktop starter file: ${filePath}`);
  };
  const starters = createDesktopStarterFiles(input.projectName).map((file) => ({
    ...file,
    role: roleForStarterPath(file.path),
  }));
  return [...starters, ...createDesktopScaffoldFiles(input)];
}

function validateDesktopGeneratedFiles(
  files: readonly DesktopScaffoldFile[],
  projectId: string,
): Record<string, string> {
  const expected = Object.entries(DESKTOP_SCAFFOLD_FILE_ROLES);
  const byPath = new Map(files.map((file) => [normalizeGeneratedPath(file.path), file]));
  if (byPath.size !== expected.length) throw new Error('desktop scaffold generated file set is incomplete');
  const hashes: Record<string, string> = {};
  for (const [, expectedPath] of expected) {
    const file = byPath.get(expectedPath);
    if (!file || file.body.length === 0) throw new Error(`desktop scaffold file is empty: ${expectedPath}`);
    hashes[expectedPath] = sha256(file.body);
  }
  const entry = byPath.get('index.html')?.body ?? '';
  if (!/^\s*<!doctype html>/i.test(entry)) throw new Error('desktop scaffold entry must be HTML');
  const configFile = byPath.get(DESKTOP_SCAFFOLD_FILE_ROLES.config);
  const config = configFile ? JSON.parse(configFile.body) : null;
  if (
    !config || config.schema !== 'open-design.desktop-scaffold.v1'
    || config.projectId !== projectId
    || config.platform !== 'windows'
    || config.packagingTarget !== 'squirrel-windows'
    || config.codeSigning !== 'disabled'
    || !config.files
    || Object.keys(config.files).length !== expected.length
  ) {
    throw new Error('desktop scaffold metadata is incomplete');
  }
  const packageFile = byPath.get(DESKTOP_SCAFFOLD_FILE_ROLES.package);
  const packageJson = packageFile ? JSON.parse(packageFile.body) : null;
  if (!packageJson || packageJson.name !== stableDesktopPackageName(projectId) || !packageJson.productName) {
    throw new Error('desktop scaffold package identity is not project-stable');
  }
  const main = byPath.get(DESKTOP_SCAFFOLD_FILE_ROLES.main)?.body ?? '';
  for (const marker of [
    'contextIsolation: true',
    'nodeIntegration: false',
    'sandbox: true',
    'webviewTag: false',
    'canonicalFile',
    'realpathSync.native',
    'setWindowOpenHandler',
    'will-attach-webview',
  ]) {
    if (!main.includes(marker)) throw new Error(`desktop scaffold security marker missing: ${marker}`);
  }
  return hashes;
}

async function writeClaimMarker(
  projectDir: string,
  claim: DesktopScaffoldClaim,
): Promise<void> {
  const marker = path.join(projectDir, DESKTOP_SCAFFOLD_CLAIM_FILENAME);
  // The marker is the recovery boundary. Keeping a valid staging marker while
  // this metadata is refreshed means a crash leaves a recoverable claim rather
  // than an unowned directory. The generated bytes were independently read
  // and hashed before this metadata update.
  await writeFile(marker, `${JSON.stringify(claim, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'w',
  });
}

export async function materializeDesktopScaffoldProject(input: {
  projectDir: string;
  projectId: string;
  projectName: string;
  entryFile?: string;
  revision?: number;
  ownerNonce?: string;
}): Promise<{ ownerNonce: string; claim: DesktopScaffoldClaim }> {
  if (!desktopProjectIdIsSafe(input.projectId)) throw new Error('invalid desktop project id');
  const projectRoot = await realpath(input.projectDir);
  const info = await lstat(projectRoot);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('desktop project root must be a real directory');
  await assertRealPathComponents(projectRoot, projectRoot);
  const existing = await readdir(projectRoot);
  if (existing.length > 0) throw new Error('desktop project root must be empty before scaffold creation');
  const ownerNonce = input.ownerNonce ?? randomUUID();
  const files = allDesktopGeneratedFiles({
    projectName: input.projectName,
    projectId: input.projectId,
    entryFile: input.entryFile ?? 'index.html',
    revision: input.revision ?? 1,
  });
  const claim: DesktopScaffoldClaim = {
    schemaVersion: 1,
    projectId: input.projectId,
    ownerNonce,
    state: 'staging',
    files: {},
    createdAt: Date.now(),
  };
  const marker = path.join(projectRoot, DESKTOP_SCAFFOLD_CLAIM_FILENAME);
  await writeFile(marker, `${JSON.stringify(claim, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  try {
    const hashes = validateDesktopGeneratedFiles(files, input.projectId);
    for (const file of files) {
      const safePath = normalizeGeneratedPath(file.path);
      await desktopScaffoldTestHooks.beforeFileWrite?.(safePath);
      const target = path.resolve(projectRoot, safePath);
      await assertRealPathComponents(projectRoot, path.dirname(target));
      await mkdir(path.dirname(target), { recursive: true });
      try {
        await lstat(target);
        const collision = new Error(`desktop scaffold path appeared during creation: ${safePath}`);
        collision.code = 'EEXIST';
        throw collision;
      } catch (error) {
        if ((error as { code?: unknown })?.code !== 'ENOENT') throw error;
      }
      const temporary = `${target}.${ownerNonce}.tmp`;
      await writeFile(temporary, file.body, { encoding: 'utf8', flag: 'wx' });
      await rename(temporary, target);
      await assertRealPathComponents(projectRoot, target);
      const actual = await readFile(target, 'utf8');
      if (sha256(actual) !== hashes[safePath]) throw new Error(`desktop scaffold validation changed: ${safePath}`);
    }
    const ready: DesktopScaffoldClaim = { ...claim, state: 'ready', files: hashes };
    await writeClaimMarker(projectRoot, ready);
    return { ownerNonce, claim: ready };
  } catch (error) {
    await removeDesktopScaffoldClaim(projectRoot, ownerNonce);
    throw error;
  }
}

export async function markDesktopScaffoldPublished(
  projectDir: string,
  ownerNonce: string,
): Promise<DesktopScaffoldClaim> {
  const marker = path.join(await realpath(projectDir), DESKTOP_SCAFFOLD_CLAIM_FILENAME);
  const claim = JSON.parse(await readFile(marker, 'utf8')) as DesktopScaffoldClaim;
  if (claim.schemaVersion !== 1 || claim.ownerNonce !== ownerNonce) throw new Error('desktop scaffold claim mismatch');
  const published = { ...claim, state: 'published' as const };
  await writeFile(marker, `${JSON.stringify(published, null, 2)}\n`, { encoding: 'utf8', flag: 'w' });
  return published;
}

export async function removeDesktopScaffoldClaim(
  projectDir: string,
  ownerNonce: string,
): Promise<boolean> {
  let root: string;
  try {
    root = await realpath(projectDir);
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
  const marker = path.join(root, DESKTOP_SCAFFOLD_CLAIM_FILENAME);
  let claim: DesktopScaffoldClaim;
  try {
    claim = JSON.parse(await readFile(marker, 'utf8')) as DesktopScaffoldClaim;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
  if (claim.schemaVersion !== 1 || claim.ownerNonce !== ownerNonce) return false;
  await rm(root, { recursive: true, force: true });
  return true;
}

export async function reconcileDesktopScaffoldClaims(
  projectsRoot: string,
  projectExists: (projectId: string) => boolean,
): Promise<{ removed: string[]; finalized: string[] }> {
  const root = await realpath(projectsRoot);
  const removed: string[] = [];
  const finalized: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const projectDir = path.join(root, entry.name);
    const marker = path.join(projectDir, DESKTOP_SCAFFOLD_CLAIM_FILENAME);
    let claim: DesktopScaffoldClaim;
    try {
      claim = JSON.parse(await readFile(marker, 'utf8')) as DesktopScaffoldClaim;
    } catch {
      continue;
    }
    if (
      claim.schemaVersion !== 1
      || claim.projectId !== entry.name
      || typeof claim.ownerNonce !== 'string'
      || !['staging', 'ready', 'published'].includes(claim.state)
    ) continue;
    if (projectExists(claim.projectId)) {
      if (claim.state !== 'published') {
        await markDesktopScaffoldPublished(projectDir, claim.ownerNonce).catch(() => {});
        finalized.push(claim.projectId);
      }
    } else if (await removeDesktopScaffoldClaim(projectDir, claim.ownerNonce)) {
      removed.push(claim.projectId);
    }
  }
  return { removed, finalized };
}

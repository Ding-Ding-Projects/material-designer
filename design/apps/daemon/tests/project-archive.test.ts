import { mkdtempSync, rmSync } from 'node:fs';
import { mkdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  buildProjectArchive,
  createBatchArchiveStream,
  createProjectArchiveStream,
} from '../src/projects.js';

async function collectStream(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    stream.once('error', reject);
    stream.once('end', () => resolve(Buffer.concat(chunks)));
  });
}

describe('buildProjectArchive', () => {
  let projectsRoot = '';
  const projectId = 'proj-archive-test';

  beforeEach(async () => {
    projectsRoot = mkdtempSync(path.join(tmpdir(), 'od-archive-'));
    const dir = path.join(projectsRoot, projectId);
    await mkdir(path.join(dir, 'ui-design', 'src'), { recursive: true });
    await mkdir(path.join(dir, 'ui-design', 'frames'), { recursive: true });
    await writeFile(path.join(dir, 'ui-design', 'index.html'), '<!doctype html>hi');
    await writeFile(path.join(dir, 'ui-design', 'src', 'app.css'), 'body{}');
    await writeFile(path.join(dir, 'ui-design', 'frames', 'phone.html'), '<frame/>');
    await writeFile(path.join(dir, 'ui-design', 'index.html.artifact.json'), '{}');
    await writeFile(path.join(dir, 'ui-design', '.hidden'), 'secret');
    await writeFile(path.join(dir, 'README.md'), '# top-level readme');
  });

  afterEach(() => {
    if (projectsRoot) rmSync(projectsRoot, { recursive: true, force: true });
  });

  it('zips the requested subdirectory tree', async () => {
    const { buffer, baseName } = await buildProjectArchive(projectsRoot, projectId, 'ui-design');
    expect(baseName).toBe('ui-design');
    const zip = await JSZip.loadAsync(buffer);
    const fileEntries = Object.values(zip.files)
      .filter((entry) => !entry.dir)
      .map((entry) => entry.name)
      .sort();
    expect(fileEntries).toEqual(['DESIGN-HANDOFF.md', 'DESIGN-MANIFEST.json', 'frames/phone.html', 'index.html', 'src/app.css']);
  });

  it('exposes a consumable stream with the same archive contents', async () => {
    const { stream, baseName } = await createProjectArchiveStream(
      projectsRoot,
      projectId,
      'ui-design',
    );
    expect(baseName).toBe('ui-design');
    const zip = await JSZip.loadAsync(await collectStream(stream));
    const fileEntries = Object.values(zip.files)
      .filter((entry) => !entry.dir)
      .map((entry) => entry.name)
      .sort();
    expect(fileEntries).toEqual([
      'DESIGN-HANDOFF.md',
      'DESIGN-MANIFEST.json',
      'frames/phone.html',
      'index.html',
      'src/app.css',
    ]);
  });

  it('streams a validated batch without changing its entry names', async () => {
    const { stream } = await createBatchArchiveStream(
      projectsRoot,
      projectId,
      ['ui-design/index.html', 'ui-design/src/app.css'],
    );
    const zip = await JSZip.loadAsync(await collectStream(stream));
    expect(
      Object.values(zip.files)
        .filter((entry) => !entry.dir)
        .map((entry) => entry.name)
        .sort(),
    ).toEqual(['ui-design/index.html', 'ui-design/src/app.css']);
  });

  it('rejects an invalid batch before returning a download stream', async () => {
    await expect(
      createBatchArchiveStream(
        projectsRoot,
        projectId,
        ['ui-design/index.html', 'missing.html'],
      ),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('zips the whole project when no root is given', async () => {
    const { buffer, baseName } = await buildProjectArchive(projectsRoot, projectId, '');
    expect(baseName).toBe('');
    const zip = await JSZip.loadAsync(buffer);
    const fileEntries = Object.values(zip.files)
      .filter((entry) => !entry.dir)
      .map((entry) => entry.name);
    expect(fileEntries).toContain('DESIGN-HANDOFF.md');
    expect(fileEntries).toContain('DESIGN-MANIFEST.json');
    expect(fileEntries).toContain('README.md');
    expect(fileEntries).toContain('ui-design/index.html');
    expect(fileEntries).toContain('ui-design/src/app.css');
    // dotfiles and .artifact.json sidecars are filtered, matching listFiles
    expect(fileEntries.find((n) => n.includes('.hidden'))).toBeUndefined();
    expect(fileEntries.find((n) => n.endsWith('.artifact.json'))).toBeUndefined();
  });

  it('adds a secure desktop application scaffold without replacing the project tree', async () => {
    const { buffer } = await buildProjectArchive(
      projectsRoot,
      projectId,
      '',
      undefined,
      { target: 'desktop-scaffold' },
    );
    const zip = await JSZip.loadAsync(buffer);
    const generated = [
      'desktop/README.md',
      'desktop/package.json',
      'desktop/desktop-scaffold.json',
      'desktop/src/main.cjs',
      'desktop/src/preload.cjs',
      'desktop/src/renderer.js',
    ];
    for (const name of generated) expect(zip.file(name)).not.toBeNull();
    expect(await zip.file('ui-design/index.html')?.async('string')).toBe('<!doctype html>hi');
    const manifest = JSON.parse(
      await zip.file('desktop/desktop-scaffold.json')?.async('string') || '{}',
    );
    expect(manifest).toMatchObject({
      schema: 'open-design.desktop-scaffold.v1',
      mode: 'scaffold-only',
      entryFile: 'ui-design/index.html',
      packagingTarget: 'squirrel-windows',
      codeSigning: 'disabled',
    });
    const main = await zip.file('desktop/src/main.cjs')?.async('string') || '';
    expect(main).toContain('contextIsolation: true');
    expect(main).toContain('nodeIntegration: false');
    expect(main).toContain('sandbox: true');
    expect(main).toContain("partition: 'desktop-scaffold'");
    expect(main).toContain('webRequest.onBeforeRequest');
    expect(main).toContain('setWindowOpenHandler');
    expect(main).toContain('will-attach-webview');
    expect(main).toContain("parsed.protocol !== 'file:'");
    expect(main).toContain('pathIsInside(sourceRoot, fileURLToPath(parsed))');
    expect(await zip.file('desktop/src/renderer.js')?.async('string')).toContain('desktopScaffoldReady');
    expect(main).not.toMatch(/[A-Z]:\\|\/Users\//);
  });

  it('refuses to overwrite a project-owned desktop scaffold path', async () => {
    const collision = path.join(projectsRoot, projectId, 'desktop');
    await mkdir(collision, { recursive: true });
    await writeFile(path.join(collision, 'package.json'), '{}');
    await expect(buildProjectArchive(
      projectsRoot,
      projectId,
      '',
      undefined,
      { target: 'desktop-scaffold' },
    )).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('refuses case-insensitive desktop scaffold collisions on Windows extraction', async () => {
    const collision = path.join(projectsRoot, projectId, 'Desktop');
    await mkdir(collision, { recursive: true });
    await writeFile(path.join(collision, 'PACKAGE.JSON'), '{}');
    await expect(buildProjectArchive(
      projectsRoot,
      projectId,
      '',
      undefined,
      { target: 'desktop-scaffold' },
    )).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('refuses a desktop scaffold when the project has no loadable HTML entry', async () => {
    const dir = path.join(projectsRoot, projectId, 'source-only');
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'app.tsx'), 'export const App = () => null;');
    await expect(buildProjectArchive(
      projectsRoot,
      projectId,
      'source-only',
      undefined,
      { target: 'desktop-scaffold' },
    )).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('does not follow directory symlinks outside the project tree', async () => {
    const outside = path.join(projectsRoot, 'outside-archive-data');
    await mkdir(outside, { recursive: true });
    await writeFile(path.join(outside, 'private.txt'), 'must-not-leave-the-project');
    await symlink(
      outside,
      path.join(projectsRoot, projectId, 'linked-outside'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );

    const { buffer } = await buildProjectArchive(projectsRoot, projectId, '');
    const zip = await JSZip.loadAsync(buffer);
    expect(Object.keys(zip.files).some((name) => name.includes('private.txt'))).toBe(false);
  });

  it('rejects path traversal in root', async () => {
    await expect(buildProjectArchive(projectsRoot, projectId, '../foo')).rejects.toThrow();
  });

  it('throws when the root directory has no archivable files', async () => {
    const dir = path.join(projectsRoot, projectId, 'empty');
    await mkdir(dir, { recursive: true });
    await expect(buildProjectArchive(projectsRoot, projectId, 'empty')).rejects.toThrow(/empty/);
  });

  it('throws ENOENT with "does not exist" when the archive root is missing', async () => {
    // Distinct from the "empty directory" case so callers — and on-call
    // engineers reading logs — can tell a deleted project from a project
    // that simply has no archivable files.
    await expect(buildProjectArchive(projectsRoot, projectId, 'no-such-dir')).rejects.toMatchObject(
      { code: 'ENOENT', message: expect.stringMatching(/does not exist/) },
    );
  });

  it('preserves non-ASCII characters in baseName', async () => {
    // Mirrors the server's Content-Disposition encoding: the daemon hands
    // baseName straight into RFC 5987 filename* via encodeURIComponent, so
    // multi-byte UTF-8 characters must survive untouched here.
    const dirName = 'café-design';
    const dir = path.join(projectsRoot, projectId, dirName);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'index.html'), '<!doctype html>hi');
    const { baseName, buffer } = await buildProjectArchive(projectsRoot, projectId, dirName);
    expect(baseName).toBe(dirName);
    const zip = await JSZip.loadAsync(buffer);
    expect(Object.keys(zip.files)).toContain('index.html');
  });

  it('adds an AI-coding handoff guide to project archives', async () => {
    const { buffer } = await buildProjectArchive(projectsRoot, projectId, 'ui-design');
    const zip = await JSZip.loadAsync(buffer);
    const handoff = await zip.file('DESIGN-HANDOFF.md')?.async('string');
    expect(handoff).toContain('implementation handoff');
    expect(handoff).toContain('Mobile compact: 360×800');
    expect(handoff).toContain('Tablet portrait: 820×1180');
    expect(handoff).toContain('Wide desktop: 1920×1080');
    expect(handoff).toContain('Design fidelity contract');
    expect(handoff).toContain('CJX-ready UX contract');
    expect(handoff).toContain('DESIGN-MANIFEST.json');
    expect(handoff).toContain('in-app modules/components');
    expect(handoff).toContain('OS widgets are home-screen/lock-screen/quick-access surfaces');
    expect(handoff).toContain('Color and brand contract');
    expect(handoff).toContain('Do not introduce warm beige / cream / peach / pink / orange-brown background washes');
    expect(handoff).toContain('Build product screens and domain-specific in-app modules');
  });

  it('adds a machine-readable design manifest to project archives', async () => {
    const { buffer } = await buildProjectArchive(projectsRoot, projectId, 'ui-design');
    const zip = await JSZip.loadAsync(buffer);
    const manifestRaw = await zip.file('DESIGN-MANIFEST.json')?.async('string');
    const manifest = JSON.parse(manifestRaw || '{}');
    expect(manifest.schema).toBe('open-design.design-manifest.v1');
    expect(manifest.entryFile).toBe('index.html');
    expect(manifest.sourceFiles.css).toEqual(['src/app.css']);
    expect(manifest.sourceFiles.html).toEqual(['frames/phone.html', 'index.html']);
    expect(manifest.screens.map((screen: { file: string }) => screen.file)).toEqual(['index.html']);
    expect(manifest.appModules.join(' ')).toContain('domain-specific in-app modules');
    expect(manifest.osWidgets.join(' ')).toContain('home-screen');
    expect(manifest.responsiveViewports).toContainEqual({
      name: 'tablet-portrait',
      width: 820,
      height: 1180,
      category: 'tablet',
      mustAvoidHorizontalScroll: true,
    });
  });

  it('does not classify plain home.html as a landing page in daemon archive manifests', async () => {
    const dir = path.join(projectsRoot, projectId, 'product-app');
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'home.html'), '<!doctype html>home');
    await writeFile(path.join(dir, 'dashboard.html'), '<!doctype html>dashboard');
    await writeFile(path.join(dir, 'marketing.html'), '<!doctype html>marketing');

    const { buffer } = await buildProjectArchive(projectsRoot, projectId, 'product-app');
    const zip = await JSZip.loadAsync(buffer);
    const manifestRaw = await zip.file('DESIGN-MANIFEST.json')?.async('string');
    const manifest = JSON.parse(manifestRaw || '{}');
    const screens = new Map(manifest.screens.map((screen: { file: string; role: string }) => [screen.file, screen.role]));

    expect(screens.get('home.html')).not.toBe('landing-page');
    expect(screens.get('marketing.html')).toBe('landing-page');
    expect(screens.get('dashboard.html')).toBe('product-screen');
  });

  it('keeps frame wrapper HTML out of daemon archive manifest screens', async () => {
    const dir = path.join(projectsRoot, projectId, 'framed-app');
    await mkdir(path.join(dir, 'frames'), { recursive: true });
    await writeFile(path.join(dir, 'index.html'), '<!doctype html>app');
    await writeFile(path.join(dir, 'frames', 'iphone-15-pro.html'), '<!doctype html>frame');
    await writeFile(path.join(dir, 'browser-chrome.html'), '<!doctype html>browser frame');

    const { buffer } = await buildProjectArchive(projectsRoot, projectId, 'framed-app');
    const zip = await JSZip.loadAsync(buffer);
    const manifestRaw = await zip.file('DESIGN-MANIFEST.json')?.async('string');
    const manifest = JSON.parse(manifestRaw || '{}');

    expect(manifest.sourceFiles.html).toEqual(['browser-chrome.html', 'frames/iphone-15-pro.html', 'index.html']);
    expect(manifest.screens.map((screen: { file: string }) => screen.file)).toEqual(['index.html']);
  });

  it('fails closed rather than trusting a project-owned canonical handoff', async () => {
    const dir = path.join(projectsRoot, projectId, 'custom-handoff');
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'index.html'), '<!doctype html>hi');
    await writeFile(path.join(dir, 'DESIGN-HANDOFF.md'), '# custom handoff');
    await expect(buildProjectArchive(projectsRoot, projectId, 'custom-handoff'))
      .rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('fails closed rather than trusting a project-owned canonical manifest', async () => {
    const dir = path.join(projectsRoot, projectId, 'custom-manifest');
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'index.html'), '<!doctype html>hi');
    await writeFile(path.join(dir, 'design-manifest.json'), '{"stale":true}');
    await expect(buildProjectArchive(projectsRoot, projectId, 'custom-manifest'))
      .rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('keeps phone.html and iphone-upgrade.html as real screens when outside frames/ directory', async () => {
    // phone.html as a carrier storefront, iphone-upgrade.html as a product
    // surface — they must not be silently dropped from manifest screens.
    const dir = path.join(projectsRoot, projectId, 'carrier-app');
    await mkdir(path.join(dir, 'frames'), { recursive: true });
    await writeFile(path.join(dir, 'phone.html'), '<!doctype html>phone storefront');
    await writeFile(path.join(dir, 'iphone-upgrade.html'), '<!doctype html>upgrade screen');
    await writeFile(path.join(dir, 'frames', 'device-shell.html'), '<!doctype html>frame');

    const { buffer } = await buildProjectArchive(projectsRoot, projectId, 'carrier-app');
    const zip = await JSZip.loadAsync(buffer);
    const manifestRaw = await zip.file('DESIGN-MANIFEST.json')?.async('string');
    const manifest = JSON.parse(manifestRaw || '{}');

    const screenFiles = manifest.screens.map((screen: { file: string }) => screen.file);
    expect(screenFiles).toContain('phone.html');
    expect(screenFiles).toContain('iphone-upgrade.html');
    // frame wrapper inside frames/ is still excluded from screens
    expect(screenFiles).not.toContain('frames/device-shell.html');
    // but still present in sourceFiles.html
    expect(manifest.sourceFiles.html).toContain('frames/device-shell.html');
  });
});

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../src/main/runtime.ts'),
  'utf8',
);

describe('desktop folder picker source contract', () => {
  function handlerSource(channel: string): string {
    const marker = `ipcMain.handle(\n    "${channel}",`;
    const start = source.indexOf(marker);
    expect(start, channel).toBeGreaterThanOrEqual(0);
    const nextHandler = source.indexOf('\n  ipcMain.handle(', start + marker.length);
    return source.slice(start, nextHandler >= 0 ? nextHandler : source.length);
  }

  function pickerFunctionSource(): string {
    const start = source.indexOf('async function showDirectoryPickerForSender(');
    const end = source.indexOf('export async function createDesktopRuntime(', start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    return source.slice(start, end);
  }

  function expectAwaitGuards(body: string, label: string): void {
    const awaitPositions = [...body.matchAll(/\bawait\b/g)].map((match) => match.index ?? -1);
    const guardPositions = [...body.matchAll(/requireFolderPickerSender\(event\);/g)]
      .map((match) => match.index ?? -1);
    expect(awaitPositions.length, `${label} await count`).toBeGreaterThan(0);
    expect(guardPositions.length, `${label} guard count`).toBeGreaterThanOrEqual(awaitPositions.length);
    for (const awaitPosition of awaitPositions) {
      const guardPosition = guardPositions.find((candidate) => candidate > awaitPosition);
      expect(guardPosition, `${label} await at ${awaitPosition}`).toBeDefined();
      const nextAwait = awaitPositions.find((candidate) => candidate > awaitPosition);
      expect(nextAwait == null || (guardPosition as number) < nextAwait, `${label} guard ordering`).toBe(true);
    }
  }

  it('keeps the native Explorer dialog on the originating parent and restores parent focus', () => {
    const picker = pickerFunctionSource();
    expect(picker).toMatch(/const parent = BrowserWindow\.fromWebContents\(sender\);/);
    expect(picker).not.toContain('BrowserWindow.getFocusedWindow()');
    expect(source).toMatch(/properties: \["openDirectory", "createDirectory", "dontAddToRecent"\]/);
    expect(source).toMatch(/dialog\.showOpenDialog\(parent, pickerOptions\)/);
    expect(picker).toMatch(/result = await dialog\.showOpenDialog\(parent, pickerOptions\);/);
    expect(picker).toMatch(/assertOwnerStillLive\(\);/);
    expect(picker).toMatch(/parent\.focus\(\);/);
    expect(picker).toMatch(/destroyed \|\| current !== parent/);
  });

  it('rejects folder IPC calls from every renderer except the main window frame', () => {
    for (const channel of [
      'dialog:pick-and-import',
      'dialog:pick-and-replace-working-dir',
    ]) {
      const body = handlerSource(channel);
      expect(body).toMatch(/async \(event[^\n]*\) => \{\s*requireFolderPickerSender\(event\);/);
    }
    const homeBodyStart = source.indexOf('ipcMain.handle("dialog:pick-working-dir"');
    expect(homeBodyStart).toBeGreaterThanOrEqual(0);
    const homeBody = source.slice(homeBodyStart, source.indexOf('\n  // shell.openPath', homeBodyStart));
    expect(homeBody).toMatch(/async \(event[^\n]*\) => \{\s*requireFolderPickerSender\(event\);/);
    expect(source).toMatch(
      /event\.sender !== owner\.webContents\s*\|\|\s*event\.senderFrame !== owner\.webContents\.mainFrame/,
    );
    const windowStart = source.indexOf('const window = new BrowserWindow({');
    const captureFilterStart = source.indexOf('const captureNetworkFilter', windowStart);
    expect(windowStart).toBeGreaterThanOrEqual(0);
    expect(captureFilterStart).toBeGreaterThan(windowStart);
    expect(source.slice(windowStart, captureFilterStart)).toContain('folderPickerMainWindow = window;');
    expect(source.slice(source.indexOf('ipcMain.removeHandler("dialog:pick-folder"'), windowStart))
      .toContain('let folderPickerMainWindow: BrowserWindow | null = null;');
  });

  it('never substitutes a focused window when the initiating owner disappears', () => {
    const picker = pickerFunctionSource();
    expect(picker).not.toContain('BrowserWindow.getFocusedWindow()');
    expect(picker).toMatch(/if \(parent == null \|\| parent\.isDestroyed\(\)\)/);
    expect(picker).toMatch(/throw new Error\("folder picker owner window is unavailable"\)/);
    expect(picker).toMatch(/throw new Error\("folder picker owner window was destroyed"\)/);
  });

  it('keeps paths and credentials out of folder-picker logging', () => {
    const folderHandlers = [
      handlerSource('dialog:pick-and-import'),
      handlerSource('dialog:pick-and-replace-working-dir'),
      source.slice(
        source.indexOf('ipcMain.handle("dialog:pick-working-dir"'),
        source.indexOf('\n  // shell.openPath', source.indexOf('ipcMain.handle("dialog:pick-working-dir"')),
      ),
    ].join('\n');
    expect(folderHandlers).not.toMatch(/console\.(?:log|info|warn|error)\s*\(/);
    expect(folderHandlers).not.toMatch(
      /console\.(?:log|info|warn|error)[^\n]*(?:desktopAuthSecret|token|baseDir|filePaths)/,
    );
  });

  it('keeps cancellation separate from empty-path and daemon failure results', () => {
    expect(source).toMatch(/if \(result\.canceled \|\| result\.filePaths\.length === 0\) \{\s*return \{ ok: false, canceled: true \};/s);
    expect(source).toMatch(/if \(baseDir\.length === 0\) \{\s*return \{ ok: false, reason: "picker returned an empty path" \};/s);
    expect(source).toMatch(/const response = await pickAndImportFolder\(\{/);
    expect(source).toMatch(/const response = await pickAndReplaceWorkingDir\(\{/);
  });

  it('revalidates the captured owner after each folder-operation await', () => {
    for (const [channel, minimumGuards] of [
      ['dialog:pick-and-import', 5],
      ['dialog:pick-and-replace-working-dir', 5],
    ] as const) {
      const body = handlerSource(channel);
      expect((body.match(/requireFolderPickerSender\(event\);/g) ?? []).length, channel)
        .toBeGreaterThanOrEqual(minimumGuards);
      expectAwaitGuards(body, channel);
    }
    const homeStart = source.indexOf('ipcMain.handle("dialog:pick-working-dir"');
    const homeEnd = source.indexOf('\n  // shell.openPath', homeStart);
    expect(homeStart).toBeGreaterThanOrEqual(0);
    expect(homeEnd).toBeGreaterThan(homeStart);
    const homeBody = source.slice(homeStart, homeEnd);
    expect((homeBody.match(/requireFolderPickerSender\(event\);/g) ?? []).length)
      .toBeGreaterThanOrEqual(3);
    const picker = pickerFunctionSource();
    expect(picker).toMatch(/result = await dialog\.showOpenDialog\(parent, pickerOptions\);\s*assertOwnerStillLive\(\);/);
    expect(picker).toMatch(/if \(destroyed \|\| current !== parent\)/);
  });

  it('does not retain the removed tree-only dialog identifier in the desktop route', () => {
    expect(source).not.toMatch(/FolderBrowserDialog/);
  });
});

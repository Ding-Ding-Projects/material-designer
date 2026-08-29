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

  it('keeps the native Explorer dialog on the originating parent and restores parent focus', () => {
    expect(source).toMatch(/BrowserWindow\.fromWebContents\(sender\) \?\? BrowserWindow\.getFocusedWindow\(\)/);
    expect(source).toMatch(/properties: \["openDirectory", "createDirectory", "dontAddToRecent"\]/);
    expect(source).toMatch(/dialog\.showOpenDialog\(parent, pickerOptions\)/);
    expect(source).toMatch(/if \(parent && !parent\.isDestroyed\(\)\) parent\.focus\(\);/);
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
    expect(source).toMatch(/return await pickAndImportFolder\(\{/);
    expect(source).toMatch(/return await pickAndReplaceWorkingDir\(\{/);
  });

  it('does not retain the removed tree-only dialog identifier in the desktop route', () => {
    expect(source).not.toMatch(/FolderBrowserDialog/);
  });
});

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../src/main/runtime.ts'),
  'utf8',
);

describe('desktop folder picker source contract', () => {
  it('keeps the native Explorer dialog on the originating parent and restores parent focus', () => {
    expect(source).toMatch(/BrowserWindow\.fromWebContents\(sender\) \?\? BrowserWindow\.getFocusedWindow\(\)/);
    expect(source).toMatch(/properties: \["openDirectory", "createDirectory", "dontAddToRecent"\]/);
    expect(source).toMatch(/dialog\.showOpenDialog\(parent, pickerOptions\)/);
    expect(source).toMatch(/if \(parent && !parent\.isDestroyed\(\)\) parent\.focus\(\);/);
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

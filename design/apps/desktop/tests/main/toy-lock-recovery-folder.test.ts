import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const runtimeSource = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../src/main/runtime.ts'),
  'utf8',
);

describe('toy-lock recovery folder host boundary', () => {
  it('validates and opens the application-data directory without deleting it', () => {
    expect(runtimeSource).toMatch(/const recoveryPath = app\.getPath\("userData"\);/);
    expect(runtimeSource).toMatch(/const directory = await stat\(recoveryPath\);/);
    expect(runtimeSource).toMatch(/if \(!directory\.isDirectory\(\)\) return \{ ok: false, reason: "recovery-folder-invalid" \};/);
    expect(runtimeSource).toMatch(/await realpath\(recoveryPath\);/);
    expect(runtimeSource).toMatch(/const failure = await shell\.openPath\(recoveryPath\);/);
    expect(runtimeSource).toMatch(/\{ ok: true, path: recoveryPath \}/);
    expect(runtimeSource).toMatch(/\{ ok: false, reason: "open-failed" \}/);
    expect(runtimeSource).not.toMatch(/unlink\(recoveryPath\)|rmSync\(recoveryPath\)/);
  });

  it('never includes a recovery path in a failed result', () => {
    const handler = runtimeSource.match(
      /ipcMain\.handle\("od:toy-locks:open-recovery-folder"[\s\S]*?\n  \}\);/u,
    )?.[0] ?? '';
    expect(handler).not.toMatch(/ok: false, reason: "[^"]+", path:/);
  });
});

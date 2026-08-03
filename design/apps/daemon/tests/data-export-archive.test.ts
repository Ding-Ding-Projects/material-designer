// Archive path safety and the "never pretend an archive is protected" rule.
//
// The 7z tests deliberately point the binary probe at a path that cannot exist,
// so they assert the refusal behaviour on every machine — including one that
// does have 7-Zip installed.

import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DataExportArchiveError,
  DataExportStagingStore,
  SEVEN_ZIP_BIN_ENV,
  assertSafeArchiveEntries,
  buildDataExportSevenZip,
  buildDataExportZip,
  readSevenZipArtifact,
  resetSevenZipBinaryCache,
  resolveSevenZipBinary,
} from '../src/data-export/archive.js';

const NOWHERE = path.join(tmpdir(), 'od-export-no-such-7z-binary-9z7q');

afterEach(() => {
  resetSevenZipBinaryCache();
});

describe('archive entry safety', () => {
  it('refuses a traversal, an absolute path, a drive letter and a UNC share', () => {
    for (const bad of ['../escape.json', '/etc/passwd', 'C:\\Windows\\x.json', '\\\\host\\share\\x.json']) {
      expect(() => assertSafeArchiveEntries([{ path: bad, content: 'x' }])).toThrowError(
        DataExportArchiveError,
      );
    }
  });

  it('refuses two entries that would collide on one name', () => {
    expect(() =>
      assertSafeArchiveEntries([
        { path: 'a/b.json', content: '1' },
        { path: 'a\\b.json', content: '2' },
      ]),
    ).toThrowError(/duplicate archive entry path/);
  });

  it('normalizes separators without loosening containment', () => {
    const safe = assertSafeArchiveEntries([{ path: 'exports\\messages.jsonl', content: 'x' }]);
    expect(safe[0]?.path).toBe('exports/messages.jsonl');
  });

  it('writes a ZIP whose every entry stays relative and contained', async () => {
    const buffer = await buildDataExportZip([
      { path: 'od-export-projects-v1-20260803T041833Z.json', content: '{"records":[]}\n' },
      { path: 'manifest.json', content: '{}\n' },
      { path: 'README.md', content: '# export\n' },
    ]);
    const zip = await JSZip.loadAsync(buffer);
    const names = Object.keys(zip.files).sort();
    expect(names).toEqual([
      'README.md',
      'manifest.json',
      'od-export-projects-v1-20260803T041833Z.json',
    ]);
    for (const name of names) {
      expect(name.startsWith('/')).toBe(false);
      expect(name.includes('..')).toBe(false);
      expect(name.includes('\\')).toBe(false);
    }
    expect(await zip.file('manifest.json')?.async('string')).toBe('{}\n');
  });

  it('refuses to build a ZIP at all when one entry path is unsafe', async () => {
    await expect(
      buildDataExportZip([
        { path: 'ok.json', content: '{}' },
        { path: '../../etc/passwd', content: 'x' },
      ]),
    ).rejects.toThrowError(DataExportArchiveError);
  });

  it('refuses to read a staged artifact by a traversing or nested name', async () => {
    await expect(readSevenZipArtifact(tmpdir(), '../secrets')).rejects.toThrowError(
      DataExportArchiveError,
    );
    await expect(readSevenZipArtifact(tmpdir(), 'a/b.7z')).rejects.toThrowError(
      DataExportArchiveError,
    );
  });
});

describe('7-Zip availability', () => {
  it('reports no binary rather than guessing, when the override cannot be spawned', () => {
    expect(
      resolveSevenZipBinary({ [SEVEN_ZIP_BIN_ENV]: NOWHERE }, { useCache: false }),
    ).toBeNull();
  });

  it('refuses the export instead of silently writing an unencrypted ZIP', async () => {
    const runtimeDataDir = await mkdtemp(path.join(tmpdir(), 'od-export-data-'));
    try {
      await expect(
        buildDataExportSevenZip(
          [{ path: 'manifest.json', content: '{}' }],
          { password: 'hunter2', encryptHeaders: true },
          {
            runtimeDataDir,
            baseName: 'od-export-v1',
            env: { [SEVEN_ZIP_BIN_ENV]: NOWHERE } as NodeJS.ProcessEnv,
          },
        ),
      ).rejects.toThrowError(/no 7-Zip binary was found/);

      // And it did not leave a half-built staging tree behind.
      await expect(stat(path.join(runtimeDataDir, 'exports'))).rejects.toThrow();
    } finally {
      await rm(runtimeDataDir, { recursive: true, force: true });
    }
  });

  it('validates entry paths before it looks for a binary, so an unsafe path never reaches the shell', async () => {
    await expect(
      buildDataExportSevenZip(
        [{ path: '../escape.json', content: '{}' }],
        {},
        {
          runtimeDataDir: tmpdir(),
          baseName: 'od-export-v1',
          env: { [SEVEN_ZIP_BIN_ENV]: NOWHERE } as NodeJS.ProcessEnv,
        },
      ),
    ).rejects.toThrowError(/not safe to extract/);
  });
});

describe('staged volume delivery', () => {
  it('expires a staged archive and removes its staging tree', async () => {
    const base = await mkdtemp(path.join(tmpdir(), 'od-export-staged-'));
    const directory = path.join(base, 'out');
    await mkdir(directory, { recursive: true });

    const store = new DataExportStagingStore(1000);
    const now = 1_754_193_513_000;
    store.add('token-1', directory, [{ name: 'od-export-v1.7z.001', bytes: 10 }], now);
    expect(store.get('token-1', now + 500)?.files).toHaveLength(1);

    expect(store.get('token-1', now + 2000)).toBeNull();
    expect(store.size()).toBe(0);

    try {
      await rm(base, { recursive: true, force: true });
    } catch {
      /* the sweep may already have removed it */
    }
  });

  it('does not hand out an unknown token', () => {
    const store = new DataExportStagingStore();
    expect(store.get('nope')).toBeNull();
  });
});

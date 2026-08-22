// Archive writers for the data export capability.
//
// Two paths, deliberately not interchangeable:
//
//   ZIP  — written in-process with jszip. Fast, universally readable, and
//          unencrypted. It is never used as a fallback for a requested 7z:
//          handing a user an unencrypted ZIP when they asked for an encrypted
//          archive is the single worst thing this module could do.
//   7z   — delegated to a real 7-Zip binary so the full option surface is
//          available (methods, levels, dictionary/word/solid sizing, threads,
//          split volumes, AES-256 content encryption AND encrypted headers).
//          When no binary is reachable the caller gets a refusal, not a ZIP.
//
// Daemon data directory contract: 7z staging lives under the resolved daemon
// data root handed in as `runtimeDataDir`. This module never derives a path
// from cwd, an app name, a port, or a namespace.

import { execFile, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import nodePath from 'node:path';
import JSZip from 'jszip';
import {
  buildSevenZipSwitches,
  redactSevenZipSwitches,
  sanitizeDataExportArchiveEntryPath,
  exportPathCollisionKey,
  compareExportPaths,
  PROJECT_EXPORT_LIMITS,
  type SevenZipArchiveOptions,
} from '@open-design/contracts';

export interface DataExportArchiveEntry {
  /** Archive-relative path. Validated before anything is written. */
  path: string;
  content: string | Buffer;
}

export class DataExportArchiveError extends Error {
  readonly code: 'UNSAFE_PATH' | 'BINARY_UNAVAILABLE' | 'ARCHIVE_FAILED';
  constructor(code: DataExportArchiveError['code'], message: string) {
    super(message);
    this.name = 'DataExportArchiveError';
    this.code = code;
  }
}

/**
 * Every entry path is relative and contained. A rejected path throws rather
 * than being repaired, because an archive silently missing an entry — or
 * carrying one under a name the caller did not choose — is worse than an
 * archive that was never written.
 */
export function assertSafeArchiveEntries(
  entries: readonly DataExportArchiveEntry[],
): Array<{ path: string; content: string | Buffer }> {
  if (entries.length > PROJECT_EXPORT_LIMITS.maxEntries) {
    throw new DataExportArchiveError('UNSAFE_PATH', 'archive has too many entries');
  }
  const seen = new Set<string>();
  let totalBytes = 0;
  const safeEntries = entries.map((entry) => {
    const safe = sanitizeDataExportArchiveEntryPath(entry.path);
    if (safe === null) {
      throw new DataExportArchiveError(
        'UNSAFE_PATH',
        `archive entry path is not safe to extract: ${JSON.stringify(entry.path)}`,
      );
    }
    const collisionKey = exportPathCollisionKey(safe);
    if (!collisionKey) {
      throw new DataExportArchiveError('UNSAFE_PATH', `archive entry path is not safe to extract: ${JSON.stringify(entry.path)}`);
    }
    const contentBytes = typeof entry.content === 'string' ? Buffer.byteLength(entry.content, 'utf8') : entry.content.byteLength;
    if (contentBytes > PROJECT_EXPORT_LIMITS.maxEntryBytes || (totalBytes += contentBytes) > PROJECT_EXPORT_LIMITS.maxUncompressedBytes) {
      throw new DataExportArchiveError('ARCHIVE_FAILED', 'archive content exceeds the supported size limit');
    }
    if (seen.has(collisionKey)) {
      throw new DataExportArchiveError(
        'UNSAFE_PATH',
        `duplicate archive entry path: ${safe}`,
      );
    }
    seen.add(collisionKey);
    return { path: safe, content: entry.content };
  });
  return safeEntries.sort((left, right) => compareExportPaths(left.path, right.path));
}

// ---------------------------------------------------------------------------
// ZIP
// ---------------------------------------------------------------------------

export async function buildDataExportZip(
  entries: readonly DataExportArchiveEntry[],
): Promise<Buffer> {
  const safe = assertSafeArchiveEntries(entries);
  const zip = new JSZip();
  for (const entry of safe) {
    zip.file(entry.path, entry.content);
  }
  // Level 6 is the zlib default and the same level the project archive path
  // uses; text exports compress well and level 9 buys little for 2-3x the CPU.
  return zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

// ---------------------------------------------------------------------------
// 7z
// ---------------------------------------------------------------------------

/**
 * Candidate binary names, in preference order. `7z` is the full build, `7zz` is
 * the modern official Linux/macOS binary, `7za` is the standalone reduced
 * build. All three accept the switches this module emits.
 */
export const SEVEN_ZIP_CANDIDATES = ['7z', '7zz', '7za'] as const;

/** Explicit operator override for a non-PATH install. Not a data root. */
export const SEVEN_ZIP_BIN_ENV = 'OD_SEVEN_ZIP_BIN';

let cachedSevenZipBinary: string | null | undefined;

export function resolveSevenZipBinary(
  env: NodeJS.ProcessEnv = process.env,
  options: { useCache?: boolean } = {},
): string | null {
  const useCache = options.useCache !== false;
  if (useCache && cachedSevenZipBinary !== undefined) return cachedSevenZipBinary;

  const override = env[SEVEN_ZIP_BIN_ENV];
  const candidates =
    typeof override === 'string' && override.trim().length > 0
      ? [override.trim()]
      : [...SEVEN_ZIP_CANDIDATES];

  let found: string | null = null;
  for (const candidate of candidates) {
    // No arguments: every 7-Zip build prints its banner and exits. We only care
    // whether the binary can be spawned at all, so the exit code is ignored and
    // an ENOENT (`result.error`) is the signal.
    const result = spawnSync(candidate, [], { stdio: 'ignore', windowsHide: true });
    if (!result.error) {
      found = candidate;
      break;
    }
  }
  if (useCache) cachedSevenZipBinary = found;
  return found;
}

/** Test seam: drop the memoized probe result. */
export function resetSevenZipBinaryCache(): void {
  cachedSevenZipBinary = undefined;
}

export interface SevenZipArchiveResult {
  /** Directory holding the produced archive (and its volumes, if split). */
  directory: string;
  /** Produced file names, sorted. More than one means split volumes. */
  files: Array<{ name: string; bytes: number }>;
  /** The exact switches used, with the password replaced. Safe to echo back. */
  switches: string[];
}

function redactSevenZipOutput(text: string): string {
  // 7-Zip does not normally echo a password, but a usage error can quote the
  // offending argument back. Never let that reach a log or an API response.
  return text.replace(/-p\S+/g, '-p***');
}

function runSevenZip(
  binary: string,
  args: readonly string[],
  cwd: string,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      binary,
      [...args],
      { cwd, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            new DataExportArchiveError(
              'ARCHIVE_FAILED',
              `7-Zip failed: ${redactSevenZipOutput(String(stderr || error.message))}`,
            ),
          );
          return;
        }
        resolve({ stdout: String(stdout), stderr: String(stderr) });
      },
    );
  });
}

/**
 * Write the entries into a staging tree under the daemon data root and run the
 * 7-Zip binary over it.
 *
 * `7z a` is invoked with the payload directory as the working directory and the
 * entry paths as relative arguments, so every stored path is relative by
 * construction — extraction cannot escape its destination.
 */
export async function buildDataExportSevenZip(
  entries: readonly DataExportArchiveEntry[],
  options: SevenZipArchiveOptions,
  context: { runtimeDataDir: string; baseName: string; env?: NodeJS.ProcessEnv },
): Promise<SevenZipArchiveResult> {
  const safe = assertSafeArchiveEntries(entries);
  // An explicitly supplied env is a different probe than the ambient one, so it
  // must not be answered from (or poison) the memoized ambient result.
  const binary = resolveSevenZipBinary(context.env ?? process.env, {
    useCache: context.env === undefined,
  });
  if (!binary) {
    throw new DataExportArchiveError(
      'BINARY_UNAVAILABLE',
      `no 7-Zip binary was found (tried ${SEVEN_ZIP_CANDIDATES.join(', ')}). ` +
        `Install 7-Zip, or point ${SEVEN_ZIP_BIN_ENV} at it. The export was not written as an ` +
        'unencrypted ZIP instead, because an archive you believe is protected and is not is worse than no archive.',
    );
  }

  const root = nodePath.join(context.runtimeDataDir, 'exports');
  await mkdir(root, { recursive: true });
  const workspace = await mkdtemp(nodePath.join(root, 'archive-'));
  const payload = nodePath.join(workspace, 'payload');
  const output = nodePath.join(workspace, 'out');
  await mkdir(payload, { recursive: true });
  await mkdir(output, { recursive: true });

  try {
    for (const entry of safe) {
      const target = nodePath.join(payload, entry.path);
      await mkdir(nodePath.dirname(target), { recursive: true });
      await writeFile(
        target,
        typeof entry.content === 'string' ? Buffer.from(entry.content, 'utf8') : entry.content,
      );
    }

    const switches = buildSevenZipSwitches(options);
    const archivePath = nodePath.join(output, `${context.baseName}.7z`);
    // `--` terminates switch parsing so a filename can never be read as one.
    const args = ['a', ...switches, '--', archivePath, ...safe.map((entry) => entry.path)];
    await runSevenZip(binary, args, payload);

    const produced = await readdir(output);
    const files: SevenZipArchiveResult['files'] = [];
    for (const name of produced.sort()) {
      const info = await stat(nodePath.join(output, name));
      if (info.isFile()) files.push({ name, bytes: info.size });
    }
    if (files.length === 0) {
      throw new DataExportArchiveError('ARCHIVE_FAILED', '7-Zip produced no archive file');
    }
    return { directory: output, files, switches: redactSevenZipSwitches(switches) };
  } catch (error) {
    await rm(workspace, { recursive: true, force: true }).catch(() => {});
    throw error;
  } finally {
    // The payload is the plaintext copy of everything just archived. It goes as
    // soon as 7-Zip is done, whether or not the run succeeded.
    await rm(payload, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Remove a finished staging tree. `directory` is the `out/` folder, so its
 * parent is the whole mkdtemp workspace — taking that removes the archive and
 * anything left beside it.
 */
export async function disposeSevenZipArtifacts(directory: string): Promise<void> {
  await rm(nodePath.dirname(directory), { recursive: true, force: true }).catch(() => {});
}

export async function readSevenZipArtifact(directory: string, name: string): Promise<Buffer> {
  const safe = sanitizeDataExportArchiveEntryPath(name);
  if (safe === null || safe.includes('/')) {
    throw new DataExportArchiveError('UNSAFE_PATH', `not a staged archive file name: ${name}`);
  }
  return readFile(nodePath.join(directory, safe));
}

// ---------------------------------------------------------------------------
// Staged multi-volume delivery
// ---------------------------------------------------------------------------

export interface StagedDataExport {
  token: string;
  directory: string;
  files: Array<{ name: string; bytes: number }>;
  expiresAt: number;
}

/**
 * A split archive cannot be one HTTP body, so its volumes are staged under the
 * daemon data root and handed back as a manifest of download URLs. Entries
 * expire so a staging directory is never left behind indefinitely.
 */
export class DataExportStagingStore {
  private readonly entries = new Map<string, StagedDataExport>();

  constructor(private readonly ttlMs: number = 15 * 60 * 1000) {}

  add(token: string, directory: string, files: StagedDataExport['files'], now = Date.now()): StagedDataExport {
    this.sweep(now);
    const staged: StagedDataExport = { token, directory, files, expiresAt: now + this.ttlMs };
    this.entries.set(token, staged);
    return staged;
  }

  get(token: string, now = Date.now()): StagedDataExport | null {
    this.sweep(now);
    return this.entries.get(token) ?? null;
  }

  sweep(now = Date.now()): void {
    for (const [token, staged] of this.entries) {
      if (staged.expiresAt > now) continue;
      this.entries.delete(token);
      // The parent of `out/` is the mkdtemp workspace; removing it takes the
      // whole staging tree with it.
      void rm(nodePath.dirname(staged.directory), { recursive: true, force: true }).catch(() => {});
    }
  }

  /** Test seam. */
  size(): number {
    return this.entries.size;
  }
}

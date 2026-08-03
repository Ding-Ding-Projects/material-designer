// Thin `git` runner for the local history repository.
//
// Everything here is deliberately narrow: the history store never talks to a
// remote, never runs a hook, and never inherits git configuration from the
// process that happened to launch the daemon. A daemon started from inside a
// checkout can carry GIT_DIR / GIT_WORK_TREE in its environment, and inheriting
// those would make the very first `git add -A` stage the user's own repository
// instead of the snapshot repository. So the environment is scrubbed on every
// invocation rather than once at startup.
//
// "Never inherits git configuration" means the system file, the user's global
// file, and the built-in default excludes file — all three, because each one
// can carry a rule that changes what a snapshot contains. See the env block in
// `runGit` and `core.excludesFile` in `baseConfigArgs`.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** `git show <sha>:<path>` on a large mirrored record needs headroom. */
const GIT_MAX_BUFFER = 64 * 1024 * 1024;

const GIT_COMMAND_TIMEOUT_MS = 60_000;

/**
 * Git variables that must not leak in from the daemon's own environment. Each
 * one can silently redirect a command at another repository.
 */
const DISCARDED_GIT_ENV = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_COMMON_DIR',
  'GIT_CEILING_DIRECTORIES',
  'GIT_NAMESPACE',
] as const;

/**
 * Config applied to every invocation. The identity is fixed so a snapshot never
 * depends on whether the user configured git; the crlf pair keeps mirrored
 * bytes byte-identical (ciphertext must survive a round trip unchanged); and
 * `core.hooksPath` points at a directory the store never creates, so a global
 * `core.hooksPath` in the user's config cannot run their hooks against daemon
 * data.
 *
 * `core.excludesFile` uses the same trick, and needs its own line rather than
 * relying on the neutralized global config: git's default excludes file
 * (`$XDG_CONFIG_HOME/git/ignore`, else `~/.config/git/ignore`) is built in, not
 * read from a config file, so no amount of config scrubbing reaches it. An
 * ignore rule that did reach these invocations would not raise an error — it
 * would silently leave a mirrored record out of the snapshot, and a later
 * restore would read that absence as "the record did not exist at this
 * revision" and delete the live one. `credentials.json` is a realistic entry in
 * a personal global ignore file, and the connector credentials are mirrored
 * under exactly that name.
 */
function baseConfigArgs(repoDir: string): string[] {
  return [
    '-c', 'user.name=Open Design',
    '-c', 'user.email=history@open-design.invalid',
    '-c', 'commit.gpgsign=false',
    '-c', 'tag.gpgsign=false',
    '-c', 'core.autocrlf=false',
    '-c', 'core.safecrlf=false',
    '-c', 'core.quotepath=false',
    '-c', 'core.fsmonitor=false',
    '-c', `core.hooksPath=${repoDir}/.od-history-no-hooks`,
    '-c', `core.excludesFile=${repoDir}/.od-history-no-excludes`,
    '-c', 'gc.auto=0',
    '-c', 'advice.detachedHead=false',
    '-c', 'protocol.allow=never',
  ];
}

export class GitCommandError extends Error {
  readonly args: readonly string[];
  readonly exitCode: number | null;
  readonly stderr: string;

  constructor(args: readonly string[], exitCode: number | null, stderr: string) {
    const firstLine = stderr.trim().split('\n')[0] ?? '';
    super(`git ${args.join(' ')} failed (${exitCode === null ? 'signal' : exitCode}): ${firstLine}`);
    this.name = 'GitCommandError';
    this.args = args;
    this.exitCode = exitCode;
    this.stderr = stderr;
  }
}

export interface GitRunOptions {
  /** Extra environment for this call — used to backdate commit-tree. */
  env?: Record<string, string>;
  /** Resolve instead of throwing when git exits non-zero. */
  allowFailure?: boolean;
}

export interface GitResult {
  exitCode: number;
  stdout: Buffer;
  stderr: string;
}

function errorExitCode(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'number' ? code : null;
}

function errorStream(error: unknown, key: 'stdout' | 'stderr'): Buffer {
  if (typeof error !== 'object' || error === null) return Buffer.alloc(0);
  const value = (error as Record<string, unknown>)[key];
  if (Buffer.isBuffer(value)) return value;
  if (typeof value === 'string') return Buffer.from(value, 'utf8');
  return Buffer.alloc(0);
}

/**
 * Run one git command inside `repoDir`. Returns raw stdout bytes: history
 * mirrors bytes verbatim, so every read path has to stay binary-safe.
 */
export async function runGit(
  repoDir: string,
  args: readonly string[],
  options: GitRunOptions = {},
): Promise<GitResult> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...(options.env ?? {}),
    GIT_CONFIG_NOSYSTEM: '1',
    // `GIT_CONFIG_NOSYSTEM` only turns off the system file. The user's own
    // `~/.gitconfig` (or `$XDG_CONFIG_HOME/git/config`) is a separate layer and
    // still applies unless it is redirected somewhere that does not exist —
    // same trick as `core.hooksPath` above, on a path the store never creates.
    // Git before 2.32 ignores this variable, which is why `baseConfigArgs`
    // pins the settings that actually matter rather than relying on it alone.
    GIT_CONFIG_GLOBAL: `${repoDir}/.od-history-no-global-config`,
    GIT_TERMINAL_PROMPT: '0',
    GIT_OPTIONAL_LOCKS: '0',
    GIT_ASKPASS: '',
    LC_ALL: 'C',
  };
  for (const key of DISCARDED_GIT_ENV) delete env[key];

  const fullArgs = [...baseConfigArgs(repoDir), ...args];
  try {
    const result = await execFileAsync('git', fullArgs, {
      cwd: repoDir,
      env,
      encoding: 'buffer' as const,
      maxBuffer: GIT_MAX_BUFFER,
      timeout: GIT_COMMAND_TIMEOUT_MS,
      windowsHide: true,
    });
    return { exitCode: 0, stdout: result.stdout, stderr: result.stderr.toString('utf8') };
  } catch (error) {
    const exitCode = errorExitCode(error);
    const stderr = errorStream(error, 'stderr').toString('utf8');
    if (options.allowFailure) {
      return { exitCode: exitCode ?? 1, stdout: errorStream(error, 'stdout'), stderr };
    }
    throw new GitCommandError(args, exitCode, stderr || String(error));
  }
}

/** Same as {@link runGit} but decodes stdout as UTF-8. Callers do their own splitting. */
export async function runGitText(
  repoDir: string,
  args: readonly string[],
  options: GitRunOptions = {},
): Promise<string> {
  const result = await runGit(repoDir, args, options);
  return result.stdout.toString('utf8');
}

let gitAvailability: Promise<boolean> | null = null;

/**
 * Whether a usable `git` is on PATH.
 *
 * Cached per process because every capture would otherwise pay for the probe.
 * The consequence is deliberate and worth stating: a daemon that started
 * before git was installed keeps reporting history as unavailable until it is
 * restarted. That is a truthful "not available right now" rather than a probe
 * on the hot path of every record write.
 */
export function isGitAvailable(): Promise<boolean> {
  if (!gitAvailability) {
    gitAvailability = execFileAsync('git', ['--version'], {
      encoding: 'buffer' as const,
      timeout: GIT_COMMAND_TIMEOUT_MS,
      windowsHide: true,
    })
      .then(() => true)
      .catch(() => false);
  }
  return gitAvailability;
}

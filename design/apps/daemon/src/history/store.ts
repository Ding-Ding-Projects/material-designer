// The append-only, Git-backed snapshot repository.
//
// Layout, all derived from the resolved daemon data root (see the Daemon data
// directory contract in AGENTS.md — nothing here reads cwd, an app name, a
// port, or a namespace):
//
//   <dataRoot>/history/repo/            the git repository
//   <dataRoot>/history/repo/records/…   mirrored record bytes
//   <dataRoot>/history/retention.json   retention policy, deliberately OUTSIDE
//                                       the repo so it is not its own snapshot
//
// It is never a `.git` inside a user's project folder. Project folders under
// `<dataRoot>/projects` are the user's workspace; putting version-control
// metadata in there would collide with whatever VCS the user runs themselves.
//
// Three invariants this file exists to hold:
//
//   1. Append-only. `restore` writes historical bytes back into the live
//      locations and commits that as a NEW revision on top of the current tip.
//      There is no `git reset`, no `checkout --force`, no branch move that
//      drops a commit. Restoring a restore therefore works, and so does
//      restoring that. The state you started from is always still in the log.
//   2. Bytes are mirrored verbatim. Nothing is decrypted, re-encoded, or
//      normalized on the way in or out, so a store that keeps ciphertext keeps
//      ciphertext in history too, and the history is never more sensitive than
//      the store it mirrors. (Checked: this daemon has no authenticated-
//      encryption AAD bound to an autoincrement row id — every record store is
//      keyed by a stable TEXT id or a file path, so a restored record does not
//      acquire a new identity that would invalidate an AAD. See the note on
//      `restoreRevision`.)
//   3. An unchanged state records nothing. Capture stages, asks git whether
//      anything actually moved, and skips the commit when nothing did.

import { randomUUID } from 'node:crypto';
import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import type {
  HistoryChange,
  HistoryChangeStatus,
  HistoryRevision,
  HistoryRevisionKind,
  HistoryRevisionSummary,
} from '@open-design/contracts';

import {
  isGitAvailable,
  runGit,
  runGitText,
} from './git.js';
import {
  type HistoryDomain,
  type HistorySource,
  describeSourceChange,
  domainIdForRepoPath,
  repoPathForSource,
  repoPrefixForDomain,
} from './domains.js';

const HISTORY_HOME_DIR = 'history';
const HISTORY_REPO_DIR = 'repo';
const HISTORY_BRANCH = 'od-history';
// ASCII record/unit separators. `git log --format` emits them with %x1e / %x1f, and
// no commit message can contain them, so a message with blank lines and trailers
// still splits cleanly.
const RECORD_SEPARATOR = '\u001e';
const FIELD_SEPARATOR = '\u001f';

const TRAILER_ID = 'od-history-id';
const TRAILER_KIND = 'od-history-kind';
const TRAILER_DOMAINS = 'od-history-domains';
const TRAILER_CHANGES = 'od-history-changes';
const TRAILER_RESTORED_FROM = 'od-history-restored-from';

/** `records/` is the only tree the store owns; `.gitattributes` sits beside it. */
const RECORDS_ROOT = 'records';

/**
 * `* -text` is load-bearing, not cosmetic: without it git would apply the
 * platform's end-of-line conversion to mirrored bytes, and a snapshot of a
 * binary or encrypted store would not round-trip.
 */
const GITATTRIBUTES_BODY = '* -text -diff\n';

export function historyHomeDir(dataRoot: string): string {
  return path.join(dataRoot, HISTORY_HOME_DIR);
}

export function historyRepoDir(dataRoot: string): string {
  return path.join(historyHomeDir(dataRoot), HISTORY_REPO_DIR);
}

export interface HistoryStoreOptions {
  /** The resolved daemon data root (RUNTIME_DATA_DIR). */
  dataRoot: string;
  domains: HistoryDomain[];
  now?: () => number;
  logger?: (message: string, error?: unknown) => void;
}

export interface CaptureOptions {
  kind?: HistoryRevisionKind;
  /** Caller-supplied lines; they win over anything derived from the diff. */
  labels?: string[];
  restoredFromId?: string;
  /** Commit even when nothing changed. Only the prune event uses this. */
  allowEmpty?: boolean;
}

export interface CaptureResult {
  committed: boolean;
  revision: HistoryRevision | null;
}

export interface MetadataEventOptions {
  kind?: HistoryRevisionKind;
  label: string;
  domainId: string;
}

export interface RestoreOptions {
  domainIds?: string[];
  label?: string;
}

export interface RestoreResult {
  from: HistoryRevisionSummary;
  recorded: HistoryRevision | null;
  unchanged: boolean;
  changes: HistoryChange[];
  domainIds: string[];
}

export class HistoryUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HistoryUnavailableError';
  }
}

export class HistoryRevisionNotFoundError extends Error {
  constructor(revisionId: string) {
    super(`history revision not found: ${revisionId}`);
    this.name = 'HistoryRevisionNotFoundError';
  }
}

/**
 * Some domains were written back and some were not.
 *
 * Thrown only AFTER whatever did land has been recorded as its own revision, so
 * the mixed state the caller is now looking at is itself in the log and can be
 * restored back out of. `recordedRevisionId` names that revision.
 */
export class HistoryPartialRestoreError extends Error {
  readonly failedDomainIds: string[];

  readonly recordedRevisionId: string | null;

  constructor(failedDomainIds: string[], recordedRevisionId: string | null, detail: string) {
    super(
      `history restore did not complete for ${failedDomainIds.join(', ')}: ${detail}`
      + (recordedRevisionId
        ? `. What did land was recorded as revision ${recordedRevisionId}, so it can be restored back out of.`
        : '. Nothing changed on disk, so no revision was recorded.'),
    );
    this.name = 'HistoryPartialRestoreError';
    this.failedDomainIds = failedDomainIds;
    this.recordedRevisionId = recordedRevisionId;
  }
}

interface StagedSourceDiff {
  domain: HistoryDomain;
  source: HistorySource;
  before: Buffer | null;
  after: Buffer | null;
}

function statusFromCode(code: string): HistoryChangeStatus {
  if (code.startsWith('A')) return 'added';
  if (code.startsWith('D')) return 'deleted';
  return 'modified';
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === 'object'
    && error !== null
    && (error as { code?: unknown }).code === 'ENOENT'
  );
}

async function readFileOrNull(filePath: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(filePath);
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

async function removeIfPresent(target: string): Promise<void> {
  await fs.rm(target, { force: true, recursive: true });
}

const NESTED_GIT_DIR = '.git';

/** Never mirror a nested repository into the snapshot repository. */
function copyFilter(source: string): boolean {
  return path.basename(source) !== NESTED_GIT_DIR;
}

export class HistoryStore {
  private readonly dataRoot: string;

  private readonly repoDir: string;

  private readonly domains: HistoryDomain[];

  private readonly now: () => number;

  private readonly logger: (message: string, error?: unknown) => void;

  private ready: Promise<void> | null = null;

  private unavailableReason: string | null = null;

  constructor(options: HistoryStoreOptions) {
    this.dataRoot = path.resolve(options.dataRoot);
    this.repoDir = historyRepoDir(this.dataRoot);
    this.domains = options.domains;
    this.now = options.now ?? (() => Date.now());
    this.logger = options.logger ?? (() => {});
  }

  getDomains(): HistoryDomain[] {
    return this.domains;
  }

  getRepoDir(): string {
    return this.repoDir;
  }

  /**
   * Why history is unusable right now, or null when it is fine. Populated by
   * the first `ensureRepo` attempt; the caller reports it rather than showing
   * an empty list that reads as "nothing ever happened".
   */
  getUnavailableReason(): string | null {
    return this.unavailableReason;
  }

  async ensureRepo(): Promise<void> {
    if (!this.ready) {
      this.ready = this.initRepo().catch((error: unknown) => {
        this.unavailableReason = error instanceof Error ? error.message : String(error);
        // Reset so a later call can retry once the blocker is gone (git
        // installed, permissions fixed) instead of failing forever.
        this.ready = null;
        throw error;
      });
    }
    return this.ready;
  }

  private async initRepo(): Promise<void> {
    if (!(await isGitAvailable())) {
      throw new HistoryUnavailableError(
        'git was not found on PATH, so local version history cannot be recorded.',
      );
    }
    await fs.mkdir(this.repoDir, { recursive: true, mode: 0o700 });
    // The mirrored records are exactly as sensitive as the stores they come
    // from, which live under the same data root. Keep the same posture rather
    // than widening it; mode on mkdir is ignored when the directory already
    // exists, so set it explicitly and tolerate platforms that refuse.
    await fs.chmod(this.repoDir, 0o700).catch(() => undefined);

    const gitDir = path.join(this.repoDir, '.git');
    let initialized = true;
    try {
      await fs.stat(gitDir);
    } catch (error) {
      if (!isMissing(error)) throw error;
      initialized = false;
    }
    if (!initialized) {
      await runGit(this.repoDir, ['init', '--quiet']);
      // `git init -b` needs git >= 2.28; a symbolic-ref works everywhere and
      // keeps the branch name off the user's `init.defaultBranch`.
      await runGit(this.repoDir, ['symbolic-ref', 'HEAD', `refs/heads/${HISTORY_BRANCH}`]);
    }

    const attributesPath = path.join(this.repoDir, '.gitattributes');
    const attributes = await readFileOrNull(attributesPath);
    if (!attributes || attributes.toString('utf8') !== GITATTRIBUTES_BODY) {
      await fs.writeFile(attributesPath, GITATTRIBUTES_BODY, 'utf8');
    }
    await fs.mkdir(path.join(this.repoDir, RECORDS_ROOT), { recursive: true });

    if (!(await this.hasCommits())) {
      // `--force` for the same reason as in `capture` below: an ignore rule
      // must never be able to drop a record from the snapshot.
      await runGit(this.repoDir, ['add', '-A', '--force', '--', '.']);
      await this.commit({
        kind: 'initial',
        labels: ['Started local version history'],
        changeCount: 0,
        domainIds: [],
        allowEmpty: true,
      });
    }
    this.unavailableReason = null;
  }

  private async hasCommits(): Promise<boolean> {
    const result = await runGit(
      this.repoDir,
      ['rev-parse', '--verify', '--quiet', 'HEAD'],
      { allowFailure: true },
    );
    return result.exitCode === 0;
  }

  // -------------------------------------------------------------------------
  // Capture
  // -------------------------------------------------------------------------

  /**
   * Mirror every domain's current bytes into the repository and commit the
   * result. Returns `committed: false` when nothing moved — an unchanged state
   * records nothing, so the log stays a list of real events.
   */
  async capture(options: CaptureOptions = {}): Promise<CaptureResult> {
    await this.ensureRepo();

    const diffs: StagedSourceDiff[] = [];
    for (const domain of this.domains) {
      for (const source of domain.sources) {
        const staged = await this.stageSource(domain, source);
        if (staged) diffs.push(staged);
      }
    }

    // `--force` is load-bearing, not belt-and-braces. `git add` skips an
    // ignored path silently and exits zero, so one matching rule — from the
    // user's own ignore file, or from a `.gitignore` that a `dir` source
    // mirrored in — would leave that record out of the snapshot with nothing
    // to see. `stagedChanges` would then report nothing moved, capture would
    // truthfully conclude the state was unchanged, and a later restore would
    // read the missing blob as "this record did not exist yet" and delete the
    // live one. `git.ts` also neutralizes every config source an ignore rule
    // can come from; this is the half that holds when a rule is checked in.
    await runGit(this.repoDir, ['add', '-A', '--force', '--', '.']);
    const changes = await this.stagedChanges();
    if (changes.length === 0 && !options.allowEmpty) {
      return { committed: false, revision: null };
    }

    const derived = diffs.flatMap((diff) =>
      describeSourceChange(diff.domain, diff.source, diff.before, diff.after));
    const fallback = this.describeChangedPaths(changes);
    const labels = options.labels && options.labels.length > 0
      ? options.labels
      : derived.length > 0
        ? derived
        : fallback;

    const domainIds = [...new Set(changes.flatMap((change) => (change.domainId ? [change.domainId] : [])))];
    const commitOptions: {
      kind: HistoryRevisionKind;
      labels: string[];
      changeCount: number;
      domainIds: string[];
      allowEmpty: boolean;
      restoredFromId?: string;
    } = {
      kind: options.kind ?? 'mutation',
      labels: labels.length > 0 ? labels : ['Recorded a change'],
      changeCount: changes.length,
      domainIds,
      allowEmpty: options.allowEmpty === true,
    };
    if (options.restoredFromId) commitOptions.restoredFromId = options.restoredFromId;

    const summary = await this.commit(commitOptions);
    return { committed: true, revision: { ...summary, changes } };
  }

  /** Append a redacted event without mirroring any live source bytes. */
  async appendMetadataEvent(options: MetadataEventOptions): Promise<HistoryRevisionSummary> {
    await this.ensureRepo();
    return this.commit({
      kind: options.kind ?? 'mutation',
      labels: [options.label],
      changeCount: 0,
      domainIds: [options.domainId],
      allowEmpty: true,
    });
  }

  /**
   * Mirror one source into the worktree, returning the before/after bytes so
   * the commit can be named. Directory sources are copied wholesale; per-file
   * before/after would cost more than the label is worth, and git's own
   * name-status still names every path that moved.
   */
  private async stageSource(
    domain: HistoryDomain,
    source: HistorySource,
  ): Promise<StagedSourceDiff | null> {
    const repoRelative = repoPathForSource(domain, source);
    const target = path.join(this.repoDir, repoRelative);

    if (source.kind === 'payload') {
      const before = await readFileOrNull(target);
      let after: Buffer;
      try {
        const value = await source.read();
        after = Buffer.from(`${JSON.stringify(value ?? null, null, 2)}\n`, 'utf8');
      } catch (error) {
        // A record store that cannot be read right now must not take the whole
        // snapshot down with it; keep whatever the last good capture held.
        this.logger(`history: reading ${domain.id}/${source.fileName} failed`, error);
        return null;
      }
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, after);
      return { domain, source, before, after };
    }

    // Resolved before any writing, so a domain that points outside the data
    // root fails loudly here rather than being papered over by the IO
    // tolerance below. That distinction matters: a misdeclared source is a
    // bug to fix, a locked file is a transient the snapshot should survive.
    const live = this.resolveDataPath(source.dataPath);

    if (source.kind === 'dir') {
      // Copy into a staging directory OUTSIDE the repository first. Clearing
      // the mirror and copying in place would, on a copy that fails halfway,
      // leave a partial tree that git reads as "the user deleted most of their
      // memory" — a fabricated event, and a dangerous one to offer a restore
      // from. Staging means a failed copy leaves the previous snapshot intact.
      const staging = path.join(
        historyHomeDir(this.dataRoot),
        '.staging',
        domain.id,
        source.dataPath,
      );
      await removeIfPresent(staging);
      try {
        await fs.cp(live, staging, { recursive: true, filter: copyFilter, force: true });
      } catch (error) {
        await removeIfPresent(staging);
        if (isMissing(error)) {
          // The directory really is gone. That is a real deletion event.
          await removeIfPresent(target);
          return { domain, source, before: null, after: null };
        }
        this.logger(`history: mirroring ${source.dataPath} failed`, error);
        return null;
      }
      await removeIfPresent(target);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.rename(staging, target);
      return { domain, source, before: null, after: null };
    }

    const before = await readFileOrNull(target);
    let after: Buffer | null;
    try {
      after = await readFileOrNull(live);
    } catch (error) {
      // Unreadable right now (locked, permissions). Leave the last good
      // snapshot of this record alone rather than recording a deletion that
      // did not happen.
      this.logger(`history: reading ${source.dataPath} failed`, error);
      return null;
    }
    if (after === null) {
      await removeIfPresent(target);
    } else {
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, after);
    }
    return { domain, source, before, after };
  }

  /**
   * Resolve a data-root-relative source path and refuse anything that escapes
   * the data root or reaches into the history home itself. A domain that could
   * point at `..` would let the snapshot repository mirror — or on restore,
   * overwrite — files the daemon does not own.
   */
  private resolveDataPath(dataPath: string): string {
    const resolved = path.resolve(this.dataRoot, dataPath);
    const relative = path.relative(this.dataRoot, resolved);
    if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(`history source path escapes the data root: ${dataPath}`);
    }
    const home = path.relative(historyHomeDir(this.dataRoot), resolved);
    if (home === '' || (!home.startsWith('..') && !path.isAbsolute(home))) {
      throw new Error(`history source path points inside the history store: ${dataPath}`);
    }
    return resolved;
  }

  private async stagedChanges(): Promise<HistoryChange[]> {
    const raw = await runGitText(this.repoDir, [
      'diff',
      '--cached',
      '--name-status',
      '--no-renames',
      '-z',
    ]);
    return this.parseNameStatus(raw);
  }

  /**
   * Parse `-z` name-status output: alternating `status` and `path` tokens,
   * NUL-separated. Empty tokens are dropped first — the trailing separator
   * always yields one, and a leading empty header field would otherwise shift
   * every following pair by one and mislabel the whole revision.
   */
  private parseNameStatus(raw: string): HistoryChange[] {
    const parts = raw.split('\0').filter((value) => value.length > 0);
    const changes: HistoryChange[] = [];
    for (let index = 0; index + 1 < parts.length; index += 2) {
      const code = parts[index];
      const filePath = parts[index + 1];
      if (!code || !filePath) continue;
      if (!filePath.startsWith(`${RECORDS_ROOT}/`)) continue;
      changes.push({
        domainId: domainIdForRepoPath(filePath) ?? '',
        path: filePath,
        status: statusFromCode(code),
      });
    }
    return changes;
  }

  /**
   * Last-resort label when a change has no record shape to diff — still says
   * what moved rather than "Updated".
   */
  private describeChangedPaths(changes: HistoryChange[]): string[] {
    const byDomain = new Map<string, { added: number; modified: number; deleted: number }>();
    for (const change of changes) {
      const key = change.domainId || 'records';
      const bucket = byDomain.get(key) ?? { added: 0, modified: 0, deleted: 0 };
      bucket[change.status] += 1;
      byDomain.set(key, bucket);
    }
    const lines: string[] = [];
    for (const [domainId, counts] of byDomain) {
      const domain = this.domains.find((candidate) => candidate.id === domainId);
      const label = domain ? domain.label : domainId;
      const nounFor = (count: number): string => {
        if (!domain) return count === 1 ? 'record' : 'records';
        return count === 1 ? domain.noun : domain.nounPlural;
      };
      const pieces: string[] = [];
      if (counts.deleted > 0) pieces.push(`deleted ${counts.deleted} ${nounFor(counts.deleted)}`);
      if (counts.added > 0) pieces.push(`added ${counts.added} ${nounFor(counts.added)}`);
      if (counts.modified > 0) pieces.push(`changed ${counts.modified} ${nounFor(counts.modified)}`);
      if (pieces.length === 0) continue;
      lines.push(`${label}: ${pieces.join(', ')}`);
    }
    return lines;
  }

  private async commit(input: {
    kind: HistoryRevisionKind;
    labels: string[];
    changeCount: number;
    domainIds: string[];
    allowEmpty: boolean;
    restoredFromId?: string;
  }): Promise<HistoryRevisionSummary> {
    const revisionId = randomUUID();
    const [subjectRaw, ...rest] = input.labels;
    const subject = subjectRaw ?? 'Recorded a change';
    const heading = rest.length > 0 ? `${subject} (+${rest.length} more)` : subject;
    const trailers = [
      `${TRAILER_ID}: ${revisionId}`,
      `${TRAILER_KIND}: ${input.kind}`,
      `${TRAILER_DOMAINS}: ${input.domainIds.join(',')}`,
      `${TRAILER_CHANGES}: ${input.changeCount}`,
    ];
    if (input.restoredFromId) {
      trailers.push(`${TRAILER_RESTORED_FROM}: ${input.restoredFromId}`);
    }
    const body = [heading, '', ...input.labels, '', ...trailers].join('\n');

    const timestamp = this.now();
    const date = `${Math.floor(timestamp / 1000)} +0000`;
    const args = ['commit', '--quiet', '--no-verify', '-m', body];
    if (input.allowEmpty) args.push('--allow-empty');
    await runGit(this.repoDir, args, {
      env: { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
    });

    const commit = (await runGitText(this.repoDir, ['rev-parse', 'HEAD'])).trim();
    return {
      id: revisionId,
      commit,
      kind: input.kind,
      label: subject,
      details: input.labels,
      createdAt: timestamp,
      domainIds: input.domainIds,
      changeCount: input.changeCount,
      restoredFromId: input.restoredFromId ?? null,
    };
  }

  // -------------------------------------------------------------------------
  // Reading
  // -------------------------------------------------------------------------

  /** Every revision, newest first. */
  async listRevisions(): Promise<HistoryRevisionSummary[]> {
    await this.ensureRepo();
    const raw = await runGitText(this.repoDir, [
      'log',
      '--no-color',
      `--format=%H${FIELD_SEPARATOR}%at${FIELD_SEPARATOR}%B${RECORD_SEPARATOR}`,
      HISTORY_BRANCH,
    ]);
    const revisions: HistoryRevisionSummary[] = [];
    for (const block of raw.split(RECORD_SEPARATOR)) {
      const trimmed = block.replace(/^\n+/u, '');
      if (trimmed.trim().length === 0) continue;
      const parsed = this.parseCommitBlock(trimmed);
      if (parsed) revisions.push(parsed);
    }
    return revisions;
  }

  private parseCommitBlock(block: string): HistoryRevisionSummary | null {
    const fields = block.split(FIELD_SEPARATOR);
    const commit = fields[0];
    const seconds = fields[1];
    const message = fields[2];
    if (!commit || !seconds || message === undefined) return null;

    const lines = message.split('\n');
    const trailers = new Map<string, string>();
    const details: string[] = [];
    for (const line of lines) {
      const match = /^(od-history-[a-z-]+):\s*(.*)$/u.exec(line);
      if (match && match[1]) {
        trailers.set(match[1], match[2] ?? '');
        continue;
      }
      if (line.trim().length > 0) details.push(line.trim());
    }
    const id = trailers.get(TRAILER_ID);
    if (!id) return null;

    // details[0] is the subject line, which repeats the first label when the
    // revision coalesced several. Drop it so `details` is the real list.
    const body = details.slice(1);
    const label = body[0] ?? details[0] ?? 'Recorded a change';
    const kindRaw = trailers.get(TRAILER_KIND);
    const kind: HistoryRevisionKind =
      kindRaw === 'initial' || kindRaw === 'restore' || kindRaw === 'prune'
        ? kindRaw
        : 'mutation';
    const domainIds = (trailers.get(TRAILER_DOMAINS) ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    const changeCount = Number.parseInt(trailers.get(TRAILER_CHANGES) ?? '0', 10);
    const restoredFromId = trailers.get(TRAILER_RESTORED_FROM) ?? null;

    return {
      id,
      commit,
      kind,
      label,
      details: body.length > 0 ? body : [label],
      createdAt: Number.parseInt(seconds, 10) * 1000,
      domainIds,
      changeCount: Number.isFinite(changeCount) ? changeCount : 0,
      restoredFromId: restoredFromId && restoredFromId.length > 0 ? restoredFromId : null,
    };
  }

  async findRevision(revisionId: string): Promise<HistoryRevisionSummary | null> {
    const revisions = await this.listRevisions();
    return revisions.find((revision) => revision.id === revisionId) ?? null;
  }

  async showRevision(revisionId: string): Promise<HistoryRevision> {
    const summary = await this.findRevision(revisionId);
    if (!summary) throw new HistoryRevisionNotFoundError(revisionId);
    // `diff-tree` rather than `log`: with `--no-commit-id` its output is only
    // the name-status pairs, so nothing has to be stripped off the front, and
    // `--root` makes the very first revision report its contents instead of
    // reporting nothing.
    const raw = await runGitText(this.repoDir, [
      'diff-tree',
      '-r',
      '--root',
      '--no-commit-id',
      '--name-status',
      '--no-renames',
      '-z',
      summary.commit,
    ]);
    return { ...summary, changes: this.parseNameStatus(raw) };
  }

  /** Stored bytes of one entry at one revision, or null when it was absent. */
  async readEntry(revisionId: string, entryPath: string): Promise<Buffer | null> {
    const summary = await this.findRevision(revisionId);
    if (!summary) throw new HistoryRevisionNotFoundError(revisionId);
    return this.readBlob(summary.commit, entryPath);
  }

  private async readBlob(commit: string, entryPath: string): Promise<Buffer | null> {
    const normalized = entryPath.replace(/\\/gu, '/');
    if (!normalized.startsWith(`${RECORDS_ROOT}/`) || normalized.split('/').includes('..')) {
      throw new Error(`history entry path is out of scope: ${entryPath}`);
    }
    // `cat-file blob` rather than `show`: it is defined to write the stored
    // object bytes with no conversion of any kind, which is the whole promise
    // this store makes about ciphertext. A missing path exits non-zero, which
    // is how "that record did not exist at this revision" is detected.
    const result = await runGit(
      this.repoDir,
      ['cat-file', 'blob', `${commit}:${normalized}`],
      { allowFailure: true },
    );
    return result.exitCode === 0 ? result.stdout : null;
  }

  private async listTreePaths(commit: string, prefix: string): Promise<string[]> {
    const raw = await runGitText(this.repoDir, [
      'ls-tree',
      '-r',
      '--name-only',
      '-z',
      commit,
      '--',
      prefix,
    ]);
    return raw.split('\0').filter((value) => value.length > 0);
  }

  // -------------------------------------------------------------------------
  // Restore
  // -------------------------------------------------------------------------

  /**
   * Write a revision's bytes back into the live locations and record the
   * restore as a NEW revision.
   *
   * Nothing is rewound. The target revision keeps its place in the log, the
   * revision that was live before this call keeps its place too, and the
   * restore lands on top — so undoing an undo is just another restore, and a
   * user can experiment without risking the state they started from.
   *
   * A domain that fails to be written back does not abort the recording. What
   * did land is committed as a revision that names the failure, and only then
   * does this throw `HistoryPartialRestoreError` — otherwise the caller would
   * be left looking at a half-restored state that exists nowhere in the log.
   *
   * On AAD safety: restore rewrites a record in place under the identifier it
   * was captured with (an object key, an array element's `id`, a SQLite TEXT
   * primary key, or a file path). It never reinserts a record under a fresh
   * autoincrement row id, so authenticated-encryption material bound to a
   * record's stable identity still verifies after a restore. If a future
   * record store binds AAD to a rowid, that store must not be added as a
   * history domain until it is rebound to a stable id — a restored row would
   * otherwise decrypt-fail in a way indistinguishable from corruption.
   */
  async restoreRevision(revisionId: string, options: RestoreOptions = {}): Promise<RestoreResult> {
    await this.ensureRepo();
    const target = await this.findRevision(revisionId);
    if (!target) throw new HistoryRevisionNotFoundError(revisionId);

    const requested = options.domainIds && options.domainIds.length > 0
      ? new Set(options.domainIds)
      : null;
    const scoped: HistoryDomain[] = [];
    for (const domain of this.domains) {
      if (requested && !requested.has(domain.id)) continue;
      const present = await this.listTreePaths(target.commit, repoPrefixForDomain(domain.id));
      // A domain the target revision never captured is left alone rather than
      // emptied. Restoring to a point before a feature existed must not delete
      // the records that feature has since accumulated.
      if (present.length === 0 && !requested) continue;
      scoped.push(domain);
    }

    // A source that throws must not skip the recording. Domains are restored in
    // declaration order, so by the time a later one fails the earlier ones are
    // already rewritten on disk — abandoning the commit there would leave a
    // mixed live state that appears nowhere in the log and cannot be undone.
    // Collect the failures, record what landed, and only then report them.
    const failures: { domainId: string; error: unknown }[] = [];
    for (const domain of scoped) {
      for (const source of domain.sources) {
        try {
          await this.restoreSource(target.commit, domain, source);
        } catch (error) {
          this.logger(`history: restoring ${domain.id} failed`, error);
          failures.push({ domainId: domain.id, error });
        }
      }
    }
    for (const domain of scoped) {
      if (!domain.afterRestore) continue;
      try {
        await domain.afterRestore();
      } catch (error) {
        this.logger(`history: reloading ${domain.id} after restore failed`, error);
      }
    }

    const label = options.label ?? `Restored “${target.label}” from ${new Date(target.createdAt).toISOString()}`;
    const failedDomainIds = [...new Set(failures.map((failure) => failure.domainId))];
    const detail = failures
      .map((failure) => `${failure.domainId}: ${
        failure.error instanceof Error ? failure.error.message : String(failure.error)
      }`)
      .join('; ');
    const labels = [label];
    if (failedDomainIds.length > 0) {
      // The revision says so itself, so a user reading the log later sees a
      // partial restore rather than a clean one.
      labels.push(`Not restored: ${detail}`);
    }
    const capture = await this.capture({
      kind: 'restore',
      labels,
      restoredFromId: target.id,
    });

    if (failedDomainIds.length > 0) {
      throw new HistoryPartialRestoreError(failedDomainIds, capture.revision?.id ?? null, detail);
    }

    return {
      from: target,
      recorded: capture.revision,
      unchanged: !capture.committed,
      changes: capture.revision?.changes ?? [],
      domainIds: scoped.map((domain) => domain.id),
    };
  }

  private async restoreSource(
    commit: string,
    domain: HistoryDomain,
    source: HistorySource,
  ): Promise<void> {
    const repoRelative = repoPathForSource(domain, source);

    if (source.kind === 'payload') {
      const bytes = await this.readBlob(commit, repoRelative);
      if (!bytes) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(bytes.toString('utf8')) as unknown;
      } catch (error) {
        this.logger(`history: ${repoRelative} is not valid JSON, skipping restore`, error);
        return;
      }
      await source.write(parsed);
      return;
    }

    if (source.kind === 'file') {
      const live = this.resolveDataPath(source.dataPath);
      const bytes = await this.readBlob(commit, repoRelative);
      if (bytes === null) {
        // The record did not exist at that point in time. Restoring "before it
        // was created" therefore removes it — that is the undo the user asked
        // for, and it is itself recorded as a revision, so it can be undone.
        await removeIfPresent(live);
        return;
      }
      await fs.mkdir(path.dirname(live), { recursive: true });
      await fs.writeFile(live, bytes);
      return;
    }

    const liveDir = this.resolveDataPath(source.dataPath);
    const prefix = `${repoRelative}/`;
    const treePaths = await this.listTreePaths(commit, prefix);
    const wanted = new Set<string>();
    for (const treePath of treePaths) {
      if (!treePath.startsWith(prefix)) continue;
      const relative = treePath.slice(prefix.length);
      if (relative.length === 0 || relative.split('/').includes('..')) continue;
      const bytes = await this.readBlob(commit, treePath);
      const destination = path.join(liveDir, relative);
      if (bytes === null) {
        // A tree entry `cat-file blob` refuses is not a blob — a gitlink is the
        // realistic case. It was never captured as content, so it must not be
        // treated as content the snapshot chose to omit: mark it wanted, which
        // keeps `removeUnwanted` from deleting the live path underneath it.
        this.logger(`history: ${treePath} is not a stored blob, leaving the live path alone`);
        wanted.add(path.resolve(destination));
        continue;
      }
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.writeFile(destination, bytes);
      wanted.add(path.resolve(destination));
    }
    await this.removeUnwanted(liveDir, wanted);
  }

  /**
   * Delete live files under `dir` that the restored revision did not contain.
   *
   * `.git` is skipped at every depth, exactly as `copyFilter` skips it on the
   * way in. Capture and restore have to agree about this: a nested repository
   * is deliberately never mirrored, so nothing here may treat its absence from
   * the snapshot as evidence the user deleted it. Without the skip, restoring a
   * `dir` domain destroys any repository living under it.
   */
  private async removeUnwanted(dir: string, wanted: Set<string>): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (error) {
      if (isMissing(error)) return;
      throw error;
    }
    for (const entry of entries) {
      // A worktree checkout keeps `.git` as a file rather than a directory, so
      // the name is checked before the kind is.
      if (entry.name === NESTED_GIT_DIR) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // A directory the restore explicitly wanted (a gitlink above) is left
        // whole rather than recursed into and emptied file by file.
        if (wanted.has(path.resolve(full))) continue;
        await this.removeUnwanted(full, wanted);
        continue;
      }
      if (!wanted.has(path.resolve(full))) {
        await removeIfPresent(full);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Retention
  // -------------------------------------------------------------------------

  /**
   * Rebuild the branch keeping only `keep` (oldest first), then record the
   * prune as its own revision.
   *
   * This is the one operation that removes revisions, so it is explicit,
   * user-driven, and previewed by the caller before it runs. It preserves each
   * retained revision's content, message, timestamp and public id exactly:
   * revision ids are UUIDs carried in the commit message, not commit hashes,
   * so a `restore` bookmark still resolves after a prune even though the
   * underlying hashes moved.
   */
  async pruneToRevisions(keep: HistoryRevisionSummary[], removedCount: number): Promise<HistoryRevision | null> {
    await this.ensureRepo();
    if (keep.length === 0 || removedCount <= 0) return null;

    let parent: string | null = null;
    for (const revision of keep) {
      // One read for both the tree and the message. `%T` avoids the
      // `<rev>^{tree}` peel syntax, whose caret and braces are only safe
      // because nothing here goes through a shell — not a property worth
      // depending on when a plain format placeholder says the same thing.
      const header = await runGitText(this.repoDir, [
        'log',
        '-1',
        `--format=%T${FIELD_SEPARATOR}%B`,
        revision.commit,
      ]);
      const separatorAt = header.indexOf(FIELD_SEPARATOR);
      if (separatorAt === -1) {
        throw new Error(`history: could not read revision ${revision.id} while pruning`);
      }
      const tree = header.slice(0, separatorAt).trim();
      const message = header.slice(separatorAt + FIELD_SEPARATOR.length);
      // `git commit-tree` only accepts `-m` in the form where the tree comes
      // last; the legacy `commit-tree <tree> -p …` form has no message flag.
      const args = ['commit-tree'];
      if (parent) args.push('-p', parent);
      args.push('-m', message.replace(/\n+$/u, ''), tree);
      const date = `${Math.floor(revision.createdAt / 1000)} +0000`;
      const created = await runGitText(this.repoDir, args, {
        env: { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
      });
      parent = created.trim();
    }
    if (!parent) return null;

    await runGit(this.repoDir, ['update-ref', `refs/heads/${HISTORY_BRANCH}`, parent]);
    // The retained trees are byte-identical to what is already checked out, so
    // there is nothing to check out and no `reset --hard` to run. Reclaim the
    // detached objects instead.
    await runGit(this.repoDir, ['reflog', 'expire', '--expire=now', '--all'], { allowFailure: true });
    await runGit(this.repoDir, ['gc', '--prune=now', '--quiet'], { allowFailure: true });

    const capture = await this.capture({
      kind: 'prune',
      labels: [`Pruned ${removedCount} revision${removedCount === 1 ? '' : 's'} from history`],
      allowEmpty: true,
    });
    return capture.revision;
  }
}

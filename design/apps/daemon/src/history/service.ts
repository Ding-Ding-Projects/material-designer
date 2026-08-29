// The daemon-facing history service.
//
// Responsibilities the store deliberately does not have:
//
//   * Debouncing. A burst of edits — typing in a settings field, an import
//     writing eight records in a row — must produce one revision, not eight.
//     Mutations coalesce into a single capture after a quiet period.
//   * Noticing mutations. File-backed domains are watched on disk so a record
//     written by any code path is captured, rather than only the paths that
//     remembered to call in. Call sites that know what the user actually did
//     can still say so through `recordMutation({ label })`, and that label
//     wins. Payload domains (the SQLite tables) have no file to watch, so their
//     write paths MUST call `recordMutation` — see `routes/routine.ts` and the
//     template routes in `routes/project/index.ts`. Without it a record created
//     and deleted between two unrelated captures leaves no revision in between,
//     and its deletion cannot be undone.
//   * Never failing the user's operation. Every entry point here swallows its
//     own errors and logs them. A history write that fails must not fail the
//     thing the user actually asked for.
//   * Retention: reading, writing and applying the prune policy.

import fs from 'node:fs/promises';
import path from 'node:path';

import chokidar, { type FSWatcher } from 'chokidar';

import type {
  HistoryDomainInfo,
  HistoryActionDescriptor,
  HistoryActionId,
  HistoryListQuery,
  HistoryListResponse,
  HistoryPruneRequest,
  HistoryPruneResponse,
  HistoryRestoreRequest,
  HistoryRestoreResponse,
  HistoryRetentionPolicy,
  HistoryRevision,
  HistoryRevisionSummary,
} from '@open-design/contracts';
import { HISTORY_QUERY_MAX_LENGTH } from '@open-design/contracts';

import {
  type HistoryDomain,
  domainSourceIsFile,
} from './domains.js';
import {
  HistoryStore,
  type RestoreResult,
  historyHomeDir,
} from './store.js';

const DEFAULT_DEBOUNCE_MS = 1_500;
const RETENTION_FILE = 'retention.json';
const DEFAULT_LIST_LIMIT = 100;
const MAX_LIST_LIMIT = 500;

const HISTORY_ACTION_CATEGORIES: Readonly<Record<HistoryActionId, HistoryActionDescriptor['category']>> = {
  initial: 'lifecycle', created: 'change', updated: 'change', deleted: 'change',
  restored: 'lifecycle', undone: 'lifecycle', pruned: 'lifecycle',
  settings: 'domain', recorded: 'fallback',
};

function actionDescriptors(revisions: readonly HistoryRevisionSummary[]): HistoryActionDescriptor[] {
  const ids = new Set(revisions.flatMap((revision) => revision.actionIds ?? []));
  return Object.entries(HISTORY_ACTION_CATEGORIES).flatMap(([id, category]) =>
    ids.has(id as HistoryActionId)
      ? [{ id: id as HistoryActionId, category }]
      : [],
  );
}
/**
 * How far past the retention policy the log may drift before an automatic
 * prune fires. See `applyRetentionInline` — pruning rebuilds every retained
 * commit, so this trades a slightly longer log for not rewriting it on every
 * single capture.
 */
const RETENTION_SLACK = 25;

const EMPTY_RETENTION: HistoryRetentionPolicy = { maxRevisions: null, maxAgeDays: null };

export interface HistoryServiceOptions {
  /** The resolved daemon data root (RUNTIME_DATA_DIR). */
  dataRoot: string;
  domains: HistoryDomain[];
  debounceMs?: number;
  /** Watch the domains' sources for changes. Off in tests that drive captures. */
  watch?: boolean;
  logger?: (message: string, error?: unknown) => void;
  now?: () => number;
}

export interface RecordMutationInput {
  domainId?: string;
  /**
   * What the user actually did, in words: "Deleted the GitHub account". When
   * omitted the store derives a label from the record diff, which is coarser
   * but still says what moved.
   */
  label?: string;
}

function normalizePolicy(value: unknown): HistoryRetentionPolicy {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return EMPTY_RETENTION;
  const raw = value as Record<string, unknown>;
  const maxRevisions = Number(raw.maxRevisions);
  const maxAgeDays = Number(raw.maxAgeDays);
  return {
    maxRevisions: Number.isFinite(maxRevisions) && maxRevisions > 0 ? Math.floor(maxRevisions) : null,
    maxAgeDays: Number.isFinite(maxAgeDays) && maxAgeDays > 0 ? Math.floor(maxAgeDays) : null,
  };
}

/**
 * Compile a user-supplied search. Plain text is the default everywhere in this
 * product; regex is an explicit opt-in, bounded in length so a pathological
 * pattern cannot be handed to the engine in the first place.
 */
function buildMatcher(query: string | undefined, regex: boolean | undefined): ((value: string) => boolean) | null {
  const trimmed = (query ?? '').trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > HISTORY_QUERY_MAX_LENGTH) {
    throw new Error(`history search pattern is longer than ${HISTORY_QUERY_MAX_LENGTH} characters`);
  }
  if (!regex) {
    const needle = trimmed.toLowerCase();
    return (value) => value.toLowerCase().includes(needle);
  }
  let compiled: RegExp;
  try {
    compiled = new RegExp(trimmed, 'iu');
  } catch (error) {
    throw new Error(`history search pattern is not a valid regular expression: ${
      error instanceof Error ? error.message : String(error)
    }`);
  }
  return (value) => compiled.test(value);
}

export class HistoryService {
  private readonly store: HistoryStore;

  private readonly domains: HistoryDomain[];

  private readonly dataRoot: string;

  private readonly debounceMs: number;

  private readonly shouldWatch: boolean;

  private readonly logger: (message: string, error?: unknown) => void;

  private watcher: FSWatcher | null = null;

  private timer: NodeJS.Timeout | null = null;

  private pendingLabels: string[] = [];

  private queue: Promise<void> = Promise.resolve();

  /** Set while a restore rewrites live files, so the watcher stays quiet. */
  private suspended = false;

  constructor(options: HistoryServiceOptions) {
    this.dataRoot = path.resolve(options.dataRoot);
    this.domains = options.domains;
    this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.shouldWatch = options.watch !== false;
    this.logger = options.logger ?? (() => {});
    const storeOptions: ConstructorParameters<typeof HistoryStore>[0] = {
      dataRoot: this.dataRoot,
      domains: this.domains,
      logger: this.logger,
    };
    if (options.now) storeOptions.now = options.now;
    this.store = new HistoryStore(storeOptions);
  }

  getStore(): HistoryStore {
    return this.store;
  }

  /**
   * Take the first snapshot and start watching. Failures here are logged and
   * dropped: a daemon that cannot record history still has to start.
   */
  start(): void {
    this.enqueue(async () => {
      await this.store.capture({ labels: ['Recorded the current state at startup'] });
    });
    if (this.shouldWatch) this.startWatching();
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.watcher) {
      const watcher = this.watcher;
      this.watcher = null;
      await watcher.close().catch(() => undefined);
    }
    await this.queue.catch(() => undefined);
  }

  private startWatching(): void {
    const targets: string[] = [];
    for (const domain of this.domains) {
      for (const source of domain.sources) {
        // A payload source has no file to watch. Those domains rely on their
        // write paths calling `recordMutation` (see the header), plus the
        // pre-restore capture that guarantees nothing is overwritten unrecorded.
        if (!domainSourceIsFile(source)) continue;
        targets.push(path.join(this.dataRoot, source.dataPath));
      }
    }
    if (targets.length === 0) return;
    try {
      const watcher = chokidar.watch(targets, {
        ignoreInitial: true,
        // Record stores are rewritten whole; waiting for the write to settle
        // keeps a half-written JSON file out of the snapshot.
        awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
      });
      watcher.on('all', () => {
        this.recordMutation({});
      });
      watcher.on('error', (error) => {
        this.logger('history: watcher error', error);
      });
      this.watcher = watcher;
    } catch (error) {
      this.logger('history: could not watch record stores', error);
    }
  }

  /**
   * Note that something changed. Never throws, never awaits: the caller is in
   * the middle of the operation the user actually asked for.
   */
  recordMutation(input: RecordMutationInput = {}): void {
    if (this.suspended) return;
    if (input.label && input.label.trim().length > 0) {
      this.pendingLabels.push(input.label.trim());
    }
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.enqueue(() => this.captureNow());
    }, this.debounceMs);
    // A debounce timer must not hold the process open at shutdown.
    this.timer.unref?.();
  }

  /** Capture any pending mutation immediately and wait for the queue to drain. */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.enqueue(() => this.captureNow());
    await this.queue;
  }

  private async captureNow(): Promise<void> {
    const labels = this.pendingLabels;
    this.pendingLabels = [];
    const result = await this.store.capture(labels.length > 0 ? { labels } : {});
    if (result.committed) await this.applyRetentionInline();
  }

  /**
   * Serialize every git operation. Concurrent captures would race the same
   * index, and errors are logged rather than propagated so a failed history
   * write cannot surface as a failure of the user's own operation.
   */
  private enqueue(task: () => Promise<void>): void {
    this.queue = this.queue
      .then(task)
      .catch((error: unknown) => {
        this.logger('history: snapshot failed', error);
      });
  }

  // -------------------------------------------------------------------------
  // Retention
  // -------------------------------------------------------------------------

  private retentionPath(): string {
    return path.join(historyHomeDir(this.dataRoot), RETENTION_FILE);
  }

  async getRetention(): Promise<HistoryRetentionPolicy> {
    try {
      const raw = await fs.readFile(this.retentionPath(), 'utf8');
      return normalizePolicy(JSON.parse(raw) as unknown);
    } catch {
      return EMPTY_RETENTION;
    }
  }

  async setRetention(policy: HistoryRetentionPolicy): Promise<HistoryRetentionPolicy> {
    const normalized = normalizePolicy(policy);
    await fs.mkdir(historyHomeDir(this.dataRoot), { recursive: true });
    await fs.writeFile(this.retentionPath(), `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
    return normalized;
  }

  /**
   * Apply the configured retention policy from inside the capture queue.
   *
   * This must NOT go through `prune()`: that method takes the queue, and this
   * already holds it — waiting on it here would deadlock the service on its
   * own lock the first time a user configured a policy.
   *
   * It also does not prune the moment a single revision falls outside the
   * window. A prune rebuilds every retained commit, so pruning on each capture
   * would turn one mutation into a whole-log rewrite. Instead the log is
   * allowed to run RETENTION_SLACK revisions past the policy and is then
   * trimmed back to it, which amortizes the rebuild. An explicit
   * `POST /api/history/prune` (or `od history prune --apply`) still trims to
   * the exact window on demand.
   */
  private async applyRetentionInline(): Promise<void> {
    const policy = await this.getRetention();
    if (policy.maxRevisions === null && policy.maxAgeDays === null) return;
    const revisions = await this.store.listRevisions();
    const { keep, removed } = this.partition(revisions, policy);
    if (removed.length < RETENTION_SLACK) return;
    await this.store.pruneToRevisions(keep, removed.length);
  }

  /**
   * Split the log into what the policy keeps and what falls outside it. The
   * newest revision is always kept: a history with nothing in it is not a
   * retention outcome anyone asked for.
   */
  private partition(
    revisions: HistoryRevisionSummary[],
    policy: HistoryRetentionPolicy,
  ): { keep: HistoryRevisionSummary[]; removed: HistoryRevisionSummary[] } {
    // `revisions` arrives newest-first; retention reads more naturally oldest-first.
    const ordered = [...revisions].reverse();
    if (ordered.length === 0) return { keep: [], removed: [] };

    const cutoff = policy.maxAgeDays === null
      ? null
      : Date.now() - policy.maxAgeDays * 24 * 60 * 60 * 1000;
    let keep = cutoff === null
      ? ordered
      : ordered.filter((revision) => revision.createdAt >= cutoff);
    if (policy.maxRevisions !== null && keep.length > policy.maxRevisions) {
      keep = keep.slice(keep.length - policy.maxRevisions);
    }
    if (keep.length === 0) {
      const newest = ordered[ordered.length - 1];
      keep = newest ? [newest] : [];
    }
    const keptIds = new Set(keep.map((revision) => revision.id));
    return { keep, removed: ordered.filter((revision) => !keptIds.has(revision.id)) };
  }

  // -------------------------------------------------------------------------
  // Read/act API used by the HTTP routes and the CLI
  // -------------------------------------------------------------------------

  domainInfo(): HistoryDomainInfo[] {
    return this.domains.map((domain) => {
      const info: HistoryDomainInfo = {
        id: domain.id,
        label: domain.label,
        sensitive: domain.sensitive === true,
      };
      if (domain.note) info.note = domain.note;
      return info;
    });
  }

  isSensitiveDomain(domainId: string): boolean {
    return this.domains.some((domain) => domain.id === domainId && domain.sensitive === true);
  }

  async list(query: HistoryListQuery = {}): Promise<HistoryListResponse> {
    const retention = await this.getRetention();
    let revisions: HistoryRevisionSummary[];
    try {
      revisions = await this.store.listRevisions();
    } catch (error) {
      return {
        available: false,
        unavailableReason: this.store.getUnavailableReason()
          ?? (error instanceof Error ? error.message : String(error)),
        domains: this.domainInfo(),
        revisions: [],
        total: 0,
        retention,
        actionDescriptors: [],
      };
    }

    const matcher = buildMatcher(query.query, query.regex);
    const filtered = revisions.filter((revision) => {
      if (query.domainId && !revision.domainIds.includes(query.domainId)) return false;
      if (query.kind && revision.kind !== query.kind) return false;
      if (typeof query.since === 'number' && revision.createdAt < query.since) return false;
      if (typeof query.until === 'number' && revision.createdAt > query.until) return false;
      if (matcher && !matcher([revision.label, ...revision.details].join('\n'))) return false;
      return true;
    });

    const offset = Math.max(0, Math.floor(query.offset ?? 0));
    const limit = Math.min(
      MAX_LIST_LIMIT,
      Math.max(1, Math.floor(query.limit ?? DEFAULT_LIST_LIMIT)),
    );
    return {
      available: true,
      unavailableReason: null,
      domains: this.domainInfo(),
      revisions: filtered.slice(offset, offset + limit),
      total: filtered.length,
      retention,
      actionDescriptors: actionDescriptors(filtered),
    };
  }

  async show(revisionId: string): Promise<HistoryRevision> {
    return this.store.showRevision(revisionId);
  }

  async readEntry(revisionId: string, entryPath: string): Promise<Buffer | null> {
    return this.store.readEntry(revisionId, entryPath);
  }

  /**
   * Capture whatever is live right now, from inside the queue.
   *
   * This must NOT go through `captureNow`: that applies retention, and
   * retention can drop the very revision a restore is about to read. It also
   * must not go through `flush`, which takes the queue this already holds.
   *
   * Called before a restore overwrites the live records, so the state the user
   * started from is a revision they can go back to — the whole promise this
   * feature makes. Two ways it would otherwise be lost:
   *
   *   * A mutation still inside the debounce window has no revision yet.
   *     `od connectors delete x && od history restore <id>` is enough to run
   *     the restore over the deletion before the deletion was ever recorded.
   *   * A domain nothing watches. `startWatching` only watches file sources, so
   *     the SQLite domains move without anything scheduling a capture at all.
   *
   * `capture` returns `committed: false` when nothing moved, so a state that
   * was already recorded costs one no-op git call and writes no revision.
   */
  private async captureBeforeRestore(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const pending = this.pendingLabels;
    this.pendingLabels = [];
    await this.store.capture(pending.length > 0 ? { labels: pending } : {});
  }

  /**
   * Restore a revision. Runs on the same serialized queue as capture, records
   * the pre-restore state first so it is never lost, and suspends the watcher
   * so the files the restore itself writes do not queue a second, redundant
   * snapshot behind the one the restore already records.
   */
  async restore(request: HistoryRestoreRequest): Promise<HistoryRestoreResponse> {
    const result = await this.runExclusive(async () => {
      // Before `suspended` goes up, and before a single byte is overwritten.
      // If this throws, the restore does not run and nothing was touched.
      await this.captureBeforeRestore();
      this.suspended = true;
      try {
        const options: { domainIds?: string[]; label?: string } = {};
        if (request.domainIds && request.domainIds.length > 0) options.domainIds = request.domainIds;
        if (request.label && request.label.trim().length > 0) options.label = request.label.trim();
        return await this.store.restoreRevision(request.revisionId, options);
      } finally {
        this.suspended = false;
      }
    });
    return {
      from: result.from,
      recorded: result.recorded,
      unchanged: result.unchanged,
      changes: result.changes,
      domainIds: result.domainIds,
    };
  }

  async prune(request: HistoryPruneRequest = {}): Promise<HistoryPruneResponse> {
    const policy = request.policy ? normalizePolicy(request.policy) : await this.getRetention();
    const dryRun = request.dryRun !== false;
    const revisions = await this.store.listRevisions();
    const { keep, removed } = this.partition(revisions, policy);
    if (dryRun || removed.length === 0) {
      return { dryRun, policy, removed, keptCount: keep.length, recorded: null };
    }
    const recorded = await this.runExclusive(() => this.store.pruneToRevisions(keep, removed.length));
    return { dryRun: false, policy, removed, keptCount: keep.length, recorded };
  }

  /**
   * Run a git-touching operation with the capture queue held, so a restore or
   * a prune can never interleave with a debounced snapshot.
   */
  private runExclusive<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(task, task);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

export function createHistoryService(options: HistoryServiceOptions): HistoryService {
  return new HistoryService(options);
}

export type { RestoreResult };

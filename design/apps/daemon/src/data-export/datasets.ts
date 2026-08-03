// Dataset collectors for the data export capability.
//
// One collector per entity the daemon owns, derived from the SQLite schema in
// `db.ts` plus the two non-SQL surfaces (project files on disk, app config).
// The field lists live in `packages/contracts` so the CLI, the daemon and the
// web UI cannot disagree about what a dataset contains; this module is only
// responsible for producing rows that match them.
//
// Daemon data directory contract: every path used here arrives as an argument
// derived from `RUNTIME_DATA_DIR` / `PROJECTS_DIR` on the route context. This
// module never reads `process.env`, never consults `process.cwd()`, and never
// recomputes a data root of its own.

import {
  DATA_EXPORT_DATASETS,
  DATA_EXPORT_MAX_LIMIT,
  DATA_EXPORT_MAX_MATCH_CHARS,
  DATA_EXPORT_REDACTED_PLACEHOLDER,
  type DataExportDatasetId,
  type DataExportFieldDescriptor,
  type DataExportFilter,
} from '@open-design/contracts';
import type { DataExportRecord } from './serialize.js';

/** The slice of better-sqlite3 this module needs. Keeps tests free of a real DB. */
export interface DataExportDb {
  prepare: (sql: string) => { all: (...params: unknown[]) => unknown[] };
}

export interface DataExportCollectorDeps {
  db: DataExportDb;
  paths: {
    /** Managed-project root, derived from the resolved daemon data root. */
    PROJECTS_DIR: string;
    /** The resolved daemon data root itself. */
    RUNTIME_DATA_DIR: string;
  };
  projectStore: {
    getProject: (db: unknown, id: string) => unknown;
  };
  projectFiles: {
    listFiles: (
      projectsRoot: string,
      projectId: string,
      opts?: { metadata?: unknown },
    ) => Promise<unknown[]>;
  };
  appConfig: {
    readAppConfig: (dataDir: string) => Promise<unknown>;
  };
}

export interface CollectDataExportResult {
  records: DataExportRecord[];
  /**
   * True when the underlying scan stopped at `DATA_EXPORT_MAX_LIMIT` rows, so
   * the caller must report a `record-ceiling-reached` warning rather than
   * presenting a partial export as a complete one.
   */
  ceilingReached: boolean;
  /**
   * Project ids whose records could not be read at all — a missing project row,
   * a directory that has moved, a permission refusal. The caller reports one
   * `source-unreadable` warning per id. Without this channel the export simply
   * has fewer rows and `recordCount` presents the reduced number as complete,
   * which is the silent omission this whole feature exists to prevent.
   */
  skippedProjects: string[];
}

export class DataExportFilterError extends Error {
  readonly path: string;
  constructor(path: string, message: string) {
    super(message);
    this.name = 'DataExportFilterError';
    this.path = path;
  }
}

// ---------------------------------------------------------------------------
// Row helpers
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return String(value);
}

function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function bool(value: unknown): boolean {
  return value === 1 || value === true || value === '1';
}

/**
 * Parse a stored JSON column. A column that fails to parse is handed back as
 * its raw text rather than dropped — a corrupt value is still the user's data,
 * and losing it during an export would be the exact failure this feature
 * exists to prevent.
 */
function json(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

// ---------------------------------------------------------------------------
// SQL-backed datasets
// ---------------------------------------------------------------------------

interface SqlDataset {
  /** Everything up to (but excluding) the WHERE clause. */
  select: string;
  /** Column expression a `projectId` filter compares against. */
  projectColumn?: string;
  /** Column expression a `conversationId` filter compares against. */
  conversationColumn?: string;
  /** Column expression `since` / `until` compare against. */
  timeColumn?: string;
  orderBy: string;
  map: (row: Row) => DataExportRecord;
}

const SQL_DATASETS: Partial<Record<DataExportDatasetId, SqlDataset>> = {
  projects: {
    select: 'SELECT p.* FROM projects p',
    projectColumn: 'p.id',
    timeColumn: 'p.updated_at',
    orderBy: 'ORDER BY p.updated_at DESC',
    map: (row) => ({
      id: text(row.id),
      name: text(row.name),
      skillId: text(row.skill_id),
      designSystemId: text(row.design_system_id),
      pendingPrompt: text(row.pending_prompt),
      customInstructions: text(row.custom_instructions),
      metadata: json(row.metadata_json),
      createdAt: num(row.created_at),
      updatedAt: num(row.updated_at),
    }),
  },
  conversations: {
    select: 'SELECT c.* FROM conversations c',
    projectColumn: 'c.project_id',
    conversationColumn: 'c.id',
    timeColumn: 'c.updated_at',
    orderBy: 'ORDER BY c.updated_at DESC',
    map: (row) => ({
      id: text(row.id),
      projectId: text(row.project_id),
      title: text(row.title),
      sessionMode: text(row.session_mode),
      intentSignals: json(row.intent_signals_json),
      createdAt: num(row.created_at),
      updatedAt: num(row.updated_at),
    }),
  },
  messages: {
    // `messages` carries no project column, so a project-scoped export joins
    // through the owning conversation rather than silently ignoring the filter.
    select: 'SELECT m.* FROM messages m JOIN conversations c ON c.id = m.conversation_id',
    projectColumn: 'c.project_id',
    conversationColumn: 'm.conversation_id',
    timeColumn: 'm.created_at',
    orderBy: 'ORDER BY m.conversation_id ASC, m.position ASC',
    map: (row) => ({
      id: text(row.id),
      conversationId: text(row.conversation_id),
      role: text(row.role),
      content: text(row.content) ?? '',
      agentId: text(row.agent_id),
      agentName: text(row.agent_name),
      events: json(row.events_json),
      attachments: json(row.attachments_json),
      producedFiles: json(row.produced_files_json),
      feedback: json(row.feedback_json),
      resultDeliveryState: text(row.result_delivery_state),
      sessionMode: text(row.session_mode),
      position: num(row.position),
      startedAt: num(row.started_at),
      endedAt: num(row.ended_at),
      createdAt: num(row.created_at),
    }),
  },
  templates: {
    select: 'SELECT t.* FROM templates t',
    orderBy: 'ORDER BY t.created_at DESC',
    map: (row) => ({
      id: text(row.id),
      name: text(row.name),
      description: text(row.description),
      sourceProjectId: text(row.source_project_id),
      files: json(row.files_json),
      createdAt: num(row.created_at),
    }),
  },
  comments: {
    select: 'SELECT pc.* FROM preview_comments pc',
    projectColumn: 'pc.project_id',
    conversationColumn: 'pc.conversation_id',
    timeColumn: 'pc.updated_at',
    orderBy: 'ORDER BY pc.updated_at DESC',
    map: (row) => ({
      id: text(row.id),
      projectId: text(row.project_id),
      conversationId: text(row.conversation_id),
      filePath: text(row.file_path),
      elementId: text(row.element_id),
      selector: text(row.selector),
      label: text(row.label),
      text: text(row.text) ?? '',
      note: text(row.note) ?? '',
      status: text(row.status),
      position: json(row.position_json),
      attachments: json(row.attachments_json),
      createdAt: num(row.created_at),
      updatedAt: num(row.updated_at),
    }),
  },
  tabs: {
    select: 'SELECT tb.* FROM tabs tb',
    projectColumn: 'tb.project_id',
    orderBy: 'ORDER BY tb.project_id ASC, tb.position ASC',
    map: (row) => ({
      projectId: text(row.project_id),
      name: text(row.name),
      position: num(row.position),
      isActive: bool(row.is_active),
    }),
  },
  deployments: {
    select: 'SELECT d.* FROM deployments d',
    projectColumn: 'd.project_id',
    timeColumn: 'd.updated_at',
    orderBy: 'ORDER BY d.updated_at DESC',
    map: (row) => ({
      id: text(row.id),
      projectId: text(row.project_id),
      fileName: text(row.file_name),
      providerId: text(row.provider_id),
      url: text(row.url),
      target: text(row.target),
      status: text(row.status),
      statusMessage: text(row.status_message),
      deploymentCount: num(row.deployment_count),
      providerMetadata: json(row.provider_metadata_json),
      createdAt: num(row.created_at),
      updatedAt: num(row.updated_at),
    }),
  },
  routines: {
    select: 'SELECT r.* FROM routines r',
    projectColumn: 'r.project_id',
    timeColumn: 'r.updated_at',
    orderBy: 'ORDER BY r.updated_at DESC',
    map: (row) => ({
      id: text(row.id),
      name: text(row.name),
      prompt: text(row.prompt) ?? '',
      scheduleKind: text(row.schedule_kind),
      scheduleValue: text(row.schedule_value),
      schedule: json(row.schedule_json),
      projectMode: text(row.project_mode),
      projectId: text(row.project_id),
      skillId: text(row.skill_id),
      agentId: text(row.agent_id),
      context: json(row.context_json),
      enabled: bool(row.enabled),
      createdAt: num(row.created_at),
      updatedAt: num(row.updated_at),
    }),
  },
  'routine-runs': {
    select: 'SELECT rr.* FROM routine_runs rr',
    projectColumn: 'rr.project_id',
    timeColumn: 'rr.started_at',
    orderBy: 'ORDER BY rr.started_at DESC',
    map: (row) => ({
      id: text(row.id),
      routineId: text(row.routine_id),
      trigger: text(row.trigger),
      status: text(row.status),
      projectId: text(row.project_id),
      conversationId: text(row.conversation_id),
      agentRunId: text(row.agent_run_id),
      summary: text(row.summary),
      error: text(row.error),
      errorCode: text(row.error_code),
      startedAt: num(row.started_at),
      completedAt: num(row.completed_at),
    }),
  },
  'agent-sessions': {
    select: 'SELECT s.* FROM agent_sessions s',
    conversationColumn: 's.conversation_id',
    timeColumn: 's.updated_at',
    orderBy: 'ORDER BY s.updated_at DESC',
    map: (row) => ({
      conversationId: text(row.conversation_id),
      agentId: text(row.agent_id),
      sessionId: text(row.session_id),
      model: text(row.model),
      cwd: text(row.cwd),
      lastMessageId: text(row.last_message_id),
      updatedAt: num(row.updated_at),
    }),
  },
};

function runSqlDataset(
  db: DataExportDb,
  dataset: SqlDataset,
  filter: DataExportFilter,
): { rows: Row[]; ceilingReached: boolean } {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (filter.projectId !== undefined && dataset.projectColumn) {
    clauses.push(`${dataset.projectColumn} = ?`);
    params.push(filter.projectId);
  }
  if (filter.conversationId !== undefined && dataset.conversationColumn) {
    clauses.push(`${dataset.conversationColumn} = ?`);
    params.push(filter.conversationId);
  }
  if (filter.since !== undefined && dataset.timeColumn) {
    clauses.push(`${dataset.timeColumn} >= ?`);
    params.push(filter.since);
  }
  if (filter.until !== undefined && dataset.timeColumn) {
    clauses.push(`${dataset.timeColumn} <= ?`);
    params.push(filter.until);
  }

  const where = clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '';
  // The text filter runs in JS, so SQL cannot also apply the caller's limit
  // without silently discarding rows that would have matched. Instead the scan
  // is capped at the absolute ceiling and the caller is told when it was hit.
  const sql = `${dataset.select}${where} ${dataset.orderBy} LIMIT ${DATA_EXPORT_MAX_LIMIT + 1}`;
  const rows = db.prepare(sql).all(...params) as Row[];
  if (rows.length > DATA_EXPORT_MAX_LIMIT) {
    return { rows: rows.slice(0, DATA_EXPORT_MAX_LIMIT), ceilingReached: true };
  }
  return { rows, ceilingReached: false };
}

// ---------------------------------------------------------------------------
// Text matching
// ---------------------------------------------------------------------------

/** Field types whose values a text filter is meaningfully applied to. */
const MATCHABLE_TYPES = new Set(['id', 'text', 'prose']);

function matchableFields(
  fields: readonly DataExportFieldDescriptor[],
  filter: DataExportFilter,
): string[] {
  const requested = filter.matchFields;
  const eligible = fields.filter((field) => MATCHABLE_TYPES.has(field.type)).map((f) => f.name);
  if (!requested || requested.length === 0) return eligible;
  const known = new Set(fields.map((field) => field.name));
  const unknown = requested.filter((name) => !known.has(name));
  if (unknown.length > 0) {
    throw new DataExportFilterError(
      'matchFields',
      `unknown field(s) for this dataset: ${unknown.join(', ')}`,
    );
  }
  return requested;
}

/**
 * Build the record predicate for a filter's query.
 *
 * Plain-text substring matching is the default; a regex is used only when the
 * caller explicitly opted in, exactly as every other search surface in the
 * product works. Each field is matched against a bounded prefix so a pathological
 * pattern cannot be handed an unbounded haystack.
 */
export function buildDataExportMatcher(
  dataset: DataExportDatasetId,
  filter: DataExportFilter,
): ((record: DataExportRecord) => boolean) | null {
  if (filter.query === undefined || filter.query.length === 0) return null;
  const fields = matchableFields(DATA_EXPORT_DATASETS[dataset].fields, filter);

  if (filter.regex === true) {
    let pattern: RegExp;
    try {
      pattern = new RegExp(filter.query, filter.regexFlags ?? '');
    } catch (error) {
      throw new DataExportFilterError(
        'query',
        `invalid regular expression: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return (record) =>
      fields.some((name) => {
        const value = record[name];
        if (value === null || value === undefined) return false;
        return pattern.test(String(value).slice(0, DATA_EXPORT_MAX_MATCH_CHARS));
      });
  }

  const needle = filter.query.toLowerCase();
  return (record) =>
    fields.some((name) => {
      const value = record[name];
      if (value === null || value === undefined) return false;
      return String(value).slice(0, DATA_EXPORT_MAX_MATCH_CHARS).toLowerCase().includes(needle);
    });
}

function applyWindow(records: DataExportRecord[], filter: DataExportFilter): DataExportRecord[] {
  const offset = filter.offset ?? 0;
  const limit = filter.limit;
  return limit === undefined ? records.slice(offset) : records.slice(offset, offset + limit);
}

// ---------------------------------------------------------------------------
// Non-SQL datasets
// ---------------------------------------------------------------------------

/** Config keys whose values are credential material and never leave the daemon. */
const REDACTED_SETTING_KEYS = new Set(['agentCliEnv']);

async function collectSettings(deps: DataExportCollectorDeps): Promise<DataExportRecord[]> {
  const config = (await deps.appConfig.readAppConfig(deps.paths.RUNTIME_DATA_DIR)) as
    | Record<string, unknown>
    | null
    | undefined;
  const entries = Object.entries(config ?? {});
  entries.sort(([left], [right]) => left.localeCompare(right));
  return entries.map(([key, value]) => {
    const redacted = REDACTED_SETTING_KEYS.has(key);
    return {
      key,
      value: redacted ? null : (value ?? null),
      redacted,
      secret: redacted ? DATA_EXPORT_REDACTED_PLACEHOLDER : null,
    };
  });
}

interface ProjectFileEntry {
  path?: unknown;
  name?: unknown;
  size?: unknown;
  mtime?: unknown;
  kind?: unknown;
  mime?: unknown;
  artifactKind?: unknown;
}

async function collectFiles(
  deps: DataExportCollectorDeps,
  filter: DataExportFilter,
): Promise<{ records: DataExportRecord[]; skippedProjects: string[] }> {
  const projectIds: string[] = [];
  if (filter.projectId !== undefined) {
    projectIds.push(filter.projectId);
  } else {
    const rows = deps.db
      .prepare(`SELECT id FROM projects ORDER BY updated_at DESC LIMIT ${DATA_EXPORT_MAX_LIMIT}`)
      .all() as Row[];
    for (const row of rows) {
      const id = text(row.id);
      if (id) projectIds.push(id);
    }
  }

  const out: DataExportRecord[] = [];
  const skippedProjects: string[] = [];
  for (const projectId of projectIds) {
    const project = deps.projectStore.getProject(deps.db, projectId) as
      | { metadata?: unknown }
      | null
      | undefined;
    if (!project) {
      // Named, not dropped. "This project's files are missing" is a fact the
      // exported file has to carry; a shorter list that looks complete is not.
      skippedProjects.push(projectId);
      continue;
    }
    let entries: unknown[];
    try {
      entries = await deps.projectFiles.listFiles(deps.paths.PROJECTS_DIR, projectId, {
        metadata: project.metadata ?? null,
      });
    } catch {
      // A project whose directory has moved, or whose imported baseDir is gone,
      // does not fail the whole export — but it is reported as unreadable rather
      // than silently exported as a project with no files.
      skippedProjects.push(projectId);
      continue;
    }
    for (const raw of entries) {
      const entry = (raw ?? {}) as ProjectFileEntry;
      const mtime = num(entry.mtime);
      if (filter.since !== undefined && (mtime === null || mtime < filter.since)) continue;
      if (filter.until !== undefined && (mtime === null || mtime > filter.until)) continue;
      out.push({
        projectId,
        // Deliberately the project-relative path: an absolute host path would
        // leak the user's home directory and could escape an archive root.
        path: text(entry.path) ?? text(entry.name) ?? '',
        size: num(entry.size) ?? 0,
        mtime: mtime ?? 0,
        kind: text(entry.kind),
        mime: text(entry.mime),
        artifactKind: text(entry.artifactKind),
      });
    }
  }
  return { records: out, skippedProjects };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function collectDataExportDataset(
  dataset: DataExportDatasetId,
  deps: DataExportCollectorDeps,
  filter: DataExportFilter,
): Promise<CollectDataExportResult> {
  const matcher = buildDataExportMatcher(dataset, filter);

  let records: DataExportRecord[];
  let ceilingReached = false;
  let skippedProjects: string[] = [];

  const sqlDataset = SQL_DATASETS[dataset];
  if (sqlDataset) {
    const result = runSqlDataset(deps.db, sqlDataset, filter);
    ceilingReached = result.ceilingReached;
    records = result.rows.map((row) => sqlDataset.map(row));
  } else if (dataset === 'settings') {
    records = await collectSettings(deps);
  } else if (dataset === 'files') {
    const result = await collectFiles(deps, filter);
    records = result.records;
    skippedProjects = result.skippedProjects;
    // Strictly greater: exactly the ceiling number of files means nothing was
    // dropped, and reporting a truncation that did not happen teaches a caller
    // to distrust the one that did.
    if (records.length > DATA_EXPORT_MAX_LIMIT) {
      ceilingReached = true;
      records = records.slice(0, DATA_EXPORT_MAX_LIMIT);
    }
  } else {
    // Unreachable while every id in DATA_EXPORT_DATASET_IDS has a collector;
    // an explicit throw is better than an empty file that looks like no data.
    throw new DataExportFilterError('datasets', `no collector for dataset: ${dataset}`);
  }

  if (matcher) records = records.filter((record) => matcher(record));
  return { records: applyWindow(records, filter), ceilingReached, skippedProjects };
}

/** Dataset ids that have a collector wired up, for a startup self-check. */
export function collectableDataExportDatasets(): DataExportDatasetId[] {
  return [...(Object.keys(SQL_DATASETS) as DataExportDatasetId[]), 'settings', 'files'];
}

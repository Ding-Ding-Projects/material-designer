// Shared DTOs for the daemon's *data* export capability — the records the app
// owns (projects, conversations, messages, files, settings, …) rendered into
// every text format that can carry them faithfully.
//
// This is deliberately separate from `api/export.ts`, which is the *artifact*
// export (rasterizing a rendered HTML/deck into PDF/image/PPTX). Nothing here
// touches a renderer; it is the "if a surface can show it, the user can take it
// away" side of the product.
//
// Both surfaces speak this shape: the web UI's Export panel and `od export data`
// call the same `/api/export/*` routes. Keep this file pure TypeScript — no
// Node, DOM, or runtime deps — per the contracts boundary.
//
// The two invariants the rest of the feature is built to protect:
//
//   1. A format is never offered for a datum it would silently damage. Every
//      (dataset, format) pair resolves to a fidelity verdict through
//      `describeDataExportFidelity`, and a verdict carrying a `blocking`
//      warning refuses to run until the caller acknowledges it.
//   2. An archive never claims protection it does not have. A 7z archive with a
//      password but visible filenames is a `blocking` warning, not a default.

import { canonicalExportPath, PROJECT_EXPORT_LIMITS } from './export-safety.js';

/**
 * Bumped whenever the envelope or a dataset's field list changes shape. Written
 * into every self-describing export and into the archive manifest, so a file
 * read years later says which schema it was produced against.
 */
export const DATA_EXPORT_SCHEMA_VERSION = 1;

/** Every export is UTF-8. Stated in the envelope so a reader never has to guess. */
export const DATA_EXPORT_ENCODING = 'utf-8';

/**
 * Every export uses LF line endings, including on Windows. Stated in the
 * envelope because a CSV consumer that assumes CRLF will otherwise silently
 * mis-parse the last column of every row.
 */
export const DATA_EXPORT_LINE_ENDING = 'lf' as const;

export type DataExportLineEnding = 'lf' | 'crlf';

// ---------------------------------------------------------------------------
// Formats
// ---------------------------------------------------------------------------

export const DATA_EXPORT_FORMATS = [
  'json',
  'jsonl',
  'yaml',
  'toml',
  'xml',
  'csv',
  'tsv',
  'markdown',
  'html',
] as const;
export type DataExportFormat = (typeof DATA_EXPORT_FORMATS)[number];

export interface DataExportFormatCapabilities {
  /** Carries nested objects/arrays natively rather than as embedded text. */
  nested: boolean;
  /** Preserves number/boolean as distinct from their string spelling. */
  typed: boolean;
  /** Distinguishes an explicit null from an empty string. */
  nullDistinct: boolean;
  /** A machine can parse the file back into the same records. */
  roundTrip: boolean;
  /** The file itself carries the schema/encoding envelope. */
  selfDescribing: boolean;
  /** Can carry every UTF-8 code point, including C0 control characters. */
  controlCharSafe: boolean;
  /** A natural fit for row-shaped data. */
  tabular: boolean;
  /** A natural fit for long-form prose. */
  prose: boolean;
}

export interface DataExportFormatDescriptor {
  id: DataExportFormat;
  label: string;
  /** Filename extension, without the leading dot. */
  extension: string;
  mediaType: string;
  capabilities: DataExportFormatCapabilities;
  /** One-line note on what this format is good and bad at. */
  note: string;
}

export const DATA_EXPORT_FORMAT_DESCRIPTORS: Record<DataExportFormat, DataExportFormatDescriptor> = {
  json: {
    id: 'json',
    label: 'JSON',
    extension: 'json',
    mediaType: 'application/json; charset=utf-8',
    capabilities: {
      nested: true,
      typed: true,
      nullDistinct: true,
      roundTrip: true,
      selfDescribing: true,
      controlCharSafe: true,
      tabular: true,
      prose: true,
    },
    note: 'Complete and re-importable. One envelope object with the schema version, encoding and every record.',
  },
  jsonl: {
    id: 'jsonl',
    label: 'JSON Lines (NDJSON)',
    extension: 'jsonl',
    mediaType: 'application/x-ndjson; charset=utf-8',
    capabilities: {
      nested: true,
      typed: true,
      nullDistinct: true,
      roundTrip: true,
      selfDescribing: false,
      controlCharSafe: true,
      tabular: true,
      prose: true,
    },
    note: 'One record per line, streamable into pipelines. The schema envelope travels beside the file, not inside it.',
  },
  yaml: {
    id: 'yaml',
    label: 'YAML',
    extension: 'yaml',
    mediaType: 'application/yaml; charset=utf-8',
    capabilities: {
      nested: true,
      typed: true,
      nullDistinct: true,
      roundTrip: true,
      selfDescribing: true,
      controlCharSafe: true,
      tabular: true,
      prose: true,
    },
    note: 'Human-editable and nested-safe. Every string is emitted double-quoted so no value is re-typed on read.',
  },
  toml: {
    id: 'toml',
    label: 'TOML',
    extension: 'toml',
    mediaType: 'application/toml; charset=utf-8',
    capabilities: {
      // TOML arrays cannot hold a null, so a nested value containing one would
      // have to be silently reshaped. Nested values are written as embedded
      // JSON text instead, which is declared rather than improvised.
      nested: false,
      typed: true,
      // TOML has no null literal at all.
      nullDistinct: false,
      roundTrip: true,
      selfDescribing: true,
      controlCharSafe: true,
      tabular: true,
      prose: false,
    },
    note: 'Config-shaped and readable, but it has no null: a null-valued field is omitted from its record table.',
  },
  xml: {
    id: 'xml',
    label: 'XML',
    extension: 'xml',
    mediaType: 'application/xml; charset=utf-8',
    capabilities: {
      nested: true,
      typed: true,
      nullDistinct: true,
      roundTrip: true,
      selfDescribing: true,
      // XML 1.0 cannot encode most C0 control characters even as numeric
      // references, so they have to be dropped rather than escaped.
      controlCharSafe: false,
      tabular: true,
      prose: true,
    },
    note: 'Schema-carrying and tool-friendly. Field names live in attributes, so no key is mangled into an element name.',
  },
  csv: {
    id: 'csv',
    label: 'CSV',
    extension: 'csv',
    mediaType: 'text/csv; charset=utf-8',
    capabilities: {
      nested: false,
      typed: false,
      nullDistinct: false,
      roundTrip: true,
      selfDescribing: false,
      controlCharSafe: true,
      tabular: true,
      prose: false,
    },
    note: 'RFC 4180 quoting. Spreadsheet-ready, but every value arrives as text and null reads as empty.',
  },
  tsv: {
    id: 'tsv',
    label: 'TSV',
    extension: 'tsv',
    mediaType: 'text/tab-separated-values; charset=utf-8',
    capabilities: {
      nested: false,
      typed: false,
      nullDistinct: false,
      roundTrip: true,
      selfDescribing: false,
      controlCharSafe: true,
      tabular: true,
      prose: false,
    },
    note: 'Tab-delimited with backslash escapes for tab/newline/backslash, so a multi-line value stays on one row.',
  },
  markdown: {
    id: 'markdown',
    label: 'Markdown',
    extension: 'md',
    mediaType: 'text/markdown; charset=utf-8',
    capabilities: {
      nested: false,
      typed: false,
      nullDistinct: false,
      roundTrip: false,
      selfDescribing: true,
      controlCharSafe: true,
      tabular: true,
      prose: true,
    },
    note: 'For reading, not re-importing. Front matter carries the envelope; long text becomes sections rather than table cells.',
  },
  html: {
    id: 'html',
    label: 'HTML',
    extension: 'html',
    mediaType: 'text/html; charset=utf-8',
    capabilities: {
      nested: false,
      typed: false,
      nullDistinct: false,
      roundTrip: false,
      selfDescribing: true,
      controlCharSafe: true,
      tabular: true,
      prose: true,
    },
    note: 'A self-contained document for reading or printing. Meta tags carry the envelope; nothing is fetched remotely.',
  },
};

export function isDataExportFormat(value: unknown): value is DataExportFormat {
  return typeof value === 'string' && (DATA_EXPORT_FORMATS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Datasets
// ---------------------------------------------------------------------------

export const DATA_EXPORT_DATASET_IDS = [
  'projects',
  'conversations',
  'messages',
  'files',
  'settings',
  'templates',
  'comments',
  'tabs',
  'deployments',
  'routines',
  'routine-runs',
  'agent-sessions',
] as const;
export type DataExportDatasetId = (typeof DATA_EXPORT_DATASET_IDS)[number];

/**
 * `tabular` — rows a spreadsheet reads happily.
 * `structured` — nested records whose shape matters more than their rows.
 * `prose` — records dominated by long free text (a transcript, a note).
 */
export type DataExportDatasetShape = 'tabular' | 'structured' | 'prose';

export type DataExportFieldType =
  | 'id'
  | 'text'
  | 'prose'
  | 'number'
  | 'boolean'
  | 'timestamp'
  | 'json';

export interface DataExportFieldDescriptor {
  name: string;
  type: DataExportFieldType;
  nullable: boolean;
  description: string;
  /**
   * The stored value is credential material. It is exported as a fixed
   * placeholder in every format, and the dataset carries a standing
   * `redacted-fields` warning so the substitution is never a surprise.
   */
  redacted?: boolean;
}

export type DataExportFilterKey =
  | 'projectId'
  | 'conversationId'
  | 'since'
  | 'until'
  | 'query'
  | 'limit'
  | 'offset';

export interface DataExportDatasetDescriptor {
  id: DataExportDatasetId;
  label: string;
  shape: DataExportDatasetShape;
  description: string;
  fields: readonly DataExportFieldDescriptor[];
  /** Filter keys this dataset understands; anything else is reported, not ignored. */
  filters: readonly DataExportFilterKey[];
}

const TIMESTAMP_FILTERS: readonly DataExportFilterKey[] = ['since', 'until', 'query', 'limit', 'offset'];

export const DATA_EXPORT_DATASETS: Record<DataExportDatasetId, DataExportDatasetDescriptor> = {
  projects: {
    id: 'projects',
    label: 'Projects',
    shape: 'structured',
    description:
      'Every project the daemon owns. `metadata` is the nested project record (working directory, linked dirs, import provenance).',
    fields: [
      { name: 'id', type: 'id', nullable: false, description: 'Project id.' },
      { name: 'name', type: 'text', nullable: false, description: 'Display name.' },
      { name: 'skillId', type: 'id', nullable: true, description: 'Active skill, if one is pinned.' },
      { name: 'designSystemId', type: 'id', nullable: true, description: 'Active design system, if one is pinned.' },
      { name: 'pendingPrompt', type: 'prose', nullable: true, description: 'Prompt queued for the next run.' },
      { name: 'customInstructions', type: 'prose', nullable: true, description: 'Per-project instructions.' },
      { name: 'metadata', type: 'json', nullable: true, description: 'Nested project metadata record.' },
      { name: 'createdAt', type: 'timestamp', nullable: false, description: 'Epoch milliseconds.' },
      { name: 'updatedAt', type: 'timestamp', nullable: false, description: 'Epoch milliseconds.' },
    ],
    filters: ['projectId', ...TIMESTAMP_FILTERS],
  },
  conversations: {
    id: 'conversations',
    label: 'Conversations',
    shape: 'tabular',
    description: 'Chat threads, one row per conversation.',
    fields: [
      { name: 'id', type: 'id', nullable: false, description: 'Conversation id.' },
      { name: 'projectId', type: 'id', nullable: false, description: 'Owning project.' },
      { name: 'title', type: 'text', nullable: true, description: 'Thread title.' },
      { name: 'sessionMode', type: 'text', nullable: false, description: 'design | build | …' },
      { name: 'intentSignals', type: 'json', nullable: true, description: 'Latched discovery intent signals.' },
      { name: 'createdAt', type: 'timestamp', nullable: false, description: 'Epoch milliseconds.' },
      { name: 'updatedAt', type: 'timestamp', nullable: false, description: 'Epoch milliseconds.' },
    ],
    filters: ['projectId', 'conversationId', ...TIMESTAMP_FILTERS],
  },
  messages: {
    id: 'messages',
    label: 'Messages',
    shape: 'prose',
    description:
      'Every chat turn. `content` is the turn text; `events` is the streamed agent event log for that turn. ' +
      'Internal turn bookkeeping (applied plugin snapshots, trace-object indexes, telemetry finalization timestamps) ' +
      'is deliberately outside this schema: it describes how the daemon processed the turn, not what the user said.',
    fields: [
      { name: 'id', type: 'id', nullable: false, description: 'Message id.' },
      { name: 'conversationId', type: 'id', nullable: false, description: 'Owning conversation.' },
      { name: 'role', type: 'text', nullable: false, description: 'user | assistant | system.' },
      { name: 'content', type: 'prose', nullable: false, description: 'Turn text as authored.' },
      { name: 'agentId', type: 'id', nullable: true, description: 'Runtime agent that produced the turn.' },
      { name: 'agentName', type: 'text', nullable: true, description: 'Human-facing agent label.' },
      { name: 'events', type: 'json', nullable: true, description: 'Streamed agent events for the turn.' },
      { name: 'attachments', type: 'json', nullable: true, description: 'Attachment descriptors.' },
      { name: 'producedFiles', type: 'json', nullable: true, description: 'Files the turn wrote.' },
      { name: 'feedback', type: 'json', nullable: true, description: 'The rating and reason codes the user gave this turn.' },
      { name: 'resultDeliveryState', type: 'text', nullable: true, description: 'Whether the turn result reached the user.' },
      { name: 'sessionMode', type: 'text', nullable: true, description: 'Session mode at the time of the turn.' },
      { name: 'position', type: 'number', nullable: false, description: 'Ordinal within the conversation.' },
      { name: 'startedAt', type: 'timestamp', nullable: true, description: 'Epoch milliseconds.' },
      { name: 'endedAt', type: 'timestamp', nullable: true, description: 'Epoch milliseconds.' },
      { name: 'createdAt', type: 'timestamp', nullable: false, description: 'Epoch milliseconds.' },
    ],
    filters: ['projectId', 'conversationId', ...TIMESTAMP_FILTERS],
  },
  files: {
    id: 'files',
    label: 'Project files',
    shape: 'tabular',
    description:
      'The file inventory of a project as the file panel shows it. Absolute host paths are deliberately not exported; `path` is project-relative so an archive cannot escape its own directory.',
    fields: [
      { name: 'projectId', type: 'id', nullable: false, description: 'Owning project.' },
      { name: 'path', type: 'text', nullable: false, description: 'Project-relative path.' },
      { name: 'size', type: 'number', nullable: false, description: 'Bytes on disk.' },
      { name: 'mtime', type: 'timestamp', nullable: false, description: 'Epoch milliseconds.' },
      { name: 'kind', type: 'text', nullable: true, description: 'Coarse file kind.' },
      { name: 'mime', type: 'text', nullable: true, description: 'Detected media type.' },
      { name: 'artifactKind', type: 'text', nullable: true, description: 'Artifact manifest kind, when the file has one.' },
    ],
    filters: ['projectId', ...TIMESTAMP_FILTERS],
  },
  settings: {
    id: 'settings',
    label: 'Settings',
    shape: 'structured',
    description:
      'The app configuration record. Agent CLI environment values are credential material and are exported as a placeholder.',
    fields: [
      { name: 'key', type: 'id', nullable: false, description: 'Setting key.' },
      { name: 'value', type: 'json', nullable: true, description: 'Setting value, nested where the setting is nested.' },
      {
        name: 'redacted',
        type: 'boolean',
        nullable: false,
        description: 'True when the value was replaced by a placeholder because it is credential material.',
      },
      {
        name: 'secret',
        type: 'text',
        nullable: true,
        redacted: true,
        description: 'Always the literal placeholder. Credential values never leave the daemon through an export.',
      },
    ],
    filters: ['query', 'limit', 'offset'],
  },
  templates: {
    id: 'templates',
    label: 'Templates',
    shape: 'structured',
    description: 'Saved project templates and the file set each one carries.',
    fields: [
      { name: 'id', type: 'id', nullable: false, description: 'Template id.' },
      { name: 'name', type: 'text', nullable: false, description: 'Template name.' },
      { name: 'description', type: 'prose', nullable: true, description: 'Template description.' },
      { name: 'sourceProjectId', type: 'id', nullable: true, description: 'Project the template was captured from.' },
      { name: 'files', type: 'json', nullable: false, description: 'File set carried by the template.' },
      { name: 'createdAt', type: 'timestamp', nullable: false, description: 'Epoch milliseconds.' },
    ],
    filters: ['query', 'limit', 'offset'],
  },
  comments: {
    id: 'comments',
    label: 'Preview comments',
    shape: 'prose',
    description: 'Annotations placed on a rendered preview, with their element anchor.',
    fields: [
      { name: 'id', type: 'id', nullable: false, description: 'Comment id.' },
      { name: 'projectId', type: 'id', nullable: false, description: 'Owning project.' },
      { name: 'conversationId', type: 'id', nullable: false, description: 'Owning conversation.' },
      { name: 'filePath', type: 'text', nullable: false, description: 'Annotated file, project-relative.' },
      { name: 'elementId', type: 'text', nullable: false, description: 'Anchored element id.' },
      { name: 'selector', type: 'text', nullable: false, description: 'Anchored element selector.' },
      { name: 'label', type: 'text', nullable: false, description: 'Element label shown in the UI.' },
      { name: 'text', type: 'prose', nullable: false, description: 'Element text captured at anchor time.' },
      { name: 'note', type: 'prose', nullable: false, description: 'The comment the user wrote.' },
      { name: 'status', type: 'text', nullable: false, description: 'open | resolved | …' },
      { name: 'position', type: 'json', nullable: true, description: 'Anchor geometry.' },
      { name: 'attachments', type: 'json', nullable: true, description: 'Attachment descriptors.' },
      { name: 'createdAt', type: 'timestamp', nullable: false, description: 'Epoch milliseconds.' },
      { name: 'updatedAt', type: 'timestamp', nullable: false, description: 'Epoch milliseconds.' },
    ],
    filters: ['projectId', 'conversationId', ...TIMESTAMP_FILTERS],
  },
  tabs: {
    id: 'tabs',
    label: 'Open tabs',
    shape: 'tabular',
    description: 'Per-project editor tab strip: order, active tab, pinned/grouped state.',
    fields: [
      { name: 'projectId', type: 'id', nullable: false, description: 'Owning project.' },
      { name: 'name', type: 'text', nullable: false, description: 'Tab name (a project-relative file path).' },
      { name: 'position', type: 'number', nullable: false, description: 'Ordinal within the strip.' },
      { name: 'isActive', type: 'boolean', nullable: false, description: 'Whether this tab is the active one.' },
    ],
    filters: ['projectId', 'query', 'limit', 'offset'],
  },
  deployments: {
    id: 'deployments',
    label: 'Deployments',
    shape: 'tabular',
    description: 'Published artifacts and where each one landed.',
    fields: [
      { name: 'id', type: 'id', nullable: false, description: 'Deployment id.' },
      { name: 'projectId', type: 'id', nullable: false, description: 'Owning project.' },
      { name: 'fileName', type: 'text', nullable: false, description: 'Deployed file, project-relative.' },
      { name: 'providerId', type: 'id', nullable: false, description: 'Hosting provider.' },
      { name: 'url', type: 'text', nullable: false, description: 'Published URL.' },
      { name: 'target', type: 'text', nullable: false, description: 'preview | production.' },
      { name: 'status', type: 'text', nullable: false, description: 'Deployment status.' },
      { name: 'statusMessage', type: 'text', nullable: true, description: 'Provider status detail.' },
      { name: 'deploymentCount', type: 'number', nullable: false, description: 'How many times this target was published.' },
      { name: 'providerMetadata', type: 'json', nullable: true, description: 'Provider-specific record.' },
      { name: 'createdAt', type: 'timestamp', nullable: false, description: 'Epoch milliseconds.' },
      { name: 'updatedAt', type: 'timestamp', nullable: false, description: 'Epoch milliseconds.' },
    ],
    filters: ['projectId', ...TIMESTAMP_FILTERS],
  },
  routines: {
    id: 'routines',
    label: 'Automations',
    shape: 'structured',
    description: 'Scheduled routines as the Automations tab shows them.',
    fields: [
      { name: 'id', type: 'id', nullable: false, description: 'Routine id.' },
      { name: 'name', type: 'text', nullable: false, description: 'Routine name.' },
      { name: 'prompt', type: 'prose', nullable: false, description: 'Prompt the routine runs.' },
      { name: 'scheduleKind', type: 'text', nullable: false, description: 'Schedule kind.' },
      { name: 'scheduleValue', type: 'text', nullable: false, description: 'Schedule value.' },
      { name: 'schedule', type: 'json', nullable: true, description: 'Expanded schedule record.' },
      { name: 'projectMode', type: 'text', nullable: false, description: 'How the routine picks a project.' },
      { name: 'projectId', type: 'id', nullable: true, description: 'Pinned project, when the mode uses one.' },
      { name: 'skillId', type: 'id', nullable: true, description: 'Pinned skill.' },
      { name: 'agentId', type: 'id', nullable: true, description: 'Pinned agent.' },
      { name: 'context', type: 'json', nullable: true, description: 'Extra run context.' },
      { name: 'enabled', type: 'boolean', nullable: false, description: 'Whether the schedule is armed.' },
      { name: 'createdAt', type: 'timestamp', nullable: false, description: 'Epoch milliseconds.' },
      { name: 'updatedAt', type: 'timestamp', nullable: false, description: 'Epoch milliseconds.' },
    ],
    filters: ['projectId', ...TIMESTAMP_FILTERS],
  },
  'routine-runs': {
    id: 'routine-runs',
    label: 'Automation runs',
    shape: 'tabular',
    description: 'The run log for scheduled routines.',
    fields: [
      { name: 'id', type: 'id', nullable: false, description: 'Run id.' },
      { name: 'routineId', type: 'id', nullable: false, description: 'Owning routine.' },
      { name: 'trigger', type: 'text', nullable: false, description: 'schedule | manual.' },
      { name: 'status', type: 'text', nullable: false, description: 'Run status.' },
      { name: 'projectId', type: 'id', nullable: false, description: 'Project the run used.' },
      { name: 'conversationId', type: 'id', nullable: false, description: 'Conversation the run wrote into.' },
      { name: 'agentRunId', type: 'id', nullable: false, description: 'Agent run id.' },
      { name: 'summary', type: 'prose', nullable: true, description: 'Run summary.' },
      { name: 'error', type: 'prose', nullable: true, description: 'Failure text, when the run failed.' },
      { name: 'errorCode', type: 'text', nullable: true, description: 'Failure code, when the run failed.' },
      { name: 'startedAt', type: 'timestamp', nullable: false, description: 'Epoch milliseconds.' },
      { name: 'completedAt', type: 'timestamp', nullable: true, description: 'Epoch milliseconds.' },
    ],
    filters: ['projectId', ...TIMESTAMP_FILTERS],
  },
  'agent-sessions': {
    id: 'agent-sessions',
    label: 'Agent sessions',
    shape: 'tabular',
    description: 'Per-conversation upstream agent session identity and resume state.',
    fields: [
      { name: 'conversationId', type: 'id', nullable: false, description: 'Owning conversation.' },
      { name: 'agentId', type: 'id', nullable: false, description: 'Runtime agent.' },
      { name: 'sessionId', type: 'id', nullable: false, description: 'Upstream session id.' },
      { name: 'model', type: 'text', nullable: true, description: 'Model the session was created with.' },
      { name: 'cwd', type: 'text', nullable: true, description: 'Working directory the session was created with.' },
      { name: 'lastMessageId', type: 'id', nullable: true, description: 'Last assistant message this session produced.' },
      { name: 'updatedAt', type: 'timestamp', nullable: false, description: 'Epoch milliseconds.' },
    ],
    filters: ['conversationId', ...TIMESTAMP_FILTERS],
  },
};

export function isDataExportDatasetId(value: unknown): value is DataExportDatasetId {
  return typeof value === 'string' && (DATA_EXPORT_DATASET_IDS as readonly string[]).includes(value);
}

/** The placeholder every redacted field carries, in every format. */
export const DATA_EXPORT_REDACTED_PLACEHOLDER = '[REDACTED:credential]';

// ---------------------------------------------------------------------------
// Fidelity — what a format will cost this dataset, before anything is written
// ---------------------------------------------------------------------------

export const DATA_EXPORT_WARNING_CODES = [
  'nested-fields-flattened',
  'null-indistinguishable-from-empty',
  'null-fields-omitted',
  'types-become-text',
  'no-round-trip',
  'no-embedded-schema',
  'control-characters-stripped',
  'redacted-fields',
  'archive-filenames-visible',
  'archive-password-in-process-args',
  'archive-encryption-unsupported',
  'record-ceiling-reached',
  'filters-ignored',
  'source-unreadable',
] as const;
export type DataExportWarningCode = (typeof DATA_EXPORT_WARNING_CODES)[number];

/**
 * `info` — worth knowing, costs nothing.
 * `warning` — the file is usable but something about it changed shape.
 * `blocking` — a value genuinely cannot survive. The export refuses to run
 *   until the caller acknowledges it.
 */
export type DataExportWarningSeverity = 'info' | 'warning' | 'blocking';

export interface DataExportWarning {
  code: DataExportWarningCode;
  severity: DataExportWarningSeverity;
  message: string;
  /** Fields the warning is about, when it is about specific fields. */
  fields?: string[];
}

export type DataExportFidelityLevel = 'faithful' | 'degraded' | 'lossy';

export interface DataExportFidelity {
  dataset: DataExportDatasetId;
  format: DataExportFormat;
  level: DataExportFidelityLevel;
  warnings: DataExportWarning[];
}

function fieldNames(
  descriptor: DataExportDatasetDescriptor,
  predicate: (field: DataExportFieldDescriptor) => boolean,
): string[] {
  return descriptor.fields.filter(predicate).map((field) => field.name);
}

/**
 * The single place that decides what a (dataset, format) pair costs. The plan
 * endpoint, the run endpoint, the CLI and the web UI all read this, so no
 * surface can quietly disagree with another about whether an export is lossy.
 */
export function describeDataExportFidelity(
  dataset: DataExportDatasetId,
  format: DataExportFormat,
): DataExportFidelity {
  const descriptor = DATA_EXPORT_DATASETS[dataset];
  const caps = DATA_EXPORT_FORMAT_DESCRIPTORS[format].capabilities;
  const label = DATA_EXPORT_FORMAT_DESCRIPTORS[format].label;
  const warnings: DataExportWarning[] = [];

  const nestedFields = fieldNames(descriptor, (field) => field.type === 'json');
  if (nestedFields.length > 0 && !caps.nested) {
    warnings.push({
      code: 'nested-fields-flattened',
      severity: 'warning',
      fields: nestedFields,
      message:
        `${label} has no nested values, so ${nestedFields.length === 1 ? 'this field is' : 'these fields are'} ` +
        'written as embedded JSON text. Nothing is dropped, but a reader gets a string where the record had structure.',
    });
  }

  const nullableFields = fieldNames(descriptor, (field) => field.nullable);
  if (nullableFields.length > 0) {
    if (format === 'toml') {
      warnings.push({
        code: 'null-fields-omitted',
        severity: 'blocking',
        fields: nullableFields,
        message:
          'TOML has no null literal, so a null-valued field is omitted from its record table entirely. ' +
          'A reader that does not consult the exported schema cannot tell an omitted field from a field that was never defined.',
      });
    } else if (!caps.nullDistinct) {
      warnings.push({
        code: 'null-indistinguishable-from-empty',
        severity: 'warning',
        fields: nullableFields,
        message:
          `${label} writes null and the empty string identically, so a round trip cannot recover which one the record held.`,
      });
    }
  }

  if (!caps.typed && caps.roundTrip) {
    warnings.push({
      code: 'types-become-text',
      severity: 'info',
      message: `${label} carries every value as text; numbers, booleans and timestamps arrive as their string spelling.`,
    });
  }

  if (!caps.roundTrip) {
    warnings.push({
      code: 'no-round-trip',
      severity: 'warning',
      message:
        `${label} is a presentation format. Every value is written in full and nothing is truncated, ` +
        'but the file is not meant to be read back into the app — export JSON, YAML or CSV alongside it if you need that.',
    });
  }

  if (!caps.selfDescribing) {
    warnings.push({
      code: 'no-embedded-schema',
      severity: 'info',
      message:
        `${label} has nowhere to put the schema envelope, so the schema version, encoding and line ending ` +
        'travel in the response headers and in an archive manifest instead of inside the file.',
    });
  }

  // Every field whose value reaches the writer as raw text, not just the long
  // free-text ones: an id, a title, a path and a status message are stripped by
  // exactly the same pass as a transcript. Nested values are listed too, because
  // JSON escaping rescues a C0 control character but not a literal U+007F.
  const controlCharFields = fieldNames(
    descriptor,
    (field) =>
      field.type === 'prose' || field.type === 'text' || field.type === 'id' || field.type === 'json',
  );
  if (controlCharFields.length > 0 && !caps.controlCharSafe) {
    warnings.push({
      code: 'control-characters-stripped',
      severity: 'blocking',
      fields: controlCharFields,
      message:
        'XML 1.0 cannot encode most C0 control characters even as numeric references, so every C0 control ' +
        'character and U+007F is dropped from each value written as text — an id and a one-line label as ' +
        'much as a transcript. Every other character survives.',
    });
  }

  const redactedFields = fieldNames(descriptor, (field) => field.redacted === true);
  if (redactedFields.length > 0) {
    warnings.push({
      code: 'redacted-fields',
      severity: 'warning',
      fields: redactedFields,
      message:
        `Credential values are replaced by ${DATA_EXPORT_REDACTED_PLACEHOLDER} in every format. ` +
        'This is deliberate: secrets do not leave the daemon through an export.',
    });
  }

  return { dataset, format, level: fidelityLevelFor(warnings), warnings };
}

function fidelityLevelFor(warnings: readonly DataExportWarning[]): DataExportFidelityLevel {
  if (warnings.some((warning) => warning.severity === 'blocking')) return 'lossy';
  if (warnings.some((warning) => warning.severity === 'warning')) return 'degraded';
  return 'faithful';
}

/** Formats whose verdict for this dataset carries no blocking warning. */
export function dataExportFormatsFor(dataset: DataExportDatasetId): DataExportFormat[] {
  return DATA_EXPORT_FORMATS.filter(
    (format) => describeDataExportFidelity(dataset, format).level !== 'lossy',
  );
}

/**
 * Formats whose verdict for this dataset is `faithful` — the safe default for a
 * format picker, since none of them costs the dataset anything.
 *
 * Derived from the verdict rather than hand-listed per dataset. A hand-kept list
 * drifts the moment a field gains a nullable flag or a format's capabilities
 * change, and a picker defaulting to a format the run endpoint then refuses with
 * a 409 is the worst version of that drift.
 *
 * Legitimately empty for a dataset carrying a standing warning no format can
 * avoid — `settings` always replaces a credential with a placeholder, so no
 * format is ever faithful to it. A picker falls back to `dataExportFormatsFor`,
 * which lists everything that is at least runnable without acknowledgement;
 * padding this list with degraded formats would make "faithful" mean nothing.
 */
export function preferredDataExportFormats(dataset: DataExportDatasetId): DataExportFormat[] {
  return DATA_EXPORT_FORMATS.filter(
    (format) => describeDataExportFidelity(dataset, format).level === 'faithful',
  );
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

/**
 * Pattern and result bounds. A regex runs against caller-supplied text on the
 * daemon's own thread, so the pattern length is capped and each field is
 * matched against a bounded prefix — a hostile pattern can still be slow, but
 * it cannot be handed an unbounded haystack.
 */
export const DATA_EXPORT_MAX_QUERY_LENGTH = 512;
export const DATA_EXPORT_MAX_MATCH_CHARS = 20_000;
export const DATA_EXPORT_DEFAULT_LIMIT = 10_000;
export const DATA_EXPORT_MAX_LIMIT = 200_000;

export interface DataExportFilter {
  projectId?: string;
  conversationId?: string;
  /** Inclusive lower bound on the dataset's primary timestamp, epoch ms. */
  since?: number;
  /** Inclusive upper bound on the dataset's primary timestamp, epoch ms. */
  until?: number;
  /** Plain-text substring match by default; a regex only when `regex` is true. */
  query?: string;
  regex?: boolean;
  /** Regex flags, validated against `DATA_EXPORT_ALLOWED_REGEX_FLAGS`. */
  regexFlags?: string;
  /** Restrict matching to these field names; defaults to every text-ish field. */
  matchFields?: string[];
  limit?: number;
  offset?: number;
}

/** `g` and `y` are excluded: both carry `lastIndex` state across `.test()` calls. */
export const DATA_EXPORT_ALLOWED_REGEX_FLAGS = 'imsu';

export interface DataExportFilterIssue {
  path: string;
  message: string;
}

/** Normalizes and bounds a filter, reporting anything it had to reject. */
export function normalizeDataExportFilter(
  raw: unknown,
): { filter: DataExportFilter; issues: DataExportFilterIssue[] } {
  const issues: DataExportFilterIssue[] = [];
  const filter: DataExportFilter = {};
  if (raw == null || typeof raw !== 'object') return { filter, issues };
  const input = raw as Record<string, unknown>;

  if (typeof input.projectId === 'string' && input.projectId.trim()) {
    filter.projectId = input.projectId.trim();
  }
  if (typeof input.conversationId === 'string' && input.conversationId.trim()) {
    filter.conversationId = input.conversationId.trim();
  }
  for (const key of ['since', 'until'] as const) {
    const value = input[key];
    if (value === undefined || value === null) continue;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      issues.push({ path: key, message: `${key} must be epoch milliseconds` });
      continue;
    }
    filter[key] = numeric;
  }
  if (
    filter.since !== undefined &&
    filter.until !== undefined &&
    filter.since > filter.until
  ) {
    issues.push({ path: 'since', message: 'since is after until, so the range selects nothing' });
  }

  if (typeof input.query === 'string' && input.query.length > 0) {
    if (input.query.length > DATA_EXPORT_MAX_QUERY_LENGTH) {
      issues.push({
        path: 'query',
        message: `query is longer than the ${DATA_EXPORT_MAX_QUERY_LENGTH} character bound`,
      });
    } else {
      filter.query = input.query;
    }
  }
  if (input.regex === true) filter.regex = true;
  if (typeof input.regexFlags === 'string' && input.regexFlags.length > 0) {
    const bad = [...input.regexFlags].filter(
      (flag) => !DATA_EXPORT_ALLOWED_REGEX_FLAGS.includes(flag),
    );
    if (bad.length > 0) {
      issues.push({
        path: 'regexFlags',
        message: `unsupported regex flag(s): ${bad.join('')} (allowed: ${DATA_EXPORT_ALLOWED_REGEX_FLAGS})`,
      });
    } else {
      filter.regexFlags = input.regexFlags;
    }
  }
  if (Array.isArray(input.matchFields)) {
    const fields = input.matchFields.filter((name): name is string => typeof name === 'string' && name.length > 0);
    if (fields.length > 0) filter.matchFields = fields;
  }
  for (const key of ['limit', 'offset'] as const) {
    const value = input[key];
    if (value === undefined || value === null) continue;
    const numeric = Number(value);
    if (!Number.isInteger(numeric) || numeric < 0) {
      issues.push({ path: key, message: `${key} must be a non-negative integer` });
      continue;
    }
    filter[key] = numeric;
  }
  if (filter.limit !== undefined && filter.limit > DATA_EXPORT_MAX_LIMIT) {
    issues.push({
      path: 'limit',
      message: `limit is above the ${DATA_EXPORT_MAX_LIMIT} record ceiling`,
    });
    filter.limit = DATA_EXPORT_MAX_LIMIT;
  }

  return { filter, issues };
}

/** Filter keys the caller supplied that this dataset does not understand. */
export function unsupportedDataExportFilterKeys(
  dataset: DataExportDatasetId,
  filter: DataExportFilter,
): DataExportFilterKey[] {
  const supported = new Set<DataExportFilterKey>(DATA_EXPORT_DATASETS[dataset].filters);
  const used: DataExportFilterKey[] = [];
  if (filter.projectId !== undefined) used.push('projectId');
  if (filter.conversationId !== undefined) used.push('conversationId');
  if (filter.since !== undefined) used.push('since');
  if (filter.until !== undefined) used.push('until');
  if (filter.query !== undefined) used.push('query');
  if (filter.limit !== undefined) used.push('limit');
  if (filter.offset !== undefined) used.push('offset');
  return used.filter((key) => !supported.has(key));
}

/**
 * The subset of a filter this dataset actually applies.
 *
 * An exported file states the scope it was produced under, and stating a scope
 * that was never applied is worse than stating none: a `settings` export whose
 * envelope reads `projectId: p1` while holding every setting in the daemon is a
 * file that actively lies about its own contents. The keys this drops are the
 * ones `unsupportedDataExportFilterKeys` reports, so nothing disappears — it
 * moves from `filter` to `ignoredFilters`.
 *
 * `regex`, `regexFlags` and `matchFields` qualify `query`, so they travel with
 * it rather than being filter keys of their own.
 */
export function applicableDataExportFilter(
  dataset: DataExportDatasetId,
  filter: DataExportFilter,
): DataExportFilter {
  const supported = new Set<DataExportFilterKey>(DATA_EXPORT_DATASETS[dataset].filters);
  const applied: DataExportFilter = {};
  if (filter.projectId !== undefined && supported.has('projectId')) applied.projectId = filter.projectId;
  if (filter.conversationId !== undefined && supported.has('conversationId')) {
    applied.conversationId = filter.conversationId;
  }
  if (filter.since !== undefined && supported.has('since')) applied.since = filter.since;
  if (filter.until !== undefined && supported.has('until')) applied.until = filter.until;
  if (filter.query !== undefined && supported.has('query')) {
    applied.query = filter.query;
    if (filter.regex !== undefined) applied.regex = filter.regex;
    if (filter.regexFlags !== undefined) applied.regexFlags = filter.regexFlags;
    if (filter.matchFields !== undefined) applied.matchFields = filter.matchFields;
  }
  if (filter.limit !== undefined && supported.has('limit')) applied.limit = filter.limit;
  if (filter.offset !== undefined && supported.has('offset')) applied.offset = filter.offset;
  return applied;
}

// ---------------------------------------------------------------------------
// Archives
// ---------------------------------------------------------------------------

export const DATA_EXPORT_ARCHIVE_KINDS = ['zip', '7z'] as const;
export type DataExportArchiveKind = (typeof DATA_EXPORT_ARCHIVE_KINDS)[number];

export const SEVEN_ZIP_METHODS = ['LZMA2', 'LZMA', 'PPMd', 'BZip2', 'Deflate', 'Copy'] as const;
export type SevenZipMethod = (typeof SEVEN_ZIP_METHODS)[number];

/** The `-mx` levels 7-Zip actually distinguishes. */
export const SEVEN_ZIP_LEVELS = [0, 1, 3, 5, 7, 9] as const;
export type SevenZipLevel = (typeof SEVEN_ZIP_LEVELS)[number];

export const SEVEN_ZIP_LEVEL_LABELS: Record<SevenZipLevel, string> = {
  0: 'store (no compression)',
  1: 'fastest',
  3: 'fast',
  5: 'normal',
  7: 'maximum',
  9: 'ultra',
};

export interface SevenZipArchiveOptions {
  method?: SevenZipMethod;
  level?: SevenZipLevel;
  /** Dictionary size, e.g. `64m`. Drives both ratio and memory. */
  dictionarySize?: string;
  /** Word (fast-bytes) size, 5–273 for LZMA/LZMA2. */
  wordSize?: number;
  /** Solid archiving. Better ratio, but any single-file read decodes the block. */
  solid?: boolean;
  /** Solid block size, e.g. `4g` or `off`. Only meaningful when `solid` is true. */
  solidBlockSize?: string;
  /** Worker threads: a count, or `on`/`off`. */
  threads?: number | 'on' | 'off';
  /** Split into volumes of this size, e.g. `100m`. */
  volumeSize?: string;
  /** Content encryption password. */
  password?: string;
  /**
   * Encrypt the archive header so filenames are hidden too. Defaults to true
   * whenever a password is set — an archive that encrypts content but lists its
   * filenames in the clear is not the protection the user asked for.
   */
  encryptHeaders?: boolean;
}

export interface DataExportArchiveRequest {
  kind: DataExportArchiveKind;
  /** Base name for the archive, without extension. Sanitized daemon-side. */
  fileName?: string;
  sevenZip?: SevenZipArchiveOptions;
}

export function isDataExportArchiveKind(value: unknown): value is DataExportArchiveKind {
  return typeof value === 'string' && (DATA_EXPORT_ARCHIVE_KINDS as readonly string[]).includes(value);
}

const SIZE_SUFFIX_BYTES: Record<string, number> = {
  b: 1,
  k: 1024,
  m: 1024 * 1024,
  g: 1024 * 1024 * 1024,
};

/** `64m` → bytes. Returns null for anything 7-Zip would not accept. */
export function parseSevenZipSize(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const match = /^(\d{1,6})([bkmg])$/i.exec(raw.trim());
  if (!match) return null;
  const amount = Number(match[1]);
  const suffix = (match[2] ?? 'b').toLowerCase();
  const unit = SIZE_SUFFIX_BYTES[suffix];
  if (!Number.isFinite(amount) || amount <= 0 || unit === undefined) return null;
  return amount * unit;
}

export interface SevenZipCostEstimate {
  /** Approximate RAM the *compressor* needs, in MiB. */
  compressMemoryMb: number;
  /** Approximate RAM a *reader* needs to extract, in MiB. */
  decompressMemoryMb: number;
  /** Relative wall-clock cost, 1 (store) … 5 (ultra + big dictionary). */
  speedCost: 1 | 2 | 3 | 4 | 5;
  notes: string[];
}

const DEFAULT_DICTIONARY_BY_LEVEL: Record<SevenZipLevel, string> = {
  0: '64k',
  1: '256k',
  3: '1m',
  5: '16m',
  7: '32m',
  9: '64m',
};

/**
 * What a given 7z setting costs in time and memory. Deliberately an estimate
 * with its arithmetic stated: 7-Zip's own rule of thumb is roughly 11× the
 * dictionary to compress with LZMA/LZMA2 and a little over 1× to extract, so a
 * user picking `-md=1g` learns it wants ~11 GB before they start, not after.
 */
export function describeSevenZipCost(options: SevenZipArchiveOptions = {}): SevenZipCostEstimate {
  const method: SevenZipMethod = options.method ?? 'LZMA2';
  const level: SevenZipLevel = options.level ?? 5;
  const dictionary =
    parseSevenZipSize(options.dictionarySize) ??
    parseSevenZipSize(DEFAULT_DICTIONARY_BY_LEVEL[level]) ??
    16 * 1024 * 1024;
  const dictionaryMb = dictionary / (1024 * 1024);
  const notes: string[] = [];

  let compressMultiplier = 11;
  let decompressMultiplier = 1;
  switch (method) {
    case 'LZMA2':
      notes.push('LZMA2 is the 7z default: best ratio on mixed text, and the only method that parallelizes well.');
      break;
    case 'LZMA':
      notes.push('LZMA matches LZMA2 ratio but compresses single-threaded, so it is slower on a multi-core machine.');
      compressMultiplier = 11;
      break;
    case 'PPMd':
      notes.push('PPMd beats LZMA2 on natural-language text and loses on binaries. Extraction costs as much memory as compression.');
      compressMultiplier = 1.5;
      decompressMultiplier = 1.5;
      break;
    case 'BZip2':
      notes.push('BZip2 uses a fixed ~9 MB block, so memory is flat, but ratio and speed are both worse than LZMA2 here.');
      compressMultiplier = 0;
      decompressMultiplier = 0;
      break;
    case 'Deflate':
      notes.push('Deflate is the zip method: fastest and most compatible, worst ratio, negligible memory.');
      compressMultiplier = 0;
      decompressMultiplier = 0;
      break;
    case 'Copy':
      notes.push('Copy stores the files uncompressed. Instant, largest output — useful when the payload is already compressed.');
      compressMultiplier = 0;
      decompressMultiplier = 0;
      break;
  }

  const flatMb = method === 'BZip2' ? 32 : method === 'Deflate' ? 4 : method === 'Copy' ? 1 : 4;
  const compressMemoryMb = Math.max(flatMb, Math.round(dictionaryMb * compressMultiplier));
  const decompressMemoryMb = Math.max(flatMb, Math.round(dictionaryMb * decompressMultiplier));

  let speedCost: SevenZipCostEstimate['speedCost'] = 3;
  if (level === 0 || method === 'Copy') speedCost = 1;
  else if (level <= 1) speedCost = 2;
  else if (level <= 5) speedCost = 3;
  else if (level <= 7) speedCost = 4;
  else speedCost = 5;

  if (options.solid !== false && method !== 'Copy') {
    notes.push(
      'Solid blocks compress better because files share a dictionary window, but extracting one file decodes its whole block. ' +
        'Turn solid off when you expect to pull single files out of a large archive.',
    );
  }
  if (options.volumeSize) {
    notes.push('Split volumes need every part present to extract; a missing part makes the whole archive unreadable.');
  }
  if (options.threads === 'off' || options.threads === 1) {
    notes.push('Single-threaded compression is roughly as many times slower as the cores you are not using.');
  }
  if (options.password) {
    notes.push('AES-256 encryption adds a few percent of CPU and no meaningful memory.');
  }

  return { compressMemoryMb, decompressMemoryMb, speedCost, notes };
}

export interface SevenZipValidationResult {
  ok: boolean;
  issues: DataExportFilterIssue[];
  /** The options as they will actually be applied, after defaulting. */
  resolved: SevenZipArchiveOptions;
  warnings: DataExportWarning[];
}

/**
 * Validate and default 7z options.
 *
 * The load-bearing default: setting a password turns header encryption ON.
 * Explicitly asking for a password *without* header encryption is allowed but
 * produces a blocking warning, because such an archive advertises protection
 * while publishing every filename to anyone who runs `7z l` on it.
 */
export function validateSevenZipOptions(raw: SevenZipArchiveOptions = {}): SevenZipValidationResult {
  const issues: DataExportFilterIssue[] = [];
  const warnings: DataExportWarning[] = [];
  const resolved: SevenZipArchiveOptions = {};

  const method = raw.method ?? 'LZMA2';
  if (!(SEVEN_ZIP_METHODS as readonly string[]).includes(method)) {
    issues.push({ path: 'sevenZip.method', message: `unknown method: ${String(method)}` });
  } else {
    resolved.method = method;
  }

  const level = raw.level ?? 5;
  if (!(SEVEN_ZIP_LEVELS as readonly number[]).includes(level)) {
    issues.push({
      path: 'sevenZip.level',
      message: `level must be one of ${SEVEN_ZIP_LEVELS.join(', ')}`,
    });
  } else {
    resolved.level = level;
  }

  if (raw.dictionarySize !== undefined) {
    if (parseSevenZipSize(raw.dictionarySize) === null) {
      issues.push({
        path: 'sevenZip.dictionarySize',
        message: 'dictionarySize must look like 64k / 64m / 1g',
      });
    } else {
      resolved.dictionarySize = raw.dictionarySize;
    }
  }

  if (raw.wordSize !== undefined) {
    if (!Number.isInteger(raw.wordSize) || raw.wordSize < 5 || raw.wordSize > 273) {
      issues.push({ path: 'sevenZip.wordSize', message: 'wordSize must be an integer between 5 and 273' });
    } else {
      resolved.wordSize = raw.wordSize;
    }
  }

  if (raw.solid !== undefined) resolved.solid = raw.solid === true;
  if (raw.solidBlockSize !== undefined) {
    if (raw.solidBlockSize !== 'off' && parseSevenZipSize(raw.solidBlockSize) === null) {
      issues.push({
        path: 'sevenZip.solidBlockSize',
        message: 'solidBlockSize must look like 4g, or be "off"',
      });
    } else {
      resolved.solidBlockSize = raw.solidBlockSize;
    }
  }

  if (raw.threads !== undefined) {
    const threads = raw.threads;
    const validCount = typeof threads === 'number' && Number.isInteger(threads) && threads >= 1 && threads <= 256;
    if (!validCount && threads !== 'on' && threads !== 'off') {
      issues.push({ path: 'sevenZip.threads', message: 'threads must be 1-256, "on", or "off"' });
    } else {
      resolved.threads = threads;
    }
  }

  if (raw.volumeSize !== undefined) {
    if (parseSevenZipSize(raw.volumeSize) === null) {
      issues.push({ path: 'sevenZip.volumeSize', message: 'volumeSize must look like 100m / 4g' });
    } else {
      resolved.volumeSize = raw.volumeSize;
    }
  }

  if (typeof raw.password === 'string' && raw.password.length > 0) {
    resolved.password = raw.password;
    const encryptHeaders = raw.encryptHeaders !== false;
    resolved.encryptHeaders = encryptHeaders;
    if (!encryptHeaders) {
      warnings.push({
        code: 'archive-filenames-visible',
        severity: 'blocking',
        message:
          'Content is encrypted but the archive header is not, so anyone who can read the file can list every ' +
          'filename inside it without the password. Leave encryptHeaders on unless you have a reason not to.',
      });
    }
    warnings.push({
      code: 'archive-password-in-process-args',
      severity: 'warning',
      message:
        'The password is handed to the 7-Zip binary as a command-line argument, so it is briefly visible to any ' +
        'process on this machine that can read the process table. It is never written to a log or an error message.',
    });
  } else if (raw.encryptHeaders === true) {
    issues.push({
      path: 'sevenZip.encryptHeaders',
      message: 'encryptHeaders needs a password; header encryption is part of the same AES-256 key',
    });
  }

  return { ok: issues.length === 0, issues, resolved, warnings };
}

/**
 * The exact `7z` switches for these options, in a stable order. Shared so the
 * daemon runs what the plan endpoint told the user it would run.
 *
 * The password switch is emitted last and is the only element carrying a
 * secret; callers that log an invocation must drop it.
 */
export function buildSevenZipSwitches(options: SevenZipArchiveOptions = {}): string[] {
  const switches: string[] = ['-t7z'];
  const method = options.method ?? 'LZMA2';
  const level = options.level ?? 5;

  switches.push(`-m0=${method}`);
  switches.push(`-mx=${level}`);
  if (options.dictionarySize) switches.push(`-md=${options.dictionarySize}`);
  if (options.wordSize !== undefined) switches.push(`-mfb=${options.wordSize}`);
  if (options.solid === false) {
    switches.push('-ms=off');
  } else if (options.solidBlockSize) {
    switches.push(`-ms=${options.solidBlockSize}`);
  } else if (options.solid === true) {
    switches.push('-ms=on');
  }
  if (options.threads !== undefined) switches.push(`-mmt=${options.threads}`);
  if (options.volumeSize) switches.push(`-v${options.volumeSize}`);
  if (options.password) {
    // Header encryption first so the ordering in a redacted log still shows it.
    if (options.encryptHeaders !== false) switches.push('-mhe=on');
    switches.push(`-p${options.password}`);
  }
  return switches;
}

/** The same switches with the password replaced, safe to log or echo back. */
export function redactSevenZipSwitches(switches: readonly string[]): string[] {
  return switches.map((value) => (value.startsWith('-p') ? '-p***' : value));
}

// ---------------------------------------------------------------------------
// Archive path safety
// ---------------------------------------------------------------------------

const WINDOWS_RESERVED_SEGMENTS = new Set([
  'con', 'prn', 'aux', 'nul',
  'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
  'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9',
]);

export const DATA_EXPORT_MAX_ENTRY_PATH_LENGTH = 240;
export const DATA_EXPORT_MAX_ENTRY_SEGMENT_LENGTH = 120;

/**
 * Normalize an archive entry path, or return null when it cannot be made safe.
 *
 * Rejects rather than repairs anything that would let extraction escape the
 * destination directory: absolute paths, drive letters, UNC prefixes, and any
 * `..` segment. Silently stripping a `..` is worse than refusing, because the
 * caller then believes it archived a path it did not.
 */
export function sanitizeDataExportArchiveEntryPath(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (value.length === 0) return null;
  // Control characters (including NUL) never belong in an entry name. Checked
  // by code point rather than by a character-class literal so the guard cannot
  // be weakened by an editor normalizing an escape sequence away.
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return null;
  }

  const unified = canonicalExportPath(value);
  if (!unified) return null;
  // A drive-relative or drive-absolute Windows path, or a UNC share.
  if (/^[A-Za-z]:/.test(unified)) return null;
  if (unified.startsWith('//')) return null;
  // A POSIX-absolute path. Stripping the leading slash would silently turn
  // `/etc/passwd` into a plausible-looking relative entry the caller never
  // asked for, so it is refused instead.
  if (unified.startsWith('/')) return null;

  const segments = unified.split('/').filter((segment) => segment.length > 0);
  if (segments.length === 0) return null;

  for (const segment of segments) {
    if (segment === '..') return null;
    if (segment.length > DATA_EXPORT_MAX_ENTRY_SEGMENT_LENGTH) return null;
    if (/[<>:"|?*]/.test(segment)) return null;
    // Windows drops a trailing dot or space, which silently renames the entry.
    if (/[. ]$/.test(segment)) return null;
    const base = (segment.split('.')[0] ?? '').toLowerCase();
    if (WINDOWS_RESERVED_SEGMENTS.has(base)) return null;
  }

  const joined = segments.join('/');
  if (joined.length > Math.min(DATA_EXPORT_MAX_ENTRY_PATH_LENGTH, PROJECT_EXPORT_LIMITS.maxPathLength)) return null;
  return joined;
}

// ---------------------------------------------------------------------------
// Request / plan / result
// ---------------------------------------------------------------------------

export interface DataExportRequest {
  /** Dataset ids, or `'all'` for every dataset the daemon owns. */
  datasets: DataExportDatasetId[] | 'all';
  /** Default format. Per-dataset entries in `formats` win over it. */
  format: DataExportFormat;
  /** Format chosen per datum rather than per app. */
  formats?: Partial<Record<DataExportDatasetId, DataExportFormat>>;
  filter?: DataExportFilter;
  archive?: DataExportArchiveRequest;
  /**
   * Run despite `blocking` warnings. Absent or false, the run endpoint refuses
   * and returns the plan so the caller can see what it would have cost.
   */
  acknowledgeLossy?: boolean;
}

export interface DataExportPlanEntry {
  dataset: DataExportDatasetId;
  format: DataExportFormat;
  fileName: string;
  mediaType: string;
  fidelity: DataExportFidelity;
  /** Records the filter selects, when the daemon could count them cheaply. */
  recordCount?: number;
  /** Filter keys the caller supplied that this dataset ignores. */
  ignoredFilters?: DataExportFilterKey[];
}

export interface DataExportPlan {
  schemaVersion: number;
  encoding: string;
  lineEnding: DataExportLineEnding;
  generatedAt: string;
  entries: DataExportPlanEntry[];
  archive?: {
    kind: DataExportArchiveKind;
    fileName: string;
    /** The exact switch list a 7z run would use, with the password redacted. */
    sevenZipSwitches?: string[];
    cost?: SevenZipCostEstimate;
  };
  /** Every warning across every entry plus the archive, deduplicated by code+dataset. */
  warnings: Array<DataExportWarning & { dataset?: DataExportDatasetId; format?: DataExportFormat }>;
  /** True when at least one warning is `blocking`. */
  requiresAcknowledgement: boolean;
}

/** The envelope written into (or beside) every exported file. */
export interface DataExportEnvelope {
  schemaVersion: number;
  encoding: string;
  lineEnding: DataExportLineEnding;
  generatedAt: string;
  dataset: DataExportDatasetId;
  datasetLabel: string;
  format: DataExportFormat;
  recordCount: number;
  fields: readonly DataExportFieldDescriptor[];
  /**
   * Only the filter keys this dataset actually applied — see
   * `applicableDataExportFilter`. Anything the caller supplied that this dataset
   * does not understand is in `ignoredFilters` instead, never silently folded in
   * here as though it had scoped the records below.
   */
  filter: DataExportFilter;
  /** Filter keys the caller supplied that this dataset does not apply. */
  ignoredFilters: DataExportFilterKey[];
  /**
   * False when the records below are a prefix rather than the whole result: the
   * scan stopped at the record ceiling, or a source could not be read. `warnings`
   * says which.
   */
  complete: boolean;
  /**
   * Run warnings scoped to this dataset — the record ceiling, ignored filters, an
   * unreadable source. Format costs live in `fidelity.warnings`; these are about
   * what the run itself could not carry, so a self-describing file says so inline
   * instead of only in a response header.
   */
  warnings: DataExportWarning[];
  fidelity: DataExportFidelity;
  /** Product that wrote the file, so the schema version has an owner. */
  producer: string;
}

export interface DataExportResult {
  ok: boolean;
  /** Absolute path the CLI wrote to. */
  path?: string;
  bytes?: number;
  entries?: Array<{ dataset: DataExportDatasetId; format: DataExportFormat; fileName: string; recordCount: number }>;
  archive?: { kind: DataExportArchiveKind; fileName: string };
  warnings?: DataExportPlan['warnings'];
  error?: string;
}

export const DATA_EXPORT_PRODUCER = 'open-design-daemon';

/** `od-export-messages-v1-20260803T041833Z.jsonl` */
export function dataExportFileName(
  dataset: DataExportDatasetId,
  format: DataExportFormat,
  generatedAt: string,
): string {
  const stamp = generatedAt.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const extension = DATA_EXPORT_FORMAT_DESCRIPTORS[format].extension;
  return `od-export-${dataset}-v${DATA_EXPORT_SCHEMA_VERSION}-${stamp}.${extension}`;
}

export function resolveDataExportDatasets(request: Pick<DataExportRequest, 'datasets'>): DataExportDatasetId[] {
  if (request.datasets === 'all') return [...DATA_EXPORT_DATASET_IDS];
  const seen = new Set<DataExportDatasetId>();
  for (const id of request.datasets) {
    if (isDataExportDatasetId(id)) seen.add(id);
  }
  return [...seen];
}

export function resolveDataExportFormat(
  request: Pick<DataExportRequest, 'format' | 'formats'>,
  dataset: DataExportDatasetId,
): DataExportFormat {
  const perDataset = request.formats?.[dataset];
  return perDataset && isDataExportFormat(perDataset) ? perDataset : request.format;
}

/**
 * Build the plan skeleton — everything except record counts, which need the
 * database. The daemon fills `recordCount` in and re-emits the same object, so
 * `/api/export/plan` and `/api/export` cannot disagree about fidelity.
 */
export function buildDataExportPlan(
  request: DataExportRequest,
  options: { generatedAt: string; archiveFileName?: string },
): DataExportPlan {
  const datasets = resolveDataExportDatasets(request);
  const { filter } = normalizeDataExportFilter(request.filter);
  const entries: DataExportPlanEntry[] = datasets.map((dataset) => {
    const format = resolveDataExportFormat(request, dataset);
    const ignored = unsupportedDataExportFilterKeys(dataset, filter);
    return {
      dataset,
      format,
      fileName: dataExportFileName(dataset, format, options.generatedAt),
      mediaType: DATA_EXPORT_FORMAT_DESCRIPTORS[format].mediaType,
      fidelity: describeDataExportFidelity(dataset, format),
      ...(ignored.length > 0 ? { ignoredFilters: ignored } : {}),
    };
  });

  const warnings: DataExportPlan['warnings'] = [];
  for (const entry of entries) {
    for (const warning of entry.fidelity.warnings) {
      warnings.push({ ...warning, dataset: entry.dataset, format: entry.format });
    }
  }

  let archive: DataExportPlan['archive'];
  if (request.archive) {
    const fileName = options.archiveFileName ?? `od-export-v${DATA_EXPORT_SCHEMA_VERSION}`;
    if (request.archive.kind === '7z') {
      const validation = validateSevenZipOptions(request.archive.sevenZip ?? {});
      warnings.push(...validation.warnings);
      archive = {
        kind: '7z',
        fileName: `${fileName}.7z`,
        sevenZipSwitches: redactSevenZipSwitches(buildSevenZipSwitches(validation.resolved)),
        cost: describeSevenZipCost(validation.resolved),
      };
    } else {
      archive = { kind: 'zip', fileName: `${fileName}.zip` };
      if (request.archive.sevenZip?.password) {
        warnings.push({
          code: 'archive-encryption-unsupported',
          severity: 'blocking',
          message:
            'ZIP archives here are written without encryption, so the password would be silently ignored. ' +
            'Use the 7z archive kind, which encrypts both content and filenames with AES-256.',
        });
      }
    }
  }

  return {
    schemaVersion: DATA_EXPORT_SCHEMA_VERSION,
    encoding: DATA_EXPORT_ENCODING,
    lineEnding: DATA_EXPORT_LINE_ENDING,
    generatedAt: options.generatedAt,
    entries,
    ...(archive ? { archive } : {}),
    warnings,
    requiresAcknowledgement: warnings.some((warning) => warning.severity === 'blocking'),
  };
}

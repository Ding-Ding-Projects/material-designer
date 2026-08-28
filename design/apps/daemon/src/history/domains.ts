// What the history store snapshots, and how a change earns a name.
//
// A *domain* is one group of user-managed records the app owns: the app's
// settings, connector accounts, BYOK profiles, MCP servers, memory, the
// automation stores. Each domain declares its sources; the store mirrors those
// sources into the snapshot repository byte-for-byte and never parses them for
// storage. Parsing happens only to *describe* a change, and a parse failure
// degrades to a path-level label rather than losing the snapshot.
//
// Every source path is relative to the resolved daemon data root, per the
// Daemon data directory contract in AGENTS.md. Nothing here may derive a path
// from cwd, an app name, a port, or a namespace.

/** A file or directory under the daemon data root, mirrored verbatim. */
export interface HistoryFileSource {
  kind: 'file' | 'dir';
  /** Path relative to the resolved daemon data root. */
  dataPath: string;
  /**
   * How to read individual records out of this file when naming a change.
   * `object` treats top-level keys as records; `array` treats array elements
   * as records keyed by `idField`. Omitted means "describe at file level".
   */
  recordKeys?: 'object' | 'array';
  /**
   * Top-level property the records actually live under, for stores that wrap
   * them — `{ "version": 1, "profiles": [...] }` needs `recordsAt: 'profiles'`.
   * Without it the wrapper's own keys would be read as the records and the
   * label would name `version` instead of the profile someone deleted.
   */
  recordsAt?: string;
  idField?: string;
  /** Field holding a record's human name, e.g. `label` or `name`. */
  labelField?: string;
}

/**
 * A record set that does not live in a file of its own — SQLite tables, most
 * obviously. The domain serializes it on capture and applies it on restore;
 * the store only ever sees the JSON in between.
 */
export interface HistoryPayloadSource {
  kind: 'payload';
  /** File name inside this domain's folder in the snapshot repository. */
  fileName: string;
  read: () => unknown | Promise<unknown>;
  write: (value: unknown) => void | Promise<void>;
  recordKeys?: 'object' | 'array';
  recordsAt?: string;
  idField?: string;
  labelField?: string;
}

export type HistorySource = HistoryFileSource | HistoryPayloadSource;

export interface HistoryDomain {
  /** Stable slug. Also the folder name inside the snapshot repository. */
  id: string;
  label: string;
  /** Singular noun used in generated labels: "Deleted the connector account". */
  noun: string;
  nounPlural: string;
  /** Honest note about anything this domain deliberately does not capture. */
  note?: string;
  /**
   * Credential-adjacent bytes. The HTTP surface never returns a sensitive
   * entry's stored content, so history cannot be used to read out a secret the
   * normal API would refuse to hand over. Snapshotting is unaffected: restoring
   * a deleted account is the whole point of the feature.
   */
  sensitive?: boolean;
  sources: HistorySource[];
  /** Reload in-memory state after this domain's records were rewritten. */
  afterRestore?: () => void | Promise<void>;
}

export function domainSourceIsFile(source: HistorySource): source is HistoryFileSource {
  return source.kind === 'file' || source.kind === 'dir';
}

/**
 * Where a source lands inside the snapshot repository, relative to the repo
 * root. File sources keep their data-root-relative path so a restore can map
 * straight back; payload sources get a single file under the domain folder.
 */
export function repoPathForSource(domain: HistoryDomain, source: HistorySource): string {
  const tail = domainSourceIsFile(source) ? source.dataPath : source.fileName;
  return `records/${domain.id}/${tail}`;
}

/** The `records/<domainId>` prefix a repo path must start with to belong to a domain. */
export function repoPrefixForDomain(domainId: string): string {
  return `records/${domainId}/`;
}

export function domainIdForRepoPath(path: string): string | null {
  const segments = path.split('/');
  if (segments.length < 3) return null;
  if (segments[0] !== 'records') return null;
  return segments[1] ?? null;
}

// ---------------------------------------------------------------------------
// Naming a change
//
// "Updated" is not a label. The store asks the domain to describe what moved,
// and these helpers turn a before/after pair into sentences a person can act
// on: "Deleted the connector account github", "Added 2 MCP servers".
// ---------------------------------------------------------------------------

interface RecordSet {
  order: string[];
  byKey: Map<string, unknown>;
}

function recordNameFrom(value: unknown, key: string, labelField: string | undefined): string {
  if (labelField && typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const raw = (value as Record<string, unknown>)[labelField];
    if (typeof raw === 'string' && raw.trim().length > 0) return raw.trim();
  }
  return key;
}

/** Drill into the property the records live under, when the store wraps them. */
function unwrapRecords(parsed: unknown, recordsAt: string | undefined): unknown {
  if (!recordsAt) return parsed;
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined;
  return (parsed as Record<string, unknown>)[recordsAt];
}

function readRecordSet(
  parsed: unknown,
  recordKeys: 'object' | 'array',
  idField: string,
): RecordSet | null {
  const order: string[] = [];
  const byKey = new Map<string, unknown>();
  if (recordKeys === 'object') {
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      order.push(key);
      byKey.set(key, value);
    }
    return { order, byKey };
  }
  if (!Array.isArray(parsed)) return null;
  const items = parsed as unknown[];
  for (let index = 0; index < items.length; index += 1) {
    const value: unknown = items[index];
    const rawId = typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)[idField]
      : undefined;
    const key = typeof rawId === 'string' && rawId.length > 0
      ? rawId
      : typeof rawId === 'number'
        ? String(rawId)
        : `#${index}`;
    order.push(key);
    byKey.set(key, value);
  }
  return { order, byKey };
}

function parseJsonBytes(bytes: Buffer | null): unknown {
  if (!bytes || bytes.length === 0) return undefined;
  try {
    return JSON.parse(bytes.toString('utf8')) as unknown;
  } catch {
    return undefined;
  }
}

function stableStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? 'undefined';
  } catch {
    return 'unserializable';
  }
}

function phrase(
  verb: string,
  names: string[],
  noun: string,
  nounPlural: string,
): string | null {
  if (names.length === 0) return null;
  if (names.length === 1) return `${verb} the ${noun} ${names[0] ?? ''}`.trimEnd();
  if (names.length <= 3) return `${verb} the ${nounPlural} ${names.join(', ')}`;
  return `${verb} ${names.length} ${nounPlural}`;
}

/**
 * Describe a source's change in words. Returns an empty array when the source
 * has no record shape declared, when either side failed to parse, or when the
 * records are identical — the caller then falls back to a path-level label,
 * which is still honest, just coarser.
 */
export function describeSourceChange(
  domain: HistoryDomain,
  source: HistorySource,
  before: Buffer | null,
  after: Buffer | null,
): string[] {
  const recordKeys = source.recordKeys;
  if (!recordKeys) return [];

  const idField = source.idField ?? 'id';
  const beforeSet = readRecordSet(
    unwrapRecords(parseJsonBytes(before), source.recordsAt),
    recordKeys,
    idField,
  );
  const afterSet = readRecordSet(
    unwrapRecords(parseJsonBytes(after), source.recordsAt),
    recordKeys,
    idField,
  );
  if (!beforeSet && !afterSet) return [];

  const beforeRecords = beforeSet ?? { order: [], byKey: new Map<string, unknown>() };
  const afterRecords = afterSet ?? { order: [], byKey: new Map<string, unknown>() };

  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];

  for (const key of afterRecords.order) {
    const nextValue = afterRecords.byKey.get(key);
    if (!beforeRecords.byKey.has(key)) {
      added.push(recordNameFrom(nextValue, key, source.labelField));
      continue;
    }
    const priorValue = beforeRecords.byKey.get(key);
    if (stableStringify(priorValue) !== stableStringify(nextValue)) {
      changed.push(recordNameFrom(nextValue, key, source.labelField));
    }
  }
  for (const key of beforeRecords.order) {
    if (afterRecords.byKey.has(key)) continue;
    removed.push(recordNameFrom(beforeRecords.byKey.get(key), key, source.labelField));
  }

  const lines: string[] = [];
  const removedPhrase = phrase('Deleted', removed, domain.noun, domain.nounPlural);
  const addedPhrase = phrase('Added', added, domain.noun, domain.nounPlural);
  const changedPhrase = phrase('Updated', changed, domain.noun, domain.nounPlural);
  if (removedPhrase) lines.push(removedPhrase);
  if (addedPhrase) lines.push(addedPhrase);
  if (changedPhrase) lines.push(changedPhrase);
  return lines;
}

// ---------------------------------------------------------------------------
// The domains the daemon ships with
// ---------------------------------------------------------------------------

/**
 * File-backed record and settings domains, all derived from the resolved
 * daemon data root.
 *
 * Deliberately absent: `projects/` (project documents already carry their own
 * per-file version history in project-file-versions.ts, and mirroring every
 * artifact byte would double the largest thing on disk), `byok/secrets`
 * (retired Windows secret blobs — the live secret lives in the OS keychain),
 * and the installed-extension trees `skills/` `design-systems/`
 * `design-templates/` `plugins/`, which are third-party checkouts that carry
 * their own nested `.git` directories. Each absence is named here rather than
 * left as a silent gap.
 */
export function defaultHistoryDomains(): HistoryDomain[] {
  return [
    {
      id: 'settings',
      label: 'App settings',
      noun: 'setting',
      nounPlural: 'settings',
      note: 'Includes presentation-only appLogo state, with private source bytes excluded from snapshots and exports.',
      sources: [
        {
          kind: 'file',
          dataPath: 'app-config.json',
          recordKeys: 'object',
        },
      ],
    },
    {
      id: 'connectors',
      label: 'Connector accounts',
      noun: 'connector account',
      nounPlural: 'connector accounts',
      sensitive: true,
      sources: [
        {
          kind: 'file',
          dataPath: 'connectors/credentials.json',
          recordKeys: 'object',
          labelField: 'accountLabel',
        },
        {
          kind: 'file',
          dataPath: 'connectors/composio-config.json',
        },
      ],
    },
    {
      id: 'byok',
      label: 'BYOK provider profiles',
      noun: 'provider profile',
      nounPlural: 'provider profiles',
      note:
        'API keys live in the operating system keychain and are never captured. '
        + 'Restoring a deleted profile brings back its settings, not its key — re-enter the key afterwards.',
      sensitive: true,
      sources: [
        {
          kind: 'file',
          // `{ "version": 1, "profiles": [...] }` — see byok/credential-service.ts.
          dataPath: 'byok/profiles.json',
          recordKeys: 'array',
          recordsAt: 'profiles',
          idField: 'id',
          labelField: 'label',
        },
      ],
    },
    {
      id: 'mcp',
      label: 'MCP servers',
      noun: 'MCP server',
      nounPlural: 'MCP servers',
      sensitive: true,
      sources: [
        {
          kind: 'file',
          // `{ "servers": [ { id, label, … } ] }` — see mcp-config.ts.
          dataPath: 'mcp-config.json',
          recordKeys: 'array',
          recordsAt: 'servers',
          idField: 'id',
          labelField: 'label',
        },
        {
          kind: 'file',
          dataPath: 'mcp-tokens.json',
        },
        {
          kind: 'file',
          dataPath: 'mcp-oauth-clients.json',
        },
      ],
    },
    {
      id: 'xai',
      label: 'xAI tokens',
      noun: 'xAI token',
      nounPlural: 'xAI tokens',
      sensitive: true,
      sources: [
        {
          kind: 'file',
          dataPath: 'xai-tokens.json',
        },
      ],
    },
    {
      id: 'memory',
      label: 'Memory',
      noun: 'memory file',
      nounPlural: 'memory files',
      sources: [
        {
          kind: 'dir',
          dataPath: 'memory',
        },
      ],
    },
    {
      id: 'automations',
      label: 'Automation library',
      noun: 'automation record',
      nounPlural: 'automation records',
      note:
        'The record stores are captured; the derived markdown renderings written '
        + 'beside a proposal are not, so restoring a proposal restores its record.',
      sources: [
        {
          kind: 'file',
          // Each of these wraps its records in a single named property; see the
          // matching automation-*.ts writers.
          dataPath: 'automation-templates/templates.json',
          recordKeys: 'array',
          recordsAt: 'templates',
          idField: 'id',
          labelField: 'name',
        },
        {
          kind: 'file',
          dataPath: 'automation-proposals/proposals.json',
          recordKeys: 'array',
          recordsAt: 'proposals',
          idField: 'id',
        },
        {
          kind: 'file',
          dataPath: 'automation-source-packets/packets.json',
          recordKeys: 'array',
          recordsAt: 'packets',
          idField: 'id',
        },
      ],
    },
    {
      id: 'orbit',
      label: 'Orbit',
      noun: 'orbit record',
      nounPlural: 'orbit records',
      sources: [
        {
          kind: 'dir',
          dataPath: 'orbit',
        },
      ],
    },
  ];
}

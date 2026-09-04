// Local, Git-backed version history for everything the app owns.
//
// The daemon keeps an append-only snapshot repository beside its own data —
// derived from the resolved daemon data root, never a `.git` inside a user's
// project folder — and commits a revision whenever a record or a setting
// changes. "Record" here is not just documents: connector accounts, BYOK
// profiles, MCP servers, memory, automations, and the app's own settings all
// snapshot through the same store, so deleting an account by mistake is as
// undoable as deleting a file.
//
// Two invariants shape this contract:
//
//  1. History is append-only. A restore does NOT rewind the branch: it writes
//     the historical bytes back into the live locations and records that as a
//     NEW revision on top of the tip. So an undo can be undone, and that undo
//     undone in turn, and the state you started from is never lost.
//  2. An unchanged state records nothing. If a mutation left the captured
//     bytes identical, no revision is written, so the list stays a list of
//     real events rather than a list of saves.

/** Why a revision exists. `prune` is the retention event itself. */
export type HistoryRevisionKind = 'initial' | 'mutation' | 'restore' | 'prune';

export type HistoryChangeStatus = 'added' | 'modified' | 'deleted';

export type HistoryActionId =
  | 'initial' | 'created' | 'updated' | 'deleted' | 'restored'
  | 'undone' | 'pruned' | 'settings' | 'recorded';

export interface HistoryActionDescriptor {
  id: HistoryActionId;
  category: 'lifecycle' | 'change' | 'domain' | 'fallback';
}

export interface HistoryDomainInfo {
  /** Stable slug, e.g. `connectors`. Used as the filter value. */
  id: string;
  label: string;
  /**
   * Honest note about anything this domain deliberately does not capture —
   * e.g. BYOK secrets live in the OS keychain and are not in history, so a
   * restored profile comes back with its settings but not its key.
   */
  note?: string;
  /**
   * True when the domain mirrors credential-adjacent bytes. The daemon never
   * returns the stored content of a sensitive entry over HTTP; it reports the
   * size and digest instead, so history cannot become a side channel that
   * reads out credentials the normal API would refuse.
   */
  sensitive: boolean;
}

export interface HistoryChange {
  /** Domain this change belongs to. */
  domainId: string;
  /** Path inside the snapshot repository. */
  path: string;
  status: HistoryChangeStatus;
}

export interface HistoryRevisionSummary {
  /**
   * Stable revision id. This is NOT the git commit hash: pruning rebuilds the
   * retained commits, so hashes move while ids do not. Restore takes this id.
   */
  id: string;
  /** Git commit backing the revision right now. Informational only. */
  commit: string;
  kind: HistoryRevisionKind;
  /** What changed, in words — "Deleted the connector account github". */
  label: string;
  /** Further lines when one revision coalesced a burst of edits. */
  details: string[];
  /** Epoch milliseconds. */
  createdAt: number;
  domainIds: string[];
  changeCount: number;
  /** Set on a `restore` revision: the revision whose content was restored. */
  restoredFromId: string | null;
  /** Stable daemon-owned action ids. Older revisions may omit this trailer. */
  actionIds?: HistoryActionId[];
}

export interface HistoryRevision extends HistoryRevisionSummary {
  changes: HistoryChange[];
}

export interface HistoryEntryContent {
  path: string;
  size: number;
  /** SHA-256 of the stored bytes, so a redacted entry is still verifiable. */
  digest: string;
  encoding: 'utf8' | 'base64';
  /**
   * Stored bytes. Null when `redacted` is true — the entry belongs to a
   * sensitive domain and the daemon refuses to hand its content back over
   * HTTP. Ciphertext is mirrored verbatim, so an encrypted store stays
   * encrypted in history and this field is base64 of the ciphertext.
   */
  content: string | null;
  redacted: boolean;
}

export interface HistoryRetentionPolicy {
  /** Keep at most this many revisions. Null disables the count limit. */
  maxRevisions: number | null;
  /** Drop revisions older than this. Null disables the age limit. */
  maxAgeDays: number | null;
}

export const HISTORY_REVISION_KINDS: readonly HistoryRevisionKind[] = [
  'initial',
  'mutation',
  'restore',
  'prune',
];

/** Longest pattern the daemon will compile for a history search. */
export const HISTORY_QUERY_MAX_LENGTH = 200;

export interface HistoryListQuery {
  domainId?: string;
  kind?: HistoryRevisionKind;
  /** Epoch ms, inclusive. */
  since?: number;
  /** Epoch ms, inclusive. */
  until?: number;
  /** Matched against the label and detail lines. */
  query?: string;
  /** Treat `query` as a regular expression instead of plain text. */
  regex?: boolean;
  limit?: number;
  offset?: number;
}

export interface HistoryListResponse {
  /**
   * False when the snapshot repository cannot be used at all (git missing,
   * data root not writable). The daemon says so rather than reporting an
   * empty history that looks like "nothing ever happened".
   */
  available: boolean;
  unavailableReason: string | null;
  domains: HistoryDomainInfo[];
  revisions: HistoryRevisionSummary[];
  /** Revisions matching the filter, before `limit`/`offset` are applied. */
  total: number;
  retention: HistoryRetentionPolicy;
  /** Data-derived action inventory for the returned history. */
  actionDescriptors?: HistoryActionDescriptor[];
}

/** Redacted acknowledgement sent by appearance settings after a local edit. */
export interface HistoryMutationRequest {
  /** Stable history domain slug, never a filesystem path. */
  domainId: string;
  /** Stable element or property id, never a filesystem path or style payload. */
  targetId: string;
  /** Human-readable bounded action name, for example "updated". */
  action: string;
  /** Client-generated idempotency key for this mutation acknowledgement. */
  revisionId: string;
}

export interface HistoryMutationResponse {
  acknowledged: true;
  duplicate: boolean;
  /** The newly appended local history revision id. */
  historyRevisionId: string;
}

export interface HistoryRevisionResponse {
  revision: HistoryRevision;
  /** Present only when the request asked for one entry's stored bytes. */
  entry: HistoryEntryContent | null;
}

export interface HistoryRestoreRequest {
  revisionId: string;
  /**
   * Restrict the restore to these domains. Omitted restores every domain the
   * target revision captured; domains added after that revision are left
   * alone rather than being emptied.
   */
  domainIds?: string[];
  /** Overrides the generated "Restored …" label. */
  label?: string;
}

export interface HistoryRestoreResponse {
  /** The revision whose content was written back. */
  from: HistoryRevisionSummary;
  /**
   * The NEW revision the restore recorded. Null when the live state already
   * matched the target, because an unchanged state records nothing.
   */
  recorded: HistoryRevisionSummary | null;
  unchanged: boolean;
  changes: HistoryChange[];
  /** Domains that were in scope for this restore. */
  domainIds: string[];
}

export interface HistoryPruneRequest {
  policy?: HistoryRetentionPolicy;
  /** Defaults to true: report what would go before anything goes. */
  dryRun?: boolean;
}

export interface HistoryPruneResponse {
  dryRun: boolean;
  policy: HistoryRetentionPolicy;
  /** Revisions outside the retention window, oldest first. */
  removed: HistoryRevisionSummary[];
  keptCount: number;
  /** The prune event itself, appended to the log. Null on a dry run. */
  recorded: HistoryRevisionSummary | null;
}

export interface HistoryRetentionResponse {
  retention: HistoryRetentionPolicy;
}

export interface HistoryDomainsResponse {
  available: boolean;
  unavailableReason: string | null;
  domains: HistoryDomainInfo[];
}

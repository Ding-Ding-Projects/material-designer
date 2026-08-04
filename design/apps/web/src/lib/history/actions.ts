// What the version-history panel filters by, and how it counts.
//
// The panel's action filter is *derived from the history itself*, never from a
// hard-coded menu. That distinction is the whole point: a fixed list drifts
// from what the daemon actually records, so the user is offered filters that
// can never match and denied ones that would. Here, an action appears in the
// facet list only when at least one loaded revision carries it, and it carries
// the count that made it appear. "Imported" is the worked example — the daemon
// records no import event today, so no import filter is ever offered, and the
// day it does record one the filter appears without a line changing here.
//
// Everything in this module is pure. The panel owns the fetching, the dialog
// and the focus; this owns the arithmetic, so the arithmetic can be tested
// without a daemon, a network or a DOM.

import type { HistoryRevisionSummary } from '@open-design/contracts';

/**
 * One recorded action. These are not invented categories: each maps to
 * something the daemon's history store demonstrably writes.
 *
 *  - `initial`  — the first snapshot, `kind: 'initial'`.
 *  - `created` / `updated` / `deleted` — the three verbs the store's own label
 *    generator emits (`domains.ts` `phrase()` writes "Added"/"Updated"/
 *    "Deleted"; `store.ts` `describeChangedPaths()` writes the lower-case
 *    "added N"/"changed N"/"deleted N" fallback). The list DTO carries no
 *    per-change status, so the recorded sentence is the only place the
 *    distinction lives, and reading it back is the honest derivation.
 *  - `restored` — `kind: 'restore'`.
 *  - `undone`   — a restore whose target was itself a restore. History is
 *    append-only, so undoing an undo is a normal thing to do and worth being
 *    able to find again.
 *  - `pruned`   — `kind: 'prune'`, the retention event itself.
 *  - `settings` — the revision touched the `settings` domain. Settings ride in
 *    the same snapshot as the records they configure, so being able to ask
 *    "when did the configuration move" is a first-class question.
 *  - `recorded` — a mutation whose sentence matched none of the three verbs.
 *    Deliberately its own bucket rather than being folded into `updated`: a
 *    revision we could not classify is not evidence that something was
 *    updated, and saying so is better than guessing.
 */
export type HistoryActionId =
  | 'initial'
  | 'created'
  | 'updated'
  | 'deleted'
  | 'restored'
  | 'undone'
  | 'pruned'
  | 'settings'
  | 'recorded';

/**
 * Display order for the facet row. Only ids that actually occurred are shown,
 * so this is an ordering, not a menu.
 */
export const HISTORY_ACTION_ORDER: readonly HistoryActionId[] = [
  'created',
  'updated',
  'deleted',
  'settings',
  'restored',
  'undone',
  'pruned',
  'initial',
  'recorded',
];

/** The domain id whose changes count as a settings change. */
const SETTINGS_DOMAIN_ID = 'settings';

/**
 * The verbs the daemon writes. Both cases are matched because the store has
 * two label paths — the record-level one that starts a sentence ("Deleted the
 * connector account github") and the path-level fallback that does not
 * ("App settings: deleted 2 settings, added 1 setting").
 */
const VERB_PATTERNS: ReadonlyArray<readonly [HistoryActionId, RegExp]> = [
  ['created', /\badded\b/iu],
  ['updated', /\b(?:updated|changed)\b/iu],
  ['deleted', /\bdeleted\b/iu],
];

function revisionText(revision: HistoryRevisionSummary): string {
  return [revision.label, ...revision.details].join('\n');
}

/**
 * Every action one revision carries. A revision can carry several — a single
 * coalesced burst genuinely can add one account and delete another, and
 * collapsing that to one verb would hide half of what happened.
 *
 * `byId` lets `undone` be decided: a restore whose target is itself a restore
 * is an undo of an undo. When the target is not loaded the revision is still
 * `restored`, never guessed at.
 */
export function actionsForRevision(
  revision: HistoryRevisionSummary,
  byId: ReadonlyMap<string, HistoryRevisionSummary>,
): HistoryActionId[] {
  const actions: HistoryActionId[] = [];

  if (revision.kind === 'initial') actions.push('initial');
  if (revision.kind === 'prune') actions.push('pruned');
  if (revision.kind === 'restore') {
    actions.push('restored');
    const target =
      revision.restoredFromId == null ? undefined : byId.get(revision.restoredFromId);
    if (target?.kind === 'restore') actions.push('undone');
  }

  if (revision.kind === 'mutation') {
    const text = revisionText(revision);
    let matched = false;
    for (const [id, pattern] of VERB_PATTERNS) {
      if (!pattern.test(text)) continue;
      actions.push(id);
      matched = true;
    }
    if (!matched) actions.push('recorded');
  }

  // Orthogonal to the verb: a revision can be both "deleted" and "settings".
  if (revision.domainIds.includes(SETTINGS_DOMAIN_ID)) actions.push('settings');

  return actions;
}

export interface HistoryActionFacet {
  readonly id: HistoryActionId;
  readonly count: number;
}

/**
 * The action filter's own row: which actions the loaded revisions contain, and
 * how many carry each. An action with no revisions is absent rather than shown
 * at zero — an empty filter offers the user a click that provably does nothing.
 */
export function historyActionFacets(
  revisions: readonly HistoryRevisionSummary[],
): HistoryActionFacet[] {
  const byId = indexRevisions(revisions);
  const counts = new Map<HistoryActionId, number>();
  for (const revision of revisions) {
    for (const action of new Set(actionsForRevision(revision, byId))) {
      counts.set(action, (counts.get(action) ?? 0) + 1);
    }
  }
  const facets: HistoryActionFacet[] = [];
  for (const id of HISTORY_ACTION_ORDER) {
    const count = counts.get(id);
    if (count === undefined || count === 0) continue;
    facets.push({ id, count });
  }
  return facets;
}

export function indexRevisions(
  revisions: readonly HistoryRevisionSummary[],
): Map<string, HistoryRevisionSummary> {
  const byId = new Map<string, HistoryRevisionSummary>();
  for (const revision of revisions) byId.set(revision.id, revision);
  return byId;
}

/**
 * The local calendar day a revision belongs to, as `YYYY-MM-DD`.
 *
 * Local, not UTC, and deliberately so: the date picker is a calendar the user
 * reads beside a timestamp the user reads, and a revision written at 23:30 must
 * not fall out of the range that names the day it visibly happened. The
 * comparison is then lexical, which is exactly what the changelog's date range
 * already produces and what `ChangelogDateRange` hands back.
 */
export function localIsoDay(epochMs: number): string {
  const date = new Date(epochMs);
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export interface HistoryFilter {
  /** Inclusive `YYYY-MM-DD`, or null for unbounded. */
  readonly from: string | null;
  readonly to: string | null;
  /** Empty means every action; otherwise the union of those selected. */
  readonly actions: readonly HistoryActionId[];
  /** Empty means every domain; otherwise the union of those selected. */
  readonly domainIds: readonly string[];
  /** The search field's raw text. Plain text unless `matches` is supplied. */
  readonly query: string;
}

export const EMPTY_HISTORY_FILTER: HistoryFilter = {
  from: null,
  to: null,
  actions: [],
  domainIds: [],
  query: '',
};

export interface HistoryFilterResult {
  readonly revisions: HistoryRevisionSummary[];
  /** Facets over the *loaded* set, so the counts do not move as the user types. */
  readonly facets: HistoryActionFacet[];
  readonly matched: number;
  readonly total: number;
  /** The date span the loaded revisions actually cover, for the calendar. */
  readonly bounds: { readonly first: string | null; readonly last: string | null };
}

function plainTextMatches(revision: HistoryRevisionSummary, query: string): boolean {
  const terms = query
    .toLowerCase()
    .split(/\s+/u)
    .filter((term) => term.length > 0);
  if (terms.length === 0) return true;
  const haystack = revisionText(revision).toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

/**
 * Apply every filter at once.
 *
 * The four compose rather than override: a date range narrows the set the
 * action counts describe, the actions narrow what the search runs over, and the
 * search never resets either. That is the failure this signature is shaped to
 * prevent — three separate filters applied in three separate places drift into
 * one silently winning.
 *
 * `matches` is the search field's own compiled predicate in regex mode, passed
 * in rather than compiled here so the regex builder stays the single owner of
 * the pattern, its flags and its bounds.
 */
export function filterHistory(
  revisions: readonly HistoryRevisionSummary[],
  filter: HistoryFilter,
  matches: ((text: string) => boolean) | null,
): HistoryFilterResult {
  const facets = historyActionFacets(revisions);
  const byId = indexRevisions(revisions);

  let first: string | null = null;
  let last: string | null = null;
  for (const revision of revisions) {
    const day = localIsoDay(revision.createdAt);
    if (first == null || day < first) first = day;
    if (last == null || day > last) last = day;
  }

  const wantedActions = new Set(filter.actions);
  const wantedDomains = new Set(filter.domainIds);
  const query = filter.query.trim();

  const kept = revisions.filter((revision) => {
    const day = localIsoDay(revision.createdAt);
    if (filter.from != null && day < filter.from) return false;
    if (filter.to != null && day > filter.to) return false;

    if (wantedDomains.size > 0) {
      if (!revision.domainIds.some((id) => wantedDomains.has(id))) return false;
    }

    if (wantedActions.size > 0) {
      const actions = actionsForRevision(revision, byId);
      if (!actions.some((action) => wantedActions.has(action))) return false;
    }

    if (query.length === 0) return true;
    return matches != null ? matches(revisionText(revision)) : plainTextMatches(revision, query);
  });

  return {
    revisions: kept,
    facets,
    matched: kept.length,
    total: revisions.length,
    bounds: { first, last },
  };
}

/**
 * Whether anything is currently narrowing the list. Used to decide whether a
 * collapsed filter row has to say that it is hiding results — a filter quietly
 * excluding rows is how a user comes to believe their data is missing.
 */
export function historyFilterIsActive(filter: HistoryFilter): boolean {
  return (
    filter.from != null
    || filter.to != null
    || filter.actions.length > 0
    || filter.domainIds.length > 0
    || filter.query.trim().length > 0
  );
}

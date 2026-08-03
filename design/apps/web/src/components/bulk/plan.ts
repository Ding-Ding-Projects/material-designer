// "42 selected" and "42 will change" are different claims.
//
// This is the file that refuses to let a list conflate them. A bulk action runs
// over a selection, but a selection is not a work list: some of it is
// ineligible (a file an agent is currently writing to, a brand still
// extracting), and some of it has quietly ceased to exist since the user ticked
// it. A preview that showed only the eligible rows would hide the first, and a
// preview built from the selection alone would silently promise the second.
//
// So `planBulkAction` returns four lists, all of them named:
//
//   selected    — what the user picked, whether or not it can be acted on
//   willChange  — what pressing the button actually touches
//   skipped     — picked, present, but ineligible, each with the reason
//   missing     — picked and no longer in the list at all
//
// Nothing is dropped anywhere in here. A row that is not in `willChange` is in
// `skipped` or `missing`, and the dialog says which, because "it just didn't
// happen" is the worst outcome a bulk action can have.

export interface BulkItem {
  readonly id: string;
  /** What the preview shows for this row. Never a raw id. */
  readonly label: string;
}

/**
 * Why a row was held back, as a token rather than a sentence.
 *
 * The host owns the copy — it is the only layer that can send a reason through
 * `t()` — and a token keeps this file out of the translation dictionary while
 * still forcing every skip to carry a stated cause.
 */
export type BulkSkipReason = string;

export interface BulkSkip<T extends BulkItem> {
  readonly item: T;
  readonly reason: BulkSkipReason;
}

export interface BulkPlan<T extends BulkItem> {
  readonly selected: readonly T[];
  readonly willChange: readonly T[];
  readonly skipped: readonly BulkSkip<T>[];
  readonly missing: readonly string[];
}

/**
 * Decide whether one row can be acted on. Returns null when it can, or the
 * reason token when it cannot.
 */
export type BulkEligibility<T extends BulkItem> = (item: T) => BulkSkipReason | null;

/** For actions with nothing to refuse. Named so a caller has to mean it. */
export const ALWAYS_ELIGIBLE: BulkEligibility<BulkItem> = () => null;

/**
 * Build the plan.
 *
 * `items` is the list as it stands right now, in render order; `selectedIds` is
 * what the user ticked, possibly some time ago. The difference between the two
 * is `missing`, and computing it here is the only way the dialog can say "two of
 * these are gone" instead of quietly running over forty when the user selected
 * forty-two.
 */
export function planBulkAction<T extends BulkItem>(
  items: readonly T[],
  selectedIds: ReadonlySet<string>,
  eligibility: BulkEligibility<T> = ALWAYS_ELIGIBLE,
): BulkPlan<T> {
  const selected: T[] = [];
  const willChange: T[] = [];
  const skipped: BulkSkip<T>[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    if (!selectedIds.has(item.id)) continue;
    // A list that repeats an id would otherwise plan the same row twice and
    // run the action on it twice, which for "delete" is merely wasteful and for
    // "duplicate" is a bug the user has to clean up.
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    selected.push(item);
    const reason = eligibility(item);
    if (reason === null) willChange.push(item);
    else skipped.push({ item, reason });
  }

  const missing: string[] = [];
  for (const id of selectedIds) {
    if (!seen.has(id)) missing.push(id);
  }

  return { selected, willChange, skipped, missing };
}

export interface BulkPlanCounts {
  readonly selected: number;
  readonly willChange: number;
  readonly skipped: number;
  readonly missing: number;
}

/**
 * The numbers the confirmation reads out.
 *
 * `selected` counts the rows still in the list plus the ones that vanished,
 * because that is the number the user last saw on the bar and the number they
 * will be comparing against.
 */
export function bulkPlanCounts<T extends BulkItem>(plan: BulkPlan<T>): BulkPlanCounts {
  return {
    selected: plan.selected.length + plan.missing.length,
    willChange: plan.willChange.length,
    skipped: plan.skipped.length,
    missing: plan.missing.length,
  };
}

/** Nothing to do is not an error, but it must never be presented as a run. */
export function bulkPlanRunnable<T extends BulkItem>(plan: BulkPlan<T>): boolean {
  return plan.willChange.length > 0;
}

/** True when the plan will touch strictly fewer rows than the user picked. */
export function bulkPlanHasShortfall<T extends BulkItem>(plan: BulkPlan<T>): boolean {
  const counts = bulkPlanCounts(plan);
  return counts.willChange < counts.selected;
}

export interface BulkSkipGroup<T extends BulkItem> {
  readonly reason: BulkSkipReason;
  readonly items: readonly T[];
}

/**
 * Skips grouped by cause, in first-seen order.
 *
 * Thirty rows held back for one reason should read as one line with a count,
 * not thirty lines — a wall of identical rows is how a reviewable preview stops
 * being read.
 */
export function groupBulkSkips<T extends BulkItem>(plan: BulkPlan<T>): BulkSkipGroup<T>[] {
  const order: BulkSkipReason[] = [];
  const byReason = new Map<BulkSkipReason, T[]>();
  for (const skip of plan.skipped) {
    const bucket = byReason.get(skip.reason);
    if (bucket) {
      bucket.push(skip.item);
    } else {
      order.push(skip.reason);
      byReason.set(skip.reason, [skip.item]);
    }
  }
  return order.map((reason) => ({ reason, items: byReason.get(reason) ?? [] }));
}

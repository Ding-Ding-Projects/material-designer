// "Close tabs containing text" and "Close tabs NOT containing text".
//
// The whole point of this file is that those two actions are ONE predicate.
// Written as two independent matchers they drift: one lowercases and the other
// does not, one compiles the regex with `i` and the other forgets, and a user
// who runs "not containing" expecting the complement of what the preview just
// showed loses tabs that the first action would have kept. So `compileBulkCloseMatcher`
// produces exactly one `test`, and `planBulkClose` picks a tab with
// `direction === 'containing' ? test(label) : !test(label)`. There is no second
// call site where a flag could diverge.
//
// Matching reads the tab's visible label and nothing else. It never inspects
// page contents, file bodies or hidden fields — a bulk close that matched on
// data the user cannot see would be unreviewable by definition.

export type BulkCloseMatchMode = 'text' | 'regex';
export type BulkCloseDirection = 'containing' | 'notContaining';

export interface BulkCloseQuery {
  query: string;
  mode: BulkCloseMatchMode;
  caseSensitive: boolean;
}

/**
 * Why a query cannot run. Reasons rather than sentences: the component owns
 * the copy so the message goes through `t()` like everything else.
 *
 * - `empty`    — nothing typed. An empty query would match every tab in
 *                "not containing" mode, which is a way to close the whole
 *                workspace by pressing a button twice.
 * - `tooLong`  — past MAX_BULK_CLOSE_QUERY_LENGTH. A pathological pattern is
 *                the cheapest denial of service there is, and no real tab
 *                label needs 200 characters to be matched.
 * - `invalid`  — the regex did not compile. `detail` carries the engine's own
 *                message so the user can fix it rather than guess.
 */
export type BulkCloseMatcherError = 'empty' | 'tooLong' | 'invalid';

export const MAX_BULK_CLOSE_QUERY_LENGTH = 200;

export type BulkCloseMatcher =
  | {
      ok: true;
      mode: BulkCloseMatchMode;
      caseSensitive: boolean;
      query: string;
      /** The one predicate both directions are built from. */
      test: (label: string) => boolean;
    }
  | { ok: false; reason: BulkCloseMatcherError; detail?: string };

export function compileBulkCloseMatcher(input: BulkCloseQuery): BulkCloseMatcher {
  const query = input.query.trim();
  if (!query) return { ok: false, reason: 'empty' };
  if (query.length > MAX_BULK_CLOSE_QUERY_LENGTH) return { ok: false, reason: 'tooLong' };

  if (input.mode === 'regex') {
    let expression: RegExp;
    try {
      // No `u` flag: it would reject patterns a user can reasonably type
      // (`\-`, a lone `{`) that the non-unicode engine accepts, and this
      // matches tab labels rather than parsing a grammar.
      expression = new RegExp(query, input.caseSensitive ? '' : 'i');
    } catch (error) {
      return {
        ok: false,
        reason: 'invalid',
        detail: error instanceof Error ? error.message : String(error),
      };
    }
    return {
      ok: true,
      mode: 'regex',
      caseSensitive: input.caseSensitive,
      query,
      test: (label: string) => {
        // A `g`/`y` pattern would carry lastIndex between calls and make the
        // result depend on tab order; neither flag is set above, but resetting
        // is free and stops a future flag change from becoming a silent bug.
        expression.lastIndex = 0;
        return expression.test(label);
      },
    };
  }

  const needle = input.caseSensitive ? query : query.toLocaleLowerCase();
  return {
    ok: true,
    mode: 'text',
    caseSensitive: input.caseSensitive,
    query,
    test: (label: string) =>
      (input.caseSensitive ? label : label.toLocaleLowerCase()).includes(needle),
  };
}

export interface BulkCloseCandidate {
  id: string;
  label: string;
  /** Pinned by the user. Excluded unless the user explicitly opts in. */
  pinned: boolean;
  /** Structurally un-closable (the permanent entry tab). Never closable. */
  permanent: boolean;
}

export type BulkCloseExclusionReason = 'pinned' | 'permanent';

export interface BulkCloseExclusion<T extends BulkCloseCandidate> {
  tab: T;
  reason: BulkCloseExclusionReason;
}

export interface BulkClosePlan<T extends BulkCloseCandidate> {
  direction: BulkCloseDirection;
  /** Every tab the predicate selected, before exclusions. */
  selected: T[];
  /** What pressing the button will actually close. */
  close: T[];
  /** Selected but held back, each with the reason it was held back. */
  excluded: Array<BulkCloseExclusion<T>>;
}

/**
 * Turn a compiled matcher into a reviewable plan.
 *
 * `selected` and `close` are separate on purpose: "42 selected" and "42 will
 * close" are different claims, and a preview that quietly showed only the
 * second would hide the pinned tabs the action is about to skip. The caller
 * renders both, so nothing is silently dropped.
 */
export function planBulkClose<T extends BulkCloseCandidate>(
  candidates: readonly T[],
  matcher: Extract<BulkCloseMatcher, { ok: true }>,
  direction: BulkCloseDirection,
  options: { includePinned?: boolean } = {},
): BulkClosePlan<T> {
  const includePinned = options.includePinned === true;
  const selected: T[] = [];
  const close: T[] = [];
  const excluded: Array<BulkCloseExclusion<T>> = [];

  for (const candidate of candidates) {
    const matches = matcher.test(candidate.label);
    // The negation, and the only place either direction is decided.
    if (direction === 'containing' ? !matches : matches) continue;
    selected.push(candidate);
    if (candidate.permanent) {
      excluded.push({ tab: candidate, reason: 'permanent' });
      continue;
    }
    if (candidate.pinned && !includePinned) {
      excluded.push({ tab: candidate, reason: 'pinned' });
      continue;
    }
    close.push(candidate);
  }

  return { direction, selected, close, excluded };
}

/** The direction a plan did not take. Used by the symmetry test and by nothing else. */
export function oppositeBulkCloseDirection(
  direction: BulkCloseDirection,
): BulkCloseDirection {
  return direction === 'containing' ? 'notContaining' : 'containing';
}

// Bounded evaluation for the regex builder and the search bars it feeds.
//
// ── HOW THE BOUND WORKS ────────────────────────────────────────────────────
//
// Three independent limits, because they fail for different reasons:
//
//   1. Input size.  The pattern is capped at MAX_PATTERN_LENGTH and the sample
//      at MAX_SAMPLE_LENGTH before either reaches the engine. Backtracking
//      blow-ups grow with the length of the *subject*, so a short subject is
//      the cheapest protection there is. `{n,m}` counts are clamped in
//      `pattern.ts` for the same reason.
//   2. Iteration budget.  `runSample` checks a wall-clock deadline BETWEEN
//      `exec` calls and stops after MAX_SAMPLE_MATCHES. This bounds the loop —
//      a pattern that matches ten thousand times cannot lock the frame while
//      the builder collects them all.
//   3. Cumulative filter budget.  `createBoundedMatcher` adds up the time its
//      own `test` calls take across one filtering pass. Once the total passes
//      the budget it stops evaluating and returns `true` for everything after
//      that, so a list keeps rendering with nothing filtered out rather than
//      freezing, and nothing is ever hidden because the matcher gave up.
//
// ── WHAT IT DOES NOT COVER ─────────────────────────────────────────────────
//
// The desktop route uses a conservative structural parser before every
// synchronous evaluation. Nested quantified groups, quantified alternation,
// and quantified backreferences are refused before the engine is constructed,
// including nested forms discovered through the complete group stack. This is
// the safe fallback for a renderer that cannot kill a synchronous call. The
// site workbench uses a killable worker on its normal route and the same
// conservative parser when a worker cannot be created.

import { MAX_SAMPLE_LENGTH, classifyPatternRisk } from './pattern';

export const MAX_SAMPLE_MATCHES = 200;
/** Wall-clock budget for collecting matches in the builder preview. */
export const SAMPLE_BUDGET_MS = 25;
/** Wall-clock budget for one filtering pass over a list. */
export const FILTER_BUDGET_MS = 40;
/** Longest haystack a search bar hands to the engine for a single row. */
export const MAX_HAYSTACK_LENGTH = 4_000;

export interface SampleMatch {
  index: number;
  text: string;
  /** Capture groups 1..n, `undefined` where a group did not participate. */
  groups: (string | undefined)[];
  /** Named groups, or null when the pattern declares none. */
  named: Record<string, string | undefined> | null;
}

export interface SampleRun {
  matches: SampleMatch[];
  /** Stopped at MAX_SAMPLE_MATCHES — there are more. */
  truncated: boolean;
  /** Stopped at the time budget. */
  timedOut: boolean;
  /** The sample itself was longer than MAX_SAMPLE_LENGTH and was cut. */
  sampleTruncated: boolean;
  /** The subject actually scanned, after truncation. */
  scanned: string;
  /** Refused before the JavaScript engine was allowed to evaluate it. */
  refused: boolean;
  /** Human-readable reason for a refused or exhausted evaluation. */
  refusalReason: string | null;
}

/** ECMAScript's AdvanceStringIndex, so zero-width Unicode matches do not split
 * a surrogate pair into two fake positions. */
export function advanceStringIndex(input: string, index: number, unicode: boolean): number {
  if (!unicode) return Math.min(input.length, index + 1);
  const codePoint = input.codePointAt(index);
  return codePoint !== undefined && codePoint > 0xffff
    ? Math.min(input.length, index + 2)
    : Math.min(input.length, index + 1);
}

/**
 * Collect matches of `regex` in `sample`, under the budgets above.
 *
 * The caller's RegExp is never used directly: scanning mutates `lastIndex`,
 * and the same object is also the one a live search bar is testing with.
 */
export function runSample(regex: RegExp, sample: string): SampleRun {
  const sampleTruncated = sample.length > MAX_SAMPLE_LENGTH;
  const scanned = sampleTruncated ? sample.slice(0, MAX_SAMPLE_LENGTH) : sample;
  const risk = classifyPatternRisk(regex.source);
  if (risk.highRisk) {
    return {
      matches: [],
      truncated: false,
      timedOut: false,
      sampleTruncated,
      scanned,
      refused: true,
      refusalReason: risk.reason,
    };
  }

  let flags = regex.flags;
  // Sticky already advances through the subject; global is what makes a
  // non-sticky pattern iterate instead of returning match one forever.
  if (!flags.includes('g') && !flags.includes('y')) flags += 'g';

  let scan: RegExp;
  try {
    scan = new RegExp(regex.source, flags);
  } catch {
    return { matches: [], truncated: false, timedOut: false, sampleTruncated, scanned, refused: false, refusalReason: null };
  }

  const matches: SampleMatch[] = [];
  let truncated = false;
  let timedOut = false;
  const started = Date.now();
  scan.lastIndex = 0;

  for (;;) {
    const found = scan.exec(scanned);
    if (!found) break;
    matches.push({
      index: found.index,
      text: found[0],
      groups: found.slice(1),
      named: found.groups ? { ...found.groups } : null,
    });
    // A zero-width match leaves lastIndex where it was; without this the loop
    // would return the same empty match forever.
    if (found[0].length === 0) {
      const nextIndex = advanceStringIndex(scanned, scan.lastIndex, scan.unicode);
      if (nextIndex === scan.lastIndex && scan.lastIndex >= scanned.length) break;
      scan.lastIndex = nextIndex;
    }
    if (matches.length >= MAX_SAMPLE_MATCHES) {
      truncated = true;
      break;
    }
    if (Date.now() - started > SAMPLE_BUDGET_MS) {
      timedOut = true;
      break;
    }
    if (scan.lastIndex > scanned.length) break;
  }

  return { matches, truncated, timedOut, sampleTruncated, scanned, refused: false, refusalReason: null };
}

export interface HighlightSegment {
  text: string;
  /** Index into the match list, or null for the text between matches. */
  match: number | null;
}

/**
 * Split `text` into alternating plain and matched runs for rendering.
 *
 * Zero-width matches produce no segment — there is nothing to paint — so the
 * match count can legitimately exceed the number of highlighted runs.
 */
export function buildHighlightSegments(
  text: string,
  matches: readonly SampleMatch[],
): HighlightSegment[] {
  const segments: HighlightSegment[] = [];
  let cursor = 0;
  matches.forEach((found, index) => {
    if (found.index < cursor) return;
    // A zero-width match has nothing to paint, so it must not move the cursor
    // either. Letting it through split the surrounding plain text at every
    // match position — `/(?:)/g` over "ab" produced "a" and "b" as two
    // adjacent unhighlighted runs rather than one "ab". They render the same
    // and are not the same: the invariant this function owes its caller is
    // that no two adjacent segments are both plain.
    if (found.text.length === 0) return;
    if (found.index > cursor) {
      segments.push({ text: text.slice(cursor, found.index), match: null });
    }
    segments.push({ text: found.text, match: index });
    cursor = found.index + found.text.length;
  });
  if (cursor < text.length) segments.push({ text: text.slice(cursor), match: null });
  return segments;
}

export interface BoundedMatcher {
  test: (text: string) => boolean;
  /** True once the cumulative budget ran out and filtering stopped. */
  exhausted: () => boolean;
  /** True when the pattern was refused before any engine evaluation. */
  refused: () => boolean;
  /** Explains refusal or exhaustion, without hiding the result set. */
  reason: () => string | null;
}

/**
 * A predicate over one list row, with the cumulative budget described above.
 *
 * Giving up returns `true`, never `false`: showing an unfiltered list is a
 * visible, recoverable state, whereas silently hiding rows looks exactly like
 * data loss.
 */
export function createBoundedMatcher(
  regex: RegExp,
  budgetMs: number = FILTER_BUDGET_MS,
): BoundedMatcher {
  let spent = 0;
  let exhausted = false;
  let refusalReason: string | null = null;
  const risk = classifyPatternRisk(regex.source);
  if (risk.highRisk) {
    return {
      test: () => true,
      exhausted: () => true,
      refused: () => true,
      reason: () => risk.reason,
    };
  }
  let scan: RegExp;
  try {
    // A private copy: `lastIndex` is reset per call, and the builder preview
    // must not be able to move a live search bar's cursor or vice versa.
    scan = new RegExp(regex.source, regex.flags);
  } catch {
    return { test: () => true, exhausted: () => true, refused: () => false, reason: () => 'The pattern could not be compiled.' };
  }

  return {
    exhausted: () => exhausted,
    refused: () => false,
    reason: () => refusalReason,
    test(text: string): boolean {
      if (exhausted) return true;
      const subject = text.length > MAX_HAYSTACK_LENGTH ? text.slice(0, MAX_HAYSTACK_LENGTH) : text;
      const started = Date.now();
      let result: boolean;
      try {
        scan.lastIndex = 0;
        result = scan.test(subject);
      } catch {
        exhausted = true;
        refusalReason = 'The pattern evaluation was refused after an engine error.';
        return true;
      }
      spent += Date.now() - started;
      if (spent > budgetMs) exhausted = true;
      return result;
    },
  };
}

// Nested quantifiers and duplicated alternatives are the shapes behind almost
// every real-world catastrophic backtrack. This scanner is deliberately
// conservative: it tracks the complete group stack, escaped text and classes,
// and refuses an ambiguous quantified group before synchronous evaluation.
export function looksCatastrophic(source: string): boolean {
  return classifyPatternRisk(source).highRisk;
}

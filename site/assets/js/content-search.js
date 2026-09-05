export const CONTENT_SEARCH_MAX_RESULTS = 60;
export const CONTENT_SEARCH_DEADLINE_MS = 2000;

/**
 * Search page entries without reporting a capped result count as the total.
 * The caller owns rendering and may stop an obsolete search through isCurrent.
 */
export async function collectContentSearchResults(entries, matcher, {
  now = () => performance.now(),
  isCurrent = () => true,
  maxResults = CONTENT_SEARCH_MAX_RESULTS,
  deadlineMs = CONTENT_SEARCH_DEADLINE_MS,
} = {}) {
  const hits = [];
  let totalMatches = 0;
  let resultTruncated = false;
  let sweepIncomplete = false;
  const sweepStarted = now();

  for (const entry of entries) {
    if (!isCurrent()) return { cancelled: true, hits: [], totalMatches: 0, resultTruncated: false, sweepIncomplete: false };
    if (now() - sweepStarted > deadlineMs) {
      sweepIncomplete = true;
      break;
    }
    const matched = await matcher(entry.text);
    // Matching can yield to the worker-backed evaluator. A newer input may
    // supersede this search while it is pending, so check again before the
    // old result changes a total or a rendered list.
    if (!isCurrent()) return { cancelled: true, hits: [], totalMatches: 0, resultTruncated: false, sweepIncomplete: false };
    if (matched) {
      totalMatches += 1;
      if (hits.length < maxResults) hits.push(entry);
      else resultTruncated = true;
    }
  }

  if (!isCurrent()) return { cancelled: true, hits: [], totalMatches: 0, resultTruncated: false, sweepIncomplete: false };
  return { cancelled: false, hits, totalMatches, resultTruncated, sweepIncomplete };
}

export function contentSearchStatus(result) {
  if (result.sweepIncomplete) return `Search stopped after two seconds. ${result.totalMatches} matches found so far.`;
  if (result.resultTruncated) return `${result.totalMatches} matches found. Showing the first ${result.hits.length}; narrow the search to see fewer.`;
  return `${result.totalMatches} matches found.`;
}

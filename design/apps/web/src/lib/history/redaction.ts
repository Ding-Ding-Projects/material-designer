import type {
  HistoryDomainInfo,
  HistoryRevision,
  HistoryRevisionSummary,
} from '@open-design/contracts';

/** Stable display text used when a summary belongs to a sensitive domain. */
export const REDACTED_HISTORY_LABEL = 'Sensitive history change';
export const REDACTED_HISTORY_DETAIL = 'Sensitive history details omitted';

export function sensitiveHistoryDomainIds(
  domains: readonly HistoryDomainInfo[],
): ReadonlySet<string> {
  return new Set(domains.filter((domain) => domain.sensitive).map((domain) => domain.id));
}

export function historySummaryIsRedacted(summary: HistoryRevisionSummary): boolean {
  return summary.label === REDACTED_HISTORY_LABEL
    && summary.details.length === 1
    && summary.details[0] === REDACTED_HISTORY_DETAIL;
}

/**
 * Remove labels and detail lines that could contain record names or paths from
 * credential-adjacent domains. Domain ids and structural facts remain so the
 * history can still be filtered and counted without becoming a data side
 * channel.
 */
export function redactHistorySummary(
  summary: HistoryRevisionSummary,
  sensitiveDomainIds: ReadonlySet<string>,
): HistoryRevisionSummary {
  if (!summary.domainIds.some((domainId) => sensitiveDomainIds.has(domainId))) return summary;
  return {
    ...summary,
    label: REDACTED_HISTORY_LABEL,
    details: [REDACTED_HISTORY_DETAIL],
  };
}

export function redactHistorySummaries(
  summaries: readonly HistoryRevisionSummary[],
  sensitiveDomainIds: ReadonlySet<string>,
): HistoryRevisionSummary[] {
  return summaries.map((summary) => redactHistorySummary(summary, sensitiveDomainIds));
}

/** Redact sensitive change paths before a detailed revision reaches the view. */
export function redactHistoryRevision(
  revision: HistoryRevision,
  sensitiveDomainIds: ReadonlySet<string>,
): HistoryRevision {
  const summary = redactHistorySummary(revision, sensitiveDomainIds);
  if (summary === revision) return revision;
  return {
    ...summary,
    changes: revision.changes.map((change) => ({
      ...change,
      path: sensitiveDomainIds.has(change.domainId) ? REDACTED_HISTORY_DETAIL : change.path,
    })),
  };
}

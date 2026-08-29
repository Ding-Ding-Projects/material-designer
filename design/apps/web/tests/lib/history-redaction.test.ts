import { describe, expect, it } from 'vitest';

import type {
  HistoryRestoreResponse,
  HistoryRevision,
  HistoryRevisionSummary,
} from '@open-design/contracts';

import {
  REDACTED_HISTORY_DETAIL,
  REDACTED_HISTORY_LABEL,
  historySummaryIsRedacted,
  redactHistoryRevision,
  redactHistorySummary,
} from '../../src/lib/history/redaction';
import { isAppendOnlyRestoreResult } from '../../src/lib/history/restore';
import { renderHistoryExport } from '../../src/lib/history/export';

function summary(overrides: Partial<HistoryRevisionSummary> = {}): HistoryRevisionSummary {
  return {
    id: 'revision-1',
    commit: 'abcdef1',
    kind: 'mutation',
    label: 'Deleted the connector account demo',
    details: ['Deleted the connector account demo'],
    createdAt: Date.UTC(2026, 7, 29),
    domainIds: ['connectors'],
    changeCount: 1,
    restoredFromId: null,
    ...overrides,
  };
}

const labels = {
  heading: 'History',
  scope: 'All revisions',
  kindLabel: () => 'Mutation',
  restoredFrom: (id: string) => `Restored from ${id}`,
  changeCount: (count: number) => `${count} changes`,
  empty: 'No revisions',
  sensitiveDomainIds: new Set(['connectors']),
};

describe('history redaction', () => {
  it('replaces sensitive labels and details without changing structural facts', () => {
    const redacted = redactHistorySummary(summary(), new Set(['connectors']));
    expect(redacted.label).toBe(REDACTED_HISTORY_LABEL);
    expect(redacted.details).toEqual([REDACTED_HISTORY_DETAIL]);
    expect(redacted.domainIds).toEqual(['connectors']);
    expect(historySummaryIsRedacted(redacted)).toBe(true);
  });

  it('keeps non-sensitive summaries unchanged and hides sensitive change paths', () => {
    const safe = summary({ domainIds: ['settings'], label: 'Updated the setting theme' });
    expect(redactHistorySummary(safe, new Set(['connectors']))).toBe(safe);
    const detail: HistoryRevision = {
      ...summary(),
      changes: [
        { domainId: 'connectors', path: 'accounts/demo.json', status: 'deleted' },
        { domainId: 'settings', path: 'settings.json', status: 'modified' },
      ],
    };
    const redacted = redactHistoryRevision(detail, new Set(['connectors']));
    expect(redacted.changes.map((change) => change.path)).toEqual([
      REDACTED_HISTORY_DETAIL,
      'settings.json',
    ]);
  });

  it('sanitizes history exports at the export boundary too', () => {
    const body = renderHistoryExport('json', [summary()], labels);
    expect(body).toContain(REDACTED_HISTORY_LABEL);
    expect(body).not.toContain('demo');
  });

});

describe('restore consumer proof', () => {
  it('requires a new restore revision for a changed restore', () => {
    const response: HistoryRestoreResponse = {
      from: summary({ id: 'target' }),
      recorded: summary({
        id: 'new-revision',
        kind: 'restore',
        restoredFromId: 'target',
        label: 'Restored a revision',
        details: ['Restored a revision'],
      }),
      unchanged: false,
      changes: [],
      domainIds: ['settings'],
    };
    expect(isAppendOnlyRestoreResult(response)).toBe(true);
    expect(isAppendOnlyRestoreResult({ ...response, recorded: null })).toBe(false);
  });

  it('accepts an unchanged restore only without a recorded revision', () => {
    const base: HistoryRestoreResponse = {
      from: summary({ id: 'target' }),
      recorded: null,
      unchanged: true,
      changes: [],
      domainIds: ['settings'],
    };
    expect(isAppendOnlyRestoreResult(base)).toBe(true);
    expect(isAppendOnlyRestoreResult({ ...base, recorded: summary({ kind: 'restore' }) })).toBe(false);
  });
});

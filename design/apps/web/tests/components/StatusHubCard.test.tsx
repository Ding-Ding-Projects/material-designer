import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StatusHubCard, type StatusHubLabels } from '../../src/components/status/StatusHubCard';
import type { StatusSnapshot } from '../../src/runtime/status-hub';

const labels: StatusHubLabels = {
  title: 'Status',
  search: 'Search status',
  searchPlaceholder: 'Filter status',
  currentState: 'Current state',
  lastUpdated: 'Last updated',
  baseline: 'Baseline',
  evidence: 'Evidence',
  nextChecks: 'Next checks',
  refresh: 'Refresh',
  loading: 'Loading',
  unavailable: 'Unavailable',
  timestampUnavailable: 'Timestamp unavailable',
  stale: (age) => `Stale for ${age} seconds`,
  lastKnown: (state) => `Last known state: ${state}`,
  localFallback: 'Local-only fallback, not delivered',
  noEvidence: 'No evidence',
  noChecks: 'No next checks',
  noLanes: 'No lanes',
  noMatches: 'No matches',
  laneState: (state) => state,
  evidenceState: (state) => state,
};

function snapshot(updatedAt: string): StatusSnapshot {
  return {
    schemaVersion: 1,
    sessionId: 'session-1',
    title: 'Session status',
    state: 'verified',
    summary: 'The latest observed status.',
    updatedAt,
    freshness: 'current',
    ageSeconds: 0,
    lastKnownState: null,
    lanes: [],
    evidence: [],
    nextChecks: ['Review the result.'],
    source: 'hub',
  };
}

describe('StatusHubCard freshness', () => {
  afterEach(() => vi.useRealTimers());

  it('recomputes stale state on a bounded timer and clears it on unmount', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-29T12:00:00Z'));
    const view = render(<StatusHubCard labels={labels} snapshot={snapshot('2026-08-29T12:00:00Z')} />);
    expect(screen.getByRole('status')).toHaveTextContent('verified');
    vi.advanceTimersByTime(5 * 60 * 1000 + 15_000);
    expect(view.container.querySelector('[data-status-hub-freshness="stale"]')).not.toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('waiting');
    expect(screen.getByText(/Stale for/)).toBeInTheDocument();
    view.unmount();
    vi.advanceTimersByTime(30_000);
  });
});

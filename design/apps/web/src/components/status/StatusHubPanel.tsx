import { useCallback, useEffect, useState } from 'react';

import {
  createLocalStatusFallback,
  type StatusHubClient,
  type StatusSnapshot,
} from '../../runtime/status-hub';
import { StatusHubCard, type StatusHubLabels, type StatusHubMountId } from './StatusHubCard';

export interface StatusHubPanelProps {
  readonly client: StatusHubClient;
  readonly fallback?: StatusHubClient;
  readonly labels: StatusHubLabels;
  readonly mountId?: StatusHubMountId;
  readonly className?: string;
  readonly initialSnapshot?: StatusSnapshot | null;
}

export function StatusHubPanel({
  client,
  fallback,
  labels,
  mountId = 'C0',
  className,
  initialSnapshot = null,
}: StatusHubPanelProps) {
  const [snapshot, setSnapshot] = useState<StatusSnapshot | null>(initialSnapshot);
  const [loading, setLoading] = useState(initialSnapshot == null);
  const [error, setError] = useState<string | null>(null);

  const read = useCallback(async () => {
    setLoading(true);
    const result = await client.read();
    if (result.ok) {
      setSnapshot(result.snapshot);
      setError(null);
      setLoading(false);
      return;
    }
    if (fallback) {
      const fallbackResult = await fallback.read();
      if (fallbackResult.ok) {
        setSnapshot(fallbackResult.snapshot);
        setError(labels.localFallback);
        setLoading(false);
        return;
      }
    }
    setError(result.error === 'unauthorized' ? labels.unavailable : labels.unavailable);
    setLoading(false);
  }, [client, fallback, labels.localFallback, labels.unavailable]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const result = await client.read();
      if (!active) return;
      if (result.ok) {
        setSnapshot(result.snapshot);
        setError(null);
      } else if (fallback) {
        const fallbackResult = await fallback.read();
        if (!active) return;
        if (fallbackResult.ok) {
          setSnapshot(fallbackResult.snapshot);
          setError(labels.localFallback);
        } else {
          setError(labels.unavailable);
        }
      } else {
        setError(labels.unavailable);
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [client, fallback, labels.localFallback, labels.unavailable]);

  return (
    <StatusHubCard
      className={className}
      error={error}
      labels={labels}
      loading={loading}
      mountId={mountId}
      onRefresh={() => void read()}
      snapshot={snapshot}
    />
  );
}

/** A safe, empty local model for hosts that have no authenticated Hub yet. */
export function createEmptyStatusFallback(sessionId: string, title: string): StatusHubClient {
  return createLocalStatusFallback({
    sessionId,
    title,
    state: 'waiting',
    summary: 'No authenticated status delivery is connected yet.',
    updatedAt: new Date(0).toISOString(),
    lanes: [],
    evidence: [],
    nextChecks: [],
  });
}

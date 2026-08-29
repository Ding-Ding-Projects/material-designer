import { useEffect, useState } from 'react';

import type { ConfirmDeleteResponse } from '@open-design/contracts';

import {
  confirmedDelete,
  createDeleteRequestSnapshot,
  requestDeleteConfirmation,
  type ConfirmedDeleteOptions,
  type DeleteRequestSnapshot,
} from '../../lib/confirm-delete';
import { DestructiveGate, type DestructiveGateProps } from './DestructiveGate';

export interface AuthorizedDestructiveGateProps
  extends Omit<DestructiveGateProps, 'onConfirm' | 'action' | 'target' | 'items' | 'detail' | 'irreversible' | 'requestIdentity'> {
  /** The exact daemon resource path whose handler owns the destructive action. */
  resourcePath: string;
  /** Body captured by the handler preflight and sent unchanged on DELETE. */
  payload?: unknown;
  /** An optional handler preflight supplied by the owning route. */
  preflight?: ConfirmDeleteResponse | null;
  /** Identity headers for both legs of the handler handshake. */
  requestOptions?: ConfirmedDeleteOptions;
  /** Non-secret owner context id. It resets the gate but is never hashed. */
  authenticatedContextIdentity?: string;
}

interface ReadyPreflight {
  requestKey: string;
  payload: unknown;
  confirmation: ConfirmDeleteResponse;
  requestIdentity: string;
  snapshot: DeleteRequestSnapshot;
}

function preflightSignature(value: ConfirmDeleteResponse | null | undefined): string {
  if (!value) return '';
  return JSON.stringify({ expiresAt: value.expiresAt, summary: value.summary });
}

function hasValidSummary(value: ConfirmDeleteResponse | null | undefined): value is ConfirmDeleteResponse {
  const summary = value?.summary;
  return Boolean(value && typeof value.token === 'string' && value.token.length > 0
    && Number.isFinite(value.expiresAt)
    && summary && typeof summary.kind === 'string' && typeof summary.id === 'string'
    && typeof summary.label === 'string' && summary.reversible === false
    && Array.isArray(summary.items) && summary.items.every((item) => typeof item === 'string'));
}

/**
 * Compose the two-key/full-travel UI with an immutable handler preflight.
 *
 * The preflight summary is the only source for the visible target and affected
 * item list. The resource path and canonical payload hash form one immutable
 * request identity. When either changes, the preflight is discarded and the
 * gate is remounted, which resets both keys and the slider before any new
 * authorization can run.
 */
export function AuthorizedDestructiveGate({
  resourcePath,
  payload,
  preflight,
  requestOptions,
  authenticatedContextIdentity,
  ...gateProps
}: AuthorizedDestructiveGateProps) {
  const requestKey = `${resourcePath}\u0000${authenticatedContextIdentity ?? ''}`;
  const suppliedPreflightKey = preflightSignature(preflight);
  const [retryNonce, setRetryNonce] = useState(0);
  const [forcedRefreshKey, setForcedRefreshKey] = useState<string | null>(null);
  const [ready, setReady] = useState<ReadyPreflight | null>(null);
  const [preflightError, setPreflightError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setReady(null);
    setPreflightError(null);

    void (async () => {
      try {
        const snapshot = await createDeleteRequestSnapshot(resourcePath, payload, authenticatedContextIdentity);
        const suppliedIsFresh = Boolean(preflight && Date.now() < preflight.expiresAt);
        const confirmation = forcedRefreshKey !== requestKey && suppliedIsFresh && preflight
          ? preflight
          : await requestDeleteConfirmation(
          resourcePath,
          payload,
          requestOptions?.headers,
          snapshot,
        );
        if (!hasValidSummary(confirmation)) {
          throw new Error('The handler did not provide a destructive preflight summary.');
        }
        const requestIdentity = snapshot.requestIdentity;
        if (!cancelled) setReady({ confirmation, requestIdentity, requestKey, payload, snapshot });
      } catch (error) {
        if (!cancelled) setPreflightError(error instanceof Error ? error.message : String(error));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authenticatedContextIdentity, forcedRefreshKey, payload, suppliedPreflightKey, resourcePath, retryNonce]);

  if (preflightError) {
    return (
      <section role="alert" data-testid="authorized-destructive-gate-error">
        <p>{preflightError}</p>
        <button type="button" onClick={() => {
          setForcedRefreshKey(requestKey);
          setRetryNonce((value) => value + 1);
        }}>
          Retry confirmation details
        </button>
      </section>
    );
  }

  if (!ready || ready.requestKey !== requestKey || ready.payload !== payload) {
    return (
      <section role="status" aria-live="polite" data-testid="authorized-destructive-gate-preflight">
        Preparing confirmation details…
      </section>
    );
  }

  const { confirmation, requestIdentity, snapshot } = ready;
  const summary = confirmation.summary;

  return (
    <DestructiveGate
      {...gateProps}
      action={`Delete ${summary.label}`}
      target={summary.label}
      items={summary.items}
      irreversible={!summary.reversible}
      requestIdentity={requestIdentity}
      onConfirm={async () => {
        if (Date.now() >= confirmation.expiresAt) {
          setReady(null);
          setPreflightError('The destructive preflight expired. Review the refreshed details before authorizing.');
          return false;
        }
        return confirmedDelete(resourcePath, undefined, {
          ...requestOptions,
          authenticatedContextIdentity,
          requestSnapshot: snapshot,
          expectedSummary: confirmation.summary,
          expectedRequestIdentity: requestIdentity,
        });
      }}
    />
  );
}

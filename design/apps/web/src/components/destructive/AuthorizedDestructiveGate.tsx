import { useEffect, useState } from 'react';

import type { ConfirmDeleteResponse } from '@open-design/contracts';

import {
  canonicalDeletePayload,
  confirmedDelete,
  deleteRequestIdentity,
  requestDeleteConfirmation,
  type ConfirmedDeleteOptions,
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
}

interface ReadyPreflight {
  requestKey: string;
  confirmation: ConfirmDeleteResponse;
  requestIdentity: string;
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
  ...gateProps
}: AuthorizedDestructiveGateProps) {
  const payloadKey = canonicalDeletePayload(payload);
  const requestKey = `${resourcePath}\u0000${payloadKey}`;
  const suppliedPreflightKey = preflightSignature(preflight);
  const [retryNonce, setRetryNonce] = useState(0);
  const [ready, setReady] = useState<ReadyPreflight | null>(null);
  const [preflightError, setPreflightError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setReady(null);
    setPreflightError(null);

    void (async () => {
      try {
        const confirmation = preflight ?? await requestDeleteConfirmation(resourcePath, payload);
        if (!hasValidSummary(confirmation)) {
          throw new Error('The handler did not provide a destructive preflight summary.');
        }
        const requestIdentity = await deleteRequestIdentity(resourcePath, payload);
        if (!cancelled) setReady({ confirmation, requestIdentity, requestKey });
      } catch (error) {
        if (!cancelled) setPreflightError(error instanceof Error ? error.message : String(error));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [payloadKey, suppliedPreflightKey, resourcePath, retryNonce]);

  if (preflightError) {
    return (
      <section role="alert" data-testid="authorized-destructive-gate-error">
        <p>{preflightError}</p>
        <button type="button" onClick={() => setRetryNonce((value) => value + 1)}>
          Retry confirmation details
        </button>
      </section>
    );
  }

  if (!ready || ready.requestKey !== requestKey) {
    return (
      <section role="status" aria-live="polite" data-testid="authorized-destructive-gate-preflight">
        Preparing confirmation details…
      </section>
    );
  }

  const { confirmation, requestIdentity } = ready;
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
        return confirmedDelete(resourcePath, payload, {
          ...requestOptions,
          expectedSummary: confirmation.summary,
          expectedRequestIdentity: requestIdentity,
        });
      }}
    />
  );
}

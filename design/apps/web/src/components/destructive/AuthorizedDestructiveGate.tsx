import { DestructiveGate, type DestructiveGateProps } from './DestructiveGate';
import { confirmedDelete, type ConfirmedDeleteOptions } from '../../lib/confirm-delete';

export interface AuthorizedDestructiveGateProps
  extends Omit<DestructiveGateProps, 'onConfirm'> {
  /** The exact daemon resource path whose handler owns the destructive action. */
  resourcePath: string;
  /** Body sent unchanged to both the token mint and the destructive request. */
  payload?: unknown;
  /** Identity headers for both legs of the handler handshake. */
  requestOptions?: ConfirmedDeleteOptions;
}

/**
 * Compose the two-key/full-travel UI with the handler-side single-use token.
 *
 * The gate does not authorize a request by itself. At the moment the slider
 * completes, this wrapper asks the handler for a token bound to the exact
 * resource and spends that token on one DELETE. A failed mint or request keeps
 * the gate open and lets the caller show the real failure.
 */
export function AuthorizedDestructiveGate({
  resourcePath,
  payload,
  requestOptions,
  ...gateProps
}: AuthorizedDestructiveGateProps) {
  return (
    <DestructiveGate
      {...gateProps}
      onConfirm={() => confirmedDelete(resourcePath, payload, requestOptions)}
    />
  );
}

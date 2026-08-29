// The desktop host is the trusted computation boundary for secret material.
// Keeping the protocol exports here gives renderer tests and adapters one
// stable import without making the renderer handle a secret or network call.
export {
  AUTHENTICATOR_ALGORITHMS,
  AUTHENTICATOR_DIGITS,
  buildOtpauthUri,
  clockSkewWarning,
  decodeBase32,
  decodeLocalQr,
  encodeBase32,
  encodeLocalQr,
  generateSecret,
  hotp,
  nextTotp,
  parseOtpauthUri,
  secondsRemaining,
  totp,
} from '../../../../desktop/src/main/authenticator/protocol';
export type {
  AuthenticatorAlgorithm,
  AuthenticatorDigits,
  OtpParameters,
  QrMatrix,
} from '../../../../desktop/src/main/authenticator/protocol';

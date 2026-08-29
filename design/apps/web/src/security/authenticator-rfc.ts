import {
  buildOtpauthUri,
  clockSkewWarning,
  decodeBase32,
  decodeLocalQr,
  encodeBase32,
  encodeLocalQr,
  hotp,
  nextTotp,
  parseOtpauthUri,
  secondsRemaining,
  totp,
  type AuthenticatorAlgorithm,
  type AuthenticatorDigits,
  type OtpParameters,
  type QrMatrix,
} from '../components/authenticator/protocol';

export { buildOtpauthUri, clockSkewWarning, decodeBase32, decodeLocalQr, encodeBase32, encodeLocalQr, hotp, nextTotp, parseOtpauthUri, secondsRemaining, totp };
export type { AuthenticatorAlgorithm, AuthenticatorDigits, OtpParameters, QrMatrix };

export function verifyCurrentAuthenticatorCode(
  parameters: Pick<OtpParameters, 'secret' | 'algorithm' | 'digits' | 'period'>,
  code: string,
  nowMs: number,
): boolean {
  return /^\d{6,8}$/u.test(code) && code === totp(parameters, nowMs);
}

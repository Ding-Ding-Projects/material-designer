import { describe, expect, test } from 'vitest';

import { buildOtpauthJson, buildOtpauthUri, decodeBase32, decodeLocalQr, encodeLocalQr, hotp, nextTotp, parseOtpauthJson, secondsRemaining, totp, verifyLocalQrParity } from '../../../src/components/authenticator/protocol';

describe('renderer authenticator protocol exports', () => {
  test('matches RFC 4226 and RFC 6238 published vectors', () => {
    const secret = new TextEncoder().encode('12345678901234567890');
    expect(hotp(secret, 0n, 'SHA-1', 6)).toBe('755224');
    expect(totp({ secret, algorithm: 'SHA-1', digits: 8, period: 30 }, 59_000)).toBe('94287082');
    expect(totp({ secret: new TextEncoder().encode('12345678901234567890123456789012'), algorithm: 'SHA-256', digits: 8, period: 30 }, 59_000)).toBe('46119246');
    expect(totp({ secret: new TextEncoder().encode('1234567890123456789012345678901234567890123456789012345678901234'), algorithm: 'SHA-512', digits: 8, period: 30 }, 59_000)).toBe('90693936');
    expect(nextTotp({ secret, algorithm: 'SHA-1', digits: 6, period: 60 }, 59_000)).toBe(totp({ secret, algorithm: 'SHA-1', digits: 6, period: 60 }, 60_000));
    expect(secondsRemaining(30, 59_000)).toBe(1);
    expect(decodeBase32('JBSWY3DPEHPK3PXP')).toHaveLength(10);
  });

  test('keeps both bounded QR versions standards-shaped with quiet zones', () => {
    const secret = decodeBase32('JBSWY3DPEHPK3PXP');
    const shortUri = buildOtpauthUri({ issuer: 'E', account: 'a', secret, algorithm: 'SHA-1', digits: 6, period: 30 });
    const longUri = buildOtpauthUri({ issuer: 'E', account: 'x'.repeat(40), secret, algorithm: 'SHA-1', digits: 6, period: 30 });
    for (const uri of [shortUri, longUri]) for (const mask of [0, 1, 2, 3, 4, 5, 6, 7] as const) {
      const matrix = encodeLocalQr(uri, mask);
      expect(verifyLocalQrParity(matrix)).toBe(true);
      expect(decodeLocalQr(matrix)).toBe(uri);
      expect(matrix.renderedSize).toBe(matrix.size + 8);
      expect(matrix.renderedModules[0]?.every((cell) => !cell)).toBe(true);
    }
    const json = buildOtpauthJson({ issuer: 'E', account: 'a', secret, algorithm: 'SHA-512', digits: 8, period: 45 });
    expect(parseOtpauthJson(json)).toMatchObject({ issuer: 'E', account: 'a', algorithm: 'SHA-512', digits: 8, period: 45 });
  });
});

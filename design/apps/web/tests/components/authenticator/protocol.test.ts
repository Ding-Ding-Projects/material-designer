import { describe, expect, test } from 'vitest';

import { decodeBase32, hotp, nextTotp, secondsRemaining, totp } from '../../../src/components/authenticator/protocol';

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
});

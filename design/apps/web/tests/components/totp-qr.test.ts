import { describe, expect, it } from 'vitest';

import { buildTotpOtpauthUri, decodeTotpQrMatrix, isQrBase32, renderTotpQrMatrix, renderTotpQrSvg, TOTP_QR_CAPABILITY } from '../../src/components/settings/totp-qr';

describe('local toy-lock TOTP QR encoder', () => {
  it('builds a standards-shaped otpauth URI without any network route', () => {
    const uri = buildTotpOtpauthUri('general', 'JBSWY3DPEHPK3PXP');
    expect(uri).toContain('otpauth://totp/Material%20Designer%3Ageneral?');
    expect(uri).toContain('secret=JBSWY3DPEHPK3PXP');
    expect(uri).toContain('issuer=Material+Designer');
    expect(uri).toContain('algorithm=SHA1');
    expect(uri).toContain('digits=6');
    expect(uri).toContain('period=30');
  });

  it('accepts canonical Base32 and rejects malformed or ambiguous input', () => {
    expect(isQrBase32('JBSWY3DPEHPK3PXP')).toBe(true);
    expect(isQrBase32('MY')).toBe(true);
    expect(isQrBase32('MZXQ')).toBe(true);
    expect(isQrBase32('MZXW6')).toBe(true);
    expect(isQrBase32('MZXW6YQ')).toBe(true);
    expect(isQrBase32('MY======')).toBe(true);
    expect(isQrBase32('MZXQ====')).toBe(true);
    expect(isQrBase32('MZXW6===')).toBe(true);
    expect(isQrBase32('MZXW6YQ=')).toBe(true);
    expect(isQrBase32('JBSWY3DPEHPK3PXP=')).toBe(false);
    expect(isQrBase32('MZ')).toBe(false);
    expect(isQrBase32('MZXZ')).toBe(false);
    expect(isQrBase32('MZXW7')).toBe(false);
    expect(isQrBase32('MZXW6YR')).toBe(false);
    expect(isQrBase32('JBSWY3DPEHPK3PX!')).toBe(false);
    expect(isQrBase32('A')).toBe(false);
  });

  it('renders a scannable SVG with a real accessible label and quiet zone', () => {
    const svg = renderTotpQrSvg(
      buildTotpOtpauthUri('general', 'JBSWY3DPEHPK3PXP'),
      'Authenticator pairing QR code',
    );
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    expect(svg).toContain('role="img"');
    expect(svg).toContain('aria-label="Authenticator pairing QR code"');
    expect(svg).toContain('viewBox="0 0 53 53"');
    expect(svg).toContain('<rect width="100%" height="100%" fill="#fff"/>');
    expect(svg).toContain('<path d="M');
  });

  it('round-trips the exact otpauth URI through the bundled structural decoder', () => {
    const uri = buildTotpOtpauthUri('appearance', 'JBSWY3DPEHPK3PXP');
    expect(decodeTotpQrMatrix(renderTotpQrMatrix(uri))).toBe(uri);
  });
  it('states the bounded source-only interoperability evidence honestly', () => {
    expect(TOTP_QR_CAPABILITY).toEqual({ independentScannerVerified: false, internalDecoderRoundTrip: true, reedSolomonVerified: true });
  });
});

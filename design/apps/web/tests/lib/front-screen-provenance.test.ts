import { describe, expect, it } from 'vitest';
import {
  formatFrontScreenUpdatedAt,
  resolveFrontScreenProvenance,
} from '../../src/lib/front-screen-provenance';

const sourceCommit = 'abcdef0123456789abcdef0123456789abcdef01';

describe('front-screen version provenance', () => {
  it('accepts only a provenance record bound to the displayed version', () => {
    const resolved = resolveFrontScreenProvenance({
      version: '1.2.3',
      channel: 'stable',
      packaged: true,
      platform: 'win32',
      arch: 'x64',
      provenance: {
        schemaVersion: 1,
        version: '1.2.3',
        sourceCommit,
        updatedAt: '2026-08-27T12:34:56.000Z',
      },
    });
    expect(resolved.version).toBe('1.2.3');
    expect(resolved.provenance?.sourceCommit).toBe(sourceCommit);
    expect(formatFrontScreenUpdatedAt(resolved.provenance, 'en-CA')).toMatch(/2026/);
    expect(formatFrontScreenUpdatedAt(resolved.provenance, 'en-CA')).toMatch(/12:34:56/);
  });

  it('returns unavailable data for placeholders, mismatches, bad commits, and timestamps', () => {
    const base = {
      version: '1.2.3',
      channel: 'stable',
      packaged: true,
      platform: 'win32',
      arch: 'x64',
      provenance: {
        schemaVersion: 1 as const,
        version: '1.2.3',
        sourceCommit,
        updatedAt: '2026-08-27T12:34:56Z',
      },
    };
    expect(resolveFrontScreenProvenance(base).provenance).not.toBeNull();
    expect(resolveFrontScreenProvenance({ ...base, version: '1.2.4' }).provenance).toBeNull();
    expect(resolveFrontScreenProvenance({ ...base, provenance: { ...base.provenance, version: '9.9.9' } }).provenance).toBeNull();
    expect(resolveFrontScreenProvenance({ ...base, provenance: { ...base.provenance, sourceCommit: 'short' } }).provenance).toBeNull();
    expect(resolveFrontScreenProvenance({ ...base, provenance: { ...base.provenance, updatedAt: '2026-08-27' } }).provenance).toBeNull();
    expect(resolveFrontScreenProvenance({ ...base, provenance: { ...base.provenance, updatedAt: '2026-02-31T12:34:56Z' } }).provenance).toBeNull();
    expect(resolveFrontScreenProvenance({ ...base, provenance: { ...base.provenance, updatedAt: '2026-04-31T12:34:56Z' } }).provenance).toBeNull();
    expect(resolveFrontScreenProvenance({ ...base, version: '0.0.0' }).version).toBeNull();
    expect(resolveFrontScreenProvenance(null)).toEqual({ version: null, provenance: null });
  });
});

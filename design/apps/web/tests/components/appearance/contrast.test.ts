// The ink over a colour the user chose.
//
// `readableInkOn` exists because the pet accent is arbitrary user input:
// no Material `on-*` role can name an ink for a ground it has never seen,
// so the ink is computed. These specs state that property rather than the
// current answer. Each one asserts the ratio the chosen ink achieves AND
// that it beats the ink that was rejected, so a future implementation that
// returns the other colour fails on the arithmetic instead of on a string
// comparison that nobody can read the intent out of.

import { describe, expect, it } from 'vitest';

import { parseHex } from '../../../src/components/appearance/color';
import {
  AA_NORMAL,
  contrastRatio,
  readableInkOn,
} from '../../../src/components/appearance/contrast';

const BLACK = { r: 0, g: 0, b: 0 };
const WHITE = { r: 255, g: 255, b: 255 };

/** The ratio an ink named by `readableInkOn` actually achieves on a ground. */
function ratioOn(background: string, ink: string): number {
  const rgb = parseHex(background);
  if (!rgb) throw new Error(`unparseable background in spec: ${background}`);
  return contrastRatio(rgb, ink === 'black' ? BLACK : WHITE);
}

describe('readableInkOn', () => {
  it('picks black on the default pet accent, where white is invisible', () => {
    // `#87ea5c` is the accent every pet starts with, so this is the default
    // rendering rather than an unusual choice a user had to go looking for.
    expect(readableInkOn('#87ea5c')).toBe('black');
    expect(ratioOn('#87ea5c', 'white')).toBeCloseTo(1.5, 1);
    expect(ratioOn('#87ea5c', 'black')).toBeCloseTo(13.95, 1);
    expect(ratioOn('#87ea5c', 'black')).toBeGreaterThan(ratioOn('#87ea5c', 'white'));
    expect(ratioOn('#87ea5c', 'black')).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('picks white on a dark accent, where black is invisible', () => {
    expect(readableInkOn('#1a1a1a')).toBe('white');
    expect(ratioOn('#1a1a1a', 'white')).toBeGreaterThan(ratioOn('#1a1a1a', 'black'));
    expect(ratioOn('#1a1a1a', 'white')).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('returns the more readable of the two on any parseable accent', () => {
    // A shorthand hex, a mid-tone and a light one, so the property is
    // pinned across the range rather than at the two ends that are obvious.
    for (const accent of ['#000', '#fff', '#87ea5c', '#1a1a1a', '#3b82f6', '#fde047']) {
      const ink = readableInkOn(accent);
      const rejected = ink === 'black' ? 'white' : 'black';
      expect(ratioOn(accent, ink)).toBeGreaterThanOrEqual(ratioOn(accent, rejected));
    }
  });

  it('falls back to white when the accent cannot be parsed', () => {
    // Not a change of behaviour: white is what these call sites painted
    // before the ink was computed, so an unexpected value stays as it was.
    expect(readableInkOn('')).toBe('white');
    expect(readableInkOn('not a colour')).toBe('white');
    expect(readableInkOn('rgb(135, 234, 92)')).toBe('white');
  });
});

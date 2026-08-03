import { describe, expect, it } from 'vitest';

import {
  MAX_SAMPLE_MATCHES,
  buildHighlightSegments,
  createBoundedMatcher,
  looksCatastrophic,
  runSample,
} from '../../../src/components/regex/evaluate';
import { MAX_SAMPLE_LENGTH } from '../../../src/components/regex/pattern';

describe('runSample', () => {
  it('collects every match with its position', () => {
    const run = runSample(/a/g, 'banana');
    expect(run.matches.map((m) => m.index)).toEqual([1, 3, 5]);
    expect(run.matches.every((m) => m.text === 'a')).toBe(true);
    expect(run.truncated).toBe(false);
    expect(run.timedOut).toBe(false);
  });

  it('iterates even when the caller forgot the global flag', () => {
    expect(runSample(/a/, 'banana').matches).toHaveLength(3);
  });

  it('does not disturb the caller regex — a live search bar is using it', () => {
    const shared = /a/g;
    shared.lastIndex = 4;
    runSample(shared, 'banana');
    expect(shared.lastIndex).toBe(4);
  });

  it('reports capture groups positionally, including ones that did not participate', () => {
    const run = runSample(/(a)|(b)/g, 'ab');
    expect(run.matches[0]?.groups).toEqual(['a', undefined]);
    expect(run.matches[1]?.groups).toEqual([undefined, 'b']);
  });

  it('reports named groups', () => {
    const run = runSample(/(?<letter>a)/g, 'a');
    expect(run.matches[0]?.named).toEqual({ letter: 'a' });
  });

  it('escapes the zero-width trap instead of looping forever', () => {
    const run = runSample(/(?:)/g, 'ab');
    expect(run.matches.map((m) => m.index)).toEqual([0, 1, 2]);
  });

  it('stops at the match cap and says so', () => {
    const run = runSample(/a/g, 'a'.repeat(MAX_SAMPLE_MATCHES + 50));
    expect(run.matches).toHaveLength(MAX_SAMPLE_MATCHES);
    expect(run.truncated).toBe(true);
  });

  it('truncates an over-long sample and says so', () => {
    const run = runSample(/x/g, `${'y'.repeat(MAX_SAMPLE_LENGTH)}x`);
    expect(run.sampleTruncated).toBe(true);
    expect(run.scanned).toHaveLength(MAX_SAMPLE_LENGTH);
    // The `x` past the cap is genuinely not matched — the flag is how the
    // interface says so instead of quietly reporting "no matches".
    expect(run.matches).toHaveLength(0);
  });
});

describe('buildHighlightSegments', () => {
  it('alternates plain and matched runs', () => {
    const run = runSample(/an/g, 'banana');
    expect(buildHighlightSegments('banana', run.matches)).toEqual([
      { text: 'b', match: null },
      { text: 'an', match: 0 },
      { text: 'an', match: 1 },
      { text: 'a', match: null },
    ]);
  });

  it('returns the whole text as one plain run when nothing matched', () => {
    expect(buildHighlightSegments('banana', [])).toEqual([{ text: 'banana', match: null }]);
  });

  it('paints nothing for zero-width matches, which have nothing to paint', () => {
    const run = runSample(/(?:)/g, 'ab');
    expect(buildHighlightSegments('ab', run.matches)).toEqual([{ text: 'ab', match: null }]);
  });
});

describe('createBoundedMatcher', () => {
  it('matches with the pattern and its flags', () => {
    const matcher = createBoundedMatcher(/^a/i);
    expect(matcher.test('Alpha')).toBe(true);
    expect(matcher.test('beta')).toBe(false);
  });

  it('resets lastIndex, so a global pattern gives the same answer every row', () => {
    const matcher = createBoundedMatcher(/a/g);
    expect(matcher.test('aaa')).toBe(true);
    expect(matcher.test('aaa')).toBe(true);
    expect(matcher.test('aaa')).toBe(true);
  });

  it('keeps sticky semantics rather than stripping the flag', () => {
    const matcher = createBoundedMatcher(/a/y);
    expect(matcher.test('abc')).toBe(true);
    expect(matcher.test('bac')).toBe(false);
  });

  it('gives up by matching everything, never by hiding rows', () => {
    // A negative budget exhausts on the first call, which is the same state a
    // genuinely slow pattern reaches — the list then shows every row.
    const matcher = createBoundedMatcher(/zzz/, -1);
    expect(matcher.test('aaa')).toBe(false);
    expect(matcher.exhausted()).toBe(true);
    expect(matcher.test('aaa')).toBe(true);
    expect(matcher.test('anything at all')).toBe(true);
  });

  it('does not exhaust on an ordinary pattern', () => {
    const matcher = createBoundedMatcher(/a/);
    for (let i = 0; i < 500; i += 1) matcher.test('banana');
    expect(matcher.exhausted()).toBe(false);
  });
});

describe('looksCatastrophic', () => {
  it('flags the nested-quantifier shape', () => {
    expect(looksCatastrophic('(a+)+')).toBe(true);
    expect(looksCatastrophic('(a*)*b')).toBe(true);
    expect(looksCatastrophic('(a|a)*')).toBe(true);
  });

  it('leaves ordinary patterns alone', () => {
    expect(looksCatastrophic('^\\w+@\\w+$')).toBe(false);
    expect(looksCatastrophic('(abc)')).toBe(false);
    expect(looksCatastrophic('[a-z]{2,4}')).toBe(false);
  });

  it('is a heuristic, and the code says so rather than promising safety', () => {
    // A blow-up spread across two groups is exactly what this cannot see.
    // Documented as a false negative; asserted so nobody later mistakes the
    // helper for a guarantee.
    expect(looksCatastrophic('(a+)(a+)b')).toBe(false);
  });
});

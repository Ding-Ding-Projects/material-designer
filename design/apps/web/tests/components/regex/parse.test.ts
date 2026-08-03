import { describe, expect, it } from 'vitest';

import { parsePattern } from '../../../src/components/regex/parse';
import { MAX_PATTERN_LENGTH, renderParts } from '../../../src/components/regex/pattern';

function partsFor(source: string) {
  const result = parsePattern(source);
  if (!result.ok) throw new Error(`expected ${source} to parse, got ${JSON.stringify(result)}`);
  return result.parts;
}

/** The property that makes the two editors safe to keep in sync. */
function roundTrips(source: string): boolean {
  return renderParts(partsFor(source)) === source;
}

describe('parsePattern — shapes the guided parts can hold', () => {
  it('reads a plain literal run as one part', () => {
    const parts = partsFor('cat');
    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatchObject({ kind: 'literal', value: 'cat' });
  });

  it('binds a quantifier to the single character it applies to', () => {
    const parts = partsFor('ab+');
    expect(parts).toHaveLength(2);
    expect(parts[0]).toMatchObject({ kind: 'literal', value: 'a' });
    expect(parts[1]).toMatchObject({
      kind: 'literal',
      value: 'b',
      quantifier: { kind: 'plus' },
    });
  });

  it('reads predefined classes and their quantifiers', () => {
    const parts = partsFor('\\d{2,4}');
    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatchObject({
      kind: 'charClass',
      preset: 'digit',
      quantifier: { kind: 'between', min: 2, max: 4 },
    });
  });

  it('reads a lazy quantifier', () => {
    const parts = partsFor('\\w+?');
    expect(parts[0]).toMatchObject({
      kind: 'charClass',
      preset: 'word',
      quantifier: { kind: 'plus', lazy: true },
    });
  });

  it('reads a custom class and its negation', () => {
    expect(partsFor('[a-z]')[0]).toMatchObject({
      kind: 'charClass',
      preset: 'custom',
      custom: 'a-z',
      negated: false,
    });
    expect(partsFor('[^a-z]')[0]).toMatchObject({
      kind: 'charClass',
      preset: 'custom',
      custom: 'a-z',
      negated: true,
    });
  });

  it('reads anchors', () => {
    const parts = partsFor('^a$');
    expect(parts[0]).toMatchObject({ kind: 'anchor', anchor: 'start' });
    expect(parts[2]).toMatchObject({ kind: 'anchor', anchor: 'end' });
    expect(partsFor('\\bx\\B')[0]).toMatchObject({ kind: 'anchor', anchor: 'wordBoundary' });
  });

  it('reads each group kind', () => {
    expect(partsFor('(ab)')[0]).toMatchObject({ kind: 'group', groupKind: 'capturing', body: 'ab' });
    expect(partsFor('(?<year>\\d{4})')[0]).toMatchObject({
      kind: 'group',
      groupKind: 'named',
      name: 'year',
      body: '\\d{4}',
    });
  });

  it('recognises a non-capturing group of plain alternatives as an alternation', () => {
    expect(partsFor('(?:cat|dog)')[0]).toMatchObject({
      kind: 'alternation',
      options: ['cat', 'dog'],
    });
  });

  it('keeps a non-capturing group that is not plain alternatives as a group', () => {
    expect(partsFor('(?:a\\d|b)')[0]).toMatchObject({
      kind: 'group',
      groupKind: 'nonCapturing',
      body: 'a\\d|b',
    });
  });

  it('round-trips every shape it claims to understand', () => {
    for (const source of [
      'cat',
      'a\\.b',
      'ab+',
      '\\d{2,4}',
      '\\w+?',
      '[a-z]+',
      '[^a-z]',
      '^\\w+@\\w+$',
      '(ab)*',
      '(?<year>\\d{4})',
      '(?:cat|dog)+',
      '(?:a\\d|b)',
      '\\bword\\b',
      '.{1,3}',
    ]) {
      expect(roundTrips(source), source).toBe(true);
    }
  });
});

describe('parsePattern — honest refusals', () => {
  it('refuses top-level alternation, which the sequence cannot express', () => {
    const result = parsePattern('a|b');
    expect(result.ok).toBe(false);
    if (!result.ok && result.failure.kind === 'unsupported') {
      expect(result.failure.token).toBe('|');
      expect(result.failure.at).toBe(1);
    }
  });

  it('refuses lookahead and lookbehind rather than calling them groups', () => {
    for (const source of ['(?=foo)', '(?!foo)', '(?<=foo)', '(?<!foo)']) {
      const result = parsePattern(source);
      expect(result.ok, source).toBe(false);
    }
  });

  it('refuses escapes that are not simply "this character"', () => {
    for (const source of ['\\n', '\\u0041', '\\1', '\\p{L}', '\\k<name>']) {
      const result = parsePattern(source);
      expect(result.ok, source).toBe(false);
    }
  });

  it('refuses an unterminated class or group instead of guessing where it ends', () => {
    expect(parsePattern('[a-z').ok).toBe(false);
    expect(parsePattern('(ab').ok).toBe(false);
  });

  it('refuses a quantifier with nothing to bind to', () => {
    expect(parsePattern('+a').ok).toBe(false);
    expect(parsePattern('^*').ok).toBe(false);
  });

  it('refuses a pattern past the length cap without touching the engine', () => {
    const result = parsePattern('a'.repeat(MAX_PATTERN_LENGTH + 1));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.kind).toBe('tooLong');
  });

  it('never returns parts that render to something different from the input', () => {
    // The whole point of refusing: anything it accepts must round-trip, so
    // touching one control cannot silently rewrite the rest of the pattern.
    for (const source of ['cat', '(?:a|b)', '[0-9]{2}', '\\s*x\\s*']) {
      expect(roundTrips(source), source).toBe(true);
    }
  });
});

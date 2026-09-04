import { describe, expect, it } from 'vitest';

import {
  MAX_PATTERN_LENGTH,
  MAX_QUANTIFIER_COUNT,
  captureGroupNames,
  compilePattern,
  escapeClassBody,
  escapeLiteral,
  once,
  renderPart,
  renderParts,
  renderQuantifier,
  toRegexLiteral,
  toggleFlag,
  unescapeClassBody,
  type RegexPart,
} from '../../../src/components/regex/pattern';

describe('escapeLiteral', () => {
  it('escapes every character that would otherwise be syntax', () => {
    expect(escapeLiteral('a.b*c+d?e^f$g{h}i(j)k|l[m]n\\o')).toBe(
      'a\\.b\\*c\\+d\\?e\\^f\\$g\\{h\\}i\\(j\\)k\\|l\\[m\\]n\\\\o',
    );
  });

  it('produces a pattern that matches the original text and nothing looser', () => {
    const source = escapeLiteral('1.5');
    expect(new RegExp(source).test('1.5')).toBe(true);
    expect(new RegExp(source).test('195')).toBe(false);
  });

  it('leaves ordinary text alone', () => {
    expect(escapeLiteral('plain text 123')).toBe('plain text 123');
  });
});

describe('escapeClassBody', () => {
  it('keeps ranges intact — the field is class contents, not plain text', () => {
    expect(escapeClassBody('a-z0-9_')).toBe('a-z0-9_');
  });

  it('escapes a bracket that would close the class early', () => {
    expect(escapeClassBody('a]b')).toBe('a\\]b');
  });

  it('escapes a leading caret that would negate the class', () => {
    expect(escapeClassBody('^abc')).toBe('\\^abc');
    expect(escapeClassBody('a^bc')).toBe('a^bc');
  });

  it('round-trips through unescapeClassBody', () => {
    for (const body of ['a-z', 'a]b', '^abc', '\\d\\s', 'a\\]b']) {
      expect(escapeClassBody(unescapeClassBody(escapeClassBody(body)))).toBe(
        escapeClassBody(body),
      );
    }
  });
});

describe('renderQuantifier', () => {
  it('renders each kind', () => {
    expect(renderQuantifier({ kind: 'one', min: 1, max: 1, lazy: false })).toBe('');
    expect(renderQuantifier({ kind: 'optional', min: 0, max: 1, lazy: false })).toBe('?');
    expect(renderQuantifier({ kind: 'star', min: 0, max: 0, lazy: false })).toBe('*');
    expect(renderQuantifier({ kind: 'plus', min: 1, max: 0, lazy: false })).toBe('+');
    expect(renderQuantifier({ kind: 'exactly', min: 3, max: 3, lazy: false })).toBe('{3}');
    expect(renderQuantifier({ kind: 'atLeast', min: 2, max: 2, lazy: false })).toBe('{2,}');
    expect(renderQuantifier({ kind: 'between', min: 2, max: 5, lazy: false })).toBe('{2,5}');
  });

  it('appends the lazy marker where it means something', () => {
    expect(renderQuantifier({ kind: 'plus', min: 1, max: 0, lazy: true })).toBe('+?');
    expect(renderQuantifier({ kind: 'between', min: 1, max: 3, lazy: true })).toBe('{1,3}?');
    // `{3}` is already an exact count, so a lazy marker would be noise.
    expect(renderQuantifier({ kind: 'exactly', min: 3, max: 3, lazy: true })).toBe('{3}');
    expect(renderQuantifier({ kind: 'one', min: 1, max: 1, lazy: true })).toBe('');
  });

  it('clamps counts so a repeat cannot be handed to the engine unbounded', () => {
    expect(renderQuantifier({ kind: 'exactly', min: 999_999, max: 0, lazy: false })).toBe(
      `{${MAX_QUANTIFIER_COUNT}}`,
    );
    expect(renderQuantifier({ kind: 'between', min: -4, max: 2, lazy: false })).toBe('{0,2}');
  });

  it('never emits an inverted range', () => {
    expect(renderQuantifier({ kind: 'between', min: 5, max: 2, lazy: false })).toBe('{5,5}');
  });
});

describe('renderPart', () => {
  it('escapes literal text', () => {
    const part: RegexPart = { id: 'a', kind: 'literal', value: 'a.b', quantifier: once() };
    expect(renderPart(part)).toBe('a\\.b');
  });

  it('wraps a multi-character literal before quantifying it', () => {
    const part: RegexPart = {
      id: 'a',
      kind: 'literal',
      value: 'ab',
      quantifier: { kind: 'plus', min: 1, max: 0, lazy: false },
    };
    // Not `ab+`, which would repeat only the b.
    expect(renderPart(part)).toBe('(?:ab)+');
    expect(new RegExp(`^${renderPart(part)}$`).test('abab')).toBe(true);
  });

  it('does not wrap a single-character literal', () => {
    const part: RegexPart = {
      id: 'a',
      kind: 'literal',
      value: 'b',
      quantifier: { kind: 'plus', min: 1, max: 0, lazy: false },
    };
    expect(renderPart(part)).toBe('b+');
  });

  it('renders predefined and custom character classes', () => {
    expect(
      renderPart({
        id: 'a',
        kind: 'charClass',
        preset: 'digit',
        custom: '',
        negated: false,
        quantifier: once(),
      }),
    ).toBe('\\d');
    expect(
      renderPart({
        id: 'b',
        kind: 'charClass',
        preset: 'custom',
        custom: 'a-z',
        negated: true,
        quantifier: { kind: 'plus', min: 1, max: 0, lazy: false },
      }),
    ).toBe('[^a-z]+');
  });

  it('renders anchors', () => {
    expect(renderPart({ id: 'a', kind: 'anchor', anchor: 'start' })).toBe('^');
    expect(renderPart({ id: 'b', kind: 'anchor', anchor: 'end' })).toBe('$');
    expect(renderPart({ id: 'c', kind: 'anchor', anchor: 'wordBoundary' })).toBe('\\b');
    expect(renderPart({ id: 'd', kind: 'anchor', anchor: 'notWordBoundary' })).toBe('\\B');
  });

  it('renders each group kind', () => {
    expect(
      renderPart({
        id: 'a',
        kind: 'group',
        groupKind: 'capturing',
        name: '',
        body: '\\d+',
        quantifier: once(),
      }),
    ).toBe('(\\d+)');
    expect(
      renderPart({
        id: 'b',
        kind: 'group',
        groupKind: 'nonCapturing',
        name: '',
        body: 'ab',
        quantifier: { kind: 'optional', min: 0, max: 1, lazy: false },
      }),
    ).toBe('(?:ab)?');
    expect(
      renderPart({
        id: 'c',
        kind: 'group',
        groupKind: 'named',
        name: 'year',
        body: '\\d{4}',
        quantifier: once(),
      }),
    ).toBe('(?<year>\\d{4})');
  });

  it('escapes each alternation option and skips empty ones', () => {
    expect(
      renderPart({
        id: 'a',
        kind: 'alternation',
        options: ['c.t', 'dog', ''],
        quantifier: once(),
      }),
    ).toBe('(?:c\\.t|dog)');
  });

  it('renders nothing for a part with no content yet', () => {
    expect(renderPart({ id: 'a', kind: 'literal', value: '', quantifier: once() })).toBe('');
    expect(
      renderPart({
        id: 'b',
        kind: 'charClass',
        preset: 'custom',
        custom: '',
        negated: false,
        quantifier: once(),
      }),
    ).toBe('');
    expect(
      renderPart({ id: 'c', kind: 'alternation', options: ['', ''], quantifier: once() }),
    ).toBe('');
  });
});

describe('renderParts', () => {
  it('joins the sequence into one pattern', () => {
    const parts: RegexPart[] = [
      { id: '1', kind: 'anchor', anchor: 'start' },
      {
        id: '2',
        kind: 'charClass',
        preset: 'word',
        custom: '',
        negated: false,
        quantifier: { kind: 'plus', min: 1, max: 0, lazy: false },
      },
      { id: '3', kind: 'literal', value: '@', quantifier: once() },
      { id: '4', kind: 'anchor', anchor: 'end' },
    ];
    expect(renderParts(parts)).toBe('^\\w+@$');
    expect(new RegExp(renderParts(parts)).test('user@')).toBe(true);
  });
});

describe('toggleFlag', () => {
  it('adds, removes and keeps the canonical order', () => {
    expect(toggleFlag('', 'i')).toBe('i');
    expect(toggleFlag('i', 'g')).toBe('gi');
    expect(toggleFlag('gi', 'i')).toBe('g');
    expect(toggleFlag('yu', 'm')).toBe('muy');
  });

  it('keeps the ECMAScript Unicode modes mutually exclusive in either click order', () => {
    expect(toggleFlag('u', 'v')).toBe('v');
    expect(toggleFlag('v', 'u')).toBe('u');
    expect(toggleFlag('gu', 'v')).toBe('gv');
    expect(toggleFlag('gv', 'u')).toBe('gu');
    expect(toggleFlag('uv', 'u')).toBe('v');
    expect(toggleFlag('uv', 'v')).toBe('u');
  });
});

describe('compilePattern', () => {
  it('compiles a valid pattern with its flags', () => {
    const result = compilePattern('a.c', 'gi');
    expect(result.error).toBeNull();
    expect(result.regex?.source).toBe('a.c');
    expect(result.regex?.flags).toBe('gi');
  });

  it('reports the engine error verbatim rather than a paraphrase', () => {
    const result = compilePattern('a[', '');
    expect(result.regex).toBeNull();
    expect(result.error?.kind).toBe('syntax');
    if (result.error?.kind === 'syntax') {
      // Whatever the host engine says, it is the message the user is shown.
      expect(result.error.message.length).toBeGreaterThan(0);
    }
  });

  it('rejects both Unicode modes before relying on runtime support', () => {
    expect(compilePattern('', 'uv')).toMatchObject({
      regex: null,
      error: { kind: 'syntax', message: 'The u and v flags are mutually exclusive in ECMAScript.' },
    });
    expect(compilePattern('', 'vu')).toMatchObject({
      regex: null,
      error: { kind: 'syntax', message: 'The u and v flags are mutually exclusive in ECMAScript.' },
    });
  });

  it('refuses an over-long pattern before it reaches the engine', () => {
    const result = compilePattern('a'.repeat(MAX_PATTERN_LENGTH + 1), '');
    expect(result.regex).toBeNull();
    expect(result.error).toEqual({
      kind: 'tooLong',
      limit: MAX_PATTERN_LENGTH,
      length: MAX_PATTERN_LENGTH + 1,
    });
  });
});

describe('toRegexLiteral', () => {
  it('quotes the pattern with its flags', () => {
    expect(toRegexLiteral('a.c', 'gi')).toBe('/a.c/gi');
  });

  it('escapes a bare slash so the literal pastes into source unchanged', () => {
    expect(toRegexLiteral('a/b', 'i')).toBe('/a\\/b/i');
  });

  it('leaves a slash inside a character class alone', () => {
    expect(toRegexLiteral('[a/b]', '')).toBe('/[a/b]/');
  });

  it('does not double-escape an already escaped slash', () => {
    expect(toRegexLiteral('a\\/b', '')).toBe('/a\\/b/');
  });

  it('uses the empty-pattern spelling rather than an unparseable //', () => {
    expect(toRegexLiteral('', 'i')).toBe('/(?:)/i');
  });
});

describe('captureGroupNames', () => {
  it('reports names by capture position, ignoring non-capturing groups', () => {
    expect(captureGroupNames('(a)(?:b)(?<c>d)')).toEqual([undefined, 'c']);
  });

  it('ignores parentheses inside a character class', () => {
    expect(captureGroupNames('[()]+(x)')).toEqual([undefined]);
  });

  it('ignores an escaped parenthesis', () => {
    expect(captureGroupNames('\\((a)\\)')).toEqual([undefined]);
  });

  it('does not count lookarounds as captures', () => {
    expect(captureGroupNames('(?=a)(?!b)(?<=c)(?<!d)(e)')).toEqual([undefined]);
  });
});

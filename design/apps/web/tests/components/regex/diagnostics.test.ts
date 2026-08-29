import { describe, expect, it } from 'vitest';

import {
  MAX_REPLACEMENT_LENGTH,
  REGEX_CAPABILITIES,
  explainPattern,
  getRegexEngineInfo,
  parseSnippets,
  previewReplacement,
  profilePattern,
  serializeSnippets,
  tokenizePattern,
} from '../../../src/components/regex/diagnostics';
import { compilePattern, REGEX_FLAGS, supportsRegexFlag } from '../../../src/components/regex/pattern';

describe('regex diagnostics', () => {
  it('exposes the complete pinned-engine flag surface with runtime feature detection', () => {
    expect(REGEX_FLAGS).toEqual(['d', 'g', 'i', 'm', 's', 'u', 'v', 'y']);
    expect(typeof supportsRegexFlag('d')).toBe('boolean');
    expect(typeof supportsRegexFlag('v')).toBe('boolean');
    expect(compilePattern('', 'd').error === null).toBe(supportsRegexFlag('d'));
    expect(compilePattern('', 'v').error === null).toBe(supportsRegexFlag('v'));
  });

  it('keeps UnicodeSet intersection and subtraction conditional on the v flag', () => {
    const source = '[\\p{ASCII}&&\\p{Letter}]';
    expect(explainPattern(source, 'u').tokens[0]?.capability).toBe('conditional');
    if (supportsRegexFlag('v')) {
      expect(explainPattern(source, 'v').tokens[0]?.capability).toBe('supported');
      expect(compilePattern(source, 'v').error).toBeNull();
    }
  });

  it('names the real engine, dialect, flags and honest runtime version boundary', () => {
    const info = getRegexEngineInfo('gi');
    expect(info.engine).toBe('JavaScript RegExp');
    expect(info.dialect).toContain('ECMAScript');
    expect(info.flags).toBe('gi');
    expect(info.version).toBeTruthy();
    expect(['user-agent', 'unavailable']).toContain(info.versionSource);
  });

  it('tokenizes supported, conditional and unsupported constructs without rewriting source', () => {
    const source = '(?<word>\\p{Letter}+)++|(?<=USD)\\d+';
    const tokens = tokenizePattern(source);
    expect(tokens.map((item) => item.source).join('')).toBe(source);
    expect(tokens.some((item) => item.capability === 'conditional')).toBe(true);
    expect(tokens.some((item) => item.capability === 'unsupported')).toBe(true);
    expect(explainPattern(source).unsupported.map((item) => item.label)).toContain('Possessive quantifier');
  });

  it('explains Unicode code-point escapes with their complete source range', () => {
    const source = String.raw`\u{1F600}`;
    const token = tokenizePattern(source)[0];
    expect(token).toMatchObject({ source, label: 'Unicode code point', start: 0, end: source.length });
    expect(explainPattern(source).tokens).toHaveLength(1);
    expect(explainPattern(source, '').tokens[0]?.capability).toBe('conditional');
    expect(explainPattern(source, 'u').tokens[0]?.capability).toBe('supported');
  });

  it('keeps a capability matrix that shows unavailable constructs instead of hiding them', () => {
    const atomic = REGEX_CAPABILITIES.find((item) => item.id === 'atomic-groups');
    const lookaround = REGEX_CAPABILITIES.find((item) => item.id === 'lookaround');
    expect(atomic).toMatchObject({ status: 'unsupported', guided: false });
    expect(atomic?.reason).toContain('JavaScript');
    expect(lookaround).toMatchObject({ status: 'supported', guided: false });
  });

  it('expands replacement captures, named captures and literal dollars', () => {
    const result = previewReplacement(/(?<word>cat)/g, 'cat dog cat', '[$<word>] $$ $&');
    expect(result.ok).toBe(true);
    expect(result.matchCount).toBe(2);
    expect(result.output).toBe('[cat] $ cat dog [cat] $ cat');
  });

  it('matches native replacement semantics for unmatched and invalid capture references', () => {
    expect(previewReplacement(/(a)?b/g, 'b ab', '$1')).toMatchObject({ ok: true, output: ' a' });
    expect(previewReplacement(/(a)b/g, 'ab', '$2')).toMatchObject({ ok: true, output: '$2' });
    expect(previewReplacement(/(a)b/g, 'ab', '$10')).toMatchObject({ ok: true, output: 'a0' });
  });

  it('honours one-replacement semantics when global is absent', () => {
    const result = previewReplacement(/cat/, 'cat cat', 'dog');
    expect(result.ok).toBe(true);
    expect(result.matchCount).toBe(1);
    expect(result.output).toBe('dog cat');
  });

  it('refuses an oversized replacement and bounds zero-width profiling', () => {
    const result = previewReplacement(/(?:)/g, 'ab', 'x'.repeat(MAX_REPLACEMENT_LENGTH + 1));
    expect(result.ok).toBe(false);
    expect(profilePattern(/(?:)/g, 'ab').matchCount).toBeLessThanOrEqual(200);
  });

  it('refuses high-risk patterns before synchronous evaluation', () => {
    const result = previewReplacement(/(a+)+$/g, `${'a'.repeat(100)}!`, 'x');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('backtracking');
    expect(previewReplacement(/((a+)+)+$/g, `${'a'.repeat(100)}!`, 'x').ok).toBe(false);
    expect(previewReplacement(/(a|aa)+$/g, `${'a'.repeat(100)}!`, 'x').ok).toBe(false);
    expect(previewReplacement(/(a+)(a+)b/g, 'aaab', 'x').ok).toBe(true);
    expect(profilePattern(null, 'aaaa!', '(a+)+$').status).toBe('refused');
    expect(profilePattern(/a/g, 'a'.repeat(10_001)).sampleTruncated).toBe(true);
  });

  it('round-trips bounded, validated snippets and refuses unknown schema', () => {
    const json = serializeSnippets([{ id: 'one', name: 'Words', pattern: '\\w+', flags: 'gi' }]);
    expect(parseSnippets(json)).toEqual({
      ok: true,
      snippets: [{ id: 'one', name: 'Words', pattern: '\\w+', flags: 'gi' }],
    });
    expect(parseSnippets('{"version":2,"snippets":[]}').ok).toBe(false);
    expect(parseSnippets(JSON.stringify({ version: 1, snippets: [{ id: 'x', name: 'bad', pattern: 'a', flags: 'q' }] })).ok).toBe(false);
    expect(parseSnippets(JSON.stringify({ version: 1, snippets: [{ id: 'x', name: 'bad', pattern: 'a', flags: '', extra: true }] })).ok).toBe(false);
    expect(parseSnippets(JSON.stringify({ version: 1, snippets: [{ id: 'x', name: 'one', pattern: 'a', flags: '' }, { id: 'x', name: 'two', pattern: 'b', flags: '' }] })).ok).toBe(false);
    expect(parseSnippets('{"version":1,"snippets":[],"extra":true}').ok).toBe(false);
    expect(parseSnippets('{"version":1,"version":1,"snippets":[]}').ok).toBe(false);
    const supportedFlags = ['d', 'v'].filter((flag) => supportsRegexFlag(flag)).join('');
    const flagged = parseSnippets(JSON.stringify({
      version: 1,
      snippets: [{ id: 'flagged', name: 'Engine flags', pattern: 'a', flags: supportedFlags }],
    }));
    expect(flagged.ok).toBe(supportsRegexFlag('d') && supportsRegexFlag('v'));
    expect(parseSnippets(JSON.stringify({
      version: 1,
      snippets: [{ id: 'uv', name: 'Invalid Unicode modes', pattern: 'a', flags: 'uv' }],
    }))).toEqual({ ok: false, error: 'A snippet cannot combine the u and v flags.' });
    expect(parseSnippets(JSON.stringify({
      version: 1,
      snippets: [{ id: 'vu', name: 'Invalid Unicode modes', pattern: 'a', flags: 'vu' }],
    }))).toEqual({ ok: false, error: 'A snippet cannot combine the u and v flags.' });
  });
});

// Advanced diagnostics for the regex workbench.
//
// This module deliberately stays on the same JavaScript RegExp engine as the
// search controller. It does not reinterpret a pattern as PCRE or silently
// downgrade constructs that this engine cannot run. Every token carries its
// exact source range, an explanation, and a capability verdict so the UI can
// show unsupported syntax instead of making a plausible-looking lie.

import { MAX_PATTERN_LENGTH, classifyPatternRisk, compilePattern, hasMutuallyExclusiveUnicodeFlags, supportsRegexFlag } from './pattern';
import { MAX_SAMPLE_MATCHES, SAMPLE_BUDGET_MS, advanceStringIndex, runSample } from './evaluate';

export const MAX_REPLACEMENT_LENGTH = 512;
export const MAX_REPLACEMENT_OUTPUT = 20_000;
export const MAX_SNIPPETS = 50;
export const MAX_SNIPPET_NAME_LENGTH = 80;
export const MAX_SNIPPET_ID_LENGTH = 80;
/** Byte bound checked before decoding an imported snippet file. */
export const MAX_SNIPPET_BYTES = 50_000;

export type RegexCapabilityStatus = 'supported' | 'unsupported' | 'conditional';

export interface RegexCapability {
  id: string;
  label: string;
  status: RegexCapabilityStatus;
  example: string;
  reason: string;
  guided: boolean;
  /** Translation keys are optional in older locale bundles and resolve through the shared fallback. */
  labelKey: string;
  reasonKey: string;
}

export const REGEX_CAPABILITIES: readonly RegexCapability[] = [
  { id: 'literal', label: 'Literal text', labelKey: 'regexBuilder.capabilityLiteral', status: 'supported', example: 'word', reason: 'Escaped and unescaped literal characters are supported by JavaScript RegExp.', reasonKey: 'regexBuilder.reasonLiteral', guided: true },
  { id: 'unicode-code-point', label: 'Unicode code points', labelKey: 'regexBuilder.capabilityUnicodeCodePoint', status: 'supported', example: '\\u{1F600}', reason: 'Code-point escapes are supported when the u or v flag is active; the builder preserves the exact escape.', reasonKey: 'regexBuilder.reasonUnicodeCodePoint', guided: false },
  { id: 'character-class', label: 'Character classes', labelKey: 'regexBuilder.capabilityCharacterClass', status: 'supported', example: '[a-z]\\d', reason: 'Bracket classes and the JavaScript shorthand classes are supported.', reasonKey: 'regexBuilder.reasonCharacterClass', guided: true },
  { id: 'class-intersection', label: 'Class intersection and subtraction', labelKey: 'regexBuilder.capabilityClassIntersection', status: 'conditional', example: '[a-z&&[^aeiou]]', reason: 'UnicodeSet intersection and subtraction require the v flag in the active JavaScript RegExp dialect.', reasonKey: 'regexBuilder.reasonClassIntersection', guided: false },
  { id: 'anchors', label: 'Anchors and boundaries', labelKey: 'regexBuilder.capabilityAnchors', status: 'supported', example: '^word\\b$', reason: 'Start, end, word-boundary, and line anchors are supported through the active flags.', reasonKey: 'regexBuilder.reasonAnchors', guided: true },
  { id: 'capture-groups', label: 'Capturing and named groups', labelKey: 'regexBuilder.capabilityCaptureGroups', status: 'supported', example: '(?<name>word)', reason: 'Numbered and named captures are returned by the engine.', reasonKey: 'regexBuilder.reasonCaptureGroups', guided: true },
  { id: 'non-capturing-groups', label: 'Non-capturing groups', labelKey: 'regexBuilder.capabilityNonCapturingGroups', status: 'supported', example: '(?:word)', reason: 'Non-capturing grouping is supported.', reasonKey: 'regexBuilder.reasonNonCapturingGroups', guided: true },
  { id: 'alternation', label: 'Alternation', labelKey: 'regexBuilder.capabilityAlternation', status: 'supported', example: '(?:cat|dog)', reason: 'The engine supports alternation with the vertical bar.', reasonKey: 'regexBuilder.reasonAlternation', guided: true },
  { id: 'quantifiers', label: 'Greedy and lazy quantifiers', labelKey: 'regexBuilder.capabilityQuantifiers', status: 'supported', example: 'a+?', reason: 'The active engine supports greedy, lazy, and bounded quantifiers.', reasonKey: 'regexBuilder.reasonQuantifiers', guided: true },
  { id: 'lookaround', label: 'Lookahead and lookbehind', labelKey: 'regexBuilder.capabilityLookaround', status: 'supported', example: '(?<=USD)\\d+', reason: 'The active JavaScript engine supports positive and negative lookaround.', reasonKey: 'regexBuilder.reasonLookaround', guided: false },
  { id: 'backreferences', label: 'Numbered and named backreferences', labelKey: 'regexBuilder.capabilityBackreferences', status: 'supported', example: '(\\w+)\\1', reason: 'Backreferences are supported by the active engine and retain capture semantics.', reasonKey: 'regexBuilder.reasonBackreferences', guided: false },
  { id: 'unicode-properties', label: 'Unicode property escapes', labelKey: 'regexBuilder.capabilityUnicodeProperties', status: 'conditional', example: '\\p{Letter}', reason: 'Supported when the u or v flag is active and the host engine supports the property.', reasonKey: 'regexBuilder.reasonUnicodeProperties', guided: false },
  { id: 'inline-modifiers', label: 'Inline modifiers', labelKey: 'regexBuilder.capabilityInlineModifiers', status: 'unsupported', example: '(?im:word)', reason: 'This JavaScript RegExp dialect has no inline flag-group syntax; use the workbench flag controls instead.', reasonKey: 'regexBuilder.reasonInlineModifiers', guided: false },
  { id: 'atomic-groups', label: 'Atomic groups', labelKey: 'regexBuilder.capabilityAtomicGroups', status: 'unsupported', example: '(?>word)', reason: 'Atomic groups are not part of the JavaScript RegExp syntax exposed here.', reasonKey: 'regexBuilder.reasonAtomicGroups', guided: false },
  { id: 'possessive-quantifiers', label: 'Possessive quantifiers', labelKey: 'regexBuilder.capabilityPossessiveQuantifiers', status: 'unsupported', example: 'a++', reason: 'Possessive quantifiers are not part of the JavaScript RegExp syntax exposed here.', reasonKey: 'regexBuilder.reasonPossessiveQuantifiers', guided: false },
  { id: 'conditionals', label: 'Conditional groups', labelKey: 'regexBuilder.capabilityConditionals', status: 'unsupported', example: '(?(name)yes|no)', reason: 'Conditional groups are a PCRE-family construct and are not supported by JavaScript RegExp.', reasonKey: 'regexBuilder.reasonConditionals', guided: false },
  { id: 'subroutines', label: 'Subroutines and recursion', labelKey: 'regexBuilder.capabilitySubroutines', status: 'unsupported', example: '(?&name)', reason: 'Subroutine and recursive calls are not supported by JavaScript RegExp.', reasonKey: 'regexBuilder.reasonSubroutines', guided: false },
  { id: 'replacement-templates', label: 'Replacement templates', labelKey: 'regexBuilder.capabilityReplacementTemplates', status: 'supported', example: '$<name> / $1 / $$', reason: 'Replacement templates are expanded locally for the preview, with bounded input and output.', reasonKey: 'regexBuilder.reasonReplacementTemplates', guided: false },
] as const;

export interface RegexEngineInfo {
  engine: string;
  dialect: string;
  version: string;
  flags: string;
  versionSource: 'user-agent' | 'unavailable';
}

function readEngineVersion(): { version: string; source: RegexEngineInfo['versionSource'] } {
  if (typeof navigator === 'undefined') return { version: 'unavailable', source: 'unavailable' };
  const userAgent = navigator.userAgent || '';
  const chromium = /(?:Chrome|Chromium|Edg|Electron)\/(\d+(?:\.\d+)*)/.exec(userAgent);
  if (chromium?.[1]) return { version: chromium[1], source: 'user-agent' };
  const firefox = /Firefox\/(\d+(?:\.\d+)*)/.exec(userAgent);
  if (firefox?.[1]) return { version: firefox[1], source: 'user-agent' };
  const safari = /Version\/(\d+(?:\.\d+)*).*Safari\//.exec(userAgent);
  if (safari?.[1]) return { version: safari[1], source: 'user-agent' };
  return { version: 'unavailable', source: 'unavailable' };
}

export function getRegexEngineInfo(flags = ''): RegexEngineInfo {
  const detected = readEngineVersion();
  return {
    engine: 'JavaScript RegExp',
    dialect: 'ECMAScript regular expressions',
    version: detected.version,
    flags: flags || '(none)',
    versionSource: detected.source,
  };
}

export type RegexTokenKind =
  | 'literal'
  | 'escape'
  | 'class'
  | 'anchor'
  | 'group'
  | 'alternation'
  | 'quantifier'
  | 'wildcard'
  | 'backreference'
  | 'unknown';

export interface RegexToken {
  kind: RegexTokenKind;
  source: string;
  start: number;
  end: number;
  label: string;
  explanation: string;
  capability: RegexCapabilityStatus;
  risk: 'none' | 'review';
}

export interface RegexExplanation {
  source: string;
  tokens: RegexToken[];
  unsupported: RegexToken[];
  review: RegexToken[];
  summary: string;
  summaryKey: string;
  summaryVars: Record<string, string | number>;
}

function token(
  kind: RegexTokenKind,
  source: string,
  start: number,
  label: string,
  explanation: string,
  capability: RegexCapabilityStatus = 'supported',
  risk: RegexToken['risk'] = 'none',
): RegexToken {
  return {
    kind,
    source,
    start,
    end: start + source.length,
    label,
    explanation,
    capability,
    risk,
  };
}

function classEnd(source: string, start: number): number {
  for (let i = start + 1; i < source.length; i += 1) {
    if (source[i] === '\\') {
      i += 1;
      continue;
    }
    if (source[i] === ']') return i;
  }
  return source.length - 1;
}

function groupHead(source: string, start: number): { length: number; label: string; explanation: string; capability: RegexCapabilityStatus } | null {
  if (!source.startsWith('(?', start)) return null;
  if (source.startsWith('(?:', start)) return { length: 3, label: 'Non-capturing group', explanation: 'Groups the expression without adding a capture column.', capability: 'supported' };
  if (source.startsWith('(?=', start) || source.startsWith('(?!', start)) return { length: 3, label: 'Lookahead', explanation: 'Checks the following text without consuming it.', capability: 'supported' };
  if (source.startsWith('(?<=', start) || source.startsWith('(?<!', start)) return { length: 4, label: 'Lookbehind', explanation: 'Checks the preceding text without consuming it.', capability: 'supported' };
  const named = /^\(\?<([A-Za-z_$][\w$]*)>/.exec(source.slice(start));
  if (named) return { length: named[0].length, label: `Named capture ${named[1]}`, explanation: 'Captures text and exposes it by name as well as by number.', capability: 'supported' };
  const inlineModifier = /^\(\?[imsu-]+:/.exec(source.slice(start));
  if (inlineModifier) return { length: inlineModifier[0].length, label: 'Inline modifier', explanation: 'Inline modifiers are visible but cannot run in this JavaScript dialect.', capability: 'unsupported' };
  if (source.startsWith('(?>', start)) return { length: 3, label: 'Atomic group', explanation: 'Atomic groups are visible but are not supported by this engine.', capability: 'unsupported' };
  if (source.startsWith('(?&', start)) return { length: 3, label: 'Subroutine', explanation: 'Recursive subroutine calls are not supported by this engine.', capability: 'unsupported' };
  if (source.startsWith('(?(', start)) return { length: 3, label: 'Conditional group', explanation: 'Conditional groups are not supported by this engine.', capability: 'unsupported' };
  return { length: 2, label: 'Unsupported group construct', explanation: 'This group prefix is not recognised by the active JavaScript dialect.', capability: 'unsupported' };
}

/** Tokenise without changing the source, including syntax the engine rejects. */
export function tokenizePattern(source: string): RegexToken[] {
  const tokens: RegexToken[] = [];
  let i = 0;
  while (i < source.length) {
    const start = i;
    const ch = source[i] ?? '';
    if (ch === '\\') {
      let end = i + 2;
      if (source[i + 1] === 'p' || source[i + 1] === 'P') {
        const close = source.indexOf('}', i + 2);
        if (close >= 0) end = close + 1;
      }
      if (source[i + 1] === 'u' && source[i + 2] === '{') {
        const close = source.indexOf('}', i + 3);
        if (close >= 0) end = close + 1;
      }
      const value = source.slice(i, Math.min(end, source.length));
      const property = /^\\[pP]\{[^}]+\}$/.test(value);
      const codePoint = /^\\u\{[0-9A-Fa-f]+\}$/.test(value);
      const backreference = /^\\(?:\d+|k<[^>]+>)$/.test(value);
      tokens.push(token(
        backreference ? 'backreference' : 'escape',
        value,
        start,
        backreference ? 'Backreference' : property ? 'Unicode property escape' : codePoint ? 'Unicode code point' : 'Escape',
        backreference ? 'Reuses text captured by an earlier group.' : property ? 'Matches a Unicode property when the host supports it and the u or v flag is active.' : codePoint ? 'Matches the exact Unicode code point when the u or v flag is active.' : 'The escaped sequence has engine-defined meaning rather than literal text.',
        property || codePoint ? 'conditional' : 'supported',
      ));
      i = end;
      continue;
    }
    if (ch === '[') {
      const end = Math.min(source.length, classEnd(source, i) + 1);
      const value = source.slice(i, end);
      const setNotation = value.includes('&&') || value.includes('~~') || value.includes('--');
      tokens.push(token('class', value, start, setNotation ? 'Class set notation' : 'Character class', setNotation ? 'Intersection and subtraction are not available in this dialect.' : 'Matches one character from the class, with optional negation and ranges.', setNotation ? 'unsupported' : 'supported'));
      i = end;
      continue;
    }
    if (ch === '(') {
      const head = groupHead(source, i);
      if (head) {
        const value = source.slice(i, Math.min(source.length, i + head.length));
        tokens.push(token('group', value, start, head.label, head.explanation, head.capability));
        i += head.length;
      } else {
        tokens.push(token('group', ch, start, 'Capturing group', 'Captures the enclosed text by number.', 'supported'));
        i += 1;
      }
      continue;
    }
    if (ch === ')') {
      tokens.push(token('group', ch, start, 'Group end', 'Ends the nearest open group.', 'supported'));
      i += 1;
      continue;
    }
    if (ch === '|') {
      tokens.push(token('alternation', ch, start, 'Alternation', 'Chooses between the expression on the left and the expression on the right.', 'supported'));
      i += 1;
      continue;
    }
    if (ch === '^' || ch === '$') {
      tokens.push(token('anchor', ch, start, 'Anchor', 'Constrains where a match can begin or end.', 'supported'));
      i += 1;
      continue;
    }
    if (ch === '.') {
      tokens.push(token('wildcard', ch, start, 'Wildcard', 'Matches a character, except line terminators unless the s flag is active.', 'supported'));
      i += 1;
      continue;
    }
    if (ch === '*' || ch === '+' || ch === '?' || ch === '{') {
      let end = i + 1;
      if (ch === '{') {
        const close = source.indexOf('}', i + 1);
        if (close >= 0) end = close + 1;
      }
      if (source[end] === '?') end += 1;
      const value = source.slice(i, end);
      const possessive = value.endsWith('+');
      tokens.push(token('quantifier', value, start, possessive ? 'Possessive quantifier' : 'Quantifier', possessive ? 'Possessive quantifiers are not supported by JavaScript RegExp.' : 'Repeats the preceding atom. A trailing ? requests the shortest permitted match.', possessive ? 'unsupported' : 'supported', 'review'));
      i = end;
      continue;
    }
    tokens.push(token('literal', ch, start, 'Literal', 'Matches this character literally.', 'supported'));
    i += 1;
  }
  return tokens;
}

export function explainPattern(source: string, flags = ''): RegexExplanation {
  const bounded = source.slice(0, MAX_PATTERN_LENGTH);
  const unicodeEnabled = flags.includes('u') || flags.includes('v');
  const unicodeSetsEnabled = flags.includes('v') && supportsRegexFlag('v');
  const tokens = tokenizePattern(bounded).map((item) => (
    item.label === 'Class set notation'
      ? { ...item, capability: unicodeSetsEnabled ? 'supported' as const : 'conditional' as const }
      : (item.label === 'Unicode property escape' || item.label === 'Unicode code point') && unicodeEnabled
        ? { ...item, capability: 'supported' as const }
      : item
  ));
  const unsupported = tokens.filter((item) => item.capability === 'unsupported');
  const review = tokens.filter((item) => item.risk === 'review' || item.capability === 'conditional');
  const summaryKey: string = unsupported.length
    ? 'regexBuilder.summaryUnsupported'
    : review.length
      ? 'regexBuilder.summaryConditional'
      : 'regexBuilder.summarySupported';
  const summaryVars = unsupported.length
    ? { count: unsupported.length }
    : review.length
      ? { tokens: tokens.length, count: review.length }
      : { tokens: tokens.length };
  const summary = unsupported.length
    ? `${unsupported.length} construct(s) need attention because this engine cannot run them.`
    : review.length
      ? `${tokens.length} token(s) explained; ${review.length} construct(s) depend on flags or deserve a performance review.`
      : `${tokens.length} token(s) explained by the active JavaScript RegExp dialect.`;
  return { source: bounded, tokens, unsupported, review, summary, summaryKey, summaryVars };
}

export interface ReplacementPreview {
  ok: boolean;
  output: string;
  matchCount: number;
  truncated: boolean;
  timedOut: boolean;
  error: string | null;
}

function expandReplacement(
  template: string,
  match: string,
  captures: (string | undefined)[],
  named: Record<string, string | undefined> | undefined,
  before: string,
  after: string,
): string {
  return template.replace(/\$(\$|&|`|'|\d{1,2}|<[^>]+>)/g, (whole, marker: string) => {
    if (marker === '$') return '$';
    if (marker === '&') return match;
    if (marker === '`') return before;
    if (marker === "'") return after;
    if (marker.startsWith('<')) {
      const name = marker.slice(1, -1);
      return named && Object.prototype.hasOwnProperty.call(named, name) ? named[name] ?? '' : whole;
    }
    // Native replacement semantics: consume two digits only when that group
    // exists, use an empty string for an unmatched group, and leave an invalid
    // group reference literal. `$0` is not a JavaScript replacement token.
    if (marker === '0') return whole;
    const twoDigit = marker.length === 2 ? Number(marker) : -1;
    const oneDigit = Number(marker[0]) - 1;
    if (twoDigit > 0 && twoDigit <= captures.length) return captures[twoDigit - 1] ?? '';
    if (oneDigit >= 0 && oneDigit < captures.length) {
      return `${captures[oneDigit] ?? ''}${marker.length === 2 ? marker[1] : ''}`;
    }
    return whole;
  });
}

export function previewReplacement(regex: RegExp | null, sample: string, replacement: string): ReplacementPreview {
  if (!regex) return { ok: false, output: '', matchCount: 0, truncated: false, timedOut: false, error: 'The pattern is not compiled.' };
  if (replacement.length > MAX_REPLACEMENT_LENGTH) {
    return { ok: false, output: '', matchCount: 0, truncated: false, timedOut: false, error: `Replacement is longer than ${MAX_REPLACEMENT_LENGTH} characters.` };
  }
  const subject = sample.slice(0, 10_000);
  const safety = runSample(regex, subject);
  if (safety.refused) {
    return {
      ok: false,
      output: '',
      matchCount: 0,
      truncated: false,
      timedOut: false,
      error: safety.refusalReason ?? 'Pattern evaluation was refused before the engine ran.',
    };
  }
  if (safety.timedOut || safety.truncated) {
    return {
      ok: false,
      output: '',
      matchCount: safety.matches.length,
      truncated: true,
      timedOut: safety.timedOut,
      error: safety.timedOut
        ? 'Replacement preview stopped at the local evaluation budget.'
        : 'Replacement preview stopped at the local match limit.',
    };
  }
  let scan: RegExp;
  const global = regex.flags.includes('g');
  try {
    scan = new RegExp(regex.source, regex.flags);
  } catch (error) {
    return { ok: false, output: '', matchCount: 0, truncated: false, timedOut: false, error: error instanceof Error ? error.message : String(error) };
  }
  let count = 0;
  let truncated = false;
  let output = '';
  let cursor = 0;
  let timedOut = false;
  const started = Date.now();
  for (;;) {
    const found = scan.exec(subject);
    if (!found) break;
    const before = subject.slice(0, found.index);
    const after = subject.slice(found.index + found[0].length);
    const expanded = expandReplacement(replacement, found[0], found.slice(1), found.groups, before, after);
    output += subject.slice(cursor, found.index) + expanded;
    cursor = found.index + found[0].length;
    count += 1;
    if (found[0].length === 0) {
      const nextIndex = advanceStringIndex(subject, scan.lastIndex, scan.unicode);
      if (nextIndex === scan.lastIndex && scan.lastIndex >= subject.length) break;
      scan.lastIndex = nextIndex;
    }
    if (output.length > MAX_REPLACEMENT_OUTPUT) {
      output = output.slice(0, MAX_REPLACEMENT_OUTPUT);
      truncated = true;
      break;
    }
    if (count >= MAX_SAMPLE_MATCHES || Date.now() - started > SAMPLE_BUDGET_MS) {
      truncated = true;
      timedOut = Date.now() - started > SAMPLE_BUDGET_MS;
      break;
    }
    if (!global) break;
  }
  if (!truncated) output += subject.slice(cursor);
  if (output.length > MAX_REPLACEMENT_OUTPUT) {
    output = output.slice(0, MAX_REPLACEMENT_OUTPUT);
    truncated = true;
  }
  return { ok: true, output, matchCount: count, truncated, timedOut, error: null };
}

export interface RegexSnippet {
  id: string;
  name: string;
  pattern: string;
  flags: string;
}

/* JSON.parse intentionally accepts duplicate object keys and keeps only the
 * last value. Snippet import is a user-controlled boundary, so reject that
 * ambiguity before parsing rather than allowing one key to silently shadow
 * another. This bounded scanner handles JSON strings, arrays, objects and
 * primitive values without evaluating any supplied text. */
function assertNoDuplicateJsonKeys(raw: string): void {
  let cursor = 0;
  const whitespace = () => {
    while (cursor < raw.length && /\s/.test(raw[cursor] ?? '')) cursor += 1;
  };
  const string = (): string => {
    if (raw[cursor] !== '"') throw new Error('Invalid JSON string.');
    const start = cursor;
    cursor += 1;
    for (;;) {
      if (cursor >= raw.length) throw new Error('Unterminated JSON string.');
      const ch = raw[cursor]!;
      if (ch === '\\') {
        cursor += 2;
        continue;
      }
      cursor += 1;
      if (ch === '"') {
        const value = JSON.parse(raw.slice(start, cursor));
        if (typeof value !== 'string') throw new Error('Invalid JSON string.');
        return value;
      }
    }
  };
  const value = (depth: number): void => {
    if (depth > 32) throw new Error('Snippet JSON is nested too deeply.');
    whitespace();
    const ch = raw[cursor];
    if (ch === '{') {
      cursor += 1;
      whitespace();
      const keys = new Set<string>();
      if (raw[cursor] === '}') {
        cursor += 1;
        return;
      }
      for (;;) {
        whitespace();
        const key = string();
        if (keys.has(key)) throw new Error(`Duplicate JSON field: ${key}`);
        keys.add(key);
        whitespace();
        if (raw[cursor] !== ':') throw new Error('Invalid JSON object.');
        cursor += 1;
        value(depth + 1);
        whitespace();
        if (raw[cursor] === '}') {
          cursor += 1;
          return;
        }
        if (raw[cursor] !== ',') throw new Error('Invalid JSON object.');
        cursor += 1;
      }
    }
    if (ch === '[') {
      cursor += 1;
      whitespace();
      if (raw[cursor] === ']') {
        cursor += 1;
        return;
      }
      for (;;) {
        value(depth + 1);
        whitespace();
        if (raw[cursor] === ']') {
          cursor += 1;
          return;
        }
        if (raw[cursor] !== ',') throw new Error('Invalid JSON array.');
        cursor += 1;
      }
    }
    if (ch === '"') {
      string();
      return;
    }
    const start = cursor;
    while (cursor < raw.length && !/[\s,}\]]/.test(raw[cursor] ?? '')) cursor += 1;
    if (start === cursor || !['true', 'false', 'null'].includes(raw.slice(start, cursor)) && !/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(raw.slice(start, cursor))) {
      throw new Error('Invalid JSON value.');
    }
  };
  value(0);
  whitespace();
  if (cursor !== raw.length) throw new Error('Unexpected JSON data after the document.');
}

export function serializeSnippets(snippets: readonly RegexSnippet[]): string {
  return JSON.stringify({ version: 1, snippets: snippets.slice(0, MAX_SNIPPETS) }, null, 2);
}

export function parseSnippets(raw: string): { ok: true; snippets: RegexSnippet[] } | { ok: false; error: string } {
  if (raw.length > MAX_SNIPPET_BYTES) return { ok: false, error: 'Snippet file is too large.' };
  try {
    assertNoDuplicateJsonKeys(raw);
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !('version' in parsed) || parsed.version !== 1 || !Array.isArray(parsed.snippets)) {
      return { ok: false, error: 'Snippet file must use version 1.' };
    }
    if (Object.keys(parsed).sort().join(',') !== 'snippets,version') {
      return { ok: false, error: 'Snippet file contains an unknown top-level field.' };
    }
    if (parsed.snippets.length > MAX_SNIPPETS) return { ok: false, error: 'Snippet file contains too many entries.' };
    const snippets: RegexSnippet[] = [];
    const ids = new Set<string>();
    for (const item of parsed.snippets) {
      if (!item || typeof item !== 'object') return { ok: false, error: 'Snippet entries must be objects.' };
      const candidate = item as Record<string, unknown>;
      const keys = Object.keys(candidate).sort();
      if (keys.join(',') !== 'flags,id,name,pattern') return { ok: false, error: 'Snippet entries contain an unknown field.' };
      if (typeof candidate.id !== 'string' || typeof candidate.name !== 'string' || typeof candidate.pattern !== 'string' || typeof candidate.flags !== 'string') {
        return { ok: false, error: 'Every snippet needs id, name, pattern, and flags strings.' };
      }
      if (!candidate.id || candidate.id.length > MAX_SNIPPET_ID_LENGTH || ids.has(candidate.id) || !candidate.name || candidate.name.length > MAX_SNIPPET_NAME_LENGTH || candidate.pattern.length > MAX_PATTERN_LENGTH || !/^[dgimsuvy]*$/.test(candidate.flags)) {
        return { ok: false, error: 'A snippet exceeds a bound or contains an unsupported flag.' };
      }
      if (hasMutuallyExclusiveUnicodeFlags(candidate.flags)) {
        return { ok: false, error: 'A snippet cannot combine the u and v flags.' };
      }
      const compiled = compilePattern(candidate.pattern, candidate.flags);
      if (compiled.error) return { ok: false, error: 'A snippet contains a pattern the engine rejected.' };
      ids.add(candidate.id);
      snippets.push({ id: candidate.id, name: candidate.name, pattern: candidate.pattern, flags: candidate.flags });
    }
    return { ok: true, snippets };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export interface RegexProfile {
  elapsedMs: number;
  tokenCount: number;
  matchCount: number;
  sampleLength: number;
  sampleTruncated: boolean;
  status: 'ready' | 'refused' | 'exhausted';
  reason: string | null;
}

export function profilePattern(regex: RegExp | null, sample: string, source = ''): RegexProfile {
  const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const run = regex ? runSample(regex, sample) : null;
  const risk = !regex && source ? classifyPatternRisk(source) : null;
  const matchCount = Math.min(run?.matches.length ?? 0, MAX_SAMPLE_MATCHES);
  const ended = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return {
    elapsedMs: Math.max(0, Math.round((ended - started) * 100) / 100),
    tokenCount: regex ? tokenizePattern(regex.source).length : 0,
    matchCount,
    sampleLength: Math.min(sample.length, 10_000),
    sampleTruncated: Boolean(run?.sampleTruncated),
    status: run?.refused || risk?.highRisk ? 'refused' : run?.timedOut || run?.truncated ? 'exhausted' : 'ready',
    reason: run?.refusalReason ?? risk?.reason ?? null,
  };
}

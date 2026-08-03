// Raw pattern -> guided parts.
//
// This is the half of the two-way binding that keeps the raw editor and the
// guided list honest with each other. It is deliberately conservative: it
// recognises exactly the shapes `renderParts` can emit plus the plainest
// hand-written equivalents, and it REFUSES anything else instead of producing
// an approximation.
//
// Refusing matters. A parser that mapped `(?=foo)` onto a capturing group, or
// `\n` onto the two characters `\` and `n`, would round-trip the user's
// pattern into a different pattern the moment they touched any control. The
// caller surfaces the refusal ("this pattern is beyond the guided parts, it is
// kept exactly as typed") rather than silently discarding what was written.

import {
  MAX_PATTERN_LENGTH,
  isLiteralSpecial,
  nextPartId,
  once,
  unescapeClassBody,
  type CharClassPreset,
  type Quantifier,
  type RegexPart,
} from './pattern';

export type ParseFailure =
  | { kind: 'tooLong'; limit: number }
  | { kind: 'unsupported'; at: number; token: string };

export type ParseResult =
  | { ok: true; parts: RegexPart[] }
  | { ok: false; failure: ParseFailure };

const ESCAPE_PRESET: Record<string, CharClassPreset | undefined> = {
  d: 'digit',
  D: 'notDigit',
  w: 'word',
  W: 'notWord',
  s: 'whitespace',
  S: 'notWhitespace',
};

const BRACE_QUANTIFIER = /^\{(\d+)(?:,(\d*))?\}/;
const NAMED_GROUP_HEAD = /^\?<([A-Za-z_$][\w$]*)>/;

interface QuantifierRead {
  quantifier: Quantifier;
  next: number;
}

/** Read a quantifier at `i`, or return null when there is none there. */
export function readQuantifier(source: string, i: number): QuantifierRead | null {
  const ch = source.charAt(i);
  let quantifier: Quantifier | null = null;
  let next = i;

  if (ch === '?') {
    quantifier = { kind: 'optional', min: 0, max: 1, lazy: false };
    next = i + 1;
  } else if (ch === '*') {
    quantifier = { kind: 'star', min: 0, max: 0, lazy: false };
    next = i + 1;
  } else if (ch === '+') {
    quantifier = { kind: 'plus', min: 1, max: 0, lazy: false };
    next = i + 1;
  } else if (ch === '{') {
    const match = BRACE_QUANTIFIER.exec(source.slice(i));
    if (!match) return null;
    const min = Number(match[1] ?? '0');
    const upper = match[2];
    if (upper === undefined) quantifier = { kind: 'exactly', min, max: min, lazy: false };
    else if (upper === '') quantifier = { kind: 'atLeast', min, max: min, lazy: false };
    else quantifier = { kind: 'between', min, max: Number(upper), lazy: false };
    next = i + match[0].length;
  }

  if (!quantifier) return null;
  if (source.charAt(next) === '?') {
    quantifier = { ...quantifier, lazy: true };
    next += 1;
  }
  return { quantifier, next };
}

/** Index of the `]` closing the class that opens at `start`, or -1. */
export function findClassEnd(source: string, start: number): number {
  for (let i = start + 1; i < source.length; i += 1) {
    const ch = source.charAt(i);
    if (ch === '\\') {
      i += 1;
      continue;
    }
    if (ch === ']') return i;
  }
  return -1;
}

/** Index of the `)` closing the group that opens at `start`, or -1. */
export function findGroupEnd(source: string, start: number): number {
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    const ch = source.charAt(i);
    if (ch === '\\') {
      i += 1;
      continue;
    }
    if (ch === '[') {
      const end = findClassEnd(source, i);
      if (end < 0) return -1;
      i = end;
      continue;
    }
    if (ch === '(') {
      depth += 1;
      continue;
    }
    if (ch === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Undo literal escaping for a run that is *entirely* literal text.
 *
 * Returns null the moment it meets a metacharacter that is not escaped, or an
 * escape that means something other than "this character" (`\d`, `\n`, `\1`).
 */
export function unescapeLiteralRun(source: string): string | null {
  let out = '';
  for (let i = 0; i < source.length; i += 1) {
    const ch = source.charAt(i);
    if (ch === '\\') {
      const next = source.charAt(i + 1);
      if (!next || !isLiteralSpecial(next)) return null;
      out += next;
      i += 1;
      continue;
    }
    if (isLiteralSpecial(ch)) return null;
    out += ch;
  }
  return out;
}

/** Split on `|` at the top level, stepping over classes and nested groups. */
export function splitTopLevel(body: string): string[] | null {
  const out: string[] = [];
  let current = '';
  for (let i = 0; i < body.length; i += 1) {
    const ch = body.charAt(i);
    if (ch === '\\') {
      current += ch + body.charAt(i + 1);
      i += 1;
      continue;
    }
    if (ch === '[') {
      const end = findClassEnd(body, i);
      if (end < 0) return null;
      current += body.slice(i, end + 1);
      i = end;
      continue;
    }
    if (ch === '(') {
      const end = findGroupEnd(body, i);
      if (end < 0) return null;
      current += body.slice(i, end + 1);
      i = end;
      continue;
    }
    if (ch === '|') {
      out.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out;
}

/** `cat|dog|bird` -> ['cat','dog','bird']; null when any branch is not plain text. */
function literalAlternatives(body: string): string[] | null {
  const pieces = splitTopLevel(body);
  if (!pieces || pieces.length < 2) return null;
  const out: string[] = [];
  for (const piece of pieces) {
    const literal = unescapeLiteralRun(piece);
    if (literal === null || literal === '') return null;
    out.push(literal);
  }
  return out;
}

function literalPart(value: string, quantifier: Quantifier): RegexPart {
  return { id: nextPartId(), kind: 'literal', value, quantifier };
}

export function parsePattern(source: string): ParseResult {
  if (source.length > MAX_PATTERN_LENGTH) {
    return { ok: false, failure: { kind: 'tooLong', limit: MAX_PATTERN_LENGTH } };
  }

  const parts: RegexPart[] = [];
  let pending = '';

  const flush = () => {
    if (!pending) return;
    parts.push(literalPart(pending, once()));
    pending = '';
  };
  const fail = (at: number, token: string): ParseResult => ({
    ok: false,
    failure: { kind: 'unsupported', at, token },
  });

  let i = 0;
  while (i < source.length) {
    const ch = source.charAt(i);

    // Every atom below consumes its own trailing quantifier, so a quantifier
    // reaching this point has nothing to bind to. Top-level `|` and a stray
    // `)` are equally unrepresentable: the parts list is a sequence, not a
    // tree, and pretending otherwise would change the pattern's meaning.
    if (ch === '*' || ch === '+' || ch === '?' || ch === '|' || ch === ')') {
      return fail(i, ch);
    }

    if (ch === '^' || ch === '$') {
      flush();
      parts.push({ id: nextPartId(), kind: 'anchor', anchor: ch === '^' ? 'start' : 'end' });
      i += 1;
      if (readQuantifier(source, i)) return fail(i, source.charAt(i));
      continue;
    }

    if (ch === '\\') {
      const next = source.charAt(i + 1);

      if (next === 'b' || next === 'B') {
        flush();
        parts.push({
          id: nextPartId(),
          kind: 'anchor',
          anchor: next === 'b' ? 'wordBoundary' : 'notWordBoundary',
        });
        i += 2;
        if (readQuantifier(source, i)) return fail(i, source.charAt(i));
        continue;
      }

      const preset = ESCAPE_PRESET[next];
      if (preset) {
        flush();
        const read = readQuantifier(source, i + 2);
        parts.push({
          id: nextPartId(),
          kind: 'charClass',
          preset,
          custom: '',
          negated: false,
          quantifier: read ? read.quantifier : once(),
        });
        i = read ? read.next : i + 2;
        continue;
      }

      // `\.` and friends are just the character. Anything else — `\n`, `\1`,
      // `\p{L}`, `\k<name>` — is real regex with no part to hold it.
      if (!next || !isLiteralSpecial(next)) return fail(i, `\\${next}`);
      const read = readQuantifier(source, i + 2);
      if (read) {
        flush();
        parts.push(literalPart(next, read.quantifier));
        i = read.next;
      } else {
        pending += next;
        i += 2;
      }
      continue;
    }

    if (ch === '.') {
      flush();
      const read = readQuantifier(source, i + 1);
      parts.push({
        id: nextPartId(),
        kind: 'charClass',
        preset: 'any',
        custom: '',
        negated: false,
        quantifier: read ? read.quantifier : once(),
      });
      i = read ? read.next : i + 1;
      continue;
    }

    if (ch === '[') {
      const end = findClassEnd(source, i);
      if (end < 0) return fail(i, '[');
      flush();
      let body = source.slice(i + 1, end);
      let negated = false;
      if (body.startsWith('^')) {
        negated = true;
        body = body.slice(1);
      }
      const read = readQuantifier(source, end + 1);
      parts.push({
        id: nextPartId(),
        kind: 'charClass',
        preset: 'custom',
        custom: unescapeClassBody(body),
        negated,
        quantifier: read ? read.quantifier : once(),
      });
      i = read ? read.next : end + 1;
      continue;
    }

    if (ch === '(') {
      const end = findGroupEnd(source, i);
      if (end < 0) return fail(i, '(');
      const inner = source.slice(i + 1, end);
      flush();
      const read = readQuantifier(source, end + 1);
      const quantifier = read ? read.quantifier : once();

      if (inner.startsWith('?:')) {
        const body = inner.slice(2);
        const alternatives = literalAlternatives(body);
        if (alternatives) {
          parts.push({ id: nextPartId(), kind: 'alternation', options: alternatives, quantifier });
        } else {
          parts.push({
            id: nextPartId(),
            kind: 'group',
            groupKind: 'nonCapturing',
            name: '',
            body,
            quantifier,
          });
        }
      } else {
        const named = NAMED_GROUP_HEAD.exec(inner);
        if (named) {
          parts.push({
            id: nextPartId(),
            kind: 'group',
            groupKind: 'named',
            name: named[1] ?? '',
            body: inner.slice(named[0].length),
            quantifier,
          });
        } else if (inner.startsWith('?')) {
          // Lookahead, lookbehind, modifier groups. Real regex, no part for it.
          return fail(i, source.slice(i, Math.min(i + 4, source.length)));
        } else {
          parts.push({
            id: nextPartId(),
            kind: 'group',
            groupKind: 'capturing',
            name: '',
            body: inner,
            quantifier,
          });
        }
      }
      i = read ? read.next : end + 1;
      continue;
    }

    if (ch === '{' || ch === '}' || ch === ']') return fail(i, ch);

    // An ordinary character. A quantifier straight after it binds to this one
    // character, so the run in progress is closed off first.
    const read = readQuantifier(source, i + 1);
    if (read) {
      flush();
      parts.push(literalPart(ch, read.quantifier));
      i = read.next;
    } else {
      pending += ch;
      i += 1;
    }
  }

  flush();
  return { ok: true, parts };
}

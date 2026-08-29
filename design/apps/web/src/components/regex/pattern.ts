// The regex model shared by the builder UI and every search bar wired to it.
//
// ONE ENGINE, NAMED IN THE INTERFACE. Patterns are compiled with
// `new RegExp(source, flags)` and matched with that same object, so the
// preview inside the builder and the filtering a search bar performs are the
// same evaluation. There is no second dialect, no server round-trip, and no
// translation step between what is typed and what runs — a builder that
// implied PCRE while the search ran JavaScript would be worse than no builder,
// so `REGEX_ENGINE_LABEL` is rendered wherever a pattern is edited.

export const REGEX_ENGINE_LABEL = 'JavaScript RegExp';

// Caps. These are the first half of the safety story (the second half lives in
// `evaluate.ts`): a pattern the engine cannot even be handed is a pattern that
// cannot hang the interface.
export const MAX_PATTERN_LENGTH = 512;
export const MAX_SAMPLE_LENGTH = 10_000;
/** Upper bound on `{n}` / `{n,m}` counts, so `a{1,900000}` never reaches the engine. */
export const MAX_QUANTIFIER_COUNT = 1_000;

/* -------------------------------------------------------------------------- */
/* Quantifiers                                                                 */
/* -------------------------------------------------------------------------- */

export type QuantifierKind =
  | 'one'
  | 'optional'
  | 'star'
  | 'plus'
  | 'exactly'
  | 'atLeast'
  | 'between';

export interface Quantifier {
  kind: QuantifierKind;
  /** Read by `exactly`, `atLeast` and `between`. */
  min: number;
  /** Read by `between` only. */
  max: number;
  /** `+?` rather than `+` — match as few characters as the pattern allows. */
  lazy: boolean;
}

export const QUANTIFIER_KINDS: readonly QuantifierKind[] = [
  'one',
  'optional',
  'star',
  'plus',
  'exactly',
  'atLeast',
  'between',
];

/** A fresh "exactly once" quantifier. A factory, not a shared constant, so a
 *  part edited in place can never mutate another part's quantifier. */
export function once(): Quantifier {
  return { kind: 'one', min: 1, max: 1, lazy: false };
}

/** True when the kind reads `min`, so the UI knows whether to show the field. */
export function quantifierUsesMin(kind: QuantifierKind): boolean {
  return kind === 'exactly' || kind === 'atLeast' || kind === 'between';
}

/** True when the kind reads `max`. */
export function quantifierUsesMax(kind: QuantifierKind): boolean {
  return kind === 'between';
}

/** True when the kind can be made lazy — `{n}` already matches an exact count. */
export function quantifierSupportsLazy(kind: QuantifierKind): boolean {
  return kind !== 'one' && kind !== 'exactly';
}

function clampCount(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(Math.trunc(value), 0), MAX_QUANTIFIER_COUNT);
}

function quantifierCore(quantifier: Quantifier): string {
  if (quantifier.kind === 'optional') return '?';
  if (quantifier.kind === 'star') return '*';
  if (quantifier.kind === 'plus') return '+';
  if (quantifier.kind === 'exactly') return `{${clampCount(quantifier.min)}}`;
  if (quantifier.kind === 'atLeast') return `{${clampCount(quantifier.min)},}`;
  if (quantifier.kind === 'between') {
    const min = clampCount(quantifier.min);
    const max = Math.max(min, clampCount(quantifier.max));
    return `{${min},${max}}`;
  }
  return '';
}

export function renderQuantifier(quantifier: Quantifier): string {
  const core = quantifierCore(quantifier);
  if (!core) return '';
  return quantifier.lazy && quantifierSupportsLazy(quantifier.kind) ? `${core}?` : core;
}

/* -------------------------------------------------------------------------- */
/* Character classes and anchors                                               */
/* -------------------------------------------------------------------------- */

export type CharClassPreset =
  | 'digit'
  | 'notDigit'
  | 'word'
  | 'notWord'
  | 'whitespace'
  | 'notWhitespace'
  | 'any'
  | 'custom';

export const CHAR_CLASS_PRESETS: readonly CharClassPreset[] = [
  'digit',
  'notDigit',
  'word',
  'notWord',
  'whitespace',
  'notWhitespace',
  'any',
  'custom',
];

const PRESET_SOURCE: Record<Exclude<CharClassPreset, 'custom'>, string> = {
  digit: '\\d',
  notDigit: '\\D',
  word: '\\w',
  notWord: '\\W',
  whitespace: '\\s',
  notWhitespace: '\\S',
  any: '.',
};

/** The regex source a preset compiles to, for the "this is what it emits" hint. */
export function charClassPresetSource(preset: Exclude<CharClassPreset, 'custom'>): string {
  return PRESET_SOURCE[preset];
}

export type AnchorKind = 'start' | 'end' | 'wordBoundary' | 'notWordBoundary';

export const ANCHOR_KINDS: readonly AnchorKind[] = [
  'start',
  'end',
  'wordBoundary',
  'notWordBoundary',
];

const ANCHOR_SOURCE: Record<AnchorKind, string> = {
  start: '^',
  end: '$',
  wordBoundary: '\\b',
  notWordBoundary: '\\B',
};

export function anchorSource(anchor: AnchorKind): string {
  return ANCHOR_SOURCE[anchor];
}

export type GroupKind = 'capturing' | 'nonCapturing' | 'named';

export const GROUP_KINDS: readonly GroupKind[] = ['capturing', 'nonCapturing', 'named'];

/* -------------------------------------------------------------------------- */
/* Parts                                                                       */
/* -------------------------------------------------------------------------- */

export interface LiteralPart {
  id: string;
  kind: 'literal';
  /** Plain text as the user typed it — escaping happens at render time. */
  value: string;
  quantifier: Quantifier;
}

export interface CharClassPart {
  id: string;
  kind: 'charClass';
  preset: CharClassPreset;
  /** Class *contents* when `preset === 'custom'`, e.g. `a-z0-9_`. */
  custom: string;
  negated: boolean;
  quantifier: Quantifier;
}

export interface AnchorPart {
  id: string;
  kind: 'anchor';
  anchor: AnchorKind;
}

export interface GroupPart {
  id: string;
  kind: 'group';
  groupKind: GroupKind;
  /** Only meaningful for `named`. */
  name: string;
  /** Raw regex source for the group body — the user is editing regex here. */
  body: string;
  quantifier: Quantifier;
}

export interface AlternationPart {
  id: string;
  kind: 'alternation';
  /** Each option is plain text and is escaped at render time. */
  options: string[];
  quantifier: Quantifier;
}

export type RegexPart =
  | LiteralPart
  | CharClassPart
  | AnchorPart
  | GroupPart
  | AlternationPart;

export type RegexPartKind = RegexPart['kind'];

let partIdCounter = 0;

export function nextPartId(): string {
  partIdCounter += 1;
  return `rx-${partIdCounter}`;
}

/* -------------------------------------------------------------------------- */
/* Escaping                                                                    */
/* -------------------------------------------------------------------------- */

const LITERAL_SPECIAL = /[.*+?^${}()|[\]\\]/g;
const LITERAL_SPECIAL_CHARS = '.*+?^${}()|[]\\';

/** True for a character that changes meaning unless it is escaped. */
export function isLiteralSpecial(ch: string): boolean {
  return ch.length === 1 && LITERAL_SPECIAL_CHARS.includes(ch);
}

/** Turn plain text into regex source that matches exactly that text. */
export function escapeLiteral(value: string): string {
  return value.replace(LITERAL_SPECIAL, '\\$&');
}

/**
 * Escape the *contents* of a character class.
 *
 * The custom-class field is deliberately class source rather than plain text,
 * so `a-z0-9_` stays a range set instead of becoming three literal characters.
 * Only the two characters that would silently change the class are handled: a
 * `]` would end it early, and a leading `^` would negate it behind the user's
 * back. Everything else — including a stray backslash — is left alone and
 * surfaces as a real engine error rather than being quietly rewritten.
 */
export function escapeClassBody(body: string): string {
  let out = '';
  for (let i = 0; i < body.length; i += 1) {
    const ch = body.charAt(i);
    if (ch === '\\') {
      out += ch + body.charAt(i + 1);
      i += 1;
      continue;
    }
    if (ch === ']') {
      out += '\\]';
      continue;
    }
    if (ch === '^' && out.length === 0) {
      out += '\\^';
      continue;
    }
    out += ch;
  }
  return out;
}

/** Inverse of `escapeClassBody`, so a parsed class round-trips unchanged. */
export function unescapeClassBody(body: string): string {
  let out = '';
  for (let i = 0; i < body.length; i += 1) {
    const ch = body.charAt(i);
    if (ch !== '\\') {
      out += ch;
      continue;
    }
    const next = body.charAt(i + 1);
    if (next === ']' || (next === '^' && out.length === 0)) {
      out += next;
      i += 1;
      continue;
    }
    out += ch + next;
    i += 1;
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Rendering parts to a pattern                                                */
/* -------------------------------------------------------------------------- */

export function renderPart(part: RegexPart): string {
  if (part.kind === 'literal') {
    if (!part.value) return '';
    const escaped = escapeLiteral(part.value);
    const quantifier = renderQuantifier(part.quantifier);
    if (!quantifier) return escaped;
    // A quantifier binds to one atom. Without the wrapper `ab+` would mean
    // "a, then one-or-more b", which is not what "repeat ab" says on screen.
    return part.value.length > 1 ? `(?:${escaped})${quantifier}` : `${escaped}${quantifier}`;
  }
  if (part.kind === 'charClass') {
    if (part.preset === 'custom') {
      if (!part.custom) return '';
      const body = escapeClassBody(part.custom);
      return `[${part.negated ? '^' : ''}${body}]${renderQuantifier(part.quantifier)}`;
    }
    return `${PRESET_SOURCE[part.preset]}${renderQuantifier(part.quantifier)}`;
  }
  if (part.kind === 'anchor') {
    return ANCHOR_SOURCE[part.anchor];
  }
  if (part.kind === 'group') {
    const head =
      part.groupKind === 'nonCapturing'
        ? '(?:'
        : part.groupKind === 'named'
          ? `(?<${part.name}>`
          : '(';
    return `${head}${part.body})${renderQuantifier(part.quantifier)}`;
  }
  const options = part.options.filter((option) => option.length > 0);
  if (options.length === 0) return '';
  return `(?:${options.map(escapeLiteral).join('|')})${renderQuantifier(part.quantifier)}`;
}

export function renderParts(parts: readonly RegexPart[]): string {
  return parts.map(renderPart).join('');
}

/* -------------------------------------------------------------------------- */
/* Flags                                                                       */
/* -------------------------------------------------------------------------- */

// Keep the complete ECMAScript flag surface visible. The runtime feature
// probe below lets a pinned Chromium build mark a newly introduced flag as
// unavailable instead of hiding it or pretending it compiles.
export const REGEX_FLAGS = ['d', 'g', 'i', 'm', 's', 'u', 'v', 'y'] as const;
export type RegexFlag = (typeof REGEX_FLAGS)[number];

export function supportsRegexFlag(flag: RegexFlag): boolean {
  try {
    // The empty pattern isolates flag support from pattern syntax support.
    new RegExp('', flag);
    return true;
  } catch {
    return false;
  }
}

// Case-insensitive is the default because plain-text search — the mode every
// field starts in — is case-insensitive. Turning regex on should not silently
// change whether `Foo` finds `foo`.
// Global matching keeps the preview, capture table, and replacement workbench
// useful on a whole sample from the first keystroke. Ignore-case remains the
// friendly baseline, while every flag is still individually toggleable.
export const DEFAULT_FLAGS = 'gi';

export function hasFlag(flags: string, flag: RegexFlag): boolean {
  return flags.includes(flag);
}

/** ECMAScript permits either Unicode mode, never both at once. */
export function hasMutuallyExclusiveUnicodeFlags(flags: string): boolean {
  return flags.includes('u') && flags.includes('v');
}

/** Toggle one flag, returning the canonical (source-order) flag string. */
export function toggleFlag(flags: string, flag: RegexFlag): string {
  const active = new Set(flags.split(''));
  if (active.has(flag)) active.delete(flag);
  else {
    // `u` and `v` are mutually exclusive in ECMAScript. Selecting one in the
    // UI replaces the other, so a user can never create an invalid state by
    // clicking the two controls in either order.
    if (flag === 'u') active.delete('v');
    if (flag === 'v') active.delete('u');
    active.add(flag);
  }
  return REGEX_FLAGS.filter((candidate) => active.has(candidate)).join('');
}

/* -------------------------------------------------------------------------- */
/* Compiling and quoting                                                       */
/* -------------------------------------------------------------------------- */

export type PatternError =
  | { kind: 'tooLong'; limit: number; length: number }
  | { kind: 'unsafe'; reason: string }
  | { kind: 'syntax'; message: string };

export interface PatternRisk {
  highRisk: boolean;
  reason: string | null;
}

/*
 * JavaScript RegExp has no cancellation point inside one exec() call. The
 * renderer therefore refuses the small family of ambiguous, nested patterns
 * that can consume unbounded backtracking before it ever constructs a RegExp.
 * This is deliberately conservative. A rejected pattern stays visible in the
 * editor and the last safe pattern remains the active search predicate.
 */
const QUANTIFIED_BACKREFERENCE = /\\(?:\d+|k<[^>]+>)[+*{]/;

export function classifyPatternRisk(source: string): PatternRisk {
  const frames: Array<{ hasQuantifier: boolean; hasAlternation: boolean }> = [];
  let inClass = false;
  let escaped = false;
  const quantifierEnd = (at: number): number => {
    const ch = source[at];
    if (ch === '*' || ch === '+' || ch === '?') return at + 1;
    if (ch !== '{') return at;
    const close = source.indexOf('}', at + 1);
    if (close < 0 || !/^\{(?:\d+|\d*,\d*)\}/.test(source.slice(at, close + 1))) return at;
    return close + 1;
  };
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '[') { inClass = true; continue; }
    if (ch === ']' && inClass) { inClass = false; continue; }
    if (inClass) continue;
    if (ch === '(') {
      frames.push({ hasQuantifier: false, hasAlternation: false });
      continue;
    }
    if (ch === '|') {
      for (const frame of frames) frame.hasAlternation = true;
      continue;
    }
    if (ch === ')') {
      const frame = frames.pop();
      const end = quantifierEnd(i + 1);
      if (frame && end > i + 1 && (frame.hasQuantifier || frame.hasAlternation)) {
        return {
          highRisk: true,
          reason: frame.hasQuantifier
            ? 'Nested quantifiers can trigger unbounded backtracking in this synchronous engine.'
            : 'A quantified alternation can trigger unbounded backtracking in this synchronous engine.',
        };
      }
      continue;
    }
    if (ch === '?' && source[i - 1] === '(') continue;
    const end = quantifierEnd(i);
    if (end > i) {
      for (const frame of frames) frame.hasQuantifier = true;
      i = end - 1;
    }
  }
  if (QUANTIFIED_BACKREFERENCE.test(source)) {
    return {
      highRisk: true,
      reason: 'A quantified backreference can trigger unbounded backtracking in this synchronous engine.',
    };
  }
  return { highRisk: false, reason: null };
}

export interface CompileResult {
  regex: RegExp | null;
  error: PatternError | null;
}

export function compilePattern(source: string, flags: string): CompileResult {
  if (source.length > MAX_PATTERN_LENGTH) {
    return {
      regex: null,
      error: { kind: 'tooLong', limit: MAX_PATTERN_LENGTH, length: source.length },
    };
  }
  if (hasMutuallyExclusiveUnicodeFlags(flags)) {
    return {
      regex: null,
      error: { kind: 'syntax', message: 'The u and v flags are mutually exclusive in ECMAScript.' },
    };
  }
  const risk = classifyPatternRisk(source);
  if (risk.highRisk) {
    return { regex: null, error: { kind: 'unsafe', reason: risk.reason ?? 'Pattern refused as high risk.' } };
  }
  try {
    return { regex: new RegExp(source, flags), error: null };
  } catch (err) {
    // The engine's own message, verbatim. A paraphrase would send the user
    // looking for a problem the engine did not report.
    return {
      regex: null,
      error: { kind: 'syntax', message: err instanceof Error ? err.message : String(err) },
    };
  }
}

/**
 * The name of each capture group, in the order the engine numbers them.
 *
 * `RegExpExecArray` reports named groups in a bag and positional ones in the
 * array, with nothing tying the two together. Reading the names back off the
 * source is the only way to label column 2 correctly — matching a named group
 * to a position by comparing captured *values* gets it wrong the moment two
 * groups capture the same text.
 */
export function captureGroupNames(source: string): (string | undefined)[] {
  const names: (string | undefined)[] = [];
  let inClass = false;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source.charAt(i);
    if (ch === '\\') {
      i += 1;
      continue;
    }
    if (inClass) {
      if (ch === ']') inClass = false;
      continue;
    }
    if (ch === '[') {
      inClass = true;
      continue;
    }
    if (ch !== '(') continue;
    if (source.charAt(i + 1) !== '?') {
      names.push(undefined);
      continue;
    }
    const named = /^\(\?<([A-Za-z_$][\w$]*)>/.exec(source.slice(i));
    if (named) names.push(named[1]);
    // `(?:`, `(?=`, `(?!`, `(?<=`, `(?<!` and modifier groups capture nothing.
  }
  return names;
}

/**
 * The ready-to-paste form: `/source/flags`.
 *
 * Only unescaped forward slashes outside a character class need escaping —
 * inside `[...]` a `/` is already just a character. `\/` stays legal under the
 * `u` flag, so the result pastes into any JavaScript file unchanged.
 */
export function toRegexLiteral(source: string, flags: string): string {
  if (!source) return `/(?:)/${flags}`;
  let out = '';
  let inClass = false;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source.charAt(i);
    if (ch === '\\') {
      out += ch + source.charAt(i + 1);
      i += 1;
      continue;
    }
    if (ch === '[') inClass = true;
    else if (ch === ']') inClass = false;
    else if (ch === '/' && !inClass) {
      out += '\\/';
      continue;
    }
    out += ch;
  }
  return `/${out}/${flags}`;
}

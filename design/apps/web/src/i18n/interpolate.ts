// The pure half of the translator: how a template's `{placeholders}` are
// filled, and how two languages are joined into one bilingual string.
//
// It lives beside `index.tsx` rather than inside it so a plain helper module
// can import `tv()` without pulling in the React provider — and so the
// composition rules can be tested as the pure functions they are. `index.tsx`
// re-exports everything here, so `../i18n` stays the single import site for
// components.

import type { Dict } from './types';

type DictKey = keyof Dict;

const BILINGUAL_SEPARATOR = ' · ';

/**
 * The separator a bilingual render joins its two halves with, or `null` to
 * decline the composition entirely.
 *
 * Composition is skipped for three cases that would produce noise rather
 * than a translation: an empty side, two sides that already say the same
 * thing (untranslated keys, brand names, `Integrity`), and values whose
 * entire lexical content is one or two characters or carries no letters at
 * all — `{n}m`, `⤢`, `·`. Those are units, glyphs and separators, and
 * doubling them makes a timestamp chip unreadable for no gain.
 *
 * The structural guards — the length and letter tests — read the two
 * TEMPLATES, before any interpolation, because that is what they are about:
 * `{n}m` is a unit whether `n` is `5` or `1234`, and deciding from the
 * rendered text would make the same chip compose or not depending on the
 * number it happened to be showing. The emptiness and sameness guards read
 * the RENDERED halves, because that is where those questions are actually
 * answerable: two identical templates can still carry a variable that
 * differs per language, and that pair does deserve both halves.
 */
export function bilingualJoiner(
  primaryTemplate: string,
  secondaryTemplate: string,
  primaryText: string = primaryTemplate,
  secondaryText: string = secondaryTemplate,
): string | null {
  const first = primaryText.trim();
  const second = secondaryText.trim();
  if (!first || !second) return null;
  if (first === second) return null;
  const core = primaryTemplate.replace(/\{\w+\}/g, '').trim();
  if (core.length <= 2) return null;
  if (!/\p{L}/u.test(core)) return null;
  return primaryTemplate.includes('\n') || secondaryTemplate.includes('\n')
    ? '\n'
    : BILINGUAL_SEPARATOR;
}

/**
 * Join a primary and secondary rendering of the same key, or decline to.
 *
 * The uninterpolated form of the pairing, for callers that already hold two
 * finished strings. `t()` goes through `bilingualJoiner` directly instead, so
 * it can interpolate each half in its own language before joining.
 */
export function composeBilingual(primary: string, secondary: string): string {
  const joiner = bilingualJoiner(primary, secondary);
  return joiner === null ? primary : `${primary}${joiner}${secondary}`;
}

const PLACEHOLDER_PATTERN = /\{\w+\}/g;
const NUMBER_PATTERN = /\d+(?:[.,]\d+)*/g;

function tokensOf(value: string, pattern: RegExp): string[] {
  return Array.from(value.matchAll(pattern), (match) => match[0]).sort();
}

/**
 * True when a funny-level override still states everything the neutral base
 * stated. This is the mechanism behind "voice only, never facts": an
 * override that drops a `{placeholder}` or loses a number the base carried
 * — a version, a count, a percentage, a file count — is discarded and the
 * base string renders instead. A joke that costs the reader a fact is a bug,
 * and this makes it a silent no-op rather than a shipped one.
 */
export function keepsTheFacts(base: string, candidate: string): boolean {
  if (
    tokensOf(base, PLACEHOLDER_PATTERN).join(' ') !==
    tokensOf(candidate, PLACEHOLDER_PATTERN).join(' ')
  ) {
    return false;
  }
  for (const number of tokensOf(base, NUMBER_PATTERN)) {
    if (!candidate.includes(number)) return false;
  }
  return true;
}

/**
 * A variable whose value is itself translated copy, handed to `t()` as the
 * KEY it should be read from rather than as an already-rendered string.
 *
 * This is the whole fix for the bilingual doubling bug. `t()` used to compose
 * the two languages and then interpolate the composed template, so a variable
 * that had already been through `t()` arrived bilingual and was substituted
 * into both halves: `t('statusBar.density', { level: t('…densityDefault') })`
 * rendered `Default · 預設 density · Default · 預設密度` — "Default density",
 * said twice, in a 28px strip. Passing the key instead lets `t()` read the
 * value in the same language as the half it is filling, so the English
 * template gets `Default` and the 廣東話 template gets `預設`.
 *
 * Composing two `tForLanguageTag()` calls would have produced the same shape
 * and quietly dropped the funny-level sliders, which are applied inside `t()`
 * and nowhere else. Resolving the marker through the same per-language read
 * that renders the outer template keeps both sliders working on the nested
 * value as well.
 */
export interface TranslatedVar {
  readonly __odTranslatedVar: true;
  readonly key: DictKey;
  readonly vars?: TranslationVars;
  /**
   * Applied to the value AFTER it is read, once per language. This is where
   * a caller that used to write `t('common.preview').toLowerCase()` puts the
   * `toLowerCase`, so the case change lands on the English value alone
   * instead of on an already-composed bilingual string.
   */
  readonly transform?: (value: string) => string;
}

/** The values `t()` accepts for interpolation. */
export type TranslationVars = Record<string, string | number | TranslatedVar>;

/** Translator signature, shared by `t`, `tForLanguageTag`, and the fallback. */
export type Translate = (key: DictKey, vars?: TranslationVars) => string;

/**
 * Mark an interpolation variable as translated copy rather than literal text.
 *
 * Use it anywhere a `t()` result was previously passed straight into another
 * `t()` call's variables:
 *
 * ```ts
 * -  t('statusBar.density', { level: t('statusBar.densityDefault') })
 * +  t('statusBar.density', { level: tv('statusBar.densityDefault') })
 * ```
 */
export function tv(
  key: DictKey,
  vars?: TranslationVars,
  transform?: (value: string) => string,
): TranslatedVar {
  return { __odTranslatedVar: true, key, vars, transform };
}

export function isTranslatedVar(value: unknown): value is TranslatedVar {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { __odTranslatedVar?: unknown }).__odTranslatedVar === true
  );
}

/**
 * Render one key in exactly one language: that language's template, filled
 * with each variable's value in that same language.
 *
 * `read` is the only thing that knows which language this is, so the nested
 * `TranslatedVar` recursion inherits it for free — and with it whichever
 * funny level the caller's `read` applies. An unknown or nullish variable
 * still renders its `{placeholder}` verbatim, exactly as before, so a missing
 * value stays visible rather than collapsing into an empty gap.
 */
export function renderInLanguage(
  read: (key: DictKey) => string,
  key: DictKey,
  vars?: TranslationVars,
): string {
  const template = read(key);
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = vars[name];
    if (value == null) return `{${name}}`;
    if (!isTranslatedVar(value)) return String(value);
    const rendered = renderInLanguage(read, value.key, value.vars);
    return value.transform ? value.transform(rendered) : rendered;
  });
}

/**
 * A bilingual render of one key: each language's template filled from its own
 * dictionary, then joined.
 *
 * The ordering is the whole point. Interpolating LAST, on the composed
 * template, is what produced the doubling bug — a variable that was itself
 * translated arrived bilingual and was substituted into both halves. Filling
 * each half first and joining afterwards puts the English value in the
 * English half and the 廣東話 value in the 廣東話 half.
 *
 * The two `read` functions carry whatever the caller's language, dictionary
 * and funny level are, so the sliders keep applying — to the nested values as
 * much as to the outer template — without this function knowing they exist.
 */
export function renderBilingual(
  readPrimary: (key: DictKey) => string,
  readSecondary: (key: DictKey) => string,
  key: DictKey,
  vars?: TranslationVars,
): string {
  const primaryText = renderInLanguage(readPrimary, key, vars);
  const secondaryText = renderInLanguage(readSecondary, key, vars);
  const joiner = bilingualJoiner(
    readPrimary(key),
    readSecondary(key),
    primaryText,
    secondaryText,
  );
  return joiner === null ? primaryText : `${primaryText}${joiner}${secondaryText}`;
}

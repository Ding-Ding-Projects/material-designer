export { RegexSearchField } from './RegexSearchField';
export type { RegexSearchFieldProps } from './RegexSearchField';
export { RegexBuilder } from './RegexBuilder';
export { useRegexSearch } from './useRegexSearch';
export type { RegexSearchController, RegexSearchMode } from './useRegexSearch';
export {
  DEFAULT_FLAGS,
  MAX_PATTERN_LENGTH,
  MAX_SAMPLE_LENGTH,
  REGEX_ENGINE_LABEL,
  REGEX_FLAGS,
  captureGroupNames,
  compilePattern,
  escapeLiteral,
  renderPart,
  renderParts,
  toRegexLiteral,
  toggleFlag,
} from './pattern';
export type {
  AnchorPart,
  AlternationPart,
  CharClassPart,
  GroupPart,
  LiteralPart,
  PatternError,
  Quantifier,
  RegexFlag,
  RegexPart,
  RegexPartKind,
} from './pattern';
export { parsePattern } from './parse';
export type { ParseFailure, ParseResult } from './parse';
export {
  MAX_HAYSTACK_LENGTH,
  MAX_SAMPLE_MATCHES,
  buildHighlightSegments,
  createBoundedMatcher,
  looksCatastrophic,
  runSample,
} from './evaluate';
export type { BoundedMatcher, HighlightSegment, SampleMatch, SampleRun } from './evaluate';
export {
  appendPart,
  createPart,
  movePart,
  removePartAt,
  replacePartAt,
} from './parts-ops';

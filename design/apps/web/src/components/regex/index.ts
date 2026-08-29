export { RegexSearchField } from './RegexSearchField';
export type { RegexSearchFieldProps } from './RegexSearchField';
export { RegexBuilder } from './RegexBuilder';
export { useRegexSearch } from './useRegexSearch';
export type { RegexEvaluationState, RegexSearchController, RegexSearchMode } from './useRegexSearch';
export {
  DEFAULT_FLAGS,
  MAX_PATTERN_LENGTH,
  MAX_SAMPLE_LENGTH,
  REGEX_ENGINE_LABEL,
  REGEX_FLAGS,
  captureGroupNames,
  classifyPatternRisk,
  compilePattern,
  escapeLiteral,
  hasMutuallyExclusiveUnicodeFlags,
  renderPart,
  renderParts,
  supportsRegexFlag,
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
  PatternRisk,
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
  advanceStringIndex,
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
export {
  MAX_REPLACEMENT_LENGTH,
  MAX_REPLACEMENT_OUTPUT,
  MAX_SNIPPET_ID_LENGTH,
  MAX_SNIPPET_BYTES,
  MAX_SNIPPET_NAME_LENGTH,
  MAX_SNIPPETS,
  REGEX_CAPABILITIES,
  explainPattern,
  getRegexEngineInfo,
  parseSnippets,
  previewReplacement,
  profilePattern,
  serializeSnippets,
  tokenizePattern,
} from './diagnostics';
export type {
  RegexCapability,
  RegexCapabilityStatus,
  RegexEngineInfo,
  RegexExplanation,
  RegexProfile,
  RegexSnippet,
  RegexToken,
  RegexTokenKind,
  ReplacementPreview,
} from './diagnostics';
export {
  EXPECTED_REGEX_SEARCH_SURFACE_IDS,
  REGEX_SEARCH_SURFACE_INVENTORY,
  validateRegexSearchSurfaceInventory,
} from './searchSurfaceInventory';
export type {
  SearchSurfaceInventoryRow,
  SearchSurfaceKind,
  SearchSurfaceStatus,
} from './searchSurfaceInventory';

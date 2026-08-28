// One controller per search field.
//
// The controller is deliberately created by the *host* component and handed to
// `RegexSearchField`, so every wired search bar owns its own mode, flags,
// guided parts and compiled pattern. There is no module-level state and no
// shared context: two fields on one screen cannot see each other, and a
// pattern built in one can never leak into the other.
//
// The field's text IS the pattern in regex mode. That is what keeps the raw
// editor, the guided parts and the search bar in step without a second source
// of truth to reconcile.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  DEFAULT_FLAGS,
  compilePattern,
  escapeLiteral,
  renderParts,
  toggleFlag as toggleFlagIn,
  type PatternError,
  type RegexFlag,
  type RegexPart,
} from './pattern';
import { parsePattern, type ParseFailure } from './parse';
import { createBoundedMatcher } from './evaluate';

export type RegexSearchMode = 'text' | 'regex';
export type RegexEvaluationState = 'ready' | 'exhausted' | 'refused';

export interface RegexSearchController {
  /** The field's current text: plain text, or the pattern in regex mode. */
  query: string;
  setQuery: (next: string) => void;
  mode: RegexSearchMode;
  setMode: (mode: RegexSearchMode) => void;
  flags: string;
  toggleFlag: (flag: RegexFlag) => void;
  parts: RegexPart[];
  /** Apply an edited parts list; re-renders the pattern into the field. */
  applyParts: (next: RegexPart[]) => void;
  /** Non-null when the typed pattern is beyond what the parts can represent. */
  syncFailure: ParseFailure | null;
  /** Throw away the hand-typed pattern and go back to the guided parts. */
  rebuildFromParts: () => void;
  /** Rewrite the field's text as a pattern matching that text literally. */
  escapeQueryAsLiteral: () => void;
  /** The engine's own complaint about the current pattern, or null. */
  error: PatternError | null;
  /** True when `regex` is the last pattern that compiled, not the typed one. */
  usingLastValid: boolean;
  /** What the search bar is actually matching with right now. */
  regex: RegExp | null;
  /** Row predicate. Never throws, and never hides rows on failure. */
  matches: (text: string) => boolean;
  /** Visible state for a refused or budget-exhausted local evaluation. */
  evaluationState: RegexEvaluationState;
  evaluationMessage: string | null;
  /** Scratch text the builder previews against. Lives here so closing and
   *  reopening the popover does not throw the user's sample away. */
  sample: string;
  setSample: (next: string) => void;
}

interface Compiled {
  regex: RegExp | null;
  error: PatternError | null;
  usingLastValid: boolean;
}

const MATCH_EVERYTHING = (): boolean => true;

export function useRegexSearch(
  query: string,
  onQueryChange: (next: string) => void,
): RegexSearchController {
  const [mode, setModeState] = useState<RegexSearchMode>('text');
  const [flags, setFlags] = useState<string>(DEFAULT_FLAGS);
  const [parts, setParts] = useState<RegexPart[]>([]);
  const [syncFailure, setSyncFailure] = useState<ParseFailure | null>(null);
  const [sample, setSample] = useState('');
  const [evaluationState, setEvaluationState] = useState<RegexEvaluationState>('ready');
  const [evaluationMessage, setEvaluationMessage] = useState<string | null>(null);

  // The pattern the parts list was last derived from or rendered to. Anything
  // else arriving in `query` came from somewhere the parts have not seen.
  const syncedPatternRef = useRef<string>('');

  const syncPartsFrom = useCallback((pattern: string) => {
    syncedPatternRef.current = pattern;
    const parsed = parsePattern(pattern);
    if (parsed.ok) {
      setParts(parsed.parts);
      setSyncFailure(null);
      return;
    }
    // The pattern is kept exactly as typed. Only the guided view steps back.
    setSyncFailure(parsed.failure);
  }, []);

  // Re-derive the parts whenever the pattern changed elsewhere: the user typing
  // in the field, a paste, or a host resetting the query.
  useEffect(() => {
    if (mode !== 'regex') return;
    if (query === syncedPatternRef.current) return;
    syncPartsFrom(query);
  }, [mode, query, syncPartsFrom]);

  const setMode = useCallback(
    (next: RegexSearchMode) => {
      setModeState(next);
      // Switching on reads whatever is already in the field as a pattern. It is
      // never silently rewritten — `escapeQueryAsLiteral` is the explicit way
      // to say "I meant that as text".
      if (next === 'regex') syncPartsFrom(query);
    },
    [query, syncPartsFrom],
  );

  const applyParts = useCallback(
    (next: RegexPart[]) => {
      setParts(next);
      setSyncFailure(null);
      const rendered = renderParts(next);
      syncedPatternRef.current = rendered;
      onQueryChange(rendered);
    },
    [onQueryChange],
  );

  const rebuildFromParts = useCallback(() => {
    applyParts(parts);
  }, [applyParts, parts]);

  const escapeQueryAsLiteral = useCallback(() => {
    const next = escapeLiteral(query);
    syncPartsFrom(next);
    onQueryChange(next);
  }, [onQueryChange, query, syncPartsFrom]);

  const toggleFlagFor = useCallback((flag: RegexFlag) => {
    setFlags((current) => toggleFlagIn(current, flag));
  }, []);

  // The last pattern that compiled. An invalid pattern is a state the user is
  // passing through on the way to a valid one; wiping the list out from under
  // them on every half-typed `[` would make the field unusable.
  const lastValidRef = useRef<RegExp | null>(null);

  const compiled = useMemo<Compiled>(() => {
    if (mode !== 'regex') return { regex: null, error: null, usingLastValid: false };
    const result = compilePattern(query, flags);
    if (result.regex) {
      lastValidRef.current = result.regex;
      return { regex: result.regex, error: null, usingLastValid: false };
    }
    return {
      regex: lastValidRef.current,
      error: result.error,
      usingLastValid: lastValidRef.current !== null,
    };
  }, [mode, query, flags]);

  useEffect(() => {
    if (mode === 'regex' && compiled.error?.kind === 'unsafe') {
      setEvaluationState('refused');
      setEvaluationMessage(compiled.error.reason);
      return;
    }
    if (mode === 'text') {
      setEvaluationState('ready');
      setEvaluationMessage(null);
      return;
    }
    setEvaluationState('ready');
    setEvaluationMessage(null);
  }, [mode, compiled.error]);

  const matches = useMemo<(text: string) => boolean>(() => {
    if (mode === 'text') {
      const needle = query.trim().toLowerCase();
      if (!needle) return MATCH_EVERYTHING;
      return (text: string) => text.toLowerCase().includes(needle);
    }
    const regex = compiled.regex;
    if (!regex) {
      return MATCH_EVERYTHING;
    }
    const bounded = createBoundedMatcher(regex);
    const reported = { value: false };
    return (text: string) => {
      const result = bounded.test(text);
      if (!reported.value && bounded.exhausted()) {
        reported.value = true;
        const state = bounded.refused() ? 'refused' : 'exhausted';
        const message = bounded.reason();
        // Matching is called by host renderers. Defer the state write so a
        // budget notice never mutates React state while a host is rendering.
        queueMicrotask(() => {
          setEvaluationState(state);
          setEvaluationMessage(message);
        });
      }
      return result;
    };
  }, [mode, query, compiled]);

  return {
    query,
    setQuery: onQueryChange,
    mode,
    setMode,
    flags,
    toggleFlag: toggleFlagFor,
    parts,
    applyParts,
    syncFailure,
    rebuildFromParts,
    escapeQueryAsLiteral,
    error: compiled.error,
    usingLastValid: compiled.usingLastValid,
    regex: compiled.regex,
    matches,
    evaluationState,
    evaluationMessage,
    sample,
    setSample,
  };
}

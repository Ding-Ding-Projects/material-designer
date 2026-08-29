import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Input } from '@open-design/components';

import { useT } from '../../i18n';
import { copyToClipboard } from '../../lib/copy-to-clipboard';
import {
  MAX_REPLACEMENT_LENGTH,
  MAX_SNIPPET_BYTES,
  REGEX_CAPABILITIES,
  explainPattern,
  getRegexEngineInfo,
  parseSnippets,
  previewReplacement,
  profilePattern,
  serializeSnippets,
  type RegexSnippet,
  type RegexToken,
} from './diagnostics';
import { runSample } from './evaluate';
import styles from './RegexBuilder.module.css';

interface Props {
  source: string;
  flags: string;
  regex: RegExp | null;
  sample: string;
  onPatternChange?: (next: string) => void;
  testId?: (suffix: string) => string | undefined;
  fieldId: string;
}

type RegexTranslator = (key: string, vars?: Record<string, string | number>) => string;

function tokenLabel(token: RegexToken, t: RegexTranslator): string {
  if (token.label.startsWith('Named capture ')) return t('regexBuilder.tokenNamedCapture', { name: token.label.slice('Named capture '.length) });
  if (token.label === 'Lookahead') return t('regexBuilder.tokenLookahead');
  if (token.label === 'Lookbehind') return t('regexBuilder.tokenLookbehind');
  if (token.label === 'Inline modifier') return t('regexBuilder.tokenInlineModifier');
  if (token.label === 'Atomic group') return t('regexBuilder.tokenAtomicGroup');
  if (token.label === 'Subroutine') return t('regexBuilder.tokenSubroutine');
  if (token.label === 'Conditional group') return t('regexBuilder.tokenConditionalGroup');
  if (token.label === 'Unsupported group construct') return t('regexBuilder.tokenUnsupportedGroup');
  if (token.kind === 'backreference') return t('regexBuilder.tokenBackreference');
  if (token.kind === 'escape') return t(token.source.startsWith('\\p') || token.source.startsWith('\\P') ? 'regexBuilder.tokenUnicodeProperty' : token.source.startsWith('\\u{') ? 'regexBuilder.tokenUnicodeCodePoint' : 'regexBuilder.tokenEscape');
  if (token.kind === 'class') return token.label === 'Class set notation' ? t('regexBuilder.tokenClassSetNotation') : t('regexBuilder.tokenCharacterClass');
  if (token.kind === 'literal') return t('regexBuilder.tokenLiteral');
  if (token.kind === 'alternation') return t('regexBuilder.tokenAlternation');
  if (token.kind === 'anchor') return t('regexBuilder.tokenAnchor');
  if (token.kind === 'wildcard') return t('regexBuilder.tokenWildcard');
  if (token.kind === 'quantifier') return token.label === 'Possessive quantifier' ? t('regexBuilder.tokenPossessive') : t('regexBuilder.tokenQuantifier');
  if (token.kind === 'group') return t('regexBuilder.tokenCapturingGroup');
  return t('regexBuilder.tokenGenericExplanation');
}

function tokenExplanation(token: RegexToken, t: RegexTranslator): string {
  if (token.label.startsWith('Named capture ')) return t('regexBuilder.tokenCapturingGroupExplanation');
  if (token.label === 'Lookahead' || token.label === 'Lookbehind') return t('regexBuilder.tokenGenericExplanation');
  if (token.label === 'Inline modifier' || token.label === 'Atomic group' || token.label === 'Subroutine' || token.label === 'Conditional group' || token.label === 'Unsupported group construct') return t('regexBuilder.tokenGenericExplanation');
  if (token.kind === 'backreference') return t('regexBuilder.tokenBackreferenceExplanation');
  if (token.kind === 'escape') return t(token.source.startsWith('\\p') || token.source.startsWith('\\P') ? 'regexBuilder.tokenUnicodePropertyExplanation' : token.source.startsWith('\\u{') ? 'regexBuilder.tokenUnicodeCodePointExplanation' : 'regexBuilder.tokenEscapeExplanation');
  if (token.kind === 'class') return token.label === 'Class set notation' ? t('regexBuilder.tokenClassSetNotationExplanation') : t('regexBuilder.tokenCharacterClassExplanation');
  if (token.kind === 'literal') return t('regexBuilder.tokenLiteralExplanation');
  if (token.kind === 'alternation') return t('regexBuilder.tokenAlternationExplanation');
  if (token.kind === 'anchor') return t('regexBuilder.tokenAnchorExplanation');
  if (token.kind === 'wildcard') return t('regexBuilder.tokenWildcardExplanation');
  if (token.kind === 'quantifier') return token.label === 'Possessive quantifier' ? t('regexBuilder.tokenPossessiveExplanation') : t('regexBuilder.tokenQuantifierExplanation');
  if (token.kind === 'group') return t('regexBuilder.tokenCapturingGroupExplanation');
  return t('regexBuilder.tokenGenericExplanation');
}

function saveText(name: string, body: string, type: string): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return;
  const url = URL.createObjectURL(new Blob([body], { type: `${type};charset=utf-8` }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function RegexWorkbenchPanels({ source, flags, regex, sample, onPatternChange, testId, fieldId }: Props) {
  const t = useT() as unknown as RegexTranslator;
  const [replacement, setReplacement] = useState('[$&]');
  const [snippetName, setSnippetName] = useState('');
  const snippetStorageKey = `open-design:regex-snippets:${encodeURIComponent(fieldId)}`;
  const [snippets, setSnippets] = useState<RegexSnippet[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = window.localStorage.getItem(snippetStorageKey);
      return raw ? (parseSnippets(raw).ok ? parseSnippets(raw).snippets : []) : [];
    } catch {
      return [];
    }
  });
  const [snippetStatus, setSnippetStatus] = useState('');
  const importRef = useRef<HTMLInputElement | null>(null);
  const [caseInput, setCaseInput] = useState('');
  const [caseExpected, setCaseExpected] = useState(true);
  const [cases, setCases] = useState<Array<{ id: string; input: string; expected: boolean }>>([]);
  const explanation = useMemo(() => explainPattern(source, flags), [source, flags]);
  const engine = useMemo(() => getRegexEngineInfo(flags), [flags]);
  const replacementResult = useMemo(
    () => previewReplacement(regex, sample, replacement),
    [regex, sample, replacement],
  );
  const profile = useMemo(() => profilePattern(regex, sample, source), [regex, sample, source]);
  const caseResults = useMemo(
    () => cases.map((item) => {
      const result = regex ? runSample(regex, item.input) : null;
      return { ...item, actual: result ? result.matches.length > 0 : false, refused: Boolean(result?.refused), timedOut: Boolean(result?.timedOut || result?.truncated) };
    }),
    [cases, regex],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(snippetStorageKey, serializeSnippets(snippets));
    } catch {
      setSnippetStatus(t('regexBuilder.snippetPersistFailed'));
    }
  }, [snippetStorageKey, snippets, t]);

  const copy = async (value: string, message: string) => {
    const ok = await copyToClipboard(value);
    setSnippetStatus(ok ? message : t('regexBuilder.copyFailed'));
  };

  const addSnippet = () => {
    const name = snippetName.trim();
    if (!name || !source || snippets.length >= 50) return;
    setSnippets((current) => [
      ...current.filter((item) => item.name !== name),
      { id: `snippet-${Date.now()}-${current.length}`, name, pattern: source, flags },
    ].slice(-50));
    setSnippetName('');
    setSnippetStatus(t('regexBuilder.snippetSaved'));
  };

  const importSnippets = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_SNIPPET_BYTES) {
      setSnippetStatus(t('regexBuilder.snippetFileTooLarge'));
      return;
    }
    let raw: string;
    try {
      const bytes = new Uint8Array(await file.slice(0, MAX_SNIPPET_BYTES + 1).arrayBuffer());
      if (bytes.length > MAX_SNIPPET_BYTES) {
        setSnippetStatus(t('regexBuilder.snippetFileTooLarge'));
        return;
      }
      raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      setSnippetStatus(t('regexBuilder.snippetFileInvalid'));
      return;
    }
    const parsed = parseSnippets(raw);
    if (!parsed.ok) {
      setSnippetStatus(t('regexBuilder.snippetImportFailed'));
      return;
    }
    setSnippets(parsed.snippets);
    setSnippetStatus(t('regexBuilder.snippetsImported'));
  };

  const id = (suffix: string) => testId?.(`workbench-${suffix}`);
  const statusLabel = (status: string) => status === 'supported'
    ? t('regexBuilder.statusSupported')
    : status === 'conditional'
      ? t('regexBuilder.statusConditional')
      : t('regexBuilder.statusUnsupported');
  const activeCapabilityStatus = (id: string, status: string) =>
    (id === 'unicode-properties' || id === 'unicode-code-point') && !/[uv]/.test(flags)
      ? 'conditional'
      : status;

  const addCase = () => {
    if (!caseInput.trim() || cases.length >= 50) return;
    setCases((current) => [...current, { id: `case-${current.length}-${caseInput.length}`, input: caseInput, expected: caseExpected }]);
    setCaseInput('');
  };

  return (
    <>
      <details className={styles.advancedPanel} open>
        <summary className={styles.sectionTitle}>
          {t('regexBuilder.engineNote', { engine: `${engine.engine} · ${engine.dialect}` })}
        </summary>
        <div className={styles.advancedBody}>
          <p className={styles.hint} data-testid={id('engine')}>
            {t('regexBuilder.engineVersion', { version: engine.version, flags: engine.flags })}
            {engine.versionSource === 'unavailable'
              ? ` ${t('regexBuilder.versionUnavailable')}`
              : ` ${t('regexBuilder.versionFromUserAgent')}`}
          </p>
          <p className={styles.hint}>{t(explanation.summaryKey, explanation.summaryVars)}</p>
          <div className={styles.tableScroll}>
            <table className={styles.table} data-testid={id('capabilities')}>
              <thead><tr><th>{t('regexBuilder.constructColumn')}</th><th>{t('regexBuilder.statusColumn')}</th><th>{t('regexBuilder.exampleColumn')}</th><th>{t('regexBuilder.reasonColumn')}</th></tr></thead>
              <tbody>
                {REGEX_CAPABILITIES.map((capability) => (
                  <tr key={capability.id} data-capability={capability.id} data-status={activeCapabilityStatus(capability.id, capability.status)}>
                    <td>{t(capability.labelKey)}</td>
                    <td>{statusLabel(activeCapabilityStatus(capability.id, capability.status))}</td>
                    <td><code className={styles.inlineCode}>{capability.example}</code></td>
                    <td>{t(capability.reasonKey)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={styles.sectionTitle}>
            {t('regexBuilder.tokenAnnotations')}
          </p>
          {explanation.tokens.length ? (
            <div className={styles.tableScroll}>
              <table className={styles.table} data-testid={id('tokens')}>
                <thead><tr><th>{t('regexBuilder.sourceColumn')}</th><th>{t('regexBuilder.rangeColumn')}</th><th>{t('regexBuilder.meaningColumn')}</th><th>{t('regexBuilder.statusColumn')}</th></tr></thead>
                <tbody>
                  {explanation.tokens.map((item) => (
                    <tr key={`${item.start}-${item.end}`} data-token-start={item.start}>
                      <td><code className={styles.inlineCode}>{item.source}</code></td>
                      <td>{item.start}–{item.end}</td>
                      <td>{tokenLabel(item, t)}: {tokenExplanation(item, t)}</td>
                      <td>{statusLabel(item.capability)}{item.risk === 'review' ? ` · ${t('regexBuilder.reviewLabel')}` : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className={styles.hint}>{t('regexBuilder.tokenEmpty')}</p>}
          <p className={styles.sectionTitle}>
            {t('regexBuilder.advancedConstructs')}
          </p>
          <div className={styles.buttonRow} data-testid={id('advanced-constructs')}>
            {REGEX_CAPABILITIES.filter((capability) => capability.status !== 'unsupported' && !capability.guided && capability.id !== 'replacement-templates').slice(0, 5).map((capability) => (
              <Button
                key={capability.id}
                variant="subtle"
                className={styles.smallButton}
                disabled={!onPatternChange}
                title={t(capability.reasonKey)}
                onClick={() => onPatternChange?.(`${source}${capability.example}`)}
              >
                {t(capability.labelKey)}
              </Button>
            ))}
          </div>
          <p className={styles.hint}>{t('regexBuilder.workbenchHint')}</p>
        </div>
      </details>

      <details className={styles.advancedPanel} open>
        <summary className={styles.sectionTitle}>{t('regexBuilder.caseSuite')}</summary>
        <div className={styles.advancedBody}>
          <div className={styles.buttonRow}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>{t('regexBuilder.caseInput')}</span>
              <Input
                className={styles.codeInput}
                value={caseInput}
                maxLength={10_000}
                spellCheck={false}
                onChange={(event) => setCaseInput(event.target.value)}
                data-testid={id('case-input')}
              />
            </label>
            <div className={styles.field} role="group" aria-label={t('regexBuilder.caseExpected')}>
              <span className={styles.fieldLabel}>{t('regexBuilder.caseExpected')}</span>
              <div className={styles.buttonRow}>
                <button type="button" className={styles.smallButton} aria-pressed={caseExpected} onClick={() => setCaseExpected(true)}>
                  {t('regexBuilder.caseExpectedMatch')}
                </button>
                <button type="button" className={styles.smallButton} aria-pressed={!caseExpected} onClick={() => setCaseExpected(false)}>
                  {t('regexBuilder.caseExpectedNoMatch')}
                </button>
              </div>
            </div>
            <Button variant="subtle" className={styles.smallButton} onClick={addCase} disabled={!caseInput.trim()} data-testid={id('case-add')}>
              {t('regexBuilder.caseAdd')}
            </Button>
          </div>
          {caseResults.length === 0 ? <p className={styles.hint}>{t('regexBuilder.caseEmpty')}</p> : (
            <ul className={styles.snippetList} data-testid={id('case-list')}>
              {caseResults.map((item) => (
                <li key={item.id}>
                  <code className={styles.inlineCode}>{item.input}</code>
                  <span>{item.expected ? t('regexBuilder.caseExpectedMatch') : t('regexBuilder.caseExpectedNoMatch')}</span>
                  <span className={item.refused || item.timedOut ? styles.notice : item.actual === item.expected ? styles.matchCount : styles.error}>
                    {item.refused
                      ? t('regexBuilder.caseRefused')
                      : item.timedOut
                        ? t('regexBuilder.caseTimedOut')
                        : item.actual ? t('regexBuilder.caseActualMatch') : t('regexBuilder.caseActualNoMatch')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>

      <details className={styles.advancedPanel} open>
        <summary className={styles.sectionTitle}>
          {t('regexBuilder.replacementAndProfile')}
        </summary>
        <div className={styles.advancedBody}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>{t('regexBuilder.replacementTemplate')}</span>
            <Input
              className={styles.codeInput}
              value={replacement}
              maxLength={MAX_REPLACEMENT_LENGTH}
              spellCheck={false}
              onChange={(event) => setReplacement(event.target.value)}
              data-testid={id('replacement')}
            />
          </label>
          <p className={styles.hint}>{t('regexBuilder.replacementHint')}</p>
          <div className={styles.preview} data-testid={id('replacement-preview')}>
            {replacementResult.ok ? replacementResult.output || t('regexBuilder.replacementEmpty') : t('regexBuilder.replacementUnavailable')}
          </div>
          <p className={styles.hint} role="status" data-testid={id('replacement-status')}>
            {replacementResult.ok
              ? `${t('regexBuilder.replacementStatus', { count: replacementResult.matchCount })}${replacementResult.truncated ? ` · ${t('regexBuilder.outputTruncated')}` : ''}`
              : replacementResult.timedOut
                ? t('regexBuilder.replacementTimedOut')
                : replacementResult.truncated
                  ? t('regexBuilder.outputTruncated')
                  : t('regexBuilder.replacementUnavailable')}
          </p>
          <div className={styles.profileGrid} data-testid={id('profile')}>
            <span>{t('regexBuilder.profileElapsed', { value: profile.elapsedMs })}</span>
            <span>{t('regexBuilder.profileTokens', { value: profile.tokenCount })}</span>
            <span>{t('regexBuilder.profileMatches', { value: profile.matchCount })}</span>
            <span>{t('regexBuilder.profileSample', { value: profile.sampleLength })}{profile.sampleTruncated ? ` · ${t('regexBuilder.sampleTruncated', { limit: 10_000 })}` : ''}</span>
          </div>
          {profile.status !== 'ready' ? (
            <p className={profile.status === 'refused' ? styles.error : styles.notice} role="status" data-testid={id('profile-status')}>
              {profile.status === 'refused'
                ? t('regexBuilder.evaluationRefused', { reason: t('regexBuilder.highRiskReason') })
                : t('regexBuilder.evaluationExhausted')}
            </p>
          ) : null}
          <p className={styles.notice} data-testid={id('trace')}>
            {t('regexBuilder.traceNote')}
          </p>
        </div>
      </details>

      <details className={styles.advancedPanel}>
        <summary className={styles.sectionTitle}>
          {t('regexBuilder.savedSnippets')}
        </summary>
        <div className={styles.advancedBody}>
          <p className={styles.hint}>{t('regexBuilder.snippetHint')}</p>
          <div className={styles.buttonRow}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>{t('regexBuilder.snippetName')}</span>
              <Input value={snippetName} maxLength={80} onChange={(event) => setSnippetName(event.target.value)} data-testid={id('snippet-name')} />
            </label>
            <Button variant="subtle" className={styles.smallButton} onClick={addSnippet} disabled={!snippetName.trim() || !source} data-testid={id('snippet-save')}>
              {t('regexBuilder.snippetSave')}
            </Button>
            <Button variant="subtle" className={styles.smallButton} onClick={() => void copy(serializeSnippets(snippets), t('regexBuilder.snippetsCopied'))} data-testid={id('snippet-copy')}>
              {t('regexBuilder.snippetCopy')}
            </Button>
            <Button variant="subtle" className={styles.smallButton} onClick={() => saveText('regex-snippets.json', serializeSnippets(snippets), 'application/json')} data-testid={id('snippet-export')}>
              {t('regexBuilder.snippetExport')}
            </Button>
            <Button variant="subtle" className={styles.smallButton} onClick={() => importRef.current?.click()} data-testid={id('snippet-import')}>
              {t('regexBuilder.snippetImport')}
            </Button>
            <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={(event) => { void importSnippets(event.target.files?.[0]); event.currentTarget.value = ''; }} />
          </div>
          {snippetStatus ? <p className={styles.hint} role="status">{snippetStatus}</p> : null}
          {snippets.length ? (
            <ul className={styles.snippetList} data-testid={id('snippet-list')}>
              {snippets.map((snippet) => (
                <li key={snippet.id}>
                  <Button variant="subtle" className={styles.smallButton} onClick={() => copy(snippet.pattern, snippet.name)}>{snippet.name}</Button>
                  <code className={styles.inlineCode}>/{snippet.pattern}/{snippet.flags}</code>
                </li>
              ))}
            </ul>
          ) : <p className={styles.hint}>{t('regexBuilder.snippetsEmpty')}</p>}
        </div>
      </details>
    </>
  );
}

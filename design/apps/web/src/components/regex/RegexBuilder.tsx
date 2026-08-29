// The regex builder itself.
//
// Two ways in, one pattern: the raw editor and the guided parts write to the
// same string, which is also the search field's own value. Where a hand-typed
// pattern goes past what the parts can express, the builder says so and keeps
// the pattern — it never rewrites what the user typed to make its own view
// tidy.

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Button, Input } from '@open-design/components';

import { Icon } from '../Icon';
import { useT } from '../../i18n';
import type { Dict } from '../../i18n/types';
import { copyToClipboard } from '../../lib/copy-to-clipboard';
import {
  MAX_PATTERN_LENGTH,
  REGEX_ENGINE_LABEL,
  REGEX_FLAGS,
  hasFlag,
  toRegexLiteral,
  type RegexFlag,
  type RegexPart,
} from './pattern';
import { looksCatastrophic } from './evaluate';
import { appendPart, createPart, movePart, removePartAt, replacePartAt } from './parts-ops';
import { RegexPartRow } from './RegexPartRow';
import { RegexSamplePanel } from './RegexSamplePanel';
import { RegexWorkbenchPanels } from './RegexWorkbenchPanels';
import type { RegexSearchController } from './useRegexSearch';
import styles from './RegexBuilder.module.css';

const FLAG_LABEL: Record<RegexFlag, keyof Dict> = {
  g: 'regexBuilder.flagG',
  i: 'regexBuilder.flagI',
  m: 'regexBuilder.flagM',
  s: 'regexBuilder.flagS',
  u: 'regexBuilder.flagU',
  y: 'regexBuilder.flagY',
};

const ADD_BUTTONS: Array<{ kind: RegexPart['kind']; labelKey: keyof Dict }> = [
  { kind: 'literal', labelKey: 'regexBuilder.addLiteral' },
  { kind: 'charClass', labelKey: 'regexBuilder.addCharClass' },
  { kind: 'anchor', labelKey: 'regexBuilder.addAnchor' },
  { kind: 'group', labelKey: 'regexBuilder.addGroup' },
  { kind: 'alternation', labelKey: 'regexBuilder.addAlternation' },
];

interface Props {
  search: RegexSearchController;
  /** What this field searches, so the heading says which one is being edited. */
  fieldLabel: string;
  onClose: () => void;
  /** Test id prefix inherited from the field, so two builders never collide. */
  testIdPrefix?: string;
  /** Stable owner id for field-scoped snippet persistence. */
  fieldId: string;
}

export function RegexBuilder({ search, fieldLabel, onClose, testIdPrefix, fieldId }: Props) {
  const t = useT();
  const translate = t as unknown as (key: string, vars?: Record<string, string | number>) => string;
  // Radio groups are linked by `name`. Two builders open on one page with the
  // same name would toggle each other's mode, so the group name is unique per
  // mounted builder rather than derived from a caller-supplied prefix.
  const uid = useId();
  const [copied, setCopied] = useState<'pattern' | 'literal' | 'failed' | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  const flash = useCallback((state: 'pattern' | 'literal' | 'failed') => {
    setCopied(state);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(null), 1600);
  }, []);

  const copy = useCallback(
    (text: string, state: 'pattern' | 'literal') => {
      void copyToClipboard(text).then((ok) => flash(ok ? state : 'failed'));
    },
    [flash],
  );

  const testId = (suffix: string) => (testIdPrefix ? `${testIdPrefix}-${suffix}` : undefined);

  // Pulled out of `search` so the discriminated-union narrowing below reads
  // plainly rather than depending on property narrowing surviving JSX.
  const { error, syncFailure } = search;
  const partsDisabled = syncFailure !== null;

  return (
    <div className={styles.builder}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <h3 className={styles.title}>{t('regexBuilder.title')}</h3>
          <p className={styles.subtitle}>{t('regexBuilder.forField', { field: fieldLabel })}</p>
        </div>
        <Button
          variant="subtle"
          size="icon"
          className={styles.iconButton}
          aria-label={t('common.close')}
          title={t('common.close')}
          onClick={onClose}
          data-testid={testId('close')}
        >
          <Icon name="close" size={15} />
        </Button>
      </header>

      <p className={styles.engineNote}>
        {t('regexBuilder.engineNote', { engine: REGEX_ENGINE_LABEL })}
      </p>

      <fieldset className={styles.modeGroup}>
        <legend className={styles.fieldLabel}>{t('regexBuilder.modeLegend')}</legend>
        <label className={styles.radioField}>
          <input
            type="radio"
            name={`regex-mode-${uid}`}
            checked={search.mode === 'text'}
            onChange={() => search.setMode('text')}
            data-testid={testId('mode-text')}
          />
          <span>{t('regexBuilder.modePlain')}</span>
        </label>
        <label className={styles.radioField}>
          <input
            type="radio"
            name={`regex-mode-${uid}`}
            checked={search.mode === 'regex'}
            onChange={() => search.setMode('regex')}
            data-testid={testId('mode-regex')}
          />
          <span>{t('regexBuilder.modeRegex')}</span>
        </label>
      </fieldset>

      {search.mode === 'text' ? (
        <div className={styles.plainNotice}>
          <p>{t('regexBuilder.plainNotice')}</p>
          <Button
            variant="primary"
            className={styles.smallButton}
            onClick={() => search.setMode('regex')}
            data-testid={testId('enable-regex')}
          >
            {t('regexBuilder.enableRegex')}
          </Button>
        </div>
      ) : (
        <>
          <section className={styles.section}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>{t('regexBuilder.patternLabel')}</span>
              <Input
                className={styles.codeInput}
                value={search.query}
                spellCheck={false}
                autoComplete="off"
                maxLength={MAX_PATTERN_LENGTH}
                placeholder={t('regexBuilder.patternPlaceholder')}
                onChange={(event) => search.setQuery(event.target.value)}
                data-testid={testId('pattern')}
              />
            </label>
            <p className={styles.hint}>
              {t('regexBuilder.patternLength', {
                length: search.query.length,
                limit: MAX_PATTERN_LENGTH,
              })}
            </p>

            {error ? (
              <div className={styles.error} role="alert" data-testid={testId('error')}>
                <strong className={styles.errorTitle}>
                  {t('regexBuilder.errorHeading', { engine: REGEX_ENGINE_LABEL })}
                </strong>
                <code className={styles.errorBody}>
                  {error.kind === 'tooLong'
                    ? t('regexBuilder.errorTooLong', {
                        length: error.length,
                        limit: error.limit,
                      })
                    : error.kind === 'unsafe'
                      ? translate('regexBuilder.errorUnsafe', { reason: translate('regexBuilder.highRiskReason') })
                      : error.message}
                </code>
                {search.usingLastValid ? (
                  <span className={styles.hint}>{t('regexBuilder.usingLastValid')}</span>
                ) : null}
              </div>
            ) : null}

            {looksCatastrophic(search.query) && !error ? (
              <p className={styles.notice} data-testid={testId('slow-shape')}>
                {t('regexBuilder.slowShape')}
              </p>
            ) : null}
            {search.evaluationState === 'refused' ? (
              <p className={styles.error} role="status" data-testid={testId('evaluation-refused')}>
                {translate('regexBuilder.evaluationRefused', { reason: translate('regexBuilder.highRiskReason') })}
              </p>
            ) : search.evaluationState === 'exhausted' ? (
              <p className={styles.notice} role="status" data-testid={testId('evaluation-exhausted')}>
                {translate('regexBuilder.evaluationExhausted')}
              </p>
            ) : null}

            <div className={styles.buttonRow}>
              <Button
                variant="subtle"
                className={styles.smallButton}
                onClick={() => copy(search.query, 'pattern')}
                data-testid={testId('copy-pattern')}
              >
                <Icon name="copy" size={13} />
                <span>{t('regexBuilder.copyPattern')}</span>
              </Button>
              <Button
                variant="subtle"
                className={styles.smallButton}
                onClick={() => copy(toRegexLiteral(search.query, search.flags), 'literal')}
                data-testid={testId('copy-literal')}
              >
                <Icon name="copy" size={13} />
                <span>{t('regexBuilder.copyLiteral')}</span>
              </Button>
              <Button
                variant="subtle"
                className={styles.smallButton}
                onClick={search.escapeQueryAsLiteral}
                data-testid={testId('escape-literal')}
              >
                {t('regexBuilder.escapeAsLiteral')}
              </Button>
              <span className={styles.copyStatus} role="status">
                {copied === 'failed'
                  ? t('regexBuilder.copyFailed')
                  : copied
                    ? t('regexBuilder.copied')
                    : ''}
              </span>
            </div>
          </section>

          <fieldset className={styles.section}>
            <legend className={styles.sectionTitle}>{t('regexBuilder.flagsLegend')}</legend>
            <ul className={styles.flagList}>
              {REGEX_FLAGS.map((flag) => (
                <li key={flag}>
                  <label className={styles.checkboxField}>
                    <input
                      type="checkbox"
                      checked={hasFlag(search.flags, flag)}
                      onChange={() => search.toggleFlag(flag)}
                      data-testid={testId(`flag-${flag}`)}
                    />
                    <span className={styles.flagText}>{t(FLAG_LABEL[flag])}</span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>

          <section className={styles.section}>
            <h4 className={styles.sectionTitle}>{t('regexBuilder.partsLegend')}</h4>

            {syncFailure ? (
              <div className={styles.outOfSync} role="status" data-testid={testId('out-of-sync')}>
                <strong className={styles.errorTitle}>{t('regexBuilder.outOfSyncTitle')}</strong>
                <p>
                  {syncFailure.kind === 'tooLong'
                    ? t('regexBuilder.outOfSyncTooLong', { limit: syncFailure.limit })
                    : t('regexBuilder.outOfSyncBody', {
                        token: syncFailure.token,
                        at: syncFailure.at + 1,
                      })}
                </p>
                <Button
                  variant="subtle"
                  className={styles.smallButton}
                  onClick={search.rebuildFromParts}
                  data-testid={testId('rebuild-parts')}
                >
                  {t('regexBuilder.outOfSyncAction')}
                </Button>
              </div>
            ) : null}

            {!partsDisabled && search.parts.length === 0 ? (
              <p className={styles.hint}>{t('regexBuilder.partsEmpty')}</p>
            ) : null}

            {!partsDisabled ? (
              <ol className={styles.partList}>
                {search.parts.map((part, index) => (
                  <RegexPartRow
                    key={part.id}
                    part={part}
                    index={index}
                    total={search.parts.length}
                    onChange={(next) => search.applyParts(replacePartAt(search.parts, index, next))}
                    onMove={(delta) => search.applyParts(movePart(search.parts, index, delta))}
                    onRemove={() => search.applyParts(removePartAt(search.parts, index))}
                  />
                ))}
              </ol>
            ) : null}

            <div className={styles.buttonRow} aria-label={t('regexBuilder.addPartLegend')}>
              {ADD_BUTTONS.map(({ kind, labelKey }) => (
                <Button
                  key={kind}
                  variant="subtle"
                  className={styles.smallButton}
                  disabled={partsDisabled}
                  onClick={() => search.applyParts(appendPart(search.parts, createPart(kind)))}
                  data-testid={testId(`add-${kind}`)}
                >
                  <Icon name="plus" size={12} />
                  <span>{t(labelKey)}</span>
                </Button>
              ))}
            </div>
          </section>

          <RegexSamplePanel
            regex={search.regex}
            sample={search.sample}
            onSampleChange={search.setSample}
            testIdPrefix={testIdPrefix ? `${testIdPrefix}` : undefined}
          />

          <RegexWorkbenchPanels
            source={search.query}
            flags={search.flags}
            regex={search.regex}
            sample={search.sample}
            onPatternChange={search.setQuery}
            testId={testId}
            fieldId={fieldId}
          />

          <p className={styles.safetyNote}>{t('regexBuilder.safetyNote')}</p>
        </>
      )}
    </div>
  );
}

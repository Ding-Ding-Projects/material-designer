// Sample text, live match highlighting and the capture-group table.
//
// Everything here is derived from ONE `runSample` call so the highlighting,
// the count and the table can never disagree about what matched.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Textarea } from '@open-design/components';

import { useT } from '../../i18n';
import { MAX_SAMPLE_LENGTH, captureGroupNames } from './pattern';
import { MAX_SAMPLE_MATCHES, buildHighlightSegments, runSample } from './evaluate';
import styles from './RegexBuilder.module.css';

interface Props {
  regex: RegExp | null;
  sample: string;
  onSampleChange: (next: string) => void;
}

export function RegexSamplePanel({ regex, sample, onSampleChange }: Props) {
  const t = useT();
  const [activeMatch, setActiveMatch] = useState(0);
  const matchRefs = useRef<Record<number, HTMLElement | null>>({});

  const run = useMemo(() => (regex ? runSample(regex, sample) : null), [regex, sample]);
  const segments = useMemo(
    () => (run ? buildHighlightSegments(run.scanned, run.matches) : []),
    [run],
  );

  // A group column exists as soon as any match reports one. `groups` is
  // positional, so its length is the group count the engine actually saw.
  const groupCount = run
    ? run.matches.reduce((widest, match) => Math.max(widest, match.groups.length), 0)
    : 0;
  const groupNames = useMemo(() => (regex ? captureGroupNames(regex.source) : []), [regex]);

  useEffect(() => {
    setActiveMatch(0);
    matchRefs.current = {};
  }, [regex, sample]);

  const matchCount = run?.matches.length ?? 0;
  const active = matchCount ? Math.min(activeMatch, matchCount - 1) : -1;

  useEffect(() => {
    if (active < 0) return;
    matchRefs.current[active]?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [active]);

  return (
    <section className={styles.section} aria-label={t('regexBuilder.sampleLegend')}>
      <h4 className={styles.sectionTitle}>{t('regexBuilder.sampleLegend')}</h4>
      <Textarea
        className={styles.sampleInput}
        value={sample}
        rows={4}
        spellCheck={false}
        // Allow one character beyond the evaluation bound so the user can see the
        // explicit truncation state instead of having the browser silently
        // discard the evidence that a bound was reached.
        maxLength={MAX_SAMPLE_LENGTH + 1}
        placeholder={t('regexBuilder.samplePlaceholder')}
        aria-label={t('regexBuilder.sampleLegend')}
        data-testid="regex-sample-input"
        onChange={(event) => onSampleChange(event.target.value)}
      />

      {run?.sampleTruncated ? (
        <p className={styles.notice}>
          {t('regexBuilder.sampleTruncated', { limit: MAX_SAMPLE_LENGTH })}
        </p>
      ) : null}

      {!sample ? (
        <p className={styles.hint}>{t('regexBuilder.sampleEmpty')}</p>
      ) : (
        <>
          <p className={styles.matchCount} data-testid="regex-match-count" role="status">
            {run && run.matches.length === 1
              ? t('regexBuilder.matchCountOne')
              : run && run.matches.length > 0
                ? t('regexBuilder.matchCount', { count: run.matches.length })
                : t('regexBuilder.matchNone')}
          </p>
          {run?.truncated ? (
            <p className={styles.notice}>
              {t('regexBuilder.matchesTruncated', { limit: MAX_SAMPLE_MATCHES })}
            </p>
          ) : null}
          {run?.timedOut ? (
            <p className={styles.notice}>{t('regexBuilder.matchesTimedOut')}</p>
          ) : null}
          {run?.refused ? (
            <p className={styles.error} role="status">
              {t('regexBuilder.evaluationRefused', { reason: t('regexBuilder.highRiskReason') })}
            </p>
          ) : null}

          {matchCount > 0 ? (
            <div className={styles.buttonRow} role="group" aria-label={t('regexBuilder.previewLabel')}>
              <button
                type="button"
                className={styles.smallButton}
                onClick={() => setActiveMatch((current) => (current - 1 + matchCount) % matchCount)}
                aria-label={t('regexBuilder.matchPrevious')}
                data-testid="regex-match-previous"
              >
                {t('regexBuilder.matchPrevious')}
              </button>
              <span className={styles.hint} role="status">
                {t('regexBuilder.matchPosition', { current: active + 1, total: matchCount })}
              </span>
              <button
                type="button"
                className={styles.smallButton}
                onClick={() => setActiveMatch((current) => (current + 1) % matchCount)}
                aria-label={t('regexBuilder.matchNext')}
                data-testid="regex-match-next"
              >
                {t('regexBuilder.matchNext')}
              </button>
            </div>
          ) : null}

          <div
            className={styles.preview}
            aria-label={t('regexBuilder.previewLabel')}
            data-testid="regex-match-preview"
          >
            {segments.map((segment, index) =>
              segment.match === null ? (
                <span key={`plain-${index}`}>{segment.text}</span>
                ) : (
                  <mark
                    key={`match-${index}`}
                    ref={(node) => { if (segment.match !== null) matchRefs.current[segment.match] = node; }}
                    className={styles.mark}
                    data-active={segment.match === active ? 'true' : 'false'}
                    aria-current={segment.match === active ? 'true' : undefined}
                  >
                  {segment.text}
                </mark>
              ),
            )}
          </div>
        </>
      )}

      <h4 className={styles.sectionTitle}>{t('regexBuilder.groupsLegend')}</h4>
      {groupCount === 0 ? (
        <p className={styles.hint}>{t('regexBuilder.groupsNone')}</p>
      ) : (
        <div className={styles.tableScroll}>
          <table className={styles.table} data-testid="regex-groups-table">
            <thead>
              <tr>
                <th scope="col">{t('regexBuilder.colMatch')}</th>
                <th scope="col">{t('regexBuilder.colGroup')}</th>
                <th scope="col">{t('regexBuilder.colName')}</th>
                <th scope="col">{t('regexBuilder.colValue')}</th>
              </tr>
            </thead>
            <tbody>
              {(run?.matches ?? []).flatMap((match, matchIndex) =>
                match.groups.map((value, groupIndex) => {
                  const name = groupNames[groupIndex];
                  return (
                    <tr key={`m${matchIndex}-g${groupIndex}`}>
                      <td>{matchIndex + 1}</td>
                      <td>{groupIndex + 1}</td>
                      <td>{name ?? ''}</td>
                      <td>
                        {value === undefined ? (
                          <span className={styles.hint}>{t('regexBuilder.groupUnmatched')}</span>
                        ) : (
                          <code className={styles.inlineCode}>{value}</code>
                        )}
                      </td>
                    </tr>
                  );
                }),
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

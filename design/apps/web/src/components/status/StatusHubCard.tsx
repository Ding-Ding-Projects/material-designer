import { useMemo, useRef, useState } from 'react';

import { Button } from '@open-design/components';
import { RegexSearchField } from '../regex/RegexSearchField';
import { useRegexSearch } from '../regex/useRegexSearch';
import type { StatusEvidence, StatusLane, StatusSnapshot, StatusState } from '../../runtime/status-hub';
import styles from './StatusHub.module.css';

export const STATUS_HUB_MOUNT_IDS = ['C0', 'C2', 'C7', 'C12'] as const;
export type StatusHubMountId = (typeof STATUS_HUB_MOUNT_IDS)[number];

export interface StatusHubLabels {
  readonly title: string;
  readonly search: string;
  readonly searchPlaceholder: string;
  readonly currentState: string;
  readonly lastUpdated: string;
  readonly baseline: string;
  readonly evidence: string;
  readonly nextChecks: string;
  readonly refresh: string;
  readonly loading: string;
  readonly unavailable: string;
  readonly timestampUnavailable?: string;
  readonly stale?: (ageSeconds: number) => string;
  readonly lastKnown?: (state: StatusState) => string;
  readonly localFallback: string;
  readonly noEvidence: string;
  readonly noChecks: string;
  readonly noLanes: string;
  readonly noMatches: string;
  readonly laneState: (state: StatusState) => string;
  readonly evidenceState: (state: StatusState) => string;
}

export interface StatusHubMountProps {
  readonly mountId?: StatusHubMountId;
  readonly snapshot: StatusSnapshot | null;
  readonly loading?: boolean;
  readonly error?: string | null;
  readonly labels: StatusHubLabels;
  readonly onRefresh?: () => void;
  readonly className?: string;
}

function textForLane(lane: StatusLane): string {
  return [
    lane.id,
    lane.title,
    lane.summary,
    ...lane.evidence.flatMap((item) => [item.label, item.detail ?? '', item.state]),
    ...lane.nextChecks,
  ].join('\n');
}

function textForEvidence(item: StatusEvidence): string {
  return [item.id, item.label, item.detail ?? '', item.state, item.sourceCommit ?? ''].join('\n');
}

function statusIcon(state: StatusState): string {
  switch (state) {
    case 'verified': return '✅';
    case 'failed': return '❌';
    case 'blocked': return '🧱';
    case 'running': return '🏃';
    case 'waiting': return '⏳';
    default: return '💤';
  }
}

export function StatusHubCard({
  mountId = 'C0',
  snapshot,
  loading = false,
  error = null,
  labels,
  onRefresh,
  className,
}: StatusHubMountProps) {
  const [query, setQuery] = useState('');
  const search = useRegexSearch(query, setQuery);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const lanes = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.lanes.filter((lane) => search.matches(textForLane(lane)));
  }, [search, snapshot]);
  const evidence = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.evidence.filter((item) => search.matches(textForEvidence(item)));
  }, [search, snapshot]);
  const nextChecks = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.nextChecks.filter((check) => search.matches(check));
  }, [search, snapshot]);
  const hasQuery = query.trim().length > 0;
  const state = snapshot?.state ?? (loading ? 'waiting' : 'failed');
  const freshnessNote = snapshot?.freshness === 'stale'
    ? `${labels.stale?.(snapshot.ageSeconds ?? 0) ?? 'Status is stale.'}${snapshot.lastKnownState ? ` ${labels.lastKnown?.(snapshot.lastKnownState) ?? `Last known state: ${snapshot.lastKnownState}.`}` : ''}`
    : snapshot?.freshness === 'unavailable'
      ? labels.timestampUnavailable ?? labels.unavailable
      : snapshot?.source === 'local-fallback'
        ? labels.localFallback
        : snapshot
          ? ''
          : labels.unavailable;

  return (
    <section
      className={`${styles.card}${className ? ` ${className}` : ''}`}
      data-status-hub="true"
      data-status-hub-mount={mountId}
      data-status-hub-source={snapshot?.source ?? 'unavailable'}
      aria-busy={loading}
    >
      <header className={styles.header}>
        <div>
          <h2 className={styles.heading}>{snapshot?.title ?? labels.title}</h2>
          <p className={styles.summary}>{snapshot?.summary ?? (loading ? labels.loading : labels.unavailable)}</p>
        </div>
        {onRefresh ? (
          <Button className={styles.refresh} variant="ghost" onClick={onRefresh} disabled={loading} aria-label={labels.refresh}>
            ↻
          </Button>
        ) : null}
      </header>

      <div className={styles.stateRow}>
        <span className={styles.stateChip} data-state={state} role="status">
          <span className={styles.stateDot} aria-hidden="true" />
          <span>{statusIcon(state)} {labels.currentState}: {labels.laneState(state)}</span>
        </span>
        <p className={styles.sourceNote}>{freshnessNote}</p>
      </div>

      {snapshot ? (
        <>
          <dl className={styles.factGrid}>
            <div className={styles.fact}>
              <dt>{labels.lastUpdated}</dt>
              <dd><time dateTime={snapshot.updatedAt ?? undefined}>{snapshot.updatedAt ?? (labels.timestampUnavailable ?? labels.unavailable)}</time></dd>
            </div>
            <div className={styles.fact}>
              <dt>{labels.baseline}</dt>
              <dd>{snapshot.baseline ?? labels.unavailable}</dd>
            </div>
          </dl>

          <div className={styles.searchRow}>
            <label className={styles.search}>
              <span className="sr-only">{labels.search}</span>
              <RegexSearchField
                search={search}
                fieldLabel={labels.search}
                inputRef={inputRef}
                placeholder={labels.searchPlaceholder}
                ariaLabel={labels.search}
                testId={`status-hub-search-${mountId}`}
              />
            </label>
          </div>

          <section className={styles.section} aria-labelledby={`${mountId}-evidence-heading`}>
            <h3 className={styles.sectionHeading} id={`${mountId}-evidence-heading`}>{labels.evidence}</h3>
            {evidence.length > 0 ? (
              <ul className={styles.evidence}>
                {evidence.map((item) => <EvidenceRow item={item} key={item.id} labels={labels} />)}
              </ul>
            ) : <p className={styles.empty}>{hasQuery ? labels.noMatches : labels.noEvidence}</p>}
          </section>

          <section className={styles.section} aria-labelledby={`${mountId}-lanes-heading`}>
            <h3 className={styles.sectionHeading} id={`${mountId}-lanes-heading`}>{labels.title}</h3>
            {lanes.length > 0 ? (
              <ul className={styles.lanes}>
                {lanes.map((lane) => <LaneRow lane={lane} labels={labels} key={lane.id} />)}
              </ul>
            ) : <p className={styles.empty}>{hasQuery ? labels.noMatches : labels.noLanes}</p>}
          </section>

          <section className={styles.section} aria-labelledby={`${mountId}-checks-heading`}>
            <h3 className={styles.sectionHeading} id={`${mountId}-checks-heading`}>{labels.nextChecks}</h3>
            {nextChecks.length > 0 ? (
              <ul className={styles.checks}>
                {nextChecks.map((check) => <li className={styles.checkItem} key={check}>{check}</li>)}
              </ul>
            ) : <p className={styles.empty}>{hasQuery ? labels.noMatches : labels.noChecks}</p>}
          </section>
        </>
      ) : null}
      {error ? <p className={styles.unavailable} role="alert">{error}</p> : null}
    </section>
  );
}

function EvidenceRow({ item, labels }: { item: StatusEvidence; labels: StatusHubLabels }) {
  return (
    <li className={styles.evidenceItem} data-evidence-state={item.state}>
      <span className={styles.evidenceState}>{statusIcon(item.state)} {labels.evidenceState(item.state)}</span>
      <span className={styles.evidenceText}>
        {item.href ? <a className={styles.evidenceLink} href={item.href} target="_blank" rel="noreferrer noopener">{item.label}</a> : item.label}
        {item.detail ? `: ${item.detail}` : ''}
        {item.sourceCommit ? ` (${item.sourceCommit})` : ''}
      </span>
    </li>
  );
}

function LaneRow({ lane, labels }: { lane: StatusLane; labels: StatusHubLabels }) {
  return (
    <li className={styles.lane} data-lane-state={lane.state}>
      <details>
        <summary>
          <span className={styles.laneTitle}>{lane.title}</span>
          <span className={styles.laneState}>{statusIcon(lane.state)} {labels.laneState(lane.state)}</span>
        </summary>
        <div className={styles.laneBody}>
          <p className={styles.laneSummary}>{lane.summary}</p>
          {lane.evidence.length > 0 ? (
            <ul className={styles.evidence}>
              {lane.evidence.map((item) => <EvidenceRow item={item} labels={labels} key={item.id} />)}
            </ul>
          ) : null}
          {lane.nextChecks.length > 0 ? (
            <ul className={styles.checks}>
              {lane.nextChecks.map((check) => <li className={styles.checkItem} key={check}>{check}</li>)}
            </ul>
          ) : null}
        </div>
      </details>
    </li>
  );
}

export const StatusHub = StatusHubCard;

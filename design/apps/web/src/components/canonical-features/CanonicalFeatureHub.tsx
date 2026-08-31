'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';

import { Button } from '@open-design/components';

import { AuthenticatorDestination } from '../authenticator/AuthenticatorDestination';
import type { AuthenticatorBridge } from '../authenticator/contracts';
import { ChangelogDialog } from '../changelog/ChangelogDialog';
import { DestructiveGate, type DestructiveGateOutcome } from '../destructive/DestructiveGate';
import { DocumentationBrowserView } from '../documentation/DocumentationBrowserView';
import { FileConverterView } from '../FileConverterView';
import { VersionHistoryDialog } from '../history/VersionHistoryDialog';
import { openVersionHistory } from '../history/open-history';
import { NotificationCenter } from '../notifications/NotificationCenter';
import { OllamaSuiteManager } from '../ollama/OllamaSuiteManager';
import { RegexSearchField } from '../regex/RegexSearchField';
import { useRegexSearch } from '../regex/useRegexSearch';
import { createEmptyStatusFallback, StatusHubPanel } from '../status/StatusHubPanel';
import type { StatusHubLabels } from '../status/StatusHubCard';
import type { StatusHubClient } from '../../runtime/status-hub';
import { UnlockLadder } from '../unlock-ladder/UnlockLadder';
import type { UnlockLadderBridge } from '../unlock-ladder/protocol';
import styles from './CanonicalFeatureHub.module.css';

export type CanonicalFeatureId =
  | 'offline-documentation'
  | 'changelog'
  | 'status-hub'
  | 'file-converter'
  | 'ollama-suite'
  | 'authenticator'
  | 'unlock-ladder'
  | 'notifications-history'
  | 'exports-bulk-actions'
  | 'destructive-confirmation';

export interface CanonicalFeatureInventoryRow {
  readonly id: CanonicalFeatureId;
  readonly label: string;
  readonly component: string;
  readonly hostCapability?: string;
}

/** Hand-written canonical feature coverage used by the app's completeness audit. */
export const CANONICAL_FEATURE_HUB_INVENTORY: readonly CanonicalFeatureInventoryRow[] = [
  { id: 'offline-documentation', label: 'Offline documentation', component: 'DocumentationBrowserView' },
  { id: 'changelog', label: 'Changelog', component: 'ChangelogDialog' },
  { id: 'status-hub', label: 'Status Hub', component: 'StatusHubPanel', hostCapability: 'statusClient' },
  { id: 'file-converter', label: 'File converter', component: 'FileConverterView' },
  { id: 'ollama-suite', label: 'Local Ollama suite manager', component: 'OllamaSuiteManager' },
  { id: 'authenticator', label: 'Built-in authenticator', component: 'AuthenticatorDestination', hostCapability: 'authenticatorBridge' },
  { id: 'unlock-ladder', label: 'Unlock ladder', component: 'UnlockLadder', hostCapability: 'unlockBridge' },
  { id: 'notifications-history', label: 'Notifications and local history', component: 'NotificationCenter + VersionHistoryDialog' },
  { id: 'exports-bulk-actions', label: 'Exports and bulk actions', component: 'FileConverterView + VersionHistoryDialog + NotificationCenter' },
  { id: 'destructive-confirmation', label: 'Destructive confirmation', component: 'DestructiveGate' },
] as const;

type CanonicalTab = CanonicalFeatureInventoryRow;

export interface CanonicalFeatureHubProps {
  readonly statusClient?: StatusHubClient;
  readonly statusFallback?: StatusHubClient;
  readonly statusLabels?: StatusHubLabels;
  readonly authenticatorBridge?: AuthenticatorBridge;
  readonly unlockBridge?: UnlockLadderBridge;
  readonly lockoutId?: string;
}

const DEFAULT_STATUS_LABELS: StatusHubLabels = {
  title: 'Status Hub',
  search: 'Search status evidence',
  searchPlaceholder: 'Search lanes, evidence, or checks',
  currentState: 'Current state',
  lastUpdated: 'Last updated',
  baseline: 'Verified baseline',
  evidence: 'Evidence',
  nextChecks: 'Next checks',
  refresh: 'Refresh status',
  loading: 'Loading status',
  unavailable: 'Status Hub is unavailable in this surface.',
  timestampUnavailable: 'Updated time is unavailable.',
  stale: (ageSeconds) => `Status is stale by ${ageSeconds} seconds.`,
  lastKnown: (state) => `Last known state: ${state}.`,
  localFallback: 'Showing the local fallback because the shared Status Hub did not answer.',
  noEvidence: 'No evidence is recorded.',
  noChecks: 'No next checks are recorded.',
  noLanes: 'No active lanes are recorded.',
  noMatches: 'No status entries match this search.',
  laneState: (state) => `Lane state: ${state}.`,
  evidenceState: (state) => `Evidence state: ${state}.`,
};

function featureText(feature: CanonicalTab): string {
  return `${feature.label} ${feature.component} ${feature.hostCapability ?? ''}`;
}

function unavailableCard(feature: CanonicalTab, reason: string): ReactNode {
  return (
    <article className={styles.capabilityCard} data-state="unavailable" aria-labelledby={`${feature.id}-unavailable-title`}>
      <h3 id={`${feature.id}-unavailable-title`}>{feature.label}</h3>
      <p>This destination cannot run in the current host surface.</p>
      <p className={styles.capabilityReason} role="status">{reason}</p>
    </article>
  );
}

export function CanonicalFeatureHub({
  statusClient,
  statusFallback,
  statusLabels = DEFAULT_STATUS_LABELS,
  authenticatorBridge,
  unlockBridge,
  lockoutId = 'canonical-feature-hub',
}: CanonicalFeatureHubProps = {}) {
  const [activeId, setActiveId] = useState<CanonicalFeatureId>('offline-documentation');
  const [query, setQuery] = useState('');
  const [destructiveOpen, setDestructiveOpen] = useState(false);
  const [previewRecordPresent, setPreviewRecordPresent] = useState(true);
  const search = useRegexSearch(query, setQuery);
  const tabs = useMemo(
    () => CANONICAL_FEATURE_HUB_INVENTORY.filter((feature) => search.matches(featureText(feature))),
    [search, query],
  );
  const activeTab = tabs.find((feature) => feature.id === activeId) ?? tabs[0] ?? null;
  const localStatusFallback = useMemo(
    () => createEmptyStatusFallback(
      'canonical-feature-hub',
      'Canonical feature hub',
      'The shared status service is unavailable. No remote status was claimed.',
    ),
    [],
  );
  const resolvedStatusClient = statusClient ?? localStatusFallback;
  const resolvedStatusFallback = statusFallback ?? (statusClient ? localStatusFallback : undefined);

  useEffect(() => {
    if (activeTab && activeTab.id !== activeId) setActiveId(activeTab.id);
  }, [activeId, activeTab]);

  const onDestructiveClose = (outcome: DestructiveGateOutcome) => {
    setDestructiveOpen(false);
    if (outcome === 'completed') return;
  };

  return (
    <section className={styles.hub} data-testid="canonical-feature-hub" aria-label="Canonical feature hub">
      <aside className={styles.rail}>
        <div className={styles.heading}>
          <div>
            <h1>Feature coverage</h1>
            <p>Reach each canonical surface from one keyboard-friendly hub.</p>
          </div>
          <span className={styles.status} aria-live="polite">{tabs.length}/{CANONICAL_FEATURE_HUB_INVENTORY.length}</span>
        </div>
        <div className={styles.search}>
          <RegexSearchField
            search={search}
            fieldLabel="Canonical feature search"
            ariaLabel="Search canonical features"
            placeholder="Search canonical features"
            ariaControls="canonical-feature-tabpanel"
            testId="canonical-feature-search"
            focusScopeId="canonical-feature-hub"
          />
        </div>
        <div className={styles.tabs} role="tablist" aria-orientation="vertical" aria-label="Canonical feature destinations">
          {tabs.map((feature) => (
            <button
              key={feature.id}
              id={`canonical-feature-tab-${feature.id}`}
              className={styles.tab}
              data-feature-id={feature.id}
              type="button"
              role="tab"
              aria-selected={feature.id === activeTab?.id}
              aria-controls="canonical-feature-tabpanel"
              tabIndex={feature.id === activeTab?.id ? 0 : -1}
              onClick={() => setActiveId(feature.id)}
              onKeyDown={(event) => {
                if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const index = tabs.findIndex((item) => item.id === feature.id);
                const next = event.key === 'Home'
                  ? tabs[0]
                  : event.key === 'End'
                    ? tabs[tabs.length - 1]
                    : tabs[(index + (event.key === 'ArrowDown' ? 1 : -1) + tabs.length) % tabs.length];
                if (next) {
                  setActiveId(next.id);
                  document.getElementById(`canonical-feature-tab-${next.id}`)?.focus();
                }
              }}
            >
              <span className={styles.tabLabel}>{feature.label}</span>
            </button>
          ))}
          {tabs.length === 0 ? <p className={styles.status} role="status">No canonical features match this search.</p> : null}
        </div>
      </aside>

      <div className={styles.content}>
        <div className={styles.contentHeader}>
          <div>
            <h2>{activeTab?.label ?? 'No feature selected'}</h2>
            <p>Each panel keeps the owning feature's real persistence, validation, and recovery behavior.</p>
          </div>
          {activeTab?.hostCapability ? <span className={styles.status}>Host capability: {activeTab.hostCapability}</span> : null}
        </div>
        <div id="canonical-feature-tabpanel" className={styles.panel} role="tabpanel" aria-live="polite" data-active-feature={activeTab?.id ?? 'none'} aria-labelledby={activeTab ? `canonical-feature-tab-${activeTab.id}` : undefined}>
          {activeTab?.id === 'offline-documentation' ? <DocumentationBrowserView /> : null}
          {activeTab?.id === 'changelog' ? <ChangelogDialog open initialOpen /> : null}
          {activeTab?.id === 'status-hub' ? <StatusHubPanel client={resolvedStatusClient} fallback={resolvedStatusFallback} labels={statusLabels} mountId="C0" /> : null}
          {activeTab?.id === 'file-converter' ? <FileConverterView /> : null}
          {activeTab?.id === 'ollama-suite' ? <OllamaSuiteManager /> : null}
          {activeTab?.id === 'authenticator' ? <AuthenticatorDestination bridge={authenticatorBridge} /> : null}
          {activeTab?.id === 'unlock-ladder'
            ? unlockBridge
              ? <UnlockLadder lockoutId={lockoutId} bridge={unlockBridge} />
              : unavailableCard(activeTab, 'The unlock bridge is not exposed by this host. Connect the host bridge before starting a lockout challenge.')
            : null}
          {activeTab?.id === 'notifications-history' ? <div className={styles.capabilityCard}><NotificationCenter /><Button type="button" onClick={() => openVersionHistory({ domainId: 'settings' })}>Open local history</Button><VersionHistoryDialog /></div> : null}
          {activeTab?.id === 'exports-bulk-actions' ? <><FileConverterView /><div className={styles.capabilityCard}><Button type="button" onClick={() => openVersionHistory()}>Open exportable local history</Button><NotificationCenter /></div><VersionHistoryDialog /></> : null}
          {activeTab?.id === 'destructive-confirmation'
            ? <div className={styles.capabilityCard}>
              <h3>Destructive confirmation</h3>
              <p>This session-only record exercises the real two-key and full-range confirmation surface.</p>
              <p role="status">Preview record: {previewRecordPresent ? 'available' : 'deleted'}</p>
              <div className={styles.actions}>
                <Button type="button" disabled={!previewRecordPresent} onClick={() => setDestructiveOpen(true)}>Delete preview record</Button>
                {!previewRecordPresent ? <Button type="button" onClick={() => setPreviewRecordPresent(true)}>Restore preview record</Button> : null}
              </div>
              {destructiveOpen ? <DestructiveGate action="Delete preview record" target="Canonical feature hub preview record" items={['One session-only preview record']} detail="The record exists only in this mounted hub and can be restored after deletion." irreversible={false} onConfirm={() => { setPreviewRecordPresent(false); return true; }} onClose={onDestructiveClose} /> : null}
            </div>
            : null}
          {!activeTab ? <p role="status">No canonical features match this search.</p> : null}
        </div>
      </div>
    </section>
  );
}

import { useEffect } from 'react';

import type { StartupSurpriseCandidate } from './startup-surprise';
import styles from './StartupSurpriseSurface.module.css';

export interface StartupSurpriseSurfaceProps {
  candidate: StartupSurpriseCandidate | null;
  schoolModeEnabled: boolean;
  firstRun?: boolean;
  errorPath?: boolean;
  updateInProgress?: boolean;
  userMidTask?: boolean;
  autoDismissMs?: number;
  onDismiss: () => void;
}

/**
 * A non-blocking, catalog-injected surprise surface. The caller owns the
 * launch draw, so this component never rolls its own probability or fires
 * twice. Prohibited contexts stay silent and School mode suppresses the
 * feature without mentioning it.
 */
export function StartupSurpriseSurface({
  candidate,
  schoolModeEnabled,
  firstRun = false,
  errorPath = false,
  updateInProgress = false,
  userMidTask = false,
  autoDismissMs = 6_000,
  onDismiss,
}: StartupSurpriseSurfaceProps) {
  useEffect(() => {
    if (!candidate || schoolModeEnabled || firstRun || errorPath || updateInProgress || userMidTask) return undefined;
    const timeout = Number.isFinite(autoDismissMs) ? Math.max(1_000, autoDismissMs) : 6_000;
    const timer = window.setTimeout(onDismiss, timeout);
    return () => window.clearTimeout(timer);
  }, [autoDismissMs, candidate, errorPath, firstRun, onDismiss, schoolModeEnabled, updateInProgress, userMidTask]);

  if (!candidate || schoolModeEnabled || firstRun || errorPath || updateInProgress || userMidTask) return null;
  return (
    <aside className={styles.surface} role="status" aria-live="polite" data-testid="startup-surprise">
      <img className={styles.image} src={candidate.imageUrl} alt={candidate.nameEn + ' · ' + candidate.nameZhHant} />
      <div className={styles.copy}>
        <strong>{candidate.nameEn} · {candidate.nameZhHant}</strong>
        <span>A small local surprise for this launch.</span>
      </div>
      <button type="button" className={styles.dismiss} onClick={onDismiss} aria-label="Dismiss startup surprise">Dismiss</button>
    </aside>
  );
}

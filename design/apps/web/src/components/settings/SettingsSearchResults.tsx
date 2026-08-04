// What the settings search bar found, and — the part that matters — where.
//
// A filtered settings surface has one characteristic failure: the user types a
// word, the tab they happen to be looking at has nothing matching it, and they
// conclude the setting does not exist. It is one tab over. So this panel never
// reports a bare count; when any hit sits on another tab it says so in words,
// and every such row carries the name of the tab it lives on.

import { useT } from '../../i18n';
import type { SettingsSection } from '../SettingsDialog';
import type { SettingsSearchHit } from './settingsSearchMatch';
import styles from './SettingsTabs.module.css';

export interface SettingsSearchResultsProps {
  hits: readonly SettingsSearchHit[];
  activeSection: SettingsSection;
  elsewhere: number;
  sectionLabel: (section: SettingsSection) => string;
  /** Switch to the hit's tab and reveal its control. */
  onPick: (hit: SettingsSearchHit) => void;
}

export function SettingsSearchResults({
  hits,
  activeSection,
  elsewhere,
  sectionLabel,
  onPick,
}: SettingsSearchResultsProps) {
  const t = useT();

  if (hits.length === 0) {
    return (
      <div className={styles.results} data-testid="settings-search-results">
        <p className={styles.resultsEmpty} role="status">
          {t('settings.searchNoMatches')}
        </p>
      </div>
    );
  }

  return (
    <div
      className={styles.results}
      data-testid="settings-search-results"
      aria-label={t('settings.searchAria')}
    >
      <p className={styles.resultsHead} role="status">
        <span className={styles.resultsCount}>
          {t('settings.searchResultsHeading', { count: hits.length })}
        </span>
        {elsewhere > 0 ? (
          <span className={styles.resultsElsewhere} data-testid="settings-search-elsewhere">
            {t('settings.searchElsewhereNote', { count: elsewhere })}
          </span>
        ) : null}
      </p>
      <ul className={styles.resultsList}>
        {hits.map((hit) => (
          <li key={hit.entry.id}>
            <button
              type="button"
              className={styles.resultRow}
              data-section={hit.section}
              data-anchor={hit.entry.id}
              onClick={() => onPick(hit)}
            >
              <span className={styles.resultTitle}>{hit.title}</span>
              {hit.hint ? <span className={styles.resultHint}>{hit.hint}</span> : null}
              {hit.section !== activeSection ? (
                <span className={styles.resultBadge}>
                  {t('settings.searchOtherTabBadge', { section: sectionLabel(hit.section) })}
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

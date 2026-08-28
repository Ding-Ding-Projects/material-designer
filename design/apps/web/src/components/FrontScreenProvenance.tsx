import { useI18n, useT } from '../i18n';
import type { AppVersionInfo } from '../types';
import {
  formatFrontScreenUpdatedAt,
  resolveFrontScreenProvenance,
} from '../lib/front-screen-provenance';
import styles from './FrontScreenProvenance.module.css';

interface Props {
  info: AppVersionInfo | null;
  loading?: boolean;
}

/**
 * The first factual card in the shell. It is mounted before navigation,
 * settings, About, or authentication so a person can identify the exact
 * running package before taking another action.
 */
export function FrontScreenProvenance({ info, loading = false }: Props) {
  const t = useT();
  const { locale } = useI18n();
  const resolved = loading
    ? { version: null, provenance: null }
    : resolveFrontScreenProvenance(info);
  const unavailable = t('statusBar.notSet');
  const version = resolved.version ?? unavailable;
  const updatedAt = formatFrontScreenUpdatedAt(resolved.provenance, locale) ?? unavailable;
  const verified = resolved.provenance != null;

  return (
    <section
      className={styles.card}
      data-front-screen-provenance="true"
      data-provenance-status={loading ? 'loading' : verified ? 'verified' : 'unavailable'}
      aria-label={`${t('settings.appVersion')} and ${t('liveArtifact.refresh.factLastUpdated')}`}
    >
      <dl className={styles.list}>
        <div className={styles.item} data-provenance-field="version">
          <dt>{t('settings.appVersion')}</dt>
          <dd data-provenance-value="version">{version}</dd>
        </div>
        <div className={styles.item} data-provenance-field="updated-at">
          <dt>{t('liveArtifact.refresh.factLastUpdated')}</dt>
          <dd data-provenance-value="updated-at">{updatedAt}</dd>
        </div>
      </dl>
      <span className={styles.status} role={verified ? 'status' : 'alert'}>
        {loading
          ? t('common.loading')
          : verified
          ? info?.packaged
            ? t('settings.runtimePackaged')
            : t('settings.runtimeDevelopment')
          : unavailable}
      </span>
    </section>
  );
}

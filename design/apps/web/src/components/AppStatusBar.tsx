// The application status bar.
//
// The last row of the shell, and the last unchecked box of the frameless
// window contract in `mockups/open-design-m3`: a 28px strip carrying the
// live daemon state, the model a run would use, the active design system,
// and the two appearance values a user is most likely to have changed and
// least likely to remember — UI scale and density.
//
// It reports; it does not act. Nothing here is clickable, so nothing here
// needs the decorative-looking-UI treatment that a fake control would: the
// strip is a readout, and it is styled like one.

import { useT } from '../i18n';
import type { AppConfig, DesignSystemSummary } from '../types';
import { useAppearancePreferences } from './appearance/store';
import styles from './AppStatusBar.module.css';

interface Props {
  /** True while the local daemon is answering. */
  daemonLive: boolean;
  config: AppConfig;
  designSystems: DesignSystemSummary[];
}

/**
 * What a run would actually use, said honestly.
 *
 * In API mode that is the configured model string. In local-CLI mode the
 * agent owns its own default, so a per-agent override is the model and the
 * absence of one means "whatever this CLI picks" — which the agent's own id
 * describes better than the literal word `default` would.
 */
function resolveModelLabel(config: AppConfig): string | null {
  if (config.mode === 'api') {
    const model = config.model?.trim();
    return model ? model : null;
  }
  const agentId = config.agentId;
  if (!agentId) return null;
  const choice = config.agentModels?.[agentId]?.model;
  return choice && choice !== 'default' ? choice : agentId;
}

export function AppStatusBar({ daemonLive, config, designSystems }: Props) {
  const t = useT();
  const { preferences } = useAppearancePreferences();

  const notSet = t('statusBar.notSet');

  const modelLabel = resolveModelLabel(config) ?? notSet;
  const modeLabel = config.mode === 'api' ? t('settings.modeApi') : t('settings.modeDaemon');

  const designSystemLabel =
    designSystems.find((entry) => entry.id === config.designSystemId)?.title ?? notSet;

  // The contract's appearance card works in whole percent, and so does the
  // control that writes this value; the stored factor is unitless, so it is
  // converted here rather than stored twice.
  const scalePercent = Math.round(preferences.uiScale * 100);
  const densityLabel =
    preferences.density === 'compact'
      ? t('statusBar.densityCompact')
      : preferences.density === 'comfortable'
        ? t('statusBar.densityComfortable')
        : t('statusBar.densityDefault');

  const daemonLabel = daemonLive ? t('statusBar.daemonLive') : t('statusBar.daemonOffline');

  return (
    <footer
      className={styles.bar}
      // The shell's stylesheet keys off this rather than repeating the
      // question of whether the strip is mounted.
      data-app-status-bar="true"
      aria-label={t('statusBar.aria')}
    >
      {/*
        The one genuinely live value on the strip, so it is the one that gets
        a live region. Announcing the scale or the density here would repeat
        back to the user what they had just set, which is noise; a daemon
        that has gone away is news.
      */}
      <span className={styles.item} role="status">
        <span
          className={`${styles.dot} ${daemonLive ? styles.dotLive : styles.dotOffline}`}
          aria-hidden="true"
        />
        {daemonLabel}
      </span>
      <span className={styles.item} title={`${modelLabel} · ${modeLabel}`}>
        {modelLabel} · {modeLabel}
      </span>
      <span className={styles.item}>{t('statusBar.designSystem', { name: designSystemLabel })}</span>
      <div className={styles.spacer} />
      <span className={`${styles.item} ${styles.appearanceItem}`}>
        {t('statusBar.uiScale', { percent: scalePercent })}
      </span>
      <span className={`${styles.item} ${styles.appearanceItem}`}>
        {t('statusBar.density', { level: densityLabel })}
      </span>
    </footer>
  );
}

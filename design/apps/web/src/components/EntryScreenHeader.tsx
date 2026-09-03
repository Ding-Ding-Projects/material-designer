import { useCallback } from 'react';

import type { Dict } from '../i18n/types';
import { useT } from '../i18n';
import { applyAppearanceToDocument } from '../state/appearance';
import type { AppConfig, AppTheme } from '../types';
import type { EntryHomeView } from '../router';
import { EntryTopbarSearch } from './EntryTopbarSearch';
import { MaterialSymbol, type MaterialSymbolName } from './MaterialSymbol';
import { MessageCenter } from './MessageCenter';
import styles from './EntryScreenHeader.module.css';

/**
 * The screen header the mockup draws above every entry screen: the screen's
 * title, the search pill (with its regex toggle and builder), the message
 * centre bell, the theme toggle and the account avatar.
 *
 * It is one component used by `EntryShell` for every view, so the controls
 * sit in the same place on every screen and the title is the one place a
 * screen is named — except on the screens whose section already carries an
 * `<h1>` of its own (projects, library, plugins, integrations, community),
 * where the header leaves the title to them rather than naming the screen
 * twice in the accessibility tree.
 */

/** The heading each view gets. A view absent here has no header title. */
const TITLE_KEY: Partial<Record<EntryHomeView, keyof Dict>> = {
  home: 'entry.navHome',
  'design-systems': 'entry.navDesignSystems',
  tasks: 'entry.navTasks',
  brands: 'entry.navBrands',
  drafts: 'entry.navDrafts',
  'all-projects': 'entry.navAllProjects',
  members: 'entry.navMembers',
  board: 'entry.navBoard',
  'workspace-settings': 'entry.navWorkspaceSettings',
  handoff: 'handoff.title',
  documentation: 'entry.navDocumentation',
};

/** Views whose section renders its own `entry-section__title`. */
const SECTION_OWNS_TITLE: ReadonlySet<EntryHomeView> = new Set<EntryHomeView>([
  'projects',
  'library',
  'plugins',
  'integrations',
  'community',
]);

const THEME_CYCLE: readonly AppTheme[] = ['system', 'light', 'dark'];

const THEME_GLYPH: Record<AppTheme, MaterialSymbolName> = {
  system: 'routine',
  light: 'light_mode',
  dark: 'dark_mode',
};

const THEME_LABEL: Record<AppTheme, keyof Dict> = {
  system: 'settings.themeSystem',
  light: 'settings.themeLight',
  dark: 'settings.themeDark',
};

interface Props {
  view: EntryHomeView;
  config: AppConfig;
  onConfigPersist: (next: AppConfig) => Promise<void> | void;
  onOpenSettings: () => void;
  onOpenNotificationSettings?: () => void;
}

export function EntryScreenHeader({
  view,
  config,
  onConfigPersist,
  onOpenSettings,
  onOpenNotificationSettings,
}: Props) {
  const t = useT();
  const theme: AppTheme = config.theme ?? 'system';

  // The same cycle the command palette runs: system → light → dark. Paint
  // first so the flip is instant, then persist through the app's own writer.
  const cycleTheme = useCallback(() => {
    const index = THEME_CYCLE.indexOf(theme);
    const next = THEME_CYCLE[(index + 1) % THEME_CYCLE.length] ?? 'system';
    applyAppearanceToDocument({ theme: next, accentColor: config.accentColor });
    void onConfigPersist({ ...config, theme: next });
  }, [config, onConfigPersist, theme]);

  if (view === 'onboarding') return null;

  const titleKey = SECTION_OWNS_TITLE.has(view) ? undefined : TITLE_KEY[view];
  const themeLabel = `${t('entryHeader.themeToggle')} · ${t(THEME_LABEL[theme])}`;
  const accountLabel = t('entryHeader.account');

  return (
    <header className={styles.header} data-testid="entry-screen-header" data-view={view}>
      {titleKey ? <h1 className={styles.title}>{t(titleKey)}</h1> : null}
      <div className={styles.spacer} />
      <EntryTopbarSearch />
      <span className={styles.bell} data-testid="entry-screen-header-bell">
        <MessageCenter onOpenNotificationSettings={onOpenNotificationSettings} />
      </span>
      <button
        type="button"
        className={styles.iconButton}
        onClick={cycleTheme}
        aria-label={themeLabel}
        title={themeLabel}
        data-testid="entry-screen-header-theme"
        data-theme-choice={theme}
      >
        <MaterialSymbol name={THEME_GLYPH[theme]} size={24} />
      </button>
      <button
        type="button"
        className={styles.avatar}
        onClick={onOpenSettings}
        aria-label={accountLabel}
        title={accountLabel}
        data-testid="entry-screen-header-account"
      >
        <MaterialSymbol name="account_circle" size={24} />
      </button>
    </header>
  );
}

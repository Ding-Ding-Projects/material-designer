// Material Design 3 navigation rail for the entry view.
//
// The first slot is the brand logo, followed by the primary destinations
// users expect to keep in reach: New project, home, projects, brand kit,
// automations, plugins, and integrations. Footer controls are reserved for
// lower-frequency support affordances such as the help launcher.
// Language switching and other account-scoped controls live behind the
// floating settings cog in the top-right corner of the main content.
//
// The rail is persistent, which is what makes it a rail rather than a
// drawer: it is on screen in both of its states, and the toggle switches
// between the 88px icon column and the 260px labelled column. It used to
// switch between shown and hidden, and because a fresh install has no stored
// preference, the default state rendered no navigation at all.

import type { ReactNode } from 'react';
import { EntryHelpMenu } from './EntryHelpMenu';
import { Icon } from './Icon';
import { useT } from '../i18n';
import { LIBRARY_UI_VISIBLE } from '../features/libraryUi';

export type EntryView =
  | 'home'
  | 'onboarding'
  | 'projects'
  | 'tasks'
  | 'plugins'
  | 'design-systems'
  | 'library'
  | 'brands'
  | 'integrations';

interface Props {
  view: EntryView;
  onViewChange: (view: EntryView) => void;
  onNewProject: () => void;
  newProjectDisabled?: boolean;
  /**
   * True when the rail is expanded to its labelled width. False is the
   * icon-only rail — still on screen, still operable, just narrower.
   */
  open: boolean;
  /** Narrow the rail back to icons. */
  onClose: () => void;
  /** Widen the rail to its labelled form. */
  onOpen: () => void;
}

interface NavButtonProps {
  active?: boolean;
  ariaLabel: string;
  tooltip: string;
  onClick: () => void;
  disabled?: boolean;
  testId?: string;
  children: ReactNode;
}

function NavButton({ active, ariaLabel, tooltip, onClick, disabled, testId, children }: NavButtonProps) {
  return (
    <button
      type="button"
      className={`entry-nav-rail__btn${active ? ' is-active' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-current={active ? 'page' : undefined}
      data-tooltip={tooltip}
      {...(testId ? { 'data-testid': testId } : {})}
    >
      {children}
      {/* Always rendered; the collapsed rail hides it in CSS. Mounting it
          only when expanded would rebuild the button and drop keyboard
          focus at exactly the moment a keyboard user widened the rail. The
          button's `aria-label` above is the accessible name, so this span
          is never announced twice. */}
      <span className="entry-nav-rail__label">{ariaLabel}</span>
    </button>
  );
}

export function EntryNavRail({
  view,
  onViewChange,
  onNewProject,
  newProjectDisabled = false,
  open,
  onClose,
  onOpen,
}: Props) {
  const t = useT();
  const brandLabel = t('app.brand');
  const homeLabel = t('entry.navHome');
  const isHome = view === 'home';

  // Once opened the rail stays docked (Manus-style); navigating between
  // destinations no longer collapses it.
  const selectView = (next: EntryView) => {
    onViewChange(next);
  };

  // No `inert` and no `aria-hidden` in either state. Both were correct while
  // collapsing meant hiding — invisible controls must leave the tab order —
  // and both are wrong now: the collapsed rail is a visible navigation
  // landmark, and hiding a visible control from assistive technology while
  // sighted users can click it is exactly the defect those attributes exist
  // to prevent elsewhere.
  return (
    <nav
      className={`entry-nav-rail${open ? ' is-open' : ''}`}
      aria-label={t('entry.navLandmark')}
      data-rail-expanded={open ? 'true' : 'false'}
    >
      <div className="entry-nav-rail__group">
        <div className="entry-nav-rail__brand">
          <button
            type="button"
            className="entry-nav-rail__logo"
            onClick={() => selectView('home')}
            aria-label={brandLabel}
            data-testid="entry-nav-logo"
          >
            <span
              className="entry-nav-rail__logo-img od-brand-glyph"
              aria-hidden="true"
            />
          </button>
          {/* This used to call `onClose` unconditionally and was always
              labelled "Collapse sidebar" — in a rail that starts collapsed. So
              on a fresh profile the first thing a user clicks here sets `false`
              to `false`: nothing moves, nothing is announced, and the control
              reads as broken because in that state it is.

              It is a toggle, so it says which way it goes and goes that way.
              `aria-expanded` carries the state for assistive technology; the
              label carries the *action*, which is why it flips rather than
              describing where the rail currently is. */}
          <button
            type="button"
            className="entry-nav-rail__collapse"
            onClick={open ? onClose : onOpen}
            aria-label={open ? t('entry.navCollapse') : t('entry.navExpand')}
            aria-expanded={open}
            title={open ? t('entry.navCollapse') : t('entry.navExpand')}
            data-testid="entry-nav-collapse"
          >
            <Icon name="panel-left" size={20} />
          </button>
        </div>
        <div className="entry-nav-rail__logo-divider" role="separator" aria-hidden="true" />
        <NavButton
          ariaLabel={t('entry.navNewProject')}
          tooltip={t('entry.navNewProject')}
          onClick={onNewProject}
          disabled={newProjectDisabled}
          testId="entry-nav-new-project"
        >
          <Icon name="plus" size={18} />
        </NavButton>
        <NavButton
          active={isHome}
          ariaLabel={homeLabel}
          tooltip={homeLabel}
          onClick={() => selectView('home')}
          testId="entry-nav-home"
        >
          <Icon name="home" size={18} />
        </NavButton>
        <NavButton
          active={view === 'projects'}
          ariaLabel={t('entry.navProjects')}
          tooltip={t('entry.navProjects')}
          onClick={() => selectView('projects')}
          testId="entry-nav-projects"
        >
          <Icon name="folder" size={18} />
        </NavButton>
        <NavButton
          active={view === 'design-systems'}
          ariaLabel={t('entry.navDesignSystems')}
          tooltip={t('entry.navDesignSystems')}
          onClick={() => selectView('design-systems')}
          testId="entry-nav-design-systems"
        >
          <Icon name="palette" size={18} />
        </NavButton>
        {LIBRARY_UI_VISIBLE ? (
          <NavButton
            active={view === 'library'}
            ariaLabel="Library"
            tooltip="Library"
            onClick={() => selectView('library')}
            testId="entry-nav-library"
          >
            <Icon name="layers-filled" size={18} />
          </NavButton>
        ) : null}
        <NavButton
          active={view === 'tasks'}
          ariaLabel={t('entry.navTasks')}
          tooltip={t('entry.navTasks')}
          onClick={() => selectView('tasks')}
          testId="entry-nav-tasks"
        >
          <Icon name="kanban" size={18} />
        </NavButton>
        <NavButton
          active={view === 'plugins'}
          ariaLabel={t('entry.navPlugins')}
          tooltip={t('entry.navPlugins')}
          onClick={() => selectView('plugins')}
          testId="entry-nav-plugins"
        >
          <Icon name="grid" size={18} />
        </NavButton>
        <NavButton
          active={view === 'integrations'}
          ariaLabel={t('entry.navIntegrations')}
          tooltip={t('entry.navIntegrations')}
          onClick={() => selectView('integrations')}
          testId="entry-nav-integrations"
        >
          <Icon name="link" size={18} />
        </NavButton>
      </div>
      <div className="entry-nav-rail__footer">
        <div className="entry-nav-rail__divider" role="separator" />
        <EntryHelpMenu />
      </div>
    </nav>
  );
}

// The settings tab strip.
//
// Browser-style tabs, one per settings section, with the search field for the
// whole surface sitting in the same row. Three things here are load-bearing and
// easy to lose in a later edit:
//
//   1. Roving focus. Exactly one tab is in the page's tab order; the arrow keys
//      move between tabs. A seventeen-stop tab strip that puts every tab in the
//      sequence makes the keyboard route to the panel below unusable.
//   2. Nothing is ever clipped away. The strip scrolls horizontally, so a tab
//      that does not fit is still reachable by scrolling, and the button beside
//      it lists every section regardless — including the ones currently out of
//      view, which it marks.
//   3. The menu is portalled. `.modal-body` clips its overflow, so a menu
//      rendered in place would be cut off at the strip's own bottom edge.

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

import { useT } from '../../i18n';
import {
  createAttemptBudget,
  interceptLockedActivation,
  type ToyLockPolicy,
} from '../../security/toy-lock-core';
import { Icon, type IconName } from '../Icon';
import { RegexSearchField } from '../regex/RegexSearchField';
import { useRegexSearch } from '../regex/useRegexSearch';
import type { SettingsSection } from '../SettingsDialog';
import {
  ToyLockAuthenticationPopover,
  type ToyLockVerificationRequest,
} from '../ToyLockAuthenticationPopover';
import { SETTINGS_TABS, type SettingsTabDef } from './settingsTabs';
import styles from './SettingsTabs.module.css';

/** Shared by every tab and by the panel they all control. */
export const SETTINGS_TABPANEL_ID = 'settings-tabpanel';

/** The edge where this surface docks its settings navigation. */
export type SettingsTabDockEdge = 'left' | 'right' | 'top' | 'bottom';

export const SETTINGS_TAB_DOCK_STORAGE_KEY = 'od.settings.tabs.dockEdge';

const SETTINGS_TAB_DOCK_EDGES: readonly SettingsTabDockEdge[] = [
  'left',
  'right',
  'top',
  'bottom',
];

export function readSettingsTabDockEdge(): SettingsTabDockEdge {
  if (typeof window === 'undefined') return 'left';
  try {
    const value = window.localStorage.getItem(SETTINGS_TAB_DOCK_STORAGE_KEY);
    return SETTINGS_TAB_DOCK_EDGES.includes(value as SettingsTabDockEdge)
      ? (value as SettingsTabDockEdge)
      : 'left';
  } catch {
    return 'left';
  }
}

export function writeSettingsTabDockEdge(edge: SettingsTabDockEdge): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SETTINGS_TAB_DOCK_STORAGE_KEY, edge);
  } catch {
    // Private-mode storage must not stop the settings surface moving.
  }
}

export function settingsTabId(section: SettingsSection): string {
  return `settings-tab-${section}`;
}

const MENU_WIDTH = 248;
const VIEWPORT_MARGIN = 12;

interface MenuAnchor {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  placement: 'top' | 'bottom';
  bottom?: number;
}

export interface SettingsTabStripProps {
  activeSection: SettingsSection;
  onSelect: (section: SettingsSection) => void;
  /**
   * Per-tab hit counts while a search is running, or `null` when it is not.
   * `null` and "an empty map" mean different things: no search versus a search
   * that matched nothing, and the strip renders those differently.
   */
  matchCounts: ReadonlyMap<SettingsSection, number> | null;
  /** The surface's search field. Rendered in the strip row, beside the tabs. */
  searchField: ReactNode;
  tabs?: readonly SettingsTabDef[];
  /**
   * Controlled lock state for the tabs this strip renders. Credential storage
   * stays with the host. A locked tab remains focusable and activation-capable
   * so it can open authentication without running the protected selection.
   */
  toyLocks?: ReadonlyMap<SettingsSection, SettingsTabToyLock>;
  /** Factor verification supplied by the credential-owning host. */
  verifyToyLockFactor?: (
    request: ToyLockVerificationRequest,
  ) => boolean | Promise<boolean>;
}

export interface SettingsTabToyLock {
  readonly locked: boolean;
  readonly policy: ToyLockPolicy;
}

interface PendingTabAuthentication {
  readonly section: SettingsSection;
  readonly targetId: string;
  readonly targetLabel: string;
  readonly policy: ToyLockPolicy;
  readonly anchor: HTMLButtonElement;
  readonly closeOverflowOnSuccess: boolean;
  readonly focusTabOnSuccess: boolean;
}

const EMPTY_SETTINGS_TAB_TOY_LOCKS: ReadonlyMap<SettingsSection, SettingsTabToyLock> = new Map();
const REFUSE_UNCONFIGURED_TOY_LOCK_FACTOR = () => false;

function sameSections(a: ReadonlySet<SettingsSection>, b: ReadonlySet<SettingsSection>): boolean {
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}

export function SettingsTabStrip({
  activeSection,
  onSelect,
  matchCounts,
  searchField,
  tabs = SETTINGS_TABS,
  toyLocks = EMPTY_SETTINGS_TAB_TOY_LOCKS,
  verifyToyLockFactor = REFUSE_UNCONFIGURED_TOY_LOCK_FACTOR,
}: SettingsTabStripProps) {
  const t = useT();
  const menuId = useId();
  const listRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const overflowRef = useRef<HTMLButtonElement | null>(null);
  const tabNodes = useRef(new Map<SettingsSection, HTMLButtonElement>());
  const [outOfView, setOutOfView] = useState<ReadonlySet<SettingsSection>>(
    () => new Set<SettingsSection>(),
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<MenuAnchor | null>(null);
  const [contextMenuPoint, setContextMenuPoint] = useState<{ x: number; y: number } | null>(null);
  const [menuQuery, setMenuQuery] = useState('');
  const [pendingAuthentication, setPendingAuthentication] =
    useState<PendingTabAuthentication | null>(null);
  const menuSearch = useRegexSearch(menuQuery, setMenuQuery);
  const [dockEdge, setDockEdge] = useState<SettingsTabDockEdge>(readSettingsTabDockEdge);

  const filteredTabs = tabs.filter((tab) =>
    menuSearch.matches(`${t(tab.titleKey)} ${t(tab.hintKey)}`),
  );
  const filteredDockEdges = SETTINGS_TAB_DOCK_EDGES.filter((edge) =>
    menuSearch.matches(`${t('settings.tabsOverflow')} ${edge}`),
  );

  const registerTab = useCallback((section: SettingsSection, node: HTMLButtonElement | null) => {
    if (node) tabNodes.current.set(section, node);
    else tabNodes.current.delete(section);
  }, []);

  // Which tabs are currently scrolled out of the strip. Measured rather than
  // computed, so it stays correct at any zoom, density or translated label
  // length. In a zero-width environment (jsdom, a hidden dialog) measurement is
  // meaningless and reports nothing hidden rather than everything.
  const measure = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    const bounds = list.getBoundingClientRect();
    const next = new Set<SettingsSection>();
    if (bounds.width > 0) {
      for (const [section, node] of tabNodes.current) {
        const rect = node.getBoundingClientRect();
        if (rect.width <= 0) continue;
        if (rect.left < bounds.left - 1 || rect.right > bounds.right + 1) next.add(section);
      }
    }
    setOutOfView((current) => (sameSections(current, next) ? current : next));
  }, []);

  useEffect(() => {
    measure();
    const list = listRef.current;
    if (typeof window === 'undefined') return;
    window.addEventListener('resize', measure);
    list?.addEventListener('scroll', measure, { passive: true });
    return () => {
      window.removeEventListener('resize', measure);
      list?.removeEventListener('scroll', measure);
    };
  }, [measure, tabs]);

  // Keep the selected tab visible after a switch made from somewhere other than
  // the strip — the overflow menu, the search results, or the command palette.
  useEffect(() => {
    const node = tabNodes.current.get(activeSection);
    if (node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    measure();
  }, [activeSection, measure]);

  const measureMenu = useCallback(() => {
    const button = overflowRef.current;
    if ((!button && !contextMenuPoint) || typeof window === 'undefined') return;
    const buttonRect = button?.getBoundingClientRect();
    const viewportWidth = Math.max(1, window.innerWidth);
    const viewportHeight = Math.max(1, window.innerHeight);
    const width = Math.max(1, Math.min(MENU_WIDTH, viewportWidth - VIEWPORT_MARGIN * 2));
    const horizontalMargin = viewportWidth >= width + VIEWPORT_MARGIN * 2 ? VIEWPORT_MARGIN : 0;
    const maxLeft = Math.max(horizontalMargin, viewportWidth - width - horizontalMargin);
    const anchorRight = contextMenuPoint
      ? Math.min(viewportWidth, Math.max(0, contextMenuPoint.x))
      : Math.min(viewportWidth, Math.max(0, buttonRect?.right ?? 0));
    const left = contextMenuPoint
      ? Math.min(maxLeft, Math.max(horizontalMargin, anchorRight - width / 2))
      : Math.min(maxLeft, Math.max(horizontalMargin, anchorRight - width));
    // A trigger can be in a scrolled-away strip while the menu is opening.
    // Measure the visible edge, not the stale document coordinate, or the
    // fixed card can be born with a negative top/bottom value.
    const anchorTop = contextMenuPoint
      ? Math.min(viewportHeight, Math.max(0, contextMenuPoint.y))
      : Math.min(viewportHeight, Math.max(0, buttonRect?.top ?? 0));
    const anchorBottom = contextMenuPoint
      ? Math.min(viewportHeight, Math.max(0, contextMenuPoint.y))
      : Math.min(viewportHeight, Math.max(0, buttonRect?.bottom ?? 0));
    const spaceBelow = Math.max(0, viewportHeight - anchorBottom - VIEWPORT_MARGIN - 4);
    const spaceAbove = Math.max(0, anchorTop - VIEWPORT_MARGIN - 4);
    const placement = spaceBelow >= 240 || spaceBelow >= spaceAbove ? 'bottom' : 'top';
    const maxHeight = Math.max(1, placement === 'top' ? spaceAbove : spaceBelow);
    const maxTop = Math.max(0, viewportHeight - maxHeight);
    setMenuAnchor({
      top: placement === 'bottom' ? Math.min(maxTop, Math.max(0, anchorBottom + 4)) : 0,
      left,
      width,
      maxHeight,
      placement,
      bottom: placement === 'top'
        ? Math.min(maxTop, Math.max(0, viewportHeight - anchorTop + 4))
        : undefined,
    });
  }, [contextMenuPoint]);

  useEffect(() => {
    if (!menuOpen || typeof window === 'undefined') return;
    measureMenu();
    const onViewportChange = () => measureMenu();
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);
    return () => {
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
    };
  }, [contextMenuPoint, menuOpen, measureMenu]);

  useEffect(() => {
    if (!menuOpen || typeof document === 'undefined') return;
    const isInside = (target: EventTarget | null) => {
      if (!(target instanceof Node)) return false;
      return Boolean(menuRef.current?.contains(target) || overflowRef.current?.contains(target));
    };
    const onPointerDown = (event: MouseEvent) => {
      // An overflow-triggered authentication prompt is portalled outside the
      // menu. Keep its originating item mounted until the prompt completes or
      // is cancelled so focus restoration always has a live target.
      if (!pendingAuthentication && !isInside(event.target)) {
        setMenuOpen(false);
        setMenuQuery('');
        setContextMenuPoint(null);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [menuOpen, pendingAuthentication]);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    setMenuQuery('');
    setContextMenuPoint(null);
  }, []);

  const toggleMenu = useCallback(() => {
    if (menuOpen) {
      closeMenu();
      return;
    }
    setMenuQuery('');
    setContextMenuPoint(null);
    setMenuOpen(true);
  }, [closeMenu, menuOpen]);

  const moveMenuFocus = useCallback(
    (offset: number) => {
      const items = Array.from(
        menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
      );
      if (items.length === 0) return;
      const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
      const nextIndex = currentIndex < 0
        ? offset > 0 ? 0 : items.length - 1
        : (currentIndex + offset + items.length) % items.length;
      items[nextIndex]?.focus();
    },
    [],
  );

  const focusMenuEdge = useCallback((last: boolean) => {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
    );
    (last ? items[items.length - 1] : items[0])?.focus();
  }, []);

  const completeTabSelection = useCallback((
    section: SettingsSection,
    closeOverflowOnSuccess: boolean,
    focusTabOnSuccess: boolean,
  ) => {
    if (closeOverflowOnSuccess) closeMenu();
    onSelect(section);
    if (focusTabOnSuccess) {
      // The authentication popover returns focus to its own anchor after this
      // callback. Defer the final tab focus so an overflow item that is removed
      // by closeMenu cannot win that race and strand focus on the document.
      queueMicrotask(() => tabNodes.current.get(section)?.focus?.());
    }
  }, [closeMenu, onSelect]);

  const requestTabSelection = useCallback((
    tab: SettingsTabDef,
    anchor: HTMLButtonElement,
    closeOverflowOnSuccess: boolean,
    focusTabOnSuccess: boolean,
  ) => {
    const lock = toyLocks.get(tab.section);
    const targetId = settingsTabId(tab.section);
    const result = interceptLockedActivation(
      {
        targetId,
        policy: lock?.policy ?? 'password',
        locked: lock?.locked ?? false,
      },
      createAttemptBudget(),
      () => completeTabSelection(tab.section, closeOverflowOnSuccess, focusTabOnSuccess),
    );

    if (result.kind !== 'authentication-required') return;
    setPendingAuthentication({
      section: tab.section,
      targetId,
      targetLabel: t(tab.titleKey),
      policy: result.policy,
      anchor,
      closeOverflowOnSuccess,
      focusTabOnSuccess,
    });
  }, [completeTabSelection, t, toyLocks]);

  const focusTab = useCallback(
    (section: SettingsSection) => {
      const tab = tabs.find((candidate) => candidate.section === section);
      const node = tabNodes.current.get(section);
      if (!tab || !node) return;
      node.focus?.();
      requestTabSelection(tab, node, false, true);
    },
    [requestTabSelection, tabs],
  );

  const onTablistKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const index = tabs.findIndex((tab) => tab.section === activeSection);
      if (index < 0) return;
      let nextIndex: number | null = null;
      const forward = dockEdge === 'left' || dockEdge === 'right' ? 'ArrowDown' : 'ArrowRight';
      const backward = dockEdge === 'left' || dockEdge === 'right' ? 'ArrowUp' : 'ArrowLeft';
      if (event.key === forward) nextIndex = (index + 1) % tabs.length;
      else if (event.key === backward) nextIndex = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') nextIndex = 0;
      else if (event.key === 'End') nextIndex = tabs.length - 1;
      if (nextIndex === null) return;
      const next = tabs[nextIndex];
      if (!next) return;
      event.preventDefault();
      focusTab(next.section);
    },
    [activeSection, dockEdge, focusTab, tabs],
  );

  const selectDockEdge = useCallback((edge: SettingsTabDockEdge) => {
    setDockEdge(edge);
    writeSettingsTabDockEdge(edge);
  }, []);

  const dockIcon: Record<SettingsTabDockEdge, IconName> = {
    left: 'chevron-left',
    right: 'chevron-right',
    top: 'arrow-up',
    bottom: 'chevron-down',
  };

  const hiddenCount = outOfView.size;

  const menuStyle: CSSProperties = menuAnchor
    ? {
        position: 'fixed',
        left: menuAnchor.left,
        width: menuAnchor.width,
        maxHeight: menuAnchor.maxHeight,
        ...(menuAnchor.placement === 'top'
          ? { top: 'auto', bottom: menuAnchor.bottom }
          : { top: menuAnchor.top, bottom: 'auto' }),
      }
    : { position: 'fixed', top: 0, left: 0, width: MENU_WIDTH };

  return (
    <div
      className={styles.strip}
      data-settings-tabs-dock={dockEdge}
      onContextMenu={(event) => {
        // The edge controls are always visible, and this same filterable
        // menu is also the strip's keyboard and pointer context menu.
        event.preventDefault();
        setMenuQuery('');
        setContextMenuPoint({ x: event.clientX, y: event.clientY });
        setMenuOpen(true);
      }}
    >
      <div
        ref={listRef}
        className={styles.tablist}
        role="tablist"
        aria-label={t('settings.tabsAria')}
        aria-orientation={dockEdge === 'left' || dockEdge === 'right' ? 'vertical' : 'horizontal'}
        onKeyDown={onTablistKeyDown}
      >
        {tabs.map((tab) => {
          const active = tab.section === activeSection;
          const lock = toyLocks.get(tab.section);
          const locked = lock?.locked ?? false;
          const count = matchCounts ? (matchCounts.get(tab.section) ?? 0) : null;
          // Never dim the selected tab: it remains the user's current context
          // even when the query matches nothing inside it. The no-match state
          // is still exposed through the stable description below.
          const dimmed = count === 0 && !active;
          const tabId = settingsTabId(tab.section);
          const hintId = `${tabId}-hint`;
          const noMatchId = `${tabId}-no-match`;
          return (
            <button
              key={tab.section}
              ref={(node) => {
                registerTab(tab.section, node);
              }}
              type="button"
              role="tab"
              id={tabId}
              aria-selected={active}
              aria-disabled={locked || undefined}
              aria-controls={SETTINGS_TABPANEL_ID}
              aria-describedby={count === 0 ? `${hintId} ${noMatchId}` : hintId}
              tabIndex={active ? 0 : -1}
              data-section={tab.section}
              data-toy-lock-policy={locked ? lock?.policy : undefined}
              // `settings-nav-item` is retained deliberately: it is what the
              // existing settings e2e locators and hover-contrast guard match.
              className={`settings-nav-item ${styles.tab}${active ? ` active ${styles.tabActive}` : ''}${
                dimmed ? ` ${styles.tabNoMatch}` : ''
              }`}
              onClick={(event) => {
                requestTabSelection(tab, event.currentTarget, false, false);
              }}
              // The tab's accessible name is its title alone. The hint below is
              // `aria-hidden` and repeated here as the tooltip, because a hint
              // folded into the name makes the tab match text it does not
              // announce itself as — the Execution tab's hint is "Choose Local
              // CLI or BYOK", which made `getByRole('tab', {name: /Local CLI/})`
              // find both this tab and the Local CLI control inside its own
              // panel. A tab should be findable by what it is called.
              aria-label={t(tab.titleKey)}
              title={t(tab.hintKey)}
            >
              <Icon name={tab.icon} size={16} />
              {locked ? <Icon name="lock" size={14} /> : null}
              <span className={styles.tabLabel}>
                <strong>{t(tab.titleKey)}</strong>
              </span>
              <small className={styles.tabHint} id={hintId}>
                {t(tab.hintKey)}
              </small>
              {count === 0 ? (
                <span className={styles.tabHint} id={noMatchId}>
                  {t('settings.searchNoMatches')}
                </span>
              ) : null}
              {count !== null && count > 0 ? (
                <span className={styles.tabCount} aria-hidden>
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div
        className={styles.dockEdges}
        role="group"
        aria-label={t('settings.tabsOverflow')}
        data-testid="settings-tabs-dock-edges"
        data-od-setting="settings.tabs.dockEdge"
      >
        {SETTINGS_TAB_DOCK_EDGES.map((edge) => (
          <button
            key={edge}
            type="button"
            className={styles.dockEdge}
            data-settings-tab-dock-edge={edge}
            data-testid={`settings-tabs-dock-${edge}`}
            aria-pressed={dockEdge === edge}
            aria-label={`${t('settings.tabsOverflow')}: ${edge}`}
            title={`${t('settings.tabsOverflow')}: ${edge}`}
            onClick={() => selectDockEdge(edge)}
          >
            <Icon name={dockIcon[edge]} size={14} />
          </button>
        ))}
      </div>

      <button
        ref={overflowRef}
        type="button"
        className={styles.overflow}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls={menuOpen ? menuId : undefined}
        aria-label={t('settings.tabsOverflow')}
        title={t('settings.tabsOverflow')}
        data-testid="settings-tabs-overflow"
        onClick={toggleMenu}
      >
        <Icon name="more-horizontal" size={15} />
        {hiddenCount > 0 ? (
          <span className={styles.overflowCount}>{hiddenCount}</span>
        ) : null}
      </button>

      {searchField}

      {menuOpen && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={menuRef}
              id={menuId}
              role="menu"
              aria-label={t('settings.tabsOverflow')}
              className={styles.menu}
              style={menuStyle}
              data-testid="settings-tabs-overflow-menu"
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  event.stopPropagation();
                  closeMenu();
                  overflowRef.current?.focus?.();
                  return;
                }
                const target = event.target as HTMLElement;
                const focusScope = target.closest<HTMLElement>('[data-focus-scope]');
                if (
                  event.key === 'Tab'
                  && focusScope?.getAttribute('data-focus-scope') === menuId
                ) return;
                const typing = target instanceof HTMLInputElement
                  || target instanceof HTMLTextAreaElement
                  || target instanceof HTMLSelectElement;
                if (typing && event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
                if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
                  event.preventDefault();
                  moveMenuFocus(1);
                } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
                  event.preventDefault();
                  moveMenuFocus(-1);
                } else if (event.key === 'Home') {
                  event.preventDefault();
                  focusMenuEdge(false);
                } else if (event.key === 'End') {
                  event.preventDefault();
                  focusMenuEdge(true);
                } else if (event.key === 'Tab') {
                  event.preventDefault();
                  closeMenu();
                  overflowRef.current?.focus?.();
                }
              }}
            >
              <RegexSearchField
                search={menuSearch}
                fieldLabel={t('settings.tabsOverflow')}
                ariaLabel={t('settings.searchAria')}
                placeholder={t('settings.searchPlaceholder')}
                className={styles.menuSearchInput}
                hostClassName={styles.menuSearch}
                testId="settings-tabs-overflow-search"
                focusScopeId={menuId}
                autoFocus
              />
              {filteredDockEdges.map((edge) => (
                <button
                  key={`dock-${edge}`}
                  type="button"
                  role="menuitemradio"
                  aria-checked={dockEdge === edge}
                  className={`${styles.menuItem}${dockEdge === edge ? ` ${styles.menuItemActive}` : ''}`}
                  data-settings-tab-dock-edge={edge}
                  data-testid={`settings-tabs-context-dock-${edge}`}
                  onClick={() => {
                    selectDockEdge(edge);
                    closeMenu();
                  }}
                >
                  <Icon name={dockIcon[edge]} size={15} />
                  <span className={styles.menuItemLabel}>{`${t('settings.tabsOverflow')}: ${edge}`}</span>
                </button>
              ))}
              {filteredTabs.length === 0 && filteredDockEdges.length === 0 ? (
                <p className={styles.menuEmpty} role="status">
                  {t('settings.searchNoMatches')}
                </p>
              ) : null}
              {filteredTabs.map((tab) => {
                const active = tab.section === activeSection;
                const lock = toyLocks.get(tab.section);
                const locked = lock?.locked ?? false;
                const count = matchCounts ? (matchCounts.get(tab.section) ?? 0) : null;
                return (
                  <button
                    key={tab.section}
                    type="button"
                    role="menuitem"
                    aria-disabled={locked || undefined}
                    data-section={tab.section}
                    data-toy-lock-policy={locked ? lock?.policy : undefined}
                    className={`${styles.menuItem}${active ? ` ${styles.menuItemActive}` : ''}`}
                    onClick={(event) => {
                      requestTabSelection(tab, event.currentTarget, true, true);
                    }}
                  >
                    <Icon name={tab.icon} size={15} />
                    {locked ? <Icon name="lock" size={13} /> : null}
                    <span className={styles.menuItemLabel}>{t(tab.titleKey)}</span>
                    {count !== null && count > 0 ? (
                      <span className={styles.menuItemMarker}>{count}</span>
                    ) : outOfView.has(tab.section) ? (
                      <span className={styles.menuItemMarker}>
                        {t('settings.tabsOffscreen')}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}

      {pendingAuthentication && typeof document !== 'undefined'
        ? createPortal(
            <ToyLockAuthenticationPopover
              targetId={pendingAuthentication.targetId}
              targetLabel={pendingAuthentication.targetLabel}
              policy={pendingAuthentication.policy}
              anchor={pendingAuthentication.anchor}
              verifyFactor={verifyToyLockFactor}
              onAuthenticated={() => {
                const completed = pendingAuthentication;
                setPendingAuthentication(null);
                completeTabSelection(
                  completed.section,
                  completed.closeOverflowOnSuccess,
                  completed.focusTabOnSuccess,
                );
              }}
              onCancel={() => setPendingAuthentication(null)}
            />,
            document.body,
          )
        : null}
    </div>
  );
}

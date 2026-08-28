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
import { Icon } from '../Icon';
import { RegexSearchField } from '../regex/RegexSearchField';
import { useRegexSearch } from '../regex/useRegexSearch';
import type { SettingsSection } from '../SettingsDialog';
import {
  ToyLockAuthenticationPopover,
  type ToyLockPolicyVerificationRequest,
  type ToyLockPolicyVerificationResult,
  type ToyLockVerificationRequest,
} from '../ToyLockAuthenticationPopover';
import { SETTINGS_TABS, type SettingsTabDef } from './settingsTabs';
import styles from './SettingsTabs.module.css';
import {
  emitSettingsTabAppearanceRequest,
} from './settings-tab-appearance-consumer';

/** Shared by every tab and by the panel they all control. */
export const SETTINGS_TABPANEL_ID = 'settings-tabpanel';
export { SETTINGS_TAB_APPEARANCE_REQUEST_EVENT, type SettingsTabAppearanceRequest } from './settings-tab-appearance-consumer';

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
  toyLockStatus?: 'loading' | 'ready' | 'unavailable';
  /** How long a successful authentication remains valid for this mounted
   * settings surface. The surface-only choice is the default. */
  unlockDurations?: ReadonlyMap<SettingsSection, UnlockDuration>;
  /** Factor verification supplied by the credential-owning host. */
  verifyToyLockFactor?: (
    request: ToyLockVerificationRequest,
  ) => boolean | Promise<boolean>;
  /** Complete policy verification from the persistent desktop credential host. */
  verifyToyLockPolicy?: (
    request: ToyLockPolicyVerificationRequest,
  ) => ToyLockPolicyVerificationResult | null | Promise<ToyLockPolicyVerificationResult | null>;
  /** Opens the host-backed lock configuration surface for this exact tab. */
  onConfigureToyLock?: (section: SettingsSection, anchor: HTMLButtonElement) => void;
  /** Adapter into the shared appearance editor. The default dispatches the
   * typed request event so a separately-owned appearance lane can consume it
   * without duplicating editor state in this tab strip. */
  onEditTabAppearance?: (section: SettingsSection, anchor: HTMLButtonElement) => void;
  onLockAgain?: (section: SettingsSection) => void;
  onOpenSupportTickets?: (section: SettingsSection, anchor: HTMLButtonElement) => void;
}

export interface SettingsTabToyLock {
  readonly cooldownUntilMs?: number | null;
  readonly locked: boolean;
  readonly maximumAttempts?: number;
  readonly policy: ToyLockPolicy;
  readonly remainingAttempts?: number;
  readonly revision?: number;
}

export type UnlockDuration = 'surface' | '5-minutes' | 'until-close';

interface PendingTabAuthentication {
  readonly section: SettingsSection;
  readonly targetId: string;
  readonly targetLabel: string;
  readonly policy: ToyLockPolicy;
  readonly anchor: HTMLButtonElement;
  readonly closeOverflowOnSuccess: boolean;
  readonly focusTabOnSuccess: boolean;
  readonly action: () => void;
}

interface TabContextMenu {
  readonly anchor: HTMLButtonElement;
  readonly section: SettingsSection;
  readonly x: number;
  readonly y: number;
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
  toyLockStatus = 'ready',
  unlockDurations,
  verifyToyLockFactor = REFUSE_UNCONFIGURED_TOY_LOCK_FACTOR,
  verifyToyLockPolicy,
  onConfigureToyLock,
  onEditTabAppearance,
  onLockAgain,
  onOpenSupportTickets,
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
  const [menuQuery, setMenuQuery] = useState('');
  const [pendingAuthentication, setPendingAuthentication] =
    useState<PendingTabAuthentication | null>(null);
  const authorizedUntilRef = useRef(new Map<SettingsSection, number>());
  const authorizationTimersRef = useRef(new Map<SettingsSection, ReturnType<typeof setTimeout>>());
  const [, bumpAuthorizationVersion] = useState(0);

  useEffect(() => () => {
    for (const timer of authorizationTimersRef.current.values()) window.clearTimeout(timer);
    authorizationTimersRef.current.clear();
    authorizedUntilRef.current.clear();
  }, []);
  const [tabContextMenu, setTabContextMenu] = useState<TabContextMenu | null>(null);
  const [tabContextQuery, setTabContextQuery] = useState('');
  const menuSearch = useRegexSearch(menuQuery, setMenuQuery);
  const tabContextSearch = useRegexSearch(tabContextQuery, setTabContextQuery);

  const filteredTabs = tabs.filter((tab) =>
    menuSearch.matches(`${t(tab.titleKey)} ${t(tab.hintKey)}`),
  );
  const contextMenuHasMatch = (label: string): boolean => tabContextSearch.matches(label);
  const contextMenuActions = [
    t('settings.toyLock.editTabAppearance'),
    toyLocks.has(tabContextMenu?.section ?? 'general') ? t('settings.toyLock.configure') : t('settings.toyLock.lockElement'),
    ...(tabContextMenu && toyLocks.has(tabContextMenu.section) ? [t('settings.toyLock.lockAgain')] : []),
  ];

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
    if (!button || typeof window === 'undefined') return;
    const rect = button.getBoundingClientRect();
    const viewportWidth = Math.max(1, window.innerWidth);
    const viewportHeight = Math.max(1, window.innerHeight);
    const width = Math.max(1, Math.min(MENU_WIDTH, viewportWidth - VIEWPORT_MARGIN * 2));
    const horizontalMargin = viewportWidth >= width + VIEWPORT_MARGIN * 2 ? VIEWPORT_MARGIN : 0;
    const maxLeft = Math.max(horizontalMargin, viewportWidth - width - horizontalMargin);
    const anchorRight = Math.min(viewportWidth, Math.max(0, rect.right));
    const left = Math.min(maxLeft, Math.max(horizontalMargin, anchorRight - width));
    // A trigger can be in a scrolled-away strip while the menu is opening.
    // Measure the visible edge, not the stale document coordinate, or the
    // fixed card can be born with a negative top/bottom value.
    const anchorTop = Math.min(viewportHeight, Math.max(0, rect.top));
    const anchorBottom = Math.min(viewportHeight, Math.max(0, rect.bottom));
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
  }, []);

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
  }, [menuOpen, measureMenu]);

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
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [menuOpen, pendingAuthentication]);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    setMenuQuery('');
  }, []);

  const toggleMenu = useCallback(() => {
    if (menuOpen) {
      closeMenu();
      return;
    }
    setMenuQuery('');
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

  // Every operation reachable from a locked tab uses this one state machine.
  // Keeping the callback in the pending record prevents an authenticated
  // appearance/configuration action from accidentally falling through to the
  // selection path.
  const requestProtectedTabAction = useCallback((
    tab: SettingsTabDef,
    anchor: HTMLButtonElement,
    action: () => void,
    closeOverflowOnSuccess = false,
    focusTabOnSuccess = false,
  ) => {
    if (toyLockStatus !== 'ready') return;
    const lock = toyLocks.get(tab.section);
    const authorizedUntil = authorizedUntilRef.current.get(tab.section);
    if (lock?.locked && authorizedUntil !== undefined) {
      if (authorizedUntil === Number.POSITIVE_INFINITY || authorizedUntil > Date.now()) {
        action();
        return;
      }
      authorizedUntilRef.current.delete(tab.section);
    }
    const result = interceptLockedActivation(
      {
        targetId: tab.section,
        policy: lock?.policy ?? 'password',
        locked: lock?.locked ?? false,
      },
      createAttemptBudget(),
      action,
    );
    if (result.kind !== 'authentication-required') return;
    setPendingAuthentication({
      section: tab.section,
      targetId: tab.section,
      targetLabel: t(tab.titleKey),
      policy: result.policy,
      anchor,
      closeOverflowOnSuccess,
      focusTabOnSuccess,
      action,
    });
  }, [t, toyLocks, toyLockStatus]);

  const requestTabSelection = useCallback((
    tab: SettingsTabDef,
    anchor: HTMLButtonElement,
    closeOverflowOnSuccess: boolean,
    focusTabOnSuccess: boolean,
  ) => {
    requestProtectedTabAction(
      tab,
      anchor,
      () => completeTabSelection(tab.section, closeOverflowOnSuccess, focusTabOnSuccess),
      closeOverflowOnSuccess,
      focusTabOnSuccess,
    );
  }, [completeTabSelection, requestProtectedTabAction]);

  const rememberAuthorization = useCallback((section: SettingsSection) => {
    const duration = unlockDurations?.get(section) ?? 'surface';
    // "This surface" means the mounted SettingsTabStrip lifetime. It is
    // intentionally represented as Infinity here, while unmounting the
    // surface clears the ref and therefore all such authorizations.
    authorizedUntilRef.current.set(section, duration === '5-minutes'
      ? Date.now() + 5 * 60_000
      : Number.POSITIVE_INFINITY);
    const priorTimer = authorizationTimersRef.current.get(section);
    if (priorTimer !== undefined) window.clearTimeout(priorTimer);
    if (duration === '5-minutes') {
      const timer = window.setTimeout(() => {
        authorizedUntilRef.current.delete(section);
        authorizationTimersRef.current.delete(section);
        bumpAuthorizationVersion((value) => value + 1);
      }, 5 * 60_000);
      authorizationTimersRef.current.set(section, timer);
    }
  }, [bumpAuthorizationVersion, unlockDurations]);

  const lockAgain = useCallback((section: SettingsSection) => {
    authorizedUntilRef.current.delete(section);
    const timer = authorizationTimersRef.current.get(section);
    if (timer !== undefined) window.clearTimeout(timer);
    authorizationTimersRef.current.delete(section);
    bumpAuthorizationVersion((value) => value + 1);
    onLockAgain?.(section);
  }, [bumpAuthorizationVersion, onLockAgain]);

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
      if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') nextIndex = 0;
      else if (event.key === 'End') nextIndex = tabs.length - 1;
      if (nextIndex === null) return;
      const next = tabs[nextIndex];
      if (!next) return;
      event.preventDefault();
      focusTab(next.section);
    },
    [activeSection, focusTab, tabs],
  );

  const hiddenCount = outOfView.size;
  const openTabContextMenu = useCallback((section: SettingsSection, anchor: HTMLButtonElement, x: number, y: number) => {
    setTabContextQuery('');
    setTabContextMenu({ anchor, section, x, y });
  }, []);

  const dispatchTabAppearance = useCallback((section: SettingsSection, anchor: HTMLButtonElement) => {
    if (onEditTabAppearance) {
      onEditTabAppearance(section, anchor);
      return;
    }
    // A real event contract keeps this command operable while the shared
    // appearance editor is supplied by its owning lane. It is not a silent
    // no-op: an absent consumer is observable in development and the anchor
    // remains available for the eventual editor to restore focus.
    emitSettingsTabAppearanceRequest({ section, anchor });
  }, [onEditTabAppearance]);

  const requestTabAppearance = useCallback((section: SettingsSection, anchor: HTMLButtonElement) => {
    const tab = tabs.find((candidate) => candidate.section === section);
    if (!tab) return;
    setTabContextMenu(null);
    requestProtectedTabAction(tab, anchor, () => dispatchTabAppearance(section, anchor));
  }, [dispatchTabAppearance, requestProtectedTabAction, tabs]);

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
    <div className={styles.strip}>
      <div
        ref={listRef}
        className={styles.tablist}
        role="tablist"
        aria-label={t('settings.tabsAria')}
        aria-orientation="horizontal"
        onKeyDown={onTablistKeyDown}
      >
        {tabs.map((tab) => {
          const active = tab.section === activeSection;
          const lock = toyLocks.get(tab.section);
          const authorizedUntil = authorizedUntilRef.current.get(tab.section);
          const authorized = authorizedUntil === Number.POSITIVE_INFINITY
            || (authorizedUntil !== undefined && authorizedUntil > Date.now());
          const locked = (lock?.locked ?? false) && !authorized;
          const unresolved = toyLockStatus !== 'ready';
          const count = matchCounts ? (matchCounts.get(tab.section) ?? 0) : null;
          // Never dim the selected tab: it remains the user's current context
          // even when the query matches nothing inside it. The no-match state
          // is still exposed through the stable description below.
          const dimmed = count === 0 && !active;
          const tabId = settingsTabId(tab.section);
          const hintId = `${tabId}-hint`;
          const noMatchId = `${tabId}-no-match`;
          return (
            <span
              className={styles.tabDisabledTarget}
              data-locked={locked || undefined}
              aria-disabled={locked || undefined}
              data-lock-state={unresolved ? toyLockStatus : locked ? 'locked' : 'unlocked'}
              onClick={unresolved ? (event) => event.preventDefault() : undefined}
            ><button
              key={tab.section}
              ref={(node) => {
                registerTab(tab.section, node);
              }}
              type="button"
              role="tab"
              id={tabId}
              aria-selected={active}
              aria-disabled={locked || unresolved || undefined}
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
              onContextMenu={(event) => {
                event.preventDefault();
                if (event.shiftKey) requestTabAppearance(tab.section, event.currentTarget);
                else openTabContextMenu(tab.section, event.currentTarget, event.clientX, event.clientY);
              }}
              onKeyDown={(event) => {
                if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
                  event.preventDefault();
                  const rect = event.currentTarget.getBoundingClientRect();
                  openTabContextMenu(tab.section, event.currentTarget, rect.left, rect.bottom);
                }
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
            </button></span>
          );
        })}
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
              {filteredTabs.length === 0 ? (
                <p className={styles.menuEmpty} role="status">
                  {t('settings.searchNoMatches')}
                </p>
              ) : null}
              {filteredTabs.map((tab) => {
                const active = tab.section === activeSection;
                const lock = toyLocks.get(tab.section);
                const authorizedUntil = authorizedUntilRef.current.get(tab.section);
                const authorized = authorizedUntil === Number.POSITIVE_INFINITY
                  || (authorizedUntil !== undefined && authorizedUntil > Date.now());
                const locked = (lock?.locked ?? false) && !authorized;
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
                    onContextMenu={(event) => {
                      event.preventDefault();
                      if (event.shiftKey) requestTabAppearance(tab.section, event.currentTarget);
                      else openTabContextMenu(tab.section, event.currentTarget, event.clientX, event.clientY);
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

      {tabContextMenu && typeof document !== 'undefined'
        ? createPortal(
            <div
              role="menu"
              aria-label={`${t('settings.tabsAria')} context menu`}
              className={styles.menu}
              style={{
                position: 'fixed',
                left: Math.max(VIEWPORT_MARGIN, Math.min(tabContextMenu.x, window.innerWidth - MENU_WIDTH - VIEWPORT_MARGIN)),
                top: Math.max(VIEWPORT_MARGIN, Math.min(tabContextMenu.y, window.innerHeight - 180)),
                width: MENU_WIDTH,
              }}
              data-testid="settings-tab-context-menu"
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  setTabContextMenu(null);
                  tabContextMenu.anchor.focus();
                }
              }}
            >
              <RegexSearchField
                search={tabContextSearch}
                fieldLabel={t('settings.tabsAria')}
                ariaLabel={t('settings.searchAria')}
                placeholder={t('settings.searchPlaceholder')}
                className={styles.menuSearchInput}
                hostClassName={styles.menuSearch}
                testId="settings-tab-context-menu-search"
                autoFocus
              />
              {contextMenuActions.some(contextMenuHasMatch) ? (
                <>
                {contextMenuHasMatch(t('settings.toyLock.editTabAppearance')) ? <button type="button" role="menuitem" className={styles.menuItem} aria-keyshortcuts="Shift+F10" onClick={() => requestTabAppearance(tabContextMenu.section, tabContextMenu.anchor)}><span>{t('settings.toyLock.editTabAppearance')}</span><kbd>Shift+F10</kbd></button> : null}
                {contextMenuHasMatch(toyLocks.has(tabContextMenu.section) ? t('settings.toyLock.configure') : t('settings.toyLock.lockElement')) ? <button
                  type="button"
                  role="menuitem"
                  className={styles.menuItem}
                  onClick={() => {
                    const tab = tabs.find((candidate) => candidate.section === tabContextMenu.section);
                    if (!tab) return;
                    requestProtectedTabAction(tab, tabContextMenu.anchor, () => {
                      onConfigureToyLock?.(tabContextMenu.section, tabContextMenu.anchor);
                      setTabContextMenu(null);
                    });
                  }}
                >
                  <span>{toyLocks.has(tabContextMenu.section) ? t('settings.toyLock.configure') : t('settings.toyLock.lockElement')}</span><kbd>Enter</kbd>
                </button> : null}
                {toyLocks.has(tabContextMenu.section) && contextMenuHasMatch(t('settings.toyLock.lockAgain')) ? <button type="button" role="menuitem" className={styles.menuItem} onClick={() => { lockAgain(tabContextMenu.section); setTabContextMenu(null); }}><span>{t('settings.toyLock.lockAgain')}</span></button> : null}
                </>
              ) : <p className={styles.menuEmpty} role="status">{t('settings.searchNoMatches')}</p>}
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
              attemptMaximum={toyLocks.get(pendingAuthentication.section)?.maximumAttempts ?? 5}
              attemptRemaining={toyLocks.get(pendingAuthentication.section)?.remainingAttempts ?? 5}
              verifyFactor={verifyToyLockFactor}
              verifyPolicy={verifyToyLockPolicy}
              onSupportTickets={() => onOpenSupportTickets?.(pendingAuthentication.section, pendingAuthentication.anchor)}
              onAuthenticated={() => {
                const completed = pendingAuthentication;
                rememberAuthorization(completed.section);
                setPendingAuthentication(null);
                completed.action();
              }}
              onCancel={() => setPendingAuthentication(null)}
            />,
            document.body,
          )
        : null}

    </div>
  );
}

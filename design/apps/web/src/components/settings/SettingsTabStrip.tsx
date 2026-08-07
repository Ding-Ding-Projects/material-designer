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
import { Icon } from '../Icon';
import { RegexSearchField } from '../regex/RegexSearchField';
import { useRegexSearch } from '../regex/useRegexSearch';
import type { SettingsSection } from '../SettingsDialog';
import { SETTINGS_TABS, type SettingsTabDef } from './settingsTabs';
import styles from './SettingsTabs.module.css';

/** Shared by every tab and by the panel they all control. */
export const SETTINGS_TABPANEL_ID = 'settings-tabpanel';

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
}

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
  const menuSearch = useRegexSearch(menuQuery, setMenuQuery);

  const filteredTabs = tabs.filter((tab) =>
    menuSearch.matches(`${t(tab.titleKey)} ${t(tab.hintKey)}`),
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
      if (!isInside(event.target)) {
        setMenuOpen(false);
        setMenuQuery('');
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [menuOpen]);

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

  const focusTab = useCallback(
    (section: SettingsSection) => {
      onSelect(section);
      const node = tabNodes.current.get(section);
      node?.focus?.();
    },
    [onSelect],
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
          const count = matchCounts ? (matchCounts.get(tab.section) ?? 0) : null;
          const dimmed = count === 0;
          return (
            <button
              key={tab.section}
              ref={(node) => {
                registerTab(tab.section, node);
              }}
              type="button"
              role="tab"
              id={settingsTabId(tab.section)}
              aria-selected={active}
              aria-controls={SETTINGS_TABPANEL_ID}
              tabIndex={active ? 0 : -1}
              data-section={tab.section}
              // `settings-nav-item` is retained deliberately: it is what the
              // existing settings e2e locators and hover-contrast guard match.
              className={`settings-nav-item ${styles.tab}${active ? ` active ${styles.tabActive}` : ''}${
                dimmed ? ` ${styles.tabNoMatch}` : ''
              }`}
              onClick={() => onSelect(tab.section)}
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
              <span className={styles.tabLabel}>
                <strong>{t(tab.titleKey)}</strong>
              </span>
              <small className={styles.tabHint} aria-hidden>
                {t(tab.hintKey)}
              </small>
              {count !== null && count > 0 ? (
                <span className={styles.tabCount} aria-hidden>
                  {count}
                </span>
              ) : null}
            </button>
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
                const count = matchCounts ? (matchCounts.get(tab.section) ?? 0) : null;
                return (
                  <button
                    key={tab.section}
                    type="button"
                    role="menuitem"
                    className={`${styles.menuItem}${active ? ` ${styles.menuItemActive}` : ''}`}
                    onClick={() => {
                      closeMenu();
                      focusTab(tab.section);
                    }}
                  >
                    <Icon name={tab.icon} size={15} />
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
    </div>
  );
}

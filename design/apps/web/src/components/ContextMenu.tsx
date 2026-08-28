// Shared target-specific context menu primitive.
//
// The menu owns its filter controller. Plain text is the default and the
// adjacent RegexSearchField is the opt-in advanced workbench for this menu.
// Keeping the controller here means two open menus cannot share query, flags,
// history, snippets, or validation state.

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

import { Icon, type IconName } from './Icon';
import {
  ariaKeyShortcuts,
  shortcutKeyTokens,
  type ShortcutId,
} from './shortcuts/registry';
import { isMacPlatform } from '../utils/platform';
import { RegexSearchField, useRegexSearch } from './regex';
import styles from './ContextMenu.module.css';

export interface ContextMenuItem {
  readonly id: string;
  readonly label: string;
  readonly icon?: IconName;
  /** The binding that runs this command in this menu's context. */
  readonly shortcutId?: ShortcutId;
  readonly danger?: boolean;
  readonly disabled?: boolean;
  /** Draw a rule above this item. */
  readonly separatorBefore?: boolean;
  /** Overrides the `<menu testId>-<item id>` default, for existing selectors. */
  readonly testId?: string;
  readonly onSelect: () => void;
}

export interface ContextMenuProps {
  readonly items: readonly ContextMenuItem[];
  /** Viewport coordinates of the pointer, or of the control that opened it. */
  readonly x: number;
  readonly y: number;
  readonly ariaLabel: string;
  readonly onClose: () => void;
  /** The control that opened the menu, restored after every dismissal path. */
  readonly restoreFocusTo?: HTMLElement | null;
  readonly width?: number;
  readonly testId?: string;
  /** Override platform detection for the keycap notation. Tests use it. */
  readonly mac?: boolean;
  /** Accessible and visible label for this menu's field-owned filter. */
  readonly searchLabel?: string;
  readonly searchPlaceholder?: string;
  readonly noResultsLabel?: string;
  /** Real callbacks for the exact target. Omit only when the owner has no such operation. */
  readonly onEditAppearance?: () => void;
  readonly onLock?: () => void;
  readonly editAppearanceLabel?: string;
  readonly lockLabel?: string;
}

const DEFAULT_WIDTH = 260;
const EDGE_PADDING = 8;
const ITEM_HEIGHT = 44;
const SEARCH_HEIGHT = 56;
const SEPARATOR_HEIGHT = 9;
const MENU_PADDING = 16;

function menuHeight(items: readonly ContextMenuItem[]): number {
  const separators = items.filter((item) => item.separatorBefore).length;
  return SEARCH_HEIGHT + items.length * ITEM_HEIGHT + separators * SEPARATOR_HEIGHT + MENU_PADDING;
}

function clampToViewport(
  x: number,
  y: number,
  items: readonly ContextMenuItem[],
  width: number,
): { left: number; top: number } {
  const viewportWidth = typeof window === 'undefined' ? 1024 : window.innerWidth;
  const viewportHeight = typeof window === 'undefined' ? 768 : window.innerHeight;
  const height = menuHeight(items);
  return {
    left: Math.max(EDGE_PADDING, Math.min(x, viewportWidth - width - EDGE_PADDING)),
    top: Math.max(EDGE_PADDING, Math.min(y, viewportHeight - height - EDGE_PADDING)),
  };
}

function widthWithinViewport(width: number): number {
  const viewportWidth = typeof window === 'undefined' ? 1024 : window.innerWidth;
  return Math.max(1, Math.min(width, viewportWidth - EDGE_PADDING * 2));
}

export function ContextMenu({
  items,
  x,
  y,
  ariaLabel,
  onClose,
  restoreFocusTo = null,
  width = DEFAULT_WIDTH,
  testId,
  mac,
  searchLabel = `${ariaLabel} menu actions`,
  searchPlaceholder = 'Filter actions',
  noResultsLabel = 'No actions match this filter.',
  onEditAppearance,
  onLock,
  editAppearanceLabel = 'Edit appearance…',
  lockLabel = 'Lock this element…',
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const reactId = useId();
  const menuId = reactId.replace(/:/g, '');
  const menuWidth = widthWithinViewport(width);
  const [position] = useState(() => clampToViewport(x, y, items, menuWidth));
  const [query, setQuery] = useState('');
  const search = useRegexSearch(query, setQuery);
  const onMac = mac ?? isMacPlatform();

  const menuItems = useMemo(() => {
    const result = [...items];
    const ids = new Set(result.map((item) => item.id));
    if (onEditAppearance && !ids.has('edit-appearance')) {
      result.push({ id: 'edit-appearance', label: editAppearanceLabel, onSelect: onEditAppearance });
    }
    if (onLock && !ids.has('lock-element')) {
      result.push({ id: 'lock-element', label: lockLabel, onSelect: onLock });
    }
    return result;
  }, [editAppearanceLabel, items, lockLabel, onEditAppearance, onLock]);

  const visibleItems = useMemo(
    () => menuItems.filter((item) => search.matches(`${item.label}\n${item.id}`)),
    [menuItems, search.matches],
  );
  const enabledVisibleItems = useMemo(
    () => visibleItems.filter((item) => !item.disabled),
    [visibleItems],
  );
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (enabledVisibleItems.some((item) => item.id === activeId)) return;
    setActiveId(enabledVisibleItems[0]?.id ?? null);
  }, [activeId, enabledVisibleItems]);

  const restoreFocus = useCallback(() => {
    if (!restoreFocusTo?.isConnected) return;
    restoreFocusTo.focus({ preventScroll: true });
  }, [restoreFocusTo]);

  const dismiss = useCallback((shouldRestoreFocus = true) => {
    onClose();
    if (shouldRestoreFocus) restoreFocus();
  }, [onClose, restoreFocus]);

  const activate = useCallback((item: ContextMenuItem) => {
    if (item.disabled) return;
    onClose();
    item.onSelect();
    restoreFocus();
  }, [onClose, restoreFocus]);

  const moveActive = useCallback((direction: 1 | -1, edge?: 'first' | 'last') => {
    if (enabledVisibleItems.length === 0) return;
    if (edge === 'first') {
      setActiveId(enabledVisibleItems[0]!.id);
      return;
    }
    if (edge === 'last') {
      setActiveId(enabledVisibleItems[enabledVisibleItems.length - 1]!.id);
      return;
    }
    const currentIndex = enabledVisibleItems.findIndex((item) => item.id === activeId);
    const nextIndex = currentIndex < 0
      ? 0
      : (currentIndex + direction + enabledVisibleItems.length) % enabledVisibleItems.length;
    setActiveId(enabledVisibleItems[nextIndex]!.id);
  }, [activeId, enabledVisibleItems]);

  const handleSearchKeyDown = useCallback((event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveActive(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveActive(-1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      moveActive(1, 'first');
    } else if (event.key === 'End') {
      event.preventDefault();
      moveActive(-1, 'last');
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const active = enabledVisibleItems.find((item) => item.id === activeId);
      if (active) activate(active);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      dismiss();
    } else if (event.key === 'Tab') {
      event.preventDefault();
      event.stopPropagation();
      dismiss();
    }
  }, [activate, activeId, dismiss, enabledVisibleItems, moveActive]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        dismiss();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && menuRef.current?.contains(target)) return;
      const opensAnotherMenu = target instanceof Element
        && target.closest('[data-context-menu-opener]') != null;
      dismiss(!opensAnotherMenu);
    };
    const onScroll = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && menuRef.current?.contains(target)) return;
      dismiss();
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [dismiss]);

  const activeOptionId = activeId && visibleItems.some((item) => item.id === activeId)
    ? `${testId ?? menuId}-${activeId}`
    : undefined;

  return (
    <div
      ref={menuRef}
      className={styles.menu}
      style={{ left: position.left, top: position.top, width: menuWidth }}
      role="menu"
      aria-label={ariaLabel}
      data-testid={testId}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.target instanceof HTMLInputElement) return;
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          moveActive(1);
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          moveActive(-1);
        } else if (event.key === 'Home') {
          event.preventDefault();
          moveActive(1, 'first');
        } else if (event.key === 'End') {
          event.preventDefault();
          moveActive(-1, 'last');
        } else if (event.key === 'Enter') {
          const target = event.target instanceof Element
            ? event.target.closest('button[role="menuitem"]')
            : null;
          const item = visibleItems.find((candidate) =>
            target?.getAttribute('data-menu-item-id') === candidate.id,
          );
          if (item) activate(item);
        } else if (event.key === 'Tab') {
          event.preventDefault();
          dismiss();
        }
      }}
    >
      <div className={styles.searchRow} role="none">
        <RegexSearchField
          search={search}
          fieldLabel={searchLabel}
          ariaLabel={searchLabel}
          ariaControls={testId ? `${testId}-items` : undefined}
          ariaActiveDescendant={activeOptionId}
          placeholder={searchPlaceholder}
          hostClassName={styles.searchHost}
          className={styles.searchInput}
          toggleClassName={styles.searchToggle}
          testId={testId ? `${testId}-filter` : undefined}
          autoFocus
          onKeyDown={handleSearchKeyDown}
        />
      </div>
      <div id={testId ? `${testId}-items` : undefined} className={styles.itemList} role="none">
        {visibleItems.length === 0 ? (
          <div className={styles.noResults} role="status" data-testid={testId ? `${testId}-no-results` : undefined}>
            {noResultsLabel}
          </div>
        ) : visibleItems.map((item) => {
          const tokens = item.shortcutId
            ? shortcutKeyTokens(item.shortcutId, { mac: onMac })
            : null;
          const optionId = `${testId ?? menuId}-${item.id}`;
          return (
            <div key={item.id} className={styles.row}>
              {item.separatorBefore ? <span className={styles.separator} role="none" /> : null}
              <button
                type="button"
                role="menuitem"
                disabled={item.disabled}
                className={`${styles.item}${item.danger ? ` ${styles.danger}` : ''}`}
                data-testid={item.testId ?? optionId}
                data-menu-item-id={item.id}
                id={optionId}
                aria-keyshortcuts={
                  item.shortcutId ? ariaKeyShortcuts(item.shortcutId, { mac: onMac }) : undefined
                }
                onMouseEnter={() => setActiveId(item.id)}
                onClick={() => activate(item)}
              >
                {item.icon ? (
                  <span className={styles.icon} aria-hidden>
                    <Icon name={item.icon} size={18} />
                  </span>
                ) : <span className={styles.icon} aria-hidden />}
                <span className={styles.label} title={item.label}>{item.label}</span>
                {tokens ? (
                  <span className={styles.shortcut} aria-hidden="true">
                    {tokens.map((token, index) => (
                      <kbd key={`${item.id}-key-${index}`} className={styles.key}>{token}</kbd>
                    ))}
                  </span>
                ) : null}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

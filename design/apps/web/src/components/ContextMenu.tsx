// The right-click menu, with the keys it is hiding written on it.
//
// A context menu is where people find out what an object can do. If an item has
// a keyboard shortcut and the menu does not say so, that shortcut is one nobody
// learns — the menu becomes the only route to a command that has a faster one,
// and it teaches that the slow way is the only way.
//
// So the shortcut column is not decoration here, and it is not free text
// either. An item names a `shortcutId`, and the keycaps are drawn from
// `shortcuts/registry` — the same table `matchesShortcut` uses to decide
// whether a key fired. The host installs its handlers from that table too
// (`useShortcuts` / `runShortcut`), which is what makes the displayed shortcut
// the one that actually works in this context rather than one inferred from a
// similar command elsewhere.
//
// Two rules the markup encodes:
//
//   An item with no shortcut shows nothing. A dash or an empty pill lined up
//   under the real ones reads as "this has a shortcut and we forgot it".
//
//   The keycaps are `aria-hidden` and the shortcut reaches assistive technology
//   through `aria-keyshortcuts` instead. Left visible they would be announced
//   as text as well, and "Delete, Del" is a menu that has stopped being useful
//   at the moment it was trying hardest.

import { useCallback, useEffect, useRef, useState } from 'react';

import { Icon, type IconName } from './Icon';
import {
  ariaKeyShortcuts,
  shortcutKeyTokens,
  type ShortcutId,
} from './shortcuts/registry';
import { isMacPlatform } from '../utils/platform';
import styles from './ContextMenu.module.css';

export interface ContextMenuItem {
  readonly id: string;
  readonly label: string;
  readonly icon?: IconName;
  /**
   * The binding that runs this command *in this menu's context*. Omit it when
   * there is none — never point at a similar command's shortcut to fill the
   * column, because the user will press it.
   */
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
}

// Kept in step with `ContextMenu.module.css` by hand, because the estimate
// below runs before the card has been laid out and so cannot measure it. The
// numbers are the mockup's menu anatomy: a 260px card, 8px of inset on each
// axis, and 44px rows.
const DEFAULT_WIDTH = 260;
const EDGE_PADDING = 8;
const ITEM_HEIGHT = 44;
const SEPARATOR_HEIGHT = 9;
const MENU_PADDING = 16;

/**
 * Where the card goes.
 *
 * Estimated from the item count rather than measured, so the menu lands in its
 * final place on the first paint instead of appearing and then jumping. The
 * stylesheet still caps the height and scrolls the overflow, so an estimate
 * that is wrong on a very long menu produces a scrollable card rather than one
 * that paints off the bottom of the screen.
 */
function clampToViewport(
  x: number,
  y: number,
  items: readonly ContextMenuItem[],
  width: number,
): { left: number; top: number } {
  const viewportWidth = typeof window === 'undefined' ? 1024 : window.innerWidth;
  const viewportHeight = typeof window === 'undefined' ? 768 : window.innerHeight;
  const separators = items.filter((item) => item.separatorBefore).length;
  const height = items.length * ITEM_HEIGHT + separators * SEPARATOR_HEIGHT + MENU_PADDING;
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
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuWidth = widthWithinViewport(width);
  const [position] = useState(() => clampToViewport(x, y, items, menuWidth));
  const onMac = mac ?? isMacPlatform();

  const restoreFocus = useCallback(() => {
    if (!restoreFocusTo?.isConnected) return;
    restoreFocusTo.focus({ preventScroll: true });
  }, [restoreFocusTo]);

  const dismiss = useCallback((shouldRestoreFocus = true) => {
    onClose();
    if (shouldRestoreFocus) restoreFocus();
  }, [onClose, restoreFocus]);

  // Escape, an outside press, or a scroll underneath all dismiss. Scroll counts
  // because the menu is anchored in viewport coordinates: once the page moves,
  // it is pointing at whatever happens to be under it now.
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
      // Do not focus the old opener while a second context menu is opening;
      // that would race the new menu's focus effect and park focus on the
      // wrong row. A genuine outside dismissal still restores the opener.
      const opensAnotherMenu = target instanceof Element
        && target.closest('[data-context-menu-opener]') != null;
      dismiss(!opensAnotherMenu);
    };
    const onScroll = () => dismiss();
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [dismiss]);

  // Focus the first enabled item so the menu is operable from the keyboard the
  // moment it opens, which is the only way it is operable for anyone who opened
  // it with the context-menu key.
  useEffect(() => {
    const first = menuRef.current?.querySelector<HTMLButtonElement>(
      'button[role="menuitem"]:not([disabled])',
    );
    first?.focus();
  }, []);

  function focusSibling(from: HTMLElement, step: 1 | -1) {
    const all = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>(
        'button[role="menuitem"]:not([disabled])',
      ) ?? [],
    );
    if (all.length === 0) return;
    const index = all.indexOf(from as HTMLButtonElement);
    const next = all[(index + step + all.length) % all.length];
    next?.focus();
  }

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
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          focusSibling(event.target as HTMLElement, 1);
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          focusSibling(event.target as HTMLElement, -1);
        } else if (event.key === 'Tab') {
          // A menu is a mode, not part of the page's tab order. Leaving it by
          // Tab should close it rather than drop focus into whatever is behind.
          event.preventDefault();
          dismiss();
        }
      }}
    >
      {items.map((item) => {
        const tokens = item.shortcutId ? shortcutKeyTokens(item.shortcutId, { mac: onMac }) : null;
        return (
          <div key={item.id} className={styles.row}>
            {item.separatorBefore ? <span className={styles.separator} role="none" /> : null}
            <button
              type="button"
              role="menuitem"
              disabled={item.disabled}
              className={`${styles.item}${item.danger ? ` ${styles.danger}` : ''}`}
              data-testid={item.testId ?? (testId ? `${testId}-${item.id}` : undefined)}
              aria-keyshortcuts={
                item.shortcutId ? ariaKeyShortcuts(item.shortcutId, { mac: onMac }) : undefined
              }
              onClick={() => {
                onClose();
                item.onSelect();
                if (menuRef.current?.contains(document.activeElement)) {
                  restoreFocus();
                }
              }}
            >
              {item.icon ? (
                <span className={styles.icon} aria-hidden>
                  <Icon name={item.icon} size={18} />
                </span>
              ) : (
                // A fixed gutter, not a placeholder glyph: the labels stay in
                // one column whether or not every item has an icon.
                <span className={styles.icon} aria-hidden />
              )}
              {/* Keep the complete localized label in the visible menu. CSS
                  lets long bilingual text wrap inside the bounded card. */}
              <span className={styles.label} title={item.label}>
                {item.label}
              </span>
              {tokens ? (
                <span className={styles.shortcut} aria-hidden="true">
                  {tokens.map((token, index) => (
                    <kbd key={`${item.id}-key-${index}`} className={styles.key}>
                      {token}
                    </kbd>
                  ))}
                </span>
              ) : null}
            </button>
          </div>
        );
      })}
    </div>
  );
}

import {
  forwardRef,
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  type RefObject,
  type ReactNode,
} from 'react';

import { joinClassNames } from './class-names';
import styles from './menu.module.css';

const MENU_ITEM_SELECTOR = '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]';

function menuItems(root: HTMLElement): HTMLButtonElement[] {
  return Array.from(root.querySelectorAll<HTMLButtonElement>(MENU_ITEM_SELECTOR)).filter(
    (item) => !item.disabled && item.getAttribute('aria-disabled') !== 'true' && !item.hidden,
  );
}

export interface MenuProps extends HTMLAttributes<HTMLDivElement> {
  /** Focuses the first enabled item when the surface is mounted. */
  autoFocus?: boolean;
  /** Wraps keyboard movement from the last item to the first and back. */
  loopFocus?: boolean;
  onClose?: () => void;
  /** The element that should receive focus after Escape closes the menu. */
  returnFocusRef?: RefObject<HTMLElement>;
}

/**
 * A keyboard-first Material 3 menu surface. Dynamic filtering/search belongs
 * to the owning product surface, while this primitive owns the menu role,
 * roving focus, Escape handling, and bounded painted overlay.
 */
export const Menu = forwardRef<HTMLDivElement, MenuProps>(function Menu(
  {
    autoFocus = true,
    loopFocus = true,
    onClose,
    returnFocusRef,
    className,
    onKeyDown,
    children,
    ...props
  },
  ref,
) {
  const localRef = useRef<HTMLDivElement | null>(null);
  const setRef = (node: HTMLDivElement | null) => {
    localRef.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
  };

  useEffect(() => {
    if (autoFocus) menuItems(localRef.current ?? document.createElement('div'))[0]?.focus();
  }, [autoFocus]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const root = localRef.current;
    if (!root) {
      onKeyDown?.(event);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose?.();
      returnFocusRef?.current?.focus();
    } else if (event.key === 'Tab') {
      // Menus are transient surfaces. Tab closes the menu rather than moving
      // focus behind it, where the user would lose their place.
      event.preventDefault();
      onClose?.();
      returnFocusRef?.current?.focus();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
      const items = menuItems(root);
      if (items.length > 0) {
        const current = document.activeElement;
        const index = items.indexOf(current as HTMLButtonElement);
        let nextIndex = index < 0 ? 0 : index;
        if (event.key === 'ArrowDown') nextIndex = index < 0 ? 0 : index + 1;
        if (event.key === 'ArrowUp') nextIndex = index < 0 ? items.length - 1 : index - 1;
        if (event.key === 'Home') nextIndex = 0;
        if (event.key === 'End') nextIndex = items.length - 1;
        if (loopFocus) nextIndex = (nextIndex + items.length) % items.length;
        else nextIndex = Math.max(0, Math.min(items.length - 1, nextIndex));
        event.preventDefault();
        items[nextIndex]?.focus();
      }
    } else if (event.key === 'Enter' || event.key === ' ') {
      const current = document.activeElement;
      if (current instanceof HTMLButtonElement && root.contains(current)) {
        event.preventDefault();
        current.click();
      }
    }
    onKeyDown?.(event);
  };

  return (
    <div
      {...props}
      ref={setRef}
      role="menu"
      tabIndex={-1}
      className={joinClassNames(styles.surface, className)}
      data-md-component="menu"
      onKeyDown={handleKeyDown}
    >
      {children}
    </div>
  );
});

/** Named alias for callers that distinguish the surface from its item list. */
export const MenuSurface = Menu;
export type MenuSurfaceProps = MenuProps;

export interface MenuItemProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onSelect'> {
  children: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  shortcut?: string;
  kind?: 'item' | 'checkbox' | 'radio';
  checked?: boolean;
  selected?: boolean;
  onSelect?: (event: MouseEvent<HTMLButtonElement>) => void;
}

export const MenuItem = forwardRef<HTMLButtonElement, MenuItemProps>(function MenuItem(
  {
    children,
    leading,
    trailing,
    shortcut,
    kind = 'item',
    checked,
    selected,
    disabled = false,
    className,
    onSelect,
    onClick,
    ...props
  },
  ref,
) {
  const role = kind === 'checkbox' ? 'menuitemcheckbox' : kind === 'radio' ? 'menuitemradio' : 'menuitem';
  return (
    <button
      {...props}
      ref={ref}
      type="button"
      role={role}
      disabled={disabled}
      aria-disabled={disabled || undefined}
      aria-checked={kind === 'checkbox' || kind === 'radio' ? checked : undefined}
      aria-current={selected || undefined}
      className={joinClassNames(styles.item, selected && styles.selected, className)}
      data-md-component="menu-item"
      onClick={(event) => {
        onSelect?.(event);
        onClick?.(event);
      }}
    >
      {leading ? <span className={styles.leading} aria-hidden="true">{leading}</span> : null}
      <span className={styles.label}>{children}</span>
      {shortcut ? <kbd className={styles.shortcut}>{shortcut}</kbd> : null}
      {trailing ? <span className={styles.trailing}>{trailing}</span> : null}
    </button>
  );
});

export interface MenuLabelProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function MenuLabel({ children, className, ...props }: MenuLabelProps) {
  return <div {...props} className={joinClassNames(styles.labelRow, className)} role="presentation">{children}</div>;
}

export function MenuDivider({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={joinClassNames(styles.divider, className)} role="separator" />;
}

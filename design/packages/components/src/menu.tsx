import {
  createContext,
  forwardRef,
  useEffect,
  useContext,
  useLayoutEffect,
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
  /** Binding scope used to validate registered shortcut descriptors. */
  shortcutContext?: string;
  /** Registry that owns both the binding handler and its menu dispatch path. */
  shortcutRegistry?: MenuShortcutRegistry;
}

interface MenuShortcutRuntime {
  registry: MenuShortcutRegistry;
  represented: Set<MenuShortcut>;
  represent: (shortcut: MenuShortcut) => () => void;
}

const MenuShortcutRuntimeContext = createContext<MenuShortcutRuntime | undefined>(undefined);

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
    shortcutContext,
    shortcutRegistry,
    ...props
  },
  ref,
) {
  const effectiveShortcutContext = shortcutContext ?? shortcutRegistry?.context;
  if (shortcutRegistry && shortcutContext && shortcutRegistry.context !== shortcutContext) {
    throw new Error('Menu shortcut registry context mismatch');
  }
  const localRef = useRef<HTMLDivElement | null>(null);
  const representedShortcuts = useRef(new Set<MenuShortcut>());
  const runtimeRef = useRef<MenuShortcutRuntime | undefined>(undefined);
  if (shortcutRegistry) {
    if (!runtimeRef.current || runtimeRef.current.registry !== shortcutRegistry) {
      runtimeRef.current = {
        registry: shortcutRegistry,
        represented: representedShortcuts.current,
        represent: (shortcut) => {
          const owner = shortcutOwners.get(shortcut);
          if (owner !== shortcutRegistry) {
            throw new Error(`MenuItem shortcut registry mismatch for ${shortcut.id}`);
          }
          representedShortcuts.current.add(shortcut);
          return () => representedShortcuts.current.delete(shortcut);
        },
      };
    }
  } else {
    runtimeRef.current = undefined;
    representedShortcuts.current.clear();
  }
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
    if (shortcutRegistry?.dispatch(toAriaShortcut(event), effectiveShortcutContext, representedShortcuts.current)) {
      event.preventDefault();
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
    <MenuShortcutRuntimeContext.Provider value={runtimeRef.current}>
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
    </MenuShortcutRuntimeContext.Provider>
  );
});

/** Named alias for callers that distinguish the surface from its item list. */
export const MenuSurface = Menu;
export type MenuSurfaceProps = MenuProps;

function toAriaShortcut(event: KeyboardEvent<HTMLElement>): string {
  const modifiers = [
    event.altKey ? 'Alt' : undefined,
    event.ctrlKey ? 'Control' : undefined,
    event.metaKey ? 'Meta' : undefined,
    event.shiftKey ? 'Shift' : undefined,
  ].filter((value): value is string => Boolean(value));
  const keyNames: Record<string, string> = {
    ' ': 'Space',
    Esc: 'Escape',
    Left: 'ArrowLeft',
    Right: 'ArrowRight',
    Up: 'ArrowUp',
    Down: 'ArrowDown',
  };
  const key = keyNames[event.key] ?? (event.key.length === 1 ? event.key.toUpperCase() : event.key);
  return [...modifiers, key].join('+');
}

/** The same key sequence used by the binding registration and ARIA. */
export interface ShortcutDescriptor {
  id: string;
  label: string;
  keys: string;
  context?: string;
  handler: () => void;
}

const REGISTERED_SHORTCUT = Symbol('registered-menu-shortcut');
export type MenuShortcut = ShortcutDescriptor & { readonly [REGISTERED_SHORTCUT]: true };
const shortcutOwners = new WeakMap<object, MenuShortcutRegistry>();

const ARIA_SHORTCUT = /^(?:(?:Alt|Control|Meta|Shift|AltGraph|CapsLock|NumLock|ScrollLock|Symbol|SymbolLock)\+)*(?:[A-Za-z0-9]|F(?:[1-9]|1[0-2])|Enter|Escape|Space|Tab|Arrow(?:Up|Down|Left|Right)|Home|End|Page(?:Up|Down)|Insert|Delete|Backspace)$/;

/**
 * Registers the descriptor used by a key binding. MenuItem derives
 * `aria-keyshortcuts` from `keys`, so display text cannot drift from the
 * actual binding or smuggle an arbitrary ARIA value into the menu.
 */
function createRegisteredShortcut(descriptor: ShortcutDescriptor, contextOverride?: string): MenuShortcut {
  if (typeof descriptor.id !== 'string' || !descriptor.id.trim()) throw new Error('Menu shortcut registration requires a non-empty id');
  if (typeof descriptor.label !== 'string' || !descriptor.label.trim()) throw new Error('Menu shortcut registration requires a non-empty label');
  const normalizedKeys = typeof descriptor.keys === 'string'
    ? descriptor.keys.trim().replace(/\s*\+\s*/g, '+')
    : '';
  if (!ARIA_SHORTCUT.test(normalizedKeys)) {
    throw new Error(`Menu shortcut registration rejected unsupported key sequence for ${descriptor.id}`);
  }
  if (typeof descriptor.handler !== 'function') throw new Error(`Menu shortcut registration requires a handler for ${descriptor.id}`);
  const context = contextOverride ?? (typeof descriptor.context === 'string' && descriptor.context.trim() ? descriptor.context.trim() : 'global');
  return Object.freeze({ ...descriptor, context, keys: normalizedKeys, [REGISTERED_SHORTCUT]: true as const });
}

export interface MenuShortcutRegistry {
  context: string;
  register: (descriptor: ShortcutDescriptor) => MenuShortcut;
  get: (id: string) => MenuShortcut | undefined;
  invoke: (id: string) => boolean;
  dispatch: (keys: string, context: string | undefined, represented: ReadonlySet<MenuShortcut>) => boolean;
}

/**
 * Owns the descriptors used by a surface's real key bindings. Re-registering
 * an id with a different label or key sequence is refused, so a menu cannot
 * advertise a shortcut that differs from the binding source.
 */
export function createMenuShortcutRegistry(contextOrInitial: string | readonly ShortcutDescriptor[] = 'global', initial: readonly ShortcutDescriptor[] = []): MenuShortcutRegistry {
  const registryContext = (typeof contextOrInitial === 'string' ? contextOrInitial : 'global').trim() || 'global';
  const initialDescriptors = typeof contextOrInitial === 'string' ? initial : contextOrInitial;
  const entries = new Map<string, MenuShortcut>();
  const keyOwners = new Map<string, string>();
  let registry: MenuShortcutRegistry;
  const register = (descriptor: ShortcutDescriptor): MenuShortcut => {
    if (descriptor.context && descriptor.context.trim() !== registryContext) {
      throw new Error(`Menu shortcut registration context mismatch for ${descriptor.id}`);
    }
    const shortcut = createRegisteredShortcut(descriptor, registryContext);
    const existing = entries.get(shortcut.id);
    if (existing) throw new Error(`Menu shortcut registration duplicate id for ${shortcut.id}`);
    const keyIdentity = `${registryContext}\u0000${shortcut.keys}`;
    const existingKeyOwner = keyOwners.get(keyIdentity);
    if (existingKeyOwner) {
      throw new Error(`Menu shortcut registration duplicate key sequence for ${shortcut.id}; conflicts with ${existingKeyOwner}`);
    }
    entries.set(shortcut.id, shortcut);
    keyOwners.set(keyIdentity, shortcut.id);
    shortcutOwners.set(shortcut, registry);
    return shortcut;
  };

  registry = Object.freeze({
    context: registryContext,
    register,
    get: (id: string) => entries.get(id),
    invoke: (id: string) => {
      const shortcut = entries.get(id);
      if (!shortcut) return false;
      shortcut.handler();
      return true;
    },
    dispatch: (keys: string, context: string | undefined, represented: ReadonlySet<MenuShortcut>) => {
      if (context && context !== registryContext) return false;
      const shortcut = [...entries.values()].find((entry) => (
        entry.keys === keys
        && entry.context === registryContext
        && represented.has(entry)
      ));
      if (!shortcut) return false;
      shortcut.handler();
      return true;
    },
  });
  for (const descriptor of initialDescriptors) register(descriptor);
  return registry;
}

export interface MenuItemProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onSelect'> {
  children: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  /** A string is display-only compatibility; only a registry-owned handle supplies ARIA metadata. */
  shortcut?: MenuShortcut | string;
  /** Optional override for the context-aware registry scope. */
  shortcutContext?: string;
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
    shortcutContext: explicitShortcutContext,
    disabled = false,
    className,
    onSelect,
    onClick,
    ...props
  },
  ref,
) {
  const menuShortcutRuntime = useContext(MenuShortcutRuntimeContext);
  const role = kind === 'checkbox' ? 'menuitemcheckbox' : kind === 'radio' ? 'menuitemradio' : 'menuitem';
  const shortcutLabel = typeof shortcut === 'string' ? shortcut : shortcut?.label;
  if (typeof shortcut === 'object' && shortcut[REGISTERED_SHORTCUT] !== true) {
    throw new Error('MenuItem requires a registered shortcut descriptor before exposing aria-keyshortcuts');
  }
  if (typeof shortcut === 'object' && shortcutOwners.get(shortcut) !== menuShortcutRuntime?.registry) {
    throw new Error(`MenuItem shortcut registry mismatch for ${shortcut.id}`);
  }
  const shortcutContext = explicitShortcutContext ?? menuShortcutRuntime?.registry.context;
  if (typeof shortcut === 'object' && shortcutContext && shortcut.context !== shortcutContext) {
    throw new Error(`MenuItem shortcut context mismatch for ${shortcut.id}`);
  }
  const ariaShortcut = typeof shortcut === 'object' ? shortcut.keys : undefined;
  useLayoutEffect(() => {
    if (typeof shortcut !== 'object' || !menuShortcutRuntime || disabled) return undefined;
    return menuShortcutRuntime.represent(shortcut);
  }, [disabled, menuShortcutRuntime, shortcut]);
  return (
    <button
      {...props}
      ref={ref}
      type="button"
      role={role}
      disabled={disabled}
      aria-disabled={disabled || undefined}
      aria-checked={kind === 'checkbox' || kind === 'radio' ? checked : undefined}
      aria-keyshortcuts={ariaShortcut || undefined}
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
      {shortcutLabel ? <kbd className={styles.shortcut}>{shortcutLabel}</kbd> : null}
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

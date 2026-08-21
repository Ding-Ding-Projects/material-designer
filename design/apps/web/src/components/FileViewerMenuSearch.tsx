import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';

import { useT } from '../i18n';
import { RegexSearchField } from './regex/RegexSearchField';
import { useRegexSearch, type RegexSearchController } from './regex/useRegexSearch';

interface MenuSearchContextValue {
  search: RegexSearchController;
  registerItem: (id: string, element: HTMLElement) => () => void;
}

const MenuSearchContext = createContext<MenuSearchContextValue | null>(null);
type TriggerRef = { readonly current: HTMLElement | null };

export interface FileViewerMenuSearchProps {
  /** Stable route-local identifier; the component adds a stable React suffix. */
  menuId: string;
  /** Visible menu name used by the field, status text and accessibility tree. */
  menuLabel: string;
  open: boolean;
  onClose: () => void;
  /** The opener, or a wrapper containing the opener, to receive focus on close. */
  triggerRef?: TriggerRef;
  className: string;
  children: ReactNode;
}

function focusMenuTrigger(triggerRef?: TriggerRef) {
  const trigger = triggerRef?.current;
  if (!trigger) return;
  if (trigger instanceof HTMLElement && trigger.matches('button, [href], [tabindex]')) {
    trigger.focus();
    return;
  }
  trigger.querySelector<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])')?.focus();
}

function readableMenuItemText(element: HTMLElement): string {
  const explicit = element.dataset.menuSearchText;
  if (explicit) return explicit;
  const copy = element.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('[aria-hidden="true"]').forEach((node) => node.remove());
  return copy.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

function visibleMenuItems(menu: HTMLElement | null): HTMLElement[] {
  if (!menu) return [];
  return Array.from(menu.querySelectorAll<HTMLElement>(
    '[role="menuitem"]:not([hidden]):not([aria-hidden="true"]):not([disabled]):not([aria-disabled="true"])',
  ));
}

function focusRelativeMenuItem(menu: HTMLElement | null, current: EventTarget | null, delta: number) {
  const items = visibleMenuItems(menu);
  if (items.length === 0) return;
  const index = Math.max(0, items.indexOf(current as HTMLElement));
  const next = items[(index + delta + items.length) % items.length] ?? items[0];
  next.focus();
}

function focusBoundaryMenuItem(menu: HTMLElement | null, last: boolean) {
  const items = visibleMenuItems(menu);
  (last ? items.at(-1) : items[0])?.focus();
}

export function FileViewerMenuSearch({
  menuId,
  menuLabel,
  open,
  onClose,
  triggerRef,
  className,
  children,
}: FileViewerMenuSearchProps) {
  const t = useT();
  const instanceId = useId().replace(/:/g, '');
  const resolvedMenuId = `${menuId}-${instanceId}`;
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState('');
  const search = useRegexSearch(query, setQuery);
  const [visibleCount, setVisibleCount] = useState(0);

  const registerItem = useCallback((_id: string, _element: HTMLElement) => () => {}, []);

  const closeMenu = useCallback(() => {
    setQuery('');
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;
    searchInputRef.current?.focus();
    // The parent normally removes this component immediately when it closes,
    // so focus restoration belongs in the cleanup, not only in an `open=false`
    // render that never occurs for a conditionally-mounted menu.
    return () => focusMenuTrigger(triggerRef);
  }, [open, triggerRef]);

  // `hidden` is applied to the existing React menu items, never by replacing
  // their DOM or changing their handlers. This keeps action semantics and
  // disabled/error state owned by the menu's existing source.
  useLayoutEffect(() => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>(
      '[role="menuitem"]',
    ) ?? []);
    let nextVisibleCount = 0;
    items.forEach((element) => {
      const visible = search.matches(readableMenuItemText(element));
      element.hidden = !visible;
      if (visible) element.removeAttribute('aria-hidden');
      else element.setAttribute('aria-hidden', 'true');
      if (visible) nextVisibleCount += 1;
    });
    setVisibleCount(nextVisibleCount);
  }, [children, search.flags, search.mode, search.query]);

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.target === searchInputRef.current) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusRelativeMenuItem(menuRef.current, event.target, 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusRelativeMenuItem(menuRef.current, event.target, -1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusBoundaryMenuItem(menuRef.current, false);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusBoundaryMenuItem(menuRef.current, true);
    } else if (
      event.key === 'Enter' &&
      event.target instanceof HTMLElement &&
      event.target.getAttribute('role') === 'menuitem'
    ) {
      event.preventDefault();
      event.target.click();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu();
    }
  };

  const onSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeMenu();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'Enter') {
      event.preventDefault();
      const first = visibleMenuItems(menuRef.current)[0];
      if (first) {
        if (event.key === 'Enter') first.click();
        else first.focus();
      }
      return;
    }
    if (event.key === 'ArrowUp' || event.key === 'Home') {
      event.preventDefault();
      focusBoundaryMenuItem(menuRef.current, false);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      focusBoundaryMenuItem(menuRef.current, true);
    }
  };

  if (!open) return null;

  return (
    <MenuSearchContext.Provider value={{ search, registerItem }}>
      <div
        id={resolvedMenuId}
        ref={menuRef}
        className={className}
        role="menu"
        aria-label={menuLabel}
        onKeyDown={onMenuKeyDown}
      >
        <div className="file-viewer-menu-search" role="search">
          <RegexSearchField
            search={search}
            fieldLabel={menuLabel}
            id={`${resolvedMenuId}-search`}
            inputRef={searchInputRef}
            ariaControls={resolvedMenuId}
            ariaLabel={t('common.searchEllipsis')}
            placeholder={t('common.searchEllipsis')}
            autoFocus
            className="file-viewer-menu-search__input"
            hostClassName="file-viewer-menu-search__field"
            focusScopeId={resolvedMenuId}
            onKeyDown={onSearchKeyDown}
          />
          <span className="file-viewer-menu-search__count" role="status" aria-live="polite">
            {query.trim() && visibleCount === 0
              ? t('homeHero.noResults', { query: query.trim() })
              : t('promptTemplates.countLabel', { n: visibleCount })}
          </span>
        </div>
        {children}
      </div>
    </MenuSearchContext.Provider>
  );
}

export interface FileViewerMenuItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  menuItemId?: string;
  children: ReactNode;
}

export function FileViewerMenuItem({
  menuItemId,
  children,
  className,
  ...props
}: FileViewerMenuItemProps) {
  const context = useContext(MenuSearchContext);
  const fallbackId = useId();
  const id = menuItemId ?? fallbackId;
  const itemRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const element = itemRef.current;
    if (!context || !element) return undefined;
    return context.registerItem(id, element);
  }, [context, id]);

  return (
    <button
      {...props}
      ref={itemRef}
      type={props.type ?? 'button'}
      role={props.role ?? 'menuitem'}
      className={className}
    >
      {children}
    </button>
  );
}

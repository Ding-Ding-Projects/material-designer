import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

import { useT } from '../i18n';
import { RegexSearchField } from './regex/RegexSearchField';
import { useRegexSearch, type RegexSearchController } from './regex/useRegexSearch';

interface MenuSearchContextValue {
  search: RegexSearchController;
  registerItem: (id: string, element: HTMLElement) => () => void;
}

const MenuSearchContext = createContext<MenuSearchContextValue | null>(null);
type TriggerRef = { readonly current: HTMLElement | null };
type SurfaceKind = 'menu' | 'mixed';

interface MenuAction {
  id: string;
  label: string;
  section: string;
  element: HTMLElement;
}

export interface FileViewerMenuSearchProps {
  /** Stable route-local identifier used by the field-owned registry and builder. */
  menuId: string;
  /** Stable rendered field id, shared only by this exact menu instance. */
  fieldId?: string;
  /** Visible surface name used by the search field and accessibility tree. */
  menuLabel: string;
  open: boolean;
  onClose: () => void;
  /** The exact opener, or a wrapper containing the opener, to receive focus on close. */
  triggerRef?: TriggerRef;
  /** `mixed` is used for Share/Export/Access/Publish surfaces with nested widgets. */
  kind?: SurfaceKind;
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

function readableActionLabel(element: HTMLElement): string {
  const explicit = element.dataset.menuSearchText;
  if (explicit) return explicit;
  const accessible = element.getAttribute('aria-label');
  if (accessible) return accessible;
  const copy = element.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('[aria-hidden="true"]').forEach((node) => node.remove());
  return copy.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

function focusableElements(surface: HTMLElement | null, ownerToken: string): HTMLElement[] {
  if (!surface) return [];
  const own = Array.from(surface.querySelectorAll<HTMLElement>(
    'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
  ));
  const builder = document.querySelector<HTMLElement>(
    `[data-file-viewer-menu-builder="${CSS.escape(ownerToken)}"]`,
  );
  const nested = builder
    ? Array.from(builder.querySelectorAll<HTMLElement>(
        'input:not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled), [tabindex]:not([tabindex="-1"])',
      ))
    : [];
  return [...own, ...nested]
    .filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true')
    .filter((element, index, all) => all.indexOf(element) === index);
}

function isOwnedRegexBuilder(target: EventTarget | null, ownerToken: string): boolean {
  return target instanceof Element
    && Boolean(target.closest(`[data-file-viewer-menu-builder="${CSS.escape(ownerToken)}"]`));
}

function isOwnedSurface(target: EventTarget | null, ownerToken: string): boolean {
  return target instanceof Element
    && Boolean(target.closest(`[data-file-viewer-menu-surface="${CSS.escape(ownerToken)}"]`));
}

function isOwnedTrigger(target: EventTarget | null, triggerRef?: TriggerRef): boolean {
  const trigger = triggerRef?.current;
  return Boolean(trigger && target instanceof Node && trigger.contains(target));
}

export function focusRelativeMenuItem(
  actions: ReadonlyArray<{ element: HTMLElement }>,
  current: EventTarget | null,
  delta: number,
) {
  if (actions.length === 0) return;
  const index = Math.max(0, actions.findIndex((action) => action.element === current));
  const next = actions[(index + delta + actions.length) % actions.length] ?? actions[0];
  next?.element.focus();
}

function focusBoundaryMenuItem(actions: MenuAction[], last: boolean) {
  (last ? actions.at(-1) : actions[0])?.element.focus();
}

export function FileViewerMenuSearch({
  menuId,
  fieldId,
  menuLabel,
  open,
  onClose,
  triggerRef,
  kind = 'menu',
  className,
  children,
}: FileViewerMenuSearchProps) {
  const t = useT();
  const instanceId = useId().replace(/:/g, '');
  const resolvedSurfaceId = `${menuId}-${instanceId}`;
  const resolvedActionsId = `${resolvedSurfaceId}-actions`;
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const actionCollectionRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState('');
  const search = useRegexSearch(query, setQuery);
  const [registry, setRegistry] = useState<MenuAction[]>([]);
  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set());
  const [surfaceStyle, setSurfaceStyle] = useState<CSSProperties>({
    position: 'fixed',
    visibility: 'hidden',
  });

  const registerItem = useCallback((_id: string, _element: HTMLElement) => () => {}, []);

  const closeMenu = useCallback(() => {
    setQuery('');
    onClose();
  }, [onClose]);

  const rebuildRegistry = useCallback(() => {
    const collection = actionCollectionRef.current;
    if (!collection) return;
    const candidates = Array.from(collection.querySelectorAll<HTMLElement>(
      'button:not([type="hidden"]), a[href], [role="menuitem"]',
    ));
    const next = candidates
      .filter((element) => {
        // Nested listboxes and other widgets own their options and keyboard
        // model. Their controls are never stolen by the outer action registry.
        if (element.closest('[role="listbox"], [role="tree"], [role="tablist"]')) return false;
        if (element.closest('[data-file-viewer-menu-search-control]')) return false;
        return readableActionLabel(element).length > 0;
      })
      .map((element, index) => {
        if (kind === 'menu') element.setAttribute('role', 'menuitem');
        else if (element.getAttribute('role') === 'menuitem') element.removeAttribute('role');
        return {
          id: `${resolvedSurfaceId}-action-${index}`,
          label: readableActionLabel(element),
          section: element.closest<HTMLElement>('[data-menu-search-section]')?.dataset.menuSearchSection
            ?? menuLabel,
          element,
        };
      });
    setRegistry(next);
  }, [kind, menuLabel, resolvedSurfaceId]);

  useLayoutEffect(() => {
    rebuildRegistry();
  }, [children, rebuildRegistry]);

  useLayoutEffect(() => {
    const nextVisible = new Set<string>();
    registry.forEach((action) => {
      const visible = search.matches(action.label);
      action.element.hidden = !visible;
      if (visible) {
        action.element.removeAttribute('aria-hidden');
        nextVisible.add(action.id);
      } else {
        action.element.setAttribute('aria-hidden', 'true');
      }
    });
    setVisibleIds(nextVisible);
  }, [registry, search.flags, search.mode, search.matches, search.query]);

  const measureSurface = useCallback(() => {
    const trigger = triggerRef?.current;
    const surface = surfaceRef.current;
    if (!surface || typeof window === 'undefined') return;
    const margin = 12;
    const viewportWidth = Math.max(1, window.innerWidth);
    const viewportHeight = Math.max(1, window.innerHeight);
    const availableWidth = Math.max(1, viewportWidth - margin * 2);
    const availableHeight = Math.max(1, viewportHeight - margin * 2);
    if (!trigger) {
      setSurfaceStyle({
        position: 'fixed',
        left: margin,
        top: margin,
        width: availableWidth,
        maxWidth: availableWidth,
        maxHeight: availableHeight,
        overflowY: 'auto',
        boxSizing: 'border-box',
        visibility: 'visible',
      });
      return;
    }
    const triggerRect = trigger.getBoundingClientRect();
    const measuredWidth = Math.max(1, surface.scrollWidth || 280);
    const width = Math.min(availableWidth, measuredWidth);
    const roomBelow = viewportHeight - triggerRect.bottom - margin;
    const roomAbove = triggerRect.top - margin;
    const above = roomBelow < 300 && roomAbove > roomBelow;
    const maxHeight = Math.min(
      availableHeight,
      Math.max(1, (above ? roomAbove : roomBelow) - 8),
    );
    const left = Math.max(
      margin,
      Math.min(triggerRect.right - width, viewportWidth - width - margin),
    );
    const top = above ? triggerRect.top - 6 : triggerRect.bottom + 6;
    setSurfaceStyle({
      position: 'fixed',
      left,
      top,
      width,
      maxWidth: availableWidth,
      maxHeight,
      overflowY: 'auto',
      boxSizing: 'border-box',
      transform: above ? 'translateY(-100%)' : undefined,
      visibility: 'visible',
    });
  }, [triggerRef]);

  useLayoutEffect(() => {
    if (!open) return undefined;
    measureSurface();
    const onViewportChange = () => measureSurface();
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);
    return () => {
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
    };
  }, [measureSurface, open, registry.length]);

  useEffect(() => {
    if (!open) return undefined;
    if (triggerRef?.current) searchInputRef.current?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (isOwnedSurface(event.target, resolvedSurfaceId)) return;
      if (isOwnedTrigger(event.target, triggerRef)) return;
      if (isOwnedRegexBuilder(event.target, resolvedSurfaceId)) return;
      closeMenu();
    };
    const onFocusIn = (event: FocusEvent) => {
      if (isOwnedSurface(event.target, resolvedSurfaceId)) return;
      if (isOwnedTrigger(event.target, triggerRef)) return;
      if (isOwnedRegexBuilder(event.target, resolvedSurfaceId)) return;
      closeMenu();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('focusin', onFocusIn);
    // The parent normally removes this component immediately when it closes,
    // so restoration lives in cleanup and uses the actual opener ref.
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('focusin', onFocusIn);
      focusMenuTrigger(triggerRef);
    };
  }, [closeMenu, open, resolvedSurfaceId, triggerRef]);

  const visibleActions = registry.filter((action) => visibleIds.has(action.id));
  const keyboardActions = visibleActions.filter((action) => !action.element.matches(':disabled'));

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeMenu();
      return;
    }
    if (event.key === 'Tab') {
      if (kind === 'menu') {
        event.preventDefault();
        closeMenu();
        return;
      }
      const focusables = focusableElements(surfaceRef.current, resolvedSurfaceId);
      if (focusables.length === 0) return;
      event.preventDefault();
      const currentIndex = focusables.indexOf(document.activeElement as HTMLElement);
      const nextIndex = event.shiftKey
        ? (currentIndex <= 0 ? focusables.length - 1 : currentIndex - 1)
        : (currentIndex + 1) % focusables.length;
      focusables[nextIndex]?.focus();
      return;
    }
    // Mixed Share/Export/Access/Publish surfaces contain their own tablist,
    // listbox, text, and button keyboard models. The outer owner handles only
    // Escape and focus containment; it never steals their arrow/Enter keys.
    if (kind === 'mixed') return;
    const action = keyboardActions.find((candidate) => candidate.element === event.target);
    if (!action) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusRelativeMenuItem(keyboardActions, event.target, 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusRelativeMenuItem(keyboardActions, event.target, -1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusBoundaryMenuItem(keyboardActions, false);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusBoundaryMenuItem(keyboardActions, true);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      action.element.click();
    }
  };

  const onSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeMenu();
      return;
    }
    if (kind === 'mixed') return;
    if (event.key === 'ArrowDown' || event.key === 'Enter') {
      event.preventDefault();
      const first = keyboardActions[0];
      if (first) {
        if (event.key === 'Enter') first.element.click();
        else first.element.focus();
      }
      return;
    }
    if (event.key === 'ArrowUp' || event.key === 'Home') {
      event.preventDefault();
      focusBoundaryMenuItem(keyboardActions, false);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      focusBoundaryMenuItem(keyboardActions, true);
    }
  };

  if (!open) return null;

  const surface = (
    <div
      id={resolvedSurfaceId}
      ref={surfaceRef}
      className={className}
      role={kind === 'mixed' ? 'dialog' : 'group'}
      aria-label={menuLabel}
      data-file-viewer-menu-surface={resolvedSurfaceId}
      style={surfaceStyle}
      onKeyDown={onMenuKeyDown}
    >
      <div className="file-viewer-menu-search" role="search" data-file-viewer-menu-search-control>
        <RegexSearchField
          search={search}
          fieldLabel={menuLabel}
          id={fieldId ?? `${resolvedSurfaceId}-search`}
          fieldId={fieldId ?? `${resolvedSurfaceId}-search`}
          inputRef={searchInputRef}
          ariaControls={resolvedActionsId}
          ariaLabel={t('common.searchEllipsis')}
          placeholder={t('common.searchEllipsis')}
          autoFocus={Boolean(triggerRef?.current)}
          className="file-viewer-menu-search__input"
          hostClassName="file-viewer-menu-search__field"
          focusScopeId={resolvedSurfaceId}
          onKeyDown={onSearchKeyDown}
        />
        <span className="file-viewer-menu-search__count" role="status" aria-live="polite">
          {query.trim() && visibleActions.length === 0
            ? t('homeHero.noResults', { query: query.trim() })
            : t('promptTemplates.countLabel', { n: visibleActions.length })}
        </span>
      </div>
      <div
        ref={actionCollectionRef}
        id={resolvedActionsId}
        role={kind === 'menu' ? 'menu' : 'group'}
        aria-label={kind === 'menu' ? menuLabel : `${menuLabel} actions`}
        data-file-viewer-menu-actions={resolvedSurfaceId}
      >
        {children}
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(
    <MenuSearchContext.Provider value={{ search, registerItem }}>
      {surface}
    </MenuSearchContext.Provider>,
    document.body,
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

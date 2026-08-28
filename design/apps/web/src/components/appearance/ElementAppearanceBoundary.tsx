import { createPortal } from 'react-dom';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';

import { RegexSearchField } from '../regex/RegexSearchField';
import { useRegexSearch } from '../regex/useRegexSearch';
import { ElementAppearanceEditor } from './ElementAppearanceEditor';
import { applyAppearanceStateToElement, clearAppearanceStateFromElement, getElementAppearance, hasElementAppearanceOverride, MAX_APPEARANCE_TARGETS, resetAllElementAppearances, resolveAppearanceState, useAppearanceRegistry, type AppearanceTarget, type RenderedElement } from './elementAppearance';

interface ElementAppearanceBoundaryProps {
  children: ReactNode;
  /** The owning surface can connect its own lock wizard without this lane owning credentials. */
  onLockElement?: (target: AppearanceTarget) => void;
}

interface MenuPosition {
  top: number;
  left: number;
}

export const TARGET_ID_COLLISION_POLICY = 'semantic identity plus first-seen ordinal within the renderer lifetime';

function targetBaseFor(element: RenderedElement, index: number): string {
  const segments: string[] = [];
  let current: Element | null = element;
  let depth = 0;
  while (current && depth < 8) {
    const stable = current.getAttribute('data-testid') || current.id || current.getAttribute('aria-label');
    if (stable) segments.unshift(stable.replace(/[^a-zA-Z0-9_-]/g, '_'));
    else {
      const currentElement = current;
      const siblings = current.parentElement ? [...current.parentElement.children].filter((child) => child.tagName === currentElement.tagName) : [];
      const ordinal = Math.max(1, siblings.indexOf(currentElement) + 1);
      segments.unshift(`${current.tagName.toLowerCase()}-${ordinal}`);
    }
    current = current.parentElement;
    depth += 1;
  }
  return `appearance:${segments.join('/') || `element-${index}`}`;
}

function labelFor(element: RenderedElement, index: number): string {
  return element.getAttribute('aria-label')
    || element.getAttribute('title')
    || element.textContent?.trim().replace(/\s+/g, ' ').slice(0, 100)
    || `${element.tagName.toLowerCase()} ${index + 1}`;
}

function buildTarget(element: RenderedElement, index: number, id: string): AppearanceTarget {
  return {
    id,
    label: labelFor(element, index),
    role: element.getAttribute('role') || element.tagName.toLowerCase(),
    path: element.getAttribute('data-testid') ? `[data-testid="${element.getAttribute('data-testid')}"]` : element.id ? `#${element.id}` : element.tagName.toLowerCase(),
    element,
  };
}

function collectRenderedElements(root: ParentNode): RenderedElement[] {
  const found: RenderedElement[] = [];
  const visit = (parent: ParentNode) => {
    parent.childNodes.forEach((node) => {
      if (!(node instanceof HTMLElement) && !(node instanceof SVGElement)) return;
      found.push(node);
      if (node.shadowRoot) visit(node.shadowRoot);
      visit(node);
    });
  };
  visit(root);
  return found;
}

function clampMenuPosition(position: MenuPosition): MenuPosition {
  if (typeof window === 'undefined') return position;
  return {
    left: Math.max(12, Math.min(position.left, window.innerWidth - 320)),
    top: Math.max(12, Math.min(position.top, window.innerHeight - 260)),
  };
}

/**
 * Registers every rendered descendant and gives it the same target-specific
 * context actions. A MutationObserver keeps the inventory truthful as panels,
 * menus and stateful controls mount or unmount. Pointer, keyboard and long
 * press routes all resolve the exact target before opening the menu.
 */
export function ElementAppearanceBoundary({ children, onLockElement }: ElementAppearanceBoundaryProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const elementIdsRef = useRef(new WeakMap<RenderedElement, string>());
  const nextIdByBaseRef = useRef(new Map<string, number>());
  const pressTimerRef = useRef<number | null>(null);
  const { register, unregister, targets, get } = useAppearanceRegistry();
  const [activeTargetId, setActiveTargetId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const [editorTarget, setEditorTarget] = useState<AppearanceTarget | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuQuery, setMenuQuery] = useState('');
  const menuSearch = useRegexSearch(menuQuery, setMenuQuery);
  const activeTarget = activeTargetId ? get(activeTargetId) : undefined;

  const scan = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const observationRoot = typeof document !== 'undefined' ? document.body : root;
    const elements = [root, ...collectRenderedElements(observationRoot).filter((element) => element !== root)];
    const live = new Set<string>();
    elements.forEach((element, index) => {
      let id = elementIdsRef.current.get(element);
      if (!id) {
        const base = targetBaseFor(element, index);
        const next = nextIdByBaseRef.current.get(base) ?? 0;
        nextIdByBaseRef.current.set(base, next + 1);
        id = `${base}:${next}`;
        elementIdsRef.current.set(element, id);
      }
      const target = buildTarget(element, index, id);
      live.add(target.id);
      register(target);
      if (hasElementAppearanceOverride(target.id)) {
        const saved = getElementAppearance(target.id);
        applyAppearanceStateToElement(element, resolveAppearanceState(saved), saved.activeState);
      }
    });
    targets.forEach((target) => {
      if (!live.has(target.id)) unregister(target.id);
    });
  }, [register, targets, unregister]);

  useEffect(() => {
    scan();
    const root = rootRef.current;
    if (!root || typeof MutationObserver === 'undefined') return;
    const observer = new MutationObserver(scan);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['id', 'aria-label', 'data-testid', 'title'] });
    return () => observer.disconnect();
  }, [scan]);

  const openMenu = useCallback((target: AppearanceTarget, position: MenuPosition) => {
    setActiveTargetId(target.id);
    setMenuPosition(clampMenuPosition(position));
    setMenuQuery('');
  }, []);

  const resolveEventTarget = useCallback((eventTarget: EventTarget | null): AppearanceTarget | undefined => {
    if (!(eventTarget instanceof HTMLElement) && !(eventTarget instanceof SVGElement)) return undefined;
    const direct = targets.find((target) => target.element === eventTarget);
    if (direct) return direct;
    const nearest = eventTarget.closest<RenderedElement>('[data-testid], [id], button, input, select, textarea, a, [role]');
    return nearest ? targets.find((target) => target.element === nearest) : undefined;
  }, [targets]);

  const handleContextMenu = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    const target = resolveEventTarget(event.target);
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.shiftKey) {
      setEditorTarget(target);
      return;
    }
    openMenu(target, { top: event.clientY, left: event.clientX });
  }, [openMenu, resolveEventTarget]);

  const handleKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!(event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey))) return;
    const target = resolveEventTarget(document.activeElement);
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = target.element?.getBoundingClientRect();
    openMenu(target, { top: rect?.bottom ?? 80, left: rect?.left ?? 80 });
  }, [openMenu, resolveEventTarget]);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'touch') return;
    const target = resolveEventTarget(event.target);
    if (!target) return;
    if (pressTimerRef.current !== null) window.clearTimeout(pressTimerRef.current);
    pressTimerRef.current = window.setTimeout(() => {
      const rect = target.element?.getBoundingClientRect();
      openMenu(target, { top: rect?.bottom ?? event.clientY, left: rect?.left ?? event.clientX });
    }, 550);
  }, [openMenu, resolveEventTarget]);

  const cancelLongPress = useCallback(() => {
    if (pressTimerRef.current !== null) window.clearTimeout(pressTimerRef.current);
    pressTimerRef.current = null;
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onNativeContextMenu = (event: MouseEvent) => {
      const target = resolveEventTarget(event.target);
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.shiftKey) {
        setEditorTarget(target);
        return;
      }
      openMenu(target, { top: event.clientY, left: event.clientX });
    };
    const onNativeKeyDown = (event: KeyboardEvent) => {
      if (!(event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey))) return;
      const target = resolveEventTarget(document.activeElement);
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      const rect = target.element?.getBoundingClientRect();
      openMenu(target, { top: rect?.bottom ?? 80, left: rect?.left ?? 80 });
    };
    const onNativePointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') return;
      const target = resolveEventTarget(event.target);
      if (!target) return;
      if (pressTimerRef.current !== null) window.clearTimeout(pressTimerRef.current);
      pressTimerRef.current = window.setTimeout(() => {
        const rect = target.element?.getBoundingClientRect();
        openMenu(target, { top: rect?.bottom ?? event.clientY, left: rect?.left ?? event.clientX });
      }, 550);
    };
    document.addEventListener('contextmenu', onNativeContextMenu, true);
    document.addEventListener('keydown', onNativeKeyDown, true);
    document.addEventListener('pointerdown', onNativePointerDown, true);
    document.addEventListener('pointerup', cancelLongPress, true);
    document.addEventListener('pointercancel', cancelLongPress, true);
    return () => {
      document.removeEventListener('contextmenu', onNativeContextMenu, true);
      document.removeEventListener('keydown', onNativeKeyDown, true);
      document.removeEventListener('pointerdown', onNativePointerDown, true);
      document.removeEventListener('pointerup', cancelLongPress, true);
      document.removeEventListener('pointercancel', cancelLongPress, true);
    };
  }, [cancelLongPress, openMenu, resolveEventTarget]);

  const visibleActions = useMemo(() => [
    { id: 'edit', label: 'Edit appearance…', available: true },
    { id: 'lock', label: 'Lock this element…', available: Boolean(onLockElement) },
    { id: 'reset-all', label: 'Reset all appearance…', available: targets.length > 0 },
    { id: 'close', label: 'Close menu', available: true },
  ].filter((action) => menuSearch.matches(action.label)), [menuSearch, onLockElement, targets.length]);

  const closeMenu = useCallback(() => {
    setMenuPosition(null);
    setActiveTargetId(null);
    setMenuQuery('');
    activeTarget?.element?.focus();
  }, [activeTarget]);

  useEffect(() => {
    if (!menuPosition) return;
    const menu = menuRef.current;
    const search = menu?.querySelector<HTMLInputElement>('input[type="search"]');
    search?.focus();
    const items = () => [...(menu?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])].filter((item) => !item.disabled);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); if (menuQuery) setMenuQuery(''); else closeMenu(); return; }
      const itemList = items();
      const index = itemList.indexOf(document.activeElement as HTMLButtonElement);
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (itemList.length === 0) return;
        itemList[(index + (event.key === 'ArrowDown' ? 1 : -1) + itemList.length) % itemList.length]?.focus();
      } else if (event.key === 'Enter' && document.activeElement instanceof HTMLButtonElement && document.activeElement.getAttribute('role') === 'menuitem') {
        event.preventDefault();
        document.activeElement.click();
      }
    };
    const onOutside = (event: MouseEvent) => {
      const builder = document.querySelector('[data-testid="element-context-menu-search-regex-popover"]');
      if (!menu?.contains(event.target as Node) && !builder?.contains(event.target as Node)) closeMenu();
    };
    menu?.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onOutside, true);
    return () => {
      menu?.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onOutside, true);
    };
  }, [closeMenu, menuPosition, menuQuery]);

  return (
    <div
      ref={rootRef}
      data-appearance-surface="true"
      onContextMenu={handleContextMenu}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      onPointerUp={cancelLongPress}
      onPointerCancel={cancelLongPress}
      onPointerLeave={cancelLongPress}
    >
      {children}
      {targets.length >= MAX_APPEARANCE_TARGETS ? <div role="status" aria-live="polite" data-appearance-target-cap="true">Appearance target limit reached: {MAX_APPEARANCE_TARGETS}. New elements remain uncustomized.</div> : null}
      {menuPosition && activeTarget && typeof document !== 'undefined' ? createPortal(
        <div
          ref={menuRef}
          data-appearance-editor="menu"
          role="menu"
          aria-label={`Actions for ${activeTarget.label}`}
          style={{ position: 'fixed', ...menuPosition, zIndex: 1001, width: 300, padding: 12, borderRadius: 16, background: 'var(--md-sys-color-surface-container-high, #fff)', border: '1px solid var(--md-sys-color-outline-variant, #777)', boxShadow: 'var(--md-sys-elevation-level3, 0 8px 28px rgb(0 0 0 / 28%))' }}
        >
          <RegexSearchField search={menuSearch} fieldLabel="element actions" ariaLabel="Search element actions" placeholder="Search actions" testId="element-context-menu-search" />
          <p role="status" aria-live="polite" style={{ margin: '8px 0', fontSize: 12 }}>{visibleActions.length} actions shown for {activeTarget.label}</p>
          {visibleActions.map((action) => (
            <button
              key={action.id}
              type="button"
              role="menuitem"
              disabled={!action.available}
              title={!action.available ? 'The owning surface has not supplied its lock service.' : undefined}
              style={{ display: 'block', width: '100%', minHeight: 48, marginTop: 4, textAlign: 'left' }}
              onClick={() => {
                if (action.id === 'edit') {
                  setEditorTarget(activeTarget);
                  setMenuPosition(null);
                } else if (action.id === 'lock' && onLockElement) {
                  onLockElement(activeTarget);
                  closeMenu();
                } else if (action.id === 'reset-all') {
                  resetAllElementAppearances(targets.map((target) => target.id));
                  targets.forEach((target) => {
                    clearAppearanceStateFromElement(target.element);
                  });
                  closeMenu();
                } else {
                  closeMenu();
                }
              }}
            >
              {action.label}
            </button>
          ))}
        </div>,
        document.body,
      ) : null}
      {editorTarget ? <ElementAppearanceEditor target={editorTarget} onClose={() => { setEditorTarget(null); editorTarget.element?.focus(); }} /> : null}
    </div>
  );
}

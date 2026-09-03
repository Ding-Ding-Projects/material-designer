import { createPortal } from 'react-dom';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';

import { RegexSearchField } from '../regex/RegexSearchField';
import { useRegexSearch } from '../regex/useRegexSearch';
import { useI18n } from '../../i18n';
import { ElementAppearanceEditor } from './ElementAppearanceEditor';
import { appearanceCopy, type AppearanceCopy } from './copy';
import { ELEMENT_TOY_LOCK_ACTIVATION, ELEMENT_TOY_LOCK_REQUEST, ELEMENT_TOY_LOCK_STATE, publishElementToyLockConfigurationRequest, requestElementToyLockActivation, type ElementToyLockRequestDetail, type ElementToyLockStateDetail } from './toyLockAdapter';
import { applyAppearanceStateToElement, clearAppearanceStateFromElement, getElementAppearance, hasElementAppearanceOverride, MAX_APPEARANCE_TARGETS, resetAllElementAppearances, resolveAppearanceState, useAppearanceRegistry, type AppearanceState, type AppearanceTarget, type RenderedElement } from './elementAppearance';

export interface ElementAppearanceBoundaryProps {
  children: ReactNode;
  /** The owning surface supplies the active language and funny-level copy. */
  copy?: AppearanceCopy;
  /** The owning surface can connect its own lock wizard without this lane owning credentials. */
  onLockElement?: (target: AppearanceTarget) => void;
  /**
   * Optional observation scope for embedded surfaces. The application shell
   * defaults to document.body so portalled controls remain reachable, while a
   * mounted isolated surface can pass its own root to avoid registering a
   * sibling surface's elements.
   */
  observationRoot?: ParentNode;
}

export type { AppearanceCopy } from './copy';

/**
 * Cross-lane settings handoff. Kept as a small event protocol so mounting the
 * appearance boundary never requires a settings implementation to be imported.
 * The settings lane may publish this event when its own consumer is available.
 */
export const SETTINGS_TAB_APPEARANCE_EDITOR_EVENT = 'od:settings-tab-appearance-editor';
export interface SettingsTabAppearanceRequest {
  readonly section: string;
  readonly anchor: HTMLButtonElement;
}

interface MenuPosition {
  top: number;
  left: number;
}

export const TARGET_ID_COLLISION_POLICY = 'explicit product-owned ids first; deterministic semantic digest fallback; unresolved collisions are visibly unsupported';

function stableDigest(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function targetBaseFor(element: RenderedElement): string {
  const stable = element.getAttribute('data-testid') || element.id || (element.getAttribute('data-appearance-surface') === 'true' ? 'appearance-surface' : null);
  if (stable) return `appearance:${stable.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  const semantic = [element.tagName, element.getAttribute('role') || '', element.getAttribute('aria-label') || '', element.getAttribute('title') || '', element.getAttribute('name') || '', element.getAttribute('placeholder') || '', (element.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 160)].join('|');
  return `appearance:generated-${stableDigest(semantic)}`;
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

function resolveDeepestActiveElement(root: Document | ShadowRoot): RenderedElement | null {
  const active = root.activeElement;
  if (!(active instanceof HTMLElement) && !(active instanceof SVGElement)) return null;
  if (active.shadowRoot) return resolveDeepestActiveElement(active.shadowRoot) ?? active;
  return active;
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
export function ElementAppearanceBoundary({ children, copy, onLockElement, observationRoot }: ElementAppearanceBoundaryProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const i18n = useI18n();
  const fallbackCopy = useCallback((english: string, cantonese: string) => appearanceCopy(i18n, english, cantonese), [i18n]);
  const c = copy ?? fallbackCopy;
  const elementIdsRef = useRef(new WeakMap<RenderedElement, string>());
  const pressTimerRef = useRef<number | null>(null);
  const { register, unregister, targets, get } = useAppearanceRegistry();
  const [activeTargetId, setActiveTargetId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const [editorTarget, setEditorTarget] = useState<AppearanceTarget | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuQuery, setMenuQuery] = useState('');
  const [lockedTargetIds, setLockedTargetIds] = useState<ReadonlySet<string>>(() => new Set());
  const [unsupportedTargetCount, setUnsupportedTargetCount] = useState(0);
  const menuSearch = useRegexSearch(menuQuery, setMenuQuery);
  const activeTarget = activeTargetId ? get(activeTargetId) : undefined;
  const targetsRef = useRef<readonly AppearanceTarget[]>([]);
  const lockOriginalsRef = useRef(new WeakMap<RenderedElement, { locked: string | null; ariaDisabled: string | null }>());
  targetsRef.current = targets;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onLockState = (event: Event) => {
      const detail = (event as CustomEvent<ElementToyLockStateDetail>).detail;
      if (!detail || typeof detail.targetId !== 'string' || typeof detail.locked !== 'boolean') return;
      setLockedTargetIds((current) => {
        const next = new Set(current);
        if (detail.locked) next.add(detail.targetId); else next.delete(detail.targetId);
        return next;
      });
    };
    window.addEventListener(ELEMENT_TOY_LOCK_STATE, onLockState);
    return () => window.removeEventListener(ELEMENT_TOY_LOCK_STATE, onLockState);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onLockRequest = (event: Event) => {
      const detail = (event as CustomEvent<ElementToyLockRequestDetail>).detail;
      if (!detail || typeof detail.targetId !== 'string' || !detail.anchor) return;
      publishElementToyLockConfigurationRequest(detail);
    };
    window.addEventListener(ELEMENT_TOY_LOCK_REQUEST, onLockRequest);
    return () => window.removeEventListener(ELEMENT_TOY_LOCK_REQUEST, onLockRequest);
  }, []);

  useEffect(() => {
    targets.forEach((target) => {
      if (target.element && !lockOriginalsRef.current.has(target.element)) {
        lockOriginalsRef.current.set(target.element, {
          locked: target.element.getAttribute('data-appearance-locked'),
          ariaDisabled: target.element.getAttribute('aria-disabled'),
        });
      }
      const original = target.element ? lockOriginalsRef.current.get(target.element) : undefined;
      if (lockedTargetIds.has(target.id)) {
        target.element?.setAttribute('aria-disabled', 'true');
        target.element?.setAttribute('data-appearance-locked', 'true');
      } else if (target.element && original) {
        if (original.locked === null) target.element.removeAttribute('data-appearance-locked');
        else target.element.setAttribute('data-appearance-locked', original.locked);
        if (original.ariaDisabled === null) target.element.removeAttribute('aria-disabled');
        else target.element.setAttribute('aria-disabled', original.ariaDisabled);
      }
    });
  }, [lockedTargetIds, targets]);

  const scan = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const scope = observationRoot ?? (typeof document !== 'undefined' ? document.body : root);
    const elements = [root, ...collectRenderedElements(scope).filter((element) => element !== root)];
    const live = new Set<string>();
    const identityOwners = new Map<string, RenderedElement>();
    let unsupported = 0;
    elements.forEach((element, index) => {
      const existing = elementIdsRef.current.get(element);
      const id = existing ?? targetBaseFor(element);
      const owner = identityOwners.get(id);
      if (owner && owner !== element) { unsupported += 1; element.setAttribute('data-appearance-identity-unsupported', 'true'); live.delete(id); unregister(id); return; }
      element.removeAttribute('data-appearance-identity-unsupported');
      identityOwners.set(id, element);
      elementIdsRef.current.set(element, id);
      const target = buildTarget(element, index, id);
      live.add(target.id);
      register(target);
      if (hasElementAppearanceOverride(target.id)) {
        const saved = getElementAppearance(target.id);
        applyAppearanceStateToElement(element, resolveAppearanceState(saved), saved.activeState);
      }
    });
    // Read the previous inventory through the ref, not the render value: with
    // `targets` in the dependency list every registration gave `scan` a new
    // identity, which re-ran the observer effect below, which scanned again.
    targetsRef.current.forEach((target) => {
      if (!live.has(target.id)) unregister(target.id);
    });
    setUnsupportedTargetCount(unsupported);
  }, [c, observationRoot, register, unregister]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof MutationObserver === 'undefined') return;
    const scope = observationRoot ?? (typeof document !== 'undefined' ? document.body : root);
    const options: MutationObserverInit = { childList: true, subtree: true, attributes: true, attributeFilter: ['id', 'aria-label', 'data-testid', 'title'] };
    const observer = new MutationObserver(() => {
      scan();
      const elements = [scope instanceof Element ? scope : null, ...collectRenderedElements(scope)].filter((element): element is RenderedElement => element !== null);
      elements.forEach((element) => {
        if (element.shadowRoot && !observedRoots.has(element.shadowRoot)) {
          observedRoots.add(element.shadowRoot);
          observer.observe(element.shadowRoot, options);
        }
      });
    });
    const observedRoots = new WeakSet<Node>();
    observer.observe(scope as Node, options);
    observedRoots.add(scope as Node);
    const initialElements = [scope instanceof Element ? scope : null, ...collectRenderedElements(scope)].filter((element): element is RenderedElement => element !== null);
    initialElements.forEach((element) => {
      if (element.shadowRoot && !observedRoots.has(element.shadowRoot)) {
        observedRoots.add(element.shadowRoot);
        observer.observe(element.shadowRoot, options);
      }
    });
    scan();
    return () => observer.disconnect();
  }, [observationRoot, scan]);

  useEffect(() => () => {
    // The boundary owns the inline projection and its marker attributes. Do
    // not leave an unmounted surface looking customized or locked because the
    // registry that applied it has gone away.
    targetsRef.current.forEach((target) => {
      clearAppearanceStateFromElement(target.element);
      const original = target.element ? lockOriginalsRef.current.get(target.element) : undefined;
      if (target.element && original) {
        if (original.locked === null) target.element.removeAttribute('data-appearance-locked');
        else target.element.setAttribute('data-appearance-locked', original.locked);
        if (original.ariaDisabled === null) target.element.removeAttribute('aria-disabled');
        else target.element.setAttribute('aria-disabled', original.ariaDisabled);
      }
    });
  }, []);

  const openMenu = useCallback((target: AppearanceTarget, position: MenuPosition) => {
    setActiveTargetId(target.id);
    setMenuPosition(clampMenuPosition(position));
    setMenuQuery('');
  }, []);

  const resolveEventTarget = useCallback((eventTarget: EventTarget | null, composedPath: readonly EventTarget[] = []): AppearanceTarget | undefined => {
    for (const candidate of [eventTarget, ...composedPath]) {
      if (!(candidate instanceof HTMLElement) && !(candidate instanceof SVGElement)) continue;
      const direct = targets.find((target) => target.element === candidate);
      if (direct) return direct;
      const nearest = candidate.closest<RenderedElement>('[data-testid], [id], button, input, select, textarea, a, [role]');
      const target = nearest ? targets.find((item) => item.element === nearest) : undefined;
      if (target) return target;
    }
    return undefined;
  }, [targets]);

  const handleContextMenu = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    const target = resolveEventTarget(event.target, event.nativeEvent.composedPath());
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
    const target = resolveEventTarget(resolveDeepestActiveElement(document), event.nativeEvent.composedPath());
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = target.element?.getBoundingClientRect();
    openMenu(target, { top: rect?.bottom ?? 80, left: rect?.left ?? 80 });
  }, [openMenu, resolveEventTarget]);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'touch') return;
    const target = resolveEventTarget(event.target, event.nativeEvent.composedPath());
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
      const target = resolveEventTarget(event.target, event.composedPath());
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
      const target = resolveEventTarget(resolveDeepestActiveElement(document), event.composedPath());
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      const rect = target.element?.getBoundingClientRect();
      openMenu(target, { top: rect?.bottom ?? 80, left: rect?.left ?? 80 });
    };
    const onNativePointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') return;
      const target = resolveEventTarget(event.target, event.composedPath());
      if (!target) return;
      if (lockedTargetIds.has(target.id)) {
        event.preventDefault();
        event.stopPropagation();
        requestElementToyLockActivation(target);
        return;
      }
      if (pressTimerRef.current !== null) window.clearTimeout(pressTimerRef.current);
      pressTimerRef.current = window.setTimeout(() => {
        const rect = target.element?.getBoundingClientRect();
        openMenu(target, { top: rect?.bottom ?? event.clientY, left: rect?.left ?? event.clientX });
      }, 550);
    };
    const onNativeClick = (event: MouseEvent) => {
      const target = resolveEventTarget(event.target, event.composedPath());
      if (!target || !lockedTargetIds.has(target.id)) return;
      event.preventDefault();
      event.stopPropagation();
      requestElementToyLockActivation(target);
    };
    const onNativeActivationKey = (event: KeyboardEvent) => {
      if (!(event.key === 'Enter' || event.key === ' ')) return;
      const target = resolveEventTarget(resolveDeepestActiveElement(document), event.composedPath());
      if (!target || !lockedTargetIds.has(target.id)) return;
      event.preventDefault();
      event.stopPropagation();
      requestElementToyLockActivation(target);
    };
    document.addEventListener('contextmenu', onNativeContextMenu, true);
    document.addEventListener('keydown', onNativeKeyDown, true);
    document.addEventListener('pointerdown', onNativePointerDown, true);
    document.addEventListener('click', onNativeClick, true);
    document.addEventListener('keydown', onNativeActivationKey, true);
    document.addEventListener('pointerup', cancelLongPress, true);
    document.addEventListener('pointercancel', cancelLongPress, true);
    return () => {
      document.removeEventListener('contextmenu', onNativeContextMenu, true);
      document.removeEventListener('keydown', onNativeKeyDown, true);
      document.removeEventListener('pointerdown', onNativePointerDown, true);
      document.removeEventListener('click', onNativeClick, true);
      document.removeEventListener('keydown', onNativeActivationKey, true);
      document.removeEventListener('pointerup', cancelLongPress, true);
      document.removeEventListener('pointercancel', cancelLongPress, true);
    };
  }, [cancelLongPress, lockedTargetIds, openMenu, resolveEventTarget]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onSettingsAppearanceRequest = (event: Event) => {
      const detail = (event as CustomEvent<SettingsTabAppearanceRequest>).detail;
      if (!detail || !detail.anchor || detail.section !== 'appearance') return;
      const target = resolveEventTarget(detail.anchor);
      if (target) setEditorTarget(target);
    };
    window.addEventListener(SETTINGS_TAB_APPEARANCE_EDITOR_EVENT, onSettingsAppearanceRequest);
    return () => window.removeEventListener(SETTINGS_TAB_APPEARANCE_EDITOR_EVENT, onSettingsAppearanceRequest);
  }, [resolveEventTarget]);

  const applyInteractionState = useCallback((element: EventTarget | null, state: AppearanceState, composedPath: readonly EventTarget[] = []) => {
    const target = resolveEventTarget(element, composedPath);
    if (!target || !hasElementAppearanceOverride(target.id)) return;
    const saved = getElementAppearance(target.id);
    applyAppearanceStateToElement(target.element, resolveAppearanceState(saved, state), state);
  }, [resolveEventTarget]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onPointerOver = (event: PointerEvent) => applyInteractionState(event.target, 'hover', event.composedPath());
    const onPointerOut = (event: PointerEvent) => applyInteractionState(event.target, 'normal', event.composedPath());
    const onFocusIn = (event: FocusEvent) => applyInteractionState(event.target, 'focus', event.composedPath());
    const onFocusOut = (event: FocusEvent) => applyInteractionState(event.target, 'normal', event.composedPath());
    const onPointerDown = (event: PointerEvent) => applyInteractionState(event.target, 'pressed', event.composedPath());
    const onPointerUp = (event: PointerEvent) => applyInteractionState(event.target, 'selected', event.composedPath());
    const onDragStart = (event: DragEvent) => applyInteractionState(event.target, 'dragged', event.composedPath());
    const onDragEnd = (event: DragEvent) => applyInteractionState(event.target, 'normal', event.composedPath());
    const onInvalid = (event: Event) => applyInteractionState(event.target, 'validation', event.composedPath());
    const onLoadStart = (event: Event) => applyInteractionState(event.target, 'loading', event.composedPath());
    const onLoad = (event: Event) => applyInteractionState(event.target, 'success', event.composedPath());
    const onError = (event: Event) => applyInteractionState(event.target, 'error', event.composedPath());
    document.addEventListener('pointerover', onPointerOver, true);
    document.addEventListener('pointerout', onPointerOut, true);
    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('focusout', onFocusOut, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('pointerup', onPointerUp, true);
    document.addEventListener('dragstart', onDragStart, true);
    document.addEventListener('dragend', onDragEnd, true);
    document.addEventListener('invalid', onInvalid, true);
    document.addEventListener('loadstart', onLoadStart, true);
    document.addEventListener('load', onLoad, true);
    document.addEventListener('error', onError, true);
    return () => {
      document.removeEventListener('pointerover', onPointerOver, true);
      document.removeEventListener('pointerout', onPointerOut, true);
      document.removeEventListener('focusin', onFocusIn, true);
      document.removeEventListener('focusout', onFocusOut, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('pointerup', onPointerUp, true);
      document.removeEventListener('dragstart', onDragStart, true);
      document.removeEventListener('dragend', onDragEnd, true);
      document.removeEventListener('invalid', onInvalid, true);
      document.removeEventListener('loadstart', onLoadStart, true);
      document.removeEventListener('load', onLoad, true);
      document.removeEventListener('error', onError, true);
    };
  }, [applyInteractionState]);

  const visibleActions = useMemo(() => [
    { id: 'edit', label: c('Edit appearance…', '編輯外觀…'), available: true },
    { id: 'lock', label: c('Lock this element…', '鎖定此元素…'), available: Boolean(onLockElement) },
    { id: 'reset-all', label: c('Reset all appearance…', '重設所有外觀…'), available: targets.length > 0 },
    { id: 'close', label: c('Close menu', '關閉選單'), available: true },
  ].filter((action) => menuSearch.matches(action.label)), [c, menuSearch, onLockElement, targets.length]);

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
      {unsupportedTargetCount > 0 ? <div role="status" aria-live="polite" data-appearance-unsupported-targets="true">{c(`${unsupportedTargetCount} rendered elements need an explicit data-testid or id before appearance editing is available.`, `${unsupportedTargetCount} 個已渲染元素需要明確 data-testid 或 id，才可使用外觀編輯。`)}</div> : null}
      {targets.length >= MAX_APPEARANCE_TARGETS ? <div role="status" aria-live="polite" data-appearance-target-cap="true">{c(`Appearance target limit reached: ${MAX_APPEARANCE_TARGETS}. New elements remain uncustomized.`, `已達外觀目標上限：${MAX_APPEARANCE_TARGETS}。新元素維持未自訂。`)}</div> : null}
      {menuPosition && activeTarget && typeof document !== 'undefined' ? createPortal(
        <div
          ref={menuRef}
          data-appearance-editor="menu"
          role="menu"
          aria-label={`${c('Actions for', '操作對象')} ${activeTarget.label}`}
          style={{ position: 'fixed', ...menuPosition, zIndex: 1001, width: 300, padding: 12, borderRadius: 16, background: 'var(--md-sys-color-surface-container-high, #fff)', border: '1px solid var(--md-sys-color-outline-variant, #777)', boxShadow: 'var(--md-sys-elevation-level3, 0 8px 28px rgb(0 0 0 / 28%))' }}
        >
          <RegexSearchField search={menuSearch} fieldLabel={c('element actions', '元素操作')} ariaLabel={c('Search element actions', '搜尋元素操作')} placeholder={c('Search actions', '搜尋操作')} testId="element-context-menu-search" />
          <p role="status" aria-live="polite" style={{ margin: '8px 0', fontSize: 12 }}>{c(`${visibleActions.length} actions shown for ${activeTarget.label}`, `顯示 ${visibleActions.length} 項操作：${activeTarget.label}`)}</p>
          {visibleActions.map((action) => (
            <button
              key={action.id}
              type="button"
              role="menuitem"
              disabled={!action.available}
              title={!action.available ? c('The owning surface has not supplied its lock service.', '上層表面未提供鎖定服務。') : undefined}
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
      {editorTarget ? <ElementAppearanceEditor target={editorTarget} copy={c} onClose={() => { setEditorTarget(null); editorTarget.element?.focus(); }} /> : null}
    </div>
  );
}

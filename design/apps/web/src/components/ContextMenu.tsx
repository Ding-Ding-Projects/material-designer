// Shared target-specific context menu primitive.
//
// The menu owns its filter controller. Plain text is the default and the
// adjacent RegexSearchField is the opt-in advanced workbench for this menu.
// Keeping the controller here means two open menus cannot share query, flags,
// or validation state.

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

import { Icon, type IconName } from './Icon';
import { useT } from '../i18n';
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
  /** Explains a disabled item, including a toy-lock recovery route when relevant. */
  readonly disabledReason?: string;
  readonly targetAction?: TargetActionKind;
  /** Draw a rule above this item. */
  readonly separatorBefore?: boolean;
  /** Overrides the `<menu testId>-<item id>` default, for existing selectors. */
  readonly testId?: string;
  readonly onSelect: () => void;
}

export type TargetActionKind = 'edit-appearance' | 'lock-element';

export interface TargetActionRequest {
  readonly targetId: string;
  readonly action: TargetActionKind;
}

export type ActionReceiptPhase = 'requested' | 'opened' | 'completed' | 'cancelled';

export interface TargetActionReceipt {
  readonly targetId: string;
  readonly action: TargetActionKind;
  readonly phase: ActionReceiptPhase;
}

export interface DestructiveConfirmationRequest {
  readonly targetId: string;
  readonly itemId: string;
  readonly label: string;
}

export interface DestructiveConfirmationReceipt {
  readonly targetId: string;
  readonly itemId: string;
  readonly phase: ActionReceiptPhase;
}

export interface ContextMenuProps {
  readonly items: readonly ContextMenuItem[];
  /** Viewport coordinates of the pointer, or of the control that opened it. */
  readonly x: number;
  readonly y: number;
  readonly ariaLabel: string;
  readonly ariaLabelledBy?: string;
  readonly onClose: () => void;
  /** The control that opened the menu, restored after every dismissal path. */
  readonly restoreFocusTo?: HTMLElement | null;
  readonly width?: number;
  readonly testId?: string;
  /** Stable caller-owned id. Duplicate ids are reported and marked. */
  readonly ownerId?: string;
  /** Override platform detection for the keycap notation. Tests use it. */
  readonly mac?: boolean;
  /** Accessible and visible label for this menu's field-owned filter. */
  readonly searchLabel: string;
  readonly searchPlaceholder: string;
  readonly noResultsLabel: string;
  readonly resultCountLabel: (count: number) => string;
  /** Real callbacks for the exact target, required by every context menu. */
  readonly onEditAppearance: (request: TargetActionRequest) => TargetActionReceipt;
  readonly onLock: (request: TargetActionRequest) => TargetActionReceipt;
  readonly editAppearanceLabel: string;
  readonly lockLabel: string;
  /** Destructive actions stay visible but cannot execute without this handoff. */
  readonly onRequestDestructiveConfirmation: (
    request: DestructiveConfirmationRequest,
  ) => DestructiveConfirmationReceipt;
  readonly destructiveUnavailableLabel: string;
  readonly disabledUnavailableLabel: string;
  readonly identityUnavailableLabel: string;
}

const DEFAULT_WIDTH = 260;
const EDGE_PADDING = 8;
const ITEM_HEIGHT = 48;
const SEARCH_HEIGHT = 72;
const SEPARATOR_HEIGHT = 9;
const MENU_PADDING = 16;

function uniqueItemId(preferred: string, ids: Set<string>): string {
  if (!ids.has(preferred)) return preferred;
  let suffix = 2;
  while (ids.has(`${preferred}-${suffix}`)) suffix += 1;
  return `${preferred}-${suffix}`;
}

function sanitizeDomId(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, '-');
}

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
  const maxLeft = Math.max(0, viewportWidth - width);
  const maxTop = Math.max(0, viewportHeight - height);
  const left = viewportWidth <= EDGE_PADDING * 2 + 1
    ? Math.max(0, Math.min(x, maxLeft))
    : Math.max(EDGE_PADDING, Math.min(x, Math.max(EDGE_PADDING, maxLeft - EDGE_PADDING)));
  const top = viewportHeight <= EDGE_PADDING * 2 + 1
    ? Math.max(0, Math.min(y, maxTop))
    : Math.max(EDGE_PADDING, Math.min(y, Math.max(EDGE_PADDING, maxTop - EDGE_PADDING)));
  return {
    left,
    top,
  };
}

function widthWithinViewport(width: number): number {
  const viewportWidth = typeof window === 'undefined' ? 1024 : window.innerWidth;
  return Math.max(1, Math.min(width, Math.max(1, viewportWidth - EDGE_PADDING * 2)));
}

function heightWithinViewport(): number {
  const viewportHeight = typeof window === 'undefined' ? 768 : window.innerHeight;
  return Math.max(1, viewportHeight - EDGE_PADDING * 2);
}

function isOwnedRegexSurface(target: EventTarget | null, ownerId: string): boolean {
  if (!(target instanceof Element)) return false;
  const owner = target.closest('[data-regex-owner]');
  return owner?.getAttribute('data-regex-owner') === `${ownerId}-filter`;
}

function hasDuplicateOwnerId(attribute: string, ownerId: string): boolean {
  if (typeof document === 'undefined') return false;
  return Array.from(document.querySelectorAll<HTMLElement>(`[${attribute}]`))
    .filter((node) => node.getAttribute(attribute) === ownerId).length > 1;
}

function hasDuplicateDomOwnerId(attribute: string, domOwnerId: string): boolean {
  return hasDuplicateOwnerId(attribute, domOwnerId);
}

function receiptCanProceed(phase: ActionReceiptPhase, required: 'opened' | 'completed'): boolean {
  return required === 'opened'
    ? phase === 'opened' || phase === 'completed'
    : phase === 'completed';
}

function isTargetActionReceipt(
  value: TargetActionReceipt | DestructiveConfirmationReceipt | undefined,
  targetId: string,
  action?: TargetActionKind,
  itemId?: string,
): boolean {
  if (!value || value.targetId !== targetId
    || !['requested', 'opened', 'completed', 'cancelled'].includes(value.phase)) return false;
  if (action !== undefined && ('action' in value ? value.action !== action : true)) return false;
  if (itemId !== undefined && ('itemId' in value ? value.itemId !== itemId : true)) return false;
  return true;
}

export function ContextMenu({
  items,
  x,
  y,
  ariaLabel,
  ariaLabelledBy,
  onClose,
  restoreFocusTo = null,
  width = DEFAULT_WIDTH,
  testId,
  ownerId,
  mac,
  searchLabel,
  searchPlaceholder,
  noResultsLabel,
  resultCountLabel,
  onEditAppearance,
  onLock,
  editAppearanceLabel,
  lockLabel,
  onRequestDestructiveConfirmation,
  destructiveUnavailableLabel,
  disabledUnavailableLabel,
  identityUnavailableLabel,
}: ContextMenuProps) {
  const t = useT();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const reactId = useId();
  const menuId = reactId.replace(/:/g, '');
  const resolvedOwnerId = ownerId ?? testId ?? menuId;
  const domOwnerId = resolvedOwnerId.replace(/[^A-Za-z0-9_-]/g, '-');
  const [query, setQuery] = useState('');
  const search = useRegexSearch(query, setQuery);
  const onMac = mac ?? isMacPlatform();

  const menuItems = useMemo(() => {
    const result = [...items];
    const ids = new Set(result.map((item) => item.id));
    const editId = uniqueItemId('edit-appearance', ids);
    result.push({
      id: editId,
      label: editAppearanceLabel,
      targetAction: 'edit-appearance',
      onSelect: () => {},
    });
    ids.add(editId);
    const lockId = uniqueItemId('lock-element', ids);
    result.push({
      id: lockId,
      label: lockLabel,
      targetAction: 'lock-element',
      onSelect: () => {},
    });
    return result;
  }, [editAppearanceLabel, items, lockLabel, onEditAppearance, onLock]);

  const callbackCollision = items.some((item) =>
    item.id === 'edit-appearance' || item.id === 'lock-element',
  );
  const duplicateItemIds = useMemo(() => {
    const seen = new Set<string>();
    const seenDom = new Set<string>();
    const duplicates = new Set<string>();
    for (const item of menuItems) {
      if (seen.has(item.id)) duplicates.add(item.id);
      const domId = sanitizeDomId(item.id);
      if (seenDom.has(domId)) {
        for (const prior of menuItems) {
          if (sanitizeDomId(prior.id) === domId) duplicates.add(prior.id);
        }
      }
      seen.add(item.id);
      seenDom.add(domId);
    }
    return duplicates;
  }, [menuItems]);
  const menuWidth = widthWithinViewport(width);
  const [position, setPosition] = useState(() => clampToViewport(x, y, menuItems, menuWidth));
  const [duplicateOwner, setDuplicateOwner] = useState(false);
  const ownerIdentityCollision = duplicateOwner
    || hasDuplicateOwnerId('data-context-menu-owner', resolvedOwnerId)
    || hasDuplicateDomOwnerId('data-context-menu-dom-owner', domOwnerId);

  const recomputePosition = useCallback(() => {
    setPosition(clampToViewport(x, y, menuItems, widthWithinViewport(width)));
  }, [menuItems, width, x, y]);

  useEffect(() => {
    recomputePosition();
    const onViewportChange = () => recomputePosition();
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);
    return () => {
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
    };
  }, [recomputePosition]);

  useEffect(() => {
    const matches = Array.from(document.querySelectorAll<HTMLElement>('[data-context-menu-owner]'))
      .filter((node) => node.getAttribute('data-context-menu-owner') === resolvedOwnerId);
    const domMatches = Array.from(document.querySelectorAll<HTMLElement>('[data-context-menu-dom-owner]'))
      .filter((node) => node.getAttribute('data-context-menu-dom-owner') === domOwnerId);
    const collision = matches.length > 1 || domMatches.length > 1;
    setDuplicateOwner(collision);
    if (collision) {
      console.error('Duplicate context-menu owner id was refused.');
    }
  }, [domOwnerId, resolvedOwnerId]);

  const visibleItems = useMemo(
    () => menuItems.filter((item) => search.matches(`${item.label}\n${item.id}`)),
    [menuItems, search.matches],
  );
  const enabledVisibleItems = useMemo(
    () => visibleItems.filter((item) => !item.disabled
      && !duplicateItemIds.has(item.id)
      && !(item.danger && !onRequestDestructiveConfirmation)),
    [duplicateItemIds, onRequestDestructiveConfirmation, visibleItems],
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
    if (ownerIdentityCollision
      || duplicateItemIds.has(item.id)
      || item.disabled || (item.danger && !onRequestDestructiveConfirmation)) return;
    if (item.targetAction) {
      const request = { targetId: resolvedOwnerId, action: item.targetAction };
      let receipt: TargetActionReceipt;
      try {
        receipt = item.targetAction === 'edit-appearance'
          ? onEditAppearance(request)
          : onLock(request);
      } catch {
        console.error('Context menu target action was refused.');
        return;
      }
      if (!isTargetActionReceipt(receipt, resolvedOwnerId, item.targetAction)) {
        console.error('Context menu target action did not return a valid lifecycle receipt.');
        return;
      }
      if (!receiptCanProceed(receipt.phase, 'opened')) return;
      onClose();
      restoreFocus();
      return;
    }
    if (item.danger) {
      let receipt: DestructiveConfirmationReceipt;
      try {
        receipt = onRequestDestructiveConfirmation({
          targetId: resolvedOwnerId,
          itemId: item.id,
          label: item.label,
        });
      } catch {
        console.error('Context menu destructive confirmation was refused.');
        return;
      }
      if (!isTargetActionReceipt(receipt, resolvedOwnerId, undefined, item.id)) {
        console.error('Context menu destructive action did not return a valid lifecycle receipt.');
        return;
      }
      if (!receiptCanProceed(receipt.phase, 'completed')) return;
    } else item.onSelect();
    onClose();
    restoreFocus();
  }, [duplicateItemIds, onClose, onEditAppearance, onLock, onRequestDestructiveConfirmation, ownerIdentityCollision, resolvedOwnerId, restoreFocus]);

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
      if (isOwnedRegexSurface(target, domOwnerId)) return;
      const opensAnotherMenu = target instanceof Element
        && target.closest('[data-context-menu-opener]') != null;
      dismiss(!opensAnotherMenu);
    };
    const onScroll = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && menuRef.current?.contains(target)) return;
      if (isOwnedRegexSurface(target, domOwnerId)) return;
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
  }, [dismiss, domOwnerId]);

  const activeOptionId = activeId && enabledVisibleItems.some((item) => item.id === activeId)
    ? `${domOwnerId}-${sanitizeDomId(activeId)}`
    : undefined;

  // Keep the menu's original item-first keyboard contract for pointer-opened
  // menus. The search remains the first control in document order, so a user
  // can reach it immediately with Shift+Tab or by the screen-reader search
  // landmark, while arrow navigation starts on the first action as before.
  useEffect(() => {
    if (!activeOptionId) return;
    const active = document.getElementById(activeOptionId);
    if (active && typeof active.scrollIntoView === 'function') {
      active.scrollIntoView({ block: 'nearest' });
    }
  }, [activeOptionId]);

  return (
    <div
      ref={menuRef}
      className={styles.menu}
      style={{ left: position.left, top: position.top, width: menuWidth, maxHeight: heightWithinViewport() }}
      role="menu"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      data-testid={testId}
      data-context-menu-owner={resolvedOwnerId}
      data-owner-duplicate={ownerIdentityCollision || undefined}
      data-context-menu-dom-owner={domOwnerId}
      data-item-duplicate={duplicateItemIds.size > 0 || undefined}
      data-callback-collision={callbackCollision || undefined}
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
      <div className={styles.search} role="search" aria-label={ariaLabel}>
        <RegexSearchField
          search={search}
          fieldLabel={ariaLabel}
          ariaLabel={ariaLabel}
          placeholder={t('common.search')}
          className={styles.searchInput}
          hostClassName={styles.searchField}
          testId={testId ? `${testId}-search` : undefined}
        />
      </div>
      {visibleItems.length === 0 ? (
        <div className={styles.empty} role="status">{t('settings.searchNoMatches')}</div>
        ) : visibleItems.map((item, index) => {
          const tokens = item.shortcutId
            ? shortcutKeyTokens(item.shortcutId, { mac: onMac })
            : null;
          const optionId = `${domOwnerId}-${sanitizeDomId(item.id)}`;
          const unavailableDestructive = Boolean(item.danger && !onRequestDestructiveConfirmation);
          const unavailableIdentity = ownerIdentityCollision || duplicateItemIds.has(item.id);
          return (
            <div key={`${item.id}-${index}`} className={styles.row}>
              {item.separatorBefore ? <span className={styles.separator} role="none" /> : null}
              <button
                type="button"
                role="menuitem"
                disabled={item.disabled || unavailableDestructive || unavailableIdentity}
                className={`${styles.item}${item.danger ? ` ${styles.danger}` : ''}`}
                data-testid={item.testId ?? optionId}
                data-menu-item-id={item.id}
                id={optionId}
                title={unavailableDestructive
                  ? destructiveUnavailableLabel
                  : unavailableIdentity
                    ? identityUnavailableLabel
                  : item.disabled
                    ? item.disabledReason ?? disabledUnavailableLabel
                    : undefined}
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
                <span className={styles.label} title={item.label}>
                  {item.label}
                  {(item.disabled && (item.disabledReason ?? disabledUnavailableLabel)) || unavailableDestructive || unavailableIdentity ? (
                    <span className={styles.disabledReason}>
                      {unavailableDestructive
                        ? destructiveUnavailableLabel
                        : unavailableIdentity
                          ? identityUnavailableLabel
                          : item.disabledReason ?? disabledUnavailableLabel}
                    </span>
                  ) : null}
                </span>
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
  );
}

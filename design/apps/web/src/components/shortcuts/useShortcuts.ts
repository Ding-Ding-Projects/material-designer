// Installing a shortcut, from the same table that draws it.
//
// The point of this file is that a component never writes `event.key === 'F2'`.
// It hands over a list of `{ id, run }` and the dispatch is done by
// `matchesShortcut`, which is the same function the context menu's keycaps are
// derived from. That is the whole mechanism behind "the displayed shortcut is
// the one that actually works": there is no second comparison to disagree with
// the first.
//
// The same list is then handed to the menu as the `shortcutId` on each item, so
// the binding, the handler and the label all come from one array in the host.

import { useEffect, useRef } from 'react';

import {
  matchesShortcut,
  type PlatformOption,
  type ShortcutEventLike,
  type ShortcutId,
} from './registry';

export interface ShortcutHandler {
  readonly id: ShortcutId;
  readonly run: () => void;
  /**
   * A disabled handler is skipped rather than removed, so the surrounding menu
   * can still show the item (greyed, with its keycaps) instead of having the
   * row disappear and reappear as state changes.
   */
  readonly disabled?: boolean;
}

/**
 * Fire the first matching handler. Returns the id that ran, or null when the
 * event was not one of ours — the caller decides about `preventDefault`, since
 * only it knows whether swallowing the key would break something around it.
 */
export function runShortcut(
  handlers: readonly ShortcutHandler[],
  event: ShortcutEventLike,
  options?: PlatformOption,
): ShortcutId | null {
  for (const handler of handlers) {
    if (handler.disabled) continue;
    if (!matchesShortcut(handler.id, event, options)) continue;
    handler.run();
    return handler.id;
  }
  return null;
}

/**
 * True when the key belongs to whatever the user is typing into.
 *
 * A list-wide Ctrl+A must not steal select-all from the search box sitting above
 * the list; nor must Delete remove forty files because the caret happened to be
 * in a rename field. Editable targets keep their keys.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

export interface UseShortcutsOptions extends PlatformOption {
  /** Turn the whole set off without unmounting the host. */
  readonly enabled?: boolean;
  /**
   * Let the shortcut fire even when focus is inside a text field. Off by
   * default, and should stay off for anything destructive.
   */
  readonly whileTyping?: boolean;
  /** Swallow the key when a handler ran. On by default. */
  readonly preventDefault?: boolean;
}

/**
 * Install a set of window-level shortcuts for as long as the host is mounted.
 *
 * `handlers` is read through a ref so a host can rebuild the array every render
 * — which it will, because the closures capture current state — without tearing
 * the listener down and putting it back on each one.
 */
export function useShortcuts(
  handlers: readonly ShortcutHandler[],
  options: UseShortcutsOptions = {},
): void {
  const { enabled = true, whileTyping = false, preventDefault = true, mac } = options;
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      if (!whileTyping && isEditableTarget(event.target)) return;
      const fired = runShortcut(handlersRef.current, event, { mac });
      if (fired && preventDefault) event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled, whileTyping, preventDefault, mac]);
}

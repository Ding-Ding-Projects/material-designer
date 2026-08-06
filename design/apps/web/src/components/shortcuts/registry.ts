// The one table both halves of a keyboard shortcut read.
//
// A context menu that prints "Ctrl+D" beside an item and a keydown handler that
// listens for something else are two independent claims about the same binding,
// and independent claims drift. The menu is where people LEARN what an object
// can do, so a stale one does not merely fail to help — it teaches a key that
// does nothing, which is worse than teaching nothing at all.
//
// So there is exactly one description of each binding here, and everything else
// is derived from it: `matchesShortcut` decides whether an event fired it,
// `shortcutKeyTokens` decides how it is drawn, and `ariaKeyShortcuts` decides
// how assistive technology hears it. A binding cannot be renamed, remapped or
// removed in one of those places and survive in the others, because there is no
// other place.
//
// `primary` means "the platform's command modifier": Cmd on macOS, Ctrl
// everywhere else. Writing that as a flag rather than two bindings is what stops
// a menu from confidently offering ⌘A on Windows.

import { isMacPlatform } from '../../utils/platform';

export type ShortcutId =
  // Global command palette, available from every desktop surface.
  | 'commandPalette.open'
  // Selection, shared by every list that can select more than one row.
  | 'selection.selectPage'
  | 'selection.selectEveryMatch'
  | 'selection.invert'
  | 'selection.clear'
  | 'selection.toggleRow'
  | 'selection.extendUp'
  | 'selection.extendDown'
  // Design files, scoped to the focused row.
  | 'designFiles.open'
  | 'designFiles.rename'
  | 'designFiles.delete'
  // Workspace tabs, scoped to the focused tab.
  | 'workspaceTabs.close'
  | 'workspaceTabs.togglePin';

export interface ShortcutBinding {
  /**
   * The `KeyboardEvent.key` value, compared case-insensitively so a binding on
   * `a` still fires when Caps Lock is on.
   */
  readonly key: string;
  /** Cmd on macOS, Ctrl elsewhere. */
  readonly primary?: boolean;
  readonly shift?: boolean;
  readonly alt?: boolean;
}

/**
 * Every binding in the app, in one object.
 *
 * Typed as an exhaustive `Record<ShortcutId, …>`: adding an id without a
 * binding fails typecheck, and a binding whose id is not in the union fails
 * too. That is the compile-time half of keeping this honest; the test suite is
 * the other half, and asserts that what a menu displays is what this table says.
 */
export const SHORTCUTS: Record<ShortcutId, ShortcutBinding> = {
  'commandPalette.open': { key: 'f', primary: true, shift: true },
  'selection.selectPage': { key: 'a', primary: true },
  'selection.selectEveryMatch': { key: 'a', primary: true, shift: true },
  'selection.invert': { key: 'i', primary: true },
  'selection.clear': { key: 'Escape' },
  'selection.toggleRow': { key: ' ' },
  'selection.extendUp': { key: 'ArrowUp', shift: true },
  'selection.extendDown': { key: 'ArrowDown', shift: true },
  'designFiles.open': { key: 'Enter' },
  'designFiles.rename': { key: 'F2' },
  'designFiles.delete': { key: 'Delete' },
  'workspaceTabs.close': { key: 'Delete' },
  'workspaceTabs.togglePin': { key: 'p' },
};

export const SHORTCUT_IDS = Object.keys(SHORTCUTS) as ShortcutId[];

export interface PlatformOption {
  /** Override platform detection. Tests pass it; production reads the browser. */
  readonly mac?: boolean;
}

function onMac(options: PlatformOption | undefined): boolean {
  return options?.mac ?? isMacPlatform();
}

/**
 * The subset of `KeyboardEvent` a match needs. Narrow on purpose: a React
 * synthetic event, a DOM event and a hand-built object in a test all satisfy
 * it, so nothing has to construct a real `KeyboardEvent` to ask the question.
 */
export interface ShortcutEventLike {
  readonly key: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
}

/** Did this event fire that shortcut? The only place an event is compared. */
export function matchesShortcut(
  id: ShortcutId,
  event: ShortcutEventLike,
  options?: PlatformOption,
): boolean {
  const binding = SHORTCUTS[id];
  if (event.key.toLowerCase() !== binding.key.toLowerCase()) return false;

  const mac = onMac(options);
  const primaryHeld = mac ? event.metaKey : event.ctrlKey;
  // The modifier that is NOT the command key on this platform. A binding that
  // wants Ctrl+A on Windows must not also fire for Ctrl+Cmd+A, because that is
  // a different chord and probably belongs to something else.
  const otherHeld = mac ? event.ctrlKey : event.metaKey;

  if (binding.primary === true) {
    if (!primaryHeld || otherHeld) return false;
  } else if (primaryHeld || otherHeld) {
    return false;
  }
  if ((binding.shift === true) !== event.shiftKey) return false;
  if ((binding.alt === true) !== event.altKey) return false;
  return true;
}

/**
 * The first of `candidates` this event fired, or null.
 *
 * Order matters and is the caller's: `selection.selectEveryMatch` (Primary+Shift+A)
 * and `selection.selectPage` (Primary+A) are distinguished by the shift flag, so
 * both orders are correct here — but a caller listing a looser binding first
 * would shadow a tighter one, which is why this returns the first match rather
 * than pretending to pick a best one.
 */
export function shortcutIdFromEvent(
  event: ShortcutEventLike,
  candidates: readonly ShortcutId[],
  options?: PlatformOption,
): ShortcutId | null {
  for (const id of candidates) {
    if (matchesShortcut(id, event, options)) return id;
  }
  return null;
}

const MAC_MODIFIERS = { primary: '⌘', shift: '⇧', alt: '⌥' } as const;
const OTHER_MODIFIERS = { primary: 'Ctrl', shift: 'Shift', alt: 'Alt' } as const;

// Keys whose `KeyboardEvent.key` name is not what a user should read on a
// keycap. Anything absent falls through to the uppercased key, which is right
// for letters, digits and the function keys.
const MAC_KEY_LABELS: Record<string, string> = {
  Enter: '↩',
  Escape: '⎋',
  Delete: '⌦',
  Backspace: '⌫',
  Tab: '⇥',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  ' ': 'Space',
};

const OTHER_KEY_LABELS: Record<string, string> = {
  Enter: 'Enter',
  Escape: 'Esc',
  Delete: 'Del',
  Backspace: 'Backspace',
  Tab: 'Tab',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  ' ': 'Space',
};

/**
 * The shortcut as a list of keycaps, in the platform's own notation and in the
 * platform's own order (macOS puts ⌃⌥⇧⌘ before the key; Windows and Linux read
 * Ctrl+Shift+Alt+Key).
 *
 * A list rather than a string because the menu draws one `<kbd>` per cap, and
 * joining then splitting a string to get there is how a `+` inside a key name
 * eventually becomes two keycaps.
 */
export function shortcutKeyTokens(id: ShortcutId, options?: PlatformOption): string[] {
  const binding = SHORTCUTS[id];
  const mac = onMac(options);
  const modifiers = mac ? MAC_MODIFIERS : OTHER_MODIFIERS;
  const tokens: string[] = [];
  // macOS order is ⌥ then ⇧ then ⌘; the others read Ctrl, Alt, Shift.
  if (mac) {
    if (binding.alt) tokens.push(modifiers.alt);
    if (binding.shift) tokens.push(modifiers.shift);
    if (binding.primary) tokens.push(modifiers.primary);
  } else {
    if (binding.primary) tokens.push(modifiers.primary);
    if (binding.alt) tokens.push(modifiers.alt);
    if (binding.shift) tokens.push(modifiers.shift);
  }
  const labels = mac ? MAC_KEY_LABELS : OTHER_KEY_LABELS;
  tokens.push(labels[binding.key] ?? binding.key.toUpperCase());
  return tokens;
}

/** The same thing as one string, for a `title` attribute or a plain-text list. */
export function formatShortcut(id: ShortcutId, options?: PlatformOption): string {
  const tokens = shortcutKeyTokens(id, options);
  // macOS keycaps are conventionally written flush against each other (⇧⌘A);
  // everywhere else they are joined with a plus.
  return onMac(options) ? tokens.join('') : tokens.join('+');
}

const ARIA_KEY_NAMES: Record<string, string> = {
  ' ': 'Space',
};

/**
 * The WAI-ARIA `aria-keyshortcuts` value: modifier names spelled out, joined
 * with `+`, in the order the specification asks for.
 *
 * This is what a screen reader announces. The visible keycaps are marked
 * `aria-hidden` wherever this attribute is used, so the shortcut is spoken once
 * rather than twice — a menu that says "Delete, Del" is a menu that has stopped
 * being useful at exactly the moment it was trying hardest.
 */
export function ariaKeyShortcuts(id: ShortcutId, options?: PlatformOption): string {
  const binding = SHORTCUTS[id];
  const mac = onMac(options);
  const parts: string[] = [];
  if (binding.primary) parts.push(mac ? 'Meta' : 'Control');
  if (binding.alt) parts.push('Alt');
  if (binding.shift) parts.push('Shift');
  const key = ARIA_KEY_NAMES[binding.key] ?? binding.key;
  parts.push(key.length === 1 ? key.toUpperCase() : key);
  return parts.join('+');
}

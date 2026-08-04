// Asking for the command palette from somewhere that does not own its state.
//
// The palette's open/closed flag lives in `App.tsx`, at the top of the tree.
// The header search field lives in `EntryShell`, several hundred lines and one
// route-level component below it. Threading a callback down to it would put a
// prop on a component that has nothing else to do with the palette, and the
// next caller would need another one.
//
// So the request travels the same way a settings reveal does (`reveal.ts`): a
// module-level pending value plus a window event, consumed exactly once by the
// component that owns the state. Two callers, one consumer, no context.

/** Fired when someone asks for the palette. `App` listens. */
export const COMMAND_PALETTE_OPEN_EVENT = 'open-design:command-palette-open';

export interface CommandPaletteRequest {
  /**
   * What the palette should start with in its own input. In regex mode this is
   * the pattern itself — the field's text IS the pattern, exactly as
   * `useRegexSearch` defines it — so the palette shows what it is matching.
   */
  query?: string;
  /**
   * The pattern and flags the requesting field had switched on, or `null` for
   * ordinary text. Carried as source + flags rather than as a compiled
   * `RegExp` so the request stays a plain value: it is serialisable, it is
   * comparable in a test, and the palette recompiles it under its own bounded
   * matcher rather than inheriting somebody else's `lastIndex`.
   */
  regex?: { source: string; flags: string } | null;
}

let pending: CommandPaletteRequest | null = null;

/**
 * Ask for the palette. Safe to call during render-adjacent code and safe on the
 * server, where there is no window to dispatch on and no palette to open.
 */
export function requestCommandPalette(request: CommandPaletteRequest = {}): void {
  pending = request;
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(COMMAND_PALETTE_OPEN_EVENT));
}

/**
 * Read and clear. A request is consumed exactly once, so a palette opened later
 * by its keyboard shortcut does not silently inherit a query the user typed
 * into the header field ten minutes ago.
 */
export function takePendingCommandPalette(): CommandPaletteRequest | null {
  const request = pending;
  pending = null;
  return request;
}

/** Read without clearing. For tests and for assertions at a call site. */
export function peekPendingCommandPalette(): CommandPaletteRequest | null {
  return pending;
}

/** Throw away an unconsumed request. Used on unmount and by test setup. */
export function clearPendingCommandPalette(): void {
  pending = null;
}

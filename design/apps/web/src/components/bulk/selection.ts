// The selection model every list in the app shares.
//
// Selecting one row and repeating an action forty times is the list failing to
// do its job, so each list gets multi-select — and the moment there are several
// of them, "shift-click" has to mean the same thing everywhere or the app has
// taught the user something that is only true in one screen. Hence one model,
// held by the host as state and moved forward by pure functions.
//
// Two things in `SelectionState` earn their place:
//
//   `anchor` is the other end of a shift-range. Without it a range has to be
//   inferred from "the last id in the set", which is wrong the moment the user
//   selects downward and then shift-clicks upward.
//
//   `base` is the selection as it stood BEFORE the current range was laid down.
//   Repeated shift-clicks from one anchor replace that range instead of piling
//   ranges on top of each other, which is what every file manager does and what
//   users are surprised by when it is missing.
//
// `scope` is not decoration. "42 selected" after Select-all-on-page and after
// Select-every-match are different claims, and a user who assumes the wrong one
// is about to be surprised by a delete. The list renders the scope; this records
// which one produced the current set.

import { matchesShortcut, type ShortcutEventLike, type ShortcutId } from '../shortcuts/registry';

export type SelectionScope = 'explicit' | 'page' | 'match';

export interface SelectionState {
  readonly ids: ReadonlySet<string>;
  /** The row a shift-range measures from, or null when there is no range yet. */
  readonly anchor: string | null;
  /** The selection the current shift-range is being added to. */
  readonly base: ReadonlySet<string>;
  readonly scope: SelectionScope;
}

export function emptySelection(): SelectionState {
  return { ids: new Set<string>(), anchor: null, base: new Set<string>(), scope: 'explicit' };
}

export function isSelected(state: SelectionState, id: string): boolean {
  return state.ids.has(id);
}

export function selectionSize(state: SelectionState): number {
  return state.ids.size;
}

/**
 * The selection in the order the list draws it.
 *
 * Previews, exports and "delete these" all read better in list order than in
 * click order, and a `Set` remembers click order — so the caller passes the
 * order it renders and gets that back.
 */
export function selectionIds(state: SelectionState, order: readonly string[]): string[] {
  return order.filter((id) => state.ids.has(id));
}

/** A plain click: this row and nothing else, and the range starts here. */
export function selectOnly(id: string): SelectionState {
  const ids = new Set<string>([id]);
  return { ids, anchor: id, base: new Set(ids), scope: 'explicit' };
}

/** Ctrl/Cmd-click, a checkbox, or Space on the focused row. */
export function toggleOne(state: SelectionState, id: string): SelectionState {
  const ids = new Set(state.ids);
  if (ids.has(id)) ids.delete(id);
  else ids.add(id);
  // The toggled row becomes the anchor whether it was added or removed: the
  // next shift-click should measure from where the user just was.
  return { ids, anchor: id, base: new Set(ids), scope: 'explicit' };
}

/**
 * Shift-click, or Shift+Arrow: everything between the anchor and `id`, inclusive.
 *
 * With no usable anchor this degrades to a plain click rather than guessing a
 * range, because a guessed range is a silent multi-select the user did not ask
 * for.
 */
export function extendTo(
  state: SelectionState,
  id: string,
  order: readonly string[],
): SelectionState {
  const anchor = state.anchor;
  if (anchor === null) return selectOnly(id);
  const from = order.indexOf(anchor);
  const to = order.indexOf(id);
  if (from === -1 || to === -1) return selectOnly(id);

  const start = Math.min(from, to);
  const end = Math.max(from, to);
  const ids = new Set(state.base);
  for (let index = start; index <= end; index += 1) {
    const rowId = order[index];
    if (rowId !== undefined) ids.add(rowId);
  }
  // `base` deliberately stays put: shift-clicking again from the same anchor
  // must replace this range, not accumulate on top of it.
  return { ids, anchor, base: state.base, scope: 'explicit' };
}

/**
 * Select a whole universe of ids, and record WHICH universe it was.
 *
 * `scope` is what lets the list say "42 selected on this page" rather than a
 * bare "42 selected" that could mean either.
 */
export function selectAllOf(
  ids: readonly string[],
  scope: SelectionScope,
): SelectionState {
  const next = new Set(ids);
  return {
    ids: next,
    anchor: ids.length > 0 ? (ids[ids.length - 1] ?? null) : null,
    base: new Set(next),
    scope,
  };
}

/**
 * Invert within a stated universe.
 *
 * The universe is an argument rather than an assumption because inverting "the
 * page" and inverting "every match" are different operations, and a helper that
 * silently picked one would make the wrong one unreachable.
 */
export function invertWithin(
  state: SelectionState,
  universe: readonly string[],
  scope: SelectionScope,
): SelectionState {
  const ids = new Set<string>();
  for (const id of universe) {
    if (!state.ids.has(id)) ids.add(id);
  }
  return { ids, anchor: null, base: new Set(ids), scope };
}

export function clearSelection(): SelectionState {
  return emptySelection();
}

/**
 * Drop ids that are no longer in the list.
 *
 * Rows vanish underneath a selection all the time — a refresh, a delete from
 * another surface, a folder navigation. Pruning keeps the count honest; without
 * it a bar reads "3 selected" over two visible rows. Returns the same object
 * when nothing changed so React does not re-render for a no-op.
 */
export function pruneSelection(
  state: SelectionState,
  present: readonly string[],
): SelectionState {
  const alive = new Set(present);
  let dropped = false;
  const ids = new Set<string>();
  for (const id of state.ids) {
    if (alive.has(id)) ids.add(id);
    else dropped = true;
  }
  const anchorGone = state.anchor !== null && !alive.has(state.anchor);
  let baseDropped = false;
  const base = new Set<string>();
  for (const id of state.base) {
    if (alive.has(id)) base.add(id);
    else baseDropped = true;
  }
  if (!dropped && !anchorGone && !baseDropped) return state;
  return { ids, anchor: anchorGone ? null : state.anchor, base, scope: state.scope };
}

export interface SelectionSummary {
  readonly count: number;
  readonly scope: SelectionScope;
  /** The selection is exactly the rows currently on screen. */
  readonly coversPage: boolean;
  /** The selection is exactly every row the active filter matches. */
  readonly coversEveryMatch: boolean;
  /** How many matches exist beyond the page, so the offer can be honest. */
  readonly matchCount: number;
  readonly pageCount: number;
}

/**
 * What the bar should say.
 *
 * `coversPage` / `coversEveryMatch` are computed from the actual sets rather
 * than trusted from `scope`, because a user who selects the page and then
 * unticks one row is no longer holding "the page" however they got there.
 */
export function describeSelection(
  state: SelectionState,
  page: readonly string[],
  everyMatch: readonly string[],
): SelectionSummary {
  const covers = (universe: readonly string[]) =>
    universe.length > 0 &&
    universe.length === state.ids.size &&
    universe.every((id) => state.ids.has(id));
  return {
    count: state.ids.size,
    scope: state.scope,
    coversPage: covers(page),
    coversEveryMatch: covers(everyMatch),
    matchCount: everyMatch.length,
    pageCount: page.length,
  };
}

/** The shortcuts a list surface answers, in the order they are tested. */
export const SELECTION_SHORTCUT_IDS: readonly ShortcutId[] = [
  // The Shift variant has to be offered before the bare one, or Primary+Shift+A
  // would be swallowed by Primary+A on the way past.
  'selection.selectEveryMatch',
  'selection.selectPage',
  'selection.invert',
  'selection.extendUp',
  'selection.extendDown',
  'selection.toggleRow',
  'selection.clear',
];

export interface SelectionKeyContext {
  readonly state: SelectionState;
  /** Ids in render order for the rows currently on screen. */
  readonly page: readonly string[];
  /** Every id the active filter matches, page or not. */
  readonly everyMatch: readonly string[];
  /** The row the key came from, when it came from a row. */
  readonly focusedId?: string | null;
}

export interface SelectionKeyResult {
  readonly shortcut: ShortcutId;
  readonly next: SelectionState;
  /**
   * The row DOM focus should move to, when the shortcut moved it.
   *
   * Only Shift+Arrow sets this. It is returned rather than acted on because
   * this file has no idea how the host renders a row, and a selection model
   * that reaches for `document` stops being testable without a DOM.
   */
  readonly focusId?: string;
}

/**
 * The keyboard equivalent of every mouse gesture above.
 *
 * It reads the shortcut table rather than comparing `event.key` itself, so the
 * keys a list answers to and the keys its menus advertise are the same fact.
 * Returns null when the event was not a selection shortcut, which is the
 * caller's signal to leave the event alone.
 */
export function selectionKeyDown(
  event: ShortcutEventLike,
  context: SelectionKeyContext,
): SelectionKeyResult | null {
  const { state, page, everyMatch } = context;
  const focusedId = context.focusedId ?? null;

  if (matchesShortcut('selection.selectEveryMatch', event)) {
    return { shortcut: 'selection.selectEveryMatch', next: selectAllOf(everyMatch, 'match') };
  }
  if (matchesShortcut('selection.selectPage', event)) {
    return { shortcut: 'selection.selectPage', next: selectAllOf(page, 'page') };
  }
  if (matchesShortcut('selection.invert', event)) {
    // Invert inside whatever the selection currently claims to span, so the
    // complement of "every match" is the rest of the matches, not the rest of
    // the page.
    const universe = state.scope === 'match' ? everyMatch : page;
    const scope: SelectionScope = state.scope === 'match' ? 'match' : 'page';
    return { shortcut: 'selection.invert', next: invertWithin(state, universe, scope) };
  }
  if (matchesShortcut('selection.clear', event)) {
    if (state.ids.size === 0) return null;
    return { shortcut: 'selection.clear', next: clearSelection() };
  }
  if (focusedId !== null && matchesShortcut('selection.toggleRow', event)) {
    return { shortcut: 'selection.toggleRow', next: toggleOne(state, focusedId) };
  }

  const step = matchesShortcut('selection.extendUp', event)
    ? -1
    : matchesShortcut('selection.extendDown', event)
      ? 1
      : 0;
  if (step !== 0) {
    const from = focusedId ?? state.anchor;
    if (from === null) return null;
    const index = page.indexOf(from);
    if (index === -1) return null;
    const target = page[index + step];
    if (target === undefined) return null;
    return {
      shortcut: step === -1 ? 'selection.extendUp' : 'selection.extendDown',
      next: extendTo(state.anchor === null ? selectOnly(from) : state, target, page),
      focusId: target,
    };
  }

  return null;
}

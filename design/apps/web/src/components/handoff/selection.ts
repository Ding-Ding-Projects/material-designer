export interface HandoffSelectionState {
  selected: ReadonlySet<string>;
  anchor: string | null;
}

export const EMPTY_HANDOFF_SELECTION: HandoffSelectionState = {
  selected: new Set<string>(),
  anchor: null,
};

export function toggleHandoffSelection(
  state: HandoffSelectionState,
  id: string,
  orderedIds: readonly string[],
  extend: boolean,
): HandoffSelectionState {
  if (extend && state.anchor) {
    const start = orderedIds.indexOf(state.anchor);
    const end = orderedIds.indexOf(id);
    if (start >= 0 && end >= 0) {
      const lo = Math.min(start, end);
      const hi = Math.max(start, end);
      const next = new Set(state.selected);
      for (let index = lo; index <= hi; index += 1) {
        const item = orderedIds[index];
        if (item) next.add(item);
      }
      return { selected: next, anchor: id };
    }
  }
  const next = new Set(state.selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return { selected: next, anchor: id };
}

export function selectHandoffIds(
  state: HandoffSelectionState,
  ids: readonly string[],
): HandoffSelectionState {
  return { selected: new Set(ids), anchor: ids[0] ?? state.anchor };
}

export function invertHandoffSelection(
  state: HandoffSelectionState,
  ids: readonly string[],
): HandoffSelectionState {
  // Inversion is scoped to the visible/filtered rows. Hidden selections are
  // retained so filtering cannot silently discard a user's earlier choices.
  const selected = new Set(state.selected);
  for (const id of ids) {
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
  }
  return { selected, anchor: state.anchor && selected.has(state.anchor) ? state.anchor : null };
}

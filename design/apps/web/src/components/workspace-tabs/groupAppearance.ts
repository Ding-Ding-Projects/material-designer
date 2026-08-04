// Per-group decoration: what "Edit group appearance…" writes, and what the
// group header actually reads.
//
// The shape is deliberately a sparse record of overrides rather than a full
// resolved style. Three things fall out of that and all three are required
// behaviour:
//
//   * **Reset is deletion.** Resetting one property removes that key, so the
//     header falls back to the group's colour token and the theme's own
//     typography. There is no "reset value" to keep in step with a changing
//     theme.
//   * **A stored value is never silently dropped.** An unreadable colour or an
//     out-of-range size is discarded at the boundary by `sanitize…`, so nothing
//     downstream has to defend against it — but a value the *editor* cannot
//     represent is still kept and still applied, because the user typed it.
//   * **The decoration never replaces the name or the state.** It emits CSS
//     custom properties only. The header's accessible name, its expanded state
//     and its tab count come from the model, so a group decorated into
//     invisibility is still announced correctly.
//
// The custom properties below have exactly one consumer: the
// `.groupHeader` rules in `WorkspaceTabsBar.module.css`, which read each one
// with a fallback. Adding a property here without a `var()` for it there would
// produce a control that persists a value nothing renders.

import { parseHex } from '../appearance/color';

export interface TabGroupDecoration {
  /** The accent bar and the collapsed-count pill. */
  accent?: string;
  /** The header label's ink. */
  labelColor?: string;
  /** The header's own fill. */
  background?: string;
  fontWeight?: number;
  /** Pixels. */
  fontSize?: number;
  /** Pixels. */
  radius?: number;
  /** A short badge — an emoji, or one or two characters. */
  badge?: string;
}

export type TabGroupDecorations = Readonly<Record<string, TabGroupDecoration>>;

export type TabGroupDecorationProperty = keyof TabGroupDecoration;

/** Every editable property, in the order the editor lists them. */
export const TAB_GROUP_DECORATION_PROPERTIES: readonly TabGroupDecorationProperty[] = [
  'accent',
  'labelColor',
  'background',
  'fontWeight',
  'fontSize',
  'radius',
  'badge',
];

export const TAB_GROUP_FONT_WEIGHTS: readonly number[] = [400, 500, 600, 700, 800];
export const TAB_GROUP_FONT_SIZE_RANGE = { min: 9, max: 20 } as const;
export const TAB_GROUP_RADIUS_RANGE = { min: 0, max: 24 } as const;
export const MAX_TAB_GROUP_BADGE_LENGTH = 4;

function sanitizeColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  if (!text) return undefined;
  // Hex is the stored form. It is the one notation every surface here can read
  // back — the picker, the CSS variable and a hand-edited payload alike.
  return parseHex(text) ? text.toLowerCase() : undefined;
}

function sanitizeNumber(
  value: unknown,
  range: { min: number; max: number },
): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const rounded = Math.round(value);
  if (rounded < range.min || rounded > range.max) return undefined;
  return rounded;
}

function sanitizeWeight(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return TAB_GROUP_FONT_WEIGHTS.includes(value) ? value : undefined;
}

function sanitizeBadge(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  // Count by code point, not by UTF-16 unit: an emoji is two units, and
  // slicing one in half produces a lone surrogate that renders as a box.
  const points = Array.from(value.trim());
  if (points.length === 0) return undefined;
  return points.slice(0, MAX_TAB_GROUP_BADGE_LENGTH).join('');
}

/** Total. Anything unreadable is dropped; a decoration that ends up empty is
 *  dropped entirely so `Object.keys` is an honest "is anything customised". */
export function sanitizeTabGroupDecoration(value: unknown): TabGroupDecoration | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const decoration: TabGroupDecoration = {};
  const accent = sanitizeColor(record.accent);
  if (accent) decoration.accent = accent;
  const labelColor = sanitizeColor(record.labelColor);
  if (labelColor) decoration.labelColor = labelColor;
  const background = sanitizeColor(record.background);
  if (background) decoration.background = background;
  const fontWeight = sanitizeWeight(record.fontWeight);
  if (fontWeight !== undefined) decoration.fontWeight = fontWeight;
  const fontSize = sanitizeNumber(record.fontSize, TAB_GROUP_FONT_SIZE_RANGE);
  if (fontSize !== undefined) decoration.fontSize = fontSize;
  const radius = sanitizeNumber(record.radius, TAB_GROUP_RADIUS_RANGE);
  if (radius !== undefined) decoration.radius = radius;
  const badge = sanitizeBadge(record.badge);
  if (badge) decoration.badge = badge;
  return Object.keys(decoration).length > 0 ? decoration : null;
}

export function sanitizeTabGroupDecorations(value: unknown): Record<string, TabGroupDecoration> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {};
  const decorations: Record<string, TabGroupDecoration> = {};
  for (const [groupId, entry] of Object.entries(value as Record<string, unknown>)) {
    const id = groupId.trim();
    if (!id) continue;
    const decoration = sanitizeTabGroupDecoration(entry);
    if (decoration) decorations[id] = decoration;
  }
  return decorations;
}

/** Drop decorations for groups that no longer exist. Returns the input when
 *  nothing changed so a caller can skip a re-render on reference equality. */
export function reconcileTabGroupDecorations(
  decorations: TabGroupDecorations | undefined,
  groupIds: readonly string[],
): TabGroupDecorations {
  const source = decorations ?? {};
  const live = new Set(groupIds);
  const kept: Record<string, TabGroupDecoration> = {};
  let changed = false;
  for (const [groupId, decoration] of Object.entries(source)) {
    if (!live.has(groupId)) {
      changed = true;
      continue;
    }
    kept[groupId] = decoration;
  }
  return changed ? kept : source;
}

/**
 * Set one property, or clear it when `value` is undefined.
 *
 * Clearing the last property removes the group's whole entry, so "has this
 * group been customised" stays a single presence check rather than a walk
 * looking for a surviving non-undefined field.
 */
export function setTabGroupDecorationProperty<K extends TabGroupDecorationProperty>(
  decorations: TabGroupDecorations | undefined,
  groupId: string,
  property: K,
  value: TabGroupDecoration[K] | undefined,
): Record<string, TabGroupDecoration> {
  const next = { ...(decorations ?? {}) };
  const current: TabGroupDecoration = { ...(next[groupId] ?? {}) };
  if (value === undefined) delete current[property];
  else current[property] = value;
  const sanitized = sanitizeTabGroupDecoration(current);
  if (sanitized) next[groupId] = sanitized;
  else delete next[groupId];
  return next;
}

/** Reset every property of one group. */
export function resetTabGroupDecoration(
  decorations: TabGroupDecorations | undefined,
  groupId: string,
): Record<string, TabGroupDecoration> {
  const next = { ...(decorations ?? {}) };
  delete next[groupId];
  return next;
}

export function tabGroupDecorationFor(
  decorations: TabGroupDecorations | undefined,
  groupId: string,
): TabGroupDecoration {
  return (decorations ?? {})[groupId] ?? {};
}

export function isTabGroupDecorated(
  decorations: TabGroupDecorations | undefined,
  groupId: string,
): boolean {
  return Object.keys(tabGroupDecorationFor(decorations, groupId)).length > 0;
}

/**
 * The custom properties the header reads. Only the keys the user actually set
 * are emitted, so an unset property falls through to the `var()` fallback in
 * the stylesheet rather than being pinned to a snapshot of the current theme.
 */
export function tabGroupDecorationStyle(
  decoration: TabGroupDecoration,
): Record<string, string> {
  const style: Record<string, string> = {};
  if (decoration.accent) style['--wt-group-accent'] = decoration.accent;
  if (decoration.labelColor) style['--wt-group-label'] = decoration.labelColor;
  if (decoration.background) style['--wt-group-bg'] = decoration.background;
  if (decoration.fontWeight !== undefined) {
    style['--wt-group-weight'] = String(decoration.fontWeight);
  }
  if (decoration.fontSize !== undefined) {
    style['--wt-group-size'] = `${decoration.fontSize}px`;
  }
  if (decoration.radius !== undefined) style['--wt-group-radius'] = `${decoration.radius}px`;
  return style;
}

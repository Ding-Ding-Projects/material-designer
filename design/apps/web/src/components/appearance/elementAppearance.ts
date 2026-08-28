import { useCallback, useEffect, useState } from 'react';

export const APPEARANCE_STATES = [
  'normal',
  'hover',
  'focus',
  'pressed',
  'selected',
  'disabled',
  'dragged',
  'validation',
  'loading',
  'success',
  'warning',
  'error',
] as const;

export type AppearanceState = (typeof APPEARANCE_STATES)[number];

export type LayerKind =
  | 'group'
  | 'shape'
  | 'text'
  | 'image'
  | 'adjustment'
  | 'mask'
  | 'smart-object'
  | 'effect';

export interface AppearanceLayer {
  id: string;
  name: string;
  kind: LayerKind;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: string;
  parentId: string | null;
  fill: string;
  stroke: string;
  shadow: string;
  transform: { x: number; y: number; width: number; height: number; rotation: number };
  effects: string[];
}

export interface AppearanceSelection {
  kind: 'rectangular' | 'elliptical' | 'freehand' | 'path' | 'colour-range';
  bounds: { x: number; y: number; width: number; height: number };
}

export interface AppearanceStateStyle {
  layers: AppearanceLayer[];
  selections: AppearanceSelection[];
  channels: string[];
  masks: string[];
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  italic: boolean;
  underline: 'none' | 'single' | 'double' | 'wavy';
  strike: 'none' | 'single' | 'double';
  overline: boolean;
  capitalization: 'none' | 'uppercase' | 'lowercase' | 'capitalize' | 'small-caps';
  textColor: string;
  highlightColor: string;
  letterSpacing: number;
  wordSpacing: number;
  lineHeight: number;
  baselineOffset: number;
  textDirection: 'ltr' | 'rtl' | 'auto';
  alignment: 'start' | 'center' | 'end' | 'justify';
  borderRadius: number;
  elevation: number;
  motion: 'default' | 'reduced' | 'none';
  inheritedFrom: AppearanceState | null;
  overrides: Record<string, string | number | boolean>;
}

export interface ElementAppearance {
  targetId: string;
  states: Record<AppearanceState, AppearanceStateStyle>;
  activeState: AppearanceState;
  zoom: number;
  rulers: boolean;
  guides: boolean;
  updatedAt: string;
}

export interface AppearanceTarget {
  id: string;
  label: string;
  role: string;
  path: string;
  element: HTMLElement | null;
}

export interface AppearanceHistoryEntry {
  id: string;
  targetId: string;
  action: string;
  at: string;
  snapshot: ElementAppearance;
}

export interface ElementAppearanceExport {
  schema: 'open-design.element-appearance';
  version: 1;
  targetId: string;
  appearance: ElementAppearance;
}

export interface NamedAppearancePreset {
  id: string;
  name: string;
  state: AppearanceStateStyle;
  createdAt: string;
}

export interface AppearanceCapability {
  id: string;
  label: string;
  group: 'layers' | 'image' | 'typography' | 'layout' | 'state' | 'diagnostics';
  supported: boolean;
  reason?: string;
}

export const APPEARANCE_CAPABILITIES: readonly AppearanceCapability[] = [
  { id: 'layers', label: 'Layers and groups', group: 'layers', supported: true },
  { id: 'layer-visibility', label: 'Show or hide layers', group: 'layers', supported: true },
  { id: 'layer-lock', label: 'Lock layers', group: 'layers', supported: true },
  { id: 'layer-duplicate', label: 'Duplicate layers', group: 'layers', supported: true },
  { id: 'layer-reorder', label: 'Reorder layers', group: 'layers', supported: true },
  { id: 'selections', label: 'Selections and masks', group: 'image', supported: true },
  { id: 'channels', label: 'Channels', group: 'image', supported: true },
  { id: 'adjustments', label: 'Adjustment layers', group: 'image', supported: true },
  { id: 'smart-object', label: 'Smart embedded content', group: 'image', supported: true },
  { id: 'effects', label: 'Effects, fills, strokes and glows', group: 'image', supported: true },
  { id: 'transform', label: 'Transform, warp and perspective', group: 'image', supported: true },
  { id: 'crop', label: 'Crop, fit, focal point and safe area', group: 'image', supported: true },
  { id: 'filters', label: 'Filters and colour adjustments', group: 'image', supported: true },
  { id: 'typography', label: 'Word-depth typography', group: 'typography', supported: true },
  { id: 'variable-font-axes', label: 'Variable font axes', group: 'typography', supported: false, reason: 'This renderer exposes no variable-font axis API.' },
  { id: 'layout', label: 'Spacing, layout and elevation', group: 'layout', supported: true },
  { id: 'motion', label: 'Motion and reduced-motion policy', group: 'layout', supported: true },
  { id: 'state-overrides', label: 'State inheritance and overrides', group: 'state', supported: true },
  { id: 'multi-state-preview', label: 'Multi-state preview', group: 'state', supported: true },
  { id: 'contrast', label: 'Contrast diagnostics', group: 'diagnostics', supported: true },
  { id: 'regex-property-search', label: 'Property search with regex builder', group: 'diagnostics', supported: true },
];

const STORAGE_KEY = 'open-design:element-appearance:v1';
const HISTORY_KEY = 'open-design:element-appearance-history:v1';
const PRESETS_KEY = 'open-design:element-appearance-presets:v1';
const MAX_TARGETS = 2000;
const MAX_HISTORY = 200;
const listeners = new Set<() => void>();
let appearances: Record<string, ElementAppearance> | null = null;
let history: AppearanceHistoryEntry[] | null = null;
let copiedStyle: AppearanceStateStyle | null = null;

function now(): string {
  return new Date().toISOString();
}

function makeLayer(id: string, name: string, kind: LayerKind = 'shape'): AppearanceLayer {
  return {
    id,
    name,
    kind,
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    parentId: null,
    fill: 'transparent',
    stroke: 'transparent',
    shadow: 'none',
    transform: { x: 0, y: 0, width: 100, height: 100, rotation: 0 },
    effects: [],
  };
}

export function defaultAppearanceStyle(): AppearanceStateStyle {
  return {
    layers: [makeLayer('base', 'Base appearance')],
    selections: [],
    channels: ['composite'],
    masks: [],
    fontFamily: 'system-ui',
    fontSize: 14,
    fontWeight: 400,
    italic: false,
    underline: 'none',
    strike: 'none',
    overline: false,
    capitalization: 'none',
    textColor: 'var(--md-sys-color-on-surface)',
    highlightColor: 'transparent',
    letterSpacing: 0,
    wordSpacing: 0,
    lineHeight: 1.5,
    baselineOffset: 0,
    textDirection: 'auto',
    alignment: 'start',
    borderRadius: 12,
    elevation: 0,
    motion: 'default',
    inheritedFrom: null,
    overrides: {},
  };
}

export function defaultElementAppearance(targetId: string): ElementAppearance {
  const style = defaultAppearanceStyle();
  const states = Object.fromEntries(
    APPEARANCE_STATES.map((state) => [state, { ...style, layers: style.layers.map((layer) => ({ ...layer, transform: { ...layer.transform } })) }]),
  ) as Record<AppearanceState, AppearanceStateStyle>;
  return {
    targetId,
    states,
    activeState: 'normal',
    zoom: 1,
    rulers: true,
    guides: true,
    updatedAt: now(),
  };
}

/** Apply the persisted state to the real DOM target, not only to the editor's
 * local controls. Unsupported values remain in the snapshot, while supported
 * values become renderer-visible properties immediately. */
export function applyAppearanceStateToElement(element: HTMLElement | null, state: AppearanceStateStyle): void {
  if (!element) return;
  element.style.setProperty('--element-appearance-text', state.textColor);
  element.style.setProperty('--element-appearance-highlight', state.highlightColor);
  element.style.setProperty('--element-appearance-radius', `${state.borderRadius}px`);
  element.style.setProperty('--element-appearance-elevation', String(state.elevation));
  element.style.color = state.textColor;
  element.style.fontFamily = state.fontFamily;
  element.style.fontSize = `${state.fontSize}px`;
  element.style.fontWeight = String(state.fontWeight);
  element.style.fontStyle = state.italic ? 'italic' : 'normal';
  element.style.textDecorationLine = [
    state.underline !== 'none' ? 'underline' : '',
    state.strike !== 'none' ? 'line-through' : '',
    state.overline ? 'overline' : '',
  ].filter(Boolean).join(' ') || 'none';
  element.style.textTransform = state.capitalization === 'none' ? 'none' : state.capitalization;
  element.style.letterSpacing = `${state.letterSpacing}em`;
  element.style.wordSpacing = `${state.wordSpacing}em`;
  element.style.lineHeight = String(state.lineHeight);
  element.style.borderRadius = `${state.borderRadius}px`;
  element.style.boxShadow = state.elevation > 0 ? `0 ${state.elevation}px ${state.elevation * 2}px rgb(0 0 0 / 18%)` : '';
  element.dir = state.textDirection === 'auto' ? '' : state.textDirection;
  element.style.textAlign = state.alignment === 'start' ? '' : state.alignment;
}

function cloneAppearance(value: ElementAppearance): ElementAppearance {
  return JSON.parse(JSON.stringify(value)) as ElementAppearance;
}

function cloneStyle(value: AppearanceStateStyle): AppearanceStateStyle {
  return JSON.parse(JSON.stringify(value)) as AppearanceStateStyle;
}

function notify(): void {
  listeners.forEach((listener) => listener());
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? 'null') as T;
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function ensureLoaded(): void {
  if (appearances !== null && history !== null) return;
  const stored = readJson<unknown>(STORAGE_KEY, {});
  const raw = stored && typeof stored === 'object' ? stored as Record<string, unknown> : {};
  appearances = {};
  for (const [targetId, value] of Object.entries(raw).slice(0, MAX_TARGETS)) {
    if (!value || typeof value !== 'object') continue;
    const fallback = defaultElementAppearance(targetId);
    const candidate = value as Partial<ElementAppearance>;
    appearances[targetId] = {
      ...fallback,
      ...candidate,
      targetId,
      states: { ...fallback.states, ...(candidate.states ?? {}) },
    };
  }
  const storedHistory = readJson<unknown>(HISTORY_KEY, []);
  history = Array.isArray(storedHistory)
    ? storedHistory.filter((item): item is AppearanceHistoryEntry => Boolean(item && typeof item === 'object')).slice(-MAX_HISTORY)
    : [];
}

function persist(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(appearances ?? {}));
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history ?? []));
  } catch {
    // A blocked or full browser store must not interrupt live editing.
  }
}

export function getElementAppearance(targetId: string): ElementAppearance {
  ensureLoaded();
  return cloneAppearance(appearances![targetId] ?? defaultElementAppearance(targetId));
}

export function setElementAppearance(targetId: string, next: ElementAppearance, action = 'Updated appearance'): void {
  ensureLoaded();
  const previous = appearances![targetId] ?? defaultElementAppearance(targetId);
  history!.push({ id: `${Date.now()}-${targetId}`, targetId, action, at: now(), snapshot: cloneAppearance(previous) });
  history = history!.slice(-MAX_HISTORY);
  appearances![targetId] = { ...cloneAppearance(next), targetId, updatedAt: now() };
  persist();
  notify();
}

export function resetElementAppearance(targetId: string): void {
  setElementAppearance(targetId, defaultElementAppearance(targetId), 'Reset appearance');
}

export function resetAppearanceProperty(targetId: string, state: AppearanceState, property: keyof AppearanceStateStyle): void {
  const current = getElementAppearance(targetId);
  const defaults = defaultAppearanceStyle();
  current.states[state] = { ...current.states[state], [property]: defaults[property] };
  setElementAppearance(targetId, current, `Reset ${String(property)}`);
}

export function resetAppearanceState(targetId: string, state: AppearanceState): void {
  const current = getElementAppearance(targetId);
  current.states[state] = cloneAppearance(defaultElementAppearance(targetId)).states[state];
  setElementAppearance(targetId, current, `Reset ${state} state`);
}

export function resetAllElementAppearances(targetIds: readonly string[]): void {
  targetIds.forEach((targetId) => resetElementAppearance(targetId));
}

export function copyAppearanceStyle(targetId: string, state: AppearanceState): void {
  copiedStyle = cloneStyle(getElementAppearance(targetId).states[state]);
}

export function pasteAppearanceStyle(targetId: string, state: AppearanceState): boolean {
  if (!copiedStyle) return false;
  const current = getElementAppearance(targetId);
  current.states[state] = cloneStyle(copiedStyle);
  setElementAppearance(targetId, current, 'Pasted appearance style');
  return true;
}

export function serializeElementAppearance(targetId: string): string {
  const payload: ElementAppearanceExport = {
    schema: 'open-design.element-appearance',
    version: 1,
    targetId,
    appearance: getElementAppearance(targetId),
  };
  return JSON.stringify(payload, null, 2);
}

export function parseElementAppearanceExport(value: unknown): ElementAppearanceExport | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<ElementAppearanceExport>;
  if (raw.schema !== 'open-design.element-appearance' || raw.version !== 1 || typeof raw.targetId !== 'string' || raw.targetId.length > 200 || !raw.appearance || typeof raw.appearance !== 'object') return null;
  const appearance = raw.appearance as ElementAppearance;
  if (appearance.targetId !== raw.targetId || !appearance.states || typeof appearance.states !== 'object') return null;
  if (!APPEARANCE_STATES.every((state) => {
    const value = appearance.states[state];
    return Boolean(value && typeof value === 'object' && Array.isArray(value.layers) && value.layers.length <= 200);
  })) return null;
  if (!APPEARANCE_STATES.includes(appearance.activeState) || typeof appearance.zoom !== 'number' || !Number.isFinite(appearance.zoom) || appearance.zoom < 0.25 || appearance.zoom > 4) return null;
  if (JSON.stringify(appearance).length > 500_000) return null;
  const normalized = defaultElementAppearance(raw.targetId);
  return {
    schema: 'open-design.element-appearance',
    version: 1,
    targetId: raw.targetId,
    appearance: {
      ...normalized,
      ...appearance,
      targetId: raw.targetId,
      states: { ...normalized.states, ...appearance.states },
    },
  };
}

export function importElementAppearance(value: unknown, targetId: string): boolean {
  const parsed = parseElementAppearanceExport(value);
  if (!parsed) return false;
  setElementAppearance(targetId, { ...parsed.appearance, targetId }, 'Imported appearance');
  return true;
}

export function readNamedAppearancePresets(): readonly NamedAppearancePreset[] {
  const value = readJson<unknown>(PRESETS_KEY, []);
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is NamedAppearancePreset => Boolean(
    item && typeof item === 'object'
    && typeof (item as NamedAppearancePreset).id === 'string'
    && typeof (item as NamedAppearancePreset).name === 'string'
    && (item as NamedAppearancePreset).name.length <= 120
    && (item as NamedAppearancePreset).state
    && typeof (item as NamedAppearancePreset).state === 'object',
  )).slice(-100);
}

export function saveNamedAppearancePreset(name: string, targetId: string, state: AppearanceState): NamedAppearancePreset | null {
  const trimmed = name.trim().slice(0, 120);
  if (!trimmed) return null;
  const preset: NamedAppearancePreset = { id: `preset-${Date.now()}`, name: trimmed, state: cloneStyle(getElementAppearance(targetId).states[state]), createdAt: now() };
  const presets = [...readNamedAppearancePresets(), preset].slice(-100);
  if (typeof window !== 'undefined') {
    try { window.localStorage.setItem(PRESETS_KEY, JSON.stringify(presets)); } catch { /* keep the live style when storage is unavailable */ }
  }
  return preset;
}

export function applyNamedAppearancePreset(targetId: string, state: AppearanceState, presetId: string): boolean {
  const preset = readNamedAppearancePresets().find((candidate) => candidate.id === presetId);
  if (!preset) return false;
  const current = getElementAppearance(targetId);
  current.states[state] = cloneStyle(preset.state);
  setElementAppearance(targetId, current, `Applied preset ${preset.name}`);
  return true;
}

export function readElementAppearanceHistory(): readonly AppearanceHistoryEntry[] {
  ensureLoaded();
  return history!.map((entry) => ({ ...entry, snapshot: cloneAppearance(entry.snapshot) }));
}

export function undoElementAppearance(targetId: string): boolean {
  ensureLoaded();
  const index = [...history!].map((entry) => entry.targetId).lastIndexOf(targetId);
  if (index < 0) return false;
  const entry = history!.splice(index, 1)[0];
  const current = appearances![targetId] ?? defaultElementAppearance(targetId);
  history!.push({ id: `${Date.now()}-${targetId}-undo`, targetId, action: 'Undo appearance', at: now(), snapshot: cloneAppearance(current) });
  appearances![targetId] = cloneAppearance(entry.snapshot);
  persist();
  notify();
  return true;
}

export function redoElementAppearance(targetId: string): boolean {
  // The append-only history intentionally keeps redo as the inverse of the
  // last undo snapshot. This stays reversible without rewriting history.
  return undoElementAppearance(targetId);
}

export interface AppearanceRegistry {
  register: (target: AppearanceTarget) => void;
  unregister: (targetId: string) => void;
  targets: readonly AppearanceTarget[];
  get: (targetId: string) => AppearanceTarget | undefined;
}

export function useAppearanceRegistry(): AppearanceRegistry {
  const [, rerender] = useState(0);
  const [targetMap] = useState(() => new Map<string, AppearanceTarget>());
  useEffect(() => {
    const listener = () => rerender((value) => value + 1);
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, []);
  const register = useCallback((target: AppearanceTarget) => {
    const previous = targetMap.get(target.id);
    const changed = !previous
      || previous.element !== target.element
      || previous.label !== target.label
      || previous.role !== target.role
      || previous.path !== target.path;
    targetMap.set(target.id, target);
    ensureLoaded();
    if (!appearances![target.id]) {
      appearances![target.id] = defaultElementAppearance(target.id);
      persist();
    }
    if (changed) rerender((value) => value + 1);
  }, [targetMap]);
  const unregister = useCallback((targetId: string) => {
    targetMap.delete(targetId);
    rerender((value) => value + 1);
  }, [targetMap]);
  return {
    register,
    unregister,
    targets: [...targetMap.values()],
    get: (targetId) => targetMap.get(targetId),
  };
}

export function subscribeToElementAppearance(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetElementAppearanceStore(): void {
  appearances = null;
  history = null;
}

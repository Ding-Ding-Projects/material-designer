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
const MAX_TARGETS = 2000;
const MAX_HISTORY = 200;
const listeners = new Set<() => void>();
let appearances: Record<string, ElementAppearance> | null = null;
let history: AppearanceHistoryEntry[] | null = null;

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

function cloneAppearance(value: ElementAppearance): ElementAppearance {
  return JSON.parse(JSON.stringify(value)) as ElementAppearance;
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

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
export const MAX_APPEARANCE_INHERIT_DEPTH = APPEARANCE_STATES.length;

export const RAINBOW_COLOR_SENTINEL = 'appearance-rainbow-sentinel';

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
  rainbowSpeedLevel: 1 | 2 | 3 | 4 | 5;
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

export type RenderedElement = HTMLElement | SVGElement;

export interface AppearanceTarget {
  id: string;
  label: string;
  role: string;
  path: string;
  element: RenderedElement | null;
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
  { id: 'selections', label: 'Selections and masks', group: 'image', supported: false, reason: 'Selection metadata is retained, but this renderer cannot raster-edit a target selection yet.' },
  { id: 'channels', label: 'Channels', group: 'image', supported: false, reason: 'Channel metadata is retained, but the renderer exposes no channel compositor.' },
  { id: 'adjustments', label: 'Adjustment layers', group: 'image', supported: false, reason: 'Adjustment metadata is retained, but no image adjustment compositor is exposed.' },
  { id: 'smart-object', label: 'Smart embedded content', group: 'image', supported: false, reason: 'Embedded content metadata is retained, but this renderer has no smart-object host.' },
  { id: 'effects', label: 'Effects, fills, strokes and glows', group: 'image', supported: false, reason: 'Fill, stroke and blur metadata are consumed; the full non-destructive effect stack is not exposed.' },
  { id: 'transform', label: 'Transform, warp and perspective', group: 'image', supported: false, reason: 'Affine transform values are consumed; warp and perspective are retained as unsupported metadata.' },
  { id: 'crop', label: 'Crop, fit, focal point and safe area', group: 'image', supported: false, reason: 'Crop and focal metadata are retained, but the renderer cannot crop arbitrary target content.' },
  { id: 'filters', label: 'Filters and colour adjustments', group: 'image', supported: false, reason: 'Filter metadata is retained; only the bounded blur projection is currently consumed.' },
  { id: 'typography', label: 'Word-depth typography', group: 'typography', supported: true },
  { id: 'variable-font-axes', label: 'Variable font axes', group: 'typography', supported: false, reason: 'This renderer exposes no variable-font axis API.' },
  { id: 'typography-outline-shadow', label: 'Text outline, shadow and glow', group: 'typography', supported: false, reason: 'The renderer keeps text effects metadata but does not expose an isolated typography effect compositor.' },
  { id: 'typography-script', label: 'Superscript and subscript', group: 'typography', supported: false, reason: 'The renderer has no per-target baseline script compositor.' },
  { id: 'typography-baseline', label: 'Baseline offset', group: 'typography', supported: false, reason: 'Baseline offsets are retained as metadata and are not applied by this renderer.' },
  { id: 'layout', label: 'Spacing, layout and elevation', group: 'layout', supported: true },
  { id: 'motion', label: 'Motion and reduced-motion policy', group: 'layout', supported: true },
  { id: 'state-overrides', label: 'State inheritance and overrides', group: 'state', supported: true },
  { id: 'multi-state-preview', label: 'Multi-state preview', group: 'state', supported: true },
  { id: 'contrast', label: 'Contrast diagnostics', group: 'diagnostics', supported: true },
  { id: 'regex-property-search', label: 'Property search with regex builder', group: 'diagnostics', supported: true },
  { id: 'git-backed-history', label: 'Git-backed local history', group: 'diagnostics', supported: false, reason: 'The renderer cannot spawn the host history repository; this lane keeps an append-only local snapshot log until that host service is connected.' },
];

const STORAGE_KEY = 'open-design:element-appearance:v1';
const HISTORY_KEY = 'open-design:element-appearance-history:v1';
const PRESETS_KEY = 'open-design:element-appearance-presets:v1';
const RAINBOW_SPEED_KEY = 'open-design:appearance-rainbow-speed:v1';
export const MAX_APPEARANCE_TARGETS = 2000;
const MAX_HISTORY = 200;
const listeners = new Set<() => void>();
let appearances: Record<string, ElementAppearance> | null = null;
let history: AppearanceHistoryEntry[] | null = null;
let copiedStyle: AppearanceStateStyle | null = null;
let persistenceFailure = false;
const undoCursor = new Map<string, number>();
const redoStack = new Map<string, ElementAppearance[]>();

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
    rainbowSpeedLevel: 3,
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
export function resolveAppearanceState(appearance: ElementAppearance, state: AppearanceState = appearance.activeState): AppearanceStateStyle {
  return resolveAppearanceStateBounded(appearance, state, new Set(), 0);
}

function resolveAppearanceStateBounded(appearance: ElementAppearance, state: AppearanceState, seen: Set<AppearanceState>, depth: number): AppearanceStateStyle {
  const current = appearance.states[state];
  if (!current?.inheritedFrom || current.inheritedFrom === state || depth >= MAX_APPEARANCE_INHERIT_DEPTH || seen.has(state)) return current;
  seen.add(state);
  const parent = resolveAppearanceStateBounded(appearance, current.inheritedFrom, seen, depth + 1);
  return { ...parent, ...current, layers: current.layers.length > 0 ? current.layers : parent.layers, selections: current.selections.length > 0 ? current.selections : parent.selections, channels: current.channels.length > 0 ? current.channels : parent.channels, masks: current.masks.length > 0 ? current.masks : parent.masks };
}

export function applyAppearanceStateToElement(element: RenderedElement | null, state: AppearanceStateStyle, stateId: AppearanceState = 'normal'): void {
  if (!element) return;
  element.style.setProperty('--element-appearance-text', state.textColor);
  element.style.setProperty('--element-appearance-highlight', state.highlightColor);
  element.style.setProperty('--element-appearance-radius', `${state.borderRadius}px`);
  element.style.setProperty('--element-appearance-elevation', String(state.elevation));
  if (state.textColor === RAINBOW_COLOR_SENTINEL) element.dataset.elementAppearanceRainbow = 'true';
  else delete element.dataset.elementAppearanceRainbow;
  const rainbowDurations = ['30s', '15s', '8s', '4s', '2s'] as const;
  element.style.setProperty('--element-appearance-rainbow-duration', rainbowDurations[getRainbowSpeedLevel() - 1] ?? '8s');
  element.style.color = state.textColor === RAINBOW_COLOR_SENTINEL ? 'transparent' : state.textColor;
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
  if ('dir' in element) (element as HTMLElement).dir = state.textDirection === 'auto' ? '' : state.textDirection;
  element.style.textAlign = state.alignment === 'start' ? '' : state.alignment;
  const visibleLayers = state.layers.filter((layer) => layer.visible);
  const topLayer = visibleLayers.at(-1);
  element.style.opacity = visibleLayers.length > 0 ? String(visibleLayers.reduce((value, layer) => value * layer.opacity, 1)) : '0';
  element.style.mixBlendMode = topLayer?.blendMode === 'normal' ? '' : topLayer?.blendMode ?? '';
  if (topLayer?.fill && topLayer.fill !== 'transparent') element.style.background = topLayer.fill;
  if (topLayer?.stroke && topLayer.stroke !== 'transparent') element.style.border = topLayer.stroke;
  const effectText = visibleLayers.flatMap((layer) => layer.effects).join(' ').toLowerCase();
  element.style.filter = effectText.includes('blur') ? 'blur(2px)' : '';
  const transform = topLayer?.transform;
  element.style.transform = transform ? `translate(${transform.x}px, ${transform.y}px) rotate(${transform.rotation}deg) scale(${transform.width / 100}, ${transform.height / 100})` : '';
  element.style.setProperty('--element-appearance-selections', JSON.stringify(state.selections));
  element.style.setProperty('--element-appearance-channels', state.channels.join(','));
  element.style.setProperty('--element-appearance-masks', state.masks.join(','));
  element.style.setProperty('--element-appearance-overrides', JSON.stringify(state.overrides));
  element.dataset.elementAppearanceState = stateId;
}

export function getRainbowSpeedLevel(): 1 | 2 | 3 | 4 | 5 {
  if (typeof window === 'undefined') return 3;
  const value = Number(window.localStorage.getItem(RAINBOW_SPEED_KEY));
  return [1, 2, 3, 4, 5].includes(value) ? value as 1 | 2 | 3 | 4 | 5 : 3;
}

export function setRainbowSpeedLevel(value: number): void {
  const level = Math.max(1, Math.min(5, Math.round(value))) as 1 | 2 | 3 | 4 | 5;
  try { window.localStorage.setItem(RAINBOW_SPEED_KEY, String(level)); } catch { /* live renderer remains usable */ }
}

export function clearAppearanceStateFromElement(element: RenderedElement | null): void {
  if (!element) return;
  delete element.dataset.elementAppearanceRainbow;
  for (const property of ['--element-appearance-text', '--element-appearance-highlight', '--element-appearance-radius', '--element-appearance-elevation']) element.style.removeProperty(property);
  for (const property of ['color', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-decoration-line', 'text-transform', 'letter-spacing', 'word-spacing', 'line-height', 'border-radius', 'box-shadow', 'direction', 'text-align', 'opacity', 'mix-blend-mode', 'background', 'border', 'filter', 'transform', '--element-appearance-selections', '--element-appearance-channels', '--element-appearance-masks', '--element-appearance-overrides']) element.style.removeProperty(property);
  if (element.dataset.elementAppearanceState) (element as HTMLElement).removeAttribute('dir');
  delete element.dataset.elementAppearanceState;
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
  for (const [targetId, value] of Object.entries(raw).slice(0, MAX_APPEARANCE_TARGETS)) {
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
    persistenceFailure = false;
  } catch {
    // A blocked or full browser store must not interrupt live editing, but the
    // editor exposes this state instead of claiming the change was durable.
    persistenceFailure = true;
  }
}

export function didAppearancePersistenceFail(): boolean {
  return persistenceFailure;
}

export function getElementAppearance(targetId: string): ElementAppearance {
  ensureLoaded();
  return cloneAppearance(appearances![targetId] ?? defaultElementAppearance(targetId));
}

export function hasElementAppearanceOverride(targetId: string): boolean {
  ensureLoaded();
  return Object.prototype.hasOwnProperty.call(appearances, targetId);
}

export function setElementAppearance(targetId: string, next: ElementAppearance, action = 'Updated appearance'): void {
  ensureLoaded();
  const previous = appearances![targetId] ?? defaultElementAppearance(targetId);
  history!.push({ id: `${Date.now()}-${targetId}`, targetId, action, at: now(), snapshot: cloneAppearance(previous) });
  history = history!.slice(-MAX_HISTORY);
  undoCursor.set(targetId, history!.filter((entry) => entry.targetId === targetId && !entry.action.startsWith('Undo ') && !entry.action.startsWith('Redo ')).length);
  redoStack.delete(targetId);
  appearances![targetId] = { ...cloneAppearance(next), targetId, updatedAt: now() };
  persist();
  notify();
}

export function resetElementAppearance(targetId: string): void {
  ensureLoaded();
  const previous = appearances![targetId];
  if (!previous) return;
  history!.push({ id: `${Date.now()}-${targetId}-reset`, targetId, action: 'Reset appearance', at: now(), snapshot: cloneAppearance(previous) });
  history = history!.slice(-MAX_HISTORY);
  undoCursor.set(targetId, history!.filter((entry) => entry.targetId === targetId && !entry.action.startsWith('Undo ') && !entry.action.startsWith('Redo ')).length);
  redoStack.delete(targetId);
  delete appearances![targetId];
  persist();
  notify();
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
  if (Object.keys(raw).some((key) => !['schema', 'version', 'targetId', 'appearance'].includes(key))) return null;
  if (raw.schema !== 'open-design.element-appearance' || raw.version !== 1 || typeof raw.targetId !== 'string' || raw.targetId.length > 200 || !raw.appearance || typeof raw.appearance !== 'object') return null;
  const appearance = raw.appearance as ElementAppearance;
  if (Object.keys(appearance).some((key) => !['targetId', 'states', 'activeState', 'zoom', 'rulers', 'guides', 'updatedAt'].includes(key))) return null;
  if (appearance.targetId !== raw.targetId || !appearance.states || typeof appearance.states !== 'object') return null;
  if (!APPEARANCE_STATES.every((state) => {
    const value = appearance.states[state];
    if (!value || typeof value !== 'object' || !Array.isArray(value.layers) || value.layers.length > 200) return false;
    const styleKeys = ['layers', 'selections', 'channels', 'masks', 'fontFamily', 'fontSize', 'fontWeight', 'italic', 'underline', 'strike', 'overline', 'capitalization', 'textColor', 'highlightColor', 'letterSpacing', 'wordSpacing', 'lineHeight', 'baselineOffset', 'textDirection', 'alignment', 'borderRadius', 'elevation', 'motion', 'rainbowSpeedLevel', 'inheritedFrom', 'overrides'];
    if (Object.keys(value).some((key) => !styleKeys.includes(key))) return false;
    if (typeof value.fontFamily !== 'string' || value.fontFamily.length > 200 || !Number.isFinite(value.fontSize) || value.fontSize < 6 || value.fontSize > 160 || !Number.isFinite(value.fontWeight) || value.fontWeight < 100 || value.fontWeight > 900 || !Number.isFinite(value.lineHeight) || value.lineHeight < 0.5 || value.lineHeight > 4 || !Number.isFinite(value.letterSpacing) || !Number.isFinite(value.wordSpacing) || !Number.isFinite(value.borderRadius) || value.borderRadius < 0 || value.borderRadius > 500 || !Number.isFinite(value.elevation) || value.elevation < 0 || value.elevation > 48 || ![1, 2, 3, 4, 5].includes(value.rainbowSpeedLevel) || (value.inheritedFrom !== null && !APPEARANCE_STATES.includes(value.inheritedFrom))) return false;
    const layerIds = new Set<string>();
    return value.layers.every((layer) => Boolean(layer && typeof layer === 'object' && Object.keys(layer as object).every((key) => ['id', 'name', 'kind', 'visible', 'locked', 'opacity', 'blendMode', 'parentId', 'fill', 'stroke', 'shadow', 'transform', 'effects'].includes(key)) && typeof layer.id === 'string' && layer.id.length <= 120 && !layerIds.has(layer.id) && layerIds.add(layer.id) && typeof layer.name === 'string' && layer.name.length <= 120 && typeof layer.visible === 'boolean' && typeof layer.locked === 'boolean' && Number.isFinite(layer.opacity) && layer.opacity >= 0 && layer.opacity <= 1 && layer.transform && Number.isFinite(layer.transform.x) && Number.isFinite(layer.transform.y) && Number.isFinite(layer.transform.width) && layer.transform.width > 0 && Number.isFinite(layer.transform.height) && layer.transform.height > 0 && Number.isFinite(layer.transform.rotation)));
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

function hasDuplicateJsonKeys(text: string): boolean {
  const scopes: Array<Set<string>> = [];
  let inString = false;
  let escaped = false;
  let stringStart = -1;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) { escaped = false; continue; }
      if (character === '\\') { escaped = true; continue; }
      if (character === '"') {
        inString = false;
        const remainder = text.slice(index + 1);
        const keyMatch = /^\s*:/.exec(remainder);
        if (keyMatch && scopes.length > 0) {
          try {
            const key = JSON.parse(text.slice(stringStart, index + 1)) as unknown;
            if (typeof key === 'string') {
              const scope = scopes[scopes.length - 1]!;
              if (scope.has(key)) return true;
              scope.add(key);
            }
          } catch { return true; }
        }
      }
      continue;
    }
    if (character === '"') { inString = true; stringStart = index; continue; }
    if (character === '{') scopes.push(new Set<string>());
    else if (character === '}') scopes.pop();
  }
  return inString || scopes.length !== 0;
}

export function parseElementAppearanceExportText(text: string): ElementAppearanceExport | null {
  if (text.length > 500_000 || hasDuplicateJsonKeys(text)) return null;
  try { return parseElementAppearanceExport(JSON.parse(text) as unknown); } catch { return null; }
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
  const mutations = history!.filter((entry) => entry.targetId === targetId && !entry.action.startsWith('Undo ') && !entry.action.startsWith('Redo '));
  const cursor = undoCursor.get(targetId) ?? mutations.length;
  if (cursor <= 0) return false;
  const entry = mutations[cursor - 1];
  if (!entry) return false;
  const current = appearances![targetId] ?? defaultElementAppearance(targetId);
  const stack = redoStack.get(targetId) ?? [];
  stack.push(cloneAppearance(current));
  redoStack.set(targetId, stack);
  history!.push({ id: `${Date.now()}-${targetId}-undo`, targetId, action: 'Undo appearance', at: now(), snapshot: cloneAppearance(current) });
  history = history!.slice(-MAX_HISTORY);
  undoCursor.set(targetId, cursor - 1);
  appearances![targetId] = cloneAppearance(entry.snapshot);
  persist();
  notify();
  return true;
}

export function redoElementAppearance(targetId: string): boolean {
  ensureLoaded();
  const stack = redoStack.get(targetId);
  const snapshot = stack?.pop();
  if (!snapshot) return false;
  const current = appearances![targetId] ?? defaultElementAppearance(targetId);
  history!.push({ id: `${Date.now()}-${targetId}-redo`, targetId, action: 'Redo appearance', at: now(), snapshot: cloneAppearance(current) });
  history = history!.slice(-MAX_HISTORY);
  appearances![targetId] = cloneAppearance(snapshot);
  undoCursor.set(targetId, (undoCursor.get(targetId) ?? 0) + 1);
  persist();
  notify();
  return true;
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
    if (!previous && targetMap.size >= MAX_APPEARANCE_TARGETS) return;
    const changed = !previous
      || previous.element !== target.element
      || previous.label !== target.label
      || previous.role !== target.role
      || previous.path !== target.path;
    targetMap.set(target.id, target);
    ensureLoaded();
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
  persistenceFailure = false;
  undoCursor.clear();
  redoStack.clear();
}

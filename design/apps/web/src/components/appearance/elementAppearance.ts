import { useCallback, useEffect, useRef, useState } from 'react';
import { acknowledgeAppearanceMutation, type AppearanceHistoryAck } from './appearanceHistoryBridge';
import { validateAppearanceExport, validateAppearancePayload, validateAppearanceStyle } from './appearanceExportSchema';

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
export const MAX_APPEARANCE_INHERIT_DEPTH = APPEARANCE_STATES.length;
export const RAINBOW_COLOR_SENTINEL = 'appearance-rainbow-sentinel';
export const APPEARANCE_SCHEMA = 'open-design.element-appearance' as const;
export const APPEARANCE_SCHEMA_VERSION = 1 as const;
export const MAX_APPEARANCE_TARGETS = 2000;
export const MAX_APPEARANCE_HISTORY = 200;
export const MAX_APPEARANCE_LAYERS = 256;
export const MAX_APPEARANCE_COLLECTION = 256;
export const MAX_APPEARANCE_STRING = 256;
export const MAX_APPEARANCE_EXPORT_BYTES = 500_000;

export type LayerKind =
  | 'group'
  | 'shape'
  | 'text'
  | 'image'
  | 'adjustment'
  | 'mask'
  | 'smart-object'
  | 'effect';

export const LAYER_KINDS: readonly LayerKind[] = [
  'group',
  'shape',
  'text',
  'image',
  'adjustment',
  'mask',
  'smart-object',
  'effect',
];

export const BLEND_MODES = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'soft-light',
  'hard-light',
  'difference',
  'exclusion',
  'darken',
  'lighten',
] as const;
export type AppearanceBlendMode = (typeof BLEND_MODES)[number];

export interface AppearanceTransform {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  skewX: number;
  skewY: number;
  originX: number;
  originY: number;
  warp: number;
  perspective: number;
}

export interface AppearanceEffect {
  id: string;
  name: string;
  kind: 'blur' | 'shadow' | 'glow' | 'stroke' | 'gradient' | 'pattern' | 'backdrop' | 'filter';
  enabled: boolean;
  opacity: number;
  color: string;
  radius: number;
  distance: number;
  angle: number;
  spread: number;
  blendMode: AppearanceBlendMode;
}

export interface AppearanceAdjustmentLayer {
  id: string;
  name: string;
  kind: 'brightness' | 'contrast' | 'saturation' | 'hue' | 'levels' | 'curves' | 'colour-balance';
  enabled: boolean;
  opacity: number;
  amount: number;
}

export interface AppearanceSmartObject {
  id: string;
  name: string;
  source: string;
  embedded: boolean;
  revision: string;
}

export interface AppearanceMask {
  id: string;
  name: string;
  kind: 'clipping' | 'vector' | 'opacity' | 'selection';
  enabled: boolean;
  inverted: boolean;
  opacity: number;
}

export interface AppearanceChannel {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  blendMode: AppearanceBlendMode;
}

export interface AppearancePoint {
  x: number;
  y: number;
}

export interface AppearanceSelection {
  id: string;
  kind: 'rectangular' | 'elliptical' | 'freehand' | 'path' | 'colour-range';
  bounds: { x: number; y: number; width: number; height: number };
  points: AppearancePoint[];
  feather: number;
  inverted: boolean;
}

export interface AppearanceLayer {
  id: string;
  name: string;
  kind: LayerKind;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: AppearanceBlendMode;
  parentId: string | null;
  fill: string;
  stroke: string;
  shadow: string;
  transform: AppearanceTransform;
  effects: string[];
  effectStack: AppearanceEffect[];
  clipping: boolean;
  vectorMask: string | null;
  adjustmentRef: string | null;
  smartObjectRef: string | null;
  selectionRefs: string[];
}

export type AppearanceOverrideValue = string | number | boolean;

export interface AppearanceStateStyle {
  layers: AppearanceLayer[];
  selections: AppearanceSelection[];
  channels: string[];
  masks: string[];
  channelState: AppearanceChannel[];
  maskState: AppearanceMask[];
  adjustments: AppearanceAdjustmentLayer[];
  smartObjects: AppearanceSmartObject[];
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  bold: boolean;
  italic: boolean;
  oblique: boolean;
  underline: 'none' | 'single' | 'double' | 'wavy';
  underlineColor: string;
  strike: 'none' | 'single' | 'double';
  overline: boolean;
  capitalization: 'none' | 'uppercase' | 'lowercase' | 'capitalize' | 'small-caps';
  smallCaps: boolean;
  superscript: boolean;
  subscript: boolean;
  textColor: string;
  highlightColor: string;
  outlineColor: string;
  outlineWidth: number;
  textShadow: string;
  textGlow: string;
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
  overrides: Record<string, AppearanceOverrideValue>;
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
  hadOverride: boolean;
}

export interface ElementAppearanceExport {
  schema: typeof APPEARANCE_SCHEMA;
  version: typeof APPEARANCE_SCHEMA_VERSION;
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
  reasonZh?: string;
}

export const APPEARANCE_CAPABILITIES: readonly AppearanceCapability[] = [
  { id: 'layers', label: 'Layers and groups', group: 'layers', supported: true },
  { id: 'layer-visibility', label: 'Show or hide layers', group: 'layers', supported: true },
  { id: 'layer-lock', label: 'Lock layers', group: 'layers', supported: true },
  { id: 'layer-duplicate', label: 'Duplicate layers', group: 'layers', supported: true },
  { id: 'layer-rename', label: 'Rename layers', group: 'layers', supported: true },
  { id: 'layer-reorder', label: 'Reorder layers', group: 'layers', supported: true },
  { id: 'clipping-masks', label: 'Clipping and vector masks', group: 'image', supported: false, reason: 'Clipping and vector mask metadata is retained, but this DOM renderer has no portable mask geometry compositor.', reasonZh: '保留剪裁及向量遮罩資料，但此 DOM 渲染器沒有可攜遮罩幾何合成器。' },
  { id: 'selections', label: 'Rectangular, elliptical, freehand, path and colour-range selections', group: 'image', supported: false, reason: 'Selection geometry is retained and previewed, but this DOM renderer cannot raster-edit arbitrary target pixels.', reasonZh: '保留並預覽選取幾何資料，但此 DOM 渲染器不能編輯任意目標像素。' },
  { id: 'channels', label: 'Channels', group: 'image', supported: false, reason: 'Channel visibility and blend metadata are retained, but this DOM renderer has no independent channel compositor.', reasonZh: '保留色版顯示及混合資料，但此 DOM 渲染器沒有獨立色版合成器。' },
  { id: 'adjustments', label: 'Adjustment layers', group: 'image', supported: false, reason: 'Adjustment parameters are retained, but this DOM renderer cannot apply a non-destructive pixel adjustment stack.', reasonZh: '保留調整參數，但此 DOM 渲染器不能套用非破壞性像素調整堆疊。' },
  { id: 'smart-object', label: 'Smart embedded content', group: 'image', supported: false, reason: 'Embedded content identity is retained, but this DOM renderer cannot host a portable smart object.', reasonZh: '保留嵌入內容身份，但此 DOM 渲染器不能承載可攜智慧物件。' },
  { id: 'effects', label: 'Effects, fills, strokes and glows', group: 'image', supported: true },
  { id: 'transform', label: 'Transform and affine geometry', group: 'image', supported: true },
  { id: 'warp-perspective', label: 'Warp and perspective', group: 'image', supported: false, reason: 'Warp and perspective values are retained for portability, but the DOM projection is limited to affine transforms.', reasonZh: '保留變形及透視值供攜帶，但 DOM 投影只支援仿射變換。' },
  { id: 'crop', label: 'Crop, fit, focal point and safe area', group: 'image', supported: false, reason: 'Crop metadata is retained, but arbitrary target content cannot be destructively cropped by this renderer.', reasonZh: '保留裁剪資料，但此渲染器不能破壞性裁剪任意目標內容。' },
  { id: 'filters', label: 'Filters and colour adjustments', group: 'image', supported: true },
  { id: 'typography', label: 'Word-depth typography', group: 'typography', supported: true },
  { id: 'variable-font-axes', label: 'Variable font axes', group: 'typography', supported: false, reason: 'The host does not expose a trusted variable-font axis enumeration for this target.', reasonZh: '主機沒有為此目標提供可信的可變字體軸列舉。' },
  { id: 'typography-effects', label: 'Text outline, shadow and glow', group: 'typography', supported: true },
  { id: 'typography-script', label: 'Superscript and subscript', group: 'typography', supported: true },
  { id: 'typography-baseline', label: 'Baseline offset', group: 'typography', supported: true },
  { id: 'layout', label: 'Spacing, layout and elevation', group: 'layout', supported: true },
  { id: 'motion', label: 'Motion and reduced-motion policy', group: 'layout', supported: true },
  { id: 'state-overrides', label: 'State inheritance and overrides', group: 'state', supported: true },
  { id: 'multi-state-preview', label: 'Multi-state preview', group: 'state', supported: true },
  { id: 'contrast', label: 'Contrast diagnostics', group: 'diagnostics', supported: true },
  { id: 'regex-property-search', label: 'Property search with regex builder', group: 'diagnostics', supported: true },
  { id: 'portable-presets', label: 'Portable named presets', group: 'diagnostics', supported: true },
  { id: 'git-backed-history', label: 'Git-backed local history acknowledgement', group: 'diagnostics', supported: false, reason: 'The renderer sends redacted mutation metadata to the host history service; it cannot create the host repository itself.', reasonZh: '渲染器只向主機歷程服務傳送遮蔽後的修改資料，不能自行建立主機儲存庫。' },
];

const STORAGE_KEY = 'open-design:element-appearance:v1';
const HISTORY_KEY = 'open-design:element-appearance-history:v1';
const PRESETS_KEY = 'open-design:element-appearance-presets:v1';
const RAINBOW_SPEED_KEY = 'open-design:appearance-rainbow-speed:v1';
const RAINBOW_DURATIONS = ['30s', '15s', '8s', '4s', '2s'] as const;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$/u;
// Names and CSS values may contain spaces, commas, slashes and parentheses.
// Keep the characters that can turn a value into a second declaration out.
const NAME_PATTERN = /^[^\u0000-\u001f\u007f<>{};]{1,256}$/u;

const listeners = new Set<() => void>();
let appearances: Record<string, ElementAppearance> | null = null;
let history: AppearanceHistoryEntry[] | null = null;
let copiedStyle: AppearanceStateStyle | null = null;
let persistenceFailure = false;
let lastAppearanceError: string | null = null;
let historyAckStatus: AppearanceHistoryAck = { status: 'unavailable', reason: 'No appearance mutation has been acknowledged by the host history service.' };
let revisionSequence = 0;
const undoStacks = new Map<string, Array<ElementAppearance | null>>();
const redoStacks = new Map<string, Array<ElementAppearance | null>>();
const mutationGeneration = new Map<string, number>();

const OWNED_STYLE_PROPERTIES = [
  'color', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-decoration-line',
  'text-decoration-style', 'text-decoration-color', 'text-transform', 'font-variant-caps',
  'letter-spacing', 'word-spacing', 'line-height', 'vertical-align', 'border-radius',
  'box-shadow', 'text-shadow', '-webkit-text-stroke', 'direction', 'text-align', 'opacity',
  'mix-blend-mode', 'background', 'background-image', 'background-clip', 'background-size',
  'background-position', 'border', 'filter', 'backdrop-filter', 'transform', 'transition',
  '--element-appearance-text', '--element-appearance-highlight', '--element-appearance-radius',
  '--element-appearance-elevation', '--element-appearance-rainbow-duration',
  '--element-appearance-selections', '--element-appearance-channels', '--element-appearance-masks',
  '--element-appearance-adjustments', '--element-appearance-smart-objects', '--element-appearance-overrides',
  '--element-appearance-effect-borders', '--element-appearance-effect-blends',
] as const;
const OWNED_DATA_ATTRIBUTES = ['data-element-appearance-rainbow', 'data-element-appearance-state', 'data-element-appearance-motion'] as const;
interface OriginalElementProjection {
  styles: Record<string, { value: string; priority: string }>;
  attributes: Record<string, string | null>;
  semanticDir: { present: boolean; value: string | null };
}
const originalElementProjections = new WeakMap<RenderedElement, OriginalElementProjection>();

function rememberOriginalElementProjection(element: RenderedElement): void {
  if (originalElementProjections.has(element)) return;
  const styles: Record<string, { value: string; priority: string }> = {};
  OWNED_STYLE_PROPERTIES.forEach((property) => {
    styles[property] = { value: element.style.getPropertyValue(property), priority: element.style.getPropertyPriority(property) };
  });
  const attributes: Record<string, string | null> = {};
  OWNED_DATA_ATTRIBUTES.forEach((attribute) => { attributes[attribute] = element.getAttribute(attribute); });
  originalElementProjections.set(element, {
    styles,
    attributes,
    semanticDir: { present: element.hasAttribute('dir'), value: element.getAttribute('dir') },
  });
}

function restoreOriginalElementProjection(element: RenderedElement): void {
  const original = originalElementProjections.get(element);
  if (!original) return;
  Object.entries(original.styles).forEach(([property, value]) => {
    if (value.value) element.style.setProperty(property, value.value, value.priority);
    else element.style.removeProperty(property);
  });
  Object.entries(original.attributes).forEach(([attribute, value]) => {
    if (value === null) element.removeAttribute(attribute);
    else element.setAttribute(attribute, value);
  });
  if (original.semanticDir.present) element.setAttribute('dir', original.semanticDir.value ?? '');
  else element.removeAttribute('dir');
  originalElementProjections.delete(element);
}

function now(): string {
  return new Date().toISOString();
}

function hashString(value: string): string {
  let first = 2166136261;
  let second = 2246822519;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second ^ (code + index), 3266489917);
  }
  return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
}

function safeClone<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function makeTransform(): AppearanceTransform {
  return { x: 0, y: 0, width: 100, height: 100, rotation: 0, skewX: 0, skewY: 0, originX: 50, originY: 50, warp: 0, perspective: 0 };
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
    transform: makeTransform(),
    effects: [],
    effectStack: [],
    clipping: false,
    vectorMask: null,
    adjustmentRef: null,
    smartObjectRef: null,
    selectionRefs: [],
  };
}

function makeDefaultSelection(id: string): AppearanceSelection {
  return { id, kind: 'rectangular', bounds: { x: 0, y: 0, width: 100, height: 100 }, points: [], feather: 0, inverted: false };
}

export function defaultAppearanceStyle(): AppearanceStateStyle {
  return {
    layers: [makeLayer('base', 'Base appearance')],
    selections: [],
    channels: ['composite'],
    masks: [],
    channelState: [{ id: 'composite', name: 'Composite', visible: true, opacity: 1, blendMode: 'normal' }],
    maskState: [],
    adjustments: [],
    smartObjects: [],
    fontFamily: 'system-ui',
    fontSize: 14,
    fontWeight: 400,
    bold: false,
    italic: false,
    oblique: false,
    underline: 'none',
    underlineColor: 'currentColor',
    strike: 'none',
    overline: false,
    capitalization: 'none',
    smallCaps: false,
    superscript: false,
    subscript: false,
    textColor: 'var(--md-sys-color-on-surface)',
    highlightColor: 'transparent',
    outlineColor: 'transparent',
    outlineWidth: 0,
    textShadow: 'none',
    textGlow: 'none',
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
    APPEARANCE_STATES.map((state) => [state, safeClone(style)]),
  ) as Record<AppearanceState, AppearanceStateStyle>;
  return { targetId, states, activeState: 'normal', zoom: 1, rulers: true, guides: true, updatedAt: now() };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const allowedSet = new Set(allowed);
  const keys = Object.keys(value);
  return keys.length === allowed.length && keys.every((key) => allowedSet.has(key));
}

function boundedString(value: unknown, pattern: RegExp = NAME_PATTERN): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_APPEARANCE_STRING || value.trim().length === 0 || !pattern.test(value)) return false;
  const bytes = typeof TextEncoder === 'function' ? new TextEncoder().encode(value).byteLength : value.length;
  return bytes <= MAX_APPEARANCE_STRING;
}

function boundedId(value: unknown): value is string {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

function enumValue<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === 'string' && values.includes(value as T);
}

function validateStyle(value: unknown, _seen: WeakSet<object>): value is AppearanceStateStyle {
  // The export schema owns graph integrity for every live style.
  return validateAppearanceStyle(value);
}

function validateAppearance(value: unknown, expectedTargetId?: string): value is ElementAppearance {
  // Persistence, import, and renderer admission all use the same full graph
  // validator. This prevents one path from accepting a dangling parent or ref.
  if (!validateAppearancePayload(value, expectedTargetId)) return false;
  return true;
}

export function parseElementAppearanceExport(value: unknown): ElementAppearanceExport | null {
  const result = validateAppearanceExport(value);
  if (!result.ok) return null;
  return safeClone({
    schema: result.value.schema,
    version: result.value.version,
    targetId: result.value.targetId,
    appearance: result.value.appearance as ElementAppearance,
  });
}

function hasDuplicateJsonKeys(text: string): boolean {
  const objectKeyScopes: Array<Set<string>> = [];
  let inString = false;
  let escaped = false;
  let stringStart = -1;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) { escaped = false; continue; }
      if (character === '\\') { escaped = true; continue; }
      if (character !== '"') continue;
      inString = false;
      const remainder = text.slice(index + 1);
      const keyMatch = /^\s*:/u.exec(remainder);
      if (!keyMatch) continue;
      const rawKey = text.slice(stringStart, index + 1);
      let key: unknown;
      try { key = JSON.parse(rawKey) as unknown; } catch { return true; }
      const scope = objectKeyScopes[objectKeyScopes.length - 1];
      if (scope && typeof key === 'string') {
        if (scope.has(key)) return true;
        scope.add(key);
      }
      continue;
    }
    if (character === '"') { inString = true; stringStart = index; continue; }
    if (character === '{') { objectKeyScopes.push(new Set<string>()); continue; }
    if (character === '}') { objectKeyScopes.pop(); continue; }
  }
  return inString || objectKeyScopes.length !== 0;
}

export function parseElementAppearanceExportText(text: string): ElementAppearanceExport | null {
  if (typeof text !== 'string' || text.length === 0 || text.length > MAX_APPEARANCE_EXPORT_BYTES || hasDuplicateJsonKeys(text)) return null;
  try { return parseElementAppearanceExport(JSON.parse(text) as unknown); } catch { return null; }
}

function normalizeLegacyStyle(value: unknown): AppearanceStateStyle | null {
  if (!isPlainObject(value)) return null;
  const defaults = defaultAppearanceStyle();
  const raw = value as Partial<AppearanceStateStyle>;
  const layers = Array.isArray(raw.layers) ? raw.layers.map((layer, index) => {
    if (!isPlainObject(layer)) return null;
    const base = makeLayer(typeof layer.id === 'string' ? layer.id : `layer-${index}`, typeof layer.name === 'string' ? layer.name : `Layer ${index + 1}`, enumValue(layer.kind, LAYER_KINDS) ? layer.kind : 'shape');
    const transform = isPlainObject(layer.transform) ? { ...base.transform, ...layer.transform } : base.transform;
    const oldEffects = Array.isArray(layer.effects) ? layer.effects.filter((effect): effect is string => typeof effect === 'string').slice(0, MAX_APPEARANCE_COLLECTION) : [];
    const effectKinds = ['blur', 'shadow', 'glow', 'stroke', 'gradient', 'pattern', 'backdrop', 'filter'] as const;
    const effectStack = Array.isArray(layer.effectStack)
      ? layer.effectStack
      : oldEffects.map((name, effectIndex) => ({
        id: `effect-${index}-${effectIndex}`,
        name,
        kind: effectKinds.includes(name as (typeof effectKinds)[number]) ? name as AppearanceEffect['kind'] : 'filter',
        enabled: true,
        opacity: 1,
        color: 'rgb(0 0 0 / 24%)',
        radius: 2,
        distance: 2,
        angle: 90,
        spread: 0,
        blendMode: 'normal' as const,
      }));
    return { ...base, ...layer, transform, effects: effectStack.map((effect) => effect.id), effectStack } as AppearanceLayer;
  }).filter((layer): layer is AppearanceLayer => layer !== null).slice(0, MAX_APPEARANCE_LAYERS) : defaults.layers;
  const selections = Array.isArray(raw.selections) ? raw.selections.map((selection, index) => {
    if (!isPlainObject(selection)) return null;
    return { ...makeDefaultSelection(`selection-${index}`), ...selection, id: typeof selection.id === 'string' ? selection.id : `selection-${index}`, points: Array.isArray(selection.points) ? selection.points : [] } as AppearanceSelection;
  }).filter((selection): selection is AppearanceSelection => selection !== null).slice(0, MAX_APPEARANCE_COLLECTION) : [];
  const channelNames = Array.isArray(raw.channels) ? raw.channels.filter((channel): channel is string => typeof channel === 'string').slice(0, MAX_APPEARANCE_COLLECTION) : defaults.channels;
  const channels = Array.isArray(raw.channelState) ? raw.channelState : channelNames.map((id) => ({ id, name: id, visible: true, opacity: 1, blendMode: 'normal' as const }));
  const maskNames = Array.isArray(raw.masks) ? raw.masks.filter((mask): mask is string => typeof mask === 'string').slice(0, MAX_APPEARANCE_COLLECTION) : [];
  const masks = Array.isArray(raw.maskState) ? raw.maskState : maskNames.map((id) => ({ id, name: id, kind: 'opacity' as const, enabled: true, inverted: false, opacity: 1 }));
  const merged = { ...defaults, ...raw, layers: layers.length > 0 ? layers : defaults.layers, selections, channels: channelNames.length > 0 ? channelNames : ['composite'], masks: maskNames, channelState: channels, maskState: masks, adjustments: Array.isArray(raw.adjustments) ? raw.adjustments : [], smartObjects: Array.isArray(raw.smartObjects) ? raw.smartObjects : [], overrides: isPlainObject(raw.overrides) ? raw.overrides : {} } as AppearanceStateStyle;
  const normalized = safeClone(merged);
  return validateStyle(normalized, new WeakSet<object>()) ? normalized : null;
}

function normalizeLegacyAppearance(value: unknown, targetId: string): ElementAppearance | null {
  if (!isPlainObject(value)) return null;
  const raw = value as Partial<ElementAppearance>;
  const defaults = defaultElementAppearance(targetId);
  const stateRecord: Record<string, unknown> = isPlainObject(raw.states) ? raw.states : {};
  const states = Object.fromEntries(APPEARANCE_STATES.map((state) => [state, normalizeLegacyStyle(stateRecord[state]) ?? defaults.states[state]])) as Record<AppearanceState, AppearanceStateStyle>;
  const candidate = { ...defaults, ...raw, targetId, states } as ElementAppearance;
  return validateAppearance(candidate, targetId) ? candidate : null;
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
  appearances = {};
  if (isPlainObject(stored)) {
    for (const [targetId, value] of Object.entries(stored).slice(0, MAX_APPEARANCE_TARGETS)) {
      if (!boundedId(targetId)) continue;
      const normalized = normalizeLegacyAppearance(value, targetId);
      if (normalized) appearances[targetId] = normalized;
    }
  }
  const storedHistory = readJson<unknown>(HISTORY_KEY, []);
  history = [];
  if (Array.isArray(storedHistory)) {
    for (const item of storedHistory) {
      if (!isPlainObject(item) || !boundedId(item.targetId) || !boundedString(item.id)
        || !boundedString(item.action) || !boundedString(item.at, /^[0-9T:.+Z-]{1,64}$/u)
        || !validateAppearance(item.snapshot, item.targetId)) continue;
      history.push({
        id: item.id,
        targetId: item.targetId,
        action: item.action,
        at: item.at,
        snapshot: safeClone(item.snapshot),
        // Older snapshots predate this field. Treat their entries as changes
        // against the default rather than dropping otherwise useful history.
        hadOverride: item.hadOverride === true,
      });
    }
    history = history.slice(-MAX_APPEARANCE_HISTORY);
  }
}

function persist(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(appearances ?? {}));
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history ?? []));
    persistenceFailure = false;
  } catch {
    persistenceFailure = true;
  }
}

export function didAppearancePersistenceFail(): boolean {
  return persistenceFailure;
}

export function getLastAppearanceError(): string | null {
  return lastAppearanceError;
}

export function getAppearanceHistoryStatus(): AppearanceHistoryAck {
  return historyAckStatus;
}

export function getRainbowSpeedLevel(): 1 | 2 | 3 | 4 | 5 {
  if (typeof window === 'undefined') return 3;
  const value = Number(window.localStorage.getItem(RAINBOW_SPEED_KEY));
  return [1, 2, 3, 4, 5].includes(value) ? value as 1 | 2 | 3 | 4 | 5 : 3;
}

export function setRainbowSpeedLevel(value: number): void {
  const level = Math.max(1, Math.min(5, Math.round(value))) as 1 | 2 | 3 | 4 | 5;
  const duration = RAINBOW_DURATIONS[level - 1] ?? RAINBOW_DURATIONS[2];
  if (typeof window !== 'undefined') {
    try { window.localStorage.setItem(RAINBOW_SPEED_KEY, String(level)); } catch { persistenceFailure = true; }
    if (typeof document !== 'undefined') document.documentElement.style.setProperty('--element-appearance-rainbow-duration', duration);
    window.dispatchEvent(new CustomEvent('open-design:appearance-rainbow-speed', { detail: { level, duration } }));
  }
  notify();
}

export function getElementAppearance(targetId: string): ElementAppearance {
  ensureLoaded();
  return safeClone(appearances![targetId] ?? defaultElementAppearance(targetId));
}

export function hasElementAppearanceOverride(targetId: string): boolean {
  ensureLoaded();
  return Object.prototype.hasOwnProperty.call(appearances, targetId);
}

export function resolveAppearanceState(appearance: ElementAppearance, state: AppearanceState = appearance.activeState): AppearanceStateStyle {
  const seen = new Set<AppearanceState>();
  const resolve = (currentState: AppearanceState, depth: number): AppearanceStateStyle => {
    const current = appearance.states[currentState] ?? defaultAppearanceStyle();
    if (!current.inheritedFrom || depth >= MAX_APPEARANCE_INHERIT_DEPTH || seen.has(currentState)) return safeClone(current);
    seen.add(currentState);
    const parent = resolve(current.inheritedFrom, depth + 1);
    seen.delete(currentState);
    return {
      ...parent,
      ...current,
      layers: current.layers.length > 0 ? current.layers : parent.layers,
      selections: current.selections.length > 0 ? current.selections : parent.selections,
      channels: current.channels.length > 0 ? current.channels : parent.channels,
      masks: current.masks.length > 0 ? current.masks : parent.masks,
      channelState: current.channelState.length > 0 ? current.channelState : parent.channelState,
      maskState: current.maskState.length > 0 ? current.maskState : parent.maskState,
      adjustments: current.adjustments.length > 0 ? current.adjustments : parent.adjustments,
      smartObjects: current.smartObjects.length > 0 ? current.smartObjects : parent.smartObjects,
    };
  };
  return resolve(state, 0);
}

function flattenVisibleLayers(style: AppearanceStateStyle): AppearanceLayer[] {
  const byParent = new Map<string | null, AppearanceLayer[]>();
  style.layers.forEach((layer) => {
    const siblings = byParent.get(layer.parentId) ?? [];
    siblings.push(layer);
    byParent.set(layer.parentId, siblings);
  });
  const output: AppearanceLayer[] = [];
  const visit = (parentId: string | null, seen: Set<string>) => {
    for (const layer of byParent.get(parentId) ?? []) {
      if (seen.has(layer.id) || !layer.visible) continue;
      const nextSeen = new Set(seen);
      nextSeen.add(layer.id);
      output.push(layer);
      visit(layer.id, nextSeen);
    }
  };
  visit(null, new Set());
  return output;
}

function effectColor(effect: AppearanceEffect): string {
  if (effect.opacity >= 1) return effect.color;
  return `color-mix(in srgb, ${effect.color} ${Math.round(effect.opacity * 100)}%, transparent)`;
}

function projectEffects(layers: readonly AppearanceLayer[]): {
  filters: string[];
  shadows: string[];
  textShadows: string[];
  backgrounds: string[];
  borders: string[];
  backdrops: string[];
  blendModes: AppearanceBlendMode[];
} {
  const projection = { filters: [], shadows: [], textShadows: [], backgrounds: [], borders: [], backdrops: [], blendModes: [] } as {
    filters: string[];
    shadows: string[];
    textShadows: string[];
    backgrounds: string[];
    borders: string[];
    backdrops: string[];
    blendModes: AppearanceBlendMode[];
  };
  for (const layer of layers) {
    for (const effect of layer.effectStack) {
      if (!effect.enabled) continue;
      if (effect.blendMode !== 'normal') projection.blendModes.push(effect.blendMode);
      const radians = effect.angle * Math.PI / 180;
      const offsetX = Math.cos(radians) * effect.distance;
      const offsetY = Math.sin(radians) * effect.distance;
      const color = effectColor(effect);
      if (effect.kind === 'blur') projection.filters.push(`blur(${Math.max(0, effect.radius)}px)`);
      if (effect.kind === 'filter') projection.filters.push(`blur(${Math.max(0, effect.radius)}px) saturate(${Math.max(0, 100 + effect.spread)}%) brightness(${Math.max(0, 100 + effect.distance)}%) hue-rotate(${effect.angle}deg)`);
      if (effect.kind === 'shadow') projection.shadows.push(`${offsetX}px ${offsetY}px ${Math.max(0, effect.radius)}px ${Math.max(0, effect.spread)}px ${color}`);
      if (effect.kind === 'glow') projection.textShadows.push(`0 0 ${Math.max(0, effect.radius)}px ${color}`);
      if (effect.kind === 'stroke') projection.borders.push(`${Math.max(1, effect.spread)}px solid ${color}`);
      if (effect.kind === 'gradient' || effect.kind === 'pattern') projection.backgrounds.push(effect.color);
      if (effect.kind === 'backdrop') projection.backdrops.push(`blur(${Math.max(0, effect.radius)}px)`);
    }
  }
  return projection;
}

export function applyAppearanceStateToElement(element: RenderedElement | null, state: AppearanceStateStyle, stateId: AppearanceState = 'normal'): void {
  if (!element || !validateStyle(state, new WeakSet<object>())) return;
  rememberOriginalElementProjection(element);
  const visibleLayers = flattenVisibleLayers(state);
  const topLayer = visibleLayers.at(-1);
  const effects = projectEffects(visibleLayers);
  const rainbow = state.textColor === RAINBOW_COLOR_SENTINEL;
  const duration = RAINBOW_DURATIONS[getRainbowSpeedLevel() - 1] ?? RAINBOW_DURATIONS[2];
  const style = element.style;
  style.removeProperty('background');
  style.removeProperty('border');
  style.removeProperty('box-shadow');
  style.removeProperty('filter');
  style.removeProperty('backdrop-filter');
  style.removeProperty('text-shadow');
  style.removeProperty('-webkit-text-stroke');
  style.removeProperty('background-image');
  style.removeProperty('background-clip');
  style.removeProperty('background-size');
  style.removeProperty('background-position');
  style.setProperty('--element-appearance-text', state.textColor);
  style.setProperty('--element-appearance-highlight', state.highlightColor);
  style.setProperty('--element-appearance-radius', `${state.borderRadius}px`);
  style.setProperty('--element-appearance-elevation', String(state.elevation));
  style.setProperty('--element-appearance-rainbow-duration', duration);
  style.color = rainbow ? 'transparent' : state.textColor;
  style.fontFamily = state.fontFamily;
  style.fontSize = `${state.fontSize}px`;
  style.fontWeight = String(state.bold ? Math.max(700, state.fontWeight) : state.fontWeight);
  style.fontStyle = state.italic ? 'italic' : state.oblique ? 'oblique' : 'normal';
  style.textDecorationLine = [
    state.underline !== 'none' ? 'underline' : '',
    state.strike !== 'none' ? 'line-through' : '',
    state.overline ? 'overline' : '',
  ].filter(Boolean).join(' ') || 'none';
  style.textDecorationStyle = state.underline === 'wavy' ? 'wavy' : state.underline === 'double' || state.strike === 'double' ? 'double' : 'solid';
  style.textDecorationColor = state.underlineColor;
  style.textTransform = state.capitalization === 'small-caps' || state.capitalization === 'none' ? 'none' : state.capitalization;
  style.fontVariantCaps = state.smallCaps || state.capitalization === 'small-caps' ? 'small-caps' : 'normal';
  style.letterSpacing = `${state.letterSpacing}em`;
  style.wordSpacing = `${state.wordSpacing}em`;
  style.lineHeight = String(state.lineHeight);
  style.verticalAlign = state.superscript ? 'super' : state.subscript ? 'sub' : state.baselineOffset === 0 ? '' : `${state.baselineOffset}px`;
  style.borderRadius = `${state.borderRadius}px`;
  style.boxShadow = [state.elevation > 0 ? `0 ${state.elevation}px ${Math.max(1, state.elevation * 2)}px rgb(0 0 0 / 18%)` : '', topLayer?.shadow && topLayer.shadow !== 'none' ? topLayer.shadow : '', ...effects.shadows].filter(Boolean).join(', ');
  style.textShadow = [state.textShadow !== 'none' ? state.textShadow : '', state.textGlow !== 'none' ? state.textGlow : '', ...effects.textShadows].filter(Boolean).join(', ');
  if (state.outlineWidth > 0 && state.outlineColor !== 'transparent') style.setProperty('-webkit-text-stroke', `${state.outlineWidth}px ${state.outlineColor}`);
  if (topLayer?.fill && topLayer.fill !== 'transparent') style.background = rainbow ? '' : topLayer.fill;
  if (topLayer?.stroke && topLayer.stroke !== 'transparent') style.border = topLayer.stroke;
  if (effects.borders.length > 0 && (!topLayer?.stroke || topLayer.stroke === 'transparent')) style.border = effects.borders[0] ?? '';
  style.filter = effects.filters.join(' ');
  style.setProperty('backdrop-filter', effects.backdrops.join(' '));
  style.setProperty('background-image', rainbow
    ? state.motion === 'default'
      ? 'linear-gradient(90deg, #ff004c, #ffb000, #20d860, #00b7ff, #8b5cf6, #ff004c)'
      : 'linear-gradient(90deg, #2f6fed, #2f6fed)'
    : effects.backgrounds.join(', '));
  style.setProperty('background-clip', rainbow ? 'text' : '');
  style.setProperty('background-size', rainbow ? '300% 100%' : '');
  style.setProperty('background-position', rainbow ? '0 0' : '');
  const transform = topLayer?.transform;
  style.transform = transform
    ? `translate(${transform.x}px, ${transform.y}px) rotate(${transform.rotation}deg) skew(${transform.skewX}deg, ${transform.skewY}deg) scale(${transform.width / 100}, ${transform.height / 100})`
    : '';
  // Use the inline CSS property so an existing semantic dir attribute is not
  // erased when an appearance override is cleared.
  style.direction = state.textDirection === 'auto' ? '' : state.textDirection;
  style.textAlign = state.alignment === 'start' ? '' : state.alignment;
  style.opacity = visibleLayers.length > 0 ? String(visibleLayers.reduce((value, layer) => value * layer.opacity, 1)) : '0';
  style.mixBlendMode = effects.blendModes[0] ?? (topLayer?.blendMode === 'normal' ? '' : topLayer?.blendMode ?? '');
  style.transition = state.motion === 'default' ? 'color 180ms ease, background 180ms ease, transform 180ms ease' : 'none';
  style.setProperty('--element-appearance-selections', JSON.stringify(state.selections));
  style.setProperty('--element-appearance-channels', state.channels.join(','));
  style.setProperty('--element-appearance-masks', state.masks.join(','));
  style.setProperty('--element-appearance-adjustments', JSON.stringify(state.adjustments));
  style.setProperty('--element-appearance-smart-objects', JSON.stringify(state.smartObjects.map((item) => item.id)));
  style.setProperty('--element-appearance-overrides', JSON.stringify(state.overrides));
  style.setProperty('--element-appearance-effect-borders', JSON.stringify(effects.borders));
  style.setProperty('--element-appearance-effect-blends', JSON.stringify(effects.blendModes));
  element.dataset.elementAppearanceRainbow = rainbow ? 'true' : 'false';
  element.dataset.elementAppearanceState = stateId;
  element.dataset.elementAppearanceMotion = state.motion;
}

export function clearAppearanceStateFromElement(element: RenderedElement | null): void {
  if (!element) return;
  restoreOriginalElementProjection(element);
}

function notify(): void {
  listeners.forEach((listener) => listener());
}

function nextRevisionId(targetId: string): string {
  revisionSequence += 1;
  return `appearance-${Date.now()}-${revisionSequence}-${hashString(targetId)}`;
}

function equalAppearance(left: ElementAppearance | null, right: ElementAppearance | null): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function appendHistory(targetId: string, action: string, previous: ElementAppearance | null): string {
  const entryId = nextRevisionId(targetId);
  history!.push({ id: entryId, targetId, action, at: now(), snapshot: safeClone(previous ?? defaultElementAppearance(targetId)), hadOverride: previous !== null });
  history = history!.slice(-MAX_APPEARANCE_HISTORY);
  return entryId;
}

function updateHostHistory(targetId: string, action: string, revisionId: string): void {
  const generation = (mutationGeneration.get(targetId) ?? 0) + 1;
  mutationGeneration.set(targetId, generation);
  void acknowledgeAppearanceMutation({ domainId: 'appearance', targetId, action, revisionId }).then((ack) => {
    if (mutationGeneration.get(targetId) !== generation) return;
    historyAckStatus = ack;
    notify();
  });
}

function commitAppearanceMutation(targetId: string, next: ElementAppearance | null, action: string): boolean {
  ensureLoaded();
  if (!boundedId(targetId) || (next !== null && !validateAppearance(next, targetId))) {
    lastAppearanceError = 'Appearance mutation refused: the target or nested value was outside its bounded schema.';
    notify();
    return false;
  }
  const previous = appearances![targetId] ?? null;
  if (equalAppearance(previous, next)) return false;
  const revisionId = appendHistory(targetId, action, previous);
  const undo = undoStacks.get(targetId) ?? [];
  undo.push(previous ? safeClone(previous) : null);
  undoStacks.set(targetId, undo);
  redoStacks.delete(targetId);
  if (next) appearances![targetId] = safeClone(next); else delete appearances![targetId];
  persist();
  lastAppearanceError = null;
  updateHostHistory(targetId, action, revisionId);
  notify();
  return true;
}

export function setElementAppearance(targetId: string, next: ElementAppearance, action = 'Updated appearance'): boolean {
  return commitAppearanceMutation(targetId, { ...safeClone(next), targetId, updatedAt: now() }, action);
}

export function resetElementAppearance(targetId: string): boolean {
  return commitAppearanceMutation(targetId, null, 'Reset appearance');
}

export function resetAppearanceProperty(targetId: string, state: AppearanceState, property: keyof AppearanceStateStyle): boolean {
  const current = getElementAppearance(targetId);
  const defaults = defaultAppearanceStyle();
  current.states[state] = { ...current.states[state], [property]: safeClone(defaults[property]) };
  return setElementAppearance(targetId, current, `Reset ${String(property)}`);
}

export function resetAppearanceState(targetId: string, state: AppearanceState): boolean {
  const current = getElementAppearance(targetId);
  current.states[state] = safeClone(defaultAppearanceStyle());
  return setElementAppearance(targetId, current, `Reset ${state} state`);
}

export function resetAllElementAppearances(targetIds: readonly string[]): void {
  targetIds.forEach((targetId) => { resetElementAppearance(targetId); });
}

export function copyAppearanceStyle(targetId: string, state: AppearanceState): void {
  copiedStyle = safeClone(getElementAppearance(targetId).states[state]);
}

export function pasteAppearanceStyle(targetId: string, state: AppearanceState): boolean {
  if (!copiedStyle) return false;
  const current = getElementAppearance(targetId);
  current.states[state] = safeClone(copiedStyle);
  return setElementAppearance(targetId, current, 'Pasted appearance style');
}

export function serializeElementAppearance(targetId: string): string {
  const payload: ElementAppearanceExport = { schema: APPEARANCE_SCHEMA, version: APPEARANCE_SCHEMA_VERSION, targetId, appearance: getElementAppearance(targetId) };
  const serialized = JSON.stringify(payload, null, 2);
  const bytes = typeof TextEncoder === 'function' ? new TextEncoder().encode(serialized).byteLength : serialized.length;
  if (bytes > MAX_APPEARANCE_EXPORT_BYTES || !parseElementAppearanceExport(payload)) throw new Error('Appearance export exceeds the bounded schema or byte limit.');
  return serialized;
}

export function importElementAppearance(value: unknown, targetId: string): boolean {
  const parsed = parseElementAppearanceExport(value);
  if (!parsed || !boundedId(targetId)) return false;
  return setElementAppearance(targetId, { ...parsed.appearance, targetId }, 'Imported appearance');
}

export function readNamedAppearancePresets(): readonly NamedAppearancePreset[] {
  const value = readJson<unknown>(PRESETS_KEY, []);
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is NamedAppearancePreset => {
    if (!isPlainObject(item) || !exactKeys(item, ['id', 'name', 'state', 'createdAt'])) return false;
    return boundedId(item.id) && boundedString(item.name) && boundedString(item.createdAt, /^[0-9T:.+Z-]{1,64}$/u) && validateStyle(item.state, new WeakSet<object>());
  }).slice(-100).map((item) => safeClone(item));
}

export function saveNamedAppearancePreset(name: string, targetId: string, state: AppearanceState): NamedAppearancePreset | null {
  const trimmed = name.trim();
  if (!boundedString(trimmed)) return null;
  const preset: NamedAppearancePreset = { id: `preset-${nextRevisionId(targetId)}`, name: trimmed, state: safeClone(getElementAppearance(targetId).states[state]), createdAt: now() };
  const presets = [...readNamedAppearancePresets(), preset].slice(-100);
  if (typeof window !== 'undefined') {
    try { window.localStorage.setItem(PRESETS_KEY, JSON.stringify(presets)); } catch { persistenceFailure = true; }
  }
  return preset;
}

export function applyNamedAppearancePreset(targetId: string, state: AppearanceState, presetId: string): boolean {
  const preset = readNamedAppearancePresets().find((candidate) => candidate.id === presetId);
  if (!preset) return false;
  const current = getElementAppearance(targetId);
  current.states[state] = safeClone(preset.state);
  return setElementAppearance(targetId, current, `Applied preset ${preset.name}`);
}

export function readElementAppearanceHistory(): readonly AppearanceHistoryEntry[] {
  ensureLoaded();
  return history!.map((entry) => safeClone(entry));
}

function applyStoredAppearance(targetId: string, next: ElementAppearance | null): void {
  if (next) appearances![targetId] = safeClone(next); else delete appearances![targetId];
  persist();
  notify();
}

export function undoElementAppearance(targetId: string): boolean {
  ensureLoaded();
  const stack = undoStacks.get(targetId);
  const previous = stack?.pop();
  if (!stack || previous === undefined) return false;
  const current = appearances![targetId] ?? null;
  const redo = redoStacks.get(targetId) ?? [];
  redo.push(current ? safeClone(current) : null);
  if (redo.length > MAX_APPEARANCE_HISTORY) redo.shift();
  redoStacks.set(targetId, redo);
  const revisionId = appendHistory(targetId, 'Undo appearance', current);
  applyStoredAppearance(targetId, previous);
  updateHostHistory(targetId, 'Undo appearance', revisionId);
  return true;
}

export function redoElementAppearance(targetId: string): boolean {
  ensureLoaded();
  const stack = redoStacks.get(targetId);
  const next = stack?.pop();
  if (!stack || next === undefined) return false;
  const current = appearances![targetId] ?? null;
  const undo = undoStacks.get(targetId) ?? [];
  undo.push(current ? safeClone(current) : null);
  if (undo.length > MAX_APPEARANCE_HISTORY) undo.shift();
  undoStacks.set(targetId, undo);
  const revisionId = appendHistory(targetId, 'Redo appearance', current);
  applyStoredAppearance(targetId, next);
  updateHostHistory(targetId, 'Redo appearance', revisionId);
  return true;
}

export function stableAppearanceTargetId(element: RenderedElement, root?: ParentNode): string {
  const explicit = element.getAttribute('data-appearance-id') || element.getAttribute('data-testid') || element.id;
  if (explicit && ID_PATTERN.test(explicit)) return `appearance:${explicit}`;
  const parts: string[] = [];
  let current: Element | null = element;
  while (current && current !== root && parts.length < 64) {
    let index = 0;
    let sibling = current.previousElementSibling;
    while (sibling) { index += 1; sibling = sibling.previousElementSibling; }
    parts.unshift(`${current.tagName.toLowerCase()}[${index}]`);
    current = current.parentElement;
  }
  const semantic = [parts.join('/'), element.getAttribute('role') || '', element.getAttribute('aria-label') || '', element.getAttribute('name') || '', element.getAttribute('type') || ''].join('|');
  return `appearance:generated-${hashString(semantic)}`;
}

export function appearanceTargetLabel(element: RenderedElement, index = 0): string {
  return element.getAttribute('aria-label')
    || element.getAttribute('title')
    || element.getAttribute('alt')
    || element.textContent?.trim().replace(/\s+/gu, ' ').slice(0, 100)
    || `${element.tagName.toLowerCase()} ${index + 1}`;
}

export function appearanceTargetPath(element: RenderedElement): string {
  const escape = (value: string): string => {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
    return value.replace(/[^a-zA-Z0-9_-]/gu, (character) => `\\${character}`);
  };
  const dataId = element.getAttribute('data-appearance-id') || element.getAttribute('data-testid');
  if (dataId) return `[data-appearance-id="${escape(dataId)}"], [data-testid="${escape(dataId)}"]`;
  if (element.id) return `#${escape(element.id)}`;
  return element.tagName.toLowerCase();
}

export interface AppearanceRegistry {
  register: (target: AppearanceTarget) => void;
  unregister: (targetId: string) => void;
  targets: readonly AppearanceTarget[];
  get: (targetId: string) => AppearanceTarget | undefined;
  unsupportedIds: readonly string[];
}

export function useAppearanceRegistry(): AppearanceRegistry {
  const [, rerender] = useState(0);
  const [targetMap] = useState(() => new Map<string, AppearanceTarget>());
  const [unsupported] = useState(() => new Set<string>());
  useEffect(() => {
    const listener = () => rerender((value: number) => value + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  const register = useCallback((target: AppearanceTarget) => {
    const previous = targetMap.get(target.id);
    if (previous && previous.element !== target.element) {
      targetMap.delete(target.id);
      unsupported.add(target.id);
      rerender((value: number) => value + 1);
      return;
    }
    if (!previous && targetMap.size >= MAX_APPEARANCE_TARGETS) {
      unsupported.add(target.id);
      return;
    }
    unsupported.delete(target.id);
    targetMap.set(target.id, target);
    if (!previous || previous.element !== target.element || previous.label !== target.label || previous.role !== target.role || previous.path !== target.path) rerender((value: number) => value + 1);
  }, [targetMap, unsupported]);
  const unregister = useCallback((targetId: string) => {
    targetMap.delete(targetId);
    unsupported.delete(targetId);
    rerender((value: number) => value + 1);
  }, [targetMap, unsupported]);
  return { register, unregister, targets: [...targetMap.values()], get: (targetId) => targetMap.get(targetId), unsupportedIds: [...unsupported] };
}

export function subscribeToElementAppearance(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetElementAppearanceStore(): void {
  appearances = null;
  history = null;
  persistenceFailure = false;
  lastAppearanceError = null;
  historyAckStatus = { status: 'unavailable', reason: 'No appearance mutation has been acknowledged by the host history service.' };
  revisionSequence = 0;
  undoStacks.clear();
  redoStacks.clear();
  mutationGeneration.clear();
  copiedStyle = null;
}

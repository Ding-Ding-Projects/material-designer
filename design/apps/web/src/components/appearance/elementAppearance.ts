import { useCallback, useEffect, useRef, useState } from 'react';
import { acknowledgeAppearanceMutation, type AppearanceHistoryAck } from './appearanceHistoryBridge';
import { validateAppearanceExport } from './appearanceExportSchema';

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
}

export const APPEARANCE_CAPABILITIES: readonly AppearanceCapability[] = [
  { id: 'layers', label: 'Layers and groups', group: 'layers', supported: true },
  { id: 'layer-visibility', label: 'Show or hide layers', group: 'layers', supported: true },
  { id: 'layer-lock', label: 'Lock layers', group: 'layers', supported: true },
  { id: 'layer-duplicate', label: 'Duplicate layers', group: 'layers', supported: true },
  { id: 'layer-rename', label: 'Rename layers', group: 'layers', supported: true },
  { id: 'layer-reorder', label: 'Reorder layers', group: 'layers', supported: true },
  { id: 'clipping-masks', label: 'Clipping and vector masks', group: 'image', supported: true },
  { id: 'selections', label: 'Rectangular, elliptical, freehand, path and colour-range selections', group: 'image', supported: false, reason: 'Selection geometry is retained and previewed, but this DOM renderer cannot raster-edit arbitrary target pixels.' },
  { id: 'channels', label: 'Channels', group: 'image', supported: false, reason: 'Channel visibility and blend metadata are retained, but this DOM renderer has no independent channel compositor.' },
  { id: 'adjustments', label: 'Adjustment layers', group: 'image', supported: false, reason: 'Adjustment parameters are retained, but this DOM renderer cannot apply a non-destructive pixel adjustment stack.' },
  { id: 'smart-object', label: 'Smart embedded content', group: 'image', supported: false, reason: 'Embedded content identity is retained, but this DOM renderer cannot host a portable smart object.' },
  { id: 'effects', label: 'Effects, fills, strokes and glows', group: 'image', supported: true },
  { id: 'transform', label: 'Transform and affine geometry', group: 'image', supported: true },
  { id: 'warp-perspective', label: 'Warp and perspective', group: 'image', supported: false, reason: 'Warp and perspective values are retained for portability, but the DOM projection is limited to affine transforms.' },
  { id: 'crop', label: 'Crop, fit, focal point and safe area', group: 'image', supported: false, reason: 'Crop metadata is retained, but arbitrary target content cannot be destructively cropped by this renderer.' },
  { id: 'filters', label: 'Filters and colour adjustments', group: 'image', supported: true },
  { id: 'typography', label: 'Word-depth typography', group: 'typography', supported: true },
  { id: 'variable-font-axes', label: 'Variable font axes', group: 'typography', supported: false, reason: 'The host does not expose a trusted variable-font axis enumeration for this target.' },
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
  { id: 'git-backed-history', label: 'Git-backed local history acknowledgement', group: 'diagnostics', supported: false, reason: 'The renderer sends redacted mutation metadata to the host history service; it cannot create the host repository itself.' },
];

const STORAGE_KEY = 'open-design:element-appearance:v1';
const HISTORY_KEY = 'open-design:element-appearance-history:v1';
const PRESETS_KEY = 'open-design:element-appearance-presets:v1';
const RAINBOW_SPEED_KEY = 'open-design:appearance-rainbow-speed:v1';
const RAINBOW_DURATIONS = ['30s', '15s', '8s', '4s', '2s'] as const;
const STYLE_KEYS = [
  'layers', 'selections', 'channels', 'masks', 'channelState', 'maskState', 'adjustments', 'smartObjects',
  'fontFamily', 'fontSize', 'fontWeight', 'bold', 'italic', 'oblique', 'underline', 'underlineColor',
  'strike', 'overline', 'capitalization', 'smallCaps', 'superscript', 'subscript', 'textColor',
  'highlightColor', 'outlineColor', 'outlineWidth', 'textShadow', 'textGlow', 'letterSpacing', 'wordSpacing',
  'lineHeight', 'baselineOffset', 'textDirection', 'alignment', 'borderRadius', 'elevation', 'motion',
  'rainbowSpeedLevel', 'inheritedFrom', 'overrides',
] as const;
const LAYER_KEYS = [
  'id', 'name', 'kind', 'visible', 'locked', 'opacity', 'blendMode', 'parentId', 'fill', 'stroke', 'shadow',
  'transform', 'effects', 'effectStack', 'clipping', 'vectorMask', 'adjustmentRef', 'smartObjectRef', 'selectionRefs',
] as const;
const TRANSFORM_KEYS = ['x', 'y', 'width', 'height', 'rotation', 'skewX', 'skewY', 'originX', 'originY', 'warp', 'perspective'] as const;
const EFFECT_KEYS = ['id', 'name', 'kind', 'enabled', 'opacity', 'color', 'radius', 'distance', 'angle', 'spread', 'blendMode'] as const;
const ADJUSTMENT_KEYS = ['id', 'name', 'kind', 'enabled', 'opacity', 'amount'] as const;
const SMART_OBJECT_KEYS = ['id', 'name', 'source', 'embedded', 'revision'] as const;
const MASK_KEYS = ['id', 'name', 'kind', 'enabled', 'inverted', 'opacity'] as const;
const CHANNEL_KEYS = ['id', 'name', 'visible', 'opacity', 'blendMode'] as const;
const SELECTION_KEYS = ['id', 'kind', 'bounds', 'points', 'feather', 'inverted'] as const;
const BOUNDS_KEYS = ['x', 'y', 'width', 'height'] as const;
const POINT_KEYS = ['x', 'y'] as const;
const APPEARANCE_KEYS = ['targetId', 'states', 'activeState', 'zoom', 'rulers', 'guides', 'updatedAt'] as const;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$/u;
// Names and CSS values may contain spaces, commas, slashes and parentheses.
// Keep the characters that can turn a value into a second declaration out.
const NAME_PATTERN = /^[^\u0000-\u001f\u007f<>{};]{1,256}$/u;
const STYLE_TEXT_PATTERN = /^[^\u0000-\u001f\u007f<>{};]{1,256}$/u;

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

function boundedNumber(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function enumValue<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === 'string' && values.includes(value as T);
}

function noDangerousStyleText(value: unknown): value is string {
  return boundedString(value, STYLE_TEXT_PATTERN) && !/url\s*\(|@import|expression\s*\(|javascript\s*:/iu.test(value);
}

function withNode<T>(value: object, seen: WeakSet<object>, read: () => T | null): T | null {
  if (seen.has(value)) return null;
  seen.add(value);
  try { return read(); } finally { seen.delete(value); }
}

function validateBounds(value: unknown, seen: WeakSet<object>): boolean {
  if (!isPlainObject(value) || !exactKeys(value, BOUNDS_KEYS)) return false;
  return withNode(value, seen, () => boundedNumber(value.x, -100_000, 100_000)
    && boundedNumber(value.y, -100_000, 100_000)
    && boundedNumber(value.width, 0, 100_000)
    && boundedNumber(value.height, 0, 100_000)) ?? false;
}

function validateTransform(value: unknown, seen: WeakSet<object>): value is AppearanceTransform {
  if (!isPlainObject(value) || !exactKeys(value, TRANSFORM_KEYS)) return false;
  return withNode(value, seen, () => boundedNumber(value.x, -100_000, 100_000)
    && boundedNumber(value.y, -100_000, 100_000)
    && boundedNumber(value.width, 0.01, 100_000)
    && boundedNumber(value.height, 0.01, 100_000)
    && boundedNumber(value.rotation, -3600, 3600)
    && boundedNumber(value.skewX, -89, 89)
    && boundedNumber(value.skewY, -89, 89)
    && boundedNumber(value.originX, -100_000, 100_000)
    && boundedNumber(value.originY, -100_000, 100_000)
    && boundedNumber(value.warp, -100, 100)
    && boundedNumber(value.perspective, -100, 100)) ?? false;
}

function validateEffect(value: unknown, seen: WeakSet<object>): value is AppearanceEffect {
  if (!isPlainObject(value) || !exactKeys(value, EFFECT_KEYS)) return false;
  return withNode(value, seen, () => boundedId(value.id)
    && boundedString(value.name)
    && enumValue(value.kind, ['blur', 'shadow', 'glow', 'stroke', 'gradient', 'pattern', 'backdrop', 'filter'] as const)
    && typeof value.enabled === 'boolean'
    && boundedNumber(value.opacity, 0, 1)
    && noDangerousStyleText(value.color)
    && boundedNumber(value.radius, 0, 10_000)
    && boundedNumber(value.distance, -10_000, 10_000)
    && boundedNumber(value.angle, -3600, 3600)
    && boundedNumber(value.spread, -10_000, 10_000)
    && enumValue(value.blendMode, BLEND_MODES)) ?? false;
}

function validateAdjustment(value: unknown, seen: WeakSet<object>): value is AppearanceAdjustmentLayer {
  if (!isPlainObject(value) || !exactKeys(value, ADJUSTMENT_KEYS)) return false;
  return withNode(value, seen, () => boundedId(value.id)
    && boundedString(value.name)
    && enumValue(value.kind, ['brightness', 'contrast', 'saturation', 'hue', 'levels', 'curves', 'colour-balance'] as const)
    && typeof value.enabled === 'boolean'
    && boundedNumber(value.opacity, 0, 1)
    && boundedNumber(value.amount, -100, 100)) ?? false;
}

function validateSmartObject(value: unknown, seen: WeakSet<object>): value is AppearanceSmartObject {
  if (!isPlainObject(value) || !exactKeys(value, SMART_OBJECT_KEYS)) return false;
  return withNode(value, seen, () => boundedId(value.id)
    && boundedString(value.name)
    && boundedString(value.source)
    && typeof value.embedded === 'boolean'
    && boundedString(value.revision)) ?? false;
}

function validateMask(value: unknown, seen: WeakSet<object>): value is AppearanceMask {
  if (!isPlainObject(value) || !exactKeys(value, MASK_KEYS)) return false;
  return withNode(value, seen, () => boundedId(value.id)
    && boundedString(value.name)
    && enumValue(value.kind, ['clipping', 'vector', 'opacity', 'selection'] as const)
    && typeof value.enabled === 'boolean'
    && typeof value.inverted === 'boolean'
    && boundedNumber(value.opacity, 0, 1)) ?? false;
}

function validateChannel(value: unknown, seen: WeakSet<object>): value is AppearanceChannel {
  if (!isPlainObject(value) || !exactKeys(value, CHANNEL_KEYS)) return false;
  return withNode(value, seen, () => boundedId(value.id)
    && boundedString(value.name)
    && typeof value.visible === 'boolean'
    && boundedNumber(value.opacity, 0, 1)
    && enumValue(value.blendMode, BLEND_MODES)) ?? false;
}

function validatePoint(value: unknown, seen: WeakSet<object>): value is AppearancePoint {
  if (!isPlainObject(value) || !exactKeys(value, POINT_KEYS)) return false;
  return withNode(value, seen, () => boundedNumber(value.x, -100_000, 100_000) && boundedNumber(value.y, -100_000, 100_000)) ?? false;
}

function validateSelection(value: unknown, seen: WeakSet<object>): value is AppearanceSelection {
  if (!isPlainObject(value) || !exactKeys(value, SELECTION_KEYS)) return false;
  return withNode(value, seen, () => boundedId(value.id)
    && enumValue(value.kind, ['rectangular', 'elliptical', 'freehand', 'path', 'colour-range'] as const)
    && validateBounds(value.bounds, seen)
    && Array.isArray(value.points)
    && value.points.length <= MAX_APPEARANCE_COLLECTION
    && value.points.every((point) => validatePoint(point, seen))
    && boundedNumber(value.feather, 0, 10_000)
    && typeof value.inverted === 'boolean') ?? false;
}

function validateLayer(value: unknown, seen: WeakSet<object>): value is AppearanceLayer {
  if (!isPlainObject(value) || !exactKeys(value, LAYER_KEYS)) return false;
  return withNode(value, seen, () => boundedId(value.id)
    && boundedString(value.name)
    && enumValue(value.kind, LAYER_KINDS)
    && typeof value.visible === 'boolean'
    && typeof value.locked === 'boolean'
    && boundedNumber(value.opacity, 0, 1)
    && enumValue(value.blendMode, BLEND_MODES)
    && (value.parentId === null || boundedId(value.parentId))
    && noDangerousStyleText(value.fill)
    && noDangerousStyleText(value.stroke)
    && noDangerousStyleText(value.shadow)
    && validateTransform(value.transform, seen)
    && Array.isArray(value.effects)
    && value.effects.length <= MAX_APPEARANCE_COLLECTION
    && value.effects.every((effect) => boundedString(effect))
    && Array.isArray(value.effectStack)
    && value.effectStack.length <= MAX_APPEARANCE_COLLECTION
    && value.effectStack.every((effect) => validateEffect(effect, seen))
    && typeof value.clipping === 'boolean'
    && (value.vectorMask === null || boundedId(value.vectorMask))
    && (value.adjustmentRef === null || boundedId(value.adjustmentRef))
    && (value.smartObjectRef === null || boundedId(value.smartObjectRef))
    && Array.isArray(value.selectionRefs)
    && value.selectionRefs.length <= MAX_APPEARANCE_COLLECTION
    && value.selectionRefs.every((id) => boundedId(id))) ?? false;
}

function uniqueIds<T extends { id: string }>(values: readonly T[]): boolean {
  const ids = new Set<string>();
  return values.every((value) => !ids.has(value.id) && (ids.add(value.id), true));
}

function validateOverrides(value: unknown, seen: WeakSet<object>): value is Record<string, AppearanceOverrideValue> {
  if (!isPlainObject(value) || Object.keys(value).length > MAX_APPEARANCE_COLLECTION) return false;
  return withNode(value, seen, () => Object.entries(value).every(([key, item]) => {
    if (!boundedString(key) || key === '__proto__' || key === 'constructor' || key === 'prototype') return false;
    return (typeof item === 'string' && boundedString(item, STYLE_TEXT_PATTERN))
      || (typeof item === 'number' && Number.isFinite(item) && item >= -1_000_000 && item <= 1_000_000)
      || typeof item === 'boolean';
  })) ?? false;
}

function validateStyle(value: unknown, seen: WeakSet<object>): value is AppearanceStateStyle {
  if (!isPlainObject(value) || !exactKeys(value, STYLE_KEYS)) return false;
  const states = isPlainObject(value.states) ? value.states : null;
  const layers = Array.isArray(value.layers) ? value.layers : [];
  const selections = Array.isArray(value.selections) ? value.selections : [];
  const channels = Array.isArray(value.channels) ? value.channels : [];
  const masks = Array.isArray(value.masks) ? value.masks : [];
  const channelState = Array.isArray(value.channelState) ? value.channelState : [];
  const maskState = Array.isArray(value.maskState) ? value.maskState : [];
  const adjustments = Array.isArray(value.adjustments) ? value.adjustments : [];
  const smartObjects = Array.isArray(value.smartObjects) ? value.smartObjects : [];
  const rainbowSpeedLevel = value.rainbowSpeedLevel;
  return withNode(value, seen, () => Array.isArray(value.layers)
    && layers.length > 0
    && layers.length <= MAX_APPEARANCE_LAYERS
    && layers.every((layer) => validateLayer(layer, seen))
    && uniqueIds(layers)
    && Array.isArray(value.selections)
    && selections.length <= MAX_APPEARANCE_COLLECTION
    && selections.every((selection) => validateSelection(selection, seen))
    && uniqueIds(selections)
    && Array.isArray(value.channels)
    && channels.length > 0
    && channels.length <= MAX_APPEARANCE_COLLECTION
    && channels.every((channel) => boundedString(channel))
    && Array.isArray(value.masks)
    && masks.length <= MAX_APPEARANCE_COLLECTION
    && masks.every((mask) => boundedString(mask))
    && Array.isArray(value.channelState)
    && channelState.length > 0
    && channelState.length <= MAX_APPEARANCE_COLLECTION
    && channelState.every((channel) => validateChannel(channel, seen))
    && uniqueIds(channelState)
    && Array.isArray(value.maskState)
    && maskState.length <= MAX_APPEARANCE_COLLECTION
    && maskState.every((mask) => validateMask(mask, seen))
    && uniqueIds(maskState)
    && Array.isArray(value.adjustments)
    && adjustments.length <= MAX_APPEARANCE_COLLECTION
    && adjustments.every((adjustment) => validateAdjustment(adjustment, seen))
    && uniqueIds(adjustments)
    && Array.isArray(value.smartObjects)
    && smartObjects.length <= MAX_APPEARANCE_COLLECTION
    && smartObjects.every((smartObject) => validateSmartObject(smartObject, seen))
    && uniqueIds(smartObjects)
    && boundedString(value.fontFamily, STYLE_TEXT_PATTERN)
    && boundedNumber(value.fontSize, 6, 160)
    && boundedNumber(value.fontWeight, 100, 900)
    && typeof value.bold === 'boolean'
    && typeof value.italic === 'boolean'
    && typeof value.oblique === 'boolean'
    && enumValue(value.underline, ['none', 'single', 'double', 'wavy'] as const)
    && noDangerousStyleText(value.underlineColor)
    && enumValue(value.strike, ['none', 'single', 'double'] as const)
    && typeof value.overline === 'boolean'
    && enumValue(value.capitalization, ['none', 'uppercase', 'lowercase', 'capitalize', 'small-caps'] as const)
    && typeof value.smallCaps === 'boolean'
    && typeof value.superscript === 'boolean'
    && typeof value.subscript === 'boolean'
    && noDangerousStyleText(value.textColor)
    && noDangerousStyleText(value.highlightColor)
    && noDangerousStyleText(value.outlineColor)
    && boundedNumber(value.outlineWidth, 0, 100)
    && noDangerousStyleText(value.textShadow)
    && noDangerousStyleText(value.textGlow)
    && boundedNumber(value.letterSpacing, -10, 10)
    && boundedNumber(value.wordSpacing, -10, 20)
    && boundedNumber(value.lineHeight, 0.25, 8)
    && boundedNumber(value.baselineOffset, -10_000, 10_000)
    && enumValue(value.textDirection, ['ltr', 'rtl', 'auto'] as const)
    && enumValue(value.alignment, ['start', 'center', 'end', 'justify'] as const)
    && boundedNumber(value.borderRadius, 0, 500)
    && boundedNumber(value.elevation, 0, 48)
    && enumValue(value.motion, ['default', 'reduced', 'none'] as const)
    && typeof rainbowSpeedLevel === 'number'
    && [1, 2, 3, 4, 5].includes(rainbowSpeedLevel)
    && (value.inheritedFrom === null || enumValue(value.inheritedFrom, APPEARANCE_STATES))
    && validateOverrides(value.overrides, seen)
    && channels.length === channelState.length
    && channels.every((channel, index) => channel === (channelState[index] as AppearanceChannel | undefined)?.id)
    && masks.length === maskState.length
    && masks.every((mask, index) => mask === (maskState[index] as AppearanceMask | undefined)?.id)) ?? false;
}

function validateInheritance(states: Record<AppearanceState, AppearanceStateStyle>): boolean {
  for (const state of APPEARANCE_STATES) {
    const path = new Set<AppearanceState>();
    let current: AppearanceState | null = state;
    while (current) {
      if (path.has(current) || path.size > MAX_APPEARANCE_INHERIT_DEPTH) return false;
      path.add(current);
      current = states[current].inheritedFrom;
    }
  }
  return true;
}

function validateAppearance(value: unknown, expectedTargetId?: string): value is ElementAppearance {
  if (!isPlainObject(value) || !exactKeys(value, APPEARANCE_KEYS)) return false;
  const seen = new WeakSet<object>();
  const states = isPlainObject(value.states) ? value.states : null;
  return withNode(value, seen, () => boundedId(value.targetId)
    && (expectedTargetId === undefined || value.targetId === expectedTargetId)
    && states !== null
    && exactKeys(states, APPEARANCE_STATES)
    && APPEARANCE_STATES.every((state) => validateStyle(states[state], seen))
    && validateInheritance(states as Record<AppearanceState, AppearanceStateStyle>)
    && enumValue(value.activeState, APPEARANCE_STATES)
    && boundedNumber(value.zoom, 0.25, 4)
    && typeof value.rulers === 'boolean'
    && typeof value.guides === 'boolean'
    && boundedString(value.updatedAt, /^[0-9T:.+Z-]{1,64}$/u)) ?? false;
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
    return { ...base, ...layer, transform, effects: Array.isArray(layer.effects) ? layer.effects.filter((effect): effect is string => typeof effect === 'string').slice(0, MAX_APPEARANCE_COLLECTION) : [], effectStack: Array.isArray(layer.effectStack) ? layer.effectStack : [] } as AppearanceLayer;
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

export function applyAppearanceStateToElement(element: RenderedElement | null, state: AppearanceStateStyle, stateId: AppearanceState = 'normal'): void {
  if (!element || !validateStyle(state, new WeakSet<object>())) return;
  const visibleLayers = flattenVisibleLayers(state);
  const topLayer = visibleLayers.at(-1);
  const rainbow = state.textColor === RAINBOW_COLOR_SENTINEL;
  const duration = RAINBOW_DURATIONS[getRainbowSpeedLevel() - 1] ?? RAINBOW_DURATIONS[2];
  const style = element.style;
  style.removeProperty('background');
  style.removeProperty('border');
  style.removeProperty('box-shadow');
  style.removeProperty('filter');
  style.removeProperty('text-shadow');
  style.removeProperty('-webkit-text-stroke');
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
  style.boxShadow = state.elevation > 0 ? `0 ${state.elevation}px ${Math.max(1, state.elevation * 2)}px rgb(0 0 0 / 18%)` : '';
  style.textShadow = state.textShadow !== 'none' ? state.textShadow : state.textGlow !== 'none' ? state.textGlow : '';
  if (state.outlineWidth > 0 && state.outlineColor !== 'transparent') style.setProperty('-webkit-text-stroke', `${state.outlineWidth}px ${state.outlineColor}`);
  if (topLayer?.fill && topLayer.fill !== 'transparent') style.background = rainbow ? '' : topLayer.fill;
  if (topLayer?.stroke && topLayer.stroke !== 'transparent') style.border = topLayer.stroke;
  const effects = visibleLayers.flatMap((layer) => [...layer.effects, ...layer.effectStack.filter((effect) => effect.enabled).map((effect) => effect.kind)]).join(' ').toLowerCase();
  if (effects.includes('blur')) style.filter = 'blur(2px)';
  const transform = topLayer?.transform;
  style.transform = transform
    ? `translate(${transform.x}px, ${transform.y}px) rotate(${transform.rotation}deg) skew(${transform.skewX}deg, ${transform.skewY}deg) scale(${transform.width / 100}, ${transform.height / 100})`
    : '';
  // Use the inline CSS property so an existing semantic dir attribute is not
  // erased when an appearance override is cleared.
  style.direction = state.textDirection === 'auto' ? '' : state.textDirection;
  style.textAlign = state.alignment === 'start' ? '' : state.alignment;
  style.opacity = visibleLayers.length > 0 ? String(visibleLayers.reduce((value, layer) => value * layer.opacity, 1)) : '0';
  style.mixBlendMode = topLayer?.blendMode === 'normal' ? '' : topLayer?.blendMode ?? '';
  style.setProperty('--element-appearance-selections', JSON.stringify(state.selections));
  style.setProperty('--element-appearance-channels', state.channels.join(','));
  style.setProperty('--element-appearance-masks', state.masks.join(','));
  style.setProperty('--element-appearance-adjustments', JSON.stringify(state.adjustments));
  style.setProperty('--element-appearance-smart-objects', JSON.stringify(state.smartObjects.map((item) => item.id)));
  style.setProperty('--element-appearance-overrides', JSON.stringify(state.overrides));
  element.dataset.elementAppearanceRainbow = rainbow ? 'true' : 'false';
  element.dataset.elementAppearanceState = stateId;
  element.dataset.elementAppearanceMotion = state.motion;
}

export function clearAppearanceStateFromElement(element: RenderedElement | null): void {
  if (!element) return;
  const properties = [
    'color', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-decoration-line', 'text-decoration-style',
    'text-decoration-color', 'text-transform', 'font-variant-caps', 'letter-spacing', 'word-spacing', 'line-height',
    'vertical-align', 'border-radius', 'box-shadow', 'text-shadow', '-webkit-text-stroke', 'direction', 'text-align',
    'opacity', 'mix-blend-mode', 'background', 'border', 'filter', 'transform', '--element-appearance-text',
    '--element-appearance-highlight', '--element-appearance-radius', '--element-appearance-elevation',
    '--element-appearance-rainbow-duration', '--element-appearance-selections', '--element-appearance-channels',
    '--element-appearance-masks', '--element-appearance-adjustments', '--element-appearance-smart-objects',
    '--element-appearance-overrides',
  ];
  properties.forEach((property) => element.style.removeProperty(property));
  if (element instanceof HTMLElement) element.removeAttribute('dir');
  delete element.dataset.elementAppearanceRainbow;
  delete element.dataset.elementAppearanceState;
  delete element.dataset.elementAppearanceMotion;
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
    return () => listeners.delete(listener);
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

/**
 * Strict, renderer-independent validation for portable element appearance
 * exports.
 *
 * The export contains resolved appearance state, so accepting a partial or
 * loosely normalized object here would let an importer silently invent data.
 * This boundary requires every nested key, validates every scalar, bounds the
 * recursive value graph, and checks the relationships between named objects.
 * It is intentionally free of UI and storage dependencies so callers can run
 * it before applying or persisting an export.
 */

export const APPEARANCE_EXPORT_SCHEMA = 'open-design.element-appearance' as const;
export const APPEARANCE_EXPORT_VERSION = 1 as const;

export const APPEARANCE_EXPORT_LIMITS = Object.freeze({
  maxSerializedBytes: 500_000,
  maxDepth: 32,
  maxEntries: 10_000,
  maxIdentityBytes: 128,
  maxStringBytes: 1_024,
  maxCollectionEntries: 256,
  maxLayers: 256,
  maxStates: 12,
  maxNumberMagnitude: 1_000_000,
} as const);

export const APPEARANCE_EXPORT_STATES = [
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

type AppearanceExportState = (typeof APPEARANCE_EXPORT_STATES)[number];

export type AppearanceExportValidationCode =
  | 'not-object'
  | 'unknown-key'
  | 'missing-key'
  | 'wrong-type'
  | 'invalid-schema'
  | 'invalid-version'
  | 'invalid-identity'
  | 'duplicate-identity'
  | 'missing-reference'
  | 'parent-cycle'
  | 'identity-cycle'
  | 'non-finite-number'
  | 'number-out-of-bounds'
  | 'string-out-of-bounds'
  | 'array-out-of-bounds'
  | 'object-out-of-bounds'
  | 'unsafe-key'
  | 'max-depth-exceeded'
  | 'max-entries-exceeded'
  | 'cycle-detected'
  | 'serialized-bytes-exceeded'
  | 'invalid-json'
  | 'duplicate-key';

export interface AppearanceExportValidationIssue {
  readonly code: AppearanceExportValidationCode;
  readonly path: string;
  readonly message: string;
}

export interface AppearanceExportValidationStats {
  readonly serializedBytes: number;
  readonly maxDepth: number;
  readonly entries: number;
}

export interface AppearanceExportValidationSuccess {
  readonly ok: true;
  readonly value: AppearanceExportDocument;
  readonly stats: AppearanceExportValidationStats;
}

export interface AppearanceExportValidationFailure {
  readonly ok: false;
  readonly issue: AppearanceExportValidationIssue;
}

export type AppearanceExportValidationResult =
  | AppearanceExportValidationSuccess
  | AppearanceExportValidationFailure;

export interface AppearanceExportDocument {
  readonly schema: typeof APPEARANCE_EXPORT_SCHEMA;
  readonly version: typeof APPEARANCE_EXPORT_VERSION;
  readonly targetId: string;
  readonly appearance: unknown;
}

const EXPORT_KEYS = ['schema', 'version', 'targetId', 'appearance'] as const;
const APPEARANCE_KEYS = ['targetId', 'states', 'activeState', 'zoom', 'rulers', 'guides', 'updatedAt'] as const;
const STYLE_KEYS = [
  'layers', 'selections', 'channels', 'masks', 'channelState', 'maskState', 'adjustments',
  'smartObjects', 'fontFamily', 'fontSize', 'fontWeight', 'bold', 'italic', 'oblique',
  'underline', 'underlineColor', 'strike', 'overline', 'capitalization', 'smallCaps',
  'superscript', 'subscript', 'textColor', 'highlightColor', 'outlineColor', 'outlineWidth',
  'textShadow', 'textGlow', 'letterSpacing', 'wordSpacing', 'lineHeight', 'baselineOffset',
  'textDirection', 'alignment', 'borderRadius', 'elevation', 'motion', 'rainbowSpeedLevel',
  'inheritedFrom', 'overrides',
] as const;
const LAYER_KEYS = [
  'id', 'name', 'kind', 'visible', 'locked', 'opacity', 'blendMode', 'parentId', 'fill', 'stroke',
  'shadow', 'transform', 'effects', 'effectStack', 'clipping', 'vectorMask', 'adjustmentRef',
  'smartObjectRef', 'selectionRefs',
] as const;
const TRANSFORM_KEYS = [
  'x', 'y', 'width', 'height', 'rotation', 'skewX', 'skewY', 'originX', 'originY', 'warp', 'perspective',
] as const;
const EFFECT_KEYS = [
  'id', 'name', 'kind', 'enabled', 'opacity', 'color', 'radius', 'distance', 'angle', 'spread', 'blendMode',
] as const;
const ADJUSTMENT_KEYS = ['id', 'name', 'kind', 'enabled', 'opacity', 'amount'] as const;
const SMART_OBJECT_KEYS = ['id', 'name', 'source', 'embedded', 'revision'] as const;
const MASK_KEYS = ['id', 'name', 'kind', 'enabled', 'inverted', 'opacity'] as const;
const CHANNEL_KEYS = ['id', 'name', 'visible', 'opacity', 'blendMode'] as const;
const SELECTION_KEYS = ['id', 'kind', 'bounds', 'points', 'feather', 'inverted'] as const;
const BOUNDS_KEYS = ['x', 'y', 'width', 'height'] as const;
const POINT_KEYS = ['x', 'y'] as const;

const LAYER_KINDS = ['group', 'shape', 'text', 'image', 'adjustment', 'mask', 'smart-object', 'effect'] as const;
const BLEND_MODES = [
  'normal', 'multiply', 'screen', 'overlay', 'soft-light', 'hard-light', 'difference',
  'exclusion', 'darken', 'lighten',
] as const;
const EFFECT_KINDS = ['blur', 'shadow', 'glow', 'stroke', 'gradient', 'pattern', 'backdrop', 'filter'] as const;
const ADJUSTMENT_KINDS = ['brightness', 'contrast', 'saturation', 'hue', 'levels', 'curves', 'colour-balance'] as const;
const MASK_KINDS = ['clipping', 'vector', 'opacity', 'selection'] as const;
const SELECTION_KINDS = ['rectangular', 'elliptical', 'freehand', 'path', 'colour-range'] as const;
const UNDERLINES = ['none', 'single', 'double', 'wavy'] as const;
const STRIKES = ['none', 'single', 'double'] as const;
const CAPITALIZATIONS = ['none', 'uppercase', 'lowercase', 'capitalize', 'small-caps'] as const;
const TEXT_DIRECTIONS = ['ltr', 'rtl', 'auto'] as const;
const ALIGNMENTS = ['start', 'center', 'end', 'justify'] as const;
const MOTIONS = ['default', 'reduced', 'none'] as const;

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$/u;
const OVERRIDE_KEY_PATTERN = /^(?:[A-Za-z_][A-Za-z0-9_.:-]*|--[A-Za-z0-9_.-]+)$/u;
const TEXT_PATTERN = /^[^\u0000-\u001f\u007f<>]*$/u;
const STYLE_FORBIDDEN_PATTERN = /url\s*\(|@import|expression\s*\(|javascript\s*:/iu;
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

type UnknownRecord = Record<string, unknown>;

interface ValidationContext {
  entries: number;
  activeDepth: number;
  maxDepth: number;
  ancestors: WeakSet<object>;
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function isPlainObject(value: unknown): value is UnknownRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function fail(
  code: AppearanceExportValidationCode,
  path: string,
  message: string,
): AppearanceExportValidationIssue {
  return { code, path, message };
}

function hasOwn(value: UnknownRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function exactKeys(
  value: unknown,
  allowed: readonly string[],
  path: string,
): AppearanceExportValidationIssue | null {
  if (!isPlainObject(value)) return fail('not-object', path, 'Expected a plain object.');
  const actual = Object.keys(value);
  for (const key of actual) {
    if (!allowed.includes(key)) return fail('unknown-key', `${path}.${key}`, `Unknown key "${key}".`);
  }
  for (const key of allowed) {
    if (!hasOwn(value, key)) return fail('missing-key', `${path}.${key}`, `Missing required key "${key}".`);
  }
  return null;
}

function enter(value: object, _depth: number, path: string, context: ValidationContext): AppearanceExportValidationIssue | null {
  const actualDepth = context.activeDepth;
  if (actualDepth > APPEARANCE_EXPORT_LIMITS.maxDepth) {
    return fail('max-depth-exceeded', path, `Nesting depth exceeds ${APPEARANCE_EXPORT_LIMITS.maxDepth}.`);
  }
  if (context.ancestors.has(value)) {
    return fail('cycle-detected', path, 'The appearance export contains a cyclic object.');
  }
  context.ancestors.add(value);
  context.activeDepth += 1;
  context.maxDepth = Math.max(context.maxDepth, actualDepth);
  return null;
}

function leave(value: object, context: ValidationContext): void {
  context.ancestors.delete(value);
  context.activeDepth -= 1;
}

function preflightGraph(
  value: unknown,
  path: string,
  depth: number,
  ancestors: WeakSet<object>,
  state: { entries: number },
): AppearanceExportValidationIssue | null {
  if (value === null || typeof value !== 'object') return null;
  if (depth > APPEARANCE_EXPORT_LIMITS.maxDepth) {
    return fail('max-depth-exceeded', path, `Nesting depth exceeds ${APPEARANCE_EXPORT_LIMITS.maxDepth}.`);
  }
  if (ancestors.has(value)) {
    return fail('cycle-detected', path, 'The appearance export contains a cyclic object.');
  }
  state.entries += 1;
  if (state.entries > APPEARANCE_EXPORT_LIMITS.maxEntries) {
    return fail('max-entries-exceeded', path, `Entry count exceeds ${APPEARANCE_EXPORT_LIMITS.maxEntries}.`);
  }
  ancestors.add(value);
  try {
    const record = value as UnknownRecord;
    for (const key of Object.keys(value)) {
      const issue = preflightGraph(record[key], `${path}.${key}`, depth + 1, ancestors, state);
      if (issue) return issue;
    }
    return null;
  } finally {
    ancestors.delete(value);
  }
}

function countEntry(path: string, context: ValidationContext): AppearanceExportValidationIssue | null {
  context.entries += 1;
  if (context.entries > APPEARANCE_EXPORT_LIMITS.maxEntries) {
    return fail('max-entries-exceeded', path, `Entry count exceeds ${APPEARANCE_EXPORT_LIMITS.maxEntries}.`);
  }
  return null;
}

function boundedString(value: unknown, path: string, maximum: number = APPEARANCE_EXPORT_LIMITS.maxStringBytes): AppearanceExportValidationIssue | null {
  if (typeof value !== 'string') return fail('wrong-type', path, 'Expected a string.');
  const bytes = utf8Bytes(value);
  if (bytes === 0 || bytes > maximum || !TEXT_PATTERN.test(value)) {
    return fail('string-out-of-bounds', path, `String must be 1-${maximum} printable UTF-8 bytes.`);
  }
  return null;
}

function identity(value: unknown, path: string): AppearanceExportValidationIssue | null {
  if (typeof value !== 'string') return fail('wrong-type', path, 'Identity must be a string.');
  const bytes = utf8Bytes(value);
  if (bytes === 0 || bytes > APPEARANCE_EXPORT_LIMITS.maxIdentityBytes || !ID_PATTERN.test(value)) {
    return fail('invalid-identity', path, 'Identity must be a bounded ASCII token.');
  }
  return null;
}

function boundedNumber(value: unknown, path: string, minimum: number, maximum: number): AppearanceExportValidationIssue | null {
  if (typeof value !== 'number') return fail('wrong-type', path, 'Expected a number.');
  if (!Number.isFinite(value)) return fail('non-finite-number', path, 'Number must be finite.');
  if (Math.abs(value) > APPEARANCE_EXPORT_LIMITS.maxNumberMagnitude || value < minimum || value > maximum) {
    return fail('number-out-of-bounds', path, `Number must be between ${minimum} and ${maximum}.`);
  }
  return null;
}

function boolean(value: unknown, path: string): AppearanceExportValidationIssue | null {
  return typeof value === 'boolean' ? null : fail('wrong-type', path, 'Expected a boolean.');
}

function enumValue<T extends string>(value: unknown, values: readonly T[], path: string): AppearanceExportValidationIssue | null {
  return typeof value === 'string' && values.includes(value as T)
    ? null
    : fail('wrong-type', path, 'Value is not one of the supported choices.');
}

function styleText(value: unknown, path: string): AppearanceExportValidationIssue | null {
  const result = boundedString(value, path);
  if (result) return result;
  if (STYLE_FORBIDDEN_PATTERN.test(value as string)) {
    return fail('unsafe-key', path, 'Style text cannot load external or executable content.');
  }
  return null;
}

function arrayValue(value: unknown, path: string, minimum = 0): AppearanceExportValidationIssue | null {
  if (!Array.isArray(value)) return fail('wrong-type', path, 'Expected an array.');
  if (value.length < minimum || value.length > APPEARANCE_EXPORT_LIMITS.maxCollectionEntries) {
    return fail('array-out-of-bounds', path, `Array length must be ${minimum}-${APPEARANCE_EXPORT_LIMITS.maxCollectionEntries}.`);
  }
  return null;
}

function objectValue(value: unknown, path: string): AppearanceExportValidationIssue | null {
  if (!isPlainObject(value)) return fail('not-object', path, 'Expected a plain object.');
  if (Object.keys(value).length > APPEARANCE_EXPORT_LIMITS.maxCollectionEntries) {
    return fail('object-out-of-bounds', path, `Object key count exceeds ${APPEARANCE_EXPORT_LIMITS.maxCollectionEntries}.`);
  }
  return null;
}

function validateTransform(value: unknown, path: string, context: ValidationContext): AppearanceExportValidationIssue | null {
  const shape = exactKeys(value, TRANSFORM_KEYS, path);
  if (shape) return shape;
  const record = value as UnknownRecord;
  const entered = enter(record, context.maxDepth + 1, path, context);
  if (entered) return entered;
  try {
    const entry = countEntry(path, context);
    if (entry) return entry;
    for (const [key, minimum, maximum] of [
      ['x', -100_000, 100_000], ['y', -100_000, 100_000], ['width', 0.01, 100_000],
      ['height', 0.01, 100_000], ['rotation', -3600, 3600], ['skewX', -89, 89], ['skewY', -89, 89],
      ['originX', -100_000, 100_000], ['originY', -100_000, 100_000], ['warp', -100, 100],
      ['perspective', -100, 100],
    ] as const) {
      const issue = boundedNumber(record[key], `${path}.${key}`, minimum, maximum);
      if (issue) return issue;
    }
    return null;
  } finally {
    leave(record, context);
  }
}

function validateEffect(value: unknown, path: string, context: ValidationContext): AppearanceExportValidationIssue | null {
  const shape = exactKeys(value, EFFECT_KEYS, path);
  if (shape) return shape;
  const record = value as UnknownRecord;
  const entered = enter(record, context.maxDepth + 1, path, context);
  if (entered) return entered;
  try {
    const entry = countEntry(path, context);
    if (entry) return entry;
    const checks: Array<AppearanceExportValidationIssue | null> = [
      identity(record.id, `${path}.id`), boundedString(record.name, `${path}.name`),
      enumValue(record.kind, EFFECT_KINDS, `${path}.kind`), boolean(record.enabled, `${path}.enabled`),
      boundedNumber(record.opacity, `${path}.opacity`, 0, 1), styleText(record.color, `${path}.color`),
      boundedNumber(record.radius, `${path}.radius`, 0, 10_000), boundedNumber(record.distance, `${path}.distance`, -10_000, 10_000),
      boundedNumber(record.angle, `${path}.angle`, -3600, 3600), boundedNumber(record.spread, `${path}.spread`, -10_000, 10_000),
      enumValue(record.blendMode, BLEND_MODES, `${path}.blendMode`),
    ];
    return checks.find((issue) => issue !== null) ?? null;
  } finally {
    leave(record, context);
  }
}

function validateAdjustment(value: unknown, path: string, context: ValidationContext): AppearanceExportValidationIssue | null {
  const shape = exactKeys(value, ADJUSTMENT_KEYS, path);
  if (shape) return shape;
  const record = value as UnknownRecord;
  const entered = enter(record, context.maxDepth + 1, path, context);
  if (entered) return entered;
  try {
    const entry = countEntry(path, context);
    if (entry) return entry;
    const checks: Array<AppearanceExportValidationIssue | null> = [
      identity(record.id, `${path}.id`), boundedString(record.name, `${path}.name`),
      enumValue(record.kind, ADJUSTMENT_KINDS, `${path}.kind`), boolean(record.enabled, `${path}.enabled`),
      boundedNumber(record.opacity, `${path}.opacity`, 0, 1), boundedNumber(record.amount, `${path}.amount`, -100, 100),
    ];
    return checks.find((issue) => issue !== null) ?? null;
  } finally {
    leave(record, context);
  }
}

function validateSmartObject(value: unknown, path: string, context: ValidationContext): AppearanceExportValidationIssue | null {
  const shape = exactKeys(value, SMART_OBJECT_KEYS, path);
  if (shape) return shape;
  const record = value as UnknownRecord;
  const entered = enter(record, context.maxDepth + 1, path, context);
  if (entered) return entered;
  try {
    const entry = countEntry(path, context);
    if (entry) return entry;
    return [
      identity(record.id, `${path}.id`), boundedString(record.name, `${path}.name`),
      boundedString(record.source, `${path}.source`), boolean(record.embedded, `${path}.embedded`),
      boundedString(record.revision, `${path}.revision`),
    ].find((issue) => issue !== null) ?? null;
  } finally {
    leave(record, context);
  }
}

function validateMask(value: unknown, path: string, context: ValidationContext): AppearanceExportValidationIssue | null {
  const shape = exactKeys(value, MASK_KEYS, path);
  if (shape) return shape;
  const record = value as UnknownRecord;
  const entered = enter(record, context.maxDepth + 1, path, context);
  if (entered) return entered;
  try {
    const entry = countEntry(path, context);
    if (entry) return entry;
    return [
      identity(record.id, `${path}.id`), boundedString(record.name, `${path}.name`),
      enumValue(record.kind, MASK_KINDS, `${path}.kind`), boolean(record.enabled, `${path}.enabled`),
      boolean(record.inverted, `${path}.inverted`), boundedNumber(record.opacity, `${path}.opacity`, 0, 1),
    ].find((issue) => issue !== null) ?? null;
  } finally {
    leave(record, context);
  }
}

function validateChannel(value: unknown, path: string, context: ValidationContext): AppearanceExportValidationIssue | null {
  const shape = exactKeys(value, CHANNEL_KEYS, path);
  if (shape) return shape;
  const record = value as UnknownRecord;
  const entered = enter(record, context.maxDepth + 1, path, context);
  if (entered) return entered;
  try {
    const entry = countEntry(path, context);
    if (entry) return entry;
    return [
      identity(record.id, `${path}.id`), boundedString(record.name, `${path}.name`),
      boolean(record.visible, `${path}.visible`), boundedNumber(record.opacity, `${path}.opacity`, 0, 1),
      enumValue(record.blendMode, BLEND_MODES, `${path}.blendMode`),
    ].find((issue) => issue !== null) ?? null;
  } finally {
    leave(record, context);
  }
}

function validatePoint(value: unknown, path: string, context: ValidationContext): AppearanceExportValidationIssue | null {
  const shape = exactKeys(value, POINT_KEYS, path);
  if (shape) return shape;
  const record = value as UnknownRecord;
  const entered = enter(record, context.maxDepth + 1, path, context);
  if (entered) return entered;
  try {
    const entry = countEntry(path, context);
    if (entry) return entry;
    return [
      boundedNumber(record.x, `${path}.x`, -100_000, 100_000),
      boundedNumber(record.y, `${path}.y`, -100_000, 100_000),
    ].find((issue) => issue !== null) ?? null;
  } finally {
    leave(record, context);
  }
}

function validateSelection(value: unknown, path: string, context: ValidationContext): AppearanceExportValidationIssue | null {
  const shape = exactKeys(value, SELECTION_KEYS, path);
  if (shape) return shape;
  const record = value as UnknownRecord;
  const entered = enter(record, context.maxDepth + 1, path, context);
  if (entered) return entered;
  try {
    const entry = countEntry(path, context);
    if (entry) return entry;
    const points = arrayValue(record.points, `${path}.points`);
    if (points) return points;
    for (let index = 0; index < (record.points as unknown[]).length; index += 1) {
      const issue = validatePoint((record.points as unknown[])[index], `${path}.points[${index}]`, context);
      if (issue) return issue;
    }
    return [
      identity(record.id, `${path}.id`), enumValue(record.kind, SELECTION_KINDS, `${path}.kind`),
      validateBounds(record.bounds, `${path}.bounds`, context), boundedNumber(record.feather, `${path}.feather`, 0, 10_000),
      boolean(record.inverted, `${path}.inverted`),
    ].find((issue) => issue !== null) ?? null;
  } finally {
    leave(record, context);
  }
}

function validateBounds(value: unknown, path: string, context: ValidationContext): AppearanceExportValidationIssue | null {
  const shape = exactKeys(value, BOUNDS_KEYS, path);
  if (shape) return shape;
  const record = value as UnknownRecord;
  const entered = enter(record, context.maxDepth + 1, path, context);
  if (entered) return entered;
  try {
    const entry = countEntry(path, context);
    if (entry) return entry;
    return [
      boundedNumber(record.x, `${path}.x`, -100_000, 100_000), boundedNumber(record.y, `${path}.y`, -100_000, 100_000),
      boundedNumber(record.width, `${path}.width`, 0, 100_000), boundedNumber(record.height, `${path}.height`, 0, 100_000),
    ].find((issue) => issue !== null) ?? null;
  } finally {
    leave(record, context);
  }
}

function validateLayer(value: unknown, path: string, context: ValidationContext): AppearanceExportValidationIssue | null {
  const shape = exactKeys(value, LAYER_KEYS, path);
  if (shape) return shape;
  const record = value as UnknownRecord;
  const entered = enter(record, context.maxDepth + 1, path, context);
  if (entered) return entered;
  try {
    const entry = countEntry(path, context);
    if (entry) return entry;
    const effects = arrayValue(record.effects, `${path}.effects`);
    if (effects) return effects;
    for (let index = 0; index < (record.effects as unknown[]).length; index += 1) {
      const issue = identity((record.effects as unknown[])[index], `${path}.effects[${index}]`);
      if (issue) return issue;
    }
    const selectionRefs = arrayValue(record.selectionRefs, `${path}.selectionRefs`);
    if (selectionRefs) return selectionRefs;
    for (let index = 0; index < (record.selectionRefs as unknown[]).length; index += 1) {
      const issue = identity((record.selectionRefs as unknown[])[index], `${path}.selectionRefs[${index}]`);
      if (issue) return issue;
    }
    const effectStack = arrayValue(record.effectStack, `${path}.effectStack`);
    if (effectStack) return effectStack;
    for (let index = 0; index < (record.effectStack as unknown[]).length; index += 1) {
      const issue = validateEffect((record.effectStack as unknown[])[index], `${path}.effectStack[${index}]`, context);
      if (issue) return issue;
    }
    return [
      identity(record.id, `${path}.id`), boundedString(record.name, `${path}.name`), enumValue(record.kind, LAYER_KINDS, `${path}.kind`),
      boolean(record.visible, `${path}.visible`), boolean(record.locked, `${path}.locked`), boundedNumber(record.opacity, `${path}.opacity`, 0, 1),
      enumValue(record.blendMode, BLEND_MODES, `${path}.blendMode`),
      record.parentId === null ? null : identity(record.parentId, `${path}.parentId`),
      styleText(record.fill, `${path}.fill`), styleText(record.stroke, `${path}.stroke`), styleText(record.shadow, `${path}.shadow`),
      validateTransform(record.transform, `${path}.transform`, context), boolean(record.clipping, `${path}.clipping`),
      record.vectorMask === null ? null : identity(record.vectorMask, `${path}.vectorMask`),
      record.adjustmentRef === null ? null : identity(record.adjustmentRef, `${path}.adjustmentRef`),
      record.smartObjectRef === null ? null : identity(record.smartObjectRef, `${path}.smartObjectRef`),
    ].find((issue) => issue !== null) ?? null;
  } finally {
    leave(record, context);
  }
}

function uniqueIds(values: readonly unknown[], path: string): AppearanceExportValidationIssue | null {
  const ids = new Set<string>();
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index] as UnknownRecord;
    if (!ids.has(value.id as string)) {
      ids.add(value.id as string);
      continue;
    }
    return fail('duplicate-identity', `${path}[${index}].id`, `Duplicate identity "${value.id}".`);
  }
  return null;
}

function validateOverrides(value: unknown, path: string, context: ValidationContext): AppearanceExportValidationIssue | null {
  const shape = objectValue(value, path);
  if (shape) return shape;
  const record = value as UnknownRecord;
  const entered = enter(record, context.maxDepth + 1, path, context);
  if (entered) return entered;
  try {
    const entry = countEntry(path, context);
    if (entry) return entry;
    for (const [key, item] of Object.entries(record)) {
      if (UNSAFE_KEYS.has(key) || utf8Bytes(key) > APPEARANCE_EXPORT_LIMITS.maxStringBytes || !OVERRIDE_KEY_PATTERN.test(key)) {
        return fail('unsafe-key', `${path}.${key}`, 'Override key is not safe.');
      }
      const issue = typeof item === 'string'
        ? styleText(item, `${path}.${key}`)
        : typeof item === 'number'
          ? boundedNumber(item, `${path}.${key}`, -1_000_000, 1_000_000)
          : boolean(item, `${path}.${key}`);
      if (issue) return issue;
    }
    return null;
  } finally {
    leave(record, context);
  }
}

function validateStyle(value: unknown, path: string, context: ValidationContext): AppearanceExportValidationIssue | null {
  const shape = exactKeys(value, STYLE_KEYS, path);
  if (shape) return shape;
  const record = value as UnknownRecord;
  const entered = enter(record, context.maxDepth + 1, path, context);
  if (entered) return entered;
  try {
    const entry = countEntry(path, context);
    if (entry) return entry;
    const layers = arrayValue(record.layers, `${path}.layers`, 1);
    if (layers) return layers;
    if ((record.layers as unknown[]).length > APPEARANCE_EXPORT_LIMITS.maxLayers) {
      return fail('array-out-of-bounds', `${path}.layers`, `Layer count exceeds ${APPEARANCE_EXPORT_LIMITS.maxLayers}.`);
    }
    for (let index = 0; index < (record.layers as unknown[]).length; index += 1) {
      const issue = validateLayer((record.layers as unknown[])[index], `${path}.layers[${index}]`, context);
      if (issue) return issue;
    }
    const layersUnique = uniqueIds(record.layers as unknown[], `${path}.layers`);
    if (layersUnique) return layersUnique;
    const selections = arrayValue(record.selections, `${path}.selections`);
    if (selections) return selections;
    for (let index = 0; index < (record.selections as unknown[]).length; index += 1) {
      const issue = validateSelection((record.selections as unknown[])[index], `${path}.selections[${index}]`, context);
      if (issue) return issue;
    }
    const selectionsUnique = uniqueIds(record.selections as unknown[], `${path}.selections`);
    if (selectionsUnique) return selectionsUnique;
    const channels = arrayValue(record.channels, `${path}.channels`, 1);
    if (channels) return channels;
    for (let index = 0; index < (record.channels as unknown[]).length; index += 1) {
      const issue = identity((record.channels as unknown[])[index], `${path}.channels[${index}]`);
      if (issue) return issue;
    }
    const masks = arrayValue(record.masks, `${path}.masks`);
    if (masks) return masks;
    for (let index = 0; index < (record.masks as unknown[]).length; index += 1) {
      const issue = identity((record.masks as unknown[])[index], `${path}.masks[${index}]`);
      if (issue) return issue;
    }
    const channelState = arrayValue(record.channelState, `${path}.channelState`, 1);
    if (channelState) return channelState;
    const maskState = arrayValue(record.maskState, `${path}.maskState`);
    if (maskState) return maskState;
    const adjustments = arrayValue(record.adjustments, `${path}.adjustments`);
    if (adjustments) return adjustments;
    const smartObjects = arrayValue(record.smartObjects, `${path}.smartObjects`);
    if (smartObjects) return smartObjects;
    for (let index = 0; index < (record.channelState as unknown[]).length; index += 1) {
      const issue = validateChannel((record.channelState as unknown[])[index], `${path}.channelState[${index}]`, context);
      if (issue) return issue;
    }
    for (let index = 0; index < (record.maskState as unknown[]).length; index += 1) {
      const issue = validateMask((record.maskState as unknown[])[index], `${path}.maskState[${index}]`, context);
      if (issue) return issue;
    }
    for (let index = 0; index < (record.adjustments as unknown[]).length; index += 1) {
      const issue = validateAdjustment((record.adjustments as unknown[])[index], `${path}.adjustments[${index}]`, context);
      if (issue) return issue;
    }
    for (let index = 0; index < (record.smartObjects as unknown[]).length; index += 1) {
      const issue = validateSmartObject((record.smartObjects as unknown[])[index], `${path}.smartObjects[${index}]`, context);
      if (issue) return issue;
    }
    const channelUnique = uniqueIds(record.channelState as unknown[], `${path}.channelState`);
    if (channelUnique) return channelUnique;
    const maskUnique = uniqueIds(record.maskState as unknown[], `${path}.maskState`);
    if (maskUnique) return maskUnique;
    const adjustmentUnique = uniqueIds(record.adjustments as unknown[], `${path}.adjustments`);
    if (adjustmentUnique) return adjustmentUnique;
    const smartObjectUnique = uniqueIds(record.smartObjects as unknown[], `${path}.smartObjects`);
    if (smartObjectUnique) return smartObjectUnique;
    const scalarChecks: Array<AppearanceExportValidationIssue | null> = [
      boundedString(record.fontFamily, `${path}.fontFamily`), boundedNumber(record.fontSize, `${path}.fontSize`, 6, 160),
      boundedNumber(record.fontWeight, `${path}.fontWeight`, 100, 900), boolean(record.bold, `${path}.bold`),
      boolean(record.italic, `${path}.italic`), boolean(record.oblique, `${path}.oblique`),
      enumValue(record.underline, UNDERLINES, `${path}.underline`), styleText(record.underlineColor, `${path}.underlineColor`),
      enumValue(record.strike, STRIKES, `${path}.strike`), boolean(record.overline, `${path}.overline`),
      enumValue(record.capitalization, CAPITALIZATIONS, `${path}.capitalization`), boolean(record.smallCaps, `${path}.smallCaps`),
      boolean(record.superscript, `${path}.superscript`), boolean(record.subscript, `${path}.subscript`),
      styleText(record.textColor, `${path}.textColor`), styleText(record.highlightColor, `${path}.highlightColor`),
      styleText(record.outlineColor, `${path}.outlineColor`), boundedNumber(record.outlineWidth, `${path}.outlineWidth`, 0, 100),
      styleText(record.textShadow, `${path}.textShadow`), styleText(record.textGlow, `${path}.textGlow`),
      boundedNumber(record.letterSpacing, `${path}.letterSpacing`, -10, 10), boundedNumber(record.wordSpacing, `${path}.wordSpacing`, -10, 20),
      boundedNumber(record.lineHeight, `${path}.lineHeight`, 0.25, 8), boundedNumber(record.baselineOffset, `${path}.baselineOffset`, -10_000, 10_000),
      enumValue(record.textDirection, TEXT_DIRECTIONS, `${path}.textDirection`), enumValue(record.alignment, ALIGNMENTS, `${path}.alignment`),
      boundedNumber(record.borderRadius, `${path}.borderRadius`, 0, 500), boundedNumber(record.elevation, `${path}.elevation`, 0, 48),
      enumValue(record.motion, MOTIONS, `${path}.motion`), boundedNumber(record.rainbowSpeedLevel, `${path}.rainbowSpeedLevel`, 1, 5),
      record.inheritedFrom === null ? null : enumValue(record.inheritedFrom, APPEARANCE_EXPORT_STATES, `${path}.inheritedFrom`),
      validateOverrides(record.overrides, `${path}.overrides`, context),
    ];
    return scalarChecks.find((issue) => issue !== null) ?? null;
  } finally {
    leave(record, context);
  }
}

function validateParentGraph(style: UnknownRecord, path: string): AppearanceExportValidationIssue | null {
  const layers = style.layers as UnknownRecord[];
  const byId = new Map<string, UnknownRecord>();
  for (const layer of layers) byId.set(layer.id as string, layer);
  for (const layer of layers) {
    const parentId = layer.parentId as string | null;
    if (parentId !== null && !byId.has(parentId)) {
      return fail('missing-reference', `${path}.layers[parentId=${layer.id}].parentId`, `Parent identity "${parentId}" is missing.`);
    }
    const seen = new Set<string>();
    let current: string | null = layer.id as string;
    while (current !== null) {
      if (seen.has(current)) return fail('parent-cycle', `${path}.layers[parentId=${layer.id}].parentId`, 'Layer parent identities form a cycle.');
      seen.add(current);
      current = (byId.get(current)?.parentId as string | null | undefined) ?? null;
    }
  }
  return null;
}

function validateIdentityReferences(style: UnknownRecord, path: string): AppearanceExportValidationIssue | null {
  const layers = style.layers as UnknownRecord[];
  const selections = new Set((style.selections as UnknownRecord[]).map((entry) => entry.id as string));
  const effects = new Set(layers.flatMap((layer) => (layer.effectStack as UnknownRecord[]).map((entry) => entry.id as string)));
  const masks = new Set((style.maskState as UnknownRecord[]).map((entry) => entry.id as string));
  const adjustments = new Set((style.adjustments as UnknownRecord[]).map((entry) => entry.id as string));
  const smartObjects = new Set((style.smartObjects as UnknownRecord[]).map((entry) => entry.id as string));
  for (const layer of layers) {
    for (const id of layer.effects as string[]) if (!effects.has(id)) return fail('missing-reference', `${path}.layers[${layer.id}].effects`, `Effect identity "${id}" is missing.`);
    for (const id of layer.selectionRefs as string[]) if (!selections.has(id)) return fail('missing-reference', `${path}.layers[${layer.id}].selectionRefs`, `Selection identity "${id}" is missing.`);
    if (layer.vectorMask !== null && !masks.has(layer.vectorMask as string)) return fail('missing-reference', `${path}.layers[${layer.id}].vectorMask`, 'Mask identity is missing.');
    if (layer.adjustmentRef !== null && !adjustments.has(layer.adjustmentRef as string)) return fail('missing-reference', `${path}.layers[${layer.id}].adjustmentRef`, 'Adjustment identity is missing.');
    if (layer.smartObjectRef !== null && !smartObjects.has(layer.smartObjectRef as string)) return fail('missing-reference', `${path}.layers[${layer.id}].smartObjectRef`, 'Smart-object identity is missing.');
  }
  if ((style.channels as string[]).length !== (style.channelState as unknown[]).length) return fail('identity-cycle', `${path}.channels`, 'Channel identities do not match channel state.');
  if ((style.masks as string[]).length !== (style.maskState as unknown[]).length) return fail('identity-cycle', `${path}.masks`, 'Mask identities do not match mask state.');
  for (let index = 0; index < (style.channels as string[]).length; index += 1) {
    if ((style.channels as string[])[index] !== (style.channelState as UnknownRecord[])[index]?.id) return fail('identity-cycle', `${path}.channels[${index}]`, 'Channel identity order does not match channel state.');
  }
  for (let index = 0; index < (style.masks as string[]).length; index += 1) {
    if ((style.masks as string[])[index] !== (style.maskState as UnknownRecord[])[index]?.id) return fail('identity-cycle', `${path}.masks[${index}]`, 'Mask identity order does not match mask state.');
  }
  return null;
}

function validateInheritance(states: UnknownRecord, path: string): AppearanceExportValidationIssue | null {
  for (const state of APPEARANCE_EXPORT_STATES) {
    const seen = new Set<AppearanceExportState>();
    let current: AppearanceExportState | null = state;
    while (current !== null) {
      if (seen.has(current)) return fail('identity-cycle', `${path}.${state}.inheritedFrom`, 'State inheritance identities form a cycle.');
      seen.add(current);
      current = (states[current] as UnknownRecord).inheritedFrom as AppearanceExportState | null;
    }
  }
  return null;
}

function validateAppearance(value: unknown, path: string, expectedTargetId: string, context: ValidationContext): AppearanceExportValidationIssue | null {
  const shape = exactKeys(value, APPEARANCE_KEYS, path);
  if (shape) return shape;
  const record = value as UnknownRecord;
  const entered = enter(record, context.maxDepth + 1, path, context);
  if (entered) return entered;
  try {
    const entry = countEntry(path, context);
    if (entry) return entry;
    const targetIssue = identity(record.targetId, `${path}.targetId`);
    if (targetIssue) return targetIssue;
    if (record.targetId !== expectedTargetId) return fail('identity-cycle', `${path}.targetId`, 'Export target identity does not match its appearance identity.');
    const statesShape = exactKeys(record.states, APPEARANCE_EXPORT_STATES, `${path}.states`);
    if (statesShape) return statesShape;
    const states = record.states as UnknownRecord;
    for (const state of APPEARANCE_EXPORT_STATES) {
      const issue = validateStyle(states[state], `${path}.states.${state}`, context);
      if (issue) return issue;
    }
    for (const state of APPEARANCE_EXPORT_STATES) {
      const issue = validateParentGraph(states[state] as UnknownRecord, `${path}.states.${state}`);
      if (issue) return issue;
      const refIssue = validateIdentityReferences(states[state] as UnknownRecord, `${path}.states.${state}`);
      if (refIssue) return refIssue;
    }
    const inheritance = validateInheritance(states, `${path}.states`);
    if (inheritance) return inheritance;
    return [
      enumValue(record.activeState, APPEARANCE_EXPORT_STATES, `${path}.activeState`),
      boundedNumber(record.zoom, `${path}.zoom`, 0.25, 4), boolean(record.rulers, `${path}.rulers`),
      boolean(record.guides, `${path}.guides`), boundedString(record.updatedAt, `${path}.updatedAt`, 128),
    ].find((issue) => issue !== null) ?? null;
  } finally {
    leave(record, context);
  }
}

function serializedBytes(value: unknown): number | AppearanceExportValidationIssue {
  try {
    const text = JSON.stringify(value);
    if (text === undefined) return fail('wrong-type', '$', 'Appearance export must be JSON-serializable.');
    const bytes = utf8Bytes(text);
    return bytes > APPEARANCE_EXPORT_LIMITS.maxSerializedBytes
      ? fail('serialized-bytes-exceeded', '$', `Serialized export exceeds ${APPEARANCE_EXPORT_LIMITS.maxSerializedBytes} UTF-8 bytes.`)
      : bytes;
  } catch {
    return fail('cycle-detected', '$', 'Appearance export is not JSON-serializable.');
  }
}

function validateObject(value: unknown): AppearanceExportValidationResult {
  const shape = exactKeys(value, EXPORT_KEYS, '$');
  if (shape) return { ok: false, issue: shape };
  const graphIssue = preflightGraph(value, '$', 0, new WeakSet<object>(), { entries: 0 });
  if (graphIssue) return { ok: false, issue: graphIssue };
  const record = value as UnknownRecord;
  const context: ValidationContext = { entries: 0, activeDepth: 0, maxDepth: 0, ancestors: new WeakSet<object>() };
  const entered = enter(record, 0, '$', context);
  if (entered) return { ok: false, issue: entered };
  try {
    const entry = countEntry('$', context);
    if (entry) return { ok: false, issue: entry };
    if (record.schema !== APPEARANCE_EXPORT_SCHEMA) return { ok: false, issue: fail('invalid-schema', '$.schema', `Schema must be ${APPEARANCE_EXPORT_SCHEMA}.`) };
    if (record.version !== APPEARANCE_EXPORT_VERSION) return { ok: false, issue: fail('invalid-version', '$.version', `Version must be ${APPEARANCE_EXPORT_VERSION}.`) };
    const targetIssue = identity(record.targetId, '$.targetId');
    if (targetIssue) return { ok: false, issue: targetIssue };
    const appearanceIssue = validateAppearance(record.appearance, '$.appearance', record.targetId as string, context);
    if (appearanceIssue) return { ok: false, issue: appearanceIssue };
    const size = serializedBytes(value);
    if (typeof size !== 'number') return { ok: false, issue: size };
    return {
      ok: true,
      value: value as AppearanceExportDocument,
      stats: { serializedBytes: size, maxDepth: context.maxDepth, entries: context.entries },
    };
  } finally {
    leave(record, context);
  }
}

export function validateAppearanceExport(value: unknown): AppearanceExportValidationResult {
  return typeof value === 'string' ? parseAppearanceExportJson(value) : validateObject(value);
}

class DuplicateAwareJsonScanner {
  private index = 0;
  private duplicatePath: string | null = null;

  constructor(private readonly text: string) {}

  scan(): string | null {
    try {
      this.skipWhitespace();
      this.parseValue('$');
      this.skipWhitespace();
      if (this.index !== this.text.length) throw new Error('trailing JSON');
      return this.duplicatePath;
    } catch {
      return this.duplicatePath ?? '';
    }
  }

  private skipWhitespace(): void {
    while (this.index < this.text.length && /\s/u.test(this.text[this.index] ?? '')) this.index += 1;
  }

  private parseValue(path: string): void {
    this.skipWhitespace();
    const char = this.text[this.index];
    if (char === '{') return this.parseObject(path);
    if (char === '[') return this.parseArray(path);
    if (char === '"') { this.parseString(); return; }
    if (char === 't' && this.text.slice(this.index, this.index + 4) === 'true') { this.index += 4; return; }
    if (char === 'f' && this.text.slice(this.index, this.index + 5) === 'false') { this.index += 5; return; }
    if (char === 'n' && this.text.slice(this.index, this.index + 4) === 'null') { this.index += 4; return; }
    if (char !== undefined && '-0123456789'.includes(char)) {
      while (this.index < this.text.length && '0123456789+-.eE'.includes(this.text[this.index] ?? '')) this.index += 1;
      return;
    }
    throw new Error(`invalid JSON value at ${path}`);
  }

  private parseObject(path: string): void {
    this.index += 1;
    this.skipWhitespace();
    const keys = new Set<string>();
    if (this.text[this.index] === '}') { this.index += 1; return; }
    while (this.index < this.text.length) {
      this.skipWhitespace();
      if (this.text[this.index] !== '"') throw new Error('object key is not a string');
      const key = this.parseString();
      if (keys.has(key) && this.duplicatePath === null) this.duplicatePath = `${path}.${key}`;
      keys.add(key);
      this.skipWhitespace();
      if (this.text[this.index] !== ':') throw new Error('object key has no colon');
      this.index += 1;
      this.parseValue(`${path}.${key}`);
      this.skipWhitespace();
      if (this.text[this.index] === '}') { this.index += 1; return; }
      if (this.text[this.index] !== ',') throw new Error('object has no comma');
      this.index += 1;
    }
    throw new Error('unterminated object');
  }

  private parseArray(path: string): void {
    this.index += 1;
    this.skipWhitespace();
    if (this.text[this.index] === ']') { this.index += 1; return; }
    let index = 0;
    while (this.index < this.text.length) {
      this.parseValue(`${path}[${index}]`);
      index += 1;
      this.skipWhitespace();
      if (this.text[this.index] === ']') { this.index += 1; return; }
      if (this.text[this.index] !== ',') throw new Error('array has no comma');
      this.index += 1;
    }
    throw new Error('unterminated array');
  }

  private parseString(): string {
    const start = this.index;
    this.index += 1;
    while (this.index < this.text.length) {
      const char = this.text[this.index];
      if (char === '"') {
        this.index += 1;
        return JSON.parse(this.text.slice(start, this.index)) as string;
      }
      if (char === '\\') this.index += 1;
      this.index += 1;
    }
    throw new Error('unterminated string');
  }
}

export function parseAppearanceExportJson(text: string): AppearanceExportValidationResult {
  if (typeof text !== 'string') return { ok: false, issue: fail('wrong-type', '$', 'JSON input must be a string.') };
  const bytes = utf8Bytes(text);
  if (bytes > APPEARANCE_EXPORT_LIMITS.maxSerializedBytes) {
    return { ok: false, issue: fail('serialized-bytes-exceeded', '$', `Serialized export exceeds ${APPEARANCE_EXPORT_LIMITS.maxSerializedBytes} UTF-8 bytes.`) };
  }
  const duplicate = new DuplicateAwareJsonScanner(text).scan();
  if (duplicate) {
    return { ok: false, issue: fail(duplicate === '' ? 'invalid-json' : 'duplicate-key', duplicate || '$', duplicate === '' ? 'Input is not valid JSON.' : `Duplicate object key at ${duplicate}.`) };
  }
  try {
    return validateObject(JSON.parse(text) as unknown);
  } catch {
    return { ok: false, issue: fail('invalid-json', '$', 'Input is not valid JSON.') };
  }
}

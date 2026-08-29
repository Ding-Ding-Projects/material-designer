/**
 * Strict boundary for persisted per-element appearance state.
 *
 * This module is intentionally independent from the renderer and the
 * appearance preference store. It validates imported or restored state before
 * any consumer can interpret a target, property, state, or value. The nested
 * arrays keep the three identity scopes explicit: target ids are unique at the
 * document level, property ids within a target, and state ids within a
 * property.
 *
 * JSON parsed by the platform has already discarded duplicate object keys.
 * `parseAppearanceStateJson` therefore runs a small syntax-aware scan first,
 * so duplicate keys are rejected while the parser can still observe them.
 */

export const APPEARANCE_STATE_SCHEMA_VERSION = 1 as const;

export const APPEARANCE_STATE_LIMITS = Object.freeze({
  maxSerializedBytes: 64 * 1024,
  maxDepth: 8,
  maxEntries: 512,
  maxIdentityBytes: 96,
  maxStringBytes: 1024,
  maxArrayEntries: 128,
  maxObjectEntries: 128,
  maxNumberMagnitude: 1_000_000,
} as const);

export type AppearanceStatePrimitive = null | boolean | number | string;

export interface AppearanceStateRecord {
  readonly [key: string]: AppearanceStateValue;
}

export type AppearanceStateValue =
  | AppearanceStatePrimitive
  | readonly AppearanceStateValue[]
  | AppearanceStateRecord;

export interface AppearanceStateEntry {
  readonly stateId: string;
  readonly value: AppearanceStateValue;
}

export interface AppearancePropertyEntry {
  readonly propertyId: string;
  readonly states: readonly AppearanceStateEntry[];
}

export interface AppearanceTargetEntry {
  readonly targetId: string;
  readonly properties: readonly AppearancePropertyEntry[];
}

export interface AppearanceStateDocument {
  readonly version: typeof APPEARANCE_STATE_SCHEMA_VERSION;
  readonly targets: readonly AppearanceTargetEntry[];
}

export type AppearanceStateValidationCode =
  | 'not-object'
  | 'unknown-key'
  | 'missing-key'
  | 'wrong-type'
  | 'invalid-version'
  | 'invalid-identity'
  | 'duplicate-identity'
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

export interface AppearanceStateValidationIssue {
  readonly code: AppearanceStateValidationCode;
  readonly path: string;
  readonly message: string;
}

export interface AppearanceStateValidationStats {
  readonly serializedBytes: number;
  readonly maxDepth: number;
  readonly entries: number;
}

export type AppearanceStateValidationResult =
  | {
      readonly ok: true;
      readonly value: AppearanceStateDocument;
      readonly stats: AppearanceStateValidationStats;
    }
  | {
      readonly ok: false;
      readonly issue: AppearanceStateValidationIssue;
    };

const ROOT_KEYS = ['version', 'targets'] as const;
const TARGET_KEYS = ['targetId', 'properties'] as const;
const PROPERTY_KEYS = ['propertyId', 'states'] as const;
const STATE_KEYS = ['stateId', 'value'] as const;

const STABLE_ID_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const VALUE_KEY_PATTERN = /^(?:[a-zA-Z_][a-zA-Z0-9_.-]*|--[a-zA-Z0-9_.-]+)$/;
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

type UnknownRecord = Record<string, unknown>;

interface ValidationContext {
  entries: number;
  maxDepth: number;
  ancestors: WeakSet<object>;
}

function isPlainRecord(value: unknown): value is UnknownRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function issue(
  code: AppearanceStateValidationCode,
  path: string,
  message: string,
): AppearanceStateValidationResult {
  return { ok: false, issue: { code, path, message } };
}

function fail(
  code: AppearanceStateValidationCode,
  path: string,
  message: string,
): AppearanceStateValidationIssue {
  return { code, path, message };
}

function hasOwn(record: UnknownRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function assertExactKeys(
  value: unknown,
  allowed: readonly string[],
  path: string,
): AppearanceStateValidationIssue | null {
  if (!isPlainRecord(value)) {
    return fail('not-object', path, 'Expected a plain object.');
  }
  const actual = Object.keys(value);
  for (const key of actual) {
    if (!allowed.includes(key)) {
      return fail('unknown-key', `${path}.${key}`, `Unknown key "${key}".`);
    }
  }
  for (const key of allowed) {
    if (!hasOwn(value, key)) {
      return fail('missing-key', `${path}.${key}`, `Missing required key "${key}".`);
    }
  }
  return null;
}

function bumpEntry(context: ValidationContext, path: string): AppearanceStateValidationIssue | null {
  context.entries += 1;
  if (context.entries > APPEARANCE_STATE_LIMITS.maxEntries) {
    return fail(
      'max-entries-exceeded',
      path,
      `Entry count exceeds ${APPEARANCE_STATE_LIMITS.maxEntries}.`,
    );
  }
  return null;
}

function enterObject(
  value: object,
  depth: number,
  path: string,
  context: ValidationContext,
): AppearanceStateValidationIssue | null {
  if (depth > APPEARANCE_STATE_LIMITS.maxDepth) {
    return fail(
      'max-depth-exceeded',
      path,
      `Nesting depth exceeds ${APPEARANCE_STATE_LIMITS.maxDepth}.`,
    );
  }
  if (context.ancestors.has(value)) {
    return fail('cycle-detected', path, 'Cyclic appearance state is not serializable.');
  }
  context.ancestors.add(value);
  context.maxDepth = Math.max(context.maxDepth, depth);
  return null;
}

function leaveObject(value: object, context: ValidationContext): void {
  context.ancestors.delete(value);
}

function validateIdentity(
  value: unknown,
  path: string,
): AppearanceStateValidationIssue | null {
  if (typeof value !== 'string') {
    return fail('wrong-type', path, 'Identity must be a string.');
  }
  const bytes = utf8Bytes(value);
  if (bytes === 0 || bytes > APPEARANCE_STATE_LIMITS.maxIdentityBytes) {
    return fail(
      'string-out-of-bounds',
      path,
      `Identity must be 1-${APPEARANCE_STATE_LIMITS.maxIdentityBytes} UTF-8 bytes.`,
    );
  }
  if (!STABLE_ID_PATTERN.test(value)) {
    return fail(
      'invalid-identity',
      path,
      'Identity must use lowercase ASCII words separated by ., _, or -.',
    );
  }
  return null;
}

function validateValue(
  value: unknown,
  path: string,
  depth: number,
  context: ValidationContext,
): AppearanceStateValidationIssue | null {
  const entryIssue = bumpEntry(context, path);
  if (entryIssue) return entryIssue;

  if (value === null || typeof value === 'boolean') return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return fail('non-finite-number', path, 'Numbers must be finite.');
    }
    if (Math.abs(value) > APPEARANCE_STATE_LIMITS.maxNumberMagnitude) {
      return fail(
        'number-out-of-bounds',
        path,
        `Number magnitude exceeds ${APPEARANCE_STATE_LIMITS.maxNumberMagnitude}.`,
      );
    }
    return null;
  }
  if (typeof value === 'string') {
    if (utf8Bytes(value) > APPEARANCE_STATE_LIMITS.maxStringBytes) {
      return fail(
        'string-out-of-bounds',
        path,
        `String exceeds ${APPEARANCE_STATE_LIMITS.maxStringBytes} UTF-8 bytes.`,
      );
    }
    return null;
  }
  if (typeof value !== 'object') {
    return fail('wrong-type', path, 'Value must be JSON data.');
  }

  const entered = enterObject(value, depth, path, context);
  if (entered) return entered;
  try {
    if (Array.isArray(value)) {
      if (value.length > APPEARANCE_STATE_LIMITS.maxArrayEntries) {
        return fail(
          'array-out-of-bounds',
          path,
          `Array length exceeds ${APPEARANCE_STATE_LIMITS.maxArrayEntries}.`,
        );
      }
      for (let index = 0; index < value.length; index += 1) {
        const childIssue = validateValue(value[index], `${path}[${index}]`, depth + 1, context);
        if (childIssue) return childIssue;
      }
      return null;
    }
    if (!isPlainRecord(value)) {
      return fail('wrong-type', path, 'Value objects must be plain JSON objects.');
    }
    const keys = Object.keys(value);
    if (keys.length > APPEARANCE_STATE_LIMITS.maxObjectEntries) {
      return fail(
        'object-out-of-bounds',
        path,
        `Object key count exceeds ${APPEARANCE_STATE_LIMITS.maxObjectEntries}.`,
      );
    }
    for (const key of keys) {
      if (
        UNSAFE_KEYS.has(key) ||
        utf8Bytes(key) > APPEARANCE_STATE_LIMITS.maxStringBytes ||
        !VALUE_KEY_PATTERN.test(key)
      ) {
        return fail('unsafe-key', `${path}.${key}`, `Value key "${key}" is not safe.`);
      }
      const childIssue = validateValue(value[key], `${path}.${key}`, depth + 1, context);
      if (childIssue) return childIssue;
    }
    return null;
  } finally {
    leaveObject(value, context);
  }
}

function validateState(
  value: unknown,
  path: string,
  depth: number,
  context: ValidationContext,
): AppearanceStateValidationIssue | null {
  const shapeIssue = assertExactKeys(value, STATE_KEYS, path);
  if (shapeIssue) return shapeIssue;
  const record = value as UnknownRecord;
  const entered = enterObject(record, depth, path, context);
  if (entered) return entered;
  try {
    const entryIssue = bumpEntry(context, path);
    if (entryIssue) return entryIssue;
    const identityIssue = validateIdentity(record.stateId, `${path}.stateId`);
    if (identityIssue) return identityIssue;
    return validateValue(record.value, `${path}.value`, depth + 1, context);
  } finally {
    leaveObject(record, context);
  }
}

function validateProperty(
  value: unknown,
  path: string,
  depth: number,
  context: ValidationContext,
): AppearanceStateValidationIssue | null {
  const shapeIssue = assertExactKeys(value, PROPERTY_KEYS, path);
  if (shapeIssue) return shapeIssue;
  const record = value as UnknownRecord;
  const entered = enterObject(record, depth, path, context);
  if (entered) return entered;
  try {
    const entryIssue = bumpEntry(context, path);
    if (entryIssue) return entryIssue;
    const identityIssue = validateIdentity(record.propertyId, `${path}.propertyId`);
    if (identityIssue) return identityIssue;
    if (!Array.isArray(record.states) || record.states.length === 0) {
      return fail('wrong-type', `${path}.states`, 'States must be a non-empty array.');
    }
    if (record.states.length > APPEARANCE_STATE_LIMITS.maxArrayEntries) {
      return fail(
        'array-out-of-bounds',
        `${path}.states`,
        `Array length exceeds ${APPEARANCE_STATE_LIMITS.maxArrayEntries}.`,
      );
    }
    const stateIds = new Set<string>();
    for (let index = 0; index < record.states.length; index += 1) {
      const state = record.states[index];
      const statePath = `${path}.states[${index}]`;
      const stateIssue = validateState(state, statePath, depth + 1, context);
      if (stateIssue) return stateIssue;
      const stateId = (state as UnknownRecord).stateId;
      if (stateIds.has(stateId as string)) {
        return fail('duplicate-identity', `${statePath}.stateId`, `Duplicate state id "${stateId}".`);
      }
      stateIds.add(stateId as string);
    }
    return null;
  } finally {
    leaveObject(record, context);
  }
}

function validateTarget(
  value: unknown,
  path: string,
  depth: number,
  context: ValidationContext,
): AppearanceStateValidationIssue | null {
  const shapeIssue = assertExactKeys(value, TARGET_KEYS, path);
  if (shapeIssue) return shapeIssue;
  const record = value as UnknownRecord;
  const entered = enterObject(record, depth, path, context);
  if (entered) return entered;
  try {
    const entryIssue = bumpEntry(context, path);
    if (entryIssue) return entryIssue;
    const identityIssue = validateIdentity(record.targetId, `${path}.targetId`);
    if (identityIssue) return identityIssue;
    if (!Array.isArray(record.properties) || record.properties.length === 0) {
      return fail('wrong-type', `${path}.properties`, 'Properties must be a non-empty array.');
    }
    if (record.properties.length > APPEARANCE_STATE_LIMITS.maxArrayEntries) {
      return fail(
        'array-out-of-bounds',
        `${path}.properties`,
        `Array length exceeds ${APPEARANCE_STATE_LIMITS.maxArrayEntries}.`,
      );
    }
    const propertyIds = new Set<string>();
    for (let index = 0; index < record.properties.length; index += 1) {
      const property = record.properties[index];
      const propertyPath = `${path}.properties[${index}]`;
      const propertyIssue = validateProperty(property, propertyPath, depth + 1, context);
      if (propertyIssue) return propertyIssue;
      const propertyId = (property as UnknownRecord).propertyId;
      if (propertyIds.has(propertyId as string)) {
        return fail(
          'duplicate-identity',
          `${propertyPath}.propertyId`,
          `Duplicate property id "${propertyId}".`,
        );
      }
      propertyIds.add(propertyId as string);
    }
    return null;
  } finally {
    leaveObject(record, context);
  }
}

function validateDocument(value: unknown):
  | { readonly ok: true; readonly value: AppearanceStateDocument; readonly context: ValidationContext }
  | { readonly ok: false; readonly issue: AppearanceStateValidationIssue } {
  const shapeIssue = assertExactKeys(value, ROOT_KEYS, '$');
  if (shapeIssue) return { ok: false, issue: shapeIssue };
  const record = value as UnknownRecord;
  const context: ValidationContext = { entries: 0, maxDepth: 0, ancestors: new WeakSet() };
  const entered = enterObject(record, 0, '$', context);
  if (entered) return { ok: false, issue: entered };
  try {
    const entryIssue = bumpEntry(context, '$');
    if (entryIssue) return { ok: false, issue: entryIssue };
    if (record.version !== APPEARANCE_STATE_SCHEMA_VERSION) {
      return {
        ok: false,
        issue: fail(
          'invalid-version',
          '$.version',
          `Version must be ${APPEARANCE_STATE_SCHEMA_VERSION}.`,
        ),
      };
    }
    if (!Array.isArray(record.targets) || record.targets.length === 0) {
      return { ok: false, issue: fail('wrong-type', '$.targets', 'Targets must be a non-empty array.') };
    }
    if (record.targets.length > APPEARANCE_STATE_LIMITS.maxArrayEntries) {
      return {
        ok: false,
        issue: fail(
          'array-out-of-bounds',
          '$.targets',
          `Array length exceeds ${APPEARANCE_STATE_LIMITS.maxArrayEntries}.`,
        ),
      };
    }
    const targetIds = new Set<string>();
    for (let index = 0; index < record.targets.length; index += 1) {
      const target = record.targets[index];
      const targetPath = `$.targets[${index}]`;
      const targetIssue = validateTarget(target, targetPath, 1, context);
      if (targetIssue) return { ok: false, issue: targetIssue };
      const targetId = (target as UnknownRecord).targetId;
      if (targetIds.has(targetId as string)) {
        return {
          ok: false,
          issue: fail('duplicate-identity', `${targetPath}.targetId`, `Duplicate target id "${targetId}".`),
        };
      }
      targetIds.add(targetId as string);
    }
    return { ok: true, value: value as AppearanceStateDocument, context };
  } finally {
    leaveObject(record, context);
  }
}

function validationStats(
  context: ValidationContext,
  serializedBytes: number,
): AppearanceStateValidationStats {
  return {
    serializedBytes,
    maxDepth: context.maxDepth,
    entries: context.entries,
  };
}

function serializedBytesFor(value: unknown): number | AppearanceStateValidationIssue {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) {
      return fail('wrong-type', '$', 'Appearance state must be JSON-serializable.');
    }
    const bytes = utf8Bytes(serialized);
    if (bytes > APPEARANCE_STATE_LIMITS.maxSerializedBytes) {
      return fail(
        'serialized-bytes-exceeded',
        '$',
        `Serialized state exceeds ${APPEARANCE_STATE_LIMITS.maxSerializedBytes} UTF-8 bytes.`,
      );
    }
    return bytes;
  } catch {
    return fail('cycle-detected', '$', 'Appearance state is not JSON-serializable.');
  }
}

export function isStableAppearanceIdentity(value: unknown): value is string {
  return validateIdentity(value, '$') === null;
}

export function validateAppearanceState(value: unknown): AppearanceStateValidationResult {
  if (typeof value === 'string') return parseAppearanceStateJson(value);
  const validated = validateDocument(value);
  if (!validated.ok) return { ok: false, issue: validated.issue };
  const serializedBytes = serializedBytesFor(value);
  if (typeof serializedBytes !== 'number') return { ok: false, issue: serializedBytes };
  return {
    ok: true,
    value: validated.value,
    stats: validationStats(validated.context, serializedBytes),
  };
}

class DuplicateAwareJsonScanner {
  private index = 0;
  private duplicateKey: string | null = null;

  constructor(private readonly text: string) {}

  scan(): string | null {
    try {
      this.skipWhitespace();
      this.parseValue('$');
      this.skipWhitespace();
      if (this.index !== this.text.length) throw new Error('trailing JSON');
      return this.duplicateKey;
    } catch {
      return this.duplicateKey ?? '';
    }
  }

  private skipWhitespace(): void {
    while (this.index < this.text.length && /\s/.test(this.text[this.index] ?? '')) this.index += 1;
  }

  private parseValue(path: string): void {
    this.skipWhitespace();
    const char = this.text[this.index];
    if (char === '{') return this.parseObject(path);
    if (char === '[') return this.parseArray(path);
    if (char === '"') {
      this.parseString();
      return;
    }
    if (char === 't' && this.text.slice(this.index, this.index + 4) === 'true') {
      this.index += 4;
      return;
    }
    if (char === 'f' && this.text.slice(this.index, this.index + 5) === 'false') {
      this.index += 5;
      return;
    }
    if (char === 'n' && this.text.slice(this.index, this.index + 4) === 'null') {
      this.index += 4;
      return;
    }
    if (char !== undefined && '-0123456789'.includes(char)) {
      while (this.index < this.text.length && '0123456789+-.eE'.includes(this.text[this.index] ?? '')) {
        this.index += 1;
      }
      return;
    }
    throw new Error(`invalid JSON value at ${path}`);
  }

  private parseObject(path: string): void {
    this.index += 1;
    this.skipWhitespace();
    const keys = new Set<string>();
    if (this.text[this.index] === '}') {
      this.index += 1;
      return;
    }
    while (this.index < this.text.length) {
      this.skipWhitespace();
      if (this.text[this.index] !== '"') throw new Error('object key is not a string');
      const key = this.parseString();
      if (keys.has(key) && this.duplicateKey === null) this.duplicateKey = `${path}.${key}`;
      keys.add(key);
      this.skipWhitespace();
      if (this.text[this.index] !== ':') throw new Error('object key has no colon');
      this.index += 1;
      this.parseValue(`${path}.${key}`);
      this.skipWhitespace();
      if (this.text[this.index] === '}') {
        this.index += 1;
        return;
      }
      if (this.text[this.index] !== ',') throw new Error('object has no comma');
      this.index += 1;
    }
    throw new Error('unterminated object');
  }

  private parseArray(path: string): void {
    this.index += 1;
    this.skipWhitespace();
    if (this.text[this.index] === ']') {
      this.index += 1;
      return;
    }
    let index = 0;
    while (this.index < this.text.length) {
      this.parseValue(`${path}[${index}]`);
      index += 1;
      this.skipWhitespace();
      if (this.text[this.index] === ']') {
        this.index += 1;
        return;
      }
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

export function parseAppearanceStateJson(json: string): AppearanceStateValidationResult {
  if (typeof json !== 'string') return issue('wrong-type', '$', 'JSON input must be a string.');
  const serializedBytes = utf8Bytes(json);
  if (serializedBytes > APPEARANCE_STATE_LIMITS.maxSerializedBytes) {
    return issue(
      'serialized-bytes-exceeded',
      '$',
      `Serialized state exceeds ${APPEARANCE_STATE_LIMITS.maxSerializedBytes} UTF-8 bytes.`,
    );
  }
  const duplicateKey = new DuplicateAwareJsonScanner(json).scan();
  if (duplicateKey) {
    if (duplicateKey === '') return issue('invalid-json', '$', 'Input is not valid JSON.');
    return issue('duplicate-key', duplicateKey, `Duplicate object key at ${duplicateKey}.`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch {
    return issue('invalid-json', '$', 'Input is not valid JSON.');
  }
  const result = validateDocument(parsed);
  if (!result.ok) return { ok: false, issue: result.issue };
  return {
    ok: true,
    value: result.value,
    stats: validationStats(result.context, serializedBytes),
  };
}

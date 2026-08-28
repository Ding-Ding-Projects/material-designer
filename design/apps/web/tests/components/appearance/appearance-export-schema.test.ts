import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  APPEARANCE_EXPORT_LIMITS,
  APPEARANCE_EXPORT_SCHEMA,
  APPEARANCE_EXPORT_VERSION,
  APPEARANCE_EXPORT_STATES,
  parseAppearanceExportJson,
  validateAppearanceExport,
} from '../../../src/components/appearance/appearanceExportSchema';

type AnyRecord = Record<string, any>;

const BASE_STYLE: AnyRecord = {
  layers: [{
    id: 'base', name: 'Base', kind: 'shape', visible: true, locked: false, opacity: 1,
    blendMode: 'normal', parentId: null, fill: 'transparent', stroke: 'transparent', shadow: 'none',
    transform: { x: 0, y: 0, width: 100, height: 100, rotation: 0, skewX: 0, skewY: 0, originX: 50, originY: 50, warp: 0, perspective: 0 },
    effects: [], effectStack: [], clipping: false, vectorMask: null, adjustmentRef: null,
    smartObjectRef: null, selectionRefs: [],
  }],
  selections: [],
  channels: ['composite'],
  masks: [],
  channelState: [{ id: 'composite', name: 'Composite', visible: true, opacity: 1, blendMode: 'normal' }],
  maskState: [],
  adjustments: [],
  smartObjects: [],
  fontFamily: 'system-ui', fontSize: 14, fontWeight: 400, bold: false, italic: false, oblique: false,
  underline: 'none', underlineColor: 'currentColor', strike: 'none', overline: false,
  capitalization: 'none', smallCaps: false, superscript: false, subscript: false,
  textColor: 'var(--md-sys-color-on-surface)', highlightColor: 'transparent', outlineColor: 'transparent',
  outlineWidth: 0, textShadow: 'none', textGlow: 'none', letterSpacing: 0, wordSpacing: 0,
  lineHeight: 1.5, baselineOffset: 0, textDirection: 'auto', alignment: 'start', borderRadius: 12,
  elevation: 0, motion: 'default', rainbowSpeedLevel: 3, inheritedFrom: null, overrides: {},
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function makeExport(): AnyRecord {
  const states = Object.fromEntries(APPEARANCE_EXPORT_STATES.map((state) => [state, clone(BASE_STYLE)]));
  return {
    schema: APPEARANCE_EXPORT_SCHEMA,
    version: APPEARANCE_EXPORT_VERSION,
    targetId: 'button.primary',
    appearance: {
      targetId: 'button.primary', states, activeState: 'normal', zoom: 1,
      rulers: true, guides: true, updatedAt: '2026-08-28T00:00:00.000Z',
    },
  };
}

function expectCode(value: unknown, code: string): void {
  const result = validateAppearanceExport(value);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.issue.code).toBe(code);
}

describe('strict appearance export schema', () => {
  it('accepts every nested object and reports bounded statistics', () => {
    const value = makeExport();
    const result = validateAppearanceExport(value);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(value);
      expect(result.stats.serializedBytes).toBeGreaterThan(0);
      expect(result.stats.serializedBytes).toBeLessThanOrEqual(APPEARANCE_EXPORT_LIMITS.maxSerializedBytes);
      expect(result.stats.maxDepth).toBeLessThanOrEqual(APPEARANCE_EXPORT_LIMITS.maxDepth);
      expect(result.stats.entries).toBeLessThanOrEqual(APPEARANCE_EXPORT_LIMITS.maxEntries);
    }
  });

  it.each([
    ['root', { ...makeExport(), unexpected: true }],
    ['appearance', { ...makeExport(), appearance: { ...makeExport().appearance, unexpected: true } }],
    ['style', (() => { const value = makeExport(); value.appearance.states.normal.unexpected = true; return value; })()],
    ['layer', (() => { const value = makeExport(); value.appearance.states.normal.layers[0].unexpected = true; return value; })()],
    ['transform', (() => { const value = makeExport(); value.appearance.states.normal.layers[0].transform.unexpected = true; return value; })()],
  ])('rejects unknown keys at the %s level', (_scope, value) => {
    expectCode(value, 'unknown-key');
  });

  it('rejects missing required nested keys instead of filling them', () => {
    const value = makeExport();
    delete value.appearance.states.normal.layers[0].transform.rotation;
    expectCode(value, 'missing-key');
  });

  it.each([
    ['schema', { ...makeExport(), schema: 'other.schema' }],
    ['version', { ...makeExport(), version: APPEARANCE_EXPORT_VERSION + 1 }],
    ['target identity', { ...makeExport(), targetId: 'other.target' }],
  ])('rejects an invalid %s', (_label, value) => {
    expectCode(value, _label === 'schema' ? 'invalid-schema' : _label === 'version' ? 'invalid-version' : 'identity-cycle');
  });

  it.each([
    ['NaN', Number.NaN, 'non-finite-number'],
    ['Infinity', Number.POSITIVE_INFINITY, 'non-finite-number'],
    ['too large', APPEARANCE_EXPORT_LIMITS.maxNumberMagnitude + 1, 'number-out-of-bounds'],
  ])('rejects %s numeric values', (_label, number, code) => {
    const value = makeExport();
    value.appearance.states.normal.zoom = number;
    expectCode(value, code);
  });

  it('measures strings in UTF-8 bytes and bounds identity separately', () => {
    const longString = makeExport();
    longString.appearance.states.normal.fontFamily = '字'.repeat(APPEARANCE_EXPORT_LIMITS.maxStringBytes);
    expectCode(longString, 'string-out-of-bounds');

    const longIdentity = makeExport();
    longIdentity.targetId = 'a'.repeat(APPEARANCE_EXPORT_LIMITS.maxIdentityBytes + 1);
    expectCode(longIdentity, 'invalid-identity');
  });

  it('rejects excessive recursive depth and total entries', () => {
    const deep = makeExport();
    let nested: AnyRecord = {};
    deep.appearance.states.normal.overrides.deep = nested;
    for (let index = 0; index < APPEARANCE_EXPORT_LIMITS.maxDepth + 2; index += 1) {
      nested.next = {};
      nested = nested.next;
    }
    expectCode(deep, 'max-depth-exceeded');

    const many = makeExport();
    const layer = many.appearance.states.normal.layers[0];
    for (const state of APPEARANCE_EXPORT_STATES) {
      many.appearance.states[state].layers = Array.from(
        { length: APPEARANCE_EXPORT_LIMITS.maxLayers },
        (_, index) => ({ ...clone(layer), id: `layer-${index}` }),
      );
    }
    expectCode(many, 'max-entries-exceeded');
  });

  it('rejects cycles before an importer can traverse them', () => {
    const value = makeExport();
    const loop: AnyRecord = {};
    loop.self = loop;
    value.appearance.states.normal.overrides.loop = loop;
    expectCode(value, 'cycle-detected');
  });

  it('rejects layer parent cycles and missing identity references', () => {
    const parentCycle = makeExport();
    const normal = parentCycle.appearance.states.normal;
    normal.layers = [
      { ...clone(normal.layers[0]), id: 'one', parentId: 'two' },
      { ...clone(normal.layers[0]), id: 'two', parentId: 'one' },
    ];
    expectCode(parentCycle, 'parent-cycle');

    const missingReference = makeExport();
    missingReference.appearance.states.normal.layers[0].selectionRefs = ['selection.missing'];
    expectCode(missingReference, 'missing-reference');
  });

  it('rejects inheritance identity cycles and mismatched ordered identities', () => {
    const inheritedCycle = makeExport();
    inheritedCycle.appearance.states.normal.inheritedFrom = 'hover';
    inheritedCycle.appearance.states.hover.inheritedFrom = 'normal';
    expectCode(inheritedCycle, 'identity-cycle');

    const channelMismatch = makeExport();
    channelMismatch.appearance.states.normal.channels = ['wrong'];
    expectCode(channelMismatch, 'identity-cycle');
  });

  it('rejects duplicate object keys and oversized serialized input', () => {
    const duplicate = parseAppearanceExportJson('{"schema":"a","schema":"b"}');
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.issue.code).toBe('duplicate-key');

    const oversized = parseAppearanceExportJson(
      `${JSON.stringify(makeExport())}${' '.repeat(APPEARANCE_EXPORT_LIMITS.maxSerializedBytes)}`,
    );
    expect(oversized.ok).toBe(false);
    if (!oversized.ok) expect(oversized.issue.code).toBe('serialized-bytes-exceeded');
  });
});

describe('strict appearance export source mutation list', () => {
  const source = readFileSync(
    new URL('../../../src/components/appearance/appearanceExportSchema.ts', import.meta.url),
    'utf8',
  );

  const boundaries = [
    ['exact export keys', "const EXPORT_KEYS = ['schema', 'version', 'targetId', 'appearance'] as const;"],
    ['exact style keys', 'const STYLE_KEYS = ['],
    ['finite numeric check', "if (!Number.isFinite(value)) return fail('non-finite-number', path, 'Number must be finite.');"],
    ['UTF-8 string bounds', 'const bytes = utf8Bytes(value);'],
    ['recursive graph preflight', 'function preflightGraph('],
    ['cycle detection', 'if (ancestors.has(value)) {'],
    ['parent cycle detection', 'function validateParentGraph('],
    ['identity reference checks', 'function validateIdentityReferences('],
    ['inheritance cycle detection', 'function validateInheritance('],
    ['duplicate key scan', 'const duplicate = new DuplicateAwareJsonScanner(text).scan();'],
  ] as const;

  it.each(boundaries)('keeps the exact %s boundary', (_label, needle) => {
    expect(source).toContain(needle);
  });

  it.each(boundaries)('turns red when the %s boundary is removed, then restores green', (_label, needle) => {
    const broken = source.replace(needle, '');
    expect(broken).not.toContain(needle);
    expect(source).toContain(needle);
  });
});


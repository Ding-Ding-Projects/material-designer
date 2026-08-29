import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  APPEARANCE_STATE_LIMITS,
  APPEARANCE_STATE_SCHEMA_VERSION,
  parseAppearanceStateJson,
  validateAppearanceState,
  type AppearanceStateDocument,
} from '../../../src/components/appearance/appearanceStateSchema';

const VALID_STATE: AppearanceStateDocument = {
  version: APPEARANCE_STATE_SCHEMA_VERSION,
  targets: [
    {
      targetId: 'button.primary',
      properties: [
        {
          propertyId: 'background-color',
          states: [
            { stateId: 'normal', value: '#6750a4' },
            { stateId: 'hover', value: { color: '#7f67be', alpha: 0.92 } },
          ],
        },
      ],
    },
  ],
};

type MutableState = {
  version: number;
  targets: Array<{
    targetId: string;
    properties: Array<{
      propertyId: string;
      states: Array<{ stateId: string; value: unknown }>;
    }>;
  }>;
};

function mutableCloneState(): MutableState {
  return JSON.parse(JSON.stringify(VALID_STATE)) as MutableState;
}

function expectCode(value: unknown, code: string): void {
  const result = validateAppearanceState(value);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.issue.code).toBe(code);
}

describe('appearance state schema', () => {
  it('accepts a complete nested state and reports bounded stats', () => {
    const result = validateAppearanceState(VALID_STATE);
    expect(result).toMatchObject({ ok: true });
    if (result.ok) {
      expect(result.value).toBe(VALID_STATE);
      expect(result.stats.serializedBytes).toBeGreaterThan(0);
      expect(result.stats.maxDepth).toBeLessThanOrEqual(APPEARANCE_STATE_LIMITS.maxDepth);
      expect(result.stats.entries).toBeLessThanOrEqual(APPEARANCE_STATE_LIMITS.maxEntries);
    }
  });

  it.each([
    ['root', { ...VALID_STATE, unexpected: true }],
    ['target', { ...VALID_STATE, targets: [{ ...VALID_STATE.targets[0]!, unexpected: true }] }],
    [
      'property',
      {
        ...VALID_STATE,
        targets: [
          {
            ...VALID_STATE.targets[0]!,
            properties: [{ ...VALID_STATE.targets[0]!.properties[0]!, unexpected: true }],
          },
        ],
      },
    ],
    [
      'state',
      {
        ...VALID_STATE,
        targets: [
          {
            ...VALID_STATE.targets[0]!,
            properties: [
              {
                ...VALID_STATE.targets[0]!.properties[0]!,
                states: [
                  { ...VALID_STATE.targets[0]!.properties[0]!.states[0]!, unexpected: true },
                ],
              },
            ],
          },
        ],
      },
    ],
  ])('rejects an unknown key at the %s schema level', (_scope, value) => {
    expectCode(value, 'unknown-key');
  });

  it('rejects missing required nested keys instead of filling them', () => {
    const value = mutableCloneState() as unknown as Record<string, unknown>;
    delete value.targets;
    expectCode(value, 'missing-key');
  });

  it.each([
    [
      'target',
      { ...VALID_STATE, targets: [{ ...VALID_STATE.targets[0]!, targetId: 'Button Primary' }] },
    ],
    ['property', {
      ...VALID_STATE,
      targets: [{
        ...VALID_STATE.targets[0]!,
        properties: [{ ...VALID_STATE.targets[0]!.properties[0]!, propertyId: 'Color/Fill' }],
      }],
    }],
    ['state', {
      ...VALID_STATE,
      targets: [{
        ...VALID_STATE.targets[0]!,
        properties: [{
          ...VALID_STATE.targets[0]!.properties[0]!,
          states: [{ ...VALID_STATE.targets[0]!.properties[0]!.states[0]!, stateId: 'Hover State' }],
        }],
      }],
    }],
  ])('requires stable lowercase %s identities', (_scope, value) => {
    expectCode(value, 'invalid-identity');
  });

  it('rejects duplicate target, property, and state identities in their own scopes', () => {
    const targets = mutableCloneState();
    targets.targets = [targets.targets[0], targets.targets[0]];
    expectCode(targets, 'duplicate-identity');

    const properties = mutableCloneState();
    properties.targets[0].properties = [
      properties.targets[0].properties[0],
      properties.targets[0].properties[0],
    ];
    expectCode(properties, 'duplicate-identity');

    const states = mutableCloneState();
    states.targets[0].properties[0].states = [
      states.targets[0].properties[0].states[0],
      states.targets[0].properties[0].states[0],
    ];
    expectCode(states, 'duplicate-identity');
  });

  it.each([
    ['NaN', Number.NaN, 'non-finite-number'],
    ['Infinity', Number.POSITIVE_INFINITY, 'non-finite-number'],
    ['too large', APPEARANCE_STATE_LIMITS.maxNumberMagnitude + 1, 'number-out-of-bounds'],
    ['undefined', undefined, 'wrong-type'],
    ['function', () => 'not JSON', 'wrong-type'],
    ['symbol', Symbol('not JSON'), 'wrong-type'],
    ['bigint', BigInt(1), 'wrong-type'],
  ])('rejects a %s primitive', (_label, primitive, code) => {
    const value = mutableCloneState();
    value.targets[0].properties[0].states[0] = { stateId: 'normal', value: primitive as never };
    expectCode(value, code);
  });

  it('rejects bounded strings, arrays, objects, and nesting that exceed their limits', () => {
    const longString = mutableCloneState();
    longString.targets[0].properties[0].states[0] = {
      stateId: 'normal',
      value: 'x'.repeat(APPEARANCE_STATE_LIMITS.maxStringBytes + 1),
    };
    expectCode(longString, 'string-out-of-bounds');

    const longArray = mutableCloneState();
    longArray.targets[0].properties[0].states[0] = {
      stateId: 'normal',
      value: Array.from({ length: APPEARANCE_STATE_LIMITS.maxArrayEntries + 1 }, () => true),
    };
    expectCode(longArray, 'array-out-of-bounds');

    const longObject = mutableCloneState();
    longObject.targets[0].properties[0].states[0] = {
      stateId: 'normal',
      value: Object.fromEntries(
        Array.from({ length: APPEARANCE_STATE_LIMITS.maxObjectEntries + 1 }, (_, index) => [
          `key-${index}`,
          true,
        ]),
      ),
    };
    expectCode(longObject, 'object-out-of-bounds');

    let nested: unknown = true;
    for (let depth = 0; depth <= APPEARANCE_STATE_LIMITS.maxDepth; depth += 1) nested = [nested];
    const deep = mutableCloneState();
    deep.targets[0].properties[0].states[0] = { stateId: 'normal', value: nested as never };
    expectCode(deep, 'max-depth-exceeded');
  });

  it('rejects a document whose total nested entry count exceeds the limit', () => {
    const value = mutableCloneState();
    value.targets[0].properties = Array.from({ length: 5 }, (_, propertyIndex) => ({
      propertyId: `property-${propertyIndex}`,
      states: Array.from({ length: 110 }, (_, stateIndex) => ({
        stateId: `state-${stateIndex}`,
        value: true,
      })),
    }));
    expectCode(value, 'max-entries-exceeded');
  });

  it('rejects unsafe keys in recursive values', () => {
    const unsafe: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(unsafe, '__proto__', { value: true, enumerable: true });
    const value = mutableCloneState();
    value.targets[0].properties[0].states[0] = {
      stateId: 'normal',
      value: unsafe,
    };
    expectCode(value, 'unsafe-key');
  });

  it('rejects cyclic object input before serialization can hang or throw', () => {
    const value = mutableCloneState();
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    value.targets[0] = {
      targetId: 'button.primary',
      properties: [
        {
          propertyId: 'background-color',
          states: [{ stateId: 'normal', value: cycle as never }],
        },
      ],
    };
    expectCode(value, 'cycle-detected');
  });

  it('rejects serialized input above the byte bound before parsing', () => {
    const json = `${JSON.stringify(VALID_STATE)}${' '.repeat(APPEARANCE_STATE_LIMITS.maxSerializedBytes)}`;
    const result = parseAppearanceStateJson(json);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issue.code).toBe('serialized-bytes-exceeded');
  });

  it('rejects duplicate keys while the JSON scanner can still observe them', () => {
    const json = '{"version":1,"version":1,"targets":[{"targetId":"a","properties":[]}]}';
    const result = parseAppearanceStateJson(json);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issue.code).toBe('duplicate-key');
      expect(result.issue.path).toBe('$.version');
    }
  });
});

describe('appearance state source guard', () => {
  const source = readFileSync(
    new URL('../../../src/components/appearance/appearanceStateSchema.ts', import.meta.url),
    'utf8',
  );

  // Hand-written exact boundaries. Each mutation must make the source guard
  // red, and the untouched source must immediately return green.
  const boundaries = [
    ['schema version', 'export const APPEARANCE_STATE_SCHEMA_VERSION = 1 as const;'],
    ['serialized byte bound', 'maxSerializedBytes: 64 * 1024,'],
    ['depth bound', 'maxDepth: 8,'],
    ['entry bound', 'maxEntries: 512,'],
    ['unknown-key rejection', 'const shapeIssue = assertExactKeys(value, STATE_KEYS, path);'],
    ['duplicate-key scan', 'const duplicateKey = new DuplicateAwareJsonScanner(json).scan();'],
    ['cycle detection', 'if (context.ancestors.has(value)) {'],
    ['finite number check', 'if (!Number.isFinite(value)) {'],
    ['stable identity pattern', 'const STABLE_ID_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;'],
  ] as const;

  function assertBoundary(text: string, needle: string): void {
    if (!text.includes(needle)) throw new Error(`Missing source boundary: ${needle}`);
  }

  it.each(boundaries)('keeps the exact %s boundary', (_label, needle) => {
    expect(() => assertBoundary(source, needle)).not.toThrow();
  });

  it.each(boundaries)('turns red, then green, for a %s mutation', (_label, needle) => {
    const broken = source.replace(needle, '');
    expect(broken).not.toBe(source);
    expect(() => assertBoundary(broken, needle)).toThrow();
    expect(() => assertBoundary(source, needle)).not.toThrow();
  });
});

import assert from 'node:assert/strict';
import {
  APPEARANCE_SCHEMA,
  APPEARANCE_VERSION,
  CAPABILITIES,
  LIMITS,
  RAINBOW_SENTINEL,
  applyAppearance,
  clearAppearance,
  defaultAppearanceStyle,
  emptyAppearance,
  parseAppearanceExportJson,
  validateAppearanceExport,
  validateAppearancePayload,
  validateAppearanceStyle,
} from './element-appearance.js';

function validAppearance(targetId = 'site:button.primary') {
  return emptyAppearance(targetId);
}

class FakeStyle {
  values = new Map();
  getPropertyValue(name) { return this.values.get(name)?.value || ''; }
  getPropertyPriority(name) { return this.values.get(name)?.priority || ''; }
  setProperty(name, value, priority = '') { this.values.set(name, { value: String(value), priority }); }
  removeProperty(name) { this.values.delete(name); }
}

class FakeElement {
  style = new FakeStyle();
  attributes = new Map([['dir', 'rtl']]);
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  hasAttribute(name) { return this.attributes.has(name); }
}

globalThis.localStorage = {
  values: new Map(),
  getItem(key) { return this.values.get(key) ?? null; },
  setItem(key, value) { this.values.set(key, String(value)); },
};
globalThis.document = {
  documentElement: { style: new FakeStyle() },
  dispatchEvent() { return true; },
};

const appearance = validAppearance();
const envelope = {
  schema: APPEARANCE_SCHEMA,
  version: APPEARANCE_VERSION,
  targetId: appearance.targetId,
  appearance,
};

assert.equal(validateAppearanceExport(envelope).ok, true);
assert.equal(validateAppearancePayload(appearance, appearance.targetId), true);
assert.equal(validateAppearanceStyle(defaultAppearanceStyle()), true);
assert.deepEqual({ ...LIMITS }, {
  maxSerializedBytes: 500000,
  maxDepth: 32,
  maxEntries: 10000,
  maxIdentityBytes: 128,
  maxStringBytes: 1024,
  maxCollectionEntries: 256,
  maxLayers: 256,
  maxStates: 12,
  maxNumberMagnitude: 1000000,
});
assert.equal(CAPABILITIES.find((item) => item.id === 'effects')?.supported, true);
assert.equal(CAPABILITIES.find((item) => item.id === 'motion')?.supported, true);
assert.equal(CAPABILITIES.find((item) => item.id === 'rainbow-sentinel')?.supported, true);
assert.ok(CAPABILITIES.filter((item) => !item.supported).every((item) => item.reason.length > 0));

const danglingParent = structuredClone(appearance);
danglingParent.states.normal.layers[0].parentId = 'group.missing';
assert.equal(validateAppearancePayload(danglingParent, appearance.targetId), false);
const danglingParentResult = validateAppearanceExport({ ...envelope, appearance: danglingParent });
assert.equal(danglingParentResult.ok, false);
if (!danglingParentResult.ok) assert.equal(danglingParentResult.issue.code, 'missing-reference');

const parentCycle = structuredClone(appearance);
parentCycle.states.normal.layers.push({ ...structuredClone(parentCycle.states.normal.layers[0]), id: 'group.two', kind: 'group', parentId: 'group.one' });
parentCycle.states.normal.layers[0].parentId = 'group.two';
parentCycle.states.normal.layers[0].id = 'group.one';
assert.equal(validateAppearancePayload(parentCycle, appearance.targetId), false);
const parentCycleResult = validateAppearanceExport({ ...envelope, appearance: parentCycle });
assert.equal(parentCycleResult.ok, false);
if (!parentCycleResult.ok) assert.equal(parentCycleResult.issue.code, 'parent-cycle');

const danglingEffect = structuredClone(appearance);
danglingEffect.states.normal.layers[0].effects = ['effect.missing'];
assert.equal(validateAppearancePayload(danglingEffect, appearance.targetId), false);
const danglingEffectResult = validateAppearanceExport({ ...envelope, appearance: danglingEffect });
assert.equal(danglingEffectResult.ok, false);
if (!danglingEffectResult.ok) assert.equal(danglingEffectResult.issue.code, 'missing-reference');

const invalidNumber = structuredClone(appearance);
invalidNumber.states.normal.fontSize = Number.NaN;
assert.equal(validateAppearancePayload(invalidNumber, appearance.targetId), false);
const invalidNumberResult = validateAppearanceExport({ ...envelope, appearance: invalidNumber });
assert.equal(invalidNumberResult.ok, false);
if (!invalidNumberResult.ok) assert.equal(invalidNumberResult.issue.code, 'non-finite-number');

const duplicate = parseAppearanceExportJson('{"schema":"open-design.element-appearance","schema":"other","version":1}');
assert.equal(duplicate.ok, false);
if (!duplicate.ok) assert.equal(duplicate.issue.code, 'duplicate-key');
const malformed = parseAppearanceExportJson('{"schema":');
assert.equal(malformed.ok, false);
if (!malformed.ok) assert.equal(malformed.issue.code, 'invalid-json');

const projected = structuredClone(appearance);
const layer = projected.states.normal.layers[0];
const effect = {
  id: 'effect.blur', name: 'Blur', kind: 'blur', enabled: true, opacity: 1,
  color: 'rgb(0 0 0 / 24%)', radius: 6, distance: 0, angle: 0, spread: 0, blendMode: 'normal',
};
layer.effects = [effect.id];
layer.effectStack = [effect];
projected.states.normal.textColor = RAINBOW_SENTINEL;
projected.states.normal.motion = 'reduced';
const element = new FakeElement();
element.style.setProperty('color', 'rebeccapurple');
const target = { id: projected.targetId, element, label: 'Primary button', role: 'button' };
assert.equal(applyAppearance(target, projected.states.normal, 'normal'), true);
assert.equal(element.getAttribute('dir'), 'rtl');
assert.equal(element.style.getPropertyValue('filter'), 'blur(6px)');
assert.equal(element.style.getPropertyValue('transition'), 'none');
assert.equal(element.style.getPropertyValue('background-image'), 'linear-gradient(90deg, #2f6fed, #2f6fed)');
clearAppearance(target);
assert.equal(element.getAttribute('dir'), 'rtl');
assert.equal(element.style.getPropertyValue('color'), 'rebeccapurple');
assert.equal(element.style.getPropertyValue('filter'), '');

console.log('PASS site element appearance contract');

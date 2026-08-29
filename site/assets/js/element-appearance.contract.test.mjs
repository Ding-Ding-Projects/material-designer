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
  appearanceKeyboardCommand,
  validateAppearanceExport,
  validateAppearancePayload,
  validateAppearanceStyle,
  getElementToyLockActivationDetail,
  resolveDeepestActiveElement,
  resolveFocusedAppearanceTarget,
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
  tagName = 'BUTTON';
  id = '';
  textContent = 'Shadow keyboard target';
  style = new FakeStyle();
  attributes = new Map([['dir', 'rtl']]);
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  hasAttribute(name) { return this.attributes.has(name); }
  closest() { return null; }
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
assert.ok(CAPABILITIES.filter((item) => !item.supported).every((item) => item.reason.length > 0 && item.reasonZh.length > 0));

const danglingParent = structuredClone(appearance);
danglingParent.states.normal.layers[0].parentId = 'group.missing';
assert.equal(validateAppearancePayload(danglingParent, appearance.targetId), false);
const danglingParentResult = validateAppearanceExport({ ...envelope, appearance: danglingParent });
assert.equal(danglingParentResult.ok, false);
if (!danglingParentResult.ok) assert.deepEqual(danglingParentResult.issue, { code: 'missing-reference', path: '$.appearance.states.normal.layers.base.parentId', message: 'Parent identity "group.missing" is missing.' });

const parentCycle = structuredClone(appearance);
parentCycle.states.normal.layers.push({ ...structuredClone(parentCycle.states.normal.layers[0]), id: 'group.two', kind: 'group', parentId: 'group.one' });
parentCycle.states.normal.layers[0].parentId = 'group.two';
parentCycle.states.normal.layers[0].id = 'group.one';
assert.equal(validateAppearancePayload(parentCycle, appearance.targetId), false);
const parentCycleResult = validateAppearanceExport({ ...envelope, appearance: parentCycle });
assert.equal(parentCycleResult.ok, false);
if (!parentCycleResult.ok) assert.deepEqual(parentCycleResult.issue, { code: 'parent-cycle', path: '$.appearance.states.normal.layers.group.one.parentId', message: 'Layer parent identities form a cycle.' });

const danglingEffect = structuredClone(appearance);
danglingEffect.states.normal.layers[0].effects = ['effect.missing'];
assert.equal(validateAppearancePayload(danglingEffect, appearance.targetId), false);
const danglingEffectResult = validateAppearanceExport({ ...envelope, appearance: danglingEffect });
assert.equal(danglingEffectResult.ok, false);
if (!danglingEffectResult.ok) assert.deepEqual(danglingEffectResult.issue, { code: 'missing-reference', path: '$.appearance.states.normal.layers.base.effects', message: 'Effect identity "effect.missing" is missing.' });

const invalidNumber = structuredClone(appearance);
invalidNumber.states.normal.fontSize = Number.NaN;
assert.equal(validateAppearancePayload(invalidNumber, appearance.targetId), false);
const invalidNumberResult = validateAppearanceExport({ ...envelope, appearance: invalidNumber });
assert.equal(invalidNumberResult.ok, false);
if (!invalidNumberResult.ok) assert.deepEqual(invalidNumberResult.issue, { code: 'non-finite-number', path: '$.appearance.states.normal.fontSize', message: 'Number must be finite.' });

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
projected.states.normal.textDirection = 'ltr';
const element = new FakeElement();
element.attributes.delete('dir');
element.style.setProperty('direction', 'rtl', 'important');
element.style.setProperty('color', 'rebeccapurple', 'important');
element.style.setProperty('transform', 'scale(2)', 'important');
element.style.setProperty('direction', 'rtl', 'important');
element.style.setProperty('filter', 'grayscale(1)', 'important');
element.style.setProperty('--appearance-overrides', 'existing', 'important');
const target = { id: projected.targetId, element, label: 'Primary button', role: 'button' };
assert.equal(applyAppearance(target, projected.states.normal, 'normal'), true);
assert.equal(element.getAttribute('dir'), null);
assert.equal(element.style.getPropertyValue('filter'), 'blur(6px)');
assert.equal(element.style.getPropertyValue('transform').includes('translate('), true);
assert.equal(element.style.getPropertyValue('direction'), 'ltr');
assert.equal(element.style.getPropertyPriority('color'), '');
assert.equal(element.style.getPropertyValue('transition'), 'none');
assert.equal(element.style.getPropertyValue('background-image'), 'linear-gradient(90deg, #2f6fed, #2f6fed)');
clearAppearance(target);
assert.equal(element.getAttribute('dir'), null);
assert.equal(element.style.getPropertyValue('color'), 'rebeccapurple');
assert.equal(element.style.getPropertyPriority('color'), 'important');
assert.equal(element.style.getPropertyValue('transform'), 'scale(2)');
assert.equal(element.style.getPropertyPriority('transform'), 'important');
assert.equal(element.style.getPropertyValue('direction'), 'rtl');
assert.equal(element.style.getPropertyPriority('direction'), 'important');
assert.equal(element.style.getPropertyValue('filter'), 'grayscale(1)');
assert.equal(element.style.getPropertyPriority('filter'), 'important');
assert.equal(element.style.getPropertyValue('--appearance-overrides'), 'existing');
assert.equal(element.style.getPropertyPriority('--appearance-overrides'), 'important');

element.setAttribute('dir', 'rtl');
element.style.setProperty('direction', 'rtl', 'important');
assert.equal(applyAppearance(target, projected.states.normal, 'normal'), true);
assert.equal(element.getAttribute('dir'), 'rtl');
clearAppearance(target);
assert.equal(element.getAttribute('dir'), 'rtl');
assert.equal(element.style.getPropertyValue('direction'), 'rtl');
assert.equal(element.style.getPropertyPriority('direction'), 'important');

globalThis.Element = FakeElement;
const keyboardTarget = new FakeElement();
keyboardTarget.attributes.set('data-testid', 'shadow-keyboard-target');
keyboardTarget.attributes.set('data-appearance-locked', 'true');
const nestedKeyboardHost = { shadowRoot: { activeElement: keyboardTarget } };
const keyboardHost = { shadowRoot: { activeElement: nestedKeyboardHost } };
const keyboardDocument = { activeElement: keyboardHost };
assert.equal(resolveDeepestActiveElement(keyboardDocument), keyboardTarget);
const focusedTarget = resolveFocusedAppearanceTarget(keyboardDocument);
assert.equal(focusedTarget?.id, 'site:shadow-keyboard-target');
assert.deepEqual(getElementToyLockActivationDetail(focusedTarget), {
  targetId: 'site:shadow-keyboard-target',
  targetLabel: 'Shadow keyboard target',
  targetRole: 'button',
  anchor: keyboardTarget,
});
assert.equal(appearanceKeyboardCommand({ key: 'F10', shiftKey: true }), 'open-menu');
assert.equal(appearanceKeyboardCommand({ key: 'ContextMenu', shiftKey: false }), 'open-menu');
assert.equal(appearanceKeyboardCommand({ key: 'Enter', shiftKey: false }), 'activate-locked');
assert.equal(appearanceKeyboardCommand({ key: ' ', shiftKey: false }), 'activate-locked');

const gradientStyle = structuredClone(appearance).states.normal;
const gradientEffect = {
  id: 'effect.gradient', name: 'Gradient', kind: 'gradient', enabled: true,
  opacity: 1, color: 'linear-gradient(90deg, red, blue)', radius: 0, distance: 0, angle: 0, spread: 0, blendMode: 'normal',
};
gradientStyle.layers[0].effects = [gradientEffect.id];
gradientStyle.layers[0].effectStack = [gradientEffect];
assert.equal(applyAppearance(target, gradientStyle, 'normal'), true);
assert.equal(element.style.getPropertyValue('background-image'), 'linear-gradient(90deg, red, blue)');
clearAppearance(target);

const patternStyle = structuredClone(appearance).states.normal;
const patternEffect = { ...gradientEffect, id: 'effect.pattern', kind: 'pattern', color: 'repeating-linear-gradient(45deg, red 0 4px, blue 4px 8px)' };
patternStyle.layers[0].effects = [patternEffect.id];
patternStyle.layers[0].effectStack = [patternEffect];
assert.equal(applyAppearance(target, patternStyle, 'normal'), true);
assert.equal(element.style.getPropertyValue('background-image'), 'repeating-linear-gradient(45deg, red 0 4px, blue 4px 8px)');
clearAppearance(target);

console.log('PASS site element appearance contract');

import assert from 'node:assert/strict';

import { INIT_DIAGNOSTICS, init } from './element-appearance.js';

const missing = init({});
assert.deepEqual(missing.diagnostics, [INIT_DIAGNOSTICS.regex, INIT_DIAGNOSTICS.i18n, INIT_DIAGNOSTICS.root]);

const simulatedMainRegistration = init({
  regex: { attachRegexBuilder() {} },
  i18n: { getState() { return { mode: 'en', funny: { en: 1, yue: 1 } }; } },
});
assert.deepEqual(simulatedMainRegistration.diagnostics, [INIT_DIAGNOSTICS.root]);
simulatedMainRegistration.destroy();

class FakeEventTarget {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }
  removeEventListener(type, listener) {
    this.listeners.set(type, (this.listeners.get(type) || []).filter((candidate) => candidate !== listener));
  }
  dispatchEvent(event) {
    for (const listener of [...(this.listeners.get(event.type) || [])]) listener(event);
    return !event.defaultPrevented;
  }
}

class FakeElement extends FakeEventTarget {
  constructor(tagName = 'div') {
    super();
    this.tagName = tagName.toUpperCase();
    this.attributes = new Map();
    this.childNodes = [];
    this.dataset = {};
    this.style = { setProperty() {}, removeProperty() {} };
    this.className = '';
    this.disabled = false;
    this.value = '';
    this._queries = new Map();
    this.textContent = '';
    this.parentElement = null;
    this.shadowRoot = null;
  }
  get id() { return this.getAttribute('id') || ''; }
  set id(value) { this.setAttribute('id', value); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  hasAttribute(name) { return this.attributes.has(name); }
  set innerHTML(markup) {
    this._innerHTML = String(markup);
    if (!this._innerHTML.includes('data-edit')) return;
    const search = new FakeElement('input');
    search.id = 'element-appearance-menu-search';
    const edit = new FakeElement('button');
    edit.setAttribute('data-edit', '');
    const lock = new FakeElement('button');
    lock.setAttribute('data-lock', '');
    lock.disabled = this._innerHTML.includes('data-lock disabled');
    if (lock.disabled) lock.setAttribute('aria-disabled', 'true');
    const title = this._innerHTML.match(/data-lock[^>]*title="([^"]*)"/)?.[1] ?? '';
    lock.setAttribute('title', title);
    this.append(search, edit, lock);
    this._queries.set('input', search);
    this._queries.set('[data-edit]', edit);
    this._queries.set('[data-lock]', lock);
  }
  get innerHTML() { return this._innerHTML ?? ''; }
  querySelector(selector) { return this._queries.get(selector) ?? null; }
  append(...children) {
    for (const child of children) { child.parentElement = this; this.childNodes.push(child); }
  }
  prepend(child) { child.parentElement = this; this.childNodes.unshift(child); }
  contains(candidate) {
    let current = candidate;
    while (current) { if (current === this) return true; current = current.parentElement; }
    return false;
  }
  remove() {
    if (!this.parentElement) return;
    this.parentElement.childNodes = this.parentElement.childNodes.filter((child) => child !== this);
    this.parentElement = null;
  }
  closest(selector) {
    let current = this;
    while (current) {
      if (selector === '[data-appearance-editor="true"]' && current.getAttribute('data-appearance-editor') === 'true') return current;
      current = current.parentElement;
    }
    return null;
  }
  focus() { globalThis.document.activeElement = this; }
  getBoundingClientRect() { return { left: 20, right: 100, top: 20, bottom: 60 }; }
}

class FakeCustomEvent {
  constructor(type, init = {}) { this.type = type; this.detail = init.detail; this.defaultPrevented = false; }
}

class FakeMutationObserver {
  observe() {}
  disconnect() {}
}

const root = new FakeElement('main');
const button = new FakeElement('button');
button.setAttribute('data-testid', 'listener-target');
button.setAttribute('aria-label', 'Listener target');
root.append(button);
const fakeDocument = new FakeEventTarget();
fakeDocument.body = root;
fakeDocument.activeElement = button;
fakeDocument.documentElement = { dataset: { langMode: 'en' }, style: { setProperty() {} } };
fakeDocument.createElement = (tagName) => new FakeElement(tagName);
globalThis.Element = FakeElement;
globalThis.CustomEvent = FakeCustomEvent;
globalThis.MutationObserver = FakeMutationObserver;
globalThis.document = fakeDocument;
globalThis.innerWidth = 1280;
globalThis.innerHeight = 720;
globalThis.localStorage = { getItem() { return null; }, setItem() {} };

const activationDetails = [];
fakeDocument.addEventListener('open-design:element-toy-lock-activation', (event) => activationDetails.push(event.detail));
const runtime = init({
  root,
  regex: { attachRegexBuilder() {} },
  i18n: { getState() { return { mode: 'en', funny: { en: 1, yue: 1 } }; } },
});
assert.deepEqual(runtime.diagnostics, []);
assert.equal(runtime.registry.get('site:listener-target')?.element, button);

function interactionEvent(type, target) {
  return {
    type,
    target,
    clientX: 24,
    clientY: 32,
    shiftKey: false,
    defaultPrevented: false,
    propagationStopped: false,
    composedPath() { return [target, root, fakeDocument]; },
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this.propagationStopped = true; },
  };
}

const contextMenu = interactionEvent('contextmenu', button);
root.dispatchEvent(contextMenu);
assert.equal(contextMenu.defaultPrevented, true);
assert.equal(contextMenu.propagationStopped, true);
const menu = root.childNodes.find((candidate) => candidate.className === 'element-appearance-menu');
assert.ok(menu);
assert.equal(menu.querySelector('[data-edit]').disabled, false);
assert.equal(menu.querySelector('[data-lock]').disabled, true);
assert.equal(menu.querySelector('[data-lock]').getAttribute('aria-disabled'), 'true');
assert.equal(menu.querySelector('[data-lock]').getAttribute('title'), 'A target-specific toy-lock provider is not mounted yet.');

const unlockedClick = interactionEvent('click', button);
fakeDocument.dispatchEvent(unlockedClick);
assert.equal(unlockedClick.defaultPrevented, false);
assert.equal(activationDetails.length, 0);

button.setAttribute('data-toy-locked', 'true');
const lockedClick = interactionEvent('click', button);
fakeDocument.dispatchEvent(lockedClick);
assert.equal(lockedClick.defaultPrevented, false);
assert.equal(lockedClick.propagationStopped, false);
assert.equal(activationDetails.length, 0);
runtime.destroy();

console.log('PASS site element appearance init diagnostics');

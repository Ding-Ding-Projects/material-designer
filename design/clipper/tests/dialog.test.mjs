import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

test('shared extension dialog traps focus and moves from a hidden Start control', () => {
  const listeners = {};
  const start = { hidden: true, disabled: false, focusCalled: 0, focus() { this.focusCalled += 1; } };
  const cancel = { hidden: false, disabled: false, focusCalled: 0, focus() { this.focusCalled += 1; } };
  const root = {
    querySelectorAll() { return [start, cancel].filter((control) => !control.hidden && !control.disabled); },
    addEventListener(name, callback) { listeners[name] = callback; },
    removeEventListener() {},
    contains(node) { return node === start || node === cancel; },
  };
  const context = {
    document: { activeElement: start },
    globalThis: null,
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(new URL('../dialog.js', import.meta.url), 'utf8'), context, { filename: 'dialog.js' });
  const dispose = context.OD_CLIPPER_DIALOG.mount(root, {});
  context.OD_CLIPPER_DIALOG.focusAvailable(root);
  assert.equal(cancel.focusCalled, 1);
  assert.equal(start.focusCalled, 0);

  context.document.activeElement = cancel;
  let prevented = false;
  listeners.keydown({ key: 'Tab', shiftKey: false, preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(cancel.focusCalled, 2);
  dispose();
});

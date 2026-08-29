// @vitest-environment node

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SITE_FILE = resolve(process.cwd(), '../../../site/assets/js/personal-vocabulary.js');
const SITE_URL = `file:///${SITE_FILE.split(String.fromCharCode(92)).join('/')}`;
const SITE_TEST_TIMEOUT_MS = 30_000;

function runSiteProbe(body: string, options: { timeout?: number; maxBuffer?: number } = {}): string {
  const script = `
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  localStorage: dom.window.localStorage,
  CustomEvent: dom.window.CustomEvent,
  Event: dom.window.Event,
  File: dom.window.File,
  TextEncoder,
  TextDecoder,
});
const mod = await import(${JSON.stringify(SITE_URL)});
${body}
`;
  return execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: options.timeout ?? SITE_TEST_TIMEOUT_MS,
    maxBuffer: options.maxBuffer ?? 2 * 1024 * 1024,
  });
}

function mountMarkup() {
  document.body.innerHTML = '<section data-personal-vocabulary hidden>'
    + '<div data-personal-vocabulary-row>Personal wording controls</div>'
    + '<label data-personal-vocabulary-row>Local file <input data-personal-vocabulary-file type="file"></label>'
    + '<label data-personal-vocabulary-row>Sample text <input data-personal-vocabulary-sample value="A private UI label can be adapted here."></label>'
    + '<output data-personal-vocabulary-output></output>'
    + '<label data-personal-vocabulary-row>Search <input data-personal-vocabulary-search></label>'
    + '<p data-personal-vocabulary-count></p>'
    + '<button data-personal-vocabulary-row data-personal-vocabulary-clear></button>'
    + '<p data-personal-vocabulary-status></p>'
    + '<p data-personal-vocabulary-no-matches></p>'
    + '<input data-personal-vocabulary-history-search>'
    + '<input data-personal-vocabulary-history-date-from>'
    + '<input data-personal-vocabulary-history-date-to>'
    + '<button data-personal-vocabulary-history-preset-value></button>'
    + '<div data-personal-vocabulary-history-preset-options></div>'
    + '<input data-personal-vocabulary-history-preset-search>'
    + '<input data-personal-vocabulary-history-action-search>'
    + '<button data-personal-vocabulary-history-action-value></button>'
    + '<div data-personal-vocabulary-history-action-options></div>'
    + '<p data-personal-vocabulary-history-status></p>'
    + '<ul data-personal-vocabulary-history-list></ul>'
    + '<button data-personal-vocabulary-history-export></button>'
    + '<button data-personal-vocabulary-history-select-all></button>'
    + '<button data-personal-vocabulary-history-invert></button>'
    + '<button data-personal-vocabulary-history-delete></button>'
    + '<dialog data-personal-vocabulary-history-confirm></dialog>'
    + '<strong data-personal-vocabulary-history-confirm-count></strong>'
    + '<input data-personal-vocabulary-history-key-one>'
    + '<input data-personal-vocabulary-history-key-two>'
    + '<input data-personal-vocabulary-history-slider value="0">'
    + '<progress data-personal-vocabulary-history-progress></progress>'
    + '<p data-personal-vocabulary-history-confirm-status></p>'
    + '<button data-personal-vocabulary-history-cancel></button>'
    + '<button data-personal-vocabulary-history-confirm-action></button>'
    + '</section>';
  return document.querySelector('[data-personal-vocabulary]');
}

describe('documentation site personal-vocabulary behavior', () => {
  it('loads valid local bytes, updates the real output, and resets the picker', () => {
    expect(runSiteProbe(`
const root = ${mountMarkup.toString()}();
const cleanup = mod.mountPersonalVocabulary(root);
const picker = document.querySelector('[data-personal-vocabulary-file]');
const file = new File(['{"schemaVersion":1,"entries":{"label":"display"}}'], 'local.json', { type: 'application/json' });
Object.defineProperty(picker, 'files', { configurable: true, value: [file] });
picker.dispatchEvent(new Event('change'));
await new Promise((resolve) => setTimeout(resolve, 0));
assert.match(localStorage.getItem('open-design:personal-vocabulary:v1') || '', /display/);
assert.equal(picker.value, '');
assert.equal(root.hidden, false);
cleanup();
console.log('ok');
`)).toContain('ok');
  }, SITE_TEST_TIMEOUT_MS);

  it('uses local dates and a filtered redacted history projection', () => {
    expect(runSiteProbe(`
const today = new Date();
localStorage.setItem('open-design:personal-vocabulary-history:v1', JSON.stringify([
  { schemaVersion: 1, action: 'loaded', at: today.getTime() },
  { schemaVersion: 1, action: 'cleared', at: today.getTime() - 86400000 * 3 },
]));
const root = ${mountMarkup.toString()}();
mod.mountPersonalVocabulary(root);
const from = document.querySelector('[data-personal-vocabulary-history-date-from]');
from.value = today.toISOString().slice(0, 10);
from.dispatchEvent(new Event('input'));
assert.match(document.querySelector('[data-personal-vocabulary-history-list]').textContent, /Loaded/);
assert.doesNotMatch(document.querySelector('[data-personal-vocabulary-history-list]').textContent, /Cleared/);
console.log('ok');
`)).toContain('ok');
  }, SITE_TEST_TIMEOUT_MS);

  it('rejects Unicode Number categories and decoded unsafe code points', () => {
    expect(runSiteProbe(`
for (const key of ['label١', 'label१', 'labelⅣ', 'label²', 'label¼']) {
  assert.equal(mod.validatePersonalVocabularyText(JSON.stringify({ schemaVersion: 1, entries: { [key]: 'value' } })).code, 'factual-key');
}
for (const value of ['before\\\\u0000after', 'before\\\\u202Eafter', 'before\\\\u200Eafter', 'before\\\\uD800after']) {
  assert.equal(mod.validatePersonalVocabularyText('{"schemaVersion":1,"entries":{"label":"' + value + '"}}').code, 'invalid-shape');
}
console.log('ok');
`)).toContain('ok');
  }, SITE_TEST_TIMEOUT_MS);

  it('applies defined text boundaries without splitting words or combining marks', () => {
    expect(runSiteProbe(`
const result = mod.validatePersonalVocabularyText(JSON.stringify({ schemaVersion: 1, entries: { label: 'display', '蝦餃': 'dumpling' } }));
assert.equal(result.ok, true);
assert.equal(mod.applyPersonalVocabulary('label labels label.', result.payload), 'display labels display.');
assert.equal(mod.applyPersonalVocabulary('e\\u0301label label\\u0301', result.payload), 'e\\u0301label label\\u0301');
assert.equal(mod.applyPersonalVocabulary('蝦餃小食 小蝦餃', result.payload), 'dumpling小食 小dumpling');
assert.equal(mod.applyPersonalVocabulary('label', result.payload, 'technical'), 'label');
console.log('ok');
`)).toContain('ok');
  }, SITE_TEST_TIMEOUT_MS);

  it('keeps NFC, NFD, and visually confusable code points distinct', () => {
    expect(runSiteProbe(`
const result = mod.validatePersonalVocabularyText(JSON.stringify({ schemaVersion: 1, entries: { 'café': 'coffee', pay: 'settle' } }));
assert.equal(result.ok, true);
assert.equal(mod.PERSONAL_VOCABULARY_MATCH_NORMALIZATION, 'none');
assert.equal(mod.applyPersonalVocabulary('café cafe\\u0301 pay раy', result.payload), 'coffee cafe\\u0301 settle раy');
console.log('ok');
`)).toContain('ok');
  }, SITE_TEST_TIMEOUT_MS);

  it('keeps the feature hidden until an unresolved C1 adapter reports School mode off', () => {
    expect(runSiteProbe(`
let listener = null;
const source = { readSchoolMode: () => null, subscribeSchoolMode: (next) => { listener = next; return () => { listener = null; }; } };
const root = ${mountMarkup.toString()}();
const cleanup = mod.mountPersonalVocabulary(root, { schoolModeSource: source });
assert.equal(root.hidden, true);
listener(false);
assert.equal(root.hidden, false);
cleanup();
assert.match(mod.PERSONAL_VOCABULARY_OPEN_EVENT, /personal-vocabulary-open/);
console.log('ok');
`)).toContain('ok');
  }, SITE_TEST_TIMEOUT_MS);

  it('opens and focuses the mounted feature through its owned open event', () => {
    expect(runSiteProbe(`
const root = ${mountMarkup.toString()}();
const scroll = () => { globalThis.scrolled = true; };
Object.defineProperty(root, 'scrollIntoView', { configurable: true, value: scroll });
mod.mountPersonalVocabulary(root);
mod.openPersonalVocabulary();
assert.equal(globalThis.scrolled, true);
assert.equal(document.activeElement?.matches('[data-personal-vocabulary-search]'), true);
console.log('ok');
`)).toContain('ok');
  }, SITE_TEST_TIMEOUT_MS);

  it('restores cache and redacted local history together after a refusal', () => {
    expect(runSiteProbe(`
const root = ${mountMarkup.toString()}();
mod.mountPersonalVocabulary(root);
localStorage.setItem('open-design:personal-vocabulary:v1', '{"schemaVersion":1,"entries":{"label":"display"}}');
localStorage.setItem('open-design:personal-vocabulary-history:v1', JSON.stringify([{ schemaVersion: 1, action: 'loaded', at: 10 }]));
const snapshot = mod.readPersonalVocabularyStateSnapshot();
localStorage.setItem('open-design:personal-vocabulary:v1', '{"schemaVersion":1,"entries":{"label":"changed"}}');
localStorage.setItem('open-design:personal-vocabulary-history:v1', JSON.stringify([{ schemaVersion: 1, action: 'replaced', at: 20 }]));
assert.equal(mod.restorePersonalVocabularyState(snapshot), true);
assert.match(localStorage.getItem('open-design:personal-vocabulary:v1') || '', /display/);
assert.match(localStorage.getItem('open-design:personal-vocabulary-history:v1') || '', /"at":10/);
console.log('ok');
`)).toContain('ok');
  }, SITE_TEST_TIMEOUT_MS);

  it('fails when the child process exceeds the forced timeout', () => {
    expect(() => runSiteProbe(`
await new Promise((resolve) => setTimeout(resolve, 1000));
console.log('unexpected completion');
`, { timeout: 100 })).toThrowError(expect.objectContaining({ code: 'ETIMEDOUT' }));
  });

  it('rejects child output beyond the configured 2 MiB maxBuffer and terminates without partial success', () => {
    let thrown: unknown;
    try {
      runSiteProbe(`
process.stdout.write('x'.repeat(2 * 1024 * 1024 + 1));
console.log('unexpected completion');
`, { maxBuffer: 2 * 1024 * 1024 });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeDefined();
    expect(thrown).toMatchObject({ code: 'ENOBUFS', status: null, signal: 'SIGTERM' });
    const outputError = thrown as { message?: string; stdout?: string };
    expect(outputError.message).toContain('ENOBUFS');
    expect(outputError.stdout).toBeTypeOf('string');
    expect(outputError.stdout).not.toContain('unexpected completion');
  });

  it('fails when the child process exits nonzero', () => {
    expect(() => runSiteProbe(`
process.exitCode = 17;
`)).toThrowError(expect.objectContaining({ status: 17 }));
  });
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const projectRequire = createRequire(pathToFileURL(resolve('design/package.json')));
const override = process.env.MATERIAL_DESIGNER_JSDOM_ROOT;
const { JSDOM } = override
  ? createRequire(resolve(override, 'package.json'))('jsdom')
  : projectRequire('jsdom');
const html = await readFile(resolve('site/index.html'), 'utf8');
const dom = new JSDOM(html, {
  url: 'https://example.test/',
  pretendToBeVisual: true,
});
const { window } = dom;
const errors = [];
window.addEventListener('error', (event) => errors.push(event.error || new Error(event.message)));

const browserGlobals = {
  window,
  document: window.document,
  location: window.location,
  navigator: window.navigator,
  localStorage: window.localStorage,
  CustomEvent: window.CustomEvent,
  Event: window.Event,
  Element: window.Element,
  HTMLElement: window.HTMLElement,
  HTMLSelectElement: window.HTMLSelectElement,
  Node: window.Node,
  MutationObserver: window.MutationObserver,
  getComputedStyle: window.getComputedStyle.bind(window),
  requestAnimationFrame: window.requestAnimationFrame.bind(window),
  cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
};
for (const [name, value] of Object.entries(browserGlobals)) {
  Object.defineProperty(globalThis, name, { configurable: true, value });
}
globalThis.CSS = window.CSS || { escape: (value) => String(value).replace(/[^A-Za-z0-9_-]/g, '\\$&') };
window.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
window.ResizeObserver ??= class { observe() {} disconnect() {} };
globalThis.ResizeObserver = window.ResizeObserver;
window.URL.createObjectURL ??= () => 'blob:local-test';
window.URL.revokeObjectURL ??= () => {};

const manifest = {
  schemaVersion: 1,
  generation: '0'.repeat(64),
  source: 'docs/**/*.md',
  articleCount: 1,
  articles: [{
    id: 'readme.md',
    path: 'README.md',
    category: 'root',
    title: 'Fixture documentation',
    kind: 'index',
    sourceUrl: 'https://github.com/Ding-Ding-Projects/material-designer/blob/main/docs/README.md',
    sha256: '1'.repeat(64),
    suggestedArticles: ['README.md'],
    fragments: ['fixture-documentation'],
    images: [],
    markdown: '# Fixture documentation\n\nThe reader mounted through the real module.',
  }],
};
globalThis.fetch = async () => ({ ok: true, json: async () => manifest });
const mainSource = await readFile(resolve('site/assets/js/main.js'), 'utf8');
assert.match(mainSource, /initSiteShell\(\);\s*\n\s*void initDocsBrowser\(\{ i18n, regex, tabs, ui \}\);/);
await import(`${pathToFileURL(resolve('site/assets/js/main.js')).href}?dom-startup=${Date.now()}`);
await new Promise((resolveDelay) => window.setTimeout(resolveDelay, 100));

assert.deepEqual(errors, [], `Page startup raised: ${errors.map((error) => error.message).join('; ')}`);
assert.equal(
  window.document.querySelector('[data-docs-browser]').dataset.loaded,
  'true',
  window.document.getElementById('docs-browser-status').textContent,
);

const [regex, tabs] = await Promise.all([
  import(pathToFileURL(resolve('site/assets/js/regex.js')).href),
  import(pathToFileURL(resolve('site/assets/js/tabs.js')).href),
]);
assert.ok(tabs.getTabStrip()?.getActiveId(), 'The Map-backed tab strip must render an active tab at startup.');

for (const input of [
  window.document.querySelector('[data-logo-search]'),
  window.document.querySelector('[data-converter-category] [data-converter-search]'),
]) {
  assert.ok(input, 'Expected the startup page to register the search field.');
  const controller = regex.attachRegexBuilder(input, { key: `startup-dom-${input.id}` });
  assert.ok(controller, 'Expected each search field to register its adjacent regex builder.');
  controller.setPattern('(a+)+$');
  assert.equal(controller.matcher().isUsable(), false, 'High-risk pattern must be refused before it can search.');
}

assert.deepEqual(errors, [], `Regex field registration raised: ${errors.map((error) => error.message).join('; ')}`);

console.log('Site jsdom startup, reader, and bounded-regex checks passed.');
window.close();
process.exit(0);

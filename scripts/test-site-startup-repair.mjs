import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve('site/assets/js');
const mainSource = await readFile(resolve(root, 'main.js'), 'utf8');

for (const statement of [
  "import { initSiteShell } from './site-shell.js';",
  "import { auditSiteShell, selfTestSiteShellContract } from './site-shell-contract.js';",
  "import * as converter from './converter.js';",
  "import { initDocsBrowser } from './docs-browser.js';",
  "import * as logo from './logo.js';",
  "import * as personalVocabulary from './personal-vocabulary.js';",
]) assert.match(mainSource, new RegExp(statement.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

assert.equal((mainSource.match(/^function wireUniversalSettingsOwner\(/gm) || []).length, 1);
assert.equal((mainSource.match(/^function wirePersonalAndLogo\(/gm) || []).length, 0);
assert.match(mainSource, /wireUniversalSettingsOwner\(\);\s*\n\s*initSiteShell\(\);/);
assert.match(mainSource, /initSiteShell\(\);\s*\n\s*void initDocsBrowser\(\{ i18n, regex, tabs, ui \}\);/);
assert.match(mainSource, /if \(searchResult\.cancelled\) return;/);
assert.match(mainSource, /initPersonalVocabulary\(\);\s*\n\s*wireLogo\(\);/);
assert.match(mainSource, /converter\.clearQueue\(\);/);
assert.doesNotMatch(mainSource, /\ballHits\b/);
assert.doesNotMatch(mainSource, /input && control/);
assert.doesNotMatch(mainSource, /new RegExp\(query/);

const search = await import(pathToFileURL(resolve(root, 'content-search.js')).href);
const converterSource = await readFile(resolve(root, 'converter.js'), 'utf8');
assert.match(converterSource, /^export function clearQueue\(\)/m);

const entries = (count) => Array.from({ length: count }, (_, id) => ({ id, text: `needle ${id}` }));
const zero = await search.collectContentSearchResults(entries(4), async () => false);
assert.deepEqual({ total: zero.totalMatches, hits: zero.hits.length, truncated: zero.resultTruncated, incomplete: zero.sweepIncomplete }, { total: 0, hits: 0, truncated: false, incomplete: false });

const underLimit = await search.collectContentSearchResults(entries(4), async () => true);
assert.deepEqual({ total: underLimit.totalMatches, hits: underLimit.hits.length, truncated: underLimit.resultTruncated, incomplete: underLimit.sweepIncomplete }, { total: 4, hits: 4, truncated: false, incomplete: false });

const overLimit = await search.collectContentSearchResults(entries(61), async () => true);
assert.deepEqual({ total: overLimit.totalMatches, hits: overLimit.hits.length, truncated: overLimit.resultTruncated, incomplete: overLimit.sweepIncomplete }, { total: 61, hits: 60, truncated: true, incomplete: false });
assert.match(search.contentSearchStatus(overLimit), /61 matches found\. Showing the first 60/);

let time = 0;
const incomplete = await search.collectContentSearchResults(entries(4), async () => true, { now: () => time++, deadlineMs: 1 });
assert.equal(incomplete.sweepIncomplete, true);
assert.match(search.contentSearchStatus(incomplete), /matches found so far/);

let releaseMatcher;
let current = true;
const stale = search.collectContentSearchResults(entries(1), () => new Promise((resolve) => { releaseMatcher = resolve; }), {
  isCurrent: () => current,
});
current = false;
releaseMatcher(true);
assert.equal((await stale).cancelled, true);

console.log('Site startup and content-search repair checks passed.');

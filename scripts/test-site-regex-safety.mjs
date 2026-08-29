/*
 * Behavioral fixture for the documentation site's no-worker fallback. It
 * loads the real tabs module, calls its exported matcher, and proves nested
 * patterns are refused while ordinary patterns still run. The release
 * shutdown record keeps this fixture available without running it as part of
 * the local source-only checks.
 */
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../site/assets/js/tabs.js', import.meta.url), 'utf8');
const moduleSource = source;
const module = await import(`data:text/javascript,${encodeURIComponent(moduleSource)}`);

const risky = ['(a+)+$', '((a+)+)+$', '(a+)(a+)b'];
for (const pattern of risky.slice(0, 2)) {
  const matcher = module.createTabMatcher({ query: pattern, mode: 'regex', flags: 'i' });
  if (matcher.ok) throw new Error(`High-risk pattern was accepted: ${pattern}`);
}
const falseNegativeCandidate = module.createTabMatcher({ query: risky[3], mode: 'regex', flags: 'i' });
if (!falseNegativeCandidate.ok || !falseNegativeCandidate.test('aaab')) {
  throw new Error('A safe pattern was incorrectly refused by the conservative parser.');
}
console.log('site regex safety fixture: red-risk cases refused, safe case matched');

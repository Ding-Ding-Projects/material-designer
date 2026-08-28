/*
 * Behavioral fixture for the documentation site's no-worker fallback. It
 * loads the real tabs module, calls its exported matcher, and proves nested
 * patterns are refused while ordinary patterns still run. The yum tong lane
 * records this fixture without executing Node locally.
 */
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../site/assets/js/tabs.js', import.meta.url), 'utf8');
const moduleSource = `${source}\nexport { createTabMatcher };`;
const module = await import(`data:text/javascript,${encodeURIComponent(moduleSource)}`);

const risky = ['(a+)+$', '((a+)+)+$', '(a|ab)+$', '(a+)(a+)b'];
for (const pattern of risky.slice(0, 3)) {
  const matcher = module.createTabMatcher({ query: pattern, mode: 'regex', flags: 'i' });
  if (matcher.ok) throw new Error(`High-risk pattern was accepted: ${pattern}`);
}
const falseNegativeCandidate = module.createTabMatcher({ query: risky[3], mode: 'regex', flags: 'i' });
if (!falseNegativeCandidate.ok || !falseNegativeCandidate.test('aaab')) {
  throw new Error('A safe pattern was incorrectly refused by the conservative parser.');
}
console.log('site regex safety fixture: red-risk cases refused, safe case matched');

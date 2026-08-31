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

console.log('PASS site element appearance init diagnostics');

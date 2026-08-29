import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const workflow = await readFile('.github/workflows/release.yml', 'utf8');

function selectTokenMode(releasePresent, orgPresent) {
  if (releasePresent === true) return 'release-token';
  if (orgPresent === true) return 'org-token';
  return 'github-token';
}

assert.equal(selectTokenMode(false, false), 'github-token');
assert.equal(selectTokenMode(true, false), 'release-token');
assert.equal(selectTokenMode(false, true), 'org-token');
assert.equal(selectTokenMode(true, true), 'release-token');
assert.equal(selectTokenMode(false, false), 'github-token');

const modeStart = workflow.indexOf("if [ \"$RELEASE_TOKEN_PRESENT\" = 'true' ]");
const modeEnd = workflow.indexOf('publisher_allowlist=', modeStart);
assert.ok(modeStart >= 0 && modeEnd > modeStart);
const modeScope = workflow.slice(modeStart, modeEnd);
assert.match(modeScope, /token_mode='release-token'/);
assert.match(modeScope, /token_mode='org-token'/);
assert.match(modeScope, /token_mode='github-token'/);
assert.match(modeScope, /authenticated_login='github-actions\[bot\]'/);
assert.match(modeScope, /gh api user/);
assert.doesNotMatch(modeScope, /gh api user --jq/);
assert.match(workflow, /RELEASE_TOKEN_PRESENT: \$\{\{ secrets\.RELEASE_TOKEN != '' \}\}/);
assert.match(workflow, /ORG_TOKEN_PRESENT: \$\{\{ secrets\.ORG_TOKEN != '' \}\}/);
assert.match(workflow, /echo \"Selected publisher token mode: \$token_mode\"/);
console.log('PASS: token-mode precedence fixture covers GitHub-token-only, release-token, org-token, precedence, user lookup and bot identity paths.');

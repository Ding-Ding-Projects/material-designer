import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root = process.cwd();
const workflow = await readFile('.github/workflows/release.yml', 'utf8');
const run = {
  id: 123,
  workflow_id: 999,
  path: '.github/workflows/release.yml@refs/heads/main',
  head_sha: 'a'.repeat(40),
  run_attempt: 2,
  event: 'workflow_dispatch',
  actor: {login: 'owner'},
  created_at: '2026-08-29T16:00:00Z',
  run_started_at: '2026-08-29T16:00:05Z',
  updated_at: '2026-08-29T16:12:35Z'
};

function validateRun(value) {
  assert.ok(Number.isInteger(value.id) && value.id > 0);
  assert.ok(Number.isInteger(value.workflow_id) && value.workflow_id > 0);
  assert.match(value.path, /^\.github\/workflows\/release\.yml(?:@refs\/(?:heads|tags)\/[^/]+)?$/);
  assert.match(value.head_sha, /^[0-9a-f]{40}$/i);
  assert.ok(Number.isInteger(value.run_attempt) && value.run_attempt > 0);
  assert.ok(value.event === 'push' || value.event === 'workflow_dispatch');
  assert.ok(typeof value.actor?.login === 'string' && value.actor.login.length > 0);
  for (const field of ['created_at', 'run_started_at', 'updated_at']) assert.match(value[field], /^\d{4}-\d{2}-\d{2}T/);
}

validateRun(run);
for (const field of ['id', 'workflow_id', 'path', 'head_sha', 'run_attempt', 'event', 'actor', 'created_at', 'run_started_at', 'updated_at']) {
  const mutated = {...run};
  delete mutated[field];
  assert.throws(() => validateRun(mutated), `${field} removal stayed green`);
}
assert.doesNotMatch(workflow, /gh run view[^\n]*--json[^\n]*(?:workflowPath|runAttempt|actor)/);
assert.match(workflow, /gh api "repos\/\$\{GITHUB_REPOSITORY\}\/actions\/runs\/\$\{GITHUB_RUN_ID\}"/);
assert.match(workflow, /gh api "repos\/\$\{GITHUB_REPOSITORY\}\/actions\/runs\/\$\{receipt_run_id\}"/);
console.log('PASS: API-shaped workflow-run fixture fields and REST-only historical-run contract passed red-green mutation checks.');

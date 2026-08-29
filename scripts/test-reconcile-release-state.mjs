import assert from 'node:assert/strict';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';

const script = join(new URL('.', import.meta.url).pathname.replace(/^\//, '').replaceAll('/', '\\'), 'reconcile-release-state.mjs');
const source = 'a'.repeat(40);
const tag = 'v0.16.1-r72.1';
const version = '0.16.1-r72.1';
const started = '2026-08-29T16:00:00Z';
const completed = '2026-08-29T16:12:34Z';
const receipt = {
  schemaVersion: 1,
  sourceCommit: source,
  releaseTag: tag,
  appVersion: version,
  workflowStartedAt: started,
  workflowCompletedAt: completed,
  workflowDuration: '00:12:34',
  publicationStatus: 'published',
  runId: '123',
  runAttempt: '2',
  requiredAssets: ['setup.exe', 'setup.exe.sha256', 'RELEASES', 'metadata.json', 'material-designer.ico', 'build-evidence.json', 'build-provenance.json', 'artifact-receipt.json', 'codename-dish.png', 'release-publication-receipt.json'],
  installerName: 'setup.exe',
  installerSha256: 'c'.repeat(64),
  photoName: 'codename-dish.png',
  photoSha256: 'b'.repeat(64),
  photoBytes: 321,
  dishId: 'dish'
};
const body = [
  `Built from \`${source}\``,
  'dim-sum-id: dish',
  `Public catalog photo SHA-256: ${receipt.photoSha256}`,
  `- Workflow started: ${started}`,
  `- Workflow completed: ${completed}`,
  '- Workflow duration: 00:12:34'
].join('\n');
const baseAssets = [...receipt.requiredAssets, 'material-designer-full.nupkg'].map((name) => ({name, size: 1}));
const release = (overrides = {}) => ({tag_name: tag, draft: false, prerelease: false, targetCommit: source, published_at: completed, body, assets: baseAssets, receipt, ...overrides});

const dir = await mkdtemp(join(tmpdir(), 'release-state-'));
const statePath = join(dir, 'state.json');
function run(state) {
  return JSON.parse(execFileSync(process.execPath, [script, statePath, source, version, tag], {encoding: 'utf8'}));
}
async function check(name, state, expected) {
  await writeFile(statePath, JSON.stringify(state));
  const result = run(state);
  assert.equal(result.kind, expected, `${name}: ${JSON.stringify(result)}`);
}

try {
  await check('first publish success', [], 'new');
  await check('timing-note edit failure', [release({body: body.replace(/- Workflow duration: 00:12:34\n?/, '')})], 'recover-published');
  await check('rerun recovery', [release({draft: true, receipt: {...receipt, publicationStatus: 'draft', workflowCompletedAt: null, workflowDuration: null}})], 'recover-draft');
  await check('published receipt upload recovery', [release({receipt: {...receipt, publicationStatus: 'draft', workflowCompletedAt: null, workflowDuration: null}})], 'recover-published');
  await check('already-complete same source', [release()], 'complete');
  await check('ambiguous same source', [release(), release({tag_name: 'v0.16.1-r72.2'})], 'ambiguous');
  await check('duplicate prevention without ownership receipt', [release({receipt: null})], 'ambiguous');
  await check('missing asset is recoverable', [release({assets: baseAssets.slice(1)})], 'recover-published');
  await check('wrong target is a new publication', [release({targetCommit: 'c'.repeat(40)})], 'new');
  console.log('PASS: release reconciliation distinguishes new, complete, draft recovery, published recovery and ambiguous same-source states.');
} finally {
  await rm(dir, {recursive: true, force: true});
}

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
  runId: 123,
  runAttempt: 2,
  workflowId: 999,
  workflowFile: '.github/workflows/release.yml',
  event: 'push',
  actor: 'owner',
  requiredAssets: [],
  installerName: 'setup.exe',
  installerSha256: 'c'.repeat(64),
  photoName: 'codename-dish.png',
  photoSha256: 'b'.repeat(64),
  photoBytes: 321,
  dishId: 'dish',
  codename: 'Example Dish · 範例',
  photoUrl: 'https://github.com/Ding-Ding-Projects/dim-sum-photos/releases/download/catalog-v1.0.0/dish.png'
};
const body = [
  `Built from \`${source}\``,
  'dim-sum-id: dish',
  `Public catalog photo SHA-256: ${receipt.photoSha256}`,
  `- Workflow started: ${started}`,
  `- Workflow completed: ${completed}`,
  '- Workflow duration: 00:12:34'
].join('\n');
const assetNames = ['setup.exe', 'setup.exe.sha256', 'RELEASES', 'metadata.json', 'material-designer.ico', 'build-evidence.json', 'build-provenance.json', 'artifact-receipt.json', 'codename-dish.png', 'release-publication-receipt.json', 'material-designer-full.nupkg'];
receipt.requiredAssets = assetNames.map((name) => ({name, size: name === 'release-publication-receipt.json' ? null : name === receipt.photoName ? receipt.photoBytes : 1, sha256: name === 'release-publication-receipt.json' ? null : name === receipt.installerName ? receipt.installerSha256 : name === receipt.photoName ? receipt.photoSha256 : 'd'.repeat(64)}));
const baseAssets = receipt.requiredAssets.map((record) => ({name: record.name, size: record.name === receipt.photoName ? receipt.photoBytes : record.size ?? 1, digest: record.sha256 ? `sha256:${record.sha256}` : undefined}));
const release = (overrides = {}) => ({tag_name: tag, draft: false, prerelease: false, targetCommit: source, published_at: completed, body, assets: baseAssets, receipt, workflowOwnership: true, ...overrides});
const ownedEvidence = {runId: 123, workflowId: 999, workflowFile: '.github/workflows/release.yml', headSha: source, runAttempt: 2, event: 'push', actor: 'owner', startedAt: started, createdAt: started, updatedAt: '2026-08-29T16:20:00Z', publishedAt: completed};
const ownedRelease = (overrides = {}) => release({workflowEvidence: ownedEvidence, releaseOwnership: true, ...overrides});

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
  await check('timing-note edit failure', [ownedRelease({body: body.replace(/- Workflow duration: 00:12:34\n?/, '')})], 'recover-published');
  await check('rerun recovery', [ownedRelease({draft: true, receipt: {...receipt, publicationStatus: 'draft', workflowCompletedAt: null, workflowDuration: null}})], 'recover-draft');
  await check('published receipt upload recovery', [ownedRelease({receipt: {...receipt, publicationStatus: 'draft', workflowCompletedAt: null, workflowDuration: null}})], 'recover-published');
  await check('already-complete same source', [ownedRelease()], 'complete');
  await check('ambiguous same source', [ownedRelease(), ownedRelease({tag_name: 'v0.16.1-r72.2'})], 'ambiguous');
  await check('duplicate prevention without ownership receipt', [ownedRelease({receipt: null})], 'ambiguous');
  await check('missing asset is recoverable', [ownedRelease({assets: baseAssets.slice(1)})], 'recover-published');
  await check('wrong target is a new publication', [ownedRelease({targetCommit: 'c'.repeat(40)})], 'new');
  await check('nonexistent run', [ownedRelease({workflowEvidence: {...ownedEvidence, runId: 9999}})], 'ambiguous');
  await check('forged run', [ownedRelease({workflowEvidence: {...ownedEvidence, workflowId: 1000}})], 'ambiguous');
  await check('wrong workflow', [ownedRelease({receipt: {...receipt, workflowFile: '.github/workflows/verify.yml'}})], 'ambiguous');
  await check('wrong workflow SHA', [ownedRelease({workflowEvidence: {...ownedEvidence, headSha: 'c'.repeat(40)}})], 'ambiguous');
  await check('wrong attempt', [ownedRelease({workflowEvidence: {...ownedEvidence, runAttempt: 3}})], 'ambiguous');
  await check('wrong actor', [ownedRelease({workflowEvidence: {...ownedEvidence, actor: 'other'}})], 'ambiguous');
  await check('wrong time interval', [ownedRelease({workflowEvidence: {...ownedEvidence, createdAt: '2026-08-29T15:00:00Z'}})], 'ambiguous');
  await check('missing dish identity', [ownedRelease({receipt: {...receipt, dishId: ''}})], 'ambiguous');
  await check('mismatched code name', [ownedRelease({receipt: {...receipt, codename: ''}})], 'ambiguous');
  await check('invalid photo URL', [ownedRelease({receipt: {...receipt, photoUrl: 'https://example.invalid/photo.png'}})], 'ambiguous');
  await check('mismatched photo name', [ownedRelease({receipt: {...receipt, photoName: 'other.png'}})], 'ambiguous');
  await check('zero-size asset', [ownedRelease({assets: baseAssets.map((asset) => asset.name === 'setup.exe' ? {...asset, size: 0} : asset)})], 'recover-published');
  await check('missing receipt asset', [ownedRelease({receipt: null, assets: baseAssets.filter((asset) => asset.name !== 'release-publication-receipt.json')})], 'ambiguous');
  await check('substituted receipt asset', [ownedRelease({assets: baseAssets.map((asset) => asset.name === 'release-publication-receipt.json' ? {...asset, name: 'other-receipt.json'} : asset)})], 'ambiguous');
  await check('extra asset', [ownedRelease({assets: [...baseAssets, {name: 'extra.bin', size: 1, digest: `sha256:${'d'.repeat(64)}`} ]})], 'ambiguous');
  await check('duplicate receipt asset', [ownedRelease({assets: [...baseAssets, baseAssets.find((asset) => asset.name === 'release-publication-receipt.json')]})], 'ambiguous');
  await check('user-owned release', [ownedRelease({releaseOwnership: false})], 'ambiguous');
  console.log('PASS: release reconciliation distinguishes new, complete, draft recovery, published recovery and ambiguous same-source states.');
} finally {
  await rm(dir, {recursive: true, force: true});
}

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseStrictJson,
  readStrictJson,
  validateJsonSchema,
} from './strict-json.mjs';
import {
  loadAndPinParityRegistries,
  resolvePinnedParityFile,
} from './design-parity-production.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const loaded = loadAndPinParityRegistries(root);
assert.equal(loaded.inventory.rows.length, 10);
assert.equal(loaded.inventory.requiredCaptureVariants.length, 6);
assert.equal(loaded.routes.applicationImplementation.status, 'unimplemented');
assert.equal(loaded.pinnedReference.dependencies.length, 7);

assert.throws(() => parseStrictJson('{"value":1,"value":2}', 'duplicate'), (error) => error.code === 'json.duplicate_key');
assert.throws(() => parseStrictJson('{"__proto__":{}}', 'unsafe'), (error) => error.code === 'json.unsafe_key');
assert.throws(() => parseStrictJson(`${'['.repeat(22)}0${']'.repeat(22)}`, 'depth'), (error) => error.code === 'json.depth');
assert.throws(() => parseStrictJson('{"number":1e999}', 'number'), (error) => error.code === 'json.number_bounds');
assert.throws(() => parseStrictJson(`{"text":"${'x'.repeat(32769)}"}`, 'string'), (error) => error.code === 'json.string_bounds');

const schema = {
  type: 'object', additionalProperties: false, required: ['nested'],
  properties: { nested: { $ref: '#/$defs/nested' } },
  $defs: { nested: { type: 'object', additionalProperties: false, required: ['count'], properties: { count: { type: 'integer', minimum: 1 } } } },
};
assert.deepEqual(validateJsonSchema({ nested: { count: 1 } }, schema), { nested: { count: 1 } });
assert.throws(() => validateJsonSchema({ nested: { count: 1, extra: true } }, schema), (error) => error.code === 'schema.additional_property');
assert.throws(() => validateJsonSchema({ nested: { count: '1' } }, schema), (error) => error.code === 'schema.type');
assert.throws(() => validateJsonSchema({ nested: {} }, schema), (error) => error.code === 'schema.required');
assert.throws(() => validateJsonSchema({ nested: { count: 1 } }, { ...schema, properties: { nested: { $ref: '#/$defs/missing' } } }), (error) => error.code === 'schema.ref');
assert.throws(() => validateJsonSchema({}, { type: 'object', decorativeAssertion: true }), (error) => error.code === 'schema.keyword');

const manifestSchema = readStrictJson(join(root, '.codex/verification/design-parity/application-artifact-manifest.schema.json'));
const manifest = {
  version: 1,
  schema: 'design-parity-application-artifact-manifest-v1',
  rowId: 'home-default-light',
  intendedSourceCommit: 'a'.repeat(40),
  builtFromCommit: 'a'.repeat(40),
  artifact: {
    path: '.codex/verification/evidence/application-artifact/artifacts/application.exe',
    sha256: 'b'.repeat(64),
    bytes: 1,
    package: { identity: 'open-design-packaged-app', version: '0.20.300', architecture: 'x64' },
  },
  provenance: { path: '.codex/verification/evidence/application-artifact/provenance/build-provenance.json', sha256: 'c'.repeat(64) },
};
assert.deepEqual(validateJsonSchema(manifest, manifestSchema), manifest);
const unknownManifestField = structuredClone(manifest); unknownManifestField.artifact.package.extra = true;
assert.throws(() => validateJsonSchema(unknownManifestField, manifestSchema), (error) => error.code === 'schema.additional_property');
assert.throws(() => parseStrictJson('{"version":1,"version":2}', 'manifest duplicate'), (error) => error.code === 'json.duplicate_key');

const fixtureRoot = mkdtempSync(join(tmpdir(), 'design-parity-reparse-'));
try {
  const target = join(fixtureRoot, 'target');
  const redirected = join(fixtureRoot, 'redirected');
  mkdirSync(target);
  writeFileSync(join(target, 'reference.html'), 'pinned fixture', 'utf8');
  const sha256 = createHash('sha256').update('pinned fixture').digest('hex');
  assert.equal(resolvePinnedParityFile(fixtureRoot, 'target/reference.html', sha256, { code: 'fixture.regular' }).sha256, sha256);
  symlinkSync(target, redirected, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => resolvePinnedParityFile(fixtureRoot, 'redirected/reference.html', sha256, { code: 'fixture.reparse' }), (error) => error.code === 'fixture.reparse.reparse');
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}

function hasActiveBoundary(source, importPattern, callPattern) {
  return importPattern.test(source) && callPattern.test(source);
}
const sources = {
  launcher: readFileSync(new URL('../tools/design-reference-app/main.mjs', import.meta.url), 'utf8'),
  contract: readFileSync(new URL('../tools/design-reference-app/parity-route-contract.mjs', import.meta.url), 'utf8'),
  verifier: readFileSync(new URL('./verify-design-parity.mjs', import.meta.url), 'utf8'),
};
const launcherImport = /^import \{ loadAndPinParityRegistries \} from '\.\.\/\.\.\/scripts\/design-parity-production\.mjs';$/m;
const launcherCall = /^const \{ routes, inventory, pinnedReference \} = loadAndPinParityRegistries\(repositoryRoot\);$/m;
assert.equal(hasActiveBoundary(sources.launcher, launcherImport, launcherCall), true);
assert.equal(hasActiveBoundary(sources.launcher.replace('import { loadAndPinParityRegistries }', '// import { loadAndPinParityRegistries }'), launcherImport, launcherCall), false);
assert.equal(hasActiveBoundary(sources.launcher.replace('loadAndPinParityRegistries(repositoryRoot)', 'loadAndPinParityRegistriesDetached(repositoryRoot)'), launcherImport, launcherCall), false);
assert.match(sources.contract, /^\s*loadValidatedParityRegistries,$/m);
assert.match(sources.verifier, /^const loadedParity = loadAndPinParityRegistries\(root\);$/m);
assert.doesNotMatch(sources.launcher, /JSON\.parse\s*\(/);
assert.doesNotMatch(sources.contract, /JSON\.parse\s*\(/);

process.stdout.write(JSON.stringify({ ok: true, rows: 10, presentations: 6, pinnedInputs: 8, strictJsonNegatives: 6, schemaNegatives: 6, manifestSchemaPositive: true, reparseNegative: 1, sourceBoundaryNegatives: 2 }) + '\n');

#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { readStrictJson } from './strict-json.mjs';
import {
  assertNoPathIndirection,
  loadAndPinParityRegistries,
  pinCanonicalParityReferenceGraph,
} from './design-parity-production.mjs';
import { validatePng } from './design-parity-png.mjs';
import {
  validateApplicationArtifactEvidence,
  validateApplicationArtifactManifest,
  validateDesignParityReceipt,
} from './design-parity-evidence-contract.mjs';

const root = resolve(import.meta.dirname, '..');
const structureOnly = process.argv.includes('--structure');
const negative = process.argv.includes('--negative');
const intendedSourceArguments = process.argv.reduce((values, value, index, argv) => value === '--intended-source' ? [...values, argv[index + 1]] : values, []);
const readJson = (path) => readStrictJson(path);
const hash = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const clone = (value) => structuredClone(value);
const fail = (code, message) => { const error = new Error(`${code}: ${message}`); error.code = code; throw error; };
const requireValue = (condition, code, message) => { if (!condition) fail(code, message); };
const sha256 = /^[0-9a-f]{64}$/;
const commit = /^[0-9a-f]{40}$/;
const expectedIds = [
  'home-default-light',
  'projects-default-light',
  'design-systems-default-light',
  'automations-default-light',
  'plugins-default-light',
  'integrations-default-light',
  'studio-default-light',
  'library-default-light',
  'settings-appearance-light',
  'handoff-default-light',
];
const tupleKeys = ['screen', 'state', 'theme', 'viewport', 'scale', 'locale', 'fixtureRevision', 'time', 'motion', 'randomSeed', 'fonts', 'network'];
const queryKeys = ['state', 'theme', 'width', 'height', 'scale', 'locale', 'fixture', 'time', 'motion', 'random', 'fonts', 'network'];
const targetKeys = ['referenceRaw', 'referenceReceipt', 'applicationRaw', 'applicationReceipt', 'applicationArtifactManifest', 'comparison', 'diff'];
const expectedPresentationIds = ['light-normal-100', 'light-normal-125', 'light-normal-150', 'light-normal-200', 'dark-normal-100', 'light-narrow-bilingual-100'];
const expectedBrowserPaths = ['/', '/projects', '/design-systems', '/automations', '/plugins', '/integrations', '/studio', '/library', '/settings/appearance', '/handoff'];
const expectedRouteIdentityFields = ['surfaceId', 'featureId', 'routeId', 'presentationId', 'bindingId', 'screen', 'state', 'theme', 'locale', 'viewportWidth', 'viewportHeight', 'displayScale', 'fixtureRevision', 'frozenTime', 'motion', 'randomSeed', 'bundledFontRevision', 'network', 'headlessRoute', 'rendererWitness', 'captureSettledWitness'];
const newIntegrityRegressions = ['schema.recursive_validation', 'reference.dependencies', 'reference.reparse', 'route.reference_observation', 'witness.deep_freeze', 'witness.post_settle', 'png.critical_chunk', 'png.palette_transparency', 'png.inflate_bounds', 'source.production_helpers'];
const newProvenanceRegressions = ['artifact.manifest_target', 'artifact.intended_source', 'artifact.git_object', 'artifact.reviewed_commit', 'artifact.source_commit', 'artifact.row_source_commit', 'artifact.manifest', 'artifact.path', 'artifact.hash', 'artifact.bytes', 'artifact.provenance', 'artifact.expected_binding', 'artifact.package_identity', 'artifact.build_log_missing', 'artifact.build_log_hash', 'artifact.build_log_bytes', 'artifact.build_log_path', 'artifact.build_log_reparse', 'receipt.build_log_binding'];
const p1NegativeRegressions = ['evidence.referenceReceipt.target', 'evidence.applicationReceipt.target', 'matrix.variant_missing', 'matrix.pair_duplicate', 'matrix.tuple_drift', 'matrix.route_drift', 'matrix.base_only_coverage', 'receipt.cross_binding'];
const expectedNegativeRegressions = ['inventory.row_ids', 'route.registry_ids', 'route.duplicate_path', 'route.commented_registration', 'route.detached_registration', 'reference.file_missing', 'reference.hash_stale', 'route.reference_tuple', 'route.application_tuple', 'tuple.nondeterministic_source', 'capture.network_policy', 'audit.control_audit', 'evidence.referenceRaw.target', 'evidence.applicationRaw.target', 'evidence.applicationArtifactManifest.target', 'evidence.comparison.target', 'evidence.diff.target', 'evidence.hash', 'evidence.inspection', 'deviation.reason', 'deviation.approval', ...newIntegrityRegressions, ...newProvenanceRegressions, ...p1NegativeRegressions];
const expectedInventoryNegativeRegressions = ['inventory.row_ids', 'route.registry_ids', 'route.duplicate_path', 'route.commented_registration', 'route.detached_registration', 'reference.file_missing', 'reference.hash_stale', 'route.reference_tuple', 'route.application_tuple', ...tupleKeys.map((key) => `tuple.${key}.missing`), 'tuple.nondeterministic_source', 'audit.target', 'audit.control_audit', 'evidence.referenceRaw.target', 'evidence.applicationRaw.target', 'evidence.applicationArtifactManifest.target', 'evidence.comparison.target', 'evidence.diff.target', 'evidence.hash', 'evidence.inspection', 'deviation.reason', 'deviation.approval', 'capture.network_policy', ...newIntegrityRegressions, ...newProvenanceRegressions, ...p1NegativeRegressions];
const canonicalReferencePath = 'mockups/open-design-m3/Open Design M3.dc.html';
const applicationArtifactManifestSchemaPath = '.codex/verification/design-parity/application-artifact-manifest.schema.json';

function resolveIntendedSourceCommit() {
  requireValue(intendedSourceArguments.length === 1 && commit.test(intendedSourceArguments[0] ?? ''), 'artifact.intended_source', 'full evidence verification requires exactly one --intended-source <40-character commit SHA>');
  const intended = intendedSourceArguments[0];
  let resolvedCommit;
  let reviewedCommit;
  try {
    resolvedCommit = execFileSync('git', ['rev-parse', '--verify', `${intended}^{commit}`], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
    reviewedCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
  } catch (error) {
    fail('artifact.git_object', `intended source is not a resolvable Git commit object: ${error.message}`);
  }
  requireValue(resolvedCommit === intended, 'artifact.git_object', 'intended source does not resolve to that exact Git commit object');
  requireValue(reviewedCommit === intended, 'artifact.reviewed_commit', 'intended source differs from the checked-out reviewed commit');
  return intended;
}

function tupleFromRoute(route, expectedProtocol) {
  let url;
  try { url = new URL(route); } catch { fail('route.invalid_url', `invalid route: ${route}`); }
  requireValue(url.protocol === expectedProtocol, 'route.protocol', `${route} must use ${expectedProtocol}`);
  const actualKeys = [...url.searchParams.keys()];
  requireValue(JSON.stringify(actualKeys) === JSON.stringify(queryKeys), 'route.query_keys', `${route} has missing, extra, or reordered query keys`);
  return {
    screen: url.hostname,
    state: url.searchParams.get('state'),
    theme: url.searchParams.get('theme'),
    viewport: { width: Number(url.searchParams.get('width')), height: Number(url.searchParams.get('height')) },
    scale: Number(url.searchParams.get('scale')),
    locale: url.searchParams.get('locale'),
    fixtureRevision: url.searchParams.get('fixture'),
    time: url.searchParams.get('time'),
    motion: url.searchParams.get('motion'),
    randomSeed: Number(url.searchParams.get('random')),
    fonts: url.searchParams.get('fonts'),
    network: url.searchParams.get('network'),
  };
}

function buildRouteForVerifier(protocol, tuple) {
  const url = new URL(`${protocol}//${tuple.screen}`);
  for (const [key, value] of [
    ['state', tuple.state], ['theme', tuple.theme], ['width', tuple.viewport.width],
    ['height', tuple.viewport.height], ['scale', tuple.scale], ['locale', tuple.locale],
    ['fixture', tuple.fixtureRevision], ['time', tuple.time], ['motion', tuple.motion],
    ['random', tuple.randomSeed], ['fonts', tuple.fonts], ['network', tuple.network],
  ]) url.searchParams.set(key, String(value));
  return url.href;
}

function requireRelativeContainedPath(path, code) {
  requireValue(typeof path === 'string' && path.length > 0, code, 'path is missing');
  requireValue(!path.startsWith('/') && !path.startsWith('\\') && !/^[A-Za-z]:/.test(path), code, `path must be repository-relative: ${path}`);
  const resolved = resolve(root, path);
  requireValue(resolved.startsWith(`${root}\\`) || resolved.startsWith(`${root}/`), code, `path escapes repository root: ${path}`);
  assertNoPathIndirection(resolved, { code: 'path.reparse_escape', requireExists: false });
  return resolved;
}

function pngDimensions(path, code) {
  const result = validatePng(readFileSync(path), { code });
  requireValue(result.nonblank, `${code}.blank`, `${path} decodes to blank pixels`);
  return { width: result.width, height: result.height };
}

function requireKnownKeys(value, allowed, code) {
  requireValue(value && typeof value === 'object' && !Array.isArray(value), code, 'object is missing');
  for (const key of Object.keys(value)) requireValue(allowed.includes(key), code, `unknown field ${key}`);
}

function validateApplicationArtifactManifestSchema() {
  const path = requireRelativeContainedPath(applicationArtifactManifestSchemaPath, 'artifact.schema_path');
  requireValue(existsSync(path) && statSync(path).isFile(), 'artifact.schema_missing', 'application artifact manifest schema is missing');
  const schema = readStrictJson(path);
  const source = '0'.repeat(40);
  validateApplicationArtifactManifest({
    version: 1,
    schema: 'design-parity-application-artifact-manifest-v1',
    rowId: expectedIds[0],
    presentationId: expectedPresentationIds[0],
    bindingId: `${expectedIds[0]}--${expectedPresentationIds[0]}`,
    intendedSourceCommit: source,
    builtFromCommit: source,
    artifact: {
      path: '.codex/verification/evidence/application-artifact/artifacts/application.exe',
      sha256: '0'.repeat(64),
      bytes: 1,
      package: { identity: 'open-design-packaged-app', version: '0.0.1', architecture: 'x64' },
    },
    provenance: { path: '.codex/verification/evidence/application-artifact/provenance/build-provenance.json', sha256: '0'.repeat(64) },
  }, schema, { rowId: expectedIds[0], presentationId: expectedPresentationIds[0], bindingId: `${expectedIds[0]}--${expectedPresentationIds[0]}`, rowSourceCommit: source, intendedSourceCommit: source });
  return schema;
}

function validateAudit(row, presentation) {
  requireValue(presentation.auditStatus === 'verified', 'audit.pending', `${presentation.bindingId} auditStatus is not verified`);
  requireValue(presentation.audit && sha256.test(presentation.audit.sha256), 'audit.hash_missing', `${presentation.bindingId} audit hash is missing`);
  const path = requireRelativeContainedPath(presentation.audit.path, 'audit.path_missing');
  requireValue(existsSync(path) && statSync(path).isFile(), 'audit.file_missing', `${presentation.bindingId} audit file is missing`);
  requireValue(hash(path) === presentation.audit.sha256, 'audit.hash_stale', `${presentation.bindingId} audit hash is stale`);
  const audit = readJson(path);
  requireValue(audit.version === 1 && audit.rowId === row.id && audit.presentationId === presentation.presentationId && audit.bindingId === presentation.bindingId && JSON.stringify(audit.tuple) === JSON.stringify(presentation.tuple), 'audit.schema', `${presentation.bindingId} audit schema or tuple is invalid`);
  requireValue(Array.isArray(audit.controls) && audit.controls.length > 0, 'audit.controls_missing', `${presentation.bindingId} has no per-control audit`);
  const ids = new Set();
  for (const control of audit.controls) {
    requireValue(typeof control.id === 'string' && control.id.length > 0 && !ids.has(control.id), 'audit.control_id', `${presentation.bindingId} control id is missing or duplicated`);
    ids.add(control.id);
    requireValue(typeof control.primitive === 'string' && typeof control.region === 'string' && typeof control.locator === 'string', 'audit.control_anatomy', `${row.id}/${control.id} anatomy is incomplete`);
    requireValue(['conforming', 'defect', 'intentional-deviation'].includes(control.status), 'audit.control_status', `${row.id}/${control.id} status is invalid`);
    requireValue(typeof control.note === 'string' && control.note.trim().length > 0, 'audit.control_note', `${row.id}/${control.id} note is missing`);
    if (control.status === 'intentional-deviation') requireValue(row.deviations.some((item) => item.id === control.deviationId && item.approved === true), 'audit.deviation_link', `${row.id}/${control.id} deviation is not approved`);
  }
}

function validateEvidence(row, presentation, routePresentation, pinnedReference, applicationContract, intendedSourceCommit, manifestSchema) {
  requireValue(presentation.captureStatus === 'verified', 'evidence.pending', `${presentation.bindingId} captureStatus is not verified`);
  requireValue(presentation.matrixStatus === 'verified', 'matrix.pending', `${presentation.bindingId} matrixStatus is not verified`);
  requireValue(typeof presentation.sourceCommit === 'string' && commit.test(presentation.sourceCommit) && presentation.sourceCommit === intendedSourceCommit, 'evidence.source_commit', `${presentation.bindingId} sourceCommit is missing, stale, or differs from the explicit intended source`);
  requireValue(presentation.evidence && typeof presentation.evidence === 'object', 'evidence.record_missing', `${presentation.bindingId} evidence record is missing`);
  for (const key of targetKeys) {
    const item = presentation.evidence[key];
    requireValue(item && item.path === presentation.evidenceTargets[key] && sha256.test(item.sha256), `evidence.${key}.metadata`, `${presentation.bindingId} ${key} path/hash is missing`);
    const path = requireRelativeContainedPath(item.path, `evidence.${key}.path`);
    requireValue(existsSync(path) && statSync(path).isFile() && statSync(path).size > 0, `evidence.${key}.missing`, `${row.id} ${key} file is missing`);
    requireValue(hash(path) === item.sha256, `evidence.${key}.stale`, `${row.id} ${key} hash is stale`);
  }
  const artifactBinding = validateApplicationArtifactEvidence(root, {
    schema: manifestSchema,
    manifestPath: presentation.evidence.applicationArtifactManifest.path,
    manifestSha256: presentation.evidence.applicationArtifactManifest.sha256,
    rowId: row.id,
    presentationId: presentation.presentationId,
    bindingId: presentation.bindingId,
    rowSourceCommit: presentation.sourceCommit,
    intendedSourceCommit,
  });
  for (const side of ['reference', 'application']) {
    const raw = resolve(root, presentation.evidence[`${side}Raw`].path);
    const receipt = readJson(resolve(root, presentation.evidence[`${side}Receipt`].path));
    const dimensions = pngDimensions(raw, `evidence.${side}.png`);
    const fixture = side === 'reference' ? pinnedReference.reference : applicationContract.fixture;
    requireValue(fixture && typeof fixture.path === 'string' && sha256.test(fixture.sha256), `evidence.${side}.fixture`, `${row.id} ${side} exact fixture path/hash is not declared`);
    const artifact = side === 'reference' ? {
      path: pinnedReference.reference.path,
      sha256: pinnedReference.reference.sha256,
      bytes: statSync(pinnedReference.reference.absolutePath).size,
    } : artifactBinding.artifact;
    validateDesignParityReceipt(receipt, {
      side,
      rowId: row.id,
      presentationId: presentation.presentationId,
      bindingId: presentation.bindingId,
      intendedSourceCommit,
      sourceCommit: intendedSourceCommit,
      route: presentation[`${side === 'reference' ? 'reference' : 'application'}Route`],
      routePath: routePresentation.browserPath,
      tuple: presentation.tuple,
      pngSha256: presentation.evidence[`${side}Raw`].sha256,
      dimensions,
      rawPath: presentation.evidence[`${side}Raw`].path,
      fixtureSource: side === 'reference' ? 'checked-in-reference' : 'packaged-application-fixture',
      fixturePath: fixture.path,
      fixtureSha256: fixture.sha256,
      artifactPath: artifact.path,
      artifactSha256: artifact.sha256,
      artifactBytes: artifact.bytes,
      ...(side === 'application' ? {
        artifactManifestPath: artifactBinding.manifest.path,
        artifactManifestSha256: artifactBinding.manifest.sha256,
        provenancePath: artifactBinding.provenance.path,
        provenanceSha256: artifactBinding.provenance.sha256,
        packageIdentity: artifactBinding.package.identity,
        packageVersion: artifactBinding.package.version,
        packageArchitecture: artifactBinding.package.architecture,
        buildLogPath: artifactBinding.buildLog.path,
        buildLogSha256: artifactBinding.buildLog.sha256,
        buildLogBytes: artifactBinding.buildLog.bytes,
      } : {}),
    });
  }
  const diff = readJson(resolve(root, presentation.evidence.diff.path));
  requireValue(diff.version === 1 && diff.rowId === row.id && diff.presentationId === presentation.presentationId && diff.bindingId === presentation.bindingId && JSON.stringify(diff.tuple) === JSON.stringify(presentation.tuple), 'diff.tuple', `${presentation.bindingId} diff tuple is invalid`);
  requireValue(diff.inputs?.referenceSha256 === presentation.evidence.referenceRaw.sha256 && diff.inputs?.applicationSha256 === presentation.evidence.applicationRaw.sha256, 'diff.inputs', `${presentation.bindingId} diff inputs are stale`);
  requireValue(diff.dimensions && diff.metrics && diff.tool?.name && diff.tool?.version && diff.review?.status, 'diff.provenance', `${presentation.bindingId} diff metrics/provenance/review are incomplete`);
}

function expectedPresentationTuple(row, variant) {
  return {
    ...row.tuple,
    theme: variant.theme,
    viewport: { width: variant.viewport.width, height: variant.viewport.height },
    scale: variant.scale,
    locale: variant.locale,
  };
}

function expectedPresentationTargets(rowId, presentationId) {
  const presentationRoot = `.codex/verification/evidence/${rowId}/${presentationId}`;
  return {
    referenceRaw: `${presentationRoot}/reference.png`,
    referenceReceipt: `${presentationRoot}/reference.receipt.json`,
    applicationRaw: `${presentationRoot}/application.png`,
    applicationReceipt: `${presentationRoot}/application.receipt.json`,
    applicationArtifactManifest: `${presentationRoot}/application.artifact-manifest.json`,
    comparison: `${presentationRoot}/comparison.svg`,
    diff: `${presentationRoot}/diff.json`,
  };
}

function validate(inventory, routes, readiness, intendedSourceCommit = null) {
  requireKnownKeys(inventory, ['version', 'reference', 'defaults', 'requiredCaptureVariants', 'routeIdentity', 'auditContract', 'evidenceContract', 'negativeRegressions', 'rows'], 'inventory.unknown_field');
  requireKnownKeys(routes, ['version', 'reference', 'referenceImplementation', 'applicationImplementation', 'negativeRegressions', 'routes'], 'routes.unknown_field');
  requireValue(inventory.reference.path === canonicalReferencePath && routes.reference === canonicalReferencePath, 'reference.path', 'reference path must be the pinned canonical path in both registries');
  requireValue(inventory.version === 2 && routes.version === 2, 'schema.version', 'inventory and route versions must be 2');
  requireValue(inventory.reference?.path === routes.reference, 'reference.path', 'reference path disagrees with route registry');
  const referencePathBeforePin = requireRelativeContainedPath(inventory.reference.path, 'reference.path');
  requireValue(existsSync(referencePathBeforePin), 'reference.file_missing', 'reference file is missing');
  requireValue(sha256.test(inventory.reference.sha256) && hash(referencePathBeforePin) === inventory.reference.sha256, 'reference.hash_stale', 'reference hash is stale');
  const pinnedReference = pinCanonicalParityReferenceGraph(root, inventory, routes);
  const referencePath = pinnedReference.reference.absolutePath;
  requireValue(existsSync(referencePath), 'reference.file_missing', 'reference file is missing');
  requireValue(sha256.test(inventory.reference.authoritativeArchiveSha256), 'reference.archive_hash', 'authoritative archive hash is missing');
  requireValue(routes.referenceImplementation?.status === 'implemented', 'route.reference_implementation', 'reference implementation is missing');
  const referenceEntry = requireRelativeContainedPath(routes.referenceImplementation.entry, 'route.reference_entry');
  requireValue(existsSync(referenceEntry), 'route.reference_entry', 'reference implementation entry is missing');
  const referenceSource = readFileSync(referenceEntry, 'utf8');
  requireValue(!/\bMath\.random\s*\(\)/.test(referenceSource) && !/\bDate\.now\s*\(\)/.test(referenceSource) && !/new\s+Date\s*\(\s*\)/.test(referenceSource), 'tuple.nondeterministic_source', 'reference implementation contains an unbound clock or random draw');
  requireValue(routes.applicationImplementation?.status === 'implemented' || (routes.applicationImplementation?.status === 'unimplemented' && typeof routes.applicationImplementation.reason === 'string' && routes.applicationImplementation.reason.length > 0), 'route.application_implementation_shape', 'application implementation status/reason is invalid');
  const contract = routes.applicationImplementation?.contract;
  requireValue(contract?.version === 1 && contract.status === 'implemented' && typeof contract.module === 'string' && contract.module.length > 0, 'route.contract', 'application route contract metadata is missing');
  requireValue(JSON.stringify(contract.routeIds) === JSON.stringify(expectedIds), 'route.contract_ids', 'application route contract ids are not the exact ten rows');
  requireValue(JSON.stringify(contract.presentations) === JSON.stringify(['light-normal-100', 'light-normal-125', 'light-normal-150', 'light-normal-200', 'dark-normal-100', 'light-narrow-bilingual-100']), 'route.contract_presentations', 'application route contract must cover all six presentations');
  requireValue(contract.networkPolicy === 'disabled' && contract.blockedRequestPolicy === 'fail' && contract.headlessRoute === 'cheap-lowlevel-headless' && typeof contract.mountPrerequisite === 'string' && contract.mountPrerequisite.length > 0, 'route.contract_capture_policy', 'application route contract capture policy or mount prerequisite is missing');
  requireValue(Array.isArray(inventory.routeIdentity?.fields) && JSON.stringify(inventory.routeIdentity.fields) === JSON.stringify(expectedRouteIdentityFields), 'route.identity_fields', 'route identity fields are missing, reordered, or incomplete');
  requireValue(inventory.routeIdentity.version === 1 && inventory.routeIdentity.surfaceId === 'desktop-application' && inventory.routeIdentity.headlessRoute === 'cheap-lowlevel-headless' && inventory.routeIdentity.networkPolicy === 'disabled' && inventory.routeIdentity.blockedRequestPolicy === 'fail', 'route.identity_policy', 'route identity capture policy is invalid');
  requireValue(JSON.stringify(routes.negativeRegressions) === JSON.stringify(expectedNegativeRegressions), 'negative.registry', 'route negative regression registry is missing or drifted');
  requireValue(JSON.stringify(inventory.negativeRegressions) === JSON.stringify(expectedInventoryNegativeRegressions), 'negative.inventory_registry', 'inventory negative regression registry is missing or drifted');
  requireValue(inventory.auditContract?.controlAuditRequired === true && JSON.stringify(inventory.auditContract.requiredFields) === JSON.stringify(['id', 'primitive', 'region', 'locator', 'status', 'note']) && JSON.stringify(inventory.auditContract.statuses) === JSON.stringify(['conforming', 'defect', 'intentional-deviation']), 'audit.control_requirements', 'hand-written per-control audit requirements are missing');
  requireValue(inventory.evidenceContract?.captureEvidenceRequired === true && Array.isArray(inventory.evidenceContract.requiredTargets), 'evidence.contract', 'hand-written capture requirements are missing');
  requireValue(JSON.stringify(inventory.evidenceContract.requiredTargets) === JSON.stringify(targetKeys), 'evidence.hash', 'hand-written evidence target and hash requirements are missing');
  requireValue(JSON.stringify(inventory.evidenceContract.requiredInspectionFields) === JSON.stringify(['originalOpened', 'semanticStateConfirmed', 'clippingChecked', 'visualDefectIds']), 'evidence.inspection', 'hand-written image inspection requirements are missing');
  const manifestSchema = validateApplicationArtifactManifestSchema();
  if (readiness) {
    requireValue(typeof intendedSourceCommit === 'string' && commit.test(intendedSourceCommit), 'artifact.intended_source', 'explicit intended source commit is missing');
    requireValue(routes.applicationImplementation.status === 'implemented', 'route.application_implementation', routes.applicationImplementation.reason);
  }

  requireValue(JSON.stringify(routes.routes.map((item) => item.id)) === JSON.stringify(expectedIds), 'route.registry_ids', 'route registry must contain the exact ten stable IDs in order');
  requireValue(JSON.stringify(inventory.rows.map((item) => item.id)) === JSON.stringify(expectedIds), 'inventory.row_ids', 'inventory must contain the exact ten stable IDs in order');
  requireValue(JSON.stringify(inventory.requiredCaptureVariants.map((item) => item.id)) === JSON.stringify(expectedPresentationIds), 'matrix.variant_ids', 'required presentation ids are missing, duplicated, extra, or reordered');
  if (inventory.rows.every((row) => row.presentations?.length === 1) && routes.routes.every((route) => route.presentations?.length === 1)) fail('matrix.base_only_coverage', 'the registry covers only the ten base tuples instead of all 60 row-presentation pairs');
  const targets = new Set();
  const browserPaths = new Set();
  const bindingIds = new Set();
  for (let index = 0; index < inventory.rows.length; index += 1) {
    const row = inventory.rows[index];
    const route = routes.routes[index];
    requireKnownKeys(row, ['id', 'tuple', 'referenceRoute', 'applicationRoute', 'auditTarget', 'auditStatus', 'evidenceTargets', 'captureStatus', 'matrixStatus', 'deviations', 'presentations', 'sourceCommit', 'audit', 'evidence'], 'inventory.row_unknown_field');
    requireKnownKeys(route, ['id', 'screen', 'state', 'browserPath', 'referenceSteps', 'referenceObservation', 'identity', 'capture', 'presentations'], 'routes.route_unknown_field');
    for (const key of tupleKeys) requireValue(Object.hasOwn(row.tuple ?? {}, key), `tuple.${key}.missing`, `${row.id} tuple is missing ${key}`);
    requireValue(route.id === row.id && route.screen === row.tuple.screen && route.state === row.tuple.state, 'route.row_mapping', `${row.id} registry mapping is mismatched`);
    requireValue(!browserPaths.has(route.browserPath), 'route.duplicate_path', `${row.id} browser path is duplicated`);
    browserPaths.add(route.browserPath);
    requireValue(route.browserPath === expectedBrowserPaths[index], 'route.browser_path', `${row.id} browser path is missing or mismatched`);
    requireValue(route.identity?.surfaceId === 'desktop-application' && route.identity.featureId === row.id && route.identity.routeId === row.id, 'route.identity', `${row.id} route identity is missing or mismatched`);
    requireValue(route.capture?.headlessRoute === 'cheap-lowlevel-headless' && route.capture.network === 'disabled' && route.capture.blockedRequestPolicy === 'fail' && route.capture.rendererWitnessRequired === true && route.capture.captureSettledWitnessRequired === true, 'capture.network_policy', `${row.id} capture isolation policy is incomplete`);
    requireValue(Array.isArray(route.referenceSteps) && route.referenceSteps.every((step) => ['text-exact', 'aria-label-exact'].includes(step.match) && typeof step.value === 'string' && step.value.length > 0), 'route.reference_steps', `${row.id} reference steps are invalid`);
    requireValue(route.referenceObservation?.selector === 'main > header h1' && typeof route.referenceObservation?.text === 'string' && route.referenceObservation.text.length > 0, 'route.reference_observation', `${row.id} renderer observation is missing`);
    requireValue(Number.isInteger(row.tuple.viewport?.width) && row.tuple.viewport.width > 0 && Number.isInteger(row.tuple.viewport?.height) && row.tuple.viewport.height > 0, 'tuple.viewport.invalid', `${row.id} viewport is invalid`);
    requireValue(Number.isFinite(row.tuple.scale) && row.tuple.scale > 0 && Number.isSafeInteger(row.tuple.randomSeed), 'tuple.numeric.invalid', `${row.id} scale/random seed is invalid`);
    requireValue(!Number.isNaN(Date.parse(row.tuple.time)) && row.tuple.motion === 'frozen' && row.tuple.network === 'disabled', 'tuple.determinism.invalid', `${row.id} deterministic policies are invalid`);
    requireValue(JSON.stringify(tupleFromRoute(row.referenceRoute, 'design-reference:')) === JSON.stringify(row.tuple), 'route.reference_tuple', `${row.id} reference route tuple is mismatched`);
    requireValue(JSON.stringify(tupleFromRoute(row.applicationRoute, 'material-designer:')) === JSON.stringify(row.tuple), 'route.application_tuple', `${row.id} application route tuple is mismatched`);
    requireRelativeContainedPath(row.auditTarget, 'audit.target');
    requireValue(['pending', 'verified'].includes(row.auditStatus), 'audit.status', `${row.id} audit status is invalid`);
    requireValue(['pending', 'verified'].includes(row.captureStatus) && ['pending', 'verified'].includes(row.matrixStatus), 'evidence.status', `${row.id} capture/matrix status is invalid`);
    for (const key of targetKeys) {
      const target = row.evidenceTargets?.[key];
      requireRelativeContainedPath(target, `evidence.${key}.target`);
      requireValue(!targets.has(target), 'evidence.target_duplicate', `${target} is reused across rows`);
      if (key === 'applicationArtifactManifest') requireValue(target === `.codex/verification/evidence/${row.id}/application.artifact-manifest.json`, 'artifact.manifest_target', `${row.id} application artifact manifest target is not canonical`);
      targets.add(target);
    }
    for (const deviation of row.deviations ?? []) {
      requireValue(typeof deviation.id === 'string' && deviation.id.length > 0, 'deviation.id', `${row.id} deviation id is missing`);
      requireValue(typeof deviation.reason === 'string' && deviation.reason.trim().length > 0, 'deviation.reason', `${row.id} deviation reason is missing`);
      requireValue(deviation.approved === true && typeof deviation.approvedBy === 'string' && deviation.approvedBy.length > 0, 'deviation.approval', `${row.id} deviation approval is missing`);
    }
    requireValue(JSON.stringify(row.presentations?.map((presentation) => presentation.presentationId)) === JSON.stringify(expectedPresentationIds), 'matrix.variant_missing', `${row.id} does not declare the exact six presentation bindings`);
    requireValue(JSON.stringify(route.presentations?.map((presentation) => presentation.presentationId)) === JSON.stringify(expectedPresentationIds), 'matrix.variant_missing', `${row.id} does not declare the exact six presentation routes`);
    for (let presentationIndex = 0; presentationIndex < expectedPresentationIds.length; presentationIndex += 1) {
      const variant = inventory.requiredCaptureVariants[presentationIndex];
      const presentation = row.presentations[presentationIndex];
      const routePresentation = route.presentations[presentationIndex];
      const presentationId = expectedPresentationIds[presentationIndex];
      const bindingId = `${row.id}--${presentationId}`;
      requireKnownKeys(presentation, ['bindingId', 'rowId', 'presentationId', 'tuple', 'referenceRoute', 'applicationRoute', 'auditTarget', 'auditStatus', 'evidenceTargets', 'captureStatus', 'matrixStatus', 'deviations', 'sourceCommit', 'audit', 'evidence'], 'inventory.presentation_unknown_field');
      requireKnownKeys(routePresentation, ['bindingId', 'rowId', 'presentationId', 'tuple', 'referenceRoute', 'applicationRoute', 'browserPath', 'identity'], 'routes.presentation_unknown_field');
      requireValue(presentation.bindingId === bindingId && routePresentation.bindingId === bindingId && presentation.rowId === row.id && routePresentation.rowId === row.id, 'matrix.pair_duplicate', `${bindingId} pair identity is mismatched`);
      requireValue(!bindingIds.has(bindingId), 'matrix.pair_duplicate', `${bindingId} is duplicated`);
      bindingIds.add(bindingId);
      const expectedTuple = expectedPresentationTuple(row, variant);
      requireValue(JSON.stringify(presentation.tuple) === JSON.stringify(expectedTuple) && JSON.stringify(routePresentation.tuple) === JSON.stringify(expectedTuple), 'matrix.tuple_drift', `${bindingId} tuple differs from the required presentation`);
      const expectedReferenceRoute = buildRouteForVerifier('design-reference:', expectedTuple);
      const expectedApplicationRoute = buildRouteForVerifier('material-designer:', expectedTuple);
      requireValue(presentation.referenceRoute === expectedReferenceRoute && presentation.applicationRoute === expectedApplicationRoute
        && routePresentation.referenceRoute === expectedReferenceRoute && routePresentation.applicationRoute === expectedApplicationRoute
        && routePresentation.browserPath === route.browserPath, 'matrix.route_drift', `${bindingId} route differs from the exact row-presentation tuple`);
      requireValue(routePresentation.identity?.surfaceId === 'desktop-application' && routePresentation.identity.featureId === row.id
        && routePresentation.identity.routeId === row.id && routePresentation.identity.presentationId === presentationId
        && routePresentation.identity.bindingId === bindingId, 'matrix.route_drift', `${bindingId} route identity is cross-bound`);
      if (presentationIndex === 0) requireValue(JSON.stringify(presentation.tuple) === JSON.stringify(row.tuple)
        && presentation.referenceRoute === row.referenceRoute && presentation.applicationRoute === row.applicationRoute, 'matrix.base_only_coverage', `${row.id} base identity does not match its light-normal-100 presentation`);
      requireValue(presentation.auditTarget === `.codex/verification/design-parity/audits/${row.id}/${presentationId}.json`, 'audit.target', `${bindingId} audit target is not canonical`);
      requireRelativeContainedPath(presentation.auditTarget, 'audit.target');
      requireValue(presentation.auditStatus === 'pending' && presentation.captureStatus === 'pending' && presentation.matrixStatus === 'pending', 'evidence.status', `${bindingId} must remain pending until exact evidence exists`);
      const expectedTargets = expectedPresentationTargets(row.id, presentationId);
      for (const key of targetKeys) {
        const target = presentation.evidenceTargets?.[key];
        requireRelativeContainedPath(target, `evidence.${key}.target`);
        requireValue(target === expectedTargets[key], `evidence.${key}.target`, `${bindingId} ${key} target is not canonical`);
        requireValue(!targets.has(target), 'evidence.target_duplicate', `${target} is reused across base rows or presentation bindings`);
        targets.add(target);
      }
      if (readiness) {
        validateAudit(row, presentation);
        validateEvidence(row, presentation, routePresentation, pinnedReference, contract, intendedSourceCommit, manifestSchema);
      }
    }
  }
  requireValue(bindingIds.size === expectedIds.length * expectedPresentationIds.length, 'matrix.base_only_coverage', 'the registry does not contain all 60 unique row-presentation bindings');
  return { ok: true, rows: inventory.rows.length, presentations: expectedPresentationIds.length, bindings: bindingIds.size, presentationEvidenceTargets: bindingIds.size * targetKeys.length, readiness: readiness ? 'verified' : 'structure-only', applicationRoute: routes.applicationImplementation.status, intendedSourceCommit: readiness ? intendedSourceCommit : null };
}

const loadedParity = loadAndPinParityRegistries(root);
const inventory = loadedParity.inventory;
const routes = loadedParity.routes;
const intendedSourceCommit = !structureOnly && !negative ? resolveIntendedSourceCommit() : null;

if (negative) {
  const cases = [
    ['inventory.row_ids', (i) => i.rows.pop()],
    ['route.registry_ids', (_i, r) => r.routes.pop()],
    ['route.protocol', (i) => { i.rows[0].referenceRoute = i.rows[0].referenceRoute.replace('design-reference:', 'wrong:'); }],
    ['route.protocol', (i) => { i.rows[0].applicationRoute = i.rows[0].applicationRoute.replace('material-designer:', 'wrong:'); }],
    ['route.query_keys', (i) => { const url = new URL(i.rows[0].referenceRoute); url.searchParams.delete('network'); i.rows[0].referenceRoute = url.href; }],
    ['route.browser_path', (_i, r) => { delete r.routes[0].browserPath; }],
    ['route.duplicate_path', (_i, r) => { r.routes[1].browserPath = r.routes[0].browserPath; }],
    ['route.identity', (_i, r) => { r.routes[0].identity.routeId = 'detached-route'; }],
    ['capture.network_policy', (_i, r) => { r.routes[0].capture.network = 'enabled'; }],
    ['audit.control_requirements', (i) => { i.auditContract.requiredFields.pop(); }],
    ['evidence.hash', (i) => { i.evidenceContract.requiredTargets[0] = 'wrongHashTarget'; }],
    ['evidence.inspection', (i) => { i.evidenceContract.requiredInspectionFields[0] = 'wrongInspectionField'; }],
    ['reference.hash_stale', (i) => { i.reference.sha256 = '0'.repeat(64); }],
    ['audit.target', (i) => { delete i.rows[0].auditTarget; }],
    ['evidence.referenceRaw.target', (i) => { delete i.rows[0].evidenceTargets.referenceRaw; }],
    ['evidence.referenceReceipt.target', (i) => { delete i.rows[0].presentations[0].evidenceTargets.referenceReceipt; }],
    ['evidence.applicationRaw.target', (i) => { delete i.rows[0].evidenceTargets.applicationRaw; }],
    ['evidence.applicationReceipt.target', (i) => { delete i.rows[0].presentations[0].evidenceTargets.applicationReceipt; }],
    ['evidence.applicationArtifactManifest.target', (i) => { delete i.rows[0].evidenceTargets.applicationArtifactManifest; }],
    ['evidence.comparison.target', (i) => { delete i.rows[0].evidenceTargets.comparison; }],
    ['evidence.diff.target', (i) => { delete i.rows[0].evidenceTargets.diff; }],
    ['deviation.reason', (i) => { i.rows.at(-1).deviations[0].reason = ''; }],
    ['deviation.approval', (i) => { i.rows.at(-1).deviations[0].approved = false; }],
    ['matrix.variant_missing', (i) => { i.rows[0].presentations.pop(); }],
    ['matrix.pair_duplicate', (i) => { i.rows[0].presentations[1].bindingId = i.rows[0].presentations[0].bindingId; }],
    ['matrix.tuple_drift', (i) => { i.rows[0].presentations[1].tuple.scale = 9; }],
    ['matrix.route_drift', (i, r) => { r.routes[0].presentations[1].referenceRoute = r.routes[0].presentations[0].referenceRoute; }],
    ['matrix.base_only_coverage', (i, r) => { for (const row of i.rows) row.presentations = [row.presentations[0]]; for (const route of r.routes) route.presentations = [route.presentations[0]]; }],
  ];
  for (const key of tupleKeys) cases.push([`tuple.${key}.missing`, (i) => { delete i.rows[0].tuple[key]; }]);
  for (const side of ['reference', 'application']) {
    cases.push([`route.${side}_tuple`, (i) => { const url = new URL(i.rows[0][`${side}Route`]); url.hostname = 'mismatched-screen'; i.rows[0][`${side}Route`] = url.href; }]);
    for (const key of queryKeys) cases.push([`route.${side}_tuple`, (i) => { const url = new URL(i.rows[0][`${side}Route`]); url.searchParams.set(key, key === 'width' || key === 'height' || key === 'scale' || key === 'random' ? '999' : 'mismatch'); i.rows[0][`${side}Route`] = url.href; }]);
  }
  const receipt = [];
  for (const [expectedCode, mutate] of cases) {
    const brokenInventory = clone(inventory);
    const brokenRoutes = clone(routes);
    mutate(brokenInventory, brokenRoutes);
    let actualCode = null;
    try { validate(brokenInventory, brokenRoutes, false, null); } catch (error) { actualCode = error.code; }
    requireValue(actualCode === expectedCode, 'negative.wrong_boundary', `expected ${expectedCode}, received ${actualCode ?? 'green'}`);
    validate(inventory, routes, false, null);
    receipt.push({ expectedCode, red: true, restoredGreen: true });
  }
  process.stdout.write(JSON.stringify({ ok: true, version: 2, negative: receipt }, null, 2) + '\n');
} else {
  process.stdout.write(JSON.stringify(validate(inventory, routes, !structureOnly, intendedSourceCommit), null, 2) + '\n');
}

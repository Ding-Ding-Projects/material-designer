#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { readStrictJson } from './strict-json.mjs';
import { validatePng } from './design-parity-png.mjs';

const root = resolve(import.meta.dirname, '..');
const inventoryPath = resolve(root, '.codex/verification/design-parity/inventory.json');
const routesPath = resolve(root, '.codex/verification/design-parity/routes.json');
const structureOnly = process.argv.includes('--structure');
const negative = process.argv.includes('--negative');
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
const targetKeys = ['referenceRaw', 'referenceReceipt', 'applicationRaw', 'applicationReceipt', 'comparison', 'diff'];
const expectedBrowserPaths = ['/', '/projects', '/design-systems', '/automations', '/plugins', '/integrations', '/studio', '/library', '/settings/appearance', '/handoff'];
const expectedRouteIdentityFields = ['surfaceId', 'featureId', 'routeId', 'screen', 'state', 'theme', 'locale', 'viewportWidth', 'viewportHeight', 'displayScale', 'fixtureRevision', 'frozenTime', 'motion', 'randomSeed', 'bundledFontRevision', 'network', 'headlessRoute', 'rendererWitness', 'captureSettledWitness'];
const expectedNegativeRegressions = ['inventory.row_ids', 'route.registry_ids', 'route.duplicate_path', 'route.commented_registration', 'route.detached_registration', 'reference.file_missing', 'reference.hash_stale', 'route.reference_tuple', 'route.application_tuple', 'tuple.nondeterministic_source', 'capture.network_policy', 'audit.control_audit', 'evidence.referenceRaw.target', 'evidence.applicationRaw.target', 'evidence.comparison.target', 'evidence.diff.target', 'evidence.hash', 'evidence.inspection', 'deviation.reason', 'deviation.approval'];
const canonicalReferencePath = 'mockups/open-design-m3/Open Design M3.dc.html';
const schemaPaths = ['.codex/verification/design-parity/inventory.schema.json', '.codex/verification/design-parity/routes.schema.json'];

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

function requireRelativeContainedPath(path, code) {
  requireValue(typeof path === 'string' && path.length > 0, code, 'path is missing');
  requireValue(!path.startsWith('/') && !path.startsWith('\\') && !/^[A-Za-z]:/.test(path), code, `path must be repository-relative: ${path}`);
  const resolved = resolve(root, path);
  requireValue(resolved.startsWith(`${root}\\`) || resolved.startsWith(`${root}/`), code, `path escapes repository root: ${path}`);
  const canonicalRoot = realpathSync(root);
  let cursor = root;
  const relative = resolved.slice(root.length).replace(/^[/\\]+/, '');
  for (const part of relative ? relative.split(/[\\/]/) : []) {
    cursor = resolve(cursor, part);
    if (existsSync(cursor)) {
      const info = lstatSync(cursor);
      requireValue(!info.isSymbolicLink() && !info.isBlockDevice() && !info.isCharacterDevice(), 'path.reparse_escape', `path contains a symlink or reparse component: ${path}`);
    }
  }
  if (existsSync(resolved)) {
    const canonical = realpathSync(resolved);
    requireValue(canonical === canonicalRoot || canonical.startsWith(`${canonicalRoot}\\`) || canonical.startsWith(`${canonicalRoot}/`), 'path.reparse_escape', `canonical path escapes repository root: ${path}`);
  }
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

function validateSchemaEnvelopes() {
  const schemas = schemaPaths.map((path) => {
    const full = requireRelativeContainedPath(path, 'schema.path');
    requireValue(existsSync(full), 'schema.file_missing', `${path} is missing`);
    const schema = readJson(full);
    requireValue(schema.$schema === 'https://json-schema.org/draft/2020-12/schema' && typeof schema.$id === 'string' && schema.additionalProperties === false && Array.isArray(schema.required), 'schema.invalid', `${path} has no strict schema envelope`);
    requireValue(schema.required.length > 0 && schema.required.every((item) => typeof item === 'string' && item.length > 0), 'schema.required', `${path} has invalid required fields`);
    return schema;
  });
  requireValue(schemas.length === 2, 'schema.count', 'both strict parity schemas are required');
}

function validateAudit(row) {
  requireValue(row.auditStatus === 'verified', 'audit.pending', `${row.id} auditStatus is not verified`);
  requireValue(row.audit && sha256.test(row.audit.sha256), 'audit.hash_missing', `${row.id} audit hash is missing`);
  const path = requireRelativeContainedPath(row.audit.path, 'audit.path_missing');
  requireValue(existsSync(path) && statSync(path).isFile(), 'audit.file_missing', `${row.id} audit file is missing`);
  requireValue(hash(path) === row.audit.sha256, 'audit.hash_stale', `${row.id} audit hash is stale`);
  const audit = readJson(path);
  requireValue(audit.version === 1 && audit.rowId === row.id && JSON.stringify(audit.tuple) === JSON.stringify(row.tuple), 'audit.schema', `${row.id} audit schema or tuple is invalid`);
  requireValue(Array.isArray(audit.controls) && audit.controls.length > 0, 'audit.controls_missing', `${row.id} has no per-control audit`);
  const ids = new Set();
  for (const control of audit.controls) {
    requireValue(typeof control.id === 'string' && control.id.length > 0 && !ids.has(control.id), 'audit.control_id', `${row.id} control id is missing or duplicated`);
    ids.add(control.id);
    requireValue(typeof control.primitive === 'string' && typeof control.region === 'string' && typeof control.locator === 'string', 'audit.control_anatomy', `${row.id}/${control.id} anatomy is incomplete`);
    requireValue(['conforming', 'defect', 'intentional-deviation'].includes(control.status), 'audit.control_status', `${row.id}/${control.id} status is invalid`);
    requireValue(typeof control.note === 'string' && control.note.trim().length > 0, 'audit.control_note', `${row.id}/${control.id} note is missing`);
    if (control.status === 'intentional-deviation') requireValue(row.deviations.some((item) => item.id === control.deviationId && item.approved === true), 'audit.deviation_link', `${row.id}/${control.id} deviation is not approved`);
  }
}

function validateEvidence(row) {
  requireValue(row.captureStatus === 'verified', 'evidence.pending', `${row.id} captureStatus is not verified`);
  requireValue(row.matrixStatus === 'verified', 'matrix.pending', `${row.id} required theme/layout/scale matrix is not verified`);
  requireValue(typeof row.sourceCommit === 'string' && commit.test(row.sourceCommit), 'evidence.source_commit', `${row.id} sourceCommit is missing`);
  requireValue(row.evidence && typeof row.evidence === 'object', 'evidence.record_missing', `${row.id} evidence record is missing`);
  for (const key of targetKeys) {
    const item = row.evidence[key];
    requireValue(item && item.path === row.evidenceTargets[key] && sha256.test(item.sha256), `evidence.${key}.metadata`, `${row.id} ${key} path/hash is missing`);
    const path = requireRelativeContainedPath(item.path, `evidence.${key}.path`);
    requireValue(existsSync(path) && statSync(path).isFile() && statSync(path).size > 0, `evidence.${key}.missing`, `${row.id} ${key} file is missing`);
    requireValue(hash(path) === item.sha256, `evidence.${key}.stale`, `${row.id} ${key} hash is stale`);
  }
  for (const side of ['reference', 'application']) {
    const raw = resolve(root, row.evidence[`${side}Raw`].path);
    const receipt = readJson(resolve(root, row.evidence[`${side}Receipt`].path));
    const dimensions = pngDimensions(raw, `evidence.${side}.png`);
    requireKnownKeys(receipt, ['version', 'schema', 'side', 'rowId', 'sourceCommit', 'artifact', 'captureTuple', 'witness', 'inspection', 'tool', 'pngSha256', 'dimensions', 'semanticStateValidated', 'nonblankValidated', 'privacyValidated'], `evidence.${side}.receipt_unknown_field`);
    requireValue(receipt.version === 1 && receipt.side === side && receipt.rowId === row.id, `evidence.${side}.receipt_schema`, `${row.id} ${side} receipt identity is invalid`);
    requireValue(receipt.schema === 'design-parity-receipt-v1', `evidence.${side}.receipt_schema`, `${row.id} ${side} receipt schema version is missing`);
    requireValue(receipt.sourceCommit === row.sourceCommit && receipt.artifact?.builtFromCommit === row.sourceCommit, `evidence.${side}.source_commit`, `${row.id} ${side} source or artifact provenance is mismatched`);
    requireValue(receipt.captureTuple?.route === row[`${side === 'reference' ? 'reference' : 'application'}Route`] && receipt.captureTuple?.headlessRoute === 'cheap-lowlevel-headless', `evidence.${side}.capture_route`, `${row.id} ${side} capture route is not the exact approved route`);
    requireValue(JSON.stringify(receipt.tuple) === JSON.stringify(row.tuple), `evidence.${side}.tuple`, `${row.id} ${side} receipt tuple is mismatched`);
    requireValue(receipt.route === row[`${side === 'reference' ? 'reference' : 'application'}Route`], `evidence.${side}.route`, `${row.id} ${side} receipt route is mismatched`);
    requireValue(receipt.pngSha256 === row.evidence[`${side}Raw`].sha256 && JSON.stringify(receipt.dimensions) === JSON.stringify(dimensions), `evidence.${side}.png_metadata`, `${row.id} ${side} PNG metadata is stale`);
    requireValue(receipt.witness?.version === 1 && receipt.witness?.rendererWitness && receipt.witness?.captureSettledWitness, `evidence.${side}.witness`, `${row.id} ${side} renderer or capture-settled witness is missing`);
    requireValue(receipt.witness.rendererWitness.routeId === row.id && receipt.witness.rendererWitness.fixtureRevision === row.tuple.fixtureRevision && receipt.witness.rendererWitness.routeState === row.tuple.state, `evidence.${side}.witness`, `${row.id} ${side} renderer witness identity is mismatched`);
    requireValue(receipt.witness.captureSettledWitness.settled === true && receipt.witness.captureSettledWitness.revision === 'capture-settled-v1' && receipt.witness.captureSettledWitness.routePath === receipt.witness.rendererWitness.routePath, `evidence.${side}.witness`, `${row.id} ${side} capture-settled witness is mismatched`);
    requireValue(receipt.inspection?.originalOpened === true && receipt.inspection?.semanticStateConfirmed === true && receipt.inspection?.clippingChecked === true && receipt.inspection?.originalImagePath === row.evidence[`${side}Raw`].path && typeof receipt.inspection.method === 'string' && receipt.inspection.method.length > 0, `evidence.${side}.inspection`, `${row.id} ${side} original-image inspection provenance is incomplete`);
    requireValue(receipt.tool && ['cheap-lowlevel-headless', 'lowlevel-computer-use-cheap', 'design-reference-electron', 'electron-capture-page'].includes(receipt.tool.name) && typeof receipt.tool.version === 'string' && receipt.tool.version.length > 0, `evidence.${side}.tool`, `${row.id} ${side} tool provenance is missing or untrusted`);
    requireValue(receipt.semanticStateValidated === true && receipt.nonblankValidated === true && receipt.privacyValidated === true, `evidence.${side}.validation`, `${row.id} ${side} semantic/nonblank/privacy validation is incomplete`);
  }
  const diff = readJson(resolve(root, row.evidence.diff.path));
  requireValue(diff.version === 1 && JSON.stringify(diff.tuple) === JSON.stringify(row.tuple), 'diff.tuple', `${row.id} diff tuple is invalid`);
  requireValue(diff.inputs?.referenceSha256 === row.evidence.referenceRaw.sha256 && diff.inputs?.applicationSha256 === row.evidence.applicationRaw.sha256, 'diff.inputs', `${row.id} diff inputs are stale`);
  requireValue(diff.dimensions && diff.metrics && diff.tool?.name && diff.tool?.version && diff.review?.status, 'diff.provenance', `${row.id} diff metrics/provenance/review are incomplete`);
}

function validate(inventory, routes, readiness) {
  validateSchemaEnvelopes();
  requireKnownKeys(inventory, ['version', 'reference', 'defaults', 'requiredCaptureVariants', 'routeIdentity', 'auditContract', 'evidenceContract', 'negativeRegressions', 'rows'], 'inventory.unknown_field');
  requireKnownKeys(routes, ['version', 'reference', 'referenceImplementation', 'applicationImplementation', 'negativeRegressions', 'routes'], 'routes.unknown_field');
  requireValue(inventory.reference.path === canonicalReferencePath && routes.reference === canonicalReferencePath, 'reference.path', 'reference path must be the pinned canonical path in both registries');
  requireValue(inventory.version === 2 && routes.version === 2, 'schema.version', 'inventory and route versions must be 2');
  requireValue(inventory.reference?.path === routes.reference, 'reference.path', 'reference path disagrees with route registry');
  const referencePath = requireRelativeContainedPath(inventory.reference.path, 'reference.path');
  requireValue(existsSync(referencePath), 'reference.file_missing', 'reference file is missing');
  requireValue(sha256.test(inventory.reference.sha256) && hash(referencePath) === inventory.reference.sha256, 'reference.hash_stale', 'reference hash is stale');
  requireValue(sha256.test(inventory.reference.authoritativeArchiveSha256), 'reference.archive_hash', 'authoritative archive hash is missing');
  for (const dependency of inventory.reference.dependencies ?? []) {
    const path = requireRelativeContainedPath(dependency.path, 'reference.dependency_path');
    requireValue(sha256.test(dependency.sha256) && existsSync(path) && hash(path) === dependency.sha256, 'reference.dependency_hash', `reference dependency is missing or stale: ${dependency.path}`);
  }
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
  requireValue(JSON.stringify(inventory.negativeRegressions) === JSON.stringify([...expectedNegativeRegressions, 'tuple.screen.missing', 'tuple.state.missing', 'tuple.theme.missing', 'tuple.viewport.missing', 'tuple.scale.missing', 'tuple.locale.missing', 'tuple.fixtureRevision.missing', 'tuple.time.missing', 'tuple.motion.missing', 'tuple.randomSeed.missing', 'tuple.fonts.missing', 'tuple.network.missing']), 'negative.inventory_registry', 'inventory negative regression registry is missing or drifted');
  requireValue(inventory.auditContract?.controlAuditRequired === true && JSON.stringify(inventory.auditContract.requiredFields) === JSON.stringify(['id', 'primitive', 'region', 'locator', 'status', 'note']) && JSON.stringify(inventory.auditContract.statuses) === JSON.stringify(['conforming', 'defect', 'intentional-deviation']), 'audit.control_requirements', 'hand-written per-control audit requirements are missing');
  requireValue(inventory.evidenceContract?.captureEvidenceRequired === true && Array.isArray(inventory.evidenceContract.requiredTargets), 'evidence.contract', 'hand-written capture requirements are missing');
  requireValue(JSON.stringify(inventory.evidenceContract.requiredTargets) === JSON.stringify(targetKeys), 'evidence.hash', 'hand-written evidence target and hash requirements are missing');
  requireValue(JSON.stringify(inventory.evidenceContract.requiredInspectionFields) === JSON.stringify(['originalOpened', 'semanticStateConfirmed', 'clippingChecked', 'visualDefectIds']), 'evidence.inspection', 'hand-written image inspection requirements are missing');
  if (readiness) requireValue(routes.applicationImplementation.status === 'implemented', 'route.application_implementation', routes.applicationImplementation.reason);

  requireValue(JSON.stringify(routes.routes.map((item) => item.id)) === JSON.stringify(expectedIds), 'route.registry_ids', 'route registry must contain the exact ten stable IDs in order');
  requireValue(JSON.stringify(inventory.rows.map((item) => item.id)) === JSON.stringify(expectedIds), 'inventory.row_ids', 'inventory must contain the exact ten stable IDs in order');
  const targets = new Set();
  const browserPaths = new Set();
  for (let index = 0; index < inventory.rows.length; index += 1) {
    const row = inventory.rows[index];
    const route = routes.routes[index];
    requireKnownKeys(row, ['id', 'tuple', 'referenceRoute', 'applicationRoute', 'auditTarget', 'auditStatus', 'evidenceTargets', 'captureStatus', 'matrixStatus', 'deviations', 'sourceCommit', 'audit', 'evidence'], 'inventory.row_unknown_field');
    requireKnownKeys(route, ['id', 'screen', 'state', 'browserPath', 'referenceSteps', 'identity', 'capture'], 'routes.route_unknown_field');
    for (const key of tupleKeys) requireValue(Object.hasOwn(row.tuple ?? {}, key), `tuple.${key}.missing`, `${row.id} tuple is missing ${key}`);
    requireValue(route.id === row.id && route.screen === row.tuple.screen && route.state === row.tuple.state, 'route.row_mapping', `${row.id} registry mapping is mismatched`);
    requireValue(!browserPaths.has(route.browserPath), 'route.duplicate_path', `${row.id} browser path is duplicated`);
    browserPaths.add(route.browserPath);
    requireValue(route.browserPath === expectedBrowserPaths[index], 'route.browser_path', `${row.id} browser path is missing or mismatched`);
    requireValue(route.identity?.surfaceId === 'desktop-application' && route.identity.featureId === row.id && route.identity.routeId === row.id, 'route.identity', `${row.id} route identity is missing or mismatched`);
    requireValue(route.capture?.headlessRoute === 'cheap-lowlevel-headless' && route.capture.network === 'disabled' && route.capture.blockedRequestPolicy === 'fail' && route.capture.rendererWitnessRequired === true && route.capture.captureSettledWitnessRequired === true, 'capture.network_policy', `${row.id} capture isolation policy is incomplete`);
    requireValue(Array.isArray(route.referenceSteps) && route.referenceSteps.every((step) => ['text-exact', 'aria-label-exact'].includes(step.match) && typeof step.value === 'string' && step.value.length > 0), 'route.reference_steps', `${row.id} reference steps are invalid`);
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
      targets.add(target);
    }
    for (const deviation of row.deviations ?? []) {
      requireValue(typeof deviation.id === 'string' && deviation.id.length > 0, 'deviation.id', `${row.id} deviation id is missing`);
      requireValue(typeof deviation.reason === 'string' && deviation.reason.trim().length > 0, 'deviation.reason', `${row.id} deviation reason is missing`);
      requireValue(deviation.approved === true && typeof deviation.approvedBy === 'string' && deviation.approvedBy.length > 0, 'deviation.approval', `${row.id} deviation approval is missing`);
    }
    if (readiness) { validateAudit(row); validateEvidence(row); }
  }
  requireValue(Array.isArray(inventory.requiredCaptureVariants) && inventory.requiredCaptureVariants.length >= 6, 'matrix.variants', 'required light/dark, normal/narrow, scale, and bilingual variants are missing');
  return { ok: true, rows: inventory.rows.length, readiness: readiness ? 'verified' : 'structure-only', applicationRoute: routes.applicationImplementation.status };
}

const inventory = readJson(inventoryPath);
const routes = readJson(routesPath);

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
    ['evidence.applicationRaw.target', (i) => { delete i.rows[0].evidenceTargets.applicationRaw; }],
    ['evidence.comparison.target', (i) => { delete i.rows[0].evidenceTargets.comparison; }],
    ['evidence.diff.target', (i) => { delete i.rows[0].evidenceTargets.diff; }],
    ['deviation.reason', (i) => { i.rows.at(-1).deviations[0].reason = ''; }],
    ['deviation.approval', (i) => { i.rows.at(-1).deviations[0].approved = false; }],
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
    try { validate(brokenInventory, brokenRoutes, false); } catch (error) { actualCode = error.code; }
    requireValue(actualCode === expectedCode, 'negative.wrong_boundary', `expected ${expectedCode}, received ${actualCode ?? 'green'}`);
    validate(inventory, routes, false);
    receipt.push({ expectedCode, red: true, restoredGreen: true });
  }
  process.stdout.write(JSON.stringify({ ok: true, version: 2, negative: receipt }, null, 2) + '\n');
} else {
  process.stdout.write(JSON.stringify(validate(inventory, routes, !structureOnly), null, 2) + '\n');
}

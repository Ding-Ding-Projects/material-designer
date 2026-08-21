#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const inventoryPath = resolve(root, '.codex/verification/design-parity/inventory.json');
const routesPath = resolve(root, '.codex/verification/design-parity/routes.json');
const structureOnly = process.argv.includes('--structure');
const negative = process.argv.includes('--negative');
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
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
  return resolved;
}

function pngDimensions(path, code) {
  const bytes = readFileSync(path);
  requireValue(bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), code, `${path} is not a PNG`);
  requireValue(bytes.toString('ascii', 12, 16) === 'IHDR', code, `${path} has no IHDR`);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
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
    requireValue(receipt.version === 1 && receipt.side === side && receipt.rowId === row.id, `evidence.${side}.receipt_schema`, `${row.id} ${side} receipt identity is invalid`);
    requireValue(JSON.stringify(receipt.tuple) === JSON.stringify(row.tuple), `evidence.${side}.tuple`, `${row.id} ${side} receipt tuple is mismatched`);
    requireValue(receipt.route === row[`${side === 'reference' ? 'reference' : 'application'}Route`], `evidence.${side}.route`, `${row.id} ${side} receipt route is mismatched`);
    requireValue(receipt.pngSha256 === row.evidence[`${side}Raw`].sha256 && JSON.stringify(receipt.dimensions) === JSON.stringify(dimensions), `evidence.${side}.png_metadata`, `${row.id} ${side} PNG metadata is stale`);
    requireValue(receipt.semanticStateValidated === true && receipt.nonblankValidated === true && receipt.privacyValidated === true, `evidence.${side}.validation`, `${row.id} ${side} semantic/nonblank/privacy validation is incomplete`);
    requireValue(receipt.tool && typeof receipt.tool.name === 'string' && typeof receipt.tool.version === 'string', `evidence.${side}.tool`, `${row.id} ${side} tool provenance is missing`);
  }
  const diff = readJson(resolve(root, row.evidence.diff.path));
  requireValue(diff.version === 1 && JSON.stringify(diff.tuple) === JSON.stringify(row.tuple), 'diff.tuple', `${row.id} diff tuple is invalid`);
  requireValue(diff.inputs?.referenceSha256 === row.evidence.referenceRaw.sha256 && diff.inputs?.applicationSha256 === row.evidence.applicationRaw.sha256, 'diff.inputs', `${row.id} diff inputs are stale`);
  requireValue(diff.dimensions && diff.metrics && diff.tool?.name && diff.tool?.version && diff.review?.status, 'diff.provenance', `${row.id} diff metrics/provenance/review are incomplete`);
}

function validate(inventory, routes, readiness) {
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
  requireValue(routes.applicationImplementation?.status === 'implemented' || (routes.applicationImplementation?.status === 'unimplemented' && typeof routes.applicationImplementation.reason === 'string' && routes.applicationImplementation.reason.length > 0), 'route.application_implementation_shape', 'application implementation status/reason is invalid');
  if (readiness) requireValue(routes.applicationImplementation.status === 'implemented', 'route.application_implementation', routes.applicationImplementation.reason);

  requireValue(JSON.stringify(routes.routes.map((item) => item.id)) === JSON.stringify(expectedIds), 'route.registry_ids', 'route registry must contain the exact ten stable IDs in order');
  requireValue(JSON.stringify(inventory.rows.map((item) => item.id)) === JSON.stringify(expectedIds), 'inventory.row_ids', 'inventory must contain the exact ten stable IDs in order');
  const targets = new Set();
  for (let index = 0; index < inventory.rows.length; index += 1) {
    const row = inventory.rows[index];
    const route = routes.routes[index];
    for (const key of tupleKeys) requireValue(Object.hasOwn(row.tuple ?? {}, key), `tuple.${key}.missing`, `${row.id} tuple is missing ${key}`);
    requireValue(route.id === row.id && route.screen === row.tuple.screen && route.state === row.tuple.state, 'route.row_mapping', `${row.id} registry mapping is mismatched`);
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

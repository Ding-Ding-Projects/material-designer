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
const fail = (message) => { throw new Error(message); };
const requireValue = (condition, message) => { if (!condition) fail(message); };
const auditKeys = ['navigation', 'topAppBar', 'content', 'statusBar', 'typography', 'colorRoles', 'shape', 'elevation', 'stateLayers', 'focus', 'motion'];
const auditValues = new Set(['conforming', 'defect', 'intentional-deviation']);

function tupleFromRoute(route) {
  const url = new URL(route);
  return {
    screen: url.hostname,
    state: url.searchParams.get('state'),
    theme: url.searchParams.get('theme'),
    viewport: { width: Number(url.searchParams.get('width')), height: Number(url.searchParams.get('height')) },
    scale: Number(url.searchParams.get('scale')),
    locale: url.searchParams.get('locale'),
    fixtureRevision: url.searchParams.get('fixture'),
  };
}

function validate(inventory, routes, requireEvidence) {
  requireValue(inventory.version === 1 && routes.version === 1, 'inventory and route versions must be 1');
  requireValue(inventory.reference?.path === routes.reference, 'reference path disagrees with route registry');
  const referencePath = resolve(root, inventory.reference.path);
  requireValue(existsSync(referencePath), 'reference file is missing');
  requireValue(hash(referencePath) === inventory.reference.sha256, 'reference hash is stale');
  const rows = inventory.rows ?? [];
  requireValue(rows.length === routes.screens.length, 'inventory row count does not match the hand-written screen registry');
  const ids = new Set();
  const screens = new Set();
  for (const row of rows) {
    requireValue(typeof row.id === 'string' && row.id.length > 0 && !ids.has(row.id), 'row id is missing or duplicated');
    ids.add(row.id);
    requireValue(routes.screens.includes(row.screen) && !screens.has(row.screen), `screen ${row.screen} is absent from the registry or duplicated`);
    screens.add(row.screen);
    for (const key of ['state', 'theme', 'locale', 'referenceRoute', 'applicationRoute']) requireValue(typeof row[key] === 'string' && row[key].length > 0, `${row.id} is missing ${key}`);
    requireValue(Number.isFinite(row.scale) && row.scale > 0, `${row.id} scale is invalid`);
    requireValue(Number.isInteger(row.viewport?.width) && row.viewport.width > 0 && Number.isInteger(row.viewport?.height) && row.viewport.height > 0, `${row.id} viewport is invalid`);
    const expected = { screen: row.screen, state: row.state, theme: row.theme, viewport: row.viewport, scale: row.scale, locale: row.locale, fixtureRevision: inventory.defaults.fixtureRevision };
    requireValue(JSON.stringify(tupleFromRoute(row.referenceRoute)) === JSON.stringify(expected), `${row.id} reference route tuple is mismatched`);
    requireValue(JSON.stringify(tupleFromRoute(row.applicationRoute)) === JSON.stringify(expected), `${row.id} application route tuple is mismatched`);
    for (const key of auditKeys) requireValue(auditValues.has(row.audit?.[key]), `${row.id} audit is missing ${key}`);
    for (const deviation of row.deviations ?? []) {
      requireValue(typeof deviation.id === 'string' && deviation.id.length > 0, `${row.id} deviation id is missing`);
      requireValue(typeof deviation.reason === 'string' && deviation.reason.trim().length > 0, `${row.id} deviation reason is missing`);
      requireValue(deviation.approved === true, `${row.id} deviation is not approved`);
    }
    for (const key of ['referenceRaw', 'applicationRaw', 'comparison', 'diff']) requireValue(typeof row.evidence?.[key] === 'string' && row.evidence[key].length > 0, `${row.id} evidence path is missing ${key}`);
    if (!requireEvidence) continue;
    requireValue(row.captureStatus === 'verified', `${row.id} captureStatus is not verified`);
    requireValue(typeof row.sourceCommit === 'string' && /^[0-9a-f]{40}$/.test(row.sourceCommit), `${row.id} sourceCommit is missing`);
    for (const key of ['referenceRaw', 'applicationRaw', 'comparison', 'diff']) {
      const path = resolve(root, row.evidence[key]);
      requireValue(existsSync(path) && statSync(path).isFile() && statSync(path).size > 0, `${row.id} evidence is missing ${key}`);
    }
    const diff = readJson(resolve(root, row.evidence.diff));
    requireValue(diff.version === 1 && diff.tuple && diff.inputs?.referenceSha256 && diff.inputs?.applicationSha256 && diff.metrics, `${row.id} diff record is incomplete`);
    requireValue(JSON.stringify(diff.tuple) === JSON.stringify(expected), `${row.id} diff tuple is mismatched`);
    requireValue(hash(resolve(root, row.evidence.referenceRaw)) === diff.inputs.referenceSha256, `${row.id} reference input hash is stale`);
    requireValue(hash(resolve(root, row.evidence.applicationRaw)) === diff.inputs.applicationSha256, `${row.id} application input hash is stale`);
  }
  for (const screen of routes.screens) requireValue(screens.has(screen), `registered screen is absent from inventory: ${screen}`);
  return { ok: true, rows: rows.length, evidence: requireEvidence ? 'verified' : 'not-required' };
}

const inventory = readJson(inventoryPath);
const routes = readJson(routesPath);

if (negative) {
  const cases = [
    ['missing-row', (i) => i.rows.pop()],
    ['missing-reference-route', (i) => { delete i.rows[0].referenceRoute; }],
    ['missing-application-route', (i) => { delete i.rows[0].applicationRoute; }],
    ['mismatched-tuple', (i) => { i.rows[0].viewport.width += 1; }],
    ['missing-audit', (i) => { delete i.rows[0].audit.focus; }],
    ['missing-evidence-path', (i) => { delete i.rows[0].evidence.comparison; }],
    ['deviation-without-reason', (i) => { i.rows.at(-1).deviations[0].reason = ''; }],
    ['deviation-without-approval', (i) => { i.rows.at(-1).deviations[0].approved = false; }],
  ];
  const receipt = [];
  for (const [id, mutate] of cases) {
    const broken = clone(inventory);
    mutate(broken);
    let red = false;
    try { validate(broken, routes, false); } catch { red = true; }
    requireValue(red, `negative regression stayed green: ${id}`);
    validate(inventory, routes, false);
    receipt.push({ id, red: true, restoredGreen: true });
  }
  process.stdout.write(JSON.stringify({ ok: true, negative: receipt }, null, 2) + '\n');
} else {
  process.stdout.write(JSON.stringify(validate(inventory, routes, !structureOnly), null, 2) + '\n');
}

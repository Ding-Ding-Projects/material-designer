#!/usr/bin/env node

/**
 * Fail-closed every-element Material Design registry validator.
 *
 * The registry is deliberately hand-written. It is not a discovery report:
 * the expected surface and element sets below make deletion visible, while
 * sourceLineage anchors connect each row to the current source tree. The
 * --negative mode removes complete rows, states, fields, memberships, and
 * source anchors in memory, requiring each mutation to turn red before the
 * untouched registry is checked green again.
 */

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const registryPath = path.join(root, '.codex', 'verification', 'lang-gui', 'registry.json');

const SURFACE_IDS = ['windows-desktop-application', 'documentation-site'];
const ELEMENT_IDS = [
  'desktop-main-window', 'desktop-title-bar', 'desktop-window-controls', 'desktop-update-menu',
  'site-topbar-brand', 'site-front-provenance', 'site-tab-strip', 'site-content-search', 'site-command-palette',
  'site-notification-center', 'site-theme-toggle', 'site-search-results', 'site-overview-hero',
  'site-settings-language', 'site-settings-funny-levels', 'site-settings-appearance', 'site-settings-toy-lock',
  'site-settings-reset', 'site-statusbar',
];
const STATE_IDS = ['normal', 'hover', 'focus', 'pressed', 'selected', 'disabled', 'dragged', 'validation', 'loading', 'success', 'warning', 'error'];
const FIELD_IDS = ['stableElementId', 'owner', 'route', 'sourceLineage', 'rolesNamesActions', 'states', 'material', 'colors', 'typography', 'shape', 'elevation', 'stateLayers', 'motion', 'density', 'focus', 'targetSize', 'contrast', 'responsiveMatrix', 'contextMenu', 'appearanceEditor', 'lockRoute', 'searchRegexRoute', 'localization', 'persistence', 'test', 'negativeProof', 'interactionReceipt', 'captureTuple', 'status'];
const STATUS_VALUES = new Set(['partial', 'unverified', 'verified', 'not-applicable']);
const LOCK_POLICIES = ['PIN', 'password', 'PIN plus password', 'password plus TOTP', 'PIN plus TOTP', 'password plus PIN plus TOTP'];
const REQUIRED_MODES = ['English', 'playful Hong Kong-style Cantonese', 'bilingual'];
const REQUIRED_RESPONSIVE_TUPLES = new Set(['1280x720|1|light', '1280x720|1.5|dark', '320x640|1|light', '320x640|2|dark']);

function readJson(file) {
  if (!fs.existsSync(file)) throw new Error(`missing registry file: ${path.relative(root, file)}`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function arrayEqual(actual, expected, label) {
  assert(Array.isArray(actual), `${label} must be an array`);
  assert(actual.length === expected.length, `${label} has ${actual.length} entries, expected ${expected.length}`);
  expected.forEach((value, index) => assert(actual[index] === value, `${label}[${index}] is ${String(actual[index])}, expected ${value}`));
}

function unique(values, label) {
  assert(Array.isArray(values), `${label} must be an array`);
  assert(new Set(values).size === values.length, `${label} contains duplicate entries`);
}

function nonEmptyString(value, label) {
  assert(typeof value === 'string' && value.trim().length > 0, `${label} must be a non-empty string`);
}

function checkStatus(value, label) {
  assert(STATUS_VALUES.has(value), `${label} has invalid status ${String(value)}`);
}

function checkLineage(lineage, label) {
  assert(Array.isArray(lineage) && lineage.length > 0, `${label}.sourceLineage must not be empty`);
  lineage.forEach((entry, index) => {
    const prefix = `${label}.sourceLineage[${index}]`;
    nonEmptyString(entry?.path, `${prefix}.path`);
    nonEmptyString(entry?.anchor, `${prefix}.anchor`);
    nonEmptyString(entry?.kind, `${prefix}.kind`);
    const file = path.join(root, ...entry.path.split('/'));
    assert(fs.existsSync(file), `${prefix}.path is missing: ${entry.path}`);
    const source = fs.readFileSync(file, 'utf8');
    assert(source.includes(entry.anchor), `${prefix}.anchor is missing from ${entry.path}: ${entry.anchor}`);
  });
}

function checkStates(states, label) {
  assert(states && typeof states === 'object' && !Array.isArray(states), `${label}.states must be an object`);
  arrayEqual(Object.keys(states), STATE_IDS, `${label}.states keys`);
  STATE_IDS.forEach((state) => checkStatus(states[state], `${label}.states.${state}`));
}

function checkElement(element, index) {
  const label = `element[${index}]`;
  assert(element && typeof element === 'object' && !Array.isArray(element), `${label} must be an object`);
  arrayEqual(Object.keys(element), FIELD_IDS, `${label} fields`);
  nonEmptyString(element.stableElementId, `${label}.stableElementId`);
  nonEmptyString(element.owner, `${label}.owner`);
  nonEmptyString(element.route, `${label}.route`);
  checkLineage(element.sourceLineage, label);
  assert(element.rolesNamesActions && typeof element.rolesNamesActions === 'object', `${label}.rolesNamesActions is missing`);
  for (const key of ['roles', 'accessibleNames', 'actions', 'keyboard', 'touch']) {
    assert(Array.isArray(element.rolesNamesActions[key]), `${label}.rolesNamesActions.${key} must be an array`);
  }
  assert(element.rolesNamesActions.roles.length > 0, `${label}.rolesNamesActions.roles is empty`);
  assert(element.rolesNamesActions.accessibleNames.length > 0, `${label}.rolesNamesActions.accessibleNames is empty`);
  assert(element.rolesNamesActions.actions.length > 0, `${label}.rolesNamesActions.actions is empty`);
  checkStates(element.states, label);
  assert(element.material?.primitive && Array.isArray(element.material.anatomy) && element.material.anatomy.length > 0, `${label}.material is incomplete`);
  for (const key of ['colors', 'typography', 'shape', 'elevation', 'stateLayers', 'motion', 'density']) {
    assert(element[key] && typeof element[key] === 'object', `${label}.${key} is missing`);
    checkStatus(element[key].status, `${label}.${key}.status`);
  }
  assert(Array.isArray(element.colors.roles) && element.colors.roles.length > 0, `${label}.colors.roles is empty`);
  assert(Array.isArray(element.typography.roles) && element.typography.roles.length > 0, `${label}.typography.roles is empty`);
  assert(Array.isArray(element.shape.roles) && element.shape.roles.length > 0, `${label}.shape.roles is empty`);
  assert(Array.isArray(element.elevation.levels) && element.elevation.levels.length > 0, `${label}.elevation.levels is empty`);
  assert(Array.isArray(element.stateLayers.states) && element.stateLayers.states.length > 0, `${label}.stateLayers.states is empty`);
  nonEmptyString(element.motion.policy, `${label}.motion.policy`);
  assert(Array.isArray(element.density.levels) && element.density.levels.length > 0, `${label}.density.levels is empty`);
  assert(element.focus && typeof element.focus.keyboard === 'string' && element.focus.visible === true && typeof element.focus.return === 'string', `${label}.focus is incomplete`);
  assert(element.targetSize && Number.isFinite(element.targetSize.minimumCssPx) && element.targetSize.minimumCssPx >= 48, `${label}.targetSize must be at least 48 CSS pixels`);
  assert(element.contrast && typeof element.contrast.foreground === 'string' && typeof element.contrast.background === 'string' && (element.contrast.ratio === null || Number.isFinite(element.contrast.ratio)), `${label}.contrast is incomplete`);
  assert(Array.isArray(element.responsiveMatrix) && element.responsiveMatrix.length >= 4, `${label}.responsiveMatrix must contain four tuples`);
  const tuples = new Set(element.responsiveMatrix.map((tuple) => `${tuple.viewport}|${tuple.scale}|${tuple.theme}`));
  for (const tuple of REQUIRED_RESPONSIVE_TUPLES) assert(tuples.has(tuple), `${label}.responsiveMatrix is missing ${tuple}`);
  assert(element.contextMenu?.route && Array.isArray(element.contextMenu.actions), `${label}.contextMenu is incomplete`);
  assert(element.contextMenu.actions.includes('Edit appearance') && element.contextMenu.actions.includes('Lock this element'), `${label}.contextMenu is missing required actions`);
  assert(element.contextMenu.search.includes('regex builder'), `${label}.contextMenu.search is not regex-wired`);
  assert(element.appearanceEditor?.route && Array.isArray(element.appearanceEditor.properties) && element.appearanceEditor.properties.length > 0, `${label}.appearanceEditor is incomplete`);
  assert(element.lockRoute?.route && Array.isArray(element.lockRoute.policies), `${label}.lockRoute is incomplete`);
  arrayEqual(element.lockRoute.policies, LOCK_POLICIES, `${label}.lockRoute.policies`);
  assert(element.searchRegexRoute?.route && element.searchRegexRoute.mode === 'plain-text-first' && element.searchRegexRoute.builder.includes('regex builder'), `${label}.searchRegexRoute is incomplete`);
  assert(element.localization && Array.isArray(element.localization.modes), `${label}.localization is incomplete`);
  arrayEqual(element.localization.modes, REQUIRED_MODES, `${label}.localization.modes`);
  assert(element.persistence?.storage && Array.isArray(element.persistence.fields) && element.persistence.fields.length > 0, `${label}.persistence is incomplete`);
  assert(element.test?.focused?.length > 0 && element.test.command, `${label}.test is incomplete`);
  assert(element.negativeProof?.guard && element.negativeProof.redThenGreen, `${label}.negativeProof is incomplete`);
  assert(element.interactionReceipt && typeof element.interactionReceipt.status === 'string' && 'path' in element.interactionReceipt && typeof element.interactionReceipt.sourceCommit === 'string' && 'artifactHash' in element.interactionReceipt, `${label}.interactionReceipt is incomplete`);
  assert(element.captureTuple?.route && element.captureTuple.viewport && Number.isFinite(element.captureTuple.scale) && element.captureTuple.theme && 'path' in element.captureTuple, `${label}.captureTuple is incomplete`);
  checkStatus(element.status?.state, `${label}.status.state`);
  nonEmptyString(element.status?.reason, `${label}.status.reason`);
}

export function validate(registry) {
  assert(registry && registry.version === 1, 'registry version must be 1');
  assert(registry.evidencePolicy === 'fail-closed-real-source-and-built-artifact', 'evidence policy drifted');
  arrayEqual(registry.requiredSurfaceIds, SURFACE_IDS, 'requiredSurfaceIds');
  arrayEqual(registry.requiredElementIds, ELEMENT_IDS, 'requiredElementIds');
  arrayEqual(registry.requiredStateIds, STATE_IDS, 'requiredStateIds');
  arrayEqual(registry.requiredFieldIds, FIELD_IDS, 'requiredFieldIds');
  unique(registry.requiredSurfaceIds, 'requiredSurfaceIds');
  unique(registry.requiredElementIds, 'requiredElementIds');
  unique(registry.requiredStateIds, 'requiredStateIds');
  unique(registry.requiredFieldIds, 'requiredFieldIds');
  assert(Array.isArray(registry.surfaces) && registry.surfaces.length === SURFACE_IDS.length, `surfaces has ${registry.surfaces?.length ?? 0} entries`);
  arrayEqual(registry.surfaces.map((surface) => surface.id), SURFACE_IDS, 'surface ids');
  const surfaceElementSets = new Map();
  registry.surfaces.forEach((surface, index) => {
    const label = `surface[${index}]`;
    assert(surface.kind === 'desktop-application' || surface.kind === 'documentation-site', `${label}.kind is invalid`);
    nonEmptyString(surface.route, `${label}.route`);
    checkLineage(surface.sourceLineage, label);
    unique(surface.elementIds, `${label}.elementIds`);
    checkStatus(surface.status?.state, `${label}.status.state`);
    nonEmptyString(surface.status?.reason, `${label}.status.reason`);
    surfaceElementSets.set(surface.id, surface.elementIds);
  });
  assert(Array.isArray(registry.elements) && registry.elements.length === ELEMENT_IDS.length, `elements has ${registry.elements?.length ?? 0} entries, expected ${ELEMENT_IDS.length}`);
  arrayEqual(registry.elements.map((element) => element.stableElementId), ELEMENT_IDS, 'element ids');
  registry.elements.forEach(checkElement);
  const expectedDesktop = ELEMENT_IDS.filter((id) => id.startsWith('desktop-'));
  const expectedSite = ELEMENT_IDS.filter((id) => id.startsWith('site-'));
  arrayEqual(surfaceElementSets.get('windows-desktop-application'), expectedDesktop, 'desktop surface membership');
  arrayEqual(surfaceElementSets.get('documentation-site'), expectedSite, 'site surface membership');
  const elementIds = new Set(registry.elements.map((element) => element.stableElementId));
  for (const ids of surfaceElementSets.values()) for (const id of ids) assert(elementIds.has(id), `surface membership points at missing element ${id}`);
  return { surfaces: registry.surfaces.length, elements: registry.elements.length, statesPerElement: STATE_IDS.length, requiredFieldsPerElement: FIELD_IDS.length };
}

function runNegative() {
  const baseline = readJson(registryPath);
  const boundaries = [
    ['whole element row', (data) => { data.elements = data.elements.slice(1); }],
    ['whole surface membership', (data) => { data.surfaces[0].elementIds = data.surfaces[0].elementIds.slice(1); }],
    ['required state', (data) => { delete data.elements[0].states.normal; }],
    ['required field', (data) => { delete data.elements[0].route; }],
    ['source anchor', (data) => { data.elements[0].sourceLineage[0].anchor = 'anchor deliberately absent'; }],
  ];
  for (const [label, mutate] of boundaries) {
    const changed = structuredClone(baseline);
    mutate(changed);
    let red = false;
    try { validate(changed); } catch { red = true; }
    assert(red, `negative boundary stayed green: ${label}`);
    process.stdout.write(`RED then restored: ${label}\n`);
  }
  validate(baseline);
  process.stdout.write('GREEN after restoring every registry boundary\n');
}

try {
  const result = validate(readJson(registryPath));
  if (process.argv.includes('--negative')) runNegative();
  else process.stdout.write(`every-element registry green: ${JSON.stringify(result)}\n`);
} catch (error) {
  process.stderr.write(`every-element registry red: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

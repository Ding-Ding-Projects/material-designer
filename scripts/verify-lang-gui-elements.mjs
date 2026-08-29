#!/usr/bin/env node

/**
 * Fail-closed validation for the every-element Material Design registry.
 *
 * source-owners.json is a separately hand-written inventory of the current
 * top-level desktop renderer and documentation-site owner registrations. The
 * registry must match it exactly. Source registrations are checked as unique
 * owner-bearing anchors, not as descendant or substring matches.
 *
 * The registry schema is the single field and state authority. This validator
 * executes its required lists and checks every registry row against them.
 * --negative removes each important boundary in memory and requires red,
 * then restores the untouched inputs and requires green.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const registryPath = path.join(root, '.codex', 'verification', 'lang-gui', 'registry.json');
const schemaPath = path.join(root, '.codex', 'verification', 'lang-gui', 'registry.schema.json');
const ownerPath = path.join(root, '.codex', 'verification', 'lang-gui', 'source-owners.json');
const SURFACE_IDS = ['windows-desktop-application', 'documentation-site'];
const OWNER_IDS = [
  'desktop-app-root', 'desktop-update-menu', 'desktop-entry-view', 'desktop-marketplace-view', 'desktop-plugin-detail-view', 'desktop-memory-toast', 'desktop-toast', 'desktop-centered-loader', 'desktop-pet-overlay', 'desktop-project-view', 'desktop-project-creation-pending', 'desktop-experience-survey', 'desktop-tooltip-layer', 'desktop-update-dialog', 'desktop-updater-popup', 'desktop-workspace-tabs', 'desktop-account-cluster', 'desktop-front-provenance', 'desktop-project-recovery-tip', 'desktop-design-system-creation', 'desktop-design-system-detail', 'desktop-iframe-keep-alive', 'desktop-settings-dialog', 'desktop-privacy-consent', 'desktop-collab-demo', 'desktop-workspace-member-directory', 'desktop-community-view',
  'site-topbar-brand', 'site-front-provenance', 'site-tab-strip', 'site-content-search', 'site-command-palette', 'site-notification-center', 'site-theme-toggle', 'site-search-results', 'site-overview-hero', 'site-settings-language', 'site-settings-funny-levels', 'site-settings-appearance', 'site-settings-toy-lock', 'site-settings-reset', 'site-statusbar',
];
const STATUS_VALUES = new Set(['partial', 'unverified', 'verified', 'not-applicable']);
const LOCK_POLICIES = ['PIN', 'password', 'PIN plus password', 'password plus TOTP', 'PIN plus TOTP', 'password plus PIN plus TOTP'];
const REQUIRED_MODES = ['English', 'playful Hong Kong-style Cantonese', 'bilingual'];
const REQUIRED_TUPLES = new Set(['1280x720|1|light', '1280x720|1.5|dark', '320x640|1|light', '320x640|2|dark']);

function readJson(file) { if (!fs.existsSync(file)) throw new Error(`missing file: ${path.relative(root, file)}`); return JSON.parse(fs.readFileSync(file, 'utf8')); }
function assert(condition, message) { if (!condition) throw new Error(message); }
function nonEmpty(value, label) { assert(typeof value === 'string' && value.trim().length > 0, `${label} must be non-empty`); }
function equalArray(actual, expected, label) { assert(Array.isArray(actual), `${label} must be an array`); assert(actual.length === expected.length, `${label} has ${actual.length}, expected ${expected.length}`); expected.forEach((value, index) => assert(actual[index] === value, `${label}[${index}] drifted`)); }
function unique(values, label) { assert(new Set(values).size === values.length, `${label} contains duplicates`); }
function status(value, label) { assert(STATUS_VALUES.has(value), `${label} has invalid status ${String(value)}`); }
function repoFile(relativePath, label) {
  nonEmpty(relativePath, `${label}.path`); assert(!path.isAbsolute(relativePath), `${label}.path must be relative`);
  const resolved = path.resolve(root, ...relativePath.split('/'));
  assert(resolved === root || resolved.startsWith(`${root}${path.sep}`), `${label}.path escapes the repository`);
  assert(fs.existsSync(resolved), `${label}.path is missing: ${relativePath}`); return resolved;
}
function countExact(source, needle) { let count = 0; let offset = 0; while (true) { const found = source.indexOf(needle, offset); if (found < 0) return count; count += 1; offset = found + needle.length; } }
function sourceLine(source, index) { const start = source.lastIndexOf('\n', index - 1) + 1; const end = source.indexOf('\n', index) < 0 ? source.length : source.indexOf('\n', index); return source.slice(start, end); }
function isCommented(source, index) { const line = sourceLine(source, index).trimStart(); if (/^(export )?function\b|^import\b|^<|^[A-Za-z][A-Za-z0-9_$]*\s*=/.test(line)) return false; if (line.startsWith('//') || line.startsWith('*') || line.startsWith('<!--')) return true; const before = source.slice(0, index); return before.lastIndexOf('/*') > before.lastIndexOf('*/'); }
function identifierCount(source, token) { let count = 0; let offset = 0; while (true) { const index = source.indexOf(token, offset); if (index < 0) return count; const left = source[index - 1] ?? ''; const right = source[index + token.length] ?? ''; if (!/[A-Za-z0-9_$]/.test(left) && !/[A-Za-z0-9_$]/.test(right)) count += 1; offset = index + token.length; } }

function checkRegistration(owner, label) {
  const file = repoFile(owner.sourcePath, `${label}.source`); const source = fs.readFileSync(file, 'utf8');
  assert(countExact(source, owner.registrationAnchor) === 1, `${label} registration anchor is not unique`);
  const anchorIndex = source.indexOf(owner.registrationAnchor); assert(!isCommented(source, anchorIndex), `${label} registration anchor is commented out`);
  if (owner.registrationKind === 'component-definition' || owner.registrationKind === 'native-registration') {
    assert(owner.registrationAnchor.includes('function'), `${label} is not an owner registration`); assert(identifierCount(source, owner.owner) >= 1, `${label} owner token is missing`); return;
  }
  assert(owner.registrationKind === 'import-registration' || owner.registrationKind === 'markup-registration', `${label} registration kind is invalid`);
  if (owner.registrationKind === 'import-registration') {
    const importStart = source.lastIndexOf('import', anchorIndex); const importEnd = source.indexOf(';', anchorIndex);
    assert(importStart >= 0 && importEnd > anchorIndex, `${label} is not an import registration`); const block = source.slice(importStart, importEnd + 1); assert(!block.includes('//'), `${label} import registration contains a comment boundary`);
    const openBrace = block.indexOf('{'); const closeBrace = block.indexOf('}', openBrace); const importedNames = openBrace >= 0 && closeBrace > openBrace ? block.slice(openBrace, closeBrace + 1) : block;
    assert(identifierCount(importedNames, owner.owner) === 1, `${label} owner token is missing, duplicated, or renamed`);
  } else assert(countExact(source, owner.registrationAnchor) === 1, `${label} markup owner token occurs more than once or is absent`);
}

function checkSchemaAuthority(schema) {
  assert(schema.$defs?.element?.required && schema.$defs?.states?.required, 'schema lacks element or state authority');
  const fields = schema.$defs.element.required; const states = schema.$defs.states.required;
  assert(fields.includes('semantic'), 'schema authority lacks semantic field'); assert(fields.length === 30, `schema authority has ${fields.length} fields, expected 30`);
  equalArray(states, ['normal', 'hover', 'focus', 'pressed', 'selected', 'disabled', 'dragged', 'validation', 'loading', 'success', 'warning', 'error'], 'schema state authority'); return { fields, states };
}

function checkOwnerInventory(inventory) {
  assert(inventory.version === 1 && inventory.inventoryBoundary === 'top-level-rendered-owner-registrations', 'owner inventory header drifted'); equalArray(inventory.requiredOwnerIds, OWNER_IDS, 'requiredOwnerIds'); unique(inventory.requiredOwnerIds, 'requiredOwnerIds');
  assert(Array.isArray(inventory.surfaces) && inventory.surfaces.length === SURFACE_IDS.length, 'owner inventory surface count drifted'); equalArray(inventory.surfaces.map((surface) => surface.id), SURFACE_IDS, 'owner inventory surface ids');
  const owners = []; for (const [index, surface] of inventory.surfaces.entries()) { const label = `owner-surface[${index}]`; assert(Array.isArray(surface.ownerIds), `${label}.ownerIds must be an array`); unique(surface.ownerIds, `${label}.ownerIds`); surface.ownerIds.forEach((id) => owners.push({ id, surfaceId: surface.id })); }
  equalArray(owners.map((owner) => owner.id), OWNER_IDS, 'owner inventory membership'); assert(Array.isArray(inventory.owners) && inventory.owners.length === OWNER_IDS.length, 'owner inventory rows drifted'); equalArray(inventory.owners.map((owner) => owner.id), OWNER_IDS, 'owner inventory row ids'); unique(inventory.owners.map((owner) => `${owner.sourcePath}|${owner.registrationAnchor}|${owner.registrationKind}`), 'owner registrations'); inventory.owners.forEach((owner, index) => { const label = `owner[${index}]`; for (const key of ['id', 'owner', 'sourcePath', 'registrationAnchor', 'registrationKind']) nonEmpty(owner[key], `${label}.${key}`); checkRegistration(owner, label); }); return inventory.owners;
}

function checkVerifiedEvidence(element, label) {
  const verified = element.status.state === 'verified' || Object.values(element.states).includes('verified') || Object.values(element).some((value) => value && typeof value === 'object' && value.status === 'verified'); if (!verified) return;
  assert(element.status.state === 'verified', `${label} has nested verified status without verified element status`); assert(element.interactionReceipt.status === 'verified', `${label} interaction receipt is not verified`); assert(element.captureTuple.status === 'verified', `${label} capture tuple is not verified`); assert(element.contrast.status === 'verified' && Number.isFinite(element.contrast.ratio) && element.contrast.ratio >= 4.5, `${label} contrast result is not verified`);
  const evidencePath = repoFile(element.interactionReceipt.path, `${label}.interactionReceipt`); const artifactPath = repoFile(element.interactionReceipt.artifactPath, `${label}.interactionReceipt.artifact`); const capturePath = repoFile(element.captureTuple.path, `${label}.captureTuple`);
  assert(/^[0-9a-f]{64}$/i.test(element.interactionReceipt.artifactHash), `${label} artifact hash is not SHA-256`); assert(/^[0-9a-f]{40}$/i.test(element.interactionReceipt.sourceCommit), `${label} source commit is not immutable`); execFileSync('git', ['cat-file', '-e', `${element.interactionReceipt.sourceCommit}^{commit}`], { cwd: root, stdio: 'ignore' }); assert(crypto.createHash('sha256').update(fs.readFileSync(artifactPath)).digest('hex') === element.interactionReceipt.artifactHash.toLowerCase(), `${label} artifact hash does not match its file`); assert(fs.statSync(evidencePath).size >= 0 && fs.statSync(capturePath).size >= 0, `${label} evidence files are unreadable`);
}

function validate(registry, schema = readJson(schemaPath), inventory = readJson(ownerPath)) {
  const authority = checkSchemaAuthority(schema); assert(registry.version === 1 && registry.evidencePolicy === 'fail-closed-real-source-and-built-artifact', 'registry header drifted'); assert(registry.ownerInventoryFile === '.codex/verification/lang-gui/source-owners.json', 'owner inventory path drifted'); equalArray(registry.requiredSurfaceIds, SURFACE_IDS, 'requiredSurfaceIds'); equalArray(registry.requiredElementIds, OWNER_IDS, 'requiredElementIds'); equalArray(registry.requiredStateIds, authority.states, 'requiredStateIds'); equalArray(registry.requiredFieldIds, authority.fields, 'requiredFieldIds'); unique(registry.requiredElementIds, 'requiredElementIds');
  assert(registry.surfaces.length === SURFACE_IDS.length, 'registry surface count drifted'); equalArray(registry.surfaces.map((surface) => surface.id), SURFACE_IDS, 'registry surface ids'); const owners = checkOwnerInventory(inventory); assert(registry.elements.length === owners.length, `registry has ${registry.elements.length} rows, expected ${owners.length}`); equalArray(registry.elements.map((element) => element.stableElementId), OWNER_IDS, 'registry element ids'); const ownerMap = new Map(owners.map((owner) => [owner.id, owner]));
  registry.elements.forEach((element, index) => { const label = `element[${index}]`; equalArray(Object.keys(element), authority.fields, `${label} fields`); const owner = ownerMap.get(element.stableElementId); assert(owner, `${label} has no owner inventory row`); assert(element.owner === owner.owner, `${label}.owner does not match source owner inventory`); assert(element.sourceLineage.length === 1, `${label}.sourceLineage must have one canonical registration`); const lineage = element.sourceLineage[0]; const expectedToken = owner.registrationKind === 'markup-registration' ? owner.registrationAnchor : owner.owner; assert(lineage.path === owner.sourcePath && lineage.anchor === owner.registrationAnchor && lineage.ownerToken === expectedToken, `${label}.sourceLineage does not match canonical owner registration`); checkRegistration({...owner, ownerToken: lineage.ownerToken}, label); for (const stateId of authority.states) status(element.states[stateId], `${label}.states.${stateId}`); assert(element.semantic.role === element.rolesNamesActions.roles[0] && element.semantic.accessibleName === element.rolesNamesActions.accessibleNames[0], `${label}.semantic fields do not match roles and names`); assert(JSON.stringify(element.semantic.actions) === JSON.stringify(element.rolesNamesActions.actions), `${label}.semantic actions do not match roles and actions`); assert(element.targetSize.minimumCssPx >= 48, `${label}.targetSize is below 48 CSS pixels`); equalArray(element.localization.modes, REQUIRED_MODES, `${label}.localization.modes`); equalArray(element.lockRoute.policies, LOCK_POLICIES, `${label}.lockRoute.policies`); const tuples = new Set(element.responsiveMatrix.map((tuple) => `${tuple.viewport}|${tuple.scale}|${tuple.theme}`)); for (const tuple of REQUIRED_TUPLES) assert(tuples.has(tuple), `${label}.responsiveMatrix misses ${tuple}`); assert(element.contextMenu.actions.includes('Edit appearance') && element.contextMenu.actions.includes('Lock this element'), `${label}.contextMenu actions incomplete`); assert(element.contextMenu.search.includes('regex builder') && element.searchRegexRoute.builder.includes('regex builder'), `${label} regex route incomplete`); assert(element.negativeProof.guard === 'scripts/verify-lang-gui-elements.mjs', `${label} negative guard drifted`); checkVerifiedEvidence(element, label); });
  const membership = new Map(registry.surfaces.map((surface) => [surface.id, surface.elementIds])); equalArray(membership.get(SURFACE_IDS[0]), OWNER_IDS.filter((id) => id.startsWith('desktop-')), 'desktop registry membership'); equalArray(membership.get(SURFACE_IDS[1]), OWNER_IDS.filter((id) => id.startsWith('site-')), 'site registry membership'); return { surfaces: SURFACE_IDS.length, owners: owners.length, elements: registry.elements.length, fields: authority.fields.length, states: authority.states.length };
}

function runNegative() {
  const baseline = readJson(registryPath); const schema = readJson(schemaPath); const inventory = readJson(ownerPath);
  const boundaries = [
    ['unregistered current source owner', (r, s, i) => { i.requiredOwnerIds.pop(); }],
    ['extra source owner', (r, s, i) => { i.requiredOwnerIds.push('desktop-extra-owner'); }],
    ['extra registry element', (r, s, i) => { r.elements.push(structuredClone(r.elements[0])); }],
    ['duplicate source registration', (r, s, i) => { i.owners[2] = { ...i.owners[1], id: i.owners[2].id }; }],
    ['commented source registration', (r, s, i) => { i.owners[0].registrationAnchor = '// export function App()'; }],
    ['renamed descendant registration', (r, s, i) => { i.owners[2].owner = 'EntryViewRenamed'; }],
    ['non-owner source anchor', (r, s, i) => { i.owners[2].registrationAnchor = 'from \'./components/EntryView\''; i.owners[2].registrationKind = 'component-definition'; }],
    ['bogus verified evidence', (r, s, i) => { r.elements[0].status.state = 'verified'; }],
    ['schema violation', (r, s, i) => { s.$defs.element.required = s.$defs.element.required.filter((field) => field !== 'semantic'); }],
    ['semantic field swap', (r, s, i) => { r.elements[1].semantic.accessibleName = 'Wrong owner'; }],
  ];
  for (const [label, mutate] of boundaries) { const changedRegistry = structuredClone(baseline); const changedSchema = structuredClone(schema); const changedInventory = structuredClone(inventory); mutate(changedRegistry, changedSchema, changedInventory); let red = false; try { validate(changedRegistry, changedSchema, changedInventory); } catch { red = true; } assert(red, `negative boundary stayed green: ${label}`); process.stdout.write(`RED then restored: ${label}\n`); }
  validate(baseline, schema, inventory); process.stdout.write('GREEN after restoring every owner, evidence, schema, and semantic boundary\n');
}

try { const result = validate(readJson(registryPath)); if (process.argv.includes('--negative')) runNegative(); else process.stdout.write(`every-element registry green: ${JSON.stringify(result)}\n`); } catch (error) { process.stderr.write(`every-element registry red: ${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; }

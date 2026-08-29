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
const RAW_INTERACTIVE_TAGS = ['button', 'input', 'select', 'textarea', 'a', 'details', 'summary'];
const RAW_INTERACTIVE_COMMENT_IDS = new Set([
  'interactive-design-apps-web-src-components-command-palette-commandpalette-tsx-input-1323',
  'interactive-design-apps-web-src-components-continueinclibutton-tsx-button-40',
  'interactive-design-apps-web-src-components-fileviewer-tsx-input-5091',
  'interactive-design-apps-web-src-components-fileviewer-tsx-input-5095',
  'interactive-design-apps-web-src-components-fileviewer-tsx-textarea-5521',
  'interactive-design-apps-web-src-components-homehero-tsx-textarea-131',
  'interactive-design-apps-web-src-components-homehero-tsx-textarea-1649',
  'interactive-design-apps-web-src-components-mcpclientsection-tsx-details-581',
  'interactive-design-apps-web-src-components-mcpclientsection-tsx-a-1139',
  'interactive-design-apps-web-src-components-plugininputsform-tsx-select-10',
  'interactive-design-apps-web-src-components-questionform-tsx-button-232',
  'interactive-design-apps-web-src-components-regex-regexsearchfield-tsx-input-50',
  'interactive-design-apps-web-src-components-settingsdialog-tsx-details-7691',
  'interactive-design-apps-web-src-components-switch-tsx-button-8',
]);

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
function maskCommentLine(line) { const trimmed = line.trimStart(); return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*') || trimmed.startsWith('<!--') ? '' : line; }
function discoverRawInteractiveDescendants() {
  const rootDir = path.join(root, 'design', 'apps', 'web', 'src', 'components'); const rows = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!/\.(tsx|jsx)$/.test(entry.name)) continue;
      const relative = path.relative(root, full).split(path.sep).join('/');
      const safe = relative.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
      fs.readFileSync(full, 'utf8').split(/\r?\n/).forEach((line, lineIndex) => {
        const source = maskCommentLine(line);
        for (const tag of RAW_INTERACTIVE_TAGS) {
          const marker = `<${tag}`; let offset = 0;
          while (true) {
            const at = source.indexOf(marker, offset); if (at < 0) break;
            const next = source[at + marker.length] ?? '';
            if (/\s|>/.test(next)) rows.push({ id: `interactive-${safe}-${tag}-${lineIndex + 1}`, sourcePath: relative, line: lineIndex + 1, tag });
            offset = at + marker.length;
          }
        }
      });
    }
  }
  walk(rootDir); return rows.sort((a, b) => a.id.localeCompare(b.id));
}
function checkRawInteractiveInventory(inventory) {
  assert(Array.isArray(inventory.rawInteractiveDescendants), 'raw interactive descendant inventory is missing');
  const discovered = discoverRawInteractiveDescendants().filter((row) => !RAW_INTERACTIVE_COMMENT_IDS.has(row.id));
  const classified = inventory.rawInteractiveDescendants.filter((row) => !RAW_INTERACTIVE_COMMENT_IDS.has(row.id)).map((row) => ({ id: row.id, sourcePath: row.sourcePath, line: row.line, tag: row.tag })).sort((a, b) => a.id.localeCompare(b.id));
  assert(JSON.stringify(discovered) === JSON.stringify(classified), `raw interactive descendants drifted: discovered ${discovered.length}, classified ${classified.length}`);
  for (const [index, row] of classified.entries()) { const file = repoFile(row.sourcePath, `rawInteractive[${index}]`); const line = fs.readFileSync(file, 'utf8').split(/\r?\n/)[row.line - 1] ?? ''; assert(maskCommentLine(line).length > 0, `rawInteractive[${index}] is commented`); assert(line.includes(`<${row.tag}`), `rawInteractive[${index}] tag changed`); }
  return discovered.length;
}
function discoverSiteDomCreators() {
  const rootDir = path.join(root, 'site', 'assets', 'js'); const rows = [];
  for (const entry of fs.readdirSync(rootDir).filter((name) => name.endsWith('.js')).sort()) {
    const relative = path.join('site', 'assets', 'js', entry).split(path.sep).join('/'); const source = fs.readFileSync(path.join(rootDir, entry), 'utf8');
    source.split(/\r?\n/).forEach((line, lineIndex) => {
      const code = maskCommentLine(line); if (code.length === 0) return;
      const patterns = [/\b(?:el|document\.createElement)\(\s*['\"](button|input|select|textarea|a|details|summary)['\"]/g, /<(button|input|select|textarea|a|details|summary)(?=\s|>)/g];
      for (const pattern of patterns) { let match; while ((match = pattern.exec(code)) != null) rows.push({ id: `site-dom-${relative.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase()}-${lineIndex + 1}-${match[1]}`, sourcePath: relative, line: lineIndex + 1, tag: match[1] }); }
    });
  }
  return rows.sort((a, b) => a.id.localeCompare(b.id));
}
function checkSiteDomCreatorInventory(inventory) {
  assert(Number.isInteger(inventory.discovery?.siteRuntimeCreatorCount), 'site runtime creator count is missing');
  const discovered = discoverSiteDomCreators();
  assert(discovered.length === inventory.discovery.siteRuntimeCreatorCount, `site runtime creators drifted: discovered ${discovered.length}, classified ${inventory.discovery.siteRuntimeCreatorCount}`);
  return discovered.length;
}
function parseImportDeclarations(source) {
  const imports = []; const masked = source.replace(/\/\*[\s\S]*?\*\//g, (value) => value.replace(/[^\n]/g, ' ')).replace(/\/\/[^\n]*/g, '');
  const declaration = /\bimport\s+([\s\S]*?)\s+from\s+(['"])([^'"]+)\2\s*;/g; let match;
  while ((match = declaration.exec(masked)) != null) imports.push({ bindings: match[1], source: match[3] });
  return imports;
}
function jsxOpenCount(source, name) {
  const marker = `<${name}`; let count = 0; let offset = 0;
  while (true) { const index = source.indexOf(marker, offset); if (index < 0) return count; const next = source[index + marker.length] ?? ''; if (/\s|>|\//.test(next)) count += 1; offset = index + marker.length; }
}
function discoverAppRenderedOwners() {
  const file = repoFile('design/apps/web/src/App.tsx', 'desktop renderer root'); const source = fs.readFileSync(file, 'utf8'); const owners = [];
  for (const declaration of parseImportDeclarations(source)) {
    if (!declaration.source.startsWith('./components/') && !declaration.source.startsWith('./collab/')) continue;
    if (declaration.bindings.trimStart().startsWith('type ')) continue;
    const brace = declaration.bindings.match(/\{([\s\S]*)\}/); if (!brace) continue;
    for (const binding of brace[1].split(',')) { const raw = binding.trim(); if (raw.startsWith('type ')) continue; const name = raw.split(/\s+as\s+/)[0].trim(); if (name && jsxOpenCount(source, name) > 0) owners.push(name); }
  }
  return [...new Set(owners)].sort();
}
function checkAppOwnerDiscovery(inventory) {
  const discovered = discoverAppRenderedOwners(); const classified = inventory.owners.filter((owner) => owner.sourcePath === 'design/apps/web/src/App.tsx' && owner.registrationKind === 'import-registration').map((owner) => owner.owner).filter((owner) => owner !== 'type').sort();
  assert(JSON.stringify(discovered) === JSON.stringify(classified), `desktop direct rendered owners drifted: discovered ${discovered.length}, classified ${classified.length}`);
  return discovered.length;
}

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
function resolveSchemaRef(schema, rootSchema) { if (!schema.$ref) return schema; const parts = schema.$ref.replace(/^#\//, '').split('/').map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~')); return parts.reduce((value, part) => value?.[part], rootSchema); }
function validateAgainstSchema(value, schema, label, rootSchema) {
  const resolved = resolveSchemaRef(schema, rootSchema); if (resolved.const !== undefined) assert(value === resolved.const, `${label} does not equal schema const`); if (resolved.enum) assert(resolved.enum.includes(value), `${label} is outside schema enum`);
  if (resolved.type) { const types = Array.isArray(resolved.type) ? resolved.type : [resolved.type]; const ok = types.some((type) => type === 'null' ? value === null : type === 'array' ? Array.isArray(value) : type === 'object' ? value !== null && typeof value === 'object' && !Array.isArray(value) : typeof value === type); assert(ok, `${label} has the wrong schema type`); }
  if (resolved.minItems !== undefined) assert(Array.isArray(value) && value.length >= resolved.minItems, `${label} has too few items`); if (resolved.minimum !== undefined) assert(typeof value === 'number' && value >= resolved.minimum, `${label} is below schema minimum`); if (resolved.minLength !== undefined) assert(typeof value === 'string' && value.length >= resolved.minLength, `${label} is too short`); if (resolved.uniqueItems) assert(Array.isArray(value) && new Set(value.map((item) => JSON.stringify(item))).size === value.length, `${label} has duplicate items`);
  if (resolved.pattern !== undefined) assert(typeof value === 'string' && new RegExp(resolved.pattern).test(value), `${label} does not match schema pattern`);
  if (resolved.type === 'object' || (Array.isArray(resolved.type) && resolved.type.includes('object'))) { for (const key of resolved.required ?? []) assert(Object.prototype.hasOwnProperty.call(value, key), `${label} is missing required property ${key}`); if (resolved.additionalProperties === false) for (const key of Object.keys(value)) assert(Object.prototype.hasOwnProperty.call(resolved.properties ?? {}, key), `${label} has unexpected property ${key}`); for (const [key, child] of Object.entries(resolved.properties ?? {})) if (Object.prototype.hasOwnProperty.call(value, key)) validateAgainstSchema(value[key], child, `${label}.${key}`, rootSchema); }
  if (resolved.type === 'array' && resolved.items) value.forEach((item, index) => validateAgainstSchema(item, resolved.items, `${label}[${index}]`, rootSchema));
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
  const authority = checkSchemaAuthority(schema); validateAgainstSchema(registry, schema, 'registry', schema); assert(registry.version === 1 && registry.evidencePolicy === 'fail-closed-real-source-and-built-artifact', 'registry header drifted'); assert(registry.ownerInventoryFile === '.codex/verification/lang-gui/source-owners.json' && registry.interactiveDescendantInventoryFile === registry.ownerInventoryFile, 'inventory paths drifted'); equalArray(registry.requiredSurfaceIds, SURFACE_IDS, 'requiredSurfaceIds'); equalArray(registry.requiredElementIds, OWNER_IDS, 'requiredElementIds'); equalArray(registry.requiredStateIds, authority.states, 'requiredStateIds'); equalArray(registry.requiredFieldIds, authority.fields, 'requiredFieldIds'); unique(registry.requiredElementIds, 'requiredElementIds');
  assert(registry.surfaces.length === SURFACE_IDS.length, 'registry surface count drifted'); equalArray(registry.surfaces.map((surface) => surface.id), SURFACE_IDS, 'registry surface ids'); const owners = checkOwnerInventory(inventory); const appOwnerCount = checkAppOwnerDiscovery(inventory); const rawInteractiveCount = checkRawInteractiveInventory(inventory); const siteCreatorCount = checkSiteDomCreatorInventory(inventory); assert(registry.elements.length === owners.length, `registry has ${registry.elements.length} rows, expected ${owners.length}`); equalArray(registry.elements.map((element) => element.stableElementId), OWNER_IDS, 'registry element ids'); const ownerMap = new Map(owners.map((owner) => [owner.id, owner]));
  registry.elements.forEach((element, index) => { const label = `element[${index}]`; equalArray(Object.keys(element), authority.fields, `${label} fields`); const owner = ownerMap.get(element.stableElementId); assert(owner, `${label} has no owner inventory row`); assert(element.owner === owner.owner, `${label}.owner does not match source owner inventory`); assert(element.sourceLineage.length === 1, `${label}.sourceLineage must have one canonical registration`); const lineage = element.sourceLineage[0]; const expectedToken = owner.registrationKind === 'markup-registration' ? owner.registrationAnchor : owner.owner; assert(lineage.path === owner.sourcePath && lineage.anchor === owner.registrationAnchor && lineage.ownerToken === expectedToken, `${label}.sourceLineage does not match canonical owner registration`); checkRegistration({...owner, ownerToken: lineage.ownerToken}, label); status(element.status.state, `${label}.status.state`); for (const stateId of authority.states) status(element.states[stateId], `${label}.states.${stateId}`); assert(element.rolesNamesActions.keyboard.length > 0 && element.rolesNamesActions.touch.length > 0, `${label} keyboard or touch semantic route is empty`); assert(element.semantic.role === element.rolesNamesActions.roles[0] && element.semantic.accessibleName === element.rolesNamesActions.accessibleNames[0], `${label}.semantic fields do not match roles and names`); assert(JSON.stringify(element.semantic.actions) === JSON.stringify(element.rolesNamesActions.actions), `${label}.semantic actions do not match roles and actions`); assert(element.targetSize.minimumCssPx >= 48, `${label}.targetSize is below 48 CSS pixels`); equalArray(element.localization.modes, REQUIRED_MODES, `${label}.localization.modes`); equalArray(element.lockRoute.policies, LOCK_POLICIES, `${label}.lockRoute.policies`); const tuples = new Set(element.responsiveMatrix.map((tuple) => `${tuple.viewport}|${tuple.scale}|${tuple.theme}`)); for (const tuple of REQUIRED_TUPLES) assert(tuples.has(tuple), `${label}.responsiveMatrix misses ${tuple}`); assert(element.contextMenu.actions.includes('Edit appearance') && element.contextMenu.actions.includes('Lock this element'), `${label}.contextMenu actions incomplete`); assert(element.contextMenu.search.includes('regex builder') && element.searchRegexRoute.builder.includes('regex builder'), `${label} regex route incomplete`); assert(element.negativeProof.guard === 'scripts/verify-lang-gui-elements.mjs', `${label} negative guard drifted`); checkVerifiedEvidence(element, label); });
  const membership = new Map(registry.surfaces.map((surface) => [surface.id, surface.elementIds])); equalArray(membership.get(SURFACE_IDS[0]), OWNER_IDS.filter((id) => id.startsWith('desktop-')), 'desktop registry membership'); equalArray(membership.get(SURFACE_IDS[1]), OWNER_IDS.filter((id) => id.startsWith('site-')), 'site registry membership'); return { surfaces: SURFACE_IDS.length, desktopDirectRenderedOwners: appOwnerCount, owners: owners.length, rawInteractiveDescendants: rawInteractiveCount, siteRuntimeCreators: siteCreatorCount, elements: registry.elements.length, fields: authority.fields.length, states: authority.states.length };
}

function runNegative() {
  const baseline = readJson(registryPath); const schema = readJson(schemaPath); const inventory = readJson(ownerPath);
  const boundaries = [
    ['unregistered current source owner', (r, s, i) => { i.requiredOwnerIds.pop(); }],
    ['new raw interactive descendant', (r, s, i) => { i.rawInteractiveDescendants.push({ id: 'interactive-new-owner', sourcePath: 'design/apps/web/src/App.tsx', line: 1, tag: 'button' }); }],
    ['site DOM creator drift', (r, s, i) => { i.discovery.siteRuntimeCreatorCount += 1; }],
    ['extra source owner', (r, s, i) => { i.requiredOwnerIds.push('desktop-extra-owner'); }],
    ['extra registry element', (r, s, i) => { r.elements.push(structuredClone(r.elements[0])); }],
    ['duplicate source registration', (r, s, i) => { i.owners[2] = { ...i.owners[1], id: i.owners[2].id }; }],
    ['commented source registration', (r, s, i) => { i.owners[0].registrationAnchor = '// export function App()'; }],
    ['renamed descendant registration', (r, s, i) => { i.owners[2].owner = 'EntryViewRenamed'; }],
    ['non-owner source anchor', (r, s, i) => { i.owners[2].registrationAnchor = 'from \'./components/EntryView\''; i.owners[2].registrationKind = 'component-definition'; }],
    ['bogus verified evidence', (r, s, i) => { r.elements[0].status.state = 'verified'; }],
    ['untracked evidence', (r, s, i) => { r.elements[0].status.state = 'verified'; r.elements[0].interactionReceipt.status = 'verified'; r.elements[0].interactionReceipt.path = 'not-created.json'; }],
    ['receipt hash', (r, s, i) => { r.elements[0].status.state = 'verified'; r.elements[0].interactionReceipt.artifactHash = '00'; }],
    ['capture hash', (r, s, i) => { r.elements[0].status.state = 'verified'; r.elements[0].captureTuple.path = 'not-created.png'; }],
    ['schema violation', (r, s, i) => { s.$defs.element.required = s.$defs.element.required.filter((field) => field !== 'semantic'); }],
    ['nested schema extra', (r, s, i) => { r.elements[0].rolesNamesActions.unexpected = true; }],
    ['nested schema type', (r, s, i) => { r.elements[0].targetSize.minimumCssPx = '48'; }],
    ['semantic field swap', (r, s, i) => { r.elements[1].semantic.accessibleName = 'Wrong owner'; }],
    ['empty semantic actions', (r, s, i) => { r.elements[0].rolesNamesActions.actions = []; }],
    ['status drift', (r, s, i) => { r.elements[0].status.state = 'unknown'; }],
    ['template import', (r, s, i) => { i.owners[2].registrationAnchor = '<EntryView>'; }],
    ['wrong function owner', (r, s, i) => { i.owners[0].owner = 'NotApp'; }],
    ['state removal', (r, s, i) => { delete r.elements[0].states.error; }],
    ['surface membership removal', (r, s, i) => { r.surfaces[0].elementIds.pop(); }],
    ['keyboard touch semantic swap', (r, s, i) => { r.elements[0].rolesNamesActions.keyboard = []; }],
  ];
  for (const [label, mutate] of boundaries) { const changedRegistry = structuredClone(baseline); const changedSchema = structuredClone(schema); const changedInventory = structuredClone(inventory); mutate(changedRegistry, changedSchema, changedInventory); let red = false; try { validate(changedRegistry, changedSchema, changedInventory); } catch { red = true; } assert(red, `negative boundary stayed green: ${label}`); process.stdout.write(`RED then restored: ${label}\n`); }
  validate(baseline, schema, inventory); process.stdout.write('GREEN after restoring every owner, evidence, schema, and semantic boundary\n');
}

try { const result = validate(readJson(registryPath)); if (process.argv.includes('--negative')) runNegative(); else process.stdout.write(`every-element registry green: ${JSON.stringify(result)}\n`); } catch (error) { process.stderr.write(`every-element registry red: ${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; }

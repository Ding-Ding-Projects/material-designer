#!/usr/bin/env node

/**
 * Fail-closed validation for the every-element Material Design registry.
 *
 * The source inventories are explicit committed classifications. Discovery is
 * parser-backed and bidirectional: a new AST node without a row is red, and a
 * stale row without a current AST node is red. The registry remains honest
 * about runtime proof, so no row becomes verified without immutable evidence.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import {
  classifyDesktopModuleFixture,
  classifyModuleEdgesFixture,
  classifySiteModuleFixture,
  compareSourceClassification,
  discoverSourceClassification,
  findAstRegistrations,
  loadDeclaredParser,
  sha256,
  stableJson,
  validateAstRegistrations,
} from './lang-gui-source-classifier.mjs';

const root = process.cwd();
const verificationRoot = path.join(root, '.codex', 'verification', 'lang-gui');
const registryPath = path.join(verificationRoot, 'registry.json');
const registrySchemaPath = path.join(verificationRoot, 'registry.schema.json');
const ownerPath = path.join(verificationRoot, 'source-owners.json');
const ownerSchemaPath = path.join(verificationRoot, 'source-owners.schema.json');
const desktopPath = path.join(verificationRoot, 'desktop-elements.json');
const desktopSchemaPath = path.join(verificationRoot, 'desktop-elements.schema.json');
const sitePath = path.join(verificationRoot, 'site-elements.json');
const siteSchemaPath = path.join(verificationRoot, 'site-elements.schema.json');

const SURFACE_IDS = ['windows-desktop-application', 'documentation-site'];
const OWNER_IDS = [
  'desktop-app-root', 'desktop-update-menu', 'desktop-entry-view', 'desktop-marketplace-view', 'desktop-plugin-detail-view', 'desktop-memory-toast', 'desktop-toast', 'desktop-centered-loader', 'desktop-pet-overlay', 'desktop-project-view', 'desktop-project-creation-pending', 'desktop-experience-survey', 'desktop-tooltip-layer', 'desktop-update-dialog', 'desktop-updater-popup', 'desktop-workspace-tabs', 'desktop-account-cluster', 'desktop-front-provenance', 'desktop-project-recovery-tip', 'desktop-design-system-creation', 'desktop-design-system-detail', 'desktop-iframe-keep-alive', 'desktop-settings-dialog', 'desktop-privacy-consent', 'desktop-collab-demo', 'desktop-workspace-member-directory', 'desktop-community-view',
  'site-topbar-brand', 'site-front-provenance', 'site-tab-strip', 'site-content-search', 'site-command-palette', 'site-notification-center', 'site-theme-toggle', 'site-search-results', 'site-overview-hero', 'site-settings-language', 'site-settings-funny-levels', 'site-settings-appearance', 'site-settings-toy-lock', 'site-settings-reset', 'site-statusbar',
];
const STATUS_VALUES = new Set(['partial', 'unverified', 'verified', 'not-applicable']);
const LOCK_POLICIES = ['PIN', 'password', 'PIN plus password', 'password plus TOTP', 'PIN plus TOTP', 'password plus PIN plus TOTP'];
const REQUIRED_MODES = ['English', 'playful Hong Kong-style Cantonese', 'bilingual'];
const REQUIRED_TUPLES = new Set(['1280x720|1|light', '1280x720|1.5|dark', '320x640|1|light', '320x640|2|dark']);

function readJson(file) {
  if (!fs.existsSync(file)) throw new Error(`missing file: ${path.relative(root, file)}`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function equalArray(actual, expected, label) {
  assert(Array.isArray(actual), `${label} must be an array`);
  assert(actual.length === expected.length, `${label} has ${actual.length}, expected ${expected.length}`);
  expected.forEach((value, index) => assert(actual[index] === value, `${label}[${index}] drifted`));
}

function unique(values, label) {
  assert(new Set(values).size === values.length, `${label} contains duplicates`);
}

function status(value, label) {
  assert(STATUS_VALUES.has(value), `${label} has invalid status ${String(value)}`);
}

function resolveSchemaRef(schema, rootSchema) {
  if (!schema.$ref) return schema;
  const parts = schema.$ref.replace(/^#\//, '').split('/').map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'));
  const resolved = parts.reduce((value, part) => value?.[part], rootSchema);
  if (!resolved) throw new Error(`schema reference is unresolved: ${schema.$ref}`);
  return resolved;
}

function schemaTypeMatches(value, type) {
  if (type === 'null') return value === null;
  if (type === 'array') return Array.isArray(value);
  if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  if (type === 'integer') return Number.isInteger(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  return typeof value === type;
}

function validateAgainstSchema(value, schema, label, rootSchema) {
  const resolved = resolveSchemaRef(schema, rootSchema);
  if (resolved.const !== undefined) assert(value === resolved.const, `${label} does not equal schema const`);
  if (resolved.enum) assert(resolved.enum.includes(value), `${label} is outside schema enum`);
  if (resolved.not?.const !== undefined) assert(value !== resolved.not.const, `${label} equals forbidden schema const`);
  if (resolved.type) {
    const types = Array.isArray(resolved.type) ? resolved.type : [resolved.type];
    assert(types.some((type) => schemaTypeMatches(value, type)), `${label} has the wrong schema type`);
  }
  if (Array.isArray(value)) {
    if (resolved.minItems !== undefined) assert(value.length >= resolved.minItems, `${label} has too few items`);
    if (resolved.maxItems !== undefined) assert(value.length <= resolved.maxItems, `${label} has too many items`);
    if (resolved.uniqueItems) assert(new Set(value.map((item) => JSON.stringify(item))).size === value.length, `${label} has duplicate items`);
    if (resolved.items) value.forEach((item, index) => validateAgainstSchema(item, resolved.items, `${label}[${index}]`, rootSchema));
  }
  if (typeof value === 'string') {
    if (resolved.minLength !== undefined) assert(value.length >= resolved.minLength, `${label} is too short`);
    if (resolved.pattern !== undefined) assert(new RegExp(resolved.pattern).test(value), `${label} does not match schema pattern`);
  }
  if (typeof value === 'number') {
    if (resolved.minimum !== undefined) assert(value >= resolved.minimum, `${label} is below schema minimum`);
    if (resolved.maximum !== undefined) assert(value <= resolved.maximum, `${label} is above schema maximum`);
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of resolved.required ?? []) assert(Object.prototype.hasOwnProperty.call(value, key), `${label} is missing required property ${key}`);
    if (resolved.additionalProperties === false) for (const key of Object.keys(value)) assert(Object.prototype.hasOwnProperty.call(resolved.properties ?? {}, key), `${label} has unexpected property ${key}`);
    for (const [key, child] of Object.entries(resolved.properties ?? {})) if (Object.prototype.hasOwnProperty.call(value, key)) validateAgainstSchema(value[key], child, `${label}.${key}`, rootSchema);
  }
}

function assertClosedObjectSchemas(schema, label) {
  const visit = (value, location) => {
    if (!value || typeof value !== 'object') return;
    if (value.type === 'object' && value.properties && value.additionalProperties !== false) throw new Error(`${label} fixed object schema is open at ${location}`);
    for (const [key, child] of Object.entries(value)) {
      if (key === 'properties' || key === '$defs' || key === 'items') visit(child, `${location}.${key}`);
      else if (child && typeof child === 'object') visit(child, `${location}.${key}`);
    }
  };
  visit(schema, '$');
}

function validateSchemaDocument(value, schema, label) {
  assertClosedObjectSchemas(schema, label);
  validateAgainstSchema(value, schema, label, schema);
}

function repoFile(baseRoot, relativePath, label) {
  assert(typeof relativePath === 'string' && relativePath.length > 0, `${label} path is missing`);
  assert(!path.isAbsolute(relativePath), `${label} path must be relative`);
  const resolved = path.resolve(baseRoot, ...relativePath.split('/'));
  assert(resolved.startsWith(`${path.resolve(baseRoot)}${path.sep}`), `${label} path escapes its repository`);
  assert(fs.existsSync(resolved), `${label} path is missing: ${relativePath}`);
  return resolved;
}

function gitText(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function gitBlobAt(cwd, commit, relativePath, label) {
  let output;
  try {
    output = gitText(cwd, ['ls-tree', '-r', '--full-tree', commit, '--', relativePath]);
  } catch {
    throw new Error(`${label} path is not a committed blob at source commit`);
  }
  const match = output.match(/^\d+\s+blob\s+([0-9a-f]{40})\t(.+)$/);
  assert(match && match[2] === relativePath, `${label} path is not a committed blob at source commit`);
  return match[1];
}

function workingBlob(cwd, file) {
  return gitText(cwd, ['hash-object', '--', file]);
}

function artifactSignature(buffer) {
  if (buffer.length >= 68 && buffer[0] === 0x4d && buffer[1] === 0x5a) {
    const peOffset = buffer.readUInt32LE(0x3c);
    if (peOffset >= 0x40 && peOffset + 4 <= buffer.length && buffer.subarray(peOffset, peOffset + 4).equals(Buffer.from([0x50, 0x45, 0x00, 0x00]))) return 'portable-executable';
  }
  if (buffer.length >= 22 && buffer[0] === 0x50 && buffer[1] === 0x4b && [0x03, 0x05, 0x07].includes(buffer[2])) {
    const start = Math.max(0, buffer.length - 65557);
    for (let offset = buffer.length - 22; offset >= start; offset -= 1) {
      if (buffer.readUInt32LE(offset) !== 0x06054b50) continue;
      const directorySize = buffer.readUInt32LE(offset + 12);
      const directoryOffset = buffer.readUInt32LE(offset + 16);
      const commentLength = buffer.readUInt16LE(offset + 20);
      if (offset + 22 + commentLength === buffer.length && directoryOffset + directorySize <= offset) return 'zip-container';
    }
  }
  throw new Error('artifact signature is not an allowed packaged application format');
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function validatePng(buffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  assert(buffer.length >= 33 && buffer.subarray(0, 8).equals(signature), 'capture is not a valid PNG signature');
  let offset = 8;
  let width = null;
  let height = null;
  let bitDepth = null;
  let colorType = null;
  let sawIdat = false;
  let sawIend = false;
  const compressed = [];
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const typeStart = offset + 4;
    const dataStart = offset + 8;
    const crcOffset = dataStart + length;
    assert(crcOffset + 4 <= buffer.length, 'capture PNG chunk exceeds file bounds');
    const type = buffer.subarray(typeStart, dataStart).toString('ascii');
    const data = buffer.subarray(dataStart, crcOffset);
    const expectedCrc = buffer.readUInt32BE(crcOffset);
    assert(crc32(Buffer.concat([buffer.subarray(typeStart, dataStart), data])) === expectedCrc, `capture PNG ${type} CRC is invalid`);
    if (type === 'IHDR') {
      assert(length === 13 && width === null, 'capture PNG IHDR is invalid');
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      assert(width > 0 && height > 0 && data[10] === 0 && data[11] === 0 && [0, 1].includes(data[12]), 'capture PNG dimensions or encoding are invalid');
      assert(width <= 32768 && height <= 32768 && width * height <= 100000000, 'capture PNG dimensions exceed evidence bounds');
    } else if (type === 'IDAT') {
      sawIdat = true;
      compressed.push(data);
    } else if (type === 'IEND') {
      assert(length === 0, 'capture PNG IEND is invalid');
      sawIend = true;
      break;
    }
    offset = crcOffset + 4;
  }
  assert(width !== null && sawIdat && sawIend, 'capture PNG is missing IHDR, IDAT, or IEND');
  let inflated;
  try {
    inflated = zlib.inflateSync(Buffer.concat(compressed), { maxOutputLength: Math.max(1024, width * height * 8 + height) });
  } catch {
    throw new Error('capture PNG image data is not decodable');
  }
  const channels = new Map([[0, 1], [2, 3], [3, 1], [4, 2], [6, 4]]).get(colorType);
  assert(channels && [1, 2, 4, 8, 16].includes(bitDepth), 'capture PNG color type or bit depth is unsupported');
  const rowBytes = Math.ceil(width * channels * bitDepth / 8);
  assert(inflated.length === height * (rowBytes + 1), 'capture PNG decoded dimensions do not match IHDR');
  return { width, height };
}

function checkVerifiedEvidence(element, label, registrySchema, evidenceRoot = root, gitCwd = root) {
  const nestedVerified = element.status.state === 'verified' || Object.values(element.states).includes('verified') || Object.values(element).some((value) => value && typeof value === 'object' && value.status === 'verified');
  if (!nestedVerified) {
    assert(element.status.state !== 'verified', `${label} verified state is inconsistent`);
    assert(element.interactionReceipt.status !== 'verified' && element.captureTuple.status !== 'verified' && element.contrast.status !== 'verified', `${label} carries verified evidence under an unverified element`);
    return null;
  }
  assert(element.status.state === 'verified', `${label} has nested verified status without verified element status`);
  assert(element.interactionReceipt.status === 'verified', `${label} interaction receipt is not verified`);
  assert(element.captureTuple.status === 'verified', `${label} capture tuple is not verified`);
  assert(element.contrast.status === 'verified' && Number.isFinite(element.contrast.ratio) && element.contrast.ratio >= 4.5, `${label} contrast result is not verified`);
  const receipt = element.interactionReceipt;
  const capture = element.captureTuple;
  const rolePaths = [receipt.artifactPath, receipt.path, capture.path];
  assert(new Set(rolePaths).size === 3, `${label} evidence role paths must be distinct`);
  assert(/^[0-9a-f]{40}$/.test(receipt.sourceCommit), `${label} source commit is not immutable`);
  assert(/^[0-9a-f]{40}$/.test(receipt.artifactSourceCommit), `${label} artifact source commit is not immutable`);
  try {
    execFileSync('git', ['cat-file', '-e', `${receipt.sourceCommit}^{commit}`], { cwd: gitCwd, stdio: 'ignore' });
    execFileSync('git', ['cat-file', '-e', `${receipt.artifactSourceCommit}^{commit}`], { cwd: gitCwd, stdio: 'ignore' });
  } catch {
    throw new Error(`${label} source or artifact source commit does not exist`);
  }
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', receipt.artifactSourceCommit, receipt.sourceCommit], { cwd: gitCwd, stdio: 'ignore' });
  } catch {
    throw new Error(`${label} artifact source commit is not an ancestor of source commit`);
  }
  const artifactFile = repoFile(evidenceRoot, receipt.artifactPath, `${label} artifact`);
  const receiptFile = repoFile(evidenceRoot, receipt.path, `${label} receipt`);
  const captureFile = repoFile(evidenceRoot, capture.path, `${label} capture`);
  const artifactBlob = gitBlobAt(gitCwd, receipt.sourceCommit, receipt.artifactPath, `${label} artifact`);
  const receiptBlob = gitBlobAt(gitCwd, receipt.sourceCommit, receipt.path, `${label} receipt`);
  const captureBlob = gitBlobAt(gitCwd, receipt.sourceCommit, capture.path, `${label} capture`);
  assert(artifactBlob === receipt.artifactGitBlob, `${label} artifact Git blob does not match source commit`);
  assert(receiptBlob === receipt.receiptGitBlob, `${label} receipt Git blob does not match source commit`);
  assert(captureBlob === capture.captureGitBlob, `${label} capture Git blob does not match source commit`);
  assert(workingBlob(gitCwd, artifactFile) === artifactBlob && workingBlob(gitCwd, receiptFile) === receiptBlob && workingBlob(gitCwd, captureFile) === captureBlob, `${label} working evidence bytes differ from source commit`);
  const artifactBytes = fs.readFileSync(artifactFile);
  const receiptBytes = fs.readFileSync(receiptFile);
  const captureBytes = fs.readFileSync(captureFile);
  assert(sha256(artifactBytes) === receipt.artifactHash, `${label} artifact SHA-256 does not match its file`);
  assert(sha256(receiptBytes) === receipt.receiptHash, `${label} receipt SHA-256 does not match its file`);
  assert(sha256(captureBytes) === capture.captureHash, `${label} capture SHA-256 does not match its file`);
  artifactSignature(artifactBytes);
  const dimensions = validatePng(captureBytes);
  assert(capture.mediaType === 'image/png' && dimensions.width === capture.width && dimensions.height === capture.height, `${label} capture media metadata does not match PNG bytes`);
  let receiptDocument;
  try {
    receiptDocument = JSON.parse(receiptBytes.toString('utf8'));
  } catch {
    throw new Error(`${label} interaction receipt is not valid JSON`);
  }
  validateAgainstSchema(receiptDocument, registrySchema.$defs.receiptDocument, `${label}.receipt`, registrySchema);
  assert(receiptDocument.elementId === element.stableElementId, `${label} receipt element id does not match`);
  assert(receiptDocument.sourceCommit === receipt.artifactSourceCommit, `${label} receipt source SHA does not match`);
  assert(receiptDocument.artifact.path === receipt.artifactPath && receiptDocument.artifact.sha256 === receipt.artifactHash && receiptDocument.artifact.gitBlob === receipt.artifactGitBlob, `${label} receipt artifact identity does not match`);
  assert(receiptDocument.capture.path === capture.path && receiptDocument.capture.sha256 === capture.captureHash && receiptDocument.capture.gitBlob === capture.captureGitBlob, `${label} receipt capture identity does not match`);
  assert(receiptDocument.capture.width === capture.width && receiptDocument.capture.height === capture.height && receiptDocument.capture.mediaType === capture.mediaType, `${label} receipt capture metadata does not match`);
  const tuple = receiptDocument.tuple;
  assert(tuple.route === capture.route && tuple.state === capture.state && tuple.theme === capture.theme && tuple.viewport === capture.viewport && tuple.scale === capture.scale, `${label} interaction receipt tuple does not match capture tuple`);
  assert(capture.artifactHash === receipt.artifactHash, `${label} capture artifact hash is stale`);
  assert(receipt.privacy === 'pass' && capture.privacy === 'pass' && receiptDocument.privacy.status === 'pass', `${label} evidence privacy verdict is not pass`);
  assert(receiptDocument.contrast.status === 'verified' && receiptDocument.contrast.ratio === element.contrast.ratio && capture.contrast === element.contrast.ratio && receiptDocument.contrast.foreground === element.contrast.foreground && receiptDocument.contrast.background === element.contrast.background, `${label} receipt contrast does not match element contrast`);
  return { paths: rolePaths, artifactBlob, receiptBlob, captureBlob };
}

function recordEvidenceRoles(roleMap, evidence, label) {
  for (const rolePath of evidence.paths) {
    assert(!roleMap.has(rolePath), `${label} reuses evidence path ${rolePath} from ${roleMap.get(rolePath)}`);
    roleMap.set(rolePath, label);
  }
}

function checkSchemaAuthority(schema) {
  assert(schema.$defs?.element?.required && schema.$defs?.states?.required && schema.$defs?.receiptDocument, 'schema lacks element, state, or receipt authority');
  const fields = schema.$defs.element.required;
  const states = schema.$defs.states.required;
  assert(fields.includes('semantic') && fields.length === 30, `schema authority has ${fields.length} fields, expected 30`);
  equalArray(states, ['normal', 'hover', 'focus', 'pressed', 'selected', 'disabled', 'dragged', 'validation', 'loading', 'success', 'warning', 'error'], 'schema state authority');
  return { fields, states };
}

function checkOwnerInventory(inventory, ownerSchema, parser, siteInventory) {
  validateSchemaDocument(inventory, ownerSchema, 'ownerInventory');
  equalArray(inventory.requiredOwnerIds, OWNER_IDS, 'requiredOwnerIds');
  unique(inventory.requiredOwnerIds, 'requiredOwnerIds');
  equalArray(inventory.surfaces.map((surface) => surface.id), SURFACE_IDS, 'owner inventory surface ids');
  const membership = inventory.surfaces.flatMap((surface) => surface.ownerIds);
  equalArray(membership, OWNER_IDS, 'owner inventory membership');
  equalArray(inventory.owners.map((owner) => owner.id), OWNER_IDS, 'owner inventory row ids');
  unique(inventory.owners.map((owner) => owner.registrationAnchor), 'owner AST registration identities');
  validateAstRegistrations(root, parser, inventory.owners, siteInventory.htmlElements);
  return inventory.owners;
}

function validateAll(registry, registrySchema, inventory, ownerSchema, desktopInventory, desktopSchema, siteInventory, siteSchema, options = {}) {
  const parser = options.parser ?? loadDeclaredParser(root);
  assertClosedObjectSchemas(registrySchema, 'registrySchema');
  assertClosedObjectSchemas(ownerSchema, 'ownerSchema');
  assertClosedObjectSchemas(desktopSchema, 'desktopSchema');
  assertClosedObjectSchemas(siteSchema, 'siteSchema');
  validateAgainstSchema(registry, registrySchema, 'registry', registrySchema);
  validateAgainstSchema(desktopInventory, desktopSchema, 'desktopInventory', desktopSchema);
  validateAgainstSchema(siteInventory, siteSchema, 'siteInventory', siteSchema);
  const authority = checkSchemaAuthority(registrySchema);
  assert(registry.version === 2, 'registry version drifted');
  equalArray(registry.requiredSurfaceIds, SURFACE_IDS, 'requiredSurfaceIds');
  equalArray(registry.requiredElementIds, OWNER_IDS, 'requiredElementIds');
  equalArray(registry.requiredStateIds, authority.states, 'requiredStateIds');
  equalArray(registry.requiredFieldIds, authority.fields, 'requiredFieldIds');
  const owners = checkOwnerInventory(inventory, ownerSchema, parser, siteInventory);
  const discovered = options.discovered ?? discoverSourceClassification(root, desktopInventory, siteInventory);
  const sourceCounts = compareSourceClassification(discovered, desktopInventory, siteInventory);
  const expectedDiscovery = {
    desktopEntryRootCount: sourceCounts.desktopEntryRoots,
    desktopReachableModuleCount: sourceCounts.desktopReachableModules,
    desktopOwnerCount: sourceCounts.desktopOwners,
    desktopRenderReachableOwnerCount: sourceCounts.desktopRenderReachableOwners,
    desktopElementCount: sourceCounts.desktopElements,
    desktopSourceExclusionCount: sourceCounts.desktopSourceExclusions,
    desktopCommentExclusionCount: sourceCounts.desktopCommentExclusions,
    siteHtmlElementCount: sourceCounts.siteHtmlElements,
    siteRuntimeCreatorCount: sourceCounts.siteRuntimeCreators,
    siteCommentExclusionCount: sourceCounts.siteCommentExclusions,
    dynamicLimitCount: sourceCounts.dynamicLimits,
    status: 'explicit-source-classification',
  };
  assert(JSON.stringify(inventory.discovery) === JSON.stringify(expectedDiscovery), 'owner inventory discovery counts drifted');
  equalArray(registry.surfaces.map((surface) => surface.id), SURFACE_IDS, 'registry surface ids');
  assert(registry.elements.length === owners.length, `registry has ${registry.elements.length} rows, expected ${owners.length}`);
  equalArray(registry.elements.map((element) => element.stableElementId), OWNER_IDS, 'registry element ids');
  const ownerMap = new Map(owners.map((owner) => [owner.id, owner]));
  const evidenceRoles = new Map();
  registry.elements.forEach((element, index) => {
    const label = `registry.elements[${index}]`;
    equalArray(Object.keys(element), authority.fields, `${label} fields`);
    const owner = ownerMap.get(element.stableElementId);
    assert(owner, `${label} has no owner inventory row`);
    assert(element.owner === owner.owner, `${label}.owner does not match source owner inventory`);
    assert(element.sourceLineage.length === 1, `${label}.sourceLineage must have one canonical registration`);
    const lineage = element.sourceLineage[0];
    assert(lineage.path === owner.sourcePath && lineage.anchor === owner.registrationAnchor && lineage.kind === owner.registrationNodeKind && lineage.ownerToken === owner.owner && lineage.sourceHash === owner.registrationSourceHash, `${label}.sourceLineage does not match AST owner registration`);
    status(element.status.state, `${label}.status.state`);
    for (const stateId of authority.states) status(element.states[stateId], `${label}.states.${stateId}`);
    assert(element.rolesNamesActions.keyboard.length > 0 && element.rolesNamesActions.touch.length > 0, `${label} keyboard or touch semantic route is empty`);
    assert(element.semantic.role === element.rolesNamesActions.roles[0] && element.semantic.accessibleName === element.rolesNamesActions.accessibleNames[0], `${label}.semantic fields do not match roles and names`);
    assert(JSON.stringify(element.semantic.actions) === JSON.stringify(element.rolesNamesActions.actions), `${label}.semantic actions do not match roles and actions`);
    assert(element.targetSize.minimumCssPx >= 48, `${label}.targetSize is below 48 CSS pixels`);
    equalArray(element.localization.modes, REQUIRED_MODES, `${label}.localization.modes`);
    equalArray(element.lockRoute.policies, LOCK_POLICIES, `${label}.lockRoute.policies`);
    const tuples = new Set(element.responsiveMatrix.map((tuple) => `${tuple.viewport}|${tuple.scale}|${tuple.theme}`));
    for (const tuple of REQUIRED_TUPLES) assert(tuples.has(tuple), `${label}.responsiveMatrix misses ${tuple}`);
    assert(element.contextMenu.actions.includes('Edit appearance') && element.contextMenu.actions.includes('Lock this element'), `${label}.contextMenu actions incomplete`);
    assert(element.contextMenu.search.includes('regex builder') && element.searchRegexRoute.builder.includes('regex builder'), `${label} regex route incomplete`);
    assert(element.negativeProof.guard === 'scripts/verify-lang-gui-elements.mjs', `${label} negative guard drifted`);
    const evidence = checkVerifiedEvidence(element, label, registrySchema, options.evidenceRoot ?? root, options.gitCwd ?? root);
    if (evidence) recordEvidenceRoles(evidenceRoles, evidence, label);
  });
  const surfaceMembership = new Map(registry.surfaces.map((surface) => [surface.id, surface.elementIds]));
  equalArray(surfaceMembership.get(SURFACE_IDS[0]), OWNER_IDS.filter((id) => id.startsWith('desktop-')), 'desktop registry membership');
  equalArray(surfaceMembership.get(SURFACE_IDS[1]), OWNER_IDS.filter((id) => id.startsWith('site-')), 'site registry membership');
  return { surfaces: SURFACE_IDS.length, registryOwners: owners.length, registryElements: registry.elements.length, fields: authority.fields.length, states: authority.states.length, ...sourceCounts };
}

function refreshClassifications() {
  const parser = loadDeclaredParser(root);
  const oldInventory = readJson(ownerPath);
  const existingDesktop = fs.existsSync(desktopPath) ? readJson(desktopPath) : null;
  const existingSite = fs.existsSync(sitePath) ? readJson(sitePath) : null;
  const discovered = discoverSourceClassification(root, existingDesktop, existingSite);
  fs.writeFileSync(desktopPath, stableJson(discovered.desktop));
  fs.writeFileSync(sitePath, stableJson(discovered.site));
  const registryOwners = oldInventory.version === 2
    ? oldInventory.owners
    : findAstRegistrations(root, parser, oldInventory.owners, discovered.site.htmlElements);
  const counts = {
    desktopEntryRootCount: discovered.desktop.entryRoots.length,
    desktopReachableModuleCount: discovered.desktop.reachableModules.length,
    desktopOwnerCount: discovered.desktop.owners.length,
    desktopRenderReachableOwnerCount: discovered.desktop.renderReachableOwnerIds.length,
    desktopElementCount: discovered.desktop.elements.length,
    desktopSourceExclusionCount: discovered.desktop.sourceExclusions.length,
    desktopCommentExclusionCount: discovered.desktop.commentExclusions.length,
    siteHtmlElementCount: discovered.site.htmlElements.length,
    siteRuntimeCreatorCount: discovered.site.runtimeCreators.length,
    siteCommentExclusionCount: discovered.site.commentExclusions.length,
    dynamicLimitCount: discovered.desktop.dynamicLimits.length + discovered.site.dynamicLimits.length,
    status: 'explicit-source-classification',
  };
  const inventory = {
    $schema: './source-owners.schema.json',
    version: 2,
    extensionNamespace: { name: 'material-designer.lang-gui.owner-inventory', version: 1 },
    inventoryBoundary: 'registry-surface-owners-plus-complete-source-classification',
    parser: { package: parser.packageName, version: parser.version, manifestPath: parser.manifestPath },
    classificationFiles: {
      desktop: '.codex/verification/lang-gui/desktop-elements.json',
      desktopSchema: '.codex/verification/lang-gui/desktop-elements.schema.json',
      site: '.codex/verification/lang-gui/site-elements.json',
      siteSchema: '.codex/verification/lang-gui/site-elements.schema.json',
    },
    requiredOwnerIds: OWNER_IDS,
    surfaces: oldInventory.surfaces.map((surface) => ({
      ...surface,
      route: surface.id === 'windows-desktop-application' ? 'material-designer://app/' : 'site/index.html#tab-panel-overview',
    })),
    owners: registryOwners,
    discovery: counts,
  };
  fs.writeFileSync(ownerPath, stableJson(inventory));
  const registry = readJson(registryPath);
  registry.version = 2;
  registry.ownerInventoryFile = '.codex/verification/lang-gui/source-owners.json';
  registry.ownerInventorySchemaFile = '.codex/verification/lang-gui/source-owners.schema.json';
  registry.desktopClassificationFile = '.codex/verification/lang-gui/desktop-elements.json';
  registry.siteClassificationFile = '.codex/verification/lang-gui/site-elements.json';
  delete registry.interactiveDescendantInventoryFile;
  const ownerMap = new Map(registryOwners.map((owner) => [owner.id, owner]));
  for (const element of registry.elements) {
    const owner = ownerMap.get(element.stableElementId);
    element.sourceLineage = [{ path: owner.sourcePath, anchor: owner.registrationAnchor, kind: owner.registrationNodeKind, ownerToken: owner.owner, sourceHash: owner.registrationSourceHash }];
    element.interactionReceipt = { status: 'unverified', path: null, artifactPath: null, sourceCommit: 'HEAD', artifactSourceCommit: null, artifactHash: null, artifactGitBlob: null, receiptHash: null, receiptGitBlob: null, privacy: 'not-captured' };
    element.captureTuple = { status: 'unverified', route: element.route, state: 'default', viewport: '1280x720', scale: 1, theme: 'light', path: null, captureHash: null, captureGitBlob: null, artifactHash: null, mediaType: 'unverified', width: null, height: null, privacy: 'not-reviewed', contrast: null };
  }
  const desktopOwner = ownerMap.get('desktop-app-root');
  const siteOwner = ownerMap.get('site-topbar-brand');
  registry.surfaces[0].sourceLineage = [{ path: desktopOwner.sourcePath, anchor: desktopOwner.registrationAnchor, kind: desktopOwner.registrationNodeKind, ownerToken: desktopOwner.owner, sourceHash: desktopOwner.registrationSourceHash }];
  registry.surfaces[1].sourceLineage = [{ path: siteOwner.sourcePath, anchor: siteOwner.registrationAnchor, kind: siteOwner.registrationNodeKind, ownerToken: siteOwner.owner, sourceHash: siteOwner.registrationSourceHash }];
  const ordered = {
    $schema: registry.$schema,
    version: registry.version,
    evidencePolicy: registry.evidencePolicy,
    ownerInventoryFile: registry.ownerInventoryFile,
    ownerInventorySchemaFile: registry.ownerInventorySchemaFile,
    desktopClassificationFile: registry.desktopClassificationFile,
    siteClassificationFile: registry.siteClassificationFile,
    requiredSurfaceIds: registry.requiredSurfaceIds,
    requiredElementIds: registry.requiredElementIds,
    requiredStateIds: registry.requiredStateIds,
    requiredFieldIds: registry.requiredFieldIds,
    surfaces: registry.surfaces,
    elements: registry.elements,
  };
  fs.writeFileSync(registryPath, stableJson(ordered));
  process.stdout.write(`refreshed explicit source classifications: ${JSON.stringify(counts)}\n`);
}

function expectExactFailure(label, expected, action) {
  let actual = null;
  try {
    action();
  } catch (error) {
    actual = error instanceof Error ? error.message : String(error);
  }
  assert(actual !== null, `negative boundary stayed green: ${label}`);
  assert(actual === expected, `negative boundary ${label} reported ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  process.stdout.write(`RED exact then restored: ${label} -> ${expected}\n`);
}

function missingFixtureRow(rows, predicate, label) {
  const row = rows.find(predicate);
  assert(row, `negative fixture lacks ${label}`);
  const expected = rows.filter((candidate) => candidate.id !== row.id);
  expectExactFailure(label, `fixture ${label} classification missed ${row.callSiteIdentity}`, () => {
    if (!expected.some((candidate) => candidate.id === row.id)) throw new Error(`fixture ${label} classification missed ${row.callSiteIdentity}`);
  });
}

function runAstFixtureNegatives(parser) {
  const reExportEdges = classifyModuleEdgesFixture(parser, 'design/apps/web/src/components/re-export.ts', "export { default as ReExportedPanel } from './Panel';\nexport * from './MorePanels';\n");
  missingFixtureRow(reExportEdges, (row) => row.kind === 'ExportNamedDeclaration' && row.value === './Panel', 'named re-export edge');
  missingFixtureRow(reExportEdges, (row) => row.kind === 'ExportAllDeclaration' && row.value === './MorePanels', 'export-all edge');
  const desktopSource = `
import DefaultPanel from './DefaultPanel';
import { NamedPanel as AliasPanel } from './NamedPanel';
import React, { createElement as makeElement, lazy } from 'react';
import { createPortal as portal } from 'react-dom';
import { jsx as makeJsx } from 'react/jsx-runtime';
const LocalPanel = () => (
  <section {...spread}>
    <AliasPanel />
  </section>
);
const LazyPanel = lazy(() => import('./LazyPanel'));
const DynamicPanel = dynamic(() => import('./DynamicPanel'));
const routes = { home: AliasPanel, local: LocalPanel };
const CurrentPanel = routes[currentRoute];
const DynamicTag = compact ? 'span' : 'div';
export default function RootPanel() {
  function NestedPanel() { return <aside data-nested />; }
  return <>
    <DefaultPanel />
    <LocalPanel />
    <NestedPanel />
    <LazyPanel />
    <DynamicPanel />
    <CurrentPanel />
    <DynamicTag />
    {items.map((item) => <article key={item.id} {...item.props} />)}
    {ready ? <strong>ready</strong> : <em>waiting</em>}
    {portal(<dialog open />, document.body)}
    {React.createElement('nav', null)}
    {makeElement('footer', null)}
    {makeJsx('header', {})}
  </>;
}
`;
  const fixture = classifyDesktopModuleFixture(parser, 'design/apps/web/src/collab/RegistryFixture.tsx', desktopSource);
  missingFixtureRow(fixture.owners, (row) => row.classification === 'nested-component-owner', 'intermediate nested owner');
  missingFixtureRow(fixture.elements, (row) => row.tag === 'DefaultPanel', 'default import component');
  missingFixtureRow(fixture.elements, (row) => row.tag === 'AliasPanel', 'aliased import component');
  missingFixtureRow(fixture.elements, (row) => row.tag === 'LocalPanel', 'local component declaration');
  missingFixtureRow(fixture.elements, (row) => row.tag === 'LazyPanel', 'lazy component');
  missingFixtureRow(fixture.elements, (row) => row.tag === 'DynamicPanel', 'dynamic import component');
  missingFixtureRow(fixture.elements, (row) => row.tag === 'CurrentPanel', 'route table dynamic component');
  missingFixtureRow(fixture.elements, (row) => row.kind === 'dynamic-intrinsic' && row.tag === 'div|span', 'intrinsic dynamic tag');
  missingFixtureRow(fixture.elements, (row) => row.kind === 'react-portal', 'portal call');
  missingFixtureRow(fixture.elements, (row) => row.kind === 'fragment', 'fragment');
  missingFixtureRow(fixture.elements, (row) => row.kind === 'intrinsic-factory' && row.tag === 'nav', 'React.createElement');
  missingFixtureRow(fixture.elements, (row) => row.kind === 'intrinsic-factory' && row.tag === 'footer', 'createElement alias');
  missingFixtureRow(fixture.elements, (row) => row.kind === 'intrinsic-factory' && row.tag === 'header', 'JSX factory');
  missingFixtureRow(fixture.elements, (row) => row.tag === 'article' && row.controlFlow.includes('map'), 'map-produced element');
  missingFixtureRow(fixture.elements, (row) => row.tag === 'strong' && row.controlFlow.includes('conditional'), 'conditional element');
  missingFixtureRow(fixture.elements, (row) => row.tag === 'section' && row.hasSpreadAttributes, 'multiline spread element');
  missingFixtureRow(fixture.elements, (row) => row.sourcePath.includes('/collab/'), 'collab source');

  const siteSource = `
const boundCreate = document.createElement.bind(document);
const aliasCreate = document.createElement;
function el(tag, props = {}) { const node = document.createElement(tag); if (props.html) node.innerHTML = props.html; return node; }
function build(target) {
  const first = boundCreate('article');
  const second = aliasCreate('button');
  const third = el(
    'section',
    { html: '<strong>text</strong>' },
  );
  target.insertAdjacentHTML('beforeend', '<aside><span>hello</span></aside>');
  third.innerHTML = '<footer>done</footer>';
}
`;
  const siteFixture = classifySiteModuleFixture(parser, 'site/assets/js/registry-fixture.js', siteSource);
  missingFixtureRow(siteFixture.creators, (row) => row.kind === 'create-element-alias' && row.tag === 'article', 'site bound creator alias');
  missingFixtureRow(siteFixture.creators, (row) => row.kind === 'create-element-alias' && row.tag === 'button', 'site direct creator alias');
  missingFixtureRow(siteFixture.creators, (row) => row.kind === 'create-element-helper' && row.tag === 'section', 'site helper creator');
  missingFixtureRow(siteFixture.creators, (row) => row.kind === 'create-element-helper' && row.tag === 'section', 'site multiline DOM creator');
  missingFixtureRow(siteFixture.creators, (row) => row.kind === 'insert-adjacent-html-template-tag' && row.tag === 'aside', 'site insertAdjacentHTML');
  missingFixtureRow(siteFixture.creators, (row) => row.kind === 'inner-html-template-tag' && row.tag === 'footer', 'site innerHTML');
  const swapped = structuredClone(siteFixture.creators);
  swapped[0].tag = 'swapped-tag';
  expectExactFailure('site creator tag swap', 'fixture site creator tag swap changed parsed creator tag', () => {
    if (swapped[0].tag !== siteFixture.creators[0].tag) throw new Error('fixture site creator tag swap changed parsed creator tag');
  });

  const commentA = classifyDesktopModuleFixture(parser, 'design/apps/web/src/collab/CommentFixture.tsx', '// <button>example</button>\nexport function Clean() { return <div />; }');
  assert(commentA.comments.length === 1, 'comment exclusion fixture did not produce one row');
  const commentB = classifyDesktopModuleFixture(parser, 'design/apps/web/src/collab/CommentFixture.tsx', '// <input>example</input>\nexport function Clean() { return <div />; }');
  expectExactFailure('changed comment exclusion', 'fixture changed comment exclusion changed source hash or node kind', () => {
    if (commentA.comments[0].sourceHash !== commentB.comments[0].sourceHash || commentA.comments[0].nodeKind !== commentB.comments[0].nodeKind) throw new Error('fixture changed comment exclusion changed source hash or node kind');
  });
}

function initGitRepository(directory) {
  gitText(directory, ['init', '-q']);
  gitText(directory, ['config', 'user.name', 'Evidence Fixture']);
  gitText(directory, ['config', 'user.email', 'evidence@example.invalid']);
}

function writeFileEnsured(directory, relativePath, bytes) {
  const target = path.join(directory, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes);
  return target;
}

function evidenceElementFixture(registrySchema, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lang-gui-evidence-'));
  initGitRepository(directory);
  writeFileEnsured(directory, 'source.txt', 'source revision\n');
  gitText(directory, ['add', '--', 'source.txt']);
  gitText(directory, ['commit', '-q', '-m', 'source']);
  const sourceCommit = gitText(directory, ['rev-parse', 'HEAD']);
  const artifactPath = 'evidence/app.exe';
  const capturePath = 'evidence/capture.png';
  const receiptPath = 'evidence/receipt.json';
  const artifactBytes = options.artifactBytes ?? (() => {
    const bytes = Buffer.alloc(128);
    bytes.write('MZ', 0, 'ascii');
    bytes.writeUInt32LE(0x40, 0x3c);
    bytes.writeUInt32LE(0x00004550, 0x40);
    return bytes;
  })();
  const captureBytes = options.captureBytes ?? Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
  const artifactFile = writeFileEnsured(directory, artifactPath, artifactBytes);
  const captureFile = writeFileEnsured(directory, capturePath, captureBytes);
  const artifactBlob = workingBlob(directory, artifactFile);
  const captureBlob = workingBlob(directory, captureFile);
  const receiptDocument = options.receiptDocument ?? {
    schema: 'material-designer.lang-gui.interaction-receipt',
    version: 1,
    extensionNamespace: { name: 'material-designer.lang-gui.interaction-receipt.extensions', version: 1 },
    elementId: 'desktop-app-root',
    sourceCommit,
    artifact: { path: artifactPath, sha256: sha256(artifactBytes), gitBlob: artifactBlob },
    capture: { path: capturePath, sha256: sha256(captureBytes), gitBlob: captureBlob, mediaType: 'image/png', width: 1, height: 1 },
    tuple: { route: 'material-designer://app/app-root', state: 'default', theme: 'light', viewport: '1280x720', scale: 1 },
    interaction: { action: 'open', target: 'app root', before: 'closed', after: 'open' },
    privacy: { status: 'pass', reason: 'Fixture contains no user data.' },
    contrast: { status: 'verified', ratio: 4.5, foreground: 'on-surface', background: 'surface' },
  };
  options.mutateReceipt?.(receiptDocument);
  const receiptBytes = Buffer.from(stableJson(receiptDocument));
  const receiptFile = writeFileEnsured(directory, receiptPath, receiptBytes);
  gitText(directory, ['add', '--', artifactPath, capturePath, receiptPath]);
  gitText(directory, ['commit', '-q', '-m', 'evidence']);
  const evidenceCommit = gitText(directory, ['rev-parse', 'HEAD']);
  const receiptBlob = workingBlob(directory, receiptFile);
  const baseRegistry = readJson(registryPath);
  const element = structuredClone(baseRegistry.elements[0]);
  element.status = { state: 'verified', reason: 'Fixture evidence is complete.' };
  for (const key of Object.keys(element.states)) element.states[key] = 'verified';
  element.contrast = { foreground: 'on-surface', background: 'surface', ratio: 4.5, status: 'verified' };
  element.interactionReceipt = { status: 'verified', path: receiptPath, artifactPath, sourceCommit: evidenceCommit, artifactSourceCommit: sourceCommit, artifactHash: sha256(artifactBytes), artifactGitBlob: artifactBlob, receiptHash: sha256(receiptBytes), receiptGitBlob: receiptBlob, privacy: 'pass' };
  element.captureTuple = { status: 'verified', route: 'material-designer://app/app-root', state: 'default', viewport: '1280x720', scale: 1, theme: 'light', path: capturePath, captureHash: sha256(captureBytes), captureGitBlob: captureBlob, artifactHash: sha256(artifactBytes), mediaType: 'image/png', width: 1, height: 1, privacy: 'pass', contrast: 4.5 };
  return { directory, element, receiptDocument };
}

function withEvidenceFixture(registrySchema, options, action) {
  const fixture = evidenceElementFixture(registrySchema, options);
  try {
    action(fixture);
  } finally {
    fs.rmSync(fixture.directory, { recursive: true, force: true });
  }
}

function runEvidenceNegatives(registrySchema) {
  withEvidenceFixture(registrySchema, {}, ({ directory, element }) => {
    const evidence = checkVerifiedEvidence(element, 'evidence', registrySchema, directory, directory);
    const roles = new Map();
    recordEvidenceRoles(roles, evidence, 'first');
    expectExactFailure('evidence reused across rows', `second reuses evidence path ${evidence.paths[0]} from first`, () => recordEvidenceRoles(roles, evidence, 'second'));
  });
  withEvidenceFixture(registrySchema, {}, ({ directory, element }) => {
    element.captureTuple.path = element.interactionReceipt.path;
    expectExactFailure('evidence reused roles', 'evidence evidence role paths must be distinct', () => checkVerifiedEvidence(element, 'evidence', registrySchema, directory, directory));
  });
  withEvidenceFixture(registrySchema, {}, ({ directory, element }) => {
    element.interactionReceipt.artifactPath = 'evidence/untracked.exe';
    writeFileEnsured(directory, 'evidence/untracked.exe', Buffer.from('untracked'));
    expectExactFailure('evidence untracked path', 'evidence artifact path is not a committed blob at source commit', () => checkVerifiedEvidence(element, 'evidence', registrySchema, directory, directory));
  });
  withEvidenceFixture(registrySchema, {}, ({ directory, element }) => {
    element.interactionReceipt.artifactGitBlob = '0'.repeat(40);
    expectExactFailure('evidence wrong blob', 'evidence artifact Git blob does not match source commit', () => checkVerifiedEvidence(element, 'evidence', registrySchema, directory, directory));
  });
  withEvidenceFixture(registrySchema, {}, ({ directory, element }) => {
    element.interactionReceipt.sourceCommit = element.interactionReceipt.artifactSourceCommit;
    expectExactFailure('evidence wrong commit', 'evidence artifact path is not a committed blob at source commit', () => checkVerifiedEvidence(element, 'evidence', registrySchema, directory, directory));
  });
  withEvidenceFixture(registrySchema, {}, ({ directory, element }) => {
    element.interactionReceipt.artifactSourceCommit = element.interactionReceipt.sourceCommit;
    expectExactFailure('evidence wrong source SHA', 'evidence receipt source SHA does not match', () => checkVerifiedEvidence(element, 'evidence', registrySchema, directory, directory));
  });
  withEvidenceFixture(registrySchema, {}, ({ directory, element }) => {
    const tree = gitText(directory, ['rev-parse', `${element.interactionReceipt.artifactSourceCommit}^{tree}`]);
    element.interactionReceipt.artifactSourceCommit = gitText(directory, ['commit-tree', tree, '-m', 'unrelated source']);
    expectExactFailure('evidence unrelated source commit', 'evidence artifact source commit is not an ancestor of source commit', () => checkVerifiedEvidence(element, 'evidence', registrySchema, directory, directory));
  });
  withEvidenceFixture(registrySchema, {}, ({ directory, element }) => {
    fs.appendFileSync(path.join(directory, ...element.interactionReceipt.artifactPath.split('/')), Buffer.from([0]));
    expectExactFailure('evidence working tree only bytes', 'evidence working evidence bytes differ from source commit', () => checkVerifiedEvidence(element, 'evidence', registrySchema, directory, directory));
  });
  withEvidenceFixture(registrySchema, { captureBytes: Buffer.from('not a png') }, ({ directory, element }) => {
    expectExactFailure('evidence fake media', 'capture is not a valid PNG signature', () => checkVerifiedEvidence(element, 'evidence', registrySchema, directory, directory));
  });
  withEvidenceFixture(registrySchema, { artifactBytes: Buffer.from('MZ but no PE header') }, ({ directory, element }) => {
    expectExactFailure('evidence fake artifact', 'artifact signature is not an allowed packaged application format', () => checkVerifiedEvidence(element, 'evidence', registrySchema, directory, directory));
  });
  withEvidenceFixture(registrySchema, {}, ({ directory, element }) => {
    element.interactionReceipt.artifactHash = '0'.repeat(64);
    expectExactFailure('evidence wrong artifact hash', 'evidence artifact SHA-256 does not match its file', () => checkVerifiedEvidence(element, 'evidence', registrySchema, directory, directory));
  });
  withEvidenceFixture(registrySchema, {}, ({ directory, element }) => {
    element.interactionReceipt.receiptHash = '0'.repeat(64);
    expectExactFailure('evidence wrong receipt hash', 'evidence receipt SHA-256 does not match its file', () => checkVerifiedEvidence(element, 'evidence', registrySchema, directory, directory));
  });
  withEvidenceFixture(registrySchema, {}, ({ directory, element }) => {
    element.captureTuple.captureHash = '0'.repeat(64);
    expectExactFailure('evidence wrong capture hash', 'evidence capture SHA-256 does not match its file', () => checkVerifiedEvidence(element, 'evidence', registrySchema, directory, directory));
  });
  withEvidenceFixture(registrySchema, {}, ({ directory, element }) => {
    element.captureTuple.route = 'material-designer://app/wrong';
    expectExactFailure('evidence route mismatch', 'evidence interaction receipt tuple does not match capture tuple', () => checkVerifiedEvidence(element, 'evidence', registrySchema, directory, directory));
  });
  for (const [label, mutate] of [
    ['state', (element) => { element.captureTuple.state = 'changed'; }],
    ['theme', (element) => { element.captureTuple.theme = 'dark'; }],
    ['viewport', (element) => { element.captureTuple.viewport = '320x640'; }],
    ['scale', (element) => { element.captureTuple.scale = 2; }],
  ]) withEvidenceFixture(registrySchema, {}, ({ directory, element }) => {
    mutate(element);
    expectExactFailure(`evidence ${label} mismatch`, 'evidence interaction receipt tuple does not match capture tuple', () => checkVerifiedEvidence(element, 'evidence', registrySchema, directory, directory));
  });
  withEvidenceFixture(registrySchema, {}, ({ directory, element }) => {
    element.captureTuple.artifactHash = '0'.repeat(64);
    expectExactFailure('evidence stale artifact hash', 'evidence capture artifact hash is stale', () => checkVerifiedEvidence(element, 'evidence', registrySchema, directory, directory));
  });
  withEvidenceFixture(registrySchema, {}, ({ directory, element }) => {
    element.interactionReceipt.privacy = 'fail';
    expectExactFailure('evidence privacy', 'evidence evidence privacy verdict is not pass', () => checkVerifiedEvidence(element, 'evidence', registrySchema, directory, directory));
  });
  withEvidenceFixture(registrySchema, {}, ({ directory, element }) => {
    element.captureTuple.width = 2;
    expectExactFailure('evidence capture dimensions', 'evidence capture media metadata does not match PNG bytes', () => checkVerifiedEvidence(element, 'evidence', registrySchema, directory, directory));
  });
  withEvidenceFixture(registrySchema, {}, ({ directory, element }) => {
    element.contrast.ratio = 5;
    expectExactFailure('evidence contrast mismatch', 'evidence receipt contrast does not match element contrast', () => checkVerifiedEvidence(element, 'evidence', registrySchema, directory, directory));
  });
  withEvidenceFixture(registrySchema, { receiptDocument: {} }, ({ directory, element }) => {
    expectExactFailure('evidence arbitrary JSON', 'evidence.receipt is missing required property schema', () => checkVerifiedEvidence(element, 'evidence', registrySchema, directory, directory));
  });
  withEvidenceFixture(registrySchema, { mutateReceipt: (receipt) => { receipt.extensionNamespace.version = 2; } }, ({ directory, element }) => {
    expectExactFailure('evidence extension namespace version', 'evidence.receipt.extensionNamespace.version does not equal schema const', () => checkVerifiedEvidence(element, 'evidence', registrySchema, directory, directory));
  });
  withEvidenceFixture(registrySchema, { mutateReceipt: (receipt) => { receipt.tuple.unexpected = true; } }, ({ directory, element }) => {
    expectExactFailure('evidence nested schema extra', 'evidence.receipt.tuple has unexpected property unexpected', () => checkVerifiedEvidence(element, 'evidence', registrySchema, directory, directory));
  });
}

function runNegative() {
  const registry = readJson(registryPath);
  const registrySchema = readJson(registrySchemaPath);
  const inventory = readJson(ownerPath);
  const ownerSchema = readJson(ownerSchemaPath);
  const desktop = readJson(desktopPath);
  const desktopSchema = readJson(desktopSchemaPath);
  const site = readJson(sitePath);
  const siteSchema = readJson(siteSchemaPath);
  const parser = loadDeclaredParser(root);
  const discovered = discoverSourceClassification(root, desktop, site);
  const validateMutation = (mutatedRegistry, mutatedSchema, mutatedInventory, mutatedOwnerSchema, mutatedDesktop, mutatedDesktopSchema, mutatedSite, mutatedSiteSchema) => validateAll(mutatedRegistry, mutatedSchema, mutatedInventory, mutatedOwnerSchema, mutatedDesktop, mutatedDesktopSchema, mutatedSite, mutatedSiteSchema, { parser, discovered });
  const boundary = (label, expected, mutate) => {
    const values = [structuredClone(registry), structuredClone(registrySchema), structuredClone(inventory), structuredClone(ownerSchema), structuredClone(desktop), structuredClone(desktopSchema), structuredClone(site), structuredClone(siteSchema)];
    mutate(...values);
    expectExactFailure(label, expected, () => validateMutation(...values));
  };
  boundary('owner removal', `requiredOwnerIds has ${OWNER_IDS.length - 1}, expected ${OWNER_IDS.length}`, (r, s, i) => i.requiredOwnerIds.pop());
  boundary('extra source owner', `requiredOwnerIds has ${OWNER_IDS.length + 1}, expected ${OWNER_IDS.length}`, (r, s, i) => i.requiredOwnerIds.push('desktop-extra-owner'));
  boundary('registry row removal', `registry has ${OWNER_IDS.length - 1} rows, expected ${OWNER_IDS.length}`, (r) => r.elements.pop());
  boundary('extra registry element', `registry has ${OWNER_IDS.length + 1} rows, expected ${OWNER_IDS.length}`, (r) => r.elements.push(structuredClone(r.elements[0])));
  boundary('duplicate source registration', 'owner AST registration identities contains duplicates', (r, s, i) => {
    i.owners[2].registrationAnchor = i.owners[1].registrationAnchor;
    i.owners[2].registrationKind = i.owners[1].registrationKind;
    i.owners[2].registrationNodeKind = i.owners[1].registrationNodeKind;
    i.owners[2].registrationSourceHash = i.owners[1].registrationSourceHash;
  });
  boundary('AST registration rename', `${inventory.owners[2].id} AST registration identity changed`, (r, s, i) => { i.owners[2].registrationAnchor += ':renamed'; });
  boundary('commented source registration', `${inventory.owners[2].id} AST registration identity changed`, (r, s, i) => { i.owners[2].registrationAnchor = `${i.owners[2].sourcePath}#CommentLine:1`; });
  boundary('non-owner source registration', `${inventory.owners[2].id} AST registration is not owned by NotEntryView`, (r, s, i) => { i.owners[2].owner = 'NotEntryView'; });
  boundary('template import', `${inventory.owners[2].id} AST registration identity changed`, (r, s, i) => { i.owners[2].registrationAnchor = `${i.owners[2].sourcePath}#JSXOpeningElement:EntryView`; });
  boundary('wrong function owner', 'desktop-app-root AST registration is not owned by NotApp', (r, s, i) => { i.owners[0].owner = 'NotApp'; });
  boundary('schema nested extra', 'registry.elements[0].rolesNamesActions has unexpected property unexpected', (r) => { r.elements[0].rolesNamesActions.unexpected = true; });
  boundary('schema nested type', 'registry.elements[0].targetSize.minimumCssPx has the wrong schema type', (r) => { r.elements[0].targetSize.minimumCssPx = '48'; });
  boundary('schema nested status', 'registry.elements[0].colors.status is outside schema enum', (r) => { r.elements[0].colors.status = 'unknown'; });
  boundary('schema state removal', 'registry.elements[0].states is missing required property error', (r) => { delete r.elements[0].states.error; });
  boundary('schema surface extra', 'registry.surfaces[0] has unexpected property unexpected', (r) => { r.surfaces[0].unexpected = true; });
  boundary('schema field authority', 'schema authority has 29 fields, expected 30', (r, s) => { s.$defs.element.required.pop(); });
  boundary('schema nested object reopened', 'registrySchema fixed object schema is open at $.$defs.material', (r, s) => { delete s.$defs.material.additionalProperties; });
  boundary('owner extension namespace version', 'ownerInventory.extensionNamespace.version does not equal schema const', (r, s, i) => { i.extensionNamespace.version = 2; });
  boundary('desktop extension namespace version', 'desktopInventory.extensionNamespace.version does not equal schema const', (r, s, i, os, d) => { d.extensionNamespace.version = 2; });
  boundary('site extension namespace version', 'siteInventory.extensionNamespace.version does not equal schema const', (r, s, i, os, d, ds, st) => { st.extensionNamespace.version = 2; });
  boundary('semantic field swap', 'registry.elements[1].semantic fields do not match roles and names', (r) => { r.elements[1].semantic.accessibleName = 'Wrong owner'; });
  boundary('empty semantic actions', 'registry.elements[0].rolesNamesActions.actions has too few items', (r) => { r.elements[0].rolesNamesActions.actions = []; });
  boundary('status drift', 'registry.elements[0].status.state is outside schema enum', (r) => { r.elements[0].status.state = 'unknown'; });
  boundary('bogus verified evidence', 'registry.elements[0] interaction receipt is not verified', (r) => { r.elements[0].status.state = 'verified'; });
  boundary('surface membership removal', `desktop registry membership has ${OWNER_IDS.filter((id) => id.startsWith('desktop-')).length - 1}, expected ${OWNER_IDS.filter((id) => id.startsWith('desktop-')).length}`, (r) => { r.surfaces[0].elementIds.pop(); });
  boundary('keyboard route removal', 'registry.elements[0].rolesNamesActions.keyboard has too few items', (r) => { r.elements[0].rolesNamesActions.keyboard = []; });
  boundary('desktop entry root', 'desktop entry roots drifted', (r, s, i, os, d) => { d.entryRoots.pop(); });
  boundary('desktop collab source directory', 'desktop TSX source directories drifted', (r, s, i, os, d) => { d.sourceDirectories = d.sourceDirectories.filter((directory) => directory !== 'design/apps/web/src/collab'); });
  boundary('desktop reachable module', 'desktop reachable module graph drifted', (r, s, i, os, d) => { d.reachableModules.pop(); });
  boundary('desktop render owner graph', 'desktop render-reachable owner graph drifted', (r, s, i, os, d) => { d.renderReachableOwnerIds.pop(); });
  boundary('site module inventory', 'site JavaScript module inventory drifted', (r, s, i, os, d, ds, st) => { st.modules.pop(); });
  boundary('desktop owner omission', `desktop owners discovery/classification drifted: discovered=${desktop.owners.length}, classified=${desktop.owners.length - 1}, missing=${desktop.owners.at(-1).id}, stale=none`, (r, s, i, os, d) => { d.owners.pop(); });
  boundary('desktop element omission', `desktop elements discovery/classification drifted: discovered=${desktop.elements.length}, classified=${desktop.elements.length - 1}, missing=${desktop.elements.at(-1).id}, stale=none`, (r, s, i, os, d) => { d.elements.pop(); });
  boundary('site creator omission', `site runtime creators discovery/classification drifted: discovered=${site.runtimeCreators.length}, classified=${site.runtimeCreators.length - 1}, missing=${site.runtimeCreators.at(-1).id}, stale=none`, (r, s, i, os, d, ds, st) => { st.runtimeCreators.pop(); });
  boundary('site HTML omission', `site HTML elements discovery/classification drifted: discovered=${site.htmlElements.length}, classified=${site.htmlElements.length - 1}, missing=${site.htmlElements.at(-1).id}, stale=none`, (r, s, i, os, d, ds, st) => { st.htmlElements.pop(); });
  boundary('comment source hash', `desktop comment exclusions discovery/classification drifted: discovered=${desktop.commentExclusions.length}, classified=${desktop.commentExclusions.length}, missing=none, stale=none`, (r, s, i, os, d) => { d.commentExclusions[0].sourceHash = '0'.repeat(64); });
  runAstFixtureNegatives(parser);
  runEvidenceNegatives(registrySchema);
  validateAll(registry, registrySchema, inventory, ownerSchema, desktop, desktopSchema, site, siteSchema, { parser, discovered });
  process.stdout.write('GREEN after restoring every AST, classification, schema, evidence, privacy, contrast, and tuple boundary\n');
}

try {
  if (process.argv.includes('--refresh-classifications')) refreshClassifications();
  else if (process.argv.includes('--negative')) runNegative();
  else {
    const result = validateAll(readJson(registryPath), readJson(registrySchemaPath), readJson(ownerPath), readJson(ownerSchemaPath), readJson(desktopPath), readJson(desktopSchemaPath), readJson(sitePath), readJson(siteSchemaPath));
    process.stdout.write(`every-element registry green: ${JSON.stringify(result)}\n`);
  }
} catch (error) {
  process.stderr.write(`every-element registry red: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

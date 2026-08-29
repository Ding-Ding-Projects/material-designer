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
import { execFileSync, spawnSync } from 'node:child_process';
import {
  classifyDesktopModuleFixture,
  classifyLocalExportsFixture,
  classifyModuleEdgesFixture,
  classifySiteModuleFixture,
  compareSourceClassification,
  discoverSourceClassification,
  findAstRegistrations,
  loadDeclaredParser,
  preserveReviewedAuthority,
  resolveExportCycleFixture,
  sha256,
  stableJson,
  validateAstRegistrations,
} from './lang-gui-source-classifier.mjs';
import {
  PRIVACY_SCANNER_METHOD,
  PRIVACY_SCANNER_METHOD_VERSION,
  PRIVACY_SCANNER_NAME,
  PRIVACY_SCANNER_PATH,
  privacyInputSha256,
  scanEvidencePrivacy,
} from './scan-lang-gui-evidence-privacy.mjs';

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
const bootstrapPath = path.join(root, 'scripts', 'run-lang-gui-verifier.ps1');
const privacyScannerPath = path.join(root, ...PRIVACY_SCANNER_PATH.split('/'));

const SURFACE_IDS = ['windows-desktop-application', 'documentation-site'];
const OWNER_IDS = [
  'desktop-app-root', 'desktop-update-menu', 'desktop-entry-view', 'desktop-marketplace-view', 'desktop-plugin-detail-view', 'desktop-memory-toast', 'desktop-toast', 'desktop-centered-loader', 'desktop-pet-overlay', 'desktop-project-view', 'desktop-project-creation-pending', 'desktop-experience-survey', 'desktop-tooltip-layer', 'desktop-update-dialog', 'desktop-updater-popup', 'desktop-workspace-tabs', 'desktop-account-cluster', 'desktop-front-provenance', 'desktop-project-recovery-tip', 'desktop-design-system-creation', 'desktop-design-system-detail', 'desktop-iframe-keep-alive', 'desktop-settings-dialog', 'desktop-privacy-consent', 'desktop-collab-demo', 'desktop-workspace-member-directory', 'desktop-community-view',
  'site-topbar-brand', 'site-front-provenance', 'site-tab-strip', 'site-content-search', 'site-command-palette', 'site-notification-center', 'site-theme-toggle', 'site-search-results', 'site-overview-hero', 'site-settings-language', 'site-settings-funny-levels', 'site-settings-appearance', 'site-settings-toy-lock', 'site-settings-reset', 'site-statusbar',
];
const STATUS_VALUES = new Set(['partial', 'unverified', 'verified', 'not-applicable']);
const LOCK_POLICIES = ['PIN', 'password', 'PIN plus password', 'password plus TOTP', 'PIN plus TOTP', 'password plus PIN plus TOTP'];
const REQUIRED_MODES = ['English', 'playful Hong Kong-style Cantonese', 'bilingual'];
const REQUIRED_TUPLES = new Set(['1280x720|1|light', '1280x720|1.5|dark', '320x640|1|light', '320x640|2|dark']);
const REQUIRED_WRAPPED_OWNERS = [
  ['design/apps/web/src/components/PluginsSection.tsx', 'PluginsSection', 'forwardRef'],
  ['design/apps/web/src/components/AssistantMessage.tsx', 'AssistantMessage', 'memo'],
  ['design/apps/web/src/components/ChatComposer.tsx', 'ChatComposer', 'forwardRef'],
  ['design/apps/web/src/components/QuestionForm.tsx', 'QuestionFormView', 'forwardRef'],
];
const EVIDENCE_ROOT = '.codex/verification/lang-gui/evidence';
const SUPPORTED_BUILD_SCRIPT_PATHS = ['build.bat', 'build-installer.bat', 'scripts/build.ps1', 'scripts/build-installer.ps1'];
const LIVE_PROOF_TTL_MS = 8 * 60 * 60 * 1000;
const liveProofSessions = new WeakMap();
let negativeCaseCount = 0;

const JSON_LIMITS = Object.freeze({
  'registry.json': { maxBytes: 2 * 1024 * 1024, maxDepth: 64, maxString: 65536, maxArray: 20000, maxProperties: 128, maxNodes: 500000 },
  'source-owners.json': { maxBytes: 2 * 1024 * 1024, maxDepth: 32, maxString: 65536, maxArray: 20000, maxProperties: 64, maxNodes: 200000 },
  'desktop-elements.json': { maxBytes: 16 * 1024 * 1024, maxDepth: 32, maxString: 131072, maxArray: 25000, maxProperties: 64, maxNodes: 1000000 },
  'site-elements.json': { maxBytes: 4 * 1024 * 1024, maxDepth: 32, maxString: 131072, maxArray: 10000, maxProperties: 64, maxNodes: 500000 },
  schema: { maxBytes: 2 * 1024 * 1024, maxDepth: 96, maxString: 131072, maxArray: 25000, maxProperties: 256, maxNodes: 500000 },
  receipt: { maxBytes: 256 * 1024, maxDepth: 24, maxString: 32768, maxArray: 1024, maxProperties: 64, maxNodes: 10000 },
});

function scanJsonTextBounds(text, label, limits) {
  const stack = [];
  let inString = false;
  let escaped = false;
  let stringLength = 0;
  const beginArrayValue = () => {
    const parent = stack.at(-1);
    if (parent?.type !== 'array' || !parent.expectingValue) return;
    parent.items += 1;
    assert(parent.items <= limits.maxArray, `${label} JSON array exceeds admission bound`);
    parent.expectingValue = false;
  };
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) { escaped = false; stringLength += 1; continue; }
      if (char === '\\') { escaped = true; continue; }
      if (char === '"') { inString = false; assert(stringLength <= limits.maxString, `${label} JSON string exceeds admission bound`); stringLength = 0; continue; }
      stringLength += 1;
      continue;
    }
    if (/\s/.test(char)) continue;
    if (char !== ']' && char !== ',') beginArrayValue();
    if (char === '"') { inString = true; stringLength = 0; continue; }
    if (char === '{') {
      stack.push({ type: 'object', properties: 0 });
      assert(stack.length <= limits.maxDepth, `${label} JSON nesting exceeds admission bound`);
    } else if (char === '[') {
      stack.push({ type: 'array', items: 0, expectingValue: true });
      assert(stack.length <= limits.maxDepth, `${label} JSON nesting exceeds admission bound`);
    } else if (char === '}' || char === ']') {
      const expectedType = char === '}' ? 'object' : 'array';
      const current = stack.pop();
      assert(current?.type === expectedType, `${label} JSON structure closes before it opens`);
    } else if (char === ':') {
      const current = stack.at(-1);
      if (current?.type === 'object') {
        current.properties += 1;
        assert(current.properties <= limits.maxProperties, `${label} JSON property count exceeds admission bound`);
      }
    } else if (char === ',') {
      const current = stack.at(-1);
      if (current?.type === 'array') current.expectingValue = true;
    }
  }
  assert(!inString && stack.length === 0, `${label} JSON text is structurally incomplete`);
}

function assertJsonValueBounds(value, label, limits) {
  let nodes = 0;
  const visit = (current, depth) => {
    nodes += 1;
    assert(nodes <= limits.maxNodes, `${label} JSON node count exceeds admission bound`);
    assert(depth <= limits.maxDepth, `${label} JSON nesting exceeds admission bound`);
    if (typeof current === 'string') assert(current.length <= limits.maxString, `${label} JSON string exceeds admission bound`);
    else if (Array.isArray(current)) {
      assert(current.length <= limits.maxArray, `${label} JSON array exceeds admission bound`);
      current.forEach((item) => visit(item, depth + 1));
    } else if (current !== null && typeof current === 'object') {
      const entries = Object.entries(current);
      assert(entries.length <= limits.maxProperties, `${label} JSON property count exceeds admission bound`);
      entries.forEach(([key, item]) => { assert(key.length <= limits.maxString, `${label} JSON property name exceeds admission bound`); visit(item, depth + 1); });
    }
  };
  visit(value, 0);
}

function parseBoundedJsonBytes(bytes, label, maxBytes = null, explicitLimits = null) {
  const limits = explicitLimits ?? { ...JSON_LIMITS.receipt, maxBytes: maxBytes ?? JSON_LIMITS.receipt.maxBytes };
  const byteLimit = maxBytes ?? limits.maxBytes;
  assert(bytes.length <= byteLimit, `${label} exceeds byte admission bound`);
  const text = bytes.toString('utf8');
  assert(Buffer.byteLength(text, 'utf8') === bytes.length && !text.includes('\uFFFD'), `${label} is not valid UTF-8`);
  scanJsonTextBounds(text, label, limits);
  let value;
  try { value = JSON.parse(text); } catch { throw new Error(`${label} is not valid JSON`); }
  assertJsonValueBounds(value, label, limits);
  return value;
}

function readJson(file, explicitLimits = null, explicitLabel = null) {
  if (!fs.existsSync(file)) throw new Error(`missing file: ${path.relative(root, file)}`);
  const name = path.basename(file);
  const limits = explicitLimits ?? (name.endsWith('.schema.json') ? JSON_LIMITS.schema : JSON_LIMITS[name] ?? JSON_LIMITS.receipt);
  const label = explicitLabel ?? path.relative(root, file);
  return parseBoundedJsonBytes(readBoundedFile(file, label, limits.maxBytes), label, limits.maxBytes, limits);
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
    if (resolved.maxLength !== undefined) assert(value.length <= resolved.maxLength, `${label} is too long`);
    if (resolved.pattern !== undefined) assert(new RegExp(resolved.pattern).test(value), `${label} does not match schema pattern`);
  }
  if (typeof value === 'number') {
    if (resolved.minimum !== undefined) assert(value >= resolved.minimum, `${label} is below schema minimum`);
    if (resolved.maximum !== undefined) assert(value <= resolved.maximum, `${label} is above schema maximum`);
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of resolved.required ?? []) assert(Object.prototype.hasOwnProperty.call(value, key), `${label} is missing required property ${key}`);
    if (resolved.additionalProperties === false) for (const key of Object.keys(value)) assert(Object.prototype.hasOwnProperty.call(resolved.properties ?? {}, key), `${label} has unexpected property ${key}`);
    if (resolved.maxProperties !== undefined) assert(Object.keys(value).length <= resolved.maxProperties, `${label} has too many properties`);
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

function assertBoundedSchema(schema, label) {
  const visit = (value, location) => {
    if (!value || typeof value !== 'object') return;
    const types = value.type ? (Array.isArray(value.type) ? value.type : [value.type]) : [];
    if (types.includes('object') && value.properties) assert(Number.isInteger(value.maxProperties) && value.maxProperties >= Object.keys(value.properties).length, `${label} object schema lacks maxProperties at ${location}`);
    if (types.includes('array')) assert(Number.isInteger(value.maxItems) && value.maxItems >= (value.minItems ?? 0), `${label} array schema lacks maxItems at ${location}`);
    if (types.includes('string')) assert(Number.isInteger(value.maxLength) && value.maxLength >= (value.minLength ?? 0), `${label} string schema lacks maxLength at ${location}`);
    for (const [key, child] of Object.entries(value)) if (child && typeof child === 'object') visit(child, `${location}.${key}`);
  };
  visit(schema, '$');
}

function sealSchemaBounds(schema) {
  const visit = (value) => {
    if (!value || typeof value !== 'object') return;
    const types = value.type ? (Array.isArray(value.type) ? value.type : [value.type]) : [];
    if (types.includes('object') && value.properties && value.maxProperties === undefined) value.maxProperties = Object.keys(value.properties).length;
    if (types.includes('array') && value.maxItems === undefined) value.maxItems = 25000;
    if (types.includes('string') && value.maxLength === undefined) value.maxLength = 131072;
    for (const child of Object.values(value)) if (child && typeof child === 'object') visit(child);
  };
  visit(schema);
  return schema;
}

function validateSchemaDocument(value, schema, label) {
  assertClosedObjectSchemas(schema, label);
  assertBoundedSchema(schema, label);
  validateAgainstSchema(value, schema, label, schema);
}

function repoFile(baseRoot, relativePath, label) {
  assert(typeof relativePath === 'string' && relativePath.length > 0, `${label} path is missing`);
  assert(!path.isAbsolute(relativePath), `${label} path must be relative`);
  const resolved = path.resolve(baseRoot, ...relativePath.split('/'));
  assert(resolved.startsWith(`${path.resolve(baseRoot)}${path.sep}`), `${label} path escapes its repository`);
  assert(fs.existsSync(resolved), `${label} path is missing: ${relativePath}`);
  const realBase = fs.realpathSync.native(baseRoot);
  const realResolved = fs.realpathSync.native(resolved);
  assert(realResolved.startsWith(`${realBase}${path.sep}`), `${label} path resolves outside its repository`);
  let cursor = path.resolve(baseRoot);
  for (const part of relativePath.split('/')) {
    cursor = path.join(cursor, part);
    assert(!fs.lstatSync(cursor).isSymbolicLink(), `${label} path contains a symbolic link`);
  }
  return resolved;
}

function readBoundedFile(file, label, maxBytes) {
  const metadata = fs.statSync(file);
  assert(metadata.isFile() && metadata.size > 0 && metadata.size <= maxBytes, `${label} file size exceeds admission bound`);
  const bytes = fs.readFileSync(file);
  assert(bytes.length === metadata.size, `${label} file changed while being read`);
  return bytes;
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

function gitBlobBytes(cwd, blob, label) {
  try {
    return execFileSync('git', ['cat-file', 'blob', blob], { cwd, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 512 * 1024 * 1024 });
  } catch {
    throw new Error(`${label} Git blob is not readable`);
  }
}

function validatePortableExecutable(buffer) {
  assert(buffer.length >= 32 * 1024 && buffer.length <= 512 * 1024 * 1024 && buffer[0] === 0x4d && buffer[1] === 0x5a, 'artifact PE DOS header is invalid');
  const peOffset = buffer.readUInt32LE(0x3c);
  assert(peOffset >= 0x40 && peOffset <= 4096 && peOffset + 24 <= buffer.length && buffer.subarray(peOffset, peOffset + 4).equals(Buffer.from([0x50, 0x45, 0x00, 0x00])), 'artifact PE signature is invalid');
  const coff = peOffset + 4;
  const machine = buffer.readUInt16LE(coff);
  const sectionCount = buffer.readUInt16LE(coff + 2);
  const optionalSize = buffer.readUInt16LE(coff + 16);
  const characteristics = buffer.readUInt16LE(coff + 18);
  assert([0x014c, 0x8664, 0xaa64].includes(machine) && sectionCount >= 3 && sectionCount <= 96 && (characteristics & 0x0002) !== 0 && (characteristics & 0x2000) === 0, 'artifact PE COFF header is invalid');
  const optional = coff + 20;
  assert(optionalSize >= 224 && optional + optionalSize <= buffer.length, 'artifact PE optional header is missing or truncated');
  const magic = buffer.readUInt16LE(optional);
  assert(magic === 0x10b || magic === 0x20b, 'artifact PE optional header magic is invalid');
  const sizeOfCode = buffer.readUInt32LE(optional + 4);
  const entryPoint = buffer.readUInt32LE(optional + 16);
  const sectionAlignment = buffer.readUInt32LE(optional + 32);
  const fileAlignment = buffer.readUInt32LE(optional + 36);
  const imageSize = buffer.readUInt32LE(optional + 56);
  const headersSize = buffer.readUInt32LE(optional + 60);
  const subsystem = buffer.readUInt16LE(optional + 68);
  const directoryCountOffset = magic === 0x20b ? 108 : 92;
  const directoryCount = buffer.readUInt32LE(optional + directoryCountOffset);
  assert(sizeOfCode > 0 && entryPoint > 0 && [2, 3].includes(subsystem) && directoryCount >= 2, 'artifact PE optional execution metadata is invalid');
  assert(sectionAlignment >= fileAlignment && sectionAlignment >= 0x1000 && (sectionAlignment & (sectionAlignment - 1)) === 0 && fileAlignment >= 0x200 && fileAlignment <= 0x10000 && (fileAlignment & (fileAlignment - 1)) === 0 && imageSize > headersSize && imageSize % sectionAlignment === 0 && headersSize <= buffer.length && headersSize % fileAlignment === 0, 'artifact PE optional layout is invalid');
  const sectionTable = optional + optionalSize;
  assert(sectionTable + sectionCount * 40 <= buffer.length, 'artifact PE section table is truncated');
  let materializedSections = 0;
  let entryPointOwned = false;
  const names = new Set();
  const rawRanges = [];
  for (let index = 0; index < sectionCount; index += 1) {
    const offset = sectionTable + index * 40;
    const name = buffer.subarray(offset, offset + 8).toString('ascii').replace(/\0+$/, '');
    const virtualSize = buffer.readUInt32LE(offset + 8);
    const virtualAddress = buffer.readUInt32LE(offset + 12);
    const rawSize = buffer.readUInt32LE(offset + 16);
    const rawOffset = buffer.readUInt32LE(offset + 20);
    const sectionCharacteristics = buffer.readUInt32LE(offset + 36);
    assert(/^[.A-Za-z0-9_$-]{1,8}$/.test(name) && !names.has(name) && virtualSize > 0 && virtualAddress >= sectionAlignment && virtualAddress % sectionAlignment === 0, `artifact PE section ${index} is invalid`);
    names.add(name);
    const virtualEnd = virtualAddress + Math.max(virtualSize, rawSize);
    assert(Number.isSafeInteger(virtualEnd) && virtualEnd <= imageSize, `artifact PE section ${index} virtual bytes are out of bounds`);
    if (entryPoint >= virtualAddress && entryPoint < virtualEnd && (sectionCharacteristics & 0x20000000) !== 0) entryPointOwned = true;
    if (rawSize > 0) {
      assert(rawOffset >= headersSize && rawOffset % fileAlignment === 0 && rawSize % fileAlignment === 0 && rawOffset + rawSize <= buffer.length, `artifact PE section ${index} bytes are out of bounds`);
      rawRanges.push([rawOffset, rawOffset + rawSize]);
      materializedSections += 1;
    }
  }
  rawRanges.sort((a, b) => a[0] - b[0]);
  for (let index = 1; index < rawRanges.length; index += 1) assert(rawRanges[index - 1][1] <= rawRanges[index][0], 'artifact PE section bytes overlap');
  assert(materializedSections >= 3 && names.has('.text') && names.has('.rsrc') && entryPointOwned, 'artifact PE lacks required executable or resource sections');
  return { format: 'portable-executable', sectionCount };
}

function validateZipEntries(buffer) {
  assert(buffer.length >= 22 && buffer.length <= 512 * 1024 * 1024 && buffer.readUInt32LE(0) === 0x04034b50, 'artifact ZIP local header is invalid');
  let eocd = -1;
  const start = Math.max(0, buffer.length - 65557);
  for (let offset = buffer.length - 22; offset >= start; offset -= 1) {
    if (buffer.readUInt32LE(offset) !== 0x06054b50) continue;
    const commentLength = buffer.readUInt16LE(offset + 20);
    if (offset + 22 + commentLength === buffer.length) { eocd = offset; break; }
  }
  assert(eocd >= 0, 'artifact ZIP end record is missing');
  const diskNumber = buffer.readUInt16LE(eocd + 4);
  const directoryDisk = buffer.readUInt16LE(eocd + 6);
  const diskEntryCount = buffer.readUInt16LE(eocd + 8);
  const entryCount = buffer.readUInt16LE(eocd + 10);
  const directorySize = buffer.readUInt32LE(eocd + 12);
  const directoryOffset = buffer.readUInt32LE(eocd + 16);
  assert(diskNumber === 0 && directoryDisk === 0 && diskEntryCount === entryCount && entryCount > 0 && entryCount <= 20000 && directorySize > 0 && directoryOffset + directorySize === eocd, 'artifact ZIP central directory is empty or inconsistent');
  const entries = [];
  const names = new Set();
  let totalUncompressed = 0;
  let offset = directoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    assert(offset + 46 <= eocd && buffer.readUInt32LE(offset) === 0x02014b50, `artifact ZIP central entry ${index} is invalid`);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const flags = buffer.readUInt16LE(offset + 8);
    const method = buffer.readUInt16LE(offset + 10);
    const expectedCrc = buffer.readUInt32LE(offset + 16);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    assert(offset + 46 + nameLength + extraLength + commentLength <= eocd, `artifact ZIP central entry ${index} exceeds directory bounds`);
    const nameBytes = buffer.subarray(offset + 46, offset + 46 + nameLength);
    const name = nameBytes.toString('utf8').replaceAll('\\', '/');
    const normalizedName = name.toLowerCase();
    assert(name.length > 0 && !name.includes('\0') && Buffer.from(name.replaceAll('/', path.sep), 'utf8').length === nameBytes.length && !name.startsWith('/') && !/^[A-Za-z]:/.test(name) && !name.split('/').includes('..') && !names.has(normalizedName), `artifact ZIP entry ${index} path is unsafe`);
    names.add(normalizedName);
    assert((flags & ~0x0800) === 0, `artifact ZIP entry ${index} uses unsupported or encrypted flags`);
    assert(localOffset + 30 <= directoryOffset && buffer.readUInt32LE(localOffset) === 0x04034b50, `artifact ZIP local entry ${index} is missing`);
    const localFlags = buffer.readUInt16LE(localOffset + 6);
    const localMethod = buffer.readUInt16LE(localOffset + 8);
    const localCrc = buffer.readUInt32LE(localOffset + 14);
    const localCompressedSize = buffer.readUInt32LE(localOffset + 18);
    const localUncompressedSize = buffer.readUInt32LE(localOffset + 22);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const localName = buffer.subarray(localOffset + 30, localOffset + 30 + localNameLength);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    assert(localFlags === flags && localMethod === method && localCrc === expectedCrc && localCompressedSize === compressedSize && localUncompressedSize === uncompressedSize && localName.equals(nameBytes) && [0, 8].includes(method) && dataStart + compressedSize <= directoryOffset, `artifact ZIP entry ${index} compression metadata is invalid`);
    assert(uncompressedSize <= 256 * 1024 * 1024 && (compressedSize > 0 || uncompressedSize === 0) && (compressedSize === 0 || uncompressedSize / compressedSize <= 1000), `artifact ZIP entry ${index} exceeds decompression bounds`);
    totalUncompressed += uncompressedSize;
    assert(totalUncompressed <= 512 * 1024 * 1024, 'artifact ZIP expanded payload exceeds admission bound');
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    let content;
    try { content = method === 0 ? compressed : zlib.inflateRawSync(compressed, { maxOutputLength: Math.max(1, uncompressedSize) }); }
    catch { throw new Error(`artifact ZIP entry ${index} is not decodable`); }
    assert(content.length === uncompressedSize && crc32(content) === expectedCrc, `artifact ZIP entry ${index} size or CRC is invalid`);
    entries.push({ name, content });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  assert(offset === eocd, 'artifact ZIP central directory length is inconsistent');
  return entries;
}

function validateArtifact(buffer, relativePath) {
  if (buffer.length >= 2 && buffer[0] === 0x4d && buffer[1] === 0x5a) {
    assert(relativePath.toLowerCase().endsWith('.exe'), 'artifact PE path does not end in .exe');
    return validatePortableExecutable(buffer);
  }
  if (buffer.length >= 4 && buffer.readUInt32LE(0) === 0x04034b50) {
    const entries = validateZipEntries(buffer);
    const names = entries.map((entry) => entry.name);
    assert(relativePath.toLowerCase().endsWith('.nupkg'), 'artifact ZIP is not a Squirrel .nupkg package');
    const contentTypes = entries.find((entry) => entry.name.toLowerCase() === '[content_types].xml');
    const relationships = entries.find((entry) => entry.name.toLowerCase() === '_rels/.rels');
    const manifests = entries.filter((entry) => entry.name.toLowerCase().endsWith('.nuspec'));
    const payload = entries.filter((entry) => /^lib\/net(?:45|4[6-9]|[5-9][0-9]|[1-9][0-9]{2,})\/.+/i.test(entry.name));
    assert(contentTypes && /<Types\b/.test(contentTypes.content.toString('utf8')), 'artifact Squirrel package lacks valid [Content_Types].xml');
    assert(relationships && /<Relationships\b/.test(relationships.content.toString('utf8')), 'artifact Squirrel package lacks valid package relationships');
    assert(manifests.length === 1 && /<package\b/i.test(manifests[0].content.toString('utf8')) && /<metadata\b/i.test(manifests[0].content.toString('utf8')), 'artifact Squirrel package lacks one valid .nuspec manifest');
    const manifestText = manifests[0].content.toString('utf8');
    const packageId = manifestText.match(/<id>\s*([^<]+?)\s*<\/id>/i)?.[1];
    const packageVersion = manifestText.match(/<version>\s*([^<]+?)\s*<\/version>/i)?.[1];
    assert(packageId === 'open-design-packaged-app' && typeof packageVersion === 'string' && /^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][A-Za-z0-9.-]+)?$/.test(packageVersion), 'artifact Squirrel package identity is not Material Designer');
    assert(payload.length > 0 && payload.every((entry) => entry.content.length > 0), 'artifact Squirrel package lacks an application payload under lib/net*');
    const expectedExecutable = payload.find((entry) => /^lib\/net45\/Material Designer\.exe$/i.test(entry.name));
    const expectedAsar = payload.find((entry) => /^lib\/net45\/resources\/app\.asar$/i.test(entry.name));
    assert(expectedExecutable && expectedAsar && expectedAsar.content.length >= 1024, 'artifact Squirrel package lacks the expected Material Designer executable or app.asar payload');
    validatePortableExecutable(expectedExecutable.content);
    return {
      format: 'squirrel-nupkg',
      entries: names,
      packageId,
      packageVersion,
      executableSha256: sha256(expectedExecutable.content),
      asarSha256: sha256(expectedAsar.content),
    };
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
  let idatClosed = false;
  let finalOffset = null;
  const ancillaryTypes = [];
  const compressed = [];
  let chunkIndex = 0;
  let compressedBytes = 0;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const typeStart = offset + 4;
    const dataStart = offset + 8;
    const crcOffset = dataStart + length;
    assert(crcOffset + 4 <= buffer.length, 'capture PNG chunk exceeds file bounds');
    const type = buffer.subarray(typeStart, dataStart).toString('ascii');
    const data = buffer.subarray(dataStart, crcOffset);
    assert(/^[A-Za-z]{4}$/.test(type), 'capture PNG chunk type is invalid');
    const expectedCrc = buffer.readUInt32BE(crcOffset);
    assert(crc32(Buffer.concat([buffer.subarray(typeStart, dataStart), data])) === expectedCrc, `capture PNG ${type} CRC is invalid`);
    if (type === 'IHDR') {
      assert(chunkIndex === 0 && length === 13 && width === null, 'capture PNG IHDR is invalid');
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      assert(width > 0 && height > 0 && data[10] === 0 && data[11] === 0 && data[12] === 0, 'capture PNG dimensions or encoding are invalid');
      assert(width <= 16384 && height <= 16384 && width * height <= 40000000, 'capture PNG dimensions exceed evidence bounds');
    } else if (type === 'IDAT') {
      assert(width !== null && !idatClosed, 'capture PNG IDAT ordering is invalid');
      sawIdat = true;
      compressed.push(data);
      compressedBytes += data.length;
      assert(compressedBytes <= 128 * 1024 * 1024, 'capture PNG compressed image data exceeds evidence bounds');
    } else if (type === 'IEND') {
      assert(width !== null && sawIdat && length === 0, 'capture PNG IEND is invalid');
      sawIend = true;
      finalOffset = crcOffset + 4;
      break;
    } else {
      if (sawIdat) idatClosed = true;
      if (/^[A-Z]/.test(type)) {
        assert(type === 'PLTE', `capture PNG has unknown critical chunk ${type}`);
        assert(!sawIdat, 'capture PNG PLTE ordering is invalid');
      }
      else ancillaryTypes.push(type);
    }
    offset = crcOffset + 4;
    chunkIndex += 1;
  }
  assert(width !== null && sawIdat && sawIend, 'capture PNG is missing IHDR, IDAT, or IEND');
  assert(finalOffset === buffer.length, 'capture PNG has trailing bytes after IEND');
  assert(width >= 64 && height >= 64, 'capture PNG dimensions are too small for real UI evidence');
  let inflated;
  try {
    inflated = zlib.inflateSync(Buffer.concat(compressed), { maxOutputLength: Math.max(1024, width * height * 8 + height) });
  } catch {
    throw new Error('capture PNG image data is not decodable');
  }
  const channels = new Map([[2, 3], [6, 4]]).get(colorType);
  assert(channels && bitDepth === 8, 'capture PNG must use 8-bit RGB or RGBA pixels');
  const rowBytes = Math.ceil(width * channels * bitDepth / 8);
  assert(inflated.length === height * (rowBytes + 1), 'capture PNG decoded dimensions do not match IHDR');
  const pixels = Buffer.alloc(width * height * channels);
  const paeth = (left, above, upperLeft) => {
    const estimate = left + above - upperLeft;
    const leftDistance = Math.abs(estimate - left);
    const aboveDistance = Math.abs(estimate - above);
    const upperLeftDistance = Math.abs(estimate - upperLeft);
    return leftDistance <= aboveDistance && leftDistance <= upperLeftDistance ? left : aboveDistance <= upperLeftDistance ? above : upperLeft;
  };
  let inputOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[inputOffset];
    inputOffset += 1;
    assert(filter >= 0 && filter <= 4, `capture PNG row ${y} uses an invalid filter`);
    for (let x = 0; x < rowBytes; x += 1) {
      const encoded = inflated[inputOffset + x];
      const outputOffset = y * rowBytes + x;
      const left = x >= channels ? pixels[outputOffset - channels] : 0;
      const above = y > 0 ? pixels[outputOffset - rowBytes] : 0;
      const upperLeft = y > 0 && x >= channels ? pixels[outputOffset - rowBytes - channels] : 0;
      const value = filter === 0 ? encoded : filter === 1 ? encoded + left : filter === 2 ? encoded + above : filter === 3 ? encoded + Math.floor((left + above) / 2) : encoded + paeth(left, above, upperLeft);
      pixels[outputOffset] = value & 0xff;
    }
    inputOffset += rowBytes;
  }
  const uniquePixels = new Set();
  let visiblePixels = 0;
  for (let offset = 0; offset < pixels.length; offset += channels) {
    const alpha = channels === 4 ? pixels[offset + 3] : 255;
    if (alpha > 0) visiblePixels += 1;
    if (uniquePixels.size < 4097) uniquePixels.add(`${pixels[offset]},${pixels[offset + 1]},${pixels[offset + 2]},${alpha}`);
  }
  assert(visiblePixels >= Math.ceil(width * height * 0.1) && uniquePixels.size >= 2, 'capture PNG decoded pixels are empty or visually trivial');
  const pixelAt = (x, y) => {
    assert(Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < width && y < height, 'capture contrast sample coordinate is outside the image');
    const offset = (y * width + x) * channels;
    const alpha = channels === 4 ? pixels[offset + 3] / 255 : 1;
    return { r: pixels[offset], g: pixels[offset + 1], b: pixels[offset + 2], alpha };
  };
  return { width, height, channels, pixels, pixelAt, ancillaryTypes };
}

function relativeLuminance({ r, g, b }) {
  const linear = [r, g, b].map((value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(foreground, background) {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function inputTreeSha256(cwd, commit) {
  return sha256(execFileSync('git', ['ls-tree', '-r', '-z', '--full-tree', commit], { cwd, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 }));
}

function auditPrivacyScannerSource(scannerBytes, label) {
  const source = scannerBytes.toString('utf8');
  assert(Buffer.from(source, 'utf8').equals(scannerBytes) && !source.includes('\uFFFD'), `${label} privacy scanner source is not canonical UTF-8`);
  const importSource = '^\\s*import\\s+[^\'"\\r\\n]+\\s+from\\s+[\'"]([^\'"]+)[\'"];[ \\t]*$';
  const imports = [...source.matchAll(new RegExp(importSource, 'gm'))].map((match) => match[1]);
  equalArray(imports, ['node:crypto', 'node:fs', 'node:path', 'node:url'], `${label} privacy scanner import graph`);
  const sourceWithoutReviewedImports = source.replace(new RegExp(importSource, 'gm'), '').replaceAll('import.meta.url', '');
  assert(!/\bimport\b/u.test(sourceWithoutReviewedImports), `${label} privacy scanner import graph contains an unreviewed import form`);
  const forbidden = /\b(?:require|createRequire|getBuiltinModule|fetch|WebSocket|XMLHttpRequest|EventSource|eval|Function|WebAssembly|SharedArrayBuffer|Atomics|globalThis)\b|\bimport\s*\(|\b(?:process|fs)\s*\[|\.constructor\b|\bprocess\.(?:env|binding|dlopen|mainModule)\b|\bnode:(?:http|https|http2|net|tls|dgram|dns|child_process|worker_threads|cluster|vm|module|inspector|perf_hooks|os)\b|\.node(?:['"\s]|$)/u;
  assert(!forbidden.test(source), `${label} privacy scanner source uses a forbidden import or exfiltration token`);
  const fsMembers = [...source.matchAll(/\bfs\.([A-Za-z_$][A-Za-z0-9_$]*)/g)].map((match) => match[1]);
  assert(fsMembers.length > 0 && fsMembers.every((member) => member === 'readFileSync'), `${label} privacy scanner source uses a forbidden filesystem operation`);
  const processMembers = [...source.matchAll(/\bprocess\.([A-Za-z_$][A-Za-z0-9_$]*)/g)].map((match) => match[1]);
  assert(processMembers.every((member) => ['argv', 'stdout', 'stderr', 'exitCode'].includes(member)), `${label} privacy scanner source uses a forbidden process operation`);
}

function executeCheckedOutPrivacyScanner(report, sourceCommit, gitCwd, artifactBytes, captureBytes, label, options = {}) {
  assert(report.scanner.name === PRIVACY_SCANNER_NAME && report.scanner.path === PRIVACY_SCANNER_PATH && report.method === PRIVACY_SCANNER_METHOD && report.methodVersion === PRIVACY_SCANNER_METHOD_VERSION, `${label} committed privacy scanner identity does not match source commit`);
  const checkedOutHead = gitText(gitCwd, ['rev-parse', 'HEAD']);
  assert(sourceCommit === checkedOutHead, `${label} privacy scanner source commit is not the checked-out HEAD`);
  const scannerFile = repoFile(gitCwd, report.scanner.path, `${label} privacy scanner`);
  const scannerBlob = gitBlobAt(gitCwd, checkedOutHead, report.scanner.path, `${label} privacy scanner`);
  assert(workingBlob(gitCwd, scannerFile) === scannerBlob, `${label} checked-out privacy scanner differs from HEAD`);
  const scannerBytes = readBoundedFile(scannerFile, `${label} privacy scanner`, 1024 * 1024);
  assert(report.scanner.sha256 === sha256(scannerBytes), `${label} committed privacy scanner identity does not match source commit`);
  auditPrivacyScannerSource(scannerBytes, label);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lang-gui-privacy-scan-'));
  try {
    const artifactFile = path.join(directory, 'artifact.bin');
    const captureFile = path.join(directory, 'capture.png');
    fs.writeFileSync(artifactFile, artifactBytes, { flag: 'wx' });
    fs.writeFileSync(captureFile, captureBytes, { flag: 'wx' });
    const runner = options.runner ?? spawnSync;
    const result = runner(process.execPath, [
      '--permission',
      `--allow-fs-read=${directory}`,
      `--allow-fs-read=${scannerFile}`,
      scannerFile,
      '--artifact', artifactFile,
      '--capture', captureFile,
    ], {
      cwd: directory,
      encoding: 'buffer',
      env: { SystemRoot: process.env.SystemRoot ?? '', WINDIR: process.env.WINDIR ?? '', NODE_OPTIONS: '' },
      maxBuffer: 512 * 1024,
      timeout: 15000,
      windowsHide: true,
    });
    assert(!result.error && !result.signal && [0, 1].includes(result.status), `${label} committed privacy scanner did not complete in its isolated boundary`);
    const derivedReport = parseBoundedJsonBytes(result.stdout, `${label} isolated privacy scanner output`, JSON_LIMITS.receipt.maxBytes, JSON_LIMITS.receipt);
    if (derivedReport.status === 'pass') assert(result.status === 0, `${label} pass-shaped privacy scanner report did not exit zero`);
    else assert(result.status === 1, `${label} failing privacy scanner report did not exit one`);
    return { scannerBytes, derivedReport };
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function mintLiveProofSession() {
  const capability = Object.freeze(Object.create(null));
  const state = {
    nonce: crypto.randomBytes(32).toString('hex'),
    startedAt: Date.now(),
    authorized: false,
    completedAt: null,
    sourceCommit: null,
    artifactHash: null,
    packageHash: null,
    installedExecutableHash: null,
    elementProofs: new Map(),
  };
  liveProofSessions.set(capability, state);
  return { capability, state };
}

function authorizeLiveProofSession(capability, proof) {
  const state = liveProofSessions.get(capability);
  assert(state && !state.authorized, 'live proof session is missing or already authorized');
  assert(proof && proof.elementProofs instanceof Map && proof.elementProofs.size > 0, 'live proof session has no runtime element observations');
  state.authorized = true;
  state.completedAt = Date.now();
  state.sourceCommit = proof.sourceCommit;
  state.artifactHash = proof.artifactHash;
  state.packageHash = proof.packageHash;
  state.installedExecutableHash = proof.installedExecutableHash;
  state.elementProofs = proof.elementProofs;
}

function revokeLiveProofSession(capability) {
  liveProofSessions.delete(capability);
}

function requireLiveProofCapability(capability, element, label) {
  const state = capability && typeof capability === 'object' ? liveProofSessions.get(capability) : null;
  const proof = state?.elementProofs.get(element.stableElementId);
  assert(state?.authorized === true && Number.isInteger(state.completedAt) && state.completedAt >= state.startedAt && Date.now() - state.completedAt <= LIVE_PROOF_TTL_MS && proof, `${label} verified status requires verifier-owned live proof capability`);
  return { session: state, element: proof };
}

function canonicalEvidencePrefix(elementId) {
  return `${EVIDENCE_ROOT}/${elementId}/`;
}

function assertCanonicalEvidencePaths(element, label) {
  const receipt = element.interactionReceipt;
  const capture = element.captureTuple;
  const prefix = canonicalEvidencePrefix(element.stableElementId);
  const paths = [
    receipt.artifactPath,
    receipt.packagePath,
    receipt.releasesPath,
    receipt.path,
    receipt.buildReceiptPath,
    receipt.buildProvenancePath,
    receipt.installerManifestPath,
    receipt.installedReceiptPath,
    receipt.privacyReportPath,
    capture.path,
  ];
  assert(paths.every((value) => typeof value === 'string' && value.startsWith(prefix) && !value.includes('\\') && value.split('/').every((part) => part.length > 0 && part !== '.' && part !== '..') && !/(?:^|\/)(?:fixture|fixtures|synthetic)(?:\/|$)/i.test(value)), `${label} evidence paths are outside canonical task staging`);
  assert(/^assets\/material-designer-[a-z0-9._-]+-win-x64-setup\.exe$/i.test(receipt.artifactPath.slice(prefix.length)), `${label} installer path is not the supported staged Setup.exe`);
  assert(/^assets\/open-design-packaged-app-[a-z0-9._-]+-full\.nupkg$/i.test(receipt.packagePath.slice(prefix.length)), `${label} package path is not the supported staged full Squirrel package`);
  assert(receipt.releasesPath === `${prefix}assets/RELEASES`, `${label} RELEASES path is not the supported staged Squirrel index`);
  assert(receipt.path === `${prefix}interaction-receipt.json` && receipt.buildReceiptPath === `${prefix}build-receipt.json` && receipt.buildProvenancePath === `${prefix}build-provenance.json` && receipt.installerManifestPath === `${prefix}installer-manifest.json` && receipt.installedReceiptPath === `${prefix}installed-receipt.json` && receipt.privacyReportPath === `${prefix}privacy-report.json`, `${label} receipt paths are not canonical`);
  assert(capture.path.startsWith(`${prefix}captures/`) && capture.path.endsWith('.png'), `${label} capture path is not canonical`);
  return paths;
}

function identityMatches(identity, relativePath, hash, blob) {
  return identity.path === relativePath && identity.sha256 === hash && identity.gitBlob === blob;
}

function validateSquirrelReleases(bytes, packagePath, packageBytes, label) {
  const text = bytes.toString('utf8');
  assert(!text.includes('\0') && Buffer.from(text, 'utf8').equals(bytes), `${label} RELEASES index is not canonical UTF-8 text`);
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
  assert(lines.length > 0 && lines.length <= 1024, `${label} RELEASES index has no bounded entries`);
  const parsed = lines.map((line, index) => {
    const match = line.match(/^([0-9a-f]{40})\s+([^\s]+)\s+([1-9][0-9]*)$/i);
    assert(match && !match[2].includes('/') && !match[2].includes('\\') && !match[2].includes('..'), `${label} RELEASES entry ${index} is malformed`);
    return { sha1: match[1].toLowerCase(), name: match[2], size: Number(match[3]) };
  });
  const packageName = packagePath.split(/[\\/]/).at(-1);
  const matches = parsed.filter((entry) => entry.name === packageName);
  assert(matches.length === 1 && matches[0].size === packageBytes.length && matches[0].sha1 === crypto.createHash('sha1').update(packageBytes).digest('hex'), `${label} RELEASES index does not bind the full package bytes`);
}

function validateSupportedBuildScripts(buildReceipt, buildSourceCommit, sourceCommit, gitCwd, label) {
  equalArray(buildReceipt.scripts.map((entry) => entry.path), SUPPORTED_BUILD_SCRIPT_PATHS, `${label} supported build script paths`);
  const checkedOutHead = gitText(gitCwd, ['rev-parse', 'HEAD']);
  for (const entry of buildReceipt.scripts) {
    const buildBlob = gitBlobAt(gitCwd, buildSourceCommit, entry.path, `${label} build script`);
    const evidenceBlob = gitBlobAt(gitCwd, sourceCommit, entry.path, `${label} evidence-source build script`);
    const headBlob = gitBlobAt(gitCwd, checkedOutHead, entry.path, `${label} checked-out build script`);
    const scriptFile = repoFile(gitCwd, entry.path, `${label} checked-out build script`);
    const scriptBytes = gitBlobBytes(gitCwd, buildBlob, `${label} build script`);
    assert(buildBlob === evidenceBlob && buildBlob === headBlob && workingBlob(gitCwd, scriptFile) === headBlob && entry.gitBlob === buildBlob && entry.sha256 === sha256(scriptBytes), `${label} supported build script identity does not match the built and checked-out source`);
  }
}

function validateBuildProcess(processReceipt, provenance, label) {
  const started = Date.parse(processReceipt.startedAt);
  const completed = Date.parse(processReceipt.completedAt);
  const builtAt = Date.parse(provenance.builtAt);
  assert(Number.isFinite(started) && Number.isFinite(completed) && completed > started && completed - started === processReceipt.durationMs, `${label} build process timing is not an exact successful outcome`);
  assert(Number.isFinite(builtAt) && builtAt >= started && builtAt <= completed, `${label} build provenance timestamp is outside the build process`);
}

function validateCaptureReceipt(receiptDocument, capture, receipt, png, label) {
  const viewport = capture.viewport.match(/^([1-9][0-9]*)x([1-9][0-9]*)$/);
  assert(viewport && Number(viewport[1]) === png.width && Number(viewport[2]) === png.height, `${label} capture dimensions do not equal viewport tuple`);
  assert(capture.mediaType === 'image/png' && png.width === capture.width && png.height === capture.height, `${label} capture media metadata does not match PNG bytes`);
  const tuple = receiptDocument.tuple;
  assert(tuple.route === capture.route && tuple.state === capture.state && tuple.theme === capture.theme && tuple.viewport === capture.viewport && tuple.scale === capture.scale, `${label} interaction receipt tuple does not match capture tuple`);
  assert(capture.artifactHash === receipt.artifactHash, `${label} capture artifact hash is stale`);
}

function validateContrastReceipt(element, receiptDocument, capture, png, label) {
  const foreground = receiptDocument.contrast.foreground;
  const background = receiptDocument.contrast.background;
  const foregroundPixel = png.pixelAt(foreground.x, foreground.y);
  const backgroundPixel = png.pixelAt(background.x, background.y);
  assert(foregroundPixel.alpha === 1 && backgroundPixel.alpha === 1, `${label} contrast samples must be opaque`);
  assert([foregroundPixel.r, foregroundPixel.g, foregroundPixel.b].every((value, index) => value === foreground.rgb[index]) && [backgroundPixel.r, backgroundPixel.g, backgroundPixel.b].every((value, index) => value === background.rgb[index]), `${label} committed contrast samples do not match capture pixels`);
  const derivedContrast = contrastRatio(foregroundPixel, backgroundPixel);
  assert(Math.abs(derivedContrast - receiptDocument.contrast.ratio) <= 0.000001 && Math.abs(derivedContrast - element.contrast.ratio) <= 0.000001 && Math.abs(derivedContrast - capture.contrast) <= 0.000001, `${label} contrast ratio is not derived from committed capture pixels`);
  assert(foreground.role === element.contrast.foreground && background.role === element.contrast.background, `${label} contrast sample roles do not match element roles`);
}

function checkVerifiedEvidence(element, label, registrySchema, liveProofCapability = null) {
  const evidenceRoot = root;
  const gitCwd = root;
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
  const liveProof = requireLiveProofCapability(liveProofCapability, element, label);
  const receipt = element.interactionReceipt;
  const capture = element.captureTuple;
  const rolePaths = assertCanonicalEvidencePaths(element, label);
  assert(new Set(rolePaths).size === rolePaths.length, `${label} evidence role paths must be distinct`);
  assert(/^[0-9a-f]{40}$/.test(receipt.sourceCommit), `${label} source commit is not immutable`);
  assert(/^[0-9a-f]{40}$/.test(receipt.buildSourceCommit), `${label} build source commit is not immutable`);
  assert(/^[0-9a-f]{40}$/.test(receipt.buildSourceTree), `${label} build source tree is not immutable`);
  try {
    execFileSync('git', ['cat-file', '-e', `${receipt.sourceCommit}^{commit}`], { cwd: gitCwd, stdio: 'ignore' });
    execFileSync('git', ['cat-file', '-e', `${receipt.buildSourceCommit}^{commit}`], { cwd: gitCwd, stdio: 'ignore' });
  } catch {
    throw new Error(`${label} source or build source commit does not exist`);
  }
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', receipt.buildSourceCommit, receipt.sourceCommit], { cwd: gitCwd, stdio: 'ignore' });
  } catch {
    throw new Error(`${label} build source commit is not an ancestor of source commit`);
  }
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', receipt.sourceCommit, 'HEAD'], { cwd: gitCwd, stdio: 'ignore' });
  } catch {
    throw new Error(`${label} evidence source commit is not an ancestor of checked-out HEAD`);
  }
  assert(gitText(gitCwd, ['rev-parse', `${receipt.buildSourceCommit}^{tree}`]) === receipt.buildSourceTree, `${label} build source tree does not match build source commit`);
  const artifactFile = repoFile(evidenceRoot, receipt.artifactPath, `${label} artifact`);
  const packageFile = repoFile(evidenceRoot, receipt.packagePath, `${label} package`);
  const releasesFile = repoFile(evidenceRoot, receipt.releasesPath, `${label} RELEASES`);
  const receiptFile = repoFile(evidenceRoot, receipt.path, `${label} receipt`);
  const captureFile = repoFile(evidenceRoot, capture.path, `${label} capture`);
  const buildReceiptFile = repoFile(evidenceRoot, receipt.buildReceiptPath, `${label} build receipt`);
  const buildProvenanceFile = repoFile(evidenceRoot, receipt.buildProvenancePath, `${label} build provenance`);
  const installerManifestFile = repoFile(evidenceRoot, receipt.installerManifestPath, `${label} installer manifest`);
  const installedReceiptFile = repoFile(evidenceRoot, receipt.installedReceiptPath, `${label} installed receipt`);
  const privacyReportFile = repoFile(evidenceRoot, receipt.privacyReportPath, `${label} privacy report`);
  const artifactBlob = gitBlobAt(gitCwd, receipt.sourceCommit, receipt.artifactPath, `${label} artifact`);
  const packageBlob = gitBlobAt(gitCwd, receipt.sourceCommit, receipt.packagePath, `${label} package`);
  const releasesBlob = gitBlobAt(gitCwd, receipt.sourceCommit, receipt.releasesPath, `${label} RELEASES`);
  const receiptBlob = gitBlobAt(gitCwd, receipt.sourceCommit, receipt.path, `${label} receipt`);
  const captureBlob = gitBlobAt(gitCwd, receipt.sourceCommit, capture.path, `${label} capture`);
  const buildReceiptBlob = gitBlobAt(gitCwd, receipt.sourceCommit, receipt.buildReceiptPath, `${label} build receipt`);
  const buildProvenanceBlob = gitBlobAt(gitCwd, receipt.sourceCommit, receipt.buildProvenancePath, `${label} build provenance`);
  const installerManifestBlob = gitBlobAt(gitCwd, receipt.sourceCommit, receipt.installerManifestPath, `${label} installer manifest`);
  const installedReceiptBlob = gitBlobAt(gitCwd, receipt.sourceCommit, receipt.installedReceiptPath, `${label} installed receipt`);
  const privacyReportBlob = gitBlobAt(gitCwd, receipt.sourceCommit, receipt.privacyReportPath, `${label} privacy report`);
  assert(artifactBlob === receipt.artifactGitBlob, `${label} artifact Git blob does not match source commit`);
  assert(packageBlob === receipt.packageGitBlob, `${label} package Git blob does not match source commit`);
  assert(releasesBlob === receipt.releasesGitBlob, `${label} RELEASES Git blob does not match source commit`);
  assert(receiptBlob === receipt.receiptGitBlob, `${label} receipt Git blob does not match source commit`);
  assert(captureBlob === capture.captureGitBlob, `${label} capture Git blob does not match source commit`);
  assert(buildReceiptBlob === receipt.buildReceiptGitBlob, `${label} build receipt Git blob does not match source commit`);
  assert(buildProvenanceBlob === receipt.buildProvenanceGitBlob, `${label} build provenance Git blob does not match source commit`);
  assert(installerManifestBlob === receipt.installerManifestGitBlob, `${label} installer manifest Git blob does not match source commit`);
  assert(installedReceiptBlob === receipt.installedReceiptGitBlob, `${label} installed receipt Git blob does not match source commit`);
  assert(privacyReportBlob === receipt.privacyReportGitBlob, `${label} privacy report Git blob does not match source commit`);
  const committedWorkingPairs = [
    [artifactFile, artifactBlob], [packageFile, packageBlob], [releasesFile, releasesBlob], [receiptFile, receiptBlob], [captureFile, captureBlob], [buildReceiptFile, buildReceiptBlob], [buildProvenanceFile, buildProvenanceBlob], [installerManifestFile, installerManifestBlob], [installedReceiptFile, installedReceiptBlob], [privacyReportFile, privacyReportBlob],
  ];
  assert(committedWorkingPairs.every(([file, blob]) => workingBlob(gitCwd, file) === blob), `${label} working evidence bytes differ from source commit`);
  const artifactBytes = readBoundedFile(artifactFile, `${label} artifact`, 512 * 1024 * 1024);
  const packageBytes = readBoundedFile(packageFile, `${label} package`, 512 * 1024 * 1024);
  const releasesBytes = readBoundedFile(releasesFile, `${label} RELEASES`, 16 * 1024 * 1024);
  const receiptBytes = readBoundedFile(receiptFile, `${label} interaction receipt`, JSON_LIMITS.receipt.maxBytes);
  const captureBytes = readBoundedFile(captureFile, `${label} capture`, 128 * 1024 * 1024);
  const buildReceiptBytes = readBoundedFile(buildReceiptFile, `${label} build receipt`, JSON_LIMITS.receipt.maxBytes);
  const buildProvenanceBytes = readBoundedFile(buildProvenanceFile, `${label} build provenance`, JSON_LIMITS.receipt.maxBytes);
  const installerManifestBytes = readBoundedFile(installerManifestFile, `${label} installer manifest`, JSON_LIMITS.receipt.maxBytes);
  const installedReceiptBytes = readBoundedFile(installedReceiptFile, `${label} installed receipt`, JSON_LIMITS.receipt.maxBytes);
  const privacyReportBytes = readBoundedFile(privacyReportFile, `${label} privacy report`, JSON_LIMITS.receipt.maxBytes);
  assert(sha256(artifactBytes) === receipt.artifactHash, `${label} artifact SHA-256 does not match its file`);
  assert(sha256(packageBytes) === receipt.packageHash, `${label} package SHA-256 does not match its file`);
  assert(sha256(releasesBytes) === receipt.releasesHash, `${label} RELEASES SHA-256 does not match its file`);
  assert(sha256(receiptBytes) === receipt.receiptHash, `${label} receipt SHA-256 does not match its file`);
  assert(sha256(captureBytes) === capture.captureHash, `${label} capture SHA-256 does not match its file`);
  assert(sha256(buildReceiptBytes) === receipt.buildReceiptHash, `${label} build receipt SHA-256 does not match its file`);
  assert(sha256(buildProvenanceBytes) === receipt.buildProvenanceHash, `${label} build provenance SHA-256 does not match its file`);
  assert(sha256(installerManifestBytes) === receipt.installerManifestHash, `${label} installer manifest SHA-256 does not match its file`);
  assert(sha256(installedReceiptBytes) === receipt.installedReceiptHash, `${label} installed receipt SHA-256 does not match its file`);
  assert(sha256(privacyReportBytes) === receipt.privacyReportHash, `${label} privacy report SHA-256 does not match its file`);
  validateArtifact(artifactBytes, receipt.artifactPath);
  const packageResult = validateArtifact(packageBytes, receipt.packagePath);
  validateSquirrelReleases(releasesBytes, receipt.packagePath, packageBytes, label);
  const png = validatePng(captureBytes);
  const receiptDocument = parseBoundedJsonBytes(receiptBytes, `${label} interaction receipt`, 256 * 1024);
  const buildReceiptDocument = parseBoundedJsonBytes(buildReceiptBytes, `${label} build receipt`, 256 * 1024);
  const buildProvenanceDocument = parseBoundedJsonBytes(buildProvenanceBytes, `${label} build provenance`, 256 * 1024);
  const installerManifestDocument = parseBoundedJsonBytes(installerManifestBytes, `${label} installer manifest`, 256 * 1024);
  const installedReceiptDocument = parseBoundedJsonBytes(installedReceiptBytes, `${label} installed receipt`, 256 * 1024);
  const privacyReportDocument = parseBoundedJsonBytes(privacyReportBytes, `${label} privacy report`, 256 * 1024);
  validateAgainstSchema(receiptDocument, registrySchema.$defs.receiptDocument, `${label}.receipt`, registrySchema);
  validateAgainstSchema(buildReceiptDocument, registrySchema.$defs.buildReceiptDocument, `${label}.buildReceipt`, registrySchema);
  validateAgainstSchema(buildProvenanceDocument, registrySchema.$defs.buildProvenanceDocument, `${label}.buildProvenance`, registrySchema);
  validateAgainstSchema(installerManifestDocument, registrySchema.$defs.installerManifestDocument, `${label}.installerManifest`, registrySchema);
  validateAgainstSchema(installedReceiptDocument, registrySchema.$defs.installedReceiptDocument, `${label}.installedReceipt`, registrySchema);
  validateAgainstSchema(privacyReportDocument, registrySchema.$defs.privacyReportDocument, `${label}.privacyReport`, registrySchema);
  assert(receiptDocument.elementId === element.stableElementId, `${label} receipt element id does not match`);
  assert(receiptDocument.buildSourceCommit === receipt.buildSourceCommit && receiptDocument.buildSourceTree === receipt.buildSourceTree && receiptDocument.buildInputHash === receipt.buildInputHash, `${label} receipt build provenance does not match`);
  assert(receiptDocument.artifact.path === receipt.artifactPath && receiptDocument.artifact.sha256 === receipt.artifactHash && receiptDocument.artifact.gitBlob === receipt.artifactGitBlob, `${label} receipt artifact identity does not match`);
  assert(identityMatches(receiptDocument.package, receipt.packagePath, receipt.packageHash, receipt.packageGitBlob), `${label} receipt package identity does not match`);
  assert(identityMatches(receiptDocument.releases, receipt.releasesPath, receipt.releasesHash, receipt.releasesGitBlob), `${label} receipt RELEASES identity does not match`);
  assert(receiptDocument.capture.path === capture.path && receiptDocument.capture.sha256 === capture.captureHash && receiptDocument.capture.gitBlob === capture.captureGitBlob, `${label} receipt capture identity does not match`);
  assert(receiptDocument.capture.width === capture.width && receiptDocument.capture.height === capture.height && receiptDocument.capture.mediaType === capture.mediaType, `${label} receipt capture metadata does not match`);
  assert(receiptDocument.buildReceipt.path === receipt.buildReceiptPath && receiptDocument.buildReceipt.sha256 === receipt.buildReceiptHash && receiptDocument.buildReceipt.gitBlob === receipt.buildReceiptGitBlob, `${label} receipt build identity does not match`);
  assert(identityMatches(receiptDocument.buildProvenance, receipt.buildProvenancePath, receipt.buildProvenanceHash, receipt.buildProvenanceGitBlob), `${label} receipt build provenance identity does not match`);
  assert(identityMatches(receiptDocument.installerManifest, receipt.installerManifestPath, receipt.installerManifestHash, receipt.installerManifestGitBlob), `${label} receipt installer manifest identity does not match`);
  assert(identityMatches(receiptDocument.installedReceipt, receipt.installedReceiptPath, receipt.installedReceiptHash, receipt.installedReceiptGitBlob), `${label} receipt installed identity does not match`);
  assert(receiptDocument.privacyReport.path === receipt.privacyReportPath && receiptDocument.privacyReport.sha256 === receipt.privacyReportHash && receiptDocument.privacyReport.gitBlob === receipt.privacyReportGitBlob, `${label} receipt privacy identity does not match`);
  assert(buildReceiptDocument.buildSourceCommit === receipt.buildSourceCommit && buildReceiptDocument.buildSourceTree === receipt.buildSourceTree, `${label} build receipt source commit or tree does not match`);
  assert(buildReceiptDocument.inputTreeSha256 === receipt.buildInputHash && buildReceiptDocument.inputTreeSha256 === inputTreeSha256(gitCwd, receipt.buildSourceCommit), `${label} build receipt input SHA does not match source tree`);
  assert(buildReceiptDocument.artifact.path === receipt.artifactPath && buildReceiptDocument.artifact.sha256 === receipt.artifactHash && buildReceiptDocument.artifact.gitBlob === receipt.artifactGitBlob && buildReceiptDocument.artifact.size === artifactBytes.length, `${label} build receipt artifact identity does not match`);
  assert(buildReceiptDocument.package.path === receipt.packagePath && buildReceiptDocument.package.sha256 === receipt.packageHash && buildReceiptDocument.package.gitBlob === receipt.packageGitBlob && buildReceiptDocument.package.size === packageBytes.length, `${label} build receipt package identity does not match`);
  assert(identityMatches(buildReceiptDocument.releases, receipt.releasesPath, receipt.releasesHash, receipt.releasesGitBlob), `${label} build receipt RELEASES identity does not match`);
  assert(identityMatches(buildReceiptDocument.buildProvenance, receipt.buildProvenancePath, receipt.buildProvenanceHash, receipt.buildProvenanceGitBlob) && identityMatches(buildReceiptDocument.installerManifest, receipt.installerManifestPath, receipt.installerManifestHash, receipt.installerManifestGitBlob) && identityMatches(buildReceiptDocument.installedReceipt, receipt.installedReceiptPath, receipt.installedReceiptHash, receipt.installedReceiptGitBlob), `${label} build receipt linked identity does not match`);
  validateSupportedBuildScripts(buildReceiptDocument, receipt.buildSourceCommit, receipt.sourceCommit, gitCwd, label);
  validateBuildProcess(buildReceiptDocument.process, buildProvenanceDocument, label);
  assert(buildProvenanceDocument.sourceCommit === receipt.buildSourceCommit && buildProvenanceDocument.sourceTree === receipt.buildSourceTree, `${label} build provenance source does not match exact built source`);
  const buildLogPrefix = `${canonicalEvidencePrefix(element.stableElementId)}logs/`;
  assert(buildProvenanceDocument.buildLog.path.startsWith(buildLogPrefix) && buildProvenanceDocument.buildLog.path.endsWith('.log') && !buildProvenanceDocument.buildLog.path.includes('\\') && buildProvenanceDocument.buildLog.path.split('/').every((part) => part.length > 0 && part !== '.' && part !== '..'), `${label} build log path is outside canonical task staging`);
  const buildLogFile = repoFile(evidenceRoot, buildProvenanceDocument.buildLog.path, `${label} build log`);
  const buildLogBlob = gitBlobAt(gitCwd, receipt.sourceCommit, buildProvenanceDocument.buildLog.path, `${label} build log`);
  assert(buildLogBlob === buildProvenanceDocument.buildLog.gitBlob && workingBlob(gitCwd, buildLogFile) === buildLogBlob, `${label} build log Git identity does not match source commit`);
  const buildLogBytes = readBoundedFile(buildLogFile, `${label} build log`, 16 * 1024 * 1024);
  assert(sha256(buildLogBytes) === buildProvenanceDocument.buildLog.sha256, `${label} build log SHA-256 does not match its file`);
  const buildLogText = buildLogBytes.toString('utf8');
  assert(buildLogText.includes('Build complete; no installer or release was published by this script') && buildLogText.includes('Unsigned installer:') && buildLogText.includes(`SHA-256: ${receipt.artifactHash}`), `${label} build log does not contain both supported successful process outcomes`);
  rolePaths.push(buildProvenanceDocument.buildLog.path);
  assert(new Set(rolePaths).size === rolePaths.length, `${label} evidence role paths must be distinct`);
  assert(installerManifestDocument.commit === receipt.buildSourceCommit && installerManifestDocument.sourceTree === receipt.buildSourceTree, `${label} installer manifest source does not match exact built source`);
  assert(installerManifestDocument.candidateVersion === packageResult.packageVersion && buildProvenanceDocument.package.version === packageResult.packageVersion && installedReceiptDocument.installation.candidateVersion === packageResult.packageVersion, `${label} Squirrel package version does not match provenance, manifest, and installation`);
  assert(installerManifestDocument.setup === path.posix.basename(receipt.artifactPath) && installerManifestDocument.setupSha256 === receipt.artifactHash && installerManifestDocument.setupBytes === artifactBytes.length && installerManifestDocument.fullPackage === path.posix.basename(receipt.packagePath) && installerManifestDocument.fullPackageSha256 === receipt.packageHash && installerManifestDocument.fullPackageBytes === packageBytes.length, `${label} installer manifest does not bind the staged Squirrel bytes`);
  assert(installedReceiptDocument.sourceCommit === receipt.buildSourceCommit && installedReceiptDocument.sourceTree === receipt.buildSourceTree, `${label} installed receipt source does not match exact built source`);
  assert(identityMatches(installedReceiptDocument.artifact, receipt.artifactPath, receipt.artifactHash, receipt.artifactGitBlob) && identityMatches(installedReceiptDocument.capture, capture.path, capture.captureHash, capture.captureGitBlob), `${label} installed receipt does not link the installer and capture evidence`);
  assert(installedReceiptDocument.installation.installedExecutableSha256 === packageResult.executableSha256 && installedReceiptDocument.launch.processImageSha256 === packageResult.executableSha256 && installedReceiptDocument.launch.width === capture.width && installedReceiptDocument.launch.height === capture.height, `${label} installed receipt did not launch and capture the packaged Material Designer executable`);
  validateCaptureReceipt(receiptDocument, capture, receipt, png, label);
  const { derivedReport: derivedPrivacyReport } = executeCheckedOutPrivacyScanner(privacyReportDocument, receipt.sourceCommit, gitCwd, artifactBytes, captureBytes, label);
  assert(JSON.stringify(privacyReportDocument) === JSON.stringify(derivedPrivacyReport) && privacyReportDocument.status === 'pass' && privacyReportDocument.findingCount === 0 && privacyReportDocument.inputSha256 === privacyInputSha256(receipt.artifactHash, capture.captureHash), `${label} committed privacy report did not pass or match the scanner result`);
  assert(privacyReportDocument.artifact.sha256 === receipt.artifactHash && privacyReportDocument.capture.sha256 === capture.captureHash, `${label} privacy report targets do not match evidence`);
  assert(!png.ancillaryTypes.some((type) => ['tEXt', 'zTXt', 'iTXt', 'eXIf'].includes(type)), `${label} capture contains privacy-sensitive PNG metadata`);
  validateContrastReceipt(element, receiptDocument, capture, png, label);
  assert(liveProof.session.sourceCommit === receipt.buildSourceCommit && liveProof.session.artifactHash === receipt.artifactHash && liveProof.session.packageHash === receipt.packageHash && liveProof.session.installedExecutableHash === installedReceiptDocument.installation.installedExecutableSha256, `${label} live proof session does not match the static build and installed identities`);
  assert(liveProof.element.captureHash === capture.captureHash && liveProof.element.route === capture.route && liveProof.element.state === capture.state && liveProof.element.theme === capture.theme && liveProof.element.viewport === capture.viewport && liveProof.element.scale === capture.scale && liveProof.element.width === capture.width && liveProof.element.height === capture.height, `${label} live proof observation does not match the static capture tuple`);
  return { paths: rolePaths, artifactBlob, packageBlob, releasesBlob, receiptBlob, captureBlob, buildReceiptBlob, buildProvenanceBlob, installerManifestBlob, installedReceiptBlob, privacyReportBlob, buildLogBlob };
}

function recordEvidenceRoles(roleMap, evidence, label) {
  for (const rolePath of evidence.paths) {
    assert(!roleMap.has(rolePath), `${label} reuses evidence path ${rolePath} from ${roleMap.get(rolePath)}`);
    roleMap.set(rolePath, label);
  }
}

function checkSchemaAuthority(schema) {
  assert(schema.$defs?.element?.required && schema.$defs?.states?.required && schema.$defs?.receiptDocument && schema.$defs?.buildReceiptDocument && schema.$defs?.buildProvenanceDocument && schema.$defs?.installerManifestDocument && schema.$defs?.installedReceiptDocument && schema.$defs?.privacyReportDocument, 'schema lacks element, state, receipt, build, provenance, installer, installed, or privacy authority');
  assert(schema.$defs.interactionReceipt.required.includes('buildSourceTree') && schema.$defs.receiptDocument.required.includes('buildSourceTree') && schema.$defs.buildReceiptDocument.required.includes('buildSourceTree'), 'schema lacks exact build source tree authority');
  assert(['packagePath', 'releasesPath', 'buildProvenancePath', 'installerManifestPath', 'installedReceiptPath'].every((field) => schema.$defs.interactionReceipt.required.includes(field)) && ['package', 'releases', 'buildProvenance', 'installerManifest', 'installedReceipt'].every((field) => schema.$defs.receiptDocument.required.includes(field)), 'schema lacks complete Squirrel and installed evidence authority');
  assert(schema.$defs.buildReceiptDocument.properties.scripts.minItems === SUPPORTED_BUILD_SCRIPT_PATHS.length && schema.$defs.buildReceiptDocument.properties.scripts.maxItems === SUPPORTED_BUILD_SCRIPT_PATHS.length, 'schema lacks supported build script authority');
  assert(schema.$defs.privacyReportDocument.properties.scanner.properties.path.const === PRIVACY_SCANNER_PATH && schema.$defs.privacyReportDocument.properties.method.const === PRIVACY_SCANNER_METHOD, 'schema lacks committed privacy scanner authority');
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

function checkVerifierBootstrap(sourceOverride = null) {
  const source = sourceOverride ?? fs.readFileSync(bootstrapPath, 'utf8');
  const executableLines = source.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
  assert(executableLines.some((line) => /^if \(\$nodeVersion -notmatch '\^v24\\\.'\) \{$/.test(line)), 'verifier bootstrap does not require Node 24');
  assert(executableLines.some((line) => line.startsWith("$probe = '") && line.includes('r("@babel/parser/package.json")') && line.includes('p.version!=="7.29.3"')), 'verifier bootstrap does not probe the declared parser package');
  const lockedInstall = /^(?:& \$pnpm\.Source|& \$corepack\.Source pnpm) --dir \$designRoot install --filter '@open-design\/daemon\.\.\.' --frozen-lockfile --ignore-scripts$/;
  assert(executableLines.filter((line) => lockedInstall.test(line)).length === 2, 'verifier bootstrap is not wired to the locked parser workspace install');
  assert(source.includes('[switch]$LiveProof') && executableLines.some((line) => line.includes("@('--live-proof', '--candidate'")), 'verifier bootstrap is not wired to the live proof route');
  assert(executableLines.includes("$verifier = Join-Path $PSScriptRoot 'verify-lang-gui-elements.mjs'") && executableLines.includes('& $node.Source @arguments'), 'verifier bootstrap does not invoke the owned verifier');
}

function validateAll(registry, registrySchema, inventory, ownerSchema, desktopInventory, desktopSchema, siteInventory, siteSchema, options = {}) {
  const parser = options.parser ?? loadDeclaredParser(root);
  checkVerifierBootstrap();
  assertClosedObjectSchemas(registrySchema, 'registrySchema');
  assertClosedObjectSchemas(ownerSchema, 'ownerSchema');
  assertClosedObjectSchemas(desktopSchema, 'desktopSchema');
  assertClosedObjectSchemas(siteSchema, 'siteSchema');
  assertBoundedSchema(registrySchema, 'registrySchema');
  assertBoundedSchema(ownerSchema, 'ownerSchema');
  assertBoundedSchema(desktopSchema, 'desktopSchema');
  assertBoundedSchema(siteSchema, 'siteSchema');
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
  const discovered = options.discovered ?? discoverSourceClassification(root);
  const sourceCounts = compareSourceClassification(discovered, desktopInventory, siteInventory);
  for (const [sourcePath, ownerName, wrapper] of REQUIRED_WRAPPED_OWNERS) {
    const row = desktopInventory.owners.find((owner) => owner.sourcePath === sourcePath && owner.owner === ownerName);
    assert(row && row.classification === 'render-reachable-owner' && row.wrapperChain.includes(wrapper), `wrapped owner ${ownerName} is not bound to its exported render identity`);
    assert(desktopInventory.elements.some((element) => element.ownerId === row.id), `wrapped owner ${ownerName} has no elements bound to its exported render identity`);
  }
  for (const [tag, minimum] of [['script', 2], ['style', 1], ['template', 1]]) {
    const count = desktopInventory.elements.filter((element) => element.sourcePath === 'design/apps/web/src/edit-mode/source-patches.ts' && element.kind === 'imperative-createElement' && element.tag === tag).length;
    assert(count >= minimum, `source-patches Document creator ${tag} coverage is incomplete`);
  }
  assert(desktopInventory.elements.filter((element) => element.sourcePath === 'design/apps/web/src/edit-mode/source-patches.ts' && element.kind === 'desktop-inner-html').length >= 2, 'source-patches dynamic innerHTML coverage is incomplete');
  assert(desktopInventory.elements.filter((element) => element.kind === 'desktop-insert-adjacent-html').length >= 2, 'desktop insertAdjacentHTML coverage is incomplete');
  assert(desktopInventory.elements.some((element) => element.sourcePath === 'design/apps/web/src/components/DeckSlideThumbnail.tsx' && element.kind === 'shadow-root'), 'shadow-root coverage is missing');
  assert(desktopInventory.elements.some((element) => element.kind === 'render-prop-function') && desktopInventory.elements.some((element) => element.kind === 'render-prop-call'), 'render-prop definition or invocation coverage is missing');
  assert(desktopInventory.elements.some((element) => element.kind === 'component-registry-object-spread') && desktopInventory.elements.some((element) => element.kind === 'component-registry-computed-access'), 'object-spread or computed component-registry coverage is missing');
  assert(siteInventory.runtimeCreators.filter((creator) => creator.kind === 'document-create-document-fragment').length >= 2, 'site document fragment coverage is incomplete');
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
    const evidence = checkVerifiedEvidence(element, label, registrySchema, options.liveProofCapability ?? null);
    if (evidence) recordEvidenceRoles(evidenceRoles, evidence, label);
  });
  const surfaceMembership = new Map(registry.surfaces.map((surface) => [surface.id, surface.elementIds]));
  equalArray(surfaceMembership.get(SURFACE_IDS[0]), OWNER_IDS.filter((id) => id.startsWith('desktop-')), 'desktop registry membership');
  equalArray(surfaceMembership.get(SURFACE_IDS[1]), OWNER_IDS.filter((id) => id.startsWith('site-')), 'site registry membership');
  return { surfaces: SURFACE_IDS.length, registryOwners: owners.length, registryElements: registry.elements.length, fields: authority.fields.length, states: authority.states.length, ...sourceCounts };
}

function currentSupportedScriptIdentities(sourceCommit) {
  return SUPPORTED_BUILD_SCRIPT_PATHS.map((relativePath) => {
    const file = repoFile(root, relativePath, 'live proof supported script');
    const blob = gitBlobAt(root, sourceCommit, relativePath, 'live proof supported script');
    assert(workingBlob(root, file) === blob, `live proof supported script differs from checked-out HEAD: ${relativePath}`);
    const bytes = readBoundedFile(file, `live proof supported script ${relativePath}`, 1024 * 1024);
    return { path: relativePath, sha256: sha256(bytes), gitBlob: blob };
  });
}

function candidateVersion(candidate) {
  const manifest = readJson(path.join(root, 'design', 'package.json'), { ...JSON_LIMITS.receipt, maxBytes: 1024 * 1024 }, 'design/package.json');
  const match = String(manifest.version ?? '').match(/^(\d+)\.(\d+)\.(\d+)/);
  assert(match, 'live proof could not derive the candidate version from design/package.json');
  return `${Number(match[1])}.${Number(match[2])}.${Number(match[3]) + candidate}`;
}

function runSupportedBatch(relativePath, args, environment, label, options = {}) {
  assert(['build.bat', 'build-installer.bat'].includes(relativePath), `${label} is not an allowed live proof script`);
  assert(args.every((value) => value === '/s' || value === '--candidate' || /^[1-9][0-9]*$/.test(value)), `${label} has an unsupported argument`);
  const scriptFile = repoFile(root, relativePath, label);
  const command = `call "${scriptFile}" ${args.join(' ')}`;
  const startedAt = Date.now();
  const runner = options.runner ?? spawnSync;
  const result = runner(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', command], {
    cwd: root,
    encoding: 'buffer',
    env: environment,
    maxBuffer: 128 * 1024 * 1024,
    timeout: 8 * 60 * 60 * 1000,
    windowsHide: true,
  });
  const completedAt = Date.now();
  assert(!result.error && !result.signal && result.status === 0 && completedAt > startedAt, `${label} did not complete with an observed zero exit`);
  return { startedAt, completedAt, durationMs: completedAt - startedAt, stdoutSha256: sha256(result.stdout ?? Buffer.alloc(0)), stderrSha256: sha256(result.stderr ?? Buffer.alloc(0)) };
}

function readFreshLiveJson(file, startedAt, label) {
  const metadata = fs.statSync(file);
  assert(metadata.isFile() && metadata.mtimeMs >= startedAt - 2000, `${label} was not produced by the current live proof session`);
  const bytes = readBoundedFile(file, label, JSON_LIMITS.receipt.maxBytes);
  const admitted = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? bytes.subarray(3) : bytes;
  return parseBoundedJsonBytes(admitted, label, JSON_LIMITS.receipt.maxBytes, JSON_LIMITS.receipt);
}

function runLiveBuildAndInstaller(session, candidate, options = {}) {
  assert(process.platform === 'win32', 'live proof build and installation are supported only on Windows');
  const sourceCommit = gitText(root, ['rev-parse', 'HEAD']);
  const sourceTree = gitText(root, ['rev-parse', 'HEAD^{tree}']);
  const beforeScripts = currentSupportedScriptIdentities(sourceCommit);
  const version = candidateVersion(candidate);
  const sharedEnvironment = {
    ...process.env,
    CSC_IDENTITY_AUTO_DISCOVERY: 'false',
    CSC_LINK: '',
    CSC_KEY_PASSWORD: '',
    WIN_CSC_LINK: '',
    WIN_CSC_KEY_PASSWORD: '',
  };
  equalArray(currentSupportedScriptIdentities(sourceCommit).map((entry) => JSON.stringify(entry)), beforeScripts.map((entry) => JSON.stringify(entry)), 'live proof supported script identities before build');
  const build = runSupportedBatch('build.bat', ['/s'], sharedEnvironment, 'live proof build.bat', options);
  const installerEnvironment = {
    ...sharedEnvironment,
    OD_BUILD_VERSION: version,
    OD_BUILD_SOURCE_COMMIT: sourceCommit,
    OD_BUILD_UPDATED_AT: new Date().toISOString(),
  };
  equalArray(currentSupportedScriptIdentities(sourceCommit).map((entry) => JSON.stringify(entry)), beforeScripts.map((entry) => JSON.stringify(entry)), 'live proof supported script identities before installer');
  const installer = runSupportedBatch('build-installer.bat', ['--candidate', String(candidate), '/s'], installerEnvironment, 'live proof build-installer.bat', options);
  equalArray(currentSupportedScriptIdentities(sourceCommit).map((entry) => JSON.stringify(entry)), beforeScripts.map((entry) => JSON.stringify(entry)), 'live proof supported script identities after execution');
  const buildManifestPath = path.join(root, '.yum-tong', 'build', 'build-manifest.json');
  const runRoot = path.join(root, '.yum-tong', 'installer', `candidate-${candidate}`);
  const installerManifestPath = path.join(runRoot, 'installer-manifest.json');
  const provenancePath = path.join(runRoot, 'build-provenance.json');
  const buildManifest = readFreshLiveJson(buildManifestPath, installer.startedAt, 'live build manifest');
  const installerManifest = readFreshLiveJson(installerManifestPath, installer.startedAt, 'live installer manifest');
  const provenance = readFreshLiveJson(provenancePath, installer.startedAt, 'live build provenance');
  assert(buildManifest.schemaVersion === 1 && buildManifest.commit === sourceCommit && Date.parse(buildManifest.completedAt) >= installer.startedAt && Date.parse(buildManifest.completedAt) <= installer.completedAt, 'live build manifest does not bind the current installer process and source commit');
  equalArray(buildManifest.outputs, ['design/apps/daemon/dist', 'design/apps/desktop/dist', 'design/apps/web/dist', 'design/tools/pack/dist'], 'live build manifest outputs');
  assert(installerManifest.schemaVersion === 1 && installerManifest.commit === sourceCommit && installerManifest.candidate === candidate && installerManifest.version === version && installerManifest.signed === false && installerManifest.signatureStatus === 'NotSigned' && installerManifest.installerFormat === 'squirrel', 'live installer manifest does not bind the current unsigned Squirrel outcome');
  assert(provenance.version === 1 && provenance.provenanceStatus === 'verified' && provenance.sourceCommit === sourceCommit && provenance.cleanOutput === true && provenance.packagingCommand === 'build-installer.bat --candidate <ordinal> /s' && provenance.package?.id === 'open-design-packaged-app' && provenance.package?.version === version && provenance.package?.architecture === 'x64' && Date.parse(provenance.builtAt) >= installer.startedAt - 2000 && Date.parse(provenance.builtAt) <= installer.completedAt, 'live build provenance does not bind the current source and process timing');
  assert(provenance.signing?.inputsCleared === true && provenance.signing?.certificateAutoDiscoveryDisabled === true && provenance.signing?.signerInvocationCount === 0 && provenance.signing?.controls?.forceCodeSigning === false && provenance.signing?.controls?.signExecutable === false && provenance.signing?.controls?.signAndEditExecutable === false, 'live build provenance does not preserve the unsigned controls');
  const liveBuildLogPath = path.resolve(provenance.buildLog?.path ?? '');
  const liveBuildLogBytes = readBoundedFile(liveBuildLogPath, 'live installer build log', 128 * 1024 * 1024);
  assert(fs.statSync(liveBuildLogPath).mtimeMs >= installer.startedAt - 2000 && provenance.buildLog.sha256 === sha256(liveBuildLogBytes), 'live build provenance does not bind a fresh installer log');
  const assetRoot = path.join(runRoot, 'assets');
  const artifactPath = path.join(assetRoot, installerManifest.setup);
  const releasesPath = path.join(assetRoot, installerManifest.releases);
  const fullPackages = Array.isArray(installerManifest.fullPackages) ? installerManifest.fullPackages : [];
  assert(fullPackages.length === 1, 'live installer manifest must name exactly one full Squirrel package');
  const packagePath = path.join(assetRoot, fullPackages[0]);
  const artifactBytes = readBoundedFile(artifactPath, 'live Squirrel Setup.exe', 512 * 1024 * 1024);
  const packageBytes = readBoundedFile(packagePath, 'live full Squirrel package', 512 * 1024 * 1024);
  const releasesBytes = readBoundedFile(releasesPath, 'live Squirrel RELEASES', 16 * 1024 * 1024);
  assert(fs.statSync(artifactPath).mtimeMs >= installer.startedAt - 2000 && fs.statSync(packagePath).mtimeMs >= installer.startedAt - 2000 && fs.statSync(releasesPath).mtimeMs >= installer.startedAt - 2000, 'live Squirrel outputs were not produced by the current session');
  validateArtifact(artifactBytes, artifactPath);
  const packageResult = validateArtifact(packageBytes, packagePath);
  validateSquirrelReleases(releasesBytes, packagePath, packageBytes, 'live proof');
  assert(installerManifest.setupSha256 === sha256(artifactBytes) && installerManifest.setupBytes === artifactBytes.length, 'live installer manifest does not match Setup.exe bytes');
  session.challengeAt = Date.now();
  return {
    sourceCommit,
    sourceTree,
    version,
    build,
    installer,
    artifactPath,
    artifactHash: sha256(artifactBytes),
    packagePath,
    packageHash: sha256(packageBytes),
    releasesPath,
    packageExecutableHash: packageResult.executableSha256,
    scriptIdentities: beforeScripts,
  };
}

async function readLiveRuntimeObservation() {
  const limits = { maxBytes: 4 * 1024 * 1024, maxDepth: 32, maxString: 131072, maxArray: 10000, maxProperties: 128, maxNodes: 200000 };
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.from(chunk);
    bytes += buffer.length;
    assert(bytes <= limits.maxBytes, 'live runtime observation exceeds byte admission bound');
    chunks.push(buffer);
  }
  assert(bytes > 0, 'live runtime observation is missing from standard input');
  return parseBoundedJsonBytes(Buffer.concat(chunks), 'live runtime observation', limits.maxBytes, limits);
}

function exactObjectKeys(value, keys, label) {
  assert(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
  equalArray(Object.keys(value).sort(), [...keys].sort(), `${label} fields`);
}

function liveProcessIdentity(pid) {
  assert(Number.isInteger(pid) && pid > 0, 'live runtime process id is invalid');
  try { process.kill(pid, 0); } catch { throw new Error('live runtime process is not alive'); }
  const command = `$p = Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}"; if ($null -eq $p -or [string]::IsNullOrWhiteSpace($p.ExecutablePath)) { exit 3 }; [Console]::Out.Write((@{ executablePath = $p.ExecutablePath; createdAt = $p.CreationDate.ToUniversalTime().ToString('o') } | ConvertTo-Json -Compress))`;
  try {
    return parseBoundedJsonBytes(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000, windowsHide: true }), 'live runtime process identity', 64 * 1024, { ...JSON_LIMITS.receipt, maxBytes: 64 * 1024 });
  } catch {
    throw new Error('live runtime process image could not be resolved independently');
  }
}

function validateLiveRuntimeObservation(observation, session, buildResult, verifiedElements) {
  exactObjectKeys(observation, ['schema', 'version', 'nonce', 'sourceCommit', 'route', 'observedAt', 'privacy', 'artifact', 'package', 'installation', 'launch', 'elements'], 'live runtime observation');
  assert(observation.schema === 'material-designer.lang-gui.live-runtime-observation' && observation.version === 1 && observation.nonce === session.nonce, 'live runtime observation does not match the in-memory challenge');
  assert(observation.sourceCommit === buildResult.sourceCommit && observation.route === 'cheap-lowlevel-headless', 'live runtime observation source or route does not match the current session');
  const observedAt = Date.parse(observation.observedAt);
  assert(Number.isFinite(observedAt) && observedAt >= session.challengeAt && observedAt <= Date.now(), 'live runtime observation timestamp is outside the current session');
  exactObjectKeys(observation.privacy, ['visibleDesktopUntouched', 'disposableOperatingSystemBoundary', 'existingUserInstallationAbsent', 'taskOwnedProfile', 'unrelatedWindowsObserved'], 'live runtime privacy');
  assert(observation.privacy.visibleDesktopUntouched === true && observation.privacy.disposableOperatingSystemBoundary === true && observation.privacy.existingUserInstallationAbsent === true && observation.privacy.taskOwnedProfile === true && observation.privacy.unrelatedWindowsObserved === false, 'live runtime observation did not prove the approved privacy boundary');
  assert(path.resolve(observation.artifact.path) === path.resolve(buildResult.artifactPath) && observation.artifact.sha256 === buildResult.artifactHash && path.resolve(observation.package.path) === path.resolve(buildResult.packagePath) && observation.package.sha256 === buildResult.packageHash, 'live runtime observation does not target the current Squirrel outputs');
  assert(observation.installation.setupExitCode === 0 && observation.installation.candidateVersion === buildResult.version, 'live runtime installation did not complete for the current candidate');
  const installedPath = path.resolve(observation.installation.installedExecutablePath);
  const installedMetadata = fs.statSync(installedPath);
  assert(installedMetadata.isFile() && Math.max(installedMetadata.birthtimeMs, installedMetadata.mtimeMs) >= session.challengeAt - 2000, 'live installed executable was not materialized during the current session');
  const installedBytes = readBoundedFile(installedPath, 'live installed executable', 512 * 1024 * 1024);
  const installedHash = sha256(installedBytes);
  assert(installedHash === observation.installation.installedExecutableSha256 && installedHash === buildResult.packageExecutableHash, 'live installed executable does not match the current package payload');
  const processIdentity = liveProcessIdentity(observation.launch.pid);
  const processPath = path.resolve(processIdentity.executablePath);
  assert(Date.parse(processIdentity.createdAt) >= session.challengeAt && Date.parse(processIdentity.createdAt) <= observedAt, 'live runtime process was not launched during the current session');
  assert(/^0x[1-9a-f][0-9a-f]*$/i.test(observation.launch.hwnd) && observation.launch.className === 'Chrome_WidgetWin_1' && observation.launch.installedArtifact === true && processPath.toLowerCase() === installedPath.toLowerCase() && path.resolve(observation.launch.processPath).toLowerCase() === installedPath.toLowerCase() && observation.launch.processImageSha256 === installedHash, 'live runtime launch does not resolve to the installed executable and application window');
  assert(Array.isArray(observation.elements) && observation.elements.length === verifiedElements.length && observation.elements.length > 0, 'live runtime observation does not contain every verified element');
  const expected = new Map(verifiedElements.map((element) => [element.stableElementId, element]));
  const elementProofs = new Map();
  const capturePaths = new Set();
  for (const row of observation.elements) {
    exactObjectKeys(row, ['elementId', 'capturedAt', 'route', 'state', 'theme', 'viewport', 'scale', 'capture'], `live runtime element ${String(row.elementId)}`);
    const element = expected.get(row.elementId);
    assert(element && !elementProofs.has(row.elementId), `live runtime observation has an unknown or duplicate element ${String(row.elementId)}`);
    const capturedAt = Date.parse(row.capturedAt);
    assert(Number.isFinite(capturedAt) && capturedAt >= session.challengeAt && capturedAt <= observedAt, `live runtime element ${row.elementId} timestamp is outside the current session`);
    const capturePath = path.resolve(row.capture.path);
    assert(!capturePaths.has(capturePath), `live runtime capture path is reused: ${capturePath}`);
    capturePaths.add(capturePath);
    const captureMetadata = fs.statSync(capturePath);
    assert(captureMetadata.isFile() && captureMetadata.mtimeMs >= session.challengeAt - 2000, `live runtime capture was not produced by the current session: ${row.elementId}`);
    const captureBytes = readBoundedFile(capturePath, `live runtime capture ${row.elementId}`, 128 * 1024 * 1024);
    const png = validatePng(captureBytes);
    assert(!png.ancillaryTypes.some((type) => ['tEXt', 'zTXt', 'iTXt', 'eXIf'].includes(type)), `live runtime capture contains privacy-sensitive metadata: ${row.elementId}`);
    assert(row.capture.sha256 === sha256(captureBytes) && row.capture.width === png.width && row.capture.height === png.height, `live runtime capture bytes or dimensions do not match: ${row.elementId}`);
    assert(row.route === element.captureTuple.route && row.state === element.captureTuple.state && row.theme === element.captureTuple.theme && row.viewport === element.captureTuple.viewport && row.scale === element.captureTuple.scale && row.capture.sha256 === element.captureTuple.captureHash && png.width === element.captureTuple.width && png.height === element.captureTuple.height, `live runtime element does not match the committed capture tuple: ${row.elementId}`);
    elementProofs.set(row.elementId, { captureHash: row.capture.sha256, route: row.route, state: row.state, theme: row.theme, viewport: row.viewport, scale: row.scale, width: png.width, height: png.height });
  }
  return { sourceCommit: buildResult.sourceCommit, artifactHash: buildResult.artifactHash, packageHash: buildResult.packageHash, installedExecutableHash: installedHash, elementProofs };
}

async function runLiveProofCli() {
  const candidateIndex = process.argv.indexOf('--candidate');
  const candidate = candidateIndex >= 0 ? Number(process.argv[candidateIndex + 1]) : NaN;
  assert(Number.isInteger(candidate) && candidate > 0, 'live proof requires --candidate with a positive integer');
  const documents = [readJson(registryPath), readJson(registrySchemaPath), readJson(ownerPath), readJson(ownerSchemaPath), readJson(desktopPath), readJson(desktopSchemaPath), readJson(sitePath), readJson(siteSchemaPath)];
  const verifiedElements = documents[0].elements.filter((element) => element.status.state === 'verified' || Object.values(element.states).includes('verified'));
  if (verifiedElements.length === 0) {
    const result = validateAll(...documents);
    process.stdout.write(`every-element live proof not run: no verified rows requested; ${JSON.stringify(result)}\n`);
    return;
  }
  const { capability, state } = mintLiveProofSession();
  try {
    const buildResult = runLiveBuildAndInstaller(state, candidate);
    const challenge = { schema: 'material-designer.lang-gui.live-proof-challenge', version: 1, nonce: state.nonce, sourceCommit: buildResult.sourceCommit, candidateVersion: buildResult.version, artifactPath: buildResult.artifactPath, artifactSha256: buildResult.artifactHash, packagePath: buildResult.packagePath, packageSha256: buildResult.packageHash, requiredRoute: 'cheap-lowlevel-headless', verifiedElementIds: verifiedElements.map((element) => element.stableElementId) };
    process.stderr.write(`LIVE_PROOF_CHALLENGE ${JSON.stringify(challenge)}\n`);
    const observation = await readLiveRuntimeObservation();
    authorizeLiveProofSession(capability, validateLiveRuntimeObservation(observation, state, buildResult, verifiedElements));
    const result = validateAll(...documents, { liveProofCapability: capability });
    process.stdout.write(`every-element live proof green: ${JSON.stringify(result)}\n`);
  } finally {
    revokeLiveProofSession(capability);
  }
}

function refreshClassifications() {
  const parser = loadDeclaredParser(root);
  const oldInventory = readJson(ownerPath);
  const reviewedDesktop = readJson(desktopPath);
  const reviewedSite = readJson(sitePath);
  const discovered = discoverSourceClassification(root);
  discovered.desktop.owners = preserveReviewedAuthority(discovered.desktop.owners, reviewedDesktop.owners, 'desktop owner');
  discovered.desktop.elements = preserveReviewedAuthority(discovered.desktop.elements, reviewedDesktop.elements, 'desktop element');
  discovered.desktop.sourceExclusions = preserveReviewedAuthority(discovered.desktop.sourceExclusions, reviewedDesktop.sourceExclusions, 'desktop source exclusion');
  discovered.desktop.commentExclusions = preserveReviewedAuthority(discovered.desktop.commentExclusions, reviewedDesktop.commentExclusions, 'desktop comment exclusion');
  discovered.desktop.dynamicLimits = reviewedDesktop.dynamicLimits;
  discovered.site.htmlElements = preserveReviewedAuthority(discovered.site.htmlElements, reviewedSite.htmlElements, 'site HTML element');
  discovered.site.runtimeCreators = preserveReviewedAuthority(discovered.site.runtimeCreators, reviewedSite.runtimeCreators, 'site runtime creator');
  discovered.site.commentExclusions = preserveReviewedAuthority(discovered.site.commentExclusions, reviewedSite.commentExclusions, 'site comment exclusion');
  discovered.site.dynamicLimits = reviewedSite.dynamicLimits;
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
    parser: { package: parser.packageName, version: parser.version, manifestPath: parser.manifestPath, lockPath: parser.lockPath, lockIntegrity: parser.lockIntegrity, packageTreeSha256: parser.packageTreeSha256 },
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
    element.interactionReceipt = { status: 'unverified', path: null, artifactPath: null, sourceCommit: 'HEAD', buildReceiptPath: null, buildSourceCommit: null, buildSourceTree: null, buildInputHash: null, artifactHash: null, artifactGitBlob: null, packagePath: null, packageHash: null, packageGitBlob: null, releasesPath: null, releasesHash: null, releasesGitBlob: null, receiptHash: null, receiptGitBlob: null, buildReceiptHash: null, buildReceiptGitBlob: null, buildProvenancePath: null, buildProvenanceHash: null, buildProvenanceGitBlob: null, installerManifestPath: null, installerManifestHash: null, installerManifestGitBlob: null, installedReceiptPath: null, installedReceiptHash: null, installedReceiptGitBlob: null, privacyReportPath: null, privacyReportHash: null, privacyReportGitBlob: null };
    element.captureTuple = { status: 'unverified', route: element.route, state: 'default', viewport: '1280x720', scale: 1, theme: 'light', path: null, captureHash: null, captureGitBlob: null, artifactHash: null, mediaType: 'unverified', width: null, height: null, contrast: null };
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

function sealAllSchemaBounds() {
  for (const file of [registrySchemaPath, ownerSchemaPath, desktopSchemaPath, siteSchemaPath]) {
    const schema = sealSchemaBounds(readJson(file));
    fs.writeFileSync(file, stableJson(schema));
  }
  process.stdout.write('sealed byte-admitted schemas with complete string, array, nesting, and property bounds\n');
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
  negativeCaseCount += 1;
  process.stdout.write(`RED exact then restored: ${label} -> ${expected}\n`);
}

function validateFixtureMembership(rows, requiredIds, label) {
  for (const id of requiredIds) {
    const count = rows.filter((row) => row.id === id).length;
    assert(count === 1, `fixture ${label} membership expected exactly one ${id}, found ${count}`);
  }
}

function missingFixtureRow(rows, predicate, label) {
  const row = rows.find(predicate);
  assert(row, `negative fixture lacks ${label}`);
  validateFixtureMembership(rows, [row.id], label);
  const removed = rows.filter((candidate) => candidate.id !== row.id);
  expectExactFailure(label, `fixture ${label} membership expected exactly one ${row.id}, found 0`, () => validateFixtureMembership(removed, [row.id], label));
  validateFixtureMembership(rows, [row.id], label);
}

function runAstFixtureNegatives(parser) {
  const reparseComponent = path.resolve(root, 'design', 'node_modules', '.pnpm');
  expectExactFailure('parser locked-closure reparse component', 'declared parser locked closure contains a symlink escape', () => loadDeclaredParser(root, {
    realpathSync: fs.realpathSync.native,
    lstatSync: (candidate) => {
      const metadata = fs.lstatSync(candidate);
      if (path.resolve(candidate).toLowerCase() !== reparseComponent.toLowerCase()) return metadata;
      return { isSymbolicLink: () => true, isDirectory: () => metadata.isDirectory(), isFile: () => metadata.isFile() };
    },
  }));
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lang-gui-parser-outside-'));
  try {
    writeFileEnsured(outsideRoot, 'design/apps/daemon/package.json', stableJson({ dependencies: { '@babel/parser': '7.29.3' } }));
    writeFileEnsured(outsideRoot, 'design/pnpm-lock.yaml', `lockfileVersion: '9.0'\n\npackages:\n\n  '@babel/parser@7.29.3':\n    resolution: {integrity: sha512-b3ctpQwp+PROvU/cttc4OYl4MzfJUWy6FZg+PMXfzmt/+39iHVF0sDfqay8TQM3JA2EUOyKcFZt75jWriQijsA==}\n`);
    writeFileEnsured(outsideRoot, 'node_modules/@babel/parser/package.json', stableJson({ name: '@babel/parser', version: '7.29.3', main: './index.cjs' }));
    writeFileEnsured(outsideRoot, 'node_modules/@babel/parser/index.cjs', 'module.exports = { parse() { return {}; } };\n');
    expectExactFailure('parser outside locked closure', 'declared parser resolved outside this worktree locked closure', () => loadDeclaredParser(outsideRoot));
  } finally {
    fs.rmSync(outsideRoot, { recursive: true, force: true });
  }
  const reviewedFixture = [{ id: 'kept', callSiteIdentity: 'fixture#kept', classification: 'rendered-intrinsic', reason: 'reviewed' }, { id: 'removed', callSiteIdentity: 'fixture#removed', classification: 'rendered-intrinsic', reason: 'reviewed' }];
  expectExactFailure('reviewed classification disappearance', 'fixture reviewed rows disappeared: removed', () => preserveReviewedAuthority([reviewedFixture[0]], reviewedFixture, 'fixture'));
  const unreviewedFixture = preserveReviewedAuthority([{ id: 'new', callSiteIdentity: 'fixture#new', classification: 'rendered-intrinsic', reason: 'generated' }], [], 'fixture');
  expectExactFailure('new classification requires review', 'fixture new row was accepted without review', () => assert(unreviewedFixture[0].classification !== 'unclassified', 'fixture new row was accepted without review'));
  const reExportEdges = classifyModuleEdgesFixture(parser, 'design/apps/web/src/components/re-export.ts', "export { default as ReExportedPanel } from './Panel';\nexport * from './MorePanels';\n");
  missingFixtureRow(reExportEdges, (row) => row.kind === 'ExportNamedDeclaration' && row.value === './Panel', 'named re-export edge');
  missingFixtureRow(reExportEdges, (row) => row.kind === 'ExportAllDeclaration' && row.value === './MorePanels', 'export-all edge');
  const localExports = classifyLocalExportsFixture(parser, 'design/apps/web/src/components/local-export.tsx', 'const InternalPanel = () => <div />; export { InternalPanel as PublicPanel }; export const DeclaredPanel = () => <section />; function DefaultImpl() { return <main />; } export default DefaultImpl;');
  missingFixtureRow(localExports, (row) => row.exportedName === 'PublicPanel' && row.localName === 'InternalPanel', 'local export forwarding');
  missingFixtureRow(localExports, (row) => row.exportedName === 'DeclaredPanel' && row.localName === 'DeclaredPanel', 'local export declaration');
  missingFixtureRow(localExports, (row) => row.exportedName === 'default' && row.localName === 'DefaultImpl', 'local default export forwarding');
  const cycle = resolveExportCycleFixture({ a: { Panel: { path: 'b', name: 'Panel' } }, b: { Panel: { path: 'a', name: 'Panel' } } }, 'a', 'Panel');
  expectExactFailure('local export cycle', 'fixture local export cycle was not bounded at a|Panel', () => { if (cycle.status === 'cycle') throw new Error(`fixture local export cycle was not bounded at ${cycle.at}`); });
  const desktopSource = `
import DefaultPanel from './DefaultPanel';
import { NamedPanel as AliasPanel } from './NamedPanel';
import React, { createElement as makeElement, forwardRef, lazy, memo } from 'react';
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
const ForwardOwner = memo(forwardRef(function ForwardInner(_props, _ref) { return <label>forward</label>; }));
function MemoImpl() { return <small>memo</small>; }
const MemoOwner = memo(MemoImpl);
const spreadRoutes = { alt: LocalPanel };
const routeRegistry = { ...spreadRoutes, [currentRoute]: AliasPanel, home: AliasPanel };
const SpreadCurrent = routeRegistry[currentRoute];
export default function RootPanel() {
  function NestedPanel() { return <aside data-nested />; }
  function DocumentOwner(doc: Document, host: HTMLElement, html: string) {
    const script = doc.createElement('script');
    const fragment = doc.createDocumentFragment();
    const ownerDoc = host.ownerDocument;
    const { createElement: createDomAlias, createDocumentFragment: createFragmentAlias } = ownerDoc;
    const createNsAlias = ownerDoc.createElementNS.bind(ownerDoc);
    const attachShadowAlias = host.attachShadow.bind(host);
    const aliasStyle = createDomAlias('style');
    const aliasFragment = createFragmentAlias();
    const aliasSvg = createNsAlias('http://www.w3.org/2000/svg', 'svg');
    doc.body.innerHTML = '<main><section>static</section></main>';
    doc.body.innerHTML = html;
    doc.body.outerHTML = '<body><article>outer</article></body>';
    doc.body.insertAdjacentHTML('beforeend', '<footer>done</footer>');
    host.attachShadow({ mode: 'open' });
    attachShadowAlias({ mode: 'open' });
    return <div>{script && fragment && aliasStyle && aliasFragment && aliasSvg ? 'ready' : 'waiting'}</div>;
  }
  return <>
    <DefaultPanel />
    <LocalPanel />
    <NestedPanel />
    <LazyPanel />
    <DynamicPanel />
    <CurrentPanel />
    <DynamicTag />
    <ForwardOwner />
    <MemoOwner />
    <SpreadCurrent />
    <Renderer renderItem={(item) => <output>{item}</output>}>{(item) => <mark>{item}</mark>}</Renderer>
    <button onClick={() => makeElement('span', null)}>event</button>
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
  missingFixtureRow(fixture.owners, (row) => row.owner === 'ForwardOwner' && row.wrapperChain.includes('memo') && row.wrapperChain.includes('forwardRef'), 'memo forwardRef owner chain');
  missingFixtureRow(fixture.owners, (row) => row.owner === 'MemoOwner' && row.wrapperChain.includes('memo'), 'memo identifier owner chain');
  assert(!fixture.owners.some((row) => row.owner === 'ForwardInner' || row.owner === 'MemoImpl'), 'wrapped implementation leaked as a competing owner identity');
  missingFixtureRow(fixture.elements, (row) => row.owner === 'ForwardOwner' && row.tag === 'label', 'memo forwardRef element owner identity');
  missingFixtureRow(fixture.elements, (row) => row.owner === 'MemoOwner' && row.tag === 'small', 'memo identifier element owner identity');
  missingFixtureRow(fixture.elements, (row) => row.tag === 'DefaultPanel', 'default import component');
  missingFixtureRow(fixture.elements, (row) => row.tag === 'AliasPanel', 'aliased import component');
  missingFixtureRow(fixture.elements, (row) => row.tag === 'LocalPanel', 'local component declaration');
  missingFixtureRow(fixture.elements, (row) => row.tag === 'LazyPanel', 'lazy component');
  missingFixtureRow(fixture.elements, (row) => row.tag === 'DynamicPanel', 'dynamic import component');
  missingFixtureRow(fixture.elements, (row) => row.tag === 'CurrentPanel', 'route table dynamic component');
  missingFixtureRow(fixture.elements, (row) => row.kind === 'dynamic-intrinsic' && row.tag === 'div|span', 'intrinsic dynamic tag');
  missingFixtureRow(fixture.elements, (row) => row.kind === 'imperative-createElement' && row.tag === 'script', 'Document receiver createElement');
  missingFixtureRow(fixture.elements, (row) => row.kind === 'imperative-createDocumentFragment', 'Document receiver fragment');
  missingFixtureRow(fixture.elements, (row) => row.kind === 'imperative-createElement' && row.tag === 'style', 'destructured Document createElement alias');
  missingFixtureRow(fixture.elements, (row) => row.kind === 'imperative-createDocumentFragment' && row.tag === 'document-fragment', 'destructured Document fragment alias');
  missingFixtureRow(fixture.elements, (row) => row.kind === 'imperative-createElementNS' && row.tag === 'svg', 'bound Document namespace creator alias');
  missingFixtureRow(fixture.elements, (row) => row.kind === 'desktop-inner-html-template-tag' && row.tag === 'main', 'desktop static innerHTML');
  missingFixtureRow(fixture.elements, (row) => row.kind === 'desktop-inner-html' && row.tag === 'dynamic-html', 'desktop dynamic innerHTML');
  missingFixtureRow(fixture.elements, (row) => row.kind === 'desktop-outer-html-template-tag' && row.tag === 'article', 'desktop static outerHTML');
  missingFixtureRow(fixture.elements, (row) => row.kind === 'desktop-insert-adjacent-html-template-tag' && row.tag === 'footer', 'desktop insertAdjacentHTML');
  missingFixtureRow(fixture.elements, (row) => row.kind === 'shadow-root', 'shadow-root boundary');
  assert(fixture.elements.filter((row) => row.kind === 'shadow-root').length === 2, 'direct and bound shadow-root boundaries are not both classified');
  missingFixtureRow(fixture.elements, (row) => row.kind === 'render-prop-function', 'render-prop function boundary');
  assert(fixture.elements.filter((row) => row.kind === 'render-prop-function').length === 2, 'ordinary event callbacks were misclassified as render props');
  missingFixtureRow(fixture.elements, (row) => row.kind === 'component-registry-object-spread', 'object-spread component registry');
  missingFixtureRow(fixture.elements, (row) => row.kind === 'component-registry-computed-access', 'computed component registry');
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
  document.createDocumentFragment();
}
`;
  const siteFixture = classifySiteModuleFixture(parser, 'site/assets/js/registry-fixture.js', siteSource);
  missingFixtureRow(siteFixture.creators, (row) => row.kind === 'create-element-alias' && row.tag === 'article', 'site bound creator alias');
  missingFixtureRow(siteFixture.creators, (row) => row.kind === 'create-element-alias' && row.tag === 'button', 'site direct creator alias');
  missingFixtureRow(siteFixture.creators, (row) => row.kind === 'create-element-helper' && row.tag === 'section', 'site helper creator');
  missingFixtureRow(siteFixture.creators, (row) => row.kind === 'create-element-helper' && row.tag === 'section', 'site multiline DOM creator');
  missingFixtureRow(siteFixture.creators, (row) => row.kind === 'insert-adjacent-html-template-tag' && row.tag === 'aside', 'site insertAdjacentHTML');
  missingFixtureRow(siteFixture.creators, (row) => row.kind === 'inner-html-template-tag' && row.tag === 'footer', 'site innerHTML');
  missingFixtureRow(siteFixture.creators, (row) => row.kind === 'document-create-document-fragment', 'site document fragment');
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
  gitText(directory, ['config', 'core.autocrlf', 'false']);
}

function writeFileEnsured(directory, relativePath, bytes) {
  const target = path.join(directory, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes);
  return target;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBytes.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length);
  return chunk;
}

function makePng(width = 64, height = 64, includeTextMetadata = false, solid = false) {
  const rows = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    const row = y * (1 + width * 4);
    rows[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = row + 1 + x * 4;
      const value = solid ? 127 : (x + y) % 2 === 0 ? 0 : 255;
      rows[offset] = value;
      rows[offset + 1] = value;
      rows[offset + 2] = value;
      rows[offset + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', ihdr), ...(includeTextMetadata ? [pngChunk('tEXt', Buffer.from('private=value', 'utf8'))] : []), pngChunk('IDAT', zlib.deflateSync(rows)), pngChunk('IEND', Buffer.alloc(0))]);
}

function makePortableExecutable() {
  const bytes = Buffer.alloc(64 * 1024);
  bytes.write('MZ', 0, 'ascii');
  bytes.writeUInt32LE(0x80, 0x3c);
  bytes.writeUInt32LE(0x00004550, 0x80);
  const coff = 0x84;
  bytes.writeUInt16LE(0x8664, coff);
  bytes.writeUInt16LE(3, coff + 2);
  bytes.writeUInt16LE(0xf0, coff + 16);
  bytes.writeUInt16LE(0x0022, coff + 18);
  const optional = coff + 20;
  bytes.writeUInt16LE(0x20b, optional);
  bytes.writeUInt32LE(0x200, optional + 4);
  bytes.writeUInt32LE(0x1000, optional + 16);
  bytes.writeUInt32LE(0x1000, optional + 32);
  bytes.writeUInt32LE(0x200, optional + 36);
  bytes.writeUInt32LE(0x4000, optional + 56);
  bytes.writeUInt32LE(0x200, optional + 60);
  bytes.writeUInt16LE(2, optional + 68);
  bytes.writeUInt32LE(16, optional + 108);
  const sectionTable = optional + 0xf0;
  const sections = [
    { name: '.text', virtualAddress: 0x1000, rawOffset: 0x200, characteristics: 0x60000020, fill: 0x90 },
    { name: '.rdata', virtualAddress: 0x2000, rawOffset: 0x400, characteristics: 0x40000040, fill: 0x41 },
    { name: '.rsrc', virtualAddress: 0x3000, rawOffset: 0x600, characteristics: 0x40000040, fill: 0x42 },
  ];
  for (const [index, section] of sections.entries()) {
    const offset = sectionTable + index * 40;
    bytes.write(section.name, offset, 'ascii');
    bytes.writeUInt32LE(0x200, offset + 8);
    bytes.writeUInt32LE(section.virtualAddress, offset + 12);
    bytes.writeUInt32LE(0x200, offset + 16);
    bytes.writeUInt32LE(section.rawOffset, offset + 20);
    bytes.writeUInt32LE(section.characteristics, offset + 36);
    bytes.fill(section.fill, section.rawOffset, section.rawOffset + 0x200);
  }
  return bytes;
}

function makeStoredZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, contentValue] of entries) {
    const nameBytes = Buffer.from(name, 'utf8');
    const content = Buffer.isBuffer(contentValue) ? contentValue : Buffer.from(contentValue, 'utf8');
    const checksum = crc32(content);
    const local = Buffer.alloc(30 + nameBytes.length + content.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(content.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    nameBytes.copy(local, 30);
    content.copy(local, 30 + nameBytes.length);
    locals.push(local);
    const central = Buffer.alloc(46 + nameBytes.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(content.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    nameBytes.copy(central, 46);
    centrals.push(central);
    offset += local.length;
  }
  const centralBytes = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBytes.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBytes, eocd]);
}

function runEvidenceNegatives(registrySchema) {
  expectExactFailure('evidence tiny PE container', 'artifact PE DOS header is invalid', () => validateArtifact(makePortableExecutable().subarray(0, 4096), 'evidence/app.exe'));
  const noSectionPe = makePortableExecutable();
  noSectionPe.writeUInt16LE(0, 0x84 + 2);
  expectExactFailure('evidence PE without sections', 'artifact PE COFF header is invalid', () => validateArtifact(noSectionPe, 'evidence/app.exe'));
  const escapedSectionPe = makePortableExecutable();
  escapedSectionPe.writeUInt32LE(0xfffffff0, 0x80 + 4 + 20 + 0xf0 + 20);
  expectExactFailure('evidence PE section escape', 'artifact PE section 0 bytes are out of bounds', () => validateArtifact(escapedSectionPe, 'evidence/app.exe'));
  const emptyZip = Buffer.alloc(52);
  emptyZip.writeUInt32LE(0x04034b50, 0);
  emptyZip.writeUInt32LE(0x06054b50, 30);
  expectExactFailure('evidence empty ZIP', 'artifact ZIP central directory is empty or inconsistent', () => validateArtifact(emptyZip, 'evidence/app.nupkg'));
  const packageEnvelope = (extraEntries, identity = '<id>open-design-packaged-app</id><version>1.2.3</version>') => makeStoredZip([
    ['[Content_Types].xml', '<Types/>'],
    ['_rels/.rels', '<Relationships/>'],
    ['app.nuspec', `<package><metadata>${identity}</metadata></package>`],
    ...extraEntries,
  ]);
  expectExactFailure('evidence non-Squirrel ZIP', 'artifact Squirrel package identity is not Material Designer', () => validateArtifact(packageEnvelope([], '<id>not-material-designer</id><version>1.2.3</version>'), 'evidence/app.nupkg'));
  expectExactFailure('evidence Squirrel missing app.asar', 'artifact Squirrel package lacks the expected Material Designer executable or app.asar payload', () => validateArtifact(packageEnvelope([['lib/net45/Material Designer.exe', makePortableExecutable()]]), 'evidence/app.nupkg'));
  expectExactFailure('evidence Squirrel package with fake executable', 'artifact PE DOS header is invalid', () => validateArtifact(packageEnvelope([['lib/net45/Material Designer.exe', Buffer.from('MZ fake')], ['lib/net45/resources/app.asar', Buffer.alloc(1024, 1)]]), 'evidence/app.nupkg'));
  expectExactFailure('evidence JSON byte bound', 'bounded receipt exceeds byte admission bound', () => parseBoundedJsonBytes(Buffer.alloc(257 * 1024, 0x20), 'bounded receipt', 256 * 1024));
  const scannerBytes = readBoundedFile(privacyScannerPath, 'privacy scanner fixture', 1024 * 1024);
  const privatePathArtifact = makePortableExecutable();
  privatePathArtifact.write('C:\\Users\\private-user\\secret.txt', 0x2000, 'ascii');
  const privatePathReport = scanEvidencePrivacy({ artifactBytes: privatePathArtifact, captureBytes: makePng(64, 64), scannerBytes });
  expectExactFailure('privacy scanner private path', 'fixture privacy scanner accepted a private path', () => assert(privatePathReport.status === 'pass', 'fixture privacy scanner accepted a private path'));
  assert(scanEvidencePrivacy({ artifactBytes: makePortableExecutable(), captureBytes: makePng(64, 64), scannerBytes }).status === 'pass', 'privacy scanner clean fixture did not return green');
  const historicScannerRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lang-gui-historic-scanner-'));
  try {
    initGitRepository(historicScannerRoot);
    writeFileEnsured(historicScannerRoot, PRIVACY_SCANNER_PATH, scannerBytes);
    gitText(historicScannerRoot, ['add', '--', PRIVACY_SCANNER_PATH]);
    gitText(historicScannerRoot, ['commit', '-q', '-m', 'scanner source']);
    const historicCommit = gitText(historicScannerRoot, ['rev-parse', 'HEAD']);
    const historicReport = scanEvidencePrivacy({ artifactBytes: makePortableExecutable(), captureBytes: makePng(64, 64), scannerBytes });
    const changedScanner = scannerBytes.toString('utf8').replace("status: findings.length === 0 ? 'pass' : 'fail'", "status: 'fail'");
    assert(changedScanner !== scannerBytes.toString('utf8'), 'historic scanner fixture mutation did not land');
    fs.writeFileSync(path.join(historicScannerRoot, ...PRIVACY_SCANNER_PATH.split('/')), changedScanner);
    gitText(historicScannerRoot, ['add', '--', PRIVACY_SCANNER_PATH]);
    gitText(historicScannerRoot, ['commit', '-q', '-m', 'different scanner source']);
    expectExactFailure('historic scanner code', 'historic scanner privacy scanner source commit is not the checked-out HEAD', () => executeCheckedOutPrivacyScanner(historicReport, historicCommit, historicScannerRoot, makePortableExecutable(), makePng(64, 64), 'historic scanner'));
  } finally {
    fs.rmSync(historicScannerRoot, { recursive: true, force: true });
  }
  expectExactFailure('evidence fake media', 'capture is not a valid PNG signature', () => validatePng(Buffer.from('not a png')));
  expectExactFailure('evidence PNG trailing bytes', 'capture PNG has trailing bytes after IEND', () => validatePng(Buffer.concat([makePng(64, 64), Buffer.from([0])])));
  expectExactFailure('evidence trivial PNG', 'capture PNG dimensions are too small for real UI evidence', () => validatePng(makePng(1, 1)));
  expectExactFailure('evidence visually trivial PNG', 'capture PNG decoded pixels are empty or visually trivial', () => validatePng(makePng(64, 64, false, true)));
  expectExactFailure('evidence PNG privacy metadata', 'capture contains privacy-sensitive PNG metadata', () => {
    const png = validatePng(makePng(64, 64, true));
    assert(!png.ancillaryTypes.some((type) => ['tEXt', 'zTXt', 'iTXt', 'eXIf'].includes(type)), 'capture contains privacy-sensitive PNG metadata');
  });
  expectExactFailure('evidence header-only PE', 'artifact PE DOS header is invalid', () => validateArtifact(Buffer.from('MZ but no PE header'), 'evidence/app.exe'));
  const roles = new Map();
  recordEvidenceRoles(roles, { paths: ['first/path'] }, 'first');
  expectExactFailure('evidence reused across rows', 'second reuses evidence path first/path from first', () => recordEvidenceRoles(roles, { paths: ['first/path'] }, 'second'));
  const fakeElement = structuredClone(readJson(registryPath).elements[0]);
  fakeElement.status = { state: 'verified', reason: 'Synthetic evidence must stay red.' };
  for (const state of Object.keys(fakeElement.states)) fakeElement.states[state] = 'verified';
  fakeElement.contrast = { foreground: 'on-surface', background: 'surface', ratio: 21, status: 'verified' };
  fakeElement.interactionReceipt = {
    status: 'verified', path: 'fixtures/interaction-receipt.json', artifactPath: 'fixtures/app.exe', packagePath: 'fixtures/app.nupkg', releasesPath: 'fixtures/RELEASES', sourceCommit: '0'.repeat(40), buildReceiptPath: 'fixtures/build-receipt.json', buildSourceCommit: '0'.repeat(40), buildSourceTree: '0'.repeat(40), buildInputHash: '0'.repeat(64), artifactHash: '0'.repeat(64), artifactGitBlob: '0'.repeat(40), packageHash: '0'.repeat(64), packageGitBlob: '0'.repeat(40), releasesHash: '0'.repeat(64), releasesGitBlob: '0'.repeat(40), receiptHash: '0'.repeat(64), receiptGitBlob: '0'.repeat(40), buildReceiptHash: '0'.repeat(64), buildReceiptGitBlob: '0'.repeat(40), buildProvenancePath: 'fixtures/build-provenance.json', buildProvenanceHash: '0'.repeat(64), buildProvenanceGitBlob: '0'.repeat(40), installerManifestPath: 'fixtures/installer-manifest.json', installerManifestHash: '0'.repeat(64), installerManifestGitBlob: '0'.repeat(40), installedReceiptPath: 'fixtures/installed-receipt.json', installedReceiptHash: '0'.repeat(64), installedReceiptGitBlob: '0'.repeat(40), privacyReportPath: 'fixtures/privacy-report.json', privacyReportHash: '0'.repeat(64), privacyReportGitBlob: '0'.repeat(40),
  };
  fakeElement.captureTuple = { status: 'verified', route: fakeElement.route, state: 'default', viewport: '64x64', scale: 1, theme: 'light', path: 'fixtures/capture.png', captureHash: '0'.repeat(64), captureGitBlob: '0'.repeat(40), artifactHash: '0'.repeat(64), mediaType: 'image/png', width: 64, height: 64, contrast: 21 };
  expectExactFailure('source-created synthetic evidence', 'synthetic evidence evidence paths are outside canonical task staging', () => assertCanonicalEvidencePaths(fakeElement, 'synthetic evidence'));
  const head = gitText(root, ['rev-parse', 'HEAD']);
  const scripts = SUPPORTED_BUILD_SCRIPT_PATHS.map((relativePath) => {
    const blob = gitBlobAt(root, head, relativePath, 'supported script fixture');
    return { path: relativePath, sha256: sha256(gitBlobBytes(root, blob, 'supported script fixture')), gitBlob: blob };
  });
  validateSupportedBuildScripts({ scripts }, head, head, root, 'canonical static evidence');
  const validSetupBytes = makePortableExecutable();
  const validPackageBytes = packageEnvelope([['lib/net45/Material Designer.exe', makePortableExecutable()], ['lib/net45/resources/app.asar', Buffer.alloc(1024, 1)]]);
  validateArtifact(validSetupBytes, 'material-designer-1.2.3-win-x64-setup.exe');
  validateArtifact(validPackageBytes, 'open-design-packaged-app-1.2.3-full.nupkg');
  const validReleasesBytes = Buffer.from(`${crypto.createHash('sha1').update(validPackageBytes).digest('hex')} open-design-packaged-app-1.2.3-full.nupkg ${validPackageBytes.length}\n`);
  validateSquirrelReleases(validReleasesBytes, 'open-design-packaged-app-1.2.3-full.nupkg', validPackageBytes, 'canonical static evidence');
  const canonicalFake = structuredClone(fakeElement);
  const canonicalPrefix = canonicalEvidencePrefix(canonicalFake.stableElementId);
  Object.assign(canonicalFake.interactionReceipt, {
    path: `${canonicalPrefix}interaction-receipt.json`, artifactPath: `${canonicalPrefix}assets/material-designer-1.2.3-win-x64-setup.exe`, packagePath: `${canonicalPrefix}assets/open-design-packaged-app-1.2.3-full.nupkg`, releasesPath: `${canonicalPrefix}assets/RELEASES`, buildReceiptPath: `${canonicalPrefix}build-receipt.json`, buildProvenancePath: `${canonicalPrefix}build-provenance.json`, installerManifestPath: `${canonicalPrefix}installer-manifest.json`, installedReceiptPath: `${canonicalPrefix}installed-receipt.json`, privacyReportPath: `${canonicalPrefix}privacy-report.json`, artifactHash: sha256(validSetupBytes), packageHash: sha256(validPackageBytes), releasesHash: sha256(validReleasesBytes),
  });
  canonicalFake.captureTuple.path = `${canonicalPrefix}captures/default.png`;
  expectExactFailure('canonical static evidence lacks live proof', 'canonical static evidence verified status requires verifier-owned live proof capability', () => checkVerifiedEvidence(canonicalFake, 'canonical static evidence', registrySchema));
  expectExactFailure('serialized live proof capability', 'serialized live proof verified status requires verifier-owned live proof capability', () => checkVerifiedEvidence(canonicalFake, 'serialized live proof', registrySchema, JSON.parse('{"authorized":true,"nonce":"fixture"}')));
  const previousLiveProofEnvironment = process.env.LANG_GUI_LIVE_PROOF;
  process.env.LANG_GUI_LIVE_PROOF = 'fixture';
  try {
    expectExactFailure('environment live proof capability', 'environment live proof verified status requires verifier-owned live proof capability', () => checkVerifiedEvidence(canonicalFake, 'environment live proof', registrySchema));
  } finally {
    if (previousLiveProofEnvironment === undefined) delete process.env.LANG_GUI_LIVE_PROOF;
    else process.env.LANG_GUI_LIVE_PROOF = previousLiveProofEnvironment;
  }
  scripts[1] = { ...scripts[1], sha256: sha256(Buffer.from('@echo off\r\nexit /b 0\r\n')) };
  expectExactFailure('self-authored build receipt', 'synthetic build supported build script identity does not match the built and checked-out source', () => validateSupportedBuildScripts({ scripts }, head, head, root, 'synthetic build'));
  expectExactFailure('evidence arbitrary JSON', 'evidence.receipt is missing required property schema', () => validateAgainstSchema({}, registrySchema.$defs.receiptDocument, 'evidence.receipt', registrySchema));
  const png = validatePng(makePng(64, 64));
  expectExactFailure('evidence contrast mismatch', 'fixture contrast ratio is not derived from capture pixels', () => assert(Math.abs(contrastRatio(png.pixelAt(0, 0), png.pixelAt(1, 0)) - 5) <= 0.000001, 'fixture contrast ratio is not derived from capture pixels'));
  const hash = 'a'.repeat(64);
  const blob = 'b'.repeat(40);
  for (const [field, identity] of [
    ['path', { path: 'wrong', sha256: hash, gitBlob: blob }],
    ['hash', { path: 'right', sha256: 'c'.repeat(64), gitBlob: blob }],
    ['blob', { path: 'right', sha256: hash, gitBlob: 'd'.repeat(40) }],
  ]) expectExactFailure(`evidence identity ${field}`, `fixture evidence ${field} identity drifted`, () => assert(identityMatches(identity, 'right', hash, blob), `fixture evidence ${field} identity drifted`));
  const packageBytes = Buffer.from('bounded package bytes');
  const packageName = 'open-design-packaged-app-1.2.3-full.nupkg';
  const packageSha1 = crypto.createHash('sha1').update(packageBytes).digest('hex');
  expectExactFailure('RELEASES malformed row', 'fixture RELEASES entry 0 is malformed', () => validateSquirrelReleases(Buffer.from('not-a-release-row\n'), packageName, packageBytes, 'fixture'));
  expectExactFailure('RELEASES wrong size', 'fixture RELEASES index does not bind the full package bytes', () => validateSquirrelReleases(Buffer.from(`${packageSha1} ${packageName} ${packageBytes.length + 1}\n`), packageName, packageBytes, 'fixture'));
  expectExactFailure('RELEASES wrong SHA-1', 'fixture RELEASES index does not bind the full package bytes', () => validateSquirrelReleases(Buffer.from(`${'0'.repeat(40)} ${packageName} ${packageBytes.length}\n`), packageName, packageBytes, 'fixture'));
  const processReceipt = { startedAt: '2026-08-29T00:00:00.000Z', completedAt: '2026-08-29T00:00:01.000Z', durationMs: 1000 };
  expectExactFailure('build process duration', 'fixture build process timing is not an exact successful outcome', () => validateBuildProcess({ ...processReceipt, durationMs: 999 }, { builtAt: '2026-08-29T00:00:00.500Z' }, 'fixture'));
  expectExactFailure('build provenance timestamp', 'fixture build provenance timestamp is outside the build process', () => validateBuildProcess(processReceipt, { builtAt: '2026-08-29T00:00:02.000Z' }, 'fixture'));
  const captureFixture = { route: 'material-designer://app/app-root', state: 'default', theme: 'light', viewport: '64x64', scale: 1, mediaType: 'image/png', width: 64, height: 64, artifactHash: hash, captureHash: 'e'.repeat(64), captureGitBlob: blob, contrast: 21 };
  const receiptFixture = { artifactHash: hash };
  const receiptDocumentFixture = { tuple: { route: captureFixture.route, state: captureFixture.state, theme: captureFixture.theme, viewport: captureFixture.viewport, scale: captureFixture.scale }, contrast: { ratio: 21, foreground: { role: 'on-surface', x: 0, y: 0, rgb: [0, 0, 0] }, background: { role: 'surface', x: 1, y: 0, rgb: [255, 255, 255] } } };
  for (const [field, expected, mutate] of [
    ['route', 'fixture interaction receipt tuple does not match capture tuple', (value) => { value.route = 'material-designer://app/wrong'; }],
    ['state', 'fixture interaction receipt tuple does not match capture tuple', (value) => { value.state = 'changed'; }],
    ['theme', 'fixture interaction receipt tuple does not match capture tuple', (value) => { value.theme = 'dark'; }],
    ['viewport', 'fixture capture dimensions do not equal viewport tuple', (value) => { value.viewport = '320x640'; }],
    ['scale', 'fixture interaction receipt tuple does not match capture tuple', (value) => { value.scale = 2; }],
  ]) expectExactFailure(`evidence ${field} mismatch`, expected, () => {
    const changed = structuredClone(captureFixture);
    mutate(changed);
    validateCaptureReceipt(receiptDocumentFixture, changed, receiptFixture, png, 'fixture');
  });
  expectExactFailure('evidence capture dimensions', 'fixture capture media metadata does not match PNG bytes', () => validateCaptureReceipt(receiptDocumentFixture, { ...captureFixture, width: 2 }, receiptFixture, png, 'fixture'));
  expectExactFailure('evidence stale artifact hash', 'fixture capture artifact hash is stale', () => validateCaptureReceipt(receiptDocumentFixture, { ...captureFixture, artifactHash: '0'.repeat(64) }, receiptFixture, png, 'fixture'));
  const elementContrast = { contrast: { foreground: 'on-surface', background: 'surface', ratio: 21 } };
  expectExactFailure('evidence contrast sample pixels', 'fixture committed contrast samples do not match capture pixels', () => {
    const changed = structuredClone(receiptDocumentFixture);
    changed.contrast.foreground.rgb = [1, 1, 1];
    validateContrastReceipt(elementContrast, changed, captureFixture, png, 'fixture');
  });
  expectExactFailure('evidence contrast role', 'fixture contrast sample roles do not match element roles', () => validateContrastReceipt({ contrast: { ...elementContrast.contrast, foreground: 'wrong-role' } }, receiptDocumentFixture, captureFixture, png, 'fixture'));
  const reorderedScripts = scripts.toReversed();
  expectExactFailure('supported build script order', 'fixture supported build script paths[0] drifted', () => validateSupportedBuildScripts({ scripts: reorderedScripts }, head, head, root, 'fixture'));
  const wrongBlobScripts = structuredClone(scripts);
  wrongBlobScripts[0].gitBlob = '0'.repeat(40);
  expectExactFailure('supported build script blob', 'fixture supported build script identity does not match the built and checked-out source', () => validateSupportedBuildScripts({ scripts: wrongBlobScripts }, head, head, root, 'fixture'));
  const currentPrivacy = scanEvidencePrivacy({ artifactBytes: makePortableExecutable(), captureBytes: makePng(64, 64), scannerBytes });
  const currentExecution = executeCheckedOutPrivacyScanner(currentPrivacy, head, root, makePortableExecutable(), makePng(64, 64), 'current scanner');
  assert(JSON.stringify(currentExecution.derivedReport) === JSON.stringify(currentPrivacy), 'current audited privacy scanner execution drifted');
  expectExactFailure('privacy scanner network token', 'fixture privacy scanner source uses a forbidden import or exfiltration token', () => auditPrivacyScannerSource(Buffer.concat([scannerBytes, Buffer.from('\nfetch("https://example.invalid")\n')]), 'fixture'));
  expectExactFailure('evidence privacy scanner SHA', 'fixture committed privacy scanner identity does not match source commit', () => executeCheckedOutPrivacyScanner({ ...currentPrivacy, scanner: { ...currentPrivacy.scanner, sha256: '0'.repeat(64) } }, head, root, makePortableExecutable(), makePng(64, 64), 'fixture'));
  expectExactFailure('privacy scanner exit-one pass shape', 'fixture pass-shaped privacy scanner report did not exit zero', () => executeCheckedOutPrivacyScanner(currentPrivacy, head, root, makePortableExecutable(), makePng(64, 64), 'fixture', {
    runner: () => ({ error: null, signal: null, status: 1, stdout: Buffer.from(stableJson(currentPrivacy)), stderr: Buffer.alloc(0) }),
  }));
  expectExactFailure('evidence privacy input SHA', 'fixture privacy input SHA does not match target bytes', () => assert('0'.repeat(64) === privacyInputSha256(currentPrivacy.artifact.sha256, currentPrivacy.capture.sha256), 'fixture privacy input SHA does not match target bytes'));
  expectExactFailure('evidence privacy report', 'fixture.privacyReport.status does not equal schema const', () => validateAgainstSchema({ ...currentPrivacy, status: 'fail' }, registrySchema.$defs.privacyReportDocument, 'fixture.privacyReport', registrySchema));
  expectExactFailure('evidence extension namespace version', 'fixture.extensionNamespace.version does not equal schema const', () => validateAgainstSchema({ name: 'material-designer.lang-gui.interaction-receipt.extensions', version: 2 }, registrySchema.$defs.receiptDocument.properties.extensionNamespace, 'fixture.extensionNamespace', registrySchema));
  expectExactFailure('evidence nested schema extra', 'fixture.tuple has unexpected property unexpected', () => validateAgainstSchema({ ...receiptDocumentFixture.tuple, unexpected: true }, registrySchema.$defs.receiptDocument.properties.tuple, 'fixture.tuple', registrySchema));
  expectExactFailure('build process equal timestamps', 'fixture build process timing is not an exact successful outcome', () => validateBuildProcess({ ...processReceipt, completedAt: processReceipt.startedAt, durationMs: 1 }, { builtAt: processReceipt.startedAt }, 'fixture'));
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
  const discovered = discoverSourceClassification(root);
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
  boundary('schema string bound removal', 'registrySchema string schema lacks maxLength at $.$defs.id', (r, s) => { delete s.$defs.id.maxLength; });
  boundary('schema array bound removal', 'registrySchema array schema lacks maxItems at $.properties.requiredSurfaceIds', (r, s) => { delete s.properties.requiredSurfaceIds.maxItems; });
  boundary('schema property bound removal', 'registrySchema object schema lacks maxProperties at $.$defs.material', (r, s) => { delete s.$defs.material.maxProperties; });
  boundary('schema build source tree authority', 'schema lacks exact build source tree authority', (r, s) => { s.$defs.interactionReceipt.required = s.$defs.interactionReceipt.required.filter((field) => field !== 'buildSourceTree'); });
  boundary('schema Squirrel installed authority', 'schema lacks complete Squirrel and installed evidence authority', (r, s) => { s.$defs.interactionReceipt.required = s.$defs.interactionReceipt.required.filter((field) => field !== 'releasesPath'); });
  boundary('schema supported build scripts', 'schema lacks supported build script authority', (r, s) => { s.$defs.buildReceiptDocument.properties.scripts.minItems = 3; });
  boundary('schema privacy scanner authority', 'schema lacks committed privacy scanner authority', (r, s) => { s.$defs.privacyReportDocument.properties.scanner.properties.path.const = 'scripts/not-the-scanner.mjs'; });
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
  boundary('desktop authoritative classification', 'desktop elements[0] classification is not the hand-written authority', (r, s, i, os, d) => { d.elements[0].classification = d.elements[0].classification === 'rendered-intrinsic' ? 'rendered-component' : 'rendered-intrinsic'; });
  boundary('desktop authoritative reason', 'desktop elements[0] reason is not the hand-written authority', (r, s, i, os, d) => { d.elements[0].reason += ' changed'; });
  boundary('desktop authoritative dynamic limit', 'desktop dynamic limits drifted', (r, s, i, os, d) => { d.dynamicLimits[0].reason += ' changed'; });
  boundary('site creator omission', `site runtime creators discovery/classification drifted: discovered=${site.runtimeCreators.length}, classified=${site.runtimeCreators.length - 1}, missing=${site.runtimeCreators.at(-1).id}, stale=none`, (r, s, i, os, d, ds, st) => { st.runtimeCreators.pop(); });
  boundary('site authoritative creator reason', 'site runtime creators[0] reason is not the hand-written authority', (r, s, i, os, d, ds, st) => { st.runtimeCreators[0].reason += ' changed'; });
  boundary('site authoritative dynamic limit', 'site dynamic limits drifted', (r, s, i, os, d, ds, st) => { st.dynamicLimits[0].reason += ' changed'; });
  boundary('site HTML omission', `site HTML elements discovery/classification drifted: discovered=${site.htmlElements.length}, classified=${site.htmlElements.length - 1}, missing=${site.htmlElements.at(-1).id}, stale=none`, (r, s, i, os, d, ds, st) => { st.htmlElements.pop(); });
  boundary('comment source hash', `desktop comment exclusions discovery/classification drifted: discovered=${desktop.commentExclusions.length}, classified=${desktop.commentExclusions.length}, missing=none, stale=none`, (r, s, i, os, d) => { d.commentExclusions[0].sourceHash = '0'.repeat(64); });
  const bootstrapSource = fs.readFileSync(bootstrapPath, 'utf8');
  expectExactFailure('verifier bootstrap wiring', 'verifier bootstrap is not wired to the locked parser workspace install', () => checkVerifierBootstrap(bootstrapSource.replaceAll('--frozen-lockfile', '--not-locked')));
  expectExactFailure('verifier live proof wiring', 'verifier bootstrap is not wired to the live proof route', () => checkVerifierBootstrap(bootstrapSource.replaceAll('[switch]$LiveProof', '[switch]$NotLiveProof')));
  expectExactFailure('JSON string admission bound', 'bounded receipt JSON string exceeds admission bound', () => parseBoundedJsonBytes(Buffer.from(JSON.stringify('x'.repeat(JSON_LIMITS.receipt.maxString + 1))), 'bounded receipt'));
  expectExactFailure('JSON array admission bound', 'bounded receipt JSON array exceeds admission bound', () => parseBoundedJsonBytes(Buffer.from(JSON.stringify(Array(JSON_LIMITS.receipt.maxArray + 1).fill(0))), 'bounded receipt'));
  expectExactFailure('JSON nesting admission bound', 'bounded receipt JSON nesting exceeds admission bound', () => parseBoundedJsonBytes(Buffer.from(`${'['.repeat(JSON_LIMITS.receipt.maxDepth + 1)}0${']'.repeat(JSON_LIMITS.receipt.maxDepth + 1)}`), 'bounded receipt'));
  expectExactFailure('JSON property admission bound', 'bounded receipt JSON property count exceeds admission bound', () => parseBoundedJsonBytes(Buffer.from(JSON.stringify(Object.fromEntries(Array.from({ length: JSON_LIMITS.receipt.maxProperties + 1 }, (_, index) => [`p${index}`, 0])))), 'bounded receipt'));
  const oversizedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lang-gui-oversized-json-'));
  try {
    const oversizedPath = path.join(oversizedRoot, 'registry.json');
    const handle = fs.openSync(oversizedPath, 'w');
    try { fs.ftruncateSync(handle, 1025); } finally { fs.closeSync(handle); }
    const tinyLimits = { ...JSON_LIMITS.receipt, maxBytes: 1024 };
    expectExactFailure('on-disk JSON byte admission', 'oversized registry fixture file size exceeds admission bound', () => readJson(oversizedPath, tinyLimits, 'oversized registry fixture'));
  } finally {
    fs.rmSync(oversizedRoot, { recursive: true, force: true });
  }
  runAstFixtureNegatives(parser);
  runEvidenceNegatives(registrySchema);
  validateAll(registry, registrySchema, inventory, ownerSchema, desktop, desktopSchema, site, siteSchema, { parser, discovered });
  process.stdout.write(`GREEN after restoring ${negativeCaseCount} exact AST, classification, schema, evidence, privacy, contrast, and tuple boundaries\n`);
}

try {
  if (process.argv.includes('--seal-schema-bounds')) sealAllSchemaBounds();
  else if (process.argv.includes('--refresh-classifications')) refreshClassifications();
  else if (process.argv.includes('--negative')) runNegative();
  else if (process.argv.includes('--live-proof')) await runLiveProofCli();
  else {
    const result = validateAll(readJson(registryPath), readJson(registrySchemaPath), readJson(ownerPath), readJson(ownerSchemaPath), readJson(desktopPath), readJson(desktopSchemaPath), readJson(sitePath), readJson(siteSchemaPath));
    process.stdout.write(`every-element registry green: ${JSON.stringify(result)}\n`);
  }
} catch (error) {
  process.stderr.write(`every-element registry red: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

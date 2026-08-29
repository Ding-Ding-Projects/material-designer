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

function readJson(file) {
  if (!fs.existsSync(file)) throw new Error(`missing file: ${path.relative(root, file)}`);
  const name = path.basename(file);
  const limits = name.endsWith('.schema.json') ? JSON_LIMITS.schema : JSON_LIMITS[name] ?? JSON_LIMITS.receipt;
  return parseBoundedJsonBytes(fs.readFileSync(file), path.relative(root, file), limits.maxBytes, limits);
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
    assert(payload.length > 0 && payload.every((entry) => entry.content.length > 0), 'artifact Squirrel package lacks an application payload under lib/net*');
    const packagedExecutables = payload.filter((entry) => entry.name.toLowerCase().endsWith('.exe'));
    assert(packagedExecutables.length > 0, 'artifact Squirrel package lacks an executable application payload');
    for (const executable of packagedExecutables) validatePortableExecutable(executable.content);
    return { format: 'squirrel-nupkg', entries: names };
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
  const rolePaths = [receipt.artifactPath, receipt.path, capture.path, receipt.buildReceiptPath, receipt.privacyReportPath];
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
  assert(gitText(gitCwd, ['rev-parse', `${receipt.buildSourceCommit}^{tree}`]) === receipt.buildSourceTree, `${label} build source tree does not match build source commit`);
  const artifactFile = repoFile(evidenceRoot, receipt.artifactPath, `${label} artifact`);
  const receiptFile = repoFile(evidenceRoot, receipt.path, `${label} receipt`);
  const captureFile = repoFile(evidenceRoot, capture.path, `${label} capture`);
  const buildReceiptFile = repoFile(evidenceRoot, receipt.buildReceiptPath, `${label} build receipt`);
  const privacyReportFile = repoFile(evidenceRoot, receipt.privacyReportPath, `${label} privacy report`);
  const artifactBlob = gitBlobAt(gitCwd, receipt.sourceCommit, receipt.artifactPath, `${label} artifact`);
  const receiptBlob = gitBlobAt(gitCwd, receipt.sourceCommit, receipt.path, `${label} receipt`);
  const captureBlob = gitBlobAt(gitCwd, receipt.sourceCommit, capture.path, `${label} capture`);
  const buildReceiptBlob = gitBlobAt(gitCwd, receipt.sourceCommit, receipt.buildReceiptPath, `${label} build receipt`);
  const privacyReportBlob = gitBlobAt(gitCwd, receipt.sourceCommit, receipt.privacyReportPath, `${label} privacy report`);
  assert(artifactBlob === receipt.artifactGitBlob, `${label} artifact Git blob does not match source commit`);
  assert(receiptBlob === receipt.receiptGitBlob, `${label} receipt Git blob does not match source commit`);
  assert(captureBlob === capture.captureGitBlob, `${label} capture Git blob does not match source commit`);
  assert(buildReceiptBlob === receipt.buildReceiptGitBlob, `${label} build receipt Git blob does not match source commit`);
  assert(privacyReportBlob === receipt.privacyReportGitBlob, `${label} privacy report Git blob does not match source commit`);
  assert(workingBlob(gitCwd, artifactFile) === artifactBlob && workingBlob(gitCwd, receiptFile) === receiptBlob && workingBlob(gitCwd, captureFile) === captureBlob && workingBlob(gitCwd, buildReceiptFile) === buildReceiptBlob && workingBlob(gitCwd, privacyReportFile) === privacyReportBlob, `${label} working evidence bytes differ from source commit`);
  const artifactBytes = readBoundedFile(artifactFile, `${label} artifact`, 512 * 1024 * 1024);
  const receiptBytes = readBoundedFile(receiptFile, `${label} interaction receipt`, JSON_LIMITS.receipt.maxBytes);
  const captureBytes = readBoundedFile(captureFile, `${label} capture`, 128 * 1024 * 1024);
  const buildReceiptBytes = readBoundedFile(buildReceiptFile, `${label} build receipt`, JSON_LIMITS.receipt.maxBytes);
  const privacyReportBytes = readBoundedFile(privacyReportFile, `${label} privacy report`, JSON_LIMITS.receipt.maxBytes);
  assert(sha256(artifactBytes) === receipt.artifactHash, `${label} artifact SHA-256 does not match its file`);
  assert(sha256(receiptBytes) === receipt.receiptHash, `${label} receipt SHA-256 does not match its file`);
  assert(sha256(captureBytes) === capture.captureHash, `${label} capture SHA-256 does not match its file`);
  assert(sha256(buildReceiptBytes) === receipt.buildReceiptHash, `${label} build receipt SHA-256 does not match its file`);
  assert(sha256(privacyReportBytes) === receipt.privacyReportHash, `${label} privacy report SHA-256 does not match its file`);
  validateArtifact(artifactBytes, receipt.artifactPath);
  const png = validatePng(captureBytes);
  const viewport = capture.viewport.match(/^([1-9][0-9]*)x([1-9][0-9]*)$/);
  assert(viewport && Number(viewport[1]) === png.width && Number(viewport[2]) === png.height, `${label} capture dimensions do not equal viewport tuple`);
  assert(capture.mediaType === 'image/png' && png.width === capture.width && png.height === capture.height, `${label} capture media metadata does not match PNG bytes`);
  const receiptDocument = parseBoundedJsonBytes(receiptBytes, `${label} interaction receipt`, 256 * 1024);
  const buildReceiptDocument = parseBoundedJsonBytes(buildReceiptBytes, `${label} build receipt`, 256 * 1024);
  const privacyReportDocument = parseBoundedJsonBytes(privacyReportBytes, `${label} privacy report`, 256 * 1024);
  validateAgainstSchema(receiptDocument, registrySchema.$defs.receiptDocument, `${label}.receipt`, registrySchema);
  validateAgainstSchema(buildReceiptDocument, registrySchema.$defs.buildReceiptDocument, `${label}.buildReceipt`, registrySchema);
  validateAgainstSchema(privacyReportDocument, registrySchema.$defs.privacyReportDocument, `${label}.privacyReport`, registrySchema);
  assert(receiptDocument.elementId === element.stableElementId, `${label} receipt element id does not match`);
  assert(receiptDocument.buildSourceCommit === receipt.buildSourceCommit && receiptDocument.buildSourceTree === receipt.buildSourceTree && receiptDocument.buildInputHash === receipt.buildInputHash, `${label} receipt build provenance does not match`);
  assert(receiptDocument.artifact.path === receipt.artifactPath && receiptDocument.artifact.sha256 === receipt.artifactHash && receiptDocument.artifact.gitBlob === receipt.artifactGitBlob, `${label} receipt artifact identity does not match`);
  assert(receiptDocument.capture.path === capture.path && receiptDocument.capture.sha256 === capture.captureHash && receiptDocument.capture.gitBlob === capture.captureGitBlob, `${label} receipt capture identity does not match`);
  assert(receiptDocument.capture.width === capture.width && receiptDocument.capture.height === capture.height && receiptDocument.capture.mediaType === capture.mediaType, `${label} receipt capture metadata does not match`);
  assert(receiptDocument.buildReceipt.path === receipt.buildReceiptPath && receiptDocument.buildReceipt.sha256 === receipt.buildReceiptHash && receiptDocument.buildReceipt.gitBlob === receipt.buildReceiptGitBlob, `${label} receipt build identity does not match`);
  assert(receiptDocument.privacyReport.path === receipt.privacyReportPath && receiptDocument.privacyReport.sha256 === receipt.privacyReportHash && receiptDocument.privacyReport.gitBlob === receipt.privacyReportGitBlob, `${label} receipt privacy identity does not match`);
  assert(buildReceiptDocument.buildSourceCommit === receipt.buildSourceCommit && buildReceiptDocument.buildSourceTree === receipt.buildSourceTree, `${label} build receipt source commit or tree does not match`);
  assert(buildReceiptDocument.inputTreeSha256 === receipt.buildInputHash && buildReceiptDocument.inputTreeSha256 === inputTreeSha256(gitCwd, receipt.buildSourceCommit), `${label} build receipt input SHA does not match source tree`);
  assert(buildReceiptDocument.artifact.path === receipt.artifactPath && buildReceiptDocument.artifact.sha256 === receipt.artifactHash && buildReceiptDocument.artifact.gitBlob === receipt.artifactGitBlob && buildReceiptDocument.artifact.size === artifactBytes.length, `${label} build receipt artifact identity does not match`);
  const builderScriptBlob = gitBlobAt(gitCwd, receipt.buildSourceCommit, buildReceiptDocument.builder.scriptPath, `${label} builder script`);
  const builderScriptBytes = gitBlobBytes(gitCwd, builderScriptBlob, `${label} builder script`);
  assert(buildReceiptDocument.builder.command === 'build-installer.bat /s' && buildReceiptDocument.builder.version === '1' && buildReceiptDocument.builder.exitCode === 0 && buildReceiptDocument.builder.scriptGitBlob === builderScriptBlob && buildReceiptDocument.builder.scriptSha256 === sha256(builderScriptBytes), `${label} build receipt builder identity does not match build source`);
  const tuple = receiptDocument.tuple;
  assert(tuple.route === capture.route && tuple.state === capture.state && tuple.theme === capture.theme && tuple.viewport === capture.viewport && tuple.scale === capture.scale, `${label} interaction receipt tuple does not match capture tuple`);
  assert(capture.artifactHash === receipt.artifactHash, `${label} capture artifact hash is stale`);
  const scannerBlob = gitBlobAt(gitCwd, receipt.sourceCommit, privacyReportDocument.scanner.path, `${label} privacy scanner`);
  const scannerBytes = gitBlobBytes(gitCwd, scannerBlob, `${label} privacy scanner`);
  assert(privacyReportDocument.scanner.name === PRIVACY_SCANNER_NAME && privacyReportDocument.scanner.path === PRIVACY_SCANNER_PATH && privacyReportDocument.scanner.sha256 === sha256(scannerBytes) && privacyReportDocument.method === PRIVACY_SCANNER_METHOD && privacyReportDocument.methodVersion === PRIVACY_SCANNER_METHOD_VERSION, `${label} committed privacy scanner identity does not match source commit`);
  const derivedPrivacyReport = scanEvidencePrivacy({ artifactBytes, captureBytes, scannerBytes });
  assert(JSON.stringify(privacyReportDocument) === JSON.stringify(derivedPrivacyReport) && privacyReportDocument.status === 'pass' && privacyReportDocument.findingCount === 0 && privacyReportDocument.inputSha256 === privacyInputSha256(receipt.artifactHash, capture.captureHash), `${label} committed privacy report did not pass or match the scanner result`);
  assert(privacyReportDocument.artifact.sha256 === receipt.artifactHash && privacyReportDocument.capture.sha256 === capture.captureHash, `${label} privacy report targets do not match evidence`);
  assert(!png.ancillaryTypes.some((type) => ['tEXt', 'zTXt', 'iTXt', 'eXIf'].includes(type)), `${label} capture contains privacy-sensitive PNG metadata`);
  const foreground = receiptDocument.contrast.foreground;
  const background = receiptDocument.contrast.background;
  const foregroundPixel = png.pixelAt(foreground.x, foreground.y);
  const backgroundPixel = png.pixelAt(background.x, background.y);
  assert(foregroundPixel.alpha === 1 && backgroundPixel.alpha === 1, `${label} contrast samples must be opaque`);
  assert([foregroundPixel.r, foregroundPixel.g, foregroundPixel.b].every((value, index) => value === foreground.rgb[index]) && [backgroundPixel.r, backgroundPixel.g, backgroundPixel.b].every((value, index) => value === background.rgb[index]), `${label} committed contrast samples do not match capture pixels`);
  const derivedContrast = contrastRatio(foregroundPixel, backgroundPixel);
  assert(Math.abs(derivedContrast - receiptDocument.contrast.ratio) <= 0.000001 && Math.abs(derivedContrast - element.contrast.ratio) <= 0.000001 && Math.abs(derivedContrast - capture.contrast) <= 0.000001, `${label} contrast ratio is not derived from committed capture pixels`);
  assert(foreground.role === element.contrast.foreground && background.role === element.contrast.background, `${label} contrast sample roles do not match element roles`);
  return { paths: rolePaths, artifactBlob, receiptBlob, captureBlob, buildReceiptBlob, privacyReportBlob };
}

function recordEvidenceRoles(roleMap, evidence, label) {
  for (const rolePath of evidence.paths) {
    assert(!roleMap.has(rolePath), `${label} reuses evidence path ${rolePath} from ${roleMap.get(rolePath)}`);
    roleMap.set(rolePath, label);
  }
}

function checkSchemaAuthority(schema) {
  assert(schema.$defs?.element?.required && schema.$defs?.states?.required && schema.$defs?.receiptDocument && schema.$defs?.buildReceiptDocument && schema.$defs?.privacyReportDocument, 'schema lacks element, state, receipt, build, or privacy authority');
  assert(schema.$defs.interactionReceipt.required.includes('buildSourceTree') && schema.$defs.receiptDocument.required.includes('buildSourceTree') && schema.$defs.buildReceiptDocument.required.includes('buildSourceTree'), 'schema lacks exact build source tree authority');
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
    element.interactionReceipt = { status: 'unverified', path: null, artifactPath: null, sourceCommit: 'HEAD', buildReceiptPath: null, buildSourceCommit: null, buildSourceTree: null, buildInputHash: null, artifactHash: null, artifactGitBlob: null, receiptHash: null, receiptGitBlob: null, buildReceiptHash: null, buildReceiptGitBlob: null, privacyReportPath: null, privacyReportHash: null, privacyReportGitBlob: null };
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

function evidenceElementFixture(registrySchema, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lang-gui-evidence-'));
  initGitRepository(directory);
  const buildScriptBytes = Buffer.from('@echo off\nexit /b 0\n', 'utf8');
  const scannerBytes = fs.readFileSync(privacyScannerPath);
  writeFileEnsured(directory, 'source.txt', 'source revision\n');
  const buildScriptFile = writeFileEnsured(directory, 'build-installer.bat', buildScriptBytes);
  writeFileEnsured(directory, PRIVACY_SCANNER_PATH, scannerBytes);
  gitText(directory, ['add', '--', 'source.txt', 'build-installer.bat', PRIVACY_SCANNER_PATH]);
  gitText(directory, ['commit', '-q', '-m', 'source']);
  const buildSourceCommit = gitText(directory, ['rev-parse', 'HEAD']);
  const buildSourceTree = gitText(directory, ['rev-parse', `${buildSourceCommit}^{tree}`]);
  const buildInputHash = inputTreeSha256(directory, buildSourceCommit);
  const buildScriptBlob = workingBlob(directory, buildScriptFile);
  const artifactPath = 'evidence/app.exe';
  const capturePath = 'evidence/capture.png';
  const receiptPath = 'evidence/receipt.json';
  const buildReceiptPath = 'evidence/build-receipt.json';
  const privacyReportPath = 'evidence/privacy-report.json';
  const artifactBytes = options.artifactBytes ?? makePortableExecutable();
  const captureBytes = options.captureBytes ?? makePng(64, 64);
  const artifactFile = writeFileEnsured(directory, artifactPath, artifactBytes);
  const captureFile = writeFileEnsured(directory, capturePath, captureBytes);
  const artifactBlob = workingBlob(directory, artifactFile);
  const captureBlob = workingBlob(directory, captureFile);
  const buildReceiptDocument = {
    schema: 'material-designer.lang-gui.build-receipt',
    version: 1,
    buildSourceCommit,
    buildSourceTree,
    inputTreeSha256: buildInputHash,
    builder: { command: 'build-installer.bat /s', version: '1', scriptPath: 'build-installer.bat', scriptSha256: sha256(buildScriptBytes), scriptGitBlob: buildScriptBlob, exitCode: 0 },
    artifact: { path: artifactPath, sha256: sha256(artifactBytes), gitBlob: artifactBlob, size: artifactBytes.length },
  };
  options.mutateBuildReceipt?.(buildReceiptDocument);
  const buildReceiptBytes = Buffer.from(stableJson(buildReceiptDocument));
  const buildReceiptFile = writeFileEnsured(directory, buildReceiptPath, buildReceiptBytes);
  const buildReceiptBlob = workingBlob(directory, buildReceiptFile);
  const privacyReportDocument = scanEvidencePrivacy({ artifactBytes, captureBytes, scannerBytes });
  options.mutatePrivacyReport?.(privacyReportDocument);
  const privacyReportBytes = Buffer.from(stableJson(privacyReportDocument));
  const privacyReportFile = writeFileEnsured(directory, privacyReportPath, privacyReportBytes);
  const privacyReportBlob = workingBlob(directory, privacyReportFile);
  const receiptDocument = options.receiptDocument ?? {
    schema: 'material-designer.lang-gui.interaction-receipt',
    version: 1,
    extensionNamespace: { name: 'material-designer.lang-gui.interaction-receipt.extensions', version: 1 },
    elementId: 'desktop-app-root',
    buildSourceCommit,
    buildSourceTree,
    buildInputHash,
    artifact: { path: artifactPath, sha256: sha256(artifactBytes), gitBlob: artifactBlob },
    capture: { path: capturePath, sha256: sha256(captureBytes), gitBlob: captureBlob, mediaType: 'image/png', width: 64, height: 64 },
    buildReceipt: { path: buildReceiptPath, sha256: sha256(buildReceiptBytes), gitBlob: buildReceiptBlob },
    privacyReport: { path: privacyReportPath, sha256: sha256(privacyReportBytes), gitBlob: privacyReportBlob },
    tuple: { route: 'material-designer://app/app-root', state: 'default', theme: 'light', viewport: '64x64', scale: 1 },
    interaction: { action: 'open', target: 'app root', before: 'closed', after: 'open' },
    contrast: { status: 'verified', method: 'WCAG2-relative-luminance', version: 1, ratio: 21, foreground: { role: 'on-surface', x: 0, y: 0, rgb: [0, 0, 0] }, background: { role: 'surface', x: 1, y: 0, rgb: [255, 255, 255] } },
  };
  options.mutateReceipt?.(receiptDocument);
  const receiptBytes = Buffer.from(stableJson(receiptDocument));
  const receiptFile = writeFileEnsured(directory, receiptPath, receiptBytes);
  gitText(directory, ['add', '--', artifactPath, capturePath, buildReceiptPath, privacyReportPath, receiptPath]);
  gitText(directory, ['commit', '-q', '-m', 'evidence']);
  const evidenceCommit = gitText(directory, ['rev-parse', 'HEAD']);
  const receiptBlob = workingBlob(directory, receiptFile);
  const baseRegistry = readJson(registryPath);
  const element = structuredClone(baseRegistry.elements[0]);
  element.status = { state: 'verified', reason: 'Fixture evidence is complete.' };
  for (const key of Object.keys(element.states)) element.states[key] = 'verified';
  element.contrast = { foreground: 'on-surface', background: 'surface', ratio: 21, status: 'verified' };
  element.interactionReceipt = { status: 'verified', path: receiptPath, artifactPath, sourceCommit: evidenceCommit, buildReceiptPath, buildSourceCommit, buildSourceTree, buildInputHash, artifactHash: sha256(artifactBytes), artifactGitBlob: artifactBlob, receiptHash: sha256(receiptBytes), receiptGitBlob: receiptBlob, buildReceiptHash: sha256(buildReceiptBytes), buildReceiptGitBlob: buildReceiptBlob, privacyReportPath, privacyReportHash: sha256(privacyReportBytes), privacyReportGitBlob: privacyReportBlob };
  element.captureTuple = { status: 'verified', route: 'material-designer://app/app-root', state: 'default', viewport: '64x64', scale: 1, theme: 'light', path: capturePath, captureHash: sha256(captureBytes), captureGitBlob: captureBlob, artifactHash: sha256(artifactBytes), mediaType: 'image/png', width: 64, height: 64, contrast: 21 };
  return { directory, element, receiptDocument, buildReceiptDocument, privacyReportDocument };
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
  expectExactFailure('evidence tiny PE container', 'artifact PE DOS header is invalid', () => validateArtifact(makePortableExecutable().subarray(0, 4096), 'evidence/app.exe'));
  const noSectionPe = makePortableExecutable();
  noSectionPe.writeUInt16LE(0, 0x84 + 2);
  expectExactFailure('evidence PE without sections', 'artifact PE COFF header is invalid', () => validateArtifact(noSectionPe, 'evidence/app.exe'));
  const escapedSectionPe = makePortableExecutable();
  escapedSectionPe.writeUInt32LE(0xfffffff0, 0x80 + 4 + 20 + 0xf0 + 20);
  expectExactFailure('evidence PE section escape', 'artifact PE section 0 bytes are out of bounds', () => validateArtifact(escapedSectionPe, 'evidence/app.exe'));
  validateArtifact(makeStoredZip([
    ['[Content_Types].xml', '<Types/>'],
    ['_rels/.rels', '<Relationships/>'],
    ['app.nuspec', '<package><metadata/></package>'],
    ['lib/net45/app.exe', makePortableExecutable()],
  ]), 'evidence/app.nupkg');
  const emptyZip = Buffer.alloc(52);
  emptyZip.writeUInt32LE(0x04034b50, 0);
  emptyZip.writeUInt32LE(0x06054b50, 30);
  expectExactFailure('evidence empty ZIP', 'artifact ZIP central directory is empty or inconsistent', () => validateArtifact(emptyZip, 'evidence/app.nupkg'));
  expectExactFailure('evidence non-Squirrel ZIP', 'artifact Squirrel package lacks an application payload under lib/net*', () => validateArtifact(makeStoredZip([['[Content_Types].xml', '<Types/>'], ['_rels/.rels', '<Relationships/>'], ['app.nuspec', '<package><metadata/></package>']]), 'evidence/app.nupkg'));
  expectExactFailure('evidence Squirrel package with fake executable', 'artifact PE DOS header is invalid', () => validateArtifact(makeStoredZip([['[Content_Types].xml', '<Types/>'], ['_rels/.rels', '<Relationships/>'], ['app.nuspec', '<package><metadata/></package>'], ['lib/net45/app.exe', Buffer.from('MZ fake')]]), 'evidence/app.nupkg'));
  expectExactFailure('evidence JSON byte bound', 'bounded receipt exceeds byte admission bound', () => parseBoundedJsonBytes(Buffer.alloc(257 * 1024, 0x20), 'bounded receipt', 256 * 1024));
  const scannerBytes = fs.readFileSync(privacyScannerPath);
  const privatePathArtifact = makePortableExecutable();
  privatePathArtifact.write('C:\\Users\\private-user\\secret.txt', 0x2000, 'ascii');
  const privatePathReport = scanEvidencePrivacy({ artifactBytes: privatePathArtifact, captureBytes: makePng(64, 64), scannerBytes });
  expectExactFailure('privacy scanner private path', 'fixture privacy scanner accepted a private path', () => assert(privatePathReport.status === 'pass', 'fixture privacy scanner accepted a private path'));
  assert(scanEvidencePrivacy({ artifactBytes: makePortableExecutable(), captureBytes: makePng(64, 64), scannerBytes }).status === 'pass', 'privacy scanner clean fixture did not return green');
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
    element.interactionReceipt.sourceCommit = element.interactionReceipt.buildSourceCommit;
    expectExactFailure('evidence wrong commit', 'evidence artifact path is not a committed blob at source commit', () => checkVerifiedEvidence(element, 'evidence', registrySchema, directory, directory));
  });
  withEvidenceFixture(registrySchema, {}, ({ directory, element }) => {
    element.interactionReceipt.buildSourceCommit = element.interactionReceipt.sourceCommit;
    expectExactFailure('evidence wrong build source SHA', 'evidence build source tree does not match build source commit', () => checkVerifiedEvidence(element, 'evidence', registrySchema, directory, directory));
  });
  withEvidenceFixture(registrySchema, {}, ({ directory, element }) => {
    element.interactionReceipt.buildSourceTree = '0'.repeat(40);
    expectExactFailure('evidence wrong build source tree', 'evidence build source tree does not match build source commit', () => checkVerifiedEvidence(element, 'evidence', registrySchema, directory, directory));
  });
  withEvidenceFixture(registrySchema, {}, ({ directory, element }) => {
    const tree = gitText(directory, ['rev-parse', `${element.interactionReceipt.buildSourceCommit}^{tree}`]);
    element.interactionReceipt.buildSourceCommit = gitText(directory, ['commit-tree', tree, '-m', 'unrelated source']);
    expectExactFailure('evidence unrelated build source commit', 'evidence build source commit is not an ancestor of source commit', () => checkVerifiedEvidence(element, 'evidence', registrySchema, directory, directory));
  });
  withEvidenceFixture(registrySchema, {}, ({ directory, element }) => {
    fs.appendFileSync(path.join(directory, ...element.interactionReceipt.artifactPath.split('/')), Buffer.from([0]));
    expectExactFailure('evidence working tree only bytes', 'evidence working evidence bytes differ from source commit', () => checkVerifiedEvidence(element, 'evidence', registrySchema, directory, directory));
  });
  withEvidenceFixture(registrySchema, { captureBytes: Buffer.from('not a png') }, ({ directory, element }) => {
    expectExactFailure('evidence fake media', 'capture is not a valid PNG signature', () => checkVerifiedEvidence(element, 'evidence', registrySchema, directory, directory));
  });
  withEvidenceFixture(registrySchema, { captureBytes: Buffer.concat([makePng(64, 64), Buffer.from([0])]) }, ({ directory, element }) => {
    expectExactFailure('evidence PNG trailing bytes', 'capture PNG has trailing bytes after IEND', () => checkVerifiedEvidence(element, 'evidence', registrySchema, directory, directory));
  });
  withEvidenceFixture(registrySchema, { captureBytes: makePng(1, 1) }, ({ directory, element }) => {
    expectExactFailure('evidence trivial PNG', 'capture PNG dimensions are too small for real UI evidence', () => checkVerifiedEvidence(element, 'evidence', registrySchema, directory, directory));
  });
  withEvidenceFixture(registrySchema, { captureBytes: makePng(64, 64, false, true) }, ({ directory, element }) => {
    expectExactFailure('evidence visually trivial PNG', 'capture PNG decoded pixels are empty or visually trivial', () => checkVerifiedEvidence(element, 'evidence', registrySchema, directory, directory));
  });
  withEvidenceFixture(registrySchema, { captureBytes: makePng(64, 64, true) }, ({ directory, element }) => {
    expectExactFailure('evidence PNG privacy metadata', 'evidence.privacyReport.status does not equal schema const', () => checkVerifiedEvidence(element, 'evidence', registrySchema, directory, directory));
  });
  withEvidenceFixture(registrySchema, { artifactBytes: Buffer.from('MZ but no PE header') }, ({ directory, element }) => {
    expectExactFailure('evidence header-only PE', 'artifact PE DOS header is invalid', () => checkVerifiedEvidence(element, 'evidence', registrySchema, directory, directory));
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
    element.interactionReceipt.buildReceiptHash = '0'.repeat(64);
    expectExactFailure('evidence wrong build receipt hash', 'evidence build receipt SHA-256 does not match its file', () => checkVerifiedEvidence(element, 'evidence', registrySchema, directory, directory));
  });
  withEvidenceFixture(registrySchema, {}, ({ directory, element }) => {
    element.interactionReceipt.privacyReportHash = '0'.repeat(64);
    expectExactFailure('evidence wrong privacy report hash', 'evidence privacy report SHA-256 does not match its file', () => checkVerifiedEvidence(element, 'evidence', registrySchema, directory, directory));
  });
  withEvidenceFixture(registrySchema, {}, ({ directory, element }) => {
    element.captureTuple.route = 'material-designer://app/wrong';
    expectExactFailure('evidence route mismatch', 'evidence interaction receipt tuple does not match capture tuple', () => checkVerifiedEvidence(element, 'evidence', registrySchema, directory, directory));
  });
  for (const [label, expected, mutate] of [
    ['state', 'evidence interaction receipt tuple does not match capture tuple', (element) => { element.captureTuple.state = 'changed'; }],
    ['theme', 'evidence interaction receipt tuple does not match capture tuple', (element) => { element.captureTuple.theme = 'dark'; }],
    ['viewport', 'evidence capture dimensions do not equal viewport tuple', (element) => { element.captureTuple.viewport = '320x640'; }],
    ['scale', 'evidence interaction receipt tuple does not match capture tuple', (element) => { element.captureTuple.scale = 2; }],
  ]) withEvidenceFixture(registrySchema, {}, ({ directory, element }) => {
    mutate(element);
    expectExactFailure(`evidence ${label} mismatch`, expected, () => checkVerifiedEvidence(element, 'evidence', registrySchema, directory, directory));
  });
  withEvidenceFixture(registrySchema, {}, ({ directory, element }) => {
    element.captureTuple.artifactHash = '0'.repeat(64);
    expectExactFailure('evidence stale artifact hash', 'evidence capture artifact hash is stale', () => checkVerifiedEvidence(element, 'evidence', registrySchema, directory, directory));
  });
  withEvidenceFixture(registrySchema, { mutatePrivacyReport: (report) => { report.findingCount = 1; report.status = 'fail'; } }, ({ directory, element }) => {
    expectExactFailure('evidence privacy report', 'evidence.privacyReport.status does not equal schema const', () => checkVerifiedEvidence(element, 'evidence', registrySchema, directory, directory));
  });
  withEvidenceFixture(registrySchema, {}, ({ directory, element }) => {
    element.captureTuple.width = 2;
    expectExactFailure('evidence capture dimensions', 'evidence capture media metadata does not match PNG bytes', () => checkVerifiedEvidence(element, 'evidence', registrySchema, directory, directory));
  });
  withEvidenceFixture(registrySchema, {}, ({ directory, element }) => {
    element.contrast.ratio = 5;
    expectExactFailure('evidence contrast mismatch', 'evidence contrast ratio is not derived from committed capture pixels', () => checkVerifiedEvidence(element, 'evidence', registrySchema, directory, directory));
  });
  withEvidenceFixture(registrySchema, { mutateReceipt: (receipt) => { receipt.contrast.foreground.rgb = [1, 1, 1]; } }, ({ directory, element }) => {
    expectExactFailure('evidence contrast sample pixels', 'evidence committed contrast samples do not match capture pixels', () => checkVerifiedEvidence(element, 'evidence', registrySchema, directory, directory));
  });
  withEvidenceFixture(registrySchema, { mutateBuildReceipt: (receipt) => { receipt.inputTreeSha256 = '0'.repeat(64); } }, ({ directory, element }) => {
    expectExactFailure('evidence build input SHA', 'evidence build receipt input SHA does not match source tree', () => checkVerifiedEvidence(element, 'evidence', registrySchema, directory, directory));
  });
  withEvidenceFixture(registrySchema, { mutateBuildReceipt: (receipt) => { receipt.builder.scriptSha256 = '0'.repeat(64); } }, ({ directory, element }) => {
    expectExactFailure('evidence builder script SHA', 'evidence build receipt builder identity does not match build source', () => checkVerifiedEvidence(element, 'evidence', registrySchema, directory, directory));
  });
  withEvidenceFixture(registrySchema, { mutateReceipt: (receipt) => { receipt.buildInputHash = '0'.repeat(64); } }, ({ directory, element }) => {
    expectExactFailure('evidence receipt build provenance', 'evidence receipt build provenance does not match', () => checkVerifiedEvidence(element, 'evidence', registrySchema, directory, directory));
  });
  withEvidenceFixture(registrySchema, { mutatePrivacyReport: (report) => { report.inputSha256 = '0'.repeat(64); } }, ({ directory, element }) => {
    expectExactFailure('evidence privacy input SHA', 'evidence committed privacy report did not pass or match the scanner result', () => checkVerifiedEvidence(element, 'evidence', registrySchema, directory, directory));
  });
  withEvidenceFixture(registrySchema, { mutatePrivacyReport: (report) => { report.scanner.sha256 = '0'.repeat(64); } }, ({ directory, element }) => {
    expectExactFailure('evidence privacy scanner SHA', 'evidence committed privacy scanner identity does not match source commit', () => checkVerifiedEvidence(element, 'evidence', registrySchema, directory, directory));
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
  expectExactFailure('JSON string admission bound', 'bounded receipt JSON string exceeds admission bound', () => parseBoundedJsonBytes(Buffer.from(JSON.stringify('x'.repeat(JSON_LIMITS.receipt.maxString + 1))), 'bounded receipt'));
  expectExactFailure('JSON array admission bound', 'bounded receipt JSON array exceeds admission bound', () => parseBoundedJsonBytes(Buffer.from(JSON.stringify(Array(JSON_LIMITS.receipt.maxArray + 1).fill(0))), 'bounded receipt'));
  expectExactFailure('JSON nesting admission bound', 'bounded receipt JSON nesting exceeds admission bound', () => parseBoundedJsonBytes(Buffer.from(`${'['.repeat(JSON_LIMITS.receipt.maxDepth + 1)}0${']'.repeat(JSON_LIMITS.receipt.maxDepth + 1)}`), 'bounded receipt'));
  expectExactFailure('JSON property admission bound', 'bounded receipt JSON property count exceeds admission bound', () => parseBoundedJsonBytes(Buffer.from(JSON.stringify(Object.fromEntries(Array.from({ length: JSON_LIMITS.receipt.maxProperties + 1 }, (_, index) => [`p${index}`, 0])))), 'bounded receipt'));
  runAstFixtureNegatives(parser);
  runEvidenceNegatives(registrySchema);
  validateAll(registry, registrySchema, inventory, ownerSchema, desktop, desktopSchema, site, siteSchema, { parser, discovered });
  process.stdout.write(`GREEN after restoring ${negativeCaseCount} exact AST, classification, schema, evidence, privacy, contrast, and tuple boundaries\n`);
}

try {
  if (process.argv.includes('--seal-schema-bounds')) sealAllSchemaBounds();
  else if (process.argv.includes('--refresh-classifications')) refreshClassifications();
  else if (process.argv.includes('--negative')) runNegative();
  else {
    const result = validateAll(readJson(registryPath), readJson(registrySchemaPath), readJson(ownerPath), readJson(ownerSchemaPath), readJson(desktopPath), readJson(desktopSchemaPath), readJson(sitePath), readJson(siteSchemaPath));
    process.stdout.write(`every-element registry green: ${JSON.stringify(result)}\n`);
  }
} catch (error) {
  process.stderr.write(`every-element registry red: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

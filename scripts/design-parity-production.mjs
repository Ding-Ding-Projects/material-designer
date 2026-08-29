import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join, parse, relative, resolve } from 'node:path';
import { readStrictJson, readStrictJsonWithSchema, validateJsonSchema } from './strict-json.mjs';

export const CANONICAL_PARITY_REFERENCE_PATH = 'mockups/open-design-m3/Open Design M3.dc.html';
export const CANONICAL_PARITY_DEPENDENCY_PATHS = Object.freeze([
  'mockups/open-design-m3/support.js',
  'mockups/open-design-m3/assets/logo.svg',
  'mockups/open-design-m3/assets/brand-icon.svg',
  'tools/design-reference-app/font-runtime.css',
  'design/apps/web/public/fonts/roboto-flex/roboto-flex-latin.woff2',
  'design/apps/web/public/fonts/roboto-mono/roboto-mono-latin.woff2',
  'design/apps/web/public/fonts/material-symbols/material-symbols-rounded.woff2',
]);

const REGISTRY_FILES = Object.freeze({
  inventory: '.codex/verification/design-parity/inventory.json',
  inventorySchema: '.codex/verification/design-parity/inventory.schema.json',
  routes: '.codex/verification/design-parity/routes.json',
  routesSchema: '.codex/verification/design-parity/routes.schema.json',
});
const SHA256 = /^[0-9a-f]{64}$/;

function fail(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  throw error;
}

function requireValue(condition, code, message) {
  if (!condition) fail(code, message);
}

function normalizedPathIdentity(path) {
  const normalized = resolve(path).replace(/^\\\\\?\\/, '').replace(/[\\/]+$/, '');
  return process.platform === 'win32' ? normalized.toLocaleLowerCase('en-US') : normalized;
}

function realPath(path) {
  return typeof realpathSync.native === 'function' ? realpathSync.native(path) : realpathSync(path);
}

function pathComponents(path) {
  const absolute = resolve(path);
  const root = parse(absolute).root;
  const rest = absolute.slice(root.length).split(/[\\/]/).filter(Boolean);
  const result = [];
  let cursor = root;
  for (const component of rest) {
    cursor = join(cursor, component);
    result.push(cursor);
  }
  return result;
}

export function assertNoPathIndirection(path, { code = 'path.reparse', requireFile = false, requireExists = true } = {}) {
  const absolute = resolve(path);
  for (const component of pathComponents(absolute)) {
    if (!existsSync(component)) break;
    const info = lstatSync(component);
    if (info.isSymbolicLink() || info.isBlockDevice() || info.isCharacterDevice() || info.isFIFO() || info.isSocket()) {
      fail(code, `${path} contains a symbolic-link, device, socket, or reparse component`);
    }
    const canonical = realPath(component);
    if (normalizedPathIdentity(canonical) !== normalizedPathIdentity(component)) {
      fail(code, `${path} contains a junction, mount point, reparse point, or realpath indirection`);
    }
  }
  if (requireExists) requireValue(existsSync(absolute), `${code}.missing`, `${path} is missing`);
  if (requireFile) requireValue(existsSync(absolute) && lstatSync(absolute).isFile(), `${code}.file`, `${path} is not a regular file`);
  return absolute;
}

export function resolvePinnedParityFile(repositoryRoot, relativePath, expectedSha256, { code = 'reference.input' } = {}) {
  requireValue(typeof relativePath === 'string' && relativePath.length > 0 && !isAbsolute(relativePath), `${code}.path`, 'path must be repository-relative');
  requireValue(SHA256.test(expectedSha256), `${code}.hash`, `${relativePath} has no exact SHA-256 pin`);
  const root = assertNoPathIndirection(repositoryRoot, { code: `${code}.root` });
  const absolute = resolve(root, relativePath);
  const fromRoot = relative(root, absolute);
  requireValue(fromRoot.length > 0 && fromRoot !== '..' && !fromRoot.startsWith(`..\\`) && !fromRoot.startsWith('../') && !isAbsolute(fromRoot), `${code}.escape`, `${relativePath} escapes the repository root`);
  assertNoPathIndirection(absolute, { code: `${code}.reparse`, requireFile: true });
  const actualSha256 = createHash('sha256').update(readFileSync(absolute)).digest('hex');
  requireValue(actualSha256 === expectedSha256, `${code}.stale`, `${relativePath} does not match its exact SHA-256 pin`);
  return Object.freeze({ path: relativePath, absolutePath: absolute, sha256: actualSha256 });
}

export function loadValidatedParityRegistries(repositoryRoot) {
  const inventorySchemaPath = resolvePinnedRegistryPath(repositoryRoot, REGISTRY_FILES.inventorySchema);
  const routesSchemaPath = resolvePinnedRegistryPath(repositoryRoot, REGISTRY_FILES.routesSchema);
  const inventoryPath = resolvePinnedRegistryPath(repositoryRoot, REGISTRY_FILES.inventory);
  const routesPath = resolvePinnedRegistryPath(repositoryRoot, REGISTRY_FILES.routes);
  const inventory = readStrictJsonWithSchema(inventoryPath, inventorySchemaPath);
  const routes = readStrictJsonWithSchema(routesPath, routesSchemaPath);
  return deepFreezeParityValue({ inventory, routes });
}

export function validateParityRegistriesAgainstSchemas(repositoryRoot, inventory, routes) {
  const inventorySchemaPath = resolvePinnedRegistryPath(repositoryRoot, REGISTRY_FILES.inventorySchema);
  const routesSchemaPath = resolvePinnedRegistryPath(repositoryRoot, REGISTRY_FILES.routesSchema);
  const inventorySchema = readStrictJson(inventorySchemaPath);
  const routesSchema = readStrictJson(routesSchemaPath);
  validateJsonSchema(inventory, inventorySchema, { source: REGISTRY_FILES.inventory, schemaSource: inventorySchemaPath });
  validateJsonSchema(routes, routesSchema, { source: REGISTRY_FILES.routes, schemaSource: routesSchemaPath });
  return true;
}

function resolvePinnedRegistryPath(repositoryRoot, relativePath) {
  const root = assertNoPathIndirection(repositoryRoot, { code: 'registry.root' });
  const absolute = resolve(root, relativePath);
  const fromRoot = relative(root, absolute);
  requireValue(fromRoot.length > 0 && fromRoot !== '..' && !fromRoot.startsWith(`..\\`) && !fromRoot.startsWith('../') && !isAbsolute(fromRoot), 'registry.path', `${relativePath} escapes the repository root`);
  return assertNoPathIndirection(absolute, { code: 'registry.reparse', requireFile: true });
}

export function pinCanonicalParityReferenceGraph(repositoryRoot, inventory, routes) {
  requireValue(inventory?.reference?.path === CANONICAL_PARITY_REFERENCE_PATH, 'reference.path', 'inventory reference path is not canonical');
  requireValue(routes?.reference === CANONICAL_PARITY_REFERENCE_PATH, 'reference.path', 'route registry reference path is not canonical');
  const declaredPaths = (inventory.reference.dependencies ?? []).map((item) => item.path);
  requireValue(JSON.stringify(declaredPaths) === JSON.stringify(CANONICAL_PARITY_DEPENDENCY_PATHS), 'reference.dependencies', 'reference dependency paths are missing, duplicated, extra, or reordered');
  const seenHashes = new Set();
  const reference = resolvePinnedParityFile(repositoryRoot, inventory.reference.path, inventory.reference.sha256, { code: 'reference.file' });
  const dependencies = inventory.reference.dependencies.map((dependency, index) => {
    requireValue(dependency.path === CANONICAL_PARITY_DEPENDENCY_PATHS[index], 'reference.dependencies', 'reference dependency order is not canonical');
    requireValue(!seenHashes.has(`${dependency.path}\u001f${dependency.sha256}`), 'reference.dependencies', `duplicate reference dependency ${dependency.path}`);
    seenHashes.add(`${dependency.path}\u001f${dependency.sha256}`);
    return resolvePinnedParityFile(repositoryRoot, dependency.path, dependency.sha256, { code: 'reference.dependency' });
  });
  return deepFreezeParityValue({ reference, dependencies });
}

export function deepFreezeParityValue(value, seen = new WeakSet()) {
  if (value && typeof value === 'object' && !seen.has(value)) {
    seen.add(value);
    for (const key of Reflect.ownKeys(value)) deepFreezeParityValue(value[key], seen);
    Object.freeze(value);
  }
  return value;
}

export function loadAndPinParityRegistries(repositoryRoot) {
  const registries = loadValidatedParityRegistries(repositoryRoot);
  const pinnedReference = pinCanonicalParityReferenceGraph(repositoryRoot, registries.inventory, registries.routes);
  return deepFreezeParityValue({ ...registries, pinnedReference });
}

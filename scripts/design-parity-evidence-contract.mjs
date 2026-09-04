import { statSync } from 'node:fs';
import { readStrictJson, validateJsonSchema } from './strict-json.mjs';
import { deepFreezeParityValue, resolvePinnedParityFile, resolvePinnedParityFileUnderRoot } from './design-parity-production.mjs';
import {
  createObservedParityWitness,
  requireParityWitnessMatch,
} from '../tools/design-reference-app/parity-route-contract.mjs';

const SHA256 = '^[0-9a-f]{64}$';
const COMMIT = '^[0-9a-f]{40}$';
const RELATIVE_PATH = '^(?![A-Za-z]:[\\\\/]|[\\\\/]).+';
const APPLICATION_PACKAGE_IDENTITY = 'open-design-packaged-app';
const APPLICATION_ARCHITECTURE = 'x64';
const APPLICATION_VERSION = '^[0-9]+\\.[0-9]+\\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$';
const APPLICATION_MANIFEST_SCHEMA_NAME = 'design-parity-application-artifact-manifest-v1';
const EVIDENCE_ROOT = '.codex/verification/evidence/';
const APPLICATION_EVIDENCE_LOG_ROOT = `${EVIDENCE_ROOT}application-artifact/logs/`;
const APPLICATION_EVIDENCE_LOG_PATTERN = '^\\.codex/verification/evidence/application-artifact/logs/[^/\\\\]+\\.log$';
const MAX_APPLICATION_EVIDENCE_LOG_BYTES = 16 * 1024 * 1024;
const TUPLE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['screen', 'state', 'theme', 'viewport', 'scale', 'locale', 'fixtureRevision', 'time', 'motion', 'randomSeed', 'fonts', 'network'],
  properties: {
    screen: { type: 'string', minLength: 1 },
    state: { enum: ['default', 'appearance'] },
    theme: { enum: ['light', 'dark'] },
    viewport: { type: 'object', additionalProperties: false, required: ['width', 'height'], properties: { width: { type: 'integer', minimum: 1 }, height: { type: 'integer', minimum: 1 } } },
    scale: { type: 'number', exclusiveMinimum: 0 },
    locale: { type: 'string', minLength: 1 },
    fixtureRevision: { type: 'string', minLength: 1 },
    time: { type: 'string', minLength: 1 },
    motion: { const: 'frozen' },
    randomSeed: { type: 'integer' },
    fonts: { type: 'string', minLength: 1 },
    network: { const: 'disabled' },
  },
};
const RENDERER_WITNESS_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['routeId', 'routePath', 'routeState', 'fixtureSource', 'fixturePath', 'fixtureRevision', 'fixtureSha256'],
  properties: {
    routeId: { type: 'string', minLength: 1 }, routePath: { type: 'string', minLength: 1 }, routeState: { type: 'string', minLength: 1 },
    fixtureSource: { type: 'string', minLength: 1 }, fixturePath: { type: 'string', minLength: 1, pattern: RELATIVE_PATH }, fixtureRevision: { type: 'string', minLength: 1 },
    fixtureSha256: { type: 'string', pattern: SHA256 },
  },
};
const CAPTURE_SETTLED_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['settled', 'routePath', 'revision'],
  properties: { settled: { const: true }, routePath: { type: 'string', minLength: 1 }, revision: { const: 'capture-settled-v1' } },
};
const WITNESS_PROPERTIES = {
  version: { const: 1 }, surfaceId: { const: 'desktop-application' }, featureId: { type: 'string', minLength: 1 }, routeId: { type: 'string', minLength: 1 },
  screen: { type: 'string', minLength: 1 }, state: { type: 'string', minLength: 1 }, theme: { enum: ['light', 'dark'] }, locale: { type: 'string', minLength: 1 },
  viewportWidth: { type: 'integer', minimum: 1 }, viewportHeight: { type: 'integer', minimum: 1 }, displayScale: { type: 'number', exclusiveMinimum: 0 },
  fixtureRevision: { type: 'string', minLength: 1 }, frozenTime: { type: 'string', minLength: 1 }, motion: { const: 'frozen' }, randomSeed: { type: 'integer' },
  bundledFontRevision: { type: 'string', minLength: 1 }, network: { const: 'disabled' }, headlessRoute: { const: 'cheap-lowlevel-headless' },
  rendererWitness: RENDERER_WITNESS_SCHEMA, captureSettledWitness: CAPTURE_SETTLED_SCHEMA,
};
const WITNESS_REQUIRED = Object.keys(WITNESS_PROPERTIES);

export const DESIGN_PARITY_RECEIPT_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['version', 'schema', 'side', 'rowId', 'intendedSourceCommit', 'sourceCommit', 'artifact', 'captureTuple', 'tuple', 'route', 'witness', 'inspection', 'tool', 'pngSha256', 'dimensions', 'semanticStateValidated', 'nonblankValidated', 'privacyValidated'],
  properties: {
    version: { const: 1 }, schema: { const: 'design-parity-receipt-v1' }, side: { enum: ['reference', 'application'] }, rowId: { type: 'string', minLength: 1 },
    intendedSourceCommit: { type: 'string', pattern: COMMIT },
    sourceCommit: { type: 'string', pattern: COMMIT },
    artifact: {
      type: 'object', additionalProperties: false,
      required: ['path', 'sha256', 'bytes', 'builtFromCommit'],
      properties: {
        path: { type: 'string', minLength: 1, pattern: RELATIVE_PATH }, sha256: { type: 'string', pattern: SHA256 }, bytes: { type: 'integer', minimum: 1 }, builtFromCommit: { type: 'string', pattern: COMMIT },
        package: { type: 'object', additionalProperties: false, required: ['identity', 'version', 'architecture'], properties: { identity: { const: APPLICATION_PACKAGE_IDENTITY }, version: { type: 'string', pattern: APPLICATION_VERSION }, architecture: { const: APPLICATION_ARCHITECTURE } } },
        provenance: { type: 'object', additionalProperties: false, required: ['path', 'sha256'], properties: { path: { type: 'string', minLength: 1, pattern: RELATIVE_PATH }, sha256: { type: 'string', pattern: SHA256 } } },
        manifest: { type: 'object', additionalProperties: false, required: ['path', 'sha256'], properties: { path: { type: 'string', minLength: 1, pattern: RELATIVE_PATH }, sha256: { type: 'string', pattern: SHA256 } } },
        buildLog: { type: 'object', additionalProperties: false, required: ['path', 'sha256', 'bytes'], properties: { path: { type: 'string', pattern: APPLICATION_EVIDENCE_LOG_PATTERN }, sha256: { type: 'string', pattern: SHA256 }, bytes: { type: 'integer', minimum: 1, maximum: MAX_APPLICATION_EVIDENCE_LOG_BYTES } } },
      },
    },
    captureTuple: { type: 'object', additionalProperties: false, required: ['route', 'headlessRoute'], properties: { route: { type: 'string', minLength: 1 }, headlessRoute: { const: 'cheap-lowlevel-headless' } } },
    tuple: TUPLE_SCHEMA, route: { type: 'string', minLength: 1 },
    witness: { type: 'object', additionalProperties: false, required: WITNESS_REQUIRED, properties: WITNESS_PROPERTIES },
    inspection: { type: 'object', additionalProperties: false, required: ['originalOpened', 'semanticStateConfirmed', 'clippingChecked', 'visualDefectIds', 'originalImagePath', 'method'], properties: { originalOpened: { const: true }, semanticStateConfirmed: { const: true }, clippingChecked: { const: true }, visualDefectIds: { type: 'array', uniqueItems: true, items: { type: 'string', minLength: 1 } }, originalImagePath: { type: 'string', minLength: 1, pattern: RELATIVE_PATH }, method: { type: 'string', minLength: 1 } } },
    tool: { type: 'object', additionalProperties: false, required: ['name', 'version'], properties: { name: { enum: ['cheap-lowlevel-headless', 'lowlevel-computer-use-cheap', 'design-reference-electron', 'electron-capture-page'] }, version: { type: 'string', minLength: 1 } } },
    pngSha256: { type: 'string', pattern: SHA256 }, dimensions: { type: 'object', additionalProperties: false, required: ['width', 'height'], properties: { width: { type: 'integer', minimum: 1 }, height: { type: 'integer', minimum: 1 } } },
    semanticStateValidated: { const: true }, nonblankValidated: { const: true }, privacyValidated: { const: true },
  },
});

const BUILD_PROVENANCE_SCHEMA = Object.freeze({
  type: 'object', additionalProperties: false,
  required: ['version', 'provenanceStatus', 'packagingCommand', 'cleanOutput', 'package', 'buildLog', 'signing', 'sourceCommit', 'builtAt'],
  properties: {
    version: { const: 1 }, provenanceStatus: { const: 'verified' }, sourceCommit: { type: 'string', pattern: COMMIT },
    packagingCommand: { type: 'string', minLength: 1 }, cleanOutput: { const: true }, builtAt: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\\.[0-9]+)?Z$' },
    package: { type: 'object', additionalProperties: false, required: ['id', 'version', 'architecture'], properties: { id: { const: APPLICATION_PACKAGE_IDENTITY }, version: { type: 'string', pattern: APPLICATION_VERSION }, architecture: { const: APPLICATION_ARCHITECTURE } } },
    buildLog: { type: 'object', additionalProperties: false, required: ['path', 'sha256', 'bytes'], properties: { path: { type: 'string', pattern: APPLICATION_EVIDENCE_LOG_PATTERN }, sha256: { type: 'string', pattern: SHA256 }, bytes: { type: 'integer', minimum: 1, maximum: MAX_APPLICATION_EVIDENCE_LOG_BYTES } } },
    signing: {
      type: 'object', additionalProperties: false,
      required: ['inputsCleared', 'certificateAutoDiscoveryDisabled', 'processAuditComplete', 'signerInvocationCount', 'observedSignerInvocations', 'controls'],
      properties: {
        inputsCleared: { const: true }, certificateAutoDiscoveryDisabled: { const: true }, processAuditComplete: { const: true }, signerInvocationCount: { const: 0 },
        observedSignerInvocations: { type: 'array', maxItems: 0, items: { type: 'string' } },
        controls: { type: 'object', additionalProperties: false, required: ['forceCodeSigning', 'signExecutable', 'signAndEditExecutable'], properties: { forceCodeSigning: { const: false }, signExecutable: { const: false }, signAndEditExecutable: { const: false } } },
      },
    },
  },
});

function fail(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  throw error;
}

function equal(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function requireExpected(expected, fields, code) {
  for (const field of fields) {
    if (expected?.[field] === undefined || expected[field] === null || expected[field] === '') fail(code, `expected ${field} binding is mandatory`);
  }
}

export function validateApplicationArtifactManifest(manifest, schema, expected) {
  validateJsonSchema(manifest, schema, { source: `${expected.rowId} application artifact manifest`, schemaSource: 'application-artifact-manifest.schema.json' });
  requireExpected(expected, ['rowId', 'rowSourceCommit', 'intendedSourceCommit'], 'artifact.expected_binding');
  if (manifest.version !== 1 || manifest.schema !== APPLICATION_MANIFEST_SCHEMA_NAME || manifest.rowId !== expected.rowId) fail('artifact.manifest', 'artifact manifest version, schema, or row identity is mismatched');
  if (expected.rowSourceCommit !== expected.intendedSourceCommit) fail('artifact.row_source_commit', 'row source commit differs from the explicit intended source commit');
  if (manifest.intendedSourceCommit !== expected.intendedSourceCommit || manifest.builtFromCommit !== expected.intendedSourceCommit) fail('artifact.source_commit', 'artifact manifest source or built-from commit is mismatched');
  if (manifest.artifact.package.identity !== APPLICATION_PACKAGE_IDENTITY || manifest.artifact.package.architecture !== APPLICATION_ARCHITECTURE) fail('artifact.package_identity', 'artifact package identity or architecture is mismatched');
  return manifest;
}

export function validateApplicationArtifactEvidence(repositoryRoot, { schema, manifestPath, manifestSha256, rowId, rowSourceCommit, intendedSourceCommit }) {
  requireExpected({ schema, manifestPath, manifestSha256, rowId, rowSourceCommit, intendedSourceCommit }, ['schema', 'manifestPath', 'manifestSha256', 'rowId', 'rowSourceCommit', 'intendedSourceCommit'], 'artifact.expected_binding');
  const rowRoot = `${EVIDENCE_ROOT}${rowId}/`;
  const applicationRoot = `${EVIDENCE_ROOT}application-artifact/`;
  const expectedManifestPath = `${rowRoot}application.artifact-manifest.json`;
  if (manifestPath !== expectedManifestPath) fail('artifact.manifest_path', 'application artifact manifest target is not canonical for the row');
  const pinnedManifest = resolvePinnedParityFile(repositoryRoot, manifestPath, manifestSha256, { code: 'artifact.manifest' });
  const manifest = validateApplicationArtifactManifest(readStrictJson(pinnedManifest.absolutePath), schema, { rowId, rowSourceCommit, intendedSourceCommit });
  if (!manifest.artifact.path.startsWith(`${applicationRoot}artifacts/`) || !manifest.provenance.path.startsWith(`${applicationRoot}provenance/`)) fail('artifact.evidence_root', 'artifact or provenance path is outside the canonical application evidence root');
  const pinnedArtifact = resolvePinnedParityFile(repositoryRoot, manifest.artifact.path, manifest.artifact.sha256, { code: 'artifact.file' });
  const artifactBytes = statSync(pinnedArtifact.absolutePath).size;
  if (artifactBytes !== manifest.artifact.bytes) fail('artifact.bytes', 'artifact byte count differs from the manifest');
  const pinnedProvenance = resolvePinnedParityFile(repositoryRoot, manifest.provenance.path, manifest.provenance.sha256, { code: 'artifact.provenance' });
  const provenance = readStrictJson(pinnedProvenance.absolutePath);
  validateJsonSchema(provenance, BUILD_PROVENANCE_SCHEMA, { source: manifest.provenance.path, schemaSource: 'BUILD_PROVENANCE_SCHEMA' });
  if (Number.isNaN(Date.parse(provenance.builtAt))) fail('artifact.provenance_time', 'build provenance timestamp is not a valid UTC instant');
  if (provenance.sourceCommit !== intendedSourceCommit || provenance.package.id !== manifest.artifact.package.identity || provenance.package.version !== manifest.artifact.package.version || provenance.package.architecture !== manifest.artifact.package.architecture) fail('artifact.provenance_binding', 'build provenance source or package identity differs from the artifact manifest');
  if (!provenance.buildLog.path.startsWith(APPLICATION_EVIDENCE_LOG_ROOT)) fail('artifact.build_log_path', 'build log path is outside the canonical application evidence log root');
  const pinnedBuildLog = resolvePinnedParityFileUnderRoot(repositoryRoot, APPLICATION_EVIDENCE_LOG_ROOT, provenance.buildLog.path, provenance.buildLog.sha256, { code: 'artifact.build_log', minBytes: 1, maxBytes: MAX_APPLICATION_EVIDENCE_LOG_BYTES });
  if (pinnedBuildLog.bytes !== provenance.buildLog.bytes) fail('artifact.build_log_bytes', 'build log byte count differs from provenance');
  return deepFreezeParityValue({
    intendedSourceCommit,
    builtFromCommit: manifest.builtFromCommit,
    manifest: { path: manifestPath, sha256: manifestSha256 },
    artifact: { path: manifest.artifact.path, sha256: manifest.artifact.sha256, bytes: manifest.artifact.bytes },
    package: manifest.artifact.package,
    provenance: manifest.provenance,
    buildLog: { path: provenance.buildLog.path, sha256: provenance.buildLog.sha256, bytes: provenance.buildLog.bytes },
  });
}

export function validateDesignParityReceipt(receipt, expected) {
  requireExpected(expected, ['side', 'rowId', 'intendedSourceCommit', 'sourceCommit', 'route', 'routePath', 'tuple', 'pngSha256', 'dimensions', 'rawPath', 'fixtureSource', 'fixturePath', 'fixtureSha256', 'artifactPath', 'artifactSha256', 'artifactBytes'], 'receipt.expected_binding');
  validateJsonSchema(receipt, DESIGN_PARITY_RECEIPT_SCHEMA, { source: `${expected.side} parity receipt`, schemaSource: 'DESIGN_PARITY_RECEIPT_SCHEMA' });
  if (expected.sourceCommit !== expected.intendedSourceCommit) fail('receipt.expected_source', 'expected source commit differs from the explicit intended source commit');
  if (receipt.side !== expected.side || receipt.rowId !== expected.rowId || receipt.intendedSourceCommit !== expected.intendedSourceCommit || receipt.sourceCommit !== expected.intendedSourceCommit || receipt.artifact.builtFromCommit !== expected.intendedSourceCommit) fail('receipt.identity', 'receipt side, row, intended source, source, or artifact commit is mismatched');
  if (receipt.route !== expected.route || receipt.captureTuple.route !== expected.route || receipt.captureTuple.headlessRoute !== 'cheap-lowlevel-headless') fail('receipt.route', 'receipt route or headless route is mismatched');
  if (!equal(receipt.tuple, expected.tuple)) fail('receipt.tuple', 'receipt tuple is mismatched');
  if (receipt.pngSha256 !== expected.pngSha256 || !equal(receipt.dimensions, expected.dimensions)) fail('receipt.png', 'receipt PNG hash or dimensions are mismatched');
  if (receipt.inspection.originalImagePath !== expected.rawPath) fail('receipt.inspection', 'receipt original-image inspection path is mismatched');
  if (receipt.artifact.path !== expected.artifactPath || receipt.artifact.sha256 !== expected.artifactSha256 || receipt.artifact.bytes !== expected.artifactBytes) fail('receipt.artifact', 'receipt artifact path, hash, or byte count is mismatched');
  if (expected.side === 'application') {
    requireExpected(expected, ['artifactManifestPath', 'artifactManifestSha256', 'provenancePath', 'provenanceSha256', 'packageIdentity', 'packageVersion', 'packageArchitecture', 'buildLogPath', 'buildLogSha256', 'buildLogBytes'], 'receipt.expected_application_binding');
    if (!receipt.artifact.package || !receipt.artifact.provenance || !receipt.artifact.manifest || !receipt.artifact.buildLog) fail('receipt.application_binding', 'application receipt omits package, provenance, manifest, or build-log binding');
    if (receipt.artifact.package.identity !== expected.packageIdentity || receipt.artifact.package.version !== expected.packageVersion || receipt.artifact.package.architecture !== expected.packageArchitecture) fail('receipt.package', 'application receipt package identity, version, or architecture is mismatched');
    if (receipt.artifact.provenance.path !== expected.provenancePath || receipt.artifact.provenance.sha256 !== expected.provenanceSha256) fail('receipt.provenance', 'application receipt provenance path or hash is mismatched');
    if (receipt.artifact.manifest.path !== expected.artifactManifestPath || receipt.artifact.manifest.sha256 !== expected.artifactManifestSha256) fail('receipt.manifest', 'application receipt manifest path or hash is mismatched');
    if (receipt.artifact.buildLog.path !== expected.buildLogPath || receipt.artifact.buildLog.sha256 !== expected.buildLogSha256 || receipt.artifact.buildLog.bytes !== expected.buildLogBytes) fail('receipt.build_log', 'application receipt build-log path, hash, or byte count is mismatched');
  }
  const expectedRoute = {
    id: expected.rowId,
    browserPath: expected.routePath,
    tuple: expected.tuple,
    identity: { surfaceId: 'desktop-application', headlessRoute: 'cheap-lowlevel-headless' },
  };
  const expectedRendererWitness = {
    routeId: expected.rowId,
    routePath: expected.routePath,
    routeState: expected.tuple.state,
    fixtureSource: expected.fixtureSource,
    fixturePath: expected.fixturePath,
    fixtureRevision: expected.tuple.fixtureRevision,
    fixtureSha256: expected.fixtureSha256,
  };
  const expectedCaptureSettledWitness = { settled: true, routePath: expected.routePath, revision: 'capture-settled-v1' };
  const expectedWitness = createObservedParityWitness(expectedRoute, { rendererWitness: expectedRendererWitness, captureSettledWitness: expectedCaptureSettledWitness });
  requireParityWitnessMatch(expectedWitness, receipt.witness);
  return Object.freeze({ ok: true, side: receipt.side, rowId: receipt.rowId, intendedSourceCommit: receipt.intendedSourceCommit, sourceCommit: receipt.sourceCommit });
}

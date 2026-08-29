import { validateJsonSchema } from './strict-json.mjs';
import {
  createObservedParityWitness,
  requireParityWitnessMatch,
} from '../tools/design-reference-app/parity-route-contract.mjs';

const SHA256 = '^[0-9a-f]{64}$';
const COMMIT = '^[0-9a-f]{40}$';
const RELATIVE_PATH = '^(?![A-Za-z]:[\\\\/]|[\\\\/]).+';
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
  required: ['version', 'schema', 'side', 'rowId', 'sourceCommit', 'artifact', 'captureTuple', 'tuple', 'route', 'witness', 'inspection', 'tool', 'pngSha256', 'dimensions', 'semanticStateValidated', 'nonblankValidated', 'privacyValidated'],
  properties: {
    version: { const: 1 }, schema: { const: 'design-parity-receipt-v1' }, side: { enum: ['reference', 'application'] }, rowId: { type: 'string', minLength: 1 },
    sourceCommit: { type: 'string', pattern: COMMIT },
    artifact: { type: 'object', additionalProperties: false, required: ['path', 'sha256', 'builtFromCommit'], properties: { path: { type: 'string', minLength: 1, pattern: RELATIVE_PATH }, sha256: { type: 'string', pattern: SHA256 }, builtFromCommit: { type: 'string', pattern: COMMIT } } },
    captureTuple: { type: 'object', additionalProperties: false, required: ['route', 'headlessRoute'], properties: { route: { type: 'string', minLength: 1 }, headlessRoute: { const: 'cheap-lowlevel-headless' } } },
    tuple: TUPLE_SCHEMA, route: { type: 'string', minLength: 1 },
    witness: { type: 'object', additionalProperties: false, required: WITNESS_REQUIRED, properties: WITNESS_PROPERTIES },
    inspection: { type: 'object', additionalProperties: false, required: ['originalOpened', 'semanticStateConfirmed', 'clippingChecked', 'visualDefectIds', 'originalImagePath', 'method'], properties: { originalOpened: { const: true }, semanticStateConfirmed: { const: true }, clippingChecked: { const: true }, visualDefectIds: { type: 'array', uniqueItems: true, items: { type: 'string', minLength: 1 } }, originalImagePath: { type: 'string', minLength: 1, pattern: RELATIVE_PATH }, method: { type: 'string', minLength: 1 } } },
    tool: { type: 'object', additionalProperties: false, required: ['name', 'version'], properties: { name: { enum: ['cheap-lowlevel-headless', 'lowlevel-computer-use-cheap', 'design-reference-electron', 'electron-capture-page'] }, version: { type: 'string', minLength: 1 } } },
    pngSha256: { type: 'string', pattern: SHA256 }, dimensions: { type: 'object', additionalProperties: false, required: ['width', 'height'], properties: { width: { type: 'integer', minimum: 1 }, height: { type: 'integer', minimum: 1 } } },
    semanticStateValidated: { const: true }, nonblankValidated: { const: true }, privacyValidated: { const: true },
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

export function validateDesignParityReceipt(receipt, expected) {
  validateJsonSchema(receipt, DESIGN_PARITY_RECEIPT_SCHEMA, { source: `${expected.side} parity receipt`, schemaSource: 'DESIGN_PARITY_RECEIPT_SCHEMA' });
  if (receipt.side !== expected.side || receipt.rowId !== expected.rowId || receipt.sourceCommit !== expected.sourceCommit || receipt.artifact.builtFromCommit !== expected.sourceCommit) fail('receipt.identity', 'receipt side, row, source, or artifact commit is mismatched');
  if (receipt.route !== expected.route || receipt.captureTuple.route !== expected.route || receipt.captureTuple.headlessRoute !== 'cheap-lowlevel-headless') fail('receipt.route', 'receipt route or headless route is mismatched');
  if (!equal(receipt.tuple, expected.tuple)) fail('receipt.tuple', 'receipt tuple is mismatched');
  if (receipt.pngSha256 !== expected.pngSha256 || !equal(receipt.dimensions, expected.dimensions)) fail('receipt.png', 'receipt PNG hash or dimensions are mismatched');
  if (receipt.inspection.originalImagePath !== expected.rawPath) fail('receipt.inspection', 'receipt original-image inspection path is mismatched');
  if (expected.artifactPath !== undefined && receipt.artifact.path !== expected.artifactPath) fail('receipt.artifact', 'receipt artifact path is mismatched');
  if (expected.artifactSha256 !== undefined && receipt.artifact.sha256 !== expected.artifactSha256) fail('receipt.artifact', 'receipt artifact hash is mismatched');
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
  return Object.freeze({ ok: true, side: receipt.side, rowId: receipt.rowId, sourceCommit: receipt.sourceCommit });
}

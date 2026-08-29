import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import {
  validateApplicationArtifactEvidence,
  validateApplicationArtifactManifest,
  validateDesignParityReceipt,
} from './design-parity-evidence-contract.mjs';
import { validatePng } from './design-parity-png.mjs';
import { crc32 } from './design-parity-png-crc.mjs';
import { readStrictJson } from './strict-json.mjs';
import { createObservedParityWitness } from '../tools/design-reference-app/parity-route-contract.mjs';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));

const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
function chunk(type, data) {
  const name = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}
function ihdr(width, height, colorType = 6) {
  const value = Buffer.alloc(13);
  value.writeUInt32BE(width, 0); value.writeUInt32BE(height, 4); value[8] = 8; value[9] = colorType;
  return value;
}
function png(chunks) {
  return Buffer.concat([signature, ...chunks]);
}
function rgba(pixel, filter = 0) {
  return png([chunk('IHDR', ihdr(1, 1)), chunk('IDAT', deflateSync(Buffer.from([filter, ...pixel]))), chunk('IEND', Buffer.alloc(0))]);
}
function expectPngFailure(input, expected, code) {
  assert.throws(() => validatePng(input, { code }), (error) => error.code === `${code}.${expected}`);
}

const forged24 = Buffer.alloc(24); signature.copy(forged24); forged24.writeUInt32BE(0xffffffff, 8); Buffer.from('IHDR').copy(forged24, 12);
assert.throws(() => validatePng(forged24, { code: 'png.forged24' }), (error) => error.code === 'png.forged24.chunk_bounds');
assert.equal(validatePng(rgba([0, 0, 0, 0]), { code: 'png.blank' }).nonblank, false);
const badCrc = rgba([20, 40, 80, 255]); badCrc[badCrc.length - 1] ^= 0xff;
expectPngFailure(badCrc, 'crc', 'png.bad_crc');
const missingIend = rgba([20, 40, 80, 255]).subarray(0, -12);
assert.throws(() => validatePng(missingIend, { code: 'png.missing_iend' }), (error) => error.code === 'png.missing_iend.iend' || error.code === 'png.missing_iend.chunk');
expectPngFailure(png([chunk('IHDR', ihdr(1, 1)), chunk('ABCD', Buffer.alloc(0)), chunk('IDAT', deflateSync(Buffer.from([0, 1, 2, 3, 255]))), chunk('IEND', Buffer.alloc(0))]), 'critical_chunk', 'png.critical');
expectPngFailure(png([chunk('IHDR', ihdr(1, 1, 3)), chunk('PLTE', Buffer.alloc(771)), chunk('IDAT', deflateSync(Buffer.from([0, 0]))), chunk('IEND', Buffer.alloc(0))]), 'palette', 'png.palette_size');
expectPngFailure(png([chunk('IHDR', ihdr(1, 1, 3)), chunk('IDAT', deflateSync(Buffer.from([0, 0]))), chunk('PLTE', Buffer.from([1, 2, 3])), chunk('IEND', Buffer.alloc(0))]), 'idat_order', 'png.palette_order');
const compressed = deflateSync(Buffer.from([0, 1, 2, 3, 255]));
expectPngFailure(png([chunk('IHDR', ihdr(1, 1)), chunk('IDAT', compressed.subarray(0, 2)), chunk('tEXt', Buffer.from('x')), chunk('IDAT', compressed.subarray(2)), chunk('IEND', Buffer.alloc(0))]), 'idat_order', 'png.idat_sequence');
expectPngFailure(png([chunk('IHDR', ihdr(1, 1, 3)), chunk('PLTE', Buffer.from([1, 2, 3])), chunk('IDAT', deflateSync(Buffer.from([0, 0]))), chunk('tRNS', Buffer.from([0])), chunk('IEND', Buffer.alloc(0))]), 'transparency', 'png.trns_order');
expectPngFailure(rgba([1, 2, 3, 255], 5), 'filter', 'png.filter');
expectPngFailure(Buffer.concat([rgba([1, 2, 3, 255]), Buffer.from([0])]), 'trailing', 'png.trailing');
expectPngFailure(png([chunk('IHDR', ihdr(1, 1)), chunk('IDAT', deflateSync(Buffer.alloc(1024))), chunk('IEND', Buffer.alloc(0))]), 'decode_bounds', 'png.inflate_bomb');
expectPngFailure(png([chunk('IHDR', ihdr(2, 1, 3)), chunk('PLTE', Buffer.from([1, 2, 3])), chunk('IDAT', deflateSync(Buffer.from([0, 0, 1]))), chunk('IEND', Buffer.alloc(0))]), 'palette_index', 'png.palette_index');
const transparentIndexed = png([chunk('IHDR', ihdr(1, 1, 3)), chunk('PLTE', Buffer.from([90, 80, 70])), chunk('tRNS', Buffer.from([0])), chunk('IDAT', deflateSync(Buffer.from([0, 0]))), chunk('IEND', Buffer.alloc(0))]);
assert.equal(validatePng(transparentIndexed, { code: 'png.transparent_indexed' }).nonblank, false);
const visibleIndexed = png([chunk('IHDR', ihdr(1, 1, 3)), chunk('PLTE', Buffer.from([90, 80, 70])), chunk('tRNS', Buffer.from([255])), chunk('IDAT', deflateSync(Buffer.from([0, 0]))), chunk('IEND', Buffer.alloc(0))]);
assert.equal(validatePng(visibleIndexed, { code: 'png.visible_indexed' }).nonblank, true);

const tuple = { screen: 'home', state: 'default', theme: 'light', viewport: { width: 1440, height: 900 }, scale: 1, locale: 'en-US', fixtureRevision: 'material-designer-m3-v2', time: '2026-08-02T21:22:17.000Z', motion: 'frozen', randomSeed: 3003, fonts: 'bundled-roboto-v1', network: 'disabled' };
const presentationId = 'light-normal-100';
const bindingId = `home-default-light--${presentationId}`;
const expected = {
  side: 'reference', rowId: 'home-default-light', presentationId, bindingId, intendedSourceCommit: 'a'.repeat(40), sourceCommit: 'a'.repeat(40), route: 'design-reference://home?state=default', routePath: '/', tuple,
  pngSha256: 'b'.repeat(64), dimensions: { width: 1, height: 1 }, rawPath: `.codex/verification/evidence/home-default-light/${presentationId}/reference.png`,
  fixtureSource: 'checked-in-reference', fixturePath: 'mockups/open-design-m3/Open Design M3.dc.html', fixtureSha256: 'c'.repeat(64),
  artifactPath: 'mockups/open-design-m3/Open Design M3.dc.html', artifactSha256: 'c'.repeat(64), artifactBytes: 123,
};
const rendererWitness = { routeId: expected.rowId, routePath: expected.routePath, routeState: tuple.state, fixtureSource: expected.fixtureSource, fixturePath: expected.fixturePath, fixtureRevision: tuple.fixtureRevision, fixtureSha256: expected.fixtureSha256 };
const captureSettledWitness = { settled: true, routePath: expected.routePath, revision: 'capture-settled-v1' };
const witness = createObservedParityWitness({ id: expected.rowId, presentationId, bindingId, browserPath: expected.routePath, tuple, identity: { surfaceId: 'desktop-application', headlessRoute: 'cheap-lowlevel-headless' } }, { rendererWitness, captureSettledWitness });
const receipt = {
  version: 1, schema: 'design-parity-receipt-v1', side: expected.side, rowId: expected.rowId, presentationId, bindingId, intendedSourceCommit: expected.intendedSourceCommit, sourceCommit: expected.sourceCommit,
  artifact: { path: expected.artifactPath, sha256: expected.artifactSha256, bytes: expected.artifactBytes, builtFromCommit: expected.sourceCommit },
  captureTuple: { route: expected.route, headlessRoute: 'cheap-lowlevel-headless' }, tuple, route: expected.route, witness,
  inspection: { originalOpened: true, semanticStateConfirmed: true, clippingChecked: true, visualDefectIds: [], originalImagePath: expected.rawPath, method: 'original-image-inspection' },
  tool: { name: 'design-reference-electron', version: '1' }, pngSha256: expected.pngSha256, dimensions: expected.dimensions,
  semanticStateValidated: true, nonblankValidated: true, privacyValidated: true,
};
assert.equal(validateDesignParityReceipt(receipt, expected).ok, true);
const crossBoundReceipt = structuredClone(receipt); crossBoundReceipt.presentationId = 'dark-normal-100';
assert.throws(() => validateDesignParityReceipt(crossBoundReceipt, expected), (error) => error.code === 'receipt.presentation_binding');
assert.equal(validateDesignParityReceipt(receipt, expected).bindingId, bindingId);
for (const mutate of [
  (value) => { value.route = 'design-reference://projects'; },
  (value) => { value.sourceCommit = 'd'.repeat(40); },
  (value) => { value.artifact.builtFromCommit = 'd'.repeat(40); },
  (value) => { value.artifact.bytes += 1; },
  (value) => { value.captureTuple.headlessRoute = 'ordinary-route'; },
  (value) => { value.witness.rendererWitness.routeId = 'other-row'; },
  (value) => { value.witness.captureSettledWitness.settled = false; },
  (value) => { value.inspection.extra = true; },
]) {
  const broken = structuredClone(receipt); mutate(broken);
  assert.throws(() => validateDesignParityReceipt(broken, expected));
}
for (const field of ['intendedSourceCommit', 'artifactPath', 'artifactSha256', 'artifactBytes']) {
  const incomplete = structuredClone(expected); delete incomplete[field];
  assert.throws(() => validateDesignParityReceipt(receipt, incomplete), (error) => error.code === 'receipt.expected_binding');
}

const presentationInventory = readStrictJson(join(repositoryRoot, '.codex/verification/design-parity/inventory.json'));
const presentationRoutes = readStrictJson(join(repositoryRoot, '.codex/verification/design-parity/routes.json'));
let receiptBindingCount = 0;
for (const row of presentationInventory.rows) {
  const rowRoute = presentationRoutes.routes.find((route) => route.id === row.id);
  for (const presentation of row.presentations) {
    const presentationRoute = rowRoute.presentations.find((route) => route.presentationId === presentation.presentationId);
    const variantExpected = {
      ...expected,
      rowId: row.id,
      presentationId: presentation.presentationId,
      bindingId: presentation.bindingId,
      route: presentation.referenceRoute,
      routePath: presentationRoute.browserPath,
      tuple: presentation.tuple,
      rawPath: presentation.evidenceTargets.referenceRaw,
    };
    const variantRendererWitness = {
      ...rendererWitness,
      routeId: row.id,
      routePath: presentationRoute.browserPath,
      routeState: presentation.tuple.state,
      fixtureRevision: presentation.tuple.fixtureRevision,
    };
    const variantCaptureSettledWitness = { ...captureSettledWitness, routePath: presentationRoute.browserPath };
    const variantWitness = createObservedParityWitness({
      id: row.id,
      presentationId: presentation.presentationId,
      bindingId: presentation.bindingId,
      browserPath: presentationRoute.browserPath,
      tuple: presentation.tuple,
      identity: { surfaceId: 'desktop-application', headlessRoute: 'cheap-lowlevel-headless' },
    }, { rendererWitness: variantRendererWitness, captureSettledWitness: variantCaptureSettledWitness });
    const variantReceipt = {
      ...receipt,
      rowId: row.id,
      presentationId: presentation.presentationId,
      bindingId: presentation.bindingId,
      route: presentation.referenceRoute,
      captureTuple: { route: presentation.referenceRoute, headlessRoute: 'cheap-lowlevel-headless' },
      tuple: presentation.tuple,
      witness: variantWitness,
      inspection: { ...receipt.inspection, originalImagePath: presentation.evidenceTargets.referenceRaw },
    };
    const result = validateDesignParityReceipt(variantReceipt, variantExpected);
    assert.equal(result.bindingId, presentation.bindingId);
    receiptBindingCount += 1;
  }
}
assert.equal(receiptBindingCount, 60);

const manifestSchema = readStrictJson(join(repositoryRoot, '.codex/verification/design-parity/application-artifact-manifest.schema.json'));
const fixtureRoot = mkdtempSync(join(tmpdir(), 'design-parity-artifact-'));
const rowId = 'home-default-light';
const intendedSourceCommit = 'e'.repeat(40);
const rowRoot = `.codex/verification/evidence/${rowId}/${presentationId}`;
const artifactPath = '.codex/verification/evidence/application-artifact/artifacts/material-designer.exe';
const provenancePath = '.codex/verification/evidence/application-artifact/provenance/build-provenance.json';
const buildLogPath = '.codex/verification/evidence/application-artifact/logs/installer-build.log';
const manifestPath = `${rowRoot}/application.artifact-manifest.json`;
const absolute = (relative) => join(fixtureRoot, ...relative.split('/'));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const writeJson = (path, value) => {
  mkdirSync(dirname(absolute(path)), { recursive: true });
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
  writeFileSync(absolute(path), bytes);
  return sha(bytes);
};
const artifactBytes = Buffer.from('real packaged application bytes', 'utf8');
const buildLogBytes = Buffer.from('bounded build log with no private paths\n', 'utf8');
const packageIdentity = { identity: 'open-design-packaged-app', version: '0.20.300', architecture: 'x64' };
const baseProvenance = {
  version: 1,
  provenanceStatus: 'verified',
  packagingCommand: 'pnpm.cmd exec tools-pack win build --to squirrel',
  cleanOutput: true,
  package: { id: packageIdentity.identity, version: packageIdentity.version, architecture: packageIdentity.architecture },
  buildLog: { path: buildLogPath, sha256: sha(buildLogBytes), bytes: buildLogBytes.length },
  signing: {
    inputsCleared: true,
    certificateAutoDiscoveryDisabled: true,
    processAuditComplete: true,
    signerInvocationCount: 0,
    observedSignerInvocations: [],
    controls: { forceCodeSigning: false, signExecutable: false, signAndEditExecutable: false },
  },
  sourceCommit: intendedSourceCommit,
  builtAt: '2026-08-29T12:34:56Z',
};
const resetArtifactFiles = (provenance = baseProvenance) => {
  mkdirSync(dirname(absolute(artifactPath)), { recursive: true });
  writeFileSync(absolute(artifactPath), artifactBytes);
  mkdirSync(dirname(absolute(buildLogPath)), { recursive: true });
  writeFileSync(absolute(buildLogPath), buildLogBytes);
  return writeJson(provenancePath, provenance);
};
const createManifest = (provenanceSha256) => ({
  version: 1,
  schema: 'design-parity-application-artifact-manifest-v1',
  rowId,
  presentationId,
  bindingId,
  intendedSourceCommit,
  builtFromCommit: intendedSourceCommit,
  artifact: { path: artifactPath, sha256: sha(artifactBytes), bytes: artifactBytes.length, package: packageIdentity },
  provenance: { path: provenancePath, sha256: provenanceSha256 },
});
const writeManifestAndValidate = (manifest) => {
  const manifestSha256 = writeJson(manifestPath, manifest);
  return validateApplicationArtifactEvidence(fixtureRoot, { schema: manifestSchema, manifestPath, manifestSha256, rowId, presentationId, bindingId, rowSourceCommit: intendedSourceCommit, intendedSourceCommit });
};

try {
  const provenanceSha256 = resetArtifactFiles();
  const applicationManifest = createManifest(provenanceSha256);
  const artifactBinding = writeManifestAndValidate(applicationManifest);
  assert.equal(artifactBinding.bindingId, bindingId);
  assert.equal(artifactBinding.artifact.bytes, artifactBytes.length);
  assert.equal(artifactBinding.package.identity, 'open-design-packaged-app');
  assert.deepEqual(artifactBinding.buildLog, { path: buildLogPath, sha256: sha(buildLogBytes), bytes: buildLogBytes.length });

  for (const mutate of [
    (value) => { value.intendedSourceCommit = 'd'.repeat(40); },
    (value) => { value.builtFromCommit = 'd'.repeat(40); },
    (value) => { value.artifact.package.identity = 'wrong-package'; },
  ]) {
    const broken = structuredClone(applicationManifest); mutate(broken);
    assert.throws(() => validateApplicationArtifactManifest(broken, manifestSchema, { rowId, presentationId, bindingId, rowSourceCommit: intendedSourceCommit, intendedSourceCommit }));
  }
  assert.throws(() => validateApplicationArtifactManifest(applicationManifest, manifestSchema, { rowId, presentationId, bindingId, rowSourceCommit: 'd'.repeat(40), intendedSourceCommit }), (error) => error.code === 'artifact.row_source_commit');

  const staleHash = structuredClone(applicationManifest); staleHash.artifact.sha256 = '0'.repeat(64);
  assert.throws(() => writeManifestAndValidate(staleHash));
  const wrongBytes = structuredClone(applicationManifest); wrongBytes.artifact.bytes += 1;
  assert.throws(() => writeManifestAndValidate(wrongBytes), (error) => error.code === 'artifact.bytes');
  const wrongPath = structuredClone(applicationManifest); wrongPath.artifact.path = '.codex/verification/evidence/other-row/artifacts/material-designer.exe';
  assert.throws(() => writeManifestAndValidate(wrongPath));

  rmSync(absolute(provenancePath));
  assert.throws(() => writeManifestAndValidate(applicationManifest));
  const wrongProvenance = structuredClone(baseProvenance); wrongProvenance.sourceCommit = 'd'.repeat(40);
  const wrongProvenanceHash = resetArtifactFiles(wrongProvenance);
  const wrongProvenanceManifest = createManifest(wrongProvenanceHash);
  assert.throws(() => writeManifestAndValidate(wrongProvenanceManifest), (error) => error.code === 'artifact.provenance_binding');
  resetArtifactFiles();

  const validLogProvenanceHash = resetArtifactFiles();
  const validLogManifest = createManifest(validLogProvenanceHash);
  rmSync(absolute(buildLogPath));
  assert.throws(() => writeManifestAndValidate(validLogManifest));

  const changedLogHash = structuredClone(baseProvenance); changedLogHash.buildLog.sha256 = '0'.repeat(64);
  const changedLogHashProvenance = resetArtifactFiles(changedLogHash);
  assert.throws(() => writeManifestAndValidate(createManifest(changedLogHashProvenance)));
  const changedLogBytes = structuredClone(baseProvenance); changedLogBytes.buildLog.bytes += 1;
  const changedLogBytesProvenance = resetArtifactFiles(changedLogBytes);
  assert.throws(() => writeManifestAndValidate(createManifest(changedLogBytesProvenance)), (error) => error.code === 'artifact.build_log_bytes');
  const mismatchedLogPath = structuredClone(baseProvenance); mismatchedLogPath.buildLog.path = '.codex/verification/evidence/application-artifact/logs/other-build.log';
  const mismatchedLogPathProvenance = resetArtifactFiles(mismatchedLogPath);
  assert.throws(() => writeManifestAndValidate(createManifest(mismatchedLogPathProvenance)));
  const escapedLogPath = structuredClone(baseProvenance); escapedLogPath.buildLog.path = '.codex/verification/evidence/application-artifact/logs/../outside.log';
  const escapedLogPathProvenance = resetArtifactFiles(escapedLogPath);
  assert.throws(() => writeManifestAndValidate(createManifest(escapedLogPathProvenance)));

  const logsDirectory = dirname(absolute(buildLogPath));
  const redirectedLogs = join(fixtureRoot, 'redirected-build-logs');
  resetArtifactFiles();
  rmSync(logsDirectory, { recursive: true, force: true });
  mkdirSync(redirectedLogs, { recursive: true });
  writeFileSync(join(redirectedLogs, 'installer-build.log'), buildLogBytes);
  symlinkSync(redirectedLogs, logsDirectory, process.platform === 'win32' ? 'junction' : 'dir');
  const reparseLogProvenanceHash = writeJson(provenancePath, baseProvenance);
  assert.throws(() => writeManifestAndValidate(createManifest(reparseLogProvenanceHash)));
  rmSync(logsDirectory, { recursive: true, force: true });
  resetArtifactFiles();

  const applicationExpected = {
    ...expected,
    side: 'application',
    route: 'material-designer://home?state=default',
    artifactPath: artifactBinding.artifact.path,
    artifactSha256: artifactBinding.artifact.sha256,
    artifactBytes: artifactBinding.artifact.bytes,
    artifactManifestPath: artifactBinding.manifest.path,
    artifactManifestSha256: artifactBinding.manifest.sha256,
    provenancePath: artifactBinding.provenance.path,
    provenanceSha256: artifactBinding.provenance.sha256,
    packageIdentity: artifactBinding.package.identity,
    packageVersion: artifactBinding.package.version,
    packageArchitecture: artifactBinding.package.architecture,
    buildLogPath: artifactBinding.buildLog.path,
    buildLogSha256: artifactBinding.buildLog.sha256,
    buildLogBytes: artifactBinding.buildLog.bytes,
    fixtureSource: 'packaged-application-fixture',
    fixturePath: `${rowRoot}/fixtures/application.json`,
  };
  const applicationRendererWitness = { ...rendererWitness, fixtureSource: applicationExpected.fixtureSource, fixturePath: applicationExpected.fixturePath };
  const applicationWitness = createObservedParityWitness({ id: rowId, presentationId, bindingId, browserPath: '/', tuple, identity: { surfaceId: 'desktop-application', headlessRoute: 'cheap-lowlevel-headless' } }, { rendererWitness: applicationRendererWitness, captureSettledWitness });
  const applicationReceipt = {
    ...receipt,
    side: 'application',
    route: applicationExpected.route,
    captureTuple: { route: applicationExpected.route, headlessRoute: 'cheap-lowlevel-headless' },
    artifact: {
      path: applicationExpected.artifactPath,
      sha256: applicationExpected.artifactSha256,
      bytes: applicationExpected.artifactBytes,
      builtFromCommit: intendedSourceCommit,
      package: packageIdentity,
      provenance: artifactBinding.provenance,
      manifest: artifactBinding.manifest,
      buildLog: artifactBinding.buildLog,
    },
    intendedSourceCommit,
    sourceCommit: intendedSourceCommit,
    witness: applicationWitness,
  };
  applicationExpected.intendedSourceCommit = intendedSourceCommit;
  applicationExpected.sourceCommit = intendedSourceCommit;
  assert.equal(validateDesignParityReceipt(applicationReceipt, applicationExpected).ok, true);
  let applicationReceiptBindingCount = 0;
  for (const row of presentationInventory.rows) {
    const rowRoute = presentationRoutes.routes.find((route) => route.id === row.id);
    for (const presentation of row.presentations) {
      const presentationRoute = rowRoute.presentations.find((route) => route.presentationId === presentation.presentationId);
      const variantApplicationExpected = {
        ...applicationExpected,
        rowId: row.id,
        presentationId: presentation.presentationId,
        bindingId: presentation.bindingId,
        route: presentation.applicationRoute,
        routePath: presentationRoute.browserPath,
        tuple: presentation.tuple,
        rawPath: presentation.evidenceTargets.applicationRaw,
        fixturePath: `.codex/verification/evidence/${row.id}/${presentation.presentationId}/fixtures/application.json`,
      };
      const variantApplicationRendererWitness = {
        ...rendererWitness,
        routeId: row.id,
        routePath: presentationRoute.browserPath,
        routeState: presentation.tuple.state,
        fixtureSource: variantApplicationExpected.fixtureSource,
        fixturePath: variantApplicationExpected.fixturePath,
        fixtureRevision: presentation.tuple.fixtureRevision,
      };
      const variantApplicationCaptureSettled = { ...captureSettledWitness, routePath: presentationRoute.browserPath };
      const variantApplicationWitness = createObservedParityWitness({ id: row.id, presentationId: presentation.presentationId, bindingId: presentation.bindingId, browserPath: presentationRoute.browserPath, tuple: presentation.tuple, identity: { surfaceId: 'desktop-application', headlessRoute: 'cheap-lowlevel-headless' } }, { rendererWitness: variantApplicationRendererWitness, captureSettledWitness: variantApplicationCaptureSettled });
      const variantApplicationReceipt = {
        ...applicationReceipt,
        rowId: row.id,
        presentationId: presentation.presentationId,
        bindingId: presentation.bindingId,
        route: presentation.applicationRoute,
        captureTuple: { route: presentation.applicationRoute, headlessRoute: 'cheap-lowlevel-headless' },
        tuple: presentation.tuple,
        witness: variantApplicationWitness,
        inspection: { ...applicationReceipt.inspection, originalImagePath: presentation.evidenceTargets.applicationRaw },
      };
      assert.equal(validateDesignParityReceipt(variantApplicationReceipt, variantApplicationExpected).bindingId, presentation.bindingId);
      applicationReceiptBindingCount += 1;
    }
  }
  assert.equal(applicationReceiptBindingCount, 60);
  const missingExpectedPackage = structuredClone(applicationExpected); delete missingExpectedPackage.packageIdentity;
  assert.throws(() => validateDesignParityReceipt(applicationReceipt, missingExpectedPackage), (error) => error.code === 'receipt.expected_application_binding');
  const missingExpectedLog = structuredClone(applicationExpected); delete missingExpectedLog.buildLogPath;
  assert.throws(() => validateDesignParityReceipt(applicationReceipt, missingExpectedLog), (error) => error.code === 'receipt.expected_application_binding');
  const wrongBuiltReceipt = structuredClone(applicationReceipt); wrongBuiltReceipt.artifact.builtFromCommit = 'd'.repeat(40);
  assert.throws(() => validateDesignParityReceipt(wrongBuiltReceipt, applicationExpected));
  const wrongPackageReceipt = structuredClone(applicationReceipt); wrongPackageReceipt.artifact.package.identity = 'wrong-package';
  assert.throws(() => validateDesignParityReceipt(wrongPackageReceipt, applicationExpected));
  const wrongLogReceipt = structuredClone(applicationReceipt); wrongLogReceipt.artifact.buildLog.sha256 = '0'.repeat(64);
  assert.throws(() => validateDesignParityReceipt(wrongLogReceipt, applicationExpected), (error) => error.code === 'receipt.build_log');

  rmSync(absolute(manifestPath));
  assert.throws(() => validateApplicationArtifactEvidence(fixtureRoot, { schema: manifestSchema, manifestPath, manifestSha256: artifactBinding.manifest.sha256, rowId, presentationId, bindingId, rowSourceCommit: intendedSourceCommit, intendedSourceCommit }));
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}

const verifierSource = readFileSync(new URL('./verify-design-parity.mjs', import.meta.url), 'utf8');
const evidenceContractSource = readFileSync(new URL('./design-parity-evidence-contract.mjs', import.meta.url), 'utf8');
assert.match(verifierSource, /^\s{2}validateApplicationArtifactEvidence,$/m);
assert.match(verifierSource, /^\s{2}validateDesignParityReceipt,$/m);
assert.match(verifierSource, /^    validateDesignParityReceipt\(receipt, \{$/m);
assert.match(verifierSource, /^  const artifactBinding = validateApplicationArtifactEvidence\(root, \{$/m);
assert.match(verifierSource, /^        buildLogPath: artifactBinding\.buildLog\.path,$/m);
assert.match(verifierSource, /^        buildLogSha256: artifactBinding\.buildLog\.sha256,$/m);
assert.match(verifierSource, /^        buildLogBytes: artifactBinding\.buildLog\.bytes,$/m);
assert.match(evidenceContractSource, /^  const pinnedBuildLog = resolvePinnedParityFileUnderRoot\(repositoryRoot, APPLICATION_EVIDENCE_LOG_ROOT,/m);
assert.doesNotMatch(verifierSource, /^\s*\/\/\s*validateDesignParityReceipt\(receipt,/m);
const verifierPath = fileURLToPath(new URL('./verify-design-parity.mjs', import.meta.url));
const runVerifier = (args) => spawnSync(process.execPath, [verifierPath, ...args], { cwd: repositoryRoot, encoding: 'utf8', windowsHide: true });
const structureRun = runVerifier(['--structure']);
assert.equal(structureRun.status, 0, structureRun.stderr);
const negativeRun = runVerifier(['--negative']);
assert.equal(negativeRun.status, 0, negativeRun.stderr);
const missingIntended = runVerifier([]);
assert.notEqual(missingIntended.status, 0);
assert.match(missingIntended.stderr, /artifact\.intended_source/);
const missingObject = runVerifier(['--intended-source', '0'.repeat(40)]);
assert.notEqual(missingObject.status, 0);
assert.match(missingObject.stderr, /artifact\.git_object/);
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8', windowsHide: true }).trim();
const parent = execFileSync('git', ['rev-parse', 'HEAD^'], { cwd: repositoryRoot, encoding: 'utf8', windowsHide: true }).trim();
const wrongReviewedCommit = runVerifier(['--intended-source', parent]);
assert.notEqual(wrongReviewedCommit.status, 0);
assert.match(wrongReviewedCommit.stderr, /artifact\.reviewed_commit/);
const intendedAccepted = runVerifier(['--intended-source', head]);
assert.notEqual(intendedAccepted.status, 0);
assert.match(intendedAccepted.stderr, /route\.application_implementation/);
process.stdout.write(JSON.stringify({ ok: true, referenceReceiptBindings: receiptBindingCount, applicationReceiptBindings: 60, totalReceiptBindings: receiptBindingCount + 60, pngNegatives: 12, pngPositiveIndexed: 2, receiptNegatives: 18, receiptCrossBindingNegatives: 1, receiptCrossBindingRestoredGreen: true, artifactEvidenceNegatives: 16, verifierProvenanceNegatives: 4, structureGreen: true, negativeGreen: true, productionReceiptHelper: true, productionArtifactHelper: true, buildLogBinding: true }) + '\n');

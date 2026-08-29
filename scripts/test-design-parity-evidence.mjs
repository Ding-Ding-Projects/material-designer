import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { validateDesignParityReceipt } from './design-parity-evidence-contract.mjs';
import { validatePng } from './design-parity-png.mjs';
import { crc32 } from './design-parity-png-crc.mjs';
import { createObservedParityWitness } from '../tools/design-reference-app/parity-route-contract.mjs';

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

const forged24 = Buffer.alloc(24); signature.copy(forged24);
assert.throws(() => validatePng(forged24, { code: 'png.forged24' }), (error) => error.code === 'png.forged24.chunk' || error.code === 'png.forged24.chunk_bounds');
assert.equal(validatePng(rgba([0, 0, 0, 0]), { code: 'png.blank' }).nonblank, false);
const badCrc = rgba([20, 40, 80, 255]); badCrc[badCrc.length - 5] ^= 0xff;
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
const expected = {
  side: 'reference', rowId: 'home-default-light', sourceCommit: 'a'.repeat(40), route: 'design-reference://home?state=default', routePath: '/', tuple,
  pngSha256: 'b'.repeat(64), dimensions: { width: 1, height: 1 }, rawPath: '.codex/verification/evidence/home-default-light/reference.png',
  fixtureSource: 'checked-in-reference', fixturePath: 'mockups/open-design-m3/Open Design M3.dc.html', fixtureSha256: 'c'.repeat(64),
  artifactPath: 'mockups/open-design-m3/Open Design M3.dc.html', artifactSha256: 'c'.repeat(64),
};
const rendererWitness = { routeId: expected.rowId, routePath: expected.routePath, routeState: tuple.state, fixtureSource: expected.fixtureSource, fixturePath: expected.fixturePath, fixtureRevision: tuple.fixtureRevision, fixtureSha256: expected.fixtureSha256 };
const captureSettledWitness = { settled: true, routePath: expected.routePath, revision: 'capture-settled-v1' };
const witness = createObservedParityWitness({ id: expected.rowId, browserPath: expected.routePath, tuple, identity: { surfaceId: 'desktop-application', headlessRoute: 'cheap-lowlevel-headless' } }, { rendererWitness, captureSettledWitness });
const receipt = {
  version: 1, schema: 'design-parity-receipt-v1', side: expected.side, rowId: expected.rowId, sourceCommit: expected.sourceCommit,
  artifact: { path: expected.artifactPath, sha256: expected.artifactSha256, builtFromCommit: expected.sourceCommit },
  captureTuple: { route: expected.route, headlessRoute: 'cheap-lowlevel-headless' }, tuple, route: expected.route, witness,
  inspection: { originalOpened: true, semanticStateConfirmed: true, clippingChecked: true, visualDefectIds: [], originalImagePath: expected.rawPath, method: 'original-image-inspection' },
  tool: { name: 'design-reference-electron', version: '1' }, pngSha256: expected.pngSha256, dimensions: expected.dimensions,
  semanticStateValidated: true, nonblankValidated: true, privacyValidated: true,
};
assert.equal(validateDesignParityReceipt(receipt, expected).ok, true);
for (const mutate of [
  (value) => { value.route = 'design-reference://projects'; },
  (value) => { value.sourceCommit = 'd'.repeat(40); },
  (value) => { value.captureTuple.headlessRoute = 'ordinary-route'; },
  (value) => { value.witness.rendererWitness.routeId = 'other-row'; },
  (value) => { value.witness.captureSettledWitness.settled = false; },
  (value) => { value.inspection.extra = true; },
]) {
  const broken = structuredClone(receipt); mutate(broken);
  assert.throws(() => validateDesignParityReceipt(broken, expected));
}

const verifierSource = readFileSync(new URL('./verify-design-parity.mjs', import.meta.url), 'utf8');
assert.match(verifierSource, /^import \{ validateDesignParityReceipt \} from '\.\/design-parity-evidence-contract\.mjs';$/m);
assert.match(verifierSource, /^    validateDesignParityReceipt\(receipt, \{$/m);
assert.doesNotMatch(verifierSource, /^\s*\/\/\s*validateDesignParityReceipt\(receipt,/m);
process.stdout.write(JSON.stringify({ ok: true, pngNegatives: 12, pngPositiveIndexed: 2, receiptNegatives: 6, productionReceiptHelper: true }) + '\n');

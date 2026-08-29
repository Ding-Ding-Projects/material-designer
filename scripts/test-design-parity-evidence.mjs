import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { validatePng } from './design-parity-png.mjs';
import { crc32 } from './design-parity-png-crc.mjs';

const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
function chunk(type, data) {
  const name = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}
function png(pixel) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.from([0, ...pixel]))), chunk('IEND', Buffer.alloc(0))]);
}
function expectReceipt(receipt, expected) {
  assert.equal(receipt.schema, 'design-parity-receipt-v1');
  assert.equal(receipt.route, expected.route);
  assert.equal(receipt.sourceCommit, expected.sourceCommit);
  assert.equal(receipt.artifact.builtFromCommit, expected.sourceCommit);
  assert.equal(receipt.captureTuple.headlessRoute, 'cheap-lowlevel-headless');
  assert.equal(receipt.witness.rendererWitness.routeId, expected.routeId);
  assert.equal(receipt.witness.captureSettledWitness.settled, true);
}

const forged24 = Buffer.alloc(24); signature.copy(forged24);
assert.throws(() => validatePng(forged24, { code: 'png.forged24' }), (error) => error.code === 'png.forged24.chunk' || error.code === 'png.forged24.chunk_bounds');
assert.equal(validatePng(png([0, 0, 0, 0]), { code: 'png.blank' }).nonblank, false);
const badCrc = png([20, 40, 80, 255]); badCrc[badCrc.length - 5] ^= 0xff;
assert.throws(() => validatePng(badCrc, { code: 'png.bad_crc' }), (error) => error.code === 'png.bad_crc.crc');
const missingIend = png([20, 40, 80, 255]).subarray(0, -12);
assert.throws(() => validatePng(missingIend, { code: 'png.missing_iend' }), (error) => error.code === 'png.missing_iend.iend' || error.code === 'png.missing_iend.chunk');

const expected = { route: 'material-designer://home?state=default', sourceCommit: 'a'.repeat(40), routeId: 'home-default-light' };
const receipt = { schema: 'design-parity-receipt-v1', route: expected.route, sourceCommit: expected.sourceCommit, artifact: { builtFromCommit: expected.sourceCommit }, captureTuple: { headlessRoute: 'cheap-lowlevel-headless' }, witness: { rendererWitness: { routeId: expected.routeId }, captureSettledWitness: { settled: true } } };
expectReceipt(receipt, expected);
for (const mutate of [
  (value) => { value.route = 'material-designer://projects'; },
  (value) => { value.sourceCommit = 'b'.repeat(40); },
  (value) => { value.captureTuple.headlessRoute = 'ordinary-route'; },
  (value) => { value.witness.rendererWitness.routeId = 'other-row'; },
  (value) => { value.witness.captureSettledWitness.settled = false; },
]) {
  const broken = structuredClone(receipt); mutate(broken);
  assert.throws(() => expectReceipt(broken, expected));
}
process.stdout.write(JSON.stringify({ ok: true, pngNegatives: 4, receiptNegatives: 5 }) + '\n');

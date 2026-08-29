import { crc32 } from './design-parity-png-crc.mjs';
import { inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_BYTES = 128 * 1024 * 1024;
const MAX_PIXELS = 8192 * 8192;

function fail(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  throw error;
}

function readUInt32(bytes, offset) {
  return bytes.readUInt32BE(offset);
}

function unfilter(raw, width, height, channels) {
  const rowBytes = width * channels;
  const expected = height * (rowBytes + 1);
  if (raw.length !== expected) fail('png.decode_length', `decoded data length ${raw.length} is not ${expected}`);
  const pixels = Buffer.alloc(height * rowBytes);
  let sourceOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[sourceOffset++];
    const rowStart = y * rowBytes;
    for (let x = 0; x < rowBytes; x += 1) {
      const value = raw[sourceOffset++];
      const left = x >= channels ? pixels[rowStart + x - channels] : 0;
      const above = y > 0 ? pixels[rowStart - rowBytes + x] : 0;
      const upperLeft = y > 0 && x >= channels ? pixels[rowStart - rowBytes + x - channels] : 0;
      let result;
      if (filter === 0) result = value;
      else if (filter === 1) result = value + left;
      else if (filter === 2) result = value + above;
      else if (filter === 3) result = value + Math.floor((left + above) / 2);
      else if (filter === 4) {
        const p = left + above - upperLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - above);
        const pc = Math.abs(p - upperLeft);
        result = value + (pa <= pb && pa <= pc ? left : pb <= pc ? above : upperLeft);
      } else fail('png.filter', `unsupported PNG filter ${filter}`);
      pixels[rowStart + x] = result & 255;
    }
  }
  return pixels;
}

export function validatePng(input, { code = 'png.invalid' } = {}) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (bytes.length > MAX_BYTES) fail(`${code}.bounds`, 'PNG exceeds the bounded input size');
  if (bytes.length < 8 || !bytes.subarray(0, 8).equals(SIGNATURE)) fail(`${code}.signature`, 'PNG signature is invalid');
  let offset = 8;
  let ihdr = null;
  let palette = null;
  const idat = [];
  let iend = false;
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) fail(`${code}.chunk`, 'PNG chunk header or CRC is truncated');
    const length = readUInt32(bytes, offset);
    if (length > MAX_BYTES || offset + 12 + length > bytes.length) fail(`${code}.chunk_bounds`, 'PNG chunk exceeds the input boundary');
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const expectedCrc = readUInt32(bytes, dataEnd);
    const actualCrc = crc32(bytes.subarray(offset + 4, dataEnd));
    if (actualCrc !== expectedCrc) fail(`${code}.crc`, `PNG chunk ${type} has an invalid CRC`);
    if (type === 'IHDR') {
      if (ihdr || length !== 13 || offset !== 8) fail(`${code}.ihdr`, 'PNG has a missing, duplicated, or malformed IHDR');
      ihdr = { width: readUInt32(bytes, dataStart), height: readUInt32(bytes, dataStart + 4), bitDepth: bytes[dataStart + 8], colorType: bytes[dataStart + 9], compression: bytes[dataStart + 10], filter: bytes[dataStart + 11], interlace: bytes[dataStart + 12] };
      if (!ihdr.width || !ihdr.height || ihdr.width * ihdr.height > MAX_PIXELS) fail(`${code}.bounds`, 'PNG dimensions exceed safe bounds');
      if (ihdr.bitDepth !== 8 || ![0, 2, 3, 4, 6].includes(ihdr.colorType) || ihdr.compression !== 0 || ihdr.filter !== 0 || ihdr.interlace !== 0) fail(`${code}.format`, 'PNG uses an unsupported bit depth, colour type, compression, filter, or interlace mode');
    } else if (type === 'PLTE') {
      if (length === 0 || length % 3 !== 0) fail(`${code}.palette`, 'PNG palette is malformed');
      palette = bytes.subarray(dataStart, dataEnd);
    } else if (type === 'IDAT') {
      idat.push(bytes.subarray(dataStart, dataEnd));
    } else if (type === 'IEND') {
      if (length !== 0 || iend) fail(`${code}.iend`, 'PNG IEND is malformed or duplicated');
      iend = true;
      if (dataEnd + 4 !== bytes.length) fail(`${code}.trailing`, 'PNG contains bytes after IEND');
    }
    offset = dataEnd + 4;
    if (iend) break;
  }
  if (!ihdr) fail(`${code}.ihdr`, 'PNG IHDR is missing');
  if (!iend) fail(`${code}.iend`, 'PNG IEND is missing');
  if (idat.length === 0) fail(`${code}.idat`, 'PNG IDAT is missing');
  if (ihdr.colorType === 3 && !palette) fail(`${code}.palette`, 'indexed PNG has no palette');
  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 })[ihdr.colorType];
  let decoded;
  try { decoded = inflateSync(Buffer.concat(idat)); } catch (error) { fail(`${code}.decode`, `PNG IDAT does not decode: ${error.message}`); }
  const pixels = unfilter(decoded, ihdr.width, ihdr.height, channels);
  let nonblank = false;
  for (let index = 0; index < pixels.length; index += channels) {
    if ((ihdr.colorType === 4 || ihdr.colorType === 6) && pixels[index + channels - 1] === 0) continue;
    if (ihdr.colorType === 3 && palette && (pixels[index] * 3 + 2 >= palette.length)) fail(`${code}.palette_index`, 'PNG palette index is outside PLTE');
    nonblank = true;
    break;
  }
  return Object.freeze({ width: ihdr.width, height: ihdr.height, decodedBytes: pixels.length, nonblank, decoder: 'node-zlib-png-filter-v1' });
}

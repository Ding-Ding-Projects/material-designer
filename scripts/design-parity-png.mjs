import { inflateSync } from 'node:zlib';
import { crc32 } from './design-parity-png-crc.mjs';

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_BYTES = 128 * 1024 * 1024;
const MAX_DECODED_BYTES = 128 * 1024 * 1024;
const MAX_PIXELS = 8192 * 8192;
const KNOWN_CRITICAL = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND']);

function fail(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  throw error;
}

function readUInt32(bytes, offset) {
  return bytes.readUInt32BE(offset);
}

function checkedRawLength(width, height, channels, bitDepth, code) {
  const rowBits = width * channels * bitDepth;
  if (!Number.isSafeInteger(rowBits)) fail(`${code}.decode_bounds`, 'PNG row width overflows the safe integer bound');
  const rowBytes = Math.ceil(rowBits / 8);
  const expected = height * (rowBytes + 1);
  if (!Number.isSafeInteger(expected) || expected <= 0 || expected > MAX_DECODED_BYTES) fail(`${code}.decode_bounds`, 'PNG decompressed scanlines exceed the exact safe bound');
  return { rowBytes, expected };
}

function unfilter(raw, width, height, channels, bitDepth, code) {
  const { rowBytes, expected } = checkedRawLength(width, height, channels, bitDepth, code);
  if (raw.length !== expected) fail(`${code}.decode_length`, `decoded data length ${raw.length} is not ${expected}`);
  const pixels = Buffer.alloc(height * rowBytes);
  const bytesPerPixel = Math.max(1, Math.ceil(channels * bitDepth / 8));
  let sourceOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[sourceOffset++];
    if (filter > 4) fail(`${code}.filter`, `unsupported PNG filter ${filter} on row ${y}`);
    const rowStart = y * rowBytes;
    for (let x = 0; x < rowBytes; x += 1) {
      const value = raw[sourceOffset++];
      const left = x >= bytesPerPixel ? pixels[rowStart + x - bytesPerPixel] : 0;
      const above = y > 0 ? pixels[rowStart - rowBytes + x] : 0;
      const upperLeft = y > 0 && x >= bytesPerPixel ? pixels[rowStart - rowBytes + x - bytesPerPixel] : 0;
      let result = value;
      if (filter === 1) result += left;
      else if (filter === 2) result += above;
      else if (filter === 3) result += Math.floor((left + above) / 2);
      else if (filter === 4) {
        const predictor = left + above - upperLeft;
        const leftDistance = Math.abs(predictor - left);
        const aboveDistance = Math.abs(predictor - above);
        const upperLeftDistance = Math.abs(predictor - upperLeft);
        result += leftDistance <= aboveDistance && leftDistance <= upperLeftDistance ? left : aboveDistance <= upperLeftDistance ? above : upperLeft;
      }
      pixels[rowStart + x] = result & 255;
    }
  }
  return pixels;
}

function validateTransparency(transparency, ihdr, paletteEntries, code) {
  if (!transparency) return null;
  if (ihdr.colorType === 3) {
    if (!paletteEntries || transparency.length === 0 || transparency.length > paletteEntries) fail(`${code}.transparency`, 'indexed PNG tRNS length exceeds the palette');
    return transparency;
  }
  if (ihdr.colorType === 0) {
    if (transparency.length !== 2 || transparency.readUInt16BE(0) > 255) fail(`${code}.transparency`, 'grayscale PNG tRNS is malformed for 8-bit samples');
    return transparency;
  }
  if (ihdr.colorType === 2) {
    if (transparency.length !== 6 || transparency.readUInt16BE(0) > 255 || transparency.readUInt16BE(2) > 255 || transparency.readUInt16BE(4) > 255) fail(`${code}.transparency`, 'truecolor PNG tRNS is malformed for 8-bit samples');
    return transparency;
  }
  fail(`${code}.transparency`, 'PNG tRNS is forbidden for a color type with an alpha channel');
}

function pixelIsVisible(pixels, offset, ihdr, paletteEntries, transparency, code) {
  if (ihdr.colorType === 3) {
    const paletteIndex = pixels[offset];
    if (paletteIndex >= paletteEntries) fail(`${code}.palette_index`, 'PNG palette index is outside PLTE');
    return !transparency || paletteIndex >= transparency.length || transparency[paletteIndex] !== 0;
  }
  if (ihdr.colorType === 4) return pixels[offset + 1] !== 0;
  if (ihdr.colorType === 6) return pixels[offset + 3] !== 0;
  if (ihdr.colorType === 0 && transparency) return pixels[offset] !== transparency.readUInt16BE(0);
  if (ihdr.colorType === 2 && transparency) {
    return pixels[offset] !== transparency.readUInt16BE(0) || pixels[offset + 1] !== transparency.readUInt16BE(2) || pixels[offset + 2] !== transparency.readUInt16BE(4);
  }
  return true;
}

export function validatePng(input, { code = 'png.invalid' } = {}) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (bytes.length > MAX_BYTES) fail(`${code}.bounds`, 'PNG exceeds the bounded input size');
  if (bytes.length < 8 || !bytes.subarray(0, 8).equals(SIGNATURE)) fail(`${code}.signature`, 'PNG signature is invalid');
  let offset = 8;
  let ihdr = null;
  let palette = null;
  let transparency = null;
  const idat = [];
  let idatBytes = 0;
  let idatStarted = false;
  let idatClosed = false;
  let iend = false;
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) fail(`${code}.chunk`, 'PNG chunk header or CRC is truncated');
    const length = readUInt32(bytes, offset);
    if (length > MAX_BYTES || offset + 12 + length > bytes.length) fail(`${code}.chunk_bounds`, 'PNG chunk exceeds the input boundary');
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    if (!/^[A-Za-z]{4}$/.test(type) || type[2] !== type[2].toUpperCase()) fail(`${code}.chunk_type`, 'PNG chunk type is malformed or uses the reserved bit');
    if (type[0] === type[0].toUpperCase() && !KNOWN_CRITICAL.has(type)) fail(`${code}.critical_chunk`, `unknown critical PNG chunk ${type}`);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const expectedCrc = readUInt32(bytes, dataEnd);
    const actualCrc = crc32(bytes.subarray(offset + 4, dataEnd));
    if (actualCrc !== expectedCrc) fail(`${code}.crc`, `PNG chunk ${type} has an invalid CRC`);
    if (type === 'IHDR') {
      if (ihdr || length !== 13 || offset !== 8) fail(`${code}.ihdr`, 'PNG has a missing, duplicated, or malformed IHDR');
      ihdr = { width: readUInt32(bytes, dataStart), height: readUInt32(bytes, dataStart + 4), bitDepth: bytes[dataStart + 8], colorType: bytes[dataStart + 9], compression: bytes[dataStart + 10], filter: bytes[dataStart + 11], interlace: bytes[dataStart + 12] };
      if (!ihdr.width || !ihdr.height || !Number.isSafeInteger(ihdr.width * ihdr.height) || ihdr.width * ihdr.height > MAX_PIXELS) fail(`${code}.bounds`, 'PNG dimensions exceed safe bounds');
      if (ihdr.bitDepth !== 8 || ![0, 2, 3, 4, 6].includes(ihdr.colorType) || ihdr.compression !== 0 || ihdr.filter !== 0 || ihdr.interlace !== 0) fail(`${code}.format`, 'PNG uses an unsupported bit depth, colour type, compression, filter, or interlace mode');
    } else if (!ihdr) fail(`${code}.ihdr`, 'PNG IHDR must be the first chunk');
    else if (type === 'PLTE') {
      if (palette || idatStarted || transparency || length === 0 || length % 3 !== 0 || length / 3 > 256) fail(`${code}.palette`, 'PNG palette is duplicated, misplaced, empty, or oversized');
      if ([0, 4].includes(ihdr.colorType)) fail(`${code}.palette`, 'grayscale PNG cannot contain PLTE');
      palette = Buffer.from(bytes.subarray(dataStart, dataEnd));
    } else if (type === 'tRNS') {
      if (transparency || idatStarted || (ihdr.colorType === 3 && !palette)) fail(`${code}.transparency`, 'PNG tRNS is duplicated or misplaced');
      transparency = Buffer.from(bytes.subarray(dataStart, dataEnd));
    } else if (type === 'IDAT') {
      if (idatClosed || (ihdr.colorType === 3 && !palette)) fail(`${code}.idat_order`, 'PNG IDAT chunks are noncontiguous or precede the indexed palette');
      idatStarted = true;
      idatBytes += length;
      if (idatBytes > MAX_BYTES) fail(`${code}.idat_bounds`, 'PNG compressed IDAT bytes exceed the input bound');
      idat.push(bytes.subarray(dataStart, dataEnd));
    } else if (type === 'IEND') {
      if (length !== 0 || iend || !idatStarted) fail(`${code}.iend`, 'PNG IEND is malformed, duplicated, or precedes IDAT');
      iend = true;
      if (dataEnd + 4 !== bytes.length) fail(`${code}.trailing`, 'PNG contains chunks or bytes after IEND');
    } else if (idatStarted) idatClosed = true;
    offset = dataEnd + 4;
    if (iend) break;
  }
  if (!ihdr) fail(`${code}.ihdr`, 'PNG IHDR is missing');
  if (!iend) fail(`${code}.iend`, 'PNG IEND is missing');
  if (idat.length === 0) fail(`${code}.idat`, 'PNG IDAT is missing');
  const paletteEntries = palette ? palette.length / 3 : 0;
  if (ihdr.colorType === 3 && paletteEntries === 0) fail(`${code}.palette`, 'indexed PNG has no palette');
  transparency = validateTransparency(transparency, ihdr, paletteEntries, code);
  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 })[ihdr.colorType];
  const { expected } = checkedRawLength(ihdr.width, ihdr.height, channels, ihdr.bitDepth, code);
  let decoded;
  try {
    decoded = inflateSync(Buffer.concat(idat, idatBytes), { maxOutputLength: expected });
  } catch (error) {
    const suffix = error?.code === 'ERR_BUFFER_TOO_LARGE' ? 'decode_bounds' : 'decode';
    fail(`${code}.${suffix}`, `PNG IDAT does not decode within the exact scanline bound: ${error.message}`);
  }
  const pixels = unfilter(decoded, ihdr.width, ihdr.height, channels, ihdr.bitDepth, code);
  let nonblank = false;
  for (let index = 0; index < pixels.length; index += channels) {
    if (pixelIsVisible(pixels, index, ihdr, paletteEntries, transparency, code)) nonblank = true;
  }
  return Object.freeze({
    width: ihdr.width,
    height: ihdr.height,
    bitDepth: ihdr.bitDepth,
    colorType: ihdr.colorType,
    paletteEntries,
    transparency: Boolean(transparency),
    idatChunks: idat.length,
    decodedBytes: pixels.length,
    nonblank,
    decoder: 'node-zlib-png-strict-v2',
  });
}

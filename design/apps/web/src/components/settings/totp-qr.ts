/**
 * Small, local QR encoder for the toy-lock pairing surface.
 *
 * This is deliberately dependency-free.  The pairing URI contains a secret,
 * so it must never travel through a chart service, a CDN, or a third-party
 * renderer.  Version 7-L is large enough for the bounded toy-lock URI while
 * keeping the generated SVG inexpensive to inspect and to capture.
 */

const VERSION = 7;
const SIZE = VERSION * 4 + 17;
const DATA_CODEWORDS = 156;
const TOTAL_CODEWORDS = 196;
const ERROR_CORRECTION_CODEWORDS = 20;
const DATA_PER_BLOCK = 78;
const BLOCK_COUNT = 2;
const QUIET_ZONE = 4;
/**
 * Source-only evidence boundary. The bundled decoder and Reed-Solomon verifier
 * prove internal structure and correction codewords, but they are not an
 * independent third-party scanner. Packaged interoperability therefore remains
 * explicitly unverified until the built surface is scanned independently.
 */
export const TOTP_QR_CAPABILITY = Object.freeze({
  independentScannerVerified: false,
  internalDecoderRoundTrip: true,
  reedSolomonVerified: true,
} as const);
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
// RFC 4648 residual symbols contain 2, 4, 1, or 3 unused low bits for
// encoded residues 2, 4, 5, and 7. They must all be zero for canonical input.
const BASE32_UNUSED_BITS_BY_RESIDUE: Readonly<Record<number, number>> = Object.freeze({
  2: 2, 4: 4, 5: 1, 7: 3,
});

type Cell = boolean | null;

function gfMultiply(left: number, right: number, exponent: Uint8Array, log: Uint8Array): number {
  if (left === 0 || right === 0) return 0;
  return exponent[log[left]! + log[right]!]!;
}

function createGaloisTables(): { exponent: Uint8Array; log: Uint8Array } {
  const exponent = new Uint8Array(512);
  const log = new Uint8Array(256);
  let value = 1;
  for (let index = 0; index < 255; index += 1) {
    exponent[index] = value;
    log[value] = index;
    value <<= 1;
    if ((value & 0x100) !== 0) value ^= 0x11d;
  }
  for (let index = 255; index < exponent.length; index += 1) {
    exponent[index] = exponent[index - 255]!;
  }
  return { exponent, log };
}

function generatorPolynomial(
  degree: number,
  exponent: Uint8Array,
  log: Uint8Array,
): number[] {
  let polynomial = [1];
  for (let root = 0; root < degree; root += 1) {
    const next = new Array<number>(polynomial.length + 1).fill(0);
    for (let index = 0; index < polynomial.length; index += 1) {
      next[index] ^= polynomial[index]!;
      next[index + 1] ^= gfMultiply(polynomial[index]!, exponent[root]!, exponent, log);
    }
    polynomial = next;
  }
  return polynomial;
}

function errorCorrection(
  data: readonly number[],
  generator: readonly number[],
  exponent: Uint8Array,
  log: Uint8Array,
): number[] {
  const result = new Array<number>(ERROR_CORRECTION_CODEWORDS).fill(0);
  for (const byte of data) {
    const factor = byte ^ result[0]!;
    for (let index = 0; index < result.length - 1; index += 1) {
      result[index] = result[index + 1]! ^ gfMultiply(generator[index + 1]!, factor, exponent, log);
    }
    result[result.length - 1] = gfMultiply(generator[generator.length - 1]!, factor, exponent, log);
  }
  return result;
}

function appendBits(bits: number[], value: number, count: number): void {
  for (let shift = count - 1; shift >= 0; shift -= 1) bits.push((value >>> shift) & 1);
}

function makeCodewords(value: string): number[] {
  const encoded = new TextEncoder().encode(value);
  if (encoded.length > 154) throw new RangeError('pairing URI is too long for the local QR encoder');
  const bits: number[] = [];
  appendBits(bits, 0b0100, 4); // byte mode
  appendBits(bits, encoded.length, 8);
  for (const byte of encoded) appendBits(bits, byte, 8);
  appendBits(bits, 0, Math.min(4, DATA_CODEWORDS * 8 - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);
  const bytes: number[] = [];
  for (let index = 0; index < bits.length; index += 8) {
    let byte = 0;
    for (let offset = 0; offset < 8; offset += 1) byte = (byte << 1) | bits[index + offset]!;
    bytes.push(byte);
  }
  let pad = 0;
  while (bytes.length < DATA_CODEWORDS) bytes.push(pad++ % 2 === 0 ? 0xec : 0x11);
  return bytes;
}

function interleave(value: string): number[] {
  const data = makeCodewords(value);
  const { exponent, log } = createGaloisTables();
  const generator = generatorPolynomial(ERROR_CORRECTION_CODEWORDS, exponent, log);
  const dataBlocks: number[][] = [];
  const errorBlocks: number[][] = [];
  for (let block = 0; block < BLOCK_COUNT; block += 1) {
    const bytes = data.slice(block * DATA_PER_BLOCK, (block + 1) * DATA_PER_BLOCK);
    dataBlocks.push(bytes);
    errorBlocks.push(errorCorrection(bytes, generator, exponent, log));
  }
  const result: number[] = [];
  for (let index = 0; index < DATA_PER_BLOCK; index += 1) {
    for (const block of dataBlocks) result.push(block[index]!);
  }
  for (let index = 0; index < ERROR_CORRECTION_CODEWORDS; index += 1) {
    for (const block of errorBlocks) result.push(block[index]!);
  }
  if (result.length !== TOTAL_CODEWORDS) throw new Error('local QR codeword interleave is invalid');
  return result;
}

function finder(matrix: Cell[][], row: number, column: number): void {
  for (let y = -1; y <= 7; y += 1) {
    for (let x = -1; x <= 7; x += 1) {
      const targetRow = row + y;
      const targetColumn = column + x;
      if (targetRow < 0 || targetColumn < 0 || targetRow >= SIZE || targetColumn >= SIZE) continue;
      matrix[targetRow]![targetColumn] =
        x >= 0 && x <= 6 && y >= 0 && y <= 6
          && (x === 0 || x === 6 || y === 0 || y === 6 || (x >= 2 && x <= 4 && y >= 2 && y <= 4));
    }
  }
}

function alignment(matrix: Cell[][], row: number, column: number): void {
  for (let y = -2; y <= 2; y += 1) {
    for (let x = -2; x <= 2; x += 1) {
      const distance = Math.max(Math.abs(x), Math.abs(y));
      if (matrix[row + y]?.[column + x] !== null) continue;
      matrix[row + y]![column + x] = distance === 2 || distance === 0;
    }
  }
}

function maskApplies(mask: number, row: number, column: number): boolean {
  switch (mask) {
    case 0: return (row + column) % 2 === 0;
    case 1: return row % 2 === 0;
    case 2: return column % 3 === 0;
    case 3: return (row + column) % 3 === 0;
    case 4: return (Math.floor(row / 2) + Math.floor(column / 3)) % 2 === 0;
    case 5: return (row * column) % 2 + (row * column) % 3 === 0;
    case 6: return ((row * column) % 2 + (row * column) % 3) % 2 === 0;
    default: return ((row * column) % 3 + (row + column) % 2) % 2 === 0;
  }
}

function formatBits(mask: number): number {
  let value = mask | (1 << 3); // error correction level L is 01
  let shifted = value << 10;
  const generator = 0x537;
  while (shifted.toString(2).length >= generator.toString(2).length) {
    shifted ^= generator << (shifted.toString(2).length - generator.toString(2).length);
  }
  return ((value << 10) | shifted) ^ 0x5412;
}

function format(matrix: Cell[][], mask: number): void {
  const bits = formatBits(mask);
  for (let index = 0; index < 15; index += 1) {
    const bit = ((bits >>> index) & 1) !== 0;
    const row = index < 6 ? index : index < 8 ? index + 1 : SIZE - 15 + index;
    const column = index < 8 ? SIZE - index - 1 : index < 9 ? 7 : 15 - index - 1;
    matrix[row]![8] = bit;
    matrix[8]![column] = bit;
  }
  matrix[SIZE - 8]![8] = true;
}

function versionBits(): number {
  let shifted = VERSION << 12;
  const generator = 0x1f25;
  while (shifted.toString(2).length >= generator.toString(2).length) {
    shifted ^= generator << (shifted.toString(2).length - generator.toString(2).length);
  }
  return (VERSION << 12) | shifted;
}

function versionInformation(matrix: Cell[][]): void {
  const bits = versionBits();
  for (let index = 0; index < 18; index += 1) {
    const bit = ((bits >>> index) & 1) !== 0;
    matrix[Math.floor(index / 3)]![index % 3 + SIZE - 11] = bit;
    matrix[index % 3 + SIZE - 11]![Math.floor(index / 3)] = bit;
  }
}

function createFunctionMatrix(mask: number): Cell[][] {
  const matrix: Cell[][] = Array.from({ length: SIZE }, () => new Array<Cell>(SIZE).fill(null));
  finder(matrix, 0, 0); finder(matrix, SIZE - 7, 0); finder(matrix, 0, SIZE - 7);
  const positions = [6, 22, 38];
  for (const row of positions) for (const column of positions) alignment(matrix, row, column);
  for (let index = 8; index < SIZE - 8; index += 1) {
    if (matrix[6]![index] === null) matrix[6]![index] = index % 2 === 0;
    if (matrix[index]![6] === null) matrix[index]![6] = index % 2 === 0;
  }
  format(matrix, mask);
  versionInformation(matrix);
  return matrix;
}

function penalty(matrix: Cell[][]): number {
  let score = 0;
  const scan = (line: boolean[]) => {
    let run = 1;
    for (let index = 1; index < line.length; index += 1) {
      if (line[index] === line[index - 1]) run += 1;
      else { if (run >= 5) score += 3 + run - 5; run = 1; }
    }
    if (run >= 5) score += 3 + run - 5;
  };
  for (let row = 0; row < SIZE; row += 1) scan(matrix[row]!.map((cell) => cell === true));
  for (let column = 0; column < SIZE; column += 1) scan(matrix.map((row) => row[column] === true));
  for (let row = 0; row < SIZE - 1; row += 1) {
    for (let column = 0; column < SIZE - 1; column += 1) {
      const value = matrix[row]![column];
      if (value !== null && value === matrix[row + 1]![column] && value === matrix[row]![column + 1] && value === matrix[row + 1]![column + 1]) score += 3;
    }
  }
  return score;
}

function buildMatrix(value: string, mask: number): boolean[][] {
  const matrix = createFunctionMatrix(mask);
  const bits: number[] = [];
  for (const byte of interleave(value)) appendBits(bits, byte, 8);
  let bitIndex = 0;
  let upward = true;
  for (let column = SIZE - 1; column > 0; column -= 2) {
    if (column === 6) column -= 1;
    for (let offset = 0; offset < SIZE; offset += 1) {
      const row = upward ? SIZE - 1 - offset : offset;
      for (const targetColumn of [column, column - 1]) {
        if (matrix[row]![targetColumn] !== null) continue;
        const bit = bits[bitIndex++] === 1;
        matrix[row]![targetColumn] = bit !== maskApplies(mask, row, targetColumn);
      }
    }
    upward = !upward;
  }
  if (bitIndex !== bits.length || matrix.some((row) => row.some((cell) => cell === null))) throw new Error('local QR matrix is incomplete');
  return matrix as boolean[][];
}

function escapeXml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

export function buildTotpOtpauthUri(targetId: string, secretBase32: string): string {
  const label = `Material Designer:${targetId}`;
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer: 'Material Designer',
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  });
  return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
}

export function renderTotpQrSvg(uri: string, accessibleLabel: string): string {
  const matrix = Array.from({ length: 8 }, (_, mask) => buildMatrix(uri, mask));
  const selected = matrix.reduce((best, current) => penalty(current) < penalty(best) ? current : best);
  const dimension = SIZE + QUIET_ZONE * 2;
  const paths: string[] = [];
  for (let row = 0; row < SIZE; row += 1) {
    for (let column = 0; column < SIZE; column += 1) {
      if (selected[row]![column]) paths.push(`M${column + QUIET_ZONE} ${row + QUIET_ZONE}h1v1h-1z`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dimension} ${dimension}" role="img" aria-label="${escapeXml(accessibleLabel)}" shape-rendering="crispEdges"><title>${escapeXml(accessibleLabel)}</title><rect width="100%" height="100%" fill="#fff"/><path d="${paths.join('')}" fill="#000"/></svg>`;
}

/** Return the selected QR matrix so an independent local decoder can verify
 * the exact URI without trusting the SVG text or a screenshot shape. */
export function renderTotpQrMatrix(uri: string): boolean[][] {
  const matrices = Array.from({ length: 8 }, (_, mask) => buildMatrix(uri, mask));
  return matrices.reduce((best, current) => penalty(current) < penalty(best) ? current : best);
}

function readFormatMask(matrix: boolean[][]): number | null {
  let bits = 0;
  for (let index = 0; index < 15; index += 1) {
    const row = index < 6 ? index : index < 8 ? index + 1 : SIZE - 15 + index;
    if (matrix[row]?.[8]) bits |= 1 << index;
  }
  for (let mask = 0; mask < 8; mask += 1) if (formatBits(mask) === bits) return mask;
  return null;
}

function readVersion(matrix: boolean[][]): number | null {
  let bits = 0;
  for (let index = 0; index < 18; index += 1) {
    if (matrix[Math.floor(index / 3)]?.[index % 3 + SIZE - 11]) bits |= 1 << index;
  }
  return bits === versionBits() ? VERSION : null;
}

function hasValidReedSolomon(codewords: readonly number[]): boolean {
  if (codewords.length < TOTAL_CODEWORDS) return false;
  const { exponent, log } = createGaloisTables();
  const generator = generatorPolynomial(ERROR_CORRECTION_CODEWORDS, exponent, log);
  for (let block = 0; block < BLOCK_COUNT; block += 1) {
    const data: number[] = [];
    const error: number[] = [];
    for (let index = 0; index < DATA_PER_BLOCK; index += 1) data.push(codewords[index * BLOCK_COUNT + block]!);
    for (let index = 0; index < ERROR_CORRECTION_CODEWORDS; index += 1) error.push(codewords[DATA_CODEWORDS + index * BLOCK_COUNT + block]!);
    const expected = errorCorrection(data, generator, exponent, log);
    if (expected.some((value, index) => value !== error[index])) return false;
  }
  return true;
}

/** Decode the matrix emitted by this module locally, without network access.
 * This validates the byte-mode payload and the selected format/version fields,
 * then validates the interleaved Reed-Solomon blocks before extracting the data.
 * This independent verifier intentionally rejects a damaged matrix rather than
 * silently repairing it. */
export function decodeTotpQrMatrix(matrix: readonly (readonly boolean[])[]): string | null {
  if (matrix.length !== SIZE || matrix.some((row) => row.length !== SIZE)) return null;
  const normalized = matrix.map((row) => [...row]);
  const mask = readFormatMask(normalized);
  if (mask === null || readVersion(normalized) !== VERSION) return null;
  const functions = createFunctionMatrix(mask);
  const bits: number[] = [];
  let upward = true;
  for (let column = SIZE - 1; column > 0; column -= 2) {
    if (column === 6) column -= 1;
    for (let offset = 0; offset < SIZE; offset += 1) {
      const row = upward ? SIZE - 1 - offset : offset;
      for (const targetColumn of [column, column - 1]) {
        if (functions[row]![targetColumn] !== null) continue;
        bits.push((normalized[row]![targetColumn]! !== maskApplies(mask, row, targetColumn)) ? 1 : 0);
      }
    }
    upward = !upward;
  }
  const codewords: number[] = [];
  for (let index = 0; index < bits.length; index += 8) {
    let byte = 0;
    for (let offset = 0; offset < 8; offset += 1) byte = (byte << 1) | (bits[index + offset] ?? 0);
    codewords.push(byte);
  }
  if (!hasValidReedSolomon(codewords)) return null;
  const data: number[] = [];
  for (let index = 0; index < DATA_PER_BLOCK; index += 1) {
    data.push(codewords[index * 2]!);
    data.push(codewords[index * 2 + 1]!);
  }
  const dataBits: number[] = [];
  for (const byte of data) appendBits(dataBits, byte, 8);
  let cursor = 0;
  const read = (count: number): number => {
    let value = 0;
    for (let index = 0; index < count; index += 1) value = (value << 1) | (dataBits[cursor++] ?? 0);
    return value;
  };
  if (read(4) !== 0b0100) return null;
  const length = read(8);
  if (length > 154 || cursor + length * 8 > dataBits.length) return null;
  const bytes = new Uint8Array(length);
  for (let index = 0; index < length; index += 1) bytes[index] = read(8);
  return new TextDecoder().decode(bytes);
}

export function isQrBase32(value: string): boolean {
  if (value.length === 0 || value.length > 64 || !/^[A-Z2-7]+=*$/.test(value)) return false;
  const firstPadding = value.indexOf('=');
  const expectedPadding: Record<number, number> = { 0: 0, 2: 6, 4: 4, 5: 3, 7: 1 };
  const body = firstPadding < 0 ? value : value.slice(0, firstPadding);
  const bodyLength = body.length;
  const paddingLength = firstPadding < 0 ? 0 : value.length - firstPadding;
  if (!Object.prototype.hasOwnProperty.call(BASE32_UNUSED_BITS_BY_RESIDUE, bodyLength % 8) && bodyLength % 8 !== 0) return false;
  if (firstPadding >= 0 && (value.length % 8 !== 0 || expectedPadding[bodyLength % 8] !== paddingLength)) return false;
  const unusedBits = BASE32_UNUSED_BITS_BY_RESIDUE[body.length % 8] ?? 0;
  return unusedBits === 0 || (ALPHABET.indexOf(body.at(-1)!) & ((1 << unusedBits) - 1)) === 0;
}

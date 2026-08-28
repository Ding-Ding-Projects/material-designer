import { createHmac } from "node:crypto";

export const AUTHENTICATOR_ALGORITHMS = ["SHA-1", "SHA-256", "SHA-512"] as const;
export type AuthenticatorAlgorithm = (typeof AUTHENTICATOR_ALGORITHMS)[number];
export const AUTHENTICATOR_DIGITS = [6, 7, 8] as const;
export type AuthenticatorDigits = (typeof AUTHENTICATOR_DIGITS)[number];

export type OtpParameters = {
  issuer: string;
  account: string;
  secret: Uint8Array;
  algorithm: AuthenticatorAlgorithm;
  digits: AuthenticatorDigits;
  period: number;
};

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const BASE32_LOOKUP = new Map([...BASE32_ALPHABET].map((character, index) => [character, index]));
const MAX_SECRET_BYTES = 128;
const MAX_URI_BYTES = 134;
const MAX_PERIOD_SECONDS = 86_400;

export function decodeBase32(value: string): Uint8Array {
  if (typeof value !== "string" || value.length === 0 || value.length > 208) {
    throw new Error("Base32 secret is empty or exceeds the bounded length.");
  }
  const compact = value.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z2-7]+=*$/.test(compact) || compact.indexOf("=") >= 0 && !/^\S*={1,6}$/.test(compact)) {
    throw new Error("Base32 secret contains an invalid character or padding.");
  }
  const firstPadding = compact.indexOf("=");
  const content = firstPadding === -1 ? compact : compact.slice(0, firstPadding);
  const padding = firstPadding === -1 ? "" : compact.slice(firstPadding);
  if (padding && (compact.length % 8 !== 0 || padding.length > 6)) {
    throw new Error("Base32 padding is not canonical.");
  }
  if (padding && padding.length !== (8 - (content.length % 8)) % 8) {
    throw new Error("Base32 padding length does not match the payload.");
  }
  if (content.length % 8 === 1 || content.length % 8 === 3 || content.length % 8 === 6) {
    throw new Error("Base32 length has an impossible remainder.");
  }
  const output: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const character of content) {
    const digit = BASE32_LOOKUP.get(character);
    if (digit === undefined) throw new Error("Base32 secret contains an invalid character.");
    buffer = (buffer << 5) | digit;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      output.push((buffer >>> bits) & 0xff);
    }
  }
  if (bits > 0 && (buffer & ((1 << bits) - 1)) !== 0) {
    throw new Error("Base32 secret has non-zero unused trailing bits.");
  }
  if (output.length === 0 || output.length > MAX_SECRET_BYTES) {
    throw new Error("Base32 secret is outside the supported byte bound.");
  }
  return Uint8Array.from(output);
}

export function encodeBase32(bytes: Uint8Array): string {
  if (bytes.length === 0 || bytes.length > MAX_SECRET_BYTES) throw new Error("Secret is outside the supported byte bound.");
  let output = "";
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      output += BASE32_ALPHABET[(buffer >>> bits) & 31];
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(buffer << (5 - bits)) & 31];
  return output;
}

function decodeQuery(uri: URL): OtpParameters {
  const secretText = uri.searchParams.get("secret");
  if (!secretText) throw new Error("The otpauth URI does not contain a secret.");
  const algorithmText = (uri.searchParams.get("algorithm") ?? "SHA1").toUpperCase().replace("-", "");
  const algorithm = algorithmText === "SHA1" ? "SHA-1" : algorithmText === "SHA256" ? "SHA-256" : algorithmText === "SHA512" ? "SHA-512" : null;
  if (!algorithm) throw new Error("The otpauth URI names an unsupported algorithm.");
  const digitsValue = Number(uri.searchParams.get("digits") ?? "6");
  if (!AUTHENTICATOR_DIGITS.includes(digitsValue as AuthenticatorDigits)) throw new Error("The otpauth URI names unsupported digits.");
  const period = Number(uri.searchParams.get("period") ?? "30");
  if (!Number.isSafeInteger(period) || period < 1 || period > MAX_PERIOD_SECONDS) throw new Error("The otpauth URI period is outside the supported range.");
  const label = decodeURIComponent(uri.pathname.slice(1));
  const separator = label.indexOf(":");
  const issuer = uri.searchParams.get("issuer") ?? (separator >= 0 ? label.slice(0, separator) : "");
  const account = separator >= 0 ? label.slice(separator + 1) : label;
  if (!account || account.length > 256 || issuer.length > 256) throw new Error("The otpauth label is empty or too long.");
  return { issuer, account, secret: decodeBase32(secretText), algorithm, digits: digitsValue as AuthenticatorDigits, period };
}

export function parseOtpauthUri(value: string): OtpParameters {
  if (typeof value !== "string" || value.length > 4096) throw new Error("The otpauth URI is outside the bounded length.");
  let uri: URL;
  try { uri = new URL(value); } catch { throw new Error("The otpauth value is not a valid URI."); }
  if (uri.protocol !== "otpauth:" || uri.hostname.toLowerCase() !== "totp" || uri.username || uri.password || uri.port || uri.hash) {
    throw new Error("Only local otpauth://totp/ URIs are accepted.");
  }
  return decodeQuery(uri);
}

export function buildOtpauthUri(parameters: OtpParameters): string {
  if (!parameters.account || parameters.account.length > 256) throw new Error("Account is empty or too long.");
  if (!AUTHENTICATOR_ALGORITHMS.includes(parameters.algorithm) || !AUTHENTICATOR_DIGITS.includes(parameters.digits)) throw new Error("Algorithm or digits are unsupported.");
  if (!Number.isSafeInteger(parameters.period) || parameters.period < 1 || parameters.period > MAX_PERIOD_SECONDS) throw new Error("Period is outside the supported range.");
  const label = parameters.issuer ? `${parameters.issuer}:${parameters.account}` : parameters.account;
  const query = new URLSearchParams({ secret: encodeBase32(parameters.secret), algorithm: parameters.algorithm.replace("-", ""), digits: String(parameters.digits), period: String(parameters.period) });
  if (parameters.issuer) query.set("issuer", parameters.issuer);
  const uri = `otpauth://totp/${encodeURIComponent(label)}?${query.toString()}`;
  if (new TextEncoder().encode(uri).length > MAX_URI_BYTES) throw new Error("The URI is too large for the bundled local QR encoder.");
  return uri;
}

function assertCounter(counter: bigint): void {
  if (counter < 0n || counter > 0xffffffffffffffffn) throw new Error("HOTP counter is outside the RFC 4226 range.");
}

function hashName(algorithm: AuthenticatorAlgorithm): "sha1" | "sha256" | "sha512" {
  return algorithm === "SHA-1" ? "sha1" : algorithm === "SHA-256" ? "sha256" : "sha512";
}

export function hotp(secret: Uint8Array, counter: bigint, algorithm: AuthenticatorAlgorithm = "SHA-1", digits: AuthenticatorDigits = 6): string {
  assertCounter(counter);
  if (!AUTHENTICATOR_DIGITS.includes(digits)) throw new Error("Digits are outside the supported range.");
  const counterBytes = Buffer.alloc(8);
  counterBytes.writeBigUInt64BE(counter);
  const digest = createHmac(hashName(algorithm), Buffer.from(secret)).update(counterBytes).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3];
  const modulus = 10 ** digits;
  return String(binary % modulus).padStart(digits, "0");
}

export function totp(parameters: Pick<OtpParameters, "secret" | "algorithm" | "digits" | "period">, nowMs: number): string {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) throw new Error("Current time is invalid.");
  const counter = BigInt(Math.floor(nowMs / 1000 / parameters.period));
  return hotp(parameters.secret, counter, parameters.algorithm, parameters.digits);
}

export function nextTotp(parameters: Pick<OtpParameters, "secret" | "algorithm" | "digits" | "period">, nowMs: number): string {
  return totp(parameters, (Math.floor(nowMs / 1000 / parameters.period) + 1) * parameters.period * 1000);
}

export function secondsRemaining(period: number, nowMs: number): number {
  if (!Number.isSafeInteger(period) || period < 1 || !Number.isSafeInteger(nowMs) || nowMs < 0) throw new Error("Invalid period or time.");
  return period - (Math.floor(nowMs / 1000) % period);
}

export function clockSkewWarning(localNowMs: number, trustedNowMs: number, toleranceMs = 90_000): string | null {
  if (!Number.isSafeInteger(localNowMs) || !Number.isSafeInteger(trustedNowMs) || !Number.isSafeInteger(toleranceMs) || toleranceMs < 0) throw new Error("Invalid clock-skew inputs.");
  const drift = localNowMs - trustedNowMs;
  return Math.abs(drift) > toleranceMs ? `Clock differs from the trusted reference by ${Math.round(drift / 1000)} seconds.` : null;
}

export type QrMatrix = { version: 5 | 6; size: 37 | 41; modules: readonly (readonly boolean[])[] };

// The QR route is deliberately local and deterministic. It is byte-mode QR version 5-L,
// enough for the bounded otpauth URI above, and does not call a web service or write an image.
export function encodeLocalQr(payload: string): QrMatrix {
  const bytes = new TextEncoder().encode(payload);
  const version = bytes.length <= 106 ? 5 : bytes.length <= 134 ? 6 : null;
  if (!version) throw new Error("QR payload exceeds the local bounded capacity.");
  const size = 4 * version + 17;
  const modules = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  const reserved = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  const mark = (x: number, y: number, value = false) => { if (x >= 0 && y >= 0 && x < size && y < size) { reserved[y][x] = true; modules[y][x] = value; } };
  const finder = (left: number, top: number) => { for (let y = -1; y <= 7; y++) for (let x = -1; x <= 7; x++) { const on = x >= 0 && x <= 6 && y >= 0 && y <= 6 && (x === 0 || x === 6 || y === 0 || y === 6 || (x >= 2 && x <= 4 && y >= 2 && y <= 4)); mark(left + x, top + y, on); } };
  finder(0, 0); finder(size - 7, 0); finder(0, size - 7);
  for (let i = 8; i < size - 8; i++) { mark(i, 6, i % 2 === 0); mark(6, i, i % 2 === 0); }
  const alignment = version === 5 ? [6, 30] : [6, 34];
  for (const y of alignment) for (const x of alignment) {
    if ((x <= 8 && y <= 8) || (x >= size - 9 && y <= 8) || (x <= 8 && y >= size - 9)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) mark(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  for (let i = 0; i < 9; i++) { mark(8, i); mark(i, 8); }
  for (let i = 0; i < 8; i++) { mark(size - 1 - i, 8); mark(8, size - 1 - i); }
  mark(8, size - 8, true);
  const bitStream: number[] = [];
  const pushBits = (value: number, count: number) => { for (let bit = count - 1; bit >= 0; bit--) bitStream.push((value >>> bit) & 1); };
  pushBits(0b0100, 4); pushBits(bytes.length, 8); for (const byte of bytes) pushBits(byte, 8);
  const dataCodewords = version === 5 ? 108 : 136;
  while (bitStream.length < dataCodewords * 8 && bitStream.length % 8 !== 0) bitStream.push(0);
  const data: number[] = [];
  for (let i = 0; i < bitStream.length; i += 8) data.push(bitStream.slice(i, i + 8).reduce((value, bit) => (value << 1) | bit, 0));
  const pads = [0xec, 0x11]; let padIndex = 0; while (data.length < dataCodewords) data.push(pads[padIndex++ % 2]);
  const gfMultiply = (a: number, b: number) => { let result = 0; let left = a; let right = b; while (right) { if (right & 1) result ^= left; left = (left << 1) ^ ((left & 0x80) ? 0x11d : 0); right >>>= 1; } return result & 0xff; };
  const gfPow = (base: number, exponent: number) => { let result = 1; for (let i = 0; i < exponent; i++) result = gfMultiply(result, base); return result; };
  const blockData = version === 5 ? [data] : [data.slice(0, 68), data.slice(68)]; const eccPerBlock = version === 5 ? 26 : 18;
  const generator: number[] = [1]; for (let i = 0; i < eccPerBlock; i++) { const next = Array(generator.length + 1).fill(0); const root = gfPow(2, i); for (let j = 0; j < generator.length; j++) { next[j] ^= generator[j]; next[j + 1] ^= gfMultiply(generator[j], root); } generator.splice(0, generator.length, ...next); }
  const blockEcc = blockData.map((block) => { const ecc = Array(eccPerBlock).fill(0); for (const byte of block) { const factor = byte ^ ecc[0]; ecc.shift(); ecc.push(0); for (let j = 0; j < ecc.length; j++) ecc[j] ^= gfMultiply(generator[j + 1] ?? 0, factor); } return ecc; });
  const codewords: number[] = []; for (let index = 0; index < Math.max(...blockData.map((block) => block.length)); index++) for (const block of blockData) if (block[index] !== undefined) codewords.push(block[index]!); for (let index = 0; index < eccPerBlock; index++) for (const ecc of blockEcc) codewords.push(ecc[index]!);
  const bits = codewords.flatMap((byte) => Array.from({ length: 8 }, (_, index) => (byte >>> (7 - index)) & 1));
  let bitIndex = 0; let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) { if (right === 6) right--; for (let offset = 0; offset < size; offset++) { const y = upward ? size - 1 - offset : offset; for (const x of [right, right - 1]) if (!reserved[y][x]) { const raw = bits[bitIndex++] ?? 0; modules[y][x] = Boolean(raw ^ ((x + y) % 2 === 0)); } } upward = !upward; }
  const formatData = (0b01 << 3) | 0; let format = formatData << 10; let remainder = format; for (let bit = 14; bit >= 10; bit--) if ((remainder >>> bit) & 1) remainder ^= 0x537 << (bit - 10); format = (format | remainder) ^ 0x5412;
  for (let i = 0; i < 15; i++) { const value = Boolean((format >>> i) & 1); if (i < 6) modules[i][8] = value; else if (i < 8) modules[i + 1][8] = value; else modules[size - 15 + i][8] = value; if (i < 8) modules[8][size - i - 1] = value; else if (i < 9) modules[8][15 - i] = value; else modules[8][15 - i - 1] = value; }
  return { version, size, modules: modules.map((row) => Object.freeze(row.slice())) };
}

export function decodeLocalQr(matrix: QrMatrix | readonly (readonly boolean[])[]): string {
  const rows = "modules" in matrix ? matrix.modules : matrix; const version = rows.length === 37 ? 5 : rows.length === 41 ? 6 : null;
  if (!version || rows.some((row) => row.length !== rows.length)) throw new Error("The local QR decoder accepts only bounded version 5 or 6 matrices.");
  const size = rows.length; const reserved = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  const mark = (x: number, y: number) => { if (x >= 0 && y >= 0 && x < size && y < size) reserved[y][x] = true; };
  const reserveFinder = (left: number, top: number) => { for (let y = -1; y <= 7; y++) for (let x = -1; x <= 7; x++) mark(left + x, top + y); };
  reserveFinder(0, 0); reserveFinder(size - 7, 0); reserveFinder(0, size - 7);
  for (let i = 8; i < size - 8; i++) { mark(i, 6); mark(6, i); }
  const alignment = version === 5 ? [6, 30] : [6, 34]; for (const y of alignment) for (const x of alignment) { if ((x <= 8 && y <= 8) || (x >= size - 9 && y <= 8) || (x <= 8 && y >= size - 9)) continue; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) mark(x + dx, y + dy); }
  for (let i = 0; i < 9; i++) { mark(8, i); mark(i, 8); }
  for (let i = 0; i < 8; i++) { mark(size - 1 - i, 8); mark(8, size - 1 - i); }
  mark(8, size - 8);
  const bits: number[] = []; let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) { if (right === 6) right--; for (let offset = 0; offset < size; offset++) { const y = upward ? size - 1 - offset : offset; for (const x of [right, right - 1]) if (!reserved[y][x]) bits.push(Number(Boolean(rows[y][x]) ^ ((x + y) % 2 === 0))); } upward = !upward; }
  if (bits.length < 12 || bits.slice(0, 4).join("") !== "0100") throw new Error("The local QR matrix has an unsupported mode.");
  const read = (start: number, count: number) => bits.slice(start, start + count).reduce((value, bit) => (value << 1) | bit, 0);
  const length = read(4, 8); const capacity = version === 5 ? 106 : 134; if (length > capacity || 12 + length * 8 > bits.length) throw new Error("The local QR matrix payload length is invalid.");
  const bytes = Array.from({ length }, (_, index) => read(12 + index * 8, 8));
  try { return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bytes)); } catch { throw new Error("The local QR matrix payload is not valid UTF-8."); }
}

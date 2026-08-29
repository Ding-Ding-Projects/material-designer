#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PRIVACY_SCANNER_PATH = 'scripts/scan-lang-gui-evidence-privacy.mjs';
export const PRIVACY_SCANNER_NAME = 'material-designer-local-privacy-scanner';
export const PRIVACY_SCANNER_METHOD = 'bounded-byte-and-png-metadata-scan';
export const PRIVACY_SCANNER_METHOD_VERSION = 1;

const MAX_ARTIFACT_BYTES = 512 * 1024 * 1024;
const MAX_CAPTURE_BYTES = 128 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const PRIVATE_TEXT_PATTERNS = [
  { id: 'windows-user-path', expression: /[A-Za-z]:[\\/]Users[\\/][^\\/\0\r\n]{1,128}[\\/]/i },
  { id: 'mac-user-path', expression: /\/Users\/[^/\0\r\n]{1,128}\// },
  { id: 'linux-user-path', expression: /\/home\/[^/\0\r\n]{1,128}\// },
  { id: 'private-ipv4', expression: /\b(?:10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})\b/ },
  { id: 'github-token-shape', expression: /\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/ },
  { id: 'bearer-token-shape', expression: /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}\b/i },
  { id: 'private-key-block', expression: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
];

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function privacyInputSha256(artifactHash, captureHash) {
  return sha256(Buffer.from(`${artifactHash}\n${captureHash}\n`, 'utf8'));
}

function assertBuffer(value, label, maxBytes) {
  if (!Buffer.isBuffer(value)) throw new Error(`${label} must be a Buffer`);
  if (value.length === 0 || value.length > maxBytes) throw new Error(`${label} is outside privacy scan byte bounds`);
}

function decodedSearchViews(bytes) {
  const views = [bytes.toString('latin1')];
  if (bytes.length >= 2) {
    views.push(bytes.toString('utf16le'));
    const swapped = Buffer.allocUnsafe(bytes.length - (bytes.length % 2));
    for (let index = 0; index < swapped.length; index += 2) {
      swapped[index] = bytes[index + 1];
      swapped[index + 1] = bytes[index];
    }
    views.push(swapped.toString('utf16le'));
  }
  return views;
}

function findPrivateText(bytes, target) {
  const findings = [];
  const chunkBytes = 1024 * 1024;
  const overlapBytes = 1024;
  for (let offset = 0; offset < bytes.length; offset += chunkBytes - overlapBytes) {
    const chunk = bytes.subarray(offset, Math.min(bytes.length, offset + chunkBytes));
    for (const view of decodedSearchViews(chunk)) {
      for (const rule of PRIVATE_TEXT_PATTERNS) if (rule.expression.test(view) && !findings.some((finding) => finding.rule === rule.id && finding.target === target)) findings.push({ rule: rule.id, target });
    }
  }
  return findings;
}

function scanPngMetadata(bytes) {
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return [{ rule: 'capture-not-png', target: 'capture' }];
  const findings = [];
  let offset = 8;
  let sawIend = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const typeStart = offset + 4;
    const dataStart = offset + 8;
    const end = dataStart + length + 4;
    if (end > bytes.length) return [...findings, { rule: 'png-chunk-out-of-bounds', target: 'capture' }];
    const type = bytes.subarray(typeStart, dataStart).toString('ascii');
    if (['tEXt', 'zTXt', 'iTXt', 'eXIf'].includes(type)) findings.push({ rule: `png-${type}-metadata`, target: 'capture' });
    offset = end;
    if (type === 'IEND') {
      sawIend = true;
      break;
    }
  }
  if (!sawIend || offset !== bytes.length) findings.push({ rule: 'png-incomplete-or-trailing-data', target: 'capture' });
  return findings;
}

export function scanEvidencePrivacy({ artifactBytes, captureBytes, scannerBytes }) {
  assertBuffer(artifactBytes, 'artifact', MAX_ARTIFACT_BYTES);
  assertBuffer(captureBytes, 'capture', MAX_CAPTURE_BYTES);
  assertBuffer(scannerBytes, 'scanner', 1024 * 1024);
  const artifactHash = sha256(artifactBytes);
  const captureHash = sha256(captureBytes);
  const findings = [...findPrivateText(artifactBytes, 'artifact'), ...findPrivateText(captureBytes, 'capture'), ...scanPngMetadata(captureBytes)];
  return {
    schema: 'material-designer.lang-gui.privacy-report',
    version: 1,
    scanner: { name: PRIVACY_SCANNER_NAME, path: PRIVACY_SCANNER_PATH, sha256: sha256(scannerBytes) },
    method: PRIVACY_SCANNER_METHOD,
    methodVersion: PRIVACY_SCANNER_METHOD_VERSION,
    inputSha256: privacyInputSha256(artifactHash, captureHash),
    status: findings.length === 0 ? 'pass' : 'fail',
    findingCount: findings.length,
    artifact: { sha256: artifactHash },
    capture: { sha256: captureHash },
  };
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    const artifactPath = argumentValue('--artifact');
    const capturePath = argumentValue('--capture');
    if (!artifactPath || !capturePath) throw new Error('usage: scan-lang-gui-evidence-privacy.mjs --artifact <path> --capture <path>');
    const scannerBytes = fs.readFileSync(fileURLToPath(import.meta.url));
    const report = scanEvidencePrivacy({ artifactBytes: fs.readFileSync(artifactPath), captureBytes: fs.readFileSync(capturePath), scannerBytes });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (report.status !== 'pass') process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`privacy evidence scan failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

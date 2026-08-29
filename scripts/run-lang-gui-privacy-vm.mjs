#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const MAX_SCANNER_BYTES = 1024 * 1024;
const MAX_ARTIFACT_BYTES = 512 * 1024 * 1024;
const MAX_CAPTURE_BYTES = 128 * 1024 * 1024;

function fail(message) {
  throw new Error(message);
}

function argument(name) {
  const matches = process.argv.flatMap((value, index) => value === name ? [process.argv[index + 1]] : []);
  if (matches.length !== 1 || typeof matches[0] !== 'string' || matches[0].length === 0) fail(`missing or duplicate ${name}`);
  return path.resolve(matches[0]);
}

function readBounded(file, maximum, label) {
  const before = fs.statSync(file);
  if (!before.isFile() || before.size <= 0 || before.size > maximum) fail(`${label} is outside the byte bound`);
  const bytes = fs.readFileSync(file);
  const after = fs.statSync(file);
  if (bytes.length !== before.size || before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size) fail(`${label} changed while being read`);
  return bytes;
}

async function run() {
  const scannerPath = argument('--scanner');
  const artifactPath = argument('--artifact');
  const capturePath = argument('--capture');
  const scannerBytes = readBounded(scannerPath, MAX_SCANNER_BYTES, 'scanner');
  const artifactBytes = readBounded(artifactPath, MAX_ARTIFACT_BYTES, 'artifact');
  const captureBytes = readBounded(capturePath, MAX_CAPTURE_BYTES, 'capture');
  const scannerSource = scannerBytes.toString('utf8');
  if (!Buffer.from(scannerSource, 'utf8').equals(scannerBytes) || scannerSource.includes('\uFFFD')) fail('scanner is not canonical UTF-8');
  const sandbox = Object.create(null);
  Object.defineProperties(sandbox, {
    Buffer: { value: Buffer, enumerable: true, writable: false, configurable: false },
    Uint8Array: { value: Uint8Array, enumerable: true, writable: false, configurable: false },
  });
  const context = vm.createContext(sandbox, {
    name: 'material-designer-lang-gui-privacy',
    codeGeneration: { strings: false, wasm: false },
  });
  const scannerModule = new vm.SourceTextModule(scannerSource, {
    context,
    identifier: 'material-designer:privacy-scanner',
    initializeImportMeta: () => fail('import.meta is unavailable in the privacy scanner'),
    importModuleDynamically: () => fail('dynamic import is unavailable in the privacy scanner'),
  });
  const cryptoModule = new vm.SyntheticModule(['createHash'], function initialize() {
    this.setExport('createHash', createHash);
  }, { context, identifier: 'node:crypto' });
  await scannerModule.link(async (specifier) => {
    if (specifier !== 'node:crypto') fail(`scanner requested an unapproved import: ${specifier}`);
    return cryptoModule;
  });
  await scannerModule.evaluate({ timeout: 15000 });
  const scan = scannerModule.namespace.scanEvidencePrivacy;
  if (typeof scan !== 'function') fail('scanner does not export scanEvidencePrivacy');
  const report = scan({ artifactBytes, captureBytes, scannerBytes });
  process.stdout.write(`${JSON.stringify(report)}\n`);
  process.exitCode = report?.status === 'pass' ? 0 : 1;
}

try {
  await run();
} catch {
  process.stderr.write('privacy VM execution failed\n');
  process.exitCode = 2;
}

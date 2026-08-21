#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const inputFlag = process.argv.indexOf('--input');
if (inputFlag < 0 || !process.argv[inputFlag + 1]) throw new Error('Usage: validate-squirrel-runtime-receipt.mjs --input <receipt.json>');
const inputPath = resolve(process.argv[inputFlag + 1]);
const receipt = JSON.parse(readFileSync(inputPath, 'utf8').replace(/^\uFEFF/, ''));
const fail = (message) => { throw new Error(message); };
const expect = (condition, message) => { if (!condition) fail(message); };
const isHash = (value) => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const hashFile = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

expect(receipt.version === 1, 'runtime receipt version must be 1');
expect(/^[0-9a-f]{40}$/.test(receipt.sourceCommit), 'sourceCommit must be a lowercase 40-character Git SHA');
expect(receipt.route === 'cheap-lowlevel-headless', 'runtime route must be cheap-lowlevel-headless');
expect(receipt.privacy?.visibleDesktopUntouched === true, 'visible desktop isolation is not proved');
expect(receipt.privacy?.disposableOperatingSystemBoundary === true, 'disposable operating-system boundary is not proved');
expect(receipt.privacy?.existingUserInstallationAbsent === true, 'absence of an existing user installation is not proved');
expect(receipt.privacy?.taskOwnedProfile === true, 'task-owned profile is not proved');
expect(receipt.privacy?.unrelatedWindowsObserved === false, 'unrelated windows were observed');

const installerPath = resolve(receipt.installerPath);
expect(statSync(installerPath).isFile(), 'installerPath is not a file');
expect(isHash(receipt.installerSha256) && hashFile(installerPath) === receipt.installerSha256, 'installer hash does not match');
expect(receipt.installation?.setupExitCode === 0, 'setup did not exit successfully');
const installedPath = resolve(receipt.installation?.installedExecutablePath ?? '');
expect(statSync(installedPath).isFile(), 'installed executable is missing');
expect(isHash(receipt.installation?.installedExecutableSha256) && hashFile(installedPath) === receipt.installation.installedExecutableSha256, 'installed executable hash does not match');
expect(typeof receipt.installation?.candidateVersion === 'string' && receipt.installation.candidateVersion.length > 0, 'candidate version is missing');

expect(Number.isInteger(receipt.launch?.pid) && receipt.launch.pid > 0, 'launch pid is invalid');
expect(/^0x[0-9a-f]+$/i.test(receipt.launch?.hwnd ?? ''), 'launch hwnd is invalid');
expect(receipt.launch?.className === 'Chrome_WidgetWin_1', 'launch window class is not the application window');
expect(receipt.launch?.processPath === receipt.installation.installedExecutablePath, 'launch process path is not the installed executable');
expect(receipt.launch?.installedArtifact === true, 'launch is not identified as the installed artifact');
expect(receipt.launch?.width > 0 && receipt.launch?.height > 0, 'launch window has zero dimensions');
expect(receipt.launch?.processImageSha256 === receipt.installation.installedExecutableSha256, 'launched process image hash does not match the installed executable');
const screenshotPath = resolve(receipt.launch?.screenshotPath ?? '');
expect(statSync(screenshotPath).isFile(), 'installed-app screenshot is missing');
expect(isHash(receipt.launch?.screenshotSha256) && hashFile(screenshotPath) === receipt.launch.screenshotSha256, 'installed-app screenshot hash does not match');
expect(receipt.launch?.screenshotWidth === receipt.launch?.width && receipt.launch?.screenshotHeight === receipt.launch?.height, 'screenshot dimensions do not match the launched window');

const requiredStates = ['available', 'downloading', 'ready-to-restart'];
const observed = receipt.update?.observedStates ?? [];
expect(observed.length >= requiredStates.length, 'updater state sequence is incomplete');
for (let index = 0; index < requiredStates.length; index += 1) {
  expect(observed[index]?.state === requiredStates[index], `updater state ${index} must be ${requiredStates[index]}`);
  expect(!Number.isNaN(Date.parse(observed[index]?.at)), `updater state ${requiredStates[index]} has no valid timestamp`);
  if (index > 0) expect(Date.parse(observed[index].at) >= Date.parse(observed[index - 1].at), 'updater timestamps are out of order');
}
for (const key of ['metadataValidated', 'packageHashValidated', 'unsignedWarningVisible', 'restartActionVisible', 'laterActionVisible', 'unsavedWorkProtectionVerified']) {
  expect(receipt.update?.[key] === true, `updater proof is missing ${key}`);
}
expect(/^https:\/\//.test(receipt.update?.feedUrl ?? ''), 'updater feed must use HTTPS');
expect(/^https:\/\//.test(receipt.update?.releaseNotesUrl ?? ''), 'release notes URL must use HTTPS');
expect(receipt.update?.targetVersion !== receipt.installation?.candidateVersion, 'updater target must differ from the installed candidate');
expect(receipt.cleanup?.targetsAreExact === true && receipt.cleanup?.disposableBoundary === true, 'cleanup boundary is not exact and disposable');
expect(isHash(receipt.cleanup?.ledgerSha256), 'cleanup ledger hash is missing');
const ledgerPath = resolve(receipt.cleanup?.ledgerPath ?? '');
expect(statSync(ledgerPath).isFile() && hashFile(ledgerPath) === receipt.cleanup.ledgerSha256, 'cleanup ledger hash does not match');

process.stdout.write(JSON.stringify({ ok: true, input: inputPath, sourceCommit: receipt.sourceCommit }) + '\n');

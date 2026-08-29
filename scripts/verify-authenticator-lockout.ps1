[CmdletBinding()]
param([switch]$SelfTest)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$files = [ordered]@{
  protocol = Join-Path $root 'design/apps/desktop/src/main/authenticator/protocol.ts'
  destination = Join-Path $root 'design/apps/desktop/src/main/authenticator/destination.ts'
  store = Join-Path $root 'design/apps/desktop/src/main/authenticator/store.ts'
  history = Join-Path $root 'design/apps/desktop/src/main/authenticator/history.ts'
  vault = Join-Path $root 'design/apps/desktop/src/main/authenticator/electron-vault.ts'
  confirmation = Join-Path $root 'design/apps/desktop/src/main/authenticator/super-confirmation.ts'
  host = Join-Path $root 'design/apps/desktop/src/main/authenticator/host.ts'
  bridge = Join-Path $root 'design/apps/desktop/src/main/authenticator/bridge.ts'
  ladder = Join-Path $root 'design/apps/desktop/src/main/lockout/service.ts'
  ladderProtocol = Join-Path $root 'design/apps/desktop/src/main/lockout/protocol.ts'
  destinationUi = Join-Path $root 'design/apps/web/src/components/authenticator/AuthenticatorDestination.tsx'
  historyUi = Join-Path $root 'design/apps/web/src/components/authenticator/HistoryPanel.tsx'
  ladderUi = Join-Path $root 'design/apps/web/src/components/unlock-ladder/UnlockLadder.tsx'
  ladderCss = Join-Path $root 'design/apps/web/src/components/unlock-ladder/UnlockLadder.module.css'
  contracts = Join-Path $root 'design/apps/web/src/components/authenticator/contracts.ts'
  exports = Join-Path $root 'design/apps/web/src/components/authenticator/export.ts'
  webProtocol = Join-Path $root 'design/apps/web/src/components/authenticator/protocol.ts'
  tests = Join-Path $root 'design/apps/desktop/tests/main/authenticator-lockout.test.ts'
  historyTests = Join-Path $root 'design/apps/desktop/tests/main/authenticator-history.test.ts'
  hostTests = Join-Path $root 'design/apps/desktop/tests/main/authenticator-host.test.ts'
  bridgeTests = Join-Path $root 'design/apps/desktop/tests/main/authenticator-bridge.test.ts'
  webProtocolTests = Join-Path $root 'design/apps/web/tests/components/authenticator/protocol.test.ts'
  exportTests = Join-Path $root 'design/apps/web/tests/components/authenticator/export.test.ts'
}

function Read-Text([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "Missing source file: $($Path.Replace($root, '<root>'))" }
  [System.IO.File]::ReadAllText($Path)
}

function Strip-Trivia([string]$Text) {
  $withoutBlocks = [regex]::Replace($Text, '/\*[\s\S]*?\*/', '')
  return [regex]::Replace($withoutBlocks, '(?m)^\s*//.*$', '')
}

function Has-FixtureFragment([string]$Text, [string]$Needle) {
  return $Text.IndexOf($Needle, [System.StringComparison]::Ordinal) -ge 0
}

function Require-Exact([string]$Text, [string]$Pattern, [string]$Name) {
  $code = Strip-Trivia $Text
  $count = [regex]::Matches($code, $Pattern, [Text.RegularExpressions.RegexOptions]::Multiline).Count
  if ($count -ne 1) { throw "Missing or duplicate exact contract ($count): $Name" }
}

function Validate-Sources([hashtable]$source) {
  Require-Exact $source.protocol '^\s*export function decodeBase32\(' 'strict Base32 decoder'
  Require-Exact $source.protocol '^\s*export function parseOtpauthUri\(' 'otpauth URI parser'
  Require-Exact $source.protocol '^\s*export function parseOtpauthJson\(' 'documented otpauth JSON parser'
  Require-Exact $source.protocol '^\s*export function buildOtpauthUri\(' 'otpauth URI builder'
  Require-Exact $source.protocol '^\s*export function hotp\(' 'HOTP implementation'
  Require-Exact $source.protocol '^\s*export function totp\(' 'TOTP implementation'
  Require-Exact $source.protocol '^\s*export function encodeLocalQr\(' 'local QR encoder'
  Require-Exact $source.protocol '^\s*export function decodeLocalQr\(' 'local QR decoder'
  Require-Exact $source.protocol '^\s*export function generateSecret\(' 'local secret generation'
  Require-Exact $source.protocol '^\s*export function verifyLocalQrParity\(' 'Reed-Solomon parity verifier'
  Require-Exact $source.protocol '^\s*const MAX_OTPAUTH_JSON_DEPTH = 12;\s*$' 'bounded JSON traversal depth'
  Require-Exact $source.protocol '^\s*const dataCodewords = version === 5 \? 108 : 136;\s*$' 'Version 5-L and 6-L data codeword capacity'
  Require-Exact $source.protocol '^\s*const quietZone = 4;\s*$' 'four-module quiet zone'
  Require-Exact $source.protocol '^\s*const eccPerBlock = version === 5 \? 26 : 18;\s*$' 'Version 5 and 6 Reed-Solomon parity'
  Require-Exact $source.protocol '^\s*const blockData = version === 5 \? \[data\] : \[data\.slice\(0, 68\), data\.slice\(68\)\];\s*$' 'QR block construction'

  Require-Exact $source.destination '^\s*\| \{ kind: ''qr-image'' \| ''qr-clipboard''; bytes: Uint8Array; confirmationCode: string \}\s*$' 'image and clipboard registration'
  Require-Exact $source.destination '^\s*\| \{ kind: ''camera''; confirmationCode: string \}\s*$' 'camera registration'
  Require-Exact $source.destination '^\s*\| \{ kind: ''otpauth-json''; value: string; confirmationCode: string \}\s*$' 'JSON registration route'
  Require-Exact $source.destination '^\s*throw new Error\(''Registration requires one current authenticator code before the entry is armed\.''\);\s*$' 'pairing confirmation'
  Require-Exact $source.store '^\s*readonly kind: ''operating-system-vault'' \| ''unavailable'';\s*$' 'vault-only storage contract'
  Require-Exact $source.store '^\s*export type HistoryMutationStatus = \{\r?\n\s*historyRecorded: boolean;\r?\n\s*recovery: string \| null;\r?\n\};\s*$' 'history mutation status'
  Require-Exact $source.store '^\s*this\.\#lastMutationStatus = .*History was not recorded\..*$' 'history failure recovery reason'
  Require-Exact $source.store '^\s*async restoreSnapshot\(snapshot: AuthenticatorHistorySnapshot\): Promise<HistoryMutationStatus> \{\s*$' 'transactional snapshot restore'
  Require-Exact $source.store '^\s*const restoredIds = new Set\(restored\.secrets\.keys\(\)\);\s*$' 'restored-away vault deletion'
  Require-Exact $source.store '^\s*return \{ version: 1, secretsOmitted: true, entries: this\.list\(\) \};\s*$' 'ordinary export omission'

  Require-Exact $source.history '^\s*export class LocalGitHistory\s' 'local Git history'
  Require-Exact $source.history '^\s*encryptedSnapshot: string;\s*$' 'encrypted snapshots'
  Require-Exact $source.history '^\s*export function authenticatorEntryAad\(entryId: string\): string \{\s*$' 'stable entry-id AAD'
  Require-Exact $source.history '^\s*export async function encryptAuthenticatorHistorySnapshot\($' 'encrypted secret snapshot'
  Require-Exact $source.history '^\s*export async function decryptAuthenticatorHistorySnapshot\($' 'encrypted secret restore'
  Require-Exact $source.history '^\s*encryptedSecrets: EncryptedAuthenticatorSecret\[\];\s*$' 'dedicated encrypted secret envelope field'
  Require-Exact $source.history '^\s*if \(depth !== 0\) throw new Error\(''Encrypted secret envelopes must use the dedicated snapshot field\.''\);\s*$' 'dedicated envelope admission boundary'
  Require-Exact $source.history '^\s*if \(!action \|\| action\.length > 128 \|\| .*credential material\..*$' 'history action redaction boundary'
  Require-Exact $source.history '^\s*export class PasswordProtectedHistory\s' 'password-protected history manager'
  Require-Exact $source.vault '^\s*export class UnavailableSecretVault\s' 'honest unavailable vault'
  Require-Exact $source.vault '^\s*export interface OperatingSystemCredentialVault\s' 'injected credential-vault abstraction'
  Require-Exact $source.confirmation '^\s*export class SuperConfirmationVerifier\s' 'one-use confirmation verifier'
  Require-Exact $source.confirmation '^\s*this\.\#tokens\.delete\(token\);\s*$' 'one-use token consumption'

  Require-Exact $source.host '^\s*export class DesktopAuthenticatorHost\s' 'feature-owned desktop host'
  Require-Exact $source.host '^\s*constructor\(options: \{.*credentialVault\?: OperatingSystemCredentialVault.*\}\) \{\s*$' 'real vault injection seam'
  Require-Exact $source.host '^\s*constructor\(options: \{.*trustedTime\?: TrustedTimeProvider.*\}\) \{\s*$' 'trusted time provider seam'
  Require-Exact $source.host '^\s*preflight\(bytes: Uint8Array\): \{ width: number; height: number; frames: number; decodedBytes: number \};\s*$' 'host QR preflight'
  Require-Exact $source.host '^\s*if \(.*decodedBytes.*\) throw new Error.*$' 'host decoded-memory bound'
  Require-Exact $source.host '^\s*return await Promise\.race\(.*QR image decoding exceeded the bounded time\..*$' 'host decoder deadline'
  Require-Exact $source.host '^\s*export function registerAuthenticatorBridge\(host: DesktopAuthenticatorHost\): DesktopAuthenticatorHostBridge \{\s*$' 'authenticator bridge registration seam'
  Require-Exact $source.host '^\s*export function registerCanonicalAuthenticatorBridge\(host: DesktopAuthenticatorHost\): CanonicalAuthenticatorBridge \{\s*$' 'canonical authenticator adapter seam'
  Require-Exact $source.host '^\s*export function registerUnlockLadderBridge\(host: DesktopAuthenticatorHost\): DesktopUnlockLadderBridge \{\s*$' 'unlock ladder bridge registration seam'
  Require-Exact $source.host '^\s*export function registerCanonicalUnlockLadderBridge\(host: DesktopAuthenticatorHost\): CanonicalUnlockLadderBridge \{\s*$' 'canonical unlock ladder adapter seam'
  Require-Exact $source.host '^\s*async register\(' 'host registration call'
  Require-Exact $source.host '^\s*async historyExportSensitive\(' 'host sensitive export call'

  Require-Exact $source.bridge '^\s*export interface CanonicalAuthenticatorBridge\s' 'canonical authenticator bridge'
  Require-Exact $source.bridge '^\s*export function createCanonicalAuthenticatorBridge\(' 'canonical authenticator adapter'
  Require-Exact $source.bridge '^\s*list: async \(query\) => mapValue\(await host\.list\(query\), \(value\) => value\.entries\),\s*$' 'list shape mapping'
  Require-Exact $source.bridge '^\s*view: async \(id\) => mapValue\(await host\.view\(id\), \(value\) => value\.entry\),\s*$' 'view shape mapping'
  Require-Exact $source.bridge '^\s*register: async \(input\) => mapValue\(await host\.register\(input\), \(value\) => value\.entry\),\s*$' 'registration shape mapping'
  Require-Exact $source.bridge '^\s*qrFor: async \(input\) => mapValue\(await host\.qrFor\(input\), \(value\) => \{ const \{ uri, \.\.\.matrix \} = value; return \{ uri, matrix \}; \}\),\s*$' 'QR shape mapping'
  Require-Exact $source.bridge '^\s*recordMoleHit\(lockoutId: string, nonce: string, cell: number\): Promise<MoleClickResult>;\s*$' 'mole shape mapping'

  Require-Exact $source.ladder '^\s*export const MAX_LADDER_USES = 3;\s*$' 'rolling ladder budget'
  Require-Exact $source.ladder '^\s*export const LADDER_BUDGET_ID_PREFIX = ''unlock-ladder-budget:v1:'';\s*$' 'stable budget identity prefix'
  Require-Exact $source.ladder '^\s*export function stableLadderBudgetKey\(identity: string\): string \{\s*$' 'stable budget identity helper'
  Require-Exact $source.ladder '^\s*this\.\#nonceIndex\.delete\(nonce\);\s*$' 'single-use nonce consumption'
  Require-Exact $source.ladder '^\s*if \(.*\) return \{ ok: false, code: ''early-submit'' \};\s*$' 'early mole submission refusal'
  Require-Exact $source.ladder '^\s*if \(.*\) return \{ ok: false, code: ''duplicate-mole'' \};\s*$' 'duplicate mole refusal'
  Require-Exact $source.ladder '^\s*recordMoleHit\(lockoutId: string, nonce: string, cell: number\): MoleClickResult \{\s*$' 'host mole hit route'
  Require-Exact $source.ladder '^\s*if \(.*kind.*!==.*''mole-round''.*\) return \{ ok: false, code: ''invalid-answer'' \};\s*$' 'server-graded mole sentinel'
  Require-Exact $source.ladder '^\s*exportState\(\): UnlockLadderDurableSnapshot \{\s*$' 'durable ladder export'
  Require-Exact $source.ladder '^\s*restoreState\(snapshot: UnlockLadderDurableSnapshot\): void \{\s*$' 'durable ladder restore'
  Require-Exact $source.ladder '^\s*export class DurableUnlockLadderHost\s' 'durable ladder host'
  Require-Exact $source.ladder '^\s*export class JsonUnlockLadderPersistence\s' 'durable ladder persistence'
  Require-Exact $source.ladder '^\s*const temporary = `\$\{this\.\#path\}\.\$\{randomUUID\(\)\}\.tmp`;\s*$' 'atomic persistence temporary path'
  Require-Exact $source.ladder '^\s*await rename\(temporary, this\.\#path\);\s*$' 'atomic persistence rename'
  Require-Exact $source.ladder '^\s*const stage = options\.schoolMode \? ''sums'' : ''dish'';\s*$' 'School mode start stage'
  Require-Exact $source.ladder '^\s*async \#mutate<T>\(operation: \(\) => T\): Promise<T> \{\s*$' 'persistence rollback wrapper'
  Require-Exact $source.ladderProtocol '^\s*export interface C5\s' 'C5 host interface'
  Require-Exact $source.ladderProtocol '^\s*export type LadderRecordLockoutOptions = \{\s*$' 'C5 lockout seam'

  Require-Exact $source.contracts '^\s*export interface C0\s*\{' 'C0 registration interface'
  Require-Exact $source.contracts '^\s*export interface C1\s*\{' 'C1 entry interface'
  Require-Exact $source.contracts '^\s*export type RegistrationRequest = BridgeRegistration;\s*$' 'renderer registration canonical type'
  Require-Exact $source.webProtocol '^\s*buildOtpauthJson,$\s*' 'renderer JSON protocol export'
  Require-Exact $source.webProtocol '^\s*parseOtpauthJson,$\s*' 'renderer JSON parser export'
  Require-Exact $source.destinationUi '^\s*<section\b[^>]*data-testid="authenticator-destination"' 'authenticator destination mount'
  Require-Exact $source.destinationUi '^\s*<RegexSearchField\b' 'entry search builder'
  Require-Exact $source.destinationUi '^\s*.*<input type="file"' 'semantic local file picker'
  Require-Exact $source.destinationUi '^\s*if \(file\.size > 2 \* 1024 \* 1024\)' 'renderer file byte bound'
  Require-Exact $source.destinationUi '^\s*if \(image\.size !== bytes\.byteLength.*$' 'renderer Blob size bound before allocation'
  Require-Exact $source.destinationUi '^\s*.*<button[^>]*>.*Generate local QR preview.*$' 'local QR action'
  Require-Exact $source.destinationUi '^\s*.*<button[^>]*>.*Generate local secret.*$' 'local secret action'
  Require-Exact $source.destinationUi '^\s*.*<button[^>]*>.*Read clipboard QR.*$' 'clipboard QR action'
  Require-Exact $source.destinationUi '^\s*.*<button[^>]*>.*Use camera QR.*$' 'camera QR action'
  Require-Exact $source.destinationUi '^\s*.*<button[^>]*>.*Copy current code.*$' 'current code action'
  Require-Exact $source.destinationUi '^\s*.*<button[^>]*>.*Group selected.*$' 'group bulk action'
  Require-Exact $source.destinationUi '^\s*.*<button[^>]*>.*Reorder selected.*$' 'reorder bulk action'
  Require-Exact $source.destinationUi '^\s*await saveAuthenticatorExport\(exportSaver, ''authenticator-history-redacted\.json'', validateAuthenticatorExportContent\(result\.value\.content, ''redacted-history''\)\);\s*$' 'redacted export handoff'
  Require-Exact $source.destinationUi '^\s*await saveAuthenticatorExport\(exportSaver, ''authenticator-history-sensitive\.json'', validateAuthenticatorExportContent\(result\.value\.content, ''sensitive-history''\)\);\s*$' 'sensitive export handoff'
  Require-Exact $source.destinationUi '^\s*import \{ saveAuthenticatorExport, validateAuthenticatorExportContent, type LocalExportSaver \} from ''\.\/export'';$' 'export schema validator import'
  Require-Exact $source.destinationUi '^\s*if \(result\.historyRecorded === false\).*$' 'renderer history recovery state'
  Require-Exact $source.destinationUi '^\s*const input: RegistrationRequest = registrationValue.*$' 'renderer registration canonical mapping'
  Require-Exact $source.destinationUi '^\s*: \{ kind: ''manual'' as const, issuer: registration\.issuer\.trim\(\), account: registration\.account\.trim\(\), secretBase32: registration\.secretBase32\.trim\(\),.*$' 'renderer manual registration shape'
  Require-Exact $source.historyUi '^\s*<h2 id="authenticator-history-title">.*Protected authenticator history.*</h2>\s*$' 'history surface'
  Require-Exact $source.historyUi '^\s*<RegexSearchField\b' 'history search builder'
  Require-Exact $source.ladderUi '^\s*function prefersReducedMotion\(\): boolean \{\s*$' 'reduced-motion state'
  Require-Exact $source.ladderUi '^\s*.*role="grid" aria-label=\{activeLabels\?\.moleBoard.*$' 'keyboard and screen-reader board'
  Require-Exact $source.ladderUi '^\s*.*role="row" aria-rowindex=\{row \+ 1\}.*$' 'mole grid row semantics'
  Require-Exact $source.ladderUi '^\s*.*aria-colindex=\{.*\}.*$' 'mole grid column semantics'
  Require-Exact $source.ladderUi '^\s*.*tabIndex=\{cell === focusCell \? 0 : -1\}.*$' 'mole grid roving focus'
  Require-Exact $source.ladderUi '^\s*void bridge\.recordMoleHit\(lockoutId, challenge!\.nonce, cell\).*$' 'per-click host mole route'
  Require-Exact $source.ladderUi '^\s*.*submit\(\{ kind: ''mole-round'' \}\).*$' 'renderer no-list mole submit'
  Require-Exact $source.ladderUi '^\s*<section[^>]*data-copy-fallback=\{validCopy \? ''false'' : ''true''\}.*$' 'honest localized-copy fallback'
  Require-Exact $source.ladderUi '^\s*const staticMoleCells = useMemo\(.*$' 'reduced-motion static mole positions'
  Require-Exact $source.ladderUi '^\s*const activeMoleCells = useMemo\(.*$' 'host-valid active mole positions'
  Require-Exact $source.ladderUi '^\s*const moleAccessibleName = \(cell: number, active: boolean, scheduled: boolean, hit: boolean\) => \{\s*$' 'injected dynamic accessible mole names'
  Require-Exact $source.ladderUi '^\s*.*activeMoleStatus\?\.\(activeMoleCells\.map.*$' 'injected dynamic active-cell announcement'
  Require-Exact $source.ladderUi '^\s*reducedMotionMoleNote: string;\s*$' 'reduced-motion interaction explanation'
  Require-Exact $source.ladderCss '^\.surface\[data-reduced-motion=''true''\] \.moleVisible \{ animation: none; transition: none; \}$' 'reduced-motion static mole surface'
  Require-Exact $source.tests '^\s*test\(''matches RFC 4226 and RFC 6238 SHA-1, SHA-256, and SHA-512 vectors'',.*$' 'published RFC tests'
  Require-Exact $source.historyTests '^\s*test\(''accepts documented otpauth JSON and rejects extra or unsupported fields'',.*$' 'JSON duplicate and nesting tests'
  Require-Exact $source.tests '^\s*test\(''records mole hits through the host with exact visible cells and one-hit state'',.*$' 'mole host route test'
  Require-Exact $source.tests '^\s*test\(''School mode starts at sums and clears only the wait'',.*$' 'School mode test'
  Require-Exact $source.hostTests '^\s*test\(''rejects bounded QR metadata before invoking the decoder'',.*$' 'QR preflight bound test'
  Require-Exact $source.hostTests '^\s*.*kind: ''otpauth-json''.*$' 'JSON host registration test'
  Require-Exact $source.bridgeTests '^\s*test\(''maps host list, view, register, QR, copy, and history shapes exactly'',.*$' 'canonical adapter round-trip test'
  Require-Exact $source.bridgeTests '^\s*test\(''maps the mole route without accepting renderer timestamps or hit arrays'',.*$' 'canonical mole adapter test'
  Require-Exact $source.webProtocolTests '^\s*.*for \(const mask of \[0, 1, 2, 3, 4, 5, 6, 7\].*$' 'renderer all-mask QR schedule'
  Require-Exact $source.webProtocolTests '^\s*const json = buildOtpauthJson\(.*$' 'renderer JSON round-trip test'
  Require-Exact $source.exports '^\s*export function validateAuthenticatorExportContent\(content: string, kind: AuthenticatorExportKind\): string \{\s*$' 'export schema validator'
  Require-Exact $source.exports '^\s*return content;\s*$' 'export byte-preserving return'
  Require-Exact $source.exportTests '^\s*test\(''validates the top-level redacted schema and preserves content bytes'',.*$' 'redacted export schema test'
  Require-Exact $source.exportTests '^\s*test\(''validates sensitive entries without double-encoding the host wrapper'',.*$' 'sensitive export schema test'
}

function Copy-Sources([hashtable]$source) {
  $copy = @{}
  foreach ($key in $source.Keys) { $copy[$key] = $source[$key] }
  return $copy
}

function Assert-NegativeFixture([hashtable]$source, [string]$Key, [string]$Old, [string]$New, [string]$Expected) {
  $broken = Copy-Sources $source
  if (-not (Has-FixtureFragment $broken[$Key] $Old)) { throw "Negative fixture could not locate its exact source: $Key" }
  $broken[$Key] = $broken[$Key].Replace($Old, $New)
  $caught = $false
  try { Validate-Sources $broken }
  catch {
    if ($_.Exception.Message -eq $Expected) { $caught = $true }
    else { throw "Negative fixture returned an unexpected reason: $($_.Exception.Message)" }
  }
  if (-not $caught) { throw "Negative fixture stayed green: $Expected" }
  Validate-Sources $source
}

$text = @{}
foreach ($entry in $files.GetEnumerator()) { $text[$entry.Key] = Read-Text $entry.Value }
Validate-Sources $text

if ($SelfTest) {
  Assert-NegativeFixture $text protocol 'export function decodeLocalQr(' 'export function decodeLocalQr_REMOVED(' 'Missing or duplicate exact contract (0): local QR decoder'
  Assert-NegativeFixture $text ladder 'const MAX_LADDER_USES = 3' 'const MAX_LADDER_USES = 4' 'Missing or duplicate exact contract (0): rolling ladder budget'
  Assert-NegativeFixture $text destinationUi 'data-testid="authenticator-destination"' 'data-testid="authenticator-destination_REMOVED"' 'Missing or duplicate exact contract (0): authenticator destination mount'
  Assert-NegativeFixture $text vault 'class UnavailableSecretVault' 'class UnavailableSecretVault_REMOVED' 'Missing or duplicate exact contract (0): honest unavailable vault'
  Assert-NegativeFixture $text history 'encryptedSecrets' 'secretEnvelopes' 'Missing or duplicate exact contract (0): dedicated encrypted secret envelope field'
  Assert-NegativeFixture $text destinationUi 'image.size' 'image.byteLength' 'Missing or duplicate exact contract (0): renderer Blob size bound before allocation'
  Assert-NegativeFixture $text bridge 'const { uri, ...matrix } = value' 'const { uri, ...brokenMatrix } = value' 'Missing or duplicate exact contract (0): QR shape mapping'
  Assert-NegativeFixture $text protocol 'const MAX_OTPAUTH_JSON_DEPTH = 12' 'const MAX_OTPAUTH_JSON_DEPTH = 13' 'Missing or duplicate exact contract (0): bounded JSON traversal depth'
  Assert-NegativeFixture $text destinationUi " : { kind: 'manual' as const, issuer: registration.issuer.trim(), account: registration.account.trim(), secretBase32: registration.secretBase32.trim()" " : { kind: 'manual' as const, issuer: registration.issuer.trim(), account: registration.account.trim(), secret: registration.secretBase32.trim()" 'Missing or duplicate exact contract (0): renderer manual registration shape'
  Assert-NegativeFixture $text ladderUi 'const staticMoleCells = useMemo(' 'const removedMoleCells = useMemo(' 'Missing or duplicate exact contract (0): reduced-motion static mole positions'
  Assert-NegativeFixture $text ladderUi 'role="row"' 'role="gridcell"' 'Missing or duplicate exact contract (0): mole grid row semantics'
  Assert-NegativeFixture $text ladderUi 'const moleAccessibleName = (' 'const removedMoleAccessibleName = (' 'Missing or duplicate exact contract (0): injected dynamic accessible mole names'
  Assert-NegativeFixture $text destinationUi "await saveAuthenticatorExport(exportSaver, 'authenticator-history-redacted.json', validateAuthenticatorExportContent(result.value.content, 'redacted-history'));" "await saveAuthenticatorExport(exportSaver, 'authenticator-history-redacted.json', JSON.stringify(result.value));" 'Missing or duplicate exact contract (0): redacted export handoff'
  Write-Output 'PASS: authenticator and unlock-ladder negative red-green checks'
}

Write-Output 'PASS: authenticator and unlock-ladder exact source inventory'

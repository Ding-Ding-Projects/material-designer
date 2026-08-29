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
  webProtocol = Join-Path $root 'design/apps/web/src/components/authenticator/protocol.ts'
  tests = Join-Path $root 'design/apps/desktop/tests/main/authenticator-lockout.test.ts'
  hostTests = Join-Path $root 'design/apps/desktop/tests/main/authenticator-host.test.ts'
  bridgeTests = Join-Path $root 'design/apps/desktop/tests/main/authenticator-bridge.test.ts'
  webProtocolTests = Join-Path $root 'design/apps/web/tests/components/authenticator/protocol.test.ts'
}

function Read-Text([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "Missing source file: $($Path.Replace($root, '<root>'))" }
  [System.IO.File]::ReadAllText($Path)
}

function Strip-Trivia([string]$Text) {
  $withoutBlocks = [regex]::Replace($Text, '/\*[\s\S]*?\*/', '')
  return [regex]::Replace($withoutBlocks, '(?m)^\s*//.*$', '')
}

function Has-Text([string]$Text, [string]$Needle) {
  return $Text.IndexOf($Needle, [System.StringComparison]::Ordinal) -ge 0
}

function Require-Exact([string]$Text, [string]$Pattern, [string]$Name) {
  $code = Strip-Trivia $Text
  $count = [regex]::Matches($code, $Pattern, [Text.RegularExpressions.RegexOptions]::Multiline).Count
  if ($count -ne 1) { throw "Missing or duplicate exact contract ($count): $Name" }
}

function Require-Text([string]$Text, [string]$Needle, [string]$Name) {
  if (-not (Has-Text $Text $Needle)) { throw "Missing contract: $Name" }
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
  Require-Text $source.protocol 'const dataCodewords = version === 5 ? 108 : 136' 'Version 5-L and 6-L data codeword capacity'
  Require-Text $source.protocol 'const quietZone = 4' 'four-module quiet zone'
  Require-Text $source.protocol 'const eccPerBlock = version === 5 ? 26 : 18' 'Version 5 and 6 Reed-Solomon parity'
  Require-Text $source.protocol 'const blockData = version === 5 ? [data] : [data.slice(0, 68), data.slice(68)]' 'QR block construction'

  Require-Text $source.destination "kind: 'qr-image' | 'qr-clipboard'" 'image and clipboard registration'
  Require-Text $source.destination "kind: 'camera'" 'camera registration'
  Require-Text $source.destination "kind: 'otpauth-json'" 'JSON registration route'
  Require-Text $source.destination 'Registration requires one current authenticator code' 'pairing confirmation'
  Require-Text $source.store "readonly kind: 'operating-system-vault' | 'unavailable'" 'vault-only storage contract'
  Require-Text $source.store 'historyRecorded: boolean' 'history mutation status'
  Require-Text $source.store 'History was not recorded.' 'history failure recovery reason'
  Require-Text $source.store 'restoreSnapshot' 'transactional snapshot restore'
  Require-Text $source.store 'restoredIds' 'restored-away vault deletion'
  Require-Text $source.store 'secretsOmitted: true' 'ordinary export omission'

  Require-Exact $source.history '^\s*export class LocalGitHistory\s' 'local Git history'
  Require-Text $source.history 'encryptedSnapshot' 'encrypted snapshots'
  Require-Text $source.history 'authenticatorEntryAad' 'stable entry-id AAD'
  Require-Text $source.history 'encryptAuthenticatorHistorySnapshot' 'encrypted secret snapshot'
  Require-Text $source.history 'decryptAuthenticatorHistorySnapshot' 'encrypted secret restore'
  Require-Text $source.history 'encryptedSecrets' 'dedicated encrypted secret envelope field'
  Require-Text $source.history 'Encrypted secret envelopes must use the dedicated snapshot field.' 'dedicated envelope admission boundary'
  Require-Exact $source.history '^\s*export class PasswordProtectedHistory\s' 'password-protected history manager'
  Require-Exact $source.vault '^\s*export class UnavailableSecretVault\s' 'honest unavailable vault'
  Require-Exact $source.vault '^\s*export interface OperatingSystemCredentialVault\s' 'injected credential-vault abstraction'
  Require-Exact $source.confirmation '^\s*export class SuperConfirmationVerifier\s' 'one-use confirmation verifier'
  Require-Text $source.confirmation 'this.#tokens.delete(token)' 'one-use token consumption'

  Require-Exact $source.host '^\s*export class DesktopAuthenticatorHost\s' 'feature-owned desktop host'
  Require-Text $source.host 'credentialVault?' 'real vault injection seam'
  Require-Text $source.host 'trustedTime?' 'trusted time provider seam'
  Require-Text $source.host 'preflight(bytes)' 'host QR preflight'
  Require-Text $source.host 'decodedBytes' 'host decoded-memory bound'
  Require-Text $source.host "QR image decoding exceeded the bounded time." 'host decoder deadline'
  Require-Text $source.host 'registerAuthenticatorBridge' 'authenticator bridge registration seam'
  Require-Text $source.host 'registerCanonicalAuthenticatorBridge' 'canonical authenticator adapter seam'
  Require-Text $source.host 'registerUnlockLadderBridge' 'unlock ladder bridge registration seam'
  Require-Text $source.host 'registerCanonicalUnlockLadderBridge' 'canonical unlock ladder adapter seam'
  Require-Exact $source.host '^\s*async register\(' 'host registration call'
  Require-Exact $source.host '^\s*async historyExportSensitive\(' 'host sensitive export call'

  Require-Exact $source.bridge '^\s*export interface CanonicalAuthenticatorBridge\s' 'canonical authenticator bridge'
  Require-Exact $source.bridge '^\s*export function createCanonicalAuthenticatorBridge\(' 'canonical authenticator adapter'
  Require-Text $source.bridge 'value.entries' 'list shape mapping'
  Require-Text $source.bridge 'value.entry' 'view and registration shape mapping'
  Require-Text $source.bridge 'const { uri, ...matrix } = value' 'QR shape mapping'
  Require-Text $source.bridge 'recordMoleHit' 'mole shape mapping'

  Require-Text $source.ladder 'const MAX_LADDER_USES = 3' 'rolling ladder budget'
  Require-Text $source.ladder 'LADDER_BUDGET_ID_PREFIX' 'stable budget identity prefix'
  Require-Text $source.ladder 'stableLadderBudgetKey' 'stable budget identity helper'
  Require-Text $source.ladder 'this.#nonceIndex.delete(nonce)' 'single-use nonce consumption'
  Require-Text $source.ladder "code: 'early-submit'" 'early mole submission refusal'
  Require-Text $source.ladder "code: 'duplicate-mole'" 'duplicate mole refusal'
  Require-Text $source.ladder 'recordMoleHit(lockoutId' 'host mole hit route'
  Require-Text $source.ladder "kind !== 'mole-round'" 'server-graded mole sentinel'
  Require-Text $source.ladder 'exportState()' 'durable ladder export'
  Require-Text $source.ladder 'restoreState(snapshot' 'durable ladder restore'
  Require-Exact $source.ladder '^\s*export class DurableUnlockLadderHost\s' 'durable ladder host'
  Require-Exact $source.ladder '^\s*export class JsonUnlockLadderPersistence\s' 'durable ladder persistence'
  Require-Text $source.ladder 'const temporary = `${this.#path}.${randomUUID()}.tmp`' 'atomic persistence temporary path'
  Require-Text $source.ladder 'await rename(temporary, this.#path)' 'atomic persistence rename'
  Require-Text $source.ladder "const stage = options.schoolMode ? 'sums' : 'dish'" 'School mode start stage'
  Require-Text $source.ladder 'async #mutate<T>' 'persistence rollback wrapper'
  Require-Exact $source.ladderProtocol '^\s*export interface C5\s' 'C5 host interface'
  Require-Text $source.ladderProtocol 'LadderRecordLockoutOptions' 'C5 lockout seam'

  Require-Exact $source.contracts '^\s*export interface C0\s*\{' 'C0 registration interface'
  Require-Exact $source.contracts '^\s*export interface C1\s*\{' 'C1 entry interface'
  Require-Text $source.webProtocol 'buildOtpauthJson' 'renderer JSON protocol export'
  Require-Text $source.webProtocol 'parseOtpauthJson' 'renderer JSON parser export'
  Require-Text $source.destinationUi 'data-testid="authenticator-destination"' 'authenticator destination mount'
  Require-Text $source.destinationUi 'RegexSearchField' 'entry search builder'
  Require-Text $source.destinationUi 'type="file"' 'semantic local file picker'
  Require-Text $source.destinationUi 'file.size' 'renderer file byte bound'
  Require-Text $source.destinationUi 'image.size' 'renderer Blob size bound before allocation'
  Require-Text $source.destinationUi 'Generate local QR preview' 'local QR action'
  Require-Text $source.destinationUi 'Generate local secret' 'local secret action'
  Require-Text $source.destinationUi 'Read clipboard QR' 'clipboard QR action'
  Require-Text $source.destinationUi 'Use camera QR' 'camera QR action'
  Require-Text $source.destinationUi 'Copy current code' 'current code action'
  Require-Text $source.destinationUi 'Group selected' 'group bulk action'
  Require-Text $source.destinationUi 'Reorder selected' 'reorder bulk action'
  Require-Text $source.destinationUi 'saveAuthenticatorExport' 'local export handoff'
  Require-Text $source.destinationUi 'historyRecorded === false' 'renderer history recovery state'
  Require-Text $source.historyUi 'Protected authenticator history' 'history surface'
  Require-Text $source.historyUi 'RegexSearchField' 'history search builder'
  Require-Text $source.ladderUi 'prefers-reduced-motion' 'reduced-motion state'
  Require-Text $source.ladderUi 'aria-label="Whack-a-mole board"' 'keyboard and screen-reader board'
  Require-Text $source.ladderUi 'aria-rowindex' 'mole grid row semantics'
  Require-Text $source.ladderUi 'aria-colindex' 'mole grid column semantics'
  Require-Text $source.ladderUi 'tabIndex={cell === focusCell ? 0 : -1}' 'mole grid roving focus'
  Require-Text $source.ladderUi 'recordMoleHit' 'per-click host mole route'
  Require-Text $source.ladderUi "kind: 'mole-round'" 'renderer no-list mole submit'
  Require-Text $source.ladderUi 'data-copy-fallback' 'honest localized-copy fallback'
  Require-Text $source.ladderCss "data-reduced-motion='true'" 'reduced-motion static mole surface'
  Require-Text $source.tests 'matches RFC 4226 and RFC 6238 SHA-1, SHA-256, and SHA-512 vectors' 'published RFC tests'
  Require-Text $source.tests 'records mole hits through the host' 'mole host route test'
  Require-Text $source.tests 'School mode starts at sums' 'School mode test'
  Require-Text $source.hostTests 'rejects bounded QR metadata before invoking the decoder' 'QR preflight bound test'
  Require-Text $source.hostTests "kind: 'otpauth-json'" 'JSON host registration test'
  Require-Text $source.bridgeTests 'maps host list, view, register, QR, copy, and history shapes exactly' 'canonical adapter round-trip test'
  Require-Text $source.bridgeTests 'maps the mole route without accepting renderer timestamps or hit arrays' 'canonical mole adapter test'
  Require-Text $source.webProtocolTests 'for (const mask of [0, 1, 2, 3, 4, 5, 6, 7]' 'renderer all-mask QR schedule'
  Require-Text $source.webProtocolTests 'buildOtpauthJson' 'renderer JSON round-trip test'
}

function Copy-Sources([hashtable]$source) {
  $copy = @{}
  foreach ($key in $source.Keys) { $copy[$key] = $source[$key] }
  return $copy
}

function Assert-NegativeFixture([hashtable]$source, [string]$Key, [string]$Old, [string]$New, [string]$Expected) {
  $broken = Copy-Sources $source
  if (-not (Has-Text $broken[$Key] $Old)) { throw "Negative fixture could not locate its exact source: $Key" }
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
  Assert-NegativeFixture $text ladder 'const MAX_LADDER_USES = 3' 'const MAX_LADDER_USES = 4' 'Missing contract: rolling ladder budget'
  Assert-NegativeFixture $text destinationUi 'data-testid="authenticator-destination"' 'data-testid="authenticator-destination_REMOVED"' 'Missing contract: authenticator destination mount'
  Assert-NegativeFixture $text vault 'class UnavailableSecretVault' 'class UnavailableSecretVault_REMOVED' 'Missing or duplicate exact contract (0): honest unavailable vault'
  Assert-NegativeFixture $text history 'encryptedSecrets' 'secretEnvelopes' 'Missing contract: dedicated encrypted secret envelope field'
  Assert-NegativeFixture $text destinationUi 'image.size' 'image.byteLength' 'Missing contract: renderer Blob size bound before allocation'
  Assert-NegativeFixture $text bridge 'const { uri, ...matrix } = value' 'const { uri, ...brokenMatrix } = value' 'Missing contract: QR shape mapping'
  Write-Output 'PASS: authenticator and unlock-ladder negative red-green checks'
}

Write-Output 'PASS: authenticator and unlock-ladder exact source inventory'

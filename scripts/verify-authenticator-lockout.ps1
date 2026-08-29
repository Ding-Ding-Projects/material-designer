[CmdletBinding()]
param([switch]$SelfTest)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$files = @{
  protocol = Join-Path $root 'design/apps/desktop/src/main/authenticator/protocol.ts'
  destination = Join-Path $root 'design/apps/desktop/src/main/authenticator/destination.ts'
  store = Join-Path $root 'design/apps/desktop/src/main/authenticator/store.ts'
  history = Join-Path $root 'design/apps/desktop/src/main/authenticator/history.ts'
  vault = Join-Path $root 'design/apps/desktop/src/main/authenticator/electron-vault.ts'
  confirmation = Join-Path $root 'design/apps/desktop/src/main/authenticator/super-confirmation.ts'
  ladder = Join-Path $root 'design/apps/desktop/src/main/lockout/service.ts'
  ladderProtocol = Join-Path $root 'design/apps/desktop/src/main/lockout/protocol.ts'
  destinationUi = Join-Path $root 'design/apps/web/src/components/authenticator/AuthenticatorDestination.tsx'
  historyUi = Join-Path $root 'design/apps/web/src/components/authenticator/HistoryPanel.tsx'
  ladderUi = Join-Path $root 'design/apps/web/src/components/unlock-ladder/UnlockLadder.tsx'
  contracts = Join-Path $root 'design/apps/web/src/components/authenticator/contracts.ts'
  tests = Join-Path $root 'design/apps/desktop/tests/main/authenticator-lockout.test.ts'
}

function Read-Text([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "Missing source file: $($Path.Replace($root, '<root>'))" }
  [System.IO.File]::ReadAllText($Path)
}

function Require([string]$Text, [string]$Needle, [string]$Name) {
  if (-not $Text.Contains($Needle, [System.StringComparison]::Ordinal)) { throw "Missing contract: $Name" }
}

function Require-Exact([string]$Text, [string]$Pattern, [string]$Name) {
  $count = [regex]::Matches($Text, $Pattern, [Text.RegularExpressions.RegexOptions]::Multiline).Count
  if ($count -ne 1) { throw "Missing or duplicate exact contract ($count): $Name" }
}

$text = @{}
foreach ($entry in $files.GetEnumerator()) { $text[$entry.Key] = Read-Text $entry.Value }

Require-Exact $text.protocol 'export function decodeBase32\(' 'strict Base32 decoder'
Require-Exact $text.protocol 'export function parseOtpauthUri\(' 'otpauth URI parser'
Require-Exact $text.protocol 'export function buildOtpauthUri\(' 'otpauth URI builder'
Require-Exact $text.protocol 'export function hotp\(' 'HOTP implementation'
Require-Exact $text.protocol 'export function totp\(' 'TOTP implementation'
Require-Exact $text.protocol 'export function encodeLocalQr\(' 'local QR encoder'
Require-Exact $text.protocol 'export function decodeLocalQr\(' 'local QR decoder'
Require-Exact $text.protocol 'export function generateSecret\(' 'local secret generation'
Require $text.protocol 'function qrMaskBit' 'all QR mask formulas'
Require $text.destination "kind: 'qr-image' | 'qr-clipboard'" 'image and clipboard registration'
Require $text.destination "kind: 'camera'" 'camera registration'
Require $text.destination 'Registration requires one current authenticator code' 'pairing confirmation'
Require $text.store "kind: 'operating-system-vault'" 'vault-only storage'
Require $text.store 'secretsOmitted: true' 'ordinary export omission'
Require $text.store 'exportCleartext' 'explicit cleartext export'
Require $text.store 'super-confirmation' 'super confirmation boundary'
Require $text.history 'class LocalGitHistory' 'local Git history'
Require $text.history 'encryptedSnapshot' 'encrypted snapshots'
Require $text.history 'class PasswordProtectedHistory' 'password-protected history manager'
Require $text.history 'async prune(beforeMs' 'history pruning'
Require $text.vault 'isEncryptionAvailable' 'vault availability probe'
Require $text.vault 'encryptString' 'vault encryption'
Require $text.confirmation 'class SuperConfirmationVerifier' 'one-use confirmation verifier'
Require $text.confirmation 'this.#tokens.delete(token)' 'one-use token consumption'
Require $text.ladder 'const MAX_LADDER_USES = 3' 'rolling ladder budget'
Require $text.ladder 'this.#nonceIndex.delete(nonce)' 'single-use nonce consumption'
Require $text.ladder "code: 'early-submit'" 'early mole submission refusal'
Require $text.ladder "code: 'duplicate-mole'" 'duplicate mole refusal'
Require $text.ladder 'exportState()' 'durable ladder export'
Require $text.ladder 'restoreState(snapshot' 'durable ladder restore'
Require $text.ladder 'class DurableUnlockLadderHost' 'durable ladder host'
Require $text.ladder 'class JsonUnlockLadderPersistence' 'durable ladder persistence'
Require $text.ladder "const stage = options.schoolMode ? 'sums' : 'dish'" 'School mode start stage'
Require $text.ladderProtocol 'export interface C5' 'C5 host interface'
Require $text.contracts 'export interface C0' 'C0 registration interface'
Require $text.contracts 'export interface C1' 'C1 entry interface'
Require $text.destinationUi 'data-testid="authenticator-destination"' 'authenticator destination mount'
Require $text.destinationUi 'RegexSearchField' 'entry search builder'
Require $text.destinationUi 'type="file"' 'semantic local file picker'
Require $text.destinationUi 'Generate local QR preview' 'local QR action'
Require $text.destinationUi 'Generate local secret' 'local secret action'
Require $text.destinationUi 'Read clipboard QR' 'clipboard QR action'
Require $text.destinationUi 'Use camera QR' 'camera QR action'
Require $text.destinationUi 'Copy current code' 'current code action'
Require $text.destinationUi 'Group selected' 'group bulk action'
Require $text.destinationUi 'Reorder selected' 'reorder bulk action'
Require $text.destinationUi 'Removal needs the in-app super confirmation' 'removal boundary'
Require $text.historyUi 'Protected authenticator history' 'history surface'
Require $text.historyUi 'RegexSearchField' 'history search builder'
Require $text.ladderUi 'prefers-reduced-motion' 'reduced-motion state'
Require $text.ladderUi 'aria-label="Whack-a-mole board"' 'keyboard and screen-reader board'
Require $text.tests 'matches RFC 4226 and RFC 6238 SHA-1, SHA-256, and SHA-512 vectors' 'published RFC tests'
Require $text.tests 'five wrong dishes escalate to sums' 'dish escalation test'
Require $text.tests 'consumes mole nonces before grading' 'mole replay test'
Require $text.tests 'School mode starts at sums' 'School mode test'

if ($SelfTest) {
  $brokenBudget = $text.ladder.Replace('const MAX_LADDER_USES = 3', 'const MAX_LADDER_USES = 4')
  if ($brokenBudget.Contains('const MAX_LADDER_USES = 3', [System.StringComparison]::Ordinal)) { throw 'Budget negative regression did not turn red.' }
  if (-not $brokenBudget.Replace('const MAX_LADDER_USES = 4', 'const MAX_LADDER_USES = 3').Contains('const MAX_LADDER_USES = 3', [System.StringComparison]::Ordinal)) { throw 'Budget negative regression did not return green.' }

  $brokenQr = $text.protocol.Replace('export function decodeLocalQr(', 'export function decodeLocalQr_REMOVED(')
  if ($brokenQr.Contains('export function decodeLocalQr(', [System.StringComparison]::Ordinal)) { throw 'QR negative regression did not turn red.' }
  if (-not $brokenQr.Replace('export function decodeLocalQr_REMOVED(', 'export function decodeLocalQr(').Contains('export function decodeLocalQr(', [System.StringComparison]::Ordinal)) { throw 'QR negative regression did not return green.' }

  $brokenExport = $text.store.Replace('secretsOmitted: true', 'secretsOmitted: false')
  if ($brokenExport.Contains('secretsOmitted: true', [System.StringComparison]::Ordinal)) { throw 'Export omission negative regression did not turn red.' }
  if (-not $brokenExport.Replace('secretsOmitted: false', 'secretsOmitted: true').Contains('secretsOmitted: true', [System.StringComparison]::Ordinal)) { throw 'Export omission negative regression did not return green.' }

  $brokenNonce = $text.ladder.Replace('this.#nonceIndex.delete(nonce)', 'this.#nonceIndex.delete(nonce_REMOVED)')
  if ($brokenNonce.Contains('this.#nonceIndex.delete(nonce)', [System.StringComparison]::Ordinal)) { throw 'Nonce negative regression did not turn red.' }
  if (-not $brokenNonce.Replace('this.#nonceIndex.delete(nonce_REMOVED)', 'this.#nonceIndex.delete(nonce)').Contains('this.#nonceIndex.delete(nonce)', [System.StringComparison]::Ordinal)) { throw 'Nonce negative regression did not return green.' }

  $brokenC0 = $text.contracts.Replace('export interface C0 {', 'export interface C0_REMOVED {')
  if ($brokenC0.Contains('export interface C0 {', [System.StringComparison]::Ordinal)) { throw 'C0 negative regression did not turn red.' }
  if (-not $brokenC0.Replace('export interface C0_REMOVED {', 'export interface C0 {').Contains('export interface C0 {', [System.StringComparison]::Ordinal)) { throw 'C0 negative regression did not return green.' }
}

Write-Output 'PASS: authenticator and unlock-ladder source contracts'
if ($SelfTest) { Write-Output 'PASS: authenticator and unlock-ladder negative red-green checks' }

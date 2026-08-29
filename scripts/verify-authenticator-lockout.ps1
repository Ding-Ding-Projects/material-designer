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
  ladder = Join-Path $root 'design/apps/desktop/src/main/lockout/service.ts'
  ladderProtocol = Join-Path $root 'design/apps/desktop/src/main/lockout/protocol.ts'
  destinationUi = Join-Path $root 'design/apps/web/src/components/authenticator/AuthenticatorDestination.tsx'
  historyUi = Join-Path $root 'design/apps/web/src/components/authenticator/HistoryPanel.tsx'
  ladderUi = Join-Path $root 'design/apps/web/src/components/unlock-ladder/UnlockLadder.tsx'
  contracts = Join-Path $root 'design/apps/web/src/components/authenticator/contracts.ts'
  exports = Join-Path $root 'design/apps/web/src/components/authenticator/export.ts'
  tests = Join-Path $root 'design/apps/desktop/tests/main/authenticator-lockout.test.ts'
}

function Read-Text([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "Missing source file: $($Path.Replace($root, '<root>'))" }
  [System.IO.File]::ReadAllText($Path)
}

function Strip-Trivia([string]$Text) {
  $withoutBlocks = [regex]::Replace($Text, '/\*[\s\S]*?\*/', '')
  return [regex]::Replace($withoutBlocks, '(?m)^\s*//.*$', '')
}

function Require-Exact([string]$Text, [string]$Pattern, [string]$Name) {
  $code = Strip-Trivia $Text
  $count = [regex]::Matches($code, $Pattern, [Text.RegularExpressions.RegexOptions]::Multiline).Count
  if ($count -ne 1) { throw "Missing or duplicate exact contract ($count): $Name" }
}

function Require-Text([string]$Text, [string]$Needle, [string]$Name) {
  if (-not $Text.Contains($Needle, [System.StringComparison]::Ordinal)) { throw "Missing contract: $Name" }
}

$text = [ordered]@{}
foreach ($entry in $files.GetEnumerator()) { $text[$entry.Key] = Read-Text $entry.Value }

Require-Exact $text.protocol '^\s*export function decodeBase32\(' 'strict Base32 decoder'
Require-Exact $text.protocol '^\s*export function parseOtpauthUri\(' 'otpauth URI parser'
Require-Exact $text.protocol '^\s*export function buildOtpauthUri\(' 'otpauth URI builder'
Require-Exact $text.protocol '^\s*export function hotp\(' 'HOTP implementation'
Require-Exact $text.protocol '^\s*export function totp\(' 'TOTP implementation'
Require-Exact $text.protocol '^\s*export function encodeLocalQr\(' 'local QR encoder'
Require-Exact $text.protocol '^\s*export function decodeLocalQr\(' 'local QR decoder'
Require-Exact $text.protocol '^\s*export function generateSecret\(' 'local secret generation'
Require-Exact $text.protocol '^\s*export function verifyLocalQrParity\(' 'Reed-Solomon parity verifier'
Require-Text $text.protocol 'const dataCodewords = version === 5 ? 108 : 136' 'Version 5-L data codeword capacity'
Require-Text $text.protocol 'const quietZone = 4' 'four-module quiet zone'
Require-Text $text.protocol 'const eccPerBlock = version === 5 ? 26 : 18' 'Version 5 and 6 Reed-Solomon parity'
Require-Text $text.destination "kind: 'qr-image' | 'qr-clipboard'" 'image and clipboard registration'
Require-Text $text.destination "kind: 'camera'" 'camera registration'
Require-Text $text.destination 'Registration requires one current authenticator code' 'pairing confirmation'
Require-Text $text.store "readonly kind: 'operating-system-vault' | 'unavailable'" 'vault-only storage contract'
Require-Text $text.store 'historyRecorded: boolean' 'history mutation status'
Require-Text $text.store 'History was not recorded.' 'history failure recovery reason'
Require-Text $text.store 'restoreSnapshot' 'transactional snapshot restore'
Require-Text $text.store 'secretsOmitted: true' 'ordinary export omission'
Require-Text $text.history 'class LocalGitHistory' 'local Git history'
Require-Text $text.history 'encryptedSnapshot' 'encrypted snapshots'
Require-Text $text.history 'authenticatorEntryAad' 'stable entry-id AAD'
Require-Text $text.history 'encryptAuthenticatorHistorySnapshot' 'encrypted secret snapshot'
Require-Text $text.history 'decryptAuthenticatorHistorySnapshot' 'encrypted secret restore'
Require-Text $text.history 'class PasswordProtectedHistory' 'password-protected history manager'
Require-Text $text.vault 'class UnavailableSecretVault' 'honest unavailable vault'
Require-Text $text.vault 'OperatingSystemCredentialVault' 'injected credential-vault abstraction'
Require-Text $text.confirmation 'class SuperConfirmationVerifier' 'one-use confirmation verifier'
Require-Text $text.confirmation 'this.#tokens.delete(token)' 'one-use token consumption'
Require-Text $text.host 'class DesktopAuthenticatorHost' 'feature-owned desktop host'
Require-Text $text.host 'credentialVault?' 'real vault injection seam'
Require-Text $text.host 'trustedTime?' 'trusted time provider seam'
Require-Text $text.host 'registerAuthenticatorBridge' 'authenticator bridge registration seam'
Require-Text $text.host 'registerUnlockLadderBridge' 'unlock ladder bridge registration seam'
Require-Exact $text.host '^\s*async register\(' 'host registration call'
Require-Exact $text.host '^\s*async historyExportSensitive\(' 'host sensitive export call'
Require-Text $text.ladder 'const MAX_LADDER_USES = 3' 'rolling ladder budget'
Require-Text $text.ladder 'this.#nonceIndex.delete(nonce)' 'single-use nonce consumption'
Require-Text $text.ladder "code: 'early-submit'" 'early mole submission refusal'
Require-Text $text.ladder "code: 'duplicate-mole'" 'duplicate mole refusal'
Require-Text $text.ladder 'recordMoleHit(lockoutId' 'host mole hit route'
Require-Text $text.ladder "kind !== 'mole-round'" 'server-graded mole sentinel'
Require-Text $text.ladder 'exportState()' 'durable ladder export'
Require-Text $text.ladder 'restoreState(snapshot' 'durable ladder restore'
Require-Text $text.ladder 'class DurableUnlockLadderHost' 'durable ladder host'
Require-Text $text.ladder 'class JsonUnlockLadderPersistence' 'durable ladder persistence'
Require-Text $text.ladder "const stage = options.schoolMode ? 'sums' : 'dish'" 'School mode start stage'
Require-Text $text.ladderProtocol 'export interface C5' 'C5 host interface'
Require-Text $text.contracts 'export interface C0 {' 'C0 registration interface'
Require-Text $text.contracts 'export interface C1 {' 'C1 entry interface'
Require-Text $text.destinationUi 'data-testid="authenticator-destination"' 'authenticator destination mount'
Require-Text $text.destinationUi 'RegexSearchField' 'entry search builder'
Require-Text $text.destinationUi 'type="file"' 'semantic local file picker'
Require-Text $text.destinationUi 'Generate local QR preview' 'local QR action'
Require-Text $text.destinationUi 'Generate local secret' 'local secret action'
Require-Text $text.destinationUi 'Read clipboard QR' 'clipboard QR action'
Require-Text $text.destinationUi 'Use camera QR' 'camera QR action'
Require-Text $text.destinationUi 'Copy current code' 'current code action'
Require-Text $text.destinationUi 'Group selected' 'group bulk action'
Require-Text $text.destinationUi 'Reorder selected' 'reorder bulk action'
Require-Text $text.destinationUi 'saveAuthenticatorExport' 'local export handoff'
Require-Text $text.historyUi 'Protected authenticator history' 'history surface'
Require-Text $text.historyUi 'RegexSearchField' 'history search builder'
Require-Text $text.ladderUi 'prefers-reduced-motion' 'reduced-motion state'
Require-Text $text.ladderUi 'aria-label="Whack-a-mole board"' 'keyboard and screen-reader board'
Require-Text $text.ladderUi 'recordMoleHit' 'per-click host mole route'
Require-Text $text.ladderUi "kind: 'mole-round'" 'renderer no-list mole submit'
Require-Text $text.tests 'matches RFC 4226 and RFC 6238 SHA-1, SHA-256, and SHA-512 vectors' 'published RFC tests'
Require-Text $text.tests 'records mole hits through the host' 'mole host route test'
Require-Text $text.tests 'School mode starts at sums' 'School mode test'

if ($SelfTest) {
  $brokenBudget = $text.ladder.Replace('const MAX_LADDER_USES = 3', 'const MAX_LADDER_USES = 4')
  if ([regex]::Matches((Strip-Trivia $brokenBudget), '^\s*export const MAX_LADDER_USES = 3', [Text.RegularExpressions.RegexOptions]::Multiline).Count -gt 0) { throw 'Budget negative regression did not turn red.' }
  if (-not $brokenBudget.Replace('const MAX_LADDER_USES = 4', 'const MAX_LADDER_USES = 3').Contains('const MAX_LADDER_USES = 3', [System.StringComparison]::Ordinal)) { throw 'Budget negative regression did not return green.' }

  $brokenQr = $text.protocol.Replace('export function decodeLocalQr(', 'export function decodeLocalQr_REMOVED(')
  if ([regex]::Matches((Strip-Trivia $brokenQr), '^\s*export function decodeLocalQr\(', [Text.RegularExpressions.RegexOptions]::Multiline).Count -gt 0) { throw 'QR negative regression did not turn red.' }
  if (-not $brokenQr.Replace('export function decodeLocalQr_REMOVED(', 'export function decodeLocalQr(').Contains('export function decodeLocalQr(', [System.StringComparison]::Ordinal)) { throw 'QR negative regression did not return green.' }

  $brokenMount = $text.destinationUi.Replace('data-testid="authenticator-destination"', 'data-testid="authenticator-destination_REMOVED"')
  if ($brokenMount.Contains('data-testid="authenticator-destination"', [System.StringComparison]::Ordinal)) { throw 'Mount negative regression did not turn red.' }
  if (-not $brokenMount.Replace('data-testid="authenticator-destination_REMOVED"', 'data-testid="authenticator-destination"').Contains('data-testid="authenticator-destination"', [System.StringComparison]::Ordinal)) { throw 'Mount negative regression did not return green.' }

  $brokenReason = $text.vault.Replace('The operating-system credential vault is unavailable.', 'The vault is unavailable.')
  if ($brokenReason.Contains('The operating-system credential vault is unavailable.', [System.StringComparison]::Ordinal)) { throw 'Expected-reason negative regression did not turn red.' }
  if (-not $brokenReason.Replace('The vault is unavailable.', 'The operating-system credential vault is unavailable.').Contains('The operating-system credential vault is unavailable.', [System.StringComparison]::Ordinal)) { throw 'Expected-reason negative regression did not return green.' }

  $brokenHistoryReason = $text.store.Replace('History was not recorded.', 'History was not stored.')
  if ($brokenHistoryReason.Contains('History was not recorded.', [System.StringComparison]::Ordinal)) { throw 'History recovery reason negative regression did not turn red.' }
  if (-not $brokenHistoryReason.Replace('History was not stored.', 'History was not recorded.').Contains('History was not recorded.', [System.StringComparison]::Ordinal)) { throw 'History recovery reason negative regression did not return green.' }
}

Write-Output 'PASS: authenticator and unlock-ladder exact source inventory'
if ($SelfTest) { Write-Output 'PASS: authenticator and unlock-ladder negative red-green checks' }

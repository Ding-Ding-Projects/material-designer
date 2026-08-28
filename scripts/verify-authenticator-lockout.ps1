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
  ladder = Join-Path $root 'design/apps/desktop/src/main/lockout/service.ts'
  tests = Join-Path $root 'design/apps/desktop/tests/main/authenticator-lockout.test.ts'
  ui = Join-Path $root 'design/apps/web/src/components/AuthenticatorDestination.tsx'
  router = Join-Path $root 'design/apps/web/src/router.ts'
  commands = Join-Path $root 'design/apps/web/src/components/command-palette/commands.ts'
  tabs = Join-Path $root 'design/apps/web/src/components/WorkspaceTabsBar.tsx'
  app = Join-Path $root 'design/apps/web/src/App.tsx'
  runtime = Join-Path $root 'design/apps/desktop/src/main/runtime.ts'
  preload = Join-Path $root 'design/apps/desktop/src/main/preload.cts'
}

function Read-Text([string]$Path) { [System.IO.File]::ReadAllText($Path) }
function Require([string]$Text, [string]$Needle, [string]$Name) {
  if (-not $Text.Contains($Needle)) { throw "Missing contract: $Name" }
}
function Require-Exact([string]$Text, [string]$Pattern, [string]$Name) {
  if ([regex]::Matches($Text, [regex]::Escape($Pattern)).Count -ne 1) { throw "Missing or duplicate exact contract: $Name" }
}

$protocol = Read-Text $files.protocol
$destination = Read-Text $files.destination
$store = Read-Text $files.store
$history = Read-Text $files.history
$vault = Read-Text $files.vault
$ladder = Read-Text $files.ladder
$tests = Read-Text $files.tests
$ui = Read-Text $files.ui
$router = Read-Text $files.router
$commands = Read-Text $files.commands
$tabs = Read-Text $files.tabs
$app = Read-Text $files.app
$runtime = Read-Text $files.runtime
$preload = Read-Text $files.preload

Require $protocol 'export function decodeBase32' 'strict Base32 decoder'
Require $protocol 'export function parseOtpauthUri' 'otpauth URI parser'
Require $protocol 'export function buildOtpauthUri' 'otpauth URI builder'
Require $protocol 'export function hotp' 'HOTP implementation'
Require $protocol 'export function totp' 'TOTP implementation'
Require $protocol 'export function encodeLocalQr' 'in-process QR encoder'
Require $protocol 'export function decodeLocalQr' 'in-process QR decoder'
Require $destination 'kind: "qr-image" | "qr-clipboard"' 'image and clipboard registration'
Require $destination 'kind: "camera"' 'camera registration path'
Require $destination 'Registration requires one current authenticator code' 'pairing confirmation'
Require $store 'kind: "operating-system-vault"' 'operating-system vault boundary'
Require $store 'secretsOmitted: true' 'ordinary export omission'
Require $store 'exportCleartext' 'explicit cleartext export route'
Require $store 'super-confirmation' 'super confirmation boundary'
Require $history 'class LocalGitHistory' 'isolated local Git history'
Require $history 'encryptedSnapshot' 'encrypted snapshot record'
Require $history 'class PasswordProtectedHistory' 'password-protected history manager'
Require $vault 'safeStorage.isEncryptionAvailable' 'platform vault availability probe'
Require $vault 'encryptString' 'platform vault encryption'
Require $vault 'The operating-system credential vault is unavailable.' 'honest vault-unavailable state'
Require $ladder 'const MAX_LADDER_USES = 3' 'rolling ladder budget'
Require $ladder 'this.#nonceIndex.delete(nonce)' 'single-use nonce consumption'
Require $ladder 'code: "early-submit"' 'early mole-submit refusal'
Require $ladder 'code: "duplicate-mole"' 'duplicate mole refusal contract'
Require $ladder 'remainingAttempts: options.remainingAttempts' 'attempt state contract'
Require $ladder 'schoolMode ? "sums" : "dish"' 'School mode start stage'
Require $tests 'RFC 6238 SHA-1, SHA-256, and SHA-512 vectors' 'published vector tests'
Require $tests 'five wrong dishes escalate to sums' 'dish escalation test'
Require $tests 'mole submissions are single-use' 'mole replay test'
Require $ui 'data-testid="authenticator-destination"' 'mounted authenticator destination'
Require $ui 'RegexSearchField' 'destination search builder'
Require $ui 'type="file" accept="image/*,.json"' 'semantic local file picker'
Require $ui 'Credential vault: unavailable' 'visible vault unavailable copy'
Require $ui 'Copy current code' 'current-code copy action'
Require $ui 'Group selected' 'group bulk action'
Require $ui 'Reorder selected' 'reorder bulk action'
Require $router "view: 'authenticator'" 'authenticator route'
Require $commands "id: 'go.authenticator'" 'command-palette route row'
Require $tabs "authenticator: 'Authenticator'" 'workspace tab title'
Require $app 'AuthenticatorDestination' 'App destination mount'
Require $runtime 'new ElectronSecretVault' 'runtime vault adapter consumption'
Require $runtime 'od:authenticator:vault-status' 'vault status bridge'
Require $preload 'authenticatorVaultStatus' 'renderer vault status bridge'

if ($SelfTest) {
  $broken = $ladder.Replace('const MAX_LADDER_USES = 3', 'const MAX_LADDER_USES = 4')
  $red = $broken.Contains('const MAX_LADDER_USES = 3')
  if ($red) { throw 'Negative regression did not turn red for the ladder budget.' }
  $restored = $broken.Replace('const MAX_LADDER_USES = 4', 'const MAX_LADDER_USES = 3')
  if (-not $restored.Contains('const MAX_LADDER_USES = 3')) { throw 'Negative regression did not return green after restoring the budget.' }

  $brokenProtocol = $protocol.Replace('export function decodeLocalQr(', 'export function decodeLocalQr_REMOVED(')
  if ($brokenProtocol.Contains('export function decodeLocalQr(')) { throw 'Negative regression did not turn red for the QR decoder.' }
  $restoredProtocol = $brokenProtocol.Replace('export function decodeLocalQr_REMOVED', 'export function decodeLocalQr')
  if (-not $restoredProtocol.Contains('export function decodeLocalQr')) { throw 'Negative regression did not return green for the QR decoder.' }

  $brokenStore = $store.Replace('secretsOmitted: true', 'secretsOmitted: false')
  if ($brokenStore.Contains('secretsOmitted: true')) { throw 'Negative regression did not turn red for export omission.' }
  $restoredStore = $brokenStore.Replace('secretsOmitted: false', 'secretsOmitted: true')
  if (-not $restoredStore.Contains('secretsOmitted: true')) { throw 'Negative regression did not return green for export omission.' }

  $brokenNonce = $ladder.Replace('this.#nonceIndex.delete(nonce)', 'this.#nonceIndex.delete(nonce_REMOVED)')
  if ($brokenNonce.Contains('this.#nonceIndex.delete(nonce)')) { throw 'Negative regression did not turn red for nonce consumption.' }
  $restoredNonce = $brokenNonce.Replace('this.#nonceIndex.delete(nonce_REMOVED)', 'this.#nonceIndex.delete(nonce)')
  if (-not $restoredNonce.Contains('this.#nonceIndex.delete(nonce)')) { throw 'Negative regression did not return green for nonce consumption.' }

  $brokenUi = $ui.Replace('data-testid="authenticator-destination"', 'data-testid="authenticator-destination_REMOVED"')
  if ($brokenUi.Contains('data-testid="authenticator-destination"')) { throw 'Negative regression did not turn red for mounted destination.' }
  $restoredUi = $brokenUi.Replace('data-testid="authenticator-destination_REMOVED"', 'data-testid="authenticator-destination"')
  if (-not $restoredUi.Contains('data-testid="authenticator-destination"')) { throw 'Negative regression did not return green for mounted destination.' }

  $brokenVault = $vault.Replace('encryptString(', 'encryptString_REMOVED(')
  if ($brokenVault.Contains('encryptString(')) { throw 'Negative regression did not turn red for vault consumption.' }
  $restoredVault = $brokenVault.Replace('encryptString_REMOVED(', 'encryptString(')
  if (-not $restoredVault.Contains('encryptString')) { throw 'Negative regression did not return green for vault consumption.' }

  $brokenSession = $ladder.Replace('emits a cookie', 'emits a session cookie')
  if (-not $brokenSession.Contains('emits a session cookie')) { throw 'Negative regression did not turn red for the no-session invariant.' }
  $restoredSession = $brokenSession.Replace('emits a session cookie', 'emits a cookie')
  if (-not $restoredSession.Contains('emits a cookie')) { throw 'Negative regression did not return green for the no-session invariant.' }
}

Write-Output 'PASS: authenticator and unlock-ladder source contracts'
if ($SelfTest) { Write-Output 'PASS: authenticator and unlock-ladder negative red-green checks' }

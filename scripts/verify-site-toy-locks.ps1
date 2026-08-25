param([switch]$SelfTest)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

function Read-Sources {
  return @{
    JavaScript = [IO.File]::ReadAllText((Join-Path $repoRoot 'site/assets/js/toy-locks.js'))
    Main = [IO.File]::ReadAllText((Join-Path $repoRoot 'site/assets/js/main.js'))
    Html = [IO.File]::ReadAllText((Join-Path $repoRoot 'site/index.html'))
    Css = [IO.File]::ReadAllText((Join-Path $repoRoot 'site/assets/css/app.css'))
  }
}

function Assert-Contains([string]$Text, [string]$Needle, [string]$Label) {
  if (-not $Text.Contains($Needle)) { throw "Missing site toy-lock contract: $Label" }
}

function Test-Sources($Sources) {
  $js = $Sources.JavaScript
  $expectedPolicies = @(
    "id: 'pin', label: 'PIN', factors: Object.freeze(['pin'])",
    "id: 'password', label: 'Password', factors: Object.freeze(['password'])",
    "id: 'pin-password', label: 'PIN plus password', factors: Object.freeze(['pin', 'password'])",
    "id: 'password-totp', label: 'Password plus TOTP', factors: Object.freeze(['password', 'totp'])",
    "id: 'pin-totp', label: 'PIN plus TOTP', factors: Object.freeze(['pin', 'totp'])",
    "id: 'password-pin-totp', label: 'Password plus PIN plus TOTP', factors: Object.freeze(['password', 'pin', 'totp'])"
  )
  foreach ($policy in $expectedPolicies) { Assert-Contains $js $policy "policy $policy" }
  if ([regex]::Matches($js, "Object\.freeze\(\{ id: '").Count -ne 6) { throw 'The site must expose exactly six toy-lock policies.' }

  $checks = @(
    @($Sources.Main, "import { initToyLocks } from './toy-locks.js';", 'main module import'),
    @($Sources.Main, 'initToyLocks({ notify: ui.notify });', 'main module initialization'),
    @($Sources.Html, 'data-toy-lock-target aria-disabled="true" aria-label="Open protected example, locked" data-toy-locked="true"', 'auth-activatable unavailable target'),
    @($Sources.Html, 'data-toy-protected-content hidden', 'real protected content state'),
    @($Sources.Html, 'This is for fun only, not security or encryption.', 'plain safety disclosure'),
    @($Sources.Html, "Clear this site's browser storage to recover.", 'browser-storage recovery'),
    @($js, 'event.preventDefault();', 'protected-action default prevention'),
    @($js, 'event.stopImmediatePropagation();', 'protected-action handler interception'),
    @($js, 'openPrompt(protectedAction, target);', 'authentication prompt before action'),
    @($js, "return String(value || '').replace(/[\s-]/g, '');", 'shared PIN normalization'),
    @($js, 'export const MAX_ATTEMPTS = 5;', 'bounded attempt budget'),
    @($js, 'export const RETRY_DELAY_MS = 60_000;', 'bounded cooldown'),
    @($js, 'localStorage.setItem(STORAGE_KEY, JSON.stringify(value));', 'browser-local attempt persistence'),
    @($js, "crypto.subtle.importKey('raw', bytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])", 'non-extractable TOTP key import'),
    @($js, "useKeyStore('readwrite', (store) => store.put(key, TOTP_KEY_ID))", 'IndexedDB TOTP key persistence'),
    @($js, "popover.setAttribute('role', 'dialog');", 'accessible dialog role'),
    @($js, "popover.setAttribute('aria-labelledby', 'toy-lock-prompt-title');", 'accessible prompt name'),
    @($js, "popover.setAttribute('aria-describedby', 'toy-lock-prompt-disclosure');", 'accessible prompt description'),
    @($js, 'if (protectedContent) protectedContent.hidden = false;', 'protected UI action'),
    @($js, "if (event.key === 'Escape') closePrompt();", 'Escape cancellation'),
    @($js, 'if (anchor) anchor.focus();', 'focus restoration'),
    @($Sources.Css, '.toy-lock-keypad {', 'access-control keypad layout')
  )
  foreach ($check in $checks) { Assert-Contains $check[0] $check[1] $check[2] }

  if ($Sources.Html -match 'data-toy-lock-target[^>]*\sdisabled(?:\s|=|>)') { throw 'A native disabled target cannot receive the authentication activation.' }
  if ($js -match '\b(fetch|XMLHttpRequest|WebSocket)\s*\(') { throw 'Site toy locks must not use a network API.' }
  if ($js -match 'totpSecret\s*:') { throw 'A plaintext TOTP secret must never enter the persisted lock record.' }
}

$sources = Read-Sources
Test-Sources $sources

if ($SelfTest) {
  $mutations = @(
    @('JavaScript', "event.stopImmediatePropagation();"),
    @('JavaScript', "id: 'pin-totp', label: 'PIN plus TOTP', factors: Object.freeze(['pin', 'totp'])"),
    @('JavaScript', "useKeyStore('readwrite', (store) => store.put(key, TOTP_KEY_ID))"),
    @('Html', 'data-toy-lock-target aria-disabled="true" aria-label="Open protected example, locked" data-toy-locked="true"'),
    @('Html', 'This is for fun only, not security or encryption.')
  )
  foreach ($mutation in $mutations) {
    $copy = @{} + $sources
    $copy[$mutation[0]] = $copy[$mutation[0]].Replace($mutation[1], '')
    $turnedRed = $false
    try { Test-Sources $copy } catch { $turnedRed = $true }
    if (-not $turnedRed) { throw "Negative mutation stayed green: $($mutation[1])" }
  }
  Test-Sources $sources
  Write-Output "PASS: five deliberate removals turned red, and restored site toy-lock sources turned green."
}

Write-Output 'PASS: site toy-lock source contract is complete for the representative action.'

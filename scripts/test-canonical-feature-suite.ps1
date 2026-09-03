param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [switch]$SelfTest
)

$ErrorActionPreference = 'Stop'

function Assert-True([bool]$Condition, [string]$Message) {
  if (-not $Condition) { throw "FAIL: $Message" }
}

$indexPath = Join-Path $RepoRoot 'site/index.html'
$modulePath = Join-Path $RepoRoot 'site/assets/js/canonical-feature-suite.js'
$stylePath = Join-Path $RepoRoot 'site/assets/css/canonical-feature-suite.css'
$uiPath = Join-Path $RepoRoot 'site/assets/js/ui.js'
$universalSourcePath = Join-Path $RepoRoot 'design/apps/web/src/components/universal-settings/universalSettings.ts'
foreach ($path in @($indexPath, $modulePath, $stylePath, $uiPath, $universalSourcePath)) {
  Assert-True (Test-Path -LiteralPath $path) "Missing canonical feature suite file: $path"
}

$index = Get-Content -LiteralPath $indexPath -Raw
$module = Get-Content -LiteralPath $modulePath -Raw
$style = Get-Content -LiteralPath $stylePath -Raw
$ui = Get-Content -LiteralPath $uiPath -Raw
$universalSource = Get-Content -LiteralPath $universalSourcePath -Raw

Assert-True ($index.Contains('assets/css/canonical-feature-suite.css')) 'The page does not load the dedicated feature-suite stylesheet.'
Assert-True ($index.Contains('assets/js/canonical-feature-suite.js')) 'The page does not load the dedicated feature-suite module.'
Assert-True ($index.Contains('data-canonical-feature-suite')) 'The page has no canonical feature-suite mount.'
Assert-True ($index.Contains('data-canonical-feature-summary')) 'The page has no live feature-suite summary status.'
Assert-True ($module.Contains("import { attachRegexBuilder } from './regex.js';")) 'The suite does not reuse the existing regex builder.'
Assert-True ($module.Contains("import * as i18n from './i18n.js';")) 'The suite does not follow the existing language state.'
Assert-True ($module.Contains("import { initializeUniversalSettingsOwner, registerUniversalSettingsPage } from './universal-settings.js';")) 'The suite does not mount the universal page settings owner.'
Assert-True ($module.Contains("import { mountPersonalVocabulary } from './personal-vocabulary.js';")) 'The suite does not mount the local personal-wording control.'
Assert-True ($module.Contains("import { mount as mountLogoCustomization } from './logo.js';")) 'The suite does not mount local app-logo customization.'
Assert-True ($module.Contains('localStorage')) 'The suite has no local visitor state path.'
Assert-True ($module.Contains('data-regex-builder')) 'The suite search has no regex-builder hook.'
Assert-True ($module.Contains('Review all visible')) 'The suite has no bulk review action.'
Assert-True ($module.Contains('Invert review')) 'The suite has no inverse review action.'
Assert-True ($style.Contains('prefers-reduced-motion')) 'The dedicated stylesheet has no reduced-motion rule.'
Assert-True ($style.Contains('max-width: 38rem')) 'The dedicated stylesheet has no narrow-layout rule.'
Assert-True ($index.Contains('data-universal-settings')) 'The page has no universal settings mount.'
Assert-True ($index.Contains('data-personal-vocabulary')) 'The page has no personal-vocabulary upload mount.'
Assert-True ($index.Contains('data-logo-customization')) 'The page has no app-logo customization mount.'
foreach ($panel in @('language', 'school', 'narrator', 'schedule', 'adhd', 'notifications', 'status')) {
  Assert-True ($index.Contains("data-universal-panel=`"$panel`"")) "The universal settings panel is missing: $panel"
}
Assert-True ($module.Contains('registerUniversalSettingsPage({ requestDestructiveConfirmation })')) 'The page settings registration does not own its destructive confirmation route.'
Assert-True ($module.Contains('universalRegistration.acknowledgeMount()')) 'The page settings mount is not acknowledged.'
Assert-True ($module.Contains('function requestDestructiveConfirmation')) 'The page has no destructive confirmation implementation.'
Assert-True ($module.Contains('acceptedProgress + 10')) 'The confirmation slider can skip its bounded progression.'
Assert-True ($module.Contains('Emergency exit')) 'The confirmation surface has no emergency exit.'
Assert-True ($ui.Contains("window.localStorage.getItem('material-designer:universal-settings:page-v1')")) 'The startup surprise does not read the persisted School-mode boundary before its draw.'

$expected = @(
  'language-modes', 'dialog-emoji-toggle', 'school-mode', 'narration',
  'scheduled-settings', 'dim-sum-surprise', 'regex-builders', 'notification-centre',
  'appearance-editors', 'tabbed-navigation', 'offline-documentation', 'command-palette',
  'destructive-confirmation', 'local-history', 'changelog-viewer', 'external-editor',
  'exports', 'bulk-actions', 'accessibility-responsive-sizing', 'personal-vocabulary-upload',
  'toy-locks-authentication', 'unlock-ladder', 'shared-link-embed', 'adhd-modes',
  'browser-download-surfaces', 'app-logo-customization', 'file-converter',
  'ollama-suite-manager', 'status-hub', 'front-screen-provenance'
)
function Assert-ExactFeatureRoster([string]$Source) {
  $actual = @([regex]::Matches($Source, "\{ id: '([^']+)'", [System.Text.RegularExpressions.RegexOptions]::CultureInvariant) | ForEach-Object { $_.Groups[1].Value })
  Assert-True ($actual.Count -eq 30) "Expected exactly 30 feature records, found $($actual.Count)."
  for ($i = 0; $i -lt $expected.Count; $i++) {
    Assert-True ($actual[$i] -eq $expected[$i]) "Feature order mismatch at index ${i}: expected $($expected[$i]), found $($actual[$i])."
  }
  Assert-True (($actual | Select-Object -Unique).Count -eq 30) 'Feature IDs are not unique.'
}

$centralRows = @(
  "{ id: 'settings-panel', path: 'design/apps/web/src/components/SettingsDialog.tsx', status: 'mounted' }",
  "{ id: 'shell-runtime', path: 'design/apps/web/src/App.tsx', status: 'mounted' }",
  "{ id: 'command-palette', path: 'design/apps/web/src/components/command-palette/CommandPalette.tsx', status: 'pending-c0' }",
  "{ id: 'notification-center', path: 'design/apps/web/src/components/notifications/NotificationCenter.tsx', status: 'mounted' }",
  "{ id: 'school-consumers', path: 'design/apps/web/src/components/school-mode-consumers.ts', status: 'pending-c0' }",
  "{ id: 'desktop-host-bridge', path: 'design/apps/desktop/src/main/preload.cts', status: 'pending-c0' }",
  "{ id: 'desktop-host-runtime', path: 'design/apps/desktop/src/main/runtime.ts', status: 'pending-c0' }",
  "{ id: 'page-registration', path: 'site/assets/js/canonical-feature-suite.js', status: 'mounted' }",
  "{ id: 'page-markup', path: 'site/index.html', status: 'mounted' }"
)

function Assert-CentralMountInventory([string]$Source) {
  foreach ($row in $centralRows) {
    Assert-True ($Source.Contains($row)) "Central mount inventory row is missing or stale: $row"
  }
}

Assert-ExactFeatureRoster $module
Assert-CentralMountInventory $universalSource

if ($SelfTest) {
  $broken = $module.Replace("{ id: 'language-modes'", "{ id: 'language-modes-removed'")
  $turnedRed = $false
  try { Assert-ExactFeatureRoster $broken } catch { $turnedRed = $true }
  Assert-True $turnedRed 'The deliberate feature-roster removal did not turn the check red.'
  Assert-ExactFeatureRoster $module
  $brokenCentral = $universalSource.Replace($centralRows[0], "{ id: 'settings-panel', path: 'design/apps/web/src/components/SettingsDialog.tsx', status: 'pending-c0' }")
  $centralTurnedRed = $false
  try { Assert-CentralMountInventory $brokenCentral } catch { $centralTurnedRed = $true }
  Assert-True $centralTurnedRed 'The deliberate central mount-status regression did not turn the check red.'
  Assert-CentralMountInventory $universalSource
  Write-Output 'SELFTEST RED: removing the exact language-modes boundary was refused.'
  Write-Output 'SELFTEST RED: reverting the exact settings-panel mount status was refused.'
  Write-Output 'SELFTEST GREEN: restoring the exact boundary passed.'
}

Write-Output 'PASS: canonical feature suite has the exact 30-record roster, local state, language integration, regex hook, bulk review controls, and responsive styling.'

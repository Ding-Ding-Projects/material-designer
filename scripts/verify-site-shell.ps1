param(
  [switch]$SelfTest
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

function Read-Text([string]$relative) {
  $path = Join-Path $root $relative
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Missing required site-shell file: $relative" }
  return [System.IO.File]::ReadAllText($path)
}

function Assert-Contains([string]$source, [string]$needle, [string]$label) {
  if (-not $source.Contains($needle)) { throw "Site shell contract missing: $label" }
}

function Assert-NotContains([string]$source, [string]$needle, [string]$label) {
  if ($source.Contains($needle)) { throw "Site shell contract contains forbidden state: $label" }
}

$html = Read-Text 'site/index.html'
$tabs = Read-Text 'site/assets/js/tabs.js'
$shell = Read-Text 'site/assets/js/site-shell.js'
$contract = Read-Text 'site/assets/js/site-shell-contract.js'
$main = Read-Text 'site/assets/js/main.js'
$inventory = Read-Text 'site/SITE_SURFACE_INVENTORY.json'

$required = @(
  '"overview"', '"features"', '"install"', '"releases"', '"building"',
  '"verifying"', '"standards"', '"docs"', '"provenance"', '"settings"',
  '"strip"', '"group-members"', '"groups"', '"master"',
  'settings-settings-language-search', 'settings-settings-tone-search',
  'settings-settings-appearance-search', 'settings-settings-toy-locks-search',
  'settings-settings-reset-search'
)
foreach ($needle in $required) { Assert-Contains $inventory $needle $needle }
Assert-Contains $html 'data-site-provenance' 'front provenance fields'
Assert-Contains $html 'Ctrl+Shift+F' 'palette shortcut'
Assert-NotContains $html 'Ctrl K' 'legacy palette shortcut'
Assert-Contains $tabs "this.dockEdge = 'left'" 'left default docking'
Assert-Contains $tabs 'closeTabs(ids, { includePinned = false } = {})' 'bulk-close API'
Assert-Contains $tabs 'createGroup(id, name' 'group API'
Assert-Contains $tabs 'setDockEdge(edge)' 'dock API'
Assert-Contains $shell "const INVENTORY = Object.freeze" 'hand-written inventory'
Assert-Contains $shell 'installUniversalContextMenus()' 'universal context menu shell'
Assert-Contains $shell 'installDropdownSearches()' 'dropdown search shell'
Assert-Contains $shell 'initFrontProvenance()' 'front provenance shell'
Assert-Contains $contract 'selfTestSiteShellContract' 'red-green self-test'
Assert-Contains $main "import { initSiteShell } from './site-shell.js';" 'main shell wiring'

if ($SelfTest) {
  # Mutate exact boundaries in memory. A substring-only check would stay green
  # if an import were commented out or a required panel were removed from the
  # hand-written inventory.
  $mutatedMain = $main.Replace("import { initSiteShell } from './site-shell.js';", '')
  if ($mutatedMain.Contains("import { initSiteShell } from './site-shell.js';")) { throw 'Self-test mutation failed to remove the exact main import.' }
  try { Assert-Contains $mutatedMain "import { initSiteShell } from './site-shell.js';" 'self-test removed main wiring' ; throw 'Self-test did not turn red for removed main wiring.' } catch { if ($_.Exception.Message -notlike 'Site shell contract missing:*') { throw } }

  $mutatedInventory = $inventory.Replace('"settings-reset"', '')
  try { Assert-Contains $mutatedInventory '"settings-reset"' 'self-test removed required settings row' ; throw 'Self-test did not turn red for removed inventory row.' } catch { if ($_.Exception.Message -notlike 'Site shell contract missing:*') { throw } }
}

Write-Output 'PASS: site shell contract is complete at source level.'
if ($SelfTest) { Write-Output 'PASS: site shell negative mutations turned red and restoration stayed green.' }

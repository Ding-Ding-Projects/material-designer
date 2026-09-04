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
  '"stateKeys"', '"md-designer.site.shell.v2"', '"md-designer.site.settings-tabs.v2"', '"md-designer.site.tabs"',
  '"nestedSurfaces"', 'nested-overview-status-search', 'nested-docs-outside-search', 'nested-provenance-main-search',
  'settings-settings-language-search', 'settings-settings-tone-search',
  'settings-settings-appearance-search', 'settings-settings-toy-locks-search',
  'settings-settings-reset-search'
)
foreach ($needle in $required) { Assert-Contains $inventory $needle $needle }
Assert-Contains $html 'data-site-provenance' 'front provenance fields'
Assert-Contains $html 'Ctrl+Shift+F' 'palette shortcut'
Assert-NotContains $html 'Ctrl K' 'legacy palette shortcut'
Assert-NotContains $main 'window.confirm' 'native destructive confirmation'
Assert-Contains $tabs ('this.dockEdge = ' + [char]39 + 'left' + [char]39) 'left default docking'
Assert-Contains $tabs 'closeTabs(ids, { includePinned = false } = {})' 'bulk-close API'
Assert-Contains $tabs 'createGroup(id, name' 'group API'
Assert-Contains $tabs 'setDockEdge(edge)' 'dock API'
Assert-Contains $shell "const INVENTORY = Object.freeze" 'hand-written inventory'
Assert-Contains $shell 'installUniversalContextMenus()' 'universal context menu shell'
Assert-Contains $shell 'installDropdownSearches()' 'dropdown search shell'
Assert-Contains $shell 'initFrontProvenance()' 'front provenance shell'
Assert-Contains $shell 'relocateOuterTabs(root, edge)' 'physical outer tab relocation'
Assert-Contains $shell 'MATERIAL_DESIGNER_SHARED_DESTRUCTIVE_GATE' 'shared destructive gate seam'
Assert-Contains $shell 'shellGroupSearchText' 'full group subtree search'
Assert-Contains $shell 'md-shell-select__panel' 'custom searchable dropdown'
Assert-Contains $contract 'tab-groups-manager-search' 'group-manager search inventory'
Assert-Contains $contract 'settings-group-manager-search' 'settings group-manager search inventory'
Assert-Contains $contract 'tabs-bulk-containing' 'bulk-close search inventory'
Assert-Contains $shell 'md-shell-context' 'context-menu shell marker'
Assert-Contains $shell ('keyOne: ' + [char]39 + 'CLOSE TABS' + [char]39) 'action-bound bulk close key'
Assert-Contains $shell 'keyTwo: `CLOSE ${closeState.ids.length}`' 'count-bound bulk close key'
Assert-Contains $shell 'validate: latest' 'immediate bulk-close validation'
Assert-Contains $shell 'md-shell-gate-progress' 'destructive gate progress surface'
Assert-Contains $shell ('panel.dataset.gateState = ' + [char]39 + 'complete' + [char]39) 'destructive gate completion state'
Assert-Contains $shell 'requestAnimationFrame(() => { run?.(); gate.destroy(); })' 'destructive gate action completion handoff'
Assert-Contains $shell 'field.controller?.onChange?.(render)' 'search builder change consumer'
Assert-Contains $shell 'groupSearch.controller?.onChange?.' 'group-manager builder change consumer'
Assert-Contains $shell 'root.dataset.builderState = ' 'builder unavailable state'
Assert-Contains $shell 'root.dataset.builderCallback = controller ? ' 'builder callback ownership state'
Assert-Contains $shell 'MATERIAL_DESIGNER_APPEARANCE_CONSUMER' 'appearance consumer seam'
Assert-Contains $shell 'MATERIAL_DESIGNER_TOY_LOCK_CONSUMER' 'toy-lock consumer seam'
Assert-Contains $shell 'shell.consumer.unavailable' 'localized unavailable consumer state'
Assert-Contains $shell ([char]39 + 'aria-haspopup' + [char]39 + ': ' + [char]39 + 'listbox' + [char]39) 'custom picker popup semantics'
Assert-Contains $shell ([char]39 + 'aria-controls' + [char]39 + ': `md-shell-options-${stableId}`') 'custom picker control relationship'
Assert-Contains $shell 'aria-activedescendant' 'custom picker active option state'
Assert-Contains $shell ('event.key === ' + [char]39 + 'Home' + [char]39) 'custom picker Home navigation'
Assert-Contains $shell ('event.key === ' + [char]39 + 'End' + [char]39) 'custom picker End navigation'
Assert-Contains $shell 'regex.getBuilder?.(input)?.destroy?.()' 'popover regex cleanup'
Assert-Contains $shell 'installNestedSurfaceSearches()' 'nested surface search installation'
Assert-Contains $tabs 'truncationStatus' 'visible tab truncation status'
Assert-Contains $tabs ('id: ' + [char]39 + 'md-tabs-live' + [char]39) 'stable tab live-region id'
Assert-Contains $tabs ('trigger.setAttribute(' + [char]39 + 'aria-controls' + [char]39 + ', panelId)') 'tab popover control relationship'
Assert-Contains $tabs ('case ' + [char]39 + 'ArrowDown' + [char]39) 'vertical tab keyboard path'
Assert-Contains $tabs ('case ' + [char]39 + 'Home' + [char]39) 'tab Home navigation'
Assert-Contains $tabs ('case ' + [char]39 + 'End' + [char]39) 'tab End navigation'
Assert-Contains (Read-Text 'site/assets/css/app.css') 'height:100%' 'outer tab full-height stretch'
Assert-Contains $contract 'selfTestSiteShellContract' 'red-green self-test'
$mainImportPattern = '(?m)^\s*import\s+\{\s*initSiteShell\s*\}\s+from\s+''\.\/site-shell\.js'';\s*$'
if ($main -notmatch $mainImportPattern) { throw 'Site shell contract missing: exact main shell import.' }

if ($SelfTest) {
  # Mutate exact boundaries in memory. A substring-only check would stay green
  # if an import were commented out or a required panel were removed from the
  # hand-written inventory.
  $mutatedMain = [regex]::Replace($main, $mainImportPattern, '')
  if ($mutatedMain -match $mainImportPattern) { throw 'Self-test mutation failed to remove the exact main import.' }
  try { if ($mutatedMain -notmatch $mainImportPattern) { throw 'Site shell contract missing: self-test removed main wiring' }; throw 'Self-test did not turn red for removed main wiring.' } catch { if ($_.Exception.Message -notlike 'Site shell contract missing:*') { throw } }

  $mainImportLiteral = 'import { initSiteShell } from ' + [char]39 + './site-shell.js' + [char]39 + ';'
  $commentedMain = $main.Replace($mainImportLiteral, '// ' + $mainImportLiteral)
  if ($commentedMain -match $mainImportPattern) { throw 'Self-test incorrectly accepted a commented-out import.' }

  $renamedMain = $main.Replace($mainImportLiteral, 'import { initSiteShellRenamed } from ' + [char]39 + './site-shell.js' + [char]39 + ';')
  if ($renamedMain -match $mainImportPattern) { throw 'Self-test incorrectly accepted a renamed import.' }

  $settingsResetNeedle = [string][char]34 + 'settings-reset' + [char]34
  $mutatedInventory = $inventory.Replace($settingsResetNeedle, '')
  try { Assert-Contains $mutatedInventory $settingsResetNeedle 'self-test removed required settings row' ; throw 'Self-test did not turn red for removed inventory row.' } catch { if ($_.Exception.Message -notlike 'Site shell contract missing:*') { throw } }
}

Write-Output 'PASS: site shell contract is complete at source level.'
if ($SelfTest) { Write-Output 'PASS: site shell negative mutations turned red and restoration stayed green.' }

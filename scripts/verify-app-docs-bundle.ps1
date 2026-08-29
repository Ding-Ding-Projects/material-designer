[CmdletBinding()]
param(
  [string]$RepoRoot = '',
  [switch]$SelfTest
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($RepoRoot)) { $RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')) }
$manifestPath = Join-Path $RepoRoot 'site/assets/data/docs-manifest.json'
$bundlePath = Join-Path $RepoRoot 'design/apps/web/src/lib/docs/generated.ts'
$componentPath = Join-Path $RepoRoot 'design/apps/web/src/components/documentation/DocumentationBrowserView.tsx'
$shellPath = Join-Path $RepoRoot 'design/apps/web/src/components/EntryShell.tsx'
$navPath = Join-Path $RepoRoot 'design/apps/web/src/components/EntryNavRail.tsx'
$palettePath = Join-Path $RepoRoot 'design/apps/web/src/components/command-palette/commands.ts'
$routerPath = Join-Path $RepoRoot 'design/apps/web/src/router.ts'
$inventoryPath = Join-Path $RepoRoot '.codex/verification/ui-drive/inventory.json'
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { throw "Source manifest is missing: $manifestPath" }
if (-not (Test-Path -LiteralPath $bundlePath -PathType Leaf)) { throw "App documentation bundle is missing: $bundlePath" }

$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
$bundle = Get-Content -Raw -LiteralPath $bundlePath

function Read-BundleManifest([string]$Text) {
  $start = $Text.IndexOf('export const DOCS_MANIFEST: BundledDocumentationManifest =')
  if ($start -lt 0) { throw 'The app documentation bundle has no exact manifest export.' }
  $jsonStart = $Text.IndexOf('{', $start)
  $jsonEnd = $Text.LastIndexOf(' as const;')
  if ($jsonStart -lt 0 -or $jsonEnd -le $jsonStart) { throw 'The app documentation bundle has no parseable manifest object.' }
  try { return $Text.Substring($jsonStart, $jsonEnd - $jsonStart) | ConvertFrom-Json } catch { throw 'The app documentation bundle manifest object is not valid JSON.' }
}

function Assert-AppDocsBundle([string]$Text, [object]$Source) {
  $parsed = Read-BundleManifest $Text
  $sourceJson = $Source | ConvertTo-Json -Depth 12 -Compress
  $parsedJson = $parsed | ConvertTo-Json -Depth 12 -Compress
  if ($sourceJson -ne $parsedJson) { throw 'The app documentation bundle object differs from the exact source manifest.' }
  if ($parsed.articleCount -ne $Source.articleCount -or @($parsed.articles).Count -ne $Source.articleCount) {
    throw 'The app documentation bundle count differs from the source manifest.'
  }
}

Assert-AppDocsBundle $bundle $manifest
Write-Output "PASS: app bundle contains all $($manifest.articleCount) source documentation articles"

function Assert-AppDocsMounts([hashtable]$Overrides = @{}) {
  $component = if ($Overrides.ContainsKey('component')) { $Overrides.component } else { Get-Content -Raw -LiteralPath $componentPath }
  $shell = if ($Overrides.ContainsKey('shell')) { $Overrides.shell } else { Get-Content -Raw -LiteralPath $shellPath }
  $nav = if ($Overrides.ContainsKey('nav')) { $Overrides.nav } else { Get-Content -Raw -LiteralPath $navPath }
  $palette = if ($Overrides.ContainsKey('palette')) { $Overrides.palette } else { Get-Content -Raw -LiteralPath $palettePath }
  $router = if ($Overrides.ContainsKey('router')) { $Overrides.router } else { Get-Content -Raw -LiteralPath $routerPath }
  $inventory = Get-Content -Raw -LiteralPath $inventoryPath | ConvertFrom-Json
  if ($component -notmatch 'data-testid="documentation-browser"') { throw 'Documentation browser component has no exact test identity.' }
  if ($component -notmatch 'assertBundledDocumentationManifest\(\)') { throw 'Documentation browser does not consume the asserted bundle.' }
  if ($shell -notmatch 'data-testid="entry-view-documentation"') { throw 'Entry shell has no documentation destination mount.' }
  if ($shell -notmatch 'DocumentationBrowserView') { throw 'Entry shell does not render the documentation browser.' }
  if ($nav -notmatch 'testId="entry-nav-documentation"') { throw 'Entry navigation has no documentation tab.' }
  if ($palette -notmatch "id: 'go\.documentation'") { throw 'Command palette has no documentation destination.' }
  if ($router -notmatch "\| 'documentation'") { throw 'Router has no documentation view.' }
  $desktop = @($inventory.surfaces | Where-Object { $_.kind -eq 'desktop-application' })
  if ($desktop.Count -ne 1) { throw 'UI-drive inventory must contain exactly one desktop-application surface.' }
  $row = @($desktop[0].features | Where-Object { $_.id -eq 'offline-documentation' })
  if ($row.Count -ne 1) { throw 'UI-drive inventory must contain exactly one offline-documentation row.' }
  if ([string]$row[0].implementationPath -ne 'design/apps/web/src/components/documentation/DocumentationBrowserView.tsx') { throw 'UI-drive inventory points at the wrong documentation implementation.' }
  if (@($row[0].requiredInteractions).Count -lt 3) { throw 'UI-drive inventory is missing documentation interactions.' }
}

Assert-AppDocsMounts
Write-Output 'PASS: app documentation route, navigation, palette and packaged inventory are registered'

if ($SelfTest) {
  $firstPath = [string]$manifest.articles[0].path
  $broken = $bundle.Replace('"path": "' + $firstPath + '"', '"path": "omitted.md"')
  $red = $false
  try { Assert-AppDocsBundle $broken $manifest } catch { $red = $true }
  if (-not $red) { throw 'Negative regression stayed green after omitting one source article.' }
  Assert-AppDocsBundle $bundle $manifest
  $component = Get-Content -Raw -LiteralPath $componentPath
  $mountBroken = @{ component = $component.Replace('data-testid="documentation-browser"', 'data-testid="documentation-browser-omitted"') }
  $mountRed = $false
  try { Assert-AppDocsMounts $mountBroken } catch { $mountRed = $true }
  if (-not $mountRed) { throw 'Negative regression stayed green after removing the documentation browser identity.' }
  Assert-AppDocsMounts
  Write-Output 'PASS: app documentation bundle negative regression turned red, then green.'
}

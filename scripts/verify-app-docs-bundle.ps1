[CmdletBinding()]
param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [switch]$SelfTest
)

$ErrorActionPreference = 'Stop'
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

function Assert-AppDocsBundle([string]$Text, [object]$Source) {
  if ($Text -notmatch 'export const DOCS_MANIFEST') { throw 'The app documentation bundle has no exported manifest.' }
  if ($Text -notmatch '"articleCount":\s*' + [regex]::Escape([string]$Source.articleCount)) { throw 'The app documentation bundle count differs from the source manifest.' }
  foreach ($article in $Source.articles) {
    $pathNeedle = '"path":\s*"' + [regex]::Escape($article.path) + '"'
    $hashNeedle = '"sha256":\s*"' + [regex]::Escape($article.sha256) + '"'
    if ($Text -notmatch $pathNeedle) { throw "The app bundle omitted article $($article.path)." }
    if ($Text -notmatch $hashNeedle) { throw "The app bundle has no source hash for $($article.path)." }
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

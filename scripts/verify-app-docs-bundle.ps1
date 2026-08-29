[CmdletBinding()]
param(
  [string]$RepoRoot = '',
  [switch]$SelfTest,
  [switch]$RequireCentralMount
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
  $RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
}

function Remove-JavaScriptComments([string]$Source) {
  $result = [System.Text.StringBuilder]::new()
  $state = 'code'
  $quote = ''
  $escaped = $false
  for ($index = 0; $index -lt $Source.Length; $index++) {
    $char = $Source[$index]
    $next = if ($index + 1 -lt $Source.Length) { $Source[$index + 1] } else { [char]0 }
    if ($state -eq 'line-comment') {
      if ($char -eq [char]13 -or $char -eq [char]10) { [void]$result.Append($char); $state = 'code' }
      continue
    }
    if ($state -eq 'block-comment') {
      if ($char -eq '*' -and $next -eq '/') { $index++; $state = 'code' }
      continue
    }
    if ($state -eq 'string') {
      [void]$result.Append($char)
      if ($escaped) { $escaped = $false; continue }
      if ($char -eq '\') { $escaped = $true; continue }
      if ($char -eq $quote) { $state = 'code' }
      continue
    }
    if ($char -eq "'" -or $char -eq '"' -or $char -eq [char]96) {
      $quote = $char
      $state = 'string'
      [void]$result.Append($char)
      continue
    }
    if ($char -eq '/' -and $next -eq '/') { $index++; $state = 'line-comment'; continue }
    if ($char -eq '/' -and $next -eq '*') { $index++; $state = 'block-comment'; continue }
    [void]$result.Append($char)
  }
  return $result.ToString()
}

function Read-BundleManifest([string]$Text) {
  $live = Remove-JavaScriptComments $Text
  $start = $live.IndexOf('export const DOCS_MANIFEST: BundledDocumentationManifest =', [System.StringComparison]::Ordinal)
  if ($start -lt 0) { throw 'App documentation bundle has no live manifest export.' }
  $jsonStart = $live.IndexOf('{', $start)
  $jsonEnd = $live.LastIndexOf(' as const;', [System.StringComparison]::Ordinal)
  if ($jsonStart -lt 0 -or $jsonEnd -le $jsonStart) { throw 'App documentation bundle has no parseable manifest object.' }
  try { return $live.Substring($jsonStart, $jsonEnd - $jsonStart) | ConvertFrom-Json } catch { throw 'App documentation bundle manifest is not valid JSON.' }
}

function Get-TextHash([string]$Value) {
  $sha = [Security.Cryptography.SHA256]::Create()
  try {
    return [BitConverter]::ToString($sha.ComputeHash([Text.UTF8Encoding]::new($false).GetBytes($Value))).Replace('-', '').ToLowerInvariant()
  } finally {
    $sha.Dispose()
  }
}

function Assert-BundleObject([object]$Bundle, [object]$Source) {
  if ($Bundle.schemaVersion -ne $Source.schemaVersion -or $Bundle.source -cne $Source.source -or $Bundle.articleCount -ne $Source.articleCount) {
    throw 'App documentation bundle top-level object differs from the source manifest.'
  }
  if (@($Bundle.articles).Count -ne $Source.articleCount) { throw 'App documentation bundle article count differs from the source manifest.' }
  for ($index = 0; $index -lt $Source.articleCount; $index++) {
    $expected = $Source.articles[$index]
    $actual = $Bundle.articles[$index]
    foreach ($field in @('id', 'path', 'category', 'title', 'kind', 'sourceUrl', 'sha256')) {
      if ([string]$actual.$field -cne [string]$expected.$field) { throw "App documentation bundle changed $field at article index $index." }
    }
    if ((@($actual.suggestedArticles) -join [char]0) -cne (@($expected.suggestedArticles) -join [char]0)) { throw "App documentation bundle changed suggestions at article index $index." }
    if ((@($actual.fragments) -join [char]0) -cne (@($expected.fragments) -join [char]0)) { throw "App documentation bundle changed fragments at article index $index." }
    if ((@($actual.images | ForEach-Object { [string]$_.source + '|' + [string]$_.path + '|' + [string]$_.sha256 }) -join [char]0) -cne (@($expected.images | ForEach-Object { [string]$_.source + '|' + [string]$_.path + '|' + [string]$_.sha256 }) -join [char]0)) { throw "App documentation bundle changed images at article index $index." }
    $actualMarkdown = ([string]$actual.markdown).Replace(([char]13).ToString(), '')
    $expectedMarkdown = ([string]$expected.markdown).Replace(([char]13).ToString(), '')
    if ((Get-TextHash $actualMarkdown) -cne (Get-TextHash $expectedMarkdown)) {
      throw "App documentation bundle changed Markdown at article index $index."
    }
  }
}

function Assert-AppSource([string]$Component, [string]$Opener, [string]$Test) {
  $componentLive = Remove-JavaScriptComments $Component
  $openerLive = Remove-JavaScriptComments $Opener
  $testLive = Remove-JavaScriptComments $Test
  $requiredComponent = @(
    'data-testid="documentation-browser"',
    'assertBundledDocumentationManifest()',
    'DocumentationCopy',
    'relativeImageMap',
    'indexedImagesOnly',
    'resolveInternalLink',
    'article.fragments',
    'DOCUMENTATION_OPEN_EVENT',
    'takePendingDocumentation',
    'focusRequest',
    'documentation-article-search',
    'documentation-reader-title'
  )
  foreach ($needle in $requiredComponent) {
    $pattern = '(?<![A-Za-z0-9_-])' + [regex]::Escape($needle) + '(?![A-Za-z0-9_-])'
    if (-not [regex]::IsMatch($componentLive, $pattern)) { throw "Documentation component is missing live contract: $needle" }
  }
  foreach ($needle in @('DOCUMENTATION_OPEN_EVENT', 'OpenDocumentationDetail', 'activation', 'focus', 'takePendingDocumentation')) {
    $boundary = '(?<![A-Za-z0-9_-])' + [regex]::Escape($needle) + '(?![A-Za-z0-9_-])'
    if (-not [regex]::IsMatch($openerLive, $boundary)) { throw "Documentation opener is missing live contract: $needle" }
  }
  foreach ($needle in @('documentation-browser', 'openDocumentation', 'focus')) {
    if ($testLive.IndexOf($needle, [System.StringComparison]::Ordinal) -lt 0) { throw "Focused documentation test is missing exact interaction: $needle" }
  }
}

function Assert-CentralMounts([hashtable]$Text) {
  $shell = Remove-JavaScriptComments $Text.shell
  $nav = Remove-JavaScriptComments $Text.nav
  $palette = Remove-JavaScriptComments $Text.palette
  $router = Remove-JavaScriptComments $Text.router
  if ($shell -notmatch 'data-testid="entry-view-documentation"' -or $shell -notmatch 'DocumentationBrowserView') { return $false }
  if ($nav -notmatch 'testId="entry-nav-documentation"') { return $false }
  if ($palette -notmatch "id:\s*'go\.documentation'") { return $false }
  if ($router -notmatch "\|\s*'documentation'") { return $false }
  return $true
}

$manifestPath = Join-Path $RepoRoot 'site/assets/data/docs-manifest.json'
$bundlePath = Join-Path $RepoRoot 'design/apps/web/src/lib/docs/generated.ts'
$componentPath = Join-Path $RepoRoot 'design/apps/web/src/components/documentation/DocumentationBrowserView.tsx'
$openerPath = Join-Path $RepoRoot 'design/apps/web/src/components/documentation/open-documentation.ts'
$testPath = Join-Path $RepoRoot 'design/apps/web/tests/components/DocumentationBrowserView.test.tsx'
foreach ($path in @($manifestPath, $bundlePath, $componentPath, $openerPath, $testPath)) {
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Required documentation source is missing: $path" }
}
$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
$bundleText = [IO.File]::ReadAllText($bundlePath, [Text.UTF8Encoding]::new($false))
Assert-BundleObject (Read-BundleManifest $bundleText) $manifest
Assert-AppSource (Get-Content -Raw -LiteralPath $componentPath) (Get-Content -Raw -LiteralPath $openerPath) (Get-Content -Raw -LiteralPath $testPath)
Write-Output "PASS: app bundle exactly contains all $($manifest.articleCount) source articles, hashes, suggestions, fragments, and images."

$centralPaths = @(
  (Join-Path $RepoRoot 'design/apps/web/src/components/EntryShell.tsx'),
  (Join-Path $RepoRoot 'design/apps/web/src/components/EntryNavRail.tsx'),
  (Join-Path $RepoRoot 'design/apps/web/src/components/command-palette/commands.ts'),
  (Join-Path $RepoRoot 'design/apps/web/src/router.ts')
)
$centralAvailable = $centralPaths | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf }
if ($centralAvailable.Count -eq $centralPaths.Count) {
  $central = @{
    shell = Get-Content -Raw -LiteralPath $centralPaths[0]
    nav = Get-Content -Raw -LiteralPath $centralPaths[1]
    palette = Get-Content -Raw -LiteralPath $centralPaths[2]
    router = Get-Content -Raw -LiteralPath $centralPaths[3]
  }
  if (Assert-CentralMounts $central) { Write-Output 'PASS: C0/C12 application mount, navigation, palette, and router are live.' }
  elseif ($RequireCentralMount) { throw 'Central C0/C12 application documentation registration is not live.' }
  else { Write-Output 'PENDING: source is ready; central C0/C12 application registration remains unmounted.' }
} elseif ($RequireCentralMount) {
  throw 'Central C0/C12 application registration sources are unavailable.'
} else {
  Write-Output 'PENDING: source is ready; central C0/C12 application registration sources remain outside this lane.'
}

if ($SelfTest) {
  $mutations = [ordered]@{
    staleHash = { $copy = $manifest | ConvertTo-Json -Depth 12 | ConvertFrom-Json; $copy.articles[0].sha256 = ('0' * 64); Assert-BundleObject (Read-BundleManifest $bundleText) $copy }
    missingArticle = { $copy = $manifest | ConvertTo-Json -Depth 12 | ConvertFrom-Json; $copy.articleCount--; $copy.articles = @($copy.articles | Select-Object -Skip 1); Assert-BundleObject (Read-BundleManifest $bundleText) $copy }
    duplicateArticle = { $copy = $manifest | ConvertTo-Json -Depth 12 | ConvertFrom-Json; $copy.articleCount++; $copy.articles = @($copy.articles) + $copy.articles[0]; Assert-BundleObject (Read-BundleManifest $bundleText) $copy }
    missingSuggestion = { $copy = $manifest | ConvertTo-Json -Depth 12 | ConvertFrom-Json; $copy.articles[0].suggestedArticles = @('missing.md'); Assert-BundleObject (Read-BundleManifest $bundleText) $copy }
    missingFocus = { $component = (Get-Content -Raw -LiteralPath $componentPath).Replace('documentation-reader-title', 'documentation-reader-title-missing'); Assert-AppSource $component (Get-Content -Raw -LiteralPath $openerPath) (Get-Content -Raw -LiteralPath $testPath) }
    missingOpenerActivation = { $opener = (Get-Content -Raw -LiteralPath $openerPath).Replace('activation', 'activation-missing'); Assert-AppSource (Get-Content -Raw -LiteralPath $componentPath) $opener (Get-Content -Raw -LiteralPath $testPath) }
  }
  foreach ($entry in $mutations.GetEnumerator()) {
    $red = $false
    try { & $entry.Value } catch { $red = $true; Write-Output "PASS: $($entry.Key) red proof: $($_.Exception.Message)" }
    if (-not $red) { throw "Negative regression stayed green for $($entry.Key)." }
  }
  Assert-BundleObject (Read-BundleManifest $bundleText) $manifest
  Assert-AppSource (Get-Content -Raw -LiteralPath $componentPath) (Get-Content -Raw -LiteralPath $openerPath) (Get-Content -Raw -LiteralPath $testPath)
  Write-Output 'PASS: app documentation bundle and source seam negative regressions restored green.'
}

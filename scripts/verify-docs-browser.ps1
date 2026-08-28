[CmdletBinding()]
param(
  [string]$RepoRoot = '',
  [switch]$SelfTest
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($RepoRoot)) { $RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')) }

function Get-RelativeUnixPath([string]$Base, [string]$Path) {
  $baseUri = [Uri]((Resolve-Path $Base).Path.TrimEnd('\') + '\')
  $pathUri = [Uri]((Resolve-Path $Path).Path)
  return [Uri]::UnescapeDataString($baseUri.MakeRelativeUri($pathUri).ToString()).Replace('\', '/')
}

function Resolve-DocsRelativePath([string]$FromArticle, [string]$Target) {
  $candidate = ($Target -split '#', 2)[0].Trim().Replace('\\', '/')
  if ([string]::IsNullOrWhiteSpace($candidate) -or $candidate -match '^https?://') { return $null }
  $base = (Split-Path -Parent $FromArticle).Replace('\\', '/')
  $parts = @()
  if ($base) { $parts += $base.Split('/') }
  foreach ($part in $candidate.Split('/')) {
    if ([string]::IsNullOrWhiteSpace($part) -or $part -eq '.') { continue }
    if ($part -eq '..') {
      if ($parts.Count -eq 0) { return $null }
      if ($parts.Count -eq 1) { $parts = @() } else { $parts = @($parts[0..($parts.Count - 2)]) }
    } else { $parts += $part }
  }
  $resolved = ($parts -join '/').TrimStart('/')
  if ($resolved -notmatch '\.md$') { return $null }
  return $resolved
}

function Assert-DocsBrowserContract([hashtable]$Text, [object]$Manifest, [object[]]$Files) {
  if ($Manifest.schemaVersion -ne 1) { throw 'The documentation manifest schema is not version 1.' }
  if ($Manifest.articleCount -ne $Files.Count -or $Manifest.articles.Count -ne $Files.Count) {
    throw "The documentation manifest count is $($Manifest.articles.Count), expected $($Files.Count)."
  }
  $expected = @($Files | ForEach-Object { Get-RelativeUnixPath (Join-Path $RepoRoot 'docs') $_.FullName })
  $actual = @($Manifest.articles | ForEach-Object path)
  if ((Compare-Object ($expected | Sort-Object) ($actual | Sort-Object))) {
    throw 'The documentation manifest does not enumerate exactly the Markdown files on disk.'
  }
  $ids = @($Manifest.articles | ForEach-Object id)
  if (($ids | Sort-Object -Unique).Count -ne $Files.Count) { throw 'The documentation manifest has duplicate identifiers.' }
  foreach ($article in $Manifest.articles) {
    if ([string]::IsNullOrWhiteSpace($article.title) -or [string]::IsNullOrWhiteSpace($article.markdown)) {
      throw "The documentation article is missing a title or body: $($article.path)"
    }
    if (-not ($article.suggestedArticles -is [System.Collections.IEnumerable])) {
      throw "The documentation article is missing its suggested-article list: $($article.path)"
    }
    if (@($article.suggestedArticles).Count -lt 1) {
      throw "The documentation article has no suggested article: $($article.path)"
    }
    foreach ($suggested in @($article.suggestedArticles)) {
      if ([string]$suggested -notmatch '^[^/].*\.md$' -or [string]$suggested -match '(^|/)\.\.(\/|$)') { throw "Suggested article path is not normalized: $($article.path) -> $suggested" }
      if (-not (@($actual) -contains [string]$suggested)) { throw "Suggested article target is missing from the manifest: $($article.path) -> $suggested" }
    }
    $source = Join-Path (Join-Path $RepoRoot 'docs') $article.path.Replace('/', '\')
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Article source is missing: $($article.path)" }
    $hash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($hash -ne $article.sha256) { throw "Article hash is stale: $($article.path)" }
  }
  if ($Text.index -notmatch 'data-docs-browser(?:\s|>)') { throw 'The site does not mount the offline documentation browser.' }
  foreach ($needle in @('docs-search-input', 'docs-search-mode', 'docs-search-builder', 'docs-article-list', 'docs-reader-body')) {
    if ($Text.index -notmatch [regex]::Escape($needle)) { throw "The site is missing docs browser control $needle." }
  }
  if ($Text.main -notmatch "docs-browser\.js") { throw 'main.js does not import docs-browser.js.' }
  if ($Text.main -notmatch 'initDocsBrowser') { throw 'main.js does not initialise the documentation browser.' }
  if ($Text.main -notmatch 'Ctrl\+Shift\+F' -and $Text.ui -notmatch 'Ctrl\+Shift\+F') { throw 'The site does not document or implement Ctrl+Shift+F for its command palette.' }
  if ($Text.ui -match 'metaKey.*key.*k') { throw 'The site retains a competing Ctrl+K command-palette shortcut.' }
  if ($Text.i18n -notmatch "DEFAULTS\s*=\s*\{\s*mode:\s*'bilingual',\s*funnyEn:\s*5,\s*funnyYue:\s*5\s*\}") { throw 'The site funny-level defaults are not 5/5.' }
  foreach ($needle in @('data-front-screen-provenance', 'data-front-version', 'data-front-updated-at', 'data-front-source-commit')) {
    if ($Text.index -notmatch [regex]::Escape($needle)) { throw "The site initial provenance surface is missing $needle." }
  }
  foreach ($needle in @('--md-tabs-tab-h:48px', 'height:48px; min-width:48px', 'overflow-x:auto')) {
    if ($Text.tabs -notmatch [regex]::Escape($needle)) { throw "The site tab contract is missing $needle." }
  }
  foreach ($needle in @('markdownToHtml', 'escapeHtml', 'resolveInternalTarget', 'attachRegexBuilder', 'data-doc-link', 'registerDestination', 'goToTab')) {
    if ($Text.browser -notmatch [regex]::Escape($needle)) { throw "docs-browser.js is missing $needle." }
  }
  if ($Text.social -notmatch 'social-preview\.png') { throw 'The social-preview generator is missing.' }
}

$docsRoot = Join-Path $RepoRoot 'docs'
$files = @(Get-ChildItem -LiteralPath $docsRoot -Recurse -File -Filter '*.md' |
  Sort-Object { Get-RelativeUnixPath $docsRoot $_.FullName })
$manifestPath = Join-Path $RepoRoot 'site/assets/data/docs-manifest.json'
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { throw "Manifest is missing: $manifestPath" }
$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
$text = @{
  index = Get-Content -Raw -LiteralPath (Join-Path $RepoRoot 'site/index.html')
  main = Get-Content -Raw -LiteralPath (Join-Path $RepoRoot 'site/assets/js/main.js')
  browser = Get-Content -Raw -LiteralPath (Join-Path $RepoRoot 'site/assets/js/docs-browser.js')
  ui = Get-Content -Raw -LiteralPath (Join-Path $RepoRoot 'site/assets/js/ui.js')
  tabs = Get-Content -Raw -LiteralPath (Join-Path $RepoRoot 'site/assets/js/tabs.js')
  i18n = Get-Content -Raw -LiteralPath (Join-Path $RepoRoot 'site/assets/js/i18n.js')
  social = Get-Content -Raw -LiteralPath (Join-Path $RepoRoot 'scripts/generate-social-preview.ps1')
}

Assert-DocsBrowserContract $text $manifest $files
Write-Output "PASS: offline documentation browser enumerates $($files.Count) articles with suggested reading."

if ($SelfTest) {
  $broken = @{
    index = $text.index.Replace('data-docs-browser', 'data-docs-browser-missing')
    main = $text.main
    browser = $text.browser
    social = $text.social
  }
  $red = $false
  try {
    Assert-DocsBrowserContract $broken $manifest $files
  } catch {
    $red = $true
  }
  if (-not $red) { throw 'Negative regression stayed green after removing the browser mount.' }
  Assert-DocsBrowserContract $text $manifest $files
  Write-Output 'PASS: docs-browser negative regression turned red, then green after restoration.'
}

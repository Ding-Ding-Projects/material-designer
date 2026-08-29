[CmdletBinding()]
param(
  [string]$RepoRoot = '',
  [string]$ManifestPath = '',
  [switch]$SelfTest,
  [switch]$RequireCentralMount
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
  $RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
}

function Read-Utf8Text([string]$Path) {
  return [IO.File]::ReadAllText($Path, [Text.UTF8Encoding]::new($false))
}

function Get-RelativeUnixPath([string]$Base, [string]$Path) {
  $baseUri = [Uri]((Resolve-Path -LiteralPath $Base).Path.TrimEnd('\') + '\')
  $pathUri = [Uri]((Resolve-Path -LiteralPath $Path).Path)
  return [Uri]::UnescapeDataString($baseUri.MakeRelativeUri($pathUri).ToString()).Replace('\', '/')
}

function Get-HeadingSlug([string]$Value) {
  $slug = $Value.ToLowerInvariant() -replace '[^a-z0-9\s-]', ''
  return (($slug.Trim() -replace '\s+', '-') -replace '-+', '-').Trim('-')
}

function Get-HeadingFragments([string]$Markdown) {
  $seen = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
  $result = [System.Collections.Generic.List[string]]::new()
  foreach ($line in ($Markdown -split [char]10)) {
    if ($line -notmatch '^#{1,6}\s+(.+?)\s*#*\s*$') { continue }
    $base = Get-HeadingSlug $Matches[1]
    if ([string]::IsNullOrWhiteSpace($base)) { continue }
    $candidate = $base
    $suffix = 2
    while (-not $seen.Add($candidate)) {
      $candidate = "$base-$suffix"
      $suffix++
    }
    $result.Add($candidate)
  }
  return @($result)
}

function Resolve-DocsRelativePath([string]$FromArticle, [string]$Target) {
  $raw = ($Target -split '#', 2)[0].Trim().Replace('\', '/')
  $invalid = [string]::IsNullOrWhiteSpace($raw) -or $raw.StartsWith('http:', [System.StringComparison]::OrdinalIgnoreCase) -or $raw.StartsWith('https:', [System.StringComparison]::OrdinalIgnoreCase) -or $raw.StartsWith('//')
  if ($invalid) { return $null }
  $parts = (Split-Path -Parent $FromArticle).Replace('\', '/').Split('/')
  if ($parts.Count -eq 1 -and [string]::IsNullOrWhiteSpace($parts[0])) { $parts = @() }
  foreach ($part in $raw.Split('/')) {
    if ([string]::IsNullOrWhiteSpace($part) -or $part -eq '.') { continue }
    if ($part -eq '..') {
      if ($parts.Count -eq 0) { return $null }
      if ($parts.Count -eq 1) { $parts = @() } else { $parts = @($parts[0..($parts.Count - 2)]) }
      continue
    }
    if ($part -match '[\x00-\x1f]') { return $null }
    $parts += $part
  }
  $resolved = ($parts -join '/').TrimStart('/')
  if (-not $resolved.EndsWith('.md', [System.StringComparison]::OrdinalIgnoreCase)) { return $null }
  return $resolved
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

function Remove-HtmlComments([string]$Source) {
  return [regex]::Replace($Source, '<!--[\s\S]*?-->', '')
}

function Assert-ManifestContract([object]$Manifest, [System.IO.FileInfo[]]$Files, [string]$DocsRoot, [string]$RepoRoot) {
  if ($Manifest.schemaVersion -ne 1 -or $Manifest.source -ne 'docs/**/*.md' -or [string]$Manifest.generation -notmatch '^[0-9a-f]{64}$') {
    throw 'Manifest schema/source is not supported.'
  }
  if ($Manifest.articleCount -ne $Files.Count -or @($Manifest.articles).Count -ne $Files.Count) {
    throw "Manifest article count is $($Manifest.articleCount), expected $($Files.Count)."
  }
  $expectedPaths = @($Files | ForEach-Object { Get-RelativeUnixPath $DocsRoot $_.FullName })
  $actualPaths = @($Manifest.articles | ForEach-Object path)
  $pathDiff = Compare-Object ($expectedPaths | Sort-Object) ($actualPaths | Sort-Object)
  if ($pathDiff) { throw 'Manifest does not enumerate the exact Markdown file set.' }
  $seenIds = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
  $seenPaths = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
  $pathSet = [System.Collections.Generic.HashSet[string]]::new([string[]]$actualPaths, [System.StringComparer]::Ordinal)
  foreach ($article in $Manifest.articles) {
    if (-not $seenIds.Add([string]$article.id)) { throw "Manifest repeats article id: $($article.id)" }
    if (-not $seenPaths.Add([string]$article.path)) { throw "Manifest repeats article path: $($article.path)" }
    if ([string]$article.id -cne ([string]$article.path).ToLowerInvariant()) { throw "Manifest article id is unstable: $($article.path)" }
    if ([string]$article.sourceUrl -notmatch '^https://github\.com/Ding-Ding-Projects/material-designer/blob/main/docs/[^?#]+\.md$') {
      throw "Manifest source URL is not the allowed HTTPS forge URL: $($article.path)"
    }
    $expectedSourceUrl = 'https://github.com/Ding-Ding-Projects/material-designer/blob/main/docs/' + [string]$article.path
    if ([string]$article.sourceUrl -cne $expectedSourceUrl) { throw "Manifest source URL does not match its article path: $($article.path)" }
    if ([string]::IsNullOrWhiteSpace([string]$article.title) -or [string]::IsNullOrWhiteSpace([string]$article.markdown)) {
      throw "Manifest article has no title or body: $($article.path)"
    }
    $sourcePath = Join-Path $DocsRoot ([string]$article.path).Replace('/', '\')
    if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) { throw "Manifest article source is missing: $($article.path)" }
    $hash = (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ([string]$article.sha256 -cne $hash) { throw "Manifest source hash is stale: $($article.path)" }
    $expectedFragments = @(Get-HeadingFragments ([IO.File]::ReadAllText($sourcePath, [Text.UTF8Encoding]::new($false)).Replace(([char]13).ToString(), '')))
    $actualFragments = @($article.fragments)
    if (($actualFragments -join [char]0) -cne ($expectedFragments -join [char]0)) { throw "Manifest fragments are stale or non-deterministic: $($article.path)" }
    if ($actualFragments.Count -ne (@($actualFragments | Select-Object -Unique).Count)) { throw "Manifest fragments repeat: $($article.path)" }
    if (@($article.suggestedArticles).Count -lt 1) { throw "Manifest suggestions are missing: $($article.path)" }
    $suggestedSet = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
    foreach ($suggested in @($article.suggestedArticles)) {
      if (-not $pathSet.Contains([string]$suggested) -or [string]$suggested -match '(^|/)\.\.(\/|$)' -or -not $suggestedSet.Add([string]$suggested)) {
        throw "Manifest suggestion is missing, unsafe, or duplicated: $($article.path) -> $suggested"
      }
    }
    $imageSet = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
    foreach ($image in @($article.images)) {
      if (-not $image -or [string]$image.path -notmatch '^assets/[^/]+/[^/]+$' -or [string]$image.path -match '(^|/)\.\.(\/|$)' -or [string]$image.source -match '^(?:[a-z][a-z\d+.-]*:|//|/)' -or -not [regex]::IsMatch([string]$image.sha256, '^[0-9a-f]{64}$') -or -not $imageSet.Add([string]$image.path)) {
        throw "Manifest image mapping is invalid: $($article.path)"
      }
      $imagePath = Join-Path $RepoRoot ([string]$image.path).Replace('/', '\')
      if (-not (Test-Path -LiteralPath $imagePath -PathType Leaf)) { throw "Manifest image asset is missing: $($image.path)" }
      if ((Get-FileHash -LiteralPath $imagePath -Algorithm SHA256).Hash.ToLowerInvariant() -cne [string]$image.sha256) { throw "Manifest image hash is stale: $($image.path)" }
      if (-not ([string]$article.markdown).Contains('](' + [string]$image.source + ')')) { throw "Manifest image mapping is unused: $($article.path) -> $($image.source)" }
    }
  }
  foreach ($article in $Manifest.articles) {
    foreach ($link in [regex]::Matches([string]$article.markdown, '(?<!\!)\[[^\]]+\]\(([^)\s]+)\)')) {
      $rawTarget = [string]$link.Groups[1].Value
      $hash = ''
      if ($rawTarget.Contains('#')) { $parts = $rawTarget.Split('#', 2); $rawTarget = $parts[0]; $hash = Get-HeadingSlug $parts[1] }
      $resolved = if ([string]::IsNullOrWhiteSpace($rawTarget)) { [string]$article.path } else { Resolve-DocsRelativePath $article.path $rawTarget }
      if (-not $resolved) { continue }
      if (-not $pathSet.Contains($resolved)) { throw "Manifest internal link target is missing: $($article.path) -> $resolved" }
      if ($hash) {
        $targetArticle = @($Manifest.articles | Where-Object { $_.path -eq $resolved })[0]
        if (-not $targetArticle -or -not @($targetArticle.fragments).Contains($hash)) { throw "Manifest fragment target is missing: $($article.path) -> $rawTarget#$hash" }
      }
    }
  }
}

function Assert-ReaderContract([string]$Reader) {
  $live = Remove-JavaScriptComments $Reader
  foreach ($needle in @('export function initDocsBrowser', 'escapeHtml', 'safeExternalUrl', 'SAFE_EXTERNAL_HOSTS', 'safeLocalImageUrl', 'mapping.path', 'resolveInternalTarget', 'resolveArticle', 'targetArticle', 'targetFragment', 'fragmentsFromMarkdown', 'headingSlug', 'markdownToHtml', 'attachRegexBuilder', 'data-doc-link', 'article.fragments', 'article.images', 'value.generation', 'docs-reader-title', 'docs-reader-body')) {
    $boundary = '(?<![A-Za-z0-9_-])' + [regex]::Escape($needle) + '(?![A-Za-z0-9_-])'
    if (-not [regex]::IsMatch($live, $boundary)) { throw "Reader is missing live contract: $needle" }
  }
  $internalIndex = $live.IndexOf('const internal = resolveInternalTarget', [System.StringComparison]::Ordinal)
  $externalIndex = $live.IndexOf('const external = safeExternalUrl(target)', $internalIndex, [System.StringComparison]::Ordinal)
  if ($internalIndex -lt 0 -or $externalIndex -lt 0 -or $internalIndex -ge $externalIndex) { throw 'Reader must resolve internal links before HTTPS filtering.' }
  if ($live -match 'innerHTML\s*=\s*article\.markdown') { throw 'Reader writes raw article Markdown into innerHTML.' }
  if ($live.IndexOf('while (seen.has(candidate))', [System.StringComparison]::Ordinal) -lt 0) { throw 'Reader heading IDs are not deterministically deduplicated.' }
}

function Assert-LiveCentralSurface([hashtable]$Text) {
  $index = Remove-HtmlComments $Text.index
  $main = Remove-JavaScriptComments $Text.main
  $browser = Remove-JavaScriptComments $Text.browser
  $requiredIds = @('docs-search-input', 'docs-search-mode', 'docs-search-builder', 'docs-browser-status', 'docs-article-list', 'docs-reader-article', 'docs-reader-title', 'docs-reader-meta', 'docs-reader-body', 'docs-reader-source')
  $mountMatches = [regex]::Matches($index, '<[^>]+data-docs-browser(?:\s|=|>)')
  if ($mountMatches.Count -eq 0) { return $false }
  if ($mountMatches.Count -ne 1) { throw 'Documentation site has duplicate live documentation mounts.' }
  foreach ($id in $requiredIds) {
    $count = ([regex]::Matches($index, 'id="' + [regex]::Escape($id) + '"')).Count
    if ($count -ne 1) { throw "Documentation-site control $id must occur exactly once in live markup." }
    if ($browser.IndexOf($id, [System.StringComparison]::Ordinal) -lt 0) { throw "Reader does not consume exact documentation control $id." }
  }
  if ($main -notmatch "(?m)^\s*import\s+\{\s*initDocsBrowser\s*\}\s+from\s+'\./docs-browser\.js';") { throw 'Documentation-site wiring does not import the live reader.' }
  if ($main -notmatch 'initDocsBrowser\s*\(\s*\{\s*i18n\s*,\s*regex\s*,\s*tabs\s*,\s*ui\s*\}\s*\)') { throw 'Documentation-site wiring does not initialize the live reader with its localized search, tab, and palette boundaries.' }
  return $true
}

$docsRoot = Join-Path $RepoRoot 'docs'
$files = @(Get-ChildItem -LiteralPath $docsRoot -Recurse -File -Filter '*.md' | Sort-Object { Get-RelativeUnixPath $docsRoot $_.FullName })
$manifestPath = if ([string]::IsNullOrWhiteSpace($ManifestPath)) { Join-Path $RepoRoot 'site/assets/data/docs-manifest.json' } else { $ManifestPath }
$readerPath = Join-Path $RepoRoot 'site/assets/js/docs-browser.js'
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { throw "Manifest is missing: $manifestPath" }
if (-not (Test-Path -LiteralPath $readerPath -PathType Leaf)) { throw "Reader is missing: $readerPath" }
$manifest = Read-Utf8Text $manifestPath | ConvertFrom-Json
Assert-ManifestContract $manifest $files $docsRoot $RepoRoot
Assert-ReaderContract (Read-Utf8Text $readerPath)

$text = @{
  index = Read-Utf8Text (Join-Path $RepoRoot 'site/index.html')
  main = Read-Utf8Text (Join-Path $RepoRoot 'site/assets/js/main.js')
  browser = Read-Utf8Text $readerPath
}
$centralMounted = Assert-LiveCentralSurface $text
if (-not $centralMounted) {
  if ($RequireCentralMount) { throw 'Central C0/C12 documentation mount is not registered.' }
  Write-Output 'PENDING: source is ready; central C0/C12 documentation mount remains unregistered.'
} else {
  Write-Output 'PASS: live documentation mount, controls, import, and initialization are registered.'
}
Write-Output "PASS: validated $($files.Count) documentation articles, hashes, suggestions, fragments, source URLs, and indexed images."

if ($SelfTest) {
  $mutations = [ordered]@{
    staleHash = { $copy = $manifest | ConvertTo-Json -Depth 12 | ConvertFrom-Json; $copy.articles[0].sha256 = ('0' * 64); Assert-ManifestContract $copy $files $docsRoot $RepoRoot }
    duplicateArticle = { $copy = $manifest | ConvertTo-Json -Depth 12 | ConvertFrom-Json; $copy.articles[1].id = $copy.articles[0].id; Assert-ManifestContract $copy $files $docsRoot $RepoRoot }
    missingArticle = { $copy = $manifest | ConvertTo-Json -Depth 12 | ConvertFrom-Json; $replacement = $copy.articles[1]; $copy.articles = @($copy.articles | Select-Object -Skip 1) + $replacement; Assert-ManifestContract $copy $files $docsRoot $RepoRoot }
    missingSuggestion = { $copy = $manifest | ConvertTo-Json -Depth 12 | ConvertFrom-Json; $copy.articles[0].suggestedArticles = @('missing.md'); Assert-ManifestContract $copy $files $docsRoot $RepoRoot }
    missingLink = { $copy = $manifest | ConvertTo-Json -Depth 12 | ConvertFrom-Json; $copy.articles[0].markdown = [regex]::Replace([string]$copy.articles[0].markdown, '(?<!\!)\]\((?!https?://)([^)\s]+)\)', '](missing-link.md)', 1); Assert-ManifestContract $copy $files $docsRoot $RepoRoot }
    missingFragment = { $copy = $manifest | ConvertTo-Json -Depth 12 | ConvertFrom-Json; $copy.articles[0].fragments = @('missing-fragment'); Assert-ManifestContract $copy $files $docsRoot $RepoRoot }
    badSourceUrl = { $copy = $manifest | ConvertTo-Json -Depth 12 | ConvertFrom-Json; $copy.articles[0].sourceUrl = 'http://example.invalid/docs/README.md'; Assert-ManifestContract $copy $files $docsRoot $RepoRoot }
    badImage = { $copy = $manifest | ConvertTo-Json -Depth 12 | ConvertFrom-Json; $copy.articles[0].images = @([pscustomobject]@{ source = '../outside.png'; path = '../outside.png'; sha256 = ('0' * 64) }); Assert-ManifestContract $copy $files $docsRoot $RepoRoot }
    missingMount = { $fixture = @{ index = '<section data-docs-browser><input id="docs-search-input"><button id="docs-search-mode"></button><button id="docs-search-builder"></button><div id="docs-browser-status"></div><ul id="docs-article-list"></ul><article id="docs-reader-article"><h1 id="docs-reader-title"></h1><p id="docs-reader-meta"></p><div id="docs-reader-body"></div><a id="docs-reader-source"></a></article></section>'; main = "import { initDocsBrowser } from './docs-browser.js'; initDocsBrowser({ i18n, regex, tabs, ui });"; browser = Read-Utf8Text $readerPath }; $fixture.index = $fixture.index.Replace('data-docs-browser', 'data-docs-browser-missing'); if (-not (Assert-LiveCentralSurface $fixture)) { throw 'Missing mount was detected.' } }
    missingInitializerInputs = { $fixture = @{ index = $text.index; main = $text.main.Replace('initDocsBrowser({ i18n, regex, tabs, ui })', 'initDocsBrowser()'); browser = $text.browser }; [void](Assert-LiveCentralSurface $fixture) }
    missingReaderFocus = { $reader = (Read-Utf8Text $readerPath).Replace('docs-reader-title', 'docs-reader-title-missing'); Assert-ReaderContract $reader }
  }
  foreach ($entry in $mutations.GetEnumerator()) {
    $red = $false
    try { & $entry.Value } catch { $red = $true; Write-Output "PASS: $($entry.Key) red proof: $($_.Exception.Message)" }
    if (-not $red) { throw "Negative regression stayed green for $($entry.Key)." }
  }
  Assert-ManifestContract $manifest $files $docsRoot $RepoRoot
  Assert-ReaderContract (Read-Utf8Text $readerPath)
  Write-Output 'PASS: documentation manifest and reader negative regressions restored green.'
}

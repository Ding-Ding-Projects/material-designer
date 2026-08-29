[CmdletBinding()]
param(
  [string]$RepoRoot = '',
  [string]$OutputPath = '',
  [switch]$SelfTest
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
  $RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
}
if ([string]::IsNullOrWhiteSpace($OutputPath)) {
  $OutputPath = Join-Path $RepoRoot 'site/assets/data/docs-manifest.json'
}

function Get-RelativeUnixPath([string]$Base, [string]$Path) {
  $baseUri = [Uri]((Resolve-Path -LiteralPath $Base).Path.TrimEnd('\') + '\')
  $pathUri = [Uri]((Resolve-Path -LiteralPath $Path).Path)
  return [Uri]::UnescapeDataString($baseUri.MakeRelativeUri($pathUri).ToString()).Replace('\', '/')
}

function Resolve-DocsRelativePath([string]$FromArticle, [string]$Target) {
  $raw = ($Target -split '#', 2)[0].Trim().Replace('\', '/')
  $invalid = [string]::IsNullOrWhiteSpace($raw) -or $raw.StartsWith('http:', [System.StringComparison]::OrdinalIgnoreCase) -or $raw.StartsWith('https:', [System.StringComparison]::OrdinalIgnoreCase) -or $raw.StartsWith('//')
  if ($invalid) {
    return $null
  }
  $base = (Split-Path -Parent $FromArticle).Replace('\', '/')
  $parts = @()
  if ($base) { $parts += $base.Split('/') }
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

function Resolve-DocsAssetPath([string]$FromArticle, [string]$Target) {
  $raw = $Target.Trim().Replace('\', '/')
  $base = (Split-Path -Parent $FromArticle).Replace('\', '/')
  $parts = @()
  $escapedDocsRoot = $false
  if ($base) { $parts += $base.Split('/') }
  foreach ($part in $raw.Split('/')) {
    if ([string]::IsNullOrWhiteSpace($part) -or $part -eq '.') { continue }
    if ($part -eq '..') {
      if ($parts.Count -eq 0) {
        if ($escapedDocsRoot) { return $null }
        $escapedDocsRoot = $true
        continue
      }
      if ($parts.Count -eq 1) { $parts = @() } else { $parts = @($parts[0..($parts.Count - 2)]) }
      continue
    }
    if ($part -match '[\x00-\x1f]') { return $null }
    $parts += $part
  }
  $resolved = ($parts -join '/').TrimStart('/')
  if (-not $resolved -or $resolved.Contains('..')) { return $null }
  return $resolved
}

function Get-ImageMappings([string]$RelativeArticle, [string]$Markdown, [string]$Root) {
  $mappings = [System.Collections.Generic.List[object]]::new()
  $seen = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
  foreach ($match in [regex]::Matches($Markdown, '!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)')) {
    $source = [string]$match.Groups[1].Value
    if ($source -match '^(?:[a-z][a-z\d+.-]*:|//|/)' -or $source.Contains([char]0)) { continue }
    $resolved = Resolve-DocsAssetPath $RelativeArticle $source
    if (-not $resolved -or -not $seen.Add($resolved)) { continue }
    if (-not $resolved.StartsWith('assets/', [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "Documentation image escapes the approved assets tree: $RelativeArticle -> $source"
    }
    $sourcePath = Join-Path $Root ($resolved.Replace('/', '\'))
    if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
      throw "Documentation image source is missing: $RelativeArticle -> $resolved"
    }
    if ((Get-Item -LiteralPath $sourcePath).Length -gt 8MB) {
      throw "Documentation image exceeds the 8 MiB bound: $resolved"
    }
    $mappings.Add([ordered]@{
      source = $source
      path = $resolved
      sha256 = (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash.ToLowerInvariant()
    })
    if ($mappings.Count -gt 32) { throw "Documentation image mapping exceeds 32 entries: $RelativeArticle" }
  }
  return @($mappings)
}

function Get-SuggestedPaths([string]$RelativeArticle, [string]$Markdown, [object[]]$Files, [string]$DocsRoot) {
  $suggested = [System.Collections.Generic.List[string]]::new()
  $inSuggested = $false
  foreach ($line in ($Markdown -split [char]10)) {
    if ($line -match '^##\s+Suggested articles\s*$') { $inSuggested = $true; continue }
    if ($inSuggested -and $line -match '^#{1,2}\s+') { break }
    if (-not $inSuggested -or $line -notmatch '^\s*-\s+\[[^\]]+\]\(([^)]+)\)') { continue }
    $target = Resolve-DocsRelativePath $RelativeArticle $Matches[1]
    if ($target -and -not $suggested.Contains($target)) { $suggested.Add($target) }
  }
  if ($suggested.Count -eq 0) {
    $category = if ($RelativeArticle.Contains('/')) { $RelativeArticle.Split('/')[0] } else { 'root' }
    foreach ($file in $Files) {
      $path = Get-RelativeUnixPath $DocsRoot $file.FullName
      $pathCategory = if ($path.Contains('/')) { $path.Split('/')[0] } else { 'root' }
      if ($path -ne $RelativeArticle -and $pathCategory -eq $category) {
        $suggested.Add($path)
        break
      }
    }
  }
  if ($suggested.Count -eq 0) {
    foreach ($file in $Files) {
      $path = Get-RelativeUnixPath $DocsRoot $file.FullName
      if ($path -ne $RelativeArticle) { $suggested.Add($path); break }
    }
  }
  return @($suggested | Select-Object -First 3)
}

function Get-Article([System.IO.FileInfo]$File, [string]$DocsRoot, [string]$RepoRoot, [object[]]$Files) {
  $relative = Get-RelativeUnixPath $DocsRoot $File.FullName
  $markdown = [System.IO.File]::ReadAllText($File.FullName, [System.Text.UTF8Encoding]::new($false))
  $lineFeed = ([char]10).ToString()
  $markdown = $markdown.Replace([string]::Concat([char]13, [char]10), $lineFeed).Replace(([char]13).ToString(), $lineFeed)
  $title = $null
  foreach ($line in ($markdown -split [char]10)) {
    if ($line -match '^#\s+(.+?)\s*$') { $title = $Matches[1].Trim(); break }
  }
  if ([string]::IsNullOrWhiteSpace($title)) { $title = [System.IO.Path]::GetFileNameWithoutExtension($File.Name) }
  $suggested = Get-SuggestedPaths $relative $markdown $Files $DocsRoot
  if ($suggested.Count -eq 0) { throw "Documentation article has no suggested article: $relative" }
  [ordered]@{
    id = $relative.ToLowerInvariant()
    path = $relative
    category = if ($relative.Contains('/')) { $relative.Split('/')[0] } else { 'root' }
    title = $title
    kind = if ($File.Name -eq 'README.md') { 'index' } else { 'article' }
    sourceUrl = "https://github.com/Ding-Ding-Projects/material-designer/blob/main/docs/$relative"
    sha256 = (Get-FileHash -LiteralPath $File.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    suggestedArticles = @($suggested)
    fragments = @(Get-HeadingFragments $markdown)
    images = @(Get-ImageMappings $relative $markdown $RepoRoot)
    markdown = $markdown
  }
}

function Assert-ManifestContent([object]$Manifest, [object[]]$Files, [string]$DocsRoot, [string]$RepoRoot) {
  if ($Manifest.schemaVersion -ne 1 -or $Manifest.source -ne 'docs/**/*.md') {
    throw 'Documentation manifest schema or source is unsupported.'
  }
  if ($Manifest.articleCount -ne $Files.Count -or @($Manifest.articles).Count -ne $Files.Count) {
    throw "Documentation manifest count is $($Manifest.articleCount), expected $($Files.Count)."
  }
  $expected = @($Files | ForEach-Object { Get-RelativeUnixPath $DocsRoot $_.FullName })
  $actual = @($Manifest.articles | ForEach-Object path)
  if ((Compare-Object ($expected | Sort-Object) ($actual | Sort-Object))) {
    throw 'Documentation manifest does not enumerate the exact Markdown file set.'
  }
  $ids = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
  $paths = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
  foreach ($path in $actual) { [void]$paths.Add([string]$path) }
  $seenPaths = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
  foreach ($article in $Manifest.articles) {
    if (-not $ids.Add([string]$article.id)) { throw "Documentation manifest repeats id: $($article.id)" }
    if (-not $seenPaths.Add([string]$article.path)) { throw "Documentation manifest repeats path: $($article.path)" }
    if ([string]$article.id -ne ([string]$article.path).ToLowerInvariant()) { throw "Documentation article id is unstable: $($article.path)" }
    if ([string]$article.sourceUrl -notmatch '^https://github\.com/Ding-Ding-Projects/material-designer/blob/main/docs/.+\.md$') {
      throw "Documentation source URL is not an allowed HTTPS forge URL: $($article.path)"
    }
    if ([string]$article.path -match '(^|/)\.\.(\/|$)' -or [string]$article.path -match '\\') {
      throw "Documentation article path is unsafe: $($article.path)"
    }
    if ([string]::IsNullOrWhiteSpace([string]$article.title) -or [string]::IsNullOrWhiteSpace([string]$article.markdown)) {
      throw "Documentation article has no title or body: $($article.path)"
    }
    if (@($article.suggestedArticles).Count -lt 1) { throw "Documentation article has no suggestions: $($article.path)" }
    foreach ($suggested in @($article.suggestedArticles)) {
      if (-not $paths.Contains([string]$suggested) -or [string]$suggested -match '(^|/)\.\.(\/|$)') {
        throw "Suggested article target is missing or unsafe: $($article.path) -> $suggested"
      }
    }
    $source = Join-Path $DocsRoot ([string]$article.path).Replace('/', '\')
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Article source is missing: $($article.path)" }
    $hash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($hash -ne [string]$article.sha256) { throw "Article source hash is stale: $($article.path)" }
    $fragments = @($article.fragments)
    if ($fragments.Count -ne (@($fragments | Select-Object -Unique).Count)) { throw "Article fragments are not deduplicated: $($article.path)" }
    foreach ($image in @($article.images)) {
      if ([string]$image.path -notmatch '^assets/[^/]+/.+') { throw "Documentation image mapping is outside the bounded assets tree: $($article.path)" }
      $imagePath = Join-Path $RepoRoot ([string]$image.path).Replace('/', '\')
      if (-not (Test-Path -LiteralPath $imagePath -PathType Leaf)) { throw "Indexed documentation image is missing: $($image.path)" }
      if ((Get-FileHash -LiteralPath $imagePath -Algorithm SHA256).Hash.ToLowerInvariant() -ne [string]$image.sha256) {
        throw "Indexed documentation image hash is stale: $($image.path)"
      }
    }
  }
}

$docsRoot = Join-Path $RepoRoot 'docs'
if (-not (Test-Path -LiteralPath $docsRoot -PathType Container)) { throw "Documentation root is missing: $docsRoot" }
$files = @(Get-ChildItem -LiteralPath $docsRoot -Recurse -File -Filter '*.md' | Sort-Object { Get-RelativeUnixPath $docsRoot $_.FullName })
if ($files.Count -eq 0) { throw 'No Markdown articles were found under docs.' }
$articles = @($files | ForEach-Object { Get-Article $_ $docsRoot $RepoRoot $files })
$manifest = [ordered]@{
  schemaVersion = 1
  source = 'docs/**/*.md'
  articleCount = $articles.Count
  articles = $articles
}

$allPaths = [System.Collections.Generic.HashSet[string]]::new([string[]]($articles | ForEach-Object path), [System.StringComparer]::Ordinal)
$fragmentByPath = @{}
foreach ($candidate in $articles) { $fragmentByPath[[string]$candidate.path] = @($candidate.fragments) }
foreach ($article in $articles) {
  foreach ($link in [regex]::Matches([string]$article.markdown, '(?<!\!)\[[^\]]+\]\(([^)\s]+)\)')) {
    $target = [string]$link.Groups[1].Value
    $hash = ''
    if ($target.Contains('#')) { $pieces = $target.Split('#', 2); $target = $pieces[0]; $hash = Get-HeadingSlug $pieces[1] }
    $resolved = if ([string]::IsNullOrWhiteSpace($target)) { [string]$article.path } else { Resolve-DocsRelativePath $article.path $target }
    if ($resolved -and -not $allPaths.Contains($resolved)) {
      throw "Documentation internal link target is missing: $($article.path) -> $resolved"
    }
    if ($resolved -and $allPaths.Contains($resolved) -and $hash -and -not @($fragmentByPath[$resolved]).Contains($hash)) {
      throw "Documentation fragment target is missing: $($article.path) -> $target#$hash"
    }
  }
}

$jsonLines = @($manifest | ConvertTo-Json -Depth 12)
$json = [string]::Join([Environment]::NewLine, $jsonLines)
$parent = Split-Path -Parent $OutputPath
if (-not (Test-Path -LiteralPath $parent -PathType Container)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
[System.IO.File]::WriteAllText($OutputPath, $json + [char]10, [System.Text.UTF8Encoding]::new($false))
$roundTrip = Get-Content -Raw -LiteralPath $OutputPath | ConvertFrom-Json
Assert-ManifestContent $roundTrip $files $docsRoot $RepoRoot
if ($roundTrip.schemaVersion -ne $manifest.schemaVersion -or $roundTrip.source -ne $manifest.source -or $roundTrip.articleCount -ne $manifest.articleCount) {
  throw 'Generated documentation manifest did not preserve the exact top-level object.'
}
for ($index = 0; $index -lt $manifest.articleCount; $index++) {
  $expectedArticle = $manifest.articles[$index]
  $actualArticle = $roundTrip.articles[$index]
  foreach ($field in @('id', 'path', 'category', 'title', 'kind', 'sourceUrl', 'sha256')) {
    if ([string]$expectedArticle.$field -cne [string]$actualArticle.$field) {
      throw "Generated documentation manifest changed article field $field at index $index."
    }
  }
  $expectedMarkdownHash = (Get-FileHash -LiteralPath (Join-Path $DocsRoot ([string]$expectedArticle.path).Replace('/', '\')) -Algorithm SHA256).Hash.ToLowerInvariant()
  if ([string]$actualArticle.sha256 -cne $expectedMarkdownHash) {
    throw "Generated documentation manifest changed article content hash at index $index."
  }
  $listsDiffer = (@($expectedArticle.suggestedArticles) -join [char]0) -cne (@($actualArticle.suggestedArticles) -join [char]0) -or (@($expectedArticle.fragments) -join [char]0) -cne (@($actualArticle.fragments) -join [char]0)
  if ($listsDiffer) {
    throw "Generated documentation manifest changed article lists at index $index."
  }
}
Write-Output "PASS: generated and revalidated $($files.Count) documentation articles at $OutputPath"

if ($SelfTest) {
  $broken = $roundTrip | ConvertTo-Json -Depth 12 | ConvertFrom-Json
  $broken.articles[0].sha256 = ('0' * 64)
  $red = $false
  try { Assert-ManifestContent $broken $files $docsRoot $RepoRoot } catch { $red = $true; Write-Output "PASS: stale-hash negative proof: $($_.Exception.Message)" }
  if (-not $red) { throw 'Negative regression stayed green after replacing one source hash.' }
  Assert-ManifestContent $roundTrip $files $docsRoot $RepoRoot
  Write-Output 'PASS: generated manifest restored after red-then-green proof.'
}

[CmdletBinding()]
param(
  [string]$RepoRoot = '',
  [string]$OutputPath = ''
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
  if ([string]::IsNullOrWhiteSpace($candidate) -or $candidate.StartsWith('http:', [System.StringComparison]::OrdinalIgnoreCase) -or $candidate.StartsWith('https:', [System.StringComparison]::OrdinalIgnoreCase)) { return $null }
  $base = (Split-Path -Parent $FromArticle).Replace('\\', '/')
  $parts = @()
  if ($base) { $parts += $base.Split('/') }
  foreach ($part in $candidate.Split('/')) {
    if ([string]::IsNullOrWhiteSpace($part) -or $part -eq '.') { continue }
    if ($part -eq '..') {
      if ($parts.Count -eq 0) { return $null }
      if ($parts.Count -eq 1) { $parts = @() } else { $parts = @($parts[0..($parts.Count - 2)]) }
      continue
    }
    $parts += $part
  }
  $resolved = ($parts -join '/').TrimStart('/')
  if (-not $resolved.EndsWith('.md', [System.StringComparison]::OrdinalIgnoreCase)) { return $null }
  return $resolved
}

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
  $OutputPath = Join-Path $RepoRoot 'site/assets/data/docs-manifest.json'
}

$docsRoot = Join-Path $RepoRoot 'docs'
if (-not (Test-Path -LiteralPath $docsRoot -PathType Container)) {
  throw "Documentation root is missing: $docsRoot"
}

$files = @(Get-ChildItem -LiteralPath $docsRoot -Recurse -File -Filter '*.md' |
  Sort-Object { Get-RelativeUnixPath $docsRoot $_.FullName })
if ($files.Count -eq 0) {
  throw 'No Markdown articles were found under docs.'
}

$articles = foreach ($file in $files) {
  $relative = Get-RelativeUnixPath $docsRoot $file.FullName
  $parts = $relative.Split('/')
  $category = if ($parts.Count -gt 1) { $parts[0] } else { 'root' }
  $markdown = [System.IO.File]::ReadAllText($file.FullName, [System.Text.UTF8Encoding]::new($false))
  $markdown = $markdown.Replace("`r`n", "`n").Replace("`r", "`n")
  $title = $null
  foreach ($line in ($markdown -split "`n")) {
    if ($line -match '^#\s+(.+?)\s*$') {
      $title = $Matches[1].Trim()
      break
    }
  }
  if ([string]::IsNullOrWhiteSpace($title)) {
    $title = [System.IO.Path]::GetFileNameWithoutExtension($file.Name)
  }

  $suggested = @()
  $inSuggested = $false
  foreach ($line in ($markdown -split "`n")) {
    if ($line -match '^##\s+Suggested articles\s*$') {
      $inSuggested = $true
      continue
    }
    if ($inSuggested -and $line -match '^#{1,2}\s+') { break }
    if ($inSuggested -and $line -match '^\s*-\s+\[[^\]]+\]\(([^)]+)\)') {
      $target = Resolve-DocsRelativePath $relative $Matches[1]
      if ($target) { $suggested += $target }
    }
  }

  if ($suggested.Count -eq 0) {
    $fallback = @($files | ForEach-Object { Get-RelativeUnixPath $docsRoot $_.FullName } |
      Where-Object { $_ -ne $relative -and $_.Split('/')[0] -eq $category })
    if ($fallback.Count -eq 0) {
      $fallback = @($files | ForEach-Object { Get-RelativeUnixPath $docsRoot $_.FullName } |
        Where-Object { $_ -ne $relative })
    }
    if ($fallback.Count -gt 0) { $suggested += $fallback[0] }
  }

  [ordered]@{
    id = $relative.ToLowerInvariant()
    path = $relative
    category = $category
    title = $title
    kind = if ($file.Name -eq 'README.md') { 'index' } else { 'article' }
    sourceUrl = "https://github.com/Ding-Ding-Projects/material-designer/blob/main/docs/$relative"
    sha256 = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    suggestedArticles = @($suggested)
    markdown = $markdown
  }
}

$manifest = [ordered]@{
  schemaVersion = 1
  source = 'docs/**/*.md'
  articleCount = $articles.Count
  articles = @($articles)
}

$json = $manifest | ConvertTo-Json -Depth 10
$outputParent = Split-Path -Parent $OutputPath
if (-not (Test-Path -LiteralPath $outputParent -PathType Container)) {
  New-Item -ItemType Directory -Path $outputParent -Force | Out-Null
}
[System.IO.File]::WriteAllText($OutputPath, $json + "`n", [System.Text.UTF8Encoding]::new($false))

$check = Get-Content -Raw -LiteralPath $OutputPath | ConvertFrom-Json
if ($check.schemaVersion -ne 1 -or $check.articleCount -ne $files.Count -or $check.articles.Count -ne $files.Count) {
  throw "Generated manifest is incomplete: expected $($files.Count), got $($check.articles.Count)."
}
$ids = @($check.articles | ForEach-Object id)
if (($ids | Sort-Object -Unique).Count -ne $files.Count) {
  throw 'Generated manifest contains duplicate article identifiers.'
}

Write-Output "PASS: generated $($files.Count) documentation articles at $OutputPath"

[CmdletBinding()]
param(
  [string]$RepoRoot = '',
  [switch]$SelfTest
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($RepoRoot)) { $RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')) }

function Get-MetaContent([string]$Html, [string]$Attribute, [string]$Name) {
  $escapedAttribute = [regex]::Escape($Attribute)
  $escapedName = [regex]::Escape($Name)
  $pattern = '<meta\s+' + $escapedAttribute + '\s*=\s*"' + $escapedName + '"\s+content\s*=\s*"([^"]*)"\s*/?>'
  $matches = [regex]::Matches($Html, $pattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
  if ($matches.Count -ne 1) { throw "Expected exactly one $Attribute=$Name metadata tag, found $($matches.Count)." }
  return $matches[0].Groups[1].Value
}

function Get-PngDimensions([string]$Path) {
  $bytes = [System.IO.File]::ReadAllBytes($Path)
  if ($bytes.Length -lt 24) { throw "PNG is too short: $Path" }
  $signature = [byte[]](137,80,78,71,13,10,26,10)
  for ($i = 0; $i -lt $signature.Length; $i++) {
    if ($bytes[$i] -ne $signature[$i]) { throw "PNG signature is invalid: $Path" }
  }
  $width = ([int]$bytes[16] -shl 24) -bor ([int]$bytes[17] -shl 16) -bor ([int]$bytes[18] -shl 8) -bor [int]$bytes[19]
  $height = ([int]$bytes[20] -shl 24) -bor ([int]$bytes[21] -shl 16) -bor ([int]$bytes[22] -shl 8) -bor [int]$bytes[23]
  if ($width -le 0 -or $height -le 0) { throw "PNG dimensions are invalid: $Path" }
  return @{ width = $width; height = $height }
}

function Assert-SiteMetadata([hashtable]$Pages, [string]$RepoRoot) {
  $rootPreview = Join-Path $RepoRoot 'social-preview.png'
  $servedPreview = Join-Path $RepoRoot 'site/assets/social-preview.png'
  if (-not (Test-Path -LiteralPath $rootPreview -PathType Leaf)) { throw 'Root social-preview.png is missing.' }
  if (-not (Test-Path -LiteralPath $servedPreview -PathType Leaf)) { throw 'Served social-preview.png is missing.' }
  $rootHash = (Get-FileHash -LiteralPath $rootPreview -Algorithm SHA256).Hash.ToLowerInvariant()
  $servedHash = (Get-FileHash -LiteralPath $servedPreview -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($rootHash -ne $servedHash) { throw "Root and served social previews differ: $rootHash versus $servedHash." }
  $dimensions = Get-PngDimensions $rootPreview

  foreach ($entry in $Pages.GetEnumerator()) {
    $html = $entry.Value
    $image = Get-MetaContent $html 'property' 'og:image'
    $url = $null
    try { $url = [Uri]$image } catch { throw "og:image is not an absolute URL in $($entry.Key)." }
    if ($url.Scheme -ne 'https' -or $url.Host -ne 'ding-ding-projects.github.io') {
      throw "og:image is not an HTTPS URL on the published host in $($entry.Key)."
    }
    if ($url.AbsolutePath -ne '/material-designer/assets/social-preview.png' -or [string]::IsNullOrWhiteSpace($url.Query)) {
      throw "og:image is not the versioned served preview in $($entry.Key)."
    }
    $width = [int](Get-MetaContent $html 'property' 'og:image:width')
    $height = [int](Get-MetaContent $html 'property' 'og:image:height')
    if ($width -ne $dimensions.width -or $height -ne $dimensions.height) {
      throw "og:image dimensions do not match the served PNG in $($entry.Key)."
    }
    if ([string]::IsNullOrWhiteSpace((Get-MetaContent $html 'property' 'og:image:alt'))) {
      throw "og:image:alt is empty in $($entry.Key)."
    }
    $null = Get-MetaContent $html 'property' 'og:title'
    $null = Get-MetaContent $html 'property' 'og:description'
    $pageUrl = Get-MetaContent $html 'property' 'og:url'
    if ($pageUrl -notmatch '^https://') { throw "og:url is not HTTPS in $($entry.Key)." }
    $null = Get-MetaContent $html 'property' 'og:type'
    $null = Get-MetaContent $html 'property' 'og:site_name'
    if ((Get-MetaContent $html 'name' 'twitter:card') -ne 'summary_large_image') { throw "twitter:card is not summary_large_image in $($entry.Key)." }
    $null = Get-MetaContent $html 'name' 'twitter:title'
    $null = Get-MetaContent $html 'name' 'twitter:description'
    if ((Get-MetaContent $html 'name' 'twitter:image') -ne $image) { throw "twitter:image does not match og:image in $($entry.Key)." }
    $null = Get-MetaContent $html 'name' 'theme-color'
  }
}

$siteRoot = Join-Path $RepoRoot 'site'
$pages = @{}
Get-ChildItem -LiteralPath $siteRoot -Recurse -File -Filter '*.html' | ForEach-Object {
  $pages[$_.FullName] = Get-Content -Raw -LiteralPath $_.FullName
}
if ($pages.Count -eq 0) { throw 'No published HTML pages were found.' }

Assert-SiteMetadata $pages $RepoRoot
Write-Output "PASS: verified Open Graph and Twitter metadata on $($pages.Count) published HTML page(s)."
Write-Output "PASS: root and served social previews are byte-identical with SHA-256 $((Get-FileHash (Join-Path $RepoRoot 'social-preview.png') -Algorithm SHA256).Hash.ToLowerInvariant())."

if ($SelfTest) {
  $broken = @{}
  foreach ($entry in $pages.GetEnumerator()) { $broken[$entry.Key] = $entry.Value -replace 'https://ding-ding-projects\.github\.io/material-designer/assets/social-preview\.png\?v=[^"]+', 'assets/social-preview.png' }
  $red = $false
  try { Assert-SiteMetadata $broken $RepoRoot } catch { $red = $true }
  if (-not $red) { throw 'Negative regression stayed green after replacing og:image with a relative URL.' }
  Assert-SiteMetadata $pages $RepoRoot
  Write-Output 'PASS: site metadata negative regression turned red, then green after restoration.'
}

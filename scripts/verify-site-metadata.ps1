[CmdletBinding()]
param(
  [string]$HtmlPath = 'site/index.html',
  [string]$ImagePath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Read-Required([string]$Path) {
  $full = if ([IO.Path]::IsPathRooted($Path)) { [IO.Path]::GetFullPath($Path) } else { [IO.Path]::GetFullPath((Join-Path (Get-Location).Path $Path)) }
  if (-not (Test-Path -LiteralPath $full -PathType Leaf)) { throw "Published HTML is missing: $Path" }
  return Get-Content -Raw -LiteralPath $full
}

function Get-Meta([string]$Html, [string]$Name) {
  $tags = @([regex]::Matches($Html, '<meta\b[^>]*>', [Text.RegularExpressions.RegexOptions]::IgnoreCase))
  $matches = @(
    foreach ($tag in $tags) {
      $nameMatch = [regex]::Match($tag.Value, '(?:property|name)\s*=\s*["'']([^"'']+)["'']', [Text.RegularExpressions.RegexOptions]::IgnoreCase)
      if (-not $nameMatch.Success -or $nameMatch.Groups[1].Value -cne $Name) { continue }
      $contentMatch = [regex]::Match($tag.Value, 'content\s*=\s*["'']([^"'']*)["'']', [Text.RegularExpressions.RegexOptions]::IgnoreCase)
      if ($contentMatch.Success) { $contentMatch }
    }
  )
  if ($matches.Count -ne 1) { throw "Expected exactly one metadata field '$Name', found $($matches.Count)" }
  return $matches[0].Groups[1].Value
}

$html = Read-Required $HtmlPath
$required = @('og:title', 'og:description', 'og:url', 'og:type', 'og:site_name', 'og:image', 'og:image:width', 'og:image:height', 'og:image:alt', 'twitter:card', 'theme-color')
$values = @{}
foreach ($name in $required) { $values[$name] = Get-Meta $html $name }
if ($values['og:image'] -notmatch '^https://[^\s"'']+$') { throw 'og:image must be an absolute HTTPS URL' }
if ($values['og:url'] -notmatch '^https://[^\s"'']+$') { throw 'og:url must be an absolute HTTPS URL' }
if ($values['twitter:card'] -cne 'summary_large_image') { throw 'twitter:card must be summary_large_image' }
foreach ($dimension in @('og:image:width', 'og:image:height')) {
  $number = 0
  if (-not [int]::TryParse($values[$dimension], [Globalization.NumberStyles]::Integer, [Globalization.CultureInfo]::InvariantCulture, [ref]$number) -or $number -le 0) {
    throw "$dimension must be a positive integer"
  }
}
foreach ($name in @('og:title', 'og:description', 'og:url', 'og:type', 'og:site_name', 'og:image', 'og:image:alt', 'theme-color')) {
  if ([string]::IsNullOrWhiteSpace($values[$name])) { throw "$name must not be empty" }
}
if ($ImagePath) {
  $image = if ([IO.Path]::IsPathRooted($ImagePath)) { [IO.Path]::GetFullPath($ImagePath) } else { [IO.Path]::GetFullPath((Join-Path (Get-Location).Path $ImagePath)) }
  if (-not (Test-Path -LiteralPath $image -PathType Leaf)) { throw "Social preview image is missing: $ImagePath" }
  $bytes = [IO.File]::ReadAllBytes($image)
  if ($bytes.Length -lt 8 -or $bytes[0] -ne 137 -or $bytes[1] -ne 80 -or $bytes[2] -ne 78 -or $bytes[3] -ne 71) { throw 'Social preview image is not a PNG' }
}
Write-Output "Site metadata verified: $HtmlPath"
Write-Output "og:image: $($values['og:image'])"
Write-Output "twitter:card: $($values['twitter:card'])"

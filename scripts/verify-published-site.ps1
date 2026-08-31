[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidatePattern('^https://')][string]$SiteUrl,
  [int]$TimeoutSec = 20
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$uri = [Uri]$SiteUrl
$response = Invoke-WebRequest -Uri $uri -UseBasicParsing -TimeoutSec ([Math]::Max(1, [Math]::Min($TimeoutSec, 120)))
if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 300) { throw "Published site returned HTTP $($response.StatusCode)" }
$html = [string]$response.Content
if ([string]::IsNullOrWhiteSpace($html)) { throw 'Published site returned an empty body' }

function Get-Meta([string]$Name) {
  $tags = @([regex]::Matches($html, '<meta\b[^>]*>', [Text.RegularExpressions.RegexOptions]::IgnoreCase))
  $matches = @(
    foreach ($tag in $tags) {
      $nameMatch = [regex]::Match($tag.Value, '(?:property|name)\s*=\s*["'']([^"'']+)["'']', [Text.RegularExpressions.RegexOptions]::IgnoreCase)
      if (-not $nameMatch.Success -or $nameMatch.Groups[1].Value -cne $Name) { continue }
      $contentMatch = [regex]::Match($tag.Value, 'content\s*=\s*["'']([^"'']*)["'']', [Text.RegularExpressions.RegexOptions]::IgnoreCase)
      if ($contentMatch.Success) { $contentMatch }
    }
  )
  if ($matches.Count -ne 1) { throw "Published site has $($matches.Count) '$Name' metadata fields, expected one" }
  return $matches[0].Groups[1].Value
}

$imageUrl = Get-Meta 'og:image'
if ($imageUrl -notmatch '^https://') { throw 'Published og:image is not an absolute HTTPS URL' }
$image = Invoke-WebRequest -Uri ([Uri]$imageUrl) -UseBasicParsing -TimeoutSec ([Math]::Max(1, [Math]::Min($TimeoutSec, 120)))
if ($image.StatusCode -lt 200 -or $image.StatusCode -ge 300) { throw "Published og:image returned HTTP $($image.StatusCode)" }
$contentType = $image.Headers['Content-Type']
if ([string]::IsNullOrWhiteSpace($contentType) -or $contentType -notmatch '^image/') { throw 'Published og:image did not return an image content type' }
$card = Get-Meta 'twitter:card'
if ($card -cne 'summary_large_image') { throw 'Published twitter:card is not summary_large_image' }
foreach ($name in @('og:title', 'og:description', 'og:url', 'og:type', 'og:site_name', 'og:image:width', 'og:image:height', 'og:image:alt', 'theme-color')) {
  if ([string]::IsNullOrWhiteSpace((Get-Meta $name))) { throw "Published $name is empty" }
}
Write-Output "Published site metadata verified: $SiteUrl"
Write-Output "Published image URL verified: $imageUrl"

[CmdletBinding()]
param(
  [Uri]$SiteUri = 'https://ding-ding-projects.github.io/material-designer/'
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Net.Http -ErrorAction Stop

function Get-MetaContent([string]$Html, [string]$Attribute, [string]$Name) {
  $pattern = '<meta\s+' + [regex]::Escape($Attribute) + '\s*=\s*"' + [regex]::Escape($Name) + '"\s+content\s*=\s*"([^"]*)"\s*/?>'
  $matches = [regex]::Matches($Html, $pattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
  if ($matches.Count -ne 1) { throw "Published page has $($matches.Count) $Attribute=$Name tags, expected one." }
  return $matches[0].Groups[1].Value
}

function Get-Bytes([Uri]$Uri) {
  $client = [System.Net.Http.HttpClient]::new()
  $timeout = [System.Threading.CancellationTokenSource]::new(30000)
  try {
    $response = $client.GetAsync($Uri, $timeout.Token).GetAwaiter().GetResult()
    if (-not $response.IsSuccessStatusCode) { throw "Published request returned HTTP $([int]$response.StatusCode): $Uri" }
    return $response.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult()
  } finally {
    $timeout.Dispose()
    $client.Dispose()
  }
}

$pageBytes = Get-Bytes $SiteUri
$html = [System.Text.Encoding]::UTF8.GetString($pageBytes)
$image = Get-MetaContent $html 'property' 'og:image'
$imageUri = [Uri]$image
if ($imageUri.Scheme -ne 'https' -or [string]::IsNullOrWhiteSpace($imageUri.Query)) {
  throw 'Published og:image is not an absolute HTTPS versioned URL.'
}
$null = Get-MetaContent $html 'property' 'og:title'
$null = Get-MetaContent $html 'property' 'og:description'
$null = Get-MetaContent $html 'property' 'og:url'
$null = Get-MetaContent $html 'property' 'og:type'
$null = Get-MetaContent $html 'property' 'og:site_name'
$null = Get-MetaContent $html 'property' 'og:image:width'
$null = Get-MetaContent $html 'property' 'og:image:height'
$null = Get-MetaContent $html 'property' 'og:image:alt'
if ((Get-MetaContent $html 'name' 'twitter:card') -ne 'summary_large_image') { throw 'Published page does not use summary_large_image.' }
if ((Get-MetaContent $html 'name' 'twitter:image') -ne $image) { throw 'Published Twitter image does not match Open Graph image.' }
$imageBytes = Get-Bytes $imageUri
$signature = [byte[]](137,80,78,71,13,10,26,10)
if ($imageBytes.Length -lt 24) { throw 'Published preview is too short to be a PNG.' }
for ($i = 0; $i -lt $signature.Length; $i++) {
  if ($imageBytes[$i] -ne $signature[$i]) { throw 'Published preview is not a PNG.' }
}
Write-Output "PASS: anonymous fetch returned published HTML and product-specific preview from $SiteUri"
Write-Output "PASS: published preview URL $image returned $($imageBytes.Length) bytes with required metadata fields"

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$Path,
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[0-9a-fA-F]{64}$')]
  [string]$ExpectedSha256,
  [Parameter(Mandatory = $true)]
  [ValidateRange(1, 16777216)]
  [long]$ExpectedBytes
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
  throw "catalog image was not found at the run-scoped path"
}

$item = Get-Item -LiteralPath $Path
if ($item.Length -ne $ExpectedBytes) {
  throw "catalog image byte count did not match the published asset digest record"
}

$actualSha256 = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualSha256 -ne $ExpectedSha256.ToLowerInvariant()) {
  throw "catalog image SHA-256 did not match the published asset digest record"
}

$bytes = [IO.File]::ReadAllBytes($Path)
$pngSignature = [byte[]](137, 80, 78, 71, 13, 10, 26, 10)
if ($bytes.Length -lt 33) {
  throw 'catalog image was not a PNG payload'
}
for ($index = 0; $index -lt $pngSignature.Length; $index++) {
  if ($bytes[$index] -ne $pngSignature[$index]) { throw 'catalog image was not a PNG payload' }
}

$stream = [IO.MemoryStream]::new($bytes, $false)
$image = $null
try {
  $image = [Drawing.Image]::FromStream($stream, $true, $true)
  if ($image.Width -le 0 -or $image.Height -le 0) {
    throw 'catalog image decoded with invalid dimensions'
  }
  Write-Output "PASS: catalog image decoded as PNG at $($image.Width)x$($image.Height), $($item.Length) bytes, SHA-256 $actualSha256"
} finally {
  if ($null -ne $image) { $image.Dispose() }
  $stream.Dispose()
}

[CmdletBinding()]
param(
  [string]$Root = ''
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($Root)) { $Root = Split-Path -Parent $PSScriptRoot }
$sourcePath = Join-Path $Root 'scripts\download-dependencies.ps1'
if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) { throw 'dependency bootstrap source is missing' }

function Assert-NativeSha256([string]$Source, [string]$Context) {
  if ($Source -notmatch 'function Get-Sha256\(\[string\]\$Path\)') { throw "$Context has no SHA-256 helper" }
  if ($Source -notmatch '\[Security\.Cryptography\.SHA256\]::Create\(\)') { throw "$Context does not create a native SHA-256 instance" }
  if ($Source -notmatch '\[IO\.File\]::OpenRead\(\$Path\)') { throw "$Context does not hash a file stream" }
  if ($Source -match 'Get-FileHash') { throw "$Context still depends on Get-FileHash" }
}

$source = Get-Content -Raw -LiteralPath $sourcePath
Assert-NativeSha256 $source 'dependency bootstrap'

$count = [regex]::Matches($source, [regex]::Escape('[Security.Cryptography.SHA256]::Create()')).Count
if ($count -ne 1) { throw "expected one exact native SHA-256 construction, found $count" }
$broken = $source.Replace('[Security.Cryptography.SHA256]::Create()', '[Security.Cryptography.SHA256]::MISSING()')
Assert-NativeSha256 $source 'restored dependency bootstrap'
try {
  Assert-NativeSha256 $broken 'negative dependency bootstrap'
  throw 'native SHA-256 guard stayed green after the exact construction was removed'
} catch {
  if ($_.Exception.Message -like 'native SHA-256 guard stayed green*') { throw }
}

Write-Output 'PASS: dependency bootstrap uses native streaming SHA-256 and the exact construction mutation turns the focused guard red.'

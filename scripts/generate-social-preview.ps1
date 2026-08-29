[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$SourcePath,
  [string]$RootOutput = 'social-preview.png',
  [string]$ServedOutput = 'site/social-preview.png'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Resolve-File([string]$Path) {
  $resolved = if ([IO.Path]::IsPathRooted($Path)) { [IO.Path]::GetFullPath($Path) } else { [IO.Path]::GetFullPath((Join-Path (Get-Location).Path $Path)) }
  if (-not (Test-Path -LiteralPath $resolved -PathType Leaf)) { throw "Source image is missing: $Path" }
  return $resolved
}

function Assert-Png([string]$Path) {
  $bytes = [IO.File]::ReadAllBytes($Path)
  $signature = [byte[]](137, 80, 78, 71, 13, 10, 26, 10)
  if ($bytes.Length -lt $signature.Length) { throw "Social preview is not a PNG: $Path" }
  for ($i = 0; $i -lt $signature.Length; $i += 1) {
    if ($bytes[$i] -ne $signature[$i]) { throw "Social preview is not a PNG: $Path" }
  }
}

$source = Resolve-File $SourcePath
Assert-Png $source
$root = if ([IO.Path]::IsPathRooted($RootOutput)) { [IO.Path]::GetFullPath($RootOutput) } else { [IO.Path]::GetFullPath((Join-Path (Get-Location).Path $RootOutput)) }
$served = if ([IO.Path]::IsPathRooted($ServedOutput)) { [IO.Path]::GetFullPath($ServedOutput) } else { [IO.Path]::GetFullPath((Join-Path (Get-Location).Path $ServedOutput)) }
$rootParent = Split-Path -Parent $root
$servedParent = Split-Path -Parent $served
New-Item -ItemType Directory -Force -Path $rootParent, $servedParent | Out-Null
Copy-Item -LiteralPath $source -Destination $root -Force
Copy-Item -LiteralPath $source -Destination $served -Force
Assert-Png $root
Assert-Png $served
$rootHash = (Get-FileHash -LiteralPath $root -Algorithm SHA256).Hash.ToLowerInvariant()
$servedHash = (Get-FileHash -LiteralPath $served -Algorithm SHA256).Hash.ToLowerInvariant()
if ($rootHash -ne $servedHash) { throw 'Root and served social previews differ' }
Write-Output "Generated product social preview: $RootOutput"
Write-Output "Served copy is byte-identical: $ServedOutput"
Write-Output "SHA-256: $rootHash"

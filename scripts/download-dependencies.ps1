[CmdletBinding()]
param(
  [switch]$Silent
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $PSScriptRoot 'download-dependencies.manifest.json'
$buildScript = Join-Path $PSScriptRoot 'build.ps1'
$started = Get-Date

function Write-Phase([string]$Message) {
  $elapsed = ((Get-Date) - $started).ToString('hh\:mm\:ss')
  Write-Host "[$elapsed] $Message"
}

function Invoke-Checked([string]$File, [string[]]$Arguments, [string]$Description) {
  Write-Phase $Description
  & $File @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$Description failed with exit code $LASTEXITCODE" }
}

if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
  throw "the pinned dependency manifest is missing at $manifestPath"
}
if (-not (Test-Path -LiteralPath $buildScript -PathType Leaf)) {
  throw "the dependency bootstrap implementation is missing at $buildScript"
}

$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
if ($manifest.schemaVersion -ne 1 -or @($manifest.dependencies).Count -ne 4) {
  throw 'the pinned dependency manifest is incomplete'
}
$python = @($manifest.dependencies | Where-Object { $_.name -eq 'Python' })[0]
$pnpm = @($manifest.dependencies | Where-Object { $_.name -eq 'pnpm' })[0]
if ($python.version -ne '3.12.10' -or $python.sha256 -ne '4acbed6dd1c744b0376e3b1cf57ce906f9dc9e95e68824584c8099a63025a3c3') {
  throw 'the pinned Python dependency record is invalid'
}
if ($pnpm.version -ne '10.33.2' -or [string]::IsNullOrWhiteSpace($pnpm.integrity)) {
  throw 'the pinned pnpm dependency record is invalid'
}

# build.ps1 is the single acquisition path. It is idempotent, uses only
# user-scoped or portable toolchains, verifies downloaded archives, and accepts
# -Silent so this fetcher never waits for a prompt.
$arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $buildScript, '-Silent', '-SkipBuild')
Invoke-Checked 'powershell.exe' $arguments 'Acquiring and verifying the pinned build dependencies'

$nodeCandidates = @(
  (Join-Path $env:LOCALAPPDATA 'MaterialDesigner\toolchain\node-v24\node.exe'),
  (Get-Command node.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -ErrorAction SilentlyContinue)
) | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) }
$nodePath = $nodeCandidates | Select-Object -First 1
$nodeVersion = if ($nodePath) { (& $nodePath --version 2>$null).Trim() } else { '' }
if ($nodeVersion -notmatch '^v24\.') { throw "the dependency fetcher resolved Node.js '$nodeVersion', expected the 24.x project constraint" }

$pnpmCandidates = @(
  (Join-Path $env:LOCALAPPDATA 'MaterialDesigner\toolchain\pnpm.cmd'),
  (Join-Path $env:LOCALAPPDATA 'MaterialDesigner\toolchain\node_modules\.bin\pnpm.cmd'),
  (Get-Command pnpm.cmd -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -ErrorAction SilentlyContinue)
) | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) }
$pnpmPath = $pnpmCandidates | Select-Object -First 1
$pnpmVersion = if ($pnpmPath) { (& $pnpmPath --version 2>$null).Trim() } else { '' }
if ($pnpmVersion -ne '10.33.2') { throw "the dependency fetcher resolved pnpm '$pnpmVersion', expected 10.33.2" }

$pythonCandidates = @(
  (Join-Path $env:LOCALAPPDATA 'MaterialDesigner\toolchain\python-3.12.10\python.exe'),
  (Get-Command python.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -ErrorAction SilentlyContinue)
) | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) }
$pythonPath = $pythonCandidates | Select-Object -First 1
$pythonVersion = if ($pythonPath) { (& $pythonPath --version 2>&1).ToString().Trim() } else { '' }
if ($pythonVersion -notmatch '^Python 3\.12\.') { throw "the dependency fetcher resolved Python '$pythonVersion', expected 3.12.x" }

$vswhere = Get-Command vswhere.exe -ErrorAction SilentlyContinue
$knownVswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
if (-not $vswhere -and (Test-Path -LiteralPath $knownVswhere -PathType Leaf)) { $vswhere = Get-Command -Name $knownVswhere -CommandType Application -ErrorAction Stop }
if (-not $vswhere) { throw 'the dependency fetcher could not verify Visual Studio 2022 C++ build tools through vswhere.exe' }

Write-Phase "Verified Node.js $nodeVersion, pnpm $pnpmVersion, $pythonVersion, and Visual Studio C++ discovery"

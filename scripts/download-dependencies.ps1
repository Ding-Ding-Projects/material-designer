[CmdletBinding()]
param(
  [switch]$Silent,
  [switch]$ValidateOnly,
  [string]$ManifestPath
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$manifestPath = if ([string]::IsNullOrWhiteSpace($ManifestPath)) { Join-Path $PSScriptRoot 'download-dependencies.manifest.json' } else { [IO.Path]::GetFullPath($ManifestPath) }
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
$expected = @(
  [ordered]@{ name = 'Node.js'; id = 'nodejs'; version = '24.20.0'; source = 'https://nodejs.org/dist/v24.20.0/node-v24.20.0-win-x64.zip'; archive = 'node-v24.20.0-win-x64.zip'; sha256 = '6cac9ffbca8f6a47091e4b5c772e0606049c3871cb67d900c0cedde630e545ba' },
  [ordered]@{ name = 'pnpm'; id = 'pnpm'; version = '10.33.2'; source = 'https://registry.npmjs.org/pnpm/-/pnpm-10.33.2.tgz'; integrity = 'sha512-qQ+vb+6rca1sblf5Tg/hoS9dzCLNdU20CulZPraj4LaxLjVAIYuzeuCDQEsfLObbKkEh6XmCm0r/lLmfSdoc+A==' },
  [ordered]@{ name = 'Python'; id = 'python'; version = '3.12.10'; source = 'https://www.python.org/ftp/python/3.12.10/python-3.12.10-embed-amd64.zip'; archive = 'python-3.12.10-embed-amd64.zip'; sha256 = '4acbed6dd1c744b0376e3b1cf57ce906f9dc9e95e68824584c8099a63025a3c3' },
  [ordered]@{ name = 'Microsoft C++ build tools'; id = 'Microsoft.VisualStudio.2022.BuildTools'; version = '17.14.39'; source = 'https://download.visualstudio.microsoft.com/download/pr/fa619120-9c0e-47e6-bfe0-3ee96fb671b2/236367b68ba9a51708263ab10a1c85546cc4a8eca78b365168811d19c4fb2f29/vs_BuildTools.exe'; archive = 'vs_BuildTools.exe'; sha256 = '236367b68ba9a51708263ab10a1c85546cc4a8eca78b365168811d19c4fb2f29' }
)
$actualNames = @($manifest.dependencies | ForEach-Object { [string]$_.name } | Sort-Object)
$expectedNames = @($expected | ForEach-Object { [string]$_.name } | Sort-Object)
if (($actualNames -join '|') -ne ($expectedNames -join '|')) { throw 'the dependency manifest does not contain the exact required record names' }
$allowedFields = @{
  'Node.js' = @('name', 'id', 'version', 'source', 'archive', 'sha256')
  'pnpm' = @('name', 'id', 'version', 'source', 'integrity')
  'Python' = @('name', 'id', 'version', 'source', 'archive', 'sha256')
  'Microsoft C++ build tools' = @('name', 'id', 'version', 'source', 'archive', 'sha256', 'installArguments')
}
foreach ($record in $expected) {
  $matches = @($manifest.dependencies | Where-Object { $_.name -eq $record.name })
  if ($matches.Count -ne 1) { throw "the dependency manifest must contain exactly one record for $($record.name)" }
  $actual = $matches[0]
  $unknownFields = @($actual.PSObject.Properties.Name | Where-Object { $_ -notin $allowedFields[$record.name] })
  if ($unknownFields.Count -gt 0) { throw "the dependency manifest record for $($record.name) has unknown field(s): $($unknownFields -join ', ')" }
  foreach ($key in $record.Keys) {
    if ([string]$actual.$key -cne [string]$record[$key]) { throw "the dependency manifest record for $($record.name) has an invalid $key" }
  }
  if ([string]::IsNullOrWhiteSpace($actual.id) -or [string]::IsNullOrWhiteSpace($actual.version) -or [string]::IsNullOrWhiteSpace($actual.source)) {
    throw "the dependency manifest record for $($record.name) is missing a required identity field"
  }
  if ([string]::IsNullOrWhiteSpace($actual.sha256) -and [string]::IsNullOrWhiteSpace($actual.integrity)) {
    throw "the dependency manifest record for $($record.name) has no digest or integrity value"
  }
}
if ($ValidateOnly) {
  Write-Phase 'Validated every exact dependency identity, source, version and digest record'
  exit 0
}

# build.ps1 is the single acquisition path. It is idempotent, uses only
# user-scoped or portable toolchains, verifies downloaded archives, and accepts
# -Silent so this fetcher never waits for a prompt.
$arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $buildScript, '-Silent', '-SkipBuild')
Invoke-Checked 'powershell.exe' $arguments 'Acquiring and verifying the pinned build dependencies'

$nodeCandidates = @(
  (Join-Path $env:LOCALAPPDATA 'MaterialDesigner\toolchain\node-v24.20.0\node.exe'),
  (Get-Command node.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -ErrorAction SilentlyContinue)
) | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) }
$nodePath = $nodeCandidates | Select-Object -First 1
$nodeVersion = if ($nodePath) { (& $nodePath --version 2>$null).Trim() } else { '' }
if ($nodeVersion -ne 'v24.20.0') { throw "the dependency fetcher resolved Node.js '$nodeVersion', expected v24.20.0" }

$pnpmCandidates = @(
  (Join-Path $env:LOCALAPPDATA 'MaterialDesigner\toolchain\pnpm.cmd'),
  (Join-Path $env:LOCALAPPDATA 'MaterialDesigner\toolchain\node_modules\.bin\pnpm.cmd'),
  (Get-Command pnpm.cmd -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -ErrorAction SilentlyContinue)
) | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) }
$pnpmPath = $pnpmCandidates | Select-Object -First 1
$pnpmVersion = if ($pnpmPath) { (& $pnpmPath --version 2>$null).Trim() } else { '' }
if ($pnpmVersion -ne '10.33.2') { throw "the dependency fetcher resolved pnpm '$pnpmVersion', expected 10.33.2" }

$pythonToolRoot = Join-Path $env:LOCALAPPDATA 'MaterialDesigner\toolchain\python-3.12.10'
$pythonToolPath = Join-Path $pythonToolRoot 'python.exe'
if (Test-Path -LiteralPath $pythonToolPath -PathType Leaf) {
  $toolRootVersion = (& $pythonToolPath --version 2>&1).ToString().Trim()
  if ($toolRootVersion -ne 'Python 3.12.10') { throw "the user-scoped Python tool root is stale: found '$toolRootVersion' at $pythonToolPath, expected Python 3.12.10; remove or repair that exact tool root before retrying" }
}
$pythonCandidates = @(
  $pythonToolPath,
  (Get-Command python.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -ErrorAction SilentlyContinue)
) | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) }
$pythonPath = $pythonCandidates | Select-Object -First 1
$pythonVersion = if ($pythonPath) { (& $pythonPath --version 2>&1).ToString().Trim() } else { '' }
if ($pythonVersion -ne 'Python 3.12.10') { throw "the dependency fetcher resolved Python '$pythonVersion', expected Python 3.12.10" }

$vswhere = Get-Command vswhere.exe -ErrorAction SilentlyContinue
$knownVswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
if (-not $vswhere -and (Test-Path -LiteralPath $knownVswhere -PathType Leaf)) { $vswhere = Get-Command -Name $knownVswhere -CommandType Application -ErrorAction Stop }
if (-not $vswhere) { throw 'the dependency fetcher could not verify Visual Studio 2022 C++ build tools through vswhere.exe' }

Write-Phase "Verified exact Node.js $nodeVersion, pnpm $pnpmVersion, $pythonVersion, and Visual Studio C++ record $($expected[3].version)"

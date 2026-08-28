[CmdletBinding()]
param(
  [switch]$Silent,
  [switch]$Launch,
  [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$design = Join-Path $repo 'design'
$stateRoot = Join-Path $repo '.yum-tong\build'
$resolutionPath = Join-Path $stateRoot 'dependency-resolution.json'
$started = Get-Date
New-Item -ItemType Directory -Force -Path $stateRoot | Out-Null

function Write-Phase([string]$Message) {
  if ($Silent) { return }
  $elapsed = ((Get-Date) - $started).ToString('hh\:mm\:ss')
  Write-Host "[$elapsed] $Message"
}

function Invoke-Checked([string]$File, [string[]]$Arguments, [string]$Description) {
  Write-Phase $Description
  & $File @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$Description failed with exit code $LASTEXITCODE" }
}

function Get-Sha256([string]$Path) {
  (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Read-VerifiedDependencyResolution {
  if (-not (Test-Path -LiteralPath $resolutionPath -PathType Leaf)) {
    throw "dependency resolution record is missing at $resolutionPath"
  }
  $resolution = Get-Content -Raw -LiteralPath $resolutionPath | ConvertFrom-Json
  if ($null -eq $resolution -or $resolution.schemaVersion -ne 1) {
    throw 'dependency resolution record has an unsupported schema'
  }
  $manifestPath = Join-Path $repo 'dependencies.manifest.json'
  if ($resolution.manifestPath -ne $manifestPath -or $resolution.manifestSha256 -ne (Get-Sha256 $manifestPath)) {
    throw 'dependency resolution record is stale for the current dependencies.manifest.json'
  }
  foreach ($id in @('git', 'node', 'pnpm', 'python')) {
    $tool = $resolution.tools.$id
    if ($null -eq $tool -or [string]::IsNullOrWhiteSpace($tool.executable) -or [string]::IsNullOrWhiteSpace($tool.version)) {
      throw "dependency resolution record has no complete $id entry"
    }
    if (-not (Test-Path -LiteralPath $tool.executable -PathType Leaf)) {
      throw "resolved $id executable is missing: $($tool.executable)"
    }
  }
  $compiler = $resolution.compiler
  if ($null -eq $compiler -or [string]::IsNullOrWhiteSpace($compiler.clPath) -or -not (Test-Path -LiteralPath $compiler.clPath -PathType Leaf)) {
    throw 'dependency resolution record has no usable compiler path'
  }
  if ($null -ne $compiler.environment) {
    foreach ($property in $compiler.environment.psobject.Properties) {
      [Environment]::SetEnvironmentVariable($property.Name, [string]$property.Value, 'Process')
    }
  }
  $pathEntries = @(
    (Split-Path -Parent $resolution.tools.git.executable),
    (Split-Path -Parent $resolution.tools.node.executable),
    (Split-Path -Parent $resolution.tools.pnpm.executable),
    (Split-Path -Parent $resolution.tools.python.executable),
    (Split-Path -Parent $compiler.clPath)
  ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
  $env:Path = (($pathEntries + @($env:Path)) -join ';')
  return $resolution
}

if ($env:YUM_TONG_DEPENDENCIES_READY -ne '1') {
  & (Join-Path $PSScriptRoot 'download-dependencies.ps1') -Silent
  if (-not $?) { throw 'dependency bootstrap did not complete successfully' }
}
$resolution = Read-VerifiedDependencyResolution
$gitPath = [string]$resolution.tools.git.executable
$nodePath = [string]$resolution.tools.node.executable
$pnpmPath = [string]$resolution.tools.pnpm.executable
$pythonPath = [string]$resolution.tools.python.executable
$compilerPath = [string]$resolution.compiler.clPath

$gitVersion = (& $gitPath --version 2>$null).Trim()
if ($gitVersion -notmatch [regex]::Escape([string]$resolution.tools.git.version)) { throw "resolved Git version '$gitVersion' does not match the manifest" }
$nodeVersion = (& $nodePath --version 2>$null).Trim()
if ($nodeVersion -ne "v$($resolution.tools.node.version)") { throw "resolved Node version '$nodeVersion' does not match the manifest" }
$pnpmVersion = (& $pnpmPath --version 2>$null).Trim()
if ($pnpmVersion -ne [string]$resolution.tools.pnpm.version) { throw "resolved pnpm version '$pnpmVersion' does not match the manifest" }
$pythonVersion = (& $pythonPath --version 2>&1).ToString().Trim()
if ($pythonVersion -ne "Python $($resolution.tools.python.version)") { throw "resolved Python version '$pythonVersion' does not match the manifest" }
if (-not (Test-Path -LiteralPath $compilerPath -PathType Leaf)) { throw "resolved compiler path is missing: $compilerPath" }
Write-Phase "Using pinned Git $($resolution.tools.git.version), Node $($resolution.tools.node.version), pnpm $($resolution.tools.pnpm.version), Python $($resolution.tools.python.version), and compiler $compilerPath"

if (-not $SkipBuild) {
  Invoke-Checked $pnpmPath @('--dir', $design, 'install', '--frozen-lockfile') 'Installing the locked workspace dependencies'
  Invoke-Checked $pnpmPath @('--dir', $design, '--filter', '@open-design/daemon', 'run', 'build') 'Building the daemon package'
  Invoke-Checked $pnpmPath @('--dir', $design, '--filter', '@open-design/desktop', 'run', 'build') 'Building the desktop package'
  Invoke-Checked $pnpmPath @('--dir', $design, '--filter', '@open-design/web', 'run', 'build:sidecar') 'Building the web sidecar'
  Invoke-Checked $pnpmPath @('--dir', $design, '--filter', '@open-design/tools-pack', 'run', 'build') 'Building the supported packaging tool'
  $sha = (& $gitPath -C $repo rev-parse HEAD).Trim()
  $provenance = [ordered]@{
    status = 'unavailable'
    reason = 'No externally supplied build provenance record was provided to this local build'
  }
  $provenanceFile = $env:MATERIAL_DESIGNER_PROVENANCE_FILE
  if (-not [string]::IsNullOrWhiteSpace($provenanceFile)) {
    if (-not (Test-Path -LiteralPath $provenanceFile -PathType Leaf)) { throw "external provenance file was not found: $provenanceFile" }
    $external = Get-Content -Raw -LiteralPath $provenanceFile | ConvertFrom-Json
    $package = Get-Content -Raw -LiteralPath (Join-Path $design 'package.json') | ConvertFrom-Json
    if ($null -eq $external -or $external.schemaVersion -ne 1 -or $external.sourceCommit -ne $sha -or $external.version -ne $package.version -or [string]::IsNullOrWhiteSpace($external.updatedAt)) {
      throw 'external provenance must contain schemaVersion 1, the exact source commit, the exact package version, and a non-empty updatedAt value'
    }
    try { [DateTimeOffset]::Parse($external.updatedAt) | Out-Null } catch { throw 'external provenance updatedAt is not a valid timestamp' }
    $provenance = [ordered]@{
      status = 'verified'
      source = 'external-record'
      schemaVersion = 1
      sourceCommit = $sha
      version = $external.version
      updatedAt = $external.updatedAt
    }
  }
  $manifest = [ordered]@{
    schemaVersion = 1
    commit = $sha
    provenance = $provenance
    tools = $resolution.tools
    compiler = [ordered]@{ clPath = $compilerPath; version = $resolution.compiler.version }
    outputs = @(
      'design/apps/daemon/dist',
      'design/apps/desktop/dist',
      'design/apps/web/dist',
      'design/tools/pack/dist'
    )
  }
  $manifest | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $stateRoot 'build-manifest.json') -Encoding utf8
  Write-Phase 'Build manifest written to .yum-tong/build/build-manifest.json'
}

if ($Launch) {
  $entry = Join-Path $design 'apps/desktop/dist/main/index.js'
  if (-not (Test-Path -LiteralPath $entry)) { throw "built desktop entry was not found at $entry" }
  Write-Phase 'Launching the built desktop entry'
  Start-Process -FilePath $nodePath -ArgumentList @($entry) -WorkingDirectory $design
}

Write-Phase 'Build complete; no installer or release was published by this script'

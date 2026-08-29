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
New-Item -ItemType Directory -Force -Path $stateRoot | Out-Null
$started = Get-Date
$dependencyManifestPath = Join-Path $repo 'scripts\download-dependencies.manifest.json'
if (-not (Test-Path -LiteralPath $dependencyManifestPath -PathType Leaf)) {
  throw "the pinned dependency manifest is missing at $dependencyManifestPath"
}
$dependencyManifest = Get-Content -Raw -LiteralPath $dependencyManifestPath | ConvertFrom-Json
if ($dependencyManifest.schemaVersion -ne 1 -or @($dependencyManifest.dependencies).Count -ne 4) {
  throw 'the pinned dependency manifest is incomplete'
}

function Get-DependencyRecord([string]$Name) {
  $records = @($dependencyManifest.dependencies | Where-Object { $_.name -eq $Name })
  if ($records.Count -ne 1) { throw "the pinned dependency manifest must contain exactly one $Name record" }
  return $records[0]
}

function Write-Phase([string]$Message) {
  $elapsed = ((Get-Date) - $started).ToString('hh\:mm\:ss')
  Write-Host "[$elapsed] $Message"
}

function Refresh-Path {
  $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $user = [Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = "$machine;$user"
}

function Invoke-Checked([string]$File, [string[]]$Arguments, [string]$Description) {
  Write-Phase $Description
  & $File @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$Description failed with exit code $LASTEXITCODE" }
}

function Get-Sha256([string]$Path) {
  $sha = [Security.Cryptography.SHA256]::Create()
  try {
    $stream = [IO.File]::OpenRead($Path)
    try { return ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
    finally { $stream.Dispose() }
  } finally { $sha.Dispose() }
}

function Ensure-Node24 {
  $record = Get-DependencyRecord 'Node.js'
  $versionName = "v$($record.version)"
  $expectedVersion = $versionName
  $archiveName = [string]$record.archive
  $expectedHash = [string]$record.sha256
  $node = Get-Command node.exe -ErrorAction SilentlyContinue
  $version = if ($node) { (& $node.Source --version 2>$null).Trim() } else { '' }
  if ($version -ne $expectedVersion) {
    $toolRoot = Join-Path $env:LOCALAPPDATA "MaterialDesigner\toolchain\node-$versionName"
    $nodeExe = Join-Path $toolRoot 'node.exe'
    if (-not (Test-Path -LiteralPath $nodeExe)) {
      Write-Phase "Installing the pinned Node.js $versionName portable archive"
      $tempRoot = Join-Path ([IO.Path]::GetTempPath()) ("material-designer-node24-{0}" -f ([guid]::NewGuid().ToString('N')))
      New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null
      try {
        $archive = Join-Path $tempRoot $archiveName
        Invoke-WebRequest -UseBasicParsing -Uri $record.source -OutFile $archive -TimeoutSec 180
        $actual = Get-Sha256 $archive
        if ($actual -ne $expectedHash.ToLowerInvariant()) { throw "Node.js $versionName archive hash mismatch for $archiveName" }
        $extractRoot = Join-Path $tempRoot 'extract'
        Expand-Archive -LiteralPath $archive -DestinationPath $extractRoot -Force
        $source = Join-Path $extractRoot ([IO.Path]::GetFileNameWithoutExtension($archiveName))
        if (-not (Test-Path -LiteralPath (Join-Path $source 'node.exe'))) { throw "Node.js $versionName archive did not contain node.exe" }
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $toolRoot) | Out-Null
        if (Test-Path -LiteralPath $toolRoot) { Remove-Item -LiteralPath $toolRoot -Recurse -Force }
        Move-Item -LiteralPath $source -Destination $toolRoot
      } finally {
        if (Test-Path -LiteralPath $tempRoot) { Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue }
      }
    }
    $env:Path = "$toolRoot;$env:Path"
    $node = Get-Command node.exe -ErrorAction SilentlyContinue
    $version = if ($node) { (& $node.Source --version 2>$null).Trim() } else { '' }
  }
  if ($version -ne $expectedVersion) { throw "expected Node.js $expectedVersion, found '$version' after bootstrap" }
  Write-Phase "Using $version"
}

function Ensure-Pnpm {
  $record = Get-DependencyRecord 'pnpm'
  $expectedVersion = [string]$record.version
  $pnpmRoot = Join-Path $env:LOCALAPPDATA 'MaterialDesigner\toolchain'
  $env:Path = "$pnpmRoot;$(Join-Path $pnpmRoot 'node_modules\.bin');$env:Path"
  $pnpm = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
  $version = if ($pnpm) { (& $pnpm.Source --version 2>$null).Trim() } else { '' }
  if ($version -ne $expectedVersion) {
    $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if (-not $npm) { throw "pnpm $expectedVersion is missing and npm.cmd is unavailable" }
    $integrity = (& $npm.Source 'view' "$($record.id)@$expectedVersion" 'dist.integrity' 2>$null).Trim()
    if ($LASTEXITCODE -ne 0 -or $integrity -ne [string]$record.integrity) { throw "npm registry integrity for $($record.id)@$expectedVersion did not match the pinned manifest" }
    Invoke-Checked $npm.Source @('--prefix', $pnpmRoot, 'install', '--global', "$($record.id)@$expectedVersion") "Installing pnpm $expectedVersion"
    $toolchainPath = $env:Path
    Refresh-Path
    $env:Path = "$pnpmRoot;$(Join-Path $pnpmRoot 'node_modules\.bin');$toolchainPath;$env:Path"
    $pnpm = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
    $version = if ($pnpm) { (& $pnpm.Source --version 2>$null).Trim() } else { '' }
  }
  if ($version -ne $expectedVersion) { throw "expected pnpm $expectedVersion, found '$version' after bootstrap" }
  Write-Phase "Using pnpm $version"
}

function Ensure-Python312 {
  $record = Get-DependencyRecord 'Python'
  $pythonVersion = [string]$record.version
  $python = Get-Command python.exe -ErrorAction SilentlyContinue
  $version = if ($python) { (& $python.Source --version 2>&1).ToString().Trim() } else { '' }
  if ($version -ne "Python $pythonVersion") {
    $archiveName = [string]$record.archive
    $toolRoot = Join-Path $env:LOCALAPPDATA "MaterialDesigner\toolchain\python-$pythonVersion"
    $pythonExe = Join-Path $toolRoot 'python.exe'
    if (-not (Test-Path -LiteralPath $pythonExe)) {
      Write-Phase "Installing the pinned Python $pythonVersion embeddable archive from python.org"
      $tempRoot = Join-Path ([IO.Path]::GetTempPath()) ("material-designer-python312-{0}" -f ([guid]::NewGuid().ToString('N')))
      New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null
      try {
        $archive = Join-Path $tempRoot $archiveName
        Invoke-WebRequest -UseBasicParsing -Uri $record.source -OutFile $archive -TimeoutSec 180
        $expected = [string]$record.sha256
        if ((Get-Sha256 $archive) -ne $expected.ToLowerInvariant()) { throw "Python $pythonVersion archive hash mismatch for $archiveName" }
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $toolRoot) | Out-Null
        if (Test-Path -LiteralPath $toolRoot) { Remove-Item -LiteralPath $toolRoot -Recurse -Force }
        Expand-Archive -LiteralPath $archive -DestinationPath $toolRoot -Force
      } finally {
        if (Test-Path -LiteralPath $tempRoot) { Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue }
      }
    }
    if (-not (Test-Path -LiteralPath $pythonExe)) { throw "the pinned Python $pythonVersion archive did not contain python.exe" }
    $env:Path = "$toolRoot;$env:Path"
    $python = Get-Command python.exe -ErrorAction SilentlyContinue
    $version = if ($python) { (& $python.Source --version 2>&1).ToString().Trim() } else { '' }
  }
  if ($version -ne "Python $pythonVersion") { throw "expected Python $pythonVersion, found '$version' after bootstrap" }
  Write-Phase "Using $version"
}

function Ensure-NativeCompiler {
  $record = Get-DependencyRecord 'Microsoft C++ build tools'
  $vswhere = Get-Command vswhere.exe -ErrorAction SilentlyContinue
  if (-not $vswhere) {
    $standardVswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
    if (Test-Path -LiteralPath $standardVswhere -PathType Leaf) {
      $vswhere = Get-Command -Name $standardVswhere -CommandType Application -ErrorAction Stop
    }
  }

  function Get-ExactVsInstall {
    if (-not $vswhere) { return $null }
    $lower = [version]$record.version
    $upper = "{0}.{1}.0" -f $lower.Major, ($lower.Minor + 1)
    $versionRange = "[$($record.version),$upper)"
    $installPath = & $vswhere.Source -latest -version $versionRange -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>$null | Select-Object -First 1
    $installVersion = & $vswhere.Source -latest -version $versionRange -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationVersion 2>$null | Select-Object -First 1
    if ($installVersion -like "$($record.version).*" -and $installPath) { return [string]$installPath }
    return $null
  }

  function Load-ExactVcvars([string]$InstallPath) {
    if ([string]::IsNullOrWhiteSpace($InstallPath)) { return $false }
    $vcvars = Join-Path $InstallPath 'VC\Auxiliary\Build\vcvars64.bat'
    if (-not (Test-Path -LiteralPath $vcvars -PathType Leaf)) { return $false }
    Write-Phase "Loading the exact MSVC $($record.version) environment from $vcvars"
    $envDump = & cmd.exe /d /s /c "`"$vcvars`" >nul && set"
    foreach ($line in $envDump) {
      if ($line -match '^(?<name>[^=]+)=(?<value>.*)$') { [Environment]::SetEnvironmentVariable($Matches.name, $Matches.value, 'Process') }
    }
    return $true
  }

  $exactInstall = Get-ExactVsInstall
  $cl = $null
  if (Load-ExactVcvars $exactInstall) { $cl = Get-Command cl.exe -ErrorAction SilentlyContinue }
  if (-not $cl) {
    $tempRoot = Join-Path ([IO.Path]::GetTempPath()) ("material-designer-msvc-{0}" -f ([guid]::NewGuid().ToString('N')))
    New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null
    try {
      $installer = Join-Path $tempRoot ([string]$record.archive)
      Write-Phase "Installing the pinned Microsoft C++ build tools $($record.version) bootstrapper"
      Invoke-WebRequest -UseBasicParsing -Uri $record.source -OutFile $installer -TimeoutSec 300
      $actualHash = Get-Sha256 $installer
      if ($actualHash -ne ([string]$record.sha256).ToLowerInvariant()) { throw "Microsoft C++ build tools bootstrapper hash mismatch for $($record.archive)" }
      $vsInstall = Join-Path $env:LOCALAPPDATA 'MaterialDesigner\vs-build-tools'
      $installArgs = ([string]$record.installArguments).Replace('<user-scoped-path>', "`"$vsInstall`"")
      if ([string]::IsNullOrWhiteSpace($installArgs)) { throw 'the C++ build-tools record has no installation arguments' }
      $process = Start-Process -FilePath $installer -ArgumentList $installArgs -Wait -PassThru -WindowStyle Hidden
      if ($process.ExitCode -ne 0) { throw "Microsoft C++ build tools bootstrapper exited with code $($process.ExitCode)" }
      Refresh-Path
      $exactInstall = Get-ExactVsInstall
      if (-not (Load-ExactVcvars $exactInstall)) { throw "the exact Microsoft C++ build tools $($record.version) installation was not discoverable after bootstrap" }
      $cl = Get-Command cl.exe -ErrorAction SilentlyContinue
    } finally {
      if (Test-Path -LiteralPath $tempRoot) { Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue }
    }
  }
  if (-not $cl) {
    throw "MSVC cl.exe is missing; install Visual Studio 2022 Build Tools with the Desktop C++ workload before a native build"
  }
  Write-Phase "Using MSVC compiler $($cl.Source)"
}

Ensure-Node24
Ensure-Pnpm
Ensure-Python312
Ensure-NativeCompiler

if (-not $SkipBuild) {
  Invoke-Checked 'pnpm.cmd' @('--dir', $design, 'install', '--frozen-lockfile') 'Installing the locked workspace dependencies'
  Invoke-Checked 'pnpm.cmd' @('--dir', $design, '--filter', '@open-design/daemon', 'run', 'build') 'Building the daemon package'
  Invoke-Checked 'pnpm.cmd' @('--dir', $design, '--filter', '@open-design/desktop', 'run', 'build') 'Building the desktop package'
  Invoke-Checked 'pnpm.cmd' @('--dir', $design, '--filter', '@open-design/web', 'run', 'build:sidecar') 'Building the web sidecar'
  Invoke-Checked 'pnpm.cmd' @('--dir', $design, '--filter', '@open-design/tools-pack', 'run', 'build') 'Building the supported packaging tool'
  $sha = (& git -C $repo rev-parse HEAD).Trim()
  $manifest = [ordered]@{
    schemaVersion = 1
    commit = $sha
    completedAt = (Get-Date).ToUniversalTime().ToString('o')
    node = (& node.exe --version).Trim()
    pnpm = (& pnpm.cmd --version).Trim()
    python = (& python.exe --version 2>&1).ToString().Trim()
    outputs = @(
      'design/apps/daemon/dist',
      'design/apps/desktop/dist',
      'design/apps/web/dist',
      'design/tools/pack/dist'
    )
  }
  $manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $stateRoot 'build-manifest.json') -Encoding utf8
  Write-Phase "Build manifest written to .yum-tong/build/build-manifest.json"
}

if ($Launch) {
  $entry = Join-Path $design 'apps/desktop/dist/main/index.js'
  if (-not (Test-Path -LiteralPath $entry)) { throw "built desktop entry was not found at $entry" }
  Write-Phase "Launching the built desktop entry"
  Start-Process -FilePath 'node.exe' -ArgumentList @($entry) -WorkingDirectory $design
}

Write-Phase 'Build complete; no installer or release was published by this script'

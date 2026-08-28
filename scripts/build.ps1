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

# The root entry point owns dependency acquisition. Calling the same helper
# here keeps direct PowerShell callers on the same fresh-machine path.
if ($env:YUM_TONG_DEPENDENCIES_READY -ne '1') {
  & (Join-Path $PSScriptRoot 'download-dependencies.ps1') -Silent
  if (-not $?) { throw 'dependency bootstrap did not complete successfully' }
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

function Ensure-WingetPackage([string]$Id, [string]$Name) {
  if (-not (Get-Command winget.exe -ErrorAction SilentlyContinue)) {
    throw "$Name is missing and winget.exe is unavailable; the dependency cannot be bootstrapped automatically"
  }
  Write-Phase "Installing missing $Name from the Windows package catalog ($Id)"
  & winget.exe install --id $Id --exact --scope user --silent --accept-source-agreements --accept-package-agreements
  if ($LASTEXITCODE -ne 0) { throw "winget could not install $Name ($Id); exit code $LASTEXITCODE" }
  Refresh-Path
}

function Ensure-Node24 {
  $node = Get-Command node.exe -ErrorAction SilentlyContinue
  $version = if ($node) { (& $node.Source --version 2>$null).Trim() } else { '' }
  if ($version -notmatch '^v24\.') {
    # The Windows package catalogue may offer a newer major line than the
    # workspace allows.  Keep the machine install untouched and materialise the
    # newest Node 24 archive from nodejs.org in a user-scoped toolchain instead.
    $toolRoot = Join-Path $env:LOCALAPPDATA 'MaterialDesigner\toolchain\node-v24'
    $nodeExe = Join-Path $toolRoot 'node.exe'
    if (-not (Test-Path -LiteralPath $nodeExe)) {
      Write-Phase 'Installing the newest Node 24 portable archive from nodejs.org'
      $indexResponse = Invoke-WebRequest -UseBasicParsing -Uri 'https://nodejs.org/dist/index.json' -TimeoutSec 60
      $index = $indexResponse.Content | ConvertFrom-Json
      $release = $index | Where-Object { $_.version -match '^v24\.' -and $_.lts } | Select-Object -First 1
      if (-not $release) { $release = $index | Where-Object { $_.version -match '^v24\.' } | Select-Object -First 1 }
      if (-not $release) { throw 'nodejs.org did not publish a Node 24 release in index.json' }
      $versionName = $release.version
      $archiveName = "node-$versionName-win-x64.zip"
      $tempRoot = Join-Path ([IO.Path]::GetTempPath()) ("material-designer-node24-{0}" -f ([guid]::NewGuid().ToString('N')))
      New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null
      try {
        $archive = Join-Path $tempRoot $archiveName
        $sums = Join-Path $tempRoot 'SHASUMS256.txt'
        Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/$versionName/$archiveName" -OutFile $archive -TimeoutSec 180
        Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/$versionName/SHASUMS256.txt" -OutFile $sums -TimeoutSec 60
        $expected = (Select-String -LiteralPath $sums -Pattern ([regex]::Escape($archiveName)) | Select-Object -First 1).Line -split '\s+' | Select-Object -First 1
        $actual = Get-Sha256 $archive
        if ([string]::IsNullOrWhiteSpace($expected) -or $actual -ne $expected.ToLowerInvariant()) { throw "Node 24 archive hash mismatch for $archiveName" }
        $extractRoot = Join-Path $tempRoot 'extract'
        Expand-Archive -LiteralPath $archive -DestinationPath $extractRoot -Force
        $source = Join-Path $extractRoot ("node-$versionName-win-x64")
        if (-not (Test-Path -LiteralPath (Join-Path $source 'node.exe'))) { throw 'Node 24 archive did not contain node.exe' }
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
  if ($version -notmatch '^v24\.') { throw "expected Node 24, found '$version' after bootstrap" }
  Write-Phase "Using $version"
}

function Ensure-Pnpm {
  $pnpmRoot = Join-Path $env:LOCALAPPDATA 'MaterialDesigner\toolchain'
  $env:Path = "$pnpmRoot;$(Join-Path $pnpmRoot 'node_modules\.bin');$env:Path"
  $pnpm = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
  $version = if ($pnpm) { (& $pnpm.Source --version 2>$null).Trim() } else { '' }
  if ($version -ne '10.33.2') {
    $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if (-not $npm) { throw "pnpm 10.33.2 is missing and npm.cmd is unavailable" }
    Invoke-Checked $npm.Source @('--prefix', $pnpmRoot, 'install', '--global', 'pnpm@10.33.2') 'Installing pnpm 10.33.2'
    $toolchainPath = $env:Path
    Refresh-Path
    $env:Path = "$pnpmRoot;$(Join-Path $pnpmRoot 'node_modules\.bin');$toolchainPath;$env:Path"
    $pnpm = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
    $version = if ($pnpm) { (& $pnpm.Source --version 2>$null).Trim() } else { '' }
  }
  if ($version -ne '10.33.2') { throw "expected pnpm 10.33.2, found '$version' after bootstrap" }
  Write-Phase "Using pnpm $version"
}

function Ensure-Python312 {
  $python = Get-Command python.exe -ErrorAction SilentlyContinue
  $version = if ($python) { (& $python.Source --version 2>&1).ToString().Trim() } else { '' }
  if ($version -notmatch '^Python 3\.12\.') {
    try { Ensure-WingetPackage 'Python.Python.3.12' 'Python 3.12' } catch { Write-Phase "Package catalog did not provide a usable Python 3.12: $($_.Exception.Message)" }
    $python = Get-Command python.exe -ErrorAction SilentlyContinue
    $version = if ($python) { (& $python.Source --version 2>&1).ToString().Trim() } else { '' }
  }
  if ($version -notmatch '^Python 3\.12\.') {
    $pythonVersion = '3.12.10'
    $archiveName = "python-$pythonVersion-embed-amd64.zip"
    $toolRoot = Join-Path $env:LOCALAPPDATA "MaterialDesigner\toolchain\python-$pythonVersion"
    $pythonExe = Join-Path $toolRoot 'python.exe'
    if (-not (Test-Path -LiteralPath $pythonExe)) {
      Write-Phase 'Installing the pinned Python 3.12 embeddable archive from python.org'
      $tempRoot = Join-Path ([IO.Path]::GetTempPath()) ("material-designer-python312-{0}" -f ([guid]::NewGuid().ToString('N')))
      New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null
      try {
        $archive = Join-Path $tempRoot $archiveName
        Invoke-WebRequest -UseBasicParsing -Uri "https://www.python.org/ftp/python/$pythonVersion/$archiveName" -OutFile $archive -TimeoutSec 180
        $expected = '4ACBED6DD1C744B0376E3B1CF57CE906F9DC9E95E68824584C8099A63025A3C3'.ToLowerInvariant()
        if ((Get-Sha256 $archive) -ne $expected) { throw "Python 3.12 archive hash mismatch for $archiveName" }
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $toolRoot) | Out-Null
        if (Test-Path -LiteralPath $toolRoot) { Remove-Item -LiteralPath $toolRoot -Recurse -Force }
        Expand-Archive -LiteralPath $archive -DestinationPath $toolRoot -Force
      } finally {
        if (Test-Path -LiteralPath $tempRoot) { Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue }
      }
    }
    if (-not (Test-Path -LiteralPath $pythonExe)) { throw 'the pinned Python 3.12 archive did not contain python.exe' }
    $env:Path = "$toolRoot;$env:Path"
    $python = Get-Command python.exe -ErrorAction SilentlyContinue
    $version = if ($python) { (& $python.Source --version 2>&1).ToString().Trim() } else { '' }
  }
  if ($version -notmatch '^Python 3\.12\.') { throw "expected Python 3.12, found '$version' after bootstrap" }
  Write-Phase "Using $version"
}

function Ensure-NativeCompiler {
  $cl = Get-Command cl.exe -ErrorAction SilentlyContinue
  if (-not $cl) {
    if (Get-Command winget.exe -ErrorAction SilentlyContinue) {
      $vsInstall = Join-Path $env:LOCALAPPDATA 'MaterialDesigner\vs-build-tools'
      Write-Phase 'Installing the missing Visual Studio 2022 C++ workload from the Windows package catalog'
      & winget.exe install --id Microsoft.VisualStudio.2022.BuildTools --exact --scope user --silent --accept-source-agreements --accept-package-agreements --override "--wait --norestart --installPath `"$vsInstall`" --add Microsoft.VisualStudio.Workload.VCTools;includeRecommended"
      if ($LASTEXITCODE -eq 0) { Refresh-Path; $cl = Get-Command cl.exe -ErrorAction SilentlyContinue }
    }
  }
  if (-not $cl) {
    $vswhere = Get-Command vswhere.exe -ErrorAction SilentlyContinue
    if ($vswhere) {
      $install = & $vswhere.Source -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>$null | Select-Object -First 1
      if ($install) {
        $vcvars = Join-Path $install 'VC\Auxiliary\Build\vcvars64.bat'
        if (Test-Path -LiteralPath $vcvars) {
          $envDump = & cmd.exe /d /s /c "`"$vcvars`" >nul && set"
          foreach ($line in $envDump) {
            if ($line -match '^(?<name>[^=]+)=(?<value>.*)$') { [Environment]::SetEnvironmentVariable($Matches.name, $Matches.value, 'Process') }
          }
          $cl = Get-Command cl.exe -ErrorAction SilentlyContinue
        }
      }
    }
  }
  if (-not $cl) {
    $vcvarsCandidates = @(
      'C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat',
      'C:\Program Files\Microsoft Visual Studio\18\Enterprise\VC\Auxiliary\Build\vcvars64.bat'
    )
    $vcvars = $vcvarsCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if ($vcvars) {
      Write-Phase "Loading the installed MSVC environment from $vcvars"
      $envDump = & cmd.exe /d /s /c "`"$vcvars`" >nul && set"
      foreach ($line in $envDump) {
        if ($line -match '^(?<name>[^=]+)=(?<value>.*)$') { [Environment]::SetEnvironmentVariable($Matches.name, $Matches.value, 'Process') }
      }
      $cl = Get-Command cl.exe -ErrorAction SilentlyContinue
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

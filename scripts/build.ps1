[CmdletBinding()]
param(
  [switch]$Silent,
  [switch]$Launch,
  [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$design = Join-Path $repo 'design'
$liveSessionRoot = $env:MD_LANG_GUI_LIVE_SESSION_ROOT
$liveNonce = $env:MD_LANG_GUI_LIVE_NONCE
if ([string]::IsNullOrWhiteSpace($liveSessionRoot) -xor [string]::IsNullOrWhiteSpace($liveNonce)) { throw 'Live proof session root and nonce must be supplied together' }
if (-not [string]::IsNullOrWhiteSpace($liveSessionRoot)) {
  $liveSessionRoot = [IO.Path]::GetFullPath($liveSessionRoot)
  if (-not (Test-Path -LiteralPath $liveSessionRoot -PathType Container)) { throw 'Live proof session root does not exist' }
  if ((Get-Item -LiteralPath $liveSessionRoot -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Live proof session root is a reparse point' }
  if ($liveNonce -notmatch '^[0-9a-f]{64}$') { throw 'Live proof nonce is invalid' }
  $stateRoot = Join-Path $liveSessionRoot 'build'
} else {
  $stateRoot = Join-Path $repo '.yum-tong\build'
}
New-Item -ItemType Directory -Force -Path $stateRoot | Out-Null
$started = Get-Date
New-Item -ItemType Directory -Force -Path $stateRoot | Out-Null

function Write-Phase([string]$Message) {
  if ($Silent) { return }
  $elapsed = ((Get-Date) - $started).ToString('hh\:mm\:ss')
  Write-Host "[$elapsed] $Message"
}

function Refresh-Path {
  if (-not [string]::IsNullOrWhiteSpace($liveSessionRoot)) { return }
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
  (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Get-TreeIdentity([string]$RootPath, [string]$RelativePath) {
  $full = [IO.Path]::GetFullPath((Join-Path $RootPath $RelativePath)).TrimEnd('\')
  if (-not (Test-Path -LiteralPath $full -PathType Container)) { throw "Build output is missing: $RelativePath" }
  $files = @(Get-ChildItem -LiteralPath $full -Recurse -File | Sort-Object { $_.FullName.Substring($full.Length).TrimStart('\') })
  if ($files.Count -eq 0) { throw "Build output is empty: $RelativePath" }
  $sha = [Security.Cryptography.SHA256]::Create()
  $total = [int64]0
  try {
    foreach ($file in $files) {
      $relative = $file.FullName.Substring($full.Length).TrimStart('\').Replace('\', '/')
      $fileHash = Get-Sha256 $file.FullName
      $line = [Text.Encoding]::UTF8.GetBytes("$relative`0$($file.Length)`0$fileHash`n")
      [void]$sha.TransformBlock($line, 0, $line.Length, $line, 0)
      $total += $file.Length
    }
    [void]$sha.TransformFinalBlock([byte[]]::new(0), 0, 0)
    return [ordered]@{ path = $RelativePath.Replace('\', '/'); fileCount = $files.Count; totalBytes = $total; sha256 = ([BitConverter]::ToString($sha.Hash)).Replace('-', '').ToLowerInvariant() }
  } finally { $sha.Dispose() }
}

function Ensure-WingetPackage([string]$Id, [string]$Name) {
  if (-not (Get-Command winget.exe -ErrorAction SilentlyContinue)) {
    throw "$Name is missing and winget.exe is unavailable; the dependency cannot be bootstrapped automatically"
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
    $env:Path = "$toolRoot;$env:Path"
    $node = Get-Command node.exe -ErrorAction SilentlyContinue
    $version = if ($node) { (& $node.Source --version 2>$null).Trim() } else { '' }
  }
  if ($version -ne $expectedVersion) { throw "expected Node.js $expectedVersion, found '$version' after bootstrap" }
  Write-Phase "Using $version"
}

function Ensure-Pnpm {
  if (-not [string]::IsNullOrWhiteSpace($liveSessionRoot)) {
    $pnpm = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
    $version = if ($pnpm) { (& $pnpm.Source --version 2>$null).Trim() } else { '' }
    if ($version -ne '10.33.2') { throw "live proof requires the prevalidated pnpm 10.33.2 command; found '$version'" }
    Write-Phase "Using prevalidated pnpm $version"
    return
  }
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

# Reads the record the dependency bootstrap publishes and re-checks it rather
# than trusting it: a stale record points at a toolchain that has since been
# removed or at a manifest that has since changed, and every version assertion
# below would then be checking the wrong tools. Also re-applies the recorded
# compiler environment, so a native build in this process sees the same INCLUDE
# and LIB the bootstrap resolved.
function Read-VerifiedDependencyResolution {
  $resolutionPath = Join-Path $repo '.yum-tong\build\dependency-resolution.json'
  if (-not (Test-Path -LiteralPath $resolutionPath -PathType Leaf)) {
    throw "the dependency resolution record is missing: $resolutionPath"
  }
  $record = Get-Content -Raw -LiteralPath $resolutionPath | ConvertFrom-Json
  if ($null -eq $record -or $record.schemaVersion -ne 1) {
    throw 'the dependency resolution record has an unsupported schema version'
  }
  $manifestPath = Join-Path $repo 'dependencies.manifest.json'
  if ((Get-Sha256 $manifestPath) -ne ([string]$record.manifestSha256).ToLowerInvariant()) {
    throw 'the dependency resolution record is stale for the current dependency manifest; delete .yum-tong\build and re-run'
  }
  foreach ($name in @('git', 'node', 'pnpm', 'python')) {
    $tool = $record.tools.$name
    if ($null -eq $tool -or [string]::IsNullOrWhiteSpace([string]$tool.executable)) {
      throw "the dependency resolution record has no $name executable"
    }
    if (-not (Test-Path -LiteralPath ([string]$tool.executable) -PathType Leaf)) {
      throw "the resolved $name executable is missing: $($tool.executable)"
    }
  }
  if ($null -eq $record.compiler -or [string]::IsNullOrWhiteSpace([string]$record.compiler.clPath)) {
    throw 'the dependency resolution record has no compiler'
  }
  if ($null -ne $record.compiler.environment) {
    foreach ($property in $record.compiler.environment.psobject.Properties) {
      [Environment]::SetEnvironmentVariable($property.Name, [string]$property.Value, 'Process')
    }
  }
  return $record
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
  $external = $null
  if (-not [string]::IsNullOrWhiteSpace($provenanceFile)) {
    if (-not (Test-Path -LiteralPath $provenanceFile -PathType Leaf)) { throw "external provenance file was not found: $provenanceFile" }
    $external = Get-Content -Raw -LiteralPath $provenanceFile | ConvertFrom-Json
  } elseif (-not [string]::IsNullOrWhiteSpace($env:OD_BUILD_VERSION) -or
            -not [string]::IsNullOrWhiteSpace($env:OD_BUILD_SOURCE_COMMIT) -or
            -not [string]::IsNullOrWhiteSpace($env:OD_BUILD_UPDATED_AT)) {
    $external = [pscustomobject]@{
      schemaVersion = 1
      sourceCommit = $env:OD_BUILD_SOURCE_COMMIT
      version = $env:OD_BUILD_VERSION
      updatedAt = $env:OD_BUILD_UPDATED_AT
    }
  }
  if ($null -ne $external) {
    $package = Get-Content -Raw -LiteralPath (Join-Path $design 'package.json') | ConvertFrom-Json
    if ($null -eq $external -or $external.schemaVersion -ne 1 -or $external.sourceCommit -ne $sha -or $external.version -ne $package.version -or [string]::IsNullOrWhiteSpace($external.updatedAt)) {
      if (-not [string]::IsNullOrWhiteSpace($provenanceFile)) { throw 'external provenance must contain schemaVersion 1, the exact source commit, the exact package version, and a non-empty updatedAt value' }
      Write-Warning 'The supplied hosted provenance was incomplete; build provenance remains unavailable.'
      $external = $null
    }
  }
  if ($null -ne $external) {
    try { [DateTimeOffset]::Parse($external.updatedAt) | Out-Null } catch {
      if (-not [string]::IsNullOrWhiteSpace($provenanceFile)) { throw 'external provenance updatedAt is not a valid timestamp' }
      Write-Warning 'The supplied hosted provenance timestamp was invalid; build provenance remains unavailable.'
      $external = $null
    }
  }
  if ($null -ne $external) {
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
    outputTrees = @(
      Get-TreeIdentity $repo 'design/apps/daemon/dist'
      Get-TreeIdentity $repo 'design/apps/desktop/dist'
      Get-TreeIdentity $repo 'design/apps/web/dist'
      Get-TreeIdentity $repo 'design/tools/pack/dist'
    )
  }
  if (-not [string]::IsNullOrWhiteSpace($liveSessionRoot)) { $manifest.liveProof = [ordered]@{ nonce = $liveNonce; sessionRoot = $liveSessionRoot; producer = 'scripts/build.ps1' } }
  $manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $stateRoot 'build-manifest.json') -Encoding utf8
  Write-Phase "Build manifest written to .yum-tong/build/build-manifest.json"
}

if ($Launch) {
  $entry = Join-Path $design 'apps/desktop/dist/main/index.js'
  if (-not (Test-Path -LiteralPath $entry)) { throw "built desktop entry was not found at $entry" }
  Write-Phase 'Launching the built desktop entry'
  Start-Process -FilePath $nodePath -ArgumentList @($entry) -WorkingDirectory $design
}

Write-Phase 'Build complete; no installer or release was published by this script'

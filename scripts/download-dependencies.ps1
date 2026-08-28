[CmdletBinding()]
param(
  [switch]$Silent
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $repo 'dependencies.manifest.json'
$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
$started = Get-Date
$interactive = -not $Silent

function Assert-ManifestUrl([object]$Spec, [string[]]$AllowedHosts) {
  if ([string]::IsNullOrWhiteSpace($Spec.id) -or [string]::IsNullOrWhiteSpace($Spec.version) -or
      [string]::IsNullOrWhiteSpace($Spec.url) -or [string]::IsNullOrWhiteSpace($Spec.format)) {
    throw "dependency manifest entry is incomplete: $($Spec.id)"
  }
  try { $uri = [Uri]$Spec.url } catch { throw "dependency manifest URL is invalid for $($Spec.id): $($Spec.url)" }
  if ($uri.Scheme -ne 'https' -or $uri.UserInfo.Length -ne 0 -or $uri.Port -notin @(-1, 443) -or $AllowedHosts -notcontains $uri.Host.ToLowerInvariant()) {
    throw "dependency manifest URL is not an approved canonical HTTPS source for $($Spec.id): $($Spec.url)"
  }
  $hasSha256 = -not [string]::IsNullOrWhiteSpace([string]$Spec.sha256)
  $hasSha512 = -not [string]::IsNullOrWhiteSpace([string]$Spec.sha512Base64)
  if (($hasSha256 -and $hasSha512) -or (-not $hasSha256 -and -not $hasSha512)) {
    throw "dependency manifest entry must contain exactly one digest for $($Spec.id)"
  }
  if ($hasSha256 -and [string]$Spec.sha256 -notmatch '^[0-9a-fA-F]{64}$') { throw "dependency manifest SHA-256 is invalid for $($Spec.id)" }
  if ($hasSha512 -and [string]$Spec.sha512Base64 -notmatch '^[A-Za-z0-9+/]+={0,2}$') { throw "dependency manifest SHA-512 is invalid for $($Spec.id)" }
}

function Assert-DependencyManifest {
  if ($null -eq $manifest -or $manifest.schemaVersion -ne 1) { throw 'dependency manifest schemaVersion must be exactly 1' }
  $windows = @($manifest.platforms.'windows-x64')
  $linux = @($manifest.platforms.'linux-x64')
  if ($windows.Count -ne 4 -or (@($windows.id) -join ',') -ne 'git,node,pnpm,python') { throw 'windows-x64 manifest must contain exactly git,node,pnpm,python in order' }
  if ($linux.Count -ne 2 -or (@($linux.id) -join ',') -ne 'node,pnpm') { throw 'linux-x64 manifest must contain exactly node,pnpm in order' }
  Assert-ManifestUrl $windows[0] @('github.com')
  Assert-ManifestUrl $windows[1] @('nodejs.org')
  Assert-ManifestUrl $windows[2] @('registry.npmjs.org')
  Assert-ManifestUrl $windows[3] @('python.org')
  Assert-ManifestUrl $linux[0] @('nodejs.org')
  Assert-ManifestUrl $linux[1] @('registry.npmjs.org')
  if ($windows[0].format -ne 'zip' -or $windows[1].format -ne 'zip' -or $windows[2].format -ne 'npm-tarball' -or $windows[3].format -ne 'zip') { throw 'windows-x64 manifest formats are invalid' }
  if ($linux[0].format -ne 'tar.xz' -or $linux[1].format -ne 'npm-tarball') { throw 'linux-x64 manifest formats are invalid' }
  if ($manifest.compiler.id -ne 'visual-studio-build-tools' -or $manifest.compiler.version -ne '2022' -or
      $manifest.compiler.source -ne 'winget:Microsoft.VisualStudio.2022.BuildTools' -or
      $manifest.compiler.requiredWorkload -ne 'Microsoft.VisualStudio.Workload.VCTools') {
    throw 'compiler manifest entry is not the pinned Visual Studio 2022 C++ workload'
  }
}

function Write-Phase([string]$Message) {
  if ($Silent) { return }
  $elapsed = ((Get-Date) - $started).ToString('hh\:mm\:ss')
  Write-Host "[$elapsed] $Message"
}

function Get-Sha256([string]$Path) {
  (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Get-Sha512Base64([string]$Path) {
  $hash = [Security.Cryptography.SHA512]::Create()
  try {
    $stream = [IO.File]::OpenRead($Path)
    try { return [Convert]::ToBase64String($hash.ComputeHash($stream)) }
    finally { $stream.Dispose() }
  } finally { $hash.Dispose() }
}

function Download-Verified([object]$Spec, [string]$Destination) {
  $download = "$Destination.download.$([Guid]::NewGuid().ToString('N'))"
  $moved = $false
  try {
    Write-Phase "Downloading $($Spec.id) $($Spec.version) from its canonical source"
    Invoke-WebRequest -UseBasicParsing -Uri $Spec.url -OutFile $download -TimeoutSec 300
    if ($Spec.sha256) {
      $actual = Get-Sha256 $download
      if ($actual -ne $Spec.sha256.ToLowerInvariant()) {
        throw "SHA-256 mismatch for $($Spec.id) $($Spec.version): expected $($Spec.sha256), received $actual"
      }
    }
    if ($Spec.sha512Base64) {
      $actual = Get-Sha512Base64 $download
      if ($actual -ne $Spec.sha512Base64) {
        throw "SHA-512 integrity mismatch for $($Spec.id) $($Spec.version): expected $($Spec.sha512Base64), received $actual"
      }
    }
    Move-Item -LiteralPath $download -Destination $Destination -Force
    $moved = $true
  } finally {
    if (-not $moved) { Remove-Item -LiteralPath $download -Force -ErrorAction SilentlyContinue }
  }
}

function Ensure-InteractiveElevation {
  if (-not $interactive) { return }
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($identity)
  if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { return }
  Write-Phase 'Requesting elevation before the interactive bootstrap begins'
  $argumentList = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"")
  $child = Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList $argumentList -Wait -PassThru
  exit $child.ExitCode
}

function Ensure-ExclusiveLock([string]$Path) {
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Path) | Out-Null
  for ($attempt = 0; $attempt -lt 120; $attempt++) {
    try {
      return [IO.File]::Open($Path, [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    } catch {
      Start-Sleep -Seconds 1
    }
  }
  throw "timed out waiting for dependency bootstrap lock: $Path"
}

function Refresh-ProcessPath {
  $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $user = [Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = "$machine;$user"
}

function Import-CompilerEnvironment([string]$VcvarsPath) {
  if (-not (Test-Path -LiteralPath $VcvarsPath -PathType Leaf)) {
    throw "the compiler environment script is missing: $VcvarsPath"
  }
  $output = & cmd.exe /d /s /c "`"$VcvarsPath`" >nul && set"
  if ($LASTEXITCODE -ne 0) { throw "the compiler environment script failed with exit code $LASTEXITCODE" }
  $environment = [ordered]@{}
  $allowedEnvironmentNames = @(
    'Path', 'INCLUDE', 'LIB', 'LIBPATH', 'VCToolsInstallDir', 'VCToolsVersion',
    'VSINSTALLDIR', 'VisualStudioVersion', 'WindowsSdkDir', 'WindowsSDKVersion',
    'UniversalCRTSdkDir', 'UCRTVersion', 'VSCMD_ARG_TGT_ARCH'
  )
  foreach ($line in $output) {
    if ($line -match '^(?<name>[^=]+)=(?<value>.*)$') {
      if ($allowedEnvironmentNames -contains $Matches.name) {
        $environment[$Matches.name] = $Matches.value
        [Environment]::SetEnvironmentVariable($Matches.name, $Matches.value, 'Process')
      }
    }
  }
  $cl = Get-Command cl.exe -ErrorAction SilentlyContinue
  if ($null -eq $cl) { throw "the compiler environment script completed but cl.exe was not found: $VcvarsPath" }
  return [ordered]@{ clPath = $cl.Source; environment = $environment; vcvarsPath = $VcvarsPath }
}

function Resolve-CompilerEnvironment {
  $cl = Get-Command cl.exe -ErrorAction SilentlyContinue
  if ($null -eq $cl) {
    $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
    if ($null -ne $winget) {
      Write-Phase 'Installing the missing Visual Studio 2022 C++ workload from the canonical Windows package catalog'
      & $winget.Source install --id Microsoft.VisualStudio.2022.BuildTools --exact --scope user --silent --accept-source-agreements --accept-package-agreements --override '--wait --norestart --add Microsoft.VisualStudio.Workload.VCTools;includeRecommended'
      if ($LASTEXITCODE -ne 0) { throw "Visual Studio 2022 workload installation failed with exit code $LASTEXITCODE" }
      Refresh-ProcessPath
      $cl = Get-Command cl.exe -ErrorAction SilentlyContinue
    }
  }
  $vcvars = $null
  $vswhere = Get-Command vswhere.exe -ErrorAction SilentlyContinue
  if ($null -ne $vswhere) {
    $install = (& $vswhere.Source -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>$null | Select-Object -First 1)
    if ($install) { $vcvars = Join-Path $install 'VC\Auxiliary\Build\vcvars64.bat' }
  }
  if ([string]::IsNullOrWhiteSpace($vcvars)) {
    $vcvars = @(
      'C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat',
      'C:\Program Files\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat',
      'C:\Program Files\Microsoft Visual Studio\18\Enterprise\VC\Auxiliary\Build\vcvars64.bat'
    ) | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
  }
  if (-not [string]::IsNullOrWhiteSpace($vcvars)) {
    return Import-CompilerEnvironment $vcvars
  }
  if ($null -ne $cl -and (Test-Path -LiteralPath $cl.Source -PathType Leaf)) {
    return [ordered]@{ clPath = $cl.Source; environment = [ordered]@{}; vcvarsPath = $null }
  }
  throw 'MSVC cl.exe is unavailable after the canonical Visual Studio 2022 workload attempt; the native workspace build cannot continue'
}

Ensure-InteractiveElevation
Assert-DependencyManifest
$toolRoot = Join-Path $env:LOCALAPPDATA 'MaterialDesigner\toolchain'
$lock = Ensure-ExclusiveLock (Join-Path $toolRoot '.download-dependencies.lock')
try {
  if ($env:PROCESSOR_ARCHITECTURE -notin @('AMD64', 'x86_64')) {
    throw "unsupported processor architecture '$env:PROCESSOR_ARCHITECTURE'; this bootstrap supports Windows x64"
  }
  $specs = @($manifest.platforms.'windows-x64')
  New-Item -ItemType Directory -Force -Path $toolRoot | Out-Null

  $gitSpec = $specs | Where-Object id -eq 'git'
  $gitRoot = Join-Path $toolRoot "git-$($gitSpec.version)"
  $gitExe = Join-Path $gitRoot 'cmd\git.exe'
  $gitArchive = Join-Path $toolRoot "git-$($gitSpec.version).zip"
  if (-not (Test-Path -LiteralPath $gitArchive -PathType Leaf) -or (Get-Sha256 $gitArchive) -ne $gitSpec.sha256) {
    Download-Verified $gitSpec $gitArchive
  }
  if (-not (Test-Path -LiteralPath $gitExe)) {
    Write-Phase "Using verified cached Git $($gitSpec.version)"
    $extract = Join-Path $toolRoot "git-$($gitSpec.version).extract"
    Remove-Item -LiteralPath $extract -Recurse -Force -ErrorAction SilentlyContinue
    Expand-Archive -LiteralPath $gitArchive -DestinationPath $extract -Force
    if (-not (Test-Path -LiteralPath (Join-Path $extract 'cmd\git.exe'))) { throw 'MinGit archive did not contain cmd\git.exe' }
    Remove-Item -LiteralPath $gitRoot -Recurse -Force -ErrorAction SilentlyContinue
    Move-Item -LiteralPath $extract -Destination $gitRoot
  }
  $env:Path = "$($gitRoot)\cmd;$($gitRoot)\mingw64\bin;$env:Path"
  $gitVersion = (& $gitExe --version 2>$null).Trim()
  if ($gitVersion -notmatch [regex]::Escape($gitSpec.version)) { throw "expected Git $($gitSpec.version), found '$gitVersion'" }

  $nodeSpec = $specs | Where-Object id -eq 'node'
  $nodeRoot = Join-Path $toolRoot "node-v$($nodeSpec.version)-win-x64"
  $nodeExe = Join-Path $nodeRoot 'node.exe'
  $nodeArchive = Join-Path $toolRoot "node-v$($nodeSpec.version)-win-x64.zip"
  if (-not (Test-Path -LiteralPath $nodeArchive -PathType Leaf) -or (Get-Sha256 $nodeArchive) -ne $nodeSpec.sha256) {
    Download-Verified $nodeSpec $nodeArchive
  }
  if (-not (Test-Path -LiteralPath $nodeExe)) {
    Write-Phase "Using verified cached Node $($nodeSpec.version)"
    $extract = Join-Path $toolRoot "node-v$($nodeSpec.version)-win-x64.extract"
    Remove-Item -LiteralPath $extract -Recurse -Force -ErrorAction SilentlyContinue
    Expand-Archive -LiteralPath $nodeArchive -DestinationPath $extract -Force
    $source = Join-Path $extract "node-v$($nodeSpec.version)-win-x64"
    if (-not (Test-Path -LiteralPath (Join-Path $source 'node.exe'))) { throw 'Node archive did not contain node.exe' }
    Remove-Item -LiteralPath $nodeRoot -Recurse -Force -ErrorAction SilentlyContinue
    Move-Item -LiteralPath $source -Destination $nodeRoot
    Remove-Item -LiteralPath $extract -Recurse -Force -ErrorAction SilentlyContinue
  }
  $env:Path = "$nodeRoot;$env:Path"
  $nodeVersion = (& $nodeExe --version 2>$null).Trim()
  if ($nodeVersion -ne "v$($nodeSpec.version)") { throw "expected Node v$($nodeSpec.version), found '$nodeVersion'" }

  $pnpmSpec = $specs | Where-Object id -eq 'pnpm'
  $pnpmRoot = Join-Path $toolRoot "pnpm-$($pnpmSpec.version)"
  function Find-PnpmExecutable([string]$Root) {
    $candidates = @(
      (Join-Path $Root 'pnpm.cmd'),
      (Join-Path $Root 'node_modules\.bin\pnpm.cmd'),
      (Join-Path $Root 'bin\pnpm.cmd')
    )
    foreach ($candidate in $candidates) {
      if (Test-Path -LiteralPath $candidate -PathType Leaf) { return [IO.Path]::GetFullPath($candidate) }
    }
    $discovered = @(Get-ChildItem -LiteralPath $Root -Filter 'pnpm.cmd' -File -Recurse -ErrorAction SilentlyContinue)
    if ($discovered.Count -gt 0) { return [IO.Path]::GetFullPath([string]$discovered[0].FullName) }
    return $null
  }
  [string]$pnpmCmd = Find-PnpmExecutable $pnpmRoot
  $pnpmTarball = Join-Path $toolRoot "pnpm-$($pnpmSpec.version).tgz"
  if (-not (Test-Path -LiteralPath $pnpmTarball -PathType Leaf) -or (Get-Sha512Base64 $pnpmTarball) -ne $pnpmSpec.sha512Base64) {
    Download-Verified $pnpmSpec $pnpmTarball
  }
  if ([string]::IsNullOrWhiteSpace($pnpmCmd) -or -not (Test-Path -LiteralPath $pnpmCmd -PathType Leaf)) {
    Write-Phase "Using verified cached pnpm $($pnpmSpec.version) tarball"
    New-Item -ItemType Directory -Force -Path $pnpmRoot | Out-Null
    $npm = Join-Path $nodeRoot 'npm.cmd'
    if (-not (Test-Path -LiteralPath $npm)) { throw 'the pinned Node archive did not contain npm.cmd' }
    & $npm install --prefix $pnpmRoot --global $pnpmTarball --ignore-scripts --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw "npm could not materialize pnpm $($pnpmSpec.version), exit code $LASTEXITCODE" }
  }
  $pnpmCmd = Find-PnpmExecutable $pnpmRoot
  if ([string]::IsNullOrWhiteSpace($pnpmCmd)) { throw "pnpm $($pnpmSpec.version) was installed but pnpm.cmd was not materialized" }
  $env:Path = "$(Split-Path -Parent $pnpmCmd);$pnpmRoot;$pnpmRoot\node_modules\.bin;$env:Path"
  $pnpmVersion = (& $pnpmCmd --version 2>$null).Trim()
  if ($pnpmVersion -ne $pnpmSpec.version) { throw "expected pnpm $($pnpmSpec.version), found '$pnpmVersion'" }

  $pythonSpec = $specs | Where-Object id -eq 'python'
  $pythonRoot = Join-Path $toolRoot "python-$($pythonSpec.version)"
  $pythonExe = Join-Path $pythonRoot 'python.exe'
  $pythonArchive = Join-Path $toolRoot "python-$($pythonSpec.version)-embed-amd64.zip"
  if (-not (Test-Path -LiteralPath $pythonArchive -PathType Leaf) -or (Get-Sha256 $pythonArchive) -ne $pythonSpec.sha256) {
    Download-Verified $pythonSpec $pythonArchive
  }
  if (-not (Test-Path -LiteralPath $pythonExe)) {
    Write-Phase "Using verified cached Python $($pythonSpec.version)"
    Remove-Item -LiteralPath $pythonRoot -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Force -Path $pythonRoot | Out-Null
    Expand-Archive -LiteralPath $pythonArchive -DestinationPath $pythonRoot -Force
  }
  $pythonVersion = (& $pythonExe --version 2>&1).ToString().Trim()
  if ($pythonVersion -ne "Python $($pythonSpec.version)") { throw "expected Python $($pythonSpec.version), found '$pythonVersion'" }
  $env:Path = "$pythonRoot;$env:Path"

  $compiler = Resolve-CompilerEnvironment
  $resolutionDir = Join-Path $repo '.yum-tong\build'
  New-Item -ItemType Directory -Force -Path $resolutionDir | Out-Null
  $resolution = [ordered]@{
    schemaVersion = 1
    manifestPath = [IO.Path]::GetFullPath($manifestPath)
    manifestSha256 = Get-Sha256 $manifestPath
    tools = [ordered]@{
      git = [ordered]@{ archive = [IO.Path]::GetFullPath($gitArchive); executable = [IO.Path]::GetFullPath($gitExe); sha256 = $gitSpec.sha256; version = $gitSpec.version }
      node = [ordered]@{ archive = [IO.Path]::GetFullPath($nodeArchive); executable = [IO.Path]::GetFullPath($nodeExe); sha256 = $nodeSpec.sha256; version = $nodeSpec.version }
      pnpm = [ordered]@{ archive = [IO.Path]::GetFullPath($pnpmTarball); executable = [IO.Path]::GetFullPath($pnpmCmd); sha512Base64 = $pnpmSpec.sha512Base64; version = $pnpmSpec.version }
      python = [ordered]@{ archive = [IO.Path]::GetFullPath($pythonArchive); executable = [IO.Path]::GetFullPath($pythonExe); sha256 = $pythonSpec.sha256; version = $pythonSpec.version }
    }
    compiler = [ordered]@{ clPath = [IO.Path]::GetFullPath($compiler.clPath); environment = $compiler.environment; version = $manifest.compiler.version; vcvarsPath = $compiler.vcvarsPath }
  }
  $resolution | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $resolutionDir 'dependency-resolution.json') -Encoding utf8
  Write-Phase "Dependencies ready: Git $($gitSpec.version), Node $($nodeSpec.version), pnpm $($pnpmSpec.version), Python $($pythonSpec.version), and MSVC"
} finally {
  if ($null -ne $lock) { $lock.Dispose() }
}

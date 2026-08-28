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
  $download = "$Destination.download"
  Remove-Item -LiteralPath $download -Force -ErrorAction SilentlyContinue
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

Ensure-InteractiveElevation
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
  $pnpmCmd = @(
    (Join-Path $pnpmRoot 'pnpm.cmd'),
    (Join-Path $pnpmRoot 'node_modules\.bin\pnpm.cmd'),
    (Join-Path $pnpmRoot 'bin\pnpm.cmd')
  ) | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
  $pnpmTarball = Join-Path $toolRoot "pnpm-$($pnpmSpec.version).tgz"
  if (-not (Test-Path -LiteralPath $pnpmTarball -PathType Leaf) -or (Get-Sha512Base64 $pnpmTarball) -ne $pnpmSpec.sha512Base64) {
    Download-Verified $pnpmSpec $pnpmTarball
  }
  if (-not (Test-Path -LiteralPath $pnpmCmd)) {
    Write-Phase "Using verified cached pnpm $($pnpmSpec.version) tarball"
    New-Item -ItemType Directory -Force -Path $pnpmRoot | Out-Null
    $npm = Join-Path $nodeRoot 'npm.cmd'
    if (-not (Test-Path -LiteralPath $npm)) { throw 'the pinned Node archive did not contain npm.cmd' }
    & $npm install --prefix $pnpmRoot --global $pnpmTarball --ignore-scripts --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw "npm could not materialize pnpm $($pnpmSpec.version), exit code $LASTEXITCODE" }
  }
  if ([string]::IsNullOrWhiteSpace($pnpmCmd)) {
    $pnpmCmd = Get-ChildItem -LiteralPath $pnpmRoot -Filter 'pnpm.cmd' -File -Recurse -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName -First 1
  }
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

  if (-not (Get-Command cl.exe -ErrorAction SilentlyContinue)) {
    $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
    if ($winget) {
      Write-Phase 'Installing the missing Visual Studio 2022 C++ workload from the canonical Windows package catalog'
      & $winget.Source install --id Microsoft.VisualStudio.2022.BuildTools --exact --scope user --silent --accept-source-agreements --accept-package-agreements --override '--wait --norestart --add Microsoft.VisualStudio.Workload.VCTools;includeRecommended'
      if ($LASTEXITCODE -eq 0) { Write-Phase 'Visual Studio Build Tools installer completed; the next build resolves its compiler environment' }
    }
  }
  if (-not (Get-Command cl.exe -ErrorAction SilentlyContinue)) {
    throw 'MSVC cl.exe is unavailable after the canonical Visual Studio 2022 workload attempt; the native workspace build cannot continue'
  }
  Write-Phase "Dependencies ready: Git $($gitSpec.version), Node $($nodeSpec.version), pnpm $($pnpmSpec.version), Python $($pythonSpec.version), and MSVC"
} finally {
  if ($null -ne $lock) { $lock.Dispose() }
}

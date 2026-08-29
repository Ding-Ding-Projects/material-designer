[CmdletBinding()]
param(
  [switch]$SelfTest,
  [switch]$Update,
  [switch]$RequireCentralMount
)

$ErrorActionPreference = 'Stop'
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$manifestPath = Join-Path $repoRoot 'site/assets/data/docs-manifest.json'
$bundlePath = Join-Path $repoRoot 'design/apps/web/src/lib/docs/generated.ts'
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('offline-docs-' + [Guid]::NewGuid().ToString('N'))
$tempManifest = Join-Path $tempRoot 'docs-manifest.json'
$tempBundle = Join-Path $tempRoot 'generated.ts'

function Invoke-Step([string]$Name, [string]$Script, [string[]]$Arguments) {
  Write-Output ('RUN: ' + $Name)
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot $Script) @Arguments
  if ($LASTEXITCODE -ne 0) { throw "Offline documentation verification stopped at $Name with exit code $LASTEXITCODE." }
}

try {
  New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null
  if ($Update) {
    Invoke-Step 'scripts/generate-docs-manifest.ps1 (atomic update)' 'generate-docs-manifest.ps1' @('-RepoRoot', $repoRoot, '-OutputPath', $manifestPath)
    Invoke-Step 'scripts/generate-app-docs-manifest.ps1 (atomic update)' 'generate-app-docs-manifest.ps1' @('-RepoRoot', $repoRoot, '-ManifestPath', $manifestPath, '-OutputPath', $bundlePath)
    Write-Output 'PASS: explicit -Update atomically refreshed checked-in documentation outputs.'
  } else {
    $generatorArgs = @('-RepoRoot', $repoRoot, '-OutputPath', $tempManifest)
    Invoke-Step 'scripts/generate-docs-manifest.ps1 (temporary output)' 'generate-docs-manifest.ps1' $generatorArgs
    $appGeneratorArgs = @('-RepoRoot', $repoRoot, '-ManifestPath', $tempManifest, '-OutputPath', $tempBundle)
    Invoke-Step 'scripts/generate-app-docs-manifest.ps1 (temporary output)' 'generate-app-docs-manifest.ps1' $appGeneratorArgs
    if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf) -or -not (Test-Path -LiteralPath $bundlePath -PathType Leaf)) {
      throw 'Checked-in documentation outputs are missing; use -Update to create them atomically.'
    }
    $tempManifestHash = (Get-FileHash -LiteralPath $tempManifest -Algorithm SHA256).Hash
    $manifestHash = (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash
    if ($tempManifestHash -cne $manifestHash) { throw 'Checked-in site manifest differs from the deterministic temporary output.' }
    $tempBundleHash = (Get-FileHash -LiteralPath $tempBundle -Algorithm SHA256).Hash
    $bundleHash = (Get-FileHash -LiteralPath $bundlePath -Algorithm SHA256).Hash
    if ($tempBundleHash -cne $bundleHash) { throw 'Checked-in app bundle differs from the deterministic temporary output.' }
    Write-Output 'PASS: temporary generated outputs match checked-in documentation outputs.'
  }
  $verifyArgs = @()
  if ($SelfTest) { $verifyArgs += '-SelfTest' }
  if ($RequireCentralMount) { $verifyArgs += '-RequireCentralMount' }
  Invoke-Step 'scripts/verify-docs-browser.ps1 (checked-in outputs)' 'verify-docs-browser.ps1' $verifyArgs
  Invoke-Step 'scripts/verify-app-docs-bundle.ps1 (checked-in outputs)' 'verify-app-docs-bundle.ps1' $verifyArgs
} finally {
  if (Test-Path -LiteralPath $tempRoot) { Remove-Item -LiteralPath $tempRoot -Recurse -Force }
}

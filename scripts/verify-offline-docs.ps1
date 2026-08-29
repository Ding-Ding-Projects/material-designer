[CmdletBinding()]
param(
  [switch]$SelfTest
)

$ErrorActionPreference = 'Stop'
$steps = @(
  @{ Path = 'scripts/generate-docs-manifest.ps1'; Args = @{} },
  @{ Path = 'scripts/generate-app-docs-manifest.ps1'; Args = @{} },
  @{ Path = 'scripts/verify-docs-browser.ps1'; Args = @{ SelfTest = $SelfTest } },
  @{ Path = 'scripts/verify-app-docs-bundle.ps1'; Args = @{ SelfTest = $SelfTest } }
)

foreach ($step in $steps) {
  Write-Output ('RUN: ' + $step.Path)
  $scriptPath = Join-Path $PSScriptRoot (Split-Path -Leaf $step.Path)
  $arguments = @()
  if ($step.Args.ContainsKey('SelfTest') -and $step.Args.SelfTest) { $arguments += '-SelfTest' }
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptPath @arguments
  if ($LASTEXITCODE -ne 0) { throw "Offline documentation verification stopped at $($step.Path) with exit code $LASTEXITCODE." }
}

Write-Output 'PASS: offline documentation source, bundle, and source-ready contracts are verified.'

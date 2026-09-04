[CmdletBinding()]
param(
  [string]$Root
)

$ErrorActionPreference = 'Stop'
$scriptRoot = if ([string]::IsNullOrWhiteSpace($PSScriptRoot)) { Split-Path -Parent $MyInvocation.MyCommand.Definition } else { $PSScriptRoot }
if ([string]::IsNullOrWhiteSpace($Root)) { $Root = Join-Path $scriptRoot '..' }
$checker = Join-Path $scriptRoot 'verify-browser-download-surfaces.ps1'
if (-not (Test-Path -LiteralPath $checker -PathType Leaf)) { throw "Missing browser-download validator: $checker" }

$hosts = @(
  @{ label = 'Windows PowerShell 5.1'; command = 'powershell.exe' },
  @{ label = 'PowerShell 7'; command = 'pwsh' }
)
$passLine = 'PASS: browser-download lifecycle inventory is complete, comment-excluding exact markers hold, and remove, comment, and rename regressions turned red then green.'

foreach ($hostSpec in $hosts) {
  if (-not (Get-Command $hostSpec.command -ErrorAction SilentlyContinue)) {
    throw "Missing required host for browser-download validator proof: $($hostSpec.label) ($($hostSpec.command))"
  }
  $output = & $hostSpec.command -NoProfile -ExecutionPolicy Bypass -File $checker -Root $Root 2>&1 | Out-String
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) {
    throw "Browser-download validator failed under $($hostSpec.label) with exit code $exitCode`: $output"
  }
  if ($output.IndexOf($passLine, [StringComparison]::Ordinal) -lt 0) {
    throw "Browser-download validator under $($hostSpec.label) omitted its exact PASS line. Output: $output"
  }
  Write-Output "PASS: browser-download validator completed under $($hostSpec.label)."
}

Write-Output 'PASS: browser-download validator host proof completed under Windows PowerShell 5.1 and PowerShell 7.'

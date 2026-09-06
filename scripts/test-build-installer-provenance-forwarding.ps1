[CmdletBinding()]
param([string]$Root = '')

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($Root)) { $Root = Split-Path -Parent $PSScriptRoot }
$path = Join-Path $Root 'scripts\build-installer.ps1'
$source = Get-Content -Raw -LiteralPath $path

function Assert-Forwarding([string]$Text, [string]$Context) {
  foreach ($line in @(
    "[Environment]::SetEnvironmentVariable('OD_BUILD_VERSION', `$appVersion, 'Process')",
    "[Environment]::SetEnvironmentVariable('OD_BUILD_SOURCE_COMMIT', `$sha, 'Process')",
    "[Environment]::SetEnvironmentVariable('OD_BUILD_UPDATED_AT', `$external.updatedAt, 'Process')"
  )) {
    if ($Text -notmatch [regex]::Escape($line)) { throw "$Context is missing $line" }
  }
  if ($Text -notmatch [regex]::Escape("[Environment]::SetEnvironmentVariable(`$name, `$priorPackProvenance[`$name], 'Process')")) { throw "$Context does not restore caller provenance" }
}

Assert-Forwarding $source 'installer pack invocation'
$broken = $source.Replace("[Environment]::SetEnvironmentVariable('OD_BUILD_UPDATED_AT', `$external.updatedAt, 'Process')", "[Environment]::SetEnvironmentVariable('OD_BUILD_UPDATED_AT', `$null, 'Process')")
try {
  Assert-Forwarding $broken 'negative installer pack invocation'
  throw 'provenance forwarding guard stayed green after updated-at forwarding removal'
} catch {
  if ($_.Exception.Message -like 'provenance forwarding guard stayed green*') { throw }
}
Write-Output 'PASS: validated release provenance is forwarded to packaging and caller environment values are restored.'

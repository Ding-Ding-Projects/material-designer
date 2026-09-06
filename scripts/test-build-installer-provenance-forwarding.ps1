[CmdletBinding()]
param([string]$Root = '')

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($Root)) { $Root = Split-Path -Parent $PSScriptRoot }
$path = Join-Path $Root 'scripts\build-installer.ps1'
$source = Get-Content -Raw -LiteralPath $path

function Assert-Forwarding([string]$Text, [string]$Context) {
  foreach ($line in @(
    "`$packVersion = if (`$provenanceIsValid) { `$appVersion } else { `$null }",
    "`$packCommit = if (`$provenanceIsValid) { `$sha } else { `$null }",
    "`$packUpdatedAt = if (`$provenanceIsValid) { `$external.updatedAt } else { `$null }",
    "[Environment]::SetEnvironmentVariable('OD_BUILD_VERSION', `$packVersion, 'Process')",
    "[Environment]::SetEnvironmentVariable('OD_BUILD_SOURCE_COMMIT', `$packCommit, 'Process')",
    "[Environment]::SetEnvironmentVariable('OD_BUILD_UPDATED_AT', `$packUpdatedAt, 'Process')"
  )) {
    if ($Text -notmatch [regex]::Escape($line)) { throw "$Context is missing $line" }
  }
  if ($Text -notmatch [regex]::Escape("[Environment]::SetEnvironmentVariable(`$name, `$priorPackProvenance[`$name], 'Process')")) { throw "$Context does not restore caller provenance" }
}

Assert-Forwarding $source 'installer pack invocation'
$broken = $source.Replace("`$packUpdatedAt = if (`$provenanceIsValid) { `$external.updatedAt } else { `$null }", "`$packUpdatedAt = `$external.updatedAt")
try {
  Assert-Forwarding $broken 'negative installer pack invocation'
  throw 'provenance forwarding guard stayed green after updated-at forwarding removal'
} catch {
  if ($_.Exception.Message -like 'provenance forwarding guard stayed green*') { throw }
}

function Invoke-ChildProvenanceFixture([bool]$Valid) {
  $names = @('OD_BUILD_VERSION', 'OD_BUILD_SOURCE_COMMIT', 'OD_BUILD_UPDATED_AT')
  $prior = @{}
  foreach ($name in $names) { $prior[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
  try {
    $version = if ($Valid) { '1.2.3' } else { $null }
    $commit = if ($Valid) { ('a' * 40) } else { $null }
    $updatedAt = if ($Valid) { '2026-09-06T20:00:00Z' } else { $null }
    [Environment]::SetEnvironmentVariable('OD_BUILD_VERSION', $version, 'Process')
    [Environment]::SetEnvironmentVariable('OD_BUILD_SOURCE_COMMIT', $commit, 'Process')
    [Environment]::SetEnvironmentVariable('OD_BUILD_UPDATED_AT', $updatedAt, 'Process')
    $child = & powershell.exe -NoProfile -Command '[pscustomobject]@{ version=$env:OD_BUILD_VERSION; commit=$env:OD_BUILD_SOURCE_COMMIT; updatedAt=$env:OD_BUILD_UPDATED_AT } | ConvertTo-Json -Compress'
    if ($LASTEXITCODE -ne 0) { throw 'provenance fixture child failed' }
    return $child | ConvertFrom-Json
  } finally {
    foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $prior[$name], 'Process') }
  }
}

$original = @{
  OD_BUILD_VERSION = [Environment]::GetEnvironmentVariable('OD_BUILD_VERSION', 'Process')
  OD_BUILD_SOURCE_COMMIT = [Environment]::GetEnvironmentVariable('OD_BUILD_SOURCE_COMMIT', 'Process')
  OD_BUILD_UPDATED_AT = [Environment]::GetEnvironmentVariable('OD_BUILD_UPDATED_AT', 'Process')
}
try {
  [Environment]::SetEnvironmentVariable('OD_BUILD_VERSION', 'inherited-version', 'Process')
  [Environment]::SetEnvironmentVariable('OD_BUILD_SOURCE_COMMIT', ('b' * 40), 'Process')
  [Environment]::SetEnvironmentVariable('OD_BUILD_UPDATED_AT', '1999-01-01T00:00:00Z', 'Process')
  $unavailable = Invoke-ChildProvenanceFixture $false
  if ($null -ne $unavailable.version -or $null -ne $unavailable.commit -or $null -ne $unavailable.updatedAt) { throw 'unavailable provenance leaked inherited values into the packaging child' }
  if ([Environment]::GetEnvironmentVariable('OD_BUILD_VERSION', 'Process') -ne 'inherited-version') { throw 'fixture did not restore inherited provenance after child exit' }
  $verified = Invoke-ChildProvenanceFixture $true
  if ($verified.version -ne '1.2.3' -or $verified.commit -ne ('a' * 40) -or $verified.updatedAt -ne '2026-09-06T20:00:00Z') { throw 'verified provenance was not visible to the packaging child' }
} finally {
  foreach ($name in $original.Keys) { [Environment]::SetEnvironmentVariable($name, $original[$name], 'Process') }
}
Write-Output 'PASS: validated release provenance is forwarded to packaging and caller environment values are restored.'

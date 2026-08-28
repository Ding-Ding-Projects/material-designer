[CmdletBinding()]
param(
  [string]$Root = ''
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($Root)) { $Root = Split-Path -Parent $PSScriptRoot }

function Test-BuildContract([string]$ContractRoot) {
  $failures = [System.Collections.Generic.List[string]]::new()
  $buildBat = Join-Path $ContractRoot 'build.bat'
  $installerBat = Join-Path $ContractRoot 'build-installer.bat'
  $buildPs = Join-Path $ContractRoot 'scripts/build.ps1'
  $installerPs = Join-Path $ContractRoot 'scripts/build-installer.ps1'
  $fetchPs = Join-Path $ContractRoot 'scripts/download-dependencies.ps1'
  $fetchBat = Join-Path $ContractRoot 'download-dependencies.bat'
  $manifestPath = Join-Path $ContractRoot 'dependencies.manifest.json'

  foreach ($path in @($buildBat, $installerBat, $buildPs, $installerPs, $fetchPs, $fetchBat, $manifestPath)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { $failures.Add("missing required entrypoint: $path") }
  }
  if ($failures.Count -gt 0) { return $failures }

  $build = Get-Content -Raw -LiteralPath $buildBat
  $installer = Get-Content -Raw -LiteralPath $installerBat
  $buildSource = Get-Content -Raw -LiteralPath $buildPs
  $installerSource = Get-Content -Raw -LiteralPath $installerPs
  $fetchSource = Get-Content -Raw -LiteralPath $fetchPs
  $manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json

  if ($build -notmatch 'scripts\\download-dependencies\.ps1') { $failures.Add('build.bat does not invoke the dependency bootstrap') }
  if ($build -notmatch 'YUM_TONG_DEPENDENCIES_READY=1') { $failures.Add('build.bat does not pass the bootstrap result to build.ps1') }
  if ($installer -match 'goto usage' -and $installer -match 'not defined CANDIDATE') { $failures.Add('build-installer.bat still requires a caller-supplied candidate') }
  if ($installerSource -match '\[Parameter\(Mandatory\s*=\s*\$true\)\]') { $failures.Add('build-installer.ps1 still requires a candidate') }
  if ($installerSource -notmatch 'function Resolve-Candidate') { $failures.Add('build-installer.ps1 has no automatic candidate resolver') }
  if ($buildSource -notmatch 'MATERIAL_DESIGNER_PROVENANCE_FILE') { $failures.Add('build.ps1 has no external provenance input') }
  if ($buildSource -match 'completedAt\s*=\s*\(Get-Date\)') { $failures.Add('build.ps1 fabricates provenance from the host clock') }
  if ($installerSource -match 'builtAt\s*=\s*\(Get-Date\)') { $failures.Add('build-installer.ps1 fabricates provenance from the host clock') }
  if ($installerSource -notmatch "status = 'unavailable'") { $failures.Add('build-installer.ps1 has no honest unavailable provenance state') }
  if ($fetchSource -notmatch 'Download-Verified') { $failures.Add('dependency bootstrap has no digest-verifying download path') }
  if ($fetchSource -notmatch 'Ensure-InteractiveElevation') { $failures.Add('dependency bootstrap has no interactive pre-elevation path') }
  if ($fetchSource -notmatch 'Microsoft.VisualStudio.2022.BuildTools') { $failures.Add('dependency bootstrap has no canonical MSVC workload route') }
  foreach ($spec in @($manifest.platforms.'windows-x64')) {
    if ([string]::IsNullOrWhiteSpace($spec.version) -or [string]::IsNullOrWhiteSpace($spec.url)) { $failures.Add("manifest entry $($spec.id) lacks an exact version or canonical URL") }
    if ([string]::IsNullOrWhiteSpace($spec.sha256) -and [string]::IsNullOrWhiteSpace($spec.sha512Base64)) { $failures.Add("manifest entry $($spec.id) lacks a digest") }
  }
  return $failures
}

function Assert-ContractPass([string]$ContractRoot, [string]$Context) {
  $failures = @(Test-BuildContract $ContractRoot)
  if ($failures.Count -gt 0) { throw "$Context failed: $($failures -join '; ')" }
}

Assert-ContractPass $Root 'build entrypoint contract'

$fixtureRoot = Join-Path ([IO.Path]::GetTempPath()) ('material-designer-build-contract-' + [Guid]::NewGuid().ToString('N'))
try {
  New-Item -ItemType Directory -Force -Path $fixtureRoot | Out-Null
  New-Item -ItemType Directory -Force -Path (Join-Path $fixtureRoot 'scripts') | Out-Null
  foreach ($relative in @('build.bat', 'build-installer.bat', 'download-dependencies.bat', 'dependencies.manifest.json')) {
    Copy-Item -LiteralPath (Join-Path $Root $relative) -Destination (Join-Path $fixtureRoot $relative)
  }
  foreach ($relative in @('build.ps1', 'build-installer.ps1', 'download-dependencies.ps1')) {
    Copy-Item -LiteralPath (Join-Path $Root "scripts/$relative") -Destination (Join-Path $fixtureRoot "scripts/$relative")
  }
  $fixture = Join-Path $fixtureRoot 'build.bat'
  $original = Get-Content -Raw -LiteralPath $fixture
  $broken = $original.Replace('scripts\download-dependencies.ps1', 'scripts\missing-dependencies.ps1')
  if ($broken -eq $original) { throw 'the negative fixture mutation did not change build.bat' }
  [IO.File]::WriteAllText($fixture, $broken, [Text.UTF8Encoding]::new($false))
  $negativeFailures = @(Test-BuildContract $fixtureRoot)
  if ($negativeFailures.Count -eq 0) { throw 'the build entrypoint contract check stayed green after dependency invocation removal' }
  [IO.File]::WriteAllText($fixture, $original, [Text.UTF8Encoding]::new($false))
  $restored = Get-Content -Raw -LiteralPath $fixture
  if ($restored -ne $original) { throw 'the negative fixture was not restored byte-for-byte' }
  Write-Output 'PASS: build entrypoint contract check turned red after dependency invocation removal and green after restoration.'
} finally {
  if (Test-Path -LiteralPath $fixtureRoot) {
    Remove-Item -LiteralPath $fixtureRoot -Recurse -Force
  }
}

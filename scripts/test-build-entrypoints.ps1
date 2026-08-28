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
  $fetchSh = Join-Path $ContractRoot 'download-dependencies.sh'
  $fetchBat = Join-Path $ContractRoot 'download-dependencies.bat'
  $manifestPath = Join-Path $ContractRoot 'dependencies.manifest.json'

  foreach ($path in @($buildBat, $installerBat, $buildPs, $installerPs, $fetchPs, $fetchSh, $fetchBat, $manifestPath)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { $failures.Add("missing required entrypoint: $path") }
  }
  if ($failures.Count -gt 0) { return $failures }

  $build = Get-Content -Raw -LiteralPath $buildBat
  $installer = Get-Content -Raw -LiteralPath $installerBat
  $buildSource = Get-Content -Raw -LiteralPath $buildPs
  $installerSource = Get-Content -Raw -LiteralPath $installerPs
  $fetchSource = Get-Content -Raw -LiteralPath $fetchPs
  $fetchShell = Get-Content -Raw -LiteralPath $fetchSh
  $manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json

  if ($build -notmatch 'scripts\\download-dependencies\.ps1') { $failures.Add('build.bat does not invoke the dependency bootstrap') }
  if ($build -notmatch 'YUM_TONG_DEPENDENCIES_READY=1') { $failures.Add('build.bat does not pass the bootstrap result to build.ps1') }
  if ($installer -match 'goto usage' -and $installer -match 'not defined CANDIDATE') { $failures.Add('build-installer.bat still requires a caller-supplied candidate') }
  if ($installerSource -match '\[Parameter\(Mandatory\s*=\s*\$true\)\]') { $failures.Add('build-installer.ps1 still requires a candidate') }
  if ($installerSource -notmatch 'function Resolve-Candidate') { $failures.Add('build-installer.ps1 has no automatic candidate resolver') }
  if ($installerSource -notmatch '\$pnpmPath = \[string\]\$resolution\.tools\.pnpm\.executable') { $failures.Add('build-installer.ps1 does not bind the manifest-resolved pnpm executable') }
  if ($installerSource -notmatch '& \$pnpmPath .*tools-pack win build') { $failures.Add('build-installer.ps1 does not invoke the resolved pnpm executable') }
  if ($buildSource -notmatch 'dependency-resolution\.json') { $failures.Add('build.ps1 does not consume the helper resolution record') }
  if ($buildSource -notmatch '\$nodePath = \[string\]\$resolution\.tools\.node\.executable') { $failures.Add('build.ps1 does not use the manifest-resolved Node executable') }
  if ($buildSource -notmatch 'resolved Node version') { $failures.Add('build.ps1 does not validate the exact resolved Node version') }
  if ($buildSource -notmatch 'MATERIAL_DESIGNER_PROVENANCE_FILE') { $failures.Add('build.ps1 has no external provenance input') }
  if ($buildSource -match 'completedAt\s*=\s*\(Get-Date\)') { $failures.Add('build.ps1 fabricates provenance from the host clock') }
  if ($installerSource -match 'builtAt\s*=\s*\(Get-Date\)') { $failures.Add('build-installer.ps1 fabricates provenance from the host clock') }
  if ($installerSource -notmatch "status = 'unavailable'") { $failures.Add('build-installer.ps1 has no honest unavailable provenance state') }
  if ($fetchSource -notmatch 'Download-Verified') { $failures.Add('dependency bootstrap has no digest-verifying download path') }
  if ($fetchSource -notmatch 'Ensure-InteractiveElevation') { $failures.Add('dependency bootstrap has no interactive pre-elevation path') }
  if ($fetchSource -notmatch 'if \(-not \$interactive\) \{ return \}') { $failures.Add('dependency bootstrap does not preserve silent user-scoped execution') }
  if ($fetchSource -notmatch '(?m)^Ensure-InteractiveElevation\s*\r?\nAssert-DependencyManifest\s*$') { $failures.Add('dependency bootstrap does not pre-elevate before manifest work') }
  if ($fetchSource -notmatch 'Assert-DependencyManifest') { $failures.Add('dependency bootstrap does not validate the strict manifest schema') }
  if ($fetchSource -notmatch 'Assert-ManifestUrl') { $failures.Add('dependency bootstrap does not validate canonical manifest hosts and digests') }
  if ($fetchSource -notmatch 'Find-PnpmExecutable') { $failures.Add('dependency bootstrap does not use a null-safe pnpm resolver') }
  if ($fetchSource -notmatch 'Microsoft.VisualStudio.2022.BuildTools') { $failures.Add('dependency bootstrap has no canonical MSVC workload route') }
  if ($fetchSource -notmatch 'return Import-CompilerEnvironment \$vcvars') { $failures.Add('dependency bootstrap does not import the compiler environment') }
  if ($fetchSource -notmatch 'vcvars64\.bat') { $failures.Add('dependency bootstrap does not resolve the x64 compiler environment') }
  if ($fetchSource -notmatch 'dependency-resolution\.json') { $failures.Add('dependency bootstrap does not publish resolved tool paths') }
  if ($fetchSource -notmatch 'Guid\]::NewGuid') { $failures.Add('Windows dependency bootstrap does not use unique download temps') }
  if ($fetchShell -notmatch 'manifest_value\(\)') { $failures.Add('Linux dependency bootstrap does not read the pinned manifest') }
  if ($fetchShell -notmatch 'flock -w 120 9') { $failures.Add('Linux dependency bootstrap does not serialize its cache') }
  if ($fetchShell -notmatch 'mktemp .*download\.XXXXXX') { $failures.Add('Linux dependency bootstrap does not use unique download temps') }
  if ($fetchShell -notmatch 'manifest_validate') { $failures.Add('Linux dependency bootstrap does not validate the strict manifest') }
  if ($installerSource -notmatch 'signatureStatus') { $failures.Add('build-installer.ps1 does not retain the unsigned signature verdict') }
  if ($installerSource -notmatch 'provenanceStatus = \$provenance\.status') { $failures.Add('build-installer.ps1 does not bind the installer manifest to provenance state') }
  if ($installerSource -notmatch '\$sourceRecord = Join-Path \$runRoot ''pack-source\.json''') { $failures.Add('build-installer.ps1 does not bind reusable pack output to a source commit') }
  if ($installerSource -notmatch 'Assert-SquirrelPackageSet \$squirrelRoot') { $failures.Add('build-installer.ps1 does not validate the complete Squirrel package set') }
  if ($installerSource -notmatch 'RELEASES') { $failures.Add('build-installer.ps1 does not validate the Squirrel RELEASES relationship') }
  if ($installerSource -notmatch 'nuspec') { $failures.Add('build-installer.ps1 does not validate package identity metadata') }
  if ($manifest.schemaVersion -ne 1) { $failures.Add('dependency manifest schemaVersion is not exactly 1') }
  if ((@($manifest.platforms.'windows-x64').id -join ',') -ne 'git,node,pnpm,python') { $failures.Add('windows-x64 manifest ids are incomplete or reordered') }
  if ((@($manifest.platforms.'linux-x64').id -join ',') -ne 'node,pnpm') { $failures.Add('linux-x64 manifest ids are incomplete or reordered') }
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
  Copy-Item -LiteralPath (Join-Path $Root 'download-dependencies.sh') -Destination (Join-Path $fixtureRoot 'download-dependencies.sh')
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
  $mutations = @(
    @{ File = 'build.bat'; Needle = 'YUM_TONG_DEPENDENCIES_READY=1'; Replacement = 'YUM_TONG_DEPENDENCIES_READY=0'; Name = 'resolved PATH handoff' },
    @{ File = 'scripts/build.ps1'; Needle = '$nodePath = [string]$resolution.tools.node.executable'; Replacement = '$nodePath = [string]$resolution.tools.node.missing'; Name = 'exact Node executable binding' },
    @{ File = 'scripts/download-dependencies.ps1'; Needle = 'return Import-CompilerEnvironment $vcvars'; Replacement = 'return Import-CompilerEnvironment_REMOVED $vcvars'; Name = 'compiler environment activation' },
    @{ File = 'scripts/build-installer.ps1'; Needle = 'provenanceStatus = $provenance.status'; Replacement = 'provenanceStatus = $null'; Name = 'provenance binding' },
    @{ File = 'scripts/build-installer.ps1'; Needle = '$sourceRecord = Join-Path $runRoot ''pack-source.json'''; Replacement = '$sourceRecord = Join-Path $runRoot ''pack-source-missing.json'''; Name = 'stale pack source binding' },
    @{ File = 'scripts/build-installer.ps1'; Needle = 'Assert-SquirrelPackageSet $squirrelRoot'; Replacement = 'Assert-SquirrelPackageSet_REMOVED $squirrelRoot'; Name = 'Squirrel package relationship validation' }
    ,@{ File = 'scripts/build-installer.ps1'; Needle = '$pnpmPath = [string]$resolution.tools.pnpm.executable'; Replacement = '$resolvedPackageTool = [string]$resolution.tools.pnpm.executable'; Name = 'installer exact pnpm binding' }
    ,@{ File = 'download-dependencies.sh'; Needle = 'manifest_value()'; Replacement = 'manifest_value_REMOVED()'; Name = 'Linux manifest binding' },
    @{ File = 'download-dependencies.sh'; Needle = 'flock -w 120 9'; Replacement = 'flock_REMOVED -w 120 9'; Name = 'Linux cache lock' },
    @{ File = 'dependencies.manifest.json'; Needle = '"schemaVersion": 1'; Replacement = '"schemaVersion": 2'; Name = 'strict manifest schema' }
  )
  foreach ($mutation in $mutations) {
    $mutationPath = Join-Path $fixtureRoot $mutation.File
    $mutationOriginal = Get-Content -Raw -LiteralPath $mutationPath
    $mutationCount = [regex]::Matches($mutationOriginal, [regex]::Escape($mutation.Needle)).Count
    if ($mutationCount -ne 1) { throw "fixture mutation '$($mutation.Name)' expected one exact target, found $mutationCount" }
    [IO.File]::WriteAllText($mutationPath, $mutationOriginal.Replace($mutation.Needle, $mutation.Replacement), [Text.UTF8Encoding]::new($false))
    if (@(Test-BuildContract $fixtureRoot).Count -eq 0) { throw "build entrypoint contract stayed green after $($mutation.Name) removal" }
    [IO.File]::WriteAllText($mutationPath, $mutationOriginal, [Text.UTF8Encoding]::new($false))
    if (@(Test-BuildContract $fixtureRoot).Count -ne 0) { throw "build entrypoint contract did not return green after $($mutation.Name) restoration" }
  }
  Write-Output 'PASS: build entrypoint contract check turned red after dependency invocation removal and green after restoration.'
} finally {
  if (Test-Path -LiteralPath $fixtureRoot) {
    Remove-Item -LiteralPath $fixtureRoot -Recurse -Force
  }
}

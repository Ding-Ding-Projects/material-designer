[CmdletBinding()]
param(
  [switch]$SelfTest,
  [switch]$Update,
  [switch]$RequireCentralMount,
  [switch]$InjectCleanupFailure
)

$ErrorActionPreference = 'Stop'
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$manifestPath = Join-Path $repoRoot 'site/assets/data/docs-manifest.json'
$bundlePath = Join-Path $repoRoot 'design/apps/web/src/lib/docs/generated.ts'
$stagingParent = Split-Path -Parent $repoRoot
$tempRoot = Join-Path $stagingParent ('.offline-docs-staging-' + [Guid]::NewGuid().ToString('N'))
$repoVolume = [System.IO.Path]::GetPathRoot($repoRoot)
$stagingVolume = [System.IO.Path]::GetPathRoot($tempRoot)
if ($repoVolume -ne $stagingVolume) { throw 'Documentation staging must remain on the destination volume.' }
$tempManifest = Join-Path $tempRoot 'docs-manifest.json'
$tempBundle = Join-Path $tempRoot 'generated.ts'
$transientSharingHResults = @(-2147024864, -2147024863, -2147024726, -2147024713)

function Invoke-Step([string]$Name, [string]$Script, [string[]]$Arguments) {
  Write-Output ('RUN: ' + $Name)
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot $Script) @Arguments
  if ($LASTEXITCODE -ne 0) { throw "Offline documentation verification stopped at $Name with exit code $LASTEXITCODE." }
}

function Test-TransientSharing([System.Exception]$Exception) {
  return $Exception -is [System.IO.IOException] -and $transientSharingHResults -contains $Exception.HResult
}

function Test-BytesEqual([byte[]]$Expected, [byte[]]$Actual) {
  if ($null -eq $Expected -or $null -eq $Actual) { return $null -eq $Expected -and $null -eq $Actual }
  if ($Expected.Length -ne $Actual.Length) { return $false }
  for ($index = 0; $index -lt $Expected.Length; $index++) {
    if ($Expected[$index] -ne $Actual[$index]) { return $false }
  }
  return $true
}

function Get-ManifestGeneration([string]$Path) {
  $manifest = Get-Content -Raw -LiteralPath $Path | ConvertFrom-Json
  if ([string]$manifest.generation -notmatch '^[0-9a-f]{64}$') { throw "Manifest generation is missing or invalid: $Path" }
  return [string]$manifest.generation
}

function Get-BundleGeneration([string]$Path) {
  $text = [IO.File]::ReadAllText($Path, [Text.UTF8Encoding]::new($false))
  $match = [regex]::Match($text, '"generation"\s*:\s*"([0-9a-f]{64})"')
  if (-not $match.Success) { throw "App bundle generation is missing or invalid: $Path" }
  return $match.Groups[1].Value
}

function Move-AtomicWithRetry(
  [string]$Source,
  [string]$Destination,
  [ref]$TransientFailures,
  [switch]$InjectFailure,
  [switch]$InjectPartialFailure,
  [int]$MaxAttempts = 6
) {
  for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
    try {
      if ($InjectFailure -and $attempt -eq 1) { throw [System.InvalidOperationException]::new('Injected permanent replacement failure for transaction self-test.') }
      if ($InjectPartialFailure -and $attempt -eq 1) {
        [IO.File]::WriteAllBytes($Destination, [Text.UTF8Encoding]::new($false).GetBytes('partial second output'))
        throw [System.InvalidOperationException]::new('Injected post-start partial second-output failure for transaction self-test.')
      }
      if ($TransientFailures.Value -gt 0) {
        $TransientFailures.Value--
        throw [System.IO.IOException]::new('Injected sharing violation for retry self-test.', -2147024864)
      }
      Move-Item -LiteralPath $Source -Destination $Destination -Force -ErrorAction Stop
      return $attempt
    } catch {
      if (-not (Test-TransientSharing $_.Exception) -or $attempt -eq $MaxAttempts) { throw }
      Start-Sleep -Milliseconds (50 * $attempt)
    }
  }
  throw "Atomic replacement exhausted its retry budget for $Destination."
}

function Invoke-RealSharingHandleSelfTest([string]$Root, [byte[]]$OldBytes) {
  New-Item -ItemType Directory -Path $Root -Force | Out-Null
  $source = Join-Path $Root 'candidate.txt'
  $destination = Join-Path $Root 'published.txt'
  [IO.File]::WriteAllBytes($source, [Text.UTF8Encoding]::new($false).GetBytes('new candidate'))
  [IO.File]::WriteAllBytes($destination, $OldBytes)
  $handle = $null
  $failure = $null
  try {
    $handle = [IO.File]::Open($destination, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::None)
    try {
      $transientFailures = 0
      [void](Move-AtomicWithRetry -Source $source -Destination $destination -TransientFailures ([ref]$transientFailures))
    } catch {
      $failure = $_.Exception
    }
  } finally {
    if ($null -ne $handle) { $handle.Dispose() }
  }
  if ($null -eq $failure) { throw 'Real conflicting handle self-test unexpectedly replaced an open destination.' }
  if (-not (Test-TransientSharing $failure)) { throw "Real conflicting handle produced an unclassified IOException HResult: $($failure.HResult)." }
  if (-not (Test-BytesEqual $OldBytes ([IO.File]::ReadAllBytes($destination)))) { throw 'Real conflicting handle self-test changed the prior bytes.' }
  Remove-Item -LiteralPath $source -Force
  Remove-Item -LiteralPath $destination -Force
  Remove-Item -LiteralPath $Root -Recurse -Force
  Write-Output "PASS: real conflicting handle classified by IOException HResult $($failure.HResult) and preserved prior bytes."
}

function Remove-WithRetry([string]$Path, [ref]$TransientFailures, [int]$MaxAttempts = 6) {
  for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
    try {
      if ($TransientFailures.Value -gt 0) {
        $TransientFailures.Value--
        throw [System.IO.IOException]::new('Injected sharing violation for restore retry self-test.', -2147024864)
      }
      if (Test-Path -LiteralPath $Path) { Remove-Item -LiteralPath $Path -Force }
      return $attempt
    } catch {
      if (-not (Test-TransientSharing $_.Exception) -or $attempt -eq $MaxAttempts) { throw }
      Start-Sleep -Milliseconds (50 * $attempt)
    }
  }
  throw "Removal exhausted its retry budget for $Path."
}

function Remove-StagingWithRetry([string]$Path, [switch]$InjectFailure, [int]$MaxAttempts = 6) {
  if (-not (Test-Path -LiteralPath $Path)) { return }
  for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
    try {
      if ($InjectFailure -and $attempt -eq 1) { throw [System.InvalidOperationException]::new('Injected staging cleanup failure for self-test.') }
      Remove-Item -LiteralPath $Path -Recurse -Force
      if (Test-Path -LiteralPath $Path) { throw [System.IO.IOException]::new('Staging directory remained after cleanup.', -2147024864) }
      return
    } catch {
      if (-not (Test-TransientSharing $_.Exception) -or $attempt -eq $MaxAttempts) { throw }
      Start-Sleep -Milliseconds (50 * $attempt)
    }
  }
  throw "Staging cleanup exhausted its retry budget for $Path."
}

function Restore-Output(
  [string]$Path,
  [byte[]]$Bytes,
  [bool]$Existed,
  [string]$StageRoot
) {
  $transientFailures = 0
  if (-not $Existed) {
    [void](Remove-WithRetry $Path ([ref]$transientFailures))
    return
  }
  $restore = Join-Path $StageRoot ('.restore-' + [Guid]::NewGuid().ToString('N'))
  try {
    [System.IO.File]::WriteAllBytes($restore, $Bytes)
    [void](Move-AtomicWithRetry -Source $restore -Destination $Path -TransientFailures ([ref]$transientFailures))
  } finally {
    if (Test-Path -LiteralPath $restore) { Remove-Item -LiteralPath $restore -Force }
  }
}

function Invoke-AbsentRollbackSelfTest(
  [string]$Root,
  [bool]$ManifestExists,
  [bool]$BundleExists,
  [byte[]]$OldManifest,
  [byte[]]$OldBundle,
  [byte[]]$NewManifest,
  [byte[]]$NewBundle,
  [switch]$InjectPartialSecondFailure
) {
  New-Item -ItemType Directory -Path $Root -Force | Out-Null
  $manifestDestination = Join-Path $Root 'manifest.json'
  $bundleDestination = Join-Path $Root 'bundle.ts'
  $manifestSource = Join-Path $Root 'candidate-manifest.json'
  $bundleSource = Join-Path $Root 'candidate-bundle.ts'
  if ($ManifestExists) { [IO.File]::WriteAllBytes($manifestDestination, $OldManifest) }
  if ($BundleExists) { [IO.File]::WriteAllBytes($bundleDestination, $OldBundle) }
  [IO.File]::WriteAllBytes($manifestSource, $NewManifest)
  [IO.File]::WriteAllBytes($bundleSource, $NewBundle)
  $restored = $false
  $transactionParams = @{
    ManifestSource = $manifestSource
    BundleSource = $bundleSource
    ManifestDestination = $manifestDestination
    BundleDestination = $bundleDestination
    StageRoot = $Root
  }
  if ($InjectPartialSecondFailure) { $transactionParams.InjectPartialSecondFailure = $true }
  else { $transactionParams.InjectSecondFailure = $true }
  try {
    Invoke-TwoOutputTransaction @transactionParams
  } catch {
    $expectedDiagnostic = if ($InjectPartialSecondFailure) { 'Injected post-start partial second-output failure for transaction self-test.' } else { 'Injected permanent replacement failure for transaction self-test.' }
    $expectedMessage = 'Two-output transaction failed; exact prior manifest and bundle bytes were restored: ' + $expectedDiagnostic
    $restored = $_.Exception.Message -ceq $expectedMessage
  }
  $actualManifest = if (Test-Path -LiteralPath $manifestDestination) { [IO.File]::ReadAllBytes($manifestDestination) } else { $null }
  $actualBundle = if (Test-Path -LiteralPath $bundleDestination) { [IO.File]::ReadAllBytes($bundleDestination) } else { $null }
  $expectedManifest = if ($ManifestExists) { $OldManifest } else { $null }
  $expectedBundle = if ($BundleExists) { $OldBundle } else { $null }
  if (-not $restored -or -not (Test-BytesEqual $expectedManifest $actualManifest) -or -not (Test-BytesEqual $expectedBundle $actualBundle)) {
    throw "Absent-output rollback self-test failed for $Root."
  }
}

function Invoke-TwoOutputTransaction(
  [string]$ManifestSource,
  [string]$BundleSource,
  [string]$ManifestDestination,
  [string]$BundleDestination,
  [string]$StageRoot,
  [int]$ManifestTransientFailures = 0,
  [int]$BundleTransientFailures = 0,
  [switch]$InjectSecondFailure,
  [switch]$InjectPartialSecondFailure
) {
  $manifestExisted = Test-Path -LiteralPath $ManifestDestination -PathType Leaf
  $bundleExisted = Test-Path -LiteralPath $BundleDestination -PathType Leaf
  $manifestBytes = if ($manifestExisted) { [System.IO.File]::ReadAllBytes($ManifestDestination) } else { $null }
  $bundleBytes = if ($bundleExisted) { [System.IO.File]::ReadAllBytes($BundleDestination) } else { $null }
  $manifestCandidateBytes = [System.IO.File]::ReadAllBytes($ManifestSource)
  $bundleCandidateBytes = [System.IO.File]::ReadAllBytes($BundleSource)
  $manifestRetries = 0
  $bundleRetries = 0
  $publicationBegun = $false
  try {
    $publicationBegun = $true
    $manifestRetries = Move-AtomicWithRetry -Source $ManifestSource -Destination $ManifestDestination -TransientFailures ([ref]$ManifestTransientFailures)
    $bundleRetries = Move-AtomicWithRetry -Source $BundleSource -Destination $BundleDestination -TransientFailures ([ref]$BundleTransientFailures) -InjectFailure:$InjectSecondFailure -InjectPartialFailure:$InjectPartialSecondFailure
    $publishedManifestBytes = [System.IO.File]::ReadAllBytes($ManifestDestination)
    $publishedBundleBytes = [System.IO.File]::ReadAllBytes($BundleDestination)
    if (-not (Test-BytesEqual $manifestCandidateBytes $publishedManifestBytes)) { throw 'Published manifest bytes differ from the staged candidate.' }
    if (-not (Test-BytesEqual $bundleCandidateBytes $publishedBundleBytes)) { throw 'Published bundle bytes differ from the staged candidate.' }
    if ((Get-ManifestGeneration $ManifestDestination) -cne (Get-BundleGeneration $BundleDestination)) { throw 'Published manifest and bundle generations differ.' }
    [pscustomobject]@{ ManifestRetries = $manifestRetries; BundleRetries = $bundleRetries }
  } catch {
    $originalError = $_.Exception
    try {
      if ($publicationBegun) {
        Restore-Output $ManifestDestination $manifestBytes $manifestExisted $StageRoot
        Restore-Output $BundleDestination $bundleBytes $bundleExisted $StageRoot
      }
      $currentManifestBytes = if (Test-Path -LiteralPath $ManifestDestination) { [System.IO.File]::ReadAllBytes($ManifestDestination) } else { $null }
      if (-not (Test-BytesEqual $manifestBytes $currentManifestBytes)) {
        throw 'Manifest restoration bytes differ from the preserved prior bytes.'
      }
      $currentBundleBytes = if (Test-Path -LiteralPath $BundleDestination) { [System.IO.File]::ReadAllBytes($BundleDestination) } else { $null }
      if (-not (Test-BytesEqual $bundleBytes $currentBundleBytes)) {
        throw 'Bundle restoration bytes differ from the preserved prior bytes.'
      }
    } catch {
      throw "Two-output transaction failed and exact restoration failed: $($_.Exception.Message)"
    }
    throw "Two-output transaction failed; exact prior manifest and bundle bytes were restored: $($originalError.Message)"
  }
}

function Invoke-TransactionSelfTests([string]$StageRoot) {
  $testRoot = Join-Path $StageRoot 'transaction-selftest'
  New-Item -ItemType Directory -Path $testRoot -Force | Out-Null
  $oldManifest = [Text.UTF8Encoding]::new($false).GetBytes('old manifest')
  $oldBundle = [Text.UTF8Encoding]::new($false).GetBytes('old bundle')
  $generation = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  $newManifest = [Text.UTF8Encoding]::new($false).GetBytes('{ "schemaVersion": 1, "generation": "' + $generation + '", "source": "docs/**/*.md", "articleCount": 0, "articles": [] }')
  $newBundle = [Text.UTF8Encoding]::new($false).GetBytes('export const DOCS_MANIFEST = { "generation": "' + $generation + '" } as const;')
  $manifestDestination = Join-Path $testRoot 'manifest.json'
  $bundleDestination = Join-Path $testRoot 'bundle.ts'
  [IO.File]::WriteAllBytes($manifestDestination, $oldManifest)
  [IO.File]::WriteAllBytes($bundleDestination, $oldBundle)

  $candidateManifest = Join-Path $testRoot 'candidate-manifest.json'
  $candidateBundle = Join-Path $testRoot 'candidate-bundle.ts'
  [IO.File]::WriteAllBytes($candidateManifest, $newManifest)
  [IO.File]::WriteAllBytes($candidateBundle, $newBundle)
  $expectedPermanentMessage = 'Two-output transaction failed; exact prior manifest and bundle bytes were restored: Injected permanent replacement failure for transaction self-test.'
  $red = $false
  try {
    Invoke-TwoOutputTransaction -ManifestSource $candidateManifest -BundleSource $candidateBundle -ManifestDestination $manifestDestination -BundleDestination $bundleDestination -StageRoot $testRoot -ManifestTransientFailures 2 -InjectSecondFailure
  } catch {
    $red = $_.Exception.Message -ceq $expectedPermanentMessage
    if ($red) { Write-Output 'PASS: injected second replacement red proof reported exact restoration.' }
  }
  if (-not $red) { throw 'Injected second replacement did not produce the exact restoration diagnostic.' }
  if (-not (Test-BytesEqual $oldManifest ([IO.File]::ReadAllBytes($manifestDestination))) -or -not (Test-BytesEqual $oldBundle ([IO.File]::ReadAllBytes($bundleDestination)))) {
    throw 'Injected second replacement did not restore both prior byte sequences.'
  }
  $missingBundleRoot = Join-Path $testRoot 'missing-bundle'
  New-Item -ItemType Directory -Path $missingBundleRoot -Force | Out-Null
  $missingManifestDestination = Join-Path $missingBundleRoot 'manifest.json'
  $missingBundleDestination = Join-Path $missingBundleRoot 'bundle.ts'
  $missingManifestSource = Join-Path $missingBundleRoot 'candidate-manifest.json'
  $missingBundleSource = Join-Path $missingBundleRoot 'candidate-bundle.ts'
  [IO.File]::WriteAllBytes($missingManifestDestination, $oldManifest)
  [IO.File]::WriteAllBytes($missingManifestSource, $newManifest)
  [IO.File]::WriteAllBytes($missingBundleSource, $newBundle)
  $expectedMissingBundleMessage = 'Two-output transaction failed; exact prior manifest and bundle bytes were restored: Injected permanent replacement failure for transaction self-test.'
  $missingBundleRed = $false
  try {
    Invoke-TwoOutputTransaction -ManifestSource $missingManifestSource -BundleSource $missingBundleSource -ManifestDestination $missingManifestDestination -BundleDestination $missingBundleDestination -StageRoot $missingBundleRoot -InjectSecondFailure
  } catch {
    $missingBundleRed = $_.Exception.Message -ceq $expectedMissingBundleMessage
  }
  if (-not $missingBundleRed -or -not (Test-BytesEqual $oldManifest ([IO.File]::ReadAllBytes($missingManifestDestination))) -or (Test-Path -LiteralPath $missingBundleDestination)) {
    throw 'Injected second replacement did not restore an originally absent bundle exactly.'
  }
  Write-Output 'PASS: injected second replacement restored the originally absent output exactly.'

  [IO.File]::WriteAllBytes($candidateManifest, $newManifest)
  [IO.File]::WriteAllBytes($candidateBundle, $newBundle)
  $expectedPartialMessage = 'Two-output transaction failed; exact prior manifest and bundle bytes were restored: Injected post-start partial second-output failure for transaction self-test.'
  $partialRed = $false
  try {
    Invoke-TwoOutputTransaction -ManifestSource $candidateManifest -BundleSource $candidateBundle -ManifestDestination $manifestDestination -BundleDestination $bundleDestination -StageRoot $testRoot -InjectPartialSecondFailure
  } catch {
    $partialRed = $_.Exception.Message -ceq $expectedPartialMessage
  }
  if (-not $partialRed -or -not (Test-BytesEqual $oldManifest ([IO.File]::ReadAllBytes($manifestDestination))) -or -not (Test-BytesEqual $oldBundle ([IO.File]::ReadAllBytes($bundleDestination)))) {
    throw 'Injected partial second-output failure did not restore both prior byte sequences exactly.'
  }
  Write-Output 'PASS: injected partial second-output failure restored both prior byte sequences exactly.'

  $missingManifestRoot = Join-Path $testRoot 'missing-manifest'
  Invoke-AbsentRollbackSelfTest $missingManifestRoot $false $true $oldManifest $oldBundle $newManifest $newBundle
  Write-Output 'PASS: injected second replacement restored an originally absent manifest exactly.'
  $bothAbsentRoot = Join-Path $testRoot 'both-absent'
  Invoke-AbsentRollbackSelfTest $bothAbsentRoot $false $false $oldManifest $oldBundle $newManifest $newBundle
  Write-Output 'PASS: injected second replacement preserved two originally absent outputs exactly.'

  $partialMissingBundleRoot = Join-Path $testRoot 'partial-missing-bundle'
  Invoke-AbsentRollbackSelfTest $partialMissingBundleRoot $true $false $oldManifest $oldBundle $newManifest $newBundle -InjectPartialSecondFailure
  Write-Output 'PASS: partial second-output failure restored present manifest and absent bundle exactly.'
  $partialMissingManifestRoot = Join-Path $testRoot 'partial-missing-manifest'
  Invoke-AbsentRollbackSelfTest $partialMissingManifestRoot $false $true $oldManifest $oldBundle $newManifest $newBundle -InjectPartialSecondFailure
  Write-Output 'PASS: partial second-output failure restored absent manifest and present bundle exactly.'
  $partialBothAbsentRoot = Join-Path $testRoot 'partial-both-absent'
  Invoke-AbsentRollbackSelfTest $partialBothAbsentRoot $false $false $oldManifest $oldBundle $newManifest $newBundle -InjectPartialSecondFailure
  Write-Output 'PASS: partial second-output failure preserved two originally absent outputs exactly.'

  if (Test-TransientSharing ([InvalidOperationException]::new('sharing violation'))) { throw 'Transient sharing classification accepted a non-IOException.' }
  if (Test-TransientSharing ([IO.IOException]::new('sharing violation', -1))) { throw 'Transient sharing classification accepted an unlisted IOException HResult.' }
  Write-Output 'PASS: transient sharing classification rejected message-only and unlisted failures.'
  Invoke-RealSharingHandleSelfTest (Join-Path $testRoot 'real-sharing-handle') $oldManifest

  [IO.File]::WriteAllBytes($candidateManifest, $newManifest)
  [IO.File]::WriteAllBytes($candidateBundle, $newBundle)
  $retryResult = Invoke-TwoOutputTransaction -ManifestSource $candidateManifest -BundleSource $candidateBundle -ManifestDestination $manifestDestination -BundleDestination $bundleDestination -StageRoot $testRoot -ManifestTransientFailures 2 -BundleTransientFailures 2
  if ($retryResult.ManifestRetries -ne 3 -or $retryResult.BundleRetries -ne 3) {
    throw "Transient sharing retry count was not exact: manifest=$($retryResult.ManifestRetries), bundle=$($retryResult.BundleRetries)."
  }
  if (-not (Test-BytesEqual $newManifest ([IO.File]::ReadAllBytes($manifestDestination))) -or -not (Test-BytesEqual $newBundle ([IO.File]::ReadAllBytes($bundleDestination)))) {
    throw 'Transient sharing retry test did not publish both candidate byte sequences.'
  }
  Write-Output 'PASS: transient sharing retries published both outputs after bounded retries.'
}

$primaryError = $null
try {
  New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null
  $generatorArgs = @('-RepoRoot', $repoRoot, '-OutputPath', $tempManifest)
  Invoke-Step 'scripts/generate-docs-manifest.ps1 (temporary output)' 'generate-docs-manifest.ps1' $generatorArgs
  $appGeneratorArgs = @('-RepoRoot', $repoRoot, '-ManifestPath', $tempManifest, '-OutputPath', $tempBundle)
  Invoke-Step 'scripts/generate-app-docs-manifest.ps1 (temporary output)' 'generate-app-docs-manifest.ps1' $appGeneratorArgs
  Invoke-Step 'scripts/verify-docs-browser.ps1 (staged outputs)' 'verify-docs-browser.ps1' @('-ManifestPath', $tempManifest)
  Invoke-Step 'scripts/verify-app-docs-bundle.ps1 (staged outputs)' 'verify-app-docs-bundle.ps1' @('-ManifestPath', $tempManifest, '-BundlePath', $tempBundle)
  if ((Get-ManifestGeneration $tempManifest) -cne (Get-BundleGeneration $tempBundle)) {
    throw 'Staged manifest and app bundle generations differ; mixed documentation generations are refused.'
  }
  if ($SelfTest) { Invoke-TransactionSelfTests $tempRoot }
  if ($Update) {
    $transaction = Invoke-TwoOutputTransaction -ManifestSource $tempManifest -BundleSource $tempBundle -ManifestDestination $manifestPath -BundleDestination $bundlePath -StageRoot $tempRoot
    Write-Output "PASS: explicit -Update published one generation across both outputs (manifest retries $($transaction.ManifestRetries), bundle retries $($transaction.BundleRetries))."
  } else {
    if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf) -or -not (Test-Path -LiteralPath $bundlePath -PathType Leaf)) {
      throw 'Checked-in documentation outputs are missing; use -Update to publish one validated generation.'
    }
    if ((Get-FileHash -LiteralPath $tempManifest -Algorithm SHA256).Hash -cne (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash) {
      throw 'Checked-in site manifest differs from the deterministic temporary output.'
    }
    if ((Get-FileHash -LiteralPath $tempBundle -Algorithm SHA256).Hash -cne (Get-FileHash -LiteralPath $bundlePath -Algorithm SHA256).Hash) {
      throw 'Checked-in app bundle differs from the deterministic temporary output.'
    }
    if ((Get-ManifestGeneration $manifestPath) -cne (Get-BundleGeneration $bundlePath)) {
      throw 'Checked-in manifest and app bundle generations differ; mixed documentation generations are refused.'
    }
    Write-Output 'PASS: temporary generated outputs match checked-in documentation outputs.'
  }
  $verifyArgs = @()
  if ($SelfTest) { $verifyArgs += '-SelfTest' }
  if ($RequireCentralMount) { $verifyArgs += '-RequireCentralMount' }
  Invoke-Step 'scripts/verify-docs-browser.ps1 (checked-in outputs)' 'verify-docs-browser.ps1' $verifyArgs
  Invoke-Step 'scripts/verify-app-docs-bundle.ps1 (checked-in outputs)' 'verify-app-docs-bundle.ps1' $verifyArgs
} catch {
  $primaryError = $_.Exception
}

$cleanupError = $null
try {
  Remove-StagingWithRetry $tempRoot -InjectFailure:$InjectCleanupFailure
} catch {
  $cleanupError = $_.Exception
}
if ($primaryError) {
  if ($cleanupError) {
    throw "Primary diagnostic preserved: $($primaryError.Message). Staging retained at $tempRoot. Cleanup also failed: $($cleanupError.Message)"
  }
  throw $primaryError
}
if ($cleanupError) {
  throw "Documentation verification completed but staging was retained at $($tempRoot): $($cleanupError.Message)"
}

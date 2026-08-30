[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ("squirrel-path-regression-" + [guid]::NewGuid().ToString('N'))
$artifactRoot = Join-Path $tempRoot 'artifact'
$outsidePath = Join-Path $tempRoot 'outside.log'
$linkPath = Join-Path $artifactRoot 'linked.log'
$provenancePath = Join-Path $artifactRoot 'build-provenance.json'

try {
  New-Item -ItemType Directory -Path $artifactRoot -Force | Out-Null
  Set-Content -LiteralPath $outsidePath -Value 'outside artifact directory' -Encoding utf8
  try {
    New-Item -ItemType SymbolicLink -Path $linkPath -Target $outsidePath -ErrorAction Stop | Out-Null
  } catch {
    $linkPath = Join-Path (Join-Path $artifactRoot '..') 'outside.log'
    Write-Output 'Symbolic-link subtest skipped: symbolic links are unavailable on this host.'
  }
  $relativeLogPath = if ($linkPath -eq (Join-Path $artifactRoot 'linked.log')) { 'linked.log' } else { '../outside.log' }
  $provenance = [ordered]@{
    version = 1
    cleanOutput = $true
    packagingCommand = 'path-regression'
    provenanceStatus = 'unavailable'
    buildLog = [ordered]@{ path = $relativeLogPath; sha256 = ('0' * 64) }
    package = [ordered]@{ id = 'fixture'; version = '0.0.0'; architecture = 'x64' }
    signing = [ordered]@{
      inputsCleared = $true
      certificateAutoDiscoveryDisabled = $true
      processAuditComplete = $true
      signerInvocationCount = 0
      observedSignerInvocations = @()
      controls = [ordered]@{ forceCodeSigning = $false; signExecutable = $false; signAndEditExecutable = $false }
    }
  }
  $provenance | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $provenancePath -Encoding utf8
  $outputPath = Join-Path $artifactRoot 'receipt.json'
  $previousErrorActionPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    $output = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'verify-squirrel-artifacts.ps1') `
      -ArtifactDirectory $artifactRoot `
      -ProvenancePath $provenancePath `
      -ExpectedCommit ('0' * 40) `
      -SetupFile 'Setup.exe' `
      -ExpectedPackageId 'fixture' `
      -ExpectedVersion '0.0.0' `
      -ExpectedArchitecture x64 `
      -RequiredPackageEntry 'fixture.exe' `
      -MetadataFile 'metadata.json' `
      -IconFile 'icon.ico' `
      -OutputPath $outputPath 2>&1 | Out-String
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  if ($LASTEXITCODE -eq 0) { throw 'the artifact verifier accepted an unsafe path beneath ArtifactDirectory' }
  if ($linkPath -eq (Join-Path $artifactRoot 'linked.log') -and $output -notmatch 'reparse point') {
    throw "the artifact verifier rejected the symlink without naming the reparse boundary: $output"
  }
  if ($linkPath -eq (Join-Path (Join-Path $artifactRoot '..') 'outside.log') -and $output -notmatch 'relative file') {
    throw "the artifact verifier rejected traversal without naming the relative-path boundary: $output"
  }
  Write-Output 'Path safety regression passed: unsafe artifact path was rejected.'
} finally {
  if (Test-Path -LiteralPath $tempRoot) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}

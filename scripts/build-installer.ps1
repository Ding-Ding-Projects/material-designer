[CmdletBinding()]
param(
  [ValidateRange(0, 2147483647)]
  [int]$Candidate = 0,
  [switch]$Silent,
  [switch]$ReusePackResult,
  [string]$ProvenanceFile
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$design = Join-Path $repo 'design'
$liveSessionRoot = $env:MD_LANG_GUI_LIVE_SESSION_ROOT
$liveNonce = $env:MD_LANG_GUI_LIVE_NONCE
if ([string]::IsNullOrWhiteSpace($liveSessionRoot) -xor [string]::IsNullOrWhiteSpace($liveNonce)) { throw 'Live proof session root and nonce must be supplied together' }
if (-not [string]::IsNullOrWhiteSpace($liveSessionRoot)) {
  $liveSessionRoot = [IO.Path]::GetFullPath($liveSessionRoot)
  if (-not (Test-Path -LiteralPath $liveSessionRoot -PathType Container)) { throw 'Live proof session root does not exist' }
  if ((Get-Item -LiteralPath $liveSessionRoot -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Live proof session root is a reparse point' }
  if ($liveNonce -notmatch '^[0-9a-f]{64}$') { throw 'Live proof nonce is invalid' }
  $stateRoot = Join-Path $liveSessionRoot 'installer'
} else {
  $stateRoot = Join-Path $repo '.yum-tong\installer'
}
$runRoot = Join-Path $stateRoot ("candidate-{0}" -f $Candidate)

function Invoke-Checked([string]$File, [string[]]$Arguments, [string]$Description) {
  Write-Host $Description
  & $File @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$Description failed with exit code $LASTEXITCODE" }
}

function Get-Sha256([string]$Path) {
  $sha = [Security.Cryptography.SHA256]::Create()
  try {
    $stream = [IO.File]::OpenRead($Path)
    try { return ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
    finally { $stream.Dispose() }
  } finally { $sha.Dispose() }
}

function Get-SignatureStatus([string]$Path) {
  $command = Get-Command Get-AuthenticodeSignature -ErrorAction SilentlyContinue
  if ($command) {
    try {
      $result = & $command -LiteralPath $Path -ErrorAction Stop
      if ($result -and $result.Status) { return $result.Status.ToString() }
    } catch {
      # Windows PowerShell can discover this cmdlet while failing to load its
      # security module. Fall through to the installed PowerShell 7 host.
    }
  }
  $pwsh = Get-Command pwsh.exe -ErrorAction SilentlyContinue
  if ($pwsh) {
    $oldPath = $env:YUM_TONG_SIGNATURE_PATH
    $env:YUM_TONG_SIGNATURE_PATH = $Path
    try {
      $status = & $pwsh.Source -NoProfile -Command '$s = Get-AuthenticodeSignature -LiteralPath $env:YUM_TONG_SIGNATURE_PATH; [Console]::Out.Write($s.Status.ToString())' 2>$null
      if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($status)) { return $status.Trim() }
    } finally {
      if ($null -eq $oldPath) { Remove-Item Env:YUM_TONG_SIGNATURE_PATH -ErrorAction SilentlyContinue }
      else { $env:YUM_TONG_SIGNATURE_PATH = $oldPath }
    }
  }
  throw 'could not obtain a Windows Authenticode status from Windows PowerShell or PowerShell 7'
}

function Test-ProvenanceTimestamp([string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) { return $false }
  if ($Value -notmatch '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$') { return $false }
  $calendar = [DateTime]::MinValue
  $calendarText = $Value.Substring(0, 19)
  if (-not [DateTime]::TryParseExact(
      $calendarText,
      'yyyy-MM-ddTHH:mm:ss',
      [Globalization.CultureInfo]::InvariantCulture,
      [Globalization.DateTimeStyles]::None,
      [ref]$calendar)) { return $false }
  $parsed = [DateTimeOffset]::MinValue
  return [DateTimeOffset]::TryParse(
    $Value,
    [Globalization.CultureInfo]::InvariantCulture,
    [Globalization.DateTimeStyles]::RoundtripKind,
    [ref]$parsed)
}

& (Join-Path $PSScriptRoot 'build.ps1') -Silent
if (-not $?) { throw 'the prerequisite build did not complete' }

$pkg = Get-Content -Raw -LiteralPath (Join-Path $design 'package.json') | ConvertFrom-Json
$base = [version]$pkg.version
$appVersion = "{0}.{1}.{2}" -f $base.Major, $base.Minor, ($base.Build + $Candidate)
$resolutionPath = Join-Path $repo '.yum-tong\build\dependency-resolution.json'
if (-not (Test-Path -LiteralPath $resolutionPath -PathType Leaf)) { throw 'dependency resolution record is missing; run build.bat first' }
$resolution = Get-Content -Raw -LiteralPath $resolutionPath | ConvertFrom-Json
$compiler = $resolution.compiler
if ($null -eq $compiler -or [string]::IsNullOrWhiteSpace([string]$compiler.clPath) -or -not (Test-Path -LiteralPath $compiler.clPath -PathType Leaf)) { throw 'dependency resolution record has no usable compiler environment' }
if ($null -ne $compiler.environment) {
  foreach ($property in $compiler.environment.psobject.Properties) {
    [Environment]::SetEnvironmentVariable($property.Name, [string]$property.Value, 'Process')
  }
}
$gitPath = [string]$resolution.tools.git.executable
if ([string]::IsNullOrWhiteSpace($gitPath) -or -not (Test-Path -LiteralPath $gitPath -PathType Leaf)) { throw 'dependency resolution record has no usable Git executable' }
$pnpmPath = [string]$resolution.tools.pnpm.executable
if ([string]::IsNullOrWhiteSpace($pnpmPath) -or -not (Test-Path -LiteralPath $pnpmPath -PathType Leaf)) { throw 'dependency resolution record has no usable pnpm executable' }
$sha = (& $gitPath -C $repo rev-parse HEAD 2>$null).Trim()
if ($sha -notmatch '^[0-9a-fA-F]{40}$') { throw 'could not resolve the exact source commit for installer provenance' }
$packDir = Join-Path $runRoot 'pack'
$cacheDir = Join-Path $runRoot 'cache'
$jsonPath = Join-Path $runRoot 'tools-pack.json'
$buildLogPath = Join-Path $runRoot 'installer-build.log'
New-Item -ItemType Directory -Force -Path $packDir, $cacheDir | Out-Null

if ($ReusePackResult -and (Test-Path -LiteralPath $jsonPath)) {
  $sourceRecord = Join-Path $runRoot 'pack-source.json'
  if (-not (Test-Path -LiteralPath $sourceRecord -PathType Leaf)) { throw 'reused tools-pack output has no source-commit record' }
  $record = Get-Content -Raw -LiteralPath $sourceRecord | ConvertFrom-Json
  if ($record.schemaVersion -ne 1 -or $record.sourceCommit -ne $sha -or $record.version -ne $appVersion) {
    throw 'reused tools-pack output is stale for the current source commit or package version'
  }
}
if (-not ($ReusePackResult -and (Test-Path -LiteralPath $jsonPath))) {
  Remove-Item -LiteralPath $packDir, $cacheDir -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force -Path $packDir, $cacheDir | Out-Null
  $previousErrorAction = $ErrorActionPreference
  try {
    # pnpm writes phase diagnostics to stderr even when packaging succeeds. Windows
    # PowerShell promotes native stderr to ErrorRecords under Stop, so collect it
    # without turning a healthy pack into a false failure; the exit code remains
    # the deciding result.
    $ErrorActionPreference = 'Continue'
    $output = & $pnpmPath --dir $design exec tools-pack win build --dir $packDir --cache-dir $cacheDir --namespace release-stable-win --app-version $appVersion --to squirrel --json 2>&1
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorAction
  }
  if ($exitCode -ne 0) { throw "tools-pack Windows packaging failed with exit code $exitCode`n$($output -join [Environment]::NewLine)" }
  $output | Set-Content -LiteralPath $buildLogPath -Encoding utf8
  $jsonText = Get-Content -Raw -LiteralPath $buildLogPath
  $jsonStart = $jsonText.LastIndexOf("`n{")
  if ($jsonStart -lt 0) { $jsonStart = $jsonText.IndexOf('{') - 1 }
  if ($jsonStart -lt 0) { throw "tools-pack produced no JSON result; see $buildLogPath" }
  $jsonText.Substring($jsonStart + 1).Trim() | Set-Content -LiteralPath $jsonPath -Encoding utf8
  [ordered]@{ schemaVersion = 1; sourceCommit = $sha; version = $appVersion } |
    ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $runRoot 'pack-source.json') -Encoding utf8
} else {
  Write-Host "Reusing the existing tools-pack result at $jsonPath"
}
$jsonText = Get-Content -Raw -LiteralPath $jsonPath
# The packer emits human-readable phase lines before one pretty-printed JSON
# document. Parsing individual output records misses that document because its
# properties span many lines (and native stderr records are not always strings).
$json = $null
try { $json = $jsonText | ConvertFrom-Json } catch { $json = $null }
if ($null -eq $json) {
  # A reused result is already the isolated JSON document. A raw historical
  # result may still carry phase lines, so fall back to its final object.
  $jsonStart = $jsonText.LastIndexOf("`n{")
  if ($jsonStart -lt 0) { $jsonStart = $jsonText.IndexOf('{') - 1 }
  if ($jsonStart -ge 0) {
    $jsonCandidateText = $jsonText.Substring($jsonStart + 1).Trim()
    try { $json = $jsonCandidateText | ConvertFrom-Json } catch { $json = $null }
  }
}
if ($null -eq $json) { throw "tools-pack produced no JSON result; see $jsonPath" }

$setup = $json.squirrelSetupPath
if ([string]::IsNullOrWhiteSpace($setup)) { $setup = $json.installerPath }
if ([string]::IsNullOrWhiteSpace($setup) -or -not (Test-Path -LiteralPath $setup)) { throw "the packer did not produce Setup.exe" }
$signatureStatus = Get-SignatureStatus $setup
if ($signatureStatus -ne 'NotSigned') { throw "Setup.exe Authenticode status was $signatureStatus; unsigned packaging requires NotSigned" }

$setupItem = Get-Item -LiteralPath $setup
$squirrelRoot = $setupItem.DirectoryName
$releases = Get-ChildItem -LiteralPath $squirrelRoot -Recurse -File -Filter RELEASES | Select-Object -First 1
if (-not $releases) { throw 'the Squirrel RELEASES index was not produced' }
$full = @(Get-ChildItem -LiteralPath $squirrelRoot -Recurse -File -Filter '*-full.nupkg')
if ($full.Count -eq 0) { throw 'the Squirrel full .nupkg package was not produced' }
$delta = @(Get-ChildItem -LiteralPath $squirrelRoot -Recurse -File -Filter '*-delta.nupkg')
$assetDir = Join-Path $runRoot 'assets'
if (Test-Path -LiteralPath $assetDir) { Remove-Item -LiteralPath $assetDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path $assetDir | Out-Null
$setupName = "material-designer-$appVersion-win-x64-setup.exe"
Copy-Item -LiteralPath $setupItem.FullName -Destination (Join-Path $assetDir $setupName) -Force
Copy-Item -LiteralPath $releases.FullName -Destination (Join-Path $assetDir 'RELEASES') -Force
foreach ($item in @($full + $delta)) { Copy-Item -LiteralPath $item.FullName -Destination (Join-Path $assetDir $item.Name) -Force }
$icon = Join-Path $design 'tools/pack/resources/win/icon.ico'
if (-not (Test-Path -LiteralPath $icon -PathType Leaf)) { throw 'the packaged icon source is missing' }
Copy-Item -LiteralPath $icon -Destination (Join-Path $assetDir 'material-designer.ico') -Force
$hash = Get-Sha256 (Join-Path $assetDir $setupName)
"$hash  $setupName" | Set-Content -LiteralPath (Join-Path $assetDir "$setupName.sha256") -Encoding ascii

$provenancePath = Join-Path $runRoot 'build-provenance.json'
$provenance = [ordered]@{
  version = 1
  provenanceStatus = 'unavailable'
  reason = 'No externally supplied build provenance record was provided to this local build'
  packagingCommand = 'build-installer.bat /s'
  cleanOutput = $true
  package = [ordered]@{ id = 'open-design-packaged-app'; version = $appVersion; architecture = 'x64' }
  buildLog = [ordered]@{ path = [IO.Path]::GetFullPath($buildLogPath); sha256 = Get-Sha256 $buildLogPath }
  signing = [ordered]@{
    inputsCleared = $true
    certificateAutoDiscoveryDisabled = $true
    processAuditComplete = $false
    signerInvocationCount = 0
    observedSignerInvocations = @()
    controls = [ordered]@{ forceCodeSigning = $false; signExecutable = $false; signAndEditExecutable = $false }
  }
}
if (-not [string]::IsNullOrWhiteSpace($liveSessionRoot)) { $provenance.liveProof = [ordered]@{ nonce = $liveNonce; sessionRoot = $liveSessionRoot; producer = 'scripts/build-installer.ps1' } }
if ($provenanceIsValid) {
  $provenance.provenanceStatus = 'verified'
  $provenance.sourceCommit = $sha
  $provenance.updatedAt = $external.updatedAt
  $provenance.external = [ordered]@{ schemaVersion = 1; sourceCommit = $sha; version = $appVersion; updatedAt = $external.updatedAt; source = 'external-record' }
}
$provenance | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $provenancePath -Encoding utf8
$releaseBase = 'https://github.com/Ding-Ding-Projects/material-designer/releases'
$metadata = [ordered]@{
  schemaVersion = 1
  channel = 'stable'
  releaseVersion = $appVersion
  signed = $false
  releaseNotesUrl = $releaseBase
  platforms = [ordered]@{ win = [ordered]@{ enabled = $true; arch = 'x64'; artifacts = [ordered]@{ installer = [ordered]@{ type = 'installer'; name = 'Setup.exe'; url = "$releaseBase/download/v$appVersion-r$Candidate.1/$setupName"; size = [int64](Get-Item -LiteralPath (Join-Path $assetDir $setupName)).Length; sha256 = $hash; sha256Url = "$releaseBase/download/v$appVersion-r$Candidate.1/$setupName.sha256" } } } }
}
$metadata | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $assetDir 'metadata.json') -Encoding utf8
$manifest = [ordered]@{
  schemaVersion = 1
  commit = $sha
  candidate = $Candidate
  version = $appVersion
  signed = $false
  signatureStatus = $signatureStatus
  setup = $setupName
  setupSha256 = $hash
  setupBytes = (Get-Item -LiteralPath (Join-Path $assetDir $setupName)).Length
  releases = 'RELEASES'
  fullPackages = @($full | ForEach-Object Name)
  deltaPackages = @($delta | ForEach-Object Name)
  installerFormat = 'squirrel'
  provenanceStatus = $provenance.provenanceStatus
}
if (-not [string]::IsNullOrWhiteSpace($liveSessionRoot)) { $manifest.liveProof = [ordered]@{ nonce = $liveNonce; sessionRoot = $liveSessionRoot; producer = 'scripts/build-installer.ps1' } }
$manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $runRoot 'installer-manifest.json') -Encoding utf8
Write-Host "Unsigned installer: $([IO.Path]::GetFullPath((Join-Path $assetDir $setupName)))"
Write-Host "SHA-256: $hash"
Write-Host "Manifest: $([IO.Path]::GetFullPath((Join-Path $runRoot 'installer-manifest.json')))"
Write-Host "Provenance: $([IO.Path]::GetFullPath($provenancePath))"
if ($provenance.provenanceStatus -eq 'unavailable') {
  Write-Warning 'No external build provenance record was supplied; updated-at is unavailable and the local artifact is not a provenance-bound release.'
}
$receiptPath = Join-Path $runRoot 'artifact-receipt.json'
$validator = Join-Path $repo 'scripts/verify-squirrel-artifacts.ps1'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $validator `
  -ArtifactDirectory $assetDir `
  -ProvenancePath $provenancePath `
  -ExpectedCommit $sha `
  -SetupFile $setupName `
  -ExpectedPackageId 'open-design-packaged-app' `
  -ExpectedVersion $appVersion `
  -ExpectedArchitecture x64 `
  -RequiredPackageEntry 'lib/net45/Material Designer.exe' `
  -MetadataFile 'metadata.json' `
  -IconFile 'material-designer.ico' `
  -OutputPath $receiptPath
if ($LASTEXITCODE -ne 0) { throw "the shared Squirrel validator failed with exit code $LASTEXITCODE" }
Write-Warning 'The local artifact is unsigned. The shared Squirrel validator completed without hosted signer observation.'

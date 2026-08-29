[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateRange(1, 2147483647)]
  [int]$Candidate,
  [switch]$Silent,
  [switch]$ReusePackResult
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
New-Item -ItemType Directory -Force -Path $runRoot | Out-Null

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
if ($LASTEXITCODE -ne 0) { throw 'the prerequisite build did not complete' }

$pkg = Get-Content -Raw -LiteralPath (Join-Path $design 'package.json') | ConvertFrom-Json
$base = [version]$pkg.version
$appVersion = "{0}.{1}.{2}" -f $base.Major, $base.Minor, ($base.Build + $Candidate)
$buildSourceCommit = (& git -C $repo rev-parse HEAD).Trim()
if ($buildSourceCommit -notmatch '^[0-9a-fA-F]{40}$') { throw 'could not resolve the source commit for the installer manifest' }
$buildProvenanceVersion = $env:OD_BUILD_VERSION
$buildProvenanceSourceCommit = $env:OD_BUILD_SOURCE_COMMIT
$buildProvenanceUpdatedAt = $env:OD_BUILD_UPDATED_AT
$provenanceIsValid =
  -not [string]::IsNullOrWhiteSpace($buildProvenanceVersion) -and
  $buildProvenanceVersion.Trim() -eq $appVersion -and
  $buildProvenanceSourceCommit -match '^[0-9a-fA-F]{40}$' -and
  $buildProvenanceSourceCommit.Trim().ToLowerInvariant() -eq $buildSourceCommit.ToLowerInvariant() -and
  (Test-ProvenanceTimestamp $buildProvenanceUpdatedAt)
if ($provenanceIsValid) {
  $env:OD_BUILD_VERSION = $buildProvenanceVersion.Trim()
  $env:OD_BUILD_SOURCE_COMMIT = $buildProvenanceSourceCommit.Trim().ToLowerInvariant()
  $env:OD_BUILD_UPDATED_AT = $buildProvenanceUpdatedAt.Trim()
} else {
  Remove-Item Env:OD_BUILD_VERSION, Env:OD_BUILD_SOURCE_COMMIT, Env:OD_BUILD_UPDATED_AT -ErrorAction SilentlyContinue
  Write-Warning 'No externally supplied version-bound build provenance was accepted; the packaged front screen will show provenance unavailable.'
}
$packDir = Join-Path $runRoot 'pack'
$cacheDir = Join-Path $runRoot 'cache'
$jsonPath = Join-Path $runRoot 'tools-pack.json'
$buildLogPath = Join-Path $runRoot 'installer-build.log'
New-Item -ItemType Directory -Force -Path $packDir, $cacheDir | Out-Null

if (-not ($ReusePackResult -and (Test-Path -LiteralPath $jsonPath))) {
  $previousErrorAction = $ErrorActionPreference
  try {
    # pnpm writes phase diagnostics to stderr even when packaging succeeds. Windows
    # PowerShell promotes native stderr to ErrorRecords under Stop, so collect it
    # without turning a healthy pack into a false failure; the exit code remains
    # the deciding result.
    $ErrorActionPreference = 'Continue'
    $output = & pnpm.cmd --dir $design exec tools-pack win build --dir $packDir --cache-dir $cacheDir --namespace release-stable-win --app-version $appVersion --to squirrel --json 2>&1
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
New-Item -ItemType Directory -Force -Path $assetDir | Out-Null
$setupName = "material-designer-$appVersion-win-x64-setup.exe"
Copy-Item -LiteralPath $setupItem.FullName -Destination (Join-Path $assetDir $setupName) -Force
Copy-Item -LiteralPath $releases.FullName -Destination (Join-Path $assetDir 'RELEASES') -Force
foreach ($item in @($full + $delta)) { Copy-Item -LiteralPath $item.FullName -Destination (Join-Path $assetDir $item.Name) -Force }
$icon = Join-Path $design 'tools/pack/resources/win/icon.ico'
if (Test-Path -LiteralPath $icon) { Copy-Item -LiteralPath $icon -Destination (Join-Path $assetDir 'material-designer.ico') -Force }
$hash = Get-Sha256 (Join-Path $assetDir $setupName)
"$hash  $setupName" | Set-Content -LiteralPath (Join-Path $assetDir "$setupName.sha256") -Encoding ascii

$sha = $buildSourceCommit
$provenancePath = Join-Path $runRoot 'build-provenance.json'
$provenance = [ordered]@{
  version = 1
  packagingCommand = 'build-installer.bat --candidate <ordinal> /s'
  cleanOutput = $true
  package = [ordered]@{ id = 'open-design-packaged-app'; version = $appVersion; architecture = 'x64' }
  buildLog = [ordered]@{ path = $buildLogPath; sha256 = Get-Sha256 $buildLogPath }
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
  $provenance.sourceCommit = $env:OD_BUILD_SOURCE_COMMIT
  $provenance.builtAt = $env:OD_BUILD_UPDATED_AT
} else {
  $provenance.provenanceStatus = 'unavailable'
}
$provenance | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $provenancePath -Encoding utf8
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
}
if (-not [string]::IsNullOrWhiteSpace($liveSessionRoot)) { $manifest.liveProof = [ordered]@{ nonce = $liveNonce; sessionRoot = $liveSessionRoot; producer = 'scripts/build-installer.ps1' } }
$manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $runRoot 'installer-manifest.json') -Encoding utf8
Write-Host "Unsigned installer: $([IO.Path]::GetFullPath((Join-Path $assetDir $setupName)))"
Write-Host "SHA-256: $hash"
Write-Host "Manifest: $([IO.Path]::GetFullPath((Join-Path $runRoot 'installer-manifest.json')))"
Write-Host "Provenance: $([IO.Path]::GetFullPath($provenancePath))"
Write-Warning 'The manual build recorded package and signing controls, but signer-process observation is incomplete; run the hosted artifact validator before publication.'

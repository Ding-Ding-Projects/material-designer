[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ArtifactDirectory,
  [Parameter(Mandatory = $true)][string]$ProvenancePath,
  [Parameter(Mandatory = $true)][ValidatePattern('^[0-9a-fA-F]{40}$')][string]$ExpectedCommit,
  [Parameter(Mandatory = $true)][string]$SetupFile,
  [Parameter(Mandatory = $true)][string]$ExpectedPackageId,
  [Parameter(Mandatory = $true)][string]$ExpectedVersion,
  [Parameter(Mandatory = $true)][ValidateSet('x64', 'arm64')][string]$ExpectedArchitecture,
  [Parameter(Mandatory = $true)][string]$RequiredPackageEntry,
  [Parameter(Mandatory = $true)][string]$MetadataFile,
  [Parameter(Mandatory = $true)][string]$IconFile,
  [Parameter(Mandatory = $true)][string]$OutputPath,
  [switch]$RequireDelta
)

$ErrorActionPreference = 'Stop'

function Get-LowerHash([string]$Path, [string]$Algorithm) {
  return (Get-FileHash -LiteralPath $Path -Algorithm $Algorithm).Hash.ToLowerInvariant()
}

$root = [IO.Path]::GetFullPath($ArtifactDirectory)
if (-not (Test-Path -LiteralPath $root -PathType Container)) { throw "Artifact directory is missing: $root" }
$provenanceFile = [IO.Path]::GetFullPath($ProvenancePath)
if (-not (Test-Path -LiteralPath $provenanceFile -PathType Leaf)) { throw "Build provenance is missing: $provenanceFile" }
$provenance = Get-Content -Raw -LiteralPath $provenanceFile | ConvertFrom-Json
if ($provenance.version -ne 1) { throw 'Build provenance version must be 1' }
if ($provenance.cleanOutput -ne $true) { throw 'Build provenance does not assert a clean output directory' }
if ([string]::IsNullOrWhiteSpace($provenance.packagingCommand)) { throw 'Build provenance packaging command is missing' }
$provenanceStatus = [string]$provenance.provenanceStatus
if ($provenanceStatus -eq 'unavailable') {
  if ($null -ne $provenance.sourceCommit -or $null -ne $provenance.builtAt) {
    throw 'Unavailable build provenance must not carry partial identity fields'
  }
} else {
  if ($provenanceStatus -ne 'verified') { throw 'Build provenance status must be verified or unavailable' }
  if ($provenance.sourceCommit -ne $ExpectedCommit.ToLowerInvariant()) { throw 'Build provenance source commit does not match the requested commit' }
  $builtAt = [DateTimeOffset]::MinValue
  $calendar = [DateTime]::MinValue
  $builtAtText = [string]$provenance.builtAt
  if ($builtAtText.Length -lt 19 -or
      $builtAtText -notmatch '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$' -or
      -not [DateTime]::TryParseExact(
        $builtAtText.Substring(0, 19),
        'yyyy-MM-ddTHH:mm:ss',
        [Globalization.CultureInfo]::InvariantCulture,
        [Globalization.DateTimeStyles]::None,
        [ref]$calendar) -or
      -not [DateTimeOffset]::TryParse(
        $builtAtText,
        [Globalization.CultureInfo]::InvariantCulture,
        [Globalization.DateTimeStyles]::RoundtripKind,
        [ref]$builtAt)) { throw 'Build provenance timestamp is invalid' }
}
if ([string]::IsNullOrWhiteSpace($provenance.buildLog.path) -or -not (Test-Path -LiteralPath $provenance.buildLog.path -PathType Leaf)) { throw 'Build provenance log is missing' }
if ($provenance.buildLog.sha256 -ne (Get-LowerHash $provenance.buildLog.path 'SHA256')) { throw 'Build provenance log hash does not match' }
if ($provenance.package.id -ne $ExpectedPackageId -or $provenance.package.version -ne $ExpectedVersion -or $provenance.package.architecture -ne $ExpectedArchitecture) {
  throw 'Build provenance package identity does not match the requested package'
}
if ($provenance.signing.inputsCleared -ne $true -or $provenance.signing.certificateAutoDiscoveryDisabled -ne $true -or $provenance.signing.processAuditComplete -ne $true) {
  throw 'Build provenance does not contain the required signing-process audit'
}
if ($provenance.signing.signerInvocationCount -ne 0 -or @($provenance.signing.observedSignerInvocations).Count -ne 0) {
  throw 'A signer invocation was observed during the unsigned build'
}
foreach ($control in @('forceCodeSigning', 'signExecutable', 'signAndEditExecutable')) {
  if ($provenance.signing.controls.$control -ne $false) { throw "Signing control '$control' must be false" }
}

$setupName = [IO.Path]::GetFileName($SetupFile)
if ($setupName -cne $SetupFile -or $SetupFile.Contains('..')) { throw "Unsafe setup filename: $SetupFile" }
$setupPath = Join-Path $root $setupName
$releasesPath = Join-Path $root 'RELEASES'
if (-not (Test-Path -LiteralPath $setupPath -PathType Leaf)) { throw "Setup executable is missing: $SetupFile" }
if (-not (Test-Path -LiteralPath $releasesPath -PathType Leaf)) { throw 'Squirrel RELEASES is missing' }
$signature = Get-AuthenticodeSignature -LiteralPath $setupPath
if ($signature.Status -ne 'NotSigned') { throw "Setup Authenticode status was $($signature.Status), expected NotSigned" }
$setupFiles = @(Get-ChildItem -LiteralPath $root -File -Filter '*.exe')
if ($setupFiles.Count -ne 1 -or $setupFiles[0].Name -cne $setupName) { throw 'Artifact directory must contain exactly one intended setup executable' }

$packageFiles = @(Get-ChildItem -LiteralPath $root -File -Filter '*.nupkg')
$fullPackages = @($packageFiles | Where-Object Name -Like '*-full.nupkg')
$deltaPackages = @($packageFiles | Where-Object Name -Like '*-delta.nupkg')
if ($fullPackages.Count -eq 0) { throw 'No full Squirrel package was produced' }
if ($RequireDelta -and $deltaPackages.Count -eq 0) { throw 'A delta package was required but none was produced' }

$indexed = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
$releaseRows = @()
foreach ($line in Get-Content -LiteralPath $releasesPath) {
  if ([string]::IsNullOrWhiteSpace($line)) { continue }
  if ($line -notmatch '^([0-9a-fA-F]{40})\s+([^\s]+)\s+(\d+)$') { throw "Malformed RELEASES row: $line" }
  $sha1 = $Matches[1].ToLowerInvariant()
  $name = $Matches[2]
  $bytes = [int64]$Matches[3]
  if ([IO.Path]::GetFileName($name) -cne $name -or $name.Contains('..')) { throw "Unsafe package path in RELEASES: $name" }
  if (-not $name.EndsWith('.nupkg', [StringComparison]::OrdinalIgnoreCase)) { throw "RELEASES row is not a NuGet package: $name" }
  if ($bytes -le 0) { throw "RELEASES row has a non-positive byte length: $name" }
  if (-not $indexed.Add($name)) { throw "Duplicate package row in RELEASES: $name" }
  $packagePath = Join-Path $root $name
  if (-not (Test-Path -LiteralPath $packagePath -PathType Leaf)) { throw "Indexed package is missing: $name" }
  $item = Get-Item -LiteralPath $packagePath
  if ($item.Length -ne $bytes) { throw "Indexed byte length does not match $name" }
  if ((Get-LowerHash $packagePath 'SHA1') -ne $sha1) { throw "Indexed SHA-1 does not match $name" }
  $releaseRows += [ordered]@{ name = $name; sha1 = $sha1; bytes = $bytes }
}
foreach ($package in $packageFiles) {
  if (-not $indexed.Contains($package.Name)) { throw "Package is not indexed by RELEASES: $($package.Name)" }
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
foreach ($package in $fullPackages) {
  $archive = [IO.Compression.ZipFile]::OpenRead($package.FullName)
  try {
    $nuspec = @($archive.Entries | Where-Object FullName -Like '*.nuspec')
    if ($nuspec.Count -ne 1) { throw "$($package.Name) must contain exactly one nuspec" }
    $reader = [IO.StreamReader]::new($nuspec[0].Open())
    try { [xml]$manifest = $reader.ReadToEnd() } finally { $reader.Dispose() }
    $metadata = $manifest.package.metadata
    if ($metadata.id -ne $ExpectedPackageId -or $metadata.version -ne $ExpectedVersion) { throw "$($package.Name) package identity does not match" }
    if (-not ($archive.Entries | Where-Object FullName -CEQ $RequiredPackageEntry)) { throw "$($package.Name) is missing required entry $RequiredPackageEntry" }
  } finally { $archive.Dispose() }
}

$metadataName = [IO.Path]::GetFileName($MetadataFile)
$iconName = [IO.Path]::GetFileName($IconFile)
if ($metadataName -cne $MetadataFile -or $MetadataFile.Contains('..')) { throw "Unsafe metadata filename: $MetadataFile" }
if ($iconName -cne $IconFile -or $IconFile.Contains('..')) { throw "Unsafe icon filename: $IconFile" }
$metadataPath = Join-Path $root $metadataName
$iconPath = Join-Path $root $iconName
if (-not (Test-Path -LiteralPath $metadataPath -PathType Leaf)) { throw "Update metadata is missing: $metadataName" }
if (-not (Test-Path -LiteralPath $iconPath -PathType Leaf)) { throw "Packaged icon is missing: $iconName" }
$metadata = Get-Content -Raw -LiteralPath $metadataPath | ConvertFrom-Json
$installerMetadata = $metadata.platforms.win.artifacts.installer
if ($metadata.schemaVersion -ne 1 -or $metadata.channel -ne 'stable' -or $metadata.releaseVersion -ne $ExpectedVersion -or $metadata.signed -ne $false) { throw 'Update metadata identity does not match the candidate' }
if ($metadata.platforms.win.enabled -ne $true -or $metadata.platforms.win.arch -ne $ExpectedArchitecture) { throw 'Update metadata platform does not match the candidate' }
if ($installerMetadata.type -ne 'installer' -or $installerMetadata.name -ne 'Setup.exe') { throw 'Update metadata does not identify the Squirrel installer' }
if ([int64]$installerMetadata.size -ne (Get-Item -LiteralPath $setupPath).Length -or $installerMetadata.sha256 -ne (Get-LowerHash $setupPath 'SHA256')) { throw 'Update metadata installer bytes or SHA-256 do not match Setup.exe' }
foreach ($url in @($metadata.releaseNotesUrl, $installerMetadata.url, $installerMetadata.sha256Url)) {
  if ([string]::IsNullOrWhiteSpace($url) -or $url -notmatch '^https://') { throw 'Update metadata URLs must be non-empty HTTPS URLs' }
}
$iconBytes = [IO.File]::ReadAllBytes($iconPath)
if ($iconBytes.Length -lt 6 -or $iconBytes[0] -ne 0 -or $iconBytes[1] -ne 0 -or $iconBytes[2] -ne 1 -or $iconBytes[3] -ne 0) { throw 'Packaged icon is not a valid ICO container' }

$receipt = [ordered]@{
  version = 1
  sourceCommit = $ExpectedCommit.ToLowerInvariant()
  artifactDirectory = '.'
  provenanceSha256 = Get-LowerHash $provenanceFile 'SHA256'
  setup = [ordered]@{ name = $SetupFile; sha256 = Get-LowerHash $setupPath 'SHA256'; bytes = (Get-Item -LiteralPath $setupPath).Length; signatureStatus = 'NotSigned' }
  releases = [ordered]@{ sha256 = Get-LowerHash $releasesPath 'SHA256'; rows = $releaseRows }
  fullPackages = @($fullPackages | ForEach-Object { [ordered]@{ name = $_.Name; sha256 = Get-LowerHash $_.FullName 'SHA256'; bytes = $_.Length } })
  deltaPackages = @($deltaPackages | ForEach-Object { [ordered]@{ name = $_.Name; sha256 = Get-LowerHash $_.FullName 'SHA256'; bytes = $_.Length } })
  metadata = [ordered]@{ name = $metadataName; sha256 = Get-LowerHash $metadataPath 'SHA256'; bytes = (Get-Item -LiteralPath $metadataPath).Length }
  icon = [ordered]@{ name = $iconName; sha256 = Get-LowerHash $iconPath 'SHA256'; bytes = (Get-Item -LiteralPath $iconPath).Length }
  package = [ordered]@{ id = $ExpectedPackageId; version = $ExpectedVersion; architecture = $ExpectedArchitecture; requiredEntry = $RequiredPackageEntry }
}
$outputFullPath = [IO.Path]::GetFullPath($OutputPath)
$outputParent = Split-Path -Parent $outputFullPath
if (-not (Test-Path -LiteralPath $outputParent -PathType Container)) { throw "Receipt parent directory is missing: $outputParent" }
$receipt | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $outputFullPath -Encoding utf8
Write-Host "Verified unsigned Squirrel artifact set: $outputFullPath"

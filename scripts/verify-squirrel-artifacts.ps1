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
if ($provenance.sourceCommit -ne $ExpectedCommit.ToLowerInvariant()) { throw 'Build provenance source commit does not match the requested commit' }
if ($provenance.cleanOutput -ne $true) { throw 'Build provenance does not assert a clean output directory' }
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

$setupPath = Join-Path $root $SetupFile
$releasesPath = Join-Path $root 'RELEASES'
if (-not (Test-Path -LiteralPath $setupPath -PathType Leaf)) { throw "Setup executable is missing: $SetupFile" }
if (-not (Test-Path -LiteralPath $releasesPath -PathType Leaf)) { throw 'Squirrel RELEASES is missing' }
$signature = Get-AuthenticodeSignature -LiteralPath $setupPath
if ($signature.Status -ne 'NotSigned') { throw "Setup Authenticode status was $($signature.Status), expected NotSigned" }

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

$receipt = [ordered]@{
  version = 1
  sourceCommit = $ExpectedCommit.ToLowerInvariant()
  artifactDirectory = $root
  provenanceSha256 = Get-LowerHash $provenanceFile 'SHA256'
  setup = [ordered]@{ name = $SetupFile; sha256 = Get-LowerHash $setupPath 'SHA256'; bytes = (Get-Item -LiteralPath $setupPath).Length; signatureStatus = 'NotSigned' }
  releases = [ordered]@{ sha256 = Get-LowerHash $releasesPath 'SHA256'; rows = $releaseRows }
  fullPackages = @($fullPackages | ForEach-Object { [ordered]@{ name = $_.Name; sha256 = Get-LowerHash $_.FullName 'SHA256'; bytes = $_.Length } })
  deltaPackages = @($deltaPackages | ForEach-Object { [ordered]@{ name = $_.Name; sha256 = Get-LowerHash $_.FullName 'SHA256'; bytes = $_.Length } })
  package = [ordered]@{ id = $ExpectedPackageId; version = $ExpectedVersion; architecture = $ExpectedArchitecture; requiredEntry = $RequiredPackageEntry }
}
$outputFullPath = [IO.Path]::GetFullPath($OutputPath)
$outputParent = Split-Path -Parent $outputFullPath
if (-not (Test-Path -LiteralPath $outputParent -PathType Container)) { throw "Receipt parent directory is missing: $outputParent" }
$receipt | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $outputFullPath -Encoding utf8
Write-Host "Verified unsigned Squirrel artifact set: $outputFullPath"

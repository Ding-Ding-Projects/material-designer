[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ArtifactDirectory,
  [Parameter(Mandatory = $true)][ValidatePattern('^[0-9a-fA-F]{40}$')][string]$ExpectedCommit,
  [Parameter(Mandatory = $true)][string]$ExpectedVersion,
  [string]$MetadataFile = 'metadata.json',
  [string]$ProvenanceFile = 'build-provenance.json'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Hash([string]$Path, [string]$Algorithm = 'SHA256') {
  return (Get-FileHash -LiteralPath $Path -Algorithm $Algorithm).Hash.ToLowerInvariant()
}
function RequiredFile([string]$Name) {
  if ([IO.Path]::GetFileName($Name) -cne $Name -or $Name.Contains('..')) { throw "Unsafe release filename: $Name" }
  $path = Join-Path $root $Name
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Release file is missing: $Name" }
  return $path
}

$root = [IO.Path]::GetFullPath($ArtifactDirectory)
if (-not (Test-Path -LiteralPath $root -PathType Container)) { throw "Release directory is missing: $ArtifactDirectory" }
$setup = RequiredFile 'Setup.exe'
$releases = RequiredFile 'RELEASES'
$metadataPath = RequiredFile $MetadataFile
$provenancePath = RequiredFile $ProvenanceFile
$packages = @(Get-ChildItem -LiteralPath $root -File -Filter '*.nupkg')
if (@($packages | Where-Object Name -Like '*-full.nupkg').Count -eq 0) { throw 'Release has no full Squirrel package' }
$signature = Get-AuthenticodeSignature -LiteralPath $setup
if ($signature.Status -ne 'NotSigned') { throw "Setup.exe signature status is $($signature.Status), expected NotSigned" }

try { $metadata = Get-Content -Raw -LiteralPath $metadataPath | ConvertFrom-Json } catch { throw 'Release metadata is not valid JSON' }
if ($metadata.schemaVersion -ne 1 -or $metadata.releaseVersion -ne $ExpectedVersion -or $metadata.signed -ne $false) { throw 'Release metadata identity or unsigned declaration is invalid' }
$installer = $metadata.platforms.win.artifacts.installer
if ($installer.type -ne 'installer' -or $installer.name -ne 'Setup.exe') { throw 'Release metadata does not identify Setup.exe' }
if ([int64]$installer.size -ne (Get-Item -LiteralPath $setup).Length -or $installer.sha256 -ne (Hash $setup)) { throw 'Release metadata does not match Setup.exe bytes' }
foreach ($url in @($metadata.releaseNotesUrl, $installer.url, $installer.sha256Url)) {
  if ([string]::IsNullOrWhiteSpace($url) -or $url -notmatch '^https://') { throw 'Release metadata contains a non-HTTPS URL' }
}
try { $provenance = Get-Content -Raw -LiteralPath $provenancePath | ConvertFrom-Json } catch { throw 'Release provenance is not valid JSON' }
if ($provenance.sourceCommit -ne $ExpectedCommit.ToLowerInvariant()) { throw 'Release provenance source commit does not match the expected commit' }
if ($provenance.package.version -ne $ExpectedVersion) { throw 'Release provenance version does not match the expected version' }
if ($provenance.provenanceStatus -notin @('verified', 'unavailable')) { throw 'Release provenance status is invalid' }
Write-Output "Release integrity verified for $ExpectedVersion at $($ExpectedCommit.ToLowerInvariant())"
Write-Output "Setup.exe SHA-256: $(Hash $setup)"
Write-Output "Squirrel packages: $($packages.Count)"

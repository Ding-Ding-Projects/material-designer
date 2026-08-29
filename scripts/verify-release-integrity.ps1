[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ArtifactDirectory,
  [Parameter(Mandatory = $true)][ValidatePattern('^[0-9a-fA-F]{40}$')][string]$ExpectedCommit,
  [Parameter(Mandatory = $true)][string]$ExpectedVersion,
  [string]$MetadataFile = 'metadata.json',
  [string]$ProvenanceFile = 'build-provenance.json',
  [string]$ReceiptPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'release-integrity-core.psm1') -Force
$receipt = Test-ReleaseIntegrity -ArtifactDirectory $ArtifactDirectory -ExpectedCommit $ExpectedCommit -ExpectedVersion $ExpectedVersion -MetadataFile $MetadataFile -ProvenanceFile $ProvenanceFile
if ($ReceiptPath) {
  $parent = Split-Path -Parent ([IO.Path]::GetFullPath($ReceiptPath))
  if (-not (Test-Path -LiteralPath $parent -PathType Container)) { throw "Receipt parent directory is missing: $parent" }
  $receipt | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $ReceiptPath -Encoding utf8
}
Write-Output "Release integrity verified for $ExpectedVersion at $($ExpectedCommit.ToLowerInvariant())"
Write-Output "Setup.exe SHA-256: $($receipt.setupSha256)"
Write-Output "Squirrel packages: $($receipt.fullPackages.Count + $receipt.deltaPackages.Count)"

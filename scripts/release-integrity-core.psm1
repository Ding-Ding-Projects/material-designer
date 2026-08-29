Set-StrictMode -Version Latest

function Get-LowerHash {
  param([Parameter(Mandatory = $true)][string]$Path, [string]$Algorithm = 'SHA256')
  return (Get-FileHash -LiteralPath $Path -Algorithm $Algorithm).Hash.ToLowerInvariant()
}

function Assert-ReleaseFile {
  param([Parameter(Mandatory = $true)][string]$Root, [Parameter(Mandatory = $true)][string]$Name)
  if ([IO.Path]::GetFileName($Name) -cne $Name -or $Name.Contains('..')) { throw "Unsafe release filename: $Name" }
  $path = Join-Path $Root $Name
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Release file is missing: $Name" }
  return $path
}

function Assert-ImmutableReleaseUrls {
  param(
    [Parameter(Mandatory = $true)][string]$ReleaseNotesUrl,
    [Parameter(Mandatory = $true)][string]$InstallerUrl,
    [Parameter(Mandatory = $true)][string]$Sha256Url,
    [Parameter(Mandatory = $true)][string]$ExpectedVersion
  )
  $notes = [Uri]$null
  $installer = [Uri]$null
  $checksum = [Uri]$null
  foreach ($value in @($ReleaseNotesUrl, $InstallerUrl, $Sha256Url)) {
    $parsed = [Uri]$null
    if (-not [Uri]::TryCreate($value, [UriKind]::Absolute, [ref]$parsed) -or
        $parsed.Scheme -cne 'https' -or
        $parsed.Host -cne 'github.com' -or
        $parsed.UserInfo -ne '' -or
        $parsed.Query -ne '' -or
        $parsed.Fragment -ne '') {
      throw 'Release metadata URLs must be absolute HTTPS GitHub release URLs without credentials or query state'
    }
    if ($null -eq $notes) { $notes = $parsed }
    elseif ($null -eq $installer) { $installer = $parsed }
    else { $checksum = $parsed }
  }
  $notesMatch = [regex]::Match($notes.AbsoluteUri, '^https://github[.]com/([^/]+)/([^/]+)/releases/tag/([^/?#]+)$')
  $installerMatch = [regex]::Match($installer.AbsoluteUri, '^https://github[.]com/([^/]+)/([^/]+)/releases/download/([^/?#]+)/([^/?#]+)$')
  $checksumMatch = [regex]::Match($checksum.AbsoluteUri, '^https://github[.]com/([^/]+)/([^/]+)/releases/download/([^/?#]+)/([^/?#]+)[.]sha256$')
  if (-not $notesMatch.Success -or -not $installerMatch.Success -or -not $checksumMatch.Success) {
    throw 'Release metadata URLs must use the immutable GitHub release tag/download route'
  }
  for ($index = 1; $index -le 2; $index += 1) {
    if ($notesMatch.Groups[$index].Value -cne $installerMatch.Groups[$index].Value -or
        $notesMatch.Groups[$index].Value -cne $checksumMatch.Groups[$index].Value) {
      throw 'Release metadata URLs must identify one GitHub repository'
    }
  }
  if ($notesMatch.Groups[3].Value -cne $installerMatch.Groups[3].Value -or
      $installerMatch.Groups[3].Value -cne $checksumMatch.Groups[3].Value -or
      $installerMatch.Groups[4].Value -cne $checksumMatch.Groups[4].Value) {
    throw 'Release metadata URLs must identify one immutable release tag and installer checksum'
  }
  if ($installerMatch.Groups[3].Value -ieq 'latest') {
    throw 'Release metadata must not use the mutable latest release route'
  }
  $versionPattern = [regex]::Escape($ExpectedVersion)
  if ($installerMatch.Groups[3].Value -notmatch "^v$versionPattern(?:-|$)") {
    throw 'Release metadata URLs must identify the expected release version'
  }
  if ($installerMatch.Groups[4].Value -notmatch '[.]exe$') {
    throw 'Release metadata installer URL must identify an executable release asset'
  }
}

function Test-ReleaseIntegrity {
  param(
    [Parameter(Mandatory = $true)][string]$ArtifactDirectory,
    [Parameter(Mandatory = $true)][ValidatePattern('^[0-9a-fA-F]{40}$')][string]$ExpectedCommit,
    [Parameter(Mandatory = $true)][string]$ExpectedVersion,
    [string]$MetadataFile = 'metadata.json',
    [string]$ProvenanceFile = 'build-provenance.json',
    [scriptblock]$SignatureProvider,
    [scriptblock]$HashProvider
  )
  $root = [IO.Path]::GetFullPath($ArtifactDirectory)
  if (-not (Test-Path -LiteralPath $root -PathType Container)) { throw "Release directory is missing: $ArtifactDirectory" }
  $hash = if ($HashProvider) { $HashProvider } else { ${function:Get-LowerHash} }
  $setup = Assert-ReleaseFile $root 'Setup.exe'
  $releases = Assert-ReleaseFile $root 'RELEASES'
  $metadataPath = Assert-ReleaseFile $root $MetadataFile
  $provenancePath = Assert-ReleaseFile $root $ProvenanceFile
  $packages = @(Get-ChildItem -LiteralPath $root -File -Filter '*.nupkg')
  $fullPackages = @($packages | Where-Object Name -Like '*-full.nupkg')
  $deltaPackages = @($packages | Where-Object Name -Like '*-delta.nupkg')
  if ($fullPackages.Count -eq 0) { throw 'Release has no full Squirrel package' }
  $releaseRows = @(Get-Content -LiteralPath $releases | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  if ($releaseRows.Count -eq 0) { throw 'Squirrel RELEASES has no package rows' }
  $indexed = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  foreach ($line in $releaseRows) {
    if ($line -notmatch '^([0-9a-fA-F]{40})\s+([^\s]+)\s+(\d+)$') { throw "Malformed RELEASES row: $line" }
    $sha1 = $Matches[1].ToLowerInvariant()
    $name = $Matches[2]
    $bytes = [int64]$Matches[3]
    if ([IO.Path]::GetFileName($name) -cne $name -or $name.Contains('..') -or -not $name.EndsWith('.nupkg', [StringComparison]::OrdinalIgnoreCase)) { throw "Unsafe package path in RELEASES: $name" }
    if (-not $indexed.Add($name)) { throw "Duplicate RELEASES row: $name" }
    $packagePath = Join-Path $root $name
    if (-not (Test-Path -LiteralPath $packagePath -PathType Leaf)) { throw "Indexed package is missing: $name" }
    if ((Get-Item -LiteralPath $packagePath).Length -ne $bytes -or (& $hash $packagePath 'SHA1') -ne $sha1) { throw "RELEASES hash or byte count does not match: $name" }
  }
  foreach ($package in $packages) {
    if (-not $indexed.Contains($package.Name)) { throw "Package is not indexed by RELEASES: $($package.Name)" }
  }

  $signature = if ($SignatureProvider) { & $SignatureProvider $setup } else { Get-AuthenticodeSignature -LiteralPath $setup }
  $signatureStatus = if ($signature -is [string]) { $signature } else { [string]$signature.Status }
  if ($signatureStatus -ne 'NotSigned') { throw "Setup.exe signature status is $signatureStatus, expected NotSigned" }

  try { $metadata = Get-Content -Raw -LiteralPath $metadataPath | ConvertFrom-Json } catch { throw 'Release metadata is not valid JSON' }
  if ($metadata.schemaVersion -ne 1 -or $metadata.releaseVersion -ne $ExpectedVersion -or $metadata.signed -ne $false) { throw 'Release metadata identity or unsigned declaration is invalid' }
  $installer = $metadata.platforms.win.artifacts.installer
  if ($installer.type -ne 'installer' -or $installer.name -ne 'Setup.exe') { throw 'Release metadata does not identify Setup.exe' }
  if ([int64]$installer.size -ne (Get-Item -LiteralPath $setup).Length -or $installer.sha256 -ne (& $hash $setup)) { throw 'Release metadata does not match Setup.exe bytes' }
  foreach ($url in @($metadata.releaseNotesUrl, $installer.url, $installer.sha256Url)) {
    if ([string]::IsNullOrWhiteSpace($url)) { throw 'Release metadata contains an empty URL' }
  }
  Assert-ImmutableReleaseUrls -ReleaseNotesUrl ([string]$metadata.releaseNotesUrl) -InstallerUrl ([string]$installer.url) -Sha256Url ([string]$installer.sha256Url) -ExpectedVersion $ExpectedVersion

  try { $provenance = Get-Content -Raw -LiteralPath $provenancePath | ConvertFrom-Json } catch { throw 'Release provenance is not valid JSON' }
  $status = [string]$provenance.provenanceStatus
  $sourceCommit = if ($provenance.PSObject.Properties['sourceCommit']) { $provenance.sourceCommit } else { $null }
  $builtAt = if ($provenance.PSObject.Properties['builtAt']) { $provenance.builtAt } else { $null }
  if ($status -eq 'verified') {
    if ($sourceCommit -ne $ExpectedCommit.ToLowerInvariant()) { throw 'Release provenance source commit does not match the expected commit' }
    $builtAt = [string]$builtAt
    if ($builtAt -notmatch '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$') { throw 'Verified release provenance builtAt must include seconds and UTC' }
    $parsed = [DateTimeOffset]::MinValue
    if (-not [DateTimeOffset]::TryParse($builtAt, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind, [ref]$parsed)) { throw 'Verified release provenance builtAt is invalid' }
  } elseif ($status -eq 'unavailable') {
    if ($null -ne $sourceCommit -or $null -ne $builtAt) { throw 'Unavailable release provenance must not carry partial identity fields' }
  } else {
    throw 'Release provenance status is invalid'
  }

  return [pscustomobject]@{
    version = 1
    sourceCommit = $ExpectedCommit.ToLowerInvariant()
    expectedVersion = $ExpectedVersion
    setupSha256 = (& $hash $setup)
    setupBytes = (Get-Item -LiteralPath $setup).Length
    releaseRows = $releaseRows.Count
    fullPackages = @($fullPackages | ForEach-Object { $_.Name })
    deltaPackages = @($deltaPackages | ForEach-Object { $_.Name })
    signatureStatus = $signatureStatus
    provenanceStatus = $status
  }
}

Export-ModuleMember -Function Test-ReleaseIntegrity

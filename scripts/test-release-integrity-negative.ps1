[CmdletBinding()]
param([switch]$SelfTest)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'release-integrity-core.psm1') -Force
if (-not $SelfTest) {
  Write-Output 'Pass -SelfTest to run the release-integrity negative regression.'
  exit 0
}

function Assert-InstallerHash([string]$Path, [string]$Expected) {
  $actual = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -cne $Expected) { throw 'Installer hash does not match release metadata' }
}

function Invoke-Integrity([string]$Root, [scriptblock]$SignatureProvider = { param($Path) 'NotSigned' }) {
  $hashProvider = { param($Path, $Algorithm = 'SHA256') (Get-FileHash -LiteralPath $Path -Algorithm $Algorithm).Hash.ToLowerInvariant() }
  return Test-ReleaseIntegrity -ArtifactDirectory $Root -ExpectedCommit 'abcdef0123456789abcdef0123456789abcdef01' -ExpectedVersion '1.2.3' -SignatureProvider $SignatureProvider -HashProvider $hashProvider
}

function Assert-IntegrityFailure([scriptblock]$Action, [string]$ExpectedMessage) {
  try {
    & $Action | Out-Null
  } catch {
    if ($_.Exception.Message.IndexOf($ExpectedMessage, [StringComparison]::Ordinal) -lt 0) {
      throw "Expected integrity failure '$ExpectedMessage', got '$($_.Exception.Message)'"
    }
    return
  }
  throw "Negative regression stayed green for: $ExpectedMessage"
}

$fixture = Join-Path ([IO.Path]::GetTempPath()) ('release-integrity-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $fixture | Out-Null
try {
  $setupPath = Join-Path $fixture 'Setup.exe'
  Set-Content -LiteralPath $setupPath -Value 'not an executable' -NoNewline
  Set-Content -LiteralPath (Join-Path $fixture 'app-full.nupkg') -Value 'package' -NoNewline
  Set-Content -LiteralPath (Join-Path $fixture 'app-delta.nupkg') -Value 'delta' -NoNewline
  $fullPath = Join-Path $fixture 'app-full.nupkg'
  $fullHash = (Get-FileHash -LiteralPath $fullPath -Algorithm SHA1).Hash.ToLowerInvariant()
  $deltaPath = Join-Path $fixture 'app-delta.nupkg'
  $deltaHash = (Get-FileHash -LiteralPath $deltaPath -Algorithm SHA1).Hash.ToLowerInvariant()
  Set-Content -LiteralPath (Join-Path $fixture 'RELEASES') -Value @(
    "$fullHash app-full.nupkg $((Get-Item -LiteralPath $fullPath).Length)",
    "$deltaHash app-delta.nupkg $((Get-Item -LiteralPath $deltaPath).Length)"
  )
  $setupHash = (Get-FileHash -LiteralPath $setupPath -Algorithm SHA256).Hash.ToLowerInvariant()
  $metadata = [ordered]@{
    schemaVersion = 1
    releaseVersion = '1.2.3'
    signed = $false
    releaseNotesUrl = 'https://github.com/example-org/example-repo/releases/tag/v1.2.3'
    platforms = @{ win = @{ artifacts = @{ installer = @{ type = 'installer'; name = 'Setup.exe'; size = (Get-Item -LiteralPath $setupPath).Length; sha256 = $setupHash; url = 'https://github.com/example-org/example-repo/releases/download/v1.2.3/app-setup.exe'; sha256Url = 'https://github.com/example-org/example-repo/releases/download/v1.2.3/app-setup.exe.sha256' } } } }
  }
  $metadata | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $fixture 'metadata.json')
  $provenance = [ordered]@{ sourceCommit = 'abcdef0123456789abcdef0123456789abcdef01'; provenanceStatus = 'verified'; builtAt = '2026-08-29T05:00:00Z'; package = @{ version = '1.2.3' } }
  $provenance | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $fixture 'build-provenance.json')
  $receipt = Invoke-Integrity $fixture
  if ($receipt.signatureStatus -ne 'NotSigned' -or $receipt.fullPackages.Count -ne 1 -or $receipt.deltaPackages.Count -ne 1) { throw 'Baseline integrity receipt omitted expected unsigned package facts' }
  Write-Output 'Negative proof baseline green: verifier accepted NotSigned, RELEASES, full and delta packages, hashes, identity, and verified provenance.'
  $releasesPath = Join-Path $fixture 'RELEASES'
  $metadataPath = Join-Path $fixture 'metadata.json'
  $provenancePath = Join-Path $fixture 'build-provenance.json'
  $releasesGood = Get-Content -Raw -LiteralPath $releasesPath
  $metadataGood = $metadata | ConvertTo-Json -Depth 12
  $provenanceGood = $provenance | ConvertTo-Json -Depth 8

  Set-Content -LiteralPath $releasesPath -Value 'malformed row'
  Assert-IntegrityFailure { Invoke-Integrity $fixture } 'Malformed RELEASES row'
  Write-Output 'Negative proof red: malformed RELEASES row was rejected.'
  Set-Content -LiteralPath $releasesPath -Value $releasesGood -NoNewline

  $duplicateRow = ($releasesGood -split "`r?`n")[0]
  Set-Content -LiteralPath $releasesPath -Value @($releasesGood.TrimEnd(), $duplicateRow)
  Assert-IntegrityFailure { Invoke-Integrity $fixture } 'Duplicate RELEASES row'
  Write-Output 'Negative proof red: duplicate RELEASES row was rejected.'
  Set-Content -LiteralPath $releasesPath -Value $releasesGood -NoNewline

  Set-Content -LiteralPath $releasesPath -Value ($releasesGood -replace '^[0-9a-f]{40}', ('0' * 40))
  Assert-IntegrityFailure { Invoke-Integrity $fixture } 'RELEASES hash or byte count does not match'
  Write-Output 'Negative proof red: RELEASES hash mismatch was rejected.'
  Set-Content -LiteralPath $releasesPath -Value $releasesGood -NoNewline

  $byteCountLines = @($releasesGood -split "`r?`n" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  $byteCountFields = @($byteCountLines[0] -split '\s+')
  $byteCountFields[2] = '999'
  Set-Content -LiteralPath $releasesPath -Value (($byteCountFields -join ' ') + "`n" + $byteCountLines[1])
  Assert-IntegrityFailure { Invoke-Integrity $fixture } 'RELEASES hash or byte count does not match'
  Write-Output 'Negative proof red: RELEASES byte-count mismatch was rejected.'
  Set-Content -LiteralPath $releasesPath -Value $releasesGood -NoNewline

  Set-Content -LiteralPath (Join-Path $fixture 'orphan.nupkg') -Value 'orphan' -NoNewline
  Assert-IntegrityFailure { Invoke-Integrity $fixture } 'Package is not indexed by RELEASES'
  Write-Output 'Negative proof red: unindexed package was rejected.'
  Remove-Item -LiteralPath (Join-Path $fixture 'orphan.nupkg') -Force

  Remove-Item -LiteralPath (Join-Path $fixture 'app-full.nupkg') -Force
  Assert-IntegrityFailure { Invoke-Integrity $fixture } 'Release has no full Squirrel package'
  Write-Output 'Negative proof red: missing full package was rejected.'
  Set-Content -LiteralPath (Join-Path $fixture 'app-full.nupkg') -Value 'package' -NoNewline

  Remove-Item -LiteralPath (Join-Path $fixture 'app-delta.nupkg') -Force
  Assert-IntegrityFailure { Invoke-Integrity $fixture } 'Indexed package is missing'
  Write-Output 'Negative proof red: missing delta package was rejected.'
  Set-Content -LiteralPath (Join-Path $fixture 'app-delta.nupkg') -Value 'delta' -NoNewline
  Set-Content -LiteralPath $releasesPath -Value @(
    "$fullHash app-full.nupkg $((Get-Item -LiteralPath (Join-Path $fixture 'app-full.nupkg')).Length)",
    "$deltaHash app-delta.nupkg $((Get-Item -LiteralPath (Join-Path $fixture 'app-delta.nupkg')).Length)"
  )

  $metadata.platforms.win.artifacts.installer.size += 1
  $metadata | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $metadataPath
  Assert-IntegrityFailure { Invoke-Integrity $fixture } 'Release metadata does not match Setup.exe bytes'
  Write-Output 'Negative proof red: installer size mismatch was rejected.'
  $metadata.platforms.win.artifacts.installer.size = (Get-Item -LiteralPath $setupPath).Length
  $metadata | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $metadataPath

  $metadata.releaseVersion = '9.9.9'
  $metadata | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $metadataPath
  Assert-IntegrityFailure { Invoke-Integrity $fixture } 'Release metadata identity or unsigned declaration is invalid'
  Write-Output 'Negative proof red: metadata version mismatch was rejected.'
  $metadata.releaseVersion = '1.2.3'
  $metadata | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $metadataPath

  $metadata.signed = $true
  $metadata | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $metadataPath
  Assert-IntegrityFailure { Invoke-Integrity $fixture } 'Release metadata identity or unsigned declaration is invalid'
  Write-Output 'Negative proof red: signed metadata was rejected.'
  $metadata.signed = $false
  $metadata | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $metadataPath

  $metadata.platforms.win.artifacts.installer.url = 'http://example.invalid/Setup.exe'
  $metadata | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $metadataPath
  Assert-IntegrityFailure { Invoke-Integrity $fixture } 'absolute HTTPS GitHub release URLs'
  Write-Output 'Negative proof red: non-HTTPS installer URL was rejected.'
  $metadata.platforms.win.artifacts.installer.url = 'https://github.com/example-org/example-repo/releases/download/v1.2.3/app-setup.exe'
  $metadata | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $metadataPath

  $metadata.platforms.win.artifacts.installer.url = 'https://github.com/example-org/example-repo/releases/latest/download/app-setup.exe'
  $metadata.releaseNotesUrl = 'https://github.com/example-org/example-repo/releases/tag/latest'
  $metadata.platforms.win.artifacts.installer.sha256Url = 'https://github.com/example-org/example-repo/releases/latest/download/app-setup.exe.sha256'
  $metadata | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $metadataPath
  Assert-IntegrityFailure { Invoke-Integrity $fixture } 'immutable GitHub release tag/download route'
  Write-Output 'Negative proof red: mutable latest release URL was rejected.'
  $metadata.releaseNotesUrl = 'https://github.com/example-org/example-repo/releases/tag/latest'
  $metadata.platforms.win.artifacts.installer.url = 'https://github.com/example-org/example-repo/releases/download/latest/app-setup.exe'
  $metadata.platforms.win.artifacts.installer.sha256Url = 'https://github.com/example-org/example-repo/releases/download/latest/app-setup.exe.sha256'
  $metadata | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $metadataPath
  Assert-IntegrityFailure { Invoke-Integrity $fixture } 'mutable latest release route'
  Write-Output 'Negative proof red: latest-named release tag was rejected.'
  $metadata.releaseNotesUrl = 'https://github.com/example-org/example-repo/releases/tag/v1.2.3'
  $metadata.platforms.win.artifacts.installer.url = 'https://github.com/example-org/example-repo/releases/download/v1.2.3/app-setup.exe'
  $metadata.platforms.win.artifacts.installer.sha256Url = 'https://github.com/example-org/example-repo/releases/download/v1.2.3/app-setup.exe.sha256'
  $metadata | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $metadataPath

  $provenance.sourceCommit = 'abcdef0123456789abcdef0123456789abcdef01'
  $provenance.builtAt = $null
  $provenance.provenanceStatus = 'unavailable'
  $provenance | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $provenancePath
  $provenance.builtAt = '2026-08-29T05:00:00Z'
  Assert-IntegrityFailure { Invoke-Integrity $fixture } 'Unavailable release provenance must not carry partial identity fields'
  Write-Output 'Negative proof red: partial unavailable provenance was rejected.'
  $provenance = [ordered]@{ sourceCommit = 'abcdef0123456789abcdef0123456789abcdef01'; provenanceStatus = 'verified'; builtAt = '2026-08-29T05:00:00Z'; package = @{ version = '1.2.3' } }
  $provenance | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $provenancePath

  Invoke-Integrity $fixture | Out-Null
  Write-Output 'Negative proof restored green: all release-integrity boundaries passed after restoration.'
  $metadata.platforms.win.artifacts.installer.sha256 = '0' * 64
  $metadata | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $fixture 'metadata.json')
  Assert-IntegrityFailure { Invoke-Integrity $fixture } 'Release metadata does not match Setup.exe bytes'
  Write-Output 'Negative proof red: corrupt release metadata was rejected.'
  $metadata.platforms.win.artifacts.installer.sha256 = $setupHash
  $metadata | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $fixture 'metadata.json')
  $receipt = Invoke-Integrity $fixture
  Write-Output 'Negative proof restored green: valid release metadata passed again.'

  Assert-IntegrityFailure { Invoke-Integrity $fixture { param($Path) 'Signed' } } 'Setup.exe signature status is Signed, expected NotSigned'
  Write-Output 'Negative proof red: signed output was rejected.'

  $provenance.builtAt = '2026-08-29'
  $provenance | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $fixture 'build-provenance.json')
  Assert-IntegrityFailure { Invoke-Integrity $fixture } 'Verified release provenance builtAt must include seconds and UTC'
  Write-Output 'Negative proof red: malformed verified builtAt was rejected.'

  $provenance.builtAt = $null
  $provenance.sourceCommit = $null
  $provenance.provenanceStatus = 'unavailable'
  $provenance | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $fixture 'build-provenance.json')
  $receipt = Invoke-Integrity $fixture
  if ($receipt.provenanceStatus -ne 'unavailable') { throw 'Unavailable provenance was not retained as unavailable' }
  Write-Output 'Negative proof restored green: unavailable provenance remained an honest accepted state.'
}
finally {
  if (Test-Path -LiteralPath $fixture) { Remove-Item -LiteralPath $fixture -Recurse -Force }
}

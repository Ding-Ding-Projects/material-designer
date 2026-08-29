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
    releaseNotesUrl = 'https://example.invalid/releases/v1.2.3'
    platforms = @{ win = @{ artifacts = @{ installer = @{ type = 'installer'; name = 'Setup.exe'; size = (Get-Item -LiteralPath $setupPath).Length; sha256 = $setupHash; url = 'https://example.invalid/Setup.exe'; sha256Url = 'https://example.invalid/Setup.exe.sha256' } } } }
  }
  $metadata | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $fixture 'metadata.json')
  $provenance = [ordered]@{ sourceCommit = 'abcdef0123456789abcdef0123456789abcdef01'; provenanceStatus = 'verified'; builtAt = '2026-08-29T05:00:00Z'; package = @{ version = '1.2.3' } }
  $provenance | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $fixture 'build-provenance.json')
  $receipt = Invoke-Integrity $fixture
  if ($receipt.signatureStatus -ne 'NotSigned' -or $receipt.fullPackages.Count -ne 1 -or $receipt.deltaPackages.Count -ne 1) { throw 'Baseline integrity receipt omitted expected unsigned package facts' }
  Write-Output 'Negative proof baseline green: verifier accepted NotSigned, RELEASES, full and delta packages, hashes, identity, and verified provenance.'
  $metadata.platforms.win.artifacts.installer.sha256 = '0' * 64
  $metadata | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $fixture 'metadata.json')
  $failed = $false
  try { Invoke-Integrity $fixture | Out-Null } catch { $failed = $true }
  if (-not $failed) { throw 'Negative regression stayed green after corrupting metadata SHA-256' }
  Write-Output 'Negative proof red: corrupt release metadata was rejected.'
  $metadata.platforms.win.artifacts.installer.sha256 = $setupHash
  $metadata | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $fixture 'metadata.json')
  $receipt = Invoke-Integrity $fixture
  Write-Output 'Negative proof restored green: valid release metadata passed again.'

  $failed = $false
  try { Invoke-Integrity $fixture { param($Path) 'Signed' } | Out-Null } catch { $failed = $true }
  if (-not $failed) { throw 'Negative regression stayed green when NotSigned was removed' }
  Write-Output 'Negative proof red: signed output was rejected.'

  $provenance.builtAt = '2026-08-29'
  $provenance | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $fixture 'build-provenance.json')
  $failed = $false
  try { Invoke-Integrity $fixture | Out-Null } catch { $failed = $true }
  if (-not $failed) { throw 'Negative regression stayed green for a malformed verified builtAt' }
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

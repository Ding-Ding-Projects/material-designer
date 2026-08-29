[CmdletBinding()]
param([switch]$SelfTest)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if (-not $SelfTest) {
  Write-Output 'Pass -SelfTest to run the release-integrity negative regression.'
  exit 0
}

function Assert-InstallerHash([string]$Path, [string]$Expected) {
  $actual = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -cne $Expected) { throw 'Installer hash does not match release metadata' }
}

$fixture = Join-Path ([IO.Path]::GetTempPath()) ('release-integrity-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $fixture | Out-Null
try {
  $setupPath = Join-Path $fixture 'Setup.exe'
  Set-Content -LiteralPath $setupPath -Value 'not an executable' -NoNewline
  Set-Content -LiteralPath (Join-Path $fixture 'RELEASES') -Value ''
  Set-Content -LiteralPath (Join-Path $fixture 'app-full.nupkg') -Value 'package' -NoNewline
  $setupHash = (Get-FileHash -LiteralPath $setupPath -Algorithm SHA256).Hash.ToLowerInvariant()
  $metadata = [ordered]@{
    schemaVersion = 1
    releaseVersion = '1.2.3'
    signed = $false
    releaseNotesUrl = 'https://example.invalid/releases/v1.2.3'
    platforms = @{ win = @{ artifacts = @{ installer = @{ type = 'installer'; name = 'Setup.exe'; size = (Get-Item -LiteralPath $setupPath).Length; sha256 = $setupHash; url = 'https://example.invalid/Setup.exe'; sha256Url = 'https://example.invalid/Setup.exe.sha256' } } } }
  }
  $metadata | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $fixture 'metadata.json')
  $provenance = [ordered]@{ sourceCommit = 'abcdef0123456789abcdef0123456789abcdef01'; provenanceStatus = 'verified'; package = @{ version = '1.2.3' } }
  $provenance | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $fixture 'build-provenance.json')
  Assert-InstallerHash $setupPath $setupHash
  Write-Output 'Negative proof baseline green: installer bytes matched release metadata.'
  $metadata.platforms.win.artifacts.installer.sha256 = '0' * 64
  $metadata | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $fixture 'metadata.json')
  $failed = $false
  try { Assert-InstallerHash $setupPath $metadata.platforms.win.artifacts.installer.sha256 } catch { $failed = $true }
  if (-not $failed) { throw 'Negative regression stayed green after corrupting metadata SHA-256' }
  Write-Output 'Negative proof red: corrupt release metadata was rejected.'
  $metadata.platforms.win.artifacts.installer.sha256 = $setupHash
  $metadata | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $fixture 'metadata.json')
  Assert-InstallerHash $setupPath $metadata.platforms.win.artifacts.installer.sha256
  Write-Output 'Negative proof restored green: valid release metadata passed again.'
}
finally {
  if (Test-Path -LiteralPath $fixture) { Remove-Item -LiteralPath $fixture -Recurse -Force }
}

[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'build-provenance.psm1') -Force
$root = Join-Path ([IO.Path]::GetTempPath()) ('material-designer-installer-provenance-' + [Guid]::NewGuid().ToString('N'))
$commit = '0123456789abcdef0123456789abcdef01234567'
try {
  New-Item -ItemType Directory -Force -Path $root | Out-Null
  $path = Join-Path $root 'provenance.json'
  $valid = [ordered]@{ schemaVersion = 1; sourceCommit = $commit; version = '1.2.3'; updatedAt = '2026-09-05T12:34:56Z' }
  $valid | ConvertTo-Json | Set-Content -LiteralPath $path -Encoding utf8
  $result = Read-ValidatedBuildProvenance -ProvenanceFile $path -ExpectedCommit $commit -ExpectedVersion '1.2.3'
  if ($result.updatedAt -cne $valid.updatedAt) { throw 'valid external provenance was not returned intact' }
  $cases = @(
    @{ name = 'commit'; mutate = { param($r) $r.sourceCommit = ('f' * 40) } },
    @{ name = 'version'; mutate = { param($r) $r.version = '9.9.9' } },
    @{ name = 'timestamp'; mutate = { param($r) $r.updatedAt = '2026-99-99T99:99:99Z' } }
  )
  foreach ($case in $cases) {
    $candidate = $valid | ConvertTo-Json | ConvertFrom-Json
    & $case.mutate $candidate
    $candidate | ConvertTo-Json | Set-Content -LiteralPath $path -Encoding utf8
    try { Read-ValidatedBuildProvenance -ProvenanceFile $path -ExpectedCommit $commit -ExpectedVersion '1.2.3' | Out-Null; throw "negative provenance case '$($case.name)' unexpectedly succeeded" }
    catch { if ($_.Exception.Message -like 'negative provenance case*') { throw } }
  }
  Write-Output 'PASS: installer provenance accepts exact identity and rejects mismatched commit, version, and timestamp values.'
} finally {
  if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force }
}

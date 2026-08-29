[CmdletBinding()]
param(
  [string]$Root
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($Root)) { $Root = Split-Path -Parent $MyInvocation.MyCommand.Path | Split-Path -Parent }
$fetcher = Join-Path $Root 'scripts/download-dependencies.ps1'
$sourceManifest = Join-Path $Root 'scripts/download-dependencies.manifest.json'
$fixtureRoot = Join-Path ([IO.Path]::GetTempPath()) ("material-designer-dependency-manifest-" + [Guid]::NewGuid().ToString('N'))
$fixtureManifest = Join-Path $fixtureRoot 'manifest.json'

function Invoke-ManifestCheck {
  $previous = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    $result = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $fetcher -ManifestPath $fixtureManifest -ValidateOnly 2>&1
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) { Write-Host ($result -join "`n") }
    return $exitCode
  } finally {
    $ErrorActionPreference = $previous
  }
}

function Write-ManifestVariant([scriptblock]$Mutate) {
  $manifest = Get-Content -Raw -LiteralPath $sourceManifest | ConvertFrom-Json
  & $Mutate $manifest
  $json = $manifest | ConvertTo-Json -Depth 8
  [IO.File]::WriteAllText($fixtureManifest, $json, [Text.UTF8Encoding]::new($false))
}

function Assert-RedThenGreen([string]$Name, [scriptblock]$Mutate) {
  Write-ManifestVariant $Mutate
  if ((Invoke-ManifestCheck) -eq 0) { throw "the manifest validator stayed green after $Name mutation" }
  Copy-Item -LiteralPath $sourceManifest -Destination $fixtureManifest -Force
  if ((Invoke-ManifestCheck) -ne 0) { throw "the manifest validator did not return green after restoring $Name" }
}

try {
  New-Item -ItemType Directory -Force -Path $fixtureRoot | Out-Null
  Copy-Item -LiteralPath $sourceManifest -Destination $fixtureManifest
  if ((Invoke-ManifestCheck) -ne 0) { throw 'the restored exact dependency manifest did not validate' }

  $fieldMutations = @(
    @{ Name = 'Node version'; Record = 'Node.js'; Field = 'version'; Value = '24.20.1' },
    @{ Name = 'pnpm integrity'; Record = 'pnpm'; Field = 'integrity'; Value = 'sha512-invalid' },
    @{ Name = 'Python id'; Record = 'Python'; Field = 'id'; Value = 'python-other' },
    @{ Name = 'Python version'; Record = 'Python'; Field = 'version'; Value = '3.12.11' },
    @{ Name = 'Python source'; Record = 'Python'; Field = 'source'; Value = 'https://example.invalid/python.zip' },
    @{ Name = 'Python digest'; Record = 'Python'; Field = 'sha256'; Value = ('0' * 64) },
    @{ Name = 'Python archive'; Record = 'Python'; Field = 'archive'; Value = 'python-other.zip' },
    @{ Name = 'C++ id'; Record = 'Microsoft C++ build tools'; Field = 'id'; Value = 'Microsoft.VisualStudio.Other' },
    @{ Name = 'C++ version'; Record = 'Microsoft C++ build tools'; Field = 'version'; Value = '17.14.40' },
    @{ Name = 'C++ source'; Record = 'Microsoft C++ build tools'; Field = 'source'; Value = 'https://example.invalid/vs.exe' },
    @{ Name = 'C++ digest'; Record = 'Microsoft C++ build tools'; Field = 'sha256'; Value = ('1' * 64) },
    @{ Name = 'C++ archive'; Record = 'Microsoft C++ build tools'; Field = 'archive'; Value = 'vs-other.exe' }
  )
  foreach ($mutation in $fieldMutations) {
    Assert-RedThenGreen $mutation.Name {
      param($manifest)
      $record = @($manifest.dependencies | Where-Object { $_.name -eq $mutation.Record })[0]
      $record.($mutation.Field) = $mutation.Value
    }
  }
  foreach ($requiredName in @('Node.js', 'pnpm', 'Python', 'Microsoft C++ build tools')) {
    Assert-RedThenGreen "missing $requiredName record" {
      param($manifest)
      $manifest.dependencies = @($manifest.dependencies | Where-Object { $_.name -ne $requiredName })
    }
  }
  Assert-RedThenGreen 'duplicate record' {
    param($manifest)
    $manifest.dependencies = @($manifest.dependencies) + $manifest.dependencies[0]
  }
  Assert-RedThenGreen 'unknown record' {
    param($manifest)
    $manifest.dependencies = @($manifest.dependencies) + [pscustomobject]@{ name = 'Unexpected'; id = 'unexpected'; version = '1.0.0'; source = 'https://example.invalid/unexpected.zip'; archive = 'unexpected.zip'; sha256 = ('2' * 64) }
  }
  Assert-RedThenGreen 'unknown field' {
    param($manifest)
    $manifest.dependencies[0] | Add-Member -NotePropertyName unexpected -NotePropertyValue 'not permitted'
  }
  Write-Output 'PASS: dependency manifest validation rejected exact field, missing-record, duplicate, unknown-record and unknown-field mutations, and returned green after every restoration.'
} finally {
  if (Test-Path -LiteralPath $fixtureRoot) { Remove-Item -LiteralPath $fixtureRoot -Recurse -Force }
}

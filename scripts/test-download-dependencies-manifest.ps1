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

try {
  New-Item -ItemType Directory -Force -Path $fixtureRoot | Out-Null
  Copy-Item -LiteralPath $sourceManifest -Destination $fixtureManifest
  if ((Invoke-ManifestCheck) -ne 0) { throw 'the restored exact dependency manifest did not validate' }

  $manifest = Get-Content -Raw -LiteralPath $fixtureManifest
  $mutations = @(
    @{ Name = 'Node version'; Old = '"version": "24.20.0"'; New = '"version": "24.20.1"' },
    @{ Name = 'C++ bootstrapper id'; Old = '"id": "Microsoft.VisualStudio.2022.BuildTools"'; New = '"id": "Microsoft.VisualStudio.2022.BuildTools.WRONG"' },
    @{ Name = 'Node digest'; Old = '6cac9ffbca8f6a47091e4b5c772e0606049c3871cb67d900c0cedde630e545ba'; New = (('0' * 64) -join '') }
  )
  foreach ($mutation in $mutations) {
    [IO.File]::WriteAllText($fixtureManifest, $manifest.Replace($mutation.Old, $mutation.New), [Text.UTF8Encoding]::new($false))
    if ((Invoke-ManifestCheck) -eq 0) { throw "the manifest validator stayed green after $($mutation.Name) mutation" }
    [IO.File]::WriteAllText($fixtureManifest, $manifest, [Text.UTF8Encoding]::new($false))
    if ((Invoke-ManifestCheck) -ne 0) { throw "the manifest validator did not return green after restoring $($mutation.Name)" }
  }
  Write-Output 'PASS: dependency manifest validation rejected three exact-record mutations and returned green after restoration.'
} finally {
  if (Test-Path -LiteralPath $fixtureRoot) { Remove-Item -LiteralPath $fixtureRoot -Recurse -Force }
}

[CmdletBinding()]
param(
  [string]$Root = ''
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($Root)) { $Root = Split-Path -Parent $PSScriptRoot }

function Test-UpdateFeedBoundary([string]$ContractRoot) {
  $path = Join-Path $ContractRoot 'design/apps/web/src/components/UpdateDialog.tsx'
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { return @('UpdateDialog source is missing') }
  $source = Get-Content -Raw -LiteralPath $path
  $failures = [System.Collections.Generic.List[string]]::new()
  $expected = "const RELEASES_URL = 'https://github.com/Ding-Ding-Projects/material-designer/releases';"
  if ([regex]::Matches($source, [regex]::Escape($expected)).Count -ne 1) { $failures.Add('the manual update fallback is not bound exactly once to this project release page') }
  if ($source.Contains('https://github.com/nexu-io/open-design/releases')) { $failures.Add('the manual update fallback still points at the upstream release page') }
  return $failures
}

$initial = @(Test-UpdateFeedBoundary $Root)
if ($initial.Count -gt 0) { throw "update-feed boundary failed: $($initial -join '; ')" }

$fixtureRoot = Join-Path ([IO.Path]::GetTempPath()) ('material-designer-update-feed-' + [Guid]::NewGuid().ToString('N'))
try {
  $fixturePath = Join-Path $fixtureRoot 'design/apps/web/src/components/UpdateDialog.tsx'
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $fixturePath) | Out-Null
  $original = Get-Content -Raw -LiteralPath (Join-Path $Root 'design/apps/web/src/components/UpdateDialog.tsx')
  [IO.File]::WriteAllText($fixturePath, $original.Replace('https://github.com/Ding-Ding-Projects/material-designer/releases', 'https://github.com/nexu-io/open-design/releases'), [Text.UTF8Encoding]::new($false))
  $negative = @(Test-UpdateFeedBoundary $fixtureRoot)
  if ($negative.Count -eq 0) { throw 'the update-feed boundary stayed green after replacing the project release URL' }
  [IO.File]::WriteAllText($fixturePath, $original, [Text.UTF8Encoding]::new($false))
  if (@(Test-UpdateFeedBoundary $fixtureRoot).Count -ne 0) { throw 'the update-feed fixture did not return green after restoration' }
  Write-Output 'PASS: update-feed boundary turned red for an upstream fallback and green after restoration.'
} finally {
  if (Test-Path -LiteralPath $fixtureRoot) { Remove-Item -LiteralPath $fixtureRoot -Recurse -Force }
}

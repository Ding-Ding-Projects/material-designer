[CmdletBinding()]
param(
  [string]$Root = ''
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($Root)) { $Root = Split-Path -Parent $PSScriptRoot }

function Test-UpdateFeedBoundary([string]$ContractRoot) {
  $paths = @(
    (Join-Path $ContractRoot 'design/apps/web/src/components/UpdateDialog.tsx'),
    (Join-Path $ContractRoot 'design/apps/web/src/components/SettingsDialog.tsx'),
    (Join-Path $ContractRoot 'design/apps/web/src/components/WhatsNewPopup.tsx')
  )
  $failures = [System.Collections.Generic.List[string]]::new()
  foreach ($path in $paths) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { $failures.Add("release fallback source is missing: $path"); continue }
    $source = Get-Content -Raw -LiteralPath $path
    if ($source -notmatch "https://github.com/Ding-Ding-Projects/material-designer/releases") { $failures.Add("release fallback is not bound to this project release page: $path") }
    if ($source.Contains('https://github.com/nexu-io/open-design/releases')) { $failures.Add("release fallback still points at the upstream release page: $path") }
  }
  return $failures
}

$initial = @(Test-UpdateFeedBoundary $Root)
if ($initial.Count -gt 0) { throw "update-feed boundary failed: $($initial -join '; ')" }

$fixtureRoot = Join-Path ([IO.Path]::GetTempPath()) ('material-designer-update-feed-' + [Guid]::NewGuid().ToString('N'))
try {
  $producerFiles = @(
    'design/apps/web/src/components/UpdateDialog.tsx',
    'design/apps/web/src/components/SettingsDialog.tsx',
    'design/apps/web/src/components/WhatsNewPopup.tsx'
  )
  foreach ($relative in $producerFiles) {
    $fixturePath = Join-Path $fixtureRoot $relative
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $fixturePath) | Out-Null
    Copy-Item -LiteralPath (Join-Path $Root $relative) -Destination $fixturePath
  }
  foreach ($relative in $producerFiles) {
    $fixturePath = Join-Path $fixtureRoot $relative
    $original = Get-Content -Raw -LiteralPath $fixturePath
    $mutated = $original.Replace('https://github.com/Ding-Ding-Projects/material-designer/releases', 'https://github.com/nexu-io/open-design/releases')
    if ($mutated -eq $original) { throw "the update-feed mutation did not change $relative" }
    [IO.File]::WriteAllText($fixturePath, $mutated, [Text.UTF8Encoding]::new($false))
    $negative = @(Test-UpdateFeedBoundary $fixtureRoot)
    if ($negative.Count -eq 0) { throw "the update-feed boundary stayed green after mutating $relative" }
    [IO.File]::WriteAllText($fixturePath, $original, [Text.UTF8Encoding]::new($false))
    if (@(Test-UpdateFeedBoundary $fixtureRoot).Count -ne 0) { throw "the update-feed fixture did not return green after restoring $relative" }
  }
  Write-Output 'PASS: each release-feed producer turned red independently and green after restoration.'
} finally {
  if (Test-Path -LiteralPath $fixtureRoot) { Remove-Item -LiteralPath $fixtureRoot -Recurse -Force }
}

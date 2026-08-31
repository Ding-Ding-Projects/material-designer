[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$check = Join-Path $PSScriptRoot 'check-menu-sidebar-contract.ps1'
$temp = Join-Path ([IO.Path]::GetTempPath()) ("material-designer-menu-contract-" + [Guid]::NewGuid().ToString('N'))

try {
  New-Item -ItemType Directory -Path $temp -Force | Out-Null
  $paths = @(
    'design/apps/web/src/components/ContextMenu.tsx',
    'design/apps/web/src/components/ContextMenu.module.css',
    'design/apps/web/src/components/ComposerPlusMenu.tsx',
    'design/apps/web/src/styles/home/plus-menu.css',
    'design/apps/web/src/components/ChatComposer.tsx',
    'design/apps/web/src/components/FileWorkspace.tsx',
    'design/apps/web/src/styles/home/entry-layout.css'
  )
  foreach ($relative in $paths) {
    $target = Join-Path $temp $relative
    New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $repoRoot $relative) -Destination $target
  }

  $cases = @(
    @{ Name = 'context menu builder'; Path = 'design/apps/web/src/components/ContextMenu.tsx'; Old = "import { RegexSearchField } from './regex/RegexSearchField';"; New = "import { RegexSearchFieldDisabled } from './regex/RegexSearchField';" },
    @{ Name = 'flyout owner overflow'; Path = 'design/apps/web/src/styles/home/plus-menu.css'; Old = 'overflow: visible;'; New = 'overflow-y: auto;' },
    @{ Name = 'tab keyboard route'; Path = 'design/apps/web/src/components/FileWorkspace.tsx'; Old = "event.key === 'ContextMenu'"; New = "event.key === 'ContextMenuDisabled'" },
    @{ Name = 'narrow rail pointer state'; Path = 'design/apps/web/src/styles/home/entry-layout.css'; Old = 'pointer-events: auto;'; New = 'pointer-events: none;' }
  )

  foreach ($case in $cases) {
    $file = Join-Path $temp $case.Path
    $content = Get-Content -LiteralPath $file -Raw
    if (-not $content.Contains($case.Old)) { throw "Negative setup anchor missing: $($case.Name)" }
    Set-Content -LiteralPath $file -Value ($content.Replace($case.Old, $case.New)) -NoNewline
    $previousPreference = $ErrorActionPreference
    try {
      $ErrorActionPreference = 'Continue'
      & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $check -Root $temp *> $null
      $negativeExitCode = $LASTEXITCODE
    }
    finally { $ErrorActionPreference = $previousPreference }
    if ($negativeExitCode -eq 0) { throw "Negative regression stayed green: $($case.Name)" }
    Set-Content -LiteralPath $file -Value $content -NoNewline
    try {
      $ErrorActionPreference = 'Continue'
      & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $check -Root $temp *> $null
      $restoredExitCode = $LASTEXITCODE
    }
    finally { $ErrorActionPreference = $previousPreference }
    if ($restoredExitCode -ne 0) { throw "Restored contract stayed red: $($case.Name)" }
  }

  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $check -Root $temp
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  Write-Output 'PASS: four menu/sidebar negative regressions turned red, then green'
}
finally {
  if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Recurse -Force }
}

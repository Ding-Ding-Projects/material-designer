$ErrorActionPreference = 'Stop'

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$checker = Join-Path $PSScriptRoot 'check-unsolicited-entry-surfaces.ps1'
$powerShell = Join-Path $PSHOME 'powershell.exe'

& $powerShell -NoProfile -ExecutionPolicy Bypass -File $checker -Root $repositoryRoot
if ($LASTEXITCODE -ne 0) {
  throw 'The production source did not pass before negative regression checks.'
}

$cases = @(
  @{ Name = 'campaign badge'; File = 'design/apps/web/src/components/EntryShell.tsx'; Needle = '<WorkbenchCampaignBadge />' },
  @{ Name = 'signed-out account callout'; File = 'design/apps/web/src/components/EntryShell.tsx'; Needle = '<CloudSignInTip />' },
  @{ Name = 'campaign dialog'; File = 'design/apps/web/src/components/HomeView.tsx'; Needle = '<DeepSeekV4FlashCampaign />' },
  @{ Name = 'star-count pill'; File = 'design/apps/web/src/components/EntryNavRail.tsx'; Needle = '<a data-testid="entry-top-right-github" />' }
)

foreach ($case in $cases) {
  $fixtureRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("material-designer-unsolicited-{0}" -f [guid]::NewGuid().ToString('N'))
  try {
    foreach ($relativePath in @(
      'design/apps/web/src/components/EntryShell.tsx',
      'design/apps/web/src/components/EntryNavRail.tsx',
      'design/apps/web/src/components/HomeView.tsx'
    )) {
      $source = Join-Path $repositoryRoot $relativePath
      $target = Join-Path $fixtureRoot $relativePath
      New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
      Copy-Item -LiteralPath $source -Destination $target
    }

    Add-Content -LiteralPath (Join-Path $fixtureRoot $case.File) -Value $case.Needle -Encoding utf8
    $previousErrorAction = $ErrorActionPreference
    try {
      $ErrorActionPreference = 'Continue'
      & $powerShell -NoProfile -ExecutionPolicy Bypass -File $checker -Root $fixtureRoot *> $null
      $probeExit = $LASTEXITCODE
    }
    finally {
      $ErrorActionPreference = $previousErrorAction
    }
    if ($probeExit -eq 0) {
      throw "Negative regression stayed green after restoring the $($case.Name)."
    }
    Write-Output "Negative regression turned red for: $($case.Name)."
  }
  finally {
    if (Test-Path -LiteralPath $fixtureRoot) {
      Remove-Item -LiteralPath $fixtureRoot -Recurse -Force
    }
  }
}

& $powerShell -NoProfile -ExecutionPolicy Bypass -File $checker -Root $repositoryRoot
if ($LASTEXITCODE -ne 0) {
  throw 'The production source did not return green after negative regression checks.'
}

Write-Output 'Negative regression passed: every removed automatic surface turns the contract red, and production returns green.'

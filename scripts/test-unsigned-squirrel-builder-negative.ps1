param(
  [string]$Root = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'

$fixtureRoot = Join-Path ([IO.Path]::GetTempPath()) ("material-designer-unsigned-squirrel-" + [Guid]::NewGuid().ToString('N'))
$fixtureBuilder = Join-Path $fixtureRoot 'design/tools/pack/src/win/builder.ts'
$validator = Join-Path $fixtureRoot 'scripts/check-unsigned-squirrel-builder.ps1'
$sourceBuilder = Join-Path $Root 'design/tools/pack/src/win/builder.ts'
$sourceValidator = Join-Path $Root 'scripts/check-unsigned-squirrel-builder.ps1'

function Assert-ValidatorRejects {
  param(
    [string]$Needle,
    [string]$Replacement,
    [string]$Name
  )

  $source = [IO.File]::ReadAllText($fixtureBuilder)
  $count = [regex]::Matches($source, [regex]::Escape($Needle)).Count
  if ($count -ne 1) {
    throw "Fixture mutation '$Name' expected one exact target, found $count"
  }
  [IO.File]::WriteAllText($fixtureBuilder, $source.Replace($Needle, $Replacement), [Text.UTF8Encoding]::new($false))

  $previousErrorActionPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $validator -Root $fixtureRoot *> $null
    $validatorExitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  if ($validatorExitCode -eq 0) {
    throw "The unsigned Squirrel builder validator stayed green after '$Name' was removed"
  }

  [IO.File]::WriteAllText($fixtureBuilder, $source, [Text.UTF8Encoding]::new($false))
}

try {
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $fixtureBuilder), (Split-Path -Parent $validator) | Out-Null
  Copy-Item -LiteralPath $sourceBuilder -Destination $fixtureBuilder
  Copy-Item -LiteralPath $sourceValidator -Destination $validator

  Assert-ValidatorRejects 'signAndEditExecutable: false,' 'signAndEditExecutable: true,' 'signAndEditExecutable false'
  Assert-ValidatorRejects 'signExts: ["!exe"],' 'signExts: [],' 'executable signing exclusion'
  Assert-ValidatorRejects 'WIN_ELECTRON_BUILDER_DIR_CACHE_VERSION = 9' 'WIN_ELECTRON_BUILDER_DIR_CACHE_VERSION = 8' 'cache boundary'
  Assert-ValidatorRejects 'return withShortWindowsOutputRoot(paths, (shortPaths) =>' 'return runElectronBuilderRawWithPaths(config, paths, projectDir)' 'short-output wrapper'

  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $validator -Root $fixtureRoot
  if ($LASTEXITCODE -ne 0) {
    throw 'The restored unsigned Squirrel builder fixture did not pass the validator'
  }
  Write-Output 'PASS: unsigned Squirrel builder validator turned red for four exact producer regressions and green after restoration.'
} finally {
  if (Test-Path -LiteralPath $fixtureRoot) {
    Remove-Item -LiteralPath $fixtureRoot -Recurse -Force
  }
}

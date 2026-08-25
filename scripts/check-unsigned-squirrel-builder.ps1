param(
  [string]$Root = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'

$builderPath = Join-Path $Root 'design/tools/pack/src/win/builder.ts'
if (-not (Test-Path -LiteralPath $builderPath)) {
  throw "Windows builder source was not found at $builderPath"
}

$source = [IO.File]::ReadAllText($builderPath)

function Require-ExactLine {
  param(
    [string]$Pattern,
    [string]$Message
  )

  $count = [regex]::Matches($source, $Pattern, [Text.RegularExpressions.RegexOptions]::Multiline).Count
  if ($count -ne 1) {
    throw "$Message (expected exactly one match, found $count)"
  }
}

function Forbid-Source {
  param(
    [string]$Pattern,
    [string]$Message
  )

  if ([regex]::IsMatch($source, $Pattern, [Text.RegularExpressions.RegexOptions]::Multiline)) {
    throw $Message
  }
}

Require-ExactLine '^\s*forceCodeSigning: false,\s*$' 'The Windows builder no longer hard-disables code signing'
Require-ExactLine '^\s*signAndEditExecutable: false,\s*$' 'The Windows builder no longer disables electron-builder signing and rcedit mutation'
Require-ExactLine '^\s*signExts: \["!exe"\],\s*$' 'The Windows builder no longer excludes executable targets from Squirrel signing'
Require-ExactLine '^\s*verifyUpdateCodeSignature: false,\s*$' 'The Windows builder no longer disables update-signature verification'
Require-ExactLine '^const WIN_ELECTRON_BUILDER_DIR_CACHE_VERSION = 9;\s*$' 'The unsigned builder cache boundary was not advanced'
Require-ExactLine '^async function findUnusedWindowsSubstDrive\(\): Promise<\(typeof WINDOWS_SHORT_OUTPUT_DRIVES\)\[number\]> \{\s*$' 'The bounded short-output drive chooser is missing'
Require-ExactLine '^async function withShortWindowsOutputRoot<T>\(\s*$' 'The short-output mapping wrapper is missing'
Require-ExactLine '^async function runElectronBuilderRawWithPaths\(\s*$' 'The raw builder must only receive paths through the short-output wrapper'
Require-ExactLine '^async function runElectronBuilderRaw\(\s*$' 'The raw builder wrapper is missing'
Require-ExactLine '^\s*return withShortWindowsOutputRoot\(paths, \(shortPaths\) =>\s*$' 'The raw builder no longer uses the short-output wrapper'
Require-ExactLine '^\s*await execFileAsync\("subst", \[drive, outputParent\], \{ windowsHide: true \}\);\s*$' 'The short-output drive mapping is missing its exact subst call'
Require-ExactLine '^\s*await execFileAsync\("subst", \[drive, "/D"\], \{ windowsHide: true \}\);\s*$' 'The short-output drive mapping is not removed in finally'
Forbid-Source 'signAndVerifyWinFile' 'The Windows builder contains a prohibited signing implementation'

Write-Output 'PASS: Windows Squirrel builder keeps executable signing and rcedit disabled, uses a bounded short output mapping, and invalidates stale builder cache entries.'

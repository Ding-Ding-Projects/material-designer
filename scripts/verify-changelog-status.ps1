[CmdletBinding()]
param(
  [string]$Repository = 'Ding-Ding-Projects/material-designer',
  [string]$HistoryOutput = 'design/apps/web/src/lib/changelog/release-history.generated.ts'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

function Invoke-Phase {
  param([string]$Name, [string]$File, [string[]]$Arguments)
  Write-Output "[verify-changelog-status] $Name"
  & $File @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$Name failed with exit code $LASTEXITCODE" }
}

function Assert-SourceMarker {
  param([string]$File, [string]$Marker)
  $text = Get-Content -LiteralPath (Join-Path $root $File) -Raw
  if (-not $text.Contains($Marker)) {
    throw "Missing changelog/status mount marker '$Marker' in $File"
  }
}

Push-Location $root
try {
  Write-Output '[verify-changelog-status] application mount coverage'
  Assert-SourceMarker 'design/apps/web/src/App.tsx' "<ChangelogDialog mountId=\"C12\" />"
  Assert-SourceMarker 'design/apps/web/src/App.tsx' 'onOpenChangelog={() => openChangelogViewer('
  Assert-SourceMarker 'design/apps/web/src/components/SettingsDialog.tsx' 'data-testid="settings-about-changelog"'
  Assert-SourceMarker 'design/apps/web/src/components/EntryShell.tsx' 'data-testid="entry-documentation-status-hub"'
  Assert-SourceMarker 'design/apps/web/src/components/EntryShell.tsx' 'createEmptyStatusFallback('
  Assert-SourceMarker 'design/apps/web/src/components/command-palette/commands.ts' "id: 'command.openChangelog'"
  Invoke-Phase 'release history completeness' 'node' @('scripts/generate-release-history.mjs', '--repo', $Repository, '--check', '--output', $HistoryOutput)
  Invoke-Phase 'release history red-then-green negative regression' 'node' @('scripts/test-release-history-negative.mjs')
  Invoke-Phase 'release integrity red-then-green negative regression' 'powershell.exe' @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'scripts/test-release-integrity-negative.ps1', '-SelfTest')
  Invoke-Phase 'front-screen provenance red-then-green negative regression' 'powershell.exe' @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'scripts/test-front-screen-provenance-negative.ps1', '-SelfTest')
  Write-Output '[verify-changelog-status] Complete. No build, lint, or GitHub Actions workflow was launched.'
} finally {
  Pop-Location
}

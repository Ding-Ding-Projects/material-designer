[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$feed = Get-Content -Raw -LiteralPath (Join-Path $repo 'design/apps/desktop/src/main/updater/feed.ts')
$updater = Get-Content -Raw -LiteralPath (Join-Path $repo 'design/apps/desktop/src/main/updater.ts')
$transfer = Get-Content -Raw -LiteralPath (Join-Path $repo 'design/packages/download/src/transfer.ts')
$popup = Get-Content -Raw -LiteralPath (Join-Path $repo 'design/apps/web/src/components/UpdaterPopup.tsx')
$model = Get-Content -Raw -LiteralPath (Join-Path $repo 'design/apps/web/src/lib/updater.ts')
$all = @($feed, $updater, $transfer, $popup, $model) -join "`n"
$failures = [Collections.Generic.List[string]]::new()

function Assert-Contract([string]$Source, [string]$Name) {
  $checks = @(
    @{ Name = 'cancel controller'; Pass = $Source.Contains('downloadAbortController') -and $Source.Contains('cancelDownload') -and $Source.Contains('DESKTOP_UPDATE_ACTIONS.CANCEL') },
    @{ Name = 'bounded request timeout'; Pass = $Source.Contains('UPDATE_REQUEST_TIMEOUT_MS') -and $Source.Contains('setTimeout(() => controller.abort()') },
    @{ Name = 'redirect refusal and final URL'; Pass = $Source.Contains('redirect: "error"') -and $Source.Contains('final URL host is not allowlisted') },
    @{ Name = 'streaming byte bound'; Pass = $Source.Contains('maxBytes') -and $Source.Contains('receivedBytes > target.maxBytes') -and $Source.Contains('SIZE_LIMIT') },
    @{ Name = 'newer progress while ready'; Pass = $Source.Contains('updater-newer-download-progress') -and $Source.Contains('downloadProgressFromStatus') },
    @{ Name = 'exact release notes link'; Pass = $Source.Contains('releaseNotesUrl') -and $Source.Contains('data-release-notes-url') },
    @{ Name = 'persistent cancel control'; Pass = $Source.Contains('updater-cancel-download') -and $Source.Contains('cancelUpdaterDownload') }
  )
  foreach ($check in $checks) {
    if (-not $check.Pass) { throw "$Name is missing $($check.Name)" }
  }
}

Assert-Contract $all 'updater source'

$redGreenCases = @(
  @{ Name = 'cancel'; Needle = 'downloadAbortController'; Replacement = 'cancel_state_removed' },
  @{ Name = 'timeout'; Needle = 'UPDATE_REQUEST_TIMEOUT_MS'; Replacement = 'timeout_constant_removed' },
  @{ Name = 'redirect'; Needle = 'redirect: "error"'; Replacement = 'redirect: "follow"' },
  @{ Name = 'chunk bound'; Needle = 'receivedBytes > target.maxBytes'; Replacement = 'stream_limit_removed' },
  @{ Name = 'progress'; Needle = 'updater-newer-download-progress'; Replacement = 'progress_marker_removed' },
  @{ Name = 'release link'; Needle = 'data-release-notes-url'; Replacement = 'release_link_marker_removed' }
)
foreach ($case in $redGreenCases) {
  $occurrences = $all.Split($case.Needle).Count - 1
  if ($occurrences -lt 1) { throw "red-green case '$($case.Name)' has no exact mutation boundary" }
  $broken = $all.Replace($case.Needle, $case.Replacement)
  $red = $false
  try { Assert-Contract $broken "broken $($case.Name)" } catch { $red = $true }
  if (-not $red) { throw "red-green case '$($case.Name)' stayed green after its exact boundary was removed" }
  Assert-Contract $all "restored $($case.Name)"
}

Write-Host "Updater contract passed: cancel, timeout, redirect, streaming bound, progress, and release-link red-green cases are wired."

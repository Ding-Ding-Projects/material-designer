[CmdletBinding()]
param(
  [string]$RepoRoot = '',
  [string]$ManifestPath = '',
  [switch]$SelfTest
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($RepoRoot)) { $RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')) }
if ([string]::IsNullOrWhiteSpace($ManifestPath)) {
  $ManifestPath = Join-Path $RepoRoot '.codex/verification/ui-drive/recording-evidence.json'
}
if (-not (Test-Path -LiteralPath $ManifestPath -PathType Leaf)) { throw "Recording evidence inventory is missing: $ManifestPath" }

function Assert-RecordingEvidence([object]$Manifest) {
  if ($Manifest.version -ne 1 -or $Manifest.policy -ne 'real-built-artifact-only' -or
      $Manifest.route -ne 'cheap-lowlevel-headless') {
    throw 'Recording evidence inventory has an unsupported policy or route.'
  }
  if ($Manifest.status -notin @('pending', 'verified')) { throw 'Recording evidence status is invalid.' }
  $required = @('open-application','open-main-destination','open-settings','open-documentation-reader','open-regex-builder','complete-one-real-task','show-an-honest-failure','show-empty-state','show-progress-and-cancellation','close-application')
  $actual = @($Manifest.requiredSteps)
  if ((Compare-Object ($required | Sort-Object) ($actual | Sort-Object))) { throw 'Recording inventory does not contain the exact required steps.' }
  if ([string]::IsNullOrWhiteSpace($Manifest.statusReason)) { throw 'Recording inventory has no status reason.' }
  if ($Manifest.status -eq 'pending') {
    if ($null -ne $Manifest.recording) { throw 'Pending recording evidence cannot claim a media path.' }
    return
  }
  if ($null -eq $Manifest.recording -or [string]::IsNullOrWhiteSpace($Manifest.recording.path) -or
      [string]::IsNullOrWhiteSpace($Manifest.recording.sha256) -or
      [string]::IsNullOrWhiteSpace($Manifest.recording.sourceCommit) -or
      [string]::IsNullOrWhiteSpace($Manifest.recording.artifactPath) -or
      [string]::IsNullOrWhiteSpace($Manifest.recording.artifactSha256) -or
      [string]::IsNullOrWhiteSpace($Manifest.recording.receiptsPath)) {
    throw 'Verified recording evidence must bind media, source commit, built output, and action receipts.'
  }
  if ($Manifest.recording.sourceCommit -notmatch '^[0-9a-fA-F]{40}$') { throw 'Verified recording source commit is not a full Git SHA.' }
  $sourceCommit = (& git -C $RepoRoot rev-parse HEAD).Trim()
  if ($LASTEXITCODE -ne 0 -or $Manifest.recording.sourceCommit.ToLowerInvariant() -ne $sourceCommit.ToLowerInvariant()) { throw 'Verified recording source commit does not match this checkout.' }
  foreach ($field in @('path', 'artifactPath', 'receiptsPath')) {
    $value = [string]$Manifest.recording.$field
    if ([System.IO.Path]::IsPathRooted($value) -or $value.Replace('\', '/') -match '(^|/)\.\.(\/|$)') { throw "Verified recording $field must be a repository-relative path." }
  }
  $recordingPath = Join-Path $RepoRoot $Manifest.recording.path
  if (-not (Test-Path -LiteralPath $recordingPath -PathType Leaf)) { throw "Verified recording is missing: $recordingPath" }
  $hash = (Get-FileHash -LiteralPath $recordingPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($hash -ne $Manifest.recording.sha256.ToLowerInvariant()) { throw 'Verified recording hash is stale.' }
  if ([string]$Manifest.recording.path -notmatch '\.(mp4|webm|mkv)$') { throw 'Verified recording media must use a supported video format.' }
  $artifactPath = Join-Path $RepoRoot $Manifest.recording.artifactPath
  if (-not (Test-Path -LiteralPath $artifactPath -PathType Leaf)) { throw "Verified built output is missing: $artifactPath" }
  $artifactHash = (Get-FileHash -LiteralPath $artifactPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($artifactHash -ne $Manifest.recording.artifactSha256.ToLowerInvariant()) { throw 'Verified built output hash is stale.' }
  $receiptsPath = Join-Path $RepoRoot $Manifest.recording.receiptsPath
  if (-not (Test-Path -LiteralPath $receiptsPath -PathType Leaf)) { throw "Verified action receipts are missing: $receiptsPath" }
  $receipts = Get-Content -Raw -LiteralPath $receiptsPath | ConvertFrom-Json
  foreach ($step in $required) {
    $matches = @($receipts | Where-Object { $_.step -eq $step })
    if ($matches.Count -ne 1) { throw "Verified action receipts must contain exactly one receipt for $step." }
    $receipt = $matches[0]
    if ([string]$receipt.sourceCommit -ne [string]$Manifest.recording.sourceCommit -or
        [string]$receipt.artifactSha256 -ne [string]$Manifest.recording.artifactSha256 -or
        [string]::IsNullOrWhiteSpace([string]$receipt.capturePath) -or
        [string]::IsNullOrWhiteSpace([string]$receipt.captureSha256) -or
        [string]::IsNullOrWhiteSpace([string]$receipt.preState) -or
        [string]::IsNullOrWhiteSpace([string]$receipt.postState)) {
      throw "Action receipt for $step is not bound to the media, built output, and semantic before/after states."
    }
  }
}

$manifest = Get-Content -Raw -LiteralPath $ManifestPath | ConvertFrom-Json
Assert-RecordingEvidence $manifest
Write-Output "PASS: recording evidence is $($manifest.status), with no fabricated media."

if ($SelfTest) {
  $broken = $manifest | ConvertTo-Json -Depth 10 | ConvertFrom-Json
  $broken.status = 'verified'
  $broken.recording = $null
  $red = $false
  try { Assert-RecordingEvidence $broken } catch { $red = $true }
  if (-not $red) { throw 'Negative regression stayed green after promoting media without a receipt.' }
  Assert-RecordingEvidence $manifest
  Write-Output 'PASS: recording evidence negative regression turned red, then green after restoration.'
}

[CmdletBinding()]
param(
  [string]$Root
)

$ErrorActionPreference = 'Stop'
$scriptRoot = if ([string]::IsNullOrWhiteSpace($PSScriptRoot)) { Split-Path -Parent $MyInvocation.MyCommand.Definition } else { $PSScriptRoot }
if ([string]::IsNullOrWhiteSpace($Root)) { $Root = Join-Path $scriptRoot '..' }
$inventoryPath = Join-Path $scriptRoot 'browser-download-surface-inventory.tsv'
$expectedIds = @(
  'extension-start-trigger',
  'in-page-start-trigger',
  'trusted-sender',
  'worker-proposal',
  'transfer-start',
  'transfer-events',
  'progress-poll',
  'pause',
  'resume',
  'cancel-worker',
  'open-worker',
  'completion-notification',
  'window-state-query',
  'always-on-top',
  'start-surface',
  'start-script',
  'progress-surface',
  'completion-surface',
  'state-read',
  'action-pending',
  'manifest-notifications',
  'pending-style',
  'poll-rearm',
  'localized-start',
  'terminal-cleanup'
)


function Read-Inventory {
  if (-not (Test-Path -LiteralPath $inventoryPath -PathType Leaf)) {
    throw "Missing browser-download surface inventory: $inventoryPath"
  }
  $rows = @(Import-Csv -LiteralPath $inventoryPath -Delimiter "`t")
  if ($rows.Count -lt 1) { throw 'The browser-download surface inventory is empty.' }
  $actualIds = @($rows | ForEach-Object { $_.id })
  $expectedSet = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
  $actualSet = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
  foreach ($id in $expectedIds) { [void]$expectedSet.Add($id) }
  foreach ($id in $actualIds) { [void]$actualSet.Add($id) }
  $missingIds = @($expectedSet | Where-Object { -not $actualSet.Contains($_) })
  $extraIds = @($actualSet | Where-Object { -not $expectedSet.Contains($_) })
  if ($missingIds.Count -gt 0 -or $extraIds.Count -gt 0 -or $actualSet.Count -ne $expectedSet.Count) {
    throw "Browser-download inventory ids do not match the hand-written expected set. Expected: $($expectedIds -join ', '); actual: $($actualIds -join ', ')"
  }
  return $rows
}

function Remove-JavaScriptComments([string]$Text) {
  $out = [Text.StringBuilder]::new()
  $state = 'code'
  $escaped = $false
  for ($i = 0; $i -lt $Text.Length; $i += 1) {
    $ch = $Text[$i]
    $next = if ($i + 1 -lt $Text.Length) { $Text[$i + 1] } else { [char]0 }
    if ($state -eq 'line') {
      if ($ch -eq "`r" -or $ch -eq "`n") { [void]$out.Append($ch); $state = 'code' }
      continue
    }
    if ($state -eq 'block') {
      if ($ch -eq '*' -and $next -eq '/') { $i += 1; $state = 'code' }
      elseif ($ch -eq "`r" -or $ch -eq "`n") { [void]$out.Append($ch) }
      continue
    }
    if ($state -eq 'single' -or $state -eq 'double' -or $state -eq 'template') {
      [void]$out.Append($ch)
      if ($escaped) { $escaped = $false; continue }
      if ($ch -eq '\') { $escaped = $true; continue }
      if (($state -eq 'single' -and $ch -eq "'") -or ($state -eq 'double' -and $ch -eq '"') -or ($state -eq 'template' -and $ch -eq '`')) { $state = 'code' }
      continue
    }
    if ($ch -eq '/' -and $next -eq '/') { $i += 1; $state = 'line'; continue }
    if ($ch -eq '/' -and $next -eq '*') { $i += 1; $state = 'block'; continue }
    [void]$out.Append($ch)
    if ($ch -eq "'") { $state = 'single' }
    elseif ($ch -eq '"') { $state = 'double' }
    elseif ($ch -eq '`') { $state = 'template' }
  }
  return $out.ToString()
}

function Remove-JavaScriptStrings([string]$Text) {
  $out = [Text.StringBuilder]::new()
  $state = 'code'
  $escaped = $false
  for ($i = 0; $i -lt $Text.Length; $i += 1) {
    $ch = $Text[$i]
    if ($state -eq 'single' -or $state -eq 'double' -or $state -eq 'template') {
      if ($ch -eq "`r" -or $ch -eq "`n") { [void]$out.Append($ch) }
      else { [void]$out.Append(' ') }
      if ($escaped) { $escaped = $false; continue }
      if ($ch -eq '\') { $escaped = $true; continue }
      if (($state -eq 'single' -and $ch -eq "'") -or ($state -eq 'double' -and $ch -eq '"') -or ($state -eq 'template' -and $ch -eq '`')) { $state = 'code' }
      continue
    }
    [void]$out.Append($ch)
    if ($ch -eq "'") { $state = 'single' }
    elseif ($ch -eq '"') { $state = 'double' }
    elseif ($ch -eq '`') { $state = 'template' }
  }
  return $out.ToString()
}

function MarkerKind([string]$Marker) {
  if ($Marker -match '^export\s+(function|type|interface)\b') { return 'declaration' }
  if ($Marker -match '[A-Za-z_$][A-Za-z0-9_$]*\s*\(' -and $Marker -notmatch '["'']') { return 'call' }
  return 'literal'
}

function Assert-Marker([string]$Text, [string]$Marker, [string]$RowId) {
  $commentFree = Remove-JavaScriptComments $Text
  $search = if ((MarkerKind $Marker) -eq 'literal') { $commentFree } else { Remove-JavaScriptStrings $commentFree }
  $index = $search.IndexOf($Marker, [StringComparison]::Ordinal)
  if ($index -lt 0) { throw "Missing exact browser-download marker for $RowId`: $Marker" }
  if ((MarkerKind $Marker) -eq 'call') {
    if ($index -gt 0 -and ($search[$index - 1] -match '[A-Za-z0-9_$]')) { throw "Call marker is not at an executable boundary for $RowId`: $Marker" }
  }
}

function Assert-Inventory([string]$SourceRoot) {
  $rows = @(Read-Inventory)
  $seen = [Collections.Generic.HashSet[string]]::new()
  foreach ($row in $rows) {
    if ([string]::IsNullOrWhiteSpace($row.id) -or [string]::IsNullOrWhiteSpace($row.source) -or [string]::IsNullOrWhiteSpace($row.marker)) {
      throw 'Every browser-download row needs an id, source, and exact marker.'
    }
    if (-not $seen.Add($row.id)) { throw "Duplicate browser-download inventory id: $($row.id)" }
    $path = Join-Path $SourceRoot ($row.source -replace '/', '\')
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Missing source for $($row.id): $($row.source)" }
    Assert-Marker ([IO.File]::ReadAllText($path)) $row.marker $row.id
  }
}

$rows = @(Read-Inventory)
Assert-Inventory $Root

# Remove every marker from disposable copies. This proves comment, rename, and
# no-op mutations cannot satisfy the inventory after any row is changed.
function Alter-Marker([string]$Marker) {
  $chars = $Marker.ToCharArray()
  for ($i = 0; $i -lt $chars.Length; $i += 1) {
    if ([char]::IsLetter($chars[$i])) {
      $chars[$i] = if ($chars[$i] -ceq $chars[$i].ToString().ToUpperInvariant()) { [char]$chars[$i].ToString().ToLowerInvariant() } else { [char]$chars[$i].ToString().ToUpperInvariant() }
      return -join $chars
    }
  }
  throw 'The rename probe marker has no letter to alter.'
}

$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ("material-designer-browser-download-$([guid]::NewGuid().ToString('N'))")
New-Item -ItemType Directory -Path $tempRoot | Out-Null
try {
  foreach ($row in $rows) {
    $sourcePath = Join-Path $Root ($row.source -replace '/', '\')
    $relative = $row.source -replace '/', '\'
    $destination = Join-Path $tempRoot $relative
    New-Item -ItemType Directory -Path (Split-Path $destination -Parent) -Force | Out-Null
    Copy-Item -LiteralPath $sourcePath -Destination $destination -Force
  }
  foreach ($row in $rows) {
    $sourcePath = Join-Path $Root ($row.source -replace '/', '\')
    $relative = $row.source -replace '/', '\'
    $probePath = Join-Path $tempRoot $relative
    New-Item -ItemType Directory -Path (Split-Path $probePath -Parent) -Force | Out-Null
    Copy-Item -LiteralPath $sourcePath -Destination $probePath -Force
    $original = [IO.File]::ReadAllText($probePath)
    $probeIndex = $original.IndexOf($row.marker, [StringComparison]::Ordinal)
    if ($probeIndex -lt 0) { throw "The negative-regression marker was not present for $($row.id)." }
    foreach ($mutation in @('remove', 'comment', 'rename')) {
      if ($mutation -eq 'remove') {
        $changed = $original.Remove($probeIndex, $row.marker.Length)
      } elseif ($mutation -eq 'comment') {
        $lineStart = $original.LastIndexOf("`n", [Math]::Max(0, $probeIndex - 1)) + 1
        $lineEnd = $original.IndexOf("`n", $probeIndex)
        if ($lineEnd -lt 0) { $lineEnd = $original.Length }
        $changed = $original.Remove($lineStart, $lineEnd - $lineStart).Insert($lineStart, "// $($original.Substring($lineStart, $lineEnd - $lineStart))")
      } else {
        $changedMarker = Alter-Marker $row.marker
        $changed = $original.Remove($probeIndex, $row.marker.Length).Insert($probeIndex, $changedMarker)
      }
      if ($changed -ceq $original) { throw "The $mutation negative probe for $($row.id) was a no-op." }
      [IO.File]::WriteAllText($probePath, $changed)
      $red = $false
      try { Assert-Inventory $tempRoot $true } catch {
        $message = $_.Exception.Message
        if (-not $message.Contains([string]$row.id) -or -not $message.Contains([string]$row.marker)) {
          throw "The $mutation probe for $($row.id) failed without its row-specific marker: $message"
        }
        $red = $true
      }
      if (-not $red) { throw "Negative regression stayed green for the $mutation mutation on $($row.id)." }
      [IO.File]::WriteAllText($probePath, $original)
    }
  }
}
finally {
  Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
}

Assert-Inventory $Root
Write-Output 'PASS: browser-download lifecycle inventory is complete, comment-excluding exact markers hold, and remove, comment, and rename regressions turned red then green.'

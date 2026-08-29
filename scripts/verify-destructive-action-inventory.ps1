[CmdletBinding()]
param(
  [string]$Root
)

$ErrorActionPreference = 'Stop'
$scriptRoot = if ([string]::IsNullOrWhiteSpace($PSScriptRoot)) { Split-Path -Parent $MyInvocation.MyCommand.Definition } else { $PSScriptRoot }
if ([string]::IsNullOrWhiteSpace($Root)) { $Root = Join-Path $scriptRoot '..' }
$inventoryPath = Join-Path $scriptRoot 'destructive-action-inventory.tsv'
$expectedIds = @(
  'gate-state', 'gate-reentry', 'gate-copy', 'gate-cancel-focus',
  'handler-bridge', 'request-identity', 'summary-display', 'preflight',
  'preflight-expiry', 'handler-token', 'summary-match', 'success-separation',
  'route-projects-single', 'route-projects-bulk', 'route-projects-recent',
  'route-brand-single', 'route-design-system-single', 'route-library-card',
  'route-library-preview', 'route-library-bulk', 'route-design-system-project',
  'route-memory-entry', 'route-memory-extraction', 'route-memory-clear',
  'route-routine-single', 'route-conversation-single', 'route-conversation-menu',
  'route-project-file-single', 'route-project-file-bulk', 'route-design-system-marketplace'
)

function Read-Inventory {
  if (-not (Test-Path -LiteralPath $inventoryPath -PathType Leaf)) {
    throw "Missing destructive-action inventory: $inventoryPath"
  }
  $rows = @(Import-Csv -LiteralPath $inventoryPath -Delimiter "`t")
  if ($rows.Count -lt 1) { throw 'The destructive-action inventory is empty.' }
  $expectedSet = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
  $actualSet = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
  foreach ($id in $expectedIds) { [void]$expectedSet.Add($id) }
  foreach ($id in @($rows | ForEach-Object { $_.id })) { [void]$actualSet.Add($id) }
  $missingIds = @($expectedSet | Where-Object { -not $actualSet.Contains($_) })
  $extraIds = @($actualSet | Where-Object { -not $expectedSet.Contains($_) })
  if ($missingIds.Count -gt 0 -or $extraIds.Count -gt 0 -or $actualSet.Count -ne $expectedSet.Count) {
    throw "Destructive-action inventory ids do not match the hand-written expected set. Expected: $($expectedIds -join ', '); actual: $(@($rows | ForEach-Object { $_.id }) -join ', ')"
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

function Assert-Inventory([string]$SourceRoot) {
  $rows = @(Read-Inventory)
  $seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
  foreach ($row in $rows) {
    if ([string]::IsNullOrWhiteSpace($row.id) -or [string]::IsNullOrWhiteSpace($row.source) -or [string]::IsNullOrWhiteSpace($row.marker)) {
      throw 'Every destructive-action row needs an id, source, and exact marker.'
    }
    if (-not $seen.Add($row.id)) { throw "Duplicate destructive-action inventory id: $($row.id)" }
    $path = Join-Path $SourceRoot ($row.source -replace '/', '\')
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Missing source for $($row.id): $($row.source)" }
    $text = Remove-JavaScriptComments ([IO.File]::ReadAllText($path))
    if ($text.IndexOf($row.marker, [StringComparison]::Ordinal) -lt 0) {
      throw "Missing exact destructive-action marker for $($row.id): $($row.marker)"
    }
  }
}

$rows = @(Read-Inventory)
Assert-Inventory $Root

# Removing one exact handler marker must turn the inventory red. The copied
# source is also used for comment, rename, and no-op probes without touching
# the actual Gerk Tong Hui.
$probe = $rows | Where-Object id -eq 'handler-bridge' | Select-Object -First 1
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ("material-designer-destructive-$([guid]::NewGuid().ToString('N'))")
New-Item -ItemType Directory -Path $tempRoot | Out-Null
try {
  foreach ($mutation in @('remove', 'comment', 'rename')) {
    Get-ChildItem -LiteralPath $tempRoot -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    foreach ($row in $rows) {
      $source = Join-Path $Root ($row.source -replace '/', '\')
      $relative = $row.source -replace '/', '\'
      $destination = Join-Path $tempRoot $relative
      New-Item -ItemType Directory -Path (Split-Path $destination -Parent) -Force | Out-Null
      Copy-Item -LiteralPath $source -Destination $destination -Force
    }
    $probePath = Join-Path $tempRoot ($probe.source -replace '/', '\')
    $probeText = [IO.File]::ReadAllText($probePath)
    $probeIndex = $probeText.IndexOf($probe.marker, [StringComparison]::Ordinal)
    if ($probeIndex -lt 0) { throw "The negative-regression marker was not present for $mutation." }
    if ($mutation -eq 'remove') {
      $changed = $probeText.Remove($probeIndex, $probe.marker.Length)
    } elseif ($mutation -eq 'comment') {
      $changed = $probeText.Remove($probeIndex, $probe.marker.Length).Insert($probeIndex, "/* $($probe.marker) */")
    } else {
      $token = 'confirmedDelete'
      $tokenOffset = $probe.marker.IndexOf($token, [StringComparison]::Ordinal)
      $tokenIndex = if ($tokenOffset -lt 0) { -1 } else { $probeIndex + $tokenOffset }
      if ($tokenIndex -lt 0) { throw 'The rename probe token was not present.' }
      $changed = $probeText.Remove($tokenIndex, $token.Length).Insert($tokenIndex, "$token-renamed")
    }
    if ($changed -eq $probeText) { throw "The $mutation negative probe was a no-op." }
    [IO.File]::WriteAllText($probePath, $changed)
    $red = $false
    try { Assert-Inventory $tempRoot } catch { $red = $true }
    if (-not $red) { throw "Negative regression stayed green for the $mutation mutation." }
  }
}
finally {
  Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
}

Assert-Inventory $Root
Write-Output 'PASS: destructive inventory uses comment-excluding exact markers, and remove, comment, and rename regressions turned red then green.'

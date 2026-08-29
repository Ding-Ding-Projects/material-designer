[CmdletBinding()]
param(
  [string]$Root = (Join-Path $PSScriptRoot '..')
)

$ErrorActionPreference = 'Stop'
$inventoryPath = Join-Path $PSScriptRoot 'browser-download-surface-inventory.tsv'

function Read-Inventory {
  if (-not (Test-Path -LiteralPath $inventoryPath -PathType Leaf)) {
    throw "Missing browser-download surface inventory: $inventoryPath"
  }
  $rows = @(Import-Csv -LiteralPath $inventoryPath -Delimiter "`t")
  if ($rows.Count -lt 1) { throw 'The browser-download surface inventory is empty.' }
  return $rows
}

function Assert-Inventory([string]$SourceRoot) {
  foreach ($row in (Read-Inventory)) {
    if ([string]::IsNullOrWhiteSpace($row.id) -or [string]::IsNullOrWhiteSpace($row.source) -or [string]::IsNullOrWhiteSpace($row.marker)) {
      throw 'Every browser-download row needs an id, source, and exact marker.'
    }
    $path = Join-Path $SourceRoot ($row.source -replace '/', '\\')
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
      throw "Missing source for $($row.id): $($row.source)"
    }
    $text = [IO.File]::ReadAllText($path)
    if ($text.IndexOf($row.marker, [StringComparison]::Ordinal) -lt 0) {
      throw "Missing exact browser-download marker for $($row.id): $($row.marker)"
    }
  }
}

$rows = @(Read-Inventory)
$ids = [Collections.Generic.HashSet[string]]::new()
foreach ($row in $rows) {
  if (-not $ids.Add($row.id)) { throw "Duplicate browser-download inventory id: $($row.id)" }
}

Assert-Inventory $Root

# Deliberately remove one exact marker in a disposable source tree. A positive
# check that is never observed turning red is only decoration.
$probe = $rows | Where-Object id -eq 'start' | Select-Object -First 1
if ($null -eq $probe) { throw 'The inventory must include the start row for its negative regression.' }
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ("material-designer-browser-download-$([guid]::NewGuid().ToString('N'))")
New-Item -ItemType Directory -Path $tempRoot | Out-Null
try {
  foreach ($row in $rows) {
    $source = Join-Path $Root ($row.source -replace '/', '\\')
    $relative = $row.source -replace '/', '\\'
    $destination = Join-Path $tempRoot $relative
    New-Item -ItemType Directory -Path (Split-Path $destination -Parent) -Force | Out-Null
    Copy-Item -LiteralPath $source -Destination $destination -Force
  }
  $probePath = Join-Path $tempRoot ($probe.source -replace '/', '\\')
  $probeText = [IO.File]::ReadAllText($probePath)
  $probeIndex = $probeText.IndexOf($probe.marker, [StringComparison]::Ordinal)
  if ($probeIndex -lt 0) { throw 'The negative-regression marker was not present in the probe copy.' }
  $changed = $probeText.Remove($probeIndex, $probe.marker.Length)
  [IO.File]::WriteAllText($probePath, $changed)
  $red = $false
  try { Assert-Inventory $tempRoot } catch { $red = $true }
  if (-not $red) { throw 'Negative regression stayed green after removing the exact Start marker.' }
}
finally {
  Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
}

Assert-Inventory $Root
Write-Output 'PASS: browser-download Start, progress, completion, origin, queue, and always-on-top inventory is complete, and its negative regression turned red then green.'

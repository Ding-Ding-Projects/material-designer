[CmdletBinding()]
param(
  [string]$Root = (Join-Path $PSScriptRoot '..')
)

$ErrorActionPreference = 'Stop'
$inventoryPath = Join-Path $PSScriptRoot 'destructive-action-inventory.tsv'

function Read-Inventory {
  if (-not (Test-Path -LiteralPath $inventoryPath -PathType Leaf)) {
    throw "Missing destructive-action inventory: $inventoryPath"
  }
  $rows = @(Import-Csv -LiteralPath $inventoryPath -Delimiter "`t")
  if ($rows.Count -lt 1) { throw 'The destructive-action inventory is empty.' }
  return $rows
}

function Assert-Inventory([string]$SourceRoot) {
  $rows = @(Read-Inventory)
  $seen = [Collections.Generic.HashSet[string]]::new()
  foreach ($row in $rows) {
    if ([string]::IsNullOrWhiteSpace($row.id) -or [string]::IsNullOrWhiteSpace($row.source) -or [string]::IsNullOrWhiteSpace($row.marker)) {
      throw 'Every inventory row needs an id, source, and exact marker.'
    }
    if (-not $seen.Add($row.id)) { throw "Duplicate inventory id: $($row.id)" }
    $path = Join-Path $SourceRoot ($row.source -replace '/', '\')
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Missing source for $($row.id): $($row.source)" }
    $text = [IO.File]::ReadAllText($path)
    if ($text.IndexOf($row.marker, [StringComparison]::Ordinal) -lt 0) {
      throw "Missing exact source boundary for $($row.id): $($row.marker)"
    }
  }
}

Assert-Inventory $Root

$probe = Get-Content -LiteralPath $inventoryPath | Select-Object -Skip 2 -First 1
$probeParts = $probe -split "`t", 4
$probeRelative = $probeParts[1] -replace '/', '\'
$probePath = Join-Path $Root $probeRelative
$probeMarker = $probeParts[2]
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ("material-designer-destructive-$([guid]::NewGuid().ToString('N'))")
New-Item -ItemType Directory -Path $tempRoot | Out-Null
try {
  $probeRoot = Join-Path $tempRoot 'root'
  foreach ($row in (Read-Inventory)) {
    $source = Join-Path $Root ($row.source -replace '/', '\')
    $relative = $row.source -replace '/', '\'
    $destination = Join-Path $probeRoot $relative
    New-Item -ItemType Directory -Path (Split-Path $destination -Parent) -Force | Out-Null
    Copy-Item -LiteralPath $source -Destination $destination -Force
  }
  $probeCopy = Join-Path $probeRoot $probeRelative
  [IO.File]::WriteAllText($probeCopy, [IO.File]::ReadAllText($probeCopy).Replace($probeMarker, ''))
  $red = $false
  try { Assert-Inventory $probeRoot } catch { $red = $true }
  if (-not $red) { throw 'Negative regression stayed green after removing an exact gate boundary.' }
}
finally {
  Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
}

Assert-Inventory $Root
Write-Output 'PASS: destructive-action inventory is complete, and its negative regression turned red then green.'

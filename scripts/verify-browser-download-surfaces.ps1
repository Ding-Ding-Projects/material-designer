[CmdletBinding()]
param(
  [string]$Root = (Join-Path $PSScriptRoot '..')
)

$ErrorActionPreference = 'Stop'
$inventoryPath = Join-Path $PSScriptRoot 'browser-download-surface-inventory.tsv'

function Read-Inventory {
  $rows = @(Import-Csv -LiteralPath $inventoryPath -Delimiter "`t")
  if ($rows.Count -lt 1) { throw 'The browser-download surface inventory is empty.' }
  return $rows
}

function Assert-Inventory([string]$SourceRoot) {
  $rows = @(Read-Inventory)
  $seen = [Collections.Generic.HashSet[string]]::new()
  foreach ($row in $rows) {
    if (-not $seen.Add($row.id)) { throw "Duplicate browser-download inventory id: $($row.id)" }
    $path = Join-Path $SourceRoot ($row.source -replace '/', '\')
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Missing source for $($row.id): $($row.source)" }
    $text = [IO.File]::ReadAllText($path)
    if ($text.IndexOf($row.marker, [StringComparison]::Ordinal) -lt 0) {
      throw "Missing exact browser-download marker for $($row.id): $($row.marker)"
    }
  }
}

Assert-Inventory $Root
$probe = (Read-Inventory)[0]
$probeRelative = $probe.source -replace '/', '\'
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ("material-designer-browser-download-$([guid]::NewGuid().ToString('N'))")
New-Item -ItemType Directory -Path $tempRoot | Out-Null
try {
  foreach ($row in (Read-Inventory)) {
    $source = Join-Path $Root ($row.source -replace '/', '\')
    $relative = $row.source -replace '/', '\'
    $destination = Join-Path $tempRoot $relative
    New-Item -ItemType Directory -Path (Split-Path $destination -Parent) -Force | Out-Null
    Copy-Item -LiteralPath $source -Destination $destination -Force
  }
  $probeCopy = Join-Path $tempRoot $probeRelative
  [IO.File]::WriteAllText($probeCopy, [IO.File]::ReadAllText($probeCopy).Replace($probe.marker, ''))
  $red = $false
  try { Assert-Inventory $tempRoot } catch { $red = $true }
  if (-not $red) { throw 'Negative regression stayed green after removing the exact Start trigger.' }
}
finally {
  Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
}

Assert-Inventory $Root
Write-Output 'PASS: browser-download Start, progress, and completion inventory is complete, and its negative regression turned red then green.'

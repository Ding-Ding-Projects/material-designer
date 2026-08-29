[CmdletBinding()]
param(
  [string]$Root
)

$ErrorActionPreference = 'Stop'
$scriptRoot = if ([string]::IsNullOrWhiteSpace($PSScriptRoot)) { Split-Path -Parent $MyInvocation.MyCommand.Definition } else { $PSScriptRoot }
if ([string]::IsNullOrWhiteSpace($Root)) { $Root = Join-Path $scriptRoot '..' }
$inventoryPath = Join-Path $scriptRoot 'browser-download-surface-inventory.tsv'
$expectedIds = @(
  'start', 'start-decision', 'extension-origin', 'handoff-origin', 'progress',
  'progress-values', 'pause-resume-cancel', 'cancel', 'completion',
  'completion-dismiss', 'queue-binding', 'always-on-top', 'extension-start-trigger',
  'trusted-sender', 'worker-proposal', 'transfer-start', 'transfer-events',
  'pause', 'resume', 'cancel-worker', 'open-worker', 'completion-notification',
  'window-state-query', 'start-surface', 'start-script', 'progress-surface',
  'completion-surface', 'state-read', 'action-pending', 'manifest-notifications',
  'pending-style', 'dialog-primitive', 'dynamic-focus', 'poll-rearm',
  'react-action-latch', 'react-open-latch', 'react-completion-top-state', 'dialog-focus-test', 'missing-active-id'
)

function Read-Inventory([string]$Path = $inventoryPath) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "Missing browser-download surface inventory: $Path"
  }
  $rows = @(Import-Csv -LiteralPath $Path -Delimiter "`t")
  if ($rows.Count -lt 1) { throw 'The browser-download surface inventory is empty.' }
  $actualIds = @($rows | ForEach-Object { $_.id })
  $expectedSet = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
  $actualSet = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
  foreach ($id in $expectedIds) { [void]$expectedSet.Add($id) }
  foreach ($id in $actualIds) { [void]$actualSet.Add($id) }
  $missingIds = @($expectedSet | Where-Object { -not $actualSet.Contains($_) })
  $extraIds = @($actualSet | Where-Object { -not $expectedSet.Contains($_) })
  if ($missingIds.Count -gt 0) {
    throw "Missing browser-download inventory row: $($missingIds -join ', ')"
  }
  if ($extraIds.Count -gt 0 -or $actualSet.Count -ne $expectedSet.Count) {
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
  if ($Marker -match '^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*\s*\(') { return 'call' }
  return 'literal'
}

function Test-CodeOffset([string]$Text, [int]$Index) {
  $state = 'code'
  $escaped = $false
  $templateExpressionDepth = 0
  $templateParents = [Collections.Generic.List[int]]::new()
  for ($i = 0; $i -lt $Index; $i += 1) {
    $ch = $Text[$i]
    $next = if ($i + 1 -lt $Index) { $Text[$i + 1] } else { [char]0 }
    if ($state -eq 'single' -or $state -eq 'double') {
      if ($escaped) { $escaped = $false; continue }
      if ($ch -eq '\') { $escaped = $true; continue }
      if (($state -eq 'single' -and $ch -eq "'") -or ($state -eq 'double' -and $ch -eq '"')) { $state = 'code' }
      continue
    }
    if ($state -eq 'template') {
      if ($escaped) { $escaped = $false; continue }
      if ($ch -eq '\') { $escaped = $true; continue }
      if ($ch -eq '`') {
        if ($templateParents.Count -lt 1) { return $false }
        $parentDepth = $templateParents[$templateParents.Count - 1]
        $templateParents.RemoveAt($templateParents.Count - 1)
        $templateExpressionDepth = $parentDepth
        $state = 'code'
        continue
      }
      if ($ch -eq '$' -and $next -eq '{') { $state = 'code'; $templateExpressionDepth = 1; $i += 1 }
      continue
    }
    if ($templateExpressionDepth -gt 0) {
      if ($ch -eq '{') { $templateExpressionDepth += 1; continue }
      if ($ch -eq '}') { $templateExpressionDepth -= 1; if ($templateExpressionDepth -eq 0) { $state = 'template' }; continue }
    }
    if ($ch -eq "'") { $state = 'single' }
    elseif ($ch -eq '"') { $state = 'double' }
    elseif ($ch -eq '`') { $templateParents.Add($templateExpressionDepth); $templateExpressionDepth = 0; $state = 'template' }
  }
  return $state -eq 'code' -and $templateExpressionDepth -ge 0
}

function Find-CodeMarkerIndex([string]$Text, [string]$Marker) {
  $commentFree = Remove-JavaScriptComments $Text
  $start = 0
  while ($start -lt $commentFree.Length) {
    $index = $commentFree.IndexOf($Marker, $start, [StringComparison]::Ordinal)
    if ($index -lt 0) { return -1 }
    if (Test-CodeOffset $commentFree $index) { return $index }
    $start = $index + 1
  }
  return -1
}

function Test-JsxTagAttached([string]$Text, [int]$TagStart) {
  $boundary = -1
  for ($i = $TagStart - 1; $i -ge 0; $i -= 1) {
    if ($Text[$i] -eq ';' -or $Text[$i] -eq '{' -or $Text[$i] -eq '}') { $boundary = $i; break }
  }
  $statement = $Text.Substring($boundary + 1, $TagStart - $boundary - 1)
  return -not ($statement -match '\b(const|let|var)\s+[A-Za-z_$][A-Za-z0-9_$]*\s*=')
}

function Test-DetachedCallable([string]$Text, [int]$MarkerIndex) {
  $lineStart = $Text.LastIndexOf("`n", [Math]::Max(0, $MarkerIndex - 1)) + 1
  $lineEnd = $Text.IndexOf("`n", $MarkerIndex)
  if ($lineEnd -lt 0) { $lineEnd = $Text.Length }
  return $Text.Substring($lineStart, $lineEnd - $lineStart).IndexOf('__inventoryDetached', [StringComparison]::Ordinal) -ge 0
}

function Assert-JavaScriptMarker([string]$Text, [string]$Marker, [string]$RowId) {
  $commentFree = Remove-JavaScriptComments $Text
  if ($Marker.Contains('data-testid=')) {
    for ($i = 0; $i -lt $commentFree.Length; $i += 1) {
      if ($commentFree[$i] -ne '<') { continue }
      if ($i + 1 -ge $commentFree.Length -or $commentFree[$i + 1] -notmatch '[A-Za-z]') { continue }
      $quote = [char]0
      $braceDepth = 0
      for ($j = $i + 1; $j -lt $commentFree.Length; $j += 1) {
        $ch = $commentFree[$j]
        if ($quote -ne [char]0) {
          if ($ch -eq $quote -and $commentFree[$j - 1] -ne '\') { $quote = [char]0 }
          continue
        }
        if ($ch -eq "'" -or $ch -eq '"') { $quote = $ch; continue }
        if ($ch -eq '{') { $braceDepth += 1; continue }
        if ($ch -eq '}' -and $braceDepth -gt 0) { $braceDepth -= 1; continue }
        if ($ch -ne '>' -or $braceDepth -ne 0) { continue }
        $tag = $commentFree.Substring($i, $j - $i + 1)
        if ($tag.IndexOf($Marker, [StringComparison]::Ordinal) -ge 0 -and (Test-JsxTagAttached $commentFree $i)) { return }
        break
      }
    }
    throw "Missing exact browser-download marker for $RowId`: $Marker"
  }
  $index = Find-CodeMarkerIndex $Text $Marker
  if ($index -lt 0) { throw "Missing exact browser-download marker for $RowId`: $Marker" }
  if ((MarkerKind $Marker) -eq 'call' -and (Test-DetachedCallable $commentFree $index)) {
    throw "Browser-download marker is detached from its executable owner for $RowId`: $Marker"
  }
  if ((MarkerKind $Marker) -eq 'call' -and $index -gt 0 -and ($commentFree[$index - 1] -match '[A-Za-z0-9_$]')) {
    throw "Call marker is not at an executable boundary for $RowId`: $Marker"
  }
}

function Remove-HtmlComments([string]$Text) {
  $out = [Text.StringBuilder]::new()
  $inComment = $false
  for ($i = 0; $i -lt $Text.Length; $i += 1) {
    if (-not $inComment -and $i + 3 -lt $Text.Length -and $Text.Substring($i, 4) -ceq '<!--') { $inComment = $true; $i += 3; continue }
    if ($inComment) {
      if ($i + 2 -lt $Text.Length -and $Text.Substring($i, 3) -ceq '-->') { $inComment = $false; $i += 2 }
      continue
    }
    [void]$out.Append($Text[$i])
  }
  return $out.ToString()
}

function Assert-HtmlMarker([string]$Text, [string]$Marker, [string]$RowId) {
  $commentFree = Remove-HtmlComments $Text
  for ($i = 0; $i -lt $commentFree.Length; $i += 1) {
    if ($commentFree[$i] -ne '<') { continue }
    $quote = [char]0
    for ($j = $i + 1; $j -lt $commentFree.Length; $j += 1) {
      $ch = $commentFree[$j]
      if ($quote -ne [char]0) {
        if ($ch -eq $quote -and $commentFree[$j - 1] -ne '\') { $quote = [char]0 }
        continue
      }
      if ($ch -eq "'" -or $ch -eq '"') { $quote = $ch; continue }
      if ($ch -ne '>') { continue }
      if ($commentFree.Substring($i, $j - $i + 1).IndexOf($Marker, [StringComparison]::Ordinal) -ge 0) { return }
      break
    }
  }
  throw "Missing exact browser-download marker for $RowId`: $Marker"
}

function Test-JsonValue([object]$Value, [string]$Needle) {
  if ($null -eq $Value) { return $false }
  if ($Value -is [string]) { return $Value -ceq $Needle }
  if ($Value -is [Collections.IDictionary]) {
    foreach ($key in $Value.Keys) {
      if ([string]$key -ceq $Needle -or (Test-JsonValue $Value[$key] $Needle)) { return $true }
    }
    return $false
  }
  if ($Value -is [PSCustomObject]) {
    foreach ($property in $Value.PSObject.Properties) {
      if ([string]$property.Name -ceq $Needle -or (Test-JsonValue $property.Value $Needle)) { return $true }
    }
    return $false
  }
  if ($Value -is [Collections.IEnumerable]) {
    foreach ($item in $Value) { if (Test-JsonValue $item $Needle) { return $true } }
  }
  return $false
}

function Remove-CssComments([string]$Text) {
  $out = [Text.StringBuilder]::new()
  $inComment = $false
  for ($i = 0; $i -lt $Text.Length; $i += 1) {
    $next = if ($i + 1 -lt $Text.Length) { $Text[$i + 1] } else { [char]0 }
    if (-not $inComment -and $Text[$i] -eq '/' -and $next -eq '*') { $inComment = $true; $i += 1; continue }
    if ($inComment) {
      if ($Text[$i] -eq '*' -and $next -eq '/') { $inComment = $false; $i += 1 }
      elseif ($Text[$i] -eq "`r" -or $Text[$i] -eq "`n") { [void]$out.Append($Text[$i]) }
      continue
    }
    [void]$out.Append($Text[$i])
  }
  return $out.ToString()
}

function Assert-SourceMarker([string]$Path, [string]$Text, [string]$Marker, [string]$RowId) {
  $extension = [IO.Path]::GetExtension($Path).ToLowerInvariant()
  if ($extension -in @('.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.mts', '.cts')) { Assert-JavaScriptMarker $Text $Marker $RowId; return }
  if ($extension -in @('.html', '.htm')) { Assert-HtmlMarker $Text $Marker $RowId; return }
  if ($extension -eq '.json') {
    try { $json = ConvertFrom-Json -InputObject $Text } catch { throw "Missing exact browser-download marker for $RowId`: $Marker" }
    $needle = $Marker.Trim('"')
    if (Test-JsonValue $json $needle) { return }
    throw "Missing exact browser-download marker for $RowId`: $Marker"
  }
  $searchText = if ($extension -eq '.md') { Remove-HtmlComments $Text } elseif ($extension -eq '.css') { Remove-CssComments $Text } else { $Text }
  $index = $searchText.IndexOf($Marker, [StringComparison]::Ordinal)
  if ($index -lt 0) { throw "Missing exact browser-download marker for $RowId`: $Marker" }
}

function Assert-Inventory([string]$SourceRoot, [bool]$SkipSyntax = $false, [string]$InventoryFile = $inventoryPath) {
  $rows = @(Read-Inventory $InventoryFile)
  $seen = [Collections.Generic.HashSet[string]]::new()
  foreach ($row in $rows) {
    if ([string]::IsNullOrWhiteSpace($row.id) -or [string]::IsNullOrWhiteSpace($row.source) -or [string]::IsNullOrWhiteSpace($row.marker)) {
      throw 'Every browser-download row needs an id, source, and exact marker.'
    }
    if (-not $seen.Add($row.id)) { throw "Duplicate browser-download inventory id: $($row.id)" }
    $path = Join-Path $SourceRoot ($row.source -replace '/', '\')
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Missing source for $($row.id): $($row.source)" }
    if (-not $SkipSyntax -and [IO.Path]::GetExtension($path).ToLowerInvariant() -in @('.js', '.mjs', '.cjs')) {
      & node --check $path
      if ($LASTEXITCODE -ne 0) { throw "JavaScript syntax check failed for $($row.id): $($row.source); expected marker $($row.marker)" }
    }
    Assert-SourceMarker $path ([IO.File]::ReadAllText($path)) $row.marker $row.id
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

function Comment-SourceLine([string]$Path, [string]$Text, [int]$Index) {
  $lineStart = $Text.LastIndexOf("`n", [Math]::Max(0, $Index - 1)) + 1
  $lineEnd = $Text.IndexOf("`n", $Index)
  if ($lineEnd -lt 0) { $lineEnd = $Text.Length }
  $line = $Text.Substring($lineStart, $lineEnd - $lineStart)
  $extension = [IO.Path]::GetExtension($Path).ToLowerInvariant()
  if ($extension -in @('.md', '.html', '.htm')) { $commented = "<!-- $line -->" }
  elseif ($extension -eq '.css') { $commented = "/* $line */" }
  else { $commented = "// $line" }
  return $Text.Remove($lineStart, $lineEnd - $lineStart).Insert($lineStart, $commented)
}

function Find-JavaScriptBraceEnd([string]$Text, [int]$Start) {
  $state = 'code'
  $escaped = $false
  $depth = 0
  $found = $false
  for ($i = $Start; $i -lt $Text.Length; $i += 1) {
    $ch = $Text[$i]
    $next = if ($i + 1 -lt $Text.Length) { $Text[$i + 1] } else { [char]0 }
    if ($state -eq 'line') {
      if ($ch -eq "`r" -or $ch -eq "`n") { $state = 'code' }
      continue
    }
    if ($state -eq 'block') {
      if ($ch -eq '*' -and $next -eq '/') { $state = 'code'; $i += 1 }
      continue
    }
    if ($state -eq 'single' -or $state -eq 'double' -or $state -eq 'template') {
      if ($escaped) { $escaped = $false; continue }
      if ($ch -eq '\') { $escaped = $true; continue }
      if (($state -eq 'single' -and $ch -eq "'") -or ($state -eq 'double' -and $ch -eq '"') -or ($state -eq 'template' -and $ch -eq '`')) { $state = 'code' }
      continue
    }
    if ($ch -eq '/' -and $next -eq '/') { $state = 'line'; $i += 1; continue }
    if ($ch -eq '/' -and $next -eq '*') { $state = 'block'; $i += 1; continue }
    if ($ch -eq "'") { $state = 'single'; continue }
    if ($ch -eq '"') { $state = 'double'; continue }
    if ($ch -eq '`') { $state = 'template'; continue }
    if ($ch -eq '{') { $depth += 1; $found = $true; continue }
    if ($ch -eq '}' -and $found) {
      $depth -= 1
      if ($depth -eq 0) { return $i + 1 }
    }
  }
  return -1
}

function Comment-JavaScriptRegion([string]$Text, [int]$Index) {
  $lineStart = $Text.LastIndexOf("`n", [Math]::Max(0, $Index - 1)) + 1
  $lineEnd = $Text.IndexOf("`n", $Index)
  if ($lineEnd -lt 0) { $lineEnd = $Text.Length }
  $regionEnd = Find-JavaScriptBraceEnd $Text $Index
  if ($regionEnd -lt 0 -or $regionEnd -lt $lineEnd) { $regionEnd = $lineEnd }
  if ($regionEnd -lt $Text.Length -and $Text[$regionEnd] -eq "`r") { $regionEnd += 1; if ($regionEnd -lt $Text.Length -and $Text[$regionEnd] -eq "`n") { $regionEnd += 1 } }
  elseif ($regionEnd -lt $Text.Length -and $Text[$regionEnd] -eq "`n") { $regionEnd += 1 }
  $block = $Text.Substring($lineStart, $regionEnd - $lineStart)
  $newline = if ($block.Contains("`r`n")) { "`r`n" } else { "`n" }
  $hasTrailingNewline = $block.EndsWith($newline, [StringComparison]::Ordinal)
  $content = if ($hasTrailingNewline) { $block.Substring(0, $block.Length - $newline.Length) } else { $block }
  $parts = $content.Split(@($newline), [StringSplitOptions]::None)
  $commented = (($parts | ForEach-Object { "// $_" }) -join $newline)
  if ($hasTrailingNewline) { $commented += $newline }
  return $Text.Remove($lineStart, $regionEnd - $lineStart).Insert($lineStart, $commented)
}

function Removed-JavaScriptMarker([string]$Marker) {
  if ($Marker -match '^export\s+function\s+[A-Za-z_$][A-Za-z0-9_$]*') {
    return ($Marker -replace '^export\s+function\s+[A-Za-z_$][A-Za-z0-9_$]*', 'export function __inventoryRemoved__')
  }
  if ($Marker -match '^async\s+function\s+[A-Za-z_$][A-Za-z0-9_$]*') {
    return ($Marker -replace '^async\s+function\s+[A-Za-z_$][A-Za-z0-9_$]*', 'async function __inventoryRemoved__')
  }
  if ($Marker -match '^function\s+[A-Za-z_$][A-Za-z0-9_$]*') {
    return ($Marker -replace '^function\s+[A-Za-z_$][A-Za-z0-9_$]*', 'function __inventoryRemoved__')
  }
  if ($Marker -match '^export\s+type\s+[A-Za-z_$][A-Za-z0-9_$]*') {
    return ($Marker -replace '^export\s+type\s+[A-Za-z_$][A-Za-z0-9_$]*', 'export type __inventoryRemoved__')
  }
  if ($Marker -match '^export\s+interface\s+[A-Za-z_$][A-Za-z0-9_$]*') {
    return ($Marker -replace '^export\s+interface\s+[A-Za-z_$][A-Za-z0-9_$]*', 'export interface __inventoryRemoved__')
  }
  if ($Marker.Contains('data-testid=') -or $Marker.Contains('data-extension-origin=')) {
    return 'data-inventory-removed'
  }
  if ($Marker.Contains('addEventListener(')) {
    return "__inventoryRemoved__('removed'"
  }
  if ((MarkerKind $Marker) -eq 'call' -and $Marker.EndsWith('({')) {
    return '__inventoryRemoved__({'
  }
  if ((MarkerKind $Marker) -eq 'call' -and $Marker.EndsWith('(')) {
    return '__inventoryRemoved__('
  }
  return '__inventoryRemoved__'
}

function Renamed-JavaScriptMarker([string]$Marker) {
  if ($Marker -match '^export\s+function\s+[A-Za-z_$][A-Za-z0-9_$]*') {
    return ($Marker -replace '^(export\s+function\s+)[A-Za-z_$][A-Za-z0-9_$]*', '${1}__inventoryRenamed__')
  }
  if ($Marker -match '^async\s+function\s+[A-Za-z_$][A-Za-z0-9_$]*') {
    return ($Marker -replace '^(async\s+function\s+)[A-Za-z_$][A-Za-z0-9_$]*', '${1}__inventoryRenamed__')
  }
  if ($Marker -match '^function\s+[A-Za-z_$][A-Za-z0-9_$]*') {
    return ($Marker -replace '^(function\s+)[A-Za-z_$][A-Za-z0-9_$]*', '${1}__inventoryRenamed__')
  }
  if ($Marker -match '^export\s+type\s+[A-Za-z_$][A-Za-z0-9_$]*') {
    return ($Marker -replace '^(export\s+type\s+)[A-Za-z_$][A-Za-z0-9_$]*', '${1}__inventoryRenamed__')
  }
  if ($Marker -match '^export\s+interface\s+[A-Za-z_$][A-Za-z0-9_$]*') {
    return ($Marker -replace '^(export\s+interface\s+)[A-Za-z_$][A-Za-z0-9_$]*', '${1}__inventoryRenamed__')
  }
  if ($Marker -match '^(const|let|var)\s+\[') {
    return ($Marker -replace '^(const|let|var)\s+\[[A-Za-z_$][A-Za-z0-9_$]*', '$1 [__inventoryRenamed__')
  }
  if ($Marker -match '^(const|let|var)\s+[A-Za-z_$][A-Za-z0-9_$]*') {
    return ($Marker -replace '^((?:const|let|var)\s+)[A-Za-z_$][A-Za-z0-9_$]*', '${1}__inventoryRenamed__')
  }
  return Alter-Marker $Marker
}

function Remove-JavaScriptMarker([string]$Path, [string]$Text, [string]$Marker, [int]$Index) {
  $extension = [IO.Path]::GetExtension($Path).ToLowerInvariant()
  if ($extension -in @('.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.mts', '.cts')) {
    $replacement = Removed-JavaScriptMarker $Marker
    return $Text.Remove($Index, $Marker.Length).Insert($Index, $replacement)
  }
  return $Text.Remove($Index, $Marker.Length)
}

function Assert-MutationSyntax([string]$Path, [string]$RowId, [string]$Mutation) {
  $extension = [IO.Path]::GetExtension($Path).ToLowerInvariant()
  if ($extension -notin @('.js', '.mjs', '.cjs')) { return }
  & node --check $Path
  if ($LASTEXITCODE -ne 0) { throw "JavaScript syntax failed for the $Mutation mutation on $RowId`: $Path" }
}

function Assert-InventoryRowNegative([string]$SourceRoot, [string]$InventoryFile, [object[]]$Rows) {
  if ($Rows.Count -lt 1) { throw 'The browser-download row regression needs at least one inventory row.' }
  $original = [IO.File]::ReadAllText($InventoryFile)
  $headerEnd = $original.IndexOf("`n", [StringComparison]::Ordinal)
  if ($headerEnd -lt 0) { throw 'The browser-download inventory has no header line.' }
  $rowStart = $headerEnd + 1
  $rowEnd = $original.IndexOf("`n", $rowStart, [StringComparison]::Ordinal)
  if ($rowEnd -lt 0) { $rowEnd = $original.Length } else { $rowEnd += 1 }
  if ($rowEnd -le $rowStart) { throw 'The browser-download inventory has no removable row line.' }
  $changed = $original.Remove($rowStart, $rowEnd - $rowStart)
  $missingId = [string]$Rows[0].id
  $expected = "Missing browser-download inventory row: $missingId"
  [IO.File]::WriteAllText($InventoryFile, $changed)
  try {
    $red = $false
    try { Assert-Inventory $SourceRoot $false $InventoryFile } catch {
      if ($_.Exception.Message -cne $expected) { throw "Inventory-row negative regression produced the wrong diagnostic: $($_.Exception.Message)" }
      $red = $true
    }
    if (-not $red) { throw 'Inventory-row negative regression stayed green after removing a hand-written row.' }
  } finally {
    [IO.File]::WriteAllText($InventoryFile, $original)
  }
  Assert-Inventory $SourceRoot $false $InventoryFile
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
  $inventoryProbePath = Join-Path $tempRoot 'scripts\browser-download-surface-inventory.tsv'
  New-Item -ItemType Directory -Path (Split-Path $inventoryProbePath -Parent) -Force | Out-Null
  Copy-Item -LiteralPath $inventoryPath -Destination $inventoryProbePath -Force
  Assert-InventoryRowNegative $tempRoot $inventoryProbePath $rows
  foreach ($row in $rows) {
    $sourcePath = Join-Path $Root ($row.source -replace '/', '\')
    $relative = $row.source -replace '/', '\'
    $probePath = Join-Path $tempRoot $relative
    New-Item -ItemType Directory -Path (Split-Path $probePath -Parent) -Force | Out-Null
    Copy-Item -LiteralPath $sourcePath -Destination $probePath -Force
    $original = [IO.File]::ReadAllText($probePath)
    $probeIndex = $original.IndexOf($row.marker, [StringComparison]::Ordinal)
    if ($probeIndex -lt 0) { throw "The negative-regression marker was not present for $($row.id)." }
    $mutations = [Collections.Generic.List[string]]::new()
    foreach ($mutation in @('remove', 'comment', 'rename')) { [void]$mutations.Add($mutation) }
    if ($row.source -match '\.(js|jsx|ts|tsx|mjs|cjs|mts|cts)$' -and ($row.marker.Contains('data-testid=') -or $row.id -eq 'dialog-focus-test')) {
      [void]$mutations.Add('inert-string')
      [void]$mutations.Add('detached-node')
    }
    foreach ($mutation in $mutations) {
      if ($mutation -eq 'remove') {
        $changed = Remove-JavaScriptMarker $probePath $original $row.marker $probeIndex
      } elseif ($mutation -eq 'comment') {
        $extension = [IO.Path]::GetExtension($probePath).ToLowerInvariant()
        $changed = if ($extension -in @('.js', '.mjs', '.cjs')) {
          Comment-JavaScriptRegion $original $probeIndex
        } else {
          Comment-SourceLine $probePath $original $probeIndex
        }
      } else {
        $extension = [IO.Path]::GetExtension($probePath).ToLowerInvariant()
        $changedMarker = if ($extension -in @('.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.mts', '.cts')) {
          Renamed-JavaScriptMarker $row.marker
        } else {
          Alter-Marker $row.marker
        }
        $changed = $original.Remove($probeIndex, $row.marker.Length).Insert($probeIndex, $changedMarker)
      }
      if ($mutation -eq 'inert-string') {
        $changed = (Remove-JavaScriptMarker $probePath $original $row.marker $probeIndex) + "`r`nconst __inventoryInert = $($row.marker | ConvertTo-Json -Compress);`r`n"
      } elseif ($mutation -eq 'detached-node') {
        $detached = if ($row.id -eq 'dialog-focus-test') { "const __inventoryDetached = () => focusAvailable(root);" } else { "const __inventoryDetached = <div $($row.marker) />;" }
        $changed = (Remove-JavaScriptMarker $probePath $original $row.marker $probeIndex) + "`r`n$detached`r`n"
      }
      if ($changed -ceq $original) { throw "The $mutation negative probe for $($row.id) was a no-op." }
      [IO.File]::WriteAllText($probePath, $changed)
      Assert-MutationSyntax $probePath $row.id $mutation
      $red = $false
      try { Assert-Inventory $tempRoot $false } catch {
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

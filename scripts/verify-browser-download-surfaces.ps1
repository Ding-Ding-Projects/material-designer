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

function Assert-Inventory([string]$SourceRoot, [bool]$SkipSyntax = $false) {
  $rows = @(Read-Inventory)
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
    $mutations = [Collections.Generic.List[string]]::new()
    foreach ($mutation in @('remove', 'comment', 'rename')) { [void]$mutations.Add($mutation) }
    if ($row.source -match '\.(js|jsx|ts|tsx|mjs|cjs|mts|cts)$' -and $row.marker.Contains('data-testid=')) {
      [void]$mutations.Add('inert-string')
      [void]$mutations.Add('detached-node')
    }
    foreach ($mutation in $mutations) {
      if ($mutation -eq 'remove') {
        $changed = $original.Remove($probeIndex, $row.marker.Length)
      } elseif ($mutation -eq 'comment') {
        $changed = Comment-SourceLine $probePath $original $probeIndex
      } else {
        $changedMarker = Alter-Marker $row.marker
        $changed = $original.Remove($probeIndex, $row.marker.Length).Insert($probeIndex, $changedMarker)
      }
      if ($mutation -eq 'inert-string') {
        $changed = $original.Remove($probeIndex, $row.marker.Length) + "`r`nconst __inventoryInert = '$($row.marker)';`r`n"
      } elseif ($mutation -eq 'detached-node') {
        $changed = $original.Remove($probeIndex, $row.marker.Length) + "`r`nconst __inventoryDetached = <div $($row.marker) />;`r`n"
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

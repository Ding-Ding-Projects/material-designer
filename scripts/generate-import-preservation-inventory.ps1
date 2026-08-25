param(
    [string]$OutputPath = "scripts/import-preservation-inventory.tsv",
    [string]$NoticeHeading = "### 2026-08-25 - Preserve project changes across the v0.20.3 baseline"
)

$ErrorActionPreference = "Stop"
$repositoryRoot = (git rev-parse --show-toplevel).Trim()
if (-not $repositoryRoot) {
    throw "Could not resolve the repository root."
}
Set-Location $repositoryRoot

$preserved = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
$insideComment = $false
$insideNotice = $false
foreach ($line in [System.IO.File]::ReadLines((Join-Path $repositoryRoot "MODIFICATIONS.md"))) {
    if ($line.Contains("<!--")) { $insideComment = $true }
    if (-not $insideComment -and $line -eq $NoticeHeading) {
        $insideNotice = $true
        continue
    }
    if ($insideNotice -and $line.StartsWith("### ")) {
        break
    }
    if ($insideNotice -and -not $insideComment -and $line -match '^- `([^`]+)`') {
        [void]$preserved.Add($Matches[1])
    }
    if ($line.Contains("-->")) { $insideComment = $false }
}
if ($preserved.Count -eq 0) {
    throw "The preservation notice '$NoticeHeading' contains no changed paths."
}

$upstream = @{}
foreach ($line in [System.IO.File]::ReadLines((Join-Path $repositoryRoot "scripts/upstream-manifest.tsv"))) {
    if ($line.StartsWith("#")) { continue }
    $fields = $line.Split("`t", 3)
    $upstream[$fields[2]] = [pscustomobject]@{ Mode = $fields[0]; Oid = $fields[1] }
}

$tracked = @{}
foreach ($line in git ls-files -s -- design/) {
    if ($line -match '^([0-7]+) ([0-9a-f]+) [0-9]+\tdesign/(.+)$') {
        $tracked[$Matches[3]] = [pscustomobject]@{ Mode = $Matches[1]; Oid = $Matches[2] }
    }
}

$rows = [System.Collections.Generic.List[string]]::new()
foreach ($path in ($preserved | Sort-Object)) {
    if (-not $tracked.ContainsKey($path)) {
        throw "Preserved path is absent from the local index: design/$path"
    }
    $upstreamMode = "-"
    $upstreamOid = "-"
    if ($upstream.ContainsKey($path)) {
        $upstreamMode = $upstream[$path].Mode
        $upstreamOid = $upstream[$path].Oid
        if ($tracked[$path].Mode -eq $upstreamMode -and $tracked[$path].Oid -eq $upstreamOid) {
            throw "Preserved path no longer differs from upstream: design/$path"
        }
        $kind = "oid-different"
    }
    else {
        $kind = "extra"
    }

    $owner = (git log -1 --format=%H -- "design/$path").Trim()
    if ($LASTEXITCODE -ne 0 -or -not $owner) {
        throw "Could not resolve the owning commit for design/$path."
    }
    $rows.Add(($kind, $path, $tracked[$path].Mode, $tracked[$path].Oid, $upstreamMode, $upstreamOid, $owner -join "`t"))
}

$header = @(
    "# Material Designer imported-tree preservation inventory"
    "# Generated from the committed index, pinned upstream manifest, MODIFICATIONS.md, and Git history."
    "# kind`tpath`tlocal-mode`tlocal-oid`tupstream-mode`tupstream-oid`towner-commit"
)
$content = (($header + $rows) -join "`n") + "`n"
$resolvedOutput = Join-Path $repositoryRoot $OutputPath
[System.IO.File]::WriteAllText($resolvedOutput, $content, [System.Text.UTF8Encoding]::new($false))
Write-Output "generate-import-preservation-inventory: rows=$($rows.Count) output=$OutputPath"

param(
    [datetime]$Since = [datetime]"2026-08-25T00:03:38-04:00",
    [int]$ExpectedCount = 1200,
    [string]$OutputPath = "scripts/raw-byte-materialization-evidence.tsv"
)

$ErrorActionPreference = "Stop"
$repositoryRoot = (git rev-parse --show-toplevel).Trim()
Set-Location $repositoryRoot

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

$candidates = @(
    Get-ChildItem (Join-Path $repositoryRoot "design") -Recurse -File |
        Where-Object { $_.LastWriteTime -ge $Since } |
        ForEach-Object { $_.FullName.Substring((Join-Path $repositoryRoot "design").Length + 1).Replace('\', '/') } |
        Sort-Object
)
if ($candidates.Count -ne $ExpectedCount) {
    throw "Expected $ExpectedCount materialized paths since $($Since.ToString('o')), found $($candidates.Count)."
}

$rows = [System.Collections.Generic.List[string]]::new()
foreach ($path in $candidates) {
    if (-not $upstream.ContainsKey($path) -or -not $tracked.ContainsKey($path)) {
        throw "Materialized evidence path is absent from the upstream or local index: $path"
    }
    if ($tracked[$path].Mode -ne $upstream[$path].Mode -or $tracked[$path].Oid -ne $upstream[$path].Oid) {
        throw "Materialized evidence path does not have index equality: $path"
    }
    $diskOid = (git hash-object --no-filters -- "design/$path").Trim()
    if ($LASTEXITCODE -ne 0 -or $diskOid -ne $upstream[$path].Oid) {
        throw "Materialized evidence path does not have pinned raw bytes: $path"
    }
    $rows.Add(("raw-byte-different-index-equal", $path, $upstream[$path].Mode, $upstream[$path].Oid, $diskOid -join "`t"))
}

$header = @(
    "# Material Designer raw-byte materialization evidence",
    "# Preflight state was raw-byte-different with local index mode/blob equal to pinned upstream.",
    "# Post state was captured after git cat-file materialization and raw hash validation.",
    "# before-status`tpath`tmode`tupstream-and-index-oid`tpost-disk-oid"
)
$content = (($header + $rows) -join "`n") + "`n"
[System.IO.File]::WriteAllText((Join-Path $repositoryRoot $OutputPath), $content, [System.Text.UTF8Encoding]::new($false))
Write-Output "generate-raw-byte-materialization-evidence: rows=$($rows.Count) output=$OutputPath"

[CmdletBinding()]
param(
    [string]$Inventory = "docs/porting/c0-source-preservation.json",
    [switch]$SkipHistoricalSha256
)

$ErrorActionPreference = "Stop"
$repoRoot = (git rev-parse --show-toplevel).Trim()
if (-not $repoRoot) { Write-Error "Could not resolve the repository root."; exit 1 }
Set-Location -LiteralPath $repoRoot
$failures = New-Object 'System.Collections.Generic.List[string]'

function Add-Failure([string]$Message) { [void]$script:failures.Add($Message) }
function Read-Json([string]$Path) {
    try { return [IO.File]::ReadAllText($Path, [Text.UTF8Encoding]::new($false)) | ConvertFrom-Json }
    catch { Add-Failure ("Inventory JSON could not be read: " + $_.Exception.Message); return $null }
}
function Git-Text([string[]]$Arguments) {
    $value = & git @Arguments 2>$null
    if ($LASTEXITCODE -ne 0) { return $null }
    return ([string]::Join("`n", @($value))).Trim()
}
function Git-Blob-Id([string]$Commit, [string]$Path) {
    $spec = $Commit + ":" + $Path
    return Git-Text @("rev-parse", "--verify", $spec)
}
function Git-Blob-Sha256([string]$Commit, [string]$Path) {
    $psi = New-Object Diagnostics.ProcessStartInfo
    $psi.FileName = "git"
    $psi.Arguments = ('cat-file blob "' + $Commit + ':' + $Path + '"')
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.CreateNoWindow = $true
    $process = New-Object Diagnostics.Process
    $process.StartInfo = $psi
    [void]$process.Start()
    $stream = New-Object IO.MemoryStream
    $process.StandardOutput.BaseStream.CopyTo($stream)
    $process.WaitForExit()
    if ($process.ExitCode -ne 0) { Add-Failure ("Could not read Git blob: " + $Commit + ":" + $Path); return $null }
    $digest = [Security.Cryptography.SHA256]::Create().ComputeHash($stream.ToArray())
    return ([BitConverter]::ToString($digest) -replace "-", "").ToLowerInvariant()
}
function File-Sha256([string]$Path) {
    $digest = [Security.Cryptography.SHA256]::Create().ComputeHash([IO.File]::ReadAllBytes($Path))
    return ([BitConverter]::ToString($digest) -replace "-", "").ToLowerInvariant()
}
function Require-Hash([object]$Row, [string]$Field, [string]$Context) {
    $property = $Row.PSObject.Properties[$Field]
    $length = if ($Field -match 'BlobId$') { 40 } else { 64 }
    if ($null -eq $property -or [string]$property.Value -notmatch ('^[0-9a-f]{' + $length + '}$')) {
        Add-Failure ("$Context has invalid $Field.")
    }
}
function Require-Text([object]$Row, [string]$Field, [string]$Context) {
    $property = $Row.PSObject.Properties[$Field]
    if ($null -eq $property -or [string]::IsNullOrWhiteSpace([string]$property.Value)) {
        Add-Failure ("$Context is missing $Field.")
    }
}

if (-not (Test-Path -LiteralPath $Inventory -PathType Leaf)) {
    Write-Error ("Inventory does not exist: " + $Inventory)
    exit 1
}
$data = Read-Json $Inventory
if ($null -eq $data) { exit 1 }

$expectedBase = "dfb5c168c5f086671f8cd6e66698f7886805f1e9"
$expectedCurrent = "901890c3d7f97e8f145f0ef7c6138a3859e130c1"
$expectedStart = "dd43dda7abece44d2557359a147daef294ab30e0"
$expectedEnd = $expectedBase
if ($data.schemaVersion -ne 1) { Add-Failure "schemaVersion must be exactly 1." }
if ([string]$data.baseCommit -cne $expectedBase) { Add-Failure "baseCommit is not the exact terminal baseline." }
if ([string]$data.sourceCurrentCommit -cne $expectedCurrent) { Add-Failure "sourceCurrentCommit is not the exact C0 commit." }
if ([string]$data.currentTree -cne "working-tree-at-verification") { Add-Failure "currentTree must be working-tree-at-verification." }
if ([string]$data.registration.documentationIndex -cne "docs/porting/README.md") { Add-Failure "registration.documentationIndex is detached or wrong." }
if ([string]$data.registration.verifier -cne "scripts/verify-c0-source-preservation.ps1") { Add-Failure "registration.verifier is detached or wrong." }
if ([string]$data.sourceRange.startCommit -cne $expectedStart) { Add-Failure "sourceRange.startCommit is wrong." }
if ([string]$data.sourceRange.endCommit -cne $expectedEnd) { Add-Failure "sourceRange.endCommit is wrong." }
if ([string]$data.sourceRange.pathCommand -cne "git diff --name-only dd43dda7^ dfb5c168") { Add-Failure "sourceRange.pathCommand is not the reproducible terminal command." }

foreach ($commit in @($expectedBase, $expectedCurrent, $expectedStart)) {
    if ((Git-Text @("cat-file", "-t", $commit)) -cne "commit") { Add-Failure ("Required commit object is unavailable: " + $commit) }
}

$derived = @(git diff --name-only --no-renames ($expectedStart + '^') $expectedEnd)
if ($LASTEXITCODE -ne 0) { Add-Failure "Could not derive the terminal path set from Git."; $derived = @() }
$statusLines = @(git diff --name-status --find-renames ($expectedStart + '^') $expectedEnd)
if (@($statusLines | Where-Object { [string]$_ -match '^R' }).Count -gt 0) { Add-Failure "The terminal range contains a rename; the bounded inventory requires exact paths." }
$rows = @($data.rows)
if ($rows.Count -ne 51) { Add-Failure ("Inventory must contain exactly 51 rows, found " + $rows.Count + ".") }
$rowPaths = @($rows | ForEach-Object { [string]$_.path })
$duplicates = @($rowPaths | Group-Object | Where-Object { $_.Count -ne 1 } | ForEach-Object { $_.Name })
if ($duplicates.Count -gt 0) { Add-Failure ("Inventory contains duplicate paths: " + ($duplicates -join ", ")) }
$missing = @($derived | Where-Object { $_ -notin $rowPaths })
$extra = @($rowPaths | Where-Object { $_ -notin $derived })
if ($missing.Count -gt 0) { Add-Failure ("Inventory is missing derived paths: " + ($missing -join ", ")) }
if ($extra.Count -gt 0) { Add-Failure ("Inventory contains paths outside the derived range: " + ($extra -join ", ")) }

$byteCount = @($rows | Where-Object { [string]$_.classification -ceq "byte-identical" }).Count
$semanticCount = @($rows | Where-Object { [string]$_.classification -ceq "semantic" }).Count
if ($byteCount -ne 30 -or $semanticCount -ne 21) { Add-Failure ("Classification counts must be 30 byte-identical and 21 semantic, found $byteCount and $semanticCount.") }
if ($data.counts.paths -ne 51 -or $data.counts.byteIdentical -ne 30 -or $data.counts.semantic -ne 21) { Add-Failure "The hand-written counts object does not match the required 51/30/21 shape." }

foreach ($row in $rows) {
    $path = [string]$row.path
    $context = "Row '$path'"
    if ($path -notmatch '^[A-Za-z0-9_.\-/]+$') { Add-Failure "$context contains an unsafe or detached path."; continue }
    if ([string]$row.classification -notin @("byte-identical", "semantic")) { Add-Failure "$context has an invalid classification." }
    foreach ($field in @("baseBlobId", "baseSha256", "currentCommitBlobId", "currentCommitSha256", "currentBlobId", "currentSha256")) { Require-Hash $row $field $context }
    $baseId = Git-Blob-Id $expectedBase $path
    $sourceCurrentId = Git-Blob-Id $expectedCurrent $path
    if ([string]$row.baseBlobId -cne $baseId) { Add-Failure "$context baseBlobId does not match the base commit." }
    if ([string]$row.currentCommitBlobId -cne $sourceCurrentId) { Add-Failure "$context currentCommitBlobId does not match sourceCurrentCommit." }
    if (-not $SkipHistoricalSha256) {
        $baseSha = Git-Blob-Sha256 $expectedBase $path
        $sourceCurrentSha = Git-Blob-Sha256 $expectedCurrent $path
        if ([string]$row.baseSha256 -cne $baseSha) { Add-Failure "$context baseSha256 does not match the base commit." }
        if ([string]$row.currentCommitSha256 -cne $sourceCurrentSha) { Add-Failure "$context currentCommitSha256 does not match sourceCurrentCommit." }
    }
    $livePath = Join-Path $repoRoot $path
    if (-not (Test-Path -LiteralPath $livePath -PathType Leaf)) { Add-Failure "$context is absent from the current tree."; continue }
    $liveId = (git hash-object -- $livePath).Trim()
    if ($LASTEXITCODE -ne 0 -or [string]$row.currentBlobId -cne $liveId) { Add-Failure "$context currentBlobId does not match the current tree." }
    $liveSha = File-Sha256 $livePath
    if ([string]$row.currentSha256 -cne $liveSha) { Add-Failure "$context currentSha256 does not match the current tree." }
    if ([string]$row.classification -ceq "byte-identical") {
        if ([string]$row.baseBlobId -cne [string]$row.currentCommitBlobId -or [string]$row.currentBlobId -cne [string]$row.baseBlobId) { Add-Failure "$context is not byte-identical across baseline, source current commit, and current tree." }
    } else {
        Require-Text $row "reason" $context
        Require-Text $row "contract" $context
        if ([string]$row.baseBlobId -ceq [string]$row.currentCommitBlobId) { Add-Failure "$context is semantic but its source blobs are identical." }
    }
}

$docs = Join-Path $repoRoot "docs/porting/README.md"
if (-not (Test-Path -LiteralPath $docs -PathType Leaf)) { Add-Failure "Porting documentation index is missing." }
else {
    $docsText = [IO.File]::ReadAllText($docs, [Text.UTF8Encoding]::new($false))
    foreach ($needle in @("c0-source-preservation.json", "verify-c0-source-preservation.ps1")) {
        if (-not $docsText.Contains($needle)) { Add-Failure ("Porting documentation is detached from " + $needle + ".") }
    }
}

$summary = [ordered]@{ inventory = $Inventory; baseCommit = $expectedBase; sourceCurrentCommit = $expectedCurrent; derivedPaths = $derived.Count; rows = $rows.Count; byteIdentical = $byteCount; semantic = $semanticCount; failures = @($failures) }
if ($failures.Count -gt 0) {
    $summary | ConvertTo-Json -Compress
    exit 1
}
$summary | ConvertTo-Json -Compress
Write-Output "PASS: C0 terminal source-preservation inventory is exact, bounded, and current-tree verified (51 paths: 30 byte-identical, 21 semantic)."
exit 0

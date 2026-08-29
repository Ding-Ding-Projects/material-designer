[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$repoRoot = (git rev-parse --show-toplevel).Trim()
Set-Location -LiteralPath $repoRoot
$inventoryPath = Join-Path $repoRoot "docs/porting/c0-source-preservation.json"
$verifierPath = Join-Path $repoRoot "scripts/verify-c0-source-preservation.ps1"
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ("c0-preservation-negative-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tempRoot | Out-Null

function Write-Fixture($Data, [string]$Name) {
    $path = Join-Path $tempRoot ($Name + ".json")
    [IO.File]::WriteAllText($path, ($Data | ConvertTo-Json -Depth 8), [Text.UTF8Encoding]::new($false))
    return $path
}
function Invoke-Verifier([string[]]$Arguments) {
    $process = Start-Process -FilePath powershell.exe -ArgumentList (@("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $verifierPath) + $Arguments) -WindowStyle Hidden -Wait -PassThru
    return $process.ExitCode
}
function Expect-Raw-Red([string]$Name, [byte[]]$Bytes) {
    $fixture = Join-Path $tempRoot ($Name + ".json")
    [IO.File]::WriteAllBytes($fixture, $Bytes)
    if ((Invoke-Verifier @("-Inventory", $fixture, "-SkipHistoricalSha256")) -eq 0) { throw "Negative raw mutation stayed green: $Name" }
    Write-Output ("PASS: $Name turned red.")
}
function Expect-Docs-Red([string]$Name, [scriptblock]$Mutation) {
    $data = Get-Content -Raw -Encoding UTF8 -LiteralPath $inventoryPath | ConvertFrom-Json
    $fixture = Write-Fixture $data $Name
    $docsPath = Join-Path $tempRoot ($Name + ".md")
    $docsText = [IO.File]::ReadAllText((Join-Path $repoRoot "docs/porting/README.md"), [Text.UTF8Encoding]::new($false))
    $mutatedText = & $Mutation $docsText
    [IO.File]::WriteAllText($docsPath, $mutatedText, [Text.UTF8Encoding]::new($false))
    if ((Invoke-Verifier @("-Inventory", $fixture, "-DocumentationIndex", $docsPath, "-SkipHistoricalSha256")) -eq 0) { throw "Negative documentation mutation stayed green: $Name" }
    Write-Output ("PASS: $Name turned red.")
}
function Expect-Red([string]$Name, [scriptblock]$Mutation) {
    $data = Get-Content -Raw -Encoding UTF8 -LiteralPath $inventoryPath | ConvertFrom-Json
    & $Mutation $data
    $fixture = Write-Fixture $data $Name
    $exitCode = Invoke-Verifier @("-Inventory", $fixture, "-SkipHistoricalSha256")
    if ($exitCode -eq 0) { throw "Negative mutation stayed green: $Name" }
    Write-Output ("PASS: $Name turned red.")
}

try {
    Expect-Red "missing-path" { param($d) $d.rows = @($d.rows | Select-Object -Skip 1) }
    Expect-Red "extra-path" { param($d) $d.rows += $d.rows[0].PSObject.Copy(); $d.rows[$d.rows.Count - 1].path = "design/extra-terminal-path.ts" }
    Expect-Red "duplicate-path" { param($d) $d.rows += $d.rows[0].PSObject.Copy() }
    Expect-Red "renamed-path" { param($d) $d.rows[0].path = "design/apps/web/src/App-renamed.ts" }
    Expect-Red "semantic-reason" { param($d) $row = @($d.rows | Where-Object classification -eq "semantic")[0]; $row.PSObject.Properties.Remove("reason") }
    Expect-Red "semantic-contract" { param($d) $row = @($d.rows | Where-Object classification -eq "semantic")[0]; $row.PSObject.Properties.Remove("contract") }
    Expect-Red "wrong-base-commit" { param($d) $d.baseCommit = "0000000000000000000000000000000000000000" }
    Expect-Red "wrong-source-current-commit" { param($d) $d.sourceCurrentCommit = "0000000000000000000000000000000000000000" }
    Expect-Red "wrong-range-start" { param($d) $d.sourceRange.startCommit = "0000000000000000000000000000000000000000" }
    Expect-Red "wrong-range-end" { param($d) $d.sourceRange.endCommit = "0000000000000000000000000000000000000000" }
    Expect-Red "wrong-range-command" { param($d) $d.sourceRange.pathCommand = "git diff --name-only" }
    Expect-Red "classification" { param($d) $d.rows[0].classification = "semantic-but-uncatalogued" }
    Expect-Red "wrong-baseline-blob" { param($d) $d.rows[0].baseBlobId = ("0" * 40) }
    Expect-Red "wrong-current-commit-blob" { param($d) $d.rows[0].currentCommitBlobId = ("0" * 40) }
    Expect-Red "wrong-current-tree-blob" { param($d) $d.rows[0].currentBlobId = ("0" * 40) }
    Expect-Red "wrong-current-tree-hash" { param($d) $d.rows[0].currentSha256 = ("0" * 64) }
    Expect-Red "semantic-current-tree-drift" { param($d) $row = @($d.rows | Where-Object classification -eq "semantic")[1]; $row.currentSha256 = ("0" * 64) }
    Expect-Red "oversized-inventory" { param($d) $d | Add-Member -NotePropertyName padding -NotePropertyValue ("x" * 600000) }
    Expect-Red "oversized-path" { param($d) $d.rows[0].path = ("a" * 513) }
    Expect-Red "oversized-reason" { param($d) $row = @($d.rows | Where-Object classification -eq "semantic")[0]; $row.reason = ("x" * 513) }
    Expect-Red "oversized-contract" { param($d) $row = @($d.rows | Where-Object classification -eq "semantic")[0]; $row.contract = ("x" * 257) }
    Expect-Red "detached-registration" { param($d) $d.registration.PSObject.Properties.Remove("verifier") }

    $validBytes = [IO.File]::ReadAllBytes($inventoryPath)
    Expect-Raw-Red "malformed-utf8" ([byte[]](0xc3, 0x28))
    Expect-Raw-Red "bom" ([byte[]]((@([byte]239, [byte]187, [byte]191) + $validBytes)))
    $crlfBytes = New-Object 'System.Collections.Generic.List[byte]'
    foreach ($byte in $validBytes) { if ($byte -eq 10) { [void]$crlfBytes.Add(13) }; [void]$crlfBytes.Add($byte) }
    Expect-Raw-Red "crlf" ([byte[]]$crlfBytes.ToArray())
    Expect-Docs-Red "comment-only-inventory-registration" { param($t) $t.Replace("[c0-source-preservation.json](c0-source-preservation.json)", "<!-- [c0-source-preservation.json](c0-source-preservation.json) -->") }
    Expect-Docs-Red "detached-verifier-registration" { param($t) $t.Replace("[verify-c0-source-preservation.ps1](../../scripts/verify-c0-source-preservation.ps1)", "[verify-c0-source-preservation.ps1](other-verifier.ps1)") }
    Expect-Docs-Red "duplicate-inventory-registration" { param($t) $t + "| [c0-source-preservation.json](c0-source-preservation.json) | duplicate |`n" }
    Expect-Docs-Red "renamed-verifier-registration" { param($t) $t.Replace("[verify-c0-source-preservation.ps1](../../scripts/verify-c0-source-preservation.ps1)", "[renamed-verifier.ps1](../../scripts/renamed-verifier.ps1)") }

    if ((Invoke-Verifier @("-SkipHistoricalSha256")) -ne 0) { throw "Restored checked-in inventory did not return green." }
    Write-Output "PASS: 29 deliberate C0 source-preservation boundary mutations turned red, then the restored inventory returned green."
    exit 0
}
finally {
    if (Test-Path -LiteralPath $tempRoot) { Remove-Item -LiteralPath $tempRoot -Recurse -Force }
}

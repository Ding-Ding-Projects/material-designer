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
    $json = ($Data | ConvertTo-Json -Depth 8).Replace("`r`n", "`n").Replace("`r", "`n")
    [IO.File]::WriteAllText($path, ($json + [char]10), [Text.UTF8Encoding]::new($false))
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
function Expect-Docs-Green([string]$Name, [scriptblock]$Mutation) {
    $data = Get-Content -Raw -Encoding UTF8 -LiteralPath $inventoryPath | ConvertFrom-Json
    $fixture = Write-Fixture $data $Name
    $docsPath = Join-Path $tempRoot ($Name + ".md")
    $docsText = [IO.File]::ReadAllText((Join-Path $repoRoot "docs/porting/README.md"), [Text.UTF8Encoding]::new($false))
    $mutatedText = & $Mutation $docsText
    [IO.File]::WriteAllText($docsPath, $mutatedText, [Text.UTF8Encoding]::new($false))
    if ((Invoke-Verifier @("-Inventory", $fixture, "-DocumentationIndex", $docsPath, "-SkipHistoricalSha256")) -ne 0) { throw "Documentation control fixture did not stay green: $Name" }
    Write-Output ("PASS: $Name stayed green.")
}
function Get-RegistrationRow() {
    return "| [c0-source-preservation.json](c0-source-preservation.json) | [verify-c0-source-preservation.ps1](../../scripts/verify-c0-source-preservation.ps1) |"
}
function Remove-RegistrationRow([string]$Text) {
    $lines = @($Text -split "`n" | Where-Object { $_ -notmatch '^\| \[c0-source-preservation\.md\]' })
    return ($lines -join "`n")
}
function Replace-With-FencedRow([string]$Text, [string]$Fence) {
    return (Remove-RegistrationRow $Text) + "`n" + $Fence + "markdown`n" + (Get-RegistrationRow) + "`n" + $Fence + "`n"
}
function Replace-With-IndentedRow([string]$Text) {
    return (Remove-RegistrationRow $Text) + "`n    " + (Get-RegistrationRow) + "`n"
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
    $solitaryCrBytes = New-Object 'System.Collections.Generic.List[byte]'
    $replacedLf = $false
    foreach ($byte in $validBytes) { if (-not $replacedLf -and $byte -eq 10) { [void]$solitaryCrBytes.Add(13); $replacedLf = $true } else { [void]$solitaryCrBytes.Add($byte) } }
    Expect-Raw-Red "solitary-cr" ([byte[]]$solitaryCrBytes.ToArray())
    Expect-Raw-Red "missing-final-lf" ([byte[]]$validBytes[0..($validBytes.Length - 2)])
    $doubleLfBytes = New-Object 'System.Collections.Generic.List[byte]'
    foreach ($byte in $validBytes) { [void]$doubleLfBytes.Add($byte) }
    [void]$doubleLfBytes.Add(10)
    Expect-Raw-Red "double-final-lf" ([byte[]]$doubleLfBytes.ToArray())
    $backtickFence = ([string][char]96) * 3
    Expect-Docs-Red "fenced-backtick-table-row" { param($t) Replace-With-FencedRow $t $backtickFence }
    Expect-Docs-Red "fenced-tilde-table-row" { param($t) Replace-With-FencedRow $t "~~~" }
    Expect-Docs-Red "inline-code-link-in-table" { param($t) $base = Remove-RegistrationRow $t; $tick = [string][char]96; $base + "`n| " + $tick + "[c0-source-preservation.json](c0-source-preservation.json)" + $tick + " | " + $tick + "[verify-c0-source-preservation.ps1](../../scripts/verify-c0-source-preservation.ps1)" + $tick + " |`n" }
    Expect-Docs-Red "mixed-comment-code" { param($t) $base = Remove-RegistrationRow $t; $base + "`n<!--`n" + $backtickFence + "markdown`n" + (Get-RegistrationRow) + "`n" + $backtickFence + "`n-->`n" }
    Expect-Docs-Red "unclosed-fence" { param($t) $base = Remove-RegistrationRow $t; $base + "`n" + $backtickFence + "markdown`n" + (Get-RegistrationRow) + "`n" }
    Expect-Docs-Red "indented-code-table-row" { param($t) Replace-With-IndentedRow $t }
    Expect-Docs-Green "active-link-beside-unrelated-code" { param($t) $link = "[c0-source-preservation.json](c0-source-preservation.json)"; $tick = [string][char]96; $t.Replace($link, $link + " " + $tick + "unrelated [fake](fake)" + $tick) }
    Expect-Docs-Red "comment-only-inventory-registration" { param($t) $t.Replace("[c0-source-preservation.json](c0-source-preservation.json)", "<!-- [c0-source-preservation.json](c0-source-preservation.json) -->") }
    Expect-Docs-Red "detached-verifier-registration" { param($t) $t.Replace("[verify-c0-source-preservation.ps1](../../scripts/verify-c0-source-preservation.ps1)", "[verify-c0-source-preservation.ps1](other-verifier.ps1)") }
    Expect-Docs-Red "duplicate-inventory-registration" { param($t) $t + "| [c0-source-preservation.json](c0-source-preservation.json) | duplicate |`n" }
    Expect-Docs-Red "renamed-verifier-registration" { param($t) $t.Replace("[verify-c0-source-preservation.ps1](../../scripts/verify-c0-source-preservation.ps1)", "[renamed-verifier.ps1](../../scripts/renamed-verifier.ps1)") }

    if ((Invoke-Verifier @("-SkipHistoricalSha256")) -ne 0) { throw "Restored checked-in inventory did not return green." }
    Write-Output "PASS: 38 deliberate C0 source-preservation boundary mutations turned red, the legitimate active-link control stayed green, and the restored inventory returned green."
    exit 0
}
finally {
    if (Test-Path -LiteralPath $tempRoot) { Remove-Item -LiteralPath $tempRoot -Recurse -Force }
}

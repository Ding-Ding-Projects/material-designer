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
    Expect-Red "wrong-range-command" { param($d) $d.sourceRange.pathCommand = "git diff --name-only" }
    Expect-Red "wrong-baseline-blob" { param($d) $d.rows[0].baseBlobId = ("0" * 40) }
    Expect-Red "wrong-current-commit-blob" { param($d) $d.rows[0].currentCommitBlobId = ("0" * 40) }
    Expect-Red "wrong-current-tree-blob" { param($d) $d.rows[0].currentBlobId = ("0" * 40) }
    Expect-Red "wrong-current-tree-hash" { param($d) $d.rows[0].currentSha256 = ("0" * 64) }
    Expect-Red "detached-registration" { param($d) $d.registration.PSObject.Properties.Remove("verifier") }

    if ((Invoke-Verifier @("-SkipHistoricalSha256")) -ne 0) { throw "Restored checked-in inventory did not return green." }
    Write-Output "PASS: 15 deliberate C0 source-preservation boundary mutations turned red, then the restored inventory returned green."
    exit 0
}
finally {
    if (Test-Path -LiteralPath $tempRoot) { Remove-Item -LiteralPath $tempRoot -Recurse -Force }
}

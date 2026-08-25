[CmdletBinding()]
param(
    [string]$Inventory = ".codex/verification/ui-drive/inventory.json",
    [string]$Validator = "scripts/verify-ui-drive-evidence.ps1"
)

$ErrorActionPreference = "Stop"
$root = (Get-Location).Path
$inventoryPath = (Resolve-Path -LiteralPath $Inventory).Path
$validatorPath = (Resolve-Path -LiteralPath $Validator).Path
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("material-designer-ui-drive-negative-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tempRoot | Out-Null

function Read-Inventory {
    return Get-Content -Raw -LiteralPath $inventoryPath | ConvertFrom-Json
}

function Write-Mutation($Data, [string]$Name) {
    $path = Join-Path $tempRoot "$Name.json"
    $Data | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath $path -Encoding UTF8
    return $path
}

function Expect-Red([string]$Name, [scriptblock]$Mutation) {
    $data = Read-Inventory
    & $Mutation $data
    $path = Write-Mutation $data $Name
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $validatorPath -Inventory $path *> $null
        $childExitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousPreference
    }
    if ($childExitCode -eq 0) { throw "Negative mutation '$Name' stayed green." }
    Write-Output "RED: $Name"
}

try {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $validatorPath -Inventory $inventoryPath
    if ($LASTEXITCODE -ne 0) { throw "Baseline inventory is not green." }

    Expect-Red "remove-whole-surface-row" { param($data) $data.surfaces = @($data.surfaces | Where-Object id -ne "documentation-site") }
    Expect-Red "remove-whole-feature-row" { param($data) $site = $data.surfaces | Where-Object id -eq "documentation-site"; $site.features = @($site.features | Where-Object id -ne "status-hub") }
    Expect-Red "remove-whole-destination-row" { param($data) $desktop = $data.surfaces | Where-Object id -eq "windows-desktop-application"; $desktop.destinations = @($desktop.destinations | Where-Object id -ne "home-default-light") }
    Expect-Red "remove-required-interaction-field" { param($data) $row = ($data.surfaces | Where-Object id -eq "windows-desktop-application").features | Where-Object id -eq "regex-builders"; $row.requiredInteractions[0].PSObject.Properties.Remove("expectedAfter") }
    Expect-Red "attach-evidence-to-unverified-row" { param($data) $row = ($data.surfaces | Where-Object id -eq "documentation-site").features | Where-Object id -eq "language-modes"; $row.evidenceReceipts = @("invented-receipt.json") }

    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $validatorPath -Inventory $inventoryPath
    if ($LASTEXITCODE -ne 0) { throw "Restored inventory did not return green." }
    Write-Output "PASS: five deliberate removals or false-evidence mutations turned red, then the untouched inventory returned green."
} finally {
    if (Test-Path -LiteralPath $tempRoot) { Remove-Item -LiteralPath $tempRoot -Recurse -Force }
    Set-Location $root
}

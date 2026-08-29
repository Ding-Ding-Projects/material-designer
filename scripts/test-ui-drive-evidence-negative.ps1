[CmdletBinding()]
param(
    [string]$Inventory = ".codex/verification/ui-drive/inventory.json",
    [string]$Registry = ".codex/verification/ui-drive/scene-registry.json",
    [string]$Ledger = ".codex/verification/ui-drive/ledger.json",
    [string]$Validator = "scripts/verify-ui-drive-evidence.ps1"
)

$ErrorActionPreference = "Stop"
$root = (Get-Location).Path
$inventoryPath = (Resolve-Path -LiteralPath $Inventory).Path
$registryPath = (Resolve-Path -LiteralPath $Registry).Path
$ledgerPath = (Resolve-Path -LiteralPath $Ledger).Path
$validatorPath = (Resolve-Path -LiteralPath $Validator).Path
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ("material-designer-ui-drive-negative-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tempRoot | Out-Null

function Read-Json([string]$path) { return Get-Content -Raw -LiteralPath $path | ConvertFrom-Json }
function Write-Json($data, [string]$name) {
    $path = Join-Path $tempRoot "$name.json"
    $data | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath $path -Encoding utf8
    return $path
}
function Run-Validator([string]$inventoryFile, [string]$registryFile, [string]$ledgerFile) {
    $previous = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $validatorPath -Inventory $inventoryFile -SceneRegistry $registryFile -Ledger $ledgerFile 1>$null 2>$null
        return $LASTEXITCODE
    } finally { $ErrorActionPreference = $previous }
}
function Expect-Red([string]$name, [scriptblock]$mutation, [ValidateSet('inventory','registry','ledger')][string]$kind = 'inventory') {
    $inventory = Read-Json $inventoryPath
    $registry = Read-Json $registryPath
    $ledger = Read-Json $ledgerPath
    & $mutation $inventory $registry $ledger
    $inventoryFile = Write-Json $inventory "$name-inventory"
    $registryFile = Write-Json $registry "$name-registry"
    $ledgerFile = Write-Json $ledger "$name-ledger"
    $exitCode = Run-Validator $inventoryFile $registryFile $ledgerFile
    if ($exitCode -eq 0) { throw "Negative mutation '$name' stayed green." }
    Write-Output "RED: $name"
}

try {
    if ((Run-Validator $inventoryPath $registryPath $ledgerPath) -ne 0) { throw "Baseline inventory, scene registry, or ledger is not green." }

    Expect-Red "remove-whole-surface-row" { param($i,$r,$l) $i.surfaces = @($i.surfaces | Where-Object id -ne "documentation-site") }
    Expect-Red "remove-whole-feature-row" { param($i,$r,$l) $site = $i.surfaces | Where-Object id -eq "documentation-site"; $site.features = @($site.features | Where-Object id -ne "status-hub") }
    Expect-Red "remove-whole-destination-row" { param($i,$r,$l) $desktop = $i.surfaces | Where-Object id -eq "windows-desktop-application"; $desktop.destinations = @($desktop.destinations | Where-Object id -ne "home-default-light") }
    Expect-Red "remove-required-interaction-field" { param($i,$r,$l) $row = ($i.surfaces | Where-Object id -eq "windows-desktop-application").features | Where-Object id -eq "regex-builders"; $row.requiredInteractions[0].PSObject.Properties.Remove("expectedAfter") }
    Expect-Red "remove-accessible-name" { param($i,$r,$l) $row = ($i.surfaces | Where-Object id -eq "documentation-site").features | Where-Object id -eq "language-modes"; $row.requiredInteractions[0].PSObject.Properties.Remove("accessibleName") }
    Expect-Red "detach-interaction-scene" { param($i,$r,$l) $row = ($i.surfaces | Where-Object id -eq "documentation-site").features | Where-Object id -eq "language-modes"; $row.requiredInteractions[0].sceneId = "scene-detached-identity" }
    Expect-Red "remove-whole-scene-row" { param($i,$r,$l) $r.scenes = @($r.scenes | Where-Object id -ne "scene-windows-desktop-application-destination-home-default-light") } registry
    Expect-Red "remove-scene-tuple-field" { param($i,$r,$l) $scene = $r.scenes | Where-Object id -eq "scene-windows-desktop-application-destination-home-default-light"; $scene.tuple.PSObject.Properties.Remove("route") } registry
    Expect-Red "invalid-scene-input-method" { param($i,$r,$l) $r.scenes[0].inputMethod = "detached" } registry
    Expect-Red "remove-network-isolation" { param($i,$r,$l) $r.scenes[0].tuple.networkIsolation.PSObject.Properties.Remove("blockedExternalRequests") } registry
    Expect-Red "attach-evidence-to-unverified-row" { param($i,$r,$l) $row = ($i.surfaces | Where-Object id -eq "documentation-site").features | Where-Object id -eq "language-modes"; $row.evidenceReceipts = @("invented-receipt.json") }
    Expect-Red "mark-feature-verified-with-ledger-gap" { param($i,$r,$l) $row = ($i.surfaces | Where-Object id -eq "documentation-site").features | Where-Object id -eq "language-modes"; $row.status = "verified" }
    Expect-Red "invalid-ledger-header" { param($i,$r,$l) $l.ledgerMode = "replaceable" } ledger
    $missingReceipt = Join-Path $tempRoot "missing-receipt.json"
    $previous = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $validatorPath -Inventory $inventoryPath -SceneRegistry $registryPath -Ledger $ledgerPath -Receipt $missingReceipt 1>$null 2>$null
        $missingExit = $LASTEXITCODE
    } finally { $ErrorActionPreference = $previous }
    if ($missingExit -eq 0) { throw "Negative mutation 'missing-receipt-path' stayed green." }
    Write-Output "RED: missing-receipt-path"

    if ((Run-Validator $inventoryPath $registryPath $ledgerPath) -ne 0) { throw "Restored inventory, scene registry, or ledger did not return green." }
    Write-Output "PASS: fourteen deliberate whole-row, exact-identity, tuple, isolation, evidence-gap, ledger, and receipt-boundary mutations turned red, then the untouched contract returned green."
} finally {
    if (Test-Path -LiteralPath $tempRoot) { Remove-Item -LiteralPath $tempRoot -Recurse -Force }
    Set-Location $root
}

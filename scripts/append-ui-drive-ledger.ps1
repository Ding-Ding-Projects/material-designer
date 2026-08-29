[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)] [string]$Receipt,
    [string]$Ledger = ".codex/verification/ui-drive/ledger.json",
    [string]$Inventory = ".codex/verification/ui-drive/inventory.json",
    [string]$SceneRegistry = ".codex/verification/ui-drive/scene-registry.json",
    [string]$EvidenceRoot = ".codex/verification/evidence"
)

$ErrorActionPreference = "Stop"
if (-not (Test-Path -LiteralPath $Ledger -PathType Leaf)) { throw 'Ledger does not exist.' }
if (-not (Test-Path -LiteralPath $EvidenceRoot -PathType Container)) { throw 'Evidence root does not exist.' }
$validator = Join-Path $PSScriptRoot 'validate-ui-drive-receipt.ps1'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $validator -Receipt $Receipt -Inventory $Inventory -SceneRegistry $SceneRegistry -EvidenceRoot $EvidenceRoot
if ($LASTEXITCODE -ne 0) { throw 'Receipt validation failed; ledger was not changed.' }
$ledgerData = Get-Content -Raw -LiteralPath $Ledger | ConvertFrom-Json
$receiptData = Get-Content -Raw -LiteralPath $Receipt | ConvertFrom-Json
$rows = @($ledgerData.rows)
if ($ledgerData.version -ne 1 -or $ledgerData.inventoryVersion -ne 1 -or $ledgerData.ledgerMode -ne 'append-only-one-receipt-per-interaction' -or $ledgerData.evidencePolicy -ne 'fail-closed-real-built-artifact-only' -or $ledgerData.approvedHeadlessRoute -ne 'cheap-lowlevel-headless') { throw 'Ledger header is invalid.' }
for ($n = 0; $n -lt $rows.Count; $n++) { if ([int]$rows[$n].sequence -ne ($n + 1)) { throw 'Ledger sequences must be contiguous and append-only.' } }
if (@($rows | Where-Object receiptId -eq $receiptData.receiptId).Count -gt 0) { throw 'Duplicate receipt identity refused.' }
if (@($rows | Where-Object { $_.surfaceId -eq $receiptData.surfaceId -and $_.featureId -eq $receiptData.featureId -and $_.interactionId -eq $receiptData.interactionId }).Count -gt 0) { throw 'Duplicate interaction identity refused.' }
if (@($rows | Where-Object sceneId -eq $receiptData.sceneId).Count -gt 0) { throw 'Duplicate scene identity refused.' }
if ($receiptData.sequence -ne ($rows.Count + 1)) { throw 'Receipt sequence is out of order.' }
if ($rows.Count -gt 0) {
    $first = $rows[0]
    if ($first.sourceCommit -ne $receiptData.sourceCommit -or $first.artifactSha256 -ne $receiptData.artifact.sha256 -or $first.artifactBuiltFromCommit -ne $receiptData.artifact.builtFromCommit) { throw 'Moving source or packaged-artifact identity refused.' }
}
$newRow = [ordered]@{
    receiptId = [string]$receiptData.receiptId
    sceneId = [string]$receiptData.sceneId
    surfaceId = [string]$receiptData.surfaceId
    featureId = [string]$receiptData.featureId
    interactionId = [string]$receiptData.interactionId
    sequence = [int]$receiptData.sequence
    sourceCommit = [string]$receiptData.sourceCommit
    artifactSha256 = [string]$receiptData.artifact.sha256
    artifactBuiltFromCommit = [string]$receiptData.artifact.builtFromCommit
    imagePath = [string]$receiptData.image.path
    imageSha256 = [string]$receiptData.image.sha256
}
$outRows = @($rows) + $newRow
$updated = [ordered]@{ version=1; inventoryVersion=1; ledgerMode='append-only-one-receipt-per-interaction'; evidencePolicy='fail-closed-real-built-artifact-only'; approvedHeadlessRoute='cheap-lowlevel-headless'; rows=$outRows }
$temp = Join-Path ([IO.Path]::GetDirectoryName((Resolve-Path -LiteralPath $Ledger).Path)) ('.ledger.' + [guid]::NewGuid().ToString('N') + '.tmp')
try { $updated | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $temp -Encoding utf8; Move-Item -LiteralPath $temp -Destination $Ledger -Force } finally { if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Force } }
Write-Output "PASS: appended receipt $($receiptData.receiptId) as immutable ledger sequence $($receiptData.sequence)."
